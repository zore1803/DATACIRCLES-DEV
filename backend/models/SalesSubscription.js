// models/SalesSubscription.js
//
// A recurring-billing agreement with a customer (Deal) — NOT the CRM's own
// plan/billing subscription (see models/Subscription.js for that). This is
// the "customer pays us ₹X every N days/weeks/months/years" record Swipe
// calls Subscriptions/Recurring Invoices: create it once, then either the
// user clicks "Generate Invoice Now" or (future) a scheduled job walks every
// Active row whose nextInvoiceDate has arrived and creates the next Invoice
// from it — see salesSubscriptionController.generateInvoiceForSubscription,
// which both paths would call.
//
// Item line shape mirrors Invoice.items exactly (itemId/variantId/name/rate/
// quantity/hsn/discount/gstRate/taxInclusive) so a generated invoice's lines
// can be built by direct field copy — no per-document translation layer.
const mongoose = require("mongoose");

const subscriptionItemSchema = new mongoose.Schema(
  {
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: "Item" },
    variantId: { type: mongoose.Schema.Types.ObjectId, default: null },
    parentItemId: { type: mongoose.Schema.Types.ObjectId, ref: "Item", default: null },
    isVariant: { type: Boolean, default: false },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    hsn: { type: String, default: "" },
    rate: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    discountType: { type: String, enum: ["amount", "percentage"], default: "amount" },
    discount: { type: Number, default: 0, min: 0 },
    gstRate: { type: Number, default: 0, min: 0, max: 100 },
    taxInclusive: { type: Boolean, default: false },
  },
  { _id: false }
);

// One row per Invoice this subscription has actually generated — the "No. of
// Invoices" / history trail shown on the detail view. `invoice` is kept even
// if that Invoice is later deleted elsewhere (not $ref-populated then), so
// the count and generation dates stay accurate regardless.
const generatedInvoiceSchema = new mongoose.Schema(
  {
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice" },
    invoiceNumber: { type: String, default: "" },
    date: { type: Date, default: Date.now },
    amount: { type: Number, default: 0 },
  },
  { _id: false }
);

const salesSubscriptionSchema = new mongoose.Schema(
  {
    deal: { type: mongoose.Schema.Types.ObjectId, ref: "Deal", required: true },
    subscriptionNumber: { type: String, required: true },

    items: [subscriptionItemSchema],
    discount: {
      type: { type: String, enum: ["fixed", "percentage"], default: "fixed" },
      value: { type: Number, default: 0, min: 0 },
    },
    transactionType: { type: String, enum: ["intra", "inter"], default: "intra" },
    gstRate: { type: Number, default: 0, min: 0, max: 100 },
    // Per-billing-cycle amount — recomputed from items/discount/gstRate the
    // same way invoiceController.calculateTotalAmount does, so it always
    // matches what the next generated Invoice will actually bill.
    amount: { type: Number, default: 0, min: 0 },

    // Every N <unit> — "Every 1 month" is { value: 1, unit: "month" }.
    billingInterval: {
      value: { type: Number, default: 1, min: 1 },
      unit: { type: String, enum: ["day", "week", "month", "year"], default: "month" },
    },

    startDate: { type: Date, required: true },
    // Required — every subscription must have a defined end, enforced in the
    // controller too (missing/blank rejected, must be after startDate). Rows
    // saved before this rule existed may still carry endDate: null; the
    // controller's status-update/generate-invoice saves use
    // validateModifiedOnly so those legacy rows keep billing/pausing rather
    // than failing validation on a field they never touched.
    endDate: { type: Date, required: true },
    // The next date an invoice is due to be generated — shown as "Upcoming"
    // in the list. Advances by billingInterval each time
    // generateInvoiceForSubscription runs. Null once the subscription has
    // reached its endDate or is Cancelled.
    nextInvoiceDate: { type: Date, default: null },

    invoiceCount: { type: Number, default: 0, min: 0 },
    generatedInvoices: [generatedInvoiceSchema],

    // Draft: created but not yet started billing. Active: generating on
    // schedule. Expired: passed endDate with nothing left to generate.
    // Error: last generation attempt failed (see lastError). Cancelled:
    // stopped by the user — terminal, never auto-resumes.
    status: {
      type: String,
      enum: ["Draft", "Active", "Expired", "Error", "Cancelled"],
      default: "Draft",
    },
    lastError: { type: String, default: "" },

    notes: { type: String, default: "" },
    terms: { type: String, default: "" },

    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  },
  { timestamps: true }
);

salesSubscriptionSchema.index({ organization: 1, createdAt: -1 });
salesSubscriptionSchema.index({ organization: 1, status: 1 });
salesSubscriptionSchema.index({ organization: 1, nextInvoiceDate: 1 });
salesSubscriptionSchema.index({ deal: 1, organization: 1 });

module.exports = mongoose.model("SalesSubscription", salesSubscriptionSchema);
