// The User document's secrets (password hash, password-reset token + expiry) must never
// leave the server by accident, and every flow that LEGITIMATELY needs them must still work.
//
// The schema marks the three fields `select: false`, so no query, populate, lean() or
// toJSON() returns them unless a caller asks for them with `.select("+field")`. This suite
// runs the REAL controllers (folders, invoices, tasks, super-admin tickets, auth) against a
// throwaway in-memory MongoDB and asserts, in both directions:
//   - no response contains the secrets (checked by value AND by key name, at any depth);
//   - login / forgot-password / reset-password / set-password / unlink-Google still work.
// Email sending is stubbed — nothing is ever sent.
// Usage: node --test tests/userSensitiveFields.test.js
process.env.AWS_REGION ||= 'us-east-1';
process.env.AWS_ACCESS_KEY_ID ||= 'x';
process.env.AWS_SECRET_ACCESS_KEY ||= 'x';
process.env.AWS_BUCKET_NAME ||= 'test-bucket';
process.env.CLOUDFRONT_DOMAIN ||= 'example.test';
process.env.RAZORPAY_KEY_ID ||= 'rzp_test_dummy';
process.env.RAZORPAY_KEY_SECRET ||= 'dummy';
process.env.JWT_SECRET ||= 'test-jwt-secret';
process.env.JWT_EXPIRES_IN ||= '1h';
process.env.FRONTEND_URL ||= 'http://localhost:5173';

const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { MongoMemoryServer } = require('mongodb-memory-server');

// ---- stub the mailer BEFORE authController loads, and record what it was asked to send ----
const sent = [];
const mailerPath = require.resolve('../utils/sendGridMail.js');
require.cache[mailerPath] = {
  id: mailerPath, filename: mailerPath, loaded: true,
  exports: async (msg) => { sent.push(msg); },
};

const User = require('../models/User');
const Organization = require('../models/Organization');
const Company = require('../models/Company');
const Folder = require('../models/Folder');
const Invoice = require('../models/Invoice');
const Task = require('../models/Task');
const Ticket = require('../models/Ticket');
const TempEmailOTP = require('../models/TempEmailOTP');
const folderController = require('../controllers/folderController');
const invoiceController = require('../controllers/invoiceController');
const taskController = require('../controllers/taskController');
const superAdminController = require('../controllers/superAdminController');
const authController = require('../controllers/authController');

const oid = () => new mongoose.Types.ObjectId();
const PASSWORD = 'Correct#Pass1';
const RESET_TOKEN_HASH = 'RESET-TOKEN-HASH-SECRET-0123456789abcdef';
const SENSITIVE_KEYS = ['password', 'passwordResetToken', 'passwordResetExpires'];

let mongod; let HASH; let orgId;

// A response as the client would receive it (Express JSON-serialises with toJSON).
function makeRes() {
  const res = { statusCode: 200, body: undefined };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = JSON.parse(JSON.stringify(b)); return res; };
  return res;
}

// Every key name, at any depth.
function allKeys(v, acc = new Set()) {
  if (Array.isArray(v)) v.forEach((x) => allKeys(x, acc));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { acc.add(k); allKeys(x, acc); }
  return acc;
}
function assertNoSecrets(input, label) {
  const body = JSON.parse(JSON.stringify(input)); // what the client would actually receive
  const raw = JSON.stringify(body);
  assert.ok(!raw.includes(HASH), `${label}: contains the bcrypt password hash`);
  assert.ok(!raw.includes(RESET_TOKEN_HASH), `${label}: contains the reset-token hash`);
  const keys = allKeys(body);
  for (const k of SENSITIVE_KEYS) assert.ok(!keys.has(k), `${label}: has a "${k}" key`);
}

// Inserted raw so the secrets are definitely stored, whatever the schema's select rules say.
async function seedUser(over = {}) {
  const _id = oid();
  await User.collection.insertOne({
    _id, name: 'Asha', email: `u${_id}@t.test`, role: 'admin', organization: orgId,
    isEmailVerified: true, isPhoneVerified: true, permissions: [],
    password: HASH, passwordResetToken: RESET_TOKEN_HASH, passwordResetExpires: new Date(Date.now() + 3600e3),
    createdAt: new Date(), updatedAt: new Date(), ...over,
  });
  return _id;
}
const rawUser = (id) => User.collection.findOne({ _id: id });

test.before(async () => {
  HASH = await bcrypt.hash(PASSWORD, 4);
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  orgId = oid();
  await Organization.collection.insertOne({ _id: orgId, name: 'Org A' });
});
test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  setTimeout(() => process.exit(process.exitCode || 0), 200).unref(); // restrictByPlan's cleanup interval
});

