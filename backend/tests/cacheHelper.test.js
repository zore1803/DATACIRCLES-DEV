// cacheGetOrSet behaviour, using a FAKE Redis client (never a real Redis) and, for
// the Dashboard case, a throwaway in-memory MongoDB.
// Usage: node --test tests/cacheHelper.test.js
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

// A Redis stand-in. `failing` makes every command reject, like an unreachable server.
function makeFakeRedis({ failing = false } = {}) {
  const store = new Map();
  const r = {
    failing,
    gets: 0,
    sets: [],
    async get(key) {
      r.gets++;
      if (r.failing) throw new Error('redis down');
      return store.get(key) ?? null;
    },
    async setEx(key, ttl, value) {
      if (r.failing) throw new Error('redis down');
      r.sets.push({ key, ttl, value });
      store.set(key, value);
    },
    store,
  };
  return r;
}

// Make the real controllers' `require("./redisClient")` resolve to a fake, so no
// connection to a real Redis is ever opened.
const fakeForControllers = makeFakeRedis();
require.cache[require.resolve('../redisClient')] = {
  id: require.resolve('../redisClient'),
  filename: require.resolve('../redisClient'),
  loaded: true,
  exports: fakeForControllers,
};

const { createCacheGetOrSet } = require('../cacheHelper');
const { isCompleteReport } = require('../controllers/insightsController');
const { getStats } = require('../controllers/dashboardController');
const User = require('../models/User');

const withClient = (client) => createCacheGetOrSet(() => client);
const quiet = async (fn) => {
  const { log, error } = console;
  console.log = console.error = () => {};
  try { return await fn(); } finally { console.log = log; console.error = error; }
};

// ───────────────────────────── helper ─────────────────────────────

test('hit: returns the cached value and does not call fetchFn', async () => {
  const redis = makeFakeRedis();
  redis.store.set('k', JSON.stringify({ a: 1 }));
  let calls = 0;
  const out = await quiet(() => withClient(redis)('k', 60, async () => (calls++, { a: 2 })));
  assert.deepEqual(out, { a: 1 });
  assert.equal(calls, 0);
  assert.equal(redis.sets.length, 0);
});

test('miss: fetchFn runs exactly once and the result is stored with the TTL', async () => {
  const redis = makeFakeRedis();
  let calls = 0;
  const out = await withClient(redis)('k', 60, async () => (calls++, { a: 1 }));
  assert.deepEqual(out, { a: 1 });
  assert.equal(calls, 1);
  assert.equal(redis.sets.length, 1);
  assert.deepEqual(redis.sets[0], { key: 'k', ttl: 60, value: JSON.stringify({ a: 1 }) });
});

test('miss then hit: the second call is served from the cache', async () => {
  const redis = makeFakeRedis();
  const cache = withClient(redis);
  let calls = 0;
  const fetchFn = async () => (calls++, { n: calls });
  const first = await cache('k', 60, fetchFn);
  const second = await quiet(() => cache('k', 60, fetchFn));
  assert.deepEqual(first, second);
  assert.equal(calls, 1);
});

test('Redis down: fetchFn runs exactly once and the fresh result is returned', async () => {
  const redis = makeFakeRedis({ failing: true });
  let calls = 0;
  const out = await quiet(() => withClient(redis)('k', 60, async () => (calls++, { a: 1 })));
  assert.deepEqual(out, { a: 1 });
  assert.equal(calls, 1, 'must not run again just because Redis failed');
});

test('Redis write fails only: result still returned, fetchFn once', async () => {
  const redis = makeFakeRedis();
  redis.setEx = async () => { throw new Error('write failed'); };
  let calls = 0;
  const out = await quiet(() => withClient(redis)('k', 60, async () => (calls++, { a: 1 })));
  assert.deepEqual(out, { a: 1 });
  assert.equal(calls, 1);
});

test('a corrupt cached value is treated as a miss, not an error', async () => {
  const redis = makeFakeRedis();
  redis.store.set('k', '{not json');
  let calls = 0;
  const out = await quiet(() => withClient(redis)('k', 60, async () => (calls++, { ok: true })));
  assert.deepEqual(out, { ok: true });
  assert.equal(calls, 1);
});

test('fetchFn throws: the ORIGINAL error propagates', async () => {
  const redis = makeFakeRedis();
  const boom = new Error('mongo exploded');
  await assert.rejects(withClient(redis)('k', 60, async () => { throw boom; }), (e) => e === boom);
  assert.equal(redis.sets.length, 0, 'an error is never cached');
});

test('fetchFn throws: it is NOT called a second time (Redis healthy or down)', async () => {
  for (const failing of [false, true]) {
    const redis = makeFakeRedis({ failing });
    let calls = 0;
    await quiet(() =>
      assert.rejects(withClient(redis)('k', 60, async () => { calls++; throw new Error('db down'); }), /db down/)
    );
    assert.equal(calls, 1, `failing=${failing}`);
  }
});

