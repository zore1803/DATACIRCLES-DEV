export const blurb = "Clean, borderless service billing receipt with solid blue header band.";
export const css = `
.dcsheet.t-Service {
  --ink: #111; --muted: #666; --blue: #2f6fed; --line: #e5e7eb;
  font-family: Arial, Helvetica, sans-serif; font-size: 10px; padding: 24px; background: #fff; color: var(--ink);
}
.dcsheet.t-Service .srv-header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 16px; border-bottom: 1px solid var(--line); }
.dcsheet.t-Service .srv-title { font-size: 18px; font-weight: bold; letter-spacing: 1.5px; text-transform: uppercase; color: #111; }
.dcsheet.t-Service .srv-subtitle { font-size: 8.5px; color: var(--muted); text-transform: uppercase; margin-top: 4px; }
.dcsheet.t-Service .srv-company { font-size: 17px; font-weight: bold; margin-bottom: 2px; }
.dcsheet.t-Service .srv-gstin { font-weight: bold; font-size: 10px; margin-bottom: 4px; }
.dcsheet.t-Service .srv-addr { font-size: 10px; color: #444; max-width: 280px; }
.dcsheet.t-Service .srv-meta-row { display: flex; justify-content: space-between; align-items: flex-start; padding: 16px 0; border-bottom: 1px solid var(--line); }
.dcsheet.t-Service .srv-meta-grid { display: grid; grid-template-columns: auto 1fr; gap: 3px 16px; font-size: 10px; text-align: right; }
.dcsheet.t-Service .srv-items { width: 100%; border-collapse: collapse; margin-top: 16px; }
.dcsheet.t-Service .srv-items th { background: var(--blue); color: #fff; font-weight: bold; text-transform: uppercase; font-size: 9px; padding: 8px 10px; border: 0; }
.dcsheet.t-Service .srv-items td { padding: 10px; border: 0; border-bottom: 1px solid #f3f4f6; font-size: 10px; }
.dcsheet.t-Service .srv-totals-row { display: flex; justify-content: space-between; align-items: flex-start; padding-top: 16px; margin-top: 8px; }
.dcsheet.t-Service .srv-trow { display: flex; justify-content: space-between; gap: 24px; padding: 3px 0; font-size: 10px; }
.dcsheet.t-Service .srv-grand { font-size: 14px; font-weight: bold; color: #111; margin-top: 4px; }
.dcsheet.t-Service .srv-footer-row { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 32px; font-size: 10px; }
/* QR sits in front of the bank block, which gets room to breathe so its values
   don't wrap. */
.dcsheet.t-Service .srv-bank-row { display: flex; align-items: flex-start; gap: 18px; flex: 1; min-width: 0; }
.dcsheet.t-Service .srv-pay-qr { flex-shrink: 0; text-align: center; margin-top: 16px; }
.dcsheet.t-Service .srv-pay-qr svg { width: 66px; height: 66px; display: block; margin: 0 auto; }
.dcsheet.t-Service .srv-bank { flex: 1; min-width: 0; }
.dcsheet.t-Service .srv-bank-grid { display: grid; grid-template-columns: max-content 1fr; gap: 3px 16px; font-size: 9.5px; }
`;

