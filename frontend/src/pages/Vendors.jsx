import HistoryIcon from "../components/common/HistoryIcon";
import DeleteIcon from "../components/common/DeleteIcon";
import EmptyState from "../components/common/EmptyState";
import BulkDeleteModal from "../components/common/BulkDeleteModal";
import { exportRecordsToCSV } from "../utils/exportRecordsToCSV";
import PdfIcon from "../components/common/PdfIcon";
import VideoIcon from "../components/common/VideoIcon";
import Checkbox from "../components/common/Checkbox";
import PlusIcon from "../components/common/PlusIcon";
import MoreIcon from "../components/common/MoreIcon";
import DownloadIcon from "../components/common/DownloadIcon";
import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { createPortal } from "react-dom";
import useSearchOverlayOpen from "../hooks/useSearchOverlayOpen";
import API from "../services/api";
import { Link } from "react-router-dom";
import {
  X,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Truck,
  CheckSquare,
  Pin,
  PinOff,
  EyeOff,
  ArrowUp, ArrowDown } from "lucide-react";
import VideoTutorialModal from "../components/VideoTutorialModal";
import BulkActions from "../components/BulkActions";
import { formatNumberFixed } from "../utils/numberFormatter";
import QuickVendorForm from "../components/vendor/QuickVendorForm";
import VendorPaymentForm from "../components/vendor/VendorPaymentForm";
import { useLocation } from "react-router-dom";
import ImportVendors from "../components/vendor/ImportVendors";
import toast from "react-hot-toast";
import AppToaster from "../components/AppToaster";
import HighlightText from "../components/common/HighlightText";
import TablePaginationFooter from "../components/common/TablePaginationFooter";
import { getAncestorZoom } from "../utils/domUtils";
import { useTopLoadingSignal } from "../components/common/TopLoadingBar";
import Skeleton from "../components/common/Skeleton";
import TableSkeletonRows from "../components/common/TableSkeletonRows";
import FilterIcon from "../components/common/FilterIcon";
import ExportModal from "../components/common/ExportModal";
import AdvancedFilterPanel from "../components/common/AdvancedFilterPanel";
import ColumnSettingsPanel from "../components/ColumnSettingsPanel";

