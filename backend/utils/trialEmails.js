// utils/trialEmails.js
//
// Email senders for the trial lifecycle: started, ending soon (48h/24h),
// and expired. All three use the shared renderEmail shell so they match
// every other DataCircles email.
//
// NOTE: the actual From address is controlled by the SendGrid configuration,
// not by the `from` value passed here, so it is not set in this file.

const sendGridMail = require('./sendGridMail');
const { renderEmail } = require('./emailLayout');
const { sendNewTrialAlert } = require('./internalAlertEmails');

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// Picks the right email field depending on how the user signed up.
// Google/GitHub/Facebook users have `email`; phone-signup users have
// `profileEmail` instead. Falls back gracefully if neither exists (should
// be rare, but better to skip sending than crash the cron job).
function getUserEmail(user) {
  return user?.email || user?.profileEmail || null;
}

async function sendTrialStartedEmail(user, organization, trialEnd, planName) {
  // Internal heads-up to the DataCircles team; independent of whether the
  // customer themself has an email address.
  await sendNewTrialAlert(user, organization, trialEnd, planName);

  const toEmail = getUserEmail(user);
  if (!toEmail) {
    console.warn(`[trialEmails] No email found for user ${user?._id}, skipping trial-started email`);
    return;
  }

  // Plan id ("growth", "business") -> display label ("Growth plan",
  // "Business plan"). Falls back to "Growth plan" if no plan is passed.
  const raw = (planName || 'growth').trim();
  const planLabel = `${raw.charAt(0).toUpperCase()}${raw.slice(1)} plan`;

  const orgName = organization?.name || 'your workspace';
  const trialEndFormatted = fmtDate(trialEnd);

  const html = renderEmail({
    greetingName: user.name || null,
    intro: [
      `Your 7-day free trial for <strong>${orgName}</strong> is now active, with full access to all ${planLabel} features.`,
      `Your trial ends on <strong>${trialEndFormatted}</strong>. You can choose a plan at any time from Settings &gt; Subscription, and your data and setup carry over.`,
    ],
    preheader: `Your DataCircles trial for ${orgName} is active until ${trialEndFormatted}.`,
  });

  await sendGridMail({
    to: toEmail,
    subject: 'Your DataCircles trial is active',
    html,
  });
}

async function sendTrialEndingEmail(user, organization, trialEnd, hoursRemaining) {
  const toEmail = getUserEmail(user);
  if (!toEmail) {
    console.warn(`[trialEmails] No email found for user ${user?._id}, skipping trial-ending email`);
    return;
  }

  const orgName = organization?.name || 'your workspace';
  const trialEndFormatted = fmtDate(trialEnd);

  const html = renderEmail({
    greetingName: user.name || null,
    intro: [
      `Your free trial for <strong>${orgName}</strong> ends in about ${hoursRemaining} hours, on <strong>${trialEndFormatted}</strong>.`,
      'To keep adding and editing data after that, choose a plan. Your existing data stays available to view either way.',
    ],
    ctaLabel: 'Choose a plan',
    ctaUrl: `${process.env.FRONTEND_URL}/subscription`,
    preheader: `Your DataCircles trial for ${orgName} ends on ${trialEndFormatted}.`,
  });

  await sendGridMail({
    to: toEmail,
    subject: `Your DataCircles trial ends on ${trialEndFormatted}`,
    html,
  });
}

async function sendTrialExpiredEmail(user, organization) {
  const toEmail = getUserEmail(user);
  if (!toEmail) {
    console.warn(`[trialEmails] No email found for user ${user?._id}, skipping trial-expired email`);
    return;
  }

  const orgName = organization?.name || 'your workspace';

  const html = renderEmail({
    greetingName: user.name || null,
    intro: [
      `Your free trial for <strong>${orgName}</strong> has ended. Your data is safe and you can still sign in to view everything you've added.`,
      'To start adding and editing again, choose a plan that fits your team.',
    ],
    ctaLabel: 'Choose a plan',
    ctaUrl: `${process.env.FRONTEND_URL}/subscription`,
    preheader: `Your DataCircles trial for ${orgName} has ended.`,
  });

  await sendGridMail({
    to: toEmail,
    subject: 'Your DataCircles trial has ended',
    html,
  });
}

module.exports = {
  sendTrialStartedEmail,
  sendTrialEndingEmail,
  sendTrialExpiredEmail,
};
