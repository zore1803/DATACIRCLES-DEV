// Runs the real company controller/service against a throwaway in-memory
// MongoDB with two tenants (Org A and Org B).
// Usage: node --test tests/companyIsolation.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Company = require('../models/Company');
const User = require('../models/User');
const companyService = require('../services/companyService');
const {
  createCompany,
  updateCompany,
  addSubsidiary,
  removeSubsidiary,
} = require('../controllers/companyController');
const stripDollarKeys = require('../middlewares/stripDollarKeys');

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
  fx.coA2 = await save(Company, { name: 'Company A2', organization: orgA });
  fx.coB = await save(Company, { name: 'Company B', organization: orgB });
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const postCompany = async (body, user = adminA()) => {
  const res = makeRes();
  await createCompany({ body, user }, res);
  return res;
};
const putCompany = async (id, body, user = adminA()) => {
  const res = makeRes();
  await updateCompany({ params: { id: String(id) }, body, user }, res);
  return res;
};
const newCompany = (org, extra = {}) => save(Company, { name: 'Co', organization: org, createdBy: fx.userA._id, ...extra });

// ───────────────────────────── create ─────────────────────────────

test('createCompany: a normal company succeeds; organization/createdBy/user come from the server', async () => {
  const res = await postCompany({ name: 'Plain Co', industry: 'IT' });
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  const saved = await Company.findById(res.body._id);
  assert.equal(String(saved.organization), String(orgA));
  assert.equal(String(saved.createdBy), String(fx.userA._id));
  assert.equal(String(saved.user), String(fx.userA._id));
});

test('createCompany: client-supplied organization / createdBy / _id / starredBy / user are ignored', async () => {
  const chosenId = oid();
  const res = await postCompany({
    name: 'Spoof Co',
    organization: String(orgB),
    createdBy: String(fx.userB._id),
    lastUpdatedBy: String(fx.userB._id),
    user: String(fx.userB._id),
    _id: String(chosenId),
    starredBy: [String(fx.userB._id)],
  });
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  const saved = await Company.findById(res.body._id);
  assert.equal(String(saved.organization), String(orgA));
  assert.equal(String(saved.createdBy), String(fx.userA._id));
  assert.equal(String(saved.lastUpdatedBy), String(fx.userA._id));
  assert.equal(String(saved.user), String(fx.userA._id), 'user is the acting user, never the body or _id');
  assert.notEqual(String(saved._id), String(chosenId), 'the server picks the _id');
  assert.equal(await Company.countDocuments({ _id: chosenId }), 0);
  assert.deepEqual(saved.starredBy, []);
});

test('createCompany: same-org owner / parentCompany / subsidiaries succeed', async () => {
  const res = await postCompany({
    name: 'Linked Co',
    owner: String(fx.userA2._id),
    parentCompany: String(fx.coA._id),
    subsidiaries: [String(fx.coA2._id)],
  });
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  const saved = await Company.findById(res.body._id);
  assert.equal(String(saved.owner), String(fx.userA2._id));
  assert.equal(String(saved.parentCompany), String(fx.coA._id));
  assert.deepEqual(saved.subsidiaries.map(String), [String(fx.coA2._id)]);
});

for (const [field, value, message] of [
  ['owner', () => String(fx.userB._id), /Owner not found in your organization/],
  ['parentCompany', () => String(fx.coB._id), /Parent company not found in your organization/],
  ['subsidiaries', () => [String(fx.coA2._id), String(fx.coB._id)], /Subsidiary company not found in your organization/],
]) {
  test(`createCompany: cross-tenant ${field} is rejected and nothing is written`, async () => {
    const before = await Company.countDocuments({});
    const res = await postCompany({ name: `Cross ${field}`, [field]: value() });
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, message);
    assert.equal(await Company.countDocuments({}), before);
  });
}

test('createCompany: malformed references are rejected, nothing is written', async () => {
  const before = await Company.countDocuments({});
  for (const body of [
    { name: 'x', owner: 'nope' },
    { name: 'x', parentCompany: 42 },
    { name: 'x', subsidiaries: 'not-an-array' },
    { name: 'x', subsidiaries: ['bad'] },
    { name: 'x', owner: { nested: 1 } },
  ]) {
    const res = await postCompany(body);
    assert.equal(res.statusCode, 400, JSON.stringify(body));
    assert.match(res.body.error, /^Invalid /);
  }
  assert.equal(await Company.countDocuments({}), before);
});

// ───────────────────────────── update ─────────────────────────────

test('updateCompany: a legitimate update works', async () => {
  const co = await newCompany(orgA);
  const res = await putCompany(co._id, { name: 'Renamed', industry: 'Retail' });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const fresh = await Company.findById(co._id);
  assert.equal(fresh.name, 'Renamed');
  assert.equal(fresh.industry, 'Retail');
});

test('updateCompany: organization / createdBy / _id / starredBy cannot be overwritten', async () => {
  const co = await newCompany(orgA, { starredBy: [fx.userA._id] });
  const otherId = oid();
  const res = await putCompany(co._id, {
    name: 'Hijack attempt',
    organization: String(orgB),
    createdBy: String(fx.userB._id),
    _id: String(otherId),
    starredBy: [String(fx.userB._id)],
  });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const fresh = await Company.findById(co._id);
  assert.equal(String(fresh.organization), String(orgA));
  assert.equal(String(fresh.createdBy), String(fx.userA._id));
  assert.equal(String(fresh._id), String(co._id));
  assert.deepEqual(fresh.starredBy.map(String), [String(fx.userA._id)]);
  assert.equal(await Company.countDocuments({ _id: otherId }), 0);
  assert.equal(fresh.name, 'Hijack attempt', 'the legitimate field still updates');
});

