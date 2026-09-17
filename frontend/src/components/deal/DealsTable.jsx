import CalendarIcon from "../common/CalendarIcon";
import DeleteIcon from "../common/DeleteIcon";
import PdfIcon from "../common/PdfIcon";
import Checkbox from "../common/Checkbox";
import MoreIcon from "../common/MoreIcon";
import React, { useState, useMemo, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPortal } from "react-dom";
import { formatNumberToIndian } from "../../utils/numberFormatter";
import { getPinnedBoundaryOverlayStyle } from "../../utils/pinnedColumnShadow";
import {
  Tag,
  IndianRupee,
  Building2,
  ChevronsUpDown,
  ChevronUp,
  ChevronDown,
  Pin,
  PinOff,
  EyeOff,
  ArrowUp, ArrowDown } from "lucide-react";
import CustomDropdown from "../common/CustomDropdown";
import TableSkeletonRows from "../common/TableSkeletonRows";

// TanStack Table
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import EyeIcon from "../common/EyeIcon";
import EditIcon from "../common/EditIcon";

// The app scales its desktop layout via a dynamic CSS `zoom` on <html> (App.jsx).
// getBoundingClientRect() returns UNSCALED layout coordinates while portal overlays on
// document.body render in visual space, so rect-derived positions must be multiplied by
// this zoom factor to line up on screen.
const getRootZoom = () => {
  if (typeof window === "undefined") return 1;
  const z = parseFloat(getComputedStyle(document.documentElement).zoom);
  return z && !Number.isNaN(z) ? z : 1;
};

