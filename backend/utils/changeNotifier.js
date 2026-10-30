// utils/changeNotifier.js
//
// A global Mongoose plugin that turns every create / update / delete on a
// tracked model into a Notification record. Registered once via
// `mongoose.plugin(...)` in server.js *before* any model is compiled, so it
// applies to all schemas.
//
// Actor + organization come from the per-request AsyncLocalStorage store
// (middlewares/requestContext.js). If there is no request context (e.g. a
// background cron job), the write is silently skipped — feed entries only ever
// reflect user actions. Notification writes are best-effort: any failure is
// swallowed so it can never break the primary database operation.

const { als } = require("../middlewares/requestContext");

// Models we never generate feed entries for: the notification tables
// themselves (avoids recursion), auth/identity bookkeeping that gets written on
// almost every request, and settings side-tables that would be noise.
const EXCLUDED_MODELS = new Set([
  "Notification",
  "NotificationSettings",
  "SuperAdmin",
  "Session",
]);

// Staff changes are reported, but User documents are also written on almost
// every request (logins, profile sync, onboarding), so for them only a few
// changes are worth a notification: someone being added or removed, and an
// existing member's role / permissions changing (an upgrade or downgrade).
const STAFF_UPDATE_FIELDS = new Set(["Role", "Permissions"]);

// Friendlier names than the raw model name for the feed.
const TYPE_LABELS = {
  User: "Staff Member",
  Invited: "Staff Invitation",
};

// Fields never worth reporting in an update diff.
const FIELD_BLACKLIST = new Set([
  "updatedAt",
  "createdAt",
  "__v",
  "password",
  "organization",
  "readBy",
]);

// Cap how much we store per notification so a bulk field update can't bloat a
// document.
const MAX_CHANGES = 12;

// Turn a PascalCase model name into a friendlier label: "PurchaseOrder" -> "Purchase Order".
function humanType(modelName) {
  if (!modelName) return "Record";
  if (TYPE_LABELS[modelName]) return TYPE_LABELS[modelName];
  return modelName.replace(/([a-z])([A-Z])/g, "$1 $2");
}

// Turn a camelCase (or PascalCase) field name into a friendly label for the
// "Changed: ..." line, e.g. "swiftCode" -> "Swift Code",
// "stockMovementStatus" -> "Stock Movement Status", "gstin" -> "Gstin".
function humanField(field) {
  if (!field) return field;
  const spaced = String(field)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return spaced
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Some model names are inherently plural ("Bank Details") and read oddly
// with an "A/An ... was" construction when there's no record label to name
// instead ("A bank details was updated"). Detected heuristically so the
// fallback message stays grammatical for those.
function isPluralType(entityType) {
  return /s$/i.test(entityType) && !/ss$/i.test(entityType);
}

// Best-effort display name for a record.
function labelFor(doc) {
  if (!doc) return "";
  const candidates = [
    doc.name,
    doc.title,
    doc.companyName,
    doc.fullName,
    doc.invoiceNumber,
    doc.quotationNumber,
    doc.email,
  ];
  const found = candidates.find((v) => typeof v === "string" && v.trim());
  return found ? String(found).trim() : "";
}

function safeValue(v) {
  if (v == null) return v;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    // Keep nested objects/arrays compact and serialisable.
    try {
      const s = JSON.stringify(v);
      return s.length > 200 ? s.slice(0, 200) + "…" : s;
    } catch {
      return "[object]";
    }
  }
  return v;
}

function getActor() {
  const store = als.getStore();
  const user = store && store.req && store.req.user;
  if (!user || !user._id) return null;
  return {
    id: user._id,
    name: user.name || user.email || "Someone",
    organization: user.organization,
  };
}

function buildMessage(action, entityType, label) {
  const verb = action === "created" ? "created" : action === "deleted" ? "deleted" : "updated";
  // Passive voice, no actor: `Company "Acme" was deleted`.
  if (label) return `${entityType} "${label}" was ${verb}`;
  // No label to name the record — for a plural-looking type ("Bank Details")
  // "A bank details was updated" reads wrong; use plural phrasing instead.
  if (isPluralType(entityType)) {
    return `${entityType} were ${verb}`;
  }
  const lower = entityType.toLowerCase();
  const article = /^[aeiou]/i.test(lower) ? "An" : "A";
  return `${article} ${lower} was ${verb}`;
}

// Changed fields from a saved document, using the paths Mongoose marked dirty.
function changesFromModifiedPaths(doc, paths) {
  const out = [];
  for (const path of paths || []) {
    const top = path.split(".")[0];
    if (FIELD_BLACKLIST.has(top)) continue;
    out.push({ field: humanField(top), value: safeValue(doc.get(top)) });
    if (out.length >= MAX_CHANGES) break;
  }
  // De-dupe by field (nested paths can collapse to the same top-level key).
  const seen = new Set();
  return out.filter((c) => (seen.has(c.field) ? false : seen.add(c.field)));
}

