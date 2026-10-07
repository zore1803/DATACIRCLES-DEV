# Phase 1 Audit — Dashboard + Insights (AUDIT ONLY, no code changed)

**Date:** 2026-10-07
**Scope:** `frontend/src/pages/Dashboard.jsx` (3,155 lines), `frontend/src/pages/Insights.jsx` (7,099 lines) and their source endpoints.
**Rule followed:** The *actual code* is the source of truth. Where the implementation plan's assumptions were wrong, this document corrects them (see §3 — the plan's `payments[]`-based invoice math is **not** what the code does).

---

## ⚠️ Headline corrections to the implementation plan (read first)

1. **`calculateInvoiceStats` does NOT use `payments[]`.** It buckets invoice `amount` purely by the `status` string (`delivered`/`sent`/`accepted`). There is no partial-payment logic, no `payments` array, no `remaining = amount − paid` anywhere in the Dashboard. (§3)
2. **Dashboard and Insights use different, incompatible invoice status vocabularies.** Dashboard treats `accepted` as "paid"; Insights treats `Paid` as paid and has an `Overdue` status. A single unified backend definition would break one of the two pages. (§4, §9-R1)
3. **`/invoices` cannot be removed from the Dashboard.** The Dashboard has a full **Invoices tab** — a sortable/paginated/searchable/bulk-editable/exportable invoice table — that genuinely needs every raw invoice record. (Dashboard audit, §1)
4. **`/companies` and `/contacts` are not "count only" on the Dashboard.** Their raw `createdAt` values feed month-over-month trend arrows, so a plain `countDocuments` is insufficient to reproduce current UI. (§1, §8)
5. **Insights has no named date presets** ("This Month/Quarter/Year"). It has a single custom start/end date picker (two `<input type=date>`), defaulting to "all time" (empty). (§8)
6. Insights' month-bucketed charts bucket by **`.getMonth()` only, ignoring the year** — all years collapse into 12 buckets. This is current behavior that must be preserved (or explicitly changed with sign-off). (§8, §9-R4)

---

## 1. Dashboard audit table

Source fetch: `Dashboard.jsx:1408` (`Promise.allSettled`, failures fall back to `{ data: [] }`).

| Endpoint | Consuming widgets (file:line) | Class | Keep raw fetch? | Move to stats API? |
|----------|-------------------------------|-------|-----------------|--------------------|
| `/companies` | `setTotalClients(length)` `:1431`; `companiesTrend = getMonthOverMonthChange(companies,"createdAt")` `:2238` → "Total Companies" KPI card | **A + B** | **Yes** (trend needs all `createdAt`) — or move trend to API | Count ✅; MoM trend ✅ if API returns this/last-month counts |
| `/contacts` | `setTotalContacts(length)` `:1432`; `crmHealthMetrics` engagement (contacts attached to deals) `:791`; `contactsTrend` `:2239` | **A + B + C** | **Yes** (engagement needs contact `_id`s; trend needs `createdAt`) | Count ✅; engagement % and trend ✅ if aggregated |
| `/deals/dashboard-deals` | `activeDeals` `:1433`; `averageDealSize` `:1447`; `summaryStats` `:1038`; `overviewKpis` `:1108`; `quarterlyEarnings` `:1131`; `recentDealsWidget` `:1166`; `pipelineSnapshot` `:829`; `pipelineTrendData` `:865`; `crmHealthMetrics` deal activity `:804`; `totalInvoicesCard` (deal→company join) `:1203` | **A + B + C + D** | **Yes — required** | Counts/KPIs ✅; charts need rows (keep) |
| `/tasks` | `totalTasks(length)` `:1440`; pending `.slice(0,3)` `:1437`; `allTasks` → `crmHealthMetrics` task completion `:796`; pending-task count + trend `:2237,2241` | **A + B + D** | **Yes** (recent list + completion % need rows) | Count ✅; completion % ✅ if aggregated |
| `/invoices` | `invoiceStats` `:962,1448`; `invoiceKpiTrends` `:1180`; `overviewKpis` `:1108`; `summaryStats` revenue `:1044`; `quarterlyEarnings` `:1131`; `totalInvoicesCard` top-client+sparkline `:1198`; `invoicePerformanceData` `:1267`; `monthlySalesRevenueData` `:1295`; `draftInvoices` `:905`; **full Invoices-tab table** (sort/paginate/search/bulk/export) `:408,446,1490` | **B + C + D** | **Yes — required** (Invoices tab needs every record) | KPIs ✅; charts stay client-side unless aggregated; table keeps raw |
| `/meetings/dashboard` | `totalMeetings(length)` `:1444`; `.slice(0,3)` `:1443`; `allMeetings` → `crmHealthMetrics` meeting completion `:811`; "Meetings Today" + trend `:2240` | **A + B + D** | **Yes** (recent list + completion % need rows) | Count ✅; completion %/today ✅ if aggregated |

