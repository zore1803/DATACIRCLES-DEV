import HistoryIcon from "../components/common/HistoryIcon";
import { resolveLowStockThreshold } from "../utils/variantResolve";
import Checkbox from "../components/common/Checkbox";
import PlusIcon from "../components/common/PlusIcon";
import MoreIcon from "../components/common/MoreIcon";
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  X, ChevronDown, ChevronUp, EyeOff, Minus,
  ChevronLeft, ChevronRight, Pin, PinOff, Package,
  TrendingDown, Boxes, IndianRupee, Wallet, ArrowRight, Check, ArrowUp, ArrowDown, Layers } from "lucide-react";
import * as XLSX from "xlsx";
import { formatINR } from "../utils/clientExport";
import BulkActionBar from "../components/common/BulkActionBar";
import SearchIcon from "../components/common/SearchIcon";
import SettingsIcon from "../components/common/SettingsIcon";
import FilterIcon from "../components/common/FilterIcon";
import AdvancedFilterPanel from "../components/common/AdvancedFilterPanel";
import API from "../services/api";
import toast from "react-hot-toast";
import TableSkeletonRows from "../components/common/TableSkeletonRows";
import { useTopLoadingSignal } from "../components/common/TopLoadingBar";
import { getAncestorZoom } from "../utils/domUtils";
import { useColumnSettings } from "../hooks/useColumnSettings";
import ColumnSettingsPanel from "../components/ColumnSettingsPanel";
import { getPinnedBoundaryOverlayStyle } from "../utils/pinnedColumnShadow";
import PageSkeleton from "../components/common/PageSkeleton";
import StockMovementModal from "../components/inventory/StockMovementModal";
import BulkActions from "../components/BulkActions";
import HighlightText from "../components/common/HighlightText";
import StatTile from "../components/common/StatTile";
import EyeIcon from "../components/common/EyeIcon";

/* ─── Column definitions ───────────────────────────────────────────── */
const DEFAULT_COL_WIDTHS = {
  selection: 60,
  item: 260,
  category: 160,
  currentStock: 140,
  status: 150,
  purchasePrice: 150,
  sellingPrice: 150,
  stockValue: 160,
  lastUpdated: 180,
};
const MIN_COL_WIDTH = 60;
// Matches Deals.jsx / PaymentsTimeline.jsx KPI band height so the pages line up.
const KPI_BAND_HEIGHT = 104;
// Bottom edge of the fixed toolbar (top-16 = 64px offset + h-16 = 64px tall).
// The KPI band and the table both hang off this, so they sit flush against the
// toolbar and against each other — hardcoding 126/130 here left a 2px overlap
// above and a 4px white gap between the KPI band and the table header.
const TOOLBAR_BOTTOM = 128;

const ALL_COLUMNS = [
  { id: "item",          key: "item",          label: "Item" },
  { id: "category",      key: "category",      label: "Category" },
  { id: "currentStock",  key: "currentStock",  label: "Qty" },
  { id: "status",        key: "status",        label: "Status" },
  { id: "purchasePrice", key: "purchasePrice", label: "Purchase Price" },
  { id: "sellingPrice",  key: "sellingPrice",  label: "Sale Price" },
  { id: "stockValue",    key: "stockValue",    label: "Stock Value" },
  { id: "lastUpdated",   key: "lastUpdated",   label: "Last Updated" },
];

const money = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* When a product has variants, stock is tracked per-variant (variant.stock) — the parent
   item's own inventory.currentStock is never touched for a variant product, so reading it
   directly showed 0/stale numbers for anything with variants. Sum the variants instead;
   fall back to the item's own currentStock for non-variant products. */
const getItemStock = (item) =>
  item.variants && item.variants.length > 0
    ? item.variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0)
    : Number(item.inventory?.currentStock) || 0;

/* When an item has variants, its own purchasePrice/sellingPrice stay 0 —
   pricing lives per-variant (mirrors ProductsServices.jsx:getVariantPriceDisplay).
   Return {min, max} across variants, or {min: parent, max: parent} for non-variant items. */
const getItemPriceRange = (item, field) => {
  if (item.variants && item.variants.length > 0) {
    const values = item.variants.map((v) => Number(v[field]) || 0);
    return { min: Math.min(...values), max: Math.max(...values), hasVariants: true };
  }
  const v = Number(item[field]) || 0;
  return { min: v, max: v, hasVariants: false };
};

/* Numeric value used for sorting/filtering/stock-value math: min variant price
   (all-equal variants collapse to the single price). */
const getEffectivePrice = (item, field) => getItemPriceRange(item, field).min;

/* Display string for a price column: single value or "₹min – ₹max" range. */
const formatItemPrice = (item, field) => {
  const { min, max } = getItemPriceRange(item, field);
  return min === max ? money(min) : `${money(min)} – ${money(max)}`;
};

/* Stock value: sum of variant stock × variant sellingPrice; falls back to
   parent stock × parent sellingPrice for non-variant items. */
const getItemStockValue = (item) => {
  if (item.variants && item.variants.length > 0) {
    return item.variants.reduce(
      (sum, v) => sum + Math.max(Number(v.stock) || 0, 0) * (Number(v.sellingPrice) || 0),
      0
    );
  }
  return Math.max(getItemStock(item), 0) * (Number(item.sellingPrice) || 0);
};

/* Active variants of an item (inactive ones are not sellable, so they don't make a product
   "low"). Empty array for a product without variants. */
const activeVariantsOf = (item) => (item.variants || []).filter((v) => v.isActive !== false);

/* Per-variant status, using the variant's own low-stock threshold and falling back to the
   parent's when it doesn't set one. */
const variantStatusOf = (variant, item) => {
  const qty = Number(variant.stock) || 0;
  const threshold = resolveLowStockThreshold(variant, item);
  if (qty <= 0) return { key: "out", label: "Out of Stock", cls: "bg-[#FCEAEA] text-[#EA4B4B]" };
  if (qty <= threshold) return { key: "low", label: "Low Stock", cls: "bg-[#FDF3E6] text-[#EA9927]" };
  return { key: "in", label: "In Stock", cls: "bg-[#E6F7EF] text-[#1FA971]" };
};

/* Stock level → badge. Mirrors the backend's stockStatus filter exactly, so the badge a row
   shows and the status you can filter by can never disagree.

   For a product WITH variants the total is not a usable signal on its own: a T-Shirt holding
   Small 2 / Medium 6 / Large 1 totals 9, which sails past a threshold of 5 while two of its
   three sizes are actually low. So a variant product is "Low Stock" as soon as ANY active
   variant is at or below its own threshold, and only "Out of Stock" when the whole item is
   empty. `lowCount` drives the "N variants low" hint on the row. */
const stockStatusOf = (item) => {
  const qty = getItemStock(item);
  const variants = activeVariantsOf(item);

  if (variants.length > 0) {
    if (qty <= 0) return { key: "out", label: "Out of Stock", cls: "bg-[#FCEAEA] text-[#EA4B4B]", lowCount: 0 };
    const lowCount = variants.filter((v) => variantStatusOf(v, item).key !== "in").length;
    if (lowCount > 0) return { key: "low", label: "Low Stock", cls: "bg-[#FDF3E6] text-[#EA9927]", lowCount };
    return { key: "in", label: "In Stock", cls: "bg-[#E6F7EF] text-[#1FA971]", lowCount: 0 };
  }

  const threshold = Number(item.inventory?.lowStockThreshold) || 0;
  if (qty <= 0) return { key: "out", label: "Out of Stock", cls: "bg-[#FCEAEA] text-[#EA4B4B]", lowCount: 0 };
  if (qty <= threshold) return { key: "low", label: "Low Stock", cls: "bg-[#FDF3E6] text-[#EA9927]", lowCount: 0 };
  return { key: "in", label: "In Stock", cls: "bg-[#E6F7EF] text-[#1FA971]", lowCount: 0 };
};

