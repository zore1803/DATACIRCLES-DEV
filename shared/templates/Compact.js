export const blurb = "High-density layout that fits long item lists on one page.";

export const css = `
.dcsheet.t-Compact {
  --ink: #1b1b1b; --muted: #666; --line: #c3c8cf; --accent: #2b3a4a; --wash: #eef1f5;
  font-family: Arial, Helvetica, sans-serif; font-size: 8.5px; color: var(--ink);
  padding: 16px 18px; line-height: 1.3;
}
.dcsheet.t-Compact .cx-top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid var(--accent); padding-bottom: 6px; }
.dcsheet.t-Compact .cx-org { font-size: 12px; font-weight: bold; }
.dcsheet.t-Compact .cx-org-sub { color: var(--muted); font-size: 7.5px; }
.dcsheet.t-Compact .cx-doc { text-align: right; }
.dcsheet.t-Compact .cx-doc-t { font-size: 12px; font-weight: bold; color: var(--accent); letter-spacing: 1px; text-transform: uppercase; }
.dcsheet.t-Compact .cx-doc-c { font-size: 7px; color: var(--muted); text-transform: uppercase; letter-spacing: .5px; }
.dcsheet.t-Compact .cx-meta { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 0; border: 1px solid var(--line); border-top: 0; margin-top: 0; }
.dcsheet.t-Compact .cx-meta > div { padding: 5px 7px; border-left: 1px solid var(--line); }
.dcsheet.t-Compact .cx-meta > div:first-child { border-left: 0; }
.dcsheet.t-Compact .cx-lab { color: var(--muted); text-transform: uppercase; font-size: 6.5px; letter-spacing: .5px; }
.dcsheet.t-Compact .cx-bill b { font-size: 9.5px; }
.dcsheet.t-Compact .cx-addr { white-space: pre-line; color: var(--muted); }
.dcsheet.t-Compact table.cx-items { width: 100%; border-collapse: collapse; margin-top: 8px; }
.dcsheet.t-Compact .cx-items th { background: var(--accent); color: #fff; text-transform: uppercase; font-size: 6.5px; letter-spacing: .3px; padding: 4px 5px; border: 1px solid var(--accent); }
.dcsheet.t-Compact .cx-items td { padding: 3px 5px; border: 1px solid var(--line); vertical-align: top; }
.dcsheet.t-Compact .cx-items tbody tr:nth-child(even) td { background: #f7f8fa; }
.dcsheet.t-Compact .cx-iname { font-weight: bold; }
.dcsheet.t-Compact .cx-idesc { color: var(--muted); font-size: 7px; }
.dcsheet.t-Compact .cx-lower { display: grid; grid-template-columns: 1fr 210px; margin-top: 8px; gap: 10px; }
.dcsheet.t-Compact .cx-strip { border: 1px solid var(--line); padding: 6px 8px; }
.dcsheet.t-Compact .cx-trow { display: flex; justify-content: space-between; padding: 2px 8px; }
.dcsheet.t-Compact .cx-trow span:first-child { color: var(--muted); }
.dcsheet.t-Compact .cx-grand { display: flex; justify-content: space-between; padding: 4px 8px; background: var(--wash); font-weight: bold; font-size: 11px; border-top: 1px solid var(--accent); border-bottom: 1px solid var(--accent); }
.dcsheet.t-Compact .cx-paid { text-align: right; color: #15803d; font-weight: bold; padding: 3px 8px; }
.dcsheet.t-Compact table.cx-hsn { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 7px; }
.dcsheet.t-Compact .cx-hsn th, .dcsheet.t-Compact .cx-hsn td { border: 1px solid var(--line); padding: 3px 5px; }
.dcsheet.t-Compact .cx-hsn th { background: var(--wash); }
.dcsheet.t-Compact .cx-hsn .cx-hsn-tot td { font-weight: bold; background: #fafbfc; }
.dcsheet.t-Compact .cx-foot { display: flex; justify-content: space-between; gap: 16px; margin-top: 8px; font-size: 7.5px; }
.dcsheet.t-Compact .cx-sign { text-align: right; width: 160px; flex-shrink: 0; }
.dcsheet.t-Compact .cx-sign img { max-height: 34px; margin: 2px 0 0 auto; display: block; object-fit: contain; }
.dcsheet.t-Compact .cx-sign-line { display: inline-block; border-top: 1px solid var(--ink); padding-top: 2px; margin-top: 6px; min-width: 110px; }
.dcsheet.t-Compact .r { text-align: right; }
.dcsheet.t-Compact .c { text-align: center; }
`;

