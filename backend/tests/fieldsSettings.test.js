// The seven custom-field "settings" controllers (company / contact / deal / task / meeting / item
// / vendor): can a client move a field configuration to another tenant, re-point its owner, forge
// who created a field, or smuggle in a Mongo operator / dotted path?
// Runs the REAL controllers against a throwaway in-memory MongoDB with two tenants.
// Usage: node --test tests/fieldsSettings.test.js
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

const User = require('../models/User');
const Subscription = require('../models/Subscription');
const PlanConfig = require('../models/PlanConfig');
const stripDollarKeys = require('../middlewares/stripDollarKeys');
const { sanitizeFieldsConfigBody } = require('../utils/safeBody');

// byUser: the "PUT /" handler that finds the caller's own config (and upserts).
// byId:   the "PUT /:id" handler. Company's single update handler is the by-id kind.
const KINDS = [
  { label: 'contact', hasCreator: true, Model: require('../models/ContactFields'), c: require('../controllers/contactFieldsController'), create: 'createContactFields', byUser: 'updateContactFields', byId: 'updateContactFieldsById' },
  { label: 'company', hasCreator: false, Model: require('../models/CompanyFields'), c: require('../controllers/companyFieldsController'), create: 'createCompanyFields', byUser: null, byId: 'updateCompanyFields' },
  { label: 'deal', hasCreator: false, Model: require('../models/DealFields'), c: require('../controllers/dealFieldsController'), create: 'createDealFields', byUser: 'updateDealFields', byId: 'updateDealFieldsById' },
  { label: 'task', hasCreator: true, Model: require('../models/TaskFields'), c: require('../controllers/taskFieldsController'), create: 'createTaskFields', byUser: 'updateTaskFields', byId: 'updateTaskFieldsById' },
  { label: 'meeting', hasCreator: true, Model: require('../models/MeetingFields'), c: require('../controllers/meetingFieldsController'), create: 'createMeetingFields', byUser: 'updateMeetingFields', byId: 'updateMeetingFieldsById' },
  { label: 'item', hasCreator: true, Model: require('../models/ItemFields'), c: require('../controllers/itemFieldsController'), create: 'createItemFields', byUser: 'updateItemFields', byId: 'updateItemFieldsById' },
  { label: 'vendor', hasCreator: false, Model: require('../models/VendorFields'), c: require('../controllers/vendorFieldsController'), create: 'createVendorFields', byUser: 'updateVendorFields', byId: 'updateVendorFieldsById' },
];

const oid = () => new mongoose.Types.ObjectId();
const str = (v) => String(v);
const makeRes = () => {
  const res = { statusCode: 200, body: undefined };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  return res;
};

let mongod;
const orgA = oid();
const orgB = oid();
const fx = {};
const asUser = (u) => ({ _id: u._id, id: str(u._id), role: 'admin', organization: u.organization, permissions: [] });

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const mk = (name, org) => new User({ name, email: `${name}@x.test`, organization: org, role: 'admin' }).save({ validateBeforeSave: false });
  fx.userA = await mk('userA', orgA);
  fx.userA2 = await mk('userA2', orgA);
  fx.userA3 = await mk('userA3', orgA);
  fx.userB = await mk('userB', orgB);
  await new PlanConfig({ planId: 'pro', features: { customFields: 100, modules: {} } }).save({ validateBeforeSave: false });
  for (const org of [orgA, orgB]) await new Subscription({ organization: org, planName: 'pro', appStatus: 'active' }).save({ validateBeforeSave: false });
});
test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  setTimeout(() => process.exit(process.exitCode || 0), 200).unref(); // controllers keep timers open
});

const call = async (fn, { body = {}, params = {}, user }) => {
  const res = makeRes();
  const req = { body: structuredClone(body), params, user: asUser(user), query: {} };
  await fn(req, res);
  return res;
};
const seed = (Model, { org, user, fields = [], extra = {} }) =>
  new Model({ organization: org, user: user._id, fieldCategories: [], fields, ...extra }).save({ validateBeforeSave: false });
