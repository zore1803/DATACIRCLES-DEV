// services/subscriptionApi.js
import API from './api';

export const subscriptionAPI = {
  // Get available plans
  getPlans: () => API.get('/subscription/plans'),
  
  // Get current subscription
  getCurrentSubscription: () => API.get('/subscription/current'),
  
  // Start free trial
  startFreeTrial: () => API.post('/subscription/trial'),
  
  // BILLING_UX_SPEC.md §2.2 — the one "do I have an available reward" read
  // shared by every visibility surface (dashboard, plan cards, Manage
  // Subscription). Read-only.
  getRewardAvailability: () => API.get('/subscription/referrals/reward-availability'),

  // BILLING_UX_SPEC.md §2.2 — "Next Renewal" preview, read-only.
  getRenewalPreview: () => API.get('/subscription/renewal-preview'),

  // Billing Calendar — canonical read-only projection (current + scheduled +
  // upcoming), composed server-side from existing billing engines. Never
  // cached — the Calendar re-fetches on every open.
  getBillingProjection: () => API.get('/subscription/billing-projection'),

  // Billing Calendar upgrade-slider preview — read-only, creates nothing
  // (no Order/CommercialTransaction/reward reservation). asOfDate: ISO
  // string, "preview this upgrade as if executed at this instant."
  previewPlanUpgrade: (targetPlanId, asOfDate) =>
    API.get('/subscription/preview-plan-upgrade', { params: { targetPlanId, asOfDate: asOfDate?.toISOString?.() || asOfDate } }),

  // Read-only pricing preview — BILLING_UX_SPEC.md §0/Option A. Returns the
  // same pricingBreakdown shape createSubscription/updateSubscription return
  // on success, computed by the same calculateInvoice() call, but performs
  // no writes (no Registration Link, no Subscription document, no reward
  // reservation). Used to populate the pre-payment checkout modal so it's
  // never a client-side estimate.
  previewSubscription: (data) => API.post('/subscription/preview', data),

  // Create subscription
  createSubscription: (data) => API.post('/subscription/create', data),
  
  // Update subscription
  updateSubscription: (data) => API.put('/subscription/update', data),
  
  // Cancel subscription
  cancelSubscription: (data) => API.post('/subscription/cancel', data),

  // Cancel a scheduled downgrade — reverts pendingUpdate, restores any
  // carry-forward reduction it caused, unfreezes the subscription.
  cancelScheduledDowngrade: () => API.post('/subscription/downgrade/cancel'),
  undoCancellation: () => API.post('/subscription/cancellation/undo'),
  
  // Retry payment for failed subscription
  retryPayment: (subscriptionId) => API.post(`/subscription/${subscriptionId}/retry-payment`),
  
  // Verify payment after client receives payment response
  verifyPayment: (paymentData) => API.post('/subscription/verify-payment', paymentData),
  // Pull-based counterpart to verifyPayment: asks the backend to ask Razorpay whether the pending
  // registration link was actually paid. Needed because verifyPayment only ever runs if the
  // customer's checkout tab survives long enough to post back.
  reconcilePayment: () => API.post('/subscription/reconcile-payment'),
  
  // Get payment history
  getPaymentHistory: (params) => API.get('/subscription/payments', { params }),
  
  // Get payment details
  getPaymentDetails: (paymentId) => API.get(`/subscription/payments/${paymentId}`),

  // Adjust extra seats (legacy seat-specific)
  adjustSeats: (data) => API.post('/subscription/addons/seats', data),

  // Get current seat status (legacy seat-specific)
  getSeatStatus: () => API.get('/subscription/addons/seats'),

  // Generic add-on catalog for this org's plan
  getAvailableAddons: () => API.get('/subscription/addons'),

  // Generic add-on quantity adjustment
  adjustAddon: (data) => API.post('/subscription/addons/adjust', data),

  // Public: add-on catalog for a specific plan (no auth needed, for plan browsing)
  getAddonsForPlan: (planId, billingCycle) =>
    API.get(`/subscription/addons/plan/${planId}`, { params: { billingCycle } }),

  // Check which of the org's active add-ons are compatible with a target plan.
  // carryForward (optional, array of {addonKey, quantity}) re-validates
  // against the customer's live stepper edits, not just the initial
  // full-survival recommendation — read-only, safe to call on every change.
  checkAddonCompatibility: (targetPlanId, billingCycle, carryForward) =>
    API.get('/subscription/addons/compatibility', {
      params: {
        targetPlanId, billingCycle,
        ...(carryForward ? { carryForward: JSON.stringify(carryForward) } : {}),
      },
    }),

  // Initiate a prorated add-on purchase (returns Razorpay Order paymentDetails)
  initiateAddonPurchase: (data) => API.post('/subscription/addons/purchase', data),

  // Task 4: read-only preview for the add-on purchase confirmation screen —
  // the real backend-computed prorated amount, not a client-side estimate.
  // Creates nothing (no Order, no reward reservation).
  previewAddonPurchase: ({ addonKey, quantity, billingCycle }) =>
    API.get('/subscription/addons/purchase/preview', { params: { addonKey, quantity, ...(billingCycle ? { billingCycle } : {}) } }),

  // Phase 3: Monthly -> Annual base-plan cadence transition (returns Razorpay
  // Order paymentDetails, same one-time-charge shape as initiateAddonPurchase).
  // data: { targetPlanId, addonChoices } — both optional. addonChoices:
  // {[addonKey]: 'monthly'|'yearly'} — Task 2, defaults to 'monthly' (no-op)
  // for any add-on not listed.
  initiateMonthlyToAnnualTransition: (data) => API.post('/subscription/cycle-transition/monthly-to-annual', data),

  // Read-only preview for the pre-payment confirmation screen — explains the
  // transition calculation before Razorpay checkout opens. Creates nothing.
  previewMonthlyToAnnualTransition: (targetPlanId, addonChoices) =>
    API.get('/subscription/cycle-transition/monthly-to-annual/preview', {
      params: {
        ...(targetPlanId ? { targetPlanId } : {}),
        ...(addonChoices && Object.keys(addonChoices).length ? { addonChoices: JSON.stringify(addonChoices) } : {}),
      },
    }),

  // Schedule an add-on removal at end of current billing cycle
  scheduleAddonRemoval: (data) => API.post('/subscription/addons/remove', data),

  // Validate + price a coupon against a checkout context (no redemption yet)
  validateCoupon: (data) => API.post('/subscription/coupons/validate', data),

  // Order-level coupon eligibility + rules, for previewing discounts on the
  // plans page before any specific plan/add-on is chosen
  previewCoupon: (data) => API.post('/subscription/coupons/preview', data),

  // C1 — coupon replacement on an already-paid subscription. Detaches the
  // current coupon (Remove) or validates + attaches a different one
  // (Replace) — distinct from validateCoupon/previewCoupon above, which only
  // ever preview a NOT-YET-EXISTING subscription's checkout.
  removeAppliedCoupon: () => API.delete('/subscription/coupon'),
  replaceAppliedCoupon: (data) => API.post('/subscription/coupon/replace', data),
  // Preview-only twins — no persistence — so the frontend can show a real,
  // backend-computed before/after amount in a confirmation dialog without
  // running its own pricing math.
  previewRemoveCoupon: () => API.get('/subscription/coupon/preview-removal'),
  previewReplaceCoupon: (data) => API.post('/subscription/coupon/preview-replace', data),

  // Billing Center timeline — reads immutable BillingEvent records
  getBillingTimeline: (params) => API.get('/subscription/billing-events', { params }),

  // Pending future commercial intent — reads ScheduledChange records
  // (the only representation of "is a downgrade/cycle-change/addon-removal
  // scheduled?" — never derive this from the legacy pendingUpdate/
  // pendingAddonRemovals fields still present on the Subscription document).
  getScheduledChanges: () => API.get('/subscription/scheduled-changes'),

  // Referrals — org's own code (issued lazily) and full overview
  // (referrals sent, whether referred, rewards held, summary counts).
  getReferralCode: () => API.get('/subscription/referrals/code'),
  getReferralOverview: () => API.get('/subscription/referrals/overview'),
  // Applies a manually-typed referral code immediately — creates
  // Referral(pending) right away, not gated behind Subscribe/Start Trial.
  applyReferralCode: (code) => API.post('/subscription/referrals/apply', { code }),
  // Sends an invite email carrying the org's referral link. Does NOT
  // create a Referral — sending an email is not a referral event.
  sendReferralEmail: (email, message) => API.post('/subscription/referrals/send-email', { email, message }),
};
