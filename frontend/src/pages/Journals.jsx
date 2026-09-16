import DeleteIcon from "../components/common/DeleteIcon";
import EmptyState from "../components/common/EmptyState";
import PdfIcon from "../components/common/PdfIcon";
import Checkbox from "../components/common/Checkbox";
import PlusIcon from "../components/common/PlusIcon";
import MoreIcon from "../components/common/MoreIcon";
import DownloadIcon from "../components/common/DownloadIcon";
import React, { useState, useRef, useMemo, useCallback, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen, X, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Pin, PinOff,
  EyeOff, ArrowDownCircle, ArrowUpCircle, CheckSquare, Loader2, Lock, Unlock, ArrowUp, ArrowDown } from "lucide-react";
import toast from "react-hot-toast";
import SearchIcon from "../components/common/SearchIcon";
import HighlightText from "../components/common/HighlightText";
import TableSkeletonRows from "../components/common/TableSkeletonRows";
import { getAncestorZoom } from "../utils/domUtils";
import { getPinnedBoundaryOverlayStyle } from "../utils/pinnedColumnShadow";
import QuickJournalForm from "../components/journal/QuickJournalForm";
import JournalLedgerDrawer from "../components/journal/JournalLedgerDrawer";
import PayInOutModal from "../components/journal/PayInOutModal";
import BulkJournalUpdateModal from "../components/journal/BulkJournalUpdateModal";
import ConfirmDialog from "../components/common/ConfirmDialog";
import API from "../services/api";
import * as XLSX from "xlsx";
import EyeIcon from "../components/common/EyeIcon";
import EditIcon from "../components/common/EditIcon";

/*
 * Table UI parity pass — same pin/drag/search/row-menu infrastructure
 * Deals.jsx/Contacts.jsx/Tasks.jsx/Inventory.jsx already have (this mirrors
 * Inventory.jsx's implementation directly). Backed by the real Journal API
 * now (see backend/routes/journalRoutes.js): list/create/edit/delete all
 * hit the server. Pay In/Pay Out post to POST /journals/:id/entries and
 * update both the row's balance here and (if open) the Ledger drawer.
 */

const DEFAULT_COL_WIDTHS = {
  selection: 60,
  balance: 160,
  name: 220,
  category: 160,
  date: 160,
  lastUpdated: 160,
  description: 220,
};
const MIN_COL_WIDTH = 60;

const ALL_COLUMNS = [
  { id: "balance", key: "balance", label: "Balance" },
  { id: "name", key: "name", label: "Journal" },
  { id: "category", key: "category", label: "Category" },
  { id: "date", key: "date", label: "Date" },
  { id: "lastUpdated", key: "lastUpdated", label: "Last Updated" },
  { id: "description", key: "description", label: "Description" },
];

const money = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

const cellTextFor = (colId, j) => {
  switch (colId) {
    case "balance": return money(j.currentBalance);
    case "name": return j.name || "";
    case "category": return j.category || "";
    case "date": return formatDate(j.date);
    case "lastUpdated": return formatDate(j.updatedAt);
    case "description": return j.description || "";
    default: return "";
  }
};

