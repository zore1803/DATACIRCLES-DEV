export const blurb = "Airy, blue-accented sans-serif template with a logo-forward header.";

export const css = `
.dcsheet.t-Modern {
  --accent: #0b5ed7;
  --line: #dcdcdc;
  --ink: #111;
  --muted: #555;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 10.5px;
  padding: 24px;
}
.dcsheet.t-Modern .dc-header { display: flex; justify-content: space-between; align-items: flex-start; border: 0; padding-bottom: 12px; }
.dcsheet.t-Modern .dc-title { color: var(--accent); font-size: 13px; font-weight: bold; letter-spacing: 2px; }
.dcsheet.t-Modern .dc-subtitle { color: var(--muted); font-weight: normal; font-size: 8.5px; text-transform: uppercase; letter-spacing: .5px; text-align: right; }
.dcsheet.t-Modern .dc-logo { max-width: 150px; max-height: 60px; object-fit: contain; display: block; margin-left: auto; margin-top: 6px; }
.dcsheet.t-Modern .dc-company { font-size: 16px; font-weight: bold; margin-top: 8px; margin-bottom: 3px; }
.dcsheet.t-Modern .dc-gstin { font-size: 9.5px; margin-top: 2px; }
.dcsheet.t-Modern .dc-addr { font-size: 9.5px; color: var(--ink); max-width: 340px; white-space: pre-line; margin-top: 3px; }
.dcsheet.t-Modern .dc-contact { font-size: 9.5px; margin-top: 4px; }

.dcsheet.t-Modern .dc-inv-row { display: flex; gap: 40px; margin-top: 14px; font-size: 9.5px; }
.dcsheet.t-Modern .dc-inv-row b { font-weight: bold; margin-right: 3px; }
.dcsheet.t-Modern .dc-cust-row { display: flex; gap: 28px; margin-top: 12px; }
.dcsheet.t-Modern .dc-cust-col { flex: 1; }
.dcsheet.t-Modern .dc-cust-col .dc-label { font-weight: bold; margin-bottom: 3px; font-size: 9.5px; }
.dcsheet.t-Modern .dc-cust-col > div { margin-bottom: 2px; font-size: 9.5px; }
.dcsheet.t-Modern .dc-cust-name { font-weight: bold; }
.dcsheet.t-Modern .dc-pos-row { margin-top: 10px; font-size: 9.5px; }
.dcsheet.t-Modern .dc-pos-row b { font-weight: bold; }

.dcsheet.t-Modern .dc-items { border: 0; border-top: 1px solid var(--ink); font-size: 9.5px; margin-top: 14px; width: 100%; border-collapse: collapse; }
.dcsheet.t-Modern .dc-items th { border: 0; border-bottom: 1px solid var(--ink); padding: 6px 4px; font-weight: bold; text-align: left; }
.dcsheet.t-Modern .dc-items th.r, .dcsheet.t-Modern .dc-items td.r { text-align: right; }
.dcsheet.t-Modern .dc-items td { border: 0; border-bottom: 1px solid var(--line); padding: 8px 4px; vertical-align: top; }
.dcsheet.t-Modern .dc-item-name { font-weight: bold; }
.dcsheet.t-Modern .dc-item-hsn { font-size: 8.5px; color: var(--muted); margin-top: 2px; }
.dcsheet.t-Modern .dc-item-desc { font-size: 9px; color: var(--muted); white-space: pre-line; margin-top: 3px; }

.dcsheet.t-Modern .dc-totals { display: block; border: 0; margin-top: 10px; }
.dcsheet.t-Modern .dc-totals-right { padding: 0; max-width: 260px; margin-left: auto; }
.dcsheet.t-Modern .dc-trow { display: flex; justify-content: space-between; padding: 2px 0; }
.dcsheet.t-Modern .dc-grand { display: flex; justify-content: space-between; border-top: 1px solid var(--ink); margin-top: 4px; padding-top: 6px; font-size: 16px; font-weight: bold; }

.dcsheet.t-Modern .dc-totals-words { margin-top: 12px; border-top: 1px solid var(--ink); padding-top: 10px; display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.dcsheet.t-Modern .dc-payable { font-size: 12px; text-align: right; min-width: 240px; }
.dcsheet.t-Modern .dc-payable span:first-child { font-weight: normal; font-size: 11px; margin-right: 24px; color: var(--muted); }
.dcsheet.t-Modern .dc-payable span:last-child { font-weight: bold; }

.dcsheet.t-Modern .dc-footer-row { display: flex; align-items: flex-start; margin-top: 20px; gap: 22px; }
.dcsheet.t-Modern .dc-upi-block { text-align: left; padding-left: 10px; }
.dcsheet.t-Modern .dc-sign { margin-left: auto; }
.dcsheet.t-Modern .dc-upi-cap { font-weight: bold; font-size: 9.5px; margin-bottom: 4px; }
.dcsheet.t-Modern .dc-qr-img svg { width: 78px; height: 78px; display: block; }
.dcsheet.t-Modern .dc-bank { margin-top: 18px; }
.dcsheet.t-Modern .dc-bank .dc-label { font-weight: bold; margin-bottom: 3px; }
.dcsheet.t-Modern .dc-bank > div { margin-bottom: 2px; font-size: 9.5px; }
.dcsheet.t-Modern .dc-sign { text-align: right; }
.dcsheet.t-Modern .dc-sign-img { max-height: 44px; margin-left: auto; object-fit: contain; display: block; }
.dcsheet.t-Modern .dc-sign-line { margin-top: 4px; font-size: 9px; }

.dcsheet.t-Modern .dc-notes-row { margin-top: 20px; font-size: 9.5px; }
.dcsheet.t-Modern .dc-notes-row .dc-label { font-weight: bold; margin-bottom: 3px; }
.dcsheet.t-Modern .dc-terms { font-size: 8.5px; margin-top: 10px; white-space: pre-line; }

/* Footer ("Page 1 / 1 …") is bottom-pinned by the shared BASE_CSS rule. */
`;

