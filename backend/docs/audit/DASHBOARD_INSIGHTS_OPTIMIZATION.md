# Dashboard + Insights Performance Optimization — Full Implementation Plan

**Status:** Proposed
**Owner:** gaurav.girkar@datacircles.in
**Last updated:** 2026-10-07
**Scope:** `frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/Insights.jsx` and their supporting backend endpoints only.
**Out of scope:** The generic `/companies`, `/contacts`, `/invoices`, `/deals`, `/tasks`, `/meetings`, `/vendors`, `/purchases`, `/purchase-orders` list APIs — these stay as-is because Contacts, Companies, invoice screens, filters, exports and forms all depend on them.

---

## 0. Problem statement (verified against current code)

Both analytics pages download entire org-wide collections into the browser and compute everything client-side.

### Dashboard — `frontend/src/pages/Dashboard.jsx:1408`
```js
const [companiesRes, contactsRes, dealsRes, tasksRes, invoicesRes, meetingRes] =
  await Promise.allSettled([
    API.get("/companies"),
    API.get("/contacts"),
    API.get("/deals/dashboard-deals"),
    API.get("/tasks"),
    API.get("/invoices"),
    API.get("/meetings/dashboard"),
  ]).then((r) => r.map((x) => (x.status === "fulfilled" ? x.value : { data: [] })));

setTotalClients(companiesRes.data.length);     // count only
setTotalContacts(contactsRes.data.length);     // count only
setActiveDeals(dealsRes.data.filter(d => d.status === "Open").length);
setTotalTasks(allTasksData.length);            // count only
setTotalMeetings(meetingRes.data.length);      // count only
setInvoiceStats(calculateInvoiceStats(allInvoices)); // full scan in JS
```
Six full-collection downloads, five of them used **only** to produce a number.

### Insights — `frontend/src/pages/Insights.jsx:453`
```js
const [...] = await Promise.all([
  API.get("/contacts"), API.get("/companies"), API.get("/deals"),
  API.get("/tasks"),    API.get("/vendors"),   API.get("/purchase-orders"),
  API.get("/purchases"),API.get("/invoices"),  API.get("/meetings"),
  API.get("/kanban"),
]);
```
Ten full-collection downloads, then **all** charting/KPIs run through client-side `useMemo` date-range + status filtering (`Insights.jsx:500` onward).

### Why this must be fixed in phases, not one refactor
These pages share data shapes, permission scoping and business rules with the rest of the CRM. A single big-bang rewrite risks silently changing numbers (revenue, counts, pipeline) and breaking permission isolation. The phased approach below improves speed **without** touching the shared list APIs, and verifies accuracy before any old code is deleted.

---

## 1. Guiding principles (apply to every phase)

1. **Never remove an API call that feeds the UI.** If the Dashboard renders "Recent 5 invoices", those 5 records are legitimately required. Only remove downloads that exist *solely* to compute a count or aggregate.
2. **Reuse the existing security context exactly.** Every new endpoint must go through the same middleware chain as the list endpoint it replaces:
   ```js
   requireAuth, subscriptionGate, restrictByPlan(resource, action), checkPermission(resource, "readonly")
   ```
   and must scope every query with `{ organization: req.user.organization }` plus the `req.ownOnly` narrowing where the source endpoint applies it. No "generic stats" endpoint that bypasses org isolation, plan restriction, permissions or own-only rules.
3. **Preserve business math exactly.** Re-implement the *current* JS math in the aggregation — do not invent new metrics during an optimization. (Invoice paid/due/overdue math is specified in §4.3.)
4. **Add, verify, then remove.** New endpoint ships alongside the old fetch. Old fetch is deleted only after the verification matrix (§8) passes.
5. **One phase = one PR.** Each phase is independently reviewable and revertable.

---

## 2. Target architecture

