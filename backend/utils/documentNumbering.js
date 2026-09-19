const crypto = require('crypto');
const DocumentSettings = require('../models/DocumentSettings');
const Counter = require('../models/Counter');

const DEFAULT_PREFIX = 'INV-';

const DEFAULT_DOCUMENT_TYPES = {
  invoice: { label: 'Invoice', prefix: 'INV-', suffix: '', prefixes: ['INV-'], suffixes: [] },
  quote: { label: 'Quote', prefix: 'QT', suffix: '', prefixes: ['QT', 'QTN'], suffixes: [] },
  proformaInvoice: { label: 'Proforma Invoice', prefix: 'PI', suffix: '', prefixes: ['PI', 'PFI'], suffixes: [] },
  deliveryChallan: { label: 'Delivery Challan', prefix: 'DC', suffix: '', prefixes: ['DC'], suffixes: [] },
};

function toList(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => (value || '').toString().trim())
    .filter(Boolean);
}

function normalizeDocumentTypeSettings(documentTypeSettings = {}, fallback = {}) {
  const prefix = (documentTypeSettings.prefix || documentTypeSettings.invoicePrefix || fallback.prefix || '').toString().trim();
  const suffix = (documentTypeSettings.suffix || documentTypeSettings.invoiceSuffix || fallback.suffix || '').toString().trim();
  const prefixes = toList(documentTypeSettings.prefixes || documentTypeSettings.invoicePrefixes || fallback.prefixes);
  const suffixes = toList(documentTypeSettings.suffixes || documentTypeSettings.invoiceSuffixes || fallback.suffixes);

  return {
    prefix: prefix || fallback.prefix || DEFAULT_PREFIX,
    suffix,
    prefixes: prefixes.length ? prefixes : (fallback.prefixes && fallback.prefixes.length ? fallback.prefixes : [DEFAULT_PREFIX]),
    suffixes: suffixes.length ? suffixes : (fallback.suffixes || []),
  };
}

function normalizeDocumentTypeSettingsMap(documentTypeSettings = {}) {
  const normalized = {};
  Object.keys(DEFAULT_DOCUMENT_TYPES).forEach((documentTypeKey) => {
    const fallback = DEFAULT_DOCUMENT_TYPES[documentTypeKey];
    const incoming = documentTypeSettings?.[documentTypeKey] || {};
    normalized[documentTypeKey] = normalizeDocumentTypeSettings(incoming, fallback);
  });

  return normalized;
}

// Footer text keyed by document type. Only the accounting document types this
// app actually renders a footer for are accepted, so a malformed payload can't
// grow the document arbitrarily.
const FOOTER_DOC_TYPES = ['tax', 'performa', 'quotation', 'deliveryChallan'];

function normalizeFooterMap(map) {
  const out = {};
  if (!map || typeof map !== 'object') return out;
  for (const key of FOOTER_DOC_TYPES) {
    if (map[key] === undefined || map[key] === null) continue;
    out[key] = map[key].toString();
  }
  return out;
}

