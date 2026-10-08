// controllers/insightsController.js
//
// Additive reporting endpoint for the Insights page. It reproduces — in MongoDB
// aggregation — the analytics the page currently computes client-side after
// downloading whole collections. NOTHING here changes existing behavior:
//
//  - Business math mirrors Insights.jsx EXACTLY (see DASHBOARD_INSIGHTS_PHASE1_AUDIT.md
//    and INSIGHTS_PHASE4_REPORT.md). Insights' invoice/deal/purchase definitions are
//    its OWN — they are deliberately NOT the Dashboard's (e.g. Insights "collected"
//    = status "Paid"; Dashboard "paid" = status "accepted"). We follow Insights here.
//  - Per-module plan/permission/ownOnly gating reuses the project's real middleware
//    (run in-process via runGate) so scoping can never drift from the list routes.
//    A module the user/plan can't read degrades to 0/[] for that section only.
//  - Date range + the per-entity date field match Insights' filteredData exactly:
//      contacts/companies/deals/vendors -> createdAt
//      purchases                        -> purchaseDate || createdAt
//      purchaseOrders                   -> orderDate   || createdAt
//      invoices                         -> date        || createdAt
//    Range is inclusive on both ends and parsed with `new Date(str)` — the identical
//    instant the browser produced — so no timezone shift is introduced. Calendar-month
//    bucketing (year-merged, matching Insights) uses an optional IANA `tz` param so
//    Phase 5 can pass the browser's zone and keep month boundaries identical.
//
// Step 1 of the Overview migration adds three sections - overviewStats, dailyTrends,
// activity - that mirror the remaining raw-collection Overview widgets (stat-card
// totals + MoM, "Revenue vs Business Spends" daily chart, Activity Feed). Each is
// computed independently and degrades to null on failure so it can never take the
// rest of the report down. See the section helpers at the bottom of this file.
//
// This endpoint is ADDITIVE. The frontend still uses its existing requests until
// Phase 5 parity verification.

const Contact = require("../models/Contact");
const Company = require("../models/Company");
const Deal = require("../models/Deal");
const Vendor = require("../models/Vendor");
const partyLedger = require("../services/partyLedgerService");
const Purchase = require("../models/Purchase");
const PurchaseOrder = require("../models/PurchaseOrder");
const Invoice = require("../models/Invoice");
const Task = require("../models/Task");
const User = require("../models/User");
const Meeting = require("../models/Meeting");
const restrictByPlan = require("../middlewares/restrictByPlan");
const checkPermission = require("../middlewares/checkPermission");
const { getOwnedCompanyIds, getOwnedDealIds } = require("../utils/ownedCompanies");
const { cacheGetOrSet } = require("../cacheHelper");

const INSIGHTS_REPORT_TTL_SECONDS = 60;

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Run an Express (req,res,next) middleware in-process; resolve true iff it calls
// next() without an error (access granted). Any res.* response resolves false.
function runGate(mw, req) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (!settled) {
        settled = true;
        resolve(ok);
      }
    };
    const fakeRes = {
      status() {
        return this;
      },
      json() {
        finish(false);
        return this;
      },
      send() {
        finish(false);
        return this;
      },
      end() {
        finish(false);
        return this;
      },
    };
    try {
      const ret = mw(req, fakeRes, (err) => finish(!err));
      if (ret && typeof ret.then === "function") ret.catch(() => finish(false));
    } catch (e) {
      finish(false);
    }
  });
}

// Mirrors the route chain: subscriptionGate (route-level) -> restrictByPlan(module,"read")
// -> checkPermission(resource,"readonly"). Returns { allowed, ownOnly }.
async function resolveModuleAccess(req, planModule, permResource) {
  req.ownOnly = false;
  const planOk = await runGate(restrictByPlan(planModule, "read"), req);
  if (!planOk) return { allowed: false, ownOnly: false };
  const permOk = await runGate(checkPermission(permResource, "readonly"), req);
  return { allowed: permOk, ownOnly: !!req.ownOnly };
}

// Turn grouped { <monthNumber 1..12>: value } into the fixed 12-entry array the
// Insights charts expect (Jan..Dec), matching its year-merged getMonth bucketing.
function toMonthArray(groups, keys) {
  return MONTH_LABELS.map((label, idx) => {
    const g = groups[idx + 1] || {};
    const row = { month: label };
    keys.forEach((k) => {
      row[k] = g[k] || 0;
    });
    return row;
  });
}

const getReport = async (req, res) => {
  try {
    const org = req.user.organization;
    const userId = req.user._id;

    // --- Date range (optional; Insights only filters when BOTH are present) ---
    const { startDate, endDate } = req.query;
    const hasStart = startDate !== undefined && startDate !== "";
    const hasEnd = endDate !== undefined && endDate !== "";
    if (hasStart !== hasEnd) {
      return res.status(400).json({
        message: "Provide both startDate and endDate, or neither.",
      });
    }
    let range = null;
    if (hasStart && hasEnd) {
      const s = new Date(startDate);
      const e = new Date(endDate);
      if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
        return res.status(400).json({ message: "Invalid startDate or endDate." });
      }
      if (s.getTime() > e.getTime()) {
        return res.status(400).json({ message: "startDate must be on or before endDate." });
      }
      range = { start: s, end: e };
    }

    // IANA timezone for calendar-month bucketing. Defaults to UTC; Phase 5 sends
    // the browser's zone so month boundaries match the client's getMonth() exactly.
    const tz = typeof req.query.tz === "string" && req.query.tz ? req.query.tz : "UTC";
    if (!isValidTimeZone(tz)) {
      return res.status(400).json({ message: "Invalid tz." });
    }

    // Insights' status filters (Insights.jsx `filters` state). Same keys, same
    // "all" default, same exact-match (===) semantics. They only affect the new
    // overviewStats / dailyTrends sections - the legacy `summary` is unchanged.
    const parsedFilters = parseStatusFilters(req.query);
    if (parsedFilters.error) {
      return res.status(400).json({ message: parsedFilters.error });
    }
    const statusFilters = parsedFilters.filters;

    // Redis cache (60s), keyed by EVERY input that can change the report: tenant,
    // user (drives ownOnly + the per-user Activity tasks), role, the validated date
    // range, tz and the four status filters. Validation above runs on every request
    // (errors are never cached); gating still runs inside the cached computation.
    const cacheKey = [
      "insights:report",
      String(org),
      String(userId),
      req.user.role || "none",
      range ? range.start.toISOString() : "all",
      range ? range.end.toISOString() : "all",
      tz,
      statusFilters.contactStatus || "all",
      statusFilters.dealStage || "all",
      statusFilters.purchaseStatus || "all",
      statusFilters.poStatus || "all",
    ].join(":");

    const report = await cacheGetOrSet(cacheKey, INSIGHTS_REPORT_TTL_SECONDS, async () => {
    const [deals, invoices, purchases, vendors, contacts, companies, pos, topCustomers, overviewStats, dailyTrends, activity, dealsSection, poSection, purchasesSection, invoicesSection, vendorsSection, companiesSection, contactsSection] =
      await Promise.all([
        computeDeals(req, org, userId, range, tz, statusFilters.dealStage),
        computeInvoices(req, org, userId, range, tz),
        computePurchases(req, org, userId, range, tz),
        computeVendors(req, org, userId, range),
        computeCountInRange(req, org, userId, range, "contacts", "contacts", Contact, "createdAt", contactOwn),
        computeCountInRange(req, org, userId, range, "companies", "Companies", Company, "createdAt", companyOwn),
        computePurchaseOrders(req, org, userId, range),
        computeTopCustomers(req, org, userId, range),
        safeSection("overviewStats", () => computeOverviewStats(req, org, userId, range, tz, statusFilters)),
        safeSection("dailyTrends", () => computeDailyTrends(req, org, userId, range, tz, statusFilters)),
        safeSection("activity", () => computeActivity(req, org, userId)),
        safeSection("deals", () => computeDealsSection(req, org, userId, range, tz, statusFilters.dealStage)),
        safeSection("purchaseOrders", () => computePurchaseOrdersSection(req, org, userId, range, tz, statusFilters.poStatus)),
        safeSection("purchases", () => computePurchasesSection(req, org, userId, range, tz, statusFilters.purchaseStatus)),
        safeSection("invoices", () => computeInvoicesSection(req, org, userId, range, tz)),
        safeSection("vendors", () => computeVendorsSection(req, org, userId, range, tz, statusFilters.purchaseStatus)),
        safeSection("companies", () => computeCompaniesSection(req, org, userId, range, tz, statusFilters.dealStage)),
        safeSection("contacts", () => computeContactsSection(req, org, userId, range, tz, { contactStatus: statusFilters.contactStatus, dealStage: statusFilters.dealStage })),
      ]);

    const revenue = invoices.revenue;
    const collected = invoices.collected;
    const outstanding = revenue - collected;

    return {
      summary: {
        // Overview StatCards (Insights.jsx:1336-1411) — counts/sums over the
        // date-filtered set.
        totalContacts: contacts,
        totalCompanies: companies,
        totalDeals: deals.total, // "Active Deals" tile = filteredDeals.length
        totalVendors: vendors.total,
        totalDealValue: deals.totalValue,
        totalPurchasesValue: purchases.totalAmountValue, // tile sums purchase.grandTotal
        totalInvoices: invoices.total,
        totalInvoiceValue: revenue,
        // Sales Performance / Revenue & Collections (Insights.jsx:1633-1648).
        revenue, // Σ invoice.amount (all statuses)
        collected, // Σ invoice.amount where status === "Paid"
        outstanding,
        collectionRate: revenue > 0 ? Math.round((collected / revenue) * 100) : 0,
        wonDeals: deals.won,
        lostDeals: deals.lost,
        winRate: deals.won + deals.lost > 0 ? Math.round((deals.won / (deals.won + deals.lost)) * 100) : 0,
        avgDealSize: deals.total > 0 ? deals.totalValue / deals.total : 0,
      },
      // Revenue & Collections chart (Insights.jsx:1662) — year-merged months.
      revenueByMonth: invoices.byMonth,
      // Deal count + value per calendar month (monthlyTrends.deals is count).
      dealsByMonth: deals.byMonth,
      // Purchase count + value per calendar month (monthlyTrends.purchases is count).
      purchaseByMonth: purchases.byMonth,
      // Top Revenue Generating Companies (Insights.jsx:2980-3020), top 5.
      topCustomers,
      // Top Vendors by Spend (Insights.jsx:4260), top 4.
      topVendors: purchases.topVendors,
      // Deal Pipeline — count+value per deal.status over filtered deals
      // (Insights.jsx:1650). The frontend applies live Kanban ordering/filtering
      // via GET /api/kanban (kept separate).
      pipeline: deals.pipeline,
      // Overview StatCards incl. MoM, honoring the status filters (Insights.jsx:1379-1457).
      overviewStats,
      // "Revenue vs Business Spends" daily chart (Insights.jsx:709-779). null on failure.
      dailyTrends,
      // Overview Activity Feed, latest 20 (Insights.jsx:1223-1295). null on failure.
      activity,
      // Deals tab (renderDealsReport). null on failure -> client falls back to raw data.
      deals: dealsSection,
      // Purchase Orders tab (renderPurchaseOrdersReport). null on failure -> client falls back to raw data.
      purchaseOrders: poSection,
      // Purchases tab (renderPurchasesReport). null on failure -> client falls back to raw data.
      purchases: purchasesSection,
      // Invoices tab (renderInvoicesReport). null on failure -> client falls back to raw data.
      invoices: invoicesSection,
      // Vendors tab (renderVendorsReport). null on failure -> client falls back to raw data.
      vendors: vendorsSection,
      // Companies tab (renderCompaniesReport). null on failure -> client falls back to raw data.
      companies: companiesSection,
      // Contacts tab (renderContactsReport). null on failure -> client falls back to raw data.
      contacts: contactsSection,
    };
    });

    res.json(report);
  } catch (err) {
    console.error("Insights report error:", err);
    res.status(500).json({ message: err.message });
  }
};

// ---- ownOnly filter builders (match each list controller exactly) ----
function companyOwn(userId) {
  return { $or: [{ user: userId }, { createdBy: userId }, { owner: userId }] };
}
async function contactOwn(userId, org) {
  const ownedCompanyIds = await getOwnedCompanyIds(userId, org);
  return { $or: [{ user: userId }, { createdBy: userId }, { company: { $in: ownedCompanyIds } }] };
}
async function dealOwn(userId, org) {
  const ownedCompanyIds = await getOwnedCompanyIds(userId, org);
  return { $or: [{ user: userId }, { createdBy: userId }, { company: { $in: ownedCompanyIds } }] };
}
function userOwn(userId) {
  return { user: userId };
}
async function invoiceOwn(userId, org) {
  const ownedDealIds = await getOwnedDealIds(userId, org);
  return { $or: [{ user: userId }, { deal: { $in: ownedDealIds } }] };
}

// Build a $match for org + ownOnly + optional date range on `dateField` (direct
// field, no fallback).
function buildMatch(org, ownClause, range, dateField) {
  const match = { organization: org };
  if (ownClause) Object.assign(match, ownClause);
  if (range) match[dateField] = { $gte: range.start, $lte: range.end };
  return match;
}

// For entities whose effective date is `primary || createdAt`, return the
// pipeline stages that add `_effDate` and match org/own/range on it.
function effDateStages(org, ownClause, range, primaryField) {
  const stages = [{ $match: Object.assign({ organization: org }, ownClause || {}) }];
  stages.push({ $addFields: { _effDate: { $ifNull: [`$${primaryField}`, "$createdAt"] } } });
  if (range) stages.push({ $match: { _effDate: { $gte: range.start, $lte: range.end } } });
  return stages;
}

// Generic count-in-range for contacts/companies (createdAt, with ownOnly).
async function computeCountInRange(req, org, userId, range, planModule, permResource, Model, dateField, ownFn) {
  const access = await resolveModuleAccess(req, planModule, permResource);
  if (!access.allowed) return 0;
  const ownClause = access.ownOnly ? await ownFn(userId, org) : null;
  return Model.countDocuments(buildMatch(org, ownClause, range, dateField));
}

async function computeVendors(req, org, userId, range) {
  const empty = { total: 0 };
  const access = await resolveModuleAccess(req, "vendors", "vendors");
  if (!access.allowed) return empty;
  const ownClause = access.ownOnly ? userOwn(userId) : null;
  const total = await Vendor.countDocuments(buildMatch(org, ownClause, range, "createdAt"));
  return { total };
}

async function computeDeals(req, org, userId, range, tz, dealStage) {
  const empty = { total: 0, totalValue: 0, won: 0, lost: 0, byMonth: toMonthArray({}, ["count", "value"]), pipeline: [] };
  const access = await resolveModuleAccess(req, "deals", "deals");
  if (!access.allowed) return empty;
  const ownClause = access.ownOnly ? await dealOwn(userId, org) : null;
  const match = buildMatch(org, ownClause, range, "createdAt"); // deals filter on createdAt
  // Insights' Deal Stage filter (`deal.status === filters.dealStage`) applies to
  // the whole deal set, so summary/pipeline/byMonth must honor it too — otherwise
  // a filtered Overview mixes filtered and unfiltered deal figures.
  if (dealStage) match.status = dealStage;

  const [agg] = await Deal.aggregate([
    { $match: match },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              totalValue: { $sum: { $ifNull: ["$amount", 0] } },
              won: { $sum: { $cond: [{ $eq: ["$status", "Won"] }, 1, 0] } },
              lost: { $sum: { $cond: [{ $eq: ["$status", "Lost"] }, 1, 0] } },
            },
          },
        ],
        byMonth: [
          {
            $group: {
              _id: { $month: { date: "$createdAt", timezone: tz } },
              count: { $sum: 1 },
              value: { $sum: { $ifNull: ["$amount", 0] } },
            },
          },
        ],
        pipeline: [
          {
            $group: {
              _id: { $ifNull: ["$status", "Unknown"] },
              count: { $sum: 1 },
              value: { $sum: { $ifNull: ["$amount", 0] } },
            },
          },
        ],
      },
    },
  ]);

  const t = (agg?.totals || [])[0] || { total: 0, totalValue: 0, won: 0, lost: 0 };
  const monthGroups = {};
  (agg?.byMonth || []).forEach((m) => {
    monthGroups[m._id] = { count: m.count, value: m.value };
  });
  const pipeline = (agg?.pipeline || [])
    .map((p) => ({ stage: p._id, count: p.count, value: p.value }))
    .sort((a, b) => b.count - a.count);

  return {
    total: t.total,
    totalValue: t.totalValue,
    won: t.won,
    lost: t.lost,
    byMonth: toMonthArray(monthGroups, ["count", "value"]),
    pipeline,
  };
}

