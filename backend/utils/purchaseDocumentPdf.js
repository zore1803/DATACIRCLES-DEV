const puppeteer = require("puppeteer");

/*
 * Renders a Purchase or Purchase Order to PDF, mirroring the exact markup
 * PurchasePreview.tsx / PurchaseOrderPreview.jsx already show on screen
 * (company header, Bill From / Vendor block, items table, totals, terms,
 * signature) — same approach as htmlDocumentPdf.js for Invoice/Quotation/
 * Performa/Delivery Challan: what you see in the preview is what prints.
 *
 * Kept as its own file rather than folding into htmlDocumentPdf.js because
 * Purchase documents have a different shape (vendor instead of deal/company,
 * "we are the buyer" instead of "we are the seller") that doesn't fit the
 * shared/documentTemplates.js model those four document types share.
 */

// Reuses its own Chromium instance rather than importing htmlDocumentPdf's —
// same launch pattern, kept separate so this file has no dependency on the
// other document types' module.
let sharedBrowserPromise = null;
async function getBrowser() {
  if (sharedBrowserPromise) {
    try {
      const existing = await sharedBrowserPromise;
      if (existing.connected) return existing;
    } catch {
      // fall through and relaunch
    }
  }
  sharedBrowserPromise = puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  return sharedBrowserPromise;
}

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));

const money = (amount) => (parseFloat(amount) || 0).toFixed(2);

