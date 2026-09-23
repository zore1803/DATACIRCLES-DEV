// utils/renewalEngine.js
//
// Renewal Engine — Phase 4B Slice 1 ("Renewal Happy Path v1"), per
// IMPLEMENTATION_PLAN_V1.md's Phase 4B design subsection and
// BILLING_DOMAIN_SPECIFICATION.md Chapter 3.5 (R1-R13).
//
// SCOPE OF THIS SLICE, DELIBERATELY NARROW: one subscription, zero PENDING
// ScheduledChange records, valid mandate, successful charge. This is not the
// full Renewal Engine — it is the happy path only. NOT wired into any cron,
// scheduler, or webhook. Not called from anywhere yet — callable, not running.
//
// PHASE 4B SLICE 3 — all four outcomes (RENEWED/PAST_DUE/RECONCILIATION_NEEDED/
// SKIPPED) are now structured returns, never throws, for expected business
// cases. PAST_DUE is fully real: a clean charge failure sets appStatus to
// past_due (via the existing setAppStatus helper) and leaves BillingInvoice/
// CommercialTransaction untouched in their non-terminal state, so a Retry
// Engine calling renewSubscription() again finds them and resumes via the
// same R13.5 repair-forward logic already verified in Slice 2 — no new
// idempotency work was needed for this. RECONCILIATION_NEEDED is a structured
// return now too, but its actual reconciliation logic (querying Razorpay to
// find out what really happened) is still not built — only the throw-vs-return
// shape changed, per Phase 4C's Step 7 finding that this was the actual
// blocker, not new idempotency work.
//
// Explicitly still NOT built:
//   - ScheduledChange application is now real (Phase 4E) — R3 queries
//     PENDING ScheduledChange records with effectiveAt <= now and folds
//     them into the Effective Subscription via buildEffectiveSubscription().
//     A due CANCELLATION short-circuits into its own CANCELLED outcome
//     before any pricing/charge step. REDUCE_QUANTITY has no real-world
//     writer yet and throws rather than guessing its shape.
//   - Real reconciliation logic behind RECONCILIATION_NEEDED (Razorpay query).
//   - The Retry Engine itself, and whether `retrying` is a real appStatus
//     value or derived shorthand over `past_due` — an open question named in
//     the Phase 4C design subsection, not resolved here.
//
// R7 — Coupon revalidation at renewal (§3.6a, Chapter 19 C2/C4, Chapter 17).
// utils/couponRenewalEligibility.js gates the coupon modifier on
// `appliedCoupon.duration.type`. Only `lifetime`/`until_cancelled`/
// `first_payment` are handled — verified by tracing the actual creation
// validation (couponController.js's ENFORCEABLE_DURATIONS) that these are
// the only reachable-in-production types today (`fixed_cycles`/`until_date`
// are rejected at coupon creation). `fixed_cycles` (needs a cycles-consumed
// counter — confirmed by grep, none exists anywhere) and `until_date` (needs
// an expiry field on the SNAPSHOT itself, which also doesn't exist — the
// live Coupon.validity.expiryDate must never be read here per this file's
// own snapshot-immutability rule) are both explicitly NOT implemented,
// fail-closed, same 🟩 triage class as this session's other
// declared-but-unbacked-state findings. Not a live bug either way: both
// types are unreachable in production today.
//
// R8 — Referral reward as a renewal-time modifier (§3.6b, RF1/RF3/RF6). Wired
// in below, reusing the exact same reservation/consumption primitives already
// proven live at the upgrade and add-on/seat-purchase call sites — no new
// business logic, no new schema:
//   - Reservation happens once, in the fresh-renewal branch only (never on a
//     resumed attempt — see the `rewardUsageId` handling in both branches
//     below), mirroring startAddonPurchase()'s reservation step.
//   - The reserved RewardUsage's id is stored in
//     CommercialTransaction.target.rewardUsageId (same pattern already used
//     for orderId/period dates) so a resumed run (R13.5) recovers it without
//     re-reserving.
//   - Consumption happens inside this function's own commit sequence, right
//     after the charge is recorded COMMITTED — NOT in a webhook handler, since
//     unlike an Order-based purchase, renewal's charge result is known
//     synchronously here. consumeReservation() is already a status-guarded
//     atomic update (verified safe against duplicate calls in this project's
//     reservation-lifecycle audit), so calling it again on a resumed renewal
//     is safe by construction — no extra guard needed at this call site.
//   - PAST_DUE (clean charge failure): the reservation is deliberately left
//     `reserved`, not released — same "leave it, let the resumed/retried
//     attempt reuse it" philosophy R13.5 already applies to
//     BillingInvoice/CommercialTransaction. A purchase-flow reservation
//     releases on outright decline because there's no repair-forward retry
//     for that flow; renewal has one, so releasing here would let a
//     concurrent, unrelated reservation attempt steal the reward out from
//     under a retry that's about to succeed.
//   - RECONCILIATION_NEEDED (ambiguous charge result): same reasoning — left
//     untouched, exactly like BillingInvoice/CommercialTransaction are.
//   - The VOID-and-replace interaction (RF6 — a concurrent commercial action,
//     e.g. an upgrade, voids this renewal's pending invoice before payment
//     resolves) is NOT handled inside this file — it lives wherever that
//     void-and-replace logic runs (see the RENEWAL-type addition next to
//     subscriptionController.js's existing UPGRADE VOID-on-recycle block).
//
// CAW-only. Legacy (non-CAW, Razorpay-Subscription-driven) renewal is
// completely untouched — those subscriptions keep renewing via
// handleSubscriptionCharged/Razorpay's own webhooks, unrelated to this file.

