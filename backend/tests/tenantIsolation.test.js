// Runs the real updateDeal / updateTask controllers and the $-key middleware
// against a throwaway in-memory MongoDB with two tenants (Org A and Org B).
// Usage: node --test tests/tenantIsolation.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Deal = require('../models/Deal');
const Task = require('../models/Task');
const Company = require('../models/Company');
const Contact = require('../models/Contact');
const User = require('../models/User');
const { updateDeal } = require('../controllers/dealController');
const { updateTask } = require('../controllers/taskController');
const stripDollarKeys = require('../middlewares/stripDollarKeys');

const oid = () => new mongoose.Types.ObjectId();
const save = (Model, doc) => new Model(doc).save({ validateBeforeSave: false });

// Minimal Express-style response that records what the controller sent.
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

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  fx.userA = await save(User, { name: 'A admin', email: 'a@a.test', organization: orgA, role: 'admin' });
  fx.userA2 = await save(User, { name: 'A staff', email: 'a2@a.test', organization: orgA });
  fx.userB = await save(User, { name: 'B admin', email: 'b@b.test', organization: orgB, role: 'admin' });
  fx.companyA = await save(Company, { name: 'Company A', organization: orgA });
  fx.companyB = await save(Company, { name: 'Company B', organization: orgB });
  fx.contactA = await save(Contact, { name: 'Contact A', organization: orgA });
  fx.contactB = await save(Contact, { name: 'Contact B', organization: orgB });
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const callerA = () => ({ _id: fx.userA._id, role: 'admin', organization: orgA, permissions: [] });

const newDeal = (org, createdBy, extra = {}) =>
  save(Deal, { title: 'Deal', amount: 100, organization: org, createdBy, ...extra });

const putDeal = async (id, body, user = callerA()) => {
  const res = makeRes();
  await updateDeal({ params: { id: String(id) }, body, user }, res);
  return res;
};

// ───────────────────────────── Deal ─────────────────────────────

test('deal: legitimate update works', async () => {
  const deal = await newDeal(orgA, fx.userA._id, { company: fx.companyA._id });
  const res = await putDeal(deal._id, { title: 'Legitimate update', amount: 250 });
  assert.equal(res.statusCode, 200);
  const fresh = await Deal.findById(deal._id);
  assert.equal(fresh.title, 'Legitimate update');
  assert.equal(fresh.amount, 250);
  assert.equal(String(fresh.organization), String(orgA));
});

test('deal: organization / createdBy / _id in the body are ignored', async () => {
  const deal = await newDeal(orgA, fx.userA._id);
  const otherId = oid();
  const res = await putDeal(deal._id, {
    title: 'Hijack attempt',
    organization: String(orgB),
    createdBy: String(fx.userB._id),
    _id: String(otherId),
  });
  assert.equal(res.statusCode, 200);
  const fresh = await Deal.findById(deal._id);
  assert.equal(String(fresh.organization), String(orgA), 'organization must not change');
  assert.equal(String(fresh.createdBy), String(fx.userA._id), 'createdBy must not change');
  assert.equal(String(fresh._id), String(deal._id), '_id must not change');
  assert.equal(await Deal.countDocuments({ _id: otherId }), 0);
  assert.equal(fresh.title, 'Hijack attempt', 'the legitimate field still updates');
});

for (const [field, getId, label] of [
  ['company', () => fx.companyB._id, 'another org company'],
  ['contact', () => fx.contactB._id, 'another org contact'],
  ['user', () => fx.userB._id, 'another org user'],
]) {
  test(`deal: ${field} from ${label} is rejected`, async () => {
    const deal = await newDeal(orgA, fx.userA._id, { company: fx.companyA._id, user: fx.userA._id });
    const before = (await Deal.findById(deal._id)).toObject();
    const res = await putDeal(deal._id, { title: 'should not apply', [field]: String(getId()) });
    assert.equal(res.statusCode, 400);
    const after = (await Deal.findById(deal._id)).toObject();
    assert.deepEqual(after, before, 'nothing may be written when a reference is cross-tenant');
  });
}