function normalizeInvoiceNumberSettings(settings = {}) {
  const documentTypeSettings = normalizeDocumentTypeSettingsMap(settings.documentTypeSettings || {});
  const invoiceSetting = documentTypeSettings.invoice;
  const invoicePrefix = (settings.invoicePrefix || invoiceSetting.prefix || '').toString().trim();
  const invoiceSuffix = (settings.invoiceSuffix || invoiceSetting.suffix || '').toString().trim();
  const nextInvoiceNumber = Number.isFinite(Number(settings.nextInvoiceNumber))
    ? Math.max(1, Number(settings.nextInvoiceNumber))
    : 1;

  const invoicePrefixes = toList(settings.invoicePrefixes || invoiceSetting.prefixes);
  const invoiceSuffixes = toList(settings.invoiceSuffixes || invoiceSetting.suffixes);

  return {
    invoicePrefix: invoicePrefix || invoiceSetting.prefix || DEFAULT_PREFIX,
    invoiceSuffix,
    invoicePrefixes: invoicePrefixes.length ? invoicePrefixes : (invoiceSetting.prefixes || [DEFAULT_PREFIX]),
    invoiceSuffixes: invoiceSuffixes.length ? invoiceSuffixes : (invoiceSetting.suffixes || []),
    nextInvoiceNumber,
    documentTypeSettings,
    defaultNotes: (settings.defaultNotes || '').toString(),
    defaultTerms: (settings.defaultTerms || '').toString(),
    // Per-document-type footer text. Types with nothing saved are simply
    // absent; callers fall back to the flat defaultNotes/defaultTerms above.
    defaultNotesByType: normalizeFooterMap(settings.defaultNotesByType),
    defaultTermsByType: normalizeFooterMap(settings.defaultTermsByType),
    documentTypes: Object.entries(DEFAULT_DOCUMENT_TYPES).map(([key, value]) => ({ key, label: value.label })),
    defaultDueDateDays: settings.defaultDueDateDays != null ? Number(settings.defaultDueDateDays) : null,
    whatsappTemplate: settings.whatsappTemplate != null ? String(settings.whatsappTemplate) : null,
    whatsappLine1: settings.whatsappLine1 != null ? String(settings.whatsappLine1) : 'Thanks for your business!',
    whatsappLine2: settings.whatsappLine2 != null ? String(settings.whatsappLine2) : '',
    smsTemplate: settings.smsTemplate != null ? String(settings.smsTemplate) : null,
    emailSubjectTemplate: settings.emailSubjectTemplate != null ? String(settings.emailSubjectTemplate) : null,
    emailBodyTemplate: settings.emailBodyTemplate != null ? String(settings.emailBodyTemplate) : null,
    whatsappTemplates: normalizeTemplateArray(settings.whatsappTemplates),
    smsTemplates: normalizeTemplateArray(settings.smsTemplates),
    emailTemplates: normalizeTemplateArray(settings.emailTemplates),
    pdfFilenameFormats: settings.pdfFilenameFormats,
  };
}

function normalizeTemplateArray(list) {
  if (!Array.isArray(list)) return [];
  return list.map((t) => ({ ...t }));
}

// One-time migration: an organization that customized the old single-slot
// whatsappLine1/2, smsTemplate, or email templates before the template
// library existed would otherwise lose that customization the first time the
// new UI runs (empty array = "nothing saved"). Seeds one named entry per
// channel from the legacy fields so it carries forward, then returns whether
// anything changed so the caller knows to persist it.
function seedTemplateLibrariesFromLegacy(settings) {
  let changed = false;
  const out = {};

  if (!Array.isArray(settings.whatsappTemplates) || settings.whatsappTemplates.length === 0) {
    out.whatsappTemplates = [{
      id: crypto.randomUUID(),
      name: 'Default',
      line1: settings.whatsappLine1 || 'Your {docType} from {company} is ready.',
      line2: settings.whatsappLine2 || '',
      isDefault: true,
      createdAt: new Date(),
    }];
    changed = true;
  }

  if (!Array.isArray(settings.smsTemplates) || settings.smsTemplates.length === 0) {
    out.smsTemplates = [{
      id: crypto.randomUUID(),
      name: 'Default',
      body: settings.smsTemplate || '{company}: your {docType} {number} is ready. View/download: {link}',
      isDefault: true,
      createdAt: new Date(),
    }];
    changed = true;
  }

  if (!Array.isArray(settings.emailTemplates) || settings.emailTemplates.length === 0) {
    out.emailTemplates = [{
      id: crypto.randomUUID(),
      name: 'Default',
      subject: settings.emailSubjectTemplate || '{docType} {number} from {company}',
      body: settings.emailBodyTemplate || 'Dear {customerName},\n\nPlease find attached your {docType} {number}.\n\nYou can also view or download it online:\n{link}\n\nRegards,\n{company}',
      isDefault: true,
      createdAt: new Date(),
    }];
    changed = true;
  }

  return { changed, fields: out };
}

function buildInvoiceNumber({ prefix, number, suffix }) {
  const normalizedPrefix = (prefix || '').toString().trim();
  const normalizedSuffix = (suffix || '').toString().trim();
  const normalizedNumber = Number(number);
  const hasPrefix = normalizedPrefix !== '';
  const hasSuffix = normalizedSuffix !== '';
  const effectivePrefix = hasPrefix ? normalizedPrefix : (hasSuffix ? '' : DEFAULT_PREFIX);
  const effectiveNumber = Number.isFinite(normalizedNumber) ? normalizedNumber.toString() : '';

  if (!effectiveNumber) {
    if (effectivePrefix && normalizedSuffix) {
      return `${effectivePrefix}-${normalizedSuffix}`;
    }

    return effectivePrefix || normalizedSuffix || DEFAULT_PREFIX;
  }

  const prefixWithSeparator = effectivePrefix && !effectivePrefix.endsWith('-') && (effectiveNumber || normalizedSuffix)
    ? `${effectivePrefix}-`
    : effectivePrefix;

  const suffixWithSeparator = normalizedSuffix && (effectiveNumber || effectivePrefix)
    ? `-${normalizedSuffix}`
    : '';

  return `${prefixWithSeparator}${effectiveNumber}${suffixWithSeparator}`;
}

