// restrictByPlan's plan-features cache must follow the organization's CURRENT plan:
// an upgrade/downgrade takes effect on the very next request, not after the 5 min TTL.
// Runs against a throwaway in-memory MongoDB.
// Usage: node --test tests/restrictByPlanCache.test.js
process.env.AWS_REGION ||= 'us-east-1';
process.env.AWS_ACCESS_KEY_ID ||= 'x';
process.env.AWS_SECRET_ACCESS_KEY ||= 'x';
process.env.AWS_BUCKET_NAME ||= 'test-bucket';
process.env.CLOUDFRONT_DOMAIN ||= 'example.test';
process.env.RAZORPAY_KEY_ID ||= 'rzp_test_dummy';
process.env.RAZORPAY_KEY_SECRET ||= 'dummy';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Subscription = require('../models/Subscription');
const PlanConfig = require('../models/PlanConfig');
const restrictByPlan = require('../middlewares/restrictByPlan');

const oid = () => new mongoose.Types.ObjectId();
const save = (Model, doc) => new Model(doc).save({ validateBeforeSave: false });
const features = (write) => ({ modules: { contacts: { read: true, write, limit: 'unlimited' } } });

let mongod;
const orgA = oid();
const orgB = oid();

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  // restrictByPlan keeps a cleanup interval alive.
  setTimeout(() => process.exit(process.exitCode || 0), 200).unref();
});

test.beforeEach(async () => {
  restrictByPlan.clearPlanCache();
  await Promise.all([Subscription.deleteMany({}), PlanConfig.deleteMany({})]);
  await save(PlanConfig, { planId: 'basic', features: features(false) });
  await save(PlanConfig, { planId: 'pro', features: features(true) });
});

// Runs the real middleware; resolves to { status, code } (status 200 = next() was called).
const writeContacts = async (org) => {
  const out = { status: 200, code: undefined };
  const res = {
    status(c) { out.status = c; return res; },
    json(b) { out.code = b.code; return res; },
  };
  await restrictByPlan('contacts', 'write')({ user: { organization: org }, method: 'POST', body: {} }, res, () => {});
  return out;
};
const setPlan = (org, planName) =>
  Subscription.updateOne({ organization: org }, { planName });
const newSub = (org, planName) => save(Subscription, { organization: org, planName, appStatus: 'active' });

test('upgrade takes effect on the very next request (no waiting for the TTL)', async () => {
  await newSub(orgA, 'basic');
  assert.deepEqual(await writeContacts(orgA), { status: 403, code: 'WRITE_NOT_ALLOWED' });
  // The cache is now warm with Basic features. Upgrade the org.
  await setPlan(orgA, 'pro');
  assert.equal((await writeContacts(orgA)).status, 200, 'must now see Pro features');
});

test('downgrade takes effect on the very next request', async () => {
  await newSub(orgA, 'pro');
  assert.equal((await writeContacts(orgA)).status, 200);
  await setPlan(orgA, 'basic');
  assert.deepEqual(await writeContacts(orgA), { status: 403, code: 'WRITE_NOT_ALLOWED' });
});

test('two orgs on different plans never see each other\'s features', async () => {
  await newSub(orgA, 'basic');
  await newSub(orgB, 'pro');
  for (let i = 0; i < 2; i++) {
    assert.equal((await writeContacts(orgA)).status, 403);
    assert.equal((await writeContacts(orgB)).status, 200);
  }
});

test('orgs on the same plan share one cached entry (PlanConfig read once)', async () => {
  await newSub(orgA, 'pro');
  await newSub(orgB, 'pro');
  const original = PlanConfig.findOne;
  let reads = 0;
  PlanConfig.findOne = function (...args) { reads++; return original.apply(this, args); };
  try {
    await writeContacts(orgA);
    await writeContacts(orgB);
    await writeContacts(orgA);
    assert.equal(reads, 1);
  } finally {
    PlanConfig.findOne = original;
  }
});

test('editing a plan: stale until clearPlanCache(planId), then immediate (what the super-admin edit does)', async () => {
  await newSub(orgA, 'pro');
  assert.equal((await writeContacts(orgA)).status, 200);
  await PlanConfig.updateOne({ planId: 'pro' }, { features: features(false) });
  assert.equal((await writeContacts(orgA)).status, 200, 'still cached within the TTL');
  restrictByPlan.clearPlanCache('pro');
  assert.deepEqual(await writeContacts(orgA), { status: 403, code: 'WRITE_NOT_ALLOWED' });
});

test('clearPlanCache(planId) leaves other plans cached; clearPlanCache() drops all; clearOrgCache still safe', async () => {
  await newSub(orgA, 'basic');
  await newSub(orgB, 'pro');
  await writeContacts(orgA);
  await writeContacts(orgB);
  const original = PlanConfig.findOne;
  let reads = 0;
  PlanConfig.findOne = function (...args) { reads++; return original.apply(this, args); };
  try {
    restrictByPlan.clearPlanCache('basic');
    await writeContacts(orgA); // re-read
    await writeContacts(orgB); // still cached
    assert.equal(reads, 1);
    restrictByPlan.clearOrgCache(String(orgA)); // deprecated alias: clears everything, never throws
    await writeContacts(orgA);
    await writeContacts(orgB);
    assert.equal(reads, 3);
  } finally {
    PlanConfig.findOne = original;
  }
});

test('a missing plan config is still a 500, and a missing subscription still a 403', async () => {
  await newSub(orgA, 'ghost');
  assert.deepEqual(await writeContacts(orgA), { status: 500, code: 'PLAN_CONFIG_ERROR' });
  assert.deepEqual(await writeContacts(orgB), { status: 403, code: 'NO_SUBSCRIPTION' });
});