async function computeInvoices(req, org, userId, range, tz) {
  const empty = { total: 0, revenue: 0, collected: 0, byMonth: toMonthArray({}, ["invoiced", "collected", "outstanding"]) };
  const access = await resolveModuleAccess(req, "invoices", "invoices");
  if (!access.allowed) return empty;
  const ownClause = access.ownOnly ? await invoiceOwn(userId, org) : null;
  const pre = effDateStages(org, ownClause, range, "date"); // invoices: date || createdAt

  const [agg] = await Invoice.aggregate([
    ...pre,
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              revenue: { $sum: { $ifNull: ["$amount", 0] } },
              collected: { $sum: { $cond: [{ $eq: ["$status", "Paid"] }, { $ifNull: ["$amount", 0] }, 0] } },
            },
          },
        ],
        byMonth: [
          {
            $group: {
              _id: { $month: { date: "$_effDate", timezone: tz } },
              invoiced: { $sum: { $ifNull: ["$amount", 0] } },
              collected: { $sum: { $cond: [{ $eq: ["$status", "Paid"] }, { $ifNull: ["$amount", 0] }, 0] } },
            },
          },
        ],
      },
    },
  ]);

  const t = (agg?.totals || [])[0] || { total: 0, revenue: 0, collected: 0 };
  const monthGroups = {};
  (agg?.byMonth || []).forEach((m) => {
    monthGroups[m._id] = { invoiced: m.invoiced, collected: m.collected, outstanding: m.invoiced - m.collected };
  });

  return {
    total: t.total,
    revenue: t.revenue,
    collected: t.collected,
    byMonth: toMonthArray(monthGroups, ["invoiced", "collected", "outstanding"]),
  };
}

async function computePurchases(req, org, userId, range, tz) {
  const empty = {
    totalAmountValue: 0,
    byMonth: toMonthArray({}, ["count", "value"]),
    topVendors: [],
  };
  const access = await resolveModuleAccess(req, "purchases", "purchases");
  if (!access.allowed) return empty;
  const ownClause = access.ownOnly ? userOwn(userId) : null;
  const pre = effDateStages(org, ownClause, range, "purchaseDate"); // purchases: purchaseDate || createdAt

  const [agg] = await Purchase.aggregate([
    ...pre,
    {
      $facet: {
        // Overview "Total Purchases" tile sums grandTotal.
        totals: [{ $group: { _id: null, totalAmountValue: { $sum: { $ifNull: ["$grandTotal", 0] } } } }],
        // monthlyTrends.purchases is a count; value added (grandTotal) for charts.
        byMonth: [
          {
            $group: {
              _id: { $month: { date: "$_effDate", timezone: tz } },
              count: { $sum: 1 },
              value: { $sum: { $ifNull: ["$grandTotal", 0] } },
            },
          },
        ],
        // Top Vendors by Spend (Insights.jsx:4260) uses grandTotal, grouped by vendor.
        topVendors: [
          { $match: { vendor: { $ne: null } } },
          {
            $group: {
              _id: "$vendor",
              totalPaid: { $sum: { $ifNull: ["$grandTotal", 0] } },
              transactions: { $sum: 1 },
            },
          },
          { $sort: { totalPaid: -1 } },
          { $limit: 4 },
          { $lookup: { from: Vendor.collection.name, localField: "_id", foreignField: "_id", as: "v" } },
          {
            $project: {
              _id: 0,
              vendorId: "$_id",
              totalPaid: 1,
              transactions: 1,
              name: { $ifNull: [{ $arrayElemAt: ["$v.name", 0] }, "Unknown Vendor"] },
            },
          },
        ],
      },
    },
  ]);

  const totals = (agg?.totals || [])[0] || { totalAmountValue: 0 };
  const monthGroups = {};
  (agg?.byMonth || []).forEach((m) => {
    monthGroups[m._id] = { count: m.count, value: m.value };
  });

  return {
    totalAmountValue: totals.totalAmountValue,
    byMonth: toMonthArray(monthGroups, ["count", "value"]),
    topVendors: agg?.topVendors || [],
  };
}

// Purchase Orders are fetched by Insights (vendor spends on dailyTrends), but
// the requested report shape has no PO-specific field. We only resolve access so
// a lack of PO access doesn't matter; returns nothing consumed yet. Kept for
// parity bookkeeping and future PO-based fields.
async function computePurchaseOrders(req, org, userId, range) {
  const access = await resolveModuleAccess(req, "purchases", "purchase-orders");
  return { accessible: access.allowed };
}

// Top Revenue Generating Companies (Insights.jsx:2978-3020):
//   revenueByCompanyId = Σ Won deal.amount (by deal.company)
//                      + Σ invoice.amount   (by invoice.deal.company)
// ranked desc, top 5. Deals filtered by createdAt; invoices by date||createdAt.
async function computeTopCustomers(req, org, userId, range) {
  const dealAccess = await resolveModuleAccess(req, "deals", "deals");
  const invAccess = await resolveModuleAccess(req, "invoices", "invoices");
  if (!dealAccess.allowed && !invAccess.allowed) return [];

  const byCompany = new Map(); // companyId(string) -> revenue

  if (dealAccess.allowed) {
    const ownClause = dealAccess.ownOnly ? await dealOwn(userId, org) : null;
    const match = buildMatch(org, ownClause, range, "createdAt");
    match.status = "Won"; // only Won deals contribute
    const rows = await Deal.aggregate([
      { $match: match },
      { $match: { company: { $ne: null } } },
      { $group: { _id: "$company", revenue: { $sum: { $ifNull: ["$amount", 0] } } } },
    ]);
    rows.forEach((r) => {
      const k = String(r._id);
      byCompany.set(k, (byCompany.get(k) || 0) + r.revenue);
    });
  }

  if (invAccess.allowed) {
    const ownClause = invAccess.ownOnly ? await invoiceOwn(userId, org) : null;
    const pre = effDateStages(org, ownClause, range, "date");
    const rows = await Invoice.aggregate([
      ...pre,
      // Invoices reference company only via their deal.
      { $lookup: { from: Deal.collection.name, localField: "deal", foreignField: "_id", as: "_deal" } },
      { $addFields: { _company: { $arrayElemAt: ["$_deal.company", 0] } } },
      { $match: { _company: { $ne: null } } },
      { $group: { _id: "$_company", revenue: { $sum: { $ifNull: ["$amount", 0] } } } },
    ]);
    rows.forEach((r) => {
      const k = String(r._id);
      byCompany.set(k, (byCompany.get(k) || 0) + r.revenue);
    });
  }

  const top = [...byCompany.entries()]
    .map(([companyId, revenue]) => ({ companyId, revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  if (top.length === 0) return [];

  // Resolve names (org-scoped — never cross-org).
  const ids = top.map((t) => t.companyId);
  const companies = await Company.find({ _id: { $in: ids }, organization: org })
    .select("_id name")
    .lean();
  const nameById = Object.fromEntries(companies.map((c) => [String(c._id), c.name]));
  return top.map((t) => ({ companyId: t.companyId, name: nameById[t.companyId] || "Unknown", revenue: t.revenue }));
}

// ===========================================================================
// Overview migration — Step 1 (overviewStats, dailyTrends, activity)
// ===========================================================================

const STATUS_FILTER_KEYS = ["contactStatus", "dealStage", "purchaseStatus", "poStatus"];

function parseStatusFilters(query) {
  const filters = {};
  for (const key of STATUS_FILTER_KEYS) {
    const v = query[key];
    if (v === undefined || v === "" || v === "all") {
      filters[key] = null; // no filter, same as the UI's "all"
      continue;
    }
    // Reject arrays / objects (?dealStage[$ne]=x) so a value can never be an operator.
    if (typeof v !== "string" || v.length > 100) {
      return { error: `Invalid ${key}.` };
    }
    filters[key] = v;
  }
  return { filters };
}

function isValidTimeZone(tz) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch (e) {
    return false;
  }
}

// One failing section must not break the whole report: log it, return null, and
// the client keeps using its own calculation for that widget.
async function safeSection(name, fn) {
  try {
    return await fn();
  } catch (err) {
    console.error(`Insights report section "${name}" failed:`, err);
    return null;
  }
}

// ---- timezone helpers (the browser's getMonth()/toDateString() are zone-local) ----

// Calendar date of an instant in `tz`, as {y, m (1-12), d}.
function zonedYmd(date, tz) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

// Whole-day index (days since epoch) of a calendar date; pure calendar arithmetic.
const dayIndex = ({ y, m, d }) => Math.round(Date.UTC(y, m - 1, d) / 86400000);
const dayKeyOf = (idx) => new Date(idx * 86400000).toISOString().slice(0, 10); // YYYY-MM-DD

// UTC instant at which the wall clock in `tz` reads y-m-d 00:00.
function zonedMidnightToUtc(y, m, d, tz) {
  const wall = Date.UTC(y, m - 1, d, 0, 0, 0);
  let guess = wall;
  for (let i = 0; i < 3; i++) {
    const p = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    }).formatToParts(new Date(guess));
    const g = (t) => Number(p.find((x) => x.type === t).value);
    const asWall = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
    const diff = asWall - wall; // how far the zone's wall clock is from the target
    if (diff === 0) break;
    guess -= diff;
  }
  return new Date(guess);
}

// Insights.jsx monthOverMonthChange: this-month value as a % of everything before it
// (NOT a growth rate — kept identical), 100 when there is only this-month data.
function momPercent(thisMonth, beforeThisMonth) {
  if (beforeThisMonth > 0) return Math.round((thisMonth / beforeThisMonth) * 100);
  return thisMonth + beforeThisMonth > 0 ? 100 : 0;
}

const numOrZero = (field) => ({ $convert: { input: field, to: "double", onError: 0, onNull: 0 } });

// ---------------------------------------------------------------------------
// overviewStats — the 8 Overview StatCards: value + MoM (Insights.jsx:1379-1457).
//   Filtered set = Insights' filteredData (date range on each entity's date field,
//   then contactStatus / dealStage / purchaseStatus). Values: deals.amount,
//   purchases.totalAmount, invoices.amount. MoM buckets on createdAt for EVERY
//   entity (even purchases/invoices, whose range filter uses purchaseDate/date),
//   split at the first of the current month in `tz`; records with no valid
//   createdAt are skipped from MoM but still counted in the totals.
// ---------------------------------------------------------------------------
async function computeOverviewStats(req, org, userId, range, tz, statusFilters) {
  const { y, m } = zonedYmd(new Date(), tz);
  const monthStart = zonedMidnightToUtc(y, m, 1, tz);

  // Group stage shared by every entity. `valueField` null => counts only.
  const statsGroup = (valueField) => {
    const hasDate = { $eq: [{ $type: "$createdAt" }, "date"] };
    const isThisMonth = { $and: [hasDate, { $gte: ["$createdAt", monthStart] }] };
    const isBefore = { $and: [hasDate, { $lt: ["$createdAt", monthStart] }] };
    const g = {
      _id: null,
      count: { $sum: 1 },
      countThis: { $sum: { $cond: [isThisMonth, 1, 0] } },
      countBefore: { $sum: { $cond: [isBefore, 1, 0] } },
    };
    if (valueField) {
      const v = numOrZero(`$${valueField}`);
      g.value = { $sum: v };
      g.valueThis = { $sum: { $cond: [isThisMonth, v, 0] } };
      g.valueBefore = { $sum: { $cond: [isBefore, v, 0] } };
    }
    return { $group: g };
  };

  const countStat = (row) =>
    row ? { count: row.count, mom: momPercent(row.countThis, row.countBefore) } : { count: 0, mom: 0 };
  const valueStat = (row) =>
    row ? { value: row.value, mom: momPercent(row.valueThis, row.valueBefore) } : { value: 0, mom: 0 };

  // Direct-date entities (createdAt range) — contacts, companies, deals, vendors.
  const direct = async (planModule, permResource, Model, ownFn, extraMatch, valueField) => {
    const access = await resolveModuleAccess(req, planModule, permResource);
    if (!access.allowed) return null;
    const ownClause = access.ownOnly ? await ownFn(userId, org) : null;
    const match = buildMatch(org, ownClause, range, "createdAt");
    if (extraMatch) Object.assign(match, extraMatch);
    const [row] = await Model.aggregate([{ $match: match }, statsGroup(valueField)]);
    return row || null;
  };

  // Fallback-date entities — purchases (purchaseDate||createdAt), invoices (date||createdAt).
  const effective = async (planModule, permResource, Model, ownFn, primaryField, extraMatch, valueField) => {
    const access = await resolveModuleAccess(req, planModule, permResource);
    if (!access.allowed) return null;
    const ownClause = access.ownOnly ? await ownFn(userId, org) : null;
    const stages = effDateStages(org, ownClause, range, primaryField);
    if (extraMatch) stages.push({ $match: extraMatch });
    stages.push(statsGroup(valueField));
    const [row] = await Model.aggregate(stages);
    return row || null;
  };

  const [contacts, companies, deals, vendors, purchases, invoices] = await Promise.all([
    direct("contacts", "contacts", Contact, contactOwn, statusFilters.contactStatus ? { stageStatus: statusFilters.contactStatus } : null, null),
    direct("companies", "Companies", Company, companyOwn, null, null),
    direct("deals", "deals", Deal, dealOwn, statusFilters.dealStage ? { status: statusFilters.dealStage } : null, "amount"),
    direct("vendors", "vendors", Vendor, userOwn, null, null),
    effective("purchases", "purchases", Purchase, userOwn, "purchaseDate", statusFilters.purchaseStatus ? { status: statusFilters.purchaseStatus } : null, "grandTotal"),
    effective("invoices", "invoices", Invoice, invoiceOwn, "date", null, "amount"),
  ]);

  return {
    totalContacts: countStat(contacts),
    totalCompanies: countStat(companies),
    activeDeals: countStat(deals),
    totalVendors: countStat(vendors),
    totalDealValue: valueStat(deals),
    totalPurchases: valueStat(purchases),
    totalInvoices: countStat(invoices),
    totalInvoiceValue: valueStat(invoices),
  };
}

// ---------------------------------------------------------------------------
// dailyTrends — "Revenue vs Business Spends" (Insights.jsx:709-779).
//   Per calendar day (in `tz`):
//     revenue      = Σ invoice.amount          (date || createdAt)
//     purchases    = Σ purchase.totalAmount    (purchaseDate || createdAt), purchaseStatus filter
//     vendorSpends = Σ PO.totalAmount          (orderDate || createdAt),    poStatus filter
//   Window: with a date range -> the range's two calendar days, inclusive. Without
//   one -> from min(earliest filtered record, today-29) to today, i.e. at least 30
//   days. Records are first filtered exactly like filteredData (range instant on the
//   effective date, then the status filter), as on the client.
// ---------------------------------------------------------------------------
const DAILY_MAX_DAYS = 3660; // safety cap for absurd explicit ranges; flagged via `truncated`

