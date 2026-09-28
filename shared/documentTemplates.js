/*
 * documentTemplates.js â€” Template Registry
 *
 * Single source of truth for invoice/document rendering.
 *
 * Both sides render from this module:
 *   - Frontend live preview (InvoiceLivePreview.jsx) via dangerouslySetInnerHTML
 *   - Backend PDF (utils/htmlDocumentPdf.js) via headless Chrome
 *
 * â”€â”€ How to add a new template â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *
 *   1. Create  shared/templates/MyTemplate.js  exporting:
 *        export const blurb = "Short description shown in the template picker.";
 *        export const css   = `...your scoped CSS...`;
 *        export function html(ctx) { return `...your HTML...`; }
 *
 *   2. Import it here (one line) and add it to REGISTRY (one line).
 *
 *   That's it. The template picker, backend enums and blurb text all derive
 *   from REGISTRY automatically â€” no other files need touching.
 *
 * â”€â”€ Template context object â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *
 *   ctx = {
 *     // Computed document figures (from computeDocument)
 *     t,               // { isTax, isInterState, rows, grossTaxable, totalCGST,
 *                      //   totalSGST, totalIGST, grandTotal, amountInWords,
 *                      //   totalQty, rows, hsnRows, documentDiscount, ... }
 *     // Raw document (Mongo doc or live form state)
 *     doc,
 *     // Organisation and bank details
 *     org, bank,
 *     // Helpers
 *     esc, fmt, formatDate, formatPostalAddress,
 *     // Resolved values
 *     dealName, docLabel, docNumber, copySubtitle,
 *     notes, terms,
 *     // Pre-built HTML snippets
 *     discountRow,     // "" when no discount
 *     hsnRows,         // HSN/SAC table body rows HTML
 *     itemRows,        // Items table body rows HTML (standard columns)
 *     qrBlock,         // UPI QR code block HTML or ""
 *     upiId,           // UPI VPA string or ""
 *   }
 */

// â”€â”€ Template imports â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import * as Classic from "./templates/Classic.js";
import * as Modern from "./templates/Modern.js";
import * as Minimal from "./templates/Minimal.js";
import * as Elegant from "./templates/Elegant.js";
import * as Compact from "./templates/Compact.js";
import * as Corporate from "./templates/Corporate.js";
import * as Vibrant from "./templates/Vibrant.js";
import * as Mono from "./templates/Mono.js";
import * as Vintage from "./templates/Vintage.js";
import * as Professional from "./templates/Professional.js";
import * as Landscape from "./templates/Landscape.js";
import * as Service from "./templates/Service.js";
import * as Detailed from "./templates/Detailed.js";
// Not part of REGISTRY / the Change Template picker — a Delivery Challan
// always uses this one dedicated, non-priced layout (see buildDocumentHtml).
import * as DeliveryChallanPlain from "./templates/DeliveryChallanPlain.js";

// â”€â”€ Registry â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//   Key order here determines the order in the template picker.
export const REGISTRY = {
  Classic,
  Modern,
  Minimal,
  Elegant,
  Compact,
  Corporate,
  Vibrant,
  Mono,
  Vintage,
  Professional,
  Landscape,
  Service,
  Detailed,
};

export const DOCUMENT_TEMPLATES = Object.keys(REGISTRY);
export const DEFAULT_TEMPLATE = "Classic";

// â”€â”€ Internal lookup maps â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const NUMBER_KEY = {
  tax: "invoiceNumber",
  performa: "performaInvoiceNumber",
  quotation: "quotationNumber",
  deliveryChallan: "deliveryChallanNumber",
  salesReturn: "returnNumber",
};

const DOC_LABEL = {
  tax: "Invoice",
  performa: "Pro Forma Invoice",
  quotation: "Quotation",
  deliveryChallan: "Delivery Challan",
  salesReturn: "Sales Return",
};

/* ------------------------------------------------------------------ utils */

function esc(str) {
  return String(str ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]
  );
}

// Notes/Terms support a small markdown-lite subset — **bold**, *italic*,
// "- " bullet lines and "1. " numbered lines — entered via the toolbar in
// NotesTermsDrawer.jsx. Every template used to call esc(notes)/esc(terms)
// directly and rely on `white-space:pre-line` for line breaks, which is
// why this lives centrally here instead of being reimplemented per
// template: every line is escaped FIRST (so literal "<b>" a user types
// renders as text, not a tag) and only afterwards do the markdown-lite
// patterns introduce real <b>/<i>/<ul>/<ol> tags — templates now receive
// already-safe HTML in `notes`/`terms` and no longer call esc() on them.
function formatRichText(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return "";

  const inline = (line) =>
    esc(line)
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<i>$2</i>");

  const lines = text.split(/\r\n|\r|\n/);
  const out = [];
  let listType = null;

  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  lines.forEach((line, i) => {
    const bullet = line.match(/^\s*-\s+(.+)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);

    if (bullet) {
      if (listType !== "ul") {
        closeList();
        out.push("<ul>");
        listType = "ul";
      }
      out.push(`<li>${inline(bullet[1])}</li>`);
    } else if (numbered) {
      if (listType !== "ol") {
        closeList();
        out.push("<ol>");
        listType = "ol";
      }
      out.push(`<li>${inline(numbered[1])}</li>`);
    } else {
      closeList();
      out.push(i === 0 ? inline(line) : `<br>${inline(line)}`);
    }
  });
  closeList();
  return out.join("");
}

const fmt = (n) =>
  (Number(n) || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function formatDate(d) {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date)) return "";
  const day = String(date.getDate()).padStart(2, "0");
  const month = date.toLocaleString("default", { month: "short" });
  return `${day} ${month} ${date.getFullYear()}`;
}

/* Renders a postalAddressSchema-shaped object as multi-line text. */
function formatPostalAddress(addr) {
  if (!addr) return "";
  const cityStatePin = [addr.city, addr.state, addr.pincode]
    .filter((v) => v && String(v).trim())
    .join(", ");
  return [addr.addressLine1, addr.addressLine2, cityStatePin, addr.country]
    .filter((v) => v && String(v).trim())
    .join("\n");
}

/* Indian-numbering words. */
export function numberToWords(num) {
  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
  ];
  const tens = [
    "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy",
    "Eighty", "Ninety",
  ];

  function toWords(n) {
    if (n === 0) return "";
    if (n < 20) return ones[n];
    if (n < 100)
      return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    if (n < 1000)
      return (
        ones[Math.floor(n / 100)] +
        " Hundred" +
        (n % 100 ? " " + toWords(n % 100) : "")
      );
    let result = "";
    if (n >= 10000000) { result += toWords(Math.floor(n / 10000000)) + " Crore "; n %= 10000000; }
    if (n >= 100000) { result += toWords(Math.floor(n / 100000)) + " Lakh "; n %= 100000; }
    if (n >= 1000) { result += toWords(Math.floor(n / 1000)) + " Thousand "; n %= 1000; }
    if (n > 0) result += toWords(n);
    return result.trim();
  }

  if (!num) return "Zero Rupees Only";
  const integerPart = Math.floor(num);
  const decimalPart = Math.round((num - integerPart) * 100);
  let words = toWords(integerPart) + " Rupees";
  if (decimalPart > 0) words += " and " + toWords(decimalPart) + " Paise";
  return words + " Only";
}

/* ------------------------------------------------------------ computation */

export const GST_RATES = [0, 5, 12, 18, 28, 40];
export const DEFAULT_UPI_ID = "rzore430@oksbi";

export function splitGst(taxableAmount, gstRate, transactionType = "intra") {
  const rate = Number(gstRate) || 0;
  const amount = Number(taxableAmount) || 0;
  const isInterState = transactionType === "inter";
  const halfRate = rate / 2;
  return {
    isInterState,
    cgstRate: isInterState ? 0 : halfRate,
    sgstRate: isInterState ? 0 : halfRate,
    igstRate: isInterState ? rate : 0,
    cgst: isInterState ? 0 : (amount * halfRate) / 100,
    sgst: isInterState ? 0 : (amount * halfRate) / 100,
    igst: isInterState ? (amount * rate) / 100 : 0,
  };
}

