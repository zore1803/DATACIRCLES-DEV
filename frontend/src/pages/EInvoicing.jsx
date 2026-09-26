import DeleteIcon from "../components/common/DeleteIcon";
import Checkbox from "../components/common/Checkbox";
import MoreIcon from "../components/common/MoreIcon";
import DownloadIcon from "../components/common/DownloadIcon";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Ban,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Copy,
  EyeOff,
  Mail,
  MessageCircle,
  MessageSquare,
  Pin,
  PinOff,
  Plug,
  Share2,
  X,
  XCircle, ArrowUp, ArrowDown } from "lucide-react";
import toast from "react-hot-toast";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";

import API from "../services/api";
import Skeleton from "../components/common/Skeleton";
import TableSkeletonRows from "../components/common/TableSkeletonRows";
import { useTopLoadingSignal } from "../components/common/TopLoadingBar";
import FilterIcon from "../components/common/FilterIcon";
import SearchIcon from "../components/common/SearchIcon";
import SettingsIcon from "../components/common/SettingsIcon";
import AdvancedFilterPanel from "../components/common/AdvancedFilterPanel";
import ColumnSettingsPanel from "../components/ColumnSettingsPanel";
import { useColumnSettings } from "../hooks/useColumnSettings";
import { exportClientSide, formatINR } from "../utils/clientExport";
import HighlightText from "../components/common/HighlightText";
import { getPinnedBoundaryOverlayStyle } from "../utils/pinnedColumnShadow";
import useSearchOverlayOpen from "../hooks/useSearchOverlayOpen";
import UploadIcon from "../components/common/UploadIcon";
import EyeIcon from "../components/common/EyeIcon";
import BulkDeleteModal from "../components/common/BulkDeleteModal";

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

const columnHelper = createColumnHelper();

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "success", label: "Success", icon: CheckCircle2, badgeClass: "bg-[#E6F7EF] text-[#1FA971] border-transparent" },
  { key: "pending", label: "Pending", icon: Clock, badgeClass: "bg-[#FDF3E6] text-[#EA9927] border-transparent" },
  { key: "failed", label: "Failed", icon: XCircle, badgeClass: "bg-[#FCEAEA] text-[#EA4B4B] border-transparent" },
  { key: "cancelled", label: "Cancelled", icon: Ban, badgeClass: "bg-[#EEF2F9] text-[#56698A] border-transparent" },
];

const statusBadge = (status) => {
  const t = STATUS_TABS.find((x) => x.key === (status || "").toLowerCase());
  return t?.badgeClass || "bg-gray-100 text-gray-700 border-transparent";
};

const DEFAULT_COLUMNS = [
  { key: "invoiceNumber", label: "Invoice Number", visible: true, order: 0, sortable: true },
  { key: "customer", label: "Customer", visible: true, order: 1, sortable: true },
  { key: "amount", label: "Amount", visible: true, order: 2, sortable: true },
  { key: "status", label: "Status", visible: true, order: 3, sortable: true },
  { key: "irn", label: "IRN", visible: true, order: 4, sortable: true },
  { key: "ackNo", label: "Ack No.", visible: true, order: 5, sortable: true },
  { key: "ackDate", label: "Ack Date", visible: true, order: 6, sortable: true },
  { key: "date", label: "Invoice Date", visible: true, order: 7, sortable: true },
];

const EMPTY_LIST = [];

