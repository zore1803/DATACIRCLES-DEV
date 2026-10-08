// Subscription / plan AUTHORIZATION must always reflect the database right now. Nothing that
// decides access (status, plan name, add-ons, create limits) may be served from a cache.
// Runs the real middlewares against a throwaway in-memory MongoDB.
// Usage: node --test tests/subscriptionAuthLive.test.js
process.env.AWS_REGION ||= 'us-east-1';
process.env.AWS_ACCESS_KEY_ID ||= 'x';
process.env.AWS_SECRET_ACCESS_KEY ||= 'x';
process.env.AWS_BUCKET_NAME ||= 'test-bucket';
process.env.CLOUDFRONT_DOMAIN ||= 'example.test';
process.env.RAZORPAY_KEY_ID ||= 'rzp_test_dummy';
process.env.RAZORPAY_KEY_SECRET ||= 'dummy';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Subscription = require('../models/Subscription');
const PlanConfig = require('../models/PlanConfig');
const PlanAddon = require('../models/PlanAddon');
const Contact = require('../models/Contact');
const subscriptionGate = require('../middlewares/subscriptionGate');
const restrictByPlan = require('../middlewares/restrictByPlan');
const { FAMILIES } = require('../utils/cacheKeys');

const oid = () => new mongoose.Types.ObjectId();
const save = (M, d) => new M(d).save({ validateBeforeSave: false });
const mod = (write, limit = 'unlimited') => ({ modules: { contacts: { read: true, write, limit } } });

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
  setTimeout(() => process.exit(process.exitCode || 0), 200).unref(); // restrictByPlan's cleanup interval
});
test.beforeEach(async () => {
  restrictByPlan.clearPlanCache();
  await Promise.all([Subscription, PlanConfig, PlanAddon, Contact].map((M) => M.deleteMany({})));
});

const newSub = (org, extra = {}) => save(Subscription, { organization: org, planName: 'basic', appStatus: 'active', ...extra });
const setSub = (org, patch) => Subscription.updateOne({ organization: org }, patch);

// Runs a middleware; resolves { passed, status, code }.
const run = async (mw, org, method = 'POST') => {
  const out = { passed: false, status: 200, code: undefined };
  const res = { status(c) { out.status = c; return res; }, json(b) { out.code = b.code; return res; } };
  await mw({ user: { organization: org }, method, body: {}, headers: {} }, res, () => { out.passed = true; });
  return out;
};

// ───────────────────── subscription status: read from MongoDB on every request ─────────────────────

test('status: suspending / cancelling / reactivating takes effect on the very next request', async () => {
  await newSub(orgA);
  // Warm the plan-features cache first, to show it has no say in the status decision.
  await save(PlanConfig, { planId: 'basic', features: mod(true) });
  await run(restrictByPlan('contacts', 'write'), orgA);

  assert.equal((await run(subscriptionGate, orgA)).passed, true, 'active: write allowed');
  await setSub(orgA, { appStatus: 'suspended' });
  const blocked = await run(subscriptionGate, orgA);
  assert.deepEqual([blocked.passed, blocked.status, blocked.code], [false, 402, 'SUBSCRIPTION_READ_ONLY']);
  assert.equal((await run(subscriptionGate, orgA, 'GET')).passed, true, 'suspended: reads still allowed');
  await setSub(orgA, { appStatus: 'active' });
  assert.equal((await run(subscriptionGate, orgA)).passed, true, 'reactivated: writes allowed again at once');
  await setSub(orgA, { appStatus: 'cancelled' });
  assert.equal((await run(subscriptionGate, orgA)).status, 402);
  await setSub(orgA, { appStatus: 'expired' });
  assert.equal((await run(subscriptionGate, orgA)).status, 402);
});

test('status: trial / active / past_due have full access; missing subscription is read-only', async () => {
  for (const appStatus of ['trial', 'active', 'past_due']) {
    await Subscription.deleteMany({});
    await newSub(orgA, { appStatus });
    assert.equal((await run(subscriptionGate, orgA)).passed, true, appStatus);
  }
  const none = await run(subscriptionGate, orgB);
  assert.deepEqual([none.passed, none.status], [false, 402], 'no subscription: writes blocked');
  assert.equal((await run(subscriptionGate, orgB, 'GET')).passed, true, 'no subscription: reads allowed');
});

