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

const SortableCard = ({ id, isEditing, editValue, setEditValue, handleUpdate, handleCancel, handleEdit, handleDelete, index }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  if (isEditing) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="bg-white border border-blue-400 rounded-lg p-3 flex items-center justify-between ring-1 ring-blue-400 shadow-sm relative z-20"
      >
        <div className="flex items-center gap-3 flex-1">
          <div className="w-5 h-5 flex-shrink-0" /> {/* Spacer for drag handle */}
          <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleUpdate()}
            className="flex-1 min-w-0 px-2 py-1 text-sm border-b border-blue-400 focus:outline-none bg-transparent text-gray-900 font-semibold"
            autoFocus
          />
        </div>
        <div className="flex items-center gap-1.5 ml-4 flex-shrink-0">
          <button
            onClick={handleUpdate}
            className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            title="Save"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleCancel}
            className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
            title="Cancel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white border rounded-lg p-3 flex items-center justify-between group transition-colors ${
        isDragging ? "border-blue-400 shadow-md relative z-20" : "border-[#E1E4EA] hover:border-blue-300"
      }`}
    >
      <div className="flex items-center gap-3">
        <button
          {...attributes}
          {...listeners}
          className="text-[#99A0AE] hover:text-[#525866] cursor-grab active:cursor-grabbing transition-colors flex-shrink-0"
          title="Drag to reorder"
        >
          <GripVertical className="w-5 h-5" />
        </button>
        <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
        <div className="flex flex-col">
          <span className="text-[14px] font-medium text-[#1F2937] leading-tight">{id}</span>
          <span className="text-[12px] text-blue-600 font-medium">Custom</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={() => handleEdit(index)}
          className="flex items-center justify-center w-8 h-8 rounded-full text-[#99A0AE] hover:text-blue-600 hover:bg-blue-50 transition-colors"
          title="Edit"
        >
          <EditIcon className="w-4 h-4" />
        </button>
        <button
          onClick={() => handleDelete(index)}
          className="flex items-center justify-center w-8 h-8 rounded-full text-[#99A0AE] hover:text-red-600 hover:bg-red-50 transition-colors"
          title="Delete"
        >
          <DeleteIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

const StaticCard = ({ status }) => {
  return (
    <div className="bg-[#FAFBFC] border border-[#E1E4EA] rounded-lg p-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
          <Lock className="w-4 h-4 text-[#99A0AE]" />
        </div>
        <div className="w-2 h-2 rounded-full bg-[#99A0AE] flex-shrink-0" />
        <div className="flex flex-col">
          <span className="text-[14px] font-medium text-[#1F2937] leading-tight">{status}</span>
          <span className="text-[12px] text-[#525866] font-medium">System default</span>
        </div>
      </div>
    </div>
  );
};

// `embedded` = rendered inside a drawer (PipelineStageDrawer) rather than on
// the Settings page. The drawer already supplies the surrounding card, padding
// and a footer hint, so embedded mode drops this component's own outer card,
// the page-header offset, and the trailing hint to avoid double-nesting.
export default function KanbanSettings({ embedded = false }) {
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
    <div className={embedded ? "space-y-4" : "space-y-6 -mt-8"}>
      <AppToaster />

      <div className={embedded ? "" : "bg-white rounded-2xl border border-gray-200 shadow-sm p-6"}>
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
          <div className="space-y-8 mt-6">
            {/* System Defaults Section */}
            <div>
              <div className="mb-3 border-b border-[#E1E4EA] pb-2">
                <h3 className="text-[11px] font-bold text-gray-500 tracking-wider uppercase">System Default</h3>
              </div>
              <div className="space-y-2">
                {statuses.map((status) => {
                  if (status !== "Won" && status !== "Lost") return null;
                  return <StaticCard key={status} status={status} />;
                })}
              </div>
            </div>

            {/* Custom Stages Section */}
            <div>
              <div className="mb-3 border-b border-[#E1E4EA] pb-2">
                <h3 className="text-[11px] font-bold text-gray-500 tracking-wider uppercase">Custom Stages</h3>
              </div>
              
              {statuses.filter((s) => s !== "Won" && s !== "Lost").length === 0 ? (
                <div className="text-center py-8 rounded-xl border border-dashed border-[#E1E4EA] bg-[#FAFBFC]">
                  <p className="text-sm text-gray-500">No custom stages yet</p>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  modifiers={[restrictToVerticalAxis, restrictToParentElement]}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <div className="space-y-2 relative">
                    <SortableContext
                      items={statuses.filter((s) => s !== "Won" && s !== "Lost")}
                      strategy={verticalListSortingStrategy}
                    >
                      {statuses.map((status, index) => {
                        if (status === "Won" || status === "Lost") return null;
                        return (
                          <SortableCard
                            key={status}
                            id={status}
                            index={index}
                            isEditing={editIndex === index}
                            editValue={editValue}
                            setEditValue={setEditValue}
                            handleUpdate={handleUpdate}
                            handleCancel={handleCancel}
                            handleEdit={handleEdit}
                            handleDelete={handleDelete}
                          />
                        );
                      })}
                    </SortableContext>
                  </div>
                </DndContext>
              )}
            </div>
          </div>
        )}

        {!embedded && (
          <p className="text-xs text-gray-400 mt-3">
            Drag a row to reorder the pipeline. Changes save automatically and apply to all deals.
            Won and Lost cannot be renamed or removed.
          </p>
        )}
      </div>
    </div>
  );
}
