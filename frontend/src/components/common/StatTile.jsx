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
    <div className="h-[56px] w-full flex-1 flex items-center gap-2 px-3 bg-gray-50 border border-gray-200 rounded-xl min-w-0">
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
      <div className="min-w-0 flex-1 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate w-full text-[10px] sm:text-[11px] text-gray-500">
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
            className={`text-[11px] flex items-center gap-1 flex-shrink-0 whitespace-nowrap ${tile.subtitleClass || ""}`}
            style={tile.subtitleColor ? { color: tile.subtitleColor } : undefined}
          >
            {tile.subtitleIcon && <tile.subtitleIcon size={12} />}
            {tile.subtitle}
          </span>
        )}
      </div>
    </div>
  );
}
