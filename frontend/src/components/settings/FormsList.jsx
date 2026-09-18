// components/settings/FormsList.jsx
// Forms List. Originally a minimal table (search + module select + prev/next); now carries the
// same table machinery every other CRM list page has, ported from Companies.jsx: column settings
// (show/hide, reorder by drag, resize, pin left/right), per-column sort menus driving server-side
// sorting, row selection with a bulk action strip (export / status change / delete), the shared
// AdvancedFilterPanel, a quick-view drawer, and the numbered pagination bar with a page-size
// selector. Same "copy, don't extract" decision as before (FORMS_FRONTEND_ARCHITECTURE.md) —
// shared pieces that ALREADY exist as components (EmptyState, ExportModal, BulkDeleteModal,
// ColumnSettingsPanel, AdvancedFilterPanel, TableSkeletonRows, Checkbox) are reused; the
// page-specific glue is copied rather than abstracted into a new shared table.
//
// Two deliberate departures from Companies.jsx:
//   1. This renders INSIDE the Settings shell, so the toolbar is inline in the card rather than a
//      position:fixed page bar, and the pagination sits under the table instead of pinned to the
//      viewport bottom.
//   2. Bulk actions loop the existing per-form endpoints instead of new bulk endpoints. Each
//      form's status transition has its own server-side rules (a published form must be archived
//      before deletion, a form with submissions can't be deleted at all), and looping keeps every
//      one of those rules authoritative instead of re-implementing them in a bulk handler.
import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createPortal } from "react-dom";
import API from "../../services/api";
import toast from "react-hot-toast";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import {
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ArrowUp,
  ArrowDown,
  Pin,
  PinOff,
  EyeOff,
  User,
  Building2,
  Truck,
  Lock,
  WifiOff,
  AlertTriangle,
  ShieldOff,
  CheckSquare,
  Columns3,
  Copy,
  Play,
  Pause,
  Archive,
  ArchiveRestore,
  Send,
} from "lucide-react";
import FormIcon from "../common/FormIcon";
import AddFormIcon from "../common/AddFormIcon";
import PlusIcon from "../common/PlusIcon";
import DeleteIcon from "../common/DeleteIcon";
import EyeIcon from "../common/EyeIcon";
import MoreIcon from "../common/MoreIcon";
import SearchIcon from "../common/SearchIcon";
import FilterIcon from "../common/FilterIcon";
import DownloadIcon from "../common/DownloadIcon";
import Checkbox from "../common/Checkbox";
import EmptyState from "../common/EmptyState";
import HighlightText from "../common/HighlightText";
import TableSkeletonRows from "../common/TableSkeletonRows";
import BulkDeleteModal from "../common/BulkDeleteModal";
import ExportModal from "../common/ExportModal";
import AdvancedFilterPanel from "../common/AdvancedFilterPanel";
import ColumnSettingsPanel from "../ColumnSettingsPanel";
import { useColumnSettings } from "../../hooks/useColumnSettings";
import { getPinnedBoundaryOverlayStyle } from "../../utils/pinnedColumnShadow";
import { exportRecordsToCSV } from "../../utils/exportRecordsToCSV";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

// Same zoom correction Companies.jsx uses: menus and the drag ghost portal into document.body,
// which paints inside the app's dynamic <html> zoom, so every rect-derived coordinate set on them
// has to be divided back out of that zoom.
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

const STATUS_CONFIG = {
  draft: { bg: "bg-gray-50", text: "text-gray-700", border: "border-gray-200", dot: "bg-gray-400" },
  published: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200", dot: "bg-green-500" },
  paused: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-500" },
  archived: { bg: "bg-[#EEF2F9]", text: "text-[#56698A]", border: "border-[#D6DEEC]", dot: "bg-[#56698A]" },
};

