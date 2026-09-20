// models/ReferralInvite.js
//
// A log of referral invitation EMAILS an org has sent. Deliberately NOT a
// Referral: sending mail is not a referral event (REFERRAL_SYSTEM_DESIGN.md
// — a Referral only exists once the recipient registers with the code), so
// this model never feeds pricing, qualification or rewards. It exists only
// so the Referrals page can show "you invited these people" after a reload,
// which session-only state could not.
//
// One row per (organization, email): re-inviting the same address updates
// the existing row (lastSentAt/sendCount) instead of stacking duplicates.
const mongoose = require('mongoose');

const referralInviteSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  invitedByName: { type: String, trim: true },
  referralCode: { type: mongoose.Schema.Types.ObjectId, ref: 'ReferralCode' },
  lastSentAt: { type: Date, default: Date.now },
  sendCount: { type: Number, default: 1 },
}, { timestamps: true });

referralInviteSchema.index({ organization: 1, email: 1 }, { unique: true });

module.exports = mongoose.model('ReferralInvite', referralInviteSchema);
