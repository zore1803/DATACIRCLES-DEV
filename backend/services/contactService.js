const Contact = require("../models/Contact");
const { processAdditionalFields } = require("./fieldCoercionService");
const {
  isValidCombination,
  stageForStatus,
  defaultStatusForStage,
  invalidCombinationMessage,
} = require("../constants/contactLifecycle");

function normalizeSocialMedia(socialMedia) {
  return {
    twitter: socialMedia.twitter || "",
    linkedin: socialMedia.linkedin || "",
    instagram: socialMedia.instagram || "",
    facebook: socialMedia.facebook || "",
    whatsapp: socialMedia.whatsapp || "",
  };
}

// The edit form is multipart/form-data (it also carries an avatar file),
// which can't send a nested object — it sends "socialMedia[twitter]",
// "socialMedia[instagram]", etc. as flat top-level fields. multer doesn't
// reconstruct those into rawData.socialMedia the way a JSON body would, so
// without this every social link would silently fail to save (same bug
// companyService.js had — see extractSocialMediaInput there).
function extractSocialMediaInput(rawData) {
  if (rawData.socialMedia && typeof rawData.socialMedia === "object") {
    return rawData.socialMedia;
  }
  const extracted = {};
  let found = false;
  Object.keys(rawData).forEach((key) => {
    const match = key.match(/^socialMedia\[(.+)\]$/);
    if (match) {
      extracted[match[1]] = rawData[key];
      found = true;
    }
  });
  return found ? extracted : rawData.socialMedia;
}

/**
 * Purpose: Create a Contact document from raw submitted data. Orchestration
 * only — preserves contactController.createContact's exact original
 * behavior, including two quirks intentionally kept as-is (not "fixed"
 * during this refactor): (1) `user` is set from `rawData._id` if present,
 * else falls back to the acting user's id — an existing oddity, not
 * introduced here; (2) populate() is called before save() (works today
 * because populate no-ops on empty/unset refs pre-save, but is unusual
 * ordering worth flagging rather than silently reordering).
 * Inputs:
 *   organizationId: ObjectId|string
 *   rawData: plain object (e.g. req.body)
 *   options: { actingUserId, createdByUserId, avatarUrl?, session? }
 *     - actingUserId: used for the `user` fallback (req.user._id in the original)
 *     - createdByUserId: used for createdBy/lastUpdatedBy (req.user._id in the original)
 * Outputs: Promise<ContactDocument> (populated with user/createdBy/lastUpdatedBy names)
 * Side effects: one Contact insert (participates in `session` if provided)
 * Errors thrown: Mongoose ValidationError (missing required fields, invalid
 *   lifecycleStage/stageStatus combination via the model's pre-save hook)
 * Known callers: contactController.createContact (Phase 0)
 */
async function createContact(
  organizationId,
  rawData,
  { actingUserId, createdByUserId, avatarUrl, session } = {}
) {
  let contactData = {
    ...rawData,
    organization: organizationId,
    user: rawData._id || actingUserId,
    createdBy: createdByUserId,
    lastUpdatedBy: createdByUserId,
  };

  if (avatarUrl) {
    contactData.avatar = avatarUrl;
  }

  const socialMediaInput = extractSocialMediaInput(rawData);
  if (socialMediaInput) {
    contactData.socialMedia = normalizeSocialMedia(socialMediaInput);
  }

  if (!contactData.lifecycleStage) {
    contactData.lifecycleStage = "Lead";
  }

  if (!contactData.stageStatus) {
    contactData.stageStatus = defaultStatusForStage(contactData.lifecycleStage);
  }

  // new Contact(...).save() below runs the model's pre-save pair check, so an
  // invalid combination is already rejected — this only makes the message the
  // caller sees identical to the one the update path produces.
  if (!isValidCombination(contactData.lifecycleStage, contactData.stageStatus)) {
    throw new Error(
      invalidCombinationMessage(contactData.lifecycleStage, contactData.stageStatus)
    );
  }

  if (rawData.additionalFields) {
    contactData.additionalFields = await processAdditionalFields(
      "contact",
      rawData.additionalFields,
      organizationId
    );
  }

  const newContact = new Contact(contactData);
  // Ordering preserved from the original controller: populate() before save().
  await newContact.populate([
    { path: "user", select: "name" },
    { path: "createdBy", select: "name" },
    { path: "lastUpdatedBy", select: "name" },
  ]);
  await newContact.save({ session });

  return newContact;
}

/**
 * Purpose: Update an existing Contact document from raw submitted data.
 * Permission checking (403 for non-admin users lacking read-write) is
 * intentionally NOT part of this function — that's request/route-context
 * logic, kept in the controller, not the service (services take explicit
 * params, not req/permissions objects).
 * Inputs:
 *   contactId: ObjectId|string
 *   organizationId: ObjectId|string
 *   rawData: plain object (e.g. req.body)
 *   options: { lastUpdatedByUserId, avatarUrl?, session? }
 * Outputs: Promise<ContactDocument|null> - null if no matching contact (caller maps to 404)
 * Side effects: one Contact findOneAndUpdate (participates in `session` if provided)
 * Errors thrown: Mongoose ValidationError (runValidators: true)
 * Known callers: contactController.updateContact (Phase 0)
 */
async function updateContact(
  contactId,
  organizationId,
  rawData,
  { lastUpdatedByUserId, avatarUrl, session } = {}
) {
  let updateData = {
    ...rawData,
    lastUpdatedBy: lastUpdatedByUserId,
  };

  delete updateData.createdBy;

  if (avatarUrl) {
    updateData.avatar = avatarUrl;
  }

  const socialMediaInput = extractSocialMediaInput(rawData);
  if (socialMediaInput) {
    updateData.socialMedia = normalizeSocialMedia(socialMediaInput);
  }

  // Lifecycle pair integrity. findOneAndUpdate below does NOT run the model's
  // pre-save hook, so without this a partial update could persist a genuinely
  // impossible contact — e.g. a status dropdown that sends only
  // { stageStatus: "Won" } would leave lifecycleStage on "Lead" and mongoose's
  // per-field enums would happily allow it, because each field is valid in
  // isolation. Whichever half the caller sends, the other is filled in or
  // checked here so the two can never disagree in the database.
  if (updateData.lifecycleStage && !updateData.stageStatus) {
    updateData.stageStatus = defaultStatusForStage(updateData.lifecycleStage);
  } else if (updateData.stageStatus && !updateData.lifecycleStage) {
    // Every status belongs to exactly one stage, so the stage is recoverable.
    const derivedStage = stageForStatus(updateData.stageStatus);
    if (!derivedStage) {
      throw new Error(`Invalid stageStatus '${updateData.stageStatus}'`);
    }
    updateData.lifecycleStage = derivedStage;
  }

  if (updateData.lifecycleStage || updateData.stageStatus) {
    if (!isValidCombination(updateData.lifecycleStage, updateData.stageStatus)) {
      throw new Error(
        invalidCombinationMessage(updateData.lifecycleStage, updateData.stageStatus)
      );
    }
  }

  if (rawData.additionalFields) {
    updateData.additionalFields = await processAdditionalFields(
      "contact",
      rawData.additionalFields,
      organizationId
    );
  }

  const updatedContact = await Contact.findOneAndUpdate(
    { _id: contactId, organization: organizationId },
    updateData,
    { new: true, runValidators: true, session }
  )
    .populate("company")
    .populate("user", "name")
    .populate("createdBy", "name")
    .populate("lastUpdatedBy", "name");

  return updatedContact;
}

module.exports = {
  createContact,
  updateContact,
};
