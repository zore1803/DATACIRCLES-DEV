import CalendarIcon from "../common/CalendarIcon";
import DeleteIcon from "../common/DeleteIcon";
import Checkbox from "../common/Checkbox";
import PlusIcon from "../common/PlusIcon";
import SearchIcon from "../common/SearchIcon";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import Skeleton from "../common/Skeleton";
import StatTileSkeleton from "../common/StatTileSkeleton";
import StatTile from "../common/StatTile";
import { ListChecks, Clock, AlertCircle, CheckCircle, X } from "lucide-react";
import API from "../../services/api";
import VendorTaskForm from "./VendorTaskForm";
import TaskDetailsModal from "../Task/TaskDetailsModal";
import DataTable from "../common/DataTable";
import RowActionsMenu from "../common/RowActionsMenu";
import BulkActionBar from "../common/BulkActionBar";
import TablePaginationFooter from "../common/TablePaginationFooter";
import ToolbarFilterGroup from "../company/ToolbarFilterGroup";
import FilterIcon from "../common/FilterIcon";
import { useBulkSelection, useBulkStrip } from "../../hooks/useBulkSelection";
import { useTopLoadingSignal } from "../common/TopLoadingBar";
import toast from "react-hot-toast";
import HighlightText from "../common/HighlightText";
import { exportToCSV } from "../../utils/exportToCSV";
import EyeIcon from "../common/EyeIcon";
import EditIcon from "../common/EditIcon";

/* Columns offered in the filter panel. `options` seeds the dropdown with the
   schema's full enum so a value is still filterable when no row currently uses
   it (models/Task.js). */
const TASK_FILTER_COLUMNS = [
  { key: "status", label: "Status", options: ["Pending", "In Progress", "Completed"] },
  { key: "priority", label: "Priority", options: ["low", "medium", "high"] },
  { key: "assignedTo", label: "Assigned To", placeholder: "All Assigned To" },
];

const getTaskFieldValue = (task, key) => {
  switch (key) {
    case "status":
      return task.status;
    case "priority":
      return task.priority;
    case "assignedTo":
      return task.users?.map((u) => u?.name).filter(Boolean).join(", ");
    default:
      return task[key];
  }
};

const STATUS_BADGE = {
  Pending: "bg-gray-100 text-gray-700",
  "In Progress": "bg-[#E6F8FD] text-[#27B4EA]",
  Completed: "bg-[#E6F7EF] text-[#1FA971]",
  Cancelled: "bg-gray-200 text-gray-700",
};

const PRIORITY_BADGE = {
  high: "bg-[#FCEAEA] text-[#EA4B4B]",
  medium: "bg-[#FDF3E6] text-[#EA9927]",
  low: "bg-[#EEF2F9] text-[#56698A]",
};

const stripHtml = (html) => String(html || "").replace(/<[^>]*>/g, "").trim();

const formatDate = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";

