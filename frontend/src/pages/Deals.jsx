import DeleteIcon from "../components/common/DeleteIcon";
import BulkDeleteModal from "../components/common/BulkDeleteModal";
import { exportRecordsToCSV } from "../utils/exportRecordsToCSV";
import AvgDealSizeIcon from "../components/common/AvgDealSizeIcon";
import WonDealIcon from "../components/common/WonDealIcon";
import LostDealIcon from "../components/common/LostDealIcon";
import VideoIcon from "../components/common/VideoIcon";
import Checkbox from "../components/common/Checkbox";
import PlusIcon from "../components/common/PlusIcon";
import MoreIcon from "../components/common/MoreIcon";
import DownloadIcon from "../components/common/DownloadIcon";
import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { getAncestorZoom } from "../utils/domUtils";
import useSearchOverlayOpen from "../hooks/useSearchOverlayOpen";
import API from "../services/api";
import { useTopLoadingSignal } from "../components/common/TopLoadingBar";
import { formatNumberToIndian } from "../utils/numberFormatter";
import FilterIcon from "../components/common/FilterIcon";
import AdvancedFilterPanel from "../components/common/AdvancedFilterPanel";
import { applyAdvancedFilters } from "../utils/advancedFilters";
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  pointerWithin,
  rectIntersection,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from "@dnd-kit/core";
import {
  sortableKeyboardCoordinates,
  useSortable,
  SortableContext,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { autoTable } from "jspdf-autotable";
import QuickDealForm from "../components/deal/QuickDealForm";
import ImportDeals from "../components/deal/ImportDeals";
import BulkActions from "../components/BulkActions";
import logo from "/DataCircles.png";
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  Tag,
  IndianRupee,
  Building2,
  CheckSquare,
  Filter,
  CalendarDays,
  Briefcase,
  List,
  Award,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
  TimerReset,
  Handshake,
} from "lucide-react";

import toast from "react-hot-toast";
import confetti from "canvas-confetti";
// Note: We are replacing the external KanbanColumn with an internal Modern version
// import KanbanColumn from "../components/deal/KanbanColumn"; 
import DealsTable from "../components/deal/DealsTable";
import VideoTutorialModal from "../components/VideoTutorialModal";
import { getVideoTutorial } from "../utils/videoTutorials";
import ExportModal from "../components/common/ExportModal";
import DealQuickView from "../components/deal/DealQuickView";
import ColumnSettingsPanel from "../components/ColumnSettingsPanel";
import { useColumnSettings } from "../hooks/useColumnSettings";
import AppToaster from "../components/AppToaster";
import { useSubscription } from "../contexts/SubscriptionContext";
import { hasMinPlan } from "../utils/subscriptionHelpers";
import UpgradeRequiredModal from "../components/subscription/UpgradeRequiredModal";
import StatTile from "../components/common/StatTile";
import TableViewIcon from "../components/common/TableViewIcon";
import KanbanViewIcon from "../components/common/KanbanViewIcon";

// Array of cool loading messages relevant for dashboard
const loadingMessages = [
  "Tracking every opportunity — from lead to win!",
  "Your deal pipeline is getting ready to roll!",
  "Visualizing your sales journey — almost there!",
  "Because every deal deserves clarity.",
  "Your next big win is loading…",
  "Turning opportunities into outcomes — hang tight!",
  "Smart deal tracking — simplified with DataCircles.",
  "Let’s make your sales funnel flow smoother!",
  "Every deal tells a story — fetching yours now.",
  "DataCircles — where deals turn into growth.",
];



// Select a random message
const randomMessage =
  loadingMessages[Math.floor(Math.random() * loadingMessages.length)];

// Export strategies following Open/Closed principle
class ExcelExporter {
  static export(deals) {
    const data = deals?.map((deal) => ({
      Title: deal.title || "",
      Amount: deal.amount ? `Rs.${formatNumberToIndian(parseFloat(String(deal.amount).replace(/,/g, '')) || 0)}` : "",
      Status: deal.status || "",
      Company: deal.company?.name || "N/A",
      Contact: deal.contact?.name || "N/A",
      "Created Date": new Date(deal.createdAt).toLocaleDateString(),
      "Updated Date": new Date(deal.updatedAt).toLocaleDateString(),
    }));

    // Generate CSV content
    const ws = window.XLSX?.utils.json_to_sheet(data);
    const csv = window.XLSX?.utils.sheet_to_csv(ws, {
      FS: ",", // Field separator (comma)
      RS: "\n", // Row separator (newline)
      forceQuotes: true, // Enclose all fields in quotes to handle special characters
      blankrows: false, // Skip blank rows
    });

    // Create a downloadable CSV file
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `deals_export_${new Date().toISOString().split("T")[0]}.csv`
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

class PDFExporter {
  static export(deals) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text("Deals Report", 14, 20);

    const tableColumn = [
      "#",
      "Title",
      "Amount",
      "Status",
      "Company",
      "Contact",
    ];
    const tableRows = [];

    deals.forEach((deal, index) => {
      const dealData = [
        index + 1,
        deal.title || "—",
        `Rs.${formatNumberToIndian(parseFloat(String(deal.amount || 0).replace(/,/g, '')) || 0)}`,
        deal.status || "—",
        deal.company?.name || "—",
        deal.contact?.name || "—",
      ];
      tableRows.push(dealData);
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 30,
      styles: {
        fontSize: 10,
        cellPadding: 3,
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: [52, 144, 220],
        textColor: 255,
        fontStyle: "bold",
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245],
      },
      margin: { top: 30 },
    });

    doc.save(`deals_report_${new Date().toISOString().split("T")[0]}.pdf`);
  }
}

const QuickActionDropZone = ({
  status,
  icon,
  bgColor,
  borderColor,
  textColor,
  hoverBorderColor,
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `quick-${status}`,
  });

  return (
    <div
      ref={setNodeRef}
      className={`relative bg-white border-2 ${isOver ? "border-gray-400 shadow-md" : "border-gray-200"
        } rounded-lg px-5 py-3 transition-all duration-200 ${isOver ? "scale-105" : "hover:border-gray-300"
        } flex items-center gap-3 min-w-[50%] cursor-pointer`}
    >
      {/* Icon */}
      <div
        className={`flex-shrink-0 transition-transform ${isOver ? "scale-110" : ""
          }`}
      >
        <div
          className={`w-8 h-8 flex items-center justify-center ${status === "Won" ? "text-gray-700" : "text-gray-600"
            }`}
        >
          {icon}
        </div>
      </div>

      {/* Text */}
      <div className="flex flex-col">
        <p className="text-sm font-semibold text-gray-900">{status}</p>
        <p className="text-xs text-gray-500">
          {isOver ? "Release now" : "Drop here"}
        </p>
      </div>

      {/* Subtle indicator line when hovering */}
      {isOver && (
        <div
          className={`absolute bottom-0 left-0 right-0 h-1 rounded-b-lg ${status === "Won" ? "bg-gray-700" : "bg-gray-600"
            }`}
        ></div>
      )}
    </div>
  );
};

