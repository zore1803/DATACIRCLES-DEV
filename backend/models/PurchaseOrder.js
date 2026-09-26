const mongoose = require("mongoose");

const purchaseOrderSchema = new mongoose.Schema({
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true },
  poNumber: { type: String, required: true },
  orderDate: { type: Date, default: Date.now },
  items: [
    {
      itemId: { type: mongoose.Schema.Types.ObjectId, ref: "Item" },
      variantId: { type: mongoose.Schema.Types.ObjectId },
      name: { type: String, required: true },
      quantity: { type: Number, required: true },
      unitPrice: { type: Number, required: true },
      total: { type: Number, required: true },
      sku: { type: String },
      variantAttributes: { type: Map, of: String },
      // Per-item GST/Tax-Inc. override — the form lets each line carry its own rate
      // (seeded from the variant, if any). Was being sent by the frontend but silently
      // dropped since this sub-schema never declared the fields.
      gstRate: { type: Number, default: 0, min: 0 },
      taxInclusive: { type: Boolean, default: false },
      taxAmount: { type: Number, default: 0, min: 0 },
    }
  ],
  totalAmount: { type: Number, required: true },
  subtotal: { type: Number, default: 0, min: 0 },
  transactionType: {
    type: String,
    enum: ["intra", "inter"],
    default: "intra",
  },
  gstRate: { type: Number, default: 0, min: 0 },
  totalTax: { type: Number, default: 0, min: 0 },
  // Whole-rupee "Round Off" adjustment = grandTotal − (subtotal + totalTax).
  roundOff: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0, min: 0 }, // rounded to the nearest rupee
  paymentTerms: { type: String, default: "Net 30" },
  status: { type: String, enum: ["Pending", "Approved", "Rejected", "Delivered"], default: "Pending" },
  // Tracks whether this PO's Delivered transition has already added its items to
  // inventory, so re-saving/re-delivering can never double the stock increase. See
  // purchaseOrderController's syncPurchaseOrderDeliveryStock — mirrors Purchase's
  // own stockMovementStatus field/guard.
  stockMovementStatus: { type: String, enum: ['pending', 'applied', 'reversed'], default: 'pending' },
  notes: String,
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true }
}, { timestamps: true });

module.exports = mongoose.model("PurchaseOrder", purchaseOrderSchema);