const VendorTasksTable = ({ vendorId, showKPIs = true, autoOpenCreate = false, onAutoOpenCreateConsumed }) => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [users, setUsers] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [vendorName, setVendorName] = useState("");

  const [search, setSearch] = useState("");
  const [selectedFilters, setSelectedFilters] = useState({});
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [columnSizing, setColumnSizing] = useState({});
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [columnOrder, setColumnOrder] = useState(() => [
    "selection", "title", "description", "assignedTo", "status", "priority", "dueDate"
  ]);

  // "New Entry" menu on the vendor header (VendorDetailsPageNew.jsx) sets
  // autoOpenCreate + switches to this tab in the same click — same
  // pendingCreate pattern CompanyProfilePage.jsx uses for its tabs.
  useEffect(() => {
    if (autoOpenCreate) {
      setEditingTask(null);
      setShowTaskForm(true);
      onAutoOpenCreateConsumed?.();
    }
  }, [autoOpenCreate, onAutoOpenCreateConsumed]);
  const [hiddenColumns, setHiddenColumns] = useState(new Set());
  const [pinnedColumns, setPinnedColumns] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: null });

  const handleColumnReorder = (draggedKey, targetKey) => {
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

  const handlePinColumn = (colId, side) => {
    setPinnedColumns((prev) => [...prev.filter((p) => p.key !== colId), { key: colId, side }]);
  };

  const handleUnpinColumn = (colId) => {
    setPinnedColumns((prev) => prev.filter((p) => p.key !== colId));
  };

  const handleHideColumn = (colId) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      next.add(colId);
      return next;
    });
  };

  const handleSort = (key, direction) => {
    setSortConfig((prev) =>
      prev.key === key && prev.direction === direction
        ? { key: null, direction: null }
        : { key, direction },
    );
  };

  const refetchTasks = useCallback(async () => {
    const response = await API.get(`/tasks/vendor/${vendorId}`);
    setTasks(response.data || []);
  }, [vendorId]);

  useEffect(() => {
    const fetchData = async () => {
      if (!vendorId) {
        setError("Vendor ID is missing");
        setLoading(false);
        return;
      }
      if (!/^[0-9a-fA-F]{24}$/.test(vendorId)) {
        setError("Invalid Vendor ID format");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        await refetchTasks();
        setError(null);
      } catch (err) {
        setError("Failed to load tasks");
        console.error("Error fetching tasks:", err);
        toast.error("Failed to load tasks.");
        setLoading(false);
        return;
      }

      try {
        const usersResponse = await API.get("/auth/all-user");
        setUsers(usersResponse.data?.allUsers || []);
      } catch (err) {
        console.error("Error fetching users for task assignment:", err);
      }

      try {
        const vendorResponse = await API.get(`/vendors/${vendorId}`);
        setVendorName(vendorResponse.data?.name || "");
      } catch (err) {
        console.error("Error fetching vendor name:", err);
      }

      setLoading(false);
    };

    fetchData();
  }, [vendorId, refetchTasks]);

  /* ── Search + filter ── */
  const filteredTasks = useMemo(() => {
    let rows = tasks;

    const term = search.trim().toLowerCase();
    if (term) {
      rows = rows.filter((t) =>
        [t.title, stripHtml(t.description), t.status, t.priority, getTaskFieldValue(t, "assignedTo")]
          .some((v) => String(v || "").toLowerCase().includes(term)),
      );
    }

    Object.entries(selectedFilters).forEach(([key, values]) => {
      if (!values?.length) return;
      rows = rows.filter((t) => values.includes(String(getTaskFieldValue(t, key) ?? "")));
    });

    return rows;
  }, [tasks, search, selectedFilters]);

  const activeFilterCount = Object.values(selectedFilters).reduce(
    (n, arr) => n + (arr?.length || 0),
    0,
  );

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  useEffect(() => {
    setPage(1);
  }, [search, selectedFilters]);

  const sortedTasks = useMemo(() => {
    if (!sortConfig.key) return filteredTasks;
    return [...filteredTasks].sort((a, b) => {
      let aVal = getTaskFieldValue(a, sortConfig.key) ?? "";
      let bVal = getTaskFieldValue(b, sortConfig.key) ?? "";
      if (sortConfig.key === "dueDate") {
        aVal = a.dueDate ? new Date(a.dueDate).getTime() : 0;
        bVal = b.dueDate ? new Date(b.dueDate).getTime() : 0;
      }
      const aCmp = typeof aVal === "number" ? aVal : String(aVal).toLowerCase();
      const bCmp = typeof bVal === "number" ? bVal : String(bVal).toLowerCase();
      if (aCmp < bCmp) return sortConfig.direction === "asc" ? -1 : 1;
      if (aCmp > bCmp) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredTasks, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(sortedTasks.length / limit));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  
  const [isPaging, setIsPaging] = useState(false);
  useTopLoadingSignal(isPaging);
  const goToPage = (n) => {
    if (n === page) return;
    setIsPaging(true);
    setPage(n);
    setTimeout(() => setIsPaging(false), 220);
  };
  const paginatedTasks = useMemo(
    () => sortedTasks.slice((page - 1) * limit, page * limit),
    [sortedTasks, page, limit],
  );

  const { selectedItems, toggleItem, clearSelection, selectAll } = useBulkSelection({
    items: filteredTasks,
  });
  const { visible: stripVisible, closing: stripClosing } = useBulkStrip(selectedItems.length);

  const handleExportSelected = () => {
    const dataToExport = tasks
      .filter((t) => selectedItems.includes(t._id))
      .map((t) => ({
        "Title": t.title || "",
        "Description": stripHtml(t.description || ""),
        "Status": t.status || "",
        "Priority": t.priority || "",
        "Due Date": t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "",
        "Assigned To": getTaskFieldValue(t, "assignedTo"),
      }));
    if (dataToExport.length === 0) return;
    const headers = Object.keys(dataToExport[0]).join(",");
    const rows = dataToExport.map(row => Object.values(row).map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
    exportToCSV([headers, ...rows], `tasks_export_${new Date().toISOString().split("T")[0]}.csv`);
  };

  const handleBulkDelete = async () => {
    if (!selectedItems.length) return;
    if (!window.confirm(`Delete ${selectedItems.length} task(s)? This cannot be undone.`)) return;
    setIsDeleting(true);
    try {
      await Promise.all(selectedItems.map((id) => API.delete(`/tasks/${id}`)));
      await refetchTasks();
      clearSelection();
      toast.success("Tasks deleted!");
    } catch (err) {
      console.error("Bulk delete failed:", err);
      toast.error(err.response?.data?.error || "Failed to delete some tasks.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleTaskSave = async (taskData) => {
    try {
      await API.post("/tasks", taskData);
      await refetchTasks();
      toast.success("Task created!");
      setShowTaskForm(false);
    } catch (err) {
      console.error("Error saving task:", err);
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || "Failed to create task.");
      }
      throw err;
    }
  };

  const handleTaskDelete = async (taskId) => {
    try {
      await API.delete(`/tasks/${taskId}`);
      await refetchTasks();
      toast.success("Task deleted!");
      handleCloseTaskModal();
    } catch (err) {
      console.error("Error deleting task:", err);
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || "Failed to delete task.");
      }
      throw err;
    }
  };

  const handleCloseTaskModal = () => {
    setIsTaskModalOpen(false);
    setSelectedTask(null);
  };

  // Wired to TaskDetailsModal's Edit button (onEdit) — previously unpassed,
  // so that button silently did nothing. Closes the read-only popup and
  // opens VendorTaskForm against the same task, in edit mode.
  const handleEditTask = (task) => {
    handleCloseTaskModal();
    setEditingTask(task);
    setShowTaskForm(true);
  };

  const getRelatedToName = () => vendorName || "N/A";

  const baseColumns = useMemo(
    () => [
      {
        id: "selection",
        size: 64,
        enableResizing: false,
        header: () => (
          <div className="flex justify-center items-center w-full">
            <Checkbox checked={
                selectedItems.length > 0 &&
                selectedItems.length === filteredTasks.length
              } onChange={(e) =>
                e.target.checked ? selectAll(filteredTasks) : clearSelection()
              }  uncheckedColor="text-[#525866]"/>
          </div>
        ),
        cell: ({ row }) => (
          <div className="flex justify-center items-center w-full">
            <Checkbox checked={selectedItems.includes(row.original._id)} onChange={() => toggleItem(row.original._id)} />
          </div>
        ),
      },
      {
        id: "title",
        accessorKey: "title",
        size: 240,
        header: "Title",
        cell: ({ row }) => (
          <span className="font-medium text-gray-900 truncate block" title={row.original.title}>
            <HighlightText text={row.original.title} query={search} />
          </span>
        ),
      },
      {
        id: "description",
        size: 260,
        header: "Description",
        cell: ({ row }) => {
          const text = stripHtml(row.original.description);
          return (
            <span className="text-gray-600 truncate block" title={text}>
              {text ? <HighlightText text={text} query={search} /> : "—"}
            </span>
          );
        },
      },
      {
        id: "status",
        size: 130,
        header: "Status",
        cell: ({ row }) => (
          <span
            className={`inline-flex px-2 py-1 text-xs font-medium rounded ${
              STATUS_BADGE[row.original.status] || "bg-gray-100 text-gray-800"
            }`}
          >
            {row.original.status === "Pending" ? (
              <HighlightText text="To Do" query={search} />
            ) : (
              <HighlightText text={row.original.status} query={search} />
            )}
          </span>
        ),
      },
      {
        id: "priority",
        size: 110,
        header: "Priority",
        cell: ({ row }) => (
          <span
            className={`inline-flex px-2 py-1 text-xs font-medium rounded capitalize ${
              PRIORITY_BADGE[row.original.priority] || "bg-gray-100 text-gray-600"
            }`}
          >
            {row.original.priority ? <HighlightText text={row.original.priority} query={search} /> : "—"}
          </span>
        ),
      },
      {
        id: "dueDate",
        size: 140,
        header: "Due Date",
        cell: ({ row }) => <span className="text-gray-700">{formatDate(row.original.dueDate)}</span>,
      },
      {
        id: "assignedTo",
        size: 170,
        header: "Assigned To",
        cell: ({ row }) => {
          const names = getTaskFieldValue(row.original, "assignedTo");
          return (
            <span className="text-gray-700 truncate block" title={names}>
              {names ? <HighlightText text={names} query={search} /> : "Unassigned"}
            </span>
          );
        },
      },
    ],
    [paginatedTasks, selectedItems, selectAll, clearSelection, toggleItem],
  );

  // No dedicated "Actions" column — a single ⋮ button (RowActionsMenu) that
  // pops View/Delete as a small action card renders inside whichever
  // column currently ends up last (see finalColumns below), the same way
  // CompanyContactsTab.jsx puts its "open contact" icon on the last
  // visible column instead of a fixed Actions column.
  const taskActionButtons = (task) => (
    <RowActionsMenu
      actions={[
        { label: "View", icon: EyeIcon, onClick: () => { setSelectedTask(task); setIsTaskModalOpen(true); } },
        { label: "Edit", icon: EditIcon, onClick: () => handleEditTask(task) },
        { label: "Delete", icon: DeleteIcon, danger: true, onClick: () => { if (window.confirm("Delete this task?")) handleTaskDelete(task._id); } },
      ]}
    />
  );

  const finalColumns = useMemo(() => {
    const visibleBase = baseColumns.filter(c => !hiddenColumns.has(c.id));
    const selectionCol = visibleBase.find(c => c.id === "selection");
    const otherCols = visibleBase.filter(c => c.id !== "selection");

    const leftPinnedKeys = new Set(pinnedColumns.filter(p => p.side === 'left').map(p => p.key));
    const rightPinnedKeys = new Set(pinnedColumns.filter(p => p.side === 'right').map(p => p.key));

    const leftCols = otherCols.filter(c => leftPinnedKeys.has(c.id));
    const rightCols = otherCols.filter(c => rightPinnedKeys.has(c.id));
    const midCols = otherCols.filter(c => !leftPinnedKeys.has(c.id) && !rightPinnedKeys.has(c.id));

    midCols.sort((a, b) => columnOrder.indexOf(a.id) - columnOrder.indexOf(b.id));

    const ordered = [
      ...(selectionCol ? [selectionCol] : []),
      ...leftCols,
      ...midCols,
      ...rightCols,
    ];

    let lastIdx = -1;
    for (let i = ordered.length - 1; i >= 0; i--) {
      if (ordered[i].id !== "selection") {
        lastIdx = i;
        break;
      }
    }
    if (lastIdx !== -1) {
      const original = ordered[lastIdx];
      const originalCell = original.cell;
      ordered[lastIdx] = {
        ...original,
        cell: (props) => (
          <div className="flex items-center justify-between gap-2 w-full min-w-0">
            <div className="min-w-0 flex-1">{originalCell(props)}</div>
            {taskActionButtons(props.row.original)}
          </div>
        ),
      };
    }

    return ordered;
  }, [baseColumns, columnOrder, hiddenColumns, pinnedColumns]);

  const visibleColumnsForGhost = useMemo(() => finalColumns.map(c => ({ key: c.id, label: c.header })), [finalColumns]);
  const getGhostPreview = (colId) => {
    return paginatedTasks.slice(0, 10).map((t) => {
      let val = t[colId];
      if (colId === 'assignedTo') {
        val = getTaskFieldValue(t, "assignedTo");
      }
      if (colId === 'dueDate') {
        val = formatDate(t.dueDate);
      }
      return String(val ?? "").trim() || "—";
    });
  };

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-900 font-medium mb-2">Error Loading Tasks</div>
        <p className="text-gray-600 text-sm">{error}</p>
      </div>
    );
  }

  if (loading && !tasks.length) {
    // Only return early if we have literally nothing to show and it's the very first load
    // The skeleton is handled by DataTable's loading prop now.
  }

  const totalTasksCount = tasks.length;
  const pendingTasksCount = tasks.filter((t) => t.status !== "Completed").length;
  const overdueTasksCount = tasks.filter(
    (t) => t.status !== "Completed" && t.dueDate && new Date(t.dueDate) < new Date(),
  ).length;
  const completedTasksCount = tasks.filter((t) => t.status === "Completed").length;
  const taskCompletionRate = totalTasksCount > 0 ? Math.round((completedTasksCount / totalTasksCount) * 100) : 0;

  const taskKpiTiles = [
    { label: "Total Tasks", value: totalTasksCount, icon: ListChecks, subtitle: "All time" },
    { label: "Pending Tasks", value: pendingTasksCount, icon: Clock, subtitle: "Awaiting action", subtitleClass: "text-amber-600" },
    { label: "Overdue Tasks", value: overdueTasksCount, icon: AlertCircle, subtitle: "Action Required", subtitleClass: "text-red-600" },
    { label: "Completed Tasks", value: completedTasksCount, icon: CheckCircle, subtitle: `${taskCompletionRate}% Completion Rate`, subtitleClass: "text-green-600" },
  ];

  return (
    <div className="h-full mt-0">
      {/* KPI Tiles — same statTiles markup as CompanyTasksTab.jsx's KPI row.
          Visibility is driven by the parent page's own Financial Summary
          strip toggle (VendorDetailsPageNew.jsx's ⋮ menu), same as PaymentsTable. */}
      {showKPIs && (
      <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {loading && !tasks.length
          ? Array.from({ length: 4 }).map((_, i) => <StatTileSkeleton key={i} />)
          : taskKpiTiles.map((tile) => (
              <StatTile
                key={tile.label}
                tile={{
                  icon: tile.icon,
                  iconClass: "text-blue-600",
                  label: tile.label,
                  value: tile.value,
                  subtitle: tile.subtitle,
                  subtitleClass: tile.subtitleClass,
                }}
              />
            ))}
      </div>

      <div className="-mx-6" style={{ marginTop: 24, paddingBottom: 24, borderTop: "1px solid #E1E4EA" }} />
      </>
      )}

      {/* Action Buttons are portaled from here into the Tab Header using ReactDOM.createPortal. */}
      {stripVisible ? (
        <BulkActionBar
          selectedCount={selectedItems.length}
          entityName="task"
          isClosing={stripClosing}
          onSelectAll={() => selectAll(filteredTasks)}
          onDeselectAll={clearSelection}
          onExport={handleExportSelected}
          onCancel={clearSelection}
          onDelete={handleBulkDelete}
          isDeleting={isDeleting}
        />
      ) : (
        <div className="flex flex-wrap lg:flex-nowrap items-center gap-4 mb-2" style={{ minHeight: "44px" }}>
          <div className="relative flex-1 min-w-[180px] h-[44px]">
            <SearchIcon className="absolute left-3.5 -translate-y-1/2 top-1/2 w-4 h-4 text-[#525866]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by tasks..."
              className="w-full h-full pl-11 pr-3.5 border border-[rgba(31,41,55,0.1)] rounded-full text-sm focus:outline-none focus:border-[#0085FF]"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-900 focus:outline-none"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <ToolbarFilterGroup
            isOpen={showFilterPanel}
            columns={TASK_FILTER_COLUMNS}
            data={tasks}
            getFieldValue={getTaskFieldValue}
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
              borderColor: showFilterPanel || activeFilterCount > 0 ? "#0085FF" : "#E1E4EA",
            }}
          >
            <FilterIcon size={16} />
            Filter
            {activeFilterCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-blue-600 text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full ring-2 ring-white">
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingTask(null);
              setShowTaskForm(true);
            }}
            className="flex items-center justify-center rounded-full border hover:bg-gray-50 flex-shrink-0"
            style={{ width: "44px", height: "44px", borderColor: "#E1E4EA" }}
            title="Add Task"
          >
            <PlusIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {!loading && tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center w-full min-h-[300px] bg-gray-50 border border-gray-200 rounded-xl text-gray-500">
          <ListChecks size={28} className="mb-3 text-gray-400" />
          <button
            type="button"
            onClick={() => {
              setEditingTask(null);
              setShowTaskForm(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-[#0085FF] text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            Add new task
          </button>
        </div>
      ) : (
      <div className="bg-white border border-[#E1E4EA] rounded-xl shadow-[0px_2px_4px_rgba(28,27,31,0.04)] overflow-hidden">
        <DataTable
          data={paginatedTasks}
          columns={finalColumns}
          columnSizing={columnSizing}
          onColumnSizingChange={setColumnSizing}
          pinnedColumns={pinnedColumns}
          onPinColumn={handlePinColumn}
          onUnpinColumn={handleUnpinColumn}
          onHideColumn={handleHideColumn}
          onSort={handleSort}
          sortConfig={sortConfig}
          onColumnReorder={handleColumnReorder}
          visibleColumns={visibleColumnsForGhost}
          getGhostPreview={getGhostPreview}
          variant="card"
          maxHeight={400}
          loading={loading}
          rowClassName={(t) => (selectedItems.includes(t._id) ? "!bg-blue-50" : "")}
          loadingContent={
            <div className="space-y-0">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-[#E1E4EA] last:border-b-0">
                  <Skeleton width={16} height={16} />
                  <Skeleton width={90} height={13} />
                  <Skeleton width={70} height={13} />
                  <Skeleton width={60} height={13} />
                  <Skeleton width={80} height={13} />
                  <Skeleton width={60} height={13} />
                </div>
              ))}
            </div>
          }
          emptyContent={
            <p className="text-gray-500 text-sm font-medium">No tasks found.</p>
          }
        />
        
        <div className="border-t border-[#E1E4EA] px-5">
          <TablePaginationFooter
            currentPage={page}
            totalPages={totalPages}
            totalCount={filteredTasks.length}
            limit={limit}
            onPageChange={goToPage}
            onLimitChange={(n) => {
              setLimit(n);
              setPage(1);
            }}
          />
        </div>
      </div>
      )}

      {showTaskForm && (
        <VendorTaskForm
          open={showTaskForm}
          mode={editingTask ? "view" : "create"}
          taskData={editingTask}
          startInEditMode={!!editingTask}
          vendorId={vendorId}
          users={users}
          onSave={handleTaskSave}
          onUpdate={async () => {
            await refetchTasks();
            setShowTaskForm(false);
            setEditingTask(null);
          }}
          onDelete={handleTaskDelete}
          onClose={() => {
            setShowTaskForm(false);
            setEditingTask(null);
          }}
        />
      )}

      {selectedTask && (
        <TaskDetailsModal
          open={isTaskModalOpen}
          taskData={selectedTask}
          users={users}
          onDelete={handleTaskDelete}
          onEdit={handleEditTask}
          onClose={handleCloseTaskModal}
          getRelatedToName={getRelatedToName}
        />
      )}
    </div>
  );
};

export default VendorTasksTable;