export function computeDocument(doc, type = "tax") {
  // Tax is purely line-item-driven: each item carries its own gstRate, and
  // splitGst() naturally produces zero tax for a 0% item. There is no more
  // document-level GST on/off flag.
  const transactionType = doc.transactionType === "inter" ? "inter" : "intra";

  const baseRows = (doc.items || []).map((it) => {
    const rate = parseFloat(it.rate) || 0;
    const qty = parseFloat(it.quantity) || 0;
    // The line's own rate, and nothing else: 0% stays 0%, and a line with no
    // usable rate is untaxed rather than silently charged a default 18%.
    const gstRate = GST_RATES.includes(Number(it.gstRate)) ? Number(it.gstRate) : 0;
    const unitTaxable = it.taxInclusive ? rate / (1 + gstRate / 100) : rate;
    const sub = unitTaxable * qty;
    const disc = it.discountType === "percentage"
      ? (sub * (parseFloat(it.discount) || 0)) / 100
      : parseFloat(it.discount) || 0;
    return {
      name: it.name || it.itemId?.name || "",
      description: it.description || "",
      hsn: it.hsn || "",
      // Not on the DeliveryChallan item schema itself. While drafting, the
      // frontend attaches it from the selected product (it.primaryUnit).
      // Once saved, deliveryChallanController's PDF/email routes populate
      // items.itemId, so it.itemId.primaryUnit carries it instead. Unused by
      // every other doc type.
      unit: it.primaryUnit || it.unit || it.itemId?.primaryUnit || "",
      rate,
      qty,
      gstRate,
      taxable: sub - disc,
      discountAmount: disc,
      discountPct: it.discountType === "percentage"
        ? parseFloat(it.discount) || 0
        : (sub > 0 ? (disc / sub) * 100 : 0),
    };
  });

  const grossTaxable = baseRows.reduce((s, r) => s + r.taxable, 0);
  const docDiscount = doc.discount || {};
  const discountValue = parseFloat(docDiscount.value) || 0;
  const documentDiscount = discountValue > 0
    ? docDiscount.type === "percentage"
      ? (grossTaxable * discountValue) / 100
      : Math.min(discountValue, grossTaxable)
    : 0;
  const netFactor = grossTaxable > 0 ? (grossTaxable - documentDiscount) / grossTaxable : 1;

  const rows = baseRows.map((r) => {
    const taxable = r.taxable * netFactor;
    const gst = splitGst(taxable, r.gstRate, transactionType);
    const tax = gst.cgst + gst.sgst + gst.igst;
    return { ...r, taxable, ...gst, tax, amount: taxable + tax };
  });

  const isTax = rows.some((r) => r.tax > 0);

  const hsnMap = {};
  rows.forEach((r) => {
    const key = (r.hsn || "N/A") + "_" + r.gstRate;
    if (!hsnMap[key])
      hsnMap[key] = { taxable: 0, cgst: 0, sgst: 0, igst: 0, hsn: r.hsn, rate: r.gstRate };
    hsnMap[key].taxable += r.taxable;
    hsnMap[key].cgst += r.cgst;
    hsnMap[key].sgst += r.sgst;
    hsnMap[key].igst += r.igst;
  });

  const grandTotal = rows.reduce((s, r) => s + r.amount, 0);

  // Payments recorded against this document. Same `payments[]` array every
  // Paid/Pending figure in the app reads, so a partially-paid invoice prints
  // the same balance the Accounting list and the allocation screens show.
  // Balance is measured against the printed grand total, not the stored
  // `amount`, so the document can never contradict its own arithmetic.
  const amountPaid = (doc?.payments || []).reduce(
    (sum, p) => sum + (Number(p.amount) || 0),
    0
  );
  const balanceDue = Math.max(0, grandTotal - amountPaid);
  // A paisa of tolerance, matching the rest of the money comparisons.
  const isFullyPaid = amountPaid > 0 && balanceDue <= 0.01;
  const isPartiallyPaid = amountPaid > 0.01 && balanceDue > 0.01;

  return {
    amountPaid,
    balanceDue,
    isFullyPaid,
    isPartiallyPaid,
    isTax,
    transactionType,
    isInterState: transactionType === "inter",
    rows,
    grossTaxable,
    documentDiscount,
    discountValue,
    discountType: docDiscount.type,
    totalQty: rows.reduce((s, r) => s + r.qty, 0),
    totalTaxable: rows.reduce((s, r) => s + r.taxable, 0),
    totalCGST: rows.reduce((s, r) => s + r.cgst, 0),
    totalSGST: rows.reduce((s, r) => s + r.sgst, 0),
    totalIGST: rows.reduce((s, r) => s + r.igst, 0),
    grandTotal,
    hsnRows: Object.keys(hsnMap).map((k) => hsnMap[k]),
    amountInWords: numberToWords(grandTotal),
  };
}

/*
 * Preview-only "scan to pay" QR — a real QR code encoding a sample UPI payment
 * URL, generated via qrcode-generator. Shown ONLY in template picker thumbnails
 * (isPreview:true); real documents use the actual UPI QR or nothing at all.
 *
 * To regenerate: node -e "const q=require('qrcode-generator')(0,'M');
 *   q.addData('upi://pay?pa=sample@oksbi&pn=DataCircles&am=1000.00&cu=INR');
 *   q.make(); console.log(q.createSvgTag(4,0));"
 */
