// Place of Supply for a goods sale, and the tax type it implies.
//
// For goods the place of supply is where they are delivered, so it is taken
// from the SHIPPING address. Billing is only a fallback for documents whose
// shipping address was never filled in (the form mirrors billing into shipping
// whenever "same as billing" is on, so in practice the two agree there).
//
// Nothing here decides a GST percentage: rates stay per line, on the
// product/variant. Place of supply only chooses CGST+SGST vs IGST.
import { getStateCode } from "./gstStateCode";

// { state, stateCode, label } for the address that governs supply, or null when
// no GST state code can be resolved (e.g. a non-Indian address). A code is never
// invented for a state the GST table doesn't know.
export function resolvePlaceOfSupply(shippingAddress, billingAddress) {
  const candidates = [shippingAddress, billingAddress];
  for (const addr of candidates) {
    const state = (addr?.state || "").trim();
    if (!state) continue;
    const stateCode = addr?.stateCode || getStateCode(state);
    if (!stateCode) continue;
    return { state, stateCode, label: `${state} (${stateCode})` };
  }
  return null;
}

// "intra" | "inter", or null when it cannot be determined — callers keep
// whatever the document already has rather than guessing.
//
// Compares GST state CODES rather than names, so "Chattisgarh" and
// "Chhattisgarh" (India Post vs the dropdown) don't read as different states.
export function resolveTransactionType(sellerState, shippingAddress, billingAddress) {
  const supplierCode = getStateCode(sellerState);
  const pos = resolvePlaceOfSupply(shippingAddress, billingAddress);
  if (!supplierCode || !pos?.stateCode) return null;
  return supplierCode === pos.stateCode ? "intra" : "inter";
}

// The two fields a document stores so reopening it never re-derives the place
// of supply from a customer address that has changed since.
export function placeOfSupplyFields(shippingAddress, billingAddress) {
  const pos = resolvePlaceOfSupply(shippingAddress, billingAddress);
  return {
    // String, because every PDF template renders `doc.placeOfSupply` directly.
    placeOfSupply: pos?.label || "",
    placeOfSupplyStateCode: pos?.stateCode || "",
  };
}
