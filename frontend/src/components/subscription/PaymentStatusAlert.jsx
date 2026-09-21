// components/subscription/PaymentStatusAlert.jsx
import React from 'react';
import { AlertCircle, CreditCard, XCircle, Clock } from 'lucide-react';
import MandateMethodPicker from './MandateMethodPicker';
import { hasValidPendingUpdate, deriveSubscriptionUIState, SUBSCRIPTION_UI_STATES } from '../../utils/subscriptionHelpers';

// B2 fix (found via live QA): this is the recovery banner for a PERSISTED
// pending mandate with no active checkout journey happening right now
// (the full-screen CheckoutJourneyScreen only ever renders for an actual
// in-session journey — see SubscriptionPlans.jsx's own comment on that
// condition). mandateInitiatedAt is used ONLY to soften the copy for a
// genuinely recent attempt — it never gates whether this banner shows, and
// it never implies anything is "currently happening" the way the old
// full-screen fallback incorrectly did.
const RECENT_MANDATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

const PaymentStatusAlert = ({ subscription, onRetryPayment, onResumePayment, onChangePlan, processing, mandateMethod, onMandateMethodChange }) => {
  // Don't show if no subscription exists
  if (!subscription) return null;

  const uiState = deriveSubscriptionUIState(subscription);

  // Checked before every early return below, because an honoured-but-unrenewable subscription trips
  // all of them: it IS payment-confirmed, and it carries cancelAtPeriodEnd (that is how the paid
  // term is made to lapse instead of renew). Falling through those guards would silence the one
  // message this customer actually needs - that their auto-pay never got set up and the plan stops
  // at period end.
  const mandateUnusable =
    subscription.mandateStatus === 'rejected' || subscription.mandateStatus === 'cancelled';

  // Hide during a genuine, not-yet-attempted trial. PENDING_MANDATE (a CAW
  // conversion attempt already in flight) is intentionally NOT trial here —
  // that state gets its own "Complete Payment"/mandate-pending message below,
  // rather than silently hiding behind the trial banner (the two used to be
  // indistinguishable from raw isTrialActive alone — see
  // FRONTEND_CONVERGENCE_PLAN.md Journey 1).
  //
  // EXPIRED is exempted for the same reason, not a new one: appStatus is
  // only ever set to 'expired' from a trial running out (confirmed by
  // tracing every setAppStatus(..., 'expired', ...) call site —
  // subscriptionLifecycleJobs.js's cron and adminEndTrialNow, both purely
  // trial-exhaustion paths; no paid-subscription code path ever produces
  // 'expired'). Without this, a trial that never touched checkout — and so
  // still carries the schema's generic paymentStatus:'pending_payment'
  // default (never explicitly set by startFreeTrial()) — fell through to
  // the switch below and showed "Payment Pending / Complete Payment" for a
  // payment that was never attempted (found live: "I didn't choose any
  // plan. Why is it showing Complete Payment?"). CANCELLED/SUSPENDED are
  // deliberately NOT exempted here — those states are always reached from a
  // real paid subscription, where a genuine payment-status alert can be
  // legitimate.
  if (!mandateUnusable && (uiState === SUBSCRIPTION_UI_STATES.TRIAL || uiState === SUBSCRIPTION_UI_STATES.EXPIRED)) return null;

  // Hide if payment is already confirmed
  if (!mandateUnusable && subscription.isPaymentConfirmed) return null;

  // Hide if a downgrade or cancellation is scheduled — but only a REAL one;
  // a stale/partial pendingUpdate object must not suppress the payment alert
  // for what's actually just an incomplete new-subscription checkout.
  if (!mandateUnusable && (hasValidPendingUpdate(subscription) || subscription.cancelAtPeriodEnd)) return null;

  // Ordinary guards, skipped entirely for an unusable mandate (see above).
  const getAlertContent = () => {
    // A mandate the bank actually refused is NOT the same as one the customer never finished, and
    // it must not be described as "authorization wasn't completed" — nothing the customer does
    // differently on the same card will fix it. Until now nothing in the UI read mandateStatus at
    // all, so this case rendered as an ordinary "resume your payment" nudge: the customer had been
    // charged, could not be activated, and was told to go finish something that had in fact failed.
    if (mandateUnusable) {
      // Two very different situations share mandateStatus 'rejected': the paid period is running
      // (we honoured the purchase, auto-renew is simply off) or the payment was refunded and there
      // is nothing active at all. Saying "could not be activated" in the first case would be a
      // plain lie to a paying, active customer.
      const wasRefunded = subscription.paymentStatus === 'payment_failed';
      const reason = subscription.mandateFailureReason
        || 'Your bank or card issuer rejected the recurring-payment mandate';

      if (!wasRefunded) {
        return {
          icon: <AlertCircle className="w-5 h-5" />,
          bgColor: 'bg-amber-50',
          borderColor: 'border-amber-200',
          textColor: 'text-amber-800',
          title: 'Auto-renew is off — your plan is active',
          message: `${reason}. Your subscription is active for the period you paid for, but it will not renew automatically and will end when that period does. Set up auto-pay with a different card, bank account or UPI to keep it running.`,
          showResume: true,
          showChangePlan: true,
        };
      }

      return {
        icon: <XCircle className="w-5 h-5" />,
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        textColor: 'text-red-800',
        title: 'Your bank declined the auto-pay setup',
        message: `${reason}. A subscription needs that permission to renew, so it could not be activated, and the amount charged has been refunded — it can take 5–7 working days to appear. Try again with a different card, or use a bank account/UPI mandate instead.`,
        showResume: true,
        showChangePlan: true,
      };
    }

    if (uiState === SUBSCRIPTION_UI_STATES.PENDING_MANDATE) {
      // Never the legacy retryPayment endpoint here — that's Order/classic-
      // Subscriptions-only and not CAW-aware (confirmed by trace: it reads/
      // writes razorpaySubscriptionId/razorpayPlanId exclusively, both unset
      // for a real CAW subscription). Resume Payment re-enters the real
      // Registration Link flow via updateSubscription instead (see
      // SubscriptionPlans.jsx's handleResumePayment).
      const initiatedAt = subscription.mandateInitiatedAt ? new Date(subscription.mandateInitiatedAt) : null;
      const isRecent = initiatedAt && (Date.now() - initiatedAt.getTime()) < RECENT_MANDATE_WINDOW_MS;
      const planLabel = subscription.planName
        ? subscription.planName.charAt(0).toUpperCase() + subscription.planName.slice(1)
        : 'your';

      let trialNote = '';
      if (subscription.isTrialActive) {
        trialNote = ' You can keep using your trial while you complete this.';
      } else if (subscription.trialUsed) {
        trialNote = ' Your trial has ended — complete payment to activate your subscription.';
      }

      return {
        icon: <Clock className="w-5 h-5" />,
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200',
        textColor: 'text-blue-800',
        title: 'Payment Setup Incomplete',
        message: isRecent
          ? `Your ${planLabel} subscription hasn't been activated yet — the payment authorization on Razorpay wasn't completed.${trialNote}`
          : `Your ${planLabel} subscription still hasn't been activated. The payment authorization on Razorpay was never completed.${trialNote}`,
        showResume: true,
        showChangePlan: true,
      };
    }
    switch (subscription.paymentStatus) {
      case 'pending_payment':
        return {
          icon: <Clock className="w-5 h-5" />,
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200',
          textColor: 'text-blue-800',
          title: 'Payment Pending',
          message: 'Your subscription is created but payment is pending. Please complete the payment to activate your plan.',
          showRetry: true,
          buttonText: 'Complete Payment'
        };
      case 'payment_failed':
        return {
          icon: <XCircle className="w-5 h-5" />,
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
          textColor: 'text-red-800',
          title: 'Payment Failed',
          message: 'Your payment could not be processed. Please try again to activate your subscription.',
          showRetry: true,
          buttonText: 'Retry Payment'
        };
      case 'payment_cancelled':
        return {
          icon: <AlertCircle className="w-5 h-5" />,
          bgColor: 'bg-orange-50',
          borderColor: 'border-orange-200',
          textColor: 'text-orange-800',
          title: 'Payment Cancelled',
          message: 'You cancelled the payment. Complete the payment to activate your subscription.',
          showRetry: true,
          buttonText: 'Try Again'
        };
      default:
        return null;
    }
  };

  let alertContent = getAlertContent();
  if (!alertContent) return null;

  // Override with processing state if payment is being processed
  if (processing) {
    alertContent = {
      icon: <Clock className="w-5 h-5 animate-spin" />,
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      textColor: 'text-blue-800',
      title: 'Processing Payment',
      message: 'Your payment is being processed. This may take time for confirmation...',
      showRetry: false,
    };
  }

  return (
    <div className={`${alertContent.bgColor} border ${alertContent.borderColor} rounded-lg p-4 mb-6`}>
      <div className="flex">
        <div className={`${alertContent.textColor} flex-shrink-0`}>
          {alertContent.icon}
        </div>
        <div className="ml-3 flex-1">
          <h3 className={`text-sm font-medium ${alertContent.textColor}`}>
            {alertContent.title}
          </h3>
          <p className={`mt-1 text-sm ${alertContent.textColor}`}>
            {alertContent.message}
          </p>
          {subscription.lastPaymentAttempt && (
            <p className={`mt-1 text-xs ${alertContent.textColor} opacity-75`}>
              Last attempt: {new Date(subscription.lastPaymentAttempt.attemptedAt).toLocaleString('en-IN')}
            </p>
          )}
          {alertContent.showRetry && (
            <div className="mt-3">
              <button
                onClick={onRetryPayment}
                disabled={processing}
                className="bg-[#0085FF] text-white px-4 h-[38px] rounded-full text-sm font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center transition-colors"
              >
                {processing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    Processing...
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4 mr-2" />
                    {alertContent.buttonText}
                  </>
                )}
              </button>
            </div>
          )}
          {alertContent.showResume && mandateMethod && (
            <MandateMethodPicker value={mandateMethod} onChange={onMandateMethodChange} className="mt-3" />
          )}
          {(alertContent.showResume || alertContent.showChangePlan) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {alertContent.showResume && (
                <button
                  onClick={onResumePayment}
                  disabled={processing}
                  className="bg-[#0085FF] text-white px-4 h-[38px] rounded-full text-sm font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center transition-colors"
                >
                  {processing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                      Resuming...
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4 mr-2" />
                      Resume Payment
                    </>
                  )}
                </button>
              )}
              {alertContent.showChangePlan && (
                <button
                  onClick={onChangePlan}
                  disabled={processing}
                  className="bg-white text-blue-700 border border-blue-200 px-4 h-[38px] rounded-full text-sm font-medium hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Change Plan
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentStatusAlert;
