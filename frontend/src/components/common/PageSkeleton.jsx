import Skeleton from "./Skeleton";
import DealCardSkeleton from "./DealCardSkeleton";

// Structured loading placeholders, shown instead of a spinner while a page's
// data is still loading. `variant` picks a layout that roughly matches what
// the real page will look like, so the transition from loading -> loaded
// doesn't cause a jarring layout shift. Built entirely from the shared
// <Skeleton /> primitive — no raw animate-pulse divs here.
const Card = ({ h = 90 }) => (
  <div className="rounded-xl border border-gray-200 bg-white p-4" style={{ height: h }}>
    <Skeleton width="40%" height={12} className="mb-3" />
    <Skeleton width="60%" height={20} />
  </div>
);

const TableSkeleton = ({ rows = 10, cols = 6 }) => (
  <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
    <div className="flex items-center gap-6 border-b border-gray-200 bg-gray-50 px-4 py-3">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} width={80 + (i % 3) * 20} height={10} />
      ))}
    </div>
    {Array.from({ length: rows }).map((_, r) => (
      <div key={r} className="flex items-center gap-6 border-b border-gray-100 px-4 py-3 last:border-b-0">
        {Array.from({ length: cols }).map((_, c) => (
          <Skeleton key={c} width={60 + ((r + c) % 4) * 25} height={12} />
        ))}
      </div>
    ))}
  </div>
);

