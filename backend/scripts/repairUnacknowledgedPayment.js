// scripts/repairUnacknowledgedPayment.js
//
// One-off repair for a payment that Razorpay captured but this app never recorded — the case that
// predates jobs/paymentReconciliationJobs.js and the priorRegistrationLinkIds field.
//
// The ordinary sweep finds money by walking the registration links stored on the subscription. A
// payment made BEFORE those changes shipped can be unreachable that way: hitting "Resume Payment"
// overwrote registrationLinkId with a newer link and cancelled the old one, and the old id was not
// retained anywhere. This script takes the Razorpay payment id directly (from the Razorpay
// dashboard, or the customer's receipt) and replays it through the exact same handler the webhook
// uses, so settlement, activation, invoices and billing events all run normally.
//
// Safe to re-run: the replay is recorded under a synthetic `recon_<paymentId>` event id and
// deduped, so a second run is a no-op rather than a double settlement.
//
// Usage:
//   node scripts/repairUnacknowledgedPayment.js pay_XXXXXXXXXXXX            # dry run - reports only
//   node scripts/repairUnacknowledgedPayment.js pay_XXXXXXXXXXXX --apply    # actually reconcile

require('dotenv').config();
const mongoose = require('mongoose');
const razorpay = require('../config/razorpay');
const Subscription = require('../models/Subscription');

async function main() {
  const paymentId = process.argv[2];
  const apply = process.argv.includes('--apply');

  if (!paymentId || !paymentId.startsWith('pay_')) {
    console.error('Usage: node scripts/repairUnacknowledgedPayment.js pay_XXXXXXXXXXXX [--apply]');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

  const payment = await razorpay.payments.fetch(paymentId);
  console.log('Razorpay payment:', {
    id: payment.id,
    status: payment.status,
    amount: payment.amount / 100,
    currency: payment.currency,
    invoice_id: payment.invoice_id,
    organization_id: payment.notes?.organization_id,
    created_at: new Date(payment.created_at * 1000).toISOString(),
  });

  if (payment.status !== 'captured') {
    console.error(`Refusing to reconcile: payment status is "${payment.status}", not "captured". No money was taken.`);
    process.exit(1);
  }

  // Same resolution order the webhook handler uses: the registration link (invoice) it was paid
  // against, then the organization stamped in notes.
  let subscription = payment.invoice_id
    ? await Subscription.findOne({ registrationLinkId: payment.invoice_id })
    : null;
  if (!subscription && payment.notes?.organization_id) {
    subscription = await Subscription.findOne({ organization: payment.notes.organization_id });
  }

  if (!subscription) {
    console.error('Could not resolve a subscription for this payment (no matching registrationLinkId, no notes.organization_id).');
    process.exit(1);
  }

  console.log('Matched subscription:', {
    _id: String(subscription._id),
    organization: String(subscription.organization),
    planName: subscription.planName,
    paymentStatus: subscription.paymentStatus,
    isPaymentConfirmed: subscription.isPaymentConfirmed,
  });

  if (subscription.isPaymentConfirmed) {
    console.log('Nothing to do — this subscription is already confirmed.');
    await mongoose.disconnect();
    return;
  }

  if (!apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to reconcile this payment.');
    await mongoose.disconnect();
    return;
  }

  // Required here rather than at the top: subscriptionController pulls in a large chunk of the app,
  // and a dry run should not need any of it.
  const { reconcileSubscriptionPayment } = require('../controllers/subscriptionController');

  // Make the payment reachable by the normal reconcile path, then let that path do the work — so
  // this script never becomes a second, drifting copy of settlement logic.
  if (payment.invoice_id && subscription.registrationLinkId !== payment.invoice_id) {
    if (!subscription.priorRegistrationLinkIds?.includes(payment.invoice_id)) {
      subscription.priorRegistrationLinkIds = [
        ...(subscription.priorRegistrationLinkIds || []),
        payment.invoice_id,
      ];
      await subscription.save();
      console.log(`Recorded superseded registration link ${payment.invoice_id} so reconciliation can find it.`);
    }
  }

  const result = await reconcileSubscriptionPayment(subscription);
  console.log('Reconcile result:', result);

  const refreshed = await Subscription.findById(subscription._id);
  console.log('Subscription now:', {
    paymentStatus: refreshed.paymentStatus,
    isPaymentConfirmed: refreshed.isPaymentConfirmed,
    mandateStatus: refreshed.mandateStatus,
  });

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Repair failed:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