export function html(ctx) {
  const {
    t, doc, org, bank, esc, fmt, formatDate, formatPostalAddress,
    dealName, docLabel, docNumber, notes, terms, copySubtitle, payQrSvg,
  } = ctx;
  const sigImg = doc.signature || org.signatureUrl;
  const rupee = "&#8377;";

  const taxHead = !t.isTax ? ""
    : t.isInterState ? `<th class="r">IGST</th>`
    : `<th class="r">CGST</th><th class="r">SGST</th>`;

  const rows = t.rows.length ? t.rows.map((r, i) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td><span class="cx-iname">${esc(r.name) || "&mdash;"}</span>${r.description ? ` <span class="cx-idesc">&mdash; ${esc(r.description)}</span>` : ""}</td>
      <td class="c">${esc(r.hsn || "")}</td>
      <td class="r">${fmt(r.rate)}</td>
      <td class="r nowrap">${r.qty}${r.unit ? " " + esc(r.unit) : ""}</td>
      <td class="r">${fmt(r.taxable)}</td>
      ${!t.isTax ? "" : t.isInterState
        ? `<td class="r">${fmt(r.igst)} <span class="cx-idesc">${r.igstRate || 0}%</span></td>`
        : `<td class="r">${fmt(r.cgst)} <span class="cx-idesc">${r.cgstRate || 0}%</span></td><td class="r">${fmt(r.sgst)} <span class="cx-idesc">${r.sgstRate || 0}%</span></td>`}
      <td class="r" style="font-weight:bold;">${fmt(r.amount)}</td>
    </tr>`).join("") : `<tr><td colspan="9" class="c" style="padding:10px;">No items</td></tr>`;

  const hsn = !t.isTax ? "" : `
  <table class="cx-hsn">
    <thead><tr>
      <th>HSN/SAC</th><th class="r">Taxable</th>
      ${t.isInterState ? `<th class="r">IGST Rate</th><th class="r">IGST Amt</th>` : `<th class="r">CGST</th><th class="r">SGST</th>`}
      <th class="r">Total Tax</th>
    </tr></thead>
    <tbody>
      ${t.hsnRows.map((r) => t.isInterState
        ? `<tr><td>${esc(r.hsn || "N/A")}</td><td class="r">${fmt(r.taxable)}</td><td class="r">${r.rate}%</td><td class="r">${fmt(r.igst)}</td><td class="r">${fmt(r.igst)}</td></tr>`
        : `<tr><td>${esc(r.hsn || "N/A")} (${r.rate}%)</td><td class="r">${fmt(r.taxable)}</td><td class="r">${fmt(r.cgst)}</td><td class="r">${fmt(r.sgst)}</td><td class="r">${fmt(r.cgst + r.sgst)}</td></tr>`).join("")}
      <tr class="cx-hsn-tot"><td class="r">TOTAL</td><td class="r">${fmt(t.totalTaxable)}</td>${t.isInterState ? `<td></td><td class="r">${fmt(t.totalIGST)}</td>` : `<td class="r">${fmt(t.totalCGST)}</td><td class="r">${fmt(t.totalSGST)}</td>`}<td class="r">${fmt(t.isInterState ? t.totalIGST : t.totalCGST + t.totalSGST)}</td></tr>
    </tbody>
  </table>`;

  return `
  <div class="cx-top">
    <div>
      <div class="cx-org">${esc(org.companyName || "Your Company")}</div>
      <div class="cx-org-sub">${esc(org.address || "")}</div>
      <div class="cx-org-sub">GSTIN ${esc(org.gstin || "—")}${org.mobile ? " | " + esc(org.mobile) : ""}${org.email ? " | " + esc(org.email) : ""}</div>
    </div>
    <div class="cx-doc">
      <div class="cx-doc-t">${t.isTax ? "Tax " : ""}${esc(docLabel)}</div>
      <div class="cx-doc-c">${esc(copySubtitle)}</div>
    </div>
  </div>

  <div class="cx-meta">
    <div class="cx-bill">
      <div class="cx-lab">Bill To</div>
      <b>${esc(dealName)}</b>${doc.receiverGSTIN ? ` &middot; GSTIN ${esc(doc.receiverGSTIN)}` : ""}
      <div class="cx-addr">${esc(formatPostalAddress(doc.billingAddress))}</div>
    </div>
    <div><div class="cx-lab">${esc(docLabel)} No.</div><b>${esc(docNumber || "—")}</b><div class="cx-lab" style="margin-top:3px;">Date</div>${esc(formatDate(doc.date) || "—")}</div>
    <div><div class="cx-lab">Due Date</div>${esc(formatDate(doc.dueDate) || "—")}<div class="cx-lab" style="margin-top:3px;">Place of Supply</div>${esc(doc.placeOfSupply || "—")}</div>
    <div><div class="cx-lab">Eway Bill</div>${esc(doc.ewayBillNumber || "—")}<div class="cx-lab" style="margin-top:3px;">Ship To</div><div class="cx-addr">${esc(formatPostalAddress(doc.shippingAddress) || "Same as billing")}</div></div>
  </div>

  <table class="cx-items">
    <thead><tr>
      <th style="width:16px;">#</th><th style="text-align:left;">Item</th><th style="width:40px;">HSN</th>
      <th class="r" style="width:48px;">Rate</th><th class="r" style="width:44px;">Qty</th><th class="r" style="width:58px;">Taxable</th>
      ${taxHead}
      <th class="r" style="width:64px;">Amount</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="cx-lower">
    <div class="cx-strip">
      <div class="dc-pay-qr">${payQrSvg}<div class="dc-pay-qr-cap">Scan to pay</div></div>
      <div><b>${t.rows.length}</b> items &middot; <b>${fmt(t.totalQty)}</b> qty</div>
      <div style="margin-top:2px;">In words: INR ${esc(t.amountInWords)}</div>
      <div style="margin-top:4px;"><span class="cx-lab">Bank:</span> ${esc(bank.bank || "—")} &middot; A/c ${esc(bank.accountNumber || "—")} &middot; IFSC ${esc(bank.ifscCode || "—")}${bank.branch ? " &middot; " + esc(bank.branch) : ""}</div>
    </div>
    <div>
      <div class="cx-trow"><span>Taxable Amount</span><span>${rupee}${fmt(t.grossTaxable)}</span></div>
      ${t.documentDiscount > 0 ? `<div class="cx-trow"><span>Discount${t.discountType === "percentage" ? ` (${t.discountValue}%)` : ""}</span><span>- ${rupee}${fmt(t.documentDiscount)}</span></div>` : ""}
      ${!t.isTax ? "" : t.isInterState
        ? `<div class="cx-trow"><span>IGST</span><span>${rupee}${fmt(t.totalIGST)}</span></div>`
        : `<div class="cx-trow"><span>CGST</span><span>${rupee}${fmt(t.totalCGST)}</span></div><div class="cx-trow"><span>SGST</span><span>${rupee}${fmt(t.totalSGST)}</span></div>`}
      <div class="cx-grand"><span>Total</span><span>${rupee}${fmt(t.grandTotal)}</span></div>
      ${t.isPartiallyPaid ? `
        <div class="cx-trow"><span>Amount Paid</span><span>${rupee}${fmt(t.amountPaid)}</span></div>
        <div class="cx-grand"><span>Balance Due</span><span>${rupee}${fmt(t.balanceDue)}</span></div>` : ""}
      ${t.isFullyPaid || doc.status === "Paid" ? `<div class="cx-paid">&#10003; Paid in full</div>` : ""}
    </div>
  </div>

  ${hsn}

  <div class="cx-foot">
    <div>
      ${notes ? `<div class="cx-lab">Notes</div><div>${notes}</div>` : ""}
      ${terms ? `<div class="cx-lab" style="margin-top:4px;">Terms &amp; Conditions</div><div style="white-space:pre-line;">${terms}</div>` : ""}
    </div>
    <div class="cx-sign">
      <div style="font-weight:bold;">For ${esc(org.companyName || "Your Company")}</div>
      ${sigImg ? `<img src="${esc(sigImg)}" />` : ""}
      <div class="cx-sign-line">Authorised Signatory</div>
    </div>
  </div>

  `;
}
