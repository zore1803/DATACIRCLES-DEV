// Goods returned by a customer against an Invoice. Mirrors PurchaseReturn
// inverted: Confirmed brings stock back IN and refunds go OUT to the customer.
const mongoose = require("mongoose");

const salesReturnItemSchema = new mongoose.Schema(
  {
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: "Item" },
    // Set when the invoice line was a variant — needed for per-variant stock IN.
    variantId: { type: mongoose.Schema.Types.ObjectId, default: null },
    parentItemId: { type: mongoose.Schema.Types.ObjectId, ref: "Item", default: null },
    isVariant: { type: Boolean, default: false },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    hsn: { type: String, default: "" },
    // Snapshotted from the invoice line, not looked up live from the Item master.
    quantity: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    gstRate: { type: Number, default: 0, min: 0, max: 100 },
    taxInclusive: { type: Boolean, default: false },
    total: { type: Number, min: 0 },
    reason: {
      type: String,
      enum: ["", "Damaged", "Defective", "Wrong Item", "Wrong Size/Variant", "Customer Changed Mind", "Other"],
      default: "",
    },
  },
  { _id: false }
);

const salesReturnSchema = new mongoose.Schema(
  {
    // Derived server-side from `invoice.deal`, never trusted from the client.
    deal: { type: mongoose.Schema.Types.ObjectId, ref: "Deal", required: true },
    // Null-tolerant at schema level for legacy rows; the controller requires it.
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice", default: null },

    returnNumber: { type: String, required: true },
    returnDate: { type: Date, default: Date.now },

    items: [salesReturnItemSchema],
    subtotal: { type: Number, default: 0, min: 0 },
    transactionType: { type: String, enum: ["intra", "inter"], default: "intra" },
    gstRate: { type: Number, default: 0, min: 0 },
    totalTax: { type: Number, default: 0, min: 0 },
    grandTotal: { type: Number, default: 0, min: 0 },

    // Confirmed is the only stock-moving status. Partial/Paid follow from real
    // refunds in `payments`, never from a status flip. "Refunded" is legacy
    // only — existing rows keep it, nothing new can reach it (not yet migrated).
    status: {
      type: String,
      enum: ["Draft", "Pending", "Confirmed", "Partial", "Paid", "Cancelled", "Refunded"],
      default: "Draft",
    },
    // Settlement view of refunds paid to the customer. Each subdoc is pushed by
    // paymentAllocationService alongside a real Payment row (direction OUT).
    payments: [{
      amount: { type: Number, required: true },
      paymentDate: { type: Date, default: Date.now },
      paymentMethod: {
        type: String,
        enum: ["Cash", "UPI", "Net Banking", "Cheque", "Card", "NEFT", "RTGS", "IMPS", "EMI", "TDS", "Other"],
        default: "UPI",
      },
      reference: { type: String, default: "" },
      notes: { type: String, default: "" },
      internalNotes: { type: String, default: "" },
      recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      recordedAt: { type: Date, default: Date.now },
    }],
    // Legacy, and the default method suggested when recording a refund. Never
    // the financial source of truth — `payments` is.
    refundMode: {
      type: String,
      enum: ["", "Cash", "UPI", "Bank Transfer", "Cheque", "Card", "Credit Note", "Other"],
      default: "",
    },
    reason: { type: String, default: "" },
    notes: { type: String, default: "" },

    // Guards the stock-in from double-applying.
    stockMovementStatus: {
      type: String,
      enum: ["pending", "applied", "reversed"],
      default: "pending",
    },

    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  },
  { timestamps: true }
);

salesReturnSchema.index({ organization: 1, createdAt: -1 });
salesReturnSchema.index({ organization: 1, status: 1 });
salesReturnSchema.index({ invoice: 1, organization: 1 });
salesReturnSchema.index({ deal: 1, organization: 1 });

module.exports = mongoose.model("SalesReturn", salesReturnSchema);
