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
// This endpoint is ADDITIVE. The frontend still uses its existing requests until
// Phase 5 parity verification.

const Contact = require("../models/Contact");
const Company = require("../models/Company");
const Deal = require("../models/Deal");
const Vendor = require("../models/Vendor");
const Purchase = require("../models/Purchase");
const PurchaseOrder = require("../models/PurchaseOrder");
const Invoice = require("../models/Invoice");
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

    const [deals, invoices, purchases, vendors, contacts, companies, pos, topCustomers] =
      await Promise.all([
        computeDeals(req, org, userId, range, tz),
        computeInvoices(req, org, userId, range, tz),
        computePurchases(req, org, userId, range, tz),
        computeVendors(req, org, userId, range),
        computeCountInRange(req, org, userId, range, "contacts", "contacts", Contact, "createdAt", contactOwn),
        computeCountInRange(req, org, userId, range, "companies", "Companies", Company, "createdAt", companyOwn),
        computePurchaseOrders(req, org, userId, range),
        computeTopCustomers(req, org, userId, range),
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
        totalPurchasesValue: purchases.totalAmountValue, // tile sums purchase.totalAmount
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

async function computeDeals(req, org, userId, range, tz) {
  const empty = { total: 0, totalValue: 0, won: 0, lost: 0, byMonth: toMonthArray({}, ["count", "value"]), pipeline: [] };
  const access = await resolveModuleAccess(req, "deals", "deals");
  if (!access.allowed) return empty;
  const ownClause = access.ownOnly ? await dealOwn(userId, org) : null;
  const match = buildMatch(org, ownClause, range, "createdAt"); // deals filter on createdAt

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
        // Overview "Total Purchases" tile sums totalAmount.
        totals: [{ $group: { _id: null, totalAmountValue: { $sum: { $ifNull: ["$totalAmount", 0] } } } }],
        // monthlyTrends.purchases is a count; value added (totalAmount) for charts.
        byMonth: [
          {
            $group: {
              _id: { $month: { date: "$_effDate", timezone: tz } },
              count: { $sum: 1 },
              value: { $sum: { $ifNull: ["$totalAmount", 0] } },
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

module.exports = { getReport };