const DealSettingSidebar = ({ isOpen, onClose, staleDays, setStaleDays }) => {
  const [days, setDays] = useState(staleDays);

  useEffect(() => {
    setDays(staleDays);
  }, [staleDays]);

  const handleSave = async () => {
    const loadingToast = toast.loading("Updating stale days...");

    try {
      const res = await API.put("/deal-settings", { staleDays: days });
      setStaleDays(res.data.staleDays);
      toast.success("Stale days updated successfully", { id: loadingToast });
      onClose();
    } catch (error) {
      console.error("Error updating stale days:", error);
      if (error.response?.status === 402) {
        toast.error(error.response?.data?.message || "An active subscription is required to make changes.", { id: loadingToast });
      } else {
        toast.error(error.response?.data?.error || "Failed to update stale days", { id: loadingToast });
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/20 flex justify-end z-[100005]"
      onClick={onClose}
    >
      <div
        className="bg-white w-80 h-full p-6 shadow-lg overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-900">Deal Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Stale after (days):
          </label>
          <input
            type="number"
            min="0"
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value) || 0)}
            className="border border-gray-300 rounded-lg p-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-2 text-xs text-gray-500">
            Deals older than this will be highlighted in red.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            className="bg-blue-600 text-white font-medium text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition flex-1"
          >
            Save
          </button>
          <button
            onClick={onClose}
            className="bg-gray-200 text-gray-900 font-medium text-sm px-4 py-2 rounded-lg hover:bg-gray-300 transition flex-1"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

// --- MODERN UI COMPONENTS (New) ---

const ModernDealCard = React.memo(({ deal, onClick, isStale, colorTheme = "blue", selected = false, onToggleSelect, onQuickView, onEditDeal, onDeleteDeal }) => {
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
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: deal._id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Safe formatting
  const amount = deal.amount ? formatNumberToIndian(parseInt(deal.amount)) : "0";
  const companyName = deal.company?.name || "No Company";
  const avatarSeeds = [deal.contact?.name, deal.user?.name].filter(Boolean);

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        width: "300px",
        height: "132px",
        boxSizing: "border-box",
        ...(selected ? { borderColor: "#0085FF", background: "#F5FAFF" } : null),
      }}
      {...attributes}
      {...listeners}
      onClick={() => onClick(deal)}
      className="flex flex-col items-start bg-white border border-[#E5E5EC] rounded-[10px] p-4 gap-4 hover:shadow-md transition-shadow cursor-default group relative"
    >
      <div className="flex flex-col items-start gap-2 w-full">
        <div className="flex items-center justify-between w-full gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {onToggleSelect && (
              <span
                className="flex items-center flex-shrink-0"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <Checkbox checked={selected} onChange={() => onToggleSelect(deal._id)} />
              </span>
            )}
            <span
              className="truncate"
              style={{ fontFamily: "Inter", fontWeight: 600, fontSize: "14px", lineHeight: "150%", letterSpacing: "-0.02em", color: "#161618" }}
            >
              {deal.title}
            </span>
          </div>
          <div className="relative flex-shrink-0">
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
                const MENU_H = 120;

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
                  className="w-[160px] z-[9999] bg-white border border-[#E5E5EC] rounded-lg shadow-xl p-1.5 flex flex-col gap-0.5 animate-in fade-in zoom-in duration-150 origin-top-right"
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsActionsOpen(false); onQuickView && onQuickView(deal._id); }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                  >
                    <EyeIcon className="w-3.5 h-3.5 text-[#1C1B1F]" />
                    Quick View
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsActionsOpen(false); onEditDeal && onEditDeal(deal); }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                  >
                    <EditIcon className="w-3.5 h-3.5 text-[#1C1B1F]" />
                    Edit Deal
                  </button>
                  <div className="w-full border-t border-[#F1F1F5] my-0.5" />
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsActionsOpen(false); onDeleteDeal && onDeleteDeal(deal._id); }}
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
        <div
          className="w-full"
          style={{ fontFamily: "Inter", fontWeight: 500, fontSize: "14px", lineHeight: "150%", letterSpacing: "-0.06em", color: "#161618" }}
        >
          ₹{amount}
        </div>
      </div>

      <div className="w-full border-t border-[#F1F1F5]" />

      <div className="flex items-center gap-2 w-full">
        <div className="flex items-center justify-center w-[18px] h-[18px] rounded-[5px] bg-[#48494C] flex-shrink-0">
          <Briefcase className="w-2.5 h-2.5 text-white" />
        </div>
        <span
          className="truncate flex-1"
          style={{ fontFamily: "Inter", fontWeight: 500, fontSize: "12px", lineHeight: "15px", letterSpacing: "-0.02em", color: "#161618" }}
        >
          {companyName}
        </span>
        {avatarSeeds.length > 0 && (
          <div className="flex items-center flex-shrink-0">
            {avatarSeeds.map((seed, i) => (
              <img
                key={seed}
                src={`https://api.dicebear.com/7.x/initials/svg?seed=${seed}`}
                className="w-[18px] h-[18px] rounded-full border border-white bg-slate-100"
                style={{ marginLeft: i > 0 ? "-4px" : 0 }}
                alt="avatar"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

const ModernKanbanColumn = React.memo(({
  status,
  deals,
  totalDealsCount,
  colorTheme = "blue",
  onAddClick,
  handleEditDeal,
  handleDeleteDeal,
  onQuickView,
  isStale,
  loading = false,
  selectedDeals = [],
  onToggleSelect,
  onToggleColumnSelect,
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const dealIds = useMemo(() => deals.map((d) => d._id), [deals]);

  // Header select-all state for this column: ticked when every card here is
  // selected. (No indeterminate/dash state — the Checkbox component only
  // has empty/checked glyphs, so a partial selection just reads as empty.)
  const allSelected = dealIds.length > 0 && dealIds.every((id) => selectedDeals.includes(id));

  const totalAmount = deals.reduce((sum, deal) => sum + (parseInt(deal.amount) || 0), 0);
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
    const thisWeek = sumAmount(deals.filter((d) => inRange(d, thisWeekStart, now)));
    const lastWeek = sumAmount(deals.filter((d) => inRange(d, lastWeekStart, thisWeekStart)));
    if (lastWeek === 0) return thisWeek === 0 ? 0 : 100;
    return Math.max(-999, Math.min(999, Math.round(((thisWeek - lastWeek) / lastWeek) * 100)));
  }, [deals]);

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
          onClick={onAddClick}
          className="flex items-center justify-center cursor-pointer hover:opacity-70 transition-opacity flex-shrink-0"
          title="Add deal"
        >
          <PlusIcon className="w-4 h-4 text-[#BEBEC8]" />
        </button>
      </div>

      <div className="w-full flex-shrink-0" style={{ height: "1px", background: "#E7E7E9" }} />

      {/* Summary Card - fixed / always visible */}
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

      {/* Scrollable Deals Area — fills remaining column height, any
          additional cards scroll internally instead of growing the page. */}
      <div
        ref={setNodeRef}
        // flex-1 + min-h-0: columns are flex items in a row, so every column
        // box stretches to the tallest one's height — but this droppable only
        // wrapped its own cards, so in a SHORT column all that empty space
        // below the last card looked droppable while dnd-kit saw nothing
        // there. Dropping into it produced over === null and the card
        // reverted. Growing this to fill the column makes the whole visible
        // column area a real drop target.
        className={`overflow-y-auto dc-card-scroll w-full flex-1 min-h-0 px-[18px] pb-[18px] pt-3 transition-colors ${isOver ? "bg-blue-50/40" : ""}`}
        style={{ maxHeight: "1030px" }}
      >
        <div
          className="flex flex-col items-start w-full"
          style={{ gap: "14px" }}
        >
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => <DealCardSkeleton key={i} />)
          ) : (
            <>
              <SortableContext
                id={status}
                items={dealIds}
                strategy={verticalListSortingStrategy}
              >
                {deals.map((deal) => (
                  <ModernDealCard
                    key={deal._id}
                    deal={deal}
                    onClick={handleEditDeal}
                    isStale={isStale}
                    colorTheme={colorTheme}
                    selected={selectedDeals.includes(deal._id)}
                    onToggleSelect={onToggleSelect}
                    onQuickView={onQuickView}
                    onEditDeal={handleEditDeal}
                    onDeleteDeal={handleDeleteDeal}
                  />
                ))}
              </SortableContext>
              {/* Spacer for easier dropping at bottom */}
              <div className="h-10 w-full" />
            </>
          )}
        </div>
      </div>
    </div>
  );
});

const PipelineSummaryIcon = (props) => (
  <svg width="19" height="16" viewBox="0 0 19 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M17.1923 16H1.80775C1.30258 16 0.875 15.825 0.525 15.475C0.175 15.125 0 14.6974 0 14.1923V2.80775C0 2.30258 0.175 1.875 0.525 1.525C0.875 1.175 1.30258 1 1.80775 1H11.327V2.5H1.80775C1.73075 2.5 1.66025 2.53208 1.59625 2.59625C1.53208 2.66025 1.5 2.73075 1.5 2.80775V14.1923C1.5 14.2692 1.53208 14.3398 1.59625 14.4038C1.66025 14.4679 1.73075 14.5 1.80775 14.5H17.1923C17.2693 14.5 17.3398 14.4679 17.4038 14.4038C17.4679 14.3398 17.5 14.2692 17.5 14.1923V7.577H19V14.1923C19 14.6974 18.825 15.125 18.475 15.475C18.125 15.825 17.6974 16 17.1923 16ZM3.88475 12.173H10.25V9.69225H3.88475V12.173ZM3.88475 7.30775H10.25V4.827H3.88475V7.30775ZM12.6348 12.173H15.1152V7.577H12.6348V12.173ZM15.5 5.5V3.5H13.5V2H15.5V0H17V2H19V3.5H17V5.5H15.5Z" fill="#0085FF" />
  </svg>
);

// --- MAIN COMPONENT ---

