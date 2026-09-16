import React, { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, MapPin } from "lucide-react";
import { createPortal } from "react-dom";
import { getAncestorZoom } from "../../utils/domUtils";
import { INDIA_STATES, CITIES_BY_STATE, ALL_CITIES } from "../../constants/addressOptions";

/*
 * Small building blocks shared by Accounting.jsx's CreateInvoicePanel (the
 * default split-view create/edit screen) and FullWidthDocumentPanel (the
 * alternate full-width layout opened via the "Hide preview" toggle). Moved
 * out to their own module so neither screen has to duplicate — and risk
 * drifting from — the other's copy of the same picker/address/label markup.
 */

export const SectionHeader = ({ number, title }) => (
  <div className="flex items-center gap-2.5 w-full mb-1.5 mt-2 first:mt-0">
    <div className="flex items-center justify-center w-5 h-5 rounded-full bg-[#F0F6FF] text-[#0085FF] text-[10px] font-semibold flex-shrink-0">
      {number}
    </div>
    <span className="text-[15px] font-semibold text-[#1F2937] whitespace-nowrap">
      {title}
    </span>
  </div>
);

export const GSTIN_REGEX =
  /^[0-9]{2}[A-Z0-9]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Z]{1}[0-9A-Z]{1}$/;

export const blankItem = () => ({
  _id: null,
  name: "",
  description: "",
  rate: "",
  quantity: 1,
  hsn: "",
  isVariant: false,
  parentItemId: null,
  discountType: "amount",
  discount: 0,
  gstRate: 0,
});

// Same shape as the backend's postalAddressSchema (Invoice/ProformaInvoice/
// Quotation/DeliveryChallan models), so the form can round-trip a document's
// saved address without dropping fields.
export const emptyAddress = () => ({
  addressLine1: "",
  addressLine2: "",
  pincode: "",
  city: "",
  state: "",
  country: "",
});

export const isAddressEmpty = (addr) =>
  !addr || Object.values(addr).every((v) => !v || !String(v).trim());

// Looks up an Indian PIN code via India Post's public API (no key required)
// to fill State/City automatically — a pincode uniquely determines both, so
// asking the user to also pick them by hand is redundant once it's typed.
// Matched against this module's own INDIA_STATES/CITIES_BY_STATE (not the
// raw API district name) so the result lands on a real option in the
// State/City dropdowns above rather than a lookalike string that fails to
// match. Same approach as QuickCompanyForm's lookupIndianPincode.
const lookupIndianPincode = async (pincode) => {
  if (!/^\d{6}$/.test(pincode)) return null;
  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
    const data = await res.json();
    const po = data?.[0]?.Status === "Success" ? data[0].PostOffice?.[0] : null;
    if (!po) return null;

    const matchedState = INDIA_STATES.find((s) => s.toLowerCase() === po.State?.toLowerCase());
    if (!matchedState) return null;

    const cities = CITIES_BY_STATE[matchedState] || [];
    const districtOrTaluk = po.District || po.Block || po.Taluk || "";
    const matchedCity =
      cities.find((c) => c.toLowerCase() === districtOrTaluk.toLowerCase()) ||
      cities.find((c) => c.toLowerCase() === po.Name?.toLowerCase()) ||
      districtOrTaluk ||
      po.Name ||
      "";

    return { country: "India", state: matchedState, city: matchedCity };
  } catch (_) {
    return null; // Non-fatal — the user can still fill state/city by hand.
  }
};

