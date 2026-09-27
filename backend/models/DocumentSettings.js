const mongoose = require('mongoose');

const defaultDocumentTypeSettings = {
  invoice: {
    prefix: 'INV-',
    suffix: '',
    prefixes: ['INV-'],
    suffixes: [],
  },
  quote: {
    prefix: 'QT',
    suffix: '',
    prefixes: ['QT', 'QTN'],
    suffixes: [],
  },
  proformaInvoice: {
    prefix: 'PI',
    suffix: '',
    prefixes: ['PI', 'PFI'],
    suffixes: [],
  },
  deliveryChallan: {
    prefix: 'DC',
    suffix: '',
    prefixes: ['DC'],
    suffixes: [],
  },
  purchase: {
    prefix: 'PUR-',
    suffix: '',
    prefixes: ['PUR-'],
    suffixes: [],
  },
  purchaseOrder: {
    prefix: 'PO-',
    suffix: '',
    prefixes: ['PO-'],
    suffixes: [],
  },
  purchaseReturn: {
    prefix: 'PR-',
    suffix: '',
    prefixes: ['PR-'],
    suffixes: [],
  },
};

const documentSettingsSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      unique: true,
      index: true,
    },
    invoicePrefix: {
      type: String,
      default: 'INV-',
      trim: true,
    },
    invoiceSuffix: {
      type: String,
      default: '',
      trim: true,
    },
    invoicePrefixes: {
      type: [String],
      default: ['INV-'],
    },
    invoiceSuffixes: {
      type: [String],
      default: [],
    },
    documentTypeSettings: {
      type: Object,
      default: defaultDocumentTypeSettings,
    },
    nextInvoiceNumber: {
      type: Number,
      default: 1,
      min: 1,
    },
    // Boilerplate the editor can drop into a document's footer on request.
    // Stored per organization; documents keep their own copy once inserted.
    //
    // The two flat fields below are the org-wide fallback and predate per-type
    // text. The *ByType maps hold the real values, keyed by document type
    // (tax | performa | quotation | deliveryChallan); a type with no entry
    // falls back to the flat field, so existing settings keep working.
    defaultNotes: {
      type: String,
      default: '',
    },
    defaultTerms: {
      type: String,
      default: '',
    },
    defaultNotesByType: {
      type: Object,
      default: {},
    },
    defaultTermsByType: {
      type: Object,
      default: {},
    },
    signatures: [
      {
        id: { type: String, required: true },
        name: { type: String, required: true, trim: true },
        type: { type: String, enum: ['upload', 'draw', 'type'], required: true },
        dataUrl: { type: String, required: true },
        typedText: { type: String },
        fontId: { type: String },
        penColor: { type: String },
        isDefault: { type: Boolean, default: false },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    defaultDueDateDays: {
      type: Number,
      default: null,
    },
    // Visual PDF filename builder — stores an ordered list of token keys
    // per document type. Front-end resolves keys to real values at download
    // time. Stored as plain arrays, never as {placeholder} strings.
    pdfFilenameFormats: {
      type: Object,
      default: {
        tax:             ['documentType', 'documentNumber', 'companyName'],
        performa:        ['documentType', 'documentNumber', 'companyName'],
        quotation:       ['documentType', 'documentNumber', 'companyName'],
        deliveryChallan: ['documentType', 'documentNumber', 'companyName'],
        purchase:        ['documentType', 'documentNumber', 'companyName'],
        purchaseOrder:   ['documentType', 'documentNumber', 'companyName'],
      },
    },
    whatsappTemplate: {
      type: String,
      default: 'Hello {customerName},\n\nYour {docType} from {company} is ready.\n\nDocument: {number}\nTotal: ₹{amount}\nView/download: {link}\n\nRegards,\n{company}',
    },
    whatsappLine1: {
      type: String,
      default: 'Your {docType} from {company} is ready.',
    },
    whatsappLine2: {
      type: String,
      default: '',
    },
    smsTemplate: {
      type: String,
      default: '{company}: your {docType} {number} is ready. View/download: {link}',
    },
    emailSubjectTemplate: {
      type: String,
      default: '{docType} {number} from {company}',
    },
    emailBodyTemplate: {
      type: String,
      default: 'Dear {customerName},\n\nPlease find attached your {docType} {number}.\n\nYou can also view or download it online:\n{link}\n\nRegards,\n{company}',
    },
    // Named template libraries — lets an org keep several message variants per
    // channel (e.g. "Standard", "Payment Reminder") and pick one at send time.
    // The singular fields above predate this and now only serve as the seed
    // for each array's first entry, so existing customization isn't lost.
    whatsappTemplates: [
      {
        id: { type: String, required: true },
        name: { type: String, required: true, trim: true },
        line1: { type: String, default: '' },
        line2: { type: String, default: '' },
        isDefault: { type: Boolean, default: false },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    smsTemplates: [
      {
        id: { type: String, required: true },
        name: { type: String, required: true, trim: true },
        body: { type: String, default: '' },
        isDefault: { type: Boolean, default: false },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    emailTemplates: [
      {
        id: { type: String, required: true },
        name: { type: String, required: true, trim: true },
        subject: { type: String, default: '' },
        body: { type: String, default: '' },
        isDefault: { type: Boolean, default: false },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    // E-Invoice org-wide defaults.
    // supplyType: drives the IRP SupTyp field.
    //   Derive per-invoice later (GSTIN → B2B, SEZ → SEZWP/SEZWOP, etc.).
    //   For now, one global default covers the sandbox phase.
    // reverseCharge: maps to IRP RCB field (Y/N).
    //   Most organisations never use reverse charge — default false.
    eInvoiceDefaults: {
      supplyType: { type: String, default: 'B2B' },
      reverseCharge: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DocumentSettings', documentSettingsSchema);
