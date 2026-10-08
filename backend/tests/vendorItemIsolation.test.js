// Runs the real vendor / payment / item controllers (and the item bulk-import
// route handler) against a throwaway in-memory MongoDB with two tenants.
// Usage: node --test tests/vendorItemIsolation.test.js
// Dummy env so route/controller modules load; nothing here talks to those services.
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

const Vendor = require('../models/Vendor');
const Item = require('../models/Item');
const Payment = require('../models/Payment');
const User = require('../models/User');
const vendorController = require('../controllers/vendorController');
const itemController = require('../controllers/itemController');
const itemRouter = require('../routes/itemRoutes');
const { stripServerFields } = require('../utils/safeBody');

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
const userA = () => ({ _id: fx.userA._id, id: String(fx.userA._id), role: 'admin', organization: orgA, permissions: [] });

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  fx.userA = await save(User, { name: 'A admin', email: 'a@a.test', organization: orgA, role: 'admin' });
  fx.userB = await save(User, { name: 'B admin', email: 'b@b.test', organization: orgB, role: 'admin' });
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  // Requiring the item routes loads app modules that keep timers/sockets open.
  setTimeout(() => process.exit(process.exitCode || 0), 200).unref();
});

const call = async (fn, req) => {
  const res = makeRes();
  await fn({ user: userA(), body: {}, params: {}, ...req }, res);
  return res;
};
const newVendor = (org, extra = {}) => save(Vendor, { name: 'V', organization: org, user: fx.userB._id, ...extra });

// ───────────────────────────── helper ─────────────────────────────

test('safeBody: removes listed fields; dotted keys only when asked', () => {
  const d = stripServerFields({ a: 1, _id: 2, 'x.y': 3, ok: 4 }, ['_id']);
  assert.deepEqual(d, { a: 1, 'x.y': 3, ok: 4 });
  assert.deepEqual(stripServerFields({ a: 1, 'x.y': 3 }, [], { dropDotted: true }), { a: 1 });
  assert.equal(stripServerFields(null), null);
});

// ───────────────────────────── vendor ─────────────────────────────

test('vendor create: normal create works; organization/user come from the server', async () => {
  const res = await call(vendorController.createVendor, {
    body: { name: 'Plain', organization: String(orgB), user: String(fx.userB._id), _id: String(oid()) },
  });
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  const saved = await Vendor.findById(res.body._id);
  assert.equal(saved.name, 'Plain');
  assert.equal(String(saved.organization), String(orgA));
  assert.equal(String(saved.user), String(fx.userA._id));
});

test('vendor update: a legitimate update works', async () => {
  const v = await newVendor(orgA);
  const res = await call(vendorController.updateVendor, { params: { id: String(v._id) }, body: { name: 'Renamed', phone: '123' } });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const fresh = await Vendor.findById(v._id);
  assert.equal(fresh.name, 'Renamed');
  assert.equal(fresh.phone, '123');
});

test('vendor update: organization / user / _id in the body are ignored', async () => {
  const v = await newVendor(orgA, { user: fx.userA._id });
  const otherId = oid();
  const res = await call(vendorController.updateVendor, {
    params: { id: String(v._id) },
    body: { name: 'Hijack', organization: String(orgB), user: String(fx.userB._id), _id: String(otherId) },
  });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const fresh = await Vendor.findById(v._id);
  assert.equal(String(fresh.organization), String(orgA), 'vendor must not move tenants');
  assert.equal(String(fresh.user), String(fx.userA._id));
  assert.equal(String(fresh._id), String(v._id));
  assert.equal(await Vendor.countDocuments({ _id: otherId }), 0);
  assert.equal(fresh.name, 'Hijack', 'the legitimate field still updates');
});

test("vendor update: Org A cannot update Org B's vendor", async () => {
  const vB = await newVendor(orgB, { name: 'B private' });
  const res = await call(vendorController.updateVendor, { params: { id: String(vB._id) }, body: { name: 'pwned', organization: String(orgA) } });
  assert.equal(res.statusCode, 404);
  const fresh = await Vendor.findById(vB._id);
  assert.equal(fresh.name, 'B private');
  assert.equal(String(fresh.organization), String(orgB));
});

