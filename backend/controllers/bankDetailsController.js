const { buildFuzzySearchPattern } = require('../utils/searchRegex');
const BankDetails = require("../models/BankDetails");
const { getLedgerRows, rowBelongsToBank } = require("../utils/expenseLedger");
const getDefaultBankDetails = require("../utils/getDefaultBankDetails");
const Payment = require("../models/Payment");
const Invoice = require("../models/Invoice");
const Purchase = require("../models/Purchase");
const SubscriptionPayment = require("../models/SubscriptionPayment.js");

const clearOtherDefaults = async (organizationId, exceptId = null) => {
  const query = { organization: organizationId, isDefault: true };
  if (exceptId) query._id = { $ne: exceptId };
  await BankDetails.updateMany(query, { $set: { isDefault: false } });
};

const sanitizeBankPayload = (body = {}) => {
  const payload = { ...body };
  delete payload._id;
  delete payload.organization;
  delete payload.user;
  delete payload.createdAt;
  delete payload.updatedAt;
  delete payload.__v;
  if (payload.ifscCode) payload.ifscCode = String(payload.ifscCode).trim().toUpperCase();
  return payload;
};

exports.createBankDetails = async (req, res) => {
  try {
    if (!req.user.organization) {
      return res.status(403).json({ error: "No organization on this account" });
    }
    const payload = sanitizeBankPayload(req.body);

    if (payload.isDefault) {
      await clearOtherDefaults(req.user.organization);
    }

    const newBank = new BankDetails({
      ...payload,
      organization: req.user.organization,
      user: req.user._id,
    });
    const saved = await newBank.save();
    res.status(201).json(saved);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getLatestBankDetails = async (req, res) => {
  try {
    const bank = await getDefaultBankDetails(req.user.organization);
    res.json(bank);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getAllBankDetails = async (req, res) => {
  try {
    const orgId = req.user.organization;
    if (!orgId) {
      return res.status(403).json({ error: "No organization on this account" });
    }
    const { search } = req.query;
    let query = { organization: orgId };

    if (search) {
      query.$or = [
        { bank: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { accountHolder: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { branch: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { ifscCode: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { upi: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
      ];
    }

    const banks = await BankDetails.find(query).sort({ isDefault: -1, updatedAt: -1 });

    const [payments, invoices, purchases, subPayments, ledgerRows] = await Promise.all([
      Payment.find({ organization: orgId }),
      Invoice.find({ organization: orgId }),
      Purchase.find({ organization: orgId }),
      SubscriptionPayment.find({ organization: orgId }),
      getLedgerRows(orgId),
    ]);

    const formattedPayments = payments.map((p) => ({
      amount: p.amount,
      direction: p.direction,
      bank: p.bank || "",
      date: p.paymentDate,
    }));

    const formattedInvoices = invoices.map((inv) => ({
      amount: inv.amount,
      direction: "IN",
      bank: "",
      date: inv.date || inv.createdAt,
    }));

    const formattedPurchases = purchases.map((pur) => ({
      amount: pur.grandTotal || pur.subtotal,
      direction: "OUT",
      bank: "",
      date: pur.purchaseDate || pur.createdAt,
    }));

    const formattedSubs = subPayments.map((sub) => ({
      amount: sub.amount,
      direction: "OUT",
      bank: "",
      date: sub.createdAt,
    }));

    const allTransactions = [
      ...formattedPayments,
      ...formattedInvoices,
      ...formattedPurchases,
      ...formattedSubs,
      ...ledgerRows
    ];

    const banksWithBalances = banks.map((b) => {
      const bankName = b.bank || "Bank Account";
      const opening = Number(b.openingBalance) || 0;

      const bankTx = allTransactions.filter((t) => rowBelongsToBank(t, b));

      const inSum = bankTx.filter((t) => t.direction === "IN").reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
      const outSum = bankTx.filter((t) => t.direction === "OUT").reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
      const currentBalance = opening + inSum - outSum;

      const bankObj = b.toObject();
      bankObj.currentBalance = currentBalance;
      return bankObj;
    });

    res.json(banksWithBalances);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getBankDetailsById = async (req, res) => {
  try {
    if (!req.user.organization) {
      return res.status(403).json({ error: "No organization on this account" });
    }
    const bank = await BankDetails.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    });

    if (!bank) {
      return res.status(404).json({ error: "Bank details not found" });
    }

    res.json(bank);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.updateBankDetails = async (req, res) => {
  try {
    if (!req.user.organization) {
      return res.status(403).json({ error: "No organization on this account" });
    }
    if (req.params.id === "undefined") {
      const payload = sanitizeBankPayload(req.body);
      if (payload.isDefault) {
        await clearOtherDefaults(req.user.organization);
      }

      const newBank = new BankDetails({
        ...payload,
        organization: req.user.organization,
        user: req.user._id,
      });
      const saved = await newBank.save();
      return res.status(201).json(saved);
    }

    const payload = sanitizeBankPayload(req.body);

    if (payload.isDefault) {
      await clearOtherDefaults(req.user.organization, req.params.id);
    }

    const updated = await BankDetails.findOneAndUpdate(
      {
        _id: req.params.id,
        organization: req.user.organization,
      },
      payload,
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ error: "Bank details not found" });
    }

    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.setDefaultBankDetails = async (req, res) => {
  try {
    if (!req.user.organization) {
      return res.status(403).json({ error: "No organization on this account" });
    }
    const bank = await BankDetails.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    });

    if (!bank) {
      return res.status(404).json({ error: "Bank details not found" });
    }

    await clearOtherDefaults(req.user.organization, bank._id);
    bank.isDefault = true;
    await bank.save();

    res.json(bank);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.deleteBankDetails = async (req, res) => {
  try {
    if (!req.user.organization) {
      return res.status(403).json({ error: "No organization on this account" });
    }
    const deleted = await BankDetails.findOneAndDelete({
      _id: req.params.id,
      organization: req.user.organization,
    });

    if (!deleted) {
      return res.status(404).json({ error: "Bank details not found" });
    }

    if (deleted.isDefault) {
      const nextDefault = await BankDetails.findOne({
        organization: req.user.organization,
      }).sort({ updatedAt: -1 });

      if (nextDefault) {
        nextDefault.isDefault = true;
        await nextDefault.save();
      }
    }

    res.json({ message: "Bank details deleted successfully" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
