import CalendarClockIcon from "../common/CalendarClockIcon";
import EmptyState from "../common/EmptyState";
import Checkbox from "../common/Checkbox";
import PlusIcon from "../common/PlusIcon";
import React, { useMemo, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { getAncestorZoom } from "../../utils/domUtils";
import { getPinnedBoundaryOverlayStyle } from "../../utils/pinnedColumnShadow";
import { Link } from "react-router-dom";
import API from "../../services/api";
import toast from "react-hot-toast";
import QuickContactForm from "../contact/QuickContactForm";
import ProfilePicture from "../contact/ProfilePicture";
import { getBadgeColor } from "../../utils/contactConstants";
import useFillToBottom from "../../hooks/useFillToBottom";
import HighlightText from "../common/HighlightText";
import FilterIcon from "../common/FilterIcon";
import ToolbarFilterGroup from "./ToolbarFilterGroup";
import { applyColumnFilters } from "../../utils/advancedFilters";
import TableSkeletonRows from "../common/TableSkeletonRows";
import StatTile from "../common/StatTile";
import StatTileSkeleton from "../common/StatTileSkeleton";
import Skeleton from "../common/Skeleton";
import BulkActionBar from "../common/BulkActionBar";
import { useBulkSelection, useBulkStrip } from "../../hooks/useBulkSelection";
import { exportToCSV } from "../../utils/exportToCSV";
import { bulkDelete } from "../../utils/bulkOperations";
import { EditablePaginationButtons } from "../common/EditablePaginationButtons";
import SearchIcon from "../common/SearchIcon";
import {
  Filter,
  UserPlus,
  Contact as ContactIcon,
  BadgeCheck,
  Activity,
  Phone,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  User,
  Building2,
  Target,
  ExternalLink,
  Pin,
  PinOff,
  EyeOff,
  X, ArrowUp, ArrowDown } from "lucide-react";
import TeamIcon from "../common/TeamIcon";

const ContactNameIcon = ({ size = 20, ...props }) => (
  <svg width={size} height={size * (13 / 16)} viewBox="0 0 16 13" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M9.6475 6.85896H13.4294V5.60896H9.6475V6.85896ZM9.6475 4.45521H13.4294V3.20521H9.6475V4.45521ZM2.40396 9.29479H8.49354V8.99687C8.49354 8.44132 8.21868 8.00486 7.66896 7.6875C7.11938 7.37014 6.37931 7.21146 5.44875 7.21146C4.51819 7.21146 3.77806 7.37014 3.22833 7.6875C2.67875 8.00486 2.40396 8.44132 2.40396 8.99687V9.29479ZM6.48146 5.69625C6.76521 5.41264 6.90708 5.0684 6.90708 4.66354C6.90708 4.25854 6.76521 3.91424 6.48146 3.63063C6.19785 3.34701 5.85361 3.20521 5.44875 3.20521C5.04389 3.20521 4.69958 3.34701 4.41583 3.63063C4.13222 3.91424 3.99042 4.25854 3.99042 4.66354C3.99042 5.0684 4.13222 5.41264 4.41583 5.69625C4.69958 5.98 5.04389 6.12187 5.44875 6.12187C5.85361 6.12187 6.19785 5.98 6.48146 5.69625ZM1.50646 12.5C1.08549 12.5 0.729167 12.3542 0.4375 12.0625C0.145833 11.7708 0 11.4145 0 10.9935V1.50646C0 1.08549 0.145833 0.729167 0.4375 0.4375C0.729167 0.145833 1.08549 0 1.50646 0H14.3269C14.7478 0 15.1042 0.145833 15.3958 0.4375C15.6875 0.729167 15.8333 1.08549 15.8333 1.50646V10.9935C15.8333 11.4145 15.6875 11.7708 15.3958 12.0625C15.1042 12.3542 14.7478 12.5 14.3269 12.5H1.50646ZM1.50646 11.25H14.3269C14.391 11.25 14.4498 11.2233 14.5031 11.1698C14.5566 11.1165 14.5833 11.0577 14.5833 10.9935V1.50646C14.5833 1.44229 14.5566 1.38354 14.5031 1.33021C14.4498 1.27674 14.391 1.25 14.3269 1.25H1.50646C1.44229 1.25 1.38354 1.27674 1.33021 1.33021C1.27674 1.38354 1.25 1.44229 1.25 1.50646V10.9935C1.25 11.0577 1.27674 11.1165 1.33021 11.1698C1.38354 11.2233 1.44229 11.25 1.50646 11.25Z" fill="#525252" />
  </svg>
);

const EmailIcon = ({ size = 16, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M7.91667 15.8333C6.82264 15.8333 5.7941 15.6253 4.83104 15.2092C3.86785 14.7931 3.02993 14.2287 2.31729 13.516C1.60465 12.8034 1.04028 11.9655 0.624167 11.0023C0.208056 10.0392 0 9.01069 0 7.91667C0 6.82264 0.208056 5.7941 0.624167 4.83104C1.04028 3.86785 1.60465 3.02993 2.31729 2.31729C3.02993 1.60465 3.86785 1.04028 4.83104 0.624167C5.7941 0.208056 6.82264 0 7.91667 0C9.01069 0 10.0392 0.208056 11.0023 0.624167C11.9655 1.04028 12.8034 1.60465 13.516 2.31729C14.2287 3.02993 14.7931 3.86785 15.2092 4.83104C15.6253 5.7941 15.8333 6.82264 15.8333 7.91667V8.93271C15.8333 9.6934 15.5721 10.3392 15.0496 10.8702C14.5272 11.4012 13.8857 11.6667 13.125 11.6667C12.6335 11.6667 12.1778 11.5465 11.7579 11.306C11.3381 11.0656 11.0063 10.7349 10.7627 10.314C10.4027 10.7435 9.97729 11.0764 9.48646 11.3125C8.99549 11.5486 8.47222 11.6667 7.91667 11.6667C6.87611 11.6667 5.99097 11.3018 5.26125 10.5721C4.53153 9.84236 4.16667 8.95722 4.16667 7.91667C4.16667 6.87611 4.53153 5.99097 5.26125 5.26125C5.99097 4.53153 6.87611 4.16667 7.91667 4.16667C8.95722 4.16667 9.84236 4.53153 10.5721 5.26125C11.3018 5.99097 11.6667 6.87611 11.6667 7.91667V8.93271C11.6667 9.34187 11.8074 9.69153 12.089 9.98167C12.3705 10.2717 12.7158 10.4167 13.125 10.4167C13.5342 10.4167 13.8795 10.2717 14.161 9.98167C14.4426 9.69153 14.5833 9.34187 14.5833 8.93271V7.91667C14.5833 6.05556 13.9375 4.47917 12.6458 3.1875C11.3542 1.89583 9.77778 1.25 7.91667 1.25C6.05556 1.25 4.47917 1.89583 3.1875 3.1875C1.89583 4.47917 1.25 6.05556 1.25 7.91667C1.25 9.77778 1.89583 11.3542 3.1875 12.6458C4.47917 13.9375 6.05556 14.5833 7.91667 14.5833H12.0833V15.8333H7.91667ZM9.6875 9.6875C10.1736 9.20139 10.4167 8.61111 10.4167 7.91667C10.4167 7.22222 10.1736 6.63194 9.6875 6.14583C9.20139 5.65972 8.61111 5.41667 7.91667 5.41667C7.22222 5.41667 6.63194 5.65972 6.14583 6.14583C5.65972 6.63194 5.41667 7.22222 5.41667 7.91667C5.41667 8.61111 5.65972 9.20139 6.14583 9.6875C6.63194 10.1736 7.22222 10.4167 7.91667 10.4167C8.61111 10.4167 9.20139 10.1736 9.6875 9.6875Z" fill="#525252" />
  </svg>
);

const DecisionMakersIcon = ({ size = 20, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 18 19" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M0 18.1923V16.6923H11.5V18.1923H0ZM5.80375 13.0345L0.5 7.73075L2.25375 5.927L7.6075 11.2308L5.80375 13.0345ZM11.7308 7.1075L6.427 1.75375L8.23075 0L13.5345 5.30375L11.7308 7.1075ZM16.5422 17.096L3.8385 4.39225L4.89225 3.3385L17.596 16.0423L16.5422 17.096Z" fill="currentColor" />
  </svg>
);

const RecentInteractionsIcon = ({ size = 20, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M22.5 13.4615H17.925C17.875 13.1948 17.807 12.9381 17.721 12.6912C17.6352 12.4446 17.5282 12.2013 17.4 11.9615H20.9538C20.9064 11.7615 20.8331 11.5958 20.7337 11.4645C20.6342 11.333 20.4942 11.2211 20.3135 11.1288C19.8417 10.8659 19.3218 10.673 18.7538 10.55C18.1859 10.4268 17.5597 10.3652 16.875 10.3652C16.7558 10.3652 16.6392 10.3701 16.525 10.3798C16.4108 10.3894 16.2942 10.4071 16.175 10.4328C15.9202 10.1581 15.643 9.91917 15.3435 9.716C15.044 9.513 14.7186 9.33717 14.3673 9.1885C14.7634 9.086 15.1698 9.0065 15.5865 8.95C16.0033 8.89367 16.4328 8.8655 16.875 8.8655C17.6813 8.8655 18.4454 8.95075 19.1672 9.12125C19.8891 9.29175 20.5673 9.54233 21.202 9.873C21.6288 10.1 21.9518 10.4138 22.171 10.8145C22.3903 11.215 22.5 11.6877 22.5 12.2327V13.4615ZM16.8755 7.923C16.1252 7.923 15.4872 7.65942 14.9615 7.13225C14.4358 6.60492 14.173 5.96467 14.173 5.2115C14.173 4.45833 14.4357 3.81817 14.961 3.291C15.4862 2.76367 16.124 2.5 16.8745 2.5C17.6248 2.5 18.2628 2.76367 18.7885 3.291C19.3142 3.81817 19.577 4.45833 19.577 5.2115C19.577 5.96467 19.3143 6.60492 18.789 7.13225C18.2637 7.65942 17.6258 7.923 16.8755 7.923ZM16.8755 6.423C17.2162 6.423 17.5016 6.30717 17.7318 6.0755C17.9619 5.84367 18.077 5.5565 18.077 5.214C18.077 4.87133 17.9618 4.58333 17.7313 4.35C17.5008 4.11667 17.2152 4 16.8745 4C16.5338 4 16.2484 4.11592 16.0182 4.34775C15.7881 4.57942 15.673 4.86658 15.673 5.20925C15.673 5.55175 15.7882 5.83967 16.0188 6.073C16.2493 6.30633 16.5348 6.423 16.8755 6.423ZM1.5 13.4615V12.2327C1.5 11.6877 1.60967 11.215 1.829 10.8145C2.04817 10.4138 2.37117 10.1 2.798 9.873C3.43267 9.54233 4.11092 9.29175 4.83275 9.12125C5.55458 8.95075 6.31867 8.8655 7.125 8.8655C7.56717 8.8655 7.99667 8.89367 8.4135 8.95C8.83017 9.0065 9.23658 9.086 9.63275 9.1885C9.28142 9.33717 8.956 9.513 8.6565 9.716C8.357 9.91917 8.07983 10.1581 7.825 10.4328C7.70583 10.4071 7.58917 10.3894 7.475 10.3798C7.36083 10.3701 7.24417 10.3652 7.125 10.3652C6.44033 10.3652 5.81408 10.4268 5.24625 10.55C4.67825 10.673 4.15833 10.8659 3.6865 11.1288C3.50583 11.2211 3.36575 11.333 3.26625 11.4645C3.16692 11.5958 3.09358 11.7615 3.04625 11.9615H6.6C6.47183 12.2013 6.36483 12.4446 6.279 12.6912C6.193 12.9381 6.125 13.1948 6.075 13.4615H1.5ZM7.1255 7.923C6.37517 7.923 5.73717 7.65942 5.2115 7.13225C4.68583 6.60492 4.423 5.96467 4.423 5.2115C4.423 4.45833 4.68567 3.81817 5.211 3.291C5.73633 2.76367 6.37417 2.5 7.1245 2.5C7.87483 2.5 8.51283 2.76367 9.0385 3.291C9.56417 3.81817 9.827 4.45833 9.827 5.2115C9.827 5.96467 9.56433 6.60492 9.039 7.13225C8.51383 7.65942 7.876 7.923 7.1255 7.923ZM7.1255 6.423C7.46617 6.423 7.75158 6.30717 7.98175 6.0755C8.21192 5.84367 8.327 5.5565 8.327 5.214C8.327 4.87133 8.21175 4.58333 7.98125 4.35C7.75075 4.11667 7.46517 4 7.1245 4C6.78383 4 6.49842 4.11592 6.26825 4.34775C6.03808 4.57942 5.923 4.86658 5.923 5.20925C5.923 5.55175 6.03825 5.83967 6.26875 6.073C6.49925 6.30633 6.78483 6.423 7.1255 6.423ZM12 16.5865C11.5205 16.5865 11.1137 16.4179 10.7797 16.0807C10.4458 15.7436 10.2788 15.3352 10.2788 14.8558V11.9135C10.2788 11.434 10.4458 11.0257 10.7797 10.6885C11.1137 10.3513 11.5205 10.1828 12 10.1828C12.4795 10.1828 12.8863 10.3513 13.2203 10.6885C13.5542 11.0257 13.7212 11.434 13.7212 11.9135V14.8558C13.7212 15.3352 13.5542 15.7436 13.2203 16.0807C12.8863 16.4179 12.4795 16.5865 12 16.5865ZM11.4038 21.5V19.498C10.2616 19.3532 9.30133 18.8413 8.523 17.9625C7.74483 17.0837 7.35575 16.0481 7.35575 14.8558H8.5385C8.5385 15.8224 8.87533 16.6458 9.549 17.326C10.2227 18.0062 11.0397 18.3462 12 18.3462C12.9603 18.3462 13.7773 18.0055 14.451 17.324C15.1247 16.6425 15.4615 15.8197 15.4615 14.8558H16.6538C16.6538 16.0481 16.2631 17.0837 15.4818 17.9625C14.7003 18.8413 13.7384 19.3532 12.5963 19.498V21.5H11.4038Z" fill="currentColor" />
  </svg>
);

const EMAIL_DOMAIN_SUFFIXES = [
  ".com",
  ".in",
  ".org",
  ".net",
  ".co",
  ".io",
  ".biz",
  ".info",
  ".edu",
  ".gov",
  ".us",
  ".uk",
];

const CONTACT_FILTER_COLUMNS = [
  { key: "email", label: "Email", options: EMAIL_DOMAIN_SUFFIXES },
  { key: "role", label: "Role" },
  { key: "status", label: "Interaction" },
];

const getEmailSuffix = (email) => {
  const domain = (email || "").split("@")[1];
  if (!domain || !domain.includes(".")) return "";
  return "." + domain.split(".").pop();
};

const getContactFieldValue = (contact, key) => {
  if (key === "status") return contact.lifecycleStage || contact.status || "";
  if (key === "email") return getEmailSuffix(contact.email);
  if (key === "role") {
    return (
      contact.additionalFields?.find((f) =>
        /^(role|designation|job title)$/i.test(f.key || ""),
      )?.value || ""
    );
  }
  return contact[key];
};

export default function CompanyContactsTab({ contacts, meetings = [], tasks = [], showStats = true, companyId, company, setContacts, isLoading, autoOpenCreate = false, onAutoOpenCreateConsumed }) {
  const [manualContactFormOpen, setManualContactFormOpen] = useState(false);
  // Derived rather than copied into local state on a one-shot effect — a
  // copy raced the initial data load (whichever re-rendered first won) and
  // could get clobbered before ever becoming visible.
  const showContactForm = manualContactFormOpen || autoOpenCreate;
  const closeContactForm = () => {
    setManualContactFormOpen(false);
    if (autoOpenCreate) onAutoOpenCreateConsumed?.();
  };
  const [searchTerm, setSearchTerm] = useState("");
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState({});
  const [sortConfig, setSortConfig] = useState({ key: null, direction: null });

  const filteredContacts = useMemo(() => {
    let result = contacts;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(
        (c) =>
          (c.name || "").toLowerCase().includes(q) ||
          (c.email || "").toLowerCase().includes(q) ||
          (c.phone || "").toLowerCase().includes(q) ||
          (c.role || "").toLowerCase().includes(q),
      );
    }
    return applyColumnFilters(result, selectedFilters, getContactFieldValue);
  }, [contacts, searchTerm, selectedFilters]);

  const sortedContacts = useMemo(() => {
    if (!sortConfig.key) return filteredContacts;
    return [...filteredContacts].sort((a, b) => {
      const aVal = (getContactFieldValue(a, sortConfig.key) || "").toString().toLowerCase();
      const bVal = (getContactFieldValue(b, sortConfig.key) || "").toString().toLowerCase();
      if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredContacts, sortConfig]);

  const { selectedItems, toggleItem, clearSelection, selectAll } = useBulkSelection({
    items: filteredContacts,
    onDelete: () => setShowBulkDeleteModal(true)
  });

  // Keeps the bulk strip mounted for one beat after deselect so its
  // slide-out animation can play instead of vanishing on the same frame.
  const { visible: bulkStripVisible, closing: bulkStripClosing } =
    useBulkStrip(selectedItems.length);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);

  const handleSort = (key, forceDirection = null) => {
    setSortConfig((prev) => {
      if (forceDirection) {
        return prev.key === key && prev.direction === forceDirection
          ? { key: null, direction: null }
          : { key, direction: forceDirection };
      }
      if (prev.key !== key) return { key, direction: "asc" };
      if (prev.direction === "asc") return { key, direction: "desc" };
      return { key: null, direction: null };
    });
  };
  // Keeps the table box a fixed height that ends at the bottom of the screen,
  // so changing rows-per-page scrolls internally instead of growing the page.
  const {
    containerRef: fillContainerRef,
    footerRef: fillFooterRef,
    style: fillStyle,
  } = useFillToBottom();

  const [currentPage, setCurrentPage] = useState(1);
  const [limit, setLimit] = useState(10);
  
  const [hiddenColumns, setHiddenColumns] = useState(new Set());
  const [leftPinned, setLeftPinned] = useState(new Set());
  const [rightPinned, setRightPinned] = useState(new Set());
  const [openColumnMenuKey, setOpenColumnMenuKey] = useState(null);
  const [columnMenuPos, setColumnMenuPos] = useState(null);
  const columnMenuRef = useRef(null);

  const BASE_COLUMNS = useMemo(() => [
    { id: "name", label: "Contact Name", width: 275 },
    { id: "email", label: "Email", width: 244 },
    { id: "phone", label: "Phone Number", width: 232 },
    { id: "role", label: "Role", width: 244 },
    { id: "status", label: "Interaction", width: 331 },
  ], []);

  const [columnOrder, setColumnOrder] = useState(() => BASE_COLUMNS.map(c => c.id));
  const [draggedColKey, setDraggedColKey] = useState(null);
  const [dragOverColKey, setDragOverColKey] = useState(null);
  const [dragGhost, setDragGhost] = useState(null);
  const dragOverRef = useRef(null);
  const ghostElRef = useRef(null);

  const orderedColumns = useMemo(() => {
    const sortedBase = [...BASE_COLUMNS].sort((a, b) => columnOrder.indexOf(a.id) - columnOrder.indexOf(b.id));
    const visible = sortedBase.filter(c => !hiddenColumns.has(c.id));
    const left = visible.filter(c => leftPinned.has(c.id));
    const right = visible.filter(c => rightPinned.has(c.id));
    const unpinned = visible.filter(c => !leftPinned.has(c.id) && !rightPinned.has(c.id));
    return [...left, ...unpinned, ...right];
  }, [BASE_COLUMNS, hiddenColumns, leftPinned, rightPinned, columnOrder]);

  const pinColumnToSide = (colId, side) => {
    if (side === "left") {
      setLeftPinned(prev => new Set(prev).add(colId));
      setRightPinned(prev => { const next = new Set(prev); next.delete(colId); return next; });
    } else {
      setRightPinned(prev => new Set(prev).add(colId));
      setLeftPinned(prev => { const next = new Set(prev); next.delete(colId); return next; });
    }
  };

  const unpinColumn = (colId) => {
    setLeftPinned(prev => { const next = new Set(prev); next.delete(colId); return next; });
    setRightPinned(prev => { const next = new Set(prev); next.delete(colId); return next; });
  };

  const toggleHideColumn = (colId) => {
    setHiddenColumns(prev => {
      const next = new Set(prev);
      next.add(colId);
      return next;
    });
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
    
      const previewRows = (contacts || []).slice(0, 10).map((c) => {
        let val = getContactFieldValue(c, colId);
        if (typeof val === 'object' && val !== null) val = val?.name || "";
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
    name: 275,
    email: 244,
    phone: 232,
    role: 244,
    status: 331,
  });
  const [resizingCol, setResizingCol] = useState(null);
  const resizingRef = React.useRef(null);
  const totalTableWidth = useMemo(
    () => Object.values(colWidths).reduce((sum, w) => sum + w, 0),
    [colWidths],
  );

  const stickyStyles = useMemo(() => {
    const map = {};
    let leftOffset = 44; // selection column width is 44px
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

  // Which side (if any) gets the soft depth-edge shadow — the boundary cell
  // of the pinned block itself (last left-pinned column / first right-pinned
  // one), same rule and same shared overlay as the main Companies list, so a
  // pinned column here reads identically instead of using the old inward
  // inset-shadow variant.
  const getBoundaryShadowSide = (colId) => {
    const leftPinnedCols = orderedColumns.filter(c => leftPinned.has(c.id));
    const rightPinnedCols = orderedColumns.filter(c => rightPinned.has(c.id));
    if (leftPinnedCols.length > 0 && leftPinnedCols[leftPinnedCols.length - 1].id === colId) return "left";
    if (rightPinnedCols.length > 0 && rightPinnedCols[0].id === colId) return "right";
    return null;
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

  const decisionMakers = contacts.filter(
    (c) => c.lifecycleStage === "Customer",
  ).length;

  const upcomingFollowUps = [...tasks, ...meetings].filter((item) => {
    const date = item.dueDate || item.scheduledAt;
    return date && new Date(date) >= new Date();
  }).length;

  const totalCount = filteredContacts.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const startItem = totalCount === 0 ? 0 : (currentPage - 1) * limit + 1;
  const endItem = Math.min(currentPage * limit, totalCount);
  const hasPrevPage = currentPage > 1;
  const hasNextPage = currentPage < totalPages;

  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  const handleExportSelected = () => {
    const dataToExport = contacts.filter(c => selectedItems.includes(c._id)).map(c => ({
      "Contact Name": c.name || "",
      "Email": c.email || "",
      "Phone": c.phone || "",
      "Role": getContactFieldValue(c, "role"),
      "Interaction": getContactFieldValue(c, "status"),
    }));
    const headers = Object.keys(dataToExport[0] || {}).join(",");
    const rows = dataToExport.map(row => Object.values(row).map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
    exportToCSV([headers, ...rows], `contacts_export_${new Date().toISOString().split("T")[0]}.csv`);
  };

  const handleBulkDelete = async () => {
    setBulkActionLoading(true);
    try {
      await bulkDelete("contacts", selectedItems);
      setContacts?.(prev => prev.filter(c => !selectedItems.includes(c._id)));
      toast.success(`${selectedItems.length} contact(s) deleted`);
      clearSelection();
      setShowBulkDeleteModal(false);
    } catch (error) {
      console.error("Bulk delete failed:", error);
      toast.error(error.response?.data?.message || "Failed to delete contacts");
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleSelectAllAcrossPages = () => selectAll(filteredContacts);

  const handleLimitChange = (newLimit) => {
    setLimit(newLimit);
    setCurrentPage(1);
  };

  const getPageNumbers = () => {
    const items = [1];
    if (currentPage > 2) items.push("left-dots");
    if (currentPage !== 1 && currentPage !== totalPages) items.push(currentPage);
    if (currentPage < totalPages - 1) items.push("right-dots");
    if (totalPages > 1) items.push(totalPages);
    return items;
  };

  const paginatedContacts = useMemo(
    () => sortedContacts.slice((currentPage - 1) * limit, currentPage * limit),
    [sortedContacts, currentPage, limit],
  );

  const kpiTiles = [
    { label: "Total Contacts", value: contacts.length, icon: ContactIcon },
    { label: "Decision Makers", value: decisionMakers, icon: DecisionMakersIcon },
    { label: "Recent Interactions", value: meetings.length, icon: RecentInteractionsIcon },
    { label: "Upcoming Follow-ups", value: upcomingFollowUps, icon: CalendarClockIcon },
  ];

  return (
    <div>
      {/* KPI Tiles */}
      {showStats && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
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
          <Skeleton height={44} width={86} shape="rect" className="rounded-full flex-shrink-0" />
          <Skeleton height={44} width={44} shape="circle" className="flex-shrink-0" />
        </div>
      ) : bulkStripVisible ? (
        <BulkActionBar
          isClosing={bulkStripClosing}
          selectedCount={selectedItems.length}
          entityName="contact"
          onSelectAll={handleSelectAllAcrossPages}
          onDeselectAll={clearSelection}
          onExport={handleExportSelected}
          onDelete={() => setShowBulkDeleteModal(true)}
          onCancel={clearSelection}
        />
      ) : (
        <div className="flex flex-wrap lg:flex-nowrap items-center gap-4 mb-4" style={{ minHeight: "44px" }}>
          <div className="relative flex-1 min-w-[180px] h-[44px]">
            <SearchIcon
              className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#525866]"
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by contact by name, email, or phone..."
              className="w-full h-full pl-10 pr-10 border border-[rgba(31,41,55,0.1)] rounded-full text-sm focus:outline-none focus:border-[#0085FF]"
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
          <ToolbarFilterGroup
            isOpen={showFilterPanel}
            columns={CONTACT_FILTER_COLUMNS}
            data={contacts}
            getFieldValue={getContactFieldValue}
            selected={selectedFilters}
            onApply={setSelectedFilters}
          />
          <button
            onClick={() => setShowFilterPanel((open) => !open)}
            aria-expanded={showFilterPanel}
            className={`relative flex items-center justify-center gap-2 px-3 text-sm font-medium bg-white border rounded-full hover:bg-gray-50 flex-shrink-0 transition-colors ${
              showFilterPanel ? "text-[#0085FF]" : "text-gray-800"
            }`}
            style={{
              height: "44px",
              borderColor: showFilterPanel || Object.values(selectedFilters).flat().length > 0 ? "#0085FF" : "#E1E4EA",
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
            onClick={() => setManualContactFormOpen(true)}
            className="flex items-center justify-center rounded-full border hover:bg-gray-50 flex-shrink-0"
            style={{ width: "44px", height: "44px", borderColor: "#E1E4EA" }}
            title="Add Contact"
          >
            <PlusIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {showContactForm && (
        <QuickContactForm
          companies={company ? [company] : []}
          initialCompanyId={companyId}
          onContactCreated={async () => {
            try {
              const res = await API.get("/contacts");
              setContacts?.(res.data.filter((c) => c.company?._id === companyId));
              toast.success("Contact created successfully!");
            } catch (err) {
              toast.error("Failed to refresh contacts list.");
            }
            closeContactForm();
          }}
          onRequestClose={closeContactForm}
        />
      )}

      {!isLoading && contacts.length === 0 ? (
        <div className="flex items-center justify-center w-full min-h-[300px] bg-white border border-[#E1E4EA] rounded-xl">
          <EmptyState icon={TeamIcon} noun="Contact" onCreate={() => setManualContactFormOpen(true)} />
        </div>
      ) : (
        <div
          ref={fillContainerRef}
          style={fillStyle}
          className="relative bg-white border border-[#E1E4EA] rounded-lg overflow-x-auto overflow-y-auto"
        >
          <table
            className="w-full border-separate border-spacing-0 text-left"
            style={{ tableLayout: "fixed", width: "100%", minWidth: totalTableWidth, maxWidth: "100%" }}
          >
            <thead className="sticky top-0 z-30 bg-[#F5F7FA] border-b border-[#E1E4EA]">
              <tr>
                {/* Page-scoped select-all: ticks exactly the rows on the CURRENT page
                    (10 per page -> 10, 50 -> 50). Distinct from the bulk strip's
                    "Select All", which spans every record across all pages. */}
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
                    <Checkbox checked={selectedItems.length > 0 && selectedItems.length === paginatedContacts.length} onChange={(e) => e.target.checked ? selectAll(paginatedContacts) : clearSelection()}  uncheckedColor="text-[#525866]"/>
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
                      className={`px-3 py-2.5 font-medium text-[#525866] text-xs cursor-grab active:cursor-grabbing bg-[#F5F7FA] ${isDragOver ? "bg-blue-100" : "hover:bg-gray-100"}`}
                    >
                      <div className={`flex items-center justify-between w-full group ${isLoading ? "[&_button]:invisible" : ""}`}>
                        {/* Header label swaps to a skeleton bar on the same flag as the
                            body rows, so the whole table resolves in one step. Controls
                            are hidden rather than unmounted to keep the layout stable. */}
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
                                setCurrentPage(1);
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
                                setCurrentPage(1);
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

                      <div
                        data-resize-handle="true"
                        onMouseDown={(e) => startResize(e, col.id)}
                        className={`absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none hover:bg-blue-400 z-10 ${resizingCol === col.id ? "bg-blue-500" : "bg-transparent"}`}
                      />
                    </div>
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
                hasCheckbox={false}
                numRows={limit}
                rowHeight={54}
              />
            ) : paginatedContacts.length === 0 ? (
              <tr>
                <td colSpan={orderedColumns.length}>
  <EmptyState icon={TeamIcon} noun="Contact" isFiltered />
</td>
              </tr>
            ) : (
              paginatedContacts.map((contact) => {
                const isSelected = selectedItems.includes(contact._id);
                return (
                  <tr key={contact._id} className={`hover:bg-gray-50 transition-colors group ${isSelected ? "!bg-blue-50" : ""}`}>
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
                      className="px-3"
                    >
                      <div className="flex justify-center items-center w-full">
                        <Checkbox checked={isSelected} onChange={() => toggleItem(contact._id)} />
                      </div>
                    </td>
                    {orderedColumns.map((col) => {
                      const isDragging = draggedColKey === col.id;
                      const cellStyle = {
                        height: 54,
                        opacity: isDragging ? 0.35 : 1,
                        ...getStickyStyle(col.id, false, isSelected),
                      };
                      const boundarySide = getBoundaryShadowSide(col.id);
                      const boundaryOverlay = boundarySide && <div style={getPinnedBoundaryOverlayStyle(boundarySide)} />;
                      const isLastCol = col.id === orderedColumns[orderedColumns.length - 1]?.id;
                      // Was a MoreVertical button with no onClick — a dead control.
                      // Replaced with a direct link to the same contact detail route
                      // the Name cell already uses (/contacts/:id), so a row can be
                      // opened from here without depending on which column is last.
                      const openContactButton = (
                        <Link
                          to={`/contacts/${contact._id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                          title="Open contact details"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Link>
                      );

                      if (col.id === "name") {
                        return (
                          <td key={col.id} style={cellStyle} className="px-3 text-left">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center space-x-3 truncate min-w-0">
                                <div className="flex-shrink-0">
                                  <ProfilePicture contact={contact} />
                                </div>
                                <Link
                                  to={`/contacts/${contact._id}`}
                                  className="text-sm font-semibold text-[#0085FF] truncate hover:underline hover:text-[#004CFF] transition-all duration-150 ease-out"
                                  title={contact.name}
                                >
                                  <HighlightText text={contact.name} query={searchTerm} />
                                </Link>
                              </div>
                              {isLastCol && openContactButton}
                            </div>
                            {boundaryOverlay}
                          </td>
                        );
                      }
                      if (col.id === "email") {
                        return (
                          <td key={col.id} style={cellStyle} className="px-3 text-left" title={contact.email}>
                            <div className="flex items-center justify-between gap-2">
                              <a
                                href={`mailto:${contact.email}?body=${encodeURIComponent(`Dear ${contact.name || "Sir/Madam"},\n\n\nRegards`)}`}
                                className="text-[14px] leading-5 font-medium text-blue-600 hover:underline transition-colors truncate block min-w-0"
                              >
                                <HighlightText text={contact.email} query={searchTerm} />
                              </a>
                              {isLastCol && openContactButton}
                            </div>
                            {boundaryOverlay}
                          </td>
                        );
                      }
                      if (col.id === "phone") {
                        return (
                          <td key={col.id} style={cellStyle} className="px-3 text-left whitespace-nowrap" title={contact.phone}>
                            <div className="flex items-center justify-between gap-2">
                              {contact.phone ? (
                                <a
                                  href={`tel:${contact.phone}`}
                                  className="text-[14px] leading-5 font-medium text-blue-600 hover:underline transition-colors"
                                >
                                  <HighlightText text={contact.phone} query={searchTerm} />
                                </a>
                              ) : (
                                <span className="text-[14px] leading-5 font-medium text-gray-400">—</span>
                              )}
                              {isLastCol && openContactButton}
                            </div>
                            {boundaryOverlay}
                          </td>
                        );
                      }
                      if (col.id === "role") {
                        return (
                          <td
                            key={col.id}
                            style={cellStyle}
                            className="px-3 text-[14px] leading-5 font-medium text-[#525866] text-left"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate block min-w-0">
                                <HighlightText text={contact.role} query={searchTerm} />
                              </span>
                              {isLastCol && openContactButton}
                            </div>
                            {boundaryOverlay}
                          </td>
                        );
                      }
                      if (col.id === "status") {
                        return (
                          <td key={col.id} style={cellStyle} className="px-3">
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getBadgeColor(
                                  contact.stageStatus || contact.lifecycleStage
                                )}`}
                              >
                                <HighlightText text={contact.stageStatus || contact.lifecycleStage || "New"} query={searchTerm} />
                              </span>
                              {isLastCol && openContactButton}
                            </div>
                            {boundaryOverlay}
                          </td>
                        );
                      }
                      return null;
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      )}

      {totalCount > 0 && (
        <div
          ref={fillFooterRef}
          className="w-full bg-transparent px-4 py-3 mt-3 flex items-center justify-between sm:px-6"
        >
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
              <select
                value={limit}
                onChange={(e) => handleLimitChange(parseInt(e.target.value))}
                className="ml-2 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer font-inter"
              >
                <option value={10}>10 per page</option>
                <option value={20}>20 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
              </select>
            </div>

            <EditablePaginationButtons
              currentPage={currentPage}
              totalPages={totalPages}
              hasPrevPage={hasPrevPage}
              hasNextPage={hasNextPage}
              onPageChange={handlePageChange}
              getPageNumbers={getPageNumbers}
            />
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
                Delete {selectedItems.length} selected contact{selectedItems.length !== 1 ? 's' : ''}? This action cannot be undone.
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
    </div>
  );
}
