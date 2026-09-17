export const blurb = "Airy layout with hairline rules, generous spacing, no boxes.";

export const css = `
.dcsheet.t-Minimal {
  --ink: #1a1a1a; --muted: #8a8a8a; --hair: #e6e6e6; --rule: #1a1a1a;
  font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 10px; color: var(--ink);
  padding: 40px 44px; line-height: 1.5;
}
.dcsheet.t-Minimal .mn-top { display: flex; justify-content: space-between; align-items: flex-start; }
.dcsheet.t-Minimal .mn-doc { font-size: 22px; font-weight: 300; letter-spacing: 6px; text-transform: uppercase; }
.dcsheet.t-Minimal .mn-copy { font-size: 8px; letter-spacing: 1.5px; color: var(--muted); text-transform: uppercase; margin-top: 4px; }
.dcsheet.t-Minimal .mn-org { text-align: right; }
.dcsheet.t-Minimal .mn-org b { font-size: 13px; font-weight: 600; }
.dcsheet.t-Minimal .mn-org div { color: var(--muted); }
.dcsheet.t-Minimal .mn-rule { border-bottom: 1px solid var(--rule); margin: 22px 0; }
.dcsheet.t-Minimal .mn-hair { border-bottom: 1px solid var(--hair); }
.dcsheet.t-Minimal .mn-cols { display: flex; gap: 40px; }
.dcsheet.t-Minimal .mn-cols > div { flex: 1; }
.dcsheet.t-Minimal .mn-k { font-size: 8px; letter-spacing: 1.2px; text-transform: uppercase; color: var(--muted); margin-bottom: 4px; }
.dcsheet.t-Minimal .mn-party-name { font-weight: 600; font-size: 11px; }
.dcsheet.t-Minimal .mn-addr { white-space: pre-line; color: #555; }
.dcsheet.t-Minimal .mn-meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px 24px; }
.dcsheet.t-Minimal .mn-meta b { display: block; font-weight: 600; }
.dcsheet.t-Minimal table.mn-items { width: 100%; border-collapse: collapse; margin-top: 26px; }
.dcsheet.t-Minimal .mn-items th { text-align: left; font-size: 8px; letter-spacing: 1.2px; text-transform: uppercase; color: var(--muted); font-weight: 600; padding: 0 0 8px; border-bottom: 1px solid var(--rule); }
.dcsheet.t-Minimal .mn-items td { padding: 12px 0; border-bottom: 1px solid var(--hair); vertical-align: top; }
.dcsheet.t-Minimal .mn-items th + th, .dcsheet.t-Minimal .mn-items td + td { padding-left: 14px; }
.dcsheet.t-Minimal .mn-iname { font-weight: 600; }
.dcsheet.t-Minimal .mn-idesc { color: var(--muted); font-size: 8.5px; margin-top: 2px; white-space: pre-line; }
.dcsheet.t-Minimal .mn-tax-sub { color: var(--muted); font-size: 8px; }
.dcsheet.t-Minimal .mn-sum { display: flex; justify-content: flex-end; margin-top: 20px; }
.dcsheet.t-Minimal .mn-sum-in { width: 300px; }
.dcsheet.t-Minimal .mn-srow { display: flex; justify-content: space-between; padding: 6px 0; }
.dcsheet.t-Minimal .mn-srow span:first-child { color: var(--muted); }
.dcsheet.t-Minimal .mn-grand { display: flex; justify-content: space-between; padding: 12px 0 6px; margin-top: 6px; border-top: 1px solid var(--rule); font-size: 15px; font-weight: 600; }
.dcsheet.t-Minimal .mn-paid { text-align: right; color: #15803d; font-weight: 600; margin-top: 8px; }
.dcsheet.t-Minimal .mn-words { color: var(--muted); margin-top: 18px; }
.dcsheet.t-Minimal .mn-lower { display: flex; gap: 40px; margin-top: 26px; }
.dcsheet.t-Minimal .mn-lower > div { flex: 1; }
.dcsheet.t-Minimal .mn-lower .mn-r { text-align: right; }
/* Bank lines and the QR sit side by side, close together, above notes/terms. */
.dcsheet.t-Minimal .mn-bank-row { display: flex; align-items: center; gap: 16px; }
.dcsheet.t-Minimal .mn-pay-qr { flex-shrink: 0; text-align: center; margin-top: 14px; }
.dcsheet.t-Minimal .mn-pay-qr svg { width: 58px; height: 58px; display: block; }
.dcsheet.t-Minimal .mn-sign-img { max-height: 44px; margin-left: auto; display: block; object-fit: contain; margin-bottom: 4px; }
.dcsheet.t-Minimal .mn-sign-line { display: inline-block; border-top: 1px solid var(--rule); padding-top: 4px; min-width: 115px; }
.dcsheet.t-Minimal table.mn-hsn { width: 100%; border-collapse: collapse; margin-top: 24px; }
.dcsheet.t-Minimal .mn-hsn th { text-align: left; font-size: 8px; letter-spacing: 1px; text-transform: uppercase; color: var(--muted); padding: 0 8px 6px 0; border-bottom: 1px solid var(--rule); }
.dcsheet.t-Minimal .mn-hsn td { padding: 8px 8px 8px 0; border-bottom: 1px solid var(--hair); }
.dcsheet.t-Minimal .mn-hsn .mn-hsn-tot td { font-weight: 600; border-bottom: 1px solid var(--rule); }
.dcsheet.t-Minimal .r { text-align: right; }
.dcsheet.t-Minimal .c { text-align: center; }
`;

