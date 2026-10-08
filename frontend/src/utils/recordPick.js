// Used by the document forms (quotation, pro forma, invoice panel) that let the user pick a
// company or a contact. Those forms no longer download the whole company / contact lists, so
// when they need a record — its billing/shipping address and GSTIN, or which company a contact
// belongs to — it comes from the pick itself, from a small cache of records already seen, or
// from one by-id request. This file is plain logic (no React, no network of its own) so it can
// be tested directly; the hook in hooks/useRecordCache.js wires it to the API.

// The company id a contact points at. The list endpoint populates `company` ({ _id, name, ... });
// other responses carry the bare id.
export const companyIdOf = (contact) => String(contact?.company?._id || contact?.company || "");

/**
 * Purpose: remember records ("companies" / "contacts") that were picked or loaded, so reading
 *   one again never costs a request.
 * Inputs: fetchById(kind, id) -> Promise<record> — only called on a cache miss.
 * Outputs: { remember(kind, record), peek(kind, id), get(kind, id) }
 *   get() resolves to null when the record can't be loaded; concurrent calls share one request.
 */
export function createRecordCache(fetchById) {
  const store = { companies: new Map(), contacts: new Map() };
  const inFlight = new Map();

  const remember = (kind, record) => {
    if (record && record._id) store[kind].set(String(record._id), record);
  };
  const peek = (kind, id) => (id ? store[kind].get(String(id)) || null : null);
  const get = (kind, id) => {
    if (!id) return Promise.resolve(null);
    const hit = peek(kind, id);
    if (hit) return Promise.resolve(hit);
    const key = `${kind}:${id}`;
    if (!inFlight.has(key)) {
      inFlight.set(
        key,
        Promise.resolve()
          .then(() => fetchById(kind, String(id)))
          .then((record) => {
            remember(kind, record);
            return record || null;
          })
          .catch(() => null)
          .finally(() => inFlight.delete(key))
      );
    }
    return inFlight.get(key);
  };
  return { remember, peek, get };
}

/**
 * Purpose: everything a form needs to know after a COMPANY was picked.
 * Inputs: companyId ("" when cleared); record — the row the dropdown handed back with the pick
 *   (so usually no request is needed); currentContactId — the contact already on the form.
 * Outputs: { company, keepContact } — the company record (for its addresses / GSTIN), and whether
 *   the current contact belongs to that company and may stay.
 */
export async function resolveCompanyPick(records, companyId, { record, currentContactId } = {}) {
  if (record) records.remember("companies", record);
  const company = companyId ? record || (await records.get("companies", companyId)) : null;
  let keepContact = false;
  if (companyId && currentContactId) {
    const contact = await records.get("contacts", currentContactId);
    keepContact = !!contact && companyIdOf(contact) === String(companyId);
  }
  return { company, keepContact };
}

/**
 * Purpose: everything a form needs to know after a CONTACT was picked.
 * Inputs: contactId; record — the row the dropdown handed back; needCompany — false when the form
 *   already has a company, so the contact's company record is not fetched for nothing.
 * Outputs: { contact, contactCompanyId, company } — company is the contact's company record
 *   (loaded by id: the list row only carries its name and GSTIN), or null.
 */
export async function resolveContactPick(records, contactId, { record, needCompany = true } = {}) {
  if (record) records.remember("contacts", record);
  const contact = contactId ? record || (await records.get("contacts", contactId)) : null;
  const contactCompanyId = companyIdOf(contact);
  const company = needCompany && contactCompanyId ? await records.get("companies", contactCompanyId) : null;
  return { contact, contactCompanyId, company };
}
