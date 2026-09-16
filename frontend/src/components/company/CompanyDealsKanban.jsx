import CalendarClockIcon from "../common/CalendarClockIcon";
import DeleteIcon from "../common/DeleteIcon";
import AvgDealSizeIcon from "../common/AvgDealSizeIcon";
import WonDealIcon from "../common/WonDealIcon";
import LostDealIcon from "../common/LostDealIcon";
import Checkbox from "../common/Checkbox";
import PlusIcon from "../common/PlusIcon";
import MoreIcon from "../common/MoreIcon";
import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { DATE_RANGES, getDateRangeLabel } from "../../utils/dateBuckets";
import BulkActionBar from "../common/BulkActionBar";
import { useSubscription } from "../../contexts/SubscriptionContext";
import { hasMinPlan } from "../../utils/subscriptionHelpers";
import UpgradeRequiredModal from "../subscription/UpgradeRequiredModal";
import { Link, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  MeasuringStrategy,
} from "@dnd-kit/core";
import {
  useSortable,
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  defaultAnimateLayoutChanges,
} from "@dnd-kit/sortable";

// dnd-kit's default heuristic skips the reflow animation for sibling cards
// during certain drag sequences (isSorting && !wasDragging), which is why a
// neighbouring card would just sit there instead of sliding into the gap
// left by the dragged one. Forcing wasDragging:true always animates it.
const animateLayoutChanges = (args) =>
  defaultAnimateLayoutChanges({ ...args, wasDragging: true });
import { CSS } from "@dnd-kit/utilities";
import { getAncestorZoom } from "../../utils/domUtils";
import { getPinnedBoundaryOverlayStyle } from "../../utils/pinnedColumnShadow";
import {
  Filter,
  Gem,
  Clock,
  Handshake,
  Building2,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Pin,
  PinOff,
  EyeOff,
  User,
  Tag,
  IndianRupee,
  X, ArrowUp, ArrowDown } from "lucide-react";
import { EditablePaginationButtons } from "../common/EditablePaginationButtons";
import toast from "react-hot-toast";
import confetti from "canvas-confetti";
import API from "../../services/api";
import QuickDealForm from "../deal/QuickDealForm";
import FilterIcon from "../common/FilterIcon";
import CompanyFilterPanel from "./CompanyFilterPanel";
import { applyColumnFilters } from "../../utils/advancedFilters";
import StatTile from "../common/StatTile";
import StatTileSkeleton from "../common/StatTileSkeleton";
import DealCardSkeleton from "../common/DealCardSkeleton";
import Skeleton from "../common/Skeleton";
import useFillToBottom from "../../hooks/useFillToBottom";
import { formatNumberToIndian } from "../../utils/numberFormatter";

import SearchIcon from "../common/SearchIcon";
import TableViewIcon from "../common/TableViewIcon";
import KanbanViewIcon from "../common/KanbanViewIcon";
import EyeIcon from "../common/EyeIcon";
import EditIcon from "../common/EditIcon";
const AMOUNT_RANGES = [
  { label: "Under ₹10,000", test: (v) => v < 10000 },
  { label: "₹10,000 – ₹50,000", test: (v) => v >= 10000 && v < 50000 },
  { label: "₹50,000 – ₹1,00,000", test: (v) => v >= 50000 && v < 100000 },
  { label: "Above ₹1,00,000", test: (v) => v >= 100000 },
];

const getAmountRangeLabel = (amount) => {
  const num = Number(amount) || 0;
  return AMOUNT_RANGES.find((r) => r.test(num))?.label || "";
};


const DEAL_FILTER_COLUMNS = (statuses) => [
  { key: "stage", label: "Stage", options: statuses },
  { key: "amount", label: "Amount", options: AMOUNT_RANGES.map((r) => r.label) },
  { key: "lastUpdated", label: "Last Updated", options: DATE_RANGES.map((r) => r.label) },
];

const getDealFieldValue = (deal, key) => {
  switch (key) {
    case "contact":
      return deal.contact?.name || "";
    case "stage":
      return deal.status || "";
    case "amount":
      return getAmountRangeLabel(deal.amount);
    case "lastUpdated":
      return getDateRangeLabel(deal.updatedAt);
    default:
      return deal[key];
  }
};

const TERMINAL_STATUSES = ["won", "lost"];

// dnd-kit's default measures every droppable's rect continuously while a
// drag is in progress (MeasuringStrategy.Always), which means every card
// and every column body gets a fresh getBoundingClientRect() on essentially
// every pointer move — the more cards on the board, the more that costs,
// and it's the main source of the drag feeling laggy here. Measuring once
// up front is enough: column layout doesn't reflow during a drag (only
// membership does, which dnd-kit already tracks via its own sortable state).
const DND_MEASURING = { droppable: { strategy: MeasuringStrategy.BeforeDragging } };

// The app scales its desktop layout via a dynamic CSS `zoom` on <html> (App.jsx).
// getBoundingClientRect() returns UNSCALED layout coordinates while portal overlays on
// document.body render in visual space, so rect-derived positions must be multiplied by
// this zoom factor to line up on screen.
const getRootZoom = () => {
  if (typeof window === "undefined") return 1;
  const z = parseFloat(getComputedStyle(document.documentElement).zoom);
  return z && !Number.isNaN(z) ? z : 1;
};

