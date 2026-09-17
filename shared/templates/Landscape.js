export const blurb = "Wide, fully-ruled boxed grid layout with complete cell borders.";

export const css = `
.dcsheet.t-Landscape {
  --ink: #222; --line: #333; --muted: #555; --accent: #2f6fed;
  font-family: Arial, Helvetica, sans-serif; font-size: 10px; padding: 12px;
}
.dcsheet.t-Landscape .ls-page { border: 1px solid var(--line); display: flex; flex-direction: column; }
.dcsheet.t-Landscape .ls-header-row { position: relative; text-align: center; padding: 10px 12px; border-bottom: 1px solid var(--line); }
.dcsheet.t-Landscape .ls-title { color: var(--accent); font-weight: bold; font-size: 15px; letter-spacing: 1.5px; text-transform: uppercase; }
.dcsheet.t-Landscape .ls-copy { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); font-size: 8.5px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; }

/* Right meta column width = the combined width of the items table's
   Rate/Item..Amount columns, so the divider before it lines up with the
   "HSN/SAC | Rate/Item" rule. */
.dcsheet.t-Landscape .ls-meta-row { display: grid; grid-template-columns: 1.3fr 1fr var(--ls-rcol, 380px); border-bottom: 1px solid var(--line); }
.dcsheet.t-Landscape .ls-meta-col { padding: 10px 12px; border-right: 1px solid var(--line); }
.dcsheet.t-Landscape .ls-meta-col:last-child { border-right: 0; }
.dcsheet.t-Landscape .ls-comp-head { display: flex; align-items: center; gap: 8px; margin-bottom: 3px; }
.dcsheet.t-Landscape .ls-logo { width: 32px; height: 32px; object-fit: contain; border-radius: 50%; flex-shrink: 0; }
.dcsheet.t-Landscape .ls-comp-name { font-weight: bold; font-size: 12px; }
.dcsheet.t-Landscape .ls-comp-line { font-size: 9px; margin-top: 2px; }
.dcsheet.t-Landscape .ls-cust-title { font-size: 9px; color: var(--muted); text-transform: uppercase; margin-bottom: 4px; }
.dcsheet.t-Landscape .ls-cust-name { font-weight: bold; font-size: 11px; margin-bottom: 3px; }
.dcsheet.t-Landscape .ls-cust-line { font-size: 9px; margin-top: 2px; }
.dcsheet.t-Landscape .ls-meta-grid { display: grid; grid-template-columns: auto 1fr; gap: 3px 8px; font-size: 9.5px; }

.dcsheet.t-Landscape .ls-items-wrap { border-bottom: 1px solid var(--line); min-height: 220px; display: flex; flex-direction: column; }
/* Separate borders painted on each cell's right EDGE (not collapsed / straddling
   the grid line) so every rule is 1px and the column dividers line up exactly
   with the meta-row's box-edge dividers. The .ls-page frame and .ls-meta-row
   rule already draw the table's outer top/left/right edges. */
.dcsheet.t-Landscape .ls-items { width: 100%; flex: 1; border-collapse: separate; border-spacing: 0; table-layout: fixed; }
.dcsheet.t-Landscape .ls-items th { border: 0; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); padding: 6px 8px; font-size: 9px; background: #f8f9fa; text-transform: uppercase; font-weight: bold; }
.dcsheet.t-Landscape .ls-items td { border: 0; border-right: 1px solid var(--line); padding: 6px 8px; font-size: 9.5px; }
.dcsheet.t-Landscape .ls-items th:last-child, .dcsheet.t-Landscape .ls-items td:last-child { border-right: 0; }
.dcsheet.t-Landscape .ls-filler-row td { border-bottom: 0; }

.dcsheet.t-Landscape .ls-totals-row { display: grid; grid-template-columns: 1fr 280px; border-bottom: 1px solid var(--line); }
.dcsheet.t-Landscape .ls-totals-left { padding: 10px 12px; border-right: 1px solid var(--line); font-size: 9.5px; display: flex; justify-content: space-between; gap: 12px; }
.dcsheet.t-Landscape .ls-totals-left-text { flex: 1; min-width: 0; }
.dcsheet.t-Landscape .ls-qr-block { flex-shrink: 0; text-align: center; }
.dcsheet.t-Landscape .ls-qr-block img, .dcsheet.t-Landscape .ls-qr-block svg { width: 74px; height: 74px; display: block; }
/* "Scan to pay" QR dropped into the otherwise-empty invoice-meta column. */
.dcsheet.t-Landscape .ls-meta-qr { margin-top: 12px; text-align: center; }
.dcsheet.t-Landscape .ls-meta-qr svg { width: 82px; height: 82px; display: block; margin: 0 auto; }
.dcsheet.t-Landscape .ls-qr-cap { font-size: 7.5px; color: var(--muted); margin-top: 2px; }
.dcsheet.t-Landscape .ls-totals-right { display: flex; flex-direction: column; }
.dcsheet.t-Landscape .ls-trow { display: flex; justify-content: space-between; padding: 6px 12px; border-bottom: 1px solid var(--line); font-size: 9.5px; }
.dcsheet.t-Landscape .ls-trow:last-child { border-bottom: 0; }
.dcsheet.t-Landscape .ls-trow.grand { font-weight: bold; font-size: 12px; background: #fafafa; }

.dcsheet.t-Landscape .dc-hsn { width: 100%; border-collapse: collapse; border-bottom: 1px solid var(--line); }
.dcsheet.t-Landscape .dc-hsn th, .dcsheet.t-Landscape .dc-hsn td { border: 1px solid var(--line); padding: 5px 8px; font-size: 9px; }
.dcsheet.t-Landscape .dc-hsn th { background: #f8f9fa; font-size: 8.5px; font-weight: bold; }
.dcsheet.t-Landscape .dc-hsn tr.tot td { font-weight: bold; background: #fafafa; }

.dcsheet.t-Landscape .ls-footer-row { display: grid; grid-template-columns: 1fr 1fr 220px; padding: 10px 12px; gap: 12px; }
.dcsheet.t-Landscape .ls-notes-label, .dcsheet.t-Landscape .ls-terms-label { font-weight: bold; margin-bottom: 3px; }
.dcsheet.t-Landscape .ls-terms-body { white-space: pre-line; font-size: 9px; }
.dcsheet.t-Landscape .ls-receiver-line { border-top: 1px solid var(--line); width: 170px; margin-top: 26px; padding-top: 3px; font-size: 9px; }
.dcsheet.t-Landscape .ls-sign-block { text-align: right; }
.dcsheet.t-Landscape .ls-sign-img { max-height: 45px; margin-left: auto; object-fit: contain; }

`;

