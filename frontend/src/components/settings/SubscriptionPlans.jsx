import CalendarIcon from "../common/CalendarIcon";
// components/settings/SubscriptionPlans.jsx
import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Gift, Building2, Crown, CheckCircle, AlertCircle, X, Users, ShieldCheck, RotateCcw, ReceiptText } from "lucide-react";
import StarIcon from "../common/StarIcon";
import { useSubscription } from "../../contexts/SubscriptionContext";
import PlanCard from "../subscription/PlanCard";
import CurrentSubscriptionInfo from "../subscription/CurrentSubscriptionInfo";
import BillingCalendarModal from "../subscription/BillingCalendarModal";
import TrialModal from "../subscription/TrialModal";
import BillingProfileModal from "../subscription/BillingProfileModal";
import CheckoutSummaryModal from "../subscription/CheckoutSummaryModal";
import FeatureComparisonTable from "../subscription/FeatureComparisonTable";
import FAQ from "../subscription/FAQ";
import useRazorpay from "../../hooks/useRazorpay";
import PaymentStatusAlert from "../subscription/PaymentStatusAlert";
import { subscriptionAPI } from "../../services/subscriptionApi";
import SuccessConfetti from "../subscription/SuccessConfetti";
import { hasValidPendingUpdate, deriveSubscriptionUIState, SUBSCRIPTION_UI_STATES, resolveBaseCardAction } from "../../utils/subscriptionHelpers";
import { formatPrice } from "../../utils/pricingSnapshot";
import { waitForSettlement } from "../../utils/waitForSettlement";
import { Tag, CheckCircle2 } from "lucide-react";
import CheckoutJourneyScreen from "../subscription/CheckoutJourneyScreen";
import PaymentMethodModal from "../subscription/PaymentMethodModal";
import { isCouponStillRecurring } from "../../utils/couponHelpers";

// Icon map — keyed by planId
const PLAN_ICONS = {
  trial:    <Gift className="w-6 h-6" />,
  starter:  <Building2 className="w-6 h-6" />,
  growth:   <StarIcon className="w-6 h-6" />,
  business: <Crown className="w-6 h-6" />,
};

const PLAN_COLORS = {
  trial:    "green",
  starter:  "blue",
  growth:   "purple",
  business: "amber",
};

const PLAN_TAGLINES = {
  trial:    "7 Days Free — All Growth Features",
  starter:  "Perfect for small teams",
  growth:   "Best for growing businesses",
  business: "For established businesses",
};

const PLAN_POPULAR = {
  growth: true,
};

