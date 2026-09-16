import DeleteIcon from "../common/DeleteIcon";
import EmptyState from "../common/EmptyState";
import Checkbox from "../common/Checkbox";
import PlusIcon from "../common/PlusIcon";
import React, { useEffect, useMemo, useState, useRef } from "react";
import { DATE_RANGES, getDateRangeLabel } from "../../utils/dateBuckets";
import { createPortal } from "react-dom";
import { getAncestorZoom } from "../../utils/domUtils";
import { getPinnedBoundaryOverlayStyle } from "../../utils/pinnedColumnShadow";
import {
  Filter,
  Pin,
  PinOff,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  EyeOff,
  ListChecks,
  List,
  LayoutGrid,
  X,
  CheckCircle, ArrowUp, ArrowDown } from "lucide-react";
import { EditablePaginationButtons } from "../common/EditablePaginationButtons";
import toast from "react-hot-toast";
import API from "../../services/api";
import CompanyTaskForm from "./CompanyTaskForm";
import HighlightText from "../common/HighlightText";
import TaskDetailsModal from "../Task/TaskDetailsModal";
import TaskKanbanBoard from "../Task/TaskKanbanBoard";
import FilterIcon from "../common/FilterIcon";
import CompanyFilterPanel from "./CompanyFilterPanel";
import TableSkeletonRows from "../common/TableSkeletonRows";
import StatTile from "../common/StatTile";
import StatTileSkeleton from "../common/StatTileSkeleton";
import Skeleton from "../common/Skeleton";
import BulkActionBar from "../common/BulkActionBar";
import { useBulkSelection, useBulkStrip } from "../../hooks/useBulkSelection";
import { exportToCSV } from "../../utils/exportToCSV";
import { bulkDelete } from "../../utils/bulkOperations";
import useFillToBottom from "../../hooks/useFillToBottom";
import { applyColumnFilters } from "../../utils/advancedFilters";

import SearchIcon from "../common/SearchIcon";
import EyeIcon from "../common/EyeIcon";
import EditIcon from "../common/EditIcon";
const TASK_STATUS_OPTIONS = ["Completed", "In-Progress"];
const TASK_PRIORITY_OPTIONS = ["Low", "Medium", "High"];
const TASK_FILTER_COLUMNS = [
  { key: "status", label: "Status", options: TASK_STATUS_OPTIONS },
  { key: "priority", label: "Priority", options: TASK_PRIORITY_OPTIONS },
  { key: "dueDate", label: "Due Date", options: DATE_RANGES.map((r) => r.label) },
];

const TotalTasksIcon = ({ size = 24, ...props }) => (
  <svg width={size} height={size} viewBox="24 24 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M40.1943 44.4845L37.7155 42.0057L38.7595 40.9615L40.1845 42.3865L43.4462 39.125L44.5 40.1788L40.1943 44.4845ZM27.5 44.5V43H36V44.5H27.5ZM27.5 40.625V39.125H36V40.625H27.5ZM27.5 36.75V35.25H44.5V36.75H27.5ZM27.5 32.875V31.375H44.5V32.875H27.5ZM27.5 29V27.5H44.5V29H27.5Z" fill="#0085FF" />
  </svg>
);

const PendingTasksIcon = ({ size = 24, ...props }) => (
  <svg width={size} height={size} viewBox="361.5 24 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M372.75 40.7499H374.25V37.7499H377.25V36.2499H374.25V33.2499H372.75V36.2499H369.75V37.7499H372.75V40.7499ZM370.185 44.8307C369.154 44.3845 368.255 43.7781 367.489 43.0114C366.722 42.2448 366.116 41.3463 365.669 40.3159C365.223 39.2854 365 38.1803 365 37.0004C365 35.8206 365.223 34.7153 365.669 33.6847C366.116 32.6538 366.722 31.7551 367.489 30.9884C368.255 30.2218 369.154 29.6153 370.184 29.1692C371.215 28.723 372.32 28.4999 373.5 28.4999C374.68 28.4999 375.785 28.723 376.815 29.1692C377.846 29.6153 378.745 30.2218 379.512 30.9884C380.278 31.7551 380.885 32.6536 381.331 33.6839C381.777 34.7144 382 35.8196 382 36.9994C382 38.1793 381.777 39.2845 381.331 40.3152C380.885 41.346 380.278 42.2448 379.512 43.0114C378.745 43.7781 377.847 44.3845 376.816 44.8307C375.786 45.2768 374.681 45.4999 373.501 45.4999C372.321 45.4999 371.216 45.2768 370.185 44.8307ZM367.254 26.8884L368.308 27.9422L364.442 31.8077L363.389 30.7537L367.254 26.8884ZM379.746 26.8884L383.612 30.7537L382.558 31.8077L378.692 27.9422L379.746 26.8884ZM373.5 43.9999C375.444 43.9999 377.096 43.3192 378.458 41.9577C379.819 40.5962 380.5 38.9436 380.5 36.9999C380.5 35.0563 379.819 33.4037 378.458 32.0422C377.096 30.6807 375.444 29.9999 373.5 29.9999C371.557 29.9999 369.904 30.6807 368.542 32.0422C367.181 33.4037 366.5 35.0563 366.5 36.9999C366.5 38.9436 367.181 40.5962 368.542 41.9577C369.904 43.3192 371.557 43.9999 373.5 43.9999Z" fill="#0085FF" />
  </svg>
);

