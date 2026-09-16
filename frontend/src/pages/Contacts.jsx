import DeleteIcon from "../components/common/DeleteIcon";
import BulkDeleteModal from "../components/common/BulkDeleteModal";
import { exportRecordsToCSV } from "../utils/exportRecordsToCSV";
import PdfIcon from "../components/common/PdfIcon";
import VideoIcon from "../components/common/VideoIcon";
import Checkbox from "../components/common/Checkbox";
import CellphoneIcon from "../components/common/CellphoneIcon";
import PlusIcon from "../components/common/PlusIcon";
import MoreIcon from "../components/common/MoreIcon";
import HotlistIcon from "../components/common/HotlistIcon";
import DownloadIcon from "../components/common/DownloadIcon";
import React, { useEffect, useLayoutEffect, useState, useMemo, useRef } from "react";
import useSearchOverlayOpen from "../hooks/useSearchOverlayOpen";
import TableSkeletonRows from "../components/common/TableSkeletonRows";
import { useTopLoadingSignal } from "../components/common/TopLoadingBar";
import { createPortal } from "react-dom";
import logo from "/DataCircles.png";
import FilterIcon from "../components/common/FilterIcon";
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Users,
  Building2,
  Mail,
  User,
  RefreshCw,
  CheckSquare,
  X,
  Target,
  TrendingUp,
  AlertCircle,
  Sparkles,
  BarChart2,
  Briefcase,
  FolderPlus,
  StickyNote,
  EyeOff,
  Pin,
  PinOff,
  List,
  ArrowUp, ArrowDown } from "lucide-react";
import StarIcon from "../components/common/StarIcon";
import EmptyState from "../components/common/EmptyState";
import API from "../services/api";
import ContactFolder from "../components/contact/ContactFolder";
import ProfilePicture from "../components/contact/ProfilePicture";
import BulkActions from "../components/BulkActions";
import { Link, useNavigate } from "react-router-dom";
import QuickContactForm from "../components/contact/QuickContactForm";
import { useLocation } from "react-router-dom";
import CallLogForm from "../components/contact/CallLogForm";
import ImportContacts from "../components/contact/ImportContacts";
import KanbanBoard from "../components/contact/KanbanBoard";
import toast from "react-hot-toast";
import VideoTutorialButton from "../components/VideoTutorialButton";
import VideoTutorialModal from "../components/VideoTutorialModal";
import { getVideoTutorial } from "../utils/videoTutorials";
import { getPinnedBoundaryOverlayStyle } from "../utils/pinnedColumnShadow";
import ColumnSettingsPanel from "../components/ColumnSettingsPanel";
import { useColumnSettings } from "../hooks/useColumnSettings";
import {
  lifecycleStageOptions,
  allLifecycleStages,
  allStageStatuses,
  getLifecycleStageForStatus,
  getBadgeColor,
} from "../utils/contactConstants";
import StatusDropdown from "../components/contact/StatusDropdown";
import ContactStatusModal from "../components/contact/ContactStatusModal";
import AdvancedFilterPanel from "../components/common/AdvancedFilterPanel";
import useContactStore from "../store/useContactStore";
import AddToContactHotlistModal from "../components/contact/AddToContactHotlistModal";
import ExportModal from "../components/common/ExportModal";
import { NoteEditor } from "../components/contact/NoteSection";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import ContactQuickView from "../components/contact/ContactQuickView";
import AppToaster from "../components/AppToaster";
import { useSubscription } from "../contexts/SubscriptionContext";
import { hasMinPlan } from "../utils/subscriptionHelpers";
import UpgradeRequiredModal from "../components/subscription/UpgradeRequiredModal";

import SearchIcon from "../components/common/SearchIcon";
import SettingsIcon from "../components/common/SettingsIcon";
import TableViewIcon from "../components/common/TableViewIcon";
import KanbanViewIcon from "../components/common/KanbanViewIcon";
import UploadIcon from "../components/common/UploadIcon";
import EyeIcon from "../components/common/EyeIcon";
import EditIcon from "../components/common/EditIcon";
// Custom hook to detect mobile screen
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkIsMobile();
    window.addEventListener("resize", checkIsMobile);

    return () => window.removeEventListener("resize", checkIsMobile);
  }, []);

  return isMobile;
};

// The app renders inside #root which carries a CSS `zoom` (0.75 on desktop).
// getBoundingClientRect() returns UNSCALED layout coordinates while portal overlays on
// document.body render in visual space, so rect-derived positions must be multiplied by
// this zoom factor to line up on screen.
const getRootZoom = () => {
  if (typeof window === "undefined") return 1;
  const z = parseFloat(getComputedStyle(document.documentElement).zoom);
  return z && !Number.isNaN(z) ? z : 1;
};

// Effective zoom applied to an element's ancestor chain. Used to correct
// coordinates SET on a document.body portal (the drag-ghost), which is painted
// inside the dynamic <html> zoom, back into the visual space of clientX/getBoundingClientRect.
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

const CONTACT_TABS = [
  { id: "All", label: "All Contacts" },
  { id: "Leads", label: "Leads" },
  { id: "Sales Qualified Lead", label: "Sales Qualified Lead" },
  { id: "Customers", label: "Customers" },
];

