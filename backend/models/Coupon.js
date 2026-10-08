// models/Coupon.js
//
// Generic discount-rule storage. Deliberately modeled as a standalone "rule"
// document rather than baking coupon-specific fields into billing code — the
// same shape (scope + rules + validity + limits) is meant to be reusable
// later for referral rewards, support credits, or promo campaigns by adding a
// `source` value, not by rewriting this schema.
//
// Discount lives on each PRODUCT RULE, not on the coupon itself. A single
// coupon can give 30% off Starter, 15% off Growth, ₹100 off Seats, and
// nothing off Storage — all in one code. A line item with no matching rule
// gets zero discount; there is no coupon-level fallback discount.
const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, trim: true, uppercase: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },

  isActive: { type: Boolean, default: true },

  // Where this rule is usable.
  scope: {
    type: { type: String, enum: ['global', 'organizations'], required: true, default: 'global' },
    organizations: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Organization' }],
  },

  // Per-product discount rules. `productType` + `productKey` identify the
  // line item this rule prices (e.g. { plan, starter } or { addon, seat }).
  // A line item with no matching enabled rule receives no discount.
  rules: [
    {
      productType: { type: String, enum: ['plan', 'addon'], required: true },
      productKey: { type: String, required: true }, // planId (starter/growth/business) or addon key
      discountType: { type: String, enum: ['percentage', 'fixed'], required: true },
      discountValue: { type: Number, required: true, min: 0 },
    },
  ],

  eligibility: {
    billingCycle: { type: String, enum: ['monthly', 'yearly', 'both'], default: 'both' },
  },

  // How long this coupon's discount stays in effect on a subscription once
  // applied. IMPORTANT: only 'lifetime' and 'until_cancelled' are actually
  // enforced today — the discount is baked into a fixed-price recurring
  // Razorpay Plan at signup (see findOrCreateRazorpayPlan), which then bills
  // that amount forever with no further engine involvement. 'first_payment'
  // and 'fixed_cycles' would require the subscription to auto-revert to full
  // price after N renewals — Razorpay's API only supports scheduling a plan
  // change at the NEXT cycle boundary, not an arbitrary N-cycle delay, so
  // that needs a cron/webhook-driven counter that doesn't exist yet. Rejected
  // at creation time (see couponController.validateRules) rather than
  // silently behaving like 'lifetime' when the label promises otherwise.
  duration: {
    type: { type: String, enum: ['lifetime', 'first_payment', 'fixed_cycles', 'until_date', 'until_cancelled'], default: 'lifetime' },
    cycles: { type: Number }, // used only when type === 'fixed_cycles'
  },

  validity: {
    startDate: { type: Date },
    expiryDate: { type: Date },
  },

  usageLimits: {
    maxRedemptions: { type: Number, default: null }, // null = unlimited
    maxRedemptionsPerOrganization: { type: Number, default: null }, // null = unlimited
  },

  // Not enforced yet (only one coupon can be applied at checkout today), but
  // reserved so a future "combine with referral reward / loyalty credit"
  // feature doesn't need a schema migration. Higher priority wins when
  // multiple otherwise-stackable discounts could apply.
  stacking: {
    combinable: { type: Boolean, default: false },
    priority: { type: Number, default: 0 },
  },

  // Denormalized counters kept in lockstep with CouponRedemption so the admin
  // list view doesn't need an aggregation query per row. CouponRedemption
  // remains the source of truth for per-organization/detailed analytics.
  analytics: {
    totalRedemptions: { type: Number, default: 0 },
    totalDiscountValue: { type: Number, default: 0 },
    revenueInfluenced: { type: Number, default: 0 },
    organizationsUsed: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Organization' }],
    lastRedeemedAt: { type: Date },
  },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'SuperAdmin' },
}, { timestamps: true });

// `code` is already indexed (uniquely) by `unique: true` on the field above; a second
// couponSchema.index({ code: 1 }) here was a duplicate definition.
couponSchema.index({ isActive: 1 });

module.exports = mongoose.model('Coupon', couponSchema);
