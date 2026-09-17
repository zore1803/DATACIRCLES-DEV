import DeleteIcon from "./DeleteIcon";
import PlusIcon from "./PlusIcon";
import React, { useState, useEffect, useRef } from "react";
import { X, ChevronDown } from "lucide-react";
import FilterIcon from "./FilterIcon";

import SearchIcon from "./SearchIcon";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

const OPERATOR_LABELS = {
  contains: "Contains",
  not_contains: "Does not contain",
  is: "Is exact",
  is_not: "Is not",
  greater_than: "Greater than (>)",
  less_than: "Less than (<)",
  in: "In (any of)",
  not_in: "Not in (none of)",
  is_empty: "Is empty",
  is_not_empty: "Is not empty",
};

// Which conditions make sense for which field type — a text field offers no
// Greater/Less than (comparing strings that way is meaningless to a user
// picking a filter), a number/date field offers no Contains (substring
// matching doesn't apply), etc. Order here is the order shown in the
// dropdown.
const OPERATORS_BY_TYPE = {
  text: ["contains", "not_contains", "is", "is_not", "in", "not_in", "is_empty", "is_not_empty"],
  number: ["is", "is_not", "greater_than", "less_than", "in", "not_in", "is_empty", "is_not_empty"],
  date: ["is", "is_not", "greater_than", "less_than", "is_empty", "is_not_empty"],
  select: ["is", "is_not", "in", "not_in", "is_empty", "is_not_empty"],
};

// A column declares its own `type` (used already by custom fields); an
// untyped column with an enumerable `options` list is treated as `select`
// (matches the existing dropdown-of-known-values behavior); anything else
// defaults to `text` — the safe default for the many columns across the app
// that don't declare a type at all today.
const getColumnType = (colDef) => {
  if (colDef?.type && OPERATORS_BY_TYPE[colDef.type]) return colDef.type;
  if (colDef?.options && colDef.options.length > 0) return "select";
  return "text";
};

const isMultiValueOperator = (op) => op === "in" || op === "not_in";
const isNoValueOperator = (op) => op === "is_empty" || op === "is_not_empty";

// --- Tag/chip input for "In" / "Not in" — type a value, Enter or comma
// commits it as a pill, Backspace on an empty draft removes the last one.
// Stores its value as a real array (the backend's advancedFilters handlers
// already accept an array OR a comma string for these operators, so this is
// a pure frontend upgrade with no backend contract change). ---
const TagInput = ({ value, onChange, placeholder }) => {
  const [draft, setDraft] = useState("");
  const tags = Array.isArray(value) ? value : [];

  const commitDraft = () => {
    const v = draft.trim();
    if (v && !tags.includes(v)) onChange([...tags, v]);
    setDraft("");
  };

  const removeTag = (idx) => onChange(tags.filter((_, i) => i !== idx));

  return (
    <div className="w-full border border-gray-300 rounded-lg text-sm px-2 py-1.5 focus-within:ring-2 focus-within:ring-blue-500 flex flex-wrap items-center gap-1.5 min-h-[38px]">
      {tags.map((tag, idx) => (
        <span
          key={`${tag}-${idx}`}
          className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(idx)}
            className="hover:text-blue-900"
            aria-label={`Remove ${tag}`}
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commitDraft();
          } else if (e.key === "Backspace" && !draft && tags.length > 0) {
            removeTag(tags.length - 1);
          }
        }}
        onBlur={commitDraft}
        placeholder={tags.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[80px] outline-none bg-transparent"
      />
    </div>
  );
};