export function html(ctx) {
  const {
    t, doc, org, bank, esc, fmt, formatDate,
    dealName, docLabel, docNumber, notes, terms, copySubtitle,
    payQrSvg, upiId,
  } = ctx;
  const sigImg = doc.signature || org.signatureUrl;

  // Same address formatter used in Professional.js / Landscape.js — these
  // templates share the same input form, so addresses arrive in the same
  // shape (a plain string for org.address, a structured object for
  // doc.billingAddress / doc.shippingAddress).
  const addrLines = (input, singleLine = false) => {
    let raw;
    if (typeof input === "string") {
      raw = input;
    } else if (input && typeof input === "object") {
      const cityStatePin = [input.city, input.state, input.pincode]
        .filter((v) => v && String(v).trim())
        .join(", ");
      raw = [input.addressLine1, input.addressLine2, cityStatePin, input.country]
        .filter((v) => v && String(v).trim())
        .join(", ");
    } else {
      raw = "";
    }
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    const joinStr = singleLine ? " " : "\n";
    return parts.map((p, i) => (i < parts.length - 1 ? p + "," : p)).join(joinStr);
  };

  // Single merged tax cell per row — same principle as Professional/Service:
  // one "Tax Amount" column (amount + combined rate) instead of separate
  // CGST/SGST columns.
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
          ${r.description ? `<div class="dc-item-desc">${esc(r.description)}</div>` : ""}
        </td>
        <td class="r">${fmt(r.rate)}</td>
        <td class="r">${r.qty}</td>
        <td class="r">${fmt(r.taxable)}</td>
        ${t.isTax ? `<td class="r">${rowTax(r)}</td>` : ""}
        <td class="r">${fmt(r.amount)}</td>
      </tr>`
      )
      .join("")
    : `<tr><td colspan="${t.isTax ? 7 : 6}">&nbsp;</td></tr>`;

  const taxTotalRow = !t.isTax
    ? ""
    : t.isInterState
      ? `<div class="dc-trow"><span>IGST ${doc.gstRate ? doc.gstRate.toFixed(1) : (t.rows[0]?.igstRate || 18).toFixed(1)}%</span><span>&#8377;${fmt(t.totalIGST)}</span></div>`
      : `<div class="dc-trow"><span>GST</span><span>&#8377;${fmt(t.totalCGST + t.totalSGST)}</span></div>`;

  const discountRow =
    t.documentDiscount > 0
      ? `<div class="dc-trow"><span>Discount${t.discountType === "percentage" ? ` (${t.discountValue}%)` : ""}</span><span>&#8377;${fmt(t.documentDiscount)}</span></div>`
      : "";

  const qrBlock = `<div class="dc-upi-block">
          <div class="dc-upi-cap">Pay using UPI:</div>
          <div class="dc-qr-img">${payQrSvg}</div>
        </div>`;

  return `
  <div class="dc-header">
    <div>
      <div class="dc-title">${t.isTax ? "TAX " + esc(docLabel).toUpperCase() : esc(docLabel).toUpperCase()}</div>
      <div class="dc-company">${esc(org.companyName || "Your Company")}</div>
      <div class="dc-gstin">GSTIN: ${esc(org.gstin || "—")}</div>
      <div class="dc-addr">${esc(addrLines(org.address))}</div>
      <div class="dc-contact">Mobile: ${esc(org.mobile || org.phone || "—")}&nbsp;&nbsp;&nbsp;Email: ${esc(org.email || "—")}</div>
    </div>
    <div style="text-align:right;">
      <div class="dc-subtitle">${copySubtitle}</div>
      ${org.logoUrl ? `<img class="dc-logo" src="${esc(org.logoUrl)}" />` : ""}
    </div>
  </div>

  <div class="dc-inv-row">
    <div><b>Invoice #:</b>${esc(docNumber || "—")}</div>
    <div><b>Invoice Date:</b>${esc(formatDate(doc.date) || "—")}</div>
    <div><b>Due Date:</b>${esc(formatDate(doc.dueDate) || "—")}</div>
  </div>

  <div class="dc-cust-row">
    <div class="dc-cust-col">
      <div class="dc-label">Customer Details:</div>
      <div class="dc-cust-name">${esc(dealName)}</div>
      ${doc.receiverPhone ? `<div>Ph: ${esc(doc.receiverPhone)}</div>` : ""}
    </div>
    <div class="dc-cust-col">
      <div class="dc-label">Billing address:</div>
      <div>${esc(addrLines(doc.billingAddress, true))}</div>
    </div>
    <div class="dc-cust-col">
      <div class="dc-label">Shipping address:</div>
      <div>${esc(addrLines(doc.shippingAddress || doc.billingAddress, true))}</div>
    </div>
  </div>

  <div class="dc-pos-row"><b>Place of Supply:</b> ${esc(doc.placeOfSupply || "—")}</div>

  <table class="dc-items">
    <thead>
      <tr>
        <th style="width:24px;">#</th>
        <th>Item</th>
        <th class="r" style="width:70px;">Rate/Item</th>
        <th class="r" style="width:50px;">Qty</th>
        <th class="r" style="width:80px;">Taxable Value</th>
        ${t.isTax ? `<th class="r" style="width:90px;">Tax Amount</th>` : ""}
        <th class="r" style="width:90px;">Amount</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <div class="dc-totals">
    <div class="dc-totals-right">
      <div class="dc-trow"><span>Taxable Amount</span><span>&#8377;${fmt(t.grossTaxable)}</span></div>
      ${discountRow}
      ${taxTotalRow}
      <div class="dc-grand"><span>Total</span><span>&#8377;${fmt(t.grandTotal)}</span></div>
    </div>
  </div>

  <div class="dc-totals-words">
    <div style="font-size:9px;color:var(--muted);">
      <div style="margin-bottom:3px;">Total Items / Qty : ${t.rows.length} / ${t.totalQty}</div>
      <div>Total amount (in words): INR ${esc(t.amountInWords)}</div>
    </div>
    ${t.isPartiallyPaid
      ? `<div class="dc-payable" style="flex-direction:column;align-items:flex-end;gap:2px;">
      <span style="font-size:9px;color:var(--muted);font-weight:normal;">Paid &#8377;${fmt(t.amountPaid)} of &#8377;${fmt(t.grandTotal)}</span>
      <span style="display:flex;gap:8px;"><span>Balance Due:</span><span>&#8377;${fmt(t.balanceDue)}</span></span>
    </div>`
      : `<div class="dc-payable"><span>Amount Payable:</span><span>&#8377;${fmt(t.grandTotal)}</span></div>`}
  </div>

  <div class="dc-footer-row">
    ${qrBlock}
    <div class="dc-bank">
      <div class="dc-label">Bank Details:</div>
      <div>Bank: ${esc(bank.bank || "—")}</div>
      <div>Account #: ${esc(bank.accountNumber || "—")}</div>
      <div>IFSC: ${esc(bank.ifscCode || "—")}</div>
      <div>Branch: ${esc(bank.branch || "—")}</div>
    </div>
    <div class="dc-sign">
      <div style="font-weight:bold;margin-bottom:4px;">For ${esc(org.companyName || "Your Company")}</div>
      ${sigImg ? `<img class="dc-sign-img" src="${esc(sigImg)}" />` : `<div style="height:44px;"></div>`}
      <div class="dc-sign-line">Authorized Signatory</div>
    </div>
  </div>

  <div class="dc-notes-row">
    ${notes ? `<div class="dc-label">Notes:</div><div>${notes}</div>` : ""}
    ${terms ? `<div class="dc-label" style="margin-top:10px;">Terms and Conditions:</div><div class="dc-terms">${terms}</div>` : ""}
  </div>

  `;
}