test('deal: references inside the same org are accepted, empty clears', async () => {
  const deal = await newDeal(orgA, fx.userA._id, { company: fx.companyA._id });
  let res = await putDeal(deal._id, {
    company: String(fx.companyA._id),
    contact: String(fx.contactA._id),
    user: String(fx.userA2._id),
  });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  let fresh = await Deal.findById(deal._id);
  assert.equal(String(fresh.contact), String(fx.contactA._id));
  assert.equal(String(fresh.user), String(fx.userA2._id));

  // null clears a reference. ('' has always failed Mongoose's ObjectId cast in
  // findOneAndUpdate, independent of this change.)
  res = await putDeal(deal._id, { contact: null });
  assert.equal(res.statusCode, 200);
  fresh = await Deal.findById(deal._id);
  assert.equal(fresh.contact, null);
});

test('deal: a malformed reference id is rejected, not thrown', async () => {
  const deal = await newDeal(orgA, fx.userA._id);
  const res = await putDeal(deal._id, { company: 'not-an-id' });
  assert.equal(res.statusCode, 400);
});

test("deal: Org A cannot update Org B's deal", async () => {
  const dealB = await newDeal(orgB, fx.userB._id, { title: 'B private' });
  const res = await putDeal(dealB._id, { title: 'pwned', organization: String(orgA) });
  assert.equal(res.statusCode, 404);
  const fresh = await Deal.findById(dealB._id);
  assert.equal(fresh.title, 'B private');
  assert.equal(String(fresh.organization), String(orgB));
});

// ───────────────────────────── Task ─────────────────────────────

const newTask = (org, createdBy, extra = {}) =>
  save(Task, {
    title: 'Task',
    dueDate: new Date(),
    selectedDate: new Date(),
    organization: org,
    createdBy,
    relatedEntities: [{ entityId: fx.companyA._id, entityModel: 'Company' }],
    ...extra,
  });

const putTask = async (id, body, user = callerA()) => {
  const res = makeRes();
  await updateTask({ params: { id: String(id) }, body, user, ownOnly: false }, res);
  return res;
};

test('task: legitimate update works', async () => {
  const task = await newTask(orgA, fx.userA._id);
  const res = await putTask(task._id, { title: 'Renamed', priority: 'high' });
  assert.equal(res.statusCode, 200);
  const fresh = await Task.findById(task._id);
  assert.equal(fresh.title, 'Renamed');
  assert.equal(fresh.priority, 'high');
});

test('task: organization / createdBy / _id / starredBy cannot be overwritten', async () => {
  const task = await newTask(orgA, fx.userA._id, { starredBy: [fx.userA._id] });
  const otherId = oid();
  const res = await putTask(task._id, {
    title: 'Hijack attempt',
    organization: String(orgB),
    createdBy: String(fx.userB._id),
    _id: String(otherId),
    starredBy: [String(fx.userB._id)],
  });
  assert.equal(res.statusCode, 200);
  const fresh = await Task.findById(task._id);
  assert.equal(String(fresh.organization), String(orgA));
  assert.equal(String(fresh.createdBy), String(fx.userA._id));
  assert.equal(String(fresh._id), String(task._id));
  assert.deepEqual(fresh.starredBy.map(String), [String(fx.userA._id)]);
  assert.equal(await Task.countDocuments({ _id: otherId }), 0);
  assert.equal(fresh.title, 'Hijack attempt', 'the legitimate field still updates');
});

test("task: Org A cannot update Org B's task", async () => {
  const taskB = await newTask(orgB, fx.userB._id, { title: 'B private' });
  const res = await putTask(taskB._id, { title: 'pwned', organization: String(orgA) });
  assert.equal(res.statusCode, 404);
  const fresh = await Task.findById(taskB._id);
  assert.equal(fresh.title, 'B private');
  assert.equal(String(fresh.organization), String(orgB));
});

