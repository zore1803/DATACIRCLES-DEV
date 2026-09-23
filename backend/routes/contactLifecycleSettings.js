// routes/contactLifecycleSettings.js
const express = require("express");
const router = express.Router();
const controller = require("../controllers/contactLifecycleSettingsController");
const authMiddleware = require("../middlewares/auth");
const userSync = require("../middlewares/userSync");
const subscriptionGate = require("../middlewares/subscriptionGate");

const requireAuth = [authMiddleware, userSync];

// READ this organization's contact lifecycle settings (auto-created from the
// default seed on first read)
router.get("/", requireAuth, subscriptionGate, controller.getSettings);

// UPDATE stages (add/edit/reorder/remove) — blocked if removing a stage or
// status still in use by an existing contact
router.put("/", requireAuth, subscriptionGate, controller.updateSettings);

module.exports = router;
