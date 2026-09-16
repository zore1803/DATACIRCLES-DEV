export const blurb = "Clean header with blue accent bar and a dedicated details section.";

export const css = `
.dcsheet.t-Professional {
  --accent: #2f6fed;
  --line: #e0e0e0;
  --muted: #666;
  --tint: #eef3fd;
  --pad: 12px;
  font-family: Arial, Helvetica, sans-serif;
  padding: 0 !important;
  margin: 0 !important;
  max-width: 100% !important;
}
.dcsheet.t-Professional .dc-header { border-top: 8px solid var(--accent); padding: 20px 24px 10px; margin: 0; display: flex; justify-content: space-between; align-items: flex-start; }
.dcsheet.t-Professional .dc-logo { max-height: 54px; max-width: 170px; object-fit: contain; margin-bottom: 10px; display: block; }
.dcsheet.t-Professional .dc-title { color: #111; letter-spacing: 1px; font-size: 16px; font-weight: bold; text-align: right; }
.dcsheet.t-Professional .dc-subtitle { color: var(--muted); font-size: 9px; margin-top: 4px; letter-spacing: 1px; text-align: right; }
.dcsheet.t-Professional .dc-company { font-size: 15px; font-weight: bold; margin-bottom: 4px; }
.dcsheet.t-Professional .dc-addr { max-width: 280px; font-size: 10px; color: #333; white-space: pre-line; }
.dcsheet.t-Professional .dc-gstin { font-size: 10px; margin-top: 6px; font-weight: bold; }
.dcsheet.t-Professional .dc-org-contact { margin-top: 12px; display: grid; grid-template-columns: auto auto; gap: 3px 14px; font-size: 10px; justify-content: start; }
.dcsheet.t-Professional .dc-org-contact > div:nth-child(odd) { font-weight: bold; text-align: left; }
.dcsheet.t-Professional .dc-org-contact > div:nth-child(even) { text-align: left; }

.dcsheet.t-Professional .dc-prof-meta { display: flex; background: #f7f8fa; border-radius: 6px; margin: 10px 24px; padding: 16px; gap: 16px; }
.dcsheet.t-Professional .dc-prof-meta > div { flex: 1; }
.dcsheet.t-Professional .dc-prof-meta .dc-label { color: var(--muted); font-weight: normal; font-size: 10px; margin-bottom: 6px; }
.dcsheet.t-Professional .dc-prof-name { font-weight: bold; font-size: 12px; margin-bottom: 4px; }
.dcsheet.t-Professional .dc-prof-line { font-size: 10px; margin-top: 1px; }
.dcsheet.t-Professional .dc-prof-grid { display: grid; grid-template-columns: auto 1fr; gap: 4px 16px; font-size: 10px; }

.dcsheet.t-Professional .dc-items { border: 0; margin: 16px 24px 0; width: calc(100% - 48px); }
.dcsheet.t-Professional .dc-items th { background: var(--tint); border: 0; border-bottom: 1px solid var(--line); color: var(--muted); text-transform: uppercase; font-size: 9px; padding: 6px 4px; text-align: left; }
.dcsheet.t-Professional .dc-items th.r, .dcsheet.t-Professional .dc-items td.r { text-align: right; }
.dcsheet.t-Professional .dc-items td { border: 0; border-bottom: 1px solid var(--line); padding: 8px 4px; vertical-align: top; }
.dcsheet.t-Professional .dc-items tbody tr:nth-child(even) td { background: var(--tint); }
.dcsheet.t-Professional .dc-item-name { font-weight: bold; }
.dcsheet.t-Professional .dc-item-hsn { font-size: 9px; color: var(--muted); margin-top: 2px; }

.dcsheet.t-Professional .dc-totals-wrap { margin: 10px 24px; }
.dcsheet.t-Professional .dc-totals-right { max-width: 300px; margin-left: auto; }
.dcsheet.t-Professional .dc-trow { display: flex; justify-content: space-between; padding: 5px 8px; }
.dcsheet.t-Professional .dc-trow.tint { background: var(--tint); }
.dcsheet.t-Professional .dc-grand { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #111; margin-top: 4px; padding: 8px 8px 4px; font-size: 14px; color: #111; }
.dcsheet.t-Professional .dc-grand span:first-child { font-weight: normal; }
.dcsheet.t-Professional .dc-grand span:last-child { font-weight: bold; }
.dcsheet.t-Professional .dc-payable { display: flex; justify-content: space-between; padding: 4px 8px 0; font-weight: bold; }
.dcsheet.t-Professional .dc-note-row { font-size: 10px; color: var(--muted); margin-top: 12px; border-top: 1px solid var(--line); padding-top: 8px; display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }

.dcsheet.t-Professional .dc-footer { display: block; border: 0; margin: 20px 24px 0; }
/* Bank details, the pay QR and the signature sit on one row, top-aligned. */
.dcsheet.t-Professional .dc-pay-row { display: flex; align-items: center; justify-content: space-between; gap: 24px; }
.dcsheet.t-Professional .dc-bank { font-size: 12px; font-weight: bold; flex: 0 1 auto; min-width: 0; }
.dcsheet.t-Professional .dc-bank .dc-label { font-weight: bold; margin-bottom: 4px; }
.dcsheet.t-Professional .dc-bank-grid { display: grid; grid-template-columns: auto 1fr; gap: 2px 12px; }
.dcsheet.t-Professional .dc-pay-row .dc-pay-qr { float: none; flex-shrink: 0; margin: 14px 0 0; text-align: center; }
.dcsheet.t-Professional .dc-pay-row .dc-pay-qr svg { width: 78px; height: 78px; }
.dcsheet.t-Professional .dc-notes-block { font-size: 10px; margin-top: 16px; }
.dcsheet.t-Professional .dc-notes-block .dc-label { font-weight: bold; margin-bottom: 4px; }
.dcsheet.t-Professional .dc-notes-body { white-space: pre-line; color: #333; }
.dcsheet.t-Professional .dc-sign { flex-shrink: 0; padding: 0; margin-top: 14px; text-align: center; }
.dcsheet.t-Professional .dc-sign-img { max-height: 40px; margin: 0 auto; object-fit: contain; display: block; }
.dcsheet.t-Professional .dc-sign-line { border-top: 1px solid var(--line); margin-top: 4px; padding-top: 4px; font-size: 9px; }
.dcsheet.t-Professional .dc-page-footer { margin: auto 24px 28px; padding-top: 24px; font-size: 8.5px; color: var(--muted); text-align: left; }
@media print {
  @page {
    size: A4;
    margin: 0;
  }
  html, body {
    margin: 0;
    padding: 0;
  }
  .dcsheet.t-Professional {
    width: 100%;
    min-height: 100%;
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  .dc-header, .dc-items, .dc-totals-wrap, .dc-footer {
    page-break-inside: avoid;
  }
}
`;

