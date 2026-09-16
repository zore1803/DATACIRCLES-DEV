export const blurb = "Dense ruled-grid invoice with a bank/UPI/signature footer row and bold amount-payable summary.";

export const css = `
/* ── outer shell ── */
.dcsheet.t-Vintage { display: flex; flex-direction: column; font-size: 10px; padding: 12px; border: 0; --accent: #0b5ed7; --ink: #111; --muted: #666; }
/* ── inner page box ── */
.dcsheet.t-Vintage .vt-page { display: flex; flex-direction: column; flex: 1; border: 1px solid var(--ink); overflow: hidden; min-height: 1000px; }
/* ── title bar ── */
.dcsheet.t-Vintage .vt-title { text-align: center; font-size: 13px; font-weight: bold; letter-spacing: 1px; padding: 7px 12px; border-bottom: 1px solid var(--ink); position: relative; color: var(--accent); }
.dcsheet.t-Vintage .vt-title .vt-copy { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); font-size: 8px; font-weight: normal; color: var(--muted); }
/* ── company + meta row ── */
.dcsheet.t-Vintage .vt-org-row { display: grid; grid-template-columns: 1fr auto; border-bottom: 1px solid var(--ink); }
.dcsheet.t-Vintage .vt-org { padding: 10px 12px; display: flex; gap: 10px; align-items: flex-start; }
.dcsheet.t-Vintage .vt-org-logo { max-height: 40px; max-width: 90px; object-fit: contain; flex-shrink: 0; }
.dcsheet.t-Vintage .vt-org .dc-company { font-size: 13px; font-weight: bold; margin-bottom: 3px; }
.dcsheet.t-Vintage .dc-addr { white-space: pre-line; }
.dcsheet.t-Vintage .vt-meta { border-left: 1px solid var(--ink); display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; min-width: 260px; }
.dcsheet.t-Vintage .vt-mcell { padding: 7px 10px; font-size: 9px; }
.dcsheet.t-Vintage .vt-mcell:nth-child(even) { border-left: 1px solid var(--ink); }
.dcsheet.t-Vintage .vt-mcell:nth-child(n+3) { border-top: 1px solid var(--ink); }
.dcsheet.t-Vintage .vt-mcell span { display: block; color: var(--muted); font-size: 8px; margin-bottom: 2px; }
.dcsheet.t-Vintage .vt-mcell b { font-size: 10px; }
/* ── customer + shipping row ── */
.dcsheet.t-Vintage .vt-cust-row { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid var(--ink); }
.dcsheet.t-Vintage .vt-cust-col { padding: 10px 12px; }
.dcsheet.t-Vintage .vt-cust-col:first-child { border-right: 1px solid var(--ink); }
/* Bleed the title strip to the column edges so its underline meets the column
   divider — one connected rule across "Customer Details" / "Shipping Address". */
.dcsheet.t-Vintage .vt-cust-col .vt-col-title { font-size: 8px; font-weight: bold; text-transform: uppercase; color: var(--muted); letter-spacing: 0.5px; margin: -10px -12px 8px; padding: 7px 12px 4px; border-bottom: 1px solid var(--ink); }
.dcsheet.t-Vintage .vt-cust-col .vt-cust-name { font-weight: bold; font-size: 11px; margin-bottom: 2px; }
.dcsheet.t-Vintage .vt-sub-label { font-weight: bold; font-size: 9px; margin-top: 6px; margin-bottom: 2px; }
/* ── items table ── */
.dcsheet.t-Vintage .vt-items-wrap { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
/* Separate borders (not collapsed) so every column rule is painted on a cell's
   right EDGE — the same box-edge model the totals / footer / notes dividers use
   — instead of straddling the grid line. That keeps them pixel-aligned. */
.dcsheet.t-Vintage .dc-items { flex: 1; border: 0; margin: 0; width: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed; }
.dcsheet.t-Vintage .vt-filler-row { height: 100%; }
.dcsheet.t-Vintage .vt-filler-row td { border-top: 0; border-bottom: 0; }
.dcsheet.t-Vintage .dc-items th { background: #f5f5f5; border: 0; border-right: 1px solid var(--ink); border-bottom: 1px solid var(--ink); padding: 6px 8px; font-size: 9px; }
.dcsheet.t-Vintage .dc-items th:last-child { border-right: 0; }
.dcsheet.t-Vintage .dc-items td { border: 0; border-right: 1px solid var(--ink); padding: 6px 8px; font-size: 9.5px; vertical-align: top; }
.dcsheet.t-Vintage .dc-items td:last-child { border-right: 0; }
.dcsheet.t-Vintage .dc-items tbody tr:nth-child(even) { background: #fafafa; }
.dcsheet.t-Vintage .dc-item-name { font-weight: bold; }
.dcsheet.t-Vintage .dc-item-desc { font-size: 8.5px; color: var(--muted); white-space: pre-line; margin-top: 2px; }
/* ── totals row ── */
/* --vt-rcol (set on .vt-page) is the exact combined width of the right-hand
   item columns, so the totals / footer / notes strips all split on that same
   line and the vertical rule runs unbroken from the items table to the bottom. */
.dcsheet.t-Vintage .vt-totals { display: grid; grid-template-columns: 1fr var(--vt-rcol, 220px); align-items: stretch; border-top: 1px solid var(--ink); border-bottom: 1px solid var(--ink); }
.dcsheet.t-Vintage .vt-totals-left { font-size: 9px; color: var(--muted); padding: 10px 12px; border-right: 1px solid var(--ink); }
.dcsheet.t-Vintage .vt-totals-left b { color: var(--ink); font-size: 10px; }
.dcsheet.t-Vintage .vt-totals-right { padding: 10px 12px; min-width: 0; }
/* Bleed the "Total" rule to the section edges so it meets the divider on the
   left and the frame on the right. */
.dcsheet.t-Vintage .vt-totals-right .dc-grand { margin: 4px -12px 0; padding: 4px 12px 0; }
.dcsheet.t-Vintage .dc-trow { display: flex; justify-content: space-between; padding: 2px 0; font-size: 10px; }
.dcsheet.t-Vintage .dc-grand { display: flex; justify-content: space-between; font-size: 12px; font-weight: bold; border-top: 1px solid var(--ink); margin-top: 4px; padding-top: 4px; }
/* ── HSN table ── */
.dcsheet.t-Vintage .dc-hsn { margin: 0; border: 0; border-bottom: 1px solid var(--ink); width: 100%; border-collapse: collapse; }
.dcsheet.t-Vintage .dc-hsn th, .dcsheet.t-Vintage .dc-hsn td { border: 1px solid var(--ink); padding: 5px 8px; font-size: 9px; }
.dcsheet.t-Vintage .dc-hsn th { background: #f5f5f5; font-weight: bold; }
.dcsheet.t-Vintage .dc-hsn tr.tot td { font-weight: bold; background: #fafafa; }
/* ── amount paid indicator ── */
.dcsheet.t-Vintage .vt-paid-row { display: flex; justify-content: flex-end; align-items: center; gap: 4px; color: green; font-size: 10px; font-weight: bold; padding: 6px 12px; border-bottom: 1px solid var(--ink); }
.dcsheet.t-Vintage .vt-paid-row .dc-tick { font-size: 13px; }
.dcsheet.t-Vintage .vt-bottom { display: flex; flex-direction: column; }
/* ── footer: bank | UPI | signature ── */
/* No border-top here — the row above (totals / HSN table / paid-row) already
   draws a bottom rule, and stacking the two makes a 2px line. */
.dcsheet.t-Vintage .vt-footer { display: grid; grid-template-columns: 1fr 1fr var(--vt-rcol, 220px); }
.dcsheet.t-Vintage .vt-bank, .dcsheet.t-Vintage .vt-upi { padding: 0; border-right: 1px solid var(--ink); font-size: 9px; }
.dcsheet.t-Vintage .vt-col-title { font-size: 8px; font-weight: bold; text-transform: uppercase; color: var(--muted); letter-spacing: 0.5px; padding: 7px 12px; border-bottom: 1px solid var(--ink); }
.dcsheet.t-Vintage .vt-bank-grid { display: grid; grid-template-columns: auto 1fr; }
.dcsheet.t-Vintage .vt-bank-cell { padding: 5px 10px; }
.dcsheet.t-Vintage .vt-bank-cell.lbl { color: var(--muted); font-size: 8px; white-space: nowrap; }
.dcsheet.t-Vintage .vt-bank-cell.val { font-weight: bold; }
.dcsheet.t-Vintage .vt-upi-body { padding: 10px 12px; display: flex; justify-content: center; }
.dcsheet.t-Vintage .vt-qr-img svg { width: 76px; height: 76px; display: block; }
/* Spread the three lines across the full height of the footer cell (which is as
   tall as the bank-details column) so the signature block doesn't float in a
   pool of empty space. */
.dcsheet.t-Vintage .vt-sign { padding: 10px 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; text-align: center; font-size: 8.5px; }
.dcsheet.t-Vintage .vt-sign-img-wrap { overflow: hidden; display: flex; align-items: center; justify-content: center; height: 34px; width: 110px; }
.dcsheet.t-Vintage .vt-sign-img-wrap img { max-height: 100%; max-width: 100%; object-fit: contain; }
/* ── notes/terms ── */
.dcsheet.t-Vintage .vt-notes-row { display: grid; grid-template-columns: 1fr var(--vt-rcol, 220px); border-top: 1px solid var(--ink); font-size: 9px; }
.dcsheet.t-Vintage .vt-notes-col { padding: 10px 12px; }
.dcsheet.t-Vintage .vt-notes-col:first-child { border-right: 1px solid var(--ink); }
.dcsheet.t-Vintage .vt-terms-body { white-space: pre-line; }
`;