test('status: one organization\'s suspension never affects another', async () => {
  await newSub(orgA, { appStatus: 'suspended' });
  await newSub(orgB, { appStatus: 'active' });
  assert.equal((await run(subscriptionGate, orgA)).status, 402);
  assert.equal((await run(subscriptionGate, orgB)).passed, true);
});

// ───────────────────── add-ons: read from the subscription on every request ─────────────────────

test('add-ons: a module_unlock add-on grants / revokes access on the very next request', async () => {
  await save(PlanConfig, { planId: 'basic', features: mod(false) });
  await save(PlanAddon, { key: 'contacts_unlock', effectType: 'module_unlock', targetKey: 'contacts', unlockRead: true, unlockWrite: true, pricingType: 'boolean', displayName: 'x', isActive: true });
  await newSub(orgA);
  const write = () => run(restrictByPlan('contacts', 'write'), orgA);

  assert.deepEqual([(await write()).passed, (await write()).code], [false, 'WRITE_NOT_ALLOWED']);
  await setSub(orgA, { activeAddons: [{ addonKey: 'contacts_unlock', quantity: 1, pricePerUnit: 1 }] });
  assert.equal((await write()).passed, true, 'granted immediately');
  await setSub(orgA, { activeAddons: [] });
  assert.equal((await write()).code, 'WRITE_NOT_ALLOWED', 'revoked immediately');
});

test('add-ons: a limit_boost add-on raises the create limit on the very next request', async () => {
  await save(PlanConfig, { planId: 'basic', features: mod(true, 1) });
  await save(PlanAddon, { key: 'extra_contacts', effectType: 'limit_boost', targetKey: 'contacts', pricingType: 'quantity', incrementPerUnit: 2, displayName: 'x', isActive: true });
  await newSub(orgA);
  await save(Contact, { name: 'one', organization: orgA });
  const write = () => run(restrictByPlan('contacts', 'write'), orgA);

  assert.equal((await write()).code, 'MODULE_LIMIT_REACHED', 'limit 1, already have 1');
  await setSub(orgA, { activeAddons: [{ addonKey: 'extra_contacts', quantity: 1, pricePerUnit: 1 }] });
  assert.equal((await write()).passed, true, 'limit is now 1 + 2');
});

// ───────────────────── create limits: counted from MongoDB on every request ─────────────────────

test('create limit: the live document count decides every request (nothing is cached)', async () => {
  await save(PlanConfig, { planId: 'basic', features: mod(true, 2) });
  await newSub(orgA);
  await newSub(orgB);
  const write = (org = orgA) => run(restrictByPlan('contacts', 'write'), org);

  assert.equal((await write()).passed, true, '0 of 2');
  const c1 = await save(Contact, { name: 'a', organization: orgA });
  await save(Contact, { name: 'b', organization: orgA });
  assert.equal((await write()).code, 'MODULE_LIMIT_REACHED', '2 of 2 -> blocked on the very next request');
  await Contact.deleteOne({ _id: c1._id });
  assert.equal((await write()).passed, true, 'one deleted -> allowed on the very next request');
  assert.equal((await write(orgB)).passed, true, 'another org\'s records never count toward this org\'s limit');
});

// ───────────────────── guard: Redis stays out of authorization ─────────────────────

test('guard: no authorization middleware touches Redis or the response cache helper', () => {
  const files = ['subscriptionGate.js', 'restrictByPlan.js', 'subscriptionCheck.js', 'customFieldRestriction.js', 'checkPermission.js', 'auth.js', 'userSync.js'];
  for (const f of files) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'middlewares', f), 'utf8');
    assert.ok(!/redisClient|cacheHelper|cacheGetOrSet|require\(['"]redis['"]\)/.test(src), `${f} must not use Redis`);
  }
});

test('guard: no cache key family holds subscription / plan / billing data', () => {
  for (const prefix of Object.values(FAMILIES)) {
    assert.ok(!/subscri|plan|billing|addon|entitle/i.test(prefix), `${prefix} looks like authorization data`);
  }
});
