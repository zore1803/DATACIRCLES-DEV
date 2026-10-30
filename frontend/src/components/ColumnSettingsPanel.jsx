import Checkbox from "./common/Checkbox";
import React, { useState, useEffect } from "react";
import useBodyScrollLock from "../hooks/useBodyScrollLock";
import {
  X,
  GripVertical,
  EyeOff,
  RotateCcw,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import SearchIcon from "./common/SearchIcon";
import EyeIcon from "./common/EyeIcon";
// Sortable Column Item Component
const SortableColumnItem = ({ column, onToggleVisibility }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white border rounded-lg p-3 flex items-center gap-3 transition-all ${
        isDragging
          ? "border-blue-400 shadow-lg scale-105 z-10"
          : column.visible
          ? "border-[#E1E4EA] hover:border-gray-300"
          : "border-gray-100 bg-gray-50"
      }`}
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 touch-none"
      >
        <GripVertical className="w-5 h-5" />
      </div>

      {/* Checkbox & Label */}
      <div className="flex-1 flex items-center gap-3">
        <Checkbox checked={column.visible} onChange={() => onToggleVisibility(column.key)} />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`text-sm font-medium font-inter ${
                column.visible ? "text-gray-900" : "text-gray-400"
              }`}
            >
              {column.label}
            </span>
            {column.isCustomField && (
              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full font-medium">
                Custom
              </span>
            )}
            {column.required && (
              <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-medium">
                Required
              </span>
            )}
          </div>
          {column.description && (
            <p className="text-xs text-gray-500 mt-0.5">
              {column.description}
            </p>
          )}
        </div>
      </div>

      {/* Visibility Icon */}
      <button
        onClick={() => onToggleVisibility(column.key)}
        className={`p-1.5 rounded-lg transition-colors ${
          column.visible
            ? "text-blue-600 hover:bg-blue-50"
            : "text-gray-300 hover:bg-gray-100"
        }`}
      >
        {column.visible ? (
          <EyeIcon className="w-4 h-4" />
        ) : (
          <EyeOff className="w-4 h-4" />
        )}
      </button>
    </div>
  );
};

const ColumnSettingsPanel = ({
  isOpen,
  onClose,
  columns,
  onSave,
  moduleName,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [localColumns, setLocalColumns] = useState([]);
  const [activeId, setActiveId] = useState(null);
  useBodyScrollLock(isOpen);

  // Configure sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (isOpen) {
      setLocalColumns(columns);
    }
  }, [isOpen, columns]);

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setLocalColumns((items) => {
        const oldIndex = items.findIndex((item) => item.key === active.id);
        const newIndex = items.findIndex((item) => item.key === over.id);

        const newItems = arrayMove(items, oldIndex, newIndex);

        // Update order property
        return newItems.map((item, index) => ({
          ...item,
          order: index,
        }));
      });
    }

    setActiveId(null);
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  const toggleVisibility = (columnKey) => {
    setLocalColumns((cols) =>
      cols.map((col) =>
        col.key === columnKey ? { ...col, visible: !col.visible } : col
      )
    );
  };

  const handleSelectAll = () => {
    const allVisible = localColumns.every((col) => col.visible);
    setLocalColumns(
      localColumns.map((col) => ({ ...col, visible: !allVisible }))
    );
  };

  const handleDeselectAll = () => {
    setLocalColumns(localColumns.map((col) => ({ ...col, visible: false })));
  };

  const handleReset = () => {
    // Reset to default columns
    const defaultColumns = columns.map((col, index) => ({
      ...col,
      visible: col.defaultVisible !== undefined ? col.defaultVisible : true,
      order: index,
    }));
    setLocalColumns(defaultColumns);
  };

  const handleSave = () => {
    onSave(localColumns);
    onClose();
  };

  const filteredColumns = localColumns.filter((col) =>
    col.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const visibleCount = localColumns.filter((col) => col.visible).length;

  // Get the active column for drag overlay
  const activeColumn = localColumns.find((col) => col.key === activeId);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[9998] animate-fadeIn"
        onClick={onClose}
      />

      {/* Slide-in Panel */}
      <div className="fixed dc-panel-card dc-panel-w bg-white shadow-2xl z-[9999] flex flex-col overflow-hidden animate-slideInRight">
        {/* Header — same spec as the other side panels, with the search folded in */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#D9D9D9] flex-shrink-0 bg-white gap-4">
          <div className="flex flex-col min-w-0 flex-shrink-0">
            <h2 className="text-[15px] font-normal leading-6 text-[#78788D] uppercase tracking-wide whitespace-nowrap">
              Column Settings
            </h2>
            <p className="text-xs text-[#78788D] font-inter whitespace-nowrap">
              {moduleName} - {visibleCount} of {localColumns.length} visible
            </p>
          </div>
          <div className="relative flex-1 min-w-0 max-w-[260px] ml-auto">
            <SearchIcon className="absolute left-3 -translate-y-1/2 top-1/2 w-4 h-4 text-[#525866]" />
            <input
              type="text"
              placeholder="Search columns..."
              className="w-full border border-[#1F2937]/10 rounded-full pl-9 pr-3 h-9 text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50 font-inter"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="w-5 h-5 flex items-center justify-center text-[#1C1B1F] hover:opacity-70 transition-opacity flex-shrink-0"
            aria-label="Close settings"
          >
            <X className="w-[18px] h-[18px]" strokeWidth={2} />
          </button>
        </div>

        {/* Quick Actions */}
        <div className="px-6 pt-4 pb-1 flex items-center justify-between flex-shrink-0">
          <div className="flex gap-2">
            <button
              onClick={handleSelectAll}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium font-inter"
            >
              Select All
            </button>
            <span className="text-gray-300">|</span>
            <button
              onClick={handleDeselectAll}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium font-inter"
            >
              Deselect All
            </button>
          </div>
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-800 font-medium font-inter"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
        </div>

        {/* Columns List */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext
              items={filteredColumns.map((col) => col.key)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {filteredColumns.map((column) => (
                  <SortableColumnItem
                    key={column.key}
                    column={column}
                    onToggleVisibility={toggleVisibility}
                  />
                ))}
              </div>
            </SortableContext>

            {/* Drag Overlay */}
            <DragOverlay>
              {activeColumn ? (
                <div className="bg-white border border-blue-400 rounded-lg p-3 flex items-center gap-3 shadow-2xl opacity-90">
                  <GripVertical className="w-5 h-5 text-gray-400" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium font-inter text-gray-900">
                        {activeColumn.label}
                      </span>
                      {activeColumn.isCustomField && (
                        <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full font-medium">
                          Custom
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

          {filteredColumns.length === 0 && (
            <div className="text-center py-12">
              <SearchIcon className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">No columns found</p>
              <p className="text-sm text-gray-400">
                Try adjusting your search
              </p>
            </div>
          )}
        </div>

        {/* Footer — compact, right-aligned pill buttons like the other panels */}
        <div className="flex-shrink-0 py-2.5 px-4 border-t border-gray-100 bg-white flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2 border border-gray-200 text-gray-700 rounded-[25px] text-sm font-bold hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-[#158FFF] text-white rounded-[25px] text-sm font-bold hover:opacity-90 transition-colors"
          >
            Save Changes
          </button>
        </div>
      </div>
    </>
  );
};

export default ColumnSettingsPanel;