function Deals() {
  const isSearchOverlayOpen = useSearchOverlayOpen();
  const [deals, setDeals] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [form, setForm] = useState({
    title: "",
    amount: "",
    status: "Open",
    company: "",
    contact: "",
  });
  const [loading, setLoading] = useState(false);
  const [statuses, setStatuses] = useState([]);
  const showKanbanSkeleton = loading && deals.length === 0;
  useTopLoadingSignal(showKanbanSkeleton);
  const [showFilters, setShowFilters] = useState(false);
  const [activeAdvancedFilters, setActiveAdvancedFiltersState] = useState(() => {
    try {
      const saved = localStorage.getItem("deals_advanced_filters");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const setActiveAdvancedFilters = (filtersOrFn) => {
    setActiveAdvancedFiltersState((prev) => {
      const next = typeof filtersOrFn === "function" ? filtersOrFn(prev) : filtersOrFn;
      try {
        localStorage.setItem("deals_advanced_filters", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const dealFilterColumns = [
    { key: "dealId", label: "Deal ID" },
    { key: "title", label: "Deal Name" },
    { key: "company", label: "Company" },
    { key: "contact", label: "Contact" },
    { key: "status", label: "Stage", options: statuses },
    { key: "amount", label: "Amount" },
    { key: "dueDate", label: "Due Date" },
  ];

  const getDealFieldValue = (deal, key) => {
    switch (key) {
      case "dealId":
        return `DL-${deal._id.slice(-5).toUpperCase()}`;
      case "title":
        return deal.title || "";
      case "company":
        return deal.company?.name || "";
      case "contact":
        return deal.contact?.name || "";
      case "status":
        return deal.status || "";
      case "amount":
        return deal.amount || 0;
      case "dueDate": {
        const dueDateField = deal.additionalFields?.find((f) => f.key === "Expected Close Date");
        return dueDateField?.value
          ? new Date(dueDateField.value).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })
          : "";
      }
      default:
        return "";
    }
  };
  const [showStats, setShowStats] = useState(true);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const searchInputRef = useRef(null);
  const tableScrollRef = useRef(null);
  const [dealsCurrentPage, setDealsCurrentPage] = useState(1);
  const [dealsPerPage, setDealsPerPage] = useState(50);
  const [dealsEditingPage, setDealsEditingPage] = useState(false);
  const [dealsPageInput, setDealsPageInput] = useState("");
  const [filters, setFilters] = useState({
    status: "All",
    company: "All",
    user: "All",
    minAmount: "",
    maxAmount: "",
    startDate: "",
    endDate: "",
    searchTerm: "",
  });
  const [name, setName] = useState("");
  const [showKanban, setShowKanban] = useState(false);
  const [permission, setPermission] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [editDeal, setEditDeal] = useState(null);
  const [dealFields, setDealFields] = useState([]);
  const [additionalFieldValues, setAdditionalFieldValues] = useState({});
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [dealToDelete, setDealToDelete] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { state } = location;

  // "View all" from the global search panel hands its query off via
  // `?search=` rather than trying to replicate the search itself — this
  // drops it straight into the table's own search box on arrival, so the
  // list is already filtered instead of showing everything.
  useEffect(() => {
    const q = new URLSearchParams(location.search).get("search");
    if (q) {
      setFilters((prev) => ({ ...prev, searchTerm: q }));
      setIsSearchExpanded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const [showImport, setShowImport] = useState(false);
  const [staleDays, setStaleDays] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedDeals, setSelectedDeals] = useState([]);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  // Bulk row selection requires Growth+
  const { subscription } = useSubscription();
  const hasBulkAccess = hasMinPlan(subscription?.subscription?.planName, "growth");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Delays the bulk-strip's unmount so it can play a slide-out-right exit
  // animation on deselect (mirroring the slide-in-left entrance).
  const [showBulkStrip, setShowBulkStrip] = useState(false);
  const [bulkStripClosing, setBulkStripClosing] = useState(false);
  useEffect(() => {
    if (selectedDeals.length > 0) {
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
  }, [selectedDeals.length]);
  const [activeDeal, setActiveDeal] = useState(null);
  const [sortConfig, setSortConfig] = useState({
    key: null,
    direction: "asc",
  });
  // Video Tutorial State
  const [showVideoTutorial, setShowVideoTutorial] = useState(false);


  const [quickViewDealId, setQuickViewDealId] = useState(null);

  // NEW: Confetti celebration state
  const [celebrationDeal, setCelebrationDeal] = useState(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportButtonRef = useRef(null);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef(null);

  // Add these states at the top of your Deals component
  const [selectionMode, setSelectionMode] = useState(false);
  const [longPressTimer, setLongPressTimer] = useState(null);
  const [users, setUsers] = useState([]);
  // Write-only outside handleDragOver (nothing in the render tree reads it) —
  // a ref instead of state, so tracking it doesn't force a full-board
  // re-render on every pointer-move during a drag. It used to be useState,
  // and that was firing hundreds of re-renders across every card in every
  // column mid-drag, which is what made the drag stutter/slow down the
  // longer it went on.
  const overIdRef = useRef(null);
  // Visual-only column override during drag. handleDragOver only writes this —
  // never deals[]. The dealsByStatus useMemo reads it so the dragged card appears
  // in the hovered column without touching deals[] or re-running filteredDeals.
  const [dragOverStatus, setDragOverStatus] = useState(null);

  const [showExportModal, setShowExportModal] = useState(false);

  // 👉 NEW: Column Settings State & Logic
  const [showColumnSettings, setShowColumnSettings] = useState(false);

  const defaultColumns = useMemo(() => {
    // Keys must match DealsTable's own column `id`s (see the `columns` useMemo
    // in DealsTable.jsx) — this is what makes hiding/reordering here actually
    // affect the rendered table via the visibleColumns/columnOrder props below.
    const baseColumns = [
      { key: "dealId", label: "Deal ID", visible: true, order: 0, sortable: false },
      { key: "title", label: "Deal Title", visible: true, order: 1, required: true, defaultVisible: true, sortable: true },
      { key: "amount", label: "Amount", visible: true, order: 2, sortable: true },
      { key: "status", label: "Stage", visible: true, order: 3, sortable: true },
      { key: "company", label: "Company", visible: true, order: 4, sortable: true },
      { key: "contact", label: "Contact", visible: true, order: 5, sortable: true },
      { key: "dueDate", label: "Due Date", visible: true, order: 6, sortable: false },
    ];

    if (dealFields && dealFields.length > 0) {
      const customColumns = dealFields.map((field, index) => ({
        key: field.name || field,
        label: field.name || field,
        visible: false, // Hidden by default
        order: baseColumns.length + index,
        isCustomField: true,
        type: field.type || "text",
        options: field.options,
        description: `Custom field: ${field.name || field}`,
      }));
      return [...baseColumns, ...customColumns];
    }
    return baseColumns;
  }, [dealFields]);

  const { columns, saveColumns, getVisibleColumns } = useColumnSettings(
    "deals",
    defaultColumns
  );

  const visibleColumns = useMemo(() => getVisibleColumns(), [columns]);
  // Non-custom-field columns the user has hidden via the Columns panel —
  // DealsTable unions this with its own per-session "Hide Column" quick
  // action, so both routes to hiding a column keep working.
  const persistedHiddenColumnKeys = useMemo(
    () => columns.filter((c) => !c.visible && !c.isCustomField).map((c) => c.key),
    [columns]
  );
  const persistedColumnOrderKeys = useMemo(
    () => visibleColumns.filter((c) => !c.isCustomField).map((c) => c.key),
    [visibleColumns]
  );
  // ----------------------------------------------------

  const toggleStar = async (e, dealId) => {
    e.stopPropagation();
    try {
      await API.post(`/deals/${dealId}/star`);
      await fetchDeals();
      setDealsCurrentPage(1);
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to update star");
    }
  };

  // Columns specifically mapped for the Export Modal
  const exportColumns = useMemo(() => {
    const baseCols = [
      { key: "title", label: "Deal Title", visible: true },
      { key: "amount", label: "Amount", visible: true },
      { key: "status", label: "Stage", visible: true },
      { key: "company", label: "Company", visible: true },
      { key: "contact", label: "Contact", visible: true },
    ];

    // Add custom fields
    const customCols = (dealFields || []).map((field) => ({
      key: field.name || field,
      label: field.name || field,
      visible: false, // Hidden by default in export
      isCustomField: true,
    }));

    return [...baseCols, ...customCols];
  }, [dealFields]);

  // Add these handler functions in your Deals component

  // Long press handlers
  const handleRowMouseDown = (dealId) => {
    const timer = setTimeout(() => {
      setSelectionMode(true);
      handleSelectDeal(dealId);
    }, 500); // 500ms for long press
    setLongPressTimer(timer);
  };

  const handleRowMouseUp = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };


  // Long-press-to-select is disabled on touch devices — mobile rows should
  // only enter selection via the checkbox itself, never by holding the row.
  const handleRowTouchStart = () => { };

  const handleRowTouchEnd = () => { };

  // Bulk delete handler
  // Bulk handlers
  const handleBulkDeleteDeals = async (itemIds) => {
    setLoading(true);
    try {
      await Promise.all(itemIds.map((id) => API.delete(`/deals/${id}`)));
      await fetchDeals();
      setSelectedDeals([]);
      setSelectionMode(false);
      toast.success(`Successfully deleted ${itemIds.length} deals`);
    } catch (err) {
      toast.error(err.response?.data?.error || "Bulk delete failed");
    } finally {
      setLoading(false);
    }
  };

  const handleBulkUpdateDeals = async ({ field, value, itemIds }) => {
    setLoading(true);
    try {
      await Promise.all(
        itemIds.map((id) => {
          const payload = { [field]: value };
          return API.put(`/deals/${id}`, payload);
        }),
      );
      await fetchDeals();
      setSelectedDeals([]);
      setSelectionMode(false);
      toast.success(`Successfully updated ${itemIds.length} deals`);
    } catch (err) {
      toast.error(err.response?.data?.error || "Bulk update failed");
    } finally {
      setLoading(false);
    }
  };

  // Deal field config
  const dealFieldConfig = {
    fields: [
      {
        key: "status",
        label: "Stage",
        type: "select",
        options: statuses,
      },
    ],
  };

  const DND_MEASURING = { droppable: { strategy: MeasuringStrategy.BeforeDragging } };

  // dnd-kit sensors configuration
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Collision detection was `closestCorners`, which measures corner distance
  // against every droppable (cards + column containers + quick-drop zones).
  // Right at a column boundary two containers sit almost equidistant, so the
  // winning target flip-flopped between pointer-move events — each flip fired
  // handleDragOver, which triggers dragOverStatus updates and minor re-renders.
  // The flicker/freeze at column boundaries was collision-detection oscillation
  // (target flip-flopping), not an animation bug. pointerWithin
  // only matches droppables the pointer is literally inside, so there's no
  // ambiguous "closest" candidate to flip between; rectIntersection is kept as
  // a fallback for the rare frame where the pointer is briefly outside every
  // droppable (e.g. over a column's padding/gap).
  const collisionDetectionStrategy = (args) => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) return pointerCollisions;
    return rectIntersection(args);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        exportButtonRef.current &&
        !exportButtonRef.current.contains(event.target)
      ) {
        setShowExportMenu(false);
      }
      if (
        moreMenuRef.current &&
        !moreMenuRef.current.contains(event.target)
      ) {
        setIsMoreMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close the overflow menu on scroll — it's absolutely positioned off its
  // own button, so a scroll that moves that button would otherwise leave
  // it floating detached from its anchor.
  useEffect(() => {
    if (!isMoreMenuOpen) return;
    const handleScroll = () => setIsMoreMenuOpen(false);
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, [isMoreMenuOpen]);

  // Sorting function — cycles asc -> desc -> off
  const handleSort = (key) => {
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      setSortConfig({ key, direction: "desc" });
    } else if (sortConfig.key === key && sortConfig.direction === "desc") {
      setSortConfig({ key: null, direction: null });
    } else {
      setSortConfig({ key, direction: "asc" });
    }
  };

  // Sort deals based on sortConfig
  // Sort deals based on starred status first, then sortConfig
  const getSortedDeals = (deals) => {
    if (!deals || deals.length === 0) return [];

    return [...deals].sort((a, b) => {
      // 1. Primary Sort: Starred Deals always float to the top
      // (isStarred flag comes from the API on each deal object)
      const isAStarred = !!a.isStarred;
      const isBStarred = !!b.isStarred;

      if (isAStarred && !isBStarred) return -1;
      if (!isAStarred && isBStarred) return 1;

      // 2. Secondary Sort: Apply standard column sorting if active
      if (!sortConfig.key) return 0;

      let aValue, bValue;

      if (sortConfig.key === "dealId") {
        aValue = a._id.slice(-5).toUpperCase();
        bValue = b._id.slice(-5).toUpperCase();
      } else if (sortConfig.key === "company") {
        aValue = a.company?.name || "";
        bValue = b.company?.name || "";
      } else if (sortConfig.key === "amount") {
        aValue = parseInt(a.amount || 0);
        bValue = parseInt(b.amount || 0);
      } else if (sortConfig.key === "updatedAt") {
        aValue = new Date(a.updatedAt);
        bValue = new Date(b.updatedAt);
      } else {
        aValue = a[sortConfig.key] || "";
        bValue = b[sortConfig.key] || "";
      }

      if (typeof aValue === "string") aValue = aValue.toLowerCase();
      if (typeof bValue === "string") bValue = bValue.toLowerCase();

      if (aValue < bValue) {
        return sortConfig.direction === "asc" ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === "asc" ? 1 : -1;
      }
      return 0;
    });
  };

  // Component for sortable column header
  const SortableHeader = ({ field, children, className = "" }) => (
    <th
      className={`px-4 py-2 cursor-pointer hover:bg-gray-100 select-none ${className}`}
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        <div className="flex flex-col">
          <ChevronUp
            className={`w-3 h-3 ${sortConfig.key === field && sortConfig.direction === "asc"
              ? "text-blue-600"
              : "text-gray-400"
              }`}
          />
          <ChevronDown
            className={`w-3 h-3 -mt-1 ${sortConfig.key === field && sortConfig.direction === "desc"
              ? "text-blue-600"
              : "text-gray-400"
              }`}
          />
        </div>
      </div>
    </th>
  );

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        await Promise.all([
          fetchStatuses(),
          fetchDeals(),
          fetchCompanies(),
          fetchContacts(),
          fetchName(),
          fetchPermission(),
          fetchDealFields(),
          fetchStaleDays(),
          fetchUsers(),
        ]);
      } catch (error) {
        toast.error("Failed to load data", {
          style: {
            zIndex: 99999,
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            color: "#374151",
            padding: "10px",
            fontSize: "14px",
            maxWidth: "90vw",
          },
        });
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await API.get("/auth/all-user"); // Adjust endpoint if needed: /users or /auth/users
      setUsers(res.data.allUsers || res.data); // Adjust based on your API response
    } catch (error) {
      console.error("Error fetching users:", error);
      // Don't block UI if users fail to load
    }
  };

  const fetchStaleDays = async () => {
    try {
      const res = await API.get("/deal-settings");
      setStaleDays(res.data?.staleDays || 0);
    } catch (error) {
      console.error("Failed to fetch stale days", error);
      toast.error("Failed to fetch stale days", {
        style: {
          zIndex: 99999,
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          color: "#374151",
          padding: "10px",
          fontSize: "14px",
          maxWidth: "90vw",
        },
      });
    }
  };

  const fetchDealFields = async () => {
    try {
      const res = await API.get("/deal-fields");
      if (res.data?.fields) {
        const fieldData = res.data.fields;
        if (fieldData.length > 0 && typeof fieldData[0] === "object") {
          setDealFields(fieldData);
        } else {
          setDealFields(fieldData);
        }
      }
    } catch (error) {
      console.error("Failed to fetch deal fields", error);
      toast.error("Failed to fetch deal fields", {
        style: {
          zIndex: 99999,
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          color: "#374151",
          padding: "10px",
          fontSize: "14px",
          maxWidth: "90vw",
        },
      });
    }
  };

  const fetchPermission = async () => {
    try {
      const res = await API.get("/auth/me");
      const user = res.data.user;
      const dealPerm = user?.permissions?.find(
        (p) => p?.name.toLowerCase() === "deals",
      );
      setPermission(dealPerm?.permission || "no");
    } catch (err) {
      console.error("Failed to fetch permission");
      toast.error("Failed to fetch permission", {
        style: {
          zIndex: 99999,
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          color: "#374151",
          padding: "10px",
          fontSize: "14px",
          maxWidth: "90vw",
        },
      });
    }
  };

  const fetchName = async () => {
    try {
      const res = await API.get("/kanban-name");
      setName(res.data?.name);
    } catch (error) {
      console.error("Error fetching Name:", error);
      toast.error("Failed to fetch kanban name", {
        style: {
          zIndex: 99999,
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          color: "#374151",
          padding: "10px",
          fontSize: "14px",
          maxWidth: "90vw",
        },
      });
    }
  };

  const fetchStatuses = async () => {
    try {
      const res = await API.get("/kanban");
      setStatuses(res.data?.statuses || []);
    } catch (error) {
      console.error("Error fetching statuses:", error);
      toast.error("Failed to fetch statuses", {
        style: {
          zIndex: 99999,
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          color: "#374151",
          padding: "10px",
          fontSize: "14px",
          maxWidth: "90vw",
        },
      });
    }
  };

  const fetchDeals = async () => {
    try {
      const res = await API.get("/deals");
      setDeals(res.data);
    } catch (error) {
      console.error("Error fetching deals:", error);
      toast.error("Failed to fetch deals", {
        style: {
          zIndex: 99999,
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          color: "#374151",
          padding: "10px",
          fontSize: "14px",
          maxWidth: "90vw",
        },
      });
    }
  };

  const fetchCompanies = async () => {
    try {
      const res = await API.get("/companies");
      setCompanies(res.data);
    } catch (error) {
      console.error("Error fetching companies:", error);
      toast.error("Failed to fetch companies", {
        style: {
          zIndex: 99999,
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          color: "#374151",
          padding: "10px",
          fontSize: "14px",
          maxWidth: "90vw",
        },
      });
    }
  };

  const fetchContacts = async () => {
    try {
      const res = await API.get("/contacts");
      setContacts(res.data);
    } catch (error) {
      console.error("Error fetching contacts:", error);
      toast.error("Failed to fetch contacts", {
        style: {
          zIndex: 99999,
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          color: "#374151",
          padding: "10px",
          fontSize: "14px",
          maxWidth: "90vw",
        },
      });
    }
  };

  const handleEditDeal = useCallback((deal) => {
    setEditDeal(deal);
    setShowQuickAdd(true);
  }, []);

  const handleDeleteDeal = (dealId) => {
    if (permission !== "read-write") {
      toast.error("You do not have permission to delete deals.", {
        style: {
          zIndex: 99999,
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          color: "#374151",
          padding: "10px",
          fontSize: "14px",
          maxWidth: "90vw",
        },
      });
      return;
    }

    setDealToDelete(dealId);
    setShowDeleteModal(true);
  };

  const confirmDeleteDeal = async () => {
    if (!dealToDelete) return;

    const loadingToast = toast.loading("Deleting deal...", {
      style: {
        zIndex: 99999,
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
        color: "#374151",
        padding: "10px",
        fontSize: "14px",
        maxWidth: "90vw",
      },
    });

    try {
      setLoading(true);
      await API.delete(`/deals/${dealToDelete}`);
      setDeals((prevDeals) =>
        prevDeals.filter((deal) => deal._id !== dealToDelete),
      );
      // Remove from selected deals if it was selected
      setSelectedDeals((prev) => prev.filter((id) => id !== dealToDelete));
      toast.success("Deal deleted successfully!", {
        id: loadingToast,
        style: {
          zIndex: 99999,
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          color: "#374151",
          padding: "10px",
          fontSize: "14px",
          maxWidth: "90vw",
        },
      });
    } catch (error) {
      console.error("Error deleting deal:", error);
      let errorMessage = "Failed to delete deal";
      if (error.response && error.response.status === 402) {
        errorMessage = error.response.data.message || "An active subscription is required to make changes.";
      } else if (error.response && error.response.status === 403) {
        errorMessage = error.response.data.message || error.response.data.error || "Access denied";
      }
      toast.error(errorMessage, {
        id: loadingToast,
        style: {
          zIndex: 99999,
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          color: "#374151",
          padding: "10px",
          fontSize: "14px",
          maxWidth: "90vw",
        },
      });
    } finally {
      setLoading(false);
      setShowDeleteModal(false);
      setDealToDelete(null);
    }
  };

  // dnd-kit handlers
  const handleDragStart = (event) => {
    const { active } = event;
    const deal = deals.find((d) => d._id.toString() === active.id.toString());
    // Shallow copy so activeDeal._id is the pre-drag snapshot, independent of
    // whatever deals[] looks like at drop time.
    setActiveDeal(deal ? { ...deal } : null);
    setDragOverStatus(null);
  };

  const handleDragOver = (event) => {
    const { active, over } = event;

    if (!over) {
      overIdRef.current = null;
      setDragOverStatus(null);
      return;
    }

    overIdRef.current = over.id;

    const activeId = active.id.toString();
    const overId = over.id.toString();
    if (activeId === overId) return;

    // Resolve which column we're hovering over
    let overStatus;
    if (overId.startsWith("quick-")) {
      overStatus = overId.replace("quick-", "");
    } else if (statuses.includes(overId)) {
      overStatus = overId;
    } else {
      const overDeal = deals.find((d) => d._id.toString() === overId);
      if (overDeal) overStatus = overDeal.status;
    }
    if (!overStatus) return;

    // Back over origin column: clear override so card renders in home column
    const dragged = deals.find((d) => d._id.toString() === activeId);
    setDragOverStatus(overStatus === dragged?.status ? null : overStatus);
  };

  const handleDragCancel = () => {
    setActiveDeal(null);
    setDragOverStatus(null);
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;

    // Capture activeDeal before clearing it — state setter is async, the
    // closure value is still the pre-drop snapshot set in handleDragStart.
    const draggedDeal = activeDeal;

    setActiveDeal(null);
    overIdRef.current = null;
    setDragOverStatus(null);

    if (!over) return;

    if (permission !== "read-write") {
      toast.error("You do not have permission to update deal status.");
      return;
    }

    const dealId = active.id.toString();
    let newStatus = over.id.toString();

    if (newStatus.startsWith("quick-")) {
      newStatus = newStatus.replace("quick-", "");
    }

    const droppedOnDeal = deals.find((d) => d._id.toString() === newStatus);
    if (droppedOnDeal) {
      newStatus = droppedOnDeal.status;
    }

    const originalDeal = deals.find((deal) => deal._id.toString() === dealId);
    if (!originalDeal) return;

    const oldStatus = draggedDeal?.status || originalDeal.status;
    if (oldStatus === newStatus) return;

    // Optimistic update: move the card into the destination column immediately
    // so there's no snap-back animation while waiting for the API.
    setDeals((prevDeals) =>
      prevDeals.map((deal) =>
        deal._id.toString() === dealId ? { ...deal, status: newStatus } : deal,
      ),
    );

    try {
      const response = await API.post(`/deals/${dealId}/status`, { oldStatus, newStatus });

      // Sync with the server's canonical response (updatedAt, etc.)
      setDeals((prevDeals) =>
        prevDeals.map((deal) =>
          deal._id.toString() === dealId ? response.data : deal,
        ),
      );

      if (newStatus === "Won" && oldStatus !== "Won") {
        setCelebrationDeal(response.data);
        toast.success(`🎉 ${response.data.title} marked as Won!`, { duration: 5000, icon: "🏆" });
      } else {
        toast.success("Deal status updated successfully");
      }
    } catch (error) {
      console.error("Error updating deal status:", error);
      // Revert optimistic update on failure
      setDeals((prevDeals) =>
        prevDeals.map((deal) =>
          deal._id.toString() === dealId ? { ...deal, status: oldStatus } : deal,
        ),
      );
      if (error.response?.status === 402) {
        toast.error(error.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(error.response?.data?.error || "Failed to update deal status");
      }
    }
  };

  const handleStatusChange = async (dealId, oldStatus, newStatus) => {
    if (permission !== "read-write") {
      toast.error("You do not have permission to update deal status.", {
        style: {
          zIndex: 99999,
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          color: "#374151",
          padding: "10px",
          fontSize: "14px",
          maxWidth: "90vw",
        },
      });
      return;
    }

    setDeals((prevDeals) =>
      prevDeals?.map((deal) =>
        deal._id === dealId ? { ...deal, status: newStatus } : deal,
      ),
    );

    try {
      const response = await API.post(`/deals/${dealId}/status`, {
        oldStatus,
        newStatus,
      });
      console.log("Deal status updated successfully:", response.data);
      setDeals((prevDeals) =>
        prevDeals?.map((deal) => (deal._id === dealId ? response.data : deal)),
      );
      if (newStatus === "Won" && oldStatus !== "Won") {
        setCelebrationDeal(response.data);
        toast.success(`🎉 ${response.data.title} marked as Won!`, { duration: 5000, icon: "🏆" });
      } else {
        toast.success("Deal status updated successfully", {
          style: {
            zIndex: 99999,
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            color: "#374151",
            padding: "10px",
            fontSize: "14px",
            maxWidth: "90vw",
          },
        });
      }
    } catch (error) {
      console.error("Error updating deal status:", error);
      if (error.response?.status === 409) {
        const currentStatus = error.response.data.currentStatus;
        setDeals((prevDeals) =>
          prevDeals?.map((deal) =>
            deal._id === dealId ? { ...deal, status: currentStatus } : deal,
          ),
        );
        toast.error(error.response.data.error, {
          style: {
            zIndex: 99999,
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            color: "#374151",
            padding: "10px",
            fontSize: "14px",
            maxWidth: "90vw",
          },
        });
      } else {
        setDeals((prevDeals) =>
          prevDeals?.map((deal) =>
            deal._id === dealId ? { ...deal, status: oldStatus } : deal,
          ),
        );
        const errorMsg = error.response?.status === 402
          ? (error.response?.data?.message || "An active subscription is required to make changes.")
          : (error.response?.data?.error || "Failed to update deal status");
        toast.error(errorMsg, {
          style: {
            zIndex: 99999,
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            color: "#374151",
            padding: "10px",
            fontSize: "14px",
            maxWidth: "90vw",
          },
        });
      }
    }
  };

  const isStale = useCallback((createdAt) => {
    if (staleDays <= 0) return false;
    const daysDiff = (new Date() - new Date(createdAt)) / (1000 * 60 * 60 * 24);
    return daysDiff > staleDays;
  }, [staleDays]);

  // Filter strategies
  class StatusFilter {
    static filter(deals, status) {
      return status === "All"
        ? deals
        : deals.filter((deal) => deal.status === status);
    }
  }

  class AmountFilter {
    static filter(deals, minAmount, maxAmount) {
      return deals.filter((deal) => {
        const amount = parseInt(deal.amount || 0);
        return amount >= minAmount && amount <= maxAmount;
      });
    }
  }

  class UserFilter {
    static filter(deals, userId) {
      if (userId === "All" || !userId) return deals;
      return deals.filter(
        (deal) => deal.user?._id === userId || deal.user === userId,
      );
    }
  }

  class CompanyFilter {
    static filter(deals, companyId) {
      return companyId === "All"
        ? deals
        : deals.filter(
          (deal) =>
            deal.company === companyId || deal.company?._id === companyId,
        );
    }
  }

  class DateFilter {
    static filter(deals, startDate, endDate) {
      if (!startDate && !endDate) return deals;
      const start = startDate ? new Date(startDate) : new Date("1900-01-01");
      const end = endDate ? new Date(endDate) : new Date("2100-12-31");
      return deals.filter((deal) => {
        const d = new Date(deal.createdAt);
        return d >= start && d <= end;
      });
    }
  }

  const filteredDeals = useMemo(() => {
    let filtered = [...deals];

    filtered = applyAdvancedFilters(filtered, activeAdvancedFilters, getDealFieldValue);
    filtered = StatusFilter.filter(filtered, filters.status);
    filtered = CompanyFilter.filter(filtered, filters.company);
    filtered = UserFilter.filter(filtered, filters.user); // Add this line

    if (filters.minAmount || filters.maxAmount) {
      const min = parseInt(filters.minAmount || 0);
      const max = parseInt(filters.maxAmount || Infinity);
      filtered = AmountFilter.filter(filtered, min, max);
    }
    if (filters.startDate || filters.endDate) {
      filtered = DateFilter.filter(
        filtered,
        filters.startDate,
        filters.endDate,
      );
    }
    if (filters.searchTerm) {
      const q = filters.searchTerm.toLowerCase();
      filtered = filtered.filter((deal) => {
        const dealIdShort = `DL-${deal._id.slice(-5).toUpperCase()}`;
        const amountStr = `${deal.amount || 0}`;
        const formattedAmount = `₹${(deal.amount || 0).toLocaleString("en-IN")}`;
        const dueDateField = deal.additionalFields?.find((f) => f.key === "Expected Close Date");
        const dueDateStr = dueDateField?.value
          ? new Date(dueDateField.value).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })
          : "";

        return (
          deal.title?.toLowerCase().includes(q) ||
          deal.company?.name?.toLowerCase().includes(q) ||
          deal.contact?.name?.toLowerCase().includes(q) ||
          deal.status?.toLowerCase().includes(q) ||
          dealIdShort.toLowerCase().includes(q) ||
          amountStr.includes(q) ||
          formattedAmount.toLowerCase().includes(q) ||
          dueDateStr.toLowerCase().includes(q)
        );
      });
    }

    return filtered.sort((a, b) => {
      const aIsStale = isStale(a.createdAt);
      const bIsStale = isStale(b.createdAt);
      return aIsStale === bIsStale ? 0 : aIsStale ? 1 : -1;
    });
  }, [deals, filters, staleDays, activeAdvancedFilters]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sortedTableDeals = useMemo(() => getSortedDeals(filteredDeals), [filteredDeals, sortConfig]);

  // Kanban column grouping: mirrors CompanyDealsKanban's dealsByStatus pattern.
  // Placing this in useMemo with dragOverStatus as a dep means:
  //  - During drag (same column): dragOverStatus unchanged → cache hit → zero column re-renders
  //  - On column crossing: recomputes only the 3 simple filter calls, not the whole sort pipeline
  //  - activeDeal included so card appears in hovered column during drag
  const dealsByStatus = useMemo(() => {
    const map = {};
    statuses.forEach((status) => {
      map[status] = sortedTableDeals.filter((d) => {
        if (activeDeal && d._id.toString() === activeDeal._id.toString() && dragOverStatus) {
          return dragOverStatus === status;
        }
        return d.status === status;
      });
    });
    return map;
  }, [sortedTableDeals, activeDeal, dragOverStatus, statuses]);

  const dealsTotalPages = Math.max(1, Math.ceil(sortedTableDeals.length / dealsPerPage));
  const dealsCurrentPageClamped = Math.min(dealsCurrentPage, dealsTotalPages);
  const paginatedTableDeals = sortedTableDeals.slice(
    (dealsCurrentPageClamped - 1) * dealsPerPage,
    dealsCurrentPageClamped * dealsPerPage
  );

  // NEW: Calculate statistics for all deals or selected deals
  const dealStatistics = useMemo(() => {
    const dealsToCalculate =
      selectedDeals.length > 0
        ? sortedTableDeals.filter((deal) => selectedDeals.includes(deal._id))
        : sortedTableDeals;

    const totalPipeline = dealsToCalculate.reduce(
      (sum, deal) => sum + (parseFloat(deal.amount) || 0),
      0,
    );
    const wonDeals = dealsToCalculate.filter((deal) => deal.status === "Won");
    const lostDeals = dealsToCalculate.filter((deal) => deal.status === "Lost");
    const openDeals = dealsToCalculate.filter((deal) => deal.status === "Open");
    const totalWon = wonDeals.reduce(
      (sum, deal) => sum + (parseFloat(deal.amount) || 0),
      0,
    );
    const totalLost = lostDeals.reduce(
      (sum, deal) => sum + (parseFloat(deal.amount) || 0),
      0,
    );

    const averageDealSize =
      dealsToCalculate.length > 0
        ? Math.round(totalPipeline / dealsToCalculate.length)
        : 0;

    // Real week-over-week trend, based on deal.createdAt (only real timestamp available)
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const thisWeekStart = now - 7 * oneDay;
    const lastWeekStart = now - 14 * oneDay;

    const inRange = (deal, start, end) => {
      const t = new Date(deal.createdAt).getTime();
      return t >= start && t < end;
    };

    const thisWeekDeals = dealsToCalculate.filter((d) => inRange(d, thisWeekStart, now));
    const lastWeekDeals = dealsToCalculate.filter((d) => inRange(d, lastWeekStart, thisWeekStart));

    const sumAmount = (deals) =>
      deals.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);

    const pctChange = (current, previous) => {
      if (previous === 0) return current === 0 ? 0 : 100;
      const pct = Math.round(((current - previous) / previous) * 100);
      return Math.max(-999, Math.min(999, pct));
    };

    const thisWeekWon = thisWeekDeals.filter((d) => d.status === "Won");
    const lastWeekWon = lastWeekDeals.filter((d) => d.status === "Won");
    const thisWeekLost = thisWeekDeals.filter((d) => d.status === "Lost");
    const lastWeekLost = lastWeekDeals.filter((d) => d.status === "Lost");

    const thisWeekAvg = thisWeekDeals.length > 0 ? sumAmount(thisWeekDeals) / thisWeekDeals.length : 0;
    const lastWeekAvg = lastWeekDeals.length > 0 ? sumAmount(lastWeekDeals) / lastWeekDeals.length : 0;

    const trends = {
      pipeline: pctChange(sumAmount(thisWeekDeals), sumAmount(lastWeekDeals)),
      won: pctChange(sumAmount(thisWeekWon), sumAmount(lastWeekWon)),
      avgSize: pctChange(thisWeekAvg, lastWeekAvg),
      lost: pctChange(sumAmount(thisWeekLost), sumAmount(lastWeekLost)),
    };

    const closingDurations = wonDeals
      .map((d) => (new Date(d.updatedAt).getTime() - new Date(d.createdAt).getTime()) / (24 * 60 * 60 * 1000))
      .filter((days) => days >= 0);
    const avgClosingDays = closingDurations.length > 0
      ? Math.round(closingDurations.reduce((sum, d) => sum + d, 0) / closingDurations.length)
      : 0;

    return {
      totalPipeline,
      openCount: openDeals.length,
      wonCount: wonDeals.length,
      lostCount: lostDeals.length,
      totalWon,
      trends,
      totalLost,
      averageDealSize,
      avgClosingDays,
      isFiltered: selectedDeals.length > 0,
    };
  }, [sortedTableDeals, selectedDeals]);

  // NEW: Handle row selection
  const handleSelectDeal = useCallback((dealId) => {
    if (!hasBulkAccess) {
      setShowUpgradeModal(true);
      return;
    }
    setSelectedDeals((prev) =>
      prev.includes(dealId) ? prev.filter((id) => id !== dealId) : [...prev, dealId]
    );
  }, [hasBulkAccess]);

  // NEW: Handle select all
  const handleSelectAll = () => {
    if (!hasBulkAccess) {
      setShowUpgradeModal(true);
      return;
    }
    const pageIds = paginatedTableDeals.map((deal) => deal._id);
    const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedDeals.includes(id));
    if (allPageSelected) {
      setSelectedDeals((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      setSelectedDeals((prev) => [...new Set([...prev, ...pageIds])]);
    }
  };

  // "Select All" grabs every deal matching the current search/filters (all
  // deals are already loaded client-side, so this just selects the full
  // filtered set, not only the current page). "Deselect All" is its
  // counterpart: it doesn't clear the selection outright (that's "Cancel")
  // — it steps back down to only the rows on the current page.
  const handleSelectAllAcrossPages = () => {
    setSelectedDeals(sortedTableDeals.map((deal) => deal._id));
  };

  const handleDeselectAllExtra = () => {
    setSelectedDeals(paginatedTableDeals.map((deal) => deal._id));
  };

  // Kanban column-header "select all in this column" checkbox: given that
  // column's deal ids, unions them in, or — if every one is already
  // selected — removes just those ids, leaving other columns' selections
  // untouched. Same handler is reused for every column.
  const handleToggleColumnSelect = useCallback((dealIds) => {
    setSelectedDeals((prev) => {
      const allSelected = dealIds.every((id) => prev.includes(id));
      return allSelected
        ? prev.filter((id) => !dealIds.includes(id))
        : [...new Set([...prev, ...dealIds])];
    });
  }, []);

  const handleExport = (format) => {
    if (permission === "readonly") {
      toast.error("You do not have permission to export deals.", {
        style: {
          zIndex: 99999,
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          color: "#374151",
          padding: "10px",
          fontSize: "14px",
          maxWidth: "90vw",
        },
      });
      return;
    }

    if (!window.confirm(`Do you want to export in ${format}?`)) {
      return;
    }

    if (format === "excel") {
      if (!window.XLSX) {
        const script = document.createElement("script");
        script.src =
          "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
        script.onload = () => ExcelExporter.export(filteredDeals);
        document.head.appendChild(script);
      } else {
        ExcelExporter.export(filteredDeals);
      }
    } else if (format === "pdf") {
      if (!window.jspdf) {
        const script = document.createElement("script");
        script.src =
          "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
        script.onload = () => PDFExporter.export(filteredDeals);
        document.head.appendChild(script);
      } else {
        PDFExporter.export(filteredDeals);
      }
    }
  };

  const clearFilters = () => {
    setFilters({
      status: "All",
      company: "All",
      minAmount: "",
      maxAmount: "",
      startDate: "",
      endDate: "",
      searchTerm: "",
    });
  };

  // Helper to get color theme for columns
  const getColorTheme = (index, status) => {
    if (status === "Won") return "green";
    if (status === "Lost") return "red";
    const themes = ["blue", "yellow", "purple", "green"];
    return themes[index % themes.length];
  };

  const getStatusTotal = (status) => {
    return filteredDeals
      .filter((deal) => deal.status === status)
      .reduce((total, deal) => total + (parseFloat(deal.amount) || 0), 0);
  };

  const resetForm = () => {
    setForm({
      title: "",
      amount: "",
      status: "Open",
      company: "",
      contact: "",
    });
    setAdditionalFieldValues({});
  };

  const toggleForm = () => {
    if (showForm) {
      resetForm();
    }
    setShowForm(!showForm);
  };

  const formatIndianNumber = (num) => {
    if (!num && num !== 0) return "0";

    const number = parseFloat(num);
    if (isNaN(number)) return "0";

    // Convert to string and split into integer and decimal parts
    const parts = number.toString().split(".");
    let integerPart = parts[0];
    const decimalPart = parts[1] ? "." + parts[1] : "";

    // Handle negative numbers
    const isNegative = integerPart[0] === "-";
    if (isNegative) {
      integerPart = integerPart.slice(1);
    }

    // Apply Indian numbering format
    let lastThree = integerPart.substring(integerPart.length - 3);
    const otherNumbers = integerPart.substring(0, integerPart.length - 3);

    if (otherNumbers !== "") {
      lastThree = "," + lastThree;
    }

    const formatted =
      otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + lastThree;

    return (isNegative ? "-" : "") + formatted + decimalPart;
  };

  if (loading) {
    return (
      <PageSkeleton variant="kanban" boardVariant={showKanban ? "kanban" : "table"} tableRows={dealsPerPage} />
    );
  }

  // Enhanced Confetti Component with Scattered Pieces (Like Image)
  const ConfettiCelebration = ({ deal, onClose }) => {
    useEffect(() => {
      const duration = 5000;
      const animationEnd = Date.now() + duration;

      function randomInRange(min, max) {
        return Math.random() * (max - min) + min;
      }

      // Initial burst of confetti
      const burstCount = 150;
      confetti({
        particleCount: burstCount,
        spread: 180,
        origin: { y: 0.6 },
        colors: [
          "#FFD700",
          "#FFA500",
          "#FF69B4",
          "#00FF00",
          "#00CED1",
          "#FF1493",
          "#FFED4E",
          "#9370DB",
        ],
        shapes: ["square", "circle"],
        scalar: randomInRange(0.8, 1.4),
        zIndex: 99999,
      });

      // Continuous floating confetti like in the image
      const interval = setInterval(function () {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          clearInterval(interval);
          return;
        }

        // Random positions around the screen
        const x = Math.random();
        const y = Math.random() * 0.5;

        confetti({
          particleCount: 2,
          angle: randomInRange(60, 120),
          spread: randomInRange(50, 100),
          origin: { x, y },
          colors: [
            "#FFD700",
            "#FFA500",
            "#FF69B4",
            "#00FF00",
            "#00CED1",
            "#FF1493",
            "#FFED4E",
            "#9370DB",
            "#FF6347",
          ],
          shapes: ["square", "circle"],
          scalar: randomInRange(0.6, 1.2),
          gravity: randomInRange(0.3, 0.6),
          drift: randomInRange(-0.5, 0.5),
          ticks: 400,
          zIndex: 99999,
        });
      }, 100);

      const timeout = setTimeout(() => {
        onClose();
      }, 5000);

      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }, [onClose]);

    return (
      <div className="fixed inset-0 flex items-center justify-center z-[99998] pointer-events-none p-4">
        {/* Semi-transparent backdrop */}
        <div
          className="absolute inset-0 bg-black/5 pointer-events-auto"
          onClick={onClose}
        ></div>

        {/* Modal Card */}
        <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 pointer-events-auto animate-scale-in max-w-md w-full relative z-[99999]">
          <div className="p-10 text-center">
            {/* Green Check Icon */}
            <div className="flex justify-center mb-6 animate-bounce-once">
              <div className="bg-green-500 rounded-full w-16 h-16 flex items-center justify-center shadow-lg">
                <svg
                  className="w-9 h-9 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth="3"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  ></path>
                </svg>
              </div>
            </div>

            {/* Title */}
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Deal Won!</h2>

            {/* Deal Title */}
            <p className="text-base text-gray-700 mb-3 font-medium">
              {deal.title}
            </p>

            {/* Amount */}
            <div className="mb-6">
              <h6 className="text-2xl font-bold text-gray-900">
                ₹{formatNumberToIndian(parseInt(deal.amount || 0))}
              </h6>
            </div>

            {/* Motivational Message */}
            <p className="text-sm text-gray-600 leading-relaxed">
              Great job! Keep up the amazing work! 💪
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white min-h-screen font-sans">
      <AppToaster />

      {/* Video Tutorial Modal */}
      <VideoTutorialModal
        isOpen={showVideoTutorial}
        onClose={() => setShowVideoTutorial(false)}
        videoId={getVideoTutorial("deals")?.videoId}
        title={getVideoTutorial("deals")?.title}
      />

      <ColumnSettingsPanel
        isOpen={showColumnSettings}
        onClose={() => setShowColumnSettings(false)}
        columns={columns}
        onSave={saveColumns}
        moduleName="Deals"
      />

      {/* NEW: Confetti Celebration Modal */}
      {celebrationDeal && (
        <ConfettiCelebration
          deal={celebrationDeal}
          onClose={() => setCelebrationDeal(null)}
        />
      )}

      {/* New Strip */}
      <div
        className={`fixed right-0 border-b flex items-center justify-between gap-2 lg:gap-4 px-4 sm:px-6 lg:px-8 top-[calc(54px+var(--dc-offline-offset,0px))] lg:top-[calc(64px+var(--dc-offline-offset,0px))] bg-white border-[#E1E4EA]`}
        style={{
          left: "var(--sidebar-width, 0px)",
          zIndex: 40,
          height: "64px",
          minHeight: "64px",
          maxHeight: "64px",
          boxSizing: "border-box",
        }}
      >
        {showBulkStrip ? (
          <div className={`${bulkStripClosing ? "animate-slideOutRight" : "animate-slideInLeft"} flex flex-nowrap items-center justify-between gap-4 w-full h-full overflow-x-auto`}>
            {/* One joined strip instead of separate pills, matching Companies: no gap
    between buttons, rounding only on the two outer corners, and each
    border pulled left by 1px onto its neighbour so touching borders
    don't double up. Only the icons carry each action's colour. */}
            <div className="flex flex-nowrap items-center flex-shrink-0">
              <button
                onClick={() => setShowExportModal(true)}
                className="h-10 px-4 bg-white border border-gray-300 text-gray-900 text-sm font-medium rounded-l-[25px] hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
              >
                <DownloadIcon className="w-4 h-4 text-green-600" />
                Export
              </button>
              <button
                onClick={() => setShowBulkActions(true)}
                className="h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
              >
                <EditIcon className="w-4 h-4 text-blue-600" />
                Bulk Update
              </button>
              <button
                onClick={() => setShowBulkDeleteModal(true)}
                disabled={loading}
                className="h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 disabled:opacity-50 flex-shrink-0 whitespace-nowrap"
              >
                <DeleteIcon className="w-4 h-4 text-red-600" />
                Delete
              </button>
              <button
                onClick={() => {
                  setSelectionMode(false);
                  setSelectedDeals([]);
                }}
                className="h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium rounded-r-[25px] hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <CheckSquare className="w-5 h-5 text-blue-600 flex-shrink-0" />
              <span className="text-blue-800 font-semibold font-inter whitespace-nowrap">
                {selectedDeals.length} deal{selectedDeals.length !== 1 ? "s" : ""} selected
              </span>
              <button
                onClick={handleSelectAllAcrossPages}
                className="h-10 px-4 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-[25px] hover:bg-gray-50 focus:outline-none transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
              >
                <CheckSquare className="w-4 h-4" />
                Select All
              </button>
              <button
                onClick={handleDeselectAllExtra}
                className="h-10 px-4 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-[25px] hover:bg-gray-50 focus:outline-none transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
              >
                <X className="w-4 h-4" />
                Deselect All
              </button>
            </div>
          </div>
        ) : (
          <>
            <div
              className={`flex flex-col gap-1 flex-shrink-0 overflow-hidden transition-opacity duration-300 ease-in-out lg:!w-auto lg:!opacity-100 ${isSearchExpanded ? "w-0 opacity-0" : "w-[160px] opacity-100"}`}
            >
              <div className="flex items-center gap-2">
                <h2
                  className="m-0 font-medium truncate text-sm sm:text-base"
                  style={{ lineHeight: "120%", letterSpacing: "-0.5px", color: "#0E121B" }}
                >
                  Deals
                </h2>
                <VideoIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
              </div>
              <p className="text-[#5B5A64] text-[10px] sm:text-sm m-0 leading-tight truncate">
                Manage Your Sales Pipeline
              </p>
            </div>

            {/* Search — flex-1 so it fills exactly the space freed by the title collapsing, same as Companies */}
            <div className="relative flex-1 min-w-0 flex items-center justify-end">
              <div
                className={`relative h-10 flex items-center border ${filters.searchTerm ? "border-[#0085FF]" : "border-[#E1E4EA]"} rounded-full bg-white transition-all duration-300 ease-in-out hover:bg-gray-50 focus-within:border-[#0085FF] focus-within:hover:bg-white ${isSearchExpanded ? "w-full lg:w-[416px]" : "w-10"} max-w-full`}
              >
                <SearchIcon
                  className="absolute left-3 cursor-pointer z-10 flex-shrink-0 top-1/2 -translate-y-1/2 w-4 h-4 text-[#525866]"
                  onClick={() => {
                    setIsSearchExpanded(true);
                    searchInputRef.current?.focus();
                  }}
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={filters.searchTerm}
                  onChange={(e) =>
                    setFilters({ ...filters, searchTerm: e.target.value })
                  }
                  onFocus={() => setIsSearchExpanded(true)}
                  onBlur={() => {
                    if (!filters.searchTerm) setIsSearchExpanded(false);
                  }}
                  className={`w-full h-full pl-9 pr-9 bg-transparent text-sm focus:outline-none transition-opacity duration-200 font-inter cursor-pointer ${isSearchExpanded ? "opacity-100 focus:cursor-text" : "opacity-0"}`}
                  placeholder="Search deals by title, company, or status..."
                />
                {/* Clears the typed text only — box stays open. mousedown+
                preventDefault stops the input's onBlur (which would collapse
                the box) from firing before the click lands. */}
                {isSearchExpanded && filters.searchTerm && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setFilters({ ...filters, searchTerm: "" })}
                    aria-label="Clear search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-5 h-5 rounded-full text-gray-900 hover:bg-gray-100 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" strokeWidth={2.5} />
                  </button>
                )}
              </div>
            </div>

            {/* Filters, Switcher, Actions — fixed-size group */}
            <div className="relative flex items-center gap-2 lg:gap-4 flex-shrink-0">
              {/* Filters — folded into the three-dot menu on mobile */}
              <button
                onClick={() => setShowFilters(true)}
                className="hidden lg:flex relative items-center justify-center w-10 h-10 rounded-full border border-[#E1E4EA] text-gray-500 hover:bg-gray-50 transition-colors flex-shrink-0"
                title="Filters"
              >
                <FilterIcon size={16} />
                {activeAdvancedFilters.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-[#0085FF] text-white text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full">
                    {activeAdvancedFilters.length}
                  </span>
                )}
              </button>

              {/* List / Kanban Toggle — folded into the three-dot menu on mobile */}
              <div className="hidden lg:flex relative items-center bg-gray-100 rounded-full p-1 flex-shrink-0 overflow-hidden">
                <span
                  className="absolute top-1 w-8 h-8 rounded-full bg-white shadow-sm transition-all duration-300 ease-out pointer-events-none"
                  style={{ left: showKanban ? 36 : 4 }}
                />
                <button
                  onClick={() => setShowKanban(false)}
                  className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-full transition-colors ${!showKanban ? "text-blue-600" : "text-gray-500 hover:text-gray-700"}`}
                  title="List View"
                >
                  <TableViewIcon size={16} className="text-current" />
                </button>
                <button
                  onClick={() => setShowKanban(true)}
                  className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-full transition-colors ${showKanban ? "text-blue-600" : "text-gray-500 hover:text-gray-700"}`}
                  title="Kanban View"
                >
                  <KanbanViewIcon size={16} className="text-current" />
                </button>
              </div>

              {/* More options */}
              <div className="relative" ref={moreMenuRef}>
                <button
                  onClick={() => setIsMoreMenuOpen((prev) => !prev)}
                  className="flex items-center justify-center w-10 h-10 rounded-full border border-[#E1E4EA] text-gray-500 hover:bg-gray-50 transition-colors"
                  title="More options"
                >
                  <MoreIcon className="w-4 h-4" />
                </button>

                {isMoreMenuOpen && (
                  <div className="absolute right-0 z-50 mt-2 w-56 bg-white border border-gray-100 rounded-xl shadow-xl py-1 animate-in fade-in zoom-in duration-200 origin-top-right">
                    {/* Filters + List/Kanban: mobile-only entries, folded in here instead of their own controls */}
                    <button
                      onClick={() => {
                        setShowFilters(true);
                        setIsMoreMenuOpen(false);
                      }}
                      className="lg:hidden w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <FilterIcon size={16} />
                      Filters
                      {activeAdvancedFilters.length > 0 && (
                        <span className="ml-auto bg-[#0085FF] text-white text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full">
                          {activeAdvancedFilters.length}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setShowKanban(false);
                        setIsMoreMenuOpen(false);
                      }}
                      className="lg:hidden w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <TableViewIcon size={16} className="flex-shrink-0 text-gray-400" />
                      List View
                      {!showKanban && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-600" />}
                    </button>
                    <button
                      onClick={() => {
                        setShowKanban(true);
                        setIsMoreMenuOpen(false);
                      }}
                      className="lg:hidden w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <KanbanViewIcon size={16} className="flex-shrink-0 text-gray-400" />
                      Kanban View
                      {showKanban && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-600" />}
                    </button>
                    <button
                      onClick={() => {
                        setShowStats((prev) => !prev);
                        setIsMoreMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <EyeIcon className="w-4 h-4 text-gray-400" />
                      {showStats ? "Hide KPIs" : "Unhide KPIs"}
                    </button>
                    
                    <button
                      onClick={() => {
                        setShowImport(true);
                        setIsMoreMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <UploadIcon className="w-4 h-4 text-gray-400" />
                      Import
                    </button>
                    <div className="relative" ref={exportButtonRef}>
                      <button
                        onClick={() => setShowExportMenu((prev) => !prev)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <DownloadIcon className="w-4 h-4 text-gray-400" />
                        Export
                      </button>
                      {showExportMenu && (
                        <div className="absolute left-full top-0 ml-1 z-10 w-44 bg-white border border-gray-200 rounded-lg shadow-xl">
                          <button
                            onClick={() => {
                              handleExport("excel");
                              setShowExportMenu(false);
                              setIsMoreMenuOpen(false);
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors first:rounded-t-lg flex items-center gap-2"
                          >
                            Export as Excel
                          </button>
                          <button
                            onClick={() => {
                              handleExport("pdf");
                              setShowExportMenu(false);
                              setIsMoreMenuOpen(false);
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors last:rounded-b-lg flex items-center gap-2"
                          >
                            Export as PDF
                          </button>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setShowColumnSettings(true);
                        setIsMoreMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <SettingsIcon className="w-4 h-4 text-gray-400" />
                      Columns
                    </button>
                    <button
                      onClick={() => {
                        setShowSettings(true);
                        setIsMoreMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <SettingsIcon className="w-4 h-4 text-gray-400" />
                      Deal Settings
                    </button>
                  </div>
                )}
              </div>

              {/* Add Deal Button — icon-only on mobile */}
              <button
                onClick={() => {
                  setEditDeal(null);
                  setShowQuickAdd((v) => !v);
                }}
                title={showQuickAdd && !editDeal ? "Cancel" : "New Deal"}
                className="inline-flex items-center justify-center gap-2 h-10 w-10 lg:w-auto px-0 lg:px-4 bg-[#0085FF] text-white text-sm font-medium rounded-full hover:bg-blue-600 focus:outline-none cursor-pointer transition-colors flex-shrink-0"
              >
                <PlusIcon className="w-4 h-4 flex-shrink-0" />
                <span className="hidden lg:inline">{showQuickAdd && !editDeal ? "Cancel" : "New Deal"}</span>
              </button>
            </div>
          </>
        )}
      </div>

      {showStats && (
        <div
          className="fixed right-0 box-border flex flex-col justify-start items-start bg-white border-b border-[#E1E4EA] top-[calc(118px+var(--dc-offline-offset,0px))] lg:top-[calc(128px+var(--dc-offline-offset,0px))] h-[156px] lg:h-[104px] px-4 sm:px-6 lg:px-8 py-4 lg:py-6"
          style={{
            left: "var(--sidebar-width, 0px)",
            zIndex: 39,
            boxSizing: "border-box",
          }}
        >
          {/* KPI Strip */}
          <div className="grid grid-cols-2 gap-3 lg:flex lg:flex-row lg:items-center lg:gap-6 self-stretch">
            {[
              { label: "Pipeline Summary", value: `₹${formatNumberToIndian(dealStatistics.totalPipeline)}`, icon: PipelineSummaryIcon, trend: `${Math.abs(dealStatistics.trends.pipeline)}% this week`, trendUp: dealStatistics.trends.pipeline >= 0 },
              { label: "Deals Won", value: dealStatistics.wonCount, icon: WonDealIcon, trend: `${Math.abs(dealStatistics.trends.won)}% this week`, trendUp: dealStatistics.trends.won >= 0 },
              { label: "Avg. Deal Size", value: `₹${formatNumberToIndian(dealStatistics.averageDealSize)}`, icon: AvgDealSizeIcon, trend: `${Math.abs(dealStatistics.trends.avgSize)}% this week`, trendUp: dealStatistics.trends.avgSize >= 0 },
              { label: "Deals Lost", value: dealStatistics.lostCount, icon: LostDealIcon, trend: `${Math.abs(dealStatistics.trends.lost)}% this week`, trendUp: dealStatistics.trends.lost >= 0 },
            ].map((kpi) => (
              <StatTile
                key={kpi.label}
                tile={{
                  ...kpi,
                  subtitle: kpi.trend,
                  subtitleIcon: kpi.trendUp ? TrendingUp : TrendingDown,
                  subtitleColor: kpi.trendUp ? "#00C950" : "#E82222",
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* No space-y on this wrapper: every child bar the table block is a
          modal or a fixed drawer, so the only thing it ever did was push the
          table 32px further below the KPI strip. */}
      <div
        className={`-mx-4 sm:-mx-6 lg:-mx-8 px-6 pb-6 ${showStats
            ? showKanban ? "mt-[286px] lg:mt-[168px]" : "mt-[270px] lg:mt-[152px]"
            : showKanban ? "mt-16" : "mt-12"
          }`}
      >
        {/* Modals & Overlays */}
        <AdvancedFilterPanel
          isOpen={showFilters}
          onClose={() => setShowFilters(false)}
          columns={dealFilterColumns}
          data={deals}
          getFieldValue={getDealFieldValue}
          filters={activeAdvancedFilters}
          setFilters={setActiveAdvancedFilters}
          onApply={(newFilters) => setActiveAdvancedFilters(newFilters)}
          title="Filter Deals"
          subtitle="Find specific deals quickly"
          emptyStateText="Add a rule to narrow down your deal list."
        />
        <ImportDeals
          isOpen={showImport}
          onClose={() => setShowImport(false)}
          dealFieldNames={dealFields}
          onImportSuccess={() => {
            fetchDeals();
            toast.success("Deals imported successfully");
          }}
        />

        {/* Single shared form for both create and edit deal. */}
        {showQuickAdd && (
          <QuickDealForm
            companies={companies}
            contacts={contacts}
            editDeal={editDeal}
            onDealCreated={() => {
              fetchDeals();
              setShowQuickAdd(false);
            }}
            onDealUpdated={() => {
              fetchDeals();
              setShowQuickAdd(false);
              setEditDeal(null);
            }}
            onRequestClose={() => {
              setShowQuickAdd(false);
              setEditDeal(null);
            }}
          />
        )}

        {/* Delete Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10000] p-4">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <DeleteIcon className="w-6 h-6 text-red-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 text-center mb-2">
                Delete Deal?
              </h2>
              <p className="text-sm text-gray-600 text-center mb-6">
                This action cannot be undone. The deal will be permanently
                removed from your pipeline.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setDealToDelete(null);
                  }}
                  className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-semibold text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteDeal}
                  className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-semibold text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        <DealSettingSidebar
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          staleDays={staleDays}
          setStaleDays={setStaleDays}
        />

        {quickViewDealId && (
          <DealQuickView
            dealId={quickViewDealId}
            onClose={() => setQuickViewDealId(null)}
            onEdit={(deal) => {
              handleEditDeal(deal);
              // optionally: setQuickViewDealId(null);
            }}
          />
        )}

        {/* --- MAIN CONTENT AREA --- */}
        {showKanban ? (
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetectionStrategy}
            measuring={DND_MEASURING}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            {/* overflow-y no longer hidden here — columns now size to their
                natural content height (like CompanyDealsKanban.jsx's board),
                so the page itself scrolls to reveal more cards instead of a
                fixed-height column clipping them. Horizontal scroll for
                sliding between Open/Won/Lost is unchanged. */}
            <div
              className="overflow-x-auto scrollbar-hide -mx-6"
              style={{ padding: "16px 24px 24px" }}
            >
              <div className="flex min-w-max" style={{ gap: "16px" }}>
                {statuses?.map((status) => {
                  const columnDeals = dealsByStatus[status] ?? [];
                  const colorTheme =
                    status === "Won" ? "green" : status === "Lost" ? "red" : "blue";
                  return (
                    <ModernKanbanColumn
                      key={status}
                      status={status}
                      deals={columnDeals}
                      totalDealsCount={sortedTableDeals.length}
                      colorTheme={colorTheme}
                      onAddClick={toggleForm}
                      handleEditDeal={handleEditDeal}
                      handleDeleteDeal={handleDeleteDeal}
                      onQuickView={setQuickViewDealId}
                      isStale={isStale}
                      loading={showKanbanSkeleton}
                      selectedDeals={selectedDeals}
                      onToggleSelect={handleSelectDeal}
                      onToggleColumnSelect={handleToggleColumnSelect}
                    />
                  );
                })}
              </div>
            </div>
            {createPortal(
              <DragOverlay dropAnimation={null}>
                {activeDeal ? (
                  <ModernDealCard deal={activeDeal} onClick={() => { }} isStale={isStale} />
                ) : null}
              </DragOverlay>,
              document.body,
            )}
          </DndContext>
        ) : (
          <div>
            {/* Table View Implementation (Kept original logic) */}
            {/* Table View Implementation */}
            {/* Bulk-actions banner now lives in the fixed title strip (replaces it when rows are selected) */}

            <div
              ref={tableScrollRef}
              className="overflow-x-auto overflow-y-auto top-[calc(118px+156px+var(--dc-offline-offset,0px))] lg:top-[calc(128px+104px+var(--dc-offline-offset,0px))]"
              style={{
                // Edge-to-edge fixed pane bounded between the KPI strip
                // (118/156 mobile, 128/104 desktop — its own top+height, so
                // this starts exactly where that ends) and the pagination
                // bar, same architecture Companies.jsx already uses — not a
                // bordered/rounded "card" floating in normal page flow.
                position: "fixed",
                left: "var(--sidebar-width, 0px)",
                right: 0,
                bottom: 64,
                background: "#fff",
              }}
            >
                <DealsTable
                  scrollContainerRef={tableScrollRef}
                  sortedTableDeals={paginatedTableDeals}
                  selectedRows={selectedDeals}
                  handleSelectAll={handleSelectAll}
                  handleRowSelect={handleSelectDeal}
                  handleRowMouseDown={handleRowMouseDown}
                  handleRowMouseUp={handleRowMouseUp}
                  handleRowTouchStart={handleRowTouchStart}
                  handleRowTouchEnd={handleRowTouchEnd}
                  handleStatusChange={handleStatusChange}
                  handleEditDeal={handleEditDeal}
                  handleDeleteDeal={handleDeleteDeal}
                  isStale={isStale}
                  statuses={statuses}
                  permission={permission}
                  sortConfig={sortConfig}
                  handleSort={handleSort}
                  setQuickViewDealId={setQuickViewDealId}
                  toggleStar={toggleStar}
                  loading={loading}
                  skeletonRows={dealsPerPage}
                  searchTerm={filters.searchTerm}
                  externalHiddenColumns={persistedHiddenColumnKeys}
                  externalColumnOrder={persistedColumnOrderKeys}
                />
              </div>

            {sortedTableDeals.length > 0 && !showKanban && (
              <div
                className={`fixed bottom-0 right-0 bg-white border-t border-[#E1E4EA] shadow-sm z-[9992] flex items-center justify-between px-4 sm:px-6 ${isSearchOverlayOpen ? "pointer-events-none" : ""}`}
                style={{
                  left: "var(--sidebar-width, 0px)",
                  height: 64,
                  filter: isSearchOverlayOpen ? "brightness(0.6)" : "none",
                }}
              >
                <div className="flex-1 flex justify-between sm:hidden">
                  <button
                    onClick={() => setDealsCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={dealsCurrentPageClamped === 1}
                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setDealsCurrentPage((p) => Math.min(dealsTotalPages, p + 1))}
                    disabled={dealsCurrentPageClamped === dealsTotalPages}
                    className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>

                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                  <div className="flex items-center space-x-2">
                    <p className="text-sm text-gray-700 font-inter">
                      Showing{" "}
                      <span className="font-semibold">
                        {(dealsCurrentPageClamped - 1) * dealsPerPage + 1}
                      </span>{" "}
                      to{" "}
                      <span className="font-semibold">
                        {Math.min(dealsCurrentPageClamped * dealsPerPage, sortedTableDeals.length)}
                      </span>{" "}
                      of <span className="font-semibold">{sortedTableDeals.length}</span> results
                    </p>
                    <div className="relative ml-2">
                      <select
                        value={dealsPerPage}
                        onChange={(e) => {
                          setDealsPerPage(parseInt(e.target.value));
                          setDealsCurrentPage(1);
                        }}
                        className="appearance-none border border-gray-300 rounded-lg pl-3 pr-8 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer font-inter"
                      >
                        <option value={10}>10 per page</option>
                        <option value={20}>20 per page</option>
                        <option value={50}>50 per page</option>
                        <option value={100}>100 per page</option>
                      </select>
                      <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setDealsCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={dealsCurrentPageClamped === 1}
                      className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>

                    {(() => {
                      const commitPage = () => {
                        const n = parseInt(dealsPageInput, 10);
                        if (!Number.isNaN(n)) setDealsCurrentPage(Math.min(Math.max(n, 1), dealsTotalPages));
                        setDealsEditingPage(false);
                      };
                      const items = [1];
                      if (dealsCurrentPageClamped > 2) items.push("left-dots");
                      if (dealsCurrentPageClamped !== 1 && dealsCurrentPageClamped !== dealsTotalPages) items.push(dealsCurrentPageClamped);
                      if (dealsCurrentPageClamped < dealsTotalPages - 1) items.push("right-dots");
                      if (dealsTotalPages > 1) items.push(dealsTotalPages);

                      return items.map((item, index) => {
                        if (item === "left-dots" || item === "right-dots") {
                          return (
                            <span key={`${item}-${index}`} className="flex items-center justify-center w-8 h-8 text-sm font-medium text-gray-400 select-none">
                              ....
                            </span>
                          );
                        }
                        const isCurrent = item === dealsCurrentPageClamped;
                        if (isCurrent && dealsEditingPage) {
                          return (
                            <input
                              key="page-edit"
                              autoFocus
                              type="number"
                              min={1}
                              max={dealsTotalPages}
                              value={dealsPageInput}
                              onChange={(e) => setDealsPageInput(e.target.value)}
                              onBlur={commitPage}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitPage();
                                if (e.key === "Escape") setDealsEditingPage(false);
                              }}
                              className="w-10 h-8 rounded-full border border-blue-500 text-center text-sm font-medium text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            />
                          );
                        }
                        return (
                          <button
                            key={`page-${item}`}
                            onClick={() => setDealsCurrentPage(item)}
                            onDoubleClick={() => {
                              if (isCurrent) {
                                setDealsPageInput(String(dealsCurrentPageClamped));
                                setDealsEditingPage(true);
                              }
                            }}
                            title={isCurrent ? "Double-click to type a page number" : undefined}
                            className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors ${isCurrent ? "bg-[#0085FF] text-white" : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"}`}
                          >
                            {item}
                          </button>
                        );
                      });
                    })()}

                    <button
                      onClick={() => setDealsCurrentPage((p) => Math.min(dealsTotalPages, p + 1))}
                      disabled={dealsCurrentPageClamped === dealsTotalPages}
                      className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            <BulkActions
              isOpen={showBulkActions}
              onClose={() => setShowBulkActions(false)}
              selectedItems={sortedTableDeals.filter((d) =>
                selectedDeals.includes(d._id),
              )}
              onBulkUpdate={handleBulkUpdateDeals}
              fieldConfig={dealFieldConfig}
              module="deals"
            />

            {/* Export Selected Deals Modal */}
            <ExportModal
              isOpen={showExportModal}
              onClose={() => setShowExportModal(false)}
              columns={exportColumns}
              selectedIds={selectedDeals}
              exportUrl="/deals/export-selected"
              fileName="Exported_Deals.csv"
            />

            <BulkDeleteModal
              isOpen={showBulkDeleteModal}
              message={
                <>
                  Are you sure you want to delete <strong>{selectedDeals.length}</strong> deals?
                  This action cannot be undone.
                </>
              }
              loading={loading}
              onCancel={() => setShowBulkDeleteModal(false)}
              onConfirm={async () => {
                await handleBulkDeleteDeals(selectedDeals);
                setShowBulkDeleteModal(false);
              }}
              onExportBeforeDelete={() => {
                const records = deals.filter((d) => selectedDeals.includes(d._id));
                exportRecordsToCSV(records, "deals");
              }}
            />
          </div>
        )}
      </div>

      {/* handleSelectDeal/handleSelectAll set showUpgradeModal for a
          below-Growth plan, but nothing ever rendered it — clicking a row
          checkbox on Trial silently did nothing, with no explanation. */}
      <UpgradeRequiredModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        minPlan="growth"
        feature="Selecting multiple rows"
      />
    </div>
  );
}

export default Deals;
import PageSkeleton from "../components/common/PageSkeleton";
import Skeleton from "../components/common/Skeleton";
import DealCardSkeleton from "../components/common/DealCardSkeleton";
import SearchIcon from "../components/common/SearchIcon";
import SettingsIcon from "../components/common/SettingsIcon";
import UploadIcon from "../components/common/UploadIcon";
import EyeIcon from "../components/common/EyeIcon";
import EditIcon from "../components/common/EditIcon";
