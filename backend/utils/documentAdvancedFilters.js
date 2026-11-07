// utils/documentAdvancedFilters.js
//
// Server side of the Advanced Filter panel for the sales documents (invoices,
// pro forma invoices, quotations, delivery challans). They share the same
// columns, so one builder serves them all:
//   <number column>: contains / not_contains / starts_with / ends_with / is /
//                    is_not / in / not_in
//   deal:            is / is_not / contains  (matched on the deal's title)
//   date, dueDate:   { from, to } resolved by the browser (`to` exclusive)
//   amount:          { min, max } (either may be null)
//   status:          is / is_not / in / not_in
const Deal = require("../models/Deal");
const Vendor = require("../models/Vendor");
const { getOwnedDealIds } = require("./ownedCompanies");
const { getDocumentSettingsForOrganization } = require("./documentNumbering");

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Prefix = everything before the first digit, suffix = everything after the
// last digit ("GG-55-26-27" has prefix "GG-" and no suffix; "INV-0012/A" has
// prefix "INV-" and suffix "/A").
const splitDocumentNumber = (num) => {
  const m = /^(\D*)(.*?)(\D*)$/.exec(String(num || ""));
  return { prefix: m ? m[1] : "", suffix: m ? m[3] : "" };
};

// Per-document differences. Sales documents link a Deal (matched on its title);
// purchase documents link a Vendor (matched on its name) and store their own
// date/amount field names.
const SALES_OPTS = {
  partyColumn: "deal",
  partyPath: "deal",
  findPartyIds: async (organization, match) =>
    (await Deal.find({ organization, title: match }, { _id: 1 }).lean()).map((d) => d._id),
  dateFields: { date: "date", dueDate: "dueDate" },
  amountField: "amount",
};
const PURCHASE_ORDER_OPTS = {
  partyColumn: "vendor",
  partyPath: "vendor",
  findPartyIds: async (organization, match) =>
    (await Vendor.find({ organization, name: match }, { _id: 1 }).lean()).map((v) => v._id),
  dateFields: { date: "orderDate" },
  amountField: "totalAmount",
};

const PURCHASE_OPTS = {
  ...PURCHASE_ORDER_OPTS,
  dateFields: { date: "purchaseDate" },
  amountField: "grandTotal",
  // The Purchases list shows Confirmed and Partial as Pending.
  statusGroups: { Pending: ["Pending", "Confirmed", "Partial"] },
};

const PURCHASE_RETURN_OPTS = {
  ...PURCHASE_OPTS,
  dateFields: { date: "returnDate" },
};

// Sales returns link a Deal like the other sales documents, but date and total
// live under their own field names; reason/notes are free-text columns.
const SALES_RETURN_OPTS = {
  dateFields: { date: "returnDate" },
  amountField: "grandTotal",
  textFields: { reason: "reason", notes: "notes" },
};

// Sales subscriptions link a Deal like the other sales documents; the
// per-cycle total is `amount`, and the first billing date is `startDate`.
const SALES_SUBSCRIPTION_OPTS = {
  dateFields: { date: "startDate" },
  amountField: "amount",
  textFields: { notes: "notes" },
};

// E-invoices keep the customer name and the IRP fields on the document itself,
// so the party and a few text columns are matched by regex instead of by id.
const E_INVOICE_OPTS = {
  partyColumn: "customer",
  partyRegexField: "customer.name",
  textFields: { irn: "irn", ackNo: "ackNo" },
  dateFields: { date: "date" },
  amountField: "amount",
};

