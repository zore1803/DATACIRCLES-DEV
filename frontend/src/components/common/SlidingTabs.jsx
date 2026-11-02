import React from "react";

// Pill switcher with a white highlight that slides under the active tab — the
// same control as the tab bar on Company Fields. Every tab has the same width so
// the highlight can be positioned by index.
//
// `fill` stretches the bar to its container and shares the width equally between
// the tabs (down to `minItemWidth` each, below which the bar scrolls sideways);
// without it every tab is exactly `itemWidth` px.
export default function SlidingTabs({
  tabs,
  value,
  onChange,
  itemWidth = 144,
  fill = false,
  minItemWidth = 96,
  className = "",
}) {
  const index = Math.max(0, tabs.findIndex((t) => t.key === value));
  const count = tabs.length || 1;

  const highlightStyle = fill
    ? {
        width: `calc((100% - 8px) / ${count})`,
        left: `calc(4px + ${index} * (100% - 8px) / ${count})`,
      }
    : { width: itemWidth, left: 4 + index * itemWidth };

  const track = (
    <div
      className={`relative flex items-center bg-gray-100 rounded-full p-1 ${fill ? "w-full" : "inline-flex max-w-full"}`}
      style={fill ? { minWidth: count * minItemWidth + 8 } : undefined}
    >
      <span
        className="absolute top-1 bottom-1 rounded-full bg-white shadow-sm transition-all duration-300 ease-out pointer-events-none"
        style={highlightStyle}
      />
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          style={fill ? undefined : { width: itemWidth }}
          className={`relative z-10 py-2 text-sm font-semibold rounded-full whitespace-nowrap transition-colors ${
            fill ? "flex-1 min-w-0 px-1 text-[13px]" : "flex-shrink-0"
          } ${value === tab.key ? "text-[#0085FF]" : "text-gray-500 hover:text-gray-700"}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  return fill ? (
    <div className={`max-w-full overflow-x-auto no-scrollbar rounded-full ${className}`}>{track}</div>
  ) : (
    <div className={`max-w-full overflow-x-auto no-scrollbar rounded-full inline-block ${className}`}>{track}</div>
  );
}
