/**
 * The KPI tile used across the Companies section.
 *
 * One component so every stat row - the company profile's Overview strip and
 * each of its tabs - is literally the same tile. The company tabs previously
 * carried their own near-copies of this markup (72px, white, icon in a
 * bordered box), which drifted from the Overview row's compact 56px grey
 * tile; this is that compact tile, shared.
 *
 * `tile` fields: label, value, icon (a component), and optionally iconClass
 * (icon colour, default brand blue), valueClassName (e.g. text-red-600 for
 * overdue), sub (a dim parenthetical after the value, e.g. "409 Qty"), plus a
 * trailing subtitle / subtitleIcon / subtitleClass / subtitleColor.
 */
export default function StatTile({ tile }) {
  const Icon = tile.icon;

  return (
    // flex-1/w-full so the tile fills its slot in a flex row (the dashboard KPI
    // strips) as well as in a grid cell (the company stat rows).
    <div className="min-h-[56px] w-full flex-1 flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl min-w-0">
      {Icon && (
        <>
          <div className={`flex lg:hidden flex-shrink-0 ${tile.iconClass || "text-blue-600"}`}>
            <Icon size={18} strokeWidth={1.5} />
          </div>
          <div className={`hidden lg:flex items-center justify-center flex-shrink-0 ${tile.iconClass || "text-blue-600"}`}>
            <Icon size={20} strokeWidth={1.5} />
          </div>
        </>
      )}
      <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
        {/* flex-1 so the label/value claim the free space first; the trend
            below shrinks and wraps rather than starving this column — which
            is what clamped "Avg. Sales Cycle" down to "Avg. Sales…". */}
        <div className="min-w-[84px] flex-1">
          <p
            className="w-full text-[10px] sm:text-[11px] text-gray-500 leading-tight break-words"
            title={typeof tile.label === "string" ? tile.label : undefined}
          >
            {tile.label}
          </p>
          <p
            className={`truncate w-full text-xs sm:text-sm font-semibold text-gray-900 ${tile.valueClassName || ""}`}
          >
            {tile.value}
            {tile.sub && (
              <span className="ml-1 font-normal text-[11px] text-[#99A0AE]">
                ({tile.sub})
              </span>
            )}
          </p>
        </div>
        {tile.subtitle && (
          <span
            className={`self-end min-w-0 max-w-[55%] text-[10px] xl:text-[11px] flex items-center justify-end gap-1 text-right leading-tight ${tile.subtitleClass || ""}`}
            style={tile.subtitleColor ? { color: tile.subtitleColor } : undefined}
          >
            {tile.subtitleIcon && (
              <tile.subtitleIcon size={12} className="flex-shrink-0" />
            )}
            <span>{tile.subtitle}</span>
          </span>
        )}
      </div>
    </div>
  );
}