const { calculateInvoice, toPricingBreakdown } = require('./invoiceEngine');
const BillingInvoice = require('../models/BillingInvoice');
const BillingCycle = require('../models/BillingCycle');
const CommercialTransaction = require('../models/CommercialTransaction');
const ScheduledChange = require('../models/ScheduledChange');
const { reserveNextAvailableReward, consumeReservation, getNextAvailableReward, recordRewardUsageAmount } = require('./referralRewards');
const { rewardToModifier } = require('./modifierResolver');
const { isCouponStillEligibleForRenewal } = require('./couponRenewalEligibility');
const { buildCouponModifierForLineItems } = require('./discountEngine');
const { addonIdentityKey } = require('./addonManagement');
// Reused, not reimplemented — same helper subscriptionLifecycleJobs.js already
// imports this way; appends to Subscription.appStatusHistory automatically.
const { setAppStatus } = require('../controllers/subscriptionController');

/**
 * @param {Object} subscription - a Subscription document, already confirmed:
 *   due (nextBillingDate <= now), appStatus renewable, mandateTokenId present.
 *   This function does NOT itself perform R1/R2's due/renewable checks —
 *   those are the caller's job. It DOES perform its own ScheduledChange
 *   query (R3) — see buildEffectiveSubscription().
 * @param {Function} chargeMandateFn - injected CAW charge call, real signature
 *   TBD by whichever session wires actual Razorpay charging; must resolve to
 *   { success: true, paymentId, orderId } or throw. Injected so this slice's
 *   own tests can stub it without touching real Razorpay.
 * @returns {Promise<RenewalResult>}
 *
 * PHASE 4B SLICE 2 — R13.5 idempotent repair-forward. Every step below checks
 * "did this already happen?" against existing persisted state before acting,
 * same philosophy as reconcileMandate (subscriptionController.js:1880) — not
 * a Mongo transaction (the charge is an external, non-reversible side effect;
 * no local transaction can roll it back), and not a new orchestrator. Calling
 * this function twice for the same subscription+period, at any point after a
 * partial failure, resumes from the first incomplete step instead of
 * re-running completed ones — the mandate is charged at most once per period.
 * @param {String} [_injectFailureAfter] - TEST ONLY, undefined in all production
 *   call sites. Throws immediately after the named checkpoint's write
 *   succeeds, so Step 6's verification scenarios can prove repair-forward
 *   resumes correctly. One of 'CHARGE_COMMITTED' | 'INVOICE_PAID' |
 *   'SUBSCRIPTION_ADVANCED'. No effect on any real code path when omitted.
 */
