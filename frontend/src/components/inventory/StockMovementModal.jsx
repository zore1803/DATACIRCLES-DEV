import Checkbox from "../common/Checkbox";
import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { X, AlertTriangle, MinusCircle, ChevronDown } from "lucide-react";
import API from "../../services/api";
import toast from "react-hot-toast";
import { getAncestorZoom } from "../../utils/domUtils";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

/*
 * Records a single stock-in or stock-out against one item. The direction is fixed by the caller
 * (the row's Stock In / Stock Out buttons), so this form never asks the user which way stock is
 * moving — only how much, when, and why.
 *
 * The backend is the authority on whether an out-movement is allowed: it rejects removing more
 * than is on hand unless `allowNegative` is sent. This form surfaces that as an inline
 * confirmation rather than silently forcing it through.
 */

// Suggestions for the Category combobox. The field is free-text — these are only shortcuts, and
// anything typed here is stored verbatim (the backend maps known wordings onto its reason enum).
const CATEGORY_SUGGESTIONS = {
  in: ["Purchase", "Customer Return", "Opening Stock", "Adjustment", "Transfer In", "Other"],
  out: ["Sale", "Damage / Loss", "Adjustment", "Transfer Out", "Other"],
};

// <input type="date"> needs yyyy-MM-dd regardless of how the value is displayed.
const toDateInputValue = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};

/*
 * Free-text combobox: type anything, or pick from the suggestions.
 *
 * Deliberately NOT a native <datalist> — browsers render that with their own OS chrome (an
 * opaque dark popup on Windows) that ignores the app's styling entirely. This mirrors
 * common/CustomDropdown instead: the menu is portaled to <body> at a fixed position measured off
 * the trigger, so a drawer's `overflow-y-auto` can't clip it, and it sits above the drawer's
 * z-index. CustomDropdown itself can't be reused here because it's select-only (a <button>), and
 * this field has to stay typeable.
 */