test('vendor bulk import: spoofed organization/user/_id ignored; bad rows skipped, not a 500', async () => {
  const chosen = oid();
  const res = await call(vendorController.bulkImportVendors, {
    body: {
      vendors: [
        { name: 'Imp', organization: String(orgB), user: String(fx.userB._id), _id: String(chosen), phone: '1' },
        null,
        { name: { $ne: null } },
        'str',
      ],
    },
  });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.imported, 1);
  assert.equal(res.body.skipped, 3);
  const saved = await Vendor.findOne({ name: 'Imp' });
  assert.equal(String(saved.organization), String(orgA));
  assert.equal(String(saved.user), String(fx.userA._id));
  assert.notEqual(String(saved._id), String(chosen));
});

// ───────────────────────────── vendor payments ─────────────────────────────

const validPayment = { amount: 100, paymentType: 'Cash', direction: 'OUT' };

test('payment create: normal create works; server-managed fields are not client-settable', async () => {
  const v = await newVendor(orgA);
  const res = await call(vendorController.addPaymentForVendor, {
    params: { vendorId: String(v._id) },
    body: {
      ...validPayment, notes: 'ok',
      organization: String(orgB), user: String(fx.userB._id), allocatedAmount: 99999, isDocumentPayment: true,
      party: String(oid()), partyType: 'Company', vendor: String(oid()),
    },
  });
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  const p = await Payment.findById(res.body._id);
  assert.equal(p.amount, 100);
  assert.equal(p.notes, 'ok');
  assert.equal(String(p.organization), String(orgA));
  assert.equal(String(p.user), String(fx.userA._id));
  assert.equal(String(p.vendor), String(v._id));
  assert.equal(p.allocatedAmount, 0);
  assert.equal(p.isDocumentPayment, false);
  assert.equal(String(p.party), String(v._id), 'party is forced to this vendor');
  assert.equal(p.partyType, 'Vendor');
});

test("payment create: a payment cannot be added to Org B's vendor", async () => {
  const vB = await newVendor(orgB);
  const before = await Payment.countDocuments({});
  const res = await call(vendorController.addPaymentForVendor, { params: { vendorId: String(vB._id) }, body: validPayment });
  assert.equal(res.statusCode, 404);
  assert.equal(await Payment.countDocuments({}), before);
});

test('payment update: legitimate edit works; organization / vendor / user / party / allocation cannot be changed', async () => {
  const v = await newVendor(orgA);
  const vB = await newVendor(orgB);
  const p = await save(Payment, { ...validPayment, vendor: v._id, party: v._id, partyType: 'Vendor', user: fx.userA._id, organization: orgA });
  const res = await call(vendorController.updatePayment, {
    params: { vendorId: String(v._id), paymentId: String(p._id) },
    body: {
      amount: 250, notes: 'edited',
      organization: String(orgB), vendor: String(vB._id), user: String(fx.userB._id),
      party: String(vB._id), partyType: 'Company', allocatedAmount: 250, isDocumentPayment: true, _id: String(oid()),
    },
  });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const fresh = await Payment.findById(p._id);
  assert.equal(fresh.amount, 250);
  assert.equal(fresh.notes, 'edited');
  assert.equal(String(fresh.organization), String(orgA));
  assert.equal(String(fresh.vendor), String(v._id));
  assert.equal(String(fresh.user), String(fx.userA._id));
  assert.equal(String(fresh.party), String(v._id));
  assert.equal(fresh.partyType, 'Vendor');
  assert.equal(fresh.allocatedAmount, 0);
  assert.equal(fresh.isDocumentPayment, false);
});

test("payment update: Org A cannot edit Org B's payment", async () => {
  const vB = await newVendor(orgB);
  const p = await save(Payment, { ...validPayment, vendor: vB._id, organization: orgB });
  const res = await call(vendorController.updatePayment, {
    params: { vendorId: String(vB._id), paymentId: String(p._id) },
    body: { amount: 1 },
  });
  assert.equal(res.statusCode, 404);
  assert.equal((await Payment.findById(p._id)).amount, 100);
});

// ───────────────────────────── item ─────────────────────────────

const newItem = (org, extra = {}) => save(Item, { name: 'It', organization: org, user: fx.userB._id, ...extra });

