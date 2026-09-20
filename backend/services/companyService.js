const Company = require("../models/Company");
const { processAdditionalFields } = require("./fieldCoercionService");

function normalizeSocialMedia(socialMedia) {
  return {
    twitter: socialMedia.twitter || "",
    linkedin: socialMedia.linkedin || "",
    instagram: socialMedia.instagram || "",
    facebook: socialMedia.facebook || "",
    whatsapp: socialMedia.whatsapp || "",
  };
}

// The edit form is multipart/form-data (it also carries a profile picture
// file), which can't send a nested object — it sends "socialMedia[twitter]",
// "socialMedia[instagram]", etc. as flat top-level fields. multer doesn't
// reconstruct those into rawData.socialMedia the way a JSON body would, so
// without this every social link silently failed to save (rawData.socialMedia
// was always undefined and the whole update was skipped).
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

// billingAddress (object) and shippingAddresses (array) arrive as JSON strings
// from the multipart form (FormData can't carry nested structures). Parse them
// so Mongoose can store them. Applied to both create and update.
function normalizeAddresses(data) {
  ["billingAddress", "shippingAddresses"].forEach((key) => {
    if (typeof data[key] === "string") {
      try {
        data[key] = JSON.parse(data[key]);
      } catch {
        delete data[key];
      }
    }
  });
}

/**
 * Purpose: Create a Company document from raw submitted data. Orchestration
 * only — preserves companyController.createCompany's exact original
 * behavior, including the `user` fallback quirk (rawData._id if present,
 * else the acting user's id) shared with contactService, kept as-is.
 * Inputs:
 *   organizationId: ObjectId|string
 *   rawData: plain object (e.g. req.body)
 *   options: { actingUserId, createdByUserId, profilePictureUrl?, session? }
 * Outputs: Promise<CompanyDocument> (populated with user/createdBy/lastUpdatedBy names)
 * Side effects: one Company insert (participates in `session` if provided)
 * Errors thrown: Mongoose ValidationError (missing required `name`/`industry`)
 * Known callers: companyController.createCompany (Phase 0)
 */
async function createCompany(
  organizationId,
  rawData,
  { actingUserId, createdByUserId, profilePictureUrl, session } = {}
) {
  const companyData = {
    ...rawData,
    organization: organizationId,
    user: rawData._id || actingUserId,
    createdBy: createdByUserId,
    lastUpdatedBy: createdByUserId,
  };

  if (profilePictureUrl) {
    companyData.profilePicture = profilePictureUrl;
  }

  const socialMediaInput = extractSocialMediaInput(rawData);
  if (socialMediaInput) {
    companyData.socialMedia = normalizeSocialMedia(socialMediaInput);
  }

  normalizeAddresses(companyData);

  if (rawData.additionalFields) {
    companyData.additionalFields = await processAdditionalFields(
      "company",
      rawData.additionalFields,
      organizationId
    );
  }

  const company = await Company.create([companyData], { session }).then((docs) => docs[0]);

  await company.populate([
    { path: "user", select: "name" },
    { path: "createdBy", select: "name" },
    { path: "lastUpdatedBy", select: "name" },
    { path: "owner", select: "name email" },
  ]);

  return company;
}

/**
 * Purpose: Update an existing Company document from raw submitted data.
 * Permission checking stays in the controller (see contactService's note —
 * same rationale applies).
 * Inputs:
 *   companyId: ObjectId|string
 *   organizationId: ObjectId|string
 *   rawData: plain object (e.g. req.body)
 *   options: { lastUpdatedByUserId, profilePictureUrl?, session? }
 * Outputs: Promise<CompanyDocument|null> - null if no matching company (caller maps to 404)
 * Side effects: one Company findOneAndUpdate (participates in `session` if provided)
 * Errors thrown: Mongoose ValidationError (runValidators: true)
 * Known callers: companyController.updateCompany (Phase 0)
 */
async function updateCompany(
  companyId,
  organizationId,
  rawData,
  { lastUpdatedByUserId, profilePictureUrl, session } = {}
) {
  const updateData = {
    ...rawData,
    lastUpdatedBy: lastUpdatedByUserId,
  };

  delete updateData.createdBy;

  if (profilePictureUrl) {
    updateData.profilePicture = profilePictureUrl;
  }

  const socialMediaInput = extractSocialMediaInput(rawData);
  if (socialMediaInput) {
    updateData.socialMedia = normalizeSocialMedia(socialMediaInput);
  }

  normalizeAddresses(updateData);

  if (rawData.additionalFields) {
    updateData.additionalFields = await processAdditionalFields(
      "company",
      rawData.additionalFields,
      organizationId
    );
  }

  const company = await Company.findOneAndUpdate(
    { _id: companyId, organization: organizationId },
    updateData,
    { new: true, runValidators: true, session }
  )
    .populate("user", "name")
    .populate("createdBy", "name")
    .populate("lastUpdatedBy", "name")
    .populate("owner", "name email");

  return company;
}

module.exports = {
  createCompany,
  updateCompany,
};
