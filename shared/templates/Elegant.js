export const blurb = "Serif type with a centred masthead and double-rule dividers.";

export const css = `
.dcsheet.t-Elegant {
  --ink: #23201b; --muted: #6b6355; --accent: #7a5c2e; --line: #c9bca4; --wash: #f7f3ea;
  font-family: Georgia, "Times New Roman", serif; font-size: 10.5px; color: var(--ink);
  padding: 40px 46px; line-height: 1.5;
}
.dcsheet.t-Elegant .eg-mast { text-align: center; }
.dcsheet.t-Elegant .eg-logo { max-height: 52px; object-fit: contain; margin: 0 auto 6px; display: block; }
.dcsheet.t-Elegant .eg-org { font-size: 24px; letter-spacing: 2px; }
.dcsheet.t-Elegant .eg-org-sub { color: var(--muted); font-size: 9.5px; margin-top: 3px; }
.dcsheet.t-Elegant .eg-double { border-top: 3px double var(--accent); margin: 16px 0; }
.dcsheet.t-Elegant .eg-single { border-top: 1px solid var(--line); margin: 14px 0; }
.dcsheet.t-Elegant .eg-doc { text-align: center; color: var(--accent); font-size: 15px; letter-spacing: 5px; text-transform: uppercase; }
.dcsheet.t-Elegant .eg-copy { text-align: center; font-style: italic; color: var(--muted); font-size: 9px; letter-spacing: 1px; margin-top: 2px; }
.dcsheet.t-Elegant .eg-info { display: flex; justify-content: space-between; gap: 30px; margin-top: 16px; }
.dcsheet.t-Elegant .eg-k { text-transform: uppercase; letter-spacing: 1.5px; font-size: 8px; color: var(--accent); margin-bottom: 4px; }
.dcsheet.t-Elegant .eg-party-name { font-size: 12px; }
.dcsheet.t-Elegant .eg-addr { white-space: pre-line; color: var(--muted); }
.dcsheet.t-Elegant .eg-meta { text-align: right; }
.dcsheet.t-Elegant .eg-meta div { padding: 1px 0; }
.dcsheet.t-Elegant .eg-meta .eg-mv { font-size: 11px; }
.dcsheet.t-Elegant table.eg-items { width: 100%; border-collapse: collapse; margin-top: 18px; }
.dcsheet.t-Elegant .eg-items th { background: var(--wash); color: var(--accent); text-transform: uppercase; letter-spacing: 1.5px; font-size: 8px; font-weight: normal; padding: 7px 8px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.dcsheet.t-Elegant .eg-items td { padding: 9px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
.dcsheet.t-Elegant .eg-iname { font-size: 11px; }
.dcsheet.t-Elegant .eg-idesc { color: var(--muted); font-size: 9px; font-style: italic; margin-top: 1px; white-space: pre-line; }
.dcsheet.t-Elegant .eg-tsub { color: var(--muted); font-size: 8px; }
.dcsheet.t-Elegant .eg-close { display: flex; gap: 30px; margin-top: 16px; }
.dcsheet.t-Elegant .eg-close-l { flex: 1; }
/* Remittance lines and the QR sit side by side, close together. */
.dcsheet.t-Elegant .eg-bank-row { display: flex; align-items: center; gap: 16px; margin-top: 12px; }
.dcsheet.t-Elegant .eg-pay-qr { flex-shrink: 0; text-align: center; }
.dcsheet.t-Elegant .eg-pay-qr svg { width: 58px; height: 58px; display: block; }
.dcsheet.t-Elegant .eg-close-r { width: 250px; }
.dcsheet.t-Elegant .eg-srow { display: flex; justify-content: space-between; padding: 4px 0; }
.dcsheet.t-Elegant .eg-srow span:first-child { color: var(--muted); }
.dcsheet.t-Elegant .eg-grand { display: flex; justify-content: space-between; padding: 10px 0 4px; margin-top: 6px; border-top: 3px double var(--accent); font-size: 15px; }
.dcsheet.t-Elegant .eg-paid { text-align: right; color: #157347; font-style: italic; margin-top: 8px; }
.dcsheet.t-Elegant .eg-words { font-style: italic; color: var(--muted); margin-top: 12px; }
.dcsheet.t-Elegant table.eg-hsn { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 9px; }
.dcsheet.t-Elegant .eg-hsn th, .dcsheet.t-Elegant .eg-hsn td { border: 1px solid var(--line); padding: 5px 7px; }
.dcsheet.t-Elegant .eg-hsn th { background: var(--wash); color: var(--accent); font-weight: normal; text-transform: uppercase; letter-spacing: 1px; font-size: 8px; }
.dcsheet.t-Elegant .eg-hsn .eg-hsn-tot td { font-weight: bold; }
.dcsheet.t-Elegant .eg-sign { text-align: center; margin-top: 34px; }
.dcsheet.t-Elegant .eg-sign img { max-height: 46px; object-fit: contain; display: block; margin: 0 auto 4px; }
.dcsheet.t-Elegant .eg-sign-line { display: inline-block; border-top: 1px solid var(--ink); padding-top: 4px; min-width: 150px; }
.dcsheet.t-Elegant .r { text-align: right; }
.dcsheet.t-Elegant .c { text-align: center; }
`;

