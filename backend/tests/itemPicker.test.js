// GET /items as used by the item pickers: ?limit= &search= &isActive= &picker=true &ids=
// Runs the real controller against a throwaway in-memory MongoDB with two tenants.
// Usage: node --test tests/itemPicker.test.js
process.env.AWS_REGION ||= 'us-east-1';
process.env.AWS_ACCESS_KEY_ID ||= 'x';
process.env.AWS_SECRET_ACCESS_KEY ||= 'x';
process.env.AWS_BUCKET_NAME ||= 'test-bucket';
process.env.CLOUDFRONT_DOMAIN ||= 'example.test';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Item = require('../models/Item');
const User = require('../models/User');
const { getAllItems } = require('../controllers/itemController');

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
const callerA = (extra = {}) => ({ _id: fx.user._id, role: 'admin', organization: orgA, permissions: [], ...extra });

const list = async (query = {}, req = {}) => {
  const res = makeRes();
  await getAllItems({ user: callerA(), query, ...req }, res);
  return res;
};

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  fx.user = await new User({ name: 'Owner', email: 'o@a.test', organization: orgA, role: 'admin' }).save({ validateBeforeSave: false });

  // 30 active items for Org A, newest = highest index. Item #0 has two variants.
  const docs = Array.from({ length: 30 }, (_, i) => ({
    name: `Widget ${String(i).padStart(2, '0')}`,
    description: '<p>desc</p>',
    organization: orgA,
    user: fx.user._id,
    sellingPrice: 100 + i,
    purchasePrice: 50 + i,
    gstRate: 18,
    isActive: true,
    images: [`https://cdn.example.com/${i}.png`],
    additionalFields: [{ key: 'colour', value: 'red', type: 'text' }],
    inventory: { currentStock: i, openingStock: i },
    variants: i === 0 ? [
      { name: 'Red', sku: 'W-RED', sellingPrice: 111, stock: 3, images: ['https://cdn.example.com/v1.png'] },
      { name: 'Blue', sku: 'W-BLUE', sellingPrice: 122, stock: 4, images: ['https://cdn.example.com/v2.png'] },
    ] : [],
    createdAt: new Date(Date.now() - (30 - i) * 60000),
  }));
  fx.items = await Item.insertMany(docs);
  fx.inactive = await new Item({ name: 'Widget Retired', organization: orgA, user: fx.user._id, isActive: false, sellingPrice: 1 }).save({ validateBeforeSave: false });
  fx.other = await new Item({ name: 'Widget OtherOrg', organization: orgB, user: fx.user._id, isActive: true, sellingPrice: 1 }).save({ validateBeforeSave: false });
});
test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

// ───────────────────────── existing behaviour is unchanged ─────────────────────────

test('default (no new params): every item of the org, owner populated, full documents — as before', async () => {
  const res = await list({});
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 31, '30 active + 1 inactive, none from Org B');
  const first = res.body.find((i) => i.name === 'Widget 05');
  assert.equal(first.user.name, 'Owner', 'user is still populated');
  assert.ok(Array.isArray(first.images) && first.images.length, 'images still present');
  assert.ok(first.additionalFields.length, 'additionalFields still present');
});

test('default: search and isActive filters behave exactly as before', async () => {
  const res = await list({ search: 'retired' });
  assert.deepEqual(res.body.map((i) => i.name), ['Widget Retired']);
  const active = await list({ isActive: 'true' });
  assert.equal(active.body.length, 30);
  assert.ok(active.body.every((i) => i.isActive));
});

// ───────────────────────────── limit / search / isActive ─────────────────────────────

test('?limit=20 returns only the 20 newest items', async () => {
  const res = await list({ limit: '20', isActive: 'true' });
  assert.equal(res.body.length, 20);
  assert.equal(res.body[0].name, 'Widget 29', 'newest first');
  assert.equal(res.body[19].name, 'Widget 10');
});

test('?limit is capped at 100 and ignored when invalid', async () => {
  const many = await Promise.all(
    Array.from({ length: 80 }, (_, i) => new Item({ name: `Bulk ${i}`, organization: orgA, isActive: true, sellingPrice: 1 }).save({ validateBeforeSave: false }))
  );
  assert.equal(many.length, 80);
  const capped = await list({ limit: '5000' });
  assert.equal(capped.body.length, 100, 'capped at MAX_PICKER_LIMIT');
  const unbounded = await list({ limit: 'abc' });
  assert.equal(unbounded.body.length, 111, 'invalid limit = no limit, as before');
  await Item.deleteMany({ name: /^Bulk / });
});