async function renewSubscription(subscription, { chargeMandateFn, _injectFailureAfter } = {}) {
  // A 'manual' subscription has no mandate: its chargeMandateFn (see
  // manualRenewal.js) sends a payment link instead, and a later call with the
  // captured payment commits the renewal through the same steps below.
  if (!subscription.mandateTokenId && subscription.billingMode !== 'manual') {
    // R1/R2 gating — SKIPPED. Structured return, not a throw (Phase 4B Slice
    // 3): this is an expected business outcome (this subscription was never
    // renewal-eligible in the first place), not an error condition.
    return { outcome: 'SKIPPED', reason: 'NOT_RENEWABLE' };
  }

  // Step 0 — resume check. The existing partial unique index on
  // CommercialTransaction ({subscription:1, type:1}, non-terminal statuses)
  // guarantees at most one non-terminal RENEWAL transaction per subscription
  // at a time — so finding one here means this IS the in-progress attempt
  // for the current period, not a stale one, and reusing it (rather than
  // creating a second invoice/transaction) is exactly what avoids re-charging.
  let commercialTransaction = await CommercialTransaction.findOne({
    organization: subscription.organization,
    subscription: subscription._id,
    type: 'RENEWAL',
    status: { $in: ['PRICED', 'COMMITTED'] },
  });

  let billingInvoice;
  let newPeriodStart;
  let newPeriodEnd;
  let appliedScheduledChangeIds;
  // R8 — the RewardUsage (if any) reserved for THIS renewal attempt. Set from
  // the resumed transaction's own target on resume, or freshly reserved
  // below on a first attempt — never both, so a resumed run never reserves a
  // second reward for the same renewal.
  let rewardUsageId;

  if (commercialTransaction) {
    // Resuming a prior attempt — reuse its invoice and target period rather
    // than recomputing (recomputing pricing here would risk pricing drift if
    // catalog prices changed between attempts; the original invoice is the
    // one the customer was already charged against).
    billingInvoice = await BillingInvoice.findById(commercialTransaction.latestInvoice);
    newPeriodStart = new Date(commercialTransaction.target.newPeriodStart);
    newPeriodEnd = new Date(commercialTransaction.target.newPeriodEnd);
    appliedScheduledChangeIds = commercialTransaction.target.appliedScheduledChangeIds || [];
    rewardUsageId = commercialTransaction.target.rewardUsageId || null;
  } else {
    // Fresh renewal — steps 1-3 of the original commit sequence, unchanged
    // from Slice 1, except newPeriodStart/newPeriodEnd are now computed here
    // (before charging) and stored in CommercialTransaction.target so a
    // resumed run can know the target period without re-deriving it from a
    // Subscription document that may have already been advanced.

    // INVARIANT: as of this migration, renewSubscription() reads exclusively
    // from ScheduledChange for R3. It must never also read pendingUpdate or
    // pendingAddonRemovals — those become write-only compatibility fields for
    // any other code path still using them, not a second input to renewal
    // decisions. If a future change needs to consult both, that is itself a
    // sign the migration is incomplete, not a reason to merge the two here.
    const now = new Date();
    const { effective, appliedIds, cancellation } = await buildEffectiveSubscription(subscription, now);
    appliedScheduledChangeIds = appliedIds;

    if (cancellation) {
      // A due CANCELLATION takes priority over renewal — no pricing, no charge.
      // Detection belongs here, not in a caller: R3's ScheduledChange query is
      // already this function's own responsibility, and a due cancellation is
      // only detectable by that same query — pushing detection to a caller
      // would duplicate the query and reopen a staleness race between the two.
      setAppStatus(subscription, 'cancelled', 'Scheduled cancellation executed at renewal boundary');
      await subscription.save();
      cancellation.status = 'EXECUTED';
      await cancellation.save();
      // Cancellation is marked EXECUTED here, not via Step 9's
      // appliedScheduledChangeIds mechanism below, because this branch returns
      // before CommercialTransaction is ever created — there is no
      // repair-forward resumption to protect (nothing was charged, nothing
      // partially committed). The two mechanisms are intentionally different:
      // appliedScheduledChangeIds exists specifically to survive a
      // crash-and-resume between charge and commit, a risk that doesn't exist
      // for a cancellation that never charges.
      return { outcome: 'CANCELLED', reason: 'SCHEDULED_CANCELLATION', scheduledChange: cancellation._id };
    }

    // R7 — gated on isCouponStillEligibleForRenewal() (duration.type — is
    // this coupon eligible for a FUTURE commercial event at all), evaluated
    // fresh every renewal, same pipeline position as R8's reward check below.
    //
    // FIX (found via live QA — a downgrade scheduled before a coupon-bearing
    // subscription's first renewal exposed this): this previously reused
    // subscription.appliedCoupon.discountAmount — a FLAT amount frozen from
    // whenever the coupon was first applied — as an 'entire_invoice' modifier,
    // regardless of what plan/add-ons are actually being renewed. That's
    // wrong the instant the renewed composition differs from the
    // application-time composition (a scheduled plan change, a changed
    // add-on set, even without any scheduled change at all) — the coupon may
    // not cover the new plan, or may cover it at a different rate. Now built
    // fresh from fullRulesSnapshot against the actual EFFECTIVE line items
    // (post-scheduled-change plan + add-ons), the exact same per-item
    // eligibility helper CP3 already proved correct for upgrade/add-on
    // commit — never a second, hand-rolled approximation.
    const resolvedModifiers = [];
    if (subscription.appliedCoupon?.fullRulesSnapshot && isCouponStillEligibleForRenewal(subscription.appliedCoupon)) {
      const effectiveLineItems = [
        { key: effective.planName, type: 'plan', amount: effective.pricePerUser },
        ...effective.activeAddons.map((a) => ({ key: a.addonKey, type: 'addon', amount: a.quantity * a.pricePerUnit })),
      ];
      const couponModifier = buildCouponModifierForLineItems(subscription.appliedCoupon.fullRulesSnapshot, effectiveLineItems);
      if (couponModifier) resolvedModifiers.push(couponModifier);
    }

    // R8 — referral reward as a renewal-time modifier. Same
    // reserveNextAvailableReward()/rewardToModifier() primitives already
    // proven live at the upgrade and add-on/seat-purchase call sites — a new
    // caller, not new reservation logic. Reserved once, here, only on a
    // fresh attempt (see the `rewardUsageId` declaration above for why a
    // resumed attempt never re-reserves).
    const rewardReservation = await reserveNextAvailableReward(subscription.organization, {
      subscription: subscription._id,
      context: 'RENEWAL',
    });
    if (rewardReservation) {
      resolvedModifiers.push(rewardToModifier(rewardReservation.reward));
      rewardUsageId = rewardReservation.usage._id;
    }

    // R4-R9 — price via calculateInvoice(), no adjustmentContext (a renewal
    // is a fresh full-period charge, same shape as createSubscription's own
    // call).
    const invoice = calculateInvoice({ subscription: effective, resolvedModifiers });

    // BILLING_UX_SPEC.md §4 — record the real amount now that pricing knows
    // it (reserve-before-pricing, same reasoning as upgrade/add-on).
    if (rewardReservation) {
      const referralAmountAtRenewal = (invoice.modifierBreakdown || []).filter((m) => m.type === 'referral').reduce((s, m) => s + m.amount, 0);
      if (referralAmountAtRenewal > 0) {
        await recordRewardUsageAmount(rewardReservation.usage._id, referralAmountAtRenewal);
      }
    }

    newPeriodStart = subscription.currentPeriodEnd;
    newPeriodEnd = computeNextPeriodEnd(subscription);

    // R10 — persist BillingInvoice as PENDING_PAYMENT before charging. A
    // failure here is fatal to the renewal (R13's commit needs a real
    // invoice document to reference) — unlike Phase 2's signup concession,
    // this is new construction, not a migration shadowing an
    // already-authoritative legacy write.
    billingInvoice = await BillingInvoice.create({
      organization: subscription.organization,
      subscription: subscription._id,
      reason: 'RENEWAL',
      lineItems: invoice.lines,
      subtotal: invoice.subtotal,
      discount: invoice.discount,
      taxable: invoice.taxable,
      gst: invoice.gst,
      total: invoice.total,
      generatedAt: invoice.generatedAt,
      status: 'PENDING_PAYMENT',
    });

    // CommercialTransaction{type:'RENEWAL'} — CREATED/PRICED collapsed into
    // one write (mirrors the add-on-purchase/upgrade pattern: "never lingers
    // in CREATED"). target stores newPeriodStart/newPeriodEnd (existing
    // Mixed field, same pattern every other CommercialTransaction call site
    // already uses to store flow-specific data — no schema change) so a
    // resumed run can recover the target period without depending on
    // Subscription's own (mutable) currentPeriodEnd.
    commercialTransaction = await CommercialTransaction.create({
      organization: subscription.organization,
      subscription: subscription._id,
      type: 'RENEWAL',
      status: 'PRICED',
      // rewardUsageId (R8): stored so a resumed attempt (R13.5) recovers the
      // already-reserved reward instead of reserving a second one — same
      // pattern as orderId/period dates already stored here.
      //
      // effectiveState (P0 fix, found via live QA): the exact commercial
      // state calculateInvoice() priced THIS renewal against — planName,
      // billingCycle, pricePerUser, activeAddons, and the resulting
      // totalAmount. Stored here (not just used transiently) so Step 6 below
      // can synchronize the real Subscription document to it after charge
      // success, on BOTH a fresh renewal and a resumed one (a resumed run
      // never recomputes `effective`, so without this stored snapshot it
      // would have nothing to sync from). Closes the exact gap the upgrade
      // commit bug also had: pricing computed the right answer, but the
      // canonical Subscription document silently never received it.
      target: {
        billingInvoice: billingInvoice._id, total: invoice.total, newPeriodStart, newPeriodEnd,
        appliedScheduledChangeIds: appliedIds, rewardUsageId,
        effectiveState: {
          planName: effective.planName,
          billingCycle: effective.billingCycle,
          pricePerUser: effective.pricePerUser,
          activeAddons: effective.activeAddons,
          totalAmount: invoice.taxable,
        },
      },
      latestInvoice: billingInvoice._id,
    });

    // Link BillingInvoice -> CommercialTransaction now that both exist (the
    // field was on the schema since Phase 1 but never populated for any
    // invoice yet — signup's BillingInvoice write predates
    // CommercialTransaction existing at all, so this is the first time this
    // link is ever set).
    billingInvoice.commercialTransaction = commercialTransaction._id;
    await billingInvoice.save();
  }

  // Step 4 — charge exactly once. Marker: commercialTransaction.status ===
  // 'COMMITTED' means the charge already succeeded on a prior attempt — do
  // NOT call chargeMandateFn again. This is the entire point of this slice.
  if (commercialTransaction.status !== 'COMMITTED') {
    // R11 mandate-capacity guard (previously missing — CAW_BILLING_DESIGN.md
    // §10 documents "a charge never exceeds mandateMaxAmount" as a hard
    // failure, but no code actually compared invoice.total to it before this
    // call reached Razorpay). Checked here, before chargeMandateFn, so an
    // over-cap renewal never becomes a live API call at all — same
    // clean-failure shape (PAST_DUE, non-terminal transaction) as a charge
    // Razorpay itself declines, just detected one step earlier.
    if (
      subscription.billingMode !== 'manual' &&
      typeof subscription.mandateMaxAmount === 'number' &&
      billingInvoice.total > subscription.mandateMaxAmount
    ) {
      setAppStatus(subscription, 'past_due', 'Renewal amount exceeds mandate capacity');
      await subscription.save();
      return {
        outcome: 'PAST_DUE',
        reason: 'MANDATE_CAPACITY_EXCEEDED',
        invoice: billingInvoice._id,
        transaction: commercialTransaction._id,
      };
    }

    // R11/R12 — charge the mandate. Injected so this slice's tests don't
    // touch real Razorpay; the real charge call is whichever session wires
    // actual Charge-at-Will invocation (already-proven pattern per R11's own
    // explicit non-goal — not redesigned here).
    let chargeResult;
    try {
      chargeResult = await chargeMandateFn({
        subscription,
        amount: billingInvoice.total,
      });
    } catch (chargeErr) {
      // R7's "Unknown -> Reconciliation Queue" branch. Structured return
      // (Phase 4B Slice 3), not a throw — nothing is marked past_due here,
      // deliberately: an ambiguous charge result must not be assumed failed
      // (that risks the exact double-charge/wrongful-suspension this whole
      // design phase exists to prevent). The BillingInvoice/CommercialTransaction
      // are left exactly as they were (still PENDING_PAYMENT/PRICED) — real
      // reconciliation logic (querying Razorpay to find out what actually
      // happened) is still not built; only the throw-vs-return shape changed.
      // R8: any reward reservation for this attempt (rewardUsageId) is
      // deliberately left 'reserved', not released — same reasoning as
      // BillingInvoice/CommercialTransaction being left untouched: a resumed
      // attempt must find and reuse it, not lose it to an unrelated
      // concurrent reservation.
      return { outcome: 'RECONCILIATION_NEEDED', reason: 'AMBIGUOUS_CHARGE_RESULT', error: chargeErr?.message };
    }

    if (chargeResult?.pending) {
      // Manual billing: a payment link went out instead of a charge. Nothing
      // is paid yet, so the invoice/transaction stay PENDING_PAYMENT/PRICED
      // and appStatus is untouched — the grace job (manualRenewal.js) owns
      // what happens if it stays unpaid. Paying it re-enters this function,
      // which resumes this same transaction instead of repricing.
      return {
        outcome: 'AWAITING_PAYMENT',
        invoice: billingInvoice._id,
        transaction: commercialTransaction._id,
      };
    }

    if (!chargeResult?.success) {
      // R12's real failure/past_due branch — Phase 4B Slice 3. The mandate
      // charge failed cleanly (chargeMandateFn resolved, success:false) —
      // this is the one real business outcome this slice implements.
      // BillingInvoice/CommercialTransaction are left exactly as they are
      // (still PENDING_PAYMENT/PRICED) — not marked FAILED/VOID here,
      // deliberately: per Step 7 of the Phase 4C design, a Retry Engine
      // calling renewSubscription() again must find this same non-terminal
      // transaction and resume, not discover a dead end. Only appStatus
      // moves, per R12's own text ("Failure -> past_due only... zero
      // commercial state touched"). R8: same treatment for rewardUsageId —
      // left 'reserved' for the retry to reuse, not released.
      //
      // Task 1 (Aug 2026): persist orderId onto the transaction target —
      // purely additive correlation info, not a status change, so it doesn't
      // violate the "leave the transaction non-terminal" invariant above. A
      // later async payment.failed webhook for this exact order (the bank
      // declining after Razorpay accepted the request synchronously) needs
      // this to find its way back to this subscription at all — before this
      // fix, no webhook path could ever match a CAW renewal charge by
      // order_id, so that failure mode went completely unhandled.
      if (chargeResult?.orderId) {
        commercialTransaction.target = { ...commercialTransaction.target, orderId: chargeResult.orderId };
        await commercialTransaction.save();
      }
      setAppStatus(subscription, 'past_due', 'Renewal charge failed');
      await subscription.save();
      return {
        outcome: 'PAST_DUE',
        reason: 'CHARGE_FAILED',
        invoice: billingInvoice._id,
        transaction: commercialTransaction._id,
      };
    }

    // Record charge success immediately, atomically, in its own write — this
    // is the durable marker every future retry checks before charging again.
    // Residual gap, stated precisely rather than overclaimed: if THIS exact
    // write fails (the charge succeeded but this save throws before
    // committing), there is still no durable record of the charge on a
    // retry — no application-level check can close that specific instant
    // without an independent confirmation channel (Razorpay's own webhook,
    // R7's reconciliation branch), which real charging + reconciliation would
    // provide and this slice's injected chargeMandateFn does not model. Every
    // failure window AFTER this write succeeds is fully covered below.
    commercialTransaction.status = 'COMMITTED';
    commercialTransaction.lastAttemptAt = new Date();
    commercialTransaction.target = {
      ...commercialTransaction.target,
      paymentId: chargeResult.paymentId,
      orderId: chargeResult.orderId,
    };
    await commercialTransaction.save();

    // R8 — consume the reserved reward now that the charge is confirmed
    // committed. Deliberately inline here, not in a webhook handler: unlike
    // an Order-based purchase, renewal's charge result is known synchronously
    // inside this function, so there's no separate confirmation step to hang
    // this off of — same reasoning BillingCycle/BillingInvoice are written
    // directly in this commit sequence rather than in a webhook. consumeReservation()
    // is already a status-guarded atomic update (verified safe against a
    // duplicate call in this project's reservation-lifecycle audit), so a
    // resumed renewal calling this again for the same rewardUsageId is safe
    // by construction — no extra guard needed at this call site.
    if (rewardUsageId) {
      try {
        await consumeReservation(rewardUsageId);
      } catch (rewardErr) {
        console.error(
          `Failed to consume referral reward usage at renewal — subscription=${subscription._id} rewardUsageId=${rewardUsageId}:`,
          rewardErr.message
        );
      }
    }

    if (_injectFailureAfter === 'CHARGE_COMMITTED') {
      throw new Error('TEST-INJECTED FAILURE after CHARGE_COMMITTED');
    }
  }

  // Step 5 — invoice marked paid? Marker: billingInvoice.status === 'PAID'.
  if (billingInvoice.status !== 'PAID') {
    billingInvoice.status = 'PAID';
    billingInvoice.paidAt = new Date();
    billingInvoice.razorpay = {
      ...billingInvoice.razorpay,
      paymentId: commercialTransaction.target.paymentId,
      orderId: commercialTransaction.target.orderId,
    };
    await billingInvoice.save();
    if (_injectFailureAfter === 'INVOICE_PAID') {
      throw new Error('TEST-INJECTED FAILURE after INVOICE_PAID');
    }
  }

  // Step 6 — Subscription already advanced for this specific renewal?
  // Marker: currentPeriodStart already equals the target period's start
  // (captured in commercialTransaction.target before charging, not
  // recomputed from Subscription's own mutable fields).
  if (subscription.currentPeriodStart?.getTime() !== newPeriodStart.getTime()) {
    subscription.currentPeriodStart = newPeriodStart;
    subscription.currentPeriodEnd = newPeriodEnd;
    subscription.nextBillingDate = newPeriodEnd;

    // P0 SYNCHRONIZATION FIX (found via live QA, same bug class as the
    // upgrade-commit fix): calculateInvoice() priced this renewal correctly
    // (coupon eligibility, referral reward, scheduled changes all folded
    // into `effective` before charging), but nothing ever wrote that result
    // back onto the canonical Subscription document — only the billing
    // PERIOD advanced above. planName/billingCycle/pricePerUser/activeAddons/
    // totalAmount all kept whatever they were BEFORE this renewal, silently
    // diverging from the invoice that was actually charged. Every screen
    // reading Subscription.totalAmount directly (dashboard, plan cards,
    // Manage Subscription) would show a stale number the instant a renewal
    // changed anything — a coupon losing eligibility, a scheduled downgrade,
    // an add-on change. Sourced from commercialTransaction.target.effectiveState
    // (captured at pricing time, see the CommercialTransaction.create() above)
    // rather than the local `effective` variable, so this also works on a
    // RESUMED renewal, which never recomputes `effective` this call.
    // Optional-chained: a CommercialTransaction PRICED before this fix
    // shipped won't have effectiveState — skipped, not crashed, exactly like
    // this project's other "predates this field" fields.
    if (commercialTransaction.target?.effectiveState) {
      const es = commercialTransaction.target.effectiveState;
      subscription.planName = es.planName;
      subscription.billingCycle = es.billingCycle;
      subscription.pricePerUser = es.pricePerUser;
      subscription.activeAddons = es.activeAddons;
      subscription.totalAmount = es.totalAmount;
    }

    await subscription.save();
    if (_injectFailureAfter === 'SUBSCRIPTION_ADVANCED') {
      throw new Error('TEST-INJECTED FAILURE after SUBSCRIPTION_ADVANCED');
    }
  }

  // Step 7 — BillingCycle already written? Marker: a BillingCycle exists for
  // this subscription+invoice pair. Schema needed no field additions,
  // confirmed by reading models/BillingCycle.js: subscription/periodStart/
  // periodEnd/invoice/status are exactly what's available and needed here.
  let billingCycle = await BillingCycle.findOne({
    subscription: subscription._id,
    invoice: billingInvoice._id,
  });
  if (!billingCycle) {
    billingCycle = await BillingCycle.create({
      subscription: subscription._id,
      periodStart: newPeriodStart,
      periodEnd: newPeriodEnd,
      invoice: billingInvoice._id,
      status: billingInvoice.status,
    });
  }

  // Step 8 — transaction completed? Marker: status === 'COMPLETED'.
  if (commercialTransaction.status !== 'COMPLETED') {
    commercialTransaction.status = 'COMPLETED';
    await commercialTransaction.save();
  }

  if (appliedScheduledChangeIds.length > 0) {
    // status: 'PENDING' guard, not just _id — if a record was concurrently
    // superseded/cancelled elsewhere between R3's read and this write, this
    // must not clobber that outcome back to EXECUTED.
    await ScheduledChange.updateMany(
      { _id: { $in: appliedScheduledChangeIds }, status: 'PENDING' },
      { $set: { status: 'EXECUTED' } }
    );
  }

  return { outcome: 'RENEWED', invoice: billingInvoice._id, billingCycle: billingCycle._id };
}

