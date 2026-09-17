export const blurb = "Rounded cards on a soft canvas with emerald accents.";

export const css = `
.dcsheet.t-Vibrant {
  --ink: #12271e; --muted: #5f7a6f; --accent: #0e9f6e; --accent-d: #0b6b4b; --line: #d6ece2; --wash: #f1faf5;
  font-family: "Segoe UI", Arial, Helvetica, sans-serif; font-size: 10px; color: var(--ink);
  background: #eef4f1; padding: 22px;
}
.dcsheet.t-Vibrant .vb-card { background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 16px 18px; margin-bottom: 12px; }
.dcsheet.t-Vibrant .vb-head { display: flex; justify-content: space-between; align-items: flex-start; }
.dcsheet.t-Vibrant .vb-org { font-size: 15px; font-weight: 700; }
.dcsheet.t-Vibrant .vb-org-sub { color: var(--muted); font-size: 8.5px; white-space: pre-line; }
.dcsheet.t-Vibrant .vb-pill { display: inline-block; background: var(--accent); color: #fff; padding: 5px 14px; border-radius: 999px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; font-size: 10px; }
.dcsheet.t-Vibrant .vb-copy { font-size: 7.5px; color: var(--muted); text-transform: uppercase; letter-spacing: .8px; margin-top: 4px; text-align: right; }
.dcsheet.t-Vibrant .vb-no { text-align: right; font-size: 11px; margin-top: 4px; }
.dcsheet.t-Vibrant .vb-cols { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }
.dcsheet.t-Vibrant .vb-k { text-transform: uppercase; letter-spacing: .8px; font-size: 7.5px; color: var(--accent-d); font-weight: 700; margin-bottom: 4px; }
.dcsheet.t-Vibrant .vb-pname { font-weight: 700; font-size: 11px; }
.dcsheet.t-Vibrant .vb-addr { white-space: pre-line; color: var(--muted); }
.dcsheet.t-Vibrant .vb-mrow { display: flex; justify-content: space-between; padding: 2px 0; }
.dcsheet.t-Vibrant .vb-mrow span:first-child { color: var(--muted); }
.dcsheet.t-Vibrant table.vb-items { width: 100%; border-collapse: separate; border-spacing: 0; border-radius: 12px; overflow: hidden; border: 1px solid var(--line); }
.dcsheet.t-Vibrant .vb-items th { background: var(--accent); color: #fff; text-transform: uppercase; font-size: 8px; letter-spacing: .5px; padding: 9px 10px; border: 0; }
.dcsheet.t-Vibrant .vb-items td { padding: 9px 10px; border: 0; border-bottom: 1px solid var(--line); vertical-align: top; }
.dcsheet.t-Vibrant .vb-items tbody tr:nth-child(even) td { background: var(--wash); }
.dcsheet.t-Vibrant .vb-items tbody tr:last-child td { border-bottom: 0; }
.dcsheet.t-Vibrant .vb-iname { font-weight: 700; }
.dcsheet.t-Vibrant .vb-idesc { color: var(--muted); font-size: 8.5px; margin-top: 1px; white-space: pre-line; }
.dcsheet.t-Vibrant .vb-tsub { color: var(--muted); font-size: 8px; }
.dcsheet.t-Vibrant .vb-split { display: grid; grid-template-columns: 1fr 260px; gap: 12px; align-items: start; }
.dcsheet.t-Vibrant .vb-bank-row { display: flex; align-items: center; gap: 16px; }
.dcsheet.t-Vibrant .vb-pay-qr { flex-shrink: 0; text-align: center; }
.dcsheet.t-Vibrant .vb-pay-qr svg { width: 58px; height: 58px; display: block; }
.dcsheet.t-Vibrant .vb-totcard { background: var(--wash); border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; }
.dcsheet.t-Vibrant .vb-trow { display: flex; justify-content: space-between; padding: 4px 0; }
.dcsheet.t-Vibrant .vb-trow span:first-child { color: var(--muted); }
.dcsheet.t-Vibrant .vb-grand { display: flex; justify-content: space-between; padding: 8px 0 2px; margin-top: 4px; border-top: 2px solid var(--accent); font-size: 15px; font-weight: 700; color: var(--accent-d); }
.dcsheet.t-Vibrant .vb-paid { text-align: right; color: var(--accent-d); font-weight: 700; margin-top: 6px; }
.dcsheet.t-Vibrant table.vb-hsn { width: 100%; border-collapse: collapse; border-radius: 12px; overflow: hidden; border: 1px solid var(--line); font-size: 8.5px; }
.dcsheet.t-Vibrant .vb-hsn th { background: var(--wash); color: var(--accent-d); text-transform: uppercase; letter-spacing: .5px; padding: 6px 8px; border: 0; border-bottom: 1px solid var(--line); }
.dcsheet.t-Vibrant .vb-hsn td { padding: 6px 8px; border: 0; border-bottom: 1px solid var(--line); }
.dcsheet.t-Vibrant .vb-hsn .vb-hsn-tot td { font-weight: 700; }
.dcsheet.t-Vibrant .vb-foot { display: grid; grid-template-columns: 1fr 200px; gap: 14px; }
.dcsheet.t-Vibrant .vb-sign { text-align: right; }
.dcsheet.t-Vibrant .vb-sign img { max-height: 44px; margin-left: auto; display: block; object-fit: contain; }
.dcsheet.t-Vibrant .vb-sign-line { border-top: 1px solid var(--ink); padding-top: 4px; margin-top: 30px; }
.dcsheet.t-Vibrant .r { text-align: right; }
.dcsheet.t-Vibrant .c { text-align: center; }
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
      <td class="c" style="width:22px;color:#5f7a6f;">${i + 1}</td>
      <td><div class="vb-iname">${esc(r.name) || "&mdash;"}</div>${r.description ? `<div class="vb-idesc">${esc(r.description)}</div>` : ""}${r.hsn ? `<div class="vb-tsub">HSN ${esc(r.hsn)}</div>` : ""}</td>
      <td class="r">${fmt(r.rate)}</td>
      <td class="r nowrap">${r.qty}${r.unit ? " " + esc(r.unit) : ""}</td>
      <td class="r">${fmt(r.taxable)}</td>
      ${!t.isTax ? "" : t.isInterState
        ? `<td class="r">${fmt(r.igst)}<div class="vb-tsub">${r.igstRate || 0}%</div></td>`
        : `<td class="r">${fmt(r.cgst)}<div class="vb-tsub">${r.cgstRate || 0}%</div></td><td class="r">${fmt(r.sgst)}<div class="vb-tsub">${r.sgstRate || 0}%</div></td>`}
      <td class="r" style="font-weight:700;">${fmt(r.amount)}</td>
    </tr>`).join("") : `<tr><td colspan="9" class="c" style="padding:18px;">No items</td></tr>`;

  const hsn = !t.isTax ? "" : `
  <table class="vb-hsn">
    <thead><tr>
      <th>HSN / SAC</th><th class="r">Taxable</th>
      ${t.isInterState ? `<th class="r">IGST</th>` : `<th class="r">CGST</th><th class="r">SGST</th>`}
      <th class="r">Total Tax</th>
    </tr></thead>
    <tbody>
      ${t.hsnRows.map((r) => t.isInterState
        ? `<tr><td>${esc(r.hsn || "N/A")} &middot; ${r.rate}%</td><td class="r">${fmt(r.taxable)}</td><td class="r">${fmt(r.igst)}</td><td class="r">${fmt(r.igst)}</td></tr>`
        : `<tr><td>${esc(r.hsn || "N/A")} &middot; ${r.rate}%</td><td class="r">${fmt(r.taxable)}</td><td class="r">${fmt(r.cgst)}</td><td class="r">${fmt(r.sgst)}</td><td class="r">${fmt(r.cgst + r.sgst)}</td></tr>`).join("")}
      <tr class="vb-hsn-tot"><td>Total</td><td class="r">${fmt(t.totalTaxable)}</td>${t.isInterState ? `<td class="r">${fmt(t.totalIGST)}</td>` : `<td class="r">${fmt(t.totalCGST)}</td><td class="r">${fmt(t.totalSGST)}</td>`}<td class="r">${fmt(t.isInterState ? t.totalIGST : t.totalCGST + t.totalSGST)}</td></tr>
    </tbody>
  </table>`;

  return `
  <div class="vb-card">
    <div class="vb-head">
      <div>
        <div class="vb-org">${esc(org.companyName || "Your Company")}</div>
        <div class="vb-org-sub">${esc(org.address || "")}</div>
        <div class="vb-org-sub">GSTIN ${esc(org.gstin || "—")}${org.email ? "  &middot;  " + esc(org.email) : ""}</div>
      </div>
      <div>
        <div class="vb-pill">${t.isTax ? "Tax " : ""}${esc(docLabel)}</div>
        <div class="vb-copy">${esc(copySubtitle)}</div>
        <div class="vb-no">No. <b>${esc(docNumber || "—")}</b></div>
      </div>
    </div>
  </div>

  <div class="vb-card">
    <div class="vb-cols">
      <div>
        <div class="vb-k">Billed to</div>
        <div class="vb-pname">${esc(dealName)}</div>
        ${doc.receiverGSTIN ? `<div style="color:#5f7a6f;">GSTIN ${esc(doc.receiverGSTIN)}</div>` : ""}
        <div class="vb-addr">${esc(formatPostalAddress(doc.billingAddress))}</div>
      </div>
      <div>
        <div class="vb-k">Shipped to</div>
        <div class="vb-addr">${esc(formatPostalAddress(doc.shippingAddress) || formatPostalAddress(doc.billingAddress))}</div>
      </div>
      <div>
        <div class="vb-k">Details</div>
        <div class="vb-mrow"><span>Date</span><b>${esc(formatDate(doc.date) || "—")}</b></div>
        <div class="vb-mrow"><span>Due</span><b>${esc(formatDate(doc.dueDate) || "—")}</b></div>
        <div class="vb-mrow"><span>Place of supply</span><b>${esc(doc.placeOfSupply || "—")}</b></div>
        ${doc.ewayBillNumber ? `<div class="vb-mrow"><span>Eway bill</span><b>${esc(doc.ewayBillNumber)}</b></div>` : ""}
      </div>
    </div>
  </div>

  <div class="vb-card">
    <table class="vb-items">
      <thead><tr>
        <th></th><th style="text-align:left;">Item</th>
        <th class="r">Rate</th><th class="r">Qty</th><th class="r">Taxable</th>
        ${taxHead}
        <th class="r">Amount</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div style="color:#5f7a6f;margin-top:10px;">In words: INR ${esc(t.amountInWords)} &middot; ${t.rows.length} item${t.rows.length === 1 ? "" : "s"} / ${fmt(t.totalQty)} qty</div>

    <div class="vb-split" style="margin-top:12px;">
      <div class="vb-bank-row">
        <div>
          <div class="vb-k">Bank details</div>
          <div>${esc(bank.bank || "—")}</div>
          <div style="color:#5f7a6f;">A/c No.: ${esc(bank.accountNumber || "—")}</div>
          <div style="color:#5f7a6f;">IFSC: ${esc(bank.ifscCode || "—")}</div>
          ${bank.branch ? `<div style="color:#5f7a6f;">Branch: ${esc(bank.branch)}</div>` : ""}
        </div>
        <div class="vb-pay-qr">${payQrSvg}<div class="dc-pay-qr-cap">Scan to pay</div></div>
      </div>
      <div class="vb-totcard">
        <div class="vb-trow"><span>Taxable amount</span><span>${rupee}${fmt(t.grossTaxable)}</span></div>
        ${t.documentDiscount > 0 ? `<div class="vb-trow"><span>Discount${t.discountType === "percentage" ? ` (${t.discountValue}%)` : ""}</span><span>- ${rupee}${fmt(t.documentDiscount)}</span></div>` : ""}
        ${!t.isTax ? "" : t.isInterState
          ? `<div class="vb-trow"><span>IGST</span><span>${rupee}${fmt(t.totalIGST)}</span></div>`
          : `<div class="vb-trow"><span>CGST</span><span>${rupee}${fmt(t.totalCGST)}</span></div><div class="vb-trow"><span>SGST</span><span>${rupee}${fmt(t.totalSGST)}</span></div>`}
        <div class="vb-grand"><span>Total</span><span>${rupee}${fmt(t.grandTotal)}</span></div>
        ${t.isPartiallyPaid ? `
          <div class="vb-trow"><span>Amount paid</span><span>${rupee}${fmt(t.amountPaid)}</span></div>
          <div class="vb-grand"><span>Balance due</span><span>${rupee}${fmt(t.balanceDue)}</span></div>` : ""}
        ${t.isFullyPaid || doc.status === "Paid" ? `<div class="vb-paid">&#10003; Paid in full</div>` : ""}
      </div>
    </div>
  </div>

  ${t.isTax ? `<div class="vb-card">${hsn}</div>` : ""}

  <div class="vb-card">
    <div class="vb-foot">
      <div style="color:#5f7a6f;font-size:9px;">
        ${notes ? `<div class="vb-k">Notes</div><div>${notes}</div>` : ""}
        ${terms ? `<div class="vb-k" style="margin-top:8px;">Terms &amp; Conditions</div><div style="white-space:pre-line;">${terms}</div>` : ""}
        ${!notes && !terms ? "Thank you for your business." : ""}
      </div>
      <div class="vb-sign">
        <div style="font-weight:700;">For ${esc(org.companyName || "Your Company")}</div>
        ${sigImg ? `<img src="${esc(sigImg)}" />` : ""}
        <div class="vb-sign-line">Authorised Signatory</div>
      </div>
    </div>
  </div>

  `;
}
