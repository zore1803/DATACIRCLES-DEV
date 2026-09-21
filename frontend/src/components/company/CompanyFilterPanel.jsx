import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import FilterDropdown from "./FilterDropdown";
import useColumnFilterDraft from "../../hooks/useColumnFilterDraft";

export default function CompanyFilterPanel({
  isOpen,
  onClose,
  columns,
  data = [],
  getFieldValue,
  selected = {},
  onApply,
  triggerRef,
}) {
  const { draft, valuesByColumn, toggleValue, apply, reset } = useColumnFilterDraft({
    isOpen,
    columns,
    data,
    getFieldValue,
    selected,
    onApply,
  });

  const [positionStyle, setPositionStyle] = useState({});

  useEffect(() => {
    if (isOpen && triggerRef?.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      // Position the panel below the button and aligned to its right edge
      setPositionStyle({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    } else {
      // Fallback position if no ref is provided (the original layout)
      setPositionStyle({ top: 220, right: window.innerWidth >= 1024 ? 80 : window.innerWidth >= 768 ? 60 : 24 });
    }
  }, [isOpen, triggerRef]);

  if (!isOpen) return null;

  const handleApply = () => {
    apply();
    onClose();
  };

  const handleClear = () => {
    reset();
    setTimeout(() => {
      onClose();
    }, 400); // Small delay so user sees it clear before closing
  };

  return (
    <div
      className="fixed inset-0 z-[10001] bg-transparent"
      onClick={onClose}
    >
      <div
        className="absolute bg-white rounded-xl shadow-[0px_8px_30px_rgba(0,0,0,0.12)] border border-gray-100 w-full max-w-[320px] flex flex-col animate-in fade-in zoom-in-95 duration-200"
        style={positionStyle}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 font-sf">Filters</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-100"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex flex-col gap-5">
          {columns.map(col => (
            <FilterDropdown
              key={col.key}
              label={col.label}
              options={valuesByColumn[col.key] || []}
              selected={draft[col.key] || []}
              onToggle={(val) => toggleValue(col.key, val)}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="p-5 flex items-center gap-3">
          <button
            onClick={handleClear}
            className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-200 transition-colors"
          >
            Reset
          </button>
          <button
            onClick={handleApply}
            className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
}
