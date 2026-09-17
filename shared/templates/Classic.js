export const blurb = "Traditional fully-ruled Indian GST tax invoice.";

export const css = `
.dcsheet.t-Classic {
  --ink: #111; --muted: #555; --line: #222; --accent: #1a1a1a;
  font-family: Arial, Helvetica, sans-serif; font-size: 10.5px; color: var(--ink);
  padding: 0;
}
/* Small inset on the ruled frame itself (not the sheet padding, which the print
   stylesheet forces to 0) so the border and table never sit against the paper
   edge and get clipped when printed. */
.dcsheet.t-Classic .cl-page { border: 1.5px solid var(--line); margin: 8px; }
/* Keep the "Page 1 / 1 …" line aligned with the inset frame above it. */
.dcsheet.t-Classic .dc-page-footer { padding-left: 8px; padding-right: 8px; padding-bottom: 8px; }
.dcsheet.t-Classic .cl-band { text-align: center; padding: 6px; border-bottom: 1.5px solid var(--line); font-weight: bold; letter-spacing: 3px; font-size: 12px; text-transform: uppercase; }
.dcsheet.t-Classic .cl-band .cl-copy { display: block; font-weight: normal; letter-spacing: 1px; font-size: 7.5px; color: var(--muted); margin-top: 1px; }
.dcsheet.t-Classic .cl-head { display: flex; border-bottom: 1.5px solid var(--line); }
.dcsheet.t-Classic .cl-head-l { flex: 1; padding: 10px 12px; border-right: 1px solid var(--line); }
.dcsheet.t-Classic .cl-head-r { width: 200px; padding: 10px 12px; }
.dcsheet.t-Classic .cl-org { font-size: 14px; font-weight: bold; }
.dcsheet.t-Classic .cl-sub { font-size: 9.5px; color: var(--muted); margin-top: 2px; white-space: pre-line; }
.dcsheet.t-Classic .cl-kv { display: flex; justify-content: space-between; padding: 3px 0; font-size: 9.5px; }
.dcsheet.t-Classic .cl-kv span:first-child { color: var(--muted); }
.dcsheet.t-Classic .cl-parties { display: flex; border-bottom: 1.5px solid var(--line); }
.dcsheet.t-Classic .cl-party { flex: 1; padding: 10px 12px; font-size: 9.5px; }
.dcsheet.t-Classic .cl-party + .cl-party { border-left: 1px solid var(--line); }
.dcsheet.t-Classic .cl-plabel { font-weight: bold; text-transform: uppercase; font-size: 8px; letter-spacing: .8px; color: var(--muted); margin-bottom: 3px; }
.dcsheet.t-Classic .cl-pname { font-weight: bold; font-size: 11px; }
.dcsheet.t-Classic .cl-addr { white-space: pre-line; margin-top: 2px; }
.dcsheet.t-Classic table.cl-items { width: 100%; border-collapse: collapse; font-size: 9.5px; }
.dcsheet.t-Classic .cl-items th { background: #f0f0f0; border-bottom: 1.5px solid var(--line); border-right: 1px solid var(--line); padding: 5px 6px; font-size: 8.5px; text-transform: uppercase; letter-spacing: .3px; }
.dcsheet.t-Classic .cl-items td { border-right: 1px solid var(--line); border-bottom: 1px solid #bbb; padding: 5px 6px; vertical-align: top; }
.dcsheet.t-Classic .cl-items th:last-child, .dcsheet.t-Classic .cl-items td:last-child { border-right: 0; }
/* Last row keeps no bottom rule — the .cl-lower section right below draws its
   own top border, and stacking the two reads as a thick line. */
.dcsheet.t-Classic .cl-items tr:last-child td { border-bottom: 0; }
.dcsheet.t-Classic .cl-iname { font-weight: bold; }
.dcsheet.t-Classic .cl-idesc { color: var(--muted); font-size: 8.5px; margin-top: 1px; white-space: pre-line; }
.dcsheet.t-Classic .cl-lower { display: flex; border-top: 1.5px solid var(--line); }
.dcsheet.t-Classic .cl-lower-l { flex: 1; padding: 10px 12px; border-right: 1px solid var(--line); font-size: 9.5px; }
.dcsheet.t-Classic .cl-lower-r { width: 250px; }
.dcsheet.t-Classic .cl-trow { display: flex; justify-content: space-between; padding: 4px 12px; border-bottom: 1px solid #bbb; font-size: 9.5px; }
.dcsheet.t-Classic .cl-trow .cl-tl { color: var(--muted); }
.dcsheet.t-Classic .cl-grand { display: flex; justify-content: space-between; padding: 6px 12px; font-size: 13px; font-weight: bold; background: #f0f0f0; border-bottom: 1.5px solid var(--line); }
.dcsheet.t-Classic .cl-words { margin-top: 6px; }
.dcsheet.t-Classic .cl-bank { margin-top: 8px; }
.dcsheet.t-Classic .cl-bank div { padding: 1px 0; }
.dcsheet.t-Classic .cl-paid { display: flex; align-items: center; justify-content: flex-end; gap: 4px; padding: 5px 12px; color: #15803d; font-weight: bold; }
.dcsheet.t-Classic table.cl-hsn { width: 100%; border-collapse: collapse; border-top: 1.5px solid var(--line); font-size: 8.5px; }
.dcsheet.t-Classic .cl-hsn th, .dcsheet.t-Classic .cl-hsn td { border: 1px solid #999; padding: 4px 6px; }
.dcsheet.t-Classic .cl-hsn th { background: #f0f0f0; }
.dcsheet.t-Classic .cl-hsn .cl-hsn-tot td { font-weight: bold; background: #fafafa; }
.dcsheet.t-Classic .cl-foot { display: flex; border-top: 1.5px solid var(--line); }
.dcsheet.t-Classic .cl-notes { flex: 1; padding: 10px 12px; border-right: 1px solid var(--line); font-size: 9px; }
.dcsheet.t-Classic .cl-notes .cl-plabel { margin-top: 6px; }
.dcsheet.t-Classic .cl-notes .cl-plabel:first-child { margin-top: 0; }
.dcsheet.t-Classic .cl-sign { width: 210px; padding: 10px 12px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; }
.dcsheet.t-Classic .cl-sign img { max-height: 44px; margin: 2px auto 0; object-fit: contain; }
.dcsheet.t-Classic .cl-sign-line { display: inline-block; border-top: 1px solid var(--line); padding-top: 3px; margin-top: 6px; font-size: 9px; min-width: 130px; }
`;

