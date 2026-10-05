const express = require("express");
const router = express.Router();
const invoiceController = require("../controllers/invoiceController");
const Invoice = require("../models/Invoice");
const { listDocsByDealEntity } = require("../utils/dealEntityDocs");
const authMiddleware = require("../middlewares/auth");
const checkPermission = require("../middlewares/checkPermission");
const userSync = require("../middlewares/userSync");
const restrictByPlan = require("../middlewares/restrictByPlan");

const requireAuth = [authMiddleware, userSync];
const subscriptionGate = require('../middlewares/subscriptionGate');

// POST /api/invoices (Create - requires write permission)
router.post(
  "/",
  requireAuth,
  subscriptionGate,
  restrictByPlan("invoices", "write"),
  checkPermission("invoices", "read-write"),
  invoiceController.createInvoice
);

// GET /api/invoices (Get all - requires read permission)
router.get(
  "/",
  requireAuth,
  subscriptionGate,
  restrictByPlan("invoices", "read"),
  checkPermission("invoices", "readonly"),
  invoiceController.getAllInvoices
);

router.get(
  "/company/:companyId/summary",
  requireAuth,
  subscriptionGate,
  restrictByPlan("invoices", "read"),
  checkPermission("invoices", "readonly"),
  invoiceController.getCompanyInvoiceSummary
);

router.get(
  "/company/:companyId",
  requireAuth,
  subscriptionGate,
  restrictByPlan("invoices", "read"),
  checkPermission("invoices", "readonly"),
  invoiceController.getInvoicesByCompany
);

// Documents-tab rollup for the Contact page: invoices of all deals under a
// contact. (Company already has getInvoicesByCompany above, which returns
// { invoices, summary }; this returns a plain array like the other sales types.)
router.get(
  "/contact/:contactId",
  requireAuth,
  subscriptionGate,
  restrictByPlan("invoices", "read"),
  checkPermission("invoices", "readonly"),
  listDocsByDealEntity(Invoice, "contact")
);

// GET /api/invoices/pagination (Paginated - requires read permission)
router.get(
  "/pagination",
  requireAuth,
  subscriptionGate,
  restrictByPlan("invoices", "read"),
  checkPermission("invoices", "readonly"),
  invoiceController.getAllInvoicesPaginated
);

// GET /api/invoices/download/:id (Download - requires read permission with organization check)
router.get(
  "/download/:id",
  requireAuth,
  subscriptionGate,
  restrictByPlan("invoices", "read"),
  checkPermission("invoices", "readonly"),
  invoiceController.downloadInvoice
);

// POST /api/invoices/bulk-email-grouped — must be before /:id routes
router.post(
  "/bulk-email-grouped",
  requireAuth,
  subscriptionGate,
  restrictByPlan("invoices", "write"),
  checkPermission("invoices", "read-write"),
  invoiceController.bulkEmailGrouped
);

// DELETE /api/invoices/:id (Delete - requires write permission)
router.delete(
  "/:id",
  requireAuth,
  subscriptionGate,
  restrictByPlan("invoices", "write"),
  checkPermission("invoices", "read-write"),
  invoiceController.deleteInvoice
);

// PUT /api/invoices/:id (Update full invoice - requires write permission)
router.put(
  "/:id",
  requireAuth,
  subscriptionGate,
  restrictByPlan("invoices", "write"),
  checkPermission("invoices", "read-write"),
  invoiceController.updateInvoice
);

// PUT /api/invoices/status/:id (Update status - requires write permission)
router.put(
  "/status/:id",
  requireAuth,
  subscriptionGate,
  restrictByPlan("invoices", "write"),
  checkPermission("invoices", "read-write"),
  invoiceController.updateStatus
);

// POST /api/invoices/bulk-status, /api/invoices/bulk-signature — bring
// Invoice up to parity with Quotation/Proforma/Delivery Challan, which
// already had these for the Accounting page's bulk toolbar.
router.post(
  "/bulk-status",
  requireAuth,
  subscriptionGate,
  restrictByPlan("invoices", "write"),
  checkPermission("invoices", "read-write"),
  invoiceController.bulkUpdateStatus
);

router.post(
  "/bulk-signature",
  requireAuth,
  subscriptionGate,
  restrictByPlan("invoices", "write"),
  checkPermission("invoices", "read-write"),
  invoiceController.bulkUpdateSignature
);

// routes/invoiceRoutes.js (append before module.exports)
router.patch(
  "/number/:id",
  requireAuth,
  subscriptionGate,
  restrictByPlan("invoices", "write"),
  checkPermission("invoices", "read-write"),
  invoiceController.updateInvoiceNumber
);

// POST /api/invoices/:id/duplicate (Create a new Draft invoice cloned from an existing one)
router.post(
  "/:id/duplicate",
  requireAuth,
  subscriptionGate,
  restrictByPlan("invoices", "write"),
  checkPermission("invoices", "read-write"),
  invoiceController.duplicateInvoice
);

// GET /api/invoices/:id (Single invoice)
router.get(
  "/:id",
  requireAuth,
  subscriptionGate,
  restrictByPlan("invoices", "read"),
  checkPermission("invoices", "readonly"),
  invoiceController.getInvoiceById
);

// GET /api/invoices/:id/payments (List payments)
router.get(
  "/:id/payments",
  requireAuth,
  subscriptionGate,
  restrictByPlan("invoices", "read"),
  checkPermission("invoices", "readonly"),
  invoiceController.getInvoicePayments
);

// POST /api/invoices/:id/payments (Record a payment)
router.post(
  "/:id/payments",
  requireAuth,
  subscriptionGate,
  restrictByPlan("invoices", "write"),
  checkPermission("invoices", "read-write"),
  invoiceController.addInvoicePayment
);

// PUT /api/invoices/:id/payments/:paymentId (Update a payment)
router.put(
  "/:id/payments/:paymentId",
  requireAuth,
  subscriptionGate,
  restrictByPlan("invoices", "write"),
  checkPermission("invoices", "read-write"),
  invoiceController.updateInvoicePayment
);

// DELETE /api/invoices/:id/payments/:paymentId (Delete a payment)
router.delete(
  "/:id/payments/:paymentId",
  requireAuth,
  subscriptionGate,
  restrictByPlan("invoices", "write"),
  checkPermission("invoices", "read-write"),
  invoiceController.deleteInvoicePayment
);

module.exports = router;
