const mongoose = require('mongoose');

const industrySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  // Optional suggestions for the company form's Sub-industry field (never
  // required). Set on the built-in industries from constants/industries.js.
  subIndustries: [{ type: String, trim: true }],
  // Position in the dropdown and which market the entry comes from ("IN" or
  // "INTL"). Only the built-in industries carry these.
  sortOrder: { type: Number },
  region: { type: String },
  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: false // default industries won't have an organization
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  }
}, { timestamps: true });

industrySchema.index({ organization: 1, name: 1 }, { unique: true, partialFilterExpression: { organization: { $exists: true } } });

module.exports = mongoose.model('Industry', industrySchema);
