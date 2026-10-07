import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import {
  DUE_DATE_PRESETS,
  describeDueDateFilter,
  isDueDateFilterActive,
  emptyDueDateFilter,
} from "../../utils/dueDateFilter";

// Toolbar pill for the Due Date preset / Custom Range filter. Same look as the
// compact FilterDropdown beside it. Presets apply on click; "Custom Range..."
// reveals From / To inputs and an Apply button. All the date maths lives in
// utils/dueDateFilter.js, shared with the global Tasks page.
export default function DueDateFilterPill({ label = "Due Date", value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [picking, setPicking] = useState(false); // custom range editor visible
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Each time the menu opens, start from what's currently applied.
  useEffect(() => {
    if (!isOpen) return;
    const isCustom = value?.preset === "custom";
    setPicking(isCustom);
    setFrom(isCustom ? value.from || "" : "");
    setTo(isCustom ? value.to || "" : "");
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const active = isDueDateFilterActive(value);
  const summary = active ? describeDueDateFilter(value) : label;
  const rangeInvalid = !!(from && to && from > to);
  const canApply = (from || to) && !rangeInvalid;

  const choose = (preset) => {
    if (preset === "custom") {
      setPicking(true);
      return;
    }
    onChange(preset === "all" ? emptyDueDateFilter() : { preset, from: "", to: "" });
    setIsOpen(false);
  };

  const applyCustom = () => {
    if (!canApply) return;
    onChange({ preset: "custom", from, to });
    setIsOpen(false);
  };

  const currentPreset = picking ? "custom" : active ? value.preset : "all";

  return (
    <div className="relative w-full" ref={ref}>
      <button
        type="button"
        title={label}
        onClick={() => setIsOpen((o) => !o)}
        className={`flex items-center justify-between gap-2 w-full h-[44px] px-4 border rounded-full bg-white text-sm transition-colors ${
          active ? "border-[#0085FF] text-[#0085FF]" : "border-[#E1E4EA] text-gray-700 hover:border-gray-300"
        }`}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown size={16} className={`flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 min-w-full w-[240px] mt-1 bg-white border border-gray-100 rounded-lg shadow-xl z-[100] py-1">
          {DUE_DATE_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => choose(p.value)}
              className="w-full flex items-center justify-between gap-3 px-3 py-2 text-sm text-left text-gray-700 hover:bg-gray-50"
            >
              <span className={currentPreset === p.value ? "text-[#0085FF] font-medium" : ""}>{p.label}</span>
              {currentPreset === p.value && <Check size={14} className="text-[#0085FF] flex-shrink-0" />}
            </button>
          ))}

          {picking && (
            <div className="border-t border-gray-100 mt-1 px-3 pt-3 pb-2 space-y-2">
              <label className="flex items-center justify-between gap-2 text-xs font-medium text-gray-500">
                From
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-[140px] border border-gray-300 rounded-lg text-sm text-gray-800 px-2 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </label>
              <label className="flex items-center justify-between gap-2 text-xs font-medium text-gray-500">
                To
                <input
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-[140px] border border-gray-300 rounded-lg text-sm text-gray-800 px-2 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </label>
              {rangeInvalid && <p className="text-xs text-red-500">"From" must be on or before "To".</p>}
              <button
                type="button"
                onClick={applyCustom}
                disabled={!canApply}
                className="w-full py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Apply
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