// Single source of truth for "one billing cycle from this date" — used both
// for renewal (computeNextPeriodEnd, below) and CAW activation (the initial
// currentPeriodStart -> currentPeriodEnd), so the two never drift apart.
function addBillingCycle(date, billingCycle) {
  const next = new Date(date);
  if (billingCycle === 'monthly') {
    next.setMonth(next.getMonth() + 1);
  } else {
    next.setFullYear(next.getFullYear() + 1);
  }
  return next;
}

function computeNextPeriodEnd(subscription) {
  return addBillingCycle(subscription.currentPeriodEnd, subscription.billingCycle);
}

function applyScheduledChange(effective, change) {
  switch (change.type) {
    case 'PLAN_CHANGE':
      effective.planName = change.payload.planId;
      effective.pricePerUser = change.payload.pricePerUser;
      // Replace activeAddons with the carry-forward decision actually made
      // when this downgrade was scheduled — NOT the current subscription's
      // present-day addons. Without this, a customer who reduced/dropped an
      // addon during the downgrade wizard would see it silently resurrected
      // in every "what happens at renewal" projection (Manage Subscription's
      // "Scheduled" card, Timeline, Billing's "Becomes" total), because
      // those all reuse buildEffectiveSubscription/applyScheduledChange,
      // which otherwise never touches activeAddons for a plan change at all.
      // Falls back to leaving activeAddons untouched only for legacy records
      // written before this field existed (payload.carriedAddons undefined).
      if (change.payload.carriedAddons) {
        effective.activeAddons = change.payload.carriedAddons;
      }
      break;
    case 'BILLING_CYCLE_CHANGE':
      // Current write sites never use PLAN_CHANGE to alter billingCycle, and
      // this branch is the one that owns billingCycle changes instead — that
      // split is an artifact of today's writers (isGenuineDowngrade branches
      // PLAN_CHANGE vs BILLING_CYCLE_CHANGE, never both), not an inherent
      // property of either type. If a future writer changes that, this
      // handler must be revisited, not assumed still correct.
      effective.billingCycle = change.payload.billingCycle;
      effective.pricePerUser = change.payload.pricePerUser;
      break;
    case 'REMOVE_ADDON': {
      // Phase 2c: match (addonKey, billingCycle), not addonKey alone — a
      // monthly removal must never touch an annual instance of the same key
      // and vice versa.
      const idx = effective.activeAddons.findIndex(
        a => addonIdentityKey(a, effective.billingCycle) === addonIdentityKey(change.payload, effective.billingCycle)
      );
      if (idx === -1) break;
      const remaining = effective.activeAddons[idx].quantity - change.payload.quantity;
      if (remaining <= 0) effective.activeAddons.splice(idx, 1);
      else effective.activeAddons[idx] = { ...effective.activeAddons[idx], quantity: remaining };
      break;
    }
    case 'REDUCE_QUANTITY':
      // No writer exists anywhere in the codebase (confirmed by grep, per
      // IMPLEMENTATION_PLAN_V1.md Phase 4 design session). Shape is unverified
      // against real data — throw loudly rather than guess.
      throw new Error(`REDUCE_QUANTITY ScheduledChange encountered with no verified handling — id=${change._id}`);
    default:
      throw new Error(`Unhandled ScheduledChange type in renewal: ${change.type}`);
  }
  return effective;
}

