// jobs/renewalLifecycleJobs.js
//
// Cron registration for the CAW renewal/retry pipeline (billingOrchestration.js's
// runRenewalJob/runRetryJob). Both are already implemented and fixture-verified
// (see IMPLEMENTATION_PLAN_V1.md, Phase 4B/4C) — this file only invokes them on
// a schedule. No billing logic lives here.
//
// Schedule: hourly (0 * * * *), not every-minute like subscriptionLifecycleJobs.js's
// trial jobs — the Retry Engine's own cadence is [24h, 72h, 120h] (see
// utils/retryEngine.js), so nothing here depends on minute-level granularity, and
// every-minute would mean up to 60x more Razorpay API calls for zero benefit while
// increasing overlap risk.
//
// Locking: a module-level in-process boolean guard, per subscription below — the
// same assumption every job in subscriptionLifecycleJobs.js already makes (single
// Node process; no distributed lock anywhere in this codebase). This does NOT
// protect against overlap across multiple server instances/processes — flagged
// explicitly, not fixed here, since fixing it would mean introducing a new locking
// primitive (e.g. Redis-based) not otherwise used in this codebase.
//
// The three existing jobs in subscriptionLifecycleJobs.js have no locking at all —
// that is a known, separate, pre-existing gap, intentionally NOT touched here.
//
// Mount once in server.js: require('./jobs/renewalLifecycleJobs');

const cron = require('node-cron');
const { runRenewalJob, runRetryJob } = require('./billingOrchestration');
const { chargeMandateFn } = require('../utils/razorpayChargeMandate');

let renewalJobRunning = false;
let retryJobRunning = false;

// ------------------------------------------------------------------
// Renewal job — hourly, on the hour.
// ------------------------------------------------------------------
cron.schedule('0 * * * *', async () => {
  if (renewalJobRunning) {
    console.log('[renewalLifecycleJobs] Renewal job already running — skipping this tick.');
    return;
  }
  renewalJobRunning = true;
  try {
    console.log('[renewalLifecycleJobs] Renewal job started.');
    const results = await runRenewalJob({ chargeMandateFn });
    const counts = results.reduce((acc, r) => {
      const key = r.error ? 'ERROR' : (r.outcome || 'UNKNOWN');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    console.log(`[renewalLifecycleJobs] Renewal job finished. Processed ${results.length}. Outcomes:`, counts);
  } catch (err) {
    console.error('[renewalLifecycleJobs] Renewal job error:', err);
  } finally {
    renewalJobRunning = false;
  }
});

// ------------------------------------------------------------------
// Retry job — hourly, on the hour.
// ------------------------------------------------------------------
cron.schedule('0 * * * *', async () => {
  if (retryJobRunning) {
    console.log('[renewalLifecycleJobs] Retry job already running — skipping this tick.');
    return;
  }
  retryJobRunning = true;
  try {
    console.log('[renewalLifecycleJobs] Retry job started.');
    const results = await runRetryJob({ chargeMandateFn });
    const counts = results.reduce((acc, r) => {
      const key = r.error ? 'ERROR' : (r.outcome || 'UNKNOWN');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    console.log(`[renewalLifecycleJobs] Retry job finished. Processed ${results.length}. Outcomes:`, counts);
  } catch (err) {
    console.error('[renewalLifecycleJobs] Retry job error:', err);
  } finally {
    retryJobRunning = false;
  }
});

// ------------------------------------------------------------------
// Manual-billing renewals — hourly. Sends the payment link on the renewal
// date, then reminders (grace days 3 and 6) and suspension (day 7). Both
// steps are idempotent per subscription (see utils/manualRenewal.js), so an
// hourly tick only ever acts once per link/reminder.
// ------------------------------------------------------------------
let manualJobRunning = false;
cron.schedule('0 * * * *', async () => {
  if (manualJobRunning) return;
  manualJobRunning = true;
  try {
    const { runManualRenewalJob, runManualGraceJob } = require('../utils/manualRenewal');
    await runManualRenewalJob();
    await runManualGraceJob();
  } catch (err) {
    console.error('[renewalLifecycleJobs] Manual renewal job error:', err);
  } finally {
    manualJobRunning = false;
  }
});

module.exports = {};
