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
  ClipboardList,
  DollarSign,
  Share2,
  MessageCircle,
  Mail,
  MessageSquare,
  Copy,
  Lock,
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Underline as UnderlineIcon,
  Strikethrough as StrikethroughIcon,
  ListOrdered,
  List as ListIcon,
  Link as LinkIcon,
  Repeat,
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
import useBodyScrollLock from "../hooks/useBodyScrollLock";
import BulkActions from "../components/BulkActions";
import AppToaster from "../components/AppToaster";
import { exportClientSide, formatINR } from "../utils/clientExport";
import SalesReturnForm from "../components/salesReturn/SalesReturnForm";
import SalesReturnPreview from "../components/salesReturn/SalesReturnPreview";
import ImportSalesReturns from "../components/salesReturn/ImportSalesReturns";
import RecordSalesReturnRefundModal from "../components/salesReturn/RecordSalesReturnRefundModal";
import UploadIcon from "../components/common/UploadIcon";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import EyeIcon from "../components/common/EyeIcon";
import EditIcon from "../components/common/EditIcon";

// Sales Returns list. Same shell as Companies.jsx. Confirmed is the only
// stock-moving state; Partial/Paid come from real refunds, never a status menu.
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
  Pending: "bg-[#FDF3E6] text-[#EA9927]",
  Confirmed: "bg-[#E6F7EF] text-[#1FA971]",
  Partial: "bg-[#FFF4E5] text-[#D97A0B]",
  Paid: "bg-[#E6F8FD] text-[#27B4EA]",
  Cancelled: "bg-[#FCEAEA] text-[#EA4B4B]",
  // Legacy single-marker status from before refunds were real Payments. Still
  // rendered so old rows read correctly; nothing can newly reach it.
  Refunded: "bg-[#E6F8FD] text-[#27B4EA]",
};
// Settable from the UI. Partial/Paid are absent on purpose — they follow from
// recorded refunds, and the backend rejects them from any status endpoint.
const STATUS_OPTIONS = ["Draft", "Pending", "Confirmed", "Cancelled"];
// Every status the list can display or filter on, including the money-driven
// and legacy ones.
const ALL_STATUSES = ["Draft", "Pending", "Confirmed", "Partial", "Paid", "Cancelled", "Refunded"];
// Goods are already back: the row can only stay put or be Cancelled.
const GOODS_RETURNED = ["Confirmed", "Partial", "Paid", "Refunded"];

const sumRefunds = (r) => (r?.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);

// Refund column: how much has actually gone back vs the return total. Legacy
// "Refunded" rows have no payments, so they fall back to their recorded mode.
const refundSummary = (r) => {
  const paid = sumRefunds(r);
  if (paid > 0) {
    const due = Math.max(0, (Number(r.grandTotal) || 0) - paid);
    return due > 0
      ? `₹${paid.toLocaleString("en-IN")} of ₹${Number(r.grandTotal || 0).toLocaleString("en-IN")}`
      : `₹${paid.toLocaleString("en-IN")} · Fully refunded`;
  }
  if (r.status === "Refunded") return r.refundMode || "Settled (legacy)";
  return r.refundMode || "—";
};

const customerOf = (r) =>
  r.deal?.contact?.name ||
  r.deal?.company?.name ||
  r.deal?.contactPerson ||
  r.deal?.title ||
  "—";
