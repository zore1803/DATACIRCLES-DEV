import { exportToCSV } from "./exportToCSV";

// Fields every record carries that are Mongo/app internals, never something
// a person restoring from a backup CSV would want as a column.
const ALWAYS_DROP = new Set(["__v", "organization", "starredBy", "permissions", "password"]);

const titleCase = (key) =>
  key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());

const csvEscape = (v) => `"${String(v).replace(/"/g, '""')}"`;

// Bulk-delete's "keep a copy" export needs every field a record has — not
// just the columns a table happens to show — including custom fields and
// anything hidden from the current view. additionalFields (Company/Contact/
// Deal/Vendor's custom-field array) is [{key, value, ...}], not a plain
// object, so it's spread into its own named columns rather than dumped as
// JSON. Populated refs (createdBy, owner, ...) are reduced to their name/
// email so the sheet reads as text, not "[object Object]".
function flattenRecord(record) {
  const flat = {};

  for (const [key, value] of Object.entries(record)) {
    if (ALWAYS_DROP.has(key) || key === "_id") continue;

    if (
      Array.isArray(value) &&
      value.length > 0 &&
      value.every((item) => item && typeof item === "object" && "key" in item && "value" in item)
    ) {
      // additionalFields-shaped array: one column per custom field.
      value.forEach((entry) => {
        const label = entry.key ? `Custom: ${entry.key}` : null;
        if (label) flat[label] = entry.value ?? "";
      });
      continue;
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (typeof value.name === "string") {
        flat[titleCase(key)] = value.name;
        continue;
      }
      if (typeof value.email === "string") {
        flat[titleCase(key)] = value.email;
        continue;
      }
      // Plain nested object (address, socialMedia, etc.) — flatten one
      // level so it doesn't collapse to "[object Object]".
      for (const [subKey, subValue] of Object.entries(value)) {
        if (subValue === null || subValue === undefined || subValue === "") continue;
        flat[`${titleCase(key)}: ${titleCase(subKey)}`] =
          typeof subValue === "object" ? JSON.stringify(subValue) : subValue;
      }
      continue;
    }

    if (Array.isArray(value)) {
      flat[titleCase(key)] = value.length ? JSON.stringify(value) : "";
      continue;
    }

    flat[titleCase(key)] = value ?? "";
  }

  return flat;
}

// `records`: the full objects (not just IDs) for whatever the user selected.
export function exportRecordsToCSV(records, filenamePrefix) {
  if (!records || !records.length) return;

  const flattened = records.map(flattenRecord);
  // Column set is the union across all records — one record having a custom
  // field another lacks shouldn't drop that column, it should just leave
  // other rows blank in it.
  const allKeys = [];
  const seen = new Set();
  flattened.forEach((row) => {
    Object.keys(row).forEach((k) => {
      if (!seen.has(k)) {
        seen.add(k);
        allKeys.push(k);
      }
    });
  });

  const headerRow = allKeys.map(csvEscape).join(",");
  const dataRows = flattened.map((row) =>
    allKeys.map((k) => csvEscape(row[k] ?? "")).join(","),
  );

  exportToCSV(
    [headerRow, ...dataRows],
    `${filenamePrefix}_backup_${new Date().toISOString().split("T")[0]}.csv`,
  );
}
