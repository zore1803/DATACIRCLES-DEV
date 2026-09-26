const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    // Legacy party pointer. Kept (and still populated by the vendor tabs and
    // the payments timeline) because every existing Payment row has it and
    // several screens read `payment.vendor` directly. No longer `required`:
    // an IN/Credit payment is received from a customer — a Company or a
    // Contact — which has no Vendor record, so those rows carry `party`
    // /`partyType` below instead. Vendor payments set BOTH, so nothing that
    // reads `.vendor` regressed.
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
    },
    // Generalized party pointer, so the same Payment shape covers both
    // directions: OUT/Debit → Vendor, IN/Credit → Company or Contact.
    partyType: {
      type: String,
      enum: ["Vendor", "Company", "Contact"],
    },
    party: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "partyType",
    },
    amount: { type: Number, required: true },
    // Portion of `amount` settled against specific Invoices/Purchases via
    // PaymentAllocation records. `amount - allocatedAmount` is the party's
    // unallocated credit balance from this payment — money that's been
    // received/paid but isn't tied to a document yet, reusable against a
    // future one. Maintained by paymentAllocationService, never by hand.
    allocatedAmount: { type: Number, default: 0, min: 0 },
    paymentDate: { type: Date, default: Date.now },
    bank: String,
    // Widened to match the documents' own payments[].paymentMethod enum
    // (Purchase/Invoice/PurchaseReturn). Bill-side payments now create a
    // Payment row through paymentAllocationService.recordDocumentPayment, and
    // that row has to be able to hold whatever method the bill was paid by --
    // NEFT/RTGS/IMPS/TDS/Other used to be silently downgraded. Every
    // previously valid value is still valid, so no existing row is affected.
    paymentType: {
      type: String,
      enum: [
        "Card", "Cash", "Cheque", "EMI", "Net Banking", "UPI",
        "NEFT", "RTGS", "IMPS", "TDS", "Other",
      ],
      required: true,
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    notes: String,
    // Transaction reference (UTR / cheque no. / txn id). Rendered on the payment
    // receipt (components/vendor/venerPaymentPreview.tsx), which read this field
    // before the schema carried it.
    reference: String,
    direction: { type: String, enum: ["IN", "OUT"], required: true },
    // Moving money between the organization's OWN accounts (bank → cash,
    // wallet → bank). A transfer is recorded as two Payment rows — an OUT on
    // the source and an IN on the destination — because that's what keeps
    // each account card's balance right. But no money entered or left the
    // business, so counting those legs in Total Credit / Total Debit
    // overstates both by the transfer amount. Flagged here so the timeline
    // can keep them in the per-account balances and out of the KPIs.
    isInternalTransfer: { type: Boolean, default: false },
    // Shared by the two legs of one transfer, so they can be shown as a pair
    // (and so a half-completed transfer is identifiable — the two POSTs are
    // not atomic).
    transferGroup: { type: String, index: true },
    // True when this row was created by recording a payment ON a document
    // (the Record Payment modal on a bill), rather than as a standalone
    // Gave/Got entry on the party's payments page. It exists so removing that
    // document payment can delete the money row it created, while a
    // standalone payment that merely happens to be fully allocated survives
    // as the party's credit balance. See
    // paymentAllocationService.removeDocumentPayment.
    isDocumentPayment: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Unallocated remainder — the credit balance this payment contributes to its
// party. Virtual rather than stored so it can never drift from the two fields
// it's derived from.
paymentSchema.virtual("unallocatedAmount").get(function () {
  return Math.max(0, (Number(this.amount) || 0) - (Number(this.allocatedAmount) || 0));
});

paymentSchema.set("toJSON", { virtuals: true });
paymentSchema.set("toObject", { virtuals: true });

paymentSchema.index({ organization: 1, partyType: 1, party: 1 });

module.exports = mongoose.model("Payment", paymentSchema);
