// controllers/sessionController.js
//
// HTTP layer for the DataCircles application-session system. req.auth here
// comes from the existing Auth0/phone JWT middleware (middlewares/auth.js)
// — this controller only runs on the establishment boundary; everywhere
// else, identity comes from the resolved Session (see middlewares/sessionAuth.js).
const sessionService = require("../services/sessionService");
const { setSessionCookie, clearSessionCookie, COOKIE_NAME } = require("../utils/sessionCookie");

// POST /session/establish
// Called once by the frontend right after Auth0 login or phone-OTP
// verification succeeds. req.user is already resolved by userSyncMiddleware
// from the Auth0/phone credential.
exports.establish = async (req, res) => {
  try {
    // Same browser (its dc_session cookie still maps to a live session of this
    // user): keep that session instead of replacing it. Only a login from a
    // different browser/profile/incognito (no such cookie) replaces the old one.
    const existing = await sessionService.findActiveSession(req.cookies && req.cookies[COOKIE_NAME]);
    if (existing && String(existing.userId) === String(req.user._id)) {
      return res.json({
        success: true,
        csrfToken: sessionService.deriveCsrfToken(existing.csrfSecret, existing.sessionId),
        session: {
          id: existing._id,
          createdAt: existing.createdAt,
          expiresAt: existing.expiresAt,
          deviceLabel: existing.deviceLabel,
        },
      });
    }

    const { session, csrfToken } = await sessionService.establishSession({
      userId: req.user._id,
      organization: req.user.organization,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    setSessionCookie(res, session.sessionId);
    res.json({
      success: true,
      csrfToken,
      session: {
        id: session._id,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        deviceLabel: session.deviceLabel,
      },
    });
  } catch (err) {
    if (err instanceof sessionService.SessionLimitError) {
      return res.status(409).json({
        code: err.code,
        message:
          "You've reached the maximum of 2 active sessions. Sign out of another session to continue.",
      });
    }
    console.error("Failed to establish session:", err);
    res.status(500).json({ message: "Failed to establish session" });
  }
};

// GET /session/me
// The authority for "does this browser currently hold a valid DataCircles
// application session" — distinct from GET /auth/me (Auth0/phone identity
// info) and from GET /session (the full session-management listing).
// Reaching this handler at all IS the proof: sessionAuth already 401s
// otherwise, so there is nothing further to check here. Frontend route
// guards (see PrivateRoute.jsx) call this, not /auth/me, to decide
// whether the current browser is authorized to use the app.
exports.me = async (req, res) => {
  res.json({
    authenticated: true,
    userId: req.user._id,
    sessionId: req.session._id,
  });
};

// GET /session/csrf-token
// Re-derives the CSRF token for the already-authenticated session (e.g.
// after a page reload wipes the in-memory copy) without re-establishing a
// whole new session.
exports.csrfToken = async (req, res) => {
  const csrfToken = sessionService.deriveCsrfToken(req.session.csrfSecret, req.session.sessionId);
  res.json({ csrfToken });
};

// POST /session/logout
exports.logout = async (req, res) => {
  const sessionId = req.cookies && req.cookies[COOKIE_NAME];
  if (sessionId) {
    await sessionService.revokeSession(sessionId);
  }
  clearSessionCookie(res);
  res.json({ success: true });
};

// GET /session
exports.list = async (req, res) => {
  const sessions = await sessionService.listActiveSessions(req.user._id, req.session.sessionId);
  res.json({ sessions });
};

// DELETE /session/:id
exports.revoke = async (req, res) => {
  const revoked = await sessionService.revokeSessionById(req.user._id, req.params.id);
  if (!revoked) {
    return res.status(404).json({ message: "Session not found" });
  }
  res.json({ success: true });
};

// POST /session/logout-others
exports.logoutOthers = async (req, res) => {
  await sessionService.revokeOtherSessions(req.user._id, req.session.sessionId);
  res.json({ success: true });
};
