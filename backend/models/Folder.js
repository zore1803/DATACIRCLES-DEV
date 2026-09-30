const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  fileName: { type: String, required: true },
  fileType: String,
  fileUrl: { type: String, required: true },
  fileSize: Number,
  isLink: { type: Boolean, default: false }, // NEW: Identifies if this is a hyperlink
  uploadedAt: { type: Date, default: Date.now }
}, { _id: false });

const folderSchema = new mongoose.Schema({
  name: { type: String, required: true },
  // A company folder has only `company`. A deal folder has `deal` and, when the
  // deal is linked to a company, that company too (so the company's Folders
  // tab can show its deals' folders alongside its own).
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: function () { return !this.deal; },
  },
  deal: { type: mongoose.Schema.Types.ObjectId, ref: 'Deal', default: null, index: true },
  files: [fileSchema],
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('Folder', folderSchema);
