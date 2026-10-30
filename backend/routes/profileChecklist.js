const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth");
const userSync = require("../middlewares/userSync");
const profileChecklistController = require("../controllers/profileChecklistController");

const requireAuth = [authMiddleware, userSync];

router.get("/", requireAuth, profileChecklistController.getProfileChecklist);

module.exports = router;