```
          BEFORE                                   AFTER
 ┌─────────────┐                        ┌─────────────┐
 │  Dashboard  │ 6 full downloads       │  Dashboard  │ 1 stats call
 └──────┬──────┘ counts in browser      └──────┬──────┘ + only genuine UI data
        ▼                                       ▼
   /companies /contacts ...            GET /api/dashboard/stats
                                       (+ /invoices?limit=5 etc. if rendered)
                                              ▼
                                       countDocuments / aggregate
                                              ▼
                                           MongoDB

 ┌─────────────┐                        ┌─────────────┐
 │  Insights   │ 10 full downloads      │  Insights   │ 1 report call + date range
 └──────┬──────┘ analytics in React     └──────┬──────┘
        ▼                                       ▼
  /contacts ... /kanban              GET /api/insights/report?startDate&endDate
                                              ▼
                                       $match → $group → $sum/$count
                                              ▼
                                           MongoDB (indexed)
```

---

## 3. Phase roadmap

| # | Phase | Deliverable | Risk | Priority | Depends on |
|---|-------|-------------|------|----------|------------|
| 1 | Audit calculations | Field-by-field map of what each page consumes | Very low | 🔴 First | — |
| 2 | Dashboard Stats API | `GET /api/dashboard/stats` | Low | 🔴 | 1 |
| 3 | Refactor Dashboard | Replace KPI bulk fetches | Low | 🔴 | 2 |
| 4 | Insights Report API | Aggregation endpoint | Medium | 🔴 | 1 |
| 5 | Refactor Insights | Consume report instead of raw records | Medium | 🔴 | 4 |
| 6 | Date filtering | Server-side date range in report | High | 🔴 | 4,5 |
| 7 | Indexes | Indexes backing the real `$match` conditions | Low | 🔴 | 2,4 |
| 8 | Verification | Old vs new number parity | Very low | 🔴 | 3,5,6,7 |
| 9 | Cleanup | Remove dead bulk fetches | Medium | 🟡 | 8 |
| 10 | Caching / loading | Cache stable stats, parallelize, skeletons | Low | 🟡 | 8 |

**Execution order:** Dashboard → verify → Insights → verify → indexes → cleanup → performance measurement.

---

## Phase 1 — Audit current calculations

**Goal:** Before writing code, know exactly what each page needs from each endpoint, classified as:
- **A** — simple count (`.length`)
- **B** — KPI / aggregate calculation (sum, avg, grouped)
- **C** — chart series (grouped by month/stage/etc.)
- **D** — recent records actually rendered on screen
- **E** — other (dropdown options, config, filter source)

### 1.1 Dashboard audit table (to be completed by reading the file)

| Endpoint | Current use(s) | Class | Keep raw fetch? | Move to stats API? |
|----------|----------------|-------|-----------------|--------------------|
| `/companies` | `setTotalClients(data.length)` | A | No | ✅ count |
| `/contacts` | `setTotalContacts(data.length)` | A | No | ✅ count |
| `/deals/dashboard-deals` | `activeDeals`, `averageDealSize`, deal charts | A+B+C | **Maybe** (charts need rows) | ✅ counts; keep rows if charts stay client-side |
| `/tasks` | `totalTasks`, pending list `.slice(0,3)` | A+D | ✅ (renders recent 3) | ✅ count only |
| `/invoices` | `invoiceStats` (total/paid/pending/due), monthly revenue chart | B+C | **Maybe** | ✅ KPIs; chart → report |
| `/meetings/dashboard` | `totalMeetings`, recent `.slice(0,3)` | A+D | ✅ (renders recent 3) | ✅ count only |

> **Action item:** For each "Maybe", decide per widget whether the chart stays client-side (needs rows) or moves to aggregation (Phase 4). Record the decision in this table before Phase 2.

### 1.2 Insights audit table

