// utils/internalAlertEmails.js
//
// Internal (DataCircles team) alerts about customer activity: a new free
// trial starting, and a new paid subscription. These go to the address in
// SALES_ALERT_EMAIL (comma-separated for several), NOT to the customer.
// Both senders are best-effort: they never throw, so a mail problem can't
// break a trial start or a payment settlement.

const sendGridMail = require('./sendGridMail');
const { renderEmail } = require('./emailLayout');

const DEFAULT_ALERT_EMAIL = 'yash.mishra@datacircles.in';

function getAlertRecipients() {
  const raw = process.env.SALES_ALERT_EMAIL || DEFAULT_ALERT_EMAIL;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function fmtDate(d) {
  return d
    ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'N/A';
}

function fmtRupees(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', minimumFractionDigits: 0,
  }).format(Number(amount) || 0);
}

function titleCase(s) {
  const raw = (s || '').trim();
  return raw ? `${raw.charAt(0).toUpperCase()}${raw.slice(1)}` : 'N/A';
}

function userContact(user) {
  return user?.email || user?.profileEmail || user?.phone || 'N/A';
}

async function sendNewAccountAlert(user, organizationId) {
  try {
    const Organization = require('../models/Organization');
    const organization = organizationId ? await Organization.findById(organizationId) : null;
    const orgName = organization?.name || 'N/A';
    const html = renderEmail({
      intro: `A new account has been created on DataCircles.`,
      blocks: [{
        rows: [
          { label: 'Organisation', value: orgName },
          { label: 'Name', value: user?.name || 'N/A' },
          { label: 'Contact', value: userContact(user) },
          { label: 'Phone', value: user?.phone || 'N/A' },
          { label: 'Created on', value: fmtDate(new Date()) },
        ],
      }],
      preheader: `New account: ${orgName}`,
    });
    await sendGridMail({
      to: getAlertRecipients(),
      subject: `New account created: ${orgName}`,
      html,
    });
  } catch (err) {
    console.error('[internalAlertEmails] new-account alert failed:', err.message);
  }
}

async function sendNewTrialAlert(user, organization, trialEnd, planName) {
  try {
    const orgName = organization?.name || 'N/A';
    const html = renderEmail({
      intro: `A new customer has started a free trial on DataCircles.`,
      blocks: [{
        rows: [
          { label: 'Organisation', value: orgName },
          { label: 'Name', value: user?.name || 'N/A' },
          { label: 'Contact', value: userContact(user) },
          { label: 'Plan trialled', value: titleCase(planName || 'growth') },
          { label: 'Trial ends', value: fmtDate(trialEnd) },
        ],
      }],
      preheader: `New trial started: ${orgName}`,
    });
    await sendGridMail({
      to: getAlertRecipients(),
      subject: `New free trial started: ${orgName}`,
      html,
    });
  } catch (err) {
    console.error('[internalAlertEmails] new-trial alert failed:', err.message);
  }
}

async function sendNewSubscriptionAlert(subscription) {
  try {
    const Organization = require('../models/Organization');
    const User = require('../models/User');
    const [organization, admin] = await Promise.all([
      Organization.findById(subscription.organization),
      User.findOne({ organization: subscription.organization, role: 'admin' }),
    ]);
    const orgName = organization?.name || 'N/A';
    const html = renderEmail({
      intro: `A customer has bought a DataCircles subscription.`,
      blocks: [{
        rows: [
          { label: 'Organisation', value: orgName },
          { label: 'Admin', value: admin?.name || 'N/A' },
          { label: 'Contact', value: userContact(admin) },
          { label: 'Plan', value: titleCase(subscription.planName) },
          { label: 'Billing cycle', value: titleCase(subscription.billingCycle) },
          { label: 'Amount', value: fmtRupees(subscription.totalAmount) },
          { label: 'Purchased on', value: fmtDate(new Date()) },
        ],
      }],
      preheader: `New subscription: ${orgName}`,
    });
    await sendGridMail({
      to: getAlertRecipients(),
      subject: `New subscription purchased: ${orgName} (${titleCase(subscription.planName)})`,
      html,
    });
  } catch (err) {
    console.error('[internalAlertEmails] new-subscription alert failed:', err.message);
  }
}

module.exports = { sendNewAccountAlert, sendNewTrialAlert, sendNewSubscriptionAlert };