test('item create: normal create works; organization/user/_id/timestamps from the server', async () => {
  const chosen = oid();
  const res = await call(itemController.createItem, {
    body: {
      name: 'Widget', sellingPrice: '10', purchasePrice: '5',
      organization: String(orgB), user: String(fx.userB._id), _id: String(chosen),
      'inventory.currentStock': 5000,
    },
  });
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  const saved = await Item.findById(res.body._id);
  assert.equal(saved.name, 'Widget');
  assert.equal(saved.sellingPrice, 10);
  assert.equal(String(saved.organization), String(orgA));
  assert.equal(String(saved.user), String(fx.userA._id));
  assert.notEqual(String(saved._id), String(chosen));
  assert.equal(saved.inventory.currentStock, 0, 'stock cannot be set via a dotted key');
});

test('item create: opening stock through the supported inventory object still works', async () => {
  const res = await call(itemController.createItem, {
    body: { name: 'Stocked', inventory: JSON.stringify({ openingStock: 7 }) },
  });
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  const saved = await Item.findById(res.body._id);
  assert.equal(saved.inventory.openingStock, 7);
  assert.equal(saved.inventory.currentStock, 7);
});

test('item update: a legitimate update works (including the inventory settings object)', async () => {
  const item = await newItem(orgA, { inventory: { currentStock: 12, openingStock: 12, lowStockThreshold: 0 } });
  const res = await call(itemController.updateItem, {
    params: { id: String(item._id) },
    body: { name: 'Renamed', sellingPrice: '99', inventory: JSON.stringify({ lowStockThreshold: 3 }) },
  });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const fresh = await Item.findById(item._id);
  assert.equal(fresh.name, 'Renamed');
  assert.equal(fresh.sellingPrice, 99);
  assert.equal(fresh.inventory.lowStockThreshold, 3);
  assert.equal(fresh.inventory.currentStock, 12, 'stock untouched');
});

test('item update: dotted inventory keys cannot overwrite stock; organization / _id are ignored', async () => {
  const item = await newItem(orgA, { inventory: { currentStock: 12, openingStock: 12, lowStockThreshold: 0 } });
  const otherId = oid();
  const res = await call(itemController.updateItem, {
    params: { id: String(item._id) },
    body: {
      name: 'Hijack',
      'inventory.currentStock': 99999, 'inventory.openingStock': 99999,
      organization: String(orgB), _id: String(otherId),
    },
  });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const fresh = await Item.findById(item._id);
  assert.equal(fresh.inventory.currentStock, 12);
  assert.equal(fresh.inventory.openingStock, 12);
  assert.equal(String(fresh.organization), String(orgA));
  assert.equal(String(fresh._id), String(item._id));
  assert.equal(await Item.countDocuments({ _id: otherId }), 0);
  assert.equal(fresh.name, 'Hijack', 'the legitimate field still updates');
});

test("item update: Org A cannot update Org B's item", async () => {
  const iB = await newItem(orgB, { name: 'B private' });
  const res = await call(itemController.updateItem, { params: { id: String(iB._id) }, body: { name: 'pwned', organization: String(orgA) } });
  assert.equal(res.statusCode, 404);
  const fresh = await Item.findById(iB._id);
  assert.equal(fresh.name, 'B private');
  assert.equal(String(fresh.organization), String(orgB));
});

const bulkImport = itemRouter.stack.find((l) => l.route?.path === '/bulk-import' && l.route.methods.post).route.stack.at(-1).handle;

test('item bulk import: normal rows import; spoofed organization/user/_id/inventory/variants ignored; bad rows skipped', async () => {
  const chosen = oid();
  const res = makeRes();
  await bulkImport({
    user: userA(),
    body: {
      items: [
        { name: 'Imp1', sellingPrice: '3', organization: String(orgB), user: String(fx.userB._id), _id: String(chosen),
          inventory: { currentStock: 5000, openingStock: 5000 }, variants: [{ name: 'v', stock: 900 }] },
        { name: 'Imp2' },
        null,
        { name: { $ne: null } },
      ],
    },
  }, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.imported, 2);
  const saved = await Item.findOne({ name: 'Imp1' });
  assert.equal(saved.sellingPrice, 3);
  assert.equal(String(saved.organization), String(orgA));
  assert.equal(String(saved.user), String(fx.userA._id));
  assert.notEqual(String(saved._id), String(chosen));
  assert.equal(saved.inventory.currentStock, 0);
  assert.equal(saved.variants.length, 0);
});
