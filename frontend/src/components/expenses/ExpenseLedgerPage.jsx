import DeleteIcon from "../common/DeleteIcon";
import Checkbox from "../common/Checkbox";
import PlusIcon from "../common/PlusIcon";
import EmptyState from "../common/EmptyState";
import MoreIcon from "../common/MoreIcon";
import DownloadIcon from "../common/DownloadIcon";
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import SettingsIcon from "../common/SettingsIcon";
import {
  Search as SearchIcon, X, ChevronDown,
  Pin, PinOff, ArrowUp, ArrowDown, EyeOff, ChevronLeft, ChevronRight,
  Share2, Repeat, Copy, MessageCircle, Mail, MessageSquare,
} from "lucide-react";
import { createPortal } from "react-dom";
import API from "../../services/api";
import toast from "react-hot-toast";
import ExpenseFormPanel from "./ExpenseFormPanel";
import ExpenseReceiptModal from "./ExpenseReceiptModal";
import { useColumnSettings } from "../../hooks/useColumnSettings";
import ColumnSettingsPanel from "../ColumnSettingsPanel";
import { getPinnedBoundaryOverlayStyle } from "../../utils/pinnedColumnShadow";
import { getAncestorZoom } from "../../utils/domUtils";
import BulkActionBar from "../common/BulkActionBar";
import BulkDeleteModal from "../common/BulkDeleteModal";
import BulkActions from "../BulkActions";
import { useBulkStrip } from "../../hooks/useBulkSelection";
import useSearchOverlayOpen from "../../hooks/useSearchOverlayOpen";
import * as XLSX from "xlsx";
import EyeIcon from "../common/EyeIcon";
import EditIcon from "../common/EditIcon";

/*
 * Ledger page for Expenses and Indirect Income.
 *
 * Both are the same record with a different `kind`, so one page serves both —
 * the wording, category list and totals labelling are the only differences.
 * Header strip geometry matches Inventory.jsx / PaymentsTimeline.jsx.
 */

