// models/Item.js
const mongoose = require("mongoose");

const variantSchema = new mongoose.Schema({
  name: { type: String, required: true }, // e.g., "Red - XL" or "Monthly Plan"
  sku: { type: String, default: "" },      // unique SKU/barcode per variant
  attributes: {
    // flexible object for custom attributes like size/color
    type: Map,
    of: String
    // Example: { size: 'XL', color: 'Red' }
  },
  purchasePrice: { type: Number, default: 0 },
  sellingPrice: { type: Number, default: 0 },
  stock: { type: Number, default: 0 }, // optional for product inventory
  isActive: { type: Boolean, default: true },
  gstRate: { type: Number, default: 0 }, // GST rate for this variant

  // --- Variant-specific overrides of the parent's catalog fields ---
  // Once an item has variants the parent is only a grouping container: the variant is what
  // actually gets billed, stocked and scanned, so each of these belongs to the variant rather
  // than being shared across every size/colour of the product.
  //
  // Every one of them is OPTIONAL and falls back to the parent's value when unset, so an item
  // whose variants predate these fields keeps behaving exactly as before. Readers must use the
  // variant-first helpers in utils/variantResolve.js rather than reading these raw.
  barcode: { type: String, default: "" },
  description: { type: String, default: "" },
  images: [{ type: String }],
  // Default discount for this variant when added to a document. `value: null` (not 0) means
  // "not set — inherit the parent's discount"; 0 is a real, deliberate "no discount".
  discount: {
    type: {
      type: String,
      enum: ['percentage', 'amount'],
      default: 'percentage',
    },
    value: { type: Number, default: null, min: 0 },
  },
  // null = inherit the parent's cap (which is itself null for "no limit").
  maxDiscountPercent: { type: Number, default: null, min: 0, max: 100 },
  // null = inherit the parent's inventory.lowStockThreshold.
  lowStockThreshold: { type: Number, default: null, min: 0 },
}); // each variant gets its own persistent _id — purchases/POs/stock movements key off it

// Values for the org-defined custom fields configured in ItemFields.
// Same shape the other modules use for their additionalFields.
const additionalFieldSchema = new mongoose.Schema({
  key: { type: String, required: true },
  value: mongoose.Schema.Types.Mixed, // Can store string, number, or any value
  type: {
    type: String,
    enum: ['string', 'number', 'dropdown', 'text', 'url', 'date', 'multiselect'],
    default: 'text'
  },
  category: {
    type: String,
    default: 'Uncategorized'
  }
});

const itemSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["product", "service"],
    required: true,
    default: "product"
  },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: "" },

  // Pricing (default/base)
  purchasePrice: { type: Number, required: true, default: 0 },
  sellingPrice: { type: Number, required: true, default: 0 },
  taxInclusive: { type: Boolean, default: true },
  // Whether purchasePrice already includes GST: the purchase price's own tax basis, separate
  // from taxInclusive (the selling price's). No default on purpose: items saved before this
  // field existed stay unset, and readers fall back to taxInclusive for them, so nothing about
  // an existing item changes.
  purchaseTaxInclusive: { type: Boolean },

  // GST/Tax
  gstRate: { type: Number, default: 0 }, // GST rate for the item (used for CGST/SGST/IGST calculation)

  // Default discount applied when this product is added to a document
  // (invoice/quotation/etc.) — a starting point the user can still change
  // on that specific document, not a forced discount.
  discount: {
    type: {
      type: String,
      enum: ['percentage', 'amount'],
      default: 'percentage',
    },
    value: { type: Number, default: 0, min: 0 },
  },
  // Upper bound on how much discount a user can apply to this product on a
  // document (always a percentage, regardless of the discount type above —
  // e.g. max 10% even if the applied discount is entered as a flat amount).
  // null/undefined = no limit.
  maxDiscountPercent: { type: Number, default: null, min: 0, max: 100 },

  // Identification
  hsnSac: { type: String, default: "" },
  barcode: { type: String, default: "" },
  category: { type: String, default: "" },

  // Units
  primaryUnit: { type: String, default: "OTH OTHERS" },

  // --- Inventory ---
  // Stock tracking for this item. `currentStock` is a denormalized running total:
  // the StockMovement collection is the source of truth (append-only ledger), and every
  // stock-in/stock-out writes both inside one transaction so they can't drift.
  //
  // Every product is inventory automatically — the Inventory page selects on `type: "product"`,
  // NOT on this flag, so a product added in Products & Services shows up there straight away
  // with a quantity of 0. `trackInventory` is retained only so existing documents keep their
  // shape; nothing filters on it.
  inventory: {
    trackInventory: { type: Boolean, default: true },
    openingStock: { type: Number, default: 0 },
    currentStock: { type: Number, default: 0 },
    // Item is flagged "Low Stock" once currentStock <= this. 0 means "only flag when
    // stock actually runs out or goes negative".
    lowStockThreshold: { type: Number, default: 0 },
    lastMovementAt: { type: Date, default: null },
  },

  // Media
  images: [{ type: String }],

  // Variants
  variants: [variantSchema],

  // Org-defined custom field values (definitions live in ItemFields)
  additionalFields: [additionalFieldSchema],

  // System fields
  isActive: { type: Boolean, default: true },

  // User and Organization tracking
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true }
}, { timestamps: true });

// Indexes
itemSchema.index({ organization: 1, name: 1 });
itemSchema.index({ organization: 1, category: 1 });
itemSchema.index({ organization: 1, isActive: 1 });
itemSchema.index({ organization: 1, gstRate: 1 });
// Inventory page lists an org's products, sorted/filtered by stock level.
itemSchema.index({ organization: 1, type: 1, "inventory.currentStock": 1 });

module.exports = mongoose.model("Item", itemSchema);