### Dashboard "Maybe" resolutions (A vs B per request)
- `/companies` → **(B) move count + MoM trend to backend.** No widget renders a company *record* on the Dashboard. Safe to drop the raw array once the stats API returns `{ total, thisMonth, lastMonth }`.
- `/contacts` → **(A) raw records still required** for `crmHealthMetrics` engagement (needs the set of contact `_id`s that appear on deals). Count + trend can move to backend; engagement % should also move to backend to fully drop the array. Until engagement is aggregated, keep the fetch.
- `/deals/dashboard-deals` → **(A) raw records required.** Too many charts (pipeline trend, recent deals, quarterly earnings, top-client join) depend on per-deal `amount/status/createdAt/updatedAt/company/contact`.
- `/tasks` → **(A) raw records required** for the recent-pending list and completion %. Only the plain count is pure-B.
- `/invoices` → **(A) raw records required** for the Invoices-tab table. This is the strongest "keep". KPIs/charts are B/C but the table is D.
- `/meetings/dashboard` → **(A) raw records required** for recent list + completion %. Plain count is pure-B.

**Net Dashboard conclusion:** Only `/companies` is a clean candidate for full removal (after the stats API covers its count + trend). Every other endpoint must stay because a chart or table consumes raw rows — but the **KPI counts/sums** can still move server-side to shrink payloads and speed first paint, with raw fetches deferred/kept only for the widgets that need them (e.g. defer the full `/invoices` download to when the Invoices tab is opened).

---

## 2. Insights audit table

Source fetch: `Insights.jsx:453` (`Promise.all` — any rejection except meetings/kanban fails the whole page). 8 tabs: Overview, Contacts, Companies, Deals, Vendors, Purchase Orders, Purchases, Invoices (`:389–439`).

| Endpoint | Representative consumers | Class | Future report field(s) | Keep raw? |
|----------|--------------------------|-------|------------------------|-----------|
| `/contacts` | `contactStatusData` by `stageStatus` `:739`; monthlyTrends count `:626`; "New This Month" KPI | A+C | `summary.totalContacts`, `contactStatusBreakdown[]`, `contactsByMonth[]` | Only if a widget lists contact rows (none core) |
| `/companies` | monthlyTrends `:630`; top-revenue/pipeline-contribution company *names* (join) `:3010,3028`; industries `:2911` | A+C+E | `summary.totalCompanies`, `companiesByMonth[]`, `topCompanies[]`, `companyIndustryBreakdown[]` | **Yes** — needed as name lookup for joins |
| `/deals` | winRate/avgDealSize/pipeline `:1633`; `salesPerformanceData` `:1680`; `dealStatusChartData` `:3615`; funnel `:3662`; user performance `:3574`; revenue trend `:3705`; velocity/pipeline-by-company `:2960` | A+B+C | `summary.totalDeals/wonDeals/lostDeals/winRate/avgDealSize/totalDealValue`, `dealsByStage[]`, `dealsByMonth[]`, `pipelineByCompany[]`, `dealFunnel[]` | Charts need rows unless each is aggregated |
| `/tasks` | `businessActivity` feed (completed) `:1197`; task KPIs | A+D | `summary.totalTasks`, `tasksByStatus[]` | **Yes** for activity feed (or a recent-activity endpoint) |
| `/vendors` | monthlyTrends `:638`; vendor spend/top vendors `:4235`; counts | A+B+C | `summary.totalVendors`, `vendorsByMonth[]`, `topVendors[]` | Only if vendor rows are listed |
| `/purchase-orders` | `poStatusData` `:770`; `vendorSpends` daily `:722`; PO value trend `:4863` | A+B+C | `poByStatus[]`, `vendorSpendByDay[]`/`poValueByMonth[]`, `summary.totalPOValue` | Charts need rows unless aggregated |
| `/purchases` | `purchaseStatusData` `:798`; `purchases` daily spend `:715`; purchase value trend `:5531`; `summary.expenses` | A+B+C | `summary.expenses/totalPurchases`, `purchasesByStatus[]`, `purchaseByDay[]`/`purchaseByMonth[]` | Charts need rows unless aggregated |
| `/invoices` | revenue/collected/outstanding/collectionRate `:1642`; `revenueCollectionsData` `:1662`; `invoiceStatusData` `:822`; billing trend `:6335`; top-revenue join `:2987`; daily revenue `:708` | B+C | `summary.revenue/collected/outstanding/collectionRate/totalInvoices`, `revenueByMonth[]`, `invoicesByStatus[]`, `billingTrend[]`, `topCustomers[]`, `revenueByDay[]` | Charts need rows unless aggregated |
| `/meetings` | `businessActivity` feed `:1213`; counts | A+D | `summary.totalMeetings`, `meetingsByStatus[]` | **Yes** for activity feed |
| `/kanban` | live stage names for deal breakdowns `:479,491` | **E** | *(not aggregated)* — **keep as direct fetch** | **Yes — config, small** |