| Endpoint | Current use | Class | Target |
|----------|-------------|-------|--------|
| `/contacts` | counts, by-month, status split | A+C | report `summary` + `*ByMonth` |
| `/companies` | counts, by-month | A+C | report |
| `/deals` | pipeline, value by stage/month, win rate | B+C | report `pipeline`, `dealsByMonth` |
| `/tasks` | status breakdown | A+B | report |
| `/vendors` | counts, top vendors | A+B | report `topVendors` |
| `/purchase-orders` | by month, totals | B+C | report `purchaseByMonth` |
| `/purchases` | expenses, by month | B+C | report `summary.expenses` |
| `/invoices` | revenue, by month, top customers | B+C | report `summary.revenue`, `revenueByMonth`, `topCustomers` |
| `/meetings` | counts | A | report |
| `/kanban` | **stage config** (names of live stages) | E | **Keep** — small config, not raw data |

> `/kanban` is class E (configuration, not bulk data). It stays a direct fetch; the report must label deal stages using these live stage names, not stale statuses stored on deals.

**Exit criteria for Phase 1:** Both tables fully filled, every "Maybe" resolved, the exact field list for the report response frozen (feeds §5).

---

## Phase 2 — Dashboard Stats API

### 2.1 Endpoint contract

```
GET /api/dashboard/stats
Auth: requireAuth, subscriptionGate
Response 200:
{
  "totalCompanies": 10000,
  "totalContacts": 10432,
  "totalDeals":    1432,
  "activeDeals":   318,
  "totalInvoices": 5821,
  "totalTasks":    734,
  "totalMeetings": 421,
  "invoiceStats": {
    "total":    4500000,   // sum of invoice.amount
    "paid":     3100000,   // sum of payments[].amount
    "pending":  900000,    // issued but not overdue, remaining
    "due":      500000     // overdue remaining (dueDate < now)
  }
}
```

### 2.2 Files

| File | Change |
|------|--------|
| `backend/routes/dashboardRoutes.js` | **New** route file |
| `backend/controllers/dashboardController.js` | **New** controller |
| `backend/server.js` | Mount `app.use("/api/dashboard", dashboardRoutes)` |

### 2.3 Route (mirrors existing middleware chains per resource)

```js
// backend/routes/dashboardRoutes.js
const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth");
const userSync = require("../middlewares/userSync");
const subscriptionGate = require("../middlewares/subscriptionGate");
const dashboardController = require("../controllers/dashboardController");

const requireAuth = [authMiddleware, userSync];

// Aggregates across modules; each sub-count is individually permission/plan
// scoped inside the controller so a module the org lacks returns 0, not 403.
router.get("/stats", requireAuth, subscriptionGate, dashboardController.getStats);

module.exports = router;
```

### 2.4 Controller — counts via `countDocuments`, money via aggregation

```js
// backend/controllers/dashboardController.js
const Company  = require("../models/Company");
const Contact  = require("../models/Contact");
const Deal     = require("../models/Deal");
const Task     = require("../models/Task");
const Invoice  = require("../models/Invoice");
const Meeting  = require("../models/Meeting");

const getStats = async (req, res) => {
  try {
    const org = req.user.organization;
    const base = { organization: org };

    // NOTE: if a given module is own-only for this user, narrow `base` the
    // same way the source list controller does (see invoiceController.getAllInvoices
    // `req.ownOnly` + getOwnedDealIds). Keep the scoping identical.

    const [
      totalCompanies, totalContacts, totalDeals, activeDeals,
      totalTasks, totalMeetings, invoiceStats,
    ] = await Promise.all([
      Company.countDocuments(base),
      Contact.countDocuments(base),
      Deal.countDocuments(base),
      Deal.countDocuments({ ...base, status: "Open" }),
      Task.countDocuments(base),
      Meeting.countDocuments(base),
      computeInvoiceStats(org),
    ]);

    res.json({
      totalCompanies, totalContacts, totalDeals, activeDeals,
      totalInvoices: invoiceStats.count,
      totalTasks, totalMeetings,
      invoiceStats,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Mirrors the current client-side calculateInvoiceStats / getCompanyInvoiceSummary math:
// paid = sum(payments[].amount); remaining = amount - paid;
// overdue ("due") when remaining > 0.01 && dueDate < now; else remaining is "pending".
async function computeInvoiceStats(org) {
  const now = new Date();
  const rows = await Invoice.aggregate([
    { $match: { organization: org } },
    { $addFields: {
        paidAmount: { $sum: { $ifNull: ["$payments.amount", []] } },
    } },
    { $addFields: {
        remaining: { $subtract: ["$amount", "$paidAmount"] },
        isOverdue: {
          $and: [
            { $gt: [{ $subtract: ["$amount", "$paidAmount"] }, 0.01] },
            { $ne: ["$dueDate", null] },
            { $lt: ["$dueDate", now] },
          ],
        },
    } },
    { $group: {
        _id: null,
        count:   { $sum: 1 },
        total:   { $sum: "$amount" },
        paid:    { $sum: "$paidAmount" },
        due:     { $sum: { $cond: ["$isOverdue", "$remaining", 0] } },
        pending: { $sum: { $cond: ["$isOverdue", 0,
                     { $cond: [{ $gt: ["$remaining", 0.01] }, "$remaining", 0] }] } },
    } },
  ]);
  const r = rows[0] || { count: 0, total: 0, paid: 0, due: 0, pending: 0 };
  delete r._id;
  return r;
}

module.exports = { getStats };
```