function CategoryCombobox({ value, onChange, options, placeholder, className }) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const wrapRef = useRef(null);
  const fieldRef = useRef(null);
  const menuRef = useRef(null);

  const positionMenu = () => {
    const el = fieldRef.current;
    if (!el) return;
    const zoom = getAncestorZoom(document.body);
    const rect = el.getBoundingClientRect();
    const viewportH = window.innerHeight / zoom;
    const viewportW = window.innerWidth / zoom;
    const MAX_MENU_H = 240;
    const MARGIN = 8;

    const top = rect.bottom / zoom;
    const spaceBelow = viewportH - top;
    // Flip above the field when there isn't room below — the drawer's category field sits
    // mid-panel, so a menu pinned below would otherwise run off the bottom.
    const openUp = spaceBelow < Math.min(MAX_MENU_H, 160) && rect.top / zoom > spaceBelow;

    setMenuPos({
      top: openUp ? undefined : top + 4,
      bottom: openUp ? viewportH - rect.top / zoom + 4 : undefined,
      left: Math.min(rect.left / zoom, viewportW - rect.width / zoom - MARGIN),
      width: rect.width / zoom,
      maxHeight: Math.max(120, (openUp ? rect.top / zoom : spaceBelow) - MARGIN - 4),
    });
  };

  useLayoutEffect(() => {
    if (!isOpen) return;
    positionMenu();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (
        wrapRef.current && !wrapRef.current.contains(e.target) &&
        menuRef.current && !menuRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };
    // Capture phase so scrolling the drawer body (a nested scroll container) closes the menu
    // rather than leaving a fixed-position portal stranded away from its field.
    const handleScroll = () => setIsOpen(false);
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [isOpen]);

  // Typing narrows the suggestions, but never blocks a value that isn't in the list.
  const query = (value || "").trim().toLowerCase();
  const filtered = query
    ? options.filter((o) => o.toLowerCase().includes(query))
    : options;

  return (
    <div className="relative" ref={wrapRef}>
      <div className="relative" ref={fieldRef}>
        <input
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className={`${className} pr-10`}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setIsOpen((o) => !o)}
          className="absolute right-0 top-0 h-full px-3 flex items-center text-gray-400 hover:text-gray-600"
          aria-label="Show categories"
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>
      </div>

      {isOpen && menuPos && createPortal(
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            top: menuPos.top,
            bottom: menuPos.bottom,
            left: menuPos.left,
            width: menuPos.width,
            maxHeight: menuPos.maxHeight,
            // Above this drawer (z-[99999]) — matches CustomDropdown's own stacking choice.
            zIndex: 100060,
          }}
          className="bg-white border border-[#E1E4EA] rounded-xl shadow-xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200"
        >
          <div className="overflow-y-auto py-1.5">
            {filtered.length === 0 ? (
              <div className="px-4 py-2.5 text-[13px] text-gray-400">
                No matching category — press enter to use “{value}”.
              </div>
            ) : (
              filtered.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    onChange(option);
                    setIsOpen(false);
                  }}
                  className={`w-full px-4 py-2.5 text-sm text-left hover:bg-[#F2F2F7] transition-colors ${
                    option === value ? "bg-[#F2F2F7] text-blue-600 font-semibold" : "text-gray-700"
                  }`}
                >
                  {option}
                </button>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default function StockMovementModal({ isOpen, onClose, item, direction, onSuccess }) {
  const isIn = direction === "in";
  useBodyScrollLock(isOpen);

  const [form, setForm] = useState({
    quantity: "",
    recordDate: toDateInputValue(new Date()),
    category: "",
    notes: "",
    unitPrice: "",
    priceIncludesTax: false,
    variantId: "",
  });
  const [loading, setLoading] = useState(false);
  // Set when the server rejects an over-issue; turns the submit button into an explicit
  // "record anyway" confirmation instead of repeating the same failing request.
  const [negativeWarning, setNegativeWarning] = useState(null);
  const [isSliding, setIsSliding] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  const hasVariants = (item?.variants?.length || 0) > 0;
  const selectedVariant = hasVariants
    ? item.variants.find((v) => String(v._id) === String(form.variantId)) || null
    : null;

  // Slide-in/out animation, matching the other quick-drawer forms (ItemForm,
  // CallLogForm, CompanyForm) instead of popping open and vanishing instantly.
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setTimeout(() => setIsSliding(true), 10);
    } else {
      setIsSliding(false);
      setTimeout(() => setShouldRender(false), 300);
    }
  }, [isOpen]);

  const handleClose = () => {
    setIsSliding(false);
    setTimeout(() => onClose(), 300);
  };

  useEffect(() => {
    if (!isOpen) return;
    setForm({
      quantity: "",
      recordDate: toDateInputValue(new Date()),
      category: "",
      notes: "",
      // Seeded from the item so the value line is meaningful straight away: an in-movement is
      // valued at what it costs to buy, an out-movement at what it sells for. Re-seeded from the
      // chosen variant's own price once one is picked, below.
      unitPrice: String((isIn ? item?.purchasePrice : item?.sellingPrice) ?? ""),
      priceIncludesTax: false,
      variantId: "",
    });
    setNegativeWarning(null);
  }, [isOpen, direction, item?._id]);

  // A product with variants tracks stock per-variant — the parent's own currentStock is just
  // the aggregate, so the movement (and its value line) has to be against the chosen variant.
  const currentStock = selectedVariant
    ? Number(selectedVariant.stock) || 0
    : hasVariants
      ? 0
      : Number(item?.inventory?.currentStock) || 0;
  const qty = parseFloat(form.quantity);
  const hasQty = Number.isFinite(qty) && qty > 0;
  const projected = hasQty ? (isIn ? currentStock + qty : currentStock - qty) : currentStock;

  const movementValue = useMemo(() => {
    const price = parseFloat(form.unitPrice);
    if (!Number.isFinite(qty) || !Number.isFinite(price)) return 0;
    return qty * price;
  }, [qty, form.unitPrice]);

  if (!shouldRender || !item) return null;

  const set = (patch) => setForm((p) => ({ ...p, ...patch }));

  const handleVariantChange = (variantId) => {
    const variant = item.variants.find((v) => String(v._id) === String(variantId)) || null;
    set({
      variantId,
      unitPrice: String((isIn ? variant?.purchasePrice : variant?.sellingPrice) ?? ""),
    });
    setNegativeWarning(null);
  };

  const submit = async (allowNegative = false) => {
    if (!hasQty) {
      toast.error("Enter a quantity greater than zero");
      return;
    }
    if (hasVariants && !selectedVariant) {
      toast.error("Select a variant");
      return;
    }
    setLoading(true);
    try {
      const res = await API.post(`/inventory/${item._id}/stock-${isIn ? "in" : "out"}`, {
        quantity: qty,
        recordDate: form.recordDate || undefined,
        category: form.category,
        notes: form.notes,
        unitPrice: form.unitPrice === "" ? undefined : Number(form.unitPrice),
        priceIncludesTax: form.priceIncludesTax,
        ...(selectedVariant ? { variantId: selectedVariant._id } : {}),
        ...(allowNegative ? { allowNegative: true } : {}),
      });
      toast.success(`Stock ${isIn ? "added" : "removed"} successfully`);
      // Hand the caller the item exactly as the write just returned it (the
      // authoritative post-transaction document) so it can patch the row in
      // place immediately, instead of only firing a background refetch that
      // the table wouldn't reflect until its next render pass.
      onSuccess?.(res.data);
      handleClose();
    } catch (err) {
      const data = err.response?.data;
      if (data?.code === "INSUFFICIENT_STOCK") {
        setNegativeWarning(data.error);
      } else {
        toast.error(data?.error || `Failed to record stock ${isIn ? "in" : "out"}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const accentBtn = isIn
    ? "bg-[#16A34A] hover:bg-green-700"
    : "bg-[#DC2626] hover:bg-red-700";

  // Same pill field spec as QuickCompanyForm/QuickVendorForm/CallLogForm —
  // brings this drawer's fields in line with the rest of the app's
  // quick-drawers (the shell/header already matched; only the fields
  // themselves were still the older h-11/rounded-lg style).
  const fieldClass =
    "w-full h-8 px-3 border border-[#1F2937]/10 rounded-full text-[12px] text-[#1F2937] bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50";
  const labelClass = "block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2";
  const helpClass = "mt-1.5 text-xs text-gray-500 leading-relaxed";

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[99998] transition-opacity duration-300"
        style={{ opacity: isSliding ? 1 : 0 }}
        onClick={handleClose}
        aria-hidden="true"
      />

      <div
        className={`fixed dc-panel-card dc-panel-w bg-white shadow-2xl z-[99999] flex flex-col overflow-hidden transform transition-transform duration-300 ease-out ${isSliding ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — matches the ItemForm/CompanyForm quick-drawer header spec:
            plain small uppercase title + X, nothing else. The item name and
            the primary action both moved out of here (name into the body,
            action into the footer) so this container matches every other
            quick-drawer instead of carrying its own bespoke chrome. */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#D9D9D9] flex-shrink-0 bg-white gap-1">
          <h2 className="text-[15px] font-normal leading-6 text-[#78788D] uppercase tracking-wide">
            {isIn ? "Stock In" : "Stock Out"}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            title="Close"
            className="w-5 h-5 flex items-center justify-center text-[#1C1B1F] hover:opacity-70 transition-opacity"
            aria-label="Close"
          >
            <X className="w-[18px] h-[18px]" strokeWidth={2} />
          </button>
        </div>

        {/* Body — flat field list, same as ItemForm/CompanyForm (no per-section
            bordered "card" wrappers around groups of fields). Fields now use
            the same pill spec (fieldClass above) as the rest of the app's
            quick-drawers, not the older h-11/rounded-lg style. */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5 font-inter custom-scrollbar">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 truncate">{item.name}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {(item.primaryUnit || "").split(" ")[0]}
              {!hasVariants || selectedVariant ? ` · Current stock ${currentStock}` : ""}
            </p>
          </div>

          {hasVariants && (
            <div>
              <label className={labelClass}>
                <span className="text-red-500">*</span> Variant
              </label>
              <select
                value={form.variantId}
                onChange={(e) => handleVariantChange(e.target.value)}
                className={`${fieldClass} appearance-none cursor-pointer`}
              >
                <option value="">Select a variant</option>
                {item.variants.map((v) => (
                  <option key={v._id} value={v._id}>
                    {v.name} — stock {Number(v.stock) || 0}
                  </option>
                ))}
              </select>
              <p className={helpClass}>
                This product has variants — stock is tracked per variant, not on the product itself.
              </p>
            </div>
          )}

          <div className="border-t border-gray-100 pt-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-gray-900">Quantity information</h3>
              {/* Out-only: prefills the quantity with everything on hand, i.e. zero the item out. */}
              {!isIn && (
                <button
                  type="button"
                  onClick={() => {
                    set({ quantity: String(currentStock) });
                    setNegativeWarning(null);
                  }}
                  className="flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <MinusCircle className="w-3.5 h-3.5" />
                  Clear Stock
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>
                  <span className="text-red-500">*</span> Quantity
                </label>
                {/* Unit is a fixed suffix, not an input — the item's own unit governs. */}
                <div className="flex items-stretch">
                  <input
                    type="number"
                    autoFocus
                    min="0"
                    step="any"
                    disabled={hasVariants && !selectedVariant}
                    value={form.quantity}
                    onChange={(e) => {
                      set({ quantity: e.target.value });
                      setNegativeWarning(null);
                    }}
                    placeholder="0"
                    className={`${fieldClass.replace("rounded-full", "rounded-l-full")} border-r-0 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed`}
                  />
                  <span className="h-8 px-3 flex items-center border border-l-0 border-[#1F2937]/10 rounded-r-full bg-gray-50 text-[12px] font-semibold text-gray-600 whitespace-nowrap">
                    {(item.primaryUnit || "PCS").split(" ")[0]}
                  </span>
                </div>
              </div>

              <div>
                <label className={labelClass}>Record Date</label>
                <input
                  type="date"
                  value={form.recordDate}
                  onChange={(e) => set({ recordDate: e.target.value })}
                  className={fieldClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Select Category</label>
              {/* Free-text with suggestions — the reference allows typing a custom category. */}
              <CategoryCombobox
                value={form.category}
                onChange={(v) => set({ category: v })}
                options={CATEGORY_SUGGESTIONS[isIn ? "in" : "out"]}
                placeholder="Select category or type your own"
                className={fieldClass}
              />
              <p className={helpClass}>
                Choose the category or type your own category that describes the reason for this
                stock {isIn ? "in" : "out"}.
              </p>
            </div>

            <div>
              <label className={labelClass}>Remarks</label>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => set({ notes: e.target.value })}
                className="w-full px-3 py-2 border border-[#1F2937]/10 rounded-2xl text-[12px] resize-y focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
              />
              <p className={helpClass}>Add notes here to help you remember important details.</p>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-5 space-y-4">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900">
                Price Details (used to calculate P&amp;L reports)
              </h3>
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                Optional
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Price</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={form.unitPrice}
                  onChange={(e) => set({ unitPrice: e.target.value })}
                  placeholder="0"
                  className={fieldClass}
                />
                <label className="mt-2.5 flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={form.priceIncludesTax} onChange={(e) => set({ priceIncludesTax: e.target.checked })} />
                  <span className="text-xs text-gray-600">This price includes tax as well.</span>
                </label>
              </div>

              <div>
                <label className={labelClass}>Stock {isIn ? "In" : "Out"} Value</label>
                {/* Derived, never typed — qty × price, so it can't disagree with the inputs. */}
                <div className="w-full h-8 px-3 flex items-center border border-[#1F2937]/10 rounded-full bg-gray-50 text-[12px] font-semibold text-gray-900">
                  {movementValue.toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Current -> projected, so the effect of the entry is visible before saving. Kept as
              its own small status strip (not a field-group card) — same treatment other quick
              drawers give a single derived/status line. */}
          <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-gray-50 border border-[#E1E4EA]">
            <span className="text-sm text-gray-500">Current stock</span>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="text-gray-900">{currentStock}</span>
              {hasQty && (
                <>
                  <span className="text-gray-400">→</span>
                  <span className={projected < 0 ? "text-red-600" : "text-gray-900"}>{projected}</span>
                </>
              )}
              <span className="text-[11px] font-medium text-gray-400 uppercase">
                {(item.primaryUnit || "").split(" ")[0]}
              </span>
            </div>
          </div>

          {negativeWarning && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-amber-900">{negativeWarning}</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Recording this will leave the item with negative stock.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer — matches the ItemForm/CompanyForm quick-drawer footer spec:
            Cancel + primary action as rounded-[25px] pill buttons. */}
        <div className="flex-shrink-0 py-2.5 px-4 border-t border-gray-100 bg-white flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="px-6 py-2 border border-gray-200 text-gray-700 rounded-[25px] text-sm font-bold hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => submit(!!negativeWarning)}
            disabled={loading}
            className={`px-6 py-2 rounded-[25px] text-sm font-bold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              negativeWarning ? "bg-amber-500 hover:bg-amber-600" : accentBtn
            }`}
          >
            {loading ? "Saving..." : negativeWarning ? "Record Anyway" : isIn ? "Add Quantity" : "Remove Quantity"}
          </button>
        </div>
      </div>
    </>
  );
}