export function html(ctx) {
  const {
    t, doc, org, bank, esc, fmt, formatDate, formatPostalAddress,
    dealName, docLabel, docNumber, notes, terms, copySubtitle, payQrSvg,
  } = ctx;
  const sigImg = doc.signature || org.signatureUrl;
  const rupee = "&#8377;";

  const taxHead = !t.isTax ? ""
    : t.isInterState ? `<th class="r" style="width:80px;">IGST</th>`
    : `<th class="r" style="width:72px;">CGST</th><th class="r" style="width:72px;">SGST</th>`;

  const rows = t.rows.length ? t.rows.map((r, i) => `
    <tr>
      <td class="c" style="width:20px;color:#8a8a8a;">${i + 1}</td>
      <td><div class="mn-iname">${esc(r.name) || "&mdash;"}</div>${r.description ? `<div class="mn-idesc">${esc(r.description)}</div>` : ""}${r.hsn ? `<div class="mn-idesc">HSN ${esc(r.hsn)}</div>` : ""}</td>
      <td class="r">${fmt(r.rate)}</td>
      <td class="r nowrap">${r.qty}${r.unit ? " " + esc(r.unit) : ""}</td>
      <td class="r">${fmt(r.taxable)}</td>
      ${!t.isTax ? "" : t.isInterState
        ? `<td class="r">${fmt(r.igst)}<div class="mn-tax-sub">${r.igstRate || 0}%</div></td>`
        : `<td class="r">${fmt(r.cgst)}<div class="mn-tax-sub">${r.cgstRate || 0}%</div></td>
           <td class="r">${fmt(r.sgst)}<div class="mn-tax-sub">${r.sgstRate || 0}%</div></td>`}
      <td class="r" style="font-weight:600;">${fmt(r.amount)}</td>
    </tr>`).join("") : `<tr><td colspan="9" class="c" style="padding:20px;color:#8a8a8a;">No items</td></tr>`;

  const hsn = !t.isTax ? "" : `
  <table class="mn-hsn">
    <thead><tr>
      <th>HSN / SAC</th><th class="r">Taxable</th>
      ${t.isInterState ? `<th class="r">IGST</th>` : `<th class="r">CGST</th><th class="r">SGST</th>`}
      <th class="r">Total Tax</th>
    </tr></thead>
    <tbody>
      ${t.hsnRows.map((r) => t.isInterState
        ? `<tr><td>${esc(r.hsn || "N/A")} &middot; ${r.rate}%</td><td class="r">${fmt(r.taxable)}</td><td class="r">${fmt(r.igst)}</td><td class="r">${fmt(r.igst)}</td></tr>`
        : `<tr><td>${esc(r.hsn || "N/A")} &middot; ${r.rate}%</td><td class="r">${fmt(r.taxable)}</td><td class="r">${fmt(r.cgst)}</td><td class="r">${fmt(r.sgst)}</td><td class="r">${fmt(r.cgst + r.sgst)}</td></tr>`).join("")}
      <tr class="mn-hsn-tot"><td>Total</td><td class="r">${fmt(t.totalTaxable)}</td>${t.isInterState ? `<td class="r">${fmt(t.totalIGST)}</td>` : `<td class="r">${fmt(t.totalCGST)}</td><td class="r">${fmt(t.totalSGST)}</td>`}<td class="r">${fmt(t.isInterState ? t.totalIGST : t.totalCGST + t.totalSGST)}</td></tr>
    </tbody>
  </table>`;

  return `
  <div class="mn-top">
    <div>
      <div class="mn-doc">${t.isTax ? "Tax " : ""}${esc(docLabel)}</div>
      <div class="mn-copy">${esc(copySubtitle)}</div>
    </div>
    <div class="mn-org">
      <b>${esc(org.companyName || "Your Company")}</b>
      <div class="mn-addr">${esc(org.address || "")}</div>
      <div>GSTIN ${esc(org.gstin || "—")}</div>
      ${org.email ? `<div>${esc(org.email)}</div>` : ""}
    </div>
  </div>

  <div class="mn-rule"></div>

  <div class="mn-cols">
    <div>
      <div class="mn-k">Billed to</div>
      <div class="mn-party-name">${esc(dealName)}</div>
      ${doc.receiverGSTIN ? `<div style="color:#555;">GSTIN ${esc(doc.receiverGSTIN)}</div>` : ""}
      <div class="mn-addr">${esc(formatPostalAddress(doc.billingAddress))}</div>
    </div>
    <div>
      <div class="mn-k">Shipped to</div>
      <div class="mn-addr">${esc(formatPostalAddress(doc.shippingAddress) || formatPostalAddress(doc.billingAddress))}</div>
    </div>
    <div>
      <div class="mn-k">Details</div>
      <div class="mn-meta">
        <div><span class="mn-tax-sub">No.</span><b>${esc(docNumber || "—")}</b></div>
        <div><span class="mn-tax-sub">Date</span><b>${esc(formatDate(doc.date) || "—")}</b></div>
        <div><span class="mn-tax-sub">Due</span><b>${esc(formatDate(doc.dueDate) || "—")}</b></div>
        <div><span class="mn-tax-sub">Place of supply</span><b>${esc(doc.placeOfSupply || "—")}</b></div>
      </div>
    </div>
  </div>

  <table class="mn-items">
    <thead><tr>
      <th></th><th>Item</th>
      <th class="r">Rate</th><th class="r">Qty</th><th class="r">Taxable</th>
      ${taxHead}
      <th class="r">Amount</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="mn-sum">
    <div class="mn-sum-in">
      <div class="mn-srow"><span>Taxable amount</span><span>${rupee}${fmt(t.grossTaxable)}</span></div>
      ${t.documentDiscount > 0 ? `<div class="mn-srow"><span>Discount${t.discountType === "percentage" ? ` (${t.discountValue}%)` : ""}</span><span>- ${rupee}${fmt(t.documentDiscount)}</span></div>` : ""}
      ${!t.isTax ? "" : t.isInterState
        ? `<div class="mn-srow"><span>IGST</span><span>${rupee}${fmt(t.totalIGST)}</span></div>`
        : `<div class="mn-srow"><span>CGST</span><span>${rupee}${fmt(t.totalCGST)}</span></div><div class="mn-srow"><span>SGST</span><span>${rupee}${fmt(t.totalSGST)}</span></div>`}
      <div class="mn-grand"><span>Total</span><span>${rupee}${fmt(t.grandTotal)}</span></div>
      ${t.isPartiallyPaid ? `
        <div class="mn-srow"><span>Amount paid</span><span>${rupee}${fmt(t.amountPaid)}</span></div>
        <div class="mn-grand"><span>Balance due</span><span>${rupee}${fmt(t.balanceDue)}</span></div>` : ""}
      ${t.isFullyPaid || doc.status === "Paid" ? `<div class="mn-paid">&#10003; Paid in full</div>` : ""}
    </div>
  </div>

  <div class="mn-words">In words: INR ${esc(t.amountInWords)}${t.rows.length ? ` &middot; ${t.rows.length} item${t.rows.length === 1 ? "" : "s"} / ${fmt(t.totalQty)} qty` : ""}</div>

  ${hsn}

  <div class="mn-lower">
    <div>
      <div class="mn-bank-row">
        <div>
          <div class="mn-k">Bank details</div>
          <div>${esc(bank.bank || "—")}</div>
          <div style="color:#555;">A/c No.: ${esc(bank.accountNumber || "—")}</div>
          <div style="color:#555;">IFSC: ${esc(bank.ifscCode || "—")}</div>
          ${bank.branch ? `<div style="color:#555;">Branch: ${esc(bank.branch)}</div>` : ""}
        </div>
        <div class="mn-pay-qr">${payQrSvg}<div class="dc-pay-qr-cap">Scan to pay</div></div>
      </div>
      ${notes ? `<div class="mn-k" style="margin-top:14px;">Notes</div><div style="color:#555;">${notes}</div>` : ""}
      ${terms ? `<div class="mn-k" style="margin-top:14px;">Terms</div><div style="color:#555;white-space:pre-line;">${terms}</div>` : ""}
    </div>
    <div class="mn-r">
      <div style="margin-bottom:10px;">For ${esc(org.companyName || "Your Company")}</div>
      ${sigImg ? `<img class="mn-sign-img" src="${esc(sigImg)}" />` : ""}
      <div class="mn-sign-line">Authorised Signatory</div>
    </div>
  </div>

  `;
}