// Turns Advanced Filter rules into Mongo conditions (ANDed together).
const buildDocumentAdvancedConditions = async (rules, organization, numberField, opts = SALES_OPTS) => {
  const { partyColumn, partyPath, findPartyIds, dateFields, amountField, statusGroups, partyRegexField, textFields = {} } = { ...SALES_OPTS, ...opts };
  const conditions = [];
  for (const rule of rules) {
    if (!rule || !rule.column) continue;
    const { column, operator, value } = rule;
    const list = Array.isArray(value)
      ? value
      : String(value ?? "").split(",").map((s) => s.trim()).filter(Boolean);

    if (column === numberField) {
      const v = String(Array.isArray(value) ? "" : value ?? "").trim();
      const re = (src) => new RegExp(src, "i");
      switch (operator) {
        case "contains": if (v) conditions.push({ [numberField]: re(escapeRegex(v)) }); break;
        case "not_contains": if (v) conditions.push({ [numberField]: { $not: re(escapeRegex(v)) } }); break;
        case "starts_with": if (v) conditions.push({ [numberField]: re(`^${escapeRegex(v)}`) }); break;
        case "ends_with": if (v) conditions.push({ [numberField]: re(`${escapeRegex(v)}$`) }); break;
        case "is": if (v) conditions.push({ [numberField]: re(`^${escapeRegex(v)}$`) }); break;
        case "is_not": if (v) conditions.push({ [numberField]: { $not: re(`^${escapeRegex(v)}$`) } }); break;
        case "in": if (list.length) conditions.push({ [numberField]: { $in: list.map((x) => re(`^${escapeRegex(x)}$`)) } }); break;
        case "not_in": if (list.length) conditions.push({ [numberField]: { $nin: list.map((x) => re(`^${escapeRegex(x)}$`)) } }); break;
        default: break;
      }
    } else if (Object.prototype.hasOwnProperty.call(textFields, column) || (column === partyColumn && partyRegexField)) {
      const field = column === partyColumn ? partyRegexField : textFields[column];
      const v = String(Array.isArray(value) ? "" : value ?? "").trim();
      if (!v) continue;
      const exact = new RegExp(`^${escapeRegex(v)}$`, "i");
      if (operator === "contains") conditions.push({ [field]: new RegExp(escapeRegex(v), "i") });
      else if (operator === "is") conditions.push({ [field]: exact });
      else if (operator === "is_not") conditions.push({ [field]: { $not: exact } });
    } else if (column === partyColumn) {
      const v = String(Array.isArray(value) ? "" : value ?? "").trim();
      if (!v) continue;
      const titleMatch =
        operator === "contains"
          ? { $regex: escapeRegex(v), $options: "i" }
          : { $regex: `^${escapeRegex(v)}$`, $options: "i" };
      const ids = await findPartyIds(organization, titleMatch);
      conditions.push({ [partyPath]: operator === "is_not" ? { $nin: ids } : { $in: ids } });
    } else if (Object.prototype.hasOwnProperty.call(dateFields, column)) {
      const from = rule.from ? new Date(rule.from) : null;
      const to = rule.to ? new Date(rule.to) : null;
      const range = {};
      if (from && !Number.isNaN(from.getTime())) range.$gte = from;
      if (to && !Number.isNaN(to.getTime())) range.$lt = to;
      if (Object.keys(range).length) conditions.push({ [dateFields[column]]: range });
    } else if (column === "amount") {
      const min = value && value.min != null && value.min !== "" ? Number(value.min) : null;
      const max = value && value.max != null && value.max !== "" ? Number(value.max) : null;
      const range = {};
      if (Number.isFinite(min)) range.$gte = min;
      if (Number.isFinite(max)) range.$lte = max;
      if (Object.keys(range).length) conditions.push({ [amountField]: range });
    } else if (column === "status") {
      const expand = (vals) => vals.flatMap((v) => (statusGroups && statusGroups[v]) || [v]);
      if (operator === "is" && value) conditions.push({ status: { $in: expand([value]) } });
      else if (operator === "is_not" && value) conditions.push({ status: { $nin: expand([value]) } });
      else if (operator === "in" && list.length) conditions.push({ status: { $in: expand(list) } });
      else if (operator === "not_in" && list.length) conditions.push({ status: { $nin: expand(list) } });
    }
  }
  return conditions;
};