function extractNumericInvoiceNumber(rawValue) {
  if (rawValue === null || rawValue === undefined) {
    return null;
  }

  const value = rawValue.toString().trim();
  if (!value) {
    return null;
  }

  const match = value.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function extractInvoiceNumberParts(rawValue) {
  if (rawValue === null || rawValue === undefined) {
    return null;
  }

  const value = rawValue.toString().trim();
  if (!value) {
    return null;
  }

  const segments = value.split('-').filter(Boolean);
  if (segments.length < 2) {
    return null;
  }

  if (segments.length >= 3) {
    const parsedNumber = Number(segments[segments.length - 2]);
    return Number.isFinite(parsedNumber)
      ? { number: parsedNumber, suffix: segments[segments.length - 1] }
      : null;
  }

  const parsedNumber = Number(segments[segments.length - 1]);
  return Number.isFinite(parsedNumber)
    ? { number: parsedNumber, suffix: '' }
    : null;
}

function resolveInvoiceNumber({ settings, providedNumber = null, lastInvoiceNumber = null }) {
  const normalizedSettings = normalizeInvoiceNumberSettings(settings);
  const hasExplicitNumber = typeof providedNumber === 'string'
    ? providedNumber.trim() !== ''
    : providedNumber !== null && providedNumber !== undefined;

  const fallbackNumber = extractNumericInvoiceNumber(lastInvoiceNumber);
  const fallbackParts = extractInvoiceNumberParts(lastInvoiceNumber);
  const suffixToUse = normalizedSettings.invoiceSuffix || fallbackParts?.suffix || '';
  const baseNumber = hasExplicitNumber
    ? providedNumber
    : (fallbackNumber !== null ? fallbackNumber + 1 : normalizedSettings.nextInvoiceNumber);
  const numberToUse = typeof baseNumber === 'string' && baseNumber.trim() !== '' ? Number(baseNumber) : baseNumber;
  const invoiceNumber = buildInvoiceNumber({
    prefix: normalizedSettings.invoicePrefix,
    number: numberToUse,
    suffix: suffixToUse,
  });

  return {
    invoiceNumber,
    nextInvoiceNumber: Number(numberToUse) + 1,
  };
}

// Shared, prefix-scoped "what's the next number" resolver — one implementation
// for all 4 document types instead of each controller reimplementing its own
// (and, in Invoice's case, getting it wrong: the old logic looked at
// whichever document was created most recently *regardless of prefix*, so
// changing the configured prefix from INV- to SALES- after INV-47 existed
// would produce SALES-48 instead of restarting at SALES-1).
//
// A document only counts toward "the last number for this prefix" if its
// number actually starts with the CURRENT prefix — so switching prefixes
// always restarts (or resumes, if documents already exist under the new
// prefix) cleanly, matching the configured prefix rather than the org's
// numbering history as a whole.
async function resolveNextNumberForPrefix({ Model, numberField, organization, prefix, session }) {
  const normalizedPrefix = (prefix || '').toString().trim() || DEFAULT_PREFIX;
  const escapedPrefix = normalizedPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Optional dash covers both "INV-" (already ends in -) and "QT"/"PI"/"DC"
  // (no trailing dash in their own default) style prefixes uniformly.
  // The trailing (?:-.+)? allows a suffix like "-26-27" so existing numbered
  // docs are still found when a suffix is configured.
  const pattern = new RegExp(`^${escapedPrefix}-?(\\d+)(?:-.+)?$`);

  let query = Model.find({ organization, [numberField]: { $regex: pattern } }).select(numberField);
  if (session) query = query.session(session);
  const docs = await query.lean();

  let maxNumber = 0;
  docs.forEach((doc) => {
    const match = String(doc[numberField] || '').match(pattern);
    const num = match ? parseInt(match[1], 10) : 0;
    if (num > maxNumber) maxNumber = num;
  });

  return maxNumber + 1;
}

// Persistent, monotonically-increasing counter per organization + document
// type (invoice | quote | proformaInvoice | deliveryChallan). Unlike the
// max-of-existing-documents scan above, this never reuses a number: deleting
// a document — even the most recently created one — does not roll the
// counter back, so the next document created always gets a genuinely new
// number and gaps left by deletions are never refilled. The counter is keyed
// by document type only (not by prefix), so changing the configured prefix
// in Settings does not restart or affect the sequence; it only changes how
// the number is displayed. This is a distinct key namespace from any counters
// used elsewhere, so every organization's sequence starts fresh at 1.
async function getNextCounterNumber({ organization, documentTypeKey, session }) {
  const counterId = `${organization}_doc_${documentTypeKey || 'invoice'}`;
  const counter = await Counter.findOneAndUpdate(
    { _id: counterId },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, session, setDefaultsOnInsert: true }
  );
  return counter.seq;
}


