import React, { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

/* Prefix/suffix picker with a rounded list (the browser's own select list is
   square and can't be styled). options: [{ value, label }]. */
const RoundedPick = ({ value, options, onChange, title, compact, textSize, padCls }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  const current = options.find((o) => o.value === value) || options[0];
  return (
    <div ref={ref} className="relative h-full">
      <button
        type="button"
        title={title}
        aria-label={title}
        onClick={() => setOpen((v) => !v)}
        className={`h-full ${padCls} ${textSize} font-semibold text-[#1F2937] bg-transparent focus:outline-none cursor-pointer whitespace-nowrap`}
      >
        {current?.label}
      </button>
      <ChevronDown className={`${compact ? "w-3 h-3 right-1.5" : "w-3.5 h-3.5 right-2"} absolute top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none transition-transform ${open ? "rotate-180" : ""}`} />
      {open && (
        <ul className="absolute left-0 top-full z-50 mt-1.5 max-h-56 min-w-full overflow-y-auto rounded-2xl border border-gray-200 bg-white p-1.5 shadow-xl">
          {options.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center rounded-xl px-3 py-1.5 text-left ${textSize} whitespace-nowrap ${
                  o.value === value ? "bg-[#E8F3FF] font-semibold text-[#0085FF]" : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/**
 * Editable prefix/suffix + read-only next-number control, mirroring the invoice
 * create screen (CreateInvoicePanel.jsx). Used by the purchase-side create
 * drawers (Purchase, Purchase Order, Purchase Return) so their numbers are
 * configurable per document just like invoices.
 *
 * Controlled: the parent owns `prefix`/`suffix` and passes the saved option
 * lists plus the auto-allocated `nextNumber` (from GET /document-settings'
 * `nextNumbers`). The number itself is read-only — it's allocated on save by
 * the server-side series counter, same as invoices.
 *
 * `compact` renders a single small pill (no label, no "+ Add" links) sized to
 * sit inline in a drawer header row. The full form keeps the "+ Add" links and
 * larger sizing for wider layouts.
 */
const DocumentNumberHeader = ({
  docLabel = "Document",
  prefix,
  suffix,
  onPrefixChange,
  onSuffixChange,
  prefixOptions = [],
  suffixOptions = [],
  nextNumber,
  onManageNumbering,
  compact = false,
}) => {
  const boxH = compact ? "h-8" : "h-9";
  // Width follows the number itself (in characters) so 4-, 5- or 6-digit
  // numbers are never clipped; never narrower than a 3-digit number.
  const numberText = nextNumber != null ? String(nextNumber) : "Auto";
  const numWidth = `${Math.max(numberText.length, 3) + 3}ch`;
  const textSize = compact ? "text-xs" : "text-sm";

  const pill = (
    <div className="inline-flex items-stretch flex-shrink-0">
      {/* Prefix */}
      <div className={`${boxH} border border-[#E1E4EA] border-r-0 rounded-l-full bg-[#F8F9FB] flex items-center relative`}>
        <RoundedPick
          value={prefix}
          onChange={onPrefixChange}
          title={`${docLabel} number prefix`}
          compact={compact}
          textSize={textSize}
          padCls={compact ? "pl-2.5 pr-6" : "pl-3.5 pr-7"}
          options={
            prefixOptions.length > 0
              ? prefixOptions.map((pfx) => ({ value: pfx, label: pfx }))
              : [{ value: prefix, label: prefix || "None" }]
          }
        />
      </div>

      {/* Number — read-only; allocated on save by the series counter. */}
      <input
        type="text"
        value={numberText}
        readOnly
        title={`${docLabel} number is allocated automatically on save`}
        aria-label={`${docLabel} number`}
        style={{ width: numWidth }}
        className={`${boxH} px-2 border-y border-[#E1E4EA] ${textSize} font-semibold text-[#1F2937] bg-[#F8F9FB] focus:outline-none cursor-default text-center`}
      />

      {/* Suffix */}
      <div className={`${boxH} border border-[#E1E4EA] border-l-0 rounded-r-full bg-[#F8F9FB] flex items-center relative`}>
        <RoundedPick
          value={suffix}
          onChange={onSuffixChange}
          title={`${docLabel} number suffix (optional)`}
          compact={compact}
          textSize={textSize}
          padCls={compact ? "pl-2 pr-6" : "pl-2.5 pr-7"}
          options={[{ value: "", label: "None" }, ...suffixOptions.map((sfx) => ({ value: sfx, label: sfx }))]}
        />
      </div>
    </div>
  );

  // Compact: just the pill, meant to sit inline in a header row.
  if (compact) return pill;

  // Full: pill above two "+ Add" links that jump to Settings → Numbering.
  return (
    <div className="inline-grid grid-cols-[auto_auto_auto] gap-y-0.5">
      {pill}
      <div className="col-span-3 flex items-center justify-between">
        <button
          type="button"
          onClick={onManageNumbering}
          className="text-[10px] font-medium text-blue-600 hover:text-blue-800 underline underline-offset-1 whitespace-nowrap"
        >
          + Add Prefix
        </button>
        <button
          type="button"
          onClick={onManageNumbering}
          className="text-[10px] font-medium text-blue-600 hover:text-blue-800 underline underline-offset-1 whitespace-nowrap"
        >
          + Add Suffix
        </button>
      </div>
    </div>
  );
};

export default DocumentNumberHeader;