// ──────────────────────── $-key injection ────────────────────────

test('middleware: strips $ keys at any depth, keeps ordinary fields', () => {
  const body = {
    email: { $ne: null },
    title: 'ok',
    nested: { a: { $gt: '', keep: 1 }, list: [{ $where: 'x', n: 2 }, 'str', 3] },
    'dotted.key': 'kept',
    $set: { organization: 'x' },
  };
  const req = { body, method: 'POST', originalUrl: '/t' };
  let called = false;
  stripDollarKeys(req, makeRes(), () => (called = true));
  assert.ok(called);
  assert.deepEqual(req.body, {
    email: {},
    title: 'ok',
    nested: { a: { keep: 1 }, list: [{ n: 2 }, 'str', 3] },
    'dotted.key': 'kept',
  });
});

test('middleware: leaves non-object / Buffer bodies alone and rejects absurd nesting', () => {
  for (const body of [undefined, null, Buffer.from('{"$ne":1}')]) {
    const req = { body };
    let called = false;
    stripDollarKeys(req, makeRes(), () => (called = true));
    assert.ok(called);
  }
  let deep = {};
  let cur = deep;
  for (let i = 0; i < 200; i++) cur = cur.a = {};
  const res = makeRes();
  stripDollarKeys({ body: deep, method: 'POST', originalUrl: '/t' }, res, () => assert.fail('should not continue'));
  assert.equal(res.statusCode, 400);
});

