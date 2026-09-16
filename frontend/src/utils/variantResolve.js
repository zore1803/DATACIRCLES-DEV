// Variant-first field resolution (frontend mirror of backend/utils/variantResolve.js —
// keep the two in sync; they encode the same contract on either side of the API).
//
// Once an Item has variants, the parent is only a grouping container — the variant is what
// actually gets billed, stocked and scanned. Each variant may override a handful of the
// parent's catalog fields, and every unset override falls back to the parent's value.
//
// "Unset" is deliberately distinguished from "zero": a variant discount of 0 means "no discount
// on this variant", which is NOT "inherit the parent's 10%". So these helpers treat only
// null/undefined/"" as unset and never use `||`, which would collapse 0 and "" into the
// parent's value. Document forms previously wrote `variant.discount || item.discount` inline,
// which had exactly that bug latent in it — this module is the one place that gets it right.

export const isUnset = (v) => v === null || v === undefined || v === "";

// Scalar override: variant value if set, else the parent's.
export function resolveField(variant, item, field) {
  if (variant && !isUnset(variant[field])) return variant[field];
  return item ? item[field] : undefined;
}

// Array override (images): a variant's own non-empty array wins; an empty/absent one inherits.
export function resolveImages(variant, item) {
  if (variant && Array.isArray(variant.images) && variant.images.length > 0) return variant.images;
  return (item && item.images) || [];
}

// Discount is a { type, value } pair, overridden as a unit and only when the variant actually
// set a value — otherwise a variant that never touched discount would report "percentage / 0"
// and silently suppress the parent's configured discount.
export function resolveDiscount(variant, item) {
  if (variant && !isUnset(variant.discount?.value)) {
    return {
      type: variant.discount.type || "percentage",
      value: variant.discount.value,
    };
  }
  return item?.discount || { type: "percentage", value: 0 };
}

// null at both levels is meaningful: it means "no cap", not "cap of 0".
export function resolveMaxDiscountPercent(variant, item) {
  if (variant && !isUnset(variant.maxDiscountPercent)) return variant.maxDiscountPercent;
  return item?.maxDiscountPercent ?? null;
}

// Low-stock threshold lives on the parent under inventory.lowStockThreshold but on the variant
// as a flat field — hence its own helper rather than resolveField.
export function resolveLowStockThreshold(variant, item) {
  if (variant && !isUnset(variant.lowStockThreshold)) return variant.lowStockThreshold;
  return item?.inventory?.lowStockThreshold ?? 0;
}

// A variant is low on stock against its own threshold, rather than against the parent's
// aggregate currentStock (which says nothing about one particular size running out).
export function isVariantLowStock(variant, item) {
  if (!variant) return false;
  return (variant.stock || 0) <= resolveLowStockThreshold(variant, item);
}

// Whether an item (with or without variants) should be flagged "Low Stock". For a variant-
// bearing item that's true as soon as ANY active variant is low.
export function isItemLowStock(item) {
  if (!item || item.type !== "product") return false;
  const variants = (item.variants || []).filter((v) => v.isActive !== false);
  if (variants.length > 0) {
    return variants.some((v) => isVariantLowStock(v, item));
  }
  return (item.inventory?.currentStock || 0) <= (item.inventory?.lowStockThreshold || 0);
}

// Strips the form-only `_newImageFiles` key (File objects held by VariantImagePicker) before a
// variant is serialized into a request body. An explicit delete rather than a rest-destructure
// so it doesn't trip no-unused-vars at each call site, and it lives here rather than beside the
// picker so that component file keeps exporting only a component (react-refresh).
export function stripVariantFileState(variant) {
  const copy = { ...variant };
  delete copy._newImageFiles;
  return copy;
}