const field = (name, createdBy, extra = {}) => ({ name, type: 'text', createdBy, ...extra });

// The Company / Deal / Vendor field schemas have no `createdBy` at all, so Mongoose drops it: a forged
// value can't be stored there. Where the model DOES record a creator, it must be the right person.
const expectCreator = (kind, storedField, expectedUserId, why) => {
  if (kind.hasCreator) assert.equal(str(storedField.createdBy), str(expectedUserId), why);
  else assert.equal(storedField.createdBy, undefined, `${kind.label}: no creator is stored, so nothing forged can be`);
};

// ───────────────────────────── the shared sanitizer ─────────────────────────────

test('sanitizer: strips tenant / owner / identity / audit keys, "$" operators and dotted paths; stamps createdBy', () => {
  const out = sanitizeFieldsConfigBody({
    organization: 'o', user: 'u', _id: 'i', createdAt: 'c', updatedAt: 'u', __v: 1,
    $set: { organization: 'o' }, 'fields.0.createdBy': 'x', fieldCategories: ['Keep'],
    fields: [{ name: 'a', type: 'text', createdBy: 'forged' }, null, 'junk'],
  }, 'ME');
  assert.deepEqual(Object.keys(out).sort(), ['fieldCategories', 'fields']);
  assert.deepEqual(out.fieldCategories, ['Keep']);
  assert.equal(out.fields[0].createdBy, 'ME');
  assert.equal(out.fields[0].name, 'a', 'legitimate field data is kept');
  assert.equal(out.fields[1], null, 'non-object entries are left for the controller to reject');
});

test('sanitizer: does not mutate its input and tolerates a missing body', () => {
  const input = { organization: 'o', fields: [{ name: 'a', type: 'text', createdBy: 'forged' }] };
  sanitizeFieldsConfigBody(input, 'ME');
  assert.equal(input.organization, 'o');
  assert.equal(input.fields[0].createdBy, 'forged');
  assert.equal(sanitizeFieldsConfigBody(undefined, 'ME'), undefined);
});

test('middleware + sanitizer together: a JSON body with $set / dotted keys cannot reach the update', () => {
  const req = { body: { $set: { organization: 'x' }, fields: [{ name: 'a', type: 'text', $where: '1' }] }, method: 'PUT', originalUrl: '/t' };
  stripDollarKeys(req, makeRes(), () => {});
  const out = sanitizeFieldsConfigBody(req.body, 'ME');
  assert.equal(out.$set, undefined);
  assert.equal(out.fields[0].$where, undefined);
});

// ───────────────────────────── each controller ─────────────────────────────

