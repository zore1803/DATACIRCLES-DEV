const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const authMiddleware = require('../middlewares/auth');

// No subscriptionGate/restrictByPlan here: the wallet is independent of the
// subscription, so plan state must not gate access to prepaid credits.
const requireAuth = [authMiddleware, require('../middlewares/userSync')];

router.get('/', requireAuth, walletController.getWallet);
router.get('/transactions', requireAuth, walletController.getTransactions);
router.post('/order', requireAuth, walletController.createOrder);
router.post('/verify', requireAuth, walletController.verifyPayment);
router.post('/reminder', requireAuth, walletController.setReminder);

module.exports = router;