async function computeDailyTrends(req, org, userId, range, tz, statusFilters) {
  const sources = [
    { Model: Invoice, plan: "invoices", perm: "invoices", ownFn: invoiceOwn, primary: "date", valueField: "amount", status: null, out: "revenue" },
    { Model: Purchase, plan: "purchases", perm: "purchases", ownFn: userOwn, primary: "purchaseDate", valueField: "grandTotal", status: statusFilters.purchaseStatus, out: "purchases" },
    { Model: PurchaseOrder, plan: "purchases", perm: "purchase-orders", ownFn: userOwn, primary: "orderDate", valueField: "totalAmount", status: statusFilters.poStatus, out: "vendorSpends" },
  ];

  // Per source: per-day sums (keyed YYYY-MM-DD in tz) + earliest effective date.
  const perSource = await Promise.all(
    sources.map(async (src) => {
      const access = await resolveModuleAccess(req, src.plan, src.perm);
      if (!access.allowed) return { src, days: new Map(), earliest: null };
      const ownClause = access.ownOnly ? await src.ownFn(userId, org) : null;
      const stages = effDateStages(org, ownClause, range, src.primary);
      if (src.status) stages.push({ $match: { status: src.status } });
      stages.push({
        $facet: {
          days: [
            {
              $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$_effDate", timezone: tz } },
                total: { $sum: numOrZero(`$${src.valueField}`) },
              },
            },
          ],
          earliest: [{ $group: { _id: null, min: { $min: "$_effDate" } } }],
        },
      });
      const [agg] = await src.Model.aggregate(stages);
      const days = new Map((agg?.days || []).map((r) => [r._id, r.total]));
      const earliest = agg?.earliest?.[0]?.min || null;
      return { src, days, earliest };
    })
  );

  // ---- window (calendar-day indexes in tz) ----
  const todayIdx = dayIndex(zonedYmd(new Date(), tz));
  let startIdx;
  let endIdx;
  if (range) {
    startIdx = dayIndex(zonedYmd(range.start, tz));
    endIdx = dayIndex(zonedYmd(range.end, tz));
  } else {
    let earliestIdx = todayIdx;
    const mins = perSource.map((p) => p.earliest).filter(Boolean);
    if (mins.length > 0) {
      earliestIdx = dayIndex(zonedYmd(new Date(Math.min(...mins.map((d) => d.getTime()))), tz));
    }
    startIdx = Math.min(earliestIdx, todayIdx - 29);
    endIdx = todayIdx;
  }
  let truncated = false;
  if (endIdx - startIdx + 1 > DAILY_MAX_DAYS) {
    startIdx = endIdx - DAILY_MAX_DAYS + 1;
    truncated = true;
  }

  const shortFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const longFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

  const series = [];
  for (let i = startIdx; i <= endIdx; i++) {
    const key = dayKeyOf(i);
    const label = new Date(i * 86400000 + 12 * 3600000); // noon UTC: formats as that calendar day
    const row = {
      day: key,
      date: shortFmt.format(label),
      fullDate: longFmt.format(label),
      revenue: 0,
      purchases: 0,
      vendorSpends: 0,
    };
    perSource.forEach((p) => {
      row[p.src.out] = p.days.get(key) || 0;
    });
    series.push(row);
  }

  return { timezone: tz, startDay: dayKeyOf(startIdx), endDay: dayKeyOf(endIdx), truncated, series };
}

// ---------------------------------------------------------------------------
// activity — Overview Activity Feed (Insights.jsx:1223-1295), newest 20.
//   Sources mirror what the page's own list requests return:
//     deals    <- GET /deals     (ownOnly like getAllDeals)
//     tasks    <- GET /tasks     (getMyTask: tasks ASSIGNED to the current user),
//                                 status === "Completed"
//     meetings <- GET /meetings  (getMeetings: org-wide, NO ownOnly, and NO row limit —
//                                 its `limit` query default only feeds totalPages)
//     invoices <- GET /invoices  (ownOnly like getAllInvoices)
//   No date range / status filters apply to the feed (same as the client). Each
//   source contributes its own newest 20 — enough for the global newest 20.
// ---------------------------------------------------------------------------
const ACTIVITY_LIMIT = 20;

// Insights' formatNumberToIndian (frontend/src/utils/numberFormatter.js), same logic.
function formatNumberToIndian(num) {
  if (num === null || num === undefined || isNaN(num)) return "0";
  const numStr = Math.floor(num).toString();
  if (numStr.length <= 3) return numStr;
  let result = "";
  let count = 0;
  for (let i = numStr.length - 1; i >= 0; i--) {
    if (count === 3 || (count > 3 && (count - 3) % 2 === 0)) result = "," + result;
    result = numStr[i] + result;
    count++;
  }
  return result;
}

const newestStages = () => [{ $sort: { _at: -1 } }, { $limit: ACTIVITY_LIMIT }];

async function computeActivity(req, org, userId) {
  const [dealRows, taskRows, meetingRows, invoiceRows] = await Promise.all([
    (async () => {
      const access = await resolveModuleAccess(req, "deals", "deals");
      if (!access.allowed) return [];
      const ownClause = access.ownOnly ? await dealOwn(userId, org) : null;
      return Deal.aggregate([
        { $match: buildMatch(org, ownClause, null, "createdAt") },
        { $addFields: { _at: { $ifNull: ["$updatedAt", "$createdAt"] } } },
        { $match: { _at: { $ne: null } } },
        ...newestStages(),
        { $lookup: { from: Company.collection.name, localField: "company", foreignField: "_id", as: "_co" } },
        { $project: { _id: 1, _at: 1, title: 1, status: 1, companyName: { $arrayElemAt: ["$_co.name", 0] } } },
      ]);
    })(),
    (async () => {
      const access = await resolveModuleAccess(req, "tasks", "tasks");
      if (!access.allowed) return [];
      return Task.aggregate([
        { $match: { users: userId, organization: org, status: "Completed" } },
        { $addFields: { _at: { $ifNull: ["$updatedAt", "$createdAt"] } } },
        { $match: { _at: { $ne: null } } },
        ...newestStages(),
        { $project: { _id: 1, _at: 1, title: 1 } },
      ]);
    })(),
    (async () => {
      const access = await resolveModuleAccess(req, "meetings", "meetings");
      if (!access.allowed) return [];
      return Meeting.aggregate([
        { $match: { organization: org } },
        { $addFields: { _at: { $ifNull: ["$updatedAt", { $ifNull: ["$scheduledAt", "$createdAt"] }] } } },
        { $match: { _at: { $ne: null } } },
        ...newestStages(),
        { $project: { _id: 1, _at: 1, title: 1, status: 1 } },
      ]);
    })(),
    (async () => {
      const access = await resolveModuleAccess(req, "invoices", "invoices");
      if (!access.allowed) return [];
      const ownClause = access.ownOnly ? await invoiceOwn(userId, org) : null;
      return Invoice.aggregate([
        { $match: Object.assign({ organization: org }, ownClause || {}) },
        { $addFields: { _at: { $ifNull: ["$updatedAt", { $ifNull: ["$dueDate", "$createdAt"] }] } } },
        { $match: { _at: { $ne: null } } },
        ...newestStages(),
        { $project: { _id: 1, _at: 1, invoiceNumber: 1, status: 1, amount: 1, dueDate: 1 } },
      ]);
    })(),
  ]);

  const items = [];
  dealRows.forEach((d) =>
    items.push({
      id: `deal-${d._id}`,
      type: "deals",
      title: `Deal Moved to ${d.status || "Update"}`,
      subtitle: [d.title, d.companyName].filter(Boolean).join(" • "),
      at: d._at,
    })
  );
  taskRows.forEach((t) =>
    items.push({
      id: `task-${t._id}`,
      type: "tasks",
      title: "Task Completed",
      subtitle: t.title || "Untitled task",
      at: t._at,
    })
  );
  meetingRows.forEach((mt) =>
    items.push({
      id: `meeting-${mt._id}`,
      type: "meetings",
      title: mt.status === "Completed" ? "Meeting Completed" : "Meeting Scheduled",
      subtitle: mt.title || "Untitled meeting",
      at: mt._at,
    })
  );
  const now = new Date();
  invoiceRows.forEach((inv) => {
    const overdue = inv.status !== "Paid" && !!inv.dueDate && new Date(inv.dueDate) < now;
    items.push({
      id: `invoice-${inv._id}`,
      type: "invoices",
      overdue, // the client picks the red vs teal icon from this
      title: overdue ? `Invoice #${inv.invoiceNumber} is overdue` : `Invoice #${inv.invoiceNumber} — ${inv.status}`,
      subtitle: `₹${formatNumberToIndian(inv.amount || 0)}`,
      at: inv._at,
    });
  });

  return items.sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, ACTIVITY_LIMIT);
}

// ===========================================================================
// Deals tab migration (report.deals) — reproduces renderDealsReport in
// Insights.jsx. Every definition below mirrors the client code it replaces,
// quirks included (see per-widget notes). Only the Kanban stage ORDER is left
// to the client (it already holds GET /kanban), so statuses are returned raw.
// ===========================================================================

const DAY_MS = 24 * 60 * 60 * 1000;

// UTC instant of the first day of calendar month (y, m) in `tz`; m may be <1 or >12.
function zonedMonthStart(y, m, tz) {
  const norm = new Date(Date.UTC(y, m - 1, 1));
  return zonedMidnightToUtc(norm.getUTCFullYear(), norm.getUTCMonth() + 1, 1, tz);
}

function emptyDealsSection() {
  return {
    totalDeals: 0,
    totalValue: 0,
    statusDistribution: [],
    won: { count: 0, value: 0 },
    lost: { count: 0, value: 0 },
    open: { count: 0, value: 0 },
    month: { thisCount: 0, thisValue: 0, lastCount: 0, lastValue: 0, wonThis: 0, wonLast: 0, closedThis: 0, closedLast: 0 },
    userStats: [],
    topCompanies: [],
    largestDeals: [],
    stageAvgDays: {},
    dealsByIndustry: [],
    revenueTrend: [],
  };
}

