import DeleteIcon from "../components/common/DeleteIcon";
import EmptyState from "../components/common/EmptyState";
import BulkDeleteModal from "../components/common/BulkDeleteModal";
import { exportRecordsToCSV } from "../utils/exportRecordsToCSV";
import VideoIcon from "../components/common/VideoIcon";
import Checkbox from "../components/common/Checkbox";
import PlusIcon from "../components/common/PlusIcon";
import MoreIcon from "../components/common/MoreIcon";
import DownloadIcon from "../components/common/DownloadIcon";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import API from "../services/api";
import toast from "react-hot-toast";
import {
  X,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  Pin,
  PinOff,
  CheckSquare,
  Repeat,
  Zap,
  ArrowUp, ArrowDown } from "lucide-react";
import TableSkeletonRows from "../components/common/TableSkeletonRows";
import { useTopLoadingSignal } from "../components/common/TopLoadingBar";
import Skeleton from "../components/common/Skeleton";
import HighlightText from "../components/common/HighlightText";
import SearchIcon from "../components/common/SearchIcon";
import SettingsIcon from "../components/common/SettingsIcon";
import FilterIcon from "../components/common/FilterIcon";
import AdvancedFilterPanel from "../components/common/AdvancedFilterPanel";
import ColumnSettingsPanel from "../components/ColumnSettingsPanel";
import { useColumnSettings } from "../hooks/useColumnSettings";
import { getPinnedBoundaryOverlayStyle } from "../utils/pinnedColumnShadow";
import useSearchOverlayOpen from "../hooks/useSearchOverlayOpen";
import BulkActions from "../components/BulkActions";
import AppToaster from "../components/AppToaster";
import { exportClientSide, formatINR } from "../utils/clientExport";
import SalesSubscriptionForm from "../components/salesSubscription/SalesSubscriptionForm";
import UploadIcon from "../components/common/UploadIcon";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import EditIcon from "../components/common/EditIcon";

/*
 * Sales Subscriptions — recurring billing agreements with a customer (NOT
 * this CRM's own plan/billing subscription — see SubscriptionContext for
 * that). Edge-to-edge list shell mirrors Companies.jsx / SalesReturn.jsx
 * exactly: fixed toolbar, fixed pagination, TanStack Table with resizable/
 * pinned/draggable columns, bulk-selection strip, header/row three-dot
 * menus. See backend/models/SalesSubscription.js + salesSubscriptionController
 * for the recurring-invoice-generation rules this list surfaces.
 */
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

const STATUS_STYLES = {
  Draft: "bg-[#EEF2F9] text-[#56698A]",
  Active: "bg-[#E6F7EF] text-[#1FA971]",
  Expired: "bg-gray-100 text-gray-500",
  Error: "bg-[#FCEAEA] text-[#EA4B4B]",
  Cancelled: "bg-[#FCEAEA] text-[#EA4B4B]",
};
const STATUS_OPTIONS = ["Draft", "Active", "Expired", "Error", "Cancelled"];

const customerOf = (s) =>
  s.deal?.contact?.name || s.deal?.company?.name || s.deal?.contactPerson || s.deal?.title || "—";
const money = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const intervalLabel = (bi) => {
  if (!bi) return "—";
  const unit = bi.unit || "month";
  const value = bi.value || 1;
  return `Every ${value} ${unit}${value > 1 ? "s" : ""}`;
};