export function html(ctx) {
  const {
    t, doc, org, bank, upiId, payQrSvg, esc, fmt, formatDate,
    dealName, docLabel, docNumber, notes, terms, copySubtitle,
  } = ctx;
  const sigImg = doc.signature || org.signatureUrl;

  // Same address formatter as Professional.js / Landscape.js / Modern.js —
  // these templates share the same input form, so org.address is a plain
  // string and doc.billingAddress/shippingAddress are structured objects.
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

  // Single merged tax cell per row — same convention as Professional/Modern/
  // Service: one "Tax Amount" column (amount + combined rate) rather than
  // separate CGST/SGST columns.
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
        <td>
          <div class="dc-item-name">${esc(r.name) || "&mdash;"}</div>
          ${r.description ? `<div class="dc-item-desc">${esc(r.description)}</div>` : ""}
        </td>
        <td class="c">${esc(r.hsn || "—")}</td>
        <td class="r">${fmt(r.rate)}</td>
        <td class="r nowrap">${r.qty}</td>
        <td class="r">${fmt(r.taxable)}</td>
        ${t.isTax ? `<td class="r">${rowTax(r)}</td>` : ""}
        <td class="r">${fmt(r.amount)}</td>
      </tr>`
      )
      .join("")
    : `<tr><td colspan="${t.isTax ? 8 : 7}">&nbsp;</td></tr>`;

  const taxTotalRow = !t.isTax
    ? ""
    : t.isInterState
      ? `<div class="dc-trow"><span>IGST ${doc.gstRate ? doc.gstRate.toFixed(1) : (t.rows[0]?.igstRate || 18).toFixed(1)}%</span><span>&#8377;${fmt(t.totalIGST)}</span></div>`
      : `<div class="dc-trow"><span>GST</span><span>&#8377;${fmt(t.totalCGST + t.totalSGST)}</span></div>`;

  const discountRow =
    t.documentDiscount > 0
      ? `<div class="dc-trow"><span>Discount${t.discountType === "percentage" ? ` (${t.discountValue}%)` : ""}</span><span>&#8377;${fmt(t.documentDiscount)}</span></div>`
      : "";

  const hsnCols = !t.isTax ? 7 : t.isInterState ? 8 : 9;

  return `
  <div class="vt-page" style="--vt-rcol:${t.isTax ? "306px" : "216px"};">
  <!-- Title bar -->
  <div class="vt-title">
    ${t.isTax ? "TAX " + esc(docLabel) : esc(docLabel)}
    <span class="vt-copy">${copySubtitle}</span>
  </div>
  <!-- Company info (left) + Invoice meta 2×2 grid (right) -->
  <div class="vt-org-row">
    <div class="vt-org">
      ${org.logoUrl ? `<img class="vt-org-logo" src="${esc(org.logoUrl)}" />` : ""}
      <div>
        <div class="dc-company">${esc(org.companyName || "Your Company")}</div>
        <div>GSTIN <b>${esc(org.gstin || "—")}</b></div>
        <div class="dc-addr" style="margin-top:3px;">${esc(addrLines(org.address))}</div>
        <div style="margin-top:2px;">Mobile ${esc(org.mobile || org.phone || "—")} &nbsp;&nbsp; Email ${esc(org.email || "—")}</div>
      </div>
    </div>
    <div class="vt-meta">
      <div class="vt-mcell"><span>Invoice #</span><b>${esc(docNumber || "—")}</b></div>
      <div class="vt-mcell"><span>Invoice Date</span><b>${esc(formatDate(doc.date) || "—")}</b></div>
      <div class="vt-mcell"><span>Place of Supply</span><b>${esc(doc.placeOfSupply || "—")}</b></div>
      <div class="vt-mcell"><span>Due Date</span><b>${esc(formatDate(doc.dueDate) || "—")}</b></div>
    </div>
  </div>
  <!-- Customer (left) + Shipping (right) -->
  <div class="vt-cust-row">
    <div class="vt-cust-col">
      <div class="vt-col-title">Customer Details:</div>
      <div class="vt-cust-name">${esc(dealName)}</div>
      ${doc.receiverGSTIN ? `<div>GSTIN: ${esc(doc.receiverGSTIN)}</div>` : ""}
      <div class="vt-sub-label">Billing address:</div>
      <div>${esc(addrLines(doc.billingAddress, true))}</div>
      ${doc.receiverPhone ? `<div>Ph: ${esc(doc.receiverPhone)}</div>` : ""}
      ${doc.receiverEmail ? `<div>Email: ${esc(doc.receiverEmail)}</div>` : ""}
    </div>
    <div class="vt-cust-col">
      <div class="vt-col-title">Shipping address:</div>
      <div style="margin-top:4px;">${esc(addrLines(doc.shippingAddress || doc.billingAddress, true))}</div>
    </div>
  </div>
  <!-- Items table -->
  <div class="vt-items-wrap">
  <table class="dc-items">
    <thead>
      <tr>
        <th style="width:24px;">#</th>
        <th style="text-align:left;">Item</th>
        <th style="width:60px;">HSN/SAC</th>
        <th class="r" style="width:64px;">Rate/Item</th>
        <th class="r nowrap" style="width:48px;">Qty</th>
        <th class="r" style="width:78px;">Taxable Value</th>
        ${t.isTax ? `<th class="r" style="width:90px;">Tax Amount</th>` : ""}
        <th class="r" style="width:90px;">Amount</th>
      </tr>
    </thead>
    <tbody>${itemRows}<tr class="vt-filler-row">${Array(t.isTax ? 8 : 7).fill("<td></td>").join("")}</tr></tbody>
  </table>
  </div>
  <div class="vt-bottom">
  <!-- Totals summary -->
  <div class="vt-totals">
    <div class="vt-totals-left">
      <div>Total Items / Qty : <b>${t.rows.length} / ${t.totalQty}</b></div>
      <div style="margin-top:4px;">Total amount (in words):</div>
      <div><b>INR ${esc(t.amountInWords)}</b></div>
    </div>
    <div class="vt-totals-right">
      <div class="dc-trow"><span>Taxable Amount</span><span>&#8377;${fmt(t.grossTaxable)}</span></div>
      ${discountRow}
      ${taxTotalRow}
      <div class="dc-grand"><span>Total</span><span>&#8377;${fmt(t.grandTotal)}</span></div>
      ${t.isPartiallyPaid
        ? `<div class="dc-trow"><span>Amount Paid</span><span>&#8377;${fmt(t.amountPaid)}</span></div>
      <div class="dc-grand"><span>Balance Due</span><span>&#8377;${fmt(t.balanceDue)}</span></div>`
        : ""}
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
  ${doc.status === "Paid" ? `<div class="vt-paid-row"><span class="dc-tick">&#10003;</span><span>Amount Paid</span></div>` : ""}
  <!-- Bank details | Pay using UPI | Signature -->
  <div class="vt-footer">
    <div class="vt-bank">
      <div class="vt-col-title">Bank Details</div>
      <div class="vt-bank-grid">
        <div class="vt-bank-cell lbl">Bank</div><div class="vt-bank-cell val">${esc(bank.bank || "—")}</div>
        <div class="vt-bank-cell lbl">Account #</div><div class="vt-bank-cell val">${esc(bank.accountNumber || "—")}</div>
        <div class="vt-bank-cell lbl">IFSC</div><div class="vt-bank-cell val">${esc(bank.ifscCode || "—")}</div>
        <div class="vt-bank-cell lbl">Branch</div><div class="vt-bank-cell val">${esc(bank.branch || "—")}</div>
      </div>
    </div>
    <div class="vt-upi">
      <div class="vt-col-title">Pay using UPI:</div>
      <div class="vt-upi-body">
        <div class="vt-qr-img">${payQrSvg}</div>
        ${upiId ? `<div style="font-size:9px;">${esc(upiId)}</div>` : ""}
      </div>
    </div>
    <div class="vt-sign">
      <div style="font-size:8px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;">For ${esc(org.companyName || "Your Company")}</div>
      <div class="vt-sign-img-wrap">
        ${sigImg ? `<img src="${esc(sigImg)}" />` : `<div style="height:36px;"></div>`}
      </div>
      <div style="border-top:1px solid var(--ink);padding-top:4px;font-size:9px;">Authorized Signatory</div>
    </div>
  </div>
  ${notes || terms ? `<div class="vt-notes-row">
    <div class="vt-notes-col">${notes ? `<div style="font-weight:bold;margin-bottom:3px;">Notes:</div><div style="white-space:pre-line;">${notes}</div>` : ""}</div>
    <div class="vt-notes-col">${terms ? `<div style="font-weight:bold;margin-bottom:3px;">Terms &amp; Conditions:</div><div class="vt-terms-body">${terms}</div>` : ""}</div>
  </div>` : ""}
  </div>
  </div>
  `;
}