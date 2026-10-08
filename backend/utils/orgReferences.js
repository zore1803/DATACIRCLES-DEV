// utils/orgReferences.js
//
// Tenant check for relationship fields: a record may only point at other
// records that belong to the caller's own organization. Shared by the deal and
// company create/update paths so there is one implementation of the rule.
const mongoose = require("mongoose");

// Resolves one relationship value from a request.
//  - undefined / null / ""  -> "not supplied"; passed through untouched, nothing
//    to verify (create falls back to a default, update clears the reference).
//  - an id string, or a populated { _id } object -> must be a valid ObjectId AND
//    belong to `organization`.
// A record that doesn't exist and one that belongs to another tenant get the
// same answer, so the response can't be used to probe other organizations.
// Returns { error } or { id }.
const resolveOrgReference = async (Model, label, value, organization) => {
  if (value === undefined || value === null || value === "") return { id: value };
  const id = typeof value === "object" && value._id ? value._id : value;
  if (typeof id !== "string" || !mongoose.isValidObjectId(id)) {
    return { error: `Invalid ${label}` };
  }
  const exists = await Model.exists({ _id: id, organization });
  if (!exists) return { error: `${label} not found in your organization` };
  return { id };
};

// Verifies every relationship field in `specs` that is present on `data`
// against `organization`, and normalizes each to a plain id. Mutates `data`.
//   specs: [{ field, Model, label, many? }]  (many: the field is an array of refs)
// Returns an error message, or null when everything checks out.
const validateOrgReferences = async (data, organization, specs) => {
  for (const { field, Model, label, many } of specs) {
    if (!(field in data)) continue;

    if (many) {
      const value = data[field];
      if (value === undefined || value === null || value === "") continue;
      if (!Array.isArray(value)) return `Invalid ${label}`;
      const ids = [];
      for (const item of value) {
        const ref = await resolveOrgReference(Model, label, item, organization);
        if (ref.error) return ref.error;
        if (ref.id !== undefined && ref.id !== null && ref.id !== "") ids.push(ref.id);
      }
      data[field] = ids;
      continue;
    }

    const ref = await resolveOrgReference(Model, label, data[field], organization);
    if (ref.error) return ref.error;
    data[field] = ref.id;
  }
  return null;
};

module.exports = { resolveOrgReference, validateOrgReferences };
