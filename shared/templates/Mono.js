export const blurb = "Monospace ledger style, pure black and white, hairline rules.";

export const css = `
.dcsheet.t-Mono {
  --ink: #000; --muted: #444; --line: #000;
  font-family: "Courier New", Courier, monospace; font-size: 10px; color: var(--ink);
  padding: 30px 34px; line-height: 1.45;
}
.dcsheet.t-Mono .mo-rule { border-top: 1px solid var(--line); margin: 10px 0; }
.dcsheet.t-Mono .mo-rule.dash { border-top: 1px solid var(--line); }
.dcsheet.t-Mono .mo-rule.thick { border-top: 2px solid var(--line); }
.dcsheet.t-Mono .mo-title { text-align: center; font-weight: bold; font-size: 13px; letter-spacing: 4px; }
.dcsheet.t-Mono .mo-copy { text-align: center; font-size: 8px; letter-spacing: 2px; color: var(--muted); }
.dcsheet.t-Mono .mo-two { display: flex; justify-content: space-between; gap: 24px; }
.dcsheet.t-Mono .mo-two > div { flex: 1; }
.dcsheet.t-Mono .mo-lbl { font-weight: bold; text-transform: uppercase; }
.dcsheet.t-Mono .mo-kv { display: flex; }
.dcsheet.t-Mono .mo-kv .k { width: 92px; color: var(--muted); }
.dcsheet.t-Mono .mo-addr { white-space: pre-line; }
.dcsheet.t-Mono table.mo-items { width: 100%; border-collapse: collapse; }
.dcsheet.t-Mono .mo-items th { text-align: left; border-bottom: 1px solid var(--line); padding: 4px 6px; font-weight: bold; text-transform: uppercase; font-size: 9px; }
.dcsheet.t-Mono .mo-items td { padding: 4px 6px; border-bottom: 1px solid #999; vertical-align: top; }
.dcsheet.t-Mono .mo-idesc { color: var(--muted); font-size: 9px; }
.dcsheet.t-Mono .mo-sum { display: flex; justify-content: flex-end; }
.dcsheet.t-Mono .mo-sum-in { width: 280px; }
.dcsheet.t-Mono .mo-srow { display: flex; justify-content: space-between; }
.dcsheet.t-Mono .mo-srow .k { color: var(--muted); }
.dcsheet.t-Mono .mo-grand { display: flex; justify-content: space-between; font-weight: bold; font-size: 12px; padding: 3px 0; border-top: 2px solid var(--line); border-bottom: 2px solid var(--line); }
.dcsheet.t-Mono .mo-paid { text-align: right; font-weight: bold; }
.dcsheet.t-Mono table.mo-hsn { width: 100%; border-collapse: collapse; font-size: 9px; }
.dcsheet.t-Mono .mo-hsn th, .dcsheet.t-Mono .mo-hsn td { border: 1px solid var(--line); padding: 3px 6px; text-align: left; }
.dcsheet.t-Mono .mo-hsn .mo-hsn-tot td { font-weight: bold; }
.dcsheet.t-Mono .mo-foot { display: flex; justify-content: space-between; gap: 24px; }
.dcsheet.t-Mono .mo-sign { text-align: right; min-width: 180px; }
.dcsheet.t-Mono .mo-sign img { max-height: 40px; margin: 2px 0 0 auto; display: block; object-fit: contain; }
.dcsheet.t-Mono .mo-sign-line { display: inline-block; min-width: 120px; border-top: 1px solid var(--line); padding-top: 3px; margin-top: 6px; }
.dcsheet.t-Mono .dc-pay-qr svg { width: 88px; height: 88px; }
.dcsheet.t-Mono .r { text-align: right; }
.dcsheet.t-Mono .c { text-align: center; }
`;