const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Wraps every case-insensitive occurrence of `query` inside `text` in a <mark>.
const HighlightText = ({ text, query }) => {
  const str = text === null || text === undefined ? "" : String(text);
  const q = (query || "").trim();
  if (!q) return <>{str}</>;

  const parts = str.split(new RegExp(`(${escapeRegExp(q)})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-yellow-200 text-inherit rounded-sm px-0.5">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
};

const Avatar = ({ name, className = "" }) => (
  <div
    className={`w-[18px] h-[18px] rounded-full bg-gray-200 border border-white flex items-center justify-center text-[8px] font-semibold text-gray-600 flex-shrink-0 ${className}`}
    title={name}
  >
    {name?.charAt(0)?.toUpperCase() || "?"}
  </div>
);

// Card geometry/appearance lives here once so the sortable card and the drag
// overlay can never drift apart. Unchanged from the previous implementation.
const DEAL_CARD_BOX = {
  width: "300px",
  height: "132px",
  padding: "16px",
  gap: "16px",
  borderColor: "#E5E5EC",
};
const DEAL_CARD_CLASS =
  "box-border flex flex-col items-start bg-white border rounded-[10px] mb-3 hover:shadow-sm transition-shadow overflow-hidden";

// Inner markup only — no drag wiring, no navigation. Rendered by both shells below.
// `selectSlot` is an optional node dropped in front of the title (the selection
// checkbox on the in-list card); the drag overlay passes nothing so it stays clean.
const DealCardContent = ({ deal, selectSlot = null, setDealToDelete }) => {
  const navigate = useNavigate();
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [actionsPos, setActionsPos] = useState(null);
  const actionsRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (actionsRef.current && !actionsRef.current.contains(event.target)) {
        setIsActionsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  const tagLabel = deal.company?.name || deal.company?.industry || deal.contact?.name;
  const avatarNames = [deal.contact?.name, deal.user?.name].filter(Boolean);

  return (
    <>
      <div className="flex flex-col items-start gap-2 w-full">
        <div className="flex items-center justify-between w-full gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {selectSlot}
            <span
              className="truncate"
              style={{ fontFamily: "Inter", fontWeight: 600, fontSize: "14px", lineHeight: "150%", letterSpacing: "-0.02em", color: "#161618" }}
            >
              {deal.title || "Deal Name"}
            </span>
          </div>
          <div className="relative flex-shrink-0 pointer-events-auto">
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                if (isActionsOpen) {
                  setIsActionsOpen(false);
                  return;
                }
                const zMenu = getAncestorZoom(document.body) || 1;
                const rect = e.currentTarget.getBoundingClientRect();
                const viewportH = window.innerHeight / zMenu;
                const viewportW = window.innerWidth / zMenu;
                const MENU_W = 160;
                const MENU_H = 110;

                const rowCenter = (rect.top + rect.bottom) / (2 * zMenu);
                let calcTop = rowCenter - MENU_H / 2;
                calcTop = Math.max(8, Math.min(calcTop, viewportH - MENU_H - 8));
                let calcLeft = rect.right / zMenu - MENU_W - 12;
                calcLeft = Math.min(calcLeft, viewportW - MENU_W - 8);
                calcLeft = Math.max(calcLeft, 8);

                setActionsPos({ top: calcTop, left: calcLeft });
                setIsActionsOpen(true);
              }}
              className="p-1 cursor-pointer hover:bg-gray-100 rounded-md transition-colors z-10"
              title="More actions"
            >
              <MoreIcon className="w-4 h-4 text-[#BEBEC8]" />
            </button>
            {isActionsOpen && actionsPos && createPortal(
              <>
                <div className="fixed inset-0 z-[9998]" onClick={(e) => { e.stopPropagation(); setIsActionsOpen(false); }} />
                <div
                  ref={actionsRef}
                  style={{ position: "fixed", top: actionsPos.top, left: actionsPos.left }}
                  className="w-[160px] z-[9999] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5 animate-in fade-in zoom-in duration-150 origin-top-right"
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsActionsOpen(false); navigate(`/deals/${deal._id}`); }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                  >
                    <EyeIcon className="w-3.5 h-3.5 text-[#1C1B1F]" />
                    View Deal
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsActionsOpen(false); navigate(`/deals/${deal._id}`); }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                  >
                    <EditIcon className="w-3.5 h-3.5 text-[#1C1B1F]" />
                    Edit Deal
                  </button>
                  <div className="w-full border-t border-[#F1F1F5] my-0.5" />
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsActionsOpen(false); setDealToDelete && setDealToDelete(deal); }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-red-600 hover:bg-red-50 whitespace-nowrap"
                  >
                    <DeleteIcon className="w-3.5 h-3.5" />
                    Delete Deal
                  </button>
                </div>
              </>,
              document.body
            )}
          </div>
        </div>
        <span
          className="w-full"
          style={{ fontFamily: "Inter", fontWeight: 500, fontSize: "14px", lineHeight: "150%", letterSpacing: "-0.02em", color: "#161618" }}
        >
          ₹{(deal.amount || 0).toLocaleString("en-IN")}
        </span>
      </div>

      <div className="w-full border-t border-[#F1F1F5]" />

      <div className="flex items-center gap-2 w-full">
        <div className="flex items-center justify-center w-[18px] h-[18px] rounded-[5px] bg-[#48494C] flex-shrink-0">
          <Building2 className="w-2.5 h-2.5 text-white" />
        </div>
        <span
          className="truncate flex-1"
          style={{ fontFamily: "Inter", fontWeight: 500, fontSize: "12px", lineHeight: "15px", letterSpacing: "-0.02em", color: "#161618" }}
        >
          {tagLabel || "—"}
        </span>
        {avatarNames.length > 0 && (
          <div className="flex items-center flex-shrink-0">
            {avatarNames.map((name, idx) => (
              <Avatar key={idx} name={name} className={idx > 0 ? "-ml-1" : ""} />
            ))}
          </div>
        )}
      </div>
    </>
  );
};

// The in-list card. Still a <Link>, so a plain click navigates exactly as before —
// the sensor's 8px activation constraint means a click never starts a drag, and a
// drag never fires the link. `transition` (which useDraggable did not provide) is
// what lets neighbouring cards glide aside instead of snapping.
const DealCard = React.memo(({ deal, selected = false, onToggleSelect, setDealToDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: deal._id, animateLayoutChanges });

  const style = {
    ...DEAL_CARD_BOX,
    position: "relative",
    transform: CSS.Transform.toString(transform),
    transition,
    // The original stays in place, faded, while the overlay follows the cursor.
    opacity: isDragging ? 0.5 : 1,
    // Selected cards read as picked at a glance, matching the list view's row tint.
    ...(selected ? { borderColor: "#0085FF", background: "#F5FAFF" } : null),
  };

  // The checkbox re-enables pointer events for itself only (the content layer
  // above the link is pointer-events-none). Stopping pointerdown keeps the drag
  // sensor from grabbing the card when you tick it. Because the checkbox is NOT
  // a descendant of the <Link> anymore, its native toggle + onChange fire
  // normally — no preventDefault fighting the selection, which is what caused
  // the "checked but not selected / selected but not checked" desync.
  const selectSlot = onToggleSelect ? (
    <span
      className="pointer-events-auto flex items-center flex-shrink-0"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Checkbox checked={selected} onChange={() => onToggleSelect(deal._id)} />
    </span>
  ) : null;

  // The card is a positioned shell. A full-bleed <Link> underneath is the
  // click-to-open target (kept as an anchor so middle-click / open-in-new-tab
  // still work); the visible content sits above it but is pointer-events-none,
  // so a plain click falls through to the link while the checkbox stays live.
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`${DEAL_CARD_CLASS} cursor-default`}
    >
      <Link
        to={`/deals/${deal._id}`}
        // Links are natively draggable in every browser — that fires the
        // browser's own HTML5 drag-and-drop alongside dnd-kit's pointer-based
        // synthetic drag. Killing the native one leaves dnd-kit in sole control.
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        className="absolute inset-0 z-0"
        aria-label={`Open ${deal.title || "deal"}`}
      />
      <div className="relative z-10 w-full flex flex-col items-start gap-4 pointer-events-none">
        <DealCardContent deal={deal} selectSlot={selectSlot} setDealToDelete={setDealToDelete} />
      </div>
    </div>
  );
});

// The floating preview. Deliberately a plain <div>, not a <Link>: it must never be
// clickable or navigable, and pointer-events-none keeps it from stealing hit-testing
// from the columns underneath it during the drag.
const DealCardOverlay = ({ deal }) => (
  <div
    style={{ ...DEAL_CARD_BOX, cursor: "grabbing" }}
    className={`${DEAL_CARD_CLASS} shadow-lg pointer-events-none`}
  >
    <DealCardContent deal={deal} />
  </div>
);

// Presentation ported verbatim from ModernKanbanColumn in pages/Deals.jsx so the
// company-profile Deals tab and the standalone /deals board look identical:
// same 340px shell, #F5F7FA header, pill counter, per-status tinted summary card
// and week-over-week trend badge.
const KanbanColumn = React.memo(({ status, deals, amountDeals, totalDealsCount, colorTheme = "blue", onAddClick, loading = false, selectedDeals = [], onToggleSelect, onToggleColumnSelect, setDealToDelete }) => {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const dealIds = useMemo(() => deals.map((d) => d._id), [deals]);

  // Header select-all state for this column: ticked when every card here is
  // selected. (No indeterminate/dash state — the Checkbox component only
  // has empty/checked glyphs, so a partial selection just reads as empty.)
  const allSelected = dealIds.length > 0 && dealIds.every((id) => selectedDeals.includes(id));

  // Deliberately computed from `amountDeals` (the column's real, committed
  // membership) rather than `deals` (which includes the live drag-over
  // preview) — otherwise this total/trend would recalculate the instant a
  // dragged card is hovered over the column, before the move is dropped.
  const settledDeals = amountDeals || deals;
  const totalAmount = settledDeals.reduce((sum, deal) => sum + (parseInt(deal.amount) || 0), 0);
  const formattedTotal = formatNumberToIndian(totalAmount);

  const trendPct = useMemo(() => {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const thisWeekStart = now - 7 * oneDay;
    const lastWeekStart = now - 14 * oneDay;
    const inRange = (deal, start, end) => {
      const t = new Date(deal.createdAt).getTime();
      return t >= start && t < end;
    };
    const sumAmount = (list) => list.reduce((sum, d) => sum + (parseInt(d.amount) || 0), 0);
    const thisWeek = sumAmount(settledDeals.filter((d) => inRange(d, thisWeekStart, now)));
    const lastWeek = sumAmount(settledDeals.filter((d) => inRange(d, lastWeekStart, thisWeekStart)));
    if (lastWeek === 0) return thisWeek === 0 ? 0 : 100;
    return Math.max(-999, Math.min(999, Math.round(((thisWeek - lastWeek) / lastWeek) * 100)));
  }, [settledDeals]);

  const tintColor =
    colorTheme === "green" ? "0, 201, 80" : colorTheme === "red" ? "232, 34, 34" : "179, 204, 255";

  return (
    <div
      className="flex flex-col items-start flex-shrink-0 bg-white"
      style={{ width: "340px", border: "1px solid #E7E7E9", borderRadius: "12px", overflow: "hidden" }}
    >
      {/* Header */}
      <div
        className="flex flex-row justify-between items-center w-full flex-shrink-0"
        style={{ height: "46px", padding: "0 18px", background: "#F5F7FA" }}
      >
        <div className="flex items-center gap-1.5">
          {onToggleColumnSelect && !loading && dealIds.length > 0 && (
            <Checkbox
              checked={allSelected}
              onChange={() => onToggleColumnSelect(dealIds)}
              uncheckedColor="text-[#525866]"
              wrapperClassName="flex-shrink-0"
              title={`Select all in ${status}`}
              aria-label={`Select all deals in ${status}`}
            />
          )}
          <span
            className="truncate"
            style={{ fontFamily: "Inter", fontWeight: 600, fontSize: "12px", lineHeight: "15px", letterSpacing: "-0.02em", color: "#44444A" }}
          >
            {status}
          </span>
          <span
            className="flex items-center justify-center flex-shrink-0"
            style={{
              minWidth: "22px",
              padding: "0 6px",
              height: "22px",
              background: "#FFFFFF",
              border: "1px solid #E5E5EC",
              boxShadow: "0px 1px 2px rgba(82, 88, 102, 0.06)",
              borderRadius: "20px",
              fontFamily: "Inter",
              fontWeight: 600,
              fontSize: "12px",
              lineHeight: "15px",
              letterSpacing: "-0.02em",
              color: "#161618",
            }}
          >
            {loading ? <Skeleton width={14} height={12} /> : (totalDealsCount !== undefined ? `${deals.length}/${totalDealsCount}` : deals.length)}
          </span>
        </div>
        <button
          onClick={() => onAddClick(status)}
          className="flex items-center justify-center cursor-pointer hover:opacity-70 transition-opacity flex-shrink-0"
          title="Add deal"
        >
          <PlusIcon className="w-4 h-4 text-[#BEBEC8]" />
        </button>
      </div>

      <div className="w-full flex-shrink-0" style={{ height: "1px", background: "#E7E7E9" }} />

      {/* Summary card — always visible, unlike the old version which hid it when empty */}
      <div className="w-full flex-shrink-0" style={{ padding: "20px 20px 0" }}>
        <div
          className="box-border flex flex-row justify-between items-center w-full"
          style={{
            padding: "16px",
            gap: "10px",
            background: `linear-gradient(94.22deg, rgba(255, 255, 255, 0) -7.06%, rgba(${tintColor}, 0.2) 101.14%), #FFFFFF`,
            border: "1px solid #E5E5EC",
            borderRadius: "10px",
          }}
        >
          {loading ? (
            <Skeleton width={90} height={22} />
          ) : (
            <span
              className="truncate"
              style={{ fontFamily: "Inter", fontWeight: 600, fontSize: "22px", lineHeight: "150%", letterSpacing: "-0.03em", color: "#48494C", minWidth: 0 }}
            >
              ₹{formattedTotal}
            </span>
          )}
          {!loading && (
            <span
              className="flex-shrink-0"
              style={{
                fontFamily: "Inter",
                fontWeight: 500,
                fontSize: "12px",
                lineHeight: "15px",
                letterSpacing: "-0.02em",
                color: trendPct >= 0 ? "#0747A6" : "#E82222",
                marginLeft: "auto",
              }}
            >
              {trendPct >= 0 ? "+" : ""}{trendPct}%
            </span>
          )}
        </div>
      </div>

      {/* Cards — capped to ~7 tall, then scrolls internally. */}
      <div
        ref={setNodeRef}
        className={`overflow-y-auto dc-card-scroll w-full px-[18px] pb-[18px] pt-3 transition-colors ${isOver ? "bg-blue-50/40" : ""}`}
        style={{ maxHeight: "1030px" }}
      >
        <div className="min-h-[80px]">
          <SortableContext id={status} items={dealIds} strategy={verticalListSortingStrategy}>
            {deals.map((deal) => (
              <DealCard
                key={deal._id}
                deal={deal}
                selected={selectedDeals.includes(deal._id)}
                onToggleSelect={onToggleSelect}
                setDealToDelete={setDealToDelete}
              />
            ))}
          </SortableContext>
          {/* Slack below the last card so dropping at the end of a long column
              doesn't require hitting the final card precisely. */}
          <div className="h-10 w-full" />
        </div>
      </div>
    </div>
  );
});

