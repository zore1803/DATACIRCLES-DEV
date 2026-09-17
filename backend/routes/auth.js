const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth");
const userSyncMiddleware = require("../middlewares/userSync");
const adminMiddleware = require("../middlewares/admin");
const uploadMiddlewareS3 = require("../middlewares/uploadMiddlewareS3");
const authController = require("../controllers/authController");
const {
  globalOtpLimiter,
  sendOtpLimiter,
  verifyOtpLimiter,
  phoneOtpLimiter,
} = require("../utils/RateLimiter");

const requireAuth = [authMiddleware, userSyncMiddleware];

// Google Meet — one-time OAuth consent that connects a shared Google account
// for the organization. See backend/services/googleMeetService.js.
router.get("/google/connect", requireAuth, authController.googleConnect);
// No requireAuth here: Google redirects the raw browser back to this URL
// with no Authorization header, so the org/user identity travels instead in
// the signed `state` param set by googleConnect above.
router.get("/google/callback", authController.googleCallback);
router.get("/google/status", requireAuth, authController.googleStatus);
router.delete("/google/disconnect", requireAuth, authController.googleDisconnect);

// Email/password login
router.post("/login", authController.login);

// Get current user
router.get("/me", requireAuth, authController.getCurrentUser);

// Intercom Messenger identity verification JWT
router.get("/intercom-jwt", requireAuth, authController.getIntercomJwt);

// Delete user
router.delete(
  "/delete/:id",
  requireAuth,
  adminMiddleware,
  authController.deleteUser,
);

// Get all users
router.get("/all-user", requireAuth, authController.getAllUsers);

// Get all users
router.get(
  "/all-user-admin",
  requireAuth,
  adminMiddleware,
  authController.getAllUsersAdmin,
);

// Update profile
router.post(
  "/profile",
  requireAuth,
  uploadMiddlewareS3().single("profile"),
  authController.updateProfile,
);

// Delete profile
router.delete("/profile", requireAuth, authController.removeProfile);

// Get profile
router.get("/profile", requireAuth, authController.getProfile);

// Update permissions
router.put(
  "/permissions/:id",
  requireAuth,
  adminMiddleware,
  authController.updatePermissions,
);

// Invite user
router.post("/invite", requireAuth, adminMiddleware, authController.inviteUser);

// Get invites
router.get("/invites", requireAuth, adminMiddleware, authController.getInvites);

// Delete invite
router.delete(
  "/invites/:id",
  requireAuth,
  adminMiddleware,
  authController.deleteInvite,
);

// Send OTP
router.post(
  "/send-otp",
  globalOtpLimiter,
  sendOtpLimiter,
  phoneOtpLimiter,
  authController.sendOtp,
);

// Verify OTP
router.post(
  "/verify-otp",
  globalOtpLimiter,
  verifyOtpLimiter,
  authController.verifyOtp,
);

// Send Email OTP (for email verification)
router.post(
  "/send-email-otp",
  globalOtpLimiter,
  sendOtpLimiter,
  authController.sendEmailOtp,
);

// Verify Email OTP
router.post(
  "/verify-email-otp",
  globalOtpLimiter,
  verifyOtpLimiter,
  authController.verifyEmailOtp,
);

// Profile settings page verification (authenticated — acts on req.user)
router.post(
  "/send-profile-email-otp",
  requireAuth,
  globalOtpLimiter,
  sendOtpLimiter,
  authController.sendProfileEmailOtp,
);
router.post(
  "/verify-profile-email-otp",
  requireAuth,
  globalOtpLimiter,
  verifyOtpLimiter,
  authController.verifyProfileEmailOtp,
);
router.post(
  "/send-profile-phone-otp",
  requireAuth,
  globalOtpLimiter,
  sendOtpLimiter,
  phoneOtpLimiter,
  authController.sendProfilePhoneOtp,
);
router.post(
  "/verify-profile-phone-otp",
  requireAuth,
  globalOtpLimiter,
  verifyOtpLimiter,
  authController.verifyProfilePhoneOtp,
);

// Changing to a new (not-yet-saved) phone number — verified before it's written
router.post(
  "/send-phone-change-otp",
  requireAuth,
  globalOtpLimiter,
  sendOtpLimiter,
  phoneOtpLimiter,
  authController.sendPhoneChangeOtp,
);
router.post(
  "/verify-phone-change-otp",
  requireAuth,
  globalOtpLimiter,
  verifyOtpLimiter,
  authController.verifyPhoneChangeOtp,
);

// Changing to a new (not-yet-saved) email address — verified before it's written
router.post(
  "/send-email-change-otp",
  requireAuth,
  globalOtpLimiter,
  sendOtpLimiter,
  authController.sendEmailChangeOtp,
);
router.post(
  "/verify-email-change-otp",
  requireAuth,
  globalOtpLimiter,
  verifyOtpLimiter,
  authController.verifyEmailChangeOtp,
);

// Step-up verification for changing the LOGIN credential field itself
// (email for an email/Google/password account, phone for a phone-OTP one):
// verified via the account's other, already-linked contact method instead
// of an OTP to the new value.
router.post(
  "/send-credential-change-verification",
  requireAuth,
  globalOtpLimiter,
  sendOtpLimiter,
  phoneOtpLimiter,
  authController.sendCredentialChangeVerification,
);
router.post(
  "/confirm-credential-change-verification",
  requireAuth,
  globalOtpLimiter,
  verifyOtpLimiter,
  authController.confirmCredentialChangeVerification,
);

// Danger Zone — files a reset/delete request for the org's admins (and
// support, if configured) to actually act on; never performed automatically.
router.post(
  "/account-request",
  requireAuth,
  globalOtpLimiter,
  authController.submitAccountRequest,
);

// Connect/disconnect a Google identity on the already-logged-in account
router.post("/link-google", requireAuth, authController.linkGoogleAccount);
router.delete("/link-google", requireAuth, authController.unlinkGoogleAccount);

// Complete registration
router.post("/complete-registration", authMiddleware, authController.completeRegistration);

// Password Reset Routes
router.post(
  "/forgot-password",
  globalOtpLimiter,
  sendOtpLimiter,
  authController.forgotPassword,
);

router.post(
  "/reset-password",
  globalOtpLimiter,
  verifyOtpLimiter,
  authController.resetPassword,
);

// Setup Workspace
router.post(
  "/setup-workspace",
  requireAuth,
  uploadMiddlewareS3().single("workspaceImage"),
  authController.setupWorkspace,
);

module.exports = router;
