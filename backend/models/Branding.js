const mongoose = require('mongoose');

const brandingSchema = new mongoose.Schema({
  companyName: String,
  companyType: { type: String, default: '' },
  gstin: String,
  address: String,
  city: { type: String, default: '' },
  pincode: { type: String, default: '' },
  state: { type: String, default: '' },
  email: String,
  mobile: String,
  alternateContact: { type: String, default: '' },
  panNumber: { type: String, default: '' },
  website: { type: String, default: '' },
  logoUrl: String,
  signatureUrl: String,
  colors: {
    primary: String,
    secondary: String,
  },
  organization: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Organization', 
    required: true 
  }
}, { timestamps: true });

// Index for better query performance
brandingSchema.index({ organization: 1, updatedAt: -1 });

module.exports = mongoose.model('Branding', brandingSchema);