for (const k of KINDS) {
  const label = `${k.label} fields`;

  test(`${label}: create — a client cannot choose organization / owner / _id / createdBy`, async () => {
    await k.Model.deleteMany({});
    const chosenId = oid();
    const res = await call(k.c[k.create], {
      user: fx.userA,
      body: {
        fieldCategories: ['Sales'],
        fields: [field('Region', str(fx.userB._id))],
        organization: str(orgB), user: str(fx.userB._id), _id: str(chosenId), createdAt: '2000-01-01T00:00:00Z',
      },
    });
    assert.equal(res.statusCode, 201, JSON.stringify(res.body));
    const doc = await k.Model.findOne({});
    assert.equal(str(doc.organization), str(orgA));
    assert.equal(str(doc.user), str(fx.userA._id));
    expectCreator(k, doc.fields[0], fx.userA._id, 'createdBy is the caller, not the forged id');
    assert.notEqual(str(doc._id), str(chosenId));
    assert.equal(await k.Model.countDocuments({ organization: orgB }), 0, 'nothing written into the other tenant');
    assert.equal(doc.fields[0].name, 'Region', 'legitimate data is kept');
    assert.deepEqual([...doc.fieldCategories], ['Sales']);
  });

  test(`${label}: create — "$" operators and dotted paths in the body have no effect`, async () => {
    await k.Model.deleteMany({});
    const res = await call(k.c[k.create], {
      user: fx.userA,
      body: { fields: [field('F', str(fx.userA._id))], $set: { organization: str(orgB) }, 'fields.0.createdBy': str(fx.userB._id) },
    });
    assert.equal(res.statusCode, 201, JSON.stringify(res.body));
    const doc = await k.Model.findOne({});
    assert.equal(str(doc.organization), str(orgA));
    expectCreator(k, doc.fields[0], fx.userA._id);
  });

  test(`${label}: create — a field without createdBy is accepted (the caller becomes the creator)`, async () => {
    await k.Model.deleteMany({});
    const res = await call(k.c[k.create], { user: fx.userA, body: { fields: [{ name: 'Plain', type: 'text' }] } });
    assert.equal(res.statusCode, 201, JSON.stringify(res.body));
    expectCreator(k, (await k.Model.findOne({})).fields[0], fx.userA._id);
  });

  if (k.byUser) {
    test(`${label}: update (own config) — forged organization / user / createdBy / dotted path are ignored; existing fields keep their original creator`, async () => {
      await k.Model.deleteMany({});
      const f1 = oid();
      const doc = await seed(k.Model, { org: orgA, user: fx.userA, fields: [{ _id: f1, ...field('Old', fx.userA2._id) }] });
      const res = await call(k.c[k.byUser], {
        user: fx.userA,
        body: {
          fields: [
            { _id: str(f1), ...field('Old renamed', str(fx.userB._id)) },
            field('New', str(fx.userB._id)),
          ],
          organization: str(orgB), user: str(fx.userB._id), 'fields.0.createdBy': str(fx.userB._id),
        },
      });
      assert.equal(res.statusCode, 200, JSON.stringify(res.body));
      assert.equal(await k.Model.countDocuments({}), 1, 'no second / moved document appeared');
      const fresh = await k.Model.findById(doc._id);
      assert.equal(str(fresh.organization), str(orgA), 'still in its own tenant');
      assert.equal(str(fresh.user), str(fx.userA._id), 'owner not re-pointed');
      assert.equal(fresh.fields[0].name, 'Old renamed', 'a legitimate edit still applies');
      expectCreator(k, fresh.fields[0], fx.userA2._id, 'existing field keeps its real creator');
      assert.equal(fresh.fields[1].name, 'New');
      expectCreator(k, fresh.fields[1], fx.userA._id, 'new field is attributed to the caller');
      assert.equal(await k.Model.countDocuments({ organization: orgB }), 0);
    });

    test(`${label}: update (own config) — the first save (upsert) is attributed to the caller and the caller's tenant`, async () => {
      await k.Model.deleteMany({});
      const res = await call(k.c[k.byUser], {
        user: fx.userA3,
        body: { fields: [{ name: 'First', type: 'text' }], fieldCategories: ['X'], organization: str(orgB), user: str(fx.userB._id) },
      });
      assert.equal(res.statusCode, 200, JSON.stringify(res.body));
      const docs = await k.Model.find({});
      assert.equal(docs.length, 1);
      assert.equal(str(docs[0].organization), str(orgA));
      assert.equal(str(docs[0].user), str(fx.userA3._id));
      expectCreator(k, docs[0].fields[0], fx.userA3._id);
      assert.deepEqual([...docs[0].fieldCategories], ['X']);
    });

    test(`${label}: update (own config) — a "$set" cannot move the document to another tenant`, async () => {
      await k.Model.deleteMany({});
      const doc = await seed(k.Model, { org: orgA, user: fx.userA });
      const res = await call(k.c[k.byUser], { user: fx.userA, body: { $set: { organization: str(orgB) }, fieldCategories: ['Only this'] } });
      assert.equal(res.statusCode, 200, JSON.stringify(res.body));
      const fresh = await k.Model.findById(doc._id);
      assert.equal(str(fresh.organization), str(orgA));
      assert.deepEqual([...fresh.fieldCategories], ['Only this'], 'the legitimate part still applies');
    });
  }

  test(`${label}: update by id — Org A cannot modify Org B's configuration`, async () => {
    await k.Model.deleteMany({});
    const docB = await seed(k.Model, { org: orgB, user: fx.userB, fields: [field('B field', fx.userB._id)], extra: { fieldCategories: ['B cat'] } });
    const res = await call(k.c[k.byId], {
      user: fx.userA,
      params: { id: str(docB._id) },
      body: { fields: [field('pwned', str(fx.userA._id))], fieldCategories: ['pwned'], organization: str(orgA), user: str(fx.userA._id) },
    });
    assert.ok([404, 403, 400].includes(res.statusCode) || res.body === null, `expected a refusal, got ${res.statusCode}`);
    const fresh = await k.Model.findById(docB._id);
    assert.equal(fresh.fields[0].name, 'B field');
    assert.deepEqual([...fresh.fieldCategories], ['B cat']);
    assert.equal(str(fresh.organization), str(orgB), 'not moved');
    assert.equal(str(fresh.user), str(fx.userB._id));
  });

  test(`${label}: update by id — own config: forged organization / user / _id / createdBy are ignored; legitimate edits apply`, async () => {
    await k.Model.deleteMany({});
    const f1 = oid();
    const doc = await seed(k.Model, { org: orgA, user: fx.userA2, fields: [{ _id: f1, ...field('Old', fx.userA2._id) }] });
    const otherId = oid();
    const res = await call(k.c[k.byId], {
      user: fx.userA,
      params: { id: str(doc._id) },
      body: {
        fields: [{ _id: str(f1), ...field('Renamed', str(fx.userB._id)) }, field('Added', str(fx.userB._id))],
        fieldCategories: ['Cat'],
        organization: str(orgB), user: str(fx.userB._id), _id: str(otherId), 'fields.0.createdBy': str(fx.userB._id),
      },
    });
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(await k.Model.countDocuments({ _id: otherId }), 0);
    const fresh = await k.Model.findById(doc._id);
    assert.equal(str(fresh.organization), str(orgA), 'not moved');
    assert.equal(str(fresh.user), str(fx.userA2._id), 'original owner kept');
    assert.equal(fresh.fields[0].name, 'Renamed');
    expectCreator(k, fresh.fields[0], fx.userA2._id, 'existing field keeps its real creator');
    expectCreator(k, fresh.fields[1], fx.userA._id, 'new field is attributed to the caller');
    assert.deepEqual([...fresh.fieldCategories], ['Cat']);
    assert.equal(await k.Model.countDocuments({ organization: orgB }), 0);
  });

  test(`${label}: update by id — a "$set" cannot move the document to another tenant`, async () => {
    await k.Model.deleteMany({});
    const doc = await seed(k.Model, { org: orgA, user: fx.userA });
    const res = await call(k.c[k.byId], { user: fx.userA, params: { id: str(doc._id) }, body: { $set: { organization: str(orgB) }, fieldCategories: ['Only this'] } });
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    const fresh = await k.Model.findById(doc._id);
    assert.equal(str(fresh.organization), str(orgA));
    assert.deepEqual([...fresh.fieldCategories], ['Only this']);
  });

  test(`${label}: a malformed field is still rejected with a 400 and nothing is written`, async () => {
    await k.Model.deleteMany({});
    const res = await call(k.c[k.create], { user: fx.userA, body: { fields: [{ name: 'No type' }] } });
    assert.equal(res.statusCode, 400);
    assert.equal(await k.Model.countDocuments({}), 0);
  });
}
