// services/contactLifecycleService.js
//
// Org-aware replacement for the static lookups in constants/contactLifecycle.js.
// That file is now only the SEED used the first time an organization's
// ContactLifecycleSettings row is created — once it exists, every validation
// path (Contact model's pre-save hook, contactService, contactController)
// reads the stage/status map through here instead.
const ContactLifecycleSettings = require("../models/ContactLifecycleSettings");
const {
  STAGE_STATUS_MAP: DEFAULT_STAGE_STATUS_MAP,
  LIFECYCLE_STAGES: DEFAULT_LIFECYCLE_STAGES,
} = require("../constants/contactLifecycle");

function defaultStages() {
  return DEFAULT_LIFECYCLE_STAGES.map((name) => ({
    name,
    statuses: [...DEFAULT_STAGE_STATUS_MAP[name]],
  }));
}

async function getOrCreateSettings(organizationId) {
  let doc = await ContactLifecycleSettings.findOne({ organization: organizationId });
  if (!doc) {
    doc = await ContactLifecycleSettings.create({
      organization: organizationId,
      stages: defaultStages(),
    });
  }
  return doc;
}

// Read-only lookup — never creates a row, so a pre-save hook that only needs
// the map to validate one contact doesn't also silently create settings for
// every organization that writes a contact before ever opening the drawer.
async function getStageMap(organizationId) {
  const doc = await ContactLifecycleSettings.findOne({ organization: organizationId });
  const stages = doc?.stages?.length ? doc.stages : defaultStages();
  const map = {};
  stages.forEach((s) => {
    map[s.name] = s.statuses;
  });
  return map;
}

function isValidStageInMap(map, stage) {
  return Object.prototype.hasOwnProperty.call(map, stage);
}

function isValidCombinationInMap(map, stage, status) {
  return isValidStageInMap(map, stage) && map[stage].includes(status);
}

function stageForStatusInMap(map, status) {
  return Object.keys(map).find((stage) => map[stage].includes(status)) || null;
}

function defaultStatusForStageInMap(map, stage) {
  return map[stage]?.[0] || null;
}

function invalidCombinationMessageInMap(map, stage, status) {
  if (!isValidStageInMap(map, stage)) {
    return `Invalid lifecycle stage '${stage}'. Expected one of: ${Object.keys(map).join(", ")}`;
  }
  return `Invalid status '${status}' for lifecycle stage '${stage}'. Expected one of: ${(map[stage] || []).join(", ")}`;
}

module.exports = {
  defaultStages,
  getOrCreateSettings,
  getStageMap,
  isValidStageInMap,
  isValidCombinationInMap,
  stageForStatusInMap,
  defaultStatusForStageInMap,
  invalidCombinationMessageInMap,
};