const SubscriptionPlans = () => {
  const [currentUser, setCurrentUser] = useState(() => JSON.parse(localStorage.getItem("user") || "{}"));
  const isAdmin = currentUser?.role === "admin";
  const [showBillingProfileModal, setShowBillingProfileModal] = useState(false);
  const [showBillingCalendar, setShowBillingCalendar] = useState(false);

  const [billingCycle, setBillingCycle] = useState("monthly");
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState("");
  const [showTrialModal, setShowTrialModal] = useState(false);
  const { razorpayLoaded, openCheckout } = useRazorpay();
  const [paymentInProgress, setPaymentInProgress] = useState(false);
  const [checkoutJourneyState, setCheckoutJourneyState] = useState(null);
  const pollCancelledRef = useRef(false);
  useEffect(() => {
    return () => { pollCancelledRef.current = true; };
  }, []);

  // Add-on state
  const [planAddons, setPlanAddons] = useState({}); // { [planId]: addon[] }
  const [expandedPlan, setExpandedPlan] = useState(null); // planId of expanded card
  // Live-QA architecture fix (Aug 2026): this used to be a single flat
  // { [addonKey]: quantity } map shared by EVERY plan card — configuring
  // add-ons on Starter while browsing would silently show up on Growth's
  // card too, since both cards read/wrote the exact same object. Each plan
  // card's add-on configuration is its own independent thing (browsing
  // Starter's hypothetical add-ons must never touch Growth's), so this is
  // now keyed per plan: { [planId]: { [addonKey]: quantity } }.
  const [selectedAddons, setSelectedAddons] = useState({}); // { [planId]: { [addonKey]: quantity } }
  // Which cycle a NEW add-on purchase targets, independent of the page-level
  // billingCycle toggle — an annual base plan (or a plan being configured
  // while browsing Annual mode) can hold either cycle of add-on; Monthly
  // mode has no such choice (a monthly plan can only ever hold monthly
  // add-ons). Same per-plan-card independence as selectedAddons above — a
  // single global value here caused the exact same cross-card leak.
  const [addonPurchaseCycle, setAddonPurchaseCycle] = useState({}); // { [planId]: 'monthly' | 'yearly' }
  // Task 2: per-add-on choice at the Monthly->Annual transition checkout —
  // { [addonKey]: 'monthly' | 'yearly' }. Any add-on not present here
  // defaults to 'monthly' (keep, no-op) server-side — never silently
  // converted. Reset each time the transition confirmation is (re)opened.
  const [transitionAddonChoices, setTransitionAddonChoices] = useState({});
  const [checkoutData, setCheckoutData] = useState(null); // modal data, null = closed
  // A Registration Link shows only ONE autopay method on Razorpay's page
  // (omitting it showed Cards only), so the customer picks it in
  // PaymentMethodModal first. Holds which action resumes after the pick:
  // { kind: 'checkout' | 'resume' }, null = closed. The last pick is reused
  // when checkout re-runs after the billing-profile modal.
  const [methodPrompt, setMethodPrompt] = useState(null);
  const lastMandateMethodRef = useRef(null);

  // Coupon applied on this page (before checkout). Holds { code, name, rules }.
  // Discounts ripple onto every plan/add-on card via the coupon's per-product
  // rules, and carry into the checkout modal for its inline breakdown.
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  // A3 fix (found via live QA): applying a coupon here, then refreshing the
  // page, silently lost it — the customer had to re-type the code. This is a
  // not-yet-committed selection (nothing is charged until checkout), so
  // sessionStorage is the right lifetime: survives a refresh, clears on tab
  // close, and is cleared explicitly on removal or once checkout is actually
  // submitted (see removeCoupon/handleConfirmCheckout below).
  const PENDING_COUPON_STORAGE_KEY = 'pendingCheckoutCouponCode';
  const [couponInput, setCouponInput] = useState("");
  const [couponError, setCouponError] = useState("");
  const [validatingCoupon, setValidatingCoupon] = useState(false);

  // C1 — coupon replacement/removal on an already-paid subscription.
  // Separate state from the pre-checkout appliedCoupon/couponInput above —
  // this operates on subscription.subscription.appliedCoupon (a real,
  // already-paying subscriber's attached coupon), not a not-yet-committed
  // selection.
  const [showCouponReplaceInput, setShowCouponReplaceInput] = useState(false);
  const [replaceCouponInput, setReplaceCouponInput] = useState("");
  const [couponActionError, setCouponActionError] = useState("");
  const [couponActionLoading, setCouponActionLoading] = useState(false);
  // Backend-computed previews shown in a confirmation step before either
  // mutation commits — never a locally-computed guess at the new amount
  // (the explicit architectural requirement: backend remains the sole
  // pricing authority, previews call the same pricing code the real
  // mutation calls, just without persisting).
  const [couponRemovePreview, setCouponRemovePreview] = useState(null); // { recurringBefore, recurringAfter, willChangeRecurring }
  const [couponReplacePreview, setCouponReplacePreview] = useState(null); // { couponCode, couponName, recurringBefore, recurringAfter, recurringEligible }

  // Referral code — manual entry only. A code captured from a shared link
  // is already applied and cleared from localStorage during registration
  // (see Login.jsx/App.jsx) by the time an org reaches this page, so this
  // field is for someone who wasn't referred via link. Applies immediately
  // via its own Apply button (mirrors the coupon field), not folded into
  // Subscribe/Start Trial — the backend never uses it to discount THIS
  // purchase either way (see REFERRAL_SYSTEM_DESIGN.md §3/§24 and
  // PROJECT_STATE.md §11).
  const [referralCodeInput, setReferralCodeInput] = useState("");
  const [referralApplied, setReferralApplied] = useState(false);
  const [referredByName, setReferredByName] = useState(null);
  const [referralError, setReferralError] = useState("");
  const [applyingReferral, setApplyingReferral] = useState(false);

  // A referral recorded from a shared link happens at registration, so by the
  // time this page loads the Referral already exists in the DB — reflect that
  // real state instead of re-asking. If the org already has a referrer, show
  // "applied"; only orgs with no referrer see the manual-entry fallback box.
  useEffect(() => {
    let cancelled = false;
    subscriptionAPI.getReferralOverview()
      .then((res) => {
        if (cancelled) return;
        if (res.data?.referredBy) {
          setReferralApplied(true);
          setReferredByName(res.data.referredBy.referrerOrganization?.name || null);
        }
      })
      .catch(() => {}); // non-fatal — falls back to showing the manual entry box
    return () => { cancelled = true; };
  }, []);

  const {
    subscription,
    plans,
    plansLoaded,
    loading,
    error,
    startTrial,
    createSubscription,
    updateSubscription,
    fetchSubscription,
    effectiveRecurringTotal,
    scheduledChanges,
  } = useSubscription();
  const [showConfetti, setShowConfetti] = useState(false);
  // In-app replacement for window.confirm() when the customer closes the
  // Razorpay tab mid-mandate — holds the pending Promise's resolver so the
  // two modal buttons can settle it, since startMandatePolling needs to
  // await the customer's choice before deciding whether to retry.
  const [tabClosedPrompt, setTabClosedPrompt] = useState(null); // { resolve } | null
  const confirmRetryAfterTabClosed = () => new Promise((resolve) => setTabClosedPrompt({ resolve }));
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelFeedback, setCancelFeedback] = useState("");

  // Plan catalog comes from SubscriptionContext (fetchPlans) — one fetch
  // path, shared with everything else that needs the plan list, instead of
  // an independent copy fetched here too.

  // Build planStructure from API data, enriched with UI metadata
  const planStructure = plans.map((p) => ({
    ...p,
    icon: PLAN_ICONS[p.planId] || <Building2 className="w-6 h-6" />,
    tagline: PLAN_TAGLINES[p.planId] || "",
    color: PLAN_COLORS[p.planId] || "blue",
    popular: !!PLAN_POPULAR[p.planId],
    trial: p.planId === "trial",
    trialDays: 7,
  }));

  const handleCancelSubscription = async () => {
    setProcessing(true);
    try {
      const response = await subscriptionAPI.cancelSubscription({
        reason: cancelReason,
        feedback: cancelFeedback,
      });
      setMessage({
        type: "success",
        text:
          response.data.message ||
          "Subscription cancelled successfully. You can continue using the service until the end of your billing period.",
      });
      setShowCancelModal(false);
      setCancelReason("");
      setCancelFeedback("");
      await fetchSubscription();
    } catch (error) {
      setMessage({
        type: "error",
        text: error.response?.data?.error || "Failed to cancel subscription",
      });
    } finally {
      setProcessing(false);
    }
  };

  // Task 2 (Aug 2026): the gap found while auditing cancellation states —
  // Task B's reactivateAndProceed requires picking a DIFFERENT plan; this is
  // the "just undo it, same plan" path that had no button at all before.
  const handleUndoCancellation = async () => {
    setProcessing(true);
    try {
      const response = await subscriptionAPI.undoCancellation();
      setMessage({
        type: "success",
        text: response.data.message || "Cancellation undone. Your subscription remains active.",
      });
      await fetchSubscription();
    } catch (error) {
      setMessage({
        type: "error",
        text: error.response?.data?.error || "Failed to undo cancellation",
      });
    } finally {
      setProcessing(false);
    }
  };

  // Depend on the actual persisted cycle value, not the whole `subscription`
  // object — fetchSubscription() returns a brand-new object on every call,
  // including silent background refetches (page-visibility changes, the
  // mandate-settlement poll, etc.) that leave billingCycle unchanged. Keying
  // off the object reference re-ran this on every one of those, snapping the
  // toggle back to the server's stored cycle mid-browse (e.g. flipping to
  // Annual to compare pricing would silently revert to Monthly moments
  // later). Only fire when the real value changes — a genuine plan/cycle
  // update — not on every incidental refetch.
  useEffect(() => {
    if (subscription?.subscription) {
      setBillingCycle(subscription.subscription.billingCycle || "monthly");
    }
  }, [subscription?.subscription?.billingCycle]);

  // Two distinct gates, deliberately separated:
  //  - couponAppliesAtCheckout: the coupon is actually WIRED to discount the
  //    charge. Only the new-subscription flow (new signup / trial conversion)
  //    passes couponCode to the backend and gets a discounted Razorpay plan.
  //    Upgrade + add-on-purchase flows do NOT read a coupon yet, so we must
  //    not show discounted prices on those cards or we'd promise a discount
  //    the backend won't honour.
  //  - showCouponWidget: whether the apply/remove widget is visible at all.
  //    Paid subscribers can see + control an applied coupon (per request), but
  //    for them it's informational until the upgrade/add-on flows are wired.
  const isPaidSub = subscription?.subscription?.isPaymentConfirmed;
  const couponAppliesAtCheckout = !subscription?.subscription || !isPaidSub;
  const showCouponWidget = isAdmin;

  const applyCoupon = async (codeArg) => {
    const code = (codeArg ?? couponInput).trim();
    if (!code) return;
    setValidatingCoupon(true);
    setCouponError("");
    try {
      const res = await subscriptionAPI.previewCoupon({ code, billingCycle });
      setAppliedCoupon(res.data); // { valid, code, name, rules }
      setCouponInput("");
      try { sessionStorage.setItem(PENDING_COUPON_STORAGE_KEY, code); } catch { /* storage unavailable — non-fatal, just won't survive a refresh */ }
    } catch (err) {
      setAppliedCoupon(null);
      setCouponError(err.response?.data?.error || "Invalid coupon code");
      try { sessionStorage.removeItem(PENDING_COUPON_STORAGE_KEY); } catch { /* non-fatal */ }
    } finally {
      setValidatingCoupon(false);
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput("");
    setCouponError("");
    try { sessionStorage.removeItem(PENDING_COUPON_STORAGE_KEY); } catch { /* non-fatal */ }
  };

  // A3 fix — re-apply (and re-validate, not just trust) a coupon persisted
  // from before a refresh. Only meaningful pre-checkout (couponAppliesAtCheckout);
  // once paying, the subscription's own appliedCoupon snapshot is the source
  // of truth, not this page-local UI state. Runs once eligibility is known.
  //
  // C1 fix (found via live QA — the stale-banner bug): this used to gate only
  // on `couponAppliesAtCheckout`, which is computed from `!subscription?.subscription`
  // — on the very first render after a hard refresh, BEFORE useSubscription()'s
  // own fetch has resolved, `subscription?.subscription` is genuinely
  // undefined, making couponAppliesAtCheckout incorrectly `true` for one
  // render pass even for an already-paid subscriber. That race let this
  // effect restore a stale pre-checkout coupon code into local state for a
  // paying customer, which then rendered as a contradictory "Coupon
  // Applied" banner alongside (or instead of) the real, correct
  // subscription-coupon UI below. Waiting for `!loading` (the context's own
  // fetch-in-flight flag) closes that window — this effect now only ever
  // runs once we genuinely know whether the org is paying.
  useEffect(() => {
    if (loading || !couponAppliesAtCheckout || appliedCoupon) return;
    let storedCode;
    try { storedCode = sessionStorage.getItem(PENDING_COUPON_STORAGE_KEY); } catch { storedCode = null; }
    if (storedCode) applyCoupon(storedCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [couponAppliesAtCheckout, loading]);

  // C1 fix — defensive cleanup: the instant we know for certain the
  // subscription is paid, clear any leftover pre-checkout coupon state
  // (local `appliedCoupon` + its sessionStorage backing). Without this, a
  // stale code from before this org ever paid — or from the race above,
  // before this fix — could keep resurfacing the old "Coupon Applied"
  // banner indefinitely, contradicting the real subscription-coupon UI.
  useEffect(() => {
    if (loading) return;
    if (subscription?.subscription?.isPaymentConfirmed) {
      setAppliedCoupon(null);
      try { sessionStorage.removeItem(PENDING_COUPON_STORAGE_KEY); } catch { /* non-fatal */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, subscription?.subscription?.isPaymentConfirmed]);

  // Applies a manually-typed referral code immediately — creates
  // Referral(pending) right away (business event: "we know this org used
  // this code"), independent of whether the org ever starts a trial or
  // pays. Never discounts this checkout; see the field's own copy for why.
  const handleApplyReferral = async () => {
    const code = referralCodeInput.trim();
    if (!code) return;
    setApplyingReferral(true);
    setReferralError("");
    try {
      await subscriptionAPI.applyReferralCode(code);
      setReferralApplied(true);
    } catch (err) {
      setReferralApplied(false);
      setReferralError(err.response?.data?.error || "Invalid referral code");
    } finally {
      setApplyingReferral(false);
    }
  };

  // If the billing cycle changes while a coupon is applied, re-check it — the
  // coupon may be restricted to monthly/yearly, so it can silently become
  // invalid. Re-preview and drop it (with a notice) if it no longer applies.
  useEffect(() => {
    if (!appliedCoupon?.code) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await subscriptionAPI.previewCoupon({ code: appliedCoupon.code, billingCycle });
        if (!cancelled) setAppliedCoupon(res.data);
      } catch (err) {
        if (!cancelled) {
          setAppliedCoupon(null);
          setMessage({ type: "warning", text: err.response?.data?.error || "Coupon no longer applies to the selected billing cycle." });
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billingCycle]);

  // Pre-fetch the two addon catalogs needed to detect "this addon carries
  // forward under a remapped key" for display purposes (CurrentSubscriptionInfo/
  // PlanCard's "continues after downgrade" labelling) — the current plan's own
  // catalog, and (if a downgrade is scheduled) the target plan's catalog.
  // Without this, that detection silently does nothing until the user happens
  // to expand both cards, since getAddonsForPlan is otherwise only fetched
  // lazily on expand.
  useEffect(() => {
    const planIdsNeeded = new Set();
    if (subscription?.subscription?.planName) planIdsNeeded.add(subscription.subscription.planName);
    const planChangeSC = (scheduledChanges || []).find(
      (c) => c.type === 'PLAN_CHANGE' || c.type === 'BILLING_CYCLE_CHANGE'
    );
    if (planChangeSC?.payload?.planId) planIdsNeeded.add(planChangeSC.payload.planId);

    let cancelled = false;
    planIdsNeeded.forEach((planId) => {
      if (planAddons[planId]) return;
      subscriptionAPI.getAddonsForPlan(planId, billingCycle)
        .then((res) => { if (!cancelled) setPlanAddons((prev) => ({ ...prev, [planId]: res.data.addons || [] })); })
        .catch(() => { if (!cancelled) setPlanAddons((prev) => ({ ...prev, [planId]: [] })); });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscription?.subscription?.planName, scheduledChanges, billingCycle]);

  // 1. Unconditional listener for returning from external redirects (BFCache / tab switch)
  useEffect(() => {
    const handleReturnToApp = (e) => {
      if (e.type === 'pageshow' && !e.persisted) return; // Only care about BFCache restores
      if (e.type === 'visibilitychange' && document.visibilityState !== 'visible') return;

      // Reconcile first, then refetch: coming back to this tab is exactly when a
      // payment completed in the (now closed) checkout tab needs picking up, and
      // the webhook may never have arrived. No-ops when nothing is pending.
      subscriptionAPI.reconcilePayment()
        .catch(() => {})
        .finally(() => fetchSubscription());
      
      // Clear the "Setting up" state so it can transition to "Confirming mandate" or normal UI
      setCheckoutJourneyState((prev) => prev === 'setting_up_recurring' ? null : prev);
    };

    window.addEventListener("pageshow", handleReturnToApp);
    document.addEventListener("visibilitychange", handleReturnToApp);
    return () => {
      window.removeEventListener("pageshow", handleReturnToApp);
      document.removeEventListener("visibilitychange", handleReturnToApp);
    };
  }, [fetchSubscription]);

  // 2. Auto-detect mandate completion after the customer returns from Razorpay's
  // hosted Registration Link page. That page is a full redirect away from
  // this SPA (this merchant account can't use an embedded Checkout.js
  // recurring-auth flow at all — confirmed blocked by Razorpay support, see
  // CHARGE_AT_WILL_VALIDATION.md), so there is no in-app checkout success
  // handler to hook into the way startPolling() does elsewhere. Activation
  // itself already happens via webhook regardless of whether the customer
  // ever returns.
  // Triggers: poll periodically while PENDING_MANDATE is showing.
  useEffect(() => {
    if (deriveSubscriptionUIState(subscription?.subscription) !== SUBSCRIPTION_UI_STATES.PENDING_MANDATE) return;

    let cancelled = false;
    // Ask Razorpay directly on each tick, then read our own state. Polling
    // fetchSubscription alone only ever re-read what the webhook had written -
    // so if the webhook never arrived (or the customer closed the checkout tab
    // before verifyPayment could post back), a payment that HAD gone through
    // stayed "pending" here forever, and Resume Payment offered to charge again.
    const reconcileThenFetch = async () => {
      try {
        await subscriptionAPI.reconcilePayment();
      } catch {
        // Reconciliation is best-effort - fall through to the plain read.
      }
      return fetchSubscription();
    };

    waitForSettlement({
      fetchLatest: reconcileThenFetch,
      isSettled: (data) => !!data?.subscription?.isPaymentConfirmed,
      intervalMs: 5000,
      timeoutMs: 120000, // longer than the post-checkout poll — the customer may take a while on Razorpay's page before this effect even mounts
    }).then((result) => {
      if (cancelled || pollCancelledRef.current) return;
      if (result.settled) {
        setCheckoutJourneyState('success');
        setMessage({ type: "success", text: "Mandate confirmed! Subscription activated." });
        // Fix (found via live QA): this was the one 'success' path with no
        // redirect/reload at all — CheckoutJourneyScreen's 'success' copy
        // says "Redirecting..." but nothing actually did, leaving the
        // screen stuck. startPolling/startMandatePolling's own equivalent
        // success paths already reload; matched here for the same reason —
        // a full reload re-derives every UI state (plan cards, dashboard,
        // etc.) from the now-confirmed subscription rather than trusting
        // whatever else was in memory from before confirmation.
        setTimeout(() => {
          if (!cancelled && !pollCancelledRef.current) {
            window.location.reload();
          }
        }, 2000);
      }
      // Timeout case intentionally silent here — PaymentStatusAlert's own
      // message already covers "still pending" without adding a duplicate.
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deriveSubscriptionUIState(subscription?.subscription)]);

  const handleTrialStart = async () => {
    setProcessing(true);
    try {
      await startTrial();
      setMessage({
        type: "success",
        text: "Free trial activated! Enjoy all Growth features for 7 days.",
      });
      setShowTrialModal(false);
    } catch (error) {
      setMessage({
        type: "error",
        text: error.response?.data?.error || "Failed to start trial",
      });
    } finally {
      setProcessing(false);
    }
  };

  // Toggle expansion of a plan card and lazily load its add-ons
  const handleRemoveAddon = (addonKey, displayName, addonCycle) => {
    const sub = subscription?.subscription;
    // Monthly and Annual are independent instances of the same addonKey
    // (Phase 2d.1) — must match on both, or removing the annual instance
    // could pick up the monthly one's pricePerUnit/periodEnd instead.
    const activeAddon = (sub?.activeAddons || []).find(
      (a) => a.addonKey === addonKey && (addonCycle ? (a.billingCycle || sub.billingCycle) === addonCycle : true)
    );
    if (!activeAddon) return;
    const resolvedCycle = activeAddon.billingCycle || sub.billingCycle;
    // effectiveRecurringTotal (from getScheduledChanges) is null when
    // nothing is currently scheduled — falls back to the raw total in that
    // case, but whenever another change is already pending (e.g. a
    // different add-on already scheduled for removal), this must be the
    // baseline, not sub.totalAmount, or the preview understates what's
    // already scheduled to change.
    const currentTotal = effectiveRecurringTotal ?? sub.totalAmount;
    setCheckoutData({
      type: 'addon_removal',
      addonKey,
      displayName,
      quantity: 1,
      pricePerUnit: activeAddon.pricePerUnit,
      currentTotal,
      newRecurringTotal: currentTotal - activeAddon.pricePerUnit,
      // This add-on's OWN term end, not the base plan's currentPeriodEnd —
      // an annual add-on outlives a monthly renewal cycle, so the two can
      // legitimately differ (this was showing the wrong date for annual
      // add-ons before this fix).
      effectiveAt: activeAddon.periodEnd || sub.currentPeriodEnd,
      billingCycle: resolvedCycle,
    });
  };

  const handleExpandPlan = async (planId) => {
    if (expandedPlan === planId) {
      setExpandedPlan(null);
      return;
    }
    setExpandedPlan(planId);

    // No longer resets selectedAddons/addonPurchaseCycle here — both are now
    // keyed per-plan, so expanding a DIFFERENT plan can never touch this
    // plan's own selections, and re-expanding the SAME plan correctly keeps
    // whatever the user had already configured instead of discarding it.
    if (!planAddons[planId]) {
      try {
        const res = await subscriptionAPI.getAddonsForPlan(planId, billingCycle);
        setPlanAddons((prev) => ({ ...prev, [planId]: res.data.addons || [] }));
      } catch (err) {
        console.error("Failed to fetch addons for plan:", err);
        setPlanAddons((prev) => ({ ...prev, [planId]: [] }));
      }
    }
  };

  // Task 2: fetches (or re-fetches, when the user toggles a per-add-on
  // choice) the Monthly->Annual transition preview and populates the
  // confirmation modal. Extracted so both the initial open and any later
  // choice change go through the exact same call — the displayed numbers
  // always come from this one backend preview, never recomputed locally.
  const fetchTransitionPreview = async (plan, addonChoices) => {
    try {
      setProcessing(true);
      const preview = await subscriptionAPI.previewMonthlyToAnnualTransition(plan.id, addonChoices);
      setProcessing(false);
      // Distinguish what this transition actually supersedes: the backend
      // cancels any pending PLAN_CHANGE/BILLING_CYCLE_CHANGE on commit (see
      // subscriptionController.js's cycle-transition webhook branch), but
      // leaves REMOVE_ADDON scheduled changes untouched (settled business
      // contract — add-on removals survive a base-plan cycle switch). The
      // user should see that distinction BEFORE committing, not discover it
      // after the fact via the Timeline.
      const pendingBasePlanChange = (scheduledChanges || []).find(
        (c) => c.type === "PLAN_CHANGE" || c.type === "BILLING_CYCLE_CHANGE"
      );
      setCheckoutData({
        type: "cycle_transition",
        plan,
        ...preview.data,
        supersedesScheduledChange: !!pendingBasePlanChange,
      });
    } catch (err) {
      setProcessing(false);
      const apiError = err.response?.data;
      setMessage({
        type: "error",
        text: apiError?.code === "DOWNGRADE_INELIGIBLE"
          ? apiError.error
          : (apiError?.error || "Failed to load the annual switch preview. Please try again."),
      });
    }
  };

  const handleTransitionAddonChoiceChange = (addonKey, choice) => {
    const next = { ...transitionAddonChoices, [addonKey]: choice };
    setTransitionAddonChoices(next);
    fetchTransitionPreview(checkoutData.plan, next);
  };

  // Open the checkout summary modal instead of going straight to Razorpay
  const handlePlanSelection = async (plan, opts = {}) => {
    const { reactivateAndProceed = false } = opts;
    if (!isAdmin) {
      setMessage({
        type: "error",
        text: "Only organization admins can manage subscriptions. Please contact your admin.",
      });
      return;
    }
    if (processing || paymentInProgress) return;

    if (plan.trial) {
      setShowTrialModal(true);
      return;
    }

    // Scoped to THIS plan only — see selectedAddons' own declaration comment
    // for why a bare global read here was the cross-card leak bug.
    const planSelectedAddons = selectedAddons[plan.id] || {};
    const planAddonCycle = addonPurchaseCycle[plan.id] || null;

    const addons = planAddons[plan.id] || [];

    // Bug B fix (found via live QA — "Complete Payment" on a pending/
    // unactivated subscription silently dropped its already-persisted add-on
    // and coupon after a page reload): selectedAddonsList/appliedCoupon here
    // used to be built ONLY from selectedAddons/appliedCoupon — page-level
    // React state that resets to empty on every fresh load. That's correct
    // for a brand-new selection, but for "Complete Payment" on a subscription
    // that ALREADY exists in this exact pending state (same plan, same
    // cycle, not yet paid), the real source of truth is what's already
    // persisted on the Subscription document, not empty local state left
    // over from a reload. Scoped deliberately narrow: only when (a) this is
    // the SAME plan/cycle the pending subscription is already on (i.e. this
    // really is "Complete Payment", not "Change Plan" to something else),
    // and (b) the user hasn't made any local selection this session (an
    // active session selection always wins — never silently overridden).
    // An already-PAID subscriber's normal add-on-purchase flow is untouched;
    // this only applies while isPaymentConfirmed is still false.
    const pendingSub = subscription?.subscription;
    const isResumingSamePendingPlan =
      pendingSub && !pendingSub.isPaymentConfirmed &&
      pendingSub.planName === plan.id && pendingSub.billingCycle === billingCycle &&
      Object.keys(planSelectedAddons).length === 0;

    const selectedAddonsList = isResumingSamePendingPlan
      ? (pendingSub.activeAddons || []).map((persisted) => {
          const catalogEntry = addons.find((a) => a.key === persisted.addonKey);
          const unitPrice = catalogEntry ? (billingCycle === "yearly" ? catalogEntry.price?.yearly : catalogEntry.price?.monthly) : persisted.pricePerUnit;
          return {
            ...(catalogEntry || { key: persisted.addonKey, displayName: persisted.addonKey }),
            quantity: persisted.quantity,
            subtotal: persisted.quantity * (unitPrice || persisted.pricePerUnit || 0),
          };
        })
      : addons
          .filter((a) => (planSelectedAddons[a.key] || 0) > 0)
          .map((a) => ({
            ...a,
            quantity: planSelectedAddons[a.key],
            subtotal: planSelectedAddons[a.key] * (billingCycle === "yearly" ? a.price?.yearly : a.price?.monthly),
          }));

    const basePrice = billingCycle === "monthly" ? plan.monthlyPrice : plan.yearlyPrice;
    const addonsTotal = selectedAddonsList.reduce((sum, a) => sum + a.subtotal, 0);
    const total = basePrice + addonsTotal;

    const isExistingActiveSub =
      subscription?.subscription?.isPaymentConfirmed &&
      !subscription?.subscription?.isTrialActive;

    // Phase 3 (docs/audit/PHASE3_MONTHLY_TO_ANNUAL_PRORATION.md): a Monthly ->
    // Annual base-plan transition — same tier or cross-tier (settled this
    // session: cross-tier is an intended, immediate action, generalizing the
    // same proration formula). Takes priority over the upgrade/downgrade/
    // same-plan branches below, since this is a distinct flow with its own
    // backend endpoint (proration, eligibility gating for a cross-tier
    // downgrade, and ScheduledChange supersession all handled server-side —
    // this branch only needs to call it and handle the one-time Order
    // payment, mirroring the add-on-purchase Razorpay flow exactly).
    // Annual -> Monthly is NOT handled here (settled separately as
    // cancel -> wait for term end -> resubscribe, not a live transition).
    const isMonthlyToAnnualTransition =
      isExistingActiveSub &&
      resolveBaseCardAction(subscription.subscription, plan.id, billingCycle) === "SWITCH_TO_ANNUAL";

    if (isMonthlyToAnnualTransition) {
      // Missing-frontend-requirement fix (found via live QA, Aug 2026): this
      // used to call initiateMonthlyToAnnualTransition (which creates a real
      // Order) directly and jump straight to Razorpay — skipping our own
      // confirmation screen entirely. Now calls the read-only PREVIEW
      // endpoint first (creates nothing), shows CheckoutSummaryModal's new
      // "cycle_transition" branch explaining the calculation, and only calls
      // the real initiate endpoint (which DOES create the Order) after the
      // user clicks "Continue to Payment" — see handleConfirmCheckout below.
      setTransitionAddonChoices({}); // fresh modal open — no choices made yet, default 'monthly' for every add-on
      await fetchTransitionPreview(plan, {});
      return;
    }

    const isSamePlan =
      subscription?.subscription?.planName === plan.id &&
      subscription?.subscription?.billingCycle === billingCycle;

    // Existing active subscriber changing only add-ons on their current plan
    if (isExistingActiveSub && isSamePlan) {
      const currentAddons = subscription.subscription.activeAddons || [];
      const allPlanAddons = planAddons[plan.id] || [];

      // Which cycle a NEW purchase targets — an annual base plan may choose
      // either (addonPurchaseCycle, set via the per-purchase selector on the
      // card), a monthly base plan has no choice at all (must stay monthly,
      // per the business contract). Only a single value is needed, not a
      // per-addonKey one, since only one add-on can be purchased per confirm
      // (enforced below in handleConfirmCheckout).
      const purchaseCycle =
        subscription.subscription.billingCycle === "yearly" ? (planAddonCycle || "yearly") : "monthly";

      // planSelectedAddons[key] now represents HOW MANY MORE to add (delta), not total
      const addonChanges = allPlanAddons
        .map((a) => {
          const currentQty = currentAddons.find((c) => c.addonKey === a.key)?.quantity || 0;
          const delta = planSelectedAddons[a.key] || 0;
          const newQty = currentQty + delta;
          return {
            addonKey: a.key,
            displayName: a.displayName,
            delta,
            currentQty,
            newQty,
            billingCycle: purchaseCycle,
            pricePerUnit: purchaseCycle === "yearly" ? a.price?.yearly : a.price?.monthly,
          };
        })
        .filter((c) => c.delta > 0); // removals go through the × button, not this path

      if (addonChanges.length === 0) {
        setMessage({ type: "warning", text: "Select at least one add-on to purchase." });
        return;
      }

      // Same reasoning as handleRemoveAddon above: the recurring baseline for
      // "adding more add-ons on the current plan" must reflect anything
      // already scheduled (e.g. a different add-on's pending removal), not
      // the raw current totalAmount.
      const currentTotal = effectiveRecurringTotal ?? subscription.subscription.totalAmount ?? basePrice;
      const deltaTotal = addonChanges.reduce((sum, c) => sum + c.delta * c.pricePerUnit, 0);

      // Task 4: for a single-addon ADDITION, fetch the real backend-computed
      // prorated charge before showing the confirmation — previously this
      // modal only ever showed a client-side recurring-total estimate, never
      // the actual one-time amount that gets charged today. Skipped for
      // mixed/multi-addon selections (already blocked at commit anyway, "one
      // add-on at a time") and for pure removals (no charge to preview).
      let addonPurchasePreview = null;
      if (addonChanges.length === 1) {
        try {
          const previewRes = await subscriptionAPI.previewAddonPurchase({
            addonKey: addonChanges[0].addonKey,
            quantity: addonChanges[0].delta,
            billingCycle: purchaseCycle,
          });
          addonPurchasePreview = previewRes.data;
        } catch (previewErr) {
          console.error("previewAddonPurchase failed (falling back to estimate-only display):", previewErr);
        }
      }

      setCheckoutData({
        type: "addon_change",
        plan,
        addonChanges,
        currentTotal,
        newTotal: currentTotal + deltaTotal,
        // The cycle actually being PURCHASED (per-add-on choice on an annual
        // base), not necessarily the page's browsing toggle — those two only
        // coincide by construction on a monthly base.
        billingCycle: purchaseCycle,
        addonPurchasePreview,
        selectedAddonsList: addonChanges.map((c) => ({
          key: c.addonKey,
          displayName: c.displayName,
          quantity: c.delta,
          subtotal: c.delta * c.pricePerUnit,
          price: { [purchaseCycle]: c.pricePerUnit },
        })),
      });
      return;
    }

    const planPriority = { starter: 1, growth: 2, business: 3 };

    // Tier DOWNGRADE — show confirmation modal; no payment required
    const isTierDowngrade =
      isExistingActiveSub && !isSamePlan &&
      (planPriority[plan.id] || 0) < (planPriority[subscription?.subscription?.planName] || 0);

    if (isTierDowngrade) {
      try {
        setProcessing(true);
        const compat = await subscriptionAPI.checkAddonCompatibility(plan.id, billingCycle);
        setProcessing(false);
        const newBasePrice = billingCycle === "monthly" ? plan.monthlyPrice : plan.yearlyPrice;

        // The backend now returns carry-forward add-ons from effective state,
        // so the preview should trust that single source instead of
        // re-filtering against raw pendingAddonRemovals here.
        const carryForwardAddons = compat.data.compatibleCarryForward || [];

        // New addons the user selected on the target plan card
        const targetPlanAddons = planAddons[plan.id] || [];
        const newSelectedAddons = Object.entries(planSelectedAddons)
          .filter(([key, qty]) => qty > 0 && targetPlanAddons.some((a) => a.key === key))
          .map(([key, qty]) => {
            const addonDef = targetPlanAddons.find((a) => a.key === key);
            const price = addonDef?.price?.[billingCycle] || 0;
            return { addonKey: key, quantity: qty, pricePerUnit: price };
          });

        // Downgrade compatibility checks (validateDowngrade backend contract,
        // agreed 2026-07-24) — generic {type, status, ...} list. This
        // component never encodes business rules about what "seat" or
        // "storage" means; it only reacts to `status`:
        //   PASS          -> green, no action.
        //   AUTO_FIXABLE  -> quantity selector, prefilled at `minimumQuantity`,
        //                     adjustable upward, never below the minimum.
        //   MANUAL_ACTION / BLOCKING -> stop the flow, no Schedule button.
        const downgradeChecks = compat.data.downgradeValidation?.results || [];
        const hasHardBlocker = downgradeChecks.some(
          (c) => c.status === "MANUAL_ACTION" || c.status === "BLOCKING"
        );
        // Prefilled at the minimum for every AUTO_FIXABLE check — the user
        // can increase further but the modal must never let them go lower.
        const resolutionAddons = {};
        const resolutionAddonCatalog = {};
        downgradeChecks
          .filter((c) => c.status === "AUTO_FIXABLE" && c.requiredAddon)
          .forEach((c) => {
            resolutionAddons[c.requiredAddon] = c.minimumQuantity;
            resolutionAddonCatalog[c.requiredAddon] = { pricePerUnit: c.pricePerUnit, minimumQuantity: c.minimumQuantity };
          });

        const carryForwardTotal = carryForwardAddons.reduce((s, a) => s + a.quantity * a.pricePerUnit, 0);
        const newAddonsTotal = newSelectedAddons.reduce((s, a) => s + a.quantity * a.pricePerUnit, 0);
        const resolutionAddonsTotal = Object.entries(resolutionAddons)
          .reduce((s, [key, qty]) => s + qty * (resolutionAddonCatalog[key]?.pricePerUnit || 0), 0);
        const newRecurringTotal = newBasePrice + carryForwardTotal + newAddonsTotal + resolutionAddonsTotal;

        // maxCarryForward (quantity ceiling for the stepper) + carryForwardCatalog
        // (stable pricePerUnit/remappedFrom reference, since carriedForwardAddons
        // itself gets filtered/mutated as the user edits quantities down to 0 —
        // losing that info would break re-incrementing back up).
        const maxCarryForward = {};
        carryForwardAddons.forEach((a) => { maxCarryForward[a.addonKey] = a.quantity; });

        setCheckoutData({
          type: "plan_downgrade",
          plan,
          billingCycle,
          // Task B: picking a new plan while a cancellation is scheduled
          // implicitly cancels that cancellation and proceeds — same
          // precedent as the annual transition superseding a pending
          // PLAN_CHANGE. Surfaced so the modal can warn before commit.
          pendingCancellationWillClear: !!subscription?.subscription?.cancelAtPeriodEnd,
          newBasePrice,
          newRecurringTotal,
          periodEnd: subscription?.subscription?.currentPeriodEnd,
          incompatibleAddons: compat.data.incompatibleDropped || [],
          carriedForwardAddons: carryForwardAddons,
          carryForwardCatalog: carryForwardAddons,
          maxCarryForward,
          newAddonsList: newSelectedAddons,
          downgradeChecks,
          hasHardBlocker,
          resolutionAddons,
          resolutionAddonCatalog,
          userCount: subscription?.subscription?.userCount || 1,
        });
      } catch (err) {
        setProcessing(false);
        setMessage({ type: "error", text: err.response?.data?.error || "Could not check plan compatibility." });
      }
      return;
    }

    // Tier UPGRADE (same billing cycle) — fetch the real prorated amount from the
    // backend so the checkout modal shows exactly what will be charged NOW, plus
    // the new recurring total. Nothing is committed until the user pays.
    const isTierUpgrade =
      isExistingActiveSub && !isSamePlan &&
      billingCycle === subscription?.subscription?.billingCycle &&
      (planPriority[plan.id] || 0) > (planPriority[subscription?.subscription?.planName] || 0);

    if (isTierUpgrade) {
      try {
        setProcessing(true);
        // Pass add-ons the user selected on this plan card as NEW purchases
        const newAddons = Object.entries(planSelectedAddons)
          .filter(([, qty]) => qty > 0)
          .map(([key, qty]) => ({ key, quantity: qty }));
        // Task B: a scheduled cancellation blocks updateSubscription by
        // default (CANCELLATION_PENDING). Confirm with the user first —
        // picking a new plan implicitly cancels the scheduled cancellation,
        // same precedent as the annual transition superseding a pending
        // PLAN_CHANGE — then retry with the explicit opt-in flag.
        if (subscription?.subscription?.cancelAtPeriodEnd && !reactivateAndProceed) {
          setProcessing(false);
          setCheckoutData({
            type: "confirm_reactivate_and_change_plan",
            plan,
            billingCycle,
            pendingAction: () => handlePlanSelection(plan, { reactivateAndProceed: true }),
          });
          return;
        }
        const resp = await updateSubscription({
          planId: plan.id,
          billingCycle,
          addons: newAddons,
          ...(reactivateAndProceed ? { reactivateAndProceed: true } : {}),
        });
        setProcessing(false);
        if (resp?.paymentDetails) {
          // First response (no carryForward override sent) reflects the FULL
          // surviving quantity per addon — capture that as the editable
          // ceiling so the stepper in the modal can't be dragged past what's
          // actually available to carry forward.
          const maxCarryForward = {};
          (resp.carriedForwardAddons || []).forEach((a) => { maxCarryForward[a.addonKey] = a.quantity; });
          setCheckoutData({
            type: "plan_upgrade",
            plan,
            billingCycle,
            newAddons,
            proratedAmount: resp.proratedAmount,
            referralDiscountApplied: resp.referralDiscountApplied, // already-computed by backend; only surfaced in the UI
            couponDiscountApplied: resp.couponDiscountApplied,
            totalDiscountApplied: resp.totalDiscountApplied,
            pricingBreakdown: resp.pricingBreakdown, // BILLING_UX_SPEC.md §1.2 — canonical shape, now also returned for upgrades
            newRecurringTotal: resp.newRecurringTotal,
            carriedForwardAddons: resp.carriedForwardAddons || [],
            maxCarryForward,
            newAddonsList: resp.newAddonsList || [],
            incompatibleAddons: resp.incompatibleAddons || [],
            paymentDetails: resp.paymentDetails,
          });
        } else {
          setMessage({ type: "error", text: resp?.message || "Could not initiate upgrade." });
        }
      } catch (err) {
        setProcessing(false);
        setMessage({ type: "error", text: err.response?.data?.error || "Upgrade failed to initiate." });
      }
      return;
    }

    // For plan changes by existing active subscribers, pre-flight compatibility check
    let compatibleCarryForward = [];
    let incompatibleDropped = [];
    let carryForwardTotal = 0;
    if (isExistingActiveSub && !isSamePlan && (subscription?.subscription?.activeAddons || []).length > 0) {
      try {
        const compat = await subscriptionAPI.checkAddonCompatibility(plan.id, billingCycle);
        compatibleCarryForward = compat.data.compatibleCarryForward || [];
        incompatibleDropped = compat.data.incompatibleDropped || [];
        carryForwardTotal = compatibleCarryForward.reduce((sum, a) => sum + a.quantity * a.pricePerUnit, 0);
      } catch (err) {
        console.error('Compatibility check failed:', err);
      }
    }

    // If a coupon was already applied on the plans page, re-price it against
    // this exact plan + add-on selection so checkout's inline breakdown shows
    // the precise per-line discount — applying happened outside, this just
    // carries the already-applied coupon's effect into checkout.
    //
    // Bug B fix, same reasoning as selectedAddonsList above: for "Complete
    // Payment" on this exact pending subscription, fall back to the
    // persisted appliedCoupon.code when local state has none — otherwise a
    // reload silently drops an already-attached coupon from this invoice.
    const effectiveCouponCode = appliedCoupon?.code || (isResumingSamePendingPlan ? pendingSub.appliedCoupon?.code : undefined);
    let checkoutCoupon = null;
    if (effectiveCouponCode && couponAppliesAtCheckout) {
      try {
        const lineItems = [
          { key: plan.id, type: "plan", amount: basePrice },
          ...selectedAddonsList.map((a) => ({ key: a.key, type: "addon", amount: a.subtotal })),
        ];
        const res = await subscriptionAPI.validateCoupon({
          code: effectiveCouponCode,
          planId: plan.id,
          billingCycle,
          lineItems,
        });
        checkoutCoupon = res.data;
      } catch {
        checkoutCoupon = null;
      }
    }

    // BILLING_UX_SPEC.md §0/Option A — the pre-payment Order Summary must
    // come from the backend's own pricing engine, not client-side math. This
    // is read-only (no writes, no reward reservation) and mirrors exactly
    // what createSubscription/the trial-conversion branch will charge
    // moments later on confirm — verified to never drift in
    // scripts/verifyPreviewSubscription.js.
    let pricingBreakdown = null;
    try {
      const previewRes = await subscriptionAPI.previewSubscription({
        planId: plan.id,
        billingCycle,
        addons: selectedAddonsList.map((a) => ({ addonKey: a.key, quantity: a.quantity })),
        couponCode: checkoutCoupon?.code || effectiveCouponCode || undefined,
      });
      pricingBreakdown = previewRes.data.pricingBreakdown;
    } catch (err) {
      console.error('Pricing preview failed (checkout falls back to legacy client-side total):', err);
    }

    setCheckoutData({
      plan,
      selectedAddonsList,
      basePrice,
      addonsTotal,
      total: total + carryForwardTotal,
      billingCycle,
      compatibleCarryForward,
      incompatibleDropped,
      appliedCoupon: checkoutCoupon,
      pricingBreakdown,
    });
  };

  const openRazorpay = (paymentDetails) => {
    const checkoutOptions = {
      ...paymentDetails,
      handler: async function (paymentResponse) {
        setCheckoutJourneyState('confirming_payment');
        setMessage({ type: "success", text: "Payment successful! Verifying..." });
        setPaymentInProgress(true);
        try {
          const verificationResult = await subscriptionAPI.verifyPayment({
            razorpay_payment_id: paymentResponse.razorpay_payment_id,
            razorpay_subscription_id: paymentResponse.razorpay_subscription_id,
            razorpay_signature: paymentResponse.razorpay_signature,
          });
          if (verificationResult.data.success) {
            setMessage({ type: "success", text: "Payment confirmed! Subscription updated successfully." });
            setPaymentInProgress(false);
            setCheckoutJourneyState('success');
            await fetchSubscription();
            setTimeout(() => { 
              setCheckoutJourneyState(null);
              window.location.href = "/"; 
            }, 1500);
          } else {
            setMessage({ type: "warning", text: "Payment received. Verification in progress..." });
            startPolling();
          }
        } catch (verificationError) {
          console.error("Client verification failed:", verificationError);
          setMessage({ type: "warning", text: "Payment received. Waiting for confirmation..." });
          startPolling();
        }
      },
      modal: {
        ondismiss: function () {
          setMessage({ type: "warning", text: "Payment cancelled. Your subscription remains unchanged." });
          setPaymentInProgress(false);
          setCheckoutJourneyState(null);
        },
      },
      onPaymentFailed: function (error) {
        setMessage({ type: "error", text: `Payment failed: ${error.description}` });
        setPaymentInProgress(false);
        setCheckoutJourneyState(null);
      },
    };
    openCheckout(checkoutOptions);
  };

  // Called by the checkout modal when the user edits a carried-forward
  // add-on's quantity. Re-quotes against the backend rather than recomputing
  // pricing locally — the backend is the single pricing authority (same
  // calculateInvoice() path), so the modal never risks disagreeing with what
  // will actually be charged. Sends every currently-known carry-forward
  // quantity (not just the one just touched), otherwise an untouched addon
  // would silently reset to its full default on the next request.
  const handleCarryForwardChange = async (addonKey, newQuantity) => {
    if (!checkoutData || checkoutData.type !== "plan_upgrade") return;
    const max = checkoutData.maxCarryForward?.[addonKey] ?? newQuantity;
    const clamped = Math.max(0, Math.min(newQuantity, max));

    const currentQuantities = {};
    (checkoutData.carriedForwardAddons || []).forEach((a) => { currentQuantities[a.addonKey] = a.quantity; });
    currentQuantities[addonKey] = clamped;
    const carryForward = Object.entries(currentQuantities).map(([key, quantity]) => ({ addonKey: key, quantity }));

    try {
      setProcessing(true);
      const resp = await updateSubscription({
        planId: checkoutData.plan.id,
        billingCycle: checkoutData.billingCycle,
        addons: checkoutData.newAddons || [],
        carryForward,
      });
      setProcessing(false);
      if (resp?.paymentDetails) {
        setCheckoutData((prev) => ({
          ...prev,
          proratedAmount: resp.proratedAmount,
          referralDiscountApplied: resp.referralDiscountApplied,
          couponDiscountApplied: resp.couponDiscountApplied,
          totalDiscountApplied: resp.totalDiscountApplied,
          pricingBreakdown: resp.pricingBreakdown,
          newRecurringTotal: resp.newRecurringTotal,
          carriedForwardAddons: resp.carriedForwardAddons || [],
          newAddonsList: resp.newAddonsList || [],
          incompatibleAddons: resp.incompatibleAddons || [],
          paymentDetails: resp.paymentDetails,
        }));
      } else {
        setMessage({ type: "error", text: resp?.message || "Could not update quote." });
      }
    } catch (err) {
      setProcessing(false);
      setMessage({ type: "error", text: err.response?.data?.error || "Could not update quote." });
    }
  };

  // Called by the checkout modal when the user edits a carried-forward
  // add-on's quantity DURING A DOWNGRADE. Unlike the upgrade version, this
  // never calls the backend: updateSubscription's downgrade branch IS the
  // commit (no separate payment step to gate it), so calling it on every
  // stepper click would prematurely (re)schedule the real downgrade before
  // the user ever clicks "Schedule Downgrade" — clicking Back afterwards
  // wouldn't actually undo it. Recomputed entirely client-side instead, from
  // the stable carryForwardCatalog (price/remap info) captured at preview
  // time; the final chosen quantities are only sent to the backend when the
  // user actually confirms.
  // Shared by both downgrade steppers (carry-forward and compatibility
  // resolution add-ons) — recomputes newRecurringTotal from all three
  // sources so neither handler can silently drop the other's contribution.
  const recomputeDowngradeTotal = (prev, carriedForwardAddons, resolutionAddons) => {
    const carryForwardTotal = carriedForwardAddons.reduce((s, a) => s + a.quantity * a.pricePerUnit, 0);
    const newAddonsTotal = (prev.newAddonsList || []).reduce((s, a) => s + a.quantity * a.pricePerUnit, 0);
    const resolutionAddonsTotal = Object.entries(resolutionAddons)
      .reduce((s, [key, qty]) => s + qty * (prev.resolutionAddonCatalog?.[key]?.pricePerUnit || 0), 0);
    return prev.newBasePrice + carryForwardTotal + newAddonsTotal + resolutionAddonsTotal;
  };

  // Re-validates against the backend on every change (read-only preview
  // call, safe to call this often — unlike the upgrade/downgrade COMMIT
  // endpoints). This is what catches "reduced a carried seat to 0 while
  // still over the target plan's capacity" live, instead of only at final
  // submit — the bug a live test caught: the modal kept showing "no action
  // required" the whole time because it was only recomputing price locally
  // and never re-asking the validator about the edited carry-forward state.
  const handleDowngradeCarryForwardChange = async (addonKey, newQuantity) => {
    if (!checkoutData || checkoutData.type !== "plan_downgrade") return;
    const max = checkoutData.maxCarryForward?.[addonKey] ?? newQuantity;
    const clamped = Math.max(0, Math.min(newQuantity, max));

    const currentQuantities = {};
    (checkoutData.carryForwardCatalog || []).forEach((a) => { currentQuantities[a.addonKey] = 0; });
    (checkoutData.carriedForwardAddons || []).forEach((a) => { currentQuantities[a.addonKey] = a.quantity; });
    currentQuantities[addonKey] = clamped;
    const carryForward = Object.entries(currentQuantities).map(([key, quantity]) => ({ addonKey: key, quantity }));

    // Optimistic local update first so the stepper feels instant, then
    // reconcile with the authoritative backend response.
    setCheckoutData((prev) => {
      const catalogEntry = (prev.carryForwardCatalog || []).find((a) => a.addonKey === addonKey);
      const updatedCarried = (prev.carriedForwardAddons || []).filter((a) => a.addonKey !== addonKey);
      if (clamped > 0 && catalogEntry) {
        updatedCarried.push({ ...catalogEntry, quantity: clamped });
      }
      const newRecurringTotal = recomputeDowngradeTotal(prev, updatedCarried, prev.resolutionAddons || {});
      return { ...prev, carriedForwardAddons: updatedCarried, newRecurringTotal };
    });

    try {
      const compat = await subscriptionAPI.checkAddonCompatibility(checkoutData.plan.id, checkoutData.billingCycle, carryForward);
      const downgradeChecks = compat.data.downgradeValidation?.results || [];
      const hasHardBlocker = downgradeChecks.some((c) => c.status === "MANUAL_ACTION" || c.status === "BLOCKING");
      const resolutionAddons = {};
      const resolutionAddonCatalog = {};
      downgradeChecks
        .filter((c) => c.status === "AUTO_FIXABLE" && c.requiredAddon)
        .forEach((c) => {
          resolutionAddons[c.requiredAddon] = c.minimumQuantity;
          resolutionAddonCatalog[c.requiredAddon] = { pricePerUnit: c.pricePerUnit, minimumQuantity: c.minimumQuantity };
        });

      setCheckoutData((prev) => {
        const newRecurringTotal = recomputeDowngradeTotal(
          { ...prev, resolutionAddonCatalog },
          prev.carriedForwardAddons || [],
          resolutionAddons
        );
        return { ...prev, downgradeChecks, hasHardBlocker, resolutionAddons, resolutionAddonCatalog, newRecurringTotal };
      });
    } catch (err) {
      setMessage({ type: "error", text: err.response?.data?.error || "Could not re-check plan compatibility." });
    }
  };

  // Called when the user adjusts an AUTO_FIXABLE compatibility check's
  // recommended quantity (e.g. "add 4 more seats"). Per the agreed contract,
  // this can only go UP from the backend-computed minimum, never below it —
  // that minimum is what actually makes the downgrade eligible.
  const handleDowngradeResolutionChange = (addonKey, newQuantity) => {
    if (!checkoutData || checkoutData.type !== "plan_downgrade") return;
    const minimum = checkoutData.resolutionAddonCatalog?.[addonKey]?.minimumQuantity ?? 0;
    const clamped = Math.max(minimum, newQuantity);

    setCheckoutData((prev) => {
      const updatedResolution = { ...prev.resolutionAddons, [addonKey]: clamped };
      const newRecurringTotal = recomputeDowngradeTotal(prev, prev.carriedForwardAddons || [], updatedResolution);
      return { ...prev, resolutionAddons: updatedResolution, newRecurringTotal };
    });
  };

  // Shared CAW Registration Link hand-off sequence — extracted so
  // handleConfirmCheckout's fresh-checkout branch and handleResumePayment
  // (B2 fix, below) drive the exact same journey-state transitions and
  // polling, rather than a second hand-rolled copy drifting out of sync.
  // Popup-blocker fix (found via live QA — "Subscribe" never opened the
  // Razorpay page; "Complete Payment" later worked "by luck"): window.open()
  // is only exempt from popup blocking when it runs SYNCHRONOUSLY inside a
  // real user-gesture handler. This used to call window.open() here, several
  // awaited API calls plus a setTimeout removed from the original click —
  // browsers silently drop that popup with no error, leaving the mandate
  // dangling in 'pending' while checkoutJourneyState moved on to
  // 'confirming_mandate' and polled for a confirmation that could never
  // arrive. Fix: the caller now opens a blank tab SYNCHRONOUSLY at the very
  // top of its click handler (before any await) and hands us the reference;
  // we only ever navigate it, never open a new one.
  const openRegistrationLinkJourney = (registrationLink, popupWindow) => {
    setCheckoutJourneyState('setting_up_recurring');
    setTimeout(() => {
      // Found via live QA: Razorpay's Registration Link/Invoice product has
      // no callback_url field, so Razorpay can never redirect the customer
      // back automatically — opening in a new tab keeps this tab alive to
      // actively poll instead.
      if (popupWindow && !popupWindow.closed) {
        popupWindow.location.href = registrationLink.shortUrl;
      } else {
        // Fallback for a caller that couldn't pre-open one (or it got closed
        // by the user) — still attempted, even though it may now be blocked.
        window.open(registrationLink.shortUrl, '_blank', 'noopener,noreferrer');
      }
      setCheckoutJourneyState('confirming_mandate');
      startMandatePolling(popupWindow);
    }, 2500);
  };

  // Resolves as soon as the given window reports .closed — used so
  // startMandatePolling can react immediately to the customer closing the
  // Razorpay tab, instead of silently sitting on the full-screen "Confirming
  // your mandate..." overlay for the entire 5-minute poll timeout. Never
  // resolves if no window reference exists (the fallback window.open() path
  // above doesn't keep one) — callers race this against the real settlement
  // poll, so having no popup reference just means this half of the race
  // never wins.
  const waitForPopupClose = (popupWindow) =>
    new Promise((resolve) => {
      if (!popupWindow) return;
      const id = setInterval(() => {
        if (popupWindow.closed) {
          clearInterval(id);
          resolve();
        }
      }, 800);
    });

  // Opens a blank tab synchronously, before any await breaks the user-gesture
  // chain — must be called at the very start of a click handler, never after
  // an `await`. Callers close it themselves if the flow turns out not to need
  // a registration link after all (e.g. an upgrade that uses Razorpay
  // Checkout instead), so no stray blank tab is left behind.
  const openBlankRegistrationTab = () => {
    try {
      // Deliberately NOT passing 'noopener' here — most browsers return null
      // from window.open() when 'noopener' is in the features string, since
      // that flag's whole point is severing the caller's own reference to the
      // new window. That was silently defeating the entire pre-open pattern:
      // this call still opened a real blank tab, but the null return made
      // openRegistrationLinkJourney below think the pre-opened tab was gone,
      // so it fell back to window.open()-ing a SECOND tab for the Razorpay
      // link — leaving the original blank tab orphaned forever (exactly the
      // "blank tab + separate Razorpay tab" bug reported via live QA).
      // Reverse-tabnabbing protection (the reason noopener existed here) is
      // preserved without sacrificing the reference: null out the new
      // window's own `opener` directly instead.
      const win = window.open('', '_blank');
      if (win) {
        try { win.opener = null; } catch { /* best-effort; some browsers disallow this */ }
        // Blank tab used to sit on a genuinely empty about:blank page for the
        // whole API-call + pacing-delay wait before it navigates to Razorpay
        // — indistinguishable from a broken/frozen tab. A minimal inline
        // loading message (no external assets — this document gets replaced
        // by Razorpay's page moments later anyway) tells the customer it's
        // working, not stuck.
        try {
          win.document.write(`
            <!doctype html><html><head><title>Redirecting…</title>
            <style>
              html,body{height:100%;margin:0;display:flex;align-items:center;justify-content:center;background:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;}
              .wrap{text-align:center;color:#111827;}
              .spinner{width:40px;height:40px;margin:0 auto 16px;border-radius:50%;border:3px solid #E1E4EA;border-top-color:#0085FF;animation:spin 0.8s linear infinite;}
              @keyframes spin{to{transform:rotate(360deg);}}
              p{font-size:14px;color:#6B7280;margin:0;}
            </style></head>
            <body><div class="wrap"><div class="spinner"></div><p>Redirecting you to Razorpay…</p></div></body></html>
          `);
          win.document.close();
        } catch { /* non-fatal — worst case it just stays blank until navigation */ }
      }
      return win;
    } catch {
      return null;
    }
  };

  // Called by the checkout modal's Confirm & Pay button. Accepts an optional
  // user override — fix (found via live QA): BillingProfileModal's onSaved
  // callback calls setCurrentUser(updatedUser) then immediately re-invokes
  // this function in the same statement block; since this function is a
  // plain closure recreated every render (not useCallback/ref-based), that
  // immediate re-invocation was still reading the PRE-save `currentUser`
  // from its own closure, not the just-saved value — a stale-closure bug
  // that could re-open the same "complete your profile" gate right after
  // the user had just completed it. Passing the fresh user explicitly here
  // sidesteps the closure entirely rather than depending on React's next
  // render to have happened first.
  const handleConfirmCheckout = async (userOverride, mandateMethod = lastMandateMethodRef.current) => {
    if (!checkoutData) return;
    const effectiveUser = userOverride || currentUser;

    if (!checkoutData.type && !mandateMethod) {
      setMethodPrompt({ kind: "checkout" });
      return;
    }

    // Popup-blocker fix (see openRegistrationLinkJourney's own comment):
    // every checkoutData.type branch below either returns early via
    // Razorpay Checkout (openCheckout, an SDK-driven iframe, not window.open)
    // or is a no-payment schedule/downgrade — only the UNTYPED, fall-through
    // branch at the bottom (fresh subscribe / plan-change-while-pending)
    // ever calls openRegistrationLinkJourney. Pre-open the tab HERE,
    // synchronously, before this function's first `await` breaks the
    // trusted user-gesture chain a real click gives us. Closed below on any
    // path that doesn't end up needing it, so no stray blank tab survives.
    const willNeedRegistrationLink = !checkoutData.type;
    const preopenedPopup = willNeedRegistrationLink ? openBlankRegistrationTab() : null;

    setProcessing(true);
    setMessage("");

    try {
      // Task B: lightweight confirm-only step (no pricing to show) — just
      // re-runs the original action with the reactivate flag now confirmed.
      if (checkoutData.type === "confirm_reactivate_and_change_plan") {
        const action = checkoutData.pendingAction;
        setCheckoutData(null);
        setProcessing(false);
        if (action) await action();
        return;
      }

      // Monthly -> Annual cycle transition — "Continue to Payment" from our
      // own confirmation screen. Unlike plan_upgrade, the Order is NOT
      // already created (the preview step that populated this modal creates
      // nothing) — it's created here, now, only once the user has actually
      // confirmed. Settlement is webhook-driven (pendingCycleTransition
      // clearing), same pattern as add-on purchase, NOT verifyPayment —
      // the backend commit logic for this transition lives in the
      // payment.captured webhook handler, not the verify-payment endpoint.
      if (checkoutData.type === "cycle_transition") {
        try {
          const result = await subscriptionAPI.initiateMonthlyToAnnualTransition({
            targetPlanId: checkoutData.toPlanId,
            addonChoices: transitionAddonChoices,
          });
          const { paymentDetails } = result.data;
          setCheckoutData(null);
          setProcessing(false);
          setPaymentInProgress(true);
          setCheckoutJourneyState("preparing_payment");

          setTimeout(() => {
            openCheckout({
              ...paymentDetails,
              handler: async function () {
                setCheckoutJourneyState("confirming_payment");
                setMessage({ type: "success", text: "Payment received! Switching to annual billing..." });
                const settleResult = await waitForSettlement({
                  fetchLatest: fetchSubscription,
                  isSettled: (data) => !!data && !data.subscription?.pendingCycleTransition?.orderId,
                  intervalMs: 3000,
                  timeoutMs: 30000,
                });
                if (pollCancelledRef.current) return;
                setPaymentInProgress(false);
                if (settleResult.settled) {
                  setCheckoutJourneyState("success");
                  setMessage({ type: "success", text: "You're now on annual billing!" });
                  setTimeout(() => {
                    setCheckoutJourneyState(null);
                    setShowConfetti(true);
                    setTimeout(() => setShowConfetti(false), 3500);
                  }, 2000);
                } else {
                  setCheckoutJourneyState(null);
                  setMessage({ type: "warning", text: "Payment confirmed. Your annual plan will activate shortly — refresh if it doesn't appear." });
                }
              },
              modal: {
                ondismiss: function () {
                  setMessage({ type: "warning", text: "Payment cancelled. Still on your current monthly plan." });
                  setPaymentInProgress(false);
                  setCheckoutJourneyState(null);
                },
              },
            });
          }, 500);
        } catch (err) {
          setProcessing(false);
          const apiError = err.response?.data;
          setMessage({
            type: "error",
            text: apiError?.code === "DOWNGRADE_INELIGIBLE"
              ? apiError.error
              : (apiError?.error || "Failed to start the annual switch. Please try again."),
          });
        }
        return;
      }

      // Plan upgrade — Order already created at preview; just open Razorpay
      if (checkoutData.type === "plan_upgrade") {
        const details = checkoutData.paymentDetails;
        setCheckoutData(null);
        setProcessing(false);
        if (details && razorpayLoaded) {
          setCheckoutJourneyState('preparing_payment');
          setTimeout(() => {
            openRazorpay(details);
          }, 500);
        } else {
          setMessage({ type: "error", text: "Payment could not be started. Please try again." });
        }
        return;
      }

      // Plan downgrade — schedule at cycle end, no payment. carryForward
      // sends the user's final (possibly edited-down) carry-forward
      // quantities, built from carryForwardCatalog (the full addon set at
      // preview time) so an addon reduced to 0 is still explicitly included
      // as quantity 0, not silently omitted (omission would default it back
      // to full survival on the backend).
      if (checkoutData.type === "plan_downgrade") {
        // Safety net — the Schedule button is already disabled for this case,
        // but never let a hard blocker (MANUAL_ACTION/BLOCKING) reach the
        // backend regardless of how this got triggered.
        if (checkoutData.hasHardBlocker) {
          setProcessing(false);
          setMessage({ type: "error", text: "Resolve the compatibility issues above before scheduling this downgrade." });
          return;
        }

        const currentQuantities = {};
        (checkoutData.carryForwardCatalog || []).forEach((a) => { currentQuantities[a.addonKey] = 0; });
        (checkoutData.carriedForwardAddons || []).forEach((a) => { currentQuantities[a.addonKey] = a.quantity; });
        const carryForward = Object.entries(currentQuantities).map(([addonKey, quantity]) => ({ addonKey, quantity }));

        // Resolution add-ons (e.g. the seats recommended by an AUTO_FIXABLE
        // compatibility check) — sent the same way upgrade sends new
        // purchases: {key, quantity} pairs.
        const resolutionAddonsPayload = Object.entries(checkoutData.resolutionAddons || {})
          .filter(([, qty]) => qty > 0)
          .map(([key, quantity]) => ({ key, quantity }));

        await updateSubscription({
          planId: checkoutData.plan.id,
          billingCycle: checkoutData.billingCycle,
          userCount: checkoutData.userCount,
          carryForward,
          addons: resolutionAddonsPayload,
          // Task B: the user already saw and confirmed the "your scheduled
          // cancellation will be cancelled" warning in THIS same modal
          // (pendingCancellationWillClear), so no separate confirm step is
          // needed here — just opt in.
          ...(checkoutData.pendingCancellationWillClear ? { reactivateAndProceed: true } : {}),
        });
        setCheckoutData(null);
        await fetchSubscription();
        const _pd = checkoutData.periodEnd ? new Date(checkoutData.periodEnd) : null;
        const dateStr = (_pd && _pd.getFullYear() >= 2020)
          ? _pd.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
          : "end of billing period";
        setMessage({
          type: "success",
          text: `Downgrade to ${checkoutData.plan.name || checkoutData.plan.id} scheduled for ${dateStr}.`,
        });
        return;
      }

      // Addon removal — scheduled for cycle end, no payment
      if (checkoutData.type === "addon_removal") {
        const result = await subscriptionAPI.scheduleAddonRemoval({
          addonKey: checkoutData.addonKey,
          quantity: 1,
          billingCycle: checkoutData.billingCycle,
        });
        const effectiveDate = new Date(result.data.effectiveAt).toLocaleDateString('en-IN', {
          day: 'numeric', month: 'short', year: 'numeric',
        });
        setCheckoutData(null);
        await fetchSubscription();
        setMessage({ type: 'success', text: `Removal scheduled for ${effectiveDate}. You'll keep access until then.` });
        return;
      }

      // Addon-only change on an already-active subscription
      if (checkoutData.type === "addon_change") {
        const isExistingActiveSub = subscription?.subscription?.isPaymentConfirmed;
        const isSamePlan = checkoutData?.plan?.id === subscription?.subscription?.planName;
        if (isExistingActiveSub && isSamePlan) {
          const additions = checkoutData.addonChanges.filter((c) => c.delta > 0);
          const removals = checkoutData.addonChanges.filter((c) => c.delta < 0);

          // Don't allow mixed adds and removes in one checkout action
          if (additions.length > 0 && removals.length > 0) {
            setMessage({ type: "error", text: "Please add and remove add-ons separately." });
            setProcessing(false);
            return;
          }

          // Handle removals — scheduled for cycle end, no payment needed
          if (removals.length > 0) {
            for (const change of removals) {
              await subscriptionAPI.scheduleAddonRemoval({
                addonKey: change.addonKey,
                quantity: Math.abs(change.delta),
                billingCycle: checkoutData.billingCycle,
              });
            }
            setCheckoutData(null);
            setSelectedAddons({});
            await fetchSubscription();
            setMessage({
              type: "success",
              text: `Add-on removal scheduled. You'll keep access until the end of your current billing period.`,
            });
            return;
          }

          // Handle additions — prorated Order-based checkout
          if (additions.length > 1) {
            setMessage({ type: "error", text: "Please purchase one add-on at a time." });
            setProcessing(false);
            return;
          }

          const change = additions[0];
          const result = await subscriptionAPI.initiateAddonPurchase({
            addonKey: change.addonKey,
            quantity: change.delta,
            billingCycle: checkoutData.billingCycle,
          });

          const { paymentDetails } = result.data;
          setCheckoutData(null);
          setSelectedAddons({});
          setProcessing(false);
          setPaymentInProgress(true);
          setCheckoutJourneyState('preparing_payment');

          setTimeout(() => {
            openCheckout({
              ...paymentDetails,
              handler: async function () {
                setCheckoutJourneyState('confirming_payment');
                setMessage({ type: "success", text: "Payment received! Add-on is being activated..." });
                // Wait for the webhook to clear pendingAddonAddition (settlement).
                const result = await waitForSettlement({
                  fetchLatest: fetchSubscription,
                  isSettled: (data) => !!data && !data.subscription?.pendingAddonAddition?.orderId,
                  intervalMs: 3000,
                  timeoutMs: 30000,
                });
                if (pollCancelledRef.current) return;
                setPaymentInProgress(false);
                if (result.settled) {
                  setCheckoutJourneyState('success');
                  setMessage({ type: "success", text: "Add-on activated successfully!" });
                  setTimeout(() => {
                    setCheckoutJourneyState(null);
                    setShowConfetti(true);
                    setTimeout(() => setShowConfetti(false), 3500);
                  }, 2000);
                } else {
                  setCheckoutJourneyState(null);
                  setMessage({ type: "warning", text: "Payment confirmed. Add-on will be activated shortly — refresh if it doesn't appear." });
                }
              },
              modal: {
                ondismiss: function () {
                  setMessage({ type: "warning", text: "Payment cancelled. Add-on not added." });
                  setPaymentInProgress(false);
                  setCheckoutJourneyState(null);
                },
              },
            });
          }, 500);
          return;
        }
      }

      // Charge-at-Will requires the Razorpay customer to have both email and
      // phone, but signup only ever collects one — gate any not-yet-paid
      // moment that will call createSubscription/updateSubscription's CAW
      // acquisition path: either no Subscription document exists yet (fresh
      // signup), OR one already exists but isPaymentConfirmed is still false
      // (e.g. "Complete Payment" on a subscription left pending from an
      // earlier attempt — PlanCard.jsx's isPendingPayment() case). Checking
      // only "!subscription?.subscription" missed that second case entirely,
      // since a pending-payment subscription document already exists by the
      // time this fires. Does not gate upgrades/downgrades/add-ons on an
      // already-paying org (isPaymentConfirmed: true), which don't need this
      // and shouldn't gain new friction. Preserves checkoutData/plan
      // selection exactly as-is; the modal's Save & Continue simply
      // re-invokes this same function.
      if (!subscription?.subscription?.isPaymentConfirmed && (!effectiveUser?.email || !effectiveUser?.phone)) {
        setProcessing(false);
        if (preopenedPopup && !preopenedPopup.closed) preopenedPopup.close();
        setShowBillingProfileModal(true);
        return;
      }

      const addonsPayload = checkoutData.selectedAddonsList.map((a) => ({
        addonKey: a.key,
        quantity: a.quantity,
      }));

      const planData = {
        planId: checkoutData.plan.id,
        billingCycle: checkoutData.billingCycle,
        addons: addonsPayload,
        ...(checkoutData.appliedCoupon ? { couponCode: checkoutData.appliedCoupon.code } : {}),
        mandateMethod,
        // Referral code is NOT sent here — it's applied immediately via its
        // own Apply button (handleApplyReferral), not folded into checkout
        // submission. See the state declaration above for why.
      };

      const response = subscription?.subscription
        ? await updateSubscription(planData)
        : await createSubscription(planData);

      // A3 fix — checkout has now actually been submitted with this coupon;
      // clear the pre-checkout persistence so a later fresh signup attempt
      // (e.g. a different org, or after this one completes) doesn't silently
      // inherit a stale code from sessionStorage.
      try { sessionStorage.removeItem(PENDING_COUPON_STORAGE_KEY); } catch { /* non-fatal */ }

      // A2 (found via live QA — plan-card price drift, ₹650 → ₹637 → ₹342 for
      // the same Business card): selectedAddons USED TO BE a single flat map
      // keyed only by addonKey, shared across every plan card — an addon key
      // existing on more than one plan's catalog let a leftover quantity
      // chosen on one card's panel silently survive into another card's
      // price math. Now genuinely scoped per plan (see its own declaration
      // comment), so this can no longer leak across cards either way — kept
      // as a full reset anyway since checkout has just completed and every
      // card's in-progress configuration is stale regardless.
      setSelectedAddons({});
      setCheckoutData(null);
      lastMandateMethodRef.current = null;

      if (response.paymentDetails && razorpayLoaded) {
        if (preopenedPopup && !preopenedPopup.closed) preopenedPopup.close();
        setCheckoutJourneyState('preparing_payment');
        setTimeout(() => {
          openRazorpay(response.paymentDetails);
        }, 500);
      } else if (response.registrationLink?.shortUrl) {
        openRegistrationLinkJourney(response.registrationLink, preopenedPopup);
      } else if (response.scheduled) {
        if (preopenedPopup && !preopenedPopup.closed) preopenedPopup.close();
        setMessage({ type: "success", text: response.message || "Change scheduled successfully!" });
      } else {
        if (preopenedPopup && !preopenedPopup.closed) preopenedPopup.close();
        setMessage({ type: "success", text: response.message || "Subscription updated successfully!" });
      }
    } catch (error) {
      if (preopenedPopup && !preopenedPopup.closed) preopenedPopup.close();
      const data = error.response?.data;
      let text = "Failed to update subscription";
      if (error.response?.status === 403) {
        text = "Only organization admins can manage subscriptions.";
      } else if (data?.code === "RAZORPAY_ERROR") {
        text = `Payment gateway error: ${data.error}. Please contact support.`;
      } else if (data?.error) {
        text = data.error;
      }
      setMessage({ type: "error", text });
    } finally {
      setProcessing(false);
    }
  };

  // B2 fix (found via live QA) — explicit "Resume Payment" action for a
  // pending-but-not-currently-active CAW mandate (PaymentStatusAlert's own
  // banner, not the full-screen journey). Re-enters the SAME backend branch
  // already exercised today by "pick a different plan while pending"
  // (updateSubscription's !isPaymentConfirmed re-entry, verified safe:
  // recomputes recurring baseline correctly, guards against duplicate
  // BillingEvents/reward reservations) — deliberately NOT the legacy
  // retryPayment endpoint, which is Order/classic-Subscriptions-only and
  // not CAW-aware at all. Must explicitly pass the CURRENT plan/billingCycle/
  // add-ons/coupon so nothing is silently dropped — omitting couponCode here
  // would overwrite subscription.appliedCoupon to null on the backend.
  const handleResumePayment = async (mandateMethod) => {
    const sub = subscription?.subscription;
    if (!sub) return;

    if (!mandateMethod) {
      setMethodPrompt({ kind: "resume" });
      return;
    }

    // Same popup-blocker fix as handleConfirmCheckout — open the tab
    // synchronously here, before the first await, not inside
    // openRegistrationLinkJourney's setTimeout.
    const preopenedPopup = openBlankRegistrationTab();

    setProcessing(true);
    setMessage("");
    try {
      // Ask Razorpay before opening a second checkout. Without this, a payment that DID go through
      // but was never acknowledged locally (tab closed before verifyPayment could post back, or no
      // webhook) looked unpaid here - and this button cheerfully charged for it again.
      try {
        const recon = await subscriptionAPI.reconcilePayment();
        if (recon?.data?.reconciled || recon?.data?.alreadyConfirmed) {
          if (preopenedPopup && !preopenedPopup.closed) preopenedPopup.close();
          await fetchSubscription();
          setCheckoutJourneyState('success');
          setMessage({ type: "success", text: "Payment received - your subscription is active." });
          setProcessing(false);
          setTimeout(() => window.location.reload(), 2000);
          return;
        }
      } catch {
        // Best-effort: a reconcile failure must not block a genuine retry.
      }

      const planData = {
        planId: sub.planName,
        billingCycle: sub.billingCycle,
        addons: (sub.activeAddons || []).map((a) => ({ addonKey: a.addonKey, quantity: a.quantity })),
        ...(sub.appliedCoupon?.code ? { couponCode: sub.appliedCoupon.code } : {}),
        mandateMethod,
      };
      const response = await updateSubscription(planData);
      if (response.registrationLink?.shortUrl) {
        openRegistrationLinkJourney(response.registrationLink, preopenedPopup);
      } else {
        if (preopenedPopup && !preopenedPopup.closed) preopenedPopup.close();
        setMessage({ type: "error", text: "Could not resume payment. Please try again." });
      }
    } catch (error) {
      if (preopenedPopup && !preopenedPopup.closed) preopenedPopup.close();
      setMessage({ type: "error", text: error.response?.data?.error || "Could not resume payment. Please try again." });
    } finally {
      setProcessing(false);
    }
  };

  // C1 — step 1 of removing the coupon on this (already-paid) subscription:
  // fetch a backend-computed preview of the before/after recurring amount
  // (never guessed client-side) and show it as an explicit confirmation
  // before anything is actually removed.
  const handleRemoveCouponClick = async () => {
    setCouponActionLoading(true);
    setCouponActionError("");
    try {
      const res = await subscriptionAPI.previewRemoveCoupon();
      setCouponRemovePreview(res.data);
    } catch (error) {
      setCouponActionError(error.response?.data?.error || "Could not check this coupon's removal impact. Please try again.");
    } finally {
      setCouponActionLoading(false);
    }
  };

  // C1 — step 2: the user has seen the real before/after amount and
  // explicitly confirmed. Backend recomputes the recurring baseline and
  // preserves historical redemption; this just refetches to reflect the new
  // state everywhere (Billing sidebar, plan cards, timeline all read
  // straight off the refetched subscription — no separate frontend pricing).
  const handleConfirmRemoveCoupon = async () => {
    setCouponActionLoading(true);
    setCouponActionError("");
    try {
      await subscriptionAPI.removeAppliedCoupon();
      await fetchSubscription();
      setCouponRemovePreview(null);
      setMessage({ type: "success", text: "Coupon removed." });
    } catch (error) {
      setCouponActionError(error.response?.data?.error || "Could not remove coupon. Please try again.");
    } finally {
      setCouponActionLoading(false);
    }
  };

  // C1 — step 1 of replacing the coupon: validate the new code against this
  // subscription and fetch a backend-computed preview (before/after amount,
  // whether it would even affect recurring billing at all) before anything
  // is actually attached.
  const handlePreviewReplaceCoupon = async () => {
    const code = replaceCouponInput.trim();
    if (!code) return;
    setCouponActionLoading(true);
    setCouponActionError("");
    try {
      const res = await subscriptionAPI.previewReplaceCoupon({ couponCode: code });
      setCouponReplacePreview(res.data);
    } catch (error) {
      setCouponActionError(error.response?.data?.error || "Invalid coupon code");
    } finally {
      setCouponActionLoading(false);
    }
  };

  // C1 — step 2: commit the previewed replacement.
  const handleConfirmReplaceCoupon = async () => {
    setCouponActionLoading(true);
    setCouponActionError("");
    try {
      await subscriptionAPI.replaceAppliedCoupon({ couponCode: couponReplacePreview.couponCode });
      await fetchSubscription();
      setReplaceCouponInput("");
      setShowCouponReplaceInput(false);
      setCouponReplacePreview(null);
      setMessage({ type: "success", text: "Coupon applied." });
    } catch (error) {
      setCouponActionError(error.response?.data?.error || "Could not apply coupon. Please try again.");
    } finally {
      setCouponActionLoading(false);
    }
  };

  // Waits for the backend to settle the payment (see waitForSettlement.js —
  // never trusts local state, only the freshly-fetched value each time).
  const startPolling = async () => {
    const result = await waitForSettlement({
      fetchLatest: fetchSubscription,
      isSettled: (data) => !!data?.subscription?.isPaymentConfirmed,
      intervalMs: 5000,
      timeoutMs: 60000,
    });
    if (pollCancelledRef.current) return;
    setPaymentInProgress(false);
    if (result.settled) {
      setCheckoutJourneyState('success');
      setMessage({ type: "success", text: "Payment confirmed! Subscription updated successfully." });
      setTimeout(() => {
        setCheckoutJourneyState(null);
        window.location.reload();
      }, 2000);
    } else {
      setCheckoutJourneyState(null);
      setMessage({
        type: "warning",
        text: "Payment confirmation taking longer than expected. Your subscription will be activated once the payment is processed. You can refresh the page to check status.",
      });
    }
  };

  // Polls for CAW mandate confirmation after opening the Registration Link
  // in a new tab (see the redirect comment above). Longer timeout than
  // startPolling's Order-based 60s — a mandate approval on Razorpay's hosted
  // page can reasonably take a few minutes, unlike an already-open Checkout
  // JS modal. Never trusts local state, only the freshly-fetched value each
  // time (same discipline as startPolling/waitForSettlement.js).
  const startMandatePolling = async (popupWindow) => {
    // Ask Razorpay directly on each tick, then read our own state — the same
    // reconcile-then-fetch the PENDING_MANDATE auto-detect effect uses. The
    // hosted Registration Link has no synchronous verify callback, so polling
    // fetchSubscription alone only ever re-reads what the webhook wrote; if the
    // webhook never arrives (e.g. it can't reach the backend in test/local), a
    // mandate that WAS approved on Razorpay's page stays "pending" here and the
    // "Confirming your mandate..." overlay spins the full timeout. Reconciling
    // pulls the real status from Razorpay instead of waiting on a webhook.
    const reconcileThenFetch = async () => {
      try {
        await subscriptionAPI.reconcilePayment();
      } catch {
        // Best-effort — fall through to the plain read.
      }
      return fetchSubscription();
    };

    // Race the real settlement poll against the customer closing the
    // Razorpay tab — found via live QA: closing that tab used to leave the
    // full-screen "Confirming your mandate..." overlay up for the entire
    // 5-minute timeout with no indication anything was wrong, since the poll
    // itself has no way to know the tab is gone until it finally times out.
    const outcome = await Promise.race([
      waitForSettlement({
        fetchLatest: reconcileThenFetch,
        isSettled: (data) => !!data?.subscription?.isPaymentConfirmed,
        intervalMs: 5000,
        timeoutMs: 5 * 60 * 1000,
      }).then((result) => ({ kind: "settlement", result })),
      waitForPopupClose(popupWindow).then(() => ({ kind: "closed" })),
    ]);
    if (pollCancelledRef.current) return;

    if (outcome.kind === "closed") {
      // The tab closing doesn't itself prove the mandate wasn't approved —
      // check once more immediately in case it was approved a moment before the
      // tab closed. Reconcile against Razorpay rather than reading local state,
      // since the confirming webhook may never have reached the backend.
      const latest = await reconcileThenFetch();
      if (pollCancelledRef.current) return;
      if (latest?.subscription?.isPaymentConfirmed) {
        setCheckoutJourneyState('success');
        setMessage({ type: "success", text: "Payment confirmed! Subscription updated successfully." });
        setTimeout(() => {
          setCheckoutJourneyState(null);
          window.location.reload();
        }, 2000);
        return;
      }
      setCheckoutJourneyState(null);
      const retry = await confirmRetryAfterTabClosed();
      if (retry) {
        handleResumePayment();
      } else {
        setMessage({
          type: "warning",
          text: "Payment setup wasn't completed. You can resume it anytime from here.",
        });
      }
      return;
    }

    const result = outcome.result;
    if (result.settled) {
      setCheckoutJourneyState('success');
      setMessage({ type: "success", text: "Payment confirmed! Subscription updated successfully." });
      setTimeout(() => {
        setCheckoutJourneyState(null);
        window.location.reload();
      }, 2000);
    } else {
      // Not an error — the customer may simply still be on Razorpay's page,
      // or closed that tab without finishing. Falls back to the existing
      // pageshow/visibilitychange listener (still useful when it DOES fire)
      // rather than blocking on this poll forever.
      setCheckoutJourneyState(null);
      setMessage({
        type: "warning",
        text: "Still waiting for mandate approval. This will update automatically once you complete it on Razorpay's page, or you can refresh to check status.",
      });
    }
  };

  const handleRetryPayment = async () => {
    if (!subscription?.subscription) return;
    setProcessing(true);
    setMessage("");
    try {
      const response = await subscriptionAPI.retryPayment(subscription.subscription._id);
      if (response.data.paymentDetails && razorpayLoaded) {
        openRazorpay(response.data.paymentDetails);
      } else {
        setMessage({ type: "error", text: "Unable to create retry payment session. Please try again." });
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: error.response?.data?.error || "Failed to retry payment. Please try again.",
      });
    } finally {
      setProcessing(false);
    }
  };

  const getVisiblePlans = () => {
    return planStructure.filter((plan) => {
      if (plan.trial) {
        if (!subscription?.subscription) return true;
        if (subscription.subscription.trialUsed) return false;
        if (subscription.subscription.isPaymentConfirmed) return false;
        return subscription.subscription.isTrialActive;
      }
      return true;
    });
  };

  if (loading || !plansLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-600 text-sm">Loading plans...</p>
        </div>
      </div>
    );
  }

  if (!error && plans.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center p-6 bg-white rounded-lg shadow-md">
          <div className="text-gray-900 mb-2 font-semibold">No plans available</div>
          <p className="text-gray-600 text-sm">
            No subscription plans are currently published. Please contact support.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center p-6 bg-white rounded-lg shadow-md">
          <div className="text-red-600 mb-2 font-semibold">Error loading plans</div>
          <p className="text-gray-600 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <SuccessConfetti isExploding={showConfetti} />

      {/* B2 fix (found via live QA): this used to also render whenever
          deriveSubscriptionUIState(...) === PENDING_MANDATE, REGARDLESS of
          whether checkoutJourneyState was set — a purely persisted fact
          ("this org has a pending mandate," possibly from hours/days ago,
          possibly from an entirely unrelated abandoned attempt) doesn't mean
          the user is currently looking at Razorpay in this session. That
          fallback let this full-screen, opaque "Confirming your mandate..."
          overlay render on top of a COMPLETELY UNRELATED Order/Checkout.js
          flow (an add-on purchase, an upgrade) if the org happened to have
          any old pending mandate sitting around — a real state-machine bug,
          not a display quirk. Now this screen only ever renders for an
          ACTUAL active journey the user initiated in this exact session
          (checkoutJourneyState truthy). A persisted-but-not-currently-active
          pending mandate is instead surfaced by PaymentStatusAlert's own
          non-blocking banner further down the page, with an explicit Resume
          Payment action — never this full-screen "in progress" claim. */}
      {checkoutJourneyState && (
        <CheckoutJourneyScreen
          state={checkoutJourneyState}
        />
      )}

      <PaymentMethodModal
        isOpen={!!methodPrompt}
        onClose={() => setMethodPrompt(null)}
        // Runs inside this click, so the registration tab pre-open in both
        // handlers still counts as a user gesture (popup-blocker fix).
        onSelect={(method) => {
          const prompt = methodPrompt;
          setMethodPrompt(null);
          lastMandateMethodRef.current = method;
          if (prompt?.kind === "resume") handleResumePayment(method);
          else handleConfirmCheckout(undefined, method);
        }}
      />

      <CheckoutSummaryModal
        checkoutData={checkoutData}
        // Explicit no-arg call — handleConfirmCheckout now takes an optional
        // userOverride param (stale-closure fix above); passing the bare
        // function reference here would let the button's click event leak
        // through as that argument instead.
        onConfirm={() => handleConfirmCheckout()}
        onCancel={() => { lastMandateMethodRef.current = null; setCheckoutData(null); }}
        // Only a first payment creates a mandate; paying orgs already have one.
        onCarryForwardChange={checkoutData?.type === "plan_downgrade" ? handleDowngradeCarryForwardChange : handleCarryForwardChange}
        onDowngradeResolutionChange={handleDowngradeResolutionChange}
        transitionAddonChoices={transitionAddonChoices}
        onTransitionAddonChoiceChange={handleTransitionAddonChoiceChange}
        processing={processing}
      />

      <BillingProfileModal
        show={showBillingProfileModal}
        missingEmail={!currentUser?.email}
        missingPhone={!currentUser?.phone}
        onSaved={(updatedUser) => {
          setCurrentUser(updatedUser);
          setShowBillingProfileModal(false);
          // Original plan/add-on/coupon selection (checkoutData) was never
          // cleared, so re-running the exact same confirm handler continues
          // the original Subscribe click — no second click required. Pass
          // updatedUser explicitly (stale-closure fix — see
          // handleConfirmCheckout's own comment) rather than relying on
          // setCurrentUser above having already re-rendered by this point.
          handleConfirmCheckout(updatedUser);
        }}
        onClose={() => setShowBillingProfileModal(false)}
      />

      <BillingCalendarModal isOpen={showBillingCalendar} onClose={() => setShowBillingCalendar(false)} />

      {/* In-app replacement for window.confirm() — the browser's native
          dialog looked like an error/security prompt, not part of the
          product. Same modal shell used elsewhere on this page (rounded-2xl
          card, centered, backdrop). */}
      {tabClosedPrompt && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[200000] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-6 h-6 text-amber-600" />
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-1.5">Payment incomplete</h3>
              <p className="text-sm text-gray-500 mb-6">
                The Razorpay tab was closed before your subscription could be activated. Would you like to try again?
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => { tabClosedPrompt.resolve(false); setTabClosedPrompt(null); }}
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Not Now
                </button>
                <button
                  onClick={() => { tabClosedPrompt.resolve(true); setTabClosedPrompt(null); }}
                  className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                  style={{ background: "var(--btn-primary, #0085FF)" }}
                >
                  Try Again
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div>
        <PaymentStatusAlert
          subscription={subscription?.subscription}
          onRetryPayment={handleRetryPayment}
          onResumePayment={() => handleResumePayment()}
          onChangePlan={() => document.getElementById('plan-cards-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          processing={processing || paymentInProgress}
        />

        <CurrentSubscriptionInfo
          subscription={subscription.subscription}
          allPlanAddons={planAddons}
          billingCycle={billingCycle}
        />

        {subscription?.subscription?.isPaymentConfirmed && !subscription?.subscription?.isTrialActive && (
          <div className="mb-6">
            {/* Show cancel button only when no cancellation and no pending downgrade */}
            {!subscription?.subscription?.cancelAtPeriodEnd && !hasValidPendingUpdate(subscription?.subscription) && (
              <button
                onClick={() => setShowCancelModal(true)}
                className="inline-flex items-center px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 hover:border-red-400 transition-all duration-200 font-medium text-sm"
                disabled={processing || paymentInProgress}
              >
                Cancel Subscription
              </button>
            )}
            {/* Show cancellation banner only for actual cancellations (no pendingUpdate means it's not a downgrade) */}
            {subscription?.subscription?.cancelAtPeriodEnd && !hasValidPendingUpdate(subscription?.subscription) && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-yellow-900 mb-1">Cancellation Scheduled</h4>
                    <p className="text-sm text-yellow-800">
                      Your subscription will be cancelled on{" "}
                      <strong>
                        {(() => {
                          const d = subscription.subscription.currentPeriodEnd ? new Date(subscription.subscription.currentPeriodEnd) : null;
                          return d && d.getFullYear() >= 2020
                            ? d.toLocaleDateString("en-IN", { month: "long", day: "numeric", year: "numeric" })
                            : "the end of your billing period";
                        })()}
                      </strong>
                      . You will continue to have access to all features until then.
                    </p>
                    <button
                      onClick={handleUndoCancellation}
                      disabled={processing || paymentInProgress}
                      className="mt-2 text-sm font-medium text-yellow-900 underline hover:text-yellow-700 disabled:opacity-50"
                    >
                      Undo Cancellation
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {message && (
          <div className={`mb-6 p-4 rounded-lg border-l-4 ${
            message.type === "success" ? "bg-green-50 text-green-800 border-green-500"
            : message.type === "warning" ? "bg-yellow-50 text-yellow-800 border-yellow-500"
            : "bg-red-50 text-red-800 border-red-500"
          }`}>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm font-medium">{message.text}</span>
            </div>
          </div>
        )}

        {/* Lives in the shared Settings header strip (see Settings.jsx's
            #settings-header-actions target), not centered above the plan
            cards — this is a page-level action, not part of the pricing
            content itself. */}
        {subscription?.subscription && document.getElementById('settings-header-actions') &&
          createPortal(
            <button
              onClick={() => setShowBillingCalendar(true)}
              className="inline-flex items-center gap-1.5 h-[38px] px-4 rounded-full bg-[#0085FF] text-xs font-semibold text-white hover:bg-blue-600 transition-colors whitespace-nowrap"
            >
              <CalendarIcon className="w-3.5 h-3.5" /> View Billing Calendar
            </button>,
            document.getElementById('settings-header-actions')
          )}

        <div className="text-center mb-8 mt-12">
          <h1 className="text-[32px] font-bold text-gray-900 tracking-[-0.02em] mb-2">Choose Your Plan</h1>
          <p className="text-gray-500 text-sm max-w-2xl mx-auto mb-6">
            Flexible pricing for teams of all sizes. Start with a free trial or scale with annual savings.
          </p>

          <div className="flex items-center justify-center gap-4 mb-6">
            <div className="flex items-center gap-3">
              <span className={`text-sm font-medium transition-colors ${billingCycle === "monthly" ? "text-gray-900" : "text-gray-400"}`}>
                Monthly
              </span>
              <button
                onClick={() => {
                  const next = billingCycle === "monthly" ? "yearly" : "monthly";
                  setBillingCycle(next);
                  // Re-fetch add-ons at new cycle for any already-expanded plan
                  if (expandedPlan) {
                    subscriptionAPI.getAddonsForPlan(expandedPlan, next)
                      .then((res) => setPlanAddons((prev) => ({ ...prev, [expandedPlan]: res.data.addons || [] })))
                      .catch(() => {});
                  }
                }}
                className="relative inline-flex h-7 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2"
                style={{ background: billingCycle === "yearly" ? "var(--btn-primary)" : "#D1D5DB" }}
                disabled={processing || paymentInProgress}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform ${billingCycle === "yearly" ? "translate-x-8" : "translate-x-1"}`} />
              </button>
              <span className={`text-sm font-medium transition-colors ${billingCycle === "yearly" ? "text-gray-900" : "text-gray-400"}`}>
                Annual<span className="ml-1 text-xs text-green-600 font-semibold">(Save 20%)</span>
              </span>
            </div>
          </div>

          {/* Tied directly to whether the Trial card is actually in the grid
              below (getVisiblePlans' own trial rule), not a separately
              re-derived trialUsed/isPaymentConfirmed check — those two used
              to drift apart (e.g. a subscription record exists, trial not
              used, not paid, but isTrialActive is false), showing this badge
              while no Trial card was actually on screen to back it up. */}
          {getVisiblePlans().some((p) => p.trial) && (
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-green-50 to-emerald-50 text-green-700 px-4 py-2 rounded-lg border border-green-200 text-sm font-medium mb-6">
              <Gift className="w-4 h-4" />
              7-Day Free Trial Available
            </div>
          )}

          {/* Trust strip — real, standing claims only (no fabricated
              guarantees like "money-back"): the plan comparison and payment
              flow below are genuinely backed by these three things, and
              a pricing page with nothing here reads as a placeholder. */}
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-xs text-gray-500 font-medium">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-gray-400" /> Secure payments via Razorpay
            </span>
            <span className="inline-flex items-center gap-1.5">
              <RotateCcw className="w-3.5 h-3.5 text-gray-400" /> Cancel anytime
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ReceiptText className="w-3.5 h-3.5 text-gray-400" /> GST invoice on every payment
            </span>
          </div>
        </div>

        <div className="my-12" id="plan-cards-grid">
          <div className={`grid gap-4 ${
            getVisiblePlans().length === 3 ? "md:grid-cols-3" : "md:grid-cols-2 lg:grid-cols-4"
          }`}>
            {getVisiblePlans().map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                currentSubscription={subscription?.subscription}
                billingCycle={billingCycle}
                onSelectPlan={handlePlanSelection}
                /* Bug found via live QA (Aug 2026): cancelAtPeriodEnd used to
                   be OR'd into `processing` — but PlanCard.jsx's button
                   renders a literal spinner + "Processing..." label
                   whenever `processing` is truthy, with no regard for
                   `action`. cancelAtPeriodEnd is a PERMANENT flag (stays
                   true for the rest of the billing term, not a transient
                   in-flight request), so every card got stuck showing
                   "Processing..." forever after a successful cancellation —
                   a real, live-blocking regression, not the same root cause
                   as the earlier CAW razorpay.subscriptions.cancel() bug
                   (verified separately, traced to this exact prop wiring
                   instead). `processing` must only ever reflect an ACTUAL
                   in-flight request. A pending cancellation is a `locked`
                   concept (this codebase's own existing "disabled without
                   spinner" pattern, see PlanCard.jsx's `locked` prop
                   comment) — folded in below instead. */
                processing={processing || paymentInProgress}
                /* Phase 3 full-context-switch fix: a monthly-only scheduled
                   change (pendingUpdate) must never lock/target-mark cards
                   while viewing Annual — that pending change belongs to the
                   committed monthly cycle, not to a fresh annual purchase
                   context. Gated on billingCycle matching the subscription's
                   OWN committed cycle, exactly like isCurrentPlan() already
                   does in PlanCard.jsx. cancelAtPeriodEnd is cycle-agnostic
                   (a cancellation freezes billing changes regardless of
                   which cycle is being viewed), so it's OR'd in unconditionally. */
                locked={
                  (billingCycle === subscription?.subscription?.billingCycle && hasValidPendingUpdate(subscription?.subscription)) ||
                  !!subscription?.subscription?.cancelAtPeriodEnd
                }
                isScheduledTarget={billingCycle === subscription?.subscription?.billingCycle && hasValidPendingUpdate(subscription?.subscription) && subscription?.subscription?.pendingUpdate?.planName === plan.id}
                isExpanded={expandedPlan === plan.id}
                onExpand={() => handleExpandPlan(plan.id)}
                addons={planAddons[plan.id]}
                allPlanAddons={planAddons}
                // Scoped to THIS plan's own key — see selectedAddons'
                // declaration comment for why a shared object leaked
                // Starter's selections into Growth's card.
                selectedAddons={selectedAddons[plan.id] || {}}
                onAddonChange={(key, qty) =>
                  setSelectedAddons((prev) => ({ ...prev, [plan.id]: { ...(prev[plan.id] || {}), [key]: qty } }))
                }
                addonPurchaseCycle={addonPurchaseCycle[plan.id] || null}
                onAddonCycleChange={(cyc) =>
                  setAddonPurchaseCycle((prev) => ({ ...prev, [plan.id]: cyc }))
                }
                onRemoveAddon={handleRemoveAddon}
                // Found via live QA: for a paying org (couponAppliesAtCheckout
                // false), this always passed null — so an upgrade-target card
                // never previewed the org's OWN already-attached, still-recurring
                // coupon (e.g. Business showing ₹650 with no discount on the
                // card, while the upgrade dialog correctly priced it at ₹637 via
                // the backend preview, which does read fullRulesSnapshot). Falls
                // back to the subscription's own persisted rules whenever that
                // coupon is still eligible for future billing — same eligibility
                // question isCouponStillRecurring already answers for the
                // current-plan card's own snapshot branch, just extended to
                // every OTHER card so upgrade previews stop silently omitting a
                // discount the backend will actually apply.
                couponRules={
                  couponAppliesAtCheckout && appliedCoupon?.valid
                    ? appliedCoupon.rules
                    : (subscription?.subscription?.appliedCoupon?.fullRulesSnapshot && isCouponStillRecurring(subscription.subscription.appliedCoupon))
                    ? subscription.subscription.appliedCoupon.fullRulesSnapshot
                    : null
                }
              />
            ))}
          </div>
        </div>

        {/* Coupon apply lives here, outside checkout, so the discount ripples
            across every plan/add-on card below BEFORE the customer commits to
            a plan — more enticing than only revealing it at checkout. */}
        {/* One consistent "coupon area" with three states, driven by the
            subscription's OWN snapshot as source of truth:
             1. Subscription already has a coupon attached → status banner
                (never show "Have a coupon code?" — that would contradict it).
             2. A coupon is being previewed for a new subscription → preview
                banner with card discounts.
             3. No coupon → the entry box.
            State 1 uses currentSubscription.appliedCoupon so it reflects the
            real subscription state everywhere, and extends naturally to the
            future "coupon attached + previewing upgrade/downgrade" case. */}
        {showCouponWidget && (
          <div className="max-w-md mx-auto mb-6">
            {/* C1 redesign (found via live QA — the stale-banner contradiction
                bug): a PAID subscriber now has ONE authoritative coupon
                surface — subscription.subscription.appliedCoupon, with
                explicit Remove/Replace, both backed by a real backend preview
                before anything commits. The old pre-checkout "Have a coupon
                code?" box (appliedCoupon?.valid / input box below) is now
                ONLY reachable pre-payment — it can no longer render for an
                already-paying org (the defensive cleanup effect above also
                clears any stale leftover state from before this fix). */}
            {subscription?.subscription?.isPaymentConfirmed ? (
              <>
                {subscription?.subscription?.appliedCoupon?.code ? (
                  <>
                    {isCouponStillRecurring(subscription.subscription.appliedCoupon) ? (
                      <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-green-800 flex items-center gap-1">
                            Coupon Applied — {subscription.subscription.appliedCoupon.code}
                          </p>
                          <p className="text-xs text-green-700">
                            You save {formatPrice(subscription.subscription.appliedCoupon.discountAmount)} every billing cycle. This recurring discount is already attached to your subscription.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                        <CheckCircle2 className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                            {subscription.subscription.appliedCoupon.code} — Used
                          </p>
                          {/* Real, duration-based reasoning — never a generic
                              "no longer active" guess. Only first_payment is
                              actually reachable in production today
                              (fixed_cycles/until_date can't be created — see
                              couponController.js's ENFORCEABLE_DURATIONS), so
                              that's the only distinct "why" this system can
                              honestly report. An admin disabling/archiving a
                              coupon does NOT stop it discounting existing
                              recurring subscribers by design (Law 4/AD4) — so
                              there is no "disabled by admin" reason this
                              banner could ever truthfully show alongside a
                              still-recurring coupon. */}
                          <p className="text-xs text-gray-500">
                            This coupon applied a one-time discount to your first payment and no longer affects your recurring bill.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Remove — step 1 is a backend-computed preview, never a
                        guess, shown as an explicit confirmation before anything
                        commits. */}
                    <div className="mt-2 flex items-center gap-3 text-xs">
                      <button
                        onClick={handleRemoveCouponClick}
                        disabled={couponActionLoading}
                        className="text-gray-500 hover:text-red-600 font-medium disabled:opacity-50 inline-flex items-center gap-1"
                      >
                        <X className="w-3 h-3" />
                        {couponActionLoading ? "Checking..." : "Remove coupon"}
                      </button>
                      <span className="text-gray-300">·</span>
                      <button
                        onClick={() => { setShowCouponReplaceInput((v) => !v); setCouponActionError(""); setCouponReplacePreview(null); }}
                        disabled={couponActionLoading}
                        className="text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50"
                      >
                        {showCouponReplaceInput ? "Cancel" : "Replace with another coupon"}
                      </button>
                    </div>
                  </>
                ) : (
                  // Paid, no coupon currently attached — same Replace
                  // mechanism (replaceAppliedCoupon works identically whether
                  // or not a prior coupon existed), just framed as "Apply"
                  // rather than "Replace" for this case.
                  !showCouponReplaceInput && (
                    <button
                      onClick={() => { setShowCouponReplaceInput(true); setCouponActionError(""); setCouponReplacePreview(null); }}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-1"
                    >
                      <Tag className="w-3 h-3" /> Have a coupon? Apply it
                    </button>
                  )
                )}

                {/* Remove confirmation — real before/after amounts from the
                    backend, never computed here. */}
                {couponRemovePreview && (
                  <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-xs font-semibold text-red-800 mb-1">Remove coupon?</p>
                    <p className="text-xs text-red-700">
                      {couponRemovePreview.willChangeRecurring
                        ? `Removing this coupon will change your recurring amount from ${formatPrice(couponRemovePreview.recurringBefore)}/mo to ${formatPrice(couponRemovePreview.recurringAfter)}/mo.`
                        : `This coupon is no longer discounting your recurring bill, so removing it won't change your ${formatPrice(couponRemovePreview.recurringAfter)}/mo amount.`}
                      {" "}Your historical redemption will remain preserved.
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        onClick={() => setCouponRemovePreview(null)}
                        disabled={couponActionLoading}
                        className="px-3 py-1.5 text-xs font-medium bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleConfirmRemoveCoupon}
                        disabled={couponActionLoading}
                        className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                      >
                        {couponActionLoading ? "Removing..." : "Remove coupon"}
                      </button>
                    </div>
                  </div>
                )}

                {couponActionError && !showCouponReplaceInput && !couponRemovePreview && (
                  <p className="text-xs text-red-600 mt-1">{couponActionError}</p>
                )}

                {showCouponReplaceInput && (
                  <div className="mt-2">
                    {!couponReplacePreview ? (
                      <>
                        <div className={`flex items-center h-9 border ${replaceCouponInput ? "border-[#0085FF]" : "border-[#E1E4EA]"} rounded-full bg-white transition-colors focus-within:border-[#0085FF] overflow-hidden`}>
                          <input
                            value={replaceCouponInput}
                            onChange={(e) => { setReplaceCouponInput(e.target.value.toUpperCase()); setCouponActionError(""); }}
                            onKeyDown={(e) => e.key === "Enter" && handlePreviewReplaceCoupon()}
                            placeholder="New coupon code"
                            disabled={couponActionLoading}
                            className="flex-1 h-full px-4 text-xs bg-transparent focus:outline-none disabled:bg-gray-50"
                          />
                          <button
                            onClick={handlePreviewReplaceCoupon}
                            disabled={couponActionLoading || !replaceCouponInput.trim()}
                            className="h-full px-4 text-xs font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ background: "var(--btn-primary, #0085FF)" }}
                          >
                            {couponActionLoading ? "Checking..." : "Apply"}
                          </button>
                        </div>
                        {couponActionError && <p className="text-xs text-red-600 mt-1">{couponActionError}</p>}
                      </>
                    ) : (
                      // Backend-computed replacement preview — the real
                      // fullRulesSnapshot + eligibility result, never a
                      // client-side guess.
                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-xs font-semibold text-blue-800 mb-1">
                          Apply {couponReplacePreview.couponCode}?
                        </p>
                        <p className="text-xs text-blue-700">
                          {couponReplacePreview.recurringEligible
                            ? `Your recurring amount will change from ${formatPrice(couponReplacePreview.recurringBefore)}/mo to ${formatPrice(couponReplacePreview.recurringAfter)}/mo.`
                            : `This coupon only applies to a first payment — it won't change your current ${formatPrice(couponReplacePreview.recurringBefore)}/mo recurring amount, but will be recorded on your account.`}
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            onClick={() => setCouponReplacePreview(null)}
                            disabled={couponActionLoading}
                            className="px-3 py-1.5 text-xs font-medium bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleConfirmReplaceCoupon}
                            disabled={couponActionLoading}
                            className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                          >
                            {couponActionLoading ? "Applying..." : "Confirm"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : appliedCoupon?.valid ? (
              <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-green-800">Coupon Applied — {appliedCoupon.code}</p>
                  {/* Honest copy: only the new-subscription flow actually
                      discounts the charge today, so paid subscribers get an
                      informational message rather than a promise of card
                      discounts that the upgrade/add-on flows don't yet honour. */}
                  <p className="text-xs text-green-700">
                    {couponAppliesAtCheckout
                      ? `${appliedCoupon.name}. Discounts are shown on eligible plans and add-ons below.`
                      : `${appliedCoupon.name}. Saved to your account — it won't change your current recurring bill, and discounting future upgrades/add-ons isn't enabled yet.`}
                  </p>
                </div>
                <button onClick={removeCoupon} className="text-green-600 hover:text-green-800">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div>
                <div className={`flex items-center h-10 border ${couponInput ? "border-[#0085FF]" : "border-[#E1E4EA]"} rounded-full bg-white transition-colors focus-within:border-[#0085FF] overflow-hidden`}>
                  <div className="relative flex-1 h-full">
                    <Tag className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input
                      value={couponInput}
                      onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCouponError(""); }}
                      onKeyDown={(e) => e.key === "Enter" && applyCoupon()}
                      placeholder="Have a coupon code?"
                      className="w-full h-full pl-9 pr-3 bg-transparent text-sm uppercase focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={() => applyCoupon()}
                    disabled={validatingCoupon || !couponInput.trim()}
                    className="h-full px-5 text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: "var(--btn-primary, #0085FF)" }}
                  >
                    {validatingCoupon ? "..." : "Apply"}
                  </button>
                </div>
                {couponError && <p className="text-xs text-red-600 mt-1 text-center">{couponError}</p>}
              </div>
            )}
          </div>
        )}

        {/* Referral code — applies IMMEDIATELY on its own Apply button,
            exactly like the coupon field above, not folded into a later
            Subscribe/Start Trial submission. Recording the referral is
            independent of trial/payment status entirely — only relevant
            before this org already has a referrer, which is why it's
            hidden once payment is confirmed (an already-paying org's
            referrer, if any, was already settled at registration or an
            earlier Apply).
            BILLING_UX_SPEC.md §3 — corrected copy: post-CAW, the referee
            DOES receive a real discount on their first invoice (see
            findPendingReferralForSignup()/referralModifierFromPendingProgram()
            in the backend), applied directly by the pricing preview above.
            The old "you won't see a discount" copy was accurate pre-CAW and
            is now simply false — replaced per §3's rule that the referee
            never sees referrer-side language ("reward," "next purchase"). */}
        {showCouponWidget && !subscription?.subscription?.isPaymentConfirmed && (
          <div className="max-w-md mx-auto mb-6">
            {referralApplied ? (
              <div className="flex items-start gap-2 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <CheckCircle2 className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-purple-800">
                    Referral Applied{referredByName ? ` — you were invited by ${referredByName}` : ""}
                  </p>
                  <p className="text-xs text-purple-700">
                    A discount has been applied to your first invoice — see the Order Summary below.
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <div className={`flex items-center h-10 border ${referralCodeInput ? "border-purple-400" : "border-[#E1E4EA]"} rounded-full bg-white transition-colors focus-within:border-purple-400 overflow-hidden`}>
                  <div className="relative flex-1 h-full">
                    <Gift className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input
                      value={referralCodeInput}
                      onChange={(e) => { setReferralCodeInput(e.target.value.toUpperCase()); setReferralError(""); }}
                      onKeyDown={(e) => e.key === "Enter" && handleApplyReferral()}
                      placeholder="Have a referral code?"
                      className="w-full h-full pl-9 pr-3 bg-transparent text-sm uppercase focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={handleApplyReferral}
                    disabled={applyingReferral || !referralCodeInput.trim()}
                    className="h-full px-5 text-sm font-semibold bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
                  >
                    {applyingReferral ? "..." : "Apply"}
                  </button>
                </div>
                {referralError && <p className="text-xs text-red-600 mt-1 text-center">{referralError}</p>}
              </div>
            )}
          </div>
        )}

        <div className="overflow-hidden">
          <FeatureComparisonTable plans={planStructure} />
        </div>

        <div className="py-6">
          <FAQ />
        </div>

        <TrialModal
          showTrialModal={showTrialModal}
          onClose={() => setShowTrialModal(false)}
          onStartTrial={handleTrialStart}
          processing={processing}
        />

        {showCancelModal && (
          <div className="fixed inset-0 z-[100003] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl p-6 max-w-lg w-full shadow-2xl mx-4 max-h-[90vh] overflow-y-auto">
              <div className="mb-6">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">We are sorry to see you go</h3>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-yellow-800">
                  <strong>Note:</strong> Your subscription will remain active until the end of your current billing period (
                  {subscription?.subscription?.currentPeriodEnd
                    ? new Date(subscription.subscription.currentPeriodEnd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                    : "billing period end"}
                  ). You will continue to have access to all features until then.
                </p>
              </div>
              <div className="flex flex-col-reverse sm:flex-row gap-3">
                <button
                  onClick={() => { setShowCancelModal(false); setCancelReason(""); setCancelFeedback(""); }}
                  className="flex-1 px-4 py-2.5 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                  disabled={processing}
                >
                  Keep Subscription
                </button>
                <button
                  onClick={handleCancelSubscription}
                  className="flex-1 px-4 py-2.5 text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={processing}
                >
                  {processing ? (
                    <span className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Canceling...
                    </span>
                  ) : "Confirm Cancellation"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SubscriptionPlans;
