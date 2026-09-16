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
  MessageCircle,
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
  Link as LinkIcon, ArrowUp, ArrowDown, Repeat, IndianRupee } from "lucide-react";
import toast from "react-hot-toast";
import TableSkeletonRows from "../components/common/TableSkeletonRows";
import Skeleton from "../components/common/Skeleton";
import { useTopLoadingSignal } from "../components/common/TopLoadingBar";
import VideoTutorialModal from "../components/VideoTutorialModal";
import { getVideoTutorial } from "../utils/videoTutorials";
import AppToaster from "../components/AppToaster";
import ExportModal from "../components/common/ExportModal";
import { exportClientSide, formatINR } from "../utils/clientExport";
import ColumnSettingsPanel from "../components/ColumnSettingsPanel";
import { useColumnSettings } from "../hooks/useColumnSettings";
import { getPinnedBoundaryOverlayStyle } from "../utils/pinnedColumnShadow";
import HighlightText from "../components/common/HighlightText";
import useSearchOverlayOpen from "../hooks/useSearchOverlayOpen";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";

import SearchIcon from "../components/common/SearchIcon";
import SettingsIcon from "../components/common/SettingsIcon";
import FilterIcon from "../components/common/FilterIcon";
import AdvancedFilterPanel from "../components/common/AdvancedFilterPanel";
import UploadIcon from "../components/common/UploadIcon";
import EyeIcon from "../components/common/EyeIcon";
import EditIcon from "../components/common/EditIcon";