test('search + limit: typing finds items outside the first page', async () => {
  const res = await list({ search: 'Widget 03', limit: '20', isActive: 'true' });
  assert.deepEqual(res.body.map((i) => i.name), ['Widget 03']);
});

test('isActive=true leaves out retired items; other orgs never appear', async () => {
  const res = await list({ search: 'widget', limit: '100', isActive: 'true' });
  assert.equal(res.body.length, 30);
  assert.ok(!res.body.some((i) => i.name === 'Widget Retired'));
  assert.ok(!res.body.some((i) => i.name === 'Widget OtherOrg'));
});

// ───────────────────────────────── picker mode ─────────────────────────────────

test('picker=true: drops images / additionalFields and skips the user populate; keeps what a line needs', async () => {
  const res = await list({ picker: 'true', limit: '100', isActive: 'true' });
  const it = res.body.find((i) => i.name === 'Widget 00');
  assert.equal(it.images, undefined, 'no image list');
  assert.equal(it.additionalFields, undefined, 'no custom field values');
  assert.equal(it.variants[0].images, undefined, 'no variant image lists');
  assert.ok(!it.user || typeof it.user !== 'object' || !('name' in it.user), 'user is not populated');
  // everything the pickers read to build a line is still there
  assert.equal(it.name, 'Widget 00');
  assert.equal(it.description, '<p>desc</p>');
  assert.equal(it.sellingPrice, 100);
  assert.equal(it.purchasePrice, 50);
  assert.equal(it.gstRate, 18);
  assert.equal(it.isActive, true);
  assert.equal(it.inventory.currentStock, 0);
  assert.deepEqual(it.variants.map((v) => [v.name, v.sku, v.sellingPrice, v.stock]), [['Red', 'W-RED', 111, 3], ['Blue', 'W-BLUE', 122, 4]]);
  assert.ok(it.variants.every((v) => v._id), 'variant ids are kept (lines key off them)');
  assert.ok(it._id);
});

test('picker=true response is smaller than the full payload for the same items', async () => {
  const full = JSON.stringify((await list({ limit: '30', isActive: 'true' })).body).length;
  const slim = JSON.stringify((await list({ limit: '30', isActive: 'true', picker: 'true' })).body).length;
  assert.ok(slim < full, `slim ${slim} should be smaller than full ${full}`);
});

test('picker is only on for the exact value "true"', async () => {
  const res = await list({ picker: 'yes', limit: '1' });
  assert.ok(res.body[0].images, 'not picker mode -> full document');
});

// ──────────────────────────────────── ids lookup ────────────────────────────────────

test('?ids= returns exactly those items (how a saved document re-loads its products)', async () => {
  const a = fx.items[5]._id, b = fx.items[7]._id;
  const res = await list({ ids: `${a},${b}`, picker: 'true' });
  assert.deepEqual(res.body.map((i) => String(i._id)).sort(), [String(a), String(b)].sort());
});

test('?ids= accepts a VARIANT id and returns its parent item', async () => {
  const variantId = fx.items[0].variants[1]._id;
  const res = await list({ ids: String(variantId), picker: 'true' });
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].name, 'Widget 00');
});

test('?ids= composes with isActive: a retired product is not returned (so a line for it behaves as before)', async () => {
  const res = await list({ ids: `${fx.inactive._id},${fx.items[1]._id}`, isActive: 'true', picker: 'true' });
  assert.deepEqual(res.body.map((i) => i.name), ['Widget 01']);
});

test('?ids= ignores invalid ids, and an empty / all-invalid list returns nothing (never the whole catalog)', async () => {
  const mixed = await list({ ids: `not-an-id,${fx.items[2]._id},{"$ne":1}`, picker: 'true' });
  assert.deepEqual(mixed.body.map((i) => i.name), ['Widget 02']);
  assert.deepEqual((await list({ ids: '' })).body, []);
  assert.deepEqual((await list({ ids: 'x,y,z' })).body, []);
});

test('?ids= can never reach another organization\'s item', async () => {
  const res = await list({ ids: `${fx.other._id},${fx.items[3]._id}`, picker: 'true' });
  assert.deepEqual(res.body.map((i) => i.name), ['Widget 03']);
});