> ⚠️ **Confirm the math first.** Read the real `calculateInvoiceStats` in `Dashboard.jsx` and match "pending" vs "due" definitions exactly before shipping. The split above assumes the current UI means: *paid* = collected, *due* = overdue remaining, *pending* = not-yet-overdue remaining. Adjust if the UI buckets differently.

### 2.5 Exit criteria
- Endpoint returns in well under the current full-download time.
- Numbers match the client-side numbers for a seed org (checked manually, pre-Phase 8).
- A module the org doesn't have enabled returns `0`, never a 403 that breaks the whole response.

---

## Phase 3 — Refactor Dashboard

### 3.1 Replace the bulk fetch

In `frontend/src/pages/Dashboard.jsx:1379` (`fetchData`):

```js
// AFTER
const statsRes = await API.get("/dashboard/stats");
const s = statsRes.data;

setTotalClients(s.totalCompanies);
setTotalContacts(s.totalContacts);
setActiveDeals(s.activeDeals);
setTotalTasks(s.totalTasks);
setTotalMeetings(s.totalMeetings);
setInvoiceStats(s.invoiceStats);

// Only the records the UI actually renders:
const [tasksRes, meetingRes] = await Promise.allSettled([
  API.get("/tasks?limit=5"),            // recent pending list .slice(0,3)
  API.get("/meetings/dashboard?limit=5"),
]).then(r => r.map(x => x.status === "fulfilled" ? x.value : { data: [] }));

setTasks((tasksRes.data || []).filter(t => t.status === "Pending").slice(0, 3));
setMeetings((meetingRes.data || []).slice(0, 3));
```

### 3.2 Decisions carried from Phase 1
- **Deal charts:** if the "deal value over time" chart stays client-side, keep `/deals/dashboard-deals` (it already exists as a lighter endpoint). If it moves to aggregation, add it to the report in Phase 4 and drop the fetch.
- **Monthly revenue chart:** this is a chart (class C), not a KPI. It moves to the Insights report / a dashboard aggregation — **not** the stats count endpoint. Until that lands, you may keep the invoice fetch *for the chart only*, flagged as temporary.

### 3.3 Do **not** delete anything yet
Leave the old `/companies`, `/contacts`, `/invoices` count-only fetches commented/removed only after Phase 8. During Phase 3, ship stats alongside and compare.

### 3.4 Loading states
Keep the existing `StatTileSkeleton` gating on `loading`; the single stats call makes `loading` resolve much faster and more reliably (no `Promise.allSettled` fan-out needed for the counts).

---

## Phase 4 — Insights Report API (the high-value phase)

### 4.1 Endpoint contract