export function html(ctx) {
  const {
    t, doc, org, bank, esc, fmt, formatDate, formatPostalAddress,
    dealName, docLabel, docNumber, notes, terms, copySubtitle, discountRow, payQrSvg,
  } = ctx;
  const sigImg = doc.signature || org.signatureUrl;
  const rupee = "&#8377;";

  const taxHead = !t.isTax ? ""
    : t.isInterState ? `<th class="r" style="width:70px;">IGST</th>`
    : `<th class="r" style="width:64px;">CGST</th><th class="r" style="width:64px;">SGST</th>`;

  const rows = t.rows.length ? t.rows.map((r, i) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td><div class="cl-iname">${esc(r.name) || "&mdash;"}</div>${r.description ? `<div class="cl-idesc">${esc(r.description)}</div>` : ""}</td>
      <td class="c">${esc(r.hsn || "")}</td>
      <td class="r">${fmt(r.rate)}</td>
      <td class="r nowrap">${r.qty}${r.unit ? " " + esc(r.unit) : ""}</td>
      <td class="r">${fmt(r.taxable)}</td>
      ${!t.isTax ? "" : t.isInterState
        ? `<td class="r">${r.igst > 0 ? `${fmt(r.igst)}<div class="cl-idesc">${r.igstRate}%</div>` : "&mdash;"}</td>`
        : `<td class="r">${r.cgst > 0 ? `${fmt(r.cgst)}<div class="cl-idesc">${r.cgstRate}%</div>` : "&mdash;"}</td>
           <td class="r">${r.sgst > 0 ? `${fmt(r.sgst)}<div class="cl-idesc">${r.sgstRate}%</div>` : "&mdash;"}</td>`}
      <td class="r">${fmt(r.amount)}</td>
    </tr>`).join("") : `<tr><td colspan="${t.isTax ? (t.isInterState ? 8 : 9) : 7}" class="c" style="padding:16px;">No items</td></tr>`;

  const hsn = !t.isTax ? "" : `
  <table class="cl-hsn">
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
        ? `<tr class="cl-hsn-tot"><td class="r">TOTAL</td><td class="r">${fmt(t.totalTaxable)}</td><td></td><td class="r">${fmt(t.totalIGST)}</td><td class="r">${fmt(t.totalIGST)}</td></tr>`
        : `<tr class="cl-hsn-tot"><td class="r">TOTAL</td><td class="r">${fmt(t.totalTaxable)}</td><td></td><td class="r">${fmt(t.totalCGST)}</td><td></td><td class="r">${fmt(t.totalSGST)}</td><td class="r">${fmt(t.totalCGST + t.totalSGST)}</td></tr>`}
    </tbody>
  </table>`;

  return `
  <div class="cl-page">
    <div class="cl-band">${t.isTax ? "TAX " : ""}${esc(docLabel)}<span class="cl-copy">${esc(copySubtitle)}</span></div>

    <div class="cl-head">
      <div class="cl-head-l">
        <div class="cl-org">${esc(org.companyName || "Your Company")}</div>
        <div class="cl-sub">${esc(org.address || "")}</div>
        <div class="cl-sub">GSTIN: ${esc(org.gstin || "—")}${org.mobile ? "  |  Mobile: " + esc(org.mobile) : ""}${org.email ? "  |  " + esc(org.email) : ""}</div>
      </div>
      <div class="cl-head-r">
        <div class="cl-kv"><span>${esc(docLabel)} No.</span><b>${esc(docNumber || "—")}</b></div>
        <div class="cl-kv"><span>Date</span><b>${esc(formatDate(doc.date) || "—")}</b></div>
        <div class="cl-kv"><span>Due Date</span><b>${esc(formatDate(doc.dueDate) || "—")}</b></div>
        <div class="cl-kv"><span>Place of Supply</span><b>${esc(doc.placeOfSupply || "—")}</b></div>
        ${doc.ewayBillNumber ? `<div class="cl-kv"><span>Eway Bill</span><b>${esc(doc.ewayBillNumber)}</b></div>` : ""}
      </div>
    </div>

    <div class="cl-parties">
      <div class="cl-party">
        <div class="cl-plabel">Bill To</div>
        <div class="cl-pname">${esc(dealName)}</div>
        ${doc.receiverGSTIN ? `<div>GSTIN: ${esc(doc.receiverGSTIN)}</div>` : ""}
        <div class="cl-addr">${esc(formatPostalAddress(doc.billingAddress))}</div>
      </div>
      <div class="cl-party">
        <div class="cl-plabel">Ship To</div>
        <div class="cl-addr">${esc(formatPostalAddress(doc.shippingAddress) || formatPostalAddress(doc.billingAddress))}</div>
      </div>
    </div>

    <table class="cl-items">
      <thead>
        <tr>
          <th style="width:22px;">#</th>
          <th style="text-align:left;">Item</th>
          <th style="width:48px;">HSN</th>
          <th class="r" style="width:56px;">Rate</th>
          <th class="r" style="width:52px;">Qty</th>
          <th class="r" style="width:70px;">Taxable</th>
          ${taxHead}
          <th class="r" style="width:76px;">Amount</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="cl-lower">
      <div class="cl-lower-l">
        <div>Total items / qty: <b>${t.rows.length} / ${fmt(t.totalQty)}</b></div>
        <div class="cl-words"><span class="cl-tl">Amount in words:</span> INR ${esc(t.amountInWords)}</div>
        <div class="cl-bank">
          <div class="dc-pay-qr">${payQrSvg}<div class="dc-pay-qr-cap">Scan to pay</div></div>
          <div class="cl-plabel">Bank Details</div>
          <div>Bank: ${esc(bank.bank || "—")}</div>
          <div>A/c No.: ${esc(bank.accountNumber || "—")}</div>
          <div>IFSC: ${esc(bank.ifscCode || "—")}${bank.branch ? "  |  Branch: " + esc(bank.branch) : ""}</div>
        </div>
      </div>
      <div class="cl-lower-r">
        <div class="cl-trow"><span class="cl-tl">Taxable Amount</span><span>${rupee}${fmt(t.grossTaxable)}</span></div>
        ${discountRow ? discountRow.replace(/dc-trow/g, "cl-trow").replace(/dc-label/g, "cl-tl") : ""}
        ${!t.isTax ? "" : t.isInterState
          ? `<div class="cl-trow"><span class="cl-tl">IGST</span><span>${rupee}${fmt(t.totalIGST)}</span></div>`
          : `<div class="cl-trow"><span class="cl-tl">CGST</span><span>${rupee}${fmt(t.totalCGST)}</span></div>
             <div class="cl-trow"><span class="cl-tl">SGST</span><span>${rupee}${fmt(t.totalSGST)}</span></div>`}
        <div class="cl-grand"><span>Total</span><span>${rupee}${fmt(t.grandTotal)}</span></div>
        ${t.isPartiallyPaid ? `
          <div class="cl-trow"><span class="cl-tl">Amount Paid</span><span>${rupee}${fmt(t.amountPaid)}</span></div>
          <div class="cl-grand"><span>Balance Due</span><span>${rupee}${fmt(t.balanceDue)}</span></div>` : ""}
        ${t.isFullyPaid || doc.status === "Paid" ? `<div class="cl-paid"><span>&#10003;</span><span>Paid in full</span></div>` : ""}
      </div>
    </div>

    ${hsn}

    <div class="cl-foot">
      <div class="cl-notes">
        ${notes ? `<div class="cl-plabel">Notes</div><div>${notes}</div>` : ""}
        ${terms ? `<div class="cl-plabel">Terms &amp; Conditions</div><div style="white-space:pre-line;">${terms}</div>` : ""}
        ${!notes && !terms ? "&nbsp;" : ""}
      </div>
      <div class="cl-sign">
        <div style="font-weight:bold;">For ${esc(org.companyName || "Your Company")}</div>
        ${sigImg ? `<img src="${esc(sigImg)}" />` : ""}
        <div class="cl-sign-line">Authorised Signatory</div>
      </div>
    </div>
  </div>

  `;
}