async function computeDealsSection(req, org, userId, range, tz, dealStage) {
  const access = await resolveModuleAccess(req, "deals", "deals");
  if (!access.allowed) return emptyDealsSection();
  const ownClause = access.ownOnly ? await dealOwn(userId, org) : null;
  // Same set as the client's filteredDeals: org + ownOnly, createdAt in range,
  // then `deal.status === filters.dealStage`.
  const match = buildMatch(org, ownClause, range, "createdAt");
  if (dealStage) match.status = dealStage;

  // Calendar months are in the browser's zone on the client; `tz` carries it.
  const now = new Date();
  const { y, m } = zonedYmd(now, tz);
  const thisStart = zonedMonthStart(y, m, tz);
  const nextStart = zonedMonthStart(y, m + 1, tz);
  const lastStart = zonedMonthStart(y, m - 1, tz);
  const trendStart = zonedMonthStart(y, m - 5, tz);

  const inMonth = (field, from, to) => ({
    $and: [{ $eq: [{ $type: field }, "date"] }, { $gte: [field, from] }, { $lt: [field, to] }],
  });
  const isWon = { $eq: ["$status", "Won"] };
  const isLost = { $eq: ["$status", "Lost"] };

  const [agg] = await Deal.aggregate([
    { $match: match },
    {
      $addFields: {
        _amt: numOrZero("$amount"), // deal.amount || 0
        // statusDistribution keys: `deal.status || "Unknown"`
        _key: { $cond: [{ $in: [{ $ifNull: ["$status", ""] }, ["", null]] }, "Unknown", "$status"] },
        // "closed" date: updatedAt || createdAt
        _closed: { $ifNull: ["$updatedAt", "$createdAt"] },
      },
    },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              totalValue: { $sum: "$_amt" },
              wonCount: { $sum: { $cond: [isWon, 1, 0] } },
              wonValue: { $sum: { $cond: [isWon, "$_amt", 0] } },
              lostCount: { $sum: { $cond: [isLost, 1, 0] } },
              lostValue: { $sum: { $cond: [isLost, "$_amt", 0] } },
            },
          },
        ],
        byStatus: [{ $group: { _id: "$_key", count: { $sum: 1 }, amount: { $sum: "$_amt" } } }],
        // Deals by Stage "Avg. Time": per raw status, days since created (or
        // days-to-close for Won/Lost), floored at 0 — summed per deal in days.
        stageAge: [
          { $match: { status: { $type: "string" }, createdAt: { $type: "date" } } },
          {
            $group: {
              _id: "$status",
              n: { $sum: 1 },
              days: {
                $sum: {
                  $max: [
                    0,
                    {
                      $divide: [
                        { $subtract: [{ $cond: [{ $or: [isWon, isLost] }, "$_closed", now] }, "$createdAt"] },
                        DAY_MS,
                      ],
                    },
                  ],
                },
              },
            },
          },
        ],
        month: [
          {
            $group: {
              _id: null,
              thisCount: { $sum: { $cond: [inMonth("$createdAt", thisStart, nextStart), 1, 0] } },
              thisValue: { $sum: { $cond: [inMonth("$createdAt", thisStart, nextStart), "$_amt", 0] } },
              lastCount: { $sum: { $cond: [inMonth("$createdAt", lastStart, thisStart), 1, 0] } },
              lastValue: { $sum: { $cond: [inMonth("$createdAt", lastStart, thisStart), "$_amt", 0] } },
              wonThis: { $sum: { $cond: [{ $and: [isWon, inMonth("$_closed", thisStart, nextStart)] }, 1, 0] } },
              wonLast: { $sum: { $cond: [{ $and: [isWon, inMonth("$_closed", lastStart, thisStart)] }, 1, 0] } },
              closedThis: { $sum: { $cond: [{ $and: [{ $or: [isWon, isLost] }, inMonth("$_closed", thisStart, nextStart)] }, 1, 0] } },
              closedLast: { $sum: { $cond: [{ $and: [{ $or: [isWon, isLost] }, inMonth("$_closed", lastStart, thisStart)] }, 1, 0] } },
            },
          },
        ],
        byUser: [
          { $group: { _id: { user: "$user", key: "$_key" }, count: { $sum: 1 }, amount: { $sum: "$_amt" } } },
        ],
        byCompany: [
          {
            $group: {
              _id: "$company",
              count: { $sum: 1 },
              amount: { $sum: "$_amt" },
              won: { $sum: { $cond: [isWon, 1, 0] } },
            },
          },
        ],
        largest: [
          { $sort: { _amt: -1, _id: 1 } },
          { $limit: 5 },
          { $project: { _id: 1, title: 1, company: 1, status: 1, amount: "$_amt" } },
        ],
        // Revenue Trend: last 6 calendar months, deal value per month x raw status.
        trend: [
          { $match: { createdAt: { $type: "date", $gte: trendStart, $lt: nextStart } } },
          {
            $group: {
              _id: { ym: { $dateToString: { format: "%Y-%m", date: "$createdAt", timezone: tz } }, status: "$status" },
              amount: { $sum: "$_amt" },
            },
          },
        ],
      },
    },
  ]);

  const t = (agg?.totals || [])[0] || { total: 0, totalValue: 0, wonCount: 0, wonValue: 0, lostCount: 0, lostValue: 0 };
  const totalDeals = t.total;
  const statusDistribution = (agg?.byStatus || [])
    .map((s) => ({ status: s._id, count: s.count, amount: s.amount }))
    .sort((a, b) => b.count - a.count || String(a.status).localeCompare(String(b.status)));

  const mo = (agg?.month || [])[0] || {};
  const month = {
    thisCount: mo.thisCount || 0,
    thisValue: mo.thisValue || 0,
    lastCount: mo.lastCount || 0,
    lastValue: mo.lastValue || 0,
    wonThis: mo.wonThis || 0,
    wonLast: mo.wonLast || 0,
    closedThis: mo.closedThis || 0,
    closedLast: mo.closedLast || 0,
  };

  // avgDays = Math.round(mean age in days) per raw stage name.
  const stageAvgDays = {};
  (agg?.stageAge || []).forEach((s) => {
    if (s.n > 0) stageAvgDays[s._id] = Math.round(s.days / s.n);
  });

  // ---- User Performance: group by populated user. A deal whose user is unset
  // or no longer exists collapses into one "Unknown User" row (id null), as the
  // client's `deal.user?._id` keyed `undefined`. ----
  const userIds = [...new Set((agg?.byUser || []).map((r) => r._id.user).filter(Boolean).map(String))];
  const users = userIds.length ? await User.find({ _id: { $in: userIds } }).select("_id name").lean() : [];
  const userById = Object.fromEntries(users.map((u) => [String(u._id), u]));
  const byUserId = new Map();
  (agg?.byUser || []).forEach((r) => {
    const uDoc = r._id.user ? userById[String(r._id.user)] : null;
    const id = uDoc ? String(uDoc._id) : null;
    if (!byUserId.has(id)) {
      byUserId.set(id, {
        id,
        name: (uDoc && uDoc.name) || "Unknown User",
        totalDeals: 0, wonDeals: 0, lostDeals: 0, openDeals: 0,
        totalValue: 0, wonValue: 0, lostValue: 0, openValue: 0,
        statusCounts: {},
      });
    }
    const u = byUserId.get(id);
    u.totalDeals += r.count;
    u.totalValue += r.amount;
    u.statusCounts[r._id.key] = (u.statusCounts[r._id.key] || 0) + r.count;
    if (r._id.key === "Won") { u.wonDeals += r.count; u.wonValue += r.amount; }
    else if (r._id.key === "Lost") { u.lostDeals += r.count; u.lostValue += r.amount; }
    else { u.openDeals += r.count; u.openValue += r.amount; }
  });
  const userStats = [...byUserId.values()]
    .map((u) => ({
      ...u,
      conversionRate: u.wonDeals + u.lostDeals > 0 ? (u.wonDeals / (u.wonDeals + u.lostDeals)) * 100 : 0,
    }))
    .sort((a, b) => b.totalValue - a.totalValue || a.name.localeCompare(b.name));

  // ---- Companies: names for Top Companies (client reads the populated
  // `deal.company.name`, no date/own restriction); industries for Deals by
  // Industry (client reads GET /companies -> filteredCompanies, i.e. the
  // companies the user may see AND created inside the date range). ----
  const companyRows = (agg?.byCompany || []).filter((r) => r._id);
  const companyIds = companyRows.map((r) => r._id);
  let nameById = {};
  let industryById = {};
  if (companyIds.length) {
    const named = await Company.find({ _id: { $in: companyIds }, organization: org }).select("_id name").lean();
    nameById = Object.fromEntries(named.map((c) => [String(c._id), c.name]));

    const compAccess = await resolveModuleAccess(req, "companies", "Companies");
    if (compAccess.allowed) {
      const compOwn = compAccess.ownOnly ? companyOwn(userId) : null;
      const visible = await Company.find({
        _id: { $in: companyIds },
        ...buildMatch(org, compOwn, range, "createdAt"),
      })
        .select("_id industry")
        .lean();
      industryById = Object.fromEntries(visible.map((c) => [String(c._id), c.industry || "Other"]));
    }
  }

  // Top Companies by Deal Value: grouped by company NAME (same-name companies merge).
  const byName = new Map();
  companyRows.forEach((r) => {
    const name = nameById[String(r._id)];
    if (!name) return;
    const cur = byName.get(name) || { name, count: 0, amount: 0, won: 0 };
    cur.count += r.count;
    cur.amount += r.amount;
    cur.won += r.won;
    byName.set(name, cur);
  });
  const topCompanies = [...byName.values()]
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))
    .slice(0, 5);

  // Deals by Industry: value per industry (unmapped/missing company -> "Other"),
  // positive totals only, top 4 + "Others", sorted desc, pct of the shown total.
  const industryTotals = {};
  (agg?.byCompany || []).forEach((r) => {
    const industry = (r._id && industryById[String(r._id)]) || "Other";
    industryTotals[industry] = (industryTotals[industry] || 0) + r.amount;
  });
  const entries = Object.entries(industryTotals)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top4 = entries.slice(0, 4).map(([name, value]) => ({ name, value }));
  const restValue = entries.slice(4).reduce((s, [, v]) => s + v, 0);
  const industryItems = restValue > 0 ? [...top4, { name: "Others", value: restValue }] : top4;
  industryItems.sort((a, b) => b.value - a.value);
  const industryTotal = industryItems.reduce((s, i) => s + i.value, 0);
  const dealsByIndustry = industryItems.map((i) => ({
    ...i,
    pct: industryTotal > 0 ? Math.round((i.value / industryTotal) * 100) : 0,
  }));

  const largestDeals = (agg?.largest || []).map((d) => ({
    _id: d._id,
    title: d.title || null,
    companyName: d.company ? nameById[String(d.company)] || null : null,
    status: d.status,
    amount: d.amount,
  }));

  const openCount = totalDeals - t.wonCount - t.lostCount;
  const openValue = t.totalValue - t.wonValue - t.lostValue;

  return {
    totalDeals,
    totalValue: t.totalValue,
    statusDistribution,
    won: { count: t.wonCount, value: t.wonValue },
    lost: { count: t.lostCount, value: t.lostValue },
    open: { count: openCount, value: openValue },
    month,
    userStats,
    topCompanies,
    largestDeals,
    stageAvgDays,
    dealsByIndustry,
    // [{ ym: "YYYY-MM", status: <raw status|null>, amount }] — client buckets into months/stages.
    revenueTrend: (agg?.trend || []).map((r) => ({ ym: r._id.ym, status: r._id.status ?? null, amount: r.amount })),
  };
}

// ===========================================================================
// Purchase Orders tab migration (report.purchaseOrders) — reproduces the
// calculations in renderPurchaseOrdersReport (Insights.jsx), quirks included:
//   - filtered set: org + ownOnly (route: `query.user = req.user._id`), date on
//     `orderDate || createdAt` in range, then exact `status === poStatus`.
//   - month / trend / week / overdue bucketing uses `orderDate` ONLY (a PO without
//     one is in the totals but in no month, exactly like `new Date(undefined)`).
//   - "In Progress" counts as pending-active although it is not in the status enum.
//   - this/last month and the 6-month trend are calendar months in `tz` (the
//     browser's zone); "this week"/"overdue" use now minus 7 CALENDAR days.
// Lists are returned already trimmed (top 5 vendors, largest 5, recent 8,
// upcoming 5); derived values (approval rate, status %, alert text, MoM %) stay
// on the client.
// ===========================================================================

// Mirrors `const d = new Date(); d.setDate(d.getDate() - 7)` in a zone: same wall-clock
// time, seven calendar days earlier (differs from now-168h across a DST change).
function sevenDaysAgoInZone(now, tz) {
  // Zoned wall clock of an instant, as a UTC-based number (whole seconds).
  const wallOf = (ms) => {
    const p = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric",
      hour: "numeric", minute: "numeric", second: "numeric",
    }).formatToParts(new Date(ms));
    const g = (t) => Number(p.find((x) => x.type === t).value);
    return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  };
  const ms = ((now.getTime() % 1000) + 1000) % 1000;
  const w = new Date(wallOf(now.getTime() - ms));
  const wall = Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate() - 7, w.getUTCHours(), w.getUTCMinutes(), w.getUTCSeconds());
  // Wall clock -> instant, following the ECMAScript rule for local times: when the wall time is repeated
  // (DST ends) take the EARLIER instant; when it is skipped (DST starts) use the offset from BEFORE the transition.
  const offAt = (t) => wallOf(t) - t; // zone offset (wall - utc) at instant t
  const o1 = offAt(wall - 864e5); // offset a day before / a day after: the two sides of any nearby transition
  const o2 = offAt(wall + 864e5);
  const c1 = wall - o1;
  const c2 = wall - o2;
  let c = c1;
  if (o1 !== o2) {
    const v1 = offAt(c1) === o1; // does the candidate really show `wall` on the zone clock?
    const v2 = offAt(c2) === o2;
    c = v1 && v2 ? Math.min(c1, c2) : v2 ? c2 : c1;
  }
  return new Date(c + ms);
}

function emptyPurchaseOrdersSection() {
  return {
    totalPOs: 0,
    totalAmount: 0,
    statusDistribution: [],
    month: { thisCount: 0, thisAmount: 0, lastAmount: 0, openThis: 0, openLast: 0, orderedThis: 0, orderedLast: 0 },
    weekCount: 0,
    active: { count: 0, amount: 0 },
    openTotal: 0,
    overduePending: { count: 0, amount: 0 },
    topVendors: [],
    largest: [],
    recent: [],
    upcoming: [],
    trend: [],
  };
}

async function computePurchaseOrdersSection(req, org, userId, range, tz, poStatus) {
  // Same gate as the list route: restrictByPlan('purchases','read') + checkPermission('purchase-orders').
  const access = await resolveModuleAccess(req, "purchases", "purchase-orders");
  if (!access.allowed) return emptyPurchaseOrdersSection();
  const ownClause = access.ownOnly ? userOwn(userId) : null;

  const stages = effDateStages(org, ownClause, range, "orderDate");
  if (poStatus) stages.push({ $match: { status: poStatus } });

  const now = new Date();
  const { y, m } = zonedYmd(now, tz);
  const thisStart = zonedMonthStart(y, m, tz);
  const nextStart = zonedMonthStart(y, m + 1, tz);
  const lastStart = zonedMonthStart(y, m - 1, tz);
  const trendStart = zonedMonthStart(y, m - 5, tz);
  const weekAgo = sevenDaysAgoInZone(now, tz);

  const inMonth = (field, from, to) => ({
    $and: [{ $eq: [{ $type: field }, "date"] }, { $gte: [field, from] }, { $lt: [field, to] }],
  });
  const is = (v) => ({ $eq: ["$status", v] });
  const openish = { $or: [is("Pending"), is("Approved")] };
  const active = { $or: [is("Pending"), is("Approved"), is("In Progress")] };
  const one = (cond) => ({ $sum: { $cond: [cond, 1, 0] } });
  const amt = (cond) => ({ $sum: { $cond: [cond, "$_amt", 0] } });
  const thisM = inMonth("$orderDate", thisStart, nextStart);
  const lastM = inMonth("$orderDate", lastStart, thisStart);
  const hasDate = { $eq: [{ $type: "$orderDate" }, "date"] };

  const [agg] = await PurchaseOrder.aggregate([
    ...stages,
    {
      $addFields: {
        _amt: numOrZero("$totalAmount"), // po.totalAmount || 0
        _key: { $cond: [{ $in: [{ $ifNull: ["$status", ""] }, ["", null]] }, "Unknown", "$status"] }, // po.status || "Unknown"
      },
    },
    {
      $facet: {
        totals: [{ $group: { _id: null, total: { $sum: 1 }, amount: { $sum: "$_amt" } } }],
        byStatus: [{ $group: { _id: "$_key", count: { $sum: 1 }, amount: { $sum: "$_amt" } } }],
        month: [
          {
            $group: {
              _id: null,
              thisCount: one(thisM),
              thisAmount: amt(thisM),
              lastAmount: amt(lastM),
              openThis: one({ $and: [thisM, openish] }),
              openLast: one({ $and: [lastM, openish] }),
              orderedThis: amt({ $and: [thisM, is("Approved")] }),
              orderedLast: amt({ $and: [lastM, is("Approved")] }),
              weekCount: one({ $and: [hasDate, { $gte: ["$orderDate", weekAgo] }] }),
              overdueCount: one({ $and: [is("Pending"), hasDate, { $lt: ["$orderDate", weekAgo] }] }),
              overdueAmount: amt({ $and: [is("Pending"), hasDate, { $lt: ["$orderDate", weekAgo] }] }),
              activeCount: one(active),
              activeAmount: amt(active),
              openTotal: one(openish),
            },
          },
        ],
        byVendor: [{ $group: { _id: "$vendor", count: { $sum: 1 }, amount: { $sum: "$_amt" } } }],
        largest: [
          { $sort: { _amt: -1, _id: 1 } },
          { $limit: 5 },
          { $project: { _id: 1, poNumber: 1, vendor: 1, amount: "$_amt" } },
        ],
        recent: [
          { $sort: { orderDate: -1, _id: 1 } },
          { $limit: 8 },
          { $project: { _id: 1, poNumber: 1, vendor: 1, orderDate: 1, status: 1, amount: "$_amt" } },
        ],
        upcoming: [
          { $match: { status: "Approved" } },
          { $sort: { orderDate: 1, _id: 1 } },
          { $limit: 5 },
          { $project: { _id: 1, poNumber: 1, vendor: 1, orderDate: 1 } },
        ],
        // Last 6 calendar months by orderDate x raw status; the client folds into Total/Ordered/Outstanding.
        trend: [
          { $match: { orderDate: { $type: "date", $gte: trendStart, $lt: nextStart } } },
          {
            $group: {
              _id: { ym: { $dateToString: { format: "%Y-%m", date: "$orderDate", timezone: tz } }, status: "$status" },
              amount: { $sum: "$_amt" },
            },
          },
        ],
      },
    },
  ]);

  const t = (agg?.totals || [])[0] || { total: 0, amount: 0 };
  const mo = (agg?.month || [])[0] || {};

  // Vendor names (client reads the populated `po.vendor.name`; a PO whose vendor no longer exists has none).
  const vendorIds = new Set();
  (agg?.byVendor || []).forEach((r) => r._id && vendorIds.add(String(r._id)));
  [agg?.largest, agg?.recent, agg?.upcoming].forEach((list) => (list || []).forEach((r) => r.vendor && vendorIds.add(String(r.vendor))));
  const vendors = vendorIds.size
    ? await Vendor.find({ _id: { $in: [...vendorIds] }, organization: org }).select("_id name").lean()
    : [];
  const nameById = Object.fromEntries(vendors.map((v) => [String(v._id), v.name]));
  const vname = (id) => (id ? nameById[String(id)] || null : null);

  // Top vendors: grouped by vendor NAME (same-name vendors merge), nameless skipped, top 5 by amount.
  const byName = new Map();
  (agg?.byVendor || []).forEach((r) => {
    const name = vname(r._id);
    if (!name) return;
    const cur = byName.get(name) || { name, count: 0, amount: 0 };
    cur.count += r.count;
    cur.amount += r.amount;
    byName.set(name, cur);
  });
  const topVendors = [...byName.values()]
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))
    .slice(0, 5);

  return {
    totalPOs: t.total,
    totalAmount: t.amount,
    statusDistribution: (agg?.byStatus || [])
      .map((s) => ({ status: s._id, count: s.count, amount: s.amount }))
      .sort((a, b) => b.count - a.count || String(a.status).localeCompare(String(b.status))),
    month: {
      thisCount: mo.thisCount || 0,
      thisAmount: mo.thisAmount || 0,
      lastAmount: mo.lastAmount || 0,
      openThis: mo.openThis || 0,
      openLast: mo.openLast || 0,
      orderedThis: mo.orderedThis || 0,
      orderedLast: mo.orderedLast || 0,
    },
    weekCount: mo.weekCount || 0,
    active: { count: mo.activeCount || 0, amount: mo.activeAmount || 0 },
    openTotal: mo.openTotal || 0,
    overduePending: { count: mo.overdueCount || 0, amount: mo.overdueAmount || 0 },
    topVendors,
    largest: (agg?.largest || []).map((r) => ({ _id: r._id, poNumber: r.poNumber, vendorName: vname(r.vendor), amount: r.amount })),
    recent: (agg?.recent || []).map((r) => ({ _id: r._id, poNumber: r.poNumber, vendorName: vname(r.vendor), orderDate: r.orderDate, status: r.status, amount: r.amount })),
    upcoming: (agg?.upcoming || []).map((r) => ({ _id: r._id, poNumber: r.poNumber, vendorName: vname(r.vendor), orderDate: r.orderDate })),
    // [{ ym: "YYYY-MM", status: <raw status|null>, amount }] — client buckets into months.
    trend: (agg?.trend || []).map((r) => ({ ym: r._id.ym, status: r._id.status ?? null, amount: r.amount })),
  };
}