import SearchIcon from "../components/common/SearchIcon";
import SettingsIcon from "../components/common/SettingsIcon";
import { getPinnedBoundaryOverlayStyle } from "../utils/pinnedColumnShadow";
import { useSubscription } from "../contexts/SubscriptionContext";
import { hasMinPlan } from "../utils/subscriptionHelpers";
import UpgradeRequiredModal from "../components/subscription/UpgradeRequiredModal";
import UploadIcon from "../components/common/UploadIcon";
import EditIcon from "../components/common/EditIcon";
function useOutsideClick(ref, callback) {
  useEffect(() => {
    function handleClickOutside(event) {
      if (ref.current && !ref.current.contains(event.target)) {
        callback();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [ref, callback]);
}

// Fixed columns every vendor has. Custom fields (from vendorFields) are
// appended after these. There is no separate "actions" column: the row-actions
// menu rides along inside the last visible column's cell, same as Companies.
const BASE_COLUMN_DEFS = [
  { id: "name", label: "Name", required: true, width: 200 },
  { id: "company", label: "Company", width: 180 },
  { id: "email", label: "Email", width: 220 },
  { id: "phone", label: "Phone", width: 160 },
  { id: "address", label: "Address", width: 260 },
  // Wider than the others so "CLOSING BALANCE" renders in full rather than
  // truncating to "CLOSING BAL...".
  { id: "balance", label: "Closing Balance", width: 190 },
];
const MIN_COL_WIDTH = 60;

function Vendors() {
  const isSearchOverlayOpen = useSearchOverlayOpen();
  const [vendors, setVendors] = useState([]);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    gstin: "",
    avatar: "",
    balance: 0,
    socialMedia: {
      twitter: "",
      linkedin: "",
      instagram: "",
      facebook: "",
      whatsapp: "",
    },
    address: {
      line1: "",
      line2: "",
      city: "",
      state: "",
      pincode: "",
      country: "India",
    },
  });
  const [vendorFields, setVendorFields] = useState([]);
  const [additionalFieldValues, setAdditionalFieldValues] = useState({});
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [activeFilters, setActiveFilters] = useState([]);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [editVendor, setEditVendor] = useState(null);
  const [selectedVendors, setSelectedVendors] = useState([]);
  const [showBulkActions, setShowBulkActions] = useState(false);
  // Bulk row selection requires Growth+
  const { subscription } = useSubscription();
  const hasBulkAccess = hasMinPlan(subscription?.subscription?.planName, "growth");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Delays the bulk-strip's unmount so it can play a slide-out-right exit
  // animation on deselect (mirroring the slide-in entrance) — same mechanism
  // Companies.jsx uses so the toolbar and the bulk strip feel identical.
  const [showBulkStrip, setShowBulkStrip] = useState(false);
  const [bulkStripClosing, setBulkStripClosing] = useState(false);
  useEffect(() => {
    if (selectedVendors.length > 0) {
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
  }, [selectedVendors.length]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    vendorId: "",
    amount: "",
    paymentDate: new Date().toISOString().split("T")[0],
    paymentType: "Card",
    bank: "",
    notes: "",
    direction: "",
  });
  const [showDropdown, setShowDropdown] = useState(null);
  const [rowActionsPos, setRowActionsPos] = useState(null);
  const dropdownRef = useRef(null);
  const location = useLocation();
  const { state } = location;

  // "View all" from the global search panel hands its query off via
  // `?search=` rather than trying to replicate the search itself — this
  // drops it straight into the table's own search box on arrival (open, not
  // just filled in), so the list is already filtered instead of showing
  // everything.
  //
  // Sets debouncedSearchTerm directly too, skipping the usual typing debounce
  // — a deep link shouldn't sit for 300ms+ showing the wrong list. Captured
  // once, synchronously: the mount-time fetch effect further down needs to
  // know *before its first run* that a search is coming, so it can skip its
  // own empty-search request — otherwise that request (fetching the whole
  // table, so inherently slower) can resolve after the correctly-filtered
  // one and clobber it on screen.
  const initialSearchFromUrl = useRef(
    new URLSearchParams(location.search).get("search")
  ).current;
  useEffect(() => {
    if (initialSearchFromUrl) {
      setSearchTerm(initialSearchFromUrl);
      setDebouncedSearchTerm(initialSearchFromUrl);
      setIsSearchExpanded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [showImport, setShowImport] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [vendorToDelete, setVendorToDelete] = useState(null);

  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 0,
    totalCount: 0,
    limit: 50,
    hasNextPage: false,
    hasPrevPage: false,
  });

  const [sortConfig, setSortConfig] = useState({
    key: null,
    direction: null,
  });

  // Toolbar UI state — same shape as Accounting.jsx's action row.
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef(null);
  const [showColumnSettings, setShowColumnSettings] = useState(false);

  // Click-outside (and scroll) to close the overflow ("⋮") menu — same
  // pattern as Companies.jsx's moreMenuRef listener, plus a scroll close so
  // the menu doesn't drift away from its trigger.
  useEffect(() => {
    if (!showMoreMenu) return;
    const handleClickOutside = (event) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target)) {
        setShowMoreMenu(false);
      }
    };
    const handleScroll = () => setShowMoreMenu(false);
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [showMoreMenu]);

  // Search expand/collapse animation — same mechanics as Companies.jsx: the
  // title/subtitle shrink away and the search pill grows via a width
  // transition, instead of the field just appearing/disappearing.
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const searchInputRef = useRef(null);

  // Column order / visibility / pinning / widths — in-memory only, same
  // scheme as Accounting.jsx (no persistence, matched on purpose for parity).
  const customColumnDefs = useMemo(
    () =>
      (vendorFields || []).map((field) => ({
        id: field.name || field,
        label: field.name || field,
      })),
    [vendorFields]
  );
  const allColumnDefs = useMemo(
    () => [...BASE_COLUMN_DEFS, ...customColumnDefs],
    [customColumnDefs]
  );
  const columnDefById = useMemo(() => {
    const map = {};
    allColumnDefs.forEach((c) => (map[c.id] = c));
    return map;
  }, [allColumnDefs]);

  // Column list handed to the shared ExportModal. Same shape Companies.jsx
  // passes: { key, label, isCustomField }. Every column here is real data —
  // including vendor custom fields — so all of them are offered for export.
  const baseColumnIds = useMemo(
    () => new Set(BASE_COLUMN_DEFS.map((c) => c.id)),
    []
  );
  const exportColumns = useMemo(
    () =>
      allColumnDefs
        .map((c) => ({
          key: c.id,
          label: c.label,
          isCustomField: !baseColumnIds.has(c.id),
        })),
    [allColumnDefs, baseColumnIds]
  );

  const [columnOrder, setColumnOrder] = useState(() =>
    BASE_COLUMN_DEFS.map((c) => c.id)
  );
  const [hiddenCols, setHiddenCols] = useState([]);
  const [pinnedCols, setPinnedCols] = useState({});
  const [colWidths, setColWidths] = useState(() => {
    const widths = { selection: 60 };
    BASE_COLUMN_DEFS.forEach((c) => {
      widths[c.id] = c.width || 180;
    });
    return widths;
  });

  // Custom fields load after the initial fetch; append them to the order and
  // default them hidden, same as the old useColumnSettings-based behaviour
  // ("hidden by default, user can show").
  useEffect(() => {
    if (customColumnDefs.length === 0) return;
    const customIds = customColumnDefs.map((c) => c.id);
    setColumnOrder((prev) => {
      const missing = customIds.filter((id) => !prev.includes(id));
      if (missing.length === 0) return prev;
      return [...prev, ...missing];
    });
    setHiddenCols((prev) => {
      const missing = customIds.filter((id) => !prev.includes(id));
      return missing.length ? [...prev, ...missing] : prev;
    });
    setColWidths((prev) => {
      const next = { ...prev };
      customIds.forEach((id) => {
        if (!(id in next)) next[id] = 180;
      });
      return next;
    });
  }, [customColumnDefs]);

  const orderedColumns = useMemo(
    () =>
      columnOrder
        .map((id) => columnDefById[id])
        .filter((c) => c && !hiddenCols.includes(c.id))
        .sort((a, b) => {
          const rank = (c) =>
            pinnedCols[c.id] === "left"
              ? 0
              : pinnedCols[c.id] === "right"
              ? 2
              : 1;
          return rank(a) - rank(b);
        }),
    [columnOrder, hiddenCols, pinnedCols, columnDefById]
  );

  // The row-actions menu is rendered inside this column's cell instead of in a
  // column of its own. Hiding/reordering/pinning columns moves it along with
  // whatever ends up last, so it is always reachable at the row's right edge.
  const lastColumnId = orderedColumns[orderedColumns.length - 1]?.id;

  const stickyStyles = useMemo(() => {
    const map = {};
    let leftOffset = colWidths.selection;
    for (const c of orderedColumns) {
      if (pinnedCols[c.id] === "left") {
        map[c.id] = { position: "sticky", left: leftOffset, zIndex: 5 };
        leftOffset += colWidths[c.id] || 0;
      }
    }
    let rightOffset = 0;
    for (const c of [...orderedColumns].reverse()) {
      if (pinnedCols[c.id] === "right") {
        map[c.id] = { position: "sticky", right: rightOffset, zIndex: 5 };
        rightOffset += colWidths[c.id] || 0;
      }
    }
    return map;
  }, [orderedColumns, pinnedCols, colWidths]);
  const stickyStyleFor = useCallback(
    (colId) => stickyStyles[colId] || {},
    [stickyStyles]
  );

  // Boundary shadow — same treatment as Companies: a soft edge on the
  // RIGHTMOST left-pinned column and the LEFTMOST right-pinned column, the
  // ones actually touching the scrollable content on screen.
  const lastLeftPinnedKey = useMemo(() => {
    const keys = orderedColumns.filter((c) => pinnedCols[c.id] === "left").map((c) => c.id);
    return keys.length ? keys[keys.length - 1] : null;
  }, [orderedColumns, pinnedCols]);
  const firstRightPinnedKey = useMemo(() => {
    const key = orderedColumns.find((c) => pinnedCols[c.id] === "right")?.id;
    return key || null;
  }, [orderedColumns, pinnedCols]);
  const boundaryShadowSideFor = useCallback(
    (colId) => {
      if (colId === lastLeftPinnedKey) return "left";
      if (colId === firstRightPinnedKey) return "right";
      return null;
    },
    [lastLeftPinnedKey, firstRightPinnedKey]
  );

  const tableWidth = useMemo(
    () => Object.values(colWidths).reduce((a, b) => a + b, 0),
    [colWidths]
  );

  // Column popup menu — one shared portal, same as Accounting.jsx.
  const [openColumnMenuKey, setOpenColumnMenuKey] = useState(null);
  const [columnMenuPos, setColumnMenuPos] = useState(null);
  const closeColumnMenu = useCallback(() => {
    setOpenColumnMenuKey(null);
    setColumnMenuPos(null);
  }, []);
  const openColumnMenu = (e, colId) => {
    e.stopPropagation();
    if (openColumnMenuKey === colId) return closeColumnMenu();
    const zMenu = getAncestorZoom(document.body);
    const MENU_W = 176;
    const MARGIN = 8;
    const rect = e.currentTarget.getBoundingClientRect();
    const viewportW = window.innerWidth / zMenu;
    let left = Math.min(rect.right / zMenu - MENU_W, viewportW - MENU_W - MARGIN);
    left = Math.max(left, MARGIN);
    setColumnMenuPos({ top: rect.bottom / zMenu + 4, left });
    setOpenColumnMenuKey(colId);
  };
  const setColumnPin = useCallback(
    (colId, side) =>
      setPinnedCols((prev) => {
        const next = { ...prev };
        if (next[colId] === side) delete next[colId];
        else next[colId] = side;
        return next;
      }),
    []
  );

  // Column drag-reorder — press, drag past a 5px threshold, drop on another
  // header. Same mechanics as Accounting.jsx / Contacts.jsx.
  const [draggedColKey, setDraggedColKey] = useState(null);
  const [dragOverColKey, setDragOverColKey] = useState(null);
  const [dragGhost, setDragGhost] = useState(null);
  const dragOverRef = useRef(null);
  const ghostElRef = useRef(null);

  const handleColumnReorder = useCallback((draggedKey, targetKey) => {
    if (!draggedKey || draggedKey === targetKey) return;
    setColumnOrder((prev) => {
      const next = [...prev];
      const from = next.indexOf(draggedKey);
      const to = next.indexOf(targetKey);
      if (from === -1 || to === -1) return prev;
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const startColumnDrag = (e, colId) => {
    if (e.button !== 0) return;
    if (e.target.closest("button") || e.target.closest("[data-resize-handle]"))
      return;

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
      el.style.maxHeight = `${
        Math.max(100, window.innerHeight - visualTop - 72) / dragState.zGhost
      }px`;
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
      closeColumnMenu();

      const rect = th.getBoundingClientRect();
      const col = columnDefById[colId];
      const previewRows = vendors.map((v) =>
        String(getFieldValue(v, colId) ?? "").trim() || "—"
      );

      dragState.zGhost = getAncestorZoom(document.body);
      dragState.offsetX = startX - rect.left;
      dragState.offsetY = startY - rect.top;

      dragOverRef.current = null;
      setDraggedColKey(colId);
      setDragOverColKey(null);
      document.body.style.userSelect = "none";
      setDragGhost({
        label: col?.label || colId,
        previewRows,
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

  // Column resize — drag the handle on a header's right border. Start width
  // is read from the rendered <th>, so the handler holds no stale state.
  const resizeRef = useRef(null);
  const startColumnResize = (e, colId) => {
    e.preventDefault();
    e.stopPropagation();
    const th = e.currentTarget.closest("th");
    resizeRef.current = {
      colId,
      startX: e.clientX,
      startWidth: th ? th.getBoundingClientRect().width : MIN_COL_WIDTH,
    };

    const onMove = (moveEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      const next = Math.max(
        MIN_COL_WIDTH,
        r.startWidth + (moveEvent.clientX - r.startX)
      );
      setColWidths((prev) => ({ ...prev, [r.colId]: next }));
    };
    const onUp = () => {
      resizeRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Get field value from vendor
  const getFieldValue = (vendor, columnKey) => {
    if (columnKey === "address") {
      const addressText = [
        vendor.address?.line1,
        vendor.address?.city,
        vendor.address?.state,
        vendor.address?.pincode,
      ]
        .filter(Boolean)
        .join(", ");
      return addressText || "—";
    }
    if (vendor[columnKey] !== undefined) {
      return vendor[columnKey];
    }
    const additionalField = vendor.additionalFields?.find(
      (field) => field.key === columnKey,
    );
    return additionalField?.value || "—";
  };

  const truncateText = (text, maxLength = 30) => {
    if (!text) return "—";
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  const renderCellContent = (vendor, colId) => {
    switch (colId) {
      case "name":
        return (
          <Link
            to={`/vendors/${vendor._id}`}
            className="text-blue-600 font-bold text-sm underline hover:text-blue-700 transition-colors truncate block"
          >
            <HighlightText text={vendor.name} query={searchTerm} />
          </Link>
        );
      case "email":
        return vendor.email ? (
          <a
            href={`mailto:${vendor.email}?body=${encodeURIComponent(`Dear ${vendor.name || "Sir/Madam"},\n\n\nRegards`)}`}
            className="text-sm font-medium text-blue-600 hover:underline transition-colors truncate block"
          >
            <HighlightText text={vendor.email} query={searchTerm} />
          </a>
        ) : (
          <span className="text-sm text-gray-400">—</span>
        );
      case "phone":
        return vendor.phone ? (
          <a
            href={`tel:${vendor.phone}`}
            className="text-sm font-medium text-blue-600 hover:underline transition-colors truncate block"
          >
            <HighlightText text={vendor.phone} query={searchTerm} />
          </a>
        ) : (
          <span className="text-sm text-gray-400">—</span>
        );
      case "company":
        return (
          <span className="text-sm text-gray-700 capitalize font-medium truncate block">
            {vendor.company ? (
              <HighlightText text={vendor.company} query={searchTerm} />
            ) : (
              "—"
            )}
          </span>
        );
      case "address":
        return (
          <span className="text-sm text-gray-700 truncate block">
            <HighlightText
              text={truncateText(getFieldValue(vendor, "address"), 40)}
              query={searchTerm}
            />
          </span>
        );
      case "balance":
        return (
          <span className="text-sm text-gray-700 font-mono">
            ₹{formatNumberFixed(vendor.balance)}
          </span>
        );
      default:
        return (
          <span className="text-sm text-gray-700 truncate block">
            <HighlightText
              text={truncateText(String(getFieldValue(vendor, colId)), 30)}
              query={searchTerm}
            />
          </span>
        );
    }
  };

  const handleCloseDropdown = useCallback(() => {
    setShowDropdown(null);
    setRowActionsPos(null);
  }, []);
  useOutsideClick(dropdownRef, handleCloseDropdown);

  // Row actions live inside the last column's cell now, and those cells clip
  // their overflow — so the menu is portaled to document.body and positioned
  // from the button's own rect, the same approach Companies.jsx uses. Rects are
  // visual px; the portal paints inside the app's dynamic <html> zoom, so they
  // are divided by that zoom. The menu flips above the button when there isn't
  // room below and is clamped to the viewport on both axes.
  const renderRowActionsMenu = (vendor) => {
    const isOpen = showDropdown === vendor._id;
    return (
      <div className="relative flex-shrink-0" onMouseDown={(e) => e.stopPropagation()}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (isOpen) {
              handleCloseDropdown();
              return;
            }
            const zMenu = getAncestorZoom(document.body);
            const MENU_W = 160;
            const MARGIN = 8;
            // 4 items (Edit, Credited, Debited, Delete) + container padding.
            const MENU_H = 176;

            const rect = e.currentTarget.getBoundingClientRect();
            const viewportH = window.innerHeight / zMenu;
            const viewportW = window.innerWidth / zMenu;
            const below = rect.bottom / zMenu + 4;
            const above = rect.top / zMenu - 4;

            const openUp = viewportH - below < MENU_H + MARGIN;
            let calcTop = openUp ? above - MENU_H : below;
            calcTop = Math.max(MARGIN, Math.min(calcTop, viewportH - MENU_H - MARGIN));

            let calcLeft = rect.right / zMenu - MENU_W;
            calcLeft = Math.min(calcLeft, viewportW - MENU_W - MARGIN);
            calcLeft = Math.max(calcLeft, MARGIN);

            setRowActionsPos({ top: calcTop, left: calcLeft });
            setShowDropdown(vendor._id);
          }}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
          title="More actions"
        >
          <MoreIcon className="w-4 h-4" />
        </button>

        {isOpen && rowActionsPos && createPortal(
          <>
            <div className="fixed inset-0 z-[9998]" onClick={handleCloseDropdown} />
            <div
              ref={dropdownRef}
              style={{ position: "fixed", top: rowActionsPos.top, left: rowActionsPos.left }}
              className="w-[160px] z-[9999] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5 animate-in fade-in zoom-in duration-150 origin-top-right"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => {
                  handleEditVendor(vendor);
                  handleCloseDropdown();
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
              >
                <EditIcon className="w-3.5 h-3.5 text-[#1C1B1F]" /> Edit
              </button>
              <button
                onClick={() => {
                  handleOpenPaymentModal(vendor._id, "IN");
                  handleCloseDropdown();
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-green-600 hover:bg-green-50 whitespace-nowrap"
              >
                <HistoryIcon className="w-3.5 h-3.5" /> Credited
              </button>
              <button
                onClick={() => {
                  handleOpenPaymentModal(vendor._id, "OUT");
                  handleCloseDropdown();
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-red-600 hover:bg-red-50 whitespace-nowrap"
              >
                <HistoryIcon className="w-3.5 h-3.5" /> Debited
              </button>
              <div className="w-full border-t border-[#F1F1F5] my-0.5" />
              <button
                onClick={() => {
                  handleDelete(vendor._id);
                  handleCloseDropdown();
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-red-600 hover:bg-red-50 whitespace-nowrap"
              >
                <DeleteIcon className="w-3.5 h-3.5" /> Delete
              </button>
            </div>
          </>,
          document.body
        )}
      </div>
    );
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset to page 1 when the search/filter changes. Skips the initial mount —
  // otherwise it races the first fetch below. Returning `prev` unchanged when
  // already on page 1 avoids handing back a new pagination object on every
  // settled keystroke, which re-rendered the whole list for nothing.
  const skipInitialPageReset = useRef(true);
  useEffect(() => {
    if (skipInitialPageReset.current) {
      skipInitialPageReset.current = false;
      return;
    }
    setPagination((prev) =>
      prev.currentPage === 1 ? prev : { ...prev, currentPage: 1 },
    );
  }, [debouncedSearchTerm, activeFilters]);

  // Skipped on the very first mount when a `?search=` deep link is pending —
  // that leaves the search-term effect above as the only initial fetch,
  // instead of racing an empty-search fetch against it.
  const skipMountFetchForUrlSearch = useRef(!!initialSearchFromUrl);
  useEffect(() => {
    if (skipMountFetchForUrlSearch.current) {
      skipMountFetchForUrlSearch.current = false;
      return;
    }
    fetchVendors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.currentPage, pagination.limit, sortConfig]);

  // Search/filter fetch. Skips the initial mount — the effect above already
  // fires the first fetch, and running both sent two identical requests on
  // every page load (the same guard Companies.jsx uses).
  const skipInitialSearchFetch = useRef(true);
  useEffect(() => {
    if (skipInitialSearchFetch.current) {
      skipInitialSearchFetch.current = false;
      return;
    }
    if (pagination.currentPage === 1) {
      fetchVendors();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchTerm, activeFilters]);

  useEffect(() => {
    fetchVendorFields();
  }, []);

  const fetchVendorFields = async () => {
    try {
      const res = await API.get("/vendor-fields");
      if (res.data?.fields) {
        setVendorFields(res.data.fields);
      }
    } catch (error) {
      console.error("Failed to fetch vendor fields", error);
      toast.error("Failed to fetch vendor fields");
    }
  };

  // Holds the id of the most recent request. Erasing a search term fires one
  // request per settled keystroke, and a slower earlier request could land
  // after a newer one and repaint the list with stale rows — which read as the
  // list "reloading again and again". Only the newest response is applied.
  const vendorRequestIdRef = useRef(0);

  const hasLoadedOnceRef = useRef(false);
  const fetchVendors = async () => {
    const requestId = ++vendorRequestIdRef.current;
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
        params.append("sortBy", "createdAt");
        params.append("sortOrder", "desc");
      }

      if (debouncedSearchTerm.trim()) {
        params.append("search", debouncedSearchTerm.trim());
      }
      if (activeFilters && activeFilters.length > 0) {
        params.append("advancedFilters", JSON.stringify(activeFilters));
      }

      const res = await API.get(`/vendors/pagination?${params.toString()}`);

      // A newer request has been issued since this one started — discard.
      if (requestId !== vendorRequestIdRef.current) return;

      hasLoadedOnceRef.current = true;
      if (res.data.vendors && res.data.pagination) {
        setVendors(res.data.vendors);
        setPagination((prev) => ({
          ...prev,
          currentPage: res.data.pagination.currentPage,
          totalPages: res.data.pagination.totalPages,
          totalCount: res.data.pagination.totalCount,
          hasNextPage: res.data.pagination.hasNextPage,
          hasPrevPage: res.data.pagination.hasPrevPage,
        }));
      } else {
        setVendors(res.data || []);
      }
    } catch (err) {
      if (requestId !== vendorRequestIdRef.current) return;
      if (err.response && err.response.status === 403) {
        toast.error(err.response.data.message || err.response.data.error || "Access denied");
      } else {
        toast.error("Failed to load vendors");
      }
      setVendors([]);
    } finally {
      // Only the newest request owns the loading flag, so a stale response
      // resolving late can't switch the spinner off mid-flight.
      if (requestId === vendorRequestIdRef.current) {
        setLoading(false);
      }
    }
  };

  // Header checkbox: toggles the CURRENT PAGE only — synchronous, no network
  // call. Mirrors Companies.jsx's handleSelectAll exactly (pages/Companies.jsx),
  // which compares against `companies.length` (the current page's array), not
  // the total count across all pages. "Select every matching vendor across
  // every page" is a deliberately separate action — see
  // handleSelectAllAcrossPages below — so a stray click on the header
  // checkbox can't silently select hundreds of off-screen rows.
  const handleSelectAll = () => {
    if (!hasBulkAccess) {
      setShowUpgradeModal(true);
      return;
    }
    if (selectedVendors.length === vendors.length && vendors.length > 0) {
      setSelectedVendors([]);
    } else {
      setSelectedVendors(vendors.map((v) => v._id));
    }
  };

  // Bulk-strip "Select All" button: fetches every vendor id matching the
  // current search/filter, ignoring pagination — mirrors
  // Companies.jsx's handleSelectAllAcrossPages against
  // GET /companies/pagination?allIds=true, backed here by the identical
  // allIds branch in getAllVendorsWithPagination.
  const handleSelectAllAcrossPages = async () => {
    try {
      const params = new URLSearchParams({ allIds: "true" });
      if (debouncedSearchTerm.trim()) params.append("search", debouncedSearchTerm.trim());
      if (activeFilters && activeFilters.length > 0) params.append("advancedFilters", JSON.stringify(activeFilters));

      const res = await API.get(`/vendors/pagination?${params.toString()}`);
      setSelectedVendors(res.data.ids || []);
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to select all rows");
    }
  };

  // Bulk-strip "Deselect All" button: trims the selection back down to just
  // the current page, rather than clearing it entirely — mirrors
  // Companies.jsx's handleDeselectAllExtra. Use "Cancel" (exitSelectionMode)
  // to clear the selection completely and leave selection mode.
  const handleDeselectAllExtra = () => {
    setSelectedVendors(vendors.map((v) => v._id));
  };

  const handleSelectVendor = (vendorId) => {
    if (!hasBulkAccess) {
      setShowUpgradeModal(true);
      return;
    }
    setSelectedVendors((prev) =>
      prev.includes(vendorId)
        ? prev.filter((id) => id !== vendorId)
        : [...prev, vendorId],
    );
  };

  const handleBulkDeleteVendors = async (itemIds) => {
    setBulkDeleting(true);
    try {
      await Promise.all(itemIds.map((id) => API.delete(`/vendors/${id}`)));
      await fetchVendors();
      setSelectedVendors([]);
      setShowBulkActions(false);
      toast.success(`Successfully deleted ${itemIds.length} vendors`);
    } catch (err) {
      toast.error(err.response?.data?.error || "Bulk delete failed");
    } finally {
      setBulkDeleting(false);
    }
  };

  const vendorFieldConfig = {
    fields: [
      { key: "name", label: "Name", type: "text" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "email", label: "Email", type: "email" },
      { key: "company", label: "Company", type: "text" },
      { key: "gstin", label: "GSTIN", type: "text" },
      { key: "address.line1", label: "Address Line 1", type: "text" },
      { key: "address.line2", label: "Address Line 2", type: "text" },
      { key: "address.city", label: "City", type: "text" },
      { key: "address.state", label: "State", type: "text" },
      { key: "address.stateCode", label: "State Code", type: "text" },
      { key: "address.pincode", label: "Pincode", type: "text" },
      { key: "address.country", label: "Country", type: "text" },
      ...vendorFields.map((field) => ({
        key: field.name || field,
        label: field.name || field,
        type: field.type || "text",
        isCustomField: true,
        options: field.options,
      })),
    ],
  };

  const handleBulkUpdateVendors = async ({ field, value, itemIds }) => {
    try {
      await Promise.all(
        itemIds.map((id) => {
          let payload = {};
          if (field.includes("address.")) {
            const addressField = field.split(".")[1];
            payload.address = { [addressField]: value };
          } else if (vendorFields.some((f) => (f.name || f) === field)) {
            payload.additionalFields = [{ key: field, value }];
          } else {
            payload[field] = value;
          }
          return API.put(`/vendors/${id}`, payload);
        }),
      );
      await fetchVendors();
      setSelectedVendors([]);
      setShowBulkActions(false);
      toast.success(`Successfully updated ${itemIds.length} vendors`);
    } catch (err) {
      toast.error(err.response?.data?.error || "Bulk update failed");
    }
  };

  const handleAddPayment = async (payload) => {
    try {
      await API.post(`/vendors/${payload.vendor}/payments`, payload);
      // Net Balance is Total Given - Total Got, derived server-side from the
      // Payment rows. Adjust the row optimistically in the same direction the
      // server will compute, rather than by the old inverted rule.
      setVendors((prevVendors) =>
        prevVendors.map((vendor) => {
          if (vendor._id !== payload.vendor) return vendor;
          const amount = parseFloat(payload.amount) || 0;
          const isOut = payload.direction === "OUT";
          const totalGiven = (vendor.totalGiven || 0) + (isOut ? amount : 0);
          const totalGot = (vendor.totalGot || 0) + (isOut ? 0 : amount);
          return { ...vendor, totalGiven, totalGot, netBalance: totalGiven - totalGot, balance: totalGiven - totalGot };
        }),
      );
      toast.success("Payment added successfully");
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to add payment");
    }
  };

  const handleOpenPaymentModal = (vendorId, direction) => {
    setPaymentForm({
      vendorId,
      amount: "",
      paymentDate: new Date().toISOString().split("T")[0],
      paymentType: "Card",
      bank: "",
      notes: "",
      direction,
    });
    setShowPaymentModal(true);
    setShowDropdown(null);
  };

  const handleEditVendor = async (vendor) => {
    try {
      const response = await API.get(`/vendors/${vendor._id}`);
      // Edit via the shared QuickVendorForm (same as create).
      setEditVendor(response.data);
      setShowQuickAdd(true);
    } catch (error) {
      console.error("Error fetching vendor:", error);
      toast.error("Failed to load vendor data");
    }
  };

  const resetForm = () => {
    setForm({
      name: "",
      email: "",
      phone: "",
      company: "",
      gstin: "",
      avatar: "",
      socialMedia: {
        twitter: "",
        linkedin: "",
        facebook: "",
      },
      address: {
        line1: "",
        line2: "",
        city: "",
        state: "",
        pincode: "",
        country: "India",
      },
      balance: 0,
    });
    setAdditionalFieldValues({});
  };

  const handleDelete = async (vendorId) => {
    setVendorToDelete(vendorId);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!vendorToDelete) return;

    const loadingToast = toast.loading("Deleting vendor...");

    try {
      setLoading(true);
      await API.delete(`/vendors/${vendorToDelete}`);
      await fetchVendors();
      setSelectedVendors([]);
      toast.success("Vendor deleted successfully!", { id: loadingToast });
    } catch (err) {
      let errorMessage = "Failed to delete vendor";
      if (err.response && err.response.status === 402) {
        errorMessage = err.response.data.message || "An active subscription is required to make changes.";
      } else if (err.response && err.response.status === 403) {
        errorMessage = err.response.data.message || err.response.data.error || "Access denied";
      }
      toast.error(errorMessage, { id: loadingToast });
    } finally {
      setLoading(false);
      setShowDeleteModal(false);
      setVendorToDelete(null);
    }
  };

  const handlePageChange = (newPage) => {
    if (
      newPage >= 1 &&
      newPage <= pagination.totalPages &&
      newPage !== pagination.currentPage
    ) {
      setPagination((prev) => ({ ...prev, currentPage: newPage }));
      setSelectedVendors([]);
    }
  };

  const handleLimitChange = (newLimit) => {
    setPagination((prev) => ({
      ...prev,
      limit: newLimit,
      currentPage: 1,
    }));
    setSelectedVendors([]);
  };

  const exitSelectionMode = () => {
    setSelectedVendors([]);
  };

  // Converts the existing columnOrder/hiddenCols state into the shape
  // ColumnSettingsPanel expects, and translates saves back to state.
  const columnsForSettings = useMemo(
    () =>
      columnOrder
        .map((id, idx) => {
          const def = columnDefById[id];
          if (!def) return null;
          const isBase = BASE_COLUMN_DEFS.some((c) => c.id === id);
          return {
            key: id,
            label: def.label,
            visible: !hiddenCols.includes(id),
            order: idx,
            required: def.required || false,
            isCustomField: !isBase,
            defaultVisible: isBase,
          };
        })
        .filter(Boolean),
    [columnOrder, hiddenCols, columnDefById]
  );

  const handleSaveVendorColumns = (savedColumns) => {
    const newOrder = savedColumns.map((c) => c.key);
    const newHidden = savedColumns.filter((c) => !c.visible).map((c) => c.key);
    setColumnOrder(newOrder);
    setHiddenCols(newHidden);
  };

  // Columns exposed to the AdvancedFilterPanel — mirrors the base column set
  // plus any custom vendor fields loaded from the server.
  const filterColumns = useMemo(() => [
    { key: "name", label: "Name" },
    { key: "company", label: "Company" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "balance", label: "Closing Balance" },
    ...vendorFields.map((f) => ({
      key: f.name || f,
      label: f.name || f,
      isCustomField: true,
      options: f.options,
    })),
  ], [vendorFields]);

  // One flag drives every skeleton on the page — header, table body, and
  // pagination all appear and resolve together, same as Companies.jsx.
  // Tracks the fetch exactly - no minimum hold, so the skeleton clears the
  // moment data lands.
  // Skeleton on the FIRST load only, same rule as the Purchase/Sales pages. Without the
  // hasLoadedOnceRef check, an empty table swapped to skeleton rows on every refetch (each settled
  // search keystroke) and back, a visible flicker that never shows when rows are on screen.
  const showLoadingSkeleton = loading && vendors.length === 0 && !hasLoadedOnceRef.current;
  // `loading` toggles around every fetchVendors() call, including page/limit
  // changes — same source Companies.jsx feeds its top-edge bar from, so
  // paging here now gets the identical progress flash Companies.jsx shows.
  const [showVideoTutorial, setShowVideoTutorial] = useState(false);

  return (
    <>
      <AppToaster />
      <VideoTutorialModal
        isOpen={showVideoTutorial}
        onClose={() => setShowVideoTutorial(false)}
        title="Vendors Module Guide"
      />

      {/* Fixed toolbar — same positioning Companies.jsx uses (pinned right
          below the app header, not part of the scrolling page), and the
          same trick for bulk mode: instead of a banner pushed below the
          toolbar, the bulk-action strip slides in and takes over this exact
          bar, so nothing shifts and it feels identical to Companies.jsx. */}
      <div
        className={`fixed right-0 h-16 px-4 sm:px-6 lg:px-8 border-b flex items-center top-[calc(54px+var(--dc-offline-offset,0px))] lg:top-[calc(64px+var(--dc-offline-offset,0px))] ${
          "bg-white border-[#E1E4EA]"
        }`}
        style={{ left: "var(--sidebar-width, 0px)", zIndex: 40 }}
      >
        {showBulkStrip ? (
          <div
            className={`${
              bulkStripClosing ? "animate-slideOutRight" : "animate-slideInLeft"
            } flex flex-nowrap items-center justify-between gap-4 w-full h-full overflow-x-auto`}
          >
            {/* One joined strip instead of separate pills, matching Companies:
                no gap between buttons, square inner edges, rounding only on the
                two outer corners, and each border pulled left by 1px (-ml-px)
                onto its neighbour so touching borders don't double up into a
                thick seam. All buttons share one neutral treatment — white fill,
                grey border, near-black text — with only the icon carrying each
                action's colour as an accent. */}
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
                disabled={bulkDeleting}
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
            <div className="flex flex-nowrap items-center gap-3 flex-shrink-0">
              <CheckSquare className="w-5 h-5 text-blue-600 flex-shrink-0" />
              <span className="text-blue-800 font-semibold font-inter whitespace-nowrap">
                {selectedVendors.length} vendor
                {selectedVendors.length !== 1 ? "s" : ""} selected
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
              className={`flex-shrink-0 flex flex-col justify-center gap-1.5 overflow-hidden transition-opacity duration-300 ease-in-out lg:!w-auto lg:!opacity-100 ${
                isSearchExpanded ? "w-0 opacity-0" : "w-[190px] opacity-100"
              }`}
            >
              {showLoadingSkeleton ? (
                <>
                  <Skeleton width={80} height={18} className="mb-1" />
                  <Skeleton width={130} height={12} />
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <h1 className="m-0 leading-tight font-bold text-base sm:text-lg text-gray-900 truncate">Vendors</h1>
                    <VideoIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </div>
                  <p className="m-0 leading-tight text-[10px] sm:text-xs text-gray-500 font-inter truncate">
                    Manage your vendors.
                  </p>
                </>
              )}
            </div>

            <div className="hidden lg:block lg:flex-1" />

        {showLoadingSkeleton ? (
          <div className="flex items-center gap-2 flex-shrink-0">
            <Skeleton width={40} height={40} shape="circle" />
            <Skeleton width={40} height={40} shape="circle" />
            <Skeleton width={40} height={40} shape="circle" />
            <Skeleton width={130} height={40} shape="circle" />
          </div>
        ) : (
        <div className="flex flex-row items-center gap-2 h-10 justify-end min-w-0 flex-1 lg:flex-initial lg:flex-shrink-0">
          <div
            className={`relative h-10 flex items-center border border-[#E1E4EA] rounded-full bg-white transition-all duration-300 ease-in-out hover:bg-gray-50 focus-within:border-[#0085FF] focus-within:hover:bg-white min-w-0 max-w-full ${
              isSearchExpanded ? "flex-1 lg:flex-initial lg:w-[380px]" : "w-10 flex-shrink-0"
            }`}
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
              placeholder="Search by vendor name, ID, company, or email..."
              className={`w-full h-full bg-transparent rounded-full pl-11 pr-9 text-[14px] leading-[20px] text-[#1F2937] placeholder:text-[#99A0AE] focus:outline-none transition-opacity duration-200 cursor-pointer ${
                isSearchExpanded ? "opacity-100 focus:cursor-text" : "opacity-0"
              }`}
            />
            {/* Clears the typed text only — mousedown+preventDefault stops the
                input's onBlur from firing before the click lands. */}
            {isSearchExpanded && searchTerm && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setSearchTerm("")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-5 h-5 rounded-full text-gray-900 hover:bg-gray-100 transition-colors"
              >
                <X className="w-3.5 h-3.5" strokeWidth={2.5} />
              </button>
            )}
          </div>

          <div className="relative flex-shrink-0 hidden lg:block">
            <button
              title="Filters"
              onClick={() => setShowAdvancedFilters(true)}
              className={`relative flex items-center justify-center w-10 h-10 rounded-full border transition-colors bg-white ${
                activeFilters.length > 0
                  ? "border-[#0085FF] text-[#0085FF]"
                  : "border-[#E1E4EA] text-gray-500 hover:bg-gray-50"
              }`}
            >
              <FilterIcon size={16} className={activeFilters.length > 0 ? "text-[#0085FF]" : ""} />
              {activeFilters.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-[#0085FF] text-white text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full">
                  {activeFilters.length}
                </span>
              )}
            </button>
          </div>

          <div className="relative flex-shrink-0" ref={moreMenuRef}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMoreMenu((v) => !v);
              }}
              title="More"
              className="flex items-center justify-center w-10 h-10 rounded-full border border-[#E1E4EA] text-gray-800 hover:bg-gray-50 transition-colors bg-white"
            >
              <MoreIcon className="w-4 h-4" />
            </button>
            {showMoreMenu && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-lg border border-[#E1E4EA] py-1 z-50"
              >
                {/* Filters — hidden on mobile as a standalone button; folded
                    in here instead. */}
                <button
                  onClick={() => {
                    setShowAdvancedFilters(true);
                    setShowMoreMenu(false);
                  }}
                  className="lg:hidden w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <FilterIcon size={16} />
                  Filters
                  {activeFilters.length > 0 && (
                    <span className="ml-auto bg-[#0085FF] text-white text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full">
                      {activeFilters.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => {
                    setShowImport((v) => !v);
                    setShowMoreMenu(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <UploadIcon className="w-4 h-4 text-gray-400" />
                  {showImport ? "Hide Import" : "Import"}
                </button>
                <button
                  onClick={() => {
                    setShowColumnSettings(true);
                    setShowMoreMenu(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <SettingsIcon className="w-4 h-4 text-gray-400" />
                  Column Settings
                </button>
                <Link
                  to="/settings/forms?module=Vendor"
                  onClick={() => setShowMoreMenu(false)}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <PdfIcon className="w-4 h-4 text-gray-400" />
                  Forms
                </Link>
              </div>
            )}
          </div>

          <button
            onClick={() => {
              setEditVendor(null);
              setShowQuickAdd((v) => !v);
            }}
            title={showQuickAdd && !editVendor ? "Cancel" : "Add Vendor"}
            className="h-10 w-10 lg:w-auto lg:px-4 flex items-center justify-center gap-1.5 bg-[#0085FF] hover:bg-blue-600 rounded-full transition-colors flex-shrink-0 ml-1"
          >
            <PlusIcon className="w-4 h-4 text-white flex-shrink-0" />
            <span className="hidden lg:inline text-white text-[14px] font-medium leading-[20px] whitespace-nowrap">
              {showQuickAdd && !editVendor ? "Cancel" : "Add Vendor"}
            </span>
          </button>
        </div>
        )}
            </div>
        )}
      </div>

      {/* Single shared form for both create and edit vendor. */}
      {(showQuickAdd || state?.showAddForm) && (
        <QuickVendorForm
          editVendor={editVendor}
          onVendorCreated={() => {
            fetchVendors();
            setShowQuickAdd(false);
            if (state) state.showAddForm = false;
          }}
          onVendorUpdated={() => {
            fetchVendors();
            setShowQuickAdd(false);
            setEditVendor(null);
          }}
          onRequestClose={() => {
            setShowQuickAdd(false);
            setEditVendor(null);
            if (state) state.showAddForm = false;
          }}
        />
      )}

      {showImport && (
        <ImportVendors
          isOpen={true}
          onClose={() => setShowImport(false)}
          vendorFieldNames={vendorFields}
          onImportSuccess={fetchVendors}
        />
      )}

      {/* Fixed table area — same offsets Companies.jsx uses: starts right
          below the 64px toolbar (which itself starts below the 54/64px app
          header), and stops 64px short of the bottom to leave room for the
          fixed pagination bar. */}
      <div
        className="overflow-x-auto overflow-y-auto top-[calc(118px+var(--dc-offline-offset,0px))] lg:top-[calc(128px+var(--dc-offline-offset,0px))]"
        style={{
          position: "fixed",
          left: "var(--sidebar-width, 0px)",
          right: 0,
          bottom: pagination.totalCount > 0 ? 64 : 0,
        }}
      >
        {/* Hidden columns are recoverable — same affordance as Accounting.jsx. */}
        {hiddenCols.length > 0 && (
          <div className="flex justify-end p-2 sticky left-0">
            <button
              onClick={() => setHiddenCols([])}
              className="h-8 px-3 flex items-center gap-1.5 rounded-full bg-white border border-[#E1E4EA] shadow-sm text-xs font-medium text-[#525866] hover:bg-gray-50 transition-colors"
            >
              Show {hiddenCols.length} hidden column
              {hiddenCols.length > 1 ? "s" : ""}
            </button>
          </div>
        )}

        {/* No border-t: the toolbar strip right above already has its own
            border-b, so a top border here would double up against it. No
            border-b either when there's no data — the table shrinks to just
            the header + the "No vendors yet" row, so that border would sit
            right under it as a second stray line with an odd gap instead of
            closing off a real table body. Same fix as Companies.jsx. */}
        <div className={`bg-white border-r border-[#E1E4EA] ${showLoadingSkeleton || vendors.length > 0 ? "border-b" : ""}`} style={{ paddingLeft: "var(--content-inset, 16px)" }}>
          <table
            className="border-separate border-spacing-0 text-left"
            style={{ minWidth: "100%", width: tableWidth, tableLayout: "fixed" }}
          >
            <thead className="bg-[#F5F7FA] sticky top-0 z-20 select-none">
              <tr>
                <th
                  data-col-id="selection"
                  style={{ width: colWidths.selection, position: "sticky", left: 0, zIndex: 10 }}
                  className="px-4 py-3 border-b border-r border-[#E1E4EA] bg-[#F5F7FA]"
                >
                  <div className="flex justify-center items-center w-full">
                    <Checkbox checked={
                        selectedVendors.length === vendors.length &&
                        vendors.length > 0
                      } onChange={handleSelectAll}  uncheckedColor="text-[#525866]"/>
                  </div>
                </th>

                {orderedColumns.map((col) => {
                  const isSortable = col.sortable !== false;
                  const isDragging = draggedColKey === col.id;
                  const isDragOver =
                    dragOverColKey === col.id &&
                    draggedColKey &&
                    draggedColKey !== col.id;

                  return (
                    <th
                      key={col.id}
                      data-col-id={col.id}
                      onMouseDown={(e) => startColumnDrag(e, col.id)}
                      title="Drag to move this column"
                      style={{
                        width: colWidths[col.id],
                        opacity: isDragging ? 0.35 : 1,
                        ...stickyStyleFor(col.id),
                      }}
                      className={`relative px-4 py-3 text-left text-sm font-bold text-[#525866] whitespace-nowrap border-b border-r border-[#E1E4EA] transition-colors ${
                        isDragOver
                          ? "bg-blue-100"
                          : "bg-[#F5F7FA] hover:bg-[#EDF0F5]"
                      } ${
                        draggedColKey ? "cursor-grabbing" : "cursor-grab"
                      } active:cursor-grabbing`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate flex-1 min-w-0 flex items-center gap-1.5">
                          <span className="truncate">{col.label}</span>
                          {sortConfig.key === col.id && (sortConfig.direction === "asc"
                            ? <ArrowUp className="w-3 h-3 text-[#0085FF] flex-shrink-0" />
                            : <ArrowDown className="w-3 h-3 text-[#0085FF] flex-shrink-0" />)}
                          {pinnedCols[col.id] && (
                            <Pin
                              size={12}
                              className="text-blue-500 fill-blue-500 flex-shrink-0 ml-1"
                            style={{ transform: "rotate(45deg)" }}
                            />
                          )}
                        </span>

                        <button
                          onClick={(e) => openColumnMenu(e, col.id)}
                          title="Column options"
                          className="p-1 rounded hover:bg-gray-200 transition-colors text-gray-500 flex-shrink-0"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div
                        data-resize-handle="true"
                        onMouseDown={(e) => startColumnResize(e, col.id)}
                        onClick={(e) => e.stopPropagation()}
                        title="Drag to resize column"
                        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none z-30 hover:bg-[#0085FF]/40 active:bg-[#0085FF]"
                      />
                      {boundaryShadowSideFor(col.id) && (
                        <div style={getPinnedBoundaryOverlayStyle(boundaryShadowSideFor(col.id))} />
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="bg-white">
              {showLoadingSkeleton && (
                <TableSkeletonRows
                  numRows={pagination.limit}
                  columns={orderedColumns.map((c) => colWidths[c.id])}
                  hasCheckbox
                  checkboxWidth={colWidths.selection}
                />
              )}
              {!showLoadingSkeleton && vendors.length === 0 && (
                <tr>
                  <td colSpan={orderedColumns.length + 1}>
                    <EmptyState
                      icon={Truck}
                      noun="Vendor"
                      isFiltered={!!(debouncedSearchTerm || activeFilters?.length)}
                      onCreate={() => {
                        setEditVendor(null);
                        setShowQuickAdd(true);
                      }}
                    />
                  </td>
                </tr>
              )}
              {!showLoadingSkeleton &&
                vendors.map((vendor) => (
                  <tr
                    key={vendor._id}
                    className={`bg-white hover:bg-blue-50 transition-colors ${
                      selectedVendors.includes(vendor._id) ? "!bg-blue-50" : ""
                    }`}
                    style={{ height: 37, maxHeight: 37 }}
                  >
                    <td
                      style={{
                        width: colWidths.selection,
                        position: "sticky",
                        left: 0,
                        zIndex: 4,
                      }}
                      className="px-4 py-2 align-middle border-b border-r border-[#E1E4EA] bg-inherit overflow-hidden"
                    >
                      <div className="flex justify-center items-center w-full">
                        <Checkbox checked={selectedVendors.includes(vendor._id)} onChange={() => handleSelectVendor(vendor._id)} />
                      </div>
                    </td>

                    {orderedColumns.map((col) => (
                      <td
                        key={col.id}
                        style={{ width: colWidths[col.id], ...stickyStyleFor(col.id) }}
                        className="relative px-4 py-2 align-middle whitespace-nowrap border-b border-r border-[#E1E4EA] bg-inherit"
                      >
                        <div style={{ overflow: "hidden" }}>
                          {col.id === lastColumnId ? (
                            <div className="flex items-center justify-between w-full gap-2">
                              <div className="min-w-0 flex-1">
                                {renderCellContent(vendor, col.id)}
                              </div>
                              {renderRowActionsMenu(vendor)}
                            </div>
                          ) : (
                            renderCellContent(vendor, col.id)
                          )}
                        </div>
                        {boundaryShadowSideFor(col.id) && (
                          <div style={getPinnedBoundaryOverlayStyle(boundaryShadowSideFor(col.id))} />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination — its own fixed strip pinned to the bottom */}
      {(showLoadingSkeleton || pagination.totalCount > 0) && (
        <div
          className={`fixed bottom-0 right-0 bg-white border-t border-[#E1E4EA] shadow-sm z-[9992] flex items-center ${isSearchOverlayOpen ? "pointer-events-none" : ""}`}
          style={{
            left: "var(--sidebar-width, 0px)",
            height: 64,
            filter: isSearchOverlayOpen ? "brightness(0.6)" : "none",
          }}
        >
          {showLoadingSkeleton ? (
            <div className="w-full px-4 py-3 flex items-center justify-between sm:px-6">
              <Skeleton width={190} height={14} />
              <div className="flex items-center gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} width={32} height={32} shape="circle" />
                ))}
              </div>
            </div>
          ) : (
            <TablePaginationFooter
              currentPage={pagination.currentPage}
              totalPages={pagination.totalPages}
              totalCount={pagination.totalCount}
              limit={pagination.limit}
              onPageChange={handlePageChange}
              onLimitChange={handleLimitChange}
              className="w-full px-4 py-3 flex items-center justify-between sm:px-6"
            />
          )}
        </div>
      )}

      {/* Shared column popup — one menu, used by every column. */}
      {openColumnMenuKey &&
        columnMenuPos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[9998]" onClick={closeColumnMenu} />
            <div
              style={{
                position: "fixed",
                top: columnMenuPos.top,
                left: columnMenuPos.left,
              }}
              className="w-[176px] z-[9999] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5"
            >
              {(() => {
                const col = columnDefById[openColumnMenuKey];
                if (!col) return null;
                const side = pinnedCols[col.id];
                const isSortable = col.sortable !== false;
                const itemClass =
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap";

                return (
                  <>
                    <button
                      onClick={() => {
                        closeColumnMenu();
                        setColumnPin(col.id, "left");
                      }}
                      className={`${itemClass} ${
                        side === "left"
                          ? "bg-blue-50 text-blue-700"
                          : "text-[#161618] hover:bg-gray-50"
                      }`}
                    >
                      {side === "left" ? (
                        <PinOff className="w-3.5 h-3.5" />
                      ) : (
                        <Pin className="w-3.5 h-3.5 text-[#1C1B1F]" />
                      )}
                      {side === "left" ? "Unpin" : "Pin to Left"}
                    </button>
                    <button
                      onClick={() => {
                        closeColumnMenu();
                        setColumnPin(col.id, "right");
                      }}
                      className={`${itemClass} ${
                        side === "right"
                          ? "bg-blue-50 text-blue-700"
                          : "text-[#161618] hover:bg-gray-50"
                      }`}
                    >
                      {side === "right" ? (
                        <PinOff className="w-3.5 h-3.5" />
                      ) : (
                        <Pin className="w-3.5 h-3.5 text-[#1C1B1F]" />
                      )}
                      {side === "right" ? "Unpin" : "Pin to Right"}
                    </button>

                    {isSortable && (
                      <>
                        <button
                          onClick={() => {
                            closeColumnMenu();
                            const isActive = sortConfig.key === col.id && sortConfig.direction === "asc";
                            setSortConfig(isActive ? { key: null, direction: null } : { key: col.id, direction: "asc" });
                            setPagination((prev) => ({ ...prev, currentPage: 1 }));
                          }}
                          className={`${itemClass} ${sortConfig.key === col.id && sortConfig.direction === "asc" ? "bg-blue-50 text-blue-700 font-medium" : "text-[#161618] hover:bg-gray-50"}`}
                        >
                          <ChevronUp className="w-3.5 h-3.5 text-[#1C1B1F]" />
                          Sort Ascending
                        </button>
                        <button
                          onClick={() => {
                            closeColumnMenu();
                            const isActive = sortConfig.key === col.id && sortConfig.direction === "desc";
                            setSortConfig(isActive ? { key: null, direction: null } : { key: col.id, direction: "desc" });
                            setPagination((prev) => ({ ...prev, currentPage: 1 }));
                          }}
                          className={`${itemClass} ${sortConfig.key === col.id && sortConfig.direction === "desc" ? "bg-blue-50 text-blue-700 font-medium" : "text-[#161618] hover:bg-gray-50"}`}
                        >
                          <ChevronDown className="w-3.5 h-3.5 text-[#1C1B1F]" />
                          Sort Descending
                        </button>
                      </>
                    )}

                    <div className="w-full border-t border-[#F1F1F5] my-0.5" />

                    <button
                      disabled={col.required}
                      onClick={() => {
                        if (col.required) return;
                        closeColumnMenu();
                        setHiddenCols((prev) => [...prev, col.id]);
                      }}
                      className={`${itemClass} ${
                        col.required
                          ? "text-gray-300 cursor-not-allowed"
                          : "text-[#161618] hover:bg-gray-50"
                      }`}
                    >
                      <EyeOff
                        className={`w-3.5 h-3.5 ${
                          col.required ? "text-gray-300" : "text-[#1C1B1F]"
                        }`}
                      />
                      Hide Column
                    </button>
                  </>
                );
              })()}
            </div>
          </>,
          document.body
        )}

      {/* Drag ghost */}
      {dragGhost &&
        createPortal(
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
            <div
              className="px-4 py-3 bg-[#F5F7FA] border-b border-[#E1E4EA]"
              style={{ height: dragGhost.height }}
            >
              <span className="text-sm font-bold text-[#525866] truncate block">
                {dragGhost.label}
              </span>
            </div>
            {dragGhost.previewRows.map((rowVal, i) => (
              <div
                key={i}
                className="px-4 py-2 border-b border-[#F1F1F5] last:border-b-0"
              >
                <span className="text-sm text-gray-700 truncate block">
                  {rowVal}
                </span>
              </div>
            ))}
          </div>,
          document.body
        )}

      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-[10000]">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-red-100 p-2 rounded-lg">
                <DeleteIcon className="w-4 h-4 text-red-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-800 font-sf">
                Delete Vendor
              </h2>
            </div>
            <p className="text-gray-600 mb-6 font-inter">
              Are you sure you want to delete this vendor? This action cannot
              be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setVendorToDelete(null);
                }}
                className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-inter font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={loading}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium font-inter flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <DeleteIcon className="w-4 h-4" />
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk delete confirmation — same structure as Companies.jsx's. */}
      <BulkDeleteModal
        isOpen={showBulkDeleteModal}
        message={
          <>
            Are you sure you want to delete <strong>{selectedVendors.length}</strong> vendor
            {selectedVendors.length !== 1 ? "s" : ""}? This action cannot be undone.
          </>
        }
        loading={bulkDeleting}
        onCancel={() => setShowBulkDeleteModal(false)}
        onConfirm={async () => {
          await handleBulkDeleteVendors(selectedVendors);
          setShowBulkDeleteModal(false);
        }}
        onExportBeforeDelete={() => {
          const records = vendors.filter((v) => selectedVendors.includes(v._id));
          exportRecordsToCSV(records, "vendors");
        }}
      />

      <VendorPaymentForm
        open={showPaymentModal}
        vendorId={paymentForm.vendorId}
        direction={paymentForm.direction}
        onSave={handleAddPayment}
        onClose={() => {
          setShowPaymentModal(false);
        }}
        vendors={vendors}
      />

      <BulkActions
        isOpen={showBulkActions}
        onClose={() => setShowBulkActions(false)}
        selectedItems={vendors.filter((v) => selectedVendors.includes(v._id))}
        onBulkUpdate={handleBulkUpdateVendors}
        onBulkDelete={handleBulkDeleteVendors}
        fieldConfig={vendorFieldConfig}
        module="vendors"
      />

      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        columns={exportColumns}
        selectedIds={selectedVendors}
        exportUrl="/vendors/export-selected"
        fileName="Exported_Vendors.csv"
      />

      <UpgradeRequiredModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        minPlan="growth"
        feature="Selecting multiple rows"
      />

      <AdvancedFilterPanel
        isOpen={showAdvancedFilters}
        onClose={() => setShowAdvancedFilters(false)}
        columns={filterColumns}
        filters={activeFilters}
        setFilters={setActiveFilters}
        onApply={(newFilters) => setActiveFilters(newFilters)}
        title="Filter Vendors"
        subtitle="Find specific vendors quickly"
        emptyStateText="Add a rule to narrow down your vendor list."
      />

      <ColumnSettingsPanel
        isOpen={showColumnSettings}
        onClose={() => setShowColumnSettings(false)}
        columns={columnsForSettings}
        onSave={handleSaveVendorColumns}
        moduleName="Vendors"
      />
    </>
  );
}

export default Vendors;
