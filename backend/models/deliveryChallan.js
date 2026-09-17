const mongoose = require('mongoose');

const postalAddressSchema = new mongoose.Schema({
  addressLine1: { type: String, default: '' },
  addressLine2: { type: String, default: '' },
  pincode: { type: String, default: '' },
  city: { type: String, default: '' },
  state: { type: String, default: '' },
  country: { type: String, default: '' },
}, { _id: false });

const itemSchema = new mongoose.Schema({
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
  // Set only for variant lines — itemId above is the parent Item's id.
  variantId: { type: mongoose.Schema.Types.ObjectId, default: null },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  rate: { type: Number, required: true },
  quantity: { type: Number, required: true, min: 1 },
  isVariant: { type: Boolean, default: false },
  parentItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
  discountType: { type: String, enum: ['amount', 'percentage'], default: 'amount' },
  discount: { type: Number, default: 0, min: 0 },
  // Line tax data, same as Invoice lines, so a GST challan calculates like an invoice
  // (₹118 With Tax @18% -> ₹100 + ₹9 CGST + ₹9 SGST) on screen, on save, on reopen and in the PDF.
  hsn: { type: String, default: '' },
  gstRate: { type: Number, default: 0, min: 0, max: 100 },
  taxInclusive: { type: Boolean, default: false },
});

const deliveryChallanSchema = new mongoose.Schema({
  deal: { type: mongoose.Schema.Types.ObjectId, ref: 'Deal', required: true },
  deliveryChallanNumber: { type: String, required: true },
  date: { type: Date, required: true },
  dueDate: { type: Date },
  amount: { type: Number, required: true },
  // GST on/off for the challan, same flag name the shared document form and computeDocument()
  // use for invoices. Defaults to false: challans saved before this field existed never carried
  // GST data, so they must keep rendering untaxed exactly as before.
  isTaxInvoice: { type: Boolean, default: false },
  transactionType: { type: String, enum: ['intra', 'inter'], default: 'intra' },
  receiverGSTIN: { type: String, default: '' },
  gstRate: { type: Number, min: 0, max: 100, default: 18 },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  status: {
    type: String,
    enum: ['Draft', 'Sent', 'Delivered', 'Cancelled'],
    required: true
  },
  billingAddress: { type: postalAddressSchema, default: () => ({}) },
  shippingAddress: { type: postalAddressSchema, default: () => ({}) },
  discount: {
    type: { type: String, enum: ['fixed', 'percentage'], required: true },
    value: { type: Number, required: true, min: 0 },
  },
  // Free-text footer blocks, printed on the document when present.
  notes: { type: String, default: '' },
  terms: { type: String, default: '' },
  bankDetails: { type: mongoose.Schema.Types.ObjectId, ref: 'BankDetails', default: null },
  // Round Off chosen on the form. No default: documents saved before this field existed stay
  // unrounded in their PDF, exactly as before.
  isRoundOff: { type: Boolean },
  signature: { type: String },
  signatureType: { type: String, enum: ['text', 'upload'], default: 'text' },
  items: [itemSchema],
  digitalSignature: {
    status: { type: String, enum: ['pending', 'signed', 'cancelled', 'failed', 'none'], default: 'none' },
    provider: { type: String, enum: ['docusign', 'zoho', 'internal', 'other'] },
    documentId: { type: String },
    signedAt: { type: Date },
    signedUrl: { type: String }
  },
  // Set when this delivery challan was created via the "Duplicate" action,
  // pointing at the source challan it was cloned from.
  duplicatedFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryChallan' },
  stockMovementStatus: { type: String, enum: ['pending', 'applied', 'reversed'], default: 'pending' },
}, { timestamps: true });

module.exports = mongoose.model('DeliveryChallan', deliveryChallanSchema);
