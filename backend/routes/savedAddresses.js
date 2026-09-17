const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth');
const userSync = require('../middlewares/userSync');
const subscriptionGate = require('../middlewares/subscriptionGate');
const controller = require('../controllers/savedAddressController');

const requireAuth = [authMiddleware, userSync];

// Saved billing/shipping addresses, reusable across documents.
router.get('/', requireAuth, subscriptionGate, controller.listAddresses);
router.post('/', requireAuth, subscriptionGate, controller.createAddress);
router.patch('/:id', requireAuth, subscriptionGate, controller.updateAddress);
router.delete('/:id', requireAuth, subscriptionGate, controller.deleteAddress);

module.exports = router;