export const DUMMY_QR_SVG = `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 148 148" preserveAspectRatio="xMinYMin meet" role="img" aria-label="Scan to pay (preview only)"><rect width="100%" height="100%" fill="white" cx="0" cy="0"/><path d="M0,0l4,0 0,4 -4,0 0,-4z M4,0l4,0 0,4 -4,0 0,-4z M8,0l4,0 0,4 -4,0 0,-4z M12,0l4,0 0,4 -4,0 0,-4z M16,0l4,0 0,4 -4,0 0,-4z M20,0l4,0 0,4 -4,0 0,-4z M24,0l4,0 0,4 -4,0 0,-4z M36,0l4,0 0,4 -4,0 0,-4z M40,0l4,0 0,4 -4,0 0,-4z M48,0l4,0 0,4 -4,0 0,-4z M52,0l4,0 0,4 -4,0 0,-4z M56,0l4,0 0,4 -4,0 0,-4z M60,0l4,0 0,4 -4,0 0,-4z M76,0l4,0 0,4 -4,0 0,-4z M80,0l4,0 0,4 -4,0 0,-4z M84,0l4,0 0,4 -4,0 0,-4z M88,0l4,0 0,4 -4,0 0,-4z M92,0l4,0 0,4 -4,0 0,-4z M100,0l4,0 0,4 -4,0 0,-4z M104,0l4,0 0,4 -4,0 0,-4z M108,0l4,0 0,4 -4,0 0,-4z M112,0l4,0 0,4 -4,0 0,-4z M120,0l4,0 0,4 -4,0 0,-4z M124,0l4,0 0,4 -4,0 0,-4z M128,0l4,0 0,4 -4,0 0,-4z M132,0l4,0 0,4 -4,0 0,-4z M136,0l4,0 0,4 -4,0 0,-4z M140,0l4,0 0,4 -4,0 0,-4z M144,0l4,0 0,4 -4,0 0,-4z M0,4l4,0 0,4 -4,0 0,-4z M24,4l4,0 0,4 -4,0 0,-4z M32,4l4,0 0,4 -4,0 0,-4z M44,4l4,0 0,4 -4,0 0,-4z M52,4l4,0 0,4 -4,0 0,-4z M56,4l4,0 0,4 -4,0 0,-4z M60,4l4,0 0,4 -4,0 0,-4z M76,4l4,0 0,4 -4,0 0,-4z M84,4l4,0 0,4 -4,0 0,-4z M92,4l4,0 0,4 -4,0 0,-4z M96,4l4,0 0,4 -4,0 0,-4z M100,4l4,0 0,4 -4,0 0,-4z M104,4l4,0 0,4 -4,0 0,-4z M108,4l4,0 0,4 -4,0 0,-4z M120,4l4,0 0,4 -4,0 0,-4z M144,4l4,0 0,4 -4,0 0,-4z M0,8l4,0 0,4 -4,0 0,-4z M8,8l4,0 0,4 -4,0 0,-4z M12,8l4,0 0,4 -4,0 0,-4z M16,8l4,0 0,4 -4,0 0,-4z M24,8l4,0 0,4 -4,0 0,-4z M40,8l4,0 0,4 -4,0 0,-4z M64,8l4,0 0,4 -4,0 0,-4z M80,8l4,0 0,4 -4,0 0,-4z M96,8l4,0 0,4 -4,0 0,-4z M108,8l4,0 0,4 -4,0 0,-4z M112,8l4,0 0,4 -4,0 0,-4z M120,8l4,0 0,4 -4,0 0,-4z M128,8l4,0 0,4 -4,0 0,-4z M132,8l4,0 0,4 -4,0 0,-4z M136,8l4,0 0,4 -4,0 0,-4z M144,8l4,0 0,4 -4,0 0,-4z M0,12l4,0 0,4 -4,0 0,-4z M8,12l4,0 0,4 -4,0 0,-4z M12,12l4,0 0,4 -4,0 0,-4z M16,12l4,0 0,4 -4,0 0,-4z M24,12l4,0 0,4 -4,0 0,-4z M40,12l4,0 0,4 -4,0 0,-4z M48,12l4,0 0,4 -4,0 0,-4z M60,12l4,0 0,4 -4,0 0,-4z M72,12l4,0 0,4 -4,0 0,-4z M76,12l4,0 0,4 -4,0 0,-4z M104,12l4,0 0,4 -4,0 0,-4z M108,12l4,0 0,4 -4,0 0,-4z M120,12l4,0 0,4 -4,0 0,-4z M128,12l4,0 0,4 -4,0 0,-4z M132,12l4,0 0,4 -4,0 0,-4z M136,12l4,0 0,4 -4,0 0,-4z M144,12l4,0 0,4 -4,0 0,-4z M0,16l4,0 0,4 -4,0 0,-4z M8,16l4,0 0,4 -4,0 0,-4z M12,16l4,0 0,4 -4,0 0,-4z M16,16l4,0 0,4 -4,0 0,-4z M24,16l4,0 0,4 -4,0 0,-4z M32,16l4,0 0,4 -4,0 0,-4z M40,16l4,0 0,4 -4,0 0,-4z M48,16l4,0 0,4 -4,0 0,-4z M52,16l4,0 0,4 -4,0 0,-4z M56,16l4,0 0,4 -4,0 0,-4z M60,16l4,0 0,4 -4,0 0,-4z M72,16l4,0 0,4 -4,0 0,-4z M88,16l4,0 0,4 -4,0 0,-4z M92,16l4,0 0,4 -4,0 0,-4z M108,16l4,0 0,4 -4,0 0,-4z M120,16l4,0 0,4 -4,0 0,-4z M128,16l4,0 0,4 -4,0 0,-4z M132,16l4,0 0,4 -4,0 0,-4z M136,16l4,0 0,4 -4,0 0,-4z M144,16l4,0 0,4 -4,0 0,-4z M0,20l4,0 0,4 -4,0 0,-4z M24,20l4,0 0,4 -4,0 0,-4z M36,20l4,0 0,4 -4,0 0,-4z M44,20l4,0 0,4 -4,0 0,-4z M48,20l4,0 0,4 -4,0 0,-4z M52,20l4,0 0,4 -4,0 0,-4z M60,20l4,0 0,4 -4,0 0,-4z M68,20l4,0 0,4 -4,0 0,-4z M76,20l4,0 0,4 -4,0 0,-4z M80,20l4,0 0,4 -4,0 0,-4z M92,20l4,0 0,4 -4,0 0,-4z M104,20l4,0 0,4 -4,0 0,-4z M108,20l4,0 0,4 -4,0 0,-4z M112,20l4,0 0,4 -4,0 0,-4z M120,20l4,0 0,4 -4,0 0,-4z M144,20l4,0 0,4 -4,0 0,-4z M0,24l4,0 0,4 -4,0 0,-4z M4,24l4,0 0,4 -4,0 0,-4z M8,24l4,0 0,4 -4,0 0,-4z M12,24l4,0 0,4 -4,0 0,-4z M16,24l4,0 0,4 -4,0 0,-4z M20,24l4,0 0,4 -4,0 0,-4z M24,24l4,0 0,4 -4,0 0,-4z M32,24l4,0 0,4 -4,0 0,-4z M40,24l4,0 0,4 -4,0 0,-4z M48,24l4,0 0,4 -4,0 0,-4z M56,24l4,0 0,4 -4,0 0,-4z M64,24l4,0 0,4 -4,0 0,-4z M72,24l4,0 0,4 -4,0 0,-4z M80,24l4,0 0,4 -4,0 0,-4z M88,24l4,0 0,4 -4,0 0,-4z M96,24l4,0 0,4 -4,0 0,-4z M104,24l4,0 0,4 -4,0 0,-4z M112,24l4,0 0,4 -4,0 0,-4z M120,24l4,0 0,4 -4,0 0,-4z M124,24l4,0 0,4 -4,0 0,-4z M128,24l4,0 0,4 -4,0 0,-4z M132,24l4,0 0,4 -4,0 0,-4z M136,24l4,0 0,4 -4,0 0,-4z M140,24l4,0 0,4 -4,0 0,-4z M144,24l4,0 0,4 -4,0 0,-4z M40,28l4,0 0,4 -4,0 0,-4z M44,28l4,0 0,4 -4,0 0,-4z M56,28l4,0 0,4 -4,0 0,-4z M68,28l4,0 0,4 -4,0 0,-4z M72,28l4,0 0,4 -4,0 0,-4z M76,28l4,0 0,4 -4,0 0,-4z M84,28l4,0 0,4 -4,0 0,-4z M88,28l4,0 0,4 -4,0 0,-4z M100,28l4,0 0,4 -4,0 0,-4z M108,28l4,0 0,4 -4,0 0,-4z M0,32l4,0 0,4 -4,0 0,-4z M8,32l4,0 0,4 -4,0 0,-4z M16,32l4,0 0,4 -4,0 0,-4z M24,32l4,0 0,4 -4,0 0,-4z M40,32l4,0 0,4 -4,0 0,-4z M48,32l4,0 0,4 -4,0 0,-4z M52,32l4,0 0,4 -4,0 0,-4z M64,32l4,0 0,4 -4,0 0,-4z M72,32l4,0 0,4 -4,0 0,-4z M84,32l4,0 0,4 -4,0 0,-4z M96,32l4,0 0,4 -4,0 0,-4z M100,32l4,0 0,4 -4,0 0,-4z M128,32l4,0 0,4 -4,0 0,-4z M140,32l4,0 0,4 -4,0 0,-4z M0,36l4,0 0,4 -4,0 0,-4z M28,36l4,0 0,4 -4,0 0,-4z M36,36l4,0 0,4 -4,0 0,-4z M40,36l4,0 0,4 -4,0 0,-4z M52,36l4,0 0,4 -4,0 0,-4z M60,36l4,0 0,4 -4,0 0,-4z M64,36l4,0 0,4 -4,0 0,-4z M84,36l4,0 0,4 -4,0 0,-4z M96,36l4,0 0,4 -4,0 0,-4z M100,36l4,0 0,4 -4,0 0,-4z M104,36l4,0 0,4 -4,0 0,-4z M108,36l4,0 0,4 -4,0 0,-4z M112,36l4,0 0,4 -4,0 0,-4z M116,36l4,0 0,4 -4,0 0,-4z M120,36l4,0 0,4 -4,0 0,-4z M124,36l4,0 0,4 -4,0 0,-4z M132,36l4,0 0,4 -4,0 0,-4z M140,36l4,0 0,4 -4,0 0,-4z M144,36l4,0 0,4 -4,0 0,-4z M0,40l4,0 0,4 -4,0 0,-4z M4,40l4,0 0,4 -4,0 0,-4z M8,40l4,0 0,4 -4,0 0,-4z M12,40l4,0 0,4 -4,0 0,-4z M16,40l4,0 0,4 -4,0 0,-4z M20,40l4,0 0,4 -4,0 0,-4z M24,40l4,0 0,4 -4,0 0,-4z M32,40l4,0 0,4 -4,0 0,-4z M36,40l4,0 0,4 -4,0 0,-4z M52,40l4,0 0,4 -4,0 0,-4z M60,40l4,0 0,4 -4,0 0,-4z M64,40l4,0 0,4 -4,0 0,-4z M72,40l4,0 0,4 -4,0 0,-4z M80,40l4,0 0,4 -4,0 0,-4z M84,40l4,0 0,4 -4,0 0,-4z M104,40l4,0 0,4 -4,0 0,-4z M112,40l4,0 0,4 -4,0 0,-4z M128,40l4,0 0,4 -4,0 0,-4z M132,40l4,0 0,4 -4,0 0,-4z M136,40l4,0 0,4 -4,0 0,-4z M140,40l4,0 0,4 -4,0 0,-4z M144,40l4,0 0,4 -4,0 0,-4z M0,44l4,0 0,4 -4,0 0,-4z M12,44l4,0 0,4 -4,0 0,-4z M20,44l4,0 0,4 -4,0 0,-4z M32,44l4,0 0,4 -4,0 0,-4z M40,44l4,0 0,4 -4,0 0,-4z M44,44l4,0 0,4 -4,0 0,-4z M48,44l4,0 0,4 -4,0 0,-4z M52,44l4,0 0,4 -4,0 0,-4z M56,44l4,0 0,4 -4,0 0,-4z M64,44l4,0 0,4 -4,0 0,-4z M68,44l4,0 0,4 -4,0 0,-4z M72,44l4,0 0,4 -4,0 0,-4z M76,44l4,0 0,4 -4,0 0,-4z M84,44l4,0 0,4 -4,0 0,-4z M96,44l4,0 0,4 -4,0 0,-4z M100,44l4,0 0,4 -4,0 0,-4z M112,44l4,0 0,4 -4,0 0,-4z M124,44l4,0 0,4 -4,0 0,-4z M132,44l4,0 0,4 -4,0 0,-4z M140,44l4,0 0,4 -4,0 0,-4z M4,48l4,0 0,4 -4,0 0,-4z M8,48l4,0 0,4 -4,0 0,-4z M16,48l4,0 0,4 -4,0 0,-4z M20,48l4,0 0,4 -4,0 0,-4z M24,48l4,0 0,4 -4,0 0,-4z M28,48l4,0 0,4 -4,0 0,-4z M32,48l4,0 0,4 -4,0 0,-4z M40,48l4,0 0,4 -4,0 0,-4z M56,48l4,0 0,4 -4,0 0,-4z M60,48l4,0 0,4 -4,0 0,-4z M64,48l4,0 0,4 -4,0 0,-4z M68,48l4,0 0,4 -4,0 0,-4z M80,48l4,0 0,4 -4,0 0,-4z M84,48l4,0 0,4 -4,0 0,-4z M92,48l4,0 0,4 -4,0 0,-4z M96,48l4,0 0,4 -4,0 0,-4z M100,48l4,0 0,4 -4,0 0,-4z M108,48l4,0 0,4 -4,0 0,-4z M112,48l4,0 0,4 -4,0 0,-4z M120,48l4,0 0,4 -4,0 0,-4z M124,48l4,0 0,4 -4,0 0,-4z M132,48l4,0 0,4 -4,0 0,-4z M144,48l4,0 0,4 -4,0 0,-4z M12,52l4,0 0,4 -4,0 0,-4z M16,52l4,0 0,4 -4,0 0,-4z M20,52l4,0 0,4 -4,0 0,-4z M36,52l4,0 0,4 -4,0 0,-4z M40,52l4,0 0,4 -4,0 0,-4z M48,52l4,0 0,4 -4,0 0,-4z M56,52l4,0 0,4 -4,0 0,-4z M64,52l4,0 0,4 -4,0 0,-4z M72,52l4,0 0,4 -4,0 0,-4z M80,52l4,0 0,4 -4,0 0,-4z M84,52l4,0 0,4 -4,0 0,-4z M88,52l4,0 0,4 -4,0 0,-4z M96,52l4,0 0,4 -4,0 0,-4z M100,52l4,0 0,4 -4,0 0,-4z M112,52l4,0 0,4 -4,0 0,-4z M120,52l4,0 0,4 -4,0 0,-4z M132,52l4,0 0,4 -4,0 0,-4z M136,52l4,0 0,4 -4,0 0,-4z M144,52l4,0 0,4 -4,0 0,-4z M4,56l4,0 0,4 -4,0 0,-4z M12,56l4,0 0,4 -4,0 0,-4z M16,56l4,0 0,4 -4,0 0,-4z M20,56l4,0 0,4 -4,0 0,-4z M24,56l4,0 0,4 -4,0 0,-4z M36,56l4,0 0,4 -4,0 0,-4z M40,56l4,0 0,4 -4,0 0,-4z M64,56l4,0 0,4 -4,0 0,-4z M68,56l4,0 0,4 -4,0 0,-4z M80,56l4,0 0,4 -4,0 0,-4z M116,56l4,0 0,4 -4,0 0,-4z M120,56l4,0 0,4 -4,0 0,-4z M124,56l4,0 0,4 -4,0 0,-4z M128,56l4,0 0,4 -4,0 0,-4z M132,56l4,0 0,4 -4,0 0,-4z M136,56l4,0 0,4 -4,0 0,-4z M144,56l4,0 0,4 -4,0 0,-4z M4,60l4,0 0,4 -4,0 0,-4z M8,60l4,0 0,4 -4,0 0,-4z M12,60l4,0 0,4 -4,0 0,-4z M16,60l4,0 0,4 -4,0 0,-4z M32,60l4,0 0,4 -4,0 0,-4z M52,60l4,0 0,4 -4,0 0,-4z M56,60l4,0 0,4 -4,0 0,-4z M64,60l4,0 0,4 -4,0 0,-4z M76,60l4,0 0,4 -4,0 0,-4z M80,60l4,0 0,4 -4,0 0,-4z M84,60l4,0 0,4 -4,0 0,-4z M88,60l4,0 0,4 -4,0 0,-4z M100,60l4,0 0,4 -4,0 0,-4z M116,60l4,0 0,4 -4,0 0,-4z M120,60l4,0 0,4 -4,0 0,-4z M124,60l4,0 0,4 -4,0 0,-4z M132,60l4,0 0,4 -4,0 0,-4z M4,64l4,0 0,4 -4,0 0,-4z M16,64l4,0 0,4 -4,0 0,-4z M24,64l4,0 0,4 -4,0 0,-4z M32,64l4,0 0,4 -4,0 0,-4z M40,64l4,0 0,4 -4,0 0,-4z M44,64l4,0 0,4 -4,0 0,-4z M48,64l4,0 0,4 -4,0 0,-4z M52,64l4,0 0,4 -4,0 0,-4z M56,64l4,0 0,4 -4,0 0,-4z M84,64l4,0 0,4 -4,0 0,-4z M88,64l4,0 0,4 -4,0 0,-4z M96,64l4,0 0,4 -4,0 0,-4z M100,64l4,0 0,4 -4,0 0,-4z M112,64l4,0 0,4 -4,0 0,-4z M116,64l4,0 0,4 -4,0 0,-4z M120,64l4,0 0,4 -4,0 0,-4z M124,64l4,0 0,4 -4,0 0,-4z M132,64l4,0 0,4 -4,0 0,-4z M140,64l4,0 0,4 -4,0 0,-4z M4,68l4,0 0,4 -4,0 0,-4z M8,68l4,0 0,4 -4,0 0,-4z M20,68l4,0 0,4 -4,0 0,-4z M36,68l4,0 0,4 -4,0 0,-4z M40,68l4,0 0,4 -4,0 0,-4z M44,68l4,0 0,4 -4,0 0,-4z M48,68l4,0 0,4 -4,0 0,-4z M56,68l4,0 0,4 -4,0 0,-4z M60,68l4,0 0,4 -4,0 0,-4z M68,68l4,0 0,4 -4,0 0,-4z M84,68l4,0 0,4 -4,0 0,-4z M96,68l4,0 0,4 -4,0 0,-4z M108,68l4,0 0,4 -4,0 0,-4z M112,68l4,0 0,4 -4,0 0,-4z M116,68l4,0 0,4 -4,0 0,-4z M120,68l4,0 0,4 -4,0 0,-4z M124,68l4,0 0,4 -4,0 0,-4z M132,68l4,0 0,4 -4,0 0,-4z M144,68l4,0 0,4 -4,0 0,-4z M4,72l4,0 0,4 -4,0 0,-4z M8,72l4,0 0,4 -4,0 0,-4z M20,72l4,0 0,4 -4,0 0,-4z M24,72l4,0 0,4 -4,0 0,-4z M40,72l4,0 0,4 -4,0 0,-4z M68,72l4,0 0,4 -4,0 0,-4z M72,72l4,0 0,4 -4,0 0,-4z M88,72l4,0 0,4 -4,0 0,-4z M96,72l4,0 0,4 -4,0 0,-4z M116,72l4,0 0,4 -4,0 0,-4z M128,72l4,0 0,4 -4,0 0,-4z M136,72l4,0 0,4 -4,0 0,-4z M140,72l4,0 0,4 -4,0 0,-4z M144,72l4,0 0,4 -4,0 0,-4z M0,76l4,0 0,4 -4,0 0,-4z M4,76l4,0 0,4 -4,0 0,-4z M12,76l4,0 0,4 -4,0 0,-4z M20,76l4,0 0,4 -4,0 0,-4z M36,76l4,0 0,4 -4,0 0,-4z M60,76l4,0 0,4 -4,0 0,-4z M68,76l4,0 0,4 -4,0 0,-4z M76,76l4,0 0,4 -4,0 0,-4z M80,76l4,0 0,4 -4,0 0,-4z M84,76l4,0 0,4 -4,0 0,-4z M96,76l4,0 0,4 -4,0 0,-4z M100,76l4,0 0,4 -4,0 0,-4z M108,76l4,0 0,4 -4,0 0,-4z M120,76l4,0 0,4 -4,0 0,-4z M124,76l4,0 0,4 -4,0 0,-4z M132,76l4,0 0,4 -4,0 0,-4z M0,80l4,0 0,4 -4,0 0,-4z M12,80l4,0 0,4 -4,0 0,-4z M20,80l4,0 0,4 -4,0 0,-4z M24,80l4,0 0,4 -4,0 0,-4z M28,80l4,0 0,4 -4,0 0,-4z M32,80l4,0 0,4 -4,0 0,-4z M36,80l4,0 0,4 -4,0 0,-4z M40,80l4,0 0,4 -4,0 0,-4z M44,80l4,0 0,4 -4,0 0,-4z M64,80l4,0 0,4 -4,0 0,-4z M68,80l4,0 0,4 -4,0 0,-4z M76,80l4,0 0,4 -4,0 0,-4z M84,80l4,0 0,4 -4,0 0,-4z M100,80l4,0 0,4 -4,0 0,-4z M108,80l4,0 0,4 -4,0 0,-4z M116,80l4,0 0,4 -4,0 0,-4z M120,80l4,0 0,4 -4,0 0,-4z M132,80l4,0 0,4 -4,0 0,-4z M140,80l4,0 0,4 -4,0 0,-4z M144,80l4,0 0,4 -4,0 0,-4z M4,84l4,0 0,4 -4,0 0,-4z M8,84l4,0 0,4 -4,0 0,-4z M12,84l4,0 0,4 -4,0 0,-4z M20,84l4,0 0,4 -4,0 0,-4z M28,84l4,0 0,4 -4,0 0,-4z M32,84l4,0 0,4 -4,0 0,-4z M36,84l4,0 0,4 -4,0 0,-4z M40,84l4,0 0,4 -4,0 0,-4z M48,84l4,0 0,4 -4,0 0,-4z M56,84l4,0 0,4 -4,0 0,-4z M68,84l4,0 0,4 -4,0 0,-4z M80,84l4,0 0,4 -4,0 0,-4z M96,84l4,0 0,4 -4,0 0,-4z M112,84l4,0 0,4 -4,0 0,-4z M120,84l4,0 0,4 -4,0 0,-4z M132,84l4,0 0,4 -4,0 0,-4z M136,84l4,0 0,4 -4,0 0,-4z M144,84l4,0 0,4 -4,0 0,-4z M12,88l4,0 0,4 -4,0 0,-4z M20,88l4,0 0,4 -4,0 0,-4z M24,88l4,0 0,4 -4,0 0,-4z M28,88l4,0 0,4 -4,0 0,-4z M40,88l4,0 0,4 -4,0 0,-4z M48,88l4,0 0,4 -4,0 0,-4z M52,88l4,0 0,4 -4,0 0,-4z M72,88l4,0 0,4 -4,0 0,-4z M84,88l4,0 0,4 -4,0 0,-4z M88,88l4,0 0,4 -4,0 0,-4z M100,88l4,0 0,4 -4,0 0,-4z M120,88l4,0 0,4 -4,0 0,-4z M128,88l4,0 0,4 -4,0 0,-4z M144,88l4,0 0,4 -4,0 0,-4z M0,92l4,0 0,4 -4,0 0,-4z M4,92l4,0 0,4 -4,0 0,-4z M8,92l4,0 0,4 -4,0 0,-4z M12,92l4,0 0,4 -4,0 0,-4z M16,92l4,0 0,4 -4,0 0,-4z M44,92l4,0 0,4 -4,0 0,-4z M56,92l4,0 0,4 -4,0 0,-4z M68,92l4,0 0,4 -4,0 0,-4z M72,92l4,0 0,4 -4,0 0,-4z M76,92l4,0 0,4 -4,0 0,-4z M84,92l4,0 0,4 -4,0 0,-4z M88,92l4,0 0,4 -4,0 0,-4z M100,92l4,0 0,4 -4,0 0,-4z M108,92l4,0 0,4 -4,0 0,-4z M112,92l4,0 0,4 -4,0 0,-4z M120,92l4,0 0,4 -4,0 0,-4z M124,92l4,0 0,4 -4,0 0,-4z M132,92l4,0 0,4 -4,0 0,-4z M4,96l4,0 0,4 -4,0 0,-4z M12,96l4,0 0,4 -4,0 0,-4z M16,96l4,0 0,4 -4,0 0,-4z M24,96l4,0 0,4 -4,0 0,-4z M44,96l4,0 0,4 -4,0 0,-4z M56,96l4,0 0,4 -4,0 0,-4z M64,96l4,0 0,4 -4,0 0,-4z M72,96l4,0 0,4 -4,0 0,-4z M80,96l4,0 0,4 -4,0 0,-4z M92,96l4,0 0,4 -4,0 0,-4z M100,96l4,0 0,4 -4,0 0,-4z M104,96l4,0 0,4 -4,0 0,-4z M108,96l4,0 0,4 -4,0 0,-4z M112,96l4,0 0,4 -4,0 0,-4z M116,96l4,0 0,4 -4,0 0,-4z M120,96l4,0 0,4 -4,0 0,-4z M124,96l4,0 0,4 -4,0 0,-4z M140,96l4,0 0,4 -4,0 0,-4z M12,100l4,0 0,4 -4,0 0,-4z M16,100l4,0 0,4 -4,0 0,-4z M28,100l4,0 0,4 -4,0 0,-4z M36,100l4,0 0,4 -4,0 0,-4z M40,100l4,0 0,4 -4,0 0,-4z M48,100l4,0 0,4 -4,0 0,-4z M52,100l4,0 0,4 -4,0 0,-4z M56,100l4,0 0,4 -4,0 0,-4z M60,100l4,0 0,4 -4,0 0,-4z M64,100l4,0 0,4 -4,0 0,-4z M68,100l4,0 0,4 -4,0 0,-4z M72,100l4,0 0,4 -4,0 0,-4z M96,100l4,0 0,4 -4,0 0,-4z M100,100l4,0 0,4 -4,0 0,-4z M104,100l4,0 0,4 -4,0 0,-4z M108,100l4,0 0,4 -4,0 0,-4z M112,100l4,0 0,4 -4,0 0,-4z M120,100l4,0 0,4 -4,0 0,-4z M124,100l4,0 0,4 -4,0 0,-4z M132,100l4,0 0,4 -4,0 0,-4z M144,100l4,0 0,4 -4,0 0,-4z M0,104l4,0 0,4 -4,0 0,-4z M8,104l4,0 0,4 -4,0 0,-4z M12,104l4,0 0,4 -4,0 0,-4z M24,104l4,0 0,4 -4,0 0,-4z M36,104l4,0 0,4 -4,0 0,-4z M48,104l4,0 0,4 -4,0 0,-4z M56,104l4,0 0,4 -4,0 0,-4z M60,104l4,0 0,4 -4,0 0,-4z M64,104l4,0 0,4 -4,0 0,-4z M68,104l4,0 0,4 -4,0 0,-4z M72,104l4,0 0,4 -4,0 0,-4z M80,104l4,0 0,4 -4,0 0,-4z M84,104l4,0 0,4 -4,0 0,-4z M96,104l4,0 0,4 -4,0 0,-4z M120,104l4,0 0,4 -4,0 0,-4z M136,104l4,0 0,4 -4,0 0,-4z M140,104l4,0 0,4 -4,0 0,-4z M144,104l4,0 0,4 -4,0 0,-4z M4,108l4,0 0,4 -4,0 0,-4z M16,108l4,0 0,4 -4,0 0,-4z M20,108l4,0 0,4 -4,0 0,-4z M28,108l4,0 0,4 -4,0 0,-4z M52,108l4,0 0,4 -4,0 0,-4z M64,108l4,0 0,4 -4,0 0,-4z M68,108l4,0 0,4 -4,0 0,-4z M72,108l4,0 0,4 -4,0 0,-4z M80,108l4,0 0,4 -4,0 0,-4z M84,108l4,0 0,4 -4,0 0,-4z M96,108l4,0 0,4 -4,0 0,-4z M100,108l4,0 0,4 -4,0 0,-4z M104,108l4,0 0,4 -4,0 0,-4z M108,108l4,0 0,4 -4,0 0,-4z M112,108l4,0 0,4 -4,0 0,-4z M116,108l4,0 0,4 -4,0 0,-4z M128,108l4,0 0,4 -4,0 0,-4z M132,108l4,0 0,4 -4,0 0,-4z M0,112l4,0 0,4 -4,0 0,-4z M12,112l4,0 0,4 -4,0 0,-4z M16,112l4,0 0,4 -4,0 0,-4z M20,112l4,0 0,4 -4,0 0,-4z M24,112l4,0 0,4 -4,0 0,-4z M28,112l4,0 0,4 -4,0 0,-4z M36,112l4,0 0,4 -4,0 0,-4z M52,112l4,0 0,4 -4,0 0,-4z M60,112l4,0 0,4 -4,0 0,-4z M68,112l4,0 0,4 -4,0 0,-4z M80,112l4,0 0,4 -4,0 0,-4z M84,112l4,0 0,4 -4,0 0,-4z M88,112l4,0 0,4 -4,0 0,-4z M92,112l4,0 0,4 -4,0 0,-4z M96,112l4,0 0,4 -4,0 0,-4z M108,112l4,0 0,4 -4,0 0,-4z M112,112l4,0 0,4 -4,0 0,-4z M116,112l4,0 0,4 -4,0 0,-4z M120,112l4,0 0,4 -4,0 0,-4z M124,112l4,0 0,4 -4,0 0,-4z M128,112l4,0 0,4 -4,0 0,-4z M132,112l4,0 0,4 -4,0 0,-4z M140,112l4,0 0,4 -4,0 0,-4z M32,116l4,0 0,4 -4,0 0,-4z M40,116l4,0 0,4 -4,0 0,-4z M44,116l4,0 0,4 -4,0 0,-4z M52,116l4,0 0,4 -4,0 0,-4z M56,116l4,0 0,4 -4,0 0,-4z M64,116l4,0 0,4 -4,0 0,-4z M80,116l4,0 0,4 -4,0 0,-4z M88,116l4,0 0,4 -4,0 0,-4z M96,116l4,0 0,4 -4,0 0,-4z M112,116l4,0 0,4 -4,0 0,-4z M128,116l4,0 0,4 -4,0 0,-4z M136,116l4,0 0,4 -4,0 0,-4z M140,116l4,0 0,4 -4,0 0,-4z M144,116l4,0 0,4 -4,0 0,-4z M0,120l4,0 0,4 -4,0 0,-4z M4,120l4,0 0,4 -4,0 0,-4z M8,120l4,0 0,4 -4,0 0,-4z M12,120l4,0 0,4 -4,0 0,-4z M16,120l4,0 0,4 -4,0 0,-4z M20,120l4,0 0,4 -4,0 0,-4z M24,120l4,0 0,4 -4,0 0,-4z M36,120l4,0 0,4 -4,0 0,-4z M68,120l4,0 0,4 -4,0 0,-4z M80,120l4,0 0,4 -4,0 0,-4z M88,120l4,0 0,4 -4,0 0,-4z M108,120l4,0 0,4 -4,0 0,-4z M112,120l4,0 0,4 -4,0 0,-4z M120,120l4,0 0,4 -4,0 0,-4z M128,120l4,0 0,4 -4,0 0,-4z M132,120l4,0 0,4 -4,0 0,-4z M140,120l4,0 0,4 -4,0 0,-4z M144,120l4,0 0,4 -4,0 0,-4z M0,124l4,0 0,4 -4,0 0,-4z M24,124l4,0 0,4 -4,0 0,-4z M40,124l4,0 0,4 -4,0 0,-4z M48,124l4,0 0,4 -4,0 0,-4z M56,124l4,0 0,4 -4,0 0,-4z M60,124l4,0 0,4 -4,0 0,-4z M64,124l4,0 0,4 -4,0 0,-4z M76,124l4,0 0,4 -4,0 0,-4z M80,124l4,0 0,4 -4,0 0,-4z M84,124l4,0 0,4 -4,0 0,-4z M88,124l4,0 0,4 -4,0 0,-4z M96,124l4,0 0,4 -4,0 0,-4z M100,124l4,0 0,4 -4,0 0,-4z M104,124l4,0 0,4 -4,0 0,-4z M108,124l4,0 0,4 -4,0 0,-4z M112,124l4,0 0,4 -4,0 0,-4z M128,124l4,0 0,4 -4,0 0,-4z M132,124l4,0 0,4 -4,0 0,-4z M0,128l4,0 0,4 -4,0 0,-4z M8,128l4,0 0,4 -4,0 0,-4z M12,128l4,0 0,4 -4,0 0,-4z M16,128l4,0 0,4 -4,0 0,-4z M24,128l4,0 0,4 -4,0 0,-4z M32,128l4,0 0,4 -4,0 0,-4z M52,128l4,0 0,4 -4,0 0,-4z M92,128l4,0 0,4 -4,0 0,-4z M96,128l4,0 0,4 -4,0 0,-4z M112,128l4,0 0,4 -4,0 0,-4z M116,128l4,0 0,4 -4,0 0,-4z M120,128l4,0 0,4 -4,0 0,-4z M124,128l4,0 0,4 -4,0 0,-4z M128,128l4,0 0,4 -4,0 0,-4z M144,128l4,0 0,4 -4,0 0,-4z M0,132l4,0 0,4 -4,0 0,-4z M8,132l4,0 0,4 -4,0 0,-4z M12,132l4,0 0,4 -4,0 0,-4z M16,132l4,0 0,4 -4,0 0,-4z M24,132l4,0 0,4 -4,0 0,-4z M40,132l4,0 0,4 -4,0 0,-4z M44,132l4,0 0,4 -4,0 0,-4z M48,132l4,0 0,4 -4,0 0,-4z M60,132l4,0 0,4 -4,0 0,-4z M76,132l4,0 0,4 -4,0 0,-4z M80,132l4,0 0,4 -4,0 0,-4z M96,132l4,0 0,4 -4,0 0,-4z M100,132l4,0 0,4 -4,0 0,-4z M128,132l4,0 0,4 -4,0 0,-4z M132,132l4,0 0,4 -4,0 0,-4z M140,132l4,0 0,4 -4,0 0,-4z M0,136l4,0 0,4 -4,0 0,-4z M8,136l4,0 0,4 -4,0 0,-4z M12,136l4,0 0,4 -4,0 0,-4z M16,136l4,0 0,4 -4,0 0,-4z M24,136l4,0 0,4 -4,0 0,-4z M32,136l4,0 0,4 -4,0 0,-4z M36,136l4,0 0,4 -4,0 0,-4z M52,136l4,0 0,4 -4,0 0,-4z M80,136l4,0 0,4 -4,0 0,-4z M104,136l4,0 0,4 -4,0 0,-4z M112,136l4,0 0,4 -4,0 0,-4z M124,136l4,0 0,4 -4,0 0,-4z M128,136l4,0 0,4 -4,0 0,-4z M136,136l4,0 0,4 -4,0 0,-4z M140,136l4,0 0,4 -4,0 0,-4z M144,136l4,0 0,4 -4,0 0,-4z M0,140l4,0 0,4 -4,0 0,-4z M24,140l4,0 0,4 -4,0 0,-4z M36,140l4,0 0,4 -4,0 0,-4z M40,140l4,0 0,4 -4,0 0,-4z M44,140l4,0 0,4 -4,0 0,-4z M48,140l4,0 0,4 -4,0 0,-4z M60,140l4,0 0,4 -4,0 0,-4z M68,140l4,0 0,4 -4,0 0,-4z M80,140l4,0 0,4 -4,0 0,-4z M84,140l4,0 0,4 -4,0 0,-4z M88,140l4,0 0,4 -4,0 0,-4z M92,140l4,0 0,4 -4,0 0,-4z M100,140l4,0 0,4 -4,0 0,-4z M112,140l4,0 0,4 -4,0 0,-4z M128,140l4,0 0,4 -4,0 0,-4z M132,140l4,0 0,4 -4,0 0,-4z M140,140l4,0 0,4 -4,0 0,-4z M0,144l4,0 0,4 -4,0 0,-4z M4,144l4,0 0,4 -4,0 0,-4z M8,144l4,0 0,4 -4,0 0,-4z M12,144l4,0 0,4 -4,0 0,-4z M16,144l4,0 0,4 -4,0 0,-4z M20,144l4,0 0,4 -4,0 0,-4z M24,144l4,0 0,4 -4,0 0,-4z M32,144l4,0 0,4 -4,0 0,-4z M40,144l4,0 0,4 -4,0 0,-4z M48,144l4,0 0,4 -4,0 0,-4z M52,144l4,0 0,4 -4,0 0,-4z M64,144l4,0 0,4 -4,0 0,-4z M68,144l4,0 0,4 -4,0 0,-4z M76,144l4,0 0,4 -4,0 0,-4z M80,144l4,0 0,4 -4,0 0,-4z M92,144l4,0 0,4 -4,0 0,-4z M96,144l4,0 0,4 -4,0 0,-4z M100,144l4,0 0,4 -4,0 0,-4z M112,144l4,0 0,4 -4,0 0,-4z M116,144l4,0 0,4 -4,0 0,-4z M120,144l4,0 0,4 -4,0 0,-4z M124,144l4,0 0,4 -4,0 0,-4z M140,144l4,0 0,4 -4,0 0,-4z M144,144l4,0 0,4 -4,0 0,-4z " stroke="transparent" fill="black"/></svg>`;