const PendingActionIcon = ({ size = 14, ...props }) => (
  <svg width={size} height={size} viewBox="530 42 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M537.416 51.749C537.528 51.6372 537.584 51.4987 537.584 51.3334C537.584 51.1681 537.528 51.0296 537.416 50.9178C537.304 50.806 537.166 50.7501 537 50.7501C536.835 50.7501 536.697 50.806 536.585 50.9178C536.473 51.0296 536.417 51.1681 536.417 51.3334C536.417 51.4987 536.473 51.6372 536.585 51.749C536.697 51.8608 536.835 51.9167 537 51.9167C537.166 51.9167 537.304 51.8608 537.416 51.749ZM536.417 49.5834H537.584V46.0834H536.417V49.5834ZM537 54.8334C536.193 54.8334 535.435 54.6803 534.725 54.374C534.016 54.0678 533.398 53.6522 532.873 53.1272C532.348 52.6022 531.933 51.9848 531.626 51.2751C531.32 50.5654 531.167 49.807 531.167 49.0001C531.167 48.1931 531.32 47.4348 531.626 46.7251C531.933 46.0154 532.348 45.398 532.873 44.873C533.398 44.348 534.016 43.9324 534.725 43.6261C535.435 43.3199 536.193 43.1667 537 43.1667C537.807 43.1667 538.566 43.3199 539.275 43.6261C539.985 43.9324 540.602 44.348 541.127 44.873C541.652 45.398 542.068 46.0154 542.374 46.7251C542.681 47.4348 542.834 48.1931 542.834 49.0001C542.834 49.807 542.681 50.5654 542.374 51.2751C542.068 51.9848 541.652 52.6022 541.127 53.1272C540.602 53.6522 539.985 54.0678 539.275 54.374C538.566 54.6803 537.807 54.8334 537 54.8334ZM537 53.6667C538.303 53.6667 539.407 53.2147 540.311 52.3105C541.215 51.4063 541.667 50.3029 541.667 49.0001C541.667 47.6973 541.215 46.5938 540.311 45.6897C539.407 44.7855 538.303 44.3334 537 44.3334C535.698 44.3334 534.594 44.7855 533.69 45.6897C532.786 46.5938 532.334 47.6973 532.334 49.0001C532.334 50.3029 532.786 51.4063 533.69 52.3105C534.594 53.2147 535.698 53.6667 537 53.6667Z" fill="#BCAA00" />
  </svg>
);

const OverdueTasksIcon = ({ size = 24, ...props }) => (
  <svg width={size} height={size} viewBox="24 24 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M38.902 33.9212C39.6982 33.1122 40.0962 32.1385 40.0962 31V28H31.9037V31C31.9037 32.1385 32.3018 33.1122 33.098 33.9212C33.8942 34.7302 34.8615 35.1348 36 35.1348C37.1385 35.1348 38.1058 34.7302 38.902 33.9212ZM28.5 45.5V44H30.404V41C30.404 39.8743 30.712 38.8497 31.328 37.926C31.944 37.0022 32.7603 36.3602 33.777 36C32.7603 35.6333 31.944 34.9898 31.328 34.0693C30.712 33.1488 30.404 32.1257 30.404 31V28H28.5V26.5H43.5V28H41.596V31C41.596 32.1257 41.288 33.1488 40.672 34.0693C40.056 34.9898 39.2397 35.6333 38.223 36C39.2397 36.3602 40.056 37.0022 40.672 37.926C41.288 38.8497 41.596 39.8743 41.596 41V44H43.5V45.5H28.5Z" fill="#0085FF" />
  </svg>
);

const OverdueActionIcon = ({ size = 14, ...props }) => (
  <svg width={size} height={size} viewBox="189.5 42 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M196.916 51.749C197.028 51.6372 197.084 51.4987 197.084 51.3334C197.084 51.1681 197.028 51.0296 196.916 50.9178C196.804 50.806 196.666 50.7501 196.5 50.7501C196.335 50.7501 196.197 50.806 196.085 50.9178C195.973 51.0296 195.917 51.1681 195.917 51.3334C195.917 51.4987 195.973 51.6372 196.085 51.749C196.197 51.8608 196.335 51.9167 196.5 51.9167C196.666 51.9167 196.804 51.8608 196.916 51.749ZM195.917 49.5834H197.084V46.0834H195.917V49.5834ZM196.5 54.8334C195.693 54.8334 194.935 54.6803 194.225 54.374C193.516 54.0678 192.898 53.6522 192.373 53.1272C191.848 52.6022 191.433 51.9848 191.126 51.2751C190.82 50.5654 190.667 49.807 190.667 49.0001C190.667 48.1931 190.82 47.4348 191.126 46.7251C191.433 46.0154 191.848 45.398 192.373 44.873C192.898 44.348 193.516 43.9324 194.225 43.6261C194.935 43.3199 195.693 43.1667 196.5 43.1667C197.307 43.1667 198.066 43.3199 198.775 43.6261C199.485 43.9324 200.102 44.348 200.627 44.873C201.152 45.398 201.568 46.0154 201.874 46.7251C202.181 47.4348 202.334 48.1931 202.334 49.0001C202.334 49.807 202.181 50.5654 201.874 51.2751C201.568 51.9848 201.152 52.6022 200.627 53.1272C200.102 53.6522 199.485 54.0678 198.775 54.374C198.066 54.6803 197.307 54.8334 196.5 54.8334ZM196.5 53.6667C197.803 53.6667 198.907 53.2147 199.811 52.3105C200.715 51.4063 201.167 50.3029 201.167 49.0001C201.167 47.6973 200.715 46.5938 199.811 45.6897C198.907 44.7855 197.803 44.3334 196.5 44.3334C195.198 44.3334 194.094 44.7855 193.19 45.6897C192.286 46.5938 191.834 47.6973 191.834 49.0001C191.834 50.3029 192.286 51.4063 193.19 52.3105C194.094 53.2147 195.198 53.6667 196.5 53.6667Z" fill="#CD3636" />
  </svg>
);

const CompletedTasksIcon = ({ size = 24, ...props }) => (
  <svg width={size} height={size} viewBox="361.5 24 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M367 44.75V28.5H372.615C372.564 28.75 372.523 29 372.492 29.25C372.462 29.5 372.455 29.75 372.471 30H368.5V36H375.75L376.15 38H379.5V36.3595C379.75 36.3532 380 36.3315 380.25 36.2943C380.5 36.2571 380.75 36.2014 381 36.127V39.5H374.904L374.504 37.5H368.5V44.75H367ZM378.438 31.8308L381.846 28.4385L381.008 27.6L378.438 30.1385L377.3 29L376.462 29.8538L378.438 31.8308ZM382.34 26.5098C383.216 27.3853 383.654 28.4475 383.654 29.6963C383.654 30.945 383.216 32.0071 382.34 32.8828C381.465 33.7583 380.403 34.196 379.154 34.196C377.905 34.196 376.843 33.7583 375.967 32.8828C375.092 32.0071 374.654 30.945 374.654 29.6963C374.654 28.4475 375.092 27.3853 375.967 26.5098C376.843 25.6341 377.905 25.1963 379.154 25.1963C380.403 25.1963 381.465 25.6341 382.34 26.5098Z" fill="#0085FF" />
  </svg>
);

const CompletedTrendIcon = ({ size = 14, ...props }) => (
  <svg width={size} height={size} viewBox="497 44 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M502.583 46.5665V53.6666H501.417V46.5665L498.288 49.6955L497.463 48.8705L502 44.3333L506.537 48.8705L505.712 49.6955L502.583 46.5665Z" fill="#00C950" />
  </svg>
);