export const AddressFieldsGroup = ({ label, value, onChange, disabled = false, required = false, invalid = false, onUseSaved }) => {
  const safeValue = value || emptyAddress();
  const fieldBorder = invalid
    ? "border-red-400 focus:ring-red-500/20 focus:border-red-500"
    : "border-[#1F2937]/10 focus:ring-blue-500";
  const inputCls = `w-full h-[38px] px-3.5 rounded-full border ${fieldBorder} bg-white text-[13px] text-[#1F2937] placeholder:text-[#1F2937] placeholder:opacity-50 focus:outline-none focus:ring-1 transition-all disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200`;
  // Match the height/radius/pill shape of the company form's inputs beside them.
  const pickerTriggerCls = "h-[38px] rounded-full text-[13px]";

  const stateOptions = INDIA_STATES.map((n) => ({ value: n, label: n }));
  // Scoped to the selected state; before one is picked, offer every city we
  // know so the field is still usable rather than an empty dropdown.
  const cityOptions = (
    safeValue.state && CITIES_BY_STATE[safeValue.state]
      ? [...CITIES_BY_STATE[safeValue.state]].sort()
      : ALL_CITIES
  ).map((n) => ({ value: n, label: n }));

  return (
    <div className="flex flex-col gap-3 w-full @md:col-span-2">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[#0085FF]">
            <MapPin className="w-3.5 h-3.5" />
          </div>
          <span className="text-[14px] font-semibold text-slate-800">
            {label} {required && <span className="text-red-500">*</span>}
          </span>
        </div>
        {onUseSaved && !disabled && (
          <button
            type="button"
            onClick={onUseSaved}
            className="text-[12px] font-medium text-[#0085FF] hover:underline flex-shrink-0"
          >
            Use saved address
          </button>
        )}
      </div>
      <div className="flex flex-col gap-3">
        <div className="relative">
          <input
            type="text"
            value={safeValue.addressLine1 || ""}
            disabled={disabled}
            onChange={(e) => onChange({ ...safeValue, addressLine1: e.target.value })}
            placeholder="Address line 1"
            className={inputCls}
          />
        </div>
        <div className="relative">
          <input
            type="text"
            value={safeValue.addressLine2 || ""}
            disabled={disabled}
            onChange={(e) => onChange({ ...safeValue, addressLine2: e.target.value })}
            placeholder="Address line 2"
            className={inputCls}
          />
        </div>
        {/* State comes before City: the city list is scoped to the chosen
            state, so asking for the state first is what makes the city
            dropdown short enough to be useful. */}
        <div className="grid grid-cols-2 @md:grid-cols-3 gap-3">
          <PickerSelect
            value={safeValue.state || ""}
            options={stateOptions}
            placeholder="State"
            disabled={disabled}
            allowCustom
            triggerClassName={pickerTriggerCls}
            onSelect={(o) =>
              onChange({
                ...safeValue,
                state: o.value,
                // A city from the previous state would be wrong under the new
                // one, so it's cleared — unless it also exists in the new
                // state's list (several city names repeat across states).
                city: (CITIES_BY_STATE[o.value] || []).includes(safeValue.city)
                  ? safeValue.city
                  : "",
              })
            }
          />
          <PickerSelect
            value={safeValue.city || ""}
            options={cityOptions}
            placeholder="City"
            disabled={disabled}
            allowCustom
            triggerClassName={pickerTriggerCls}
            onSelect={(o) => onChange({ ...safeValue, city: o.value })}
          />
          <input
            type="text"
            value={safeValue.pincode || ""}
            disabled={disabled}
            onChange={async (e) => {
              const pincode = e.target.value.replace(/\D/g, "").slice(0, 6);
              onChange({ ...safeValue, pincode });
              // Only fire once a full 6-digit code is typed — a request per
              // keystroke would spam pincodes India Post will 404 on anyway.
              if (pincode.length === 6) {
                const match = await lookupIndianPincode(pincode);
                if (match) onChange({ ...safeValue, pincode, ...match });
              }
            }}
            placeholder="Pincode"
            className={`${inputCls} @md:col-span-1 col-span-2`}
          />
        </div>
        <div className="relative">
          <input
            type="text"
            value={safeValue.country || ""}
            disabled={disabled}
            onChange={(e) => onChange({ ...safeValue, country: e.target.value })}
            placeholder="Country"
            className={inputCls}
          />
        </div>
      </div>
    </div>
  );
};

/* Small searchable select used for the Deal and Item pickers. Kept local so
   the panel doesn't inherit behaviour from the older form's dropdowns. */
export const PickerSelect = ({
  value,
  options,
  placeholder,
  onSelect,
  searchable = true,
  icon: Icon,
  invalid = false,
  disabled = false,
  // Offers "Use <what you typed>" when the search matches nothing, so a value
  // outside the option list is still reachable. The address pickers need this:
  // the city list is a curated set of the places that actually turn up on
  // invoices, not every town in India, and it must never be a dead end.
  allowCustom = false,
  // Lets a caller match the surrounding field styling (the address block's
  // inputs are taller and more rounded than the item-row pickers this was
  // originally written for).
  triggerClassName = "h-10 rounded-lg",
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dropdownStyle, setDropdownStyle] = useState({});
  const wrapRef = useRef(null);
  const dropdownRef = useRef(null);

  const updatePosition = useCallback(() => {
    if (open && wrapRef.current) {
      // rect is VISUAL px; this dropdown portals to document.body, which
      // paints inside the app's dynamic <html> zoom, so every rect-derived
      // value has to be divided by that zoom or it drifts off-position —
      // same correction the column menu and drag ghost already apply.
      const zoom = getAncestorZoom(document.body);
      const rect = wrapRef.current.getBoundingClientRect();
      const left = rect.left / zoom;
      const top = rect.top / zoom;
      const bottom = rect.bottom / zoom;
      const triggerWidth = rect.width / zoom;
      const viewportWidth = window.innerWidth / zoom;
      const viewportHeight = window.innerHeight / zoom;
      const spaceBelow = viewportHeight - bottom;
      const spaceAbove = top;
      const MARGIN = 8;

      // Item pickers sit in narrow grid columns — tying the dropdown's width
      // to the trigger's own width (as narrow as ~80px there) is what made
      // it look like a crushed little box. Give it a real minimum width
      // instead, and clamp so it never runs past the right edge.
      const width = Math.max(triggerWidth, 260);
      let left_ = Math.min(left, viewportWidth - width - MARGIN);
      left_ = Math.max(left_, MARGIN);

      let style = {
        position: "fixed",
        left: `${left_}px`,
        width: `${width}px`,
        zIndex: 99999, // Ensure it floats above dialogs
      };

      if (spaceBelow < 256 && spaceAbove > spaceBelow) {
        style.bottom = `${viewportHeight - top + 4}px`;
        style.maxHeight = `${Math.min(256, spaceAbove - 16)}px`;
      } else {
        style.top = `${bottom + 4}px`;
        style.maxHeight = `${Math.min(256, spaceBelow - 16)}px`;
      }
      setDropdownStyle(style);
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      updatePosition();
      window.addEventListener("resize", updatePosition);
      window.addEventListener("scroll", updatePosition, true);
      return () => {
        window.removeEventListener("resize", updatePosition);
        window.removeEventListener("scroll", updatePosition, true);
      };
    }
  }, [open, updatePosition]);

  useEffect(() => {
    const onDocClick = (e) => {
      const clickedInWrap = wrapRef.current && wrapRef.current.contains(e.target);
      const clickedInDropdown = dropdownRef.current && dropdownRef.current.contains(e.target);
      if (!clickedInWrap && !clickedInDropdown) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const matched = options.find((o) => o.value === value);
  // Falling back to the raw value keeps a custom or legacy entry visible in
  // the trigger instead of silently reading as empty.
  const selected = matched || (value ? { value, label: value } : null);
  const filtered = query
    ? options.filter((o) =>
      o.label.toLowerCase().includes(query.toLowerCase())
    )
    : options;

  return (
    <div ref={wrapRef} className="relative w-full min-w-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) setOpen((v) => !v); }}
        className={`w-full ${triggerClassName} flex items-center gap-2 px-3.5 border bg-white text-left focus:outline-none focus:ring-1 transition-all disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed ${
          invalid
            ? "border-red-400 focus:ring-red-500"
            : "border-[#1F2937]/10 focus:ring-blue-500"
        }`}
      >
        {Icon && <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />}
        <span
          className={`flex-1 truncate text-sm ${selected ? "text-[#1F2937]" : "text-[#99A0AE]"
            }`}
        >
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
      </button>

      {open && createPortal(
        <div
          ref={dropdownRef}
          style={dropdownStyle}
          className="bg-white border border-[#E1E4EA] rounded-lg shadow-xl flex flex-col overflow-hidden"
        >
          {searchable && (
            <div className="p-2 bg-white border-b border-[#E1E4EA] flex-shrink-0">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search..."
                className="w-full h-8 px-2 text-sm rounded-md border border-[#E1E4EA] focus:outline-none focus:border-[#0085FF]"
              />
            </div>
          )}
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 && !(allowCustom && query.trim()) && (
              <p className="px-3 py-3 text-sm text-gray-400">No results</p>
            )}
            {allowCustom && query.trim() &&
              !options.some((o) => o.label.toLowerCase() === query.trim().toLowerCase()) && (
              <button
                type="button"
                onClick={() => {
                  const custom = query.trim();
                  onSelect({ value: custom, label: custom });
                  setOpen(false);
                  setQuery("");
                }}
                className="w-full text-left px-3 py-2 text-sm text-[#0085FF] hover:bg-blue-50 border-b border-[#E1E4EA] transition-colors"
              >
                Use &ldquo;{query.trim()}&rdquo;
              </button>
              )}
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onSelect(o);
                  setOpen(false);
                  setQuery("");
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 transition-colors ${o.value === value ? "bg-blue-50 text-blue-600 font-medium" : "text-gray-700"
                  }`}
              >
                <span className="flex-1 truncate">{o.label}</span>
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export const FieldLabel = ({ children, required }) => (
  <label className="block text-xs text-[#525866] mb-1.5">
    {children}
    {required && <span className="text-red-500 ml-0.5">*</span>}
  </label>
);
