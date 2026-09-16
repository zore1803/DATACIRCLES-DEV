export const blurb = "Navy masthead band, gold rule, uppercase headings.";

export const css = `
.dcsheet.t-Corporate {
  --navy: #16263f; --navy-2: #1f3350; --gold: #c8a047; --ink: #1c2532; --muted: #6a7686; --line: #d3d9e2; --wash: #f2f5f9;
  font-family: "Segoe UI", Arial, Helvetica, sans-serif; font-size: 10px; color: var(--ink);
  padding: 0;
}
.dcsheet.t-Corporate .cp-band { background: var(--navy); color: #fff; padding: 18px 26px; border-bottom: 4px solid var(--gold); display: flex; justify-content: space-between; align-items: flex-start; }
.dcsheet.t-Corporate .cp-org { font-size: 18px; font-weight: 700; letter-spacing: .5px; }
.dcsheet.t-Corporate .cp-org-sub { font-size: 9px; color: #aebbcd; margin-top: 3px; white-space: pre-line; }
.dcsheet.t-Corporate .cp-doc { text-align: right; }
.dcsheet.t-Corporate .cp-doc-title { color: var(--gold); font-size: 15px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; }
.dcsheet.t-Corporate .cp-doc-copy { font-size: 7.5px; color: #aebbcd; letter-spacing: 1px; text-transform: uppercase; margin-top: 2px; }
.dcsheet.t-Corporate .cp-doc-no { font-size: 11px; margin-top: 8px; }
.dcsheet.t-Corporate .cp-body { padding: 22px 26px; }
/* Align the "Page 1 / 1 …" line with the body's 26px inset. */
.dcsheet.t-Corporate .dc-page-footer { padding: 0 26px 22px; }
.dcsheet.t-Corporate .cp-strip { display: grid; grid-template-columns: 1.4fr 1fr; gap: 0; border: 1px solid var(--line); }
.dcsheet.t-Corporate .cp-strip > div { padding: 12px 14px; }
.dcsheet.t-Corporate .cp-strip > div:first-child { border-right: 1px solid var(--line); }
.dcsheet.t-Corporate .cp-k { text-transform: uppercase; letter-spacing: 1px; font-size: 7.5px; color: var(--navy); font-weight: 700; margin-bottom: 4px; }
.dcsheet.t-Corporate .cp-pname { font-size: 12px; font-weight: 700; }
.dcsheet.t-Corporate .cp-addr { white-space: pre-line; color: var(--muted); margin-top: 2px; }
.dcsheet.t-Corporate .cp-mgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 14px; }
.dcsheet.t-Corporate .cp-mgrid span { display: block; color: var(--muted); font-size: 8px; text-transform: uppercase; letter-spacing: .5px; }
.dcsheet.t-Corporate .cp-mgrid b { font-size: 10.5px; }
.dcsheet.t-Corporate table.cp-items { width: 100%; border-collapse: collapse; margin-top: 18px; }
.dcsheet.t-Corporate .cp-items th { background: var(--navy); color: #fff; text-transform: uppercase; letter-spacing: .6px; font-size: 8.5px; padding: 8px 9px; border: 1px solid var(--navy); }
.dcsheet.t-Corporate .cp-items td { padding: 8px 9px; border: 1px solid var(--line); vertical-align: top; }
.dcsheet.t-Corporate .cp-items tbody tr:nth-child(even) td { background: var(--wash); }
.dcsheet.t-Corporate .cp-iname { font-weight: 700; }
.dcsheet.t-Corporate .cp-idesc { color: var(--muted); font-size: 8.5px; margin-top: 1px; white-space: pre-line; }
.dcsheet.t-Corporate .cp-tsub { color: var(--muted); font-size: 8px; }
.dcsheet.t-Corporate .cp-lower { display: grid; grid-template-columns: 1fr 270px; margin-top: 16px; border: 1px solid var(--line); }
.dcsheet.t-Corporate .cp-lower-l { padding: 12px 14px; border-right: 1px solid var(--line); }
.dcsheet.t-Corporate .cp-trow { display: flex; justify-content: space-between; padding: 6px 14px; border-bottom: 1px solid var(--line); }
.dcsheet.t-Corporate .cp-trow span:first-child { color: var(--muted); }
.dcsheet.t-Corporate .cp-grand { display: flex; justify-content: space-between; padding: 9px 14px; background: var(--navy); color: #fff; font-size: 13px; font-weight: 700; }
.dcsheet.t-Corporate .cp-grand.cp-alt { background: var(--navy-2); }
.dcsheet.t-Corporate .cp-paid { display: flex; justify-content: flex-end; align-items: center; gap: 4px; padding: 6px 14px; color: #15803d; font-weight: 700; }
.dcsheet.t-Corporate .cp-words { color: var(--muted); }
.dcsheet.t-Corporate .cp-bank { margin-top: 8px; }
.dcsheet.t-Corporate .cp-bank div { padding: 1px 0; }
/* Bank lines and the QR sit side by side, close together. */
.dcsheet.t-Corporate .cp-bank-row { display: flex; align-items: center; gap: 16px; }
.dcsheet.t-Corporate .cp-pay-qr { flex-shrink: 0; text-align: center; }
.dcsheet.t-Corporate .cp-pay-qr svg { width: 58px; height: 58px; display: block; }
.dcsheet.t-Corporate table.cp-hsn { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 8.5px; }
.dcsheet.t-Corporate .cp-hsn th, .dcsheet.t-Corporate .cp-hsn td { border: 1px solid var(--line); padding: 5px 7px; }
.dcsheet.t-Corporate .cp-hsn th { background: var(--wash); color: var(--navy); text-transform: uppercase; letter-spacing: .5px; }
.dcsheet.t-Corporate .cp-hsn .cp-hsn-tot td { font-weight: 700; background: var(--wash); }
.dcsheet.t-Corporate .cp-foot { display: grid; grid-template-columns: 1fr 220px; margin-top: 16px; }
.dcsheet.t-Corporate .cp-notes { font-size: 9px; color: var(--muted); padding-right: 16px; }
.dcsheet.t-Corporate .cp-sign { text-align: right; }
.dcsheet.t-Corporate .cp-sign img { max-height: 44px; margin: 2px 0 0 auto; display: block; object-fit: contain; }

/* Print edge-to-edge: drop the page margin and let the sheet fill the paper so
   the navy band isn't floating in a wide white border. The template's own
   26px band/body padding keeps the content off the very edge. */
@media print {
  @page { size: A4; margin: 0; }
  html, body { margin: 0; padding: 0; }
  .dcsheet.t-Corporate {
    width: 100% !important;
    min-height: 100% !important;
    max-width: none !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  .dcsheet.t-Corporate .cp-band,
  .dcsheet.t-Corporate .cp-items,
  .dcsheet.t-Corporate .cp-lower { page-break-inside: avoid; }
}
.dcsheet.t-Corporate .cp-sign-line { display: inline-block; min-width: 120px; border-top: 2px solid var(--navy); padding-top: 4px; margin-top: 8px; font-weight: 700; }
.dcsheet.t-Corporate .r { text-align: right; }
.dcsheet.t-Corporate .c { text-align: center; }
`;

