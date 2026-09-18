// services/walletService.js
//
// Prepaid credit wallet. Completely independent of Subscription — nothing here
// reads or writes subscription state, and subscription lifecycle events must
// never touch the wallet. Future usage-based features consume credits through
// the generic debit() below; there are deliberately no feature-specific
// helpers (no debitWhatsApp(), etc).
//
// Units: every `amount` in this module is CREDITS, never rupees. Money only
// appears at purchase time, where credits are converted via
// WalletConfig.creditValueInRupees.

const mongoose = require('mongoose');
const crypto = require('crypto');
const razorpay = require('../config/razorpay');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const WalletConfig = require('../models/WalletConfig');
const sendGridMail = require('../utils/sendGridMail');

const RAZORPAY_ORDER_REF = 'razorpay_order';

/**
 * Purpose: Read the singleton wallet configuration, creating it with defaults
 * on first access so Super Admin always has a document to edit.
 * Outputs: Promise<WalletConfigDocument>
 */
async function getConfig() {
  let config = await WalletConfig.findOne();
  if (!config) {
    config = await WalletConfig.create({});
  }
  return config;
}

/**
 * Purpose: Update Super-Admin-editable wallet configuration.
 * Inputs: patch: { creditValueInRupees?, defaultFreeCredits?, gstRate?, usagePricing? }
 * Outputs: Promise<WalletConfigDocument>
 */
async function updateConfig(patch) {
  const config = await getConfig();
  const allowed = ['creditValueInRupees', 'defaultFreeCredits', 'gstRate', 'usagePricing'];
  allowed.forEach((key) => {
    if (patch[key] !== undefined) config[key] = patch[key];
  });
  await config.save();
  return config;
}

/**
 * Purpose: Fetch an organization's wallet, creating it on first access. New
 * wallets are seeded with WalletConfig.defaultFreeCredits as a FREE_CREDIT
 * ledger entry so the grant is auditable rather than an unexplained balance.
 * Inputs: organizationId: ObjectId|string
 * Outputs: Promise<WalletDocument>
 * Side effects: may insert one Wallet and one WalletTransaction
 */
async function getOrCreateWallet(organizationId) {
  const existing = await Wallet.findOne({ organization: organizationId });
  if (existing) return existing;

  // upsert rather than create: two concurrent first-time reads must not both insert
  await Wallet.updateOne(
    { organization: organizationId },
    { $setOnInsert: { organization: organizationId, balance: 0 } },
    { upsert: true }
  );

  const config = await getConfig();
  if (config.defaultFreeCredits > 0) {
    const alreadySeeded = await WalletTransaction.exists({
      organization: organizationId,
      type: 'FREE_CREDIT',
      referenceType: 'signup_free_credits',
    });
    if (!alreadySeeded) {
      await credit(organizationId, config.defaultFreeCredits, {
        type: 'FREE_CREDIT',
        source: 'FREE',
        description: 'Free signup credits',
        referenceType: 'signup_free_credits',
        referenceId: `signup:${organizationId}`,
      });
    }
  }

  return Wallet.findOne({ organization: organizationId });
}

/**
 * Purpose: Current credit balance for an organization.
 * Outputs: Promise<number>
 */
async function getBalance(organizationId) {
  const wallet = await getOrCreateWallet(organizationId);
  return wallet.balance;
}

/**
 * Purpose: Set (or clear, with threshold=null) the low-balance email
 * reminder for an organization's wallet.
 * Inputs: organizationId, threshold (number|null), email (string)
 * Outputs: Promise<WalletDocument>
 */
async function setReminder(organizationId, threshold, email) {
  const wallet = await getOrCreateWallet(organizationId);
  wallet.reminderThreshold = threshold === null ? null : Number(threshold);
  wallet.reminderEmail = email || null;
  // A newly (re)armed reminder should be able to fire again even if the
  // balance is already below the new threshold.
  wallet.reminderAlertSent = false;
  await wallet.save();
  return wallet;
}

// Fires the low-balance email once per dip below threshold, and re-arms
// itself once the balance recovers above it (e.g. after a top-up).
async function checkReminder(organizationId, balanceAfter) {
  const wallet = await Wallet.findOne({ organization: organizationId });
  if (!wallet || wallet.reminderThreshold == null || !wallet.reminderEmail) return;

  if (balanceAfter <= wallet.reminderThreshold && !wallet.reminderAlertSent) {
    wallet.reminderAlertSent = true;
    await wallet.save();
    try {
      await sendGridMail({
        to: wallet.reminderEmail,
        subject: 'DataCircles wallet balance is running low',
        text: `Your wallet balance has dropped to ${balanceAfter} credits, at or below your reminder threshold of ${wallet.reminderThreshold} credits. Add credits to avoid interruption.`,
      });
    } catch (err) {
      console.error('Failed to send wallet low-balance reminder email:', err);
    }
  } else if (balanceAfter > wallet.reminderThreshold && wallet.reminderAlertSent) {
    wallet.reminderAlertSent = false;
    await wallet.save();
  }
}

