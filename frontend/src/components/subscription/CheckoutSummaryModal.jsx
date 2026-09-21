// components/subscription/CheckoutSummaryModal.jsx
import React from "react";
import { X, ShoppingCart, AlertTriangle, CheckCircle2 } from "lucide-react";
import OrderSummary from "./OrderSummary";
import TransitionConfirmationCard from "./TransitionConfirmationCard";

// Coupons are applied/removed on the plans page (outside checkout) so the
// customer sees the discount ripple across every plan/add-on card before
// they even open checkout. This modal only DISPLAYS the already-applied
// coupon's effect — no apply/remove controls here.
const CheckoutSummaryModal = ({
  checkoutData, onConfirm, onCancel, onCarryForwardChange, onDowngradeResolutionChange, processing,
  transitionAddonChoices = {}, onTransitionAddonChoiceChange,
}) => {
  if (!checkoutData) return null;

  const {
    plan, selectedAddonsList, basePrice, addonsTotal, total, billingCycle,
    type, addonChanges, currentTotal, newTotal,
    compatibleCarryForward = [], incompatibleDropped = [],
    // addon_removal fields
    displayName, quantity: removalQty, pricePerUnit,
    newRecurringTotal, effectiveAt,
    // plan_upgrade / plan_downgrade shared fields
    proratedAmount, incompatibleAddons = [], carriedForwardAddons = [], newAddonsList = [],
    maxCarryForward = {},
    // Discount already applied to proratedAmount by the backend; shown here so
    // the customer can see WHY the charge is lower (proratedAmount is
    // post-discount). Split by source — each field means exactly what its
    // name says (a real bug, found and fixed: this used to be one
    // referral-only-named field silently containing a coupon+referral
    // combined total for add-on purchases).
    couponDiscountApplied = 0,
    referralDiscountApplied = 0,
    totalDiscountApplied = 0,
    // plan_downgrade fields
    newBasePrice, periodEnd,
    // Downgrade compatibility checks (validateDowngrade contract) — generic
    // {type, status, ...} list. This component renders purely by `status`,
    // never by `type` — new validators (storage, pipelines, ...) need zero
    // changes here to show up correctly.
    downgradeChecks = [], hasHardBlocker = false, resolutionAddons = {}, resolutionAddonCatalog = {},
    // coupon (new-subscription checkout only)
    appliedCoupon,
    // BILLING_UX_SPEC.md §0/Option A — backend-computed preview for the
    // new-subscription branch (signup + trial→paid). null if the preview
    // call failed, in which case this branch falls back to the legacy
    // client-computed display below rather than showing nothing.
    pricingBreakdown,
    // cycle_transition fields — Phase 3 (docs/audit/PHASE3_MONTHLY_TO_ANNUAL_PRORATION.md).
    // ALL numbers here come from previewMonthlyToAnnualTransition() — nothing
    // is computed client-side, per the same Single Source of Truth rule
    // every other branch in this modal already follows.
    fromPlanId, fromPricePerUser, toPlanId, toPricePerUser,
    newAnnualValue, unusedMonthlyValue, monthsCompleted, monthsIntoWindow,
    windowStart, windowEnd, supersedesScheduledChange, pendingCancellationWillClear,
    // Task 2 — existing monthly add-ons offered a per-add-on keep/convert
    // choice at this same checkout. addonConversions = 'yearly'-chosen items
    // (itemized, real backend-computed prices); incompatibleAddons = target
    // plan doesn't support at all (informational, access continues).
    addonConversions = [], incompatibleAddons: transitionIncompatibleAddons = [], choosableAddons = [], totalAddonConversionAmount = 0, grandTotal,
    // Task 4 — real backend-computed preview for a NEW single-addon purchase
    // (null for removals/mixed selections, or if the preview call failed).
    addonPurchasePreview,
  } = checkoutData;

  const prettyKey = (k) => (k || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const cycleLabel = billingCycle === "yearly" ? "yr" : "mo";
  const isAddonChange = type === "addon_change";
  const isAddonRemoval = type === "addon_removal";
  const isPlanUpgrade = type === "plan_upgrade";
  const isPlanDowngrade = type === "plan_downgrade";
  const isCycleTransition = type === "cycle_transition";
  const isConfirmReactivate = type === "confirm_reactivate_and_change_plan";
  const isNewSubscription = !isAddonChange && !isAddonRemoval && !isPlanUpgrade && !isPlanDowngrade && !isCycleTransition && !isConfirmReactivate;
  // For addon_change, use newTotal; for new subs/upgrades, use total
  const rawTotal = isAddonChange ? (newTotal ?? currentTotal + (addonsTotal || 0)) : total;
  // Coupon discounts the base rupee amount BEFORE GST, mirroring the backend.
  const displayTotal = isNewSubscription && appliedCoupon ? Math.max(0, rawTotal - appliedCoupon.discountAmount) : rawTotal;

  // Downgrade recurring total with GST (computed before render to avoid IIFE in JSX)
  const downgradeRecurringBase = newRecurringTotal ?? newBasePrice ?? 0;
  const downgradeRecurringGST = Math.round(downgradeRecurringBase * 0.18);
  const downgradeRecurringWithGST = downgradeRecurringBase + downgradeRecurringGST;

  const formatDate = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    if (dt.getFullYear() < 2020) return '—';
    return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatPrice = (price) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 0,
    }).format(price);

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-[1000004]">
      {/* Found via live QA: this modal had no scroll/height cap at all — with
          coupon + referral + add-on rows all showing at once, content could
          grow taller than the viewport and push the action/close buttons
          off-screen entirely, with no way to reach them. Fixed by capping
          the whole modal to the viewport height and making only the middle
          content scroll — header and action buttons stay pinned and always
          reachable regardless of how many rows render. */}
      <div className="bg-white rounded-xl max-w-md w-full mx-4 shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header — fixed, never scrolls */}
        <div className="flex items-center justify-between p-8 pb-6 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isAddonRemoval || isPlanDowngrade || isConfirmReactivate ? "bg-amber-100" : "bg-blue-100"}`}>
              {isAddonRemoval || isPlanDowngrade || isConfirmReactivate
                ? <AlertTriangle className="w-5 h-5 text-amber-600" />
                : <ShoppingCart className="w-5 h-5 text-blue-600" />}
            </div>
            <h3 className="text-xl font-bold text-gray-900">
              {isAddonRemoval ? "Schedule Removal"
                : isConfirmReactivate ? "Keep Subscription Active?"
                : isPlanUpgrade ? `Upgrade to ${plan?.name || plan?.id || ""}`
                : isPlanDowngrade ? `Downgrade to ${plan?.name || plan?.id || ""}`
                : isCycleTransition ? `Switch to ${prettyKey(toPlanId)} — Annual`
                : "Order Summary"}
            </h3>
          </div>
          <button
            onClick={onCancel}
            disabled={processing}
            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body — everything between header and actions */}
        <div className="px-8 pb-2 overflow-y-auto flex-1 min-h-0">
        {/* Line items */}
        {isConfirmReactivate ? (
          <div className="mb-4">
            <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-3">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                Your scheduled cancellation will be cancelled — choosing {plan?.name || plan?.id || "a new plan"} keeps your subscription active.
              </span>
            </div>
          </div>
        ) : isPlanDowngrade ? (
          <div className="space-y-3 mb-4">
            {pendingCancellationWillClear && (
              <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>Your scheduled cancellation will be cancelled — choosing this plan keeps your subscription active.</span>
              </div>
            )}
            {/* Compatibility checks — generic renderer over downgradeChecks,
                no business-rule knowledge here. Shown FIRST (wizard step 1):
                validate before configuring/reviewing pricing. */}
            {downgradeChecks.length > 0 && (
              <div className="space-y-2 pb-3 border-b border-gray-100">
                <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">Compatibility check</div>
                {downgradeChecks.map((check, idx) => {
                  if (check.status === "PASS") {
                    return (
                      <div key={idx} className="flex items-center gap-2 text-sm text-green-700">
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                        <span>{prettyKey(check.type)} — no action required</span>
                      </div>
                    );
                  }
                  if (check.status === "AUTO_FIXABLE") {
                    const qty = resolutionAddons[check.requiredAddon] ?? check.minimumQuantity;
                    const unitPrice = resolutionAddonCatalog[check.requiredAddon]?.pricePerUnit ?? check.pricePerUnit ?? 0;
                    const minimum = check.minimumQuantity;
                    return (
                      <div key={idx} className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <div className="flex items-start gap-2 mb-2">
                          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-amber-800">{check.message || `${prettyKey(check.type)} needs attention.`}</p>
                        </div>
                        <div className="flex items-center justify-between pl-6">
                          <span className="text-sm text-gray-700">{prettyKey(check.requiredAddon)}</span>
                          <div className="flex items-center gap-3">
                            {onDowngradeResolutionChange ? (
                              <div className="flex items-center gap-2 border border-gray-200 rounded-md px-1.5 py-0.5 bg-white">
                                <button
                                  type="button"
                                  onClick={() => onDowngradeResolutionChange(check.requiredAddon, qty - 1)}
                                  disabled={processing || qty <= minimum}
                                  className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
                                  aria-label={`Decrease ${prettyKey(check.requiredAddon)}`}
                                >
                                  −
                                </button>
                                <span className="text-sm text-gray-800 w-4 text-center">{qty}</span>
                                <button
                                  type="button"
                                  onClick={() => onDowngradeResolutionChange(check.requiredAddon, qty + 1)}
                                  disabled={processing}
                                  className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
                                  aria-label={`Increase ${prettyKey(check.requiredAddon)}`}
                                >
                                  +
                                </button>
                              </div>
                            ) : (
                              <span className="text-sm text-gray-800">×{qty}</span>
                            )}
                            <span className="text-sm text-gray-600 w-20 text-right">{formatPrice(qty * unitPrice)}/{cycleLabel}</span>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  // MANUAL_ACTION / BLOCKING — stop the flow, no way to resolve here.
                  return (
                    <div key={idx} className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-red-800">{check.message || `${prettyKey(check.type)} is not compatible with this plan.`}</p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* New base plan */}
            <div className="flex items-start justify-between">
              <div>
                <span className="text-sm font-semibold text-gray-900 capitalize">{plan?.name || plan?.id} plan</span>
              </div>
              <span className="text-sm font-semibold text-gray-800">{formatPrice(newBasePrice)}/{cycleLabel}</span>
            </div>

            {/* Carry-forward addons — editable, same stepper as upgrade */}
            {Object.keys(maxCarryForward).length > 0 && (
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">Will continue after downgrade</div>
                {Object.keys(maxCarryForward).map((addonKey) => {
                  const current = carriedForwardAddons.find((a) => a.addonKey === addonKey);
                  const quantity = current?.quantity ?? 0;
                  const unitPrice = current?.pricePerUnit ?? 0;
                  const remappedFrom = current?.remappedFrom;
                  const max = maxCarryForward[addonKey];
                  return (
                    <div key={addonKey} className="flex items-center justify-between py-1">
                      <span className="text-sm text-gray-700">
                        {prettyKey(addonKey)}
                        {remappedFrom && remappedFrom !== addonKey && (
                          <span className="text-gray-400 ml-1">(was {prettyKey(remappedFrom)})</span>
                        )}
                      </span>
                      <div className="flex items-center gap-3">
                        {onCarryForwardChange ? (
                          <div className="flex items-center gap-2 border border-gray-200 rounded-md px-1.5 py-0.5">
                            <button
                              type="button"
                              onClick={() => onCarryForwardChange(addonKey, quantity - 1)}
                              disabled={processing || quantity <= 0}
                              className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
                              aria-label={`Decrease ${prettyKey(addonKey)}`}
                            >
                              −
                            </button>
                            <span className="text-sm text-gray-800 w-4 text-center">{quantity}</span>
                            <button
                              type="button"
                              onClick={() => onCarryForwardChange(addonKey, quantity + 1)}
                              disabled={processing || quantity >= max}
                              className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
                              aria-label={`Increase ${prettyKey(addonKey)}`}
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          quantity > 1 && <span className="text-gray-400">×{quantity}</span>
                        )}
                        <span className="text-sm text-gray-600 w-20 text-right">{formatPrice(quantity * unitPrice)}/{cycleLabel}</span>
                      </div>
                    </div>
                  );
                })}
                <p className="text-xs text-gray-400 mt-1">Reducing a quantity schedules its removal for the same date.</p>
              </div>
            )}

            {/* New selected addons */}
            {newAddonsList.length > 0 && (
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">Adding now</div>
                {newAddonsList.map((a) => (
                  <div key={a.addonKey} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">
                      {prettyKey(a.addonKey)}{a.quantity > 1 && <span className="text-gray-400 ml-1">×{a.quantity}</span>}
                    </span>
                    <span className="text-sm text-green-700">+{formatPrice(a.quantity * a.pricePerUnit)}/{cycleLabel}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Recurring total with GST */}
            <div className="border-t border-gray-100 pt-2">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-sm font-semibold text-gray-900">New recurring from {formatDate(periodEnd)}</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-gray-900">{formatPrice(downgradeRecurringWithGST)}/{cycleLabel}</span>
                  <p className="text-xs text-gray-400">{formatPrice(downgradeRecurringBase)} + {formatPrice(downgradeRecurringGST)} GST</p>
                </div>
              </div>
            </div>

            {incompatibleAddons.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-amber-800 mb-1">Add-ons not available on this plan</p>
                  <ul className="space-y-0.5">
                    {incompatibleAddons.map((a) => (
                      <li key={a.addonKey} className="text-xs text-amber-700">
                        {a.displayName || prettyKey(a.addonKey)}{a.quantity > 1 && ` ×${a.quantity}`} — removed at cycle end
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-amber-600 mt-1">You keep access until {formatDate(periodEnd)}.</p>
                </div>
              </div>
            )}

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                No refund. You keep current plan access until <strong>{formatDate(periodEnd)}</strong>.
              </p>
            </div>
          </div>
        ) : isPlanUpgrade ? (
          <div className="space-y-3 mb-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-sm font-semibold text-gray-900 capitalize">{plan?.name || plan?.id} plan</span>
                <p className="text-xs text-gray-400">New recurring bill from next renewal</p>
              </div>
              <span className="text-sm font-semibold text-gray-800">{formatPrice(newRecurringTotal)}/{cycleLabel}</span>
            </div>
            <div className="flex items-start justify-between pb-3 border-b border-gray-100">
              <div>
                <span className="text-sm font-bold text-gray-900">Charged now</span>
                <p className="text-xs text-gray-400">Pro-rated for the remaining cycle</p>
              </div>
              <span className="text-base font-bold text-blue-700">{formatPrice(proratedAmount)}</span>
            </div>

            {Object.keys(maxCarryForward).length > 0 && (
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">Will continue after upgrade</div>
                {Object.keys(maxCarryForward).map((addonKey) => {
                  const current = carriedForwardAddons.find((a) => a.addonKey === addonKey);
                  const quantity = current?.quantity ?? 0;
                  const unitPrice = current?.pricePerUnit ?? 0;
                  const remappedFrom = current?.remappedFrom;
                  const max = maxCarryForward[addonKey];
                  return (
                    <div key={addonKey} className="flex items-center justify-between py-1">
                      <span className="text-sm text-gray-700">
                        {prettyKey(addonKey)}
                        {remappedFrom && remappedFrom !== addonKey && (
                          <span className="text-gray-400 ml-1">(was {prettyKey(remappedFrom)})</span>
                        )}
                      </span>
                      <div className="flex items-center gap-3">
                        {onCarryForwardChange ? (
                          <div className="flex items-center gap-2 border border-gray-200 rounded-md px-1.5 py-0.5">
                            <button
                              type="button"
                              onClick={() => onCarryForwardChange(addonKey, quantity - 1)}
                              disabled={processing || quantity <= 0}
                              className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
                              aria-label={`Decrease ${prettyKey(addonKey)}`}
                            >
                              −
                            </button>
                            <span className="text-sm text-gray-800 w-4 text-center">{quantity}</span>
                            <button
                              type="button"
                              onClick={() => onCarryForwardChange(addonKey, quantity + 1)}
                              disabled={processing || quantity >= max}
                              className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
                              aria-label={`Increase ${prettyKey(addonKey)}`}
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          quantity > 1 && <span className="text-gray-400">×{quantity}</span>
                        )}
                        <span className="text-sm text-gray-600 w-20 text-right">{formatPrice(quantity * unitPrice)}/{cycleLabel}</span>
                      </div>
                    </div>
                  );
                })}
                <p className="text-xs text-gray-400 mt-1">Reducing a quantity schedules its removal for your next renewal.</p>
              </div>
            )}

            {newAddonsList.length > 0 && (
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">Adding now</div>
                {newAddonsList.map((a) => (
                  <div key={a.addonKey} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">
                      {prettyKey(a.addonKey)}{a.quantity > 1 && <span className="text-gray-400 ml-1">×{a.quantity}</span>}
                    </span>
                    <span className="text-sm text-green-700">+{formatPrice(a.quantity * a.pricePerUnit)}/{cycleLabel}</span>
                  </div>
                ))}
              </div>
            )}

            {incompatibleAddons.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-amber-800 mb-1">Add-ons not available on this plan</p>
                  <ul className="space-y-0.5">
                    {incompatibleAddons.map((a) => (
                      <li key={a.addonKey} className="text-xs text-amber-700">
                        {a.displayName || a.addonKey}
                        {a.quantity > 1 && ` ×${a.quantity}`} — removed at cycle end
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-amber-600 mt-1">You keep access to these until your current billing period ends.</p>
                </div>
              </div>
            )}
          </div>
        ) : isCycleTransition ? (
          <div className="space-y-3 mb-4">
            {/* Current -> Switching to — mirrors doc 3's exact requested
                layout. All values are backend-computed (previewMonthlyToAnnualTransition),
                never recalculated here. */}
            <div className="flex items-start justify-between pb-2 border-b border-gray-100">
              <div>
                <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">Current</span>
                <p className="text-sm font-semibold text-gray-900 capitalize mt-0.5">{prettyKey(fromPlanId)}</p>
                <p className="text-xs text-gray-400">{formatPrice(fromPricePerUser)}/mo · Monthly period</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">Switching to</span>
                <p className="text-sm font-semibold text-gray-900 capitalize mt-0.5">{prettyKey(toPlanId)}</p>
                <p className="text-xs text-gray-400">{formatPrice(toPricePerUser)}/yr · Annual entitlement window</p>
              </div>
            </div>

            {/* Distinguish what this transition supersedes vs. what survives
                untouched — settled business contract: committing this cancels
                any pending base-plan PLAN_CHANGE/BILLING_CYCLE_CHANGE, but a
                pending add-on removal is unaffected. The user should see this
                before committing, not discover it after via the Timeline. */}
            {supersedesScheduledChange && (
              <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>Your scheduled plan change will be cancelled — switching to Annual now replaces it immediately.</span>
              </div>
            )}

            {/* Task 2: explicit per-add-on choice — 'Keep Monthly' is the
                default and a pure no-op (never silently converted); choosing
                'Convert to Annual' shows the REAL backend-computed prorated
                price, itemized separately from the base transition amount
                below. */}
            {choosableAddons.length > 0 && (
              <div className="space-y-2 pb-3 border-b border-gray-100">
                <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">Your existing add-ons</div>
                {choosableAddons.map((addon) => (
                  <div key={addon.addonKey} className="flex items-center justify-between gap-2 p-2 bg-gray-50 rounded-lg">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800 truncate">
                        {prettyKey(addon.addonKey)} {addon.quantity > 1 && `×${addon.quantity}`}
                      </p>
                      <p className="text-xs text-gray-400">
                        {addon.chosenCycle === "yearly"
                          ? `${formatPrice(addon.amount)} prorated for the annual window`
                          : `${formatPrice(addon.monthlyPricePerUnit)}/mo each · billed monthly, separately`}
                      </p>
                      {/* Live-QA visibility fix: a pending partial removal
                          must stay visible here — the quantity above already
                          excludes it (backend-computed), but silently
                          excluding it without saying so reads as a mystery
                          discrepancy rather than a fact the user already knows. */}
                      {addon.pendingRemovalQuantity > 0 && (
                        <p className="text-xs text-amber-600 mt-0.5">
                          {addon.pendingRemovalQuantity} more scheduled for removal
                          {addon.pendingRemovalEffectiveAt ? ` on ${new Date(addon.pendingRemovalEffectiveAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""} — unaffected by this switch
                        </p>
                      )}
                    </div>
                    <div className="inline-flex rounded-md p-0.5 bg-gray-200 flex-shrink-0">
                      {["monthly", "yearly"].map((cyc) => (
                        <button
                          key={cyc}
                          type="button"
                          disabled={cyc === "yearly" && !addon.annualPricePerUnit}
                          onClick={() => onTransitionAddonChoiceChange && onTransitionAddonChoiceChange(addon.addonKey, cyc)}
                          className={`px-2 py-1 rounded text-xs font-medium transition-colors disabled:opacity-40 ${
                            addon.chosenCycle === cyc ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
                          }`}
                        >
                          {cyc === "monthly" ? "Keep Monthly" : "Convert to Annual"}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Target plan doesn't support this add-on at all — informational
                only, no choice offered. Access continues on its current term. */}
            {transitionIncompatibleAddons.length > 0 && (
              <div className="space-y-1.5 pb-3 border-b border-gray-100">
                <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">Not available on {prettyKey(toPlanId)}</div>
                {transitionIncompatibleAddons.map((addon) => (
                  <div key={addon.addonKey} className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>
                      {prettyKey(addon.addonKey)} {addon.quantity > 1 && `×${addon.quantity}`} isn't available on {prettyKey(toPlanId)} —
                      {" "}you'll keep access until {new Date(addon.effectiveAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Explanation, so the number isn't mysterious — per doc 3's own
                framing: "explain why they're paying X rather than simply
                displaying a mysterious number." */}
            {monthsCompleted > 0 && (
              <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                Your annual entitlement window is anchored to your original billing date —
                {" "}{monthsCompleted} month{monthsCompleted === 1 ? "" : "s"} completed since then,
                {" "}{monthsIntoWindow} month{monthsIntoWindow === 1 ? "" : "s"} into your current window.
              </div>
            )}

            {/* Proration breakdown — exact shape requested: Annual remaining
                value minus unused monthly value, before GST. */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{prettyKey(toPlanId)} Annual remaining value</span>
                <span className="text-gray-900 font-medium">{formatPrice(newAnnualValue)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Unused {prettyKey(fromPlanId)} monthly value</span>
                <span className="text-red-600 font-medium">− {formatPrice(unusedMonthlyValue)}</span>
              </div>
              <div className="flex items-center justify-between text-sm font-semibold border-t border-gray-100 pt-1.5">
                <span className="text-gray-900">Transition amount (before GST)</span>
                <span className="text-gray-900">{formatPrice(Math.max(1, newAnnualValue - unusedMonthlyValue))}</span>
              </div>
            </div>

            {/* GST + total — deliberately NOT reusing OrderSummary here (found
                via live QA): its generic pricingLineItems table would show
                the underlying invoice engine's own "Plan Price ₹0" +
                "Prorated Adjustment ₹4,550" lines, duplicating and
                contradicting the breakdown already shown above in
                commercial-calculation terms. Every number below is still
                backend-sourced (pricingBreakdown.gst/taxableAmount/total,
                couponDiscount/referralDiscount if ever applicable) — this is
                a display-shape choice, not a second calculation. */}
            {pricingBreakdown && (
              <div className="space-y-1.5 pt-1 border-t border-gray-100">
                {pricingBreakdown.couponDiscount && (
                  <div className="flex items-center justify-between text-sm text-red-600">
                    <span>Coupon Discount{pricingBreakdown.couponDiscount.code ? ` (${pricingBreakdown.couponDiscount.code})` : ""}</span>
                    <span>− {formatPrice(pricingBreakdown.couponDiscount.amount)}</span>
                  </div>
                )}
                {pricingBreakdown.referralDiscount && (
                  <div className="flex items-center justify-between text-sm text-purple-600">
                    <span>Referral Reward</span>
                    <span>− {formatPrice(pricingBreakdown.referralDiscount.amount)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">GST (18%)</span>
                  <span className="text-gray-900 font-medium">+ {formatPrice(pricingBreakdown.gst)}</span>
                </div>
                <div className={`flex items-center justify-between text-sm ${addonConversions.length > 0 ? "" : "text-base font-bold text-gray-900 border-t border-gray-100 pt-1.5"}`}>
                  <span className={addonConversions.length > 0 ? "text-gray-600" : ""}>{addonConversions.length > 0 ? "Base plan total" : "Total Payable"}</span>
                  <span className={addonConversions.length > 0 ? "text-gray-900 font-medium" : ""}>{formatPrice(pricingBreakdown.total)}</span>
                </div>
                {/* Task 2: itemized, never folded into the base plan total
                    above — one line per converted add-on, same
                    backend-computed pricingBreakdown each already carries. */}
                {addonConversions.map((c) => (
                  <div key={c.addonKey} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{prettyKey(c.addonKey)} → Annual (incl. GST)</span>
                    <span className="text-gray-900 font-medium">+ {formatPrice(c.pricingBreakdown?.total || c.amount)}</span>
                  </div>
                ))}
                {addonConversions.length > 0 && (
                  <div className="flex items-center justify-between text-base font-bold text-gray-900 border-t border-gray-100 pt-1.5">
                    <span>Total Payable</span>
                    <span>{formatPrice(pricingBreakdown.total + addonConversions.reduce((s, c) => s + (c.pricingBreakdown?.total || 0), 0))}</span>
                  </div>
                )}
              </div>
            )}

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
              Your current <strong className="capitalize">{prettyKey(fromPlanId)}</strong> monthly plan will be replaced immediately.
              Your annual billing period stays aligned with your original billing anchor and renews on{" "}
              <strong>{formatDate(windowEnd)}</strong>.
            </div>

            {/* Task 1 (Aug 2026): a "kept Monthly" add-on's price/plan
                details are NOT touched by this transition, but it now
                genuinely renews and is charged every month on its own —
                the old "unaffected" framing understated this once
                independent per-add-on billing was built. */}
            <p className="text-xs text-gray-400">
              Add-ons you keep on Monthly aren't converted — they'll continue billing you every month, separately from this annual plan.
            </p>
          </div>
        ) : isAddonRemoval ? (
          <div className="space-y-3 mb-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">Removing</div>
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <span className="text-sm text-gray-700">{displayName} ×{removalQty}</span>
              <span className="text-sm font-medium text-red-600">−{formatPrice(removalQty * pricePerUnit)}/{cycleLabel}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Current recurring bill</span>
              <span className="text-sm font-semibold text-gray-800">{formatPrice(currentTotal)}/{cycleLabel}</span>
            </div>
            <div className="flex items-start justify-between">
              <div>
                <span className="text-sm font-semibold text-gray-900">New recurring bill</span>
                <p className="text-xs text-gray-400">from {formatDate(effectiveAt)}</p>
              </div>
              <span className="text-sm font-bold text-gray-900">{formatPrice(newRecurringTotal)}/{cycleLabel}</span>
            </div>
            <div className="mt-1 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                No charge today. Access continues until <strong>{formatDate(effectiveAt)}</strong>.
              </p>
            </div>
          </div>
        ) : isAddonChange ? (
          <div className="space-y-3 mb-4">
            {(() => {
              const additions = (addonChanges || []).filter((c) => c.delta > 0);
              const removals = (addonChanges || []).filter((c) => c.delta < 0);
              const isMixed = additions.length > 0 && removals.length > 0;

              if (isMixed) {
                return (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    Please add and remove add-ons separately.
                  </div>
                );
              }

              return (
                <>
                  {/* Task 4: real backend-computed one-time charge, when a
                      preview was fetched for this single-addon addition —
                      the block below this only ever showed the resulting
                      RECURRING total, never what gets charged today. */}
                  {additions.length === 1 && addonPurchasePreview && (
                    <TransitionConfirmationCard
                      currentLabel={`${plan?.name || plan?.id || ""} — current add-ons`}
                      targetLabel={`+ ${additions[0].delta} × ${additions[0].displayName}`}
                      targetSubLabel={`${cycleLabel === "yr" ? "Annual" : "Monthly"} add-on`}
                      pricingBreakdown={addonPurchasePreview.pricingBreakdown}
                    />
                  )}

                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-600">Current billing</span>
                    <span className="text-sm font-semibold text-gray-800">{formatPrice(currentTotal)}/{cycleLabel}</span>
                  </div>

                  {additions.length > 0 && (
                    <>
                      <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">Adding</div>
                      {additions.map((change) => (
                        <div key={change.addonKey} className="flex items-start justify-between">
                          <span className="text-sm text-gray-700">
                            {change.delta} × {change.displayName}
                          </span>
                          <div className="text-right">
                            <div className="text-sm font-medium text-green-700">
                              +{formatPrice(change.delta * change.pricePerUnit)}/{cycleLabel}
                            </div>
                            <div className="text-xs text-gray-400">from next renewal · prorated now</div>
                          </div>
                        </div>
                      ))}
                    </>
                  )}

                  {removals.length > 0 && (
                    <>
                      <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">Removing</div>
                      {removals.map((change) => (
                        <div key={change.addonKey} className="flex items-start justify-between">
                          <span className="text-sm text-gray-700">
                            {change.displayName}
                            {Math.abs(change.delta) > 1 && <span className="text-gray-400 ml-1">×{Math.abs(change.delta)}</span>}
                          </span>
                          <div className="text-right">
                            <div className="text-sm font-medium text-red-600">
                              -{formatPrice(Math.abs(change.delta) * change.pricePerUnit)}/{cycleLabel}
                            </div>
                            <div className="text-xs text-gray-400">From next renewal</div>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </>
              );
            })()}
          </div>
        ) : (
          <div className="space-y-3 mb-4">
            {/* Base plan */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700 font-medium capitalize">
                {plan.name} Plan
                {appliedCoupon?.lineItems?.find((li) => li.key === plan.id && li.discount > 0) && (
                  <span className="ml-1.5 text-xs font-medium text-green-600">
                    − {formatPrice(appliedCoupon.lineItems.find((li) => li.key === plan.id).discount)} coupon
                  </span>
                )}
              </span>
              <span className="text-sm font-semibold text-gray-900">
                {formatPrice(basePrice)}/{cycleLabel}
              </span>
            </div>

            {/* Selected add-ons — annotated with the coupon's per-line-item
                discount, if any, so it's clear the discount applies to just
                this item rather than the whole order */}
            {selectedAddonsList.map((addon) => {
              const itemDiscount = appliedCoupon?.lineItems?.find((li) => li.key === addon.key && li.discount > 0);
              return (
                <div key={addon.key} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">
                    {addon.displayName}
                    {addon.pricingType !== "boolean" && (
                      <span className="text-gray-400 ml-1">× {addon.quantity}</span>
                    )}
                    {itemDiscount && (
                      <span className="ml-1.5 text-xs font-medium text-green-600">− {formatPrice(itemDiscount.discount)} coupon</span>
                    )}
                  </span>
                  <span className="text-sm text-gray-700">{formatPrice(addon.subtotal)}/{cycleLabel}</span>
                </div>
              );
            })}

            {/* Add-ons carried forward from current plan */}
            {compatibleCarryForward.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-100">
                <div className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2">Carrying forward</div>
                {compatibleCarryForward.map((addon) => (
                  <div key={addon.addonKey} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">
                      {addon.addonKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                      {addon.quantity > 1 && <span className="text-gray-400 ml-1">× {addon.quantity}</span>}
                    </span>
                    <span className="text-sm text-gray-700">{formatPrice(addon.quantity * addon.pricePerUnit)}/{cycleLabel}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Incompatible add-ons being dropped */}
            {incompatibleDropped.length > 0 && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-amber-800 mb-1">Add-ons not available on this plan</p>
                    <ul className="space-y-0.5">
                      {incompatibleDropped.map((addon) => (
                        <li key={addon.addonKey} className="text-xs text-amber-700">
                          {addon.displayName || addon.addonKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                          {addon.quantity > 1 && ` × ${addon.quantity}`} — will be removed at cycle end
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-amber-600 mt-1">You keep access to these until your current billing period ends.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Coupon effect banner — only the legacy fallback path renders
                this; when pricingBreakdown is present, OrderSummary's own
                row set + §1.5 callout (below) covers it, so this would
                otherwise duplicate the same information. */}
            {appliedCoupon && !pricingBreakdown && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-green-800">Coupon Applied — {appliedCoupon.code}</p>
                    <p className="text-xs text-green-700">You saved {formatPrice(appliedCoupon.discountAmount)} today.</p>
                  </div>
                </div>
              </div>
            )}

            {/* BILLING_UX_SPEC.md §1 — backend-computed Order Summary,
                replacing this branch's own client-side totals entirely.
                Falls back to the legacy client-computed block only if the
                preview call failed (pricingBreakdown is null). */}
            {pricingBreakdown && (
              <div className="mt-3">
                <OrderSummary pricingBreakdown={pricingBreakdown} header="Order Summary" rewardConsumedThisCheckout />
              </div>
            )}
          </div>
        )}

        {/* Divider + Total — hidden for addon_removal, plan_upgrade, plan_downgrade, cycle_transition (shown inline above) */}
        {!isAddonRemoval && !isPlanUpgrade && !isPlanDowngrade && !isCycleTransition && !isConfirmReactivate && (
          <>
            {isAddonChange ? (
              <>
                <div className="border-t border-gray-200 pt-4 mb-2">
                  <div className="flex items-center justify-between">
                    <span className="text-base font-bold text-gray-900">New total</span>
                    <span className="text-base font-bold text-gray-900">
                      {formatPrice(displayTotal)}/{cycleLabel}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mb-6">
                  {(addonChanges || []).some((c) => c.delta > 0)
                    ? "Razorpay checkout opens for the prorated charge. Recurring amount updates at next renewal."
                    : "No charge. Removal takes effect at the end of your current billing period."}
                </p>
              </>
            ) : pricingBreakdown ? (
              // Order Summary above already rendered the full row set +
              // total — nothing further to show here for the new-subscription
              // branch when the backend preview succeeded.
              <p className="text-xs text-gray-400 mb-6">GST included in the amount above.</p>
            ) : (() => {
              const gst = Math.round(displayTotal * 0.18);
              const totalWithGST = displayTotal + gst;
              return (
                <>
                  <div className="border-t border-gray-200 pt-4 mb-2 space-y-1.5">
                    {appliedCoupon && (
                      <>
                        <div className="flex items-center justify-between text-sm text-gray-600">
                          <span>Subtotal</span>
                          <span>{formatPrice(rawTotal)}/{cycleLabel}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm text-green-700">
                          <span>Coupon Discount ({appliedCoupon.code})</span>
                          <span>− {formatPrice(appliedCoupon.discountAmount)}/{cycleLabel}</span>
                        </div>
                      </>
                    )}
                    <div className="flex items-center justify-between text-sm text-gray-600">
                      <span>GST (18%)</span>
                      <span>+ {formatPrice(gst)}/{cycleLabel}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-gray-100 pt-1.5">
                      <span className="text-base font-bold text-gray-900">Total</span>
                      <span className="text-base font-bold text-gray-900">
                        {formatPrice(totalWithGST)}/{cycleLabel}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mb-6">GST included in the amount above.</p>
                </>
              );
            })()}
          </>
        )}
        {isPlanUpgrade && (() => {
          const recurringGST = Math.round(newRecurringTotal * 0.18);
          const recurringTotal = newRecurringTotal + recurringGST;
          const hasReferral = referralDiscountApplied > 0;
          const hasCoupon = couponDiscountApplied > 0;
          const hasDiscount = hasCoupon || hasReferral;
          // Legacy fallback totals, used only if pricingBreakdown is absent
          // (updateSubscription failed to return it for some reason).
          const chargeGST = Math.round(proratedAmount * 0.18);
          const chargeTotal = proratedAmount + chargeGST;
          const combinedDiscount = couponDiscountApplied + referralDiscountApplied;
          const originalProrated = proratedAmount + combinedDiscount;
          return (
            <>
              {/* BILLING_UX_SPEC.md §1 — backend-computed Order Summary,
                  replacing this branch's own hand-assembled totals. Falls
                  back to the legacy block only if pricingBreakdown is missing. */}
              {pricingBreakdown ? (
                <div className="mb-3">
                  <OrderSummary
                    pricingBreakdown={pricingBreakdown}
                    header={`Upgrade to ${plan?.name || "New Plan"}`}
                    contextLine="You'll be charged the prorated difference today."
                    rewardConsumedThisCheckout
                  />
                </div>
              ) : (
                <>
                  {hasReferral && (
                    <div className="mb-3 rounded-lg bg-purple-50 border border-purple-100 px-3 py-2.5 text-xs text-purple-700">
                      🎉 <span className="font-semibold">Referral reward applied</span> — you saved {formatPrice(referralDiscountApplied)} on this purchase.
                    </div>
                  )}
                  {hasCoupon && (
                    <div className="mb-3 rounded-lg bg-green-50 border border-green-100 px-3 py-2.5 text-xs text-green-700">
                      🎟️ <span className="font-semibold">Coupon applied</span> — you saved {formatPrice(couponDiscountApplied)} on this purchase.
                    </div>
                  )}
                  <div className="text-xs text-gray-500 mb-3 space-y-1 bg-gray-50 rounded-lg p-3">
                    {hasDiscount ? (
                      <>
                        <p className="font-semibold text-gray-700">Charged today (incl. GST)</p>
                        <div className="flex justify-between"><span>Prorated upgrade</span><span>{formatPrice(originalProrated)}</span></div>
                        {hasCoupon && <div className="flex justify-between text-green-700"><span>Coupon</span><span>−{formatPrice(couponDiscountApplied)}</span></div>}
                        {hasReferral && <div className="flex justify-between text-purple-700"><span>Referral reward</span><span>−{formatPrice(referralDiscountApplied)}</span></div>}
                        <div className="flex justify-between border-t border-gray-200 pt-1"><span>Subtotal</span><span>{formatPrice(proratedAmount)}</span></div>
                        <div className="flex justify-between"><span>GST (18%)</span><span>{formatPrice(chargeGST)}</span></div>
                        <div className="flex justify-between border-t border-gray-200 pt-1 font-bold text-gray-900"><span>Pay today</span><span>{formatPrice(chargeTotal)}</span></div>
                      </>
                    ) : (
                      <>
                        <p className="font-semibold text-gray-700">Charged today (incl. GST)</p>
                        <p>{formatPrice(proratedAmount)} + {formatPrice(chargeGST)} GST = <span className="font-bold text-gray-900">{formatPrice(chargeTotal)}</span></p>
                      </>
                    )}
                  </div>
                </>
              )}
              <div className="text-xs text-gray-500 mb-6 bg-gray-50 rounded-lg p-3">
                <p className="font-semibold text-gray-700">New recurring from next renewal</p>
                <p>{formatPrice(newRecurringTotal)}/{cycleLabel} + {formatPrice(recurringGST)} GST = <span className="font-bold text-gray-900">{formatPrice(recurringTotal)}/{cycleLabel}</span></p>
              </div>
            </>
          );
        })()}
        {isPlanDowngrade && <div className="mb-6" />}
        {isAddonRemoval && <div className="mb-6" />}
        {isCycleTransition && <div className="mb-2" />}
        {isConfirmReactivate && <div className="mb-2" />}
        </div>

        {/* Actions — fixed, never scrolls, always reachable */}
        <div className="space-y-3 p-8 pt-6 flex-shrink-0">
          <button
            onClick={onConfirm}
            disabled={processing || (isPlanDowngrade && hasHardBlocker)}
            className={`w-full py-3 px-4 rounded-lg font-medium disabled:opacity-50 transition-colors text-white ${isAddonRemoval || isPlanDowngrade || isConfirmReactivate ? "bg-amber-600 hover:bg-amber-700" : "bg-blue-600 hover:bg-blue-700"}`}
          >
            {processing ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processing...
              </span>
            ) : isConfirmReactivate ? (
              "Keep Active & Continue"
            ) : isAddonRemoval ? (
              "Schedule Removal"
            ) : isPlanDowngrade ? (
              "Schedule Downgrade"
            ) : isCycleTransition ? (
              `Continue to Payment${pricingBreakdown ? ` — ${formatPrice(
                pricingBreakdown.total + addonConversions.reduce((s, c) => s + (c.pricingBreakdown?.total || 0), 0)
              )}` : ""}`
            ) : isPlanUpgrade ? (
              `Pay ${formatPrice(proratedAmount + Math.round(proratedAmount * 0.18))} & Upgrade`
            ) : isAddonChange ? (
              (addonChanges || []).some((c) => c.delta > 0)
                ? `Pay${addonPurchasePreview ? ` ${formatPrice(addonPurchasePreview.prorationAmountWithGST)}` : " (Prorated)"} & Add`
                : `Schedule Removal (no charge)`
            ) : (
              // A1 fix (found via live QA): this used to compute its own total
              // from displayTotal — a client-side figure derived from the
              // static plan catalog price (SubscriptionPlans.jsx), re-adding
              // GST by hand and subtracting only the coupon, never the
              // referral discount. That diverged from pricingBreakdown.total,
              // the same backend-verified figure OrderSummary's own "Total
              // Payable" line already shows above — the button must display
              // the exact one-time amount being charged right now, so it
              // reads that same value when available (falling back to the
              // legacy calc only if the preview failed). Also drops the
              // "/mo" suffix, which was never correct for a one-time charge.
              pricingBreakdown
                ? `Confirm & Pay ${formatPrice(pricingBreakdown.total)}`
                : `Confirm & Pay ${formatPrice(displayTotal + Math.round(displayTotal * 0.18))}/${cycleLabel}`
            )}
          </button>
          <button
            onClick={onCancel}
            disabled={processing}
            className="w-full bg-gray-100 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-200 transition-colors"
          >
            {isCycleTransition || isConfirmReactivate ? "Cancel" : "Back"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CheckoutSummaryModal;
