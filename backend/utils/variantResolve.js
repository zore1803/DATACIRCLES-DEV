// Variant-first field resolution.
//
// Once an Item has variants, the parent is only a grouping container — the variant is what
// actually gets billed, stocked and scanned. Each variant may therefore override a handful of
// the parent's catalog fields (barcode, description, images, prices, discount, max discount %,
// low-stock threshold), and every unset override falls back to the parent's value.
//
// "Unset" has to be distinguished from "deliberately zero": a variant discount of 0 means "no
// discount on this variant", which is NOT the same as "inherit the parent's 10%". So these
// helpers treat only null/undefined/"" as unset and never use `||`, which would collapse 0 and
// "" into the parent's value. That distinction is the whole reason this lives in one place
// instead of being re-derived at each call site.
//
// The frontend mirror of this module is frontend/src/utils/variantResolve.js — keep the two in
// sync; they encode the same contract on either side of the API.

// True when a variant override carries no value and the parent's should be used instead.
const isUnset = (v) => v === null || v === undefined || v === "";

// Scalar override: variant value if set, else the parent's.
function resolveField(variant, item, field) {
  if (variant && !isUnset(variant[field])) return variant[field];
  return item ? item[field] : undefined;
}

// Array override (images): a variant's own non-empty array wins; an empty/absent one inherits.
function resolveImages(variant, item) {
  if (variant && Array.isArray(variant.images) && variant.images.length > 0) return variant.images;
  return (item && item.images) || [];
}

// Discount is a { type, value } pair. The variant overrides the pair as a unit only when it
// actually set a value — otherwise a variant that never touched discount would report
// "percentage / 0" and silently suppress the parent's configured discount.
function resolveDiscount(variant, item) {
  if (variant && !isUnset(variant.discount?.value)) {
    return {
      type: variant.discount.type || "percentage",
      value: variant.discount.value,
    };
  }
  return item?.discount || { type: "percentage", value: 0 };
}

// null at both levels is meaningful here: it means "no cap", not "cap of 0".
function resolveMaxDiscountPercent(variant, item) {
  if (variant && !isUnset(variant.maxDiscountPercent)) return variant.maxDiscountPercent;
  return item?.maxDiscountPercent ?? null;
}

// Low-stock threshold lives on the parent under inventory.lowStockThreshold, but on the variant
// as a flat field — hence its own helper rather than resolveField.
function resolveLowStockThreshold(variant, item) {
  if (variant && !isUnset(variant.lowStockThreshold)) return variant.lowStockThreshold;
  return item?.inventory?.lowStockThreshold ?? 0;
}

// A variant is low on stock against its own threshold. Used instead of comparing the parent's
// aggregate currentStock, which says nothing about whether one particular size has run out.
function isVariantLowStock(variant, item) {
  if (!variant) return false;
  return (variant.stock || 0) <= resolveLowStockThreshold(variant, item);
}

// Whether an item (with or without variants) should be flagged "Low Stock". For a variant-
// bearing item that's true as soon as ANY active variant is low — the parent's summed
// currentStock can look healthy while an individual size is at zero.
function isItemLowStock(item) {
  if (!item || item.type !== "product") return false;
  const variants = (item.variants || []).filter((v) => v.isActive !== false);
  if (variants.length > 0) {
    return variants.some((v) => isVariantLowStock(v, item));
  }
  return (item.inventory?.currentStock || 0) <= (item.inventory?.lowStockThreshold || 0);
}

module.exports = {
  isUnset,
  resolveField,
  resolveImages,
  resolveDiscount,
  resolveMaxDiscountPercent,
  resolveLowStockThreshold,
  isVariantLowStock,
  isItemLowStock,
};