/**
 * Purpose: Paginated ledger for an organization, newest first.
 * Inputs: organizationId, { page = 1, limit = 20 }
 * Outputs: Promise<{ transactions, page, limit, total, totalPages }>
 */
async function listTransactions(organizationId, { page = 1, limit = 20 } = {}) {
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 200);

  const [transactions, total] = await Promise.all([
    WalletTransaction.find({ organization: organizationId })
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    WalletTransaction.countDocuments({ organization: organizationId }),
  ]);

  return {
    transactions,
    page: safePage,
    limit: safeLimit,
    total,
    totalPages: Math.ceil(total / safeLimit) || 1,
  };
}

/**
 * Purpose: Add credits to a wallet and record the matching ledger entry. The
 * balance update and ledger insert commit together in one Mongo transaction so
 * a balance can never move without an explaining ledger row.
 * Inputs:
 *   organizationId, amount (positive credits),
 *   { type, source, description, referenceType?, referenceId?, razorpayPaymentId?, metadata?, createdBy? }
 * Outputs: Promise<{ balance, transaction }>
 * Errors thrown: on non-positive amount
 */
async function credit(organizationId, amount, opts = {}) {
  if (!(amount > 0)) {
    throw new Error('Credit amount must be greater than zero');
  }
  return applyLedgerEntry(organizationId, amount, opts);
}

/**
 * Purpose: The generic spend entry point for every future usage-based feature.
 * Balance check and decrement happen in a single conditional update so
 * concurrent debits can never drive the balance negative.
 * Inputs: organizationId, amount (positive credits to spend), { description, referenceType?, referenceId?, metadata? }
 * Outputs: Promise<{ balance, transaction }>
 * Errors thrown: on non-positive amount; 'Insufficient wallet balance' when balance < amount
 */
async function debit(organizationId, amount, opts = {}) {
  if (!(amount > 0)) {
    throw new Error('Debit amount must be greater than zero');
  }
  return applyLedgerEntry(organizationId, -amount, {
    type: 'USAGE_DEBIT',
    source: 'USAGE',
    ...opts,
  });
}

// Shared atomic core for credit() and debit(). `delta` is signed credits.
async function applyLedgerEntry(organizationId, delta, opts) {
  const {
    type,
    source,
    description,
    referenceType,
    referenceId,
    razorpayPaymentId,
    metadata,
    createdBy,
  } = opts;

  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      // The $gte guard is what actually prevents a negative balance under
      // concurrent debits — not a read-then-write check.
      const filter = { organization: organizationId };
      if (delta < 0) filter.balance = { $gte: -delta };

      const wallet = await Wallet.findOneAndUpdate(
        filter,
        { $inc: { balance: delta }, $setOnInsert: { organization: organizationId } },
        { new: false, session, upsert: delta > 0 }
      );

      if (!wallet && delta < 0) {
        throw new Error('Insufficient wallet balance');
      }

      const balanceBefore = wallet ? wallet.balance : 0;
      const balanceAfter = balanceBefore + delta;

      const [transaction] = await WalletTransaction.create(
        [
          {
            organization: organizationId,
            type,
            amount: delta,
            balanceBefore,
            balanceAfter,
            description,
            source,
            referenceType,
            referenceId,
            razorpayPaymentId,
            metadata,
            createdBy,
          },
        ],
        { session }
      );

      result = { balance: balanceAfter, transaction };
    });
  } finally {
    await session.endSession();
  }
  await checkReminder(organizationId, result.balance);
  return result;
}

/**
 * Purpose: Price a credit top-up and open a one-time Razorpay Order for it.
 * Nothing is credited here — credits are only granted after the payment is
 * verified server-side in verifyAndCreditTopup.
 * Inputs: organizationId, requestedCredits (number of credits to buy)
 * Outputs: Promise<{ order, credits, subtotal, gst, gstRate, total, creditValueInRupees }>
 *          (money values in rupees; order.amount is paise, as Razorpay requires)
 * Side effects: one razorpay.orders.create call
 */