```
GET /api/insights/report?startDate=2026-01-01&endDate=2026-10-07
Auth: requireAuth, subscriptionGate  (+ per-module permission inside)
Response 200: (shape frozen in Phase 1 — exact fields come from what Insights.jsx renders)
{
  "summary": {
    "revenue": 4500000,       // sum invoice.amount in range
    "expenses": 1800000,      // sum purchases in range
    "profit": 2700000,
    "totalInvoices": 5821,
    "totalPurchases": 2341,
    "totalContacts": 10432,
    "totalCompanies": 10000,
    "totalDeals": 1432
  },
  "revenueByMonth":  [{ "month": "2026-01", "revenue": 45000 }, ...],
  "salesByMonth":    [...],
  "purchaseByMonth": [...],
  "dealsByMonth":    [...],
  "topCustomers":    [{ "company": "...", "revenue": 120000 }, ...],
  "topVendors":      [{ "vendor": "...", "amount": 90000 }, ...],
  "pipeline":        [{ "stage": "Open", "count": 120, "value": 900000 }, ...]
}
```

### 4.2 Files

| File | Change |
|------|--------|
| `backend/routes/insightsRoutes.js` | **New** |
| `backend/controllers/insightsController.js` | **New** |
| `backend/server.js` | Mount `app.use("/api/insights", insightsRoutes)` |

### 4.3 Revenue aggregation (matches current invoice payment math)

```js
// Revenue by month — grouped on invoice.date (the required date field), NOT createdAt.
const revenueByMonth = await Invoice.aggregate([
  { $match: {
      organization: org,
      date: { $gte: start, $lte: end },
  } },
  { $group: {
      _id: { $dateToString: { format: "%Y-%m", date: "$date", timezone: TZ } },
      revenue: { $sum: "$amount" },
      count:   { $sum: 1 },
  } },
  { $sort: { _id: 1 } },
  { $project: { _id: 0, month: "$_id", revenue: 1, count: 1 } },
]);
```

> **Timezone (`TZ`):** month bucketing must use the same timezone the client currently assumes (today it's the browser's local tz via `new Date(...)`). Pass an explicit IANA tz (e.g. `"Asia/Kolkata"`) to `$dateToString`/`$dateTrunc` so month boundaries match. This is the #1 source of "off by one month / one day" parity failures — see Phase 8.

### 4.4 Pipeline by live stage (uses `/kanban` config)

The report groups deals by `status`, but the *displayed* stages must be the live Kanban stage names (class E config from Phase 1). Group server-side, then the frontend maps/filters to live stages, OR pass the stage list in and `$match`/label inside the pipeline. Do not surface stale statuses left on deals after a stage rename/delete.

### 4.5 Exit criteria
- Browser receives KB-scale JSON regardless of collection size.
- Each section scoped by `{ organization }` and the correct per-module permission.
- Response shape matches the frozen Phase 1 field list — no invented metrics.

---

## Phase 5 — Refactor Insights frontend

### 5.1 Replace the 10-call fetch

In `frontend/src/pages/Insights.jsx:450` (`fetchData`):

```js
const fetchData = async (range) => {
  try {
    setLoading(true);
    const [reportRes, kanbanRes] = await Promise.all([
      API.get("/insights/report", {
        params: { startDate: range.startDate, endDate: range.endDate },
      }),
      API.get("/kanban").catch(() => ({ data: null })),  // live stage config stays
    ]);
    setReport(reportRes.data);
    setKanbanStatuses(kanbanRes.data?.statuses || null);
  } catch (e) {
    console.error("Failed to fetch insights:", e);
  } finally {
    setLoading(false);
  }
};
```

### 5.2 Delete the client-side `filteredData` analytics
The large `useMemo` at `Insights.jsx:500` (date filtering + grouping of raw arrays) is replaced by reading `report.summary`, `report.revenueByMonth`, etc. Keep only presentational transforms (formatting, color mapping) — **after** Phase 8 parity passes.

### 5.3 Wire date range → request (bridges into Phase 6)
Each range change (`This Month`, `Last Month`, `This Quarter`, `This Year`, `Custom`) now re-calls `/insights/report` with new `startDate`/`endDate` instead of re-filtering in React.

