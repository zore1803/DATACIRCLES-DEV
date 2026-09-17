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
import {
  GripVertical,
  Save,
  X,
  Layout,
  AlertCircle,
  CheckCircle2,
  Layers,
  Move,
} from "lucide-react";
import toast from "react-hot-toast";
import AppToaster from "../AppToaster";
import EditIcon from "../common/EditIcon";

const SortableItem = ({ id, children, isDragging }) => {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white border-2 rounded-xl overflow-hidden transition-all ${
        isDragging
          ? "border-blue-400 shadow-2xl opacity-90"
          : "border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300"
      }`}
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center p-4 gap-2">
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="flex-shrink-0 mb-2 sm:mb-0 sm:mr-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg cursor-grab active:cursor-grabbing transition-all"
          title="Drag to reorder"
        >
          <GripVertical className="w-5 h-5" />
        </button>

        {/* Content */}
        <div className="flex-1 flex flex-col sm:flex-row justify-between items-start sm:items-center w-full gap-2">
          {children}
        </div>
      </div>
    </div>
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
    <div className="space-y-6">
      <AppToaster />

      {/* Add New Status */}
      <div className="bg-white rounded-2xl border-2 border-gray-200 p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-green-100 p-2 rounded-lg">
            <PlusIcon className="w-4 h-4 text-green-600" />
          </div>
          <h3 className="text-lg font-bold text-gray-900">Add New Stage</h3>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full">
          <input
            type="text"
            placeholder="Enter stage name (e.g., Qualified, Proposal Sent)"
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleAdd()}
            className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          />
          <button
            onClick={handleAdd}
            style={{ backgroundColor: "#0085FF" }}
            className="flex items-center justify-center gap-2 hover:opacity-90 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg w-full sm:w-auto"
          >
            <PlusIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Add Stage</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>
      </div>

      {/* Stages List */}
      <div className="bg-white rounded-2xl border-2 border-gray-200 p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-purple-100 p-2 rounded-lg">
            <Move className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">Pipeline Stages</h3>
            <p className="text-sm text-gray-600">
              Drag to reorder &bull; Click to edit or delete
            </p>
          </div>
        </div>
        {statuses.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-xl">
            <Layers className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500 font-medium mb-2">No stages yet</p>
            <p className="text-sm text-gray-400">
              Add your first stage to get started
            </p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={statuses}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {statuses.map((status, index) => (
                  <SortableItem
                    key={status}
                    id={status}
                    isDragging={isDragging}
                  >
                    {editIndex === index ? (
                      <>
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyPress={(e) => e.key === "Enter" && handleUpdate()}
                          className="flex-1 px-4 py-2 border-2 border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mr-3 text-sm"
                          autoFocus
                        />
                        <div className="flex gap-2 mt-2 sm:mt-0">
                          <button
                            onClick={handleUpdate}
                            className="flex items-center gap-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors text-sm"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            Save
                          </button>
                          <button
                            onClick={handleCancel}
                            className="flex items-center gap-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-semibold transition-colors text-sm"
                          >
                            <X className="w-4 h-4" />
                            Cancel
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-1">
                          <div className="w-2 h-2 rounded-full bg-blue-500 mt-1 sm:mt-0"></div>
                          <span className="font-semibold text-gray-900">
                            {status}
                          </span>
                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                            Stage {index + 1}
                          </span>
                        </div>
                        <div className="flex gap-2 mt-2 sm:mt-0">
                          <button
                            onClick={() => handleEdit(index)}
                            disabled={status === "Won" || status === "Lost"}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg font-semibold transition-colors text-sm border ${
                              status === "Won" || status === "Lost"
                                ? "text-gray-400 border-gray-200 cursor-not-allowed"
                                : "text-blue-600 hover:bg-blue-50 border-blue-200"
                            }`}
                            title={
                              status === "Won" || status === "Lost"
                                ? "This status cannot be edited"
                                : "Edit status"
                            }
                          >
                            <EditIcon className="w-4 h-4" />
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(index)}
                            disabled={status === "Won" || status === "Lost"}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg font-semibold transition-colors text-sm border ${
                              status === "Won" || status === "Lost"
                                ? "text-gray-400 border-gray-200 cursor-not-allowed"
                                : "text-red-600 hover:bg-red-50 border-red-200"
                            }`}
                            title={
                              status === "Won" || status === "Lost"
                                ? "This status cannot be deleted"
                                : "Delete status"
                            }
                          >
                            <DeleteIcon className="w-4 h-4" />
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </SortableItem>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-lg">
              <Layers className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-600">Total Stages</p>
              <p className="text-xl font-bold text-gray-900">
                {statuses.length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="bg-green-100 p-2 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-600">Pipeline Status</p>
              <p className="text-sm font-bold text-green-600">Active</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="bg-purple-100 p-2 rounded-lg">
              <Move className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-gray-600">Last Updated</p>
              <p className="text-sm font-bold text-gray-900">Just now</p>
            </div>
          </div>
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-blue-900 mb-1">
              How to use Kanban stages
            </h3>
            <div className="flex flex-col md:flex-row md:space-x-6 space-y-1 md:space-y-0">
              <ul className="text-sm text-blue-700 leading-relaxed">
                <li>• Drag and drop stages to reorder them in your pipeline</li>
                <li>• Add new stages to customize your workflow</li>
              </ul>
              <ul className="text-sm text-blue-700 leading-relaxed">
                <li>• Edit or delete existing stages as needed (except "Won" and "Lost")</li>
                <li>• Changes are saved automatically and apply to all deals</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
