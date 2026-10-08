// middlewares/bodyLimits.js
//
// Request-body size limits for JSON APIs, with a friendly 413 when one is exceeded.
//
// WHY: the app used `express.json({ limit: '50mb' })` for EVERY route, so any caller could make
// the server buffer and JSON.parse 50MB per request. Almost no endpoint needs more than a few
// KB. This replaces it with:
//   - a small default (1MB) for ordinary CRUD / search / filter requests, and
//   - a larger limit ONLY for the few endpoints that legitimately carry big JSON, chosen by an
//     exact METHOD + PATH allowlist below.
//
// WHAT THIS DOES NOT TOUCH: responses (downloads, PDF/CSV/Excel exports) - this only limits the
// size of an incoming JSON body. Multipart file uploads are not JSON: express.json ignores them
// and they keep the limits of their own uploader (multer).
//
// HOW the larger limit is applied despite a global parser: ONE dispatcher is mounted where the
// old `express.json` was. It looks the request up in the allowlist and hands it to the parser
// built for that limit. body-parser marks a request as parsed, so exactly one parser ever runs
// and the global 1MB parser can never reject a bulk import first.
//
// The one place a limit is SMALLER than the default is the anonymous public-form submit (100kb).
//
// ADDING a legitimately large JSON endpoint: add its METHOD + full path to LARGE_BODY_ROUTES.
// (tests/bodyLimits.test.js fails if a new `/bulk-import` route is added without being listed.)
const express = require("express");

// Overridable from the environment so a limit can be tuned in production without a code change.
const DEFAULT_JSON_LIMIT = process.env.JSON_BODY_LIMIT || "1mb";
const BULK_IMPORT_LIMIT = process.env.JSON_BULK_IMPORT_LIMIT || "25mb";
// A signature image is capped at 2MB in the UI; base64 inflates it by ~37%, so ~2.7MB of JSON.
const SIGNATURE_LIMIT = process.env.JSON_SIGNATURE_LIMIT || "5mb";
// An anonymous public-form submission is a small object of field values (file bytes go through
// the separate multipart upload). routes/publicFormRoutes.js already declares 100kb for it, but a
// route-level parser can never win once an app-level one has run - so the limit lives here.
const PUBLIC_FORM_LIMIT = process.env.JSON_PUBLIC_FORM_LIMIT || "100kb";

// Every bulk-import route. Paths are the full path (router mount + route).
const BULK_IMPORT_PATHS = [
  "/api/companies/bulk-import",
  "/api/contacts/bulk-import",
  "/api/deals/bulk-import",
  "/api/items/bulk-import",
  "/api/vendors/bulk-import",
  "/api/purchases/bulk-import",
  "/api/purchase-orders/bulk-import",
  "/api/purchase-returns/bulk-import",
  "/api/sales-returns/bulk-import",
];

// kind -> { limit, message }. `message` is what the user sees when that limit is exceeded.
const KINDS = Object.freeze({
  default: {
    limit: DEFAULT_JSON_LIMIT,
    message: "The request is too large. Please reduce the amount of data and try again.",
  },
  "bulk-import": {
    limit: BULK_IMPORT_LIMIT,
    message: "The import is too large. Please reduce the number of records or split the import into smaller batches.",
  },
  signature: {
    limit: SIGNATURE_LIMIT,
    message: "The signature image is too large. Please use a smaller image and try again.",
  },
  "public-form": {
    limit: PUBLIC_FORM_LIMIT,
    message: "Your submission is too large. Please shorten your answers and try again.",
  },
});

// "METHOD /path" -> kind. Exact match only: no prefixes, no wildcards.
const LARGE_BODY_ROUTES = new Map([
  ...BULK_IMPORT_PATHS.map((p) => [`POST ${p}`, "bulk-import"]),
  ["POST /api/document-settings/signatures", "signature"],
]);

// Routes whose path contains a parameter, so they cannot be listed literally. Anchored, one
// segment per parameter, exact method.
const LARGE_BODY_PATTERNS = [
  { method: "POST", pattern: /^\/api\/public\/forms\/[^/]+\/submit$/, kind: "public-form" },
];

// Normalised the way Express routes: no query string, case-insensitive, trailing slash ignored.
const normalisedPath = (req) =>
  String(req.originalUrl || req.url || "")
    .split("?")[0]
    .toLowerCase()
    .replace(/\/+$/, "");
const routeKey = (req) => `${req.method} ${normalisedPath(req)}`;

const kindFor = (req) => {
  const exact = LARGE_BODY_ROUTES.get(routeKey(req));
  if (exact) return exact;
  const path = normalisedPath(req);
  const hit = LARGE_BODY_PATTERNS.find((r) => r.method === req.method && r.pattern.test(path));
  return hit ? hit.kind : "default";
};

const parsers = Object.fromEntries(
  Object.entries(KINDS).map(([kind, { limit }]) => [kind, express.json({ limit })]),
);

// Mount in place of `express.json(...)`.
function jsonBodyParser(req, res, next) {
  const kind = kindFor(req);
  req.bodyLimitKind = kind;
  return parsers[kind](req, res, next);
}

// `express.raw` for application/json is kept for parity with the old setup. In practice
// express.json has already handled every JSON request by the time it runs, so it is mounted
// with the default limit and never the old 50MB.
const rawBodyParser = express.raw({ type: "application/json", limit: DEFAULT_JSON_LIMIT });

// Error middleware: ONLY body-parser's "too large" error is answered here. Everything else
// (malformed JSON, errors from later middleware/routes) is passed on untouched, so the
// application's own error handler keeps handling it exactly as before. Mount it directly after
// the parsers.
function payloadTooLargeHandler(err, req, res, next) {
  if (!err || err.type !== "entity.too.large" || res.headersSent) return next(err);

  const kind = KINDS[req.bodyLimitKind] ? req.bodyLimitKind : "default";
  const { message } = KINDS[kind];

  // Operational signal only: which route and how big. Never the body, headers, or the error's
  // own text/stack. JSON.stringify keeps a crafted path from forging log lines.
  console.warn(
    `[body-limit] 413 ${JSON.stringify(routeKey(req))} content-length=${req.headers["content-length"] || "unknown"} limit=${kind}`,
  );

  // `message` and `error`: screens read one or the other. Nothing internal is exposed.
  return res.status(413).json({ success: false, message, error: message, code: "PAYLOAD_TOO_LARGE" });
}

module.exports = {
  jsonBodyParser,
  rawBodyParser,
  payloadTooLargeHandler,
  // exported for tests
  KINDS,
  LARGE_BODY_ROUTES,
  LARGE_BODY_PATTERNS,
  BULK_IMPORT_PATHS,
};
