/*
 * Read-only. Reports duplicate document numbers per organization and financial
 * year, for the three types that do NOT yet have a unique index (Invoice already
 * has one). Run this before adding those indexes -- createIndex fails if any
 * duplicate exists.
 *
 *   node scripts/checkDocumentNumberDuplicates.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { financialYearOf } = require('../utils/documentNumbering');

const TYPES = [
  { model: '../models/quotation', numberField: 'quotationNumber', label: 'Quotation' },
  { model: '../models/ProformaInvoice', numberField: 'performaInvoiceNumber', label: 'Proforma Invoice' },
  { model: '../models/deliveryChallan', numberField: 'deliveryChallanNumber', label: 'Delivery Challan' },
];

(async () => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) { console.error('Set MONGO_URI in .env'); process.exit(1); }
  await mongoose.connect(uri);
  let total = 0;
  for (const t of TYPES) {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const Model = require(t.model);
    const docs = await Model.find({}, { organization: 1, date: 1, [t.numberField]: 1 }).lean();
    const seen = new Map();
    for (const d of docs) {
      const num = d[t.numberField];
      if (!num) continue;
      const key = `${d.organization}|${financialYearOf(d.date)}|${num}`;
      seen.set(key, [...(seen.get(key) || []), d._id]);
    }
    const dupes = [...seen.entries()].filter(([, ids]) => ids.length > 1);
    console.log(`\n${t.label}: ${docs.length} documents, ${dupes.length} duplicate number(s)`);
    dupes.forEach(([key, ids]) => {
      const [org, fy, num] = key.split('|');
      console.log(`  org ${org}  FY${fy}  ${num}  -> ${ids.length} docs: ${ids.join(', ')}`);
    });
    total += dupes.length;
  }
  console.log(total === 0
    ? '\nNo duplicates. Unique indexes can be added safely.'
    : `\n${total} duplicate group(s) must be resolved BEFORE adding unique indexes.`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
