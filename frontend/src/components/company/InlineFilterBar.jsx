import React, { useEffect, useState } from "react";
import FilterDropdown from "./FilterDropdown";
import useColumnFilterDraft from "../../hooks/useColumnFilterDraft";

/**
 * Horizontal filter row that slides open beneath a list's search bar — the
 * in-flow alternative to the side CompanyFilterPanel for short, simple filter
 * sets. Same props, same dropdowns and same filtering logic as the panel
 * (useColumnFilterDraft), so a page can swap one for the other without
 * touching how its data is filtered.
 *
 * Animation: the grid-template-rows 0fr -> 1fr trick expands to the row's
 * natural height (no hard-coded max-height), with opacity alongside, ~250ms.
 * Content below it simply moves down with it — no overlay, no portal.
 *
 * `overflow: hidden` is required while animating (otherwise the row shows at
 * full height during the collapse), but it would also clip the dropdown menus,
 * which open below the row. So it's only applied until the open transition
 * finishes, and re-applied the moment a close starts.
 */
export default function InlineFilterBar({
  isOpen,
  columns,
  data = [],
  getFieldValue,
  selected = {},
  onApply,
}) {
  const { draft, valuesByColumn, toggleValue, apply, reset } = useColumnFilterDraft({
    isOpen,
    columns,
    data,
    getFieldValue,
    selected,
    onApply,
  });

  // True once fully open — lets the dropdown menus escape the row's bounds.
  const [settledOpen, setSettledOpen] = useState(false);
  useEffect(() => {
    if (!isOpen) setSettledOpen(false);
  }, [isOpen]);

  const hasDraft = Object.values(draft).some((arr) => arr && arr.length > 0);

  return (
    <div
      className="grid transition-[grid-template-rows,opacity,margin] duration-[250ms] ease-out"
      style={{
        gridTemplateRows: isOpen ? "1fr" : "0fr",
        opacity: isOpen ? 1 : 0,
        marginBottom: isOpen ? 16 : 0,
      }}
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget && e.propertyName === "grid-template-rows" && isOpen) {
          setSettledOpen(true);
        }
      }}
      // Collapsed rows stay out of the tab order and away from screen readers.
      aria-hidden={!isOpen}
      inert={isOpen ? undefined : ""}
    >
      <div className={`min-h-0 ${settledOpen ? "overflow-visible" : "overflow-hidden"}`}>
        <div className="flex flex-wrap items-end gap-3 p-4 bg-white border border-[#E1E4EA] rounded-2xl">
          {columns.map((col) => (
            <div key={col.key} className="w-full sm:w-[220px]">
              <FilterDropdown
                label={col.label}
                placeholder={col.placeholder}
                options={valuesByColumn[col.key] || []}
                selected={draft[col.key] || []}
                onToggle={(val) => toggleValue(col.key, val)}
              />
            </div>
          ))}

          <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
            <button
              type="button"
              onClick={reset}
              disabled={!hasDraft && Object.keys(selected).length === 0}
              className="flex-1 sm:flex-none h-[42px] px-4 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={apply}
              className="flex-1 sm:flex-none h-[42px] px-4 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
            >
              Apply Filters
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