// ===========================================================================
// Purchases tab migration (report.purchases) — reproduces renderPurchasesReport
// (Insights.jsx), quirks included:
//   - filtered set: org + ownOnly (route: `query.user = req.user._id`), date on
//     `purchaseDate || createdAt`, then exact `status === purchaseStatus`.
//   - month / trend / week / overdue bucketing uses `purchaseDate` only.
//   - "outstanding" = Pending | Partial | Draft; the funnel/received-rate use the
//     `Received` status (not in the enum, so it is always 0) — left to the client.
//   - active vendors: overall = distinct vendors that RESOLVE (client filters falsy);
//     this/last month = Set WITHOUT that filter, so purchases whose vendor no longer
//     exists (populate -> null) or is absent add ONE extra "null"/"undefined" member.
//   - the list route sorts createdAt DESC, so client ties are broken by createdAt desc.
// ===========================================================================
function emptyPurchasesSection() {
  return {
    totalPurchases: 0, totalAmount: 0, totalTax: 0, paidAmount: 0,
    outstanding: { count: 0, amount: 0 }, activeVendors: 0, statusDistribution: [],
    month: { thisCount: 0, thisAmount: 0, lastAmount: 0, paidThis: 0, paidLast: 0, outThis: 0, outLast: 0, taxThis: 0, taxLast: 0, vendorsThis: 0, vendorsLast: 0 },
    weekCount: 0, overdue: { count: 0, amount: 0 }, dueSoon: { count: 0, amount: 0 },
    topVendors: [], largest: [], upcoming: [], recent: [], trend: [],
  };
}

async function computePurchasesSection(req, org, userId, range, tz, purchaseStatus) {
  const access = await resolveModuleAccess(req, "purchases", "purchases");
  if (!access.allowed) return emptyPurchasesSection();
  const ownClause = access.ownOnly ? userOwn(userId) : null;

  const stages = effDateStages(org, ownClause, range, "purchaseDate");
  if (purchaseStatus) stages.push({ $match: { status: purchaseStatus } });

  const now = new Date();
  const { y, m } = zonedYmd(now, tz);
  const thisStart = zonedMonthStart(y, m, tz);
  const nextStart = zonedMonthStart(y, m + 1, tz);
  const lastStart = zonedMonthStart(y, m - 1, tz);
  const trendStart = zonedMonthStart(y, m - 5, tz);
  const weekAgo = sevenDaysAgoInZone(now, tz);

  const inMonth = (field, from, to) => ({
    $and: [{ $eq: [{ $type: field }, "date"] }, { $gte: [field, from] }, { $lt: [field, to] }],
  });
  const is = (v) => ({ $eq: ["$status", v] });
  const outstanding = { $or: [is("Pending"), is("Partial"), is("Draft")] };
  const one = (cond) => ({ $sum: { $cond: [cond, 1, 0] } });
  const amt = (cond) => ({ $sum: { $cond: [cond, "$_amt", 0] } });
  const tax = (cond) => ({ $sum: { $cond: [cond, "$_tax", 0] } });
  const thisM = inMonth("$purchaseDate", thisStart, nextStart);
  const lastM = inMonth("$purchaseDate", lastStart, thisStart);
  const hasDate = { $eq: [{ $type: "$purchaseDate" }, "date"] };
  const vendorMissing = { $eq: [{ $type: "$vendor" }, "missing"] };
  const tieSort = { createdAt: -1, _id: 1 }; // list route: createdAt desc

  const [agg] = await Purchase.aggregate([
    ...stages,
    {
      $addFields: {
        _amt: numOrZero("$grandTotal"), // p.grandTotal || 0
        _tax: numOrZero("$totalTax"), // p.totalTax || 0
        _key: { $cond: [{ $in: [{ $ifNull: ["$status", ""] }, ["", null]] }, "Unknown", "$status"] },
      },
    },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              amount: { $sum: "$_amt" },
              tax: { $sum: "$_tax" },
              paidAmount: amt(is("Paid")),
              outCount: one(outstanding),
              outAmount: amt(outstanding),
              weekCount: one({ $and: [hasDate, { $gte: ["$purchaseDate", weekAgo] }] }),
              overdueCount: one({ $and: [outstanding, hasDate, { $lt: ["$purchaseDate", weekAgo] }] }),
              overdueAmount: amt({ $and: [outstanding, hasDate, { $lt: ["$purchaseDate", weekAgo] }] }),
              dueSoonCount: one({ $and: [outstanding, hasDate, { $gte: ["$purchaseDate", weekAgo] }] }),
              dueSoonAmount: amt({ $and: [outstanding, hasDate, { $gte: ["$purchaseDate", weekAgo] }] }),
              vendorsAll: { $addToSet: "$vendor" },
            },
          },
        ],
        byStatus: [{ $group: { _id: "$_key", count: { $sum: 1 }, amount: { $sum: "$_amt" } } }],
        month: [
          {
            $group: {
              _id: null,
              thisCount: one(thisM), thisAmount: amt(thisM), lastAmount: amt(lastM),
              paidThis: amt({ $and: [thisM, is("Paid")] }), paidLast: amt({ $and: [lastM, is("Paid")] }),
              outThis: amt({ $and: [thisM, outstanding] }), outLast: amt({ $and: [lastM, outstanding] }),
              taxThis: tax(thisM), taxLast: tax(lastM),
              vThis: { $addToSet: { $cond: [thisM, "$vendor", "$$REMOVE"] } },
              vLast: { $addToSet: { $cond: [lastM, "$vendor", "$$REMOVE"] } },
              missThis: { $max: { $cond: [{ $and: [thisM, vendorMissing] }, 1, 0] } },
              missLast: { $max: { $cond: [{ $and: [lastM, vendorMissing] }, 1, 0] } },
            },
          },
        ],
        byVendor: [{ $group: { _id: "$vendor", count: { $sum: 1 }, amount: { $sum: "$_amt" } } }],
        largest: [
          { $sort: { _amt: -1, ...tieSort } },
          { $limit: 5 },
          { $project: { _id: 1, vendor: 1, amount: "$_amt" } },
        ],
        upcoming: [
          { $match: { $expr: outstanding } },
          { $sort: { purchaseDate: 1, ...tieSort } },
          { $limit: 6 },
          { $project: { _id: 1, purchaseNumber: 1, vendor: 1, purchaseDate: 1 } },
        ],
        // 8 most recent; the client shows the first 6 in "Recent Purchase Activity" and all 8 in the table.
        recent: [
          { $sort: { purchaseDate: -1, ...tieSort } },
          { $limit: 8 },
          { $project: { _id: 1, purchaseNumber: 1, vendor: 1, purchaseDate: 1, status: 1, amount: "$_amt" } },
        ],
        trend: [
          { $match: { purchaseDate: { $type: "date", $gte: trendStart, $lt: nextStart } } },
          {
            $group: {
              _id: { ym: { $dateToString: { format: "%Y-%m", date: "$purchaseDate", timezone: tz } }, status: "$status" },
              amount: { $sum: "$_amt" },
            },
          },
        ],
      },
    },
  ]);

  const t = (agg?.totals || [])[0] || {};
  const mo = (agg?.month || [])[0] || {};

  // Resolve vendor names/existence once (client reads the populated `vendor.name` / `vendor._id`).
  const ids = new Set();
  const addId = (v) => { if (v) ids.add(String(v)); };
  (t.vendorsAll || []).forEach(addId);
  (mo.vThis || []).forEach(addId);
  (mo.vLast || []).forEach(addId);
  (agg?.byVendor || []).forEach((r) => addId(r._id));
  [agg?.largest, agg?.upcoming, agg?.recent].forEach((l) => (l || []).forEach((r) => addId(r.vendor)));
  const vendors = ids.size ? await Vendor.find({ _id: { $in: [...ids] }, organization: org }).select("_id name").lean() : [];
  const nameById = Object.fromEntries(vendors.map((v) => [String(v._id), v.name]));
  const exists = (id) => !!id && Object.prototype.hasOwnProperty.call(nameById, String(id));
  const vname = (id) => (id ? nameById[String(id)] || null : null);

  // overall: distinct resolvable vendors. month: + one "null" member if any purchase has an unresolvable
  // (deleted / null) vendor + one "undefined" member if any has no vendor field at all.
  const activeVendors = new Set((t.vendorsAll || []).filter(exists).map(String)).size;
  const monthVendors = (set, missing) => {
    const arr = set || [];
    const resolved = new Set(arr.filter(exists).map(String)).size;
    const hasNull = arr.some((v) => v === null || (v && !exists(v)));
    return resolved + (hasNull ? 1 : 0) + (missing ? 1 : 0);
  };

  const byName = new Map();
  (agg?.byVendor || []).forEach((r) => {
    const name = vname(r._id);
    if (!name) return;
    const cur = byName.get(name) || { name, count: 0, amount: 0 };
    cur.count += r.count;
    cur.amount += r.amount;
    byName.set(name, cur);
  });

  return {
    totalPurchases: t.total || 0,
    totalAmount: t.amount || 0,
    totalTax: t.tax || 0,
    paidAmount: t.paidAmount || 0,
    outstanding: { count: t.outCount || 0, amount: t.outAmount || 0 },
    activeVendors,
    statusDistribution: (agg?.byStatus || [])
      .map((s) => ({ status: s._id, count: s.count, amount: s.amount }))
      .sort((a, b) => b.count - a.count || String(a.status).localeCompare(String(b.status))),
    month: {
      thisCount: mo.thisCount || 0, thisAmount: mo.thisAmount || 0, lastAmount: mo.lastAmount || 0,
      paidThis: mo.paidThis || 0, paidLast: mo.paidLast || 0, outThis: mo.outThis || 0, outLast: mo.outLast || 0,
      taxThis: mo.taxThis || 0, taxLast: mo.taxLast || 0,
      vendorsThis: monthVendors(mo.vThis, mo.missThis), vendorsLast: monthVendors(mo.vLast, mo.missLast),
    },
    weekCount: t.weekCount || 0,
    overdue: { count: t.overdueCount || 0, amount: t.overdueAmount || 0 },
    dueSoon: { count: t.dueSoonCount || 0, amount: t.dueSoonAmount || 0 },
    topVendors: [...byName.values()].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name)).slice(0, 5),
    largest: (agg?.largest || []).map((r) => ({ _id: r._id, vendorName: vname(r.vendor), amount: r.amount })),
    upcoming: (agg?.upcoming || []).map((r) => ({ _id: r._id, purchaseNumber: r.purchaseNumber, vendorName: vname(r.vendor), purchaseDate: r.purchaseDate })),
    recent: (agg?.recent || []).map((r) => ({ _id: r._id, purchaseNumber: r.purchaseNumber, vendorName: vname(r.vendor), purchaseDate: r.purchaseDate, status: r.status, amount: r.amount })),
    trend: (agg?.trend || []).map((r) => ({ ym: r._id.ym, status: r._id.status ?? null, amount: r.amount })),
  };
}

// ===========================================================================
// Invoices tab migration (report.invoices) — reproduces renderInvoicesReport
// (Insights.jsx), quirks included:
//   - filtered set: org + ownOnly (invoice route: user OR deal-of-an-owned-company),
//     date on `date || createdAt`. The Invoices tab has NO status filter.
//   - this/last month, trend and activity use their own fields (`date`, `updatedAt||createdAt`).
//   - overdue = has a dueDate, status !== "Paid" and dueDate < now.
//   - trend: invoices with `date >= (now with setMonth(getMonth()-6))` bucketed by calendar month in `tz`;
//     the client keeps the last 6 buckets.
//   - "Top deals" groups by the populated deal TITLE; "Top contacts by billing" groups by the deal's contact
//     id and takes the NAME from the contacts list the user may see (GET /contacts: plan + permission +
//     ownOnly), skipping contacts it cannot resolve.
//   - the invoice list route has no sort, so the client's tie order is natural order (~ _id asc).
// ===========================================================================

// Mirrors `const d = new Date(); d.setMonth(d.getMonth() - 6)` in a zone: same wall-clock time and day of
// month, month - 6, with JS's overflow rule (Aug 31 -> "Feb 31" -> Mar 3) and the ECMAScript rule for
// repeated / skipped local times (repeated -> earlier instant; skipped -> offset before the transition).
function sixMonthsAgoInZone(now, tz) {
  const wallOf = (ms) => {
    const p = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric",
      hour: "numeric", minute: "numeric", second: "numeric",
    }).formatToParts(new Date(ms));
    const g = (t) => Number(p.find((x) => x.type === t).value);
    return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  };
  const ms = ((now.getTime() % 1000) + 1000) % 1000;
  const w = new Date(wallOf(now.getTime() - ms));
  const wall = Date.UTC(w.getUTCFullYear(), w.getUTCMonth() - 6, w.getUTCDate(), w.getUTCHours(), w.getUTCMinutes(), w.getUTCSeconds());
  const offAt = (t) => wallOf(t) - t;
  const o1 = offAt(wall - 864e5);
  const o2 = offAt(wall + 864e5);
  const c1 = wall - o1;
  const c2 = wall - o2;
  let c = c1;
  if (o1 !== o2) {
    const v1 = offAt(c1) === o1;
    const v2 = offAt(c2) === o2;
    c = v1 && v2 ? Math.min(c1, c2) : v2 ? c2 : c1;
  }
  return new Date(c + ms);
}

function emptyInvoicesSection() {
  return {
    totalInvoices: 0, totalAmount: 0, paidAmount: 0, pendingAmount: 0, overdueAmount: 0,
    statusDistribution: [],
    month: { thisCount: 0, thisAmount: 0, lastCount: 0, lastAmount: 0, paidThis: 0, paidLast: 0, pendingThis: 0, pendingLast: 0, overdueThis: 0, overdueLast: 0 },
    topDeals: [], topContacts: [], largest: [], upcoming: [], recentActivity: [], trend: [],
  };
}