const FormStatusBadge = ({ status }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

const MODULE_ICONS = { Contact: User, Company: Building2, Vendor: Truck };
const ModuleTag = ({ module }) => {
  const Icon = MODULE_ICONS[module] || FormIcon;
  return (
    <span className="inline-flex items-center gap-1.5 text-gray-700">
      <Icon className="w-3.5 h-3.5 text-gray-400" />
      {module}
    </span>
  );
};

// Small inline relative-time helper — no shared date util exists in this codebase (confirmed in
// the frontend audit), so this stays local rather than becoming a new shared abstraction.
function timeAgo(dateString) {
  if (!dateString) return "—";
  const diffMs = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(dateString).toLocaleDateString();
}

const MODULE_OPTIONS = ["Contact", "Company", "Vendor"];
const STATUS_OPTIONS = ["draft", "published", "paused", "archived"];

// Which one-click transitions each status allows, mirroring the backend's own route set
// (publish / pause / resume / archive). A transition absent here is one the server would reject,
// so it is never offered in the UI.
const STATUS_ACTIONS = {
  draft: [{ key: "publish", label: "Publish", icon: Send }],
  published: [
    { key: "pause", label: "Pause", icon: Pause },
    { key: "archive", label: "Archive", icon: Archive },
  ],
  paused: [
    { key: "resume", label: "Resume", icon: Play },
    { key: "archive", label: "Archive", icon: Archive },
  ],
  // Archived is described as terminal in FORMS_DOMAIN_MODEL.md §5, but only in the sense that
  // nothing archives itself back — formPublishService.publishForm has no status precondition, so
  // republishing an archived form is a supported server-side transition that puts it back live on
  // its existing public slug. Offering it here is the only way out of archived short of deleting.
  archived: [
    { key: "unarchive", label: "Unarchive", icon: ArchiveRestore },
    { key: "publish", label: "Restore & Publish", icon: Send },
  ],
};

const PUBLIC_BASE = window.location.origin;

function CreateFormModal({ onClose, onCreated }) {
  const [title, setTitle] = useState("");
  const [module, setModule] = useState("Contact");
  const [submitting, setSubmitting] = useState(false);
  useBodyScrollLock(true);

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await API.post("/forms", { title: title.trim(), module });
      toast.success("Form created");
      onCreated(res.data.form);
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to create form");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[10000] p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full flex flex-col animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 rounded-lg">
              <AddFormIcon className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">New Form</h2>
              <p className="text-xs text-gray-500">Set a title and module to get started</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Contact Us"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Module</label>
            <select
              value={module}
              onChange={(e) => setModule(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {MODULE_OPTIONS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            {/* Permanent-choice note per FORMS_FRONTEND_ARCHITECTURE.md §2.7 — module is immutable
                after creation (routing/schemaHash key off it), so this must be stated up front. */}
            <p className="text-xs text-gray-500 mt-1">Module can't be changed after creating this form.</p>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
          >
            {submitting ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

// The Settings shell (Settings.jsx) owns the fixed header strip — Back, title, description —
// and exposes #settings-header-actions inside it for a section's own controls. Portalling the
// toolbar there puts search/filters/New Form on that strip, the way Companies' toolbar and page
// title share one bar, instead of stacking a second toolbar row under it. The node only exists
// after the shell has mounted, hence the effect rather than a direct getElementById at render.
function HeaderStripPortal({ children }) {
  const [host, setHost] = useState(null);
  useEffect(() => {
    setHost(document.getElementById("settings-header-actions"));
  }, []);
  if (!host) return null;
  return createPortal(children, host);
}

const columnHelper = createColumnHelper();

const FormsList = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  // Classified failure state — a bare "Access denied" string can't distinguish "you're out of
  // plan" from "you lack permission" from "server is down", and each of those needs a different
  // UI (upgrade card vs. contact-admin vs. retry). `type` drives which card renders; `message`/
  // `planName` carry the backend's actual text so we're not inventing copy it didn't send.
  const [error, setError] = useState(null); // { type: "module"|"permission"|"network"|"server", message, planName? } | null
  const [permission, setPermission] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null); // form object or null
  const [deleting, setDeleting] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [search, setSearch] = useState("");
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const searchInputRef = useRef(null);
  const [moduleFilter] = useState(searchParams.get("module") || "");
  // Module/status are still real query params (module is seeded from ?module= on the URL, both
  // are sent to /forms), but they no longer have their own dropdowns in the strip — the filter
  // panel is the one place filters are set, so the strip isn't two filter UIs side by side.
  const [statusFilter] = useState("");
  const [activeFilters, setActiveFilters] = useState([]);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: null });

  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 0,
    totalCount: 0,
    limit: 20,
    hasNextPage: false,
    hasPrevPage: false,
  });
  const [editingPage, setEditingPage] = useState(false);
  const [pageInput, setPageInput] = useState("");

  // Selection / bulk
  const [selectedForms, setSelectedForms] = useState([]);
  const selectedFormsSet = useMemo(() => new Set(selectedForms), [selectedForms]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [bulkStatusMenuOpen, setBulkStatusMenuOpen] = useState(false);

  // Column machinery
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [columnSizing, setColumnSizing] = useState({});
  const [pinnedColumns, setPinnedColumns] = useState([]); // [{ key, side: 'left' | 'right' }]
  const [openColumnMenuKey, setOpenColumnMenuKey] = useState(null);
  const [columnMenuPos, setColumnMenuPos] = useState(null);
  const [openRowActionsId, setOpenRowActionsId] = useState(null);
  const [rowActionsPos, setRowActionsPos] = useState(null);
  const [draggedColKey, setDraggedColKey] = useState(null);
  const [dragOverColKey, setDragOverColKey] = useState(null);
  const [dragGhost, setDragGhost] = useState(null);
  const dragOverRef = useRef(null);
  const ghostElRef = useRef(null);
  const tableScrollRef = useRef(null);

  const pinColumnToSide = (colKey, side) =>
    setPinnedColumns((prev) => [...prev.filter((p) => p.key !== colKey), { key: colKey, side }]);
  const unpinColumn = (colKey) => setPinnedColumns((prev) => prev.filter((p) => p.key !== colKey));
  const getColumnPinSide = (colKey) => pinnedColumns.find((p) => p.key === colKey)?.side || null;

  // Columns a person can actually reorder/hide/sort. `sortable: false` on Submissions and Version
  // is not cosmetic: submissionCount is aggregated per page and versionNumber is resolved from a
  // separate collection, so neither can be sorted server-side without lying about rows on other
  // pages (see listForms' SORTABLE_FIELDS whitelist).
  const defaultColumns = useMemo(
    () => [
      { key: "title", label: "Title", visible: true, order: 0, required: true, defaultVisible: true, sortable: true },
      { key: "module", label: "Module", visible: true, order: 1, sortable: true, type: "select", options: MODULE_OPTIONS },
      { key: "status", label: "Status", visible: true, order: 2, sortable: true, type: "select", options: STATUS_OPTIONS },
      { key: "submissionCount", label: "Submissions", visible: true, order: 3, sortable: false },
      { key: "versionNumber", label: "Version", visible: false, order: 4, sortable: false },
      { key: "updatedAt", label: "Updated", visible: true, order: 5, sortable: true },
      { key: "createdAt", label: "Created", visible: false, order: 6, sortable: true },
    ],
    []
  );

  const { columns, saveColumns, getVisibleColumns } = useColumnSettings("forms", defaultColumns);
  const visibleColumns = useMemo(() => getVisibleColumns(), [columns]);

  // Permission gating — copies Contacts.jsx's exact per-page pattern (architecture doc §2.6).
  useEffect(() => {
    const fetchPermission = async () => {
      try {
        const res = await API.get("/auth/me");
        const p = res.data.user?.permissions?.find((p) => p.name.toLowerCase() === "forms");
        setPermission(p?.permission || "no");
      } catch {
        console.error("Failed to fetch user permissions");
      }
    };
    fetchPermission();
  }, []);

  const buildParams = useCallback(
    (page, limit) => {
      const params = { page, limit: limit ?? pagination.limit };
      if (search.trim()) params.search = search.trim();
      if (moduleFilter) params.module = moduleFilter;
      if (statusFilter) params.status = statusFilter;
      if (sortConfig.key) {
        params.sortBy = sortConfig.key;
        params.sortOrder = sortConfig.direction || "asc";
      }
      if (activeFilters.length > 0) params.advancedFilters = JSON.stringify(activeFilters);
      return params;
    },
    [search, moduleFilter, statusFilter, sortConfig, activeFilters, pagination.limit]
  );

  const fetchForms = useCallback(
    async (page = 1, limitOverride) => {
      try {
        setLoading(true);
        setError(null);
        const res = await API.get("/forms", { params: buildParams(page, limitOverride) });
        setForms(res.data.forms || []);
        setPagination((prev) => ({ ...prev, ...res.data.pagination }));
      } catch (err) {
        console.error("Error fetching forms:", err);
        // Distinct error state — a permission/network failure must never look identical to a
        // genuinely empty list, and the four failure modes below each need a different UI (only
        // "network"/"server" make Retry meaningful — retrying a plan/permission block just repeats
        // the same 403 forever).
        const status = err.response?.status;
        const code = err.response?.data?.code;
        let classified;
        if (!err.response) {
          classified = { type: "network", message: "Couldn't connect to the server." };
        } else if (status === 403 && code === "MODULE_NOT_AVAILABLE") {
          classified = { type: "module", message: err.response.data?.error, planName: err.response.data?.planName };
        } else if (status === 403) {
          classified = { type: "permission", message: err.response.data?.error || "You don't have permission to access Forms." };
        } else if (status >= 500) {
          classified = { type: "server", message: "Our server encountered an error." };
        } else {
          classified = { type: "server", message: err.response.data?.error || "Failed to load forms." };
        }
        setError(classified);
        toast.error(classified.message);
      } finally {
        setLoading(false);
      }
    },
    [buildParams]
  );

  useEffect(() => {
    fetchForms(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, moduleFilter, statusFilter, sortConfig, activeFilters]);

  const handlePageChange = (page) => {
    if (page < 1 || page > pagination.totalPages) return;
    fetchForms(page);
  };

  const handleLimitChange = (newLimit) => {
    setPagination((prev) => ({ ...prev, limit: newLimit, currentPage: 1 }));
    fetchForms(1, newLimit);
  };

  // --- Selection -------------------------------------------------------------
  const toggleSelectForm = (id) =>
    setSelectedForms((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));

  const handleSelectAllOnPage = () => {
    const pageIds = forms.map((f) => f._id);
    const allSelected = pageIds.every((id) => selectedFormsSet.has(id));
    setSelectedForms((prev) =>
      allSelected ? prev.filter((id) => !pageIds.includes(id)) : [...new Set([...prev, ...pageIds])]
    );
  };

  // "Select All" spans every page of the CURRENT filter, not just the rows on screen — otherwise
  // the count in the strip would quietly mean something different from what the filter shows. The
  // backend caps limit at 100, so this walks the pages rather than asking for everything at once.
  const handleSelectAllAcrossPages = async () => {
    try {
      setBulkLoading(true);
      const ids = [];
      let page = 1;
      let totalPages = 1;
      do {
        const res = await API.get("/forms", { params: buildParams(page, 100) });
        ids.push(...(res.data.forms || []).map((f) => f._id));
        totalPages = res.data.pagination?.totalPages || 1;
        page += 1;
      } while (page <= totalPages);
      setSelectedForms(ids);
      toast.success(`Selected ${ids.length} form${ids.length === 1 ? "" : "s"}`);
    } catch {
      toast.error("Couldn't select every form. Try again.");
    } finally {
      setBulkLoading(false);
    }
  };

  const exitSelectionMode = () => setSelectedForms([]);

  const selectedFormObjects = useMemo(
    () => forms.filter((f) => selectedFormsSet.has(f._id)),
    [forms, selectedFormsSet]
  );

  // --- Mutations -------------------------------------------------------------
  // Every bulk action funnels through here: run the same single-form endpoint per row, keep each
  // row's own failure reason, and report one summary. Partial success is the normal case (e.g.
  // archiving a mixed selection), so a single "failed" toast would be wrong.
  const runBulk = async (ids, verb, requestFor) => {
    setBulkLoading(true);
    const results = await Promise.allSettled(ids.map((id) => requestFor(id)));
    const failures = results
      .map((r, i) => (r.status === "rejected" ? { id: ids[i], reason: r.reason?.response?.data?.error } : null))
      .filter(Boolean);
    const succeeded = ids.length - failures.length;

    if (succeeded > 0) toast.success(`${verb} ${succeeded} form${succeeded === 1 ? "" : "s"}`);
    if (failures.length > 0) {
      // Show the server's own reason when every failure shares one — it's the actionable part
      // ("Archive this form before deleting it"), and a generic count would hide it.
      const reasons = [...new Set(failures.map((f) => f.reason).filter(Boolean))];
      toast.error(
        reasons.length === 1
          ? `${failures.length} skipped: ${reasons[0]}`
          : `${failures.length} form${failures.length === 1 ? "" : "s"} couldn't be updated.`
      );
    }
    setBulkLoading(false);
    setSelectedForms([]);
    fetchForms(pagination.currentPage);
  };

  const handleBulkStatus = (action) => {
    const pastTense = { publish: "Published", pause: "Paused", resume: "Resumed", archive: "Archived", unarchive: "Unarchived" }[action];
    return runBulk(selectedForms, pastTense, (id) => API.post(`/forms/${id}/${action}`));
  };

  const handleBulkDelete = () => runBulk(selectedForms, "Deleted", (id) => API.delete(`/forms/${id}`));

  const handleStatusChange = async (form, action) => {
    try {
      await API.post(`/forms/${form._id}/${action}`);
      toast.success(`Form ${{ publish: "published", pause: "paused", resume: "resumed", archive: "archived", unarchive: "unarchived" }[action]}`);
      fetchForms(pagination.currentPage);
    } catch (err) {
      toast.error(err.response?.data?.error || `Couldn't ${action} this form.`);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await API.delete(`/forms/${deleteTarget._id}`);
      toast.success("Form deleted");
      setDeleteTarget(null);
      fetchForms(pagination.currentPage);
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to delete form");
    } finally {
      setDeleting(false);
    }
  };

  const copyPublicLink = (form) => {
    const slug = form.publishState?.publicSlug;
    if (!slug) {
      toast.error("Publish this form to get a shareable link.");
      return;
    }
    navigator.clipboard.writeText(`${PUBLIC_BASE}/f/${slug}`).then(
      () => toast.success("Link copied"),
      () => toast.error("Couldn't copy — copy it manually.")
    );
  };

  // --- Column drag / reorder --------------------------------------------------
  const getFieldValue = (form, key) => {
    if (key === "updatedAt" || key === "createdAt") return timeAgo(form[key]);
    if (key === "versionNumber") return form.versionNumber != null ? `v${form.versionNumber}` : "—";
    return form[key] ?? "—";
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

  const startColumnDrag = (e, colId) => {
    if (e.button !== 0) return;
    if (e.target.closest("button") || e.target.closest("[data-resize-handle]")) return;

    const th = e.currentTarget;
    const startX = e.clientX;
    const startY = e.clientY;
    const DRAG_THRESHOLD = 5;
    // A plain click (mousedown → no movement → mouseup) must never show the ghost or touch drag
    // state; only movement past the threshold starts a real drag.
    const dragState = { started: false, offsetX: 0, offsetY: 0, zGhost: 1 };

    const positionGhost = (clientX, clientY) => {
      const el = ghostElRef.current;
      if (!el) return;
      const visualTop = clientY - dragState.offsetY;
      const visualLeft = clientX - dragState.offsetX;
      el.style.top = `${visualTop / dragState.zGhost}px`;
      el.style.left = `${visualLeft / dragState.zGhost}px`;
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
      const previewRows = forms.map((f) => String(getFieldValue(f, colId) ?? "").trim() || "—");
      dragState.zGhost = getAncestorZoom(document.body);
      dragState.offsetX = startX - rect.left;
      dragState.offsetY = startY - rect.top;
      dragOverRef.current = null;
      setDraggedColKey(colId);
      setDragOverColKey(null);
      document.body.style.userSelect = "none";
      setDragGhost({ label, previewRows, width: rect.width / dragState.zGhost, height: rect.height / dragState.zGhost });
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

  // --- Row actions ------------------------------------------------------------
  const renderRowActionsMenu = (form) => {
    const isOpen = openRowActionsId === form._id;
    const transitions = STATUS_ACTIONS[form.status] || [];
    const canDelete = form.status === "draft" || form.status === "archived";

    return (
      <div className="relative flex-shrink-0" onMouseDown={(e) => e.stopPropagation()}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (isOpen) {
              setOpenRowActionsId(null);
              setRowActionsPos(null);
              return;
            }
            // Same zoom-corrected, viewport-flipping/clamping maths as the Companies row menu:
            // the menu portals to document.body, which paints inside the app's dynamic zoom.
            const zMenu = getAncestorZoom(document.body);
            const MENU_W = 180;
            const MARGIN = 8;
            const MENU_H = 60 + (transitions.length + (canDelete ? 1 : 0) + 3) * 30;
            const rect = e.currentTarget.getBoundingClientRect();
            const viewportH = window.innerHeight / zMenu;
            const viewportW = window.innerWidth / zMenu;
            const top = rect.bottom / zMenu + 4;
            const openUp = viewportH - top < MENU_H + MARGIN;
            let calcTop = openUp ? rect.top / zMenu - 4 - MENU_H : top;
            calcTop = Math.max(MARGIN, Math.min(calcTop, viewportH - MENU_H - MARGIN));
            let calcLeft = rect.right / zMenu - MENU_W;
            calcLeft = Math.min(calcLeft, viewportW - MENU_W - MARGIN);
            calcLeft = Math.max(calcLeft, MARGIN);
            setRowActionsPos({ top: calcTop, left: calcLeft });
            setOpenRowActionsId(form._id);
          }}
          className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
          title="More actions"
        >
          <MoreIcon className="w-4 h-4" />
        </button>
        {isOpen && rowActionsPos && createPortal(
          <>
            <div className="fixed inset-0 z-[9998]" onClick={() => { setOpenRowActionsId(null); setRowActionsPos(null); }} />
            <div
              style={{ position: "fixed", top: rowActionsPos.top, left: rowActionsPos.left }}
              className="w-[180px] z-[9999] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5 animate-in fade-in zoom-in duration-150 origin-top-right"
            >
              <button
                onClick={() => { setOpenRowActionsId(null); setRowActionsPos(null); navigate(`/forms/${form._id}`); }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-[#161618] hover:bg-gray-50"
              >
                <EyeIcon className="w-3.5 h-3.5 text-[#1C1B1F]" />
                Open Form
              </button>
              <button
                onClick={() => { setOpenRowActionsId(null); setRowActionsPos(null); copyPublicLink(form); }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-[#161618] hover:bg-gray-50"
              >
                <Copy className="w-3.5 h-3.5 text-[#1C1B1F]" />
                Copy Public Link
              </button>

              {permission !== "readonly" && transitions.length > 0 && (
                <>
                  <div className="w-full border-t border-[#F1F1F5] my-0.5" />
                  {transitions.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => { setOpenRowActionsId(null); setRowActionsPos(null); handleStatusChange(form, t.key); }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-[#161618] hover:bg-gray-50"
                    >
                      <t.icon className="w-3.5 h-3.5 text-[#1C1B1F]" />
                      {t.label}
                    </button>
                  ))}
                </>
              )}

              {permission !== "readonly" && canDelete && (
                <>
                  <div className="w-full border-t border-[#F1F1F5] my-0.5" />
                  <button
                    onClick={() => { setOpenRowActionsId(null); setRowActionsPos(null); setDeleteTarget(form); }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-[#CD3636] hover:bg-red-50"
                  >
                    <DeleteIcon className="w-3.5 h-3.5 text-[#CD3636]" />
                    Delete
                  </button>
                </>
              )}
            </div>
          </>,
          document.body
        )}
      </div>
    );
  };

  // --- Table columns ----------------------------------------------------------
  const tableColumns = useMemo(() => {
    const cols = [];

    cols.push(
      columnHelper.display({
        id: "selection",
        size: 52,
        enableResizing: false,
        header: () => (
          <div className="flex justify-center items-center w-full">
            <Checkbox
              checked={forms.length > 0 && forms.every((f) => selectedFormsSet.has(f._id))}
              onChange={handleSelectAllOnPage}
              uncheckedColor="text-[#525866]"
            />
          </div>
        ),
        cell: ({ row }) => (
          <div className="flex justify-center items-center w-full">
            <Checkbox checked={selectedFormsSet.has(row.original._id)} onChange={() => toggleSelectForm(row.original._id)} />
          </div>
        ),
      })
    );

    // visibleColumns is already ordered by `order`; pin side only decides which sticky group
    // (left / none / right) a column lands in, preserving order within each group.
    const leftPinnedKeys = pinnedColumns.filter((p) => p.side === "left").map((p) => p.key);
    const rightPinnedKeys = pinnedColumns.filter((p) => p.side === "right").map((p) => p.key);
    const orderedFields = [
      ...visibleColumns.filter((vc) => leftPinnedKeys.includes(vc.key)),
      ...visibleColumns.filter((vc) => !leftPinnedKeys.includes(vc.key) && !rightPinnedKeys.includes(vc.key)),
      ...visibleColumns.filter((vc) => rightPinnedKeys.includes(vc.key)),
    ];
    const lastColumnKey = orderedFields[orderedFields.length - 1]?.key;

    orderedFields.forEach((vc) => {
      cols.push(
        columnHelper.accessor((row) => getFieldValue(row, vc.key), {
          id: vc.key,
          size: vc.key === "title" ? 260 : 150,
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
                    <Pin size={12} className="text-blue-500 fill-blue-500 flex-shrink-0" style={{ transform: "rotate(45deg)" }} />
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
                    const MENU_W = 170;
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
                      style={{ position: "fixed", top: columnMenuPos.top, left: columnMenuPos.left }}
                      className="w-[170px] z-[9999] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5 animate-in fade-in zoom-in duration-150 origin-top-right"
                    >
                      <button
                        onClick={() => {
                          setOpenColumnMenuKey(null);
                          setColumnMenuPos(null);
                          pinSide === "left" ? unpinColumn(vc.key) : pinColumnToSide(vc.key, "left");
                        }}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs ${pinSide === "left" ? "bg-blue-50 text-blue-700" : "text-[#161618] hover:bg-gray-50"}`}
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
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs ${pinSide === "right" ? "bg-blue-50 text-blue-700" : "text-[#161618] hover:bg-gray-50"}`}
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
                            }}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs ${sortConfig.key === vc.key && sortConfig.direction === "asc" ? "bg-blue-50 text-blue-700 font-medium" : "text-[#161618] hover:bg-gray-50"}`}
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
                            }}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs ${sortConfig.key === vc.key && sortConfig.direction === "desc" ? "bg-blue-50 text-blue-700 font-medium" : "text-[#161618] hover:bg-gray-50"}`}
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
                          saveColumns(columns.map((c) => (c.key === vc.key ? { ...c, visible: false } : c)));
                        }}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs ${vc.required ? "text-gray-300 cursor-not-allowed" : "text-[#161618] hover:bg-gray-50"}`}
                      >
                        <EyeOff className={`w-3.5 h-3.5 ${vc.required ? "text-gray-300" : "text-[#1C1B1F]"}`} />
                        Hide Column
                      </button>
                    </div>
                  </>,
                  document.body
                )}
              </div>
            );
          },
          cell: ({ row }) => {
            const form = row.original;
            let baseContent;

            if (vc.key === "title") {
              baseContent = (
                <button
                  onClick={(e) => { e.stopPropagation(); navigate(`/forms/${form._id}`); }}
                  className="text-[#0085FF] font-semibold hover:underline truncate text-left w-full min-w-0"
                  title={form.title}
                >
                  <HighlightText text={form.title} query={search} />
                </button>
              );
            } else if (vc.key === "module") {
              baseContent = <ModuleTag module={form.module} />;
            } else if (vc.key === "status") {
              baseContent = <FormStatusBadge status={form.status} />;
            } else if (vc.key === "submissionCount") {
              baseContent = <span className="text-gray-700 font-medium">{form.submissionCount ?? 0}</span>;
            } else {
              baseContent = (
                <div className="truncate text-sm text-gray-600" title={String(getFieldValue(form, vc.key))}>
                  {getFieldValue(form, vc.key)}
                </div>
              );
            }

            if (vc.key === lastColumnKey) {
              return (
                <div className="flex items-center justify-between w-full gap-2">
                  <div className="min-w-0 flex-1">{baseContent}</div>
                  {renderRowActionsMenu(form)}
                </div>
              );
            }
            return baseContent;
          },
        })
      );
    });

    return cols;
  }, [visibleColumns, selectedFormsSet, forms, sortConfig, pinnedColumns, openColumnMenuKey, columnMenuPos, openRowActionsId, rowActionsPos, search, permission, columns]);

  const table = useReactTable({
    data: forms,
    columns: tableColumns,
    state: { columnSizing },
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: "onChange",
    enableColumnResizing: true,
  });

  const isFiltered = !!(search || moduleFilter || statusFilter || activeFilters.length);
  const showSkeleton = loading && forms.length === 0 && !error;

  // --- Render -----------------------------------------------------------------
  return (
    <div>
      {/* Toolbar — lives in the Settings header strip (see HeaderStripPortal) and collapses into
          the bulk strip while rows are selected, exactly like the Companies toolbar. */}
      <HeaderStripPortal>
        {selectedForms.length > 0 ? (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className="flex flex-nowrap items-center">
            <button
              onClick={() => setShowExportModal(true)}
              className="h-10 px-4 bg-white border border-gray-300 text-gray-900 text-sm font-medium rounded-l-[25px] hover:bg-gray-50 transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              <DownloadIcon className="w-4 h-4 text-green-600" />
              Export
            </button>

            <div className="relative">
              <button
                onClick={() => setBulkStatusMenuOpen((p) => !p)}
                disabled={bulkLoading || permission === "readonly"}
                className="h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium hover:bg-gray-50 transition-colors flex items-center gap-2 disabled:opacity-50 whitespace-nowrap"
              >
                <Send className="w-4 h-4 text-blue-600" />
                Change Status
                <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
              </button>
              {bulkStatusMenuOpen && (
                <>
                  <div className="fixed inset-0 z-[9998]" onClick={() => setBulkStatusMenuOpen(false)} />
                  <div className="absolute left-0 top-11 z-[9999] w-[170px] bg-white border border-[#E5E5EC] rounded-lg shadow-xl p-1.5 flex flex-col gap-0.5">
                    {/* Every action is offered for a mixed selection; rows the transition doesn't
                        apply to are rejected by the server and reported in the summary toast,
                        rather than being silently dropped here. */}
                    {[
                      { key: "publish", label: "Publish", icon: Send },
                      { key: "pause", label: "Pause", icon: Pause },
                      { key: "resume", label: "Resume", icon: Play },
                      { key: "archive", label: "Archive", icon: Archive },
                      { key: "unarchive", label: "Unarchive", icon: ArchiveRestore },
                    ].map((a) => (
                      <button
                        key={a.key}
                        onClick={() => { setBulkStatusMenuOpen(false); handleBulkStatus(a.key); }}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-[#161618] hover:bg-gray-50"
                      >
                        <a.icon className="w-3.5 h-3.5 text-[#1C1B1F]" />
                        {a.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <button
              onClick={() => setShowBulkDeleteModal(true)}
              disabled={bulkLoading || permission === "readonly"}
              className="h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium hover:bg-gray-50 transition-colors flex items-center gap-2 disabled:opacity-50 whitespace-nowrap"
            >
              <DeleteIcon className="w-4 h-4 text-red-600" />
              Delete
            </button>
            <button
              onClick={exitSelectionMode}
              className="h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium rounded-r-[25px] hover:bg-gray-50 transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
          </div>

          <div className="flex items-center gap-3">
            <CheckSquare className="w-5 h-5 text-blue-600" />
            <span className="text-blue-800 font-semibold whitespace-nowrap">
              {selectedForms.length} form{selectedForms.length !== 1 ? "s" : ""} selected
            </span>
            <button
              onClick={handleSelectAllAcrossPages}
              disabled={bulkLoading}
              className="h-10 px-4 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-[25px] hover:bg-gray-50 transition-colors flex items-center gap-2 disabled:opacity-50 whitespace-nowrap"
            >
              <CheckSquare className="w-4 h-4" />
              Select All
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 lg:gap-3">
          <div className="relative flex-1 min-w-0 flex items-center">
            <div
              className={`relative h-10 flex items-center border rounded-full bg-white transition-all duration-300 ease-in-out hover:bg-gray-50 focus-within:border-[#0085FF] ${
                search ? "border-[#0085FF]" : "border-[#E1E4EA]"
              } ${isSearchExpanded || search ? "w-full lg:w-[380px]" : "w-10"} max-w-full`}
            >
              <SearchIcon
                className="absolute left-3 cursor-pointer z-10 top-1/2 -translate-y-1/2 w-4 h-4 text-[#525866]"
                onClick={() => { setIsSearchExpanded(true); searchInputRef.current?.focus(); }}
              />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => setIsSearchExpanded(true)}
                onBlur={() => { if (!search) setIsSearchExpanded(false); }}
                placeholder="Search forms by title..."
                className={`w-full h-full pl-9 pr-9 bg-transparent text-sm focus:outline-none transition-opacity duration-200 cursor-pointer ${isSearchExpanded || search ? "opacity-100 focus:cursor-text" : "opacity-0"}`}
              />
              {(isSearchExpanded || search) && search && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-5 h-5 rounded-full text-gray-900 hover:bg-gray-100"
                >
                  <X className="w-3.5 h-3.5" strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>

          <button
            onClick={() => setShowAdvancedFilters(true)}
            className="relative flex items-center justify-center w-10 h-10 rounded-full border border-[#E1E4EA] text-[#525866] hover:bg-gray-50 transition-colors flex-shrink-0"
            title="Filters"
          >
            <FilterIcon size={16} />
            {activeFilters.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-[#0085FF] text-white text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full">
                {activeFilters.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setShowColumnSettings(true)}
            className="flex items-center justify-center w-10 h-10 rounded-full border border-[#E1E4EA] text-[#525866] hover:bg-gray-50 transition-colors flex-shrink-0"
            title="Columns"
          >
            <Columns3 className="w-4 h-4" />
          </button>

          {error?.type === "module" ? (
            <button
              disabled
              title={error.message}
              className="inline-flex items-center justify-center gap-2 h-10 w-10 lg:w-auto px-0 lg:px-4 bg-gray-100 text-gray-400 text-sm font-medium rounded-full cursor-not-allowed flex-shrink-0"
            >
              <Lock className="w-4 h-4 flex-shrink-0" />
              <span className="hidden lg:inline">New Form</span>
            </button>
          ) : permission !== "readonly" ? (
            <button
              onClick={() => setShowCreateModal(true)}
              title="New Form"
              className="inline-flex items-center justify-center gap-2 h-10 w-10 lg:w-auto px-0 lg:px-4 bg-[#0085FF] text-white text-sm font-medium rounded-full hover:bg-blue-600 focus:outline-none cursor-pointer transition-colors flex-shrink-0"
            >
              <PlusIcon className="w-4 h-4 flex-shrink-0" />
              <span className="hidden lg:inline">New Form</span>
            </button>
          ) : null}
        </div>
        )}
      </HeaderStripPortal>

      <div
        ref={tableScrollRef}
        className="overflow-x-auto overflow-y-auto bg-white top-[calc(118px+var(--dc-offline-offset,0px))] lg:top-[calc(128px+var(--dc-offline-offset,0px))]"
        style={{
          position: "fixed",
          left: "var(--sidebar-width, 0px)",
          right: 0,
          bottom: 64,
        }}
      >
        <table className="w-full border-separate border-spacing-0 text-left" style={{ minWidth: `${table.getTotalSize()}px`, tableLayout: "fixed" }}>
          {(() => {
            const leftPinnedKeys = pinnedColumns.filter((p) => p.side === "left").map((p) => p.key);
            const rightPinnedKeys = pinnedColumns.filter((p) => p.side === "right").map((p) => p.key);
            const allHeaders = table.getHeaderGroups()[0]?.headers || [];
            // The boundary shadow belongs on the rightmost pinned column as it APPEARS, not
            // whichever was pinned last (pinnedColumns is in pin-action order).
            const leftPinnedInOrder = allHeaders.map((h) => h.column.id).filter((id) => leftPinnedKeys.includes(id));
            const rightPinnedInOrder = allHeaders.map((h) => h.column.id).filter((id) => rightPinnedKeys.includes(id));
            const lastLeftPinnedKey = leftPinnedInOrder[leftPinnedInOrder.length - 1] || null;
            const firstRightPinnedKey = rightPinnedInOrder[0] || null;

            const pinnedLeftOffsets = {};
            let cumulativeLeft = 0;
            allHeaders.forEach((h) => {
              if (h.column.id === "selection" || leftPinnedKeys.includes(h.column.id)) {
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
                <thead className="bg-[#F5F7FA] sticky top-0 z-30 select-none">
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
                            className={`px-4 py-3 text-sm font-bold text-[#525866] border-b border-r border-[#E1E4EA] last:border-r-0 transition-colors bg-[#F5F7FA] ${isDraggable ? "cursor-grab active:cursor-grabbing" : ""} ${isDragOver ? "bg-blue-100" : "hover:bg-gray-100"}`}
                          >
                            {/* Opacity on this wrapper, not the <th>, so a dragged column keeps
                                its sticky positioning, borders and boundary shadow. */}
                            <div className="w-full min-w-0" style={{ opacity: isDragging ? 0.35 : 1 }}>
                              {flexRender(header.column.columnDef.header, header.getContext())}
                            </div>
                            {boundaryShadowSide && <div style={getPinnedBoundaryOverlayStyle(boundaryShadowSide)} />}
                            {colId !== "selection" && header.column.getCanResize() && (
                              <div
                                data-resize-handle="true"
                                onMouseDown={(e) => { e.stopPropagation(); header.getResizeHandler()(e); }}
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
                  {showSkeleton ? (
                    <TableSkeletonRows
                      numRows={Math.min(pagination.limit, 8)}
                      columns={table.getVisibleLeafColumns().filter((c) => c.id !== "selection")}
                      hasCheckbox
                    />
                  ) : error ? (
                    <tr>
                      <td colSpan={table.getAllColumns().length} className="px-6 py-12 text-center">
                        {error.type === "module" ? (
                          <div className="flex flex-col items-center gap-2 max-w-md mx-auto">
                            <Lock className="w-8 h-8 text-gray-300" />
                            <p className="font-semibold text-gray-900">Forms isn't included in your current plan</p>
                            <p className="text-sm text-gray-500">
                              Create lead capture forms, embed them on your website, and automatically send submissions to your CRM.
                            </p>
                            {error.planName && <p className="text-xs text-gray-400">Current plan: {error.planName}</p>}
                            <button
                              onClick={() => navigate("/subscription")}
                              className="mt-1 px-4 py-2 bg-[#0C4FCD] text-white text-sm font-medium rounded-lg hover:bg-blue-700"
                            >
                              Upgrade Plan
                            </button>
                          </div>
                        ) : error.type === "permission" ? (
                          <div className="flex flex-col items-center gap-2">
                            <ShieldOff className="w-8 h-8 text-gray-300" />
                            <p className="font-semibold text-gray-900">You don't have permission to access Forms</p>
                            <p className="text-sm text-gray-500">Contact your administrator.</p>
                          </div>
                        ) : error.type === "network" ? (
                          <div className="flex flex-col items-center gap-2">
                            <WifiOff className="w-8 h-8 text-gray-300" />
                            <p className="font-semibold text-gray-900">Couldn't connect to the server</p>
                            <button
                              onClick={() => fetchForms(pagination.currentPage)}
                              className="mt-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
                            >
                              Retry
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-2">
                            <AlertTriangle className="w-8 h-8 text-gray-300" />
                            <p className="font-semibold text-gray-900">Something went wrong</p>
                            <p className="text-sm text-gray-500">{error.message}</p>
                            <button
                              onClick={() => fetchForms(pagination.currentPage)}
                              className="mt-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
                            >
                              Retry
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : forms.length === 0 ? (
                    <tr>
                      <td colSpan={table.getAllColumns().length}>
                        <EmptyState
                          icon={FormIcon}
                          noun="Form"
                          title="Website Forms"
                          description="Capture leads directly into your CRM. Forms let visitors submit enquiries, requests and registrations that automatically create CRM records."
                          isFiltered={isFiltered}
                          onCreate={permission !== "readonly" ? () => setShowCreateModal(true) : undefined}
                        />
                      </td>
                    </tr>
                  ) : (
                    table.getRowModel().rows.map((row) => (
                      // Opening a form is an explicit action: the title link or the row menu's
                      // "Open Form". A whole-row click made it far too easy to leave the list by
                      // accident while reaching for a checkbox or a status pill.
                      <tr
                        key={row.id}
                        style={{ height: 37, maxHeight: 37 }}
                        className={`bg-white hover:bg-blue-50 transition-colors ${selectedFormsSet.has(row.original._id) ? "!bg-blue-50" : ""}`}
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
                              className="px-4 py-2 align-middle text-sm text-[#1C1B1F] bg-inherit border-b border-r border-[#E1E4EA] last:border-r-0"
                            >
                              <div style={{ opacity: isColDragging ? 0.35 : 1, overflow: colId === "title" ? "visible" : "hidden" }}>
                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                              </div>
                              {cellBoundaryShadowSide && <div style={getPinnedBoundaryOverlayStyle(cellBoundaryShadowSide)} />}
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

      {/* Pagination — same controls as the Companies bar (range summary, page-size selector,
          numbered pages with double-click-to-type), inline rather than fixed to the viewport. */}
      {pagination.totalCount > 0 && (
        <div
          className="flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 bg-white border-t border-[#E1E4EA]"
          style={{ position: "fixed", left: "var(--sidebar-width, 0px)", right: 0, bottom: 0, height: 64, zIndex: 30 }}
        >
          <div className="flex items-center gap-2">
            <p className="text-sm text-gray-700">
              Showing <span className="font-semibold">{(pagination.currentPage - 1) * pagination.limit + 1}</span> to{" "}
              <span className="font-semibold">{Math.min(pagination.currentPage * pagination.limit, pagination.totalCount)}</span> of{" "}
              <span className="font-semibold">{pagination.totalCount}</span> results
            </p>
            <div className="relative">
              <select
                value={pagination.limit}
                onChange={(e) => handleLimitChange(parseInt(e.target.value, 10))}
                className="appearance-none border border-gray-300 rounded-lg pl-3 pr-8 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                {[10, 20, 50, 100].map((n) => (
                  <option key={n} value={n}>{n} per page</option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
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
                    <span key={`${item}-${index}`} className="flex items-center justify-center w-8 h-8 text-sm text-gray-400 select-none">
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
                    className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors ${isCurrent ? "bg-[#0085FF] text-white" : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"}`}
                  >
                    {item}
                  </button>
                );
              });
            })()}

            <button
              onClick={() => handlePageChange(pagination.currentPage + 1)}
              disabled={!pagination.hasNextPage}
              className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

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

      <ColumnSettingsPanel
        isOpen={showColumnSettings}
        onClose={() => setShowColumnSettings(false)}
        columns={columns}
        onSave={saveColumns}
        moduleName="Forms"
      />

      <AdvancedFilterPanel
        isOpen={showAdvancedFilters}
        onClose={() => setShowAdvancedFilters(false)}
        columns={defaultColumns.filter((c) => c.key !== "submissionCount" && c.key !== "versionNumber")}
        filters={activeFilters}
        setFilters={setActiveFilters}
        onApply={(newFilters) => setActiveFilters(newFilters)}
        title="Filter Forms"
        subtitle="Find a form by title, module or status"
        emptyStateText="Add a rule to narrow down your form list."
      />

      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        columns={defaultColumns}
        selectedIds={selectedForms}
        exportUrl="/forms/export-selected"
        fileName="Exported_Forms.csv"
      />

      <BulkDeleteModal
        isOpen={showBulkDeleteModal}
        message={
          <>
            Are you sure you want to delete <strong>{selectedForms.length}</strong> form
            {selectedForms.length === 1 ? "" : "s"}? Published or paused forms must be archived
            first, and forms with submissions can't be deleted — those will be skipped.
          </>
        }
        loading={bulkLoading}
        onCancel={() => setShowBulkDeleteModal(false)}
        onConfirm={async () => {
          await handleBulkDelete();
          setShowBulkDeleteModal(false);
        }}
        onExportBeforeDelete={() => exportRecordsToCSV(selectedFormObjects, "forms")}
      />

      {showCreateModal && (
        <CreateFormModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(form) => {
            setShowCreateModal(false);
            navigate(`/forms/${form._id}`);
          }}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[10000] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Delete "{deleteTarget.title}"?</h2>
            <p className="text-sm text-gray-500 mb-4">This can't be undone.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50">
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FormsList;
