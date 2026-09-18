// models/Subscription.js
const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    // NOT unique here — see the partial index below (BUG-002). A hard unique
    // index on organization would make it impossible for an org to ever hold
    // a second Subscription record after a prior one is cancelled/expired,
    // which Chapter 12 of the domain spec explicitly allows (many historical,
    // at most one current).
  },
  // ============================================================
  // @deprecated LEGACY (Subscriptions product) — slated for removal in Phase 8.
  // Under Charge-at-Will there is no Razorpay Subscription or Plan object; the
  // durable payment identity is `razorpayCustomerId` + `mandateTokenId` (below).
  // These are kept for now because the legacy subscription/renewal/upgrade code
  // paths still read and write them (~54 sites in subscriptionController.js, plus
  // addonManagement.js / subscriptionCheck.js / RazorpayPriceCache). Deleting them
  // here would either break those business-logic paths or silently feed `undefined`
  // into live razorpay.subscriptions.* calls — that removal is Phase 8's job, once
  // the CAW flows have replaced those call sites.
  // `required: true` removed from razorpayPlanId per CAW_BILLING_DESIGN.md §2 so
  // new CAW-onboarded subscriptions are not forced to carry a legacy plan id.
  // ============================================================
  razorpaySubscriptionId: { type: String }, // @deprecated — remove in Phase 8
  razorpayPlanId: { type: String }, // @deprecated — remove in Phase 8 (was required:true)

  // ============================================================
  // CHARGE-AT-WILL mandate (Phase 1 — schema only).
  // Populated by later phases: razorpayCustomerId/mandateTokenId/mandateStatus by
  // the Registration Link onboarding (Phase 2) and the token.confirmed webhook
  // (Phase 3); mandateMaxAmount/mandateExpiresAt from the confirmed token.
  // See CAW_BILLING_DESIGN.md §2. No business logic reads these yet.
  // ============================================================
  razorpayCustomerId: { type: String }, // cust_… (the mandate's customer)
  mandateTokenId: { type: String }, // token_… the reusable authorization CAW charges against
  // Added in Phase 2 (onboarding) — needed to correlate the incoming
  // token.confirmed/payment.captured webhooks back to the subscription that
  // requested them, since the Registration Link's invoice/order ids aren't
  // known until after creation. inv_… id.
  registrationLinkId: { type: String },
  // Every registration link this subscription has ever had, newest last. Only the CURRENT link id
  // is kept above, so a payment made against an attempt that was then superseded (customer pays,
  // closes the tab, hits Resume - which mints a new link) became unfindable by id: the webhook
  // handler has an organization_id fallback, but a pull-based reconcile had nothing to look up.
  priorRegistrationLinkIds: [{ type: String }],
  mandateStatus: {
    type: String,
    enum: ['none', 'pending', 'confirmed', 'paused', 'cancelled', 'rejected'],
    default: 'none',
  },
  mandateMaxAmount: { type: Number }, // cap in the same unit as totalAmount; charges above it hard-fail
  mandateExpiresAt: { type: Date },
  // Phase 1 of annual-billing groundwork (docs/audit/ANNUAL_BILLING_SCOPE.md).
  // Set exactly once, at first successful payment (runFirstPaymentSettlement),
  // and never again. Plain `immutable: true` was tried first and rejected by
  // fixture verification: Mongoose's default immutable behavior blocks writes
  // to the path on any document where `isNew` is false — which is every real
  // subscription by the time first payment settles (it was already persisted
  // at creation with billingAnchor defaulted to null) — so the FIRST real
  // write would have been silently discarded, not just later overwrites. The
  // function form below is immutable only once the value is actually
  // non-null, which allows the one real write and still blocks any write
  // after that. Nothing reads this field yet; it exists purely so future
  // cycle-change/renewal logic has a fixed temporal reference point that
  // isn't `nextBillingDate` (overwritten every renewal — see
  // renewalEngine.js's period-rollover step).
  billingAnchor: {
    type: Date,
    default: null,
    immutable: function () {
      return this.billingAnchor != null;
    },
  },
  // B2 fix (found via live QA): nothing previously recorded WHEN a
  // Registration Link/mandate attempt actually began — registrationLinkId
  // has no companion timestamp, and mandateExpiresAt is only populated
  // reactively by a later webhook telling us it expired, so it can't answer
  // "is this pending mandate recent or stale" at page-load time. Set
  // alongside registrationLinkId/mandateStatus='pending' at both CAW
  // Registration Link creation sites (createSubscription, updateSubscription's
  // trial-conversion/re-entry branch) and on any Resume Payment re-entry.
  // Used only for copy nuance (recent vs. stale pending-setup wording) —
  // deliberately never used to decide whether to show the full-screen
  // active-checkout-journey UI, which must stay tied to an actual
  // current-session action (checkoutJourneyState), not a timestamp.
  mandateInitiatedAt: { type: Date },
  // Set only if the organization's OWN already-earned referral Reward (as a
  // referrer) was reserved against this first CAW invoice — createSubscription
  // (fresh signup, never trialed) and updateSubscription's trial-conversion
  // branch (the common case — see comment there) both write this. Consumed
  // by runFirstPaymentSettlement / released on payment.failed, same
  // reserve-then-settle pattern as pendingPlanChange.referralRewardUsageId.
  pendingReferralRewardUsageId: { type: mongoose.Schema.Types.ObjectId, ref: 'RewardUsage' },
  // TODO(Phase 7): `appStatus` will gain a `retrying` state and reconcile with the
  // mandate state machine in CAW_BILLING_DESIGN.md §7. Not changed here — that is
  // the retry engine's phase, not the schema phase.

  planName: {
    type: String, 
    enum: ['starter', 'growth', 'business','test'], 
    required: true 
  },
  status: { 
    type: String, 
    enum: ['created', 'authenticated', 'active', 'paused', 'halted', 'cancelled', 'completed', 'expired'], 
    default: 'created' 
  },

  // ============================================================
  // NEW: app-level status, separate from Razorpay's raw `status` above.
  // This is the field subscriptionGate.js and all access-control logic
  // should read — not `status`, which is just a passthrough of whatever
  // vocabulary Razorpay happens to use.
  // ============================================================
  appStatus: {
    type: String,
    enum: ['trial', 'active', 'past_due', 'cancelled', 'expired', 'suspended'],
    default: 'trial',
  },
  appStatusHistory: [
    {
      from: String,
      to: String,
      reason: String,
      at: Date,
    },
  ],

  billingCycle: { 
    type: String, 
    enum: ['monthly', 'yearly'], 
    required: true 
  },
  pricePerUser: { type: Number, required: true },
  userCount: { type: Number, required: true, min: 1 },
  totalAmount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  currentPeriodStart: { type: Date },
  currentPeriodEnd: { type: Date },
  nextBillingDate: { type: Date },
  trialStart: { type: Date },
  trialEnd: { type: Date },
  isTrialActive: { type: Boolean, default: false },
  trialUsed: { type: Boolean, default: false },
  trialReminder48hSent: { type: Boolean, default: false },
  trialReminder24hSent: { type: Boolean, default: false },
  cancelAtPeriodEnd: { type: Boolean, default: false },
  cancelledAt: { type: Date },
  metadata: { type: mongoose.Schema.Types.Mixed },
  activeAddons: [
    {
      addonKey: { type: String, required: true },
      quantity: { type: Number, required: true, default: 1 },
      pricePerUnit: { type: Number, required: true },
      addedAt: { type: Date, default: Date.now },
      // Phase 2a (docs/audit/PHASE2_ADDON_CYCLE_TRACE.md) — data model only.
      // Not read or enforced by ANY lookup/merge/pricing code yet (Phase
      // 2b/2c). Not required at the schema level: Phase 2a.2's backfill
      // script populates it on existing documents outside of Mongoose's
      // per-write validation, and no write path sets it yet either — making
      // it required here would break every existing addon-purchase/upgrade/
      // downgrade write today. Becomes load-bearing only once 2b/2c land.
      billingCycle: { type: String, enum: ['monthly', 'yearly'] },
      // Phase 2c. Only ever set for billingCycle:'yearly' entries — its own
      // purchase-anchored 1-year window (addedAt + 1 year), per the confirmed
      // business contract: an annual add-on's period is independent of the
      // base subscription's anchor.
      periodEnd: { type: Date, default: null },
      // Task 1 (Aug 2026) — Option A, decided over the simpler "charge the
      // full annual-equivalent up front" alternative: a monthly-cadence
      // add-on must actually be charged every month, on its own independent
      // cadence, even while sitting on an annual base plan — the earlier
      // "monthly entries just ride the base subscription's own renewal"
      // assumption (this comment used to say so) was a real undercharging
      // bug once cross-cycle transitions made base.billingCycle !==
      // addon.billingCycle possible. See utils/addonRenewalEngine.js for the
      // independent renewal engine that reads these two fields — only set
      // (and only meaningful) for a billingCycle:'monthly' addon sitting on
      // a subscription whose OWN billingCycle is 'yearly'; left null
      // whenever the addon's cycle already matches the subscription's own
      // (it naturally rides the base renewal in that case — no double-charge
      // risk, no independent engine involvement needed).
      nextRenewalAt: { type: Date, default: null },
      lastRenewalAt: { type: Date, default: null },
    },
  ],
  // Coupon applied at initial checkout — a full SNAPSHOT of what the customer
  // agreed to pay, not just a code + one number. The recurring amount this
  // produced is separately baked into a fixed-price Razorpay Plan (see
  // findOrCreateRazorpayPlan), so renewals never re-run the discount engine —
  // this snapshot exists purely so the org can see what's applied and why,
  // without it ever silently drifting if the coupon is edited/deleted later.
  // Redemption (usage-limit consumption + analytics) is recorded separately
  // once payment is actually captured — see utils/discountEngine.recordRedemption.
  appliedCoupon: {
    couponId: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon' },
    code: String,
    name: String,
    // Copied from the Coupon at the moment it was applied — support/renewal
    // logic should read THIS, never the live Coupon.duration, so an admin
    // editing the coupon's duration later can't retroactively change what an
    // existing subscriber agreed to.
    duration: {
      type: { type: String, enum: ['lifetime', 'first_payment', 'fixed_cycles', 'until_date', 'until_cancelled'] },
      cycles: Number,
    },
    discountAmount: Number,
    baseSubtotal: Number, // plan + add-ons, before this coupon's discount
    recurringSubtotal: Number, // baseSubtotal - discountAmount — what recurs each cycle
    rulesApplied: [
      {
        productType: String, // 'plan' | 'addon'
        productKey: String,
        discountType: String, // 'percentage' | 'fixed'
        discountValue: Number,
        discountAmount: Number,
      },
    ],
    // The coupon's COMPLETE rule set at the moment it was applied — every
    // rule, matched or not, not just the ones that priced the signup order
    // (that's rulesApplied above, filtered to discount>0 — left untouched,
    // still used for display/redemption history). Needed so a LATER
    // commercial action (upgrade, add-on purchase) can ask "does this coupon
    // cover this item" without ever reading the live Coupon document — same
    // snapshot-immutability principle as `duration` above: an admin editing
    // the coupon's rules later must not retroactively change what an
    // existing subscriber locked in.
    fullRulesSnapshot: [
      {
        productType: String, // 'plan' | 'addon'
        productKey: String,
        discountType: String, // 'percentage' | 'fixed'
        discountValue: Number,
      },
    ],
    redeemed: { type: Boolean, default: false },
  },
  pendingUpdate: {
    planName: String,
    pricePerUser: Number,
    userCount: Number,
    totalAmount: Number,
    billingCycle: String,
    scheduledAt: Date,
    // Frozen snapshot of add-ons carrying into the scheduled plan, taken at the
    // moment the change was scheduled. Later add-on purchases on the active
    // subscription do not retroactively modify this list.
    carriedAddons: [
      {
        addonKey: String,
        quantity: Number,
        pricePerUnit: Number,
        billingCycle: String, // Phase 2a — data model only, see activeAddons comment
      },
    ],
    // Frozen snapshot of add-ons dropped by this plan change (incompatible with
    // the target plan), same reasoning as carriedAddons above.
    removedAddons: [
      {
        addonKey: String,
        quantity: Number,
        pricePerUnit: Number,
        billingCycle: String, // Phase 2a — data model only, see activeAddons comment
      },
    ],
    // How much THIS downgrade added to pendingAddonRemovals (a delta, not a
    // total) — cancelScheduledDowngrade subtracts this back out. See the
    // write site (subscriptionController.js updateSubscription) for why a
    // delta, not a resulting total, is the only safe thing to reverse.
    reducedAddonDeltas: [
      {
        addonKey: String,
        quantity: Number,
        billingCycle: String, // Phase 2a — data model only, see activeAddons comment
      },
    ],
  },
  pendingUpgrade: {  // New field for temporary upgrade state
    planName: String,
    pricePerUser: Number,
    userCount: Number,
    totalAmount: Number,
    billingCycle: String,
    prorationAmount: Number,
    orderId: String,  // Razorpay order ID for the proration payment
    createdAt: Date,
    activeAddons: [  // Compatible add-ons to carry forward on upgrade completion
      {
        addonKey: String,
        quantity: Number,
        pricePerUnit: Number,
        addedAt: Date,
        billingCycle: String, // Phase 2a — data model only, see Subscription.activeAddons comment
      }
    ],
    droppedAddons: [  // Incompatible add-ons that will be dropped on upgrade
      {
        addonKey: String,
        displayName: String,
        quantity: Number,
        pricePerUnit: Number,
        reason: String,
        billingCycle: String, // Phase 2a — data model only, see Subscription.activeAddons comment
      }
    ],
  },
  pendingAddonAddition: {
    addonKey: { type: String },
    quantity: { type: Number },
    pricePerUnit: { type: Number },
    prorationAmount: { type: Number },
    orderId: { type: String },
    createdAt: { type: Date },
    billingCycle: { type: String }, // Phase 2a — data model only, see Subscription.activeAddons comment
    // Set only if a referral reward was reserved against this order's
    // proration amount — settlement uses this to consume/release the
    // RewardUsage. See backend/docs/REFERRAL_SYSTEM_DESIGN.md §9.
    referralRewardUsageId: { type: mongoose.Schema.Types.ObjectId, ref: 'RewardUsage' },
  },
  // Phase 3 (docs/audit/PHASE3_MONTHLY_TO_ANNUAL_PRORATION.md) — Monthly to
  // Annual base-plan cadence transition, same one-time-Razorpay-Order shape
  // as pendingAddonAddition above (not a CAW mandate charge). `amount` is
  // locked at initiation (what the customer agreed to pay); `windowStart`/
  // `windowEnd` are the QUOTED entitlement window, recorded ONLY so the
  // commit handler can detect a boundary crossing between initiation and
  // settlement (compare against a freshly recomputed window at commit —
  // never write these stored values directly as the new currentPeriodStart/
  // currentPeriodEnd, that was the original stale-window design flaw this
  // field's shape was corrected to avoid).
  pendingCycleTransition: {
    targetBillingCycle: { type: String }, // always 'yearly' today — Annual->Monthly is scheduled, not this flow
    // Cross-tier support: the target plan may differ from subscription.planName
    // (e.g. Business-monthly -> Starter-annual). Defaults to the subscription's
    // own current plan when the caller doesn't specify one (same-tier cycle
    // change), so this field is always populated at commit time regardless.
    targetPlanId: { type: String },
    targetPricePerUser: { type: Number },
    amount: { type: Number }, // base plan amount ONLY — addon conversion amounts below are itemized separately, never folded in
    windowStart: { type: Date },
    windowEnd: { type: Date },
    orderId: { type: String },
    createdAt: { type: Date },
    // Task 2 (Aug 2026): explicit per-add-on choice at transition checkout —
    // 'monthly' (default, no-op — the add-on's billingCycle/pricePerUnit are
    // never touched, per the standing rule that a monthly add-on's cadence
    // never changes automatically) or 'yearly' (a real, itemized, separately-
    // prorated conversion, reusing the exact same addon_purchase proration
    // math already used for a fresh annual add-on purchase — see
    // cycleTransitionLifecycle.js's computeAddonConversionPricing).
    addonConversions: [
      {
        addonKey: { type: String },
        quantity: { type: Number },
        fromPricePerUnit: { type: Number },
        toPricePerUnit: { type: Number },
        amount: { type: Number }, // this addon's own itemized charge, summed into the Order total but tracked separately
      },
    ],
    // Existing add-ons the TARGET plan doesn't support at all — informational
    // only, no choice offered. Access continues on the current monthly term;
    // scheduled for removal at that term's own natural end (never forced
    // early), mirroring the existing plan-downgrade incompatible-addon
    // pattern (updateSubscription's downgrade branch).
    incompatibleAddons: [
      {
        addonKey: { type: String },
        quantity: { type: Number },
        pricePerUnit: { type: Number },
        effectiveAt: { type: Date },
      },
    ],
  },
  // Task 3 (Aug 2026): resuming a LAPSED subscription (appStatus:'cancelled'
  // after the scheduled cancellation's period actually ended) — same
  // Order-based, webhook-committed shape as pendingCycleTransition above.
  // billingAnchor is NEVER written here or at commit — the entire point of
  // this flow (per the amended BILLING_DOMAIN_SPECIFICATION.md policy) is
  // that reactivation reuses the SAME Subscription document and its
  // original, immutable anchor, not a fresh one.
  pendingReactivation: {
    targetPlanId: { type: String },
    targetBillingCycle: { type: String },
    targetPricePerUser: { type: Number },
    amount: { type: Number },
    windowStart: { type: Date }, // only meaningful for yearly — quoted at initiation, re-verified at commit
    windowEnd: { type: Date },
    orderId: { type: String },
    createdAt: { type: Date },
  },
  pendingPlanChange: {
    newPlanName: { type: String },
    newBasePrice: { type: Number },
    proratedDiffCharged: { type: Number },
    orderId: { type: String },
    needsRazorpaySync: { type: Boolean },
    compatibleAddons: [
      {
        addonKey: String,
        quantity: Number,
        pricePerUnit: Number,
        remappedFrom: String,
        billingCycle: String, // Phase 2a — data model only, see Subscription.activeAddons comment
        periodEnd: Date, // Live-QA fix (Aug 2026) — an annual add-on's own term end must survive an upgrade/downgrade too
      },
    ],
    // User-reduced carry-forward quantities from the editable carry-forward
    // checkout step — settlement schedules a REMOVE_ADDON for each at commit
    // time. quantity here is the AMOUNT REDUCED (i.e. to remove), not the
    // resulting carried quantity.
    reducedAddons: [
      {
        addonKey: String,
        displayName: String,
        quantity: Number,
        pricePerUnit: Number,
        remappedFrom: String,
        billingCycle: String, // Phase 2a — data model only, see Subscription.activeAddons comment
      },
    ],
    incompatibleAddons: [
      {
        addonKey: String,
        displayName: String,
        quantity: Number,
        pricePerUnit: Number,
        remappedFrom: String,
        billingCycle: String, // Phase 2a — data model only, see Subscription.activeAddons comment
      },
    ],
    newAddonPurchases: [
      {
        addonKey: String,
        quantity: Number,
        pricePerUnit: Number,
        billingCycle: String, // Phase 2a — data model only, see Subscription.activeAddons comment
      },
    ],
    createdAt: { type: Date },
    // Set only if a referral reward was reserved against this upgrade's
    // prorated order — settlement uses this to consume/release the
    // RewardUsage. Same pattern as pendingAddonAddition.referralRewardUsageId.
    // See backend/docs/REFERRAL_SYSTEM_DESIGN.md §9.
    referralRewardUsageId: { type: mongoose.Schema.Types.ObjectId, ref: 'RewardUsage' },
  },
  pendingAddonRemovals: [
    {
      addonKey: { type: String, required: true },
      displayName: { type: String },
      quantity: { type: Number, required: true },
      pricePerUnit: { type: Number, required: true },
      scheduledAt: { type: Date, default: Date.now },
      effectiveAt: { type: Date },
      billingCycle: { type: String }, // Phase 2a — data model only, see Subscription.activeAddons comment
    },
  ],
  paymentStatus: {
    type: String,
    enum: ['pending_payment', 'payment_completed', 'payment_failed', 'payment_cancelled'],
    default: 'pending_payment'
  },
  
  // Track actual subscription activation
  isPaymentConfirmed: {
    type: Boolean,
    default: false
  },
  
  // Store payment details for tracking
  lastPaymentAttempt: {
    razorpayPaymentId: String,
    amount: Number,
    attemptedAt: { type: Date, default: Date.now },
    status: String
  },

  // One-shot dashboard notice for super-admin-initiated changes (trial
  // adjusted/ended, subscription cancelled on the org's behalf). Cleared
  // the first time getCurrentSubscription returns it, so it shows exactly
  // once — not a persistent notification log.
  adminNotice: {
    message: String,
    createdAt: Date,
  },
}, { timestamps: true });

// BUG-002 fix: at most one "current" Subscription per organization, while
// still allowing unlimited historical (cancelled/expired/suspended) ones.
//
// `suspended` is deliberately EXCLUDED from this filter, even though it is
// not terminal in Chapter 2's general state machine. Per Chapter 12's
// resolution (BILLING_DOMAIN_SPECIFICATION.md — "trial may be started again"
// tension, resolved during this BUG-002 work): the Registration Engine must
// transition any SUSPENDED subscription to CANCELLED *before* creating a new
// one for the same organization, so a SUSPENDED row is never actually
// current at the moment a second Subscription would be inserted. That
// precondition transition is NOT YET WIRED into startFreeTrial/registration
// (tracked in IMPLEMENTATION_PLAN_V1.md §1.1) — until it is, this index will
// correctly REJECT a new Subscription for an org that still has a
// not-yet-cancelled SUSPENDED one on file, surfacing the gap loudly rather
// than silently allowing two current records.
subscriptionSchema.index(
  { organization: 1 },
  {
    unique: true,
    partialFilterExpression: {
      appStatus: { $in: ['trial', 'active', 'past_due'] },
    },
  }
);

module.exports = mongoose.model('Subscription', subscriptionSchema);