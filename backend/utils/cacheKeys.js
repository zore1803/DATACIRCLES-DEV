// utils/cacheKeys.js
//
// The ONE place every Redis cache key is built. Each key family carries an explicit
// version: `<family>:<version>:<scope...>`.
//
// Bump a family's version whenever the SHAPE of what it caches changes (response fields
// added/removed/renamed, different computation rules) or its key parts change. The app
// only ever reads and writes the current version, so entries written by older code are
// simply never looked up (they expire on their own within the TTL) — no flush, no
// coordination between old and new servers during a deploy.
//
// Every key starts `<family>:<version>:<organization>:` and the organization is always
// first, so a tenant can only ever address its own keys. Free-text parts are URI-encoded
// so a ":" inside one can't shift into a neighbouring part.
const VERSIONS = Object.freeze({
  dashboardStats: "v1",
  insightsReport: "v1",
  globalSearch: "v3",
});

const FAMILIES = Object.freeze({
  dashboardStats: "dashboard:stats",
  insightsReport: "insights:report",
  globalSearch: "global-search",
});

const enc = (v) => encodeURIComponent(v === undefined || v === null ? "" : String(v));
const prefix = (family) => `${FAMILIES[family]}:${VERSIONS[family]}`;

// Dashboard: per tenant + user + role (drive ownOnly / gating) + the three month bounds.
function dashboardStatsKey({ org, userId, role, thisMonthStart, nextMonthStart, lastMonthStart }) {
  return [
    prefix("dashboardStats"),
    enc(org),
    enc(userId),
    enc(role || "none"),
    thisMonthStart.toISOString(),
    nextMonthStart.toISOString(),
    lastMonthStart.toISOString(),
  ].join(":");
}

// Insights: per tenant + user + role + validated date range + tz + the four status filters.
function insightsReportKey({ org, userId, role, range, tz, statusFilters }) {
  return [
    prefix("insightsReport"),
    enc(org),
    enc(userId),
    enc(role || "none"),
    range ? range.start.toISOString() : "all",
    range ? range.end.toISOString() : "all",
    enc(tz),
    enc(statusFilters.contactStatus || "all"),
    enc(statusFilters.dealStage || "all"),
    enc(statusFilters.purchaseStatus || "all"),
    enc(statusFilters.poStatus || "all"),
  ].join(":");
}

// Global search: per tenant (the result is org-wide by design) + the query parts.
function globalSearchKey({ org, search, lifecycleStage, stageStatus }) {
  return [prefix("globalSearch"), enc(org), enc(search), enc(lifecycleStage), enc(stageStatus)].join(":");
}

module.exports = { VERSIONS, FAMILIES, dashboardStatsKey, insightsReportKey, globalSearchKey };