test('null / undefined results are returned but not cached by default', async () => {
  for (const value of [null, undefined]) {
    const redis = makeFakeRedis();
    const out = await withClient(redis)('k', 60, async () => value);
    assert.equal(out, value);
    assert.equal(redis.sets.length, 0);
  }
});

test('falsy-but-real results (0, false, empty object/array) ARE cached', async () => {
  for (const value of [0, false, {}, []]) {
    const redis = makeFakeRedis();
    await withClient(redis)('k', 60, async () => value);
    assert.equal(redis.sets.length, 1, JSON.stringify(value));
  }
});

// ───────────────────────────── Insights ─────────────────────────────

const completeReport = () => ({
  summary: { totalDeals: 1 }, overviewStats: {}, dailyTrends: { series: [] }, activity: [],
  deals: {}, purchaseOrders: {}, purchases: {}, invoices: {}, vendors: {}, companies: {}, contacts: {},
  pipeline: [], revenueByMonth: [], topCustomers: [], topVendors: [],
});

test('isCompleteReport: complete is true; any null/undefined section or non-object is false', () => {
  assert.equal(isCompleteReport(completeReport()), true);
  assert.equal(isCompleteReport({ ...completeReport(), contacts: null }), false);
  assert.equal(isCompleteReport({ ...completeReport(), activity: undefined }), false);
  assert.equal(isCompleteReport(null), false);
  assert.equal(isCompleteReport('x'), false);
});

test('Insights: a report with a failed (null) section is returned but NOT cached', async () => {
  const redis = makeFakeRedis();
  const cache = withClient(redis);
  let calls = 0;
  const degraded = async () => (calls++, { ...completeReport(), contacts: null });
  const first = await cache('insights:report:x', 60, degraded, { shouldCache: isCompleteReport });
  assert.equal(first.contacts, null, 'the caller still gets the degraded report');
  assert.equal(redis.sets.length, 0);
  await cache('insights:report:x', 60, degraded, { shouldCache: isCompleteReport });
  assert.equal(calls, 2, 'next request recomputes instead of reusing the degraded report');
});

test('Insights: a complete report is cached normally and then served from cache', async () => {
  const redis = makeFakeRedis();
  const cache = withClient(redis);
  let calls = 0;
  const good = async () => (calls++, completeReport());
  await cache('insights:report:x', 60, good, { shouldCache: isCompleteReport });
  assert.equal(redis.sets.length, 1);
  assert.equal(redis.sets[0].ttl, 60);
  const again = await quiet(() => cache('insights:report:x', 60, good, { shouldCache: isCompleteReport }));
  assert.deepEqual(again, completeReport());
  assert.equal(calls, 1);
});

// ───────────────────────────── Dashboard ─────────────────────────────

let mongod;
test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  // The controllers load app modules that keep timers/sockets open.
  setTimeout(() => process.exit(process.exitCode || 0), 200).unref();
});

test('Dashboard: the real getStats caches its result under a tenant+user scoped key and serves repeats from cache', async () => {
  const orgA = new mongoose.Types.ObjectId();
  const orgB = new mongoose.Types.ObjectId();
  const mk = (org, email) =>
    new User({ name: email, email, organization: org, role: 'admin' }).save({ validateBeforeSave: false });
  const userA = await mk(orgA, 'da@a.test');
  const userB = await mk(orgB, 'db@b.test');

  const call = async (user) => {
    const res = { statusCode: 200, body: undefined };
    res.status = (c) => ((res.statusCode = c), res);
    res.json = (b) => ((res.body = b), res);
    await getStats({ user: { _id: user._id, role: 'admin', organization: user.organization, permissions: [] }, query: {} }, res);
    return res;
  };

  fakeForControllers.sets.length = 0;
  const first = await call(userA);
  assert.equal(first.statusCode, 200, JSON.stringify(first.body));
  assert.equal(fakeForControllers.sets.length, 1, 'result stored once');
  const { key, ttl } = fakeForControllers.sets[0];
  assert.equal(ttl, 60);
  assert.match(key, new RegExp(`^dashboard:stats:${orgA}:${userA._id}:admin:`));

  const second = await quiet(() => call(userA));
  assert.deepEqual(second.body, first.body);
  assert.equal(fakeForControllers.sets.length, 1, 'repeat is a cache hit, nothing re-stored');

  // A different tenant/user never reads A's entry.
  await call(userB);
  assert.equal(fakeForControllers.sets.length, 2);
  assert.notEqual(fakeForControllers.sets[1].key, key);
  assert.ok(fakeForControllers.sets[1].key.includes(String(orgB)));
});
