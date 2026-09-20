import DeleteIcon from "../common/DeleteIcon";
import PlusIcon from "../common/PlusIcon";
import { useEffect, useState } from "react";
import API from "../../services/api";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import { GripVertical, X, Check, Layers, Lock } from "lucide-react";
import toast from "react-hot-toast";
import AppToaster from "../AppToaster";
import EditIcon from "../common/EditIcon";

// A stage row. This is a <tr> rather than the old standalone bordered card, so the list reads as
// the same table SystemDefaultsSettings.jsx uses for task/note/meeting types; dnd-kit's transform
// still applies cleanly to a row.
const SortableRow = ({ id, children }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group hover:bg-[#F5F7FA] transition-colors border-b border-[#E1E4EA] last:border-b-0 ${
        isDragging ? "relative z-10 bg-white shadow-lg" : ""
      }`}
    >
      <td className="pl-4 pr-1 py-3 w-8">
        <button
          {...attributes}
          {...listeners}
          className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing transition-colors"
          title="Drag to reorder"
        >
          <GripVertical className="w-4 h-4" />
        </button>
      </td>
      {children}
    </tr>
  );
};

export default function KanbanSettings() {
  const [statuses, setStatuses] = useState([]);
  const [newStatus, setNewStatus] = useState("");
  const [editIndex, setEditIndex] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [name, setName] = useState("");
  const [boardId, setBoardId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  useEffect(() => {
    fetchBoard();
    fetchName();
  }, []);

  const fetchName = async () => {
    try {
      const res = await API.get("/kanban-name");
      if (res.data) {
        setName(res.data.name || "Deals");
      }
    } catch (err) {
      console.error("Failed to fetch name", err);
      toast.error("Failed to load board name");
    }
  };

  const fetchBoard = async () => {
    try {
      setLoading(true);
      const res = await API.get("/kanban");
      if (res.data) {
        setStatuses(res.data.statuses || []);
        setBoardId(res.data._id);
      }
    } catch (err) {
      console.error("Failed to fetch board", err);
      toast.error("Failed to load kanban board");
    } finally {
      setLoading(false);
    }
  };

  const saveBoard = async (updatedStatuses) => {
    try {
      if (boardId) {
        await API.put(`/kanban/${boardId}`, { statuses: updatedStatuses });
      } else {
        const res = await API.post("/kanban", { statuses: updatedStatuses });
        setBoardId(res.data._id);
      }
      setStatuses(updatedStatuses);
      toast.success("Changes saved successfully!");
    } catch (err) {
      console.error("Failed to save board", err);
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || "Failed to save changes");
      }
    }
  };

  const handleDragStart = () => {
    setIsDragging(true);
  };

  const handleDragEnd = (event) => {
    setIsDragging(false);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = statuses.indexOf(active.id);
    const newIndex = statuses.indexOf(over.id);

    const updated = arrayMove(statuses, oldIndex, newIndex);
    setStatuses(updated);
    saveBoard(updated);
  };

  const handleAdd = () => {
    if (!newStatus.trim()) {
      toast.error("Status name cannot be empty");
      return;
    }
    if (statuses.includes(newStatus.trim())) {
      toast.error("Status already exists");
      return;
    }
    const updated = [...statuses, newStatus.trim()];
    saveBoard(updated);
    setNewStatus("");
  };

  const handleEdit = (index) => {
    const status = statuses[index];
    if (status === "Won" || status === "Lost") {
      toast.error(`Cannot edit "${status}" status`);
      return;
    }
    setEditIndex(index);
    setEditValue(statuses[index]);
  };

  const handleUpdate = () => {
    if (!editValue.trim()) {
      toast.error("Status name cannot be empty");
      return;
    }
    if (statuses.includes(editValue.trim()) && editValue !== statuses[editIndex]) {
      toast.error("Status already exists");
      return;
    }
    const updated = [...statuses];
    updated[editIndex] = editValue.trim();
    saveBoard(updated);
    setEditIndex(null);
    setEditValue("");
  };

  const handleDelete = (index) => {
    const status = statuses[index];
    if (status === "Won" || status === "Lost") {
      toast.error(`Cannot delete "${status}" status`);
      return;
    }
    if (
      !window.confirm(
        `Are you sure you want to delete "${statuses[index]}" status?`
      )
    ) {
      return;
    }
    const updated = statuses.filter((_, i) => i !== index);
    saveBoard(updated);
    toast.success("Status deleted successfully");
  };

  const handleCancel = () => {
    setEditIndex(null);
    setEditValue("");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading kanban settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 -mt-8">
      <AppToaster />

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        {/* Add form + table, same shapes as SystemDefaultsSettings.jsx: one pill input paired with
            a pill Add button, then the #F5F7FA-headed table below it. */}
        <form
          onSubmit={(e) => { e.preventDefault(); handleAdd(); }}
          className="flex gap-2 mb-5"
        >
          <input
            type="text"
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value)}
            placeholder="Add pipeline stage (e.g. Qualified, Proposal Sent)"
            className="flex-1 min-w-0 px-4 py-2 text-sm rounded-full border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          />
          <button
            type="submit"
            disabled={!newStatus.trim()}
            className="flex-shrink-0 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-full disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            <PlusIcon className="w-4 h-4" /> Add
          </button>
        </form>

        {statuses.length === 0 ? (
          <div className="text-center py-12 rounded-xl border border-[#E1E4EA]">
            <Layers className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-600">No stages yet</p>
            <p className="text-xs text-gray-400 mt-0.5">Add your first stage to get started</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="overflow-x-auto rounded-xl border border-[#E1E4EA]">
              <table className="min-w-full border-collapse text-sm text-left">
                <thead className="bg-[#F5F7FA] border-b border-[#E1E4EA]">
                  <tr>
                    <th className="w-8" />
                    <th className="px-4 py-3 text-sm font-bold text-[#525866]">Stage</th>
                    <th className="px-4 py-3 text-sm font-bold text-[#525866]">Type</th>
                    <th className="px-4 py-3 text-sm font-bold text-[#525866] text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  <SortableContext items={statuses} strategy={verticalListSortingStrategy}>
                    {statuses.map((status, index) => {
                      // Won/Lost are the pipeline's terminal stages and cannot be renamed or
                      // removed - the same "system default" idea SystemDefaults marks with a lock.
                      const isLocked = status === "Won" || status === "Lost";
                      const isEditing = editIndex === index;
                      return (
                        <SortableRow key={status} id={status}>
                          <td className="px-4 py-3">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyPress={(e) => e.key === "Enter" && handleUpdate()}
                                className="w-full max-w-xs px-3 py-1.5 text-sm rounded-full border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                autoFocus
                              />
                            ) : (
                              <div className="flex items-center gap-2.5">
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isLocked ? "bg-gray-300" : "bg-blue-500"}`} />
                                <span className="text-sm font-semibold text-gray-900">{status}</span>
                                <span className="text-xs text-gray-400">Stage {index + 1}</span>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {isLocked ? (
                              <span className="inline-flex items-center gap-1 text-xs text-gray-900">
                                <Lock className="w-3 h-3" /> System default
                              </span>
                            ) : (
                              <span className="text-xs text-blue-500">Custom</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {isEditing ? (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={handleUpdate}
                                  className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                                  title="Save"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={handleCancel}
                                  className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-600 transition-colors"
                                  title="Cancel"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : !isLocked ? (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleEdit(index)}
                                  className="flex items-center justify-center w-7 h-7 rounded-full text-blue-600 hover:bg-blue-50 transition-colors"
                                  title="Edit"
                                >
                                  <EditIcon className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(index)}
                                  className="flex items-center justify-center w-7 h-7 rounded-full text-red-600 hover:bg-red-50 transition-colors"
                                  title="Delete"
                                >
                                  <DeleteIcon className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : null}
                          </td>
                        </SortableRow>
                      );
                    })}
                  </SortableContext>
                </tbody>
              </table>
            </div>
          </DndContext>
        )}

        <p className="text-xs text-gray-400 mt-3">
          Drag a row to reorder the pipeline. Changes save automatically and apply to all deals.
          Won and Lost cannot be renamed or removed.
        </p>
      </div>
    </div>
  );
}
