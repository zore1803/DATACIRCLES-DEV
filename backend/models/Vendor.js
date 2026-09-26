// models/Vendor.js
const mongoose = require("mongoose");

const additionalFieldSchema = new mongoose.Schema({
  key: { type: String, required: true },
  value: mongoose.Schema.Types.Mixed, // Can store string, number, or any value
  type: { 
    type: String, 
    enum: ['string', 'number', 'dropdown', 'text', 'url', 'date', 'multiselect'],
    default: 'text'
  },
  // 👉 ADDED: This stores the category name that this field belongs to
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
  whatsapp: { type: String, default: '' },
}, { _id: false });

const vendorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: String,
  email: String,
  company: String,
  gstin: String,
  address: {
    line1: String,
    line2: String,
    city: String,
    state: String,
    stateCode: String,
    pincode: String,
    country: { type: String, default: "India" }
  },
  // DEPRECATED as a source of truth. Total Given / Total Got / Net Balance are
  // derived from the Payment collection on read (services/partyLedgerService),
  // and the API responses overwrite `balance` with that derived Net Balance.
  // Nothing writes this field any more except the CSV import below, which
  // keeps accepting an imported column so existing import files don't break.
  // Do not use it for financial calculations, and do not reintroduce
  // incremental += / -= updates: that is exactly what used to drift.
  balance: { type: Number, default: 0 },
  avatar: String,
  socialMedia: { 
    type: socialMediaSchema, 
    default: () => ({}) 
  },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  
  additionalFields: [additionalFieldSchema]
}, { timestamps: true });

module.exports = mongoose.model("Vendor", vendorSchema);