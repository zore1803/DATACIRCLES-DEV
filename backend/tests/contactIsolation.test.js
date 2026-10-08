// Runs the real contact controller/service against a throwaway in-memory
// MongoDB with two tenants (Org A and Org B).
// Usage: node --test tests/contactIsolation.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Contact = require('../models/Contact');
const Company = require('../models/Company');
const User = require('../models/User');
const contactService = require('../services/contactService');
const { createContact, updateContact } = require('../controllers/contactController');

const oid = () => new mongoose.Types.ObjectId();
const save = (Model, doc) => new Model(doc).save({ validateBeforeSave: false });
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
const adminA = () => ({ _id: fx.userA._id, role: 'admin', organization: orgA, permissions: [] });

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  fx.userA = await save(User, { name: 'A admin', email: 'a@a.test', organization: orgA, role: 'admin' });
  fx.userA2 = await save(User, { name: 'A staff', email: 'a2@a.test', organization: orgA, role: 'staff' });
  fx.userB = await save(User, { name: 'B admin', email: 'b@b.test', organization: orgB, role: 'admin' });
  fx.coA = await save(Company, { name: 'Company A', organization: orgA });
  fx.coB = await save(Company, { name: 'Company B', organization: orgB });
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  // Requiring routes/contactRoutes.js (for the bulk-import handler) loads app
  // modules that keep timers/sockets open; don't let them hang the runner.
  setTimeout(() => process.exit(process.exitCode || 0), 200).unref();
});

const postContact = async (body, user = adminA()) => {
  const res = makeRes();
  await createContact({ body, user }, res);
  return res;
};
const putContact = async (id, body, user = adminA()) => {
  const res = makeRes();
  await updateContact({ params: { id: String(id) }, body, user }, res);
  return res;
};
const newContact = (org, extra = {}) =>
  save(Contact, { name: 'Con', organization: org, createdBy: fx.userA._id, ...extra });

// ───────────────────────────── create ─────────────────────────────

test('createContact: a normal contact succeeds; organization/createdBy/user come from the server', async () => {
  const res = await postContact({ name: 'Plain', email: 'p@x.test' });
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  const saved = await Contact.findById(res.body._id);
  assert.equal(String(saved.organization), String(orgA));
  assert.equal(String(saved.createdBy), String(fx.userA._id));
  assert.equal(String(saved.user), String(fx.userA._id));
});

test('createContact: same-org company and user succeed', async () => {
  const res = await postContact({ name: 'Refs', company: String(fx.coA._id), user: String(fx.userA2._id) });
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  const saved = await Contact.findById(res.body._id);
  assert.equal(String(saved.company), String(fx.coA._id));
  assert.equal(String(saved.user), String(fx.userA2._id));
});

test('createContact: client-supplied organization / createdBy / _id / starredBy are ignored', async () => {
  const chosenId = oid();
  const res = await postContact({
    name: 'Spoof',
    organization: String(orgB),
    createdBy: String(fx.userB._id),
    _id: String(chosenId),
    starredBy: [String(fx.userB._id)],
  });
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  const saved = await Contact.findById(res.body._id);
  assert.equal(String(saved.organization), String(orgA));
  assert.equal(String(saved.createdBy), String(fx.userA._id));
  assert.equal(String(saved.user), String(fx.userA._id), 'a client _id must not become the owner');
  assert.notEqual(String(saved._id), String(chosenId));
  assert.equal(await Contact.countDocuments({ _id: chosenId }), 0);
  assert.deepEqual(saved.starredBy, []);
});

for (const [field, id] of [
  ['company', () => fx.coB._id],
  ['user', () => fx.userB._id],
]) {
  test(`createContact: cross-tenant ${field} is rejected and nothing is written`, async () => {
    const before = await Contact.countDocuments({});
    const res = await postContact({ name: 'X', [field]: String(id()) });
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /not found in your organization/);
    assert.equal(await Contact.countDocuments({}), before);
  });
}

test('createContact: a client _id equal to another tenant user cannot become the owner', async () => {
  const res = await postContact({ name: 'Owner spoof', _id: String(fx.userB._id) });
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.equal(String((await Contact.findById(res.body._id)).user), String(fx.userA._id));
});

test('createContact: malformed references are rejected, nothing is written', async () => {
  const before = await Contact.countDocuments({});
  for (const body of [
    { name: 'bad', company: 'not-an-id' },
    { name: 'bad', user: 'zzz' },
    { name: 'bad', company: { nested: 'x' } },
    { name: 'bad', company: [String(fx.coA._id)] },
  ]) {
    const res = await postContact(body);
    assert.equal(res.statusCode, 400, JSON.stringify(body));
    assert.match(res.body.error, /^Invalid /);
  }
  assert.equal(await Contact.countDocuments({}), before);
});

test('service: a Contact is never created when a reference check fails (direct service call)', async () => {
  const before = await Contact.countDocuments({});
  await assert.rejects(
    contactService.createContact(orgA, { name: 'Direct', company: String(fx.coB._id) }, { actingUserId: fx.userA._id, createdByUserId: fx.userA._id }),
    /not found in your organization/
  );
  assert.equal(await Contact.countDocuments({}), before);
});

// ───────────────────────────── update ─────────────────────────────

test('updateContact: a legitimate update works', async () => {
  const c = await newContact(orgA);
  const res = await putContact(c._id, { name: 'Renamed', phone: '123' });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const fresh = await Contact.findById(c._id);
  assert.equal(fresh.name, 'Renamed');
  assert.equal(fresh.phone, '123');
});