export function buildUpiUri(doc, options = {}) {
  // No hardcoded fallback VPA: a document with no UPI ID configured on its
  // bank must produce no payable QR, not silently route payment to
  // whatever placeholder ID happened to be here.
  const { type = "tax", orgDetails, upiId = "", amount } = options;
  const vpa = (upiId || "").trim();
  if (!vpa) return "";

  const total = amount !== undefined ? Number(amount) : computeDocument(doc, type).grandTotal;
  if (!(total > 0)) return "";

  const numberKey = NUMBER_KEY[type] || NUMBER_KEY.tax;
  const params = new URLSearchParams({
    pa: vpa,
    pn: (orgDetails?.companyName || "Payee").trim(),
    am: total.toFixed(2),
    cu: "INR",
  });
  const ref = doc?.[numberKey];
  // A user-edited note (Invoice form's "Payment Note" field) wins over the
  // auto-generated "<Invoice> <number>" default.
  const customNote = (doc?.qrNote || "").trim();
  if (customNote) {
    params.set("tn", customNote);
  } else if (ref) {
    params.set("tn", `${DOC_LABEL[type] || "Invoice"} ${ref}`);
  }
  // `tr` (transaction reference) is optional per the NPCI UPI deep-link spec,
  // but its absence is a known trigger for some UPI apps (notably recent
  // GPay builds) to treat the link as an incomplete payment intent and fall
  // back to an onboarding/"add bank account" flow instead of the pay screen.
  // Alphanumeric only, max 35 chars per spec; falls back to the document's
  // own id if there's no human-readable number to sanitize into one.
  const rawRef = ref != null ? String(ref) : doc?._id ? String(doc._id) : "";
  const tr = rawRef.replace(/[^a-zA-Z0-9]/g, "").slice(0, 35);
  if (tr) params.set("tr", tr);
  return `upi://pay?${params.toString().replace(/\+/g, "%20")}`;
}

