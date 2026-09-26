const mongoose = require("mongoose");

// Links one Payment to one settled document (Invoice or Purchase) for a given
// amount. A single payment can carry several of these — that's the "split a
// ₹10k receipt across two invoices" case — and the amounts need not add up to
// the payment total: whatever is left over stays as an unallocated credit
// balance on the Payment itself (Payment.allocatedAmount vs Payment.amount).
//
// The allocation does NOT replace the document's own `payments[]` subdocument.
// Allocating also pushes a subdoc onto the Invoice/Purchase, and
// `documentPaymentId` points at it, so every existing Paid/Pending screen
// (getCompanyInvoiceSummary, the invoice list, the purchase status badge)
// picks the allocation up through the exact math it already runs, with no
// changes. This record is what makes that push reversible and auditable.
const paymentAllocationSchema = new mongoose.Schema(
  {
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      required: true,
      index: true,
    },
    // Which collection `document` lives in, and therefore which way the money
    // moved. OUT (Debit) payments settle Purchases. IN (Credit) payments
    // settle Invoices (a customer paying us) or Purchase Returns (a vendor
    // refunding us for goods sent back).
    documentType: {
      type: String,
      enum: ["Invoice", "Purchase", "PurchaseReturn"],
      required: true,
    },
    document: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "documentType",
      index: true,
    },
    // _id of the subdocument this allocation pushed into
    // Invoice.payments / Purchase.payments. Needed to pull that subdoc back
    // out when the allocation (or the whole Payment) is deleted.
    documentPaymentId: { type: mongoose.Schema.Types.ObjectId },
    amount: { type: Number, required: true, min: 0 },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

paymentAllocationSchema.index({ organization: 1, documentType: 1, document: 1 });

module.exports = mongoose.model("PaymentAllocation", paymentAllocationSchema);
