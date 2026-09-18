// routes/subscription.js
const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const authMiddleware = require('../middlewares/auth');
const userSyncMiddleware = require('../middlewares/userSync');
const adminMiddleware = require('../middlewares/admin');
const couponController = require('../controllers/couponController');

const requireAuth = [authMiddleware, userSyncMiddleware];

const rawBodyMiddleware = (req, res, next) => {
  req.rawBody = '';
  req.on('data', (chunk) => {
    req.rawBody += chunk.toString();
  });
  req.on('end', () => {
    try {
      // Parse the raw body to populate req.body for convenience
      req.body = JSON.parse(req.rawBody || '{}');
      next();
    } catch (error) {
      console.error('Error parsing webhook body:', error.message);
      res.status(400).json({ error: 'Invalid request body' });
    }
  });
};

router.post('/webhook', rawBodyMiddleware, subscriptionController.handleWebhook);
router.use(express.json({ limit: '50mb' }));

// Existing routes...
router.get('/plans', subscriptionController.getPlans);
router.get('/current', requireAuth, subscriptionController.getCurrentSubscription);
router.post('/trial', requireAuth, adminMiddleware, subscriptionController.startFreeTrial);
// createSubscription IS the Charge-at-Will implementation (Phase 2) now — no
// alias, no parallel route. The legacy Subscriptions/Plans implementation
// (401 on this account, see CAW_BILLING_DESIGN.md §0) was never wired to any
// route and has been removed entirely (Phase 7 cleanup).
router.post('/preview', requireAuth, adminMiddleware, subscriptionController.previewSubscription);
// Read-only Billing Calendar upgrade-slider preview — see the controller's
// own comment for why this can never create an Order/reservation/write.
router.get('/preview-plan-upgrade', requireAuth, adminMiddleware, subscriptionController.previewPlanUpgrade);
router.post('/create', requireAuth, adminMiddleware, subscriptionController.createSubscription);
router.put('/update', requireAuth, adminMiddleware, subscriptionController.updateSubscription);
router.post('/cancel', requireAuth, adminMiddleware, subscriptionController.cancelSubscription);
// Escape hatch for the downgrade freeze rule — cancels a scheduled downgrade
// (pendingUpdate), reverting to no pending plan change. No "edit" endpoint
// exists by design; re-run the downgrade flow from scratch instead.
router.post('/downgrade/cancel', requireAuth, adminMiddleware, subscriptionController.cancelScheduledDowngrade);
router.post('/cancellation/undo', requireAuth, adminMiddleware, subscriptionController.undoCancellation);


// New payment-related routes
router.post('/verify-payment', requireAuth, adminMiddleware, subscriptionController.verifyPayment);
// Pull-based counterpart to verify-payment/the webhook: asks Razorpay whether the pending
// registration link was actually paid. Safe to call repeatedly (dedupes), read-only when there is
// nothing to reconcile.
router.post('/reconcile-payment', requireAuth, adminMiddleware, subscriptionController.reconcilePayment);
router.get('/payments', requireAuth, adminMiddleware, subscriptionController.getPaymentHistory);
router.get('/billing-events', requireAuth, adminMiddleware, subscriptionController.getBillingTimeline);
router.get('/scheduled-changes', requireAuth, adminMiddleware, subscriptionController.getScheduledChanges);
router.get('/renewal-preview', requireAuth, adminMiddleware, subscriptionController.getRenewalPreview);
router.get('/billing-projection', requireAuth, adminMiddleware, subscriptionController.getBillingProjection);
router.get('/payments/:paymentId', requireAuth, adminMiddleware, subscriptionController.getPaymentDetails);
router.post('/:id/retry-payment', requireAuth, adminMiddleware, subscriptionController.retryPayment);

// Public add-on catalog for a specific plan (no auth — needed before signup)
router.get('/addons/plan/:planId', subscriptionController.getAddonsForPlan);

// Seat status (read-only) — seats are just the "extra_seat" add-on now,
// bought/removed via the generic /addons/purchase and /addons/remove below.
router.get('/addons/seats', requireAuth, adminMiddleware, subscriptionController.getSeatStatusEndpoint);
// Deprecated — see subscriptionController.adjustSeats (returns 410).
router.post('/addons/seats', requireAuth, adminMiddleware, subscriptionController.adjustSeats);

