import DeleteIcon from "./DeleteIcon";
import PlusIcon from "./PlusIcon";
import React, { useState, useEffect, useRef } from "react";
import { X, ChevronDown } from "lucide-react";
import FilterIcon from "./FilterIcon";

import SearchIcon from "./SearchIcon";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";
import {
  DUE_DATE_PRESETS,
  emptyDueDateFilter,
  isDueDateFilterActive,
} from "../../utils/dueDateFilter";

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
  // Due Date presets + Custom Range: one implicit condition ("is within"), so
  // the Condition dropdown is hidden and the value is a {preset, from, to}
  // object. Date maths lives in utils/dueDateFilter.js.
  dateRange: ["is"],
};

// A column can narrow its own condition list (e.g. Assignee: only Is / Is not)
// via `operators`, instead of inheriting every operator for its type.
const getAvailableOps = (colDef, colType) => {
  const typeOps = OPERATORS_BY_TYPE[colType];
  if (!Array.isArray(colDef?.operators)) return typeOps;
  const allowed = colDef.operators.filter((op) => typeOps.includes(op));
  return allowed.length > 0 ? allowed : typeOps;
};

// Options may be plain strings or {value, label} (when the stored value is an
// id but the user should see a name).
const optValue = (opt) => (opt !== null && typeof opt === "object" ? opt.value : opt);
const optLabel = (opt) => (opt !== null && typeof opt === "object" ? opt.label : opt);