### Insights chart that genuinely requires raw records
- **`businessActivity`** (`:1180`) — the "Recent Activity" feed merges the 20 latest events across deals/tasks/meetings/invoices (needs `title`, `status`, `updatedAt`, `invoiceNumber`, `amount`). Either keep limited raw fetches or add a dedicated `/insights/activity?limit=20` endpoint. **Not** reproducible from grouped aggregates.

### Current client calculation → future report field (only metrics the UI actually shows)
| Current calculation (file:line) | Future report field |
|---|---|
| `totalRevenue = Σ invoice.amount` (all statuses) `:1643` | `summary.revenue` |
| `collected = Σ amount where status==="Paid"` `:1644` | `summary.collected` |
| `outstanding = totalRevenue − collected` `:1647` | `summary.outstanding` |
| `collectionRate = collected/totalRevenue` `:1648` | `summary.collectionRate` |
| `Σ purchase.totalAmount` `:720,5531` | `summary.expenses` / `purchaseByMonth[]` |
| `Σ purchaseOrder.totalAmount` `:727` | `vendorSpendByDay[]` / `summary.totalPOValue` |
| monthly invoiced/collected `:1662` | `revenueByMonth[]` (invoiced, collected, outstanding) |
| winRate / avgDealSize / stage counts `:1635–1655` | `summary.winRate/avgDealSize`, `dealsByStage[]` |
| `revenueByCompanyId` (Won deals + invoices) `:2980` | `topCustomers[]` |
| `pipelineByCompanyId` (open vs won) `:2997` | `pipelineByCompany[]` |
| status distributions (contact/po/purchase/invoice) `:739–850` | `*ByStatus[]` arrays |

> **Do not invent metrics.** Every field above maps to a widget already rendered. Anything not in a current widget is out of scope for Phase 4.

---

## 3. Exact `calculateInvoiceStats` behavior (Dashboard, `:962`)

```js
const calculateInvoiceStats = (invoices) => {
  const stats = { delivered: 0, sent: 0, accepted: 0, due: 0, total: 0 };
  const today = new Date();
  invoices?.forEach((invoice) => {
    const amount = invoice.amount || 0;
    const status = invoice.status?.toLowerCase();
    if (status === "delivered") stats.delivered += amount;
    if (status === "sent")      stats.sent      += amount;
    if (status === "accepted")  stats.accepted  += amount;
    if (status !== "accepted" && invoice.dueDate && new Date(invoice.dueDate) < today)
      stats.due += amount;
  });
  stats.total = stats.delivered + stats.sent + stats.accepted;
  return stats;
};
```

**Exact semantics (Dashboard):**
- Sums are over `invoice.amount` (default 0), **bucketed by lowercased `status` string**. No `payments[]` involvement whatsoever.
- `delivered` = Σ amount where status==="delivered"
- `sent` = Σ amount where status==="sent"
- `accepted` = Σ amount where status==="accepted"
- `due` = Σ amount where status !== "accepted" **AND** `dueDate` exists **AND** `new Date(dueDate) < now` (overlaps delivered/sent/draft/etc.; overdue is NOT mutually exclusive from the status buckets)
- `total` = delivered + sent + accepted **(excludes `draft` and any other status; `due` is not part of total)**