for (const [field, value, message] of [
  ['user', () => String(fx.userB._id), /User not found in your organization/],
  ['owner', () => String(fx.userB._id), /Owner not found in your organization/],
  ['parentCompany', () => String(fx.coB._id), /Parent company not found in your organization/],
  ['subsidiaries', () => [String(fx.coB._id)], /Subsidiary company not found in your organization/],
]) {
  test(`updateCompany: cross-tenant ${field} is rejected and nothing changes`, async () => {
    const co = await newCompany(orgA);
    const before = (await Company.findById(co._id)).toObject();
    const res = await putCompany(co._id, { name: 'should not apply', [field]: value() });
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, message);
    assert.deepEqual((await Company.findById(co._id)).toObject(), before);
  });
}

test('updateCompany: same-org references are accepted; null clears', async () => {
  const co = await newCompany(orgA);
  let res = await putCompany(co._id, { owner: String(fx.userA2._id), parentCompany: String(fx.coA._id) });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  res = await putCompany(co._id, { owner: null });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal((await Company.findById(co._id)).owner, null);
});

test("updateCompany: Org A cannot update Org B's company", async () => {
  const before = (await Company.findById(fx.coB._id)).toObject();
  const res = await putCompany(fx.coB._id, { name: 'pwned', organization: String(orgA) });
  assert.equal(res.statusCode, 404);
  assert.deepEqual((await Company.findById(fx.coB._id)).toObject(), before);
});

// ──────────────────────────── subsidiaries ────────────────────────────

test("removeSubsidiary: cannot clear the parent link of another tenant's company", async () => {
  const parentB = await newCompany(orgB, { name: 'B parent' });
  const childB = await newCompany(orgB, { name: 'B child', parentCompany: parentB._id });
  const parentA = await newCompany(orgA, { name: 'A parent' });

  const res = makeRes();
  await removeSubsidiary(
    { params: { id: String(parentA._id), subsidiaryId: String(childB._id) }, user: adminA() },
    res,
  );
  assert.equal(res.statusCode, 200);
  const fresh = await Company.findById(childB._id);
  assert.equal(String(fresh.parentCompany), String(parentB._id), "Org B's link must be untouched");
});

test('removeSubsidiary: still removes a same-org link', async () => {
  const parentA = await newCompany(orgA, { name: 'A parent' });
  const childA = await newCompany(orgA, { name: 'A child', parentCompany: parentA._id });
  await Company.updateOne({ _id: parentA._id }, { $addToSet: { subsidiaries: childA._id } });
  const res = makeRes();
  await removeSubsidiary(
    { params: { id: String(parentA._id), subsidiaryId: String(childA._id) }, user: adminA() },
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal((await Company.findById(childA._id)).parentCompany ?? null, null);
  assert.deepEqual((await Company.findById(parentA._id)).subsidiaries, []);
});

test("addSubsidiary: another tenant's company is a plain 404 and nothing changes", async () => {
  const parentA = await newCompany(orgA, { name: 'A parent' });
  const before = (await Company.findById(fx.coB._id)).toObject();
  let res = makeRes();
  await addSubsidiary({ params: { id: String(parentA._id) }, body: { subsidiaryId: String(fx.coB._id) }, user: adminA() }, res);
  assert.equal(res.statusCode, 404);
  assert.deepEqual((await Company.findById(fx.coB._id)).toObject(), before);

  // and as the parent
  res = makeRes();
  await addSubsidiary({ params: { id: String(fx.coB._id) }, body: { subsidiaryId: String(parentA._id) }, user: adminA() }, res);
  assert.equal(res.statusCode, 404);
});

test('addSubsidiary: a same-org link still works', async () => {
  const parentA = await newCompany(orgA, { name: 'A parent' });
  const childA = await newCompany(orgA, { name: 'A child' });
  const res = makeRes();
  await addSubsidiary({ params: { id: String(parentA._id) }, body: { subsidiaryId: String(childA._id) }, user: adminA() }, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(String((await Company.findById(childA._id)).parentCompany), String(parentA._id));
});

// ───────────── multipart bodies: $ keys survive multer unless stripped ─────────────

test('multipart: $-prefixed form keys are stripped after multer on the company routes', async () => {
  const seen = {};
  const app = express();
  // Same order as routes/CompanyRoutes.js: multer first, then stripDollarKeys.
  app.post('/raw', multer().none(), (req, res) => { seen.raw = JSON.parse(JSON.stringify(req.body)); res.end(); });
  app.post('/guarded', multer().none(), stripDollarKeys, (req, res) => { seen.guarded = JSON.parse(JSON.stringify(req.body)); res.end(); });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const form = () => {
    const f = new FormData();
    f.append('name', 'x');
    f.append('socialMedia[$ne]', 'y');
    f.append('socialMedia[twitter]', 'keep');
    f.append('additionalFields[0][value][$gt]', '');
    return f;
  };
  try {
    await fetch(`${base}/raw`, { method: 'POST', body: form() });
    await fetch(`${base}/guarded`, { method: 'POST', body: form() });
  } finally {
    server.close();
  }
  assert.ok('$ne' in seen.raw.socialMedia, 'precondition: multer does build $-keys from form fields');
  assert.deepEqual(seen.guarded.socialMedia, { twitter: 'keep' });
  assert.equal(seen.guarded.name, 'x');
  assert.deepEqual(seen.guarded.additionalFields[0].value, {});
});

test('service: a Company is never created when a reference check fails (direct service call)', async () => {
  const before = await Company.countDocuments({});
  await assert.rejects(
    companyService.createCompany(orgA, { name: 'Direct', owner: String(fx.userB._id) }, { actingUserId: fx.userA._id, createdByUserId: fx.userA._id }),
    /Owner not found in your organization/,
  );
  assert.equal(await Company.countDocuments({}), before);
});
