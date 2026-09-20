// jobs/paymentReconciliationJobs.js
//
// Pull-based backstop for first payments. Everything else that recognises a completed first
// payment is push-based and can be missed:
//   - the browser posting back to verifyPayment — only runs if the customer's checkout tab
//     survives long enough (closing it after Razorpay says "success" kills this, observed live), and
//   - the payment.captured webhook — can be undelivered, delayed, or simply not configured for the
//     environment.
//
// With neither, a paid subscription sits at paymentStatus 'pending_payment' indefinitely: the
// customer is charged, the app disagrees, and "Resume Payment" offers to charge them again.
// SubscriptionPlans.jsx now reconciles on tab focus / while polling / before resuming, but all of
// that only runs if somebody opens the billing page. This job is what heals the case where the
// customer pays, closes the tab, and never comes back.
//
// Schedule: every 15 minutes. The work is proportional to the number of subscriptions actually
// stuck pending (normally zero), and each one costs at most two Razorpay GETs per registration
// link, so this is cheap; 15 minutes keeps the worst-case "app disagrees with reality" window
// short without polling Razorpay pointlessly.
//
// Locking: module-level in-process boolean, matching renewalLifecycleJobs.js. Single Node process
// is assumed throughout this codebase — this does NOT protect against overlap across instances.
// That is a known, pre-existing, codebase-wide gap, deliberately not solved here. Even if two ticks
// did overlap, reconcileSubscriptionPayment is idempotent (recordWebhookEventOnce dedupes the
// replayed event), so the worst case is duplicated Razorpay reads, not duplicated settlement.
//
// Mount once in server.js: require('./jobs/paymentReconciliationJobs');

const cron = require('node-cron');
const Subscription = require('../models/Subscription');
const { reconcileSubscriptionPayment } = require('../controllers/subscriptionController');

let sweepRunning = false;

// Only attempts that could plausibly have money against them: still unconfirmed, and carrying at
// least one registration link to look up. Anything older than this is not worth re-reading on a
// loop forever — a link that has not been paid within a week is abandoned, not in flight.
const MAX_ATTEMPT_AGE_DAYS = 7;

async function runPendingPaymentSweep() {
  const cutoff = new Date(Date.now() - MAX_ATTEMPT_AGE_DAYS * 24 * 60 * 60 * 1000);

  const pending = await Subscription.find({
    isPaymentConfirmed: { $ne: true },
    paymentStatus: 'pending_payment',
    updatedAt: { $gte: cutoff },
    $or: [
      { registrationLinkId: { $exists: true, $ne: null } },
      { priorRegistrationLinkIds: { $exists: true, $not: { $size: 0 } } },
    ],
  });

  const outcomes = { reconciled: 0, still_pending: 0, errored: 0 };

  for (const subscription of pending) {
    try {
      const result = await reconcileSubscriptionPayment(subscription);
      if (result.reconciled) {
        outcomes.reconciled += 1;
        console.log(
          `[paymentReconciliationJobs] Recovered unacknowledged payment ${result.paymentId} for organization ${subscription.organization}.`
        );
      } else {
        outcomes.still_pending += 1;
      }
    } catch (err) {
      // One subscription failing (a deleted link, a Razorpay hiccup) must not abort the sweep for
      // everyone else.
      outcomes.errored += 1;
      console.error(
        `[paymentReconciliationJobs] Error reconciling subscription ${subscription._id}:`,
        err?.message
      );
    }
  }

  return { scanned: pending.length, ...outcomes };
}

cron.schedule('*/15 * * * *', async () => {
  if (sweepRunning) {
    console.log('[paymentReconciliationJobs] Sweep already running — skipping this tick.');
    return;
  }
  sweepRunning = true;
  try {
    const summary = await runPendingPaymentSweep();
    // Only worth a line when there was something to look at — an idle sweep every 15 minutes
    // would otherwise be pure log noise.
    if (summary.scanned > 0) {
      console.log('[paymentReconciliationJobs] Sweep finished.', summary);
    }
  } catch (err) {
    console.error('[paymentReconciliationJobs] Sweep error:', err);
  } finally {
    sweepRunning = false;
  }
});

module.exports = { runPendingPaymentSweep };
