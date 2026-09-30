// models/Note.js
const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
  title: {
    type: String,
    trim: true,
  },
  note: {
    type: String,
    required: true,
  },
  // Open string — supports custom note types configured in SystemDefaultsSettings
  noteType: {
    type: String,
    default: 'General Note',
  },
  visibility: {
    type: String,
    enum: ['Team', 'Private'],
    default: 'Team',
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    default: null,
  },
  // Optional deal the note belongs to. When set, the note is scoped to that one
  // deal (its company is still recorded above so company-level views keep working).
  deal: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Deal',
    index: true,
  },
  taggedContacts: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contact',
    },
  ],
  // Additional deals/invoices linked from the note editor's "Link Deal" /
  // "Link Invoice" fields — separate from the single `deal` above, which
  // scopes the note itself to one deal (e.g. when created from a deal page).
  taggedDeals: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Deal',
    },
  ],
  taggedInvoices: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
    },
  ],
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
  },
}, { timestamps: true });

module.exports = mongoose.model('Note', noteSchema);