// ============================== 1. the schema itself ==============================

test('a default query does not return password / reset token / reset expiry', async () => {
  const id = await seedUser();
  const u = await User.findById(id);
  for (const k of SENSITIVE_KEYS) assert.equal(u[k], undefined, `${k} selected by default`);
  assert.ok(!allKeys(u.toObject()).has('password'));
  assertNoSecrets(u.toJSON(), 'toJSON');
});

test('lean() and populate() do not return them either', async () => {
  const id = await seedUser();
  assertNoSecrets(await User.findById(id).lean(), 'lean');
  const folderId = oid(); const companyId = oid();
  await Company.collection.insertOne({ _id: companyId, organization: orgId, name: 'Co' });
  await Folder.collection.insertOne({ _id: folderId, company: companyId, user: id, name: 'F' });
  assertNoSecrets(await Folder.findById(folderId).populate('company user').lean(), 'populate');
});

test('explicit select("+field") still returns them (what auth needs)', async () => {
  const id = await seedUser();
  const u = await User.findById(id).select('+password +passwordResetToken +passwordResetExpires');
  assert.equal(u.password, HASH);
  assert.equal(u.passwordResetToken, RESET_TOKEN_HASH);
  assert.ok(u.passwordResetExpires instanceof Date);
});

test('a query can still FILTER on the hidden fields (the token lookup in resetPassword)', async () => {
  const id = await seedUser({ passwordResetToken: 'lookup-token-xyz' });
  const u = await User.findOne({ passwordResetToken: 'lookup-token-xyz', passwordResetExpires: { $gt: new Date() } });
  assert.equal(String(u._id), String(id));
});

test('saving a user loaded WITHOUT the password neither fails validation nor wipes the password', async () => {
  const id = await seedUser();
  const u = await User.findById(id);               // password not loaded
  u.name = 'Renamed';
  await u.save();                                  // `password` is a required field for local accounts
  const raw = await rawUser(id);
  assert.equal(raw.name, 'Renamed');
  assert.equal(raw.password, HASH, 'password was wiped by an unrelated save');
  assert.equal(raw.passwordResetToken, RESET_TOKEN_HASH);
});

test('assigning a new password on a document loaded without it persists it', async () => {
  const id = await seedUser({ password: undefined });
  const u = await User.findById(id);
  u.password = await bcrypt.hash('Brand#New9', 4);
  await u.save();
  assert.ok(await bcrypt.compare('Brand#New9', (await rawUser(id)).password));
});

// ============================== 2. the endpoints you named ==============================

