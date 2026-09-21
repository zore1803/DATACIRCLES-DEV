// models/PurchaseReturn.js
//
// Goods sent back to a vendor, always against a specific Purchase bill (see
// purchaseReturnController.createPurchaseReturn, which requires `purchase`
// and derives `vendor` from it). Deliberately mirrors models/Purchase.js's
// shape (same item sub-schema, same subtotal/tax/grandTotal math, same
// numbering scheme) so the two modules stay easy to reason about side by
// side — see purchaseController.js for the pattern this was cloned from.
const mongoose = require("mongoose");

const purchaseReturnItemSchema = new mongoose.Schema(
  {
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: "Item" },
    variantId: { type: mongoose.Schema.Types.ObjectId },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    total: { type: Number, min: 0 }, // quantity * unitPrice (gross, before tax extraction)
    sku: { type: String },
    // Per-line GST fields — copied from the original Purchase line when the
    // return is created, so tax can be reversed correctly using the same rate
    // and tax-mode the purchase itself used. Mirrors Purchase.js item schema.
    gstRate: { type: Number, default: 0, min: 0 },
    taxInclusive: { type: Boolean, default: false },
    // Why THIS line is coming back — independent of the document-level
    // `reason` free-text field, since different lines in the same return can
    // come back for different reasons (2 defective + 1 wrong item, etc.).
    reason: {
      type: String,
      enum: ["", "Defective", "Damaged", "Wrong Item", "Excess Quantity", "Other"],
      default: "",
    },
  },
  { _id: false }
);

const purchaseReturnSchema = new mongoose.Schema(
  {
    // Auto-filled server-side from `purchase.vendor` on create — never
    // trusted from the client, so a return can't be attributed to the wrong
    // vendor. Kept as `required` (rather than dropped) so existing code that
    // reads `.vendor` directly doesn't need to start null-checking.
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true },
    // The bill being returned against. Schema-level `required` is
    // deliberately soft (not `required: true`) so any pre-existing
    // standalone returns from before this field became mandatory keep
    // loading/saving — purchaseReturnController.createPurchaseReturn is what
    // actually enforces "must reference an existing Purchase" going forward.
    purchase: { type: mongoose.Schema.Types.ObjectId, ref: "Purchase", default: null },

    returnNumber: { type: String, required: true },
    returnDate: { type: Date, default: Date.now },

    items: [purchaseReturnItemSchema],
    subtotal: { type: Number, default: 0, min: 0 },
    transactionType: { type: String, enum: ["intra", "inter"], default: "intra" },
    gstRate: { type: Number, default: 0, min: 0 },
    totalTax: { type: Number, default: 0, min: 0 },
    grandTotal: { type: Number, default: 0, min: 0 },

    // Draft -> Pending -> Confirmed -> Cancelled is the physical-goods
    // workflow: Confirmed is the one status that means "goods actually left
    // toward the vendor," and is what triggers the stock-out (see
    // purchaseReturnController.js's syncPurchaseReturnStock). "Paid" is kept
    // only as a payment/refund-settled marker — deliberately NOT tied to
    // stock (a return can be Confirmed long before the refund is settled).
    status: {
      type: String,
      enum: ["Draft", "Pending", "Confirmed", "Paid", "Cancelled"],
      default: "Draft",
    },
    // How the refund from the vendor was/will be settled — a single field
    // (not a payments sub-array like Purchase.payments) since a return is
    // one settlement, not an installment plan.
    mode: {
      type: String,
      enum: ["", "Cash", "UPI", "Bank Transfer", "Cheque", "Card", "Other"],
      default: "",
    },
    reason: { type: String, default: "" },
    notes: { type: String, default: "" },

    // Guards the inventory stock-out from double/under-applying — see
    // purchaseReturnController.js's syncPurchaseReturnStock. Mirrors
    // PurchaseOrder.stockMovementStatus exactly: "Confirmed" is the terminal,
    // stock-moving status; reversal only happens via delete.
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

purchaseReturnSchema.index({ organization: 1, createdAt: -1 });
purchaseReturnSchema.index({ organization: 1, status: 1 });
purchaseReturnSchema.index({ vendor: 1, organization: 1 });
purchaseReturnSchema.index({ purchase: 1, organization: 1 });

module.exports = mongoose.model("PurchaseReturn", purchaseReturnSchema);
