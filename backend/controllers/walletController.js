const walletService = require('../services/walletService');

const getWallet = async (req, res) => {
  try {
    const [wallet, config] = await Promise.all([
      walletService.getOrCreateWallet(req.user.organization),
      walletService.getConfig(),
    ]);

    res.json({
      balance: wallet.balance,
      creditValueInRupees: config.creditValueInRupees,
      gstRate: config.gstRate,
      usagePricing: config.usagePricing,
      reminderThreshold: wallet.reminderThreshold,
      reminderEmail: wallet.reminderEmail,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getTransactions = async (req, res) => {
  try {
    const result = await walletService.listTransactions(req.user.organization, {
      page: req.query.page,
      limit: req.query.limit,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const createOrder = async (req, res) => {
  try {
    const result = await walletService.createTopupOrder(
      req.user.organization,
      req.body.credits
    );
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const verifyPayment = async (req, res) => {
  try {
    const result = await walletService.verifyAndCreditTopup(
      req.user.organization,
      req.body
    );
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const setReminder = async (req, res) => {
  try {
    const { threshold, email } = req.body;
    if (threshold !== null && !(Number(threshold) >= 0)) {
      return res.status(400).json({ error: 'threshold must be a non-negative number or null' });
    }
    const wallet = await walletService.setReminder(req.user.organization, threshold, email);
    res.json({ reminderThreshold: wallet.reminderThreshold, reminderEmail: wallet.reminderEmail });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

module.exports = { getWallet, getTransactions, createOrder, verifyPayment, setReminder };
