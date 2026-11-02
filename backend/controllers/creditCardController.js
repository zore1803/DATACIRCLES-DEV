const CreditCard = require("../models/CreditCard");

const NETWORKS = ["Visa", "Mastercard", "RuPay", "Amex", "Diners", "Other"];

// Picks only the fields a client may set. `last4` is derived from `cardNumber`
// when one is sent; the number itself is never stored.
function sanitizeCardPayload(body = {}, { requireNumber }) {
  const out = {
    cardHolder: String(body.cardHolder || "").trim(),
    bank: String(body.bank || "").trim(),
    network: NETWORKS.includes(body.network) ? body.network : "Other",
    isDefault: Boolean(body.isDefault),
    expiryMonth: Number(body.expiryMonth),
    expiryYear: Number(body.expiryYear),
  };
  if (!out.cardHolder) throw new Error("Card holder name is required");
  if (!out.bank) throw new Error("Bank name is required");
  if (!(out.expiryMonth >= 1 && out.expiryMonth <= 12) || !(out.expiryYear >= 2000)) {
    throw new Error("A valid expiry date is required");
  }

  const digits = String(body.cardNumber || "").replace(/\D/g, "");
  if (digits) {
    if (digits.length < 13 || digits.length > 19) throw new Error("Card number must be 13-19 digits");
    out.last4 = digits.slice(-4);
  } else if (requireNumber) {
    throw new Error("Card number is required");
  }
  return out;
}

// At most one default card per organization.
const clearOtherDefaults = (organization, exceptId) =>
  CreditCard.updateMany(
    { organization, isDefault: true, ...(exceptId ? { _id: { $ne: exceptId } } : {}) },
    { isDefault: false }
  );

exports.getAllCreditCards = async (req, res) => {
  try {
    if (!req.user.organization) {
      return res.status(403).json({ error: "No organization on this account" });
    }
    const cards = await CreditCard.find({ organization: req.user.organization }).sort({ createdAt: -1 });
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createCreditCard = async (req, res) => {
  try {
    if (!req.user.organization) {
      return res.status(403).json({ error: "No organization on this account" });
    }
    const payload = sanitizeCardPayload(req.body, { requireNumber: true });
    // The first card is the default without being asked.
    if (!(await CreditCard.exists({ organization: req.user.organization }))) payload.isDefault = true;
    if (payload.isDefault) await clearOtherDefaults(req.user.organization);
    const card = await CreditCard.create({
      ...payload,
      organization: req.user.organization,
      user: req.user._id,
    });
    res.status(201).json(card);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.updateCreditCard = async (req, res) => {
  try {
    if (!req.user.organization) {
      return res.status(403).json({ error: "No organization on this account" });
    }
    const payload = sanitizeCardPayload(req.body, { requireNumber: false });
    if (payload.isDefault) await clearOtherDefaults(req.user.organization, req.params.id);
    const updated = await CreditCard.findOneAndUpdate(
      { _id: req.params.id, organization: req.user.organization },
      payload,
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ error: "Credit card not found" });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.setDefaultCreditCard = async (req, res) => {
  try {
    if (!req.user.organization) {
      return res.status(403).json({ error: "No organization on this account" });
    }
    const card = await CreditCard.findOne({ _id: req.params.id, organization: req.user.organization });
    if (!card) return res.status(404).json({ error: "Credit card not found" });
    await clearOtherDefaults(req.user.organization, card._id);
    card.isDefault = true;
    await card.save();
    res.json(card);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.deleteCreditCard = async (req, res) => {
  try {
    if (!req.user.organization) {
      return res.status(403).json({ error: "No organization on this account" });
    }
    const deleted = await CreditCard.findOneAndDelete({
      _id: req.params.id,
      organization: req.user.organization,
    });
    if (!deleted) return res.status(404).json({ error: "Credit card not found" });
    if (deleted.isDefault) {
      const next = await CreditCard.findOne({ organization: req.user.organization }).sort({ updatedAt: -1 });
      if (next) {
        next.isDefault = true;
        await next.save();
      }
    }
    res.json({ message: "Credit card deleted successfully" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