// Same ancestor-zoom walk as the shared DataTable component's drag-ghost, so the
// portal-mounted ghost tracks the cursor 1:1 regardless of window size / zoom.
const getAncestorZoom = (el) => {
  let z = 1;
  let node = el;
  while (node && node.nodeType === 1) {
    const cz = parseFloat(getComputedStyle(node).zoom);
    if (cz && !Number.isNaN(cz)) z *= cz;
    node = node.parentElement;
  }
  return z || 1;
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

export default function DealsTable({
  sortedTableDeals = [],
  selectedRows = [],
  handleSelectAll,
  handleRowSelect,
  handleRowMouseDown,
  handleRowMouseUp,
  handleRowTouchStart,
  handleRowTouchEnd,
  handleStatusChange,
  handleEditDeal,
  handleDeleteDeal,
  isStale,
  statuses = [],
  permission = "readonly",
  sortConfig = {},
  handleSort,
  selectionMode = false,
  loading = false,
  skeletonRows = 12,
  setQuickViewDealId,
  toggleStar,
  searchTerm = "",
  scrollContainerRef,
  // Persisted column choices from the page's "Columns" panel
  // (useColumnSettings("deals", ...) in Deals.jsx). Unioned with this
  // table's own per-session "Hide Column" quick action below, so both
  // routes to hiding a column work; order only falls back to this when the
  // user hasn't dragged columns around in this session yet.
  externalHiddenColumns = [],
  externalColumnOrder = [],
}) {
  const [columnSizing, setColumnSizing] = useState({});

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

  const COLUMN_LABELS = {
    dealId: "Deal ID",
    title: "Deal Name",
    company: "Company",
    contact: "Contact",
    status: "Stage",
    amount: "Amount",
    dueDate: "Due Date",
  };

  const getColumnPreviewValue = (deal, colId) => {
    switch (colId) {
      case "dealId":
        return `DL-${deal._id.slice(-5).toUpperCase()}`;
      case "title":
        return deal.title || "-";
      case "company":
        return deal.company?.name || "-";
      case "contact":
        return deal.contact?.name || "-";
      case "status":
        return deal.status || "-";
      case "amount":
        return `₹${formatNumberToIndian(parseInt(deal.amount || 0))}`;
      case "dueDate": {
        const dueDateField = deal.additionalFields?.find((f) => f.key === "Expected Close Date");
        return dueDateField?.value
          ? new Date(dueDateField.value).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })
          : "-";
      }
      default:
        return "-";
    }
  };

  const startColumnDrag = (e, colId) => {
    if (e.button !== 0) return;
    if (e.target.closest("button") || e.target.closest("[data-resize-handle]")) return;

    // The column menu has its own trigger — the chevron button in
    // renderHeaderMenu, with its own onClick, its own zoom-corrected
    // positioning, and its own boundsRight clamp. This function used to also
    // open the menu on `e.detail === 1` (i.e. any plain click anywhere on the
    // header), which fired on every single click — not just the button — and
    // `return`ed before the mousemove/mouseup listeners below were ever
    // attached, so a genuine single-press-and-drag could never start either.
    // Column reordering here is movement-threshold based (see DRAG_THRESHOLD
    // below), not double-click based, so removing this unblocks both: a plain
    // click on the header now does nothing, and press-and-drag (single click,
    // no double-click needed) reorders columns.
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
      const label = COLUMN_LABELS[colId] || colId;
      const previewRows = sortedTableDeals.map((d) => String(getColumnPreviewValue(d, colId)));
      dragState.zGhost = getAncestorZoom(document.body);
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
        reorderColumns(colId, overKey, middleColIds);
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

  // Lock page scroll while a row-actions or column-options menu is open so the
  // background (and this horizontally-scrollable table) can't shift/scroll out from
  // under the portal-positioned menu. Any scroll/wheel/touch/keyboard-scroll attempt
  // closes the menu instead of moving the page.
  useEffect(() => {
    if (!openRowActionsId && !openColMenuKey) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const SCROLL_KEYS = ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "];
    const closeMenu = () => {
      setOpenRowActionsId(null);
      setRowActionsPos(null);
      setOpenColMenuKey(null);
      setColMenuPos(null);
    };
    const handleWheel = (e) => {
      e.preventDefault();
      closeMenu();
    };
    const handleTouchMove = () => closeMenu();
    const handleKeyDown = (e) => {
      if (SCROLL_KEYS.includes(e.key)) closeMenu();
    };
    const handleScroll = () => closeMenu();

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

  const columnHelper = createColumnHelper();

  // Reusable header: icon + label (sortable via click) + dropdown-menu trigger
  // (Pin Left / Pin Right / Sort Asc / Sort Desc / Hide Column), matching the
  // Dashboard "Top Invoices" table exactly.
  const renderHeaderMenu = (colKey, label, Icon, { sortable = true } = {}) => {
    const isMenuOpen = openColMenuKey === colKey;
    const pinSide = getColumnPinSide(colKey);
    return (
      <div className="flex items-center justify-between w-full group">
        {/* Not clickable — a plain click on the header does nothing now. Sorting
            lives only in the column menu (Sort Ascending/Descending below);
            `sortable` still gates whether those two menu items render at all. */}
        <div className="flex items-center gap-2 flex-1 overflow-hidden select-none">
          <span className="truncate" title={label}>{label}</span>
          {sortConfig.key === colKey && (sortConfig.direction === "asc"
            ? <ArrowUp className="w-3 h-3 text-[#0085FF] flex-shrink-0" />
            : <ArrowDown className="w-3 h-3 text-[#0085FF] flex-shrink-0" />)}
          {pinSide && (
            <Pin
              size={12}
              className="text-blue-500 fill-blue-500 flex-shrink-0"
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
            // rect + boundsRight are VISUAL px; the menu is portaled into
            // document.body, which paints inside the dynamic <html> zoom, so
            // every rect-derived value we set must be divided by that zoom
            // (same correction as the drag-ghost above). Without it the menu
            // drifts right by rect.right * (zoom - 1) — worst on the last columns.
            const zMenu = getAncestorZoom(document.body);
            const MENU_W = 160;
            const rect = e.currentTarget.getBoundingClientRect();
            const boundsRight = scrollContainerRef?.current?.getBoundingClientRect().right ?? window.innerWidth;
            let calcLeft = rect.right / zMenu - MENU_W;
            calcLeft = Math.min(calcLeft, boundsRight / zMenu - MENU_W - 8);
            calcLeft = Math.max(calcLeft, 8);
            setColMenuPos({ top: rect.bottom / zMenu + 4, left: calcLeft });
            setOpenColMenuKey(colKey);
          }}
          className="p-1 rounded hover:bg-gray-200 transition-colors text-gray-500 flex-shrink-0"
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
                  pinSide === "left" ? unpinColumn(colKey) : pinColumnToSide(colKey, "left");
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
                  pinSide === "right" ? unpinColumn(colKey) : pinColumnToSide(colKey, "right");
                }}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${pinSide === "right" ? "bg-blue-50 text-blue-700" : "text-[#161618] hover:bg-gray-50"}`}
              >
                {pinSide === "right" ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5 text-[#1C1B1F]" />}
                Pin to Right
              </button>

              {sortable && (
                <>
                  <button
                    onClick={() => {
                      setOpenColMenuKey(null);
                      setColMenuPos(null);
                      handleSort(colKey);
                    }}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${sortConfig.key === colKey && sortConfig.direction === "asc" ? "bg-blue-50 text-blue-700 font-medium" : "text-[#161618] hover:bg-gray-50"}`}
                  >
                    <ChevronUp className="w-3.5 h-3.5 text-[#1C1B1F]" />
                    Sort Ascending
                  </button>
                  <button
                    onClick={() => {
                      setOpenColMenuKey(null);
                      setColMenuPos(null);
                      handleSort(colKey);
                    }}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${sortConfig.key === colKey && sortConfig.direction === "desc" ? "bg-blue-50 text-blue-700 font-medium" : "text-[#161618] hover:bg-gray-50"}`}
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
                  hideColumn(colKey);
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
    );
  };

  const columns = useMemo(() => {
    const baseCols = [
      // 1. Selection Checkbox Column
      columnHelper.display({
        id: "selection",
        size: 60,
        enableResizing: false,
        header: () => (
          <div className="flex justify-center items-center w-full">
            <Checkbox checked={
                sortedTableDeals.length > 0 &&
                sortedTableDeals.every((deal) => selectedRows.includes(deal._id))
              } onChange={(e) => {
                e.stopPropagation();
                handleSelectAll(e);
              }} uncheckedColor="text-[#525866]" />
          </div>
        ),
        cell: ({ row }) => (
          <div className="flex justify-center items-center w-full">
            <Checkbox checked={selectedRows.includes(row.original._id)} onChange={(e) => {
                e.stopPropagation();
                handleRowSelect(row.original._id);
              }} />
          </div>
        ),
      }),

      // 2. Deal ID Column
      columnHelper.display({
        id: "dealId",
        size: 127,
        header: () => renderHeaderMenu("dealId", "Deal ID", null),
        cell: ({ row }) => {
          const shortId = row.original._id.slice(-5).toUpperCase();
          return (
            <span className="text-sm font-medium text-[#525866] truncate" title={`DL-${shortId}`}>
              <HighlightText text={`DL-${shortId}`} query={searchTerm} />
            </span>
          );
        },
      }),

      // 3. Title Column
      columnHelper.accessor("title", {
        id: "title",
        size: 185,
        header: () => renderHeaderMenu("title", "Deal Name", PdfIcon),
        cell: ({ row, getValue }) => {
          const deal = row.original;
          return (
            <div className="flex items-center justify-between w-full group relative">
              <Link
                to={`/deals/${deal._id}`}
                state={{ dealIds: sortedTableDeals.map((d) => d._id) }}
                onClick={(e) => e.stopPropagation()}
                className="text-sm font-medium text-blue-600 hover:underline transition-all duration-150 ease-out truncate flex-1 pr-4"
                title={getValue()}
              >
                <HighlightText text={getValue()} query={searchTerm} />
              </Link>
            </div>
          );
        },
      }),

      // Company
      columnHelper.accessor((row) => row.company?.name, {
        id: "company",
        size: 150,
        header: () => renderHeaderMenu("company", "Company", Building2),
        cell: ({ row }) => {
          const companyName = row.original.company?.name || "-";
          return (
            <span className="text-sm text-gray-900 truncate block" title={companyName}>
              <HighlightText text={companyName} query={searchTerm} />
            </span>
          );
        },
      }),

      // Contact
      columnHelper.accessor((row) => row.contact?.name, {
        id: "contact",
        size: 150,
        header: () => renderHeaderMenu("contact", "Contact", null),
        cell: ({ row }) => {
          const contactName = row.original.contact?.name || "-";
          return (
            <span className="text-sm text-gray-900 truncate block" title={contactName}>
              <HighlightText text={contactName} query={searchTerm} />
            </span>
          );
        },
      }),

      // Status
      columnHelper.accessor("status", {
        id: "status",
        size: 131,
        header: () => renderHeaderMenu("status", "Stage", Tag),
        cell: ({ row }) => {
          const dealStatus = row.original.status;
          return (
            <div className="flex items-center gap-2 w-full" onClick={(e) => e.stopPropagation()}>
              <CustomDropdown
                options={statuses}
                value={dealStatus}
                onChange={(newStatus) => handleStatusChange(row.original._id, dealStatus, newStatus)}
                placeholder="Select Stage"
                className="w-full h-auto"
                buttonClassName="flex items-center justify-between w-full bg-transparent border-0 p-0 gap-2 group cursor-pointer"
                renderValue={(value) => {
                  const pillStyle =
                    value === "Won"
                      ? { backgroundColor: "rgba(0, 201, 80, 0.1)", color: "#00A63E" }
                      : value === "Lost"
                        ? { backgroundColor: "rgba(232, 34, 34, 0.1)", color: "#E82222" }
                        : { backgroundColor: "rgba(0, 133, 255, 0.1)", color: "#0085FF" };
                  return (
                    <span
                      className="px-3 py-[5px] rounded-full font-medium text-xs truncate"
                      style={pillStyle}
                    >
                      <HighlightText text={value} query={searchTerm} />
                    </span>
                  );
                }}
                dropdownIcon={<></>}
              />
            </div>
          );
        },
      }),

      // Amount
      columnHelper.accessor("amount", {
        id: "amount",
        size: 123,
        header: () => renderHeaderMenu("amount", "Amount", IndianRupee),
        cell: ({ getValue }) => {
          const val = parseInt(getValue() || 0);
          const formatted = `₹${formatNumberToIndian(val)}`;
          return (
            <h6 className="text-sm font-semibold text-gray-900 truncate" title={formatted}>
              <HighlightText text={formatted} query={searchTerm} />
            </h6>
          );
        },
      }),

      // Due Date (sourced from the real "Expected Close Date" custom field, when set)
      columnHelper.display({
        id: "dueDate",
        size: 171,
        header: () => renderHeaderMenu("dueDate", "Due Date", CalendarIcon, { sortable: false }),
        cell: ({ row }) => {
          const dueDateField = row.original.additionalFields?.find(
            (f) => f.key === "Expected Close Date"
          );
          if (!dueDateField?.value) {
            return <div className="text-sm text-gray-400 truncate">—</div>;
          }
          const formattedDate = new Date(dueDateField.value).toLocaleDateString("en-US", {
            day: "numeric",
            month: "long",
            year: "numeric",
          });
          return (
            <div className="text-sm text-gray-600 truncate" title={formattedDate}>
              <HighlightText text={formattedDate} query={searchTerm} />
            </div>
          );
        },
      }),

    ];

    const visibleCols = baseCols.filter(
      (col) =>
        col.id === "selection" ||
        (!hiddenColumns.includes(col.id) && !externalHiddenColumns.includes(col.id))
    );

    // Reorder: left-pinned first (after selection), then unpinned, then right-pinned.
    const selectionCol = visibleCols.find((c) => c.id === "selection");
    let middle = visibleCols.filter((c) => c.id !== "selection");
    const effectiveOrder = columnOrder.length ? columnOrder : externalColumnOrder;
    if (effectiveOrder.length) {
      const rank = (id) => {
        const idx = effectiveOrder.indexOf(id);
        return idx === -1 ? effectiveOrder.length + middle.findIndex((c) => c.id === id) : idx;
      };
      middle = [...middle].sort((a, b) => rank(a.id) - rank(b.id));
    }
    const leftPinned = middle.filter((c) => getColumnPinSide(c.id) === "left");
    const rightPinned = middle.filter((c) => getColumnPinSide(c.id) === "right");
    const unpinned = middle.filter((c) => !getColumnPinSide(c.id));

    const orderedCols = [selectionCol, ...leftPinned, ...unpinned, ...rightPinned].filter(Boolean);

    // Merge the row-actions three-dot menu into the last visible data column instead
    // of giving it a dedicated column.
    const lastIdx = orderedCols.length - 1;
    if (lastIdx >= 0 && orderedCols[lastIdx].id !== "selection") {
      const lastCol = orderedCols[lastIdx];
      const originalCell = lastCol.cell;
      orderedCols[lastIdx] = {
        ...lastCol,
        cell: (ctx) => {
          const deal = ctx.row.original;
          const isActionsOpen = openRowActionsId === deal._id;
          return (
            <div className="flex items-center justify-between gap-2 w-full">
              <div className="min-w-0 flex-1">
                {typeof originalCell === "function" ? originalCell(ctx) : originalCell}
              </div>
              <div
                className="relative flex items-center justify-center flex-shrink-0"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isActionsOpen) {
                      setOpenRowActionsId(null);
                      setRowActionsPos(null);
                      return;
                    }
                    // Same zoom correction as the column-menu positioning above:
                    // rect + window dimensions are VISUAL px, the menu is
                    // portaled into document.body which paints inside the
                    // dynamic <html> zoom, so everything must be divided by
                    // that zoom before being used as a fixed-position value.
                    // Previously this used the raw click coordinates
                    // (e.clientX/Y) instead of the button's own rect, which
                    // made the menu's position depend on exactly where inside
                    // the small ⋮ hitbox the click landed, and never applied
                    // this correction at all — so it also drifted under zoom.
                    const zMenu = getAncestorZoom(document.body);
                    const MENU_W = 130;
                    const MARGIN = 8;
                    // Actual rendered height depends on permission: read-write
                    // shows Quick View + a divider + Edit + Delete; read-only
                    // shows Quick View alone.
                    const MENU_H = permission === "read-write" ? 110 : 44;

                    const rect = e.currentTarget.getBoundingClientRect();
                    const viewportH = window.innerHeight / zMenu;
                    const viewportW = window.innerWidth / zMenu;

                    // Anchor to the row's own vertical CENTER rather than
                    // hanging the menu's top edge off the button's bottom
                    // edge. A 3-4 item menu is taller than a single row, so
                    // anchoring at the bottom edge always made it spill down
                    // across the next 2-3 rows below the one actually
                    // clicked — reading as "floating in the wrong place"
                    // rather than attached to the row. Centering on the row,
                    // then clamping to the viewport, handles rows near either
                    // edge without a separate up/down flip branch.
                    const rowCenter = (rect.top + rect.bottom) / (2 * zMenu);
                    let calcTop = rowCenter - MENU_H / 2;
                    calcTop = Math.max(MARGIN, Math.min(calcTop, viewportH - MENU_H - MARGIN));

                    // A little left of flush-right against the button, per
                    // direct feedback that flush-right sat too far right.
                    let calcLeft = rect.right / zMenu - MENU_W - 12;
                    calcLeft = Math.min(calcLeft, viewportW - MENU_W - MARGIN);
                    calcLeft = Math.max(calcLeft, MARGIN);

                    setRowActionsPos({ top: calcTop, left: calcLeft });
                    setOpenRowActionsId(deal._id);
                  }}
                  data-row-actions-trigger={deal._id}
                  className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                  title="More actions"
                >
                  <MoreIcon className="w-4 h-4" />
                </button>
                {isActionsOpen && rowActionsPos && createPortal(
                  <>
                    <div
                      className="fixed inset-0 z-[9998]"
                      onClick={(e) => {
                        // Was: always just close. Bug this fixes: while a menu
                        // is open, this backdrop sits ABOVE every other row's
                        // ⋮ button (z-9998, portaled to body), so clicking a
                        // DIFFERENT row's button hit this backdrop first —
                        // closing the current menu, but the click never
                        // reached the real button, so opening the new row's
                        // menu needed a second, separate click.
                        //
                        // Fix: briefly make the backdrop invisible to hit-testing
                        // so elementFromPoint reports what's actually under the
                        // cursor (the backdrop would otherwise always report
                        // itself, being on top). If that's another row's
                        // trigger button, dispatch a real click on it — its
                        // own onClick (position calc, setOpenRowActionsId) runs
                        // completely unchanged, this only decides whether that
                        // click reaches it or the menu just closes.
                        const backdrop = e.currentTarget;
                        backdrop.style.pointerEvents = "none";
                        const elAtPoint = document.elementFromPoint(e.clientX, e.clientY);
                        backdrop.style.pointerEvents = "";
                        const trigger = elAtPoint?.closest("[data-row-actions-trigger]");
                        if (trigger) {
                          trigger.click();
                          return;
                        }
                        setOpenRowActionsId(null);
                        setRowActionsPos(null);
                      }}
                    />
                    <div
                      ref={rowActionsRef}
                      style={{ position: "fixed", top: rowActionsPos.top, left: rowActionsPos.left }}
                      className="w-[130px] z-[9999] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5 animate-in fade-in zoom-in duration-150 origin-top-right"
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenRowActionsId(null);
                          setRowActionsPos(null);
                          setQuickViewDealId(deal._id);
                        }}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                      >
                        <EyeIcon className="w-3.5 h-3.5 text-[#1C1B1F]" />
                        Quick View
                      </button>
                      {permission === "read-write" && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenRowActionsId(null);
                              setRowActionsPos(null);
                              handleEditDeal(deal);
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
                              handleDeleteDeal(deal._id);
                            }}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-red-600 hover:bg-red-50 whitespace-nowrap"
                          >
                            <DeleteIcon className="w-3.5 h-3.5" />
                            Delete Deal
                          </button>
                        </>
                      )}
                    </div>
                  </>,
                  document.body,
                )}
              </div>
            </div>
          );
        },
      };
    }

    return orderedCols;
  }, [
    selectedRows,
    sortedTableDeals.length,
    sortConfig,
    statuses,
    permission,
    handleSort,
    handleSelectAll,
    handleRowSelect,
    handleStatusChange,
    handleEditDeal,
    handleDeleteDeal,
    pinnedColumns,
    hiddenColumns,
    columnOrder,
    externalHiddenColumns,
    externalColumnOrder,
    searchTerm,
    openColMenuKey,
    colMenuPos,
    openRowActionsId,
    rowActionsPos,
  ]);

  const table = useReactTable({
    data: sortedTableDeals,
    columns,
    state: { columnSizing },
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: "onChange",
    enableColumnResizing: true,
  });

  const middleColIds = columns.filter((c) => c.id !== "selection").map((c) => c.id);

  const isInteractiveElement = (target) => {
    return (
      target.tagName === "INPUT" ||
      target.tagName === "BUTTON" ||
      target.tagName === "A" ||
      target.closest(".custom-dropdown") ||
      target.closest(".action-menu-container") ||
      target.closest("button") ||
      target.closest("a") ||
      // The shared Checkbox component's visible click target is an SVG icon
      // inside a <label> (the real <input> is sr-only/hidden), so it never
      // matched the checks above — every row-checkbox click was wrongly
      // treated as a plain row click, letting the long-press timer below
      // fire and race with the checkbox's own toggle.
      target.closest("label")
    );
  };

  const showLoadingSkeleton = loading && sortedTableDeals.length === 0;

  const leftPinnedKeys = pinnedColumns.filter((p) => p.side === "left").map((p) => p.key);
  const rightPinnedKeys = pinnedColumns.filter((p) => p.side === "right").map((p) => p.key);

  // Cumulative left/right offsets for every sticky column, derived from each
  // column's REAL rendered width — replaces the previous hardcoded
  // `left: 60` / `right: 0` for every pinned column, which stacked all
  // pinned columns on top of each other instead of side-by-side the moment
  // more than one column was pinned per side. Same approach as
  // Companies.jsx/Contacts.jsx/Tasks.jsx and the CompanyProfilePage tabs.
  const allDealHeaders = table.getHeaderGroups()[0]?.headers || [];
  const pinnedLeftOffsets = {};
  let cumulativeLeftOffset = 0;
  allDealHeaders.forEach((h) => {
    const colId = h.column.id;
    if (colId === "selection" || leftPinnedKeys.includes(colId)) {
      pinnedLeftOffsets[colId] = cumulativeLeftOffset;
      cumulativeLeftOffset += h.getSize();
    }
  });
  const pinnedRightOffsets = {};
  let cumulativeRightOffset = 0;
  [...allDealHeaders].reverse().forEach((h) => {
    const colId = h.column.id;
    if (colId === "actions" || rightPinnedKeys.includes(colId)) {
      pinnedRightOffsets[colId] = cumulativeRightOffset;
      cumulativeRightOffset += h.getSize();
    }
  });
  // Boundary = the pinned column nearest the scrollable area, in DISPLAY order.
  // The user-pinned keys only (not "selection"/"actions", which are always
  // stuck to the edges and shouldn't imply a pinned block on their own).
  const allDealColIds = allDealHeaders.map((h) => h.column.id);
  const leftPinnedInOrder = allDealColIds.filter((id) => leftPinnedKeys.includes(id));
  const rightPinnedInOrder = allDealColIds.filter((id) => rightPinnedKeys.includes(id));
  const lastLeftPinnedKey = leftPinnedInOrder.length > 0 ? leftPinnedInOrder[leftPinnedInOrder.length - 1] : null;
  const firstRightPinnedKey = rightPinnedInOrder.length > 0 ? rightPinnedInOrder[0] : null;
  return (
    <div className="relative bg-white">
        <table
          className="w-full text-sm text-gray-700 border-separate border-spacing-0 text-left"
          style={{
            width: "100%",
            minWidth: `${table.getTotalSize()}px`,
            tableLayout: "fixed",
          }}
        >
          <thead className="bg-[#F5F7FA] border-b border-[#E1E4EA] sticky top-0 z-20">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const colId = header.column.id;

                  const isLeftSticky = colId === "selection" || leftPinnedKeys.includes(colId);
                  const isRightSticky = colId === "actions" || rightPinnedKeys.includes(colId);
                  const isSticky = isLeftSticky || isRightSticky;
                  const boundaryShadowSide = colId === lastLeftPinnedKey ? "left" : colId === firstRightPinnedKey ? "right" : null;
                  const isDraggable = colId !== "selection";
                  const isDragging = draggedColKey === colId;
                  const isDragOver = dragOverColKey === colId && draggedColKey && draggedColKey !== colId;

                  return (
                    <th
                      key={header.id}
                      data-col-id={colId}
                      onMouseDown={isDraggable ? (e) => startColumnDrag(e, colId) : undefined}
                      style={{
                        width: header.getSize(),
                        minWidth: header.getSize(),
                        maxWidth: header.getSize(),
                        position: isSticky ? "sticky" : "relative",
                        left: isLeftSticky ? pinnedLeftOffsets[colId] ?? 0 : "auto",
                        right: isRightSticky ? pinnedRightOffsets[colId] ?? 0 : "auto",
                        zIndex: isSticky ? 20 : 1,
                      }}
                      className={`${colId === "selection" ? "px-0" : "px-4"} py-3 text-sm font-bold text-[#525866] border-r border-[#E1E4EA] transition-colors bg-[#F5F7FA] ${isDraggable ? "cursor-grab active:cursor-grabbing" : ""} ${isDragOver ? "bg-blue-100" : "hover:bg-gray-100"}`}
                    >
                      {/* Opacity on this wrapper, not the <th>, so dragging never
                          dims the pinned border or its boundary shadow. */}
                      <div className="flex items-center gap-1.5 w-full min-w-0" style={{ opacity: isDragging ? 0.35 : 1 }}>
                        <div className="truncate flex-1 min-w-0">
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                        </div>
                      </div>
                      {boundaryShadowSide && (
                        <div style={getPinnedBoundaryOverlayStyle(boundaryShadowSide)} />
                      )}

                      {header.column.getCanResize() && (
                        <div
                          data-resize-handle="true"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            header.getResizeHandler()(e);
                          }}
                          onTouchStart={header.getResizeHandler()}
                          className={`absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none hover:bg-blue-400 z-50 ${header.column.getIsResizing()
                            ? "bg-blue-500"
                            : "bg-transparent"
                            }`}
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          <tbody className="bg-white">
            {showLoadingSkeleton ? (
              <TableSkeletonRows numRows={skeletonRows} columns={table.getVisibleLeafColumns().filter((c) => c.id !== "selection")} hasCheckbox />
            ) : sortedTableDeals.length === 0 ? (
              <tr>
                <td
                  colSpan={table.getAllColumns().length}
                  className="px-6 py-12 text-center text-gray-500 font-medium"
                >
                  No deals found.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row, rowIndex) => {
                const deal = row.original;
                const isSelected = selectedRows.includes(deal._id);
                const stale = isStale(deal.createdAt);
                const isLastRow = rowIndex === table.getRowModel().rows.length - 1;

                return (
                  <tr
                    key={row.id}
                    onMouseDown={(e) => {
                      if (isInteractiveElement(e.target)) return;
                      handleRowMouseDown(deal._id);
                    }}
                    onMouseUp={(e) => {
                      if (isInteractiveElement(e.target)) return;
                      handleRowMouseUp();
                    }}
                    onMouseLeave={(e) => {
                      if (isInteractiveElement(e.target)) return;
                      handleRowMouseUp();
                    }}
                    onTouchStart={(e) => {
                      if (isInteractiveElement(e.target)) return;
                      handleRowTouchStart(deal._id);
                    }}
                    onTouchEnd={(e) => {
                      if (isInteractiveElement(e.target)) return;
                      handleRowTouchEnd();
                    }}
                    className={`bg-white hover:bg-blue-50 transition-colors ${stale ? "bg-red-50" : ""} cursor-pointer ${isSelected ? "!bg-blue-50" : ""}`}
                    style={{ height: 37, maxHeight: 37 }}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const colId = cell.column.id;

                      const isLeftSticky = colId === "selection" || leftPinnedKeys.includes(colId);
                      const isRightSticky = colId === "actions" || rightPinnedKeys.includes(colId);
                      const isSticky = isLeftSticky || isRightSticky;
                      const cellBoundaryShadowSide = colId === lastLeftPinnedKey ? "left" : colId === firstRightPinnedKey ? "right" : null;
                      return (
                        <td
                          key={cell.id}
                          style={{
                            width: cell.column.getSize(),
                            minWidth: cell.column.getSize(),
                            maxWidth: cell.column.getSize(),
                            height: "37px",
                            maxHeight: "37px",
                            boxSizing: "border-box",
                            position: isSticky ? "sticky" : "static",
                            left: isLeftSticky ? pinnedLeftOffsets[colId] ?? 0 : "auto",
                            right: isRightSticky ? pinnedRightOffsets[colId] ?? 0 : "auto",
                            zIndex: isSticky ? 10 : 1,
                          }}
                          className={`${colId === "selection" ? "px-0" : "px-3"} py-2 text-sm font-medium text-[#222530] align-middle bg-inherit border-r border-b border-[#E1E4EA]`}
                        >
                          <div style={{ overflow: "hidden" }}>
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </div>
                          {cellBoundaryShadowSide && (
                            <div style={getPinnedBoundaryOverlayStyle(cellBoundaryShadowSide)} />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

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
  );
}