export function html(ctx) {
  const {
    t, doc, org, bank, esc, fmt, formatDate, formatPostalAddress,
    dealName, docLabel, docNumber, notes, terms, copySubtitle, discountRow, payQrSvg,
  } = ctx;
  const sigImg = doc.signature || org.signatureUrl;

  return `
  <div class="srv-header">
    <div>
      <div class="srv-title">${t.isTax ? "TAX " + esc(docLabel) : esc(docLabel)}</div>
      <div class="srv-subtitle">${copySubtitle}</div>
    </div>
    <div style="text-align:right;">
      <div class="srv-company">${esc(org.companyName || "Your Company")}</div>
      ${org.gstin ? `<div class="srv-gstin">GSTIN ${esc(org.gstin)}</div>` : ""}
      <div class="srv-addr">${esc(org.address || "")}</div>
    </div>
  </div>
  <div class="srv-meta-row">
    <div>
      <div style="color:var(--muted);font-size:9px;text-transform:uppercase;margin-bottom:4px;">Bill To:</div>
      <div style="font-weight:bold;font-size:12px;margin-bottom:2px;">${esc(dealName)}</div>
      ${doc.receiverGSTIN ? `<div style="font-size:10px;">GSTIN: ${esc(doc.receiverGSTIN)}</div>` : ""}
      <div style="white-space:pre-line;font-size:10px;margin-top:2px;">${esc(formatPostalAddress(doc.billingAddress))}</div>
    </div>
    <div>
      <div class="srv-meta-grid">
        <div><b>Invoice #:</b></div><div><b>${esc(docNumber || "—")}</b></div>
        <div><b>Invoice Date:</b></div><div><b>${esc(formatDate(doc.date) || "—")}</b></div>
        <div><b>Due Date:</b></div><div><b>${esc(formatDate(doc.dueDate) || "—")}</b></div>
        <div><b>Place of Supply:</b></div><div><b>${esc(doc.placeOfSupply || "—")}</b></div>
      </div>
    </div>
  </div>
  <table class="srv-items">
    <thead>
      <tr>
        <th style="width:35px;" class="c">#</th>
        <th style="text-align:left;">Item</th>
        <th style="width:100px;" class="c">HSN/SAC</th>
        <th style="width:120px;" class="r">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${t.rows.map((r, i) => `
        <tr>
          <td class="c">${i + 1}</td>
          <td>
            <div style="font-weight:bold;">${esc(r.name) || "&mdash;"}</div>
            ${r.description ? `<div style="color:var(--muted);font-size:9px;margin-top:2px;">${esc(r.description)}</div>` : ""}
          </td>
          <td class="c">${esc(r.hsn || "—")}</td>
          <td class="r" style="font-weight:bold;">&#8377;${fmt(r.amount)}</td>
        </tr>`).join("")}
    </tbody>
  </table>
  <div style="margin-top:8px;">
    <div style="display:flex;justify-content:flex-end;">
      <div style="min-width:240px;">
        <div class="srv-trow"><span>Taxable Amount</span><span>&#8377;${fmt(t.grossTaxable)}</span></div>
        ${discountRow}
        <div class="srv-trow srv-grand"><span>Total</span><span>&#8377;${fmt(t.grandTotal)}</span></div>
        ${t.isPartiallyPaid
          ? `<div class="srv-trow"><span>Amount Paid</span><span>&#8377;${fmt(t.amountPaid)}</span></div>
        <div class="srv-trow srv-grand"><span>Balance Due</span><span>&#8377;${fmt(t.balanceDue)}</span></div>`
          : ""}
        ${doc.status === "Paid" ? `<div style="display:flex;justify-content:flex-end;align-items:center;gap:4px;color:green;font-size:10px;font-weight:bold;margin-top:6px;"><span style="font-size:14px;">&#10003;</span> Amount Paid</div>` : ""}
      </div>
    </div>
    <div style="border-top:1px solid var(--line);margin-top:12px;padding-top:8px;display:flex;justify-content:space-between;align-items:center;font-size:10px;color:var(--muted);">
      <div>Total Items / Qty : ${t.rows.length} / ${t.totalQty}</div>
      <div>Total amount (in words): INR ${esc(t.amountInWords)}</div>
    </div>
  </div>
  <div class="srv-footer-row">
    <div class="srv-bank-row">
      <div class="srv-pay-qr">${payQrSvg}<div class="dc-pay-qr-cap">Scan to pay</div></div>
      <div class="srv-bank">
        <div style="font-weight:bold;margin-bottom:4px;">Bank Details:</div>
        <div class="srv-bank-grid">
          <div style="color:var(--muted);">Bank</div><div>${esc(bank.bank || "—")}</div>
          <div style="color:var(--muted);">Account Holder</div><div>${esc(bank.accountHolder || org.companyName || "—")}</div>
          <div style="color:var(--muted);">Account #</div><div>${esc(bank.accountNumber || "—")}</div>
          <div style="color:var(--muted);">IFSC Code</div><div>${esc(bank.ifscCode || "—")}</div>
          <div style="color:var(--muted);">Branch</div><div>${esc(bank.branch || "—")}</div>
        </div>
      </div>
    </div>
    <div style="text-align:right;color:#555;margin-top:16px;">
      <div style="font-size:9.5px;margin-bottom:4px;">For ${esc(org.companyName || "Your Company")}</div>
      ${sigImg ? `<img src="${esc(sigImg)}" style="max-height:45px;margin-left:auto;display:block;object-fit:contain;" />` : `<div style="height:40px;"></div>`}
      <div style="font-size:9px;margin-top:4px;">Authorized Signatory</div>
    </div>
  </div>
  ${notes || terms ? `<div style="margin-top:16px;border-top:1px solid var(--line);padding-top:12px;font-size:10px;">
    ${notes ? `<div style="margin-bottom:6px;"><b>Notes:</b> ${notes}</div>` : ""}
    ${terms ? `<div><b>Terms &amp; Conditions:</b> ${terms}</div>` : ""}
  </div>` : ""}

  `;
}