// A column declares its own `type` (used already by custom fields); an
// untyped column with an enumerable `options` list is treated as `select`
// (matches the existing dropdown-of-known-values behavior); anything else
// defaults to `text` — the safe default for the many columns across the app
// that don't declare a type at all today.
const getColumnType = (colDef) => {
  if (colDef?.type && OPERATORS_BY_TYPE[colDef.type]) return colDef.type;  if (colDef?.options && colDef.options.length > 0) return "select";
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
    <div className="w-full border border-[#1F2937]/10 rounded-[19px] text-[13px] px-3 py-1.5 focus-within:ring-1 focus-within:ring-blue-500 flex flex-wrap items-center gap-1.5 min-h-[38px]">
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

// --- Text input that suggests values already present in the column. Used for the
// "Contains" / "Does not contain" conditions: type to narrow the list, click one to
// fill it in, or keep typing any text of your own. ---
const SuggestInput = ({ value, onChange, suggestions, placeholder }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const typed = String(value ?? "").trim().toLowerCase();
  const matches = suggestions
    .map((o) => String(optLabel(o)))
    .filter((label) => label && label.toLowerCase() !== typed && label.toLowerCase().includes(typed))
    .slice(0, 8);

  return (
    <div className="relative" ref={ref}>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full border border-[#1F2937]/10 rounded-full text-[13px] text-[#1F2937] px-3 h-[38px] focus:ring-1 focus:ring-blue-500 outline-none transition-all"
      />
      {open && matches.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-52 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
          {matches.map((m) => (
            <li key={m}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(m);
                  setOpen(false);
                }}
                className="block w-full truncate px-3 py-2 text-left text-[13px] text-gray-700 hover:bg-blue-50"
              >
                {m}
              </button>
            </li>
          ))}
        </ul>
      )}
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
        className="w-full flex items-center justify-between border border-[#1F2937]/10 rounded-full text-[13px] text-[#1F2937] px-3 h-[38px] bg-white hover:bg-gray-50 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
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
  const [sectionQuery, setSectionQuery] = useState("");
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

  // A rule with no value yet. Every column gets one so it has a section to fill in;
  // blank rules are dropped when the filters are applied (see handleApply).
  const blankRule = (col) => {
    const type = getColumnType(col);
    return {
      id: Math.random().toString(36).substr(2, 9),
      column: col.key,
      operator: getAvailableOps(col, type)[0],
      value: type === "dateRange" ? emptyDueDateFilter() : "",
    };
  };

  useEffect(() => {
    if (isOpen) {
      const filtersWithIds = (filters || []).map((f) => ({
        ...f,
        id: Math.random().toString(36).substr(2, 9),
      }));
      const missing = columns.filter((c) => !filtersWithIds.some((f) => f.column === c.key)).map(blankRule);
      setLocalFilters([...filtersWithIds, ...missing]);
      setSectionQuery("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          const newDef = getColumnDef(value);
          const newType = getColumnType(newDef);
          const validOps = getAvailableOps(newDef, newType);
          if (!validOps.includes(updated.operator)) {
            updated.operator = validOps[0];
          }
          updated.value =
            newType === "dateRange"
              ? emptyDueDateFilter()
              : isMultiValueOperator(updated.operator)
                ? []
                : "";
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

  // Removing a column's only rule resets it to blank (the section stays); removing
  // one of several just deletes that row.
  const removeFilter = (id) => {
    setLocalFilters((prev) => {
      const target = prev.find((f) => f.id === id);
      if (!target) return prev;
      const siblings = prev.filter((f) => f.column === target.column);
      if (siblings.length > 1) return prev.filter((f) => f.id !== id);
      return prev.map((f) => (f.id === id ? blankRule(getColumnDef(f.column)) : f));
    });
  };

  const clearColumn = (colKey) => {
    setLocalFilters((prev) => [
      ...prev.filter((f) => f.column !== colKey),
      blankRule(getColumnDef(colKey)),
    ]);
  };

  // A second condition on the same column, e.g. an amount range: > 500 and < 900.
  const addCondition = (colKey) => {
    setLocalFilters((prev) => {
      const lastIdx = prev.map((f) => f.column).lastIndexOf(colKey);
      const next = [...prev];
      next.splice(lastIdx + 1, 0, blankRule(getColumnDef(colKey)));
      return next;
    });
  };

  const isFilterValueFilled = (f) => {
    if (getColumnType(getColumnDef(f.column)) === "dateRange") {
      return isDueDateFilterActive(f.value);
    }
    if (isNoValueOperator(f.operator)) return true;
    if (Array.isArray(f.value)) return f.value.length > 0;
    return String(f.value ?? "").trim() !== "";
  };

  const handleApply = () => {
    // A custom range whose From is after To is flagged inline on the rule;
    // don't apply it silently.
    const hasReversedRange = localFilters.some((f) => {
      const v = f.value;
      return (
        getColumnType(getColumnDef(f.column)) === "dateRange" &&
        v?.preset === "custom" &&
        v.from &&
        v.to &&
        v.from > v.to
      );
    });
    if (hasReversedRange) return;

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
    setLocalFilters(columns.map(blankRule));
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
        {/* Header — same spec as the other side panels (BankModal, ColumnSettingsPanel) */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#D9D9D9] flex-shrink-0 bg-white gap-1">
          <div className="flex flex-col min-w-0">
            {/* USE DYNAMIC TITLE & SUBTITLE HERE */}
            <h2 className="text-[15px] font-normal leading-6 text-[#78788D] uppercase tracking-wide truncate">
              {title}
            </h2>
            <p className="text-xs text-[#78788D] font-inter truncate">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="w-5 h-5 flex items-center justify-center text-[#1C1B1F] hover:opacity-70 transition-opacity flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-[18px] h-[18px]" strokeWidth={2} />
          </button>
        </div>

        <div className="flex-shrink-0 border-b border-[#F1F2F4] px-6 py-3 bg-white">
          <div className="flex items-center gap-2 rounded-full border border-[#1F2937]/10 px-3 h-[38px] focus-within:ring-1 focus-within:ring-blue-500">
            <SearchIcon className="w-4 h-4 text-[#525866] flex-shrink-0" />
            <input
              type="text"
              value={sectionQuery}
              onChange={(e) => setSectionQuery(e.target.value)}
              placeholder="Search fields..."
              className="w-full bg-transparent text-[13px] outline-none"
            />
          </div>
          <p className="mt-2 text-[11.5px] text-[#78788D]">
            {(() => {
              const n = localFilters.filter(isFilterValueFilled).length;
              return n ? `${n} condition${n > 1 ? "s" : ""} set` : emptyStateText;
            })()}
          </p>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-3 bg-[#FAFAFB]">
          {columns
            .filter((c) => c.label.toLowerCase().includes(sectionQuery.trim().toLowerCase()))
            .map((col) => {
              const rules = localFilters.filter((f) => f.column === col.key);
              const colType = getColumnType(col);
              const availableOps = getAvailableOps(col, colType);
              const isDateRange = colType === "dateRange";
              const active = rules.some(isFilterValueFilled);
              const TYPE_LABEL = { text: "Text", number: "Number", date: "Date", select: "List", dateRange: "Date" };

              return (
                <section
                  key={col.key}
                  className={`rounded-xl border bg-white p-4 transition-colors ${
                    active ? "border-[#0085FF]/50 shadow-[0_0_0_3px_rgba(0,133,255,0.06)]" : "border-[#E1E4EA]"
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {col.icon && <col.icon className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                      <h3 className="truncate text-[13.5px] font-semibold text-[#161618]">{col.label}</h3>
                      <span className="flex-shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                        {col.isCustomField ? "Custom" : TYPE_LABEL[colType] || "Text"}
                      </span>
                    </div>
                    {active && (
                      <button
                        type="button"
                        onClick={() => clearColumn(col.key)}
                        className="flex-shrink-0 text-[12px] font-medium text-[#0085FF] hover:underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    {rules.map((filter, idx) => {
                      const rangeValue = isDateRange ? filter.value || emptyDueDateFilter() : null;
                      const rangeInvalid =
                        isDateRange &&
                        rangeValue.preset === "custom" &&
                        rangeValue.from &&
                        rangeValue.to &&
                        rangeValue.from > rangeValue.to;
                      const isValueDisabled = isNoValueOperator(filter.operator);
                      const isMultiValue = isMultiValueOperator(filter.operator);

                      return (
                        <div key={filter.id} className="flex items-start gap-2">
                          {!isDateRange && (
                            <div className="w-[42%] flex-shrink-0">
                              {idx === 0 && (
                                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[#78788D]">
                                  Condition
                                </label>
                              )}
                              <select
                                value={filter.operator}
                                onChange={(e) => updateFilter(filter.id, "operator", e.target.value)}
                                className="w-full border border-[#1F2937]/10 rounded-full text-[13px] text-[#1F2937] px-3 h-[38px] bg-white focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                              >
                                {availableOps.map((op) => (
                                  <option key={op} value={op}>
                                    {OPERATOR_LABELS[op]}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            {idx === 0 && (
                              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[#78788D]">
                                Value
                              </label>
                            )}
                        {isDateRange ? (
                          <div className="space-y-2">
                            <select
                              value={rangeValue.preset || ""}
                              onChange={(e) =>
                                updateFilter(filter.id, "value", {
                                  ...rangeValue,
                                  preset: e.target.value,
                                })
                              }
                              className="w-full border border-[#1F2937]/10 rounded-full text-[13px] text-[#1F2937] px-3 h-[38px] bg-white focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                            >
                              <option value="">Select...</option>
                              {DUE_DATE_PRESETS.map((p) => (
                                <option key={p.value} value={p.value}>{p.label}</option>
                              ))}
                            </select>
                            {rangeValue.preset === "custom" && (
                              <div className="flex gap-2">
                                <label className="flex-1 text-[13px] font-medium text-[#161618] tracking-[-0.05em]">
                                  From
                                  <input
                                    type="date"
                                    value={rangeValue.from || ""}
                                    onChange={(e) =>
                                      updateFilter(filter.id, "value", { ...rangeValue, from: e.target.value })
                                    }
                                    className="mt-1 w-full border border-gray-300 rounded-lg text-sm font-normal normal-case tracking-normal text-gray-800 px-3 py-2 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                                  />
                                </label>
                                <label className="flex-1 text-[13px] font-medium text-[#161618] tracking-[-0.05em]">
                                  To
                                  <input
                                    type="date"
                                    value={rangeValue.to || ""}
                                    min={rangeValue.from || undefined}
                                    onChange={(e) =>
                                      updateFilter(filter.id, "value", { ...rangeValue, to: e.target.value })
                                    }
                                    className="mt-1 w-full border border-gray-300 rounded-lg text-sm font-normal normal-case tracking-normal text-gray-800 px-3 py-2 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                                  />
                                </label>
                              </div>
                            )}
                            {rangeInvalid && (
                              <p className="text-xs text-red-500">"From" must be on or before "To".</p>
                            )}
                          </div>
                        ) : isValueDisabled ? (
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
                          if (colType !== "date" && opts && opts.length > 0 && (filter.operator === "is" || filter.operator === "is_not")) {
                            return (
                              <select
                                value={filter.value}
                                onChange={(e) =>
                                  updateFilter(filter.id, "value", e.target.value)
                                }
                                className="w-full border border-[#1F2937]/10 rounded-full text-[13px] text-[#1F2937] px-3 h-[38px] bg-white focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                              >
                                <option value="">Select...</option>
                                {opts.map((opt) => (
                                  <option key={optValue(opt)} value={optValue(opt)}>{optLabel(opt)}</option>
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
                                className="w-full border border-[#1F2937]/10 rounded-full text-[13px] text-[#1F2937] px-3 h-[38px] focus:ring-1 focus:ring-blue-500 outline-none transition-all"
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
                                className="w-full border border-[#1F2937]/10 rounded-full text-[13px] text-[#1F2937] px-3 h-[38px] focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                              />
                            );
                          }
                          if ((filter.operator === "contains" || filter.operator === "not_contains") && opts && opts.length > 0) {
                            return (
                              <SuggestInput
                                value={filter.value}
                                onChange={(val) => updateFilter(filter.id, "value", val)}
                                suggestions={opts}
                                placeholder="Type or pick a value..."
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
                              className="w-full border border-[#1F2937]/10 rounded-full text-[13px] text-[#1F2937] px-3 h-[38px] focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                            />
                          );
                        })()}
                          </div>

                          {rules.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeFilter(filter.id)}
                              title="Remove condition"
                              className={`${idx === 0 ? "mt-[19px]" : ""} flex h-[38px] w-8 flex-shrink-0 items-center justify-center rounded-full text-red-500 hover:bg-red-50`}
                            >
                              <DeleteIcon className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {!isDateRange && active && (
                    <button
                      type="button"
                      onClick={() => addCondition(col.key)}
                      className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-[#0085FF] hover:underline"
                    >
                      <PlusIcon className="w-3 h-3" /> Add another condition
                    </button>
                  )}
                </section>
              );
            })}

          {columns.filter((c) => c.label.toLowerCase().includes(sectionQuery.trim().toLowerCase())).length === 0 && (
            <p className="py-10 text-center text-sm text-gray-400">No fields match "{sectionQuery}"</p>
          )}
        </div>

        {/* Footer — compact, right-aligned pill buttons like the other panels */}
        <div className="flex-shrink-0 py-2.5 px-4 border-t border-gray-100 bg-white flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleClear}
            className="px-6 py-2 border border-gray-200 text-gray-700 rounded-[25px] text-sm font-bold hover:bg-gray-50 transition-colors"
          >
            Clear All
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-6 py-2 bg-[#158FFF] text-white rounded-[25px] text-sm font-bold hover:opacity-90 transition-colors"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </>
  );
}
