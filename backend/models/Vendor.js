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