// ---------------------------------------------------------------------------
// Document number series. Every sales document type (invoice, quote, proforma
// invoice, delivery challan) runs as one; getNextCounterNumber below is the
// fallback for anything else.
//
// A series is one prefix + suffix within one Indian financial year (Apr-Mar):
//   - changing the Invoice prefix/suffix starts a fresh series at 1
//   - each new financial year starts a fresh series at 1 (GST requires invoice
//     numbers to be unique within a financial year, not across years)
//   - a series never re-uses a number: it starts after the highest number
//     already used in it (so existing invoices are never duplicated) and a
//     number that is already taken is skipped, never back-filled
//
// Counter doc id: `${org}_doc_invoice_fy${year}_${prefix}|${suffix}`.
// ---------------------------------------------------------------------------
const IST_OFFSET_MS = 330 * 60 * 1000;

// Financial year an invoice belongs to, as its starting calendar year (FY 2026-27 -> 2026).
// Evaluated in IST so an invoice dated 1 April is never counted in the previous year.
function financialYearOf(date) {
  const base = date ? new Date(date) : new Date();
  const d = new Date((Number.isNaN(base.getTime()) ? Date.now() : base.getTime()) + IST_OFFSET_MS);
  const year = d.getUTCFullYear();
  return d.getUTCMonth() >= 3 ? year : year - 1;
}

function financialYearRange(fy) {
  return {
    start: new Date(Date.UTC(fy, 3, 1) - IST_OFFSET_MS),
    end: new Date(Date.UTC(fy + 1, 3, 1) - IST_OFFSET_MS),
  };
}

function escapeForRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function invoiceSeries({ organization, prefix, suffix, date, documentTypeKey = 'invoice' }) {
  const typeKey = normalizeDocTypeKey(documentTypeKey);
  const normalizedPrefix = (prefix || '').toString().trim() || DEFAULT_PREFIX;
  const normalizedSuffix = (suffix || '').toString().trim();
  const fy = financialYearOf(date);
  const bare = normalizedPrefix.replace(/-+$/, '');
  return {
    typeKey,
    fy,
    prefix: normalizedPrefix,
    suffix: normalizedSuffix,
    counterId: `${organization}_doc_${typeKey}_fy${fy}_${normalizedPrefix}|${normalizedSuffix}`,
    // Same shape buildInvoiceNumber produces: PREFIX-N or PREFIX-N-SUFFIX.
    pattern: new RegExp(`^${escapeForRegex(bare)}-?(\\d+)${normalizedSuffix ? `-${escapeForRegex(normalizedSuffix)}` : ''}$`),
    dateRange: financialYearRange(fy),
  };
}

// Document types whose numbers run as a series (prefix + suffix + financial
// year). Everything else keeps the plain per-type counter.
//
// converterController historically passed 'quotation' where quotationController
// passes 'quote', which pointed the same document type at two different
// counters; both normalise to 'quote' here.
const SERIES_DOC_TYPES = {
  invoice:         { model: '../models/Invoice',         numberField: 'invoiceNumber' },
  quote:           { model: '../models/quotation',       numberField: 'quotationNumber' },
  proformaInvoice: { model: '../models/ProformaInvoice', numberField: 'performaInvoiceNumber' },
  deliveryChallan: { model: '../models/deliveryChallan', numberField: 'deliveryChallanNumber' },
};

function normalizeDocTypeKey(key) {
  const k = key || 'invoice';
  return k === 'quotation' ? 'quote' : k;
}

function isSeriesDocType(key) {
  return Object.prototype.hasOwnProperty.call(SERIES_DOC_TYPES, normalizeDocTypeKey(key));
}

// Lazy: keeps this util free of model import cycles.
function loadSeriesModel(key) {
  const entry = SERIES_DOC_TYPES[normalizeDocTypeKey(key)];
  if (!entry) return null;
  // eslint-disable-next-line global-require
  return { Model: require(entry.model), numberField: entry.numberField };
}

