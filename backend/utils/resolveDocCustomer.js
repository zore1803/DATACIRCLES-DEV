const Deal = require("../models/Deal");
const Company = require("../models/Company");

/**
 * Resolves customer linkage + address/GST data for a Quotation / Proforma,
 * applying the "deal XOR direct-link" rule agreed for these two document types:
 *
 *   - Deal set  → store `deal`; company/contact are derived THROUGH the deal and
 *                 left null on the document (one source of truth).
 *   - No deal   → store the directly-selected `company` and/or `contact`.
 *
 * Address/GST fields the caller already supplied always win; anything missing is
 * filled from the "source" company — the deal's company when deal-linked, else the
 * directly-selected company. This mirrors the original `deal.company` fallback the
 * controllers used, just generalised so deal-less documents resolve the same way.
 *
 * Invoice is intentionally NOT a caller here — it keeps its deal-required flow.
 *
 * @param {Object} input
 * @param {string|null} input.deal
 * @param {string|null} input.company
 * @param {string|null} input.contact
 * @param {Object} [input.billingAddress]
 * @param {Object} [input.shippingAddress]
 * @param {string} [input.receiverGSTIN]
 * @param {*} input.organization
 * @returns {Promise<{links: {deal: *, company: *, contact: *}, billingAddress: Object, shippingAddress: Object, receiverGSTIN: string}>}
 */
async function resolveDocCustomer({
  deal,
  company,
  contact,
  billingAddress,
  shippingAddress,
  receiverGSTIN,
  organization,
}) {
  const dealDoc = deal ? await Deal.findById(deal).populate("company") : null;

  // Source company for the address/GST fallback.
  let sourceCompany = dealDoc?.company || null;
  if (!sourceCompany && !deal && company) {
    sourceCompany = await Company.findOne({ _id: company, organization });
  }

  let finalBillingAddress = billingAddress;
  let finalShippingAddress = shippingAddress;
  let finalReceiverGSTIN = receiverGSTIN;
  if (sourceCompany) {
    if (!finalBillingAddress || Object.keys(finalBillingAddress).length === 0) {
      finalBillingAddress = sourceCompany.billingAddress || {};
    }
    if (!finalShippingAddress || Object.keys(finalShippingAddress).length === 0) {
      finalShippingAddress = sourceCompany.shippingAddresses?.[0] || {};
    }
    if (!finalReceiverGSTIN) {
      finalReceiverGSTIN = sourceCompany.gstin || "";
    }
  }

  // XOR storage: a deal-linked document stores only the deal; a deal-less one
  // stores only the direct company/contact. Never both.
  const links = deal
    ? { deal, company: null, contact: null }
    : { deal: null, company: company || null, contact: contact || null };

  return {
    links,
    billingAddress: finalBillingAddress,
    shippingAddress: finalShippingAddress,
    receiverGSTIN: finalReceiverGSTIN,
  };
}

module.exports = { resolveDocCustomer };
