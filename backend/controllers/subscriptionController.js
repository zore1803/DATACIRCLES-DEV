// controllers/subscriptionController.js
const Subscription = require("../models/Subscription");
const SubscriptionPayment = require("../models/SubscriptionPayment.js"); // Updated import
const PlanConfig = require("../models/PlanConfig");
const PlanAddon = require("../models/PlanAddon");
const Organization = require("../models/Organization");
const razorpay = require("../config/razorpay");
const crypto = require("crypto");
const { sendTrialStartedEmail } = require('../utils/trialEmails');
const seedTrialData = require('../utils/seedTrialData');
const { deleteTrialDemoData } = require('../utils/seedTrialData');
const {
  findOrCreateRazorpayPlan,
  classifyAddonsForPlanChange,
  scheduleAddonRemoval: scheduleAddonRemovalUtil,
  applyScheduledAddonRemovals,
  addonIdentityKey,
} = require('../utils/addonManagement');
const { getAccessEntitlementEnd, getEntitlementWindow, addCalendarMonths } = require('../utils/prorationMath');
const { computeNextAddonRenewalDate } = require('../utils/addonRenewalEngine');
const { validateAndPriceCoupon, recordRedemption, buildCouponModifierForLineItems, priceLineItems } = require('../utils/discountEngine');
// P0 CORRECTNESS FIX (found via live QA — "Coupon P0"): reused verbatim from
// the renewal engine, not duplicated. Before this fix, only renewal ever
// asked "is this coupon still eligible for a FUTURE commercial event" —
// upgrade and add-on purchase unconditionally rebuilt a coupon modifier from
// fullRulesSnapshot regardless of duration.type, so a first_payment coupon
// (correctly excluded at renewal) kept discounting every upgrade/add-on
// purchase forever. Despite the name, this function is a pure duration.type
// switch with no renewal-specific logic — by the time an org can upgrade or
// buy an add-on, its first payment has already settled (upgrade/add-on
// endpoints require an existing paid subscription), so first_payment's
// "redeemed" condition is always already true at these call sites too;
// reusing this exact function needs no modification, just a second caller.
const { isCouponStillEligibleForRenewal } = require('../utils/couponRenewalEligibility');
const { createRegistrationLinkForOrg, formatContactForRazorpay, resolveMandateMethod, createCheckoutLink } = require('../utils/cawAcquisition');
const { calculateInvoice, toPricingBreakdown, calculateCommercialAdjustments } = require('../utils/invoiceEngine');
const BillingInvoice = require('../models/BillingInvoice');
const CommercialTransaction = require('../models/CommercialTransaction');
const ScheduledChange = require('../models/ScheduledChange');
const Coupon = require('../models/Coupon');
const { emitBillingEvent } = require('../utils/billingEvents');
const Invited = require('../models/Invited');
const sendGridMail = require('../utils/sendGridMail.js');
const { generateInviteEmailHTML, generateReferralEmailHTML } = require('../controllers/authController');
const Referral = require('../models/Referral');
const Reward = require('../models/Reward');
const RewardUsage = require('../models/RewardUsage');
const { startAddonPurchase } = require('../utils/addonPurchaseLifecycle');
const { consumeReservation, releaseReservation, reserveNextAvailableReward, recordRewardUsageAmount } = require('../utils/referralRewards');
const { rewardToModifier, referralModifierFromPendingProgram } = require('../utils/modifierResolver');
const RazorpayWebhookEvent = require('../models/RazorpayWebhookEvent');

// ============================================================
// CHARGE-AT-WILL — Phase 2: Registration Link onboarding.
// See backend/docs/audit/CAW_BILLING_DESIGN.md and PHASE2_ONBOARDING_AUDIT.md.
// Additive only — does not modify createSubscription/verifyPayment (legacy
// Subscriptions path, deprecated, removed in Phase 8). Activation (Phase 3)
// is NOT implemented here; onboarding only creates the mandate + first
// invoice and leaves the subscription in mandateStatus='pending'.
// ============================================================

// Mandate ceiling policy (docs/audit/MANDATE_STRATEGY_AND_ANNUAL_BILLING.md,
// final) — CONFIGURABLE business policy, not architecture. Superseded from
// firstInvoice × MANDATE_HEADROOM_MULTIPLIER to a flat ceiling: Razorpay
// mandate tokens cannot be edited post-registration, so a per-customer,
// invoice-scaled ceiling that later proves too low can never be resized —
// only replaced via a brand-new mandate requiring full re-authorization.
// Registering every mandate at Razorpay's own UPI/card AFA-free ceiling
// (₹15,000) from day one means a resize is essentially never needed: any
// charge above it already requires Razorpay's own per-debit UPI-PIN
// confirmation regardless of this app's own ceiling, so a higher self-imposed
// ceiling wouldn't remove that friction anyway. Keep in sync with the
// identical copy in utils/cawAcquisition.js if this ever changes.
const MANDATE_CEILING_RUPEES = Number(process.env.CAW_MANDATE_CEILING_RUPEES) || 15000;
// Signature unchanged (still accepts firstInvoiceRupees) so every existing
// call site needs zero changes — the parameter is simply no longer used.
function computeMandateMaxAmountRupees(_firstInvoiceRupees) {
  return MANDATE_CEILING_RUPEES;
}