export function html(ctx) {
  const {
    t, doc, org, bank, esc, fmt, formatDate, formatPostalAddress,
    dealName, docLabel, docNumber, notes, terms, copySubtitle, payQrSvg,
  } = ctx;

  const sigImg = doc.signature || org.signatureUrl;

  // Formats an address — either a plain comma-separated string (org.address)
  // or a structured object (doc.billingAddress/shippingAddress, shaped like
  // { addressLine1, addressLine2, city, state, pincode, country }) — as one
  // line per comma-separated segment, keeping the comma at the end of each
  // line except the last.
  const addrLines = (input) => {
    let raw;
    if (typeof input === "string") {
      raw = input;
    } else if (input && typeof input === "object") {
      const city = input.city;
      const statePin = [input.state, input.pincode]
        .filter((v) => v && String(v).trim())
        .join(" ");
      const cityStatePin = [city, statePin]
        .filter((v) => v && String(v).trim())
        .join(", ");
      raw = [input.addressLine1, input.addressLine2, cityStatePin, input.country]
        .filter((v) => v && String(v).trim())
        .join(", ");
    } else {
      raw = "";
    }
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    return parts.map((p, i) => (i < parts.length - 1 ? p + "," : p)).join("\n");
  };

  // Single merged tax cell per row — combined amount + combined rate,
  // matching the reference's one "Tax Amount" column (no CGST/SGST split).
  const rowTax = (r) => {
    const amt = (r.cgst || 0) + (r.sgst || 0) + (r.igst || 0);
    const rate = (r.cgstRate || 0) + (r.sgstRate || 0) + (r.igstRate || 0);
    return amt > 0 ? `${fmt(amt)} (${rate}%)` : fmt(amt);
  };

  const itemRows = t.rows.length
    ? t.rows
      .map(
        (r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>
          <div class="dc-item-name">${esc(r.name) || "&mdash;"}</div>
          ${r.hsn ? `<div class="dc-item-hsn">HSN: ${esc(r.hsn)}</div>` : ""}
        </td>
        <td class="r">${r.qty}</td>
        <td class="r">${fmt(r.rate)}</td>
        ${t.isTax ? `<td class="r">${rowTax(r)}</td>` : ""}
        <td class="r">${fmt(r.amount)}</td>
      </tr>`
      )
      .join("")
    : `<tr><td colspan="${t.isTax ? 6 : 5}">&nbsp;</td></tr>`;

  // Single merged tax line in the totals box — same principle as the item
  // column: interstate shows "IGST x%", intrastate shows a combined "GST"
  // line (CGST+SGST summed) rather than two separate rows.
  const taxTotalRow = !t.isTax
    ? ""
    : t.isInterState
      ? `<div class="dc-trow tint"><span class="dc-label">IGST ${doc.gstRate ? doc.gstRate.toFixed(1) : (t.rows[0]?.igstRate || 18).toFixed(1)}%</span><span>&#8377;${fmt(t.totalIGST)}</span></div>`
      : `<div class="dc-trow tint"><span class="dc-label">GST</span><span>&#8377;${fmt(t.totalCGST + t.totalSGST)}</span></div>`;

  const discountRow =
    t.documentDiscount > 0
      ? `<div class="dc-trow"><span class="dc-label">Total Discount${t.discountType === "percentage" ? ` (${t.discountValue}%)` : ""}</span><span>&#8377;${fmt(t.documentDiscount)}</span></div>`
      : "";

  return `
  <div class="dc-header">
    <div style="text-align:left;">
      ${org.logoUrl ? `<img class="dc-logo" src="${esc(org.logoUrl)}" />` : ""}
      <div class="dc-company">${esc(org.companyName || "Your Company")}</div>
      <div class="dc-addr" style="white-space:pre-line;">${esc(addrLines(org.address))}</div>
      <div class="dc-gstin">GSTIN: ${esc(org.gstin || "—")}</div>
    </div>
    <div>
      <div class="dc-title">${t.isTax ? "Tax " : ""}${esc(docLabel)}</div>
      <div class="dc-subtitle">${copySubtitle}</div>
      <div class="dc-org-contact">
        ${(org.mobile || org.phone) ? `<div>Phone</div><div>${esc(org.mobile || org.phone)}</div>` : ""}
        ${org.email ? `<div>Email</div><div>${esc(org.email)}</div>` : ""}
        ${org.website ? `<div>Website</div><div>${esc(org.website)}</div>` : ""}
      </div>
    </div>
  </div>
 
  <div class="dc-prof-meta">
    <div>
      <div class="dc-label">Bill to</div>
      <div class="dc-prof-name">${esc(dealName)}</div>
      ${doc.receiverGSTIN ? `<div class="dc-prof-line">GSTIN: ${esc(doc.receiverGSTIN)}</div>` : ""}
      ${doc.receiverPhone ? `<div class="dc-prof-line">Ph: ${esc(doc.receiverPhone)}</div>` : ""}
      ${doc.receiverEmail ? `<div class="dc-prof-line">${esc(doc.receiverEmail)}</div>` : ""}
      <div style="white-space:pre-line;font-size:10px;margin-top:6px;">${esc(addrLines(doc.billingAddress))}</div>
    </div>
    <div>
      <div class="dc-label">Ship to</div>
      <div class="dc-prof-name">${esc(dealName)}</div>
      ${doc.receiverGSTIN ? `<div class="dc-prof-line">GSTIN: ${esc(doc.receiverGSTIN)}</div>` : ""}
      <div style="white-space:pre-line;font-size:10px;margin-top:6px;">${esc(addrLines(doc.shippingAddress || doc.billingAddress))}</div>
    </div>
    <div>
      <div class="dc-label">Details</div>
      <div class="dc-prof-grid">
        <div>Invoice #:</div><div style="font-weight:bold;">${esc(docNumber || "—")}</div>
        <div>Invoice Date</div><div style="font-weight:bold;">${esc(formatDate(doc.date) || "—")}</div>
        <div>Due Date</div><div style="font-weight:bold;">${esc(formatDate(doc.dueDate) || "—")}</div>
        <div>Place of Supply:</div><div style="font-weight:bold;">${esc(doc.placeOfSupply || "—")}</div>
      </div>
    </div>
  </div>
 
  <table class="dc-items">
    <thead>
      <tr>
        <th style="width:24px;">#</th>
        <th>Item</th>
        <th class="r" style="width:50px;">Qty</th>
        <th class="r" style="width:80px;">Rate / Item</th>
        ${t.isTax ? `<th class="r" style="width:90px;">Tax Amount</th>` : ""}
        <th class="r" style="width:90px;">Amount</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>
 
  <div class="dc-totals-wrap">
    <div class="dc-totals-right">
      <div class="dc-trow tint"><span class="dc-label">Taxable Amount</span><span>&#8377;${fmt(t.grossTaxable)}</span></div>
      ${taxTotalRow}
      <div class="dc-grand"><span>Total</span><span>&#8377;${fmt(t.grandTotal)}</span></div>
      ${discountRow}
      ${t.isPartiallyPaid
        ? `<div class="dc-trow"><span class="dc-label">Amount Paid</span><span>&#8377;${fmt(t.amountPaid)}</span></div>`
        : ""}
      <div class="dc-payable"><span>${t.isPartiallyPaid ? "Balance Due:" : "Amount Payable:"}</span><span>&#8377;${fmt(t.isPartiallyPaid ? t.balanceDue : t.grandTotal)}</span></div>
    </div>
    <div class="dc-note-row">
      <div>Total Items / Qty : ${t.rows.length} /${t.totalQty}</div>
      <div style="text-align:right;">Total amount (in words): INR ${esc(t.amountInWords)}</div>
    </div>
  </div>
 
  <div class="dc-footer">
    <div class="dc-pay-row">
      <div class="dc-bank">
        <div class="dc-label">Bank Details</div>
        <div class="dc-bank-grid">
          <div style="color:var(--muted);">Bank:</div><div>${esc(bank.bank || "—")}</div>
          <div style="color:var(--muted);">Account Holder:</div><div>${esc(bank.accountHolder || org.companyName || "—")}</div>
          <div style="color:var(--muted);">Account #:</div><div>${esc(bank.accountNumber || "—")}</div>
          <div style="color:var(--muted);">IFSC Code:</div><div>${esc(bank.ifscCode || "—")}</div>
          <div style="color:var(--muted);">Branch:</div><div>${esc(bank.branch || "—")}</div>
        </div>
      </div>
      <div class="dc-pay-qr">${payQrSvg}<div class="dc-pay-qr-cap">Scan to pay</div></div>
      <div class="dc-sign">
        <div style="display: inline-block; text-align: center; min-width: 150px;">
          <div style="font-weight:normal;margin-bottom:6px;">For ${esc(org.companyName || "Your Company")}</div>
          ${sigImg ? `<img class="dc-sign-img" src="${esc(sigImg)}" />` : `<div style="height:40px;"></div>`}
          <div class="dc-sign-line">Authorized Signatory</div>
        </div>
      </div>
    </div>
    ${notes ? `<div class="dc-notes-block"><div class="dc-label">Notes</div><div class="dc-notes-body">${notes}</div></div>` : ""}
    ${terms ? `<div class="dc-notes-block"><div class="dc-label">Terms and Conditions</div><div class="dc-notes-body">${terms}</div></div>` : ""}
  </div>



  `;
}