const puppeteer = require("puppeteer");
const qrcode = require("qrcode-generator");
const { getTemplatesForOrg } = require("../controllers/documentTemplateSettingsController");

/*
 * Prints an accounting document to PDF by rendering the *same* markup the
 * on-screen live preview uses and letting headless Chrome lay it out.
 *
 * The markup, styling and arithmetic all come from shared/documentTemplates.js,
 * which the frontend preview imports too — so the downloaded/emailed PDF cannot
 * drift away from what the user approved on screen. This replaced a set of
 * PDFKit generators that positioned every line at hardcoded coordinates and
 * fell apart whenever content was longer than assumed.
 */

// The shared templates are ESM and this file is CommonJS, so it's pulled in
// with a dynamic import and cached after the first call.
let templatesPromise = null;
function loadTemplates() {
  if (!templatesPromise) {
    templatesPromise = import("../../shared/documentTemplates.js");
  }
  return templatesPromise;
}

// One Chromium instance is reused across requests — launching it per PDF costs
// ~1s and tens of MB. Re-launch if it died so a crashed browser doesn't
// permanently break downloads.
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

/*
 * The template is an organization-wide choice made in the Template drawer and
 * applies to every document of that type — including ones saved earlier, which
 * may still carry a legacy `style` field. That stored value is deliberately
 * ignored so changing the template restyles the whole set at once.
 */
async function resolveTemplate(doc, organization, DEFAULT_TEMPLATE, type) {
  if (doc?.style) return doc.style;
  if (!organization) return DEFAULT_TEMPLATE;
  try {
    const templates = await getTemplatesForOrg(organization);
    return templates?.[type] || DEFAULT_TEMPLATE;
  } catch {
    return DEFAULT_TEMPLATE;
  }
}

/*
 * Encodes the document's UPI pay link as an inline SVG QR.
 *
 * Error correction 'M' with a 1-module quiet zone: the link is short, and M
 * keeps the modules large enough to scan reliably off a printed page. SVG
 * rather than a raster so it stays sharp at print resolution.
 */
function renderUpiQr(buildUpiUri, doc, options) {
  const uri = buildUpiUri(doc, options);
  if (!uri) return "";
  try {
    const qr = qrcode(0, "M");
    qr.addData(uri);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 1, scalable: true });
  } catch (err) {
    // A missing QR shouldn't cost the customer their invoice.
    console.error("UPI QR generation failed:", err.message);
    return "";
  }
}

module.exports = async function htmlDocumentPdf(
  doc,
  bankDetails,
  orgDetails,
  type = "tax",
  copyType = "original"
) {
  const { buildDocumentHtml, DEFAULT_TEMPLATE, buildUpiUri } = await loadTemplates();

  const template = await resolveTemplate(
    doc,
    doc?.organization || orgDetails?.organization,
    DEFAULT_TEMPLATE,
    type
  );

  const fragment = buildDocumentHtml(doc, {
    type,
    template,
    orgDetails,
    bankDetails,
    upiQrSvg: renderUpiQr(buildUpiUri, doc, { type, orgDetails, upiId: bankDetails?.upi }),
    upiId: bankDetails?.upi,
    copyType,
  });

  // A4 at 96dpi is 794px wide; with the 16px page margins the content box is
  // ~762px, which matches the preview sheet's design width so the two render
  // at the same proportions.
  const html = `<!doctype html>
<html>
<head><meta charset="utf-8" />
<style>
  html, body { margin: 0; padding: 0; }
  /* Cap the sheet to the printable area (A4 minus the 16px top/bottom PDF
     margins) so the bottom-pinned "Page 1 / 1 …" line stays on page 1 instead
     of tipping onto a second page. Only the vertical padding is zeroed —
     page.pdf()'s own margin below covers top/bottom; left/right stay at
     "0" there, so the sheet's horizontal padding is the ONLY thing giving
     the content a left/right margin. Zeroing it too (as this used to)
     pinned the content flush to both page edges. */
  .dcsheet { padding: 0 20px !important; min-height: calc(297mm - 34px) !important; }
  .dcsheet.t-Landscape { min-height: calc(210mm - 34px) !important; }
</style>
</head>
<body class="is-pdf">${fragment}</body>
</html>`;

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle0" });
    return await page.pdf({
      format: "A4",
      landscape: template === "Landscape",
      printBackground: true,
      // No Puppeteer header/footer: each template already prints its own
      // bottom-pinned "Page 1 / 1  This is a digitally signed document." line,
      // and the browser footer duplicated a page number on the right edge.
      displayHeaderFooter: false,
      margin: { top: "16px", bottom: "16px", left: "0", right: "0" },
    });
  } finally {
    await page.close();
  }
};