import DeleteIcon from "../components/common/DeleteIcon";
import EmptyState from "../components/common/EmptyState";
import PdfIcon from "../components/common/PdfIcon";
import VideoIcon from "../components/common/VideoIcon";
import Checkbox from "../components/common/Checkbox";
import PlusIcon from "../components/common/PlusIcon";
import MoreIcon from "../components/common/MoreIcon";
import DownloadIcon from "../components/common/DownloadIcon";
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  X, ChevronDown, ChevronUp, EyeOff,
  SlidersHorizontal, Share2,
  ChevronLeft, ChevronRight, Pin, PinOff,
  TrendingUp, TrendingDown, Wallet, ListChecks,
  ArrowLeftRight, ArrowUp, ArrowDown } from "lucide-react";
import SearchIcon from "../components/common/SearchIcon";
import SettingsIcon from "../components/common/SettingsIcon";
import FilterIcon from "../components/common/FilterIcon";
import AdvancedFilterPanel from "../components/common/AdvancedFilterPanel";
import BankLogo from "../components/BankLogo";
import API from "../services/api";
import toast from "react-hot-toast";
import TableSkeletonRows from "../components/common/TableSkeletonRows";
import PaymentFormModal from "../components/payments/PaymentFormModal";
import ApplyCreditModal from "../components/payments/ApplyCreditModal";
import { useTopLoadingSignal } from "../components/common/TopLoadingBar";
import { getAncestorZoom } from "../utils/domUtils";
import BulkActionBar from "../components/common/BulkActionBar";
import { useBulkStrip } from "../hooks/useBulkSelection";
import * as XLSX from "xlsx";
import { useColumnSettings } from "../hooks/useColumnSettings";
import ColumnSettingsPanel from "../components/ColumnSettingsPanel";
import VideoTutorialModal from "../components/VideoTutorialModal";
import { getVideoTutorial } from "../utils/videoTutorials";
import BulkActions from "../components/BulkActions";
import ImportPayments from "../components/payments/ImportPayments";
import { getPinnedBoundaryOverlayStyle } from "../utils/pinnedColumnShadow";
import PageSkeleton from "../components/common/PageSkeleton";
import PaymentReceiptModal from "../components/vendor/PaymentReceiptModal";
import { jsPDF } from "jspdf";
import "jspdf-autotable";
import StatTile from "../components/common/StatTile";
import UploadIcon from "../components/common/UploadIcon";
import EyeIcon from "../components/common/EyeIcon";
import EditIcon from "../components/common/EditIcon";

/* ─── Column definitions ───────────────────────────────────────────── */
const DEFAULT_COL_WIDTHS = {
  selection: 60,
  "payment-id": 200,
  party: 220,
  amount: 140,
  direction: 120,
  type: 140,
  date: 180,
};
const MIN_COL_WIDTH = 60;
// Matches Deals.jsx's KPI band desktop height (h-[104px]) so the two pages'
// header/stats layout lines up the same way.
const KPI_BAND_HEIGHT = 104;
// Bottom edge of the fixed toolbar. The KPI band and table both hang off this
// so they sit flush; hardcoding it left a 2px overlap and a 4px gap.
const HEADER_HEIGHT = 144;
const TOOLBAR_BOTTOM = 64 + HEADER_HEIGHT;
// The bulk-action strip gets its own band so it doesn't hide the account
// cards — those balances are context you want while acting on rows.
const BULK_STRIP_HEIGHT = 64;

const ALL_COLUMNS = [
  { id: "payment-id", key: "payment-id", label: "Transaction ID" },
  { id: "party",      key: "party",      label: "Party / Entity"  },
  { id: "amount",     key: "amount",     label: "Amount"           },
  { id: "direction",  key: "direction",  label: "Direction"        },
  { id: "type",       key: "type",       label: "Type"             },
  { id: "date",       key: "date",       label: "Date"             },
];

/* ─── Shared resize handle (same as Accounting.jsx pattern) ─────────── */
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

