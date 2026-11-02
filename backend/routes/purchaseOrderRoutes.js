const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth");
const userSync = require("../middlewares/userSync");
const checkPermission = require("../middlewares/checkPermission");
const purchaseOrderController = require("../controllers/purchaseOrderController");

const requireAuth = [authMiddleware, userSync];
const subscriptionGate = require('../middlewares/subscriptionGate');
const restrictByPlan = require('../middlewares/restrictByPlan');

// Create Purchase Order
router.post("/",
  requireAuth,
  subscriptionGate,
  restrictByPlan('purchases', 'write'),
  checkPermission("purchase-orders", "read-write"),
  purchaseOrderController.createPurchaseOrder
);

// Get All Purchase Orders
router.get("/",
  requireAuth,
  subscriptionGate,
  restrictByPlan('purchases', 'read'),
  checkPermission("purchase-orders", "readonly"),
  purchaseOrderController.getAllPurchaseOrders
);

// Suggestions + amount bounds for the Advanced Filter panel (before /:id)
router.get("/filter-options",
  requireAuth,
  subscriptionGate,
  restrictByPlan('purchases', 'read'),
  checkPermission("purchase-orders", "readonly"),
  purchaseOrderController.getPurchaseOrderFilterOptions
);

// Get All Purchase Orders with Pagination (specific route before generic /:id)
router.get("/pagination",
  requireAuth,
  subscriptionGate,
  restrictByPlan('purchases', 'read'),
  checkPermission("purchase-orders", "readonly"),
  purchaseOrderController.getAllPurchaseOrdersWithPagination
);

// Export Selected Purchase Orders
router.post("/export-selected",
  requireAuth,
  subscriptionGate,
  restrictByPlan('purchases', 'read'),
  checkPermission("purchase-orders", "readonly"),
  purchaseOrderController.exportSelectedPurchaseOrders
);

// Bulk Import Purchase Orders (specific route before generic /:id)
router.post("/bulk-import",
  requireAuth,
  subscriptionGate,
  restrictByPlan('purchases', 'write'),
  checkPermission("purchase-orders", "read-write"),
  purchaseOrderController.bulkImportPurchaseOrders
);

// Get All Purchase Orders for a Vendor (specific route before generic /:id)
router.get("/vendor/:vendorId",
  requireAuth,
  subscriptionGate,
  restrictByPlan('purchases', 'read'),
  checkPermission("purchase-orders", "readonly"),
  purchaseOrderController.getPurchaseOrdersByVendor
);

// Download Purchase Order as PDF (specific route before generic /:id)
router.get("/download/:id",
  requireAuth,
  subscriptionGate,
  restrictByPlan('purchases', 'read'),
  checkPermission("purchase-orders", "readonly"),
  purchaseOrderController.downloadPurchaseOrder
);

// Get Single Purchase Order by ID
router.get("/:id",
  requireAuth,
  subscriptionGate,
  restrictByPlan('purchases', 'read'),
  checkPermission("purchase-orders", "readonly"),
  purchaseOrderController.getPurchaseOrderById
);

// Update Purchase Order
router.put("/:id",
  requireAuth,
  subscriptionGate,
  restrictByPlan('purchases', 'write'),
  checkPermission("purchase-orders", "read-write"),
  purchaseOrderController.updatePurchaseOrder
);

// Update Purchase Order Status (specific route)
router.put("/:id/status",
  requireAuth,
  subscriptionGate,
  restrictByPlan('purchases', 'write'),
  checkPermission("purchase-orders", "read-write"),
  purchaseOrderController.updatePurchaseOrderStatus
);

// Delete Purchase Order
router.delete("/:id",
  requireAuth,
  subscriptionGate,
  restrictByPlan('purchases', 'write'),
  checkPermission("purchase-orders", "read-write"),
  purchaseOrderController.deletePurchaseOrder
);

module.exports = router;
