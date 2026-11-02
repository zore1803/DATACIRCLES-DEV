const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth");
const userSync = require("../middlewares/userSync");
const subscriptionGate = require("../middlewares/subscriptionGate");
const creditCardController = require("../controllers/creditCardController");

const requireAuth = [authMiddleware, userSync];

router.get("/", requireAuth, subscriptionGate, creditCardController.getAllCreditCards);
router.post("/", requireAuth, subscriptionGate, creditCardController.createCreditCard);
router.put("/:id", requireAuth, subscriptionGate, creditCardController.updateCreditCard);
router.patch("/:id/default", requireAuth, subscriptionGate, creditCardController.setDefaultCreditCard);
router.delete("/:id", requireAuth, subscriptionGate, creditCardController.deleteCreditCard);

module.exports = router;
