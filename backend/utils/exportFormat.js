// Shared cell formatting for the "export selected" CSV endpoints (Companies,
// Contacts, Deals, Vendors, Items). Mirrors frontend/src/utils/clientExport.js
// so a value reads the same whether it came from the bulk export or the
// page-level Excel/PDF export: lists as "a, b", dates as DD/MM/YYYY, never raw
// JSON or ISO timestamps.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T|$)/;

function formatExportDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
}

// `entry` is one { key, value, type } element of a record's additionalFields.
function formatCustomFieldValue(entry) {
  const value = entry ? entry.value : undefined;
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if ((entry && entry.type === "date") || (typeof value === "string" && ISO_DATE.test(value))) {
    return formatExportDate(value) || String(value);
  }
  return value;
}

module.exports = { formatExportDate, formatCustomFieldValue };