export function html(ctx) {
  const {
    t, doc, org, bank, esc, fmt, formatDate, formatPostalAddress,
    dealName, docLabel, docNumber, notes, terms, copySubtitle, payQrSvg,
  } = ctx;
  const sigImg = doc.signature || org.signatureUrl;
  const R = "Rs.";

  const taxHead = !t.isTax ? ""
    : t.isInterState ? `<th class="r">IGST</th>`
    : `<th class="r">CGST</th><th class="r">SGST</th>`;

  const rows = t.rows.length ? t.rows.map((r, i) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td>${esc(r.name) || "-"}${r.description ? `<div class="mo-idesc">${esc(r.description)}</div>` : ""}${r.hsn ? `<div class="mo-idesc">HSN ${esc(r.hsn)}</div>` : ""}</td>
      <td class="r">${fmt(r.rate)}</td>
      <td class="r nowrap">${r.qty}${r.unit ? " " + esc(r.unit) : ""}</td>
      <td class="r">${fmt(r.taxable)}</td>
      ${!t.isTax ? "" : t.isInterState
        ? `<td class="r">${fmt(r.igst)} (${r.igstRate || 0}%)</td>`
        : `<td class="r">${fmt(r.cgst)} (${r.cgstRate || 0}%)</td><td class="r">${fmt(r.sgst)} (${r.sgstRate || 0}%)</td>`}
      <td class="r">${fmt(r.amount)}</td>
    </tr>`).join("") : `<tr><td colspan="9" class="c" style="padding:12px;">-- no items --</td></tr>`;

  const hsn = !t.isTax ? "" : `
  <table class="mo-hsn">
    <thead><tr>
      <th>HSN/SAC</th><th class="r">Taxable</th>
      ${t.isInterState ? `<th class="r">IGST Rate</th><th class="r">IGST Amt</th>` : `<th class="r">CGST</th><th class="r">SGST</th>`}
      <th class="r">Total Tax</th>
    </tr></thead>
    <tbody>
      ${t.hsnRows.map((r) => t.isInterState
        ? `<tr><td>${esc(r.hsn || "N/A")}</td><td class="r">${fmt(r.taxable)}</td><td class="r">${r.rate}%</td><td class="r">${fmt(r.igst)}</td><td class="r">${fmt(r.igst)}</td></tr>`
        : `<tr><td>${esc(r.hsn || "N/A")} (${r.rate}%)</td><td class="r">${fmt(r.taxable)}</td><td class="r">${fmt(r.cgst)}</td><td class="r">${fmt(r.sgst)}</td><td class="r">${fmt(r.cgst + r.sgst)}</td></tr>`).join("")}
      <tr class="mo-hsn-tot"><td>TOTAL</td><td class="r">${fmt(t.totalTaxable)}</td>${t.isInterState ? `<td></td><td class="r">${fmt(t.totalIGST)}</td>` : `<td class="r">${fmt(t.totalCGST)}</td><td class="r">${fmt(t.totalSGST)}</td>`}<td class="r">${fmt(t.isInterState ? t.totalIGST : t.totalCGST + t.totalSGST)}</td></tr>
    </tbody>
  </table>`;

  return `
  <div class="mo-title">${t.isTax ? "TAX " : ""}${esc(docLabel).toUpperCase()}</div>
  <div class="mo-copy">${esc(copySubtitle)}</div>
  <div class="mo-rule thick"></div>

  <div class="mo-two">
    <div>
      <div class="mo-lbl">${esc(org.companyName || "YOUR COMPANY")}</div>
      <div class="mo-addr">${esc(org.address || "")}</div>
      <div>GSTIN : ${esc(org.gstin || "-")}</div>
      ${org.mobile ? `<div>Phone : ${esc(org.mobile)}</div>` : ""}
      ${org.email ? `<div>Email : ${esc(org.email)}</div>` : ""}
    </div>
    <div>
      <div class="mo-kv"><span class="k">${esc(docLabel)} #</span><span>${esc(docNumber || "-")}</span></div>
      <div class="mo-kv"><span class="k">Date</span><span>${esc(formatDate(doc.date) || "-")}</span></div>
      <div class="mo-kv"><span class="k">Due Date</span><span>${esc(formatDate(doc.dueDate) || "-")}</span></div>
      <div class="mo-kv"><span class="k">Place/Supply</span><span>${esc(doc.placeOfSupply || "-")}</span></div>
      ${doc.ewayBillNumber ? `<div class="mo-kv"><span class="k">Eway Bill</span><span>${esc(doc.ewayBillNumber)}</span></div>` : ""}
    </div>
  </div>

  <div class="mo-rule dash"></div>

  <div class="mo-two">
    <div>
      <div class="mo-lbl">Bill To</div>
      <div>${esc(dealName)}</div>
      ${doc.receiverGSTIN ? `<div>GSTIN : ${esc(doc.receiverGSTIN)}</div>` : ""}
      <div class="mo-addr">${esc(formatPostalAddress(doc.billingAddress))}</div>
    </div>
    <div>
      <div class="mo-lbl">Ship To</div>
      <div class="mo-addr">${esc(formatPostalAddress(doc.shippingAddress) || formatPostalAddress(doc.billingAddress))}</div>
    </div>
  </div>

  <div class="mo-rule"></div>

  <table class="mo-items">
    <thead><tr>
      <th class="c" style="width:20px;">#</th><th>Item</th>
      <th class="r" style="width:56px;">Rate</th><th class="r" style="width:52px;">Qty</th><th class="r" style="width:70px;">Taxable</th>
      ${taxHead}
      <th class="r" style="width:74px;">Amount</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="mo-rule"></div>
  <div>Total Items / Qty : ${t.rows.length} / ${fmt(t.totalQty)}</div>
  <div>Amount in words : INR ${esc(t.amountInWords)}</div>
  <div class="mo-rule dash"></div>

  <div class="mo-sum">
    <div class="mo-sum-in">
      <div class="mo-srow"><span class="k">Taxable Amount</span><span>${R} ${fmt(t.grossTaxable)}</span></div>
      ${t.documentDiscount > 0 ? `<div class="mo-srow"><span class="k">Discount${t.discountType === "percentage" ? ` (${t.discountValue}%)` : ""}</span><span>- ${R} ${fmt(t.documentDiscount)}</span></div>` : ""}
      ${!t.isTax ? "" : t.isInterState
        ? `<div class="mo-srow"><span class="k">IGST</span><span>${R} ${fmt(t.totalIGST)}</span></div>`
        : `<div class="mo-srow"><span class="k">CGST</span><span>${R} ${fmt(t.totalCGST)}</span></div><div class="mo-srow"><span class="k">SGST</span><span>${R} ${fmt(t.totalSGST)}</span></div>`}
      <div class="mo-grand"><span>TOTAL</span><span>${R} ${fmt(t.grandTotal)}</span></div>
      ${t.isPartiallyPaid ? `
        <div class="mo-srow"><span class="k">Amount Paid</span><span>${R} ${fmt(t.amountPaid)}</span></div>
        <div class="mo-grand"><span>BALANCE DUE</span><span>${R} ${fmt(t.balanceDue)}</span></div>` : ""}
      ${t.isFullyPaid || doc.status === "Paid" ? `<div class="mo-paid">[ PAID IN FULL ]</div>` : ""}
    </div>
  </div>

  ${hsn ? `<div class="mo-rule dash"></div>${hsn}` : ""}

  <div class="mo-rule"></div>
  <div class="mo-two">
    <div>
      <div class="dc-pay-qr">${payQrSvg}<div class="dc-pay-qr-cap">Scan to pay</div></div>
      <div class="mo-lbl">Bank Details</div>
      <div class="mo-kv"><span class="k">Bank</span><span>${esc(bank.bank || "-")}</span></div>
      <div class="mo-kv"><span class="k">A/c No.</span><span>${esc(bank.accountNumber || "-")}</span></div>
      <div class="mo-kv"><span class="k">IFSC</span><span>${esc(bank.ifscCode || "-")}</span></div>
      ${bank.branch ? `<div class="mo-kv"><span class="k">Branch</span><span>${esc(bank.branch)}</span></div>` : ""}
      ${notes ? `<div class="mo-lbl" style="margin-top:8px;">Notes</div><div>${notes}</div>` : ""}
      ${terms ? `<div class="mo-lbl" style="margin-top:8px;">Terms &amp; Conditions</div><div style="white-space:pre-line;">${terms}</div>` : ""}
    </div>
    <div class="mo-sign">
      <div>For ${esc(org.companyName || "Your Company")}</div>
      ${sigImg ? `<img src="${esc(sigImg)}" />` : ""}
      <div class="mo-sign-line">Authorised Signatory</div>
    </div>
  </div>

  `;
}
