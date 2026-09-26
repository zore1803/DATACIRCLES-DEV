// Backfills the money rows behind payments/refunds that were recorded ON a
// document before the two payment systems were unified.
//
// Until Stage 1, recording a payment on a Purchase only pushed a subdocument
// into Purchase.payments[] — no Payment row, no PaymentAllocation. So a bill
// could read "Paid ₹10,000" while its vendor's Total Given stayed at ₹0.
// Stage 3 added the same thing on Purchase Return refunds. New payments/refunds
// now go through paymentAllocationService.recordDocumentPayment; this script
// gives the same treatment to everything already on file.
//
// For every <document>.payments[] subdoc with no PaymentAllocation pointing at
// it, this creates:
//   Purchase        -> Payment direction OUT (Gave), party = the bill's vendor
//   PurchaseReturn  -> Payment direction IN  (Got),  party = the return's vendor
//   plus a PaymentAllocation Payment -> document, documentPaymentId = that subdoc
// each flagged isDocumentPayment.
//
// The documents themselves are NOT touched: the subdoc already exists and the
// status it produced is already correct, so nothing is pushed, recomputed or
// re-saved. That is what makes this safe to run twice — the second run finds
// an allocation for every subdoc and writes nothing.
//
// Usage (from backend/):
//   node scripts/backfillDocumentPayments.js                  # dry run, both types
//   node scripts/backfillDocumentPayments.js --apply          # write
//   node scripts/backfillDocumentPayments.js --apply --org <organizationId>
//   node scripts/backfillDocumentPayments.js --only Purchase        # one type only
//   node scripts/backfillDocumentPayments.js --only PurchaseReturn

require("dotenv").config();
const mongoose = require("mongoose");

const Purchase = require("../models/Purchase");
const PurchaseReturn = require("../models/PurchaseReturn");
const Payment = require("../models/Payment");
const PaymentAllocation = require("../models/PaymentAllocation");

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const orgFlag = args.indexOf("--org");
const ORG_ID = orgFlag !== -1 ? args[orgFlag + 1] : null;
const onlyFlag = args.indexOf("--only");
const ONLY = onlyFlag !== -1 ? args[onlyFlag + 1] : null;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Payment.paymentType now carries the same enum as the documents' own
// paymentMethod, so a method maps across unchanged. Anything unrecognised (or
// missing on an old row) becomes "Other" rather than failing validation.
const VALID = new Set([
  "Card", "Cash", "Cheque", "EMI", "Net Banking", "UPI",
  "NEFT", "RTGS", "IMPS", "TDS", "Other",
]);
const toPaymentType = (method) => (VALID.has(method) ? method : "Other");

// One entry per document type that carries a payments[] array. `direction` is
// what makes a bill payment "Gave" (OUT) and a return refund "Got" (IN) on the
// vendor's page — the single thing that differs between the two.
const CONFIGS = [
  {
    documentType: "Purchase",
    model: Purchase,
    direction: "OUT",
    numberField: "purchaseNumber",
    label: "purchase",
  },
  {
    documentType: "PurchaseReturn",
    model: PurchaseReturn,
    direction: "IN",
    numberField: "returnNumber",
    label: "purchase return",
  },
];

async function backfillType(cfg) {
  const filter = { "payments.0": { $exists: true } };
  if (ORG_ID) filter.organization = ORG_ID;

  const docs = await cfg.model
    .find(filter)
    .select(`_id ${cfg.numberField} vendor organization user payments createdAt`)
    .lean();
  console.log(`\n[${cfg.documentType}] Scanning ${docs.length} ${cfg.label}(s) with payments...`);

  let created = 0;
  let skippedLinked = 0;
  let skippedNoVendor = 0;
  let totalAmount = 0;

  for (const doc of docs) {
    for (const subdoc of doc.payments || []) {
      const existing = await PaymentAllocation.findOne({
        documentType: cfg.documentType,
        document: doc._id,
        documentPaymentId: subdoc._id,
      }).lean();

      if (existing) {
        skippedLinked += 1;
        continue;
      }

      // A document with no vendor can't be attributed to anyone's ledger. Left
      // alone and reported rather than guessed at.
      if (!doc.vendor) {
        skippedNoVendor += 1;
        console.warn(`  ! ${doc[cfg.numberField] || doc._id}: payment ${subdoc._id} has no vendor — skipped`);
        continue;
      }

      const amount = round2(subdoc.amount);
      if (!Number.isFinite(amount) || amount <= 0) continue;

      totalAmount += amount;
      created += 1;

      if (!APPLY) {
        console.log(`  would create: ${doc[cfg.numberField] || doc._id} · ${cfg.direction} · ₹${amount.toFixed(2)} · ${subdoc.paymentMethod || "Other"}`);
        continue;
      }

      const payment = await Payment.create({
        vendor: doc.vendor,
        partyType: "Vendor",
        party: doc.vendor,
        amount,
        allocatedAmount: amount,
        paymentDate: subdoc.paymentDate || doc.createdAt || new Date(),
        paymentType: toPaymentType(subdoc.paymentMethod),
        reference: subdoc.reference || "",
        notes: subdoc.notes || "",
        direction: cfg.direction,
        isDocumentPayment: true,
        user: subdoc.recordedBy || doc.user,
        organization: doc.organization,
      });

      await PaymentAllocation.create({
        payment: payment._id,
        documentType: cfg.documentType,
        document: doc._id,
        documentPaymentId: subdoc._id,
        amount,
        organization: doc.organization,
        user: subdoc.recordedBy || doc.user,
      });
    }
  }

  console.log(`  ${APPLY ? "Created" : "Would create"}: ${created} payment(s), ₹${round2(totalAmount).toFixed(2)}`);
  console.log(`  Already linked (skipped): ${skippedLinked}`);
  if (skippedNoVendor) console.log(`  Skipped, no vendor: ${skippedNoVendor}`);

  return { created, amount: totalAmount };
}

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGO_URI is not set");
  await mongoose.connect(uri);
  console.log(`Connected. Mode: ${APPLY ? "APPLY (writing)" : "DRY RUN (no writes)"}`);

  const configs = ONLY ? CONFIGS.filter((c) => c.documentType === ONLY) : CONFIGS;
  if (ONLY && configs.length === 0) {
    throw new Error(`--only ${ONLY} is not a known document type (Purchase | PurchaseReturn)`);
  }

  let grandCreated = 0;
  let grandAmount = 0;
  for (const cfg of configs) {
    const { created, amount } = await backfillType(cfg);
    grandCreated += created;
    grandAmount += amount;
  }

  console.log("");
  console.log(`Total ${APPLY ? "created" : "to create"}: ${grandCreated} payment(s), ₹${round2(grandAmount).toFixed(2)}`);
  if (!APPLY) console.log("Nothing was written. Re-run with --apply to commit.");

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("Backfill failed:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
