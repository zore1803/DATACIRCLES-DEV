const mongoose = require("mongoose");

// Only the last four digits of the card are ever stored. The full number is
// validated in the browser and then discarded: keeping a complete card number
// would put this database in PCI-DSS scope, and nothing in the app needs it.
const creditCardSchema = new mongoose.Schema(
  {
    cardHolder: { type: String, required: true, trim: true },
    bank: { type: String, required: true, trim: true },
    last4: { type: String, required: true, match: /^\d{4}$/ },
    network: {
      type: String,
      enum: ["Visa", "Mastercard", "RuPay", "Amex", "Diners", "Other"],
      default: "Other",
    },
    expiryMonth: { type: Number, required: true, min: 1, max: 12 },
    expiryYear: { type: Number, required: true, min: 2000, max: 2100 },
    isDefault: { type: Boolean, default: false },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

creditCardSchema.index({ organization: 1, createdAt: -1 });

module.exports = mongoose.model("CreditCard", creditCardSchema);
