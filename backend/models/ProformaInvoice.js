const mongoose = require('mongoose');

const postalAddressSchema = new mongoose.Schema({
  addressLine1: { type: String, default: '' },
  addressLine2: { type: String, default: '' },
  pincode: { type: String, default: '' },
  city: { type: String, default: '' },
  state: { type: String, default: '' },
  country: { type: String, default: '' },
}, { _id: false });

const proformaInvoiceSchema = new mongoose.Schema({
  deal: { type: mongoose.Schema.Types.ObjectId, ref: 'Deal', required: true },
  performaInvoiceNumber: { type: String, required: true },
  date: { type: Date, required: true },
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
  style: { type: String, enum: ['Classic', 'Modern', 'Minimal', 'Elegant', 'Compact', 'Corporate', 'Vibrant', 'Mono', 'Vintage', 'Professional', 'Landscape', 'Service', 'Detailed', ''], default: '' },
  // Free-text footer blocks, printed on the document when present.
  notes: { type: String, default: '' },
  terms: { type: String, default: '' },
  bankDetails: { type: mongoose.Schema.Types.ObjectId, ref: 'BankDetails', default: null },
  // Round Off chosen on the form. No default: documents saved before this field existed stay
  // unrounded in their PDF, exactly as before.
  isRoundOff: { type: Boolean },
  isTaxInvoice: { type: Boolean, default: false },
  transactionType: { type: String, enum: ['intra', 'inter'], default: 'intra' },
  signature: { type: String },
  signatureType: { type: String, enum: ['text', 'upload'], default: 'text' },
  receiverGSTIN: { type: String }, // Added receiverGSTIN field
  items: [{
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
    // Set only for variant lines — itemId above is the parent Item's id.
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
    // the pro forma invoice (not looked up live), same as rate/hsn — matches
    // the per-item gstRate already stored on Quotation items.
    gstRate: { type: Number, default: 0, min: 0, max: 100 },
    // Carried over from the catalog Item/variant at the moment it's added to
    // the pro forma invoice, same as gstRate — lets computeDocument() know
    // this line's rate already includes GST instead of taxing it again.
    taxInclusive: { type: Boolean, default: false },
  }],
  // Set when this pro forma invoice was created via the "Duplicate" action,
  // pointing at the source document it was cloned from.
  duplicatedFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'ProformaInvoice' },
}, { timestamps: true });

module.exports = mongoose.model('ProformaInvoice', proformaInvoiceSchema);