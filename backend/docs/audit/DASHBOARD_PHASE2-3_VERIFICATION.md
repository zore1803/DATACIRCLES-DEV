# Dashboard Phases 2–3 — implementation + verification gate

**Date:** 2026-10-07
**Status:** Implemented, **awaiting runtime verification** (dev server was not started, per instructions).
**Scope:** Dashboard only. Insights (Phases 4–7) intentionally NOT started — your own order gates it behind "Dashboard verified".

---

## What changed

### Added (backend, fully additive — new endpoint, no existing route touched)
- `backend/controllers/dashboardController.js` — aggregates companies/contacts counts, this/last-month counts, and contact-engagement.
- `backend/routes/dashboardRoutes.js` — `GET /api/dashboard/stats`.
- `backend/server.js` — mounted `app.use('/api/dashboard', dashboardRoutes)` (2 lines).

### Changed (frontend)
- `frontend/src/pages/Dashboard.jsx`:
  - Added `dashboardStats` state + `momFromCounts` helper (exact copy of `getMonthOverMonthChange`'s math, from pre-counted totals).
  - `fetchData`: **removed** `API.get("/companies")` and `API.get("/contacts")`; **added** `API.get("/dashboard/stats", { params: monthBounds })` (parallel, in the same `allSettled`).
  - `totalClients`/`totalContacts` now read from `stats.companies.total` / `stats.contacts.total`.
  - CRM "Contact Engagement" health metric reads `stats.contacts.engaged / total`.
  - "Total Companies" / "Total Contacts" trend arrows read from `stats.*.thisMonth/lastMonth` via `momFromCounts`.
  - Removed the now-unused `companies` / `contacts` state arrays.

### Removed requests
- `GET /companies` (Dashboard) — was used only for count + trend.
- `GET /contacts` (Dashboard) — was used only for count + trend + engagement.

### Retained requests (deliberately — they render real UI)
- `GET /deals/dashboard-deals` — all deal charts, recent deals, pipeline, averages.
- `GET /tasks` — recent pending list + completion % + counts.
- `GET /invoices` — invoice KPIs/charts **and the full Invoices-tab table** (sortable/paginated/bulk/export).
- `GET /meetings/dashboard` — recent list + completion % + "meetings today".

---

## Endpoint contract

```
GET /api/dashboard/stats?thisMonthStart=ISO&nextMonthStart=ISO&lastMonthStart=ISO
Auth: requireAuth + subscriptionGate (per-module plan/permission/ownOnly enforced INSIDE the controller)

200:
{
  "companies": { "total": N, "thisMonth": N, "lastMonth": N },
  "contacts":  { "total": N, "thisMonth": N, "lastMonth": N, "engaged": N }
}
```
- Month boundaries are sent by the browser in **local time** (identical bucketing to the old `getMonthOverMonthChange`). No timezone change.
- A module the user/plan can't read returns **zeros for that module only** (never a whole-endpoint 403) — mirrors the old `Promise.allSettled` fallback.

---

## Security — how identical behavior is guaranteed
The controller does **not** re-implement gating. It runs the project's real `restrictByPlan("companies"|"contacts", "read")` then `checkPermission("Companies"|"contacts", "readonly")` middleware in-process (`runGate`/`resolveModuleAccess`), in the same order as the list routes. So:
- **Organization isolation:** every query is `{ organization: req.user.organization }`.
- **ownOnly:** when `checkPermission` sets `req.ownOnly`, the same own-filters the list controllers use are applied:
  - companies: `{ user | createdBy | owner } === me`
  - contacts: `{ user | createdBy | company ∈ getOwnedCompanyIds(me) } === me`
- **Engagement deal scope** reproduces the Dashboard's mixed scoping exactly: it intersects contacts with `Deal.distinct("contact", { organization, ...(role==="staff" ? {user:me} : {}) })` — the same role-based scope `/deals/dashboard-deals` uses — gated on deals read access (no access ⇒ engaged 0).

---

## RUNTIME VERIFICATION (your gate before cleanup/Insights)

### Option A — manual before/after (most reliable)
On a branch WITHOUT this change (or `git stash`), note these on the Dashboard for the **same org + same user**:
1. "Total Companies" value + its % trend arrow (↑/↓ and number)
2. "Total Contacts" value + its % trend arrow
3. CRM Health → **Contact Engagement** %
4. CRM Health **overall score** (depends on all 4 metrics)

Then on this change, confirm all four are **identical**.

### Option B — console comparison (paste in DevTools on the Dashboard page)
Uses the app's own axios instance so auth is carried. If `window.__API` isn't exposed, use the Network tab instead.
```js
// Compare old full-download counts vs new /dashboard/stats
(async () => {
  const api = (window.__API /* if exposed */) || null;
  const get = (u, cfg) => (api ? api.get(u, cfg) : fetch(u, {credentials:'include'}).then(r=>r.json()).then(data=>({data})));
  const now = new Date();
  const params = {
    thisMonthStart: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
    nextMonthStart: new Date(now.getFullYear(), now.getMonth()+1, 1).toISOString(),
    lastMonthStart: new Date(now.getFullYear(), now.getMonth()-1, 1).toISOString(),
  };
  const [companies, contacts, stats] = await Promise.all([
    get('/api/companies'), get('/api/contacts'),
    get('/api/dashboard/stats', { params }),
  ]);
  const inMonth = (arr, a, b) => arr.filter(x => { const d=new Date(x.createdAt); return d>=new Date(a)&&d<new Date(b); }).length;
  console.table({
    companiesTotal: { old: companies.data.length, new: stats.data.companies.total },
    companiesThis:  { old: inMonth(companies.data, params.thisMonthStart, params.nextMonthStart), new: stats.data.companies.thisMonth },
    companiesLast:  { old: inMonth(companies.data, params.lastMonthStart, params.thisMonthStart), new: stats.data.companies.lastMonth },
    contactsTotal:  { old: contacts.data.length, new: stats.data.contacts.total },
    contactsThis:   { old: inMonth(contacts.data, params.thisMonthStart, params.nextMonthStart), new: stats.data.contacts.thisMonth },
    contactsLast:   { old: inMonth(contacts.data, params.lastMonthStart, params.thisMonthStart), new: stats.data.contacts.lastMonth },
  });
})();
```
(Engagement parity needs the deal-join; easiest to verify via Option A.)

### Scenarios to cover
normal org · empty org · large org · a `read-write` user · an **own-only** user · a user whose plan lacks companies or contacts (expect 0, page still loads) · month-boundary (records created on the 1st) · zero values.

### If old ≠ new
**STOP. Do not change business logic.** Report the exact field + both numbers. The most likely culprit is a month-boundary/timezone edge (covered by sending local bounds) or an ownOnly edge — both are isolated to this endpoint and fully revertible (delete the 3 new backend files' mount + revert Dashboard.jsx).

---

## Indexes
No new index required for this phase: `Company` and `Contact` already have `{ organization: 1, createdAt: -1 }` (models/Company.js:101, models/Contact.js:111); the engagement `Deal.distinct` uses `{ organization: 1, user: 1 }` (models/Deal.js:52).

## Not done yet (by design)
Insights backend `/api/insights/report` (Phase 4), Insights frontend (Phase 5), Insights indexes (Phase 7). These start **after** you verify Dashboard numbers match.
