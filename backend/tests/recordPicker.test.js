// GET /companies and GET /contacts as used by the company / contact pickers:
//   ?limit= &search= &picker=true  (+ ?company= for contacts)
// Runs the real controllers against a throwaway in-memory MongoDB with two tenants.
// Usage: node --test tests/recordPicker.test.js
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

const Company = require('../models/Company');
const Contact = require('../models/Contact');
const User = require('../models/User');
const { getAllCompanies } = require('../controllers/companyController');
const { getAllContacts } = require('../controllers/contactController');

const oid = () => new mongoose.Types.ObjectId();
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
const callerA = () => ({ _id: fx.user._id, role: 'admin', organization: orgA, permissions: [] });
const run = async (fn, query = {}, req = {}) => {
  const res = makeRes();
  await fn({ user: callerA(), query, ...req }, res);
  return res;
};
const companies = (q, r) => run(getAllCompanies, q, r);
const contacts = (q, r) => run(getAllContacts, q, r);

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  fx.user = await new User({ name: 'Owner', email: 'o@a.test', organization: orgA, role: 'admin' }).save({ validateBeforeSave: false });
  const address = { line1: '1 Main St', city: 'Pune', state: 'Maharashtra', pincode: '411001', country: 'India' };

  // 30 companies in Org A (named C00..C29, created out of name order), 1 in Org B.
  const order = [...Array(30).keys()].sort(() => 0.5 - Math.random());
  fx.companies = [];
  for (const i of order) {
    fx.companies.push(await new Company({
      name: `Company ${String(i).padStart(2, '0')}`, industry: i % 2 ? 'Retail' : 'Finance & Banking', gstin: `27AAAAA${String(i).padStart(4, '0')}A1Z5`,
      organization: orgA, user: fx.user._id, createdBy: fx.user._id, owner: fx.user._id,
      billingAddress: address, shippingAddresses: [address],
      profilePicture: 'https://cdn.example.com/p.png', socialMedia: { twitter: 'x' },
      additionalFields: [{ key: 'tier', value: 'gold', type: 'text' }], starredBy: [fx.user._id],
    }).save({ validateBeforeSave: false }));
  }
  fx.coB = await new Company({ name: 'Company Other Org', organization: orgB, user: fx.user._id }).save({ validateBeforeSave: false });
  fx.byName = (n) => fx.companies.find((c) => c.name === n);

  // Contacts: 25 for Company 05, 5 for Company 06, 1 with no company, 1 in Org B.
  const mk = (name, company, org = orgA) => new Contact({
    name, email: `${name.replace(/\s/g, '').toLowerCase()}@x.test`, phone: '999', organization: org, company: company?._id,
    user: fx.user._id, createdBy: fx.user._id, avatar: 'https://cdn.example.com/a.png', socialMedia: { twitter: 'x' },
    additionalFields: [{ key: 'k', value: 'v', type: 'text' }], starredBy: [fx.user._id], lifecycleStage: 'Lead', stageStatus: 'New',
  }).save({ validateBeforeSave: false });
  for (let i = 0; i < 25; i++) await mk(`Alice ${String(i).padStart(2, '0')}`, fx.byName('Company 05'));
  for (let i = 0; i < 5; i++) await mk(`Bob ${i}`, fx.byName('Company 06'));
  await mk('Solo Person', null);
  await mk('Alice Other Org', null, orgB);
});
test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  setTimeout(() => process.exit(process.exitCode || 0), 200).unref();
});

// ───────────────────────── companies: existing behaviour unchanged ─────────────────────────

test('companies default: every company of the org, audit fields populated, full documents — as before', async () => {
  const res = await companies({});
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 30, 'none from Org B');
  const c = res.body[0];
  assert.equal(c.user.name, 'Owner', 'user populated');
  assert.equal(c.owner.name, 'Owner', 'owner populated');
  assert.ok(c.profilePicture && c.additionalFields.length && c.starredBy.length, 'heavy fields still present');
});

// ───────────────────────────── companies: picker use ─────────────────────────────

test('companies ?limit=20: the first 20 by NAME (what the dropdown shows on open)', async () => {
  const res = await companies({ limit: '20', picker: 'true' });
  assert.equal(res.body.length, 20);
  assert.deepEqual(res.body.map((c) => c.name), Array.from({ length: 20 }, (_, i) => `Company ${String(i).padStart(2, '0')}`));
});

test('companies picker=true: leaves out heavy fields and the audit populates, keeps what a form reads', async () => {
  const res = await companies({ limit: '100', picker: 'true' });
  const c = res.body.find((x) => x.name === 'Company 05');
  for (const gone of ['additionalFields', 'socialMedia', 'profilePicture', 'starredBy', '__v']) assert.equal(c[gone], undefined, `${gone} should be left out`);
  assert.ok(!c.user || !('name' in c.user), 'user is not populated');
  assert.ok(!c.owner || !('name' in c.owner), 'owner is not populated');
  // what applyCompanySelection / the invoice forms read when a company is picked
  assert.equal(c.name, 'Company 05');
  assert.equal(c.gstin, '27AAAAA0005A1Z5');
  assert.equal(c.billingAddress.city, 'Pune');
  assert.equal(c.billingAddress.state, 'Maharashtra');
  assert.equal(c.shippingAddresses[0].pincode, '411001');
  assert.ok(c._id);
});

test('companies picker=true is smaller than the default response for the same companies', async () => {
  const full = JSON.stringify((await companies({ limit: '30' })).body).length;
  const slim = JSON.stringify((await companies({ limit: '30', picker: 'true' })).body).length;
  assert.ok(slim < full, `picker ${slim} should be smaller than default ${full}`);
});

