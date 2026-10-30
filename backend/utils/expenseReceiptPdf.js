const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

// The green "PAID" stamp shown under the total of a settled expense. Inlined as a data URI because
// the page is built with setContent (no base URL), so a file path would not load. A missing file
// only means the receipt renders without the stamp.
let PAID_STAMP = "";
try {
  PAID_STAMP = `data:image/png;base64,${fs.readFileSync(path.join(__dirname, "assets", "paid-logo.png")).toString("base64")}`;
} catch {
  PAID_STAMP = "";
}

/*
 * Renders one Expense / Indirect Income entry as a printable receipt PDF.
 *
 * Same server-rendered approach as purchaseDocumentPdf.js — the bytes the
 * viewer shows are the bytes the download and print produce, so a preview can
 * never disagree with the file. Kept separate from the invoice-family
 * templates because these entries have no counterparty document, no line
 * items and no tax breakdown: the letterhead is the organisation itself and
 * the body is a single amount.
 */

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

const money = (amount) =>
  (parseFloat(amount) || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatDate = (date) =>
  date
    ? new Date(date).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "N/A";

const { toWords } = require("number-to-words");

const titleCase = (text) => text.replace(/,/g, "").replace(/\b[a-z]/g, (c) => c.toUpperCase());

// "Thirteen Thousand Four Hundred Thirty-Six Rupees And Fifty-Four Paise Only"
function amountInWords(amount) {
  const total = Math.round((parseFloat(amount) || 0) * 100);
  const rupees = Math.floor(total / 100);
  const paise = total % 100;
  let words = `${titleCase(toWords(rupees))} Rupees`;
  if (paise) words += ` And ${titleCase(toWords(paise))} Paise`;
  return `${words} Only`;
}

const maskAccount = (number) => {
  const digits = String(number || "").replace(/\s/g, "");
  return digits.length > 4 ? `•••• ${digits.slice(-4)}` : digits;
};

function buildHtml(entry, orgDetails) {
  const isIncome = entry.kind === "income";
  const docLabel = isIncome ? "Income receipt" : "Expense voucher";
  const receiptNo = `${isIncome ? "INC" : "EXP"}-${String(entry._id).slice(-6).toUpperCase()}`;
  const isPaid = entry.status === "Paid";

  // Blue band like the invoice template; green when money comes in.
  const accent = isIncome ? "#059669" : "#0A74FF";
  const accentSoft = isIncome ? "#ECFDF5" : "#EFF6FF";

  const orgName = orgDetails?.companyName || "Company Name";
  const orgAddress = [orgDetails?.address, orgDetails?.city, orgDetails?.state, orgDetails?.pincode]
    .filter(Boolean)
    .join(", ");
  const orgContact = [orgDetails?.email, orgDetails?.mobile].filter(Boolean).map(escapeHtml).join(", ");

  const vendorName = entry.vendor?.companyName || entry.vendor?.name || "";
  const vendorContact = [entry.vendor?.email, entry.vendor?.phone].filter(Boolean).map(escapeHtml).join(", ");
  const isForeign = entry.currency && entry.currency !== "INR";
  const paidOn = isPaid && entry.paymentDate ? formatDate(entry.paymentDate) : "";
  const bankLine = entry.bankAccount?.bank
    ? `${entry.bankAccount.bank}${entry.bankAccount.accountNumber ? ` ${maskAccount(entry.bankAccount.accountNumber)}` : ""}`
    : "";

  const description = entry.category || "Uncategorised";
  const noteText = [entry.notes, entry.paymentNotes].filter(Boolean).join("\n");

  const meta = (label, value) =>
    value
      ? `<div class="meta-row"><span class="meta-l">${escapeHtml(label)}</span><span class="meta-v">${escapeHtml(value)}</span></div>`
      : "";

  const total = (label, value, cls = "") =>
    `<div class="tot-row ${cls}"><span>${escapeHtml(label)}</span><span>${value}</span></div>`;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; color: #0F172A;
    font-family: "Inter", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif; }
  .page { width: 210mm; min-height: 297mm; padding: 15mm 15mm 12mm; display: flex; flex-direction: column; }

  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
  .logo { max-height: 60px; max-width: 180px; object-fit: contain; }
  .org-big { font-size: 20px; font-weight: 800; letter-spacing: -.01em; line-height: 1.2; }
  .meta { width: 270px; flex-shrink: 0; }
  .meta-row { display: flex; justify-content: space-between; align-items: baseline; gap: 22px; font-size: 11.5px; padding: 8px 0; border-bottom: 1px solid #EEF2F7; }
  .meta-row:last-of-type { border-bottom: 0; }
  .meta-l { color: #94A3B8; font-weight: 600; }
  .meta-v { color: #0F172A; font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; }
  .doc-title { font-size: 22px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: ${accent}; text-align: right; margin-bottom: 10px; line-height: 1.1; }
  .stamp { margin-top: 18px; text-align: center; }
  .stamp img { width: 124px; height: 124px; object-fit: contain; }

  .parties { display: flex; justify-content: space-between; gap: 40px; margin-top: 34px; }
  .party { font-size: 11px; line-height: 1.6; max-width: 48%; }
  .party.right { text-align: right; margin-left: auto; }
  .party-h { font-size: 12.5px; font-weight: 800; margin-bottom: 7px; }
  .party-name { font-weight: 700; font-size: 11.5px; }
  .party-sub { color: #334155; }

  table { width: 100%; border-collapse: collapse; margin-top: 18px; }
  thead tr { background: ${accent}; }
  thead th { background: transparent; border: 0; color: #fff; font-size: 9.5px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; padding: 9px 12px; text-align: left; }
  thead th.r, td.r { text-align: right; }
  tbody td { font-size: 11px; padding: 12px 12px; border-bottom: 1px solid #E2E8F0; vertical-align: top; }
  .item-name { font-weight: 700; }
  .item-sub { color: #64748B; font-size: 10px; margin-top: 3px; line-height: 1.5; }

  .below { display: flex; justify-content: space-between; align-items: flex-start; gap: 40px; margin-top: 34px; }
  .notes { flex: 1; min-width: 0; }
  .notes-h { font-size: 12.5px; font-weight: 800; margin-bottom: 8px; }
  .notes-t { font-size: 10.5px; color: #334155; line-height: 1.7; white-space: pre-wrap; }
  .words { font-size: 10px; color: #64748B; font-style: italic; margin-top: 12px; line-height: 1.5; }
  .totals { width: 250px; flex-shrink: 0; }
  .tot-row { display: flex; justify-content: space-between; font-size: 11px; padding: 5px 4px; }
  .tot-row span:last-child { font-weight: 700; font-variant-numeric: tabular-nums; }
  .tot-row.fx { color: #64748B; font-size: 10px; }
  .tot-row.grand { margin-top: 12px; padding: 12px 12px; background: ${accentSoft}; font-size: 13px; font-weight: 800; }
  .tot-row.grand span:last-child { font-weight: 800; }

  .spacer { flex: 1; min-height: 24px; }
  .footer { display: flex; justify-content: space-between; padding-top: 10px; border-top: 1px solid #E2E8F0; font-size: 9.5px; color: #94A3B8; }
</style>
</head>
<body>
  <div class="page">

    <div class="top">
      <div>
        ${
          orgDetails?.logoUrl
            ? `<img class="logo" src="${escapeHtml(orgDetails.logoUrl)}" />`
            : `<div class="org-big">${escapeHtml(orgName)}</div>`
        }
      </div>
      <div class="meta">
        <div class="doc-title">${docLabel}</div>
        ${meta(isIncome ? "Receipt no." : "Voucher no.", receiptNo)}
        ${meta("Date", formatDate(entry.date))}
        ${meta(isIncome ? "Received on" : "Paid on", paidOn)}
      </div>
    </div>

    <div class="parties">
      <div class="party">
        <div class="party-h">${isIncome ? "Received By" : "Paid From"}</div>
        <div class="party-name">${escapeHtml(orgName)}</div>
        ${orgAddress ? `<div class="party-sub">${escapeHtml(orgAddress)}</div>` : ""}
        ${orgContact ? `<div class="party-sub">${orgContact}</div>` : ""}
        ${orgDetails?.gstin ? `<div class="party-sub">GSTIN: ${escapeHtml(orgDetails.gstin)}</div>` : ""}
      </div>
      ${
        vendorName
          ? `<div class="party right">
               <div class="party-h">${isIncome ? "Received From" : "Paid To"}</div>
               <div class="party-name">${escapeHtml(vendorName)}</div>
               ${vendorContact ? `<div class="party-sub">${vendorContact}</div>` : ""}
               ${entry.vendor?.gstin ? `<div class="party-sub">GSTIN: ${escapeHtml(entry.vendor.gstin)}</div>` : ""}
             </div>`
          : ""
      }
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:46%">Description</th>
          <th>Mode</th>
          <th>Date</th>
          <th class="r">Amount, INR</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <div class="item-name">${escapeHtml(description)}</div>
            ${bankLine ? `<div class="item-sub">${escapeHtml(bankLine)}</div>` : ""}
          </td>
          <td>${escapeHtml(entry.paymentType || "—")}</td>
          <td>${formatDate(entry.date)}</td>
          <td class="r">${money(entry.amount)}</td>
        </tr>
      </tbody>
    </table>

    <div class="below">
      <div class="notes">
        <div class="notes-h">Payment instructions or other notes</div>
        <div class="notes-t">${noteText ? escapeHtml(noteText) : "&mdash;"}</div>
        <div class="words">${escapeHtml(amountInWords(entry.amount))}</div>
      </div>
      <div class="totals">
        ${total("Subtotal", `&#8377; ${money(entry.amount)}`)}
        ${
          isForeign
            ? total(
                `${escapeHtml(entry.currency)} ${money(entry.foreignAmount)}`,
                `@ ${escapeHtml(String(entry.exchangeRate || 1))}`,
                "fx"
              )
            : ""
        }
        ${total("Total", `&#8377; ${money(entry.amount)}`, "grand")}
        ${isPaid && !isIncome && PAID_STAMP ? `<div class="stamp"><img src="${PAID_STAMP}" alt="Paid" /></div>` : ""}
      </div>
    </div>

    <div class="spacer"></div>

    <div class="footer">
      <span>This is a computer generated ${isIncome ? "receipt" : "voucher"}.</span>
      <span>${receiptNo} &nbsp;&middot;&nbsp; Generated on ${formatDate(new Date())}</span>
    </div>

  </div>
</body>
</html>`;
}

module.exports = async function expenseReceiptPdf(entry, orgDetails) {
  const html = buildHtml(entry, orgDetails);

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle0" });
    return await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
    });
  } finally {
    await page.close();
  }
};
