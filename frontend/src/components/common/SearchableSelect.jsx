import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";

/**
 * Generic searchable single-select combobox — same interaction pattern as
 * PhoneNumberInput's country-code picker (button that opens a panel BELOW
 * itself with a search box up top and a short scrollable list, closing on
 * outside click/Escape/selection), just not tied to country codes.
 *
 * `options` is an array of { value, label } (or plain strings, which are
 * used as both value and label).
 */
export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  disabled = false,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);
  const panelRef = useRef(null);

  const normalized = options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o
  );

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
    // Panel opens BELOW the trigger — bring it fully into view instead of
    // leaving it clipped past the viewport bottom with no scroll of its own.
    panelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const selectedOption = normalized.find((o) => o.value === value);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? normalized.filter((o) => o.label.toLowerCase().includes(q))
    : normalized;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`${className} flex items-center justify-between gap-2 disabled:opacity-60 disabled:cursor-not-allowed`}
      >
        <span className={selectedOption ? "" : "text-gray-400"}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute left-0 top-full mt-1 w-full min-w-[220px] bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden"
        >
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-400">No matches</p>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={`w-full px-3 py-1.5 text-sm text-left hover:bg-gray-50 truncate ${
                    o.value === value ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700"
                  }`}
                >
                  {o.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
