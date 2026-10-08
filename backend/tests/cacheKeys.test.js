// Cache-key versioning and isolation (utils/cacheKeys.js), with a FAKE Redis (never a real
// one) and the real Dashboard / Insights / Global-search controllers on an in-memory MongoDB.
// Usage: node --test tests/cacheKeys.test.js
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

const store = new Map();
const fakeRedis = {
  sets: [],
  async get(k) { return store.get(k) ?? null; },
  async setEx(k, ttl, v) { fakeRedis.sets.push({ k, ttl }); store.set(k, v); },
};
require.cache[require.resolve('../redisClient')] = {
  id: require.resolve('../redisClient'), filename: require.resolve('../redisClient'), loaded: true, exports: fakeRedis,
};

const { VERSIONS, FAMILIES, dashboardStatsKey, insightsReportKey, globalSearchKey } = require('../utils/cacheKeys');
const { getStats } = require('../controllers/dashboardController');
const { getReport } = require('../controllers/insightsController');
const { globalSearch } = require('../controllers/globalSearchController');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const PlanConfig = require('../models/PlanConfig');

const oid = () => new mongoose.Types.ObjectId();
const save = (M, d) => new M(d).save({ validateBeforeSave: false });
const quiet = async (fn) => {
  const { log, error } = console;
  console.log = console.error = () => {};
  try { return await fn(); } finally { console.log = log; console.error = error; }
};

// ───────────────────────────── key builders ─────────────────────────────

const B = { thisMonthStart: new Date('2026-10-01T00:00:00Z'), nextMonthStart: new Date('2026-11-01T00:00:00Z'), lastMonthStart: new Date('2026-09-01T00:00:00Z') };
const NOFILTERS = { contactStatus: null, dealStage: null, purchaseStatus: null, poStatus: null };
const ORG = '65f000000000000000000001';
const USER = '65f0000000000000000000aa';

test('every key is <family>:<version>:<organization>:... for the CURRENT version', () => {
  const keys = {
    dashboardStats: dashboardStatsKey({ org: ORG, userId: USER, role: 'admin', ...B }),
    insightsReport: insightsReportKey({ org: ORG, userId: USER, role: 'admin', range: null, tz: 'UTC', statusFilters: NOFILTERS }),
    globalSearch: globalSearchKey({ org: ORG, search: 'acme' }),
  };
  for (const [family, key] of Object.entries(keys)) {
    assert.ok(key.startsWith(`${FAMILIES[family]}:${VERSIONS[family]}:${ORG}:`), `${family}: ${key}`);
  }
  assert.deepEqual(VERSIONS, { dashboardStats: 'v1', insightsReport: 'v1', globalSearch: 'v3' });
});

test('a different version can never produce the same key (so bumping a version retires old entries)', () => {
  const current = dashboardStatsKey({ org: ORG, userId: USER, role: 'admin', ...B });
  const older = current.replace(`:${VERSIONS.dashboardStats}:`, ':v0:');
  assert.notEqual(current, older);
  assert.ok(!current.startsWith('dashboard:stats:v0:'));
});

test('org / user / role each change the key', () => {
  const base = { org: ORG, userId: USER, role: 'admin', ...B };
  const k = dashboardStatsKey(base);
  assert.notEqual(k, dashboardStatsKey({ ...base, org: '65f000000000000000000002' }));
  assert.notEqual(k, dashboardStatsKey({ ...base, userId: '65f0000000000000000000bb' }));
  assert.notEqual(k, dashboardStatsKey({ ...base, role: 'staff' }));
});

test('free-text parts are encoded: ":" cannot shift between parts (search and insights filters)', () => {
  assert.notEqual(
    globalSearchKey({ org: ORG, search: 'Acme', lifecycleStage: 'Lead:New' }),
    globalSearchKey({ org: ORG, search: 'Acme:Lead', lifecycleStage: 'New' })
  );
  const f = (o) => insightsReportKey({ org: ORG, userId: USER, role: 'admin', range: null, tz: 'UTC', statusFilters: { ...NOFILTERS, ...o } });
  assert.notEqual(f({ contactStatus: 'a:b', dealStage: 'c' }), f({ contactStatus: 'a', dealStage: 'b:c' }));
});

test('the organization segment is fixed and first: a search string cannot impersonate another org\'s key', () => {
  const other = '65f000000000000000000002';
  const victim = globalSearchKey({ org: other, search: 'acme' });
  const attacker = globalSearchKey({ org: ORG, search: `${other}:acme` });
  assert.notEqual(attacker, victim);
  assert.ok(attacker.startsWith(`global-search:v3:${ORG}:`));
});

test('the legacy, unversioned key formats are never equal to a current key', () => {
  const legacyDash = ['dashboard:stats', ORG, USER, 'admin', B.thisMonthStart.toISOString(), B.nextMonthStart.toISOString(), B.lastMonthStart.toISOString()].join(':');
  assert.notEqual(legacyDash, dashboardStatsKey({ org: ORG, userId: USER, role: 'admin', ...B }));
  const legacyIns = ['insights:report', ORG, USER, 'admin', 'all', 'all', 'UTC', 'all', 'all', 'all', 'all'].join(':');
  assert.notEqual(legacyIns, insightsReportKey({ org: ORG, userId: USER, role: 'admin', range: null, tz: 'UTC', statusFilters: NOFILTERS }));
  assert.notEqual(`globalSearch:v3:${ORG}:acme::`, globalSearchKey({ org: ORG, search: 'acme' }));
});

// ───────────────── controllers only ever read / write the current version ─────────────────