// buildEffectiveSubscription() never mutates the Subscription document or any
// ScheduledChange document — it only builds a transient in-memory pricing
// model. Persisting anything (advancing the subscription, marking records
// EXECUTED) happens later, only after a successful charge — see Step 6/Step 9
// in renewSubscription() below.
async function buildEffectiveSubscription(subscription, now) {
  const effective = {
    planName: subscription.planName,
    billingCycle: subscription.billingCycle,
    pricePerUser: subscription.pricePerUser,
    // .toObject(), not object-spread — subscription.activeAddons entries are
    // real Mongoose subdocuments whose schema-path fields (quantity,
    // pricePerUnit, ...) are not reliably captured by `{...a}`; spreading
    // silently produced undefined fields that turned into NaN pricing.
    activeAddons: (subscription.activeAddons || []).map(a => (typeof a.toObject === 'function' ? a.toObject() : { ...a })),
  };

  const due = await ScheduledChange.find({
    organization: subscription.organization,
    subscription: subscription._id,
    status: 'PENDING',
    effectiveAt: { $lte: now },
  });

  const cancellation = due.find(c => c.type === 'CANCELLATION');
  const applied = due.filter(c => c.type !== 'CANCELLATION');

  // Ordering is arithmetically inert given current handler scope — PLAN_CHANGE/
  // BILLING_CYCLE_CHANGE touch only planName/billingCycle/pricePerUser;
  // REMOVE_ADDON/REDUCE_QUANTITY touch only activeAddons. Sorted by
  // effectiveAt only for deterministic replay, not because order changes the
  // result. If BILLING_DOMAIN_SPECIFICATION.md Chapter 16 specifies an
  // explicit order for audit-log reasons, this comparator must be updated
  // to match — not assumed equivalent just because today's math is order-independent.
  applied.sort((a, b) => a.effectiveAt - b.effectiveAt);

  for (const change of applied) applyScheduledChange(effective, change);

  return { effective, appliedIds: applied.map(c => c._id), cancellation };
}

