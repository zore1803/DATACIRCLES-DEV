const Expense = require("../models/Expense");

// A credit card is recorded on payments and expenses as a label, the same way a
// bank is recorded as its name. The separator makes a card row impossible to
// mistake for a bank whose name happens to be a prefix of it ("HDFC Bank").
const CARD_MARK = " Credit Card ••••";
const cardLabel = (c) => `${c.bank}${CARD_MARK}${c.last4}`;
const isCardLabel = (s) => typeof s === "string" && s.includes(CARD_MARK);

// Paid expenses and indirect income as cash movements, in the same row shape the
// payments timeline and bank balances already use. Pending entries have not
// moved any money, so they are left out. `bankId` pins a row to the exact
// account it was paid from; the bank NAME is only a fallback for rows that
// predate it, since two accounts can share a bank.
async function getLedgerRows(orgId) {
  const entries = await Expense.find({ organization: orgId, status: "Paid" })
    .populate("bankAccount", "bank")
    .populate("creditCard", "bank last4")
    .populate("vendor", "name companyName")
    .lean();

  return entries.map((e) => {
    const isIncome = e.kind === "income";
    const bankName = e.creditCard
      ? cardLabel(e.creditCard)
      : e.bankAccount?.bank || (e.paymentType === "Cash" ? "Cash" : "");
    return {
      _id: e._id,
      "payment-id": String(e._id).substring(0, 8).toUpperCase(),
      party: e.vendor ? e.vendor.companyName || e.vendor.name : e.category || (isIncome ? "Indirect Income" : "Expense"),
      amount: e.amount,
      direction: isIncome ? "IN" : "OUT",
      type: e.paymentType || (isIncome ? "Indirect Income" : "Expense"),
      date: e.paymentDate || e.date,
      bank: bankName,
      bankId: e.bankAccount?._id || null,
      notes: e.paymentNotes || e.notes || "",
      reference: "",
      source: isIncome ? "Indirect Income" : "Expense",
      status: "Paid",
    };
  });
}

// Whether a transaction row belongs to this bank account.
function rowBelongsToBank(t, b) {
  if (isCardLabel(t.bank)) return false;
  if (t.bankId) return String(t.bankId) === String(b._id);
  if (!t.bank) return false;
  const bName = t.bank.toLowerCase();
  return (
    bName.includes((b.bank || "Bank Account").toLowerCase()) ||
    bName.includes((b.accountNumber || "").toLowerCase())
  );
}

// Whether a transaction row was paid with this credit card.
function rowBelongsToCard(t, c) {
  return t.bank === cardLabel(c);
}

module.exports = { getLedgerRows, rowBelongsToBank, rowBelongsToCard, cardLabel, isCardLabel };