async function createTopupOrder(organizationId, requestedCredits) {
  const credits = Number(requestedCredits);
  if (!(credits > 0)) {
    throw new Error('Credits to purchase must be greater than zero');
  }

  const config = await getConfig();
  const subtotal = round2(credits * config.creditValueInRupees);
  const gst = round2((subtotal * config.gstRate) / 100);
  const total = round2(subtotal + gst);

  const order = await razorpay.orders.create({
    amount: Math.round(total * 100),
    currency: 'INR',
    receipt: `wallet_${organizationId}_${Date.now()}`.slice(0, 40),
    notes: {
      organization_id: String(organizationId),
      type: 'wallet_topup',
      credits: String(credits),
    },
  });

  return {
    order,
    // Frontend never hardcodes the gateway key — same convention as the
    // subscription checkout's paymentDetails.
    key: process.env.RAZORPAY_KEY_ID,
    credits,
    subtotal,
    gst,
    gstRate: config.gstRate,
    total,
    creditValueInRupees: config.creditValueInRupees,
  };
}

/**
 * Purpose: Verify a completed Razorpay checkout and credit the purchased
 * credits exactly once. Idempotent: a repeated call for the same order returns
 * the original transaction instead of granting credits twice.
 * Inputs: organizationId, { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 * Outputs: Promise<{ balance, transaction, alreadyProcessed }>
 * Errors thrown: on missing fields, invalid signature, or credits missing from the order
 */
async function verifyAndCreditTopup(organizationId, payload = {}) {
  const {
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: signature,
  } = payload;

  if (!orderId || !paymentId || !signature) {
    throw new Error('razorpay_order_id, razorpay_payment_id and razorpay_signature are required');
  }

  const existing = await WalletTransaction.findOne({
    referenceType: RAZORPAY_ORDER_REF,
    referenceId: orderId,
  });
  if (existing) {
    const wallet = await getOrCreateWallet(organizationId);
    return { balance: wallet.balance, transaction: existing, alreadyProcessed: true };
  }

  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  const provided = Buffer.from(signature, 'utf8');
  const computed = Buffer.from(expected, 'utf8');
  if (provided.length !== computed.length || !crypto.timingSafeEqual(provided, computed)) {
    throw new Error('Invalid payment signature');
  }

  // Trust the order stored on Razorpay's side for the credit quantity rather
  // than anything the client sent back with the verify call.
  const order = await razorpay.orders.fetch(orderId);
  if (String(order.notes?.organization_id) !== String(organizationId)) {
    throw new Error('Order does not belong to this organization');
  }
  const credits = Number(order.notes?.credits);
  if (!(credits > 0)) {
    throw new Error('Order is missing a valid credit quantity');
  }

  try {
    const applied = await credit(organizationId, credits, {
      type: 'CREDIT_PURCHASE',
      source: 'PURCHASE',
      description: `Purchased ${credits} credits`,
      referenceType: RAZORPAY_ORDER_REF,
      referenceId: orderId,
      razorpayPaymentId: paymentId,
      metadata: { amountPaid: order.amount / 100, currency: order.currency },
    });
    return { ...applied, alreadyProcessed: false };
  } catch (err) {
    // The unique index caught a duplicate that raced past the pre-check above.
    if (err.code === 11000) {
      const tx = await WalletTransaction.findOne({
        referenceType: RAZORPAY_ORDER_REF,
        referenceId: orderId,
      });
      const wallet = await getOrCreateWallet(organizationId);
      return { balance: wallet.balance, transaction: tx, alreadyProcessed: true };
    }
    throw err;
  }
}

/**
 * Purpose: Super Admin grants credits to an organization, with a stated reason.
 * Inputs: organizationId, amount (positive credits), reason, superAdminId
 * Outputs: Promise<{ balance, transaction }>
 */
async function grantAdminCredit(organizationId, amount, reason, superAdminId) {
  if (!reason) {
    throw new Error('A reason is required for an admin credit grant');
  }
  await getOrCreateWallet(organizationId);
  return credit(organizationId, Number(amount), {
    type: 'ADMIN_CREDIT',
    source: 'ADMIN',
    description: reason,
    referenceType: 'admin_grant',
    referenceId: `admin:${organizationId}:${Date.now()}`,
    createdBy: superAdminId,
  });
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

module.exports = {
  getConfig,
  updateConfig,
  getOrCreateWallet,
  getBalance,
  setReminder,
  listTransactions,
  credit,
  debit,
  createTopupOrder,
  verifyAndCreditTopup,
  grantAdminCredit,
};
