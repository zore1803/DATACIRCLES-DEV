// jobs/salesSubscriptionBillingJob.js
//
// The recurring half of the Sales Subscription module. A SalesSubscription is
// not an invoice — it is the standing instruction "bill this customer this
// document every N <unit>". This job is what turns that instruction into
// actual Invoices:
//
//   SUB-0001 (Active, every 1 month, next 01 Sep)
//        |  01 Sep arrives
//        +--> INV-001   -> Payment
//        |  01 Oct arrives
//        +--> INV-002   -> Payment
//        ...
//
// It deliberately contains NO billing math of its own. Every invoice is built
// by salesSubscriptionController.generateInvoiceForSubscription — the exact
// same function the manual "Generate Invoice Now" row action calls — so the
// automatic and manual paths can never drift apart. This file only decides
// WHICH subscriptions are due and WHEN to look.
//
// Status contract this job honours (and is the only thing that enforces it):
//   Draft     - created, billing not started -> never touched here. The user
//               starts it by setting it Active (or by generating manually,
//               which flips it Active itself).
//   Active    - the only status billed on schedule.
//   Expired   - endDate passed and nothing is left to generate -> stops.
//   Cancelled - stopped by the user, terminal -> never resumed, and already
//               has nextInvoiceDate cleared by the controller.
//   Error     - the last generation attempt failed (lastError holds why).
//               Its transaction rolled back, so no invoice or stock movement
//               exists for that cycle. Skipped until a human puts it back to
//               Active, so a broken subscription can't spam failures every hour.
//
// Already-generated invoices and their payments are never touched by any
// branch here — expiring or erroring a subscription only stops FUTURE
// generation, which is what keeps the accounting history intact.
//
// Schedule: hourly at :05, matching renewalLifecycleJobs.js's hourly cadence.
// Billing dates have day granularity, so minute-level ticking would only mean
// 60x the queries for zero benefit.
//
// Locking: a module-level in-process boolean, the same assumption every other
// job in this codebase makes (single Node process, no distributed lock
// primitive exists here). This does not protect against overlap across
// multiple server instances — flagged, not fixed, consistent with
// renewalLifecycleJobs.js.
//
// Mount once in server.js: require('./jobs/salesSubscriptionBillingJob');

const cron = require('node-cron');
const SalesSubscription = require('../models/SalesSubscription');
const { generateInvoiceForSubscription } = require('../controllers/salesSubscriptionController');

// If the server was down for a while, a subscription can have several billing
// dates in the past at once. Those cycles are genuinely owed, so they're all
// generated — but capped per subscription per tick so a single row with a
// mis-typed 2020 start date can't emit hundreds of invoices in one pass. The
// remainder is picked up on the next tick.
const MAX_CATCHUP_PER_TICK = 12;

let running = false;

async function runSalesSubscriptionBilling(now = new Date()) {
  const summary = { generated: 0, expired: 0, errored: 0, subscriptions: 0 };

  // --- Billing pass -------------------------------------------------------
  // Every Active subscription whose next billing date has arrived. Deliberately
  // runs BEFORE the expiry pass: a subscription whose endDate has just passed
  // may still owe the final cycle that fell inside its term.
  const due = await SalesSubscription.find({
    status: 'Active',
    nextInvoiceDate: { $ne: null, $lte: now },
  });

  for (const found of due) {
    summary.subscriptions += 1;
    let subscription = found;
    try {
      let generated = 0;
      while (
        subscription.status === 'Active' &&
        subscription.nextInvoiceDate &&
        new Date(subscription.nextInvoiceDate) <= now &&
        generated < MAX_CATCHUP_PER_TICK
      ) {
        // Creates the invoice (dated the cycle it covers), moves its stock out and
        // advances the cycle in one transaction. Returns the fresh subscription —
        // the loop must continue from that, not from the stale document.
        const result = await generateInvoiceForSubscription(subscription, subscription.user, subscription.organization);
        subscription = result.subscription;
        generated += 1;
        summary.generated += 1;
      }
    } catch (err) {
      // Another run (other server, manual click) already billed this cycle:
      // not a failure, the subscription is fine — move on.
      if (err.code === 'CYCLE_ALREADY_BILLED') continue;
      // generateInvoiceForSubscription already flags the subscription Error when
      // its transaction fails; this write covers failures before that point
      // (deleted Deal, missing owner) and skips validation so a grandfathered
      // null-endDate row can still record its error.
      summary.errored += 1;
      console.error(
        `[salesSubscriptionBillingJob] ${found.subscriptionNumber} failed:`,
        err.message
      );
      try {
        await SalesSubscription.updateOne(
          { _id: found._id, status: { $nin: ['Cancelled', 'Expired'] } },
          { $set: { status: 'Error', lastError: err.message } }
        );
      } catch (saveErr) {
        console.error('[salesSubscriptionBillingJob] Could not record error state:', saveErr.message);
      }
    }
  }

  // --- Expiry pass --------------------------------------------------------
  // An Active subscription past its endDate with nothing left inside the term
  // is Expired. Guarded on nextInvoiceDate so a row that still owes a cycle
  // within its term (billed by the pass above) isn't retired early.
  const expiredResult = await SalesSubscription.updateMany(
    {
      status: 'Active',
      endDate: { $ne: null, $lt: now },
      $or: [{ nextInvoiceDate: null }, { nextInvoiceDate: { $gt: now } }],
    },
    { $set: { status: 'Expired', nextInvoiceDate: null } }
  );
  summary.expired = expiredResult.modifiedCount || 0;

  return summary;
}

cron.schedule('5 * * * *', async () => {
  if (running) {
    console.log('[salesSubscriptionBillingJob] Previous run still in progress — skipping this tick.');
    return;
  }
  running = true;
  try {
    const summary = await runSalesSubscriptionBilling();
    if (summary.subscriptions || summary.expired) {
      console.log('[salesSubscriptionBillingJob] Run finished.', summary);
    }
  } catch (err) {
    console.error('[salesSubscriptionBillingJob] Run error:', err);
  } finally {
    running = false;
  }
});

// Exported so the run can be triggered from a script/test without waiting an
// hour for the cron tick.
module.exports = { runSalesSubscriptionBilling };
