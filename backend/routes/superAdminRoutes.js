const express = require('express');
const router = express.Router();
const SuperAdmin = require('../models/SuperAdmin');
const jwt = require('jsonwebtoken');
const superAdminAuth = require('../middlewares/superAdminAuth');
const superAdminController = require('../controllers/superAdminController');
const couponController = require('../controllers/couponController');
const referralAdminController = require('../controllers/referralAdminController');
const walletAdminController = require('../controllers/walletAdminController');

// Super Admin Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const superAdmin = await SuperAdmin.findOne({ email });
    if (!superAdmin) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await superAdmin.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Generate JWT
    const token = jwt.sign(
      { _id: superAdmin._id },
      process.env.SUPER_ADMIN_JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      superAdmin: {
        _id: superAdmin._id,
        email: superAdmin.email,
        name: superAdmin.name
      }
    });
  } catch (error) {
    console.error('Super admin login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Protected Route Example (e.g., for super admin dashboard)
router.get('/dashboard', superAdminAuth, async (req, res) => {
  res.json({ message: 'Welcome to Super Admin Dashboard', superAdmin: req.superAdmin });
});

// Overview metrics
router.get('/overview', superAdminAuth, superAdminController.getOverview);

// Tenants (Organizations) list with pagination
router.get('/tenants', superAdminAuth, superAdminController.getTenants);

// Users list with pagination
router.get('/users', superAdminAuth, superAdminController.getUsers);
router.get('/organizations-filter', superAdminAuth, superAdminController.getOrganizationsForFilter);
router.delete('/users/:id', superAdminAuth, superAdminController.deleteUser);
router.delete('/tenants/:id', superAdminAuth, superAdminController.deleteOrganization);

// Billing overview
router.get('/billing', superAdminAuth, superAdminController.getBilling);

// Analytics
router.get('/analytics', superAdminAuth, superAdminController.getAnalytics);

// Support tickets
router.get('/support', superAdminAuth, superAdminController.getSupportTickets);

router.get('/tenants/:id', superAdminAuth, superAdminController.getTenantDetails);

// Ticket CRUD routes
router.post('/tickets', superAdminController.createTicket);
router.get('/tickets', superAdminController.getTickets);
router.get('/tickets/:id', superAdminController.getTicketById);
router.put('/tickets/:id', superAdminController.updateTicket);
router.delete('/tickets/:id', superAdminController.deleteTicket);
router.post('/support/:id/status', superAdminController.updateTicketStatus);
router.get('/organizations/:orgId/payments', superAdminController.getOrganizationPayments);

// "Customer paid but never got their subscription" repair tool — takes a
// Razorpay payment id, reports whether it was captured and whether it was
// ever applied, and (with apply: true) replays it through the normal
// reconciliation path. Replaces scripts/repairUnacknowledgedPayment.js.
router.post('/payments/check', superAdminAuth, superAdminController.checkPayment);
router.post('/organizations/:organizationId/start-trial', superAdminAuth, superAdminController.adminStartTrialForOrganization);
router.post('/subscriptions/:subscriptionId/adjust-trial', superAdminAuth, superAdminController.adminAdjustTrial);
router.post('/subscriptions/:subscriptionId/end-trial', superAdminAuth, superAdminController.adminEndTrialNow);

// Subscription cancellation — exactly the same action a real user has via
// the Plans/Billing UI, reused as-is. Plan changes are NOT exposed to
// super admin (the plan only actually changes once the org completes
// Razorpay checkout themselves; the org's own Plans page already handles that).
router.post('/organizations/:organizationId/cancel-subscription', superAdminAuth, superAdminController.adminCancelSubscriptionForOrganization);

// Plan management — list all PlanConfig documents, and update a single
// plan's pricing/feature limits. Used by the new "Plans" super-admin page.
router.get('/plans', superAdminAuth, superAdminController.getPlans);
router.put('/plans/:planId', superAdminAuth, superAdminController.updatePlan);

// Add-on catalog management
router.get('/addons', superAdminAuth, superAdminController.getAddons);
router.post('/addons', superAdminAuth, superAdminController.createAddon);
router.put('/addons/:addonId', superAdminAuth, superAdminController.updateAddon);
router.delete('/addons/:addonId', superAdminAuth, superAdminController.deleteAddon);

// Wallet & prepaid credits (independent of subscription billing above)
router.get('/wallet/config', superAdminAuth, walletAdminController.getConfig);
router.put('/wallet/config', superAdminAuth, walletAdminController.updateConfig);
router.get('/organizations/:orgId/wallet', superAdminAuth, walletAdminController.getOrganizationWallet);
router.post('/organizations/:orgId/wallet/grant', superAdminAuth, walletAdminController.grantCredits);

// Coupon & discount engine management
router.get('/coupons/organizations', superAdminAuth, couponController.searchOrganizations);
router.get('/coupons/organizations/:organizationId/redemptions', superAdminAuth, couponController.getOrganizationRedemptions);
router.get('/coupons', superAdminAuth, couponController.getCoupons);
router.get('/coupons/:couponId', superAdminAuth, couponController.getCouponById);
router.post('/coupons', superAdminAuth, couponController.createCoupon);
router.put('/coupons/:couponId', superAdminAuth, couponController.updateCoupon);
router.post('/coupons/:couponId/toggle-status', superAdminAuth, couponController.toggleCouponStatus);
router.delete('/coupons/:couponId', superAdminAuth, couponController.deleteCoupon);

// Referral system management (backend only — see REFERRAL_SYSTEM_DESIGN.md)
router.get('/referrals/programs/:organizationId', superAdminAuth, referralAdminController.getReferralProgram);
router.put('/referrals/programs/:organizationId', superAdminAuth, referralAdminController.updateReferralProgram);
router.get('/referrals/organizations/:organizationId', superAdminAuth, referralAdminController.getOrganizationReferralOverview);
router.post('/referrals/rewards/manual', superAdminAuth, referralAdminController.grantManualReward);
router.post('/referrals/rewards/:rewardId/revoke', superAdminAuth, referralAdminController.revokeReward);

module.exports = router;