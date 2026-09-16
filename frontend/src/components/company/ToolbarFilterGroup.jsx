import React, { useEffect, useState } from "react";
import FilterDropdown from "./FilterDropdown";
import useColumnFilterDraft from "../../hooks/useColumnFilterDraft";

/**
 * Filter dropdowns that slide into the toolbar line itself, between the search
 * bar and the Filter button (the search bar shrinks to make room — see the
 * caller). Uses the same option lists and applied-filter shape as
 * CompanyFilterPanel, so filtering (applyColumnFilters on
 * `selected`) is unchanged.
 *
 * Selections apply immediately: a single toolbar line has no room for a
 * separate Apply step. A Reset link shows once anything is selected.
 *
 * Animation: max-width + opacity over ~300ms. `overflow: hidden` is needed
 * while it slides (or the group would show at full width instantly), but it
 * would clip the dropdown menus, so it's lifted once the open transition ends
 * and restored the moment a close begins.
 *
 * Below `lg` the group wraps onto its own full-width line under the search
 * bar instead of squeezing the toolbar.
 */
export default function ToolbarFilterGroup({
  isOpen,
  columns,
  data = [],
  getFieldValue,
  selected = {},
  onApply,
}) {
  const { valuesByColumn } = useColumnFilterDraft({
    isOpen,
    columns,
    data,
    getFieldValue,
    selected,
    onApply,
  });

  const [settledOpen, setSettledOpen] = useState(false);
  useEffect(() => {
    if (!isOpen) {
      setSettledOpen(false);
      return;
    }
    // Fallback for when no transitionend arrives (reduced motion, or no size change to
    // animate), so the dropdown menus are never left clipped.
    const t = setTimeout(() => setSettledOpen(true), 350);
    return () => clearTimeout(t);
  }, [isOpen]);

  const toggle = (colKey, value) => {
    const current = selected[colKey] || [];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    const updated = { ...selected, [colKey]: next };
    // Same cleaning the panel's Apply does: empty columns are dropped.
    onApply(Object.fromEntries(Object.entries(updated).filter(([, arr]) => arr && arr.length > 0)));
  };

  const hasSelection = Object.values(selected).some((arr) => arr && arr.length > 0);

  return (
    <div
      className={`order-last lg:order-none basis-full lg:basis-auto flex-shrink-0 transition-[max-width,max-height,opacity,margin] duration-300 ease-out ${
        settledOpen ? "overflow-visible" : "overflow-hidden"
      } ${isOpen ? "max-h-[400px] lg:max-h-none lg:max-w-[760px]" : "max-h-0 -mt-4 lg:mt-0 lg:max-h-none lg:max-w-0 lg:-ml-4"}`}
      style={{ opacity: isOpen ? 1 : 0 }}
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget && isOpen) setSettledOpen(true);
      }}
      aria-hidden={!isOpen}
      inert={isOpen ? undefined : ""}
    >
      <div className="flex flex-wrap lg:flex-nowrap items-center gap-2 lg:gap-3 lg:w-max">
        {columns.map((col) => (
          <div key={col.key} className="w-full sm:w-[calc(33.333%-0.5rem)] lg:w-[170px]">
            <FilterDropdown
              compact
              label={col.label}
              placeholder={col.placeholder}
              options={valuesByColumn[col.key] || []}
              selected={selected[col.key] || []}
              onToggle={(val) => toggle(col.key, val)}
            />
          </div>
        ))}
        {hasSelection && (
          <button
            type="button"
            onClick={() => onApply({})}
            className="h-[44px] px-2 text-sm font-medium text-[#0085FF] hover:text-blue-700 whitespace-nowrap"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