// Exported so preview/read paths (getScheduledChanges, scheduling-event
// emission) can compute "what will this subscription look like once every
// currently-PENDING ScheduledChange executes" using the EXACT same logic
// the Renewal Engine itself will use — never a second, hand-rolled
// approximation. buildEffectiveSubscription's own `now` gating (only
// `effectiveAt <= now`) is still the caller's to control: pass an actual
// current time to ask "what's due today" (renewal's own use), or a
// sufficiently-far-future time to ask "what will this become once
// everything currently scheduled has executed" (preview's use).
// BILLING_UX_SPEC.md §2.2 — "what would the next renewal actually charge,
// right now." Read-only twin of renewSubscription()'s own pricing steps
// (buildEffectiveSubscription -> R7 coupon eligibility -> R8 referral
// modifier -> calculateInvoice()) — same functions, same order, but uses
// getNextAvailableReward (a plain read) instead of
// reserveNextAvailableReward, and creates no BillingInvoice/
// CommercialTransaction/RewardUsage. Never called from renewSubscription()
// itself or any webhook — this exists purely for the billing dashboard's
// "Next Renewal" preview (§2.2) to show a real engine-computed number
// instead of a client-side guess, per §0.
async function previewRenewal(subscription) {
  const farFuture = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000);
  const { effective } = await buildEffectiveSubscription(subscription, farFuture);

  // Same fix as renewSubscription()'s R7 step above, same reasoning — this
  // preview must price the actual effective (post-scheduled-change) line
  // items through fullRulesSnapshot, not reuse a flat frozen discountAmount
  // that ignores what's actually being renewed.
  const resolvedModifiers = [];
  if (subscription.appliedCoupon?.fullRulesSnapshot && isCouponStillEligibleForRenewal(subscription.appliedCoupon)) {
    const effectiveLineItems = [
      { key: effective.planName, type: 'plan', amount: effective.pricePerUser },
      ...effective.activeAddons.map((a) => ({ key: a.addonKey, type: 'addon', amount: a.quantity * a.pricePerUnit })),
    ];
    const couponModifier = buildCouponModifierForLineItems(subscription.appliedCoupon.fullRulesSnapshot, effectiveLineItems);
    if (couponModifier) resolvedModifiers.push(couponModifier);
  }

  const availableReward = await getNextAvailableReward(subscription.organization);
  if (availableReward) {
    resolvedModifiers.push(rewardToModifier(availableReward));
  }

  const invoice = calculateInvoice({ subscription: effective, resolvedModifiers });

  return toPricingBreakdown(invoice, {
    couponCode: subscription.appliedCoupon?.code,
    referralPercent: availableReward?.rewardType === 'percentage' ? availableReward.rewardValue : undefined,
  });
}

module.exports = { renewSubscription, buildEffectiveSubscription, applyScheduledChange, addBillingCycle, previewRenewal };