// The app is rendered inside #root which carries a CSS `zoom` (0.75 on desktop).
// getBoundingClientRect() returns UNSCALED layout coordinates, while portal overlays
// mounted on document.body render in visual (un-zoomed) space and mouse clientX/Y are
// visual too. So any rect-derived position/size fed to a body-portal must be divided
// by this ancestor zoom factor to line up on screen. (Same helper as Companies.jsx /
// PurchaseOrderPage.jsx.)
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
  const [vendors, setVendors] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState(null);
  const [showForm, setShowForm] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return !!params.get("convertPO");
  });
  // PO id from PurchaseOrderPage's "Convert to Purchase" link — handed to
  // PurchaseForm so it opens pre-linked/pre-filled instead of a blank form
  // the user has to manually re-select the same PO in.
  const [initialConvertPOId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("convertPO") || null;
  });
  // Purchase Order was already converted — PurchaseOrderPage's "View
  // <purchaseNumber>" link lands here with ?view=<purchaseId> instead of
  // silently doing nothing.
  const [initialViewPurchaseId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("view") || null;
  });
  const [searchTerm, setSearchTerm] = useState("");

  const truncateText = (text, maxLength = 30) => {
    if (!text) return "—";
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  // filterStatus removed — status filtering now done via AdvancedFilterPanel rule builder.
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const searchInputRef = useRef(null);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [activeFilters, setActiveFilters] = useState([]);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const tableScrollRef = useRef(null);
  // Client-side Excel/PDF export — same "no selection required, export what
  // you're currently looking at" flow as Deals.jsx, instead of the
  // selection-gated backend ExportModal.
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportButtonRef = useRef(null);
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target)) {
        setIsMoreMenuOpen(false);
      }
      if (exportButtonRef.current && !exportButtonRef.current.contains(event.target)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close the Import/Export/Columns overflow menu on scroll — it's
  // absolutely positioned off its own button, so a scroll that moves that
  // button (e.g. the page itself scrolling, not just the table body) would
  // otherwise leave it floating detached from its anchor.
  useEffect(() => {
    if (!isMoreMenuOpen) return;
    const handleScroll = () => setIsMoreMenuOpen(false);
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, [isMoreMenuOpen]);

  // First-load skeleton only, same reasoning as Companies.jsx / PurchaseOrderPage.jsx:
  // once the page has loaded once, a search/filter that narrows results to zero must
  // NOT re-skeleton the toolbar.
  const hasLoadedOnceRef = useRef(false);
  const showLoadingSkeleton = loading && purchases.length === 0 && !hasLoadedOnceRef.current;
  // Signal the top progress bar on EVERY fetch, not just the skeleton case —
  // same as Companies.jsx.
  useTopLoadingSignal(loading);

  // Bulk Selection
  const [selectedPurchases, setSelectedPurchases] = useState([]);
  const selectedPurchasesSet = useMemo(() => new Set(selectedPurchases), [selectedPurchases]);
  const [selectionMode, setSelectionMode] = useState(true);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);

  // Double-click-to-type a page number in the pagination bar (mirrors Companies.jsx).
  const [editingPage, setEditingPage] = useState(false);
  const [pageInput, setPageInput] = useState("");

  // Delays the bulk-strip's unmount so it can play the slide-out-right exit
  // animation on deselect (mirrors Companies.jsx / PurchaseOrderPage.jsx).
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

  // Delete Modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [purchaseToDelete, setPurchaseToDelete] = useState(null);

  // Record Payment drawer
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [purchaseToPay, setPurchaseToPay] = useState(null);

  // Video Tutorial
  const [showVideoTutorial, setShowVideoTutorial] = useState(false);

  // Row actions (⋮) menu — portaled to document.body, viewport-aware, same
  // pattern as Companies.jsx / PurchaseOrderPage.jsx.
  const [openRowActionsId, setOpenRowActionsId] = useState(null);
  const [activeRowMenuState, setActiveRowMenuState] = useState("main"); // "main" or "status"
  const [rowActionsPos, setRowActionsPos] = useState(null);
  const rowActionsRef = useRef(null);

  const [shareMenu, setShareMenu] = useState(null);
  const [statusMenu, setStatusMenu] = useState(null);
  const [shareMenuChannel, setShareMenuChannel] = useState(null);
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

  // Column header menu (Pin/Sort/Hide) — also portaled.
  const [openColumnMenuKey, setOpenColumnMenuKey] = useState(null);
  const [columnMenuPos, setColumnMenuPos] = useState(null);
  const columnMenuRef = useRef(null);

  // Pinned columns: [{ key, side: 'left' | 'right' }]
  const [pinnedColumns, setPinnedColumns] = useState([]);
  const pinColumnToSide = (colKey, side) => {
    setPinnedColumns((prev) => [...prev.filter((p) => p.key !== colKey), { key: colKey, side }]);
  };
  const unpinColumn = (colKey) => {
    setPinnedColumns((prev) => prev.filter((p) => p.key !== colKey));
  };
  const getColumnPinSide = (colKey) => pinnedColumns.find((p) => p.key === colKey)?.side || null;

  // Column drag-to-reorder state.
  const [columnSizing, setColumnSizing] = useState({});
  const [draggedColKey, setDraggedColKey] = useState(null);
  const [dragOverColKey, setDragOverColKey] = useState(null);
  const [dragGhost, setDragGhost] = useState(null);
  const dragOverRef = useRef(null);
  const ghostElRef = useRef(null);

  // Pagination
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 0,
    totalCount: 0,
    limit: 50,
    hasNextPage: false,
    hasPrevPage: false,
  });

  // Sorting
  const [sortConfig, setSortConfig] = useState({
    key: null,
    direction: null,
  });

  const statusOptions = ["Draft", "Pending", "Paid", "Cancelled"];

  // Columns available in the rule-builder filter panel (mirrors Companies.jsx pattern).
  const purchaseFilterColumns = [
    { key: "purchaseNumber", label: "Purchase Number" },
    { key: "vendor", label: "Vendor" },
    { key: "status", label: "Status", options: ["Draft", "Pending", "Paid", "Cancelled"] },
    { key: "grandTotal", label: "Grand Total" },
    { key: "notes", label: "Notes" },
  ];

  // Column list handed to the shared ExportModal — same shape Vendors/Companies use.
  const exportColumns = [
    { key: "purchaseNumber", label: "Purchase Number" },
    { key: "vendor", label: "Vendor" },
    { key: "purchaseDate", label: "Purchase Date" },
    { key: "items", label: "Items" },
    { key: "subtotal", label: "Subtotal" },
    { key: "totalTax", label: "Total Tax" },
    { key: "grandTotal", label: "Grand Total" },
    { key: "status", label: "Status" },
    { key: "notes", label: "Notes" },
  ];

  const handleSelectPurchase = (purchaseId) => {
    setSelectedPurchases((prev) =>
      prev.includes(purchaseId)
        ? prev.filter((id) => id !== purchaseId)
        : [...prev, purchaseId],
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

  // "Select All" grabs every purchase ID matching the current search/filter
  // straight from the database (not just the loaded page). "Deselect All" is
  // its counterpart: it doesn't clear the selection outright (that's what
  // "Cancel" does) — it steps back down to only the rows on the current
  // page. Same pattern as Companies.jsx.
  const handleSelectAllAcrossPages = async () => {
    try {
      const params = new URLSearchParams({ allIds: "true" });
      if (debouncedSearchTerm) params.append("search", debouncedSearchTerm);
      const res = await API.get(`/purchases/pagination?${params.toString()}`);
      setSelectedPurchases(res.data.ids || []);
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to select all rows");
    }
  };

  const handleDeselectAllExtra = () => {
    setSelectedPurchases(purchases.map((p) => p._id));
  };

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset selection + page on filter/search change
  const skipInitialReset = useRef(true);
  useEffect(() => {
    if (skipInitialReset.current) {
      skipInitialReset.current = false;
      return;
    }
    exitSelectionMode();
    setPagination((prev) => ({ ...prev, currentPage: 1 }));
  }, [debouncedSearchTerm]);

  // Fetch purchases
  useEffect(() => {
    fetchPurchases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pagination.currentPage,
    pagination.limit,
    sortConfig,
    debouncedSearchTerm,
  ]);

  useEffect(() => {
    fetchVendors();
    fetchShareSettings();
  }, []);

  // Same org-wide message templates + branding Accounting.jsx's share flow
  // pulls from (Settings -> Message Templates / Branding) — reused as-is so
  // WhatsApp/Email/SMS content stays consistent across modules.
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
      console.error("Failed to load share settings in PurchasePage", err);
    }
  };

  useEffect(() => {
    if (!initialViewPurchaseId) return;
    API.get(`/purchases/${initialViewPurchaseId}`)
      .then((res) => {
        setSelectedPurchase(res.data);
        setShowPreview(true);
      })
      .catch((err) => {
        toast.error(err.response?.data?.error || "Failed to load purchase");
      });
  }, [initialViewPurchaseId]);

  const fetchVendors = async () => {
    try {
      const res = await API.get("/vendors");
      setVendors(res.data.vendors || res.data || []);
    } catch {
      toast.error("Failed to load vendors");
    }
  };

  const fetchPurchases = async () => {
    try {
      setLoading(true);
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
      if (debouncedSearchTerm) params.append("search", debouncedSearchTerm);

      const res = await API.get(`/purchases/pagination?${params.toString()}`);
      setPurchases(res.data.purchases || []);
      setPagination((prev) => ({
        ...prev,
        ...res.data.pagination,
      }));
      hasLoadedOnceRef.current = true;
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to load purchases");
      setPurchases([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSuccess = () => {
    toast.success("Purchase saved successfully");
    fetchPurchases();
    exitSelectionMode();
  };

  const handleEdit = (purchase) => {
    setEditingPurchase(purchase);
    setShowForm(true);
  };

  const handleRecordPayment = (purchase) => {
    setPurchaseToPay(purchase);
    setShowPaymentModal(true);
  };

  const handleView = (purchase) => {
    setSelectedPurchase(purchase);
    setShowPreview(true);
  };

  // Same authenticated per-module download route Accounting.jsx's Download
  // button hits for its own tabs (/${apiPath}/download/${id}) — reused
  // as-is rather than a Purchase-specific PDF pipeline.
  const textToEmailHtml = (text) => (text || "").replace(/\n/g, "<br>");

  const handleDownload = async (purchase) => {
    // Purchase downloads aren't wired to the customizable PDF filename
    // settings (only Invoice/Pro Forma/Quotation/Delivery Challan are, for
    // now) — fixed filename shape.
    const filename = `Purchase-${purchase.purchaseNumber || purchase._id}`;
    try {
      const response = await API.get(`/purchases/download/${purchase._id}`, {
        responseType: "blob",
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

  // Client-side export — mirrors Deals.jsx's handleExport: confirm, then
  // Excel (CSV via window.XLSX) or PDF (window.jspdf + autoTable), against
  // whatever's currently filtered/visible rather than a manual selection.
  const EXPORT_COLUMNS = [
    { label: "Purchase Number", value: (p) => p.purchaseNumber },
    { label: "Vendor", value: (p) => p.vendor?.name },
    { label: "Purchase Date", value: (p) => new Date(p.createdAt).toLocaleDateString() },
    { label: "Grand Total", value: (p) => formatINR(p.grandTotal) },
    { label: "Status", value: (p) => p.status },
  ];

  const handleExport = (format) => {
    if (!window.confirm(`Do you want to export in ${format}?`)) return;
    exportClientSide(format, {
      rows: filteredPurchases,
      columns: EXPORT_COLUMNS,
      fileNamePrefix: "purchases_export",
      title: "Purchases Report",
    });
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
        id: toastId,
      });
    } finally {
      setShowDeleteModal(false);
      setPurchaseToDelete(null);
    }
  };

  // Bulk Actions
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
        itemIds.map((id) => API.put(`/purchases/${id}`, { [field]: value })),
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
        options: statusOptions,
      },
    ],
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

  const handlePageChange = (page) => {
    if (
      page >= 1 &&
      page <= pagination.totalPages &&
      page !== pagination.currentPage
    ) {
      setPagination((prev) => ({ ...prev, currentPage: page }));
    }
  };

  const handleLimitChange = (limit) => {
    setPagination((prev) => ({ ...prev, limit, currentPage: 1 }));
  };

  // ---------------------------------------------------------------------
  // Column model — same generic pin/reorder/visibility system as Companies.jsx
  // and PurchaseOrderPage.jsx, persisted per-module under the "purchases" key.
  // ---------------------------------------------------------------------
  const defaultColumns = useMemo(
    () => [
      {
        key: "purchaseNumber",
        label: "Purchase Number",
        visible: true,
        order: 0,
        required: true,
        sortable: true,
        sortKey: "purchaseNumber",
      },
      {
        key: "vendor",
        label: "Vendor",
        visible: true,
        order: 1,
        sortable: true,
        sortKey: "vendor.name",
      },
      {
        key: "grandTotal",
        label: "Amount",
        visible: true,
        order: 2,
        sortable: true,
        sortKey: "totalAmount",
      },
      {
        key: "status",
        label: "Status",
        visible: true,
        order: 3,
        sortable: true,
        sortKey: "status",
      },
      {
        key: "createdAt",
        label: "Date",
        visible: true,
        order: 4,
        sortable: true,
        sortKey: "createdAt",
      },
    ],
    [],
  );

  const { columns, saveColumns, getVisibleColumns } = useColumnSettings(
    "purchases",
    defaultColumns,
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const visibleColumns = useMemo(() => getVisibleColumns(), [columns]);

  const getFieldValue = (p, key) => {
    if (key === "purchaseNumber") return p.purchaseNumber || "";
    if (key === "vendor") return p.vendor?.name || "";
    if (key === "grandTotal")
      return `₹${(p.grandTotal ?? 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
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
      const previewRows = purchases.map((p) => getFieldValue(p, colId) || "—");
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
    const newColumns = sorted
      .map((c) => (c.visible ? reorderedVisible[visibleCursor++] : c))
      .map((c, idx) => ({ ...c, order: idx }));

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
    return (
      <div className="relative flex items-center justify-center flex-shrink-0" ref={isOpen ? rowActionsRef : null} onClick={(e) => e.stopPropagation()}>
        <button
          title="More actions"
          onClick={(e) => {
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
          }}
          className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <MoreIcon className="w-4 h-4" />
        </button>
        {isOpen && rowActionsPos && createPortal(
          <>
            <div className="fixed inset-0 z-[100050]" onClick={closeRowMenu} />
            <div
              key={p._id}
              style={{ position: "fixed", top: rowActionsPos.top, left: rowActionsPos.left }}
              className="w-[160px] z-[100051] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5 max-h-[70vh] overflow-y-auto"
            >
              <>
                  <button
                    onClick={() => { closeRowMenu(); handleView(p); }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                  >
                    <EyeIcon className="w-3.5 h-3.5 text-blue-600" />
                    View
                  </button>
                  <button
                    onClick={() => { closeRowMenu(); handleEdit(p); }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                  >
                    <EditIcon className="w-3.5 h-3.5 text-blue-600" />
                    Edit
                  </button>
                  <button
                    onClick={() => { closeRowMenu(); handleDownload(p); }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                  >
                    <DownloadIcon className="w-3.5 h-3.5 text-green-600" />
                    Download
                  </button>
                  <button
                    onClick={(e) => {
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
                  {p.status !== "Paid" && (
                    <button
                      onClick={(e) => {
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
                  {p.status !== "Cancelled" && p.status !== "Paid" && (
                    <button
                      onClick={() => { closeRowMenu(); handleRecordPayment(p); }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-blue-600 hover:bg-blue-50 whitespace-nowrap"
                    >
                      <IndianRupee className="w-3.5 h-3.5" />
                      Record Payment
                    </button>
                  )}
                  <div className="w-full border-t border-[#F1F1F5] my-0.5" />
                  <button
                    onClick={() => { closeRowMenu(); handleDelete(p._id); }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-red-600 hover:bg-red-50 whitespace-nowrap"
                  >
                    <DeleteIcon className="w-3.5 h-3.5" />
                    Delete
                  </button>
                </>
            </div>
          </>,
          document.body,
        )}
      </div>
    );
  };

  const tableColumns = useMemo(() => {
    const cols = [];

    // 1. Checkbox column
    cols.push(
      columnHelper.display({
        id: "selection",
        size: 60,
        enableResizing: false,
        header: () => (
          <div className="flex justify-center items-center w-full">
            <Checkbox checked={
                selectedPurchases.length === purchases.length &&
                purchases.length > 0
              } onChange={handleSelectAll}  uncheckedColor="text-[#525866]"/>
          </div>
        ),
        cell: ({ row }) => (
          <div className="flex justify-center items-center gap-1 w-full">
            <Checkbox checked={selectedPurchasesSet.has(row.original._id)} onChange={() => handleSelectPurchase(row.original._id)} />
          </div>
        ),
      }),
    );

    // 2. Dynamic data columns, ordered pinned-left -> unpinned -> pinned-right.
    const leftPinnedKeys = pinnedColumns.filter((p) => p.side === "left").map((p) => p.key);
    const rightPinnedKeys = pinnedColumns.filter((p) => p.side === "right").map((p) => p.key);
    const leftPinnedFields = visibleColumns.filter((vc) => leftPinnedKeys.includes(vc.key));
    const rightPinnedFields = visibleColumns.filter((vc) => rightPinnedKeys.includes(vc.key));
    const unpinnedFields = visibleColumns.filter(
      (vc) => !leftPinnedKeys.includes(vc.key) && !rightPinnedKeys.includes(vc.key),
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

            return (
              <div className="flex items-center justify-between w-full group">
                <span className="truncate flex-1 min-w-0 flex items-center gap-1.5" title={vc.label}>
                  <span className="truncate">{vc.label}</span>
                  {sortConfig.key === (vc.sortKey || vc.key) && (sortConfig.direction === "asc"
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
                          setOpenColumnMenuKey(null);
                          setColumnMenuPos(null);
                          pinSide === "left" ? unpinColumn(vc.key) : pinColumnToSide(vc.key, "left");
                        }}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${pinSide === "left" ? "bg-blue-50 text-blue-700" : "text-[#161618] hover:bg-gray-50"}`}
                      >
                        {pinSide === "left" ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5 text-[#1C1B1F]" />}
                        Pin to Left
                      </button>
                      <button
                        onClick={() => {
                          setOpenColumnMenuKey(null);
                          setColumnMenuPos(null);
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
                              setOpenColumnMenuKey(null);
                              setColumnMenuPos(null);
                              const key = vc.sortKey || vc.key;
                              const isActive = sortConfig.key === key && sortConfig.direction === "asc";
                              setSortConfig(isActive ? { key: null, direction: null } : { key, direction: "asc" });
                              setPagination((prev) => ({ ...prev, currentPage: 1 }));
                            }}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${sortConfig.key === (vc.sortKey || vc.key) && sortConfig.direction === "asc" ? "bg-blue-50 text-blue-700 font-medium" : "text-[#161618] hover:bg-gray-50"}`}
                          >
                            <ChevronUp className="w-3.5 h-3.5 text-[#1C1B1F]" />
                            Sort Ascending
                          </button>
                          <button
                            onClick={() => {
                              setOpenColumnMenuKey(null);
                              setColumnMenuPos(null);
                              const key = vc.sortKey || vc.key;
                              const isActive = sortConfig.key === key && sortConfig.direction === "desc";
                              setSortConfig(isActive ? { key: null, direction: null } : { key, direction: "desc" });
                              setPagination((prev) => ({ ...prev, currentPage: 1 }));
                            }}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${sortConfig.key === (vc.sortKey || vc.key) && sortConfig.direction === "desc" ? "bg-blue-50 text-blue-700 font-medium" : "text-[#161618] hover:bg-gray-50"}`}
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
                          setOpenColumnMenuKey(null);
                          setColumnMenuPos(null);
                          saveColumns(
                            columns.map((c) => (c.key === vc.key ? { ...c, visible: false } : c)),
                          );
                        }}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${vc.required
                          ? "text-gray-300 cursor-not-allowed"
                          : "text-[#161618] hover:bg-gray-50"
                          }`}
                      >
                        <EyeOff className={`w-3.5 h-3.5 ${vc.required ? "text-gray-300" : "text-[#1C1B1F]"}`} />
                        Hide Column
                      </button>
                    </div>
                  </>,
                  document.body,
                )}
              </div>
            );
          },
          cell: ({ row }) => {
            const p = row.original;
            let baseContent;

            if (vc.key === "purchaseNumber") {
              baseContent = (
                <div className="flex items-center min-w-0 flex-1 pr-4">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleView(p);
                    }}
                    className="text-[#0085FF] font-semibold hover:underline truncate transition-all duration-150 ease-out group-hover:text-[#004CFF] min-w-0 text-left"
                    title={p.purchaseNumber}
                  >
                    <HighlightText text={p.purchaseNumber || "N/A"} query={searchTerm} />
                  </button>
                </div>
              );
            } else if (vc.key === "vendor") {
              baseContent = (
                <div className="truncate text-sm font-semibold text-gray-900" title={p.vendor?.name}>
                  {p.vendor?.name ? <HighlightText text={p.vendor.name} query={searchTerm} /> : "—"}
                </div>
              );
            } else if (vc.key === "grandTotal") {
              baseContent = (
                <div className="truncate text-sm font-medium text-gray-700">
                  ₹{(p.grandTotal ?? 0).toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              );
            } else if (vc.key === "status") {
              baseContent = (
                <div className="flex items-center justify-start">
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${getStatusBadgeColor(p.status)}`}
                  >
                    {p.status}
                  </span>
                </div>
              );
            } else if (vc.key === "createdAt") {
              baseContent = (
                <div className="truncate text-sm text-gray-600">
                  {p.createdAt ? new Date(p.createdAt).toLocaleDateString("en-IN") : "—"}
                </div>
              );
            } else if (baseContent === undefined) {
              const val = p[vc.key];
              const truncated = truncateText(String(val ?? ""), 30);
              baseContent = (
                <div className="truncate text-sm text-gray-700 w-full" title={String(val ?? "")}>
                  {truncated && truncated !== "—" ? <HighlightText text={truncated} query={searchTerm} /> : "—"}
                </div>
              );
            }

            // The row's ⋮ menu is appended to
            // whichever column currently sits last — pin/drag can move that
            // around, same as Companies.jsx — instead of a separate fixed
            // column.
            const withHoverActions = baseContent;

            if (vc.key === lastColumnKey) {
              return (
                <div className="flex items-center justify-between w-full gap-2">
                  <div className="min-w-0 flex-1">{withHoverActions}</div>
                  {renderRowActionsMenu(p)}
                </div>
              );
            }
            return withHoverActions;
          },
        }),
      );
    });

    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    searchTerm,
  ]);

  // Client-side advanced filter — applied on top of the server-fetched page so
  // no backend changes are needed; large datasets are still paginated server-side.
  const filteredPurchases = useMemo(() => {
    if (!activeFilters || activeFilters.length === 0) return purchases;
    return purchases.filter((row) =>
      activeFilters.every((f) => {
        let rawVal;
        if (f.column === "vendor") {
          rawVal = typeof row.vendor === "object"
            ? (row.vendor?.name || "")
            : (row.vendor || "");
        } else {
          rawVal = row[f.column];
        }
        const val = String(rawVal ?? "").toLowerCase().trim();
        const filterVal = String(f.value ?? "").toLowerCase().trim();
        switch (f.operator) {
          case "contains": return val.includes(filterVal);
          case "not_contains": return !val.includes(filterVal);
          case "is": return val === filterVal;
          case "is_not": return val !== filterVal;
          case "in": return filterVal.split(",").map((s) => s.trim()).some((s) => val === s);
          case "not_in": return !filterVal.split(",").map((s) => s.trim()).some((s) => val === s);
          case "is_empty": return val === "" || rawVal == null;
          case "is_not_empty": return val !== "" && rawVal != null;
          default: return true;
        }
      }),
    );
  }, [purchases, activeFilters]);

  const table = useReactTable({
    data: filteredPurchases,
    columns: tableColumns,
    state: { columnSizing },
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: "onChange",
    enableColumnResizing: true,
  });

  const PaginationControls = () => {
    const {
      currentPage,
      totalPages,
      totalCount,
      limit,
      hasNextPage,
      hasPrevPage,
    } = pagination;
    if (totalCount === 0) return null;

    const startItem = (currentPage - 1) * limit + 1;
    const endItem = Math.min(currentPage * limit, totalCount);

    return (
      <div className="flex items-center justify-between w-full px-4 sm:px-6 lg:px-8">
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
            <div className="relative ml-2">
              <select
                value={limit}
                onChange={(e) => handleLimitChange(parseInt(e.target.value))}
                className="appearance-none border border-gray-300 rounded-lg pl-3 pr-8 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer font-inter"
              >
                <option value={10}>10 per page</option>
                <option value={20}>20 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
                <option value={150}>150 per page</option>
              </select>
              <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={!hasPrevPage}
              className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            {/* first ... current ... last — same pattern as Companies.jsx, with
                double-click-to-type a page number on the current-page pill. */}
            {(() => {
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
                  return (
                    <span
                      key={`${item}-${index}`}
                      className="flex items-center justify-center w-8 h-8 text-sm font-medium text-gray-400 select-none"
                    >
                      ....
                    </span>
                  );
                }
                const isCurrent = item === currentPage;
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
                        setPageInput(String(currentPage));
                        setEditingPage(true);
                      }
                    }}
                    title={isCurrent ? "Double-click to type a page number" : undefined}
                    className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors ${isCurrent
                      ? "bg-blue-600 text-white"
                      : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                      }`}
                  >
                    {item}
                  </button>
                );
              });
            })()}

            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={!hasNextPage}
              className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="-mt-6 -mx-4 sm:-mx-6 lg:-mx-8 pt-4">
      <AppToaster />

      <VideoTutorialModal
        isOpen={showVideoTutorial}
        onClose={() => setShowVideoTutorial(false)}
        videoId={getVideoTutorial("purchases")?.videoId}
        title={getVideoTutorial("purchases")?.title}
      />

      <ColumnSettingsPanel
        isOpen={showColumnSettings}
        onClose={() => setShowColumnSettings(false)}
        columns={columns}
        onSave={saveColumns}
        moduleName="Purchases"
      />

      <ImportPurchases
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onImportSuccess={() => {
          fetchPurchases();
          toast.success("Purchases imported successfully");
        }}
      />

      {/* Form & Preview */}
      {showForm && (
        <PurchaseForm
          editingPurchase={editingPurchase}
          vendors={vendors}
          initialPurchaseOrderId={!editingPurchase ? initialConvertPOId : null}
          onRequestClose={() => {
            setShowForm(false);
            setEditingPurchase(null);
          }}
          onSuccess={handleSuccess}
          onError={(msg) => toast.error(msg)}
        />
      )}

      {showPreview && (
        <PurchasePreview
          purchase={selectedPurchase}
          isOpen={showPreview}
          onClose={() => setShowPreview(false)}
          onEdit={() => {
            setShowPreview(false);
            handleEdit(selectedPurchase);
          }}
          onDelete={() => {
            setShowPreview(false);
            handleDelete(selectedPurchase._id);
          }}
          onRecordPayment={() => {
            setShowPreview(false);
            handleRecordPayment(selectedPurchase);
          }}
        />
      )}

      {showPaymentModal && (
        <RecordPurchasePaymentModal
          isOpen={showPaymentModal}
          purchase={purchaseToPay}
          onClose={() => {
            setShowPaymentModal(false);
            setPurchaseToPay(null);
          }}
          onSuccess={() => {
            fetchPurchases();
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10000] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <DeleteIcon className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2 font-sf">
                Delete Purchase
              </h3>
              <p className="text-sm text-gray-500 font-inter mb-6">
                Are you sure you want to delete this purchase? This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setPurchaseToDelete(null);
                  }}
                  className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-5 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors shadow-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Card */}
      <div className="bg-white overflow-visible">
        {/* Toolbar (Title + Search + Buttons) */}
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
                  onClick={() => handleBulkDelete(selectedPurchases)}
                  disabled={bulkLoading}
                  className="h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 disabled:opacity-50 flex-shrink-0 whitespace-nowrap"
                >
                  <DeleteIcon className="w-4 h-4 text-red-600" />
                  Delete
                </button>
                <button
                  onClick={exitSelectionMode}
                  className="h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium rounded-r-[25px] hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </button>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <CheckSquare className="w-5 h-5 text-blue-600 flex-shrink-0" />
                <span className="text-blue-800 font-semibold font-inter whitespace-nowrap">
                  {selectedPurchases.length} purchase{selectedPurchases.length !== 1 ? "s" : ""} selected
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
            <div className="flex items-center gap-2 lg:gap-4 w-full h-full">
              <div
                className={`flex-shrink-0 flex flex-col justify-center gap-1.5 overflow-hidden transition-opacity duration-300 ease-in-out lg:!w-auto lg:!opacity-100 ${isSearchExpanded ? "w-0 opacity-0" : "w-[190px] opacity-100"}`}
              >
                {showLoadingSkeleton ? (
                  <>
                    <Skeleton width={110} height={18} />
                    <Skeleton width={170} height={12} />
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <h1 className="m-0 leading-tight font-bold text-base sm:text-lg text-gray-900 truncate">Purchases</h1>
                      
                    </div>
                    <p className="m-0 leading-tight text-[10px] sm:text-xs text-gray-500 font-inter truncate">
                      Manage bills received from vendors
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
                        onBlur={() => {
                          if (!searchTerm) setIsSearchExpanded(false);
                        }}
                        className={`w-full h-full pl-9 pr-9 bg-transparent text-sm focus:outline-none transition-opacity duration-200 font-inter cursor-pointer ${isSearchExpanded ? "opacity-100 focus:cursor-text" : "opacity-0"}`}
                        placeholder="Search by vendor or purchase number..."
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

                  {/* Actions Group */}
                  <div className="relative flex items-center gap-2 lg:gap-4 flex-shrink-0">
                    {/* Advanced filter button — opens AdvancedFilterPanel slide-in panel */}
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

                {/* Overflow menu: filter on mobile, Import, Export, Columns, Video Tutorial */}
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
                        onClick={() => {
                          setShowAdvancedFilters(true);
                          setIsMoreMenuOpen(false);
                        }}
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
                      
                    </div>
                  )}
                </div>

                <button
                  onClick={() => {
                    setEditingPurchase(null);
                    setShowForm(true);
                  }}
                  className="inline-flex items-center justify-center gap-2 h-10 w-10 lg:w-auto px-0 lg:px-4 bg-[#0085FF] text-white text-sm font-medium rounded-full hover:bg-blue-600 focus:outline-none cursor-pointer transition-colors flex-shrink-0"
                  title="New Purchase"
                >
                  <PlusIcon className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden lg:inline">New Purchase</span>
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
            paddingLeft: "var(--content-inset, 16px)",
            right: 0,
            bottom: !showLoadingSkeleton ? 64 : 0,
          }}
        >
          <div className={`relative bg-white border-r border-[#E1E4EA] ${showLoadingSkeleton || purchases.length > 0 ? "border-b" : ""}`}>
            <table
              className="w-full border-separate border-spacing-0 text-left"
              style={{
                minWidth: `${table.getTotalSize()}px`,
                tableLayout: "fixed",
              }}
            >
              {(() => {
                const leftPinnedKeys = pinnedColumns.filter((p) => p.side === "left").map((p) => p.key);
                const rightPinnedKeys = pinnedColumns.filter((p) => p.side === "right").map((p) => p.key);
                const allHeaders = table.getHeaderGroups()[0]?.headers || [];
                const leftPinnedInOrder = allHeaders
                  .map((h) => h.column.id)
                  .filter((id) => leftPinnedKeys.includes(id));
                const rightPinnedInOrder = allHeaders
                  .map((h) => h.column.id)
                  .filter((id) => rightPinnedKeys.includes(id));
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
                                  {flexRender(
                                    header.column.columnDef.header,
                                    header.getContext(),
                                  )}
                                </div>
                                {boundaryShadowSide && (
                                  <div style={getPinnedBoundaryOverlayStyle(boundaryShadowSide)} />
                                )}

                                {colId !== "selection" && header.column.getCanResize() && (
                                  <div
                                    data-resize-handle="true"
                                    onMouseDown={(e) => {
                                      e.stopPropagation();
                                      header.getResizeHandler()(e);
                                    }}
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
                        <TableSkeletonRows
                          numRows={pagination.limit}
                          columns={table.getVisibleLeafColumns().filter((c) => c.id !== "selection")}
                          hasCheckbox
                        />
                      ) : purchases.length === 0 ? (
                        <tr>
                          <td colSpan={table.getAllColumns().length}>
                            <EmptyState
                              icon={ShoppingCart}
                              noun="Purchase"
                              isFiltered={!!(searchTerm || activeFilters?.length)}
                              onCreate={() => {
                                setEditingPurchase(null);
                                setShowForm(true);
                              }}
                            />
                          </td>
                        </tr>
                      ) : (
                        table.getRowModel().rows.map((row) => (
                          <tr
                            key={row.id}
                            className={`bg-white hover:bg-blue-50 transition-colors ${selectedPurchasesSet.has(row.original._id) ? "!bg-blue-50" : ""}`}
                            style={{ height: 37, maxHeight: 37 }}
                          >
                            {row.getVisibleCells().map((cell) => {
                              const colId = cell.column.id;
                              const isLeftSticky = colId === "selection" || leftPinnedKeys.includes(colId);
                              const isRightSticky = rightPinnedKeys.includes(colId);
                              const isSticky = isLeftSticky || isRightSticky;
                              const isLeftBoundary = colId === lastLeftPinnedKey;
                              const isRightBoundary = colId === firstRightPinnedKey;
                              const cellBoundaryShadowSide = isLeftBoundary ? "left" : isRightBoundary ? "right" : null;
                              const isColDragging = draggedColKey === colId;

                              return (
                                <td
                                  key={cell.id}
                                  style={{
                                    width: cell.column.getSize(),
                                    height: "37px",
                                    maxHeight: "37px",
                                    boxSizing: "border-box",
                                    position: isSticky ? "sticky" : "static",
                                    left: isLeftSticky ? pinnedLeftOffsets[colId] ?? 0 : "auto",
                                    right: isRightSticky ? pinnedRightOffsets[colId] ?? 0 : "auto",
                                    zIndex: isSticky ? 10 : 1,
                                  }}
                                  className="px-4 py-2 align-middle text-sm text-[#1C1B1F] bg-inherit border-r border-b border-[#E1E4EA] last:border-r-0"
                                >
                                  <div style={{ opacity: isColDragging ? 0.35 : 1, overflow: "hidden" }}>
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
            <div className="px-4 py-3 bg-[#F5F7FA] border-b border-[#E1E4EA]" style={{ height: dragGhost.height }}>
              <span className="text-sm font-bold text-[#525866] truncate block">{dragGhost.label}</span>
            </div>
            {dragGhost.previewRows.map((rowVal, i) => (
              <div key={i} className="px-4 py-2 border-b border-[#F1F1F5] last:border-b-0">
                <span className="text-sm text-gray-700 truncate block">{rowVal}</span>
              </div>
            ))}
          </div>,
          document.body,
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
            <PaginationControls />
          </div>
        )}
      </div>

      <BulkActions
        isOpen={showBulkActions}
        onClose={() => setShowBulkActions(false)}
        selectedItems={purchases.filter((p) =>
          selectedPurchases.includes(p._id),
        )}
        onBulkUpdate={handleBulkUpdate}
        onBulkDelete={handleBulkDelete}
        fieldConfig={purchaseFieldConfig}
        module="purchases"
        loading={bulkLoading}
      />

      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        columns={exportColumns}
        selectedIds={selectedPurchases}
        exportUrl="/purchases/export-selected"
        fileName="Exported_Purchases.csv"
      />

      <AdvancedFilterPanel
        isOpen={showAdvancedFilters}
        onClose={() => setShowAdvancedFilters(false)}
        columns={purchaseFilterColumns}
        filters={activeFilters}
        setFilters={setActiveFilters}
        onApply={(newFilters) => setActiveFilters(newFilters)}
        title="Filter Purchases"
        subtitle="Find specific purchases quickly"
        emptyStateText="Add a rule to narrow down your purchase list."
      />

      {shareMenu && createPortal(
        <>
          <div className="fixed inset-0 z-[100060]" onClick={() => { setShareMenu(null); setShareMenuChannel(null); }} />
          <div
            className="fixed z-[100061] w-[160px] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5"
            style={{ top: shareMenu.y, left: shareMenu.x }}
          >
            {(() => {
              const link = `${window.location.origin}/view/purchase/${shareMenu.doc._id}`;
              const num = shareMenu.doc.purchaseNumber;
              const d = shareMenu.doc;
              const customerName = d.vendor?.name || "Vendor";
              const amt = d.grandTotal != null ? `₹${Number(d.grandTotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "";
              const closeMenu = () => { setShareMenu(null); setShareMenuChannel(null); };
              const fillTpl = (tpl) => tpl
                .replace(/{customerName}/g, customerName)
                .replace(/{docType}/g, "Purchase")
                .replace(/{number}/g, num || "")
                .replace(/{amount}/g, amt)
                .replace(/{link}/g, link)
                .replace(/{company}/g, shareCompanyName || "");

              const buildWaMsg = (tpl) => `Hello ${customerName || ""},\n\n${tpl?.line1 || `Your Purchase Bill from ${shareCompanyName || "us"} is ready.`}\n\nDocument: ${num || "n/a"}\nTotal: ${amt}\nView/download: ${link}${tpl?.line2 ? `\n\n${tpl.line2}` : ""}\n\nRegards,\n${shareCompanyName || "the sender"}`;
              const buildSmsMsg = (tpl) => tpl?.body
                ? fillTpl(tpl.body)
                : `${shareCompanyName || "We"}: your Purchase Bill${num ? ` ${num}` : ""} is ready. View/download: ${link}`;
              const buildEmailSubject = (tpl) => tpl?.subject ? fillTpl(tpl.subject) : `Purchase Bill ${num || ""}${shareCompanyName ? ` from ${shareCompanyName}` : ""}`.trim();
              const buildEmailBody = (tpl) => tpl?.body
                ? fillTpl(tpl.body)
                : `Dear ${customerName || "Sir/Madam"},\n\nPlease find attached your Purchase Bill${num ? ` ${num}` : ""}.\n\nYou can also view or download it online:\n${link}\n\nRegards,\n${shareCompanyName || "the sender"}`;

              const channels = {
                whatsapp: {
                  list: waTemplatesList,
                  send: (tpl) => { window.open(`https://wa.me/?text=${encodeURIComponent(buildWaMsg(tpl))}`, "_blank"); closeMenu(); },
                },
                email: {
                  list: emailTemplatesList,
                  send: (tpl) => {
                    setEmailComposeTo(d.vendor?.email || "");
                    setEmailComposeSubject(buildEmailSubject(tpl));
                    setEmailComposeBody(textToEmailHtml(buildEmailBody(tpl)));
                    setEmailCompose({ doc: d });
                    closeMenu();
                  },
                },
                sms: {
                  list: smsTemplatesList,
                  send: (tpl) => {
                    setSmsComposeTo(d.vendor?.phone || "");
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
      {statusMenu && createPortal(
        <>
          <div className="fixed inset-0 z-[100060]" onClick={() => setStatusMenu(null)} />
          <div
            className="fixed z-[100061] w-[160px] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5"
            style={{ top: statusMenu.y, left: statusMenu.x }}
          >
            {statusOptions.map((st) => (
              <button
                key={st}
                onClick={(e) => {
                  e.stopPropagation();
                  updateSingleStatus(statusMenu.doc._id, st);
                  setStatusMenu(null);
                  setOpenRowActionsId(null);
                  setRowActionsPos(null);
                }}
                className={`w-full text-left px-2 py-1.5 rounded-md text-xs whitespace-nowrap ${statusMenu.doc.status === st ? "bg-blue-50 text-blue-600 font-medium" : "text-[#161618] hover:bg-gray-50"}`}
              >
                {st}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
      {emailCompose && (() => {
        const dname = "Purchase";
        const dnum = emailCompose.doc.purchaseNumber;
        const link = `${window.location.origin}/view/purchase/${emailCompose.doc._id}`;
        const cname = emailCompose.doc.vendor?.name || "Vendor";
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
            await API.post(`/public/purchase/${emailCompose.doc._id}/email`, {
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
                  <p className="text-xs text-gray-400">Purchase #{smsCompose.doc.purchaseNumber}</p>
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
                    await API.post(`/public/purchase/${smsCompose.doc._id}/sms`, {
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
    </div>
  );
};

export default PurchasePage;
