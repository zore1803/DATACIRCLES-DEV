// Backfills the money rows behind payments that were recorded ON a document
// before the two payment systems were unified.
//
// Until Stage 1, recording a payment on a Purchase only pushed a subdocument
// into Purchase.payments[] — no Payment row, no PaymentAllocation. So a bill
// could read "Paid ₹10,000" while its vendor's Total Given stayed at ₹0. New
// payments now go through paymentAllocationService.recordDocumentPayment; this
// script gives the same treatment to everything already on file.
//
// For every Purchase.payments[] subdoc with no PaymentAllocation pointing at
// it, this creates:
//   Payment           direction OUT, party = the bill's vendor, isDocumentPayment
//   PaymentAllocation Payment -> Purchase, documentPaymentId = that subdoc
//
// The documents themselves are NOT touched: the subdoc already exists and the
// status it produced is already correct, so nothing is pushed, recomputed or
// re-saved. That is what makes this safe to run twice — the second run finds
// an allocation for every subdoc and writes nothing.
//
// Usage (from backend/):
//   node scripts/backfillDocumentPayments.js                  # dry run
//   node scripts/backfillDocumentPayments.js --apply          # write
//   node scripts/backfillDocumentPayments.js --apply --org <organizationId>

require("dotenv").config();
const mongoose = require("mongoose");

const Purchase = require("../models/Purchase");
const Payment = require("../models/Payment");
const PaymentAllocation = require("../models/PaymentAllocation");

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const orgFlag = args.indexOf("--org");
const ORG_ID = orgFlag !== -1 ? args[orgFlag + 1] : null;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Payment.paymentType now carries the same enum as the documents' own
// paymentMethod, so a method maps across unchanged. Anything unrecognised (or
// missing on an old row) becomes "Other" rather than failing validation.
const VALID = new Set([
  "Card", "Cash", "Cheque", "EMI", "Net Banking", "UPI",
  "NEFT", "RTGS", "IMPS", "TDS", "Other",
]);
const toPaymentType = (method) => (VALID.has(method) ? method : "Other");

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGO_URI is not set");
  await mongoose.connect(uri);
  console.log(`Connected. Mode: ${APPLY ? "APPLY (writing)" : "DRY RUN (no writes)"}`);

  const filter = { "payments.0": { $exists: true } };
  if (ORG_ID) filter.organization = ORG_ID;

  const purchases = await Purchase.find(filter).select("_id purchaseNumber vendor organization user payments").lean();
  console.log(`Scanning ${purchases.length} purchase(s) with payments...`);

  let created = 0;
  let skippedLinked = 0;
  let skippedNoVendor = 0;
  let totalAmount = 0;

  for (const purchase of purchases) {
    for (const subdoc of purchase.payments || []) {
      const existing = await PaymentAllocation.findOne({
        documentType: "Purchase",
        document: purchase._id,
        documentPaymentId: subdoc._id,
      }).lean();

      if (existing) {
        skippedLinked += 1;
        continue;
      }

      // A bill with no vendor can't be attributed to anyone's ledger. Left
      // alone and reported rather than guessed at.
      if (!purchase.vendor) {
        skippedNoVendor += 1;
        console.warn(`  ! ${purchase.purchaseNumber || purchase._id}: payment ${subdoc._id} has no vendor — skipped`);
        continue;
      }

      const amount = round2(subdoc.amount);
      if (!Number.isFinite(amount) || amount <= 0) continue;

      totalAmount += amount;
      created += 1;

      if (!APPLY) {
        console.log(`  would create: ${purchase.purchaseNumber || purchase._id} · ₹${amount.toFixed(2)} · ${subdoc.paymentMethod || "Other"}`);
        continue;
      }

      const payment = await Payment.create({
        vendor: purchase.vendor,
        partyType: "Vendor",
        party: purchase.vendor,
        amount,
        allocatedAmount: amount,
        paymentDate: subdoc.paymentDate || purchase.createdAt || new Date(),
        paymentType: toPaymentType(subdoc.paymentMethod),
        reference: subdoc.reference || "",
        notes: subdoc.notes || "",
        direction: "OUT",
        isDocumentPayment: true,
        user: subdoc.recordedBy || purchase.user,
        organization: purchase.organization,
      });

      await PaymentAllocation.create({
        payment: payment._id,
        documentType: "Purchase",
        document: purchase._id,
        documentPaymentId: subdoc._id,
        amount,
        organization: purchase.organization,
        user: subdoc.recordedBy || purchase.user,
      });
    }
  }

  console.log("");
  console.log(`${APPLY ? "Created" : "Would create"}: ${created} payment(s), ₹${round2(totalAmount).toFixed(2)}`);
  console.log(`Already linked (skipped): ${skippedLinked}`);
  if (skippedNoVendor) console.log(`Skipped, no vendor: ${skippedNoVendor}`);
  if (!APPLY) console.log("\nNothing was written. Re-run with --apply to commit.");

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("Backfill failed:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