const relativeTime = (date) => {
  if (!date) return "—";
  const d = new Date(date);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} minute${mins > 1 ? "s" : ""} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? "s" : ""} ago`;
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

/* ─── Shared resize handle (same as Accounting.jsx / PaymentsTimeline.jsx) ── */
const ColumnResizeHandle = React.memo(({ colId, onResizeStart }) => (
  <div
    data-resize-handle="true"
    onMouseDown={(e) => onResizeStart(e, colId)}
    onClick={(e) => e.stopPropagation()}
    title="Drag to resize column"
    className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none z-30 hover:bg-[#0085FF]/40 active:bg-[#0085FF]"
  />
));
ColumnResizeHandle.displayName = "ColumnResizeHandle";

/* plain-text preview for the drag ghost */
const cellTextFor = (colId, item) => {
  switch (colId) {
    case "item":          return item.name || "";
    case "category":      return item.category || "";
    case "currentStock":  return String(getItemStock(item));
    case "status":        return stockStatusOf(item).label;
    case "purchasePrice": return formatItemPrice(item, "purchasePrice");
    case "sellingPrice":  return formatItemPrice(item, "sellingPrice");
    case "stockValue":    return money(getItemStockValue(item));
    case "lastUpdated":   return relativeTime(item.inventory?.lastMovementAt);
    default:              return "";
  }
};

/* ─── Component ─────────────────────────────────────────────────────── */
export default function Inventory() {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [pagination, setPagination] = useState({
    currentPage: 1, limit: 20, totalCount: 0, totalPages: 0,
    hasNextPage: false, hasPrevPage: false,
  });

  const [showLoadingSkeleton, setShowLoadingSkeleton] = useState(true);
  useTopLoadingSignal(showLoadingSkeleton);
  // Full-page skeleton only on the very first load; later refetches keep the header/KPIs
  // visible and skeleton just the rows (same approach as Deals.jsx / PaymentsTimeline.jsx).
  const hasLoadedOnceRef = useRef(false);

  /* search */
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const searchInputRef = useRef(null);

  /* columns — visibility + order persist via useColumnSettings; pin side stays local. */
  const defaultColumns = useMemo(
    () => ALL_COLUMNS.map((c, i) => ({ key: c.id, label: c.label, visible: true, order: i, sortable: true, required: i === 0 })),
    []
  );
  const { columns, saveColumns, getVisibleColumns } = useColumnSettings("inventory", defaultColumns);
  const [colWidths, setColWidths] = useState(DEFAULT_COL_WIDTHS);
  const [pinnedCols, setPinnedCols] = useState({});
  const [sortConfig, setSortConfig] = useState({ key: null, direction: null });
  const [showColumnSettings, setShowColumnSettings] = useState(false);

  /* column header menu */
  const [openColumnMenuKey, setOpenColumnMenuKey] = useState(null);
  const [columnMenuPos, setColumnMenuPos] = useState(null);

  /* filters */
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [activeFilters, setActiveFilters] = useState([]);
  const [stockStatusFilter, setStockStatusFilter] = useState("");
  const [categoryOptions, setCategoryOptions] = useState([]);

  /* drag-reorder */
  const [draggedColKey, setDraggedColKey] = useState(null);
  const [dragOverColKey, setDragOverColKey] = useState(null);
  const [dragGhost, setDragGhost] = useState(null);
  const dragOverRef = useRef(null);
  const ghostElRef = useRef(null);

  /* three-dot header menu + KPI toggle */
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef(null);
  const [showStats, setShowStats] = useState(true);

  /* row action menu + stock modal */
  const [openActionMenuId, setOpenActionMenuId] = useState(null);
  const [actionMenuPos, setActionMenuPos] = useState(null);
  const [stockModal, setStockModal] = useState({ open: false, item: null, direction: "in" });
  // Item whose per-variant stock breakdown is open. The list itself stays one row per product;
  // this drawer is how the variant detail is reached.
  const [breakdownItem, setBreakdownItem] = useState(null);
  const [historyFor, setHistoryFor] = useState(null);
  const [movements, setMovements] = useState([]);
  const [movementsLoading, setMovementsLoading] = useState(false);

  /* pagination page-input */
  const [editingPage, setEditingPage] = useState(false);
  const [pageInput, setPageInput] = useState("");

  /* ── bulk selection ──────────────────────────────────────────────────
     Mirrors Deals.jsx: the strip's unmount is delayed so it can play a
     slide-out-right exit on deselect, matching the slide-in-left entrance. */
  const [selectedIds, setSelectedIds] = useState([]);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);

  // Same shape ProductsServices.jsx uses — both pages edit the same /items
  // collection, so one field at a time across the selected rows.
  const inventoryFieldConfig = {
    fields: [
      { key: "category", label: "Category", type: "text" },
      { key: "purchasePrice", label: "Purchase Price", type: "text" },
      { key: "sellingPrice", label: "Sale Price", type: "text" },
      { key: "isActive", label: "Status", type: "boolean" },
    ],
  };

  const handleBulkUpdateItems = async ({ field, value, itemIds }) => {
    setBulkLoading(true);
    try {
      const parsed =
        field === "purchasePrice" || field === "sellingPrice"
          ? Number(value)
          : field === "isActive"
            ? value === "true"
            : value;
      await Promise.all(itemIds.map((id) => API.put(`/items/${id}`, { [field]: parsed })));
      await fetchData();
      toast.success(`Successfully updated ${itemIds.length} item(s)`);
      setSelectedIds([]);
      setShowBulkActions(false);
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
  }, [selectedIds.length]);

  /* ── debounce search ─────────────────────────────────────────────── */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  /* ── category options for the filter panel (org-wide, not page-scoped) ── */
  useEffect(() => {
    API.get("/items/categories")
      .then((res) => setCategoryOptions(Array.isArray(res.data) ? res.data : []))
      .catch(() => setCategoryOptions([]));
  }, []);

  /* ── data fetching ───────────────────────────────────────────────── */
  const fetchData = useCallback(async () => {
    setShowLoadingSkeleton(true);
    try {
      const params = new URLSearchParams();
      params.append("page", pagination.currentPage);
      params.append("limit", pagination.limit);
      if (sortConfig.key) {
        params.append("sortBy", sortConfig.key);
        params.append("sortOrder", sortConfig.direction || "asc");
      } else {
        params.append("sortBy", "createdAt");
        params.append("sortOrder", "desc");
      }
      if (debouncedSearch) params.append("search", debouncedSearch);
      if (stockStatusFilter) params.append("stockStatus", stockStatusFilter);

      const res = await API.get(`/inventory?${params.toString()}`);
      setItems(res.data.items || []);
      setSummary(res.data.summary || null);
      if (res.data.pagination) setPagination((p) => ({ ...p, ...res.data.pagination }));
    } catch (err) {
      toast.error("Failed to load inventory");
      console.error(err);
    } finally {
      setShowLoadingSkeleton(false);
      hasLoadedOnceRef.current = true;
    }
  }, [pagination.currentPage, pagination.limit, sortConfig, debouncedSearch, stockStatusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Any change that narrows the result set must go back to page 1, otherwise you can land on
  // a page that no longer exists and see an empty table.
  useEffect(() => {
    setPagination((p) => ({ ...p, currentPage: 1 }));
  }, [debouncedSearch, stockStatusFilter]);

  /* ── close menus on outside click ────────────────────────────────── */
  useEffect(() => {
    const handle = () => { setOpenActionMenuId(null); setActionMenuPos(null); };
    document.addEventListener("click", handle);
    return () => document.removeEventListener("click", handle);
  }, []);

  useEffect(() => {
    const handle = (e) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) setIsMoreMenuOpen(false);
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

  /* ── client-side advanced filters, applied on top of the server page ── */
  /* Server sorts by the parent item's own field, which is 0 for variant items —
     re-sort the current page client-side when sorting by a variant-aware column
     so variant items order by their effective (min) price / stock value. */
  const sortedItems = useMemo(() => {
    const k = sortConfig.key;
    if (k !== "purchasePrice" && k !== "sellingPrice" && k !== "stockValue") return items;
    const getVal = (row) =>
      k === "stockValue" ? getItemStockValue(row) : getEffectivePrice(row, k);
    const dir = sortConfig.direction === "desc" ? -1 : 1;
    return [...items].sort((a, b) => (getVal(a) - getVal(b)) * dir);
  }, [items, sortConfig]);

  const filteredItems = useMemo(() => {
    if (!activeFilters || activeFilters.length === 0) return sortedItems;
    const valueOf = (row, key) => {
      switch (key) {
        case "item": return row.name;
        case "currentStock": return getItemStock(row);
        case "status": return stockStatusOf(row).label;
        case "stockValue": return getItemStockValue(row);
        case "purchasePrice": return getEffectivePrice(row, "purchasePrice");
        case "sellingPrice": return getEffectivePrice(row, "sellingPrice");
        default: return row[key];
      }
    };
    return sortedItems.filter((row) =>
      activeFilters.every((f) => {
        const raw = valueOf(row, f.column);
        const val = String(raw ?? "").toLowerCase().trim();
        const fv = String(f.value ?? "").toLowerCase().trim();
        switch (f.operator) {
          case "contains": return val.includes(fv);
          case "not_contains": return !val.includes(fv);
          case "is": return val === fv;
          case "is_not": return val !== fv;
          case "in": return fv.split(",").map((s) => s.trim()).some((s) => val === s);
          case "not_in": return !fv.split(",").map((s) => s.trim()).some((s) => val === s);
          case "is_empty": return val === "" || raw == null;
          case "is_not_empty": return val !== "" && raw != null;
          default: return true;
        }
      })
    );
  }, [sortedItems, activeFilters]);

  const filterColumns = useMemo(() => ([
    { key: "item", label: "Item" },
    { key: "category", label: "Category", options: categoryOptions },
    { key: "currentStock", label: "Qty" },
    { key: "status", label: "Status", options: ["In Stock", "Low Stock", "Out of Stock"] },
    { key: "purchasePrice", label: "Purchase Price" },
    { key: "sellingPrice", label: "Sale Price" },
    { key: "hsnSac", label: "HSN/SAC" },
  ]), [categoryOptions]);

  /* ── ordered columns (pinned left → unpinned → pinned right) ─────── */
  const orderedColumns = useMemo(() => {
    const visible = getVisibleColumns();
    return visible
      .map((vc) => ALL_COLUMNS.find((c) => c.id === vc.key))
      .filter(Boolean)
      .sort((a, b) => {
        const rank = (c) => (pinnedCols[c.id] === "left" ? 0 : pinnedCols[c.id] === "right" ? 2 : 1);
        return rank(a) - rank(b);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, pinnedCols]);

  const leftPinnedInOrder = orderedColumns.filter((c) => pinnedCols[c.id] === "left");
  const rightPinnedInOrder = orderedColumns.filter((c) => pinnedCols[c.id] === "right");
  const lastLeftPinnedKey = leftPinnedInOrder.length ? leftPinnedInOrder[leftPinnedInOrder.length - 1].id : null;
  const firstRightPinnedKey = rightPinnedInOrder.length ? rightPinnedInOrder[0].id : null;
  const boundaryShadowSideFor = (colId) =>
    colId === lastLeftPinnedKey ? "left" : colId === firstRightPinnedKey ? "right" : null;

  const stickyStyles = useMemo(() => {
    const map = {};
    let leftOffset = colWidths.selection;
    for (const c of orderedColumns) {
      if (pinnedCols[c.id] === "left") {
        map[c.id] = { position: "sticky", left: leftOffset, zIndex: 15 };
        leftOffset += colWidths[c.id];
      }
    }
    let rightOffset = 0;
    for (const c of [...orderedColumns].reverse()) {
      if (pinnedCols[c.id] === "right") {
        map[c.id] = { position: "sticky", right: rightOffset, zIndex: 15 };
        rightOffset += colWidths[c.id];
      }
    }
    return map;
  }, [orderedColumns, pinnedCols, colWidths]);

  const stickyStyleFor = useCallback((colId) => stickyStyles[colId] || {}, [stickyStyles]);

  const setColumnPin = useCallback((colId, side) => {
    setPinnedCols((prev) => {
      const next = { ...prev };
      if (next[colId] === side) delete next[colId];
      else next[colId] = side;
      return next;
    });
  }, []);

  const openColumnMenu = (e, colId) => {
    e.stopPropagation();
    const zMenu = getAncestorZoom(document.body);
    const MENU_W = 220;
    const rect = e.currentTarget.getBoundingClientRect();
    let calcLeft = rect.right / zMenu - MENU_W;
    calcLeft = Math.min(calcLeft, window.innerWidth / zMenu - MENU_W - 8);
    calcLeft = Math.max(calcLeft, 8);
    setColumnMenuPos({ top: rect.bottom / zMenu + 4, left: calcLeft });
    setOpenColumnMenuKey(colId);
  };
  const closeColumnMenu = () => { setOpenColumnMenuKey(null); setColumnMenuPos(null); };

  /* ── column resize ───────────────────────────────────────────────── */
  const startColumnResize = useCallback((e, colId) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const startX = e.clientX;
    const startW = colWidths[colId] ?? MIN_COL_WIDTH;
    const onMove = (mv) =>
      setColWidths((prev) => ({ ...prev, [colId]: Math.max(MIN_COL_WIDTH, startW + mv.clientX - startX) }));
    const onUp = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [colWidths]);

  const ResizeHandle = useCallback(
    ({ colId }) => <ColumnResizeHandle colId={colId} onResizeStart={startColumnResize} />,
    [startColumnResize]
  );

  /* ── column drag-reorder ─────────────────────────────────────────── */
  const handleColumnReorder = useCallback((draggedKey, targetKey) => {
    if (!draggedKey || draggedKey === targetKey) return;
    const visible = columns.filter((c) => c.visible).sort((a, b) => a.order - b.order);
    const from = visible.findIndex((c) => c.key === draggedKey);
    const to = visible.findIndex((c) => c.key === targetKey);
    if (from === -1 || to === -1) return;
    const reordered = [...visible];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    const hidden = columns.filter((c) => !c.visible);
    saveColumns([...reordered.map((c, i) => ({ ...c, order: i })), ...hidden]);
  }, [columns, saveColumns]);

  const startColumnDrag = (e, colId) => {
    if (e.button !== 0) return;
    if (e.target.closest("button") || e.target.closest("[data-resize-handle]")) return;

    const th = e.currentTarget;
    const startX = e.clientX;
    const startY = e.clientY;
    const THRESHOLD = 5;
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
      const col = ALL_COLUMNS.find((c) => c.id === colId);
      const previewRows = items.map((it) => cellTextFor(colId, it));
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

    const handleMouseMove = (mv) => {
      if (!dragState.started) {
        if (Math.hypot(mv.clientX - startX, mv.clientY - startY) < THRESHOLD) return;
        e.preventDefault();
        beginDrag();
      }
      positionGhost(mv.clientX, mv.clientY);
      updateDragOver(mv.clientX, mv.clientY);
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

  /* ── stock history ───────────────────────────────────────────────── */
  const openHistory = async (item) => {
    setHistoryFor(item);
    setMovementsLoading(true);
    try {
      const res = await API.get(`/inventory/${item._id}/movements?limit=50`);
      setMovements(res.data.movements || []);
    } catch {
      toast.error("Failed to load stock history");
      setMovements([]);
    } finally {
      setMovementsLoading(false);
    }
  };

  /* ── pagination ──────────────────────────────────────────────────── */
  const handlePageChange = (p) => {
    if (p > 0 && p <= pagination.totalPages) setPagination((prev) => ({ ...prev, currentPage: p }));
  };
  const handleLimitChange = (l) => setPagination((prev) => ({ ...prev, limit: l, currentPage: 1 }));

  const paginationItems = useMemo(() => {
    const out = [];
    const { currentPage, totalPages } = pagination;
    if (totalPages <= 1) return out;
    out.push(1);
    if (currentPage > 2) out.push("left-dots");
    if (currentPage !== 1 && currentPage !== totalPages) out.push(currentPage);
    if (currentPage < totalPages - 1) out.push("right-dots");
    if (totalPages > 1) out.push(totalPages);
    return out;
  }, [pagination]);

  /* ── bulk selection handlers ─────────────────────────────────────── */
  const handleSelectRow = (id) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleSelectAllOnPage = (e) =>
    setSelectedIds(e.target.checked ? filteredItems.map((i) => i._id) : []);

  // "Select All" spans every matching record, not just the loaded page — the list endpoint
  // exposes `allIds` for exactly this, so the selection isn't silently capped at 10 rows.
  const handleSelectAllAcrossPages = async () => {
    const tid = toast.loading("Selecting all records...");
    try {
      const params = new URLSearchParams({ allIds: "true" });
      if (debouncedSearch) params.append("search", debouncedSearch);
      if (stockStatusFilter) params.append("stockStatus", stockStatusFilter);
      const res = await API.get(`/inventory?${params.toString()}`);
      const ids = res.data?.allIds || res.data?.ids || [];
      setSelectedIds(ids);
      toast.success(`Selected all ${ids.length} record(s).`, { id: tid });
    } catch (err) {
      toast.error("Failed to select all records", { id: tid });
      console.error(err);
    }
  };

  const handleExportExcel = useCallback((rows) => {
    const list = Array.isArray(rows) ? rows : [rows];
    if (!list.length) {
      toast.error("No items selected for export");
      return;
    }
    const sheet = XLSX.utils.json_to_sheet(
      list.map((i) => ({
        Item: i.name || "",
        Category: i.category || "",
        "Current Stock": getItemStock(i),
        Unit: i.primaryUnit || "",
        Status: stockStatusOf(i).label,
        "Purchase Price": formatItemPrice(i, "purchasePrice").replace(/^₹/, ""),
        "Selling Price": formatItemPrice(i, "sellingPrice").replace(/^₹/, ""),
        "Stock Value": formatINR(getItemStockValue(i)),
      }))
    );
    sheet["!cols"] = [{ wch: 28 }, { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Inventory");
    const filename = `Inventory_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(book, filename);
    toast.success(`Exported ${list.length} item(s) to ${filename}`);
  }, []);

  /* ── row action menu ─────────────────────────────────────────────── */
  const renderActionMenu = (item) => {
    const isOpen = openActionMenuId === item._id;
    return (
      <div className="relative flex-shrink-0 flex items-center">
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (isOpen) { setOpenActionMenuId(null); setActionMenuPos(null); return; }
            const zMenu = getAncestorZoom(document.body);
            const MENU_W = 176;
            const MENU_H = 130;
            const MARGIN = 8;
            const rect = e.currentTarget.getBoundingClientRect();
            const viewportH = window.innerHeight / zMenu;
            const viewportW = window.innerWidth / zMenu;
            const rowCenter = (rect.top + rect.bottom) / (2 * zMenu);
            let calcTop = rowCenter - MENU_H / 2;
            calcTop = Math.max(MARGIN, Math.min(calcTop, viewportH - MENU_H - MARGIN));
            let calcLeft = rect.right / zMenu - MENU_W;
            calcLeft = Math.min(calcLeft, viewportW - MENU_W - MARGIN);
            calcLeft = Math.max(calcLeft, MARGIN);
            setActionMenuPos({ top: calcTop, left: calcLeft });
            setOpenActionMenuId(item._id);
          }}
          className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <MoreIcon className="w-4 h-4" />
        </button>
        {isOpen && actionMenuPos && createPortal(
          <>
            <div className="fixed inset-0 z-[59]" onClick={() => { setOpenActionMenuId(null); setActionMenuPos(null); }} />
            <div
              className="fixed w-44 bg-white rounded-xl shadow-lg border border-[#E1E4EA] py-1 z-[60] overflow-hidden"
              style={{ top: actionMenuPos.top, left: actionMenuPos.left }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => {
                  setOpenActionMenuId(null); setActionMenuPos(null);
                  setStockModal({ open: true, item, direction: "in" });
                }}
              >
                <PlusIcon className="w-4 h-4 text-green-600" /> Stock In
              </button>
              <button
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => {
                  setOpenActionMenuId(null); setActionMenuPos(null);
                  setStockModal({ open: true, item, direction: "out" });
                }}
              >
                <Minus className="w-4 h-4 text-red-600" /> Stock Out
              </button>
              <div className="h-px bg-gray-100 my-1" />
              <button
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => { setOpenActionMenuId(null); setActionMenuPos(null); openHistory(item); }}
              >
                <HistoryIcon className="w-4 h-4 text-gray-400" /> Stock History
              </button>
            </div>
          </>,
          document.body
        )}
      </div>
    );
  };

  /* ── cell renderer ───────────────────────────────────────────────── */
  const renderCell = (colId, item, isRightmost) => {
    let content;
    switch (colId) {
      case "item":
        content = (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0 uppercase">
              {(item.name || "?").slice(0, 2)}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold text-gray-900 truncate">
                <HighlightText text={item.name} query={searchQuery} />
              </span>
              {/* One row per product is preserved — the variant count is a hint that there's a
                  per-variant breakdown behind it, not a second row. */}
              {activeVariantsOf(item).length > 0 ? (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setBreakdownItem(item); }}
                  className="text-[10px] text-blue-600 hover:text-blue-700 hover:underline truncate text-left font-medium"
                >
                  {activeVariantsOf(item).length} Variants
                </button>
              ) : item.hsnSac ? (
                <span className="text-[10px] text-gray-400 truncate">
                  HSN <HighlightText text={item.hsnSac} query={searchQuery} />
                </span>
              ) : null}
            </div>
          </div>
        );
        break;
      case "currentStock": {
        const qty = getItemStock(item);
        content = (
          <div className="flex items-baseline gap-1.5">
            <span className={`text-sm font-bold ${qty <= 0 ? "text-red-600" : "text-gray-900"}`}>{qty}</span>
            <span className="text-[10px] font-medium text-gray-400 uppercase truncate">{item.primaryUnit || ""}</span>
          </div>
        );
        break;
      }
      case "status": {
        const s = stockStatusOf(item);
        content = (
          <div className="flex flex-col items-start gap-0.5">
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
              {s.label}
            </span>
            {/* Says WHICH part of a variant product is short, so the total ("9 PCS") doesn't
                have to be reconciled against the badge by hand. */}
            {s.lowCount > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setBreakdownItem(item); }}
                className="text-[10px] text-[#EA9927] hover:underline font-medium"
              >
                {s.lowCount} variant{s.lowCount > 1 ? "s" : ""} low
              </button>
            )}
          </div>
        );
        break;
      }
      case "purchasePrice":
      case "sellingPrice": {
        const { min, max, hasVariants } = getItemPriceRange(item, colId);
        content = (
          <div className="flex flex-col">
            <span className="text-sm font-medium text-gray-800">
              {min === max ? money(min) : `${money(min)} – ${money(max)}`}
            </span>
            {item.gstRate ? (
              <span className="text-[10px] text-gray-400">
                {item.gstRate}% {item.taxInclusive ? "incl." : "excl."} tax
              </span>
            ) : hasVariants && min !== max ? (
              <span className="text-[10px] text-gray-400">across {item.variants.length} variants</span>
            ) : null}
          </div>
        );
        break;
      }
      case "stockValue":
        content = (
          <span className="text-sm font-semibold text-gray-900">
            {money(getItemStockValue(item))}
          </span>
        );
        break;
      case "lastUpdated":
        content = <span className="text-sm text-gray-600">{relativeTime(item.inventory?.lastMovementAt)}</span>;
        break;
      default:
        content = (
          <span className="text-sm text-gray-700 truncate block">
            {item[colId] ? <HighlightText text={item[colId]} query={searchQuery} /> : "—"}
          </span>
        );
    }

    return (
      <div className="flex items-center justify-between gap-2 w-full min-w-0">
        <div className="flex-1 min-w-0">{content}</div>
        {/* Stock In / Stock Out live solely in the ⋮ menu — the inline pills crowded the last
            column and pushed the ⋮ out of line with every other list page. */}
        {isRightmost && renderActionMenu(item)}
      </div>
    );
  };

  /* ── KPI cards (same band treatment as Deals.jsx / PaymentsTimeline.jsx) ── */
  const kpis = [
    {
      label: "Low Stock",
      value: `${summary?.lowStockItems ?? 0} Items`,
      sub: `${summary?.lowStockQty ?? 0} Qty`,
      icon: TrendingDown,
      iconClass: "text-red-600",
    },
    {
      label: "Positive Stock",
      value: `${summary?.positiveStockItems ?? 0} Items`,
      sub: `${Number(summary?.positiveStockQty ?? 0).toLocaleString("en-IN")} Qty`,
      icon: Boxes,
      iconClass: "text-green-600",
    },
    {
      label: "Stock Value (Sales)",
      value: money(summary?.stockValueSales),
      icon: IndianRupee,
      iconClass: "text-[#0085FF]",
    },
    {
      label: "Stock Value (Purchase)",
      value: money(summary?.stockValuePurchase),
      icon: Wallet,
      iconClass: "text-amber-600",
    },
  ];

  // First-load-only full-page skeleton.
  if (showLoadingSkeleton && items.length === 0 && !hasLoadedOnceRef.current) {
    return <PageSkeleton variant="kanban" boardVariant="table" tableRows={pagination.limit} tableCols={ALL_COLUMNS.length} />;
  }

  /* ─────────────────────────────────────────────────────────────────── */
  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-[#FAFBFC]">

      {/* ── Fixed header bar ─────────────────────────────────────────── */}
      <div
        className="fixed right-0 border-b border-[#E1E4EA] bg-white flex items-center justify-between gap-2 lg:gap-4 px-4 sm:px-6 lg:px-8 top-[calc(54px+var(--dc-offline-offset,0px))] lg:top-[calc(64px+var(--dc-offline-offset,0px))]"
        style={{ left: "var(--sidebar-width, 0px)", zIndex: 40, height: 64, minHeight: 64, maxHeight: 64, boxSizing: "border-box" }}
      >
        {showBulkStrip ? (
          <BulkActionBar
            bare
            selectedCount={selectedIds.length}
            entityName="item"
            isClosing={bulkStripClosing}
            onSelectAll={handleSelectAllAcrossPages}
            onDeselectAll={() => setSelectedIds([])}
            onExport={() => {
              const rows = filteredItems.filter((i) => selectedIds.includes(i._id));
              handleExportExcel(rows.length > 0 ? rows : filteredItems);
            }}
            onUpdateStatus={() => setShowBulkActions(true)}
            onCancel={() => setSelectedIds([])}
          />
        ) : (
          <>
        <div className="flex flex-col gap-1 flex-shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="m-0 font-medium truncate text-sm sm:text-base" style={{ lineHeight: "120%", letterSpacing: "-0.5px", color: "#0E121B" }}>
              Inventory
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] sm:text-xs font-semibold flex-shrink-0">
              {pagination.totalCount} products
            </span>
          </div>
          <p className="text-[#5B5A64] text-[10px] sm:text-sm m-0 leading-tight truncate">
            Track stock in and stock out
          </p>
        </div>

        <div className="flex flex-row items-center gap-2 flex-shrink-0 min-w-0">
          {/* Search */}
          <div className={`relative h-10 flex items-center border ${searchQuery ? "border-[#0085FF]" : "border-[#E1E4EA]"} rounded-full bg-white transition-all duration-300 ease-in-out hover:bg-gray-50 focus-within:border-[#0085FF] focus-within:hover:bg-white ${isSearchExpanded ? "w-[220px] sm:w-[300px] lg:w-[380px]" : "w-10"} max-w-full flex-shrink-0`}>
            <SearchIcon
              className="absolute left-3 text-[#525866] w-4 h-4 cursor-pointer z-10 flex-shrink-0 top-1/2 -translate-y-1/2"
              onClick={() => { setIsSearchExpanded(true); searchInputRef.current?.focus(); }}
            />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchExpanded(true)}
              onBlur={() => { if (!searchQuery) setIsSearchExpanded(false); }}
              placeholder="Search inventory..."
              className={`w-full h-full bg-transparent rounded-full pl-9 pr-9 text-[14px] leading-[20px] text-[#1F2937] placeholder:text-[#99A0AE] focus:outline-none transition-opacity duration-200 cursor-pointer ${isSearchExpanded ? "opacity-100 focus:cursor-text" : "opacity-0"}`}
            />
            {isSearchExpanded && searchQuery && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-5 h-5 rounded-full text-gray-900 hover:bg-gray-100 transition-colors"
              >
                <X className="w-3.5 h-3.5" strokeWidth={2.5} />
              </button>
            )}
          </div>

          {/* Advanced filters */}
          <button
            type="button"
            onClick={() => setShowAdvancedFilters(true)}
            className={`relative flex items-center justify-center w-10 h-10 rounded-full border transition-colors bg-white cursor-pointer flex-shrink-0 ${activeFilters.length > 0 ? "border-[#0085FF] text-[#0085FF]" : "border-[#E1E4EA] text-gray-500 hover:bg-gray-50"}`}
            title="Filters"
          >
            <FilterIcon size={16} />
            {activeFilters.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-[#0085FF] text-white text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full">
                {activeFilters.length}
              </span>
            )}
          </button>

          {/* More options */}
          <div className="relative" ref={moreMenuRef}>
            <button
              onClick={() => setIsMoreMenuOpen((p) => !p)}
              className="flex items-center justify-center w-10 h-10 rounded-full border border-[#E1E4EA] text-[#525866] hover:bg-gray-50 transition-colors"
              title="More options"
            >
              <MoreIcon className="w-4 h-4" />
            </button>
            {isMoreMenuOpen && (
              <div className="absolute right-0 z-50 mt-2 w-56 bg-white border border-gray-100 rounded-xl shadow-xl py-1 animate-in fade-in zoom-in duration-200 origin-top-right">
                <button
                  onClick={() => { setShowColumnSettings(true); setIsMoreMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <SettingsIcon className="w-4 h-4 text-gray-400" /> Columns
                </button>
                <button
                  onClick={() => { setShowStats((p) => !p); setIsMoreMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <EyeIcon className="w-4 h-4 text-gray-400" /> {showStats ? "Hide KPIs" : "Unhide KPIs"}
                </button>

                {/* Stock-status filter — moved in here off the toolbar, where its pill-shaped
                    <select> broke the 40px round-icon rhythm the other list pages share. */}
                <div className="h-px bg-gray-100 my-1" />
                <p className="px-3 pt-1 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                  Stock status
                </p>
                {[
                  { value: "", label: "All Stock" },
                  { value: "in", label: "In Stock" },
                  { value: "low", label: "Low Stock" },
                  { value: "out", label: "Out of Stock" },
                ].map((opt) => (
                  <button
                    key={opt.value || "all"}
                    onClick={() => { setStockStatusFilter(opt.value); setIsMoreMenuOpen(false); }}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {opt.label}
                    {stockStatusFilter === opt.value && <Check className="w-4 h-4 text-[#0085FF]" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
          </>
        )}
      </div>

      {/* ── KPI band ─────────────────────────────────────────────────── */}
      {showStats && (
        <div
          className="fixed right-0 box-border flex flex-col justify-center bg-white border-b border-[#E1E4EA] px-6 py-6"
          style={{ left: "var(--sidebar-width, 0px)", top: TOOLBAR_BOTTOM, height: KPI_BAND_HEIGHT, zIndex: 38, boxSizing: "border-box" }}
        >
          <div className="grid grid-cols-2 lg:flex lg:flex-row lg:items-stretch gap-3 lg:gap-6">
            {kpis.map((kpi) => (
              <StatTile key={kpi.label} tile={kpi} />
            ))}
          </div>
        </div>
      )}

      {/* ── Full-bleed table ─────────────────────────────────────────── */}
      <div
        className="fixed right-0 overflow-x-auto overflow-y-auto bg-white"
        style={{ left: "var(--sidebar-width, 0px)", bottom: 64, top: TOOLBAR_BOTTOM + (showStats ? KPI_BAND_HEIGHT : 0), paddingLeft: "var(--content-inset, 16px)" }}
      >
        <table className="min-w-full divide-y divide-gray-200 table-fixed">
          <thead className="bg-[#F5F7FA] sticky top-0 z-20">
            <tr>
              <th
                style={{
                  width: colWidths.selection,
                  height: 44,
                  maxHeight: 44,
                  boxSizing: "border-box",
                  position: "sticky",
                  left: 0,
                  zIndex: 20,
                  // Plain `border` on a cell inside a sticky <thead> doesn't
                  // reliably paint in Chrome (the whole header row is missing
                  // its vertical dividers) — every other table in the app
                  // already uses box-shadow insets for exactly this reason.
                  boxShadow: "inset -1px 0 0 0 #E1E4EA",
                }}
                className="relative px-4 py-2 bg-[#F5F7FA] overflow-hidden"
              >
                <div className="flex justify-center items-center">
                  <Checkbox checked={filteredItems.length > 0 && selectedIds.length === filteredItems.length} onChange={handleSelectAllOnPage}  uncheckedColor="text-[#525866]"/>
                </div>
                <ResizeHandle colId="selection" />
              </th>

              {orderedColumns.map((col) => {
                const isDragging = draggedColKey === col.id;
                const isDragOver = dragOverColKey === col.id && draggedColKey && draggedColKey !== col.id;
                const boundaryShadowSide = boundaryShadowSideFor(col.id);
                return (
                  <th
                    key={col.id}
                    data-col-id={col.id}
                    onMouseDown={(e) => startColumnDrag(e, col.id)}
                    title="Drag to move this column"
                    style={{
                      width: colWidths[col.id],
                      height: 44,
                      maxHeight: 44,
                      boxSizing: "border-box",
                      opacity: isDragging ? 0.35 : 1,
                      boxShadow: "inset -1px 0 0 0 #E1E4EA",
                      ...stickyStyleFor(col.id),
                    }}
                    className={`relative px-4 py-2 text-left text-sm font-bold text-[#525866] whitespace-nowrap overflow-hidden transition-colors ${isDragOver ? "bg-blue-100" : "bg-[#F5F7FA] hover:bg-[#EDF0F5]"} ${draggedColKey ? "cursor-grabbing" : "cursor-grab"} active:cursor-grabbing`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate flex-1">{col.label}</span>
                      {sortConfig.key === col.id && (sortConfig.direction === "asc"
                        ? <ArrowUp className="w-3 h-3 text-[#0085FF] flex-shrink-0" />
                        : <ArrowDown className="w-3 h-3 text-[#0085FF] flex-shrink-0" />)}
                      {pinnedCols[col.id] && <Pin className="w-3 h-3 text-[#0085FF] flex-shrink-0" />}
                      <button
                        onClick={(e) => openColumnMenu(e, col.id)}
                        title="Column options"
                        className="p-1 rounded hover:bg-gray-200 transition-colors text-gray-500 flex-shrink-0"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <ResizeHandle colId={col.id} />
                    {boundaryShadowSide && <div style={getPinnedBoundaryOverlayStyle(boundaryShadowSide)} />}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className={`bg-white transition-opacity duration-150 ${showLoadingSkeleton && items.length > 0 ? "opacity-60" : "opacity-100"}`}>
            {/* Full skeleton rows only when there's no data on screen yet (first load, or a
                search/filter that hasn't returned anything before). Once rows exist, a search
                keystroke or page change just dims them (above) instead of wiping the whole
                table to skeleton and back — that constant swap was the "breaking"/flicker on
                every search/pagination request. */}
            {showLoadingSkeleton && items.length === 0 ? (
              <TableSkeletonRows
                numRows={pagination.limit}
                columns={orderedColumns.map((c) => colWidths[c.id])}
                hasCheckbox
                checkboxWidth={colWidths.selection}
              />
            ) : filteredItems.length === 0 ? (
              <tr>
                <td colSpan={orderedColumns.length + 1} className="px-6 py-20 text-center">
                  <Package className="w-10 h-10 mx-auto text-gray-300 mb-3" />
                  <p className="text-sm font-medium text-gray-500">No inventory items found.</p>
                  {/* Every product appears here automatically, so an empty page means either no
                      products exist yet or the current search/filter excludes them all. */}
                  <p className="text-xs text-gray-400 mt-1.5 max-w-sm mx-auto">
                    {searchQuery || stockStatusFilter || activeFilters.length > 0
                      ? "No products match your current search or filters."
                      : "Products added in Products & Services appear here automatically."}
                  </p>
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => (
                <tr
                  key={item._id}
                  className={`bg-white hover:bg-blue-50 transition-colors ${selectedIds.includes(item._id) ? "!bg-blue-50" : ""}`}
                  style={{ height: 44, maxHeight: 44 }}
                >
                  <td
                    style={{
                      width: colWidths.selection,
                      height: "44px",
                      maxHeight: "44px",
                      boxSizing: "border-box",
                      position: "sticky",
                      left: 0,
                      zIndex: 10,
                      boxShadow: "inset -1px 0 0 0 #E1E4EA, inset 0 -1px 0 0 #E1E4EA",
                    }}
                    className="px-4 py-0 align-middle bg-inherit"
                  >
                    {/* The stock-status dot that used to live here is redundant with the Status
                        column's badge, so the column now carries the selection checkbox instead. */}
                    <div className="flex justify-center items-center">
                      <Checkbox checked={selectedIds.includes(item._id)} onChange={() => handleSelectRow(item._id)} />
                    </div>
                  </td>

                  {orderedColumns.map((col, colIdx) => {
                    const isRightmost = colIdx === orderedColumns.length - 1;
                    const cellBoundaryShadowSide = boundaryShadowSideFor(col.id);
                    return (
                      <td
                        key={col.id}
                        style={{
                          width: colWidths[col.id],
                          boxShadow: isRightmost
                            ? "inset 0 -1px 0 0 #E1E4EA"
                            : "inset -1px 0 0 0 #E1E4EA, inset 0 -1px 0 0 #E1E4EA",
                          ...stickyStyleFor(col.id),
                        }}
                        className={`px-4 py-0 text-sm text-gray-900 bg-inherit whitespace-nowrap ${cellBoundaryShadowSide ? "" : "overflow-hidden"}`}
                      >
                        {renderCell(col.id, item, isRightmost)}
                        {cellBoundaryShadowSide && <div style={getPinnedBoundaryOverlayStyle(cellBoundaryShadowSide)} />}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Column header menu ───────────────────────────────────────── */}
      {openColumnMenuKey && columnMenuPos && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={closeColumnMenu} />
          <div
            className="fixed w-[220px] bg-white rounded-xl shadow-lg border border-[#E1E4EA] py-1 z-[9999]"
            style={{ top: columnMenuPos.top, left: columnMenuPos.left }}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const col = ALL_COLUMNS.find((c) => c.id === openColumnMenuKey);
              if (!col) return null;
              const itemClass = "w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors";
              return (
                <>
                  <button
                    onClick={() => { closeColumnMenu(); setColumnPin(col.id, "left"); }}
                    className={`${itemClass} ${pinnedCols[col.id] === "left" ? "bg-blue-50 text-blue-700 font-medium" : "text-[#161618] hover:bg-gray-50"}`}
                  >
                    {pinnedCols[col.id] === "left" ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                    {pinnedCols[col.id] === "left" ? "Unpin from left" : "Pin left"}
                  </button>
                  <button
                    onClick={() => { closeColumnMenu(); setColumnPin(col.id, "right"); }}
                    className={`${itemClass} ${pinnedCols[col.id] === "right" ? "bg-blue-50 text-blue-700 font-medium" : "text-[#161618] hover:bg-gray-50"}`}
                  >
                    {pinnedCols[col.id] === "right" ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                    {pinnedCols[col.id] === "right" ? "Unpin from right" : "Pin right"}
                  </button>
                  <div className="w-full border-t border-[#F1F1F5] my-0.5" />
                  <button
                    onClick={() => {
                      closeColumnMenu();
                      const isActive = sortConfig.key === col.id && sortConfig.direction === "asc";
                      setSortConfig(isActive ? { key: null, direction: null } : { key: col.id, direction: "asc" });
                    }}
                    className={`${itemClass} ${sortConfig.key === col.id && sortConfig.direction === "asc" ? "bg-blue-50 text-blue-700 font-medium" : "text-[#161618] hover:bg-gray-50"}`}
                  >
                    <ChevronUp className="w-3.5 h-3.5" /> Sort Ascending
                  </button>
                  <button
                    onClick={() => {
                      closeColumnMenu();
                      const isActive = sortConfig.key === col.id && sortConfig.direction === "desc";
                      setSortConfig(isActive ? { key: null, direction: null } : { key: col.id, direction: "desc" });
                    }}
                    className={`${itemClass} ${sortConfig.key === col.id && sortConfig.direction === "desc" ? "bg-blue-50 text-blue-700 font-medium" : "text-[#161618] hover:bg-gray-50"}`}
                  >
                    <ChevronDown className="w-3.5 h-3.5" /> Sort Descending
                  </button>
                  <div className="w-full border-t border-[#F1F1F5] my-0.5" />
                  <button
                    onClick={() => { closeColumnMenu(); saveColumns(columns.map((c) => (c.key === col.id ? { ...c, visible: false } : c))); }}
                    disabled={columns.find((c) => c.key === col.id)?.required}
                    className={`${itemClass} text-[#161618] hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent`}
                  >
                    <EyeOff className="w-3.5 h-3.5" /> Hide Column
                  </button>
                </>
              );
            })()}
          </div>
        </>,
        document.body
      )}

      {/* ── Drag ghost ───────────────────────────────────────────────── */}
      {dragGhost && createPortal(
        <div
          ref={ghostElRef}
          style={{ position: "fixed", top: -9999, left: -9999, width: dragGhost.width, zIndex: 10000, pointerEvents: "none" }}
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
        document.body
      )}

      {/* ── Pagination bar ───────────────────────────────────────────── */}
      <div
        className="fixed bottom-0 right-0 h-16 bg-white border-t border-[#E1E4EA] flex items-center justify-between px-6 z-40"
        style={{ left: "var(--sidebar-width, 0px)" }}
      >
        <div className="flex items-center gap-3">
          <p className="text-sm text-gray-700">
            Showing{" "}
            <span className="font-semibold">
              {pagination.totalCount === 0 ? 0 : (pagination.currentPage - 1) * pagination.limit + 1}
            </span>{" "}to{" "}
            <span className="font-semibold">
              {Math.min(pagination.currentPage * pagination.limit, pagination.totalCount)}
            </span>{" "}of <span className="font-semibold">{pagination.totalCount}</span> items
          </p>
          <select
            value={pagination.limit}
            onChange={(e) => handleLimitChange(parseInt(e.target.value, 10))}
            className="border border-gray-300 rounded-md text-sm py-1 pl-2 pr-6 focus:outline-none focus:border-[#0085FF] focus:ring-1 focus:ring-[#0085FF]"
          >
            {[10, 20, 50, 100].map((v) => <option key={v} value={v}>{v} per page</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handlePageChange(pagination.currentPage - 1)}
            disabled={!pagination.hasPrevPage}
            className="flex items-center justify-center w-8 h-8 rounded-full border border-[#E1E4EA] bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {paginationItems.map((it, idx) => {
            if (it === "left-dots" || it === "right-dots") {
              return (
                <span key={`${it}-${idx}`} className="flex items-center justify-center w-8 h-8 text-sm font-medium text-gray-400 select-none">
                  ....
                </span>
              );
            }
            const isCurrent = it === pagination.currentPage;
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
                  onBlur={() => {
                    const val = parseInt(pageInput, 10);
                    if (!isNaN(val) && val >= 1 && val <= pagination.totalPages) handlePageChange(val);
                    setEditingPage(false);
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditingPage(false); }}
                  className="w-12 h-8 text-center text-sm font-medium border border-[#0085FF] rounded-full focus:outline-none"
                />
              );
            }
            return (
              <button
                key={it}
                onClick={() => {
                  if (isCurrent) { setEditingPage(true); setPageInput(String(it)); }
                  else handlePageChange(it);
                }}
                className={`w-8 h-8 rounded-full text-sm font-medium transition-colors ${isCurrent ? "bg-[#0085FF] text-white" : "text-gray-600 hover:bg-gray-100"}`}
              >
                {it}
              </button>
            );
          })}

          <button
            onClick={() => handlePageChange(pagination.currentPage + 1)}
            disabled={!pagination.hasNextPage}
            className="flex items-center justify-center w-8 h-8 rounded-full border border-[#E1E4EA] bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Stock In / Stock Out ─────────────────────────────────────── */}
      <BulkActions
        isOpen={showBulkActions}
        onClose={() => setShowBulkActions(false)}
        selectedItems={items.filter((i) => selectedIds.includes(i._id))}
        onBulkUpdate={handleBulkUpdateItems}
        fieldConfig={inventoryFieldConfig}
        module="items"
        loading={bulkLoading}
      />

      <StockMovementModal
        isOpen={stockModal.open}
        item={stockModal.item}
        direction={stockModal.direction}
        onClose={() => setStockModal({ open: false, item: null, direction: "in" })}
        onSuccess={(data) => {
          // Patch this row's stock in place from the write's own response —
          // don't wait on fetchData's GET to land before the table shows the
          // new number. fetchData still runs after, for the KPI summary/
          // pagination totals a single row-patch can't account for.
          if (data?.item?._id) {
            setItems((prev) => prev.map((it) => (it._id === data.item._id ? data.item : it)));
          }
          fetchData();
        }}
      />

      {/* ── Variant stock breakdown ──────────────────────────────────
          The Inventory list keeps one row per product, so this is where a variant product's
          per-size stock and low-stock status actually become visible. */}
      {breakdownItem && (
        <>
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[9996]" onClick={() => setBreakdownItem(null)} />
          <div className="fixed dc-panel-card dc-panel-w bg-white shadow-2xl z-[9997] flex flex-col overflow-hidden animate-slideInRight">
            <div className="flex items-center justify-between p-5 border-b border-gray-200 bg-gray-50/50">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Layers className="w-4 h-4 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-gray-900 truncate">{breakdownItem.name}</h2>
                  <p className="text-xs text-gray-500 truncate">
                    {activeVariantsOf(breakdownItem).length} variants · Stock breakdown
                  </p>
                </div>
              </div>
              <button onClick={() => setBreakdownItem(null)} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto bg-gray-50/30">
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 px-5 py-2.5 border-b border-gray-200 bg-gray-50 sticky top-0">
                {["Variant", "Purchase", "Sale", "Stock / Alert", "Status"].map((h) => (
                  <span key={h} className="text-[10px] font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</span>
                ))}
              </div>
              {/* Every variant is listed, inactive ones included, so the Total below always
                  reconciles with the Qty shown on the row (which sums them all). Only active
                  variants count toward "N variants low". */}
              {(breakdownItem.variants || []).map((v) => {
                const inactive = v.isActive === false;
                const st = variantStatusOf(v, breakdownItem);
                return (
                  <div key={v._id || v.name} className={`grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 items-center px-5 py-3 border-b border-gray-100 ${inactive ? "bg-gray-50" : "bg-white"}`}>
                    <span className={`text-sm font-medium truncate ${inactive ? "text-gray-400" : "text-gray-900"}`}>
                      {v.name}
                      {inactive && <span className="ml-1.5 text-[10px] font-normal text-gray-400">(inactive)</span>}
                    </span>
                    {/* Pricing is per-variant once an item has variants — the parent's own
                        purchase/selling price stays 0 — so the breakdown is the only place the
                        actual per-size prices are visible. */}
                    <span className={`text-xs tabular-nums ${inactive ? "text-gray-400" : "text-gray-600"}`}>
                      {money(Number(v.purchasePrice) || 0)}
                    </span>
                    <span className={`text-xs font-medium tabular-nums ${inactive ? "text-gray-400" : "text-gray-800"}`}>
                      {money(Number(v.sellingPrice) || 0)}
                    </span>
                    <span className="whitespace-nowrap">
                      <span className={`text-sm font-bold tabular-nums ${inactive ? "text-gray-400" : (Number(v.stock) || 0) <= 0 ? "text-red-600" : "text-gray-900"}`}>
                        {Number(v.stock) || 0}
                      </span>
                      <span className="text-xs text-gray-400 tabular-nums"> / {resolveLowStockThreshold(v, breakdownItem)}</span>
                    </span>
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${inactive ? "bg-gray-100 text-gray-400" : st.cls}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                      {inactive ? "Inactive" : st.label}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-gray-200 p-5 bg-white">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">Total Stock</span>
                <span className="text-lg font-bold text-gray-900 tabular-nums">
                  {getItemStock(breakdownItem)}
                  <span className="ml-1.5 text-[10px] font-medium text-gray-400 uppercase">
                    {breakdownItem.primaryUnit || ""}
                  </span>
                </span>
              </div>
              {/* Same figure the row's Stock Value column shows, so the two reconcile. */}
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-gray-500">Stock Value</span>
                <span className="text-xs font-semibold text-gray-700 tabular-nums">
                  {money(getItemStockValue(breakdownItem))}
                </span>
              </div>
              {stockStatusOf(breakdownItem).lowCount > 0 && (
                <p className="mt-1 text-xs font-medium text-[#EA9927]">
                  {stockStatusOf(breakdownItem).lowCount} variant
                  {stockStatusOf(breakdownItem).lowCount > 1 ? "s" : ""} low in stock
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Stock history drawer ─────────────────────────────────────── */}
      {historyFor && (
        <>
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[9996]" onClick={() => setHistoryFor(null)} />
          <div className="fixed dc-panel-card dc-panel-w bg-white shadow-2xl z-[9997] flex flex-col overflow-hidden animate-slideInRight">
            <div className="flex items-center justify-between p-5 border-b border-gray-200 bg-gray-50/50">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <HistoryIcon className="w-4 h-4 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-gray-900 truncate">Stock History</h2>
                  <p className="text-xs text-gray-500 truncate">{historyFor.name}</p>
                </div>
              </div>
              <button onClick={() => setHistoryFor(null)} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-2 bg-gray-50/30">
              {movementsLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : movements.length === 0 ? (
                <div className="text-center py-16">
                  <HistoryIcon className="w-10 h-10 mx-auto text-gray-300 mb-3" />
                  <p className="text-sm font-medium text-gray-500">No stock movements yet.</p>
                </div>
              ) : (
                movements.map((m) => (
                  <div key={m._id} className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${m.direction === "in" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                          {m.direction === "in" ? <PlusIcon className="w-4 h-4" /> : <Minus className="w-3 h-3" />}
                          {m.quantity}
                        </span>
                        <span className="text-xs font-medium text-gray-600 capitalize truncate">
                          {(m.reason || "").replace(/_/g, " ")}
                        </span>
                        {m.variantId && (
                          <span className="text-xs text-gray-400 truncate">
                            · {historyFor.variants?.find((v) => String(v._id) === String(m.variantId))?.name || "Variant"}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-gray-500 flex-shrink-0">
                        <span>{m.previousStock}</span>
                        <ArrowRight className="w-3 h-3" />
                        <span className="font-semibold text-gray-900">{m.newStock}</span>
                      </div>
                    </div>
                    {(m.notes || m.referenceNumber) && (
                      <p className="text-xs text-gray-500 mt-1.5 truncate">
                        {m.referenceNumber && <span className="font-medium">{m.referenceNumber}</span>}
                        {m.referenceNumber && m.notes ? " — " : ""}
                        {m.notes}
                      </p>
                    )}
                    <p className="text-[10px] text-gray-400 mt-1">
                      {new Date(m.createdAt).toLocaleString("en-IN")}
                      {m.user?.name ? ` · ${m.user.name}` : ""}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Advanced filters ─────────────────────────────────────────── */}
      <AdvancedFilterPanel
        isOpen={showAdvancedFilters}
        onClose={() => setShowAdvancedFilters(false)}
        columns={filterColumns}
        data={items}
        getFieldValue={(item, key) => {
          if (key === "item") return item.name;
          if (key === "currentStock") return getItemStock(item);
          if (key === "status") return stockStatusOf(item).label;
          return item[key];
        }}
        filters={activeFilters}
        setFilters={setActiveFilters}
        onApply={(f) => setActiveFilters(f)}
        title="Filter Inventory"
        subtitle="Find specific stock quickly"
        emptyStateText="Add a rule to narrow down your inventory."
      />

      {/* ── Columns panel ────────────────────────────────────────────── */}
      <ColumnSettingsPanel
        isOpen={showColumnSettings}
        onClose={() => setShowColumnSettings(false)}
        columns={columns}
        onSave={saveColumns}
        moduleName="Inventory"
      />
    </div>
  );
}
