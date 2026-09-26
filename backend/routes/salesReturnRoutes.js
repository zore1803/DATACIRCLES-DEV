const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth");
const userSync = require("../middlewares/userSync");
const subscriptionGate = require("../middlewares/subscriptionGate");
const c = require("../controllers/salesReturnController");

const requireAuth = [authMiddleware, userSync];

// No restrictByPlan/checkPermission gate: "salesReturns" has no PlanConfig or
// user.permissions entry yet, so adding those checks would 403 every request.
router.post("/", requireAuth, subscriptionGate, c.createSalesReturn);
router.get("/", requireAuth, subscriptionGate, c.getAllSalesReturns);
router.get("/pagination", requireAuth, subscriptionGate, c.getAllSalesReturnsWithPagination);
router.get("/download/:id", requireAuth, subscriptionGate, c.downloadSalesReturn);
router.post("/bulk-import", requireAuth, subscriptionGate, c.bulkImportSalesReturns);
// Before /:id so "invoice" isn't swallowed as a return id.
router.get("/invoice/:invoiceId/available", requireAuth, subscriptionGate, c.getInvoiceItemsForReturn);

// Refunds to the customer — money OUT, recorded as a real Payment + allocation.
router.get("/:id/payments", requireAuth, subscriptionGate, c.getSalesReturnRefunds);
router.post("/:id/payments", requireAuth, subscriptionGate, c.addSalesReturnRefund);
router.put("/:id/payments/:paymentId", requireAuth, subscriptionGate, c.updateSalesReturnRefund);
router.delete("/:id/payments/:paymentId", requireAuth, subscriptionGate, c.deleteSalesReturnRefund);
// "Mark as Complete Refund" — closes the return at what was actually paid,
// without creating a Payment.
router.post("/:id/settle", requireAuth, subscriptionGate, c.settleSalesReturnRefund);

router.get("/:id", requireAuth, subscriptionGate, c.getSalesReturnById);
router.put("/:id", requireAuth, subscriptionGate, c.updateSalesReturn);
router.put("/:id/status", requireAuth, subscriptionGate, c.updateSalesReturnStatus);
router.delete("/:id", requireAuth, subscriptionGate, c.deleteSalesReturn);

module.exports = router;