export function html(ctx) {
  const {
    t, doc, org, bank, esc, fmt, formatDate, formatPostalAddress,
    dealName, docLabel, docNumber, notes, terms, copySubtitle, payQrSvg,
  } = ctx;
  const sigImg = doc.signature || org.signatureUrl;
  const rupee = "&#8377;";

  const taxHead = !t.isTax ? ""
    : t.isInterState ? `<th class="r" style="width:74px;">IGST</th>`
    : `<th class="r" style="width:66px;">CGST</th><th class="r" style="width:66px;">SGST</th>`;

  const rows = t.rows.length ? t.rows.map((r, i) => `
    <tr>
      <td class="c" style="width:22px;">${i + 1}</td>
      <td><div class="cp-iname">${esc(r.name) || "&mdash;"}</div>${r.description ? `<div class="cp-idesc">${esc(r.description)}</div>` : ""}</td>
      <td class="c" style="width:48px;">${esc(r.hsn || "")}</td>
      <td class="r" style="width:56px;">${fmt(r.rate)}</td>
      <td class="r nowrap" style="width:52px;">${r.qty}${r.unit ? " " + esc(r.unit) : ""}</td>
      <td class="r" style="width:70px;">${fmt(r.taxable)}</td>
      ${!t.isTax ? "" : t.isInterState
        ? `<td class="r">${fmt(r.igst)}<div class="cp-tsub">${r.igstRate || 0}%</div></td>`
        : `<td class="r">${fmt(r.cgst)}<div class="cp-tsub">${r.cgstRate || 0}%</div></td>
           <td class="r">${fmt(r.sgst)}<div class="cp-tsub">${r.sgstRate || 0}%</div></td>`}
      <td class="r" style="width:76px;font-weight:700;">${fmt(r.amount)}</td>
    </tr>`).join("") : `<tr><td colspan="9" class="c" style="padding:16px;">No items</td></tr>`;

  const hsn = !t.isTax ? "" : `
  <table class="cp-hsn">
    <thead>
      ${t.isInterState
        ? `<tr><th rowspan="2">HSN/SAC</th><th rowspan="2">Taxable</th><th colspan="2" class="c">Integrated Tax</th><th rowspan="2">Total Tax</th></tr><tr><th class="c">Rate</th><th class="c">Amount</th></tr>`
        : `<tr><th rowspan="2">HSN/SAC</th><th rowspan="2">Taxable</th><th colspan="2" class="c">Central Tax</th><th colspan="2" class="c">State Tax</th><th rowspan="2">Total Tax</th></tr><tr><th class="c">Rate</th><th class="c">Amount</th><th class="c">Rate</th><th class="c">Amount</th></tr>`}
    </thead>
    <tbody>
      ${t.hsnRows.map((r) => t.isInterState
        ? `<tr><td class="c">${esc(r.hsn || "N/A")}</td><td class="r">${fmt(r.taxable)}</td><td class="c">${r.rate}%</td><td class="r">${fmt(r.igst)}</td><td class="r">${fmt(r.igst)}</td></tr>`
        : `<tr><td class="c">${esc(r.hsn || "N/A")}</td><td class="r">${fmt(r.taxable)}</td><td class="c">${r.rate / 2}%</td><td class="r">${fmt(r.cgst)}</td><td class="c">${r.rate / 2}%</td><td class="r">${fmt(r.sgst)}</td><td class="r">${fmt(r.cgst + r.sgst)}</td></tr>`).join("")}
      ${t.isInterState
        ? `<tr class="cp-hsn-tot"><td class="r">TOTAL</td><td class="r">${fmt(t.totalTaxable)}</td><td></td><td class="r">${fmt(t.totalIGST)}</td><td class="r">${fmt(t.totalIGST)}</td></tr>`
        : `<tr class="cp-hsn-tot"><td class="r">TOTAL</td><td class="r">${fmt(t.totalTaxable)}</td><td></td><td class="r">${fmt(t.totalCGST)}</td><td></td><td class="r">${fmt(t.totalSGST)}</td><td class="r">${fmt(t.totalCGST + t.totalSGST)}</td></tr>`}
    </tbody>
  </table>`;

  return `
  <div class="cp-band">
    <div>
      <div class="cp-org">${esc(org.companyName || "Your Company")}</div>
      <div class="cp-org-sub">${esc(org.address || "")}</div>
      <div class="cp-org-sub">GSTIN ${esc(org.gstin || "—")}${org.mobile ? "  |  " + esc(org.mobile) : ""}${org.email ? "  |  " + esc(org.email) : ""}</div>
    </div>
    <div class="cp-doc">
      <div class="cp-doc-title">${t.isTax ? "Tax " : ""}${esc(docLabel)}</div>
      <div class="cp-doc-copy">${esc(copySubtitle)}</div>
      <div class="cp-doc-no">No. <b>${esc(docNumber || "—")}</b></div>
    </div>
  </div>

  <div class="cp-body">
    <div class="cp-strip">
      <div>
        <div class="cp-k">Bill To</div>
        <div class="cp-pname">${esc(dealName)}</div>
        ${doc.receiverGSTIN ? `<div style="color:#6a7686;">GSTIN ${esc(doc.receiverGSTIN)}</div>` : ""}
        <div class="cp-addr">${esc(formatPostalAddress(doc.billingAddress))}</div>
        ${formatPostalAddress(doc.shippingAddress) ? `<div class="cp-k" style="margin-top:6px;">Ship To</div><div class="cp-addr">${esc(formatPostalAddress(doc.shippingAddress))}</div>` : ""}
      </div>
      <div>
        <div class="cp-mgrid">
          <div><span>Date</span><b>${esc(formatDate(doc.date) || "—")}</b></div>
          <div><span>Due Date</span><b>${esc(formatDate(doc.dueDate) || "—")}</b></div>
          <div><span>Place of Supply</span><b>${esc(doc.placeOfSupply || "—")}</b></div>
          <div><span>Eway Bill</span><b>${esc(doc.ewayBillNumber || "—")}</b></div>
        </div>
      </div>
    </div>

    <table class="cp-items">
      <thead><tr>
        <th>#</th><th style="text-align:left;">Item</th><th>HSN</th>
        <th class="r">Rate</th><th class="r">Qty</th><th class="r">Taxable</th>
        ${taxHead}
        <th class="r">Amount</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="cp-lower">
      <div class="cp-lower-l">
        <div class="cp-words">In words: INR ${esc(t.amountInWords)}</div>
        <div style="color:#6a7686;margin-top:2px;">${t.rows.length} item${t.rows.length === 1 ? "" : "s"} &middot; ${fmt(t.totalQty)} qty</div>
        <div class="cp-bank">
          <div class="cp-bank-row">
            <div>
              <div class="cp-k">Bank Details</div>
              <div>${esc(bank.bank || "—")}</div>
              <div style="color:#6a7686;">A/c ${esc(bank.accountNumber || "—")} &middot; IFSC ${esc(bank.ifscCode || "—")}${bank.branch ? " &middot; " + esc(bank.branch) : ""}</div>
            </div>
            <div class="cp-pay-qr">${payQrSvg}<div class="dc-pay-qr-cap">Scan to pay</div></div>
          </div>
        </div>
      </div>
      <div>
        <div class="cp-trow"><span>Taxable Amount</span><span>${rupee}${fmt(t.grossTaxable)}</span></div>
        ${t.documentDiscount > 0 ? `<div class="cp-trow"><span>Discount${t.discountType === "percentage" ? ` (${t.discountValue}%)` : ""}</span><span>- ${rupee}${fmt(t.documentDiscount)}</span></div>` : ""}
        ${!t.isTax ? "" : t.isInterState
          ? `<div class="cp-trow"><span>IGST</span><span>${rupee}${fmt(t.totalIGST)}</span></div>`
          : `<div class="cp-trow"><span>CGST</span><span>${rupee}${fmt(t.totalCGST)}</span></div><div class="cp-trow"><span>SGST</span><span>${rupee}${fmt(t.totalSGST)}</span></div>`}
        <div class="cp-grand"><span>Total</span><span>${rupee}${fmt(t.grandTotal)}</span></div>
        ${t.isPartiallyPaid ? `
          <div class="cp-trow"><span>Amount Paid</span><span>${rupee}${fmt(t.amountPaid)}</span></div>
          <div class="cp-grand cp-alt"><span>Balance Due</span><span>${rupee}${fmt(t.balanceDue)}</span></div>` : ""}
        ${t.isFullyPaid || doc.status === "Paid" ? `<div class="cp-paid"><span>&#10003;</span><span>Paid in full</span></div>` : ""}
      </div>
    </div>

    ${hsn}

    <div class="cp-foot">
      <div class="cp-notes">
        ${notes ? `<div class="cp-k">Notes</div><div>${notes}</div>` : ""}
        ${terms ? `<div class="cp-k" style="margin-top:6px;">Terms &amp; Conditions</div><div style="white-space:pre-line;">${terms}</div>` : ""}
      </div>
      <div class="cp-sign">
        <div style="font-weight:700;">For ${esc(org.companyName || "Your Company")}</div>
        ${sigImg ? `<img src="${esc(sigImg)}" />` : ""}
        <div class="cp-sign-line">Authorised Signatory</div>
      </div>
    </div>
  </div>

  `;
}