test('end to end: $-operators in a JSON body never reach MongoDB', async () => {
  const deal = await newDeal(orgA, fx.userA._id, { title: 'untouched' });
  const app = express();
  app.use(express.json());
  app.use(stripDollarKeys);
  app.put('/deals/:id', (req, res, next) => {
    req.user = callerA();
    updateDeal(req, res, next);
  });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const put = (body) =>
    fetch(`${base}/deals/${deal._id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  try {
    // A top-level $set would otherwise be a raw Mongo update operator.
    let r = await put({ $set: { organization: String(orgB), title: 'pwned' } });
    assert.equal(r.status, 200);
    let fresh = await Deal.findById(deal._id);
    assert.equal(fresh.title, 'untouched');
    assert.equal(String(fresh.organization), String(orgA));

    // A nested operator in a field value is stripped to an empty object.
    r = await put({ title: { $ne: null } });
    assert.notEqual(r.status, 500);
    fresh = await Deal.findById(deal._id);
    assert.equal(fresh.title, 'untouched');
  } finally {
    server.close();
  }
});

// ─────────────────────────── Deal: create ───────────────────────────

const { createDeal } = require('../controllers/dealController');

const postDeal = async (body, user = callerA()) => {
  const res = makeRes();
  await createDeal({ body, user }, res);
  return res;
};

test('createDeal: a normal deal succeeds; organization/createdBy come from the server', async () => {
  const res = await postDeal({ title: 'Plain deal', amount: 500, status: 'Open' });
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  const saved = await Deal.findById(res.body._id);
  assert.equal(saved.title, 'Plain deal');
  assert.equal(String(saved.organization), String(orgA));
  assert.equal(String(saved.createdBy), String(fx.userA._id));
  assert.equal(String(saved.user), String(fx.userA._id), 'owner defaults to the caller');
});

test('createDeal: Org A company succeeds', async () => {
  const res = await postDeal({ title: 'With company', company: String(fx.companyA._id) });
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.equal(String((await Deal.findById(res.body._id)).company), String(fx.companyA._id));
});

test('createDeal: Org A contact succeeds', async () => {
  const res = await postDeal({ title: 'With contact', contact: String(fx.contactA._id) });
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.equal(String((await Deal.findById(res.body._id)).contact), String(fx.contactA._id));
});

test('createDeal: Org A user as owner succeeds', async () => {
  const res = await postDeal({ title: 'With owner', user: String(fx.userA2._id) });
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.equal(String((await Deal.findById(res.body._id)).user), String(fx.userA2._id));
});

test('createDeal: all three same-org references together succeed', async () => {
  const res = await postDeal({
    title: 'All refs',
    company: String(fx.companyA._id),
    contact: String(fx.contactA._id),
    user: String(fx.userA2._id),
  });
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
});

for (const [field, getId, label] of [
  ['company', () => fx.companyB._id, 'Org B company'],
  ['contact', () => fx.contactB._id, 'Org B contact'],
  ['user', () => fx.userB._id, 'Org B user'],
]) {
  test(`createDeal: ${label} is rejected and nothing is written`, async () => {
    const before = await Deal.countDocuments({});
    const res = await postDeal({ title: `Cross-tenant ${field}`, [field]: String(getId()) });
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /not found in your organization/);
    assert.equal(await Deal.countDocuments({}), before, 'no deal may be created');
  });
}

test('createDeal: one bad reference among good ones still creates nothing', async () => {
  const before = await Deal.countDocuments({});
  const res = await postDeal({
    title: 'Mixed',
    company: String(fx.companyA._id),
    contact: String(fx.contactB._id),
  });
  assert.equal(res.statusCode, 400);
  assert.equal(await Deal.countDocuments({}), before);
});

test('createDeal: a client-supplied organization / createdBy / _id / starredBy is ignored', async () => {
  const chosenId = oid();
  const res = await postDeal({
    title: 'Spoof attempt',
    organization: String(orgB),
    createdBy: String(fx.userB._id),
    lastUpdatedBy: String(fx.userB._id),
    _id: String(chosenId),
    starredBy: [String(fx.userB._id)],
  });
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  const saved = await Deal.findById(res.body._id);
  assert.equal(String(saved.organization), String(orgA));
  assert.equal(String(saved.createdBy), String(fx.userA._id));
  assert.equal(String(saved.lastUpdatedBy), String(fx.userA._id));
  assert.notEqual(String(saved._id), String(chosenId), 'the server picks the _id');
  assert.equal(await Deal.countDocuments({ _id: chosenId }), 0);
  assert.deepEqual(saved.starredBy, []);
});

test('createDeal: invalid reference ids are rejected, nothing is written', async () => {
  const before = await Deal.countDocuments({});
  for (const body of [
    { title: 'bad', company: 'not-an-id' },
    { title: 'bad', contact: '12345' },
    { title: 'bad', user: 'zzz' },
    { title: 'bad', company: { nested: 'x' } },
    { title: 'bad', company: 42 },
    { title: 'bad', company: [String(fx.companyA._id)] },
  ]) {
    const res = await postDeal(body);
    assert.equal(res.statusCode, 400, JSON.stringify(body));
    assert.match(res.body.error, /^Invalid /);
  }
  assert.equal(await Deal.countDocuments({}), before);
});

test('createDeal: a well-formed id that does not exist gets the same answer as a cross-tenant one', async () => {
  const res = await postDeal({ title: 'ghost', company: String(oid()) });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'Company not found in your organization');
});

test('createDeal: missing / null / empty references are "not supplied"', async () => {
  const res = await postDeal({ title: 'No refs', company: null, contact: null, user: '' });
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  const saved = await Deal.findById(res.body._id);
  assert.equal(saved.company, null);
  assert.equal(String(saved.user), String(fx.userA._id), 'empty owner falls back to the caller');
});

test('createDeal: a populated {_id} reference is accepted and stored as a plain id', async () => {
  const res = await postDeal({ title: 'Populated ref', company: { _id: String(fx.companyA._id), name: 'x' } });
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.equal(String((await Deal.findById(res.body._id)).company), String(fx.companyA._id));
});
