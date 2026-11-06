import { exportClientSide, confirmExport, fetchAllPages, formatINR, formatExportDate } from "../utils/clientExport";
import { FaWhatsapp } from "react-icons/fa";
import emailLogo from "../assets/email-logo.svg";
import ExportSubmenu from "../components/common/ExportSubmenu";
import DeleteIcon from "../components/common/DeleteIcon";
import EmptyState from "../components/common/EmptyState";
import Checkbox from "../components/common/Checkbox";
import PlusIcon from "../components/common/PlusIcon";
import MoreIcon from "../components/common/MoreIcon";
import DownloadIcon from "../components/common/DownloadIcon";
import React, { useEffect, useState, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import API from "../services/api";
import PurchaseForm from "../components/purchase/PurchaseForm";
import PurchasePreview from "../components/purchase/PurchasePreview";
import ImportPurchases from "../components/purchase/ImportPurchases";
import RecordPurchasePaymentModal from "../components/purchase/RecordPurchasePaymentModal";
import BulkActions from "../components/BulkActions";
import BulkDeleteModal from "../components/common/BulkDeleteModal";
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
  CheckSquare,
  X,
  EyeOff,
  Share2,
  Pin,
  PinOff,
  Mail,
  Copy,
  MessageSquare,
  Lock,
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Underline as UnderlineIcon,
  Strikethrough as StrikethroughIcon,
  ListOrdered,
  List as ListIcon,
  Link as LinkIcon,
  ArrowUp,
  ArrowDown,
  Repeat,
  IndianRupee
} from "lucide-react";
import toast from "react-hot-toast";
import TableSkeletonRows from "../components/common/TableSkeletonRows";
import Skeleton from "../components/common/Skeleton";
import { useTopLoadingSignal } from "../components/common/TopLoadingBar";
import VideoTutorialModal from "../components/VideoTutorialModal";
import { getVideoTutorial } from "../utils/videoTutorials";
import AppToaster from "../components/AppToaster";
import ExportModal from "../components/common/ExportModal";
import ColumnSettingsPanel from "../components/ColumnSettingsPanel";
import { useColumnSettings } from "../hooks/useColumnSettings";
import { getPinnedBoundaryOverlayStyle } from "../utils/pinnedColumnShadow";
import HighlightText from "../components/common/HighlightText";
import useSearchOverlayOpen from "../hooks/useSearchOverlayOpen";
import useBodyScrollLock from "../hooks/useBodyScrollLock";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper
} from "@tanstack/react-table";
import SearchIcon from "../components/common/SearchIcon";
import SettingsIcon from "../components/common/SettingsIcon";
import FilterIcon from "../components/common/FilterIcon";
import AdvancedFilterPanel from "../components/common/AdvancedFilterPanel";
import UploadIcon from "../components/common/UploadIcon";
import EyeIcon from "../components/common/EyeIcon";
import EditIcon from "../components/common/EditIcon";
import DateRangeFilterButton, { thisMonthRange } from "../components/common/DateRangeFilterButton";
import DocumentDetailModal from "../components/common/DocumentDetailModal";
import { toServerDueDateFilter } from "../utils/dueDateFilter";
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
const PurchasePage = () => {
  const isSearchOverlayOpen = useSearchOverlayOpen();
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState(null);
  const [showForm, setShowForm] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return !!params.get("convertPO");
  });
  const [initialConvertPOId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("convertPO") || null;
  });
  const [initialViewPurchaseId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("view") || null;
  });
  const [searchTerm, setSearchTerm] = useState("");
  const truncateText = (text, maxLength = 30) => {
    if (!text) return "\u2014";
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const searchInputRef = useRef(null);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [activeFilters, setActiveFilters] = useState([]);
  const activeFiltersKey = JSON.stringify(activeFilters);
  const [filterStatus, setFilterStatus] = useState("");
  const [dateRange, setDateRange] = useState(thisMonthRange);
  const dateFromMs = dateRange.from ? dateRange.from.getTime() : 0;
  const dateToMs = dateRange.to ? dateRange.to.getTime() : 0;
  const [filterOptions, setFilterOptions] = useState(null);
  const [detailPurchaseId, setDetailPurchaseId] = useState(null);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const tableScrollRef = useRef(null);
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target)) {
        setIsMoreMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  useEffect(() => {
    if (!isMoreMenuOpen) return;
    const handleScroll = () => setIsMoreMenuOpen(false);
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, [isMoreMenuOpen]);
  const hasLoadedOnceRef = useRef(false);
  const showLoadingSkeleton = loading && purchases.length === 0 && !hasLoadedOnceRef.current;
  useTopLoadingSignal(loading);
  const [selectedPurchases, setSelectedPurchases] = useState([]);
  const selectedPurchasesSet = useMemo(() => new Set(selectedPurchases), [selectedPurchases]);
  const [selectionMode, setSelectionMode] = useState(true);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [editingPage, setEditingPage] = useState(false);
  const [pageInput, setPageInput] = useState("");
  const [showBulkStrip, setShowBulkStrip] = useState(false);
  const [bulkStripClosing, setBulkStripClosing] = useState(false);
  useEffect(() => {
    const active = selectionMode && selectedPurchases.length > 0;
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
  }, [selectionMode, selectedPurchases.length]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [purchaseToDelete, setPurchaseToDelete] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [purchaseToPay, setPurchaseToPay] = useState(null);
  const [showVideoTutorial, setShowVideoTutorial] = useState(false);
  const [openRowActionsId, setOpenRowActionsId] = useState(null);
  const [activeRowMenuState, setActiveRowMenuState] = useState("main");
  const [rowActionsPos, setRowActionsPos] = useState(null);
  const rowActionsRef = useRef(null);
  const [shareMenu, setShareMenu] = useState(null);
  const [statusMenu, setStatusMenu] = useState(null);
  const [shareMenuChannel, setShareMenuChannel] = useState(null);
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
  const [openColumnMenuKey, setOpenColumnMenuKey] = useState(null);
  const [columnMenuPos, setColumnMenuPos] = useState(null);
  const columnMenuRef = useRef(null);
  const [pinnedColumns, setPinnedColumns] = useState([]);
  const pinColumnToSide = (colKey, side) => {
    setPinnedColumns((prev) => [...prev.filter((p) => p.key !== colKey), { key: colKey, side }]);
  };
  const unpinColumn = (colKey) => {
    setPinnedColumns((prev) => prev.filter((p) => p.key !== colKey));
  };
  const getColumnPinSide = (colKey) => pinnedColumns.find((p) => p.key === colKey)?.side || null;
  const [columnSizing, setColumnSizing] = useState({});
  const [draggedColKey, setDraggedColKey] = useState(null);
  const [dragOverColKey, setDragOverColKey] = useState(null);
  const [dragGhost, setDragGhost] = useState(null);
  const dragOverRef = useRef(null);
  const ghostElRef = useRef(null);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 0,
    totalCount: 0,
    limit: 50,
    hasNextPage: false,
    hasPrevPage: false
  });
  const [sortConfig, setSortConfig] = useState({
    key: null,
    direction: null
  });
  const statusOptions = ["Draft", "Pending", "Confirmed", "Partial", "Paid", "Cancelled"];
  const PAYMENT_DERIVED_STATUSES = ["Partial", "Paid"];
  const manualStatusOptions = statusOptions.filter(
    (s) => !PAYMENT_DERIVED_STATUSES.includes(s)
  );
  const statusMenuOptions = (status) => {
    if (status === "Partial") return ["Partial", "Cancelled"];
    if (status === "Confirmed") return ["Confirmed", "Cancelled"];
    return manualStatusOptions;
  };
  useEffect(() => {
    API.get("/purchases/filter-options").then((res) => setFilterOptions(res.data)).catch((err) => console.error("Failed to load purchase filter options", err));
  }, []);
  const purchaseFilterColumns = useMemo(() => {
    const o = filterOptions || {};
    return [
      {
        key: "purchaseNumber",
        label: "Purchase Number",
        type: "text",
        combo: true,
        operators: ["contains", "starts_with", "ends_with", "is", "is_not", "in", "not_in"],
        options: o.numbers || [],
        suggestionsByOperator: { starts_with: o.prefixes || [], ends_with: o.suffixes || [] }
      },
      {
        key: "vendor",
        label: "Vendor",
        type: "text",
        combo: true,
        operators: ["contains", "is", "is_not"],
        options: o.deals || []
      },
      { key: "date", label: "Purchase Date", type: "dateRange" },
      {
        key: "amount",
        label: "Grand Total",
        type: "range",
        min: o.amountMin ?? 0,
        max: o.amountMax ?? 0,
        step: Math.max(Math.round(((o.amountMax ?? 0) - (o.amountMin ?? 0)) / 200), 1)
      },
      { key: "status", label: "Status", type: "select", operators: ["is", "is_not"], options: statusOptions }
    ];
  }, [filterOptions]);
  const appendFilterParams = (params) => {
    if (filterStatus) params.append("status", filterStatus);
    if (dateRange.from) params.append("dateFrom", dateRange.from.toISOString());
    if (dateRange.to) params.append("dateTo", dateRange.to.toISOString());
    const rules = activeFilters.map(
      (f) => f.column === "date" ? { ...toServerDueDateFilter(f.value), column: "date" } : { column: f.column, operator: f.operator, value: f.value }
    ).filter((f) => f && (f.column !== "date" || f.from || f.to));
    if (rules.length > 0) params.append("advancedFilters", JSON.stringify(rules));
  };
  const exportColumns = [
    { key: "purchaseNumber", label: "Purchase Number" },
    { key: "vendor", label: "Vendor" },
    { key: "purchaseDate", label: "Purchase Date" },
    { key: "items", label: "Items" },
    { key: "subtotal", label: "Subtotal" },
    { key: "totalTax", label: "Total Tax" },
    { key: "grandTotal", label: "Grand Total" },
    { key: "status", label: "Status" },
    { key: "notes", label: "Notes" }
  ];
  const handleSelectPurchase = (purchaseId) => {
    setSelectedPurchases(
      (prev) => prev.includes(purchaseId) ? prev.filter((id) => id !== purchaseId) : [...prev, purchaseId]
    );
  };
  const handleSelectAll = () => {
    if (selectedPurchases.length === purchases.length && purchases.length > 0) {
      setSelectedPurchases([]);
    } else {
      setSelectedPurchases(purchases.map((p) => p._id));
    }
  };
  const exitSelectionMode = () => {
    setSelectionMode(true);
    setSelectedPurchases([]);
    setShowBulkActions(false);
  };
  const handleSelectAllAcrossPages = async () => {
    try {
      const params = new URLSearchParams({ allIds: "true" });
      if (debouncedSearchTerm) params.append("search", debouncedSearchTerm);
      appendFilterParams(params);
      const res = await API.get(`/purchases/pagination?${params.toString()}`);
      setSelectedPurchases(res.data.ids || []);
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to select all rows");
    }
  };
  const handleDeselectAllExtra = () => {
    setSelectedPurchases(purchases.map((p) => p._id));
  };
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);
  const skipInitialReset = useRef(true);
  useEffect(() => {
    if (skipInitialReset.current) {
      skipInitialReset.current = false;
      return;
    }
    exitSelectionMode();
    setPagination((prev) => ({ ...prev, currentPage: 1 }));
  }, [debouncedSearchTerm, filterStatus, dateFromMs, dateToMs, activeFiltersKey]);
  useEffect(() => {
    fetchPurchases();
  }, [
    pagination.currentPage,
    pagination.limit,
    sortConfig,
    debouncedSearchTerm,
    filterStatus,
    dateFromMs,
    dateToMs,
    activeFiltersKey
  ]);
  useEffect(() => {
    fetchShareSettings();
  }, []);
  const fetchShareSettings = async () => {
    try {
      const [settingsRes, brandingRes] = await Promise.all([
        API.get("/document-settings"),
        API.get("/branding").catch(() => null)
      ]);
      setWaTemplatesList(Array.isArray(settingsRes.data?.whatsappTemplates) ? settingsRes.data.whatsappTemplates : []);
      setSmsTemplatesList(Array.isArray(settingsRes.data?.smsTemplates) ? settingsRes.data.smsTemplates : []);
      setEmailTemplatesList(Array.isArray(settingsRes.data?.emailTemplates) ? settingsRes.data.emailTemplates : []);
      if (brandingRes?.data?.companyName) setShareCompanyName(brandingRes.data.companyName);
    } catch (err) {
      console.error("Failed to load share settings in PurchasePage", err);
    }
  };
  useEffect(() => {
    if (!initialViewPurchaseId) return;
    API.get(`/purchases/${initialViewPurchaseId}`).then((res) => {
      setSelectedPurchase(res.data);
      setShowPreview(true);
    }).catch((err) => {
      toast.error(err.response?.data?.error || "Failed to load purchase");
    });
  }, [initialViewPurchaseId]);
  const fetchRequestIdRef = useRef(0);
  const fetchPurchases = async () => {
    const requestId = ++fetchRequestIdRef.current;
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pagination.currentPage,
        limit: pagination.limit
      });
      if (sortConfig.key) {
        params.append("sortBy", sortConfig.key);
        params.append("sortOrder", sortConfig.direction || "asc");
      } else {
        params.append("sortBy", "createdAt");
        params.append("sortOrder", "desc");
      }
      if (debouncedSearchTerm) params.append("search", debouncedSearchTerm);
      appendFilterParams(params);
      const res = await API.get(`/purchases/pagination?${params.toString()}`);
      if (requestId !== fetchRequestIdRef.current) return;
      setPurchases(res.data.purchases || []);
      setPagination((prev) => ({
        ...prev,
        ...res.data.pagination
      }));
      hasLoadedOnceRef.current = true;
    } catch (err) {
      if (requestId !== fetchRequestIdRef.current) return;
      toast.error(err.response?.data?.error || "Failed to load purchases");
      setPurchases([]);
    } finally {
      if (requestId === fetchRequestIdRef.current) {
        setLoading(false);
      }
    }
  };
  const handleSuccess = () => {
    toast.success("Purchase saved successfully");
    fetchPurchases();
    exitSelectionMode();
  };
  const handleEdit = (purchase) => {
    if (purchase?.status === "Paid" || purchase?.status === "Partial") {
      toast.error("This purchase has payments recorded and can no longer be edited.");
      return;
    }
    setEditingPurchase(purchase);
    setShowForm(true);
  };
  const handleRecordPayment = (purchase) => {
    const s = purchase.status;
    if (s !== "Confirmed" && s !== "Partial" && s !== "Paid") {
      toast.error("This purchase isn't confirmed yet \u2014 confirm it before recording a payment.");
      return;
    }
    setPurchaseToPay(purchase);
    setShowPaymentModal(true);
  };
  const handleView = (purchase) => {
    setSelectedPurchase(purchase);
    setShowPreview(true);
  };
  const textToEmailHtml = (text) => (text || "").replace(/\n/g, "<br>");
  const handleDownload = async (purchase) => {
    const filename = `Purchase-${purchase.purchaseNumber || purchase._id}`;
    try {
      const response = await API.get(`/purchases/download/${purchase._id}`, {
        responseType: "blob"
      });
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${filename}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Purchase downloaded successfully");
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to download purchase");
    }
  };
  const handleDelete = (id) => {
    setPurchaseToDelete(id);
    setShowDeleteModal(true);
  };
  const EXPORT_COLUMNS = [
    { label: "Purchase Number", value: (p) => p.purchaseNumber },
    { label: "Vendor", value: (p) => p.vendor?.name },
    { label: "Purchase Date", value: (p) => formatExportDate(p.createdAt) },
    { label: "Grand Total", value: (p) => formatINR(p.grandTotal) },
    { label: "Status", value: (p) => p.status }
  ];
  const handleExportAll = async (format) => {
    if (!await confirmExport(format)) return;
    const loadingToast = toast.loading("Preparing export...");
    try {
      const params = new URLSearchParams();
      if (sortConfig.key) {
        params.append("sortBy", sortConfig.key);
        params.append("sortOrder", sortConfig.direction || "asc");
      } else {
        params.append("sortBy", "createdAt");
        params.append("sortOrder", "desc");
      }
      if (debouncedSearchTerm) params.append("search", debouncedSearchTerm);
      appendFilterParams(params);
      const rows = await fetchAllPages("/purchases/pagination", params, "purchases");
      toast.dismiss(loadingToast);
      await exportClientSide(format, {
        rows,
        columns: EXPORT_COLUMNS,
        fileNamePrefix: "purchases_export",
        title: "Purchases Report"
      });
    } catch (err) {
      toast.dismiss(loadingToast);
      toast.error(err.response?.data?.error || "Failed to export");
    }
  };
  const confirmDelete = async () => {
    if (!purchaseToDelete) return;
    const toastId = toast.loading("Deleting...");
    try {
      await API.delete(`/purchases/${purchaseToDelete}`);
      toast.success("Purchase deleted", { id: toastId });
      fetchPurchases();
      exitSelectionMode();
    } catch (err) {
      toast.error(err.response?.data?.error || "Delete failed", {
        id: toastId
      });
    } finally {
      setShowDeleteModal(false);
      setPurchaseToDelete(null);
    }
  };
  const handleBulkDelete = async (itemIds) => {
    setBulkLoading(true);
    try {
      await Promise.all(itemIds.map((id) => API.delete(`/purchases/${id}`)));
      toast.success(`Deleted ${itemIds.length} purchases`);
      fetchPurchases();
      exitSelectionMode();
    } catch (err) {
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || "Bulk delete failed");
      }
    } finally {
      setBulkLoading(false);
    }
  };
  const handleBulkUpdate = async ({ field, value, itemIds }) => {
    setBulkLoading(true);
    try {
      await Promise.all(
        itemIds.map((id) => API.put(`/purchases/${id}`, { [field]: value }))
      );
      toast.success(`Updated ${itemIds.length} purchases`);
      fetchPurchases();
      exitSelectionMode();
    } catch (err) {
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || "Bulk update failed");
      }
    } finally {
      setBulkLoading(false);
    }
  };
  const purchaseFieldConfig = {
    fields: [
      {
        key: "status",
        label: "Status",
        type: "select",
        options: statusOptions
      }
    ]
  };
  const updateSingleStatus = async (id, newStatus) => {
    try {
      await API.put(`/purchases/${id}/status`, { status: newStatus });
      setPurchases((prev) => prev.map((p) => p._id === id ? { ...p, status: newStatus } : p));
      toast.success("Status updated successfully!");
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to update status");
    }
    setOpenRowActionsId(null);
  };
  const getStatusBadgeColor = (status) => {
    switch (status?.toLowerCase()) {
      case "paid":
        return "bg-green-100 text-green-800 border-transparent";
      case "partial":
        return "bg-orange-100 text-orange-800 border-transparent";
      case "confirmed":
        return "bg-indigo-100 text-indigo-800 border-transparent";
      case "pending":
        return "bg-yellow-100 text-yellow-800 border-transparent";
      case "cancelled":
        return "bg-red-100 text-red-800 border-transparent";
      case "draft":
        return "bg-blue-100 text-blue-800 border-transparent";
      default:
        return "bg-gray-100 text-gray-800 border-transparent";
    }
  };
  const getStatusLabel = (status) => status === "Partial" ? "Partially Paid" : status;
  const amountDueOf = (p) => {
    const paid = (p.payments || []).reduce((s, pay) => s + (Number(pay.amount) || 0), 0);
    return (p.grandTotal ?? 0) - paid;
  };
  const handlePageChange = (page) => {
    if (page >= 1 && page <= pagination.totalPages && page !== pagination.currentPage) {
      setPagination((prev) => ({ ...prev, currentPage: page }));
    }
  };
  const handleLimitChange = (limit) => {
    setPagination((prev) => ({ ...prev, limit, currentPage: 1 }));
  };
  const defaultColumns = useMemo(
    () => [
      {
        key: "purchaseNumber",
        label: "Purchase Number",
        visible: true,
        order: 0,
        required: true,
        sortable: true,
        sortKey: "purchaseNumber"
      },
      {
        key: "vendor",
        label: "Vendor",
        visible: true,
        order: 1,
        sortable: true,
        sortKey: "vendor.name"
      },
      {
        key: "grandTotal",
        label: "Amount",
        visible: true,
        order: 2,
        sortable: true,
        sortKey: "totalAmount"
      },
      {
        key: "status",
        label: "Status",
        visible: true,
        order: 3,
        sortable: true,
        sortKey: "status"
      },
      {
        key: "createdAt",
        label: "Date",
        visible: true,
        order: 4,
        sortable: true,
        sortKey: "createdAt"
      }
    ],
    []
  );
  const { columns, saveColumns, getVisibleColumns } = useColumnSettings(
    "purchases",
    defaultColumns
  );
  const visibleColumns = useMemo(() => getVisibleColumns(), [columns]);
  const getFieldValue = (p, key) => {
    if (key === "purchaseNumber") return p.purchaseNumber || "";
    if (key === "vendor") return p.vendor?.name || "";
    if (key === "grandTotal")
      return `\u20B9${(p.grandTotal ?? 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}`;
    if (key === "status") return p.status || "";
    if (key === "createdAt")
      return p.createdAt ? new Date(p.createdAt).toLocaleDateString("en-IN") : "";
    return "";
  };
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
      const previewRows = purchases.map((p) => getFieldValue(p, colId) || "\u2014");
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
        height: rect.height / dragState.zGhost
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
        handleColumnReorder(colId, overKey);
      }
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
    const newColumns = sorted.map((c) => c.visible ? reorderedVisible[visibleCursor++] : c).map((c, idx) => ({ ...c, order: idx }));
    saveColumns(newColumns);
  };
  const columnHelper = createColumnHelper();
  const renderRowActionsMenu = (p) => {
    const isOpen = openRowActionsId === p._id;
    const closeRowMenu = () => {
      setOpenRowActionsId(null);
      setRowActionsPos(null);
      setActiveRowMenuState("main");
      forceCloseShareFlyout();
      setStatusMenu(null);
    };
    return /* @__PURE__ */ React.createElement("div", { className: "relative flex items-center justify-center flex-shrink-0", ref: isOpen ? rowActionsRef : null, onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement(
      "button",
      {
        title: "More actions",
        onClick: (e) => {
          e.stopPropagation();
          if (isOpen) {
            closeRowMenu();
            return;
          }
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
          forceCloseShareFlyout();
          setStatusMenu(null);
          setRowActionsPos({ top: calcTop, left: calcLeft });
          setOpenRowActionsId(p._id);
          setActiveRowMenuState("main");
        },
        className: "p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
      },
      /* @__PURE__ */ React.createElement(MoreIcon, { className: "w-4 h-4" })
    ), isOpen && rowActionsPos && createPortal(
      /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 z-[100050]", onClick: closeRowMenu }), /* @__PURE__ */ React.createElement(
        "div",
        {
          key: p._id,
          style: { position: "fixed", top: rowActionsPos.top, left: rowActionsPos.left },
          className: "w-[160px] z-[100051] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5 max-h-[70vh] overflow-y-auto"
        },
        /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
          "button",
          {
            onClick: () => {
              closeRowMenu();
              handleView(p);
            },
            className: "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
          },
          /* @__PURE__ */ React.createElement(EyeIcon, { className: "w-3.5 h-3.5 text-blue-600" }),
          "View"
        ), p.status !== "Paid" && /* @__PURE__ */ React.createElement(
          "button",
          {
            onClick: () => {
              closeRowMenu();
              handleEdit(p);
            },
            className: "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
          },
          /* @__PURE__ */ React.createElement(EditIcon, { className: "w-3.5 h-3.5 text-blue-600" }),
          "Edit"
        ), /* @__PURE__ */ React.createElement(
          "button",
          {
            onClick: () => {
              closeRowMenu();
              handleDownload(p);
            },
            className: "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
          },
          /* @__PURE__ */ React.createElement(DownloadIcon, { className: "w-3.5 h-3.5 text-green-600" }),
          "Download"
        ), /* @__PURE__ */ React.createElement(
          "button",
          {
            onClick: (e) => {
              e.stopPropagation();
              if (shareMenu?.doc?._id === p._id) {
                forceCloseShareFlyout();
                return;
              }
              setStatusMenu(null);
              const zMenu = getAncestorZoom(document.body);
              const DROPDOWN_W = 160;
              const GAP = 0;
              const rect = e.currentTarget.getBoundingClientRect();
              setShareMenu({
                doc: p,
                x: Math.max(4, rect.left / zMenu - DROPDOWN_W - GAP),
                y: rect.top / zMenu
              });
              setShareMenuChannel(null);
            },
            className: "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
          },
          /* @__PURE__ */ React.createElement("span", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement(Share2, { className: "w-3.5 h-3.5 text-blue-600" }), "Share"),
          /* @__PURE__ */ React.createElement(ChevronRight, { className: "w-3.5 h-3.5 text-gray-400" })
        ), p.status !== "Paid" && /* @__PURE__ */ React.createElement(
          "button",
          {
            onClick: (e) => {
              e.stopPropagation();
              if (statusMenu?.doc?._id === p._id) {
                setStatusMenu(null);
                return;
              }
              forceCloseShareFlyout();
              const zMenu = getAncestorZoom(document.body);
              const DROPDOWN_W = 160;
              const GAP = 0;
              const rect = e.currentTarget.getBoundingClientRect();
              setStatusMenu({
                doc: p,
                x: Math.max(4, rect.left / zMenu - DROPDOWN_W - GAP),
                y: rect.top / zMenu
              });
            },
            className: "w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
          },
          /* @__PURE__ */ React.createElement("span", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement(Repeat, { className: "w-3.5 h-3.5 text-orange-600" }), "Change Status"),
          /* @__PURE__ */ React.createElement(ChevronRight, { className: "w-3.5 h-3.5 text-gray-400" })
        ), p.status !== "Cancelled" && p.status !== "Paid" && /* @__PURE__ */ React.createElement(
          "button",
          {
            onClick: () => {
              closeRowMenu();
              handleRecordPayment(p);
            },
            className: "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
          },
          /* @__PURE__ */ React.createElement(IndianRupee, { className: "w-3.5 h-3.5 text-emerald-600" }),
          "Record Payment"
        ), /* @__PURE__ */ React.createElement("div", { className: "w-full border-t border-[#F1F1F5] my-0.5" }), /* @__PURE__ */ React.createElement(
          "button",
          {
            onClick: () => {
              closeRowMenu();
              handleDelete(p._id);
            },
            className: "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-red-600 hover:bg-red-50 whitespace-nowrap"
          },
          /* @__PURE__ */ React.createElement(DeleteIcon, { className: "w-3.5 h-3.5" }),
          "Delete"
        ))
      )),
      document.body
    ));
  };
  const tableColumns = useMemo(() => {
    const cols = [];
    cols.push(
      columnHelper.display({
        id: "selection",
        size: 60,
        enableResizing: false,
        header: () => /* @__PURE__ */ React.createElement("div", { className: "flex justify-center items-center w-full" }, /* @__PURE__ */ React.createElement(Checkbox, { checked: selectedPurchases.length === purchases.length && purchases.length > 0, onChange: handleSelectAll, uncheckedColor: "text-[#525866]" })),
        cell: ({ row }) => /* @__PURE__ */ React.createElement("div", { className: "flex justify-center items-center gap-1 w-full" }, /* @__PURE__ */ React.createElement(Checkbox, { checked: selectedPurchasesSet.has(row.original._id), onChange: () => handleSelectPurchase(row.original._id) }))
      })
    );
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
        columnHelper.accessor((row) => getFieldValue(row, vc.key), {
          id: vc.key,
          size: vc.key === "purchaseNumber" ? 220 : vc.key === "vendor" ? 220 : 150,
          header: () => {
            const isSortable = vc.sortable !== false;
            const pinSide = getColumnPinSide(vc.key);
            const isMenuOpen = openColumnMenuKey === vc.key;
            return /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between w-full group" }, /* @__PURE__ */ React.createElement("span", { className: "truncate flex-1 min-w-0 flex items-center gap-1.5", title: vc.label }, /* @__PURE__ */ React.createElement("span", { className: "truncate" }, vc.label), sortConfig.key === (vc.sortKey || vc.key) && (sortConfig.direction === "asc" ? /* @__PURE__ */ React.createElement(ArrowUp, { className: "w-3 h-3 text-[#0085FF] flex-shrink-0" }) : /* @__PURE__ */ React.createElement(ArrowDown, { className: "w-3 h-3 text-[#0085FF] flex-shrink-0" })), pinSide && /* @__PURE__ */ React.createElement(
              Pin,
              {
                size: 12,
                className: "text-blue-500 fill-blue-500 flex-shrink-0",
                style: { transform: "rotate(45deg)" }
              }
            )), /* @__PURE__ */ React.createElement(
              "button",
              {
                onClick: (e) => {
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
                },
                className: "p-1 rounded hover:bg-gray-200 transition-colors text-gray-500 flex-shrink-0",
                title: "Column options"
              },
              /* @__PURE__ */ React.createElement(ChevronDown, { className: "w-3.5 h-3.5" })
            ), isMenuOpen && columnMenuPos && createPortal(
              /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 z-[9998]", onClick: () => {
                setOpenColumnMenuKey(null);
                setColumnMenuPos(null);
              } }), /* @__PURE__ */ React.createElement(
                "div",
                {
                  ref: columnMenuRef,
                  style: { position: "fixed", top: columnMenuPos.top, left: columnMenuPos.left },
                  className: "w-[160px] z-[9999] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5 animate-in fade-in zoom-in duration-150 origin-top-right"
                },
                /* @__PURE__ */ React.createElement(
                  "button",
                  {
                    onClick: () => {
                      setOpenColumnMenuKey(null);
                      setColumnMenuPos(null);
                      pinSide === "left" ? unpinColumn(vc.key) : pinColumnToSide(vc.key, "left");
                    },
                    className: `w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${pinSide === "left" ? "bg-blue-50 text-blue-700" : "text-[#161618] hover:bg-gray-50"}`
                  },
                  pinSide === "left" ? /* @__PURE__ */ React.createElement(PinOff, { className: "w-3.5 h-3.5" }) : /* @__PURE__ */ React.createElement(Pin, { className: "w-3.5 h-3.5 text-[#1C1B1F]" }),
                  "Pin to Left"
                ),
                /* @__PURE__ */ React.createElement(
                  "button",
                  {
                    onClick: () => {
                      setOpenColumnMenuKey(null);
                      setColumnMenuPos(null);
                      pinSide === "right" ? unpinColumn(vc.key) : pinColumnToSide(vc.key, "right");
                    },
                    className: `w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${pinSide === "right" ? "bg-blue-50 text-blue-700" : "text-[#161618] hover:bg-gray-50"}`
                  },
                  pinSide === "right" ? /* @__PURE__ */ React.createElement(PinOff, { className: "w-3.5 h-3.5" }) : /* @__PURE__ */ React.createElement(Pin, { className: "w-3.5 h-3.5 text-[#1C1B1F]" }),
                  "Pin to Right"
                ),
                isSortable && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
                  "button",
                  {
                    onClick: () => {
                      setOpenColumnMenuKey(null);
                      setColumnMenuPos(null);
                      const key = vc.sortKey || vc.key;
                      const isActive = sortConfig.key === key && sortConfig.direction === "asc";
                      setSortConfig(isActive ? { key: null, direction: null } : { key, direction: "asc" });
                      setPagination((prev) => ({ ...prev, currentPage: 1 }));
                    },
                    className: `w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${sortConfig.key === (vc.sortKey || vc.key) && sortConfig.direction === "asc" ? "bg-blue-50 text-blue-700 font-medium" : "text-[#161618] hover:bg-gray-50"}`
                  },
                  /* @__PURE__ */ React.createElement(ChevronUp, { className: "w-3.5 h-3.5 text-[#1C1B1F]" }),
                  "Sort Ascending"
                ), /* @__PURE__ */ React.createElement(
                  "button",
                  {
                    onClick: () => {
                      setOpenColumnMenuKey(null);
                      setColumnMenuPos(null);
                      const key = vc.sortKey || vc.key;
                      const isActive = sortConfig.key === key && sortConfig.direction === "desc";
                      setSortConfig(isActive ? { key: null, direction: null } : { key, direction: "desc" });
                      setPagination((prev) => ({ ...prev, currentPage: 1 }));
                    },
                    className: `w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${sortConfig.key === (vc.sortKey || vc.key) && sortConfig.direction === "desc" ? "bg-blue-50 text-blue-700 font-medium" : "text-[#161618] hover:bg-gray-50"}`
                  },
                  /* @__PURE__ */ React.createElement(ChevronDown, { className: "w-3.5 h-3.5 text-[#1C1B1F]" }),
                  "Sort Descending"
                )),
                /* @__PURE__ */ React.createElement("div", { className: "w-full border-t border-[#F1F1F5] my-0.5" }),
                /* @__PURE__ */ React.createElement(
                  "button",
                  {
                    disabled: vc.required,
                    onClick: () => {
                      if (vc.required) return;
                      setOpenColumnMenuKey(null);
                      setColumnMenuPos(null);
                      saveColumns(
                        columns.map((c) => c.key === vc.key ? { ...c, visible: false } : c)
                      );
                    },
                    className: `w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${vc.required ? "text-gray-300 cursor-not-allowed" : "text-[#161618] hover:bg-gray-50"}`
                  },
                  /* @__PURE__ */ React.createElement(EyeOff, { className: `w-3.5 h-3.5 ${vc.required ? "text-gray-300" : "text-[#1C1B1F]"}` }),
                  "Hide Column"
                )
              )),
              document.body
            ));
          },
          cell: ({ row }) => {
            const p = row.original;
            let baseContent;
            if (vc.key === "purchaseNumber") {
              baseContent = /* @__PURE__ */ React.createElement("div", { className: "flex items-center min-w-0 flex-1 pr-4" }, /* @__PURE__ */ React.createElement(
                "button",
                {
                  onClick: (e) => {
                    e.stopPropagation();
                    handleView(p);
                  },
                  className: "text-[#0085FF] font-semibold hover:underline truncate transition-all duration-150 ease-out group-hover:text-[#004CFF] min-w-0 text-left",
                  title: p.purchaseNumber
                },
                /* @__PURE__ */ React.createElement(HighlightText, { text: p.purchaseNumber || "N/A", query: searchTerm })
              ));
            } else if (vc.key === "vendor") {
              baseContent = /* @__PURE__ */ React.createElement("div", { className: "truncate text-sm font-semibold text-gray-900", title: p.vendor?.name }, p.vendor?.name ? /* @__PURE__ */ React.createElement(HighlightText, { text: p.vendor.name, query: searchTerm }) : "\u2014");
            } else if (vc.key === "grandTotal") {
              const due = amountDueOf(p);
              const showDue = p.status === "Partial" && due > 0.01;
              baseContent = /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "text-sm font-semibold text-gray-900" }, "\u20B9", (p.grandTotal ?? 0).toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })), showDue && /* @__PURE__ */ React.createElement("div", { className: "text-[11px] font-medium text-orange-600 mt-0.5" }, "\u20B9", due.toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              }), " ", "due"));
            } else if (vc.key === "status") {
              baseContent = /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-start" }, /* @__PURE__ */ React.createElement(
                "span",
                {
                  className: `inline-block px-3 py-1 rounded-full text-xs font-semibold border ${getStatusBadgeColor(p.status)}`
                },
                getStatusLabel(p.status)
              ));
            } else if (vc.key === "createdAt") {
              baseContent = /* @__PURE__ */ React.createElement("div", { className: "truncate text-sm text-gray-600" }, p.createdAt ? new Date(p.createdAt).toLocaleDateString("en-IN") : "\u2014");
            } else if (baseContent === void 0) {
              const val = p[vc.key];
              const truncated = truncateText(String(val ?? ""), 30);
              baseContent = /* @__PURE__ */ React.createElement("div", { className: "truncate text-sm text-gray-700 w-full", title: String(val ?? "") }, truncated && truncated !== "\u2014" ? /* @__PURE__ */ React.createElement(HighlightText, { text: truncated, query: searchTerm }) : "\u2014");
            }
            const withHoverActions = baseContent;
            if (vc.key === lastColumnKey) {
              return /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between w-full gap-2" }, /* @__PURE__ */ React.createElement("div", { className: "min-w-0 flex-1" }, withHoverActions), renderRowActionsMenu(p));
            }
            return withHoverActions;
          }
        })
      );
    });
    return cols;
  }, [
    visibleColumns,
    selectedPurchases,
    selectedPurchasesSet,
    purchases,
    sortConfig,
    pinnedColumns,
    openRowActionsId,
    activeRowMenuState,
    openColumnMenuKey,
    columnMenuPos,
    searchTerm
  ]);
  const filteredPurchases = purchases;
  const table = useReactTable({
    data: filteredPurchases,
    columns: tableColumns,
    state: { columnSizing },
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: "onChange",
    enableColumnResizing: true
  });
  const PaginationControls = () => {
    const {
      currentPage,
      totalPages,
      totalCount,
      limit,
      hasNextPage,
      hasPrevPage
    } = pagination;
    if (totalCount === 0) return null;
    const startItem = (currentPage - 1) * limit + 1;
    const endItem = Math.min(currentPage * limit, totalCount);
    return /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between w-full px-4 sm:px-6 lg:px-8" }, /* @__PURE__ */ React.createElement("div", { className: "flex-1 flex justify-between sm:hidden" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => handlePageChange(currentPage - 1),
        disabled: !hasPrevPage,
        className: "relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
      },
      "Previous"
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => handlePageChange(currentPage + 1),
        disabled: !hasNextPage,
        className: "ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
      },
      "Next"
    )), /* @__PURE__ */ React.createElement("div", { className: "hidden sm:flex-1 sm:flex sm:items-center sm:justify-between" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-2" }, /* @__PURE__ */ React.createElement("p", { className: "text-sm text-gray-700 font-inter" }, "Showing ", /* @__PURE__ */ React.createElement("span", { className: "font-semibold" }, startItem), " to", " ", /* @__PURE__ */ React.createElement("span", { className: "font-semibold" }, endItem), " of", " ", /* @__PURE__ */ React.createElement("span", { className: "font-semibold" }, totalCount), " results"), /* @__PURE__ */ React.createElement("div", { className: "relative ml-2" }, /* @__PURE__ */ React.createElement(
      "select",
      {
        value: limit,
        onChange: (e) => handleLimitChange(parseInt(e.target.value)),
        className: "select-chevron appearance-none border border-gray-300 rounded-full pl-3 pr-8 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer font-inter"
      },
      /* @__PURE__ */ React.createElement("option", { value: 10 }, "10 per page"),
      /* @__PURE__ */ React.createElement("option", { value: 20 }, "20 per page"),
      /* @__PURE__ */ React.createElement("option", { value: 50 }, "50 per page"),
      /* @__PURE__ */ React.createElement("option", { value: 100 }, "100 per page"),
      /* @__PURE__ */ React.createElement("option", { value: 150 }, "150 per page")
    ))), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => handlePageChange(currentPage - 1),
        disabled: !hasPrevPage,
        className: "flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      },
      /* @__PURE__ */ React.createElement(ChevronLeft, { className: "h-4 w-4" })
    ), (() => {
      const commitPage = () => {
        const n = parseInt(pageInput, 10);
        if (!Number.isNaN(n)) handlePageChange(Math.min(Math.max(n, 1), totalPages));
        setEditingPage(false);
      };
      const items = [1];
      if (currentPage > 2) items.push("left-dots");
      if (currentPage !== 1 && currentPage !== totalPages) items.push(currentPage);
      if (currentPage < totalPages - 1) items.push("right-dots");
      if (totalPages > 1) items.push(totalPages);
      return items.map((item, index) => {
        if (item === "left-dots" || item === "right-dots") {
          return /* @__PURE__ */ React.createElement(
            "span",
            {
              key: `${item}-${index}`,
              className: "flex items-center justify-center w-8 h-8 text-sm font-medium text-gray-400 select-none"
            },
            "...."
          );
        }
        const isCurrent = item === currentPage;
        if (isCurrent && editingPage) {
          return /* @__PURE__ */ React.createElement(
            "input",
            {
              key: "page-edit",
              autoFocus: true,
              type: "number",
              min: 1,
              max: totalPages,
              value: pageInput,
              onChange: (e) => setPageInput(e.target.value),
              onBlur: commitPage,
              onKeyDown: (e) => {
                if (e.key === "Enter") commitPage();
                if (e.key === "Escape") setEditingPage(false);
              },
              className: "w-10 h-8 rounded-full border border-blue-500 text-center text-sm font-medium text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            }
          );
        }
        return /* @__PURE__ */ React.createElement(
          "button",
          {
            key: `page-${item}`,
            onClick: () => handlePageChange(item),
            onDoubleClick: () => {
              if (isCurrent) {
                setPageInput(String(currentPage));
                setEditingPage(true);
              }
            },
            title: isCurrent ? "Double-click to type a page number" : void 0,
            className: `flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors ${isCurrent ? "bg-[#0085FF] text-white" : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"}`
          },
          item
        );
      });
    })(), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => handlePageChange(currentPage + 1),
        disabled: !hasNextPage,
        className: "flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      },
      /* @__PURE__ */ React.createElement(ChevronRight, { className: "h-4 w-4" })
    ))));
  };
  return /* @__PURE__ */ React.createElement("div", { className: "-mt-6 -mx-4 sm:-mx-6 lg:-mx-8 pt-4" }, /* @__PURE__ */ React.createElement(AppToaster, null), /* @__PURE__ */ React.createElement(
    VideoTutorialModal,
    {
      isOpen: showVideoTutorial,
      onClose: () => setShowVideoTutorial(false),
      videoId: getVideoTutorial("purchases")?.videoId,
      title: getVideoTutorial("purchases")?.title
    }
  ), /* @__PURE__ */ React.createElement(
    ColumnSettingsPanel,
    {
      isOpen: showColumnSettings,
      onClose: () => setShowColumnSettings(false),
      columns,
      onSave: saveColumns,
      moduleName: "Purchases"
    }
  ), /* @__PURE__ */ React.createElement(
    ImportPurchases,
    {
      isOpen: showImport,
      onClose: () => setShowImport(false),
      onImportSuccess: () => {
        fetchPurchases();
        toast.success("Purchases imported successfully");
      }
    }
  ), showForm && /* @__PURE__ */ React.createElement(
    PurchaseForm,
    {
      editingPurchase,
      initialPurchaseOrderId: !editingPurchase ? initialConvertPOId : null,
      onRequestClose: () => {
        setShowForm(false);
        setEditingPurchase(null);
      },
      onSuccess: handleSuccess,
      onError: (msg) => toast.error(msg)
    }
  ), showPreview && /* @__PURE__ */ React.createElement(
    PurchasePreview,
    {
      purchase: selectedPurchase,
      isOpen: showPreview,
      onClose: () => setShowPreview(false),
      onEdit: () => {
        setShowPreview(false);
        handleEdit(selectedPurchase);
      },
      onDelete: () => {
        setShowPreview(false);
        handleDelete(selectedPurchase._id);
      },
      onRecordPayment: () => {
        setShowPreview(false);
        handleRecordPayment(selectedPurchase);
      }
    }
  ), showPaymentModal && /* @__PURE__ */ React.createElement(
    RecordPurchasePaymentModal,
    {
      isOpen: showPaymentModal,
      purchase: purchaseToPay,
      onClose: () => {
        setShowPaymentModal(false);
        setPurchaseToPay(null);
      },
      onSuccess: () => {
        fetchPurchases();
      }
    }
  ), showDeleteModal && /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10000] p-4" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden" }, /* @__PURE__ */ React.createElement("div", { className: "p-6 text-center" }, /* @__PURE__ */ React.createElement("div", { className: "w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4" }, /* @__PURE__ */ React.createElement(DeleteIcon, { className: "w-6 h-6 text-red-600" })), /* @__PURE__ */ React.createElement("h3", { className: "text-lg font-bold text-gray-900 mb-2 font-sf" }, "Delete Purchase"), /* @__PURE__ */ React.createElement("p", { className: "text-sm text-gray-500 font-inter mb-6" }, "Are you sure you want to delete this purchase? This action cannot be undone."), /* @__PURE__ */ React.createElement("div", { className: "flex gap-3 justify-center" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        setShowDeleteModal(false);
        setPurchaseToDelete(null);
      },
      className: "px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
    },
    "Cancel"
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: confirmDelete,
      className: "px-5 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors shadow-sm"
    },
    "Delete"
  ))))), /* @__PURE__ */ React.createElement("div", { className: "bg-white overflow-visible" }, /* @__PURE__ */ React.createElement(
    "div",
    {
      className: `fixed right-0 h-16 px-4 sm:px-6 lg:px-8 border-b flex items-center top-[calc(54px+var(--dc-offline-offset,0px))] lg:top-[calc(64px+var(--dc-offline-offset,0px))] bg-white border-[#E1E4EA]`,
      style: {
        left: "var(--sidebar-width, 0px)",
        zIndex: 40,
        minHeight: "64px",
        maxHeight: "64px",
        boxSizing: "border-box"
      }
    },
    showBulkStrip ? /* @__PURE__ */ React.createElement("div", { className: `${bulkStripClosing ? "animate-slideOutRight" : "animate-slideInLeft"} flex flex-nowrap items-center justify-between gap-4 w-full h-full overflow-x-auto` }, /* @__PURE__ */ React.createElement("div", { className: "flex flex-nowrap items-center flex-shrink-0" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => setShowExportModal(true),
        className: "h-10 px-4 bg-white border border-gray-300 text-gray-900 text-sm font-medium rounded-l-[25px] hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
      },
      /* @__PURE__ */ React.createElement(DownloadIcon, { className: "w-4 h-4 text-green-600" }),
      "Export"
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => setShowBulkActions(true),
        className: "h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
      },
      /* @__PURE__ */ React.createElement(EditIcon, { className: "w-4 h-4 text-blue-600" }),
      "Bulk Update"
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => setShowBulkDeleteModal(true),
        disabled: bulkLoading,
        className: "h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 disabled:opacity-50 flex-shrink-0 whitespace-nowrap"
      },
      /* @__PURE__ */ React.createElement(DeleteIcon, { className: "w-4 h-4 text-red-600" }),
      "Delete"
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: exitSelectionMode,
        className: "h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium rounded-r-[25px] hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
      },
      /* @__PURE__ */ React.createElement(X, { className: "w-4 h-4" }),
      "Cancel"
    )), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3 flex-shrink-0" }, /* @__PURE__ */ React.createElement(CheckSquare, { className: "w-5 h-5 text-blue-600 flex-shrink-0" }), /* @__PURE__ */ React.createElement("span", { className: "text-blue-800 font-semibold font-inter whitespace-nowrap" }, selectedPurchases.length, " purchase", selectedPurchases.length !== 1 ? "s" : "", " selected"), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: handleSelectAllAcrossPages,
        className: "h-10 px-4 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-[25px] hover:bg-gray-50 focus:outline-none transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
      },
      /* @__PURE__ */ React.createElement(CheckSquare, { className: "w-4 h-4" }),
      "Select All"
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: handleDeselectAllExtra,
        className: "h-10 px-4 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-[25px] hover:bg-gray-50 focus:outline-none transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
      },
      /* @__PURE__ */ React.createElement(X, { className: "w-4 h-4" }),
      "Deselect All"
    ))) : /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 lg:gap-4 w-full h-full" }, /* @__PURE__ */ React.createElement(
      "div",
      {
        className: `flex-shrink-0 flex flex-col justify-center gap-1.5 overflow-hidden transition-opacity duration-300 ease-in-out lg:!w-auto lg:!opacity-100 ${isSearchExpanded ? "w-0 opacity-0" : "w-[190px] opacity-100"}`
      },
      showLoadingSkeleton ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(Skeleton, { width: 110, height: 18 }), /* @__PURE__ */ React.createElement(Skeleton, { width: 170, height: 12 })) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement("h1", { className: "m-0 leading-tight font-bold text-base sm:text-lg text-gray-900 truncate" }, "Purchases")), /* @__PURE__ */ React.createElement("p", { className: "m-0 leading-tight text-[10px] sm:text-xs text-gray-500 font-inter truncate" }, "Manage bills received from vendors"))
    ), showLoadingSkeleton ? /* @__PURE__ */ React.createElement("div", { className: "relative flex-1 flex items-center justify-end gap-3" }, /* @__PURE__ */ React.createElement(Skeleton, { width: 40, height: 40, shape: "circle" }), /* @__PURE__ */ React.createElement(Skeleton, { width: 40, height: 40, shape: "circle" }), /* @__PURE__ */ React.createElement(Skeleton, { width: 150, height: 40, shape: "circle" })) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "relative flex-1 min-w-0 flex items-center justify-end" }, /* @__PURE__ */ React.createElement(
      "div",
      {
        className: `relative h-10 flex items-center border ${searchTerm ? "border-[#0085FF]" : "border-[#E1E4EA]"} rounded-full bg-white transition-all duration-300 ease-in-out hover:bg-gray-50 focus-within:border-[#0085FF] focus-within:hover:bg-white ${isSearchExpanded ? "w-full lg:w-[416px]" : "w-10"} max-w-full`
      },
      /* @__PURE__ */ React.createElement(
        SearchIcon,
        {
          className: "absolute left-3 cursor-pointer z-10 flex-shrink-0 top-1/2 -translate-y-1/2 w-4 h-4 text-[#525866]",
          onClick: () => {
            setIsSearchExpanded(true);
            searchInputRef.current?.focus();
          }
        }
      ),
      /* @__PURE__ */ React.createElement(
        "input",
        {
          ref: searchInputRef,
          type: "text",
          value: searchTerm,
          onChange: (e) => setSearchTerm(e.target.value),
          onFocus: () => setIsSearchExpanded(true),
          onBlur: () => {
            if (!searchTerm) setIsSearchExpanded(false);
          },
          className: `w-full h-full pl-9 pr-9 bg-transparent text-sm focus:outline-none transition-opacity duration-200 font-inter cursor-pointer ${isSearchExpanded ? "opacity-100 focus:cursor-text" : "opacity-0"}`,
          placeholder: "Search by vendor or purchase number..."
        }
      ),
      isSearchExpanded && searchTerm && /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          onMouseDown: (e) => e.preventDefault(),
          onClick: () => setSearchTerm(""),
          "aria-label": "Clear search",
          className: "absolute right-2.5 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-5 h-5 rounded-full text-gray-900 hover:bg-gray-100 transition-colors"
        },
        /* @__PURE__ */ React.createElement(X, { className: "w-3.5 h-3.5", strokeWidth: 2.5 })
      )
    )), /* @__PURE__ */ React.createElement("div", { className: "relative flex items-center gap-2 lg:gap-4 flex-shrink-0" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => setShowAdvancedFilters(true),
        className: `hidden lg:flex relative items-center justify-center w-10 h-10 rounded-full border transition-colors bg-white ${activeFilters.length > 0 ? "border-[#0085FF] text-[#0085FF]" : "border-[#E1E4EA] text-gray-500 hover:bg-gray-50"}`,
        title: "Filters"
      },
      /* @__PURE__ */ React.createElement(FilterIcon, { size: 16, className: activeFilters.length > 0 ? "text-[#0085FF]" : "" }),
      activeFilters.length > 0 && /* @__PURE__ */ React.createElement("span", { className: "absolute -top-1 -right-1 bg-[#0085FF] text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center" }, activeFilters.length)
    ), /* @__PURE__ */ React.createElement("div", { className: "relative", ref: moreMenuRef }, /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => setIsMoreMenuOpen((prev) => !prev),
        className: "relative flex items-center justify-center w-10 h-10 rounded-full border border-[#E1E4EA] text-[#525866] hover:bg-gray-50 transition-colors",
        title: "More options"
      },
      /* @__PURE__ */ React.createElement(MoreIcon, { className: "w-4 h-4" })
    ), isMoreMenuOpen && /* @__PURE__ */ React.createElement("div", { className: "absolute right-0 z-50 mt-2 w-[180px] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5 animate-in fade-in zoom-in duration-150 origin-top-right" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          setShowAdvancedFilters(true);
          setIsMoreMenuOpen(false);
        },
        className: "lg:hidden w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
      },
      /* @__PURE__ */ React.createElement(FilterIcon, { size: 14 }),
      "Filters",
      activeFilters.length > 0 && /* @__PURE__ */ React.createElement("span", { className: "ml-auto bg-blue-100 text-blue-600 text-xs font-bold px-1.5 py-0.5 rounded-full" }, activeFilters.length)
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          setShowImport(true);
          setIsMoreMenuOpen(false);
        },
        className: "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
      },
      /* @__PURE__ */ React.createElement(UploadIcon, { className: "w-3.5 h-3.5 text-[#1C1B1F]" }),
      "Import"
    ), /* @__PURE__ */ React.createElement(
      ExportSubmenu,
      {
        compact: true,
        onExport: handleExportAll,
        onDone: () => setIsMoreMenuOpen(false)
      }
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          setShowColumnSettings(true);
          setIsMoreMenuOpen(false);
        },
        className: "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
      },
      /* @__PURE__ */ React.createElement(SettingsIcon, { className: "w-3.5 h-3.5 text-[#1C1B1F]" }),
      "Columns"
    ))), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          setEditingPurchase(null);
          setShowForm(true);
        },
        className: "inline-flex items-center justify-center gap-2 h-10 w-10 lg:w-auto px-0 lg:px-4 bg-[#0085FF] text-white text-sm font-medium rounded-full hover:bg-blue-600 focus:outline-none cursor-pointer transition-colors flex-shrink-0",
        title: "New Purchase"
      },
      /* @__PURE__ */ React.createElement(PlusIcon, { className: "w-4 h-4 flex-shrink-0" }),
      /* @__PURE__ */ React.createElement("span", { className: "hidden lg:inline" }, "New Purchase")
    ))))
  ), /* @__PURE__ */ React.createElement(
    "div",
    {
      className: "fixed right-0 h-14 px-4 sm:px-6 lg:px-8 bg-white flex items-center top-[calc(118px+var(--dc-offline-offset,0px))] lg:top-[calc(128px+var(--dc-offline-offset,0px))]",
      style: { left: "var(--sidebar-width, 0px)", zIndex: 38 }
    },
    /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1 rounded-full bg-[#F1F1F5] p-1 min-w-0 overflow-x-auto" }, [{ label: "All", value: "" }, ...statusOptions.map((o) => ({ label: getStatusLabel(o), value: o }))].map((tab) => {
      const selected = filterStatus === tab.value;
      return /* @__PURE__ */ React.createElement(
        "button",
        {
          key: tab.label,
          type: "button",
          onClick: () => setFilterStatus(tab.value),
          className: `h-9 flex-shrink-0 whitespace-nowrap rounded-full px-5 text-sm font-medium transition-colors ${selected ? "bg-white text-[#0085FF] shadow-sm" : "text-[#0E121B] hover:bg-white/60"}`
        },
        tab.label,
        tab.value === "" && selected && /* @__PURE__ */ React.createElement("span", { className: "ml-2 rounded-md bg-[#F1F1F5] px-1.5 py-0.5 text-xs font-medium text-[#525866]" }, pagination.totalCount ?? 0)
      );
    })),
    /* @__PURE__ */ React.createElement("div", { className: "ml-3" }, /* @__PURE__ */ React.createElement(DateRangeFilterButton, { value: dateRange, onChange: setDateRange }))
  ), /* @__PURE__ */ React.createElement(
    "div",
    {
      ref: tableScrollRef,
      className: "overflow-x-auto overflow-y-auto top-[calc(174px+var(--dc-offline-offset,0px))] lg:top-[calc(184px+var(--dc-offline-offset,0px))]",
      style: {
        position: "fixed",
        left: "var(--sidebar-width, 0px)",
        paddingLeft: "var(--content-inset, 16px)",
        right: 0,
        bottom: !showLoadingSkeleton ? 64 : 0
      }
    },
    /* @__PURE__ */ React.createElement("div", { className: `relative bg-white border-r border-[#E1E4EA] ${showLoadingSkeleton || purchases.length > 0 ? "border-b" : ""}` }, /* @__PURE__ */ React.createElement(
      "table",
      {
        className: "w-full border-separate border-spacing-0 text-left",
        style: {
          minWidth: `${table.getTotalSize()}px`,
          tableLayout: "fixed"
        }
      },
      (() => {
        const leftPinnedKeys = pinnedColumns.filter((p) => p.side === "left").map((p) => p.key);
        const rightPinnedKeys = pinnedColumns.filter((p) => p.side === "right").map((p) => p.key);
        const allHeaders = table.getHeaderGroups()[0]?.headers || [];
        const leftPinnedInOrder = allHeaders.map((h) => h.column.id).filter((id) => leftPinnedKeys.includes(id));
        const rightPinnedInOrder = allHeaders.map((h) => h.column.id).filter((id) => rightPinnedKeys.includes(id));
        const lastLeftPinnedKey = leftPinnedInOrder.length > 0 ? leftPinnedInOrder[leftPinnedInOrder.length - 1] : null;
        const firstRightPinnedKey = rightPinnedInOrder.length > 0 ? rightPinnedInOrder[0] : null;
        const pinnedLeftOffsets = {};
        let cumulativeLeft = 0;
        allHeaders.forEach((h) => {
          const isLeftStickyCol = h.column.id === "selection" || leftPinnedKeys.includes(h.column.id);
          if (isLeftStickyCol) {
            pinnedLeftOffsets[h.column.id] = cumulativeLeft;
            cumulativeLeft += h.getSize();
          }
        });
        const pinnedRightOffsets = {};
        let cumulativeRight = 0;
        [...allHeaders].reverse().forEach((h) => {
          const isRightStickyCol = rightPinnedKeys.includes(h.column.id);
          if (isRightStickyCol) {
            pinnedRightOffsets[h.column.id] = cumulativeRight;
            cumulativeRight += h.getSize();
          }
        });
        return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("thead", { className: "bg-[#F5F7FA] border-b border-[#E1E4EA] sticky top-0 z-30 select-none" }, table.getHeaderGroups().map((headerGroup) => /* @__PURE__ */ React.createElement("tr", { key: headerGroup.id }, headerGroup.headers.map((header) => {
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
          return /* @__PURE__ */ React.createElement(
            "th",
            {
              key: header.id,
              "data-col-id": colId,
              onMouseDown: isDraggable ? (e) => startColumnDrag(e, colId) : void 0,
              style: {
                width: header.getSize(),
                position: isSticky ? "sticky" : "relative",
                left: isLeftSticky ? pinnedLeftOffsets[colId] ?? 0 : "auto",
                right: isRightSticky ? pinnedRightOffsets[colId] ?? 0 : "auto",
                zIndex: isSticky ? 20 : 1
              },
              className: `px-4 py-3 text-sm font-bold text-[#525866] border-r border-[#E1E4EA] last:border-r-0 transition-colors bg-[#F5F7FA] ${isDraggable ? "cursor-grab active:cursor-grabbing" : ""} ${isDragOver ? "bg-blue-100" : "hover:bg-gray-100"}`
            },
            /* @__PURE__ */ React.createElement("div", { className: "w-full min-w-0", style: { opacity: isDragging ? 0.35 : 1 } }, flexRender(
              header.column.columnDef.header,
              header.getContext()
            )),
            boundaryShadowSide && /* @__PURE__ */ React.createElement("div", { style: getPinnedBoundaryOverlayStyle(boundaryShadowSide) }),
            colId !== "selection" && header.column.getCanResize() && /* @__PURE__ */ React.createElement(
              "div",
              {
                "data-resize-handle": "true",
                onMouseDown: (e) => {
                  e.stopPropagation();
                  header.getResizeHandler()(e);
                },
                onTouchStart: header.getResizeHandler(),
                className: "absolute right-0 top-0 h-full w-1 cursor-col-resize select-none z-50 bg-transparent"
              }
            )
          );
        })))), /* @__PURE__ */ React.createElement("tbody", { className: "bg-white" }, showLoadingSkeleton ? /* @__PURE__ */ React.createElement(
          TableSkeletonRows,
          {
            numRows: pagination.limit,
            columns: table.getVisibleLeafColumns().filter((c) => c.id !== "selection"),
            hasCheckbox: true
          }
        ) : purchases.length === 0 ? /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: table.getAllColumns().length }, /* @__PURE__ */ React.createElement(
          EmptyState,
          {
            icon: ShoppingCart,
            noun: "Purchase",
            isFiltered: !!(debouncedSearchTerm || activeFilters?.length || filterStatus),
            onCreate: () => {
              setEditingPurchase(null);
              setShowForm(true);
            }
          }
        ))) : table.getRowModel().rows.map((row) => /* @__PURE__ */ React.createElement(
          "tr",
          {
            key: row.id,
            onClick: (e) => {
              if (e.target.closest("button, a, input, label, [data-no-row-click]")) return;
              if (e.target.closest("td")?.cellIndex === 0) return;
              setDetailPurchaseId(row.original._id);
            },
            className: `cursor-pointer bg-white hover:bg-blue-50 transition-colors ${selectedPurchasesSet.has(row.original._id) ? "!bg-blue-50" : ""}`,
            style: { height: 37, maxHeight: 37 }
          },
          row.getVisibleCells().map((cell) => {
            const colId = cell.column.id;
            const isLeftSticky = colId === "selection" || leftPinnedKeys.includes(colId);
            const isRightSticky = rightPinnedKeys.includes(colId);
            const isSticky = isLeftSticky || isRightSticky;
            const isLeftBoundary = colId === lastLeftPinnedKey;
            const isRightBoundary = colId === firstRightPinnedKey;
            const cellBoundaryShadowSide = isLeftBoundary ? "left" : isRightBoundary ? "right" : null;
            const isColDragging = draggedColKey === colId;
            return /* @__PURE__ */ React.createElement(
              "td",
              {
                key: cell.id,
                style: {
                  width: cell.column.getSize(),
                  height: "37px",
                  maxHeight: "37px",
                  boxSizing: "border-box",
                  position: isSticky ? "sticky" : "static",
                  left: isLeftSticky ? pinnedLeftOffsets[colId] ?? 0 : "auto",
                  right: isRightSticky ? pinnedRightOffsets[colId] ?? 0 : "auto",
                  zIndex: isSticky ? 10 : 1
                },
                className: "px-4 py-2 align-middle text-sm text-[#1C1B1F] bg-inherit border-r border-b border-[#E1E4EA] last:border-r-0"
              },
              /* @__PURE__ */ React.createElement("div", { style: { opacity: isColDragging ? 0.35 : 1, overflow: "hidden" } }, flexRender(
                cell.column.columnDef.cell,
                cell.getContext()
              )),
              cellBoundaryShadowSide && /* @__PURE__ */ React.createElement("div", { style: getPinnedBoundaryOverlayStyle(cellBoundaryShadowSide) })
            );
          })
        ))));
      })()
    ))
  ), dragGhost && createPortal(
    /* @__PURE__ */ React.createElement(
      "div",
      {
        ref: ghostElRef,
        style: {
          position: "fixed",
          top: -9999,
          left: -9999,
          width: dragGhost.width,
          zIndex: 1e4,
          pointerEvents: "none"
        },
        className: "flex flex-col bg-white rounded-lg shadow-2xl overflow-hidden"
      },
      /* @__PURE__ */ React.createElement("div", { className: "px-4 py-3 bg-[#F5F7FA] border-b border-[#E1E4EA]", style: { height: dragGhost.height } }, /* @__PURE__ */ React.createElement("span", { className: "text-sm font-bold text-[#525866] truncate block" }, dragGhost.label)),
      dragGhost.previewRows.map((rowVal, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: "px-4 py-2 border-b border-[#F1F1F5] last:border-b-0" }, /* @__PURE__ */ React.createElement("span", { className: "text-sm text-gray-700 truncate block" }, rowVal)))
    ),
    document.body
  ), !showLoadingSkeleton && /* @__PURE__ */ React.createElement(
    "div",
    {
      className: `fixed bottom-0 right-0 bg-white border-t border-[#E1E4EA] shadow-sm z-[9992] flex items-center ${isSearchOverlayOpen ? "pointer-events-none" : ""}`,
      style: {
        left: "var(--sidebar-width, 0px)",
        height: 64,
        filter: isSearchOverlayOpen ? "brightness(0.6)" : "none"
      }
    },
    /* @__PURE__ */ React.createElement(PaginationControls, null)
  )), /* @__PURE__ */ React.createElement(
    BulkActions,
    {
      isOpen: showBulkActions,
      onClose: () => setShowBulkActions(false),
      selectedItems: purchases.filter(
        (p) => selectedPurchases.includes(p._id)
      ),
      onBulkUpdate: handleBulkUpdate,
      onBulkDelete: handleBulkDelete,
      fieldConfig: purchaseFieldConfig,
      module: "purchases",
      loading: bulkLoading
    }
  ), /* @__PURE__ */ React.createElement(
    BulkDeleteModal,
    {
      isOpen: showBulkDeleteModal,
      message: /* @__PURE__ */ React.createElement(React.Fragment, null, "Are you sure you want to delete ", /* @__PURE__ */ React.createElement("strong", null, selectedPurchases.length), " selected Purchases? This action cannot be undone."),
      loading: bulkLoading,
      onCancel: () => setShowBulkDeleteModal(false),
      onConfirm: async () => {
        await handleBulkDelete(selectedPurchases);
        setShowBulkDeleteModal(false);
      }
    }
  ), /* @__PURE__ */ React.createElement(
    ExportModal,
    {
      isOpen: showExportModal,
      onClose: () => setShowExportModal(false),
      columns: exportColumns,
      selectedIds: selectedPurchases,
      exportUrl: "/purchases/export-selected",
      fileName: "Exported_Purchases.csv"
    }
  ), (() => {
    const detailIndex = filteredPurchases.findIndex((p) => p._id === detailPurchaseId);
    if (detailIndex < 0) return null;
    const pu = filteredPurchases[detailIndex];
    const stripHtml = (h) => String(h || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
    const detailDoc = {
      _id: pu._id,
      purchaseNumber: pu.purchaseNumber,
      date: pu.purchaseDate || pu.createdAt,
      dueDate: null,
      amount: pu.grandTotal,
      status: pu.status,
      deal: { title: pu.vendor?.name || "\u2014" },
      items: (pu.items || []).map((i) => ({
        _id: i._id,
        name: i.name,
        description: i.sku ? `SKU ${i.sku}` : "",
        rate: i.unitPrice,
        quantity: i.quantity,
        gstRate: i.gstRate,
        discount: 0
      })),
      payments: pu.payments || [],
      notes: stripHtml(pu.notes)
    };
    return /* @__PURE__ */ React.createElement(
      DocumentDetailModal,
      {
        doc: detailDoc,
        type: "purchase",
        docLabel: "Purchase",
        numberKey: "purchaseNumber",
        steps: ["Draft", "Pending", "Confirmed", "Partial", "Paid"],
        paymentTerms: pu.purchaseOrder?.poNumber ? `PO ${pu.purchaseOrder.poNumber}` : "",
        showPayments: true,
        dateLabel: "Purchase date",
        hideAddresses: true,
        position: { index: detailIndex, total: filteredPurchases.length },
        onClose: () => setDetailPurchaseId(null),
        onPrev: detailIndex > 0 ? () => setDetailPurchaseId(filteredPurchases[detailIndex - 1]._id) : null,
        onNext: detailIndex < filteredPurchases.length - 1 ? () => setDetailPurchaseId(filteredPurchases[detailIndex + 1]._id) : null
      }
    );
  })(), /* @__PURE__ */ React.createElement(
    AdvancedFilterPanel,
    {
      isOpen: showAdvancedFilters,
      onClose: () => setShowAdvancedFilters(false),
      columns: purchaseFilterColumns,
      filters: activeFilters,
      setFilters: setActiveFilters,
      onApply: (newFilters) => setActiveFilters(newFilters),
      title: "Filter Purchases",
      subtitle: "Find specific purchases quickly",
      emptyStateText: "Add a rule to narrow down your purchase list."
    }
  ), shareMenu && createPortal(
    /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 z-[100060]", onClick: () => {
      setShareMenu(null);
      setShareMenuChannel(null);
    } }), /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "fixed z-[100061] w-[160px] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5",
        style: { top: shareMenu.y, left: shareMenu.x }
      },
      (() => {
        const link = `${window.location.origin}/view/purchase/${shareMenu.doc._id}`;
        const num = shareMenu.doc.purchaseNumber;
        const d = shareMenu.doc;
        const customerName = d.vendor?.name || "Vendor";
        const amt = d.grandTotal != null ? `\u20B9${Number(d.grandTotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "";
        const closeMenu = () => {
          setShareMenu(null);
          setShareMenuChannel(null);
        };
        const fillTpl = (tpl) => tpl.replace(/{customerName}/g, customerName).replace(/{docType}/g, "Purchase").replace(/{number}/g, num || "").replace(/{amount}/g, amt).replace(/{link}/g, link).replace(/{company}/g, shareCompanyName || "");
        const buildWaMsg = (tpl) => `Hello ${customerName || ""},

${tpl?.line1 || `Your Purchase Bill from ${shareCompanyName || "us"} is ready.`}

Document: ${num || "n/a"}
Total: ${amt}
View/download: ${link}${tpl?.line2 ? `

${tpl.line2}` : ""}

Regards,
${shareCompanyName || "the sender"}`;
        const buildSmsMsg = (tpl) => tpl?.body ? fillTpl(tpl.body) : `${shareCompanyName || "We"}: your Purchase Bill${num ? ` ${num}` : ""} is ready. View/download: ${link}`;
        const buildEmailSubject = (tpl) => tpl?.subject ? fillTpl(tpl.subject) : `Purchase Bill ${num || ""}${shareCompanyName ? ` from ${shareCompanyName}` : ""}`.trim();
        const buildEmailBody = (tpl) => tpl?.body ? fillTpl(tpl.body) : `Dear ${customerName || "Sir/Madam"},

Please find attached your Purchase Bill${num ? ` ${num}` : ""}.

You can also view or download it online:
${link}

Regards,
${shareCompanyName || "the sender"}`;
        const channels = {
          whatsapp: {
            list: waTemplatesList,
            send: (tpl) => {
              window.open(`https://wa.me/?text=${encodeURIComponent(buildWaMsg(tpl))}`, "_blank");
              closeMenu();
            }
          },
          email: {
            list: emailTemplatesList,
            send: (tpl) => {
              setEmailComposeTo(d.vendor?.email || "");
              setEmailComposeSubject(buildEmailSubject(tpl));
              setEmailComposeBody(textToEmailHtml(buildEmailBody(tpl)));
              setEmailCompose({ doc: d });
              closeMenu();
            }
          },
          sms: {
            list: smsTemplatesList,
            send: (tpl) => {
              setSmsComposeTo(d.vendor?.phone || "");
              setSmsComposeBody(buildSmsMsg(tpl));
              setSmsCompose({ doc: d });
              closeMenu();
            }
          }
        };
        const openChannel = (channel) => {
          const { list, send } = channels[channel];
          if (list.length <= 1) send(list[0] || null);
          else setShareMenuChannel(channel);
        };
        if (shareMenuChannel) {
          const { list, send } = channels[shareMenuChannel];
          return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
            "button",
            {
              onClick: (e) => {
                e.stopPropagation();
                setShareMenuChannel(null);
              },
              className: "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium text-gray-500 hover:bg-gray-50 border-b border-[#F1F1F5] mb-0.5 whitespace-nowrap"
            },
            "\u2190 Back"
          ), list.map((tpl) => /* @__PURE__ */ React.createElement(
            "button",
            {
              key: tpl.id,
              onClick: (e) => {
                e.stopPropagation();
                send(tpl);
              },
              className: "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
            },
            /* @__PURE__ */ React.createElement("span", { className: "truncate" }, tpl.name),
            tpl.isDefault && /* @__PURE__ */ React.createElement("span", { className: "text-[9px] text-green-600 font-semibold flex-shrink-0" }, "Default")
          )));
        }
        const items = [
          { label: "WhatsApp", icon: /* @__PURE__ */ React.createElement(FaWhatsapp, { className: "w-3.5 h-3.5 text-[#25D366]" }), onClick: () => openChannel("whatsapp") },
          { label: "Email", icon: /* @__PURE__ */ React.createElement("img", { src: emailLogo, alt: "", className: "w-3.5 h-3.5 object-contain" }), onClick: () => openChannel("email") },
          { label: "SMS", icon: /* @__PURE__ */ React.createElement(MessageSquare, { className: "w-3.5 h-3.5 text-purple-600" }), onClick: () => openChannel("sms") },
          { label: "Copy Link", icon: /* @__PURE__ */ React.createElement(Copy, { className: "w-3.5 h-3.5 text-gray-500" }), onClick: () => {
            navigator.clipboard.writeText(link).catch(() => {
            });
            toast.success("Link copied");
            closeMenu();
          } }
        ];
        return items.map(({ label, icon, onClick }) => /* @__PURE__ */ React.createElement(
          "button",
          {
            key: label,
            onClick: (e) => {
              e.stopPropagation();
              onClick();
            },
            className: "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
          },
          icon,
          label
        ));
      })()
    )),
    document.body
  ), statusMenu && createPortal(
    /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 z-[100060]", onClick: () => setStatusMenu(null) }), /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "fixed z-[100061] w-[160px] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5",
        style: { top: statusMenu.y, left: statusMenu.x }
      },
      statusMenuOptions(statusMenu.doc.status).map((st) => /* @__PURE__ */ React.createElement(
        "button",
        {
          key: st,
          onClick: (e) => {
            e.stopPropagation();
            updateSingleStatus(statusMenu.doc._id, st);
            setStatusMenu(null);
            setOpenRowActionsId(null);
            setRowActionsPos(null);
          },
          className: `w-full text-left px-2 py-1.5 rounded-md text-xs whitespace-nowrap ${statusMenu.doc.status === st ? "bg-blue-50 text-blue-600 font-medium" : "text-[#161618] hover:bg-gray-50"}`
        },
        st
      ))
    )),
    document.body
  ), emailCompose && (() => {
    const dname = "Purchase";
    const dnum = emailCompose.doc.purchaseNumber;
    const link = `${window.location.origin}/view/purchase/${emailCompose.doc._id}`;
    const cname = emailCompose.doc.vendor?.name || "Vendor";
    const eAmt = emailCompose.doc.grandTotal != null ? `\u20B9${Number(emailCompose.doc.grandTotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "";
    const fillEmailTpl = (tpl) => tpl.replace(/{customerName}/g, cname).replace(/{docType}/g, dname).replace(/{number}/g, dnum || "").replace(/{amount}/g, eAmt).replace(/{link}/g, link).replace(/{company}/g, shareCompanyName || "");
    const applyTemplate = (key) => {
      const saved = emailTemplatesList.find((tpl) => tpl.id === key);
      let nextSubject;
      let nextBody;
      if (saved) {
        nextSubject = fillEmailTpl(saved.subject || "");
        nextBody = textToEmailHtml(fillEmailTpl(saved.body || ""));
      } else if (key === "standard") {
        nextSubject = `${dname} ${dnum || ""}${shareCompanyName ? ` from ${shareCompanyName}` : ""}`.trim();
        nextBody = textToEmailHtml(`Dear ${cname || "Sir/Madam"},

Please find attached your ${dname}${dnum ? ` ${dnum}` : ""}.

You can also view or download it online: ${link}

Regards,
${shareCompanyName || "the sender"}`);
      } else if (key === "reminder") {
        nextSubject = `Reminder: ${dname} ${dnum || ""} pending`;
        nextBody = textToEmailHtml(`Dear ${cname || "Sir/Madam"},

This is a reminder that your ${dname}${dnum ? ` ${dnum}` : ""} is awaiting your review.

View it here: ${link}

Contact us if you have any questions.

Regards,
${shareCompanyName || "the sender"}`);
      } else if (key === "followup") {
        nextSubject = `Following up on ${dname} ${dnum || ""}`;
        nextBody = textToEmailHtml(`Dear ${cname || "Sir/Madam"},

We wanted to follow up regarding ${dname}${dnum ? ` ${dnum}` : ""} shared earlier.

View or download: ${link}

We look forward to hearing from you.

Regards,
${shareCompanyName || "the sender"}`);
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
        await API.post(`/public/purchase/${emailCompose.doc._id}/email`, {
          email: emailComposeTo,
          cc: emailComposeCc,
          bcc: emailComposeBcc,
          subject: emailComposeSubject,
          body: emailComposeBody
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
      { icon: /* @__PURE__ */ React.createElement(BoldIcon, { className: "w-3.5 h-3.5" }), title: "Bold", onClick: () => execCmd("bold") },
      { icon: /* @__PURE__ */ React.createElement(ItalicIcon, { className: "w-3.5 h-3.5" }), title: "Italic", onClick: () => execCmd("italic") },
      { icon: /* @__PURE__ */ React.createElement(UnderlineIcon, { className: "w-3.5 h-3.5" }), title: "Underline", onClick: () => execCmd("underline") },
      { icon: /* @__PURE__ */ React.createElement(StrikethroughIcon, { className: "w-3.5 h-3.5" }), title: "Strikethrough", onClick: () => execCmd("strikeThrough") },
      { icon: /* @__PURE__ */ React.createElement(ListOrdered, { className: "w-3.5 h-3.5" }), title: "Numbered list", onClick: () => execCmd("insertOrderedList") },
      { icon: /* @__PURE__ */ React.createElement(ListIcon, { className: "w-3.5 h-3.5" }), title: "Bulleted list", onClick: () => execCmd("insertUnorderedList") },
      { icon: /* @__PURE__ */ React.createElement(LinkIcon, { className: "w-3.5 h-3.5" }), title: "Insert link", onClick: insertLink }
    ];
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 bg-black/20 backdrop-blur-sm z-[100011]", onClick: () => {
      setEmailCompose(null);
      setEmailTemplateOpen(false);
    } }), /* @__PURE__ */ React.createElement("div", { className: "fixed dc-panel-card w-[calc(100%-3rem)] max-w-[580px] bg-white shadow-2xl z-[100012] flex flex-col overflow-hidden animate-slideInRight", onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between px-5 py-4 border-b border-gray-200 rounded-t-2xl flex-shrink-0" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3" }, /* @__PURE__ */ React.createElement("button", { onClick: () => setEmailCompose(null), className: "p-1.5 rounded-lg hover:bg-gray-100 transition-colors" }, /* @__PURE__ */ React.createElement(X, { className: "w-4 h-4 text-gray-500" })), /* @__PURE__ */ React.createElement("h2", { className: "text-base font-semibold text-gray-900" }, "Send Email")), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => setEmailPreviewMode((prev) => !prev),
        className: "px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
      },
      emailPreviewMode ? "Edit" : "Preview"
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        disabled: !emailComposeTo || emailComposeSending,
        onClick: doSend,
        className: "px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
      },
      emailComposeSending ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" }), " Sending\u2026") : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(Mail, { className: "w-4 h-4" }), " Send Email")
    ))), /* @__PURE__ */ React.createElement("div", { className: "flex-1 overflow-y-auto px-5 py-4 space-y-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-xs font-medium text-gray-500 mb-1" }, "From"), /* @__PURE__ */ React.createElement("div", { className: "flex items-center w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50" }, /* @__PURE__ */ React.createElement("span", { className: "flex items-center gap-1.5 text-sm text-gray-600 flex-1 min-w-0" }, /* @__PURE__ */ React.createElement("span", { className: "w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] font-semibold flex items-center justify-center flex-shrink-0" }, "DC"), /* @__PURE__ */ React.createElement("span", { className: "min-w-0 truncate" }, EMAIL_FROM_NAME && /* @__PURE__ */ React.createElement("strong", { className: "mr-1" }, EMAIL_FROM_NAME), EMAIL_FROM_ADDRESS), /* @__PURE__ */ React.createElement(Lock, { className: "w-3 h-3 text-gray-400 flex-shrink-0" })), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1 flex-shrink-0 ml-2" }, !showEmailCc && /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => setShowEmailCc(true), className: "px-2 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors" }, "Cc"), !showEmailBcc && /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => setShowEmailBcc(true), className: "px-2 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors" }, "Bcc")))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-xs font-medium text-gray-500 mb-1" }, "To"), /* @__PURE__ */ React.createElement("input", { type: "email", value: emailComposeTo, onChange: (e) => setEmailComposeTo(e.target.value), placeholder: "recipient@example.com", className: "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" })), showEmailCc && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between mb-1" }, /* @__PURE__ */ React.createElement("label", { className: "block text-xs font-medium text-gray-500" }, "Cc"), /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => {
      setShowEmailCc(false);
      setEmailComposeCc("");
    }, className: "text-xs font-medium text-gray-400 hover:text-gray-600" }, "Remove")), /* @__PURE__ */ React.createElement("input", { type: "text", value: emailComposeCc, onChange: (e) => setEmailComposeCc(e.target.value), placeholder: "comma-separated addresses", className: "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" })), showEmailBcc && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between mb-1" }, /* @__PURE__ */ React.createElement("label", { className: "block text-xs font-medium text-gray-500" }, "Bcc"), /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => {
      setShowEmailBcc(false);
      setEmailComposeBcc("");
    }, className: "text-xs font-medium text-gray-400 hover:text-gray-600" }, "Remove")), /* @__PURE__ */ React.createElement("input", { type: "text", value: emailComposeBcc, onChange: (e) => setEmailComposeBcc(e.target.value), placeholder: "comma-separated addresses", className: "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-xs font-medium text-gray-500 mb-1" }, "Subject"), /* @__PURE__ */ React.createElement("input", { type: "text", value: emailComposeSubject, onChange: (e) => setEmailComposeSubject(e.target.value), className: "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" })), /* @__PURE__ */ React.createElement("div", { className: "relative" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between mb-1" }, /* @__PURE__ */ React.createElement("label", { className: "block text-xs font-medium text-gray-500" }, "Body"), /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => setEmailTemplateOpen((prev) => !prev), className: "flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors" }, "+ Add template ", /* @__PURE__ */ React.createElement(ChevronDown, { className: "w-3 h-3" }))), emailTemplateOpen && /* @__PURE__ */ React.createElement("div", { className: "absolute right-0 top-6 bg-white border border-gray-200 rounded-lg shadow-lg w-64 z-10 py-1" }, [
      ...emailTemplatesList.map((tpl) => ({
        key: tpl.id,
        label: tpl.name,
        desc: tpl.isDefault ? "Default \xB7 From Document Settings" : "From Document Settings"
      })),
      { key: "standard", label: "Standard", desc: "Thank you for your business" },
      { key: "reminder", label: "Reminder", desc: "Document pending review" },
      { key: "followup", label: "Follow-up", desc: "Check in on document" }
    ].map(({ key, label, desc }) => /* @__PURE__ */ React.createElement("button", { key, onClick: () => applyTemplate(key), className: "w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors" }, /* @__PURE__ */ React.createElement("p", { className: "text-sm font-medium text-gray-800" }, label), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-gray-400" }, desc)))), emailPreviewMode ? /* @__PURE__ */ React.createElement("div", { className: "w-full min-h-[220px] px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 [&_a]:text-blue-600 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5", dangerouslySetInnerHTML: { __html: emailComposeBody } }) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-0.5 border border-gray-200 border-b-0 rounded-t-lg bg-gray-50 px-1.5 py-1" }, toolbarButtons.map(({ icon, title, onClick }) => /* @__PURE__ */ React.createElement("button", { key: title, type: "button", title, onMouseDown: (e) => {
      e.preventDefault();
      onClick();
    }, className: "p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors" }, icon))), /* @__PURE__ */ React.createElement(
      "div",
      {
        ref: (el) => {
          emailBodyEditorRef.current = el;
          if (el && el.dataset.init !== "true") {
            el.innerHTML = emailComposeBody;
            el.dataset.init = "true";
          }
        },
        contentEditable: true,
        suppressContentEditableWarning: true,
        onInput: (e) => setEmailComposeBody(e.currentTarget.innerHTML),
        className: "w-full min-h-[220px] px-3 py-2 border border-gray-200 rounded-b-lg text-sm focus:outline-none focus:border-blue-500 [&_a]:text-blue-600 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
      }
    )))), /* @__PURE__ */ React.createElement("div", { className: "flex-shrink-0 px-5 py-4 border-t border-gray-100 bg-white rounded-b-2xl" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        disabled: !emailComposeTo || emailComposeSending,
        onClick: doSend,
        className: "w-full px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
      },
      emailComposeSending ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" }), " Sending\u2026") : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(Mail, { className: "w-4 h-4" }), " Send Email")
    ))));
  })(), smsCompose && /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100011]", onClick: () => setSmsCompose(null) }, /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden", onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between px-6 py-4 border-b border-gray-100" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3" }, /* @__PURE__ */ React.createElement("div", { className: "bg-purple-100 p-2 rounded-lg" }, /* @__PURE__ */ React.createElement(MessageSquare, { className: "w-5 h-5 text-purple-600" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", { className: "text-base font-bold text-gray-900" }, "Send SMS"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-gray-400" }, "Purchase #", smsCompose.doc.purchaseNumber))), /* @__PURE__ */ React.createElement("button", { onClick: () => setSmsCompose(null), className: "p-1.5 rounded-lg hover:bg-gray-100 transition-colors" }, /* @__PURE__ */ React.createElement(X, { className: "w-4 h-4 text-gray-500" }))), /* @__PURE__ */ React.createElement("div", { className: "px-6 py-5 space-y-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-xs font-medium text-gray-500 mb-1.5" }, "To (phone number)"), /* @__PURE__ */ React.createElement("input", { type: "tel", value: smsComposeTo, onChange: (e) => setSmsComposeTo(e.target.value), placeholder: "+91 98765 43210", className: "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-purple-500" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-xs font-medium text-gray-500 mb-1.5" }, "Message"), /* @__PURE__ */ React.createElement("textarea", { rows: 4, value: smsComposeBody, onChange: (e) => setSmsComposeBody(e.target.value), className: "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-purple-500 resize-none" }), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-gray-400 mt-1" }, smsComposeBody.length, " characters"))), /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50" }, /* @__PURE__ */ React.createElement("button", { onClick: () => setSmsCompose(null), className: "px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors" }, "Cancel"), /* @__PURE__ */ React.createElement(
    "button",
    {
      disabled: !smsComposeTo || smsComposeSending,
      onClick: async () => {
        if (!smsComposeTo || smsComposeSending) return;
        setSmsComposeSending(true);
        try {
          await API.post(`/public/purchase/${smsCompose.doc._id}/sms`, {
            phone: smsComposeTo,
            message: smsComposeBody
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
      },
      className: "px-5 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors flex items-center gap-2"
    },
    smsComposeSending ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" }), " Sending\u2026") : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(MessageSquare, { className: "w-3.5 h-3.5" }), " Send SMS")
  )))));
};
export default PurchasePage;