export function html(ctx) {
  const {
    t, doc, org, bank, esc, fmt, formatDate, formatPostalAddress,
    dealName, docLabel, docNumber, notes, terms, copySubtitle, payQrSvg,
  } = ctx;
  const sigImg = doc.signature || org.signatureUrl;
  const rupee = "&#8377;";

  const taxHead = !t.isTax ? ""
    : t.isInterState ? `<th class="r" style="width:78px;">IGST</th>`
    : `<th class="r" style="width:70px;">CGST</th><th class="r" style="width:70px;">SGST</th>`;

  const rows = t.rows.length ? t.rows.map((r, i) => `
    <tr>
      <td class="c" style="width:22px;color:#6b6355;">${i + 1}</td>
      <td><div class="eg-iname">${esc(r.name) || "&mdash;"}</div>${r.description ? `<div class="eg-idesc">${esc(r.description)}</div>` : ""}${r.hsn ? `<div class="eg-tsub">HSN ${esc(r.hsn)}</div>` : ""}</td>
      <td class="r">${fmt(r.rate)}</td>
      <td class="r nowrap">${r.qty}${r.unit ? " " + esc(r.unit) : ""}</td>
      <td class="r">${fmt(r.taxable)}</td>
      ${!t.isTax ? "" : t.isInterState
        ? `<td class="r">${fmt(r.igst)}<div class="eg-tsub">${r.igstRate || 0}%</div></td>`
        : `<td class="r">${fmt(r.cgst)}<div class="eg-tsub">${r.cgstRate || 0}%</div></td>
           <td class="r">${fmt(r.sgst)}<div class="eg-tsub">${r.sgstRate || 0}%</div></td>`}
      <td class="r">${fmt(r.amount)}</td>
    </tr>`).join("") : `<tr><td colspan="9" class="c" style="padding:18px;">No items</td></tr>`;

  const hsn = !t.isTax ? "" : `
  <table class="eg-hsn">
    <thead>
      ${t.isInterState
        ? `<tr><th rowspan="2">HSN / SAC</th><th rowspan="2">Taxable</th><th colspan="2" class="c">Integrated Tax</th><th rowspan="2">Total Tax</th></tr><tr><th class="c">Rate</th><th class="c">Amount</th></tr>`
        : `<tr><th rowspan="2">HSN / SAC</th><th rowspan="2">Taxable</th><th colspan="2" class="c">Central Tax</th><th colspan="2" class="c">State Tax</th><th rowspan="2">Total Tax</th></tr><tr><th class="c">Rate</th><th class="c">Amount</th><th class="c">Rate</th><th class="c">Amount</th></tr>`}
    </thead>
    <tbody>
      ${t.hsnRows.map((r) => t.isInterState
        ? `<tr><td class="c">${esc(r.hsn || "N/A")}</td><td class="r">${fmt(r.taxable)}</td><td class="c">${r.rate}%</td><td class="r">${fmt(r.igst)}</td><td class="r">${fmt(r.igst)}</td></tr>`
        : `<tr><td class="c">${esc(r.hsn || "N/A")}</td><td class="r">${fmt(r.taxable)}</td><td class="c">${r.rate / 2}%</td><td class="r">${fmt(r.cgst)}</td><td class="c">${r.rate / 2}%</td><td class="r">${fmt(r.sgst)}</td><td class="r">${fmt(r.cgst + r.sgst)}</td></tr>`).join("")}
      ${t.isInterState
        ? `<tr class="eg-hsn-tot"><td class="r">Total</td><td class="r">${fmt(t.totalTaxable)}</td><td></td><td class="r">${fmt(t.totalIGST)}</td><td class="r">${fmt(t.totalIGST)}</td></tr>`
        : `<tr class="eg-hsn-tot"><td class="r">Total</td><td class="r">${fmt(t.totalTaxable)}</td><td></td><td class="r">${fmt(t.totalCGST)}</td><td></td><td class="r">${fmt(t.totalSGST)}</td><td class="r">${fmt(t.totalCGST + t.totalSGST)}</td></tr>`}
    </tbody>
  </table>`;

  return `
  <div class="eg-mast">
    ${org.logoUrl ? `<img class="eg-logo" src="${esc(org.logoUrl)}" />` : ""}
    <div class="eg-org">${esc(org.companyName || "Your Company")}</div>
    <div class="eg-org-sub">${esc(org.address || "")}</div>
    <div class="eg-org-sub">GSTIN ${esc(org.gstin || "—")}${org.mobile ? " &nbsp;&middot;&nbsp; " + esc(org.mobile) : ""}${org.email ? " &nbsp;&middot;&nbsp; " + esc(org.email) : ""}</div>
  </div>

  <div class="eg-double"></div>
  <div class="eg-doc">${t.isTax ? "Tax " : ""}${esc(docLabel)}</div>
  <div class="eg-copy">${esc(copySubtitle)}</div>
  <div class="eg-single"></div>

  <div class="eg-info">
    <div>
      <div class="eg-k">Invoiced to</div>
      <div class="eg-party-name">${esc(dealName)}</div>
      ${doc.receiverGSTIN ? `<div style="color:#6b6355;">GSTIN ${esc(doc.receiverGSTIN)}</div>` : ""}
      <div class="eg-addr">${esc(formatPostalAddress(doc.billingAddress))}</div>
      ${formatPostalAddress(doc.shippingAddress) ? `<div class="eg-k" style="margin-top:8px;">Shipped to</div><div class="eg-addr">${esc(formatPostalAddress(doc.shippingAddress))}</div>` : ""}
    </div>
    <div class="eg-meta">
      <div class="eg-k">Reference</div>
      <div><span style="color:#6b6355;">No.&nbsp;</span><span class="eg-mv">${esc(docNumber || "—")}</span></div>
      <div><span style="color:#6b6355;">Date&nbsp;</span><span class="eg-mv">${esc(formatDate(doc.date) || "—")}</span></div>
      <div><span style="color:#6b6355;">Due&nbsp;</span><span class="eg-mv">${esc(formatDate(doc.dueDate) || "—")}</span></div>
      <div><span style="color:#6b6355;">Place of supply&nbsp;</span><span class="eg-mv">${esc(doc.placeOfSupply || "—")}</span></div>
    </div>
  </div>

  <table class="eg-items">
    <thead><tr>
      <th></th><th style="text-align:left;">Description</th>
      <th class="r">Rate</th><th class="r">Qty</th><th class="r">Taxable</th>
      ${taxHead}
      <th class="r">Amount</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="eg-close">
    <div class="eg-close-l">
      <div class="eg-words">In words &mdash; INR ${esc(t.amountInWords)}</div>
      <div class="eg-bank-row">
        <div>
          <div class="eg-k">Remittance</div>
          <div>${esc(bank.bank || "—")}</div>
          <div style="color:#6b6355;">A/c No.: ${esc(bank.accountNumber || "—")}</div>
          <div style="color:#6b6355;">IFSC: ${esc(bank.ifscCode || "—")}</div>
          ${bank.branch ? `<div style="color:#6b6355;">Branch: ${esc(bank.branch)}</div>` : ""}
        </div>
        <div class="eg-pay-qr">${payQrSvg}<div class="dc-pay-qr-cap">Scan to pay</div></div>
      </div>
    </div>
    <div class="eg-close-r">
      <div class="eg-srow"><span>Taxable amount</span><span>${rupee}${fmt(t.grossTaxable)}</span></div>
      ${t.documentDiscount > 0 ? `<div class="eg-srow"><span>Discount${t.discountType === "percentage" ? ` (${t.discountValue}%)` : ""}</span><span>- ${rupee}${fmt(t.documentDiscount)}</span></div>` : ""}
      ${!t.isTax ? "" : t.isInterState
        ? `<div class="eg-srow"><span>IGST</span><span>${rupee}${fmt(t.totalIGST)}</span></div>`
        : `<div class="eg-srow"><span>CGST</span><span>${rupee}${fmt(t.totalCGST)}</span></div><div class="eg-srow"><span>SGST</span><span>${rupee}${fmt(t.totalSGST)}</span></div>`}
      <div class="eg-grand"><span>Total</span><span>${rupee}${fmt(t.grandTotal)}</span></div>
      ${t.isPartiallyPaid ? `
        <div class="eg-srow"><span>Received</span><span>${rupee}${fmt(t.amountPaid)}</span></div>
        <div class="eg-grand"><span>Balance</span><span>${rupee}${fmt(t.balanceDue)}</span></div>` : ""}
      ${t.isFullyPaid || doc.status === "Paid" ? `<div class="eg-paid">&#10003; Paid in full</div>` : ""}
    </div>
  </div>

  ${hsn}

  ${notes || terms ? `<div class="eg-single"></div><div style="font-size:9px;color:#6b6355;">
    ${notes ? `<div class="eg-k">Notes</div><div>${notes}</div>` : ""}
    ${terms ? `<div class="eg-k" style="margin-top:8px;">Terms &amp; Conditions</div><div style="white-space:pre-line;">${terms}</div>` : ""}
  </div>` : ""}

  <div class="eg-sign">
    <div style="margin-bottom:10px;">For ${esc(org.companyName || "Your Company")}</div>
    ${sigImg ? `<img src="${esc(sigImg)}" />` : ""}
    <div class="eg-sign-line">Authorised Signatory</div>
  </div>

  `;
}
