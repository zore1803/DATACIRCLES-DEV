// controllers/dashboardController.js
//
// Dashboard reporting aggregates. This endpoint exists purely to remove the
// Dashboard's full-collection downloads of /companies and /contacts, which the
// page used ONLY to compute counts, month-over-month trend arrows and the CRM
// "Contact Engagement" health metric — never to render company/contact rows.
//
// NON-BREAKING CONTRACT (see DASHBOARD_INSIGHTS_PHASE1_AUDIT.md):
//  - Reproduces the EXACT numbers Dashboard.jsx produced client-side.
//  - Reuses the real restrictByPlan + checkPermission middleware (run
//    programmatically below) so subscription/plan/permission/ownOnly behavior
//    is identical to the /companies and /contacts list routes — it can never
//    drift from them. A module the user/plan can't read returns zeros for that
//    module only (mirrors the Dashboard's Promise.allSettled fallback), never a
//    whole-endpoint 403.
//  - Month boundaries are taken from the client (local-time), preserving the
//    browser-local bucketing getMonthOverMonthChange used. No timezone change.
//
// It deliberately does NOT touch deals/tasks/meetings/invoices: those stay
// fetched by the Dashboard because it genuinely renders their rows/charts/table.

const Company = require("../models/Company");
const Contact = require("../models/Contact");
const Deal = require("../models/Deal");
const restrictByPlan = require("../middlewares/restrictByPlan");
const checkPermission = require("../middlewares/checkPermission");
const { getOwnedCompanyIds } = require("../utils/ownedCompanies");
const { cacheGetOrSet } = require("../cacheHelper");
const { dashboardStatsKey } = require("../utils/cacheKeys");

const DASHBOARD_STATS_TTL_SECONDS = 60;

// Run an Express (req, res, next) middleware in-process and resolve to true iff
// it calls next() without an error (i.e. access granted). Any res.json()/send()/
// status() response (a 403/500 from the gate) resolves to false. This lets the
// controller reuse the project's real gating logic per module instead of
// re-implementing — and therefore never diverging from — it.
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
      statusCode: 200,
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

// Mirrors the route chain order: subscriptionGate (already run at route level)
// -> restrictByPlan(module, "read") -> checkPermission(resource, "readonly").
// Returns whether the module is readable and the resulting ownOnly flag (set by
// checkPermission exactly as the list routes rely on).
async function resolveModuleAccess(req, planModule, permResource) {
  req.ownOnly = false;
  const planOk = await runGate(restrictByPlan(planModule, "read"), req);
  if (!planOk) return { allowed: false, ownOnly: false };
  const permOk = await runGate(checkPermission(permResource, "readonly"), req);
  return { allowed: permOk, ownOnly: !!req.ownOnly };
}