---

## Phase 6 — Date filtering (server-side)

**Critical:** the server, not React, applies the date window.

```
This Month   → startDate = first day of month,   endDate = today
Last Month   → startDate = first day prev month,  endDate = last day prev month
This Quarter → quarter bounds
This Year    → Jan 1 .. today
Custom       → user-supplied
```

- Frontend computes the bounds (keeping today's definitions of each preset) and sends them as query params.
- Backend `$match`es `{ organization, date: { $gte, $lte } }`.
- **Timezone consistency** (see §4.3): compute preset bounds and aggregate buckets in the same tz, or counts at month/day edges will disagree with the old client math.
- Result: even at 500,000 invoices the browser receives only the aggregated result.

**Risk note (why this is 🔴 High despite being "just a filter"):** date-boundary + timezone handling is the most error-prone part. Build the Phase 8 timezone/boundary tests *before* deleting client-side filtering.

---

## Phase 7 — Database indexes

Inspect the **actual** `$match` conditions written in Phases 2 & 4, then add only indexes that back them. Do not blindly add dozens.

### 7.1 Current invoice indexes (`backend/models/Invoice.js:147`)
```
{ organization: 1, financialYear: 1, invoiceNumber: 1 }   // existing
{ organization: 1, deal: 1 }                               // existing
{ organization: 1, ... }                                   // existing (line 156)
```
**Missing for the new report:** `{ organization: 1, date: 1 }` (revenue-by-month `$match` + bucket) and, if status buckets are filtered server-side, `{ organization: 1, status: 1 }`.

### 7.2 Indexes to add (verify each against the real pipeline first)
```js
// Invoice.js
invoiceSchema.index({ organization: 1, date: 1 });       // report date range
// invoiceSchema.index({ organization: 1, dueDate: 1 });  // only if overdue is queried via $match
// invoiceSchema.index({ organization: 1, status: 1 });   // only if status is a $match, not just $group

// Deal / Contact / Company / Purchase / Vendor:
// add { organization: 1, createdAt: 1 } ONLY where a *ByMonth bucket matches on that field.
```

### 7.3 Rollout
- Create indexes in a migration/`ensureIndexes` step, ideally `background: true` on large collections.
- Confirm with `.explain("executionStats")` that the new aggregations use an `IXSCAN` on `{organization, date}` and not a `COLLSCAN`.

---

## Phase 8 — Verification (mandatory gate before any deletion)

Run old path and new path side by side for the **same org + same range** and assert equality.

### 8.1 Parity matrix

| Metric | Old (client) | New (API) | Match? |
|--------|-------------|-----------|--------|
| totalCompanies | `companies.length` | `stats.totalCompanies` | ☐ |
| totalContacts | `contacts.length` | `stats.totalContacts` | ☐ |
| activeDeals | `.filter(status==="Open").length` | `stats.activeDeals` | ☐ |
| totalInvoices | `invoices.length` | `stats.totalInvoices` | ☐ |
| invoiceStats.paid | `calculateInvoiceStats(...)` | `stats.invoiceStats.paid` | ☐ |
| Jan revenue | client sum | `revenueByMonth["2026-01"]` | ☐ |
| Feb revenue | client sum | `revenueByMonth["2026-02"]` | ☐ |
| pipeline per stage | client group | `report.pipeline` | ☐ |

### 8.2 Scenarios to test (each must match)
- current month / previous month / this quarter / this year / custom range
- empty data org
- large data org
- **two different organizations** (isolation — org A never sees org B)
- restricted permissions user + **own-only** user (narrowing matches old behavior)
- **timezone boundaries** (first/last day of month at local midnight)
- cancelled / void / zero-amount invoices
- partially-paid invoices (paid + due split correct)
- deals on renamed/deleted stages (must not appear as stale stages)

### 8.3 Exit gate
Every row and scenario matches. **Only then** proceed to Phase 9.

---

## Phase 9 — Cleanup (only after Phase 8 passes)

### Dashboard — remove
- ❌ `/companies` fetch used only for count
- ❌ `/contacts` fetch used only for count
- ❌ `/invoices` full fetch used only for `invoiceStats` (keep limited fetch only if a chart still needs rows and that chart hasn't moved to aggregation)
- ❌ count-only `/deals` / `/tasks` / `/meetings` downloads

### Dashboard — keep
- ✅ `/tasks?limit=5` (renders recent 3)
- ✅ `/meetings/dashboard?limit=5` (renders recent 3)
- ✅ any fetch still backing a client-side chart that intentionally stayed client-side

### Insights — remove
- ❌ the 9 org-wide raw-data downloads
- ❌ the client-side `filteredData` analytics `useMemo`
- ❌ any duplicate requests

### Insights — keep
- ✅ `GET /api/insights/report`
- ✅ `GET /api/kanban` (live stage config)

Delete dead state setters (`setContacts`, `setVendors`, etc.) and unused imports surfaced by the lint pass.

---

## Phase 10 — Caching & loading polish (🟡 after correctness)

- **Cache stable stats:** dashboard counts change slowly — short TTL cache (e.g. Redis via existing `redisClient.js` / `cacheHelper.js`) keyed by `org:dashboard:stats`, invalidated on relevant writes. *(Project already has Redis wiring — reuse it, don't add a new cache layer.)*
- **Parallelize** independent report sections server-side with `Promise.all` (already done in the controller sketches).
- **Loading states:** keep `StatTileSkeleton`; add a report-level skeleton for Insights charts while the single call is in flight.
- **Measure:** record payload size + TTFB before/after for one representative org and attach to the closing PR.

---

## Non-negotiable constraints (repeat)

1. **Do not modify** the shared `/companies`, `/contacts`, `/invoices`, `/deals`, `/tasks`, `/meetings`, `/vendors`, `/purchases`, `/purchase-orders` list endpoints. They serve Contacts, Companies, invoice screens, filters, exports and forms.
2. **Fix the reporting consumers, not the CRM data layer.**
3. New endpoints reuse the **exact** middleware chain + `organization` + `ownOnly` scoping of the endpoint they replace.
4. **Add → verify → remove**, never remove first.
5. Do not promise "MongoDB crunches millions of rows in milliseconds" — it's fast **only** with the right pipeline, indexes, date filter and data model (Phase 7 + `explain`).

---

## Appendix A — New files summary

| File | Phase | Purpose |
|------|-------|---------|
| `backend/routes/dashboardRoutes.js` | 2 | `/api/dashboard/stats` route |
| `backend/controllers/dashboardController.js` | 2 | counts + invoice aggregation |
| `backend/routes/insightsRoutes.js` | 4 | `/api/insights/report` route |
| `backend/controllers/insightsController.js` | 4 | report aggregation |
| `backend/models/Invoice.js` (edit) | 7 | add `{organization, date}` index |
| `backend/server.js` (edit) | 2,4 | mount new routers |
| `frontend/src/pages/Dashboard.jsx` (edit) | 3,9 | consume stats, drop bulk fetch |
| `frontend/src/pages/Insights.jsx` (edit) | 5,9 | consume report, drop raw analytics |

## Appendix B — Reference: existing patterns to copy

- Lightweight scoped endpoints already in the codebase: `/deals/dashboard-deals` (`routes/dealRoutes.js:15`), `/tasks/dashboard-tasks` (`routes/taskRoutes.js:15`), `/meetings/dashboard` (`routes/meetings.js:24`). Model the new endpoints on these.
- Server-side invoice summary math already exists in `invoiceController.getCompanyInvoiceSummary` (`controllers/invoiceController.js:496`) — reuse its paid/due/overdue logic verbatim in the aggregation.
- Own-only narrowing pattern: `invoiceController.getAllInvoices` `req.ownOnly` + `getOwnedDealIds` (`controllers/invoiceController.js:421`).

---

*End of plan.*
