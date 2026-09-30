const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth");
const userSync = require("../middlewares/userSync");
const gstinController = require("../controllers/gstinController");

const requireAuth = [authMiddleware, userSync];

router.post("/verify", requireAuth, gstinController.verify);

module.exports = router;
