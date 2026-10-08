// frontend/src/utils/recordPick.js — the logic the quotation / pro forma / invoice forms use after
// a company or contact is picked, now that those forms no longer hold the full lists.
// Pure logic, tested with a fake fetch (no browser, no database).
// Usage: node --test tests/recordPick.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '../../frontend/src/utils/recordPick.js')).href);

// A fake "GET /{kind}/{id}" that counts calls and can be slow or failing.
const makeFetcher = (data, { delayMs = 0, failFor = [] } = {}) => {
  const calls = [];
  const fetchById = async (kind, id) => {
    calls.push(`${kind}/${id}`);
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    if (failFor.includes(`${kind}/${id}`)) throw new Error('404');
    return data[`${kind}/${id}`];
  };
  return { fetchById, calls };
};

const ACME = { _id: 'c1', name: 'Acme', gstin: '27AAAAA0000A1Z5', billingAddress: { city: 'Pune' } };
const GLOBEX = { _id: 'c2', name: 'Globex', gstin: '29BBBBB1111B1Z5' };
const ALICE = { _id: 'p1', name: 'Alice', company: { _id: 'c1', name: 'Acme' } };      // list row: company is populated
const BOB = { _id: 'p2', name: 'Bob', company: 'c2' };                                  // detail row: bare company id
const LONE = { _id: 'p3', name: 'Lone' };                                               // no company
const DATA = { 'companies/c1': ACME, 'companies/c2': GLOBEX, 'contacts/p1': ALICE, 'contacts/p2': BOB, 'contacts/p3': LONE };

// ───────────────────────────── companyIdOf ─────────────────────────────

test('companyIdOf: populated company, bare id, none', async () => {
  const { companyIdOf } = await load();
  assert.equal(companyIdOf(ALICE), 'c1');
  assert.equal(companyIdOf(BOB), 'c2');
  assert.equal(companyIdOf(LONE), '');
  assert.equal(companyIdOf(null), '');
  assert.equal(companyIdOf({ company: null }), '');
});

// ───────────────────────────── the cache ─────────────────────────────

test('cache: get() fetches once, then serves from memory', async () => {
  const { createRecordCache } = await load();
  const { fetchById, calls } = makeFetcher(DATA);
  const cache = createRecordCache(fetchById);
  assert.deepEqual(await cache.get('companies', 'c1'), ACME);
  assert.deepEqual(await cache.get('companies', 'c1'), ACME);
  assert.deepEqual(cache.peek('companies', 'c1'), ACME);
  assert.deepEqual(calls, ['companies/c1']);
});

test('cache: remember() makes later reads free; peek() never fetches', async () => {
  const { createRecordCache } = await load();
  const { fetchById, calls } = makeFetcher(DATA);
  const cache = createRecordCache(fetchById);
  assert.equal(cache.peek('contacts', 'p1'), null);
  cache.remember('contacts', ALICE);
  assert.deepEqual(await cache.get('contacts', 'p1'), ALICE);
  assert.equal(calls.length, 0);
});

test('cache: companies and contacts are separate namespaces even for the same id', async () => {
  const { createRecordCache } = await load();
  const cache = createRecordCache(async () => null);
  cache.remember('companies', { _id: 'same', name: 'A company' });
  assert.equal(cache.peek('contacts', 'same'), null);
});

test('cache: simultaneous get() calls for one record share a single request', async () => {
  const { createRecordCache } = await load();
  const { fetchById, calls } = makeFetcher(DATA, { delayMs: 30 });
  const cache = createRecordCache(fetchById);
  const results = await Promise.all([cache.get('companies', 'c1'), cache.get('companies', 'c1'), cache.get('companies', 'c1')]);
  assert.ok(results.every((r) => r === results[0]));
  assert.equal(calls.length, 1);
});

test('cache: a failed fetch resolves to null (never throws) and is retried next time', async () => {
  const { createRecordCache } = await load();
  let fail = true;
  const cache = createRecordCache(async () => { if (fail) throw new Error('boom'); return ACME; });
  assert.equal(await cache.get('companies', 'c1'), null);
  fail = false;
  assert.deepEqual(await cache.get('companies', 'c1'), ACME, 'a transient failure is not remembered');
});

test('cache: empty id and a fetch that returns nothing both give null', async () => {
  const { createRecordCache } = await load();
  const cache = createRecordCache(async () => undefined);
  assert.equal(await cache.get('companies', ''), null);
  assert.equal(await cache.get('companies', null), null);
  assert.equal(await cache.get('companies', 'x'), null);
});

// ───────────────────────────── resolveCompanyPick ─────────────────────────────

test('company pick: the row handed back by the dropdown is used as-is — no request at all', async () => {
  const { createRecordCache, resolveCompanyPick } = await load();
  const { fetchById, calls } = makeFetcher(DATA);
  const records = createRecordCache(fetchById);
  const out = await resolveCompanyPick(records, 'c1', { record: ACME });
  assert.deepEqual(out.company, ACME);
  assert.equal(out.keepContact, false, 'no contact on the form');
  assert.equal(calls.length, 0);
});

