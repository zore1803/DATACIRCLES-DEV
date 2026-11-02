// middlewares/sessionGuard.js
//
// Global check that signs a browser out once its DataCircles session has been
// replaced by a newer login (or revoked/expired). Only acts when the request
// carries a dc_session cookie: a browser without one is a first visit and gets
// its session from POST /api/session/establish. A cookie that no longer maps
// to a live session answers 401 SESSION_REVOKED, which the frontend turns
// into a logout.
const sessionService = require("../services/sessionService");
const { COOKIE_NAME, clearSessionCookie } = require("../utils/sessionCookie");

// /api/session/* handles its own cookie checks; public pages and forms are
// visited by people who aren't logged in.
const SKIP_PREFIXES = ["/api/session", "/api/public"];

module.exports = async function sessionGuard(req, res, next) {
  try {
    const sessionId = req.cookies && req.cookies[COOKIE_NAME];
    if (!sessionId || req.method === "OPTIONS") return next();
    if (SKIP_PREFIXES.some((p) => req.path.startsWith(p))) return next();

    const session = await sessionService.findActiveSession(sessionId);
    if (session) return next();

    clearSessionCookie(res);
    return res.status(401).json({
      code: "SESSION_REVOKED",
      message: "You were signed out because your account was logged in on another browser.",
    });
  } catch (err) {
    // A lookup failure must not lock everybody out.
    console.error("sessionGuard error:", err.message);
    return next();
  }
};