// --- Custom Searchable Dropdown Sub-Component ---
const SearchableColumnSelect = ({ columns, value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredColumns = columns.filter((col) =>
    col.label.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const selectedColumn = columns.find((col) => col.key === value);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between border border-gray-300 rounded-lg text-sm px-3 py-2 bg-white hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
      >
        <span className="truncate pr-2">
          {selectedColumn ? selectedColumn.label : "Select column..."}
        </span>
        <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100 flex items-center gap-2 bg-gray-50">
            <SearchIcon className="w-4 h-4 text-[#525866]" />
            <input
              type="text"
              autoFocus
              placeholder="Search columns..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
          <ul className="max-h-48 overflow-y-auto">
            {filteredColumns.length > 0 ? (
              filteredColumns.map((col) => (
                <li
                  key={col.key}
                  onClick={() => {
                    onChange(col.key);
                    setIsOpen(false);
                    setSearchTerm("");
                  }}
                  className="px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 cursor-pointer flex items-center justify-between"
                >
                  <div className="flex items-center gap-2 truncate">
                    {col.icon && <col.icon className="w-4 h-4 text-gray-400" />}
                    <span className="truncate">{col.label}</span>
                  </div>
                  {col.isCustomField && (
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded ml-2 flex-shrink-0">
                      Custom
                    </span>
                  )}
                </li>
              ))
            ) : (
              <li className="px-3 py-4 text-sm text-center text-gray-500">
                No columns found
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

// --- Main Panel Component ---
export default function AdvancedFilterPanel({
  isOpen,
  onClose,
  columns,
  filters,
  setFilters,
  onApply,
  title = "Advanced Filters",
  subtitle = "Build dynamic queries for your CRM",
  emptyStateText = "Add a rule to narrow down your list.",
  data = [],
  getFieldValue = null,
}) {
  const [localFilters, setLocalFilters] = useState([]);
  useBodyScrollLock(isOpen);

  // Compute available dropdown options for each column
  const getColumnOptions = (colKey) => {
    if (!colKey) return null;
    const colDef = columns.find((c) => c.key === colKey);
    if (colDef?.options && colDef.options.length > 0) {
      return colDef.options;
    }
    if (!data || data.length === 0) return null;
    const set = new Set();
    data.forEach((item) => {
      let val = getFieldValue ? getFieldValue(item, colKey) : item[colKey];
      if (typeof val === "object" && val !== null) {
        val = val.name || val.title || val.label || "";
      }
      if (val !== undefined && val !== null && String(val).trim() !== "") {
        set.add(String(val).trim());
      }
    });
    const values = Array.from(set).sort();
    return values.length > 0 ? values : null;
  };

  const getColumnDef = (colKey) => columns.find((c) => c.key === colKey);

  useEffect(() => {
    if (isOpen) {
      const filtersWithIds = (filters || []).map((f) => ({
        ...f,
        id: Math.random().toString(36).substr(2, 9),
      }));
      setLocalFilters(filtersWithIds);
    }
  }, [isOpen, filters]);

  const addFilter = () => {
    setLocalFilters([
      ...localFilters,
      {
        id: Math.random().toString(36).substr(2, 9),
        column: "",
        operator: "contains",
        value: "",
      },
    ]);
  };

  const updateFilter = (id, field, value) => {
    setLocalFilters((prev) =>
      prev.map((filter) => {
        if (filter.id !== id) return filter;
        const updated = { ...filter, [field]: value };

        if (field === "column") {
          // Switching columns can change the field's type, which can make
          // the currently-selected operator invalid (e.g. was "Greater
          // than" on a number column, new column is text) — reset to the
          // new type's first/default operator rather than silently keeping
          // one that no longer applies. Value is always cleared too, so a
          // stale free-text value never persists onto a dropdown/tag field.
          const newType = getColumnType(getColumnDef(value));
          const validOps = OPERATORS_BY_TYPE[newType];
          if (!validOps.includes(updated.operator)) {
            updated.operator = validOps[0];
          }
          updated.value = isMultiValueOperator(updated.operator) ? [] : "";
        }

        if (field === "operator") {
          if (isNoValueOperator(value)) {
            updated.value = "";
          } else if (isMultiValueOperator(value) && !Array.isArray(updated.value)) {
            // Coming from a single-value operator — carry over whatever was
            // typed as the first tag instead of silently discarding it.
            updated.value = updated.value ? [String(updated.value)] : [];
          } else if (!isMultiValueOperator(value) && Array.isArray(updated.value)) {
            updated.value = updated.value[0] || "";
          }
        }

        return updated;
      }),
    );
  };

  const removeFilter = (id) => {
    setLocalFilters((prev) => prev.filter((f) => f.id !== id));
  };

  const isFilterValueFilled = (f) => {
    if (isNoValueOperator(f.operator)) return true;
    if (Array.isArray(f.value)) return f.value.length > 0;
    return String(f.value ?? "").trim() !== "";
  };

  const handleApply = () => {
    const validFilters = localFilters
      .filter((f) => f.column && f.operator && isFilterValueFilled(f))
      .map((f) => {
        const rest = { ...f };
        delete rest.id;
        return rest;
      });

    setFilters(validFilters);
    onApply(validFilters);
    onClose();
  };

  const handleClear = () => {
    setLocalFilters([]);
    setFilters([]);
    onApply([]);
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[9996]"
        onClick={onClose}
      />

      {/* Inset rounded card (dc-panel-card) rather than a full-height slab
          flush to the edges, matching the Template and Notes drawers.
          `overflow-hidden` so the header and footer fills clip to the radius. */}
      <div
        className="fixed dc-panel-card dc-panel-w bg-white shadow-2xl z-[9997] flex flex-col overflow-hidden animate-slideInRight"
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-200 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <FilterIcon size={16} />
            </div>
            <div>
              {/* USE DYNAMIC TITLE & SUBTITLE HERE */}
              <h2 className="text-lg font-bold text-gray-900 font-sf">
                {title}
              </h2>
              <p className="text-xs text-gray-500 font-inter">{subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-gray-50/30">
          {localFilters.length === 0 ? (
            <div className="text-center py-10 px-4 border-2 border-dashed border-gray-200 rounded-xl bg-white">
              <FilterIcon size={16} className="mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-gray-700">
                No filters applied
              </h3>
              {/* USE DYNAMIC EMPTY STATE TEXT HERE */}
              <p className="text-xs text-gray-500 mt-1 mb-4">
                {emptyStateText}
              </p>
              <button
                onClick={addFilter}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
              >
                <PlusIcon className="w-4 h-4" /> Add Rule
              </button>
            </div>
          ) : (
            localFilters.map((filter) => {
              const colDef = getColumnDef(filter.column);
              const colType = getColumnType(colDef);
              const availableOps = OPERATORS_BY_TYPE[colType];
              const isValueDisabled = isNoValueOperator(filter.operator);
              const isMultiValue = isMultiValueOperator(filter.operator);

              return (
                <div
                  key={filter.id}
                  className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm relative group"
                >
                  <button
                    onClick={() => removeFilter(filter.id)}
                    className="absolute -top-2 -right-2 bg-white border border-gray-200 p-1.5 rounded-full text-red-500 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-all shadow-sm z-10"
                    title="Remove filter"
                  >
                    <DeleteIcon className="w-4 h-4" />
                  </button>

                  <div className="space-y-3">
                    <div>
                      <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">
                        Where
                      </label>
                      <SearchableColumnSelect
                        columns={columns}
                        value={filter.column}
                        onChange={(val) =>
                          updateFilter(filter.id, "column", val)
                        }
                      />
                    </div>

                    <div className="flex gap-2">
                      <div className="w-[45%]">
                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">
                          Condition
                        </label>
                        <select
                          value={filter.operator}
                          onChange={(e) =>
                            updateFilter(filter.id, "operator", e.target.value)
                          }
                          className="w-full border border-gray-300 rounded-lg text-sm px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                          {availableOps.map((op) => (
                            <option key={op} value={op}>
                              {OPERATOR_LABELS[op]}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="w-[55%]">
                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">
                          Value
                        </label>
                        {isValueDisabled ? (
                          <div className="w-full bg-gray-50 border border-gray-200 rounded-lg flex items-center px-3 py-2 text-sm text-gray-400 italic">
                            N/A
                          </div>
                        ) : isMultiValue ? (
                          <TagInput
                            value={filter.value}
                            onChange={(val) => updateFilter(filter.id, "value", val)}
                            placeholder="Type a value, press Enter..."
                          />
                        ) : (() => {
                          const opts = getColumnOptions(filter.column);
                          // A dropdown of known values only makes sense for
                          // exact-match conditions — "Greater than 250" or
                          // "Contains ..." against a closed option list would
                          // just be picking one option anyway, so those still
                          // fall through to the type-appropriate input below.
                          if (opts && opts.length > 0 && (filter.operator === "is" || filter.operator === "is_not")) {
                            return (
                              <select
                                value={filter.value}
                                onChange={(e) =>
                                  updateFilter(filter.id, "value", e.target.value)
                                }
                                className="w-full border border-gray-300 rounded-lg text-sm px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                              >
                                <option value="">Select...</option>
                                {opts.map((opt) => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            );
                          }
                          if (colType === "date") {
                            return (
                              <input
                                type="date"
                                value={filter.value}
                                onChange={(e) =>
                                  updateFilter(filter.id, "value", e.target.value)
                                }
                                className="w-full border border-gray-300 rounded-lg text-sm px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                              />
                            );
                          }
                          if (colType === "number") {
                            return (
                              <input
                                type="number"
                                value={filter.value}
                                onChange={(e) =>
                                  updateFilter(filter.id, "value", e.target.value)
                                }
                                placeholder="Enter a number..."
                                className="w-full border border-gray-300 rounded-lg text-sm px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                              />
                            );
                          }
                          return (
                            <input
                              type="text"
                              value={filter.value}
                              onChange={(e) =>
                                updateFilter(filter.id, "value", e.target.value)
                              }
                              placeholder="Enter value..."
                              className="w-full border border-gray-300 rounded-lg text-sm px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {localFilters.length > 0 && (
            <button
              onClick={addFilter}
              className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-blue-200 bg-blue-50/50 rounded-xl text-sm font-medium text-blue-600 hover:border-blue-400 hover:bg-blue-50 transition-colors"
            >
              <PlusIcon className="w-4 h-4" /> Add Another Rule
            </button>
          )}
        </div>

        <div className="p-5 border-t border-gray-200 flex gap-3 bg-white">
          <button
            type="button"
            onClick={handleClear}
            className="flex-1 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors"
          >
            Clear All
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="flex-[2] py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </>
  );
}
