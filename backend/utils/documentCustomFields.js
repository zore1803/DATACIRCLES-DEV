// Custom fields an organization defines in Document Settings and fills in per
// document. Definitions live on DocumentSettings.customFields; each document keeps
// its own copy of {label, value} so renaming or deleting a field later never
// rewrites documents that were already issued.

const MAX_FIELDS = 20;
const FIELD_TYPES = ["text", "number", "date", "dropdown"];
const DOC_TYPES = ["tax", "performa", "quotation", "deliveryChallan"];

const clip = (v, n) => String(v ?? "").trim().slice(0, n);

// Field definitions, as saved from Document Settings.
function sanitizeFieldDefinitions(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of input) {
    const label = clip(raw?.label, 60);
    if (!label) continue;
    const id = clip(raw?.id, 40) || `cf_${Math.random().toString(36).slice(2, 10)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const type = FIELD_TYPES.includes(raw?.type) ? raw.type : "text";
    const docTypes = Array.isArray(raw?.docTypes) ? raw.docTypes.filter((d) => DOC_TYPES.includes(d)) : [];
    out.push({
      id,
      label,
      type,
      options: type === "dropdown" ? [...new Set((raw?.options || []).map((o) => clip(o, 80)).filter(Boolean))].slice(0, 30) : [],
      // Empty means "every document type".
      docTypes: docTypes.length ? docTypes : DOC_TYPES,
      showOnDocument: raw?.showOnDocument !== false,
    });
    if (out.length >= MAX_FIELDS) break;
  }
  return out;
}

// Values stored on a document. Blank values are dropped: a field the user left
// empty shouldn't print an empty row.
function sanitizeCustomFields(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const raw of input) {
    const label = clip(raw?.label, 60);
    const value = clip(raw?.value, 500);
    if (!label || !value) continue;
    out.push({
      id: clip(raw?.id, 40),
      label,
      value,
      showOnDocument: raw?.showOnDocument !== false,
    });
    if (out.length >= MAX_FIELDS) break;
  }
  return out;
}

module.exports = { sanitizeFieldDefinitions, sanitizeCustomFields, FIELD_TYPES, DOC_TYPES };