async function computeInvoicesSection(req, org, userId, range, tz) {
  const access = await resolveModuleAccess(req, "invoices", "invoices");
  if (!access.allowed) return emptyInvoicesSection();
  const ownClause = access.ownOnly ? await invoiceOwn(userId, org) : null;
  const stages = effDateStages(org, ownClause, range, "date"); // invoices: date || createdAt

  const now = new Date();
  const { y, m } = zonedYmd(now, tz);
  const thisStart = zonedMonthStart(y, m, tz);
  const nextStart = zonedMonthStart(y, m + 1, tz);
  const lastStart = zonedMonthStart(y, m - 1, tz);
  const sixAgo = sixMonthsAgoInZone(now, tz);

  const inMonth = (field, from, to) => ({
    $and: [{ $eq: [{ $type: field }, "date"] }, { $gte: [field, from] }, { $lt: [field, to] }],
  });
  const is = (v) => ({ $eq: ["$status", v] });
  const paid = is("Paid");
  const pendingish = { $or: [is("Pending"), is("Sent")] };
  const hasDue = { $eq: [{ $type: "$dueDate" }, "date"] };
  const overdue = { $and: [hasDue, { $ne: ["$status", "Paid"] }, { $lt: ["$dueDate", now] }] };
  const one = (cond) => ({ $sum: { $cond: [cond, 1, 0] } });
  const amt = (cond) => ({ $sum: { $cond: [cond, "$_amt", 0] } });
  const thisM = inMonth("$date", thisStart, nextStart);
  const lastM = inMonth("$date", lastStart, thisStart);

  const [agg] = await Invoice.aggregate([
    ...stages,
    {
      $addFields: {
        _amt: numOrZero("$amount"), // i.amount || 0
        _st: { $cond: [{ $in: [{ $ifNull: ["$status", ""] }, ["", null]] }, null, "$status"] }, // falsy status -> null
        _at: { $ifNull: ["$updatedAt", "$createdAt"] },
      },
    },
    // populate("deal"): title + contact id (a deleted deal yields none -> excluded from deal/contact rollups)
    { $lookup: { from: Deal.collection.name, localField: "deal", foreignField: "_id", as: "_d" } },
    { $addFields: { _dt: { $arrayElemAt: ["$_d.title", 0] }, _dc: { $arrayElemAt: ["$_d.contact", 0] } } },
    { $project: { _d: 0 } },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              amount: { $sum: "$_amt" },
              paidAmount: amt(paid),
              pendingAmount: amt(pendingish),
              overdueAmount: amt(overdue),
              thisCount: one(thisM), thisAmount: amt(thisM),
              lastCount: one(lastM), lastAmount: amt(lastM),
              paidThis: amt({ $and: [thisM, paid] }), paidLast: amt({ $and: [lastM, paid] }),
              pendingThis: amt({ $and: [thisM, pendingish] }), pendingLast: amt({ $and: [lastM, pendingish] }),
              overdueThis: amt({ $and: [thisM, overdue] }), overdueLast: amt({ $and: [lastM, overdue] }),
            },
          },
        ],
        byStatus: [{ $group: { _id: "$_st", count: { $sum: 1 }, amount: { $sum: "$_amt" } } }],
        trend: [
          { $match: { date: { $type: "date", $gte: sixAgo } } },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m", date: "$date", timezone: tz } },
              count: { $sum: 1 }, amount: { $sum: "$_amt" }, paid: amt(paid), overdue: amt(overdue),
            },
          },
        ],
        topDeals: [
          { $match: { _dt: { $type: "string", $ne: "" } } },
          { $group: { _id: "$_dt", count: { $sum: 1 }, amount: { $sum: "$_amt" }, paid: one(paid) } },
        ],
        topContacts: [
          { $match: { _dc: { $ne: null } } },
          { $group: { _id: "$_dc", invoiced: { $sum: "$_amt" }, collected: amt(paid) } },
        ],
        largest: [
          { $sort: { _amt: -1, _id: 1 } },
          { $limit: 5 },
          { $project: { _id: 1, status: 1, amount: "$_amt", dealTitle: "$_dt" } },
        ],
        upcoming: [
          { $match: { $expr: { $and: [pendingish, hasDue] } } },
          { $sort: { dueDate: 1, _id: 1 } },
          { $limit: 5 },
          { $project: { _id: 1, invoiceNumber: 1, amount: "$_amt", dueDate: 1 } },
        ],
        recentActivity: [
          { $match: { _at: { $ne: null } } },
          { $sort: { _at: -1, _id: 1 } },
          { $limit: 4 },
          { $project: { _id: 1, invoiceNumber: 1, status: 1, amount: "$_amt", at: "$_at" } },
        ],
      },
    },
  ]);

  const t = (agg?.totals || [])[0] || {};

  // Contact names come from the contacts the user may see (GET /contacts: plan + permission + ownOnly).
  let nameById = {};
  const groups = agg?.topContacts || [];
  if (groups.length) {
    const cAccess = await resolveModuleAccess(req, "contacts", "contacts");
    if (cAccess.allowed) {
      const cOwn = cAccess.ownOnly ? await contactOwn(userId, org) : null;
      const found = await Contact.find({ _id: { $in: groups.map((g) => g._id) }, organization: org, ...(cOwn || {}) }).select("_id name").lean();
      nameById = Object.fromEntries(found.map((c) => [String(c._id), c.name]));
    }
  }
  const topContacts = groups
    .map((g) => ({ name: nameById[String(g._id)], invoiced: g.invoiced, collected: g.collected }))
    .filter((c) => c.name) // the client skips contacts it cannot name
    .sort((a, b) => b.invoiced - a.invoiced || a.name.localeCompare(b.name))
    .slice(0, 8);

  return {
    totalInvoices: t.total || 0,
    totalAmount: t.amount || 0,
    paidAmount: t.paidAmount || 0,
    pendingAmount: t.pendingAmount || 0,
    overdueAmount: t.overdueAmount || 0,
    statusDistribution: (agg?.byStatus || [])
      .map((s) => ({ status: s._id, count: s.count, amount: s.amount }))
      .sort((a, b) => b.count - a.count || String(a.status).localeCompare(String(b.status))),
    month: {
      thisCount: t.thisCount || 0, thisAmount: t.thisAmount || 0, lastCount: t.lastCount || 0, lastAmount: t.lastAmount || 0,
      paidThis: t.paidThis || 0, paidLast: t.paidLast || 0, pendingThis: t.pendingThis || 0, pendingLast: t.pendingLast || 0,
      overdueThis: t.overdueThis || 0, overdueLast: t.overdueLast || 0,
    },
    topDeals: (agg?.topDeals || [])
      .map((d) => ({ title: d._id, count: d.count, amount: d.amount, paid: d.paid }))
      .sort((a, b) => b.amount - a.amount || a.title.localeCompare(b.title))
      .slice(0, 5),
    topContacts,
    largest: (agg?.largest || []).map((r) => ({ _id: r._id, status: r.status ?? null, amount: r.amount, dealTitle: r.dealTitle ?? null })),
    upcoming: (agg?.upcoming || []).map((r) => ({ _id: r._id, invoiceNumber: r.invoiceNumber, amount: r.amount, dueDate: r.dueDate })),
    recentActivity: (agg?.recentActivity || []).map((r) => ({ _id: r._id, invoiceNumber: r.invoiceNumber, status: r.status ?? null, amount: r.amount, at: r.at })),
    // [{ ym, count, amount, paid, overdue }] for months since "6 months ago"; the client keeps the last 6.
    trend: (agg?.trend || []).map((r) => ({ ym: r._id, count: r.count, amount: r.amount, paid: r.paid, overdue: r.overdue })),
  };
}

// ===========================================================================
// Vendors tab migration (report.vendors) — reproduces renderVendorsReport (Insights.jsx).
// Two independent halves, each gated like the route the client used:
//   vendors   (GET /vendors: plan + permission + ownOnly `user`): the SAME query and the SAME ledger service
//             (partyLedger.attachTotalsToVendors -> balance = payment-ledger net, NOT the stored field), then the
//             client's own date filter on `createdAt`. The Vendors tab has no vendor status filter.
//   purchases (GET /purchases): date on `purchaseDate || createdAt` AND the Purchases status filter (the Vendors
//             tab honours `purchaseStatus`); months/trend/recent also use `purchaseDate || createdAt`.
// Quirks mirrored: vendor names for "Top Vendors by Spend" come from the DATE-FILTERED vendors only (else
// "Unknown Vendor"); month active-vendor Sets have no filter(Boolean) (a deleted vendor adds one "null" member);
// the purchases list route sorts createdAt DESC (client tie order).
// ===========================================================================
function emptyVendorsSection() {
  return {
    vendors: { total: 0, withEmail: 0, withPhone: 0, withGSTIN: 0, withCompany: 0, totalBalance: 0, positive: 0, negative: 0, zero: 0, thisMonth: 0, outstandingPayables: 0, totalCredits: 0, topCompanies: [], table: [] },
    purchases: { count: 0, spend: 0, activeVendors: 0, month: { spendThis: 0, spendLast: 0, activeThis: 0, activeLast: 0 }, statusCounts: [], trend: [], topVendors: [], recent: [] },
  };
}

async function computeVendorsSection(req, org, userId, range, tz, purchaseStatus) {
  const out = emptyVendorsSection();
  const now = new Date();
  const { y, m } = zonedYmd(now, tz);
  const thisStart = zonedMonthStart(y, m, tz);
  const nextStart = zonedMonthStart(y, m + 1, tz);
  const lastStart = zonedMonthStart(y, m - 1, tz);
  const trendStart = zonedMonthStart(y, m - 5, tz);

  // ---------------- vendors half ----------------
  let filteredVendors = [];
  const vAccess = await resolveModuleAccess(req, "vendors", "vendors");
  if (vAccess.allowed) {
    const q = { organization: org };
    if (vAccess.ownOnly) q.user = userId;
    const all = await partyLedger.attachTotalsToVendors(org, await Vendor.find(q).lean());
    filteredVendors = range
      ? all.filter((v) => { const c = new Date(v.createdAt); return c >= range.start && c <= range.end; })
      : all;

    const bal = (v) => v.balance || 0;
    const companyDistribution = filteredVendors
      .filter((v) => v.company)
      .reduce((acc, v) => { acc[v.company] = (acc[v.company] || 0) + 1; return acc; }, {});
    const created = (v) => +new Date(v.createdAt);
    out.vendors = {
      total: filteredVendors.length,
      withEmail: filteredVendors.filter((v) => v.email).length,
      withPhone: filteredVendors.filter((v) => v.phone).length,
      withGSTIN: filteredVendors.filter((v) => v.gstin).length,
      withCompany: filteredVendors.filter((v) => v.company).length,
      totalBalance: filteredVendors.reduce((s, v) => s + bal(v), 0),
      positive: filteredVendors.filter((v) => bal(v) > 0).length,
      negative: filteredVendors.filter((v) => bal(v) < 0).length,
      zero: filteredVendors.filter((v) => bal(v) === 0).length,
      thisMonth: filteredVendors.filter((v) => { const c = created(v); return Number.isFinite(c) && c >= +thisStart && c < +nextStart; }).length,
      outstandingPayables: filteredVendors.filter((v) => bal(v) > 0).reduce((s, v) => s + v.balance, 0),
      totalCredits: filteredVendors.filter((v) => bal(v) < 0).reduce((s, v) => s + Math.abs(v.balance), 0),
      topCompanies: Object.entries(companyDistribution).sort(([, a], [, b]) => b - a).slice(0, 5),
      table: filteredVendors.slice(0, 8).map((v) => ({ _id: v._id, name: v.name, company: v.company, email: v.email, phone: v.phone, createdAt: v.createdAt, balance: v.balance })),
    };
  }
  const lookup = Object.fromEntries(filteredVendors.map((v) => [String(v._id), v]));

  // ---------------- purchases half ----------------
  const pAccess = await resolveModuleAccess(req, "purchases", "purchases");
  if (!pAccess.allowed) return out;
  const ownClause = pAccess.ownOnly ? userOwn(userId) : null;
  const stages = effDateStages(org, ownClause, range, "purchaseDate"); // purchaseDate || createdAt -> _effDate
  if (purchaseStatus) stages.push({ $match: { status: purchaseStatus } });

  const inMonth = (field, from, to) => ({ $and: [{ $eq: [{ $type: field }, "date"] }, { $gte: [field, from] }, { $lt: [field, to] }] });
  const is = (v) => ({ $eq: ["$status", v] });
  const one = (c) => ({ $sum: { $cond: [c, 1, 0] } });
  const amt = (c) => ({ $sum: { $cond: [c, "$_amt", 0] } });
  const thisM = inMonth("$_effDate", thisStart, nextStart);
  const lastM = inMonth("$_effDate", lastStart, thisStart);
  const vendorMissing = { $eq: [{ $type: "$vendor" }, "missing"] };
  const tieSort = { createdAt: -1, _id: 1 }; // purchases list route: createdAt desc

  const [agg] = await Purchase.aggregate([
    ...stages,
    { $addFields: { _amt: numOrZero("$grandTotal"), _key: { $cond: [{ $in: [{ $ifNull: ["$status", ""] }, ["", null]] }, "Draft", "$status"] } } },
    {
      $facet: {
        totals: [{ $group: { _id: null, count: { $sum: 1 }, spend: { $sum: "$_amt" }, vendorsAll: { $addToSet: "$vendor" } } }],
        month: [
          {
            $group: {
              _id: null,
              spendThis: amt(thisM), spendLast: amt(lastM),
              vThis: { $addToSet: { $cond: [thisM, "$vendor", "$$REMOVE"] } },
              vLast: { $addToSet: { $cond: [lastM, "$vendor", "$$REMOVE"] } },
              missThis: { $max: { $cond: [{ $and: [thisM, vendorMissing] }, 1, 0] } },
              missLast: { $max: { $cond: [{ $and: [lastM, vendorMissing] }, 1, 0] } },
            },
          },
        ],
        byStatus: [{ $group: { _id: "$_key", count: { $sum: 1 } } }],
        trend: [
          { $match: { _effDate: { $type: "date", $gte: trendStart, $lt: nextStart } } },
          { $group: { _id: { ym: { $dateToString: { format: "%Y-%m", date: "$_effDate", timezone: tz } }, status: "$status" }, amount: { $sum: "$_amt" } } },
        ],
        byVendor: [
          {
            $group: {
              _id: "$vendor",
              totalPaid: { $sum: "$_amt" },
              transactions: { $sum: 1 },
              lastPayment: { $max: "$_effDate" },
              bad: { $max: { $cond: [{ $or: [is("Pending"), is("Draft"), is("Cancelled")] }, 1, 0] } },
              partial: { $max: { $cond: [is("Partial"), 1, 0] } },
            },
          },
        ],
        recent: [
          { $sort: { _effDate: -1, ...tieSort } },
          { $limit: 4 },
          { $project: { _id: 1, vendor: 1, at: "$_effDate", status: 1, amount: "$_amt" } },
        ],
      },
    },
  ]);

  const t = (agg?.totals || [])[0] || {};
  const mo = (agg?.month || [])[0] || {};
  // Resolve vendors the way populate("vendor") does: existing vendor -> its _id/name; deleted -> none.
  const ids = new Set();
  const addId = (v) => { if (v) ids.add(String(v)); };
  (t.vendorsAll || []).forEach(addId);
  (mo.vThis || []).forEach(addId);
  (mo.vLast || []).forEach(addId);
  (agg?.byVendor || []).forEach((r) => addId(r._id));
  (agg?.recent || []).forEach((r) => addId(r.vendor));
  const found = ids.size ? await Vendor.find({ _id: { $in: [...ids] }, organization: org }).select("_id name").lean() : [];
  const nameById = Object.fromEntries(found.map((v) => [String(v._id), v.name]));
  const exists = (id) => !!id && Object.prototype.hasOwnProperty.call(nameById, String(id));
  const monthVendors = (set, missing) => {
    const arr = set || [];
    const resolved = new Set(arr.filter(exists).map(String)).size;
    const hasNull = arr.some((v) => v === null || (v && !exists(v)));
    return resolved + (hasNull ? 1 : 0) + (missing ? 1 : 0);
  };

  out.purchases = {
    count: t.count || 0,
    spend: t.spend || 0,
    activeVendors: new Set((t.vendorsAll || []).filter(exists).map(String)).size,
    month: { spendThis: mo.spendThis || 0, spendLast: mo.spendLast || 0, activeThis: monthVendors(mo.vThis, mo.missThis), activeLast: monthVendors(mo.vLast, mo.missLast) },
    statusCounts: (agg?.byStatus || []).map((s) => ({ status: s._id, count: s.count })).sort((a, b) => b.count - a.count || String(a.status).localeCompare(String(b.status))),
    trend: (agg?.trend || []).map((r) => ({ ym: r._id.ym, status: r._id.status ?? null, amount: r.amount })),
    topVendors: (agg?.byVendor || [])
      .filter((r) => exists(r._id))
      .map((r) => {
        const vendor = lookup[String(r._id)]; // date-filtered vendors only (else "Unknown Vendor")
        return {
          vendorId: String(r._id),
          totalPaid: r.totalPaid,
          transactions: r.transactions,
          lastPayment: r.lastPayment,
          name: vendor?.name || "Unknown Vendor",
          outstanding: Math.max(vendor?.balance || 0, 0),
          status: r.bad ? "Pending" : r.partial ? "Partially Paid" : "Paid",
        };
      })
      .sort((a, b) => b.totalPaid - a.totalPaid || a.vendorId.localeCompare(b.vendorId))
      .slice(0, 4),
    recent: (agg?.recent || []).map((r) => ({ id: r._id, at: r.at, amount: r.amount, vendorName: exists(r.vendor) ? nameById[String(r.vendor)] : null, status: r.status ?? null })),
  };
  return out;
}

