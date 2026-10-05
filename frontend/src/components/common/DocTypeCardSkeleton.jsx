import Skeleton from "./Skeleton";

/**
 * Loading counterpart to the `DocTypeCard` in deal/DealDocumentsTab.jsx.
 * Mirrors that card's shell class-for-class — same border, radius, padding and
 * min-height — and puts placeholders exactly where the icon, count, title,
 * amount, status pills and footer affordance sit, so the grid doesn't shift or
 * resize when the document counts land.
 */
export default function DocTypeCardSkeleton() {
  return (
    <div className="flex flex-col bg-white border border-gray-200 rounded-xl p-4 min-h-[140px] h-full">
      {/* Top: icon box + count */}
      <div className="flex items-center justify-between">
        <Skeleton shape="rounded" width={34} height={34} className="flex-shrink-0" />
        <Skeleton width={40} height={11} />
      </div>

      {/* Title */}
      <Skeleton width="70%" height={14} className="mt-2.5" />

      {/* Amount */}
      <Skeleton width="55%" height={18} className="mt-1.5" />

      {/* Status pills */}
      <div className="mt-2.5 flex items-center gap-1.5">
        <Skeleton shape="circle" width={56} height={18} />
        <Skeleton shape="circle" width={44} height={18} />
      </div>

      {/* Footer affordance */}
      <Skeleton width={96} height={12} className="mt-auto pt-0.5" />
    </div>
  );
}