**KPI card mapping** (`:1521–1524`):
- "Total Invoices Issued" = `invoiceStats.total`
- "Paid Invoices" = `invoiceStats.accepted`
- "Pending Invoices" = `invoiceStats.sent`
- "Due Invoices" = `invoiceStats.due`

**Related Dashboard invoice logic (different, overlapping definitions — must preserve each):**
- `invoiceKpiTrends` (`:1180`, trend arrows only): paid = status `paid` **OR** `accepted`; pending = status `sent` **OR** `pending`; due = NOT(`paid`/`accepted`) AND dueDate<now. (Note: broader than `calculateInvoiceStats`, which only uses `accepted`/`sent`.)
- `overviewKpis` (`:1108`): totalIncome = Σ all amounts; revenueGenerated = Σ where status `paid`/`accepted`.
- `summaryStats` (`:1044`): totalPaid = Σ where status `paid`/`accepted`; totalUnpaid = totalIssued − totalPaid.
- `totalInvoicesCard`/`invoicePerformanceData`/`monthlySalesRevenueData` (`:1198,1267,1295`): "paid" = status `accepted` only; month bucket on `inv.date || inv.createdAt`.
- `draftInvoices` (`:905`): status `draft`.

---

## 4. Exact invoice total / paid / pending / due / remaining / zero / void / partial definitions