test('?ids= with a search: both must match', async () => {
  const res = await list({ ids: `${fx.items[4]._id},${fx.items[8]._id}`, search: 'Widget 08', picker: 'true' });
  assert.deepEqual(res.body.map((i) => i.name), ['Widget 08']);
});

// ─────────────────────────────── own-only users ───────────────────────────────

test('own-only users still only see their own items in picker mode', async () => {
  const stranger = await new Item({ name: 'Widget Stranger', organization: orgA, user: oid(), isActive: true, sellingPrice: 1 }).save({ validateBeforeSave: false });
  const res = await list({ search: 'Widget', picker: 'true', limit: '100', isActive: 'true' }, { ownOnly: true });
  assert.ok(res.body.length >= 30);
  assert.ok(!res.body.some((i) => i.name === 'Widget Stranger'));
  await Item.deleteOne({ _id: stranger._id });
});

// ──────────── the frontend helper (src/utils/itemPicker.js) <-> this endpoint ────────────

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const loadHelper = () => import(pathToFileURL(path.join(__dirname, '../../frontend/src/utils/itemPicker.js')).href);

test('helper: first page params = newest 20 active items in picker mode, no search key', async () => {
  const { itemPickerParams } = await loadHelper();
  assert.deepEqual(itemPickerParams(''), { limit: 20, isActive: 'true', picker: 'true' });
  assert.deepEqual(itemPickerParams(), { limit: 20, isActive: 'true', picker: 'true' });
});

test('helper: search is trimmed; blank / non-string search is dropped', async () => {
  const { itemPickerParams } = await loadHelper();
  assert.equal(itemPickerParams('  shirt  ').search, 'shirt');
  assert.ok(!('search' in itemPickerParams('   ')));
  assert.ok(!('search' in itemPickerParams(null)));
  assert.ok(!('search' in itemPickerParams({ $ne: 1 })));
});

test('helper: limit grows by the lines already on the bill, never past the server cap of 100', async () => {
  const { itemPickerParams } = await loadHelper();
  assert.equal(itemPickerParams('', { alreadyPicked: 5 }).limit, 25);
  assert.equal(itemPickerParams('', { alreadyPicked: 500 }).limit, 100);
  assert.equal(itemPickerParams('', { alreadyPicked: -3 }).limit, 20);
  assert.equal(itemPickerParams('', { alreadyPicked: 'x' }).limit, 20);
});

test('helper: itemsByIdsParams dedupes, drops blanks, caps at 100, and is null when there is nothing to ask', async () => {
  const { itemsByIdsParams } = await loadHelper();
  assert.equal(itemsByIdsParams([]), null);
  assert.equal(itemsByIdsParams([null, undefined, '']), null);
  assert.deepEqual(itemsByIdsParams(['a', 'b', 'a', null]), { ids: 'a,b', isActive: 'true', picker: 'true' });
  const many = Array.from({ length: 250 }, (_, i) => `id${i}`);
  assert.equal(itemsByIdsParams(many).ids.split(',').length, 100);
});

test('helper: itemsFromResponse returns the array, or [] for anything else', async () => {
  const { itemsFromResponse } = await loadHelper();
  assert.deepEqual(itemsFromResponse({ data: [1, 2] }), [1, 2]);
  assert.deepEqual(itemsFromResponse({ data: { items: [3] } }), []);
  assert.deepEqual(itemsFromResponse({ data: { message: 'x' } }), []);
  assert.deepEqual(itemsFromResponse(undefined), []);
});

test('contract: what the picker actually sends, run through the real endpoint', async () => {
  const { itemPickerParams, itemsByIdsParams } = await loadHelper();

  // open the picker
  const open = await list(itemPickerParams(''));
  assert.equal(open.body.length, 20);
  assert.ok(open.body.every((i) => i.isActive));
  assert.ok(open.body.every((i) => i.images === undefined), 'picker mode');

  // type a search — finds an old item that is NOT in the first 20
  const typed = await list(itemPickerParams('Widget 01'));
  assert.deepEqual(typed.body.map((i) => i.name), ['Widget 01']);

  // a bill that already holds 3 of the matches: the list is not left short
  const withBill = await list(itemPickerParams('Widget', { alreadyPicked: 3 }));
  assert.equal(withBill.body.length, 23);

  // re-load the products on a saved document (one item id, one variant id)
  const lines = await list(itemsByIdsParams([String(fx.items[9]._id), String(fx.items[0].variants[0]._id)]));
  assert.deepEqual(lines.body.map((i) => i.name).sort(), ['Widget 00', 'Widget 09']);
});