function loadInvoiceModel() {
  // Lazy: keeps this util free of a model import cycle.
  // eslint-disable-next-line global-require
  return require('../models/Invoice');
}

async function highestUsedInSeries(series, organization, Model = loadInvoiceModel(), numberField = 'invoiceNumber') {
  const docs = await Model.find({
    organization,
    date: { $gte: series.dateRange.start, $lt: series.dateRange.end },
    [numberField]: { $regex: series.pattern },
  }).select(numberField).lean();
  let max = 0;
  for (const doc of docs) {
    const match = String(doc[numberField] || '').match(series.pattern);
    const n = match ? parseInt(match[1], 10) : 0;
    if (n > max) max = n;
  }
  return max;
}

// Raises the series counter to at least `value`, creating it if needed. Never lowers it.
async function raiseInvoiceCounter(counterId, value, session) {
  const opts = { upsert: true };
  if (session) opts.session = session;
  try {
    await Counter.updateOne({ _id: counterId }, { $max: { seq: value } }, opts);
  } catch (err) {
    // Two first-time upserts racing: one inserts, the other retries as a plain update.
    if (err && err.code === 11000) {
      await Counter.updateOne({ _id: counterId }, { $max: { seq: value } }, session ? { session } : {});
    } else {
      throw err;
    }
  }
}

function numberInUse(Model, numberField, organization, number, series, session) {
  const query = Model.findOne({
    organization,
    [numberField]: number,
    date: { $gte: series.dateRange.start, $lt: series.dateRange.end },
  }).select('_id');
  if (session) query.session(session);
  return query.lean();
}

// Undo an auto-number's counter increment when the create that took it fails, so the number
// is not consumed. Only rolls back if nothing newer has been handed out since; otherwise the
// gap stays (numbers are never back-filled).
async function releaseInvoiceNumber(series, seq) {
  try {
    await Counter.updateOne({ _id: series.counterId, seq }, { $inc: { seq: -1 } });
  } catch (err) {
    console.error('Failed to release invoice number', series.counterId, seq, err);
  }
}

// Every create path (create, duplicate, convert) aborts its transaction on failure. Hook that
// abort once per session so auto-numbers taken inside it are released automatically, newest
// first, without each caller needing its own release call.
function releaseOnAbort(session, release) {
  if (!session) return;
  if (!session.__invoiceNumberReleases) {
    session.__invoiceNumberReleases = [];
    const originalAbort = session.abortTransaction.bind(session);
    session.abortTransaction = async (...args) => {
      const result = await originalAbort(...args);
      const releases = session.__invoiceNumberReleases.splice(0).reverse();
      for (const fn of releases) await fn();
      return result;
    };
  }
  session.__invoiceNumberReleases.push(release);
}

