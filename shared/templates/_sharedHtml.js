/*
 * _sharedHtml.js
 *
 * HTML layout shared by the "classic-family" templates:
 *   Classic, Minimal, Elegant, Compact, Corporate, Vibrant, Mono
 *
 * These templates are CSS-only variants — they share the exact same structural
 * markup and differ only in their CSS overrides. Templates that have their own
 * unique layout (Modern, Vintage, Professional, Landscape, Service) export their
 * own `html(ctx)` function directly.
 *
 * Receives the `ctx` object that buildDocumentHtml() assembles.
 */

export function sharedHtml(ctx) {
  const {
    t, doc, org, esc, fmt, formatDate, formatPostalAddress,
    dealName, docLabel, docNumber, notes, terms, copySubtitle,
    discountRow, hsnRows, itemRows, qrBlock,
  } = ctx;

  const sigImg = doc.signature || org.signatureUrl;

  return `
  <div class="dc-header">
    <div class="dc-org">
      ${org.logoUrl ? `<img class="dc-logo" src="${esc(org.logoUrl)}" />` : ""}
      <div>
        <div class="dc-company">${esc(org.companyName || "Your Company")}</div>
        <div class="dc-addr">${esc(org.address || "")}</div>
        <div class="dc-gstin">GSTIN: ${esc(org.gstin || "—")}</div>
        <div class="dc-contact">Mobile: ${esc(org.mobile || "—")}&nbsp;&nbsp;&nbsp;Email: ${esc(org.email || "—")}</div>
      </div>
    </div>
    <div class="dc-title-block">
      <div class="dc-title">${t.isTax ? "TAX " + esc(docLabel) : esc(docLabel)}</div>
      <div class="dc-subtitle">${copySubtitle}</div>
    </div>
  </div>

  <div class="dc-meta">
    <div class="dc-cust">
      <div class="dc-label">Customer Details:</div>
      <div class="dc-label">${esc(dealName)}</div>
      <div>GSTIN: ${esc(doc.receiverGSTIN || "")}</div>
      <div class="dc-label dc-mt">Billing address:</div>
      <div class="dc-addr-box dc-addr">${esc(formatPostalAddress(doc.billingAddress))}</div>
      <div class="dc-label">Shipping address:</div>
      <div class="dc-addr-box dc-addr">${esc(formatPostalAddress(doc.shippingAddress))}</div>
    </div>
    <div class="dc-metagrid">
      <div class="dc-mcell"><span>${esc(docLabel)} #:</span><b>${esc(docNumber || "—")}</b></div>
      <div class="dc-mcell"><span>Date:</span><b>${esc(formatDate(doc.date) || "—")}</b></div>
      <div class="dc-mcell"><span>Place of Supply:</span><b>${esc(doc.placeOfSupply || "—")}</b></div>
      <div class="dc-mcell"><span>Due Date:</span><b>${esc(formatDate(doc.dueDate) || "—")}</b></div>
      <div class="dc-mcell"><span>Eway Bill #:</span><b>&nbsp;</b></div>
      <div class="dc-mcell"><span>Vehicle Number:</span><b>&nbsp;</b></div>
      <div class="dc-mcell dc-span2"><span class="dc-label">Dispatch From:</span><div class="dc-addr">${esc(org.address || "")}</div></div>
    </div>
  </div>

  <div class="vt-items-wrap">
  <table class="dc-items">
    <thead>
      <tr>
        <th style="width:24px;">#</th>
        <th style="text-align:left;">Item</th>
        <th style="width:52px;">HSN/SAC</th>
        <th class="r" style="width:60px;">Rate/Item</th>
        <th class="r nowrap" style="width:56px;">Qty</th>
        <th class="r" style="width:74px;">Taxable Value</th>
        ${!t.isTax
          ? ""
          : t.isInterState
            ? `<th class="r" style="width:74px;">IGST</th>`
            : `<th class="r" style="width:74px;">CGST</th><th class="r" style="width:74px;">SGST</th>`
        }
        <th class="r" style="width:80px;">Amount</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>
  </div>

  <div class="dc-totals">
    <div class="dc-totals-left">
      <div>Total Items / Qty : ${t.rows.length} / ${t.totalQty}</div>
      <div>Total amount (in words): INR ${esc(t.amountInWords)}</div>
      <div class="dc-bank-row">
        ${qrBlock}
      </div>
    </div>
    <div class="dc-totals-right ${!t.isTax ? "" : t.isInterState ? "dc-tax-single" : "dc-tax-split"}">
      <div class="dc-trow"><span class="dc-label">Taxable Amount</span><span>&#8377;${fmt(t.grossTaxable)}</span></div>
      ${discountRow}
      ${!t.isTax
        ? ""
        : t.isInterState
          ? `<div class="dc-trow sep"><span class="dc-label">IGST</span><span>&#8377;${fmt(t.totalIGST)}</span></div>`
          : `<div class="dc-trow sep"><span class="dc-label">CGST</span><span>&#8377;${fmt(t.totalCGST)}</span></div>
      <div class="dc-trow"><span class="dc-label">SGST</span><span>&#8377;${fmt(t.totalSGST)}</span></div>`
      }
      <div class="dc-grand"><span>Total</span><span>&#8377;${fmt(t.grandTotal)}</span></div>
      ${/* A part-paid document has to state what was received and what is
            still owed — printing only the total makes it look unpaid, and
            the customer has no way to see their payment landed. */ ""}
      ${t.isPartiallyPaid
        ? `<div class="dc-trow sep"><span class="dc-label">Amount Paid</span><span>&#8377;${fmt(t.amountPaid)}</span></div>
      <div class="dc-grand"><span>Balance Due</span><span>&#8377;${fmt(t.balanceDue)}</span></div>`
        : ""}
      ${t.isFullyPaid || doc.status === "Paid" ? `<div class="dc-paid"><span class="dc-tick">&#10003;</span><span>Amount Paid</span></div>` : ""}
    </div>
  </div>

  ${!t.isTax ? "" : `<table class="dc-hsn">
    <thead>
      ${t.isInterState
        ? `<tr>
        <th rowspan="2">HSN/SAC</th>
        <th rowspan="2">Taxable Value</th>
        <th colspan="2" class="c">Integrated Tax</th>
        <th rowspan="2">Total Tax Amount</th>
      </tr>
      <tr><th class="c">Rate</th><th class="c">Amount</th></tr>`
        : `<tr>
        <th rowspan="2">HSN/SAC</th>
        <th rowspan="2">Taxable Value</th>
        <th colspan="2" class="c">Central Tax</th>
        <th colspan="2" class="c">State Tax</th>
        <th rowspan="2">Total Tax Amount</th>
      </tr>
      <tr><th class="c">Rate</th><th class="c">Amount</th><th class="c">Rate</th><th class="c">Amount</th></tr>`
      }
    </thead>
    <tbody>
      ${hsnRows}
      ${t.isInterState
        ? `<tr class="tot">
        <td class="r">TOTAL</td>
        <td class="c">${fmt(t.totalTaxable)}</td>
        <td></td>
        <td class="r">${fmt(t.totalIGST)}</td>
        <td class="c">${fmt(t.totalIGST)}</td>
      </tr>`
        : `<tr class="tot">
        <td class="r">TOTAL</td>
        <td class="c">${fmt(t.totalTaxable)}</td>
        <td></td>
        <td class="r">${fmt(t.totalCGST)}</td>
        <td></td>
        <td class="r">${fmt(t.totalSGST)}</td>
        <td class="c">${fmt(t.totalCGST + t.totalSGST)}</td>
      </tr>`
      }
    </tbody>
  </table>`}

  <div class="dc-footer">
    <div class="dc-notes">
      ${notes ? `<div class="dc-label">Notes:</div><div class="dc-note-body">${notes}</div>` : ""}
      ${terms ? `<div class="dc-label${notes ? " dc-mt" : ""}">Terms and Conditions:</div><div class="dc-terms">${terms}</div>` : ""}
    </div>
    <div class="dc-sign">
      <div>For ${esc(org.companyName || "Your Company")}</div>
      <div>
        ${sigImg ? `<img class="dc-sign-img" src="${esc(sigImg)}" />` : `<div style="height:40px;"></div>`}
        <div class="dc-sign-line">Authorized Signatory</div>
      </div>
    </div>
  </div>
  `;
}