export default function CompanyDealsKanban({
  deals,
  setDeals,
  showStats = true,
  companyId,
  company,
  contacts = [],
  viewMode: controlledViewMode,
  setViewMode: setControlledViewMode,
  isLoading = false,
  autoOpenCreate = false,
  onAutoOpenCreateConsumed,
}) {
  // 8px of travel before a drag begins. This is what keeps a plain click on a card
  // navigating to the deal instead of being swallowed as a drag — do not lower it.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // The deal being dragged, captured on drag start. Serves two purposes: it feeds
  // the DragOverlay, and it preserves the ORIGINAL status — which onDragOver
  // overwrites in `deals` as soon as the pointer crosses into another column.
  const [activeDeal, setActiveDeal] = useState(null);
  const [celebrationDeal, setCelebrationDeal] = useState(null);
  // Which column the dragged card is currently hovered over. Kept as local
  // state instead of writing the new status into `deals` on every column
  // crossing (as before) — `deals` is owned by the parent page, so every
  // crossing was forcing a full re-render of the parent and this entire
  // tab (KPI tiles, table view, every card in every column), which is what
  // made dragging feel laggy. The real `deals` array is only updated once,
  // at drop.
  const [dragOverStatus, setDragOverStatus] = useState(null);
  // Cached at drag start instead of walking the ancestor chain with
  // getComputedStyle on every render the DragOverlay causes while the
  // pointer moves (dnd-kit re-renders it continuously during a drag) — the
  // zoom factor doesn't change mid-drag, so there's no need to re-read it.
  const dragZoomRef = useRef(1);

  const [manualDealFormOpen, setManualDealFormOpen] = useState(false);
  const [initialDealStatus, setInitialDealStatus] = useState("Open");
  // Derived rather than copied into local state on a one-shot effect — a
  // copy raced the initial data load (whichever re-rendered first won) and
  // could get clobbered before ever becoming visible.
  const showDealForm = manualDealFormOpen || autoOpenCreate;
  const closeDealForm = () => {
    setManualDealFormOpen(false);
    setInitialDealStatus("Open");
    if (autoOpenCreate) onAutoOpenCreateConsumed?.();
  };
  const [statuses, setStatuses] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState({});
  const [sortConfig, setSortConfig] = useState({ key: null, direction: null });

  // An explicit `direction` (from the column menu's Sort Ascending / Sort
  // Descending items) sets that direction outright, or clears it if it's
  // already the active sort. Called without one — e.g. clicking the header
  // label — it cycles asc -> desc -> off.
  const handleSort = (key, direction) => {
    if (direction) {
      setSortConfig((prev) =>
        prev.key === key && prev.direction === direction
          ? { key: null, direction: null }
          : { key, direction },
      );
      return;
    }
    setSortConfig((prev) => {
      if (prev.key !== key) return { key, direction: "asc" };
      if (prev.direction === "asc") return { key, direction: "desc" };
      return { key: null, direction: null };
    });
  };
  const [localViewMode, setLocalViewMode] = useState("list");
  const viewMode = controlledViewMode ?? localViewMode;
  const setViewMode = setControlledViewMode ?? setLocalViewMode;
  // Caps the list-view table at the bottom of the viewport so changing rows-per-page
  // scrolls internally instead of growing the page — same treatment as the Contacts,
  // Invoices, Tasks, Notes and Meetings tabs.
  const {
    containerRef: fillContainerRef,
    footerRef: fillFooterRef,
    style: fillStyle,
  } = useFillToBottom();

  const [currentPage, setCurrentPage] = useState(1);
  const [editingPage, setEditingPage] = useState(false);
  const [pageInput, setPageInput] = useState("");
  const [limit, setLimit] = useState(10);
  const navigate = useNavigate();

  // Multi-column pinning, independent left/right sides: [{ key, side }]
  const [pinnedColumns, setPinnedColumns] = useState([]);
  const [hiddenColumns, setHiddenColumns] = useState([]);
  const pinColumnToSide = (colKey, side) => {
    setPinnedColumns((prev) => [...prev.filter((p) => p.key !== colKey), { key: colKey, side }]);
  };
  const unpinColumn = (colKey) => {
    setPinnedColumns((prev) => prev.filter((p) => p.key !== colKey));
  };
  const getColumnPinSide = (colKey) => pinnedColumns.find((p) => p.key === colKey)?.side || null;
  const hideColumn = (colKey) => setHiddenColumns((prev) => [...prev, colKey]);

  // Drag-to-reorder columns — same portal drag-ghost approach as the shared
  // DataTable component (used by the Dashboard "Top Invoices" table) for parity.
  const [columnOrder, setColumnOrder] = useState([]);
  const [draggedColKey, setDraggedColKey] = useState(null);
  const [dragOverColKey, setDragOverColKey] = useState(null);
  const [dragGhost, setDragGhost] = useState(null);
  const dragOverRef = useRef(null);
  const ghostElRef = useRef(null);

  const reorderColumns = (draggedKey, targetKey, fallbackOrder) => {
    if (!draggedKey || !targetKey || draggedKey === targetKey) return;
    const base = columnOrder.length ? columnOrder : fallbackOrder;
    const order = base.includes(draggedKey) ? [...base] : [...base, draggedKey];
    const from = order.indexOf(draggedKey);
    const to = order.indexOf(targetKey);
    if (from === -1 || to === -1) return;
    order.splice(from, 1);
    order.splice(to, 0, draggedKey);
    setColumnOrder(order);
  };

  const getDealColumnPreviewValue = (deal, colId) => {
    switch (colId) {
      case "dealId":
        return `DL-${deal._id.slice(-5).toUpperCase()}`;
      case "title":
        return deal.title || "-";
      case "contact":
        return deal.contact?.name || "-";
      case "stage":
        return deal.status || "-";
      case "amount":
        return `₹${(deal.amount || 0).toLocaleString("en-IN")}`;
      case "lastUpdated":
        return deal.updatedAt
          ? new Date(deal.updatedAt).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })
          : "-";
      default:
        return "-";
    }
  };

  const startColumnDrag = (e, colId, label, fallbackOrder) => {
    if (e.button !== 0) return;
    if (e.target.closest("button") || e.target.closest("[data-resize-handle]")) return;

    // No click-count gate here, matching the Companies list page: a press plus
    // DRAG_THRESHOLD px of movement starts the drag, at whatever speed the user
    // moves. Gating on `e.detail` meant only a fast-enough double-click could
    // begin a move. The threshold below is what keeps a plain click harmless,
    // and the column menu opens from its own chevron button, never from the
    // header background — so nothing competes with the drag for a single press.

    const th = e.currentTarget;
    const startX = e.clientX;
    const startY = e.clientY;
    const DRAG_THRESHOLD = 5;

    // Tracks whether the pointer has moved past the threshold yet. A plain click
    // (mousedown -> tiny/no movement -> mouseup) never crosses it, so it never shows
    // the drag ghost or touches drag state — only a deliberate drag does.
    const dragState = { started: false, offsetX: 0, offsetY: 0, zGhost: 1 };

    const positionGhost = (clientX, clientY) => {
      const el = ghostElRef.current;
      if (!el) return;
      const visualTop = clientY - dragState.offsetY;
      const visualLeft = clientX - dragState.offsetX;
      el.style.top = `${visualTop / dragState.zGhost}px`;
      el.style.left = `${visualLeft / dragState.zGhost}px`;
      el.style.maxHeight = `${Math.max(100, window.innerHeight - visualTop - 72) / dragState.zGhost}px`;
    };

    const updateDragOver = (clientX, clientY) => {
      const elAtPoint = document.elementFromPoint(clientX, clientY);
      const thAtPoint = elAtPoint?.closest("th[data-col-id]");
      const overKey = thAtPoint?.getAttribute("data-col-id") || null;
      if (dragOverRef.current !== overKey) {
        dragOverRef.current = overKey;
        setDragOverColKey(overKey);
      }
    };

    const beginDrag = () => {
      dragState.started = true;
      window.getSelection?.()?.removeAllRanges();

      const rect = th.getBoundingClientRect();
      const previewRows = paginatedDeals.map((d) => String(getDealColumnPreviewValue(d, colId)));
      dragState.zGhost = getRootZoom();
      dragState.offsetX = startX - rect.left;
      dragState.offsetY = startY - rect.top;

      dragOverRef.current = null;
      setDraggedColKey(colId);
      setDragOverColKey(null);
      document.body.style.userSelect = "none";
      setDragGhost({
        label,
        previewRows,
        offsetX: dragState.offsetX,
        offsetY: dragState.offsetY,
        width: rect.width / dragState.zGhost,
        height: rect.height / dragState.zGhost,
      });

      requestAnimationFrame(() => positionGhost(startX, startY));
    };

    const handleMouseMove = (moveEvent) => {
      if (!dragState.started) {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        e.preventDefault();
        beginDrag();
      }
      positionGhost(moveEvent.clientX, moveEvent.clientY);
      updateDragOver(moveEvent.clientX, moveEvent.clientY);
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      if (!dragState.started) return;
      document.body.style.userSelect = "";
      const overKey = dragOverRef.current;
      if (overKey && overKey !== colId) {
        reorderColumns(colId, overKey, fallbackOrder);
      }
      dragOverRef.current = null;
      setDraggedColKey(null);
      setDragOverColKey(null);
      setDragGhost(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const [openColMenuKey, setOpenColMenuKey] = useState(null);
  const [colMenuPos, setColMenuPos] = useState(null);
  const colMenuRef = useRef(null);

  const [openRowActionsId, setOpenRowActionsId] = useState(null);
  const [rowActionsPos, setRowActionsPos] = useState(null);
  const rowActionsRef = useRef(null);

  // Lock page scroll while a portal menu is open so the background can't shift/scroll
  // out from under the fixed-position menu (its position is only computed once, on open).
  // Any scroll/wheel/touch/keyboard-scroll attempt closes the menu instead of moving the page.
  useEffect(() => {
    if (!openRowActionsId && !openColMenuKey) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const SCROLL_KEYS = ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "];
    const closeMenus = () => {
      setOpenRowActionsId(null);
      setRowActionsPos(null);
      setOpenColMenuKey(null);
      setColMenuPos(null);
    };
    const handleWheel = (e) => {
      e.preventDefault();
      closeMenus();
    };
    const handleTouchMove = () => closeMenus();
    const handleKeyDown = (e) => {
      if (SCROLL_KEYS.includes(e.key)) closeMenus();
    };
    const handleScroll = () => closeMenus();

    window.addEventListener("wheel", handleWheel, { passive: false, capture: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true, capture: true });
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    document.addEventListener("scroll", handleScroll, { capture: true });

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("wheel", handleWheel, { capture: true });
      window.removeEventListener("touchmove", handleTouchMove, { capture: true });
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      document.removeEventListener("scroll", handleScroll, { capture: true });
    };
  }, [openRowActionsId, openColMenuKey]);

  const [dealToDelete, setDealToDelete] = useState(null);
  const [deletingDeal, setDeletingDeal] = useState(false);

  const handleDeleteDealConfirmed = async () => {
    if (!dealToDelete) return;
    setDeletingDeal(true);
    try {
      await API.delete(`/deals/${dealToDelete._id}`);
      setDeals((prev) => prev.filter((d) => d._id !== dealToDelete._id));
      toast.success("Deal deleted");
      setDealToDelete(null);
    } catch (err) {
      console.error("Failed to delete deal:", err);
      toast.error(err.response?.data?.message || "Failed to delete deal");
    } finally {
      setDeletingDeal(false);
    }
  };

  // Row selection + bulk actions
  const [selectedDeals, setSelectedDeals] = useState([]);
  const { subscription } = useSubscription();
  const hasBulkAccess = hasMinPlan(subscription?.subscription?.planName, "growth");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  // Delays the bulk-strip's unmount so it can play a slide-out-right exit
  // animation on deselect (mirroring the slide-in entrance).
  const [showBulkStrip, setShowBulkStrip] = useState(false);
  const [bulkStripClosing, setBulkStripClosing] = useState(false);
  useEffect(() => {
    // Selection drives the bulk strip in BOTH views now — the kanban cards carry
    // checkboxes too, so a board selection opens the same Update Status / Delete
    // / Export strip the list view uses.
    const active = selectedDeals.length > 0;
    if (active) {
      setBulkStripClosing(false);
      setShowBulkStrip(true);
    } else if (showBulkStrip) {
      setBulkStripClosing(true);
      const t = setTimeout(() => {
        setShowBulkStrip(false);
        setBulkStripClosing(false);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [viewMode, selectedDeals.length]);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showBulkStatusModal, setShowBulkStatusModal] = useState(false);
  const [bulkStatus, setBulkStatus] = useState("Open");
  const [bulkLoading, setBulkLoading] = useState(false);
  // One shared modal for "add note" / "add task" to every selected deal —
  // `bulkAddMode` is null (closed), "note", or "task".
  const [bulkAddMode, setBulkAddMode] = useState(null);
  const [bulkNoteText, setBulkNoteText] = useState("");
  const [bulkTaskTitle, setBulkTaskTitle] = useState("");
  const [bulkTaskDesc, setBulkTaskDesc] = useState("");

  const handleSelectAllDeals = () => {
    if (!hasBulkAccess) {
      setShowUpgradeModal(true);
      return;
    }
    setSelectedDeals((prev) =>
      prev.length === paginatedDeals.length ? [] : paginatedDeals.map((d) => d._id),
    );
  };
  const handleSelectDeal = useCallback((id) => {
    if (!hasBulkAccess) {
      setShowUpgradeModal(true);
      return;
    }
    setSelectedDeals((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, [hasBulkAccess]);
  const handleAddDealClick = useCallback((statusStr) => {
    setInitialDealStatus(typeof statusStr === "string" ? statusStr : "Open");
    setManualDealFormOpen(true);
  }, []);

  // Column header select-all: if every card in the column is already selected,
  // clicking clears just those; otherwise it adds them all to the selection.
  const handleToggleColumnSelect = useCallback((ids) => {
    if (!hasBulkAccess) {
      setShowUpgradeModal(true);
      return;
    }
    setSelectedDeals((prev) => {
      const allSelected = ids.length > 0 && ids.every((id) => prev.includes(id));
      return allSelected
        ? prev.filter((id) => !ids.includes(id))
        : [...new Set([...prev, ...ids])];
    });
  }, [hasBulkAccess]);

  const handleBulkDeleteDeals = async () => {
    setBulkLoading(true);
    try {
      await Promise.all(selectedDeals.map((id) => API.delete(`/deals/${id}`)));
      setDeals((prev) => prev.filter((d) => !selectedDeals.includes(d._id)));
      toast.success(`${selectedDeals.length} deal(s) deleted`);
      setSelectedDeals([]);
      setShowBulkDeleteModal(false);
    } catch (err) {
      console.error("Bulk deal delete failed:", err);
      toast.error(err.response?.data?.message || "Bulk delete failed");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkUpdateDealStatus = async () => {
    setBulkLoading(true);
    try {
      await Promise.all(
        selectedDeals.map((id) => {
          const deal = deals.find((d) => d._id === id);
          return API.post(`/deals/${id}/status`, { oldStatus: deal?.status || "Open", newStatus: bulkStatus });
        }),
      );
      setDeals((prev) => prev.map((d) => (selectedDeals.includes(d._id) ? { ...d, status: bulkStatus } : d)));
      toast.success(`${selectedDeals.length} deal(s) updated`);
      setSelectedDeals([]);
      setShowBulkStatusModal(false);
    } catch (err) {
      console.error("Bulk deal status update failed:", err);
      toast.error(err.response?.data?.message || "Bulk update failed");
    } finally {
      setBulkLoading(false);
    }
  };

  // One note per selected deal, scoped to that deal (the backend also records
  // each deal's company so company-level note views still show it).
  const handleBulkAddNote = async () => {
    const text = bulkNoteText.trim();
    if (!text) return toast.error("Note cannot be empty.");
    setBulkLoading(true);
    try {
      await API.post("/notes/bulk-deal-notes", { note: text, dealIds: selectedDeals });
      toast.success(`Note added to ${selectedDeals.length} deal${selectedDeals.length !== 1 ? "s" : ""}`);
      setBulkAddMode(null);
      setBulkNoteText("");
      setSelectedDeals([]);
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to add note");
    } finally {
      setBulkLoading(false);
    }
  };

  // No bulk-task endpoint exists, so create one task per selected deal, each
  // linked back to its deal via relatedEntities (entityModel "Deal").
  const handleBulkAddTask = async () => {
    const title = bulkTaskTitle.trim();
    if (!title) return toast.error("Task title cannot be empty.");
    setBulkLoading(true);
    try {
      await Promise.all(
        selectedDeals.map((id) =>
          API.post("/tasks", {
            title,
            description: bulkTaskDesc.trim(),
            relatedEntities: [{ entityId: id, entityModel: "Deal" }],
          }),
        ),
      );
      toast.success(`Task added to ${selectedDeals.length} deal${selectedDeals.length !== 1 ? "s" : ""}`);
      setBulkAddMode(null);
      setBulkTaskTitle("");
      setBulkTaskDesc("");
      setSelectedDeals([]);
    } catch (err) {
      toast.error(err.response?.data?.error || err.response?.data?.message || "Failed to add task");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleExportSelectedDeals = () => {
    const rows = deals.filter((d) => selectedDeals.includes(d._id));
    const header = ["Deal ID", "Deal Name", "Contact", "Stage", "Amount", "Last Updated"];
    const csvRows = rows.map((d) =>
      [
        `DL-${d._id.slice(-5).toUpperCase()}`,
        d.title || "",
        d.contact?.name || "",
        d.status || "",
        d.amount || 0,
        d.updatedAt ? new Date(d.updatedAt).toLocaleDateString("en-IN") : "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = [header.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "deals-export.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const [colWidths, setColWidths] = useState({
    dealId: 127,
    title: 185,
    contact: 150,
    stage: 131,
    amount: 123,
    lastUpdated: 171,
    actions: 56,
  });
  const [resizingCol, setResizingCol] = useState(null);
  const resizingRef = React.useRef(null);
  const totalTableWidth = useMemo(
    () => Object.values(colWidths).reduce((sum, w) => sum + w, 0),
    [colWidths],
  );

  // Single source of truth for column order (pinned-left, then unpinned in
  // drag order, then pinned-right) — shared by the header AND the body, so a
  // pinned/dragged column moves the data cells along with it instead of only
  // sliding the header label.
  const DEAL_COLS_BASE = useMemo(
    () => [
      { id: "dealId", label: "Deal ID", width: 127, sortable: false },
      { id: "title", label: "Deal Name", width: 185 },
      { id: "contact", label: "Contact", width: 150 },
      { id: "stage", label: "Stage", width: 131 },
      { id: "amount", label: "Amount", width: 123 },
      { id: "lastUpdated", label: "Last Updated", width: 171, sortable: false },
    ],
    [],
  );
  const orderedDealColumns = useMemo(() => {
    const allCols = DEAL_COLS_BASE.filter((col) => !hiddenColumns.includes(col.id));
    const orderRank = (id) => {
      const idx = columnOrder.indexOf(id);
      return idx === -1 ? columnOrder.length + allCols.findIndex((c) => c.id === id) : idx;
    };
    const rank = (id) => (getColumnPinSide(id) === "left" ? 0 : getColumnPinSide(id) === "right" ? 2 : 1);
    return allCols.slice().sort((a, b) => {
      const pinDiff = rank(a.id) - rank(b.id);
      if (pinDiff !== 0) return pinDiff;
      return orderRank(a.id) - orderRank(b.id);
    });
  }, [DEAL_COLS_BASE, hiddenColumns, columnOrder, pinnedColumns]);

  // Sticky offsets + boundary shadow — same treatment as the other Company
  // detail tabs (Contacts/Invoices/Meetings/Notes/Tasks): the selection
  // checkbox column is always the first left-sticky column (44px wide), and
  // the pinned boundary — the rightmost left-pinned column, or the leftmost
  // right-pinned one — gets the soft depth-edge shadow.
  const dealStickyStyles = useMemo(() => {
    const map = {};
    let leftOffset = 44;
    for (const col of orderedDealColumns) {
      if (getColumnPinSide(col.id) === "left") {
        map[col.id] = { position: "sticky", left: leftOffset, zIndex: 20 };
        leftOffset += colWidths[col.id] || col.width;
      }
    }
    let rightOffset = 0;
    for (const col of [...orderedDealColumns].reverse()) {
      if (getColumnPinSide(col.id) === "right") {
        map[col.id] = { position: "sticky", right: rightOffset, zIndex: 20 };
        rightOffset += colWidths[col.id] || col.width;
      }
    }
    return map;
  }, [orderedDealColumns, pinnedColumns, colWidths]);

  const getDealStickyStyle = (colId, isHeader) => {
    const pinSide = getColumnPinSide(colId);
    const style = dealStickyStyles[colId] || {};
    return {
      ...style,
      position: pinSide ? "sticky" : "relative",
      zIndex: pinSide ? (isHeader ? 35 : 20) : undefined,
      backgroundColor: pinSide ? (isHeader ? "#F5F7FA" : "#fff") : undefined,
      boxShadow: "inset -1px 0 0 #E1E4EA, inset 0 -1px 0 #E1E4EA",
    };
  };

  const getDealBoundaryShadowSide = (colId) => {
    const leftPinnedCols = orderedDealColumns.filter((c) => getColumnPinSide(c.id) === "left");
    const rightPinnedCols = orderedDealColumns.filter((c) => getColumnPinSide(c.id) === "right");
    if (leftPinnedCols.length > 0 && leftPinnedCols[leftPinnedCols.length - 1].id === colId) return "left";
    if (rightPinnedCols.length > 0 && rightPinnedCols[0].id === colId) return "right";
    return null;
  };

  const startResize = (e, colId) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { colId, startX: e.clientX, startWidth: colWidths[colId] };
    setResizingCol(colId);

    const onMouseMove = (moveEvent) => {
      if (!resizingRef.current) return;
      const { colId: id, startX, startWidth } = resizingRef.current;
      // clientX deltas arrive in real screen (zoomed/visual) pixels, but colWidths
      // are unscaled layout px rendered inside the zoomed #root (see getRootZoom
      // above) — divide the delta by zoom so the column edge tracks the cursor
      // 1:1 instead of lagging behind it under the 0.75 desktop zoom.
      const z = getRootZoom();
      const newWidth = Math.max(60, startWidth + (moveEvent.clientX - startX) / z);
      setColWidths((prev) => ({ ...prev, [id]: newWidth }));
    };

    const onMouseUp = () => {
      resizingRef.current = null;
      setResizingCol(null);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  useEffect(() => {
    const fetchStatuses = async () => {
      try {
        const res = await API.get("/kanban");
        setStatuses(res.data?.statuses || ["Open", "Won", "Lost"]);
      } catch (err) {
        console.error("Failed to load pipeline stages:", err);
        setStatuses(["Open", "Won", "Lost"]);
      }
    };
    fetchStatuses();
  }, []);

  const filteredDeals = useMemo(() => {
    let result = deals;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter((d) =>
        [
          `DL-${d._id.slice(-5).toUpperCase()}`,
          d.title,
          d.contact?.name,
          d.status,
          `₹${(d.amount || 0).toLocaleString("en-IN")}`,
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    }
    return applyColumnFilters(result, selectedFilters, getDealFieldValue);
  }, [deals, searchTerm, selectedFilters]);

  const sortedDeals = useMemo(() => {
    if (!sortConfig.key) return filteredDeals;
    const sorted = [...filteredDeals].sort((a, b) => {
      let aVal = getDealFieldValue(a, sortConfig.key);
      let bVal = getDealFieldValue(b, sortConfig.key);
      if (sortConfig.key === "amount") {
        aVal = a.amount || 0;
        bVal = b.amount || 0;
      } else if (sortConfig.key === "lastUpdated") {
        aVal = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        bVal = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      } else {
        aVal = (aVal || "").toString().toLowerCase();
        bVal = (bVal || "").toString().toLowerCase();
      }
      if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredDeals, sortConfig]);

  const totalCount = sortedDeals.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const startItem = totalCount === 0 ? 0 : (currentPage - 1) * limit + 1;
  const endItem = Math.min(currentPage * limit, totalCount);
  const hasPrevPage = currentPage > 1;
  const hasNextPage = currentPage < totalPages;

  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  const handleLimitChange = (newLimit) => {
    setLimit(newLimit);
    setCurrentPage(1);
  };

  // "Select All" grabs every deal matching the current search/filters (all
  // deals for this company are already loaded client-side, so this selects
  // the full filtered set, not only the current page). "Deselect All" is its
  // counterpart: it doesn't clear the selection outright — it steps back
  // down to only the rows on the current page.
  const handleSelectAllAcrossPages = () => {
    if (!hasBulkAccess) {
      setShowUpgradeModal(true);
      return;
    }
    setSelectedDeals(sortedDeals.map((d) => d._id));
  };

  const handleDeselectAllExtra = () => {
    setSelectedDeals(paginatedDeals.map((d) => d._id));
  };

  const paginatedDeals = useMemo(
    () => sortedDeals.slice((currentPage - 1) * limit, currentPage * limit),
    [sortedDeals, currentPage, limit],
  );

  const dealsByStatus = useMemo(() => {
    const map = {};
    statuses.forEach((s) => {
      map[s] = filteredDeals.filter((d) => {
        const status = (d.status || "Open");
        // While dragging, show the active card in whichever column it's
        // hovering over rather than its (still unchanged) real status.
        if (activeDeal && d._id.toString() === activeDeal._id.toString() && dragOverStatus) {
          return dragOverStatus === s;
        }
        return status === s;
      });
    });
    return map;
  }, [statuses, filteredDeals, activeDeal, dragOverStatus]);

  // Column membership WITHOUT the mid-drag override — this is what each
  // column's total-amount/trend banner reads, so it only changes once a
  // move is actually dropped, not the instant a card is dragged over it.
  const stableDealsByStatus = useMemo(() => {
    const map = {};
    statuses.forEach((s) => {
      map[s] = filteredDeals.filter((d) => (d.status || "Open") === s);
    });
    return map;
  }, [statuses, filteredDeals]);

  const isTerminal = (status, name) =>
    TERMINAL_STATUSES.includes((status || "").toLowerCase()) &&
    (status || "").toLowerCase() === name;

  // Memoized so a mid-drag `setDeals` (handleDragOver, on every column
  // crossing) doesn't force these aggregates to re-filter/re-reduce the full
  // deals array on every one of those renders — that recompute was riding
  // along with the drag gesture and contributing to the visible lag.
  const openDeals = useMemo(
    () =>
      deals.filter(
        (d) => !TERMINAL_STATUSES.includes((d.status || "Open").toLowerCase()),
      ),
    [deals],
  );
  const wonDeals = useMemo(
    () => deals.filter((d) => (d.status || "").toLowerCase() === "won"),
    [deals],
  );
  const lostDeals = useMemo(
    () => deals.filter((d) => (d.status || "").toLowerCase() === "lost"),
    [deals],
  );
  const pipelineValue = useMemo(
    () => openDeals.reduce((sum, d) => sum + (d.amount || 0), 0),
    [openDeals],
  );
  const avgDealSize = useMemo(
    () =>
      deals.length
        ? deals.reduce((sum, d) => sum + (d.amount || 0), 0) / deals.length
        : 0,
    [deals],
  );
  const avgClosingDays = useMemo(() => {
    const closed = deals.filter(
      (d) => (d.status || "").toLowerCase() === "won" && d.createdAt && d.updatedAt,
    );
    if (closed.length === 0) return 0;
    const totalDays = closed.reduce((sum, d) => {
      const days =
        (new Date(d.updatedAt) - new Date(d.createdAt)) / (1000 * 60 * 60 * 24);
      return sum + Math.max(days, 0);
    }, 0);
    return Math.round(totalDays / closed.length);
  }, [deals]);

  const kpiTiles = useMemo(
    () => [
      { label: "Open Deals", value: openDeals.length, icon: Gem },
      {
        label: "Pipeline Value",
        value: `₹${pipelineValue.toLocaleString("en-IN")}`,
        icon: Clock,
      },
      { label: "Won Deals", value: wonDeals.length, icon: WonDealIcon },
      { label: "Lost Deals", value: lostDeals.length, icon: LostDealIcon },
      {
        label: "Avg. Deal Size",
        value: `₹${Math.round(avgDealSize).toLocaleString("en-IN")}`,
        icon: AvgDealSizeIcon,
      },
      {
        label: "Avg. Closing Time",
        value: `${avgClosingDays}d`,
        icon: CalendarClockIcon,
      },
    ],
    [openDeals, wonDeals, lostDeals, pipelineValue, avgDealSize, avgClosingDays],
  );

  // `over.id` is a column id when hovering the column body, but another deal's id
  // when hovering a card — sortable items are droppables too. Both handlers below
  // need the same resolution, so it lives in one place.
  const resolveDropStatus = (overId) => {
    if (!overId) return null;
    const id = overId.toString();
    if (statuses.includes(id)) return id;
    const overDeal = deals.find((d) => d._id.toString() === id);
    return overDeal ? overDeal.status || "Open" : null;
  };

  const handleDragStart = ({ active }) => {
    const deal = deals.find((d) => d._id.toString() === active.id.toString());
    // Shallow COPY, not a reference — the snapshot is the only record of the
    // pre-drag status (used for persistence and rollback), independent of
    // whatever `deals` looks like by drop time.
    setActiveDeal(deal ? { ...deal } : null);
    setDragOverStatus(null);
    dragZoomRef.current = getAncestorZoom(document.getElementById("root"));
  };

  // Optimistically move the deal into the hovered column mid-drag. This used
  // to write the new status into `deals` (owned by the parent page) on every
  // crossing, which forced a full re-render of the parent and this entire
  // tab per crossing — that's what made dragging feel laggy. Tracking it as
  // local `dragOverStatus` instead keeps that re-render scoped to this
  // component, and `dealsByStatus` reads it to show the card in the hovered
  // column without touching the real data until drop.
  const handleDragOver = ({ active, over }) => {
    if (!over) return;
    const activeId = active.id.toString();
    if (activeId === over.id.toString()) return;

    const dragged = deals.find((d) => d._id.toString() === activeId);
    if (!dragged) return;

    const overStatus = resolveDropStatus(over.id);
    if (!overStatus) return;
    // Back over the origin column: clear the override so it renders normally.
    setDragOverStatus(overStatus === (dragged.status || "Open") ? null : overStatus);
  };

  const handleDragCancel = () => {
    setActiveDeal(null);
    setDragOverStatus(null);
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    const dragged = activeDeal;
    setActiveDeal(null);
    setDragOverStatus(null);
    if (!over || !dragged) return;

    const dealId = active.id.toString();
    const newStatus = resolveDropStatus(over.id);
    const oldStatus = dragged.status || "Open";
    if (!newStatus || newStatus === oldStatus) return;

    setDeals((prev) =>
      prev.map((d) => (d._id.toString() === dealId ? { ...d, status: newStatus } : d)),
    );

    try {
      const response = await API.post(`/deals/${dealId}/status`, { oldStatus, newStatus });
      const updatedDeal = response.data || { ...dragged, status: newStatus };
      setDeals((prev) =>
        prev.map((d) => (d._id.toString() === dealId ? updatedDeal : d)),
      );
      if (newStatus === "Won" && oldStatus !== "Won") {
        setCelebrationDeal(updatedDeal);
        toast.success(`🎉 ${updatedDeal.title} marked as Won!`, { duration: 5000, icon: "🏆" });
      } else {
        toast.success("Deal status updated");
      }
    } catch (err) {
      console.error("Failed to update deal status:", err);
      toast.error("Failed to update deal status");
      setDeals((prev) =>
        prev.map((d) =>
          d._id.toString() === dealId ? { ...d, status: oldStatus } : d,
        ),
      );
    }
  };

  const handleDealCreated = async () => {
    try {
      const res = await API.get("/deals");
      setDeals(res.data.filter((d) => d.company?._id === companyId));
      toast.success("Deal created successfully!");
    } catch (err) {
      toast.error("Failed to refresh deals list.");
    }
    closeDealForm();
  };

  const ConfettiCelebration = ({ deal, onClose }) => {
    useEffect(() => {
      const animationEnd = Date.now() + 5000;
      confetti({ particleCount: 150, spread: 180, origin: { y: 0.6 }, zIndex: 99999 });
      const interval = setInterval(() => {
        if (Date.now() > animationEnd) { clearInterval(interval); return; }
        confetti({ particleCount: 2, angle: 90 + (Math.random() - 0.5) * 60, spread: 80, origin: { x: Math.random(), y: Math.random() * 0.5 }, gravity: 0.4, ticks: 400, zIndex: 99999 });
      }, 100);
      const timeout = setTimeout(onClose, 5000);
      return () => { clearInterval(interval); clearTimeout(timeout); };
    }, [onClose]);

    return (
      <div className="fixed inset-0 flex items-center justify-center z-[99998] pointer-events-none p-4">
        <div className="absolute inset-0 bg-black/5 pointer-events-auto" onClick={onClose} />
        <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 pointer-events-auto max-w-md w-full relative z-[99999]">
          <div className="p-10 text-center">
            <div className="flex justify-center mb-6">
              <div className="bg-green-500 rounded-full w-16 h-16 flex items-center justify-center shadow-lg">
                <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Deal Won!</h2>
            <p className="text-base text-gray-700 mb-3 font-medium">{deal.title}</p>
            <div className="mb-6">
              <h6 className="text-2xl font-bold text-gray-900">₹{formatNumberToIndian(parseInt(deal.amount || 0))}</h6>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">Great job! Keep up the amazing work! 💪</p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      {celebrationDeal && (
        <ConfettiCelebration deal={celebrationDeal} onClose={() => setCelebrationDeal(null)} />
      )}
      {/* KPI Tiles */}
      {showStats && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => <StatTileSkeleton key={i} />)
              : kpiTiles.map((tile) => (
                <StatTile key={tile.label} tile={tile} />
              ))}
          </div>

          <div className="-mx-6" style={{ marginTop: 24, paddingBottom: 24, borderTop: "1px solid #E1E4EA" }} />
        </>
      )}

      {/* Search + Controls (replaced by a bulk-actions strip when rows are selected) */}
      {isLoading ? (
        <div className="flex items-center gap-4 mb-4" style={{ height: "44px" }}>
          <Skeleton width="100%" height={44} shape="rounded" className="!rounded-full flex-1" />
          <Skeleton width={90} height={44} shape="rounded" className="!rounded-full flex-shrink-0" />
          <Skeleton width={88} height={44} shape="rounded" className="!rounded-full flex-shrink-0" />
          <Skeleton width={44} height={44} shape="circle" className="flex-shrink-0" />
        </div>
      ) : showBulkStrip ? (
        <BulkActionBar
          isClosing={bulkStripClosing}
          selectedCount={selectedDeals.length}
          entityName="deal"
          onAddNote={() => setBulkAddMode("note")}
          onAddTask={() => setBulkAddMode("task")}
          onSelectAll={handleSelectAllAcrossPages}
          // The board shows every deal at once (no pagination), so "Deselect
          // All" there clears the whole selection. In list view it keeps the
          // two-tier behaviour: step back down to just the current page's rows.
          onDeselectAll={viewMode === "board" ? () => setSelectedDeals([]) : handleDeselectAllExtra}
          onExport={handleExportSelectedDeals}
          onUpdateStatus={() => setShowBulkStatusModal(true)}
          onDelete={() => setShowBulkDeleteModal(true)}
          onCancel={() => setSelectedDeals([])}
        />
      ) : (
        <div className="flex items-center gap-4 mb-4" style={{ height: "44px" }}>
          <div className="relative flex-1 h-full">
            <SearchIcon
              className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#525866]"
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search deals by name, contact, or status..."
              className="w-full h-full pl-10 pr-10 border border-[rgba(31,41,55,0.1)] rounded-full text-sm focus:outline-none focus:border-[#0085FF]"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-900 focus:outline-none"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilterPanel(true)}
            className="relative flex items-center justify-center gap-2 px-3 text-sm font-medium text-gray-800 bg-white border rounded-full hover:bg-gray-50 flex-shrink-0"
            style={{
              height: "44px",
              borderColor: Object.values(selectedFilters).flat().length > 0 ? "#0085FF" : "#E1E4EA",
            }}
          >
            <FilterIcon size={16} />
            Filter
            {Object.values(selectedFilters).flat().length > 0 && (
              <span className="absolute -top-2 -right-2 bg-blue-600 text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full ring-2 ring-white">
                {Object.values(selectedFilters).flat().length}
              </span>
            )}
          </button>
          <div className="relative flex items-center gap-1.5 p-1 bg-[#F1F1F5] rounded-full flex-shrink-0 overflow-hidden" style={{ height: "44px" }}>
            <span
              className="absolute top-1 w-9 h-9 rounded-full bg-white shadow-[0px_4px_4px_rgba(0,0,0,0.1)] transition-all duration-300 ease-out pointer-events-none"
              style={{ left: viewMode === "board" ? 46 : 4 }}
            />
            <button
              onClick={() => setViewMode("list")}
              className={`relative z-10 w-9 h-9 flex items-center justify-center rounded-full transition-colors ${viewMode === "list" ? "text-blue-600" : "text-gray-500"
                }`}
            >
              <TableViewIcon size={16} className="text-current" />
            </button>
            <button
              onClick={() => setViewMode("board")}
              className={`relative z-10 w-9 h-9 flex items-center justify-center rounded-full transition-colors ${viewMode === "board" ? "text-blue-600" : "text-gray-500"
                }`}
            >
              <KanbanViewIcon size={16} className="text-current" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => { setInitialDealStatus("Open"); setManualDealFormOpen(true); }}
            className="flex items-center justify-center rounded-full border hover:bg-gray-50 flex-shrink-0"
            style={{ width: "44px", height: "44px", borderColor: "#E1E4EA" }}
            title="Add Deal"
          >
            <PlusIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {showDealForm && (
        <QuickDealForm
          companies={company ? [company] : []}
          contacts={contacts}
          initialCompanyId={companyId}
          initialStatus={initialDealStatus}
          onDealCreated={handleDealCreated}
          onRequestClose={closeDealForm}
        />
      )}

      <CompanyFilterPanel
        isOpen={showFilterPanel}
        onClose={() => setShowFilterPanel(false)}
        columns={DEAL_FILTER_COLUMNS(statuses)}
        data={deals}
        getFieldValue={getDealFieldValue}
        selected={selectedFilters}
        onApply={setSelectedFilters}
        title="Filter Deals"
        subtitle="Filter this list by column"
      />

      {viewMode === "board" ? (
        isLoading || statuses.length === 0 ? (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {(statuses.length ? statuses : ["Open", "Won", "Lost"]).map((status) => (
              <div key={status} className="w-[340px] flex-shrink-0 rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="flex items-center justify-between px-[18px]" style={{ height: 46, background: "#F5F7FA" }}>
                  <div className="flex items-center gap-1.5">
                    <Skeleton width={60} height={12} />
                    <Skeleton shape="circle" width={20} height={20} />
                  </div>
                  <Skeleton shape="circle" width={14} height={14} />
                </div>
                <div className="px-[18px] pt-5">
                  <Skeleton width="100%" height={67} shape="rect" className="rounded-[10px]" />
                </div>
                <div className="flex flex-col items-start gap-3.5 px-[18px] py-5">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <DealCardSkeleton key={i} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            measuring={DND_MEASURING}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <div className="flex gap-4 overflow-x-auto pb-2" style={{ "--kanban-top-offset": "16rem" }}>
              {statuses.map((status) => (
                <KanbanColumn
                  key={status}
                  status={status}
                  deals={dealsByStatus[status] || []}
                  amountDeals={stableDealsByStatus[status] || []}
                  totalDealsCount={totalCount}
                  colorTheme={status === "Won" ? "green" : status === "Lost" ? "red" : "blue"}
                  onAddClick={handleAddDealClick}
                  selectedDeals={selectedDeals}
                  onToggleSelect={handleSelectDeal}
                  onToggleColumnSelect={handleToggleColumnSelect}
                  setDealToDelete={setDealToDelete}
                />
              ))}
            </div>

            {/* Floating preview that tracks the cursor. Rendered as a plain div, never
              a <Link>, so it can't navigate or capture clicks.

              PORTALED TO document.body ON PURPOSE. #root carries `zoom: 0.75`, and
              CSS `zoom` makes #root the containing block for position:fixed. dnd-kit
              positions the overlay from getBoundingClientRect() (visual px) and then
              applies a translate — but painted inside #root both get multiplied by
              0.75, so the card drifts above the cursor, increasingly so the further
              you drag. document.body sits outside that zoom, so the coordinates line
              up 1:1. createPortal keeps the React tree (and DndContext) intact.

              The inner wrapper re-applies the same zoom, because dnd-kit sizes the
              overlay to the source card's VISUAL rect (225x99, not 300x132) — without
              it the floating card would render a third larger than the real ones. */}
            {createPortal(
              <DragOverlay dropAnimation={null}>
                {activeDeal ? (
                  <div style={{ zoom: dragZoomRef.current }}>
                    <DealCardOverlay deal={activeDeal} />
                  </div>
                ) : null}
              </DragOverlay>,
              document.body,
            )}
          </DndContext>
        )
      ) : !isLoading && deals.length === 0 ? (
        <div className="flex flex-col items-center justify-center w-full min-h-[300px] bg-gray-50 border border-gray-200 rounded-xl text-gray-500">
          <Handshake size={28} className="mb-3 text-gray-400" />
          <button
            type="button"
            onClick={() => { setInitialDealStatus("Open"); setManualDealFormOpen(true); }}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-[#0085FF] text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            Add new deal
          </button>
        </div>
      ) : (
        <>
          {/* overflow-hidden is what makes the 8px radius actually clip: the
              border sits on this wrapper while the scrolling happens in the
              child below, so without it the rows (and the sticky cells in
              particular) paint straight over the rounded corners and past the
              left edge. The other tab tables put the border on the scroll
              container itself, which clips for free. */}
          <div
            className="box-border flex flex-col items-stretch bg-white self-stretch overflow-hidden"
            style={{ border: "1px solid #E1E4EA", borderRadius: "8px" }}
          >
            <div ref={fillContainerRef} style={fillStyle} className="w-full overflow-x-auto overflow-y-auto">
              <table
                className="text-sm text-left border-separate"
                style={{ tableLayout: "fixed", width: "100%", minWidth: totalTableWidth, maxWidth: "100%", borderSpacing: 0 }}
              >
                <thead className="bg-[#F5F7FA] border-b border-[#E1E4EA] sticky top-0 z-30">
                  <tr>
                    {/* Page-scoped select-all: ticks exactly the rows on the CURRENT page
                        (10 per page -> 10, 50 -> 50). Distinct from the bulk strip's
                        "Select All", which spans every record across all pages. */}
                    <th style={{ width: 44, height: 56 }} className="px-3 py-2.5 border-r border-b border-[#E1E4EA]">
                      <div className="flex justify-center items-center w-full">
                        <Checkbox checked={selectedDeals.length > 0 && selectedDeals.length === paginatedDeals.length} onChange={handleSelectAllDeals}  uncheckedColor="text-[#525866]"/>
                      </div>
                    </th>
                    {(() => {
                      const fallbackOrder = orderedDealColumns.map((c) => c.id);
                      return orderedDealColumns
                        .map((col) => {
                          const isMenuOpen = openColMenuKey === col.id;
                          const pinSide = getColumnPinSide(col.id);
                          const isDragging = draggedColKey === col.id;
                          const isDragOver = dragOverColKey === col.id && draggedColKey && draggedColKey !== col.id;
                          const boundarySide = getDealBoundaryShadowSide(col.id);
                          return (
                            <th
                              key={col.id}
                              data-col-id={col.id}
                              onMouseDown={(e) => startColumnDrag(e, col.id, col.label, fallbackOrder)}
                              style={{ width: colWidths[col.id], height: 56, opacity: isDragging ? 0.35 : 1, ...getDealStickyStyle(col.id, true) }}
                              className={`px-3 py-2.5 font-medium text-[#525866] text-xs cursor-grab active:cursor-grabbing transition-colors ${isDragOver ? "bg-blue-100" : "bg-[#F5F7FA]"}`}
                            >
                              <div className="flex items-center justify-between w-full group">
                                {/* Not clickable — a plain click on the header does nothing now.
                                    Sorting lives only in the column menu (Sort Ascending/Descending
                                    below), which is what handleSort's direction argument is for. */}
                                <div className="flex items-center gap-1.5 flex-1 overflow-hidden select-none">
                                  {col.icon && <col.icon className="w-3.5 h-3.5 flex-shrink-0" />}
                                  <span className="truncate">{col.label}</span>
                                  {sortConfig.key === col.id && (sortConfig.direction === "asc"
                                    ? <ArrowUp className="w-3 h-3 text-[#0085FF] flex-shrink-0" />
                                    : <ArrowDown className="w-3 h-3 text-[#0085FF] flex-shrink-0" />)}
                                  {pinSide && (
                                    <Pin
                                      size={12}
                                      className="text-blue-500 fill-blue-500 flex-shrink-0 ml-1"
                                      style={{ transform: "rotate(45deg)" }}
                                    />
                                  )}
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isMenuOpen) {
                                      setOpenColMenuKey(null);
                                      setColMenuPos(null);
                                      return;
                                    }
                                    // rect is VISUAL px; the menu is portaled into document.body,
                                    // which paints inside the dynamic <html> zoom, so rect-derived
                                    // values must be divided by that zoom to line up with the button.
                                    const zMenu = getAncestorZoom(document.body);
                                    const MENU_W = 190;
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    let calcLeft = rect.right / zMenu - MENU_W;
                                    calcLeft = Math.min(calcLeft, window.innerWidth / zMenu - MENU_W - 8);
                                    calcLeft = Math.max(calcLeft, 8);
                                    setColMenuPos({ top: rect.bottom / zMenu + 4, left: calcLeft });
                                    setOpenColMenuKey(col.id);
                                  }}
                                  className="ml-1 p-1 rounded hover:bg-gray-200 transition-colors text-gray-500 flex-shrink-0"
                                  title="Column options"
                                >
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </button>

                                {isMenuOpen && colMenuPos && createPortal(
                                  <>
                                    <div className="fixed inset-0 z-[9998]" onClick={() => { setOpenColMenuKey(null); setColMenuPos(null); }} />
                                    <div
                                      ref={colMenuRef}
                                      style={{ position: "fixed", top: colMenuPos.top, left: colMenuPos.left }}
                                      className="w-[160px] z-[9999] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5 animate-in fade-in zoom-in duration-150 origin-top-right"
                                    >
                                      <button
                                        onClick={() => {
                                          setOpenColMenuKey(null);
                                          setColMenuPos(null);
                                          pinSide === "left" ? unpinColumn(col.id) : pinColumnToSide(col.id, "left");
                                        }}
                                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${pinSide === "left" ? "bg-blue-50 text-blue-700" : "text-[#161618] hover:bg-gray-50"}`}
                                      >
                                        {pinSide === "left" ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5 text-[#1C1B1F]" />}
                                        Pin to Left
                                      </button>
                                      <button
                                        onClick={() => {
                                          setOpenColMenuKey(null);
                                          setColMenuPos(null);
                                          pinSide === "right" ? unpinColumn(col.id) : pinColumnToSide(col.id, "right");
                                        }}
                                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${pinSide === "right" ? "bg-blue-50 text-blue-700" : "text-[#161618] hover:bg-gray-50"}`}
                                      >
                                        {pinSide === "right" ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5 text-[#1C1B1F]" />}
                                        Pin to Right
                                      </button>

                                      {col.sortable !== false && (
                                        <>
                                          <button
                                            onClick={() => {
                                              setOpenColMenuKey(null);
                                              setColMenuPos(null);
                                              handleSort(col.id, "asc");
                                            }}
                                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                                          >
                                            <ChevronUp className="w-3.5 h-3.5 text-[#1C1B1F]" />
                                            Sort Ascending
                                          </button>
                                          <button
                                            onClick={() => {
                                              setOpenColMenuKey(null);
                                              setColMenuPos(null);
                                              handleSort(col.id, "desc");
                                            }}
                                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                                          >
                                            <ChevronDown className="w-3.5 h-3.5 text-[#1C1B1F]" />
                                            Sort Descending
                                          </button>
                                        </>
                                      )}

                                      <div className="w-full border-t border-[#F1F1F5] my-0.5" />

                                      <button
                                        onClick={() => {
                                          setOpenColMenuKey(null);
                                          setColMenuPos(null);
                                          hideColumn(col.id);
                                        }}
                                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                                      >
                                        <EyeOff className="w-3.5 h-3.5 text-[#1C1B1F]" />
                                        Hide Column
                                      </button>
                                    </div>
                                  </>,
                                  document.body,
                                )}
                              </div>

                              <div
                                data-resize-handle="true"
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                  startResize(e, col.id);
                                }}
                                className={`absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none hover:bg-blue-400 z-10 ${resizingCol === col.id ? "bg-blue-500" : "bg-transparent"
                                  }`}
                              />
                              {boundarySide && <div style={getPinnedBoundaryOverlayStyle(boundarySide)} />}
                            </th>
                          );
                        });
                    })()}
                  </tr>
                </thead>
                {/* Row dividers live on the CELLS (border-b), not on <tr>: this table is
                    `border-separate`, and the separated-borders model ignores borders set
                    on rows/row-groups — so a `divide-y` here would paint nothing. Matches
                    the Contacts/Tasks tables, which draw both lines per cell. */}
                <tbody className="bg-white">
                  {paginatedDeals.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-gray-500 font-medium">
                        No deals found.
                      </td>
                    </tr>
                  ) : (
                    paginatedDeals.map((deal) => {
                      const lastUpdated = deal.updatedAt
                        ? new Date(deal.updatedAt).toLocaleDateString("en-US", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })
                        : "—";
                      const pillStyle =
                        deal.status === "Won"
                          ? { backgroundColor: "rgba(0, 201, 80, 0.1)", color: "#00A63E" }
                          : deal.status === "Lost"
                            ? { backgroundColor: "rgba(232, 34, 34, 0.1)", color: "#E82222" }
                            : { backgroundColor: "rgba(0, 133, 255, 0.1)", color: "#0085FF" };
                      const isActionsOpen = openRowActionsId === deal._id;
                      const dealIdShort = `DL-${deal._id.slice(-5).toUpperCase()}`;
                      const isSelected = selectedDeals.includes(deal._id);
                      return (
                        <tr key={deal._id} className={`hover:bg-gray-50 transition-colors group ${isSelected ? "!bg-blue-50" : ""}`}>
                          <td style={{ height: 54, width: 44 }} className="px-3 border-r border-b border-[#E1E4EA]">
                            <div className="flex justify-center items-center w-full">
                              <Checkbox checked={isSelected} onChange={() => handleSelectDeal(deal._id)} />
                            </div>
                          </td>
                          {(() => {
                            const lastColId = orderedDealColumns[orderedDealColumns.length - 1]?.id;
                            const dealActionsMenu = (
                              <div className="relative flex items-center justify-center flex-shrink-0" onMouseDown={(e) => e.stopPropagation()}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isActionsOpen) {
                                      setOpenRowActionsId(null);
                                      setRowActionsPos(null);
                                      return;
                                    }
                                    // Was anchored to the raw click coordinates
                                    // (e.clientX/Y) with no zoom correction — so
                                    // `left: e.clientX - 160` drifted further left
                                    // the further right on the button you happened
                                    // to click, and drifted again under this app's
                                    // dynamic zoom. Same fix as the main Deals
                                    // table: anchor to the button's own rect,
                                    // divide by ancestor zoom (the menu portals to
                                    // document.body, which paints inside the zoom),
                                    // center vertically on the row rather than
                                    // hanging off its bottom edge, and clamp both
                                    // axes to the viewport.
                                    const zMenu = getAncestorZoom(document.body);
                                    const MENU_W = 160;
                                    const MENU_H = 110; // View Deal + Edit Deal + divider + Delete Deal
                                    const MARGIN = 8;

                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const viewportH = window.innerHeight / zMenu;
                                    const viewportW = window.innerWidth / zMenu;

                                    const rowCenter = (rect.top + rect.bottom) / (2 * zMenu);
                                    let calcTop = rowCenter - MENU_H / 2;
                                    calcTop = Math.max(MARGIN, Math.min(calcTop, viewportH - MENU_H - MARGIN));

                                    let calcLeft = rect.right / zMenu - MENU_W - 12;
                                    calcLeft = Math.min(calcLeft, viewportW - MENU_W - MARGIN);
                                    calcLeft = Math.max(calcLeft, MARGIN);

                                    setRowActionsPos({ top: calcTop, left: calcLeft });
                                    setOpenRowActionsId(deal._id);
                                  }}
                                  className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                                  title="More actions"
                                >
                                  <MoreIcon className="w-4 h-4" />
                                </button>
                                {isActionsOpen && rowActionsPos && createPortal(
                                  <>
                                    <div className="fixed inset-0 z-[9998]" onClick={() => { setOpenRowActionsId(null); setRowActionsPos(null); }} />
                                    <div
                                      ref={rowActionsRef}
                                      style={{ position: "fixed", top: rowActionsPos.top, left: rowActionsPos.left }}
                                      className="w-[160px] z-[9999] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5 animate-in fade-in zoom-in duration-150 origin-top-right"
                                    >
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setOpenRowActionsId(null);
                                          setRowActionsPos(null);
                                          navigate(`/deals/${deal._id}`);
                                        }}
                                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                                      >
                                        <EyeIcon className="w-3.5 h-3.5 text-[#1C1B1F]" />
                                        View Deal
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setOpenRowActionsId(null);
                                          setRowActionsPos(null);
                                          navigate(`/deals/${deal._id}`);
                                        }}
                                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                                      >
                                        <EditIcon className="w-3.5 h-3.5 text-[#1C1B1F]" />
                                        Edit Deal
                                      </button>
                                      <div className="w-full border-t border-[#F1F1F5] my-0.5" />
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setOpenRowActionsId(null);
                                          setRowActionsPos(null);
                                          setDealToDelete(deal);
                                        }}
                                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-red-600 hover:bg-red-50 whitespace-nowrap"
                                      >
                                        <DeleteIcon className="w-3.5 h-3.5" />
                                        Delete Deal
                                      </button>
                                    </div>
                                  </>,
                                  document.body,
                                )}
                              </div>
                            );

                            return orderedDealColumns.map((col) => {
                              const boundarySide = getDealBoundaryShadowSide(col.id);
                              const boundaryOverlay = boundarySide && <div style={getPinnedBoundaryOverlayStyle(boundarySide)} />;
                              const isLastCol = col.id === lastColId;

                              if (col.id === "dealId") {
                                return (
                                  <td
                                    key={col.id}
                                    style={{ height: 54, ...getDealStickyStyle(col.id, false) }}
                                    className="px-3 text-[14px] leading-5 font-medium text-[#525866] whitespace-nowrap text-left"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <HighlightText text={dealIdShort} query={searchTerm} />
                                      {isLastCol && dealActionsMenu}
                                    </div>
                                    {boundaryOverlay}
                                  </td>
                                );
                              }
                              if (col.id === "title") {
                                return (
                                  <td key={col.id} style={{ height: 54, ...getDealStickyStyle(col.id, false) }} className="px-3 text-left">
                                    <div className="flex items-center justify-between gap-2">
                                      <Link
                                        to={`/deals/${deal._id}`}
                                        className="text-[14px] leading-5 font-medium text-[#222530] hover:text-blue-600 truncate block min-w-0"
                                      >
                                        <HighlightText text={deal.title || "Deal Name"} query={searchTerm} />
                                      </Link>
                                      {isLastCol && dealActionsMenu}
                                    </div>
                                    {boundaryOverlay}
                                  </td>
                                );
                              }
                              if (col.id === "contact") {
                                return (
                                  <td
                                    key={col.id}
                                    style={{ height: 54, ...getDealStickyStyle(col.id, false) }}
                                    className="px-3 text-[14px] leading-5 font-medium text-[#222530] text-left"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="truncate block min-w-0">
                                        <HighlightText text={deal.contact?.name || "-"} query={searchTerm} />
                                      </span>
                                      {isLastCol && dealActionsMenu}
                                    </div>
                                    {boundaryOverlay}
                                  </td>
                                );
                              }
                              if (col.id === "stage") {
                                return (
                                  <td key={col.id} style={{ height: 54, ...getDealStickyStyle(col.id, false) }} className="px-3">
                                    <div className="flex items-center justify-between gap-2">
                                      <span
                                        style={{ width: 80, height: 24, padding: "5px 12px", borderRadius: 53, ...pillStyle }}
                                        className="inline-flex items-center justify-center text-xs font-medium"
                                      >
                                        <HighlightText text={deal.status || "Open"} query={searchTerm} />
                                      </span>
                                      {isLastCol && dealActionsMenu}
                                    </div>
                                    {boundaryOverlay}
                                  </td>
                                );
                              }
                              if (col.id === "amount") {
                                return (
                                  <td
                                    key={col.id}
                                    style={{ height: 54, ...getDealStickyStyle(col.id, false) }}
                                    className="px-3 text-[14px] leading-5 font-medium text-[#525866] whitespace-nowrap text-left"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <HighlightText text={`₹${(deal.amount || 0).toLocaleString("en-IN")}`} query={searchTerm} />
                                      {isLastCol && dealActionsMenu}
                                    </div>
                                    {boundaryOverlay}
                                  </td>
                                );
                              }
                              // lastUpdated
                              return (
                                <td
                                  key={col.id}
                                  style={{ height: 54, ...getDealStickyStyle(col.id, false) }}
                                  className="px-3 text-[14px] leading-5 font-medium text-[#525866] whitespace-nowrap"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <HighlightText text={lastUpdated} query={searchTerm} />
                                    {isLastCol && dealActionsMenu}
                                  </div>
                                  {boundaryOverlay}
                                </td>
                              );
                            });
                          })()}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {dragGhost && createPortal(
              <div
                ref={ghostElRef}
                style={{
                  position: "fixed",
                  top: -9999,
                  left: -9999,
                  width: dragGhost.width,
                  zIndex: 10000,
                  pointerEvents: "none",
                }}
                className="flex flex-col bg-white rounded-lg shadow-2xl overflow-hidden"
              >
                <div className="px-3 py-3 bg-[#F5F7FA] border-b border-[#E1E4EA]" style={{ height: dragGhost.height }}>
                  <span className="text-sm font-bold text-[#525866] truncate block">{dragGhost.label}</span>
                </div>
                {dragGhost.previewRows.map((rowVal, i) => (
                  <div key={i} className="px-3 py-2 border-b border-[#F1F1F5] last:border-b-0">
                    <span className="text-sm text-gray-700 truncate block">{rowVal}</span>
                  </div>
                ))}
              </div>,
              document.body,
            )}

          </div>

          {totalCount > 0 && viewMode === "list" && (
            <div
              ref={fillFooterRef}
              className="w-full bg-transparent px-4 py-3 mt-3 flex items-center justify-between sm:px-6"
            >
              <div className="flex-1 flex justify-between sm:hidden">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={!hasPrevPage}
                  className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={!hasNextPage}
                  className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>

              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div className="flex items-center space-x-2">
                  <p className="text-sm text-gray-700 font-inter">
                    Showing <span className="font-semibold">{startItem}</span> to{" "}
                    <span className="font-semibold">{endItem}</span> of{" "}
                    <span className="font-semibold">{totalCount}</span> results
                  </p>
                  <select
                    value={limit}
                    onChange={(e) => handleLimitChange(parseInt(e.target.value))}
                    className="ml-2 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer font-inter"
                  >
                    <option value={10}>10 per page</option>
                    <option value={20}>20 per page</option>
                    <option value={50}>50 per page</option>
                    <option value={100}>100 per page</option>
                  </select>
                </div>

                <EditablePaginationButtons
                  currentPage={currentPage}
                  totalPages={totalPages}
                  hasPrevPage={hasPrevPage}
                  hasNextPage={hasNextPage}
                  onPageChange={handlePageChange}
                  getPageNumbers={() => {
                    const items = [1];
                    if (currentPage > 2) items.push("left-dots");
                    if (currentPage !== 1 && currentPage !== totalPages) items.push(currentPage);
                    if (currentPage < totalPages - 1) items.push("right-dots");
                    if (totalPages > 1) items.push(totalPages);
                    return items;
                  }}
                />
              </div>
            </div>
          )}
        </>
      )}

      {showBulkDeleteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10005] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <DeleteIcon className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2 font-sf">Confirm Delete</h3>
              <p className="text-sm text-gray-500 font-inter mb-6">
                Delete {selectedDeals.length} selected deal{selectedDeals.length !== 1 ? "s" : ""}? This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setShowBulkDeleteModal(false)}
                  disabled={bulkLoading}
                  className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkDeleteDeals}
                  disabled={bulkLoading}
                  className="px-5 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors shadow-sm disabled:opacity-50"
                >
                  {bulkLoading ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showBulkStatusModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10005] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden">
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-1 font-sf">Bulk Update Stage</h3>
              <p className="text-sm text-gray-500 font-inter mb-4">
                Set stage for {selectedDeals.length} selected deal{selectedDeals.length !== 1 ? "s" : ""}.
              </p>
              <select
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-6"
              >
                {(statuses.length ? statuses : ["Open", "Won", "Lost"]).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowBulkStatusModal(false)}
                  disabled={bulkLoading}
                  className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkUpdateDealStatus}
                  disabled={bulkLoading}
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
                >
                  {bulkLoading ? "Updating..." : "Update"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Add Note / Add Task — one modal, driven by bulkAddMode. */}
      {bulkAddMode && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10005] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden">
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-1 font-sf">
                {bulkAddMode === "note" ? "Add Note" : "Add Task"}
              </h3>
              <p className="text-sm text-gray-500 font-inter mb-4">
                {bulkAddMode === "note"
                  ? `Adds this note to ${selectedDeals.length} selected deal${selectedDeals.length !== 1 ? "s" : ""}.`
                  : `Creates this task on ${selectedDeals.length} selected deal${selectedDeals.length !== 1 ? "s" : ""}.`}
              </p>

              {bulkAddMode === "note" ? (
                <textarea
                  rows={4}
                  value={bulkNoteText}
                  onChange={(e) => setBulkNoteText(e.target.value)}
                  placeholder="Write a note…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y mb-6"
                  autoFocus
                />
              ) : (
                <div className="space-y-3 mb-6">
                  <input
                    type="text"
                    value={bulkTaskTitle}
                    onChange={(e) => setBulkTaskTitle(e.target.value)}
                    placeholder="Task title"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                  <textarea
                    rows={3}
                    value={bulkTaskDesc}
                    onChange={(e) => setBulkTaskDesc(e.target.value)}
                    placeholder="Description (optional)"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                  />
                </div>
              )}

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setBulkAddMode(null)}
                  disabled={bulkLoading}
                  className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={bulkAddMode === "note" ? handleBulkAddNote : handleBulkAddTask}
                  disabled={bulkLoading}
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
                >
                  {bulkLoading ? "Saving..." : bulkAddMode === "note" ? "Add Note" : "Add Task"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {dealToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10005] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <DeleteIcon className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2 font-sf">
                Confirm Delete
              </h3>
              <p className="text-sm text-gray-500 font-inter mb-6">
                Delete deal "{dealToDelete.title || "Deal"}"? This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setDealToDelete(null)}
                  disabled={deletingDeal}
                  className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteDealConfirmed}
                  disabled={deletingDeal}
                  className="px-5 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors shadow-sm disabled:opacity-50"
                >
                  {deletingDeal ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <UpgradeRequiredModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        minPlan="growth"
        feature="Selecting multiple rows"
      />
    </div>
  );
}
