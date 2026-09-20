// models/Wallet.js
const mongoose = require('mongoose');

// Fast-access current balance only. The WalletTransaction ledger is the source
// of truth for what happened; this document is derived state kept in sync
// inside the same Mongo transaction as every ledger write (walletService).
const walletSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      unique: true,
    },
    // Denominated in credits, not rupees. Fractional credits are allowed
    // (usage pricing like 0.20 credits/message).
    balance: { type: Number, required: true, default: 0, min: 0 },

    // Optional low-balance email reminder, set from the Wallet page. Null
    // threshold means the reminder is off.
    reminderThreshold: { type: Number, default: null, min: 0 },
    reminderEmail: { type: String, default: null },
    // True once the alert has fired for the current dip below threshold, so
    // it doesn't re-send on every subsequent debit. Reset back to false when
    // the balance recovers above the threshold (a top-up) so the next dip
    // alerts again.
    reminderAlertSent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Wallet', walletSchema);
