import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { COUNTRY_DIAL_CODES, DEFAULT_DIAL_CODE } from "../../utils/countryDialCodes";

/**
 * One phone field for the whole app: a country-code dropdown (IN +91 by
 * default) next to the number.
 *
 * Stores and emits a single string — "+91 9876543210" — rather than a pair of
 * fields. Every model already keeps `phone` as a plain String, and plenty of
 * code reads it straight out (duplicate detection, exports, SMS "to", contact
 * cards); splitting it into an object would mean touching all of them and
 * migrating existing records. Keeping one string means old values still work
 * and nothing downstream has to change.
 *
 * A value saved before this field existed has no code — it parses as "no code
 * chosen", so the dropdown shows the default without silently claiming the
 * number is Indian in the stored data until the user actually saves.
 */
export const splitPhone = (value) => {
  const raw = (value || "").trim();
  const m = raw.match(/^(\+\d{1,4})[\s-]*(.*)$/);
  if (m) return { code: m[1], number: m[2].trim() };
  return { code: "", number: raw };
};

export const joinPhone = (code, number) => {
  const n = (number || "").trim();
  if (!n) return "";
  return `${code || DEFAULT_DIAL_CODE} ${n}`;
};

// A plain <select> with ~50 countries rendered every option's full text into
// the browser's native popup — on some platforms that opened upward/off the
// trigger and there was no way to search, so finding a code meant scrolling
// a long native list. This is a small combobox instead: a button that opens
// a panel BELOW itself with a search box up top and a short scrollable list,
// closing on outside click/Escape/selection.
function CountryCodeDropdown({ selected, disabled, onSelect, className }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const handleEscape = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    searchInputRef.current?.focus();
    // The panel opens BELOW the trigger — if the trigger sits low enough on
    // the page, the panel can render past the viewport bottom with no
    // scrollbar of its own, so opening it looked like nothing happened
    // unless you already knew to scroll the page manually. Bring it fully
    // into view instead.
    panelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const selectedCountry =
    COUNTRY_DIAL_CODES.find((c) => c.code === selected) || COUNTRY_DIAL_CODES[0];

  const q = search.trim().toLowerCase();
  const filtered = q
    ? COUNTRY_DIAL_CODES.filter(
        (c) =>
          c.iso.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q) ||
          c.code.includes(q)
      )
    : COUNTRY_DIAL_CODES;

  return (
    <div ref={containerRef} className="relative flex-shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-label="Country code"
        className={`${className} flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed`}
      >
        <span>{selectedCountry.iso} {selectedCountry.code}</span>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute left-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden"
        >
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search country or code"
                className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-400">No matches</p>
            ) : (
              filtered.map((c) => (
                <button
                  key={`${c.iso}-${c.code}`}
                  type="button"
                  onClick={() => {
                    onSelect(c.code);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-sm text-left hover:bg-gray-50 ${
                    c.code === selected ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700"
                  }`}
                >
                  <span className="truncate">{c.iso} · {c.name}</span>
                  <span className="text-gray-400 flex-shrink-0 ml-2">{c.code}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PhoneNumberInput({
  value,
  onChange,
  placeholder = "9876543210",
  disabled = false,
  className = "",
  selectClassName = "",
  inputClassName = "",
  id,
}) {
  const { code, number } = splitPhone(value);
  const selected = code || DEFAULT_DIAL_CODE;

  const emit = (nextCode, nextNumber) => onChange(joinPhone(nextCode, nextNumber));

  return (
    <div className={`flex items-stretch gap-2 ${className}`}>
      <CountryCodeDropdown
        selected={selected}
        disabled={disabled}
        onSelect={(nextCode) => emit(nextCode, number)}
        className={
          selectClassName ||
          "border border-[#E0E0E1] rounded-xl px-2 h-12 text-[14px] text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
        }
      />
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        disabled={disabled}
        value={number}
        maxLength={10}
        // Digits only, capped at 10 — the code comes from the dropdown, so
        // anything typed here is just the subscriber number, and every
        // number this app deals with (India, +91) is 10 digits.
        onChange={(e) => emit(selected, e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
        className={
          inputClassName ||
          "flex-1 min-w-0 border border-[#E0E0E1] rounded-xl px-4 h-12 text-[14px] text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#A0A0A0]"
        }
        placeholder={placeholder}
      />
    </div>
  );
}
