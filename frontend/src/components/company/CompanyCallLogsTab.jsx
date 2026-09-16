import DeleteIcon from "../common/DeleteIcon";
import EmptyState from "../common/EmptyState";
import Checkbox from "../common/Checkbox";
import PlusIcon from "../common/PlusIcon";
import AddCallIcon from "../common/AddCallIcon";
import CellphoneIcon from "../common/CellphoneIcon";
import IncomingCallIcon from "../common/IncomingCallIcon";
import OutgoingCallIcon from "../common/OutgoingCallIcon";
import React, { useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { DATE_RANGES, getDateRangeLabel } from "../../utils/dateBuckets";
import { getAncestorZoom } from "../../utils/domUtils";
import { getPinnedBoundaryOverlayStyle } from "../../utils/pinnedColumnShadow";
import {
  ChevronUp,
  ChevronDown,
  Pin,
  PinOff,
  EyeOff,
  X,
  Clock,
  Table2,
  List as ListIcon,
  User, ArrowUp, ArrowDown } from "lucide-react";
import { EditablePaginationButtons } from "../common/EditablePaginationButtons";
import toast from "react-hot-toast";
import API from "../../services/api";
import CallLogForm from "./CallLogForm";
import CallLogDetailView from "./CallLogDetailView";
import FilterIcon from "../common/FilterIcon";
import HighlightText from "../common/HighlightText";
import CompanyFilterPanel from "./CompanyFilterPanel";
import { applyColumnFilters } from "../../utils/advancedFilters";
import TableSkeletonRows from "../common/TableSkeletonRows";
import Skeleton from "../common/Skeleton";
import StatTile from "../common/StatTile";
import StatTileSkeleton from "../common/StatTileSkeleton";
import BulkActionBar from "../common/BulkActionBar";
import { useBulkSelection, useBulkStrip } from "../../hooks/useBulkSelection";
import { exportToCSV } from "../../utils/exportToCSV";
import { bulkDelete } from "../../utils/bulkOperations";
import useFillToBottom from "../../hooks/useFillToBottom";
import AppToaster from "../AppToaster";
import SearchIcon from "../common/SearchIcon";
import EyeIcon from "../common/EyeIcon";
import EditIcon from "../common/EditIcon";

const CALL_TYPE_LABELS = { Outbound: "Outbound", Inbound: "Inbound" };
const CALL_STATUS_LABELS = {
  Connected: "Connected",
  Missed: "Missed",
  Voicemail: "Voicemail",
  "No Answer": "No Answer",
};
const CALL_LOG_FILTER_COLUMNS = [
  { key: "callType", label: "Type", options: Object.values(CALL_TYPE_LABELS) },
  { key: "status", label: "Status", options: Object.values(CALL_STATUS_LABELS) },
  { key: "dateTime", label: "Date & Time", options: DATE_RANGES.map((r) => r.label) },
];

const stripHtml = (html) => (html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

const MoreVertIcon = ({ size = 20, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M10 5.83333C10.9167 5.83333 11.6667 5.08333 11.6667 4.16667C11.6667 3.25 10.9167 2.5 10 2.5C9.08333 2.5 8.33333 3.25 8.33333 4.16667C8.33333 5.08333 9.08333 5.83333 10 5.83333ZM10 8.33333C9.08333 8.33333 8.33333 9.08333 8.33333 10C8.33333 10.9167 9.08333 11.6667 10 11.6667C10.9167 11.6667 11.6667 10.9167 11.6667 10C11.6667 9.08333 10.9167 8.33333 10 8.33333ZM10 14.1667C9.08333 14.1667 8.33333 14.9167 8.33333 15.8333C8.33333 16.75 9.08333 17.5 10 17.5C10.9167 17.5 11.6667 16.75 11.6667 15.8333C11.6667 14.9167 10.9167 14.1667 10 14.1667Z" fill="#1C1B1F" />
  </svg>
);

{/* Scaled to 80% of the requested size: these are solid-filled glyphs, so at
    the same pixel box as the thin-stroke lucide Clock icon next to them they
    read visibly heavier/bigger. Sizing down compensates for that optical
    weight difference and keeps the stat row's four icons looking uniform. */}
const TotalCallsIcon = ({ size = 20, ...props }) => <CellphoneIcon className="" style={{ width: size * 0.8, height: size * 0.8 }} {...props} />;
const ConnectedCallsIcon = ({ size = 20, ...props }) => <IncomingCallIcon className="" style={{ width: size * 0.8, height: size * 0.8 }} {...props} />;
const MissedCallsIcon = ({ size = 20, ...props }) => <OutgoingCallIcon className="" style={{ width: size * 0.8, height: size * 0.8 }} {...props} />;
const TalkTimeIcon = ({ size = 20, ...props }) => <Clock size={size} strokeWidth={1.5} {...props} />;

// Also drives the contact profile's Call Logs tab: pass `contactId` instead of
// `companyId` and it scopes itself to that contact. Same table, filters, bulk
// strip and detail view either way — the two pages were never meant to differ.
const CompanyCallLogsTab = ({ companyId, contactId, callLogs = [], setCallLogs, showStats = true, isLoading = false, pendingCreate, onPendingCreateConsumed }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const {
    containerRef: fillContainerRef,
    footerRef: fillFooterRef,
    style: fillStyle,
  } = useFillToBottom();
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showBulkStatusModal, setShowBulkStatusModal] = useState(false);
  const [bulkStatusValue, setBulkStatusValue] = useState("");
  const [viewMode, setViewMode] = useState("table");
  const [showForm, setShowForm] = useState(false);
  const [editLog, setEditLog] = useState(null);
  const [selectedLog, setSelectedLog] = useState(null);
  const [logDetailsOpen, setLogDetailsOpen] = useState(false);
  const [openRowActionsId, setOpenRowActionsId] = useState(null);
  const [rowActionsPos, setRowActionsPos] = useState(null);
  const rowActionsRef = useRef(null);
  const [logToDelete, setLogToDelete] = useState(null);
  const [deletingLog, setDeletingLog] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState(new Set());
  const [leftPinned, setLeftPinned] = useState(new Set());
  const [rightPinned, setRightPinned] = useState(new Set());
  const [openColumnMenuKey, setOpenColumnMenuKey] = useState(null);
  const [columnMenuPos, setColumnMenuPos] = useState(null);
  const columnMenuRef = useRef(null);
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  useEffect(() => {
    if (pendingCreate === "call") {
      setShowForm(true);
      if (onPendingCreateConsumed) onPendingCreateConsumed();
    }
  }, [pendingCreate, onPendingCreateConsumed]);

  const BASE_COLUMNS = useMemo(() => [
    { id: "purpose", label: "Purpose", pinnable: true, firstCol: true },
    { id: "callType", label: "Type", pinnable: true },
    { id: "status", label: "Status", pinnable: true },
    { id: "duration", label: "Duration", pinnable: true },
    { id: "notes", label: "Notes", pinnable: true },
    { id: "user", label: "Logged By", pinnable: true },
    { id: "dateTime", label: "Date & Time", pinnable: true },
  ], []);

  const [columnOrder, setColumnOrder] = useState(() => BASE_COLUMNS.map((c) => c.id));
  const [draggedColKey, setDraggedColKey] = useState(null);
  const [dragOverColKey, setDragOverColKey] = useState(null);
  const [dragGhost, setDragGhost] = useState(null);
  const dragOverRef = useRef(null);
  const ghostElRef = useRef(null);

  const orderedColumns = useMemo(() => {
    const sortedBase = [...BASE_COLUMNS].sort((a, b) => columnOrder.indexOf(a.id) - columnOrder.indexOf(b.id));
    const visible = sortedBase.filter((c) => !hiddenColumns.has(c.id));
    const left = visible.filter((c) => leftPinned.has(c.id));
    const right = visible.filter((c) => rightPinned.has(c.id));
    const unpinned = visible.filter((c) => !leftPinned.has(c.id) && !rightPinned.has(c.id));
    return [...left, ...unpinned, ...right];
  }, [BASE_COLUMNS, hiddenColumns, leftPinned, rightPinned, columnOrder]);

  const pinColumnToSide = (colId, side) => {
    if (side === "left") {
      setLeftPinned((prev) => new Set(prev).add(colId));
      setRightPinned((prev) => { const next = new Set(prev); next.delete(colId); return next; });
    } else {
      setRightPinned((prev) => new Set(prev).add(colId));
      setLeftPinned((prev) => { const next = new Set(prev); next.delete(colId); return next; });
    }
  };

  const unpinColumn = (colId) => {
    setLeftPinned((prev) => { const next = new Set(prev); next.delete(colId); return next; });
    setRightPinned((prev) => { const next = new Set(prev); next.delete(colId); return next; });
  };

  const toggleHideColumn = (colId) => {
    setHiddenColumns((prev) => { const next = new Set(prev); next.add(colId); return next; });
  };

  const getColumnPinSide = (colId) => {
    if (leftPinned.has(colId)) return "left";
    if (rightPinned.has(colId)) return "right";
    return null;
  };

  const startColumnDrag = (e, colId) => {
    if (e.button !== 0) return;
    if (e.target.closest("button") || e.target.closest("[data-resize-handle]")) return;

    const th = e.currentTarget;
    const startX = e.clientX;
    const startY = e.clientY;
    const DRAG_THRESHOLD = 5;
    let dragStarted = false;
    let positionGhost = () => {};

    const beginDrag = () => {
      dragStarted = true;
      e.preventDefault();
      window.getSelection?.()?.removeAllRanges();
      const rect = th.getBoundingClientRect();
      const label = BASE_COLUMNS.find((vc) => vc.id === colId)?.label || colId;

      const previewRows = (callLogs || []).slice(0, 10).map((log) => {
        let val = getCallLogFieldValue(log, colId);
        if (typeof val === "object" && val !== null) val = val?.name || "";
        return String(val ?? "").trim() || "—";
      });

      const zGhost = getAncestorZoom(document.body);
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;

      dragOverRef.current = null;
      setDraggedColKey(colId);
      setDragOverColKey(null);
      document.body.style.userSelect = "none";

      setDragGhost({
        label,
        previewRows,
        offsetX,
        offsetY,
        width: rect.width / zGhost,
        height: rect.height / zGhost,
      });

      positionGhost = (clientX, clientY) => {
        const el = ghostElRef.current;
        if (!el) return;
        const visualTop = clientY - offsetY;
        const visualLeft = clientX - offsetX;
        el.style.top = `${visualTop / zGhost}px`;
        el.style.left = `${visualLeft / zGhost}px`;
        el.style.maxHeight = `${Math.max(100, window.innerHeight - visualTop - 72) / zGhost}px`;
      };
      requestAnimationFrame(() => positionGhost(startX, startY));
    };

    const handleMouseMove = (moveEvent) => {
      if (!dragStarted) {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        beginDrag();
      }
      positionGhost(moveEvent.clientX, moveEvent.clientY);
      const elAtPoint = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
      const thAtPoint = elAtPoint?.closest("th[data-col-id]");
      const overKey = thAtPoint?.getAttribute("data-col-id") || null;
      if (dragOverRef.current !== overKey) {
        dragOverRef.current = overKey;
        setDragOverColKey(overKey);
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      if (!dragStarted) return;
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
    setColumnOrder((prev) => {
      const newOrder = [...prev];
      const draggedIdx = newOrder.indexOf(draggedKey);
      const targetIdx = newOrder.indexOf(targetKey);
      if (draggedIdx === -1 || targetIdx === -1) return prev;
      newOrder.splice(draggedIdx, 1);
      newOrder.splice(targetIdx, 0, draggedKey);
      return newOrder;
    });
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (columnMenuRef.current && !columnMenuRef.current.contains(e.target)) {
        setOpenColumnMenuKey(null);
        setColumnMenuPos(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [colWidths, setColWidths] = useState({
    purpose: 220,
    callType: 130,
    status: 150,
    duration: 110,
    notes: 220,
    user: 160,
    dateTime: 190,
  });
  const [resizingCol, setResizingCol] = useState(null);
  const resizingRef = useRef(null);
  const totalTableWidth = useMemo(
    () => Object.values(colWidths).reduce((sum, w) => sum + w, 0),
    [colWidths],
  );

  const stickyStyles = useMemo(() => {
    const map = {};
    let leftOffset = 44;
    for (const col of orderedColumns) {
      if (leftPinned.has(col.id)) {
        map[col.id] = { position: "sticky", left: leftOffset, zIndex: 20, backgroundColor: "#fff" };
        leftOffset += colWidths[col.id] || 200;
      }
    }
    let rightOffset = 0;
    for (const col of [...orderedColumns].reverse()) {
      if (rightPinned.has(col.id)) {
        map[col.id] = { position: "sticky", right: rightOffset, zIndex: 20, backgroundColor: "#fff" };
        rightOffset += colWidths[col.id] || 200;
      }
    }
    return map;
  }, [orderedColumns, leftPinned, rightPinned, colWidths]);

  const getStickyStyle = (colId, isHeader = false, isSelected = false) => {
    const isPinned = leftPinned.has(colId) || rightPinned.has(colId);
    const style = stickyStyles[colId] || {};
    return {
      ...style,
      position: isPinned ? "sticky" : "relative",
      zIndex: isPinned ? (isHeader ? 35 : 20) : undefined,
      backgroundColor: isPinned ? (isHeader ? "#F5F7FA" : (isSelected ? "#EFF6FF" : "#fff")) : undefined,
      boxShadow: "inset -1px 0 0 #E1E4EA, inset 0 -1px 0 #E1E4EA",
    };
  };

  const getBoundaryShadowSide = (colId) => {
    const leftPinnedCols = orderedColumns.filter((c) => leftPinned.has(c.id));
    const rightPinnedCols = orderedColumns.filter((c) => rightPinned.has(c.id));
    if (leftPinnedCols.length > 0 && leftPinnedCols[leftPinnedCols.length - 1].id === colId) return "left";
    if (rightPinnedCols.length > 0 && rightPinnedCols[0].id === colId) return "right";
    return null;
  };

  const togglePinColumn = (colId) => {
    if (getColumnPinSide(colId)) unpinColumn(colId);
    else pinColumnToSide(colId, "left");
  };

  const startResize = (e, colId) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { colId, startX: e.clientX, startWidth: colWidths[colId] };
    setResizingCol(colId);

    const onMouseMove = (moveEvent) => {
      if (!resizingRef.current) return;
      const { colId: id, startX, startWidth } = resizingRef.current;
      const newWidth = Math.max(60, startWidth + (moveEvent.clientX - startX));
      setColWidths((prev) => ({ ...prev, [id]: newWidth }));
    };

    const onMouseUp = () => {
      resizingRef.current = null;
      setResizingCol(null);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const refetchCallLogs = async () => {
    try {
      const res = await API.get(
        contactId
          ? `/call-logs/contact/${contactId}`
          : `/call-logs/company/${companyId}`,
      );
      setCallLogs?.(res.data || []);
    } catch (err) {
      console.error("Failed to refetch call logs:", err);
    }
  };

  const handleDelete = async (id) => {
    try {
      await API.delete(`/call-logs/${id}`);
      setCallLogs?.((prev) => prev.filter((l) => l._id !== id));
      toast.success("Call log deleted");
    } catch (err) {
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || "Failed to delete call log.");
      }
      throw err;
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!logToDelete) return;
    setDeletingLog(true);
    try {
      await handleDelete(logToDelete._id);
      setLogToDelete(null);
    } catch {
      // handleDelete already surfaced a toast for the failure.
    } finally {
      setDeletingLog(false);
    }
  };

  const handleEdit = (log) => {
    setLogDetailsOpen(false);
    setEditLog(log);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditLog(null);
  };

  const handleFormSuccess = (savedLog) => {
    if (editLog) {
      setCallLogs?.((prev) => prev.map((l) => (l._id === savedLog._id ? savedLog : l)));
    } else {
      setCallLogs?.((prev) => [savedLog, ...prev]);
    }
  };

  const handleLogClick = (log) => {
    setSelectedLog(log);
    setLogDetailsOpen(true);
  };

  const handleLogDeleteRequest = (log) => {
    setLogDetailsOpen(false);
    setLogToDelete(log);
  };

  const [sortConfig, setSortConfig] = useState({ key: null, direction: null });
  const handleSort = (key, direction) => {
    if (direction) {
      setSortConfig((prev) =>
        prev.key === key && prev.direction === direction
          ? { key: null, direction: null }
          : { key, direction },
      );
      return;
    }
    setSortConfig((prev) => {
      if (prev.key !== key) return { key, direction: "asc" };
      if (prev.direction === "asc") return { key, direction: "desc" };
      return { key: null, direction: null };
    });
  };
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState({});

  const getCallLogFieldValue = (log, key) => {
    switch (key) {
      case "purpose":
        return log.purpose || "Phone Call";
      case "callType":
        return CALL_TYPE_LABELS[log.callType] || log.callType || "Outbound";
      case "status":
        return CALL_STATUS_LABELS[log.status] || log.status || "Connected";
      case "duration":
        return log.duration || 0;
      case "notes":
        return stripHtml(log.notes);
      case "user":
        return typeof log.user === "object" ? log.user?.name || "" : "";
      case "dateTime":
        return getDateRangeLabel(log.createdAt);
      default:
        return log[key];
    }
  };

  const getCallLogSearchText = (log) => {
    const parts = BASE_COLUMNS.map((c) => getCallLogFieldValue(log, c.id));
    if (log.createdAt) {
      const d = new Date(log.createdAt);
      parts.push(d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" }));
      parts.push(d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
    }
    if (log.duration) parts.push(`${Math.floor(log.duration / 60)}m ${log.duration % 60}s`);
    return parts.filter((v) => v !== null && v !== undefined && v !== "").join(" ").toLowerCase();
  };

  const filteredLogs = useMemo(() => {
    let result = callLogs;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter((l) => getCallLogSearchText(l).includes(q));
    }
    return applyColumnFilters(result, selectedFilters, getCallLogFieldValue);
  }, [callLogs, searchTerm, selectedFilters]);

  const sortedLogs = useMemo(() => {
    if (!sortConfig.key) return filteredLogs;
    return [...filteredLogs].sort((a, b) => {
      let aVal = getCallLogFieldValue(a, sortConfig.key);
      let bVal = getCallLogFieldValue(b, sortConfig.key);
      if (sortConfig.key === "dateTime") {
        aVal = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        bVal = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      }
      const aCmp = typeof aVal === "number" ? aVal : (aVal || "").toString().toLowerCase();
      const bCmp = typeof bVal === "number" ? bVal : (bVal || "").toString().toLowerCase();
      if (aCmp < bCmp) return sortConfig.direction === "asc" ? -1 : 1;
      if (aCmp > bCmp) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredLogs, sortConfig]);

  const { selectedItems, toggleItem, clearSelection, selectAll } = useBulkSelection({
    items: filteredLogs,
    onDelete: () => setShowBulkDeleteModal(true),
  });

  const { visible: bulkStripVisible, closing: bulkStripClosing } = useBulkStrip(selectedItems.length);

  const [listPage, setListPage] = useState(1);
  const [listLimit, setListLimit] = useState(10);

  const listTotalCount = filteredLogs.length;
  const listTotalPages = Math.max(1, Math.ceil(listTotalCount / listLimit));
  const listStartItem = listTotalCount === 0 ? 0 : (listPage - 1) * listLimit + 1;
  const listEndItem = Math.min(listPage * listLimit, listTotalCount);
  const hasListPrevPage = listPage > 1;
  const hasListNextPage = listPage < listTotalPages;

  const handleListPageChange = (page) => {
    if (page < 1 || page > listTotalPages) return;
    setListPage(page);
  };

  const handleExportSelected = () => {
    const dataToExport = callLogs.filter((l) => selectedItems.includes(l._id)).map((l) => ({
      Purpose: l.purpose || "Phone Call",
      Type: CALL_TYPE_LABELS[l.callType] || l.callType || "Outbound",
      Status: CALL_STATUS_LABELS[l.status] || l.status || "Connected",
      Duration: l.duration ? `${Math.floor(l.duration / 60)}m ${l.duration % 60}s` : "",
      "Logged By": typeof l.user === "object" ? l.user?.name || "" : "",
      "Date & Time": l.createdAt ? new Date(l.createdAt).toLocaleString() : "",
    }));
    const headers = Object.keys(dataToExport[0] || {}).join(",");
    const rows = dataToExport.map((row) => Object.values(row).map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    exportToCSV([headers, ...rows], `call_logs_export_${new Date().toISOString().split("T")[0]}.csv`);
  };

  const handleBulkDelete = async () => {
    setBulkActionLoading(true);
    try {
      await bulkDelete("call-logs", selectedItems);
      await refetchCallLogs();
      toast.success(`${selectedItems.length} call log(s) deleted`);
      clearSelection();
      setShowBulkDeleteModal(false);
    } catch (error) {
      console.error("Bulk delete failed:", error);
      toast.error("Failed to delete call logs");
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkUpdateStatus = async () => {
    if (!bulkStatusValue) return;
    setBulkActionLoading(true);
    try {
      await Promise.all(selectedItems.map((id) => API.put(`/call-logs/${id}`, { status: bulkStatusValue })));
      await refetchCallLogs();
      toast.success(`Status updated for ${selectedItems.length} call log(s)`);
      clearSelection();
      setShowBulkStatusModal(false);
    } catch (error) {
      console.error("Bulk update failed:", error);
      toast.error("Failed to update call logs");
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleSelectAllAcrossPages = () => selectAll(filteredLogs);

  const handleListLimitChange = (newLimit) => {
    setListLimit(newLimit);
    setListPage(1);
  };

  const getListPageNumbers = () => {
    const items = [1];
    if (listPage > 2) items.push("left-dots");
    if (listPage !== 1 && listPage !== listTotalPages) items.push(listPage);
    if (listPage < listTotalPages - 1) items.push("right-dots");
    if (listTotalPages > 1) items.push(listTotalPages);
    return items;
  };

  const paginatedLogs = useMemo(
    () => sortedLogs.slice((listPage - 1) * listLimit, listPage * listLimit),
    [sortedLogs, listPage, listLimit],
  );

  const total = callLogs.length;
  const connected = callLogs.filter((l) => l.status === "Connected").length;
  const missed = callLogs.filter((l) => l.status === "Missed" || l.status === "No Answer").length;
  const totalTalkTimeSecs = callLogs.reduce((sum, l) => sum + (l.duration || 0), 0);
  const talkTimeLabel = totalTalkTimeSecs
    ? `${Math.floor(totalTalkTimeSecs / 3600)}h ${Math.floor((totalTalkTimeSecs % 3600) / 60)}m`
    : "0m";

  const kpiTiles = [
    { label: "Total Calls", value: total, icon: TotalCallsIcon, subtitle: "All Time", subtitleClass: "text-gray-400" },
    { label: "Connected", value: connected, icon: ConnectedCallsIcon, subtitle: total ? `${Math.round((connected / total) * 100)}% Connect Rate` : "—", subtitleClass: "text-green-600" },
    { label: "Missed / No Answer", value: missed, icon: MissedCallsIcon, subtitle: null },
    { label: "Total Talk Time", value: talkTimeLabel, icon: TalkTimeIcon, valueSmall: true },
  ];

  return (
    <div>
      <AppToaster />

      {showStats && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <StatTileSkeleton key={i} />)
            ) : (
              kpiTiles.map((tile) => (
                <StatTile key={tile.label} tile={tile} />
              ))
            )}
          </div>
          <div className="-mx-6" style={{ marginTop: 24, paddingBottom: 24, borderTop: "1px solid #E1E4EA" }} />
        </>
      )}

      {/* Search + Controls */}
      {isLoading ? (
        <div className="flex items-center gap-4 mb-4" style={{ height: "44px" }}>
          <Skeleton height={44} shape="rect" className="flex-1 rounded-full" />
          <Skeleton height={44} width={96} shape="rect" className="rounded-full flex-shrink-0" />
          <Skeleton height={44} width={44} shape="circle" className="flex-shrink-0" />
        </div>
      ) : bulkStripVisible ? (
        <BulkActionBar
          isClosing={bulkStripClosing}
          selectedCount={selectedItems.length}
          entityName="call"
          onSelectAll={handleSelectAllAcrossPages}
          onDeselectAll={clearSelection}
          onExport={handleExportSelected}
          onUpdateStatus={() => setShowBulkStatusModal(true)}
          onDelete={() => setShowBulkDeleteModal(true)}
          onCancel={clearSelection}
        />
      ) : (
        <div className="flex items-center gap-4 mb-4" style={{ height: "44px" }}>
          <div className="relative flex-1 h-full">
            <SearchIcon className="absolute left-3.5 -translate-y-1/2 top-1/2 w-4 h-4 text-[#525866]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search calls by purpose, type, or notes..."
              className="w-full h-full pl-11 pr-3.5 border border-[rgba(31,41,55,0.1)] rounded-full text-sm focus:outline-none focus:border-[#0085FF]"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-900 focus:outline-none"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilterPanel(true)}
            className="relative flex items-center justify-center gap-2 px-3 text-sm font-medium text-gray-800 bg-white border rounded-full hover:bg-gray-50 flex-shrink-0"
            style={{ height: "44px", borderColor: Object.values(selectedFilters).flat().length > 0 ? "#0085FF" : "#E1E4EA" }}
          >
            <FilterIcon size={16} />
            Filter
            {Object.values(selectedFilters).flat().length > 0 && (
              <span className="absolute -top-2 -right-2 bg-blue-600 text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full ring-2 ring-white">
                {Object.values(selectedFilters).flat().length}
              </span>
            )}
          </button>
          <div className="relative flex items-center gap-1.5 p-1 bg-[#F1F1F5] rounded-full flex-shrink-0 overflow-hidden" style={{ height: "44px" }}>
            <span
              className="absolute top-1 w-9 h-9 rounded-full bg-white shadow-[0px_0px_6px_rgba(0,0,0,0.1)] transition-all duration-300 ease-out pointer-events-none"
              style={{ left: viewMode === "table" ? 46 : 4 }}
            />
            <button
              onClick={() => setViewMode("card")}
              title="Card view"
              className={`relative z-10 w-9 h-9 flex items-center justify-center rounded-full transition-colors ${viewMode === "card" ? "text-[#0085FF]" : "text-gray-500 hover:text-gray-700"}`}
            >
              <ListIcon size={16} />
            </button>
            <button
              onClick={() => setViewMode("table")}
              title="Table view"
              className={`relative z-10 w-9 h-9 flex items-center justify-center rounded-full transition-colors ${viewMode === "table" ? "text-[#0085FF]" : "text-gray-500 hover:text-gray-700"}`}
            >
              <Table2 size={16} />
            </button>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center justify-center rounded-full border hover:bg-gray-50 flex-shrink-0"
            style={{ width: "44px", height: "44px", borderColor: "#E1E4EA" }}
            title="New Call"
          >
            <AddCallIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Call Log Form */}
      {showForm && (
        <CallLogForm
          companyId={companyId}
          contactId={contactId}
          editLog={editLog}
          isOpen={showForm}
          onClose={handleCloseForm}
          onSuccess={handleFormSuccess}
          userId={user.id}
        />
      )}

      {/* Call Log Detail View */}
      <CallLogDetailView
        open={logDetailsOpen}
        log={selectedLog}
        onClose={() => setLogDetailsOpen(false)}
        onEdit={handleEdit}
        onDelete={handleLogDeleteRequest}
      />

      {/* Call log table or empty state */}
      {!isLoading && callLogs.length === 0 ? (
        <div className="flex items-center justify-center w-full min-h-[300px] bg-white border border-[#E1E4EA] rounded-xl">
          <EmptyState icon={CellphoneIcon} noun="Call log" onCreate={() => setShowForm(true)} />
        </div>
      ) : viewMode === "card" ? (
        <div className="space-y-3">
          {paginatedLogs.length === 0 ? (
            <div className="bg-white rounded-lg border border-[#E1E4EA]">
              <EmptyState icon={CellphoneIcon} noun="Call log" isFiltered />
            </div>
          ) : (
            paginatedLogs.map((log) => {
              const CallTypeIcon = log.callType === "Inbound" ? IncomingCallIcon : OutgoingCallIcon;
              const loggedBy = typeof log.user === "object" ? log.user : null;
              const isSelected = selectedItems.includes(log._id);
              return (
                <div
                  key={log._id}
                  className={`bg-white rounded-lg border p-3 hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer ${isSelected ? "border-blue-300 bg-blue-50" : "border-gray-200"}`}
                  onClick={() => handleLogClick(log)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="p-1.5 rounded bg-gray-100 flex-shrink-0">
                        <CallTypeIcon className="w-3 h-3 text-gray-600" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-medium text-gray-900 truncate">
                          <HighlightText text={log.purpose || "Phone Call"} query={searchTerm} />
                        </h3>
                        <p className="text-xs text-gray-500">
                          {log.createdAt ? new Date(log.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleEdit(log)}
                        className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                        title="Edit call"
                      >
                        <EditIcon className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setLogToDelete(log)}
                        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                        title="Delete call"
                      >
                        <DeleteIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span
                        className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded"
                        style={{
                          backgroundColor: log.status === "Connected" ? "rgba(0, 201, 80, 0.1)" : log.status === "Missed" ? "rgba(251, 55, 72, 0.1)" : "rgba(107, 114, 128, 0.1)",
                          color: log.status === "Connected" ? "#00C950" : log.status === "Missed" ? "#FB3748" : "#6B7280",
                        }}
                      >
                        <HighlightText text={CALL_STATUS_LABELS[log.status] || log.status || "Connected"} query={searchTerm} />
                      </span>
                      <div className="flex items-center text-xs text-gray-600">
                        <Clock className="w-3 h-3 mr-1" />
                        {log.duration ? `${Math.floor(log.duration / 60)}m ${log.duration % 60}s` : "—"}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <User className="w-3 h-3 text-gray-400" />
                      <span className="text-xs text-gray-700">
                        <HighlightText text={loggedBy?.name || "Unknown"} query={searchTerm} />
                      </span>
                    </div>

                    {stripHtml(log.notes) && (
                      <div className="bg-gray-50 rounded p-2">
                        <p className="text-xs text-gray-700 line-clamp-2">
                          <HighlightText text={stripHtml(log.notes)} query={searchTerm} />
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div
          ref={fillContainerRef}
          className="relative bg-white border border-[#E1E4EA] rounded-lg overflow-x-auto overflow-y-auto"
          style={fillStyle}
        >
          <table className="w-full border-separate border-spacing-0 text-left" style={{ tableLayout: "fixed", minWidth: totalTableWidth }}>
            <thead className="sticky top-0 z-30 bg-[#F5F7FA] border-b border-[#E1E4EA]">
              <tr>
                <th
                  style={{
                    width: 44,
                    height: 56,
                    position: "sticky",
                    left: 0,
                    zIndex: 35,
                    backgroundColor: "#F5F7FA",
                    boxShadow: "inset -1px 0 0 #E1E4EA, inset 0 -1px 0 #E1E4EA",
                  }}
                  className="px-3 py-2.5"
                >
                  <div className="flex justify-center items-center w-full">
                    <Checkbox checked={selectedItems.length > 0 && selectedItems.length === paginatedLogs.length} onChange={(e) => (e.target.checked ? selectAll(paginatedLogs) : clearSelection())}  uncheckedColor="text-[#525866]"/>
                  </div>
                </th>
                {orderedColumns.map((col) => {
                  const isDragging = draggedColKey === col.id;
                  const isDragOver = dragOverColKey === col.id && draggedColKey && draggedColKey !== col.id;
                  const boundarySide = getBoundaryShadowSide(col.id);
                  return (
                    <th
                      key={col.id}
                      data-col-id={col.id}
                      onMouseDown={(e) => startColumnDrag(e, col.id)}
                      style={{ width: colWidths[col.id], height: 56, opacity: isDragging ? 0.35 : 1, ...getStickyStyle(col.id, true) }}
                      className={`py-2.5 font-medium text-[#525252] text-xs cursor-grab active:cursor-grabbing bg-[#F5F7FA] ${col.firstCol ? "pl-6 pr-3" : "px-3"} ${isDragOver ? "bg-blue-100" : "hover:bg-gray-100"}`}
                    >
                      <div className={`flex items-center justify-between w-full ${isLoading ? "[&_button]:invisible" : ""}`}>
                        <div
                          className="relative flex items-center justify-start flex-1 group cursor-pointer select-none min-w-0"
                          onDoubleClick={() => togglePinColumn(col.id)}
                        >
                          <div className="flex items-center gap-1.5 flex-1 overflow-hidden">
                            {isLoading ? (
                              <Skeleton width="65%" height={12} />
                            ) : (
                              <div className="flex items-center gap-1.5 min-w-0 truncate">
                                <span className="truncate flex-1 min-w-0" title={col.label}>{col.label}</span>
                                {sortConfig.key === col.id && (sortConfig.direction === "asc"
                                  ? <ArrowUp className="w-3 h-3 text-[#0085FF] flex-shrink-0" />
                                  : <ArrowDown className="w-3 h-3 text-[#0085FF] flex-shrink-0" />)}
                                {(leftPinned.has(col.id) || rightPinned.has(col.id)) && (
                                  <Pin size={12} className="text-blue-500 fill-blue-500 flex-shrink-0 ml-1" style={{ transform: "rotate(45deg)" }} />
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (openColumnMenuKey === col.id) {
                              setOpenColumnMenuKey(null);
                              setColumnMenuPos(null);
                              return;
                            }
                            const zMenu = getAncestorZoom(document.body);
                            const MENU_W = 190;
                            const rect = e.currentTarget.getBoundingClientRect();
                            let calculatedLeft = rect.right / zMenu - MENU_W;
                            calculatedLeft = Math.min(calculatedLeft, window.innerWidth / zMenu - MENU_W - 8);
                            calculatedLeft = Math.max(calculatedLeft, 8);
                            setColumnMenuPos({ top: rect.bottom / zMenu + 4, left: calculatedLeft });
                            setOpenColumnMenuKey(col.id);
                          }}
                          className="ml-1 p-1 rounded hover:bg-gray-200 transition-colors text-gray-500 flex-shrink-0"
                          title="Column options"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>

                        {openColumnMenuKey === col.id && columnMenuPos && createPortal(
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
                                  getColumnPinSide(col.id) === "left" ? unpinColumn(col.id) : pinColumnToSide(col.id, "left");
                                }}
                                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${getColumnPinSide(col.id) === "left" ? "bg-blue-50 text-blue-700" : "text-[#161618] hover:bg-gray-50"}`}
                              >
                                {getColumnPinSide(col.id) === "left" ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5 text-[#1C1B1F]" />}
                                Pin to Left
                              </button>
                              <button
                                onClick={() => {
                                  setOpenColumnMenuKey(null);
                                  setColumnMenuPos(null);
                                  getColumnPinSide(col.id) === "right" ? unpinColumn(col.id) : pinColumnToSide(col.id, "right");
                                }}
                                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${getColumnPinSide(col.id) === "right" ? "bg-blue-50 text-blue-700" : "text-[#161618] hover:bg-gray-50"}`}
                              >
                                {getColumnPinSide(col.id) === "right" ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5 text-[#1C1B1F]" />}
                                Pin to Right
                              </button>
                              <button
                                onClick={() => {
                                  setOpenColumnMenuKey(null);
                                  setColumnMenuPos(null);
                                  handleSort(col.id, "asc");
                                  setListPage(1);
                                }}
                                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${sortConfig.key === col.id && sortConfig.direction === "asc" ? "bg-blue-50 text-blue-700 font-medium" : "text-[#161618] hover:bg-gray-50"}`}
                              >
                                <ChevronUp className="w-3.5 h-3.5 text-[#1C1B1F]" />
                                Sort Ascending
                              </button>
                              <button
                                onClick={() => {
                                  setOpenColumnMenuKey(null);
                                  setColumnMenuPos(null);
                                  handleSort(col.id, "desc");
                                  setListPage(1);
                                }}
                                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${sortConfig.key === col.id && sortConfig.direction === "desc" ? "bg-blue-50 text-blue-700 font-medium" : "text-[#161618] hover:bg-gray-50"}`}
                              >
                                <ChevronDown className="w-3.5 h-3.5 text-[#1C1B1F]" />
                                Sort Descending
                              </button>
                              <div className="w-full border-t border-[#F1F1F5] my-0.5" />
                              <button
                                onClick={() => {
                                  setOpenColumnMenuKey(null);
                                  setColumnMenuPos(null);
                                  toggleHideColumn(col.id);
                                }}
                                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap text-[#161618] hover:bg-gray-50"
                              >
                                <EyeOff className="w-3.5 h-3.5 text-[#1C1B1F]" />
                                Hide Column
                              </button>
                            </div>
                          </>,
                          document.body,
                        )}
                      </div>
                      <div
                        data-resize-handle="true"
                        onMouseDown={(e) => startResize(e, col.id)}
                        className={`absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none hover:bg-blue-400 z-10 ${resizingCol === col.id ? "bg-blue-500" : "bg-transparent"}`}
                      />
                      {boundarySide && <div style={getPinnedBoundaryOverlayStyle(boundarySide)} />}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="bg-white">
              {isLoading ? (
                <TableSkeletonRows columns={orderedColumns.map((c) => colWidths[c.id])} hasCheckbox numRows={listLimit} rowHeight={54} />
              ) : paginatedLogs.length === 0 ? (
                <tr>
                  <td colSpan={orderedColumns.length + 1}>
  <EmptyState icon={CellphoneIcon} noun="Call log" isFiltered />
</td>
                </tr>
              ) : (
                paginatedLogs.map((log) => {
                  const isSelected = selectedItems.includes(log._id);
                  const isActionsOpen = openRowActionsId === log._id;
                  const loggedBy = typeof log.user === "object" ? log.user : null;
                  const CallTypeIcon = log.callType === "Inbound" ? IncomingCallIcon : OutgoingCallIcon;

                  const rowActionsMenu = (
                    <div className="relative flex items-center justify-center flex-shrink-0" onMouseDown={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isActionsOpen) {
                            setOpenRowActionsId(null);
                            setRowActionsPos(null);
                            return;
                          }
                          const zMenu = getAncestorZoom(document.body);
                          const MENU_W = 170;
                          const MENU_H = 110;
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

                          setRowActionsPos({ top: calcTop, left: calcLeft });
                          setOpenRowActionsId(log._id);
                        }}
                        className="p-1 rounded hover:bg-gray-200 text-gray-800 flex-shrink-0"
                        title="More options"
                      >
                        <MoreVertIcon className="w-5 h-5" />
                      </button>

                      {isActionsOpen && rowActionsPos && createPortal(
                        <>
                          <div className="fixed inset-0 z-[9998]" onClick={() => { setOpenRowActionsId(null); setRowActionsPos(null); }} />
                          <div
                            ref={rowActionsRef}
                            style={{ position: "fixed", top: rowActionsPos.top, left: rowActionsPos.left }}
                            className="w-[170px] z-[9999] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5 animate-in fade-in zoom-in duration-150 origin-top-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => {
                                setOpenRowActionsId(null);
                                setRowActionsPos(null);
                                handleLogClick(log);
                              }}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                            >
                              <EyeIcon className="w-3.5 h-3.5 text-[#1C1B1F]" />
                              View Call
                            </button>
                            <button
                              onClick={() => {
                                setOpenRowActionsId(null);
                                setRowActionsPos(null);
                                handleEdit(log);
                              }}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                            >
                              <EditIcon className="w-3.5 h-3.5 text-[#1C1B1F]" />
                              Edit Call
                            </button>
                            <div className="w-full border-t border-[#F1F1F5] my-0.5" />
                            <button
                              onClick={() => {
                                setOpenRowActionsId(null);
                                setRowActionsPos(null);
                                setLogToDelete(log);
                              }}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-red-600 hover:bg-red-50 whitespace-nowrap"
                            >
                              <DeleteIcon className="w-4 h-4" />
                              Delete Call
                            </button>
                          </div>
                        </>,
                        document.body,
                      )}
                    </div>
                  );

                  const cells = {
                    purpose: (
                      <td key="purpose" style={{ height: 60 }} className="pl-6 pr-3 border-r border-b border-[#E1E4EA]">
                        <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 14, lineHeight: "20px", color: "#222530" }} className="truncate block">
                          <HighlightText text={log.purpose || "Phone Call"} query={searchTerm} />
                        </span>
                      </td>
                    ),
                    callType: (
                      <td key="callType" style={{ height: 60 }} className="px-3 border-r border-b border-[#E1E4EA]">
                        <span
                          className="inline-flex items-center gap-1 capitalize"
                          style={{ padding: "5px 12px", borderRadius: 53, backgroundColor: "rgba(0, 133, 255, 0.1)", fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "120%", color: "#0085FF" }}
                        >
                          <CallTypeIcon className="w-3 h-3" />
                          <HighlightText text={CALL_TYPE_LABELS[log.callType] || log.callType || "Outbound"} query={searchTerm} />
                        </span>
                      </td>
                    ),
                    status: (
                      <td key="status" style={{ height: 60 }} className="px-3 border-r border-b border-[#E1E4EA]">
                        <span
                          className="inline-flex items-center justify-center capitalize"
                          style={{
                            padding: "5px 12px",
                            borderRadius: 53,
                            backgroundColor: log.status === "Connected" ? "rgba(0, 201, 80, 0.1)" : log.status === "Missed" ? "rgba(251, 55, 72, 0.1)" : "rgba(107, 114, 128, 0.1)",
                            fontFamily: "Inter",
                            fontWeight: 500,
                            fontSize: 12,
                            lineHeight: "120%",
                            color: log.status === "Connected" ? "#00C950" : log.status === "Missed" ? "#FB3748" : "#6B7280",
                          }}
                        >
                          <HighlightText text={CALL_STATUS_LABELS[log.status] || log.status || "Connected"} query={searchTerm} />
                        </span>
                      </td>
                    ),
                    duration: (
                      <td key="duration" style={{ height: 60 }} className="px-3 border-r border-b border-[#E1E4EA]">
                        <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 14, lineHeight: "20px", color: "#525866" }}>
                          {log.duration ? `${Math.floor(log.duration / 60)}m ${log.duration % 60}s` : "—"}
                        </span>
                      </td>
                    ),
                    notes: (
                      <td key="notes" style={{ height: 60 }} className="px-3 border-r border-b border-[#E1E4EA]">
                        <span style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 13, lineHeight: "18px", color: "#525866" }} className="truncate block">
                          {stripHtml(log.notes) ? <HighlightText text={stripHtml(log.notes)} query={searchTerm} /> : "—"}
                        </span>
                      </td>
                    ),
                    user: (
                      <td key="user" style={{ height: 60 }} className="px-3 border-r border-b border-[#E1E4EA]">
                        <div className="flex items-center" style={{ gap: 6 }}>
                          <div className="rounded-full bg-blue-100 border border-white flex items-center justify-center text-[10px] font-semibold text-blue-700 flex-shrink-0" style={{ width: 24, height: 24 }}>
                            {(loggedBy?.name || "?").charAt(0).toUpperCase()}
                          </div>
                          <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 12, lineHeight: "120%", color: "#1C1C1D" }} className="truncate">
                            <HighlightText text={loggedBy?.name || "Unknown"} query={searchTerm} />
                          </span>
                        </div>
                      </td>
                    ),
                    dateTime: (
                      <td key="dateTime" style={{ height: 60 }} className="px-3 border-b border-[#E1E4EA]">
                        <div className="flex flex-col">
                          <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 14, lineHeight: "20px", color: "#525866" }} className="truncate">
                            {log.createdAt ? new Date(log.createdAt).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                          </span>
                          <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 14, lineHeight: "20px", color: "rgba(28, 28, 29, 0.5)" }} className="truncate">
                            {log.createdAt ? new Date(log.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "—"}
                          </span>
                        </div>
                      </td>
                    ),
                  };

                  return (
                    <tr
                      key={log._id}
                      onClick={() => handleLogClick(log)}
                      className={`hover:bg-gray-50 transition-colors group cursor-pointer ${isSelected ? "!bg-blue-50" : ""}`}
                    >
                      <td
                        style={{
                          height: 54,
                          width: 44,
                          position: "sticky",
                          left: 0,
                          zIndex: 10,
                          backgroundColor: isSelected ? "#EFF6FF" : "#fff",
                          boxShadow: "inset -1px 0 0 #E1E4EA, inset 0 -1px 0 #E1E4EA",
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="px-3"
                      >
                        <div className="flex justify-center items-center w-full">
                          <Checkbox checked={isSelected} onChange={() => toggleItem(log._id)} />
                        </div>
                      </td>
                      {orderedColumns.map((col, colIdx) => {
                        const isDragging = draggedColKey === col.id;
                        const cell = cells[col.id];
                        if (!cell) return null;

                        const stickyStyle = getStickyStyle(col.id, false, isSelected);
                        const mergedStyle = { ...cell.props.style, opacity: isDragging ? 0.35 : undefined, ...stickyStyle };

                        const cleanClassName = (cell.props.className || "").replace("border-r", "").replace("border-b", "").replace("border-[#E1E4EA]", "");

                        const boundarySide = getBoundaryShadowSide(col.id);
                        const isLastCol = colIdx === orderedColumns.length - 1;
                        return React.cloneElement(
                          cell,
                          { style: mergedStyle, className: cleanClassName },
                          <>
                            {isLastCol ? (
                              <div className="flex items-center justify-between w-full gap-2">
                                {cell.props.children}
                                {rowActionsMenu}
                              </div>
                            ) : (
                              cell.props.children
                            )}
                            {boundarySide && <div style={getPinnedBoundaryOverlayStyle(boundarySide)} />}
                          </>,
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {listTotalCount > 0 && (
        <div ref={fillFooterRef} className="w-full bg-transparent px-4 py-3 mt-3 flex items-center justify-between sm:px-6">
          <div className="flex-1 flex justify-between sm:hidden">
            <button
              onClick={() => handleListPageChange(listPage - 1)}
              disabled={!hasListPrevPage}
              className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => handleListPageChange(listPage + 1)}
              disabled={!hasListNextPage}
              className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>

          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div className="flex items-center space-x-2">
              <p className="text-sm text-gray-700 font-inter">
                Showing <span className="font-semibold">{listStartItem}</span> to{" "}
                <span className="font-semibold">{listEndItem}</span> of{" "}
                <span className="font-semibold">{listTotalCount}</span> results
              </p>
              <select
                value={listLimit}
                onChange={(e) => handleListLimitChange(parseInt(e.target.value))}
                className="ml-2 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer font-inter"
              >
                <option value={10}>10 per page</option>
                <option value={20}>20 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
              </select>
            </div>

            <EditablePaginationButtons
              currentPage={listPage}
              totalPages={listTotalPages}
              hasPrevPage={hasListPrevPage}
              hasNextPage={hasListNextPage}
              onPageChange={handleListPageChange}
              getPageNumbers={getListPageNumbers}
            />
          </div>
        </div>
      )}

      <CompanyFilterPanel
        isOpen={showFilterPanel}
        onClose={() => setShowFilterPanel(false)}
        columns={CALL_LOG_FILTER_COLUMNS}
        data={callLogs}
        getFieldValue={getCallLogFieldValue}
        selected={selectedFilters}
        onApply={setSelectedFilters}
        title="Filter Call Logs"
        subtitle="Filter this list by column"
      />

      {logToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10005] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <DeleteIcon className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Confirm Delete</h3>
              <p className="text-sm text-gray-500 mb-6">
                Delete call log "{logToDelete.purpose || "Phone Call"}"? This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setLogToDelete(null)}
                  disabled={deletingLog}
                  className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConfirmed}
                  disabled={deletingLog}
                  className="px-5 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors shadow-sm disabled:opacity-50"
                >
                  {deletingLog ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

      {showBulkDeleteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10005] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-6 text-center">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Confirm Delete</h3>
              <p className="text-sm text-gray-500 mb-6">
                Delete {selectedItems.length} selected call log{selectedItems.length !== 1 ? "s" : ""}? This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setShowBulkDeleteModal(false)}
                  disabled={bulkActionLoading}
                  className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={bulkActionLoading}
                  className="px-5 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors shadow-sm disabled:opacity-50"
                >
                  {bulkActionLoading ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showBulkStatusModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10005] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-6 text-left">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Update Status for {selectedItems.length} Call Logs</h3>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Select New Status</label>
                <select
                  value={bulkStatusValue}
                  onChange={(e) => setBulkStatusValue(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="" disabled>Select a status...</option>
                  {Object.entries(CALL_STATUS_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowBulkStatusModal(false)}
                  disabled={bulkActionLoading}
                  className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkUpdateStatus}
                  disabled={bulkActionLoading || !bulkStatusValue}
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
                >
                  {bulkActionLoading ? "Updating..." : "Update"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompanyCallLogsTab;