function Contacts() {
  const isSearchOverlayOpen = useSearchOverlayOpen();
  const [contacts, setContacts] = useState([]);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    lifecycleStage: "Lead",
    stageStatus: "New",
    company: "",
    avatar: "",
    socialMedia: {
      twitter: "",
      linkedin: "",
      facebook: "",
    },
  });
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  // Skeleton rows only on a genuinely empty table (first load / after a filter
  // wipes results) — never while paging, so existing rows stay put.
  const showLoadingSkeleton = loading && contacts.length === 0;
  // Signal the top progress bar on EVERY fetch, not just the skeleton case.
  // Paging is server-side here, so page 2 -> 3 has a real network round trip;
  // the thin top bar is what communicates that now, instead of dimming the
  // whole table (see the table container below).
  useTopLoadingSignal(loading);
  const [contactFieldList, setContactFieldList] = useState([]);
  const [additionalValues, setAdditionalValues] = useState({});
  const [permission, setPermission] = useState("");
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [openRowActionsId, setOpenRowActionsId] = useState(null);
  const [rowActionsPos, setRowActionsPos] = useState(null);
  // Contact whose lifecycle is being edited via the row menu's Change Status.
  const [statusModalContact, setStatusModalContact] = useState(null);
  const rowActionsRef = useRef(null);
  const [editingPage, setEditingPage] = useState(false);
  const [pageInput, setPageInput] = useState("");
  const [showBulkActions, setShowBulkActions] = useState(false);
  // Bulk row selection requires Growth+
  const { subscription } = useSubscription();
  const hasBulkAccess = hasMinPlan(subscription?.subscription?.planName, "growth");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [editContact, setEditContact] = useState(null);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const location = useLocation();
  const { state } = location;
  const user = JSON.parse(localStorage.getItem("user"));
  const navigate = useNavigate();

  // "View all" from the global search panel hands its query off via
  // `?search=` rather than trying to replicate the search itself — this
  // drops it straight into the table's own search box on arrival (open, not
  // just filled in), so the list is already filtered instead of showing
  // everything.
  //
  // Captured once, synchronously: the mount-time fetch effect further down
  // needs to know *before its first run* that a search is coming, so it can
  // skip its own empty-search request. Without that, two fetches land almost
  // together — "" (every contact) and the real query — and the empty one,
  // fetching the whole table, is inherently slower and can arrive second,
  // clobbering the correctly-filtered result already on screen.
  const initialSearchFromUrl = useRef(
    new URLSearchParams(location.search).get("search")
  ).current;
  useEffect(() => {
    if (initialSearchFromUrl) {
      setSearchTerm(initialSearchFromUrl);
      setIsSearchExpanded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [showImport, setShowImport] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef(null);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);

  // Sliding pill for the lifecycle tabs: the white "thumb" is one element that
  // animates to the active tab's box, instead of the highlight blinking from
  // one button to the next.
  const tabRefs = useRef({});
  const tabNavRef = useRef(null);
  const [tabThumb, setTabThumb] = useState({ left: 0, width: 0, ready: false });

  const searchInputRef = useRef(null);

  useEffect(() => {
    const handleClickOutsideMoreMenu = (event) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target)) {
        setIsMoreMenuOpen(false);
      }
      if (rowActionsRef.current && !rowActionsRef.current.contains(event.target)) {
        setOpenRowActionsId(null);
      }
      if (columnMenuRef.current && !columnMenuRef.current.contains(event.target)) {
        setOpenColumnMenuKey(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutsideMoreMenu);
    return () => document.removeEventListener("mousedown", handleClickOutsideMoreMenu);
  }, []);
  const isMobile = useIsMobile();
  const [showKanban, setShowKanban] = useState(false);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [folders, setFolders] = useState([]);
  const [contactToAddToFolder, setContactToAddToFolder] = useState(null);
  const [showAddToFolderModal, setShowAddToFolderModal] = useState(false);
  const [showAddToHotlistModal, setShowAddToHotlistModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);

  const [showBulkNoteModal, setShowBulkNoteModal] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [bulkNoteLoading, setBulkNoteLoading] = useState(false);

  // Video Tutorial State
  const [showVideoTutorial, setShowVideoTutorial] = useState(false);

  // Status Dropdown State
  const [openDropdownId, setOpenDropdownId] = useState(null);

  const [quickViewContactId, setQuickViewContactId] = useState(null);

  // Advanced Filter state
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const [columnSizing, setColumnSizing] = useState({});

  const [contactColWidths, setContactColWidths] = useState({
    name: 235,
    company: 207,
    email: 288,
    phone: 196,
    status: 198,
    actions: 152,
  });

  const handleContactColResizeStart = (key) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = contactColWidths[key];
    const onMouseMove = (moveEvent) => {
      const delta = moveEvent.clientX - startX;
      setContactColWidths((prev) => ({
        ...prev,
        [key]: Math.max(80, startWidth + delta),
      }));
    };
    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const [pinnedColumns, setPinnedColumns] = useState([]); // [{ key, side: 'left' | 'right' }]

  const pinColumnToSide = (colKey, side) => {
    setPinnedColumns((prev) => [...prev.filter((p) => p.key !== colKey), { key: colKey, side }]);
  };

  const unpinColumn = (colKey) => {
    setPinnedColumns((prev) => prev.filter((p) => p.key !== colKey));
  };

  const getColumnPinSide = (colKey) => pinnedColumns.find((p) => p.key === colKey)?.side || null;

  const [openColumnMenuKey, setOpenColumnMenuKey] = useState(null);
  const [columnMenuPos, setColumnMenuPos] = useState(null);
  const columnMenuRef = useRef(null);
  const tableScrollRef = useRef(null);

  // Close any open portal menu on scroll instead of locking the page in place —
  // the background stays freely scrollable, and the menu just disappears since
  // its position was only computed once, on open, and won't track the scroll.
  useEffect(() => {
    if (!openRowActionsId && !openColumnMenuKey) return;
    const closeMenus = () => {
      setOpenRowActionsId(null);
      setRowActionsPos(null);
      setOpenColumnMenuKey(null);
      setColumnMenuPos(null);
    };
    window.addEventListener("scroll", closeMenus, { passive: true, capture: true });
    window.addEventListener("wheel", closeMenus, { passive: true });
    return () => {
      window.removeEventListener("scroll", closeMenus, { capture: true });
      window.removeEventListener("wheel", closeMenus);
    };
  }, [openRowActionsId, openColumnMenuKey]);

  const [draggedColKey, setDraggedColKey] = useState(null);
  const [dragOverColKey, setDragOverColKey] = useState(null);
  const [dragGhost, setDragGhost] = useState(null);
  const dragOverRef = useRef(null);
  const ghostElRef = useRef(null);

  const startColumnDrag = (e, colId) => {
    if (e.button !== 0) return;
    if (e.target.closest("button") || e.target.closest("[data-resize-handle]")) return;

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
      const label = visibleColumns.find((vc) => vc.key === colId)?.label || colId;
      const previewRows = (sortedContacts || [])
        .map((c) => String(getFieldValue(c, colId) ?? "").trim() || "—");
      // Grab offset is measured in visual space (rect + clientX both visual) — no
      // correction. `zGhost` scales the values we SET on the body-portal ghost so
      // they map back to visual space (the ghost is painted inside the <html> zoom).
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

  const toggleStar = async (e, contactId) => {
    e.stopPropagation();
    try {
      await API.post(`/contacts/${contactId}/star`);
      if (pagination.currentPage === 1) {
        fetchData();
      } else {
        setPagination((prev) => ({ ...prev, currentPage: 1 }));
      }
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to update star");
    }
  };

  const {
    searchTerm,
    setSearchTerm,
    activeTab,
    setActiveTab,
    statusFilter,
    setStatusFilter,
    activeFilters,
    setActiveFilters,
    pagination,
    setPagination,
    sortConfig,
    setSortConfig,
    setCurrentContactIds,
  } = useContactStore();

  useLayoutEffect(() => {
    const measure = () => {
      const nav = tabNavRef.current;
      const btn = tabRefs.current[activeTab];
      if (!nav || !btn) return;
      setTabThumb({
        left: btn.offsetLeft - nav.scrollLeft,
        width: btn.offsetWidth,
        ready: true,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    const nav = tabNavRef.current;
    nav?.addEventListener("scroll", measure);
    return () => {
      window.removeEventListener("resize", measure);
      nav?.removeEventListener("scroll", measure);
    };
  }, [activeTab]);

  const fetchFolders = async () => {
    try {
      const res = await API.get("/contact-folders/");
      setFolders(res.data);
    } catch (error) {
      console.error("Failed to fetch folders", error);
      toast.error("Failed to load folders");
    }
  };

  const openAddToFolderModal = (contact) => {
    setContactToAddToFolder(contact);
    setShowAddToFolderModal(true);
    fetchFolders();
  };

  const addContactToFolder = async (folder) => {
    const loadingToast = toast.loading("Adding contact to folder...");
    try {
      // Check if contact is already in folder
      const currentContactIds = folder.contacts?.map((c) => c._id) || [];
      if (currentContactIds.includes(contactToAddToFolder._id)) {
        toast.error("Contact is already in this folder", { id: loadingToast });
        return;
      }

      await API.put(`/contact-folders/${folder._id}`, {
        contacts: [...currentContactIds, contactToAddToFolder._id],
      });

      toast.success("Contact added to folder", { id: loadingToast });
      setShowAddToFolderModal(false);
      setContactToAddToFolder(null);
    } catch (error) {
      console.error("Failed to add contact to folder", error);
      if (error.response?.status === 402) {
        toast.error(error.response?.data?.message || "An active subscription is required to make changes.", { id: loadingToast });
      } else {
        toast.error(error.response?.data?.error || "Failed to add contact to folder", { id: loadingToast });
      }
    }
  };

  // Selection mode state
  const [selectionMode, setSelectionMode] = useState(true);
  const [longPressTimer, setLongPressTimer] = useState(null);

  // Delays the bulk-strip's unmount so it can play a slide-out-right exit
  // animation on deselect (mirroring the slide-in entrance).
  const [showBulkStrip, setShowBulkStrip] = useState(false);
  const [bulkStripClosing, setBulkStripClosing] = useState(false);
  useEffect(() => {
    const active = selectionMode && selectedContacts.length > 0;
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
  }, [selectionMode, selectedContacts.length]);

  //Pinning rows
  const [pinnedIds, setPinnedIds] = useState(() => {
    const saved = localStorage.getItem("pinned_companies");
    return saved ? JSON.parse(saved) : [];
  });

  // Sync pins to local storage so they persist on refresh
  useEffect(() => {
    localStorage.setItem("pinned_companies", JSON.stringify(pinnedIds));
  }, [pinnedIds]);

  //function to toggle pinning
  const togglePin = (e, companyId) => {
    e.stopPropagation(); // Prevents triggering row selection or navigation
    setPinnedIds((prev) =>
      prev.includes(companyId)
        ? prev.filter((id) => id !== companyId) // Unpin
        : [companyId, ...prev] // Pin (adds to start of list)
    );
    toast.success(pinnedIds.includes(companyId) ? "Unpinned" : "Pinned to top");
  };

  // Pagination state

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [contactToDelete, setContactToDelete] = useState(null);

  const defaultColumns = useMemo(() => {
    const baseColumns = [
      {
        key: "name",
        label: "Name",
        visible: true,
        order: 0,
        required: true,
        defaultVisible: true,
        sortable: true,
        icon: User,
      },
      {
        key: "company",
        label: "Company",
        visible: true,
        order: 1,
        sortable: true,
        icon: Building2,
      },
      {
        key: "status",
        label: "Status",
        visible: true,
        order: 2,
        icon: Target,
      },
      {
        key: "email",
        label: "Email",
        visible: true,
        order: 3,
        sortable: true,
        icon: Mail,
      },
      {
        key: "phone",
        label: "Phone",
        visible: true,
        order: 4,
        sortable: true,
        icon: CellphoneIcon,
      },
    ];

    // Add custom fields ONLY if they exist
    if (contactFieldList && contactFieldList.length > 0) {
      const customColumns = contactFieldList.map((field, index) => ({
        key: field.name || field,
        label: field.name || field,
        visible: false, // Hidden by default - user can show them
        order: baseColumns.length + index,
        isCustomField: true,
        type: field.type || "text",
        options: field.options,
        description: `Custom field: ${field.name || field}`,
      }));

      return [...baseColumns, ...customColumns];
    }

    return baseColumns;
  }, [contactFieldList]);

  // Use column settings hook
  const { columns, saveColumns, getVisibleColumns } = useColumnSettings(
    "contacts",
    defaultColumns,
  );

  const visibleColumns = useMemo(() => getVisibleColumns(), [columns]);

  const getFieldValue = (contact, columnKey) => {
    // Check if it's a base field
    if (contact[columnKey] !== undefined) {
      return contact[columnKey];
    }

    // Check additional fields
    const additionalField = contact.additionalFields?.find(
      (field) => field.key === columnKey,
    );
    return additionalField?.value || "—";
  };

  // Render cell content
  const renderCellContent = (contact, column) => {
    switch (column.key) {
      case "name":
        return (
          <div className="flex items-center space-x-3">
            <ProfilePicture contact={contact} />
            <Link to={`/contacts/${contact._id}`}>
              <div className="text-sm font-semibold text-gray-900 truncate hover:text-blue-600 transition-colors">
                {contact.name}
              </div>
            </Link>
          </div>
        );

      case "company":
        return (
          <div className="text-sm text-gray-700 truncate font-medium">
            {contact.company?.name || "—"}
          </div>
        );

      case "status":
        return (
          <div
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            {permission !== "readonly" ? (
              <StatusDropdown
                contact={contact}
                onUpdate={handleStatusUpdate}
                isOpen={openDropdownId === contact._id}
                onToggle={setOpenDropdownId}
              />
            ) : (
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getBadgeColor(contact.stageStatus)}`}
              >
                {contact.stageStatus || "New"}
              </span>
            )}
          </div>
        );

      case "email":
        return (
          <a
            href={`mailto:${contact.email}?body=${encodeURIComponent(`Dear ${contact.name || "Sir/Madam"},\n\n\nRegards`)}`}
            className="text-sm text-gray-700 hover:text-blue-600 transition-colors truncate"
          >
            {contact.email}
          </a>
        );

      case "phone":
        return contact.phone ? (
          <a
            href={`tel:${contact.phone}`}
            className="text-sm text-gray-700 hover:text-blue-600 transition-colors truncate"
          >
            {contact.phone}
          </a>
        ) : (
          <span className="text-sm text-gray-400">—</span>
        );

      default:
        // Handle custom fields
        const value = getFieldValue(contact, column.key);
        return (
          <span className="text-sm text-gray-700">
            {String(value).length > 30
              ? String(value).substring(0, 30) + "..."
              : value}
          </span>
        );
    }
  };

  const columnHelper = createColumnHelper();

  // The server now returns contacts already starred-first (via the
  // /contacts/pagination aggregation), so no client-side re-sort is needed.
  const sortedContacts = contacts;

  // O(1) membership checks instead of .includes() array scans repeated per row.
  const selectedContactsSet = useMemo(() => new Set(selectedContacts), [selectedContacts]);

  const renderRowActionsMenu = (contact) => {
    const isOpen = openRowActionsId === contact._id;
    const closeMenu = () => {
      setOpenRowActionsId(null);
      setRowActionsPos(null);
    };
    return (
      <div className="relative flex-shrink-0" onMouseDown={(e) => e.stopPropagation()}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (isOpen) {
              closeMenu();
              return;
            }
            // Was anchored to the raw click coordinates (e.clientX/Y) with no
            // zoom correction and no flip logic — so the menu's position
            // depended on exactly where inside the small ⋮ hitbox the click
            // landed, drifted under this app's dynamic zoom, and always
            // opened straight down regardless of how close to the bottom of
            // the screen the row was. Same fix as Deals/Tasks/Companies:
            // anchor to the button's own rect, divide by ancestor zoom (the
            // menu portals to document.body, which paints inside the zoom),
            // flip upward when there isn't room below, clamp on both axes.
            const zMenu = getAncestorZoom(document.body);
            const MENU_W = 150;
            const MARGIN = 8;
            const MENU_H = 210; // Quick View + Edit + Change Status + Add to Folder + Star + divider + Delete

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
            setOpenRowActionsId(contact._id);
          }}
          className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
          title="More actions"
        >
          <MoreIcon className="w-4 h-4" />
        </button>
        {isOpen && rowActionsPos && createPortal(
          <>
            <div className="fixed inset-0 z-[9998]" onClick={closeMenu} onMouseDown={(e) => e.stopPropagation()} />
            <div
              ref={rowActionsRef}
              style={{ position: "fixed", top: rowActionsPos.top, left: rowActionsPos.left }}
              onMouseDown={(e) => e.stopPropagation()}
              className="w-[150px] z-[9999] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5 animate-in fade-in zoom-in duration-150 origin-top-right"
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeMenu();
                  setQuickViewContactId(contact._id);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
              >
                <EyeIcon className="w-3.5 h-3.5 text-[#1C1B1F]" />
                Quick View
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeMenu();
                  handleEditContact(contact);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
              >
                <EditIcon className="w-3.5 h-3.5 text-[#1C1B1F]" />
                Edit
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeMenu();
                  setStatusModalContact(contact);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[#1C1B1F]" />
                Change Status
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeMenu();
                  openAddToFolderModal(contact);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
              >
                <FolderPlus className="w-3.5 h-3.5 text-[#1C1B1F]" />
                Add to Folder
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleStar(e, contact._id);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
              >
                <StarIcon className={`w-3.5 h-3.5 ${contact.isStarred ? "text-yellow-400 fill-yellow-400" : "text-[#1C1B1F]"}`} />
                {contact.isStarred ? "Unstar Contact" : "Star Contact"}
              </button>
              <div className="w-full border-t border-[#F1F1F5] my-0.5" />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeMenu();
                  handleDelete(contact._id);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#CD3636] hover:bg-red-50 whitespace-nowrap"
              >
                <DeleteIcon className="w-3.5 h-3.5 text-[#CD3636]" />
                Delete
              </button>
            </div>
          </>,
          document.body,
        )}
      </div>
    );
  };

  const tableColumns = useMemo(() => {
    const cols = [];

    // 1. Checkbox Column
    if (selectionMode) {
      cols.push(
        columnHelper.display({
          id: "selection",
          size: 50,
          enableResizing: false,
          header: () => (
            <div className="flex justify-center items-center w-full">
              <Checkbox checked={
                  selectedContactsSet.size === contacts.length &&
                  contacts.length > 0
                } onChange={handleSelectAll} uncheckedColor="text-[#525866]" />
            </div>
          ),
          cell: ({ row }) => (
            <div className="flex justify-center items-center w-full">
              <Checkbox checked={selectedContactsSet.has(row.original._id)} onChange={() => handleSelectContact(row.original._id)} />
            </div>
          ),
        }),
      );
    }

    // 2. Dynamic Data Columns
    // visibleColumns is already sorted by `order` (see getVisibleColumns), so filtering
    // preserves that sequencing within each group — dragging a header updates `order`,
    // pin side just decides which sticky group (left/none/right) a column belongs to.
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
          size:
            vc.key === "name"
              ? 235
              : vc.key === "company"
                ? 207
                : vc.key === "email"
                  ? 288
                  : vc.key === "phone"
                    ? 196
                    : vc.key === "status" || vc.key === "stageStatus"
                      ? 198
                      : 150,
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
                    // rect + boundsRight are VISUAL px; the menu is portaled into
                    // document.body, which paints inside the dynamic <html> zoom, so
                    // every rect-derived value we set must be divided by that zoom
                    // (same correction as the drag-ghost above). Without it the menu
                    // drifts right by rect.right * (zoom - 1) — worst on the last columns.
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
                              const isActive = sortConfig.key === vc.key && sortConfig.direction === "asc";
                              setSortConfig(isActive ? { key: null, direction: null } : { key: vc.key, direction: "asc" });
                              setPagination((prev) => ({ ...prev, currentPage: 1 }));
                            }}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${sortConfig.key === vc.key && sortConfig.direction === "asc" ? "bg-blue-50 text-blue-700 font-medium" : "text-[#161618] hover:bg-gray-50"}`}
                          >
                            <ChevronUp className="w-3.5 h-3.5 text-[#1C1B1F]" />
                            Sort Ascending
                          </button>
                          <button
                            onClick={() => {
                              setOpenColumnMenuKey(null);
                              setColumnMenuPos(null);
                              const isActive = sortConfig.key === vc.key && sortConfig.direction === "desc";
                              setSortConfig(isActive ? { key: null, direction: null } : { key: vc.key, direction: "desc" });
                              setPagination((prev) => ({ ...prev, currentPage: 1 }));
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
                        disabled={vc.required}
                        onClick={() => {
                          if (vc.required) return;
                          setOpenColumnMenuKey(null);
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
          cell: ({ row, getValue }) => {
            const contact = row.original;
            const val = getValue();
            let baseContent;

            if (vc.key === "name") {
              baseContent = (
                // No avatar in the table row: it forced the row taller than
                // the 37px every other list uses, and the name column already
                // identifies the contact. Kept in the card/grid views.
                <div className="flex items-center space-x-3 truncate w-full">
                  <Link
                    to={`/contacts/${contact._id}`}
                    className="text-sm font-semibold text-[#0085FF] truncate hover:underline hover:text-[#004CFF] transition-all duration-150 ease-out"
                    title={contact.name}
                  >
                    <HighlightText text={contact.name} query={searchTerm} />
                  </Link>
                  {contact.isStarred && (
                    <StarIcon className="flex-shrink-0 w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                  )}
                </div>
              );
            } else if (vc.key === "company") {
              baseContent = (
                <div
                  className="truncate text-sm text-gray-700 font-medium w-full"
                  title={contact.company?.name}
                >
                  {contact.company?.name ? <HighlightText text={contact.company.name} query={searchTerm} /> : "—"}
                </div>
              );
            } else if (vc.key === "status") {
              baseContent = (
                <div className="truncate w-full">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getBadgeColor(
                      contact.stageStatus,
                    )}`}
                  >
                    <HighlightText text={contact.stageStatus || "New"} query={searchTerm} />
                  </span>
                </div>
              );
            } else if (vc.key === "email") {
              baseContent = (
                <div className="truncate w-full" title={contact.email}>
                  <a
                    href={`mailto:${contact.email}?body=${encodeURIComponent(`Dear ${contact.name || "Sir/Madam"},\n\n\nRegards`)}`}
                    className="text-sm text-blue-600 hover:underline transition-colors"
                  >
                    <HighlightText text={contact.email} query={searchTerm} />
                  </a>
                </div>
              );
            } else if (vc.key === "phone") {
              baseContent = (
                <div className="truncate w-full" title={contact.phone}>
                  {contact.phone ? (
                    <a
                      href={`tel:${contact.phone}`}
                      className="text-sm text-blue-600 hover:underline transition-colors"
                    >
                      <HighlightText text={contact.phone} query={searchTerm} />
                    </a>
                  ) : (
                    <span className="text-sm text-gray-400">—</span>
                  )}
                </div>
              );
            } else if (baseContent === undefined) {
              baseContent = (
                <div
                  className="truncate text-sm text-gray-700 w-full"
                  title={String(val)}
                >
                  <HighlightText text={String(val)} query={searchTerm} />
                </div>
              );
            }

            if (vc.key === lastColumnKey) {
              return (
                <div className="flex items-center justify-between w-full gap-2">
                  <div className="min-w-0 flex-1">{baseContent}</div>
                  {renderRowActionsMenu(contact)}
                </div>
              );
            }
            return baseContent;
          },
        })
      );
    });

    return cols;
  }, [
    selectionMode,
    visibleColumns,
    selectedContactsSet,
    sortedContacts,
    sortConfig,
    permission,
    openDropdownId,
    pinnedColumns,
    openColumnMenuKey,
    columnMenuPos,
    openRowActionsId,
    rowActionsPos,
    searchTerm,
  ]);

  const table = useReactTable({
    data: sortedContacts,
    columns: tableColumns,
    state: { columnSizing },
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: "onChange",
    enableColumnResizing: true,
  });

  // The single write path for a lifecycle change, used by the inline status
  // dropdown, the row menu's Change Status modal, and the Kanban drop.
  //
  // It takes a contact ID and BOTH lifecycle fields. It used to take a contact
  // OBJECT and a status alone, while its only caller (StatusDropdown) passed
  // an ID — so `contact._id` was undefined and every inline status change sent
  // PUT /contacts/undefined. It also sent stageStatus without lifecycleStage,
  // which the API accepts per-field, leaving the two contradicting each other.
  // Both are fixed: ID in, pair out, against the endpoint that validates the
  // combination.
  const handleStatusUpdate = async (contactId, lifecycleStage, stageStatus) => {
    const previousContact = contacts.find((c) => c._id === contactId);
    const loadingToast = toast.loading("Updating status...");

    // Optimistic — rolled back below if the API rejects the combination.
    setContacts((prev) =>
      prev.map((c) => (c._id === contactId ? { ...c, lifecycleStage, stageStatus } : c)),
    );

    try {
      await API.put(`/contacts/${contactId}/lifecycle-stage`, {
        lifecycleStage,
        stageStatus,
      });
      toast.success("Status updated", { id: loadingToast });
    } catch (error) {
      console.error("Failed to update status", error);
      if (previousContact) {
        setContacts((prev) =>
          prev.map((c) => (c._id === contactId ? previousContact : c)),
        );
      }
      if (error.response?.status === 402) {
        toast.error(error.response?.data?.message || "An active subscription is required to make changes.", { id: loadingToast });
      } else {
        toast.error(
          error.response?.data?.error || error.response?.data?.message || "Failed to update status",
          { id: loadingToast },
        );
      }
      throw error;
    }
  };

  const handleDelete = async (contactId) => {
    setContactToDelete(contactId);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!contactToDelete) return;

    const loadingToast = toast.loading("Deleting contact...");

    try {
      setLoading(true);
      await API.delete(`/contacts/${contactToDelete}`);
      await fetchData();
      toast.success("Contact deleted successfully!", { id: loadingToast });
    } catch (err) {
      let errorMessage = "Failed to delete contact";
      if (err.response?.status === 402) {
        errorMessage = err.response?.data?.message || "An active subscription is required to make changes.";
      } else if (err.response?.status === 403) {
        errorMessage = err.response.data.message || err.response.data.error || "Access denied";
      }
      toast.error(errorMessage, { id: loadingToast });
    } finally {
      setLoading(false);
      setShowDeleteModal(false);
      setContactToDelete(null);
    }
  };

  // Long press handlers
  const handleMouseDown = (contactId) => {
    const timer = setTimeout(() => {
      setSelectionMode(true);
      handleSelectContact(contactId);
    }, 500);
    setLongPressTimer(timer);
  };

  const handleMouseUp = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  // Long-press-to-select is disabled on touch devices — mobile rows should
  // only enter selection via the checkbox itself, never by holding the row.
  const handleTouchStart = () => { };

  const handleTouchEnd = () => { };

  // Exit selection mode
  const exitSelectionMode = () => {
    setSelectionMode(true);
    setSelectedContacts([]);
  };

  // Status Filter Dropdown Component for Desktop
  const StatusFilterDropdown = () => {
    const dropdownRef = useRef(null);
    const isOpen = openDropdownId === "status-filter";

    useEffect(() => {
      const handleClickOutside = (event) => {
        if (
          dropdownRef.current &&
          !dropdownRef.current.contains(event.target)
        ) {
          if (isOpen) setOpenDropdownId(null);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen]);

    return (
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setOpenDropdownId(isOpen ? null : "status-filter")}
          className={`flex items-center gap-2 px-4 py-2.5 bg-white border border-[#E0E0E1] rounded-lg text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${statusFilter
            ? "text-blue-600 border-blue-200 bg-blue-50"
            : "text-gray-700 hover:bg-gray-50"
            }`}
        >
          <Filter
            className={`w-4 h-4 ${statusFilter ? "text-blue-600" : "text-gray-400"}`}
          />
          <span>{statusFilter || "Status"}</span>
          <ChevronDown
            className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""
              }`}
          />
        </button>

        {isOpen && (
          <div className="absolute right-0 z-50 mt-2 w-56 bg-white border border-gray-100 rounded-xl shadow-xl py-2 animate-in fade-in zoom-in duration-200 origin-top-right">
            <div className="px-3 pb-2 mb-2 border-b border-gray-50">
              <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 px-1">
                Filter by Status
              </p>
            </div>
            <div className="max-h-[280px] overflow-y-auto px-1 custom-scrollbar">
              <button
                onClick={() => {
                  setStatusFilter("");
                  setOpenDropdownId(null);
                  setPagination((p) => ({ ...p, currentPage: 1 }));
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${!statusFilter
                  ? "bg-blue-50 text-blue-700 font-semibold"
                  : "text-gray-600 hover:bg-gray-50"
                  }`}
              >
                All Statuses
                {!statusFilter && (
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                )}
              </button>
              {allStageStatuses.map((status) => (
                <button
                  key={status}
                  onClick={() => {
                    setStatusFilter(status);
                    setOpenDropdownId(null);
                    setPagination((p) => ({ ...p, currentPage: 1 }));
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between mt-0.5 ${statusFilter === status
                    ? "bg-blue-50 text-blue-700 font-semibold"
                    : "text-gray-600 hover:bg-gray-50"
                    }`}
                >
                  {status}
                  {statusFilter === status && (
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Mobile Filters Modal
  const MobileFiltersModal = () => {
    if (!showMobileFilters) return null;

    return (
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-end justify-center z-[10000] md:hidden">
        <div className="bg-white w-full max-h-96 rounded-t-xl shadow-2xl">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold font-sf">Filters</h3>
              <button
                onClick={() => setShowMobileFilters(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Filter by Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Statuses</option>
                {allStageStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex space-x-2 pt-4">
              <button
                onClick={() => {
                  setStatusFilter("");
                  setShowMobileFilters(false);
                }}
                className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Clear All
              </button>
              <button
                onClick={() => setShowMobileFilters(false)}
                className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // The hierarchical LifecycleStageDropdown that lived here was the THIRD
  // definition of the lifecycle map (after backend/constants/contactLifecycle.js
  // and utils/contactConstants.js) — and it was never rendered. It has been
  // replaced by components/contact/ContactStatusModal.jsx, which is the same
  // stage-then-status UI reading the shared constants, and is now actually
  // wired up: the row menu's "Change Status" action opens it.

  // Pagination lives in the Zustand store, so it OUTLIVES this component —
  // leaving the page on 3 and coming back would otherwise remount still on 3.
  // Reset to page 1 on unmount so a return visit always starts at page 1 with a
  // single fetch. Doing it here (on the way out) rather than on mount is what
  // avoids the flicker: if we reset on mount instead, the first fetch would
  // already be in flight for page 3, land, paint page-3 rows, and only then get
  // replaced by page 1.
  useEffect(() => {
    return () => {
      setPagination((prev) => ({ ...prev, currentPage: 1 }));
    };
  }, [setPagination]);

  // Debounced reset-to-page-1 when the search/tab/filter changes. Skips the
  // initial mount: on a return visit this used to fire a 300ms-delayed
  // setPagination that raced the in-flight page-3 fetch, producing exactly the
  // "page 3 rows appear, then snap to page 1" flicker.
  const skipInitialPageReset = useRef(true);
  useEffect(() => {
    if (skipInitialPageReset.current) {
      skipInitialPageReset.current = false;
      return;
    }
    const timer = setTimeout(() => {
      setPagination((prev) => ({ ...prev, currentPage: 1 }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, activeTab, statusFilter]);

  // Fetch data when dependencies change. Skipped on the very first mount when
  // a `?search=` deep link is pending — that leaves the search-term effect
  // below as the only initial fetch, instead of racing an empty-search fetch
  // against it (see initialSearchFromUrl above for why that race matters).
  const skipMountFetchForUrlSearch = useRef(!!initialSearchFromUrl);
  useEffect(() => {
    if (skipMountFetchForUrlSearch.current) {
      skipMountFetchForUrlSearch.current = false;
      return;
    }
    fetchData();
  }, [pagination.currentPage, pagination.limit, sortConfig]);

  // Separate effect for search/filter to trigger reset + fetch.
  // Skips the initial mount — the [pagination.currentPage, ...] effect above
  // already fires the first fetch, and running both here would race a second,
  // duplicate request that can resolve first and clear `loading` early.
  const skipInitialSearchFetch = useRef(true);
  useEffect(() => {
    if (skipInitialSearchFetch.current) {
      skipInitialSearchFetch.current = false;
      return;
    }
    if (pagination.currentPage === 1) {
      fetchData();
    }
  }, [searchTerm, activeTab, statusFilter]);

  useEffect(() => {
    fetchCompanies();
    fetchContactFields();
    fetchPermission();
  }, []);

  // Pagination handlers
  const handlePageChange = (newPage) => {
    if (
      newPage >= 1 &&
      newPage <= pagination.totalPages &&
      newPage !== pagination.currentPage
    ) {
      setPagination((prev) => ({ ...prev, currentPage: newPage }));
    }
  };

  const handleLimitChange = (newLimit) => {
    setPagination((prev) => ({
      ...prev,
      limit: newLimit,
      currentPage: 1,
    }));
  };

  // Sorting function
  const handleSort = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
    setPagination((prev) => ({ ...prev, currentPage: 1 }));
  };

  // Component for sortable column header
  const SortableHeader = ({ field, children, className = "" }) => {
    const column = visibleColumns.find((col) => col.key === field);
    const isSortable = column?.sortable !== false;
    const Icon = column?.icon;

    return (
      <th
        className={`px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200 bg-white ${isSortable ? "cursor-pointer hover:bg-gray-50 select-none" : ""
          } transition-colors ${className}`}
        onClick={() => isSortable && handleSort(field)}
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 inline mr-1" />}
          {children}
          {isSortable && (
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
          )}
        </div>
      </th>
    );
  };

  // Pagination component
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
      <div className="w-full bg-white px-4 py-3 flex items-center justify-between sm:px-6">
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
                      ? "bg-[#0085FF] text-white"
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

  const contactFieldConfig = useMemo(
    () => ({
      fields: [
        {
          key: "lifecycleStage",
          label: "Lifecycle Stage",
          type: "select",
          options: allLifecycleStages.map((stage) => ({
            value: stage,
            label: stage,
          })),
        },
        {
          key: "stageStatus",
          label: "Stage Status",
          type: "select",
          options: allStageStatuses.map((status) => ({
            value: status,
            label: status,
          })),
        },
        {
          key: "company",
          label: "Company",
          type: "select",
          options: companies.map((company) => ({
            value: company._id,
            label: company.name,
          })),
        },
        {
          key: "email",
          label: "Email",
          type: "email",
        },
        {
          key: "phone",
          label: "Phone",
          type: "phone",
        },
        ...contactFieldList.map((field) => ({
          key: field.name || field,
          label: field.name || field,
          type: field.type || "text",
          isCustomField: true,
          options: field.options,
        })),
      ],
    }),
    [companies, contactFieldList],
  );

  const handleSelectContact = (contactId) => {
    if (!hasBulkAccess) {
      setShowUpgradeModal(true);
      return;
    }
    setSelectedContacts((prev) =>
      prev.includes(contactId)
        ? prev.filter((id) => id !== contactId)
        : [...prev, contactId],
    );
  };

  const handleSelectAll = () => {
    if (!hasBulkAccess) {
      setShowUpgradeModal(true);
      return;
    }
    if (selectedContacts.length === contacts.length) {
      setSelectedContacts([]);
      setSelectionMode(true);
    } else {
      setSelectedContacts(contacts.map((contact) => contact._id));
      setSelectionMode(true);
    }
  };

  const handleBulkUpdate = async ({ field, value, itemIds }) => {
    try {
      const updateData = { [field]: value };
      if (contactFieldList.includes(field)) {
        updateData.additionalFields = [{ key: field, value }];
        delete updateData[field];
      }
      await Promise.all(
        itemIds.map((contactId) =>
          API.put(`/contacts/${contactId}/lifecycle-stage`, updateData),
        ),
      );
      await fetchData();
      setSelectedContacts([]);
      setShowBulkActions(false);
      setSelectionMode(false);
      toast.success(`Successfully updated ${itemIds.length} contacts`);
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to update contacts");
    }
  };

  const handleBulkDeleteContacts = async (itemIds) => {
    setLoading(true);
    try {
      await Promise.all(itemIds.map((id) => API.delete(`/contacts/${id}`)));
      await fetchData();
      setSelectedContacts([]);
      setShowBulkActions(false);
      setSelectionMode(false);
      toast.success(`Successfully deleted ${itemIds.length} contacts`);
    } catch (err) {
      toast.error(err.response?.data?.error || "Bulk delete failed");
    } finally {
      setLoading(false);
    }
  };

  const handleBulkNoteSave = async () => {
    if (!noteContent.trim() || noteContent === "<p><br></p>") {
      toast.error("Note content is required");
      return;
    }

    setBulkNoteLoading(true);
    const loadingToast = toast.loading(
      `Adding note to ${selectedContacts.length} contacts...`,
    );

    try {
      await API.post("/notes/bulk-contact-notes", {
        note: noteContent,
        contactIds: selectedContacts,
      });

      toast.success("Notes successfully added!", { id: loadingToast });

      // Cleanup
      setNoteContent("");
      setShowBulkNoteModal(false);
      exitSelectionMode(); // Clear selection
    } catch (err) {
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.", { id: loadingToast });
      } else {
        toast.error(err.response?.data?.error || "Failed to add notes", { id: loadingToast });
      }
    } finally {
      setBulkNoteLoading(false);
    }
  };

  const selectedContactObjects = useMemo(
    () => contacts.filter((contact) => selectedContacts.includes(contact._id)),
    [contacts, selectedContacts],
  );

  const fetchPermission = async () => {
    try {
      const res = await API.get("/auth/me");
      const user = res.data.user;
      const contactPerm = user?.permissions?.find(
        (p) => p.name.toLowerCase() === "contacts",
      );
      setPermission(contactPerm?.permission || "no");
    } catch (err) {
      console.error("Failed to fetch user permissions");
      toast.error("Failed to fetch user permissions");
    }
  };

  const fetchCompanies = async () => {
    try {
      const res = await API.get("/companies");
      setCompanies(res.data.companies || res.data);
    } catch (err) {
      console.error("Failed to fetch companies");
      toast.error(err.response?.data?.error || "Failed to fetch companies");
    }
  };

  const fetchContactFields = async () => {
    try {
      const res = await API.get("/contact-fields");
      const fieldData = res.data?.fields || [];
      if (fieldData.length > 0 && typeof fieldData[0] === "object") {
        setContactFieldList(fieldData);
      } else {
        setContactFieldList(fieldData);
      }
    } catch (err) {
      console.error("Failed to fetch contact fields");
      toast.error(
        err.response?.data?.error || "Failed to fetch contact fields",
      );
    }
  };

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setStatusFilter(""); // Reset status filter immediately
    setSearchTerm(""); // Optionally reset search
    setPagination((prev) => ({ ...prev, currentPage: 1 })); // Reset to first page
    if (tabId === "Hotlist") {
      setShowKanban(false);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pagination.currentPage.toString(),
        limit: pagination.limit.toString(),
      });
      if (sortConfig.key) {
        params.append("sortBy", sortConfig.key);
        params.append("sortOrder", sortConfig.direction || "asc");
      } else {
        // No column sort applied — show newest-added first, without
        // marking any header as actively sorted.
        params.append("sortBy", "createdAt");
        params.append("sortOrder", "desc");
      }

      if (searchTerm.trim()) {
        params.append("search", searchTerm.trim());
      }

      if (statusFilter) {
        params.append("stageStatus", statusFilter);
      }

      if (activeFilters && activeFilters.length > 0) {
        params.append("advancedFilters", JSON.stringify(activeFilters));
      }

      if (activeTab !== "All") {
        switch (activeTab) {
          case "Leads":
            params.append("lifecycleStage", "Lead");
            break;
          case "Sales Qualified Lead":
            params.append("lifecycleStage", "Sales Qualified Lead");
            break;
          case "Customers":
            params.append("lifecycleStage", "Customer");
            break;
        }
      }

      const res = await API.get(`/contacts/pagination?${params.toString()}`);

      if (res.data.contacts && res.data.pagination) {
        setContacts(res.data.contacts);
        setCurrentContactIds(res.data.contacts.map((c) => c._id));
        setPagination((prev) => ({
          ...prev,
          currentPage: res.data.pagination.currentPage,
          totalPages: res.data.pagination.totalPages,
          totalCount: res.data.pagination.totalCount,
          hasNextPage: res.data.pagination.hasNextPage,
          hasPrevPage: res.data.pagination.hasPrevPage,
        }));
      } else {
        setContacts(res.data || []);
        setCurrentContactIds((res.data || []).map((c) => c._id));
      }
    } catch (err) {
      console.error("Error fetching contacts:", err);
      toast.error(err.response?.data?.error || "Failed to load contacts");
      setContacts([]);
    } finally {
      setLoading(false);
    }
  };

  // "Select All" grabs every contact ID matching the current search/filters
  // straight from the database (not just the loaded page). "Deselect All" is
  // its counterpart: it doesn't clear the selection outright — it steps back
  // down to only the rows on the current page.
  const handleSelectAllAcrossPages = async () => {
    try {
      const params = new URLSearchParams({ allIds: "true" });
      if (searchTerm.trim()) params.append("search", searchTerm.trim());
      if (statusFilter) params.append("stageStatus", statusFilter);
      if (activeFilters && activeFilters.length > 0) {
        params.append("advancedFilters", JSON.stringify(activeFilters));
      }
      if (activeTab !== "All") {
        switch (activeTab) {
          case "Leads":
            params.append("lifecycleStage", "Lead");
            break;
          case "Sales Qualified Lead":
            params.append("lifecycleStage", "Sales Qualified Lead");
            break;
          case "Customers":
            params.append("lifecycleStage", "Customer");
            break;
        }
      }
      const res = await API.get(`/contacts/pagination?${params.toString()}`);
      setSelectedContacts(res.data.ids || []);
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to select all rows");
    }
  };

  const handleDeselectAllExtra = () => {
    setSelectedContacts(contacts.map((c) => c._id));
  };

  // Trigger data refetch when filters are applied
  useEffect(() => {
    if (pagination.currentPage === 1) {
      fetchData();
    } else {
      setPagination((prev) => ({ ...prev, currentPage: 1 }));
    }
  }, [activeFilters]);

  const handleEditContact = async (contact) => {
    try {
      // Fetch the full contact data, then edit via the shared QuickContactForm.
      const response = await API.get(`/contacts/${contact._id}`);
      setEditContact(response.data);
      setShowQuickAdd(true);
    } catch (error) {
      console.error("Error fetching contact details:", error);
      toast.error("Failed to load contact details");
    }
  };

  // handleLifecycleStageUpdate lived here — a second, unused copy of the same
  // PUT that handleStatusUpdate already does. Every lifecycle write now goes
  // through handleStatusUpdate (inline dropdown, Change Status modal) or
  // handleKanbanItemMove (drag), both sending lifecycleStage + stageStatus.

  const handleKanbanItemMove = async (contactId, newStatus) => {
    const newLifecycleStage = getLifecycleStageForStatus(newStatus);
    const previousContact = contacts.find((c) => c._id === contactId);

    setContacts((prev) =>
      prev.map((c) =>
        c._id === contactId
          ? {
            ...c,
            lifecycleStage: newLifecycleStage,
            stageStatus: newStatus,
          }
          : c,
      ),
    );

    try {
      await API.put(`/contacts/${contactId}/lifecycle-stage`, {
        lifecycleStage: newLifecycleStage,
        stageStatus: newStatus,
      });
      toast.success("Contact status updated successfully!");
    } catch (err) {
      console.error("Failed to update contact status:", err);
      if (previousContact) {
        setContacts((prev) =>
          prev.map((c) => (c._id === contactId ? previousContact : c)),
        );
      }
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || "Failed to update contact status");
      }
      throw err;
    }
  };

  const resetForm = () => {
    setForm({
      name: "",
      email: "",
      phone: "",
      lifecycleStage: "Lead",
      stageStatus: "New",
      company: "",
      avatar: "",
      socialMedia: {
        twitter: "",
        linkedin: "",
        facebook: "",
      },
    });
    setAdditionalValues({});
  };

  const toggleForm = () => {
    if (showForm) {
      resetForm();
    }
    setShowForm(!showForm);
  };

  // Render contact card for Kanban
  const renderContactCard = (contact, isDragging) => (
    <div
      className={`
        bg-white p-4 rounded-lg shadow-sm border border-gray-200 
        hover:shadow-md cursor-grab active:cursor-grabbing 
        transition-all duration-200 
        ${isDragging ? "rotate-1 shadow-xl z-50 scale-105" : "hover:border-blue-300"}
      `}
    >
      {/* Card Header with Avatar and Contact Name */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="flex-shrink-0">
            <ProfilePicture contact={contact} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 text-sm truncate">
              {contact.name}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {contact.jobTitle || contact.company?.name || "—"}
            </p>
          </div>
        </div>
        <div className="relative inline-block text-left group/action">
          <button
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <MoreIcon className="w-4 h-4" />
          </button>

          <div className="hidden group-hover/action:block absolute right-0 mt-1 w-32 bg-white rounded-lg shadow-xl border border-gray-100 z-50 py-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleEditContact(contact);
              }}
              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-blue-600"
            >
              Edit
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(contact._id);
              }}
              className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-b border-gray-100 mb-3"></div>

      {/* Contact Details */}
      <div className="space-y-2 mb-3">
        {contact.email && (
          <div className="flex items-center gap-2 text-xs text-gray-600 group">
            <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <a
              href={`mailto:${contact.email}?body=${encodeURIComponent(`Dear ${contact.name || "Sir/Madam"},\n\n\nRegards`)}`}
              className="truncate hover:text-blue-600 hover:underline transition-colors"
            >
              {contact.email}
            </a>
          </div>
        )}
        {contact.phone && (
          <div className="flex items-center gap-2 text-xs text-gray-600 group">
            <CellphoneIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <a
              href={`tel:${contact.phone}`}
              className="hover:text-blue-600 hover:underline transition-colors"
            >
              {contact.phone}
            </a>
          </div>
        )}
      </div>

      {/* Status Badge */}
      {contact.stageStatus && (
        <div className="">
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${getBadgeColor(
              contact.stageStatus,
            )}`}
          >
            {contact.stageStatus}
          </span>
        </div>
      )}
    </div>
  );

  return (
    <div className={`bg-white ${showKanban ? "" : "min-h-screen"}`}>
      <AppToaster />

      {/* Video Tutorial Modal */}
      <VideoTutorialModal
        isOpen={showVideoTutorial}
        onClose={() => setShowVideoTutorial(false)}
        videoId={getVideoTutorial("contacts")?.videoId}
        title={getVideoTutorial("contacts")?.title}
      />

      {/* Column Settings Panel */}
      <ColumnSettingsPanel
        isOpen={showColumnSettings}
        onClose={() => setShowColumnSettings(false)}
        columns={columns}
        onSave={saveColumns}
        moduleName="Contacts"
      />

      {/* Title Strip */}
      <div
        className={`fixed right-0 h-16 flex items-center gap-2 lg:gap-4 px-4 sm:px-6 lg:px-8 border-b top-[calc(54px+var(--dc-offline-offset,0px))] lg:top-[calc(64px+var(--dc-offline-offset,0px))] bg-white border-[#E5E5EC]`}
        style={{ left: "var(--sidebar-width, 0px)", zIndex: 40, minHeight: "64px", maxHeight: "64px", boxSizing: "border-box" }}
      >
        {showBulkStrip ? (
          <div className={`${bulkStripClosing ? "animate-slideOutRight" : "animate-slideInLeft"} flex flex-nowrap items-center justify-between gap-3 w-full h-full overflow-x-auto`}>
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
                onClick={() => setShowBulkNoteModal(true)}
                className="h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
              >
                <StickyNote className="w-4 h-4 text-emerald-600" />
                Add Note
              </button>
              <button
                onClick={() => setShowAddToHotlistModal(true)}
                className="h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
              >
                <FolderPlus className="w-4 h-4 text-blue-600" />
                Add to Folder
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
                {selectedContacts.length} contact{selectedContacts.length !== 1 ? "s" : ""} selected
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
              className={`lg:hidden flex flex-col justify-center gap-1.5 overflow-hidden flex-shrink-0 transition-all duration-300 ease-in-out ${isSearchExpanded ? "w-0 opacity-0" : "w-[160px] opacity-100"}`}
            >
              <div className="flex items-center gap-2">
                <h1 className="m-0 leading-tight font-bold text-base text-gray-900 truncate">Contacts</h1>
                <VideoIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
              </div>
              <p className="m-0 leading-tight text-[10px] text-gray-500 font-inter truncate">
                Manage your contacts and leads
              </p>
            </div>

            <nav
              ref={tabNavRef}
              className="relative hidden lg:inline-flex items-center gap-1 h-10 p-1 bg-[#F1F1F5] rounded-full overflow-x-auto no-scrollbar flex-shrink-0"
            >
              <span
                aria-hidden="true"
                className="absolute top-1 h-8 rounded-full bg-white shadow-sm transition-all duration-300 ease-out pointer-events-none"
                style={{
                  left: tabThumb.left,
                  width: tabThumb.width,
                  opacity: tabThumb.ready ? 1 : 0,
                }}
              />
              {CONTACT_TABS.map(({ id, label }) => {
                const isActive = activeTab === id;
                return (
                  <button
                    key={id}
                    ref={(el) => {
                      tabRefs.current[id] = el;
                    }}
                    onClick={() => handleTabChange(id)}
                    className="relative z-[1] flex items-center justify-center h-8 px-4 rounded-full text-sm font-medium whitespace-nowrap transition-colors text-gray-700 hover:text-gray-900"
                    style={isActive ? { color: "var(--btn-primary)" } : undefined}
                  >
                    {label}
                  </button>
                );
              })}
            </nav>

            {activeTab !== "Hotlist" && (
              <div className="relative flex-1 min-w-0 flex items-center justify-end">
                <div
                  className={`relative h-10 flex items-center border ${searchTerm ? "border-[#0085FF]" : "border-[rgba(31,41,55,0.1)]"} rounded-full bg-white transition-all duration-300 ease-in-out hover:bg-gray-50 focus-within:border-[#0085FF] focus-within:hover:bg-white ${isSearchExpanded ? "w-full lg:w-[416px]" : "w-10"} max-w-full`}
                >
                  <SearchIcon
                    className={`absolute cursor-pointer z-10 flex-shrink-0 top-1/2 -translate-y-1/2 w-4 h-4 text-[#525866] ${isSearchExpanded ? "left-3.5" : "left-1/2 -translate-x-1/2"}`}
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
                    className={`w-full h-full pl-10 pr-9 bg-transparent text-sm focus:outline-none transition-opacity duration-200 font-inter cursor-pointer ${isSearchExpanded ? "opacity-100 focus:cursor-text" : "opacity-0"}`}
                    placeholder="Search by contact by name, company, or status..."
                  />
                  {/* Clears the typed text only — box stays open. mousedown+
                      preventDefault stops the input's onBlur (which would
                      collapse the box) from firing before the click lands. */}
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
            )}

            <div className="flex items-center gap-2 lg:gap-4 flex-shrink-0">
              {activeTab !== "Hotlist" && (
                <>
                  <button
                    onClick={() => setShowAdvancedFilters(true)}
                    className="hidden lg:flex relative items-center justify-center w-10 h-10 rounded-full border border-[#E1E4EA] bg-white text-gray-700 hover:bg-gray-50 transition-colors flex-shrink-0"
                    title="Filters"
                  >
                    <FilterIcon size={16} />
                    {activeFilters.length > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 bg-blue-600 text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full">
                        {activeFilters.length}
                      </span>
                    )}
                  </button>

                  <div className="hidden lg:flex relative items-center gap-1.5 bg-[#F1F1F5] rounded-full p-1 flex-shrink-0 overflow-hidden">
                    <span
                      className="absolute top-1 w-8 h-8 rounded-full bg-white shadow-[0_0_6px_rgba(0,0,0,0.1)] transition-all duration-300 ease-out pointer-events-none"
                      style={{ left: showKanban ? 42 : 4 }}
                    />
                    <button
                      onClick={() => setShowKanban(false)}
                      className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-full transition-colors ${!showKanban ? "text-[#0085FF]" : "text-[#525252]"
                        }`}
                      title="List View"
                    >
                      <TableViewIcon size={16} className="text-current" />
                    </button>
                    <button
                      onClick={() => setShowKanban(true)}
                      className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-full transition-colors ${showKanban ? "text-[#0085FF]" : "text-[#525252]"
                        }`}
                      title="Kanban View"
                    >
                      <KanbanViewIcon size={16} className="text-current" />
                    </button>
                  </div>
                </>
              )}

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
                    {/* Switcher + Hotlist: mobile-only entries, folded in here instead of their own controls */}
                    {activeTab !== "Hotlist" && (
                      <>
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
                      </>
                    )}
                    <button
                      onClick={() => {
                        handleTabChange(activeTab === "Hotlist" ? "All" : "Hotlist");
                        setIsMoreMenuOpen(false);
                      }}
                      className="lg:hidden w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <HotlistIcon className="w-4 h-4 text-[#1D4ED8] flex-shrink-0" />
                      {activeTab === "Hotlist" ? "Hide Hotlist" : "Hotlist"}
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
                    <Link
                      to="/settings/forms?module=Contact"
                      onClick={() => setIsMoreMenuOpen(false)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <PdfIcon className="w-4 h-4 text-gray-400" />
                      Forms
                    </Link>
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
                        setShowAdvancedFilters(true);
                        setIsMoreMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <FilterIcon size={16} />
                      Filters
                      {activeFilters.length > 0 && (
                        <span className="ml-auto bg-blue-600 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full">
                          {activeFilters.length}
                        </span>
                      )}
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={() => handleTabChange(activeTab === "Hotlist" ? "All" : "Hotlist")}
                className={`hidden lg:inline-flex items-center gap-2 h-10 px-4 rounded-full border text-sm font-semibold transition-colors flex-shrink-0 ${activeTab === "Hotlist"
                  ? "bg-blue-50 border-[#0085FF] text-blue-700"
                  : "bg-white border-[#E1E4EA] text-[#525866] hover:bg-gray-50"
                  }`}
              >
                <HotlistIcon className="w-4 h-4" />
                <span className="font-medium">Hotlist</span>
              </button>

              <button
                onClick={() => {
                  setEditContact(null);
                  setShowQuickAdd((v) => !v);
                }}
                title={showQuickAdd && !editContact ? "Cancel" : "New Contact"}
                className="inline-flex items-center justify-center gap-2 h-10 w-10 lg:w-auto px-0 lg:px-4 bg-[#0085FF] text-white text-sm font-medium rounded-full hover:bg-blue-600 focus:outline-none cursor-pointer transition-colors flex-shrink-0"
              >
                <PlusIcon className="w-4 h-4 flex-shrink-0" />
                <span className="hidden lg:inline">{showQuickAdd && !editContact ? "Cancel" : "New Contact"}</span>
              </button>

            </div>
          </>
        )}
      </div>

      <ImportContacts
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        contactFieldNames={contactFieldList}
        onImportSuccess={() => {
          fetchData();
          toast.success("Contacts imported successfully");
        }}
      />

      {/* Single shared form for both create and edit contact. */}
      {(showQuickAdd || state?.showAddForm) && (
        <QuickContactForm
          companies={companies}
          editContact={editContact}
          onContactCreated={() => {
            fetchData();
            setShowQuickAdd(false);
            if (state) state.showAddForm = false;
          }}
          onContactUpdated={() => {
            fetchData();
            setShowQuickAdd(false);
            setEditContact(null);
          }}
          onRequestClose={() => {
            setShowQuickAdd(false);
            setEditContact(null);
            if (state) state.showAddForm = false;
          }}
        />
      )}

      {state?.showCallLogForm && (
        <CallLogForm
          isOpen={state?.showCallLogForm}
          onClose={() => {
            console.log("on close");
            state.showCallLogForm = false;
            navigate("/contacts");
          }}
          userId={user.id}
        />
      )}

      {/* Selection Mode Banner */}
      {/* Selection Mode Banner */}
      {selectionMode && selectedContacts.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between shadow-sm gap-4">
          <div className="flex items-center gap-3">
            <CheckSquare className="w-5 h-5 text-blue-600" />
            <span className="text-blue-800 font-semibold font-inter">
              {selectedContacts.length} contact
              {selectedContacts.length !== 1 ? "s" : ""} selected
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            {/* ✅ Export Button */}
            <button
              onClick={() => setShowExportModal(true)}
              className="px-4 py-2 bg-white border border-green-600 text-green-700 text-sm font-medium rounded-lg hover:bg-green-50 focus:outline-none transition-colors flex items-center gap-2"
            >
              <DownloadIcon className="w-4 h-4" />
              Export
            </button>
            <button
              onClick={() => setShowBulkNoteModal(true)}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 focus:outline-none transition-colors flex items-center gap-2"
            >
              <StickyNote className="w-4 h-4 text-emerald-600" />
              Add Note
            </button>

            {/* Add to Folder Button */}
            <button
              onClick={() => setShowAddToHotlistModal(true)}
              className="px-4 py-2 bg-white border border-blue-600 text-blue-600 text-sm font-medium rounded-lg hover:bg-blue-50 focus:outline-none transition-colors flex items-center gap-2"
            >
              <FolderPlus className="w-4 h-4" />
              Add to Folder
            </button>

            {/* ✅ Bulk Update Button (Text Changed) */}
            <button
              onClick={() => setShowBulkActions(true)}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none transition-colors flex items-center gap-2"
            >
              <EditIcon className="w-4 h-4" />
              Bulk Update
            </button>

            {/* ✅ New Bulk Delete Button */}
            <button
              onClick={() => setShowBulkDeleteModal(true)}
              disabled={loading}
              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 focus:outline-none transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <DeleteIcon className="w-4 h-4" />
              Delete
            </button>

            {/* Cancel Button */}
            <button
              onClick={exitSelectionMode}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 focus:outline-none transition-colors flex items-center gap-2"
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Main Content Card */}
      <div className="bg-white overflow-visible">
        <div
          ref={tableScrollRef}
          className={`${showKanban ? "overflow-x-auto overflow-y-hidden" : "overflow-x-auto overflow-y-auto"} top-[calc(118px+var(--dc-offline-offset,0px))] lg:top-[calc(128px+var(--dc-offline-offset,0px))]`}
          style={{
            position: "fixed",
            left: "var(--sidebar-width, 0px)",
            right: 0,
            bottom: !showKanban && activeTab !== "Hotlist" && !showLoadingSkeleton ? 64 : 0,
          }}
        >
          {/* Content Area */}
          {showKanban ? (
            <div className="flex gap-4 px-6 pt-6 pb-2 h-full">
              {/* The board is the LEAD pipeline, so its columns are exactly the
                  Lead stage's statuses — bound to the shared map rather than
                  re-typed, so adding a Lead status can't leave a column out.
                  Moving a card across all three lifecycle stages is done from
                  the row menu's Change Status, not by drag. */}
              {lifecycleStageOptions.Lead.map((col) => {
                const count = sortedContacts.filter(
                  (c) => (c.stageStatus || "New") === col
                ).length;
                return (
                  <div
                    key={col}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const contactId = e.dataTransfer.getData("contactId");
                      const fromStatus = e.dataTransfer.getData("fromStatus");
                      if (contactId && fromStatus !== col) {
                        handleKanbanItemMove(contactId, col);
                      }
                    }}
                    className="border border-[#E1E4EA] rounded-lg flex-shrink-0 overflow-hidden flex flex-col h-full"
                    style={{ width: "340px" }}
                  >
                    <div
                      className="flex items-center gap-1.5"
                      style={{ height: "46px", background: "#F5F7FA", padding: "0 18px" }}
                    >
                      <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: "12px", lineHeight: "15px", letterSpacing: "-0.02em", color: "#44444A" }}>
                        {col}
                      </span>
                      <span
                        className="flex items-center justify-center rounded-full bg-white border border-[#E5E5EC]"
                        style={{ width: "22px", height: "22px", boxShadow: "0px 1px 2px rgba(82, 88, 102, 0.06)" }}
                      >
                        <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: "12px", lineHeight: "15px", letterSpacing: "-0.02em", color: "#161618" }}>
                          {count}
                        </span>
                      </span>
                    </div>

                    <div className="flex-1 overflow-y-auto flex flex-col gap-3 p-3 custom-scrollbar">
                      {sortedContacts
                        .filter((c) => (c.stageStatus || "New") === col)
                        .map((contact) => (
                          <div
                            key={contact._id}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData("contactId", contact._id);
                              e.dataTransfer.setData("fromStatus", col);
                              const node = e.currentTarget;
                              const clone = node.cloneNode(true);
                              clone.style.width = `${node.offsetWidth}px`;
                              clone.style.position = "absolute";
                              clone.style.top = "-9999px";
                              clone.style.left = "-9999px";
                              clone.style.opacity = "1";
                              document.body.appendChild(clone);
                              e.dataTransfer.setDragImage(clone, node.offsetWidth / 2, 20);
                              requestAnimationFrame(() => document.body.removeChild(clone));
                            }}
                            onClick={() => navigate(`/contacts/${contact._id}`)}
                            className="flex flex-col bg-white border border-[#E5E5EC] rounded-[10px] cursor-pointer hover:shadow-sm transition-shadow active:cursor-grabbing"
                            style={{ padding: "16px", gap: "16px" }}
                          >
                            <div className="flex items-center gap-2 w-full">
                              <ProfilePicture contact={contact} />
                              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2.5 w-full">
                                  <span
                                    className="truncate"
                                    style={{ fontFamily: "'Inter Tight', Inter, sans-serif", fontWeight: 500, fontSize: "16px", lineHeight: "150%", letterSpacing: "-0.02em", color: "#161618" }}
                                  >
                                    {contact.name}
                                  </span>
                                  <MoreIcon className="w-4 h-4 text-[#BEBEC8] flex-shrink-0" />
                                </div>
                                <span
                                  className="truncate"
                                  style={{ fontFamily: "Inter", fontWeight: 500, fontSize: "12px", lineHeight: "150%", letterSpacing: "-0.06em", color: "#525252" }}
                                >
                                  {contact.company?.name || "—"}
                                </span>
                              </div>
                            </div>

                            <div className="w-full border-t border-[#F1F1F5]" />

                            <div className="flex items-center gap-2 w-full">
                              <CellphoneIcon className="w-4 h-4 text-[#525252] flex-shrink-0" />
                              <span
                                className="truncate"
                                style={{ fontFamily: "Inter", fontWeight: 500, fontSize: "12px", lineHeight: "120%", color: "#525252" }}
                              >
                                {contact.phone || "—"}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 w-full">
                              <Mail className="w-4 h-4 text-[#525252] flex-shrink-0" />
                              <span
                                className="truncate"
                                style={{ fontFamily: "Inter", fontWeight: 500, fontSize: "12px", lineHeight: "120%", color: "#525252" }}
                              >
                                {contact.email || "—"}
                              </span>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : activeTab === "Hotlist" ? (
            <div className="px-6 pt-6">
              <ContactFolder />
            </div>
          ) : (
            // No `loading ? "opacity-60 pointer-events-none"` on this container any
            // more. Paging is server-side, so that fired on every page change and
            // dimmed the whole table to 60% for the length of the round trip — the
            // flash that made paging feel like the data blinked out. The rows never
            // actually left (showLoadingSkeleton is gated on an empty list), so the
            // old data now stays fully legible and clickable while the next page
            // loads; the top progress bar reports the fetch instead.
            // No border-t: the toolbar strip right above already has its own
            // border-b, so a top border here would double up against it.
            <div className="relative bg-white border-r border-b border-[#E1E4EA]" style={{ paddingLeft: "var(--content-inset, 16px)" }}>
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
                  // Boundary = the pinned column nearest the scrollable area, in
                  // DISPLAY order (pinnedColumns is in pin-action order, which can
                  // differ once more than one column is pinned).
                  const allColIds = allHeaders.map((h) => h.column.id);
                  const leftPinnedInOrder = allColIds.filter((id) => leftPinnedKeys.includes(id));
                  const rightPinnedInOrder = allColIds.filter((id) => rightPinnedKeys.includes(id));
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
                    if (rightPinnedKeys.includes(h.column.id)) {
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
                                    position: isSticky ? "sticky" : "relative",
                                    left: isLeftSticky ? pinnedLeftOffsets[colId] ?? 0 : "auto",
                                    right: isRightSticky ? pinnedRightOffsets[colId] ?? 0 : "auto",
                                    zIndex: isSticky ? 20 : 1,
                                  }}
                                  className={`px-4 py-3 text-sm font-bold text-[#525866] border-r border-[#E1E4EA] last:border-r-0 transition-colors bg-[#F5F7FA] ${isDraggable ? "cursor-grab active:cursor-grabbing" : ""} ${isDragOver ? "bg-blue-100" : "hover:bg-gray-100"}`}
                                >
                                  {/* Opacity on this wrapper, not the <th>, so dragging never
                                      dims the pinned border or its boundary shadow. */}
                                  <div className="flex items-center gap-1.5 w-full min-w-0" style={{ opacity: isDragging ? 0.35 : 1 }}>
                                    <div className="min-w-0 flex-1 truncate">
                                      {flexRender(
                                        header.column.columnDef.header,
                                        header.getContext(),
                                      )}
                                    </div>
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
                          <TableSkeletonRows numRows={pagination.limit} columns={table.getVisibleLeafColumns().filter((c) => c.id !== "selection")} hasCheckbox checkboxWidth={50} />
                        ) : sortedContacts.length === 0 ? (
                          <tr>
                            <td colSpan={table.getAllColumns().length}>
                              <EmptyState
                                icon={User}
                                noun="Contact"
                                isFiltered={!!(searchTerm || activeFilters?.length)}
                                onCreate={() => {
                                  setEditContact(null);
                                  setShowQuickAdd(true);
                                }}
                              />
                            </td>
                          </tr>
                        ) : (
                          table.getRowModel().rows.map((row) => (
                            <tr
                              key={row.id}
                              className={`bg-white hover:bg-blue-50 transition-colors cursor-pointer ${selectedContactsSet.has(row.original._id) ? "!bg-blue-50" : ""}`}
                              style={{ height: 37, maxHeight: 37 }}
                              onClick={(e) => {
                                // While a row-actions (⋮) menu is open — for THIS row or
                                // any other — a click anywhere on the table should only
                                // ever close/switch that menu, never also navigate away.
                                // The menu's own full-screen backdrop is meant to absorb
                                // that click, but relying on stacking order alone left a
                                // gap: clicking a different row while a menu was open
                                // still navigated to that row's detail page. This check
                                // makes it impossible regardless of the backdrop's
                                // z-index behavior. Once no menu is open, rows navigate
                                // normally again — this only guards the "menu is up"
                                // window, not row-clicking in general.
                                if (openRowActionsId) return;
                                if (e.target.closest("button") || e.target.closest("a") || e.target.closest("input")) return;
                                navigate(`/contacts/${row.original._id}`);
                              }}
                            >
                              {row.getVisibleCells().map((cell) => {
                                const colId = cell.column.id;
                                const isLeftSticky = colId === "selection" || leftPinnedKeys.includes(colId);
                                const isRightSticky = rightPinnedKeys.includes(colId);
                                const isSticky = isLeftSticky || isRightSticky;
                                const cellBoundaryShadowSide = colId === lastLeftPinnedKey ? "left" : colId === firstRightPinnedKey ? "right" : null;
                                const isColDragging = draggedColKey === colId;

                                return (
                                  <td
                                    key={cell.id}
                                    onClick={(e) => { if (colId === "selection") e.stopPropagation(); }}
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
          )}
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
              <div
                key={i}
                className="px-4 py-2 border-b border-[#F1F1F5] last:border-b-0"
              >
                <span className="text-sm text-gray-700 truncate block">{rowVal}</span>
              </div>
            ))}
          </div>,
          document.body,
        )}

        {!showKanban && activeTab !== "Hotlist" && !showLoadingSkeleton && (
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
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-[10000]">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-red-100 p-2 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-800 font-sf">
                Delete Contact
              </h2>
            </div>
            <p className="text-gray-600 mb-6 font-inter">
              Are you sure you want to delete this contact? This action cannot
              be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setContactToDelete(null);
                }}
                className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium flex items-center gap-2"
              >
                <DeleteIcon className="w-4 h-4" />
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Filters Modal */}
      <MobileFiltersModal />

      {/* Export Selected Contacts Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        columns={defaultColumns}
        selectedIds={selectedContacts}
        exportUrl="/contacts/export-selected"
        fileName="Exported_Contacts.csv"
      />

      <BulkDeleteModal
        isOpen={showBulkDeleteModal}
        message={
          <>
            Are you sure you want to delete <strong>{selectedContacts.length}</strong> contacts?
            This action cannot be undone.
          </>
        }
        loading={loading}
        onCancel={() => setShowBulkDeleteModal(false)}
        onConfirm={async () => {
          await handleBulkDeleteContacts(selectedContacts);
          setShowBulkDeleteModal(false);
        }}
        onExportBeforeDelete={() => {
          const records = contacts.filter((c) => selectedContacts.includes(c._id));
          exportRecordsToCSV(records, "contacts");
        }}
      />

      {/* Place this anywhere outside your main layout wrappers */}
      <AdvancedFilterPanel
        isOpen={showAdvancedFilters}
        onClose={() => setShowAdvancedFilters(false)}
        columns={defaultColumns} // Your useMemo default columns handles custom fields perfectly
        filters={activeFilters}
        setFilters={setActiveFilters}
        onApply={(newFilters) => setActiveFilters(newFilters)}
        title="Filter Contacts"
        subtitle="Segment your people database"
        emptyStateText="Add a rule to find specific contacts."
      />

      {/* Bulk Actions Modal */}
      <BulkActions
        isOpen={showBulkActions}
        onClose={() => setShowBulkActions(false)}
        selectedItems={selectedContactObjects}
        onBulkUpdate={handleBulkUpdate}
        fieldConfig={contactFieldConfig}
        module="contacts"
      />
      {/* Add to Folder Modal */}
      {/* Change Status — the row menu's lifecycle editor. Sends BOTH
          lifecycleStage and stageStatus through handleStatusUpdate, the same
          path the inline dropdown and the Kanban drop use. */}
      <ContactStatusModal
        contact={statusModalContact}
        isOpen={!!statusModalContact}
        onClose={() => setStatusModalContact(null)}
        onSave={handleStatusUpdate}
      />
      <AddToContactHotlistModal
        isOpen={showAddToHotlistModal}
        onClose={() => setShowAddToHotlistModal(false)}
        selectedContactIds={selectedContacts}
        onComplete={() => {
          setSelectionMode(true);
          setSelectedContacts([]);
        }}
      />
      {/* Bulk Note Modal */}
      <NoteEditor
        isOpen={showBulkNoteModal}
        onClose={() => {
          setShowBulkNoteModal(false);
          setNoteContent("");
        }}
        noteContent={noteContent}
        setNoteContent={setNoteContent}
        onSave={handleBulkNoteSave}
        loading={bulkNoteLoading}
        isEditing={false}
        // Dynamic string passing the amount of contacts selected!
        contactName={`${selectedContacts.length} selected contacts`}
      />
      {quickViewContactId && (
        <ContactQuickView
          contactId={quickViewContactId}
          onClose={() => setQuickViewContactId(null)}
          onEdit={(contact) => {
            handleEditContact(contact);
          }}
        />
      )}
      {/* Add To Folder Modal */}
      {showAddToFolderModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-semibold text-gray-900">Add to Folder</h3>
              <button
                onClick={() => setShowAddToFolderModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              <p className="text-sm text-gray-600 mb-4">
                Select a folder to add{" "}
                <strong>{contactToAddToFolder?.name}</strong> to:
              </p>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                {folders.length > 0 ? (
                  folders.map((folder) => (
                    <button
                      key={folder._id}
                      onClick={() => addContactToFolder(folder)}
                      className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:border-blue-300 hover:bg-blue-50 transition-all group text-left"
                    >
                      <div className="bg-blue-100 p-2 rounded-lg text-blue-600 group-hover:bg-blue-200">
                        <FolderPlus className="w-4 h-4" />
                      </div>
                      <span className="font-medium text-gray-700 group-hover:text-blue-700">
                        {folder.name}
                      </span>
                      <span className="ml-auto text-xs text-gray-400 border border-gray-100 px-2 py-0.5 rounded-full bg-white">
                        {folder.contacts?.length || 0}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="text-center py-6 text-gray-400 border-2 border-dashed border-gray-100 rounded-lg">
                    No folders found
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* The bulk-select handlers set showUpgradeModal for a below-Growth
          plan, but nothing ever rendered it — clicking a row checkbox on
          Trial silently did nothing, with no explanation. */}
      <UpgradeRequiredModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        minPlan="growth"
        feature="Selecting multiple rows"
      />
    </div>
  );
}

export default Contacts;
