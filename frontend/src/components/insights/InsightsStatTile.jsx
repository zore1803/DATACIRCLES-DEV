/**
 * KPI tile used ONLY by the Insights page (via Insights' StatCard).
 *
 * It is the shared StatTile's look - same grey 56px pill, icon, label over
 * value - but its trend is a stacked block instead of one nowrap string: the
 * figure and arrow on the first line ("+100%"), the period muted beneath
 * ("vs last month"). That block is a fixed, compact width, so a long period
 * label can neither wrap mid-phrase nor squeeze the heading, and the label
 * wraps instead of truncating. The shared StatTile is deliberately untouched
 * so every other page's tiles keep rendering exactly as before.
 *
 * `tile` fields: label, value, icon (component), iconClass, and optionally
 * trendValue, trendLabel, trendIcon (component), trendColor.
 */
export default function InsightsStatTile({ tile }) {
  const Icon = tile.icon;
  const TrendIcon = tile.trendIcon;

  return (
    <>
    {/* Phone layout: two tiles per row leave ~150px each, too narrow for icon + label + value +
        trend side by side. Stack them: icon and label on top, value, then the trend. */}
    <div
      className="sm:hidden w-full min-w-0 flex flex-col justify-center gap-1 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl"
      style={{ minHeight: 84 }}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        {Icon && (
          <span className={`flex flex-shrink-0 ${tile.iconClass || "text-blue-600"}`}>
            <Icon size={16} strokeWidth={1.5} />
          </span>
        )}
        <p className="m-0 text-[11px] leading-tight text-gray-500 line-clamp-2 break-words">{tile.label}</p>
      </div>
      <p className="m-0 text-[15px] leading-tight font-semibold text-gray-900 break-words">{tile.value}</p>
      {tile.trendValue && (
        <span
          className="flex flex-wrap items-center gap-x-1 text-[11px] leading-tight font-semibold"
          style={tile.trendColor ? { color: tile.trendColor } : undefined}
        >
          {TrendIcon && <TrendIcon size={12} className="flex-shrink-0" />}
          {tile.trendValue}
          {tile.trendLabel && <span className="font-normal text-gray-500">{tile.trendLabel}</span>}
        </span>
      )}
    </div>

    <div className="hidden sm:flex min-h-[56px] w-full flex-1 items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl min-w-0">
      {Icon && (
        <div className={`flex items-center justify-center flex-shrink-0 ${tile.iconClass || "text-blue-600"}`}>
          <Icon size={20} strokeWidth={1.5} />
        </div>
      )}
      <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p
            className="w-full text-[10px] sm:text-[11px] leading-tight text-gray-500 break-words"
            title={typeof tile.label === "string" ? tile.label : undefined}
          >
            {tile.label}
          </p>
          <p className="truncate w-full text-xs sm:text-sm font-semibold text-gray-900">
            {tile.value}
          </p>
        </div>
        {tile.trendValue && (
          <div
            className="flex flex-col items-end flex-shrink-0 leading-tight text-right"
            style={tile.trendColor ? { color: tile.trendColor } : undefined}
          >
            <span className="flex items-center gap-1 text-[11px] font-semibold whitespace-nowrap">
              {TrendIcon && <TrendIcon size={12} className="flex-shrink-0" />}
              {tile.trendValue}
            </span>
            {tile.trendLabel && (
              <span className="text-[10px] font-normal whitespace-nowrap text-gray-500">
                {tile.trendLabel}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
    </>
  );
}
