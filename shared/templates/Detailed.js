export const blurb = "Full e-invoice layout with IRN/QR, eway bill & dispatch details, and a per-rate GST breakdown.";

export const css = `
.dcsheet.t-Detailed, .dcsheet.t-Detailed * { box-sizing: border-box; }
.dcsheet.t-Detailed {
  --accent: #0b5ed7; --ink: #111; --line: #333; --muted: #666;
  font-family: Arial, Helvetica, sans-serif; font-size: 10px; padding: 12px;
}
.dcsheet.t-Detailed .dt-page { border: 1px solid var(--line); }

/* ── header: company (left) + title/QR/IRN (right) ── */
.dcsheet.t-Detailed .dt-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 12px; border-bottom: 1px solid var(--line); gap: 16px; }
.dcsheet.t-Detailed .dt-org { display: flex; gap: 10px; align-items: flex-start; }
.dcsheet.t-Detailed .dt-logo { max-height: 54px; max-width: 110px; object-fit: contain; flex-shrink: 0; }
.dcsheet.t-Detailed .dc-company { font-size: 14px; font-weight: bold; margin-bottom: 3px; }
.dcsheet.t-Detailed .dt-org-line { font-size: 9.5px; margin-top: 2px; }
.dcsheet.t-Detailed .dc-addr { white-space: pre-line; }
.dcsheet.t-Detailed .dt-title-block { text-align: right; flex-shrink: 0; }
.dcsheet.t-Detailed .dc-title { color: var(--accent); font-weight: bold; font-size: 12px; letter-spacing: 1px; }
.dcsheet.t-Detailed .dc-subtitle { color: var(--muted); font-size: 8px; margin-top: 2px; letter-spacing: 0.5px; }
.dcsheet.t-Detailed .dt-einvoice-qr { margin-top: 6px; }
.dcsheet.t-Detailed .dt-einvoice-qr svg { width: 92px; height: 92px; display: block; margin-left: auto; }
.dcsheet.t-Detailed .dt-irn { font-size: 7.5px; color: var(--muted); margin-top: 4px; max-width: 260px; word-break: break-all; text-align: right; }

/* ── meta box: customer | invoice/date pairs | dispatch ── */
.dcsheet.t-Detailed .dt-meta-row { display: grid; grid-template-columns: 1.3fr 1fr; border-bottom: 1px solid var(--line); }
.dcsheet.t-Detailed .dt-meta-cust { padding: 10px 0 0; border-right: 1px solid var(--line); font-size: 9.5px; display: flex; flex-direction: column; }
.dcsheet.t-Detailed .dt-meta-cust .dc-label { font-weight: bold; }
.dcsheet.t-Detailed .dt-meta-cust > div { margin-bottom: 2px; padding-left: 12px; padding-right: 12px; }
.dcsheet.t-Detailed .dt-sub-label { font-weight: bold; margin-top: 0; }
/* Address pair: the top rule butts against the customer block above and the
   column divider runs the full height of the cell down to the meta-row border. */
.dcsheet.t-Detailed .dt-addr-cols { display: grid; grid-template-columns: 1fr 1fr; margin: 6px 0 0 !important; border-top: 1px solid var(--line); flex: 1; padding-left: 0 !important; padding-right: 0 !important; }
.dcsheet.t-Detailed .dt-addr-cols > div { min-width: 0; padding: 6px 12px 8px; }
.dcsheet.t-Detailed .dt-addr-cols > div:first-child { border-right: 1px solid var(--line); }
.dcsheet.t-Detailed .dt-meta-right { display: grid; grid-template-columns: 1fr 1fr; }
.dcsheet.t-Detailed .dt-mcell { padding: 8px 10px; font-size: 9px; border-bottom: 1px solid var(--line); }
.dcsheet.t-Detailed .dt-mcell:nth-child(odd) { border-right: 1px solid var(--line); }
.dcsheet.t-Detailed .dt-mcell span { display: block; color: var(--muted); font-size: 8px; margin-bottom: 2px; }
.dcsheet.t-Detailed .dt-mcell b { font-size: 9.5px; }
.dcsheet.t-Detailed .dt-dispatch { grid-column: span 2; padding: 8px 10px; font-size: 9px; border-bottom: 0; }
.dcsheet.t-Detailed .dt-dispatch span { display: block; color: var(--muted); font-size: 8px; margin-bottom: 2px; font-weight: bold; }

/* ── items table ── */
/* No border on the table itself and none on the outer edges of the edge cells:
   the .dt-page frame and the meta-row / totals-row rules already draw those, so
   adding table borders on top produced a visible 2px double line. Cells only
   carry the *internal* 1px grid (right + bottom), pinned to 1px so the print
   stylesheet's --line-w bump can't thicken them. */
.dcsheet.t-Detailed .dc-items { width: 100%; border-collapse: collapse; border: 0; font-size: 9.5px; }
.dcsheet.t-Detailed .dc-items th { background: #f5f5f5; border: 0; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); padding: 6px 8px; font-size: 9px; }
.dcsheet.t-Detailed .dc-items td { border: 0; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); padding: 6px 8px; vertical-align: top; }
.dcsheet.t-Detailed .dc-items th:last-child, .dcsheet.t-Detailed .dc-items td:last-child { border-right: 0; }
.dcsheet.t-Detailed .dc-item-name { font-weight: bold; }

/* ── totals row: left (words/bank/qr) | right (per-rate totals) ── */
.dcsheet.t-Detailed .dt-totals-row { display: flex; border-bottom: 1px solid var(--line); }
.dcsheet.t-Detailed .dt-totals-left { flex: 1; padding: 10px 12px; border-right: 1px solid var(--line); font-size: 9.5px; display: flex; justify-content: space-between; gap: 12px; }
.dcsheet.t-Detailed .dt-totals-left-text { flex: 1; min-width: 0; }
.dcsheet.t-Detailed .dt-qr-block { flex-shrink: 0; text-align: center; margin-top: 34px; }
.dcsheet.t-Detailed .dt-qr-block svg { width: 66px; height: 66px; display: block; }
.dcsheet.t-Detailed .dt-qr-cap { font-size: 7.5px; color: var(--muted); margin-top: 2px; }
.dcsheet.t-Detailed .dt-totals-right { width: 260px; flex-shrink: 0; }
.dcsheet.t-Detailed .dc-trow { display: flex; justify-content: space-between; padding: 5px 12px; border-bottom: 1px solid var(--line); font-size: 9.5px; }
.dcsheet.t-Detailed .dc-grand { display: flex; justify-content: space-between; padding: 6px 12px; font-size: 13px; font-weight: bold; border-bottom: 1px solid var(--line); background: #fafafa; }
.dcsheet.t-Detailed .dt-paid-row { display: flex; justify-content: flex-end; align-items: center; gap: 4px; color: green; font-size: 10px; font-weight: bold; padding: 6px 12px; }

/* ── HSN summary ── */
.dcsheet.t-Detailed .dc-hsn { width: 100%; border-collapse: collapse; border: 0; font-size: 9px; }
.dcsheet.t-Detailed .dc-hsn th, .dcsheet.t-Detailed .dc-hsn td { border: 0; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); padding: 5px 8px; }
.dcsheet.t-Detailed .dc-hsn th:last-child, .dcsheet.t-Detailed .dc-hsn td:last-child { border-right: 0; }
.dcsheet.t-Detailed .dc-hsn thead tr:first-child th { border-top: 0; }
.dcsheet.t-Detailed .dc-hsn th { background: #f5f5f5; font-weight: bold; }
.dcsheet.t-Detailed .dc-hsn tr.tot td { font-weight: bold; background: #fafafa; }

/* ── footer: notes/terms | signature ── */
/* Footer cells stretch to the same height and every column is fenced off with a
   full-height rule that meets the totals border above and the page border
   below — no floating part-height dividers. */
.dcsheet.t-Detailed .dt-footer { display: grid; grid-template-columns: 1fr 1fr 220px; align-items: stretch; }
.dcsheet.t-Detailed .dt-footer > div { padding: 10px 12px; }
.dcsheet.t-Detailed .dt-footer > div + div { border-left: 1px solid var(--line); }
.dcsheet.t-Detailed .dt-footer .dc-label { font-weight: bold; margin-bottom: 3px; }
.dcsheet.t-Detailed .dt-terms-body { white-space: pre-line; font-size: 9px; margin-top: 4px; }
.dcsheet.t-Detailed .dt-notes-body { font-size: 9px; margin-top: 4px; }
.dcsheet.t-Detailed .dt-sign { text-align: right; }
.dcsheet.t-Detailed .dt-sign-img { max-height: 46px; margin-left: auto; object-fit: contain; display: block; }
.dcsheet.t-Detailed .dt-sign-line { margin-top: 4px; font-size: 9px; }

`;

