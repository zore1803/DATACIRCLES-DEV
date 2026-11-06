const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth");
const userSync = require("../middlewares/userSync");
const checkPermission = require("../middlewares/checkPermission");
const purchaseController = require("../controllers/purchaseController");

const requireAuth = [authMiddleware, userSync];
const subscriptionGate = require('../middlewares/subscriptionGate');
const restrictByPlan = require('../middlewares/restrictByPlan');

// Create Purchase
router.post("/",
  requireAuth,
  subscriptionGate,
  restrictByPlan('purchases', 'write'),
  checkPermission("purchases", "read-write"),
  purchaseController.createPurchase
);

// Get All Purchases
router.get("/",
  requireAuth,
  subscriptionGate,
  restrictByPlan('purchases', 'read'),
  checkPermission("purchases", "readonly"),
  purchaseController.getAllPurchases
);

// Suggestions + amount bounds for the Advanced Filter panel (before /:id)
router.get("/filter-options",
  requireAuth,
  subscriptionGate,
  restrictByPlan('purchases', 'read'),
  checkPermission("purchases", "readonly"),
  purchaseController.getPurchaseFilterOptions
);

// Get All Purchases with Pagination (specific route before generic /:id)
router.get("/pagination",
  requireAuth,
  subscriptionGate,
  restrictByPlan('purchases', 'read'),
  checkPermission("purchases", "readonly"),
  purchaseController.getAllPurchasesWithPagination
);

// Export Selected Purchases
router.post("/export-selected",
  requireAuth,
  subscriptionGate,
  restrictByPlan('purchases', 'read'),
  checkPermission("purchases", "readonly"),
  purchaseController.exportSelectedPurchases
);

// Bulk Import Purchases (specific route before generic /:id)
router.post("/bulk-import",
  requireAuth,
  subscriptionGate,
  restrictByPlan('purchases', 'write'),
  checkPermission("purchases", "read-write"),
  purchaseController.bulkImportPurchases
);

// Get Purchases for a Vendor (specific route before generic /:id)
router.get("/vendor/:vendorId",
  requireAuth,
  subscriptionGate,
  restrictByPlan('purchases', 'read'),
  checkPermission("purchases", "readonly"),
  purchaseController.getPurchasesByVendor
);

// Download Purchase as PDF (specific route before generic /:id)
router.get("/download/:id",
  requireAuth,
  subscriptionGate,
  restrictByPlan('purchases', 'read'),
  checkPermission("purchases", "readonly"),
  purchaseController.downloadPurchase
);

// Get Single Purchase
router.get("/:id",
  requireAuth,
  subscriptionGate,
  restrictByPlan('purchases', 'read'),
  checkPermission("purchases", "readonly"),
  purchaseController.getPurchaseById
);

// Update Purchase
router.put("/:id",
  requireAuth,
  subscriptionGate,
  restrictByPlan('purchases', 'write'),
  checkPermission("purchases", "read-write"),
  purchaseController.updatePurchase
);

// Update only Status (specific route)
router.put("/:id/status",
  requireAuth,
  subscriptionGate,
  restrictByPlan('purchases', 'write'),
  checkPermission("purchases", "read-write"),
  purchaseController.updatePurchaseStatus
);

// Delete Purchase
router.delete("/:id",
  requireAuth,
  subscriptionGate,
  restrictByPlan('purchases', 'write'),
  checkPermission("purchases", "read-write"),
  purchaseController.deletePurchase
);

// GET /api/purchases/:id/payments (List payments)
router.get("/:id/payments",
  requireAuth,
  subscriptionGate,
  restrictByPlan('purchases', 'read'),
  checkPermission("purchases", "readonly"),
  purchaseController.getPurchasePayments
);

// POST /api/purchases/:id/payments (Record a payment)
router.post("/:id/payments",
  requireAuth,
  subscriptionGate,
  restrictByPlan('purchases', 'write'),
  checkPermission("purchases", "read-write"),
  purchaseController.addPurchasePayment
);

// PUT /api/purchases/:id/payments/:paymentId (Update a payment)
router.put("/:id/payments/:paymentId",
  requireAuth,
  subscriptionGate,
  restrictByPlan('purchases', 'write'),
  checkPermission("purchases", "read-write"),
  purchaseController.updatePurchasePayment
);

// DELETE /api/purchases/:id/payments/:paymentId (Delete a payment)
router.delete("/:id/payments/:paymentId",
  requireAuth,
  subscriptionGate,
  restrictByPlan('purchases', 'write'),
  checkPermission("purchases", "read-write"),
  purchaseController.deletePurchasePayment
);

module.exports = router;
