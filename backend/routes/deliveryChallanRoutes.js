const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const authMiddleware = require("../middlewares/auth");
const checkPermission = require("../middlewares/checkPermission");
const userSync = require("../middlewares/userSync");
const deliveryChallanController = require("../controllers/deliveryChallanController");
const DeliveryChallan = require("../models/deliveryChallan");
const { listDocsByDealEntity } = require("../utils/dealEntityDocs");

const requireAuth = [authMiddleware, userSync];
const subscriptionGate = require('../middlewares/subscriptionGate');
const restrictByPlan = require('../middlewares/restrictByPlan');

// Routes
router.post(
  "/",
  requireAuth,
  subscriptionGate,
  restrictByPlan("delivery-challans", "write"),
  checkPermission("delivery-challans", "read-write"),
  deliveryChallanController.createDeliveryChallan
);
router.get(
  "/",
  requireAuth,
  subscriptionGate,
  restrictByPlan("delivery-challans", "read"),
  checkPermission("delivery-challans", "readonly"),
  deliveryChallanController.getAllDeliveryChallans
);
router.get(
  "/pagination",
  requireAuth,
  subscriptionGate,
  restrictByPlan("delivery-challans", "read"),
  checkPermission("delivery-challans", "readonly"),
  deliveryChallanController.getAllDeliveryChallansPaginated
);
router.get(
  "/download/:id",
  requireAuth,
  subscriptionGate,
  restrictByPlan("delivery-challans", "read"),
  checkPermission("delivery-challans", "readonly"),
  deliveryChallanController.downloadDeliveryChallan
);
// Documents-tab rollups: delivery challans of all deals under a company / contact.
router.get(
  "/company/:companyId",
  requireAuth,
  subscriptionGate,
  restrictByPlan("delivery-challans", "read"),
  checkPermission("delivery-challans", "readonly"),
  listDocsByDealEntity(DeliveryChallan, "company")
);
router.get(
  "/contact/:contactId",
  requireAuth,
  subscriptionGate,
  restrictByPlan("delivery-challans", "read"),
  checkPermission("delivery-challans", "readonly"),
  listDocsByDealEntity(DeliveryChallan, "contact")
);
router.post(
  "/:id/duplicate",
  requireAuth,
  subscriptionGate,
  restrictByPlan("delivery-challans", "write"),
  checkPermission("delivery-challans", "read-write"),
  deliveryChallanController.duplicateDeliveryChallan
);
router.delete(
  "/:id",
  requireAuth,
  subscriptionGate,
  restrictByPlan("delivery-challans", "write"),
  checkPermission("delivery-challans", "read-write"),
  deliveryChallanController.deleteDeliveryChallan
);
router.put(
  "/:id",
  requireAuth,
  subscriptionGate,
  restrictByPlan("delivery-challans", "write"),
  checkPermission("delivery-challans", "read-write"),
  deliveryChallanController.updateDeliveryChallan
);
router.put(
  "/status/:id",
  requireAuth,
  subscriptionGate,
  restrictByPlan("delivery-challans", "write"),
  checkPermission("delivery-challans", "read-write"),
  deliveryChallanController.updateStatus
);
router.post(
  "/:id/email",
  requireAuth,
  subscriptionGate,
  restrictByPlan("delivery-challans", "write"),
  checkPermission("delivery-challans", "read-write"),
  deliveryChallanController.sendDeliveryChallanEmail
);
router.patch(
  "/number/:id",
  requireAuth,
  subscriptionGate,
  restrictByPlan("delivery-challans", "write"),
  checkPermission("delivery-challans", "read-write"),
  deliveryChallanController.updateDeliveryChallanNumber
);

router.post(
  "/bulk-status",
  requireAuth,
  subscriptionGate,
  restrictByPlan("delivery-challans", "write"),
  checkPermission("delivery-challans", "read-write"),
  deliveryChallanController.bulkUpdateStatus
);

router.post(
  "/bulk-signature",
  requireAuth,
  subscriptionGate,
  restrictByPlan("delivery-challans", "write"),
  checkPermission("delivery-challans", "read-write"),
  deliveryChallanController.bulkUpdateSignature
);

module.exports = router;