export default function Journals() {
  /* search (existing) */
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [editingJournal, setEditingJournal] = useState(null);
  const [ledgerJournalId, setLedgerJournalId] = useState(null);
  const [payModal, setPayModal] = useState({ open: false, journal: null, type: "payin" });
  // Bumped whenever a Pay In/Out lands while the Ledger drawer for that same
  // journal is open, so JournalLedgerDrawer knows to re-pull its rows.
  const [ledgerRefreshKey, setLedgerRefreshKey] = useState(0);
  const searchInputRef = useRef(null);

  /* journal list — fetched from the real API */
  const [journals, setJournals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("active"); // "active" | "cancelled"

  // Sliding pill for the Active/Closed/Cancelled tabs — matches the lifecycle
  // switcher on the Contacts page (one white thumb animates to the active
  // tab instead of an underline jumping across).
  const journalTabRefs = useRef({});
  const journalTabNavRef = useRef(null);
  const [journalTabThumb, setJournalTabThumb] = useState({ left: 0, width: 0, ready: false });
  const [selectedJournals, setSelectedJournals] = useState([]);
  const [showBulkStrip, setShowBulkStrip] = useState(false);
  const [bulkStripClosing, setBulkStripClosing] = useState(false);
  
  const [isBulkUpdateModalOpen, setIsBulkUpdateModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isClosingBulk, setIsClosingBulk] = useState(false);
  const [isCancellingBulk, setIsCancellingBulk] = useState(false);
  const [isReopeningBulk, setIsReopeningBulk] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, type: null, target: null });
  const [closeConfirm, setCloseConfirm] = useState({ open: false, journal: null });
  const [cancelConfirm, setCancelConfirm] = useState({ open: false, journal: null });

  useEffect(() => {
    const active = selectedJournals.length > 0;
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
  }, [selectedJournals.length]);

  /* pagination — client-side over the already-loaded list (journals don't
     paginate server-side; the whole org's list is small enough to fetch in
     one call), same edge-to-edge bottom-bar treatment as PaymentsTimeline.jsx/
     Inventory.jsx/PurchasePage.jsx. */
  const [journalsPagination, setJournalsPagination] = useState({ currentPage: 1, limit: 50 });
  const [editingJournalsPage, setEditingJournalsPage] = useState(false);
  const [journalsPageInput, setJournalsPageInput] = useState("");

  const fetchJournals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get("/journals");
      setJournals(res.data || []);
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to load journals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJournals();
  }, [fetchJournals]);

  const handleBulkDelete = () => {
    setDeleteConfirm({ open: true, type: "bulk", target: null });
  };

  const executeBulkDelete = async () => {
    setIsDeleting(true);
    let successCount = 0;
    try {
      await Promise.all(
        selectedJournals.map(async (id) => {
          await API.delete(`/journals/${id}`);
          successCount++;
        })
      );
      toast.success(`Successfully deleted ${successCount} journal(s).`);
      setSelectedJournals([]);
      fetchJournals();
    } catch (err) {
      toast.error(err.response?.data?.error || "Error deleting some journals.");
      fetchJournals(); // Refresh to see what succeeded
    } finally {
      setIsDeleting(false);
      setDeleteConfirm({ open: false, type: null, target: null });
    }
  };

  const handleBulkUpdate = async (updates) => {
    let successCount = 0;
    try {
      await Promise.all(
        selectedJournals.map(async (id) => {
          await API.put(`/journals/${id}`, updates);
          successCount++;
        })
      );
      toast.success(`Successfully updated ${successCount} journal(s).`);
      setIsBulkUpdateModalOpen(false);
      setSelectedJournals([]);
      fetchJournals();
    } catch (err) {
      toast.error(err.response?.data?.error || "Error updating some journals.");
      fetchJournals();
    }
  };

  const handleBulkClose = async () => {
    setIsClosingBulk(true);
    let successCount = 0;
    try {
      await Promise.all(
        selectedJournals.map(async (id) => {
          await API.post(`/journals/${id}/close`);
          successCount++;
        })
      );
      toast.success(`Successfully closed ${successCount} journal(s).`);
      setSelectedJournals([]);
      fetchJournals();
      setActiveTab("settled");
    } catch (err) {
      toast.error(err.response?.data?.error || "Error closing some journals.");
      fetchJournals();
    } finally {
      setIsClosingBulk(false);
    }
  };

  const handleBulkCancel = async () => {
    setIsCancellingBulk(true);
    let successCount = 0;
    try {
      await Promise.all(
        selectedJournals.map(async (id) => {
          await API.post(`/journals/${id}/cancel`);
          successCount++;
        })
      );
      toast.success(`Successfully cancelled ${successCount} journal(s).`);
      setSelectedJournals([]);
      fetchJournals();
      setActiveTab("cancelled");
    } catch (err) {
      toast.error(err.response?.data?.error || "Error cancelling some journals.");
      fetchJournals();
    } finally {
      setIsCancellingBulk(false);
    }
  };

  const handleBulkReopen = async () => {
    setIsReopeningBulk(true);
    let successCount = 0;
    try {
      await Promise.all(
        selectedJournals.map(async (id) => {
          await API.post(`/journals/${id}/reopen`);
          successCount++;
        })
      );
      toast.success(`Successfully reopened ${successCount} journal(s).`);
      setSelectedJournals([]);
      fetchJournals();
      setActiveTab("active");
    } catch (err) {
      toast.error(err.response?.data?.error || "Error reopening some journals.");
      fetchJournals();
    } finally {
      setIsReopeningBulk(false);
    }
  };

  const handleBulkExportNames = () => {
    const selectedNames = journals
      .filter((j) => selectedJournals.includes(j._id))
      .map((j) => ({ "Journal Name": j.name }));
    
    if (selectedNames.length === 0) return;

    const worksheet = XLSX.utils.json_to_sheet(selectedNames);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Journal Names");
    XLSX.writeFile(workbook, "Selected_Journals.xlsx");
    toast.success("Names exported successfully!");
  };

  const handleBulkExportExcel = async () => {
    setIsExporting(true);
    try {
      const workbook = XLSX.utils.book_new();
      
      const selected = journals.filter((j) => selectedJournals.includes(j._id));
      
      for (const j of selected) {
        // Fetch ledger for each journal
        const res = await API.get(`/journals/${j._id}/ledger`);
        const { rows, summary } = res.data;
        const sortedRows = [...(rows || [])].reverse();
        
        const tableData = sortedRows.map(row => {
          const isOpening = row._id === `${j._id}-opening`;
          return {
            "Date Time": formatDate(row.date || row.createdAt),
            "Description": row.notes || row.description || "—",
            "Party": row.partyName || "—",
            "Mode": row.paymentType || "—",
            "Amount (in Rupees)": isOpening ? "—" : row.amount,
            "Payment Type": isOpening ? "—" : (row.type === "payin" ? "You Received" : "You Gave"),
            "Closing Balance (in Rupees)": row.balance
          };
        });

        const worksheet = XLSX.utils.json_to_sheet(tableData);
        
        // Add net balance row at top or bottom if needed, but table format is fine.
        // Make sure sheet name is valid and unique (max 31 chars)
        let sheetName = j.name.replace(/[\\/?*\[\]]/g, '').substring(0, 31);
        // Ensure unique sheet name in workbook
        let counter = 1;
        let finalSheetName = sheetName;
        while (workbook.SheetNames.includes(finalSheetName)) {
            finalSheetName = `${sheetName.substring(0, 27)}(${counter})`;
            counter++;
        }
        
        XLSX.utils.book_append_sheet(workbook, worksheet, finalSheetName || "Ledger");
      }
      
      XLSX.writeFile(workbook, "Selected_Journal_Ledgers.xlsx");
      toast.success("Ledgers exported successfully!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to export some ledgers.");
    } finally {
      setIsExporting(false);
    }
  };

  /* columns — local pin/order/hide, same shape as PaymentsTimeline.jsx
     (no useColumnSettings persistence needed for a page with no real data
     source yet). */
  const [columnOrder, setColumnOrder] = useState(ALL_COLUMNS.map((c) => c.id));
  const [colWidths, setColWidths] = useState(DEFAULT_COL_WIDTHS);
  const [pinnedCols, setPinnedCols] = useState({});
  const [hiddenCols, setHiddenCols] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: null });

  /* column header menu */
  const [openColumnMenuKey, setOpenColumnMenuKey] = useState(null);
  const [columnMenuPos, setColumnMenuPos] = useState(null);

  /* drag-reorder */
  const [draggedColKey, setDraggedColKey] = useState(null);
  const [dragOverColKey, setDragOverColKey] = useState(null);
  const [dragGhost, setDragGhost] = useState(null);
  useLayoutEffect(() => {
    const measure = () => {
      const nav = journalTabNavRef.current;
      const btn = journalTabRefs.current[activeTab];
      if (!nav || !btn) return;
      setJournalTabThumb({
        left: btn.offsetLeft - nav.scrollLeft,
        width: btn.offsetWidth,
        ready: true,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    const nav = journalTabNavRef.current;
    nav?.addEventListener("scroll", measure);
    return () => {
      window.removeEventListener("resize", measure);
      nav?.removeEventListener("scroll", measure);
    };
    // journals.length: the Active tab's "57" count badge only exists once
    // journals have loaded — it's absent at first paint (empty array), so
    // the thumb was measured without it and never resized once it appeared,
    // leaving the white pill too narrow for the badge that showed up after.
  }, [activeTab, journals.length]);

  const dragOverRef = useRef(null);
  const ghostElRef = useRef(null);

  /* row action menu */
  const [openActionMenuId, setOpenActionMenuId] = useState(null);
  const [actionMenuPos, setActionMenuPos] = useState(null);

  /* ── ordered columns (pinned left → unpinned → pinned right) ─────── */
  const orderedColumns = useMemo(
    () =>
      columnOrder
        .map((id) => ALL_COLUMNS.find((c) => c.id === id))
        .filter((c) => c && !hiddenCols.includes(c.id))
        .sort((a, b) => {
          const rank = (c) => (pinnedCols[c.id] === "left" ? 0 : pinnedCols[c.id] === "right" ? 2 : 1);
          return rank(a) - rank(b);
        }),
    [columnOrder, pinnedCols, hiddenCols]
  );

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
    ({ colId }) => (
      <div
        data-resize-handle="true"
        onMouseDown={(e) => startColumnResize(e, colId)}
        onClick={(e) => e.stopPropagation()}
        title="Drag to resize column"
        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none z-30 hover:bg-[#0085FF]/40 active:bg-[#0085FF]"
      />
    ),
    [startColumnResize]
  );

  /* ── column drag-reorder ─────────────────────────────────────────── */
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
      const previewRows = journals.map((j) => cellTextFor(colId, j));
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

  /* ── filtered + sorted list ───────────────────────────────────────── */
  const filteredJournals = useMemo(() => {
    let list = journals.filter((j) => {
      if (activeTab === "cancelled") return j.status === "cancelled";
      if (activeTab === "settled") return j.status === "settled";
      return j.status === "active";
    });
    const q = searchTerm.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (j) =>
          (j.name || "").toLowerCase().includes(q) ||
          (j.category || "").toLowerCase().includes(q) ||
          (j.description || "").toLowerCase().includes(q)
      );
    }
    if (sortConfig.key) {
      // Date columns sort on the instant, not on the rendered/raw string —
      // and "lastUpdated" is a display id, the field behind it is updatedAt.
      const DATE_FIELD = { date: "date", lastUpdated: "updatedAt" };
      const dateField = DATE_FIELD[sortConfig.key];
      list = [...list].sort((a, b) => {
        let va = dateField ? new Date(a[dateField] || 0).getTime() : a[sortConfig.key];
        let vb = dateField ? new Date(b[dateField] || 0).getTime() : b[sortConfig.key];
        if (typeof va === "string") va = va.toLowerCase();
        if (typeof vb === "string") vb = vb.toLowerCase();
        if (va < vb) return sortConfig.direction === "asc" ? -1 : 1;
        if (va > vb) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return list;
  }, [journals, activeTab, searchTerm, sortConfig]);

  // Reset to page 1 whenever the visible set changes shape (tab/search/sort) —
  // otherwise a narrowed result set can strand the user on a now-empty page.
  useEffect(() => {
    setJournalsPagination((p) => ({ ...p, currentPage: 1 }));
    setSelectedJournals([]);
  }, [activeTab, searchTerm, sortConfig]);

  const journalsTotalCount = filteredJournals.length;
  const journalsTotalPages = Math.max(1, Math.ceil(journalsTotalCount / journalsPagination.limit));
  const paginatedJournals = useMemo(() => {
    const start = (journalsPagination.currentPage - 1) * journalsPagination.limit;
    return filteredJournals.slice(start, start + journalsPagination.limit);
  }, [filteredJournals, journalsPagination]);

  const handleJournalsPageChange = (page) => {
    if (page >= 1 && page <= journalsTotalPages && page !== journalsPagination.currentPage) {
      setJournalsPagination((p) => ({ ...p, currentPage: page }));
    }
  };
  const handleJournalsLimitChange = (limit) => {
    setJournalsPagination({ currentPage: 1, limit });
  };

  const handleDeleteJournal = (j) => {
    setDeleteConfirm({ open: true, type: "single", target: j });
  };

  const executeSingleDelete = async (j) => {
    setIsDeleting(true);
    try {
      await API.delete(`/journals/${j._id}`);
      setJournals((prev) => prev.filter((row) => row._id !== j._id));
      setSelectedJournals((prev) => prev.filter((id) => id !== j._id));
      toast.success("Journal deleted");
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to delete journal");
    } finally {
      setIsDeleting(false);
      setDeleteConfirm({ open: false, type: null, target: null });
    }
  };

  const handleCloseJournal = (j) => {
    setCloseConfirm({ open: true, journal: j });
  };

  const executeCloseJournal = async () => {
    const j = closeConfirm.journal;
    if (!j) return;
    try {
      await API.post(`/journals/${j._id}/close`);
      toast.success("Journal closed successfully");
      setCloseConfirm({ open: false, journal: null });
      fetchJournals();
      setActiveTab("settled");
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to close journal");
    }
  };

  const handleReopenJournal = async (j) => {
    try {
      await API.post(`/journals/${j._id}/reopen`);
      toast.success("Journal reopened successfully");
      fetchJournals();
      setActiveTab("active");
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to reopen journal");
    }
  };

  const handleCancelJournal = (j) => {
    setCancelConfirm({ open: true, journal: j });
  };

  const executeCancelJournal = async () => {
    const j = cancelConfirm.journal;
    if (!j) return;
    try {
      await API.post(`/journals/${j._id}/cancel`);
      toast.success("Journal cancelled successfully");
      setCancelConfirm({ open: false, journal: null });
      fetchJournals();
      setActiveTab("cancelled");
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to cancel journal");
    }
  };

  /* ── row action menu ─────────────────────────────────────────────── */
  const renderActionMenu = (j) => {
    const isOpen = openActionMenuId === j._id;
    const closeMenu = () => { setOpenActionMenuId(null); setActionMenuPos(null); };
    const openPay = (payType) => { closeMenu(); setPayModal({ open: true, journal: j, type: payType }); };
    return (
      <div className="relative flex-shrink-0 flex items-center">
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (isOpen) { closeMenu(); return; }
            const zMenu = getAncestorZoom(document.body);
            const MENU_W = 176;
            const MENU_H = j.status === "cancelled" ? 210 : 250;
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
            setOpenActionMenuId(j._id);
          }}
          className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <MoreIcon className="w-4 h-4" />
        </button>
        {isOpen && actionMenuPos && createPortal(
          <>
            <div className="fixed inset-0 z-[59]" onClick={closeMenu} />
            <div
              className="fixed w-44 bg-white rounded-xl shadow-lg border border-[#E1E4EA] py-1 z-[60] overflow-hidden"
              style={{ top: actionMenuPos.top, left: actionMenuPos.left }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => { closeMenu(); setEditingJournal(j); setShowQuickAdd(true); }}
              >
                <EditIcon className="w-4 h-4 text-blue-600" /> Edit
              </button>
              <button className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => openPay("payin")}>
                <ArrowDownCircle className="w-4 h-4 text-green-600" /> You Received
              </button>
              <button className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => openPay("payout")}>
                <ArrowUpCircle className="w-4 h-4 text-red-600" /> You Gave
              </button>
              <button
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => { closeMenu(); setLedgerJournalId(j._id); }}
              >
                <EyeIcon className="w-4 h-4 text-gray-400" /> Ledger
              </button>
              <div className="h-px bg-gray-100 my-1" />
              {j.status === "active" && (
                <>
                  <button
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={() => { closeMenu(); handleCloseJournal(j); }}
                  >
                    <Lock className="w-4 h-4 text-orange-500" /> Close Journal
                  </button>
                  <button
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={() => { closeMenu(); handleCancelJournal(j); }}
                  >
                    <EyeOff className="w-4 h-4 text-gray-400" /> Cancel Journal
                  </button>
                </>
              )}
              {(j.status === "cancelled" || j.status === "settled") && (
                <button
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => { closeMenu(); handleReopenJournal(j); }}
                >
                  <Unlock className="w-4 h-4 text-green-500" /> Reopen Journal
                </button>
              )}
              <button
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                onClick={() => { closeMenu(); handleDeleteJournal(j); }}
              >
                <DeleteIcon className="w-4 h-4" /> Delete
              </button>
            </div>
          </>,
          document.body
        )}
      </div>
    );
  };

  /* ── cell renderer ───────────────────────────────────────────────── */
  const renderCell = (colId, j, isRightmost) => {
    let content;
    switch (colId) {
      case "balance": {
        const isClosed = j.status === "settled" || j.status === "cancelled";
        const displayBalance = isClosed && j.closingBalance != null ? j.closingBalance : j.currentBalance;
        const balValue = Number(displayBalance) || 0;
        let colorClass = balValue < 0 ? "text-red-600" : "text-gray-900";
        if (isClosed && balValue > 0) {
          colorClass = "text-green-600";
        }
        
        content = (
          <span className={`text-sm font-bold ${colorClass}`}>
            {money(displayBalance)}
          </span>
        );
        break;
      }
      case "name":
        content = (
          <button 
            type="button" 
            onClick={() => setLedgerJournalId(j._id)}
            className="text-sm font-semibold text-[#0085FF] hover:underline hover:text-[#004CFF] text-left truncate transition-all duration-150 ease-out cursor-pointer"
          >
            <HighlightText text={j.name} query={searchTerm} />
          </button>
        );
        break;
      case "category":
        content = j.category ? (
          <span className="text-sm text-gray-700 truncate">
            <HighlightText text={j.category} query={searchTerm} />
          </span>
        ) : (
          <span className="text-sm text-gray-400">—</span>
        );
        break;
      case "date":
        content = <span className="text-sm text-gray-600">{formatDate(j.date)}</span>;
        break;
      case "lastUpdated":
        content = <span className="text-sm text-gray-600">{formatDate(j.updatedAt)}</span>;
        break;
      case "description":
        content = j.description ? (
          <span className="text-sm text-gray-700 truncate block">
            <HighlightText text={j.description} query={searchTerm} />
          </span>
        ) : (
          <span className="text-sm text-gray-400">—</span>
        );
        break;
      default:
        content = <span className="text-sm text-gray-700">—</span>;
    }
    return (
      <div className="flex items-center justify-between gap-2 w-full min-w-0">
        <div className="flex-1 min-w-0">{content}</div>
        {/* Ledger lives solely in the ⋮ menu — the inline pill duplicated it on every
            row and crowded the last column. */}
        {isRightmost && renderActionMenu(j)}
      </div>
    );
  };

  return (
    <div
      style={{
        marginTop: -24,
        marginLeft: -32,
        marginRight: -32,
        paddingLeft: 24,
        paddingRight: 24,
        boxSizing: "border-box",
      }}
    >
      {/* ── Fixed header bar (same shape as Inventory.jsx/PaymentsTimeline.jsx) ── */}
      <div
        className="fixed right-0 h-16 px-4 sm:px-6 lg:px-8 border-b border-[#E1E4EA] bg-white flex items-center justify-between gap-4 top-[calc(54px+var(--dc-offline-offset,0px))] lg:top-[calc(64px+var(--dc-offline-offset,0px))]"
        style={{ left: "var(--sidebar-width, 0px)", zIndex: 40, minHeight: 64, maxHeight: 64, boxSizing: "border-box" }}
      >
        <div className="flex flex-col justify-center gap-1 min-w-0 flex-shrink-0">
          <div className="flex items-center gap-2">
            <h1 className="m-0 leading-tight font-bold text-base sm:text-lg text-gray-900 truncate">Journals</h1>
            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] sm:text-xs font-semibold flex-shrink-0">
              {filteredJournals.length}
            </span>
          </div>
          <p className="m-0 leading-tight text-[10px] sm:text-xs text-gray-500 truncate">Track accounting journal entries</p>
        </div>

        <div className="relative flex-1 min-w-0 flex items-center justify-end gap-2">
          <div
            className={`relative h-10 flex items-center border border-[#E1E4EA] rounded-full bg-white transition-all duration-300 ease-in-out hover:bg-gray-50 focus-within:border-[#0085FF] focus-within:hover:bg-white ${
              isSearchExpanded ? "w-full lg:w-[380px]" : "w-10"
            } max-w-full`}
          >
            <SearchIcon
              className="absolute left-3 cursor-pointer z-10 flex-shrink-0 top-1/2 -translate-y-1/2 w-4 h-4 text-[#525866]"
              onClick={() => { setIsSearchExpanded(true); searchInputRef.current?.focus(); }}
            />
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={() => setIsSearchExpanded(true)}
              onBlur={() => { if (!searchTerm) setIsSearchExpanded(false); }}
              className={`w-full h-full pl-9 pr-9 bg-transparent text-sm focus:outline-none transition-opacity duration-200 cursor-pointer ${
                isSearchExpanded ? "opacity-100 focus:cursor-text" : "opacity-0"
              }`}
              placeholder="Search journals..."
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

        <button
          onClick={() => setShowQuickAdd(true)}
          className="inline-flex items-center justify-center gap-2 h-10 w-10 lg:w-auto px-0 lg:px-4 bg-[#0085FF] text-white text-sm font-medium rounded-full hover:bg-blue-600 focus:outline-none cursor-pointer transition-colors flex-shrink-0"
          title="New Journal"
        >
          <PlusIcon className="w-4 h-4 flex-shrink-0" />
          <span className="hidden lg:inline">New Journal</span>
        </button>
      </div>

      {/* ── Active/Cancelled tabs ─────────────────────────────────────── */}
      <div
        className="fixed right-0 h-[68px] px-4 sm:px-6 lg:px-8 border-b border-[#E1E4EA] bg-white flex items-center top-[calc(118px+var(--dc-offline-offset,0px))] lg:top-[calc(128px+var(--dc-offline-offset,0px))]"
        style={{ left: "var(--sidebar-width, 0px)", zIndex: 39 }}
      >
        <nav
          ref={journalTabNavRef}
          className="relative inline-flex items-center gap-1 h-10 p-1 bg-[#F1F1F5] rounded-full flex-shrink-0 w-max"
        >
          <span
            aria-hidden="true"
            className="absolute top-1 h-8 rounded-full bg-white shadow-sm transition-all duration-300 ease-out pointer-events-none"
            style={{
              left: journalTabThumb.left,
              width: journalTabThumb.width,
              opacity: journalTabThumb.ready ? 1 : 0,
            }}
          />
          {[
            { key: "active", label: "Active Journals", count: journals.filter((j) => j.status === "active").length },
            { key: "settled", label: "Closed", count: journals.filter((j) => j.status === "settled").length },
            { key: "cancelled", label: "Cancelled", count: journals.filter((j) => j.status === "cancelled").length },
          ].map((tab) => (
            <button
              key={tab.key}
              ref={(el) => {
                journalTabRefs.current[tab.key] = el;
              }}
              onClick={() => setActiveTab(tab.key)}
              className="relative z-[1] flex items-center justify-center gap-1.5 h-8 px-4 rounded-full text-sm font-medium whitespace-nowrap transition-colors text-gray-700 hover:text-gray-900"
              style={activeTab === tab.key ? { color: "var(--btn-primary)" } : undefined}
            >
              {tab.label}
              {tab.key === "active" && tab.count > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-semibold">{tab.count}</span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {showQuickAdd && (
        <QuickJournalForm
          editJournal={editingJournal}
          onRequestClose={() => { setShowQuickAdd(false); setEditingJournal(null); }}
          onJournalCreated={(journal) => setJournals((prev) => [journal, ...prev])}
          onJournalUpdated={(journal) =>
            setJournals((prev) => prev.map((row) => (row._id === journal._id ? journal : row)))
          }
        />
      )}

      <JournalLedgerDrawer
        isOpen={!!ledgerJournalId}
        journalId={ledgerJournalId}
        refreshKey={ledgerRefreshKey}
        onClose={() => setLedgerJournalId(null)}
        onOpenPayIn={(journal) => setPayModal({ open: true, journal, type: "payin" })}
        onOpenPayOut={(journal) => setPayModal({ open: true, journal, type: "payout" })}
        onJournalClosed={() => {
          setLedgerJournalId(null);
          fetchJournals();
          setActiveTab("settled");
        }}
        onJournalReopened={() => {
          setLedgerJournalId(null);
          fetchJournals();
          setActiveTab("active");
        }}
      />

      {closeConfirm.open && closeConfirm.journal && (
        <ConfirmDialog
          isOpen={true}
          title="Close Journal"
          message={
            closeConfirm.journal.currentBalance !== 0
              ? `Are you sure you want to close this journal? This will create a final settlement entry of ₹${Math.abs(closeConfirm.journal.currentBalance).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${closeConfirm.journal.currentBalance > 0 ? "You Receive" : "You Give"}) and move the journal to the Closed section.`
              : "Are you sure you want to close this journal? The balance is ₹0.00. This will move the journal to the Closed section."
          }
          confirmLabel="Close Journal"
          cancelLabel="Cancel"
          onConfirm={executeCloseJournal}
          onCancel={() => setCloseConfirm({ open: false, journal: null })}
        />
      )}

      {cancelConfirm.open && cancelConfirm.journal && (
        <ConfirmDialog
          isOpen={true}
          title="Cancel Journal"
          message="Are you sure you want to cancel this journal? It will be moved to the Cancelled section without creating any settlement entries."
          confirmLabel="Cancel Journal"
          cancelLabel="Close"
          onConfirm={executeCancelJournal}
          onCancel={() => setCancelConfirm({ open: false, journal: null })}
        />
      )}

      <PayInOutModal
        isOpen={payModal.open}
        journal={payModal.journal}
        type={payModal.type}
        onClose={() => setPayModal((p) => ({ ...p, open: false }))}
        onSuccess={(updatedJournal) => {
          // Keep the list row's balance in sync without a full refetch, and
          // let the Ledger drawer (if this same journal's ledger is open)
          // know a new entry landed so it re-pulls its rows.
          setJournals((prev) => prev.map((row) => (row._id === updatedJournal._id ? updatedJournal : row)));
          if (ledgerJournalId === updatedJournal._id) {
            setLedgerRefreshKey((k) => k + 1);
          }
        }}
      />

      <BulkJournalUpdateModal
        isOpen={isBulkUpdateModalOpen}
        onClose={() => setIsBulkUpdateModalOpen(false)}
        selectedCount={selectedJournals.length}
        onConfirm={handleBulkUpdate}
      />

      <ConfirmDialog
        isOpen={deleteConfirm.open}
        title={deleteConfirm.type === "bulk" ? "Delete Journals" : "Delete Journal"}
        message={
          deleteConfirm.type === "bulk"
            ? `Are you sure you want to delete ${selectedJournals.length} selected journal(s)? This action cannot be undone.`
            : `Are you sure you want to delete the journal "${deleteConfirm.target?.name}"? This action cannot be undone.`
        }
        confirmLabel={isDeleting ? "Deleting..." : "Delete"}
        onCancel={() => setDeleteConfirm({ open: false, type: null, target: null })}
        onConfirm={deleteConfirm.type === "bulk" ? executeBulkDelete : () => executeSingleDelete(deleteConfirm.target)}
      />

      {/* ── Bulk selection strip ─────────────────────────────────────── */}
      {showBulkStrip && (
        <div
          className="fixed right-0 h-16 px-4 sm:px-6 lg:px-8 border-b border-[#E1E4EA] bg-white flex items-center top-[calc(54px+var(--dc-offline-offset,0px))] lg:top-[calc(64px+var(--dc-offline-offset,0px))]"
          style={{ left: "var(--sidebar-width, 0px)", zIndex: 41 }}
        >
          <div
            className={`${bulkStripClosing ? "animate-slideOutRight" : "animate-slideInLeft"} flex flex-nowrap items-center justify-between gap-4 w-full h-full overflow-x-auto`}
          >
            {/* Left: bulk action buttons */}
            <div className="flex flex-nowrap items-center flex-shrink-0">
              <button
                onClick={handleBulkExportExcel}
                disabled={isExporting}
                className="h-10 px-4 bg-white border border-gray-300 text-gray-900 text-sm font-medium rounded-l-[25px] hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap disabled:opacity-50"
              >
                {isExporting ? <Loader2 className="w-4 h-4 animate-spin text-green-600" /> : <DownloadIcon className="w-4 h-4 text-green-600" />}
                Export All (Excel)
              </button>
              <button
                onClick={handleBulkExportNames}
                className="h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
              >
                <PdfIcon className="w-4 h-4 text-purple-600" />
                Export Names
              </button>
              <button
                onClick={() => setIsBulkUpdateModalOpen(true)}
                className="h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
              >
                <EditIcon className="w-4 h-4 text-blue-600" />
                Bulk Update
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={isDeleting}
                className="h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap disabled:opacity-50"
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin text-red-600" /> : <DeleteIcon className="w-4 h-4 text-red-600" />}
                Delete
              </button>
              {activeTab === "active" && (
                <button
                  onClick={handleBulkClose}
                  disabled={isClosingBulk}
                  className="h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap disabled:opacity-50"
                >
                  {isClosingBulk ? <Loader2 className="w-4 h-4 animate-spin text-orange-600" /> : <Lock className="w-4 h-4 text-orange-600" />}
                  Close All
                </button>
              )}
              {(activeTab === "cancelled" || activeTab === "settled") && (
                <button
                  onClick={handleBulkReopen}
                  disabled={isReopeningBulk}
                  className="h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap disabled:opacity-50"
                >
                  {isReopeningBulk ? <Loader2 className="w-4 h-4 animate-spin text-green-600" /> : <Unlock className="w-4 h-4 text-green-600" />}
                  Reopen All
                </button>
              )}
              <button
                onClick={() => setSelectedJournals([])}
                className="h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium rounded-r-[25px] hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </div>
            {/* Right: selection count + select/deselect all */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <CheckSquare className="w-5 h-5 text-blue-600 flex-shrink-0" />
              <span className="text-blue-800 font-semibold font-inter whitespace-nowrap">
                {selectedJournals.length} selected
              </span>
              <button
                onClick={() => setSelectedJournals(filteredJournals.map((j) => j._id))}
                className="h-10 px-4 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-[25px] hover:bg-gray-50 focus:outline-none transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
              >
                <CheckSquare className="w-4 h-4" />
                Select All
              </button>
              <button
                onClick={() => setSelectedJournals([])}
                className="h-10 px-4 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-[25px] hover:bg-gray-50 focus:outline-none transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
              >
                <X className="w-4 h-4" />
                Deselect All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Full-bleed table, edge to edge ───────────────────────────── */}
      <div
        className="fixed right-0 overflow-x-auto overflow-y-auto bg-white top-[calc(186px+var(--dc-offline-offset,0px))] lg:top-[calc(196px+var(--dc-offline-offset,0px))]"
        style={{ left: "var(--sidebar-width, 0px)", bottom: 64 }}
      >
        <table className="min-w-full divide-y divide-gray-200 table-fixed">
          <thead className="bg-[#F5F7FA] sticky top-0 z-20">
            <tr>
              <th
                style={{
                  width: colWidths.selection,
                  position: "sticky",
                  left: 0,
                  zIndex: 20,
                  boxShadow: "inset -1px 0 0 0 #E1E4EA",
                }}
                className="relative px-4 py-3 bg-[#F5F7FA]"
              >
                <div className="flex justify-center items-center">
                  <Checkbox checked={paginatedJournals.length > 0 && selectedJournals.length === paginatedJournals.length} onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedJournals(paginatedJournals.map((j) => j._id));
                      } else {
                        setSelectedJournals([]);
                      }
                    }}  uncheckedColor="text-[#525866]"/>
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
                      opacity: isDragging ? 0.35 : 1,
                      boxShadow: "inset -1px 0 0 0 #E1E4EA",
                      ...stickyStyleFor(col.id),
                    }}
                    className={`relative px-4 py-3 text-left text-sm font-bold text-[#525866] whitespace-nowrap transition-colors ${
                      isDragOver ? "bg-blue-100" : "bg-[#F5F7FA] hover:bg-gray-100"
                    } ${draggedColKey ? "cursor-grabbing" : "cursor-grab"} active:cursor-grabbing`}
                  >
                    <div className="flex items-center justify-between w-full group">
                      <span className="truncate flex-1 min-w-0 flex items-center gap-1.5">
                        <span className="truncate">{col.label}</span>
                        {sortConfig.key === col.id && (sortConfig.direction === "asc"
                          ? <ArrowUp className="w-3 h-3 text-[#0085FF] flex-shrink-0" />
                          : <ArrowDown className="w-3 h-3 text-[#0085FF] flex-shrink-0" />)}
                        {pinnedCols[col.id] && (
                          <Pin
                            size={12}
                            className="text-blue-500 fill-blue-500 flex-shrink-0"
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
                    <ResizeHandle colId={col.id} />
                    {boundaryShadowSide && <div style={getPinnedBoundaryOverlayStyle(boundaryShadowSide)} />}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="bg-white">
            {loading ? (
              <TableSkeletonRows
                numRows={journalsPagination.limit}
                columns={orderedColumns.map((c) => colWidths[c.id])}
                hasCheckbox
                checkboxWidth={colWidths.selection}
              />
            ) : filteredJournals.length === 0 ? (
              <tr>
                <td colSpan={orderedColumns.length + 1}>
                  <EmptyState
                    icon={BookOpen}
                    noun="Journal"
                    isFiltered={!!searchTerm}
                    filteredTitle="No journals match your search."
                    onCreate={() => setShowQuickAdd(true)}
                  />
                </td>
              </tr>
            ) : (
              paginatedJournals.map((j) => (
                <tr key={j._id} className="bg-white hover:bg-blue-50 transition-colors" style={{ height: 37, maxHeight: 37 }}>
                  <td
                    style={{
                      width: colWidths.selection,
                      position: "sticky",
                      left: 0,
                      zIndex: 10,
                      boxShadow: "inset -1px 0 0 0 #E1E4EA, inset 0 -1px 0 0 #E1E4EA",
                    }}
                    className="px-4 py-2 align-middle bg-inherit overflow-hidden"
                  >
                    <div className="flex justify-center items-center">
                      <Checkbox checked={selectedJournals.includes(j._id)} onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedJournals((prev) => [...prev, j._id]);
                          } else {
                            setSelectedJournals((prev) => prev.filter((id) => id !== j._id));
                          }
                        }} id="true" />
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
                        className={`px-4 py-2 text-sm text-gray-900 bg-inherit whitespace-nowrap ${
                          cellBoundaryShadowSide ? "" : "overflow-hidden"
                        }`}
                      >
                        {renderCell(col.id, j, isRightmost)}
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

      {/* ── Pagination bar — edge-to-edge, same shape as PaymentsTimeline.jsx ── */}
      <div
        className="fixed bottom-0 right-0 h-16 bg-white border-t border-[#E1E4EA] flex items-center justify-between px-6 z-40"
        style={{ left: "var(--sidebar-width, 0px)" }}
      >
        <div className="flex items-center gap-3">
          <p className="text-sm text-gray-700">
            Showing{" "}
            <span className="font-semibold">
              {journalsTotalCount === 0 ? 0 : (journalsPagination.currentPage - 1) * journalsPagination.limit + 1}
            </span>{" "}to{" "}
            <span className="font-semibold">
              {Math.min(journalsPagination.currentPage * journalsPagination.limit, journalsTotalCount)}
            </span>{" "}of{" "}
            <span className="font-semibold">{journalsTotalCount}</span> journals
          </p>
          <select
            value={journalsPagination.limit}
            onChange={(e) => handleJournalsLimitChange(parseInt(e.target.value))}
            className="border border-gray-300 rounded-md text-sm py-1 pl-2 pr-6 focus:outline-none focus:border-[#0085FF] focus:ring-1 focus:ring-[#0085FF]"
          >
            {[10, 20, 50, 100].map((val) => (
              <option key={val} value={val}>{val} per page</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleJournalsPageChange(journalsPagination.currentPage - 1)}
            disabled={journalsPagination.currentPage <= 1}
            className="flex items-center justify-center w-8 h-8 rounded-full border border-[#E1E4EA] bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {(() => {
            const commitPage = () => {
              const val = parseInt(journalsPageInput, 10);
              if (!isNaN(val) && val >= 1 && val <= journalsTotalPages) {
                handleJournalsPageChange(val);
              }
              setEditingJournalsPage(false);
            };
            const { currentPage } = journalsPagination;
            const items = [];
            if (journalsTotalPages <= 1) {
              items.push(1);
            } else {
              items.push(1);
              if (currentPage > 2) items.push("left-dots");
              if (currentPage !== 1 && currentPage !== journalsTotalPages) items.push(currentPage);
              if (currentPage < journalsTotalPages - 1) items.push("right-dots");
              items.push(journalsTotalPages);
            }
            return items.map((item, index) => {
              if (item === "left-dots" || item === "right-dots") {
                return (
                  <span key={`${item}-${index}`} className="flex items-center justify-center w-8 h-8 text-sm font-medium text-gray-400 select-none">
                    ....
                  </span>
                );
              }
              const isCurrent = item === currentPage;
              if (isCurrent && editingJournalsPage) {
                return (
                  <input
                    key="page-edit"
                    autoFocus
                    type="number"
                    min={1}
                    max={journalsTotalPages}
                    value={journalsPageInput}
                    onChange={(e) => setJournalsPageInput(e.target.value)}
                    onBlur={commitPage}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitPage();
                      if (e.key === "Escape") setEditingJournalsPage(false);
                    }}
                    className="w-10 h-8 rounded-full border border-blue-500 text-center text-sm font-medium text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                );
              }
              return (
                <button
                  key={`page-${item}`}
                  onClick={() => handleJournalsPageChange(item)}
                  onDoubleClick={() => {
                    if (isCurrent) {
                      setJournalsPageInput(String(currentPage));
                      setEditingJournalsPage(true);
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
            onClick={() => handleJournalsPageChange(journalsPagination.currentPage + 1)}
            disabled={journalsPagination.currentPage >= journalsTotalPages}
            className="flex items-center justify-center w-8 h-8 rounded-full border border-[#E1E4EA] bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Column header menu ───────────────────────────────────────── */}
      {openColumnMenuKey && columnMenuPos && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={closeColumnMenu} />
          <div
            className="fixed w-[160px] z-[9999] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5 animate-in fade-in zoom-in duration-150 origin-top-right"
            style={{ top: columnMenuPos.top, left: columnMenuPos.left }}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const col = ALL_COLUMNS.find((c) => c.id === openColumnMenuKey);
              if (!col) return null;
              const itemClass = "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap";
              const pinSide = pinnedCols[col.id];
              return (
                <>
                  <button
                    onClick={() => { closeColumnMenu(); setColumnPin(col.id, "left"); }}
                    className={`${itemClass} ${pinSide === "left" ? "bg-blue-50 text-blue-700" : "text-[#161618] hover:bg-gray-50"}`}
                  >
                    {pinSide === "left" ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5 text-[#1C1B1F]" />}
                    Pin to Left
                  </button>
                  <button
                    onClick={() => { closeColumnMenu(); setColumnPin(col.id, "right"); }}
                    className={`${itemClass} ${pinSide === "right" ? "bg-blue-50 text-blue-700" : "text-[#161618] hover:bg-gray-50"}`}
                  >
                    {pinSide === "right" ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5 text-[#1C1B1F]" />}
                    Pin to Right
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
                    <ChevronUp className="w-3.5 h-3.5 text-[#1C1B1F]" />
                    Sort Ascending
                  </button>
                  <button
                    onClick={() => {
                      closeColumnMenu();
                      const isActive = sortConfig.key === col.id && sortConfig.direction === "desc";
                      setSortConfig(isActive ? { key: null, direction: null } : { key: col.id, direction: "desc" });
                    }}
                    className={`${itemClass} ${sortConfig.key === col.id && sortConfig.direction === "desc" ? "bg-blue-50 text-blue-700 font-medium" : "text-[#161618] hover:bg-gray-50"}`}
                  >
                    <ChevronDown className="w-3.5 h-3.5 text-[#1C1B1F]" />
                    Sort Descending
                  </button>

                  <div className="w-full border-t border-[#F1F1F5] my-0.5" />

                  <button
                    onClick={() => { closeColumnMenu(); setHiddenCols((prev) => [...prev, col.id]); }}
                    className={`${itemClass} text-[#161618] hover:bg-gray-50`}
                  >
                    <EyeOff className="w-3.5 h-3.5 text-[#1C1B1F]" />
                    Hide Column
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
    </div>
  );
}