/* helper: plain-text preview for ghost */
const cellTextFor = (colId, doc) => {
  switch (colId) {
    case "payment-id": return doc["payment-id"] || "";
    case "party":      return doc.party || "";
    case "amount":     return doc.amount != null ? `₹${Number(doc.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "";
    case "direction":  return doc.direction === "IN" ? "Credit" : "Debit";
    case "type":       return doc.type || "";
    case "date":       return doc.date ? new Date(doc.date).toLocaleString() : "";
    default:           return "";
  }
};

/* ─── Component ─────────────────────────────────────────────────────── */
export default function PaymentsTimeline() {
  const [documents, setDocuments] = useState([]);
  const [accountsSummary, setAccountsSummary] = useState([]);
  // Unapplied credit — money received (or advanced) that hasn't been settled
  // against an invoice/bill yet. Without this it's stored but invisible, and
  // the whole point of keeping the remainder is that it can be found again.
  const [creditBalances, setCreditBalances] = useState([]);
  const [creditTotal, setCreditTotal] = useState(0);
  const [showCreditPanel, setShowCreditPanel] = useState(false);
  // The party whose credit is being applied — set from the Unapplied panel,
  // drives the Apply Credit drawer.
  const [creditParty, setCreditParty] = useState(null);
  // The cards strip scrolls horizontally, so a panel inside it gets clipped.
  // Portalled to body and positioned from the card's measured rect instead.
  const creditCardRef = useRef(null);
  const creditPanelRef = useRef(null);
  const [creditPanelStyle, setCreditPanelStyle] = useState({});

  const positionCreditPanel = useCallback(() => {
    if (!creditCardRef.current) return;
    // rect is in VISUAL px; the portal paints inside the app's dynamic <html>
    // zoom, so every rect-derived value has to be divided by it or the panel
    // drifts off-position.
    const zoom = getAncestorZoom(document.body);
    const rect = creditCardRef.current.getBoundingClientRect();
    const width = 320;
    const MARGIN = 8;
    const viewportWidth = window.innerWidth / zoom;
    let left = rect.left / zoom;
    left = Math.min(left, viewportWidth - width - MARGIN);
    left = Math.max(left, MARGIN);
    setCreditPanelStyle({
      position: "fixed",
      left: `${left}px`,
      top: `${rect.bottom / zoom + 6}px`,
      width: `${width}px`,
      maxHeight: `${Math.min(288, window.innerHeight / zoom - rect.bottom / zoom - 24)}px`,
      zIndex: 99999,
    });
  }, []);

  useEffect(() => {
    if (!showCreditPanel) return;
    positionCreditPanel();
    const onDocClick = (e) => {
      const inCard = creditCardRef.current && creditCardRef.current.contains(e.target);
      const inPanel = creditPanelRef.current && creditPanelRef.current.contains(e.target);
      if (!inCard && !inPanel) setShowCreditPanel(false);
    };
    window.addEventListener("resize", positionCreditPanel);
    window.addEventListener("scroll", positionCreditPanel, true);
    document.addEventListener("mousedown", onDocClick);
    return () => {
      window.removeEventListener("resize", positionCreditPanel);
      window.removeEventListener("scroll", positionCreditPanel, true);
      document.removeEventListener("mousedown", onDocClick);
    };
  }, [showCreditPanel, positionCreditPanel]);

  const walletSummary = useMemo(() => accountsSummary.find(a => a.type === "wallet"), [accountsSummary]);
  const cashSummary   = useMemo(() => accountsSummary.find(a => a.type === "cash"),   [accountsSummary]);
  const bankSummaries = useMemo(() => accountsSummary.filter(a => a.type === "bank"), [accountsSummary]);

  // Ported from the signatures branch: the account-cards row (Wallet/Cash/Bank), its
  // "include in total" filter, and the Self Transfer picker all key off this flat list.
  const transferAccounts = useMemo(() => {
    const list = [];
    if (walletSummary) {
      list.push({
        id: "wallet-card",
        type: "wallet",
        title: "Wallet",
        accountNumber: "Prepaid Credits",
        currentBalance: walletSummary.currentBalance
      });
    }
    if (cashSummary) {
      list.push({
        id: "cash-card",
        type: "cash",
        title: "Cash",
        accountNumber: "Physical Cash",
        currentBalance: cashSummary.currentBalance
      });
    }
    list.push(...bankSummaries);
    return list;
  }, [walletSummary, cashSummary, bankSummaries]);

  // ----- Funds filter state (which accounts to include in the Total Funds card) -----
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterDropdownPos, setFilterDropdownPos] = useState(null);
  const filterBtnRef = useRef(null);
  const cardsScrollRef = useRef(null);

  // Default select all accounts (wallet + cash + all banks)
  const defaultSelected = useMemo(() => {
    const ids = [];
    if (walletSummary?.id) ids.push(walletSummary.id);
    if (cashSummary?.id)   ids.push(cashSummary.id);
    ids.push(...bankSummaries.map(b => b.id));
    return ids;
  }, [walletSummary, cashSummary, bankSummaries]);
  const [selectedAccountIds, setSelectedAccountIds] = useState([]);

  // Ensure selectedAccountIds is populated after data loads
  useEffect(() => {
    if (defaultSelected.length && selectedAccountIds.length === 0) {
      setSelectedAccountIds(defaultSelected);
    }
  }, [defaultSelected, selectedAccountIds.length]);

  // Total for selected accounts only — what the Total Funds card shows
  const filteredTotal = useMemo(() => {
    let total = 0;
    if (selectedAccountIds.includes(walletSummary?.id)) {
      total += Number(walletSummary?.currentBalance ?? 0);
    }
    if (cashSummary && selectedAccountIds.includes(cashSummary.id)) {
      total += Number(cashSummary.currentBalance ?? 0);
    }
    bankSummaries.forEach(b => {
      if (selectedAccountIds.includes(b.id)) total += Number(b.currentBalance ?? 0);
    });
    return total;
  }, [selectedAccountIds, walletSummary, cashSummary, bankSummaries]);


  const [pagination, setPagination] = useState({
    currentPage: 1, limit: 10, totalCount: 0, totalPages: 0,
    hasNextPage: false, hasPrevPage: false
  });
  // Aggregate totals across every matching transaction (server-computed,
  // not just the current page's 10 rows) — see paymentStats below.
  const [serverSummary, setServerSummary] = useState(null);
  // Full records for every currently-selected id, populated by fetchAllIds
  // (Select All) — see paymentStats below for why this exists.
  const [allSelectableDocs, setAllSelectableDocs] = useState(null);
  const [showLoadingSkeleton, setShowLoadingSkeleton] = useState(true);
  useTopLoadingSignal(showLoadingSkeleton);
  // Full-page skeleton only on first load; later refetches skeleton just the
  // rows so navigating back doesn't re-flash the whole page.
  const hasLoadedOnceRef = useRef(false);

  /* search */
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const searchInputRef = useRef(null);

  /* columns — visibility + order persist via useColumnSettings (same hook
     Companies.jsx uses); pin side stays local/session-only, matching how
     Companies.jsx's own pinnedColumns state also isn't part of that hook. */
  const defaultColumns = useMemo(
    () => ALL_COLUMNS.map((c, i) => ({ key: c.id, label: c.label, visible: true, order: i, sortable: true, required: i === 0 })),
    []
  );
  const { columns, saveColumns, getVisibleColumns } = useColumnSettings("paymentsTimeline", defaultColumns);
  const [colWidths, setColWidths]     = useState(DEFAULT_COL_WIDTHS);
  const [pinnedCols, setPinnedCols]   = useState({});
  const [sortConfig, setSortConfig]   = useState({ key: "date", direction: "desc" });
  const [showColumnSettings, setShowColumnSettings] = useState(false);

  /* Column header menu */
  const [openColumnMenuKey, setOpenColumnMenuKey] = useState(null);
  const [columnMenuPos, setColumnMenuPos]         = useState(null);

  /* Filter states */
  const [companies, setCompanies]               = useState([]);
  const [partyFilter, setPartyFilter]           = useState("");
  const [directionFilter, setDirectionFilter]   = useState("");
  const [typeFilter, setTypeFilter]             = useState("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [activeFilters, setActiveFilters]       = useState([]);

  /* drag-reorder state (mirror of Accounting.jsx) */
  const [draggedColKey,  setDraggedColKey]  = useState(null);
  const [dragOverColKey, setDragOverColKey] = useState(null);
  const [dragGhost,      setDragGhost]      = useState(null);
  const dragOverRef = useRef(null);
  const ghostElRef  = useRef(null);

  /* row selection */
  const [selectedIds, setSelectedIds] = useState([]);
  const { visible: stripVisible, closing: stripClosing } = useBulkStrip(selectedIds.length);

  /* three-dot header menu + KPI/Import/Video Tutorial/Bulk Update */
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef(null);
  const [showStats, setShowStats] = useState(true);
  const [showVideoTutorial, setShowVideoTutorial] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showBulkActions, setShowBulkActions] = useState(false);

  /* misc UI */
  const [showFilterMenu,    setShowFilterMenu]    = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [editingPaymentItem, setEditingPaymentItem] = useState(null);

  /* Account Detail (ledger) modal — ported from the signatures branch */
  const [selectedAccountDetail, setSelectedAccountDetail] = useState(null);
  const [showBalance, setShowBalance] = useState(false);
  const [accountTransactions, setAccountTransactions] = useState([]);
  const [loadingAccountTransactions, setLoadingAccountTransactions] = useState(false);
  const [modalStartDate, setModalStartDate] = useState("");
  const [modalEndDate, setModalEndDate] = useState("");
  const [showModalOptions, setShowModalOptions] = useState(false);

  /* Self Transfer modal — ported from the signatures branch */
  const [showSelfTransferModal, setShowSelfTransferModal] = useState(false);
  const [selfTransferFromBankId, setSelfTransferFromBankId] = useState("");
  const [selfTransferToBankId, setSelfTransferToBankId] = useState("");
  const [selfTransferAmount, setSelfTransferAmount] = useState("");
  const [selfTransferDate, setSelfTransferDate] = useState(new Date().toISOString().slice(0, 10));
  const [selfTransferNotes, setSelfTransferNotes] = useState("");
  const [loadingSelfTransfer, setLoadingSelfTransfer] = useState(false);
  const [fromDropdownOpen, setFromDropdownOpen] = useState(false);
  const [toDropdownOpen, setToDropdownOpen] = useState(false);
  const [selfTransferSliding, setSelfTransferSliding] = useState(false);

  const [openActionMenuId,  setOpenActionMenuId]  = useState(null);
  const [actionMenuPos,     setActionMenuPos]     = useState(null);
  const [deleteConfirmState, setDeleteConfirmState] = useState({ isOpen: false, type: "single", target: null });
  const [editingPage, setEditingPage] = useState(false);
  const [pageInput, setPageInput] = useState("");
  /* "View" action — full record + vendor for the receipt modal (the list
     endpoint only returns a flattened summary row, so this fetches the
     real Payment/Purchase document on demand). */
  const [receiptData, setReceiptData] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  /* Fetch companies list for Party filter */
  useEffect(() => {
    API.get("/companies")
      .then(res => {
        const raw = res.data?.companies || res.data || [];
        const seen = new Set();
        const unique = [];
        raw.forEach(c => {
          const name = (c.companyName || c.name || (typeof c === "string" ? c : "")).trim();
          if (name && !seen.has(name.toLowerCase())) {
            seen.add(name.toLowerCase());
            unique.push(c);
          }
        });
        setCompanies(unique);
      })
      .catch(err => console.error("Error fetching companies:", err));
  }, []);

  const openColumnMenu = (e, colId) => {
    e.stopPropagation();
    // Anchor the menu's RIGHT edge to the button's right edge — anchoring left
    // made it overshoot into the next column on narrow columns.
    const zMenu = getAncestorZoom(document.body);
    const MENU_W = 220;
    const rect = e.currentTarget.getBoundingClientRect();
    let calcLeft = rect.right / zMenu - MENU_W;
    calcLeft = Math.min(calcLeft, window.innerWidth / zMenu - MENU_W - 8);
    calcLeft = Math.max(calcLeft, 8);
    setColumnMenuPos({
      top: rect.bottom / zMenu + 4,
      left: calcLeft,
    });
    setOpenColumnMenuKey(colId);
  };

  const closeColumnMenu = () => {
    setOpenColumnMenuKey(null);
    setColumnMenuPos(null);
  };

  const setColumnPin = useCallback((colId, side) => {
    setPinnedCols(prev => {
      const next = { ...prev };
      if (next[colId] === side) delete next[colId];
      else next[colId] = side;
      return next;
    });
  }, []);

  /* ── orderedColumns (mirrors Accounting.jsx pattern) ─────────────── */
  const orderedColumns = useMemo(() => {
    const visible = getVisibleColumns(); // already ordered
    return visible
      .map(vc => ALL_COLUMNS.find(c => c.id === vc.key))
      .filter(Boolean)
      .sort((a, b) => {
        const rank = c => pinnedCols[c.id] === "left" ? 0 : pinnedCols[c.id] === "right" ? 2 : 1;
        return rank(a) - rank(b);
      });
  }, [columns, pinnedCols]);

  /* ── pinned-block boundary shadow (same as DealsTable.jsx) — applied to
     the last left-pinned column and the first right-pinned column, in
     display order, so the pinned block reads as "floating" above the
     scrollable columns behind it. ───────────────────────────────────── */
  const leftPinnedInOrder = orderedColumns.filter(c => pinnedCols[c.id] === "left");
  const rightPinnedInOrder = orderedColumns.filter(c => pinnedCols[c.id] === "right");
  const lastLeftPinnedKey = leftPinnedInOrder.length > 0 ? leftPinnedInOrder[leftPinnedInOrder.length - 1].id : null;
  const firstRightPinnedKey = rightPinnedInOrder.length > 0 ? rightPinnedInOrder[0].id : null;
  const boundaryShadowSideFor = (colId) =>
    colId === lastLeftPinnedKey ? "left" : colId === firstRightPinnedKey ? "right" : null;

  /* ── sticky offset map (same as Accounting.jsx) ─────────────────── */
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

  const stickyStyleFor = useCallback(colId => stickyStyles[colId] || {}, [stickyStyles]);

  /* ── close menus on outside click ───────────────────────────────── */
  useEffect(() => {
    const handle = () => { setShowFilterMenu(false); setOpenActionMenuId(null); };
    document.addEventListener("click", handle);
    return () => document.removeEventListener("click", handle);
  }, []);

  /* ── close the three-dot header menu on outside click ───────────── */
  useEffect(() => {
    const handle = (e) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) {
        setIsMoreMenuOpen(false);
      }
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

  /* ── data fetching ───────────────────────────────────────────────── */
  const fetchData = useCallback(async () => {
    setShowLoadingSkeleton(true);
    try {
      const params = new URLSearchParams();
      params.append("page", pagination.currentPage);
      params.append("limit", pagination.limit);
      if (searchQuery) params.append("search", searchQuery);

      // Pass all active filters as JSON string to backend
      const validRules = (activeFilters || []).filter(f => f.column && (f.value !== "" || ["is_empty", "is_not_empty"].includes(f.operator)));
      if (validRules.length > 0) {
        params.append("rules", JSON.stringify(validRules));
      }

      const res = await API.get(`/payments-timeline?${params.toString()}`);
      setDocuments(res.data.documents || []);
      if (res.data.accountsSummary) setAccountsSummary(res.data.accountsSummary);
      if (res.data.pagination) setPagination(res.data.pagination);
      setServerSummary(res.data.summary || null);

      // Non-blocking: a failure here shouldn't cost the user the timeline
      // they actually asked for, so it's caught separately.
      try {
        const creditRes = await API.get("/payments-timeline/credit-balances");
        setCreditBalances(creditRes.data.balances || []);
        setCreditTotal(creditRes.data.total || 0);
      } catch (creditErr) {
        console.error("Failed to load credit balances", creditErr);
      }
    } catch (err) {
      toast.error("Failed to load transactions timeline");
      console.error(err);
    } finally {
      setShowLoadingSkeleton(false);
      hasLoadedOnceRef.current = true;
    }
  }, [pagination.currentPage, pagination.limit, searchQuery, activeFilters]);

  /* ── fetch ALL record IDs from DB for global Select All ─────────── */
  const fetchAllIds = useCallback(async () => {
    const tid = toast.loading("Selecting all records...");
    try {
      const params = new URLSearchParams();
      params.append("page", 1);
      params.append("limit", 99999);
      if (searchQuery) params.append("search", searchQuery);

      const validRules = (activeFilters || []).filter(f => f.column && (f.value !== "" || ["is_empty", "is_not_empty"].includes(f.operator)));
      if (validRules.length > 0) {
        params.append("rules", JSON.stringify(validRules));
      }

      const res = await API.get(`/payments-timeline?${params.toString()}`);
      const allDocs = res.data.documents || [];
      setSelectedIds(allDocs.map(d => d._id));
      // This fetch is the only place holding every matching record, and the
      // selection KPIs need each row's amount/direction — so cache it here,
      // otherwise "selected" totals only cover the visible page.
      setAllSelectableDocs(allDocs);
      toast.success(`Selected all ${allDocs.length} record(s).`, { id: tid });
    } catch (err) {
      toast.error("Failed to fetch all records", { id: tid });
      console.error(err);
    }
  }, [searchQuery, activeFilters]);

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setPagination(prev => ({ ...prev, currentPage: 1 }));
  }, [searchQuery, activeFilters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── sorted docs ─────────────────────────────────────── */
  const filteredDocs = useMemo(() => {
    let list = [...documents];

    if (sortConfig.key) {
      list.sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];
        if (sortConfig.key === "party") {
          valA = a.party || "";
          valB = b.party || "";
        } else if (sortConfig.key === "date") {
          // Compare the instant, so rows on the same day order by time of day
          // and a missing date sorts to the start rather than landing wherever
          // an undefined comparison happens to leave it.
          valA = a.date ? new Date(a.date).getTime() : 0;
          valB = b.date ? new Date(b.date).getTime() : 0;
        }
        if (typeof valA === "string") valA = valA.toLowerCase();
        if (typeof valB === "string") valB = valB.toLowerCase();
        if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
        if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }

    return list;
  }, [documents, sortConfig]);

  /* ── KPI stats — narrows to the current selection when one exists,
     same behavior as Deals.jsx's dealStatistics ─────────────────── */
  const paymentStats = useMemo(() => {
    // A selection narrows the KPIs, summed client-side. Resolve ids against
    // allSelectableDocs first (every matching record) and fall back to the
    // current page — using the page alone truncated the totals.
    if (selectedIds.length > 0) {
      const byId = new Map();
      (allSelectableDocs || []).forEach(d => byId.set(d._id, d));
      filteredDocs.forEach(d => byId.set(d._id, d)); // freshest data wins for overlapping ids
      let totalCredit = 0;
      let totalDebit = 0;
      let matched = 0;
      selectedIds.forEach(id => {
        const d = byId.get(id);
        if (!d) return;
        matched += 1;
        // Same exclusion the server applies: a transfer between the org's own
        // accounts is two legs of the same money, so counting them as credit
        // and debit overstates both. They stay selectable and countable.
        if (d.isInternalTransfer) return;
        const amt = Number(d.amount) || 0;
        if (d.direction === "IN") totalCredit += amt;
        else totalDebit += amt;
      });
      return {
        totalCredit,
        totalDebit,
        net: totalCredit - totalDebit,
        count: matched || selectedIds.length,
        isFiltered: true,
      };
    }
    // Unselected: use the server-computed totals across every matching
    // transaction (all pages), not just the current page's 10 rows — falls
    // back to the old current-page-only math only if that hasn't loaded yet.
    if (serverSummary) {
      return { ...serverSummary, isFiltered: false };
    }
    let totalCredit = 0;
    let totalDebit = 0;
    filteredDocs.forEach(d => {
      if (d.isInternalTransfer) return;
      const amt = Number(d.amount) || 0;
      if (d.direction === "IN") totalCredit += amt;
      else totalDebit += amt;
    });
    return {
      totalCredit,
      totalDebit,
      net: totalCredit - totalDebit,
      count: filteredDocs.length,
      isFiltered: false,
    };
  }, [filteredDocs, selectedIds, serverSummary, allSelectableDocs]);

  const handleSelectAll = e =>
    setSelectedIds(e.target.checked ? filteredDocs.map(d => d._id) : []);

  const handleSelectRow = id =>
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );

  /* ── Bulk Update ─────────────────────────────────────────────────
     Rows come from 4 different source collections (Payment/Invoice/
     Purchase/Subscription), so the editable field set is limited to the
     3 fields updateTimelineEntry's generic fallback branch actually
     applies uniformly across every source: paymentDate, notes, bank. */
  const paymentFieldConfig = {
    // Keys match the normalized doc's property names so BulkActions' check
    // passes; "date" is translated to "paymentDate" on submit.
    fields: [
      { key: "date", label: "Date", type: "date" },
      { key: "bank", label: "Bank Account", type: "text" },
      { key: "notes", label: "Notes", type: "text" },
    ],
  };

  const handleBulkUpdatePayments = async ({ field, value, itemIds }) => {
    const bodyKey = field === "date" ? "paymentDate" : field;
    await Promise.all(itemIds.map(async (id) => {
      const doc = documents.find(d => d._id === id);
      if (!doc) return;
      await API.put(`/payments-timeline/${id}`, { source: doc.source, [bodyKey]: value });
    }));
    toast.success("Updated selected entries");
    setSelectedIds([]);
    fetchData();
  };

  /* ── Export to Excel function ───────────────────────────────────── */
  const handleExportExcel = useCallback((itemsToExport) => {
    const list = Array.isArray(itemsToExport) ? itemsToExport : [itemsToExport];
    if (!list.length) {
      toast.error("No entries selected for export");
      return;
    }

    const exportData = list.map(item => ({
      "Transaction ID": item["payment-id"] || item._id || "N/A",
      "Party / Entity": item.party || "N/A",
      "Amount (₹)": item.amount !== undefined ? item.amount : 0,
      "Direction": item.direction === "IN" ? "Credit (IN)" : "Debit (OUT)",
      "Type": item.type || item.paymentType || item.source || "N/A",
      "Date": item.date ? new Date(item.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "N/A",
      "Bank Account": item.bank || "N/A",
      "Notes": item.notes || ""
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Payments Timeline");

    // Dynamic column width adjustment
    const colWidths = [
      { wch: 22 }, // Transaction ID
      { wch: 26 }, // Party
      { wch: 15 }, // Amount
      { wch: 15 }, // Direction
      { wch: 16 }, // Type
      { wch: 18 }, // Date
      { wch: 22 }, // Bank
      { wch: 30 }, // Notes
    ];
    worksheet["!cols"] = colWidths;

    const filename = `Payments_Timeline_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, filename);
    toast.success(`Exported ${list.length} item(s) to ${filename}`);
  }, []);

  /* ── Account Detail ledger — ported from the signatures branch ───── */
  const getAccountTransactions = useCallback((account) => {
    if (!account) return [];
    let txs = [];
    if (account.type === "cash") {
      txs = accountTransactions.filter(doc => doc.type === "Cash" || doc.paymentType === "Cash" || doc.bank?.toLowerCase() === "cash");
    } else if (account.type === "wallet") {
      txs = accountTransactions.filter(doc => doc.type?.toLowerCase() === "wallet" || doc.bank?.toLowerCase() === "wallet");
    } else if (account.type === "bank") {
      const bankName = account.title?.toLowerCase() || "";
      const accNum = account.accountNumber || "";
      txs = accountTransactions.filter(doc => {
        if (!doc.bank) return false;
        const b = doc.bank.toLowerCase();
        return b.includes(bankName) || (accNum && b.includes(accNum.toLowerCase()));
      });
    }

    // Sort chronologically ascending to compute running balance
    txs.sort((a, b) => new Date(a.date) - new Date(b.date));

    let running = 0;
    if (account.type === "bank" && account.openingBalance !== undefined) {
      running = Number(account.openingBalance) || 0;
    }

    const computedTxs = txs.map(tx => {
      const amount = Number(tx.amount) || 0;
      if (tx.direction === "IN") {
        running += amount;
      } else {
        running -= amount;
      }
      return { ...tx, runningBalance: running };
    });

    // Sort descending (latest first) for display
    computedTxs.sort((a, b) => new Date(b.date) - new Date(a.date));

    let list = [...computedTxs];
    if (account.type === "bank" && account.openingBalance !== undefined) {
      list.push({
        _id: "opening-balance-row",
        date: "",
        party: "Opening Balance",
        type: "Opening Balance",
        amount: account.openingBalance,
        direction: "IN",
        isOpeningBalance: true,
        runningBalance: account.openingBalance
      });
    }

    if (modalStartDate) {
      list = list.filter(t => t.isOpeningBalance || !t.date || new Date(t.date) >= new Date(modalStartDate));
    }
    if (modalEndDate) {
      list = list.filter(t => t.isOpeningBalance || !t.date || new Date(t.date) <= new Date(modalEndDate + "T23:59:59"));
    }

    return list;
  }, [accountTransactions, modalStartDate, modalEndDate]);

  const handleExportPDF = useCallback((account, itemsToExport) => {
    const list = Array.isArray(itemsToExport) ? itemsToExport : [itemsToExport];
    if (!list.length) {
      toast.error("No entries to export");
      return;
    }

    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(`${account.title} Transactions Report`, 14, 20);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Account Number/Type: ${account.accountNumber || "N/A"}`, 14, 28);
    doc.text(`Generated on: ${new Date().toLocaleDateString("en-IN")}`, 14, 34);

    const headers = [["Date", "Party / Entity", "Type", "Amount", "Running Balance", "Status"]];
    const data = list.map(item => {
      const isCredit = item.direction === "IN";
      return [
        item.isOpeningBalance
          ? "—"
          : item.date
            ? new Date(item.date).toLocaleDateString("en-IN")
            : "",
        item.party || "",
        item.type || "",
        `${isCredit ? "+" : "-"} INR ${Number(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `INR ${Number(item.runningBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        isCredit ? "Got" : "Gave"
      ];
    });

    doc.autoTable({
      head: headers,
      body: data,
      startY: 42,
      theme: "striped",
      styles: { fontSize: 9 },
      headStyles: { fillColor: [0, 133, 255] }
    });

    const filename = `${account.title.replace(/\s+/g, "_")}_Transactions_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);
    toast.success(`Exported PDF successfully!`);
  }, []);

  const handleCardClick = async (account) => {
    setSelectedAccountDetail(account);
    setLoadingAccountTransactions(true);
    try {
      const res = await API.get("/payments-timeline?limit=999999");
      const allTx = res.data.documents || [];
      setAccountTransactions(allTx);
    } catch (err) {
      console.error("Error fetching account transactions:", err);
      toast.error("Failed to load transactions history");
    } finally {
      setLoadingAccountTransactions(false);
    }
  };

  const handleYouGot = () => {
    if (!selectedAccountDetail) return;
    setEditingPaymentItem({
      direction: "IN",
      bank: selectedAccountDetail.type === "bank" ? selectedAccountDetail.title : "",
      paymentType: selectedAccountDetail.type === "cash" ? "Cash" : "UPI",
    });
    setIsPaymentModalOpen(true);
  };

  const handleYouGave = () => {
    if (!selectedAccountDetail) return;
    setEditingPaymentItem({
      direction: "OUT",
      bank: selectedAccountDetail.type === "bank" ? selectedAccountDetail.title : "",
      paymentType: selectedAccountDetail.type === "cash" ? "Cash" : "UPI",
    });
    setIsPaymentModalOpen(true);
  };

  /* ── Self Transfer — ported from the signatures branch. Reuses the same
     create-payment endpoint PaymentFormModal already posts to (two calls: a
     debit on the source account, a credit on the destination) rather than a
     new dedicated transfer endpoint. ───────────────────────────────────── */
  const handleOpenSelfTransfer = (acc) => {
    setSelfTransferFromBankId(acc.id);
    setSelfTransferToBankId("");
    setSelfTransferAmount("");
    setSelfTransferDate(new Date().toISOString().slice(0, 10));
    setSelfTransferNotes("");
    setFromDropdownOpen(false);
    setToDropdownOpen(false);
    setShowSelfTransferModal(true);
  };

  // Slide the drawer in on the next frame once it mounts.
  useEffect(() => {
    if (!showSelfTransferModal) return;
    const t = requestAnimationFrame(() => setSelfTransferSliding(true));
    return () => cancelAnimationFrame(t);
  }, [showSelfTransferModal]);

  // Slide out, then unmount after the transition.
  const handleCloseSelfTransfer = () => {
    setSelfTransferSliding(false);
    setFromDropdownOpen(false);
    setToDropdownOpen(false);
    setTimeout(() => setShowSelfTransferModal(false), 300);
  };

  const handleSelfTransferSubmit = async (e) => {
    e.preventDefault();
    if (!selfTransferFromBankId || !selfTransferToBankId) {
      toast.error("Please select both from and to accounts");
      return;
    }
    if (selfTransferFromBankId === selfTransferToBankId) {
      toast.error("Source and destination accounts cannot be the same");
      return;
    }
    if (!selfTransferAmount || Number(selfTransferAmount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setLoadingSelfTransfer(true);
    let debitPosted = false;
    try {
      const fromAcc = transferAccounts.find(a => a.id === selfTransferFromBankId);
      const toAcc = transferAccounts.find(a => a.id === selfTransferToBankId);

      const noteSuffix = selfTransferNotes ? `: ${selfTransferNotes}` : "";

      const [year, month, day] = selfTransferDate.split("-").map(Number);
      const now = new Date();
      const localDateObj = new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
      const payloadDate = localDateObj.toISOString();

      // Shared by both legs so they're identifiable as one movement (and a
      // half-completed transfer can be spotted — the two POSTs below are not
      // atomic).
      const transferGroup = `xfer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      // 1. Post Debit (OUT) to source account
      await API.post("/payments-timeline", {
        vendorName: "Self Transfer",
        // Both legs are flagged, so the timeline can keep them in the
        // per-account balances (the point of a transfer) while leaving them
        // out of Total Credit / Total Debit (no money entered or left).
        isInternalTransfer: true,
        transferGroup,
        amount: Number(selfTransferAmount),
        paymentDate: payloadDate,
        direction: "OUT",
        paymentType: fromAcc.type === "cash" ? "Cash" : fromAcc.type === "wallet" ? "Wallet" : "Net Banking",
        bank: (fromAcc.type === "cash" || fromAcc.type === "wallet") ? "" : fromAcc.title,
        notes: `Self Transfer to ${toAcc.title}${noteSuffix}`
      });
      debitPosted = true;

      // 2. Post Credit (IN) to destination account
      await API.post("/payments-timeline", {
        vendorName: "Self Transfer",
        isInternalTransfer: true,
        transferGroup,
        amount: Number(selfTransferAmount),
        paymentDate: payloadDate,
        direction: "IN",
        paymentType: toAcc.type === "cash" ? "Cash" : toAcc.type === "wallet" ? "Wallet" : "Net Banking",
        bank: (toAcc.type === "cash" || toAcc.type === "wallet") ? "" : toAcc.title,
        notes: `Self Transfer from ${fromAcc.title}${noteSuffix}`
      });

      toast.success("Self transfer completed successfully!");
      handleCloseSelfTransfer();
      fetchData(); // Refresh timeline entries and balances
    } catch (err) {
      console.error("Self transfer failed:", err);
      // The two POSTs aren't atomic — if the credit leg fails after the debit
      // already landed, say so explicitly instead of leaving a silent
      // orphaned debit with no matching credit.
      toast.error(
        debitPosted
          ? "Debit recorded but the matching credit failed — check the timeline and add it manually if needed."
          : (err.response?.data?.error || "Failed to complete self transfer")
      );
    } finally {
      setLoadingSelfTransfer(false);
    }
  };

  /* ── pagination ─────────────────────────────────────────────────── */
  const handlePageChange  = newPage   => { if (newPage > 0 && newPage <= pagination.totalPages) setPagination(p => ({ ...p, currentPage: newPage })); };
  const handleLimitChange = newLimit  => setPagination(p => ({ ...p, limit: newLimit, currentPage: 1 }));

  /* ── Column resize (same pattern as Accounting.jsx) ─────────────── */
  const startColumnResize = useCallback((e, colId) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const startX   = e.clientX;
    const startW   = colWidths[colId] ?? MIN_COL_WIDTH;
    const onMove   = mv => setColWidths(prev => ({ ...prev, [colId]: Math.max(MIN_COL_WIDTH, startW + mv.clientX - startX) }));
    const onUp     = () => {
      document.body.style.cursor  = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };
    document.body.style.cursor    = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
  }, [colWidths]);

  const ResizeHandle = useCallback(({ colId }) => (
    <ColumnResizeHandle colId={colId} onResizeStart={startColumnResize} />
  ), []);

  /* ── Column drag-reorder — reorders only the visible columns and
     reassigns `order` for all of them, same pattern Companies.jsx's
     handleColumnReorder uses, so the new order persists via saveColumns. */
  const handleColumnReorder = useCallback((draggedKey, targetKey) => {
    if (!draggedKey || draggedKey === targetKey) return;
    const visible = columns.filter(c => c.visible).sort((a, b) => a.order - b.order);
    const from = visible.findIndex(c => c.key === draggedKey);
    const to = visible.findIndex(c => c.key === targetKey);
    if (from === -1 || to === -1) return;
    const reordered = [...visible];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    const hidden = columns.filter(c => !c.visible);
    saveColumns([...reordered.map((c, i) => ({ ...c, order: i })), ...hidden]);
  }, [columns, saveColumns]);

  const startColumnDrag = (e, colId) => {
    if (e.button !== 0) return;
    if (e.target.closest("button") || e.target.closest("[data-resize-handle]")) return;

    const th      = e.currentTarget;
    const startX  = e.clientX;
    const startY  = e.clientY;
    const THRESHOLD = 5;

    const dragState = { started: false, offsetX: 0, offsetY: 0, zGhost: 1 };

    const positionGhost = (clientX, clientY) => {
      const el = ghostElRef.current;
      if (!el) return;
      const visualTop  = clientY - dragState.offsetY;
      const visualLeft = clientX - dragState.offsetX;
      el.style.top     = `${visualTop  / dragState.zGhost}px`;
      el.style.left    = `${visualLeft / dragState.zGhost}px`;
      el.style.maxHeight = `${Math.max(100, window.innerHeight - visualTop - 72) / dragState.zGhost}px`;
    };

    const updateDragOver = (clientX, clientY) => {
      const elAtPoint = document.elementFromPoint(clientX, clientY);
      const thAtPoint = elAtPoint?.closest("th[data-col-id]");
      const overKey   = thAtPoint?.getAttribute("data-col-id") || null;
      if (dragOverRef.current !== overKey) {
        dragOverRef.current = overKey;
        setDragOverColKey(overKey);
      }
    };

    const beginDrag = () => {
      dragState.started = true;
      window.getSelection?.()?.removeAllRanges();

      const rect = th.getBoundingClientRect();
      const col  = ALL_COLUMNS.find(c => c.id === colId);
      const previewRows = documents.map(doc => cellTextFor(colId, doc));

      dragState.zGhost  = getAncestorZoom(document.body);
      dragState.offsetX = startX - rect.left;
      dragState.offsetY = startY - rect.top;

      dragOverRef.current = null;
      setDraggedColKey(colId);
      setDragOverColKey(null);
      document.body.style.userSelect = "none";
      setDragGhost({
        label: col?.label || colId,
        previewRows,
        width:  rect.width  / dragState.zGhost,
        height: rect.height / dragState.zGhost,
      });

      requestAnimationFrame(() => positionGhost(startX, startY));
    };

    const handleMouseMove = mv => {
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
      document.removeEventListener("mouseup",   handleMouseUp);
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
    document.addEventListener("mouseup",   handleMouseUp);
  };

  /* ── View → Payment Receipt ──────────────────────────────────────── */
  const handleViewReceipt = async (doc) => {
    const tid = toast.loading("Loading receipt...");
    try {
      const res = await API.get(`/payments-timeline/${doc._id}/receipt`, {
        params: { source: doc.source },
      });
      setReceiptData(res.data);
      setShowReceiptModal(true);
      toast.dismiss(tid);
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to load receipt", { id: tid });
    }
  };

  /* ── Action menu ─────────────────────────────────────────────────── */
  const renderActionMenu = doc => {
    const isOpen = openActionMenuId === doc._id;
    return (
      <div className="relative flex-shrink-0 flex items-center">
        <button
          onClick={e => {
            e.stopPropagation();
            if (isOpen) {
              setOpenActionMenuId(null);
              setActionMenuPos(null);
              return;
            }
            // Zoom correction + row-center anchor + viewport clamp; the raw
            // rect drifted the portal away from the clicked row under CSS zoom.
            const zMenu = getAncestorZoom(document.body);
            const MENU_W = 160; // matches w-40 below
            const MENU_H = 189; // 5 buttons (~36px each) + 1 divider (~9px)
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
            setOpenActionMenuId(doc._id);
          }}
          className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <MoreIcon className="w-4 h-4" />
        </button>
        {isOpen && actionMenuPos && createPortal(
          <>
            {/* Invisible backdrop to close menu on click-outside */}
            <div className="fixed inset-0 z-[59]" onClick={() => { setOpenActionMenuId(null); setActionMenuPos(null); }} />
            <div
              className="fixed w-40 bg-white rounded-xl shadow-lg border border-[#E1E4EA] py-1 z-[60] overflow-hidden"
              style={{ top: actionMenuPos.top, left: actionMenuPos.left }}
              onClick={e => e.stopPropagation()}
            >
              <button className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => { setOpenActionMenuId(null); setActionMenuPos(null); handleViewReceipt(doc); }}>
                <EyeIcon className="w-4 h-4 text-gray-400" /> View
              </button>
              <button className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
                onClick={() => {
                  setOpenActionMenuId(null);
                  setActionMenuPos(null);
                  setEditingPaymentItem(doc);
                  setIsPaymentModalOpen(true);
                }}>
                <EditIcon className="w-4 h-4 text-gray-400" /> Edit
              </button>
              <button className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
                onClick={() => {
                  setOpenActionMenuId(null);
                  setActionMenuPos(null);
                  handleExportExcel(doc);
                }}>
                <DownloadIcon className="w-4 h-4 text-gray-400" /> Download
              </button>
              <button className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => { setOpenActionMenuId(null); setActionMenuPos(null); toast.success("Share coming soon!"); }}>
                <Share2 className="w-4 h-4 text-gray-400" /> Share
              </button>
              <div className="h-px bg-gray-100 my-1" />
              <button className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 cursor-pointer"
                onClick={() => {
                  setOpenActionMenuId(null);
                  setActionMenuPos(null);
                  setDeleteConfirmState({ isOpen: true, type: "single", target: doc });
                }}>
                <DeleteIcon className="w-4 h-4 text-red-500" /> Delete
              </button>
            </div>
          </>,
          document.body
        )}
      </div>
    );
  };

  /* ── Cell renderer ───────────────────────────────────────────────── */
  const renderCell = (colId, doc, isRightmost) => {
    let content;
    switch (colId) {
      case "amount":
        content = `₹${Number(doc.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        break;
      case "date":
        content = doc.date ? new Date(doc.date).toLocaleString() : "";
        break;
      case "party":
        content = (
          <div className="flex flex-col truncate">
            <span className="text-sm font-semibold text-gray-900 truncate">{doc.party}</span>
            {doc.source && <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mt-0.5 truncate">{doc.source}</span>}
          </div>
        );
        break;
      case "direction": {
        const isCredit = doc.direction === "IN";
        content = (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${isCredit ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
            {isCredit ? "Credit" : "Debit"}
          </span>
        );
        break;
      }
      default:
        content = <span className="font-medium text-gray-700 truncate block">{doc[colId] ?? ""}</span>;
    }

    return (
      <div className="flex items-center justify-between gap-2 w-full min-w-0">
        <div className="flex-1 min-w-0">{content}</div>
        {isRightmost && renderActionMenu(doc)}
      </div>
    );
  };

  /* ── Pagination items ────────────────────────────────────────────── */
  const paginationItems = useMemo(() => {
    const items = [];
    const { currentPage, totalPages } = pagination;
    if (totalPages <= 1) return items;
    items.push(1);
    if (currentPage > 2)             items.push("left-dots");
    if (currentPage !== 1 && currentPage !== totalPages) items.push(currentPage);
    if (currentPage < totalPages - 1) items.push("right-dots");
    if (totalPages > 1)               items.push(totalPages);
    return items;
  }, [pagination]);

  // First-load-only full-page skeleton — same component/usage Deals.jsx
  // uses (`if (loading) return <PageSkeleton .../>`).
  if (showLoadingSkeleton && documents.length === 0 && !hasLoadedOnceRef.current) {
    return (
      <PageSkeleton variant="kanban" boardVariant="table" tableRows={pagination.limit} tableCols={ALL_COLUMNS.length} />
    );
  }

  /* ─────────────────────────────────────────────────────────────────── */
  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-[#FAFBFC]">

      {/* ── Fixed header bar — same shape/classes as Deals.jsx's "New Strip":
          border-b bg-white flex justify-between, fixed 64px height, title
          block stacked (name + video icon, subtitle below) instead of a
          single title+badge line. ──────────────────────────────────────── */}
      <div
        className="fixed right-0 border-b border-[#E1E4EA] bg-white flex items-center justify-between gap-2 lg:gap-4 px-4 sm:px-6 lg:px-8 top-[calc(54px+var(--dc-offline-offset,0px))] lg:top-[calc(64px+var(--dc-offline-offset,0px))]"
        style={{
          left: "var(--sidebar-width, 0px)",
          zIndex: 40,
          height: `${HEADER_HEIGHT}px`,
          minHeight: `${HEADER_HEIGHT}px`,
          maxHeight: `${HEADER_HEIGHT}px`,
          boxSizing: "border-box",
        }}
      >
        <div className="flex flex-1 items-center gap-4 min-w-0 pr-4">
          {/* Scrollable Container for all Individual Cards — Total Funds + Wallet/Cash/Bank,
              ported from the signatures branch (cards now open the Account Detail ledger
              instead of navigating to Settings). */}
          <div
            ref={cardsScrollRef}
            className="flex-1 flex items-center gap-4 overflow-x-auto h-full py-1 min-w-0"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {/* ── CARD: Total Available Funds ──────────────────────────────── */}
            {(() => {
              const isNegative = filteredTotal < 0;
              const activeCount = selectedAccountIds.length;
              const totalCount = (walletSummary ? 1 : 0) + (cashSummary ? 1 : 0) + bankSummaries.length;
              return (
                <div className="relative hidden sm:flex flex-col justify-between w-[220px] h-24 flex-shrink-0 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-3 hover:border-blue-400 hover:shadow-sm transition-all">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 font-semibold uppercase tracking-wide leading-none">Total Funds</span>
                    <button
                      ref={filterBtnRef}
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        if (filterOpen) {
                          setFilterOpen(false);
                          setFilterDropdownPos(null);
                        } else {
                          const rect = filterBtnRef.current?.getBoundingClientRect();
                          if (rect) setFilterDropdownPos({ top: rect.bottom + 6, left: rect.left });
                          setFilterOpen(true);
                        }
                      }}
                      className={`flex items-center justify-center w-6 h-6 rounded-lg border transition-all flex-shrink-0 ${filterOpen ? "bg-blue-50 border-blue-400 text-blue-600" : "bg-white border-[#E2E8F0] text-gray-400 hover:border-blue-400 hover:text-blue-600"}`}
                      title="Filter accounts"
                    >
                      <FilterIcon size={16} />
                    </button>
                  </div>
                  <span className={`text-xl font-semibold tracking-tight leading-none ${isNegative ? "text-red-600" : "text-emerald-600"}`}>
                    ₹{filteredTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  {activeCount < totalCount && (
                    <span className="absolute top-2 right-9 text-[9px] font-bold text-blue-500">{activeCount}/{totalCount}</span>
                  )}
                  {filterOpen && filterDropdownPos && createPortal(
                    <>
                      <div className="fixed inset-0 z-[98]" onClick={() => { setFilterOpen(false); setFilterDropdownPos(null); }} />
                      <div
                        className="fixed z-[99] min-w-[260px] bg-white border border-gray-200 rounded-xl shadow-xl p-3"
                        style={{ top: filterDropdownPos.top, left: filterDropdownPos.left }}
                        onClick={e => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-between mb-2 px-1">
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Include in Total</p>
                          <button type="button" className="text-[11px] font-semibold text-blue-500 hover:underline" onClick={() => setSelectedAccountIds(defaultSelected)}>Select all</button>
                        </div>
                        {walletSummary && (
                          <label className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                            <Checkbox checked={selectedAccountIds.includes(walletSummary?.id)} onChange={e => { const c = e.target.checked; setSelectedAccountIds(prev => c ? [...prev, walletSummary?.id] : prev.filter(id => id !== walletSummary?.id)); }} id="true" />
                            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                              <Wallet className="w-4 h-4 text-gray-500" />
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="text-sm font-bold text-gray-900">Wallet</span>
                              <span className="text-[11px] text-gray-400">Prepaid Credits</span>
                            </div>
                          </label>
                        )}
                        {cashSummary && (
                          <label className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                            <Checkbox checked={selectedAccountIds.includes(cashSummary.id)} onChange={e => { const c = e.target.checked; setSelectedAccountIds(prev => c ? [...prev, cashSummary.id] : prev.filter(id => id !== cashSummary.id)); }} id="true" />
                            <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                              <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="text-sm font-bold text-gray-900">Cash</span>
                              <span className="text-[11px] text-gray-400">Physical Cash</span>
                            </div>
                          </label>
                        )}
                        {bankSummaries.map(bank => (
                          <label key={bank.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                            <Checkbox checked={selectedAccountIds.includes(bank.id)} onChange={e => { const c = e.target.checked; setSelectedAccountIds(prev => c ? [...prev, bank.id] : prev.filter(id => id !== bank.id)); }} id="true" />
                            <BankLogo bankName={bank.title} size={32} className="flex-shrink-0 rounded-lg overflow-hidden" />
                            <div className="flex flex-col min-w-0">
                              <span className="text-sm font-bold text-gray-900 whitespace-nowrap">{bank.title}</span>
                              {bank.accountNumber && <span className="text-[11px] text-gray-400">{bank.accountNumber}</span>}
                            </div>
                          </label>
                        ))}
                      </div>
                    </>,
                    document.body
                  )}
                </div>
              );
            })()}

            {/* ── CARD: Unapplied credit ───────────────────────────────────
                Payments received or advanced that aren't yet tied to an
                invoice or bill. Clicking it lists who the money sits with. */}
            {creditTotal > 0.01 && (
              <div
                ref={creditCardRef}
                onClick={() => setShowCreditPanel((v) => !v)}
                className="group relative hidden sm:flex flex-col justify-between w-[220px] h-24 flex-shrink-0 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-3 hover:border-amber-400 hover:bg-amber-50/10 hover:shadow-sm cursor-pointer transition-all"
                title="Payments not yet applied to a document"
              >
                <div className="flex items-center gap-2">
                  <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
                    <ListChecks className="w-3.5 h-3.5 text-amber-600" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-bold text-gray-900 leading-tight">Unapplied</span>
                    <span className="text-[11px] text-gray-400 leading-tight">
                      {creditBalances.length} {creditBalances.length === 1 ? "party" : "parties"}
                    </span>
                  </div>
                </div>
                <span className="text-xl font-semibold tracking-tight leading-none text-amber-600">
                  ₹{Number(creditTotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>

                {showCreditPanel && createPortal(
                  <div
                    ref={creditPanelRef}
                    style={creditPanelStyle}
                    className="bg-white border border-gray-200 rounded-xl shadow-xl overflow-y-auto cursor-default"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
                      <span className="text-[12px] font-semibold text-gray-900">Unapplied credit</span>
                      <button
                        type="button"
                        onClick={() => setShowCreditPanel(false)}
                        className="text-gray-400 hover:text-gray-600"
                        aria-label="Close"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    {creditBalances.map((b) => (
                      <button
                        key={`${b.partyType}-${b.partyId}`}
                        type="button"
                        onClick={() => {
                          setCreditParty(b);
                          setShowCreditPanel(false);
                        }}
                        className="w-full text-left px-4 py-2.5 border-b border-gray-50 last:border-b-0 flex items-center justify-between gap-3 hover:bg-amber-50/50 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-[12px] font-medium text-gray-900 truncate">{b.partyName}</p>
                          <p className="text-[10.5px] text-gray-400">
                            {b.direction === "IN" ? "From customer" : "Advance to vendor"} ·{" "}
                            {b.payments.length} {b.payments.length === 1 ? "payment" : "payments"}
                          </p>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <span className="block text-[12px] font-semibold text-amber-600">
                            ₹{Number(b.creditBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className="block text-[10px] text-[#158FFF] font-medium">Apply →</span>
                        </div>
                      </button>
                    ))}
                  </div>,
                  document.body
                )}
              </div>
            )}

            {/* ── CARD: Wallet ─────────────────────────────────────────────── */}
            {(() => {
              const balance = walletSummary ? Number(walletSummary.currentBalance) : 0;
              const isNegative = balance < 0;
              return (
                <div
                  onClick={() => handleCardClick(walletSummary)}
                  className="group relative hidden sm:flex flex-col justify-between w-[220px] h-24 flex-shrink-0 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-3 hover:border-violet-400 hover:bg-violet-50/10 hover:shadow-sm cursor-pointer transition-all"
                  title="View Wallet Transactions"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center">
                      <Wallet className="w-3.5 h-3.5 text-gray-500" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-bold text-gray-900 leading-tight">Wallet</span>
                      <span className="text-[11px] text-gray-400 leading-tight">Prepaid Credits</span>
                    </div>
                  </div>
                  <span className={`text-xl font-semibold tracking-tight leading-none ${isNegative ? "text-red-600" : "text-emerald-600"}`}>
                    ₹{balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleOpenSelfTransfer(walletSummary); }}
                    className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-gray-800 hover:bg-gray-900 border-none p-1.5 rounded-lg text-white hover:text-[#0085FF] shadow-md cursor-pointer flex items-center justify-center"
                    title="Self Transfer"
                  >
                    <ArrowLeftRight size={14} />
                  </button>
                </div>
              );
            })()}

            {/* ── CARD: Cash ───────────────────────────────────────────────── */}
            {cashSummary && (() => {
              const balance = Number(cashSummary.currentBalance);
              const isNegative = balance < 0;
              return (
                <div
                  onClick={() => handleCardClick(cashSummary)}
                  className="group relative hidden sm:flex flex-col justify-between w-[220px] h-24 flex-shrink-0 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-3 hover:border-green-400 hover:bg-green-50/10 hover:shadow-sm cursor-pointer transition-all"
                  title="Cash Transactions"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-green-100 flex items-center justify-center">
                      <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-bold text-gray-900 leading-tight">Cash</span>
                      <span className="text-[11px] text-gray-400 leading-tight">Physical Cash</span>
                    </div>
                  </div>
                  <span className={`text-xl font-semibold tracking-tight leading-none ${isNegative ? "text-red-600" : "text-emerald-600"}`}>
                    ₹{balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleOpenSelfTransfer(cashSummary); }}
                    className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-gray-800 hover:bg-gray-900 border-none p-1.5 rounded-lg text-white hover:text-[#0085FF] shadow-md cursor-pointer flex items-center justify-center"
                    title="Self Transfer"
                  >
                    <ArrowLeftRight size={14} />
                  </button>
                </div>
              );
            })()}

            {/* ── CARDS: Individual Banks ───────────────────────────────────── */}
            {bankSummaries.length > 0 ? (
              bankSummaries.map((bank) => {
                const balance = Number(bank.currentBalance);
                const isNegative = balance < 0;
                return (
                  <div
                    key={bank.id}
                    onClick={() => handleCardClick(bank)}
                    className="group relative hidden sm:flex flex-col justify-between w-[220px] h-24 flex-shrink-0 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-3 hover:border-blue-400 hover:bg-blue-50/10 hover:shadow-sm cursor-pointer transition-all"
                    title="View Bank Transactions"
                  >
                    <div className="flex items-center gap-2">
                      <BankLogo bankName={bank.title} size={28} className="flex-shrink-0 rounded-lg overflow-hidden" />
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-bold text-gray-900 leading-tight whitespace-nowrap">{bank.title}</span>
                        <span className="text-[11px] text-gray-400 leading-tight">
                          {bank.accountNumber || "Bank Account"}
                        </span>
                      </div>
                    </div>
                    <span className={`text-xl font-semibold tracking-tight leading-none ${isNegative ? "text-red-600" : "text-emerald-600"}`}>
                      ₹{balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleOpenSelfTransfer(bank); }}
                      className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-gray-800 hover:bg-gray-900 border-none p-1.5 rounded-lg text-white hover:text-[#0085FF] shadow-md cursor-pointer flex items-center justify-center"
                      title="Self Transfer"
                    >
                      <ArrowLeftRight size={14} />
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="hidden sm:flex flex-col justify-center w-[220px] h-24 flex-shrink-0 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-3">
                <span className="text-sm font-medium text-[#94A3B8]">No active banks</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-row items-center gap-2 flex-shrink-0 min-w-0">
          {/* Search — expands in place from the icon */}
          <div
            className={`relative h-10 flex items-center border ${searchQuery ? "border-[#0085FF]" : "border-[#E1E4EA]"} rounded-full bg-white transition-all duration-300 ease-in-out hover:bg-gray-50 focus-within:border-[#0085FF] focus-within:hover:bg-white ${isSearchExpanded ? "w-[220px] sm:w-[300px] lg:w-[380px]" : "w-10"} max-w-full flex-shrink-0`}
          >
            <SearchIcon
              className="absolute left-3 text-[#525866] w-4 h-4 cursor-pointer z-10 flex-shrink-0 top-1/2 -translate-y-1/2"
              onClick={() => { setIsSearchExpanded(true); searchInputRef.current?.focus(); }}
            />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchExpanded(true)}
              onBlur={() => { if (!searchQuery) setIsSearchExpanded(false); }}
              placeholder="Search by ID or party..."
              className={`w-full h-full bg-transparent rounded-full pl-9 pr-9 text-[14px] leading-[20px] text-[#1F2937] placeholder:text-[#99A0AE] focus:outline-none transition-opacity duration-200 cursor-pointer ${isSearchExpanded ? "opacity-100 focus:cursor-text" : "opacity-0"}`}
            />
            {isSearchExpanded && searchQuery && (
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-5 h-5 rounded-full text-gray-900 hover:bg-gray-100 transition-colors"
              >
                <X className="w-3.5 h-3.5" strokeWidth={2.5} />
              </button>
            )}
          </div>

          {/* Filter Button */}
          <button
            type="button"
            onClick={() => setShowAdvancedFilters(true)}
            className="relative flex items-center justify-center w-10 h-10 rounded-full border border-[#E1E4EA] text-gray-500 hover:bg-gray-50 transition-colors bg-white cursor-pointer flex-shrink-0"
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
              onClick={() => setIsMoreMenuOpen((prev) => !prev)}
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
                  <SettingsIcon className="w-4 h-4 text-gray-400" />
                  Columns
                </button>
                <button
                  onClick={() => { setShowStats((prev) => !prev); setIsMoreMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <EyeIcon className="w-4 h-4 text-gray-400" />
                  {showStats ? "Hide KPIs" : "Unhide KPIs"}
                </button>
                <button
                  onClick={() => { setShowImport(true); setIsMoreMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <UploadIcon className="w-4 h-4 text-gray-400" />
                  Import
                </button>
                <button
                  onClick={() => { setShowVideoTutorial(true); setIsMoreMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <VideoIcon className="w-4 h-4 text-gray-400" />
                  Video Tutorial
                </button>
              </div>
            )}
          </div>

          {/* Add Button */}
          <button
            onClick={() => {
              setEditingPaymentItem(null);
              setIsPaymentModalOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 h-10 px-4 bg-[#0085FF] text-white text-sm font-medium rounded-full hover:bg-blue-600 transition-colors flex-shrink-0 ml-1 cursor-pointer"
          >
            <PlusIcon className="w-4 h-4 flex-shrink-0 text-white" />
            <span className="whitespace-nowrap">Add Payment</span>
          </button>
        </div>
      </div>

      {/* ── Bulk-action strip — takes over the KPI band's slot rather than
          inserting a band of its own, so selecting rows doesn't push the
          whole page down by an extra row (same "strip replaces the bar"
          pattern as Companies/Accounting). Falls back to its own height
          when the KPI band is hidden via the three-dot menu. ── */}
      {stripVisible && (
        <div
          className="fixed right-0 box-border flex items-center bg-white border-b border-[#E1E4EA] px-4 sm:px-6 lg:px-8"
          style={{
            left: "var(--sidebar-width, 0px)",
            top: TOOLBAR_BOTTOM,
            height: showStats ? KPI_BAND_HEIGHT : BULK_STRIP_HEIGHT,
            zIndex: 39,
            boxSizing: "border-box",
          }}
        >
          <BulkActionBar
            bare
            selectedCount={selectedIds.length}
            entityName="payment"
            isClosing={stripClosing}
            onSelectAll={fetchAllIds}
            onDeselectAll={() => setSelectedIds([])}
            onExport={() => {
              const selectedDocs = documents.filter(doc => selectedIds.includes(doc._id));
              handleExportExcel(selectedDocs.length > 0 ? selectedDocs : selectedIds.map(id => ({ _id: id })));
            }}
            onDelete={() => {
              setDeleteConfirmState({ isOpen: true, type: "bulk", target: selectedIds });
            }}
            onUpdateStatus={() => setShowBulkActions(true)}
            onCancel={() => setSelectedIds([])}
          />
        </div>
      )}

      {/* ── KPI stat cards — same band treatment as Deals.jsx's stats row
          (bordered band, 40x40 icon boxes, gap-6 between cards), narrowing
          to the selection when rows are selected. Toggled via the
          three-dot menu's Hide/Unhide KPIs item. ─────────────────────── */}
      {showStats && !stripVisible && (
        <div
          className="fixed right-0 box-border flex flex-col justify-center bg-white border-b border-[#E1E4EA] px-6 py-6"
          style={{ left: "var(--sidebar-width, 0px)", top: TOOLBAR_BOTTOM, height: KPI_BAND_HEIGHT, zIndex: 38, boxSizing: "border-box" }}
        >
          <div className="grid grid-cols-2 lg:flex lg:flex-row lg:items-stretch gap-3 lg:gap-6">
            {[
              { label: "Total Credit", value: `₹${paymentStats.totalCredit.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: TrendingUp, iconClass: "text-green-600" },
              { label: "Total Debit", value: `₹${paymentStats.totalDebit.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: TrendingDown, iconClass: "text-red-600" },
              { label: "Net", value: `₹${paymentStats.net.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: Wallet, iconClass: paymentStats.net >= 0 ? "text-green-600" : "text-red-600" },
              { label: "Transactions", value: paymentStats.count, icon: ListChecks, iconClass: "text-[#0085FF]" },
              // Self-transfers are kept out of Credit/Debit/Net but shown when
              // non-zero, so the exclusion doesn't look like missing money.
              ...(Number(paymentStats.totalTransferred) > 0
                ? [{
                    label: "Self Transfers",
                    value: `₹${Number(paymentStats.totalTransferred).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    icon: ArrowLeftRight,
                    iconClass: "text-[#78788D]",
                  }]
                : []),
            ].map((kpi) => (
              <StatTile
                key={kpi.label}
                tile={{
                  ...kpi,
                  label: `${kpi.label}${paymentStats.isFiltered ? " (selected)" : ""}`,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Full-bleed table (matches Accounting.jsx layout) ──────── */}
      <div
        className="fixed right-0 overflow-x-auto overflow-y-auto bg-white"
        style={{
          left: "var(--sidebar-width, 0px)",
          bottom: 64,
          // The strip and the KPI band occupy the SAME slot now (one or the
          // other, never both), so this adds a single band's height —
          // whichever is currently showing — instead of summing them.
          top:
            TOOLBAR_BOTTOM +
            (showStats
              ? KPI_BAND_HEIGHT
              : stripVisible
                ? BULK_STRIP_HEIGHT
                : 0),
          paddingLeft: "var(--content-inset, 16px)",
        }}
      >
        <table className="min-w-full divide-y divide-gray-200 table-fixed">
          <thead className="bg-[#F5F7FA] sticky top-0 z-20">
            <tr>
              {/* Selection column */}
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
                  <Checkbox checked={filteredDocs.length > 0 && selectedIds.length === filteredDocs.length} onChange={handleSelectAll}  uncheckedColor="text-[#525866]"/>
                </div>
                <ResizeHandle colId="selection" />
              </th>

              {/* Data columns */}
              {orderedColumns.map(col => {
                const isDragging = draggedColKey === col.id;
                const isDragOver = dragOverColKey === col.id && draggedColKey && draggedColKey !== col.id;
                const boundaryShadowSide = boundaryShadowSideFor(col.id);

                return (
                  <th
                    key={col.id}
                    data-col-id={col.id}
                    onMouseDown={e => startColumnDrag(e, col.id)}
                    title="Drag to move this column"
                    style={{
                      width: colWidths[col.id],
                      opacity: isDragging ? 0.35 : 1,
                      boxShadow: "inset -1px 0 0 0 #E1E4EA",
                      ...stickyStyleFor(col.id),
                    }}
                    className={`relative px-4 py-3 text-left text-sm font-bold text-[#525866] transition-colors ${
                      isDragOver ? "bg-blue-100" : "bg-[#F5F7FA] hover:bg-[#EDF0F5]"
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
                        onClick={e => openColumnMenu(e, col.id)}
                        title="Column options"
                        className="p-1 rounded hover:bg-gray-200 transition-colors text-gray-500 flex-shrink-0"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <ResizeHandle colId={col.id} />
                    {boundaryShadowSide && (
                      <div style={getPinnedBoundaryOverlayStyle(boundaryShadowSide)} />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="bg-white">
            {showLoadingSkeleton ? (
              <TableSkeletonRows
                numRows={pagination.limit}
                columns={orderedColumns.map(c => colWidths[c.id])}
                hasCheckbox
                checkboxWidth={colWidths.selection}
              />
            ) : filteredDocs.length === 0 ? (
              <tr>
                <td colSpan={orderedColumns.length + 1}>
                  <EmptyState
                    icon={PdfIcon}
                    noun="Payment"
                    isFiltered={!!(searchQuery || activeFilters?.length)}
                    filteredTitle="No transactions found."
                    onCreate={() => {
                      setEditingPaymentItem(null);
                      setIsPaymentModalOpen(true);
                    }}
                    buttonLabel="Add Payment"
                  />
                </td>
              </tr>
            ) : (
              filteredDocs.map(doc => (
                <tr
                  key={doc._id}
                  className={`bg-white hover:bg-blue-50 transition-colors ${selectedIds.includes(doc._id) ? "!bg-blue-50" : ""}`}
                  style={{ height: 37, maxHeight: 37 }}
                >
                  {/* Selection cell */}
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
                      <Checkbox checked={selectedIds.includes(doc._id)} onChange={() => handleSelectRow(doc._id)} />
                    </div>
                  </td>

                  {/* Data cells */}
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
                        className={`px-4 py-2 align-middle text-sm text-[#1C1B1F] bg-inherit whitespace-nowrap ${cellBoundaryShadowSide ? "" : "overflow-hidden"}`}
                      >
                        {renderCell(col.id, doc, isRightmost)}
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
        </table>
      </div>

      {/* ── Drag ghost portal (exact copy of Accounting.jsx) ──────── */}
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
          <div
            className="px-4 py-3 bg-[#F5F7FA] border-b border-[#E1E4EA]"
            style={{ height: dragGhost.height }}
          >
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

      {/* ── Pagination bar ────────────────────────────────────────── */}
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
            </span>{" "}of{" "}
            <span className="font-semibold">{pagination.totalCount}</span> transactions
          </p>
          <select
            value={pagination.limit}
            onChange={e => handleLimitChange(parseInt(e.target.value))}
            className="border border-gray-300 rounded-md text-sm py-1 pl-2 pr-6 focus:outline-none focus:border-[#0085FF] focus:ring-1 focus:ring-[#0085FF]"
          >
            {[10, 20, 50, 100].map(val => <option key={val} value={val}>{val} per page</option>)}
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

          {(() => {
            const commitPage = () => {
              const val = parseInt(pageInput, 10);
              if (!isNaN(val) && val >= 1 && val <= pagination.totalPages) {
                handlePageChange(val);
              }
              setEditingPage(false);
            };

            return paginationItems.map((item, idx) => {
              if (item === "left-dots" || item === "right-dots") {
                return (
                  <span key={`${item}-${idx}`} className="flex items-center justify-center w-8 h-8 text-sm font-medium text-gray-400 select-none">
                    ....
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
                    onChange={e => setPageInput(e.target.value)}
                    onBlur={commitPage}
                    onKeyDown={e => {
                      if (e.key === "Enter") commitPage();
                      if (e.key === "Escape") setEditingPage(false);
                    }}
                    className="w-10 h-8 rounded-full border border-blue-500 text-center text-sm font-medium text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                );
              }
              return (
                <button
                  key={item}
                  onClick={() => handlePageChange(item)}
                  onDoubleClick={() => {
                    if (isCurrent) {
                      setPageInput(String(pagination.currentPage));
                      setEditingPage(true);
                    }
                  }}
                  title={isCurrent ? "Double-click to type a page number" : undefined}
                  className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors cursor-pointer ${isCurrent ? "bg-[#0085FF] text-white" : "bg-white border border-[#E1E4EA] text-gray-700 hover:bg-gray-50"}`}
                >
                  {item}
                </button>
              );
            });
          })()}

          <button
            onClick={() => handlePageChange(pagination.currentPage + 1)}
            disabled={!pagination.hasNextPage}
            className="flex items-center justify-center w-8 h-8 rounded-full border border-[#E1E4EA] bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Shared Column Header Options Menu (Pin Left/Right, Sort, Filter, Hide) ── */}
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
              className="w-[160px] z-[9999] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5 animate-in fade-in zoom-in duration-150 origin-top-right"
            >
              {(() => {
                const col = ALL_COLUMNS.find(c => c.id === openColumnMenuKey);
                if (!col) return null;
                const side = pinnedCols[col.id];
                const required = columns.find(c => c.key === col.id)?.required;
                const itemClass = "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap";

                return (
                  <>
                    <button
                      onClick={() => {
                        closeColumnMenu();
                        setColumnPin(col.id, "left");
                      }}
                      className={`${itemClass} ${side === "left" ? "bg-blue-50 text-blue-700" : "text-[#161618] hover:bg-gray-50"}`}
                    >
                      {side === "left" ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5 text-[#1C1B1F]" />}
                      Pin to Left
                    </button>
                    <button
                      onClick={() => {
                        closeColumnMenu();
                        setColumnPin(col.id, "right");
                      }}
                      className={`${itemClass} ${side === "right" ? "bg-blue-50 text-blue-700" : "text-[#161618] hover:bg-gray-50"}`}
                    >
                      {side === "right" ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5 text-[#1C1B1F]" />}
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
                      disabled={required}
                      onClick={() => {
                        if (required) return;
                        closeColumnMenu();
                        saveColumns(columns.map(c => c.key === col.id ? { ...c, visible: false } : c));
                      }}
                      className={`${itemClass} ${required ? "text-gray-300 cursor-not-allowed" : "text-[#161618] hover:bg-gray-50"}`}
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

      {creditParty && (
        <ApplyCreditModal
          party={creditParty}
          onClose={() => setCreditParty(null)}
          onSuccess={() => fetchData()}
        />
      )}

      <PaymentFormModal
        isOpen={isPaymentModalOpen}
        editItem={editingPaymentItem}
        onClose={() => {
          setIsPaymentModalOpen(false);
          setEditingPaymentItem(null);
        }}
        onSuccess={() => fetchData()}
      />

      <PaymentReceiptModal
        isOpen={showReceiptModal}
        onClose={() => { setShowReceiptModal(false); setReceiptData(null); }}
        payment={receiptData?.payment}
        vendor={receiptData?.vendor}
      />

      {/* ── Account Detail (ledger) Modal — ported from the signatures branch ── */}
      {selectedAccountDetail && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-[90vw] max-w-5xl h-[80vh] p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-150 relative flex flex-col">

            <button
              onClick={() => { setSelectedAccountDetail(null); setShowBalance(false); }}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1.5 rounded-full transition-colors flex-shrink-0"
            >
              <X size={20} />
            </button>

            <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-4 flex-shrink-0">
              <div className="flex items-center gap-3">
                {selectedAccountDetail.type === "bank" ? (
                  <BankLogo bankName={selectedAccountDetail.title} size={40} className="rounded-lg overflow-hidden flex-shrink-0" />
                ) : selectedAccountDetail.type === "cash" ? (
                  <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <Wallet className="w-5 h-5 text-gray-500" />
                  </div>
                )}
                <div>
                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    {selectedAccountDetail.title}
                    {selectedAccountDetail.accountNumber && (
                      <span className="text-sm font-normal text-gray-400">
                        ({selectedAccountDetail.accountNumber})
                      </span>
                    )}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowBalance(!showBalance)}
                    className="mt-1 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline transition-colors"
                  >
                    {showBalance
                      ? `Balance: ₹${selectedAccountDetail.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : `See current ${selectedAccountDetail.type === "bank" ? "bank" : selectedAccountDetail.type === "cash" ? "cash" : "wallet"} balance`}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2.5 mr-10">
                <button
                  type="button"
                  onClick={handleYouGot}
                  className="px-4 py-2 rounded-full bg-green-600 hover:bg-green-700 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
                >
                  You Got
                </button>
                <button
                  type="button"
                  onClick={handleYouGave}
                  className="px-4 py-2 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
                >
                  You Gave
                </button>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowModalOptions(!showModalOptions)}
                    className="p-2 rounded-full border border-gray-200 hover:bg-gray-50 text-gray-500 hover:text-gray-700 transition-colors flex-shrink-0 cursor-pointer flex items-center justify-center"
                    title="More options"
                  >
                    <MoreIcon className="w-4 h-4" />
                  </button>
                  {showModalOptions && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setShowModalOptions(false)} />
                      <div className="absolute right-0 mt-2 w-44 bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 z-30 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                        <button
                          type="button"
                          onClick={() => {
                            setShowModalOptions(false);
                            handleExportPDF(selectedAccountDetail, getAccountTransactions(selectedAccountDetail));
                          }}
                          className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-gray-700 hover:bg-gray-50 text-left transition-colors cursor-pointer font-medium"
                        >
                          <PdfIcon className="w-4 h-4 text-gray-400" />
                          Download PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowModalOptions(false);
                            handleExportExcel(getAccountTransactions(selectedAccountDetail));
                          }}
                          className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-gray-700 hover:bg-gray-50 text-left transition-colors cursor-pointer font-medium"
                        >
                          <DownloadIcon className="w-4 h-4 text-gray-400" />
                          Download Excel
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 mb-4 flex-shrink-0 bg-gray-50 p-3 py-2.5 rounded-xl border border-gray-100">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-xs font-semibold text-gray-500 whitespace-nowrap">Filter by Date:</span>
                <input
                  type="date"
                  value={modalStartDate}
                  onChange={(e) => setModalStartDate(e.target.value)}
                  className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-[#0085FF] focus:ring-1 focus:ring-[#0085FF] bg-white text-gray-700 cursor-pointer"
                />
                <span className="text-xs text-gray-400">to</span>
                <input
                  type="date"
                  value={modalEndDate}
                  onChange={(e) => setModalEndDate(e.target.value)}
                  className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-[#0085FF] focus:ring-1 focus:ring-[#0085FF] bg-white text-gray-700 cursor-pointer"
                />
              </div>
              {(modalStartDate || modalEndDate) && (
                <button
                  type="button"
                  onClick={() => { setModalStartDate(""); setModalEndDate(""); }}
                  className="text-xs font-bold text-red-600 hover:text-red-700 ml-auto flex items-center gap-1 hover:underline transition-all cursor-pointer"
                >
                  Clear Filter
                </button>
              )}
            </div>

            <h4 className="text-sm font-bold text-gray-800 mb-2 flex-shrink-0">Transactions</h4>

            <div className="flex-1 min-h-0 overflow-y-auto border border-gray-200 rounded-xl bg-white">
              {loadingAccountTransactions ? (
                <div className="w-full h-full flex flex-col items-center justify-center py-16 gap-3">
                  <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs text-gray-400 font-medium">Loading transactions history...</span>
                </div>
              ) : (
                (() => {
                  const accTx = getAccountTransactions(selectedAccountDetail);
                  return (
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-[#F8FAFC] sticky top-0 z-10">
                        <tr>
                          <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                          <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Party</th>
                          <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Type</th>
                          <th className="px-5 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Amount</th>
                          <th className="px-5 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Running Balance</th>
                          <th className="px-5 py-3 text-center text-xs font-bold text-gray-500 tracking-wider">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {accTx.map((tx) => {
                          const isCredit = tx.direction === "IN";
                          if (tx.isOpeningBalance) {
                            return (
                              <tr key={tx._id} className="bg-emerald-50/20 font-semibold border-b border-gray-200">
                                <td className="px-5 py-3.5 text-xs text-gray-400 whitespace-nowrap italic">&mdash;</td>
                                <td className="px-5 py-3.5 text-xs text-gray-900">Opening Balance</td>
                                <td className="px-5 py-3.5 text-xs text-gray-500">Setup Balance</td>
                                <td className="px-5 py-3.5 text-xs text-right text-emerald-600 whitespace-nowrap">
                                  + ₹{Number(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className="px-5 py-3.5 text-xs text-right text-emerald-600 whitespace-nowrap">
                                  ₹{Number(tx.runningBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className="px-5 py-3.5 text-xs text-center whitespace-nowrap">
                                  <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">Initial</span>
                                </td>
                              </tr>
                            );
                          }
                          return (
                            <tr key={tx._id} className="hover:bg-gray-50/50 transition-colors">
                              <td className="px-5 py-3.5 text-xs text-gray-500 whitespace-nowrap">
                                {tx.date ? new Date(tx.date).toLocaleDateString() : ""}
                              </td>
                              <td className="px-5 py-3.5 text-xs font-semibold text-gray-900 truncate max-w-[220px]" title={tx.party}>
                                {tx.party}
                              </td>
                              <td className="px-5 py-3.5 text-xs text-gray-600 whitespace-nowrap">{tx.type}</td>
                              <td className={`px-5 py-3.5 text-xs font-bold text-right whitespace-nowrap ${isCredit ? "text-green-600" : "text-red-600"}`}>
                                {isCredit ? "+" : "-"} ₹{Number(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-5 py-3.5 text-xs font-bold text-right text-gray-900 whitespace-nowrap">
                                ₹{Number(tx.runningBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-5 py-3.5 text-xs text-center whitespace-nowrap">
                                <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold ${isCredit ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                                  {isCredit ? "Got" : "Gave"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                        {accTx.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-5 py-16 text-center text-xs text-gray-400">
                              No transactions found for this account.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Self Transfer Modal — ported from the signatures branch ─────── */}
      {showSelfTransferModal && (() => {
        const selectedFromAcc = transferAccounts.find(a => a.id === selfTransferFromBankId);
        const selectedToAcc = transferAccounts.find(a => a.id === selfTransferToBankId);
        return (
          <>
            <div
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[100000] transition-opacity duration-300"
              style={{ opacity: selfTransferSliding ? 1 : 0 }}
              onClick={handleCloseSelfTransfer}
              aria-hidden="true"
            />
            <div
              className={`fixed dc-panel-card dc-panel-w bg-white shadow-2xl flex flex-col z-[100001] overflow-hidden transform transition-transform duration-300 ease-out ${selfTransferSliding ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"}`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-[#D9D9D9] flex-shrink-0 bg-white gap-1">
                <h2 className="flex items-center gap-2 text-[15px] font-normal leading-6 text-[#78788D] uppercase tracking-wide">
                  <ArrowLeftRight size={18} className="text-[#158FFF]" />
                  Self Transfer Funds
                </h2>
                <button
                  type="button"
                  onClick={handleCloseSelfTransfer}
                  title="Close"
                  className="w-5 h-5 flex items-center justify-center text-[#1C1B1F] hover:opacity-70 transition-opacity"
                  aria-label="Close"
                >
                  <X className="w-[18px] h-[18px]" strokeWidth={2} />
                </button>
              </div>

              <div className="overflow-y-auto flex-1 px-8 py-6">
                <div className="mb-5 flex items-start gap-2.5 bg-amber-50 border border-amber-200 text-amber-800 p-3.5 rounded-xl text-xs leading-relaxed">
                  <svg className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  <div>
                    <span className="font-bold">Important Notice:</span> We aren't actually transferring money. This transfer only affects internal bank balances. It does not change actual bank balances.
                  </div>
                </div>

                <form id="self-transfer-form" onSubmit={handleSelfTransferSubmit} className="space-y-5">

                <div className="relative">
                  <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-1.5">
                    Transfer From
                  </label>
                  <button
                    type="button"
                    onClick={() => { setFromDropdownOpen(!fromDropdownOpen); setToDropdownOpen(false); }}
                    className="w-full h-[38px] px-3 border border-[#1F2937]/10 rounded-full focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-[13px] font-medium text-[#1F2937] cursor-pointer flex items-center justify-between transition-all"
                  >
                    <div className="flex items-center gap-2">
                      {selectedFromAcc ? (
                        <>
                          {selectedFromAcc.type === "bank" ? (
                            <BankLogo bankName={selectedFromAcc.title} size={20} className="rounded overflow-hidden flex-shrink-0" />
                          ) : selectedFromAcc.type === "cash" ? (
                            <div className="w-5 h-5 rounded bg-green-100 flex items-center justify-center flex-shrink-0">
                              <svg className="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                            </div>
                          ) : (
                            <div className="w-5 h-5 rounded bg-gray-100 flex items-center justify-center flex-shrink-0">
                              <Wallet className="w-3 h-3 text-gray-500" />
                            </div>
                          )}
                          <span>{selectedFromAcc.title} {selectedFromAcc.accountNumber ? `(${selectedFromAcc.accountNumber})` : ""}</span>
                        </>
                      ) : (
                        <span className="text-gray-400">Select Account</span>
                      )}
                    </div>
                    <ChevronDown size={16} className="text-gray-400" />
                  </button>

                  {fromDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-[10001]" onClick={() => setFromDropdownOpen(false)} />
                      <div className="absolute left-0 right-0 mt-1.5 max-h-60 overflow-y-auto bg-white border border-gray-100 rounded-2xl shadow-xl py-1 z-[10002] animate-in fade-in slide-in-from-top-1 duration-100">
                        {transferAccounts.map((acc) => (
                          <button
                            key={acc.id}
                            type="button"
                            onClick={() => {
                              setSelfTransferFromBankId(acc.id);
                              setFromDropdownOpen(false);
                              if (acc.id === selfTransferToBankId) {
                                setSelfTransferToBankId("");
                              }
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-gray-50 text-left transition-colors cursor-pointer ${
                              acc.id === selfTransferFromBankId ? "bg-blue-50/50 font-semibold text-[#0085FF]" : "text-gray-700"
                            }`}
                          >
                            {acc.type === "bank" ? (
                              <BankLogo bankName={acc.title} size={20} className="rounded overflow-hidden flex-shrink-0" />
                            ) : acc.type === "cash" ? (
                              <div className="w-5 h-5 rounded bg-green-100 flex items-center justify-center flex-shrink-0">
                                <svg className="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                              </div>
                            ) : (
                              <div className="w-5 h-5 rounded bg-gray-100 flex items-center justify-center flex-shrink-0">
                                <Wallet className="w-3 h-3 text-gray-500" />
                              </div>
                            )}
                            <span className="truncate">{acc.title} {acc.accountNumber ? `(${acc.accountNumber})` : ""}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  {selectedFromAcc && (() => {
                    const isNeg = Number(selectedFromAcc.currentBalance) < 0;
                    return (
                      <p className="text-xs font-semibold text-gray-500 mt-2 ml-1">
                        Available Balance: <span className={`font-bold transition-colors ${isNeg ? "text-red-600" : "text-emerald-600"}`}>₹{Number(selectedFromAcc.currentBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </p>
                    );
                  })()}
                </div>

                <div className="relative">
                  <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-1.5">
                    Transfer To
                  </label>
                  <button
                    type="button"
                    onClick={() => { setToDropdownOpen(!toDropdownOpen); setFromDropdownOpen(false); }}
                    className="w-full h-[38px] px-3 border border-[#1F2937]/10 rounded-full focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-[13px] font-medium text-[#1F2937] cursor-pointer flex items-center justify-between transition-all"
                  >
                    <div className="flex items-center gap-2">
                      {selectedToAcc ? (
                        <>
                          {selectedToAcc.type === "bank" ? (
                            <BankLogo bankName={selectedToAcc.title} size={20} className="rounded overflow-hidden flex-shrink-0" />
                          ) : selectedToAcc.type === "cash" ? (
                            <div className="w-5 h-5 rounded bg-green-100 flex items-center justify-center flex-shrink-0">
                              <svg className="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                            </div>
                          ) : (
                            <div className="w-5 h-5 rounded bg-gray-100 flex items-center justify-center flex-shrink-0">
                              <Wallet className="w-3 h-3 text-gray-500" />
                            </div>
                          )}
                          <span>{selectedToAcc.title} {selectedToAcc.accountNumber ? `(${selectedToAcc.accountNumber})` : ""}</span>
                        </>
                      ) : (
                        <span className="text-gray-400">Select Account</span>
                      )}
                    </div>
                    <ChevronDown size={16} className="text-gray-400" />
                  </button>

                  {toDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-[10001]" onClick={() => setToDropdownOpen(false)} />
                      <div className="absolute left-0 right-0 mt-1.5 max-h-60 overflow-y-auto bg-white border border-gray-100 rounded-2xl shadow-xl py-1 z-[10002] animate-in fade-in slide-in-from-top-1 duration-100">
                        {transferAccounts
                          .filter(acc => acc.id !== selfTransferFromBankId)
                          .map((acc) => (
                            <button
                              key={acc.id}
                              type="button"
                              onClick={() => {
                                setSelfTransferToBankId(acc.id);
                                setToDropdownOpen(false);
                              }}
                              className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-gray-50 text-left transition-colors cursor-pointer ${
                                acc.id === selfTransferToBankId ? "bg-blue-50/50 font-semibold text-[#0085FF]" : "text-gray-700"
                              }`}
                            >
                              {acc.type === "bank" ? (
                                <BankLogo bankName={acc.title} size={20} className="rounded overflow-hidden flex-shrink-0" />
                              ) : acc.type === "cash" ? (
                                <div className="w-5 h-5 rounded bg-green-100 flex items-center justify-center flex-shrink-0">
                                  <svg className="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                </div>
                              ) : (
                                <div className="w-5 h-5 rounded bg-gray-100 flex items-center justify-center flex-shrink-0">
                                  <Wallet className="w-3 h-3 text-gray-500" />
                                </div>
                              )}
                              <span className="truncate">{acc.title} {acc.accountNumber ? `(${acc.accountNumber})` : ""}</span>
                            </button>
                          ))}
                      </div>
                    </>
                  )}

                  {selectedToAcc && (() => {
                    const isNeg = Number(selectedToAcc.currentBalance) < 0;
                    return (
                      <p className="text-xs font-semibold text-gray-500 mt-2 ml-1">
                        Available Balance: <span className={`font-bold transition-colors ${isNeg ? "text-red-600" : "text-emerald-600"}`}>₹{Number(selectedToAcc.currentBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </p>
                    );
                  })()}
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-1.5">
                    Amount (₹)
                  </label>
                  {(() => {
                    const isOverdraft = selectedFromAcc && selfTransferAmount && Number(selfTransferAmount) > Number(selectedFromAcc.currentBalance);
                    return (
                      <input
                        type="number"
                        required
                        min="0.01"
                        step="0.01"
                        placeholder="Enter transfer amount"
                        value={selfTransferAmount}
                        onChange={(e) => setSelfTransferAmount(e.target.value)}
                        className={`w-full h-[38px] px-3 border rounded-full focus:outline-none focus:ring-1 text-[13px] font-bold transition-all ${
                          isOverdraft
                            ? "border-red-500 bg-red-50/10 focus:ring-red-500 text-red-600"
                            : selfTransferAmount
                              ? "border-emerald-300 bg-emerald-50/10 focus:border-emerald-500 focus:ring-emerald-500 text-emerald-600"
                              : "border-[#1F2937]/10 focus:ring-blue-500 text-[#1F2937]"
                        }`}
                      />
                    );
                  })()}
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-1.5">
                    Transfer Date
                  </label>
                  <input
                    type="date"
                    required
                    value={selfTransferDate}
                    onChange={(e) => setSelfTransferDate(e.target.value)}
                    className="w-full h-[38px] px-3 border border-[#1F2937]/10 rounded-full focus:outline-none focus:ring-1 focus:ring-blue-500 text-[13px] text-[#1F2937] cursor-pointer transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-1.5">
                    Notes
                  </label>
                  <input
                    type="text"
                    placeholder="Optional internal notes..."
                    value={selfTransferNotes}
                    onChange={(e) => setSelfTransferNotes(e.target.value)}
                    className="w-full h-[38px] px-3 border border-[#1F2937]/10 rounded-full focus:outline-none focus:ring-1 focus:ring-blue-500 text-[13px] text-[#1F2937] transition-all placeholder:text-[#1F2937] placeholder:opacity-50"
                  />
                </div>

                </form>
              </div>

              {/* Footer */}
              <div className="flex-shrink-0 py-2.5 px-4 border-t border-gray-100 bg-white flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseSelfTransfer}
                  className="px-6 py-2 border border-gray-200 text-gray-700 rounded-[25px] text-sm font-bold hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="self-transfer-form"
                  disabled={loadingSelfTransfer}
                  className="px-6 py-2 bg-[#158FFF] text-white rounded-[25px] text-sm font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {loadingSelfTransfer ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Transferring...
                    </>
                  ) : (
                    "Transfer Funds"
                  )}
                </button>
              </div>
            </div>
          </>
        );
      })()}

      {/* ── Custom Delete Warning Modal ───────────────────────────── */}
      {deleteConfirmState.isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                <DeleteIcon className="w-4 h-4 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Confirm Deletion
                </h3>
                <p className="text-xs text-gray-500">This action cannot be undone.</p>
              </div>
            </div>
            
            <p className="text-sm text-gray-600 mb-6">
              {deleteConfirmState.type === "single" ? (
                <>Are you sure you want to delete this <strong className="text-gray-800">{deleteConfirmState.target?.source?.toLowerCase() || "payment"}</strong> entry?</>
              ) : (
                <>Are you sure you want to delete <strong className="text-gray-800">{deleteConfirmState.target?.length || 0}</strong> selected entry(ies) from the database?</>
              )}
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmState({ isOpen: false, type: "single", target: null })}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const { type, target } = deleteConfirmState;
                  setDeleteConfirmState({ isOpen: false, type: "single", target: null });
                  if (type === "single" && target) {
                    try {
                      await API.delete(`/payments-timeline/${target._id}?source=${encodeURIComponent(target.source)}`);
                      toast.success("Deleted successfully");
                      fetchData();
                    } catch (err) {
                      toast.error("Failed to delete");
                    }
                  } else if (type === "bulk" && Array.isArray(target)) {
                    try {
                      let count = 0;
                      for (const id of target) {
                        const doc = documents.find(d => d._id === id);
                        if (doc) {
                          await API.delete(`/payments-timeline/${doc._id}?source=${encodeURIComponent(doc.source)}`);
                          count++;
                        }
                      }
                      toast.success(`Deleted ${count} entry(ies).`);
                      setSelectedIds([]);
                      fetchData();
                    } catch {
                      toast.error("Failed to delete selected items");
                    }
                  }
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Advanced Filter Panel (same as Companies.jsx) ─────────────── */}
      <AdvancedFilterPanel
        isOpen={showAdvancedFilters}
        onClose={() => setShowAdvancedFilters(false)}
        columns={ALL_COLUMNS}
        filters={activeFilters}
        setFilters={setActiveFilters}
        onApply={(newFilters) => setActiveFilters(newFilters)}
        title="Filter Transactions"
        subtitle="Find specific transactions quickly"
        emptyStateText="Add a rule to narrow down your payments timeline."
      />

      {/* ── Columns panel (same shared component Companies.jsx/Deals.jsx use) ── */}
      <ColumnSettingsPanel
        isOpen={showColumnSettings}
        onClose={() => setShowColumnSettings(false)}
        columns={columns}
        onSave={saveColumns}
        moduleName="Payments Timeline"
      />

      {/* ── Video Tutorial ───────────────────────────────────────────── */}
      <VideoTutorialModal
        isOpen={showVideoTutorial}
        onClose={() => setShowVideoTutorial(false)}
        videoId={getVideoTutorial("paymentsTimeline")?.videoId}
        title={getVideoTutorial("paymentsTimeline")?.title}
      />

      {/* ── Import (Payment records only) ───────────────────────────── */}
      <ImportPayments
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onImportSuccess={() => fetchData()}
      />

      {/* ── Bulk Update ──────────────────────────────────────────────── */}
      <BulkActions
        isOpen={showBulkActions}
        onClose={() => setShowBulkActions(false)}
        selectedItems={documents.filter(doc => selectedIds.includes(doc._id))}
        onBulkUpdate={handleBulkUpdatePayments}
        fieldConfig={paymentFieldConfig}
        module="transactions"
      />
    </div>
  );
}