// ===========================================================================
// Companies tab migration (report.companies) — reproduces renderCompaniesReport (Insights.jsx).
// The tab joins THREE lists (companies, deals, invoices) plus the unfiltered companies list as a name
// fallback, and builds many derived structures (bubble chart, pipeline contribution, revenue ranking).
// To stay exact, the SAME steps run here over the SAME queries the routes use (same gates, same ownOnly
// filter SHAPES -> same natural order -> same tie order), instead of re-expressing them as pipelines:
//   companies: GET /companies  (plan "companies" + permission "Companies" + owner filter)
//   deals    : GET /deals      (deals + deal own filter), then the client's createdAt range + dealStage filter
//   invoices : GET /invoices   (invoices + invoice own filter), range on `date || createdAt`; the company of an
//              invoice is its deal's (unpopulated) company id
// populate("company") semantics: a deal whose company no longer exists has NO company.
// Months are calendar months in `tz` (the browser's zone); the Companies tab has no company-size filter.
// ===========================================================================
async function computeCompaniesSection(req, org, userId, range, tz, dealStage) {
  const now = new Date();
  const { y, m } = zonedYmd(now, tz);
  const thisStart = +zonedMonthStart(y, m, tz);
  const nextStart = +zonedMonthStart(y, m + 1, tz);
  const lastStart = +zonedMonthStart(y, m - 1, tz);
  const T = (x) => +new Date(x);
  const inThis = (t) => Number.isFinite(t) && t >= thisStart && t < nextStart;
  const inLast = (t) => Number.isFinite(t) && t >= lastStart && t < thisStart;
  const inRange = (t) => t >= +range.start && t <= +range.end; // NaN -> false, like the client's Date compare

  // ---- sources (each behind the gate of the route the client used) ----
  const cAccess = await resolveModuleAccess(req, "companies", "Companies");
  const dAccess = await resolveModuleAccess(req, "deals", "deals");
  const iAccess = await resolveModuleAccess(req, "invoices", "invoices");

  let companies = [];
  if (cAccess.allowed) {
    const q = { organization: org, ...(cAccess.ownOnly ? companyOwn(userId) : {}) };
    companies = (await Company.find(q).select("_id name industry website address createdAt").lean())
      .map((c) => ({ ...c, _id: String(c._id) }));
  }

  let dealsRaw = [];
  if (dAccess.allowed) {
    const q = { organization: org };
    if (dAccess.ownOnly) q.$and = [await dealOwn(userId, org)]; // same shape as the deals route
    dealsRaw = await Deal.find(q).select("_id company status amount createdAt updatedAt").lean();
  }
  const dealCompanyIds = [...new Set(dealsRaw.map((d) => d.company).filter(Boolean).map(String))];
  const existingCompanies = new Set(
    dealCompanyIds.length ? (await Company.find({ _id: { $in: dealCompanyIds } }).select("_id").lean()).map((c) => String(c._id)) : []
  );
  const deals = dealsRaw.map((d) => ({ ...d, company: d.company && existingCompanies.has(String(d.company)) ? String(d.company) : null }));

  let invoices = [];
  if (iAccess.allowed) {
    const q = { organization: org, ...(iAccess.ownOnly ? await invoiceOwn(userId, org) : {}) };
    const inv = await Invoice.find(q).select("_id deal amount date createdAt").lean();
    const dealIds = [...new Set(inv.map((i) => i.deal).filter(Boolean).map(String))];
    const dealCo = new Map(
      dealIds.length ? (await Deal.find({ _id: { $in: dealIds } }).select("_id company").lean()).map((d) => [String(d._id), d.company ? String(d.company) : null]) : []
    );
    invoices = inv.map((i) => ({ amount: i.amount, date: i.date, createdAt: i.createdAt, dealCompany: i.deal ? dealCo.get(String(i.deal)) ?? null : null }));
  }

  // ---- the client's filteredData (companies & deals by createdAt, invoices by date||createdAt; deal stage) ----
  const filteredCompanies = range ? companies.filter((c) => inRange(T(c.createdAt))) : companies;
  let filteredDeals = range ? deals.filter((d) => inRange(T(d.createdAt))) : deals;
  if (dealStage) filteredDeals = filteredDeals.filter((d) => d.status === dealStage);
  const filteredInvoices = range ? invoices.filter((i) => inRange(T(i.date || i.createdAt))) : invoices;

  // ---- renderCompaniesReport, step for step ----
  const totalCompanies = filteredCompanies.length;
  const withWebsite = filteredCompanies.filter((c) => c.website).length;
  const withAddress = filteredCompanies.filter((c) => c.address).length;
  const withIndustry = filteredCompanies.filter((c) => c.industry).length;
  const companiesThisMonth = filteredCompanies.filter((c) => inThis(T(c.createdAt))).length;

  const industryDistribution = filteredCompanies.filter((c) => c.industry).reduce((acc, c) => { acc[c.industry] = (acc[c.industry] || 0) + 1; return acc; }, {});
  const topIndustries = Object.entries(industryDistribution).sort(([, a], [, b]) => b - a).slice(0, 5);
  const locationDistribution = filteredCompanies.filter((c) => c.address).reduce((acc, c) => {
    const location = c.address.split(",")[0].trim();
    acc[location] = (acc[location] || 0) + 1;
    return acc;
  }, {});
  const topLocations = Object.entries(locationDistribution).sort(([, a], [, b]) => b - a).slice(0, 5);

  const companyIdsWithDeals = new Set(filteredDeals.filter((d) => d.company).map((d) => d.company));
  const activeCompanies = filteredCompanies.filter((c) => companyIdsWithDeals.has(c._id)).length;
  const dealsWithCompany = filteredDeals.filter((d) => d.company);
  const avgDealSizeCompanies = dealsWithCompany.length > 0 ? dealsWithCompany.reduce((s, d) => s + (d.amount || 0), 0) / dealsWithCompany.length : 0;
  const wonDealsWithCompany = dealsWithCompany.filter((d) => d.status === "Won");
  const cycleDays = (d) => Math.max(0, (T(d.updatedAt || d.createdAt) - T(d.createdAt)) / (24 * 60 * 60 * 1000));
  const avgSalesCycleDays = wonDealsWithCompany.length > 0 ? Math.round(wonDealsWithCompany.reduce((s, d) => s + cycleDays(d), 0) / wonDealsWithCompany.length) : 0;

  const companiesBeforeThisMonth = filteredCompanies.filter((c) => T(c.createdAt) < thisStart).length;
  const totalCompaniesChange = companiesBeforeThisMonth > 0 ? { pct: Math.round((companiesThisMonth / companiesBeforeThisMonth) * 100), isNew: false } : { pct: 0, isNew: totalCompanies > 0 };
  const dealsThis = dealsWithCompany.filter((d) => inThis(T(d.createdAt)));
  const dealsLast = dealsWithCompany.filter((d) => inLast(T(d.createdAt)));
  const activeCompaniesChange = dealsLast.length > 0 ? { pct: Math.round(((dealsThis.length - dealsLast.length) / dealsLast.length) * 100), isNew: false } : { pct: 0, isNew: dealsThis.length > 0 };
  const companiesLastMonth = filteredCompanies.filter((c) => inLast(T(c.createdAt))).length;
  const newCompaniesChange = companiesLastMonth > 0 ? { pct: Math.round(((companiesThisMonth - companiesLastMonth) / companiesLastMonth) * 100), isNew: false } : { pct: 0, isNew: companiesThisMonth > 0 };
  const avgDealSizeThisMonth = dealsThis.length > 0 ? dealsThis.reduce((s, d) => s + (d.amount || 0), 0) / dealsThis.length : 0;
  const avgDealSizeLastMonth = dealsLast.length > 0 ? dealsLast.reduce((s, d) => s + (d.amount || 0), 0) / dealsLast.length : 0;
  const avgDealSizeChange = avgDealSizeLastMonth > 0 ? { pct: Math.round(((avgDealSizeThisMonth - avgDealSizeLastMonth) / avgDealSizeLastMonth) * 100), isNew: false } : { pct: 0, isNew: avgDealSizeThisMonth > 0 };
  const wonThis = wonDealsWithCompany.filter((d) => inThis(T(d.updatedAt || d.createdAt)));
  const wonLast = wonDealsWithCompany.filter((d) => inLast(T(d.updatedAt || d.createdAt)));
  const cycleFor = (list) => (list.length > 0 ? list.reduce((s, d) => s + cycleDays(d), 0) / list.length : 0);
  const cycleThisMonth = cycleFor(wonThis);
  const cycleLastMonth = cycleFor(wonLast);
  const salesCycleChange = cycleLastMonth > 0 ? { pct: Math.round(((cycleLastMonth - cycleThisMonth) / cycleLastMonth) * 100), isNew: false } : { pct: 0, isNew: cycleThisMonth > 0 };

  const companySourceColors = ["#0085FF", "#34C759", "#8E62EF", "#2A2726", "#D97706", "#EC4899"];
  const companySourceData = topIndustries.map(([industry, count], idx) => ({ name: industry, value: count, color: companySourceColors[idx % companySourceColors.length] }));
  const otherIndustriesCount = totalCompanies - topIndustries.reduce((s, [, c]) => s + c, 0);
  if (otherIndustriesCount > 0) companySourceData.push({ name: "Other", value: otherIndustriesCount, color: "#E7E4E3" });
  const companySourceTotal = Math.max(1, companySourceData.reduce((s, e) => s + e.value, 0));

  const dealsByCompanyId = {};
  filteredDeals.forEach((d) => { const cid = d.company; if (!cid) return; (dealsByCompanyId[cid] = dealsByCompanyId[cid] || []).push(d); });
  const velocityNow = Date.now();
  const velocityPoints = Object.entries(dealsByCompanyId)
    .map(([companyId, list]) => {
      const company = filteredCompanies.find((c) => c._id === companyId);
      const avgDealSize = list.reduce((s, d) => s + (d.amount || 0), 0) / list.length;
      const avgAgeDays = list.reduce((s, d) => s + Math.max(0, (velocityNow - T(d.createdAt)) / (24 * 60 * 60 * 1000)), 0) / list.length;
      const revenue = list.filter((d) => d.status === "Won").reduce((s, d) => s + (d.amount || 0), 0);
      return { name: company?.name || "Unknown", cycle: Math.round(avgAgeDays), dealSize: Math.round(avgDealSize), revenue };
    })
    .filter((p) => p.dealSize > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 15);
  const velocityRevenueMax = Math.max(1, ...velocityPoints.map((p) => p.revenue));
  velocityPoints.forEach((p) => { p.bubbleSize = 50 + Math.round((p.revenue / velocityRevenueMax) * 1800); });

  const nameOf = (id) => filteredCompanies.find((c) => String(c._id) === String(id)) || companies.find((c) => String(c._id) === String(id));
  const revenueByCompanyId = {};
  filteredDeals.forEach((d) => { if (d.status !== "Won") return; const cid = d.company; if (!cid) return; revenueByCompanyId[cid] = (revenueByCompanyId[cid] || 0) + (d.amount || 0); });
  filteredInvoices.forEach((inv) => { const cid = inv.dealCompany; if (!cid) return; revenueByCompanyId[cid] = (revenueByCompanyId[cid] || 0) + (inv.amount || 0); });

  const pipelineByCompanyId = {};
  Object.entries(dealsByCompanyId).forEach(([companyId, list]) => {
    const open = list.filter((d) => d.status !== "Won" && d.status !== "Lost").reduce((s, d) => s + (d.amount || 0), 0);
    const won = list.filter((d) => d.status === "Won").reduce((s, d) => s + (d.amount || 0), 0);
    pipelineByCompanyId[companyId] = { open, won };
  });
  const pipelineContributionData = Object.entries(pipelineByCompanyId)
    .map(([companyId, { open, won }]) => ({ name: nameOf(companyId)?.name || "Unknown", open, won, total: open + won }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
  const pipelineContributionMax = Math.max(1, ...pipelineContributionData.map((c) => c.total));

  const topRevenueColors = ["#0085FF", "#34C759", "#8E62EF", "#2A2726", "#D97706", "#FC9C32"];
  const topRevenueCompaniesAll = Object.entries(revenueByCompanyId)
    .map(([companyId, revenue]) => {
      const company = nameOf(companyId);
      const companyDeals = dealsByCompanyId[companyId] || [];
      const lastActiveTime = Math.max(0, ...companyDeals.map((d) => T(d.updatedAt || d.createdAt)));
      const activeDeals = companyDeals.filter((d) => d.status !== "Won" && d.status !== "Lost").length;
      return { name: company?.name || "Unknown", industry: company?.industry || "—", lastActive: lastActiveTime > 0 ? new Date(lastActiveTime).toISOString() : null, activeDeals, revenue };
    })
    .filter((c) => c.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .map((c, idx) => ({ ...c, color: topRevenueColors[idx % topRevenueColors.length] }));

  return {
    totalCompanies, withWebsite, withAddress, withIndustry, companiesThisMonth, topLocations,
    activeCompanies, avgDealSizeCompanies, avgSalesCycleDays,
    totalCompaniesChange, activeCompaniesChange, newCompaniesChange, avgDealSizeChange, salesCycleChange,
    companySourceData, companySourceTotal, velocityPoints, pipelineContributionData, pipelineContributionMax,
    topRevenueCompaniesAll,
  };
}

// ===========================================================================
// Contacts tab migration (report.contacts) — reproduces renderContactsReport (Insights.jsx).
// The tab joins FIVE lists. Same approach as Companies: run the client's steps, in order, over the SAME
// queries the list routes use (same gates, same ownOnly filter SHAPES -> same natural order -> same tie order):
//   contacts : GET /contacts   (contacts + contact own filter) -> range on createdAt, then contactStatus
//   deals    : GET /deals      (deals + deal own filter)       -> range on createdAt, then dealStage
//   invoices : GET /invoices   (invoices + invoice own filter) -> range on `date || createdAt`
//   meetings : GET /meetings   (org-wide; NOT range/status filtered by the tab)
//   tasks    : GET /tasks      (tasks assigned to the current user; NOT range/status filtered by the tab)
// populate semantics kept: a deal/meeting whose contact no longer exists has NO contact; a contact whose
// company/user no longer exists has no company/industry/owner. An invoice's contact is its deal's
// (UNpopulated) contact id, so it is not existence-checked. Months are calendar months in `tz`.
// ===========================================================================
async function computeContactsSection(req, org, userId, range, tz, filters) {
  const { contactStatus, dealStage } = filters || {};
  const now = new Date();
  const nowTs = +now;
  const { y, m } = zonedYmd(now, tz);
  const thisStart = +zonedMonthStart(y, m, tz);
  const nextStart = +zonedMonthStart(y, m + 1, tz);
  const lastStart = +zonedMonthStart(y, m - 1, tz);
  const T = (x) => +new Date(x);
  const inThis = (t) => Number.isFinite(t) && t >= thisStart && t < nextStart;
  const inLast = (t) => Number.isFinite(t) && t >= lastStart && t < thisStart;
  const inRange = (t) => t >= +range.start && t <= +range.end; // NaN -> false, like the client's Date compare
  const uniq = (arr) => [...new Set(arr.filter(Boolean).map(String))];
  const dayMs = 24 * 60 * 60 * 1000;

  const [cAccess, dAccess, iAccess, mAccess, tAccess] = await Promise.all([
    resolveModuleAccess(req, "contacts", "contacts"),
    resolveModuleAccess(req, "deals", "deals"),
    resolveModuleAccess(req, "invoices", "invoices"),
    resolveModuleAccess(req, "meetings", "meetings"),
    resolveModuleAccess(req, "tasks", "tasks"),
  ]);

  // ---- raw lists (each behind the gate of the route the client used) ----
  let contactsRaw = [];
  if (cAccess.allowed) {
    const q = { organization: org };
    if (cAccess.ownOnly) q.$and = [await contactOwn(userId, org)]; // same shape as the contacts route
    contactsRaw = await Contact.find(q).select("_id stageStatus createdAt company user").lean();
  }
  let dealsRaw = [];
  if (dAccess.allowed) {
    const q = { organization: org };
    if (dAccess.ownOnly) q.$and = [await dealOwn(userId, org)]; // same shape as the deals route
    dealsRaw = await Deal.find(q).select("_id contact title status amount createdAt updatedAt").lean();
  }
  let invoicesRaw = [];
  if (iAccess.allowed) {
    const q = { organization: org, ...(iAccess.ownOnly ? await invoiceOwn(userId, org) : {}) };
    invoicesRaw = await Invoice.find(q).select("_id deal invoiceNumber status amount date createdAt updatedAt").lean();
  }
  let meetingsRaw = [];
  if (mAccess.allowed) {
    meetingsRaw = await Meeting.find({ organization: org, linkedTo: "contact", contact: { $ne: null } })
      .select("_id title status contact scheduledAt createdAt updatedAt")
      .lean();
  }
  let tasksRaw = [];
  if (tAccess.allowed) {
    tasksRaw = await Task.find({ users: userId, organization: org, "relatedEntities.entityModel": "Contact" })
      .select("_id title status dueDate createdAt updatedAt")
      .lean();
  }

  // ---- populate emulation ----
  const companyIds = uniq(contactsRaw.map((c) => c.company));
  const ownerIds = uniq(contactsRaw.map((c) => c.user));
  const linkedContactIds = uniq([...dealsRaw.map((d) => d.contact), ...meetingsRaw.map((mt) => mt.contact)]);
  const invoiceDealIds = uniq(invoicesRaw.map((i) => i.deal));
  const [companyDocs, ownerDocs, contactDocs, invoiceDeals] = await Promise.all([
    companyIds.length ? Company.find({ _id: { $in: companyIds } }).select("_id industry").lean() : [],
    ownerIds.length ? User.find({ _id: { $in: ownerIds } }).select("_id").lean() : [],
    linkedContactIds.length ? Contact.find({ _id: { $in: linkedContactIds } }).select("_id").lean() : [],
    invoiceDealIds.length ? Deal.find({ _id: { $in: invoiceDealIds } }).select("_id contact").lean() : [],
  ]);
  const industryByCompany = new Map(companyDocs.map((c) => [String(c._id), c.industry]));
  const ownerExists = new Set(ownerDocs.map((u) => String(u._id)));
  const contactExists = new Set(contactDocs.map((c) => String(c._id)));
  const dealContactById = new Map(invoiceDeals.map((d) => [String(d._id), d.contact ? String(d.contact) : null]));

  const contacts = contactsRaw.map((c) => ({
    _id: String(c._id),
    stageStatus: c.stageStatus,
    createdAt: c.createdAt,
    industry: c.company ? industryByCompany.get(String(c.company)) : undefined,
    hasOwner: !!(c.user && ownerExists.has(String(c.user))),
  }));
  const deals = dealsRaw.map((d) => ({
    ...d,
    _id: String(d._id),
    contact: d.contact && contactExists.has(String(d.contact)) ? String(d.contact) : null,
  }));
  const invoices = invoicesRaw.map((i) => ({
    ...i,
    _id: String(i._id),
    dealContact: i.deal ? dealContactById.get(String(i.deal)) ?? null : null,
  }));
  const meetings = meetingsRaw.filter((mt) => mt.contact && contactExists.has(String(mt.contact)));

  // ---- the client's filteredData ----
  let filteredContacts = range ? contacts.filter((c) => inRange(T(c.createdAt))) : contacts;
  if (contactStatus) filteredContacts = filteredContacts.filter((c) => c.stageStatus === contactStatus);
  let filteredDeals = range ? deals.filter((d) => inRange(T(d.createdAt))) : deals;
  if (dealStage) filteredDeals = filteredDeals.filter((d) => d.status === dealStage);
  const filteredInvoices = range ? invoices.filter((i) => inRange(T(i.date || i.createdAt))) : invoices;

  // ---- KPI cards ----
  const totalContacts = filteredContacts.length;
  const contactIdsWithDeals = new Set(filteredDeals.filter((d) => d.contact).map((d) => d.contact));
  const contactsWithDeals = filteredContacts.filter((c) => contactIdsWithDeals.has(c._id)).length;
  const wonContacts = filteredContacts.filter((c) => c.stageStatus === "Won").length;
  const lostContacts = filteredContacts.filter((c) => c.stageStatus === "Lost").length;
  const statusDistribution = filteredContacts.reduce((acc, c) => {
    const status = c.stageStatus || "Unknown";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const statusEntries = Object.entries(statusDistribution).sort((a, b) => b[1] - a[1]);

  const contactsThisMonth = filteredContacts.filter((c) => inThis(T(c.createdAt))).length;
  const contactsBeforeThisMonth = filteredContacts.filter((c) => T(c.createdAt) < thisStart).length;
  const totalContactsChange =
    contactsBeforeThisMonth > 0
      ? { pct: Math.round((contactsThisMonth / contactsBeforeThisMonth) * 100), isNew: false }
      : { pct: 0, isNew: totalContacts > 0 };
  const contactsLastMonth = filteredContacts.filter((c) => inLast(T(c.createdAt))).length;
  const newContactsChange =
    contactsLastMonth > 0
      ? { pct: Math.round(((contactsThisMonth - contactsLastMonth) / contactsLastMonth) * 100), isNew: false }
      : { pct: 0, isNew: contactsThisMonth > 0 };
  const dealsWithContactThisMonth = filteredDeals.filter((d) => d.contact && inThis(T(d.createdAt))).length;
  const dealsWithContactLastMonth = filteredDeals.filter((d) => d.contact && inLast(T(d.createdAt))).length;
  const contactsWithDealsChange =
    dealsWithContactLastMonth > 0
      ? { pct: Math.round(((dealsWithContactThisMonth - dealsWithContactLastMonth) / dealsWithContactLastMonth) * 100), isNew: false }
      : { pct: 0, isNew: dealsWithContactThisMonth > 0 };
  const wonContactsThisMonth = filteredContacts.filter((c) => c.stageStatus === "Won" && inThis(T(c.createdAt))).length;
  const wonContactsLastMonth = filteredContacts.filter((c) => c.stageStatus === "Won" && inLast(T(c.createdAt))).length;
  const wonContactsChange =
    wonContactsLastMonth > 0
      ? { pct: Math.round(((wonContactsThisMonth - wonContactsLastMonth) / wonContactsLastMonth) * 100), isNew: false }
      : { pct: 0, isNew: wonContactsThisMonth > 0 };
  const lostContactsThisMonth = filteredContacts.filter((c) => c.stageStatus === "Lost" && inThis(T(c.createdAt))).length;
  const lostContactsLastMonth = filteredContacts.filter((c) => c.stageStatus === "Lost" && inLast(T(c.createdAt))).length;
  const lostContactsChange =
    lostContactsLastMonth > 0
      ? { pct: Math.round(((lostContactsThisMonth - lostContactsLastMonth) / lostContactsLastMonth) * 100), isNew: false }
      : { pct: 0, isNew: lostContactsThisMonth > 0 };

  // ---- Contact Commercial Impact: KPIs, day-of-week heatmap, deal scatter ----
  const ymdFmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const ymdOf = (date) => {
    const parts = ymdFmt.formatToParts(date);
    const get = (t) => Number(parts.find((p) => p.type === t).value);
    return { y: get("year"), m: get("month"), d: get("day") };
  };
  const impactWeeks = 6;
  const todayIdx = dayIndex(ymdOf(now));
  const mondayOffset = (new Date(todayIdx * dayMs).getUTCDay() + 6) % 7; // days since this week's Monday
  const currentWeekMondayIdx = todayIdx - mondayOffset;
  const impactGrid = Array.from({ length: impactWeeks }, () => Array(7).fill(0));

  const dealsWithContact = filteredDeals.filter((d) => d.contact);
  dealsWithContact
    .filter((d) => d.createdAt)
    .forEach((d) => {
      const daysAgo = currentWeekMondayIdx - dayIndex(ymdOf(new Date(d.createdAt)));
      const weeksAgo = Math.floor(daysAgo / 7);
      const rowFromBottom = impactWeeks - 1 - weeksAgo;
      if (rowFromBottom < 0 || rowFromBottom >= impactWeeks) return;
      const dayCol = 6 - (daysAgo - weeksAgo * 7);
      if (dayCol < 0 || dayCol > 6) return;
      impactGrid[rowFromBottom][dayCol] += d.amount || 0;
    });

  const pipelineInfluenced = dealsWithContact.reduce((sum, d) => sum + (d.amount || 0), 0);
  const revenueWon = dealsWithContact.filter((d) => d.status === "Won").reduce((sum, d) => sum + (d.amount || 0), 0);
  const avgDealInfluenced = dealsWithContact.length > 0 ? pipelineInfluenced / dealsWithContact.length : 0;
  const dealsForScatter = dealsWithContact.filter((d) => d.createdAt);
  const scatterAmountMax = Math.max(1, ...dealsForScatter.map((d) => d.amount || 0));
  const scatterPoints = dealsForScatter.map((d) => {
    const p = ymdOf(new Date(d.createdAt));
    const daysInMonth = new Date(Date.UTC(p.y, p.m, 0)).getUTCDate();
    return {
      month: p.m - 1 + (p.d - 1) / daysInMonth,
      amount: d.amount || 0,
      stage: d.status,
      title: d.title,
    };
  });

  // ---- Contact Alerts ----
  const dealsByContactId = {};
  filteredDeals.forEach((d) => {
    const cid = d.contact;
    if (!cid) return;
    (dealsByContactId[cid] = dealsByContactId[cid] || []).push(d);
  });
  const sumDeals = (cid) => (dealsByContactId[cid] || []).reduce((s, d) => s + (d.amount || 0), 0);
  const contactsWithAnyDeal = filteredContacts.filter((c) => dealsByContactId[c._id]?.length > 0);
  const coldContacts = contactsWithAnyDeal.filter((c) =>
    dealsByContactId[c._id].every((d) => nowTs - T(d.updatedAt || d.createdAt) > 30 * dayMs)
  );
  const coldPipeline = coldContacts.reduce((sum, c) => sum + sumDeals(c._id), 0);
  const followUpContacts = filteredContacts.filter((c) => c.stageStatus === "Contacted" || c.stageStatus === "New");
  const followUpPipeline = followUpContacts.reduce((sum, c) => sum + sumDeals(c._id), 0);
  const noOwnerContacts = filteredContacts.filter((c) => !c.hasOwner);
  const noOwnerPipeline = noOwnerContacts.reduce((sum, c) => sum + sumDeals(c._id), 0);
  const overdueInvoicesByContactId = {};
  filteredInvoices
    .filter((inv) => inv.status === "Overdue" && inv.dealContact)
    .forEach((inv) => {
      (overdueInvoicesByContactId[inv.dealContact] = overdueInvoicesByContactId[inv.dealContact] || []).push(inv);
    });
  const overdueContacts = filteredContacts.filter((c) => overdueInvoicesByContactId[c._id]?.length > 0);
  const overduePipeline = Object.values(overdueInvoicesByContactId).flat().reduce((sum, inv) => sum + (inv.amount || 0), 0);
  const alerts = {
    cold: { ids: coldContacts.map((c) => c._id), pipeline: coldPipeline },
    followUp: { ids: followUpContacts.map((c) => c._id), pipeline: followUpPipeline },
    noOwner: { ids: noOwnerContacts.map((c) => c._id), pipeline: noOwnerPipeline },
    overdue: { ids: overdueContacts.map((c) => c._id), pipeline: overduePipeline },
  };

  // ---- Contacts by Industry (via linked company), top 4 by count ----
  const industryGroups = {};
  filteredContacts.forEach((c) => {
    const industry = c.industry || "Unspecified";
    if (!industryGroups[industry]) industryGroups[industry] = { count: 0, pipeline: 0 };
    industryGroups[industry].count += 1;
    industryGroups[industry].pipeline += sumDeals(c._id);
  });
  const industryEntries = Object.entries(industryGroups).sort((a, b) => b[1].count - a[1].count).slice(0, 4);

  // ---- Recent Contact Activity: deals + invoices + meetings + tasks, newest 6 ----
  const activity = [];
  filteredDeals
    .filter((d) => d.contact)
    .forEach((d) => {
      const at = d.updatedAt || d.createdAt;
      if (!at) return;
      activity.push({ id: `deal-${d._id}`, type: "deal", title: d.title || "Deal", subtitle: d.status || "Update", amount: d.amount || 0, at });
    });
  filteredInvoices
    .filter((inv) => inv.dealContact)
    .forEach((inv) => {
      const at = inv.updatedAt || inv.date || inv.createdAt;
      if (!at) return;
      activity.push({ id: `invoice-${inv._id}`, type: "invoice", title: `Invoice #${inv.invoiceNumber}`, subtitle: inv.status, amount: inv.amount || 0, at });
    });
  meetings.forEach((mt) => {
    const at = mt.updatedAt || mt.scheduledAt || mt.createdAt;
    if (!at) return;
    activity.push({ id: `meeting-${mt._id}`, type: "meeting", title: mt.title || "Meeting", subtitle: mt.status || "Scheduled", amount: null, at });
  });
  tasksRaw.forEach((t) => {
    const at = t.updatedAt || t.dueDate || t.createdAt;
    if (!at) return;
    activity.push({ id: `task-${t._id}`, type: "task", title: t.title || "Task", subtitle: t.status || "Pending", amount: null, at });
  });
  const recentContactActivity = activity.sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 6);

  return {
    totalContacts, contactsWithDeals, wonContacts, lostContacts, contactsThisMonth,
    totalContactsChange, newContactsChange, contactsWithDealsChange, wonContactsChange, lostContactsChange,
    statusEntries,
    impactGrid, pipelineInfluenced, revenueWon, avgDealInfluenced, scatterAmountMax, scatterPoints,
    alerts, industryEntries, recentContactActivity,
  };
}

module.exports = { getReport, computeDealsSection, computePurchaseOrdersSection, computePurchasesSection, computeInvoicesSection, computeVendorsSection, computeCompaniesSection, computeContactsSection };