test('companies search finds a company outside the first page; "&" and "and" are interchangeable', async () => {
  const res = await companies({ search: 'Company 27', limit: '20', picker: 'true' });
  assert.deepEqual(res.body.map((c) => c.name), ['Company 27']);
  const fin = await companies({ search: 'finance and banking', limit: '100', picker: 'true' });
  assert.equal(fin.body.length, 15, 'searching "and" still finds "Finance & Banking"');
});

test('companies: other tenants are never returned; picker is on only for the exact value "true"', async () => {
  const res = await companies({ search: 'Other Org', picker: 'true' });
  assert.deepEqual(res.body, []);
  const notPicker = await companies({ limit: '1', picker: 'yes' });
  assert.ok(notPicker.body[0].additionalFields.length, 'not picker mode -> full document');
});

test('companies own-only users still see only their own companies in picker mode', async () => {
  const stranger = new mongoose.Types.ObjectId();
  const mine = await companies({ limit: '100', picker: 'true' }, { ownOnly: true });
  assert.equal(mine.body.length, 30);
  await Company.updateOne({ _id: fx.byName('Company 29')._id }, { user: stranger, createdBy: stranger, owner: stranger });
  const after = await companies({ limit: '100', picker: 'true' }, { ownOnly: true });
  assert.equal(after.body.length, 29);
  assert.ok(!after.body.some((c) => c.name === 'Company 29'));
});

// ───────────────────────── contacts: existing behaviour unchanged ─────────────────────────

test('contacts default: full documents with the WHOLE company populated — as before', async () => {
  const res = await contacts({});
  assert.equal(res.body.length, 31, '25 + 5 + 1 in Org A, none from Org B');
  const c = res.body.find((x) => x.name === 'Alice 00');
  assert.equal(c.company.name, 'Company 05');
  assert.ok(c.company.additionalFields.length, 'the entire company record is populated by default');
  assert.equal(c.user.name, 'Owner');
});

// ───────────────────────────── contacts: picker use ─────────────────────────────

test('contacts ?limit=20: the first 20 by NAME', async () => {
  const res = await contacts({ limit: '20', picker: 'true' });
  assert.equal(res.body.length, 20);
  const names = res.body.map((c) => c.name);
  assert.deepEqual(names, [...names].sort());
});

test('contacts picker=true: slim contact + only the company name and GSTIN (never the whole company)', async () => {
  const res = await contacts({ limit: '100', picker: 'true' });
  const c = res.body.find((x) => x.name === 'Alice 03');
  for (const gone of ['additionalFields', 'socialMedia', 'avatar', 'starredBy', '__v']) assert.equal(c[gone], undefined, `${gone} should be left out`);
  assert.ok(!c.user || !('name' in c.user), 'user is not populated');
  // what the pickers read
  assert.equal(c.name, 'Alice 03');
  assert.equal(c.email, 'alice03@x.test');
  assert.equal(c.phone, '999');
  assert.equal(c.company.name, 'Company 05');
  assert.equal(c.company.gstin, '27AAAAA0005A1Z5');
  assert.ok(c.company._id, 'the company id is still there (forms compare contact.company._id to the chosen company)');
  assert.equal(c.company.additionalFields, undefined, 'the rest of the company is not dragged along');
  assert.equal(c.company.billingAddress, undefined);
});

test('contacts picker=true: a contact with no company has company = null / absent, not an error', async () => {
  const res = await contacts({ search: 'Solo', picker: 'true' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 1);
  assert.ok(!res.body[0].company);
});

test('contacts ?company= narrows the picker to that company\'s contacts (the contact dropdown after a company is chosen)', async () => {
  const c06 = await contacts({ company: String(fx.byName('Company 06')._id), limit: '20', picker: 'true' });
  assert.deepEqual(c06.body.map((c) => c.name).sort(), ['Bob 0', 'Bob 1', 'Bob 2', 'Bob 3', 'Bob 4']);
  const c05 = await contacts({ company: String(fx.byName('Company 05')._id), limit: '20', picker: 'true' });
  assert.equal(c05.body.length, 20, 'still capped at the page size');
  const searched = await contacts({ company: String(fx.byName('Company 05')._id), search: 'Alice 24', limit: '20', picker: 'true' });
  assert.deepEqual(searched.body.map((c) => c.name), ['Alice 24'], 'search finds one outside the first page, inside that company');
});

test('contacts search also matches by company name, in picker mode', async () => {
  const res = await contacts({ search: 'Company 06', limit: '20', picker: 'true' });
  assert.equal(res.body.length, 5);
  assert.ok(res.body.every((c) => c.company.name === 'Company 06'));
});

test('contacts: other tenants never returned; picker only for the exact value "true"', async () => {
  const res = await contacts({ search: 'Alice Other', picker: 'true' });
  assert.deepEqual(res.body, []);
  const notPicker = await contacts({ limit: '1', picker: '1' });
  assert.ok(notPicker.body[0].additionalFields.length, 'not picker mode -> full document');
});

test('contacts own-only users still see only their own contacts in picker mode', async () => {
  const stranger = new mongoose.Types.ObjectId();
  await Contact.updateOne({ name: 'Solo Person' }, { user: stranger, createdBy: stranger });
  const res = await contacts({ search: 'Solo', picker: 'true' }, { ownOnly: true });
  assert.deepEqual(res.body, []);
});

test('contacts picker=true is smaller than the default response for the same contacts', async () => {
  const full = JSON.stringify((await contacts({ limit: '30' })).body).length;
  const slim = JSON.stringify((await contacts({ limit: '30', picker: 'true' })).body).length;
  assert.ok(slim < full, `picker ${slim} should be smaller than default ${full}`);
});
