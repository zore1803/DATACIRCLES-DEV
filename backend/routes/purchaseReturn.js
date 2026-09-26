const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth");
const userSync = require("../middlewares/userSync");
const purchaseReturnController = require("../controllers/purchaseReturnController");

const requireAuth = [authMiddleware, userSync];
const subscriptionGate = require("../middlewares/subscriptionGate");

// No restrictByPlan/checkPermission gate — "purchaseReturns" has no
// PlanConfig module entry or user.permissions entry on any existing
// plan/user yet (same situation journalRoutes.js documents for Journals),
// so adding those checks now would 403 every request until that plan/
// permission plumbing is set up separately. Only auth + subscription-
// validity are enforced for now.
router.post("/", requireAuth, subscriptionGate, purchaseReturnController.createPurchaseReturn);
router.get("/", requireAuth, subscriptionGate, purchaseReturnController.getAllPurchaseReturns);
router.get("/pagination", requireAuth, subscriptionGate, purchaseReturnController.getAllPurchaseReturnsWithPagination);
router.get("/download/:id", requireAuth, subscriptionGate, purchaseReturnController.downloadPurchaseReturn);
router.post("/bulk-import", requireAuth, subscriptionGate, purchaseReturnController.bulkImportPurchaseReturns);
router.get("/vendor/:vendorId", requireAuth, subscriptionGate, purchaseReturnController.getPurchaseReturnsByVendor);
// Must come before /:id so "purchase" isn't swallowed as a return id.
router.get("/purchase/:purchaseId/available", requireAuth, subscriptionGate, purchaseReturnController.getPurchaseItemsForReturn);
// Refunds received from the vendor against a confirmed return. Declared
// before "/:id" is irrelevant here (the paths are distinct) but grouped with
// the other id-scoped routes for readability.
router.get("/:id/payments", requireAuth, subscriptionGate, purchaseReturnController.getPurchaseReturnRefunds);
router.post("/:id/payments", requireAuth, subscriptionGate, purchaseReturnController.addPurchaseReturnRefund);
router.put("/:id/payments/:paymentId", requireAuth, subscriptionGate, purchaseReturnController.updatePurchaseReturnRefund);
router.delete("/:id/payments/:paymentId", requireAuth, subscriptionGate, purchaseReturnController.deletePurchaseReturnRefund);

router.get("/:id", requireAuth, subscriptionGate, purchaseReturnController.getPurchaseReturnById);
router.put("/:id", requireAuth, subscriptionGate, purchaseReturnController.updatePurchaseReturn);
router.put("/:id/status", requireAuth, subscriptionGate, purchaseReturnController.updatePurchaseReturnStatus);
router.delete("/:id", requireAuth, subscriptionGate, purchaseReturnController.deletePurchaseReturn);

module.exports = router;