const invoiceOf = (r) => r.invoice?.invoiceNumber || "—";
const money = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SalesReturn = () => {
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
  const [editingReturn, setEditingReturn] = useState(null);
  const [previewReturn, setPreviewReturn] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  // Record Refund drawer — refunding the customer for a Confirmed return,
  // recorded as a real Payment(OUT) against it. Partial/Paid follow from that
  // money (see RecordSalesReturnRefundModal).
  const [refundReturn, setRefundReturn] = useState(null);
  const [showRefundModal, setShowRefundModal] = useState(false);

  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef(null);
  const [showImport, setShowImport] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportButtonRef = useRef(null);

  // Share via WhatsApp/Email/SMS, reusing the org's saved Message Templates
  // and Branding so content stays consistent across modules.
  const [shareMenu, setShareMenu] = useState(null);
  const [shareMenuChannel, setShareMenuChannel] = useState(null);
  // Change-status flyout (submenu opened from the row's "Change Status" action),
  // mirroring PurchasePage / other modules.
  const [statusMenu, setStatusMenu] = useState(null);
  // Share is click-to-open/pinned (its button toggles shareMenu directly)
  // — this is just the unconditional close used by closeRowMenu and the
  // scroll handler.
  const forceCloseShareFlyout = () => {
    setShareMenu(null);
    setShareMenuChannel(null);
  };
  const [waTemplatesList, setWaTemplatesList] = useState([]);
  const [smsTemplatesList, setSmsTemplatesList] = useState([]);
  const [emailTemplatesList, setEmailTemplatesList] = useState([]);
  const [shareCompanyName, setShareCompanyName] = useState("");

  const [emailCompose, setEmailCompose] = useState(null);
  useBodyScrollLock(!!emailCompose);
  const [emailComposeTo, setEmailComposeTo] = useState("");
  const [emailComposeCc, setEmailComposeCc] = useState("");
  const [emailComposeBcc, setEmailComposeBcc] = useState("");
  const [showEmailCc, setShowEmailCc] = useState(false);
  const [showEmailBcc, setShowEmailBcc] = useState(false);
  const [emailComposeSubject, setEmailComposeSubject] = useState("");
  const [emailComposeBody, setEmailComposeBody] = useState("");
  const [emailComposeSending, setEmailComposeSending] = useState(false);
  const [emailPreviewMode, setEmailPreviewMode] = useState(false);
  const [emailTemplateOpen, setEmailTemplateOpen] = useState(false);
  const emailBodyEditorRef = useRef(null);
  const EMAIL_FROM_ADDRESS = import.meta.env.VITE_SENDGRID_FROM_EMAIL || "";
  const EMAIL_FROM_NAME = import.meta.env.VITE_SENDGRID_FROM_NAME || "";

  const [smsCompose, setSmsCompose] = useState(null);
  const [smsComposeTo, setSmsComposeTo] = useState("");
  const [smsComposeBody, setSmsComposeBody] = useState("");
  const [smsComposeSending, setSmsComposeSending] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
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

  // Debounce search — same "wait until the user stops typing" pattern the
  // other list pages use to avoid firing a request per keystroke.
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

  // Latest-request guard: a response is only applied if no newer fetch has
  // started, so a slow earlier request can't overwrite fresher results.
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
      const res = await API.get(`/sales-returns/pagination?${params.toString()}`);
      if (requestId !== fetchRequestIdRef.current) return;
      setRows(res.data.salesReturns || []);
      setPagination((prev) => ({ ...prev, ...res.data.pagination }));
      hasLoadedOnceRef.current = true;
    } catch (err) {
      if (requestId !== fetchRequestIdRef.current) return;
      toast.error(err.response?.data?.error || "Failed to load sales returns");
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
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target)) {
        setIsMoreMenuOpen(false);
      }
      if (exportButtonRef.current && !exportButtonRef.current.contains(event.target)) {
        setShowExportMenu(false);
      }
      if (columnMenuRef.current && !columnMenuRef.current.contains(event.target)) {
        setOpenColumnMenuKey(null);
      }
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

  // Lock page scroll while a row-actions or column-options menu is open —
  // same reasoning as Companies.jsx: the menu is portaled to document.body,
  // so a background scroll would slide the table out from under it.
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

  // Column model
  const defaultColumns = useMemo(
    () => [
      { key: "returnNumber", label: "SR Number", visible: true, order: 0, required: true, sortable: true },
      { key: "invoice", label: "Invoice", visible: true, order: 1, sortable: true },
      { key: "customer", label: "Customer", visible: true, order: 2, sortable: true },
      { key: "returnDate", label: "Return Date", visible: true, order: 3, sortable: true },
      { key: "grandTotal", label: "Amount", visible: true, order: 4, sortable: true },
      // Filtering must be able to reach the money-driven and legacy statuses,
      // even though they can't be set from the UI.
      { key: "status", label: "Status", visible: true, order: 5, sortable: true, options: ALL_STATUSES },
      { key: "refund", label: "Refund", visible: true, order: 6, sortable: false },
      { key: "reason", label: "Reason", visible: false, order: 7, sortable: true },
      { key: "notes", label: "Notes", visible: false, order: 8, sortable: true },
    ],
    []
  );

  const { columns, saveColumns, getVisibleColumns } = useColumnSettings("salesReturns", defaultColumns);
  const visibleColumns = useMemo(() => getVisibleColumns(), [columns]);

  const getFieldValue = (r, key) => {
    if (key === "returnNumber") return r.returnNumber || "";
    if (key === "invoice") return invoiceOf(r);
    if (key === "customer") return customerOf(r);
    if (key === "returnDate")
      return r.returnDate ? new Date(r.returnDate).toLocaleDateString("en-IN") : "";
    if (key === "grandTotal") return money(r.grandTotal);
    if (key === "status") return r.status || "";
    if (key === "refund") return refundSummary(r);
    if (key === "reason") return r.reason || "";
    if (key === "notes") return r.notes || "";
    return "";
  };

  const openCreate = () => { setEditingReturn(null); setShowForm(true); };
  const openEdit = (row) => { setEditingReturn(row); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditingReturn(null); };
  const openPreview = (row) => { setPreviewReturn(row); setShowPreview(true); };
  const closePreview = () => { setShowPreview(false); setPreviewReturn(null); };

  const handleDownload = async (row) => {
    try {
      const response = await API.get(`/sales-returns/download/${row._id}`, { responseType: "blob" });
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Sales-Return-${row.returnNumber || row._id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Sales return downloaded");
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to download sales return");
    }
  };

  const textToEmailHtml = (text) => (text || "").replace(/\n/g, "<br>");

  // The same org-wide message templates and branding the other share flows use.
  const fetchShareSettings = async () => {
    try {
      const [settingsRes, brandingRes] = await Promise.all([
        API.get("/document-settings"),
        API.get("/branding").catch(() => null),
      ]);
      setWaTemplatesList(Array.isArray(settingsRes.data?.whatsappTemplates) ? settingsRes.data.whatsappTemplates : []);
      setSmsTemplatesList(Array.isArray(settingsRes.data?.smsTemplates) ? settingsRes.data.smsTemplates : []);
      setEmailTemplatesList(Array.isArray(settingsRes.data?.emailTemplates) ? settingsRes.data.emailTemplates : []);
      if (brandingRes?.data?.companyName) setShareCompanyName(brandingRes.data.companyName);
    } catch (err) {
      console.error("Failed to load share settings in SalesReturn", err);
    }
  };

  useEffect(() => {
    fetchShareSettings();
  }, []);

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
      const res = await API.get(`/sales-returns/pagination?${params.toString()}`);
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
      await API.delete(`/sales-returns/${toDelete}`);
      toast.success("Sales return deleted", { id: toastId });
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
      await Promise.all(ids.map((id) => API.delete(`/sales-returns/${id}`)));
      toast.success(`Deleted ${ids.length} sales returns`);
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
            ? API.put(`/sales-returns/${id}/status`, { status: value })
            : API.put(`/sales-returns/${id}`, { [field]: value })
        )
      );
      toast.success(`Updated ${itemIds.length} sales returns`);
      fetchRows();
      exitSelectionMode();
    } catch (err) {
      toast.error(err.response?.data?.error || err.response?.data?.message || "Bulk update failed");
    } finally {
      setBulkLoading(false);
    }
  };

  const srFieldConfig = {
    fields: [{ key: "status", label: "Status", type: "select", options: STATUS_OPTIONS }],
  };

  const handleStatusChange = async (row, next) => {
    try {
      await API.put(`/sales-returns/${row._id}/status`, { status: next });
      toast.success("Status updated");
      fetchRows();
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || "Failed to update status");
    }
    setOpenRowActionsId(null);
  };

  const EXPORT_COLUMNS = [
    { label: "SR Number", value: (r) => r.returnNumber },
    { label: "Invoice", value: (r) => invoiceOf(r) },
    { label: "Customer", value: (r) => customerOf(r) },
    { label: "Return Date", value: (r) => new Date(r.returnDate || r.createdAt).toLocaleDateString() },
    { label: "Amount", value: (r) => formatINR(r.grandTotal) },
    { label: "Status", value: (r) => r.status },
    { label: "Refund", value: (r) => refundSummary(r) },
  ];
  const handleExport = (format) => {
    if (!window.confirm(`Export in ${format}?`)) return;
    exportClientSide(format, {
      rows,
      columns: EXPORT_COLUMNS,
      fileNamePrefix: "sales_returns_export",
      title: "Sales Returns Report",
    });
  };

  const srFilterColumns = [
    { key: "returnNumber", label: "SR Number" },
    { key: "status", label: "Status", options: ALL_STATUSES },
    { key: "grandTotal", label: "Amount" },
    { key: "reason", label: "Reason" },
    { key: "notes", label: "Notes" },
  ];

  const handlePageChange = (page) => {
    if (page >= 1 && page <= pagination.totalPages && page !== pagination.currentPage) {
      setPagination((prev) => ({ ...prev, currentPage: page }));
    }
  };
  const handleLimitChange = (n) => setPagination((prev) => ({ ...prev, limit: n, currentPage: 1 }));

  // Column drag/drop — identical mechanic to Companies.jsx.
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
    const close = () => {
      setOpenRowActionsId(null);
      setRowActionsPos(null);
      forceCloseShareFlyout();
      setStatusMenu(null);
    };
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
            const MENU_H = 300;
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
              className="w-[160px] z-[9999] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5 max-h-[70vh] overflow-y-auto"
            >
              <button
                onClick={() => { close(); openPreview(row); }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
              >
                <EyeIcon className="w-3.5 h-3.5 text-blue-600" />
                View
              </button>
              <button
                onClick={() => { close(); openEdit(row); }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
              >
                <EditIcon className="w-3.5 h-3.5 text-blue-600" />
                Edit
              </button>
              <button
                onClick={() => { close(); handleDownload(row); }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
              >
                <DownloadIcon className="w-3.5 h-3.5 text-green-600" />
                Download PDF
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  // Click-to-open and pinned. Clicking again on an
                  // already-open flyout for this row closes it.
                  if (shareMenu?.doc?._id === row._id) {
                    forceCloseShareFlyout();
                    return;
                  }
                  const zMenu = getAncestorZoom(document.body);
                  const DROPDOWN_W = 160;
                  const GAP = 0;
                  const rect = e.currentTarget.getBoundingClientRect();
                  setShareMenu({
                    doc: row,
                    x: Math.max(4, rect.left / zMenu - DROPDOWN_W - GAP),
                    y: rect.top / zMenu,
                  });
                  setShareMenuChannel(null);
                }}
                className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
              >
                <span className="flex items-center gap-2">
                  <Share2 className="w-3.5 h-3.5 text-blue-600" />
                  Share
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
              </button>
              {["Confirmed", "Partial", "Paid"].includes(row.status) && (
                <button
                  onClick={() => { close(); setRefundReturn(row); setShowRefundModal(true); }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-blue-600 hover:bg-blue-50 whitespace-nowrap"
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  Record Refund
                </button>
              )}
              {row.status !== "Refunded" && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // Toggle the status submenu, positioned to the left of the row
                    // menu (same pattern as Share). The row menu stays open.
                    if (statusMenu?.doc?._id === row._id) {
                      setStatusMenu(null);
                      return;
                    }
                    forceCloseShareFlyout();
                    const zMenu = getAncestorZoom(document.body);
                    const DROPDOWN_W = 160;
                    const rect = e.currentTarget.getBoundingClientRect();
                    setStatusMenu({
                      doc: row,
                      x: Math.max(4, rect.left / zMenu - DROPDOWN_W),
                      y: rect.top / zMenu,
                    });
                  }}
                  className="w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                >
                  <span className="flex items-center gap-2">
                    <Repeat className="w-3.5 h-3.5 text-orange-600" />
                    Change Status
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                </button>
              )}
              <div className="w-full border-t border-[#F1F1F5] my-0.5" />
              <button
                onClick={() => { close(); handleDelete(row._id); }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-red-600 hover:bg-red-50 whitespace-nowrap"
              >
                <DeleteIcon className="w-3.5 h-3.5" />
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
            vc.key === "returnNumber" ? 150 :
            vc.key === "customer" ? 220 :
            vc.key === "invoice" ? 150 :
            vc.key === "grandTotal" ? 140 :
            vc.key === "status" ? 140 :
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
            const r = row.original;
            let baseContent;

            if (vc.key === "returnNumber") {
              baseContent = (
                <button
                  onClick={() => openPreview(r)}
                  className="text-[#0085FF] font-semibold hover:underline truncate text-left"
                  title={r.returnNumber}
                >
                  <HighlightText text={r.returnNumber} query={searchTerm} />
                </button>
              );
            } else if (vc.key === "invoice") {
              baseContent = <span className="text-blue-600 truncate block" title={invoiceOf(r)}><HighlightText text={invoiceOf(r)} query={searchTerm} /></span>;
            } else if (vc.key === "customer") {
              baseContent = <span className="text-gray-700 truncate block" title={customerOf(r)}><HighlightText text={customerOf(r)} query={searchTerm} /></span>;
            } else if (vc.key === "returnDate") {
              baseContent = <span className="text-gray-600">{r.returnDate ? new Date(r.returnDate).toLocaleDateString("en-IN") : "—"}</span>;
            } else if (vc.key === "grandTotal") {
              baseContent = <span className="text-gray-900 font-medium">{money(r.grandTotal)}</span>;
            } else if (vc.key === "status") {
              // Plain colored pill, same shape as PurchaseOrderPage/PurchasePage's
              // status column: `inline-block px-3 py-1 rounded-full text-xs
              // font-semibold border`, label only — no icon.
              baseContent = (
                <div className="flex items-center justify-start">
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${STATUS_STYLES[r.status] || STATUS_STYLES.Draft}`}>
                    {r.status}
                  </span>
                </div>
              );
            } else if (vc.key === "refund") {
              baseContent = (
                <span className="text-xs text-gray-600">{refundSummary(r)}</span>
              );
            } else if (vc.key === "reason" || vc.key === "notes") {
              const val = r[vc.key] || "";
              baseContent = <span className="text-xs text-gray-600 truncate block" title={val}><HighlightText text={val || "—"} query={searchTerm} /></span>;
            } else {
              baseContent = "—";
            }

            // The ⋮ menu is appended to whichever column currently sits last,
            // since pin/drag can move that around.
            if (vc.key === lastColumnKey) {
              return (
                <div className="flex items-center justify-between w-full gap-2">
                  <div className="min-w-0 flex-1">{baseContent}</div>
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleColumns, pinnedColumns, selectionMode, rows, selected, selectedSet, openColumnMenuKey, columnMenuPos, openRowActionsId, rowActionsPos, columns, searchTerm]);

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
        moduleName="Sales Returns"
      />

      <AdvancedFilterPanel
        isOpen={showAdvancedFilters}
        onClose={() => setShowAdvancedFilters(false)}
        columns={srFilterColumns}
        filters={activeFilters}
        setFilters={setActiveFilters}
        onApply={(nf) => setActiveFilters(nf)}
        title="Filter Sales Returns"
        subtitle="Narrow down by number, status, amount or reason"
        emptyStateText="Add a rule to filter the list."
      />

      {statusMenu && createPortal(
        <>
          <div className="fixed inset-0 z-[100011]" onClick={() => setStatusMenu(null)} />
          <div
            className="fixed z-[100012] w-[160px] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5"
            style={{ top: statusMenu.y, left: statusMenu.x }}
          >
            {STATUS_OPTIONS.map((st) => (
              <button
                key={st}
                onClick={(e) => {
                  e.stopPropagation();
                  if (st !== statusMenu.doc.status) {
                    handleStatusChange(statusMenu.doc, st);
                  }
                  setStatusMenu(null);
                  setOpenRowActionsId(null);
                  setRowActionsPos(null);
                }}
                className={`w-full text-left px-2 py-1.5 rounded-md text-xs whitespace-nowrap ${
                  statusMenu.doc.status === st
                    ? "bg-blue-50 text-blue-600 font-medium"
                    : "text-[#161618] hover:bg-gray-50"
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}

      {shareMenu && createPortal(
        <>
          <div className="fixed inset-0 z-[100009]" onClick={() => { setShareMenu(null); setShareMenuChannel(null); }} />
          <div
            className="fixed z-[100010] w-[160px] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5"
            style={{ top: shareMenu.y, left: shareMenu.x }}
          >
            {(() => {
              const link = `${window.location.origin}/view/salesReturn/${shareMenu.doc._id}`;
              const num = shareMenu.doc.returnNumber;
              const d = shareMenu.doc;
              const customerName = customerOf(d);
              const amt = d.grandTotal != null ? `₹${Number(d.grandTotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "";
              const closeMenu = () => { setShareMenu(null); setShareMenuChannel(null); };
              const fillTpl = (tpl) => tpl
                .replace(/{customerName}/g, customerName)
                .replace(/{docType}/g, "Sales Return")
                .replace(/{number}/g, num || "")
                .replace(/{amount}/g, amt)
                .replace(/{link}/g, link)
                .replace(/{company}/g, shareCompanyName || "");

              const buildWaMsg = (tpl) => `Hello ${customerName || ""},\n\n${tpl?.line1 || `Your Sales Return from ${shareCompanyName || "us"} is ready.`}\n\nDocument: ${num || "n/a"}\nTotal: ${amt}\nView/download: ${link}${tpl?.line2 ? `\n\n${tpl.line2}` : ""}\n\nRegards,\n${shareCompanyName || "the sender"}`;
              const buildSmsMsg = (tpl) => tpl?.body
                ? fillTpl(tpl.body)
                : `${shareCompanyName || "We"}: your Sales Return${num ? ` ${num}` : ""} is ready. View/download: ${link}`;
              const buildEmailSubject = (tpl) => tpl?.subject ? fillTpl(tpl.subject) : `Sales Return ${num || ""}${shareCompanyName ? ` from ${shareCompanyName}` : ""}`.trim();
              const buildEmailBody = (tpl) => tpl?.body
                ? fillTpl(tpl.body)
                : `Dear ${customerName || "Sir/Madam"},\n\nPlease find attached your Sales Return${num ? ` ${num}` : ""}.\n\nYou can also view or download it online:\n${link}\n\nRegards,\n${shareCompanyName || "the sender"}`;

              const channels = {
                whatsapp: {
                  list: waTemplatesList,
                  send: (tpl) => { window.open(`https://wa.me/?text=${encodeURIComponent(buildWaMsg(tpl))}`, "_blank"); closeMenu(); },
                },
                email: {
                  list: emailTemplatesList,
                  send: (tpl) => {
                    setEmailComposeTo(d.deal?.contact?.email || d.deal?.company?.email || "");
                    setEmailComposeSubject(buildEmailSubject(tpl));
                    setEmailComposeBody(textToEmailHtml(buildEmailBody(tpl)));
                    setEmailCompose({ doc: d });
                    closeMenu();
                  },
                },
                sms: {
                  list: smsTemplatesList,
                  send: (tpl) => {
                    setSmsComposeTo(d.deal?.contact?.phone || d.deal?.company?.phone || "");
                    setSmsComposeBody(buildSmsMsg(tpl));
                    setSmsCompose({ doc: d });
                    closeMenu();
                  },
                },
              };

              const openChannel = (channel) => {
                const { list, send } = channels[channel];
                if (list.length <= 1) send(list[0] || null);
                else setShareMenuChannel(channel);
              };

              if (shareMenuChannel) {
                const { list, send } = channels[shareMenuChannel];
                return (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); setShareMenuChannel(null); }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium text-gray-500 hover:bg-gray-50 border-b border-[#F1F1F5] mb-0.5 whitespace-nowrap"
                    >
                      ← Back
                    </button>
                    {list.map((tpl) => (
                      <button
                        key={tpl.id}
                        onClick={(e) => { e.stopPropagation(); send(tpl); }}
                        className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                      >
                        <span className="truncate">{tpl.name}</span>
                        {tpl.isDefault && <span className="text-[9px] text-green-600 font-semibold flex-shrink-0">Default</span>}
                      </button>
                    ))}
                  </>
                );
              }

              const items = [
                { label: "WhatsApp", icon: <MessageCircle className="w-3.5 h-3.5 text-green-600" />, onClick: () => openChannel("whatsapp") },
                { label: "Email", icon: <Mail className="w-3.5 h-3.5 text-blue-600" />, onClick: () => openChannel("email") },
                { label: "SMS", icon: <MessageSquare className="w-3.5 h-3.5 text-purple-600" />, onClick: () => openChannel("sms") },
                { label: "Copy Link", icon: <Copy className="w-3.5 h-3.5 text-gray-500" />, onClick: () => { navigator.clipboard.writeText(link).catch(() => {}); toast.success("Link copied"); closeMenu(); } },
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
      {emailCompose && (() => {
        const dname = "Sales Return";
        const dnum = emailCompose.doc.returnNumber;
        const link = `${window.location.origin}/view/salesReturn/${emailCompose.doc._id}`;
        const cname = customerOf(emailCompose.doc);
        const eAmt = emailCompose.doc.grandTotal != null
          ? `₹${Number(emailCompose.doc.grandTotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
          : "";
        const fillEmailTpl = (tpl) => tpl
          .replace(/{customerName}/g, cname)
          .replace(/{docType}/g, dname)
          .replace(/{number}/g, dnum || "")
          .replace(/{amount}/g, eAmt)
          .replace(/{link}/g, link)
          .replace(/{company}/g, shareCompanyName || "");
        const applyTemplate = (key) => {
          const saved = emailTemplatesList.find((tpl) => tpl.id === key);
          let nextSubject;
          let nextBody;
          if (saved) {
            nextSubject = fillEmailTpl(saved.subject || "");
            nextBody = textToEmailHtml(fillEmailTpl(saved.body || ""));
          } else if (key === "standard") {
            nextSubject = `${dname} ${dnum || ""}${shareCompanyName ? ` from ${shareCompanyName}` : ""}`.trim();
            nextBody = textToEmailHtml(`Dear ${cname || "Sir/Madam"},\n\nPlease find attached your ${dname}${dnum ? ` ${dnum}` : ""}.\n\nYou can also view or download it online: ${link}\n\nRegards,\n${shareCompanyName || "the sender"}`);
          } else if (key === "reminder") {
            nextSubject = `Reminder: ${dname} ${dnum || ""} pending`;
            nextBody = textToEmailHtml(`Dear ${cname || "Sir/Madam"},\n\nThis is a reminder that your ${dname}${dnum ? ` ${dnum}` : ""} is awaiting your review.\n\nView it here: ${link}\n\nContact us if you have any questions.\n\nRegards,\n${shareCompanyName || "the sender"}`);
          } else if (key === "followup") {
            nextSubject = `Following up on ${dname} ${dnum || ""}`;
            nextBody = textToEmailHtml(`Dear ${cname || "Sir/Madam"},\n\nWe wanted to follow up regarding ${dname}${dnum ? ` ${dnum}` : ""} shared earlier.\n\nView or download: ${link}\n\nWe look forward to hearing from you.\n\nRegards,\n${shareCompanyName || "the sender"}`);
          }
          setEmailComposeSubject(nextSubject);
          setEmailComposeBody(nextBody);
          if (emailBodyEditorRef.current) {
            emailBodyEditorRef.current.innerHTML = nextBody;
          }
          setEmailTemplateOpen(false);
        };
        const doSend = async () => {
          if (!emailComposeTo || emailComposeSending) return;
          setEmailComposeSending(true);
          try {
            await API.post(`/public/salesReturn/${emailCompose.doc._id}/email`, {
              email: emailComposeTo,
              cc: emailComposeCc,
              bcc: emailComposeBcc,
              subject: emailComposeSubject,
              body: emailComposeBody,
            });
            toast.success("Email sent successfully");
            setEmailCompose(null);
            setEmailComposeTo("");
            setEmailComposeCc("");
            setEmailComposeBcc("");
            setShowEmailCc(false);
            setShowEmailBcc(false);
            setEmailComposeSubject("");
            setEmailComposeBody("");
            setEmailPreviewMode(false);
          } catch (err) {
            toast.error(err.response?.data?.error || "Failed to send email");
          } finally {
            setEmailComposeSending(false);
          }
        };
        const execCmd = (cmd, value = null) => {
          emailBodyEditorRef.current?.focus();
          document.execCommand(cmd, false, value);
          setEmailComposeBody(emailBodyEditorRef.current?.innerHTML || "");
        };
        const insertLink = () => {
          const url = window.prompt("Enter URL");
          if (url) execCmd("createLink", url);
        };
        const toolbarButtons = [
          { icon: <BoldIcon className="w-3.5 h-3.5" />, title: "Bold", onClick: () => execCmd("bold") },
          { icon: <ItalicIcon className="w-3.5 h-3.5" />, title: "Italic", onClick: () => execCmd("italic") },
          { icon: <UnderlineIcon className="w-3.5 h-3.5" />, title: "Underline", onClick: () => execCmd("underline") },
          { icon: <StrikethroughIcon className="w-3.5 h-3.5" />, title: "Strikethrough", onClick: () => execCmd("strikeThrough") },
          { icon: <ListOrdered className="w-3.5 h-3.5" />, title: "Numbered list", onClick: () => execCmd("insertOrderedList") },
          { icon: <ListIcon className="w-3.5 h-3.5" />, title: "Bulleted list", onClick: () => execCmd("insertUnorderedList") },
          { icon: <LinkIcon className="w-3.5 h-3.5" />, title: "Insert link", onClick: insertLink },
        ];
        return (
          <>
            <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[100011]" onClick={() => { setEmailCompose(null); setEmailTemplateOpen(false); }} />
            {/* Same inset, rounded quick-drawer chrome as CompanyForm/ItemForm/CallLogForm
                (dc-panel-card) — this panel just keeps its own wider, taller compose width
                instead of the standard dc-panel-w. */}
            <div className="fixed dc-panel-card w-[calc(100%-3rem)] max-w-[580px] bg-white shadow-2xl z-[100012] flex flex-col overflow-hidden animate-slideInRight" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 rounded-t-2xl flex-shrink-0">
                <div className="flex items-center gap-3">
                  <button onClick={() => setEmailCompose(null)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                  <h2 className="text-base font-semibold text-gray-900">Send Email</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEmailPreviewMode((prev) => !prev)}
                    className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    {emailPreviewMode ? "Edit" : "Preview"}
                  </button>
                  <button
                    disabled={!emailComposeTo || emailComposeSending}
                    onClick={doSend}
                    className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                  >
                    {emailComposeSending ? (
                      <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sending…</>
                    ) : (
                      <><Mail className="w-4 h-4" /> Send Email</>
                    )}
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
                  <div className="flex items-center w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50">
                    <span className="flex items-center gap-1.5 text-sm text-gray-600 flex-1 min-w-0">
                      <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] font-semibold flex items-center justify-center flex-shrink-0">DC</span>
                      <span className="min-w-0 truncate">
                        {EMAIL_FROM_NAME && <strong className="mr-1">{EMAIL_FROM_NAME}</strong>}
                        {EMAIL_FROM_ADDRESS}
                      </span>
                      <Lock className="w-3 h-3 text-gray-400 flex-shrink-0" />
                    </span>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                      {!showEmailCc && (
                        <button type="button" onClick={() => setShowEmailCc(true)} className="px-2 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">Cc</button>
                      )}
                      {!showEmailBcc && (
                        <button type="button" onClick={() => setShowEmailBcc(true)} className="px-2 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">Bcc</button>
                      )}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
                  <input type="email" value={emailComposeTo} onChange={(e) => setEmailComposeTo(e.target.value)} placeholder="recipient@example.com" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
                </div>
                {showEmailCc && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-medium text-gray-500">Cc</label>
                      <button type="button" onClick={() => { setShowEmailCc(false); setEmailComposeCc(""); }} className="text-xs font-medium text-gray-400 hover:text-gray-600">Remove</button>
                    </div>
                    <input type="text" value={emailComposeCc} onChange={(e) => setEmailComposeCc(e.target.value)} placeholder="comma-separated addresses" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                )}
                {showEmailBcc && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-medium text-gray-500">Bcc</label>
                      <button type="button" onClick={() => { setShowEmailBcc(false); setEmailComposeBcc(""); }} className="text-xs font-medium text-gray-400 hover:text-gray-600">Remove</button>
                    </div>
                    <input type="text" value={emailComposeBcc} onChange={(e) => setEmailComposeBcc(e.target.value)} placeholder="comma-separated addresses" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Subject</label>
                  <input type="text" value={emailComposeSubject} onChange={(e) => setEmailComposeSubject(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
                </div>
                <div className="relative">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-gray-500">Body</label>
                    <button type="button" onClick={() => setEmailTemplateOpen((prev) => !prev)} className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors">
                      + Add template <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                  {emailTemplateOpen && (
                    <div className="absolute right-0 top-6 bg-white border border-gray-200 rounded-lg shadow-lg w-64 z-10 py-1">
                      {[
                        ...emailTemplatesList.map((tpl) => ({
                          key: tpl.id,
                          label: tpl.name,
                          desc: tpl.isDefault ? "Default · From Document Settings" : "From Document Settings",
                        })),
                        { key: "standard", label: "Standard", desc: "Thank you for your business" },
                        { key: "reminder", label: "Reminder", desc: "Document pending review" },
                        { key: "followup", label: "Follow-up", desc: "Check in on document" },
                      ].map(({ key, label, desc }) => (
                        <button key={key} onClick={() => applyTemplate(key)} className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors">
                          <p className="text-sm font-medium text-gray-800">{label}</p>
                          <p className="text-xs text-gray-400">{desc}</p>
                        </button>
                      ))}
                    </div>
                  )}
                  {emailPreviewMode ? (
                    <div className="w-full min-h-[220px] px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 [&_a]:text-blue-600 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5" dangerouslySetInnerHTML={{ __html: emailComposeBody }} />
                  ) : (
                    <>
                      <div className="flex items-center gap-0.5 border border-gray-200 border-b-0 rounded-t-lg bg-gray-50 px-1.5 py-1">
                        {toolbarButtons.map(({ icon, title, onClick }) => (
                          <button key={title} type="button" title={title} onMouseDown={(e) => { e.preventDefault(); onClick(); }} className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors">{icon}</button>
                        ))}
                      </div>
                      <div
                        ref={(el) => {
                          emailBodyEditorRef.current = el;
                          if (el && el.dataset.init !== "true") {
                            el.innerHTML = emailComposeBody;
                            el.dataset.init = "true";
                          }
                        }}
                        contentEditable
                        suppressContentEditableWarning
                        onInput={(e) => setEmailComposeBody(e.currentTarget.innerHTML)}
                        className="w-full min-h-[220px] px-3 py-2 border border-gray-200 rounded-b-lg text-sm focus:outline-none focus:border-blue-500 [&_a]:text-blue-600 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                      />
                    </>
                  )}
                </div>
              </div>
              <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100 bg-white rounded-b-2xl">
                <button
                  disabled={!emailComposeTo || emailComposeSending}
                  onClick={doSend}
                  className="w-full px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                >
                  {emailComposeSending ? (
                    <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sending…</>
                  ) : (
                    <><Mail className="w-4 h-4" /> Send Email</>
                  )}
                </button>
              </div>
            </div>
          </>
        );
      })()}
      {smsCompose && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100011]" onClick={() => setSmsCompose(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="bg-purple-100 p-2 rounded-lg">
                  <MessageSquare className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Send SMS</h2>
                  <p className="text-xs text-gray-400">Sales Return #{smsCompose.doc.returnNumber}</p>
                </div>
              </div>
              <button onClick={() => setSmsCompose(null)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">To (phone number)</label>
                <input type="tel" value={smsComposeTo} onChange={(e) => setSmsComposeTo(e.target.value)} placeholder="+91 98765 43210" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-purple-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Message</label>
                <textarea rows={4} value={smsComposeBody} onChange={(e) => setSmsComposeBody(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-purple-500 resize-none" />
                <p className="text-xs text-gray-400 mt-1">{smsComposeBody.length} characters</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
              <button onClick={() => setSmsCompose(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">Cancel</button>
              <button
                disabled={!smsComposeTo || smsComposeSending}
                onClick={async () => {
                  if (!smsComposeTo || smsComposeSending) return;
                  setSmsComposeSending(true);
                  try {
                    await API.post(`/public/salesReturn/${smsCompose.doc._id}/sms`, {
                      phone: smsComposeTo,
                      message: smsComposeBody,
                    });
                    toast.success("SMS sent successfully");
                    setSmsCompose(null);
                    setSmsComposeTo("");
                    setSmsComposeBody("");
                  } catch (err) {
                    toast.error(err.response?.data?.error || "Failed to send SMS");
                  } finally {
                    setSmsComposeSending(false);
                  }
                }}
                className="px-5 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {smsComposeSending ? (
                  <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sending…</>
                ) : (
                  <><MessageSquare className="w-3.5 h-3.5" /> Send SMS</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10000] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <DeleteIcon className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Sales Return?</h3>
              <p className="text-sm text-gray-500 mb-6">
                If this return has been Confirmed, its stock IN will be reversed. This cannot be undone.
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
            Delete <strong>{selected.length}</strong> sales returns? Confirmed returns will
            reverse their stock movements.
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
          exportRecordsToCSV(records, "sales_returns");
        }}
      />

      {showForm && (
        <SalesReturnForm
          editingReturn={editingReturn}
          onRequestClose={closeForm}
          onSuccess={() => { toast.success(editingReturn ? "Sales return updated" : "Sales return created"); closeForm(); fetchRows(); }}
          onError={(msg) => toast.error(msg)}
        />
      )}

      <SalesReturnPreview
        salesReturn={previewReturn}
        isOpen={showPreview}
        onClose={closePreview}
        onEdit={() => { closePreview(); openEdit(previewReturn); }}
        onDelete={() => { closePreview(); handleDelete(previewReturn._id); }}
      />

      <RecordSalesReturnRefundModal
        isOpen={showRefundModal}
        salesReturn={refundReturn}
        onClose={() => { setShowRefundModal(false); setRefundReturn(null); }}
        onSuccess={() => fetchRows()}
      />

      <ImportSalesReturns
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onImportSuccess={() => fetchRows()}
      />

      <BulkActions
        isOpen={showBulkActions}
        onClose={() => setShowBulkActions(false)}
        selectedItems={rows.filter((r) => selected.includes(r._id))}
        onBulkUpdate={handleBulkUpdate}
        fieldConfig={srFieldConfig}
        module="salesReturns"
      />

      {/* Fixed edge-to-edge toolbar */}
      <div className="bg-white overflow-visible">
        <div
          className={`fixed right-0 h-16 px-4 sm:px-6 lg:px-8 border-b flex items-center top-[calc(54px+var(--dc-offline-offset,0px))] lg:top-[calc(64px+var(--dc-offline-offset,0px))] bg-white border-[#E1E4EA]`}
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
                  {selected.length} return{selected.length !== 1 ? "s" : ""} selected
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
                      <h1 className="m-0 leading-tight font-bold text-base sm:text-lg text-gray-900 truncate">Sales Returns</h1>
                      <VideoIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    </div>
                    <p className="m-0 leading-tight text-[10px] sm:text-xs text-gray-500 truncate">
                      Goods returned by customers against sales invoices
                    </p>
                  </>
                )}
              </div>

              {showLoadingSkeleton ? (
                <div className="relative flex-1 flex items-center justify-end gap-3">
                  <Skeleton width={40} height={40} shape="circle" />
                  <Skeleton width={40} height={40} shape="circle" />
                  <Skeleton width={40} height={40} shape="circle" />
                  <Skeleton width={140} height={40} shape="circle" />
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
                        placeholder="Search returns by SR#, invoice, customer, reason…"
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
                        {statusFilter && (
                          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-blue-600" />
                        )}
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
                            onClick={() => { setShowImport(true); setIsMoreMenuOpen(false); }}
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
                      title="New Sales Return"
                    >
                      <PlusIcon className="w-4 h-4" />
                      <span className="hidden lg:inline">New Sales Return</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Fixed edge-to-edge table area */}
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
                              icon={ClipboardList}
                              noun="Return"
                              isFiltered={!!(debouncedSearch || activeFilters?.length)}
                              onCreate={openCreate}
                              buttonLabel="Create your first return"
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

        {/* Column drag ghost */}
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

        {/* Fixed edge-to-edge pagination */}
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

export default SalesReturn;
