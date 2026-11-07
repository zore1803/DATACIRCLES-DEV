const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth");
const userSync = require("../middlewares/userSync");
const subscriptionGate = require("../middlewares/subscriptionGate");
const c = require("../controllers/salesSubscriptionController");

const requireAuth = [authMiddleware, userSync];

// No restrictByPlan/checkPermission gate yet — same situation as
// salesReturnRoutes/purchaseReturnRoutes: no PlanConfig module entry or
// user.permissions entry exists for "salesSubscriptions" yet. Only auth +
// subscription-validity are enforced for now.
router.post("/", requireAuth, subscriptionGate, c.createSalesSubscription);
router.get("/pagination", requireAuth, subscriptionGate, c.getAllSalesSubscriptionsWithPagination);
router.get("/filter-options", requireAuth, subscriptionGate, c.getSalesSubscriptionFilterOptions);
router.get("/:id", requireAuth, subscriptionGate, c.getSalesSubscriptionById);
router.put("/:id", requireAuth, subscriptionGate, c.updateSalesSubscription);
router.put("/:id/status", requireAuth, subscriptionGate, c.updateSalesSubscriptionStatus);
router.post("/:id/generate-invoice", requireAuth, subscriptionGate, c.generateInvoiceNow);
router.delete("/:id", requireAuth, subscriptionGate, c.deleteSalesSubscription);

module.exports = router;