export default function EInvoicing() {
  const isSearchOverlayOpen = useSearchOverlayOpen();

  const [portalConnected, setPortalConnected] = useState(() => {
    try {
      return localStorage.getItem("einvoicing_portal_connected") === "true";
    } catch {
      return false;
    }
  });

  const [eInvoices, setEInvoices] = useState(EMPTY_LIST);
  const [loading, setLoading] = useState(false);
  const hasLoadedOnceRef = useRef(false);
  const showLoadingSkeleton = loading && eInvoices.length === 0 && !hasLoadedOnceRef.current;
  useTopLoadingSignal(loading);

  const [searchTerm, setSearchTerm] = useState("");
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const searchInputRef = useRef(null);

  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [activeFilters, setActiveFilters] = useState([]);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportButtonRef = useRef(null);

  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 0,
    totalCount: 0,
    limit: 50,
    hasNextPage: false,
    hasPrevPage: false,
  });
  const [editingPage, setEditingPage] = useState(false);
  const [pageInput, setPageInput] = useState("");

  const [openRowActionsId, setOpenRowActionsId] = useState(null);
  const [rowActionsPos, setRowActionsPos] = useState(null);

  const [shareMenu, setShareMenu] = useState(null);
  const [shareMenuChannel, setShareMenuChannel] = useState(null);
  // Share is click-to-open/pinned (its button toggles shareMenu directly)
  // — this is just the unconditional close used by closeRowMenu and the
  // scroll handler.
  const forceCloseShareFlyout = () => {
    setShareMenu(null);
    setShareMenuChannel(null);
  };

  const [selectedIds, setSelectedIds] = useState([]);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const selectedIdsSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const { columns, saveColumns, getVisibleColumns } = useColumnSettings("e-invoicing", DEFAULT_COLUMNS);

  const [sortConfig, setSortConfig] = useState({ key: null, direction: null });
  const [pinnedColumns, setPinnedColumns] = useState([]);
  const [openColumnMenuKey, setOpenColumnMenuKey] = useState(null);
  const [columnMenuPos, setColumnMenuPos] = useState(null);
  const columnMenuRef = useRef(null);
  const tableScrollRef = useRef(null);

  // Drag-and-drop column reorder state
  const [draggedColKey, setDraggedColKey] = useState(null);
  const [dragOverColKey, setDragOverColKey] = useState(null);
  const [dragGhost, setDragGhost] = useState(null);
  const dragOverRef = useRef(null);
  const ghostElRef = useRef(null);

  const [columnSizing, setColumnSizing] = useState({});

  const getPinSide = (key) => pinnedColumns.find((p) => p.key === key)?.side || null;
  const pinColumn = (key, side) =>
    setPinnedColumns((prev) => [...prev.filter((p) => p.key !== key), { key, side }]);
  const unpinColumn = (key) =>
    setPinnedColumns((prev) => prev.filter((p) => p.key !== key));

  const visibleColumns = useMemo(() => {
    return columns.filter((c) => c.visible).sort((a, b) => a.order - b.order);
    // getVisibleColumns is a pure function of `columns` re-created every
    // render by the hook — depending on it here (instead of just `columns`)
    // would make this memo (and everything derived from it, like
    // orderedFields) unstable on every render again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns]);

  // Debounce search
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Server-side paginated fetch — mirrors SalesReturn.jsx's fetchRows exactly
  // (page/limit/sortBy/sortOrder/search params against /e-invoices/pagination)
  // so the top loading bar actually animates on page/sort/search changes
  // instead of the whole dataset being fetched once and paginated in memory.
  // Latest-request guard, same as Vendors.jsx: every fetch takes an id, and a response is only
  // applied if no newer fetch has started since. Without it an older, slower response (a
  // previous keystroke's search, or the page-2 request fired just before a search reset the
  // list to page 1) could land last and overwrite the newer results.
  const fetchRequestIdRef = useRef(0);
  const fetchRows = async () => {
    const requestId = ++fetchRequestIdRef.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.currentPage,
        limit: pagination.limit,
      });
      if (sortConfig.key) {
        params.append("sortBy", sortConfig.key);
        params.append("sortOrder", sortConfig.direction || "asc");
      }
      if (debouncedSearchTerm) params.append("search", debouncedSearchTerm);
      const res = await API.get(`/e-invoices/pagination?${params.toString()}`);
      if (requestId !== fetchRequestIdRef.current) return;
      setEInvoices(res.data.eInvoices || EMPTY_LIST);
      setPagination((prev) => ({ ...prev, ...res.data.pagination }));
    } catch (err) {
      if (requestId !== fetchRequestIdRef.current) return;
      console.error("Error fetching e-invoices:", err);
      toast.error(err.response?.data?.message || "Failed to load e-invoices");
      setEInvoices(EMPTY_LIST);
    } finally {
      if (requestId === fetchRequestIdRef.current) {
        setLoading(false);
        hasLoadedOnceRef.current = true;
      }
    }
  };

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.currentPage, pagination.limit, sortConfig, debouncedSearchTerm]);

  // Reset to page 1 whenever the search term actually changes the result set
  // (not on the initial mount, which already fetches page 1 above).
  const skipInitialReset = useRef(true);
  useEffect(() => {
    if (skipInitialReset.current) {
      skipInitialReset.current = false;
      return;
    }
    setPagination((prev) => ({ ...prev, currentPage: 1 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchTerm]);

  // Click-outside
  useEffect(() => {
    const handle = (e) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) setIsMoreMenuOpen(false);
      if (exportButtonRef.current && !exportButtonRef.current.contains(e.target)) setShowExportMenu(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
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

  // Close menus on scroll/click-outside
  useEffect(() => {
    if (!openRowActionsId && !openColumnMenuKey) return;
    const close = (e) => {
      if (e.type === "keydown" && !["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(e.key)) return;
      setOpenRowActionsId(null);
      setRowActionsPos(null);
      setOpenColumnMenuKey(null);
      setColumnMenuPos(null);
    };
    window.addEventListener("wheel", close, { passive: true, capture: true });
    window.addEventListener("touchmove", close, { passive: true, capture: true });
    window.addEventListener("keydown", close, true);
    return () => {
      window.removeEventListener("wheel", close, { capture: true });
      window.removeEventListener("touchmove", close, { capture: true });
      window.removeEventListener("keydown", close, true);
    };
  }, [openRowActionsId, openColumnMenuKey]);

  // Delays the bulk-strip's unmount so it can play the slide-out-right exit
  // animation on deselect (mirroring the slide-in entrance) — same pattern as
  // Companies.jsx / SalesReturn.jsx's bulk selection strip.
  const [showBulkStrip, setShowBulkStrip] = useState(false);
  const [bulkStripClosing, setBulkStripClosing] = useState(false);
  useEffect(() => {
    if (selectedIds.length > 0) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds.length]);

  // Search and sort are now applied server-side (see fetchRows above) — the
  // only client-side pass left is the advanced-filter panel's field/operator
  // rules, which the backend doesn't support generically. Same documented
  // trade-off as PurchasePage: applied on top of the server-fetched page, so
  // a very restrictive filter can show fewer than `limit` rows on a page
  // without the pagination count knowing — acceptable since it's a rare,
  // power-user path, not the default view.
  const sortedEInvoices = useMemo(() => {
    if (activeFilters.length === 0) return eInvoices;
    return eInvoices.filter((r) =>
      activeFilters.every((f) => {
        const val = (r[f.field] ?? "").toString().toLowerCase();
        const target = (f.value ?? "").toString().toLowerCase();
        if (f.operator === "equals") return val === target;
        if (f.operator === "not_equals") return val !== target;
        if (f.operator === "contains") return val.includes(target);
        if (f.operator === "not_contains") return !val.includes(target);
        return true;
      })
    );
  }, [eInvoices, activeFilters]);

  // Helper to get field value from a row
  const getFieldValue = (row, key) => {
    if (key === "customer") return row.customer?.name || "—";
    if (key === "amount") return row.amount || 0;
    if (key === "date") return row.date ? new Date(row.date).toLocaleDateString("en-IN") : "—";
    if (key === "ackDate") return row.ackDate ? new Date(row.ackDate).toLocaleDateString("en-IN") : "—";
    if (key === "irn" || key === "ackNo") return row[key] || "—";
    return row[key] || "—";
  };

  // ── TanStack React Table setup (matches Purchases/Companies) ────────
  // Memoized so these stay referentially stable across unrelated re-renders
  // (search typing, menu open/close, etc). Previously recomputed as plain
  // array literals on every render, which made `orderedFields` a "new"
  // dependency every time and forced tableColumns (below) to rebuild every
  // render too — combined with controlled columnSizing state, that fed an
  // infinite re-render loop (TanStack Table re-syncing default column sizes
  // via onColumnSizingChange every time it saw "new" column defs), which is
  // what froze the tab.
  const { leftPinnedKeys, rightPinnedKeys, orderedFields } = useMemo(() => {
    const lpKeys = pinnedColumns.filter((p) => p.side === "left").map((p) => p.key);
    const rpKeys = pinnedColumns.filter((p) => p.side === "right").map((p) => p.key);
    const leftPinnedFields = visibleColumns.filter((vc) => lpKeys.includes(vc.key));
    const rightPinnedFields = visibleColumns.filter((vc) => rpKeys.includes(vc.key));
    const unpinnedFields = visibleColumns.filter(
      (vc) => !lpKeys.includes(vc.key) && !rpKeys.includes(vc.key),
    );
    return {
      leftPinnedKeys: lpKeys,
      rightPinnedKeys: rpKeys,
      orderedFields: [...leftPinnedFields, ...unpinnedFields, ...rightPinnedFields],
    };
  }, [pinnedColumns, visibleColumns]);

  const tableColumns = useMemo(() => {
    const cols = [];

    // Checkbox column
    cols.push(
      columnHelper.display({
        id: "selection",
        size: 50,
        enableResizing: false,
        header: () => (
          <div className="w-full flex justify-center">
            <Checkbox checked={sortedEInvoices.length > 0 && sortedEInvoices.every((r) => selectedIdsSet.has(r._id))} onChange={handleSelectAllOnPage}  uncheckedColor="text-[#525866]"/>
          </div>
        ),
        cell: ({ row }) => (
          <div className="w-full flex justify-center" onClick={(e) => e.stopPropagation()}>
            <Checkbox checked={selectedIdsSet.has(row.original._id)} onChange={() => handleSelectOne(row.original._id)} />
          </div>
        ),
      })
    );

    const lastColumnKey = orderedFields[orderedFields.length - 1]?.key;

    orderedFields.forEach((vc) => {
      cols.push(
        columnHelper.accessor((row) => getFieldValue(row, vc.key), {
          id: vc.key,
          size: vc.key === "invoiceNumber" ? 220 : vc.key === "customer" ? 200 : vc.key === "irn" ? 220 : 150,
          header: () => {
            const isSortable = vc.sortable !== false;
            const pinSide = getPinSide(vc.key);
            const isMenuOpen = openColumnMenuKey === vc.key;

            return (
              <div className="flex items-center justify-between w-full group">
                <span className="truncate flex-1 min-w-0 flex items-center gap-1.5" title={vc.label}>
                  <span className="truncate">{vc.label}</span>
                  {sortConfig.key === vc.key && (sortConfig.direction === "asc"
                    ? <ArrowUp className="w-3 h-3 text-[#0085FF] flex-shrink-0" />
                    : <ArrowDown className="w-3 h-3 text-[#0085FF] flex-shrink-0" />)}
                  {pinSide && (
                    <Pin size={12} className="text-blue-500 fill-blue-500 flex-shrink-0" style={{ transform: "rotate(45deg)" }} />
                  )}
                </span>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isMenuOpen) {
                      setOpenColumnMenuKey(null);
                      setColumnMenuPos(null);
                      return;
                    }
                    const zMenu = getAncestorZoom(document.body);
                    const MENU_W = 160;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const boundsRight = tableScrollRef.current?.getBoundingClientRect().right ?? window.innerWidth;
                    let calcLeft = rect.right / zMenu - MENU_W;
                    calcLeft = Math.min(calcLeft, boundsRight / zMenu - MENU_W - 8);
                    calcLeft = Math.max(calcLeft, 8);
                    setColumnMenuPos({ top: rect.bottom / zMenu + 4, left: calcLeft });
                    setOpenColumnMenuKey(vc.key);
                  }}
                  className="p-1 rounded hover:bg-gray-200 transition-colors text-gray-500 flex-shrink-0"
                  title="Column options"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>

                {isMenuOpen && columnMenuPos && createPortal(
                  <>
                    <div className="fixed inset-0 z-[9998]" onClick={() => { setOpenColumnMenuKey(null); setColumnMenuPos(null); }} />
                    <div
                      ref={columnMenuRef}
                      style={{ position: "fixed", top: columnMenuPos.top, left: columnMenuPos.left }}
                      className="w-[160px] z-[9999] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5 animate-in fade-in zoom-in duration-150 origin-top-right"
                    >
                      <button
                        onClick={() => {
                          setOpenColumnMenuKey(null); setColumnMenuPos(null);
                          pinSide === "left" ? unpinColumn(vc.key) : pinColumn(vc.key, "left");
                        }}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${pinSide === "left" ? "bg-blue-50 text-blue-700" : "text-[#161618] hover:bg-gray-50"}`}
                      >
                        {pinSide === "left" ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5 text-[#1C1B1F]" />}
                        Pin to Left
                      </button>
                      <button
                        onClick={() => {
                          setOpenColumnMenuKey(null); setColumnMenuPos(null);
                          pinSide === "right" ? unpinColumn(vc.key) : pinColumn(vc.key, "right");
                        }}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${pinSide === "right" ? "bg-blue-50 text-blue-700" : "text-[#161618] hover:bg-gray-50"}`}
                      >
                        {pinSide === "right" ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5 text-[#1C1B1F]" />}
                        Pin to Right
                      </button>

                      {isSortable && (
                        <>
                          <button
                            onClick={() => {
                              setOpenColumnMenuKey(null); setColumnMenuPos(null);
                              const isActive = sortConfig.key === vc.key && sortConfig.direction === "asc";
                              setSortConfig(isActive ? { key: null, direction: null } : { key: vc.key, direction: "asc" });
                              setPagination((p) => ({ ...p, currentPage: 1 }));
                            }}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${sortConfig.key === vc.key && sortConfig.direction === "asc" ? "bg-blue-50 text-blue-700 font-medium" : "text-[#161618] hover:bg-gray-50"}`}
                          >
                            <ChevronUp className="w-3.5 h-3.5 text-[#1C1B1F]" />
                            Sort Ascending
                          </button>
                          <button
                            onClick={() => {
                              setOpenColumnMenuKey(null); setColumnMenuPos(null);
                              const isActive = sortConfig.key === vc.key && sortConfig.direction === "desc";
                              setSortConfig(isActive ? { key: null, direction: null } : { key: vc.key, direction: "desc" });
                              setPagination((p) => ({ ...p, currentPage: 1 }));
                            }}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${sortConfig.key === vc.key && sortConfig.direction === "desc" ? "bg-blue-50 text-blue-700 font-medium" : "text-[#161618] hover:bg-gray-50"}`}
                          >
                            <ChevronDown className="w-3.5 h-3.5 text-[#1C1B1F]" />
                            Sort Descending
                          </button>
                        </>
                      )}

                      <div className="w-full border-t border-[#F1F1F5] my-0.5" />

                      <button
                        onClick={() => {
                          setOpenColumnMenuKey(null); setColumnMenuPos(null);
                          saveColumns(columns.map((c) => (c.key === vc.key ? { ...c, visible: false } : c)));
                        }}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                      >
                        <EyeOff className="w-3.5 h-3.5 text-[#1C1B1F]" />
                        Hide Column
                      </button>
                    </div>
                  </>,
                  document.body
                )}
              </div>
            );
          },
          cell: ({ row }) => {
            const r = row.original;
            const key = vc.key;
            let baseContent;
            switch (key) {
              case "invoiceNumber":
                baseContent = (
                  <span className="text-[#0085FF] font-semibold truncate block">
                    <HighlightText text={r.invoiceNumber || "—"} query={debouncedSearchTerm} />
                  </span>
                );
                break;
              case "customer":
                baseContent = <span className="truncate block"><HighlightText text={r.customer?.name || "—"} query={debouncedSearchTerm} /></span>;
                break;
              case "amount":
                baseContent = <span className="font-medium">{formatINR(r.amount || 0)}</span>;
                break;
              case "status":
                baseContent = (
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${statusBadge(r.status)}`}>
                    {r.status || "—"}
                  </span>
                );
                break;
              case "irn":
                baseContent = r.irn ? (
                  <span className="font-mono text-xs text-gray-700 truncate block" title={r.irn}>
                    <HighlightText text={r.irn} query={debouncedSearchTerm} />
                  </span>
                ) : <span className="text-gray-400">—</span>;
                break;
              case "ackNo":
                baseContent = r.ackNo ? (
                  <span className="font-mono text-xs text-gray-700 truncate block">
                    <HighlightText text={r.ackNo} query={debouncedSearchTerm} />
                  </span>
                ) : <span className="text-gray-400">—</span>;
                break;
              case "ackDate":
                baseContent = r.ackDate ? new Date(r.ackDate).toLocaleDateString("en-IN") : <span className="text-gray-400">—</span>;
                break;
              case "date":
                baseContent = r.date ? new Date(r.date).toLocaleDateString("en-IN") : "—";
                break;
              default:
                baseContent = r[key] || "—";
            }

            // The row's ⋮ menu is appended to whichever column currently sits
            // last — pin/drag can move that around — instead of a separate
            // fixed actions column (matches Purchases/Companies).
            if (vc.key === lastColumnKey) {
              return (
                <div className="flex items-center justify-between w-full gap-2">
                  <div className="min-w-0 flex-1 truncate">{baseContent}</div>
                  {renderRowActionsMenu(r)}
                </div>
              );
            }
            return baseContent;
          },
        })
      );
    });

    return cols;
  }, [orderedFields, openColumnMenuKey, columnMenuPos, pinnedColumns, columns, debouncedSearchTerm, sortConfig, openRowActionsId, rowActionsPos, sortedEInvoices, selectedIdsSet]);

  const table = useReactTable({
    data: sortedEInvoices,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: "onChange",
    onColumnSizingChange: setColumnSizing,
    state: { columnSizing },
  });

  // ── Drag-and-drop column reordering ─────────────────────────────────
  const startColumnDrag = (e, colId) => {
    if (e.button !== 0) return;
    if (e.target.closest("button") || e.target.closest("[data-resize-handle]")) return;

    const th = e.currentTarget;
    const startX = e.clientX;
    const startY = e.clientY;
    const DRAG_THRESHOLD = 5;
    const dragState = { started: false, offsetX: 0, offsetY: 0, zGhost: 1 };

    const positionGhost = (clientX, clientY) => {
      const el = ghostElRef.current;
      if (!el) return;
      el.style.top = `${(clientY - dragState.offsetY) / dragState.zGhost}px`;
      el.style.left = `${(clientX - dragState.offsetX) / dragState.zGhost}px`;
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
      const label = visibleColumns.find((vc) => vc.key === colId)?.label || colId;
      const previewRows = sortedEInvoices.map((r) => String(getFieldValue(r, colId) ?? "").trim() || "—");
      dragState.zGhost = getAncestorZoom(document.body);
      dragState.offsetX = startX - rect.left;
      dragState.offsetY = startY - rect.top;
      dragOverRef.current = null;
      setDraggedColKey(colId);
      setDragOverColKey(null);
      document.body.style.userSelect = "none";
      setDragGhost({ label, previewRows, width: rect.width / dragState.zGhost, height: rect.height / dragState.zGhost });
      requestAnimationFrame(() => positionGhost(startX, startY));
    };

    const handleMouseMove = (moveEvent) => {
      if (!dragState.started) {
        if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < DRAG_THRESHOLD) return;
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
      if (overKey && overKey !== colId) handleColumnReorder(colId, overKey);
      dragOverRef.current = null;
      setDraggedColKey(null);
      setDragOverColKey(null);
      setDragGhost(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleColumnReorder = (draggedKey, targetKey) => {
    if (!draggedKey || draggedKey === targetKey) return;
    const sorted = [...columns].sort((a, b) => a.order - b.order);
    const visSorted = sorted.filter((c) => c.visible);
    const draggedIdx = visSorted.findIndex((c) => c.key === draggedKey);
    const targetIdx = visSorted.findIndex((c) => c.key === targetKey);
    if (draggedIdx === -1 || targetIdx === -1) return;
    const reordered = [...visSorted];
    const [moved] = reordered.splice(draggedIdx, 1);
    reordered.splice(targetIdx, 0, moved);
    let cursor = 0;
    const newColumns = sorted
      .map((c) => (c.visible ? reordered[cursor++] : c))
      .map((c, idx) => ({ ...c, order: idx }));
    saveColumns(newColumns);
  };

  // ── Selection ──────────────────────────────────────────────────────
  const handleSelectOne = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSelectAllOnPage = () => {
    const pageIds = sortedEInvoices.map((r) => r._id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIdsSet.has(id));
    setSelectedIds((prev) => {
      if (allSelected) return prev.filter((id) => !pageIds.includes(id));
      const merged = new Set(prev);
      pageIds.forEach((id) => merged.add(id));
      return Array.from(merged);
    });
  };

  // Selects every id matching the current search across ALL pages (not just
  // the currently-loaded one) — mirrors Companies.jsx/SalesReturn.jsx's
  // handleSelectAllAcrossPages via the backend's allIds shortcut.
  const handleSelectAllFiltered = async () => {
    try {
      const params = new URLSearchParams();
      if (debouncedSearchTerm) params.append("search", debouncedSearchTerm);
      params.append("allIds", "true");
      const res = await API.get(`/e-invoices/pagination?${params.toString()}`);
      setSelectedIds(res.data.ids || []);
    } catch (err) {
      toast.error("Failed to select all e-invoices");
    }
  };

  const clearSelection = () => setSelectedIds([]);

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    setShowBulkDeleteModal(true);
  };

  const executeBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      await Promise.all(selectedIds.map((id) => API.delete(`/e-invoices/${id}`)));
      toast.success(`${selectedIds.length} e-invoice${selectedIds.length !== 1 ? "s" : ""} deleted`);
      clearSelection();
      fetchRows();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete selected e-invoices");
    } finally {
      setBulkDeleting(false);
      setShowBulkDeleteModal(false);
    }
  };

  // ── Handlers ───────────────────────────────────────────────────────
  const handleConnectPortal = () => {
    if (portalConnected) {
      if (!window.confirm("Disconnect from the E-Invoicing Portal?")) return;
      localStorage.setItem("einvoicing_portal_connected", "false");
      setPortalConnected(false);
      toast.success("Disconnected from E-Invoicing Portal");
    } else {
      toast("Portal connection flow is coming soon.", { icon: "🔌" });
    }
  };

  const closeRowActions = () => {
    setOpenRowActionsId(null);
    setRowActionsPos(null);
    forceCloseShareFlyout();
  };

  const handleView = (r) => {
    toast(`Viewing ${r.invoiceNumber} — detail view coming soon.`, { icon: "👀" });
    closeRowActions();
  };

  const handleDownload = (r) => {
    toast(`Download for ${r.invoiceNumber} — coming soon.`, { icon: "🚧" });
    closeRowActions();
  };

  const handleCancelIRN = async (r) => {
    if (!window.confirm(`Cancel the IRN for ${r.invoiceNumber}? This cannot be undone.`)) return;
    closeRowActions();
    try {
      await API.put(`/e-invoices/${r._id}/status`, { status: "Cancelled" });
      toast.success("IRN cancelled");
      fetchRows();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to cancel IRN");
    }
  };

  const handleDelete = async (r) => {
    if (!window.confirm(`Delete e-invoice record ${r.invoiceNumber}?`)) return;
    closeRowActions();
    try {
      await API.delete(`/e-invoices/${r._id}`);
      toast.success("E-invoice deleted");
      fetchRows();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete e-invoice");
    }
  };

  // Row actions menu — ⋮ button appended to the last visible column's cell
  // (see tableColumns above), portaled to body, same positioning math as
  // PurchasePage/Companies. Includes a Share submenu (WhatsApp/Email/SMS/Copy
  // Link) built from a public view link, and a status-aware Cancel IRN action.
  const renderRowActionsMenu = (r) => {
    const isOpen = openRowActionsId === r._id;

    const openMenu = (e) => {
      e.stopPropagation();
      if (isOpen) {
        closeRowActions();
        return;
      }
      const zMenu = getAncestorZoom(document.body);
      const MENU_W = 200;
      const MENU_H = 260;
      const MARGIN = 8;
      const rect = e.currentTarget.getBoundingClientRect();
      const viewportH = window.innerHeight / zMenu;
      const viewportW = window.innerWidth / zMenu;
      const top = rect.bottom / zMenu + 4;
      const openUp = viewportH - top < MENU_H + MARGIN;
      let calcTop = openUp ? rect.top / zMenu - 4 - MENU_H : top;
      calcTop = Math.max(MARGIN, Math.min(calcTop, viewportH - MENU_H - MARGIN));
      let calcLeft = rect.right / zMenu - MENU_W;
      calcLeft = Math.min(calcLeft, viewportW - MENU_W - MARGIN);
      calcLeft = Math.max(calcLeft, MARGIN);
      setShareMenu(null);
      setShareMenuChannel(null);
      setRowActionsPos({ top: calcTop, left: calcLeft });
      setOpenRowActionsId(r._id);
    };

    return (
      <div className="relative flex items-center justify-center flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={openMenu}
          className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
          title="More actions"
        >
          <MoreIcon className="w-4 h-4" />
        </button>

        {isOpen && rowActionsPos && createPortal(
          <>
            <div className="fixed inset-0 z-[9998]" onClick={closeRowActions} />
            <div
              style={{ position: "fixed", top: rowActionsPos.top, left: rowActionsPos.left }}
              className="w-[200px] z-[9999] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5 animate-in fade-in zoom-in duration-150 origin-top-right"
            >
              <button onClick={() => handleView(r)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap">
                <EyeIcon className="w-3.5 h-3.5 text-[#1C1B1F]" /> View
              </button>
              <button onClick={() => handleDownload(r)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap">
                <DownloadIcon className="w-4 h-4 text-[#1C1B1F]" /> Download
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (shareMenu?.row?._id === r._id) {
                    forceCloseShareFlyout();
                    return;
                  }
                  const zMenu = getAncestorZoom(document.body);
                  const DROPDOWN_W = 160;
                  const rect = e.currentTarget.getBoundingClientRect();
                  setShareMenu({ row: r, x: Math.max(4, rect.left / zMenu - DROPDOWN_W), y: rect.top / zMenu });
                  setShareMenuChannel(null);
                }}
                className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
              >
                <span className="flex items-center gap-2">
                  <Share2 className="w-3.5 h-3.5 text-[#1C1B1F]" /> Share
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
              </button>

              {r.status === "Success" && (
                <>
                  <div className="w-full border-t border-[#F1F1F5] my-0.5" />
                  <button onClick={() => handleCancelIRN(r)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-orange-600 hover:bg-orange-50 whitespace-nowrap">
                    <Ban className="w-3.5 h-3.5" /> Cancel IRN
                  </button>
                </>
              )}

              <div className="w-full border-t border-[#F1F1F5] my-0.5" />
              <button onClick={() => handleDelete(r)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-red-600 hover:bg-red-50 whitespace-nowrap">
                <DeleteIcon className="w-4 h-4" /> Delete
              </button>
            </div>
          </>,
          document.body
        )}
      </div>
    );
  };

  const EXPORT_COLUMNS = [
    { label: "Invoice Number", value: (r) => r.invoiceNumber || "" },
    { label: "Customer", value: (r) => r.customer?.name || "" },
    { label: "Amount", value: (r) => formatINR(r.amount || 0) },
    { label: "Status", value: (r) => r.status || "" },
    { label: "IRN", value: (r) => r.irn || "" },
    { label: "Ack No.", value: (r) => r.ackNo || "" },
    { label: "Ack Date", value: (r) => (r.ackDate ? new Date(r.ackDate).toLocaleDateString("en-IN") : "") },
    { label: "Invoice Date", value: (r) => (r.date ? new Date(r.date).toLocaleDateString("en-IN") : "") },
  ];

  const handleExport = (format) => {
    if (sortedEInvoices.length === 0) {
      toast.error("Nothing to export — the current view is empty.");
      return;
    }
    exportClientSide(format, {
      rows: sortedEInvoices,
      columns: EXPORT_COLUMNS,
      fileNamePrefix: "e_invoices_export",
      title: "E-Invoices Report",
    });
    setIsMoreMenuOpen(false);
  };

  const filterColumns = [
    { key: "invoiceNumber", label: "Invoice Number", type: "text" },
    { key: "status", label: "Status", type: "select", options: STATUS_TABS.filter((t) => t.key !== "all").map((t) => t.key) },
    { key: "customer", label: "Customer", type: "text" },
    { key: "irn", label: "IRN", type: "text" },
    { key: "ackNo", label: "Ack No.", type: "text" },
  ];

  const handlePageChange = (page) => {
    if (page >= 1 && page <= pagination.totalPages && page !== pagination.currentPage) {
      setPagination((prev) => ({ ...prev, currentPage: page }));
    }
  };
  const handleLimitChange = (n) => setPagination((prev) => ({ ...prev, limit: n, currentPage: 1 }));

  // Pagination controls — server-driven, same shape as SalesReturn.jsx's.
  const PaginationControls = () => (
    <div className="flex items-center justify-between w-full px-4 sm:px-6 lg:px-8">
      <div className="flex items-center space-x-2">
        <div className="text-sm text-gray-700 font-inter">
          Showing{" "}
          <span className="font-semibold text-gray-800">{pagination.totalCount === 0 ? 0 : (pagination.currentPage - 1) * pagination.limit + 1}</span>
          {" "}to{" "}
          <span className="font-semibold text-gray-800">{Math.min(pagination.currentPage * pagination.limit, pagination.totalCount)}</span>
          {" "}of{" "}
          <span className="font-semibold text-gray-800">{pagination.totalCount}</span>
          {" "}results
        </div>
        <div className="relative ml-2">
          <select
            value={pagination.limit}
            onChange={(e) => handleLimitChange(Number(e.target.value))}
            className="appearance-none border border-gray-300 rounded-lg pl-3 pr-8 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer font-inter"
          >
            {[10, 20, 50, 100, 150].map((n) => (
              <option key={n} value={n}>{n} per page</option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
        </div>
      </div>

      <div className="flex items-center gap-2">

        <button
          onClick={() => handlePageChange(pagination.currentPage - 1)}
          disabled={!pagination.hasPrevPage}
          className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {(() => {
          const commitPage = () => {
            const n = parseInt(pageInput, 10);
            if (!Number.isNaN(n)) handlePageChange(Math.min(Math.max(n, 1), pagination.totalPages));
            setEditingPage(false);
          };
          const items = [1];
          if (pagination.currentPage > 2) items.push("left-dots");
          if (pagination.currentPage !== 1 && pagination.currentPage !== pagination.totalPages) items.push(pagination.currentPage);
          if (pagination.currentPage < pagination.totalPages - 1) items.push("right-dots");
          if (pagination.totalPages > 1) items.push(pagination.totalPages);

          return items.map((item, index) => {
            if (item === "left-dots" || item === "right-dots") {
              return (
                <span key={`${item}-${index}`} className="flex items-center justify-center w-8 h-8 text-sm font-medium text-gray-400 select-none">
                  …
                </span>
              );
            }
            const isCurrent = item === pagination.currentPage;
            if (isCurrent && editingPage) {
              return (
                <input
                  key="page-edit"
                  autoFocus
                  type="number"
                  min={1}
                  max={pagination.totalPages}
                  value={pageInput}
                  onChange={(e) => setPageInput(e.target.value)}
                  onBlur={commitPage}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitPage();
                    if (e.key === "Escape") setEditingPage(false);
                  }}
                  className="w-10 h-8 rounded-full border border-blue-500 text-center text-sm font-medium text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              );
            }
            return (
              <button
                key={`page-${item}`}
                onClick={() => handlePageChange(item)}
                onDoubleClick={() => {
                  if (isCurrent) {
                    setPageInput(String(pagination.currentPage));
                    setEditingPage(true);
                  }
                }}
                title={isCurrent ? "Double-click to type a page number" : undefined}
                className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors ${
                  isCurrent ? "bg-[#0085FF] text-white" : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {item}
              </button>
            );
          });
        })()}

        <button
          onClick={() => handlePageChange(pagination.currentPage + 1)}
          disabled={!pagination.hasNextPage}
          className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="-mt-6 -mx-4 sm:-mx-6 lg:-mx-8 pt-4">
      {/* ── Column Settings Panel ──────────────────────────────────── */}
      <ColumnSettingsPanel
        isOpen={showColumnSettings}
        onClose={() => setShowColumnSettings(false)}
        columns={columns}
        onSave={saveColumns}
        moduleName="E-Invoices"
      />

      {/* ── Fixed header toolbar — edge-to-edge, matches PurchasePage ──*/}
      <div
        className={`fixed right-0 h-16 px-4 sm:px-6 lg:px-8 border-b flex items-center top-[calc(54px+var(--dc-offline-offset,0px))] lg:top-[calc(64px+var(--dc-offline-offset,0px))] bg-white border-[#E1E4EA]`}
        style={{ left: "var(--sidebar-width, 0px)", zIndex: 40, minHeight: "64px", maxHeight: "64px", boxSizing: "border-box" }}
      >
        {showBulkStrip ? (
          <div className={`${bulkStripClosing ? "animate-slideOutRight" : "animate-slideInLeft"} flex flex-nowrap items-center justify-between gap-4 w-full h-full overflow-x-auto`}>
            <div className="flex flex-nowrap items-center flex-shrink-0">
              <button
                onClick={() => handleExport("excel")}
                className="h-10 px-4 bg-white border border-gray-300 rounded-l-[25px] text-gray-900 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
              >
                <DownloadIcon className="w-4 h-4 text-green-600" />
                Export
              </button>
              <button
                onClick={handleBulkDelete}
                className="h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
              >
                <DeleteIcon className="w-4 h-4 text-red-600" />
                Delete
              </button>
              <button
                onClick={clearSelection}
                className="h-10 px-4 -ml-px bg-white border border-gray-300 rounded-r-[25px] text-gray-900 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <CheckSquare className="w-5 h-5 text-blue-600" />
              <span className="text-blue-800 font-semibold text-sm whitespace-nowrap">
                {selectedIds.length} e-invoice{selectedIds.length !== 1 ? "s" : ""} selected
              </span>
              <button
                onClick={handleSelectAllFiltered}
                className="h-10 px-4 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-[25px] hover:bg-gray-50 focus:outline-none transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
              >
                <CheckSquare className="w-4 h-4" />
                Select All
              </button>
              <button
                onClick={clearSelection}
                className="h-10 px-4 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-[25px] hover:bg-gray-50 focus:outline-none transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
              >
                <X className="w-4 h-4" />
                Deselect All
              </button>
            </div>
          </div>
        ) : (
        <div className="flex items-center gap-2 lg:gap-4 w-full h-full">
          <div className={`flex-shrink-0 flex flex-col justify-center gap-1.5 overflow-hidden transition-opacity duration-300 ease-in-out lg:!w-auto lg:!opacity-100 ${isSearchExpanded ? "w-0 opacity-0" : "w-[190px] opacity-100"}`}>
            {showLoadingSkeleton ? (
              <>
                <Skeleton width={110} height={18} />
                <Skeleton width={170} height={12} />
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <h1 className="m-0 leading-tight font-bold text-base sm:text-lg text-gray-900 truncate">E-Invoices</h1>
                </div>
                <p className="m-0 leading-tight text-[10px] sm:text-xs text-gray-500 font-inter truncate">
                  Create, manage, and track your GST e-invoices
                </p>
              </>
            )}
          </div>

          {showLoadingSkeleton ? (
            <div className="relative flex-1 flex items-center justify-end gap-3">
              <Skeleton width={40} height={40} shape="circle" />
              <Skeleton width={40} height={40} shape="circle" />
              <Skeleton width={150} height={40} shape="circle" />
            </div>
          ) : (
            <>
              {/* Search (expandable circle → pill) */}
              <div className="relative flex-1 min-w-0 flex items-center justify-end">
                <div
                  className={`relative h-10 flex items-center border ${searchTerm ? "border-[#0085FF]" : "border-[#E1E4EA]"} rounded-full bg-white transition-all duration-300 ease-in-out hover:bg-gray-50 focus-within:border-[#0085FF] focus-within:hover:bg-white ${isSearchExpanded ? "w-full lg:w-[416px]" : "w-10"} max-w-full`}
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
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onFocus={() => setIsSearchExpanded(true)}
                    onBlur={() => { if (!searchTerm) setIsSearchExpanded(false); }}
                    placeholder="Search by invoice #, customer..."
                    className={`w-full h-full pl-9 pr-9 bg-transparent text-sm focus:outline-none transition-opacity duration-200 font-inter cursor-pointer ${isSearchExpanded ? "opacity-100 focus:cursor-text" : "opacity-0"}`}
                  />
                  {isSearchExpanded && searchTerm && (
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setSearchTerm("")}
                      aria-label="Clear search"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-5 h-5 rounded-full text-gray-900 hover:bg-gray-100 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" strokeWidth={2.5} />
                    </button>
                  )}
                </div>
              </div>

              {/* Actions group */}
              <div className="relative flex items-center gap-2 lg:gap-4 flex-shrink-0">
                {/* Advanced filter button */}
                <button
                  onClick={() => setShowAdvancedFilters(true)}
                  className={`hidden lg:flex relative items-center justify-center w-10 h-10 rounded-full border transition-colors bg-white ${
                    activeFilters.length > 0
                      ? "border-[#0085FF] text-[#0085FF]"
                      : "border-[#E1E4EA] text-gray-500 hover:bg-gray-50"
                  }`}
                  title="Filters"
                >
                  <FilterIcon size={16} className={activeFilters.length > 0 ? "text-[#0085FF]" : ""} />
                  {activeFilters.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-[#0085FF] text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                      {activeFilters.length}
                    </span>
                  )}
                </button>

                {/* Overflow menu */}
                <div className="relative" ref={moreMenuRef}>
                  <button
                    onClick={() => setIsMoreMenuOpen((prev) => !prev)}
                    className="relative flex items-center justify-center w-10 h-10 rounded-full border border-[#E1E4EA] text-[#525866] hover:bg-gray-50 transition-colors"
                    title="More options"
                  >
                    <MoreIcon className="w-4 h-4" />
                  </button>
                  {isMoreMenuOpen && (
                    <div className="absolute right-0 z-50 mt-2 w-52 bg-white border border-gray-100 rounded-xl shadow-xl py-2 animate-in fade-in zoom-in duration-200 origin-top-right">
                      <button
                        onClick={() => { setShowAdvancedFilters(true); setIsMoreMenuOpen(false); }}
                        className="lg:hidden w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <FilterIcon size={16} />
                        Filters
                        {activeFilters.length > 0 && (
                          <span className="ml-auto bg-blue-100 text-blue-600 text-xs font-bold px-1.5 py-0.5 rounded-full">
                            {activeFilters.length}
                          </span>
                        )}
                      </button>
                      <button
                        onClick={() => { toast("Import — coming soon.", { icon: "🚧" }); setIsMoreMenuOpen(false); }}
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
                        onClick={() => { setShowColumnSettings(true); setIsMoreMenuOpen(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <SettingsIcon className="w-4 h-4 text-gray-400" />
                        Columns
                      </button>
                    </div>
                  )}
                </div>

                {/* Primary action — Connect to Portal */}
                <button
                  onClick={handleConnectPortal}
                  className={`inline-flex items-center justify-center gap-2 h-10 w-10 lg:w-auto px-0 lg:px-4 text-sm font-medium rounded-full focus:outline-none cursor-pointer transition-colors flex-shrink-0 ${
                    portalConnected
                      ? "bg-green-50 text-green-700 hover:bg-green-100"
                      : "bg-[#0085FF] text-white hover:bg-blue-600"
                  }`}
                  title={portalConnected ? "Portal Connected" : "Connect to E-Invoicing Portal"}
                >
                  {portalConnected ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                      <span className="hidden lg:inline">Portal Connected</span>
                    </>
                  ) : (
                    <>
                      <Plug className="w-4 h-4 flex-shrink-0" />
                      <span className="hidden lg:inline">Connect Portal</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
        )}
      </div>

      {/* ── Edge-to-edge scrollable table area ─────────────────────── */}
      <div
        ref={tableScrollRef}
        className="overflow-x-auto overflow-y-auto top-[calc(118px+var(--dc-offline-offset,0px))] lg:top-[calc(128px+var(--dc-offline-offset,0px))]"
        style={{
          position: "fixed",
          left: "var(--sidebar-width, 0px)",
          paddingLeft: "var(--content-inset, 16px)",
          right: 0,
          bottom: !showLoadingSkeleton ? 64 : 0,
        }}
      >
        <div className={`relative bg-white border-r border-[#E1E4EA] ${showLoadingSkeleton || eInvoices.length > 0 ? "border-b" : ""}`}>
          <table
            className="w-full border-separate border-spacing-0 text-left"
            style={{ minWidth: `${table.getTotalSize()}px`, tableLayout: "fixed" }}
          >
            {(() => {
              const allHeaders = table.getHeaderGroups()[0]?.headers || [];
              const leftPinnedInOrder = allHeaders.map((h) => h.column.id).filter((id) => leftPinnedKeys.includes(id));
              const rightPinnedInOrder = allHeaders.map((h) => h.column.id).filter((id) => rightPinnedKeys.includes(id));
              const lastLeftPinnedKey = leftPinnedInOrder.length > 0 ? leftPinnedInOrder[leftPinnedInOrder.length - 1] : null;
              const firstRightPinnedKey = rightPinnedInOrder.length > 0 ? rightPinnedInOrder[0] : null;

              const pinnedLeftOffsets = {};
              let cumLeft = 0;
              allHeaders.forEach((h) => {
                const isLeftStickyCol = h.column.id === "selection" || leftPinnedKeys.includes(h.column.id);
                if (isLeftStickyCol) {
                  pinnedLeftOffsets[h.column.id] = cumLeft;
                  cumLeft += h.getSize();
                }
              });

              const pinnedRightOffsets = {};
              let cumRight = 0;
              [...allHeaders].reverse().forEach((h) => {
                if (rightPinnedKeys.includes(h.column.id)) {
                  pinnedRightOffsets[h.column.id] = cumRight;
                  cumRight += h.getSize();
                }
              });

              return (
                <>
                  <thead className="bg-[#F5F7FA] border-b border-[#E1E4EA] sticky top-0 z-30 select-none">
                    {table.getHeaderGroups().map((headerGroup) => (
                      <tr key={headerGroup.id}>
                        {headerGroup.headers.map((header) => {
                          const colId = header.column.id;
                          const isLeftSticky = colId === "selection" || leftPinnedKeys.includes(colId);
                          const isRightSticky = rightPinnedKeys.includes(colId);
                          const isSticky = isLeftSticky || isRightSticky;
                          const isLeftBoundary = colId === lastLeftPinnedKey;
                          const isRightBoundary = colId === firstRightPinnedKey;
                          const isDraggable = colId !== "selection" && colId !== "actions";
                          const isDragging = draggedColKey === colId;
                          const isDragOver = dragOverColKey === colId && draggedColKey && draggedColKey !== colId;

                          return (
                            <th
                              key={header.id}
                              data-col-id={colId}
                              onMouseDown={isDraggable ? (e) => startColumnDrag(e, colId) : undefined}
                              style={{
                                width: header.getSize(),
                                position: isSticky ? "sticky" : "relative",
                                left: isLeftSticky ? pinnedLeftOffsets[colId] ?? 0 : "auto",
                                right: isRightSticky ? pinnedRightOffsets[colId] ?? 0 : "auto",
                                zIndex: isSticky ? 20 : 1,
                              }}
                              className={`px-4 py-3 text-sm font-bold text-[#525866] border-r border-[#E1E4EA] last:border-r-0 transition-colors bg-[#F5F7FA] ${isDraggable ? "cursor-grab active:cursor-grabbing" : ""} ${isDragOver ? "bg-blue-100" : "hover:bg-gray-100"}`}
                            >
                              <div className="w-full min-w-0" style={{ opacity: isDragging ? 0.35 : 1 }}>
                                {flexRender(header.column.columnDef.header, header.getContext())}
                              </div>
                              {(isLeftBoundary || isRightBoundary) && (
                                <div style={getPinnedBoundaryOverlayStyle(isLeftBoundary ? "left" : "right")} />
                              )}
                              {colId !== "selection" && colId !== "actions" && header.column.getCanResize() && (
                                <div
                                  data-resize-handle="true"
                                  onMouseDown={(e) => { e.stopPropagation(); header.getResizeHandler()(e); }}
                                  onTouchStart={header.getResizeHandler()}
                                  className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none z-50 bg-transparent"
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
                      <TableSkeletonRows numRows={pagination.limit} columns={table.getVisibleLeafColumns().filter((c) => c.id !== "selection")} hasCheckbox />
                    ) : sortedEInvoices.length === 0 ? (
                      <tr>
                        <td colSpan={table.getAllColumns().length} className="px-6 py-12 text-center text-gray-500 font-inter">
                          <EmptyState
                            hasSearch={!!debouncedSearchTerm || activeFilters.length > 0}
                            onClear={() => { setSearchTerm(""); setActiveFilters([]); }}
                            onConnect={handleConnectPortal}
                            portalConnected={portalConnected}
                          />
                        </td>
                      </tr>
                    ) : (
                      table.getRowModel().rows.map((row) => (
                        <tr
                          key={row.id}
                          className="bg-white hover:bg-blue-50 transition-colors"
                          style={{ height: 44, maxHeight: 44 }}
                        >
                          {row.getVisibleCells().map((cell) => {
                            const colId = cell.column.id;
                            const isLeftSticky = colId === "selection" || leftPinnedKeys.includes(colId);
                            const isRightSticky = rightPinnedKeys.includes(colId);
                            const isSticky = isLeftSticky || isRightSticky;
                            const isLeftBoundary = colId === lastLeftPinnedKey;
                            const isRightBoundary = colId === firstRightPinnedKey;
                            const isColDragging = draggedColKey === colId;

                            return (
                              <td
                                key={cell.id}
                                style={{
                                  width: cell.column.getSize(),
                                  height: "44px",
                                  maxHeight: "44px",
                                  boxSizing: "border-box",
                                  position: isSticky ? "sticky" : "static",
                                  left: isLeftSticky ? pinnedLeftOffsets[colId] ?? 0 : "auto",
                                  right: isRightSticky ? pinnedRightOffsets[colId] ?? 0 : "auto",
                                  zIndex: isSticky ? 10 : 1,
                                }}
                                className="px-4 py-0 align-middle text-sm text-[#1C1B1F] bg-inherit border-r border-b border-[#E1E4EA] last:border-r-0"
                              >
                                <div style={{ opacity: isColDragging ? 0.35 : 1 }}>
                                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </div>
                                {(isLeftBoundary || isRightBoundary) && (
                                  <div style={getPinnedBoundaryOverlayStyle(isLeftBoundary ? "left" : "right")} />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </>
              );
            })()}
          </table>
        </div>
      </div>

      {/* ── Drag ghost — portaled to body ──────────────────────────── */}
      {dragGhost && createPortal(
        <div
          ref={ghostElRef}
          style={{ position: "fixed", top: -9999, left: -9999, width: dragGhost.width, zIndex: 10000, pointerEvents: "none" }}
          className="flex flex-col bg-white rounded-lg shadow-2xl overflow-hidden"
        >
          <div className="px-4 py-3 bg-[#F5F7FA] border-b border-[#E1E4EA]" style={{ height: dragGhost.height }}>
            <span className="text-sm font-bold text-[#525866] truncate block">{dragGhost.label}</span>
          </div>
          {dragGhost.previewRows.slice(0, 5).map((rowVal, i) => (
            <div key={i} className="px-4 py-2 border-b border-[#F1F1F5] last:border-b-0">
              <span className="text-sm text-gray-700 truncate block">{rowVal}</span>
            </div>
          ))}
        </div>,
        document.body
      )}

      {/* ── Share dropdown — portaled, WhatsApp/Email/SMS/Copy Link ──── */}
      {shareMenu && createPortal(
        <>
          <div className="fixed inset-0 z-[100009]" onClick={() => { setShareMenu(null); setShareMenuChannel(null); }} />
          <div
            className="fixed z-[100010] w-[160px] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5"
            style={{ top: shareMenu.y, left: shareMenu.x }}
          >
            {(() => {
              const r = shareMenu.row;
              const link = `${window.location.origin}/e-invoicing?invoice=${r._id}`;
              const num = r.invoiceNumber;
              const customerName = r.customer?.name || "Sir/Madam";
              const amt = r.amount != null ? formatINR(r.amount) : "";
              const closeMenu = () => { setShareMenu(null); setShareMenuChannel(null); };

              const waMsg = `Hello ${customerName},\n\nYour e-invoice is ready.\n\nInvoice: ${num || "n/a"}\nAmount: ${amt}\nIRN: ${r.irn || "n/a"}\nView/download: ${link}\n\nRegards`;
              const smsMsg = `Your e-invoice${num ? ` ${num}` : ""} for ${amt} is ready. View/download: ${link}`;
              const emailSubject = `E-Invoice ${num || ""}`;
              const emailBody = `Dear ${customerName},%0D%0A%0D%0APlease find your e-invoice${num ? ` ${num}` : ""} details below.%0D%0A%0D%0AAmount: ${amt}%0D%0AIRN: ${r.irn || "n/a"}%0D%0AAck No: ${r.ackNo || "n/a"}%0D%0A%0D%0AView or download: ${link}%0D%0A%0D%0ARegards`;

              if (shareMenuChannel === "confirm") {
                return null;
              }

              const items = [
                {
                  label: "WhatsApp",
                  icon: <MessageCircle className="w-3.5 h-3.5 text-green-600" />,
                  onClick: () => { window.open(`https://wa.me/?text=${encodeURIComponent(waMsg)}`, "_blank"); closeMenu(); },
                },
                {
                  label: "Email",
                  icon: <Mail className="w-3.5 h-3.5 text-blue-600" />,
                  onClick: () => { window.open(`mailto:?subject=${encodeURIComponent(emailSubject)}&body=${emailBody}`, "_blank"); closeMenu(); },
                },
                {
                  label: "SMS",
                  icon: <MessageSquare className="w-3.5 h-3.5 text-purple-600" />,
                  onClick: () => { window.open(`sms:?body=${encodeURIComponent(smsMsg)}`, "_blank"); closeMenu(); },
                },
                {
                  label: "Copy Link",
                  icon: <Copy className="w-3.5 h-3.5 text-gray-500" />,
                  onClick: () => { navigator.clipboard.writeText(link).catch(() => {}); toast.success("Link copied"); closeMenu(); },
                },
              ];
              return items.map(({ label, icon, onClick }) => (
                <button
                  key={label}
                  onClick={(e) => { e.stopPropagation(); onClick(); }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                >
                  {icon}
                  {label}
                </button>
              ));
            })()}
          </div>
        </>,
        document.body
      )}

      {/* ── Fixed pagination bar ──────────────────────────────────── */}
      {!showLoadingSkeleton && pagination.totalCount > 0 && (
        <div
          className={`fixed bottom-0 right-0 bg-white border-t border-[#E1E4EA] shadow-sm z-[9992] flex items-center ${isSearchOverlayOpen ? "pointer-events-none" : ""}`}
          style={{
            left: "var(--sidebar-width, 0px)",
            height: 64,
            filter: isSearchOverlayOpen ? "brightness(0.6)" : "none",
          }}
        >
          {PaginationControls()}
        </div>
      )}

      {/* ── Slide-in panels ────────────────────────────────────────── */}
      <AdvancedFilterPanel
        isOpen={showAdvancedFilters}
        onClose={() => setShowAdvancedFilters(false)}
        columns={filterColumns}
        filters={activeFilters}
        setFilters={setActiveFilters}
        onApply={(next) => {
          setActiveFilters(next);
          setPagination((p) => ({ ...p, currentPage: 1 }));
        }}
        title="Filter E-Invoices"
        subtitle="Narrow the list by any field"
        emptyStateText="Add a rule to narrow down your e-invoice list."
      />

      <BulkDeleteModal
        isOpen={showBulkDeleteModal}
        message={
          <>
            Are you sure you want to delete <strong>{selectedIds.length}</strong> selected E-Invoices? This action cannot be undone.
          </>
        }
        loading={bulkDeleting}
        onCancel={() => setShowBulkDeleteModal(false)}
        onConfirm={executeBulkDelete}
      />
    </div>
  );
}

function EmptyState({ hasSearch, onClear, onConnect, portalConnected }) {
  if (hasSearch) {
    return (
      <div className="flex flex-col items-center text-center py-8">
        <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center mb-4">
          <EyeIcon className="w-6 h-6 text-gray-300" />
        </div>
        <p className="text-sm font-semibold text-gray-800">No e-invoices match your filters</p>
        <p className="text-xs text-gray-500 mt-1 max-w-sm">
          Try removing a filter or clearing the search.
        </p>
        <button
          onClick={onClear}
          className="mt-4 px-4 py-2 text-xs font-semibold text-[#0085FF] hover:bg-[#0085FF]/5 rounded-full transition-colors"
        >
          Clear filters
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center text-center py-8">
      <div className="text-4xl mb-3">🧾</div>
      <p className="text-base font-semibold text-gray-800">No e-invoices yet</p>
      <p className="text-xs text-gray-500 mt-1 max-w-md">
        Once you connect your GST E-Invoicing Portal and register invoices, they'll show up here
        with their IRN, Ack No., and status.
      </p>
      {!portalConnected && (
        <button
          onClick={onConnect}
          className="mt-4 inline-flex items-center gap-2 h-10 px-5 bg-[#0085FF] hover:bg-[#0075E6] text-white text-sm font-semibold rounded-full transition-colors"
        >
          <Plug className="w-4 h-4" />
          Connect to E-Invoicing Portal
        </button>
      )}
    </div>
  );
}
