// Shared by every item picker (invoice, quotation, pro forma, delivery challan, purchase,
// purchase order, quick-add). Pickers must never download the whole catalog: they ask the
// server for one small page of ACTIVE items, and search the server as the user types.
// The server side is GET /items (itemController.getAllItems): ?limit= ?search= ?isActive=
// ?picker=true ?ids=.

// How many items a picker loads on open and per search. The server caps any limit at 100.
const ITEM_PICKER_LIMIT = 20;
const MAX_ITEM_PICKER_LIMIT = 100;

// Wait this long after the last keystroke before searching.
export const ITEM_PICKER_DEBOUNCE_MS = 250;

/**
 * Purpose: query params for one page of picker items.
 * Inputs: search - what the user typed ("" = just the newest page).
 *         alreadyPicked - how many of the returned items the form will hide (items already on
 *           the bill). The limit is raised by that many so hiding them can never leave the
 *           list looking empty while more matches exist.
 * Outputs: params object for API.get("/items", { params }).
 */
export function itemPickerParams(search = "", { alreadyPicked = 0 } = {}) {
  const term = typeof search === "string" ? search.trim() : "";
  const extra = Math.max(0, Math.floor(Number(alreadyPicked)) || 0);
  return {
    ...(term ? { search: term } : {}),
    limit: Math.min(MAX_ITEM_PICKER_LIMIT, ITEM_PICKER_LIMIT + extra),
    isActive: "true",
    picker: "true",
  };
}

/**
 * Purpose: query params to re-load specific products (an item id or a variant id each) — what a
 *   form uses for the lines already on a saved document, so they keep working without the whole
 *   catalog being downloaded.
 * Outputs: params object, or null when there is nothing to ask for.
 */
export function itemsByIdsParams(ids = []) {
  const unique = [...new Set((ids || []).filter(Boolean).map(String))].slice(0, MAX_ITEM_PICKER_LIMIT);
  if (unique.length === 0) return null;
  return { ids: unique.join(","), isActive: "true", picker: "true" };
}

// The list endpoint answers with a plain array.
export function itemsFromResponse(res) {
  return Array.isArray(res?.data) ? res.data : [];
}
