const mongoose = require('mongoose');

/*
 * A saved billing/shipping address that can be reused across documents —
 * same idea as DocumentFooterTemplate for Notes/Terms, but for addresses.
 * Organizations keep several (branch offices, warehouses, common customer
 * addresses) and pick one to fill the Billing/Shipping address fields on an
 * invoice/quotation/etc. instead of retyping it. Applying copies the fields,
 * so editing a saved address later never rewrites a document already issued.
 */
const savedAddressSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    title: { type: String, default: '', trim: true },
    addressLine1: { type: String, default: '' },
    addressLine2: { type: String, default: '' },
    pincode: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    country: { type: String, default: '' },
    // At most one default per organization — enforced in the controller,
    // which clears the flag on siblings before setting it here.
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

savedAddressSchema.index({ organization: 1, updatedAt: -1 });

module.exports = mongoose.model('SavedAddress', savedAddressSchema);