// Parse an ISO date query param; returns undefined when absent/invalid so the
// caller can fall back to a server-computed boundary.
function parseDate(value) {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const getStats = async (req, res) => {
  try {
    const org = req.user.organization;
    const userId = req.user._id;

    // Month boundaries. The client sends the same local-time boundaries
    // getMonthOverMonthChange used, so trend counts bucket identically to the
    // old client-side math. Fallback (no params) uses server time — only a
    // safety net; the refactored Dashboard always sends them.
    const now = new Date();
    const thisMonthStart =
      parseDate(req.query.thisMonthStart) ||
      new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart =
      parseDate(req.query.nextMonthStart) ||
      new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const lastMonthStart =
      parseDate(req.query.lastMonthStart) ||
      new Date(now.getFullYear(), now.getMonth() - 1, 1);

    // Redis cache (60s). The key carries every input that can change the
    // response: tenant, user (drives ownOnly + permission/plan gating), role
    // (drives the deal scope) and the three resolved month boundaries.
    const cacheKey = dashboardStatsKey({
      org,
      userId,
      role: req.user.role,
      thisMonthStart,
      nextMonthStart,
      lastMonthStart,
    });

    const stats = await cacheGetOrSet(cacheKey, DASHBOARD_STATS_TTL_SECONDS, async () => {
      const [companies, contacts] = await Promise.all([
        computeCompanies(req, org, userId, {
          thisMonthStart,
          nextMonthStart,
          lastMonthStart,
        }),
        computeContacts(req, org, userId, {
          thisMonthStart,
          nextMonthStart,
          lastMonthStart,
        }),
      ]);
      return { companies, contacts };
    });

    res.json(stats);
  } catch (err) {
    console.error("Dashboard stats error:", err);
    res.status(500).json({ message: err.message });
  }
};

// Companies: total + this/last-month counts. Scope mirrors
// companyController.getAllContacts... (getAllCompanies): org + own-only
// { user | createdBy | owner } === me. No cross-entity dependency.
async function computeCompanies(req, org, userId, bounds) {
  const empty = { total: 0, thisMonth: 0, lastMonth: 0 };
  const { allowed, ownOnly } = await resolveModuleAccess(
    req,
    "companies",
    "Companies"
  );
  if (!allowed) return empty;

  const base = { organization: org };
  if (ownOnly) {
    base.$or = [{ user: userId }, { createdBy: userId }, { owner: userId }];
  }

  const [total, thisMonth, lastMonth] = await Promise.all([
    Company.countDocuments(base),
    Company.countDocuments({
      ...base,
      createdAt: { $gte: bounds.thisMonthStart, $lt: bounds.nextMonthStart },
    }),
    Company.countDocuments({
      ...base,
      createdAt: { $gte: bounds.lastMonthStart, $lt: bounds.thisMonthStart },
    }),
  ]);

  return { total, thisMonth, lastMonth };
}

// Contacts: total + this/last-month counts + "engaged" (contacts referenced by
// any deal) for the CRM Contact-Engagement health metric.
//
// Scope mirrors contactController.getAllContacts: org + own-only
// { user | createdBy | company in ownedCompanyIds } === me.
//
// "engaged" reproduces crmHealthMetrics exactly: the Dashboard intersected the
// /contacts list with the SET of contact ids referenced by /deals/dashboard-deals
// (which is role-scoped: staff -> own user's deals, others -> whole org), NOT the
// own-only deal scope. We replicate that exact (mixed) scoping, gated on deals
// read access so a user without deals access gets engaged = 0, matching the old
// allSettled fallback of deals = [].
async function computeContacts(req, org, userId, bounds) {
  const empty = { total: 0, thisMonth: 0, lastMonth: 0, engaged: 0 };
  const { allowed, ownOnly } = await resolveModuleAccess(
    req,
    "contacts",
    "contacts"
  );
  if (!allowed) return empty;

  const base = { organization: org };
  if (ownOnly) {
    const ownedCompanyIds = await getOwnedCompanyIds(userId, org);
    base.$or = [
      { user: userId },
      { createdBy: userId },
      { company: { $in: ownedCompanyIds } },
    ];
  }

  const [total, thisMonth, lastMonth, engaged] = await Promise.all([
    Contact.countDocuments(base),
    Contact.countDocuments({
      ...base,
      createdAt: { $gte: bounds.thisMonthStart, $lt: bounds.nextMonthStart },
    }),
    Contact.countDocuments({
      ...base,
      createdAt: { $gte: bounds.lastMonthStart, $lt: bounds.thisMonthStart },
    }),
    computeEngagedContacts(req, org, userId, base),
  ]);

  return { total, thisMonth, lastMonth, engaged };
}

async function computeEngagedContacts(req, org, userId, contactBase) {
  // Gate on deals read access (dashboard-deals carries deals read permission).
  // Note dashboard-deals ownOnly is role-based, not permission-ownOnly, so we
  // only use the access decision here, then apply the role scope ourselves.
  req.ownOnly = false;
  const dealsPlanOk = await runGate(restrictByPlan("deals", "read"), req);
  if (!dealsPlanOk) return 0;
  const dealsPermOk = await runGate(checkPermission("deals", "readonly"), req);
  if (!dealsPermOk) return 0;

  const dealScope = { organization: org };
  if (req.user.role === "staff") dealScope.user = userId;

  const referencedContactIds = await Deal.distinct("contact", dealScope);
  const ids = (referencedContactIds || []).filter(Boolean);
  if (ids.length === 0) return 0;

  return Contact.countDocuments({ ...contactBase, _id: { $in: ids } });
}

module.exports = { getStats };
