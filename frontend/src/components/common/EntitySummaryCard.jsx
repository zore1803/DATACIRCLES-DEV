import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ArrowUpRight } from "lucide-react";

// One label/value pair, styled to match StatTile.jsx's typography (10-11px
// uppercase-weight grey label, 13-14px dark value) so this card reads as
// part of the same design language as the KPI row it sits above.
// `to` (optional) turns the value into a link — e.g. Contact's Company field
// jumping to that company's own profile page.
const Field = ({ label, value, to, render }) => {
  const navigate = useNavigate();

  // `render` lets a caller drop a custom interactive node in place of the plain
  // value text — e.g. Contact's Owner field being a reassign dropdown.
  if (render) {
    return (
      <div className="min-w-0">
        <p className="text-[10px] sm:text-[11px] text-gray-500 uppercase tracking-wide truncate">
          {label}
        </p>
        {render}
      </div>
    );
  }

  if (to && value) {
    return (
      <div className="min-w-0">
        <p className="text-[10px] sm:text-[11px] text-gray-500 uppercase tracking-wide truncate">
          {label}
        </p>
        <button
          type="button"
          onClick={() => navigate(to)}
          title={`Go to ${value}`}
          className="group flex items-center gap-1 text-[13px] sm:text-sm font-medium text-gray-900 hover:text-[#0085FF] truncate max-w-full"
        >
          <span className="truncate">{value}</span>
          <ArrowUpRight size={13} className="shrink-0 text-gray-400 group-hover:text-[#0085FF]" />
        </button>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <p className="text-[10px] sm:text-[11px] text-gray-500 uppercase tracking-wide truncate">
        {label}
      </p>
      <p className={`text-[13px] sm:text-sm font-medium truncate ${value ? "text-gray-900" : "text-gray-400"}`}>
        {value || "Not added"}
      </p>
    </div>
  );
};

/**
 * Collapsible field summary shown above a detail page's KPI row — first
 * built for the company profile, then reused as-is for contacts. Presentation
 * only: each caller (CompanySummaryCard, ContactSummaryCard, ...) decides
 * which real fields on its own entity go in `collapsedFields` vs
 * `expandedFields` and formats their values; this component just lays them
 * out and owns the expand/collapse toggle.
 *
 * `fullWidthFields` marks entries (by label) that should span every column
 * of the grid instead of sharing one cell — e.g. a multi-line address.
 */
export default function EntitySummaryCard({ collapsedFields, expandedFields = [], fullWidthLabels = [] }) {
  const [expanded, setExpanded] = useState(false);

  const renderField = (field) => {
    const spanFull = fullWidthLabels.includes(field.label);
    const node = <Field key={field.label} label={field.label} value={field.value} to={field.to} render={field.render} />;
    return spanFull ? (
      <div key={field.label} className="col-span-2 sm:col-span-3 lg:col-span-5">
        {node}
      </div>
    ) : (
      node
    );
  };

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 mb-4 relative">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-3 pr-8">
        {collapsedFields.map(renderField)}
        {expanded && expandedFields.map(renderField)}
      </div>

      {expandedFields.length > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? "Show less" : "Show more details"}
          className="absolute top-1/2 right-3 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full bg-[#0085FF] text-white hover:bg-blue-600 transition-colors"
        >
          <ChevronDown size={15} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      )}
    </div>
  );
}