test('GET /folders/:id (getFolderById) does not expose the owner\'s secrets', async () => {
  const id = await seedUser(); const companyId = oid(); const folderId = oid();
  await Company.collection.insertOne({ _id: companyId, organization: orgId, name: 'Co' });
  await Folder.collection.insertOne({ _id: folderId, company: companyId, user: id, name: 'Contracts' });
  const res = makeRes();
  await folderController.getFolderById({ params: { id: String(folderId) }, user: { organization: orgId } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.user.email.endsWith('@t.test'), true, 'the folder owner\'s name/email must still be there');
  assertNoSecrets(res.body, 'getFolderById');
});

test('invoice query behind getInvoices (populate("user")) does not expose secrets', async () => {
  // invoiceController.getInvoices is overwritten by `module.exports = {...}` and is not
  // reachable from any route, so its exact query is run directly.
  assert.equal(typeof invoiceController.getInvoices, 'undefined', 'getInvoices became reachable - test it as a handler');
  const id = await seedUser();
  await Invoice.collection.insertOne({ _id: oid(), organization: orgId, user: id, deal: oid(), invoiceNumber: 'INV-1', amount: 10, status: 'Draft' });
  const invoices = await Invoice.find({ organization: orgId }).populate({ path: 'deal', populate: [{ path: 'company', select: 'name email' }] }).populate('user');
  const body = JSON.parse(JSON.stringify(invoices));
  assert.equal(body.length, 1);
  assert.equal(body[0].user.name, 'Asha');
  assertNoSecrets(body, 'getInvoices query');
});

test('task query behind getTasks (populate("users createdBy")) does not expose secrets', async () => {
  // Same situation as getInvoices: exported nowhere, so its exact query is run directly.
  assert.equal(typeof taskController.getTasks, 'undefined', 'getTasks became reachable - test it as a handler');
  const id = await seedUser();
  await Task.collection.insertOne({ _id: oid(), organization: orgId, title: 'T', status: 'Pending', users: [id], createdBy: id, dueDate: new Date() });
  const tasks = await Task.find({ organization: orgId }).populate('users createdBy');
  const body = JSON.parse(JSON.stringify(tasks));
  assert.equal(body.length, 1);
  assert.equal(body[0].createdBy.name, 'Asha');
  assertNoSecrets(body, 'getTasks query');
});

test('super-admin getTicketById does not expose the creator\'s secrets', async () => {
  const id = await seedUser(); const ticketId = oid();
  await Ticket.collection.insertOne({ _id: ticketId, subject: 'Help', description: 'd', createdBy: id, status: 'open' });
  const res = makeRes();
  await superAdminController.getTicketById({ params: { id: String(ticketId) } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.createdBy.name, 'Asha');
  assertNoSecrets(res.body, 'getTicketById');
});

test('folder list queries (by deal / by company) do not expose secrets', async () => {
  const id = await seedUser(); const companyId = oid();
  await Company.collection.insertOne({ _id: companyId, organization: orgId, name: 'Co' });
  await Folder.collection.insertOne({ _id: oid(), company: companyId, user: id, name: 'F2' });
  // exactly the query shape used by folderController's list handlers
  assertNoSecrets(await Folder.find({ company: companyId }).populate('company user').populate('deal', 'title name'), 'folder list');
});

// ============================== 3. authentication must still work ==============================

async function login(body) { const res = makeRes(); await authController.login({ body }, res, (e) => { throw e; }); return res; }

test('login: correct password succeeds, issues a token, and returns no secrets', async () => {
  const id = await seedUser();
  const email = (await rawUser(id)).email;
  const res = await login({ email, password: PASSWORD });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.ok(res.body.token || res.body.data?.token || JSON.stringify(res.body).includes('"token"'), 'no token issued');
  assertNoSecrets(res.body, 'login response');   // includes passwordResetToken, which login used to echo back
});

test('login: wrong password, unknown email and unverified email are still rejected', async () => {
  const id = await seedUser();
  const email = (await rawUser(id)).email;
  assert.equal((await login({ email, password: 'nope-nope' })).statusCode, 401);
  assert.equal((await login({ email: 'nobody@t.test', password: PASSWORD })).statusCode, 401);
  const id2 = await seedUser({ isEmailVerified: false });
  assert.equal((await login({ email: (await rawUser(id2)).email, password: PASSWORD })).statusCode, 403);
});

test('forgotPassword: a password account gets a reset email and a stored (hashed) token', async () => {
  const id = await seedUser({ passwordResetToken: undefined, passwordResetExpires: undefined });
  const email = (await rawUser(id)).email;
  sent.length = 0;
  const res = makeRes();
  await authController.forgotPassword({ body: { email } }, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(sent.length, 1, 'the reset email was not sent');
  const raw = await rawUser(id);
  assert.match(raw.passwordResetToken, /^[0-9a-f]{64}$/, 'a SHA-256 token hash must be stored');
  assert.ok(raw.passwordResetExpires > new Date());
  assert.equal(raw.password, HASH, 'forgotPassword must not touch the password');
  assert.ok(!JSON.stringify(sent[0]).includes(raw.passwordResetToken), 'the stored hash must not be what is emailed');
});

test('forgotPassword: a social/phone account (no password) is told so; an unknown email gets the generic answer', async () => {
  const id = await seedUser({ password: undefined, auth0Id: `google-oauth2|social-${oid()}`, passwordResetToken: undefined });
  const res = makeRes();
  await authController.forgotPassword({ body: { email: (await rawUser(id)).email } }, res);
  assert.equal(res.statusCode, 400);
  const res2 = makeRes();
  await authController.forgotPassword({ body: { email: 'ghost@t.test' } }, res2);
  assert.equal(res2.statusCode, 200);
  assert.match(res2.body.message, /If that email is in our system/);
});

test('reset via emailed token: sets the new password, clears the token, old password stops working', async () => {
  const id = await seedUser({ passwordResetToken: undefined, passwordResetExpires: undefined });
  const email = (await rawUser(id)).email;
  sent.length = 0;
  await authController.forgotPassword({ body: { email } }, makeRes());
  const link = JSON.stringify(sent[0]).match(/reset-password\?token=([0-9a-f]{64})/);
  assert.ok(link, 'no reset link in the email');
  const res = makeRes();
  await authController.resetPassword({ body: { token: link[1], password: 'Fresh#Pass22' } }, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const raw = await rawUser(id);
  assert.equal(raw.passwordResetToken, undefined, 'token not cleared');
  assert.equal(raw.passwordResetExpires, undefined, 'expiry not cleared');
  assert.ok(await bcrypt.compare('Fresh#Pass22', raw.password));
  assert.equal((await login({ email, password: 'Fresh#Pass22' })).statusCode, 200);
  assert.equal((await login({ email, password: PASSWORD })).statusCode, 401);
  // the token is single-use
  const again = makeRes();
  await authController.resetPassword({ body: { token: link[1], password: 'Other#Pass33' } }, again);
  assert.equal(again.statusCode, 400);
});

test('reset: an invalid or expired token is rejected', async () => {
  await seedUser({ passwordResetToken: require('node:crypto').createHash('sha256').update('expired-raw').digest('hex'), passwordResetExpires: new Date(Date.now() - 1000) });
  const res = makeRes();
  await authController.resetPassword({ body: { token: 'expired-raw', password: 'Whatever#1' } }, res);
  assert.equal(res.statusCode, 400);
  const res2 = makeRes();
  await authController.resetPassword({ body: { token: 'never-issued', password: 'Whatever#1' } }, res2);
  assert.equal(res2.statusCode, 400);
});

test('reset via verified email code (in-page flow) sets the new password', async () => {
  const id = await seedUser();
  const email = (await rawUser(id)).email;
  await TempEmailOTP.collection.insertOne({ email, otp: '123456', verified: true, expires: new Date(Date.now() + 600e3) });
  const res = makeRes();
  await authController.resetPassword({ body: { email, password: 'ViaOtp#4455' } }, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.ok(await bcrypt.compare('ViaOtp#4455', (await rawUser(id)).password));
});

test('setPassword (phone account with no password yet) saves it and password login then works', async () => {
  const phone = `+9199${Math.floor(10000000 + Math.random() * 89999999)}`;
  const id = await seedUser({ password: undefined, passwordResetToken: undefined, passwordResetExpires: undefined, phone, email: undefined });
  const reqUser = await User.findById(id);   // exactly how the auth middleware loads req.user
  const res = makeRes();
  await authController.setPassword({ user: reqUser, body: { password: 'PhonePass#77' } }, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.ok(await bcrypt.compare('PhonePass#77', (await rawUser(id)).password));
  assert.equal((await login({ phone, password: 'PhonePass#77' })).statusCode, 200);
});

test('unlinkGoogleAccount: allowed when a password exists, refused when it is the only way in; response carries no secrets', async () => {
  const withPw = await seedUser({ auth0Id: `google-oauth2|withpw-${oid()}` });
  const res = makeRes();
  await authController.unlinkGoogleAccount({ user: await User.findById(withPw) }, res);
  assert.equal(res.statusCode, 200, `a user WITH a password was refused: ${JSON.stringify(res.body)}`);
  assertNoSecrets(res.body, 'unlinkGoogleAccount');
  assert.equal((await rawUser(withPw)).auth0Id, undefined);

  const onlyGoogle = await seedUser({ auth0Id: `google-oauth2|only-${oid()}`, password: undefined, phone: undefined });
  const res2 = makeRes();
  await authController.unlinkGoogleAccount({ user: await User.findById(onlyGoogle) }, res2);
  assert.equal(res2.statusCode, 400, 'a Google-only account must not be able to lock itself out');
});

test('register retry (unverified account re-registers): new password saved, response carries no secrets', async () => {
  const id = await seedUser({ isEmailVerified: false });
  const email = (await rawUser(id)).email;
  sent.length = 0;
  const res = makeRes();
  await authController.register({ body: { fullName: 'Asha Retry', email, password: 'Retry#Pass88' } }, res);
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assertNoSecrets(res.body, 'register response');
  const raw = await rawUser(id);
  assert.ok(await bcrypt.compare('Retry#Pass88', raw.password), 'the retried password was not stored');
  assert.equal(raw.name, 'Asha Retry');
  assert.equal(raw.organization.toString(), orgId.toString(), 'register retry must not touch the organization');
});

test('select:false protects QUERIED documents only - the creation paths in the codebase never return a user they just built with a password', async () => {
  // A document built in memory still has its fields; that is by design of Mongoose.
  // What matters is that no handler serialises one. register() answers with { email }
  // only (asserted above), and userSync / the Auth0 + phone sign-up paths never set a
  // password. If a future handler returns `new User({ password })`, this documents why
  // it would leak.
  const built = new User({ name: 'In Memory', email: 'mem@t.test', organization: orgId, password: HASH });
  assert.equal(JSON.parse(JSON.stringify(built)).password, HASH);
});