// Create subscription — Charge-at-Will (Registration Link onboarding, Phase 2).
// This IS the public createSubscription implementation; there is no separate
// public name. See CAW_BILLING_DESIGN.md.
// Preview-only pricing — "if the customer paid right now, this is exactly
// what they'd pay." Read-only: no Registration Link created, no Subscription
// written, no reward reserved (uses getNextAvailableReward, the same
// read used to SELECT a reservation candidate elsewhere, never the
// reserving call itself). Mirrors createSubscription's and updateSubscription's
// trial-conversion branch's own pricing construction exactly, so the number
// this returns is never allowed to diverge from what those endpoints later
// actually charge — same calculateInvoice() call, same modifier construction,
// just never persisted. See backend/docs/audit/BILLING_UX_SPEC.md §0: the
// frontend's checkout preview must come from this engine, not client math.
exports.previewSubscription = async (req, res) => {
  try {
    const { planId, billingCycle, addons = [], couponCode } = req.body;

    if (!planId || !billingCycle) {
      return res.status(400).json({ error: "Plan ID and billing cycle are required" });
    }

    const plan = await PlanConfig.findOne({ planId, isActive: true });
    if (!plan) {
      return res.status(404).json({ error: "Plan not found" });
    }
    const basePrice = billingCycle === "monthly" ? plan.monthlyPrice : plan.yearlyPrice;

    let activeAddons = [];
    if (addons.length > 0) {
      const addonKeys = addons.map((a) => a.addonKey);
      const addonEntries = await PlanAddon.find({ key: { $in: addonKeys }, isActive: true });
      for (const requested of addons) {
        const entry = addonEntries.find((e) => e.key === requested.addonKey);
        if (!entry) continue; // preview is best-effort — invalid addon just omitted, real validation happens at create time
        const planAllowed = entry.availableOnPlans.length === 0 || entry.availableOnPlans.includes(planId);
        const unitPrice = entry.price[billingCycle];
        if (!planAllowed || !unitPrice) continue;
        const qty = Number(requested.quantity) || 1;
        // Task 1 (Aug 2026) — confirmed live-data bug: an activeAddons entry
        // created without billingCycle silently re-interprets itself as
        // whatever the SUBSCRIPTION's CURRENT cycle is at every later read
        // (addonIdentityKey/getAddonRemovalEffectiveAt's documented
        // fallback), forever — not just "at signup," as Phase 2b's fallback
        // comment assumed. Stamping it explicitly here closes that gap at
        // its actual source for a fresh signup with add-ons.
        activeAddons.push({ addonKey: requested.addonKey, quantity: qty, pricePerUnit: unitPrice, addedAt: new Date(), billingCycle });
      }
    }

    let couponResult = null;
    if (couponCode) {
      const lineItems = [
        { key: planId, type: 'plan', amount: basePrice },
        ...activeAddons.map((a) => ({ key: a.addonKey, type: 'addon', amount: a.quantity * a.pricePerUnit })),
      ];
      couponResult = await validateAndPriceCoupon(couponCode, {
        organizationId: req.user.organization,
        planId,
        billingCycle,
        lineItems,
      });
      if (!couponResult.valid) couponResult = null; // preview silently omits an invalid/inapplicable code rather than erroring — the real create call is what enforces validity
    }

    // Same two referral sources createSubscription/trial-conversion check —
    // read-only versions of both (no reservation write).
    const { findPendingReferralForSignup } = require('../utils/referralUtils');
    const { getNextAvailableReward } = require('../utils/referralRewards');
    const pendingReferral = await findPendingReferralForSignup(req.user.organization);
    const availableReward = await getNextAvailableReward(req.user.organization);

    const resolvedModifiers = couponResult
      ? [{ type: 'coupon', value: { kind: 'fixed', amount: couponResult.discountAmount }, appliesTo: 'entire_invoice' }]
      : [];
    if (pendingReferral) {
      resolvedModifiers.push(referralModifierFromPendingProgram(pendingReferral.program));
    }
    if (availableReward) {
      resolvedModifiers.push(rewardToModifier(availableReward));
    }

    const invoice = calculateInvoice({
      subscription: { planName: planId, billingCycle, pricePerUser: basePrice, activeAddons },
      resolvedModifiers,
    });

    res.json({
      pricingBreakdown: toPricingBreakdown(invoice, {
        couponCode: couponResult?.coupon?.code,
        referralPercent: pendingReferral
          ? pendingReferral.program.rewardValue
          : (availableReward?.rewardType === 'percentage' ? availableReward.rewardValue : undefined),
      }),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Read-only upgrade-projection preview for the Billing Calendar's upgrade
// slider — "if this org upgraded to targetPlanId at asOfDate, what would
// happen." Mirrors the REAL upgrade branch's own pricing construction
// exactly (same calculateInvoice() Stage-5 call via adjustmentContext, same
// coupon modifier built from the SAME frozen appliedCoupon.fullRulesSnapshot)
// so this can never diverge from what a real upgrade will actually charge —
// but creates NOTHING: no Order, no CommercialTransaction, no reward
// reservation (getNextAvailableReward — the read-only candidate-select
// already used by previewSubscription above — never reserveNextAvailableReward),
// no Subscription write. Verified contract: scripts/verifyUpgradePreviewContract.js.
//
// Same billing cycle only (Growth Monthly -> Business Monthly, Growth
// Monthly -> Starter downgrade elsewhere) — annual upgrade projections are
// deliberately out of scope until this is verified end-to-end on monthly.
exports.previewPlanUpgrade = async (req, res) => {
  try {
    const { targetPlanId, asOfDate } = req.query;
    if (!targetPlanId) {
      return res.status(400).json({ error: 'targetPlanId is required' });
    }

    const subscription = await Subscription.findOne({ organization: req.user.organization });
    if (!subscription) return res.status(404).json({ error: 'No active subscription found' });
    if (!subscription.isPaymentConfirmed) {
      return res.status(400).json({ error: 'This organization is not on a confirmed paid subscription yet.' });
    }

    // Tier eligibility from the canonical rank source (planTiers.js) — not a
    // fresh hardcoded {starter:1,growth:2,business:3} literal (already
    // duplicated 4 times across the codebase; this endpoint is planTiers.js's
    // first real consumer, per its own stated additive design).
    const { planTierRank } = require('../utils/planTiers');
    const currentRank = planTierRank(subscription.planName);
    const targetRank = planTierRank(targetPlanId);
    if (currentRank == null || targetRank == null || targetRank <= currentRank) {
      return res.status(400).json({
        error: `"${targetPlanId}" is not a valid upgrade target from "${subscription.planName}".`,
        code: 'NOT_AN_UPGRADE',
      });
    }

    const newPlan = await PlanConfig.findOne({ planId: targetPlanId, isActive: true });
    if (!newPlan) return res.status(404).json({ error: 'Plan not found' });

    // Clamp asOfDate to [now, currentPeriodEnd) — matches the slider's own
    // bounds and the edge case verified in verifyUpgradePreviewContract.js:
    // AT or past currentPeriodEnd, calculatePlanUpgradeProration falls back
    // to the full undiscounted diff (real, correct behavior, but not a
    // useful slider preview point) — never let a client-supplied date reach
    // that branch by mistake.
    const now = new Date();
    const periodEnd = new Date(subscription.currentPeriodEnd);
    let effectiveAsOf = asOfDate ? new Date(asOfDate) : now;
    if (Number.isNaN(effectiveAsOf.getTime())) effectiveAsOf = now;
    if (effectiveAsOf < now) effectiveAsOf = now;
    if (effectiveAsOf >= periodEnd) effectiveAsOf = new Date(periodEnd.getTime() - 60 * 1000);

    const billingCycle = subscription.billingCycle;
    const newBasePrice = billingCycle === 'monthly' ? newPlan.monthlyPrice : newPlan.yearlyPrice;
    if (!newBasePrice) {
      return res.status(400).json({ error: `"${targetPlanId}" has no price configured for the ${billingCycle} cycle.` });
    }

    // Same oldTotal/newTotal construction as the real upgrade branch (line
    // ~1441 above) — add-ons carry forward unchanged for this preview; the
    // calendar doesn't offer carry-forward editing, that stays exclusive to
    // the real checkout modal.
    const oldLineItems = [
      { key: subscription.planName, type: 'plan', amount: subscription.pricePerUser },
      ...(subscription.activeAddons || []).map((a) => ({ key: a.addonKey, type: 'addon', amount: a.quantity * a.pricePerUnit })),
    ];
    const oldCouponModifier = (subscription.appliedCoupon?.fullRulesSnapshot && isCouponStillEligibleForRenewal(subscription.appliedCoupon))
      ? buildCouponModifierForLineItems(subscription.appliedCoupon.fullRulesSnapshot, oldLineItems)
      : null;
    const oldTotal = calculateInvoice({
      subscription,
      resolvedModifiers: oldCouponModifier ? [oldCouponModifier] : [],
    }).taxable;

    const upgradeTargetSubscription = {
      planName: targetPlanId,
      billingCycle,
      pricePerUser: newBasePrice,
      activeAddons: subscription.activeAddons || [],
    };
    const newLineItems = [
      { key: targetPlanId, type: 'plan', amount: newBasePrice },
      ...upgradeTargetSubscription.activeAddons.map((a) => ({ key: a.addonKey, type: 'addon', amount: a.quantity * a.pricePerUnit })),
    ];
    const newCouponModifier = (subscription.appliedCoupon?.fullRulesSnapshot && isCouponStillEligibleForRenewal(subscription.appliedCoupon))
      ? buildCouponModifierForLineItems(subscription.appliedCoupon.fullRulesSnapshot, newLineItems)
      : null;
    const newTotal = calculateInvoice({
      subscription: upgradeTargetSubscription,
      resolvedModifiers: newCouponModifier ? [newCouponModifier] : [],
    }).taxable;

    // Referral — READ-ONLY candidate select only. A slider preview must
    // never reserve/mutate a RewardUsage document.
    const { getNextAvailableReward } = require('../utils/referralRewards');
    const availableReward = await getNextAvailableReward(req.user.organization);
    const resolvedModifiers = availableReward ? [rewardToModifier(availableReward)] : [];

    const upgradeInvoice = calculateInvoice({
      subscription: { planName: targetPlanId, billingCycle, pricePerUser: 0, activeAddons: [] },
      changeset: { pricePerUser: 0 },
      asOf: effectiveAsOf,
      adjustmentContext: {
        type: 'plan_upgrade',
        oldBasePrice: oldTotal,
        newBasePrice: newTotal,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
      },
      resolvedModifiers,
    });

    // CORRECTION (found by user live-testing this endpoint's output, then
    // verified directly in code): the real upgrade-settlement webhook
    // handler (handleCAWPaymentCaptured's pendingPlanChange branch) never
    // reassigns currentPeriodEnd/nextBillingDate anywhere — confirmed by
    // grepping every currentPeriodEnd reference in that entire handler,
    // all reads, zero writes. A real upgrade does NOT start a fresh billing
    // cycle from the upgrade date; it prorates the difference for the
    // REMAINDER of the CURRENT cycle and keeps the exact same renewal date,
    // simply billing the new plan's full price from then on. This endpoint
    // previously computed `addBillingCycle(asOfDate, billingCycle)` here —
    // an invented renewal date that never matched what the real system
    // actually does. The renewal date after an upgrade is just the
    // subscription's own unchanged currentPeriodEnd.
    res.json({
      targetPlanId,
      billingCycle,
      asOfDate: effectiveAsOf,
      dueToday: upgradeInvoice.total, // GST-inclusive — what would actually be charged
      taxable: upgradeInvoice.taxable,
      gst: upgradeInvoice.gst,
      newBasePrice,
      newRecurringTotal: newTotal, // pre-GST recurring baseline, from renewal onward
      newRenewalDate: subscription.currentPeriodEnd, // unchanged — see comment above
      couponApplied: !!newCouponModifier,
      referralApplied: !!availableReward,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createSubscription = async (req, res) => {
  try {
    const { planId, billingCycle, addons = [], couponCode } = req.body;

    const existingSubscription = await Subscription.findOne({
      organization: req.user.organization,
    });
    if (existingSubscription) {
      return res.status(409).json({ error: "Organization already has a subscription" });
    }

    if (!planId || !billingCycle) {
      return res.status(400).json({ error: "Plan ID and billing cycle are required" });
    }

    // Razorpay requires `contact` for recurring Registration Links (confirmed
    // live: "The contact field is required for recurring links",
    // BAD_REQUEST_ERROR/input_validation_failed) — unlike a plain one-time
    // order. OAuth signups don't always capture a phone number, so this must
    // be validated here with an actionable message rather than surfacing
    // Razorpay's raw error to the customer.
    if (!req.user.phone) {
      return res.status(400).json({ error: "A contact phone number is required to set up recurring billing. Please add one to your profile before subscribing." });
    }

    const plan = await PlanConfig.findOne({ planId, isActive: true });
    if (!plan) {
      return res.status(404).json({ error: "Plan not found" });
    }

    const basePrice = billingCycle === "monthly" ? plan.monthlyPrice : plan.yearlyPrice;

    // Add-on validation/pricing — same logic as the legacy createSubscription,
    // reused as-is (Phase 2 does not touch pricing; that's Phase 4's job).
    let activeAddons = [];
    if (addons.length > 0) {
      const addonKeys = addons.map((a) => a.addonKey);
      const addonEntries = await PlanAddon.find({ key: { $in: addonKeys }, isActive: true });
      for (const requested of addons) {
        const entry = addonEntries.find((e) => e.key === requested.addonKey);
        if (!entry) {
          return res.status(400).json({ error: `Add-on "${requested.addonKey}" does not exist or is not available.` });
        }
        const planAllowed = entry.availableOnPlans.length === 0 || entry.availableOnPlans.includes(planId);
        if (!planAllowed) {
          return res.status(400).json({ error: `Add-on "${entry.displayName}" is not available on the ${planId} plan.` });
        }
        const unitPrice = entry.price[billingCycle];
        if (!unitPrice) {
          return res.status(400).json({ error: `Add-on "${entry.displayName}" has no price configured for the ${billingCycle} cycle.` });
        }
        const qty = Number(requested.quantity) || 1;
        // Task 1 (Aug 2026) — confirmed live-data bug (createSubscription):
        // an activeAddons entry created without billingCycle silently
        // re-interprets itself as whatever the SUBSCRIPTION's CURRENT cycle
        // is at every later read (addonIdentityKey/getAddonRemovalEffectiveAt's
        // documented fallback), forever — including long after any later
        // base-plan cycle change. Stamping it explicitly at creation closes
        // that gap at its actual source.
        activeAddons.push({ addonKey: requested.addonKey, quantity: qty, pricePerUnit: unitPrice, addedAt: new Date(), billingCycle });
      }
    }

    let appliedCoupon = null;
    let couponResult = null;
    if (couponCode) {
      const lineItems = [
        { key: planId, type: 'plan', amount: basePrice },
        ...activeAddons.map((a) => ({ key: a.addonKey, type: 'addon', amount: a.quantity * a.pricePerUnit })),
      ];
      couponResult = await validateAndPriceCoupon(couponCode, {
        organizationId: req.user.organization,
        planId,
        billingCycle,
        lineItems,
      });
      if (!couponResult.valid) {
        return res.status(400).json({ error: couponResult.reason });
      }
    }

    // Referee's immediate first-invoice discount (§3.6b) — corrects an
    // earlier design conclusion. Previously, BOTH sides of a qualifying
    // referral got a deferred Reward for their own next purchase, because
    // pre-CAW, a fresh signup was a fixed recurring Razorpay Plan with no way
    // to discount it (see maybeQualifyReferral's own comment, now stale).
    // Post-CAW, createSubscription prices through calculateInvoice() with
    // real resolvedModifiers — so the referee's benefit is applied directly,
    // right here, once, to the invoice that's actually being priced. Built
    // from the pending Referral's program config directly, NOT a Reward/
    // RewardUsage reservation (none exists yet — that mechanism stays
    // exclusive to the referrer's side, unchanged, at settlement).
    const { findPendingReferralForSignup } = require('../utils/referralUtils');
    const pendingReferral = await findPendingReferralForSignup(req.user.organization);

    // This org may ALSO already hold an earned referral Reward of its own
    // (as a referrer — someone they invited already paid, before this org
    // ever created a subscription itself). Reserve-first, same pattern as
    // the upgrade path (line ~1110) — never spend a Reward that hasn't been
    // atomically claimed. Non-fatal on failure: proceed at full price rather
    // than block signup over a reservation race.
    let signupRewardReservation = null;
    try {
      signupRewardReservation = await reserveNextAvailableReward(req.user.organization, { context: 'SIGNUP' });
    } catch (reserveErr) {
      console.error('Referral reservation failed at signup (proceeding at full price):', reserveErr.message);
    }

    // Phase 4: calculateInvoice() is now the pricing authority for this call
    // site (CAW_BILLING_DESIGN.md §4) — the first production caller. Every
    // other billing path (upgrades, add-ons, legacy) still uses
    // buildPricingSnapshot directly until migrated in a later phase.
    // calculateInvoice() takes a subscription-shaped object, not a `plan`
    // doc — pricePerUser here is the plan's base price since the
    // Subscription doesn't exist yet at this point in signup.
    const signupResolvedModifiers = couponResult
      ? [{ type: 'coupon', value: { kind: 'fixed', amount: couponResult.discountAmount }, appliesTo: 'entire_invoice' }]
      : [];
    // Coupon before referral — Stage 6 -> Stage 7 (§3.3), same as every other
    // modifier-construction site tonight; the actual sort is enforced inside
    // calculateInvoice()/buildPricingSnapshot() regardless of push order.
    // A pendingReferral (this org as REFEREE) and an earned Reward (this org
    // as REFERRER) are not mutually exclusive — an org can be both at once —
    // so both are pushed independently; calculateInvoice sums same-type
    // modifiers rather than one clobbering the other.
    if (pendingReferral) {
      signupResolvedModifiers.push(referralModifierFromPendingProgram(pendingReferral.program));
    }
    if (signupRewardReservation) {
      signupResolvedModifiers.push(rewardToModifier(signupRewardReservation.reward));
    }
    const invoice = calculateInvoice({
      subscription: { planName: planId, billingCycle, pricePerUser: basePrice, activeAddons },
      resolvedModifiers: signupResolvedModifiers,
    });
    const totalAmount = invoice.taxable; // pre-GST, post-discount (rupees) — first invoice's own taxable amount, charged today only
    const firstInvoiceRupees = invoice.total; // GST-inclusive (rupees) — what the customer is actually charged

    // Recurring-price-corruption fix (found via live QA): `invoice.taxable`
    // above includes EVERY modifier applied to this first invoice, including
    // one-time-only ones (a first_payment coupon, the referee's first-invoice
    // referral discount) — neither should ever appear in the ongoing
    // recurring price. Subscription.totalAmount is read by every other
    // surface (Manage Subscription, Billing dashboard, PlanCard) as THE
    // recurring amount, so it must be computed separately, excluding any
    // modifier that doesn't survive past this first invoice. Reuses the same
    // eligibility question renewal already asks (isCouponStillEligibleForRenewal)
    // — a durable coupon (lifetime/until_cancelled) still counts; referral is
    // never durable, so it's never included here regardless of type.
    const recurringResolvedModifiers = (couponResult && isCouponStillEligibleForRenewal({ duration: { type: couponResult.coupon.duration?.type || 'lifetime' } }))
      ? [{ type: 'coupon', value: { kind: 'fixed', amount: couponResult.discountAmount }, appliesTo: 'entire_invoice' }]
      : [];
    const recurringInvoice = calculateInvoice({
      subscription: { planName: planId, billingCycle, pricePerUser: basePrice, activeAddons },
      resolvedModifiers: recurringResolvedModifiers,
    });
    const recurringBaseline = recurringInvoice.taxable; // what THIS subscription actually recurs at, from the next cycle onward

    // BILLING_UX_SPEC.md §4 — record the real amount for the org's OWN
    // earned-reward reservation, now that pricing knows it. Skipped when a
    // pendingReferral ALSO applied (this org is simultaneously a fresh
    // referee and an existing referrer, a rare edge case) — both push a
    // type:'referral' modifier, so modifierBreakdown can't be unambiguously
    // attributed to just this reservation in that combination; the history
    // card simply renders without the "Saved ₹X" figure there rather than
    // risk showing the wrong number.
    if (signupRewardReservation && !pendingReferral) {
      const earnedRewardAmount = (invoice.modifierBreakdown || []).filter((m) => m.type === 'referral').reduce((s, m) => s + m.amount, 0);
      if (earnedRewardAmount > 0) {
        await recordRewardUsageAmount(signupRewardReservation.usage._id, earnedRewardAmount);
      }
    }

    if (couponResult) {
      appliedCoupon = {
        couponId: couponResult.coupon._id,
        code: couponResult.coupon.code,
        name: couponResult.coupon.name,
        duration: {
          type: couponResult.coupon.duration?.type || 'lifetime',
          cycles: couponResult.coupon.duration?.cycles ?? null,
        },
        discountAmount: couponResult.discountAmount,
        baseSubtotal: invoice.subtotal,
        recurringSubtotal: recurringBaseline,
        rulesApplied: couponResult.lineItems
          .filter((li) => li.discount > 0)
          .map((li) => ({
            productType: li.type,
            productKey: li.key,
            discountType: li.discountType,
            discountValue: li.discountValue,
            discountAmount: li.discount,
          })),
        // Complete rule set at application time (not just what matched this
        // order) — see the Subscription.js model comment for why.
        fullRulesSnapshot: (couponResult.coupon.rules || []).map((r) => ({
          productType: r.productType,
          productKey: r.productKey,
          discountType: r.discountType,
          discountValue: r.discountValue,
        })),
      };
    }

    // Model 2 (DECIDED — CAW_BILLING_DESIGN.md §6/§7): the Registration Link's
    // authorization transaction charges the real first invoice; the mandate
    // confirms in the background via the token.confirmed webhook (Phase 3).
    const amountPaise = Math.round(firstInvoiceRupees * 100);
    const mandateMaxAmountRupees = computeMandateMaxAmountRupees(firstInvoiceRupees);
    const mandateMaxAmountPaise = Math.round(mandateMaxAmountRupees * 100);

    // `method` and `expire_at` on subscription_registration are both OPTIONAL
    // per the Razorpay SDK's own type definitions (RazorpaySubscriptionRegistrationUpi
    // extends the base request body with nothing extra — confirmed by reading
    // node_modules/razorpay/dist/types/subscriptions.d.ts, not assumed):
    //   - method: ALWAYS sent — see createCheckoutLink (cawAcquisition.js).
    //     Omitting it made Razorpay's hosted page show Cards only, not every
    //     enabled method. The customer picks it at checkout (mandateMethod);
    //     'manual' drops the mandate entirely for a plain payment link.
    //   - expire_at: also omitted — no documented default exists to override,
    //     and there is no product requirement yet for a specific mandate
    //     validity horizon. Only max_amount has a documented Razorpay default
    //     (₹99,000 flat) that we deliberately override below, because a flat
    //     cap independent of the actual invoice size is the wrong default for
    //     a product with variable plan pricing — that's a real engineering
    //     reason, not an invented number.
    const registrationLinkParams = {
      customer: {
        name: req.user.name,
        email: req.user.email,
        // Fix (found via live QA): a bare 10-digit contact with no country
        // code made Razorpay's own hosted page re-prompt for a mobile number
        // it had already been given. Same fix/reasoning as
        // cawAcquisition.js's createRegistrationLinkForOrg — India-only
        // today, prefix only at this Razorpay-request boundary.
        contact: formatContactForRazorpay(req.user.phone), // guaranteed present — validated above
      },
      type: 'link',
      amount: amountPaise,
      currency: 'INR',
      // NOTE: PlanConfig has no `name` field (only `planId`, e.g. "starter") —
      // `plan.name` was always undefined here (confirmed live: "PURPOSE:
      // undefined Plan - monthly" on the actual Razorpay page). Pre-existing
      // bug inherited from the legacy createSubscription's identical line;
      // only fixed here since it's this function's own code — two other
      // occurrences remain in legacy/out-of-scope code (Phase 5's problem).
      description: `${planId.charAt(0).toUpperCase() + planId.slice(1)} Plan - ${billingCycle}`,
      subscription_registration: {
        max_amount: mandateMaxAmountPaise,
      },
      // Razorpay caps `receipt` at 40 chars (confirmed live: "The receipt may
      // not be greater than 40 characters."). A full org ObjectId (24 chars)
      // + prefix + timestamp exceeded that — shortened to fit with margin.
      receipt: `caw-${req.user.organization.toString().slice(-12)}-${Date.now().toString(36)}`,
      email_notify: true,
      sms_notify: false,
      notes: {
        organization_id: req.user.organization.toString(),
        plan_name: planId,
        billing_cycle: billingCycle,
      },
    };
    // expire_by (how long the customer has to complete the link) is optional
    // per Razorpay's API — omitted unless explicitly configured, so Razorpay's
    // own default applies rather than an invented number.
    if (process.env.CAW_REGISTRATION_LINK_EXPIRY_SECONDS) {
      registrationLinkParams.expire_by = Math.floor(Date.now() / 1000) + Number(process.env.CAW_REGISTRATION_LINK_EXPIRY_SECONDS);
    }

    const registrationLink = await createCheckoutLink(registrationLinkParams, req.body.mandateMethod);

    // Subscription created in a pending-mandate state. mandateStatus stays
    // 'pending' until the Phase 3 token.confirmed webhook fires (idempotent
    // AND-gate with payment.captured — see CAW_BILLING_DESIGN.md §7a).
    // NOT activated here; Phase 3 owns activation.
    //
    // WEBHOOK CORRELATION (verified against real captured payloads, not
    // guessed — see webhook-log.jsonl from the validation session):
    //   - registrationLinkId (registrationLink.id, an inv_… id — the
    //     Registration Link IS a Razorpay Invoice) matches
    //     payload.payment.entity.invoice_id on payment.captured. CONFIRMED
    //     exact match on our own test payload. This is the primary key
    //     Phase 3 uses to find this Subscription from a payment.captured
    //     webhook, and that SAME payment.captured payload also carries
    //     payload.payment.entity.token_id — so this one event both identifies
    //     the subscription AND reveals which token belongs to it.
    //   - IMPORTANT, discovered while writing this (not assumed): the
    //     token.confirmed webhook payload has NO correlating field at all —
    //     no customer_id, and entity_id was null on our real payload. It
    //     cannot be matched to a Subscription by itself. Combined with §7a
    //     (order not guaranteed — token.confirmed arrived BEFORE
    //     payment.captured in our own test), Phase 3 will need one of:
    //       (a) buffer token.confirmed events by token id until a later
    //           payment.captured reveals which subscription that token_id
    //           belongs to, then reconcile, or
    //       (b) on payment.captured, actively Fetch Token by the revealed
    //           token_id to read its current status, rather than relying on
    //           matching a separately-arrived token.confirmed event.
    //     This is a real open design question for Phase 3, not solved here —
    //     Phase 2 only needs to persist registrationLinkId, which it does.
    //   - notes.organization_id below is a secondary signal IF Razorpay
    //     propagates registration-link notes down to the resulting
    //     payment/order (NOT verified live — do not rely on it as a sole
    //     mechanism; the invoice_id/token_id keys above are confirmed).
    // mandateExpiresAt is intentionally left unset here (we no longer send
    // expire_at at creation) — Phase 3 sets it from the confirmed token's own
    // expired_at field once token.confirmed arrives (a real value from
    // Razorpay, not one we invented up front).
    const subscription = new Subscription({
      organization: req.user.organization,
      razorpayCustomerId: registrationLink.customer_id,
      registrationLinkId: registrationLink.id,
      mandateStatus: 'pending',
      mandateInitiatedAt: new Date(),
      mandateMaxAmount: mandateMaxAmountRupees,
      billingMode: resolveMandateMethod(req.body.mandateMethod) === 'manual' ? 'manual' : 'autopay',
      planName: planId,
      status: "created",
      paymentStatus: "pending_payment",
      isPaymentConfirmed: false,
      billingCycle,
      pricePerUser: basePrice,
      userCount: 1,
      totalAmount: recurringBaseline,
      activeAddons,
      appliedCoupon,
      pendingReferralRewardUsageId: signupRewardReservation?.usage._id || undefined,
    });

    await subscription.save();

    // Phase 2 (IMPLEMENTATION_PLAN_V1.md §Part 3): additive-only persistence of
    // the invoice already computed above by calculateInvoice() — the smallest,
    // most self-contained caller, per the Phase 2 plan. This write is purely
    // observational: it does not feed back into amountPaise, totalAmount, or
    // anything already charged/persisted above. A failure here must never
    // break signup (mirrors emitBillingEvent's own fire-and-forget discipline,
    // utils/billingEvents.js) — old behavior remains fully authoritative until
    // a later phase actually reads this collection back.
    //
    // ⚠ MIGRATION CONCESSION, NOT FINAL DESIGN: this try/catch is only correct
    // while Subscription remains the sole authoritative commercial record
    // (Phase 2). Once BillingInvoice/CommercialTransaction become authoritative
    // (Phase 4/5, per the write-boundary table), a failed invoice write must
    // become fatal to the request, not silently swallowed — remove this
    // try/catch at that point rather than carrying it forward unexamined.
    try {
      await BillingInvoice.create({
        organization: subscription.organization,
        subscription: subscription._id,
        reason: 'NEW_SUBSCRIPTION',
        // Only identifier available at creation time — the mandate hasn't
        // confirmed yet (Phase 3), so no orderId/paymentId exists. Stored now,
        // cheaply, so Phase 3 never has to backfill/migrate historical
        // invoices to add it later.
        razorpay: { registrationLinkId: registrationLink.id },
        lineItems: invoice.lines,
        subtotal: invoice.subtotal,
        discount: invoice.discount,
        taxable: invoice.taxable,
        gst: invoice.gst,
        total: invoice.total,
        generatedAt: invoice.generatedAt,
        // Immutable per-attempt record of which coupon (if any) actually
        // priced this specific invoice — see the model field's own comment
        // for why this can no longer be recovered from Subscription.appliedCoupon
        // alone once a later attempt overwrites it.
        couponId: appliedCoupon?.couponId || undefined,
        couponCode: appliedCoupon?.code || undefined,
      });
    } catch (err) {
      console.error(
        `BillingInvoice persistence failed (non-fatal, Phase 2 observational write) — organization=${subscription.organization} subscription=${subscription._id}:`,
        err.message
      );
    }

    await emitBillingEvent({
      organization: subscription.organization,
      subscription: subscription._id,
      eventType: 'SUBSCRIPTION_CREATED',
      status: 'completed',
      after: subscription,
      amounts: {
        base: invoice.subtotal,
        discount: appliedCoupon?.discountAmount || 0,
        recurringAfter: recurringBaseline,
      },
      razorpay: { registrationLinkId: registrationLink.id },
      metadata: { planId, billingCycle, couponCode: appliedCoupon?.code || null, onboarding: 'charge_at_will' },
    });

    // BILLING_UX_SPEC.md §5 — the referee's own timeline entry, only emitted
    // when their pending-referral discount actually applied to this invoice
    // (never emitted to the referrer — see the model enum comment).
    if (pendingReferral) {
      const referralDiscountAmount = (invoice.modifierBreakdown || []).filter((m) => m.type === 'referral').reduce((s, m) => s + m.amount, 0);
      if (referralDiscountAmount > 0) {
        await emitBillingEvent({
          organization: subscription.organization,
          subscription: subscription._id,
          eventType: 'REFERRAL_DISCOUNT_APPLIED',
          status: 'completed',
          amounts: { discount: referralDiscountAmount },
          metadata: { referralPercent: pendingReferral.program.rewardType === 'percentage' ? pendingReferral.program.rewardValue : null },
        });
      }
    }

    res.json({
      success: true,
      subscription,
      registrationLink: {
        shortUrl: registrationLink.short_url,
        id: registrationLink.id,
        expireBy: registrationLink.expire_by,
      },
      // BILLING_UX_SPEC.md §1.2 — canonical pricing-breakdown shape, so the
      // frontend's shared Order Summary component renders signup exactly
      // like every other checkout, from this one field.
      pricingBreakdown: toPricingBreakdown(invoice, {
        couponCode: appliedCoupon?.code,
        referralPercent: pendingReferral ? pendingReferral.program.rewardValue : (signupRewardReservation?.reward.rewardType === 'percentage' ? signupRewardReservation.reward.rewardValue : undefined),
      }),
    });
  } catch (error) {
    console.error("CAW onboarding error:", error);
    if (typeof signupRewardReservation !== 'undefined' && signupRewardReservation) {
      try {
        await releaseReservation(signupRewardReservation.usage._id, 'SIGNUP_FAILED');
      } catch (relErr) {
        console.error('Failed to release signup reward reservation after signup error:', relErr.message);
      }
    }
    const razorpayError = error.error?.description || error.error?.reason;
    res.status(500).json({
      error: razorpayError || error.message,
      code: 'RAZORPAY_ERROR',
    });
  }
};

// Redemption must only be counted once payment actually clears, and must be
// idempotent — both the client-side verifyPayment call AND the Razorpay
// webhook can race to confirm the same subscription. Guarded by
// appliedCoupon.redeemed so whichever path runs first "wins" and the second
// is a no-op.
async function maybeRecordCouponRedemption(subscription, checkoutType = 'new_subscription') {
  if (!subscription.appliedCoupon?.couponId || subscription.appliedCoupon.redeemed) return;
  const coupon = await Coupon.findById(subscription.appliedCoupon.couponId);
  if (!coupon) return;
  await recordRedemption({
    coupon,
    organizationId: subscription.organization,
    subscriptionId: subscription._id,
    context: { planId: subscription.planName, billingCycle: subscription.billingCycle, checkoutType },
    baseAmount: subscription.totalAmount + subscription.appliedCoupon.discountAmount,
    discountAmount: subscription.appliedCoupon.discountAmount,
  });
  subscription.appliedCoupon.redeemed = true;
  await subscription.save();
}

// C1 — Coupon replacement (found via live QA: a subscriber whose first_payment
// coupon already fired, or who simply wants a different coupon, had no way to
// detach it and attach another; appliedCoupon was write-once). Two
// deliberately separate endpoints rather than one "PATCH" verb, matching the
// distinct actions a Manage Subscription UI would expose (Remove vs. Replace).
//
// CRITICAL INVARIANT, per the explicit trace done before building this:
// Subscription.appliedCoupon is a mutable, swappable POINTER to "what
// currently affects this subscription's future pricing" — CouponRedemption
// (backend/models/CouponRedemption.js) is the SEPARATE, permanent audit
// record of "this org used this coupon once." Neither function here ever
// deletes/decrements a CouponRedemption row or a Coupon's analytics counters
// — removing/replacing the pointer can never un-redeem history or free up a
// redemption slot. Confirmed structurally safe by trace: evaluateOrderEligibility's
// maxRedemptions/maxRedemptionsPerOrganization checks read Coupon.analytics
// and CouponRedemption.countDocuments(...) exclusively, never Subscription.appliedCoupon.
//
// Both require an already-PAID subscription — this is explicitly the
// post-purchase replacement scenario, not a substitute for the
// signup/trial-conversion coupon-application path.
// Shared pricing helpers — used by BOTH the mutating endpoints below AND
// their preview-only counterparts, so there is exactly one place that
// computes "what would the recurring baseline become," never a second
// frontend-side reimplementation (the explicit architectural requirement
// this round: backend remains the sole pricing authority; previews call the
// same code the real mutation calls, just without persisting).
function computeRecurringWithoutCoupon(subscription) {
  const invoice = calculateInvoice({
    subscription: {
      planName: subscription.planName,
      billingCycle: subscription.billingCycle,
      pricePerUser: subscription.pricePerUser,
      activeAddons: subscription.activeAddons,
    },
    resolvedModifiers: [],
  });
  return invoice.taxable;
}

// Validates couponCode against this subscription's org/plan/add-ons, builds
// the full replacement appliedCoupon snapshot, and computes what the
// recurring baseline would become — without persisting anything. Returns
// { valid, reason } on failure, or { valid: true, newAppliedCoupon,
// recurringAfter } on success.
async function resolveCouponReplacement(subscription, couponCode, organizationId) {
  const lineItems = [
    { key: subscription.planName, type: 'plan', amount: subscription.pricePerUser },
    ...(subscription.activeAddons || []).map((a) => ({ key: a.addonKey, type: 'addon', amount: a.quantity * a.pricePerUnit })),
  ];
  const couponResult = await validateAndPriceCoupon(couponCode, {
    organizationId,
    planId: subscription.planName,
    billingCycle: subscription.billingCycle,
    lineItems,
  });
  if (!couponResult.valid) return { valid: false, reason: couponResult.reason };

  const newAppliedCoupon = {
    couponId: couponResult.coupon._id,
    code: couponResult.coupon.code,
    name: couponResult.coupon.name,
    duration: {
      type: couponResult.coupon.duration?.type || 'lifetime',
      cycles: couponResult.coupon.duration?.cycles ?? null,
    },
    discountAmount: couponResult.discountAmount,
    baseSubtotal: lineItems.reduce((s, i) => s + i.amount, 0),
    rulesApplied: couponResult.lineItems
      .filter((li) => li.discount > 0)
      .map((li) => ({
        productType: li.type,
        productKey: li.key,
        discountType: li.discountType,
        discountValue: li.discountValue,
        discountAmount: li.discount,
      })),
    // Complete rule set at application time — same reason every other
    // application site stores this (Subscription.js model comment):
    // renewal/upgrade/add-on pricing must re-derive from the FULL rule
    // set, never just the line items this one order happened to touch.
    fullRulesSnapshot: (couponResult.coupon.rules || []).map((r) => ({
      productType: r.productType,
      productKey: r.productKey,
      discountType: r.discountType,
      discountValue: r.discountValue,
    })),
    redeemed: false,
  };

  // Recurring-price-corruption discipline (Bug 1) applies here too: a
  // first_payment coupon attached via this endpoint has no future invoice
  // left to discount (there's no "first payment" left to happen), so it
  // must NOT affect the recurring baseline — isCouponStillEligibleForRenewal
  // is the same eligibility question renewal/upgrade/add-on already ask.
  const recurringEligible = isCouponStillEligibleForRenewal(newAppliedCoupon);
  const recurringModifiers = recurringEligible
    ? [{ type: 'coupon', value: { kind: 'fixed', amount: couponResult.discountAmount }, appliesTo: 'entire_invoice' }]
    : [];
  const recurringInvoice = calculateInvoice({
    subscription: {
      planName: subscription.planName,
      billingCycle: subscription.billingCycle,
      pricePerUser: subscription.pricePerUser,
      activeAddons: subscription.activeAddons,
    },
    resolvedModifiers: recurringModifiers,
  });
  newAppliedCoupon.recurringSubtotal = recurringInvoice.taxable;

  return { valid: true, newAppliedCoupon, recurringAfter: recurringInvoice.taxable, recurringEligible };
}

exports.removeAppliedCoupon = async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ organization: req.user.organization });
    if (!subscription) return res.status(404).json({ error: 'Subscription not found' });
    if (!subscription.isPaymentConfirmed) return res.status(400).json({ error: 'Complete your first payment before managing coupons.' });
    if (!subscription.appliedCoupon?.code) return res.status(400).json({ error: 'No coupon is currently applied.' });

    const beforeSnapshot = subscription.toObject();
    const removedCode = subscription.appliedCoupon.code;
    const recurringAfter = computeRecurringWithoutCoupon(subscription);

    // Mongoose quirk: assigning `null` directly to a single-nested-subdocument
    // path (appliedCoupon is a plain nested object, not Schema.Types.Mixed)
    // doesn't reliably clear it on save — `undefined` + markModified does.
    subscription.appliedCoupon = undefined;
    subscription.markModified('appliedCoupon');
    subscription.totalAmount = recurringAfter;
    await subscription.save();

    await emitBillingEvent({
      organization: subscription.organization,
      subscription: subscription._id,
      eventType: 'COUPON_REMOVED',
      status: 'completed',
      before: beforeSnapshot,
      after: subscription,
      amounts: { recurringBefore: beforeSnapshot.totalAmount, recurringAfter: subscription.totalAmount },
      metadata: { couponCode: removedCode },
    });

    res.json({ success: true, subscription });
  } catch (error) {
    console.error('Remove coupon error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Preview-only twin of removeAppliedCoupon — same computeRecurringWithoutCoupon
// call, no persistence, no BillingEvent. Lets the frontend show an honest
// "removing this will change your recurring amount from X to Y" confirmation
// without running any pricing math of its own.
exports.previewRemoveCoupon = async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ organization: req.user.organization });
    if (!subscription) return res.status(404).json({ error: 'Subscription not found' });
    if (!subscription.appliedCoupon?.code) return res.status(400).json({ error: 'No coupon is currently applied.' });

    const recurringBefore = subscription.totalAmount;
    const recurringAfter = computeRecurringWithoutCoupon(subscription);
    res.json({
      couponCode: subscription.appliedCoupon.code,
      recurringBefore,
      recurringAfter,
      willChangeRecurring: recurringAfter !== recurringBefore,
    });
  } catch (error) {
    console.error('Preview remove coupon error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.replaceAppliedCoupon = async (req, res) => {
  try {
    const { couponCode } = req.body;
    if (!couponCode) return res.status(400).json({ error: 'Coupon code is required' });

    const subscription = await Subscription.findOne({ organization: req.user.organization });
    if (!subscription) return res.status(404).json({ error: 'Subscription not found' });
    if (!subscription.isPaymentConfirmed) return res.status(400).json({ error: 'Complete your first payment before managing coupons.' });

    const beforeSnapshot = subscription.toObject();
    const resolved = await resolveCouponReplacement(subscription, couponCode, req.user.organization);
    if (!resolved.valid) return res.status(400).json({ error: resolved.reason });

    const previousCouponCode = subscription.appliedCoupon?.code || null;
    subscription.appliedCoupon = resolved.newAppliedCoupon;
    subscription.totalAmount = resolved.recurringAfter;
    await subscription.save();

    // Redemption recorded immediately — unlike a signup/upgrade coupon
    // (settled later, at first-payment-captured time), there is no future
    // "payment" event this action is waiting on; the coupon takes effect on
    // future recurring billing the instant it's attached. Never touches the
    // PREVIOUS coupon's own CouponRedemption row.
    await maybeRecordCouponRedemption(subscription, 'coupon_replace');

    await emitBillingEvent({
      organization: subscription.organization,
      subscription: subscription._id,
      eventType: 'COUPON_CHANGED',
      status: 'completed',
      before: beforeSnapshot,
      after: subscription,
      amounts: { recurringBefore: beforeSnapshot.totalAmount, recurringAfter: subscription.totalAmount, discount: resolved.newAppliedCoupon.discountAmount },
      metadata: { previousCouponCode, newCouponCode: resolved.newAppliedCoupon.code },
    });

    res.json({ success: true, subscription });
  } catch (error) {
    console.error('Replace coupon error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Preview-only twin of replaceAppliedCoupon — validates the new coupon and
// computes the would-be recurring amount via the exact same
// resolveCouponReplacement() helper, no persistence, no redemption record,
// no BillingEvent. Also reports whether the new coupon would even affect
// recurring billing at all (a first_payment coupon attached post-purchase
// correctly reports recurringEligible: false), so the frontend can show the
// right confirmation copy before committing.
exports.previewReplaceCoupon = async (req, res) => {
  try {
    const { couponCode } = req.body;
    if (!couponCode) return res.status(400).json({ error: 'Coupon code is required' });

    const subscription = await Subscription.findOne({ organization: req.user.organization });
    if (!subscription) return res.status(404).json({ error: 'Subscription not found' });
    if (!subscription.isPaymentConfirmed) return res.status(400).json({ error: 'Complete your first payment before managing coupons.' });

    const resolved = await resolveCouponReplacement(subscription, couponCode, req.user.organization);
    if (!resolved.valid) return res.status(400).json({ error: resolved.reason });

    res.json({
      couponCode: resolved.newAppliedCoupon.code,
      couponName: resolved.newAppliedCoupon.name,
      recurringBefore: subscription.totalAmount,
      recurringAfter: resolved.recurringAfter,
      recurringEligible: resolved.recurringEligible,
      discountAmount: resolved.newAppliedCoupon.discountAmount,
    });
  } catch (error) {
    console.error('Preview replace coupon error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Qualifies a pending Referral the moment the REFERRED organization's first
// payment is confirmed, and creates ONE immutable Reward — for the referrer
// (Alice, the one who shared the code) only. This is the ONLY place a Reward
// may be created for source: 'REFERRAL' (settlement owns this, never the
// signup code-entry step — see backend/docs/REFERRAL_SYSTEM_DESIGN.md §3/§16).
//
// CORRECTED (previously created a second Reward here for the referred org,
// Bob, deferred to Bob's own next purchase — a workaround from when a fresh
// signup was a fixed recurring Razorpay Plan with no way to discount it, per
// the old PROJECT_STATE.md §11 comment this replaced). Post-CAW, Bob's
// benefit is applied directly to his own first invoice at signup pricing
// time (createSubscription, via utils/referralUtils.js's
// findPendingReferralForSignup() + utils/modifierResolver.js's
// referralModifierFromPendingProgram()) — a real discount on real money he
// pays, not a free unlock. Creating a second deferred Reward for Bob here
// would double his benefit (immediate signup discount AND a future-purchase
// reward from the same referral) — one benefit per participant: the
// referrer gets a deferred Reward, the referee's immediate signup discount
// IS their reward. Confirmed by grep: no other backend/frontend code
// assumes exactly two Reward rows per qualified referral — admin
// grant/revoke and the org-facing dashboard both operate generically over
// however many Reward documents exist.
//
// Mirrors maybeRecordCouponRedemption's idempotency: called from all three
// racing payment-confirmation paths (verifyPayment, subscription.authenticated,
// payment.captured), guarded so only the first one to run does anything.
async function maybeQualifyReferral(subscription) {
  const referral = await Referral.findOne({
    referredOrganization: subscription.organization,
    status: 'pending',
  });
  if (!referral) return;

  referral.status = 'qualified';
  referral.qualifiedAt = new Date();
  await referral.save();

  const { getOrCreateReferralProgram } = require('../utils/referralUtils');
  const program = await getOrCreateReferralProgram(referral.referrerOrganization);
  if (!program.enabled) return; // disabled after the referral was entered — referral still recorded, no reward

  const expiresAt = program.expiryDurationDays
    ? new Date(Date.now() + program.expiryDurationDays * 24 * 60 * 60 * 1000)
    : null; // null = never expires, the deliberate default

  const rewardRecipients = [
    { organization: referral.referrerOrganization, role: 'referrer' },
  ];

  for (const recipient of rewardRecipients) {
    const reward = await Reward.create({
      organization: recipient.organization,
      referral: referral._id,
      source: 'REFERRAL',
      rewardType: program.rewardType,
      rewardValue: program.rewardValue,
      maxRewardAmount: program.maxRewardAmount,
      expiresAt,
    });

    await emitBillingEvent({
      organization: recipient.organization,
      eventType: 'REFERRAL_REWARD_EARNED',
      status: 'completed',
      metadata: {
        referralId: referral._id,
        rewardId: reward._id,
        rewardType: reward.rewardType,
        rewardValue: reward.rewardValue,
        role: recipient.role, // 'referrer' or 'referee' — which side of the referral this reward belongs to
      },
    });
  }
}

// Single settlement hook for the FIRST successful payment of a subscription.
// Every payment-confirmation path (verifyPayment + the four webhook handlers:
// payment.captured, subscription.authenticated, subscription.activated,
// subscription.charged) MUST funnel through this, so post-payment side
// effects happen exactly once regardless of which path Razorpay's async
// events take. Razorpay does NOT guarantee ordering — for UPI AutoPay the
// confirming event is usually `subscription.charged`, for card it's often
// `payment.captured`/`verifyPayment` — so wiring these into only some paths
// silently drops them for the others (this is exactly how referral
// qualification was missed for UPI orgs; see PROJECT_STATE.md §11).
//
// Every callee here is idempotent (maybeQualifyReferral only acts on a
// `pending` referral; maybeRecordCouponRedemption only on an unredeemed
// coupon), so calling this from multiple racing paths — including the
// "already confirmed" early-return branches — is safe by design. Add future
// post-first-payment effects (loyalty credits, welcome gifts, affiliate
// payouts) HERE, in one place, not scattered across five handlers.
async function runFirstPaymentSettlement(subscription) {
  // Phase 1 of annual-billing groundwork (docs/audit/ANNUAL_BILLING_SCOPE.md).
  // This function is the one confirmed funnel point every first-payment path
  // (fresh signup, trial conversion, legacy paths) already calls through, so
  // it's the correct single write site for billingAnchor rather than adding
  // it at each of the ~6 isPaymentConfirmed=true call sites individually.
  // Guarded by "only if not already set" as defense in depth alongside the
  // schema's own `immutable: true` — this function is deliberately called
  // from multiple racing paths, so it must never assume it's the first call.
  if (!subscription.billingAnchor) {
    subscription.billingAnchor = new Date();
    try {
      await subscription.save();
    } catch (err) {
      console.error(`runFirstPaymentSettlement: billingAnchor save failed for ${subscription._id}:`, err.message);
    }
  }
  try {
    await maybeRecordCouponRedemption(subscription);
  } catch (err) {
    console.error(`runFirstPaymentSettlement: coupon redemption failed for ${subscription._id}:`, err.message);
  }
  try {
    await maybeQualifyReferral(subscription);
  } catch (err) {
    console.error(`runFirstPaymentSettlement: referral qualification failed for ${subscription._id}:`, err.message);
  }
  // Consumes this org's OWN earned-reward reservation (reserved as referrer,
  // at createSubscription or trial-conversion pricing time — see
  // pendingReferralRewardUsageId's model comment). Idempotent via
  // consumeReservation's own guard, so safe across the same racing
  // confirmation paths as the two settlement steps above.
  if (subscription.pendingReferralRewardUsageId) {
    try {
      await consumeReservation(subscription.pendingReferralRewardUsageId);
      subscription.pendingReferralRewardUsageId = undefined;
      await subscription.save();
    } catch (err) {
      console.error(`runFirstPaymentSettlement: reward consumption failed for ${subscription._id}:`, err.message);
    }
  }
}
// ============================================================
// 1. Add this helper near the top of subscriptionController.js
// ============================================================

// Exported for the one-time backfill script (scripts/backfillQualify.js),
// which qualifies referrals stranded by the pre-fix settlement race. Not a
// route handler — kept internal to the settlement flow otherwise.
exports.maybeQualifyReferral = maybeQualifyReferral;
// Exported for the same reason — fixture verification of settlement
// (coupon redemption + referral qualification + earned-reward consumption)
// without needing a live Razorpay webhook round-trip.
exports.runFirstPaymentSettlement = runFirstPaymentSettlement;

/**
 * Single source of truth for app-level subscription status.
 * Call this instead of setting subscription.status directly anywhere
 * lifecycle-meaningful changes happen.
 */
function setAppStatus(subscription, newStatus, reason = "") {
  const validStatuses = [
    "trial",
    "active",
    "past_due",
    "cancelled",
    "expired",
    "suspended",
  ];
  if (!validStatuses.includes(newStatus)) {
    throw new Error(`Invalid appStatus: ${newStatus}`);
  }

  const previous = subscription.appStatus;
  if (previous === newStatus) return; // no-op, avoid noisy logs/emails

  subscription.appStatus = newStatus;
  subscription.appStatusHistory = subscription.appStatusHistory || [];
  subscription.appStatusHistory.push({
    from: previous,
    to: newStatus,
    reason,
    at: new Date(),
  });

  console.log(
    `[Subscription ${subscription._id}] appStatus: ${previous} -> ${newStatus} (${reason})`
  );

  // Hook point for Step 4 (emails) later — leave as a TODO marker for now:
  // await triggerLifecycleEmail(subscription, newStatus);
}

// ============================================================
// 2. Add to your Mongoose Subscription schema (models/Subscription.js)
// ============================================================
/*
appStatus: {
  type: String,
  enum: ["trial", "active", "past_due", "cancelled", "expired", "suspended"],
  default: "trial",
},
appStatusHistory: [
  {
    from: String,
    to: String,
    reason: String,
    at: Date,
  },
],
*/

// ============================================================
// 3. Wire it into existing functions — minimal diffs shown below
// ============================================================

// --- startFreeTrial ---
// after creating `subscription` and before/after .save():
//   setAppStatus(subscription, "trial", "trial started");

// --- handlePaymentCaptured (pendingUpgrade branch) ---
//   setAppStatus(subscription, "active", "upgrade payment captured");

// --- handleSubscriptionAuthenticated ---
//   setAppStatus(subscription, "active", "razorpay subscription authenticated");

// --- handleSubscriptionActivated ---
//   setAppStatus(subscription, "active", "razorpay subscription activated");

// --- handlePaymentFailed --- (this is the important new one)
async function handlePaymentFailed(razorpayPayment) {
  const subscription = await Subscription.findOne({
    razorpaySubscriptionId: razorpayPayment.notes?.subscription_id,
  });

  if (subscription) {
    subscription.paymentStatus = "payment_failed";
    subscription.isPaymentConfirmed = false;
    subscription.lastPaymentAttempt = {
      razorpayPaymentId: razorpayPayment.id,
      amount: razorpayPayment.amount,
      attemptedAt: new Date(),
      status: "failed",
    };

    // NEW: move to past_due instead of leaving status untouched.
    // past_due != suspended — user still has access during grace period.
    setAppStatus(subscription, "past_due", "payment failed");

    await subscription.save();
    console.log(`Payment failed for subscription ${subscription._id}`);
  }
}

// --- handleSubscriptionCharged --- (recovery path: past_due -> active)
//   setAppStatus(subscription, "active", "subscription charged successfully");

// --- handleSubscriptionCancelled ---
//   if (now < periodEnd) {
//     subscription.cancelAtPeriodEnd = true;
//     // stays "active" until period actually ends — don't change appStatus yet
//   } else {
//     setAppStatus(subscription, "cancelled", "period ended after cancellation");
//   }

// --- handleSubscriptionHalted --- (Razorpay gives up after its own retries)
async function handleSubscriptionHalted(razorpaySubscription) {
  const subscription = await Subscription.findOne({
    razorpaySubscriptionId: razorpaySubscription.id,
  });

  if (subscription) {
    subscription.status = "halted";
    setAppStatus(subscription, "suspended", "razorpay halted subscription after retries");
    await subscription.save();
  }
}

// Get available plans
exports.getPlans = async (req, res) => {
  try {
    const plans = await PlanConfig.find({ isActive: true }).sort({ monthlyPrice: 1 });

    const formatted = plans.map((plan) => {
      const f = plan.features || {};
      const modules = f.modules || {};

      const features = [];
      if (f.emailTemplates) features.push({ name: `${f.emailTemplates} Email Template${f.emailTemplates > 1 ? 's' : ''}` });
      if (f.salesPipelines) features.push({ name: `${f.salesPipelines} Sales Pipeline${f.salesPipelines > 1 ? 's' : ''}` });
      if (f.customFields)   features.push({ name: `${f.customFields} Custom Fields` });
      if (f.recordTags)     features.push({ name: `${f.recordTags} Record Tags` });
      if (f.websiteForms)   features.push({ name: `${f.websiteForms} Website Form${f.websiteForms > 1 ? 's' : ''}` });
      if (f.fileStorage) {
        const gb = Math.round(f.fileStorage / (1024 * 1024 * 1024));
        features.push({ name: `${gb} GB File Storage` });
      }
      Object.entries(modules).forEach(([mod, cfg]) => {
        if (!cfg || (!cfg.read && !cfg.write)) return;
        if (cfg.limit !== undefined) {
          const label = mod.replace(/-/g, ' ');
          const displayLabel = label.charAt(0).toUpperCase() + label.slice(1);
          const limitStr = cfg.limit === 'unlimited' ? 'Unlimited' : Number(cfg.limit).toLocaleString('en-IN');
          features.push({ name: `${limitStr} ${displayLabel}` });
        }
      });
      if (f.rottenDeals)     features.push({ name: 'Rotten Deals tracking' });
      if (f.advancedReports) features.push({ name: 'Advanced Reports' });
      features.push({ name: '24x7 Support' });

      return {
        id: plan.planId,
        planId: plan.planId,
        name: plan.planId.charAt(0).toUpperCase() + plan.planId.slice(1),
        monthlyPrice: plan.monthlyPrice,
        yearlyPrice: plan.yearlyPrice,
        yearlyPerMonth: Math.round(plan.yearlyPrice / 12),
        discount: plan.discount,
        isActive: plan.isActive,
        features,
        modules,
        limits: {
          emailTemplates:  f.emailTemplates  || 0,
          salesPipelines:  f.salesPipelines  || 0,
          customFields:    f.customFields    || 0,
          recordTags:      f.recordTags      || 0,
          websiteForms:    f.websiteForms    || 0,
          fileStorage:     f.fileStorage     || 0,
          rottenDeals:     !!f.rottenDeals,
          advancedReports: !!f.advancedReports,
        },
      };
    });

    res.json({ plans: formatted });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get current subscription
exports.getCurrentSubscription = async (req, res) => {
  try {
    if (!req.user) {
      return res.json({
        hasSubscription: false,
        trialEligible: true,
      });
    }

    const subscription = await Subscription.findOne({
      organization: req.user.organization,
    }).populate("organization");

    if (!subscription) {
      return res.json({
        hasSubscription: false,
        trialEligible: true,
      });
    }

    // One-shot dashboard notice for super-admin-initiated changes — read it
    // once, then clear it in the DB so it never shows again on a later load.
    const adminNotice = subscription.adminNotice?.message
      ? subscription.adminNotice
      : null;
    if (adminNotice) {
      subscription.adminNotice = undefined;
      await subscription.save();
    }

    // Only return subscription as active if payment is confirmed
    if (!subscription.isPaymentConfirmed) {
      return res.json({
        hasSubscription: true,
        subscription: {
          ...subscription.toObject(),
          isActive: false,
          pendingPayment: true,
          adminNotice,
        },
        trialEligible: !subscription.trialUsed,
      });
    }

    res.json({
      hasSubscription: true,
      subscription: {
        ...subscription.toObject(),
        isActive: true,
        adminNotice,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Start free trial
exports.startFreeTrial = async (req, res) => {
  try {
    // Check trialUsed across every Subscription document this org has ever
    // had (not just findOne's arbitrary pick) — an org can accumulate more
    // than one historical document (cancelled/expired ones are allowed to
    // coexist with a new current one, see the BUG-002 partial unique index
    // below), and trialUsed is a permanent per-organization flag: if any of
    // them ever started a trial, this org has used its one free trial.
    const trialAlreadyUsed = await Subscription.exists({
      organization: req.user.organization,
      trialUsed: true,
    });

    if (trialAlreadyUsed) {
      return res.status(400).json({
        error: "Free trial already used for this organization",
      });
    }

    const trialStart = new Date();
    const trialEnd = new Date(trialStart.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // const growthPlan = await PlanConfig.findOne({ planId: "growth" });

    const subscription = new Subscription({
      organization: req.user.organization,
      razorpayPlanId: "plan_trial",
      planName: "growth",
      status: "active",
      billingCycle: "monthly",
      pricePerUser: 0,
      userCount: 1,
      totalAmount: 0,
      trialStart,
      trialEnd,
      isTrialActive: true,
      trialUsed: true,
      currentPeriodStart: trialStart,
      currentPeriodEnd: trialEnd,
    });

    setAppStatus(subscription, "trial", "trial started");

    await subscription.save();

    await emitBillingEvent({
      organization: subscription.organization,
      subscription: subscription._id,
      eventType: 'TRIAL_STARTED',
      status: 'completed',
      effectiveAt: trialEnd,
      after: subscription,
    });

    // Send trial-started confirmation email. Wrapped so an email failure
    // never blocks the actual trial from starting — it's already saved above.
    try {
      const organization = await Organization.findById(req.user.organization);
      await sendTrialStartedEmail(req.user, organization, trialEnd, subscription.planName);
    } catch (emailError) {
      console.error('Failed to send trial-started email:', emailError);
    }

    // 10 sample rows each of Company/Contact/Deal/Invoice/Task/Note so a
    // brand-new trial account isn't a blank slate. Only ever called from
    // here — an org that never starts a trial never gets this data, so it
    // stays genuinely empty. Wrapped for the same reason as the email above:
    // a seeding failure must never block the trial itself from starting.
    try {
      await seedTrialData({ organization: req.user.organization, user: req.user._id });
    } catch (seedError) {
      console.error('Failed to seed trial demo data:', seedError);
    }

    res.json({
      success: true,
      message: "Free trial started successfully",
      subscription,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Phase 7 cleanup: legacyCreateSubscription_DEPRECATED removed here —
// confirmed zero callers anywhere in the codebase (it was unexported,
// unrouted, and explicitly marked for Phase 8 deletion; removed now as part
// of the Phase 7 dead-code cleanup pass rather than waiting further).

// Enhanced updateSubscription method
exports.updateSubscription = async (req, res) => {
  try {
    const { planId, billingCycle, addons = [], couponCode } = req.body;
    const subscription = await Subscription.findOne({
      organization: req.user.organization,
    });
    
    if (!subscription) {
      return res.status(404).json({ error: "No active subscription found" });
    }

    if (subscription.cancelAtPeriodEnd) {
      // Task B (Aug 2026): picking a new plan while a cancellation is
      // scheduled implicitly cancels that cancellation and proceeds — same
      // precedent as the Monthly->Annual transition superseding a pending
      // PLAN_CHANGE/BILLING_CYCLE_CHANGE. Opt-in via reactivateAndProceed so
      // this remains a hard block by default (every existing caller that
      // doesn't know about this flag keeps the old, safer behavior).
      if (!req.body.reactivateAndProceed) {
        return res.status(400).json({
          error: 'Your subscription is scheduled to cancel at the end of the billing period. Reactivate your subscription before making changes.',
          code: 'CANCELLATION_PENDING',
        });
      }
      subscription.cancelAtPeriodEnd = false;
      await ScheduledChange.updateMany(
        { subscription: subscription._id, type: 'CANCELLATION', status: 'PENDING' },
        { $set: { status: 'CANCELLED' } }
      );
    }

    // Freeze rule: no plan change (upgrade or downgrade) while a downgrade is
    // already scheduled. Cancelling the scheduled downgrade (a separate
    // endpoint) or cancelling the subscription outright remain the only
    // escape hatches — neither goes through this function.
    try {
      require('../utils/downgradeValidator').assertNotFrozen(subscription);
    } catch (freezeErr) {
      return res.status(400).json({ error: freezeErr.message, code: freezeErr.code });
    }

    // Fetch current subscription details from Razorpay to check payment mode
    let razorpaySubscription = null;
    if (subscription.razorpaySubscriptionId) {
      razorpaySubscription = await razorpay.subscriptions.fetch(subscription.razorpaySubscriptionId);
    }

    // Determine payment mode - adapt according to Razorpay API response structure
    const paymentMode = razorpaySubscription?.payment_method ||
      (razorpaySubscription?.mandate?.type) ||
      null;

    // ────────────────────────────────────────────────────────────────
    // UPGRADE PATH — prorated Order, no cancel-and-recreate, UPI-compatible.
    // Detected here (before the UPI cancel-and-recreate fallback) so that
    // upgrades NEVER take that path. Downgrades and billing-cycle changes
    // fall through unchanged.
    // ────────────────────────────────────────────────────────────────
    if (subscription.isPaymentConfirmed) {
      const currentPlanUpg = await PlanConfig.findOne({ planId: subscription.planName, isActive: true });
      const newPlanUpg = await PlanConfig.findOne({ planId, isActive: true });
      if (!newPlanUpg) return res.status(404).json({ error: "Plan not found" });

      const planPriorityUpg = { starter: 1, growth: 2, business: 3 };
      const isBillingCycleChangeUpg = subscription.billingCycle !== billingCycle;
      const isTierUpgrade =
        (planPriorityUpg[planId] || 0) > (planPriorityUpg[subscription.planName] || 0);

      // Only intercept true tier upgrades on the SAME billing cycle. Billing-cycle
      // changes and downgrades continue to the existing (unchanged) logic below.
      if (isTierUpgrade && !isBillingCycleChangeUpg) {
        // Plan Upgrade Stage 5 per-item pricing — oldTotal/newTotal were both
        // already computed via calculateInvoice() (which already supports
        // resolvedModifiers, proven at signup/renewal/add-on purchase); the
        // only gap was that neither call was ever given a coupon modifier.
        // Built here from each side's own REAL line items against the frozen
        // appliedCoupon.fullRulesSnapshot (never the live Coupon — same
        // immutability principle as duration/R7) via the same priceLineItems()
        // primitive already proven correct at signup and add-on purchase (Brief 1)
        // — no new matching logic, calculateCommercialAdjustments()/
        // calculatePlanUpgradeProration() themselves need zero changes.
        // CP3 falls out for free: if the coupon doesn't cover the OLD plan,
        // oldModifiers is null/no-op; if it doesn't cover the NEW plan,
        // newModifiers is null/no-op — no special "does this still apply"
        // branch anywhere, the same per-item pricing call already answers it.
        const oldLineItems = [
          { key: subscription.planName, type: 'plan', amount: subscription.pricePerUser },
          ...(subscription.activeAddons || []).map((a) => ({ key: a.addonKey, type: 'addon', amount: a.quantity * a.pricePerUnit })),
        ];
        const oldCouponModifier = (subscription.appliedCoupon?.fullRulesSnapshot && isCouponStillEligibleForRenewal(subscription.appliedCoupon))
          ? buildCouponModifierForLineItems(subscription.appliedCoupon.fullRulesSnapshot, oldLineItems)
          : null;

        // oldTotal = what the org has ALREADY PAID FOR and is still entitled to
        // THIS CYCLE. Any scheduled removals have not executed yet, so this must
        // come from the current (raw) subscription, never the future-effective
        // snapshot — the org is still using and paying for those seats today.
        const oldTotal = calculateInvoice({
          subscription,
          resolvedModifiers: oldCouponModifier ? [oldCouponModifier] : [],
        }).taxable;
        const newBasePrice = billingCycle === 'monthly'
          ? newPlanUpg.monthlyPrice
          : newPlanUpg.yearlyPrice;

        // upgradeTargetSubscription — the ONE object this checkout prices.
        // Built as: current subscription -> surviving scheduled removals
        // carried forward (via buildEffectiveSubscription's future-horizon
        // projection -> classified against the new plan -> user's
        // newly-selected add-ons layered on top. Every downstream value
        // (targetRecurringTotal, carriedForwardAddons, proration) is derived
        // from THIS object — never mixed with oldTotal's current-cycle
        // snapshot. (buildEffectiveSubscription's future-horizon projection
        // is deliberately NOT used to compute carry-forward quantity here
        // anymore — see the fix note below on `compatible`.)

        // Classify against the RAW current add-ons (full quantity the org is
        // actually using and has paid for today), NOT the future-effective
        // (already-reduced) snapshot. Using the effective snapshot here was a
        // real bug: an addon becoming incompatible would only ever be seen at
        // its POST-pending-removal quantity, so e.g. Seat x2 with 1 already
        // scheduled for removal would classify as incompatible x1 instead of
        // x2 — silently shrinking real, already-paid-for entitlement.
        const rawActiveAddons = subscription.activeAddons || [];
        const { compatible: rawCompatible, incompatible } = await classifyAddonsForPlanChange(
          rawActiveAddons, planId, billingCycle
        );
        // Live-QA correctness fix (Aug 2026), confirmed via a real reported
        // incident (Seat×2, 1 scheduled for removal, upgrading Starter->Growth
        // silently landed on Seat×1 immediately — a full unit of already-paid
        // entitlement vanished before its scheduled date). This block used to
        // remap `compatible`'s quantity through effectiveQuantityByKey (the
        // POST-scheduled-removal snapshot), on the theory that "carry-forward
        // should already reflect the pending removal." That's wrong: a
        // scheduled removal is FUTURE state — the org keeps its full current
        // entitlement (rawCompatible's own quantity, already correct) right
        // up until the removal's effective date, exactly like `oldTotal`
        // above already treats it, and regardless of what the base plan is
        // doing in between. The existing ScheduledChange/pendingAddonRemovals
        // record for this addonKey is untouched by this change and continues
        // ticking down independently after the upgrade commits — same
        // "a base-plan change never touches an add-on's own scheduled
        // removal" rule this session settled for the annual cycle-transition
        // case, now applied consistently to upgrade too.
        const compatible = rawCompatible;

        // Editable carry-forward: the user may reduce (down to 0) how much of
        // each compatible add-on continues after the upgrade. req.body.carryForward
        // is keyed by the post-remap addonKey (i.e. compatible[].addonKey — the
        // same key the checkout UI displays as carriedForwardAddons), matching
        // what the user actually sees. Quantity is clamped to [0, survived
        // quantity] — this can only REDUCE what would otherwise carry forward,
        // never add new units (that's the separate newAddonPurchases flow).
        // Defaults to the full surviving quantity when the caller sends no
        // override, so existing (non-editing) callers are unaffected.
        const carryForwardOverrides = req.body.carryForward || [];
        const carryForwardResolved = compatible.map((c) => {
          const override = carryForwardOverrides.find((o) => o.addonKey === c.addonKey);
          const desiredQuantity = override
            ? Math.max(0, Math.min(override.quantity, c.quantity))
            : c.quantity;
          return { ...c, quantity: desiredQuantity, reducedBy: c.quantity - desiredQuantity };
        });
        const carriedForward = carryForwardResolved.filter((c) => c.quantity > 0);
        // Any reduction becomes a REMOVE_ADDON scheduled for renewal, created
        // at settlement (only once the upgrade actually commits) — mirrors the
        // incompatibleAddons scheduling pattern later in this same flow.
        const reducedAddons = carryForwardResolved.filter((c) => c.reducedBy > 0);

        // Resolve prices for any NEW add-ons the user selected on the plan card
        const requestedNewAddons = (req.body.addons || []).filter((a) => a.quantity > 0);
        let newAddonPurchases = [];
        if (requestedNewAddons.length > 0) {
          const newAddonKeys = requestedNewAddons.map((a) => a.key);
          const newAddonCatalog = await PlanAddon.find({ key: { $in: newAddonKeys }, isActive: true });
          newAddonPurchases = requestedNewAddons
            .map(({ key, quantity }) => {
              const entry = newAddonCatalog.find((e) => e.key === key);
              const price = billingCycle === 'monthly' ? entry?.price?.monthly : entry?.price?.yearly;
              return { addonKey: key, quantity, pricePerUnit: price || 0 };
            })
            .filter((a) => a.pricePerUnit > 0);
        }

        const upgradeTargetSubscription = {
          planName: planId,
          billingCycle,
          pricePerUser: newBasePrice,
          activeAddons: [
            ...carriedForward.map((a) => ({ addonKey: a.addonKey, quantity: a.quantity, pricePerUnit: a.pricePerUnit })),
            ...newAddonPurchases,
          ],
        };
        // Same treatment for the new side — its OWN line items (target plan +
        // carried-forward add-ons) against the SAME frozen fullRulesSnapshot.
        // If the coupon doesn't cover the new plan, this is a no-op (CP3) —
        // computed independently of the old side, never blended or assumed
        // to inherit the old side's discount.
        const newLineItems = [
          { key: upgradeTargetSubscription.planName, type: 'plan', amount: upgradeTargetSubscription.pricePerUser },
          ...upgradeTargetSubscription.activeAddons.map((a) => ({ key: a.addonKey, type: 'addon', amount: a.quantity * a.pricePerUnit })),
        ];
        const newCouponModifier = (subscription.appliedCoupon?.fullRulesSnapshot && isCouponStillEligibleForRenewal(subscription.appliedCoupon))
          ? buildCouponModifierForLineItems(subscription.appliedCoupon.fullRulesSnapshot, newLineItems)
          : null;

        // newTotal = target subscription's full recurring value (new plan base +
        // carried-forward add-ons + newly purchased add-ons), priced once
        // through calculateInvoice() rather than hand-summed twice.
        const newTotal = calculateInvoice({
          subscription: upgradeTargetSubscription,
          resolvedModifiers: newCouponModifier ? [newCouponModifier] : [],
        }).taxable;

        // RF6 (§3.6b Chapter 19) — an upgrade requested mid-cycle supersedes
        // any pending RENEWAL invoice for this subscription (Law 11: a newer
        // commercial action voids an older, not-yet-settled one). If that
        // voided renewal had already reserved a referral reward for itself
        // (R8, utils/renewalEngine.js), that reservation must be released
        // BEFORE this upgrade's own RESERVE-FIRST step below runs — otherwise
        // the reward still reads as occupied and this upgrade reserves
        // nothing, even though the renewal that was holding it just got
        // voided. Released with releaseReason:'REPLACED_BY_NEW_INVOICE'
        // (not left to its 30-min TTL) so it's immediately available again;
        // no special "re-reserve the same one" branch needed — the normal
        // reserveNextAvailableReward() selection below picks it up like any
        // other available reward. Non-fatal: never blocks the upgrade if
        // this write fails.
        try {
          const pendingRenewal = await CommercialTransaction.findOne({
            organization: req.user.organization,
            subscription: subscription._id,
            type: 'RENEWAL',
            status: { $in: ['CREATED', 'PRICED', 'AWAITING_PAYMENT', 'FAILED'] },
          });
          if (pendingRenewal) {
            const voidedRewardUsageId = pendingRenewal.target?.rewardUsageId;
            pendingRenewal.status = 'VOID';
            await pendingRenewal.save();
            if (voidedRewardUsageId) {
              await releaseReservation(voidedRewardUsageId, 'REPLACED_BY_NEW_INVOICE');
            }
          }
        } catch (renewalVoidErr) {
          console.error(
            `Failed to void superseded RENEWAL transaction / release its reward (non-fatal) — organization=${req.user.organization} subscription=${subscription._id}:`,
            renewalVoidErr.message
          );
        }

        // SAME-FLOW RECYCLE: if a PREVIOUS upgrade checkout for this org left a
        // reward reserved (opened but never paid), release it before reserving
        // again. Safe because we overwrite subscription.pendingPlanChange below,
        // which makes that old order unsettleable — its reservation would
        // otherwise sit locked until its 30-min TTL, blocking the reward from
        // this new checkout. Idempotent + guarded on status:'reserved' inside
        // releaseReservation, so a since-consumed reservation is left untouched.
        // Only touches THIS flow's own prior reservation — never an add-on's
        // (separate pendingAddonAddition), so no cross-flow double-spend.
        if (subscription.pendingPlanChange?.referralRewardUsageId) {
          try {
            await releaseReservation(subscription.pendingPlanChange.referralRewardUsageId);
          } catch (relErr) {
            console.error('Failed to release prior upgrade reservation:', relErr.message);
          }
        }

        // RESERVE-FIRST (same concurrency-safe pattern as initiateAddonPurchase —
        // see utils/referralRewards.js). Reserve before creating the order so the
        // discount is only ever applied to an order backed by a reward we hold.
        let upgradeReservation = null;
        try {
          upgradeReservation = await reserveNextAvailableReward(req.user.organization, {
            subscription: subscription._id,
            context: 'UPGRADE',
          });
        } catch (reserveErr) {
          console.error('Referral reservation failed (proceeding at full price):', reserveErr.message);
        }

        let upgradeReferralRewardUsageId = null;
        const resolvedModifiers = [];
        if (upgradeReservation) {
          resolvedModifiers.push(rewardToModifier(upgradeReservation.reward));
          upgradeReferralRewardUsageId = upgradeReservation.usage._id;
        }

        // Phase 3 item 5a: proration is now priced through calculateInvoice()'s
        // Stage 5 (PHASE3_DESIGN_NOTE_INVOICE_ENGINE.md), not a standalone
        // calculatePlanUpgradeProration()+applyModifiers()+computeGST() chain.
        // pricePerUser: 0 / activeAddons: [] — this invoice call represents ONLY
        // the one-time upgrade charge, not a full plan invoice; oldTotal/newTotal
        // (full totals including add-ons, exactly as passed to
        // calculatePlanUpgradeProration before this migration) go in as
        // oldBasePrice/newBasePrice — calculateCommercialAdjustments() only
        // forwards them positionally, it doesn't interpret their meaning.
        const upgradeInvoice = calculateInvoice({
          subscription: { planName: planId, billingCycle, pricePerUser: 0, activeAddons: [] },
          changeset: { pricePerUser: 0 },
          adjustmentContext: {
            type: 'plan_upgrade',
            oldBasePrice: oldTotal,
            newBasePrice: newTotal,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
          },
          resolvedModifiers,
        });
        const proratedDiff = upgradeInvoice.adjustment; // Stage 5 amount, pre-discount — same meaning as before
        const discountedProratedDiff = upgradeInvoice.taxable; // post-discount, pre-GST — same meaning as before
        const proratedDiffWithGST = upgradeInvoice.total; // GST-inclusive — same meaning as before, what Razorpay actually charges

        // BILLING_UX_SPEC.md §1.2 — the coupon's effect on THIS charge is
        // already baked into oldTotal/newTotal above (both computed WITH the
        // coupon modifier), so it isn't a separate line in upgradeInvoice's
        // own modifierBreakdown (only referral is — adding the coupon there
        // too would double-discount, since the Stage 5 baseline is already
        // coupon-net). To display it as its own row without inventing a
        // number, run the SAME existing, pure calculateCommercialAdjustments()
        // once more against the RAW (undiscounted) plan totals — a genuine
        // second engine computation, not frontend arithmetic — and the
        // difference from the actual (coupon-net) adjustment is exactly the
        // coupon's contribution to this specific charge.
        let couponContributionToUpgrade = 0;
        try {
          const rawOldTotal = calculateInvoice({ subscription, resolvedModifiers: [] }).taxable;
          const rawNewTotal = calculateInvoice({ subscription: upgradeTargetSubscription, resolvedModifiers: [] }).taxable;
          const rawAdjustment = calculateCommercialAdjustments({
            type: 'plan_upgrade',
            oldBasePrice: rawOldTotal,
            newBasePrice: rawNewTotal,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
          }).amount;
          couponContributionToUpgrade = Math.max(0, rawAdjustment - proratedDiff);
        } catch (rawErr) {
          console.error('Could not compute raw (undiscounted) upgrade adjustment for display purposes (non-fatal):', rawErr.message);
        }
        const referralAmountInUpgrade = (upgradeInvoice.modifierBreakdown || []).filter((m) => m.type === 'referral').reduce((s, m) => s + m.amount, 0);
        // BILLING_UX_SPEC.md §4 — record the real amount now that pricing
        // knows it (reservation happened before pricing, reserve-first).
        if (upgradeReservation && referralAmountInUpgrade > 0) {
          await recordRewardUsageAmount(upgradeReservation.usage._id, referralAmountInUpgrade);
        }
        const upgradePricingBreakdown = {
          pricingLineItems: [{ label: 'Prorated Upgrade', amount: proratedDiff + couponContributionToUpgrade }],
          subtotal: proratedDiff + couponContributionToUpgrade,
          couponDiscount: couponContributionToUpgrade > 0 ? { amount: couponContributionToUpgrade, code: subscription.appliedCoupon?.code || null } : null,
          referralDiscount: referralAmountInUpgrade > 0 ? { amount: referralAmountInUpgrade, percent: upgradeReservation?.reward.rewardType === 'percentage' ? upgradeReservation.reward.rewardValue : null } : null,
          taxableAmount: upgradeInvoice.taxable,
          gst: upgradeInvoice.gst,
          total: upgradeInvoice.total,
        };

        // CommercialTransaction: same VOID-on-recycle + create pattern as
        // startAddonPurchase (utils/addonPurchaseLifecycle.js) — the same-flow
        // recycle above already releases any orphaned referral reservation, so
        // this VOIDs the matching orphaned transaction record too. Non-fatal:
        // never blocks the upgrade if CommercialTransaction write fails.
        let upgradeCommercialTransaction = null;
        try {
          await CommercialTransaction.updateMany(
            {
              organization: req.user.organization,
              subscription: subscription._id,
              type: 'UPGRADE',
              status: { $in: ['CREATED', 'PRICED', 'AWAITING_PAYMENT', 'FAILED'] },
            },
            { $set: { status: 'VOID' } }
          );
          upgradeCommercialTransaction = await CommercialTransaction.create({
            organization: req.user.organization,
            subscription: subscription._id,
            type: 'UPGRADE',
            status: 'PRICED',
            createdBy: req.user._id,
            target: { newPlanName: planId, newBasePrice, oldTotal, newTotal },
          });
        } catch (ctErr) {
          console.error(
            `CommercialTransaction creation failed (non-fatal) — organization=${req.user.organization} subscription=${subscription._id}:`,
            ctErr.message
          );
        }

        // Create a one-time Order for the prorated difference + GST (UPI-compatible)
        let razorpayOrder;
        try {
          razorpayOrder = await razorpay.orders.create({
            amount: proratedDiffWithGST * 100,
            currency: 'INR',
            receipt: `upg_${Date.now().toString().slice(-10)}`,
            notes: {
              organization_id: req.user.organization.toString(),
              subscription_id: subscription._id.toString(),
              new_plan: planId,
              type: 'plan_upgrade',
            },
          });
        } catch (orderErr) {
          // Order backing the reservation was never created — release
          // immediately rather than waiting for it to expire.
          if (upgradeReferralRewardUsageId) await releaseReservation(upgradeReferralRewardUsageId);
          throw orderErr;
        }

        if (upgradeReferralRewardUsageId) {
          await RewardUsage.updateOne({ _id: upgradeReferralRewardUsageId }, { $set: { invoiceId: razorpayOrder.id } });
        }

        if (upgradeCommercialTransaction) {
          try {
            upgradeCommercialTransaction.status = 'AWAITING_PAYMENT';
            upgradeCommercialTransaction.target = { ...upgradeCommercialTransaction.target, orderId: razorpayOrder.id };
            upgradeCommercialTransaction.attemptCount = 1;
            upgradeCommercialTransaction.lastAttemptAt = new Date();
            await upgradeCommercialTransaction.save();
          } catch (ctErr) {
            console.error(
              `CommercialTransaction AWAITING_PAYMENT update failed (non-fatal) — organization=${req.user.organization} subscription=${subscription._id} transaction=${upgradeCommercialTransaction._id}:`,
              ctErr.message
            );
          }
        }

        // Store pending change — everything below is applied on webhook confirmation
        // (payment success). We do NOT schedule removals or change planName here, so
        // an abandoned checkout leaves the current plan/add-ons fully intact.
        subscription.pendingPlanChange = {
          newPlanName: planId,
          newBasePrice,
          proratedDiffCharged: proratedDiffWithGST, // GST-inclusive — matches actual order amount
          orderId: razorpayOrder.id,
          // Live-QA correctness fix (Aug 2026): billingCycle/periodEnd now
          // carried through explicitly — these used to be silently dropped
          // here, which is the confirmed real mechanism behind a live-
          // reported incident (an addon mislabeled "Annual" with no actual
          // annual purchase, the moment the base plan later switched to
          // yearly and the missing field fell back to the NEW subscription
          // cycle). Same class of bug Task 1 fixed at three other creation
          // sites, recurring here via this one.
          compatibleAddons: carriedForward.map((a) => ({
            addonKey: a.addonKey, quantity: a.quantity, pricePerUnit: a.pricePerUnit,
            remappedFrom: a.remappedFrom || null,
            billingCycle: a.billingCycle, periodEnd: a.periodEnd,
          })),
          // User-reduced carry-forward quantities — settlement schedules a
          // REMOVE_ADDON for each of these at commit time (only once the
          // upgrade actually happens), same shape as incompatibleAddons below.
          // remappedFrom is carried through so settlement can recognize the
          // OLD (pre-upgrade) addonKey and avoid resurrecting it via the
          // "restore pending removals" loop below.
          reducedAddons: reducedAddons.map((a) => ({
            addonKey: a.addonKey,
            displayName: a.displayName || a.addonKey,
            quantity: a.reducedBy,
            pricePerUnit: a.pricePerUnit,
            remappedFrom: a.remappedFrom || null,
            billingCycle: a.billingCycle,
          })),
          incompatibleAddons: incompatible.map((a) => ({
            addonKey: a.addonKey,
            displayName: a.displayName || a.addonKey,
            quantity: a.quantity,
            pricePerUnit: a.pricePerUnit,
            remappedFrom: a.remappedFrom || null,
            billingCycle: a.billingCycle,
          })),
          newAddonPurchases: newAddonPurchases.map((a) => ({
            addonKey: a.addonKey, quantity: a.quantity, pricePerUnit: a.pricePerUnit,
            billingCycle,
          })),
          createdAt: new Date(),
          referralRewardUsageId: upgradeReferralRewardUsageId,
        };

        await subscription.save();

        return res.json({
          success: true,
          proratedAmount: discountedProratedDiff,
          referralDiscountApplied: proratedDiff - discountedProratedDiff || undefined,
          couponDiscountApplied: couponContributionToUpgrade || undefined,
          totalDiscountApplied: (couponContributionToUpgrade + (proratedDiff - discountedProratedDiff)) || undefined,
          pricingBreakdown: upgradePricingBreakdown,
          oldRecurringTotal: oldTotal,
          newRecurringTotal: newTotal,
          newBasePrice,
          carriedForwardAddons: carriedForward.map((a) => ({
            addonKey: a.addonKey,
            quantity: a.quantity,
            pricePerUnit: a.pricePerUnit,
            remappedFrom: a.remappedFrom || null,
          })),
          newAddonsList: newAddonPurchases.map((a) => ({
            addonKey: a.addonKey,
            quantity: a.quantity,
            pricePerUnit: a.pricePerUnit,
          })),
          incompatibleAddons: incompatible.map((a) => ({
            addonKey: a.addonKey,
            displayName: a.displayName || a.addonKey,
            quantity: a.quantity,
            pricePerUnit: a.pricePerUnit,
          })),
          message: `Upgrade to ${planId} initiated. Complete payment of ₹${proratedDiff} (pro-rated for the remaining cycle).`,
          paymentDetails: {
            key: process.env.RAZORPAY_KEY_ID,
            order_id: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: 'INR',
            name: req.user.name,
            description: `Upgrade to ${newPlanUpg.name || planId} — prorated for remaining cycle`,
            prefill: { name: req.user.name, email: req.user.email, contact: req.user.phone || '' },
            theme: { color: '#3399cc' },
          },
        });
      }
    }

    // UPI cancel-and-recreate: only for upgrades/billing-cycle changes, never downgrades.
    // Downgrades must fall through to the schedule-at-cycle-end logic below.
    const _planPri = { starter: 1, growth: 2, business: 3 };
    const _isDowngrade = (_planPri[planId] || 0) < (_planPri[subscription.planName] || 0);
    if (paymentMode === 'upi' && subscription.isPaymentConfirmed && !_isDowngrade) {
      // Cancel existing Razorpay subscription immediately
      await razorpay.subscriptions.cancel(subscription.razorpaySubscriptionId, { cancel_at_cycle_end: false });

      // Find new plan config
      const newPlan = await PlanConfig.findOne({ planId, isActive: true });
      if (!newPlan) return res.status(404).json({ error: "Plan not found" });

      const newPricePerUser = billingCycle === "monthly" ? newPlan.monthlyPrice : newPlan.yearlyPrice;
      const newTotalAmount = newPricePerUser;
      const newRazorpayPlanId = newPlan.razorpayPlanIds[billingCycle];

      // Create new Razorpay subscription with updated details
      const newRazorpaySubscription = await razorpay.subscriptions.create({
        plan_id: newRazorpayPlanId,
        customer_notify: 1,
        quantity: 1,
        total_count: billingCycle === "monthly" ? 12 : 1,
        notes: {
          organization_id: req.user.organization.toString(),
          plan_name: planId,
          billing_cycle: billingCycle,
        },
      });

      // Update DB subscription document with new Razorpay subscription info
      subscription.razorpaySubscriptionId = newRazorpaySubscription.id;
      subscription.razorpayPlanId = newRazorpayPlanId;
      subscription.planName = planId;
      subscription.status = "created";
      subscription.paymentStatus = "pending_payment";
      subscription.isPaymentConfirmed = false;
      subscription.billingCycle = billingCycle;
      subscription.pricePerUser = newPricePerUser;
      subscription.userCount = 1;
      subscription.totalAmount = newTotalAmount;
      subscription.currentPeriodStart = new Date(newRazorpaySubscription.current_start * 1000);
      subscription.currentPeriodEnd = new Date(newRazorpaySubscription.current_end * 1000);
      subscription.nextBillingDate = new Date(newRazorpaySubscription.charge_at * 1000);
      subscription.pendingUpdate = null;
      subscription.pendingUpgrade = null;
      await subscription.save();

      return res.json({
        success: true,
        message: "UPI subscription upgraded by cancelling old subscription and creating a new one.",
        subscription,
        paymentDetails: {
          key: process.env.RAZORPAY_KEY_ID,
          subscription_id: newRazorpaySubscription.id,
          name: req.user.name,
          description: `${newPlan.name} Plan - ${billingCycle}`,
          prefill: {
            name: req.user.name,
            email: req.user.email,
            contact: req.user.phone || "",
          },
          theme: { color: "#3399cc" },
          callback_url: `${process.env.FRONTEND_URL}/subscription/payment-success`,
        },
      });
    }

    // If not payment confirmed (pending payment), treat as create - allow any change without upgrade/downgrade logic
    if (!subscription.isPaymentConfirmed) {
      const plan = await PlanConfig.findOne({ planId, isActive: true });
      if (!plan) return res.status(404).json({ error: "Plan not found" });

      const pricePerUser =
        billingCycle === "monthly" ? plan.monthlyPrice : plan.yearlyPrice;

      // Validate and price add-ons (same logic as createSubscription)
      let addonEntries = [];
      let activeAddons = [];

      if (addons.length > 0) {
        const addonKeys = addons.map((a) => a.addonKey);
        addonEntries = await PlanAddon.find({ key: { $in: addonKeys }, isActive: true });

        for (const requested of addons) {
          const entry = addonEntries.find((e) => e.key === requested.addonKey);
          if (!entry) {
            return res.status(400).json({ error: `Add-on "${requested.addonKey}" does not exist or is not available.` });
          }
          const planAllowed = entry.availableOnPlans.length === 0 || entry.availableOnPlans.includes(planId);
          if (!planAllowed) {
            return res.status(400).json({ error: `Add-on "${entry.displayName}" is not available on the ${planId} plan.` });
          }
          const unitPrice = entry.price[billingCycle];
          if (!unitPrice) {
            return res.status(400).json({ error: `Add-on "${entry.displayName}" has no price configured for the ${billingCycle} cycle.` });
          }
          const qty = Number(requested.quantity) || 1;
          // Task 1 (Aug 2026) — same confirmed live-data bug as
          // createSubscription's addon push above: this trial-conversion
          // branch is exactly the code path that produced a real corrupted
          // record found in the dev DB (annual conversion, extra_seat with
          // no billingCycle stored at all).
          activeAddons.push({ addonKey: requested.addonKey, quantity: qty, pricePerUnit: unitPrice, addedAt: new Date(), billingCycle });
        }
      }

      // Same coupon handling as createSubscription — this branch is what
      // actually runs the first time a trial org converts to paid (createSubscription
      // detects the existing trial doc and forwards here), so it must not silently
      // drop a coupon the user entered at checkout.
      let appliedCoupon = null;
      let couponResult = null;
      if (couponCode) {
        const lineItems = [
          { key: planId, type: 'plan', amount: pricePerUser },
          ...activeAddons.map((a) => ({ key: a.addonKey, type: 'addon', amount: a.quantity * a.pricePerUnit })),
        ];
        couponResult = await validateAndPriceCoupon(couponCode, {
          organizationId: req.user.organization,
          planId,
          billingCycle,
          lineItems,
        });
        if (!couponResult.valid) {
          return res.status(400).json({ error: couponResult.reason });
        }
      }

      // NOTE: referral intent is NOT recorded here — see the identical
      // note in createSubscription above. Registration (link-based) and
      // the checkout page's own Apply button (manual entry) are the only
      // two creation points now.

      // CORRECTION: this branch — not createSubscription — is what actually
      // runs for "the most common 'new subscriber' moment" (every org starts
      // on a trial; see the SUBSCRIPTION_CREATED comment a few lines below,
      // which already said so). The referee-immediate-discount and
      // earned-reward-reservation wiring were originally built only into
      // createSubscription, which most real signups never call — added here
      // too, mirroring both createSubscription's referee-discount construction
      // and the upgrade path's reserve-first pattern (line ~1110) for an
      // already-earned Reward.
      const { findPendingReferralForSignup: findPendingReferralForTrialConversion } = require('../utils/referralUtils');
      const pendingReferralAtConversion = await findPendingReferralForTrialConversion(req.user.organization);

      // RETRY/BACK-BUTTON FIX (found via live QA — see the P0 trace): unlike
      // the upgrade path a few hundred lines above (its own "SAME-FLOW
      // RECYCLE" block), this branch had NO release-before-reserve guard.
      // Because a trial subscription's Subscription document is reused
      // (never re-created) across retries, calling this branch a second time
      // — abandon checkout, come back, hit "Complete Payment" again — used to
      // call reserveNextAvailableReward() again while the FIRST attempt's
      // reservation was still 'reserved' (unexpired). getNextAvailableReward
      // would then skip the occupied reward, find nothing, and this branch
      // would overwrite subscription.pendingReferralRewardUsageId to
      // undefined — orphaning the first reservation (still occupying the
      // reward, now unreferenced by anything) until its 30-min TTL
      // self-healed. That produced exactly the observed pattern: discount
      // present on attempt 1, absent on the immediate retry, reappearing
      // ~30 minutes later. Releasing the prior reservation FIRST (same
      // pattern, same reasoning as the upgrade path) closes this.
      if (subscription.pendingReferralRewardUsageId) {
        try {
          await releaseReservation(subscription.pendingReferralRewardUsageId, 'REPLACED_BY_RETRY');
        } catch (relErr) {
          console.error('Failed to release prior trial-conversion reservation:', relErr.message);
        }
      }

      let conversionRewardReservation = null;
      try {
        conversionRewardReservation = await reserveNextAvailableReward(req.user.organization, {
          subscription: subscription._id,
          context: 'TRIAL_CONVERSION',
        });
      } catch (reserveErr) {
        console.error('Referral reservation failed at trial conversion (proceeding at full price):', reserveErr.message);
      }

      // Phase 3 item 5c (Category A consolidation): this branch prices a
      // fresh commercial state — no old-vs-new comparison, no period math —
      // structurally identical to createSubscription's own calculateInvoice()
      // call (same modifier construction, same coupon-only shape, now also
      // the same referral wiring). Migrated onto the canonical engine for the
      // same reason createSubscription was: one authoritative pricing
      // computation, not a parallel buildPricingSnapshot() call for what is
      // the same kind of event.
      const conversionResolvedModifiers = couponResult
        ? [{ type: 'coupon', value: { kind: 'fixed', amount: couponResult.discountAmount }, appliesTo: 'entire_invoice' }]
        : [];
      if (pendingReferralAtConversion) {
        conversionResolvedModifiers.push(referralModifierFromPendingProgram(pendingReferralAtConversion.program));
      }
      if (conversionRewardReservation) {
        conversionResolvedModifiers.push(rewardToModifier(conversionRewardReservation.reward));
      }
      const snapshot = calculateInvoice({
        subscription: { planName: planId, billingCycle, pricePerUser, activeAddons },
        resolvedModifiers: conversionResolvedModifiers,
      });
      const totalAmount = snapshot.taxable; // pre-GST, post-discount — this first invoice's own taxable amount, charged today only

      // Recurring-price-corruption fix — same reasoning as createSubscription's
      // identical block above: `snapshot.taxable` includes one-time-only
      // modifiers (first_payment coupon, referee's first-invoice referral
      // discount), neither of which may ever appear in the stored recurring
      // baseline. Computed separately, durable-modifiers-only.
      const recurringResolvedModifiers = (couponResult && isCouponStillEligibleForRenewal({ duration: { type: couponResult.coupon.duration?.type || 'lifetime' } }))
        ? [{ type: 'coupon', value: { kind: 'fixed', amount: couponResult.discountAmount }, appliesTo: 'entire_invoice' }]
        : [];
      const recurringSnapshot = calculateInvoice({
        subscription: { planName: planId, billingCycle, pricePerUser, activeAddons },
        resolvedModifiers: recurringResolvedModifiers,
      });
      const recurringBaseline = recurringSnapshot.taxable; // what THIS subscription actually recurs at, from the next cycle onward

      // BILLING_UX_SPEC.md §4 — same reasoning as createSubscription's
      // identical block: record the earned-reward reservation's real
      // amount, skipped when a pendingReferral ALSO applied (ambiguous
      // dual-referral-modifier edge case — see that block's comment).
      if (conversionRewardReservation && !pendingReferralAtConversion) {
        const earnedRewardAmountAtConversion = (snapshot.modifierBreakdown || []).filter((m) => m.type === 'referral').reduce((s, m) => s + m.amount, 0);
        if (earnedRewardAmountAtConversion > 0) {
          await recordRewardUsageAmount(conversionRewardReservation.usage._id, earnedRewardAmountAtConversion);
        }
      }

      if (couponResult) {
        appliedCoupon = {
          couponId: couponResult.coupon._id,
          code: couponResult.coupon.code,
          name: couponResult.coupon.name,
          duration: {
            type: couponResult.coupon.duration?.type || 'lifetime',
            cycles: couponResult.coupon.duration?.cycles ?? null,
          },
          discountAmount: couponResult.discountAmount,
          baseSubtotal: snapshot.subtotal,
          recurringSubtotal: recurringBaseline,
          rulesApplied: couponResult.lineItems
            .filter((li) => li.discount > 0)
            .map((li) => ({
              productType: li.type,
              productKey: li.key,
              discountType: li.discountType,
              discountValue: li.discountValue,
              discountAmount: li.discount,
            })),
          // Complete rule set at application time — see createSubscription's
          // identical addition and the Subscription.js model comment.
          fullRulesSnapshot: (couponResult.coupon.rules || []).map((r) => ({
            productType: r.productType,
            productKey: r.productKey,
            discountType: r.discountType,
            discountValue: r.discountValue,
          })),
        };
      }

      // Phase 4D-5 (IMPLEMENTATION_PLAN_V1.md) — trial->paid conversion
      // acquires a real CAW mandate (Registration Link) exactly as a fresh
      // signup does, via the same utils/cawAcquisition.js helper
      // createSubscription's own Registration Link logic was extracted from.
      // Replaces the legacy findOrCreateRazorpayPlan()/razorpay.subscriptions.create()
      // pair (the classic Razorpay Subscriptions product, which requires
      // separate account activation and is not what this account has enabled —
      // confirmed live, a real 401 from subscriptions.create() specifically,
      // not createRegistrationLink()). Restores work that was previously
      // built and fixture-verified (scripts/verifyTrialConversionCAW.js) but
      // never actually landed in this file.
      // Bug A fix (found via live QA — Resume Payment invoice showing ₹336
      // instead of ₹396): `totalAmount` a few lines above is `snapshot.taxable`
      // — pre-GST — deliberately used for baseSubtotal/recurringSubtotal
      // display fields. The actual amount charged via Razorpay must be the
      // GST-inclusive total, exactly like createSubscription's own
      // `firstInvoiceRupees = invoice.total` a few hundred lines above.
      // This branch had been silently passing the pre-GST figure instead —
      // undercharging every trial-conversion / plan-change-while-pending /
      // Resume Payment invoice by exactly the GST amount.
      // Orphaned-mandate fix (found via live QA — a real captured payment +
      // confirmed mandate with no effect on the app): re-entering this
      // branch (Change Plan / Resume Payment / retry) while a PREVIOUS
      // registration link is still outstanding used to just overwrite
      // subscription.registrationLinkId with the new one, leaving the old
      // link fully live and payable on Razorpay's side. If the customer
      // then completed that stale link instead of the new one,
      // handleCAWPaymentCaptured's registrationLinkId lookup found nothing
      // (the doc now pointed at the newer link) and silently dropped a real
      // captured payment + confirmed mandate. Cancelling the superseded link
      // here closes the gap at its source — best-effort/non-fatal, since the
      // old link may already be expired, cancelled, or (rarely) mid-payment
      // on Razorpay's side, none of which should block this attempt.
      if (subscription.registrationLinkId && subscription.mandateStatus === 'pending') {
        // Keep the id before it is overwritten below - cancelling a link does not undo a payment
        // already made against it, and reconcilePayment needs somewhere to look for that money.
        if (!subscription.priorRegistrationLinkIds?.includes(subscription.registrationLinkId)) {
          subscription.priorRegistrationLinkIds = [
            ...(subscription.priorRegistrationLinkIds || []),
            subscription.registrationLinkId,
          ];
        }
        try {
          await razorpay.invoices.cancel(subscription.registrationLinkId);
        } catch (cancelErr) {
          console.error('Could not cancel superseded registration link (non-fatal):', subscription.registrationLinkId, cancelErr.message);
        }
      }

      const { registrationLink, mandateMaxAmountRupees } = await createRegistrationLinkForOrg({
        user: req.user,
        planId,
        billingCycle,
        firstInvoiceRupees: snapshot.total,
        mandateMethod: req.body.mandateMethod,
      });

      // Pending-mandate fields, mirroring createSubscription's own write
      // exactly — legacy fields explicitly cleared, not populated, since
      // this subscription no longer has a classic Razorpay Subscription.
      subscription.razorpayCustomerId = registrationLink.customer_id;
      subscription.registrationLinkId = registrationLink.id;
      subscription.mandateStatus = 'pending';
      // Same field, reset on every re-entry to this branch — including a
      // Resume Payment call or a plan change while pending — so "recent vs.
      // stale" copy always reflects THIS attempt, not a much older one.
      subscription.mandateInitiatedAt = new Date();
      subscription.mandateMaxAmount = mandateMaxAmountRupees;
      subscription.billingMode = resolveMandateMethod(req.body.mandateMethod) === 'manual' ? 'manual' : 'autopay';
      subscription.planName = planId;
      subscription.status = "created";
      subscription.paymentStatus = "pending_payment";
      subscription.isPaymentConfirmed = false;
      subscription.billingCycle = billingCycle;
      subscription.pricePerUser = pricePerUser;
      subscription.userCount = 1;
      subscription.totalAmount = recurringBaseline;
      subscription.activeAddons = activeAddons;
      subscription.appliedCoupon = appliedCoupon;
      subscription.pendingReferralRewardUsageId = conversionRewardReservation?.usage._id || undefined;
      subscription.razorpaySubscriptionId = undefined;
      subscription.razorpayPlanId = undefined;
      subscription.currentPeriodStart = undefined;
      subscription.currentPeriodEnd = undefined;
      subscription.nextBillingDate = undefined;
      subscription.pendingUpdate = null;
      subscription.pendingUpgrade = null;
      await subscription.save();

      // Phase 2-shape observational write (see createSubscription's identical
      // try/catch) — no orderId/paymentId exists yet, mandate hasn't
      // confirmed (Phase 3 owns that). Non-fatal by design.
      try {
        await BillingInvoice.create({
          organization: subscription.organization,
          subscription: subscription._id,
          reason: 'NEW_SUBSCRIPTION',
          razorpay: { registrationLinkId: registrationLink.id },
          lineItems: snapshot.lines,
          subtotal: snapshot.subtotal,
          discount: snapshot.discount,
          taxable: snapshot.taxable,
          gst: snapshot.gst,
          total: snapshot.total,
          generatedAt: snapshot.generatedAt,
          // Same reconciliation-critical field as createSubscription's
          // identical write above — see the BillingInvoice model comment.
          couponId: appliedCoupon?.couponId || undefined,
          couponCode: appliedCoupon?.code || undefined,
        });
      } catch (err) {
        console.error(
          `BillingInvoice persistence failed (non-fatal, Phase 2 observational write) — organization=${subscription.organization} subscription=${subscription._id}:`,
          err.message
        );
      }

      // RETRY FIX (found via live QA — see the P0 trace): this branch is
      // re-entered on every retry/back-button return (a fresh Registration
      // Link is intentionally created each time — that part is correct,
      // an abandoned mandate needs a new link to retry). But nothing
      // previously gated the two emitBillingEvent calls below on "has this
      // already been recorded" — so every retry re-emitted a FULL duplicate
      // SUBSCRIPTION_CREATED + REFERRAL_DISCOUNT_APPLIED pair, with whatever
      // (possibly different, if add-ons/coupon changed) amount that retry
      // happened to price. That's exactly the observed "two Subscribed to
      // Starter entries, two different discount amounts" pattern. Guard:
      // only ever emit once per subscription document — a retry of the same
      // still-unpaid conversion is not a second "new subscriber" moment.
      const BillingEvent = require('../models/BillingEvent');
      const alreadyRecorded = await BillingEvent.exists({ subscription: subscription._id, eventType: 'SUBSCRIPTION_CREATED' });

      if (!alreadyRecorded) {
        await emitBillingEvent({
          organization: subscription.organization,
          subscription: subscription._id,
          eventType: 'SUBSCRIPTION_CREATED',
          status: 'completed',
          after: subscription,
          amounts: {
            base: snapshot.subtotal,
            discount: appliedCoupon?.discountAmount || 0,
            recurringAfter: recurringBaseline,
          },
          razorpay: { registrationLinkId: registrationLink.id },
          metadata: { planId, billingCycle, couponCode: appliedCoupon?.code || null, onboarding: 'charge_at_will' },
        });

        // BILLING_UX_SPEC.md §5 — same referee-side timeline entry as
        // createSubscription's identical block above, for the (more common)
        // trial-conversion path. Nested under the same retry guard —
        // otherwise a retry with a referral present would still double-emit
        // this one even with SUBSCRIPTION_CREATED itself correctly guarded.
        if (pendingReferralAtConversion) {
          const referralDiscountAmountAtConversion = (snapshot.modifierBreakdown || []).filter((m) => m.type === 'referral').reduce((s, m) => s + m.amount, 0);
          if (referralDiscountAmountAtConversion > 0) {
            await emitBillingEvent({
              organization: subscription.organization,
              subscription: subscription._id,
              eventType: 'REFERRAL_DISCOUNT_APPLIED',
              status: 'completed',
              amounts: { discount: referralDiscountAmountAtConversion },
              metadata: { referralPercent: pendingReferralAtConversion.program.rewardType === 'percentage' ? pendingReferralAtConversion.program.rewardValue : null },
            });
          }
        }
      }

      return res.json({
        success: true,
        subscription,
        registrationLink: {
          shortUrl: registrationLink.short_url,
          id: registrationLink.id,
          expireBy: registrationLink.expire_by,
        },
        // BILLING_UX_SPEC.md §1.2 — same canonical shape as createSubscription,
        // so Trial → Paid renders through the identical Order Summary
        // component rather than inventing its own totals display.
        pricingBreakdown: toPricingBreakdown(snapshot, {
          couponCode: appliedCoupon?.code,
          referralPercent: pendingReferralAtConversion
            ? pendingReferralAtConversion.program.rewardValue
            : (conversionRewardReservation?.reward.rewardType === 'percentage' ? conversionRewardReservation.reward.rewardValue : undefined),
        }),
      });
    }

    // If in trial, end trial
    if (subscription.isTrialActive && !subscription.razorpaySubscriptionId) {
      subscription.isTrialActive = false;
      subscription.trialEnd = new Date();
    }

    const currentPlan = await PlanConfig.findOne({
      planId: subscription.planName,
      isActive: true,
    });
    const newPlan = await PlanConfig.findOne({ planId, isActive: true });
    if (!newPlan) return res.status(404).json({ error: "Plan not found" });

    const newPricePerUser =
      billingCycle === "monthly" ? newPlan.monthlyPrice : newPlan.yearlyPrice;

    // Classify active add-ons against the target plan for compatibility.
    // Classification runs against the RAW current add-ons (full quantity
    // actually in use/paid for today), not the future-effective snapshot —
    // using the effective snapshot here was a real bug: an addon becoming
    // INCOMPATIBLE would only ever be seen at its already-reduced quantity
    // (e.g. Seat x2 with 1 already scheduled for removal would classify as
    // incompatible x1 instead of x2), silently shrinking real entitlement the
    // org already paid for. Compatible add-ons still need the effective
    // (surviving-after-existing-removals) quantity for their carry-forward
    // default — incompatible ones don't, since the whole quantity drops at
    // renewal regardless of any smaller partial removal already scheduled.
    const { buildEffectiveSubscription: buildEffectiveForDowngrade } = require('../utils/renewalEngine');
    const downgradePreviewHorizon = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000);
    const { effective: effectiveForDowngrade } = await buildEffectiveForDowngrade(subscription, downgradePreviewHorizon);
    const rawAddonsForClassify = subscription.activeAddons || [];
    const { compatible: rawCompatibleAddons, incompatible: droppedAddons } =
      rawAddonsForClassify.length > 0
        ? await classifyAddonsForPlanChange(rawAddonsForClassify, planId, billingCycle)
        : { compatible: [], incompatible: [] };
    // Keyed by the OLD (pre-plan-change) addonKey — see the identical note in
    // the upgrade branch above. rawCompatibleAddons entries may carry a NEW
    // (remapped) addonKey, so the lookup must use c.remappedFrom when present.
    // Phase 2b: key on (addonKey, billingCycle), not addonKey alone — see
    // addonManagement.addonIdentityKey's comment.
    const effectiveQuantityByKeyDowngrade = new Map(
      (effectiveForDowngrade.activeAddons || []).map((a) => [addonIdentityKey(a, subscription.billingCycle), a.quantity])
    );
    // Falling back to 0 (not c.quantity) — see the identical note in the
    // upgrade branch: absence from the effective map means fully consumed by
    // an existing scheduled removal, not "no reduction applies."
    const survivingCompatibleAddons = rawCompatibleAddons
      .map((c) => ({ ...c, quantity: effectiveQuantityByKeyDowngrade.get(addonIdentityKey(c, subscription.billingCycle)) ?? 0 }))
      .filter((c) => c.quantity > 0);

    // Editable carry-forward — same UX and clamping as the upgrade branch:
    // the user may reduce (down to 0) how much of each surviving compatible
    // add-on continues after the downgrade. Since a downgrade never charges
    // anything today (it only takes effect at renewal), the reduction is
    // applied directly here rather than deferred to a settlement step.
    const downgradeCarryForwardOverrides = req.body.carryForward || [];
    const downgradeCarryForwardResolved = survivingCompatibleAddons.map((c) => {
      const override = downgradeCarryForwardOverrides.find((o) => o.addonKey === c.addonKey);
      const desiredQuantity = override
        ? Math.max(0, Math.min(override.quantity, c.quantity))
        : c.quantity;
      return { ...c, quantity: desiredQuantity, reducedBy: c.quantity - desiredQuantity };
    });
    const compatibleAddons = downgradeCarryForwardResolved.filter((c) => c.quantity > 0);
    const downgradeReducedAddons = downgradeCarryForwardResolved.filter((c) => c.reducedBy > 0);

    // New add-ons the customer is buying AS PART OF THIS SAME downgrade
    // request — critically, this is how an AUTO_FIXABLE validator result
    // (e.g. "add 2 more seats") actually gets resolved in one round trip,
    // rather than being reported and then rejected with no way to act on it.
    // Priced against the TARGET plan's catalog (not the current plan's),
    // same resolution pattern as the upgrade branch's newAddonPurchases.
    const requestedNewAddonsDowngrade = (addons || []).filter((a) => a.quantity > 0);
    let newAddonPurchasesDowngrade = [];
    if (requestedNewAddonsDowngrade.length > 0) {
      const newAddonKeysDowngrade = requestedNewAddonsDowngrade.map((a) => a.key);
      const newAddonCatalogDowngrade = await PlanAddon.find({ key: { $in: newAddonKeysDowngrade }, isActive: true });
      newAddonPurchasesDowngrade = requestedNewAddonsDowngrade
        .map(({ key, quantity }) => {
          const entry = newAddonCatalogDowngrade.find((e) => e.key === key);
          const price = billingCycle === 'monthly' ? entry?.price?.monthly : entry?.price?.yearly;
          return { addonKey: key, quantity, pricePerUnit: price || 0 };
        })
        .filter((a) => a.pricePerUnit > 0);
    }

    const newAddonsTotal = compatibleAddons.reduce((sum, a) => sum + a.quantity * a.pricePerUnit, 0)
      + newAddonPurchasesDowngrade.reduce((sum, a) => sum + a.quantity * a.pricePerUnit, 0);

    const newTotalAmount = newPricePerUser + newAddonsTotal;
    const newRazorpayPlanId = newPlan.razorpayPlanIds[billingCycle];

    const isBillingCycleChange = subscription.billingCycle !== billingCycle;
    const oldTotalAmount = calculateInvoice({ subscription: effectiveForDowngrade }).taxable;
    const planPriority = { starter: 1, growth: 2, business: 3 };
    const currentPlanPriority = planPriority[subscription.planName] || 0;
    const newPlanPriority = planPriority[planId] || 0;
    const isUpgrade =
      newPlanPriority > currentPlanPriority ||
      (newPlanPriority === currentPlanPriority &&
        newTotalAmount > oldTotalAmount);
    // A genuine tier downgrade, distinct from a same-tier billing-cycle-only
    // change and from an upgrade-combined-with-a-cycle-change (both of which
    // also fall into the `isBillingCycleChange || !isUpgrade` branch below).
    // CommercialTransaction{type:'DOWNGRADE'} is only written for this exact
    // case — see IMPLEMENTATION_PLAN_V1.md item 6 for why the other two cases
    // in this branch are deliberately left unwired this pass.
    const isGenuineDowngrade = newPlanPriority < currentPlanPriority;

    // Downgrade eligibility gate (BILLING_DOMAIN business contract, agreed
    // 2026-07-24): a genuine tier downgrade can only be scheduled once
    // validateDowngrade() reports eligible === true. A billing-cycle-only
    // change (same tier) never reduces plan limits, so it's exempt.
    //
    // Passes the customer's requested new add-on purchases (already resolved
    // above) as plannedNewAddons — critical: AUTO_FIXABLE must be resolvable
    // in the SAME request, not a dead end that reports "buy 2 seats" and then
    // rejects anyway with no way to act on it in one round trip.
    //
    // ALSO passes `compatibleAddons` — the ACTUAL resolved carry-forward
    // state after applying the customer's own carryForward overrides
    // (computed above). This is critical: without it, the validator falls
    // back to assuming full survival of every carried addon, completely
    // blind to a customer reducing a carried seat down to 0 — which is
    // exactly the bug that let an invalid downgrade (2 users, 1 seat
    // capacity) get scheduled.
    if (isGenuineDowngrade) {
      const { validateDowngrade } = require('../utils/downgradeValidator');
      const plannedNewAddonsForValidation = newAddonPurchasesDowngrade.map((a) => ({ addonKey: a.addonKey, quantity: a.quantity }));
      const resolvedCarryForwardForValidation = compatibleAddons.map((a) => ({ addonKey: a.addonKey, quantity: a.quantity }));
      const validation = await validateDowngrade(subscription, planId, plannedNewAddonsForValidation, resolvedCarryForwardForValidation);
      if (!validation.eligible) {
        return res.status(400).json({
          error: 'This downgrade is not yet possible — resolve the issues below first.',
          downgradeValidation: validation,
        });
      }
    }

    let message = "Subscription updated successfully!";
    let paymentDetails = null;
    let scheduled = false;

    // Downgrades and billing-cycle changes are always scheduled at cycle end.
    // We update the Razorpay subscription plan (no cancellation) so the lower
    // recurring amount kicks in automatically at the next billing date.
    if (isBillingCycleChange || !isUpgrade) {
      // Guard against writing a half-formed pendingUpdate (e.g. the target
      // plan has no price configured for the requested billing cycle) — that
      // previously saved a truthy-but-garbage object that downstream UI
      // treated as a real scheduled downgrade (₹NaN, blank plan name).
      if (!planId || typeof newPricePerUser !== 'number' || Number.isNaN(newPricePerUser) || !billingCycle) {
        return res.status(400).json({ error: 'Could not schedule this change — the target plan has no valid price for the selected billing cycle.' });
      }
      subscription.pendingUpdate = {
        planName: planId,
        pricePerUser: newPricePerUser,
        userCount: 1,
        totalAmount: newTotalAmount,
        billingCycle: billingCycle,
        scheduledAt: new Date(subscription.currentPeriodEnd),
        // Frozen snapshot of which add-ons carry into the new plan, taken at the
        // moment the change is scheduled. Add-ons purchased on the CURRENT
        // subscription afterwards must NOT retroactively appear here — the
        // scheduled subscription is an explicit future state the user chose,
        // not something that silently tracks the active plan's add-ons.
        // Includes both surviving carry-forward add-ons AND newly-purchased
        // ones (e.g. seats bought to resolve an AUTO_FIXABLE validator
        // result) — both are simply "what's active on the future
        // subscription," billed starting at renewal, nothing charged today.
        // Live-QA correctness fix (Aug 2026): billingCycle/periodEnd now
        // carried through — same class of bug Task 1 fixed elsewhere,
        // recurring here (a scheduled downgrade's carried-forward add-ons
        // would lose their cycle label at renewal, falling back to
        // whatever the subscription's cycle is by THEN).
        carriedAddons: [...compatibleAddons, ...newAddonPurchasesDowngrade].map((a) => ({
          addonKey: a.addonKey,
          quantity: a.quantity,
          pricePerUnit: a.pricePerUnit,
          billingCycle: a.billingCycle,
          periodEnd: a.periodEnd,
        })),
        removedAddons: droppedAddons.map((a) => ({
          addonKey: a.addonKey,
          quantity: a.quantity,
          pricePerUnit: a.pricePerUnit,
        })),
        // Precisely how much THIS downgrade added to pendingAddonRemovals —
        // not the resulting total, the DELTA. cancelScheduledDowngrade
        // subtracts this back out, which correctly handles the case where
        // the carry-forward reduction updated a PRE-EXISTING partial removal
        // in place (the total afterwards isn't "what it was before this
        // downgrade", it's "what it was before, plus this downgrade's own
        // contribution" — only the delta is safe to reverse).
        reducedAddonDeltas: downgradeReducedAddons.map((a) => ({
          addonKey: a.addonKey, quantity: a.reducedBy,
        })),
      };
      // Do NOT set cancelAtPeriodEnd — the subscription continues; only the amount changes.

      // ScheduledChange — additive write-alongside, per IMPLEMENTATION_PLAN_V1.md's Phase 4
      // design. Covers both genuine downgrade (PLAN_CHANGE) and non-UPI billing-cycle-change,
      // bare or upgrade-combined (BILLING_CYCLE_CHANGE) — both reach this branch, and both are
      // in ScheduledChange's scope (the UPI bypass never reaches here at all, per Step 0a).
      // Not written for the remaining lateral edge case (same tier, same cycle, not an
      // upgrade — a true no-op re-submission): that case isn't one of the four scoped action
      // types and wasn't in the design table's rows — deliberately not invented here.
      // Nothing reads this back yet — pendingUpdate above remains fully authoritative.
      // Cancel any prior PENDING ScheduledChange of the same type first — pendingUpdate's own
      // write above is a plain overwrite (no merge), so a repeated request here must not leave
      // two PENDING ScheduledChange documents describing the same slot; see this session's
      // structural-backstop note below for why an index isn't also added for this yet.
      if (isGenuineDowngrade || isBillingCycleChange) {
        try {
          await ScheduledChange.updateMany(
            {
              organization: subscription.organization,
              subscription: subscription._id,
              type: isGenuineDowngrade ? 'PLAN_CHANGE' : 'BILLING_CYCLE_CHANGE',
              status: 'PENDING',
            },
            { $set: { status: 'CANCELLED', reason: 'Superseded' } }
          );
          await ScheduledChange.create({
            organization: subscription.organization,
            subscription: subscription._id,
            type: isGenuineDowngrade ? 'PLAN_CHANGE' : 'BILLING_CYCLE_CHANGE',
            status: 'PENDING',
            effectiveAt: subscription.currentPeriodEnd,
            payload: {
              planId,
              pricePerUser: newPricePerUser,
              billingCycle,
              isBillingCycleChange,
              isGenuineDowngrade,
              // Carried through so applyScheduledChange (renewalEngine.js) can
              // correctly project activeAddons for this scheduled change —
              // without this, the PLAN_CHANGE case only updates planName/
              // pricePerUser and silently leaves activeAddons at whatever the
              // CURRENT (pre-downgrade) addons are, ignoring whatever
              // carry-forward/removal choice the customer actually made.
              carriedAddons: compatibleAddons.map((a) => ({
                addonKey: a.addonKey, quantity: a.quantity, pricePerUnit: a.pricePerUnit,
                billingCycle: a.billingCycle, periodEnd: a.periodEnd,
              })),
              removedAddons: droppedAddons.map((a) => ({
                addonKey: a.addonKey, quantity: a.quantity, pricePerUnit: a.pricePerUnit,
              })),
            },
          });
        } catch (scErr) {
          console.error(
            `ScheduledChange creation failed (non-fatal) — organization=${subscription.organization} subscription=${subscription._id}:`,
            scErr.message
          );
        }
      }

      // User-reduced carry-forward quantities (editable carry-forward at
      // downgrade) — schedule immediately, since nothing about a downgrade
      // takes effect before renewal anyway. Same update-in-place pattern as
      // the upgrade settlement path: a smaller/absent existing removal must
      // be bumped to the correct full reduction, not skipped.
      if (downgradeReducedAddons.length > 0) {
        const pendingRemovals = subscription.pendingAddonRemovals || [];
        for (const red of downgradeReducedAddons) {
          const existing = pendingRemovals.find((r) => r.addonKey === red.addonKey);
          if (existing) {
            // red.reducedBy is the ADDITIONAL amount beyond whatever is
            // already scheduled (existing.quantity) — total removal is the
            // sum, not a replacement.
            existing.quantity = existing.quantity + red.reducedBy;
            existing.pricePerUnit = red.pricePerUnit;
            existing.effectiveAt = subscription.currentPeriodEnd;
          } else {
            pendingRemovals.push({
              addonKey: red.addonKey,
              displayName: red.displayName || red.addonKey,
              quantity: red.reducedBy,
              pricePerUnit: red.pricePerUnit,
              scheduledAt: new Date(),
              effectiveAt: subscription.currentPeriodEnd,
            });
          }
        }
        subscription.pendingAddonRemovals = pendingRemovals;

        for (const red of downgradeReducedAddons) {
          try {
            const existingPending = await ScheduledChange.findOne({
              organization: subscription.organization,
              subscription: subscription._id,
              type: 'REMOVE_ADDON',
              status: 'PENDING',
              'payload.addonKey': red.addonKey,
            });
            const updatedRemoval = subscription.pendingAddonRemovals.find((r) => r.addonKey === red.addonKey);
            if (existingPending) {
              existingPending.payload = { addonKey: red.addonKey, quantity: updatedRemoval.quantity, reason: 'user_reduced_carry_forward_at_downgrade' };
              await existingPending.save();
            } else {
              await ScheduledChange.create({
                organization: subscription.organization,
                subscription: subscription._id,
                type: 'REMOVE_ADDON',
                status: 'PENDING',
                effectiveAt: subscription.currentPeriodEnd,
                payload: { addonKey: red.addonKey, quantity: updatedRemoval.quantity, reason: 'user_reduced_carry_forward_at_downgrade' },
              });
            }
          } catch (scErr) {
            console.error(
              `ScheduledChange creation failed (non-fatal) — organization=${subscription.organization} subscription=${subscription._id} addonKey=${red.addonKey}:`,
              scErr.message
            );
          }
        }
      }

      // CommercialTransaction — downgrade only (Chapter 18: a no-payment action
      // still creates a transaction, but never enters AWAITING_PAYMENT since
      // there is no payment step). CREATED->PRICED right here, once the target
      // plan/effective date are known and pendingUpdate is about to be written.
      // No existing recycle/release step for a re-submitted pendingUpdate to
      // piggyback on (unlike upgrade's referral-reservation recycle) — the
      // VOID-then-create here exists purely for CommercialTransaction
      // consistency, not because a recycle mechanism already existed.
      let downgradeCommercialTransaction = null;
      if (isGenuineDowngrade) {
        try {
          await CommercialTransaction.updateMany(
            {
              organization: subscription.organization,
              subscription: subscription._id,
              type: 'DOWNGRADE',
              status: { $in: ['CREATED', 'PRICED', 'AWAITING_PAYMENT', 'FAILED'] },
            },
            { $set: { status: 'VOID' } }
          );
          downgradeCommercialTransaction = await CommercialTransaction.create({
            organization: subscription.organization,
            subscription: subscription._id,
            type: 'DOWNGRADE',
            status: 'PRICED',
            createdBy: req.user._id,
            target: { newPlanName: planId, newPricePerUser, newTotalAmount, effectiveAt: subscription.currentPeriodEnd },
          });
        } catch (ctErr) {
          console.error(
            `CommercialTransaction creation failed (non-fatal) — organization=${subscription.organization} subscription=${subscription._id}:`,
            ctErr.message
          );
        }
      }

      if (subscription.razorpaySubscriptionId) {
        try {
          // Create/find a GST-inclusive Razorpay plan for the new amount, then
          // schedule the plan switch at the end of the current billing cycle.
          const downgradePlanId = await findOrCreateRazorpayPlan(newTotalAmount, billingCycle, planId);
          await razorpay.subscriptions.update(subscription.razorpaySubscriptionId, {
            plan_id: downgradePlanId,
            schedule_change_at: 'cycle_end',
          });
        } catch (rzpErr) {
          // UPI subscriptions can't be updated mid-cycle — that's fine; pendingUpdate
          // in our DB is the source of truth and applyScheduledAddonRemovals handles
          // the actual plan switch at renewal via the webhook.
          console.warn('Razorpay subscription plan update skipped (likely UPI):', rzpErr?.error?.description || rzpErr.message);
        }
      }

      message = isBillingCycleChange
        ? "Billing cycle change scheduled."
        : "Downgrade scheduled.";
      scheduled = true;

      await subscription.save();

      // CommercialTransaction: PRICED -> COMMITTED, immediately -> COMPLETED.
      // No AWAITING_PAYMENT for this flow (no payment step, per Chapter 18) —
      // COMMITTED fires the moment pendingUpdate is durably saved (the line
      // above); COMPLETED fires immediately after, in the same request,
      // since "completed" here means "the customer's decision was recorded
      // and accepted," not "the downgrade has taken effect" (that's a future
      // renewal-time event, out of scope for this wiring).
      if (downgradeCommercialTransaction) {
        try {
          downgradeCommercialTransaction.status = 'COMMITTED';
          downgradeCommercialTransaction.lastAttemptAt = new Date();
          await downgradeCommercialTransaction.save();
          downgradeCommercialTransaction.status = 'COMPLETED';
          await downgradeCommercialTransaction.save();
        } catch (ctErr) {
          console.error(
            `CommercialTransaction COMMITTED/COMPLETED update failed (non-fatal) — organization=${subscription.organization} subscription=${subscription._id} transaction=${downgradeCommercialTransaction._id}:`,
            ctErr.message
          );
        }
      }

      // Timeline: scheduled, not yet in effect — top-level subscription
      // fields are still the CURRENT plan until cycle end, so `subscription`
      // itself is the correct "before" snapshot here.
      await emitBillingEvent({
        organization: subscription.organization,
        subscription: subscription._id,
        eventType: isBillingCycleChange ? 'BILLING_CYCLE_CHANGE_SCHEDULED' : 'DOWNGRADE_SCHEDULED',
        status: 'scheduled',
        effectiveAt: subscription.currentPeriodEnd,
        before: subscription,
        after: {
          planName: planId,
          billingCycle,
          pricePerUser: newPricePerUser,
          userCount: subscription.userCount,
          totalAmount: newTotalAmount,
          activeAddons: compatibleAddons,
          appliedCoupon: subscription.appliedCoupon,
        },
        amounts: { recurringBefore: oldTotalAmount, recurringAfter: newTotalAmount },
        metadata: { targetPlanId: planId, billingCycle },
      });

      // For plan downgrades, schedule any add-ons that aren't available on the
      // new plan for removal at the same period end — org keeps access until then.
      let incompatibleAddons = [];
      if (!isBillingCycleChange && !isUpgrade) {
        try {
          const pendingRemovals = subscription.pendingAddonRemovals || [];
          // Reuse the already-computed droppedAddons (from effectiveForDowngrade)
          // instead of re-deriving incompatibility from the raw activeAddons filter.
          const incompatible = droppedAddons;
          incompatibleAddons = incompatible;
          if (incompatible.length > 0) {
            for (const inc of incompatible) {
              if (!pendingRemovals.find((r) => r.addonKey === inc.addonKey)) {
                pendingRemovals.push({
                  addonKey: inc.addonKey,
                  displayName: inc.displayName || inc.addonKey,
                  quantity: inc.quantity,
                  pricePerUnit: inc.pricePerUnit,
                  scheduledAt: new Date(),
                  effectiveAt: subscription.currentPeriodEnd,
                });
              }
            }
            subscription.pendingAddonRemovals = pendingRemovals;
            await subscription.save();

            // ScheduledChange — additive write-alongside, found by Step 5's whole-backend
            // grep in the prior session (this site wasn't in the original Step 2 table).
            // Matches this block's own skip-if-exists behavior (line ~1595 above), NOT
            // scheduleAddonRemoval's merge/increment behavior — those are different
            // shapes, confirmed by re-reading this block before wiring, not assumed
            // identical. Only creates a record for an addonKey with no existing PENDING
            // one; an addonKey already pending removal is left untouched here too.
            for (const inc of incompatible) {
              try {
                const existingPending = await ScheduledChange.findOne({
                  organization: subscription.organization,
                  subscription: subscription._id,
                  type: 'REMOVE_ADDON',
                  status: 'PENDING',
                  'payload.addonKey': inc.addonKey,
                });
                if (!existingPending) {
                  await ScheduledChange.create({
                    organization: subscription.organization,
                    subscription: subscription._id,
                    type: 'REMOVE_ADDON',
                    status: 'PENDING',
                    effectiveAt: subscription.currentPeriodEnd,
                    payload: { addonKey: inc.addonKey, quantity: inc.quantity, reason: 'incompatible_with_downgrade_target_plan' },
                  });
                }
              } catch (scErr) {
                console.error(
                  `ScheduledChange creation failed (non-fatal) — organization=${subscription.organization} subscription=${subscription._id} addonKey=${inc.addonKey}:`,
                  scErr.message
                );
              }
            }
          }
        } catch (err) {
          console.warn('Could not schedule incompatible add-on removals on downgrade:', err.message);
        }
      }

      return res.json({
        success: true,
        message,
        subscription,
        scheduled,
        paymentDetails,
        newRecurringTotal: newTotalAmount,
        carriedForwardAddons: compatibleAddons.map((a) => ({
          addonKey: a.addonKey,
          quantity: a.quantity,
          pricePerUnit: a.pricePerUnit,
          remappedFrom: a.remappedFrom || null,
        })),
        // Ceiling for the editable carry-forward stepper — the FULL surviving
        // quantity before any user override, so the frontend never lets the
        // user drag it back above what's actually available.
        // Phase 2b note: NOT converted to an (addonKey, billingCycle) key
        // here, unlike the internal Maps above — this object is the actual
        // wire response the frontend parses as {[addonKey]: quantity}, so
        // changing its key shape is an API-surface change (Phase 2d), not a
        // safe internal fix. survivingCompatibleAddons itself is already
        // correct (fixed above); this stays a no-op collision risk only
        // until a real dual-cycle entry can exist, which 2d must resolve
        // before that becomes reachable.
        maxCarryForward: Object.fromEntries(survivingCompatibleAddons.map((a) => [a.addonKey, a.quantity])),
        // New add-ons purchased in THIS request to resolve an AUTO_FIXABLE
        // validator result (e.g. seats bought to fit the target plan).
        newAddonsList: newAddonPurchasesDowngrade.map((a) => ({
          addonKey: a.addonKey,
          quantity: a.quantity,
          pricePerUnit: a.pricePerUnit,
        })),
        incompatibleAddons: incompatibleAddons.map((a) => ({
          addonKey: a.addonKey,
          displayName: a.displayName || a.addonKey,
          quantity: a.quantity,
          pricePerUnit: a.pricePerUnit,
        })),
      });
    }

    // NOTE: Tier upgrades are intercepted earlier by the Order-based
    // pendingPlanChange flow (UPI-compatible, no cancel-and-recreate).
    // Reaching here means an unhandled state — fail safe rather than
    // falling back to the removed cancel-and-recreate upgrade path.
    return res.status(400).json({
      error: "Unable to process this subscription change. Please contact support.",
    });
  } catch (error) {
    console.error("Subscription update error:", error);
    const razorpayError = error.error?.description || error.error?.reason;
    res.status(500).json({
      error: razorpayError || error.message,
      code: 'RAZORPAY_ERROR',
      hint: razorpayError ? 'Razorpay rejected the request. Run scripts/createRazorpayPlans.js to create valid plan IDs.' : undefined,
    });
  }
};

// Cancel subscription
exports.cancelSubscription = async (req, res) => {
  try {
    const { cancelAtPeriodEnd = true } = req.body;

    const subscription = await Subscription.findOne({
      organization: req.user.organization,
    });

    if (!subscription) {
      return res.status(404).json({ error: "No active subscription found" });
    }

    // CommercialTransaction — cancellation, both branches below (trial and
    // paid). No payment step either way, so no AWAITING_PAYMENT (Chapter 18,
    // same reasoning as downgrade). No existing reactivate/undo-cancel
    // endpoint was found in this file (only a message pointing the user
    // elsewhere), so there is no existing recycle point to piggyback on —
    // VOID-then-create exists purely for CommercialTransaction consistency.
    let cancellationCommercialTransaction = null;
    try {
      await CommercialTransaction.updateMany(
        {
          organization: subscription.organization,
          subscription: subscription._id,
          type: 'CANCELLATION',
          status: { $in: ['CREATED', 'PRICED', 'AWAITING_PAYMENT', 'FAILED'] },
        },
        { $set: { status: 'VOID' } }
      );
      cancellationCommercialTransaction = await CommercialTransaction.create({
        organization: subscription.organization,
        subscription: subscription._id,
        type: 'CANCELLATION',
        status: 'PRICED',
        createdBy: req.user._id,
        target: { cancelAtPeriodEnd, trial: !!subscription.isTrialActive },
      });
    } catch (ctErr) {
      console.error(
        `CommercialTransaction creation failed (non-fatal) — organization=${subscription.organization} subscription=${subscription._id}:`,
        ctErr.message
      );
    }

    // Trial cancellation — no Razorpay subscription exists to cancel
    if (subscription.isTrialActive) {
      subscription.isTrialActive = false;
      subscription.trialEnd = new Date();
      setAppStatus(subscription, "cancelled", "user cancelled during trial");
      await subscription.save();
      if (cancellationCommercialTransaction) {
        try {
          cancellationCommercialTransaction.status = 'COMMITTED';
          cancellationCommercialTransaction.lastAttemptAt = new Date();
          await cancellationCommercialTransaction.save();
          cancellationCommercialTransaction.status = 'COMPLETED';
          await cancellationCommercialTransaction.save();
        } catch (ctErr) {
          console.error(
            `CommercialTransaction COMMITTED/COMPLETED update failed (non-fatal) — organization=${subscription.organization} subscription=${subscription._id} transaction=${cancellationCommercialTransaction._id}:`,
            ctErr.message
          );
        }
      }
      return res.json({
        success: true,
        message: "Trial cancelled successfully",
      });
    }

    // Bug found via live QA (Aug 2026): this call was unconditional and
    // assumed every paid subscription has a real legacy Razorpay Subscription
    // object to cancel. A CAW (Charge-at-Will) subscription has no such
    // object at all — it's a reusable mandate token + one-time Orders, never
    // a razorpay.subscriptions.* resource — confirmed directly against a real
    // CAW subscription's data (mandateTokenId present, razorpaySubscriptionId
    // absent entirely). Calling this unconditionally threw on every CAW
    // cancellation attempt, surfacing as the generic "Failed to cancel
    // subscription" with no useful detail. There is nothing to cancel on
    // Razorpay's side for CAW — the mandate token itself stays valid (it's
    // reusable infrastructure, not a per-cycle commitment); what actually
    // stops future billing is the ScheduledChange{type:'CANCELLATION'}
    // record created below, already correctly read back and short-circuited
    // by renewSubscription() (renewalEngine.js:188-206, confirmed by reading
    // it directly — this half of the mechanism was already built and working,
    // just unreachable because the code above it crashed first).
    if (subscription.razorpaySubscriptionId) {
      await razorpay.subscriptions.cancel(subscription.razorpaySubscriptionId, {
        cancel_at_cycle_end: true,
      });
    }

    subscription.cancelAtPeriodEnd = true;
    await subscription.save();

    // ScheduledChange — additive write-alongside, paid path only. Not written for
    // the trial-cancellation branch above: that path is immediate (trialEnd set to
    // now, appStatus flipped to cancelled in the same request) — no future window
    // exists for it to represent, same reasoning as the UPI bypass (Step 0a). Only
    // this path is genuinely deferred (effective at currentPeriodEnd). Cancel any
    // prior PENDING CANCELLATION/PLAN_CHANGE/BILLING_CYCLE_CHANGE ScheduledChange
    // first — per Chapter 9's cancellation-precedence rule (Cancellation supersedes
    // a pending downgrade/cycle-change), reflected here as bookkeeping only; no
    // reader acts on this yet.
    try {
      await ScheduledChange.updateMany(
        {
          organization: subscription.organization,
          subscription: subscription._id,
          status: 'PENDING',
        },
        { $set: { status: 'CANCELLED', reason: 'Subscription Cancelled' } }
      );
      await ScheduledChange.create({
        organization: subscription.organization,
        subscription: subscription._id,
        type: 'CANCELLATION',
        status: 'PENDING',
        effectiveAt: subscription.currentPeriodEnd,
        payload: { cancelAtPeriodEnd },
      });
    } catch (scErr) {
      console.error(
        `ScheduledChange creation failed (non-fatal) — organization=${subscription.organization} subscription=${subscription._id}:`,
        scErr.message
      );
    }

    if (cancellationCommercialTransaction) {
      try {
        cancellationCommercialTransaction.status = 'COMMITTED';
        cancellationCommercialTransaction.lastAttemptAt = new Date();
        await cancellationCommercialTransaction.save();
        cancellationCommercialTransaction.status = 'COMPLETED';
        await cancellationCommercialTransaction.save();
      } catch (ctErr) {
        console.error(
          `CommercialTransaction COMMITTED/COMPLETED update failed (non-fatal) — organization=${subscription.organization} subscription=${subscription._id} transaction=${cancellationCommercialTransaction._id}:`,
          ctErr.message
        );
      }
    }

    await emitBillingEvent({
      organization: subscription.organization,
      subscription: subscription._id,
      eventType: 'SUBSCRIPTION_CANCELLED',
      status: 'scheduled',
      effectiveAt: subscription.currentPeriodEnd,
      after: subscription,
    });

    res.json({
      success: true,
      message: "Subscription will be cancelled at the end of current billing period",
    });
  } catch (error) {
    console.error("Subscription cancellation error:", error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================================
// CHARGE-AT-WILL — Phase 3A: webhook plumbing only.
// See CAW_BILLING_DESIGN.md "Implementation Notes".
//
// Scope, deliberately narrow (per review — do NOT expand without a phase
// boundary change):
//   - verify signature (done once, at the top of handleWebhook, unchanged)
//   - dedupe via x-razorpay-event-id (RazorpayWebhookEvent, unique index)
//   - persist the raw vendor fact the event carries
//   - correlate ONLY where it's a direct, single-field DB lookup — never an
//     inference across multiple facts
//   - NOT in scope here: activation, runFirstPaymentSettlement(), retries,
//     interpreting "payment paid AND mandate confirmed" as a combined
//     state — that is Phase 3B.
//
// Correlation keys, verified against real payloads (not assumed — see
// CAW_BILLING_DESIGN.md Implementation Notes / CHARGE_AT_WILL_VALIDATION.md):
//   - payment.captured / payment.failed → payload.payment.entity.invoice_id
//     matches Subscription.registrationLinkId (the Registration Link IS an
//     Invoice). That same payment payload also carries token_id, so a
//     matched payment.captured is also how mandateTokenId gets recorded.
//   - token.confirmed / token.paused / token.cancelled / token.rejected →
//     Subscription.mandateTokenId matches payload.token.entity.id. This can
//     legitimately find nothing (if payment.captured hasn't arrived yet to
//     populate mandateTokenId, or arrives out of order — confirmed possible,
//     §7a). When nothing matches, the event is stored unattached
//     (subscription: null) and left for Phase 3B; Phase 3A does not invent a
//     reconciliation mechanism for this case.
// ============================================================

// Records the webhook for dedup, unless already seen. Returns null if this
// razorpayEventId was already processed (caller should skip and return 200).
async function recordWebhookEventOnce(razorpayEventId, eventName, payload, subscriptionId) {
  try {
    return await RazorpayWebhookEvent.create({
      razorpayEventId,
      event: eventName,
      payload,
      subscription: subscriptionId || null,
    });
  } catch (err) {
    if (err.code === 11000) return null; // duplicate delivery (at-least-once) — already recorded
    throw err;
  }
}

// ============================================================
// Phase 3B — reconciliation + activation. ONE shared helper, called by BOTH
// the payment and token handlers after each persists its own fact. Not
// embedded in either handler specifically — Razorpay's delivery order is not
// guaranteed (§7a) and must not be baked into which handler "owns" this.
// See CAW_BILLING_DESIGN.md "Phase 3B Planning".
// ============================================================
async function reconcileMandate(subscription) {
  // Claim any orphaned token.* event that arrived before we knew mandateTokenId
  // (the out-of-order case observed live — token.confirmed before payment.captured).
  if (subscription.mandateTokenId) {
    const orphaned = await RazorpayWebhookEvent.findOne({
      subscription: null,
      'payload.id': subscription.mandateTokenId,
    }).sort({ receivedAt: -1 });
    if (orphaned) {
      orphaned.subscription = subscription._id;
      await orphaned.save();
      const tokenMandateStatus = { 'token.confirmed': 'confirmed', 'token.paused': 'paused', 'token.cancelled': 'cancelled', 'token.rejected': 'rejected' }[orphaned.event];
      if (tokenMandateStatus) {
        subscription.mandateStatus = tokenMandateStatus;
        if (tokenMandateStatus === 'confirmed') {
          if (orphaned.payload.max_amount) subscription.mandateMaxAmount = orphaned.payload.max_amount / 100;
          if (orphaned.payload.expired_at) subscription.mandateExpiresAt = new Date(orphaned.payload.expired_at * 1000);
        }
      }
    }
  }

  // Activation AND-gate (§7a). setAppStatus and runFirstPaymentSettlement are
  // both already idempotent (no-op on repeat) — this is safe to call every
  // time reconcileMandate runs, from either handler, any number of times.
  const wasAlreadyActive = subscription.appStatus === 'active';

  // A paid period is delivered even when the mandate is unusable.
  //
  // The gate below used to require BOTH a completed payment and a confirmed mandate, so a customer
  // whose card failed tokenisation stayed on 'trial' despite having paid in full - we held the
  // money and delivered nothing (found live: Rs.295, mandate 'rejected'). The mandate only
  // authorises the NEXT charge; it is not what the customer bought. So a captured first payment
  // with a failed mandate now activates the subscription for exactly the period it paid for, with
  // auto-renew off.
  //
  // Nothing else has to change for that to be safe, because both halves already exist:
  //   - billingOrchestration.js's renewal query selects mandateTokenId: { $ne: null }, so a
  //     mandate-less subscription can never be auto-charged, and
  //   - subscriptionLifecycleJobs.js already finalises anything with cancelAtPeriodEnd at the end
  //     of its entitlement window,
  // which together give exactly the intended behaviour: runs to period end, then lapses unless the
  // customer sets up a working mandate first.
  const mandateUnusable = subscription.mandateStatus === 'rejected' || subscription.mandateStatus === 'cancelled';
  const paidWithoutMandate = subscription.paymentStatus === 'payment_completed' && mandateUnusable;

  if (paidWithoutMandate && !subscription.cancelAtPeriodEnd) {
    // Not a cancellation the customer asked for - it is 'this term is prepaid and will not renew
    // itself', which is the same end state and is already handled by the period-end job.
    subscription.cancelAtPeriodEnd = true;
  }

  // Manual billing has no mandate to wait for: the captured payment alone
  // activates it, and its renewals go out as payment links (manualRenewal.js).
  const isManual = subscription.billingMode === 'manual';
  if (subscription.paymentStatus === 'payment_completed' && (subscription.mandateStatus === 'confirmed' || paidWithoutMandate || isManual)) {
    if (isManual && subscription.mandateStatus === 'pending') subscription.mandateStatus = 'none';
    subscription.isPaymentConfirmed = true;
    // Regression fix (found via live QA — real money-affecting bug): this
    // AND-gate is THE activation moment for every CAW (Registration-Link)
    // subscription — trial-conversion's own write site never clears
    // isTrialActive (that responsibility was assumed to belong to one of
    // the legacy Razorpay-Subscription confirmation paths — handleSubscriptionAuthenticated/
    // Activated/Charged, verifyPayment — but NONE of those ever run for a
    // CAW subscription, since they all key off razorpaySubscriptionId,
    // which trial-conversion explicitly clears to undefined). Left
    // unclear, isTrialActive stayed true indefinitely after a real trial
    // ->paid CAW conversion, which broke
    // frontend/src/components/settings/SubscriptionPlans.jsx's
    // `isExistingActiveSub = isPaymentConfirmed && !isTrialActive` check —
    // silently routing every subsequent upgrade/downgrade through the
    // generic new-subscription checkout branch (flat plan price, no
    // proration breakdown, no add-on compatibility/carry-forward prompt)
    // instead of the real upgrade/downgrade UI, even though the backend
    // itself (gated only on isPaymentConfirmed, never isTrialActive) still
    // charged the correct prorated amount underneath. Setting it here,
    // atomically with isPaymentConfirmed, closes the gap at its actual
    // source rather than relying on some other function to eventually
    // self-heal it on a later, unrelated call.
    subscription.isTrialActive = false;
    setAppStatus(subscription, 'active', 'Charge-at-Will mandate confirmed and first payment captured');

    // Real activation, not a repeat call (see wasAlreadyActive below) — the
    // trial has genuinely converted to paid, so its "Trial Demo" sample
    // data should stop showing up alongside real records now.
    if (!wasAlreadyActive) {
      deleteTrialDemoData(subscription.organization).catch((cleanupErr) => {
        console.error('Trial demo data cleanup failed on paid conversion:', cleanupErr);
      });
    }

    // CAW has no Razorpay-managed recurring subscription object to read
    // current_start/current_end/charge_at from (unlike the legacy path —
    // see the other currentPeriodStart/End write sites in this file) — the
    // billing period is a homegrown invariant this system owns itself, so it
    // must be initialized HERE, at first activation. Guarded so a repeat
    // call (setAppStatus is idempotent and this can run more than once)
    // never resets an already-running cycle.
    if (!subscription.currentPeriodStart) {
      const { addBillingCycle } = require('../utils/renewalEngine');
      const activatedAt = new Date();
      subscription.currentPeriodStart = activatedAt;
      subscription.currentPeriodEnd = addBillingCycle(activatedAt, subscription.billingCycle);
      subscription.nextBillingDate = subscription.currentPeriodEnd;
    }
  }

  await subscription.save();

  // Found via live QA: this was the missing event — the timeline used to go
  // straight from "Subscribed" (at mandate REQUEST time, now renamed "Plan
  // Selected") to nothing, ever, for the moment payment actually confirms.
  // Guarded on the wasAlreadyActive->now-active TRANSITION specifically
  // (not "is appStatus active", which reconcileMandate can true on every
  // repeat call) — fires exactly once, the instant real activation happens.
  if (!wasAlreadyActive && subscription.appStatus === 'active') {
    await emitBillingEvent({
      organization: subscription.organization,
      subscription: subscription._id,
      eventType: 'SUBSCRIPTION_ACTIVATED',
      status: 'completed',
      after: subscription,
      amounts: { recurringAfter: subscription.totalAmount },
    });
  }

  if (subscription.appStatus === 'active') {
    await runFirstPaymentSettlement(subscription);
  }
}

async function handleCAWPaymentCaptured(paymentEntity, razorpayEventId) {
  // Same guard as handleCAWPaymentFailed below, and more dangerous here: a
  // null invoice_id (true for every renewal/add-on/upgrade Order charge, not
  // just registration-link payments) previously matched an ARBITRARY
  // unrelated subscription and could have called runFirstPaymentSettlement /
  // emitted SUBSCRIPTION_ACTIVATED against it.
  let subscription = paymentEntity.invoice_id
    ? await Subscription.findOne({ registrationLinkId: paymentEntity.invoice_id })
    : null;

  // Orphaned-mandate fallback (found via live QA — a real captured payment
  // and confirmed mandate that updated nothing): a Change Plan / Resume
  // Payment attempt made AFTER this link was generated, but before the
  // customer actually paid it, overwrites subscription.registrationLinkId
  // with the newer attempt's link — so the direct lookup above finds
  // nothing, even though this is real, captured, CAW money. Cancelling the
  // superseded link at creation time (updateSubscription's pending branch)
  // prevents this going forward, but a payment already in flight when that
  // fix lands (or any other race) can still land here. notes.organization_id
  // is stamped on every registration link this app creates and is never
  // rewritten, so it's a reliable fallback key — Subscription is 1:1 per
  // organization (see the model's own unique index), so this is unambiguous.
  // Gated on invoice_id being present, not just "no subscription found" —
  // catching this bug in review (Aug 2026): a bare `!subscription` here also
  // matches every renewal/add-on/upgrade Order payment (paymentEntity.invoice_id
  // is null for those, per the comment above), which ALSO carries
  // notes.organization_id (used elsewhere for renewal-failure correlation) —
  // so an ungated fallback would have matched those too and fallen through to
  // writing paymentStatus/mandateStatus and calling reconcileMandate against
  // an already-active subscription on every ordinary renewal charge. Requiring
  // invoice_id restores the exact same "only registration-link-shaped
  // payments reach here" invariant the direct lookup above already enforces.
  const wasSuperseded = !subscription && !!paymentEntity.invoice_id;
  if (wasSuperseded && paymentEntity.notes?.organization_id) {
    subscription = await Subscription.findOne({ organization: paymentEntity.notes.organization_id });
  }

  const recorded = await recordWebhookEventOnce(razorpayEventId, 'payment.captured', paymentEntity, subscription?._id);
  // A duplicate real delivery is skipped. A reconciliation replay (recon_…,
  // reconcileSubscriptionPayment) is NOT: its id is fixed per payment, so
  // once recorded, a later payment.failed that knocked paymentStatus back
  // made every repair attempt a silent no-op. Everything below is idempotent
  // (plain field sets + reconcileMandate), so re-applying is safe.
  const isReplay = typeof razorpayEventId === 'string' && razorpayEventId.startsWith('recon_');
  if (!recorded && !isReplay) return; // duplicate delivery, already processed
  if (!subscription) return; // not a CAW subscription (or legacy payment) — legacy handler already ran separately

  // Re-apply what THIS payment actually authorized, not whatever the
  // subscription doc's mutable fields currently say. Found live: a Change
  // Plan click made after this link was generated but before it was paid
  // silently rewrote planName/billingCycle/activeAddons to the newer,
  // unpaid attempt — so once correlation is fixed above, a naive "just
  // persist the fact" would still activate the WRONG plan/add-ons.
  // Recovered from two immutable, per-attempt sources: the payment's own
  // `notes` (plan_name/billing_cycle, stamped once at this link's creation
  // and never rewritten by anything downstream) and the matching
  // BillingInvoice (recorded at that same moment, keyed by
  // registrationLinkId, carrying the exact add-on line items priced for
  // this specific attempt — so an add-on chosen on the superseded attempt
  // is honored or dropped exactly according to what was actually paid for,
  // not whatever add-ons happen to be selected on the doc right now).
  if (wasSuperseded && paymentEntity.invoice_id) {
    const paidInvoice = await BillingInvoice.findOne({ 'razorpay.registrationLinkId': paymentEntity.invoice_id });
    const paidPlanName = paymentEntity.notes?.plan_name;
    const paidBillingCycle = paymentEntity.notes?.billing_cycle;
    if (paidInvoice && paidPlanName && paidBillingCycle) {
      const paidPlan = await PlanConfig.findOne({ planId: paidPlanName, isActive: true });
      if (paidPlan) {
        const addonLines = (paidInvoice.lineItems || []).filter((li) => li.type === 'addon');
        const addonEntries = addonLines.length
          ? await PlanAddon.find({ key: { $in: addonLines.map((li) => li.key) } })
          : [];
        subscription.planName = paidPlanName;
        subscription.billingCycle = paidBillingCycle;
        subscription.pricePerUser = paidBillingCycle === 'monthly' ? paidPlan.monthlyPrice : paidPlan.yearlyPrice;
        subscription.activeAddons = addonLines.map((li) => {
          const entry = addonEntries.find((e) => e.key === li.key);
          const quantity = li.quantity || 1;
          return {
            addonKey: li.key,
            quantity,
            pricePerUnit: entry ? entry.price[paidBillingCycle] : (li.amount / quantity),
            addedAt: new Date(),
            billingCycle: paidBillingCycle,
          };
        });
        // Best available recurring baseline for this reconciled attempt —
        // the invoice's own priced taxable total, exactly what this
        // customer actually authorized. Not re-derived through
        // calculateInvoice() here since a coupon applied on the superseded
        // attempt (if any) isn't independently recoverable from the invoice
        // record alone.
        subscription.totalAmount = paidInvoice.taxable;
        subscription.registrationLinkId = paymentEntity.invoice_id;

        console.log(`Reconciled orphaned CAW payment onto subscription ${subscription._id}: activating "${paidPlanName}"/${paidBillingCycle} with ${subscription.activeAddons.length} add-on(s) — the plan actually paid for via link ${paymentEntity.invoice_id}, not the subscription doc's later-overwritten value.`);

        // Coupon reconciliation — found while tracing this same class of bug
        // one level further: runFirstPaymentSettlement (via
        // maybeRecordCouponRedemption) reads subscription.appliedCoupon —
        // the SAME mutable field a later Change Plan/Resume Payment attempt
        // can overwrite before this payment's webhook ever lands. A coupon
        // can be RECURRING (duration.type 'lifetime'/'until_cancelled',
        // re-checked every renewal by isCouponStillEligibleForRenewal), so
        // silently clearing this — as an earlier version of this fix did —
        // wouldn't just cost a redemption-count/UI badge on one invoice, it
        // would silently stop a legitimate discount from applying to every
        // future renewal, with no error the customer would ever see. Now
        // recovered from paidInvoice.couponId/couponCode — an immutable,
        // per-attempt field added specifically to close this gap (see the
        // BillingInvoice model's own comment) — not guessed from the
        // invoice's aggregate `discount`, which combines coupon + referral
        // into one number and can't distinguish either from the other.
        if (paidInvoice.couponId) {
          const paidCoupon = await Coupon.findById(paidInvoice.couponId);
          if (paidCoupon) {
            // The invoice stores only the aggregate discount, not a
            // per-line breakdown — re-price its own plan/add-on lines
            // against the coupon's rules to reconstruct `rulesApplied` for
            // display, same shape createSubscription/trial-conversion
            // build at first-attempt time.
            const priceableLines = (paidInvoice.lineItems || [])
              .filter((li) => li.type === 'plan' || li.type === 'addon')
              .map((li) => ({ key: li.key, type: li.type, amount: li.amount }));
            const priced = priceLineItems(paidCoupon, priceableLines);

            // Recurring baseline for FUTURE renewals — the same eligibility
            // question renewal itself asks, so a 'first_payment' coupon
            // correctly does NOT carry forward while 'lifetime'/
            // 'until_cancelled' does. Priced against the NOW-reconciled
            // plan/add-ons (just set above), not the paid invoice's own
            // (possibly different, if add-ons were added since) line items.
            const stillEligibleForRenewal = isCouponStillEligibleForRenewal({ duration: { type: paidCoupon.duration?.type || 'lifetime' } });
            const recurringLineItems = [
              { key: paidPlanName, type: 'plan', amount: subscription.pricePerUser },
              ...subscription.activeAddons.map((a) => ({ key: a.addonKey, type: 'addon', amount: a.quantity * a.pricePerUnit })),
            ];
            const recurringGross = recurringLineItems.reduce((s, i) => s + i.amount, 0);
            const recurringPriced = stillEligibleForRenewal ? priceLineItems(paidCoupon, recurringLineItems) : null;

            subscription.appliedCoupon = {
              couponId: paidCoupon._id,
              code: paidCoupon.code,
              name: paidCoupon.name,
              duration: {
                type: paidCoupon.duration?.type || 'lifetime',
                cycles: paidCoupon.duration?.cycles ?? null,
              },
              discountAmount: paidInvoice.discount,
              baseSubtotal: paidInvoice.subtotal,
              recurringSubtotal: recurringPriced ? (recurringGross - recurringPriced.totalDiscount) : recurringGross,
              rulesApplied: priced.lineItems
                .filter((li) => li.discount > 0)
                .map((li) => ({
                  productType: li.type,
                  productKey: li.key,
                  discountType: li.discountType,
                  discountValue: li.discountValue,
                  discountAmount: li.discount,
                })),
              fullRulesSnapshot: (paidCoupon.rules || []).map((r) => ({
                productType: r.productType,
                productKey: r.productKey,
                discountType: r.discountType,
                discountValue: r.discountValue,
              })),
              redeemed: false, // let maybeRecordCouponRedemption run normally in runFirstPaymentSettlement below, as if this were a fresh confirmation
            };
            console.log(`Reconciled coupon "${paidCoupon.code}" (${paidCoupon.duration?.type || 'lifetime'}) back onto subscription ${subscription._id} from the actually-paid invoice — will ${stillEligibleForRenewal ? 'continue applying to future renewals' : 'apply to this invoice only'}.`);
          } else {
            console.error(`CAW payment.captured: paid invoice for subscription ${subscription._id} references couponId ${paidInvoice.couponId}, but that Coupon no longer exists. Manual reconciliation required.`);
            subscription.appliedCoupon = null;
            await emitBillingEvent({
              organization: subscription.organization,
              subscription: subscription._id,
              eventType: 'BILLING_RECONCILIATION_NEEDED',
              status: 'completed',
              metadata: {
                reason: 'coupon_reference_missing',
                registrationLinkId: paymentEntity.invoice_id,
                note: `Paid invoice referenced Coupon ${paidInvoice.couponId}, which no longer exists in the Coupon collection.`,
              },
            });
          }
        } else if (subscription.appliedCoupon) {
          // The subscription's CURRENT appliedCoupon belongs to a later,
          // unrelated (unpaid) attempt — this paid invoice recorded no
          // couponId, so either no coupon was genuinely used on it, or this
          // is a historical invoice that predates the couponId field above.
          // Clearing is the conservative choice: leaving the later attempt's
          // coupon in place would let maybeRecordCouponRedemption silently
          // burn ITS usage limit against a purchase it was never applied to.
          const mayHaveLostADiscount = paidInvoice.discount > 0;
          console.error(`CAW payment.captured: subscription ${subscription._id}'s appliedCoupon ("${subscription.appliedCoupon.code}") belongs to a later, unpaid attempt — clearing it. Paid invoice's own discount: ${paidInvoice.discount}.`);
          subscription.appliedCoupon = null;
          if (mayHaveLostADiscount) {
            await emitBillingEvent({
              organization: subscription.organization,
              subscription: subscription._id,
              eventType: 'BILLING_RECONCILIATION_NEEDED',
              status: 'completed',
              metadata: {
                reason: 'coupon_could_not_be_reconciled',
                paidInvoiceDiscount: paidInvoice.discount,
                registrationLinkId: paymentEntity.invoice_id,
                note: 'Paid invoice shows a discount but recorded no couponId (pre-fix invoice, or referral-only — check the reward reconciliation log line separately). If a RECURRING coupon was genuinely used, future renewals will not carry its discount forward until corrected manually.',
              },
            });
          }
        }

        // Referral-reward correlation — same root cause as the plan/add-on
        // mismatch just fixed above, hitting a SEPARATE piece of state.
        // updateSubscription's release-before-reserve guard (its own
        // "RETRY/BACK-BUTTON FIX" comment, a few hundred lines up) releases
        // WHATEVER reservation is currently on the subscription the instant
        // this branch re-runs — so a later Change Plan/Resume Payment
        // attempt releases the EARLIER attempt's reservation (the one that
        // actually discounted the invoice that just got paid), reserves a
        // fresh one for itself, and leaves that fresh one dangling
        // 'reserved' against a plan that was never paid for. RewardUsage
        // carries no invoiceId at reservation time (reserved before
        // pricing — see reserveNextAvailableReward's call site a few
        // hundred lines up, which never passes one), so there is no exact
        // key back to this invoice; the only signal available is that the
        // reservation which funded it was created in the very same request,
        // so its reservedAt sits within seconds of the invoice's own
        // generatedAt.
        if (paidInvoice.discount > 0) {
          const candidateUsage = await RewardUsage.findOne({
            subscription: subscription._id,
            context: 'TRIAL_CONVERSION',
            reservedAt: { $lte: new Date(paidInvoice.generatedAt.getTime() + 5000) },
          }).sort({ reservedAt: -1 });
          if (candidateUsage && candidateUsage.status === 'released' && candidateUsage.releaseReason === 'REPLACED_BY_RETRY') {
            try {
              // Reinstate to 'reserved' — the partial unique index on
              // {reward, status:'reserved'} atomically guards against the
              // same reward having since been re-reserved by something
              // else; that case throws (11000) and is left for manual
              // reconciliation rather than silently double-booking a
              // reward.
              await RewardUsage.updateOne(
                { _id: candidateUsage._id, status: 'released' },
                { $set: { status: 'reserved' }, $unset: { releasedAt: 1, releaseReason: 1 } }
              );
              // Whatever the newer, UNPAID attempt reserved instead must be
              // released now — it never actually got paid for.
              if (subscription.pendingReferralRewardUsageId && String(subscription.pendingReferralRewardUsageId) !== String(candidateUsage._id)) {
                await releaseReservation(subscription.pendingReferralRewardUsageId, 'REPLACED_BY_NEW_INVOICE');
              }
              subscription.pendingReferralRewardUsageId = candidateUsage._id;
              console.log(`Reconciled referral reward usage ${candidateUsage._id} back onto the actually-paid invoice for subscription ${subscription._id}.`);
            } catch (rewardErr) {
              console.error(`Could not reinstate referral reward usage ${candidateUsage._id} for subscription ${subscription._id} (likely re-reserved elsewhere). Manual reconciliation required.`, rewardErr.message);
            }
          } else if (candidateUsage && candidateUsage.status !== 'released') {
            // Already consumed/still-reserved as-is — nothing to fix.
          } else {
            // No RewardUsage found — the invoice's discount may be from a
            // coupon rather than a referral reward (BillingInvoice doesn't
            // record a per-modifier breakdown), which is expected and not
            // an error on its own.
            console.log(`CAW payment.captured: paid invoice for subscription ${subscription._id} has a discount but no matching released RewardUsage reservation was found (may be coupon-only).`);
          }
        }
      } else {
        console.error(`CAW payment.captured: paid plan "${paidPlanName}" not found/active — cannot reconcile superseded link ${paymentEntity.invoice_id} for subscription ${subscription._id}. Manual reconciliation required.`);
      }
    } else {
      console.error(`CAW payment.captured: superseded registration link ${paymentEntity.invoice_id} matched subscription ${subscription._id} via organization fallback, but no BillingInvoice/notes found to reconcile the correct plan. Manual reconciliation required.`);
    }
  }

  // Persist the fact.
  subscription.paymentStatus = 'payment_completed';
  subscription.lastPaymentAttempt = {
    razorpayPaymentId: paymentEntity.id,
    amount: paymentEntity.amount / 100,
    attemptedAt: new Date(),
    status: paymentEntity.status,
  };
  if (paymentEntity.token_id && !subscription.mandateTokenId) {
    subscription.mandateTokenId = paymentEntity.token_id;
  }
  await reconcileMandate(subscription);
}

async function handleCAWPaymentFailed(paymentEntity, razorpayEventId) {
  // Found while building Task 1 (Aug 2026): querying registrationLinkId with
  // a null/absent invoice_id — true for EVERY payment.failed that isn't a
  // mandate-registration invoice, including every renewal charge — matched
  // an ARBITRARY unrelated subscription with no registrationLinkId set
  // (Mongo's `{field: null}` matches both explicitly-null AND missing
  // fields), and then mutated that unrelated subscription's paymentStatus.
  // Confirmed live against the test database: it was silently corrupting a
  // leftover, unrelated subscription document on every run. Guard against
  // querying at all when there's no real invoice_id to correlate against.
  const subscription = paymentEntity.invoice_id
    ? await Subscription.findOne({ registrationLinkId: paymentEntity.invoice_id })
    : null;
  const recorded = await recordWebhookEventOnce(razorpayEventId, 'payment.failed', paymentEntity, subscription?._id);
  if (!recorded) return;
  if (!subscription) return;

  // Persist the fact only — no retry logic (Phase 7 owns retries), and no
  // activation (a failed auth payment must never activate anything).
  subscription.paymentStatus = 'payment_failed';
  subscription.lastPaymentAttempt = {
    razorpayPaymentId: paymentEntity.id,
    amount: paymentEntity.amount / 100,
    attemptedAt: new Date(),
    status: paymentEntity.status,
  };
  // Release rather than leave occupied for the full 30-min TTL — a failed
  // first-payment attempt (as opposed to one still awaiting confirmation)
  // frees the reward back up immediately, mirroring RF6's release pattern.
  if (subscription.pendingReferralRewardUsageId) {
    try {
      await releaseReservation(subscription.pendingReferralRewardUsageId, 'PAYMENT_FAILED');
      subscription.pendingReferralRewardUsageId = undefined;
    } catch (err) {
      console.error(`handleCAWPaymentFailed: reward release failed for ${subscription._id}:`, err.message);
    }
  }
  await subscription.save();
}

// Task 1 (Aug 2026) — closes a real gap found while auditing webhook
// reconciliation: handleCAWPaymentFailed above only matches by
// registrationLinkId, which is a mandate-ACQUISITION concept (used once,
// during onboarding) — it's absent/stale on an already-active, renewing
// subscription. A CAW RENEWAL charge (razorpayChargeMandate.js) creates its
// own Order via orders.create(), so an async payment.failed for that order
// (e.g. the bank declines after Razorpay accepted the recurring-payment
// request synchronously) previously matched NEITHER this file's payment.failed
// handler NOR the legacy razorpaySubscriptionId one — it was silently
// unhandled, not just untested. Correlates by order_id against the RENEWAL
// CommercialTransaction (target.orderId, persisted by renewalEngine.js's own
// failure/success branches as of this same fix) and reuses the EXACT same
// past_due transition renewSubscription() already performs for a
// synchronously-detected failure — no new failure-state path invented.
async function handleCAWRenewalPaymentFailed(paymentEntity, razorpayEventId) {
  const orderId = paymentEntity.order_id;
  if (!orderId) return;

  const commercialTransaction = await CommercialTransaction.findOne({
    type: 'RENEWAL',
    'target.orderId': orderId,
  });
  if (!commercialTransaction) return; // not a renewal charge — some other order type's payment.failed

  const subscription = await Subscription.findById(commercialTransaction.subscription);
  if (!subscription) return;

  // NOT recordWebhookEventOnce() here — handleCAWPaymentFailed above already
  // claims this same razorpayEventId via that helper's unique-index dedup
  // (uncorrelated, subscription: null, since its own registrationLinkId
  // lookup never matches a renewal). A second create() for the identical
  // eventId would collide against that same index and always report "already
  // processed," which would make this branch's own correlation permanently
  // unreachable. Instead: best-effort attach this handler's real correlation
  // onto that already-written row, and proceed unconditionally — every
  // mutation below (setAppStatus, failureReason) is naturally idempotent on
  // Razorpay's own at-least-once redelivery (setAppStatus is a documented
  // no-op when the target status already matches), so no separate dedup
  // guard is needed for correctness here.
  await RazorpayWebhookEvent.updateOne(
    { razorpayEventId, subscription: null },
    { $set: { subscription: subscription._id } }
  );

  // A payment.failed for an already-COMMITTED (succeeded) transaction is a
  // genuine anomaly, not a normal race — the synchronous charge path already
  // recorded success, so this must never silently undo it or re-fail the
  // subscription. Flag it for manual review only, same shape as this
  // codebase's existing RECONCILIATION_NEEDED convention (cycle-transition's
  // own boundary-mismatch branch uses the same string tag) — nothing
  // financial changes.
  if (['COMMITTED', 'COMPLETED'].includes(commercialTransaction.status)) {
    commercialTransaction.failureReason =
      `RECONCILIATION_NEEDED: payment.failed received for order ${orderId} after this RENEWAL transaction was already COMMITTED — verify with Razorpay before taking any action.`;
    await commercialTransaction.save();
    return;
  }

  // Only act while the transaction is still non-terminal (PRICED) — matches
  // renewSubscription()'s own invariant (Step 7 of Phase 4C design): a
  // COMMITTED transaction means the charge already succeeded through the
  // synchronous path, and this async webhook must never undo that. Also
  // covers the ordinary race where the synchronous chargeMandateFn call in
  // renewSubscription() ALREADY marked this same failure past_due before
  // this webhook even arrived — re-applying the identical transition is
  // harmless, but skip it if appStatus already reflects a worse/different
  // state than 'active'/'past_due' (e.g. already fully 'cancelled').
  if (commercialTransaction.status !== 'PRICED') return;
  if (!['active', 'past_due'].includes(subscription.appStatus)) return;

  setAppStatus(subscription, 'past_due', 'Renewal charge failed (webhook-detected)');
  await subscription.save();
}

async function handleCAWTokenEvent(tokenEntity, mandateStatus, razorpayEventId, eventName) {
  const subscription = await Subscription.findOne({ mandateTokenId: tokenEntity.id });
  const recorded = await recordWebhookEventOnce(razorpayEventId, eventName, tokenEntity, subscription?._id);
  if (!recorded) return;
  if (!subscription) return; // no direct correlation available yet — see file-header note; not an error

  subscription.mandateStatus = mandateStatus;
  if (mandateStatus === 'confirmed') {
    if (tokenEntity.max_amount) subscription.mandateMaxAmount = tokenEntity.max_amount / 100;
    if (tokenEntity.expired_at) subscription.mandateExpiresAt = new Date(tokenEntity.expired_at * 1000);
  }
  await reconcileMandate(subscription);

  // A rejected mandate used to end here: mandateStatus was written and nothing else happened.
  // But the FIRST PAYMENT has usually already been captured by this point (payment and mandate
  // are two separate results of the same registration link), so the customer is charged, cannot
  // be activated - activation requires a usable mandate - and was never told either fact. Found
  // live: an org paid Rs.295, the card failed tokenisation, and they sat on 'trial' with no
  // explanation and no refund until they complained.
  if (mandateStatus === 'rejected' || mandateStatus === 'cancelled') {
    await handleUnusableMandate(subscription, { tokenEntity, mandateStatus });
  }
}

// ============================================================
// Rejected/cancelled mandate with money already taken.
//
// The default is NOT to refund: reconcileMandate now activates the paid period regardless (see
// its gate above), so the customer gets what they bought and simply does not auto-renew. Refunding
// on top of that would be giving away the term.
//
// Set RAZORPAY_AUTO_REFUND_REJECTED_MANDATE=true to refund instead - appropriate only if you
// decide a subscription that cannot renew should not be sold at all. When enabled it is
// deliberately narrow: only the first payment tied to THIS subscription's own registration link,
// only when captured and not already refunded, and it records a REFUND billing event so the money
// movement is auditable rather than silent.
//
// Either way the failure reason is recorded for the customer-facing banner, and a payment we can
// neither deliver against nor return is escalated as BILLING_RECONCILIATION_NEEDED.
// ============================================================
async function handleUnusableMandate(subscription, { tokenEntity, mandateStatus }) {
  const autoRefundEnabled = process.env.RAZORPAY_AUTO_REFUND_REJECTED_MANDATE === 'true';

  const linkIds = [
    subscription.registrationLinkId,
    ...(subscription.priorRegistrationLinkIds || []),
  ].filter(Boolean);

  let refunded = null;
  let capturedPayment = null;

  for (const linkId of linkIds) {
    const invoice = await razorpay.invoices.fetch(linkId).catch(() => null);
    if (!invoice?.payment_id) continue;
    const payment = await razorpay.payments.fetch(invoice.payment_id).catch(() => null);
    if (payment?.status === 'captured' && (payment.amount_refunded || 0) < payment.amount) {
      capturedPayment = payment;
      break;
    }
  }

  if (capturedPayment && autoRefundEnabled) {
    try {
      refunded = await razorpay.payments.refund(capturedPayment.id, {
        speed: 'normal',
        notes: {
          reason: `mandate_${mandateStatus}`,
          subscription_id: String(subscription._id),
          organization_id: String(subscription.organization),
        },
      });
      // Money returned means the paid period is no longer paid for - undo the activation inputs so
      // the gate in reconcileMandate stops treating this as a delivered term.
      subscription.paymentStatus = 'payment_failed';
      subscription.isPaymentConfirmed = false;
      subscription.cancelAtPeriodEnd = false;
    } catch (err) {
      // A failed refund must not lose the rest of this handler (the alert still needs to fire).
      console.error('handleUnusableMandate: refund failed for', capturedPayment.id, err?.message);
    }
  }

  subscription.mandateFailureReason =
    tokenEntity?.error_description || tokenEntity?.notes?.reason || 'Bank rejected the auto-pay mandate';
  await subscription.save();

  const { emitBillingEvent } = require('../utils/billingEvents');

  if (refunded) {
    await emitBillingEvent({
      organization: subscription.organization,
      subscription: subscription._id,
      eventType: 'REFUND',
      status: 'completed',
      amount: (refunded.amount || 0) / 100,
      metadata: {
        reason: `Mandate ${mandateStatus} - first payment refunded automatically`,
        razorpayPaymentId: capturedPayment.id,
        razorpayRefundId: refunded.id,
      },
    });
  } else if (capturedPayment) {
    // Money is sitting on a subscription that can never activate, and we did not (or could not)
    // return it - that needs a human, so say so loudly rather than leaving it to be noticed.
    await emitBillingEvent({
      organization: subscription.organization,
      subscription: subscription._id,
      eventType: 'BILLING_RECONCILIATION_NEEDED',
      status: 'pending',
      amount: (capturedPayment.amount || 0) / 100,
      metadata: {
        reason: autoRefundEnabled
          ? `Mandate ${mandateStatus}; automatic refund of ${capturedPayment.id} failed - refund manually`
          : `Mandate ${mandateStatus}; paid period honoured without auto-renew (payment ${capturedPayment.id} kept)`,
        razorpayPaymentId: capturedPayment.id,
      },
    });
  }

  console.warn(
    `[mandate] ${mandateStatus} for organization ${subscription.organization}.`,
    capturedPayment
      ? `Captured payment ${capturedPayment.id}: ${refunded ? `refunded (${refunded.id})` : 'NOT refunded - needs manual handling'}.`
      : 'No captured first payment found.'
  );
}

// Exported so the future timeout-based reconciliation job (CAW_BILLING_DESIGN.md
// "Phase 3B Planning" — the one sweep job, not a family of crons) can call the
// exact same logic a webhook would have triggered.
exports.reconcileMandate = reconcileMandate;

// Webhook handler
exports.handleWebhook = async (req, res) => {
  try {
    const webhookSignature = req.headers["x-razorpay-signature"];
    const webhookBody = req.rawBody || '';

    console.log('Webhook received:', {
      event: req.body?.event,
      paymentId: req.body?.payload?.payment?.entity?.id,
      orderId: req.body?.payload?.payment?.entity?.order_id,
      subscriptionId: req.body?.payload?.subscription?.entity?.id,
      rawBodyLength: webhookBody.length,
      headers: req.headers,
    });

    // Verify webhook signature
    if (!webhookSignature || !webhookBody) {
      console.error('Webhook error: Missing signature or body', {
        webhookSignature,
        rawBodyLength: webhookBody.length,
      });
      return res.status(400).json({ error: "Missing webhook signature or body" });
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(webhookBody)
      .digest("hex");

    console.log('Signature verification:', {
      event: req.body?.event,
      webhookSignature,
      expectedSignature,
      isMatch: webhookSignature === expectedSignature,
    });

    if (webhookSignature !== expectedSignature) {
      console.error('Webhook signature mismatch:', {
        event: req.body?.event,
        webhookSignature,
        expectedSignature,
        rawBody: webhookBody.slice(0, 500),
      });
      return res.status(400).json({ error: "Invalid webhook signature" });
    }

    const event = req.body;
    const razorpayEventId = req.headers['x-razorpay-event-id'];
    switch (event.event) {
      case "payment.captured":
        // A manual-billing renewal link is settled on its own path and must
        // not also reach the first-payment handlers below (the CAW one's
        // organization fallback would treat it as a superseded signup link).
        if (await require('../utils/manualRenewal').settleManualRenewalPayment(event.payload.payment.entity)) break;
        await handlePaymentCaptured(event.payload.payment.entity);
        // CAW (Phase 3A) — additive, independent of the legacy handler above.
        // No-ops if this payment isn't tied to a CAW subscription.
        await handleCAWPaymentCaptured(event.payload.payment.entity, razorpayEventId);
        break;
      case "subscription.authenticated":
        await handleSubscriptionAuthenticated(event.payload.subscription.entity);
        break;
      case "subscription.activated":
        await handleSubscriptionActivated(event.payload.subscription.entity);
        break;
      case "subscription.charged":
        await handleSubscriptionCharged(
          event.payload.payment.entity,
          event.payload.subscription.entity
        );
        break;
      case "payment.failed":
        await handlePaymentFailed(event.payload.payment.entity);
        // CAW (Phase 3A) — additive, see payment.captured above.
        await handleCAWPaymentFailed(event.payload.payment.entity, razorpayEventId);
        // Task 1 (Aug 2026) — additive, closes the renewal-charge-failure
        // correlation gap (order_id, not registrationLinkId/subscriptionId).
        await handleCAWRenewalPaymentFailed(event.payload.payment.entity, razorpayEventId);
        break;
      case "subscription.cancelled":
        await handleSubscriptionCancelled(event.payload.subscription.entity);
        break;
      case "subscription.halted":
        await handleSubscriptionHalted(event.payload.subscription.entity);
        break;
      // CAW (Phase 3A) — new event types, no legacy equivalent.
      case "token.confirmed":
        await handleCAWTokenEvent(event.payload.token.entity, 'confirmed', razorpayEventId, event.event);
        break;
      case "token.paused":
        await handleCAWTokenEvent(event.payload.token.entity, 'paused', razorpayEventId, event.event);
        break;
      case "token.cancelled":
        await handleCAWTokenEvent(event.payload.token.entity, 'cancelled', razorpayEventId, event.event);
        break;
      case "token.rejected":
        await handleCAWTokenEvent(event.payload.token.entity, 'rejected', razorpayEventId, event.event);
        break;
      default:
        console.log("Unhandled webhook event:", event.event);
    }

    res.json({ status: "ok" });
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Webhook helper functions

async function handlePaymentCaptured(razorpayPayment) {
  console.log("Processing payment.captured:", {
    paymentId: razorpayPayment.id,
    orderId: razorpayPayment.order_id,
    amount: razorpayPayment.amount / 100,
    status: razorpayPayment.status,
    notes: razorpayPayment.notes,
  });

  // Dead legacy branch removed here (confirmed via live QA follow-up):
  // this used to handle upgrades via `subscription.pendingUpgrade` and the
  // classic razorpay.subscriptions.update() API. Confirmed by grep across
  // the whole codebase that nothing ever writes real data into
  // `pendingUpgrade` — every reference either read it defensively or set it
  // to null. It's a pre-CAW artifact from before this project's real upgrade
  // path (pendingPlanChange, handled elsewhere in this same file) replaced
  // it. Removing it here, not just leaving it dead, since it also never
  // applied a coupon modifier at all — a real gap were it ever reachable,
  // moot now that it's gone.

  // Handle add-on purchase payment (Order-based)
  const addonSubscription = await Subscription.findOne({
    'pendingAddonAddition.orderId': razorpayPayment.order_id,
  });

  if (addonSubscription && addonSubscription.pendingAddonAddition) {
    try {
      const pending = addonSubscription.pendingAddonAddition;
      const addonBeforeSnapshot = {
        planName: addonSubscription.planName,
        billingCycle: addonSubscription.billingCycle,
        pricePerUser: addonSubscription.pricePerUser,
        userCount: addonSubscription.userCount,
        totalAmount: addonSubscription.totalAmount,
        activeAddons: addonSubscription.activeAddons,
        appliedCoupon: addonSubscription.appliedCoupon,
      };

      // Verify amount (allow ₹1 rounding tolerance)
      const expectedPaise = pending.prorationAmount * 100;
      if (Math.abs(razorpayPayment.amount - expectedPaise) > 100) {
        console.error(`Add-on payment amount mismatch for order ${razorpayPayment.order_id}`, {
          expected: expectedPaise,
          received: razorpayPayment.amount,
        });
        return;
      }

      const plan = await PlanConfig.findOne({ planId: addonSubscription.planName, isActive: true });
      if (!plan) {
        console.error(`Plan not found for subscription ${addonSubscription._id}`);
        return;
      }

      // Phase 3 item 6: PRICED/AWAITING_PAYMENT -> COMMITTED. Correlated via
      // the orderId stored in `target` at request time — this lookup is
      // purely additive (observational write), never a dependency: settlement
      // above/below is still driven entirely by `pending` (pendingAddonAddition).
      // Payment confirmation is the commit point (BILLING_DOMAIN_SPECIFICATION.md
      // Chapter 15) — right here, since the amount check above already passed.
      let commercialTransaction = null;
      try {
        commercialTransaction = await CommercialTransaction.findOne({
          organization: addonSubscription.organization,
          subscription: addonSubscription._id,
          type: 'ADDON_PURCHASE',
          'target.orderId': razorpayPayment.order_id,
          status: 'AWAITING_PAYMENT',
        });
        if (commercialTransaction) {
          commercialTransaction.status = 'COMMITTED';
          commercialTransaction.lastAttemptAt = new Date();
          await commercialTransaction.save();
        }
      } catch (ctErr) {
        console.error(
          `CommercialTransaction COMMITTED update failed (non-fatal) — organization=${addonSubscription.organization} subscription=${addonSubscription._id} order=${razorpayPayment.order_id}:`,
          ctErr.message
        );
      }

      // Apply add-on to activeAddons.
      // Phase 2c: identity is (addonKey, billingCycle), not addonKey alone —
      // preserve billingCycle/periodEnd through the rebuild (previously
      // stripped here) and match/merge via addonIdentityKey, so a monthly
      // and annual instance of the same addonKey are never combined.
      const activeAddons = (addonSubscription.activeAddons || []).map((a) => ({
        addonKey: a.addonKey,
        quantity: a.quantity,
        pricePerUnit: a.pricePerUnit,
        addedAt: a.addedAt,
        billingCycle: a.billingCycle,
        periodEnd: a.periodEnd,
        // Task 1 (Aug 2026) — preserve through the rebuild, same reasoning
        // as billingCycle/periodEnd's own comment above: this independent
        // renewal clock must never silently reset just because a DIFFERENT
        // add-on purchase happened to touch this array.
        nextRenewalAt: a.nextRenewalAt,
        lastRenewalAt: a.lastRenewalAt,
      }));
      const pendingCycle = pending.billingCycle || addonSubscription.billingCycle;
      const existingIdx = activeAddons.findIndex(
        (a) => addonIdentityKey(a, addonSubscription.billingCycle) === addonIdentityKey({ addonKey: pending.addonKey, billingCycle: pendingCycle }, addonSubscription.billingCycle)
      );
      if (existingIdx >= 0) {
        // Adding units to an existing instance never resets its own anchor —
        // periodEnd (if any) is left untouched.
        activeAddons[existingIdx] = {
          ...activeAddons[existingIdx],
          quantity: activeAddons[existingIdx].quantity + pending.quantity,
        };
      } else {
        const addedAt = new Date();
        const periodEnd = pendingCycle === 'yearly'
          ? new Date(addedAt.getFullYear() + 1, addedAt.getMonth(), addedAt.getDate(), addedAt.getHours(), addedAt.getMinutes(), addedAt.getSeconds())
          : null;
        // Task 1 (Aug 2026): a monthly add-on landing on an ALREADY-annual
        // subscription needs its own independent renewal clock from day
        // one — this is exactly the mismatch addonRenewalEngine.js exists
        // for. An addon matching the subscription's own cycle leaves this
        // null (rides the base renewal, unchanged, no double-charge risk).
        activeAddons.push({
          addonKey: pending.addonKey,
          quantity: pending.quantity,
          pricePerUnit: pending.pricePerUnit,
          addedAt,
          billingCycle: pendingCycle,
          periodEnd,
          nextRenewalAt: (pendingCycle === 'monthly' && addonSubscription.billingCycle === 'yearly')
            ? computeNextAddonRenewalDate(addedAt)
            : null,
        });
      }

      // Compute new combined recurring total (base + all addons)
      // Phase 3 item 5c (Category C harmonization): matches the upgrade
      // settlement branch above, which already prices its recurring baseline
      // via calculateInvoice() — this add-on branch was the one asymmetry
      // left (BUG report / IMPLEMENTATION_PLAN_V1.md), now closed the same way.
      const newTotal = calculateInvoice({
        subscription: {
          planName: plan.planId,
          billingCycle: addonSubscription.billingCycle,
          pricePerUser: addonSubscription.billingCycle === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice,
          activeAddons,
        },
      }).taxable;

      // Update Razorpay subscription plan — takes effect NEXT billing cycle.
      // Task 0 (Aug 2026) — CONFIRMED LIVE CRASH: this whole block is legacy
      // Razorpay-Subscriptions-API-specific (updates the OLD recurring
      // "Subscription" object's plan for its next cycle) and was being run
      // UNCONDITIONALLY, including for CAW subscriptions that have no
      // razorpaySubscriptionId and no such object to update at all. For
      // those, findOrCreateRazorpayPlan()'s razorpay.plans.create() call
      // (utils/addonManagement.js) threw a real, uncaught 401 Unauthorized
      // from Razorpay (this account isn't provisioned for the legacy
      // Plans/Subscriptions product — same 401 already documented elsewhere
      // in this codebase, e.g. cycleTransitionLifecycle.js's own file-header
      // note) — reproduced directly against a disposable clone of the real
      // stuck record (order_TNzKWCQ2iaVPY1) before this fix, confirmed gone
      // after. That crash propagated straight out of the webhook handler,
      // Razorpay retried delivery repeatedly (the six 500s), and the add-on
      // purchase never committed — pendingAddonAddition stuck forever.
      let newPlanId; // stays undefined for CAW subscriptions — no legacy Razorpay Plan object involved
      if (addonSubscription.razorpaySubscriptionId) {
        try {
          newPlanId = await findOrCreateRazorpayPlan(newTotal, addonSubscription.billingCycle, plan.planId);
          await razorpay.subscriptions.update(addonSubscription.razorpaySubscriptionId, {
            plan_id: newPlanId,
            schedule_change_at: 'cycle_end',
          });
          console.log(`Razorpay subscription updated to new plan ${newPlanId}`);
        } catch (razorpayUpdateError) {
          console.warn(
            `Could not update Razorpay subscription plan (likely UPI — will sync at next renewal): ${razorpayUpdateError?.error?.description || razorpayUpdateError.message}`
          );
          // Do NOT re-throw — payment succeeded, addon must be activated regardless.
        }
      }

      const referralRewardUsageId = pending.referralRewardUsageId;

      addonSubscription.activeAddons = activeAddons;
      addonSubscription.razorpayPlanId = newPlanId;
      addonSubscription.totalAmount = newTotal;
      addonSubscription.pendingAddonAddition = undefined;
      await addonSubscription.save();

      // Phase 3 item 6: COMMITTED -> COMPLETED, now that the commercial
      // change has actually been applied and persisted.
      if (commercialTransaction) {
        try {
          commercialTransaction.status = 'COMPLETED';
          await commercialTransaction.save();
        } catch (ctErr) {
          console.error(
            `CommercialTransaction COMPLETED update failed (non-fatal) — organization=${addonSubscription.organization} subscription=${addonSubscription._id} transaction=${commercialTransaction._id}:`,
            ctErr.message
          );
        }
      }

      // Consume the reserved referral reward, if this checkout used one —
      // settlement is the only place a RewardUsage moves to 'consumed'
      // (REFERRAL_SYSTEM_DESIGN.md §9/§16). consumeReservation is an atomic
      // conditional update: a duplicate webhook delivery finds the row no
      // longer 'reserved' and is a no-op, so the reward can't be consumed —
      // or its event double-emitted — twice.
      if (referralRewardUsageId) {
        try {
          await consumeReservation(referralRewardUsageId);
        } catch (rewardErr) {
          console.error('Failed to consume referral reward usage:', rewardErr.message);
        }
      }

      // Record payment
      let addonPayment = null;
      try {
        addonPayment = new SubscriptionPayment({
          organization: addonSubscription.organization,
          subscription: addonSubscription._id,
          razorpayPaymentId: razorpayPayment.id,
          amount: razorpayPayment.amount / 100,
          status: razorpayPayment.status,
          method: razorpayPayment.method,
          paymentFor: 'addon_purchase',
        });
        await addonPayment.save();
      } catch (paymentError) {
        console.error('Failed to record add-on payment:', paymentError.message);
      }

      await emitBillingEvent({
        organization: addonSubscription.organization,
        subscription: addonSubscription._id,
        eventType: 'ADDON_ADDED',
        status: 'completed',
        before: addonBeforeSnapshot,
        after: addonSubscription,
        amounts: {
          prorated: pending.prorationAmount,
          paid: razorpayPayment.amount / 100,
          recurringBefore: addonBeforeSnapshot.totalAmount,
          recurringAfter: newTotal,
        },
        payment: addonPayment?._id,
        razorpay: { orderId: pending.orderId, paymentId: razorpayPayment.id, subscriptionId: addonSubscription.razorpaySubscriptionId },
        metadata: { addonKey: pending.addonKey, quantity: pending.quantity },
      });

      // If this add-on purchase was the seat needed to complete a pending
      // invite, finalize it now — settlement is the single place allowed to
      // turn "intent" (Invited.pendingPayment) into canonical state.
      if (pending.addonKey === 'extra_seat') {
        try {
          const pendingInvite = await Invited.findOne({
            organization: addonSubscription.organization,
            pendingSeatOrderId: razorpayPayment.order_id,
            pendingPayment: true,
          });
          if (pendingInvite) {
            pendingInvite.pendingPayment = false;
            pendingInvite.pendingSeatOrderId = undefined;
            await pendingInvite.save();

            const org = await Organization.findById(addonSubscription.organization);
            const html = generateInviteEmailHTML(process.env.FRONTEND_URL, org.name, pendingInvite.invitedByName || '');
            sendGridMail({ to: pendingInvite.email, subject: `${pendingInvite.invitedByName || "A colleague"} has invited you to join ${org.name} on DataCircles`, html });
            console.log(`Pending invite for ${pendingInvite.email} finalized after seat purchase (order ${razorpayPayment.order_id})`);
          }
        } catch (inviteErr) {
          console.error(`Failed to finalize pending invite for order ${razorpayPayment.order_id}:`, inviteErr.message);
        }
      }

      console.log(`Add-on ${razorpayPayment.notes?.addon_key} ×${razorpayPayment.notes?.quantity} activated for subscription ${addonSubscription._id}. New recurring total: ₹${newTotal}`);
    } catch (error) {
      console.error(`Failed to process add-on payment for order ${razorpayPayment.order_id}:`, error);
      throw error;
    }
    return;
  }

  // Handle Monthly -> Annual cycle-transition payment (Phase 3,
  // docs/audit/PHASE3_MONTHLY_TO_ANNUAL_PRORATION.md). Same Order-based
  // settlement shape as add-on purchases above — see this session's four
  // stated decisions before touching this block:
  //   1. Recompute the entitlement window fresh at commit (getEntitlementWindow
  //      with a fresh `now`), never trust the initiation-time stored window as
  //      the new currentPeriodEnd — that was the original stale-window flaw.
  //   2. CommercialTransaction.type: 'BILLING_CYCLE_CHANGE' — independent of
  //      ScheduledChange's own (unrelated, deferred-path) use of the same word.
  //   3. Boundary-mismatch fail-safe: if the recomputed windowStart differs
  //      from the QUOTED windowStart (a 12-month anchor boundary was crossed
  //      between initiation and settlement), do NOT commit billingCycle/
  //      currentPeriodStart/End — leave the subscription exactly as it is
  //      (still monthly, fully safe) and log loudly for manual reconciliation,
  //      reusing this codebase's existing RECONCILIATION_NEEDED shape rather
  //      than inventing a new stored state.
  //   4. No self-service/admin clear-path for a stuck pendingCycleTransition
  //      exists yet (inherited limitation, matches pendingAddonAddition's
  //      existing gap) — if RECONCILIATION_NEEDED is ever actually observed
  //      in production, building a clear-path becomes the immediate next
  //      task, not something to defer further at that point.
  const cycleTransitionSubscription = await Subscription.findOne({
    'pendingCycleTransition.orderId': razorpayPayment.order_id,
  });

  if (cycleTransitionSubscription && cycleTransitionSubscription.pendingCycleTransition) {
    try {
      const pending = cycleTransitionSubscription.pendingCycleTransition;

      // Task 2: the Order covers the base transition PLUS every itemized
      // add-on conversion — the mismatch check must verify against that
      // combined total, not just the base amount alone.
      const addonConversionTotal = (pending.addonConversions || []).reduce((sum, c) => sum + (c.amount || 0), 0);
      const expectedPaise = (pending.amount + addonConversionTotal) * 100;
      if (Math.abs(razorpayPayment.amount - expectedPaise) > 100) {
        console.error(`Cycle-transition payment amount mismatch for order ${razorpayPayment.order_id}`, {
          expected: expectedPaise,
          received: razorpayPayment.amount,
        });
        return;
      }

      // Decision 1 — recompute fresh at commit, never trust the stored window.
      const nowAtCommit = new Date();
      const { windowStart: recomputedStart, windowEnd: recomputedEnd } = getEntitlementWindow(
        cycleTransitionSubscription.billingAnchor,
        nowAtCommit
      );

      // Decision 3 — boundary-mismatch detection. Compare the anchor-relative
      // window START (the window's identity), not the end — two computations
      // of the SAME window always agree on both start and end, so a mismatch
      // in start alone is sufficient and unambiguous evidence a boundary was
      // crossed between initiation and settlement.
      const quotedStart = pending.windowStart ? new Date(pending.windowStart).getTime() : null;
      if (quotedStart !== recomputedStart.getTime()) {
        console.error(
          `RECONCILIATION_NEEDED: cycle-transition window boundary crossed between initiation and settlement — ` +
          `organization=${cycleTransitionSubscription.organization} subscription=${cycleTransitionSubscription._id} ` +
          `order=${razorpayPayment.order_id} payment=${razorpayPayment.id} amountCharged=${pending.amount} ` +
          `quotedWindowStart=${pending.windowStart} quotedWindowEnd=${pending.windowEnd} ` +
          `recomputedWindowStart=${recomputedStart.toISOString()} recomputedWindowEnd=${recomputedEnd.toISOString()}. ` +
          `Payment WAS captured — subscription intentionally left unchanged (still ${cycleTransitionSubscription.billingCycle}), ` +
          `pendingCycleTransition intentionally left set to block a competing retry. Requires manual review — ` +
          `no automated clear-path exists yet (Decision 4).`
        );
        return;
      }

      const beforeSnapshot = {
        planName: cycleTransitionSubscription.planName,
        billingCycle: cycleTransitionSubscription.billingCycle,
        pricePerUser: cycleTransitionSubscription.pricePerUser,
        currentPeriodStart: cycleTransitionSubscription.currentPeriodStart,
        currentPeriodEnd: cycleTransitionSubscription.currentPeriodEnd,
        totalAmount: cycleTransitionSubscription.totalAmount,
      };

      let commercialTransaction = null;
      try {
        commercialTransaction = await CommercialTransaction.findOne({
          organization: cycleTransitionSubscription.organization,
          subscription: cycleTransitionSubscription._id,
          type: 'BILLING_CYCLE_CHANGE',
          'target.orderId': razorpayPayment.order_id,
          status: 'AWAITING_PAYMENT',
        });
        if (commercialTransaction) {
          commercialTransaction.status = 'COMMITTED';
          commercialTransaction.lastAttemptAt = new Date();
          await commercialTransaction.save();
        }
      } catch (ctErr) {
        console.error(
          `CommercialTransaction COMMITTED update failed (non-fatal) — organization=${cycleTransitionSubscription.organization} subscription=${cycleTransitionSubscription._id} order=${razorpayPayment.order_id}:`,
          ctErr.message
        );
      }

      // Cross-tier: targetPlanId defaults to the subscription's own current
      // plan at initiation time (see initiateMonthlyToAnnualTransition), so
      // this is a same-tier no-op assignment for every existing/same-tier
      // caller and a real plan change only when a different target was
      // explicitly requested.
      cycleTransitionSubscription.planName = pending.targetPlanId || cycleTransitionSubscription.planName;
      cycleTransitionSubscription.billingCycle = pending.targetBillingCycle;
      cycleTransitionSubscription.pricePerUser = pending.targetPricePerUser;
      cycleTransitionSubscription.totalAmount = pending.targetPricePerUser; // add-ons priced separately, unaffected by this transition
      cycleTransitionSubscription.currentPeriodStart = recomputedStart;
      cycleTransitionSubscription.currentPeriodEnd = recomputedEnd;
      // Bug found via live QA (Aug 2026): nextBillingDate was left stale at
      // this commit site — every other CAW write site keeps it in sync with
      // currentPeriodEnd (e.g. :3049's first-activation write), this one
      // didn't, so "Next Renewal" on the Billing page kept showing the old
      // monthly subscription's date after an annual transition.
      cycleTransitionSubscription.nextBillingDate = recomputedEnd;
      // billingAnchor is NEVER touched — Phase 1 invariant, immutable once set.
      // Assigning undefined here correctly unsets the field in the stored
      // document (confirmed directly against the raw Mongo collection, not
      // assumed) — a reloaded Mongoose document will still show `{}` for this
      // path (single-nested-subdocument types always hydrate as an object on
      // read), which is normal and harmless; every real guard in this
      // codebase already checks `.orderId` specifically, never equality to
      // undefined, for exactly this reason.
      cycleTransitionSubscription.pendingCycleTransition = undefined;

      // Business contract (this session, matrix item 12): a deliberate
      // annual base-plan purchase supersedes any pending BASE-PLAN scheduled
      // change. Add-on-scoped ScheduledChange/pendingAddonRemovals records
      // are explicitly NOT touched here — independent concern.
      await ScheduledChange.updateMany(
        {
          organization: cycleTransitionSubscription.organization,
          subscription: cycleTransitionSubscription._id,
          type: { $in: ['PLAN_CHANGE', 'BILLING_CYCLE_CHANGE'] },
          status: 'PENDING',
        },
        { $set: { status: 'CANCELLED', reason: 'Superseded by immediate Monthly->Annual transition' } }
      );

      // Task 2 (Aug 2026): apply the user's explicit per-add-on choices —
      // computed and priced at initiation (pending.addonConversions),
      // re-applied here unconditionally at commit (no re-verification
      // needed the way the base window has one, since an add-on's own
      // catalog price doesn't drift the way an anchor-relative window
      // boundary can). Every add-on NOT in this list is a 'monthly' (no
      // choice made) or already-incompatible add-on — untouched here,
      // exactly matching Task 1's fix: no add-on's billingCycle/pricePerUnit
      // changes automatically, full stop.
      // Live-QA correctness fix (Aug 2026): conversion.quantity is the
      // SURVIVING quantity (computeAddonConversionPricing now excludes
      // whatever's already scheduled for removal) — NOT necessarily the
      // instance's full raw quantity. Converting the whole raw quantity here
      // would have silently swallowed a pending partial removal (e.g. Seat
      // ×2 with 1 already scheduled to go — the surviving 1 converts to
      // Annual, the other 1 stays Monthly with its removal untouched, never
      // both collapsed into one annual instance).
      for (const conversion of pending.addonConversions || []) {
        const idx = (cycleTransitionSubscription.activeAddons || []).findIndex(
          (a) => a.addonKey === conversion.addonKey && (a.billingCycle || 'monthly') !== 'yearly'
        );
        if (idx < 0) continue; // already converted/removed by a concurrent action — skip rather than duplicate
        const existing = cycleTransitionSubscription.activeAddons[idx];
        const existingPlain = existing.toObject ? existing.toObject() : existing;
        const remainingMonthlyQty = existingPlain.quantity - conversion.quantity;

        if (remainingMonthlyQty > 0) {
          // Partial: shrink the monthly instance to whatever's left (still
          // carrying its own pending removal, if any — untouched), and add a
          // NEW, separate annual instance for the converted portion.
          cycleTransitionSubscription.activeAddons[idx] = { ...existingPlain, quantity: remainingMonthlyQty };
          cycleTransitionSubscription.activeAddons.push({
            addonKey: conversion.addonKey,
            quantity: conversion.quantity,
            pricePerUnit: conversion.toPricePerUnit,
            billingCycle: 'yearly',
            addedAt: new Date(),
            periodEnd: recomputedEnd,
          });
        } else {
          // Whole (surviving) quantity converts — no leftover monthly
          // portion to keep separate, safe to convert this instance in place.
          cycleTransitionSubscription.activeAddons[idx] = {
            ...existingPlain,
            billingCycle: 'yearly',
            pricePerUnit: conversion.toPricePerUnit,
            // Align to the SAME annual window the base plan just entered —
            // the natural choice once this add-on is genuinely annual too.
            periodEnd: recomputedEnd,
          };
        }
      }

      // Task 1 (Aug 2026): every OTHER compatible add-on — "keep Monthly"
      // (no choice made, or explicitly kept) — needs its own independent
      // renewal clock started now that the BASE plan just became annual.
      // Before this, "keep Monthly" silently meant "never charged again
      // except once a year alongside the base" (the exact undercharging bug
      // Task 1 exists to close). billingCycle/pricePerUnit stay completely
      // untouched here — only the renewal clock is being started.
      const incompatibleKeys = new Set((pending.incompatibleAddons || []).map((a) => a.addonKey));
      const convertedKeys = new Set((pending.addonConversions || []).map((a) => a.addonKey));
      for (const addon of cycleTransitionSubscription.activeAddons || []) {
        if (incompatibleKeys.has(addon.addonKey) || convertedKeys.has(addon.addonKey)) continue;
        if ((addon.billingCycle || 'monthly') !== 'monthly') continue; // already yearly — rides its own periodEnd, not this engine
        if (addon.nextRenewalAt) continue; // already independently clocked (e.g. purchased after an earlier transition)
        addon.nextRenewalAt = computeNextAddonRenewalDate(new Date());
      }

      // Existing add-ons the target plan doesn't support at all — access
      // continues on the current (monthly) term; scheduled for removal at
      // that term's own natural end (computed at initiation), never forced
      // early. Mirrors the plan-downgrade incompatible-addon pattern.
      for (const incompatible of pending.incompatibleAddons || []) {
        const already = (cycleTransitionSubscription.pendingAddonRemovals || [])
          .find((r) => r.addonKey === incompatible.addonKey);
        if (already) continue;
        cycleTransitionSubscription.pendingAddonRemovals = [
          ...(cycleTransitionSubscription.pendingAddonRemovals || []),
          {
            addonKey: incompatible.addonKey,
            displayName: incompatible.addonKey,
            quantity: incompatible.quantity,
            pricePerUnit: incompatible.pricePerUnit,
            scheduledAt: new Date(),
            effectiveAt: incompatible.effectiveAt,
          },
        ];
        try {
          await ScheduledChange.create({
            organization: cycleTransitionSubscription.organization,
            subscription: cycleTransitionSubscription._id,
            type: 'REMOVE_ADDON',
            status: 'PENDING',
            effectiveAt: incompatible.effectiveAt,
            payload: { addonKey: incompatible.addonKey, quantity: incompatible.quantity },
          });
        } catch (scErr) {
          console.error(
            `Scheduling incompatible-addon removal failed (non-fatal) — organization=${cycleTransitionSubscription.organization} subscription=${cycleTransitionSubscription._id} addonKey=${incompatible.addonKey}:`,
            scErr.message
          );
        }
      }

      await cycleTransitionSubscription.save();

      if (commercialTransaction) {
        try {
          commercialTransaction.status = 'COMPLETED';
          await commercialTransaction.save();
        } catch (ctErr) {
          console.error(
            `CommercialTransaction COMPLETED update failed (non-fatal) — organization=${cycleTransitionSubscription.organization} subscription=${cycleTransitionSubscription._id} transaction=${commercialTransaction._id}:`,
            ctErr.message
          );
        }
      }

      try {
        await new SubscriptionPayment({
          organization: cycleTransitionSubscription.organization,
          subscription: cycleTransitionSubscription._id,
          razorpayPaymentId: razorpayPayment.id,
          amount: razorpayPayment.amount / 100,
          status: razorpayPayment.status,
          method: razorpayPayment.method,
          paymentFor: 'cycle_transition_monthly_to_annual',
        }).save();
      } catch (paymentError) {
        console.error('Failed to record cycle-transition payment:', paymentError.message);
      }

      await emitBillingEvent({
        organization: cycleTransitionSubscription.organization,
        subscription: cycleTransitionSubscription._id,
        eventType: 'BILLING_CYCLE_CHANGE_COMPLETED',
        status: 'completed',
        before: beforeSnapshot,
        after: cycleTransitionSubscription,
        amounts: {
          paid: razorpayPayment.amount / 100,
          recurringBefore: beforeSnapshot.totalAmount,
          recurringAfter: cycleTransitionSubscription.totalAmount,
        },
        razorpay: { orderId: pending.orderId, paymentId: razorpayPayment.id },
        metadata: { windowStart: recomputedStart, windowEnd: recomputedEnd },
      });

      console.log(`Subscription ${cycleTransitionSubscription._id} transitioned Monthly -> Annual. New period: ${recomputedStart.toISOString()} -> ${recomputedEnd.toISOString()}`);
    } catch (error) {
      console.error(`Failed to process cycle-transition payment for order ${razorpayPayment.order_id}:`, error);
      throw error;
    }
    return;
  }

  // Task 3 (Aug 2026) — reactivating a LAPSED subscription. Same Order-based
  // settlement shape as the cycle-transition block above, and the SAME
  // boundary-mismatch recompute-at-commit discipline for the yearly case
  // (billingAnchor never moves; the window is recomputed fresh here, never
  // trusted from initiation time). billingAnchor is NEVER written — the
  // entire point of this flow (BILLING_DOMAIN_SPECIFICATION.md's "AMENDED
  // (Aug 2026, Task D)" policy) is reusing the SAME Subscription document
  // and its original anchor, not creating a fresh one.
  const reactivationSubscription = await Subscription.findOne({
    'pendingReactivation.orderId': razorpayPayment.order_id,
  });

  if (reactivationSubscription && reactivationSubscription.pendingReactivation) {
    try {
      const pending = reactivationSubscription.pendingReactivation;

      const expectedPaise = pending.amount * 100;
      if (Math.abs(razorpayPayment.amount - expectedPaise) > 100) {
        console.error(`Reactivation payment amount mismatch for order ${razorpayPayment.order_id}`, {
          expected: expectedPaise,
          received: razorpayPayment.amount,
        });
        return;
      }

      let recomputedStart;
      let recomputedEnd;
      if (pending.targetBillingCycle === 'yearly') {
        const nowAtCommit = new Date();
        const recomputed = getEntitlementWindow(reactivationSubscription.billingAnchor, nowAtCommit);
        // Same boundary-mismatch fail-safe as the cycle-transition commit
        // above: a window boundary crossed between initiation and
        // settlement must never silently commit a mismatched window.
        const quotedStart = pending.windowStart ? new Date(pending.windowStart).getTime() : null;
        if (quotedStart !== recomputed.windowStart.getTime()) {
          console.error(
            `RECONCILIATION_NEEDED: reactivation window boundary crossed between initiation and settlement — ` +
            `organization=${reactivationSubscription.organization} subscription=${reactivationSubscription._id} ` +
            `order=${razorpayPayment.order_id} payment=${razorpayPayment.id} amountCharged=${pending.amount}. ` +
            `Payment WAS captured — subscription intentionally left unchanged (still cancelled), ` +
            `pendingReactivation intentionally left set to block a competing retry. Requires manual review.`
          );
          return;
        }
        recomputedStart = recomputed.windowStart;
        recomputedEnd = recomputed.windowEnd;
      } else {
        // Monthly has no anchor-relative window to re-verify — a fresh
        // period simply starts now, same as any other new monthly period.
        recomputedStart = new Date();
        recomputedEnd = addCalendarMonths(recomputedStart, 1);
      }

      const beforeSnapshot = {
        appStatus: reactivationSubscription.appStatus,
        planName: reactivationSubscription.planName,
        billingCycle: reactivationSubscription.billingCycle,
        cancelAtPeriodEnd: reactivationSubscription.cancelAtPeriodEnd,
      };

      let commercialTransaction = null;
      try {
        commercialTransaction = await CommercialTransaction.findOne({
          organization: reactivationSubscription.organization,
          subscription: reactivationSubscription._id,
          type: 'RENEWAL',
          'target.orderId': razorpayPayment.order_id,
          status: 'AWAITING_PAYMENT',
        });
        if (commercialTransaction) {
          commercialTransaction.status = 'COMMITTED';
          commercialTransaction.lastAttemptAt = new Date();
          await commercialTransaction.save();
        }
      } catch (ctErr) {
        console.error(
          `CommercialTransaction COMMITTED update failed (non-fatal) — organization=${reactivationSubscription.organization} subscription=${reactivationSubscription._id} order=${razorpayPayment.order_id}:`,
          ctErr.message
        );
      }

      reactivationSubscription.planName = pending.targetPlanId;
      reactivationSubscription.billingCycle = pending.targetBillingCycle;
      reactivationSubscription.pricePerUser = pending.targetPricePerUser;
      reactivationSubscription.totalAmount = pending.targetPricePerUser; // add-ons don't survive a lapse — org resumes bare, same as a fresh subscribe
      reactivationSubscription.currentPeriodStart = recomputedStart;
      reactivationSubscription.currentPeriodEnd = recomputedEnd;
      reactivationSubscription.nextBillingDate = recomputedEnd;
      reactivationSubscription.cancelAtPeriodEnd = false;
      reactivationSubscription.isPaymentConfirmed = true;
      reactivationSubscription.paymentStatus = 'payment_completed';
      setAppStatus(reactivationSubscription, 'active', 'Subscription reactivated after lapse');
      // billingAnchor is NEVER touched — the whole point of this flow.
      reactivationSubscription.pendingReactivation = undefined;

      await reactivationSubscription.save();

      if (commercialTransaction) {
        try {
          commercialTransaction.status = 'COMPLETED';
          await commercialTransaction.save();
        } catch (ctErr) {
          console.error(
            `CommercialTransaction COMPLETED update failed (non-fatal) — organization=${reactivationSubscription.organization} subscription=${reactivationSubscription._id} transaction=${commercialTransaction._id}:`,
            ctErr.message
          );
        }
      }

      try {
        await new SubscriptionPayment({
          organization: reactivationSubscription.organization,
          subscription: reactivationSubscription._id,
          razorpayPaymentId: razorpayPayment.id,
          amount: razorpayPayment.amount / 100,
          status: razorpayPayment.status,
          method: razorpayPayment.method,
          paymentFor: 'reactivation',
        }).save();
      } catch (paymentError) {
        console.error('Failed to record reactivation payment:', paymentError.message);
      }

      await emitBillingEvent({
        organization: reactivationSubscription.organization,
        subscription: reactivationSubscription._id,
        eventType: 'SUBSCRIPTION_REACTIVATED',
        status: 'completed',
        before: beforeSnapshot,
        after: reactivationSubscription,
        amounts: { paid: razorpayPayment.amount / 100, recurringAfter: reactivationSubscription.totalAmount },
        razorpay: { orderId: pending.orderId, paymentId: razorpayPayment.id },
        metadata: { windowStart: recomputedStart, windowEnd: recomputedEnd },
      });

      console.log(`Subscription ${reactivationSubscription._id} reactivated. New period: ${recomputedStart.toISOString()} -> ${recomputedEnd.toISOString()}`);
    } catch (error) {
      console.error(`Failed to process reactivation payment for order ${razorpayPayment.order_id}:`, error);
      throw error;
    }
    return;
  }

  // Handle plan upgrade payment confirmation (Order-based, UPI-compatible)
  const upgradeSubscription = await Subscription.findOne({
    'pendingPlanChange.orderId': razorpayPayment.order_id,
  });

  if (upgradeSubscription && upgradeSubscription.pendingPlanChange) {
    try {
      const pending = upgradeSubscription.pendingPlanChange;
      const upgradeReferralRewardUsageId = pending.referralRewardUsageId;
      // Snapshot BEFORE any mutation below overwrites planName/totalAmount/etc.
      const beforeSnapshot = {
        planName: upgradeSubscription.planName,
        billingCycle: upgradeSubscription.billingCycle,
        pricePerUser: upgradeSubscription.pricePerUser,
        userCount: upgradeSubscription.userCount,
        totalAmount: upgradeSubscription.totalAmount,
        activeAddons: upgradeSubscription.activeAddons,
        appliedCoupon: upgradeSubscription.appliedCoupon,
      };

      // Verify amount (allow ₹1 rounding tolerance)
      const expected = pending.proratedDiffCharged * 100;
      if (Math.abs(razorpayPayment.amount - expected) > 100) {
        console.error(`Upgrade payment amount mismatch for order ${razorpayPayment.order_id}`, {
          expected, received: razorpayPayment.amount,
        });
        return;
      }

      const newPlan = await PlanConfig.findOne({ planId: pending.newPlanName, isActive: true });
      if (!newPlan) { console.error(`New plan ${pending.newPlanName} not found`); return; }

      // Phase 3 continued (upgrade): PRICED/AWAITING_PAYMENT -> COMMITTED.
      // Correlated via the orderId stored in `target` at request time — this
      // lookup is purely additive (observational write), never a dependency:
      // settlement below is still driven entirely by `pending` (pendingPlanChange).
      // Payment confirmation is the commit point (BILLING_DOMAIN_SPECIFICATION.md
      // Chapter 15) — right here, since the amount check above already passed.
      let upgradeCommercialTransaction = null;
      try {
        upgradeCommercialTransaction = await CommercialTransaction.findOne({
          organization: upgradeSubscription.organization,
          subscription: upgradeSubscription._id,
          type: 'UPGRADE',
          'target.orderId': razorpayPayment.order_id,
          status: 'AWAITING_PAYMENT',
        });
        if (upgradeCommercialTransaction) {
          upgradeCommercialTransaction.status = 'COMMITTED';
          upgradeCommercialTransaction.lastAttemptAt = new Date();
          await upgradeCommercialTransaction.save();
        }
      } catch (ctErr) {
        console.error(
          `CommercialTransaction COMMITTED update failed (non-fatal) — organization=${upgradeSubscription.organization} subscription=${upgradeSubscription._id} order=${razorpayPayment.order_id}:`,
          ctErr.message
        );
      }

      // ENTITLEMENTS CHANGE NOW — planName drives restrictByPlan limits/modules
      upgradeSubscription.planName = pending.newPlanName;
      upgradeSubscription.pricePerUser = pending.newBasePrice;

      const compatibleAddons = pending.compatibleAddons || [];
      const incompatibleAddons = pending.incompatibleAddons || [];
      const newAddonPurchases = pending.newAddonPurchases || [];

      // New combined recurring total: base + carried-forward + newly purchased
      // add-ons. incompatibleAddons are deliberately excluded from billing —
      // they're kept in activeAddons below only until pendingAddonRemovals
      // removes them at cycle end, not billed again this cycle.
      // P0 CORRECTNESS FIX (found via live QA): this commit-time recompute
      // was missing the coupon modifier entirely — the PREVIEW step earlier
      // in this same upgrade flow (updateSubscription's newCouponModifier,
      // built from the identical fullRulesSnapshot/line-items shape) DID
      // include it, so the customer was quoted a discounted total, but the
      // webhook that actually commits the new RECURRING totalAmount silently
      // dropped it. This wasn't specific to first_payment coupons — ANY
      // coupon (including lifetime/until_cancelled, which should keep
      // discounting every renewal) would have lost its discount the instant
      // an upgrade committed, while appliedCoupon itself stayed on the
      // document unchanged — exactly why the UI kept showing "Coupon
      // Applied" against an undiscounted total. Rebuilt here identically to
      // the preview step.
      //
      // CORRECTION (Coupon P0, found one trace later): this comment
      // previously claimed "duration.type only gates RENEWAL re-eligibility,
      // never upgrade re-application" — that was wrong, discovered while
      // tracing why a first_payment coupon kept discounting after its first
      // payment. Upgrade re-application must respect the SAME eligibility
      // question renewal already asks correctly; it just wasn't asking it
      // anywhere in this file until now.
      const newLineItemsAtCommit = [...compatibleAddons, ...newAddonPurchases].map((a) => ({ key: a.addonKey, type: 'addon', amount: a.quantity * a.pricePerUnit }));
      newLineItemsAtCommit.unshift({ key: pending.newPlanName, type: 'plan', amount: pending.newBasePrice });
      const commitCouponModifier = (upgradeSubscription.appliedCoupon?.fullRulesSnapshot && isCouponStillEligibleForRenewal(upgradeSubscription.appliedCoupon))
        ? buildCouponModifierForLineItems(upgradeSubscription.appliedCoupon.fullRulesSnapshot, newLineItemsAtCommit)
        : null;

      // Phase 5: calculateInvoice() is now the pricing authority here (same
      // equivalence guarantee as the Phase 4 createSubscription integration —
      // it's still buildPricingSnapshot underneath, just via the single
      // designated call path). No other call site in this function changed.
      const invoice = calculateInvoice({
        subscription: {
          planName: pending.newPlanName,
          billingCycle: upgradeSubscription.billingCycle,
          pricePerUser: pending.newBasePrice,
          activeAddons: [...compatibleAddons, ...newAddonPurchases],
        },
        resolvedModifiers: commitCouponModifier ? [commitCouponModifier] : [],
      });
      const newRecurringTotal = invoice.taxable; // pre-GST, post-discount — same meaning as the old snapshot.totalAmount
      upgradeSubscription.totalAmount = newRecurringTotal;

      // Regression fix (found via live QA — the "stale coupon snapshot"
      // bug): appliedCoupon.baseSubtotal/discountAmount/recurringSubtotal
      // were written ONCE, at whatever moment the coupon was first applied
      // or replaced, and NEVER refreshed on a later upgrade — so a plan
      // card correctly gated on `isCurrentActive` (this IS the live current
      // plan) would still read frozen figures from an entirely different,
      // earlier plan tier (e.g. Starter's ₹350/₹8/₹342 leaking onto the
      // Business card after two upgrades). totalAmount itself was already
      // correctly recomputed above; these three sibling fields on the SAME
      // appliedCoupon object were the one part of this commit that stayed
      // stale. fullRulesSnapshot/duration/code/couponId are left untouched —
      // those are the coupon's own immutable identity/rules, not a pricing
      // snapshot, and must never change here.
      if (upgradeSubscription.appliedCoupon?.code) {
        upgradeSubscription.appliedCoupon.baseSubtotal = invoice.subtotal;
        upgradeSubscription.appliedCoupon.discountAmount = invoice.discount;
        upgradeSubscription.appliedCoupon.recurringSubtotal = invoice.taxable;
      }

      // Rebuild activeAddons: compatible (possibly remapped), incompatible kept
      // until cycle end, and newly purchased add-ons from this upgrade order.
      // Live-QA correctness fix (Aug 2026): billingCycle/periodEnd now
      // carried through from pending.*Addons (populated at initiation,
      // above) into the actual rebuilt activeAddons — this rebuild used to
      // silently drop both fields on every upgrade, which is the confirmed
      // real mechanism behind a live-reported "phantom annual seat"
      // incident. Same class of bug Task 1 fixed at three other creation
      // sites, recurring here via this one.
      upgradeSubscription.activeAddons = [
        ...compatibleAddons.map((a) => ({
          addonKey: a.addonKey,
          quantity: a.quantity,
          pricePerUnit: a.pricePerUnit,
          addedAt: new Date(),
          billingCycle: a.billingCycle,
          periodEnd: a.periodEnd,
        })),
        ...incompatibleAddons.map((a) => ({
          addonKey: a.addonKey,
          quantity: a.quantity,
          pricePerUnit: a.pricePerUnit,
          addedAt: new Date(),
          billingCycle: a.billingCycle,
        })),
        ...newAddonPurchases.map((a) => ({
          addonKey: a.addonKey,
          quantity: a.quantity,
          pricePerUnit: a.pricePerUnit,
          addedAt: new Date(),
          billingCycle: a.billingCycle,
        })),
      ];

      // Old (pre-upgrade) addonKeys already accounted for via this upgrade's
      // own compatible/reduced/incompatible classification (e.g. 'extra_seat'
      // remapped to 'seat' on the new plan). A stale pendingAddonRemovals
      // entry under one of these OLD keys must NOT be blindly restored below —
      // that addon's fate (carried at a reduced quantity, fully dropped,
      // whatever) is already fully represented under its NEW key in the
      // rebuilt activeAddons above; restoring it separately under the old key
      // would resurrect entitlement for a key that isn't even offered on the
      // new plan, on top of pricing that never billed for it.
      const handledOldAddonKeys = new Set([
        ...compatibleAddons.map((a) => a.remappedFrom).filter(Boolean),
        ...incompatibleAddons.map((a) => a.remappedFrom).filter(Boolean),
        ...(pending.reducedAddons || []).map((a) => a.remappedFrom).filter(Boolean),
      ]);
      if (handledOldAddonKeys.size > 0) {
        upgradeSubscription.pendingAddonRemovals = (upgradeSubscription.pendingAddonRemovals || [])
          .filter((r) => !handledOldAddonKeys.has(r.addonKey));
        try {
          await ScheduledChange.updateMany(
            {
              organization: upgradeSubscription.organization,
              subscription: upgradeSubscription._id,
              type: 'REMOVE_ADDON',
              status: 'PENDING',
              'payload.addonKey': { $in: [...handledOldAddonKeys] },
            },
            { $set: { status: 'CANCELLED' } }
          );
        } catch (scErr) {
          console.error(
            `Cancelling stale pre-upgrade ScheduledChange failed (non-fatal) — organization=${upgradeSubscription.organization} subscription=${upgradeSubscription._id}:`,
            scErr.message
          );
        }
      }

      // Restore addons that were already pending removal before the upgrade —
      // the user paid for them this cycle and keeps access until effectiveAt.
      // They stay in pendingAddonRemovals and will be removed at cycle end.
      const pendingRemovals = upgradeSubscription.pendingAddonRemovals || [];
      for (const removal of pendingRemovals) {
        const alreadyPresent = upgradeSubscription.activeAddons.find(
          (a) => a.addonKey === removal.addonKey
        );
        if (!alreadyPresent) {
          // Task 1 (Aug 2026): preserve billingCycle from the pending
          // removal record it's being restored from — same corruption
          // pattern as the other push sites this fix addresses, just via a
          // restore instead of a fresh creation.
          upgradeSubscription.activeAddons.push({
            addonKey: removal.addonKey,
            quantity: removal.quantity,
            pricePerUnit: removal.pricePerUnit,
            addedAt: new Date(),
            billingCycle: removal.billingCycle,
          });
        }
      }

      // Now that payment is confirmed, schedule incompatible add-ons for
      // removal at cycle end (org keeps access & keeps paying for them this
      // cycle; they drop at the next renewal via applyScheduledAddonRemovals).
      if (incompatibleAddons.length > 0) {
        // inc.quantity is now the FULL current quantity (post-fix — classified
        // against raw activeAddons, not the future-effective snapshot). Any
        // pre-existing pendingAddonRemovals/ScheduledChange entry for this
        // addonKey was scheduled BEFORE it became incompatible and may only
        // cover a SMALLER partial quantity — it must be UPDATED to the full
        // amount, not skipped as "already exists" (that would under-schedule
        // the removal, leaving the difference stranded as phantom
        // entitlement forever).
        const pendingRemovals = upgradeSubscription.pendingAddonRemovals || [];
        for (const inc of incompatibleAddons) {
          const existing = pendingRemovals.find((r) => r.addonKey === inc.addonKey);
          if (existing) {
            existing.quantity = inc.quantity;
            existing.pricePerUnit = inc.pricePerUnit;
            existing.displayName = inc.displayName || inc.addonKey;
            existing.effectiveAt = upgradeSubscription.currentPeriodEnd;
          } else {
            pendingRemovals.push({
              addonKey: inc.addonKey,
              displayName: inc.displayName || inc.addonKey,
              quantity: inc.quantity,
              pricePerUnit: inc.pricePerUnit,
              scheduledAt: new Date(),
              effectiveAt: upgradeSubscription.currentPeriodEnd,
            });
          }
        }
        upgradeSubscription.pendingAddonRemovals = pendingRemovals;

        // ScheduledChange — same update-in-place reasoning as above, not the
        // skip-if-exists shape this replaced.
        for (const inc of incompatibleAddons) {
          try {
            const existingPending = await ScheduledChange.findOne({
              organization: upgradeSubscription.organization,
              subscription: upgradeSubscription._id,
              type: 'REMOVE_ADDON',
              status: 'PENDING',
              'payload.addonKey': inc.addonKey,
            });
            if (existingPending) {
              existingPending.effectiveAt = upgradeSubscription.currentPeriodEnd;
              existingPending.payload = { addonKey: inc.addonKey, quantity: inc.quantity, reason: 'incompatible_with_upgrade_target_plan' };
              await existingPending.save();
            } else {
              await ScheduledChange.create({
                organization: upgradeSubscription.organization,
                subscription: upgradeSubscription._id,
                type: 'REMOVE_ADDON',
                status: 'PENDING',
                effectiveAt: upgradeSubscription.currentPeriodEnd,
                payload: { addonKey: inc.addonKey, quantity: inc.quantity, reason: 'incompatible_with_upgrade_target_plan' },
              });
            }
          } catch (scErr) {
            console.error(
              `ScheduledChange creation failed (non-fatal) — organization=${upgradeSubscription.organization} subscription=${upgradeSubscription._id} addonKey=${inc.addonKey}:`,
              scErr.message
            );
          }
        }
      }

      // User-reduced carry-forward quantities (editable carry-forward at
      // checkout) — schedule the same way incompatibleAddons above are: org
      // keeps the reduced-away units for the rest of THIS cycle (already paid
      // for), they drop at renewal. Same skip-if-exists shape, same
      // pendingAddonRemovals write-alongside.
      const reducedAddons = pending.reducedAddons || [];
      if (reducedAddons.length > 0) {
        const pendingRemovals = upgradeSubscription.pendingAddonRemovals || [];
        for (const red of reducedAddons) {
          if (!pendingRemovals.find((r) => r.addonKey === red.addonKey)) {
            pendingRemovals.push({
              addonKey: red.addonKey,
              displayName: red.displayName || red.addonKey,
              quantity: red.quantity,
              pricePerUnit: red.pricePerUnit,
              scheduledAt: new Date(),
              effectiveAt: upgradeSubscription.currentPeriodEnd,
            });
          }
        }
        upgradeSubscription.pendingAddonRemovals = pendingRemovals;

        for (const red of reducedAddons) {
          try {
            const existingPending = await ScheduledChange.findOne({
              organization: upgradeSubscription.organization,
              subscription: upgradeSubscription._id,
              type: 'REMOVE_ADDON',
              status: 'PENDING',
              'payload.addonKey': red.addonKey,
            });
            if (!existingPending) {
              await ScheduledChange.create({
                organization: upgradeSubscription.organization,
                subscription: upgradeSubscription._id,
                type: 'REMOVE_ADDON',
                status: 'PENDING',
                effectiveAt: upgradeSubscription.currentPeriodEnd,
                payload: { addonKey: red.addonKey, quantity: red.quantity, reason: 'user_reduced_carry_forward_at_upgrade' },
              });
            }
          } catch (scErr) {
            console.error(
              `ScheduledChange creation failed (non-fatal) — organization=${upgradeSubscription.organization} subscription=${upgradeSubscription._id} addonKey=${red.addonKey}:`,
              scErr.message
            );
          }
        }
      }

      // Phase 5: CAW subscriptions (mandateTokenId present) have no Razorpay-
      // side "recurring plan" to sync at all — the persisted fields set above
      // (planName/pricePerUser/totalAmount/activeAddons) ARE the source of
      // truth the renewal engine (Phase 6) reads via calculateInvoice() each
      // cycle. So there is nothing to call, nothing that can fail, and no
      // needsRazorpaySync reconciliation ever needed for these subscriptions.
      // Legacy (non-CAW) subscriptions keep the EXACT previous behavior,
      // completely untouched, since they may still have a live Razorpay
      // Subscription object to sync.
      if (upgradeSubscription.mandateTokenId) {
        upgradeSubscription.pendingPlanChange = undefined;
      } else {
        // --- unchanged legacy path ---
        let syncedToRazorpay = false;
        try {
          const newPlanId = compatibleAddons.length > 0
            ? await findOrCreateRazorpayPlan(newRecurringTotal, upgradeSubscription.billingCycle, pending.newPlanName)
            : newPlan.razorpayPlanIds[upgradeSubscription.billingCycle];

          await razorpay.subscriptions.update(upgradeSubscription.razorpaySubscriptionId, {
            plan_id: newPlanId,
            schedule_change_at: 'cycle_end',
          });
          upgradeSubscription.razorpayPlanId = newPlanId;
          syncedToRazorpay = true;
          console.log(`Razorpay subscription updated to ${newPlanId} at cycle_end`);
        } catch (err) {
          console.warn(`Could not update Razorpay recurring plan (likely UPI — syncs at renewal): ${err?.error?.description || err.message}`);
        }

        if (syncedToRazorpay) {
          upgradeSubscription.pendingPlanChange = undefined;
        } else {
          upgradeSubscription.pendingPlanChange = {
            newPlanName: pending.newPlanName,
            newBasePrice: pending.newBasePrice,
            proratedDiffCharged: pending.proratedDiffCharged,
            orderId: pending.orderId,
            compatibleAddons: compatibleAddons,
            newAddonPurchases: newAddonPurchases,
            createdAt: pending.createdAt,
            needsRazorpaySync: true,
          };
        }
      }

      await upgradeSubscription.save();

      // Phase 3 continued (upgrade): COMMITTED -> COMPLETED, now that the
      // commercial change has actually been applied and persisted.
      if (upgradeCommercialTransaction) {
        try {
          upgradeCommercialTransaction.status = 'COMPLETED';
          await upgradeCommercialTransaction.save();
        } catch (ctErr) {
          console.error(
            `CommercialTransaction COMPLETED update failed (non-fatal) — organization=${upgradeSubscription.organization} subscription=${upgradeSubscription._id} transaction=${upgradeCommercialTransaction._id}:`,
            ctErr.message
          );
        }
      }

      // Consume the reserved referral reward, if this upgrade used one —
      // atomic conditional update, idempotent against duplicate webhooks
      // (see utils/referralRewards.js).
      if (upgradeReferralRewardUsageId) {
        try {
          await consumeReservation(upgradeReferralRewardUsageId);
        } catch (rewardErr) {
          console.error('Failed to consume referral reward usage:', rewardErr.message);
        }
      }

      // Record payment
      let upgradePayment = null;
      try {
        upgradePayment = new SubscriptionPayment({
          organization: upgradeSubscription.organization,
          subscription: upgradeSubscription._id,
          razorpayPaymentId: razorpayPayment.id,
          amount: razorpayPayment.amount / 100,
          status: razorpayPayment.status,
          method: razorpayPayment.method,
          paymentFor: 'plan_upgrade',
        });
        await upgradePayment.save();
      } catch (e) {
        console.error('Failed to record upgrade payment:', e.message);
      }

      await emitBillingEvent({
        organization: upgradeSubscription.organization,
        subscription: upgradeSubscription._id,
        eventType: 'PLAN_UPGRADE',
        status: 'completed',
        before: beforeSnapshot,
        after: upgradeSubscription,
        amounts: {
          prorated: pending.proratedDiffCharged,
          paid: razorpayPayment.amount / 100,
          recurringBefore: beforeSnapshot.totalAmount,
          recurringAfter: newRecurringTotal,
        },
        payment: upgradePayment?._id,
        razorpay: { orderId: pending.orderId, paymentId: razorpayPayment.id, subscriptionId: upgradeSubscription.razorpaySubscriptionId },
        metadata: { newPlanName: pending.newPlanName },
      });

      console.log(`Plan upgraded to ${pending.newPlanName} for subscription ${upgradeSubscription._id}. New recurring total: ₹${newRecurringTotal} (applies at renewal)`);
    } catch (error) {
      console.error(`Failed to process plan upgrade payment for order ${razorpayPayment.order_id}:`, error);
      throw error;
    }
    return;
  }

  // Handle subscription-based payment (createSubscription)
  const subSubscription = await Subscription.findOne({
    razorpaySubscriptionId: razorpayPayment.notes?.subscription_id,
  });
  if (subSubscription) {
    // Skip if already confirmed via client-side verification — but the
    // SubscriptionPayment row client-verify created may still be sitting at
    // status 'authorized' (Razorpay's own auto-capture is async, so that was
    // the true status at that instant). This webhook event IS the capture
    // confirmation, so reconcile that row's status even when we skip the
    // subscription mutation. Fixes "Total Spent" undercounting: the stats
    // tile counts authorized+captured as "successful" but the total-spent
    // sum only counts 'captured', so an unreconciled row shows as a
    // successful payment that contributed ₹0.
    if (subSubscription.isPaymentConfirmed) {
      try {
        await SubscriptionPayment.updateOne(
          { razorpayPaymentId: razorpayPayment.id, status: { $ne: 'captured' } },
          { $set: { status: 'captured' } }
        );
      } catch (reconcileErr) {
        console.error(`Failed to reconcile payment status for ${razorpayPayment.id}:`, reconcileErr.message);
      }
      // Another path already confirmed; ensure settlement side effects ran
      // (idempotent no-op if they already did).
      await runFirstPaymentSettlement(subSubscription);
      console.log(`Payment already confirmed for subscription ${subSubscription._id}, skipping webhook update`);
      return;
    }
    subSubscription.paymentStatus = "payment_completed";
    subSubscription.isPaymentConfirmed = true;
    await subSubscription.save();

    // This webhook can legitimately fire BEFORE the client's verifyPayment
    // call — in that race, verifyPayment later sees isPaymentConfirmed:true
    // and returns early without ever creating a SubscriptionPayment row (it
    // only creates one on the path where IT does the confirming). Without
    // this, that race means no payment record is created at all. Record it
    // here instead, guarded against the reverse race (verifyPayment already
    // created it first) via the unique razorpayPaymentId index.
    try {
      const existing = await SubscriptionPayment.findOne({ razorpayPaymentId: razorpayPayment.id });
      if (!existing) {
        await SubscriptionPayment.create({
          organization: subSubscription.organization,
          subscription: subSubscription._id,
          razorpayPaymentId: razorpayPayment.id,
          amount: razorpayPayment.amount / 100,
          status: razorpayPayment.status,
          method: razorpayPayment.method,
          paymentFor: 'subscription',
        });
      }
    } catch (paymentRecordErr) {
      console.error(`Failed to record payment ${razorpayPayment.id} from webhook:`, paymentRecordErr.message);
    }

    await runFirstPaymentSettlement(subSubscription);
    console.log(`Subscription ${subSubscription._id} confirmed via webhook payment ${razorpayPayment.id}`);
  } else {
    console.warn(`No subscription found for payment ${razorpayPayment.id}`);
  }
}

async function handleSubscriptionAuthenticated(razorpaySubscription) {
  const subscription = await Subscription.findOne({
    razorpaySubscriptionId: razorpaySubscription.id,
  });

  if (subscription) {
    // Skip if already confirmed via client-side verification
    if (subscription.isPaymentConfirmed) {
      // Ensure settlement side effects ran regardless of which path confirmed
      // first (idempotent no-op if they already did).
      await runFirstPaymentSettlement(subscription);
      console.log(`Payment already confirmed for subscription ${subscription._id}, skipping webhook update`);
      return;
    }

    subscription.status = "authenticated";
    subscription.isTrialActive = false;
    subscription.paymentStatus = "payment_completed";
    subscription.isPaymentConfirmed = true;
    setAppStatus(subscription, "active", "razorpay subscription authenticated");
    await subscription.save();
    await runFirstPaymentSettlement(subscription);

    console.log(`Subscription ${subscription._id} payment confirmed via webhook`);
  }
}

async function handleSubscriptionActivated(razorpaySubscription) {
  const subscription = await Subscription.findOne({
    razorpaySubscriptionId: razorpaySubscription.id,
  });

  if (subscription) {
    // Skip if already confirmed via client-side verification (only update dates)
    const alreadyConfirmed = subscription.isPaymentConfirmed;

    subscription.status = "active";
    subscription.isTrialActive = false;
    subscription.paymentStatus = "payment_completed";
    subscription.isPaymentConfirmed = true;
    subscription.currentPeriodStart = new Date(
      razorpaySubscription.current_start * 1000
    );
    subscription.currentPeriodEnd = new Date(
      razorpaySubscription.current_end * 1000
    );
    subscription.nextBillingDate = new Date(
      razorpaySubscription.charge_at * 1000
    );
    setAppStatus(subscription, "active", "razorpay subscription activated");
    await subscription.save();

    // Runs the first-payment settlement side effects (referral qualification,
    // coupon redemption). Idempotent, so calling it here even when another
    // path already confirmed is a safe no-op — this closes the race where
    // subscription.activated is the event that wins for this subscription.
    await runFirstPaymentSettlement(subscription);

    if (alreadyConfirmed) {
      console.log(`Subscription ${subscription._id} already confirmed, updated dates via webhook`);
    } else {
      console.log(`Subscription ${subscription._id} activated via webhook`);
    }
  }
}

async function handlePaymentFailed(razorpayPayment) {
  // Find subscription by looking up the payment
  const subscription = await Subscription.findOne({
    razorpaySubscriptionId: razorpayPayment.notes?.subscription_id,
  });

  if (subscription) {
    subscription.paymentStatus = "payment_failed";
    subscription.isPaymentConfirmed = false;
    subscription.lastPaymentAttempt = {
      razorpayPaymentId: razorpayPayment.id,
      amount: razorpayPayment.amount,
      attemptedAt: new Date(),
      status: "failed",
    };
    setAppStatus(subscription, "past_due", "payment failed");
    await subscription.save();

    await emitBillingEvent({
      organization: subscription.organization,
      subscription: subscription._id,
      eventType: 'PAYMENT_FAILED',
      status: 'failed',
      after: subscription,
      amounts: { paid: 0 },
      razorpay: { paymentId: razorpayPayment.id, subscriptionId: subscription.razorpaySubscriptionId },
      metadata: { reason: razorpayPayment.error_description || null },
    });

    console.log(`Payment failed for subscription ${subscription._id}`);
  }
}

async function handleSubscriptionCharged(
  razorpayPayment,
  razorpaySubscription
) {
  const subscription = await Subscription.findOne({
    razorpaySubscriptionId: razorpaySubscription.id,
  });

  if (subscription) {
    // Check if payment already recorded
    const existingPayment = await SubscriptionPayment.findOne({
      razorpayPaymentId: razorpayPayment.id
    });
    
    // Record payment if not already recorded
    let chargedPayment = existingPayment;
    const isFirstRecord = !existingPayment;
    if (!existingPayment) {
      chargedPayment = new SubscriptionPayment({
        organization: subscription.organization,
        subscription: subscription._id,
        razorpayPaymentId: razorpayPayment.id,
        amount: razorpayPayment.amount / 100, // paise to INR
        status: razorpayPayment.status,
        method: razorpayPayment.method,
        paymentFor: "subscription",
      });
      await chargedPayment.save();
      console.log(`Payment ${razorpayPayment.id} recorded via webhook`);
    } else {
      console.log(`Payment ${razorpayPayment.id} already recorded, skipping`);
    }

    // Only emit once per actual charge, and only for a RENEWAL (a cycle
    // charge on an already-confirmed subscription) — the very first charge
    // is already covered by SUBSCRIPTION_CREATED elsewhere.
    if (isFirstRecord && subscription.isPaymentConfirmed) {
      await emitBillingEvent({
        organization: subscription.organization,
        subscription: subscription._id,
        eventType: 'RENEWAL',
        status: 'completed',
        after: subscription,
        amounts: { paid: razorpayPayment.amount / 100, recurringAfter: subscription.totalAmount },
        payment: chargedPayment?._id,
        razorpay: { paymentId: razorpayPayment.id, subscriptionId: subscription.razorpaySubscriptionId },
      });
    }

    // Update subscription (skip if already confirmed via client-side)
    const alreadyConfirmed = subscription.isPaymentConfirmed;
    
    subscription.status = "active";
    subscription.paymentStatus = "payment_completed";
    subscription.isTrialActive = false;
    subscription.isPaymentConfirmed = true;
    subscription.currentPeriodStart = new Date(
      razorpaySubscription.current_start * 1000
    );
    subscription.currentPeriodEnd = new Date(
      razorpaySubscription.current_end * 1000
    );
    subscription.nextBillingDate = new Date(
      razorpaySubscription.charge_at * 1000
    );
    setAppStatus(subscription, "active", "subscription charged successfully");
    await subscription.save();

    // First-payment settlement side effects (referral qualification, coupon
    // redemption). For UPI AutoPay, `subscription.charged` is typically THE
    // confirming event — this is the path that was silently missing
    // qualification (org "neww": active + confirmed but referral stuck
    // pending; see PROJECT_STATE.md §11). Idempotent + gated on a pending
    // referral / unredeemed coupon, so it's a safe no-op on renewal charges,
    // which also hit this handler.
    await runFirstPaymentSettlement(subscription);

    // KNOWN GAP (see backend/docs/KNOWN_BILLING_GAPS.md): a scheduled
    // downgrade's `subscription.pendingUpdate` is never reconciled here.
    // Razorpay charges the correct new amount (its own plan was switched at
    // schedule time), but planName/pricePerUser/totalAmount/activeAddons in
    // our DB keep showing the pre-downgrade plan forever, and pendingUpdate
    // never clears. Deliberately NOT fixed yet — on hold pending Razorpay's
    // Charge at Will response (support ticket #19691335), since that would
    // likely redesign this whole reconciliation model. Do not add downgrade
    // reconciliation logic here without re-reading that doc first.

    if (alreadyConfirmed) {
      console.log(`Subscription ${subscription._id} already confirmed, updated via webhook`);
    } else {
      console.log(`Subscription ${subscription._id} charged and confirmed via webhook`);
    }

    // Apply any scheduled add-on removals now that a new billing cycle has started
    try {
      const removalsApplied = await applyScheduledAddonRemovals(subscription);
      if (removalsApplied) {
        console.log(`Applied scheduled add-on removals for subscription ${subscription._id}`);
      }
    } catch (removalError) {
      console.error(`Failed to apply scheduled add-on removals for subscription ${subscription._id}:`, removalError.message);
    }

    // Reconcile a UPI plan upgrade that couldn't sync to Razorpay at payment time.
    // The entitlements (planName) already changed when the upgrade payment was
    // captured; our DB totalAmount is the source of truth for display/limits.
    // NOTE: on UPI/NACH mandates, increasing the actual recurring charge requires
    // the customer to re-authorize — a known Razorpay constraint (see report).
    if (subscription.pendingPlanChange?.needsRazorpaySync) {
      console.log(`Subscription ${subscription._id} had a pending UPI plan sync. DB totalAmount (₹${subscription.totalAmount}) is source of truth. Razorpay mandate may need re-auth for the full amount.`);
      subscription.pendingPlanChange = undefined;
      await subscription.save();
    }
  }
}

async function handleSubscriptionCancelled(razorpaySubscription) {
  const subscription = await Subscription.findOne({
    razorpaySubscriptionId: razorpaySubscription.id,
  });

  if (subscription) {
    const now = new Date();
    const periodEnd = new Date(razorpaySubscription.current_end * 1000);

    if (now < periodEnd) {
      // Mid-cycle cancellation: keep access until period ends, don't change appStatus yet
      subscription.cancelAtPeriodEnd = true;
      subscription.cancelledAt = periodEnd;
      subscription.status = 'active';
      console.log(`Subscription ${subscription._id} scheduled for cancellation at period end: ${periodEnd}`);
    } else {
      // Period has ended — access should stop now
      subscription.status = "cancelled";
      subscription.cancelledAt = new Date();
      setAppStatus(subscription, "cancelled", "period ended after cancellation");
      console.log(`Subscription ${subscription._id} fully cancelled`);
    }

    await subscription.save();

    if (subscription.pendingUpdate) {
      const pending = subscription.pendingUpdate;
      const newPlan = await PlanConfig.findOne({ planId: pending.planName });

      if (!newPlan) {
        console.error(`Plan ${pending.planName} not found for pending update`);
        return;
      }

      const newPricePerUser =
        pending.billingCycle === "monthly"
          ? newPlan.monthlyPrice
          : newPlan.yearlyPrice;
      const newTotalAmount = newPricePerUser * pending.userCount;
      const newRazorpayPlanId = newPlan.razorpayPlanIds[pending.billingCycle];

      const newRazorpaySubscription = await razorpay.subscriptions.create({
        plan_id: newRazorpayPlanId,
        customer_notify: 1,
        quantity: pending.userCount,
        total_count: pending.billingCycle === "monthly" ? 12 : 1,
        start_at: Math.floor(pending.scheduledAt / 1000),
        notes: {
          organization_id: subscription.organization.toString(),
          plan_name: pending.planName,
          billing_cycle: pending.billingCycle,
        },
      });

      // Create new local subscription
      const newSubscription = new Subscription({
        organization: subscription.organization,
        razorpaySubscriptionId: newRazorpaySubscription.id,
        razorpayPlanId: newRazorpayPlanId,
        planName: pending.planName,
        status: newRazorpaySubscription.status,
        billingCycle: pending.billingCycle,
        pricePerUser: newPricePerUser,
        userCount: pending.userCount,
        totalAmount: newTotalAmount,
        currentPeriodStart: new Date(
          newRazorpaySubscription.current_start * 1000
        ),
        currentPeriodEnd: new Date(newRazorpaySubscription.current_end * 1000),
        nextBillingDate: new Date(newRazorpaySubscription.charge_at * 1000),
        isPaymentConfirmed: false,
        paymentStatus: "pending_payment",
      });

      await newSubscription.save();
      console.log(
        `New subscription ${newSubscription._id} created for organization ${subscription.organization}`
      );
    }
  }
}

async function handleSubscriptionHalted(razorpaySubscription) {
  const subscription = await Subscription.findOne({
    razorpaySubscriptionId: razorpaySubscription.id,
  });

  if (subscription) {
    subscription.status = "halted";
    // Razorpay has exhausted its own retry schedule — this is the
    // "grace period exhausted" moment. Without this line, appStatus never
    // moved past "past_due", meaning subscriptionGate would have kept
    // granting full write access indefinitely even after Razorpay gave up.
    setAppStatus(subscription, "suspended", "razorpay halted subscription after retries");
    await subscription.save();
    console.log(`Subscription ${subscription._id} suspended after Razorpay halted it`);
  }
}

exports.getPaymentHistory = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const payments = await SubscriptionPayment.find({
      organization: req.user.organization,
    })
      .populate("subscription", "planName billingCycle")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await SubscriptionPayment.countDocuments({
      organization: req.user.organization,
    });

    res.json({
      payments,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    console.error("Payment history error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Billing Center timeline — reads BillingEvent, never reconstructs history
// from Subscription/SubscriptionPayment/CouponRedemption.
// BILLING_UX_SPEC.md §5 — REFERRAL_REWARD_RESERVED/RELEASED are excluded
// from the customer-facing timeline. Reservation is a transient in-progress
// state (§2.1), not a durable event worth a permanent row — the timeline
// records outcomes (Earned/Consumed), not intermediate lock states. Still
// written to BillingEvent (unfiltered) for the admin auditing bucket (§Admin,
// "why was this released — payment failed, cancelled, etc."); only this
// customer-facing read excludes them.
const TIMELINE_EXCLUDED_EVENT_TYPES = ['REFERRAL_REWARD_RESERVED', 'REFERRAL_REWARD_RELEASED'];

exports.getBillingTimeline = async (req, res) => {
  try {
    const { page = 1, limit = 25 } = req.query;
    const BillingEvent = require('../models/BillingEvent');

    const filter = { organization: req.user.organization, eventType: { $nin: TIMELINE_EXCLUDED_EVENT_TYPES } };
    const events = await BillingEvent.find(filter)
      .populate('payment')
      .sort({ occurredAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await BillingEvent.countDocuments(filter);

    res.json({
      events,
      totalPages: Math.ceil(total / limit),
      currentPage: Number(page),
      total,
    });
  } catch (error) {
    console.error('Billing timeline error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ScheduledChange — the only representation of future commercial intent the
// frontend should read (never legacy pendingUpdate/pendingAddonRemovals).
// Returns raw ScheduledChange records plus a derived keptAddons/removedAddons
// view, computed by reusing renewalEngine.js's own buildEffectiveSubscription
// (never a second, hand-rolled approximation).
exports.getScheduledChanges = async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ organization: req.user.organization });
    if (!subscription) {
      return res.json({ scheduledChanges: [] });
    }

    const scheduledChanges = await ScheduledChange.find({
      subscription: subscription._id,
      status: 'PENDING',
    }).sort({ effectiveAt: 1 });

    // Lazy require — renewalEngine.js requires this controller (for
    // setAppStatus), so a top-level require here would create a circular
    // dependency with unpredictable resolution order.
    const { buildEffectiveSubscription } = require('../utils/renewalEngine');
    const previewHorizon = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000);
    const { effective, cancellation } = await buildEffectiveSubscription(subscription, previewHorizon);

    const originalActiveAddons = (subscription.activeAddons || []).map((a) =>
      typeof a.toObject === 'function' ? a.toObject() : { ...a }
    );
    const keptAddons = effective.activeAddons;
    const removedAddons = [];
    originalActiveAddons.forEach((orig) => {
      // Match by (addonKey, billingCycle), not addonKey alone — Phase 2d.1
      // lets a monthly and annual instance of the same addonKey coexist as
      // separate array entries, so an addonKey-only match here would
      // misattribute a removal scheduled against one instance to whichever
      // instance happens to appear first.
      const kept = keptAddons.find(
        (k) => addonIdentityKey(k, subscription.billingCycle) === addonIdentityKey(orig, subscription.billingCycle)
      );
      const keptQty = kept ? kept.quantity : 0;
      const removedQty = orig.quantity - keptQty;
      if (removedQty > 0) {
        removedAddons.push({ ...orig, quantity: removedQty });
      }
    });

    let effectiveRecurringTotal = null;
    if (!cancellation && scheduledChanges.length > 0) {
      // Scheduled-change preview coupon-scope fix (found while tracing C1):
      // this used to reuse subscription.appliedCoupon.discountAmount — a flat
      // amount frozen from whenever the coupon was first applied — as an
      // 'entire_invoice' modifier, completely unconditionally (no duration
      // eligibility check, no per-plan rule lookup). That's the exact same bug
      // class as Bug 2 (renewalEngine.js R7/previewRenewal), but this is a
      // DIFFERENT, older call site that never got that fix — a coupon with no
      // rule for the scheduled TARGET plan would still show a discount here.
      // Now rebuilds fresh from fullRulesSnapshot against the actual EFFECTIVE
      // (post-scheduled-change) line items, gated by the same
      // isCouponStillEligibleForRenewal question renewal already asks —
      // never a second, hand-rolled approximation.
      const resolvedModifiers = [];
      if (subscription.appliedCoupon?.fullRulesSnapshot && isCouponStillEligibleForRenewal(subscription.appliedCoupon)) {
        const effectiveLineItems = [
          { key: effective.planName, type: 'plan', amount: effective.pricePerUser },
          ...effective.activeAddons.map((a) => ({ key: a.addonKey, type: 'addon', amount: a.quantity * a.pricePerUnit })),
        ];
        const couponModifier = buildCouponModifierForLineItems(subscription.appliedCoupon.fullRulesSnapshot, effectiveLineItems);
        if (couponModifier) resolvedModifiers.push(couponModifier);
      }
      const previewInvoice = calculateInvoice({ subscription: effective, resolvedModifiers });
      effectiveRecurringTotal = previewInvoice.taxable;
    }

    res.json({ scheduledChanges, keptAddons, removedAddons, effectiveRecurringTotal });
  } catch (error) {
    console.error('Scheduled changes error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Billing Calendar — GET /subscription/billing-projection. Single canonical
// read-model composing existing engines only (utils/billingProjection.js) —
// no billing math lives in this controller function or in the frontend
// component that renders it. Lazy require, same circular-dependency reason
// as getScheduledChanges/getRenewalPreview above (billingProjection.js pulls
// in renewalEngine.js, which requires this controller for setAppStatus).
exports.getBillingProjection = async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ organization: req.user.organization });
    if (!subscription) {
      return res.json({ hasSubscription: false });
    }
    const { buildBillingProjection } = require('../utils/billingProjection');
    const projection = await buildBillingProjection(subscription);
    res.json({ hasSubscription: true, ...projection });
  } catch (error) {
    console.error('Billing projection error:', error);
    res.status(500).json({ error: error.message });
  }
};

// BILLING_UX_SPEC.md §2.2 — "Next Renewal" preview on the billing dashboard.
// Read-only: renewalEngine.js's previewRenewal() uses getNextAvailableReward
// (a plain read), never reserveNextAvailableReward, so this never occupies a
// reward or writes anything. Lazy require of renewalEngine — see
// getScheduledChanges just above for why (circular dependency: renewalEngine
// requires this controller for setAppStatus).
exports.getRenewalPreview = async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ organization: req.user.organization });
    if (!subscription || !subscription.isPaymentConfirmed || !subscription.currentPeriodEnd) {
      return res.json({ pricingBreakdown: null });
    }
    const { previewRenewal } = require('../utils/renewalEngine');
    const pricingBreakdown = await previewRenewal(subscription);
    res.json({ pricingBreakdown, nextRenewalDate: subscription.currentPeriodEnd });
  } catch (error) {
    console.error('Renewal preview error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Add function to get payment details
exports.getPaymentDetails = async (req, res) => {
  try {
    const { paymentId } = req.params;

    const payment = await SubscriptionPayment.findOne({
      _id: paymentId,
      organization: req.user.organization,
    }).populate("subscription", "planName billingCycle userCount");

    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    res.json({ payment });
  } catch (error) {
    console.error("Payment details error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Client-side payment verification endpoint
/**
 * Asks Razorpay what actually happened to a pending first payment, instead of waiting to be told.
 *
 * Until now a first payment was only ever recognised two ways: the browser posting back to
 * verifyPayment, or the webhook arriving. Both can be missed - closing the checkout tab kills the
 * first (observed live: payment captured at Razorpay, app still "pending"), and a webhook can be
 * undelivered, delayed, or not configured for the environment at all. With neither, the app showed
 * the subscription as unpaid and "Resume Payment" would open a SECOND checkout for money already
 * taken.
 *
 * Any captured payment found is replayed through the SAME handler the webhook uses
 * (handleCAWPaymentCaptured), so settlement, activation, invoices and billing events all run
 * through one code path rather than a second near-copy that can drift. recordWebhookEventOnce
 * dedupes on a synthetic event id, so this is safe to call repeatedly and safe whether the real
 * webhook lands before, during or after it.
 *
 * Read-only when there is nothing to reconcile. Shared by the HTTP endpoint below and the
 * pendingPaymentSweep job (jobs/paymentReconciliationJobs.js).
 *
 * @returns {Promise<{reconciled: boolean, reason?: string, paymentId?: string, status?: string,
 *   isPaymentConfirmed?: boolean, linkStatus?: string|null}>}
 */
async function reconcileSubscriptionPayment(subscription) {
  if (!subscription) return { reconciled: false, reason: "no_subscription" };

  if (subscription.isPaymentConfirmed) {
    return { reconciled: false, reason: "already_confirmed", status: subscription.paymentStatus, isPaymentConfirmed: true };
  }

  // Newest attempt first, then any superseded ones: a customer who paid, closed the tab and hit
  // Resume has their money sitting against a link that is no longer subscription.registrationLinkId.
  const linkIds = [
    subscription.registrationLinkId,
    ...[...(subscription.priorRegistrationLinkIds || [])].reverse(),
  ].filter(Boolean);

  if (!linkIds.length) {
    return { reconciled: false, reason: "no_pending_attempt", status: subscription.paymentStatus };
  }

  // A registration link IS a Razorpay invoice: once paid it carries the payment's id, so this is
  // two direct fetches by id rather than listing and filtering every payment on the account.
  let captured = null;
  let lastLinkStatus = null;

  for (const candidateId of linkIds) {
    const invoice = await razorpay.invoices.fetch(candidateId).catch((err) => {
      console.error("reconcileSubscriptionPayment: could not fetch registration link", candidateId, err?.message);
      return null;
    });
    lastLinkStatus = invoice?.status || lastLinkStatus;
    if (!invoice?.payment_id) continue;

    const payment = await razorpay.payments.fetch(invoice.payment_id).catch((err) => {
      console.error("reconcileSubscriptionPayment: could not fetch payment", invoice.payment_id, err?.message);
      return null;
    });

    // Only a captured payment is money actually taken - "authorized" is not.
    if (payment?.status === "captured") {
      captured = payment;
      break;
    }
  }

  if (!captured) {
    return { reconciled: false, reason: "not_paid_yet", linkStatus: lastLinkStatus, status: subscription.paymentStatus };
  }

  // Synthetic event id, namespaced so it can never collide with a real Razorpay event id and so
  // the dedupe index makes replays idempotent.
  await handleCAWPaymentCaptured(captured, `recon_${captured.id}`);

  const refreshed = await Subscription.findById(subscription._id);
  return {
    reconciled: true,
    paymentId: captured.id,
    status: refreshed?.paymentStatus,
    isPaymentConfirmed: !!refreshed?.isPaymentConfirmed,
  };
}
exports.reconcileSubscriptionPayment = reconcileSubscriptionPayment;

/**
 * POST /api/subscription/reconcile-payment - HTTP wrapper around the helper above.
 */
exports.reconcilePayment = async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ organization: req.user.organization });
    if (!subscription) {
      return res.status(404).json({ error: "Subscription not found", success: false });
    }

    const result = await reconcileSubscriptionPayment(subscription);
    res.json({ success: true, ...result, alreadyConfirmed: result.reason === "already_confirmed" });
  } catch (error) {
    console.error("reconcilePayment error:", error);
    res.status(500).json({ error: error.message, success: false });
  }
};

exports.verifyPayment = async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature } = req.body;

    console.log('Client-side payment verification request:', {
      payment_id: razorpay_payment_id,
      subscription_id: razorpay_subscription_id,
      has_signature: !!razorpay_signature,
      organization: req.user.organization
    });

    // Validate required fields
    if (!razorpay_payment_id || !razorpay_subscription_id || !razorpay_signature) {
      return res.status(400).json({ 
        error: "Missing payment verification parameters",
        success: false
      });
    }

    // Verify signature
    const generated_signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
      .digest('hex');

    if (generated_signature !== razorpay_signature) {
      console.error('Payment signature verification failed:', {
        payment_id: razorpay_payment_id,
        subscription_id: razorpay_subscription_id
      });
      return res.status(400).json({ 
        error: "Invalid payment signature",
        success: false
      });
    }

    // Find subscription by razorpay subscription ID
    const subscription = await Subscription.findOne({
      razorpaySubscriptionId: razorpay_subscription_id,
      organization: req.user.organization
    });

    if (!subscription) {
      return res.status(404).json({ 
        error: "Subscription not found",
        success: false
      });
    }

    // Check if already confirmed — the webhook may have won this race. Make
    // sure a SubscriptionPayment row exists for this payment regardless of
    // which side confirmed first (mirrors the reconciliation added to
    // handlePaymentCaptured), rather than assuming the webhook already
    // recorded one.
    if (subscription.isPaymentConfirmed) {
      console.log('Payment already confirmed for subscription:', subscription._id);
      try {
        const existing = await SubscriptionPayment.findOne({ razorpayPaymentId: razorpay_payment_id });
        if (!existing) {
          const razorpayPayment = await razorpay.payments.fetch(razorpay_payment_id);
          await SubscriptionPayment.create({
            organization: subscription.organization,
            subscription: subscription._id,
            razorpayPaymentId: razorpay_payment_id,
            amount: razorpayPayment.amount / 100,
            status: razorpayPayment.status,
            method: razorpayPayment.method,
            paymentFor: 'subscription',
          });
        }
      } catch (reconcileErr) {
        console.error(`Failed to reconcile payment record for ${razorpay_payment_id}:`, reconcileErr.message);
      }
      // A webhook won the confirmation race. Ensure settlement side effects
      // ran even if the winning path was one that historically skipped them
      // (idempotent — no-op if already qualified/redeemed).
      await runFirstPaymentSettlement(subscription);
      return res.json({
        success: true,
        message: "Payment already confirmed",
        subscription: {
          _id: subscription._id,
          planName: subscription.planName,
          status: subscription.status,
          isPaymentConfirmed: subscription.isPaymentConfirmed
        }
      });
    }

    // Fetch payment details from Razorpay to verify
    try {
      const razorpayPayment = await razorpay.payments.fetch(razorpay_payment_id);
      const razorpaySubscription = await razorpay.subscriptions.fetch(razorpay_subscription_id);

      console.log('Fetched Razorpay details:', {
        payment_status: razorpayPayment.status,
        subscription_status: razorpaySubscription.status,
        amount: razorpayPayment.amount / 100
      });

      // Verify payment is captured/authorized
      if (razorpayPayment.status !== 'captured' && razorpayPayment.status !== 'authorized') {
        return res.status(400).json({ 
          error: `Payment not successful. Status: ${razorpayPayment.status}`,
          success: false
        });
      }

      // Update subscription with payment confirmation
      subscription.status = razorpaySubscription.status;
      subscription.isPaymentConfirmed = true;
      subscription.isTrialActive = false;
      subscription.paymentStatus = 'payment_completed';
      
      // Update billing dates if available
      if (razorpaySubscription.current_start) {
        subscription.currentPeriodStart = new Date(razorpaySubscription.current_start * 1000);
      }
      if (razorpaySubscription.current_end) {
        subscription.currentPeriodEnd = new Date(razorpaySubscription.current_end * 1000);
      }
      if (razorpaySubscription.charge_at) {
        subscription.nextBillingDate = new Date(razorpaySubscription.charge_at * 1000);
      }

      // Record payment
      const payment = new SubscriptionPayment({
        organization: subscription.organization,
        subscription: subscription._id,
        razorpayPaymentId: razorpay_payment_id,
        amount: razorpayPayment.amount / 100,
        status: razorpayPayment.status,
        method: razorpayPayment.method,
        paymentFor: 'subscription',
      });

      await payment.save();
      await subscription.save();
      await runFirstPaymentSettlement(subscription);

      console.log('Payment verified and subscription updated:', {
        subscription_id: subscription._id,
        payment_id: razorpay_payment_id
      });

      // Hotfix (docs/audit/PHASE3_ENTITLEMENT_WINDOW_SCHEMA_TRACE.md §6.3, b4):
      // currentPeriodEnd here is bundled with nextBillingDate, but a client
      // reading this as "when does my access end" would get the ROLLING
      // field, not the real entitlement boundary for a yearly subscription.
      // currentPeriodStart is left unchanged — no entitlement-boundary claim
      // was ever attached to a period START, only the END.
      return res.json({
        success: true,
        message: "Payment verified successfully",
        subscription: {
          _id: subscription._id,
          planName: subscription.planName,
          status: subscription.status,
          billingCycle: subscription.billingCycle,
          userCount: subscription.userCount,
          totalAmount: subscription.totalAmount,
          isPaymentConfirmed: subscription.isPaymentConfirmed,
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: getAccessEntitlementEnd(subscription),
          nextBillingDate: subscription.nextBillingDate
        }
      });

    } catch (razorpayError) {
      console.error('Razorpay API error during verification:', razorpayError);
      return res.status(500).json({ 
        error: "Failed to verify payment with Razorpay",
        details: razorpayError.message,
        success: false
      });
    }

  } catch (error) {
    console.error('Payment verification error:', error);
    return res.status(500).json({ 
      error: "Payment verification failed",
      details: error.message,
      success: false
    });
  }
};

exports.retryPayment = async (req, res) => {
  try {
    const { id } = req.params; // subscription ID

    const subscription = await Subscription.findOne({
      _id: id,
      organization: req.user.organization,
    });

    if (!subscription) {
      return res.status(404).json({ error: "Subscription not found" });
    }

    if (
      subscription.lastPaymentAttempt &&
      new Date() - new Date(subscription.lastPaymentAttempt.attemptedAt) <
        120000
    ) {
      return res
        .status(429)
        .json({
          error: "Payment processing in progress. Please wait before retrying.",
        });
    }

    // Check if subscription needs payment retry
    if (subscription.isPaymentConfirmed) {
      return res.status(400).json({
        error: "Subscription payment is already confirmed",
      });
    }

    // Get plan details for payment
    const plan = await PlanConfig.findOne({
      planId: subscription.planName,
      isActive: true,
    });

    if (!plan) {
      return res.status(404).json({ error: "Plan configuration not found" });
    }

    // Option 1: Use existing Razorpay subscription (if it exists)
    if (subscription.razorpaySubscriptionId) {
      try {
        // Fetch current Razorpay subscription status
        const razorpaySubscription = await razorpay.subscriptions.fetch(
          subscription.razorpaySubscriptionId
        );

        // If subscription exists in Razorpay and is in created/authenticated state
        if (
          ["created", "authenticated"].includes(razorpaySubscription.status)
        ) {
          return res.json({
            success: true,
            message: "Use existing subscription for retry",
            paymentDetails: {
              key: process.env.RAZORPAY_KEY_ID,
              subscription_id: razorpaySubscription.id,
              name: req.user.name,
              description: `Retry Payment - ${plan.name} Plan`,
              prefill: {
                name: req.user.name,
                email: req.user.email,
                contact: req.user.phone || "",
              },
              theme: { color: "#3399cc" },
              callback_url: `${process.env.FRONTEND_URL}/subscription/payment-success`,
            },
          });
        }
      } catch (razorpayError) {
        console.log(
          "Existing subscription not found in Razorpay, creating new one"
        );
      }
    }

    // Option 2: Create new Razorpay subscription for retry
    const razorpaySubscription = await razorpay.subscriptions.create({
      plan_id: subscription.razorpayPlanId,
      customer_notify: 1,
      quantity: subscription.userCount,
      total_count: subscription.billingCycle === "monthly" ? 12 : 1,
      notes: {
        organization_id: req.user.organization.toString(),
        plan_name: subscription.planName,
        billing_cycle: subscription.billingCycle,
        retry: "true",
      },
    });

    // Update subscription with new Razorpay subscription ID
    subscription.razorpaySubscriptionId = razorpaySubscription.id;
    subscription.paymentStatus = "pending_payment";
    subscription.isPaymentConfirmed = false;
    subscription.lastPaymentAttempt = {
      attemptedAt: new Date(),
      status: "retry_initiated",
    };

    await subscription.save();

    res.json({
      success: true,
      message: "Retry payment session created",
      paymentDetails: {
        key: process.env.RAZORPAY_KEY_ID,
        subscription_id: razorpaySubscription.id,
        name: req.user.name,
        description: `Retry Payment - ${plan.name} Plan`,
        prefill: {
          name: req.user.name,
          email: req.user.email,
          contact: req.user.phone || "",
        },
        theme: { color: "#3399cc" },
        callback_url: `${process.env.FRONTEND_URL}/subscription/payment-success`,
      },
    });
  } catch (error) {
    console.error("Retry payment error:", error);
    res.status(500).json({
      error: "Failed to create retry payment session",
      details: error.message,
    });
  }
};
exports.setAppStatus = setAppStatus;

exports.getSeatStatusEndpoint = async (req, res) => {
  try {
    const { getSeatStatus } = require('../utils/addonManagement');
    const subscription = await Subscription.findOne({ organization: req.user.organization });
    if (!subscription) return res.status(404).json({ error: 'No subscription found.' });

    const status = await getSeatStatus(req.user.organization);
    res.json({
      includedSeats: status.includedSeats,
      occupiedAdminSeats: status.occupiedAdminSeats,
      hasFreeAdminSeat: status.hasFreeAdminSeat,
      staffSeatsIncluded: status.staffSeatsIncluded,
      extraSeatsOwned: status.extraSeatsOwned,
      totalStaffSeats: status.totalStaffSeats,
      occupiedStaffSeats: status.occupiedStaffSeats,
      hasFreeStaffSeat: status.hasFreeStaffSeat,
      totalSeats: status.totalSeats,
      occupiedSeats: status.occupiedSeats,
      hasFreeSeat: status.hasFreeSeat,
    });
  } catch (error) {
    console.error('getSeatStatus error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Deprecated — seats are just the "extra_seat" add-on. Use POST
// /subscription/addons/purchase (quantity of extra_seat) to add seats, or
// POST /subscription/addons/remove to schedule removal. This endpoint used
// to write activeAddons synchronously (no Order, no proration, no
// BillingEvent) — a second, uncoordinated writer to the same field the
// generic add-on engine owns. Nothing in the product calls it anymore
// (invite-time seat purchase now goes through the generic engine too).
exports.adjustSeats = async (req, res) => {
  return res.status(410).json({
    error: 'This endpoint is deprecated. Use POST /subscription/addons/purchase with { addonKey: "extra_seat", quantity } to add seats, or POST /subscription/addons/remove to schedule removal.',
  });
};

// Returns the calling org's referral code, issuing an active one if it
// doesn't have one yet. Org-facing — see REFERRAL_SYSTEM_DESIGN.md §22 for
// the fuller dashboard this is a minimal first piece of (not built yet).
exports.getOrgReferralCode = async (req, res) => {
  try {
    const ReferralCode = require('../models/ReferralCode');
    const { issueReferralCode } = require('../utils/referralUtils');

    let referralCode = await ReferralCode.findOne({ organization: req.user.organization, isActive: true }).sort({ createdAt: -1 });
    if (!referralCode) {
      referralCode = await issueReferralCode(req.user.organization);
    }
    res.json({ code: referralCode.code });
  } catch (error) {
    console.error('getOrgReferralCode error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Org-facing "my referrals" — code(s), referrals sent, whether this org was
// itself referred, every reward it holds (as referrer or referee) with a
// derived status, and summary counts. Read-only; shares its query shape
// with the Super Admin per-org overview (utils/referralUtils.js
// buildReferralOverview) rather than duplicating the logic. See
// REFERRAL_SYSTEM_DESIGN.md §22 (dashboard) — this is the data endpoint a
// future dashboard UI would call; no UI built yet.
// BILLING_UX_SPEC.md §2.2 — the single "do I have an available reward"
// read every visibility surface (billing dashboard, plan cards, Manage
// Subscription) shares — deliberately lighter than getMyReferralOverview
// (which returns full referral/reward history for the Referrals page
// itself). Read-only: getNextAvailableReward never reserves.
//
// eligibleFor is returned by the backend, not hardcoded per surface (§2.2)
// — today every reward is usable on every commercial action (no per-reward
// restriction exists in the data model), so the list is simply every action
// currently wired to consume a reward, plus "First Payment" only when this
// org is still on trial (that action doesn't exist for an already-paying org).
exports.getRewardAvailability = async (req, res) => {
  try {
    const { getNextAvailableReward } = require('../utils/referralRewards');
    const reward = await getNextAvailableReward(req.user.organization);
    if (!reward) {
      return res.json({ available: false });
    }
    const subscription = await Subscription.findOne({ organization: req.user.organization });
    const eligibleFor = ['Upgrade', 'Renewal', 'Add-ons'];
    if (subscription && !subscription.isPaymentConfirmed) {
      eligibleFor.push('First Payment');
    }
    res.json({
      available: true,
      rewardType: reward.rewardType,
      rewardValue: reward.rewardValue,
      maxRewardAmount: reward.maxRewardAmount,
      eligibleFor,
    });
  } catch (error) {
    console.error('getRewardAvailability error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getMyReferralOverview = async (req, res) => {
  try {
    const { buildReferralOverview } = require('../utils/referralUtils');
    const overview = await buildReferralOverview(req.user.organization);
    res.json(overview);
  } catch (error) {
    console.error('getMyReferralOverview error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Applies a referral code typed in manually on the checkout page — acts
// immediately (mirrors the coupon field's own Apply button), not folded
// into a later Subscribe/Start Trial submission. Creates the Referral in
// 'pending' status right away, same business event and same shared
// helper (recordReferralIntent) as a link-based code applies at
// registration. Trial/payment status has no bearing on whether this
// succeeds. See backend/docs/REFERRAL_SYSTEM_DESIGN.md §3/§24.
exports.applyReferralCode = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || !code.trim()) {
      return res.status(400).json({ error: 'A referral code is required.' });
    }
    const { recordReferralIntent } = require('../utils/referralUtils');
    const result = await recordReferralIntent(req.user.organization, code.trim());
    if (!result.created) {
      return res.status(400).json({ error: result.reason });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('applyReferralCode error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Sends a "come try DataCircles" email carrying the org's referral link.
// Reuses the existing invite-email infrastructure (sendGridMail +
// authController's HTML-template pattern) rather than a separate mailing
// system, per REFERRAL_SYSTEM_DESIGN.md. IMPORTANT: this must never create
// a Referral — sending an email is not a referral event. A Referral is
// only ever created via recordReferralIntent, at registration (link-based)
// or via applyReferralCode (manual entry). This handler only issues/looks
// up the code and sends mail.
exports.sendReferralEmail = async (req, res) => {
  try {
    const { email, message } = req.body;
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'A recipient email is required.' });
    }

    const ReferralCode = require('../models/ReferralCode');
    const { issueReferralCode } = require('../utils/referralUtils');
    const Organization = require('../models/Organization');

    let referralCode = await ReferralCode.findOne({ organization: req.user.organization, isActive: true }).sort({ createdAt: -1 });
    if (!referralCode) {
      referralCode = await issueReferralCode(req.user.organization);
    }

    const org = await Organization.findById(req.user.organization);
    const referralLink = `${process.env.FRONTEND_URL}?ref=${referralCode.code}`;
    const senderName = req.user.name || req.user.email || 'A DataCircles user';

    const html = generateReferralEmailHTML(referralLink, org?.name || '', senderName, message?.trim() || '');
    await sendGridMail({ to: email.trim(), subject: `${senderName} thinks DataCircles could help your team`, html });

    // Logged only AFTER the mail actually went out, so the list never
    // claims an invite SendGrid rejected. Still not a Referral — see
    // models/ReferralInvite.js.
    const ReferralInvite = require('../models/ReferralInvite');
    const invite = await ReferralInvite.findOneAndUpdate(
      { organization: req.user.organization, email: email.trim().toLowerCase() },
      {
        $set: {
          invitedBy: req.user._id || req.user.id,
          invitedByName: senderName,
          referralCode: referralCode._id,
          lastSentAt: new Date(),
        },
        $inc: { sendCount: 1 },
        $setOnInsert: { organization: req.user.organization, email: email.trim().toLowerCase() },
      },
      { upsert: true, new: true, setDefaultsOnInsert: false }
    );

    res.json({ success: true, invite: { _id: invite._id, email: invite.email, lastSentAt: invite.lastSentAt, sendCount: invite.sendCount } });
  } catch (error) {
    console.error('sendReferralEmail error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Public endpoint — no auth required. Returns catalog add-ons for a plan before signup.
exports.getAddonsForPlan = async (req, res) => {
  try {
    const { planId } = req.params;
    const { billingCycle = 'monthly' } = req.query;

    const plan = await PlanConfig.findOne({ planId, isActive: true });
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const addons = await PlanAddon.find({
      isActive: true,
      $or: [{ availableOnPlans: { $size: 0 } }, { availableOnPlans: planId }],
    }).sort({ sortOrder: 1 });

    res.json({
      addons: addons.map((a) => ({
        key: a.key,
        displayName: a.displayName,
        description: a.description,
        pricingType: a.pricingType,
        effectType: a.effectType,
        targetKey: a.targetKey,
        incrementPerUnit: a.incrementPerUnit,
        price: a.price,
        maxQuantityPerOrg: a.maxQuantityPerOrg,
      })),
    });
  } catch (error) {
    console.error('getAddonsForPlan error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getAvailableAddons = async (req, res) => {
  try {
    const { getAvailableAddonsForOrg } = require('../utils/addonManagement');
    const addons = await getAvailableAddonsForOrg(req.user.organization);
    res.json({ addons });
  } catch (error) {
    console.error('getAvailableAddons error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.checkAddonCompatibility = async (req, res) => {
  try {
    const { targetPlanId, billingCycle } = req.query;
    if (!targetPlanId || !billingCycle) {
      return res.status(400).json({ error: 'targetPlanId and billingCycle are required.' });
    }
    const subscription = await Subscription.findOne({ organization: req.user.organization });
    if (!subscription) return res.status(404).json({ error: 'No subscription found.' });

    // Optional live carryForward overrides — sent as the customer adjusts the
    // carry-forward stepper in the downgrade modal, so this preview can
    // RE-VALIDATE against their actual current choice instead of only the
    // initial full-survival recommendation. JSON-encoded query param since
    // this is a GET endpoint: ?carryForward=[{"addonKey":"seat","quantity":0}]
    let carryForwardOverrides = [];
    if (req.query.carryForward) {
      try {
        carryForwardOverrides = JSON.parse(req.query.carryForward);
      } catch (parseErr) {
        return res.status(400).json({ error: 'carryForward must be valid JSON.' });
      }
    }

    const { buildEffectiveSubscription } = require('../utils/renewalEngine');
    const { validateDowngrade } = require('../utils/downgradeValidator');
    const previewHorizon = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000);
    const { effective } = await buildEffectiveSubscription(subscription, previewHorizon);
    // Phase 2b: key on (addonKey, billingCycle), not addonKey alone — see
    // addonManagement.addonIdentityKey's comment.
    const effectiveQuantityByKey = new Map(
      (effective.activeAddons || []).map((a) => [addonIdentityKey(a, subscription.billingCycle), a.quantity])
    );

    const activeAddons = subscription.activeAddons || [];
    const { compatible: rawCompatible, incompatible } = activeAddons.length > 0
      ? await classifyAddonsForPlanChange(activeAddons, targetPlanId, billingCycle)
      : { compatible: [], incompatible: [] };

    // Survived quantity (falls back to 0, not raw quantity: absence from the
    // effective map means already fully consumed by an existing scheduled
    // removal), THEN apply the customer's own carryForward override on top —
    // same clamp-to-[0, survived] logic as updateSubscription's downgrade
    // branch, so this preview can never show a number the commit path
    // wouldn't also allow.
    const compatible = rawCompatible
      .map((c) => {
        const survives = effectiveQuantityByKey.get(addonIdentityKey(c, subscription.billingCycle)) ?? 0;
        const override = carryForwardOverrides.find((o) => o.addonKey === c.addonKey);
        const quantity = override ? Math.max(0, Math.min(override.quantity, survives)) : survives;
        return { ...c, quantity };
      })
      .filter((c) => c.quantity > 0);

    // Downgrade eligibility — same validator updateSubscription's downgrade
    // branch gates on, run here with the SAME resolved carry-forward state
    // (not an independent full-survival assumption) so the preview always
    // agrees with what will actually be allowed at confirm time. This is
    // what makes live re-validation on every stepper change possible.
    const resolvedCarryForwardForValidation = compatible.map((c) => ({ addonKey: c.addonKey, quantity: c.quantity }));
    const downgradeValidation = await validateDowngrade(subscription, targetPlanId, [], resolvedCarryForwardForValidation);

    res.json({ compatibleCarryForward: compatible, incompatibleDropped: incompatible, downgradeValidation });
  } catch (error) {
    console.error('checkAddonCompatibility error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Escape hatch for the freeze rule (business contract, agreed 2026-07-24):
// once a downgrade is scheduled, this — or cancelling the subscription
// outright — is the only allowed action until it's resolved. No "edit"
// endpoint exists (also per that contract) — cancel and re-run the
// validate-then-schedule flow from scratch instead.
exports.cancelScheduledDowngrade = async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ organization: req.user.organization });
    if (!subscription) return res.status(404).json({ error: 'No subscription found.' });
    // planName presence, not object truthiness — pendingUpdate is a nested
    // schema object Mongoose auto-instantiates as {} even when nothing was
    // ever scheduled (same class of bug fixed in assertNotFrozen earlier).
    if (!subscription.pendingUpdate?.planName) {
      return res.status(400).json({ error: 'No scheduled downgrade to cancel.' });
    }

    const cancelledPlanName = subscription.pendingUpdate.planName;
    const beforeSnapshot = {
      planName: subscription.planName,
      billingCycle: subscription.billingCycle,
      pricePerUser: subscription.pricePerUser,
      userCount: subscription.userCount,
      totalAmount: subscription.totalAmount,
      activeAddons: subscription.activeAddons,
    };

    // Reverse the carry-forward reduction THIS downgrade caused — precisely
    // the delta it added, not the resulting total, since that total may
    // have been an update to a pre-existing partial removal (subtracting
    // the full total would wipe out a removal the customer scheduled
    // separately, before this downgrade ever existed).
    const reducedAddonDeltas = subscription.pendingUpdate.reducedAddonDeltas || [];
    if (reducedAddonDeltas.length > 0) {
      const pendingRemovals = subscription.pendingAddonRemovals || [];
      for (const delta of reducedAddonDeltas) {
        const existing = pendingRemovals.find((r) => r.addonKey === delta.addonKey);
        if (!existing) continue;
        const restoredQuantity = existing.quantity - delta.quantity;
        if (restoredQuantity <= 0) {
          // This downgrade created the entry fresh — remove it entirely.
          subscription.pendingAddonRemovals = pendingRemovals.filter((r) => r.addonKey !== delta.addonKey);
          try {
            await ScheduledChange.updateMany(
              {
                organization: subscription.organization,
                subscription: subscription._id,
                type: 'REMOVE_ADDON',
                status: 'PENDING',
                'payload.addonKey': delta.addonKey,
              },
              { $set: { status: 'CANCELLED', reason: 'Cancelled by user (downgrade cancelled)' } }
            );
          } catch (scErr) {
            console.error(`Cancelling REMOVE_ADDON ScheduledChange failed (non-fatal) for addonKey=${delta.addonKey}:`, scErr.message);
          }
        } else {
          // This downgrade updated a pre-existing partial removal — restore
          // it to what it was before, keep it PENDING.
          existing.quantity = restoredQuantity;
          try {
            await ScheduledChange.updateOne(
              {
                organization: subscription.organization,
                subscription: subscription._id,
                type: 'REMOVE_ADDON',
                status: 'PENDING',
                'payload.addonKey': delta.addonKey,
              },
              { $set: { 'payload.quantity': restoredQuantity } }
            );
          } catch (scErr) {
            console.error(`Restoring REMOVE_ADDON ScheduledChange quantity failed (non-fatal) for addonKey=${delta.addonKey}:`, scErr.message);
          }
        }
      }
    }

    subscription.pendingUpdate = null;
    await subscription.save();

    try {
      await ScheduledChange.updateMany(
        {
          organization: subscription.organization,
          subscription: subscription._id,
          type: { $in: ['PLAN_CHANGE', 'BILLING_CYCLE_CHANGE'] },
          status: 'PENDING',
        },
        { $set: { status: 'CANCELLED', reason: 'Cancelled by user' } }
      );
    } catch (scErr) {
      console.error(
        `Cancelling PLAN_CHANGE ScheduledChange failed (non-fatal) — organization=${subscription.organization} subscription=${subscription._id}:`,
        scErr.message
      );
    }

    // Timeline entry for the reversal — never delete the original "scheduled"
    // event (that's real audit history of what happened), add a new one
    // documenting the cancellation instead.
    try {
      await emitBillingEvent({
        organization: subscription.organization,
        subscription: subscription._id,
        eventType: 'SCHEDULE_CANCELLED',
        status: 'cancelled',
        before: beforeSnapshot,
        after: subscription,
        amounts: { recurringAfter: subscription.totalAmount },
        metadata: { targetPlanId: cancelledPlanName },
      });
    } catch (evErr) {
      console.error('Timeline event for downgrade cancellation failed (non-fatal):', evErr.message);
    }

    res.json({ success: true, message: `Scheduled downgrade to ${cancelledPlanName} has been cancelled. Your current plan continues unchanged.` });
  } catch (error) {
    console.error('cancelScheduledDowngrade error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Task 2 (Aug 2026) — the gap found while auditing cancellation states: the
// only existing way to clear a scheduled cancellation was reactivateAndProceed
// (Task B), which requires picking a DIFFERENT plan. A user who scheduled
// cancellation by mistake and wants to simply stay on their current plan had
// no path back at all. Mirrors cancelScheduledDowngrade's shape immediately
// above — same plan, same cycle, just the CANCELLATION ScheduledChange
// reversed. Much simpler than that function: cancellation never touches
// addons/pricing, so there's no carry-forward delta to reverse.
exports.undoCancellation = async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ organization: req.user.organization });
    if (!subscription) return res.status(404).json({ error: 'No subscription found.' });
    if (!subscription.cancelAtPeriodEnd) {
      return res.status(400).json({ error: 'No scheduled cancellation to undo.' });
    }

    const beforeSnapshot = { cancelAtPeriodEnd: subscription.cancelAtPeriodEnd };
    subscription.cancelAtPeriodEnd = false;
    await subscription.save();

    try {
      await ScheduledChange.updateMany(
        { organization: subscription.organization, subscription: subscription._id, type: 'CANCELLATION', status: 'PENDING' },
        { $set: { status: 'CANCELLED', reason: 'Cancelled by user (undo cancellation)' } }
      );
    } catch (scErr) {
      console.error(
        `Cancelling CANCELLATION ScheduledChange failed (non-fatal) — organization=${subscription.organization} subscription=${subscription._id}:`,
        scErr.message
      );
    }

    try {
      // Task 3 (Aug 2026) — the "Staying on undefined" bug: SCHEDULE_CANCELLED's
      // subtitle template reads `after?.planName` (billingEvents.js), but this
      // call originally passed a bespoke `{ cancelAtPeriodEnd: false }` object
      // with no planName at all. cancelScheduledDowngrade's own equivalent call
      // (above) passes the full subscription document — matching that pattern.
      await emitBillingEvent({
        organization: subscription.organization,
        subscription: subscription._id,
        eventType: 'SCHEDULE_CANCELLED',
        status: 'cancelled',
        before: beforeSnapshot,
        after: subscription,
        metadata: { reason: 'undo_cancellation' },
      });
    } catch (evErr) {
      console.error('Timeline event for undo-cancellation failed (non-fatal):', evErr.message);
    }

    res.json({ success: true, message: 'Cancellation undone. Your subscription remains active on your current plan.' });
  } catch (error) {
    console.error('undoCancellation error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Read-only preview for the confirmation screen that must appear BEFORE
// Razorpay checkout (missing frontend requirement found via live QA, Aug
// 2026) — explains the transition calculation without creating any Order,
// CommercialTransaction, or pendingCycleTransition. Same guard checks as
// the real endpoint below (shares assertTransitionAllowed internally), so a
// preview never shows a price/eligibility result the real commit would
// then disagree with.
exports.previewMonthlyToAnnualTransition = async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ organization: req.user.organization });
    if (!subscription || !subscription.isPaymentConfirmed) {
      return res.status(400).json({ error: 'No active paid subscription found.' });
    }
    if (subscription.billingCycle !== 'monthly') {
      return res.status(400).json({ error: 'Only a monthly base plan can transition to annual through this flow.' });
    }

    const targetPlanId = req.query?.targetPlanId || subscription.planName;
    const plan = await PlanConfig.findOne({ planId: targetPlanId, isActive: true });
    if (!plan) return res.status(404).json({ error: `Plan "${targetPlanId}" not found or not active.` });
    if (!plan.yearlyPrice) {
      return res.status(400).json({ error: `No annual price configured for the "${plan.planId}" plan.` });
    }

    // Task 2: optional, JSON-encoded since this is a GET —
    // ?addonChoices={"seat":"yearly"}. Any addonKey omitted defaults to
    // 'monthly' (no-op) inside computeAddonConversionPricing.
    let addonChoices = {};
    if (req.query.addonChoices) {
      try {
        addonChoices = JSON.parse(req.query.addonChoices);
      } catch (parseErr) {
        return res.status(400).json({ error: 'addonChoices must be valid JSON.' });
      }
    }

    const { previewMonthlyToAnnualTransition: previewFn } = require('../utils/cycleTransitionLifecycle');
    try {
      const preview = await previewFn({ subscription, plan, addonChoices });
      res.json({ success: true, ...preview });
    } catch (previewErr) {
      if (previewErr.code === 'DOWNGRADE_INELIGIBLE') {
        return res.status(400).json({ error: previewErr.message, code: previewErr.code, validation: previewErr.validation });
      }
      throw previewErr;
    }
  } catch (error) {
    console.error('previewMonthlyToAnnualTransition error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Phase 3 (docs/audit/PHASE3_MONTHLY_TO_ANNUAL_PRORATION.md): Monthly -> Annual
// base-plan cadence transition. See utils/cycleTransitionLifecycle.js for the
// pricing/order logic; this endpoint is guard checks + response shaping only.
exports.initiateMonthlyToAnnualTransition = async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ organization: req.user.organization });
    if (!subscription || !subscription.isPaymentConfirmed) {
      return res.status(400).json({ error: 'No active paid subscription found.' });
    }
    if (subscription.billingCycle !== 'monthly') {
      return res.status(400).json({ error: 'Only a monthly base plan can transition to annual through this flow.' });
    }
    if (subscription.cancelAtPeriodEnd) {
      return res.status(400).json({ error: 'Cannot change billing cycle when subscription is pending cancellation.' });
    }
    if (subscription.pendingCycleTransition?.orderId) {
      return res.status(400).json({ error: 'A previous cycle-transition purchase is still pending payment. Complete it first.' });
    }
    try {
      require('../utils/downgradeValidator').assertNotFrozen(subscription);
    } catch (freezeErr) {
      return res.status(400).json({ error: freezeErr.message, code: freezeErr.code });
    }

    // Cross-tier support: targetPlanId is optional, defaults to the
    // subscription's own current plan (a pure same-tier cycle change) when
    // omitted — every existing caller that doesn't send it keeps working
    // unchanged.
    const targetPlanId = req.body?.targetPlanId || subscription.planName;
    const plan = await PlanConfig.findOne({ planId: targetPlanId, isActive: true });
    if (!plan) return res.status(404).json({ error: `Plan "${targetPlanId}" not found or not active.` });
    if (!plan.yearlyPrice) {
      return res.status(400).json({ error: `No annual price configured for the "${plan.planId}" plan.` });
    }

    // Task 2: optional, defaults to 'monthly' (no-op) for every add-on when
    // omitted — every existing caller that doesn't send this keeps working
    // exactly as before.
    const addonChoices = req.body?.addonChoices || {};

    const { startMonthlyToAnnualTransition } = require('../utils/cycleTransitionLifecycle');
    let result;
    try {
      result = await startMonthlyToAnnualTransition({
        user: req.user,
        organizationId: req.user.organization,
        subscription,
        plan,
        addonChoices,
      });
    } catch (transitionErr) {
      if (transitionErr.code === 'DOWNGRADE_INELIGIBLE') {
        return res.status(400).json({ error: transitionErr.message, code: transitionErr.code, validation: transitionErr.validation });
      }
      throw transitionErr;
    }

    res.json({
      success: true,
      amount: result.amount,
      windowStart: result.windowStart,
      windowEnd: result.windowEnd,
      pricingBreakdown: result.pricingBreakdown,
      addonConversions: result.addonConversions,
      incompatibleAddons: result.incompatibleAddons,
      totalAddonConversionAmount: result.totalAddonConversionAmount,
      paymentDetails: result.paymentDetails,
    });
  } catch (error) {
    console.error('initiateMonthlyToAnnualTransition error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Task 3 (Aug 2026): resuming a LAPSED subscription. See
// utils/reactivationLifecycle.js for the pricing/order logic and the
// explicit lapse-handling assumption — this endpoint is guard checks +
// response shaping only, same division of labor as the cycle-transition
// endpoints immediately above.
exports.previewReactivation = async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ organization: req.user.organization });
    if (!subscription) return res.status(404).json({ error: 'No subscription found.' });
    if (subscription.appStatus !== 'cancelled') {
      return res.status(400).json({ error: 'Subscription has not lapsed — use the standard plan-change flow instead.' });
    }

    const targetPlanId = req.query?.targetPlanId || subscription.planName;
    const billingCycle = req.query?.billingCycle || subscription.billingCycle;
    if (billingCycle !== 'monthly' && billingCycle !== 'yearly') {
      return res.status(400).json({ error: 'billingCycle must be "monthly" or "yearly".' });
    }
    const plan = await PlanConfig.findOne({ planId: targetPlanId, isActive: true });
    if (!plan) return res.status(404).json({ error: `Plan "${targetPlanId}" not found or not active.` });

    const { previewReactivation: previewFn } = require('../utils/reactivationLifecycle');
    const preview = await previewFn({ subscription, plan, billingCycle });
    res.json({ success: true, ...preview });
  } catch (error) {
    console.error('previewReactivation error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.initiateReactivation = async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ organization: req.user.organization });
    if (!subscription) return res.status(404).json({ error: 'No subscription found.' });
    if (subscription.appStatus !== 'cancelled') {
      return res.status(400).json({ error: 'Subscription has not lapsed — use the standard plan-change flow instead.' });
    }
    if (subscription.pendingReactivation?.orderId) {
      return res.status(400).json({ error: 'A previous reactivation purchase is still pending payment. Complete it first.' });
    }

    const targetPlanId = req.body?.targetPlanId || subscription.planName;
    const billingCycle = req.body?.billingCycle || subscription.billingCycle;
    if (billingCycle !== 'monthly' && billingCycle !== 'yearly') {
      return res.status(400).json({ error: 'billingCycle must be "monthly" or "yearly".' });
    }
    const plan = await PlanConfig.findOne({ planId: targetPlanId, isActive: true });
    if (!plan) return res.status(404).json({ error: `Plan "${targetPlanId}" not found or not active.` });

    const { startReactivation } = require('../utils/reactivationLifecycle');
    const result = await startReactivation({
      user: req.user,
      organizationId: req.user.organization,
      subscription,
      plan,
      billingCycle,
    });

    res.json({
      success: true,
      amount: result.amount,
      windowStart: result.windowStart,
      windowEnd: result.windowEnd,
      pricingBreakdown: result.pricingBreakdown,
      paymentDetails: result.paymentDetails,
    });
  } catch (error) {
    console.error('initiateReactivation error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Task 4 (Aug 2026): read-only preview — no Order, no CommercialTransaction,
// no reward reservation. See utils/addonPurchaseLifecycle.js's
// previewAddonPurchase for the pricing logic; this endpoint is guard checks
// + response shaping only, mirroring initiateAddonPurchase immediately below
// (query params instead of body, since this is a GET).
exports.previewAddonPurchase = async (req, res) => {
  try {
    const { addonKey, billingCycle } = req.query;
    const quantity = Number(req.query.quantity);

    if (!addonKey || typeof addonKey !== 'string') {
      return res.status(400).json({ error: 'addonKey is required.' });
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ error: 'quantity must be a positive integer.' });
    }
    if (billingCycle !== undefined && billingCycle !== 'monthly' && billingCycle !== 'yearly') {
      return res.status(400).json({ error: 'billingCycle must be "monthly" or "yearly" when provided.' });
    }

    const subscription = await Subscription.findOne({ organization: req.user.organization });
    if (!subscription || !subscription.isPaymentConfirmed) {
      return res.status(400).json({ error: 'No active paid subscription found.' });
    }

    const plan = await PlanConfig.findOne({ planId: subscription.planName, isActive: true });
    if (!plan) return res.status(404).json({ error: 'Plan configuration not found.' });

    const catalogEntry = await PlanAddon.findOne({ key: addonKey, isActive: true });
    if (!catalogEntry) return res.status(404).json({ error: `Add-on "${addonKey}" not found.` });

    const { previewAddonPurchase: previewFn } = require('../utils/addonPurchaseLifecycle');
    const preview = await previewFn({ subscription, plan, catalogEntry, addonKey, quantity, billingCycle });
    res.json({ success: true, addonKey, quantity, ...preview });
  } catch (error) {
    console.error('previewAddonPurchase error:', error);
    res.status(400).json({ error: error.message });
  }
};

exports.initiateAddonPurchase = async (req, res) => {
  try {
    const { addonKey, quantity, billingCycle } = req.body;

    if (!addonKey || typeof addonKey !== 'string') {
      return res.status(400).json({ error: 'addonKey is required.' });
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ error: 'quantity must be a positive integer.' });
    }
    // Phase 2d.1 (docs/audit/PHASE2_ADDON_CYCLE_TRACE.md): optional, defaults
    // to the subscription's own cycle if omitted — every pre-2d caller keeps
    // working unchanged. Validated here (not just left to startAddonPurchase)
    // so an invalid value gets the same clean 400 treatment as every other
    // input check on this endpoint.
    if (billingCycle !== undefined && billingCycle !== 'monthly' && billingCycle !== 'yearly') {
      return res.status(400).json({ error: 'billingCycle must be "monthly" or "yearly" when provided.' });
    }

    const subscription = await Subscription.findOne({ organization: req.user.organization });
    if (!subscription || !subscription.isPaymentConfirmed) {
      return res.status(400).json({ error: 'No active paid subscription found.' });
    }
    if (subscription.cancelAtPeriodEnd) {
      return res.status(400).json({ error: 'Cannot purchase add-ons when subscription is pending cancellation.' });
    }
    if (subscription.pendingAddonAddition?.orderId) {
      return res.status(400).json({ error: 'A previous add-on purchase is still pending payment. Complete or cancel it first.' });
    }
    try {
      require('../utils/downgradeValidator').assertNotFrozen(subscription);
    } catch (freezeErr) {
      return res.status(400).json({ error: freezeErr.message, code: freezeErr.code });
    }

    const plan = await PlanConfig.findOne({ planId: subscription.planName, isActive: true });
    if (!plan) return res.status(404).json({ error: 'Plan configuration not found.' });

    const catalogEntry = await PlanAddon.findOne({ key: addonKey, isActive: true });
    if (!catalogEntry) return res.status(404).json({ error: `Add-on "${addonKey}" not found.` });

    const planAllowed =
      catalogEntry.availableOnPlans.length === 0 ||
      catalogEntry.availableOnPlans.includes(plan.planId);
    if (!planAllowed) {
      return res.status(400).json({ error: `Add-on "${catalogEntry.displayName}" is not available on the "${plan.planId}" plan.` });
    }

    // Business contract (confirmed): a monthly base plan may only hold
    // monthly add-ons; an annual base plan may hold either. Checked here for
    // a clean 400 — startAddonPurchase re-checks the same rule internally as
    // its own guarantee, not because this check is skippable.
    const resolvedBillingCycle = billingCycle || subscription.billingCycle;
    if (resolvedBillingCycle === 'yearly' && subscription.billingCycle !== 'yearly') {
      return res.status(400).json({ error: 'An annual add-on can only be purchased on an annual base plan.' });
    }

    const pricePerUnit = catalogEntry.price[resolvedBillingCycle];
    if (!pricePerUnit) {
      return res.status(400).json({ error: `No price configured for "${catalogEntry.displayName}" on the ${resolvedBillingCycle} billing cycle.` });
    }

    const result = await startAddonPurchase({
      user: req.user,
      organizationId: req.user.organization,
      subscription,
      plan,
      catalogEntry,
      addonKey,
      quantity,
      billingCycle: resolvedBillingCycle,
    });

    subscription.pendingAddonAddition = result.subscription.pendingAddonAddition;

    res.json({
      success: true,
      prorationAmount: result.discountedProrationAmount,
      // Split by source (fixes a real UI bug: this field used to be a
      // combined coupon+referral total under a referral-only name) —
      // couponDiscountApplied is new, referralDiscountApplied is now
      // correctly referral-only, totalDiscountApplied is the combined
      // figure for callers that just want one number.
      couponDiscountApplied: result.couponDiscountAmount || undefined,
      referralDiscountApplied: result.referralDiscountAmount || undefined,
      totalDiscountApplied: result.totalDiscountAmount || undefined,
      pricingBreakdown: result.pricingBreakdown,
      paymentDetails: result.paymentDetails,
      // Phase 2d.1: echo back what will actually be purchased once payment
      // settles, so the frontend doesn't need a second fetch to know which
      // instance this checkout targets.
      billingCycle: resolvedBillingCycle,
    });
  } catch (error) {
    console.error('initiateAddonPurchase error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.scheduleAddonRemovalEndpoint = async (req, res) => {
  try {
    const { addonKey, quantity, billingCycle } = req.body;

    if (!addonKey) return res.status(400).json({ error: 'addonKey is required.' });
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ error: 'quantity must be a positive integer.' });
    }
    // Phase 2d.1: optional, defaults to the subscription's own cycle — every
    // pre-2d caller keeps working unchanged.
    if (billingCycle !== undefined && billingCycle !== 'monthly' && billingCycle !== 'yearly') {
      return res.status(400).json({ error: 'billingCycle must be "monthly" or "yearly" when provided.' });
    }

    const subscription = await Subscription.findOne({ organization: req.user.organization });
    if (!subscription || !subscription.isPaymentConfirmed) {
      return res.status(400).json({ error: 'No active paid subscription found.' });
    }
    try {
      require('../utils/downgradeValidator').assertNotFrozen(subscription);
    } catch (freezeErr) {
      return res.status(400).json({ error: freezeErr.message, code: freezeErr.code });
    }

    const result = await scheduleAddonRemovalUtil(req.user.organization, addonKey, quantity, billingCycle);
    const resolvedBillingCycle = billingCycle || subscription.billingCycle;

    // Scheduling a removal doesn't touch activeAddons immediately (only
    // pendingAddonRemovals) — the org keeps full access until effectiveAt.
    // So result.subscription's activeAddons is identical to `subscription`'s,
    // making a literal before/after snapshot show no change at all, even
    // though something real WAS scheduled. Build a projected "after" instead:
    // what activeAddons (and thus recurring total) will look like once THIS
    // removal actually executes, so Timeline shows the real before -> after
    // quantity drop instead of two identical snapshots.
    // Phase 2d.1: matched via addonIdentityKey — the pre-2d `a.addonKey ===
    // addonKey` match would have projected the wrong cycle-variant's
    // quantity drop once dual-cycle entries can actually exist.
    const projectedActiveAddons = (subscription.activeAddons || [])
      .map((a) => {
        const plain = a.toObject ? a.toObject() : a;
        return addonIdentityKey(plain, subscription.billingCycle) === addonIdentityKey({ addonKey, billingCycle: resolvedBillingCycle }, subscription.billingCycle)
          ? { ...plain, quantity: plain.quantity - quantity }
          : plain;
      })
      .filter((a) => a.quantity > 0);
    const projectedAfter = {
      planName: subscription.planName,
      billingCycle: subscription.billingCycle,
      pricePerUser: subscription.pricePerUser,
      userCount: subscription.userCount,
      activeAddons: projectedActiveAddons,
      totalAmount: calculateInvoice({
        subscription: { planName: subscription.planName, billingCycle: subscription.billingCycle, pricePerUser: subscription.pricePerUser, activeAddons: projectedActiveAddons },
      }).taxable,
    };

    await emitBillingEvent({
      organization: req.user.organization,
      subscription: subscription._id,
      eventType: 'ADDON_REMOVAL_SCHEDULED',
      status: 'scheduled',
      effectiveAt: result.effectiveAt,
      before: subscription,
      after: projectedAfter,
      amounts: { recurringBefore: subscription.totalAmount, recurringAfter: projectedAfter.totalAmount },
      metadata: { addonKey, quantity, displayName: result.displayName, billingCycle: resolvedBillingCycle },
    });

    res.json({
      success: true,
      message: `${result.displayName} ×${quantity} will be removed at the end of your current billing period (${new Date(result.effectiveAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}).`,
      effectiveAt: result.effectiveAt,
      billingCycle: resolvedBillingCycle,
    });
  } catch (error) {
    console.error('scheduleAddonRemoval error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Phase 2d.1 — read-only preview, mirrors scheduleAddonRemovalEndpoint's
// effectiveAt computation exactly (same existingAddon lookup, same
// periodEnd-or-currentPeriodEnd rule) without writing anything. Lets the
// frontend show "this removes on <date>" before the user commits.
exports.previewAddonRemoval = async (req, res) => {
  try {
    const { addonKey, quantity: quantityRaw, billingCycle } = req.query;
    const quantity = Number(quantityRaw);

    if (!addonKey) return res.status(400).json({ error: 'addonKey is required.' });
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ error: 'quantity must be a positive integer.' });
    }
    if (billingCycle !== undefined && billingCycle !== 'monthly' && billingCycle !== 'yearly') {
      return res.status(400).json({ error: 'billingCycle must be "monthly" or "yearly" when provided.' });
    }

    const subscription = await Subscription.findOne({ organization: req.user.organization });
    if (!subscription || !subscription.isPaymentConfirmed) {
      return res.status(400).json({ error: 'No active paid subscription found.' });
    }

    const resolvedBillingCycle = billingCycle || subscription.billingCycle;
    const existingAddon = (subscription.activeAddons || []).find(
      (a) => addonIdentityKey(a, subscription.billingCycle) === addonIdentityKey({ addonKey, billingCycle: resolvedBillingCycle }, subscription.billingCycle)
    );
    if (!existingAddon) {
      return res.status(404).json({ error: `Organization does not have the "${addonKey}" add-on on the ${resolvedBillingCycle} billing cycle.` });
    }
    if (quantity > existingAddon.quantity) {
      return res.status(400).json({ error: `Cannot remove ${quantity} units — only ${existingAddon.quantity} owned.` });
    }

    const catalogEntry = await PlanAddon.findOne({ key: addonKey });
    const effectiveAt = existingAddon.periodEnd || subscription.currentPeriodEnd;

    res.json({
      addonKey,
      billingCycle: resolvedBillingCycle,
      quantity,
      remainingQuantity: existingAddon.quantity - quantity,
      effectiveAt,
      displayName: catalogEntry?.displayName || addonKey,
    });
  } catch (error) {
    console.error('previewAddonRemoval error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Deprecated — use POST /addons/purchase or POST /addons/remove
exports.adjustAddon = async (req, res) => {
  return res.status(410).json({
    error: 'This endpoint is deprecated. Use POST /subscription/addons/purchase to add add-ons or POST /subscription/addons/remove to schedule removal.',
  });
};
