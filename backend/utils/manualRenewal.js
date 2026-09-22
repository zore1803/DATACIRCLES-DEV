// utils/manualRenewal.js
//
// Renewals for billingMode:'manual' subscriptions — no mandate, so instead
// of charging, each period's invoice goes out as a plain Razorpay payment
// link (every method) that the customer pays themselves.
//
//   1. Due date   — runManualRenewalJob prices the renewal through the SAME
//      renewSubscription() autopay uses; its injected "charge" just sends the
//      link and reports pending (outcome AWAITING_PAYMENT). Access continues.
//   2. Paid       — payment.captured for that link's invoice_id calls
//      settleManualRenewalPayment, which re-enters renewSubscription with the
//      captured payment. It resumes the already-priced transaction and runs
//      the normal commit steps (invoice PAID, period advanced).
//   3. Unpaid     — runManualGraceJob emails reminders on grace days 3 and 6,
//      and suspends (read-only, see subscriptionGate) from day 7. Paying the
//      link later still settles and reactivates it.

const razorpay = require('../config/razorpay');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const Organization = require('../models/Organization');
const sendGridMail = require('./sendGridMail');
const { renderEmail } = require('./emailLayout');
const { emitBillingEvent } = require('./billingEvents');

const DAY_MS = 24 * 60 * 60 * 1000;
const GRACE_DAYS = 7;
const REMINDER_DAYS = [3, 6];

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtRupees(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(amount);
}

async function getOrgAdminUser(organizationId) {
  return User.findOne({ organization: organizationId, role: 'admin' });
}

async function emailAdmin(subscription, { subject, intro, preheader }) {
  const user = await getOrgAdminUser(subscription.organization);
  const to = user?.email || user?.profileEmail;
  if (!to) {
    console.warn(`[manualRenewal] No admin email for org ${subscription.organization}, skipping "${subject}"`);
    return;
  }
  const html = renderEmail({
    greetingName: user.name || null,
    intro,
    ctaLabel: 'Pay now',
    ctaUrl: subscription.manualRenewal?.shortUrl || `${process.env.FRONTEND_URL}/settings/subscription`,
    preheader,
  });
  await sendGridMail({ to, subject, html });
}

// The injected "charge" for a manual renewal: creates the payment link and
// reports pending. A link already open for this subscription is reused, so
// a re-run can never send the customer a second one for the same period.
function sendRenewalLinkFn() {
  return async ({ subscription, amount }) => {
    if (subscription.manualRenewal?.invoiceId) {
      return { pending: true, invoiceId: subscription.manualRenewal.invoiceId };
    }

    const organization = await Organization.findById(subscription.organization);
    const admin = await getOrgAdminUser(subscription.organization);
    const plan = subscription.planName.charAt(0).toUpperCase() + subscription.planName.slice(1);
    const dueAt = subscription.nextBillingDate || new Date();

    const link = await razorpay.invoices.create({
      type: 'link',
      amount: Math.round(amount * 100),
      currency: 'INR',
      description: `${plan} Plan - ${subscription.billingCycle} renewal`,
      ...(subscription.razorpayCustomerId
        ? { customer_id: subscription.razorpayCustomerId }
        : { customer: { name: admin?.name || organization?.name, email: admin?.email || admin?.profileEmail } }),
      receipt: `mr-${subscription._id.toString().slice(-12)}-${Date.now().toString(36)}`,
      email_notify: false, // our own email below carries the link
      sms_notify: false,
      notes: {
        organization_id: subscription.organization.toString(),
        kind: 'manual_renewal',
      },
    });

    subscription.manualRenewal = {
      invoiceId: link.id,
      shortUrl: link.short_url,
      amount,
      dueAt,
      remindersSent: [],
    };
    await subscription.save();

    const graceEnds = new Date(dueAt.getTime() + GRACE_DAYS * DAY_MS);
    await emailAdmin(subscription, {
      subject: `Your DataCircles renewal of ${fmtRupees(amount)} is due`,
      intro: [
        `Your <strong>${plan}</strong> plan for <strong>${organization?.name || 'your workspace'}</strong> renews on <strong>${fmtDate(dueAt)}</strong>. The amount due is <strong>${fmtRupees(amount)}</strong> (incl. GST).`,
        `Pay any time before <strong>${fmtDate(graceEnds)}</strong> with UPI, card, net banking or wallet. After that the workspace becomes read-only until the payment is made.`,
      ],
      preheader: `Renewal of ${fmtRupees(amount)} due for ${organization?.name || 'your workspace'}.`,
    }).catch((err) => console.error('[manualRenewal] renewal-due email failed:', err.message));

    return { pending: true, invoiceId: link.id };
  };
}

async function startManualRenewal(subscription) {
  const { renewSubscription } = require('./renewalEngine');
  return renewSubscription(subscription, { chargeMandateFn: sendRenewalLinkFn() });
}

