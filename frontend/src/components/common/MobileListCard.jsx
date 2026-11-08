import React from "react";
import EditIcon from "./EditIcon";

// Mobile-app list card (same design as the Accounting invoice cards):
// row 1 = number + status pill, row 2 = title + amount, divider, then
// detail lines on the left and Edit + more-actions buttons on the right.
export const cardMoney = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const cardDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "N/A";

export const cardStatusStyle = (status) => {
  const k = String(status || "").toLowerCase().trim();
  const has = (words) => words.some((w) => k.includes(w));
  if (has(["reject", "unpaid", "cancel", "declin", "overdue", "fail", "expired", "void", "return", "refund", "lost", "inactive"]))
    return { pill: "bg-red-50 text-red-700", dot: "bg-red-500" };
  if (has(["pending", "progress", "partial", "sent", "processing", "awaiting", "review", "hold", "transit", "paused"]))
    return { pill: "bg-amber-50 text-amber-700", dot: "bg-amber-500" };
  if (has(["paid", "accept", "approv", "deliver", "complete", "confirm", "success", "convert", "won", "active", "signed", "received", "processed"]))
    return { pill: "bg-green-50 text-green-700", dot: "bg-green-500" };
  return { pill: "bg-blue-50 text-blue-700", dot: "bg-blue-500" };
};

const menuBtnCls =
  "[&>div>button]:w-8 [&>div>button]:h-8 [&>div>button]:flex [&>div>button]:items-center [&>div>button]:justify-center [&>div>button]:rounded-full [&>div>button]:border [&>div>button]:border-[#E1E4EA] [&>div>button]:p-0 [&>div>button]:text-[#0E121B]";

export default function MobileListCard({
  number,        // node: top-left (document number / name)
  status,        // string → colored pill
  statusNode,    // optional custom pill (overrides status)
  title,         // node: second line, left
  amount,        // string: formatted amount, right
  amountNote,    // optional small note under the amount
  lines = [],    // [{ icon: Component, label, value }]
  onEdit,        // optional → pencil button
  menu,          // node: the page's existing row-actions menu
  onClick,
}) {
  const st = cardStatusStyle(status);
  return (
    <div
      onClick={(e) => {
        if (!onClick) return;
        if (e.target.closest("button, a, input, label, [data-no-row-click]")) return;
        onClick();
      }}
      className="px-3 py-2.5 rounded-2xl border border-[#E1E4EA] bg-white"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 text-[15px] font-medium text-[#0085FF] truncate">{number}</div>
        {statusNode ||
          (status ? (
            <span className={`inline-flex items-center gap-1.5 flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${st.pill}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
              {status}
            </span>
          ) : null)}
      </div>

      {(title || amount) && (
        <div className="mt-0.5 flex items-start justify-between gap-2">
          <div className="min-w-0 pt-1 text-xs leading-tight text-[#525866] truncate">{title}</div>
          {amount && (
            <div className="flex-shrink-0 text-right">
              <div className="text-[19px] leading-tight font-semibold text-[#0E121B] tracking-tight whitespace-nowrap">{amount}</div>
              {amountNote && <div className="text-[11px] font-medium text-orange-600 leading-none">{amountNote}</div>}
            </div>
          )}
        </div>
      )}

      <div className="mt-1 pt-1 border-t border-[#E1E4EA] flex items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5 min-w-0">
          {lines.map((l, i) => (
            <div key={i} className="flex items-center gap-2 text-xs min-w-0">
              {l.icon && <l.icon className="w-3.5 h-3.5 text-[#868C98] flex-shrink-0" />}
              {l.label && <span className="w-11 text-[#868C98] flex-shrink-0">{l.label}</span>}
              <span className="font-medium text-[#0E121B] truncate">{l.value}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0" data-no-row-click>
          {onEdit && (
            <button
              type="button"
              title="Edit"
              aria-label="Edit"
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="w-8 h-8 flex items-center justify-center rounded-full border border-[#E1E4EA] text-[#0085FF] hover:bg-blue-50"
            >
              <EditIcon className="w-4 h-4" />
            </button>
          )}
          <div className={menuBtnCls}>{menu}</div>
        </div>
      </div>
    </div>
  );
}

export function MobileCardList({ children }) {
  return (
    <div
      className="bg-white pt-3 pr-4 pb-[120px] flex flex-col gap-2"
      style={{ marginLeft: "calc(-1 * var(--content-inset, 16px))", paddingLeft: 16 }}
    >
      {children}
    </div>
  );
}

export const CardSkeletons = ({ n = 6 }) =>
  Array.from({ length: n }).map((_, i) => (
    <div key={i} className="h-[120px] rounded-2xl border border-[#E1E4EA] bg-gray-50 animate-pulse" />
  ));
export { CalendarPlus, CalendarClock } from "lucide-react";
