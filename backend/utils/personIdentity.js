const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Organization = require("../models/Organization");
const Branding = require("../models/Branding");

/*
 * A person can belong to several organizations. Each membership is its own User record, and
 * the records of one person share `personId` (see models/User.js). Everything org-scoped in the
 * app keeps reading req.user.organization, so "being in an organization" simply means
 * "authenticated as that organization's record". This module is the one place that knows how
 * the records of a person are found, described and switched between.
 *
 * Switching is only ever allowed between records of the same person, found by personId (or by
 * the same auth0Id, which is one Google identity). It is never inferred from a shared email or
 * phone number alone: phone numbers are not unique, and sharing one must not unlock someone
 * else's organizations.
 */

// Stable key for "which person is this record": the shared personId, or the record's own id
// when it has never been linked to another organization.
const personKey = (user) => String(user.personId || user._id);

// Every record that belongs to the same person as `user`, oldest first (includes `user`).
async function getPersonRecords(user) {
  const or = [{ _id: user._id }];
  if (user.personId) or.push({ personId: user.personId });
  if (user.auth0Id) or.push({ auth0Id: user.auth0Id });
  return User.find({ $or: or }).sort({ createdAt: 1 });
}

// Gives a single-organization account a personId so a second organization can be linked to it.
async function ensurePersonId(user) {
  if (!user.personId) {
    user.personId = user._id;
    await user.save();
  }
  return user.personId;
}

// Display rows for an organization picker / switcher. The organization's name is what the user
// sees in Settings > Organization Details (Branding.companyName); Organization.name is only the
// name typed once at signup.
async function describeRecords(records, currentUserId = null) {
  // `organization` is an ObjectId on most records but a populated document on some callers' (login
  // populates it), so always compare by its id.
  const orgIdOf = (r) => String(r.organization?._id || r.organization);
  const orgIds = records.map((r) => r.organization?._id || r.organization).filter(Boolean);
  const [orgs, brandings] = await Promise.all([
    Organization.find({ _id: { $in: orgIds } }).select("name").lean(),
    Branding.find({ organization: { $in: orgIds } }).sort({ updatedAt: -1 }).select("organization companyName").lean(),
  ]);
  const orgName = new Map(orgs.map((o) => [String(o._id), o.name]));
  const brandName = new Map();
  for (const b of brandings) {
    const key = String(b.organization);
    if (!brandName.has(key) && b.companyName) brandName.set(key, b.companyName);
  }
  return records.map((r) => ({
    userId: r._id,
    organizationId: r.organization?._id || r.organization,
    name: brandName.get(orgIdOf(r)) || orgName.get(orgIdOf(r)) || "Organization",
    role: r.role,
    isCurrent: currentUserId ? String(r._id) === String(currentUserId) : false,
  }));
}

// Short-lived proof that the holder just authenticated as one of `ids` (a password or an OTP was
// verified). The picker exchanges it, together with the chosen record, for a real session token.
function signSelectionToken(ids, kind) {
  return jwt.sign({ purpose: "org-select", kind, ids: ids.map(String) }, process.env.JWT_SECRET, {
    expiresIn: "5m",
  });
}

function verifySelectionToken(token) {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  if (decoded.purpose !== "org-select" || !Array.isArray(decoded.ids)) {
    throw new Error("Not a selection token");
  }
  return decoded;
}

// Session token pinned to ONE specific record, so it names an organization.
//   password: sub "password|<userId>"        (userSync loads that record directly)
//   phone:    sub "phone|<phone>|<userId>"   (the third part pins the record; older tokens
//                                             without it fall back to the first match)
function issueSessionToken(user, kind) {
  const secret = process.env.JWT_SECRET;
  if (kind === "phone") {
    return jwt.sign(
      {
        sub: `phone|${user.phone}|${user._id}`,
        name: user.name,
        [`${process.env.AUTH0_NAMESPACE}email`]: user.profileEmail,
        [`${process.env.AUTH0_NAMESPACE}name`]: user.name,
      },
      secret,
      { expiresIn: "7d" },
    );
  }
  return jwt.sign(
    {
      sub: `password|${user._id}`,
      user_id: user._id,
      role: user.role,
      organization: user.organization?._id || user.organization,
      email: user.email,
    },
    secret,
    { expiresIn: process.env.JWT_EXPIRES_IN },
  );
}

// Credentials and verification flags belong to the person, not to one organization's record, so
// when one changes it has to change on all of them or the records drift apart (a new password
// working in one organization and not another).
const SHARED_IDENTITY_FIELDS = [
  "password",
  "email",
  "phone",
  "isEmailVerified",
  "isPhoneVerified",
  "auth0Id",
];

// A field passed as undefined/null is removed from the siblings (e.g. disconnecting Google has to
// disconnect it everywhere, or a sibling record would keep that front door open).
async function syncIdentityToSiblings(user, fields) {
  const set = {};
  const unset = {};
  for (const key of SHARED_IDENTITY_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(fields, key)) continue;
    if (fields[key] === undefined || fields[key] === null) unset[key] = "";
    else set[key] = fields[key];
  }
  const update = {};
  if (Object.keys(set).length) update.$set = set;
  if (Object.keys(unset).length) update.$unset = unset;
  if (Object.keys(update).length === 0) return;
  const or = [];
  if (user.personId) or.push({ personId: user.personId });
  if (user.auth0Id) or.push({ auth0Id: user.auth0Id });
  // After an unlink the record itself no longer carries auth0Id: match on personId only.
  if (or.length === 0) return;
  await User.updateMany({ _id: { $ne: user._id }, $or: or }, update);
}

// Ids of every record of this person: used to exclude them from "already in use" checks.
async function personRecordIds(user) {
  const records = await getPersonRecords(user);
  return records.map((r) => r._id);
}

module.exports = {
  personKey,
  getPersonRecords,
  ensurePersonId,
  describeRecords,
  signSelectionToken,
  verifySelectionToken,
  issueSessionToken,
  syncIdentityToSiblings,
  personRecordIds,
};
