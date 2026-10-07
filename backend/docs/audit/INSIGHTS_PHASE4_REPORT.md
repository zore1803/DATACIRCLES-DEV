# Phase 4 — Insights Report API (backend only, additive)

**Date:** 2026-10-07
**Status:** Implemented + static-validated. **Frontend untouched. Old requests untouched. Not consumed yet.** Phase 5 only after parity verification.

---

## 1. Files created / changed
| File | Change |
|---|---|
| `backend/controllers/insightsController.js` | **New** — `getReport` aggregation. |
| `backend/routes/insightsRoutes.js` | **New** — `GET /report`. |
| `backend/server.js` | Mounted `app.use('/api/insights', insightsRoutes)` (2 lines). |

Not touched: `frontend/src/pages/Insights.jsx`, all shared list APIs, any percentage/trend logic.

## 2. New endpoint
```
GET /api/insights/report?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD[&tz=IANA]
Auth: requireAuth + subscriptionGate; per-module plan/permission/ownOnly enforced inside the controller.
```
- `startDate`/`endDate` optional but must be **both or neither** (matches Insights, which only filters when both are set). Invalid/!parseable → **400**. `start > end` → **400**.
- `tz`: optional IANA zone for calendar-month bucketing (see §7). Defaults to `UTC`.

## 3. Response shape
```jsonc
{
  "summary": {
    "totalContacts": 0, "totalCompanies": 0, "totalDeals": 0, "totalVendors": 0,
    "totalDealValue": 0, "totalPurchasesValue": 0, "totalInvoices": 0, "totalInvoiceValue": 0,
    "revenue": 0, "collected": 0, "outstanding": 0, "collectionRate": 0,
    "wonDeals": 0, "lostDeals": 0, "winRate": 0, "avgDealSize": 0
  },
  "revenueByMonth":  [{ "month": "Jan", "invoiced": 0, "collected": 0, "outstanding": 0 }, … 12],
  "dealsByMonth":    [{ "month": "Jan", "count": 0, "value": 0 }, … 12],
  "purchaseByMonth": [{ "month": "Jan", "count": 0, "value": 0 }, … 12],
  "topCustomers":    [{ "companyId": "…", "name": "…", "revenue": 0 }],  // top 5
  "topVendors":      [{ "vendorId": "…", "name": "…", "totalPaid": 0, "transactions": 0 }], // top 4
  "pipeline":        [{ "stage": "Open", "count": 0, "value": 0 }]       // by deal.status
}
```
**Deviations from the template shape (deliberate — I did NOT invent metrics):**
- `expenses`, `profit`, `salesByMonth` are **omitted** — no such calculation exists in Insights.jsx. The closest real concept to "expenses" is `summary.totalPurchasesValue` (Σ purchase.totalAmount); there is no profit metric anywhere.

## 4. Existing Insights calculations inspected → report field (source of truth = Insights.jsx)
| Report field | Insights.jsx source | Exact rule reproduced |
|---|---|---|
| `summary.totalContacts/Companies/Deals/Vendors` | StatCards `:1336-1366` | `filtered*.length` (count in range) |
| `summary.totalDealValue` | `:1368` | Σ `deal.amount` (range) |
| `summary.totalPurchasesValue` | `:1382` | Σ `purchase.totalAmount` (range) |
| `summary.totalInvoices` | `:1394` | count invoices (range) |
| `summary.totalInvoiceValue` / `revenue` | `:1402`,`:1643` | Σ `invoice.amount`, **all statuses** |
| `summary.collected` | `:1644` | Σ `invoice.amount` where `status === "Paid"` |
| `summary.outstanding` | `:1647` | revenue − collected |
| `summary.collectionRate` | `:1648` | `round(collected/revenue*100)` or 0 |
| `summary.wonDeals/lostDeals/winRate` | `:1635-1638` | Won/(Won+Lost) by `deal.status` exact strings |
| `summary.avgDealSize` | `:1640` | totalDealValue/totalDeals or 0 |
| `revenueByMonth` | `revenueCollectionsData :1662` | 12 months (year-merged), invoiced/collected(Paid)/outstanding |
| `dealsByMonth` | `monthlyTrends.deals :634` (+value) | count per calendar month (+amount) |
| `purchaseByMonth` | `monthlyTrends.purchases :646` (+value) | count per calendar month (+totalAmount) |
| `topCustomers` | `revenueByCompanyId :2980` | Σ Won deal.amount + Σ invoice.amount (via deal.company), top 5 |
| `topVendors` | `topVendorsBySpend :4260` | Σ `grandTotal` by vendor, top 4 |
| `pipeline` | `stageCounts :1650` (+value) | count per `deal.status` |