// Changed fields from a query update object ($set / top-level assignments).
function changesFromUpdate(update) {
  if (!update || typeof update !== "object") return [];
  const flat = { ...update };
  if (flat.$set && typeof flat.$set === "object") Object.assign(flat, flat.$set);
  const out = [];
  for (const key of Object.keys(flat)) {
    if (key.startsWith("$")) continue;
    const top = key.split(".")[0];
    if (FIELD_BLACKLIST.has(top)) continue;
    out.push({ field: humanField(top), value: safeValue(flat[key]) });
    if (out.length >= MAX_CHANGES) break;
  }
  const seen = new Set();
  return out.filter((c) => (seen.has(c.field) ? false : seen.add(c.field)));
}

async function record({ modelName, action, doc, changes, organization }) {
  try {
    if (!modelName || EXCLUDED_MODELS.has(modelName)) return;
    const actor = getActor();
    if (!actor) return; // no user context -> skip (background jobs, public routes)

    const org =
      organization || (doc && doc.organization) || actor.organization;
    if (!org) return;

    // De-duplicate within a single request. A user action can trip more than
    // one Mongoose hook for the same record (e.g. a cascade, or a document +
    // query hook pair). Keying on action+model+id collapses those into one
    // notification per record per request.
    const store = als.getStore();
    const entityId = doc && doc._id;
    if (store && entityId) {
      if (!store.__notified) store.__notified = new Set();
      const key = `${action}:${modelName}:${entityId}`;
      if (store.__notified.has(key)) return;
      store.__notified.add(key);
    }

    // User / Invited: skip routine writes. Invitations only matter when sent
    // or withdrawn; staff updates only when role / permissions changed.
    if (modelName === "Invited" && action === "updated") return;
    if (modelName === "User" && action === "updated") {
      changes = (changes || []).filter((c) => STAFF_UPDATE_FIELDS.has(c.field));
      if (changes.length === 0) return;
    }

    const Notification = require("../models/Notification");
    const entityType = humanType(modelName);
    const label = labelFor(doc);
    const message = buildMessage(action, entityType, label);

    await Notification.create({
      organization: org,
      actor: actor.id,
      actorName: actor.name,
      action,
      entityType,
      entityId: doc && doc._id,
      entityLabel: label,
      changes: action === "updated" ? changes || [] : [],
      message,
    });
  } catch (err) {
    // Never let notification bookkeeping break the real operation.
    if (process.env.NODE_ENV !== "production") {
      console.error("changeNotifier failed:", err.message);
    }
  }
}

module.exports = function changeNotifierPlugin(schema) {
  // --- document.save() : create + update -----------------------------------
  schema.pre("save", function (next) {
    this.$locals.__wasNew = this.isNew;
    this.$locals.__modifiedPaths = this.isNew ? [] : this.modifiedPaths();
    next();
  });

  schema.post("save", function (doc) {
    const modelName = doc.constructor.modelName;
    const wasNew = doc.$locals.__wasNew;
    record({
      modelName,
      action: wasNew ? "created" : "updated",
      doc,
      changes: wasNew ? [] : changesFromModifiedPaths(doc, doc.$locals.__modifiedPaths),
    });
  });

  // --- Model.insertMany() : bulk create ------------------------------------
  schema.post("insertMany", function (docs) {
    if (!Array.isArray(docs)) return;
    const modelName = this.modelName;
    docs.forEach((doc) => record({ modelName, action: "created", doc }));
  });

  // --- Query updates: findByIdAndUpdate / findOneAndUpdate / updateOne ------
  schema.post(["findOneAndUpdate", "updateOne", "updateMany"], function (res) {
    const modelName = this.model.modelName;
    const filter = this.getFilter ? this.getFilter() : {};
    // `res` is the returned doc when the query used {new:true} or is a
    // findOneAnd* op; for plain updateOne it's a write result with no _id.
    const doc =
      res && res._id ? res : { _id: filter && filter._id, organization: filter && filter.organization };
    record({
      modelName,
      action: "updated",
      doc,
      changes: changesFromUpdate(this.getUpdate ? this.getUpdate() : null),
      organization: filter && filter.organization,
    });
  });

  // --- Query deletes: findByIdAndDelete / findOneAndDelete / deleteMany -----
  // NOTE: query-level `deleteOne` is deliberately NOT hooked here. `doc.deleteOne()`
  // internally fires the query `deleteOne` hook (which has no loaded document, so
  // no label) *before* the document hook below — hooking it would win the per-
  // request de-dupe and drop the label. Direct `Model.deleteOne(filter)` calls
  // are rare; document.deleteOne() and findByIdAndDelete cover the app's deletes.
  schema.post(
    ["findOneAndDelete", "findOneAndRemove", "deleteMany"],
    function (res) {
      const modelName = this.model.modelName;
      const filter = this.getFilter ? this.getFilter() : {};
      const doc =
        res && res._id ? res : { _id: filter && filter._id, organization: filter && filter.organization };
      record({
        modelName,
        action: "deleted",
        doc,
        organization: filter && filter.organization,
      });
    }
  );

  // --- document.deleteOne() : document-level delete (has full doc + label) --
  schema.post("deleteOne", { document: true, query: false }, function (doc) {
    record({
      modelName: this.constructor.modelName,
      action: "deleted",
      doc: doc || this,
    });
  });
};