let mongod;
const orgA = oid();
const orgB = oid();
const fx = {};
const RES = ['companies', 'contacts', 'deals', 'vendors', 'invoices', 'purchases', 'purchaseorders', 'purchase-orders', 'tasks', 'meetings'];
const identity = (u) => ({ _id: u._id, role: 'admin', organization: u.organization, permissions: RES.map((name) => ({ name, permission: 'read-write' })) });

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const mod = { read: true, write: true, limit: 'unlimited' };
  await save(PlanConfig, { planId: 'pro', features: { modules: Object.fromEntries(RES.map((m) => [m, mod])) } });
  for (const org of [orgA, orgB]) await save(Subscription, { organization: org, planName: 'pro', appStatus: 'active' });
  fx.a = await save(User, { name: 'A', email: 'a@a.test', organization: orgA, role: 'admin' });
  fx.b = await save(User, { name: 'B', email: 'b@b.test', organization: orgB, role: 'admin' });
});
test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  setTimeout(() => process.exit(process.exitCode || 0), 200).unref();
});

const call = async (run, user, query = {}) => {
  const res = { statusCode: 200, body: undefined };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  await quiet(() => run({ user, query, params: {}, body: {} }, res));
  return res;
};
const POISON = JSON.stringify({ poisoned: 'served from a stale-version key' });
const reset = () => { store.clear(); fakeRedis.sets.length = 0; };

test('Dashboard: a poisoned entry under the OLD key format is never served; MISS -> SET -> HIT on the current key', async () => {
  reset();
  const q = { thisMonthStart: B.thisMonthStart.toISOString(), nextMonthStart: B.nextMonthStart.toISOString(), lastMonthStart: B.lastMonthStart.toISOString() };
  const legacy = ['dashboard:stats', String(orgA), String(fx.a._id), 'admin', q.thisMonthStart, q.nextMonthStart, q.lastMonthStart].join(':');
  store.set(legacy, POISON);
  store.set(legacy.replace('dashboard:stats:', 'dashboard:stats:v0:'), POISON);

  const first = await call(getStats, identity(fx.a), q);
  assert.equal(first.statusCode, 200, JSON.stringify(first.body));
  assert.equal(first.body.poisoned, undefined, 'old-format entry must not be returned');
  assert.equal(fakeRedis.sets.length, 1, 'MISS -> SET');
  const expected = dashboardStatsKey({ org: orgA, userId: fx.a._id, role: 'admin', thisMonthStart: B.thisMonthStart, nextMonthStart: B.nextMonthStart, lastMonthStart: B.lastMonthStart });
  assert.equal(fakeRedis.sets[0].k, expected);
  assert.equal(fakeRedis.sets[0].ttl, 60);

  const second = await call(getStats, identity(fx.a), q);
  assert.deepEqual(second.body, first.body, 'HIT returns the stored value');
  assert.equal(fakeRedis.sets.length, 1, 'a hit stores nothing new');
});

test('Insights: a poisoned entry under the OLD key format is never served; MISS -> SET -> HIT on the current key', async () => {
  reset();
  const legacy = ['insights:report', String(orgA), String(fx.a._id), 'admin', 'all', 'all', 'UTC', 'all', 'all', 'all', 'all'].join(':');
  store.set(legacy, POISON);

  const first = await call(getReport, identity(fx.a), { tz: 'UTC' });
  assert.equal(first.statusCode, 200, JSON.stringify(first.body));
  assert.equal(first.body.poisoned, undefined, 'old-format entry must not be returned');
  assert.equal(fakeRedis.sets.length, 1, 'MISS -> SET (report is complete)');
  assert.ok(fakeRedis.sets[0].k.startsWith(`insights:report:v1:${orgA}:${fx.a._id}:admin:`), fakeRedis.sets[0].k);

  const second = await call(getReport, identity(fx.a), { tz: 'UTC' });
  assert.deepEqual(second.body, first.body);
  assert.equal(fakeRedis.sets.length, 1);
});

test('Global search: poisoned entries under the OLD prefixes (globalSearch:v2 / globalSearch:v3) are never served', async () => {
  reset();
  for (const v of ['v2', 'v3']) store.set(`globalSearch:${v}:${orgA}:zz::`, POISON);

  const first = await call(globalSearch, identity(fx.a), { search: 'zz' });
  assert.equal(first.statusCode, 200, JSON.stringify(first.body));
  assert.equal(first.body.poisoned, undefined);
  assert.equal(fakeRedis.sets.length, 1);
  assert.equal(fakeRedis.sets[0].k, globalSearchKey({ org: orgA, search: 'zz' }));
  assert.ok(fakeRedis.sets[0].k.startsWith(`global-search:v3:${orgA}:`));

  const second = await call(globalSearch, identity(fx.a), { search: 'zz' });
  assert.deepEqual(second.body, first.body);
  assert.equal(fakeRedis.sets.length, 1);
});

test('tenant isolation survives versioning: every key written for a tenant starts with its own org id', async () => {
  reset();
  await call(getStats, identity(fx.a));
  await call(getStats, identity(fx.b));
  await call(getReport, identity(fx.a), { tz: 'UTC' });
  await call(getReport, identity(fx.b), { tz: 'UTC' });
  await call(globalSearch, identity(fx.a), { search: 'q' });
  await call(globalSearch, identity(fx.b), { search: 'q' });
  const keys = fakeRedis.sets.map((s) => s.k);
  assert.equal(keys.length, 6);
  assert.equal(new Set(keys).size, 6, 'six different keys: nothing shared between tenants');
  for (const k of keys) {
    const owner = k.includes(String(orgA)) ? orgA : orgB;
    assert.ok(!k.includes(String(owner === orgA ? orgB : orgA)), `key mentions only one org: ${k}`);
    assert.match(k, new RegExp(`^(dashboard:stats:v1|insights:report:v1|global-search:v3):${owner}:`));
  }
});
