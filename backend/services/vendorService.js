const Vendor = require("../models/Vendor");
const { processAdditionalFields } = require("./fieldCoercionService");
const { gstinError } = require("../utils/gstinValidation");
const { SERVER_AUDIT_FIELDS, stripServerFields } = require("../utils/safeBody");

// Fields a client may never set through create/update: tenant and identity
// (plus the audit timestamps). `user` is the creating user: set on create, and
// never re-pointed by an edit.
const VENDOR_PROTECTED_FIELDS = ["organization", "user", ...SERVER_AUDIT_FIELDS];

/**
 * Purpose: Error subclass carrying the exact {message} response shape the
 * original vendorController returned for malformed address/additionalFields
 * JSON, so the controller can map it back to the identical 400 response
 * without vendorService knowing about Express.
 */
class VendorInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "VendorInputError";
  }
}

// Uppercases/trims a submitted GSTIN and rejects it if invalid. A value equal to the one
// already stored is accepted, so older records with a bad GSTIN can still be edited.
function checkGstin(data, previous = "") {
  if (data.gstin === undefined || data.gstin === null) return;
  const gstin = String(data.gstin).trim().toUpperCase();
  data.gstin = gstin;
  if (!gstin || gstin === String(previous || "").trim().toUpperCase()) return;
  const invalid = gstinError(gstin);
  if (invalid) throw new VendorInputError(invalid);
}

function normalizeSocialMedia(socialMedia) {
  return {
    twitter: socialMedia.twitter || "",
    linkedin: socialMedia.linkedin || "",
    instagram: socialMedia.instagram || "",
    facebook: socialMedia.facebook || "",
    whatsapp: socialMedia.whatsapp || "",
  };
}

/**
 * Purpose: Build the persistable vendor payload from raw input, preserving
 * vendorController's exact behavior: socialMedia normalization, JSON parsing
 * of stringified `address`/`additionalFields` (multipart/form-data sends
 * nested objects as strings), and additionalFields type coercion.
 * Inputs: rawData (plain object, e.g. req.body)
 * Outputs: Promise<Object> - vendor payload ready to merge with organization/user/avatar
 * Side effects: one read query via processAdditionalFields
 * Errors thrown: VendorInputError("Invalid address format" | "Invalid additionalFields format")
 *   on malformed JSON strings, matching the original try/catch behavior exactly.
 */
async function buildVendorPayload(rawData, organizationId) {
  const data = { ...rawData };

  if (data.socialMedia) {
    data.socialMedia = normalizeSocialMedia(data.socialMedia);
  }

  if (data.address) {
    try {
      data.address = typeof data.address === "string" ? JSON.parse(data.address) : data.address;
    } catch (err) {
      throw new VendorInputError("Invalid address format");
    }
  }

  if (data.additionalFields) {
    try {
      const parsedFields =
        typeof data.additionalFields === "string"
          ? JSON.parse(data.additionalFields)
          : data.additionalFields;
      data.additionalFields = await processAdditionalFields("vendor", parsedFields, organizationId);
    } catch (err) {
      if (err instanceof VendorInputError) throw err;
      throw new VendorInputError("Invalid additionalFields format");
    }
  }

  return data;
}

/**
 * Purpose: Create a Vendor document from raw submitted data. Orchestration
 * only — payload shaping delegated to buildVendorPayload, coercion delegated
 * to fieldCoercionService.
 * Inputs:
 *   organizationId: ObjectId|string
 *   rawData: plain object (e.g. req.body)
 *   options: { userId, avatarUrl?, session? }
 * Outputs: Promise<VendorDocument>
 * Side effects: one Vendor insert (participates in `session` if provided — see
 *   FORMS_IMPLEMENTATION.md §0.4a; unused by any Phase 0 caller)
 * Errors thrown: VendorInputError (bad address/additionalFields JSON),
 *   Mongoose ValidationError (missing required fields, e.g. `name`)
 * Known callers: vendorController.createVendor (Phase 0)
 */
async function createVendor(organizationId, rawData, { userId, avatarUrl, session } = {}) {
  const payload = stripServerFields(await buildVendorPayload(rawData, organizationId), VENDOR_PROTECTED_FIELDS);
  checkGstin(payload);

  const vendorData = {
    ...payload,
    user: userId,
    organization: organizationId,
  };

  if (avatarUrl) {
    vendorData.avatar = avatarUrl;
  }

  const vendor = new Vendor(vendorData);
  await vendor.save({ session });
  return vendor;
}

/**
 * Purpose: Update an existing Vendor document from raw submitted data.
 * Inputs:
 *   vendorId: ObjectId|string
 *   organizationId: ObjectId|string (used to scope the update, matching original)
 *   rawData: plain object (e.g. req.body)
 *   options: { avatarUrl?, session? }
 * Outputs: Promise<VendorDocument|null> - null if no matching vendor (caller maps to 404)
 * Side effects: one Vendor findOneAndUpdate (participates in `session` if provided)
 * Errors thrown: VendorInputError (bad address/additionalFields JSON),
 *   Mongoose ValidationError (runValidators: true)
 * Known callers: vendorController.updateVendor (Phase 0)
 */
async function updateVendor(vendorId, organizationId, rawData, { avatarUrl, session } = {}) {
  // The target vendor is already pinned to organizationId by the
  // findOneAndUpdate filter below; these must not be re-pointed by the client.
  const payload = stripServerFields(await buildVendorPayload(rawData, organizationId), VENDOR_PROTECTED_FIELDS);
  if (payload.gstin && String(payload.gstin).trim()) {
    const existing = await Vendor.findOne({ _id: vendorId, organization: organizationId })
      .select("gstin")
      .lean()
      .session(session || null);
    checkGstin(payload, existing?.gstin);
  } else {
    checkGstin(payload);
  }

  const updateData = { ...payload };
  if (avatarUrl) {
    updateData.avatar = avatarUrl;
  }

  const vendor = await Vendor.findOneAndUpdate(
    { _id: vendorId, organization: organizationId },
    updateData,
    { new: true, runValidators: true, session }
  );

  return vendor;
}

module.exports = {
  VENDOR_PROTECTED_FIELDS,
  VendorInputError,
  checkGstin,
  createVendor,
  updateVendor,
};
