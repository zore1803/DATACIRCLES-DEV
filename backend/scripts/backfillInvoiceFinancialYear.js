// One-off migration: fill in `financialYear` on invoices saved before the field existed.
//
// Invoice numbers are now unique per organization within a financial year, enforced by a
// partial unique index on { organization, financialYear, invoiceNumber } (models/Invoice.js).
// The index only covers invoices that carry `financialYear`, so until this runs, older
// invoices are protected by the numbering logic's own checks but not by the database index.
//
// Safe to re-run. It never renames an invoice: any invoice numbers that are ALREADY duplicated
// within a financial year are listed and left without `financialYear`, so the index can still
// build. Rename those by hand, then run this again.
require("dotenv").config({ path: "../.env" });
const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);
const mongoose = require("mongoose");
const Invoice = require("../models/Invoice");
const { financialYearOf } = require("../utils/documentNumbering");

const backfillInvoiceFinancialYear = async () => {
  try {
    console.log("Connecting to Database...");
    await mongoose.connect(process.env.MONGO_URI);

    const missing = await Invoice.find({ financialYear: { $exists: false } })
      .select("_id organization invoiceNumber date")
      .lean();
    console.log(`Invoices without financialYear: ${missing.length}`);

    // Group by the key the unique index uses, to find duplicates before writing anything.
    const groups = new Map();
    for (const inv of missing) {
      const fy = financialYearOf(inv.date);
      const key = `${inv.organization}|${fy}|${inv.invoiceNumber}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ ...inv, fy });
    }
    // Also clash with invoices that already have the field.
    const existing = await Invoice.find({ financialYear: { $type: "number" } })
      .select("organization financialYear invoiceNumber")
      .lean();
    const alreadyIndexed = new Set(existing.map((e) => `${e.organization}|${e.financialYear}|${e.invoiceNumber}`));

    let updated = 0;
    const duplicates = [];
    for (const [key, invoices] of groups) {
      if (invoices.length > 1 || alreadyIndexed.has(key)) {
        duplicates.push({ key, ids: invoices.map((i) => String(i._id)) });
        continue;
      }
      const inv = invoices[0];
      await Invoice.updateOne({ _id: inv._id }, { $set: { financialYear: inv.fy } });
      updated += 1;
    }

    console.log(`Updated: ${updated}`);
    if (duplicates.length) {
      console.log(`Duplicate invoice numbers within a financial year (left unchanged): ${duplicates.length}`);
      for (const d of duplicates) console.log(`  ${d.key} -> invoices ${d.ids.join(", ")}`);
    }

    await Invoice.syncIndexes();
    console.log("Indexes synced.");
  } catch (err) {
    console.error("Backfill failed:", err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

backfillInvoiceFinancialYear();