/* ------------------------------------------------------------- base CSS */

const BASE_CSS = `
.dcsheet, .dcsheet * { box-sizing: border-box; }
.dcsheet {
  --accent: #007bff;
  --ink: #000;
  --muted: #444;
  --line: #000;
  --line-w: 1px;
  --pad: 8px;
  --radius: 0px;
  background: #fff;
  color: var(--ink);
  font-family: Arial, Helvetica, sans-serif;
  font-size: 11px;
  line-height: 1.35;
  padding: 20px;
  width: 100%;
  max-width: 210mm;
  min-height: 297mm;
  margin: 0 auto;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.dcsheet.t-Landscape {
  max-width: 297mm;
  min-height: 210mm;
}
/* Shared "Page 1 / 1  This is a digitally signed document." strip. It's a
   sibling of .dcsheet-body inside the sheet wrapper (see buildDocumentHtml),
   and .dcsheet-body { flex: 1 } already pushes it to the bottom of the sheet —
   no flex tricks on the body itself, so template content is untouched. */
.dcsheet .dc-page-footer {
  padding-top: 6px;
  font-size: 8.5px;
  color: var(--muted);
  page-break-inside: avoid;
  break-inside: avoid;
}
.dcsheet .dc-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding-bottom: 12px; }
.dcsheet .dc-org { display: flex; align-items: flex-start; gap: 12px; min-width: 0; }
.dcsheet .dc-logo { width: 56px; height: 56px; object-fit: contain; flex-shrink: 0; }
.dcsheet .dc-company { font-size: 15px; font-weight: bold; }
.dcsheet .dc-addr { font-size: 10px; white-space: pre-line; max-width: 280px; }
.dcsheet .dc-gstin { font-size: 10px; font-weight: bold; margin-top: 2px; }
.dcsheet .dc-contact { font-size: 10px; }
.dcsheet .dc-title-block { text-align: right; flex-shrink: 0; }
.dcsheet .dc-title { font-size: 13px; font-weight: bold; color: var(--accent); text-transform: uppercase; }
.dcsheet .dc-subtitle { font-size: 10px; font-weight: bold; }

.dcsheet .dc-meta { display: grid; grid-template-columns: 1fr 1fr; border: var(--line-w) solid var(--line); border-radius: var(--radius); overflow: hidden; }
.dcsheet .dc-cust { border-right: var(--line-w) solid var(--line); padding: var(--pad); }
.dcsheet .dc-cust > div { margin-bottom: 4px; }
.dcsheet .dc-label { font-weight: bold; }
.dcsheet .dc-mt { padding-top: 4px; }
.dcsheet .dc-addr-box { min-height: 28px; }
.dcsheet .dc-metagrid { display: grid; grid-template-columns: 1fr 1fr; }
.dcsheet .dc-mcell { border: var(--line-w) solid var(--line); padding: 4px 6px; }
.dcsheet .dc-mcell b { display: block; }
.dcsheet .dc-span2 { grid-column: span 2; }

.dcsheet table { width: 100%; border-collapse: collapse; }
.dcsheet .dc-items { border: var(--line-w) solid var(--line); font-size: 10px; }
.dcsheet .dc-items th { border: var(--line-w) solid var(--line); padding: 4px 6px; font-weight: bold; }
.dcsheet .dc-items td { border: var(--line-w) solid var(--line); padding: 4px 6px; vertical-align: top; }
.dcsheet .c { text-align: center; }
.dcsheet .r { text-align: right; }
.dcsheet .nowrap { white-space: nowrap; }
.dcsheet .dc-item-name { font-weight: bold; }
.dcsheet .dc-item-desc { font-weight: normal; font-size: 9px; color: var(--muted); margin-top: 2px; white-space: pre-line; }

.dcsheet .dc-totals { display: grid; grid-template-columns: 1fr 1fr; border: var(--line-w) solid var(--line); border-top: 0; }
.dcsheet .dc-totals-left { border-right: var(--line-w) solid var(--line); padding: var(--pad); }
.dcsheet .dc-totals-left > div { margin-bottom: 4px; }
.dcsheet .dc-bank-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.dcsheet .dc-bank { min-width: 0; }
.dcsheet .dc-bank > div { margin-bottom: 4px; }
.dcsheet .dc-qr { flex-shrink: 0; text-align: center; width: 104px; }
.dcsheet .dc-qr-img svg { width: 104px; height: 104px; display: block; }
.dcsheet .dc-qr-cap { font-size: 9px; font-weight: bold; margin-top: 2px; }
/* Compact "scan to pay" QR that templates without a dedicated QR slot drop in
   right before their bank block — it floats to the right of the bank lines. */
.dcsheet .dc-pay-qr { float: right; text-align: center; margin: 0 0 4px 14px; }
.dcsheet .dc-pay-qr svg { width: 58px; height: 58px; display: block; }
.dcsheet .dc-pay-qr-cap { font-size: 6.5px; color: var(--muted); margin-top: 1px; letter-spacing: .3px; }
.dcsheet .dc-totals-right { padding: var(--pad); }
.dcsheet .dc-trow { display: flex; justify-content: space-between; }
.dcsheet .dc-trow.sep { border-bottom: var(--line-w) solid var(--line); padding-bottom: 4px; }
.dcsheet .dc-grand { display: flex; justify-content: space-between; align-items: center; padding-top: 8px; font-size: 14px; font-weight: bold; }
.dcsheet .dc-paid { display: flex; justify-content: flex-end; align-items: center; gap: 4px; padding-top: 8px; }
.dcsheet .dc-tick { color: #16a34a; }

.dcsheet .dc-hsn { border: var(--line-w) solid var(--line); margin-top: 8px; font-size: 10px; }
.dcsheet .dc-hsn th, .dcsheet .dc-hsn td { border: var(--line-w) solid var(--line); padding: 4px 6px; }
.dcsheet .dc-hsn th { font-weight: bold; }
.dcsheet .dc-hsn .tot td { font-weight: bold; }

.dcsheet .dc-footer { display: grid; grid-template-columns: 1fr 180px; border: var(--line-w) solid var(--line); margin-top: 8px; }
.dcsheet .dc-notes { border-right: var(--line-w) solid var(--line); padding: var(--pad); }
.dcsheet .dc-note-body { white-space: pre-line; }
.dcsheet .dc-terms { font-size: 9px; margin-top: 2px; white-space: pre-line; }
.dcsheet .dc-terms div { margin-bottom: 2px; }
.dcsheet .dc-sign { padding: var(--pad); display: flex; flex-direction: column; justify-content: space-between; text-align: right; }
.dcsheet .dc-sign-img { height: 40px; margin-left: auto; object-fit: contain; }
.dcsheet .dc-sign-line { border-top: var(--line-w) solid var(--line); padding-top: 4px; margin-top: 4px; }
`;

