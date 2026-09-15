// scripts/createRazorpayPlans.js
// Run this ONCE to create subscription plans in your Razorpay account
// and update the PlanConfig in MongoDB with the real plan IDs.

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Razorpay = require('razorpay');
const PlanConfig = require('../models/PlanConfig');
const RazorpayPriceCache = require('../models/RazorpayPriceCache');

dotenv.config();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Plan definitions — amounts are in paise (INR × 100)
const plans = [
  {
    planId: 'starter',
    name: 'Starter Plan',
    monthlyAmount: 25000,   // ₹250/user/month
    yearlyAmount: 240000,   // ₹2400/user/year (₹200/month)
  },
  {
    planId: 'growth',
    name: 'Growth Plan',
    monthlyAmount: 45000,   // ₹450/user/month
    yearlyAmount: 480000,   // ₹4800/user/year (₹400/month)
  },
  {
    planId: 'business',
    name: 'Business Plan',
    monthlyAmount: 65000,   // ₹650/user/month
    yearlyAmount: 720000,   // ₹7200/user/year (₹600/month)
  },
];

async function createRazorpayPlan(name, interval, amount) {
  const plan = await razorpay.plans.create({
    period: interval === 'monthly' ? 'monthly' : 'yearly',
    interval: 1,
    item: {
      name,
      amount,
      currency: 'INR',
    },
  });
  return plan.id;
}

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB connected');
    console.log(`Razorpay key mode: ${String(process.env.RAZORPAY_KEY_ID).startsWith('rzp_live_') ? 'LIVE' : 'TEST'}`);

    // Cached amount→plan IDs belong to whichever Razorpay account created
    // them; test and live are separate accounts, so after a key switch every
    // cached ID is invalid and addon purchases would reuse them.
    const { deletedCount } = await RazorpayPriceCache.deleteMany({});
    console.log(`Cleared ${deletedCount} cached Razorpay price plan(s)`);

    for (const plan of plans) {
      console.log(`\nCreating Razorpay plans for: ${plan.name}`);

      const monthlyId = await createRazorpayPlan(
        `${plan.name} - Monthly`,
        'monthly',
        plan.monthlyAmount,
      );
      console.log(`  Monthly plan ID: ${monthlyId}`);

      const yearlyId = await createRazorpayPlan(
        `${plan.name} - Yearly`,
        'yearly',
        plan.yearlyAmount,
      );
      console.log(`  Yearly plan ID: ${yearlyId}`);

      const updated = await PlanConfig.findOneAndUpdate(
        { planId: plan.planId },
        { $set: { 'razorpayPlanIds.monthly': monthlyId, 'razorpayPlanIds.yearly': yearlyId } },
        { new: true },
      );

      if (updated) {
        console.log(`  ✅ PlanConfig updated for "${plan.planId}"`);
      } else {
        console.warn(`  ⚠️  No PlanConfig found for "${plan.planId}" — run seedPlans.js first`);
      }
    }

    console.log('\n✅ All Razorpay plans created and PlanConfig updated.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message || err);
    process.exit(1);
  }
}

run();
