import { autoTable } from "jspdf-autotable";
import toast from "react-hot-toast";

export function formatINR(value) {
  const n = Number(value);
  if (value == null || isNaN(n)) return "—";
  return `Rs.${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// One date format for every export (DD/MM/YYYY, en-IN) so the same date never
// reads differently depending on which page it was exported from — and never
// depends on the browser's own locale.
export function formatExportDate(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-IN");
}

export function formatExportDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-IN");
}

// One confirm prompt for every export menu.
export function confirmExport(format) {
  return window.confirm(`Do you want to export as ${format === "excel" ? "Excel" : "PDF"}?`);
}

// Client-side Excel/PDF export — same approach as Deals.jsx's ExcelExporter/
// PDFExporter (window.XLSX / window.jspdf loaded from CDN on first use, no
// backend round trip), generalized so Deals, Purchase, Purchase Order and
// Products/Services can share one implementation instead of copies.
//
// `columns`: [{ label: string, value: (row) => string|number }]
// `rows`: the already-filtered/visible records to export — same "export what
// you're currently looking at" behavior as Deals.jsx, no row selection
// required.

// --- Custom fields -------------------------------------------------------
// Company/Contact/Deal/Vendor/Item records keep their custom-field values in
// `additionalFields: [{ key, value, type }]`. These two helpers turn those
// into export columns so every module's Excel/PDF includes them, instead of
// each page hardcoding only its built-in columns.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T|$)/;

export function formatCustomFieldValue(entry) {
  const value = entry?.value;
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (entry?.type === "date" || (typeof value === "string" && ISO_DATE.test(value))) {
    return formatExportDate(value) || String(value);
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Returns `baseColumns` followed by one column per custom field.
 *   definedNames: the org's field definitions for this module (names), so a
 *                 field shows up even if no visible row has a value for it.
 *   Fields that only exist on the rows (e.g. a since-deleted definition) are
 *   appended too, so no stored data is silently dropped.
 *   skip: names already covered by a base column (avoids a duplicate column).
 */
export function withCustomFieldColumns(baseColumns, rows, definedNames = [], skip = []) {
  const names = [];
  const seen = new Set(skip);
  const add = (name) => {
    if (name && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  };
  definedNames.forEach((n) => add(typeof n === "object" ? n?.name : n));
  (rows || []).forEach((row) => (row.additionalFields || []).forEach((f) => add(f.key)));

  // Excel/CSV headers are object keys — a custom field named like a built-in
  // column ("Status", "Amount") would silently overwrite it.
  const taken = new Set(baseColumns.map((c) => c.label));
  const customColumns = names.map((name) => ({
    label: taken.has(name) ? `${name} (Custom)` : name,
    value: (row) => formatCustomFieldValue((row.additionalFields || []).find((f) => f.key === name)),
  }));
  return [...baseColumns, ...customColumns];
}

// -------------------------------------------------------------------------

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function rowsToSheetData(rows, columns) {
  return rows.map((row) => {
    const obj = {};
    columns.forEach((col) => {
      obj[col.label] = col.value(row) ?? "";
    });
    return obj;
  });
}

async function exportToExcel({ rows, columns, fileNamePrefix }) {
  if (!window.XLSX) {
    await loadScript(
      "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
    );
  }
  const data = rowsToSheetData(rows, columns);
  const ws = window.XLSX.utils.json_to_sheet(data);
  const csv = window.XLSX.utils.sheet_to_csv(ws, {
    FS: ",",
    RS: "\n",
    forceQuotes: true,
    blankrows: false,
  });
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  downloadBlob(
    blob,
    `${fileNamePrefix}_${new Date().toISOString().split("T")[0]}.csv`,
  );
}

// More columns than a portrait A4 can hold legibly (e.g. a Deal with many
// custom fields): go landscape, step the font down, and past 12 columns use A3.
function pdfLayout(columnCount) {
  if (columnCount <= 7) return { orientation: "portrait", format: "a4", fontSize: columnCount <= 6 ? 9 : 8 };
  if (columnCount <= 12) return { orientation: "landscape", format: "a4", fontSize: columnCount <= 9 ? 8 : 7 };
  return { orientation: "landscape", format: "a3", fontSize: columnCount <= 18 ? 7 : 6 };
}

// Draws a table into a PDF and downloads it. `head` is one row of header
// labels, `body` an array of rows (already stringified). Shared by the
// page-level export (exportClientSide) and the bulk "Export selected" dialog,
// so both produce an identical PDF.
export async function downloadTablePDF({ head, body, fileNamePrefix, title }) {
  if (!window.jspdf) {
    await loadScript(
      "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
    );
  }
  const { jsPDF } = window.jspdf;
  const layout = pdfLayout(head.length);
  const doc = new jsPDF({ orientation: layout.orientation, format: layout.format });

  doc.setFontSize(18);
  doc.text(title, 14, 20);

  autoTable(doc, {
    head: [head],
    body: body.map((row) =>
      row.map((v) => (v === null || v === undefined || v === "" ? "—" : String(v))),
    ),
    startY: 30,
    styles: { fontSize: layout.fontSize, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: [52, 144, 220], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    margin: { top: 30 },
  });

  doc.save(`${fileNamePrefix}_${new Date().toISOString().split("T")[0]}.pdf`);
}

async function exportToPDF({ rows, columns, fileNamePrefix, title }) {
  await downloadTablePDF({
    head: ["#", ...columns.map((c) => c.label)],
    body: rows.map((row, index) => [index + 1, ...columns.map((c) => c.value(row))]),
    fileNamePrefix,
    title,
  });
}

// Minimal RFC-4180 CSV parser (quoted fields, "" escapes, newlines inside
// quotes). The bulk-export endpoints return CSV text; the PDF option parses it
// back into a table instead of needing a second backend format.
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  // Drop a leading UTF-8 BOM (the Excel export adds one).
  const src = String(text || "").replace(/^\ufeff/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export async function exportClientSide(format, { rows, columns, fileNamePrefix, title }) {
  // Same message on every page — previously only E-Invoicing checked this and
  // the rest downloaded an empty file.
  if (!rows || rows.length === 0) {
    toast.error("Nothing to export — the current view is empty.");
    return;
  }
  try {
    if (format === "excel") {
      await exportToExcel({ rows, columns, fileNamePrefix });
    } else if (format === "pdf") {
      await exportToPDF({ rows, columns, fileNamePrefix, title });
    }
  } catch (err) {
    console.error("Export failed:", err);
    toast.error("Export failed. Please check your connection and try again.");
  }
}
