import Checkbox from "../common/Checkbox";
import React, { useState, useRef, useEffect } from "react";
import { X, ChevronDown } from "lucide-react";

// A custom multi-select dropdown for one filter column. Shared by the side
// CompanyFilterPanel and the horizontal InlineFilterBar so both look and
// behave identically.
const FilterDropdown = ({ label, options, selected, onToggle, placeholder: placeholderOverride }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Format placeholder safely
  const placeholder = placeholderOverride
    || (label.endsWith("s") ? `All ${label}` : (label.endsWith("us") ? `All ${label}es` : `All ${label}s`));

  return (
    <div className="flex flex-col gap-1.5 w-full relative" ref={dropdownRef}>
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full border border-gray-200 rounded-lg px-3 py-2 cursor-pointer bg-white hover:border-gray-300 transition-colors min-h-[42px]"
      >
        <div className="flex flex-wrap gap-1.5 items-center overflow-hidden">
          {selected.length === 0 ? (
            <span className="text-sm text-gray-500">{placeholder}</span>
          ) : (
            selected.map(val => (
              <span key={val} className="flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs font-medium">
                <span className="truncate max-w-[120px]">{val}</span>
                <X
                  size={14}
                  className="cursor-pointer hover:text-blue-900 transition-colors rounded-full hover:bg-blue-100 p-px"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle(val);
                  }}
                />
              </span>
            ))
          )}
        </div>
        <ChevronDown size={16} className={`text-gray-400 flex-shrink-0 ml-2 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 w-full mt-1 bg-white border border-gray-100 rounded-lg shadow-xl z-[100] max-h-60 overflow-y-auto py-1">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500 italic">No options</div>
          ) : (
            options.map(opt => (
              <label key={opt} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                <Checkbox checked={selected.includes(opt)} onChange={() => onToggle(opt)} />
                <span className="text-sm text-gray-700 truncate">{opt}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default FilterDropdown;
