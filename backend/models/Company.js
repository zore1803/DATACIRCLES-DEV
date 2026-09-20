const mongoose = require('mongoose');

const additionalFieldSchema = new mongoose.Schema({
  key: { type: String, required: true }, // e.g., "Annual Revenue"
  value: mongoose.Schema.Types.Mixed,    // e.g., "250000000"
  type: { 
    type: String, 
    enum: ['string', 'number', 'dropdown', 'text', 'url', 'date', 'multiselect'],
    default: 'text'
  },
  // KEPT: This allows the frontend to easily group this specific data point
  category: { 
    type: String,
    default: 'Uncategorized'
  }
});

const socialMediaSchema = new mongoose.Schema({
  twitter: { type: String, default: '' },
  linkedin: { type: String, default: '' },
  instagram: { type: String, default: '' },
  facebook: { type: String, default: '' },
  whatsapp: { type: String, default: '' }
}, { _id: false });

// Structured postal address, used for both billing and shipping.
const postalAddressSchema = new mongoose.Schema({
  addressLine1: { type: String, default: '' },
  addressLine2: { type: String, default: '' },
  pincode: { type: String, default: '' },
  city: { type: String, default: '' },
  state: { type: String, default: '' },
  country: { type: String, default: '' },
}, { _id: false });

const companySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    industry: { type: String },
    gstin: {
      type: String,
    },
    leadSource: {
      type: String,
      default: "",
    },
    address: String, // legacy single-line address (kept for search/back-compat)
    // Exactly one billing address; GST (CGST/SGST vs IGST) is derived from its state.
    billingAddress: { type: postalAddressSchema, default: () => ({}) },
    // One or more shipping addresses.
    shippingAddresses: { type: [postalAddressSchema], default: [] },
    email: { type: String, trim: true, lowercase: true },
    // Kept structured rather than one string: the dial code is picked from a
    // fixed list while the number is free text, and wa.me links need them
    // concatenated without the "+" — splitting them here avoids re-parsing a
    // combined value at every call site. Distinct from socialMedia.whatsapp,
    // which is a profile/handle link, not a dialable number.
    whatsappNumber: {
      countryCode: { type: String, default: '' },
      number: { type: String, default: '' },
    },
    website: String,
    profilePicture: String,
    socialMedia: {
      type: socialMediaSchema,
      default: () => ({}),
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    // The org User (staff/admin) designated as this company's owner —
    // separate from `user` (the CRM user who originally created the record).
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false, default: null },
    lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    parentCompany: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      default: null,
    },
    subsidiaries: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Company",
      },
    ],
    additionalFields: [additionalFieldSchema],
    // Per-user "starred" flag — starring is a personal preference, not a
    // shared attribute of the record, so it's a list of users rather than
    // a single boolean.
    starredBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true },
);

module.exports = mongoose.model('Company', companySchema);