test('company pick: without a row it loads the company by id (once)', async () => {
  const { createRecordCache, resolveCompanyPick } = await load();
  const { fetchById, calls } = makeFetcher(DATA);
  const records = createRecordCache(fetchById);
  const out = await resolveCompanyPick(records, 'c2');
  assert.deepEqual(out.company, GLOBEX);
  assert.deepEqual(calls, ['companies/c2']);
});

test('company pick: the current contact is KEPT when it belongs to the chosen company', async () => {
  const { createRecordCache, resolveCompanyPick } = await load();
  const records = createRecordCache(makeFetcher(DATA).fetchById);
  records.remember('contacts', ALICE);                                  // Alice works at Acme (c1)
  const out = await resolveCompanyPick(records, 'c1', { record: ACME, currentContactId: 'p1' });
  assert.equal(out.keepContact, true);
});

test('company pick: the current contact is DROPPED when it belongs to a different company', async () => {
  const { createRecordCache, resolveCompanyPick } = await load();
  const records = createRecordCache(makeFetcher(DATA).fetchById);
  records.remember('contacts', ALICE);
  const out = await resolveCompanyPick(records, 'c2', { record: GLOBEX, currentContactId: 'p1' });
  assert.equal(out.keepContact, false);
});

test('company pick: a contact with no company is dropped; an unknown contact is dropped (not an error)', async () => {
  const { createRecordCache, resolveCompanyPick } = await load();
  const { fetchById } = makeFetcher(DATA, { failFor: ['contacts/ghost'] });
  const records = createRecordCache(fetchById);
  assert.equal((await resolveCompanyPick(records, 'c1', { record: ACME, currentContactId: 'p3' })).keepContact, false);
  assert.equal((await resolveCompanyPick(records, 'c1', { record: ACME, currentContactId: 'ghost' })).keepContact, false);
});

test('company pick: the contact check loads an uncached contact by id (a saved document that was just opened)', async () => {
  const { createRecordCache, resolveCompanyPick } = await load();
  const { fetchById, calls } = makeFetcher(DATA);
  const records = createRecordCache(fetchById);
  const out = await resolveCompanyPick(records, 'c2', { record: GLOBEX, currentContactId: 'p2' });   // Bob works at Globex
  assert.equal(out.keepContact, true);
  assert.deepEqual(calls, ['contacts/p2']);
});

test('company pick: clearing the company (empty id) yields no company and drops the contact', async () => {
  const { createRecordCache, resolveCompanyPick } = await load();
  const { fetchById, calls } = makeFetcher(DATA);
  const out = await resolveCompanyPick(createRecordCache(fetchById), '', { currentContactId: 'p1' });
  assert.deepEqual(out, { company: null, keepContact: false });
  assert.equal(calls.length, 0);
});

// ───────────────────────────── resolveContactPick ─────────────────────────────

test('contact pick: reads the contact\'s company id from the row and loads that company (list rows carry only its name)', async () => {
  const { createRecordCache, resolveContactPick } = await load();
  const { fetchById, calls } = makeFetcher(DATA);
  const out = await resolveContactPick(createRecordCache(fetchById), 'p1', { record: ALICE });
  assert.equal(out.contactCompanyId, 'c1');
  assert.deepEqual(out.company, ACME, 'the full company (with its address) is loaded by id');
  assert.deepEqual(calls, ['companies/c1']);
});

test('contact pick: needCompany=false (a company is already chosen) skips the company request', async () => {
  const { createRecordCache, resolveContactPick } = await load();
  const { fetchById, calls } = makeFetcher(DATA);
  const out = await resolveContactPick(createRecordCache(fetchById), 'p1', { record: ALICE, needCompany: false });
  assert.equal(out.contactCompanyId, 'c1');
  assert.equal(out.company, null);
  assert.equal(calls.length, 0);
});

test('contact pick: without a row it loads the contact by id; a contact with no company has none', async () => {
  const { createRecordCache, resolveContactPick } = await load();
  const { fetchById, calls } = makeFetcher(DATA);
  const records = createRecordCache(fetchById);
  const bob = await resolveContactPick(records, 'p2');
  assert.equal(bob.contactCompanyId, 'c2');
  assert.deepEqual(bob.company, GLOBEX);
  const lone = await resolveContactPick(records, 'p3');
  assert.equal(lone.contactCompanyId, '');
  assert.equal(lone.company, null);
  assert.deepEqual(calls, ['contacts/p2', 'companies/c2', 'contacts/p3']);
});

test('contact pick: a company that cannot be loaded gives company = null but still reports the id', async () => {
  const { createRecordCache, resolveContactPick } = await load();
  const { fetchById } = makeFetcher(DATA, { failFor: ['companies/c1'] });
  const out = await resolveContactPick(createRecordCache(fetchById), 'p1', { record: ALICE });
  assert.equal(out.contactCompanyId, 'c1');
  assert.equal(out.company, null);
});

test('contact pick: clearing the contact (empty id) is a no-op', async () => {
  const { createRecordCache, resolveContactPick } = await load();
  const { fetchById, calls } = makeFetcher(DATA);
  const out = await resolveContactPick(createRecordCache(fetchById), '');
  assert.deepEqual(out, { contact: null, contactCompanyId: '', company: null });
  assert.equal(calls.length, 0);
});