export function html(ctx) {
  const {
    t, doc, org, bank, esc, fmt, formatDate,
    dealName, docLabel, docNumber, notes, terms, copySubtitle, discountRow, hsnRows,
    payQrSvg, upiId,
  } = ctx;
  const sigImg = doc.signature || org.signatureUrl;

  // Same address formatter as Professional.js — doc.billingAddress is a
  // structured object ({ addressLine1, addressLine2, city, state, pincode,
  // country }), not a plain string, so it needs the same flattening before
  // it can be split into comma-terminated lines.
  const addrLines = (input) => {
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
    return parts.map((p, i) => (i < parts.length - 1 ? p + "," : p)).join("\n");
  };

  const itemRows = t.rows.length
    ? t.rows.map((r, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td><div style="font-weight:bold;">${esc(r.name) || "&mdash;"}</div>${r.description ? `<div style="font-size:8.5px;color:var(--muted);">${esc(r.description)}</div>` : ""}</td>
        <td class="c">${esc(r.hsn || "—")}</td>
        <td class="r">&#8377;${fmt(r.taxable / r.qty)}</td>
        <td class="r">${r.qty}${r.unit ? ` ${esc(r.unit)}` : ""}</td>
        <td class="r">&#8377;${fmt(r.taxable)}</td>
        ${!t.isTax ? "" : `<td class="r">&#8377;${fmt(r.tax)} (${(r.igstRate || 0) + (r.cgstRate || 0) + (r.sgstRate || 0)}%)</td>`}
        <td class="r">&#8377;${fmt(r.amount)}</td>
      </tr>`).join("")
    : `<tr><td colspan="8">&nbsp;</td></tr>`;


  return `
  <div class="ls-page" style="--ls-rcol:${t.isTax ? "410px" : "310px"};">
    <div class="ls-header-row">
      <div class="ls-title">${t.isTax ? "TAX " + esc(docLabel) : esc(docLabel)}</div>
      <div class="ls-copy">${copySubtitle}</div>
    </div>
    <div class="ls-meta-row">
      <div class="ls-meta-col">
        <div class="ls-comp-head">
          ${org.logoUrl ? `<img class="ls-logo" src="${esc(org.logoUrl)}" />` : ""}
          <div class="ls-comp-name">${esc(org.companyName || "Your Company")}</div>
        </div>
        ${org.gstin ? `<div class="ls-comp-line"><b>GSTIN</b> ${esc(org.gstin)}</div>` : ""}
        <div class="ls-comp-line" style="white-space:pre-line;">${esc(addrLines(org.address))}</div>
        ${org.phone ? `<div class="ls-comp-line">Mobile ${esc(org.phone)}</div>` : ""}
        ${org.email ? `<div class="ls-comp-line">Email ${esc(org.email)}</div>` : ""}
      </div>
      <div class="ls-meta-col">
        <div class="ls-cust-title">Customer Details:</div>
        <div class="ls-cust-name">${esc(dealName)}</div>
        ${doc.placeOfSupply ? `<div class="ls-cust-line">Place of Supply: ${esc(doc.placeOfSupply)}</div>` : ""}
        ${doc.receiverGSTIN ? `<div class="ls-cust-line">GSTIN: ${esc(doc.receiverGSTIN)}</div>` : ""}
        <div class="ls-cust-line" style="font-weight:bold;margin-top:6px;">Bill to:</div>
        <div class="ls-cust-line" style="white-space:pre-line;">${esc(addrLines(doc.billingAddress))}</div>
        ${doc.receiverPhone ? `<div class="ls-cust-line">Ph: ${esc(doc.receiverPhone)}</div>` : ""}
      </div>
      <div class="ls-meta-col">
        <div class="ls-meta-grid">
          <div><b>Invoice #:</b></div><div style="text-align:right;font-weight:bold;">${esc(docNumber || "—")}</div>
          <div><b>Invoice Date:</b></div><div style="text-align:right;font-weight:bold;">${esc(formatDate(doc.date) || "—")}</div>
          <div><b>Due Date:</b></div><div style="text-align:right;font-weight:bold;">${esc(formatDate(doc.dueDate) || "—")}</div>
        </div>
        <div class="ls-meta-qr">${payQrSvg}<div class="ls-qr-cap">Scan to pay</div></div>
      </div>
    </div>
    <div class="ls-items-wrap">
      <table class="ls-items">
        <thead>
          <tr>
            <th style="width:30px;" class="c">#</th>
            <th>Item</th>
            <th style="width:70px;" class="c">HSN/SAC</th>
            <th style="width:85px;" class="r">Rate/Item</th>
            <th style="width:55px;" class="r">Qty</th>
            <th style="width:80px;" class="r">Taxable Value</th>
            ${!t.isTax ? "" : `<th style="width:100px;" class="r">Tax Amount</th>`}
            <th style="width:90px;" class="r">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
          <tr class="ls-filler-row">
            <td></td><td></td><td></td><td></td><td></td><td></td>
            ${!t.isTax ? "" : "<td></td>"}
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="ls-totals-row">
      <div class="ls-totals-left">
        <div class="ls-totals-left-text">
          <div style="font-weight:bold;margin-bottom:4px;">Total Items / Qty : ${t.rows.length} / ${t.totalQty.toFixed ? t.totalQty.toFixed(3) : t.totalQty}</div>
          <div style="margin-bottom:8px;">Total amount (in words): <b>INR ${esc(t.amountInWords)}</b></div>
          <div style="font-weight:bold;text-transform:uppercase;font-size:8.5px;color:var(--muted);margin-bottom:3px;">Bank Details:</div>
          <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:9px;">
            <div style="color:var(--muted);">Bank</div><div>${esc(bank.bank || "—")}</div>
            <div style="color:var(--muted);">Account #</div><div>${esc(bank.accountNumber || "—")}</div>
            <div style="color:var(--muted);">IFSC</div><div>${esc(bank.ifscCode || "—")}</div>
            <div style="color:var(--muted);">Branch</div><div>${esc(bank.branch || "—")}</div>
          </div>
          ${upiId ? `<div style="margin-top:6px;font-size:9px;">UPI ID: ${esc(upiId)}</div>` : ""}
        </div>
      </div>
      <div class="ls-totals-right">
        <div class="ls-trow"><span>Taxable Amount</span><span>&#8377;${fmt(t.grossTaxable)}</span></div>
        ${!t.isTax ? "" : t.isInterState
      ? `<div class="ls-trow"><span>IGST ${doc.gstRate ? doc.gstRate.toFixed(1) : "18.0"}%</span><span>&#8377;${fmt(t.totalIGST)}</span></div>`
      : `<div class="ls-trow"><span>CGST</span><span>&#8377;${fmt(t.totalCGST)}</span></div>
             <div class="ls-trow"><span>SGST</span><span>&#8377;${fmt(t.totalSGST)}</span></div>`
    }
        ${discountRow ? `<div class="ls-trow">${discountRow}</div>` : ""}
        <div class="ls-trow grand"><span>Total</span><span>&#8377;${fmt(t.grandTotal)}</span></div>
        ${t.isPartiallyPaid
          ? `<div class="ls-trow"><span>Amount Paid</span><span>&#8377;${fmt(t.amountPaid)}</span></div>`
          : ""}
        <div class="ls-trow"><span>Amount Payable</span><span>&#8377;${fmt(t.isPartiallyPaid ? t.balanceDue : t.grandTotal)}</span></div>
      </div>
    </div>
    ${!t.isTax ? "" : `<table class="dc-hsn">
      <thead>
        ${t.isInterState
        ? `<tr><th rowspan="2">HSN/SAC</th><th rowspan="2">Taxable Value</th><th colspan="2" class="c">Integrated Tax</th><th rowspan="2">Total Tax Amount</th></tr><tr><th class="c">Rate</th><th class="c">Amount</th></tr>`
        : `<tr><th rowspan="2">HSN/SAC</th><th rowspan="2">Taxable Value</th><th colspan="2" class="c">Central Tax</th><th colspan="2" class="c">State Tax</th><th rowspan="2">Total Tax Amount</th></tr><tr><th class="c">Rate</th><th class="c">Amount</th><th class="c">Rate</th><th class="c">Amount</th></tr>`
      }
      </thead>
      <tbody>
        ${hsnRows}
        ${t.isInterState
        ? `<tr class="tot"><td class="r">TOTAL</td><td class="c">${fmt(t.totalTaxable)}</td><td></td><td class="r">${fmt(t.totalIGST)}</td><td class="c">${fmt(t.totalIGST)}</td></tr>`
        : `<tr class="tot"><td class="r">TOTAL</td><td class="c">${fmt(t.totalTaxable)}</td><td></td><td class="r">${fmt(t.totalCGST)}</td><td></td><td class="r">${fmt(t.totalSGST)}</td><td class="c">${fmt(t.totalCGST + t.totalSGST)}</td></tr>`
      }
      </tbody>
    </table>`}
    <div class="ls-footer-row">
      <div>
        ${notes ? `<div class="ls-notes-label">Notes:</div><div>${notes}</div>` : ""}
        <div class="ls-receiver-line">Receiver's Signature</div>
      </div>
      <div>
        ${terms ? `<div class="ls-terms-label">Terms and Conditions:</div><div class="ls-terms-body">${terms}</div>` : ""}
      </div>
      <div class="ls-sign-block">
        <div style="font-weight:bold;margin-bottom:4px;">For ${esc(org.companyName || "Your Company")}</div>
        ${sigImg ? `<img class="ls-sign-img" src="${esc(sigImg)}" />` : `<div style="height:40px;"></div>`}
        <div style="margin-top:4px;">Authorized Signatory</div>
      </div>
    </div>
  </div>
  `;
}