const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const authMiddleware = require("../middlewares/auth");
const checkPermission = require("../middlewares/checkPermission");
const userSync = require("../middlewares/userSync");
const quotationController = require("../controllers/quotationController");
const Quotation = require("../models/quotation");
const { listDocsByDealEntity } = require("../utils/dealEntityDocs");

const requireAuth = [authMiddleware, userSync];
const subscriptionGate = require('../middlewares/subscriptionGate');
const restrictByPlan = require('../middlewares/restrictByPlan');

// Routes
router.post(
  "/",
  requireAuth,
  subscriptionGate,
  restrictByPlan("quotations", "write"),
  checkPermission("quotations", "read-write"),
  quotationController.createQuotation
);
router.get(
  "/",
  requireAuth,
  subscriptionGate,
  restrictByPlan("quotations", "read"),
  checkPermission("quotations", "readonly"),
  quotationController.getAllQuotations
);
router.get(
  "/pagination",
  requireAuth,
  subscriptionGate,
  restrictByPlan("quotations", "read"),
  checkPermission("quotations", "readonly"),
  quotationController.getAllQuotationsPaginated
);
router.get(
  "/download/:id",
  requireAuth,
  subscriptionGate,
  restrictByPlan("quotations", "read"),
  checkPermission("quotations", "readonly"),
  quotationController.downloadQuotation
);
// Documents-tab rollups: quotations of all deals under a company / contact.
router.get(
  "/company/:companyId",
  requireAuth,
  subscriptionGate,
  restrictByPlan("quotations", "read"),
  checkPermission("quotations", "readonly"),
  listDocsByDealEntity(Quotation, "company")
);
router.get(
  "/contact/:contactId",
  requireAuth,
  subscriptionGate,
  restrictByPlan("quotations", "read"),
  checkPermission("quotations", "readonly"),
  listDocsByDealEntity(Quotation, "contact")
);
router.post(
  "/:id/duplicate",
  requireAuth,
  subscriptionGate,
  restrictByPlan("quotations", "write"),
  checkPermission("quotations", "read-write"),
  quotationController.duplicateQuotation
);
router.delete(
  "/:id",
  requireAuth,
  subscriptionGate,
  restrictByPlan("quotations", "write"),
  checkPermission("quotations", "read-write"),
  quotationController.deleteQuotation
);
router.put(
  "/:id",
  requireAuth,
  subscriptionGate,
  restrictByPlan("quotations", "write"),
  checkPermission("quotations", "read-write"),
  quotationController.updateQuotation
);
router.put(
  "/status/:id",
  requireAuth,
  subscriptionGate,
  restrictByPlan("quotations", "write"),
  checkPermission("quotations", "read-write"),
  quotationController.updateStatus
);
router.post(
  "/:id/email",
  requireAuth,
  subscriptionGate,
  restrictByPlan("quotations", "write"),
  checkPermission("quotations", "read-write"),
  quotationController.sendQuotationEmail
);
// router.patch(
//   "/number/:id",
//   requireAuth,
//   checkPermission("quotations", "read-write"),
//   quotationController.updateQuotationNumber
// );
router.patch(
  "/number/:id",
  requireAuth,
  subscriptionGate,
  restrictByPlan("quotations", "write"),
  checkPermission("quotations", "read-write"),
  quotationController.updateQuotationNumber
);

router.post(
  "/bulk-status",
  requireAuth,
  subscriptionGate,
  restrictByPlan("quotations", "write"),
  checkPermission("quotations", "read-write"),
  quotationController.bulkUpdateStatus
);

router.post(
  "/bulk-signature",
  requireAuth,
  subscriptionGate,
  restrictByPlan("quotations", "write"),
  checkPermission("quotations", "read-write"),
  quotationController.bulkUpdateSignature
);

module.exports = router;
