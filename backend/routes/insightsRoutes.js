const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth");
const userSync = require("../middlewares/userSync");
const subscriptionGate = require("../middlewares/subscriptionGate");
const insightsController = require("../controllers/insightsController");

const requireAuth = [authMiddleware, userSync];

// GET /api/insights/report?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD[&tz=IANA]
// Server-side analytics report for the Insights page. Per-module plan/permission/
// ownOnly gating is enforced INSIDE the controller (reusing the real middleware),
// so a module the user can't read degrades to 0/[] for that section instead of
// failing the whole report. Additive — the page still uses its existing requests
// until Phase 5 parity verification.
router.get(
  "/report",
  requireAuth,
  subscriptionGate,
  insightsController.getReport
);

module.exports = router;
