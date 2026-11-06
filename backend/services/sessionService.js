// services/sessionService.js
//
// Core of the DataCircles application-session layer. Auth0 (Google) and
// phone OTP both authenticate *identity*; this module is what turns a
// verified identity into a DataCircles application session and enforces
// "at most 2 concurrent sessions per user."
//
// Concurrency guarantee: reservation never does count-then-insert. Each
// user has exactly two session "slots" (0 and 1), enforced by a compound
// unique index on { userId, slot } (see models/Session.js). Reserving a
// slot is `Session.create` inside a transaction, guarded by a try/catch on
// the duplicate-key error (E11000) that Mongo raises when another session
// already holds that slot — so two concurrent establish calls can never
// both succeed into the same slot, and a 3rd concurrent call when both
// slots are live always fails. See backend/scripts/verifySessionConcurrency.js
// for a script that proves this under concurrent load.
const crypto = require("crypto");
const mongoose = require("mongoose");
const Session = require("../models/Session");
const User = require("../models/User");

const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS) || 30;
// How many browsers/devices one user may be logged in on at once. Logging in on
// another device or browser does not replace an existing session. Capped at 2
// because the Session model only has slots 0 and 1.
const MAX_SESSIONS_PER_USER = Math.min(Math.max(Number(process.env.MAX_SESSIONS_PER_USER) || 2, 1), 2);
const SLOTS = Array.from({ length: MAX_SESSIONS_PER_USER }, (_, i) => i);
const DUPLICATE_KEY_ERROR = 11000;

class SessionLimitError extends Error {
  constructor() {
    super("Maximum number of active sessions reached");
    this.code = "SESSION_LIMIT_REACHED";
  }
}

function newSessionId() {
  return crypto.randomBytes(32).toString("hex");
}

function newCsrfSecret() {
  return crypto.randomBytes(32).toString("hex");
}

function deriveCsrfToken(csrfSecret, sessionId) {
  return crypto.createHmac("sha256", csrfSecret).update(sessionId).digest("hex");
}

function deviceLabelFromUserAgent(userAgent = "") {
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Chrome\//.test(userAgent)
      ? "Chrome"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "Browser";
  const os = /Windows/.test(userAgent)
    ? "Windows"
    : /Mac OS X/.test(userAgent)
      ? "macOS"
      : /Android/.test(userAgent)
        ? "Android"
        : /iPhone|iPad/.test(userAgent)
          ? "iOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "";
  return os ? `${browser} · ${os}` : browser;
}

// Removes an expired/revoked row occupying a given slot so the slot can be
// reused, inside the same transaction as the reservation attempt.
async function clearStaleSlot(userId, slot, now, session) {
  await Session.deleteOne(
    {
      userId,
      slot,
      $or: [{ revokedAt: { $ne: null } }, { expiresAt: { $lte: now } }],
    },
    { session },
  );
}

/**
 * Atomically reserve one of a user's two session slots. Throws
 * SessionLimitError if both slots are currently held by a live session.
 */
async function reserveSlot({ userId, organization, ip, userAgent, slots = SLOTS }) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const sessionId = newSessionId();
  const csrfSecret = newCsrfSecret();
  const deviceLabel = deviceLabelFromUserAgent(userAgent);

  for (const slot of slots) {
    const dbSession = await mongoose.startSession();
    try {
      let created = null;
      await dbSession.withTransaction(async () => {
        await clearStaleSlot(userId, slot, now, dbSession);
        const docs = await Session.create(
          [
            {
              sessionId,
              userId,
              organization,
              slot,
              createdAt: now,
              lastActiveAt: now,
              expiresAt,
              revokedAt: null,
              ip,
              userAgent,
              deviceLabel,
              csrfSecret,
            },
          ],
          { session: dbSession },
        );
        created = docs[0];
      });
      return created;
    } catch (err) {
      if (err && err.code === DUPLICATE_KEY_ERROR) {
        // Slot is held by a live session — try the next slot.
        continue;
      }
      throw err;
    } finally {
      await dbSession.endSession();
    }
  }

  throw new SessionLimitError();
}

/**
 * Establish a DataCircles session for an already-authenticated identity
 * (Auth0 or phone/password JWT verification has already happened by the
 * time this is called). Returns { session, csrfToken }.
 */
async function establishSession({ userId, organization, ip, userAgent }) {
  // A new login never signs an existing one out. Each user has two slots; when
  // both are held by live sessions, reserveSlot throws SessionLimitError.
  const session = await reserveSlot({ userId, organization, ip, userAgent });
  const csrfToken = deriveCsrfToken(session.csrfSecret, session.sessionId);
  return { session, csrfToken };
}

async function findActiveSession(sessionId) {
  if (!sessionId) return null;
  return Session.findOne({
    sessionId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });
}

async function revokeSession(sessionId) {
  await Session.updateOne(
    { sessionId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

async function revokeSessionById(userId, id) {
  const doc = await Session.findOne({ _id: id, userId });
  if (!doc) return false;
  doc.revokedAt = new Date();
  await doc.save();
  return true;
}

async function revokeOtherSessions(userId, currentSessionId) {
  await Session.updateMany(
    { userId, sessionId: { $ne: currentSessionId }, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

async function listActiveSessions(userId, currentSessionId) {
  const now = new Date();
  const sessions = await Session.find({
    userId,
    revokedAt: null,
    expiresAt: { $gt: now },
  }).sort({ lastActiveAt: -1 });

  return sessions.map((s) => ({
    id: s._id,
    current: s.sessionId === currentSessionId,
    createdAt: s.createdAt,
    lastActiveAt: s.lastActiveAt,
    deviceLabel: s.deviceLabel,
    ip: s.ip,
  }));
}

const LAST_ACTIVE_THROTTLE_MS = 5 * 60 * 1000;

function touchLastActive(session) {
  const now = Date.now();
  if (now - new Date(session.lastActiveAt).getTime() < LAST_ACTIVE_THROTTLE_MS) {
    return;
  }
  // Fire-and-forget, throttled — activity display only needs
  // few-minute granularity, not per-request precision.
  Session.updateOne({ _id: session._id }, { $set: { lastActiveAt: new Date() } }).catch(
    (err) => console.error("Failed to update session lastActiveAt:", err),
  );
}

module.exports = {
  SessionLimitError,
  establishSession,
  findActiveSession,
  revokeSession,
  revokeSessionById,
  revokeOtherSessions,
  listActiveSessions,
  touchLastActive,
  deriveCsrfToken,
  SESSION_TTL_DAYS,
};
