const mongoose = require('mongoose');

const postalAddressSchema = new mongoose.Schema({
  addressLine1: { type: String, default: '' },
  addressLine2: { type: String, default: '' },
  pincode: { type: String, default: '' },
  city: { type: String, default: '' },
  state: { type: String, default: '' },
  country: { type: String, default: '' },
}, { _id: false });

const invoiceSchema = new mongoose.Schema({
  deal: { type: mongoose.Schema.Types.ObjectId, ref: 'Deal', required: true },
  invoiceNumber: { type: String, required: true },
  date: { type: Date, required: true },
  // Financial year (starting calendar year, e.g. 2026 for FY 2026-27), derived from `date`.
  // Invoice numbers are unique per organization within a financial year.
  financialYear: { type: Number },
  dueDate: { type: Date },
  amount: { type: Number, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  status: { type: String, required: true },
  billingAddress: { type: postalAddressSchema, default: () => ({}) },
  shippingAddress: { type: postalAddressSchema, default: () => ({}) },
  discount: {
    type: {
      type: String,
      enum: ['fixed', 'percentage'],
      required: true,
    },
    value: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  // Free-text field (e.g. a customer's PO number) -- no bearing on
  // invoiceNumber/numbering, purely informational. The other three
  // document models already carry it; without it the form's Reference
  // input was silently dropped on save.
  reference: { type: String, default: '' },
  // Free-text footer blocks, printed on the document when present.
  notes: { type: String, default: '' },
  terms: { type: String, default: '' },
  // Bank account printed on this document. Chosen via the invoice form's
  // "Select Bank" dropdown; when unset the org's default bank is used.
  bankDetails: { type: mongoose.Schema.Types.ObjectId, ref: 'BankDetails', default: null },
  // Round Off chosen on the form. No default: documents saved before this field existed stay
  // unrounded in their PDF, exactly as before.
  isRoundOff: { type: Boolean },
  // Editable text shown as the UPI payment note ("tn") on the QR code.
  // Defaults to "Invoice <invoiceNumber>" when left blank — see
  // shared/documentTemplates.js buildUpiUri.
  qrNote: { type: String, default: '' },
  signature: { type: String },
  signatureType: { type: String, enum: ['text', 'upload'], default: 'text' },
  receiverGSTIN: { type: String }, // Added receiverGSTIN field
  transactionType: { type: String, enum: ['intra', 'inter'], default: 'intra' },
  items: [{
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
    // Set only for variant lines — itemId above is the parent Item's id
    // (parentItemId duplicates it for display purposes), this is the specific
    // variant subdocument id, needed to move stock against the right variant.
    variantId: { type: mongoose.Schema.Types.ObjectId, default: null },
    name: { type: String, required: true },
    description: { type: String },
    rate: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    hsn: { type: String },
    isVariant: { type: Boolean, default: false },
    parentItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
    discountType: { type: String, enum: ['amount', 'percentage'], default: 'amount' },
    discount: { type: Number, default: 0, min: 0 },
    // Carried over from the catalog Item/variant at the moment it's added to
    // the invoice (not looked up live), same as rate/hsn — matches the
    // per-item gstRate already stored on Quotation items.
    gstRate: { type: Number, default: 0, min: 0, max: 100 },
    // Carried over from the catalog Item/variant at the moment it's added to
    // the invoice, same as gstRate — lets computeDocument() know this line's
    // rate already includes GST instead of taxing it again.
    taxInclusive: { type: Boolean, default: false },
    // IRP UQC (Unit Quantity Code) — snapshotted from Item.primaryUnit at
    // add-time (e.g. "OTH OTHERS", "NOS", "KGS"). The e-invoice mapper
    // extracts the code portion: primaryUnit.split(' ')[0] → "OTH".
    primaryUnit: { type: String, default: 'OTH OTHERS' },
  }],
  // Payment records for this invoice
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
  digitalSignature: {
    status: { type: String, enum: ['pending', 'signed', 'cancelled', 'failed', 'none'], default: 'none' },
    provider: { type: String, enum: ['docusign', 'zoho', 'internal', 'other'] },
    documentId: { type: String },
    signedAt: { type: Date },
    signedUrl: { type: String }
  },
  // Set when this invoice was created via the "Duplicate" action, pointing
  // at the source invoice it was cloned from. Never set on the source itself.
  duplicatedFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
  stockMovementStatus: { type: String, enum: ['pending', 'applied', 'reversed'], default: 'pending' },
  // Pointer to the most-recent EInvoice attempt for this invoice (Phase-8/11).
  // A retry after FAILED creates a new EInvoice row and updates this pointer;
  // older attempts stay reachable via EInvoice.find({ invoice }) for the audit
  // trail. Not required — an invoice with no attempts has this null.
  latestEInvoice: { type: mongoose.Schema.Types.ObjectId, ref: 'EInvoice', default: null },
}, { timestamps: true });

invoiceSchema.pre('validate', function setFinancialYear(next) {
  if (this.date) {
    // eslint-disable-next-line global-require
    this.financialYear = require('../utils/documentNumbering').financialYearOf(this.date);
  }
  next();
});

// Database-level guard against duplicate invoice numbers (e.g. two saves at the same moment).
// Partial so invoices saved before `financialYear` existed don't block the index until
// scripts/backfillInvoiceFinancialYear.js has filled it in.
invoiceSchema.index(
  { organization: 1, financialYear: 1, invoiceNumber: 1 },
  { unique: true, partialFilterExpression: { financialYear: { $type: 'number' } } }
);

// The Deal page asks for one deal's invoices (GET /invoices?deal=<id>), so that
// lookup is served from an index instead of scanning the organization's invoices.
invoiceSchema.index({ organization: 1, deal: 1 });

module.exports = mongoose.model('Invoice', invoiceSchema);