// Generic add-on catalog endpoints
router.get('/addons', requireAuth, adminMiddleware, subscriptionController.getAvailableAddons);
router.get('/addons/compatibility', requireAuth, adminMiddleware, subscriptionController.checkAddonCompatibility);
// Phase 3 — Monthly -> Annual base-plan cadence transition
router.get('/cycle-transition/monthly-to-annual/preview', requireAuth, adminMiddleware, subscriptionController.previewMonthlyToAnnualTransition);
router.post('/cycle-transition/monthly-to-annual', requireAuth, adminMiddleware, subscriptionController.initiateMonthlyToAnnualTransition);
router.get('/reactivation/preview', requireAuth, adminMiddleware, subscriptionController.previewReactivation);
router.post('/reactivation', requireAuth, adminMiddleware, subscriptionController.initiateReactivation);
router.get('/addons/purchase/preview', requireAuth, adminMiddleware, subscriptionController.previewAddonPurchase);
router.post('/addons/purchase', requireAuth, adminMiddleware, subscriptionController.initiateAddonPurchase);
router.post('/addons/remove', requireAuth, adminMiddleware, subscriptionController.scheduleAddonRemovalEndpoint);
// Phase 2d.1 — read-only preview of a removal's effectiveAt before committing.
router.get('/addons/remove/preview', requireAuth, adminMiddleware, subscriptionController.previewAddonRemoval);
router.post('/addons/adjust', requireAuth, adminMiddleware, subscriptionController.adjustAddon);

// Coupon preview (plans page) — order-level eligibility + rules, no line items
router.post('/coupons/preview', requireAuth, adminMiddleware, couponController.previewCoupon);
// Coupon validation at checkout — Organization Admin only, pricing preview only
router.post('/coupons/validate', requireAuth, adminMiddleware, couponController.validateCoupon);

// C1 — coupon replacement on an already-paid subscription (Manage Subscription
// page). Remove detaches the current coupon (recomputes recurring baseline,
// never touches historical redemption); Replace validates + attaches a new
// one in the same step. Distinct from coupons/preview & coupons/validate
// above, which only ever preview pricing for a NOT-YET-EXISTING subscription.
router.delete('/coupon', requireAuth, adminMiddleware, subscriptionController.removeAppliedCoupon);
router.post('/coupon/replace', requireAuth, adminMiddleware, subscriptionController.replaceAppliedCoupon);
// Preview-only twins — same pricing logic, no persistence, no BillingEvent —
// so the frontend confirmation dialogs can show a real before/after amount
// without running their own pricing math.
router.get('/coupon/preview-removal', requireAuth, adminMiddleware, subscriptionController.previewRemoveCoupon);
router.post('/coupon/preview-replace', requireAuth, adminMiddleware, subscriptionController.previewReplaceCoupon);

// Referral code — org-facing (see REFERRAL_SYSTEM_DESIGN.md). Returns the
// org's existing active code, issuing one lazily on first request.
router.get('/referrals/code', requireAuth, adminMiddleware, subscriptionController.getOrgReferralCode);
// Referral overview — org-facing: my code(s), referrals sent, whether I was
// referred, my rewards (available/reserved/consumed/expired/revoked), summary stats.
router.get('/referrals/overview', requireAuth, adminMiddleware, subscriptionController.getMyReferralOverview);
router.get('/referrals/reward-availability', requireAuth, adminMiddleware, subscriptionController.getRewardAvailability);
// Apply a manually-typed referral code immediately (checkout page's own
// Apply button) — creates Referral(pending) right away, not gated behind
// a later Subscribe/Start Trial submission.
router.post('/referrals/apply', requireAuth, adminMiddleware, subscriptionController.applyReferralCode);
// Sends an invite email carrying the org's referral link. Reuses the
// existing invite-email infrastructure; does NOT create a Referral record —
// sending an email is not a referral event.
router.post('/referrals/send-email', requireAuth, adminMiddleware, subscriptionController.sendReferralEmail);

module.exports = router;
