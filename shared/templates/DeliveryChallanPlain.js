/*
 * DeliveryChallanPlain.js
 *
 * The one, fixed layout used for every Delivery Challan — never listed in
 * REGISTRY, never offered in the Change Template picker (buildDocumentHtml
 * routes straight to this file for type === "deliveryChallan", bypassing the
 * 13-template registry entirely). A delivery challan is proof of physical
 * dispatch, not a bill, so unlike every other document type it never shows
 * Rate/Taxable/GST/Amount — only what travelled: item, HSN/SAC, quantity and
 * unit — plus a Received By / Delivered By block for the physical handoff.
 *
 * Reuses the generic .dc-header/.dc-meta/.dc-items/.dc-footer/.dc-sign
 * classes from BASE_CSS (shared/documentTemplates.js) so it inherits the same
 * paper size, fonts and borders as the other templates; only the items table
 * and the signature footer are unique to this file.
 */

export const blurb = "Dispatch-only layout — item, HSN/SAC, quantity and unit, no pricing.";

export function html(ctx) {
  const {
    t, doc, org, esc, formatDate, formatPostalAddress,
    dealName, docLabel, docNumber, notes, terms,
  } = ctx;

  const sigImg = doc.signature || org.signatureUrl;

  const itemRows = t.rows.length
    ? t.rows.map((r, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td class="dc-item-name">${esc(r.name) || "&mdash;"}${
          r.description ? `<div class="dc-item-desc">${esc(r.description)}</div>` : ""
        }</td>
        <td class="c">${esc(r.hsn)}</td>
        <td class="r">${r.qty}</td>
        <td class="c">${esc(r.unit) || "&mdash;"}</td>
      </tr>`).join("")
    : `<tr><td class="c" colspan="5">&nbsp;</td></tr>`;

  return `
  <div class="dc-header">
    <div class="dc-org">
      ${org.logoUrl ? `<img class="dc-logo" src="${esc(org.logoUrl)}" />` : ""}
      <div>
        <div class="dc-company">${esc(org.companyName || "Your Company")}</div>
        <div class="dc-addr">${esc((typeof org.address === "string" ? org.address : formatPostalAddress(org.address).replace(/\n/g, ", ")) || "")}</div>
        <div class="dc-gstin">GSTIN: ${esc(org.gstin || "—")}</div>
        <div class="dc-contact">Mobile: ${esc(org.mobile || "—")}&nbsp;&nbsp;&nbsp;Email: ${esc(org.email || "—")}</div>
      </div>
    </div>
    <div class="dc-title-block">
      <div class="dc-title">${esc(docLabel)}</div>
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
      <div class="dc-mcell"><span>Eway Bill #:</span><b>&nbsp;</b></div>
      <div class="dc-mcell"><span>Vehicle Number:</span><b>&nbsp;</b></div>
      <div class="dc-mcell dc-span2"><span class="dc-label">Dispatch From:</span><div class="dc-addr">${esc((typeof org.address === "string" ? org.address : formatPostalAddress(org.address).replace(/\n/g, ", ")) || "")}</div></div>
    </div>
  </div>

  <div class="vt-items-wrap">
  <table class="dc-items">
    <thead>
      <tr>
        <th style="width:24px;">#</th>
        <th style="text-align:left;">Item Name / Description</th>
        <th style="width:80px;">HSN/SAC</th>
        <th class="r" style="width:70px;">Quantity</th>
        <th class="c" style="width:70px;">Unit</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
    <tfoot>
      <tr class="dc-plain-tot">
        <td colspan="3" class="r"><b>Total</b></td>
        <td class="r"><b>${t.totalQty}</b></td>
        <td></td>
      </tr>
    </tfoot>
  </table>
  </div>

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

  <div class="dc-recv">
    <div class="dc-recv-col">
      <div class="dc-label">Received By</div>
      <div class="dc-recv-line">Name: <span></span></div>
      <div class="dc-recv-line">Date: <span></span></div>
      <div class="dc-recv-line">Signature: <span></span></div>
    </div>
    <div class="dc-recv-col">
      <div class="dc-label">Delivered By</div>
      <div class="dc-recv-line">Name: <span></span></div>
      <div class="dc-recv-line">Date: <span></span></div>
      <div class="dc-recv-line">Signature: <span></span></div>
    </div>
  </div>
  `;
}

export const css = `
.dcsheet .dc-plain-tot td { border-top: 2px solid var(--line); }
.dcsheet .dc-recv { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; border: var(--line-w) solid var(--line); border-top: 0; margin-top: 8px; padding: var(--pad); }
.dcsheet .dc-recv-col { font-size: 10px; }
.dcsheet .dc-recv-line { margin-top: 14px; border-bottom: 1px solid var(--muted); padding-bottom: 2px; }
`;
