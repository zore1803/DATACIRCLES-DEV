// utils/safeBody.js
//
// Removes server-controlled keys from a client-supplied object (in place) and
// returns it. Used where a controller spreads req.body into a create/update.
//  - `fields`: keys the client may never set (tenant, authorship, identity, audit).
//  - `dropDotted`: also drop keys containing "." — in an update document a key
//    like "inventory.currentStock" is a Mongo dot-path, so it would reach a
//    nested field that the controller deliberately rebuilds or protects.
const SERVER_AUDIT_FIELDS = ["_id", "createdAt", "updatedAt", "__v"];

function stripServerFields(data, fields = [], { dropDotted = false } = {}) {
  if (!data || typeof data !== "object") return data;
  for (const key of Object.keys(data)) {
    if (fields.includes(key) || (dropDotted && key.includes("."))) delete data[key];
  }
  return data;
}

module.exports = { SERVER_AUDIT_FIELDS, stripServerFields };

// Sanitizes the body of a custom-field-definition request (the *Fields settings
// controllers: contact / company / deal / task / meeting / item / vendor).
//  - Drops tenant / identity / audit keys, top-level "$" operators and dotted
//    paths (e.g. "fields.0.createdBy") so the body can be handed to an update.
//  - Stamps every field entry's createdBy with the acting user. A client-supplied
//    createdBy is never trusted; controllers still preserve the stored createdBy of
//    fields that already exist.
// Returns a new object; non-object entries in `fields` are left for validateFields.
const FIELDS_CONFIG_PROTECTED = ["organization", "user", ...SERVER_AUDIT_FIELDS];

function sanitizeFieldsConfigBody(body, userId) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const safe = { ...body };
  for (const key of Object.keys(safe)) {
    if (FIELDS_CONFIG_PROTECTED.includes(key) || key.startsWith("$") || key.includes(".")) delete safe[key];
  }
  if (Array.isArray(safe.fields)) {
    safe.fields = safe.fields.map((f) =>
      f && typeof f === "object" && !Array.isArray(f) ? { ...f, createdBy: userId } : f
    );
  }
  return safe;
}

module.exports.sanitizeFieldsConfigBody = sanitizeFieldsConfigBody;