const TotalTrendIcon = ({ size = 14, ...props }) => (
  <svg width={size} height={size} viewBox="197 44 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M203.083 46.568V53.668H201.917V46.568L198.788 49.6969L197.963 48.872L202.5 44.3347L207.037 48.872L206.212 49.6969L203.083 46.568Z" fill="#00C950" />
  </svg>
);

const MoreVertIcon = ({ size = 20, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M10 5.83333C10.9167 5.83333 11.6667 5.08333 11.6667 4.16667C11.6667 3.25 10.9167 2.5 10 2.5C9.08333 2.5 8.33333 3.25 8.33333 4.16667C8.33333 5.08333 9.08333 5.83333 10 5.83333ZM10 8.33333C9.08333 8.33333 8.33333 9.08333 8.33333 10C8.33333 10.9167 9.08333 11.6667 10 11.6667C10.9167 11.6667 11.6667 10.9167 11.6667 10C11.6667 9.08333 10.9167 8.33333 10 8.33333ZM10 14.1667C9.08333 14.1667 8.33333 14.9167 8.33333 15.8333C8.33333 16.75 9.08333 17.5 10 17.5C10.9167 17.5 11.6667 16.75 11.6667 15.8333C11.6667 14.9167 10.9167 14.1667 10 14.1667Z" fill="#1C1B1F" />
  </svg>
);

const CircleCheckIcon = ({ size = 20, checked = false, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    {checked ? (
      <>
        <circle cx="10" cy="10" r="9" fill="#0085FF" />
        <path d="M6 10.2L8.5 12.7L14 7.2" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </>
    ) : (
      <circle cx="10" cy="10" r="8.5" stroke="#C1C7D0" strokeWidth="1.2" fill="none" />
    )}
  </svg>
);

const BriefcaseIcon = ({ size = 14, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 17 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M1.66667 15.8333C1.20833 15.8333 0.815972 15.6701 0.489583 15.3438C0.163194 15.0174 0 14.625 0 14.1667V5C0 4.54167 0.163194 4.14931 0.489583 3.82292C0.815972 3.49653 1.20833 3.33333 1.66667 3.33333H5V1.66667C5 1.20833 5.16319 0.815972 5.48958 0.489583C5.81597 0.163194 6.20833 0 6.66667 0H10C10.4583 0 10.8507 0.163194 11.1771 0.489583C11.5035 0.815972 11.6667 1.20833 11.6667 1.66667V3.33333H15C15.4583 3.33333 15.8507 3.49653 16.1771 3.82292C16.5035 4.14931 16.6667 4.54167 16.6667 5V14.1667C16.6667 14.625 16.5035 15.0174 16.1771 15.3438C15.8507 15.6701 15.4583 15.8333 15 15.8333H1.66667ZM1.66667 14.1667H15V5H1.66667V14.1667ZM6.66667 3.33333H10V1.66667H6.66667V3.33333Z" fill="#8D8D8E" />
  </svg>
);

// Also drives the contact profile's Tasks tab: pass `contactId` (plus that
// contact's `companyId`, which the task form needs for its contact/deal
// pickers) and it scopes itself to that contact's tasks. Same table, filters,
// bulk strip and form either way.
export default function CompanyTasksTab({ companyId, contactId, dealId, tasks = [], setTasks, showStats = true, isLoading = false }) {
  // Keeps the table box a fixed height ending at the bottom of the screen, so
  // changing rows-per-page scrolls internally instead of growing the page.
  const {
    containerRef: fillContainerRef,
    footerRef: fillFooterRef,
    style: fillStyle,
  } = useFillToBottom();

  const [searchTerm, setSearchTerm] = useState("");
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showBulkStatusModal, setShowBulkStatusModal] = useState(false);
  const [bulkStatusValue, setBulkStatusValue] = useState("");
  const [users, setUsers] = useState([]);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [openRowActionsId, setOpenRowActionsId] = useState(null);
  const [rowActionsPos, setRowActionsPos] = useState(null);
  const rowActionsRef = useRef(null);
  const [taskToDelete, setTaskToDelete] = useState(null);
  const [deletingTask, setDeletingTask] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState(new Set());
  const [leftPinned, setLeftPinned] = useState(new Set());
  const [rightPinned, setRightPinned] = useState(new Set());
  const [openColumnMenuKey, setOpenColumnMenuKey] = useState(null);
  const [columnMenuPos, setColumnMenuPos] = useState(null);
  const columnMenuRef = useRef(null);

  const BASE_COLUMNS = useMemo(() => [
    { id: "title", label: "Task", width: 264, pinnable: true },
    { id: "assignedTo", label: "Assigned to", width: 190, pinnable: true },
    { id: "status", label: "Status", width: 160, pinnable: true },
    { id: "priority", label: "Priority", width: 148, pinnable: true },
    { id: "dueDate", label: "Due Date", width: 166, pinnable: true },
    { id: "progress", label: "Progress", width: 362, pinnable: true },
  ], []);

  const [columnOrder, setColumnOrder] = useState(() => BASE_COLUMNS.map(c => c.id));
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

    // No click-count gate here, matching the Companies list page: a press plus
    // DRAG_THRESHOLD px of movement starts the drag, at whatever speed the user
    // moves. Gating on `e.detail` meant only a fast-enough double-click could
    // begin a move. The threshold below is what keeps a plain click harmless,
    // and the column menu opens from its own chevron button, never from the
    // header background — so nothing competes with the drag for a single press.

    // A plain click must stay harmless, so nothing happens until the pointer
    // has travelled DRAG_THRESHOLD px — the same deferred start the Companies
    // list page uses. Until then no ghost is mounted and no drag state is set.
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
    
      const previewRows = (tasks || []).slice(0, 10).map((t) => {
        let val = t[colId];
        if (colId === 'assignedTo') val = val?.name || "Unassigned";
        if (typeof val === 'object' && val !== null) val = val?.name || val?.title || "";
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
    title: 264,
    assignedTo: 190,
    status: 160,
    priority: 148,
    dueDate: 166,
    progress: 362,
  });
  const [resizingCol, setResizingCol] = useState(null);
  const resizingRef = useRef(null);
  // +88 for the two fixed 44px leading columns (selection checkbox and the
  // completion circle), which aren't in colWidths — without them this minWidth
  // under-reports the real table width and the horizontal scroll stops short.
  const totalTableWidth = useMemo(
    () => Object.values(colWidths).reduce((sum, w) => sum + w, 0) + 88,
    [colWidths],
  );

  const stickyStyles = useMemo(() => {
    const map = {};
    let leftOffset = 44; // selection column width
    for (const col of orderedColumns) {
      if (leftPinned.has(col.id)) {
        map[col.id] = {
          position: "sticky",
          left: leftOffset,
          zIndex: 20,
          backgroundColor: "#fff",
        };
        leftOffset += colWidths[col.id] || 200;
      }
    }
    let rightOffset = 0;
    for (const col of [...orderedColumns].reverse()) {
      if (rightPinned.has(col.id)) {
        map[col.id] = {
          position: "sticky",
          right: rightOffset,
          zIndex: 20,
          backgroundColor: "#fff",
        };
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
    const leftPinnedCols = orderedColumns.filter(c => leftPinned.has(c.id));
    const rightPinnedCols = orderedColumns.filter(c => rightPinned.has(c.id));
    if (leftPinnedCols.length > 0 && leftPinnedCols[leftPinnedCols.length - 1].id === colId) return "left";
    if (rightPinnedCols.length > 0 && rightPinnedCols[0].id === colId) return "right";
    return null;
  };

  // Kept so the existing header Pin button and double-click-to-pin keep working;
  // they now write to the same left/right pin state the column menu uses, rather
  // than a second independent `pinnedColumn` value.
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

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await API.get("/auth/all-user");
        setUsers(res.data.allUsers || []);
      } catch (err) {
        console.error("Failed to load users:", err);
      }
    };
    fetchUsers();
  }, []);

  const refetchTasks = async () => {
    try {
      const res = await API.get(
        contactId
          ? `/tasks/contact/${contactId}`
          : dealId
            ? `/tasks/deal/${dealId}`
            : `/tasks/company/${companyId}`,
      );
      setTasks(res.data || []);
    } catch (err) {
      console.error("Failed to refetch tasks:", err);
    }
  };

  const handleTaskSave = async (taskData) => {
    try {
      await API.post("/tasks", taskData);
      await refetchTasks();
      toast.success("Task created successfully!");
      setShowTaskForm(false);
    } catch (err) {
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || "Failed to create task.");
      }
      throw err;
    }
  };

  const handleTaskComplete = async (task) => {
    try {
      await API.put(`/tasks/${task._id}`, { status: "Completed" });
      await refetchTasks();
      setSelectedTask((prev) => (prev && prev._id === task._id ? { ...prev, status: "Completed" } : prev));
      toast.success("Task marked as complete!");
    } catch (err) {
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || "Failed to update task.");
      }
    }
  };

  // Toggle used by the checkmark next to the task title in the table, same
  // as the global Tasks & Meetings page — Completed <-> Pending.
  const handleToggleTaskStatus = async (task) => {
    const nextStatus = task.status === "Completed" ? "Pending" : "Completed";
    try {
      await API.put(`/tasks/${task._id}/status`, { status: nextStatus });
      await refetchTasks();
      toast.success("Status updated");
    } catch (err) {
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || "Update failed");
      }
    }
  };

  const handleTaskDelete = async (taskId) => {
    try {
      await API.delete(`/tasks/${taskId}`);
      await refetchTasks();
      toast.success("Task deleted successfully!");
      setIsDetailsOpen(false);
      setSelectedTask(null);
    } catch (err) {
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || "Failed to delete task.");
      }
      throw err;
    }
  };

  const handleDeleteTaskConfirmed = async () => {
    if (!taskToDelete) return;
    setDeletingTask(true);
    try {
      await handleTaskDelete(taskToDelete._id);
      setTaskToDelete(null);
    } catch {
      // handleTaskDelete already surfaced a toast for the failure.
    } finally {
      setDeletingTask(false);
    }
  };

  const handleTaskClick = (task) => {
    setSelectedTask(task);
    setIsDetailsOpen(true);
  };

  const handleEditTask = (task) => {
    setIsDetailsOpen(false);
    setEditingTask(task);
    setShowTaskForm(true);
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

  const [listPage, setListPage] = useState(1);
  const [listLimit, setListLimit] = useState(10);

  const formatTaskDueLabel = (dateString) => {
    if (!dateString) return { day: "—", time: "" };
    const date = new Date(dateString);
    const now = new Date();
    const isSameDay = (a, b) =>
      a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);

    const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

    if (isSameDay(date, now)) return { day: "Today.", time };
    if (isSameDay(date, tomorrow)) return { day: "Tomorrow", time };
    return {
      day: date.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }),
      time: date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
  };

  const getTaskAssignees = (task) => {
    if (!Array.isArray(task.users) || task.users.length === 0) return [];
    return task.users.filter((u) => typeof u === "object" && u?.name);
  };

  const getTaskProgress = (task) => (task.status === "Completed" ? 100 : 0);

  const getTaskFieldValue = (task, key) => {
    switch (key) {
      case "title":
        return task.title || "Untitled Task";
      case "assignedTo":
        return getTaskAssignees(task)[0]?.name || "";
      case "status":
        return task.status === "Completed" ? "Completed" : "In-Progress";
      case "priority":
        return task.priority ? task.priority.charAt(0).toUpperCase() + task.priority.slice(1) : "";
      case "dueDate":
        return getDateRangeLabel(task.dueDate);
      case "progress":
        return getTaskProgress(task);
      default:
        return task[key];
    }
  };

  // Every column the table renders, flattened to one searchable string. Built from
  // BASE_COLUMNS + getTaskFieldValue (the same accessor the columns and sorting use)
  // so adding a column can't silently leave it out of search, plus the extra bits a
  // cell shows that the accessor doesn't cover: the linked entity, EVERY assignee
  // rather than just the first, and the human due-date label.
  const getTaskSearchText = (task) => {
    const parts = BASE_COLUMNS.map((c) => getTaskFieldValue(task, c.id));
    const linked = task.relatedEntities?.[0]?.entityId;
    parts.push(linked?.name || linked?.title || "");
    parts.push(getTaskAssignees(task).map((a) => a?.name || "").join(" "));
    const due = formatTaskDueLabel(task.dueDate);
    parts.push(due ? `${due.day || ""} ${due.time || ""}` : "");
    return parts.filter(Boolean).join(" ").toLowerCase();
  };

  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter((t) => getTaskSearchText(t).includes(q));
    }
    return applyColumnFilters(result, selectedFilters, getTaskFieldValue);
  }, [tasks, searchTerm, selectedFilters]);

  const sortedTasks = useMemo(() => {
    if (!sortConfig.key) return filteredTasks;
    return [...filteredTasks].sort((a, b) => {
      let aVal = getTaskFieldValue(a, sortConfig.key);
      let bVal = getTaskFieldValue(b, sortConfig.key);
      if (sortConfig.key === "dueDate") {
        aVal = a.dueDate ? new Date(a.dueDate).getTime() : 0;
        bVal = b.dueDate ? new Date(b.dueDate).getTime() : 0;
      }
      const aCmp = typeof aVal === "number" ? aVal : (aVal || "").toString().toLowerCase();
      const bCmp = typeof bVal === "number" ? bVal : (bVal || "").toString().toLowerCase();
      if (aCmp < bCmp) return sortConfig.direction === "asc" ? -1 : 1;
      if (aCmp > bCmp) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredTasks, sortConfig]);

  const { selectedItems, toggleItem, clearSelection, selectAll } = useBulkSelection({
    items: filteredTasks,
    onDelete: () => setShowBulkDeleteModal(true)
  });

  // Keeps the bulk strip mounted for one beat after deselect so its
  // slide-out animation can play instead of vanishing on the same frame.
  const { visible: bulkStripVisible, closing: bulkStripClosing } =
    useBulkStrip(selectedItems.length);

  const paginatedTasks = useMemo(
    () => sortedTasks.slice((listPage - 1) * listLimit, listPage * listLimit),
    [sortedTasks, listPage, listLimit],
  );

  const listTotalCount = sortedTasks.length;
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
    const dataToExport = tasks.filter(t => selectedItems.includes(t._id)).map(t => ({
      "Task": t.title || "",
      "Assigned to": getTaskAssignees(t).map(u => u.name).join(", "),
      "Status": t.status === "Completed" ? "Completed" : "In-Progress",
      "Priority": t.priority || "",
      "Due Date": t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "",
    }));
    const headers = Object.keys(dataToExport[0] || {}).join(",");
    const rows = dataToExport.map(row => Object.values(row).map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
    exportToCSV([headers, ...rows], `tasks_export_${new Date().toISOString().split("T")[0]}.csv`);
  };

  const handleBulkDelete = async () => {
    setBulkActionLoading(true);
    try {
      await bulkDelete("tasks", selectedItems);
      setTasks?.(prev => prev.filter(t => !selectedItems.includes(t._id)));
      toast.success(`${selectedItems.length} task(s) deleted`);
      clearSelection();
      setShowBulkDeleteModal(false);
    } catch (error) {
      console.error("Bulk delete failed:", error);
      toast.error("Failed to delete tasks");
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkUpdateStatus = async () => {
    if (!bulkStatusValue) return;
    setBulkActionLoading(true);
    try {
      // PUT, not PATCH — backend/routes/taskRoutes.js only registers
      // `router.put("/:id")` (and `/:id/status`); there is no PATCH route, so
      // this previously 404'd on every bulk update. Tasks.jsx's equivalent
      // handler uses PUT for the same reason.
      await Promise.all(selectedItems.map(id => API.put(`/tasks/${id}`, { status: bulkStatusValue })));
      setTasks?.(prev => prev.map(t => selectedItems.includes(t._id) ? { ...t, status: bulkStatusValue } : t));
      toast.success(`Status updated for ${selectedItems.length} task(s)`);
      clearSelection();
      setShowBulkStatusModal(false);
    } catch (error) {
      console.error("Bulk update failed:", error);
      toast.error("Failed to update tasks");
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleSelectAllAcrossPages = () => selectAll(filteredTasks);

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

  const total = tasks.length;
  const pending = tasks.filter((t) => t.status !== "Completed").length;
  const overdue = tasks.filter(
    (t) =>
      t.status !== "Completed" && t.dueDate && new Date(t.dueDate) < new Date(),
  ).length;
  const completed = tasks.filter((t) => t.status === "Completed").length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  const kpiTiles = [
    {
      label: "Total Tasks",
      value: total,
      icon: TotalTasksIcon,
      subtitle: "12% Last week",
      subtitleColor: "#00C950",
      subtitleIcon: TotalTrendIcon,
    },
    {
      label: "Pending Tasks",
      value: pending,
      icon: PendingTasksIcon,
      subtitle: "Awaiting action",
      subtitleColor: "#BCAA00",
      subtitleIcon: PendingActionIcon,
    },
    {
      label: "Overdue Tasks",
      value: overdue,
      icon: OverdueTasksIcon,
      subtitle: "Action Required",
      subtitleColor: "#CD3636",
      subtitleIcon: OverdueActionIcon,
    },
    {
      label: "Completed Tasks",
      value: completed,
      icon: CompletedTasksIcon,
      subtitle: `${completionRate}% Completion Rate`,
      subtitleColor: "#00C950",
      subtitleIcon: CompletedTrendIcon,
    },
  ];

  return (
    <div>
      {/* KPI Tiles */}
      {showStats && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <StatTileSkeleton key={i} />)
            ) : (
              kpiTiles.map((tile) => (
              <StatTile key={tile.label} tile={tile} />
            )))}
          </div>

          <div className="-mx-6" style={{ marginTop: 24, paddingBottom: 24, borderTop: "1px solid #E1E4EA" }} />
        </>
      )}

      {/* Search + Controls */}
      {isLoading ? (
        <div className="flex items-center gap-4 mb-4" style={{ height: "44px" }}>
          <Skeleton height={44} shape="rect" className="flex-1 rounded-full" />
          <Skeleton height={44} width={86} shape="rect" className="rounded-full flex-shrink-0" />
          <Skeleton height={44} width={44} shape="circle" className="flex-shrink-0" />
        </div>
      ) : bulkStripVisible ? (
        <BulkActionBar
          isClosing={bulkStripClosing}
          selectedCount={selectedItems.length}
          entityName="task"
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
              placeholder="Search by tasks..."
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
            style={{
              height: "44px",
              borderColor: Object.values(selectedFilters).flat().length > 0 ? "#0085FF" : "#E1E4EA",
            }}
          >
            <FilterIcon size={16} />
            Filter
            {Object.values(selectedFilters).flat().length > 0 && (
              <span className="absolute -top-2 -right-2 bg-blue-600 text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full ring-2 ring-white">
                {Object.values(selectedFilters).flat().length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowTaskForm(true)}
            className="flex items-center justify-center rounded-full border hover:bg-gray-50 flex-shrink-0"
            style={{ width: "44px", height: "44px", borderColor: "#E1E4EA" }}
            title="Add Task"
          >
            <PlusIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Task list or empty state. */}
      {!isLoading && tasks.length === 0 ? (
        <div className="flex items-center justify-center w-full min-h-[300px] bg-white border border-[#E1E4EA] rounded-xl">
          <EmptyState icon={ListChecks} noun="Task" onCreate={() => setShowTaskForm(true)} />
        </div>
      ) : (
      <div
        ref={fillContainerRef}
        className="box-border flex flex-col items-start w-full bg-white overflow-x-auto overflow-y-auto"
        style={{
          ...fillStyle,
          border: "1px solid #E1E4EA",
          borderRadius: 8,
        }}
      >
        <table
          className="text-sm text-left border-collapse"
          style={{ tableLayout: "fixed", width: "100%", minWidth: totalTableWidth, maxWidth: "100%" }}
        >
          <thead className="sticky top-0 z-30 bg-[#F5F7FA] border-b border-[#E1E4EA]">
            <tr>
              {/* Page-scoped select-all: ticks exactly the rows on the CURRENT page
                  (10 per page -> 10, 50 -> 50). Distinct from the bulk strip's
                  "Select All", which spans every record across all pages.
                  This is its OWN column now — it previously sat above the
                  completion-circle column (`__lead`), so a header labelled
                  "select all rows" was visually attached to a column of
                  per-task done/not-done toggles, and there was no per-row
                  selection checkbox anywhere. Matches Tasks.jsx, which has a
                  dedicated `selection` column separate from its row content. */}
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
                  <Checkbox checked={selectedItems.length > 0 && selectedItems.length === paginatedTasks.length} onChange={(e) => e.target.checked ? selectAll(paginatedTasks) : clearSelection()}  uncheckedColor="text-[#525866]"/>
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
                    style={{
                      width: colWidths[col.id],
                      height: 56,
                      opacity: isDragging ? 0.35 : 1,
                      ...getStickyStyle(col.id, true)
                    }}
                    className={`py-2.5 font-medium text-[#525252] text-xs cursor-grab active:cursor-grabbing bg-[#F5F7FA] ${
                      col.id === "title" ? "pl-6 pr-3" : "px-3"
                    } ${isDragOver ? "bg-blue-100" : "hover:bg-gray-100"}`}
                  >
                    <div className={`flex items-center justify-between w-full ${isLoading ? "[&_button]:invisible" : ""}`}>
                      {col.pinnable ? (
                        <div
                          className="relative flex items-center justify-start flex-1 group cursor-pointer select-none min-w-0"
                          onDoubleClick={() => togglePinColumn(col.id)}
                        >
                          <div className="flex items-center gap-1.5 flex-1 overflow-hidden">
                            {isLoading ? (
                              <Skeleton width="65%" height={12} />
                            ) : (
                              <div className="flex items-center gap-1.5 min-w-0 truncate">
                                <span className="truncate flex-1 min-w-0" title={col.label}>
                                  {col.label}
                                  {sortConfig.key === col.id && (sortConfig.direction === "asc"
                                    ? <ArrowUp className="w-3 h-3 text-[#0085FF] flex-shrink-0" />
                                    : <ArrowDown className="w-3 h-3 text-[#0085FF] flex-shrink-0" />)}
                                </span>
                                {(leftPinned.has(col.id) || rightPinned.has(col.id)) && (
                                  <Pin size={12} className="text-blue-500 fill-blue-500 flex-shrink-0 ml-1" style={{ transform: "rotate(45deg)" }} />
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : null}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (openColumnMenuKey === col.id) {
                            setOpenColumnMenuKey(null);
                            setColumnMenuPos(null);
                            return;
                          }
                          // rect is VISUAL px; the menu is portaled into document.body, which paints
                          // inside the dynamic <html> zoom, so rect-derived values must be divided by
                          // that zoom or the browser applies it twice. The resulting drift is
                          // PROPORTIONAL to the button's x position (pos x (zoom-1)), which is why it
                          // was invisible on the first column and obvious on the last — and why the
                          // old fixed `-80` nudge for the last column could never be right everywhere.
                          // MENU_W and the +4/8 gaps are already in portal space, so they are NOT divided.
                          const zMenu = getAncestorZoom(document.body);
                          const MENU_W = 190;
                          const rect = e.currentTarget.getBoundingClientRect();
                          let calculatedLeft = rect.right / zMenu - MENU_W;
                          calculatedLeft = Math.min(calculatedLeft, window.innerWidth / zMenu - MENU_W - 8);
                          calculatedLeft = Math.max(calculatedLeft, 8);
                          setColumnMenuPos({ top: rect.bottom / zMenu + 4, left: calculatedLeft });
                          setOpenColumnMenuKey(col.id);
                        }}
                        className="p-1 rounded hover:bg-gray-200 transition-colors text-gray-500 flex-shrink-0"
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
                        document.body
                      )}
                    </div>
                    <div
                      data-resize-handle="true"
                      onMouseDown={(e) => startResize(e, col.id)}
                      className={`absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none hover:bg-blue-400 z-10 ${
                        resizingCol === col.id ? "bg-blue-500" : "bg-transparent"
                      }`}
                    />
                    {boundarySide && <div style={getPinnedBoundaryOverlayStyle(boundarySide)} />}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="bg-white">
            {isLoading ? (
              <TableSkeletonRows
                columns={orderedColumns.map(c => colWidths[c.id])}
                hasCheckbox={true}
                numRows={listLimit}
                rowHeight={54}
              />
            ) : paginatedTasks.length === 0 ? (
              <tr>
                <td colSpan={orderedColumns.length + 1}>
  <EmptyState icon={ListChecks} noun="Task" isFiltered />
</td>
              </tr>
            ) : (
              paginatedTasks.map((task) => {
                const isSelected = selectedItems.includes(task._id);
                const isCompleted = task.status === "Completed";
                const assignees = getTaskAssignees(task);
                const progress = getTaskProgress(task);
                const isOverdue = !isCompleted && task.dueDate && new Date(task.dueDate) < new Date();
                const priority = task.priority || null;
                const priorityStyles = {
                  high: { bg: "rgba(205, 54, 54, 0.1)", color: "#CD3636" },
                  medium: { bg: "rgba(188, 170, 0, 0.1)", color: "#BCAA00" },
                  low: { bg: "rgba(0, 201, 80, 0.1)", color: "#00C950" },
                };
                const linkedEntity = task.relatedEntities?.[0];
                const dueLabel = formatTaskDueLabel(task.dueDate);
                const textDecoration = isCompleted ? "line-through" : "none";
                const primaryAssignee = assignees[0];
                const avatarUrl = primaryAssignee?.profileUrl || primaryAssignee?.userData?.mainData?.profilePic;
                const isActionsOpen = openRowActionsId === task._id;
                const taskActionsMenu = (
                  <div className="relative flex items-center justify-center flex-shrink-0" onMouseDown={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isActionsOpen) {
                          setOpenRowActionsId(null);
                          setRowActionsPos(null);
                          return;
                        }
                        // rect is VISUAL px; the menu is portaled into
                        // document.body, which paints inside the app's
                        // dynamic <html> zoom, so rect-derived values are
                        // divided by that zoom, the menu is centered on
                        // the row rather than hanging off an edge, and
                        // both axes are clamped to the viewport — same
                        // approach as the Deals table's row-actions menu.
                        const zMenu = getAncestorZoom(document.body);
                        const MENU_W = 160;
                        const MENU_H = 110; // View Task + Edit Task + divider + Delete Task
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
                        setOpenRowActionsId(task._id);
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
                          className="w-[160px] z-[9999] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5 animate-in fade-in zoom-in duration-150 origin-top-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => {
                              setOpenRowActionsId(null);
                              setRowActionsPos(null);
                              handleTaskClick(task);
                            }}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                          >
                            <EyeIcon className="w-3.5 h-3.5 text-[#1C1B1F]" />
                            View Task
                          </button>
                          <button
                            onClick={() => {
                              setOpenRowActionsId(null);
                              setRowActionsPos(null);
                              handleEditTask(task);
                            }}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                          >
                            <EditIcon className="w-3.5 h-3.5 text-[#1C1B1F]" />
                            Edit Task
                          </button>
                          <div className="w-full border-t border-[#F1F1F5] my-0.5" />
                          <button
                            onClick={() => {
                              setOpenRowActionsId(null);
                              setRowActionsPos(null);
                              setTaskToDelete(task);
                            }}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-red-600 hover:bg-red-50 whitespace-nowrap"
                          >
                            <DeleteIcon className="w-4 h-4" />
                            Delete Task
                          </button>
                        </div>
                      </>,
                      document.body
                    )}
                  </div>
                );
                  const cells = {
                    // Per-row selection checkbox — this is what was missing.
                    // `isSelected`/`toggleItem` already existed in this file but
                    // were never rendered, so bulk selection here was
                    // unreachable: the strip could never appear. stopPropagation
                    // keeps ticking a box from also firing the row's
                    // handleTaskClick and opening the task.
                    __select: (
                        <td key="__select" style={{ height: 60 }} className="px-3 border-r border-b border-[#E1E4EA]" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-center items-center w-full">
                            <Checkbox checked={isSelected} onChange={(e) => {
                                e.stopPropagation();
                                toggleItem(task._id);
                              }} />
                          </div>
                        </td>
                    ),
                    title: (
                        <td key="title" style={{ height: 60 }} className="pl-6 pr-3 py-3 border-r border-b border-[#E1E4EA]">
                          <div className="flex items-start gap-3 w-full overflow-hidden">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleTaskStatus(task);
                              }}
                              title={isCompleted ? "Mark as pending" : "Mark as complete"}
                              className={`flex-shrink-0 mt-0.5 p-0.5 rounded-full transition-all duration-200 ${isCompleted ? "bg-green-100 text-green-600" : "text-gray-300 hover:text-green-500 hover:bg-green-50"}`}
                            >
                              <CheckCircle className="w-5 h-5" />
                            </button>
                            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                              <span
                                style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 14, lineHeight: "20px", color: "#0E121B", textDecoration }}
                                className="truncate"
                              >
                                <HighlightText text={task.title || "Untitled Task"} query={searchTerm} />
                              </span>
                              <div className="flex items-center gap-1">
                                <BriefcaseIcon className="flex-shrink-0" />
                                <span
                                  style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "20px", color: "#8D8D8E", textDecoration }}
                                  className="truncate"
                                >
                                  Related to: <HighlightText text={linkedEntity?.entityId?.name || linkedEntity?.entityId?.title || "(Deal Name)"} query={searchTerm} />
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                    ),
                    assignedTo: (
                        <td key="assignedTo" style={{ height: 60 }} className="px-3 border-r border-b border-[#E1E4EA]">
                          {primaryAssignee ? (
                            <div className="flex items-center justify-start gap-2">
                              {avatarUrl ? (
                                <img
                                  src={avatarUrl}
                                  alt={primaryAssignee.name}
                                  className="rounded-full object-cover flex-shrink-0 border border-white"
                                  style={{ width: 32, height: 32 }}
                                />
                              ) : (
                                <div
                                  className="rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-semibold text-gray-600 flex-shrink-0 border border-white"
                                  style={{ width: 32, height: 32 }}
                                >
                                  {primaryAssignee.name?.charAt(0)?.toUpperCase() || "?"}
                                </div>
                              )}
                              <div className="flex flex-col min-w-0">
                                <span
                                  style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 14, lineHeight: "20px", color: "#0E121B", textDecoration }}
                                  className="truncate"
                                >
                                  <HighlightText text={primaryAssignee.name} query={searchTerm} />
                                  {assignees.length > 1 ? ` +${assignees.length - 1}` : ""}
                                </span>
                                <span
                                  style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "20px", color: "#8D8D8E", textDecoration }}
                                  className="truncate"
                                >
                                  {primaryAssignee.role || "Team Member"}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                    ),
                    status: (
                        <td key="status" style={{ height: 60 }} className="px-3 border-r border-b border-[#E1E4EA]">
                          <span
                            className="inline-flex items-center justify-center"
                            style={{
                              padding: "5px 12px",
                              borderRadius: 53,
                              backgroundColor: isCompleted ? "rgba(0, 201, 80, 0.1)" : "rgba(0, 133, 255, 0.1)",
                              fontFamily: "Inter",
                              fontWeight: 500,
                              fontSize: 12,
                              lineHeight: "120%",
                              color: isCompleted ? "#00C950" : "#0085FF",
                            }}
                          >
                            <HighlightText text={isCompleted ? "Completed" : "In-Progress"} query={searchTerm} />
                          </span>
                        </td>
                    ),
                    priority: (
                        <td key="priority" style={{ height: 60 }} className="px-3 border-r border-b border-[#E1E4EA]">
                          {priority ? (
                            <span
                              className="inline-flex items-center justify-center"
                              style={{
                                padding: "5px 12px",
                                borderRadius: 53,
                                backgroundColor: (priorityStyles[priority] || priorityStyles.medium).bg,
                                fontFamily: "Inter",
                                fontWeight: 500,
                                fontSize: 12,
                                lineHeight: "120%",
                                color: (priorityStyles[priority] || priorityStyles.medium).color,
                              }}
                            >
                              <HighlightText text={priority.charAt(0).toUpperCase() + priority.slice(1)} query={searchTerm} />
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                    ),
                    dueDate: (
                        <td key="dueDate" style={{ height: 60 }} className="px-3 border-r border-b border-[#E1E4EA]">
                          <div className="flex flex-col gap-0.5">
                            <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 14, lineHeight: "20px", color: "#525866", textDecoration }}>
                              <HighlightText text={`${dueLabel.day} ${dueLabel.time}`} query={searchTerm} />
                            </span>
                            {isCompleted ? (
                              <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 14, lineHeight: "20px", color: "#00C950" }}>
                                Completed
                              </span>
                            ) : (
                              isOverdue && (
                                <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 14, lineHeight: "20px", color: "#CD3636" }}>
                                  Overdue
                                </span>
                              )
                            )}
                          </div>
                        </td>
                    ),
                    progress: (
                        <td key="progress" style={{ height: 60 }} className="px-3 border-b border-[#E1E4EA]">
                          <div className="flex items-center gap-3">
                            <div className="flex-1 rounded-full overflow-hidden" style={{ height: 5, backgroundColor: "#D9D9D9" }}>
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${progress}%`, backgroundColor: progress === 100 ? "#00C950" : "#0085FF" }}
                              />
                            </div>
                            <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 14, lineHeight: "20px", color: "#525866" }} className="flex-shrink-0">
                              {progress}%
                            </span>
                          </div>
                        </td>
                    ),
                  };
                  return (
                    <tr key={task._id} className={`transition-colors group cursor-pointer ${isSelected ? "bg-blue-50" : "hover:bg-gray-50"}`} onClick={() => handleTaskClick(task)}>
                      {React.cloneElement(cells.__select, {
                        style: {
                          ...cells.__select.props.style,
                          position: "sticky",
                          left: 0,
                          zIndex: 10,
                          backgroundColor: isSelected ? "#EFF6FF" : "#fff",
                          boxShadow: "inset -1px 0 0 #E1E4EA, inset 0 -1px 0 #E1E4EA",
                        },
                        className: "px-3"
                      })}
                      {/* Body cells are indexed by column id and rendered through
                          orderedColumns, so hiding or pinning a column in the header
                          moves/removes the matching cell too. Each <td> is unchanged. */}
                      {orderedColumns.map((col, colIdx) => {
                        const isDragging = draggedColKey === col.id;
                        const cell = cells[col.id];
                        if (!cell) return null;

                        const stickyStyle = getStickyStyle(col.id, false, isSelected);
                        const mergedStyle = {
                          ...cell.props.style,
                          opacity: isDragging ? 0.35 : undefined,
                          ...stickyStyle,
                        };

                        const cleanClassName = (cell.props.className || "")
                          .replace("border-r", "")
                          .replace("border-b", "")
                          .replace("border-[#E1E4EA]", "");

                        const boundarySide = getBoundaryShadowSide(col.id);
                        const isLastCol = colIdx === orderedColumns.length - 1;
                        return React.cloneElement(
                          cell,
                          { style: mergedStyle, className: cleanClassName },
                          <>
                            {isLastCol ? (
                              <div className="flex items-center justify-between w-full gap-2">
                                {cell.props.children}
                                {taskActionsMenu}
                              </div>
                            ) : (
                              cell.props.children
                            )}
                            {boundarySide && <div style={getPinnedBoundaryOverlayStyle(boundarySide)} />}
                          </>
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
        <div
          ref={fillFooterRef}
          className="w-full bg-transparent px-4 py-3 mt-3 flex items-center justify-between sm:px-6"
        >
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
        columns={TASK_FILTER_COLUMNS}
        data={tasks}
        getFieldValue={getTaskFieldValue}
        selected={selectedFilters}
        onApply={setSelectedFilters}
        title="Filter Tasks"
        subtitle="Filter this list by column"
      />

      <CompanyTaskForm
        open={showTaskForm}
        mode={editingTask ? "view" : "create"}
        startInEditMode={!!editingTask}
        taskData={editingTask}
        companyId={companyId}
        contactId={contactId}
        dealId={dealId}
        users={users}
        onSave={handleTaskSave}
        onUpdate={async () => {
          await refetchTasks();
          setShowTaskForm(false);
          setEditingTask(null);
        }}
        onClose={() => {
          setShowTaskForm(false);
          setEditingTask(null);
        }}
      />

      <TaskDetailsModal
        open={isDetailsOpen}
        taskData={selectedTask}
        users={users}
        onDelete={handleTaskDelete}
        onEdit={handleEditTask}
        onComplete={handleTaskComplete}
        onClose={() => setIsDetailsOpen(false)}
      />

      {taskToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10005] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <DeleteIcon className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2 font-sf">
                Confirm Delete
              </h3>
              <p className="text-sm text-gray-500 font-inter mb-6">
                Delete task "{taskToDelete.title || "Task"}"? This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setTaskToDelete(null)}
                  disabled={deletingTask}
                  className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteTaskConfirmed}
                  disabled={deletingTask}
                  className="px-5 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors shadow-sm disabled:opacity-50"
                >
                  {deletingTask ? "Deleting..." : "Delete"}
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
                Delete {selectedItems.length} selected task{selectedItems.length !== 1 ? 's' : ''}? This action cannot be undone.
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
              <h3 className="text-lg font-bold text-gray-900 mb-4">Update Status for {selectedItems.length} Tasks</h3>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Select New Status</label>
                <select
                  value={bulkStatusValue}
                  onChange={(e) => setBulkStatusValue(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="" disabled>Select a status...</option>
                  {TASK_STATUS_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
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
}
