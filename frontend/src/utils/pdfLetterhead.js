import API from "../services/api";

// The header of every list-export PDF: the organization's details on the left, its logo on the
// right, a divider, then the report title. Both halves are best-effort: if branding or the logo
// can't be loaded, the PDF still exports (with whatever is available, or the plain title layout).

const MARGIN = 14; // mm, same left/right margin the table below uses
const LOGO_MAX_W = 42;
const LOGO_MAX_H = 20;

function imageSize(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

// { branding, logo } where logo is { dataUrl, format, width, height } or null.
export async function loadLetterhead() {
  let branding = null;
  let logo = null;

  try {
    const res = await API.get("/branding");
    branding = res.data || null;
  } catch {
    branding = null;
  }

  try {
    // The server reads the logo (it lives on a CDN the browser can't read the bytes of) and returns
    // it as a data URL.
    const res = await API.get("/branding/logo-data");
    const dataUrl = res.data?.dataUrl;
    if (dataUrl) {
      const size = await imageSize(dataUrl);
      if (size && size.width > 0 && size.height > 0) {
        logo = { dataUrl, format: dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG", ...size };
      }
    }
  } catch {
    logo = null;
  }

  return { branding, logo };
}

const clean = (value) => (typeof value === "string" ? value.trim() : "");

// Draws the header on the first page of `doc` and returns where the table should start (mm).
// Without any branding or logo it draws just the title at the old position, so the PDF looks the
// same as it always did for an organization that hasn't filled in Organization Details.
export function drawLetterhead(doc, { branding, logo, title, generatedOn }) {
  const pageWidth = doc.internal.pageSize.getWidth();

  const name = clean(branding?.companyName);
  const address = [branding?.address, branding?.city, branding?.state, branding?.pincode].map(clean).filter(Boolean).join(", ");
  const contact = [
    clean(branding?.mobile) && `Mobile: ${clean(branding.mobile)}`,
    clean(branding?.email) && `Email: ${clean(branding.email)}`,
  ]
    .filter(Boolean)
    .join("   |   ");
  const gstin = clean(branding?.gstin) && `GSTIN: ${clean(branding.gstin)}`;
  const hasInfo = Boolean(name || address || contact || gstin);

  if (!hasInfo && !logo) {
    doc.setFontSize(18);
    doc.setTextColor(0);
    doc.text(title, MARGIN, 20);
    return { startY: 30 };
  }

  // ---- logo, top right, scaled to fit its box without distortion
  let logoWidth = 0;
  let logoHeight = 0;
  if (logo) {
    const scale = Math.min(LOGO_MAX_W / logo.width, LOGO_MAX_H / logo.height);
    logoWidth = logo.width * scale;
    logoHeight = logo.height * scale;
    doc.addImage(logo.dataUrl, logo.format, pageWidth - MARGIN - logoWidth, MARGIN, logoWidth, logoHeight);
  }

  // ---- organization details, top left, wrapped so they never run under the logo
  const textWidth = pageWidth - MARGIN * 2 - (logoWidth ? logoWidth + 8 : 0);
  let y = MARGIN;
  if (name) {
    doc.setFont(undefined, "bold");
    doc.setFontSize(13);
    doc.setTextColor(17, 24, 39);
    const lines = doc.splitTextToSize(name, textWidth);
    doc.text(lines, MARGIN, y + 4);
    y += lines.length * 5.6 + 0.5;
  }
  doc.setFont(undefined, "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(75, 85, 99);
  for (const text of [address, contact, gstin]) {
    if (!text) continue;
    const lines = doc.splitTextToSize(text, textWidth);
    doc.text(lines, MARGIN, y + 3);
    y += lines.length * 4 + 0.5;
  }

  const headerBottom = Math.max(y, logoHeight ? MARGIN + logoHeight : MARGIN);

  // ---- divider, then the report title (with the date it was generated on, right-aligned)
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, headerBottom + 4, pageWidth - MARGIN, headerBottom + 4);

  doc.setFont(undefined, "bold");
  doc.setFontSize(16);
  doc.setTextColor(17, 24, 39);
  doc.text(title, MARGIN, headerBottom + 13);
  if (generatedOn) {
    doc.setFont(undefined, "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(107, 114, 128);
    doc.text(`Generated on ${generatedOn}`, pageWidth - MARGIN, headerBottom + 13, { align: "right" });
  }

  doc.setFont(undefined, "normal");
  doc.setTextColor(0);
  return { startY: headerBottom + 18 };
}