test('updateContact: organization / createdBy / _id / starredBy cannot be overwritten', async () => {
  const c = await newContact(orgA, { starredBy: [fx.userA._id] });
  const otherId = oid();
  const res = await putContact(c._id, {
    name: 'Hijack',
    organization: String(orgB),
    createdBy: String(fx.userB._id),
    _id: String(otherId),
    starredBy: [String(fx.userB._id)],
  });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const fresh = await Contact.findById(c._id);
  assert.equal(String(fresh.organization), String(orgA));
  assert.equal(String(fresh.createdBy), String(fx.userA._id));
  assert.equal(String(fresh._id), String(c._id));
  assert.deepEqual(fresh.starredBy.map(String), [String(fx.userA._id)]);
  assert.equal(await Contact.countDocuments({ _id: otherId }), 0);
  assert.equal(fresh.name, 'Hijack', 'the legitimate field still updates');
});

for (const [field, id] of [
  ['company', () => fx.coB._id],
  ['user', () => fx.userB._id],
]) {
  test(`updateContact: cross-tenant ${field} is rejected and nothing changes`, async () => {
    const c = await newContact(orgA, { company: fx.coA._id, user: fx.userA._id });
    const before = (await Contact.findById(c._id)).toObject();
    const res = await putContact(c._id, { name: 'should not apply', [field]: String(id()) });
    assert.equal(res.statusCode, 400);
    assert.deepEqual((await Contact.findById(c._id)).toObject(), before);
  });
}

test('updateContact: same-org references are accepted; null clears; populated {_id} is reduced to an id', async () => {
  const c = await newContact(orgA);
  let res = await putContact(c._id, { company: { _id: String(fx.coA._id), name: 'x' }, user: String(fx.userA2._id) });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  let fresh = await Contact.findById(c._id);
  assert.equal(String(fresh.company), String(fx.coA._id));
  assert.equal(String(fresh.user), String(fx.userA2._id));
  res = await putContact(c._id, { company: null });
  assert.equal(res.statusCode, 200);
  assert.equal((await Contact.findById(c._id)).company, null);
});

test('updateContact: malformed reference id is rejected', async () => {
  const c = await newContact(orgA);
  assert.equal((await putContact(c._id, { company: 'not-an-id' })).statusCode, 400);
});

test("updateContact: Org A cannot update Org B's contact", async () => {
  const cB = await newContact(orgB, { name: 'B private' });
  const res = await putContact(cB._id, { name: 'pwned', organization: String(orgA) });
  assert.equal(res.statusCode, 404);
  const fresh = await Contact.findById(cB._id);
  assert.equal(fresh.name, 'B private');
  assert.equal(String(fresh.organization), String(orgB));
});

// ─────────────────────────── bulk import ───────────────────────────

process.env.RAZORPAY_KEY_ID ||= 'rzp_test_dummy'; // dummy values so route modules load; nothing here talks to those services
process.env.RAZORPAY_KEY_SECRET ||= 'dummy';
process.env.AWS_REGION ||= 'us-east-1'; process.env.AWS_ACCESS_KEY_ID ||= 'x'; process.env.AWS_SECRET_ACCESS_KEY ||= 'x'; process.env.AWS_BUCKET_NAME ||= 'test-bucket'; process.env.CLOUDFRONT_DOMAIN ||= 'example.test';
const router = require('../routes/contactRoutes');
const bulkImport = router.stack.find((l) => l.route?.path === '/bulk-import' && l.route.methods.post).route.stack.at(-1).handle;
const postImport = async (body, user = adminA()) => {
  const res = makeRes();
  await bulkImport({ body, user }, res);
  return res;
};

test('bulk-import: client-supplied organization / createdBy / _id / starredBy / user are ignored', async () => {
  const chosenId = oid();
  const res = await postImport({
    contacts: [{
      name: 'Imported', email: 'imp@x.test',
      organization: String(orgB), createdBy: String(fx.userB._id), lastUpdatedBy: String(fx.userB._id),
      user: String(fx.userB._id), _id: String(chosenId), starredBy: [String(fx.userB._id)],
    }],
  });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.imported, 1);
  const saved = await Contact.findOne({ email: 'imp@x.test' });
  assert.equal(String(saved.organization), String(orgA));
  assert.equal(String(saved.user), String(fx.userA._id));
  assert.notEqual(saved.createdBy && String(saved.createdBy), String(fx.userB._id));
  assert.notEqual(saved.lastUpdatedBy && String(saved.lastUpdatedBy), String(fx.userB._id));
  assert.notEqual(String(saved._id), String(chosenId));
  assert.deepEqual(saved.starredBy, []);
});

test("bulk-import: a company name only resolves inside the caller's org; regex chars are literal", async () => {
  const before = await Contact.countDocuments({});
  const res = await postImport({
    contacts: [
      { name: 'ok', company: 'Company A' },
      { name: 'cross', company: 'Company B' },
      { name: 'regex', company: '.*' },
      { name: 'obj', company: { $ne: null } },
      null,
      { name: { $ne: null } },
    ],
  });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.imported, 1);
  assert.equal(res.body.skipped, 5);
  assert.equal(await Contact.countDocuments({}), before + 1);
});

test('bulk-import merge: fills blanks only and cannot set protected fields on an existing contact', async () => {
  const existing = await newContact(orgA, { name: 'Dup', email: 'dup@x.test', createdBy: undefined });
  const res = await postImport({
    duplicateAction: 'merge',
    contacts: [{ name: 'Dup', email: 'dup@x.test', phone: '999', createdBy: String(fx.userB._id), organization: String(orgB) }],
  });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.merged, 1);
  const fresh = await Contact.findById(existing._id);
  assert.equal(fresh.phone, '999');
  assert.equal(String(fresh.organization), String(orgA));
  assert.notEqual(fresh.createdBy && String(fresh.createdBy), String(fx.userB._id));
});
