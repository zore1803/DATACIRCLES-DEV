const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth");
const userSync = require("../middlewares/userSync");
const subscriptionGate = require("../middlewares/subscriptionGate");
const dashboardController = require("../controllers/dashboardController");

const requireAuth = [authMiddleware, userSync];

// GET /api/dashboard/stats
// Aggregate counts + month-over-month trend inputs + contact-engagement for the
// Dashboard, so it no longer downloads whole /companies and /contacts
// collections just to count them. Per-module plan/permission/ownOnly gating is
// enforced INSIDE the controller (reusing the real middleware) so a module the
// user can't read returns zeros for that module instead of failing the request.
router.get(
  "/stats",
  requireAuth,
  subscriptionGate,
  dashboardController.getStats
);

module.exports = router;