const SalesSubscription = () => {
  const isSearchOverlayOpen = useSearchOverlayOpen();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const hasLoadedOnceRef = useRef(false);
  const showLoadingSkeleton = loading && rows.length === 0 && !hasLoadedOnceRef.current;
  useTopLoadingSignal(loading);

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const searchInputRef = useRef(null);

  const [statusFilter, setStatusFilter] = useState("");
  const [activeFilters, setActiveFilters] = useState([]);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingSubscription, setEditingSubscription] = useState(null);

  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportButtonRef = useRef(null);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [generatingId, setGeneratingId] = useState(null);
  const [selected, setSelected] = useState([]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const [selectionMode, setSelectionMode] = useState(true);

  const [showBulkStrip, setShowBulkStrip] = useState(false);
  const [bulkStripClosing, setBulkStripClosing] = useState(false);
  useEffect(() => {
    const active = selectionMode && selected.length > 0;
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
  }, [selectionMode, selected.length]);

  const [openRowActionsId, setOpenRowActionsId] = useState(null);
  const [rowActionsPos, setRowActionsPos] = useState(null);
  const rowActionsRef = useRef(null);
  const [openColumnMenuKey, setOpenColumnMenuKey] = useState(null);
  const [columnMenuPos, setColumnMenuPos] = useState(null);
  const columnMenuRef = useRef(null);
  const tableScrollRef = useRef(null);

  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 0,
    totalCount: 0,
    limit: 50,
    hasNextPage: false,
    hasPrevPage: false,
  });
  const [sortConfig, setSortConfig] = useState({ key: null, direction: null });
  const [editingPage, setEditingPage] = useState(false);
  const [pageInput, setPageInput] = useState("");

  const [pinnedColumns, setPinnedColumns] = useState([]);
  const pinColumnToSide = (colKey, side) =>
    setPinnedColumns((prev) => [...prev.filter((p) => p.key !== colKey), { key: colKey, side }]);
  const unpinColumn = (colKey) =>
    setPinnedColumns((prev) => prev.filter((p) => p.key !== colKey));
  const getColumnPinSide = (colKey) => pinnedColumns.find((p) => p.key === colKey)?.side || null;

  const [draggedColKey, setDraggedColKey] = useState(null);
  const [dragOverColKey, setDragOverColKey] = useState(null);
  const [dragGhost, setDragGhost] = useState(null);
  const dragOverRef = useRef(null);
  const ghostElRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const skipInitialReset = useRef(true);
  useEffect(() => {
    if (skipInitialReset.current) {
      skipInitialReset.current = false;
      return;
    }
    exitSelectionMode();
    setPagination((prev) => ({ ...prev, currentPage: 1 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, statusFilter]);

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
      } else {
        params.append("sortBy", "createdAt");
        params.append("sortOrder", "desc");
      }
      if (debouncedSearch) params.append("search", debouncedSearch);
      if (statusFilter) params.append("status", statusFilter);
      const res = await API.get(`/sales-subscriptions/pagination?${params.toString()}`);
      if (requestId !== fetchRequestIdRef.current) return;
      setRows(res.data.subscriptions || []);
      setPagination((prev) => ({ ...prev, ...res.data.pagination }));
      hasLoadedOnceRef.current = true;
    } catch (err) {
      if (requestId !== fetchRequestIdRef.current) return;
      toast.error(err.response?.data?.error || "Failed to load subscriptions");
      setRows([]);
    } finally {
      if (requestId === fetchRequestIdRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.currentPage, pagination.limit, sortConfig, debouncedSearch, statusFilter]);

  useEffect(() => {
    const onClick = (event) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target)) setIsMoreMenuOpen(false);
      if (exportButtonRef.current && !exportButtonRef.current.contains(event.target)) setShowExportMenu(false);
      if (columnMenuRef.current && !columnMenuRef.current.contains(event.target)) setOpenColumnMenuKey(null);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
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

  useEffect(() => {
    if (!openRowActionsId && !openColumnMenuKey) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = () => {
      setOpenRowActionsId(null);
      setRowActionsPos(null);
      setOpenColumnMenuKey(null);
      setColumnMenuPos(null);
    };
    const onWheel = (e) => { e.preventDefault(); close(); };
    const onKey = (e) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(e.key)) close();
    };
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    window.addEventListener("keydown", onKey, { capture: true });
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("wheel", onWheel, { capture: true });
      window.removeEventListener("keydown", onKey, { capture: true });
    };
  }, [openRowActionsId, openColumnMenuKey]);

  const defaultColumns = useMemo(
    () => [
      { key: "subscriptionNumber", label: "Subscription ID", visible: true, order: 0, required: true, sortable: true },
      { key: "customer", label: "Name", visible: true, order: 1, sortable: true },
      { key: "amount", label: "Amount", visible: true, order: 2, sortable: true },
      { key: "status", label: "Status", visible: true, order: 3, sortable: true, options: STATUS_OPTIONS },
      { key: "interval", label: "Repeat", visible: true, order: 4, sortable: false },
      { key: "period", label: "Start Date - End Date", visible: true, order: 5, sortable: true },
      { key: "invoiceCount", label: "No. Of Invoices", visible: true, order: 6, sortable: true },
      { key: "nextInvoiceDate", label: "Upcoming", visible: true, order: 7, sortable: true },
      { key: "notes", label: "Notes", visible: false, order: 8, sortable: false },
    ],
    []
  );

  // Key is suffixed "-v2" because useColumnSettings lets a SAVED column order
  // override the defaults above. Without a new key, anyone who had already
  // opened this page would keep the old Status-last / Upcoming-second-last
  // order forever and never see the reordering below.
  const { columns, saveColumns, getVisibleColumns } = useColumnSettings("salesSubscriptions-v2", defaultColumns);
  const visibleColumns = useMemo(() => getVisibleColumns(), [columns]);

  const getFieldValue = (s, key) => {
    if (key === "subscriptionNumber") return s.subscriptionNumber || "";
    if (key === "customer") return customerOf(s);
    if (key === "amount") return money(s.amount);
    if (key === "interval") return intervalLabel(s.billingInterval);
    if (key === "period") {
      const start = s.startDate ? new Date(s.startDate).toLocaleDateString("en-IN") : "—";
      const end = s.endDate ? new Date(s.endDate).toLocaleDateString("en-IN") : "No end date";
      return `${start} - ${end}`;
    }
    if (key === "invoiceCount") return String(s.invoiceCount ?? 0);
    if (key === "nextInvoiceDate") return s.nextInvoiceDate ? new Date(s.nextInvoiceDate).toLocaleDateString("en-IN") : "—";
    if (key === "status") return s.status || "";
    if (key === "notes") return s.notes || "";
    return "";
  };

  const openCreate = () => { setEditingSubscription(null); setShowForm(true); };
  const openEdit = (row) => { setEditingSubscription(row); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditingSubscription(null); };

  const exitSelectionMode = () => {
    setSelectionMode(true);
    setSelected([]);
    setShowBulkActions(false);
  };

  const handleSelect = (id) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const handleSelectAll = () => {
    if (selected.length === rows.length && rows.length > 0) setSelected([]);
    else setSelected(rows.map((r) => r._id));
  };
  const handleSelectAllAcrossPages = async () => {
    try {
      const params = new URLSearchParams({ allIds: "true" });
      if (debouncedSearch) params.append("search", debouncedSearch);
      if (statusFilter) params.append("status", statusFilter);
      const res = await API.get(`/sales-subscriptions/pagination?${params.toString()}`);
      setSelected(res.data.ids || []);
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to select all rows");
    }
  };
  const handleDeselectAllExtra = () => setSelected(rows.map((r) => r._id));

  const handleDelete = (id) => { setToDelete(id); setShowDeleteModal(true); };
  const confirmDelete = async () => {
    if (!toDelete) return;
    const toastId = toast.loading("Deleting…");
    try {
      await API.delete(`/sales-subscriptions/${toDelete}`);
      toast.success("Subscription deleted", { id: toastId });
      fetchRows();
      exitSelectionMode();
    } catch (err) {
      toast.error(err.response?.data?.error || "Delete failed", { id: toastId });
    } finally {
      setShowDeleteModal(false);
      setToDelete(null);
    }
  };

  const handleBulkDelete = async (ids) => {
    setBulkLoading(true);
    try {
      await Promise.all(ids.map((id) => API.delete(`/sales-subscriptions/${id}`)));
      toast.success(`Deleted ${ids.length} subscriptions`);
      fetchRows();
      exitSelectionMode();
    } catch (err) {
      toast.error(err.response?.data?.error || "Bulk delete failed");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkUpdate = async ({ field, value, itemIds }) => {
    setBulkLoading(true);
    try {
      await Promise.all(
        itemIds.map((id) =>
          field === "status"
            ? API.put(`/sales-subscriptions/${id}/status`, { status: value })
            : API.put(`/sales-subscriptions/${id}`, { [field]: value })
        )
      );
      toast.success(`Updated ${itemIds.length} subscriptions`);
      fetchRows();
      exitSelectionMode();
    } catch (err) {
      toast.error(err.response?.data?.error || err.response?.data?.message || "Bulk update failed");
    } finally {
      setBulkLoading(false);
    }
  };

  const subFieldConfig = {
    fields: [{ key: "status", label: "Status", type: "select", options: STATUS_OPTIONS }],
  };

  const handleGenerateInvoice = async (row) => {
    setGeneratingId(row._id);
    try {
      const res = await API.post(`/sales-subscriptions/${row._id}/generate-invoice`);
      toast.success(`Invoice ${res.data.invoice?.invoiceNumber || ""} generated`);
      fetchRows();
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || "Failed to generate invoice");
    } finally {
      setGeneratingId(null);
      setOpenRowActionsId(null);
    }
  };

  const EXPORT_COLUMNS = [
    { label: "Subscription ID", value: (s) => s.subscriptionNumber },
    { label: "Customer", value: (s) => customerOf(s) },
    { label: "Amount", value: (s) => formatINR(s.amount) },
    { label: "Repeat", value: (s) => intervalLabel(s.billingInterval) },
    { label: "Start Date", value: (s) => (s.startDate ? new Date(s.startDate).toLocaleDateString() : "") },
    { label: "End Date", value: (s) => (s.endDate ? new Date(s.endDate).toLocaleDateString() : "No end date") },
    { label: "No. Of Invoices", value: (s) => s.invoiceCount ?? 0 },
    { label: "Upcoming", value: (s) => (s.nextInvoiceDate ? new Date(s.nextInvoiceDate).toLocaleDateString() : "") },
    { label: "Status", value: (s) => s.status },
  ];
  const handleExport = (format) => {
    if (!window.confirm(`Export in ${format}?`)) return;
    exportClientSide(format, {
      rows,
      columns: EXPORT_COLUMNS,
      fileNamePrefix: "sales_subscriptions_export",
      title: "Sales Subscriptions Report",
    });
  };

  const subFilterColumns = [
    { key: "subscriptionNumber", label: "Subscription ID" },
    { key: "status", label: "Status", options: STATUS_OPTIONS },
    { key: "amount", label: "Amount" },
    { key: "notes", label: "Notes" },
  ];

  const handlePageChange = (page) => {
    if (page >= 1 && page <= pagination.totalPages && page !== pagination.currentPage) {
      setPagination((prev) => ({ ...prev, currentPage: page }));
    }
  };
  const handleLimitChange = (n) => setPagination((prev) => ({ ...prev, limit: n, currentPage: 1 }));

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
      const label = visibleColumns.find((vc) => vc.key === colId)?.label || colId;
      const previewRows = rows.map((r) => String(getFieldValue(r, colId) ?? "").trim() || "—");
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
    const visibleSorted = sorted.filter((c) => c.visible);
    const draggedIdx = visibleSorted.findIndex((c) => c.key === draggedKey);
    const targetIdx = visibleSorted.findIndex((c) => c.key === targetKey);
    if (draggedIdx === -1 || targetIdx === -1) return;
    const reorderedVisible = [...visibleSorted];
    const [moved] = reorderedVisible.splice(draggedIdx, 1);
    reorderedVisible.splice(targetIdx, 0, moved);
    let visibleCursor = 0;
    const newColumns = sorted
      .map((c) => (c.visible ? reorderedVisible[visibleCursor++] : c))
      .map((c, idx) => ({ ...c, order: idx }));
    saveColumns(newColumns);
  };

  const columnHelper = createColumnHelper();

  const renderRowActionsMenu = (row) => {
    const isOpen = openRowActionsId === row._id;
    const close = () => { setOpenRowActionsId(null); setRowActionsPos(null); };
    const canGenerate = row.status !== "Cancelled" && row.status !== "Expired";
    return (
      <div
        className="relative flex-shrink-0"
        ref={isOpen ? rowActionsRef : null}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (isOpen) return close();
            const zMenu = getAncestorZoom(document.body);
            const MENU_W = 160;
            const MARGIN = 8;
            const MENU_H = 260;
            const rect = e.currentTarget.getBoundingClientRect();
            const viewportH = window.innerHeight / zMenu;
            const viewportW = window.innerWidth / zMenu;
            const top = rect.bottom / zMenu + 4;
            const bottomAnchor = rect.top / zMenu - 4;
            const openUp = viewportH - top < MENU_H + MARGIN;
            let calcTop = openUp ? bottomAnchor - MENU_H : top;
            calcTop = Math.max(MARGIN, Math.min(calcTop, viewportH - MENU_H - MARGIN));
            let calcLeft = rect.right / zMenu - MENU_W;
            calcLeft = Math.min(calcLeft, viewportW - MENU_W - MARGIN);
            calcLeft = Math.max(calcLeft, MARGIN);
            setRowActionsPos({ top: calcTop, left: calcLeft });
            setOpenRowActionsId(row._id);
          }}
          className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
          title="More actions"
        >
          <MoreIcon className="w-4 h-4" />
        </button>
        {isOpen && rowActionsPos && createPortal(
          <>
            <div className="fixed inset-0 z-[9998]" onClick={close} />
            <div
              style={{ position: "fixed", top: rowActionsPos.top, left: rowActionsPos.left }}
              className="w-[160px] z-[9999] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5 animate-in fade-in zoom-in duration-150 origin-top-right"
            >
              {canGenerate && (
                <button
                  onClick={() => handleGenerateInvoice(row)}
                  disabled={generatingId === row._id}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                >
                  <Zap className="w-3.5 h-3.5" />
                  {generatingId === row._id ? "Generating…" : "Generate Invoice Now"}
                </button>
              )}
              {canGenerate && <div className="w-full border-t border-[#F1F1F5] my-0.5" />}
              <button
                onClick={() => { close(); openEdit(row); }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
              >
                <EditIcon className="w-3.5 h-3.5 text-blue-600" />
                Edit
              </button>
              <div className="w-full border-t border-[#F1F1F5] my-0.5" />
              <button
                onClick={() => { close(); handleDelete(row._id); }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#CD3636] hover:bg-red-50"
              >
                <DeleteIcon className="w-4 h-4 text-[#CD3636]" />
                Delete
              </button>
            </div>
          </>,
          document.body
        )}
      </div>
    );
  };

  const tableColumns = useMemo(() => {
    const cols = [];

    if (selectionMode) {
      cols.push(
        columnHelper.display({
          id: "selection",
          size: 60,
          enableResizing: false,
          header: () => (
            <div className="flex justify-center items-center w-full">
              <Checkbox checked={selected.length === rows.length && rows.length > 0} onChange={handleSelectAll}  uncheckedColor="text-[#525866]"/>
            </div>
          ),
          cell: ({ row }) => (
            <div className="flex justify-center items-center gap-1 w-full">
              <Checkbox checked={selectedSet.has(row.original._id)} onChange={() => handleSelect(row.original._id)} />
            </div>
          ),
        })
      );
    }

    const leftPinnedKeys = pinnedColumns.filter((p) => p.side === "left").map((p) => p.key);
    const rightPinnedKeys = pinnedColumns.filter((p) => p.side === "right").map((p) => p.key);
    const leftPinnedFields = visibleColumns.filter((vc) => leftPinnedKeys.includes(vc.key));
    const rightPinnedFields = visibleColumns.filter((vc) => rightPinnedKeys.includes(vc.key));
    const unpinnedFields = visibleColumns.filter(
      (vc) => !leftPinnedKeys.includes(vc.key) && !rightPinnedKeys.includes(vc.key)
    );
    const orderedFields = [...leftPinnedFields, ...unpinnedFields, ...rightPinnedFields];
    const lastColumnKey = orderedFields[orderedFields.length - 1]?.key;

    orderedFields.forEach((vc) => {
      cols.push(
        columnHelper.accessor((r) => getFieldValue(r, vc.key), {
          id: vc.key,
          size:
            vc.key === "subscriptionNumber" ? 150 :
            vc.key === "customer" ? 200 :
            vc.key === "period" ? 220 :
            vc.key === "status" ? 130 :
            vc.key === "amount" ? 130 :
            160,
          header: () => {
            const isSortable = vc.sortable !== false;
            const pinSide = getColumnPinSide(vc.key);
            const isMenuOpen = openColumnMenuKey === vc.key;
            return (
              <div className="flex items-center justify-between w-full group">
                <span className="truncate flex-1 min-w-0 flex items-center gap-1.5" title={vc.label}>
                  <span className="truncate">{vc.label}</span>
                  {sortConfig.key === vc.key && (sortConfig.direction === "asc"
                    ? <ArrowUp className="w-3 h-3 text-[#0085FF] flex-shrink-0" />
                    : <ArrowDown className="w-3 h-3 text-[#0085FF] flex-shrink-0" />)}
                  {pinSide && (
                    <Pin
                      size={12}
                      className="text-blue-500 fill-blue-500 flex-shrink-0"
                      style={{ transform: "rotate(45deg)" }}
                    />
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
                          pinSide === "left" ? unpinColumn(vc.key) : pinColumnToSide(vc.key, "left");
                        }}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${pinSide === "left" ? "bg-blue-50 text-blue-700" : "text-[#161618] hover:bg-gray-50"}`}
                      >
                        {pinSide === "left" ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5 text-[#1C1B1F]" />}
                        Pin to Left
                      </button>
                      <button
                        onClick={() => {
                          setOpenColumnMenuKey(null); setColumnMenuPos(null);
                          pinSide === "right" ? unpinColumn(vc.key) : pinColumnToSide(vc.key, "right");
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
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal ${sortConfig.key === vc.key && sortConfig.direction === "asc" ? "bg-blue-50 text-blue-700 font-medium" : "text-[#161618] hover:bg-gray-50"}`}
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
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal ${sortConfig.key === vc.key && sortConfig.direction === "desc" ? "bg-blue-50 text-blue-700 font-medium" : "text-[#161618] hover:bg-gray-50"}`}
                          >
                            <ChevronDown className="w-3.5 h-3.5 text-[#1C1B1F]" />
                            Sort Descending
                          </button>
                        </>
                      )}
                      <div className="w-full border-t border-[#F1F1F5] my-0.5" />
                      <button
                        disabled={vc.required}
                        onClick={() => {
                          if (vc.required) return;
                          setOpenColumnMenuKey(null); setColumnMenuPos(null);
                          saveColumns(columns.map((c) => (c.key === vc.key ? { ...c, visible: false } : c)));
                        }}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${vc.required ? "text-gray-300 cursor-not-allowed" : "text-[#161618] hover:bg-gray-50"}`}
                      >
                        <EyeOff className={`w-3.5 h-3.5 ${vc.required ? "text-gray-300" : "text-[#1C1B1F]"}`} />
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
            const s = row.original;
            let baseContent;

            if (vc.key === "subscriptionNumber") {
              baseContent = (
                <span className="text-gray-900 font-semibold truncate" title={s.subscriptionNumber}>
                  <HighlightText text={s.subscriptionNumber} query={searchTerm} />
                </span>
              );
            } else if (vc.key === "customer") {
              baseContent = <span className="text-gray-700 truncate block" title={customerOf(s)}><HighlightText text={customerOf(s)} query={searchTerm} /></span>;
            } else if (vc.key === "amount") {
              baseContent = <span className="text-gray-900 font-medium">{money(s.amount)}</span>;
            } else if (vc.key === "interval") {
              baseContent = <span className="text-gray-600">{intervalLabel(s.billingInterval)}</span>;
            } else if (vc.key === "period") {
              baseContent = <span className="text-gray-600">{getFieldValue(s, "period")}</span>;
            } else if (vc.key === "invoiceCount") {
              baseContent = <span className="text-gray-700">{s.invoiceCount ?? 0}</span>;
            } else if (vc.key === "nextInvoiceDate") {
              baseContent = <span className="text-gray-600">{getFieldValue(s, "nextInvoiceDate")}</span>;
            } else if (vc.key === "status") {
              baseContent = (
                <div className="flex items-center justify-start">
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${STATUS_STYLES[s.status] || STATUS_STYLES.Draft}`}>
                    {s.status}
                  </span>
                </div>
              );
            } else if (vc.key === "notes") {
              baseContent = <span className="text-xs text-gray-600 truncate block" title={s.notes || ""}><HighlightText text={s.notes || "—"} query={searchTerm} /></span>;
            } else {
              baseContent = "—";
            }

            if (vc.key === lastColumnKey) {
              return (
                <div className="flex items-center justify-between w-full gap-2">
                  <div className="min-w-0 flex-1">{baseContent}</div>
                  {renderRowActionsMenu(s)}
                </div>
              );
            }
            return baseContent;
          },
        })
      );
    });

    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleColumns, pinnedColumns, selectionMode, rows, selected, selectedSet, openColumnMenuKey, columnMenuPos, openRowActionsId, rowActionsPos, columns, searchTerm, generatingId]);

  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    state: {},
    columnResizeMode: "onChange",
  });

  const totalPages = pagination.totalPages || 1;

  return (
    <div className="-mt-6 -mx-4 sm:-mx-6 lg:-mx-8 pt-4">
      <AppToaster />

      <ColumnSettingsPanel
        isOpen={showColumnSettings}
        onClose={() => setShowColumnSettings(false)}
        columns={columns}
        onSave={saveColumns}
        moduleName="Sales Subscriptions"
      />

      <AdvancedFilterPanel
        isOpen={showAdvancedFilters}
        onClose={() => setShowAdvancedFilters(false)}
        columns={subFilterColumns}
        filters={activeFilters}
        setFilters={setActiveFilters}
        onApply={(nf) => setActiveFilters(nf)}
        title="Filter Subscriptions"
        subtitle="Narrow down by ID, status, or amount"
        emptyStateText="Add a rule to filter the list."
      />

      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10000] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <DeleteIcon className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Subscription?</h3>
              <p className="text-sm text-gray-500 mb-6">
                Invoices already generated from this subscription are not affected — only future generation stops.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => { setShowDeleteModal(false); setToDelete(null); }}
                  className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-5 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 shadow-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <BulkDeleteModal
        isOpen={showBulkDeleteModal}
        message={
          <>
            Delete <strong>{selected.length}</strong> subscriptions? Already-generated invoices
            are unaffected.
          </>
        }
        loading={bulkLoading}
        onCancel={() => setShowBulkDeleteModal(false)}
        onConfirm={async () => {
          await handleBulkDelete(selected);
          setShowBulkDeleteModal(false);
        }}
        onExportBeforeDelete={() => {
          const records = rows.filter((r) => selected.includes(r._id));
          exportRecordsToCSV(records, "sales_subscriptions");
        }}
      />

      {showForm && (
        <SalesSubscriptionForm
          editingSubscription={editingSubscription}
          onRequestClose={closeForm}
          onSuccess={() => { toast.success(editingSubscription ? "Subscription updated" : "Subscription created"); closeForm(); fetchRows(); }}
          onError={(msg) => toast.error(msg)}
        />
      )}

      <BulkActions
        isOpen={showBulkActions}
        onClose={() => setShowBulkActions(false)}
        selectedItems={rows.filter((r) => selected.includes(r._id))}
        onBulkUpdate={handleBulkUpdate}
        fieldConfig={subFieldConfig}
        module="salesSubscriptions"
      />

      <div className="bg-white overflow-visible">
        <div
          className={`fixed right-0 h-16 px-4 lg:px-6 border-b flex items-center top-[calc(54px+var(--dc-offline-offset,0px))] lg:top-[calc(64px+var(--dc-offline-offset,0px))] bg-white border-[#E1E4EA]`}
          style={{
            left: "var(--sidebar-width, 0px)",
            zIndex: 40,
            minHeight: "64px",
            maxHeight: "64px",
            boxSizing: "border-box",
          }}
        >
          {showBulkStrip ? (
            <div className={`${bulkStripClosing ? "animate-slideOutRight" : "animate-slideInLeft"} flex flex-nowrap items-center justify-between gap-4 w-full h-full overflow-x-auto`}>
              <div className="flex flex-nowrap items-center flex-shrink-0">
                <button
                  onClick={() => handleExport("Excel")}
                  className="h-10 px-4 bg-white border border-gray-300 text-gray-900 text-sm font-medium rounded-l-[25px] hover:bg-gray-50 flex items-center gap-2 whitespace-nowrap"
                >
                  <DownloadIcon className="w-4 h-4 text-green-600" />
                  Export
                </button>
                <button
                  onClick={() => setShowBulkActions(true)}
                  className="h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium hover:bg-gray-50 flex items-center gap-2 whitespace-nowrap"
                >
                  <EditIcon className="w-4 h-4 text-blue-600" />
                  Bulk Update
                </button>
                <button
                  onClick={() => setShowBulkDeleteModal(true)}
                  disabled={bulkLoading}
                  className="h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50 whitespace-nowrap"
                >
                  <DeleteIcon className="w-4 h-4 text-red-600" />
                  Delete
                </button>
                <button
                  onClick={exitSelectionMode}
                  className="h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium rounded-r-[25px] hover:bg-gray-50 flex items-center gap-2 whitespace-nowrap"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </button>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <CheckSquare className="w-5 h-5 text-blue-600" />
                <span className="text-blue-800 font-semibold whitespace-nowrap">
                  {selected.length} subscription{selected.length !== 1 ? "s" : ""} selected
                </span>
                <button
                  onClick={handleSelectAllAcrossPages}
                  className="h-10 px-4 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 flex items-center gap-2 whitespace-nowrap"
                >
                  <CheckSquare className="w-4 h-4" />
                  Select All
                </button>
                <button
                  onClick={handleDeselectAllExtra}
                  className="h-10 px-4 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 flex items-center gap-2 whitespace-nowrap"
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
                      <h1 className="m-0 leading-tight font-bold text-base sm:text-lg text-gray-900 truncate">Subscriptions</h1>
                      <VideoIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    </div>
                    <p className="m-0 leading-tight text-[10px] sm:text-xs text-gray-500 truncate">
                      Recurring billing agreements with your customers
                    </p>
                  </>
                )}
              </div>

              {showLoadingSkeleton ? (
                <div className="relative flex-1 flex items-center justify-end gap-3">
                  <Skeleton width={40} height={40} shape="circle" />
                  <Skeleton width={40} height={40} shape="circle" />
                  <Skeleton width={40} height={40} shape="circle" />
                  <Skeleton width={160} height={40} shape="circle" />
                </div>
              ) : (
                <>
                  <div className="relative flex-1 min-w-0 flex items-center justify-end">
                    <div className={`relative h-10 flex items-center border ${searchTerm ? "border-[#0085FF]" : "border-[#E1E4EA]"} rounded-full bg-white transition-all duration-300 ease-in-out hover:bg-gray-50 focus-within:border-[#0085FF] focus-within:hover:bg-white ${isSearchExpanded ? "w-full lg:w-[416px]" : "w-10"} max-w-full`}>
                      <SearchIcon
                        className="absolute left-3 cursor-pointer z-10 top-1/2 -translate-y-1/2 w-4 h-4 text-[#525866]"
                        onClick={() => { setIsSearchExpanded(true); searchInputRef.current?.focus(); }}
                      />
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onFocus={() => setIsSearchExpanded(true)}
                        onBlur={() => { if (!searchTerm) setIsSearchExpanded(false); }}
                        className={`w-full h-full pl-9 pr-9 bg-transparent text-sm focus:outline-none transition-opacity duration-200 cursor-pointer ${isSearchExpanded ? "opacity-100 focus:cursor-text" : "opacity-0"}`}
                        placeholder="Search subscriptions by ID, customer…"
                      />
                      {isSearchExpanded && searchTerm && (
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => setSearchTerm("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-5 h-5 rounded-full text-gray-900 hover:bg-gray-100"
                          aria-label="Clear search"
                        >
                          <X className="w-3.5 h-3.5" strokeWidth={2.5} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="relative flex items-center gap-2 lg:gap-4 flex-shrink-0">
                    <button
                      onClick={() => setShowAdvancedFilters(true)}
                      className="hidden lg:flex relative items-center justify-center w-10 h-10 rounded-full border border-[#E1E4EA] text-gray-500 hover:bg-gray-50"
                      title="Filters"
                    >
                      <FilterIcon size={16} />
                      {activeFilters.length > 0 && (
                        <span className="absolute -top-1 -right-1 bg-[#0085FF] text-white text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full">
                          {activeFilters.length}
                        </span>
                      )}
                    </button>

                    <div className="relative" ref={moreMenuRef}>
                      <button
                        onClick={() => setIsMoreMenuOpen((v) => !v)}
                        className="relative flex items-center justify-center w-10 h-10 rounded-full border border-[#E1E4EA] text-[#525866] hover:bg-gray-50"
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
                          </button>
                          <button
                            disabled
                            title="Bulk import for subscriptions isn't built yet"
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-400 cursor-not-allowed"
                          >
                            <UploadIcon className="w-4 h-4" />
                            Import (soon)
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
                                  onClick={() => { handleExport("Excel"); setShowExportMenu(false); setIsMoreMenuOpen(false); }}
                                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors first:rounded-t-lg flex items-center gap-2"
                                >
                                  Export as Excel
                                </button>
                                <button
                                  onClick={() => { handleExport("PDF"); setShowExportMenu(false); setIsMoreMenuOpen(false); }}
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

                    <button
                      onClick={openCreate}
                      className="inline-flex items-center justify-center gap-2 h-10 w-10 lg:w-auto px-0 lg:px-4 bg-[#0085FF] text-white text-sm font-medium rounded-full hover:bg-blue-600 flex-shrink-0"
                      title="Create Subscription"
                    >
                      <PlusIcon className="w-4 h-4" />
                      <span className="hidden lg:inline">Create Subscription</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div
          ref={tableScrollRef}
          className="overflow-x-auto overflow-y-auto top-[calc(118px+var(--dc-offline-offset,0px))] lg:top-[calc(128px+var(--dc-offline-offset,0px))]"
          style={{
            position: "fixed",
            left: "var(--sidebar-width, 0px)",
            right: 0,
            bottom: !showLoadingSkeleton ? 64 : 0,
          }}
        >
          <div className={`relative bg-white border-r border-[#E1E4EA] ${showLoadingSkeleton || rows.length > 0 ? "border-b" : ""}`}>
            <table
              className="w-full border-separate border-spacing-0 text-left"
              style={{ minWidth: `${table.getTotalSize()}px`, tableLayout: "fixed" }}
            >
              {(() => {
                const leftPinnedKeys = pinnedColumns.filter((p) => p.side === "left").map((p) => p.key);
                const rightPinnedKeys = pinnedColumns.filter((p) => p.side === "right").map((p) => p.key);
                const allHeaders = table.getHeaderGroups()[0]?.headers || [];
                const leftInOrder = allHeaders.map((h) => h.column.id).filter((id) => leftPinnedKeys.includes(id));
                const rightInOrder = allHeaders.map((h) => h.column.id).filter((id) => rightPinnedKeys.includes(id));
                const lastLeftPinnedKey = leftInOrder.length ? leftInOrder[leftInOrder.length - 1] : null;
                const firstRightPinnedKey = rightInOrder.length ? rightInOrder[0] : null;

                const pinnedLeftOffsets = {};
                let cumL = 0;
                allHeaders.forEach((h) => {
                  const isLS = h.column.id === "selection" || leftPinnedKeys.includes(h.column.id);
                  if (isLS) { pinnedLeftOffsets[h.column.id] = cumL; cumL += h.getSize(); }
                });
                const pinnedRightOffsets = {};
                let cumR = 0;
                [...allHeaders].reverse().forEach((h) => {
                  if (rightPinnedKeys.includes(h.column.id)) { pinnedRightOffsets[h.column.id] = cumR; cumR += h.getSize(); }
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
                            const boundaryShadowSide = isLeftBoundary ? "left" : isRightBoundary ? "right" : null;
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
                                {boundaryShadowSide && (
                                  <div style={getPinnedBoundaryOverlayStyle(boundaryShadowSide)} />
                                )}
                                {colId !== "selection" && header.column.getCanResize() && (
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
                      ) : rows.length === 0 ? (
                        <tr>
                          <td colSpan={table.getAllColumns().length}>
                            <EmptyState
                              icon={Repeat}
                              noun="Subscription"
                              isFiltered={!!(debouncedSearch || activeFilters?.length)}
                              title="Create Subscription Now"
                              description="Bill a customer automatically on a schedule — e.g. ₹5,000 every month — instead of creating an invoice by hand each time."
                              onCreate={openCreate}
                            />
                          </td>
                        </tr>
                      ) : (
                        table.getRowModel().rows.map((row) => (
                          <tr
                            key={row.id}
                            className={`bg-white hover:bg-blue-50 transition-colors ${selectedSet.has(row.original._id) ? "!bg-blue-50" : ""}`}
                            style={{ height: 44, maxHeight: 44 }}
                          >
                            {row.getVisibleCells().map((cell) => {
                              const colId = cell.column.id;
                              const isLeftSticky = colId === "selection" || leftPinnedKeys.includes(colId);
                              const isRightSticky = rightPinnedKeys.includes(colId);
                              const isSticky = isLeftSticky || isRightSticky;
                              const isLeftBoundary = colId === lastLeftPinnedKey;
                              const isRightBoundary = colId === firstRightPinnedKey;
                              const boundaryShadowSide = isLeftBoundary ? "left" : isRightBoundary ? "right" : null;
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
                                  {boundaryShadowSide && (
                                    <div style={getPinnedBoundaryOverlayStyle(boundaryShadowSide)} />
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

        {dragGhost && createPortal(
          <div
            ref={ghostElRef}
            style={{ position: "fixed", top: -9999, left: -9999, width: dragGhost.width, zIndex: 10000, pointerEvents: "none" }}
            className="flex flex-col bg-white rounded-lg shadow-2xl overflow-hidden"
          >
            <div className="px-4 py-3 bg-[#F5F7FA] border-b border-[#E1E4EA]" style={{ height: dragGhost.height }}>
              <span className="text-sm font-bold text-[#525866] truncate block">{dragGhost.label}</span>
            </div>
            {dragGhost.previewRows.map((v, i) => (
              <div key={i} className="px-4 py-2 border-b border-[#F1F1F5] last:border-b-0">
                <span className="text-sm text-gray-700 truncate block">{v}</span>
              </div>
            ))}
          </div>,
          document.body
        )}

        {!showLoadingSkeleton && (
          <div
            className={`fixed bottom-0 right-0 bg-white border-t border-[#E1E4EA] shadow-sm z-[9992] flex items-center ${isSearchOverlayOpen ? "pointer-events-none" : ""}`}
            style={{
              left: "var(--sidebar-width, 0px)",
              height: 64,
              filter: isSearchOverlayOpen ? "brightness(0.6)" : "none",
            }}
          >
            <div className="w-full bg-white px-4 py-3 flex items-center justify-between sm:px-6">
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div className="flex items-center space-x-2">
                  <p className="text-sm text-gray-700">
                    Showing <span className="font-semibold">{pagination.totalCount === 0 ? 0 : (pagination.currentPage - 1) * pagination.limit + 1}</span> to{" "}
                    <span className="font-semibold">{Math.min(pagination.currentPage * pagination.limit, pagination.totalCount)}</span> of{" "}
                    <span className="font-semibold">{pagination.totalCount}</span> results
                  </p>
                  <div className="relative ml-2">
                    <select
                      value={pagination.limit}
                      onChange={(e) => handleLimitChange(parseInt(e.target.value))}
                      className="appearance-none border border-gray-300 rounded-lg pl-3 pr-8 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    >
                      {[10, 20, 50, 100, 150].map((n) => <option key={n} value={n}>{n} per page</option>)}
                    </select>
                    <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePageChange(pagination.currentPage - 1)}
                    disabled={!pagination.hasPrevPage}
                    className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  {(() => {
                    const items = [1];
                    if (pagination.currentPage > 2) items.push("left-dots");
                    if (pagination.currentPage !== 1 && pagination.currentPage !== totalPages) items.push(pagination.currentPage);
                    if (pagination.currentPage < totalPages - 1) items.push("right-dots");
                    if (totalPages > 1) items.push(totalPages);
                    const commit = () => {
                      const n = parseInt(pageInput, 10);
                      if (!Number.isNaN(n)) handlePageChange(Math.min(Math.max(n, 1), totalPages));
                      setEditingPage(false);
                    };
                    return items.map((item, idx) => {
                      if (item === "left-dots" || item === "right-dots") {
                        return <span key={`${item}-${idx}`} className="flex items-center justify-center w-8 h-8 text-sm font-medium text-gray-400 select-none">…</span>;
                      }
                      const isCurrent = item === pagination.currentPage;
                      if (isCurrent && editingPage) {
                        return (
                          <input
                            key="page-edit"
                            autoFocus
                            type="number"
                            min={1}
                            max={totalPages}
                            value={pageInput}
                            onChange={(e) => setPageInput(e.target.value)}
                            onBlur={commit}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commit();
                              if (e.key === "Escape") setEditingPage(false);
                            }}
                            className="w-10 h-8 rounded-full border border-blue-500 text-center text-sm font-medium text-blue-700 focus:outline-none"
                          />
                        );
                      }
                      return (
                        <button
                          key={`p-${item}`}
                          onClick={() => handlePageChange(item)}
                          onDoubleClick={() => { if (isCurrent) { setPageInput(String(pagination.currentPage)); setEditingPage(true); } }}
                          className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${isCurrent ? "bg-[#0085FF] text-white" : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"}`}
                        >
                          {item}
                        </button>
                      );
                    });
                  })()}
                  <button
                    onClick={() => handlePageChange(pagination.currentPage + 1)}
                    disabled={!pagination.hasNextPage}
                    className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SalesSubscription;
