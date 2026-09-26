const mongoose = require("mongoose");

// Links one Payment to one document it settles. A payment can carry several
// (splitting a receipt across documents); any remainder stays as unallocated
// credit on the Payment. Allocating also pushes a subdoc into the document's
// own payments[] — documentPaymentId points at it so the push can be undone.
const paymentAllocationSchema = new mongoose.Schema(
  {
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      required: true,
      index: true,
    },
    // Both directions are ambiguous (OUT = Purchase | SalesReturn,
    // IN = Invoice | PurchaseReturn), so callers always pass this explicitly.
    documentType: {
      type: String,
      enum: ["Invoice", "Purchase", "PurchaseReturn", "SalesReturn"],
      required: true,
    },
    document: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "documentType",
      index: true,
    },
    // The subdoc this allocation pushed into the document's payments[].
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