// Builds the GET .../filter-options handler for one document model: the
// numbers/prefixes/suffixes/deals the panel suggests, plus amount bounds.
// `settingsKey` is the document's key in Document Settings (invoice, quote,
// proformaInvoice, deliveryChallan) so configured prefixes/suffixes show up too.
const createFilterOptionsHandler = ({ Model, numberField, settingsKey, purchase = false, amountField: amountFieldOverride }) => async (req, res) => {
  try {
    const partyPath = purchase ? "vendor" : "deal";
    const amountField = amountFieldOverride || (purchase ? "totalAmount" : "amount");
    const match = { organization: req.user.organization };
    if (req.ownOnly) {
      if (purchase) {
        match.user = req.user._id;
      } else {
        const ownedDealIds = await getOwnedDealIds(req.user._id, req.user.organization);
        match.$or = [{ user: req.user._id }, { deal: { $in: ownedDealIds } }];
      }
    }

    const [numbers, dealIds, bounds] = await Promise.all([
      Model.find(match).sort({ createdAt: -1 }).limit(1000).distinct(numberField),
      Model.find(match).distinct(partyPath),
      Model.aggregate([
        { $match: match },
        { $group: { _id: null, min: { $min: `$${amountField}` }, max: { $max: `$${amountField}` } } },
      ]),
    ]);

    const deals = purchase
      ? (await Vendor.find({ _id: { $in: dealIds }, organization: req.user.organization }, { name: 1 }).lean()).map((v) => ({ title: v.name }))
      : await Deal.find(
          { _id: { $in: dealIds }, organization: req.user.organization },
          { title: 1 }
        ).lean();

    const prefixes = new Set();
    const suffixes = new Set();
    numbers.forEach((n) => {
      const { prefix, suffix } = splitDocumentNumber(n);
      if (prefix) prefixes.add(prefix);
      if (suffix) suffixes.add(suffix);
    });
    try {
      const settings = await getDocumentSettingsForOrganization(req.user.organization);
      const typeSettings = settings?.documentTypeSettings?.[settingsKey] || {};
      (typeSettings.prefixes || (typeSettings.prefix ? [typeSettings.prefix] : [])).forEach((p) => p && prefixes.add(p));
      (typeSettings.suffixes || (typeSettings.suffix ? [typeSettings.suffix] : [])).forEach((s) => s && suffixes.add(s));
    } catch (_) { /* settings are only a bonus source of suggestions */ }

    const uniqueTitles = [...new Set(deals.map((d) => d.title).filter(Boolean))];
    res.json({
      numbers: numbers.sort(),
      prefixes: [...prefixes].sort(),
      suffixes: [...suffixes].sort(),
      deals: uniqueTitles.sort((a, b) => a.localeCompare(b)).map((t) => ({ value: t, label: t })),
      amountMin: Math.floor(bounds[0]?.min ?? 0),
      amountMax: Math.ceil(bounds[0]?.max ?? 0),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// The issue-date range from the list's date button: ?dateFrom=ISO&dateTo=ISO
// (from inclusive, to exclusive, resolved by the browser in the user's own
// timezone). Returns a Mongo range for `date`, or null when neither is valid.
const parseIssueDateRange = (query) => {
  const from = query.dateFrom ? new Date(query.dateFrom) : null;
  const to = query.dateTo ? new Date(query.dateTo) : null;
  const range = {};
  if (from && !Number.isNaN(from.getTime())) range.$gte = from;
  if (to && !Number.isNaN(to.getTime())) range.$lt = to;
  return Object.keys(range).length > 0 ? range : null;
};

module.exports = {
  buildDocumentAdvancedConditions,
  createFilterOptionsHandler,
  parseIssueDateRange,
  PURCHASE_ORDER_OPTS,
  PURCHASE_OPTS,
  PURCHASE_RETURN_OPTS,
  SALES_SUBSCRIPTION_OPTS,
  SALES_RETURN_OPTS,
  E_INVOICE_OPTS,
};