async function resolveInvoiceNumberInSeries({ Model, numberField, organization, prefix, suffix, date, providedNumber, session, documentTypeKey = 'invoice' }) {
  const series = invoiceSeries({ organization, prefix, suffix, date, documentTypeKey });

  // Manual number: must be unused within its financial year. Moves the counter past it (never
  // back), inside the caller's transaction so a failed create doesn't move it.
  if (providedNumber !== null && providedNumber !== undefined && providedNumber !== '') {
    const number = buildInvoiceNumber({ prefix: series.prefix, number: providedNumber, suffix: series.suffix });
    if (await numberInUse(Model, numberField, organization, number, series, session)) {
      const err = new Error(`${number} is already in use.`);
      err.code = 'DUPLICATE_NUMBER';
      throw err;
    }
    const match = number.match(series.pattern);
    if (match) await raiseInvoiceCounter(series.counterId, parseInt(match[1], 10), session);
    return number;
  }

  // Auto number. Seed from the highest number already used in this series (covers
  // organizations that had invoices before this counter existed), then take the next one
  // atomically. Deliberately outside the caller's transaction: a counter write inside a
  // transaction conflicts with any concurrent create, which would fail it instead of giving it
  // the next number. Failure is covered by releaseOnAbort.
  await raiseInvoiceCounter(series.counterId, await highestUsedInSeries(series, organization, Model, numberField));
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const { seq } = await Counter.findOneAndUpdate(
      { _id: series.counterId },
      { $inc: { seq: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    const number = buildInvoiceNumber({ prefix: series.prefix, number: seq, suffix: series.suffix });
    if (!(await numberInUse(Model, numberField, organization, number, series))) {
      releaseOnAbort(session, () => releaseInvoiceNumber(series, seq));
      return number;
    }
    // Already taken (e.g. entered manually): skip it; the counter has moved past it.
  }
  throw new Error('Could not allocate an invoice number.');
}

// After an invoice's number is changed by hand: if it belongs to the given series, make sure
// later auto numbers continue after it. Numbers from another prefix/suffix are left alone.
async function raiseInvoiceSeriesTo({ organization, prefix, suffix, date, number, documentTypeKey = 'invoice' }) {
  const series = invoiceSeries({ organization, prefix, suffix, date, documentTypeKey });
  const match = String(number || '').match(series.pattern);
  if (match) await raiseInvoiceCounter(series.counterId, parseInt(match[1], 10));
}

// Read-only: the next auto number the configured Invoice series would hand out today.
async function peekNextInvoiceNumber({ organization, prefix, suffix, date, documentTypeKey = 'invoice' }) {
  const loaded = loadSeriesModel(documentTypeKey);
  const Model = loaded ? loaded.Model : loadInvoiceModel();
  const numberField = loaded ? loaded.numberField : 'invoiceNumber';
  const series = invoiceSeries({ organization, prefix, suffix, date, documentTypeKey });
  const [counter, highest] = await Promise.all([
    Counter.findById(series.counterId).lean(),
    highestUsedInSeries(series, organization, Model, numberField),
  ]);
  let next = Math.max(counter?.seq || 0, highest) + 1;
  for (let i = 0; i < 1000; i += 1) {
    const number = buildInvoiceNumber({ prefix: series.prefix, number: next, suffix: series.suffix });
    if (!(await numberInUse(Model, numberField, organization, number, series))) break;
    next += 1;
  }
  return next;
}

// Settings "Next Invoice Number": moves the current series (configured prefix/suffix, current
// financial year) so its next auto number is at least `nextNumber`. Never lowers it and never
// affects other series, so a later prefix change or new financial year still starts at 1.
async function applyNextInvoiceNumberSetting({ organization, prefix, suffix, nextNumber, documentTypeKey = 'invoice' }) {
  const n = Number(nextNumber);
  if (!Number.isFinite(n) || n < 1) return;
  const series = invoiceSeries({ organization, prefix, suffix, documentTypeKey });
  const loaded = loadSeriesModel(documentTypeKey);
  const highest = loaded
    ? await highestUsedInSeries(series, organization, loaded.Model, loaded.numberField)
    : await highestUsedInSeries(series, organization);
  await raiseInvoiceCounter(series.counterId, highest);
  await raiseInvoiceCounter(series.counterId, Math.floor(n) - 1);
}

// Read-only peek at what the *next* number for each document type will be,
// without incrementing anything — used by the create-document screens to
// show the upcoming number (e.g. "2") before the document is actually saved,
// instead of a static/misleading placeholder. Safe to call as often as
// needed since it never mutates the counter.
async function getNextNumberPreviews(organizationId) {
  // Every document type now runs as a prefix + financial-year series, so each
  // preview is a read-only peek at that type's own series rather than a raw
  // counter read. Never mutates anything.
  const settings = await getDocumentSettingsForOrganization(organizationId);
  const previews = {};
  for (const key of Object.keys(DEFAULT_DOCUMENT_TYPES)) {
    const typeSettings = settings.documentTypeSettings?.[key] || {};
    const fallback = DEFAULT_DOCUMENT_TYPES[key] || {};
    try {
      previews[key] = await peekNextInvoiceNumber({
        organization: organizationId,
        documentTypeKey: key,
        prefix: typeSettings.prefix || (key === 'invoice' ? settings.invoicePrefix : fallback.prefix),
        suffix: typeSettings.suffix ?? (key === 'invoice' ? settings.invoiceSuffix : fallback.suffix),
      });
    } catch (err) {
      console.error('Failed to preview next number for', key, err);
      previews[key] = 1;
    }
  }
  return previews;
}

// Builds the final number for a document create (or convert) call, handling
// both cases: the client supplied an explicit number (validated for
// prefix-scoped uniqueness), or none was supplied (auto-generated from the
// persistent per-document-type counter). Always returns a fully-formed
// "PREFIX-N" string via buildInvoiceNumber so every document type gets
// identical separator handling. Pass the create call's transaction `session`
// through so the uniqueness check and counter increment see a consistent
// snapshot with the rest of that request.
async function resolveDocumentNumber({ Model, numberField, organization, documentTypeKey, prefix, suffix = '', providedNumber, session, date }) {
  // Every sales document runs as a prefix + financial-year series; anything else
  // keeps the plain per-type counter below.
  if (isSeriesDocType(documentTypeKey)) {
    return resolveInvoiceNumberInSeries({
      Model, numberField, organization, prefix, suffix, date, providedNumber, session, documentTypeKey,
    });
  }
  const normalizedPrefix = (prefix || '').toString().trim() || DEFAULT_PREFIX;
  const normalizedSuffix = (suffix || '').toString().trim();

  if (providedNumber !== null && providedNumber !== undefined && providedNumber !== '') {
    const number = buildInvoiceNumber({ prefix: normalizedPrefix, number: providedNumber, suffix: normalizedSuffix });
    let query = Model.findOne({ organization, [numberField]: number });
    if (session) query = query.session(session);
    const existing = await query.lean();
    if (existing) {
      const err = new Error(`${number} is already in use.`);
      err.code = 'DUPLICATE_NUMBER';
      throw err;
    }
    return number;
  }

  const nextNumber = await getNextCounterNumber({ organization, documentTypeKey, session });
  return buildInvoiceNumber({ prefix: normalizedPrefix, number: nextNumber, suffix: normalizedSuffix });
}

async function getDocumentSettingsForOrganization(organizationId) {
  if (!organizationId) {
    return normalizeInvoiceNumberSettings({});
  }

  const settings = await DocumentSettings.findOne({ organization: organizationId }).lean();
  return normalizeInvoiceNumberSettings(settings || {});
}

async function saveDocumentSettingsForOrganization(organizationId, payload = {}) {
  if (!organizationId) {
    throw new Error('organizationId is required');
  }

  const normalized = normalizeInvoiceNumberSettings(payload);
  const existing = await DocumentSettings.findOne({ organization: organizationId });

  const incomingDocumentTypeSettings = payload.documentTypeSettings && typeof payload.documentTypeSettings === 'object'
    ? payload.documentTypeSettings
    : {};

  const preparedDocumentTypeSettings = {};
  Object.keys(DEFAULT_DOCUMENT_TYPES).forEach((documentTypeKey) => {
    const incoming = incomingDocumentTypeSettings[documentTypeKey] || {};
    const fallback = documentTypeKey === 'invoice'
      ? {
          prefix: payload.invoicePrefix || normalized.invoicePrefix,
          suffix: payload.invoiceSuffix || normalized.invoiceSuffix,
          prefixes: payload.invoicePrefixes || normalized.invoicePrefixes,
          suffixes: payload.invoiceSuffixes || normalized.invoiceSuffixes,
        }
      : DEFAULT_DOCUMENT_TYPES[documentTypeKey];

    preparedDocumentTypeSettings[documentTypeKey] = normalizeDocumentTypeSettings(incoming, fallback);
  });

  const finalInvoicePrefix = payload.invoicePrefix?.toString().trim() || preparedDocumentTypeSettings.invoice.prefix;
  const finalInvoiceSuffix = payload.invoiceSuffix?.toString().trim() || preparedDocumentTypeSettings.invoice.suffix;

  const nextInvoicePrefixes = toList(payload.invoicePrefixes || preparedDocumentTypeSettings.invoice.prefixes);
  const nextInvoiceSuffixes = toList(payload.invoiceSuffixes || preparedDocumentTypeSettings.invoice.suffixes);

  const settingsPayload = {
    invoicePrefix: finalInvoicePrefix,
    invoiceSuffix: finalInvoiceSuffix,
    invoicePrefixes: nextInvoicePrefixes.length ? nextInvoicePrefixes : [DEFAULT_PREFIX],
    invoiceSuffixes: nextInvoiceSuffixes,
    documentTypeSettings: preparedDocumentTypeSettings,
    nextInvoiceNumber: normalized.nextInvoiceNumber,
  };

  // Footer boilerplate is only touched when the caller sends it, so saving
  // numbering settings alone can't wipe it.
  if (payload.defaultNotes !== undefined) {
    settingsPayload.defaultNotes = (payload.defaultNotes || '').toString();
  }
  if (payload.defaultTerms !== undefined) {
    settingsPayload.defaultTerms = (payload.defaultTerms || '').toString();
  }
  // Merged rather than replaced: the editor saves one document type at a time,
  // so sending just that key must not clear the others.
  if (payload.defaultNotesByType !== undefined) {
    settingsPayload.defaultNotesByType = {
      ...(existing?.defaultNotesByType || {}),
      ...normalizeFooterMap(payload.defaultNotesByType),
    };
  }
  if (payload.defaultTermsByType !== undefined) {
    settingsPayload.defaultTermsByType = {
      ...(existing?.defaultTermsByType || {}),
      ...normalizeFooterMap(payload.defaultTermsByType),
    };
  }
  if (payload.defaultDueDateDays !== undefined) {
    settingsPayload.defaultDueDateDays = payload.defaultDueDateDays != null ? Number(payload.defaultDueDateDays) : null;
  }
  if (payload.whatsappTemplate !== undefined) {
    settingsPayload.whatsappTemplate = (payload.whatsappTemplate || '').toString();
  }
  if (payload.whatsappLine1 !== undefined) {
    settingsPayload.whatsappLine1 = (payload.whatsappLine1 || '').toString();
  }
  if (payload.whatsappLine2 !== undefined) {
    settingsPayload.whatsappLine2 = (payload.whatsappLine2 || '').toString();
  }
  if (payload.smsTemplate !== undefined) {
    settingsPayload.smsTemplate = (payload.smsTemplate || '').toString();
  }
  if (payload.emailSubjectTemplate !== undefined) {
    settingsPayload.emailSubjectTemplate = (payload.emailSubjectTemplate || '').toString();
  }
  if (payload.emailBodyTemplate !== undefined) {
    settingsPayload.emailBodyTemplate = (payload.emailBodyTemplate || '').toString();
  }
  // Each array is sent whole by the Settings UI (it edits its local copy,
  // then saves the full list), so a plain replace is correct here — no merge.
  if (payload.whatsappTemplates !== undefined) {
    settingsPayload.whatsappTemplates = Array.isArray(payload.whatsappTemplates) ? payload.whatsappTemplates : [];
  }
  if (payload.smsTemplates !== undefined) {
    settingsPayload.smsTemplates = Array.isArray(payload.smsTemplates) ? payload.smsTemplates : [];
  }
  if (payload.emailTemplates !== undefined) {
    settingsPayload.emailTemplates = Array.isArray(payload.emailTemplates) ? payload.emailTemplates : [];
  }
  // Merge over existing so saving one doc type doesn't wipe the others.
  if (payload.pdfFilenameFormats !== undefined && typeof payload.pdfFilenameFormats === 'object') {
    settingsPayload.pdfFilenameFormats = {
      ...(existing?.pdfFilenameFormats || {}),
      ...payload.pdfFilenameFormats,
    };
  }

  const applyInvoiceStart = async () => {
    if (payload.nextInvoiceNumber === undefined) return;
    await applyNextInvoiceNumberSetting({
      organization: organizationId,
      prefix: preparedDocumentTypeSettings.invoice.prefix || finalInvoicePrefix,
      suffix: preparedDocumentTypeSettings.invoice.suffix ?? finalInvoiceSuffix,
      nextNumber: payload.nextInvoiceNumber,
    });
  };

  if (existing) {
    Object.assign(existing, settingsPayload);
    // Schema type Object: mongoose won't diff the nested keys on its own, so
    // say explicitly that these paths changed or the save is a no-op.
    for (const p of ['documentTypeSettings', 'defaultNotesByType', 'defaultTermsByType', 'pdfFilenameFormats']) {
      if (settingsPayload[p] !== undefined) existing.markModified(p);
    }
    await existing.save();
    await applyInvoiceStart();
    return existing;
  }

  const created = await DocumentSettings.create({ organization: organizationId, ...settingsPayload });
  await applyInvoiceStart();
  return created;
}

module.exports = {
  DEFAULT_PREFIX,
  isSeriesDocType,
  normalizeDocTypeKey,
  DEFAULT_DOCUMENT_TYPES,
  buildInvoiceNumber,
  normalizeInvoiceNumberSettings,
  resolveInvoiceNumber,
  resolveNextNumberForPrefix,
  resolveDocumentNumber,
  getNextCounterNumber,
  getNextNumberPreviews,
  financialYearOf,
  invoiceSeries,
  peekNextInvoiceNumber,
  applyNextInvoiceNumberSetting,
  releaseInvoiceNumber,
  raiseInvoiceSeriesTo,
  getDocumentSettingsForOrganization,
  saveDocumentSettingsForOrganization,
  seedTemplateLibrariesFromLegacy,
};
