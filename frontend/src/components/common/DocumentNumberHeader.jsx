import React from "react";
import { ChevronDown } from "lucide-react";

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
  const numW = compact ? "w-11" : "w-16";
  const textSize = compact ? "text-xs" : "text-sm";

  const pill = (
    <div className="inline-flex items-stretch flex-shrink-0">
      {/* Prefix */}
      <div className={`${boxH} border border-[#E1E4EA] border-r-0 rounded-l-full bg-[#F8F9FB] flex items-center relative`}>
        <select
          value={prefix}
          onChange={(e) => onPrefixChange(e.target.value)}
          title={`${docLabel} number prefix`}
          aria-label={`${docLabel} number prefix`}
          className={`h-full ${compact ? "pl-2.5 pr-6" : "pl-3.5 pr-7"} ${textSize} font-semibold text-[#1F2937] bg-transparent focus:outline-none appearance-none cursor-pointer`}
        >
          {prefixOptions.length > 0 ? (
            prefixOptions.map((pfx) => (
              <option key={pfx} value={pfx}>{pfx}</option>
            ))
          ) : (
            <option value={prefix}>{prefix || "None"}</option>
          )}
        </select>
        <ChevronDown className={`${compact ? "w-3 h-3 right-1.5" : "w-3.5 h-3.5 right-2"} absolute text-gray-500 pointer-events-none`} />
      </div>

      {/* Number — read-only; allocated on save by the series counter. */}
      <input
        type="text"
        value={nextNumber != null ? String(nextNumber) : "Auto"}
        readOnly
        title={`${docLabel} number is allocated automatically on save`}
        aria-label={`${docLabel} number`}
        className={`${boxH} ${numW} px-2 border-y border-[#E1E4EA] ${textSize} font-semibold text-[#1F2937] bg-[#F8F9FB] focus:outline-none cursor-default text-center`}
      />

      {/* Suffix */}
      <div className={`${boxH} border border-[#E1E4EA] border-l-0 rounded-r-full bg-[#F8F9FB] flex items-center relative`}>
        <select
          value={suffix}
          onChange={(e) => onSuffixChange(e.target.value)}
          title={`${docLabel} number suffix (optional)`}
          aria-label={`${docLabel} number suffix`}
          className={`h-full ${compact ? "pl-2 pr-6" : "pl-2.5 pr-7"} ${textSize} font-semibold text-[#1F2937] bg-transparent focus:outline-none appearance-none cursor-pointer`}
        >
          <option value="">None</option>
          {suffixOptions.map((sfx) => (
            <option key={sfx} value={sfx}>{sfx}</option>
          ))}
        </select>
        <ChevronDown className={`${compact ? "w-3 h-3 right-1.5" : "w-3.5 h-3.5 right-2"} absolute text-gray-500 pointer-events-none`} />
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