## 5. Percentage / trend calculations — found and CONFIRMED UNCHANGED
Insights' own trend helper is `monthOverMonthChange` ([Insights.jsx:1314](frontend/src/pages/Insights.jsx#L1314)):
```
thisMonth    = Σ/count of items with date >= start-of-current-month (local)
beforeThisMonth = everything else (ALL prior, not just last month)
return beforeThisMonth > 0 ? round(thisMonth / beforeThisMonth * 100)
                           : (thisMonth+before > 0 ? 100 : 0)
```
- It is a **ratio of this-month to all-prior**, not a signed % change. No `Math.abs`, no up/down flag, **no "No change"/"New" wording** (StatCard renders the raw number).
- The Vendors tab has a *separate* `{ pct, isNew }` style helper (`:4204`) with "New" semantics.
- **These are entirely client-side and were NOT touched.** The report does not compute or alter any percentage/trend. It deliberately does **not** reuse the Dashboard trend helper. The neutral/"No change" wording decided for the Dashboard was **not** applied to Insights (per your instruction). Phase 5 will decide separately, after parity.

## 6. Security / organization / ownOnly
Same mechanism as the Dashboard endpoint: the controller runs the real `restrictByPlan(module,"read")` then `checkPermission(resource,"readonly")` in-process, so it can't drift from the list routes.
- **Org isolation:** every `$match`/count/`$lookup` is scoped `{ organization: req.user.organization }` (including the name-resolution `Company.find` and invoice→deal lookup inputs).
- **ownOnly (per entity, copied exactly):** companies `{user|createdBy|owner}`; contacts & deals `{user|createdBy|company∈ownedCompanyIds}`; vendors/purchases/purchase-orders `{user}`; invoices `{user | deal∈ownedDealIds}`.
- **Permission resources (exact casing/module):** contacts→`contacts`; companies→`Companies`; deals→`deals`; vendors→`vendors`; purchases→plan`purchases`/perm`purchases`; purchase-orders→plan`purchases`/perm`purchase-orders`; invoices→`invoices`.
- No generic unrestricted path; no weakening of security for degradation.

## 7. Date / timezone handling
- **Range filter** uses `new Date(startDate)`/`new Date(endDate)` — the identical instants the browser produced — with inclusive `$gte`/`$lte`. No UTC/boundary shift introduced.
- **Per-entity date field** matches Insights exactly: contacts/companies/deals/vendors → `createdAt`; invoices → `date || createdAt`; purchases → `purchaseDate || createdAt`; (POs → `orderDate || createdAt`). The `|| createdAt` fallback is reproduced with `$ifNull`.
- **Calendar-month bucketing** (year-merged, as Insights does) uses `$month` with the `tz` param. ⚠ **Parity-critical:** Insights buckets by **browser-local** `getMonth()`. The report defaults to `tz=UTC`; to match exactly, **Phase 5 must pass the browser zone** (`Intl.DateTimeFormat().resolvedOptions().timeZone`). Documented, not silently changed.

## 8. MongoDB aggregations implemented
- `organization` applied as the first `$match` stage everywhere; date filter applied early (right after `$addFields _effDate` where a fallback is needed).
- `$facet` used to compute totals + byMonth + pipeline/topVendors in a single pass per collection.
- Independent collections run in parallel via `Promise.all`.
- `$lookup` only for: invoice→deal→company (topCustomers) and vendor-name / company-name resolution — all org-scoped. No full-collection download into Node.

## 9. Validation results
- `node --check` ✅ on `insightsController.js`, `insightsRoutes.js`, `server.js`.
- Route load test ✅ — `GET /api/insights/report` is exposed under `/api/insights`.
- Auth required ✅ (`requireAuth` + `subscriptionGate` on the route).
- Invalid dates ✅ → 400 (both-or-neither, unparseable, start>end).
- Org scoping ✅ / ownOnly ✅ (per §6; same proven mechanism as Dashboard).
- Dev server **not** started.

## 10. Metrics where exact parity is UNCERTAIN (verify in Phase 5/8)
1. **Month bucketing timezone** — must pass browser `tz` in Phase 5, else months can shift ±1 vs the client near midnight/month edges. (All `*ByMonth`, `revenueByMonth`.)
2. **topCustomers** — cross-collection join (Won deals + invoices via `deal.company`). Confirm against the UI's "Top Revenue Generating Companies" for an org with both deals and invoices on the same company.
3. **Module degradation is intentionally stronger than today.** Current Insights uses `Promise.all` — one module's 403 blanks the WHOLE page. The report degrades per-module to 0/[] (Phase 1 R8). This is an improvement, but means report output can be *non-empty* where the old page showed *nothing*; account for this when comparing.
4. **Coverage is a subset.** The report covers the **Overview** analytics + pipeline + top customers/vendors only. It does NOT yet reproduce: the recent-activity feed (`businessActivity`, needs tasks/meetings), daily "Revenue vs Spends" trend, contact `stageStatus` distribution, PO/purchase status distributions, velocity/funnel/user-performance/industry charts, `vendorSpendTrendData` (6-month, `grandTotal`), `pipelineContributionData`, `revenueTrendData`. **Therefore Phase 5 must NOT remove any source fetch whose widgets aren't covered here** — only the covered Overview widgets can switch to the report.

---

### Not done (by design)
Phase 5 (frontend refactor) and Phase 8 (parity verification). No frontend change, no request removed, no index added, no cache, no dev server.