/* ------------------------------------------------------------------ build */

/*
 * Returns a self-contained HTML fragment: a <style> block + the document markup.
 * Safe to inject into a page (.dcsheet scope) or into a bare page for printing.
 */
export function buildDocumentHtml(doc, options = {}) {
  const {
    type = "tax",
    template = DEFAULT_TEMPLATE,
    orgDetails,
    bankDetails,
    dealName: dealNameOverride,
    documentNumber,
    upiQrSvg,
    eInvoiceQrSvg,
    upiId,
    copyType = "original",
  } = options;

  const COPY_TYPE_LABEL = {
    original: "ORIGINAL FOR RECIPIENT",
    duplicate: "DUPLICATE FOR TRANSPORTER",
    triplicate: "TRIPLICATE FOR SUPPLIER",
  };
  const copySubtitle = COPY_TYPE_LABEL[copyType] || COPY_TYPE_LABEL.original;

  // Delivery Challan never goes through the 13-template registry — it's a
  // dispatch record, not a bill, so it always gets the one dedicated,
  // non-priced layout regardless of the org's stored `template` setting.
  const isDeliveryChallan = type === "deliveryChallan";
  const tplName = isDeliveryChallan
    ? "DeliveryChallanPlain"
    : DOCUMENT_TEMPLATES.includes(template) ? template : DEFAULT_TEMPLATE;
  const tpl = isDeliveryChallan ? DeliveryChallanPlain : REGISTRY[tplName];
  const org = orgDetails || {};
  const bank = bankDetails || {};
  const docLabel = DOC_LABEL[type] || DOC_LABEL.tax;
  const numberKey = NUMBER_KEY[type] || NUMBER_KEY.tax;

  const t = computeDocument(doc, type);

  // Round Off, so the printed total matches the rounded amount the form saved. Only when the
  // document was actually saved rounded (whole-number amount, or no amount yet as in a live
  // preview): older documents whose stored flag doesn't reflect a real choice keep printing
  // the exact total they were saved with.
  const savedAmount = doc.amount;
  const savedRounded = savedAmount === undefined || savedAmount === null || Number.isInteger(Number(savedAmount));
  if (doc.isRoundOff === true && savedRounded) {
    const rounded = Math.round(t.grandTotal);
    t.roundOff = rounded - t.grandTotal;
    t.grandTotal = rounded;
    t.amountInWords = numberToWords(rounded);
    t.balanceDue = Math.max(0, rounded - t.amountPaid);
    t.isFullyPaid = t.amountPaid > 0 && t.balanceDue <= 0.01;
    t.isPartiallyPaid = t.amountPaid > 0.01 && t.balanceDue > 0.01;
  }

  // The party the document is billed to: the deal's customer (company, else
  // contact) takes precedence; the deal's own title is only a fallback for
  // deals that have neither. An explicit override from the caller still wins.
  const dealName =
    dealNameOverride ||
    doc.deal?.company?.name ||
    doc.deal?.contact?.name ||
    doc.customerName ||
    doc.deal?.title ||
    "Customer Name";

  const docNumber = documentNumber ?? doc[numberKey];
  const notes = formatRichText(doc.notes);
  const terms = formatRichText(doc.terms);

  // â”€â”€ Pre-built snippets passed into ctx â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const discountRow = t.documentDiscount > 0
    ? `<div class="dc-trow"><span class="dc-label">Discount${t.discountType === "percentage" ? ` (${t.discountValue}%)` : ""
    }</span><span>- &#8377;${fmt(t.documentDiscount)}</span></div>`
    : "";

  // Real UPI QR when we can build one, otherwise the decorative placeholder —
  // always non-empty so every template can show a "scan to pay" block.
  const payQrSvg = (upiQrSvg && t.grandTotal > 0) ? upiQrSvg : DUMMY_QR_SVG;

  const qrBlock = `<div class="dc-qr">
        <div class="dc-qr-img">${payQrSvg}</div>
        <div class="dc-qr-cap">Scan to pay</div>
      </div>`;

  // Standard item rows (used by most templates; unique-layout templates build
  // their own rows inline).
  const itemRows = t.rows.length
    ? t.rows.map((r, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td class="dc-item-name">${esc(r.name) || "&mdash;"}${r.description ? `<div class="dc-item-desc">${esc(r.description)}</div>` : ""
      }</td>
        <td class="c">${esc(r.hsn)}</td>
        <td class="r">${fmt(r.rate)}</td>
        <td class="r nowrap">${r.qty} BOX</td>
        <td class="r">${fmt(r.taxable)}</td>
        ${buildItemTaxCells(r, t)}
        <td class="r">${fmt(r.amount)}</td>
      </tr>`).join("")
    : `<tr><td class="c" colspan="8">&nbsp;</td></tr>`;

  // Standard HSN/SAC rows
  const hsnRows = t.hsnRows.map((r) =>
    t.isInterState
      ? `<tr>
          <td class="c">${esc(r.hsn)}</td>
          <td class="c">${fmt(r.taxable)}</td>
          <td class="c">${r.rate}%</td>
          <td class="r">${fmt(r.igst)}</td>
          <td class="c">${fmt(r.igst)}</td>
        </tr>`
      : `<tr>
          <td class="c">${esc(r.hsn)}</td>
          <td class="c">${fmt(r.taxable)}</td>
          <td class="c">${r.rate / 2}%</td>
          <td class="r">${fmt(r.cgst)}</td>
          <td class="c">${r.rate / 2}%</td>
          <td class="r">${fmt(r.sgst)}</td>
          <td class="c">${fmt(r.cgst + r.sgst)}</td>
        </tr>`
  ).join("");

  // â”€â”€ Assemble context â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const ctx = {
    t, doc, org, bank, upiId, upiQrSvg,
    esc, fmt, formatDate, formatPostalAddress,
    dealName, docLabel, docNumber, copySubtitle,
    notes, terms,
    discountRow, hsnRows, itemRows, qrBlock,
    // Raw SVGs for templates that place the QR themselves (Landscape, Detailed).
    // payQrSvg is the real UPI QR when available, else the dummy placeholder.
    upiQrSvg, payQrSvg, eInvoiceQrSvg,
  };

  const css = BASE_CSS + (tpl.css || "");

  return `<style>${css}</style>
<div class="dcsheet t-${tplName}">
  <div class="dcsheet-body" style="flex:1;">
    ${tpl.html(ctx)}
  </div>
  <div class="dc-page-footer">Page 1 / 1&nbsp;&nbsp;This is a digitally signed document.</div>
</div>`;
}

/* Build the per-row tax cells for the standard items table. */
function buildItemTaxCells(r, t) {
  if (!t.isTax) return "";
  return t.isInterState
    ? `<td class="r">${r.igst > 0 ? `${fmt(r.igst)} (${r.igstRate}%)` : ""}</td>`
    : `<td class="r">${r.cgst > 0 ? `${fmt(r.cgst)} (${r.cgstRate}%)` : ""}</td>
       <td class="r">${r.sgst > 0 ? `${fmt(r.sgst)} (${r.sgstRate}%)` : ""}</td>`;
}