const formatDate = (date) => {
  if (!date) return "N/A";
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

function convertNumberToWords(num) {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  const teens = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function convertHundreds(n) {
    let result = "";
    if (n > 99) {
      result += ones[Math.floor(n / 100)] + " Hundred ";
      n %= 100;
    }
    if (n > 19) {
      result += tens[Math.floor(n / 10)] + " ";
      n %= 10;
    }
    if (n > 9) {
      result += teens[n - 10] + " ";
      return result;
    }
    if (n > 0) result += ones[n] + " ";
    return result;
  }

  if (num === 0) return "Zero";
  let result = "";
  const crores = Math.floor(num / 10000000);
  const lakhs = Math.floor((num % 10000000) / 100000);
  const thousands = Math.floor((num % 100000) / 1000);
  const hundreds = num % 1000;
  if (crores > 0) result += convertHundreds(crores) + "Crore ";
  if (lakhs > 0) result += convertHundreds(lakhs) + "Lakh ";
  if (thousands > 0) result += convertHundreds(thousands) + "Thousand ";
  if (hundreds > 0) result += convertHundreds(hundreds);
  return result.trim() + " Rupees Only.";
}

const getVendorAddress = (vendor) => {
  if (!vendor?.address) return "Address not available";
  const { line1, line2, city, state, pincode, country } = vendor.address;
  return [line1, line2, city, state, pincode, country].filter(Boolean).join(", ");
};

// type: "purchase" | "purchaseOrder" | "purchaseReturn"
function buildHtml(doc, orgDetails, vendor, type) {
  const isPO = type === "purchaseOrder";
  const isReturn = type === "purchaseReturn";
  const items = doc.items || [];
  const totalItems = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
  const subtotal = doc.subtotal || 0;
  const totalTax = doc.totalTax || 0;
  const grandTotal = doc.grandTotal || (isPO ? doc.totalAmount : subtotal + totalTax) || 0;
  // "Round Off" adjustment stored on the document (grandTotal is whole-rupee).
  const roundOff = Number(doc.roundOff) || 0;
  const isIntra = doc.transactionType !== "inter";
  // Summed per line rather than from doc.gstRate: that document-level field
  // is a vestige that's never actually populated (each line carries its own
  // gstRate/taxInclusive), so deriving the split from it printed CGST/SGST/
  // IGST as ₹0 even when totalTax was correctly nonzero. CGST/SGST/IGST
  // together must always equal totalTax, so they're derived from the same
  // per-line tax this document's totalTax was itself built from.
  const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  // Split the document's own (already-rounded) totalTax exactly the way the
  // forms do, so CGST + SGST always sums back to totalTax and stays consistent
  // with subtotal + tax = grandTotal. (Deriving from doc.gstRate is unreliable —
  // it's a vestige that's never populated.)
  let cgstAmount = 0, sgstAmount = 0, igstAmount = 0;
  if (totalTax > 0) {
    if (isIntra) {
      cgstAmount = round2(totalTax / 2);
      sgstAmount = round2(totalTax - cgstAmount);
    } else {
      igstAmount = round2(totalTax);
    }
  }

  const docLabel = isReturn ? "PURCHASE RETURN" : isPO ? "PURCHASE ORDER" : "PURCHASE";
  const numberLabel = isReturn ? "Return Number" : isPO ? "PO Number" : "Purchase Number";
  const numberValue = isReturn ? doc.returnNumber : isPO ? doc.poNumber : doc.purchaseNumber;
  const dateLabel = isReturn ? "Return Date" : isPO ? "PO Date" : "Purchase Date";
  const dateValue = isReturn ? doc.returnDate : isPO ? doc.createdAt : doc.purchaseDate;
  // A return has no due date to speak of — show why the goods came back
  // instead, so this meta row stays useful rather than blank.
  const dueLabel = isReturn ? "Reason" : isPO ? "Payment By" : "Due Date";
  const dueValue = isReturn
    ? (doc.reason || "Not specified")
    : isPO
    ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    : doc.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const itemRows = items
    .map(
      (item, index) => `
      <tr>
        <td class="c">${index + 1}</td>
        <td>
          <div class="b">${escapeHtml(item.name)}</div>
          ${item.sku ? `<div class="muted">SKU: ${escapeHtml(item.sku)}</div>` : ""}
          ${!isPO && item.itemId?.hsnSac ? `<div class="muted">HSN: ${escapeHtml(item.itemId.hsnSac)}</div>` : ""}
        </td>
        ${!isPO ? `<td class="c">${escapeHtml(item.itemId?.hsnSac || "N/A")}</td>` : ""}
        <td class="r mono">${money(item.unitPrice)}</td>
        <td class="c">${item.gstRate ? `${item.gstRate}%` : "0%"}</td>
        <td class="c b">${item.quantity}</td>
        <td class="r mono b">${money(item.total || item.quantity * item.unitPrice)}</td>
      </tr>`
    )
    .join("");

  const colSpanBeforeQty = isPO ? 4 : 5;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; color: #111827; }
  .sheet { padding: 24px; }
  h1 { font-size: 26px; font-weight: 700; margin: 0 0 10px; }
  .doc-title { font-size: 20px; font-weight: 700; text-align: right; margin-bottom: 10px; }
  .row { display: flex; justify-content: space-between; align-items: flex-start; }
  .muted { color: #4B5563; font-size: 10px; }
  .small { font-size: 11px; color: #374151; line-height: 1.5; }
  .meta { text-align: left; }
  .meta div { display: flex; justify-content: space-between; gap: 16px; font-size: 10px; margin-bottom: 6px; }
  .meta span:first-child { color: #6B7280; font-weight: 600; text-transform: uppercase; }
  .meta span:last-child { color: #111827; font-weight: 700; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin: 20px 0; }
  .label { font-size: 11px; font-weight: 700; text-transform: uppercase; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th, td { border: 1px solid #D1D5DB; padding: 6px 8px; font-size: 10px; }
  th { background: #F3F4F6; text-transform: uppercase; font-size: 9px; text-align: left; }
  .c { text-align: center; } .r { text-align: right; } .b { font-weight: 700; } .mono { font-family: 'Courier New', monospace; }
  tfoot td { background: #F9FAFB; font-weight: 700; }
  .totals { margin-top: 10px; }
  .totals-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 11px; }
  .totals-grand { border-top: 2px solid #111827; margin-top: 6px; padding-top: 6px; font-size: 14px; font-weight: 700; display: flex; justify-content: space-between; }
  .words { margin-top: 10px; font-size: 10px; font-style: italic; color: #4B5563; }
  .terms { font-size: 10px; color: #4B5563; }
  .terms li { margin-bottom: 4px; }
  .footer { margin-top: 32px; display: flex; justify-content: space-between; align-items: flex-end; }
  .sig-img { max-height: 48px; }
</style>
</head>
<body>
  <div class="sheet">
    <div class="row" style="margin-bottom:24px;">
      <div style="flex:1;">
        <h1>${escapeHtml(orgDetails?.companyName || "Company Name")}</h1>
        <div class="small">
          ${orgDetails?.address ? `<div>${escapeHtml(orgDetails.address)}</div>` : ""}
          ${orgDetails?.mobile ? `<div>Mobile: ${escapeHtml(orgDetails.mobile)}</div>` : ""}
          ${orgDetails?.email ? `<div>Email: ${escapeHtml(orgDetails.email)}</div>` : ""}
          ${orgDetails?.gstin ? `<div>GSTIN: ${escapeHtml(orgDetails.gstin)}</div>` : ""}
        </div>
      </div>
      <div class="meta" style="min-width:260px;">
        <div class="doc-title">${docLabel}</div>
        <div><span>${numberLabel}:</span><span>${escapeHtml(numberValue || "N/A")}</span></div>
        <div><span>${dateLabel}:</span><span>${formatDate(dateValue)}</span></div>
        <div><span>${dueLabel}:</span><span>${isReturn ? escapeHtml(dueValue) : formatDate(dueValue)}</span></div>
      </div>
    </div>

    <div class="grid2">
      <div>
        <div class="label">Bill From</div>
        <div class="small">
          <div class="b">${escapeHtml(orgDetails?.companyName || "Your Company")}</div>
          ${orgDetails?.address ? `<div>${escapeHtml(orgDetails.address)}</div>` : ""}
          ${orgDetails?.mobile ? `<div>Phone: ${escapeHtml(orgDetails.mobile)}</div>` : ""}
          ${orgDetails?.email ? `<div>Email: ${escapeHtml(orgDetails.email)}</div>` : ""}
          ${orgDetails?.gstin ? `<div>GSTIN: ${escapeHtml(orgDetails.gstin)}</div>` : ""}
        </div>
      </div>
      <div>
        <div class="label">${isPO ? "Vendor Details" : isReturn ? "Return To" : "Bill To"}</div>
        <div class="small">
          <div class="b">${escapeHtml(vendor?.name || doc.vendor?.name || "N/A")}</div>
          ${vendor?.company ? `<div>${escapeHtml(vendor.company)}</div>` : ""}
          ${vendor?.address ? `<div>${escapeHtml(getVendorAddress(vendor))}</div>` : ""}
          ${vendor?.phone ? `<div>Phone: ${escapeHtml(vendor.phone)}</div>` : ""}
          ${vendor?.email ? `<div>Email: ${escapeHtml(vendor.email)}</div>` : ""}
          ${vendor?.gstin ? `<div>GSTIN: ${escapeHtml(vendor.gstin)}</div>` : ""}
        </div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Item Details</th>
          ${!isPO ? "<th>HSN/SAC</th>" : ""}
          <th class="r">Rate (₹)</th>
          <th class="c">GST (%)</th>
          <th class="c">Qty</th>
          <th class="r">Amount (₹)</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="${colSpanBeforeQty}" class="r">Total Items: ${totalItems}</td>
          <td class="c">${totalItems}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>

    <div class="grid2">
      <div>
        <div class="label">${isPO ? "Payment Terms" : isReturn ? "Notes" : "Terms &amp; Conditions"}</div>
        ${
          isPO
            ? `<div class="terms">${escapeHtml(doc.paymentTerms || "Payment is due within the specified due date")}</div>`
            : isReturn
            ? `<div class="terms">${escapeHtml(doc.notes || "Goods returned as listed above.")}</div>`
            : `<ul class="terms">
                <li>Payment is due within the specified due date</li>
                <li>Please make checks payable to ${escapeHtml(orgDetails?.companyName || "Company Name")}</li>
                <li>Late payments may incur additional charges</li>
              </ul>`
        }
      </div>
      <div class="totals">
        <div class="totals-row"><span>Subtotal:</span><span class="mono">₹ ${money(subtotal)}</span></div>
        ${
          totalTax > 0
            ? isIntra
              ? `<div class="totals-row"><span>CGST:</span><span class="mono">₹ ${money(cgstAmount)}</span></div>
                 <div class="totals-row"><span>SGST:</span><span class="mono">₹ ${money(sgstAmount)}</span></div>`
              : `<div class="totals-row"><span>IGST:</span><span class="mono">₹ ${money(igstAmount)}</span></div>`
            : ""
        }
        ${
          Math.abs(roundOff) >= 0.005
            ? `<div class="totals-row"><span>Round Off:</span><span class="mono">${roundOff < 0 ? "-" : "+"}₹ ${money(Math.abs(roundOff))}</span></div>`
            : ""
        }
        <div class="totals-grand"><span>Grand Total:</span><span class="mono">₹ ${money(grandTotal)}</span></div>
        <div class="words"><span class="b">Amount in words:</span> ${escapeHtml(convertNumberToWords(Math.floor(grandTotal)))}</div>
      </div>
    </div>

    <div class="footer">
      <div>
        <div class="muted">Prepared By:</div>
        <div class="b small">${escapeHtml(orgDetails?.companyName || "Your Company")}</div>
      </div>
      <div style="text-align:center;">
        ${orgDetails?.signatureUrl ? `<img class="sig-img" src="${escapeHtml(orgDetails.signatureUrl)}" alt="Signature" />` : ""}
        <div class="muted">Authorized Signatory</div>
        <div class="muted b">${escapeHtml(orgDetails?.companyName || "")}</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// type: "purchase" | "purchaseOrder"
module.exports = async function purchaseDocumentPdf(doc, orgDetails, vendor, type = "purchase") {
  const html = buildHtml(doc, orgDetails, vendor, type);

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle0" });
    return await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "16px", bottom: "16px", left: "16px", right: "16px" },
    });
  } finally {
    await page.close();
  }
};
