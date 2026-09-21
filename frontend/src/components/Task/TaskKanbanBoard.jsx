import CalendarIcon from "../common/CalendarIcon";
import DeleteIcon from "../common/DeleteIcon";
import Checkbox from "../common/Checkbox";
import MoreIcon from "../common/MoreIcon";
import React, { useMemo, useState, useRef } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  defaultAnimateLayoutChanges,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Clock,
  CheckCircle,
  AlertCircle,
  User,
} from "lucide-react";
import EditIcon from "../common/EditIcon";

const TASK_COLUMN_WIDTH = 340;
const TASK_CARD_WIDTH = 300;

const animateLayoutChanges = (args) =>
  args.isSorting || args.wasDragging
    ? defaultAnimateLayoutChanges(args)
    : true;

// ============================================================================
// 1. PIXEL-PERFECT CARD COMPONENT FOR TASKS
// ============================================================================
const TaskKanbanCard = ({ task, isDragging, onEdit, onDelete, selected = false, onToggleSelect }) => {
  const [showMenu, setShowMenu] = useState(false);

  // Helper to format date
  const formatDate = (dateString) => {
    if (!dateString) return "No Date";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };

  // Helper for priority color (if task has priority)
  const getPriorityColor = (priority) => {
    switch (priority?.toLowerCase()) {
      case "high":
        return "bg-red-50 text-red-600 border-red-100";
      case "medium":
        return "bg-yellow-50 text-yellow-600 border-yellow-100";
      case "low":
        return "bg-green-50 text-green-600 border-green-100";
      default:
        return "bg-gray-50 text-gray-500 border-gray-100";
    }
  };

  return (
    <div
      className={`relative bg-white p-4 rounded-[10px] border hover:shadow-sm transition-shadow group text-left ${
        isDragging ? "opacity-50" : "opacity-100"
      } ${selected ? "border-[#0085FF] bg-[#F5FAFF]" : "border-[#E5E5EC]"}`}
    >
      {/* --- Top Row: Title & Actions --- */}
      <div className="flex items-start justify-between mb-2 gap-2">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          {onToggleSelect && (
            <span
              className="flex items-center flex-shrink-0 mt-0.5"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <Checkbox checked={selected} onChange={() => onToggleSelect(task._id)} />
            </span>
          )}
          <h4 className="font-bold text-gray-900 text-[14px] leading-tight flex-1 mr-2">
            {task.title}
          </h4>
        </div>

        {/* --- 3 Dots Menu --- */}
        <div className="relative flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100 transition-colors"
          >
            <MoreIcon className="w-4 h-4" />
          </button>

          {/* Dropdown Menu */}
          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-[99]"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                }}
              />
              <div className="absolute right-0 top-6 w-32 bg-white rounded-lg shadow-xl border border-gray-100 z-[100] overflow-hidden py-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit && onEdit(task);
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors text-left"
                >
                  <EditIcon className="w-3 h-3" /> Edit
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete && onDelete(task);
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 transition-colors text-left"
                >
                  <DeleteIcon className="w-4 h-4" /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* --- Middle Row: Description (Truncated) --- */}
      {task.description && (
        <p className="text-xs text-gray-500 mb-3 line-clamp-2">
          {task.description}
        </p>
      )}

      {/* --- Badges/Tags --- */}
      <div className="flex flex-wrap gap-2 mb-3">
        <span
          className={`px-2 py-0.5 text-[10px] font-medium rounded border ${getPriorityColor(task.priority)}`}
        >
          {task.priority || "Normal"}
        </span>
        {task.relatedTo && (
          <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-medium rounded border border-blue-100 max-w-[120px] truncate">
            Related: {task.relatedTo?.name || "Entity"}
          </span>
        )}
      </div>

      {/* --- Bottom Row: Date & Assignee --- */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-50">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {task.dueDate && (
            <div className="flex items-center gap-1">
              <CalendarIcon className="w-3.5 h-3.5 text-gray-400" />
              <span
                className={
                  new Date(task.dueDate) < new Date()
                    ? "text-red-500 font-medium"
                    : ""
                }
              >
                {formatDate(task.dueDate)}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center -space-x-1.5">
          {/* Assignee Avatars (Mockup logic or real user) */}
          {task.users && task.users.length > 0 ? (
            task.users.map((u, i) => (
              <div
                key={i}
                className="w-6 h-6 rounded-full bg-blue-100 border border-white text-[10px] flex items-center justify-center text-blue-700 font-bold"
                title={u.name || "User"}
              >
                {u.name ? (
                  u.name.charAt(0).toUpperCase()
                ) : (
                  <User className="w-3 h-3" />
                )}
              </div>
            ))
          ) : (
            <div className="w-6 h-6 rounded-full bg-gray-100 border border-white flex items-center justify-center text-gray-400">
              <User className="w-3 h-3" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 2. INTERNAL COMPONENTS
// ============================================================================

const SortableItem = ({ item, itemIdKey, renderItemWrapper, selected, onToggleSelect }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({
    id: item[itemIdKey].toString(),
    animateLayoutChanges,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging ? 0.4 : 1,
    cursor: isSortableDragging ? "grabbing" : "grab",
    width: `${TASK_CARD_WIDTH}px`,
    flexShrink: 0,
    willChange: "transform",
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {renderItemWrapper(item, isSortableDragging, selected, onToggleSelect)}
    </div>
  );
};

const DroppableColumn = ({
  column,
  columnItems,
  itemIdKey,
  renderItemWrapper,
  isDragging,
  selectedItems = [],
  onToggleSelect,
  onToggleColumnSelect,
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: column });
  const itemIds = columnItems.map((item) => item[itemIdKey].toString());

  // Header select-all state for this column: ticked when every card here is
  // selected. (No indeterminate/dash state — the Checkbox component only
  // has empty/checked glyphs, so a partial selection just reads as empty.)
  const allSelected = itemIds.length > 0 && itemIds.every((id) => selectedItems.includes(id));

  return (
    <div
      ref={setNodeRef}
      className={`h-full border border-[#E1E4EA] rounded-lg flex-shrink-0 overflow-hidden flex flex-col ${isOver ? "bg-gray-50" : ""}`}
      style={{ width: `${TASK_COLUMN_WIDTH}px` }}
    >
      {/* --- Column Header (plain bar + count badge, matching Contacts) --- */}
      <div
        className="flex items-center gap-1.5"
        style={{ height: "46px", background: "#F5F7FA", padding: "0 18px" }}
      >
        {onToggleColumnSelect && itemIds.length > 0 && (
          <Checkbox
            checked={allSelected}
            onChange={() => onToggleColumnSelect(itemIds)}
            uncheckedColor="text-[#525866]"
            wrapperClassName="flex-shrink-0"
            title={`Select all in ${column}`}
            aria-label={`Select all tasks in ${column}`}
          />
        )}
        <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: "12px", lineHeight: "15px", letterSpacing: "-0.02em", color: "#44444A" }}>
          {column}
        </span>
        <span
          className="flex items-center justify-center rounded-full bg-white border border-[#E5E5EC]"
          style={{ width: "22px", height: "22px", boxShadow: "0px 1px 2px rgba(82, 88, 102, 0.06)" }}
        >
          <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: "12px", lineHeight: "15px", letterSpacing: "-0.02em", color: "#161618" }}>
            {columnItems.length}
          </span>
        </span>
      </div>

      {/* --- Cards List --- */}
      <div
        className="flex-1 overflow-y-auto flex flex-col custom-scrollbar"
        style={{ padding: "12px 18px 18px", gap: "14px" }}
      >
        <SortableContext
          id={column}
          items={itemIds}
          strategy={verticalListSortingStrategy}
        >
          {columnItems.map((item) => (
            <SortableItem
              key={item[itemIdKey]}
              item={item}
              itemIdKey={itemIdKey}
              renderItemWrapper={renderItemWrapper}
              selected={selectedItems.includes(item[itemIdKey].toString())}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </SortableContext>

        {columnItems.length === 0 && !isDragging && (
          <div className="h-32 border-2 border-dashed border-gray-100 rounded-xl flex items-center justify-center text-gray-300 text-sm select-none">
            Drop here
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// 4. MAIN BOARD EXPORT
// ============================================================================

const TaskKanbanBoard = ({
  columns,
  items,
  getItemColumn,
  onItemMove,
  onCardEdit,
  onCardDelete,
  renderItem,
  itemIdKey = "_id",
  selectedItems = [],
  onToggleSelect,
  onToggleColumnSelect,
}) => {
  const [activeItem, setActiveItem] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);
  const dragOverColumnRef = useRef(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const collisionDetectionStrategy = (args) => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) return pointerCollisions;
    return rectIntersection(args);
  };

  const resolveColumnFromOverId = (overId) => {
    if (columns.includes(overId)) return overId;

    const droppedOnItem = items.find(
      (i) => i[itemIdKey].toString() === overId,
    );
    return droppedOnItem ? getItemColumn(droppedOnItem) : null;
  };

  const handleDragStart = ({ active }) => {
    const item = items.find(
      (i) => i[itemIdKey].toString() === active.id.toString(),
    );
    setActiveItem(item ? { ...item } : null);
    dragOverColumnRef.current = null;
    setDragOverColumn(null);
  };

  const handleDragOver = ({ active, over }) => {
    if (!over) return;

    const itemId = active.id.toString();
    const overId = over.id.toString();
    if (itemId === overId) return;

    const item = items.find((i) => i[itemIdKey].toString() === itemId);
    if (!item) return;

    const oldColumn = getItemColumn(item);
    const newColumn = resolveColumnFromOverId(overId);
    const nextColumn = newColumn && newColumn !== oldColumn ? newColumn : null;
    if (dragOverColumnRef.current !== nextColumn) {
      dragOverColumnRef.current = nextColumn;
      setDragOverColumn(nextColumn);
    }
  };

  const handleDragEnd = async ({ active, over }) => {
    setActiveItem(null);
    dragOverColumnRef.current = null;
    setDragOverColumn(null);
    if (!over) return;

    const itemId = active.id.toString();
    const overId = over.id.toString();
    const newColumn = resolveColumnFromOverId(overId);
    if (!newColumn) return;

    const item = items.find((i) => i[itemIdKey].toString() === itemId);
    if (!item) return;

    const oldColumn = getItemColumn(item);
    if (oldColumn !== newColumn) {
      await onItemMove(itemId, newColumn, oldColumn);
    }
  };

  const itemsByColumn = useMemo(() => {
    const map = {};
    columns.forEach((column) => {
      map[column] = [];
    });

    items.forEach((item) => {
      const itemId = item[itemIdKey].toString();
      const column =
        activeItem &&
        dragOverColumn &&
        itemId === activeItem[itemIdKey].toString()
          ? dragOverColumn
          : getItemColumn(item);

      if (!map[column]) map[column] = [];
      map[column].push(item);
    });

    return map;
  }, [items, columns, activeItem, dragOverColumn, getItemColumn, itemIdKey]);

  const renderWrapper = (item, isDragging, selected, toggleSelect) => {
    if (renderItem) return renderItem(item, isDragging);
    return (
      <TaskKanbanCard
        task={item}
        isDragging={isDragging}
        onEdit={onCardEdit}
        onDelete={onCardDelete}
        selected={selected}
        onToggleSelect={toggleSelect}
      />
    );
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetectionStrategy}
      measuring={{ droppable: { strategy: MeasuringStrategy.BeforeDragging } }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveItem(null);
        dragOverColumnRef.current = null;
        setDragOverColumn(null);
      }}
    >
      <div className="h-full w-full overflow-x-auto overflow-y-visible bg-white">
        <div className="flex gap-4 h-full min-w-max">
          {columns.map((col) => (
            <DroppableColumn
              key={col}
              column={col}
              columnItems={itemsByColumn[col] || []}
              itemIdKey={itemIdKey}
              renderItemWrapper={renderWrapper}
              isDragging={!!activeItem}
              selectedItems={selectedItems}
              onToggleSelect={onToggleSelect}
              onToggleColumnSelect={onToggleColumnSelect}
            />
          ))}
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeItem ? (
          <div style={{ width: `${TASK_CARD_WIDTH}px`, cursor: "grabbing" }}>
            {renderWrapper(activeItem, false)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

export default TaskKanbanBoard;