// Matches the real Deals page top-to-bottom: title strip (with the search /
// filter / view-toggle controls inline), KPI strip, then either the kanban
// board (column header + total bar + cards) or the deals table, whichever
// view is currently active — so the skeleton never flashes the wrong shape.
const KanbanSkeleton = ({ columns = 3, cards = 3, boardVariant = "kanban", tableRows = 10, tableCols = 7 }) => (
  <div className="space-y-0 -m-6">
    {/* Title strip: "Deals" + subtitle, then one right-aligned group —
        search icon, filter, list/kanban switcher, more-menu, New Deal —
        all sharing the same gap, matching the real collapsed-search strip.
        Mobile: filter/switcher fold away (same as the real mobile header),
        leaving just search + more-menu + add. */}
    <div className="flex items-center gap-2 lg:gap-3 bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8" style={{ height: 64 }}>
      <div className="flex flex-col gap-1.5 flex-shrink-0">
        <Skeleton width={50} height={16} />
        <Skeleton width={110} height={12} className="hidden sm:block" />
      </div>
      <div className="flex-1 min-w-0" />
      <div className="flex items-center gap-2 lg:gap-3 flex-shrink-0">
        <Skeleton shape="circle" width={40} height={40} />
        <Skeleton shape="circle" width={40} height={40} className="hidden lg:block" />
        <Skeleton width={76} height={40} shape="rect" className="rounded-full hidden lg:block" />
        <Skeleton shape="circle" width={40} height={40} />
        <Skeleton width={110} height={40} shape="rect" className="rounded-full hidden lg:block" />
        <Skeleton shape="circle" width={40} height={40} className="lg:hidden" />
      </div>
    </div>

    {/* KPI strip: 4 stat cards — 2x2 grid on mobile, single row on desktop */}
    <div className="grid grid-cols-2 gap-3 lg:flex lg:items-center lg:gap-6 bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 lg:py-0" style={{ minHeight: 120 }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="relative lg:flex-1 rounded-xl border border-gray-200 bg-white" style={{ padding: 16, height: 72 }}>
          <div className="flex items-end gap-3.5" style={{ height: 40 }}>
            <Skeleton shape="circle" width={40} height={40} className="flex-shrink-0" />
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <Skeleton width="60%" height={10} />
              <Skeleton width="45%" height={16} />
            </div>
          </div>
          <div className="absolute flex items-center gap-1" style={{ right: 16, bottom: 16 }}>
            <Skeleton width={40} height={11} />
          </div>
        </div>
      ))}
    </div>

    {boardVariant === "table" ? (
      /* Deals table: checkbox + 7 columns, matching DealsTable's header/row shape.
         No top/left padding — the real table view sits edge-to-edge.
         Mobile: simplified card-style rows instead of the 7-thin-column layout. */
      <div>
        <div className="relative bg-white border border-[#E1E4EA]">
          <div className="flex items-stretch bg-[#F5F7FA] border-b border-[#E1E4EA]" style={{ height: 56 }}>
            <div className="flex items-center justify-center flex-shrink-0 border-r border-[#E1E4EA]" style={{ width: 60 }}>
              <Skeleton shape="rect" width={16} height={16} className="rounded" />
            </div>
            {Array.from({ length: tableCols }).map((_, i) => (
              <div key={i} className="flex items-center flex-1 px-3 border-r border-[#E1E4EA] last:border-r-0">
                <Skeleton width={80 + (i % 3) * 20} height={10} />
              </div>
            ))}
          </div>
          {Array.from({ length: tableRows }).map((_, r) => (
            <div key={r} className="flex items-stretch border-b border-[#E1E4EA] last:border-b-0" style={{ height: 54 }}>
              <div className="flex items-center justify-center flex-shrink-0 border-r border-[#E1E4EA]" style={{ width: 60 }}>
                <Skeleton shape="rect" width={16} height={16} className="rounded" />
              </div>
              {Array.from({ length: tableCols }).map((_, c) => (
                <div key={c} className="flex items-center flex-1 px-3 border-r border-[#E1E4EA] last:border-r-0">
                  <Skeleton width={`${50 + ((r + c) % 4) * 10}%`} height={12} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    ) : (
      /* Kanban board */
      <div className="flex gap-4 px-6 pt-6 pb-6 overflow-x-auto">
        {Array.from({ length: columns }).map((_, c) => (
          <div key={c} className="w-[340px] flex-shrink-0 rounded-xl border border-gray-200 bg-white overflow-hidden">
            {/* Column header: title + count badge + plus icon */}
            <div className="flex items-center justify-between px-4" style={{ height: 46, background: "#F5F7FA" }}>
              <div className="flex items-center gap-1.5">
                <Skeleton width={60} height={12} />
                <Skeleton shape="circle" width={22} height={22} />
              </div>
              <Skeleton shape="circle" width={16} height={16} />
            </div>
            {/* Total bar (plain gray, no gradient) */}
            <div className="px-5 pt-5">
              <Skeleton width="100%" height={67} shape="rect" className="rounded-[10px]" />
            </div>
            {/* Deal cards */}
            <div className="flex flex-col items-start gap-3.5 px-5 py-5">
              {Array.from({ length: cards }).map((_, i) => (
                <DealCardSkeleton key={i} />
              ))}
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

const CardsSkeleton = ({ count = 6 }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    {Array.from({ length: count }).map((_, i) => (
      <Card key={i} />
    ))}
  </div>
);

const ProfileSkeleton = () => (
  <div className="space-y-4">
    <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5">
      <Skeleton shape="circle" width={56} height={56} className="flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton width="30%" height={16} />
        <Skeleton width="45%" height={12} />
      </div>
    </div>
    <div className="flex gap-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} width={90} height={30} className="rounded-full" />
      ))}
    </div>
    <CardsSkeleton count={3} />
    <TableSkeleton rows={5} cols={4} />
  </div>
);

// Matches the Insights page's Overview tab: fixed pill-tabs strip (with the
// filter button), then 8 StatCards in the same 4-col grid, then the
// Revenue-vs-Spends chart (3/4 width) beside the Business Activity feed
// (1/4 width) — the two things visible without scrolling on a typical
// viewport. Deeper report tables further down aren't mocked; the page's own
// tab content already replaces this skeleton by the time they'd matter.
const InsightsStatCard = () => (
  <>
    {/* Phones: same stacked tile the real page shows (icon + label, value, trend), 2 per row. */}
    <div className="sm:hidden flex flex-col justify-center gap-1.5 px-3 py-2.5 bg-white border border-gray-200 rounded-xl min-w-0" style={{ minHeight: 84 }}>
      <div className="flex items-center gap-1.5">
        <Skeleton shape="circle" width={16} height={16} className="flex-shrink-0" />
        <Skeleton width="55%" height={10} />
      </div>
      <Skeleton width="65%" height={15} />
      <Skeleton width="45%" height={10} />
    </div>
    <div className="hidden sm:flex relative min-h-[72px] items-center gap-3 px-4 py-2.5 bg-white border border-gray-200 rounded-xl min-w-0">
      <Skeleton shape="rect" width={40} height={40} className="rounded-lg flex-shrink-0" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton width="60%" height={10} />
        <Skeleton width="40%" height={16} />
      </div>
    </div>
  </>
);

const InsightsSkeleton = () => (
  <div>
    {/* Fixed tabs strip */}
    <div
      className="fixed right-0 h-16 px-4 sm:px-6 lg:px-8 border-b border-[#E1E4EA] bg-white flex items-center justify-between top-[calc(54px+var(--dc-offline-offset,0px))] lg:top-[calc(64px+var(--dc-offline-offset,0px))]"
      style={{ left: "var(--sidebar-width, 0px)", zIndex: 40 }}
    >
      {/* One pill per real tab (Overview, Contacts, Companies, Deals, Vendors,
          Purchase Orders, Purchases, Invoices) so the strip doesn't visibly
          grow once the real pills replace it. */}
      <div className="inline-flex items-center gap-1.5 h-10 p-1 bg-[#F1F1F5] rounded-full overflow-x-auto max-w-full">
        {[76, 84, 96, 68, 82, 128, 92, 84].map((w, i) => (
          <Skeleton key={i} width={w} height={36} className="rounded-full flex-shrink-0" />
        ))}
      </div>
      <Skeleton shape="circle" width={40} height={40} className="flex-shrink-0" />
    </div>

    <div className="pt-[80px] lg:pt-[90px] space-y-6">
      {/* 8 KPI cards, same 1/2/4-col grid as the real StatCard grid */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <InsightsStatCard key={i} />
        ))}
      </div>

      {/* Chart row: big trend chart (3/4) + activity feed (1/4) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 bg-white p-4 sm:p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <Skeleton width={200} height={18} />
            <div className="hidden sm:flex items-center gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} width={70} height={10} />
              ))}
            </div>
          </div>
          <div className="h-[220px] sm:h-[380px]">
            <Skeleton width="100%" height="100%" shape="rect" className="rounded-lg" />
          </div>
        </div>
        <div className="lg:col-span-1 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <Skeleton width="55%" height={16} className="mb-4" />
          <div className="flex items-center gap-2 mb-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} width={60} height={28} className="rounded-full" />
            ))}
          </div>
          <div className="space-y-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton shape="circle" width={32} height={32} className="flex-shrink-0" />
                <div className="flex-1 space-y-1.5 pt-0.5">
                  <Skeleton width="80%" height={12} />
                  <Skeleton width="50%" height={10} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);

// Mirrors the real Settings page: the fixed header strip, then a category
// heading (icon chip + title + hairline) over a row of icon-and-label tiles,
// repeated. The generic variant used to stand in here, so the page jumped
// from four wide cards to six small tiles the moment it loaded.
// `groups` is the real per-category tile count, passed by the caller: the
// settings item list is a static array in the component, so its exact shape
// is known even while the page is still "loading". Without it the staff page
// (1 + 7 + 1 entries) drew the admin page's three full rows of six.
const SettingsSkeleton = ({ groups, categories = 3, tiles = 6 }) => (
  <div className="space-y-0 -m-6">
    <div className="flex items-center justify-between gap-4 border-b border-[#E1E4EA] bg-white px-4 sm:px-6 lg:px-8" style={{ height: 64 }}>
      <div className="flex flex-col gap-1.5">
        <Skeleton width={90} height={16} />
        <Skeleton width={180} height={10} />
      </div>
      <Skeleton width={150} height={34} className="rounded-lg hidden md:block" />
    </div>

    <div className="px-4 sm:px-6 lg:px-8 pt-8 pb-8 space-y-8">
      {(groups && groups.length ? groups : Array.from({ length: categories }, () => tiles)).map((count, c) => (
        <div key={c}>
          <div className="flex items-center gap-3 mb-5">
            <Skeleton width={36} height={36} className="rounded-lg flex-shrink-0" />
            <Skeleton width={130} height={20} />
            <div className="flex-1">
              <Skeleton width="100%" height={1} />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {Array.from({ length: count }).map((_, t) => (
              <div key={t} className="flex flex-col items-center gap-2 p-3">
                <Skeleton width={48} height={48} className="rounded-xl" />
                <Skeleton width={70} height={10} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
);

const GenericSkeleton = () => (
  <div className="space-y-4">
    <Skeleton width="25%" height={22} />
    <Skeleton width="60%" height={12} />
    <CardsSkeleton count={4} />
  </div>
);

// Matches the record-detail pages (company / contact / deal) top-to-bottom:
// the 40px header row (name block on the left, action buttons on the right),
// the full-bleed separator, the pill tab bar, the second separator, the
// six-tile KPI strip, then the tab body. Laid out with the same spacing the
// real pages use, so nothing jumps when the content replaces it.
const RecordDetailSkeleton = ({ tabWidths = [80, 88, 76, 72, 96, 92] }) => (
  <div className="bg-white -m-6 pt-6 px-6 min-h-full">
    {/* Header row */}
    <div className="flex items-center justify-between mb-2" style={{ height: 40 }}>
      <div className="flex items-center gap-3 min-w-0">
        <Skeleton shape="circle" width={28} height={28} className="flex-shrink-0" />
        <div className="space-y-1.5">
          <Skeleton width={180} height={16} />
          <Skeleton width={110} height={11} />
        </div>
        <Skeleton shape="circle" width={28} height={28} className="flex-shrink-0" />
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Skeleton shape="circle" width={32} height={32} className="hidden lg:block" />
        <Skeleton shape="circle" width={32} height={32} className="hidden lg:block" />
        <Skeleton shape="circle" width={32} height={32} />
        <Skeleton width={104} height={32} className="rounded-full hidden lg:block" />
        <Skeleton width={72} height={32} className="rounded-full hidden lg:block" />
      </div>
    </div>

    {/* Separator */}
    <div className="border-b border-gray-200 mb-4 -mx-6" />

    {/* Pill tab bar - one pill per real tab, so the bar doesn't resize */}
    <div className="flex items-center mb-4">
      <div className="inline-flex items-center gap-1.5 h-10 p-1 bg-[#F1F1F5] rounded-full">
        {tabWidths.map((w, i) => (
          <Skeleton key={i} width={w} height={32} className="rounded-full flex-shrink-0" />
        ))}
      </div>
    </div>

    <div className="border-b border-gray-200 mb-4 -mx-6" />

    {/* KPI strip - same 2/3/6-col grid as the real StatTile row */}
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-[56px] w-full flex items-center gap-2 px-3 bg-gray-50 border border-gray-200 rounded-xl"
        >
          <Skeleton shape="circle" width={20} height={20} className="flex-shrink-0" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton width="70%" height={10} />
            <Skeleton width="45%" height={14} />
          </div>
        </div>
      ))}
    </div>

    {/* Tab body */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton shape="rect" width={32} height={32} className="rounded-lg" />
            <Skeleton width={120} height={14} />
          </div>
          <Skeleton width="55%" height={20} />
        </div>
      ))}
    </div>
  </div>
);

const VARIANTS = {
  table: TableSkeleton,
  kanban: KanbanSkeleton,
  cards: CardsSkeleton,
  profile: ProfileSkeleton,
  recordDetail: RecordDetailSkeleton,
  generic: GenericSkeleton,
  insights: InsightsSkeleton,
  settings: SettingsSkeleton,
};

/**
 * Full-page structured loading placeholder. Fills the same fixed content
 * band used by the app's real page bodies (top:64, left:sidebar, right:0,
 * bottom:0) so it sits in exactly the space the real content will occupy.
 */
export default function PageSkeleton({ variant = "generic", ...rest }) {
  const Body = VARIANTS[variant] || GenericSkeleton;
  return (
    <div
      className="fixed overflow-y-auto bg-gray-50 p-6 z-20 top-[calc(54px+var(--dc-offline-offset,0px))] lg:top-[calc(64px+var(--dc-offline-offset,0px))]"
      style={{ left: "var(--sidebar-width, 0px)", right: 0, bottom: 0 }}
    >
      <Body {...rest} />
    </div>
  );
}

export { TableSkeleton, KanbanSkeleton, CardsSkeleton, ProfileSkeleton, GenericSkeleton, SettingsSkeleton };