### Dashboard (status-string based; see §3)
| Concept | Definition in code | Source |
|---|---|---|
| **total** | delivered+sent+accepted amount | `:979` |
| **paid** | Σ amount where status==="accepted" (card); some memos also accept "paid" | `:972,1047,1110` |
| **pending** | Σ amount where status==="sent" (card); some memos also accept "pending" | `:971,1182` |
| **due / overdue** | Σ amount where status≠"accepted" AND dueDate<now | `:974` |
| **remaining amount** | **Does not exist.** No per-invoice remaining is computed. | — |
| **zero-amount** | `amount || 0`; a 0 invoice contributes 0, still counted in `.length`/status buckets | `:967` |
| **void/cancelled** | **No handling.** `draft` is simply excluded from `total` (it's neither delivered/sent/accepted). No `cancelled`/`void` branch exists on Dashboard. | §3 |
| **partially paid** | **No concept.** Status is all-or-nothing by string. | — |

### Insights (also status-string based, DIFFERENT vocabulary)
| Concept | Definition in code | Source |
|---|---|---|
| **revenue / total** | Σ `invoice.amount` over ALL filtered invoices (no status filter) | `:708,1643` |
| **collected / paid** | Σ amount where `status === "Paid"` (exact case, not lowercased) | `:1644,1668` |
| **outstanding** | revenue − collected | `:1647` |
| **overdue** | status distribution bucket `status === "Overdue"`; activity feed computes `status !== "Paid" && dueDate < now` | `:839,1229` |
| **status buckets (chart)** | Draft / Sent / Paid / Overdue / Cancelled | `:822–850` |
| **remaining / partial** | **No concept.** | — |
| **zero-amount** | `amount || 0`; counted in `.length` | `:869` |
| **cancelled** | counted only in the status-distribution chart; excluded from no sum explicitly (it still lands in `revenue` because revenue sums all) | `:845` |

**Critical:** Dashboard "paid"=`accepted`, Insights "paid"=`Paid`. Dashboard has no `Overdue`/`Cancelled` statuses; Insights does. **The backend must reproduce each page's own definition independently — do not unify.** (Risk §9-R1.)

---

## 5. Chart-by-chart decision — keep client-side vs move to backend

### Dashboard
| Widget | Decision |
|---|---|
| CRM KPI cards (Companies/Contacts/Meetings-today/Pending-tasks) | **Backend** counts + this/last-month for trend |
| Invoice KPI cards (total/paid/pending/due) | **Backend** (status-bucketed sums) |
| `crmHealthMetrics` (engagement/completion %) | **Backend** aggregate (needs cross-entity ratios) to drop contacts/tasks/meetings arrays; else keep client-side |
| `pipelineSnapshot`, `pipelineTrendData`, `recentDealsWidget`, `quarterlyEarnings`, `overviewKpis` | **Keep client-side** (need raw deal rows) — or deep aggregation later; low priority |
| `totalInvoicesCard` top-client + sparkline | **Keep client-side** (needs invoice→deal→company join) |
| `invoicePerformanceData`, `monthlySalesRevenueData` | **Keep client-side** short-term (chart); candidate for `revenueByMonth` aggregation |
| **Invoices tab table** | **Keep raw** (D) — do not aggregate; consider deferring the fetch to tab open |

### Insights
| Widget | Decision |
|---|---|
| Overview KPIs (revenue/collected/outstanding/collectionRate/winRate/avgDealSize) | **Backend** `summary` |
| Status distributions (contact/po/purchase/invoice) | **Backend** `*ByStatus[]` |
| `revenueCollectionsData`, billing trend, deal/vendor/PO/purchase value trends | **Backend** `*ByMonth[]` (⚠ preserve month-only bucketing, §8) |
| `dailyTrends` (Revenue vs Spends, scrollable) | **Backend** `*ByDay[]` with range, OR keep client-side if date range stays client-side |
| `topCustomers` / `pipelineByCompany` / velocity / industries | **Backend** aggregations with `$lookup` for names |
| `businessActivity` recent feed | **Keep raw / dedicated `/insights/activity` endpoint** (D) |
| `/kanban` stage config | **Keep direct fetch** (E) |

---

## 6. Proposed `/dashboard/stats` response fields (derived strictly from §1/§3)

> Field names mirror current UI meanings. `*ThisMonth/*LastMonth` included only where a trend arrow currently exists.

```jsonc
{
  "totalCompanies": 0, "companiesThisMonth": 0, "companiesLastMonth": 0,
  "totalContacts": 0,  "contactsThisMonth": 0,  "contactsLastMonth": 0,
  "totalDeals": 0, "activeDeals": 0,            // activeDeals = status "Open"
  "averageDealSize": 0,
  "totalTasks": 0, "pendingTasks": 0, "pendingTasksThisMonth": 0, "pendingTasksLastMonth": 0,
  "totalMeetings": 0, "meetingsToday": 0, "meetingsThisMonth": 0, "meetingsLastMonth": 0,
  "invoiceStats": {                             // EXACT Dashboard semantics (§3)
    "delivered": 0, "sent": 0, "accepted": 0, "due": 0, "total": 0
  },
  "crmHealth": {                                // optional (only if moving crmHealthMetrics server-side)
    "contactEngagementPct": 0, "taskCompletionPct": 0,
    "dealActivityPct": 0, "meetingCompletionPct": 0
  }
}
```
**Note:** Charts (pipeline, revenue sparklines, Invoices table) are NOT in this payload — they keep their raw fetches per §1/§5.

## 7. Proposed `/insights/report` response fields (derived strictly from §2/§4)

```jsonc
{
  "summary": {
    "totalContacts": 0, "totalCompanies": 0,
    "totalDeals": 0, "wonDeals": 0, "lostDeals": 0, "winRate": 0,
    "totalDealValue": 0, "avgDealSize": 0,
    "totalInvoices": 0, "revenue": 0, "collected": 0, "outstanding": 0, "collectionRate": 0,
    "totalPurchases": 0, "expenses": 0, "totalPOValue": 0,
    "totalVendors": 0, "totalTasks": 0, "totalMeetings": 0
  },
  "revenueByMonth":    [{ "month": "Jan", "invoiced": 0, "collected": 0, "outstanding": 0 }],
  "purchaseByMonth":   [{ "month": "Jan", "value": 0 }],
  "dealsByMonth":      [{ "month": "Jan", "count": 0, "value": 0 }],
  "dealsByStage":      [{ "stage": "Open", "count": 0, "value": 0 }],   // stages labeled via /kanban
  "invoicesByStatus":  [{ "name": "Paid", "value": 0 }],               // Draft/Sent/Paid/Overdue/Cancelled
  "contactsByStatus":  [{ "name": "New", "value": 0 }],                // stageStatus buckets
  "poByStatus":        [{ "name": "Pending", "value": 0 }],
  "purchasesByStatus": [{ "name": "Draft", "value": 0 }],
  "topCustomers":      [{ "company": "...", "revenue": 0 }],
  "pipelineByCompany": [{ "company": "...", "open": 0, "won": 0, "total": 0 }]
  // dailyTrends / businessActivity: separate concern (keep raw or dedicated endpoints)
}
```
**Exact field set must be frozen against the live UI before Phase 4** — the arrays above cover every widget found, but confirm no tab was missed in the 7,099-line file (see §9-R5).

---

## 8. Date / timezone behavior that MUST be preserved

| Aspect | Current behavior | Source |
|---|---|---|
| **Dashboard date field (invoices)** | `inv.date || inv.createdAt` for month charts | `:1238,1276,1312` |
| **Dashboard date field (deals)** | `createdAt` (and `updatedAt` for "won/closed" timing) | `:879,1114,1146` |
| **Dashboard MoM** | compares `getMonth()/getFullYear()` of this vs last month, **browser-local time** | `:1074` |
| **Insights date filter fields** | contacts/companies/deals/vendors → `createdAt`; POs → `orderDate\|\|createdAt`; purchases → `purchaseDate\|\|createdAt`; invoices → `date\|\|createdAt` | `:514–547` |
| **Insights presets** | **None.** Custom start/end only (`<input type=date>`), default empty = "all time" | `:344,6982,6996` |
| **Insights range bounds** | `new Date(startDate)` .. `new Date(endDate)`, inclusive both ends (`>=`/`<=`); day charts `setHours(0,0,0,0)` | `:510,680` |
| **Insights month charts** | bucket by **`getMonth()` ONLY (year ignored)** — all years merge into 12 buckets | `:625,1662` |
| **Insights day charts** | bucket by `toDateString()` (browser-local day) | `:706,711` |
| **Timezone** | Everything uses `new Date(...)` → **browser local time**, no explicit IANA tz | throughout |

**Preservation requirements for backend:**
- Use the **same date field per entity** (esp. invoices = `date` with `createdAt` fallback; purchases = `purchaseDate`; POs = `orderDate`).
- Match **inclusive** range semantics. The frontend's `new Date("YYYY-MM-DD")` parses as **UTC midnight**, so an aggregation using a fixed server tz can shift day/month boundaries. Decide and document one tz (likely `Asia/Kolkata`) and make the frontend send explicit ISO bounds, or reproduce the current (arguably buggy) UTC-midnight behavior to keep numbers identical. **This is the #1 parity-risk area.**
- If `*ByMonth` moves server-side, decide whether to keep the **year-agnostic** bucketing (current) or fix it to year+month — a fix will change displayed numbers and needs product sign-off (§9-R4).

---

## 9. Ambiguities / risks to resolve BEFORE coding

- **R1 — Divergent invoice status vocabularies.** Dashboard: `delivered/sent/accepted`, "paid"=`accepted`. Insights: `Draft/Sent/Paid/Overdue/Cancelled`, "paid"=`Paid`. **Action:** confirm the real set of `status` values stored in the DB and keep each page's mapping separate. Do NOT unify. (The backend `Invoice.status` is a free `String`, `models/Invoice.js:26`, so data may contain any of these.)
- **R2 — No `payments[]` usage on these pages.** The plan's paid/remaining/overdue aggregation (from `getCompanyInvoiceSummary`) is a *different* subsystem. **Action:** Phase 2 must reproduce the status-string math (§3), not the payments math — unless product explicitly wants to switch the Dashboard to payment-based accuracy (a behavior change, not an optimization).
- **R3 — Dashboard Invoices tab needs all rows.** **Action:** do not drop `/invoices`; optionally defer its fetch to when the Invoices tab opens. Confirm export/bulk features stay intact.
- **R4 — Year-agnostic month buckets in Insights.** Current `*ByMonth` merges years. **Action:** confirm whether to preserve (parity) or fix (correctness) — affects every monthly chart.
- **R5 — Insights is 7,099 lines / 8 tabs.** This audit sampled every tab's core computation but not every sub-widget. **Action:** before freezing the `/insights/report` schema (Phase 4), do a final field-by-field sweep of each tab's JSX to ensure no rendered metric is missing from §7.
- **R6 — `ownOnly` must be reproduced per entity.** Each aggregation must apply the same own-only narrowing as its source list controller, or an own-only user will see inflated org-wide numbers. Definitions differ per entity (see §10). **Action:** replicate exactly; add a test for an own-only user (parity §Phase 8).
- **R7 — Cross-entity joins.** `topCustomers`/`pipelineByCompany` rely on `invoice.deal.company` and `deal.company` being populated; invoices have no direct company ref (`:2988`). **Action:** backend aggregation needs `$lookup` deal→company; verify ref integrity.
- **R8 — Partial failure semantics.** Dashboard uses `allSettled` (per-module 403 tolerated); Insights uses `all` (one failure blanks the page). **Action:** the new single-call endpoints must degrade per-module like `allSettled` (a module the org lacks returns 0/empty, never a whole-page 500).
- **R9 — Zero/void invoices.** Neither page special-cases `cancelled`/`void`/zero-amount beyond status buckets. **Action:** confirm with product whether cancelled invoices should be excluded from `revenue` (Insights currently includes them in `revenue` since it sums all statuses).

---

## 10. SECURITY audit — scoping/permissions per source API (do NOT bypass)

All list routes share the chain `requireAuth (auth + userSync) → subscriptionGate → restrictByPlan(resource, action) → checkPermission(resource, level)`. Every list controller scopes queries with `{ organization: req.user.organization }`. `checkPermission` sets `req.ownOnly=true` when the user's permission for that resource is `own-only` (`middlewares/checkPermission.js:28`).

| Endpoint | Plan resource | Permission resource (case as written) | `req.ownOnly` applied? | Org scope |
|---|---|---|---|---|
| `/companies` (`CompanyRoutes.js:28`) | `companies` | `Companies` | ✅ `{user\|createdBy\|owner}===me` (`companyController.js:48`) | ✅ |
| `/contacts` (`contactRoutes.js`) | `contacts` | `contacts` | ✅ (`contactController`) | ✅ |
| `/deals` & `/deals/dashboard-deals` (`dealRoutes.js:14`) | `deals` | `deals` | ✅ (`dealController`) | ✅ |
| `/tasks` & `/tasks/dashboard-tasks` (`taskRoutes.js:14`) | `tasks` | `tasks` | ✅ (`taskController`) | ✅ |
| `/vendors` (`vendorRoutes.js:24`) | `vendors` | `vendors` | ✅ `{...}===me` (`vendorController.js:33`) | ✅ |
| `/purchase-orders` (`purchaseOrderRoutes.js:22`) | `purchases` | `purchase-orders` | ✅ (`purchaseOrderController`) | ✅ |
| `/purchases` (`purchase.js:22`) | `purchases` | `purchases` | ✅ (`purchaseController`) | ✅ |
| `/invoices` (`invoiceRoutes.js:25`) | `invoices` | `invoices` | ✅ `{user===me}∪deal∈ownedDeals` (`invoiceController.js:421`) | ✅ |
| `/meetings` & `/meetings/dashboard` (`meetings.js:14,24`) | `meetings` | `meetings` | ✅ (`meetingController`) | ✅ |
| `/kanban` (`kanbanBoard.js:20`) | — | (no restrictByPlan/checkPermission on GET) | n/a (config) | ✅ org-scoped |

**New-endpoint security requirements (must reuse, never bypass):**
1. `requireAuth` + `subscriptionGate` on every new route.
2. For each per-module sub-count/aggregation, apply the **same `restrictByPlan(resource, action)` + `checkPermission(resource, level)`** as its source — or compute per-module and return 0/empty for modules the user/plan lacks (degrade like `allSettled`, R8).
3. Scope **every** `$match`/`countDocuments` with `organization: req.user.organization`.
4. Replicate `req.ownOnly` narrowing **per entity** with that entity's exact own-filter (R6). Note the permission-resource **casing differs** (`Companies` vs `contacts`) — copy it exactly.
5. No cross-org `$lookup` without re-scoping the joined collection by `organization`.

---

## Appendix — endpoint differences between the two pages
- Dashboard deals: `/deals/dashboard-deals`; Insights deals: `/deals`.
- Dashboard meetings: `/meetings/dashboard`; Insights meetings: `/meetings` (returns `{meetings:[]}` or `[]`).
- Dashboard tasks & Insights tasks: both `/tasks`.
- Insights additionally pulls `/vendors`, `/purchase-orders`, `/purchases`, `/kanban`; Dashboard does not.

*End of Phase 1 audit. No files were modified; no endpoints created. Phase 2 to follow as a separate change after sign-off on §9 risks.*