// payment.captured for a manual renewal link. Returns true when the payment
// belonged to one (so the autopay/first-payment handlers can skip it).
async function settleManualRenewalPayment(paymentEntity) {
  if (paymentEntity.notes?.kind !== 'manual_renewal' || !paymentEntity.invoice_id) return false;

  const subscription = await Subscription.findOne({ 'manualRenewal.invoiceId': paymentEntity.invoice_id });
  if (!subscription) {
    console.error(`[manualRenewal] captured payment ${paymentEntity.id} for unknown renewal link ${paymentEntity.invoice_id}`);
    return true;
  }

  const { renewSubscription } = require('./renewalEngine');
  const outcome = await renewSubscription(subscription, {
    chargeMandateFn: async () => ({ success: true, paymentId: paymentEntity.id, orderId: paymentEntity.order_id }),
  });
  if (outcome.outcome !== 'RENEWED') {
    console.error(`[manualRenewal] payment ${paymentEntity.id} captured but renewal did not commit for subscription ${subscription._id}:`, outcome);
    return true;
  }

  const { setAppStatus } = require('../controllers/subscriptionController');
  const wasSuspended = subscription.appStatus !== 'active';
  subscription.manualRenewal = undefined;
  subscription.paymentStatus = 'payment_completed';
  subscription.lastPaymentAttempt = {
    razorpayPaymentId: paymentEntity.id,
    amount: paymentEntity.amount / 100,
    attemptedAt: new Date(),
    status: paymentEntity.status,
  };
  if (wasSuspended) setAppStatus(subscription, 'active', 'Manual renewal payment received');
  await subscription.save();

  await emitBillingEvent({
    organization: subscription.organization,
    subscription: subscription._id,
    eventType: 'RENEWAL',
    status: 'completed',
    after: subscription,
    amounts: { recurringAfter: subscription.totalAmount },
    metadata: { billingMode: 'manual', paymentId: paymentEntity.id },
  });
  return true;
}

// Daily: send links for manual subscriptions that reached their renewal date.
async function runManualRenewalJob(now = new Date()) {
  const due = await Subscription.find({
    billingMode: 'manual',
    appStatus: 'active',
    isPaymentConfirmed: true,
    nextBillingDate: { $lte: now },
    cancelAtPeriodEnd: { $ne: true },
    'manualRenewal.invoiceId': null, // matches missing too
  });
  for (const subscription of due) {
    try {
      const outcome = await startManualRenewal(subscription);
      console.log(`[manualRenewal] subscription=${subscription._id} -> ${outcome.outcome}`);
    } catch (err) {
      console.error(`[manualRenewal] renewal failed for subscription=${subscription._id}:`, err.message);
    }
  }
}

// Daily: reminders on grace days 3 and 6, suspension from day 7.
async function runManualGraceJob(now = new Date()) {
  const open = await Subscription.find({
    billingMode: 'manual',
    'manualRenewal.invoiceId': { $ne: null },
  });
  const { setAppStatus } = require('../controllers/subscriptionController');

  for (const subscription of open) {
    try {
      const { dueAt, amount } = subscription.manualRenewal;
      const daysOverdue = Math.floor((now - new Date(dueAt)) / DAY_MS);

      if (daysOverdue >= GRACE_DAYS) {
        if (subscription.appStatus === 'active') {
          setAppStatus(subscription, 'suspended', `Manual renewal unpaid ${GRACE_DAYS} days after ${fmtDate(dueAt)}`);
          await subscription.save();
          await emailAdmin(subscription, {
            subject: 'Your DataCircles workspace is now read-only',
            intro: [
              `The renewal payment of <strong>${fmtRupees(amount)}</strong> due on <strong>${fmtDate(dueAt)}</strong> hasn't been received, so your workspace is now read-only.`,
              'Your data is safe. Pay the renewal to restore full access immediately.',
            ],
            preheader: 'Pay your DataCircles renewal to restore full access.',
          });
        }
        continue;
      }

      const reminderDay = REMINDER_DAYS.filter((d) => daysOverdue >= d && !subscription.manualRenewal.remindersSent.includes(d)).pop();
      if (reminderDay !== undefined) {
        const graceEnds = new Date(new Date(dueAt).getTime() + GRACE_DAYS * DAY_MS);
        await emailAdmin(subscription, {
          subject: `Reminder: DataCircles renewal of ${fmtRupees(amount)} is overdue`,
          intro: [
            `Your renewal payment of <strong>${fmtRupees(amount)}</strong> was due on <strong>${fmtDate(dueAt)}</strong>.`,
            `Please pay before <strong>${fmtDate(graceEnds)}</strong> to avoid your workspace becoming read-only.`,
          ],
          preheader: `Your DataCircles renewal is overdue — pay before ${fmtDate(graceEnds)}.`,
        });
        subscription.manualRenewal.remindersSent.push(...REMINDER_DAYS.filter((d) => d <= reminderDay));
        await subscription.save();
      }
    } catch (err) {
      console.error(`[manualRenewal] grace check failed for subscription=${subscription._id}:`, err.message);
    }
  }
}

module.exports = {
  startManualRenewal,
  settleManualRenewalPayment,
  runManualRenewalJob,
  runManualGraceJob,
  GRACE_DAYS,
};
