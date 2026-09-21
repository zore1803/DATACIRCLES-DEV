const mongoose = require("mongoose");

const purchaseItemSchema = new mongoose.Schema(
  {
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: "Item" },
    variantId: { type: mongoose.Schema.Types.ObjectId },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    total: { type: Number, min: 0 }, // per item total (quantity * unitPrice)
    sku: { type: String },
    variantAttributes: { type: Map, of: String },
    // Per-item GST/Tax-Inc. override (PurchaseForm.jsx lets each line carry its own rate,
    // separate from the document-level gstRate above) — was being sent by the frontend but
    // silently dropped since this schema never declared the fields.
    gstRate: { type: Number, default: 0, min: 0 },
    taxInclusive: { type: Boolean, default: false },
  },
  { _id: false }
);

const purchaseSchema = new mongoose.Schema(
  {
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },
    purchaseOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PurchaseOrder",
      default: null,
    },
    purchaseNumber: { type: String, required: true },
    purchaseDate: { type: Date, default: Date.now },
    items: [purchaseItemSchema],
    subtotal: { type: Number, default: 0, min: 0 }, // sum of item totals before tax
    transactionType: {
      type: String,
      enum: ["intra", "inter"],
      default: "intra",
    },
    gstRate: { type: Number, default: 0, min: 0 },
    totalTax: { type: Number, default: 0, min: 0 }, // CGST + SGST or IGST
    grandTotal: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      // Draft -> Pending -> Confirmed -> (Partial/Paid | Cancelled). Confirmed
      // is the physical "goods received" event — the single point stock-in
      // fires from (see purchaseController's syncPurchaseStock), mirroring
      // Purchase Order's "Delivered" and Purchase Return's "Confirmed".
      // Partial/Paid are payment-tracking states reached only from Confirmed
      // onward (statusForPaidAmount never returns them before that). Once
      // Confirmed, status can't go back to Draft/Pending; once Paid, it can't
      // be Cancelled (that would need an explicit refund/reversal workflow,
      // not a status flip) — enforced in purchaseController.
      enum: ["Draft", "Pending", "Confirmed", "Paid", "Partial", "Cancelled"],
      default: "Draft",
    },
    notes: { type: String, default: "" },
    // Payment records against this Purchase — same shape as Invoice.payments,
    // so vendor payments can be recorded/tracked the same way customer
    // payments are, including partial payments.
    payments: [{
      amount: { type: Number, required: true },
      paymentDate: { type: Date, default: Date.now },
      paymentMethod: {
        type: String,
        enum: ['Cash', 'UPI', 'Net Banking', 'Cheque', 'Card', 'NEFT', 'RTGS', 'IMPS', 'EMI', 'TDS', 'Other'],
        default: 'UPI',
      },
      reference: { type: String, default: '' },
      notes: { type: String, default: '' },
      internalNotes: { type: String, default: '' },
      recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      recordedAt: { type: Date, default: Date.now },
    }],
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    // 'skipped' — Confirmed, but stock wasn't moved by this Purchase because
    // its linked Purchase Order already applied it on Delivered (prevents
    // double-counting the same goods). Cancelling a 'skipped' Purchase must
    // not reverse anything — the PO's own stock movement is a separate
    // event this record never owns.
    stockMovementStatus: { type: String, enum: ['pending', 'applied', 'skipped', 'reversed'], default: 'pending' },
  },
  { timestamps: true }
);

// Indexes
purchaseSchema.index({ organization: 1, createdAt: -1 });
purchaseSchema.index({ organization: 1, status: 1 });
purchaseSchema.index({ vendor: 1, organization: 1 });

module.exports = mongoose.model("Purchase", purchaseSchema);
