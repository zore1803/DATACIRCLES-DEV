const mongoose = require("mongoose");

/*
 * Expenses and Indirect Income.
 *
 * One model, two `kind`s. The two records carry the same fields (amount, date,
 * category, notes, payment state) and differ only in direction and wording, so
 * splitting them into separate collections would duplicate every query,
 * controller and index for no gain. `kind` keeps them apart everywhere it
 * matters, and each has its own category list.
 *
 * Deliberately NOT a Payment: these are standalone ledger entries with no
 * counterparty document to settle, so they don't go through the allocation
 * engine. They do surface in the payments timeline as cash movements.
 *
 * The vendor link is OPTIONAL and off by default ("Create with vendor" in the
 * form). Most day-to-day spending has no counterparty worth recording, and
 * those entries fall back to their category wherever a party is shown. When a
 * vendor IS set the entry still stays a standalone ledger row — it does not
 * become a Payment and never enters the allocation engine, so it can't settle
 * a purchase bill. It simply attributes the spend.
 */

const EXPENSE_CATEGORIES = [
  "Rent", "Salaries", "Utilities", "Travel", "Meals & Entertainment",
  "Office Supplies", "Software & Subscriptions", "Marketing", "Professional Fees",
  "Repairs & Maintenance", "Insurance", "Bank Charges", "Taxes", "Freight & Delivery",
  "Fuel", "Telephone & Internet", "Training", "Personal", "Miscellaneous",
];

const INCOME_CATEGORIES = [
  "Interest Income", "Commission", "Rental Income", "Discount Received",
  "Scrap Sales", "Foreign Exchange Gain", "Dividend", "Refunds",
  "Miscellaneous Income",
];

const expenseSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ["expense", "income"],
      required: true,
      default: "expense",
    },
    // ALWAYS the base-currency (INR) amount. Every total, KPI and account
    // balance in the app reads this field, so it must stay in one currency —
    // a foreign entry is converted on save rather than stored raw here.
    amount: { type: Number, required: true, min: 0 },

    // Multi-currency. Default INR at rate 1, which is what an ordinary entry
    // carries; `foreignAmount` is what was actually typed, kept so the entry
    // can be shown in the currency it was incurred in without re-deriving it
    // from a rate that may since have changed.
    currency: { type: String, trim: true, uppercase: true, default: "INR" },
    exchangeRate: { type: Number, default: 1, min: 0 },
    foreignAmount: { type: Number, default: null },
    date: { type: Date, required: true, default: Date.now },
    category: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "" },

    // Optional counterparty — see the note above on what this does and
    // doesn't mean. Null for most entries.
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", default: null },

    // Optional Deal this entry is associated with. A plain reference and
    // nothing more: it never feeds Deal Value, invoice revenue or any total.
    // Deal stage/status changes leave it alone, and deleting the Deal unlinks
    // it (sets it back to null) rather than deleting this record.
    deal: { type: mongoose.Schema.Types.ObjectId, ref: "Deal", default: null },

    // Receipts and bills backing the entry. Stored as pointers to the
    // uploaded objects, not the bytes — the file itself lives in S3 behind
    // CloudFront, same as every other upload in the app.
    attachments: [
      {
        url: { type: String, required: true },
        name: { type: String, default: "" },
        size: { type: Number, default: 0 },
        mimeType: { type: String, default: "" },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],

    // Payment state. An entry can be recorded before it's paid, so the
    // amount and the settlement are tracked separately — same Pending/Paid
    // split the rest of the app uses.
    status: {
      type: String,
      enum: ["Pending", "Paid"],
      default: "Pending",
    },
    paymentDate: { type: Date, default: null },
    paymentType: {
      type: String,
      enum: ["UPI", "Cash", "Card", "Net Banking", "Cheque", "EMI", ""],
      default: "",
    },
    // The bank account the money moved through, so these entries can feed the
    // per-account balances the payments timeline already computes.
    bankAccount: { type: mongoose.Schema.Types.ObjectId, ref: "BankDetails", default: null },
    paymentNotes: { type: String, trim: true, default: "" },

    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
  },
  { timestamps: true }
);

expenseSchema.index({ organization: 1, kind: 1, date: -1 });
expenseSchema.index({ organization: 1, kind: 1, status: 1 });
expenseSchema.index({ organization: 1, deal: 1 });

module.exports = mongoose.model("Expense", expenseSchema);
module.exports.EXPENSE_CATEGORIES = EXPENSE_CATEGORIES;
module.exports.INCOME_CATEGORIES = INCOME_CATEGORIES;