export function html(ctx) {
  const {
    t, doc, org, bank, esc, fmt, formatDate,
    dealName, docLabel, docNumber, notes, terms, copySubtitle,
    payQrSvg, upiId, eInvoiceQrSvg,
  } = ctx;
  const sigImg = doc.signature || org.signatureUrl;

  // Same address formatter used across Professional/Landscape/Modern/Vintage
  // — same input form, so org.address is a plain string and
  // doc.billingAddress/shippingAddress are structured objects.
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
        <td class="c">${i + 1}</td>
        <td class="dc-item-name">${esc(r.name) || "&mdash;"}</td>
        <td class="c">${esc(r.hsn || "—")}</td>
        <td class="r">${fmt(r.rate)}</td>
        <td class="r nowrap">${r.qty}${r.unit ? ` ${esc(r.unit)}` : ""}</td>
        <td class="r">${fmt(r.taxable)}</td>
        ${t.isTax ? `<td class="r">${rowTax(r)}</td>` : ""}
        <td class="r">${fmt(r.amount)}</td>
      </tr>`
      )
      .join("")
    : `<tr><td colspan="${t.isTax ? 8 : 7}">&nbsp;</td></tr>`;

  const taxColLabel = !t.isTax ? "" : t.isInterState ? "IGST" : "Tax Amount";

  // Per-rate GST breakdown — items can carry different GST slabs on the same
  // document, so the totals box shows one line per distinct rate (e.g.
  // IGST 5%, IGST 12%, IGST 18%) rather than a single combined tax line.
  let rateTotalRows = "";
  if (t.isTax) {
    const rateMap = new Map();
    t.rows.forEach((r) => {
      const rate = t.isInterState ? (r.igstRate || 0) : (r.cgstRate || 0) + (r.sgstRate || 0);
      const amt = t.isInterState ? (r.igst || 0) : (r.cgst || 0) + (r.sgst || 0);
      if (!rateMap.has(rate)) rateMap.set(rate, 0);
      rateMap.set(rate, rateMap.get(rate) + amt);
    });
    const label = t.isInterState ? "IGST" : "GST";
    rateTotalRows = [...rateMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([rate, amt]) => `<div class="dc-trow"><span>${label} ${rate.toFixed(1)}%</span><span>&#8377;${fmt(amt)}</span></div>`)
      .join("");
  }

  const discountRow =
    t.documentDiscount > 0
      ? `<div class="dc-trow"><span>Discount${t.discountType === "percentage" ? ` (${t.discountValue}%)` : ""}</span><span>&#8377;${fmt(t.documentDiscount)}</span></div>`
      : "";

  return `
  <div class="dt-page">
    <div class="dt-header">
      <div class="dt-org">
        ${org.logoUrl ? `<img class="dt-logo" src="${esc(org.logoUrl)}" />` : ""}
        <div>
          <div class="dc-company">${esc(org.companyName || "Your Company")}</div>
          <div class="dt-org-line dc-addr">${esc(addrLines(org.address))}</div>
          <div class="dt-org-line"><b>GSTIN:</b> ${esc(org.gstin || "—")}</div>
          <div class="dt-org-line"><b>Mobile:</b> ${esc(org.mobile || org.phone || "—")} &nbsp; <b>Email:</b> ${esc(org.email || "—")}</div>
        </div>
      </div>
      <div class="dt-title-block">
        <div class="dc-title">${t.isTax ? "TAX " + esc(docLabel).toUpperCase() : esc(docLabel).toUpperCase()}</div>
        <div class="dc-subtitle">${copySubtitle}</div>
        ${eInvoiceQrSvg ? `<div class="dt-einvoice-qr">${eInvoiceQrSvg}</div>` : ""}
        ${doc.irn || doc.ackNumber ? `<div class="dt-irn">
          ${doc.irn ? `IRN: ${esc(doc.irn)}<br/>` : ""}
          ${doc.ackNumber ? `Acknowledgement Number: ${esc(doc.ackNumber)}` : ""}
        </div>` : ""}
      </div>
    </div>

    <div class="dt-meta-row">
      <div class="dt-meta-cust">
        <div class="dc-label">Customer Details:</div>
        <div style="font-weight:bold;font-size:10.5px;">${esc(dealName)}</div>
        ${doc.receiverGSTIN ? `<div>GSTIN: ${esc(doc.receiverGSTIN)}</div>` : ""}
        <div class="dt-addr-cols">
          <div>
            <div class="dt-sub-label">Billing address:</div>
            <div style="white-space:pre-line;">${esc(addrLines(doc.billingAddress))}</div>
          </div>
          <div>
            <div class="dt-sub-label">Shipping address:</div>
            <div style="white-space:pre-line;">${esc(addrLines(doc.shippingAddress || doc.billingAddress))}</div>
          </div>
        </div>
        ${doc.receiverPhone ? `<div style="margin-top:4px;">Ph: ${esc(doc.receiverPhone)}</div>` : ""}
      </div>
      <div class="dt-meta-right">
        <div class="dt-mcell"><span>Invoice #:</span><b>${esc(docNumber || "—")}</b></div>
        <div class="dt-mcell"><span>Date:</span><b>${esc(formatDate(doc.date) || "—")}</b></div>
        <div class="dt-mcell"><span>Place of Supply:</span><b>${esc(doc.placeOfSupply || "—")}</b></div>
        <div class="dt-mcell"><span>Due Date:</span><b>${esc(formatDate(doc.dueDate) || "—")}</b></div>
        <div class="dt-mcell"><span>Eway Bill #:</span><b>${esc(doc.ewayBillNumber || "—")}</b></div>
        <div class="dt-mcell"><span>Vehicle Number:</span><b>${esc(doc.vehicleNumber || "—")}</b></div>
        <div class="dt-dispatch">
          <span>Dispatch From:</span>
          <div style="font-weight:bold;">${esc(org.companyName || "Your Company")}</div>
          <div style="white-space:pre-line;">${esc(addrLines(org.address))}</div>
        </div>
      </div>
    </div>

    <table class="dc-items">
      <thead>
        <tr>
          <th style="width:24px;">#</th>
          <th style="text-align:left;">Item</th>
          <th style="width:60px;">HSN/SAC</th>
          <th class="r" style="width:75px;">Rate/Item</th>
          <th class="r" style="width:55px;">Qty</th>
          <th class="r" style="width:80px;">Taxable Value</th>
          ${t.isTax ? `<th class="r" style="width:90px;">${taxColLabel}</th>` : ""}
          <th class="r" style="width:90px;">Amount</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <div class="dt-totals-row">
      <div class="dt-totals-left">
        <div class="dt-totals-left-text">
          <div style="font-weight:bold;margin-bottom:4px;">Total Items / Qty : ${t.rows.length} / ${t.totalQty}</div>
          <div style="margin-bottom:8px;">Total amount (in words): <b>INR ${esc(t.amountInWords)}</b></div>
          <div style="font-weight:bold;margin-bottom:3px;">Bank Details:</div>
          <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:9px;">
            <div style="color:var(--muted);">Bank:</div><div>${esc(bank.bank || "—")}</div>
            <div style="color:var(--muted);">Account #:</div><div>${esc(bank.accountNumber || "—")}</div>
            <div style="color:var(--muted);">IFSC:</div><div>${esc(bank.ifscCode || "—")}</div>
            <div style="color:var(--muted);">Branch:</div><div>${esc(bank.branch || "—")}</div>
          </div>
          ${upiId ? `<div style="margin-top:6px;font-size:9px;">UPI ID: ${esc(upiId)}</div>` : ""}
        </div>
        <div class="dt-qr-block">
          ${payQrSvg}
          <div class="dt-qr-cap">Scan to pay</div>
        </div>
      </div>
      <div class="dt-totals-right">
        <div class="dc-trow"><span>Taxable Amount</span><span>&#8377;${fmt(t.grossTaxable)}</span></div>
        ${discountRow}
        ${rateTotalRows}
        <div class="dc-grand"><span>Total</span><span>&#8377;${fmt(t.grandTotal)}</span></div>
        ${doc.status === "Paid" ? `<div class="dt-paid-row"><span>&#10003;</span><span>Amount Paid</span></div>` : ""}
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
        ${t.hsnRows.map((r) =>
        t.isInterState
          ? `<tr><td class="c">${esc(r.hsn)}</td><td class="c">${fmt(r.taxable)}</td><td class="c">${r.rate}%</td><td class="r">${fmt(r.igst)}</td><td class="c">${fmt(r.igst)}</td></tr>`
          : `<tr><td class="c">${esc(r.hsn)}</td><td class="c">${fmt(r.taxable)}</td><td class="c">${r.rate / 2}%</td><td class="r">${fmt(r.cgst)}</td><td class="c">${r.rate / 2}%</td><td class="r">${fmt(r.sgst)}</td><td class="c">${fmt(r.cgst + r.sgst)}</td></tr>`
      ).join("")}
        ${t.isInterState
        ? `<tr class="tot"><td class="r">TOTAL</td><td class="c">${fmt(t.totalTaxable)}</td><td></td><td class="r">${fmt(t.totalIGST)}</td><td class="c">${fmt(t.totalIGST)}</td></tr>`
        : `<tr class="tot"><td class="r">TOTAL</td><td class="c">${fmt(t.totalTaxable)}</td><td></td><td class="r">${fmt(t.totalCGST)}</td><td></td><td class="r">${fmt(t.totalSGST)}</td><td class="c">${fmt(t.totalCGST + t.totalSGST)}</td></tr>`
      }
      </tbody>
    </table>`}

    <div class="dt-footer">
      <div>
        <div class="dc-label">Notes:</div>
        <div class="dt-notes-body">${notes ? notes : "&mdash;"}</div>
      </div>
      <div>
        <div class="dc-label">Terms and Conditions:</div>
        <div class="dt-terms-body">${terms ? terms : "&mdash;"}</div>
      </div>
      <div class="dt-sign">
        <div style="font-weight:bold;margin-bottom:4px;">For ${esc(org.companyName || "Your Company")}</div>
        ${sigImg ? `<img class="dt-sign-img" src="${esc(sigImg)}" />` : `<div style="height:46px;"></div>`}
        <div class="dt-sign-line">Authorized Signatory</div>
      </div>
    </div>
  </div>
  `;
}