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
const Purchase = require("../models/Purchase");
const PurchaseOrder = require("../models/PurchaseOrder");
const Invoice = require("../models/Invoice");
const Task = require("../models/Task");
const Meeting = require("../models/Meeting");
const restrictByPlan = require("../middlewares/restrictByPlan");
const checkPermission = require("../middlewares/checkPermission");
const { getOwnedCompanyIds, getOwnedDealIds } = require("../utils/ownedCompanies");

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

    const [deals, invoices, purchases, vendors, contacts, companies, pos, topCustomers, overviewStats, dailyTrends, activity] =
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
      ]);

    const revenue = invoices.revenue;
    const collected = invoices.collected;
    const outstanding = revenue - collected;

    res.json({
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
    });
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

module.exports = { getReport };