const money = (n) =>
  `₹${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Widths and order mirror the Payments Timeline's table so the two read as
// one component.
const SELECTION_WIDTH = 60;
const MIN_COL_WIDTH = 60;
const ALL_COLUMNS = [
  { key: "category", label: "Category", width: 240 },
  { key: "vendor", label: "Vendor", width: 190 },
  { key: "amount", label: "Amount", width: 160 },
  { key: "mode", label: "Mode", width: 200 },
  { key: "notes", label: "Notes", width: 260 },
  { key: "date", label: "Date", width: 200 },
];

// What each column sorts on. Kept beside the definitions so a new column
// can't be added without deciding how it sorts.
const SORT_VALUE = {
  category: (r) => (r.category || "").toLowerCase(),
  vendor: (r) => (r.vendor?.companyName || r.vendor?.name || "").toLowerCase(),
  amount: (r) => Number(r.amount) || 0,
  mode: (r) => (r.paymentType || "").toLowerCase(),
  notes: (r) => (r.notes || "").toLowerCase(),
  date: (r) => new Date(r.date || 0).getTime(),
};

const DEFAULT_COL_WIDTHS = ALL_COLUMNS.reduce(
  (acc, c) => ({ ...acc, [c.key]: c.width }),
  { selection: SELECTION_WIDTH }
);

// Thin grab strip on a header's right edge. Memoised because it renders once
// per column on every table render.
const ColumnResizeHandle = React.memo(({ colId, onResizeStart }) => (
  <div
    data-resize-handle
    onMouseDown={(e) => onResizeStart(e, colId)}
    className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-[#0085FF]/30 transition-colors"
  />
));
ColumnResizeHandle.displayName = "ColumnResizeHandle";

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default function ExpenseLedgerPage({ kind = "expense", icon: Icon, title, subtitle }) {
  const isSearchOverlayOpen = useSearchOverlayOpen();
  const isIncome = kind === "income";
  const noun = isIncome ? "Income" : "Expense";

  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const searchInputRef = useRef(null);

  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    limit: 20,
    totalCount: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });
  const [editingPage, setEditingPage] = useState(false);
  const [pageInput, setPageInput] = useState("");
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [sort, setSort] = useState({ key: null, dir: "desc" });
  const [openMenu, setOpenMenu] = useState(null);
  const [rowMenuPos, setRowMenuPos] = useState(null);
  // Which page of the row flyout is showing: the action list, the Convert
  // targets, or the share channels. Mirrors Accounting.jsx's row menu.
  const [rowMenuView, setRowMenuView] = useState("main");
  const [viewRow, setViewRow] = useState(null);
  const [busyRowId, setBusyRowId] = useState(null);

  /* Column visibility + order persist per page via the same hook Companies
     and the timeline use. Pin side and widths stay session-local, matching
     how those pages treat them. */
  const defaultColumns = useMemo(
    () =>
      ALL_COLUMNS.map((c, i) => ({
        key: c.key,
        label: c.label,
        visible: true,
        order: i,
        sortable: true,
        // The first column can't be hidden - hiding every column would leave
        // a table with nothing but checkboxes.
        required: i === 0,
      })),
    []
  );
  const { columns, saveColumns, getVisibleColumns } = useColumnSettings(
    kind === "income" ? "indirectIncome" : "expenses",
    defaultColumns
  );
  const [colWidths, setColWidths] = useState(DEFAULT_COL_WIDTHS);
  const [pinnedCols, setPinnedCols] = useState({});
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [openColumnMenuKey, setOpenColumnMenuKey] = useState(null);
  const [columnMenuPos, setColumnMenuPos] = useState(null);
  const [draggedColKey, setDraggedColKey] = useState(null);
  const [dragOverColKey, setDragOverColKey] = useState(null);
  const [dragGhost, setDragGhost] = useState(null);
  const dragOverRef = useRef(null);
  const ghostElRef = useRef(null);

  const toggleSort = (key) =>
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    );

  const openColumnMenu = (e, colId) => {
    e.stopPropagation();
    // Anchored to the chevron's RIGHT edge, so the menu stays over its own
    // column instead of growing rightward into the next one.
    const zoom = getAncestorZoom(document.body);
    const MENU_W = 160;
    const rect = e.currentTarget.getBoundingClientRect();
    let left = rect.right / zoom - MENU_W;
    left = Math.min(left, window.innerWidth / zoom - MENU_W - 8);
    left = Math.max(left, 8);
    setColumnMenuPos({ top: rect.bottom / zoom + 4, left });
    setOpenColumnMenuKey(colId);
  };
  const closeColumnMenu = () => {
    setOpenColumnMenuKey(null);
    setColumnMenuPos(null);
  };

  const setColumnPin = useCallback((colId, side) => {
    setPinnedCols((prev) => {
      const next = { ...prev };
      if (next[colId] === side) delete next[colId];
      else next[colId] = side;
      return next;
    });
  }, []);

  // Visible columns in saved order, with pinned ones pulled to their side.
  const orderedColumns = useMemo(() => {
    const visible = getVisibleColumns();
    return visible
      .map((vc) => ALL_COLUMNS.find((c) => c.key === vc.key))
      .filter(Boolean)
      .sort((a, b) => {
        const rank = (c) => (pinnedCols[c.key] === "left" ? 0 : pinnedCols[c.key] === "right" ? 2 : 1);
        return rank(a) - rank(b);
      });
  }, [columns, pinnedCols, getVisibleColumns]);

  // The pinned block reads as floating above the scrollable columns: a shadow
  // on the last left-pinned and the first right-pinned column, in display order.
  const leftPinned = orderedColumns.filter((c) => pinnedCols[c.key] === "left");
  const rightPinned = orderedColumns.filter((c) => pinnedCols[c.key] === "right");
  const lastLeftPinnedKey = leftPinned.length ? leftPinned[leftPinned.length - 1].key : null;
  const firstRightPinnedKey = rightPinned.length ? rightPinned[0].key : null;
  const boundaryShadowSideFor = (key) =>
    key === lastLeftPinnedKey ? "left" : key === firstRightPinnedKey ? "right" : null;

  const stickyStyles = useMemo(() => {
    const map = {};
    // The selection column is always pinned left, so left offsets start after it.
    let leftOffset = colWidths.selection ?? SELECTION_WIDTH;
    for (const c of orderedColumns) {
      if (pinnedCols[c.key] === "left") {
        map[c.key] = { position: "sticky", left: leftOffset, zIndex: 15 };
        leftOffset += colWidths[c.key] ?? c.width;
      }
    }
    let rightOffset = 0;
    for (const c of [...orderedColumns].reverse()) {
      if (pinnedCols[c.key] === "right") {
        map[c.key] = { position: "sticky", right: rightOffset, zIndex: 15 };
        rightOffset += colWidths[c.key] ?? c.width;
      }
    }
    return map;
  }, [orderedColumns, pinnedCols, colWidths]);
  const stickyStyleFor = (key) => stickyStyles[key] || {};

  const startColumnResize = useCallback((e, colId) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const startX = e.clientX;
    const startW = colWidths[colId] ?? MIN_COL_WIDTH;
    const onMove = (mv) =>
      setColWidths((prev) => ({
        ...prev,
        [colId]: Math.max(MIN_COL_WIDTH, startW + mv.clientX - startX),
      }));
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

  // Reorders the visible columns and reassigns `order` across all of them, so
  // the new order persists through saveColumns.
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

  // Drag to reorder. No floating ghost preview (the timeline has one) - the
  // drop target is highlighted and the dragged header dims instead.
  // Plain text for a cell, used by the drag ghost's column preview.
  const cellTextFor = (colKey, row) => {
    switch (colKey) {
      case "category":
        return row.category || noun;
      case "vendor":
        return row.vendor?.companyName || row.vendor?.name || "—";
      case "amount":
        return money(row.amount);
      case "mode":
        return row.paymentType || "—";
      case "notes":
        return row.notes || "—";
      case "date":
        return formatDate(row.date);
      default:
        return "";
    }
  };

  // Same lift-and-carry column drag as PaymentsTimeline.jsx: a floating ghost
  // of the column (header + its cell values) follows the cursor, so the drag
  // reads as picking the column up rather than just tinting the header.
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
      const col = ALL_COLUMNS.find((c) => c.key === colId);

      dragState.zGhost = getAncestorZoom(document.body);
      dragState.offsetX = startX - rect.left;
      dragState.offsetY = startY - rect.top;

      dragOverRef.current = null;
      setDraggedColKey(colId);
      setDragOverColKey(null);
      document.body.style.userSelect = "none";
      setDragGhost({
        label: col?.label || colId,
        previewRows: sortedRows.map((row) => cellTextFor(colId, row)),
        width: rect.width / dragState.zGhost,
        height: rect.height / dragState.zGhost,
      });

      requestAnimationFrame(() => positionGhost(startX, startY));
    };

    const onMove = (mv) => {
      if (!dragState.started) {
        if (Math.hypot(mv.clientX - startX, mv.clientY - startY) < THRESHOLD) return;
        mv.preventDefault();
        beginDrag();
      }
      positionGhost(mv.clientX, mv.clientY);
      updateDragOver(mv.clientX, mv.clientY);
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (!dragState.started) return;
      document.body.style.userSelect = "";
      const overKey = dragOverRef.current;
      if (overKey && overKey !== colId) handleColumnReorder(colId, overKey);
      dragOverRef.current = null;
      setDraggedColKey(null);
      setDragOverColKey(null);
      setDragGhost(null);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const sortedRows = useMemo(() => {
    const pick = SORT_VALUE[sort.key];
    if (!pick) return rows;
    // Copy first - sort mutates, and `rows` is the fetched state.
    return [...rows].sort((a, b) => {
      const av = pick(a);
      const bv = pick(b);
      if (av === bv) return 0;
      return (av > bv ? 1 : -1) * (sort.dir === "asc" ? 1 : -1);
    });
  }, [rows, sort]);

  const allSelected = sortedRows.length > 0 && selectedIds.length === sortedRows.length;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get("/expenses", {
        params: {
          kind,
          search: searchTerm || undefined,
          page: pagination.currentPage,
          limit: pagination.limit,
        },
      });
      setRows(res.data.documents || []);
      setSelectedIds([]);
      setSummary(res.data.summary || null);
      if (res.data.pagination) {
        setPagination((p) => ({ ...p, ...res.data.pagination }));
      }
    } catch (err) {
      console.error("Fetch failed", err);
      toast.error(`Failed to load ${title.toLowerCase()}`);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [kind, searchTerm, title, pagination.currentPage, pagination.limit]);

  useEffect(() => {
    setPagination((p) => (p.currentPage === 1 ? p : { ...p, currentPage: 1 }));
  }, [searchTerm]);

  // Debounced so typing in the search box doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(fetchData, searchTerm ? 300 : 0);
    return () => clearTimeout(t);
  }, [fetchData, searchTerm]);

  useEffect(() => {
    if (!openMenu) return;
    const close = () => { setOpenMenu(null); setRowMenuPos(null); setRowMenuView("main"); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [openMenu]);

  const handleDelete = async (row) => {
    if (!window.confirm(`Delete this ${noun.toLowerCase()} of ${money(row.amount)}?`)) return;
    setDeletingId(row._id);
    try {
      await API.delete(`/expenses/${row._id}`);
      toast.success(`${noun} deleted`);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to delete");
    } finally {
      setDeletingId(null);
    }
  };

  const handlePageChange = (next) => {
    if (next > 0 && next <= pagination.totalPages) {
      setPagination((p) => ({ ...p, currentPage: next }));
    }
  };

  const handleBulkDelete = () => {
    if (!selectedIds.length) return;
    setShowBulkDeleteModal(true);
  };

  const executeBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      // Sequential so a partial failure leaves the rest deleted and reported.
      let failed = 0;
      for (const id of selectedIds) {
        try {
          await API.delete(`/expenses/${id}`);
        } catch {
          failed += 1;
        }
      }
      if (failed) toast.error(`${failed} of ${selectedIds.length} could not be deleted`);
      else toast.success(`${selectedIds.length} deleted`);
      setSelectedIds([]);
      setShowBulkDeleteModal(false);
      fetchData();
    } finally {
      setBulkDeleting(false);
    }
  };

  // One field at a time across the selected entries, same shared BulkActions
  // dialog the Items/Products pages use. Kept to the fields that are safe to
  // set in bulk — amount/date are per-entry facts, not batch edits.
  const ledgerFieldConfig = {
    fields: [
      { key: "category", label: "Category", type: "text" },
      {
        key: "paymentType",
        label: "Mode",
        type: "select",
        options: ["UPI", "Cash", "Card", "Net Banking", "Cheque", "EMI"],
      },
      { key: "status", label: "Status", type: "select", options: ["Pending", "Paid"] },
      { key: "notes", label: "Notes", type: "text" },
    ],
  };

  const handleBulkUpdate = async ({ field, value, itemIds }) => {
    setBulkUpdating(true);
    try {
      // Sequential for the same reason handleBulkDelete is.
      let failed = 0;
      for (const id of itemIds) {
        try {
          await API.put(`/expenses/${id}`, { [field]: value });
        } catch {
          failed += 1;
        }
      }
      if (failed) toast.error(`${failed} of ${itemIds.length} could not be updated`);
      else toast.success(`${itemIds.length} updated`);
      setSelectedIds([]);
      setShowBulkActions(false);
      fetchData();
    } finally {
      setBulkUpdating(false);
    }
  };

  const closeRowMenu = () => {
    setOpenMenu(null);
    setRowMenuPos(null);
    setRowMenuView("main");
  };

  // One-row export. Same sheet shape as the toolbar's bulk export so the two
  // files are readable side by side.
  const handleDownloadRow = (row) => {
    const sheet = XLSX.utils.json_to_sheet([
      {
        Date: formatDate(row.date),
        Category: row.category || "",
        Vendor: row.vendor?.companyName || row.vendor?.name || "",
        Notes: row.notes || "",
        Mode: row.paymentType || "",
        Bank: row.bankAccount?.bank || "",
        "Amount (INR)": Number(row.amount) || 0,
        Currency: row.currency || "INR",
        "Original Amount": row.foreignAmount ?? "",
      },
    ]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, noun);
    XLSX.writeFile(book, `${noun.toLowerCase()}-${formatDate(row.date).replace(/\s+/g, "-")}.xlsx`);
    toast.success("Downloaded");
  };

  const handleDuplicate = async (row) => {
    setBusyRowId(row._id);
    const tid = toast.loading("Duplicating...");
    try {
      await API.post("/expenses", {
        kind,
        amount: row.currency && row.currency !== "INR" ? row.foreignAmount ?? row.amount : row.amount,
        currency: row.currency || "INR",
        exchangeRate: row.exchangeRate ?? 1,
        date: row.date,
        category: row.category || "",
        notes: row.notes || "",
        vendor: row.vendor?._id || row.vendor || null,
        attachments: row.attachments || [],
        status: row.status,
        paymentDate: row.paymentDate,
        paymentType: row.paymentType,
        bankAccount: row.bankAccount?._id || row.bankAccount || null,
        paymentNotes: row.paymentNotes || "",
      });
      toast.success(`${noun} duplicated`, { id: tid });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to duplicate", { id: tid });
    } finally {
      setBusyRowId(null);
    }
  };

  // Expense <-> Indirect Income are the same record with a different `kind`,
  // so converting is a one-field update. The row leaves this list on success.
  const convertTargetKind = isIncome ? "expense" : "income";
  const convertTargetLabel = isIncome ? "Expense" : "Indirect Income";
  const handleConvert = async (row) => {
    setBusyRowId(row._id);
    const tid = toast.loading("Converting...");
    try {
      await API.put(`/expenses/${row._id}`, { kind: convertTargetKind });
      toast.success(`Converted to ${convertTargetLabel}`, { id: tid });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to convert", { id: tid });
    } finally {
      setBusyRowId(null);
    }
  };

  // Expenses have no public view link, so the share text is the entry itself
  // rather than a URL.
  const shareText = (row) =>
    [
      `${noun}: ${row.category || "Uncategorised"}`,
      `Amount: ${money(row.amount)}`,
      `Date: ${formatDate(row.date)}`,
      row.vendor?.companyName || row.vendor?.name ? `Vendor: ${row.vendor.companyName || row.vendor.name}` : null,
      row.paymentType ? `Mode: ${row.paymentType}` : null,
      row.notes ? `Notes: ${row.notes}` : null,
    ]
      .filter(Boolean)
      .join("\n");

  const shareVia = (channel, row) => {
    const text = shareText(row);
    if (channel === "whatsapp") {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    } else if (channel === "email") {
      window.location.href = `mailto:?subject=${encodeURIComponent(`${noun} ${row.category || "Uncategorised"} (${money(row.amount)})`)}&body=${encodeURIComponent(text)}`;
    } else if (channel === "sms") {
      window.location.href = `sms:?&body=${encodeURIComponent(text)}`;
    }
  };

  const handleExport = () => {
    const chosen = selectedIds.length
      ? sortedRows.filter((r) => selectedIds.includes(r._id))
      : sortedRows;
    if (!chosen.length) {
      toast.error("Nothing to export");
      return;
    }
    const data = chosen.map((r) => ({
      Date: formatDate(r.date),
      Category: r.category || "",
      Vendor: r.vendor?.companyName || r.vendor?.name || "",
      Notes: r.notes || "",
      Mode: r.paymentType || "",
      Bank: r.bankAccount?.bank || "",
      "Amount (INR)": Number(r.amount) || 0,
      Currency: r.currency || "INR",
      "Original Amount": r.foreignAmount ?? "",
    }));
    const sheet = XLSX.utils.json_to_sheet(data);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, title);
    XLSX.writeFile(book, `${title.replace(/\s+/g, "-").toLowerCase()}.xlsx`);
    toast.success(`Exported ${chosen.length} ${chosen.length === 1 ? "row" : "rows"}`);
  };

  const { visible: stripVisible, closing: stripClosing } = useBulkStrip(selectedIds.length);

  const openCreate = () => {
    setEditing(null);
    setPanelOpen(true);
  };
  const openEdit = (row) => {
    setEditing(row);
    setPanelOpen(true);
  };

  return (
    // Cancels App.jsx's <main> gutter, same as the other full-bleed pages.
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-white -mt-6 -mx-4 sm:-mx-6 lg:-mx-8">
      <div
        className="fixed right-0 border-b border-[#E1E4EA] bg-white flex items-center justify-between gap-2 lg:gap-4 px-4 sm:px-6 lg:px-8 top-[calc(54px+var(--dc-offline-offset,0px))] lg:top-[calc(64px+var(--dc-offline-offset,0px))]"
        style={{
          left: "var(--sidebar-width, 0px)",
          zIndex: 40,
          height: 64,
          minHeight: 64,
          maxHeight: 64,
          boxSizing: "border-box",
        }}
      >
        {stripVisible ? (
          <BulkActionBar
            bare
            selectedCount={selectedIds.length}
            entityName={noun.toLowerCase()}
            isClosing={stripClosing}
            isDeleting={bulkDeleting}
            onSelectAll={() => setSelectedIds(sortedRows.map((r) => r._id))}
            onDeselectAll={() => setSelectedIds([])}
            onExport={handleExport}
            onDelete={handleBulkDelete}
            onUpdateStatus={() => setShowBulkActions(true)}
            onCancel={() => setSelectedIds([])}
          />
        ) : (
          <>
        <div className="flex flex-col gap-1 flex-shrink-0 min-w-0">
          <div className="flex items-center gap-2">
            <h2
              className="m-0 font-medium truncate text-sm sm:text-base"
              style={{ lineHeight: "120%", letterSpacing: "-0.5px", color: "#0E121B" }}
            >
              {title}
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] sm:text-xs font-semibold flex-shrink-0">
              {summary?.count ?? 0} {summary?.count === 1 ? "entry" : "entries"}
            </span>
          </div>
          {subtitle && (
            <p className="text-[#5B5A64] text-[10px] sm:text-sm m-0 leading-tight truncate">{subtitle}</p>
          )}
        </div>

        {/* Totals live in the strip rather than a band of their own — they're
            three short numbers, and giving them a full row pushed the table
            down while leaving the strip half empty. Hidden below lg, where
            the strip has no room to spare. */}
        <div className="hidden lg:flex items-center gap-6 flex-1 justify-center min-w-0">
          {/* Just the one figure: every entry is recorded as Paid now, so a
              Paid column would repeat the total and Pending would always read
              zero. */}
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-[#78788D] leading-tight truncate">
              Total {title}
            </p>
            <p className="text-[15px] font-semibold leading-tight text-[#0E121B]">
              {money(summary?.total)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 lg:gap-4 flex-shrink-0">
          <div
            className={`relative h-10 flex items-center border rounded-full bg-white transition-all duration-300 ease-in-out hover:bg-gray-50 focus-within:border-[#0085FF] focus-within:hover:bg-white ${
              searchTerm ? "border-[#0085FF]" : "border-[#E1E4EA]"
            } ${isSearchExpanded ? "w-full lg:w-[416px]" : "w-10"} max-w-full`}
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
              placeholder={`Search ${title.toLowerCase()} by category, notes, or amount...`}
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

          <div className="relative flex-shrink-0">
            <button
              type="button"
              onClick={() => setMoreMenuOpen((v) => !v)}
              onBlur={() => setTimeout(() => setMoreMenuOpen(false), 150)}
              title="More"
              className="flex items-center justify-center w-10 h-10 rounded-full border border-[#E1E4EA] text-[#525866] hover:bg-gray-50 transition-colors"
            >
              <MoreIcon className="w-4 h-4" />
            </button>
            {moreMenuOpen && (
              <div className="absolute right-0 z-50 mt-2 w-56 bg-white border border-gray-100 rounded-xl shadow-xl py-1">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setShowColumnSettings(true); setMoreMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-[13px] text-[#161618] hover:bg-gray-50 transition-colors"
                >
                  <SettingsIcon className="w-4 h-4 text-gray-400" />
                  Manage Columns
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { handleExport(); setMoreMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-[13px] text-[#161618] hover:bg-gray-50 transition-colors"
                >
                  <EyeIcon className="w-4 h-4 text-gray-400" />
                  Export all
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center justify-center gap-2 h-10 w-10 lg:w-auto px-0 lg:px-4 bg-[#0085FF] text-white text-sm font-medium rounded-full hover:bg-blue-600 focus:outline-none cursor-pointer transition-colors flex-shrink-0"
            title={`Add ${noun}`}
          >
            <PlusIcon className="w-4 h-4 flex-shrink-0" />
            <span className="hidden lg:inline whitespace-nowrap">Add {noun}</span>
          </button>
        </div>
          </>
        )}
      </div>

      {/* overflow-x-auto: the columns have fixed widths that total more than a
          narrow viewport, so the table scrolls sideways inside this container
          rather than pushing the page itself wide. */}
      {/*
       * Positioned, not margin-stacked. The page container carries -mt-6 to
       * cancel the <main> gutter, which shifted a margin-based offset up by
       * 24px and left the header row tucked under the fixed strip. These are
       * the same offsets Companies.jsx uses: 118px on small screens, 128px
       * from lg (app header + the 64px strip), so the table's first line sits
       * exactly on the strip's divider.
       */}
      <div
        // The breakpoint lives in CSS, not in a `window.innerWidth` read -
        // that is evaluated once at render and would not follow a resize.
        className="overflow-x-auto overflow-y-auto bg-white top-[calc(118px+var(--dc-offline-offset,0px))] lg:top-[calc(128px+var(--dc-offline-offset,0px))]"
        style={{
          position: "fixed",
          left: "var(--sidebar-width, 0px)",
          right: 0,
          // Stops above the pagination bar so rows never slide under it.
          bottom: 64,
          // Same inset PaymentsTimeline applies to its table container, so the
          // first column lines up with the other pages' first column.
          paddingLeft: "var(--content-inset, 16px)",
        }}
      >
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-[#158FFF] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Icon}
            noun={noun}
            title={`No ${title.toLowerCase()} yet`}
            isFiltered={!!searchTerm}
            filteredTitle={`No matching ${title.toLowerCase()}`}
            filteredDescription="Try a different search."
            description={`Record your first ${noun.toLowerCase()} to see it here.`}
            onCreate={openCreate}
            buttonLabel={`Add ${noun}`}
          />
        ) : (
          /*
           * Same table treatment as PaymentsTimeline.jsx: sticky #F5F7FA
           * header with per-column chevrons, a sticky selection column, 37px
           * rows with the blue hover, and inset box-shadow cell borders
           * (rather than real borders, which double up against the sticky
           * column). The chevron sorts - the timeline's opens a pin/resize
           * menu this list has no need for.
           */
          <table className="min-w-full divide-y divide-gray-200 table-fixed">
            <thead className="bg-[#F5F7FA] sticky top-0 z-20">
              <tr>
                <th
                  style={{
                    width: SELECTION_WIDTH,
                    position: "sticky",
                    left: 0,
                    zIndex: 20,
                    boxShadow: "inset -1px 0 0 0 #E1E4EA",
                  }}
                  className="relative px-4 py-3 bg-[#F5F7FA]"
                >
                  <div className="flex justify-center items-center">
                    <Checkbox checked={allSelected} onChange={(e) =>
                        setSelectedIds(e.target.checked ? sortedRows.map((r) => r._id) : [])
                      } uncheckedColor="text-[#525866]" />
                  </div>
                </th>

                {orderedColumns.map((col) => {
                  const isDragging = draggedColKey === col.key;
                  const isDragOver =
                    dragOverColKey === col.key && draggedColKey && draggedColKey !== col.key;
                  const boundarySide = boundaryShadowSideFor(col.key);
                  return (
                    <th
                      key={col.key}
                      data-col-id={col.key}
                      onMouseDown={(e) => startColumnDrag(e, col.key)}
                      title="Drag to move this column"
                      style={{
                        width: colWidths[col.key] ?? col.width,
                        opacity: isDragging ? 0.35 : 1,
                        boxShadow: "inset -1px 0 0 0 #E1E4EA",
                        ...stickyStyleFor(col.key),
                      }}
                      className={`relative px-4 py-3 text-left text-sm font-bold text-[#525866] transition-colors ${
                        isDragOver ? "bg-blue-100" : "bg-[#F5F7FA] hover:bg-[#EDF0F5]"
                      } ${draggedColKey ? "cursor-grabbing" : "cursor-grab"} active:cursor-grabbing`}
                    >
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <span className="truncate flex-1 min-w-0 flex items-center gap-1.5">
                          <span className="truncate">{col.label}</span>
                          {sort.key === col.key && (sort.dir === "asc"
                            ? <ArrowUp className="w-3 h-3 text-[#0085FF] flex-shrink-0" />
                            : <ArrowDown className="w-3 h-3 text-[#0085FF] flex-shrink-0" />)}
                          {pinnedCols[col.key] && (
                            <Pin className="w-3 h-3 text-[#0085FF] flex-shrink-0" />
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => openColumnMenu(e, col.key)}
                          title="Column options"
                          className="p-1 rounded hover:bg-gray-200 transition-colors text-gray-500 flex-shrink-0"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <ColumnResizeHandle colId={col.key} onResizeStart={startColumnResize} />
                      {boundarySide && <div style={getPinnedBoundaryOverlayStyle(boundarySide)} />}
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody className="bg-white">
              {sortedRows.map((r) => {
                const selected = selectedIds.includes(r._id);
                const vendorName = r.vendor?.companyName || r.vendor?.name || "";
                return (
                  <tr
                    key={r._id}
                    className={`bg-white hover:bg-blue-50 transition-colors ${selected ? "!bg-blue-50" : ""}`}
                    style={{ height: 37, maxHeight: 37 }}
                  >
                    <td
                      style={{
                        width: SELECTION_WIDTH,
                        position: "sticky",
                        left: 0,
                        zIndex: 10,
                        boxShadow: "inset -1px 0 0 0 #E1E4EA, inset 0 -1px 0 0 #E1E4EA",
                      }}
                      className="px-4 py-2 align-middle bg-inherit overflow-hidden"
                    >
                      <div className="flex justify-center items-center">
                        <Checkbox checked={selected} onChange={() =>
                            setSelectedIds((prev) =>
                              prev.includes(r._id)
                                ? prev.filter((x) => x !== r._id)
                                : [...prev, r._id]
                            )
                          } />
                      </div>
                    </td>

                    {orderedColumns.map((col, i) => {
                      const isRightmost = i === orderedColumns.length - 1;
                      const boundarySide = boundaryShadowSideFor(col.key);
                      return (
                        <td
                          key={col.key}
                          style={{
                            width: colWidths[col.key] ?? col.width,
                            boxShadow: isRightmost
                              ? "inset 0 -1px 0 0 #E1E4EA"
                              : "inset -1px 0 0 0 #E1E4EA, inset 0 -1px 0 0 #E1E4EA",
                            ...stickyStyleFor(col.key),
                          }}
                          className={`relative px-4 py-2 align-middle text-sm text-[#1C1B1F] bg-inherit whitespace-nowrap ${
                            boundarySide ? "" : "overflow-hidden"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 w-full min-w-0">
                            <div className="flex-1 min-w-0">
                              {col.key === "category" && (
                                // Two-line, like the timeline's Party / Entity
                                // cell: the name, with what kind of record it
                                // is underneath.
                                <div className="flex flex-col truncate">
                                  <span className="text-sm font-semibold text-gray-900 truncate">
                                    {r.category || (isIncome ? "Indirect Income" : "Expense")}
                                  </span>
                                  <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mt-0.5 truncate">
                                    {isIncome ? "Indirect Income" : "Expense"}
                                  </span>
                                </div>
                              )}
                              {col.key === "vendor" && (
                                <span className={vendorName ? "" : "text-gray-400"}>
                                  {vendorName || "\u2014"}
                                </span>
                              )}
                              {col.key === "amount" && (
                                <div className="flex flex-col truncate">
                                  <span className="font-medium text-gray-700">{money(r.amount)}</span>
                                  {r.currency && r.currency !== "INR" && r.foreignAmount != null && (
                                    <span className="text-[10px] text-gray-500 mt-0.5">
                                      {r.currency} {Number(r.foreignAmount).toLocaleString("en-IN")}
                                    </span>
                                  )}
                                </div>
                              )}
                              {col.key === "mode" && (
                                <div className="flex flex-col truncate">
                                  <span className="truncate">{r.paymentType || "\u2014"}</span>
                                  {r.bankAccount?.bank && (
                                    <span className="text-[10px] text-gray-500 mt-0.5 truncate">
                                      {r.bankAccount.bank}
                                    </span>
                                  )}
                                </div>
                              )}
                              {col.key === "notes" && (
                                <span className={`truncate block ${r.notes ? "" : "text-gray-400"}`}>
                                  {r.notes || "\u2014"}
                                </span>
                              )}
                              {col.key === "date" && <span>{formatDate(r.date)}</span>}
                            </div>

                            {isRightmost && (
                              <div className="relative flex-shrink-0">
                                <button
                                  type="button"
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (openMenu === r._id) {
                                      setOpenMenu(null);
                                      setRowMenuPos(null);
                                      return;
                                    }
                                    // Same zoom-corrected, row-centered, viewport-clamped
                                    // anchoring as the PaymentsTimeline row-actions menu.
                                    const zMenu = getAncestorZoom(document.body);
                                    const MENU_W = 224; // matches w-56 below
                                    const MENU_H = 300; // 7 items + divider + padding
                                    const MARGIN = 8;
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const viewportH = window.innerHeight / zMenu;
                                    // clientWidth, not innerWidth: the latter counts the
                                    // vertical scrollbar and lets the menu sit under it.
                                    const viewportW = document.documentElement.clientWidth / zMenu;

                                    // Hangs below the trigger, flipping above it when the
                                    // row is near the bottom. Centering on the row (what the
                                    // shorter timeline menu does) would put this taller menu
                                    // over the toolbar for rows near the top.
                                    const btnTop = rect.top / zMenu;
                                    const btnBottom = rect.bottom / zMenu;
                                    let calcTop = btnBottom + 4;
                                    if (calcTop + MENU_H > viewportH - MARGIN) {
                                      calcTop = btnTop - 4 - MENU_H;
                                    }
                                    calcTop = Math.max(MARGIN, Math.min(calcTop, viewportH - MENU_H - MARGIN));

                                    let calcLeft = rect.right / zMenu - MENU_W;
                                    calcLeft = Math.min(calcLeft, viewportW - MENU_W - MARGIN);
                                    calcLeft = Math.max(calcLeft, MARGIN);

                                    setRowMenuPos({ top: calcTop, left: calcLeft });
                                    setOpenMenu(r._id);
                                  }}
                                  title="Actions"
                                  className="w-7 h-7 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 transition-colors"
                                >
                                  <MoreIcon className="w-4 h-4" />
                                </button>
                                {openMenu === r._id && rowMenuPos && createPortal(
                                  <>
                                    <div
                                      className="fixed inset-0 z-[59]"
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onClick={closeRowMenu}
                                    />
                                    <div
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onClick={(e) => e.stopPropagation()}
                                      style={{ position: "fixed", top: rowMenuPos.top, left: rowMenuPos.left }}
                                      className="w-56 bg-white border border-[#E1E4EA] rounded-xl shadow-xl py-1 z-[60] max-h-[70vh] overflow-y-auto"
                                    >
                                      {rowMenuView === "main" && (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => { closeRowMenu(); setViewRow(r); }}
                                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                          >
                                            <EyeIcon className="w-4 h-4 text-blue-600" />
                                            View
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => { closeRowMenu(); openEdit(r); }}
                                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                          >
                                            <EditIcon className="w-4 h-4 text-blue-600" />
                                            Edit
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => { closeRowMenu(); handleDownloadRow(r); }}
                                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                          >
                                            <DownloadIcon className="w-4 h-4 text-green-600" />
                                            Download
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setRowMenuView("share")}
                                            className="w-full flex items-center justify-between gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                          >
                                            <span className="flex items-center gap-2 text-left">
                                              <Share2 className="w-4 h-4 text-blue-600 flex-shrink-0" />
                                              Share via WhatsApp/Email/SMS
                                            </span>
                                            <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setRowMenuView("convert")}
                                            className="w-full flex items-center justify-between px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                          >
                                            <span className="flex items-center gap-2">
                                              <Repeat className="w-4 h-4 text-orange-600" />
                                              Convert
                                            </span>
                                            <ChevronRight className="w-4 h-4 text-gray-400" />
                                          </button>
                                          <button
                                            type="button"
                                            disabled={busyRowId === r._id}
                                            onClick={() => { closeRowMenu(); handleDuplicate(r); }}
                                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 flex items-center gap-2"
                                          >
                                            <Copy className="w-4 h-4 text-indigo-600" />
                                            Duplicate
                                          </button>
                                          <div className="border-t border-gray-100 my-1" />
                                          <button
                                            type="button"
                                            disabled={deletingId === r._id}
                                            onClick={() => { closeRowMenu(); handleDelete(r); }}
                                            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40 flex items-center gap-2"
                                          >
                                            <DeleteIcon className="w-4 h-4" />
                                            Delete
                                          </button>
                                        </>
                                      )}

                                      {rowMenuView === "share" && (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => setRowMenuView("main")}
                                            className="w-full flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 border-b border-gray-100"
                                          >
                                            <ChevronLeft className="w-4 h-4" />
                                            Back
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => { closeRowMenu(); shareVia("whatsapp", r); }}
                                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                          >
                                            <MessageCircle className="w-4 h-4 text-green-600" />
                                            WhatsApp
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => { closeRowMenu(); shareVia("email", r); }}
                                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                          >
                                            <Mail className="w-4 h-4 text-blue-600" />
                                            Email
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => { closeRowMenu(); shareVia("sms", r); }}
                                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                          >
                                            <MessageSquare className="w-4 h-4 text-orange-600" />
                                            SMS
                                          </button>
                                        </>
                                      )}

                                      {rowMenuView === "convert" && (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => setRowMenuView("main")}
                                            className="w-full flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 border-b border-gray-100"
                                          >
                                            <ChevronLeft className="w-4 h-4" />
                                            Back
                                          </button>
                                          <button
                                            type="button"
                                            disabled={busyRowId === r._id}
                                            onClick={() => { closeRowMenu(); handleConvert(r); }}
                                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 flex items-center gap-2"
                                          >
                                            <Repeat className="w-4 h-4 text-orange-600" />
                                            Convert to {convertTargetLabel}
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </>,
                                  document.body
                                )}
                              </div>
                            )}
                          </div>
                          {boundarySide && (
                            <div style={getPinnedBoundaryOverlayStyle(boundarySide)} />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination — same bar and controls as Companies.jsx: the count and
          the per-page picker sit together on the left, the pager on the
          right, and the bar dims with the search overlay. */}
      <div
        className={`fixed bottom-0 right-0 bg-white border-t border-[#E1E4EA] shadow-sm z-[9992] flex items-center ${
          isSearchOverlayOpen ? "pointer-events-none" : ""
        }`}
        style={{
          left: "var(--sidebar-width, 0px)",
          height: 64,
          filter: isSearchOverlayOpen ? "brightness(0.6)" : "none",
        }}
      >
        <div className="w-full bg-white px-4 py-3 flex items-center justify-between sm:px-6">
          <div className="flex-1 flex justify-between sm:hidden">
            <button
              type="button"
              onClick={() => handlePageChange(pagination.currentPage - 1)}
              disabled={!pagination.hasPrevPage}
              className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => handlePageChange(pagination.currentPage + 1)}
              disabled={!pagination.hasNextPage}
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
                  {pagination.totalCount === 0
                    ? 0
                    : (pagination.currentPage - 1) * pagination.limit + 1}
                </span>{" "}
                to{" "}
                <span className="font-semibold">
                  {Math.min(pagination.currentPage * pagination.limit, pagination.totalCount)}
                </span>{" "}
                of <span className="font-semibold">{pagination.totalCount}</span> results
              </p>
              <div className="relative ml-2">
                <select
                  value={pagination.limit}
                  onChange={(e) =>
                    setPagination((p) => ({
                      ...p,
                      limit: parseInt(e.target.value, 10),
                      currentPage: 1,
                    }))
                  }
                  className="appearance-none border border-gray-300 rounded-lg pl-3 pr-8 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer font-inter"
                >
                  {[10, 20, 50, 100, 150].map((n) => (
                    <option key={n} value={n}>
                      {n} per page
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handlePageChange(pagination.currentPage - 1)}
                disabled={!pagination.hasPrevPage}
                className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              {(() => {
                const { currentPage, totalPages } = pagination;
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
                      type="button"
                      onClick={() => handlePageChange(item)}
                      onDoubleClick={() => {
                        if (isCurrent) {
                          setPageInput(String(currentPage));
                          setEditingPage(true);
                        }
                      }}
                      title={isCurrent ? "Double-click to type a page number" : undefined}
                      className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors ${
                        isCurrent
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
                type="button"
                onClick={() => handlePageChange(pagination.currentPage + 1)}
                disabled={!pagination.hasNextPage}
                className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Column options - portalled so a narrow column can't clip it. */}
      {openColumnMenuKey && columnMenuPos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[9998]" onClick={closeColumnMenu} />
            <div
              style={{ position: "fixed", top: columnMenuPos.top, left: columnMenuPos.left }}
              className="w-[160px] z-[9999] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5 animate-in fade-in zoom-in duration-150 origin-top-right"
            >
              {(() => {
                const col = ALL_COLUMNS.find((c) => c.key === openColumnMenuKey);
                if (!col) return null;
                const side = pinnedCols[col.key];
                const required = columns.find((c) => c.key === col.key)?.required;
                // Same item metrics as Companies: xs text, 2/1.5 padding,
                // rounded-md, and the active pin state as a blue chip rather
                // than a relabelled "Unpin".
                const item =
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap";
                return (
                  <>
                    <button
                      onClick={() => { setColumnPin(col.key, "left"); closeColumnMenu(); }}
                      className={`${item} ${
                        side === "left" ? "bg-blue-50 text-blue-700" : "text-[#161618] hover:bg-gray-50"
                      }`}
                    >
                      {side === "left" ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5 text-[#1C1B1F]" />}
                      Pin to Left
                    </button>
                    <button
                      onClick={() => { setColumnPin(col.key, "right"); closeColumnMenu(); }}
                      className={`${item} ${
                        side === "right" ? "bg-blue-50 text-blue-700" : "text-[#161618] hover:bg-gray-50"
                      }`}
                    >
                      {side === "right" ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5 text-[#1C1B1F]" />}
                      Pin to Right
                    </button>

                    <button
                      onClick={() => {
                        const isActive = sort.key === col.key && sort.dir === "asc";
                        setSort(isActive ? { key: null, dir: null } : { key: col.key, dir: "asc" });
                        closeColumnMenu();
                      }}
                      className={`${item} ${sort.key === col.key && sort.dir === "asc" ? "bg-blue-50 text-blue-700 font-medium" : "text-[#161618] hover:bg-gray-50"}`}
                    >
                      <ArrowUp className="w-3.5 h-3.5 text-[#1C1B1F]" />
                      Sort Ascending
                    </button>
                    <button
                      onClick={() => {
                        const isActive = sort.key === col.key && sort.dir === "desc";
                        setSort(isActive ? { key: null, dir: null } : { key: col.key, dir: "desc" });
                        closeColumnMenu();
                      }}
                      className={`${item} ${sort.key === col.key && sort.dir === "desc" ? "bg-blue-50 text-blue-700 font-medium" : "text-[#161618] hover:bg-gray-50"}`}
                    >
                      <ArrowDown className="w-3.5 h-3.5 text-[#1C1B1F]" />
                      Sort Descending
                    </button>

                    <div className="w-full border-t border-[#F1F1F5] my-0.5" />

                    <button
                      disabled={required}
                      onClick={() => {
                        if (required) return;
                        closeColumnMenu();
                        saveColumns(
                          columns.map((c) => (c.key === col.key ? { ...c, visible: false } : c))
                        );
                      }}
                      className={`${item} ${
                        required ? "text-gray-300 cursor-not-allowed" : "text-[#161618] hover:bg-gray-50"
                      }`}
                    >
                      <EyeOff className={`w-3.5 h-3.5 ${required ? "text-gray-300" : "text-[#1C1B1F]"}`} />
                      Hide Column
                    </button>
                  </>
                );
              })()}
            </div>
          </>,
          document.body
        )}

      <ColumnSettingsPanel
        isOpen={showColumnSettings}
        onClose={() => setShowColumnSettings(false)}
        columns={columns}
        onSave={saveColumns}
        moduleName={title}
      />

      {panelOpen && (
        <ExpenseFormPanel
          kind={kind}
          record={editing}
          onClose={() => {
            setPanelOpen(false);
            setEditing(null);
          }}
          onSaved={fetchData}
        />
      )}

      {/* Drag ghost - the column being carried, same as PaymentsTimeline. */}
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
            {dragGhost.previewRows.map((val, i) => (
              <div key={i} className="px-4 py-2 border-b border-[#F1F1F5] last:border-b-0">
                <span className="text-sm text-gray-700 truncate block">{val}</span>
              </div>
            ))}
          </div>,
          document.body
        )}

      {/* "View" opens the printable receipt, same role as the payments
          timeline's receipt modal. */}
      <ExpenseReceiptModal
        isOpen={!!viewRow}
        onClose={() => setViewRow(null)}
        record={viewRow}
        kind={kind}
        onEdit={(row) => { setViewRow(null); openEdit(row); }}
        onConvert={(row) => { setViewRow(null); handleConvert(row); }}
        convertLabel={convertTargetLabel}
      />

      <BulkActions
        isOpen={showBulkActions}
        onClose={() => setShowBulkActions(false)}
        selectedItems={sortedRows.filter((r) => selectedIds.includes(r._id))}
        onBulkUpdate={handleBulkUpdate}
        fieldConfig={ledgerFieldConfig}
        module="expenses"
        loading={bulkUpdating}
      />

      <BulkDeleteModal
        isOpen={showBulkDeleteModal}
        message={
          <>
            Are you sure you want to delete <strong>{selectedIds.length}</strong> selected {selectedIds.length === 1 ? "Entry" : "Entries"}? This action cannot be undone.
          </>
        }
        loading={bulkDeleting}
        onCancel={() => setShowBulkDeleteModal(false)}
        onConfirm={executeBulkDelete}
      />

    </div>
  );
}
