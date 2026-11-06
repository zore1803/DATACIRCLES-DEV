const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth");
const userSync = require("../middlewares/userSync");
const subscriptionGate = require("../middlewares/subscriptionGate");
const c = require("../controllers/eInvoiceController");

const requireAuth = [authMiddleware, userSync];

// No restrictByPlan/checkPermission gate yet — same situation as
// purchaseReturnRoutes/salesReturnRoutes: "eInvoices" has no PlanConfig
// module entry or user.permissions entry, so adding those checks would 403
// every request. Only auth + subscription-validity are enforced for now.
// ── New IRP flow (Phase 6/7/10/11/12/15) ─────────────────────────────
// Ordered BEFORE the "/:id" catch-all so their static segments actually match.
router.get("/provider/status", requireAuth, subscriptionGate, c.providerStatus);
router.get("/preview/:invoiceId", requireAuth, subscriptionGate, c.previewPayload);
router.post("/generate/:invoiceId", requireAuth, subscriptionGate, c.generate);
router.post("/retrieve/:invoiceId", requireAuth, subscriptionGate, c.retrieve);
router.post("/cancel/:invoiceId", requireAuth, subscriptionGate, c.cancel);
router.get("/history/:invoiceId", requireAuth, subscriptionGate, c.history);

// ── Legacy manual-tracking CRUD (existing EInvoicing dashboard) ───────
// Unchanged — the dashboard reads the mirrored legacy `status` field.
router.post("/", requireAuth, subscriptionGate, c.createEInvoice);
router.get("/", requireAuth, subscriptionGate, c.getAllEInvoices);
router.get("/filter-options", requireAuth, subscriptionGate, c.getEInvoiceFilterOptions);
router.get("/pagination", requireAuth, subscriptionGate, c.getAllEInvoicesWithPagination);
router.get("/:id", requireAuth, subscriptionGate, c.getEInvoiceById);
router.put("/:id/status", requireAuth, subscriptionGate, c.updateEInvoiceStatus);
router.delete("/:id", requireAuth, subscriptionGate, c.deleteEInvoice);

module.exports = router;
