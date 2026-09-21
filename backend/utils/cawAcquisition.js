// utils/cawAcquisition.js
//
// Shared Charge-at-Will mandate-acquisition logic (Registration Link
// creation), extracted so every call site that needs to acquire a new CAW
// mandate — currently `createSubscription`'s fresh-signup path and
// `updateSubscription`'s trial-conversion path, eventually the UPI
// cancel-and-recreate branch's CAW replacement too — shares one
// implementation instead of each re-deriving the Razorpay request shape.
//
// `createSubscription` (subscriptionController.js) is NOT refactored onto
// this — it is intentionally left untouched (out of scope for the
// trial-conversion migration) — but its Registration Link logic is what this
// was extracted from, and it is the reference implementation to keep this in
// sync with if Razorpay's request shape ever changes.
const razorpay = require('../config/razorpay');

// Mandate ceiling policy (docs/audit/MANDATE_STRATEGY_AND_ANNUAL_BILLING.md,
// final) — CONFIGURABLE business policy, not architecture. Same env var and
// default as subscriptionController.js's own copy — kept as a separate
// constant here (not re-exported from the controller) so this module has no
// dependency on the controller, only the other way around.
//
// Registers at a FLAT ceiling, not firstInvoice × a multiplier (the
// superseded formula). Rationale: Razorpay mandate tokens cannot be edited
// post-registration (confirmed directly against Razorpay's own docs), so a
// per-customer, invoice-scaled ceiling that might later prove too low can
// never be resized — only replaced via a brand-new mandate requiring full
// customer re-authorization. Registering every mandate at Razorpay's own
// UPI/card AFA-free ceiling (₹15,000, confirmed against Razorpay's current
// docs) from day one means a resize is essentially never needed: any charge
// above it already requires Razorpay's own per-debit UPI-PIN confirmation
// regardless of what this app's own ceiling says, so raising our own ceiling
// further would not remove that friction anyway — ₹15,000 is the amount that
// actually matters, not some multiple of the customer's first invoice.
const MANDATE_CEILING_RUPEES = Number(process.env.CAW_MANDATE_CEILING_RUPEES) || 15000;
// Signature unchanged (still accepts firstInvoiceRupees) so every existing
// call site needs zero changes — the parameter is simply no longer used in
// the calculation.
function computeMandateMaxAmountRupees(_firstInvoiceRupees) {
  return MANDATE_CEILING_RUPEES;
}

// Found via live QA: with `method` omitted, Razorpay's hosted Registration
// Link page offered ONLY Cards (desktop and phone) even though UPI Autopay is
// activated on the account — it does not fall back to "every enabled method".
// So a method is always sent: the customer's pick from checkout, else UPI
// Autopay (what most Indian customers expect; ₹15,000 ceiling fits UPI's cap).
const MANDATE_METHODS = ['upi', 'card', 'emandate'];
function resolveMandateMethod(requested) {
  return MANDATE_METHODS.includes(requested) ? requested : 'upi';
}

// Fix (found via live QA): the stored phone is always a bare 10-digit
// string (authController.js's updateProfile validates only /^\d{10}$/,
// never storing a country code) — but this app is India-only today (per
// its own signup validation), and Razorpay's hosted Registration Link page
// was observed re-prompting the customer for a mobile number it had
// already been given, consistent with receiving a contact value with no
// country code to recognize. Prefixing +91 here, at the Razorpay-request
// boundary only, avoids touching the stored format (still bare 10 digits
// everywhere else — DB uniqueness checks, OTP flows, etc. are unaffected).
function formatContactForRazorpay(phone) {
  if (!phone) return phone;
  return phone.startsWith('+') ? phone : `+91${phone}`;
}

// Razorpay requires `contact` for recurring Registration Links (confirmed
// live during CAW validation: "The contact field is required for recurring
// links"). Throws rather than returning a value so every call site fails the
// same explicit way `createSubscription` already does.
function assertPhoneForRecurring(user) {
  if (!user.phone) {
    const err = new Error(
      'A contact phone number is required to set up recurring billing. Please add one to your profile before subscribing.'
    );
    err.isBillingProfileIncomplete = true;
    throw err;
  }
}

// Creates a Razorpay Registration Link for a customer/plan/cycle. Mirrors
// createSubscription's registrationLinkParams construction exactly (same
// field choices, same reasoning for what's omitted — see that function's own
// comments for why `method`/`expire_at` are left out by default).
async function createRegistrationLinkForOrg({
  user,
  planId,
  billingCycle,
  firstInvoiceRupees,
  receiptPrefix = 'caw',
  mandateMethod,
  expirySeconds = process.env.CAW_REGISTRATION_LINK_EXPIRY_SECONDS,
}) {
  assertPhoneForRecurring(user);

  const amountPaise = Math.round(firstInvoiceRupees * 100);
  const mandateMaxAmountRupees = computeMandateMaxAmountRupees(firstInvoiceRupees);
  const mandateMaxAmountPaise = Math.round(mandateMaxAmountRupees * 100);

  const registrationLinkParams = {
    customer: {
      name: user.name,
      email: user.email,
      contact: formatContactForRazorpay(user.phone),
    },
    type: 'link',
    amount: amountPaise,
    currency: 'INR',
    description: `${planId.charAt(0).toUpperCase() + planId.slice(1)} Plan - ${billingCycle}`,
    subscription_registration: {
      max_amount: mandateMaxAmountPaise,
      method: resolveMandateMethod(mandateMethod),
    },
    // Razorpay caps `receipt` at 40 chars — same constraint as
    // createSubscription's identical receipt construction.
    receipt: `${receiptPrefix}-${user.organization.toString().slice(-12)}-${Date.now().toString(36)}`,
    email_notify: true,
    sms_notify: false,
    notes: {
      organization_id: user.organization.toString(),
      plan_name: planId,
      billing_cycle: billingCycle,
    },
  };
  if (expirySeconds) {
    registrationLinkParams.expire_by = Math.floor(Date.now() / 1000) + Number(expirySeconds);
  }

  const registrationLink = await razorpay.subscriptions.createRegistrationLink(registrationLinkParams);
  return { registrationLink, mandateMaxAmountRupees };
}

module.exports = {
  assertPhoneForRecurring,
  createRegistrationLinkForOrg,
  computeMandateMaxAmountRupees,
  formatContactForRazorpay,
  resolveMandateMethod,
};
