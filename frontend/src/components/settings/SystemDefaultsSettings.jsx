import DeleteIcon from "../common/DeleteIcon";
import PdfIcon from "../common/PdfIcon";
import PlusIcon from "../common/PlusIcon";
import React, { useState, useEffect } from "react";
import { Lock, Loader2, Timer, Settings2, X, Check, CalendarDays } from "lucide-react";
import API from "../../services/api";
import toast from "react-hot-toast";
import EditIcon from "../common/EditIcon";

const DEFAULT_TASK_STATUSES = ["Pending", "In Progress", "Completed"];
const DEFAULT_NOTE_TYPES = ["General Note", "Meeting Note", "Call Note", "Follow-up Note"];
const DEFAULT_MEETING_TYPES = ["General Meeting", "Client Call", "Demo", "Follow-up"];

const TABS = [
  { id: "task", label: "Task" },
  { id: "note", label: "Note" },
  { id: "meeting", label: "Meeting" },
];

function SystemDefaultsSettings() {
  const [activeTab, setActiveTab] = useState("task");
  const [taskStatuses, setTaskStatuses] = useState([]);
  const [noteTypes, setNoteTypes] = useState([]);
  const [meetingTypes, setMeetingTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // New items state
  const [newTaskStatus, setNewTaskStatus] = useState("");
  const [newNoteType, setNewNoteType] = useState("");
  const [newMeetingType, setNewMeetingType] = useState("");

  // Edit states
  const [editingTaskIndex, setEditingTaskIndex] = useState(null);
  const [editTaskValue, setEditTaskValue] = useState("");
  const [editingNoteIndex, setEditingNoteIndex] = useState(null);
  const [editNoteValue, setEditNoteValue] = useState("");
  const [editingMeetingIndex, setEditingMeetingIndex] = useState(null);
  const [editMeetingValue, setEditMeetingValue] = useState("");

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await API.get("/system-settings");
      // ensure defaults are present
      const fetchedStatuses = res.data?.taskStatuses || DEFAULT_TASK_STATUSES;
      const fetchedNotes = res.data?.noteTypes || DEFAULT_NOTE_TYPES;
      const fetchedMeetings = res.data?.meetingTypes || DEFAULT_MEETING_TYPES;

      setTaskStatuses(fetchedStatuses);
      setNoteTypes(fetchedNotes);
      setMeetingTypes(fetchedMeetings);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load system settings");
    } finally {
      setLoading(false);
    }
  };

  const updateTaskStatuses = async (newStatuses) => {
    try {
      setIsSaving(true);
      const res = await API.put("/system-settings/task-statuses", { statuses: newStatuses });
      setTaskStatuses(res.data.taskStatuses);
      toast.success("Task statuses updated");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update task statuses");
      fetchSettings(); // revert
    } finally {
      setIsSaving(false);
    }
  };

  const updateNoteTypes = async (newTypes) => {
    try {
      setIsSaving(true);
      const res = await API.put("/system-settings/note-types", { noteTypes: newTypes });
      setNoteTypes(res.data.noteTypes);
      toast.success("Note types updated");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update note types");
      fetchSettings(); // revert
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddTaskStatus = (e) => {
    e.preventDefault();
    if (!newTaskStatus.trim()) return;
    if (taskStatuses.includes(newTaskStatus.trim())) {
      toast.error("Status already exists");
      return;
    }
    const updated = [...taskStatuses, newTaskStatus.trim()];
    setNewTaskStatus("");
    updateTaskStatuses(updated);
  };

  const handleRemoveTaskStatus = (status) => {
    if (DEFAULT_TASK_STATUSES.includes(status)) return; // double check
    const updated = taskStatuses.filter(s => s !== status);
    updateTaskStatuses(updated);
  };

  const handleAddNoteType = (e) => {
    e.preventDefault();
    if (!newNoteType.trim()) return;
    if (noteTypes.includes(newNoteType.trim())) {
      toast.error("Note type already exists");
      return;
    }
    const updated = [...noteTypes, newNoteType.trim()];
    setNewNoteType("");
    updateNoteTypes(updated);
  };

  const handleRemoveNoteType = (type) => {
    if (DEFAULT_NOTE_TYPES.includes(type)) return;
    const updated = noteTypes.filter(t => t !== type);
    updateNoteTypes(updated);
  };

  const handleEditTaskSave = (index) => {
    if (!editTaskValue.trim()) return;
    if (taskStatuses.includes(editTaskValue.trim()) && editTaskValue.trim() !== taskStatuses[index]) {
      toast.error("Status already exists");
      return;
    }
    const updated = [...taskStatuses];
    updated[index] = editTaskValue.trim();
    updateTaskStatuses(updated);
    setEditingTaskIndex(null);
  };

  const updateMeetingTypes = async (newTypes) => {
    try {
      setIsSaving(true);
      const res = await API.put("/system-settings/meeting-types", { meetingTypes: newTypes });
      setMeetingTypes(res.data.meetingTypes);
      toast.success("Meeting types updated");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update meeting types");
      fetchSettings();
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddMeetingType = (e) => {
    e.preventDefault();
    if (!newMeetingType.trim()) return;
    if (meetingTypes.includes(newMeetingType.trim())) {
      toast.error("Meeting type already exists");
      return;
    }
    const updated = [...meetingTypes, newMeetingType.trim()];
    setNewMeetingType("");
    updateMeetingTypes(updated);
  };

  const handleRemoveMeetingType = (type) => {
    if (DEFAULT_MEETING_TYPES.includes(type)) return;
    const updated = meetingTypes.filter(t => t !== type);
    updateMeetingTypes(updated);
  };

  const handleEditMeetingSave = (index) => {
    if (!editMeetingValue.trim()) return;
    if (meetingTypes.includes(editMeetingValue.trim()) && editMeetingValue.trim() !== meetingTypes[index]) {
      toast.error("Meeting type already exists");
      return;
    }
    const updated = [...meetingTypes];
    updated[index] = editMeetingValue.trim();
    updateMeetingTypes(updated);
    setEditingMeetingIndex(null);
  };

  const handleEditNoteSave = (index) => {
    if (!editNoteValue.trim()) return;
    if (noteTypes.includes(editNoteValue.trim()) && editNoteValue.trim() !== noteTypes[index]) {
      toast.error("Note type already exists");
      return;
    }
    const updated = [...noteTypes];
    updated[index] = editNoteValue.trim();
    updateNoteTypes(updated);
    setEditingNoteIndex(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 -mt-8">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="relative inline-flex items-center bg-gray-100 rounded-full p-1 mb-5">
          <span
            className="absolute top-1 bottom-1 w-24 rounded-full bg-white shadow-sm transition-all duration-300 ease-out pointer-events-none"
            style={{ left: 4 + TABS.findIndex((t) => t.id === activeTab) * 96 }}
          />
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`relative z-10 w-24 py-2 text-sm font-semibold rounded-full transition-colors ${
                activeTab === tab.id ? "text-[#0085FF]" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Task Statuses Card */}
        {activeTab === "task" && (
        <div>
          <form onSubmit={handleAddTaskStatus} className="flex gap-2 mb-5">
            <input
              type="text"
              value={newTaskStatus}
              onChange={(e) => setNewTaskStatus(e.target.value)}
              placeholder="Add custom status (e.g. Under Review)"
              className="flex-1 min-w-0 px-4 py-2 text-sm rounded-full border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#0085FF]/30 focus:border-[#0085FF]"
              disabled={isSaving}
            />
            <button
              type="submit"
              disabled={isSaving || !newTaskStatus.trim()}
              className="flex-shrink-0 px-4 py-2 bg-[#0085FF] hover:bg-blue-600 text-white text-sm font-semibold rounded-full disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              <PlusIcon className="w-4 h-4" /> Add
            </button>
          </form>

          <div className="overflow-x-auto rounded-xl border border-[#E1E4EA]">
            <table className="min-w-full border-collapse text-sm text-left">
              <thead className="bg-[#F5F7FA] border-b border-[#E1E4EA]">
                <tr>
                  <th className="px-4 py-3 text-sm font-bold text-[#525866]">Status</th>
                  <th className="px-4 py-3 text-sm font-bold text-[#525866]">Type</th>
                  <th className="px-4 py-3 text-sm font-bold text-[#525866] text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {taskStatuses.map((status, index) => {
                  const isDefault = DEFAULT_TASK_STATUSES.includes(status);
                  const isEditing = editingTaskIndex === index;
                  return (
                    <tr key={index} className="group hover:bg-[#F5F7FA] transition-colors border-b border-[#E1E4EA] last:border-b-0">
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editTaskValue}
                            onChange={(e) => setEditTaskValue(e.target.value)}
                            className="w-full max-w-xs px-3 py-1.5 text-sm rounded-full border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#0085FF]/30 focus:border-[#0085FF]"
                            autoFocus
                          />
                        ) : (
                          <div className="flex items-center gap-2.5">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isDefault ? "bg-gray-300" : "bg-[#0085FF]"}`} />
                            <span className="text-sm font-semibold text-gray-900">{status}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isDefault ? (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-900">
                            <Lock className="w-3 h-3" /> System default
                          </span>
                        ) : (
                          <span className="text-xs text-[#0085FF]">Custom</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleEditTaskSave(index)}
                              className="flex items-center justify-center w-7 h-7 rounded-full bg-[#0085FF] hover:bg-blue-600 text-white transition-colors"
                              title="Save"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingTaskIndex(null)}
                              className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-600 transition-colors"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : !isDefault ? (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => { setEditingTaskIndex(index); setEditTaskValue(status); }}
                              disabled={isSaving}
                              className="flex items-center justify-center w-7 h-7 rounded-full text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
                              title="Edit"
                            >
                              <EditIcon className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveTaskStatus(status)}
                              disabled={isSaving}
                              className="flex items-center justify-center w-7 h-7 rounded-full text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                              title="Delete"
                            >
                              <DeleteIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {/* Note Types Card */}
        {activeTab === "note" && (
        <div>
          <form onSubmit={handleAddNoteType} className="flex gap-2 mb-5">
            <input
              type="text"
              value={newNoteType}
              onChange={(e) => setNewNoteType(e.target.value)}
              placeholder="Add custom note type (e.g. Customer Feedback)"
              className="flex-1 min-w-0 px-4 py-2 text-sm rounded-full border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#0085FF]/30 focus:border-[#0085FF]"
              disabled={isSaving}
            />
            <button
              type="submit"
              disabled={isSaving || !newNoteType.trim()}
              className="flex-shrink-0 px-4 py-2 bg-[#0085FF] hover:bg-blue-600 text-white text-sm font-semibold rounded-full disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              <PlusIcon className="w-4 h-4" /> Add
            </button>
          </form>

          <div className="overflow-x-auto rounded-xl border border-[#E1E4EA]">
            <table className="min-w-full border-collapse text-sm text-left">
              <thead className="bg-[#F5F7FA] border-b border-[#E1E4EA]">
                <tr>
                  <th className="px-4 py-3 text-sm font-bold text-[#525866]">Note Type</th>
                  <th className="px-4 py-3 text-sm font-bold text-[#525866]">Type</th>
                  <th className="px-4 py-3 text-sm font-bold text-[#525866] text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {noteTypes.map((type, index) => {
                  const isDefault = DEFAULT_NOTE_TYPES.includes(type);
                  const isEditing = editingNoteIndex === index;
                  return (
                    <tr key={index} className="group hover:bg-[#F5F7FA] transition-colors border-b border-[#E1E4EA] last:border-b-0">
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editNoteValue}
                            onChange={(e) => setEditNoteValue(e.target.value)}
                            className="w-full max-w-xs px-3 py-1.5 text-sm rounded-full border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#0085FF]/30 focus:border-[#0085FF]"
                            autoFocus
                          />
                        ) : (
                          <div className="flex items-center gap-2.5">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isDefault ? "bg-gray-300" : "bg-[#0085FF]"}`} />
                            <span className="text-sm font-semibold text-gray-900">{type}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isDefault ? (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-900">
                            <Lock className="w-3 h-3" /> System default
                          </span>
                        ) : (
                          <span className="text-xs text-[#0085FF]">Custom</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleEditNoteSave(index)}
                              className="flex items-center justify-center w-7 h-7 rounded-full bg-[#0085FF] hover:bg-blue-600 text-white transition-colors"
                              title="Save"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingNoteIndex(null)}
                              className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-600 transition-colors"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : !isDefault ? (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => { setEditingNoteIndex(index); setEditNoteValue(type); }}
                              disabled={isSaving}
                              className="flex items-center justify-center w-7 h-7 rounded-full text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
                              title="Edit"
                            >
                              <EditIcon className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveNoteType(type)}
                              disabled={isSaving}
                              className="flex items-center justify-center w-7 h-7 rounded-full text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                              title="Delete"
                            >
                              <DeleteIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {/* Meeting Types Card */}
        {activeTab === "meeting" && (
        <div>
          <form onSubmit={handleAddMeetingType} className="flex gap-2 mb-5">
            <input
              type="text"
              value={newMeetingType}
              onChange={(e) => setNewMeetingType(e.target.value)}
              placeholder="Add custom meeting type (e.g. Board Review)"
              className="flex-1 min-w-0 px-4 py-2 text-sm rounded-full border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#0085FF]/30 focus:border-[#0085FF]"
              disabled={isSaving}
            />
            <button
              type="submit"
              disabled={isSaving || !newMeetingType.trim()}
              className="flex-shrink-0 px-4 py-2 bg-[#0085FF] hover:bg-blue-600 text-white text-sm font-semibold rounded-full disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              <PlusIcon className="w-4 h-4" /> Add
            </button>
          </form>

          <div className="overflow-x-auto rounded-xl border border-[#E1E4EA]">
            <table className="min-w-full border-collapse text-sm text-left">
              <thead className="bg-[#F5F7FA] border-b border-[#E1E4EA]">
                <tr>
                  <th className="px-4 py-3 text-sm font-bold text-[#525866]">Meeting Type</th>
                  <th className="px-4 py-3 text-sm font-bold text-[#525866]">Type</th>
                  <th className="px-4 py-3 text-sm font-bold text-[#525866] text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {meetingTypes.map((type, index) => {
                  const isDefault = DEFAULT_MEETING_TYPES.includes(type);
                  const isEditing = editingMeetingIndex === index;
                  return (
                    <tr key={index} className="group hover:bg-[#F5F7FA] transition-colors border-b border-[#E1E4EA] last:border-b-0">
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editMeetingValue}
                            onChange={(e) => setEditMeetingValue(e.target.value)}
                            className="w-full max-w-xs px-3 py-1.5 text-sm rounded-full border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#0085FF]/30 focus:border-[#0085FF]"
                            autoFocus
                          />
                        ) : (
                          <div className="flex items-center gap-2.5">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isDefault ? "bg-gray-300" : "bg-[#0085FF]"}`} />
                            <span className="text-sm font-semibold text-gray-900">{type}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isDefault ? (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-900">
                            <Lock className="w-3 h-3" /> System default
                          </span>
                        ) : (
                          <span className="text-xs text-[#0085FF]">Custom</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleEditMeetingSave(index)}
                              className="flex items-center justify-center w-7 h-7 rounded-full bg-[#0085FF] hover:bg-blue-600 text-white transition-colors"
                              title="Save"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingMeetingIndex(null)}
                              className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-600 transition-colors"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : !isDefault ? (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => { setEditingMeetingIndex(index); setEditMeetingValue(type); }}
                              disabled={isSaving}
                              className="flex items-center justify-center w-7 h-7 rounded-full text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
                              title="Edit"
                            >
                              <EditIcon className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveMeetingType(type)}
                              disabled={isSaving}
                              className="flex items-center justify-center w-7 h-7 rounded-full text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                              title="Delete"
                            >
                              <DeleteIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        )}

      </div>
    </div>
  );
}

export default SystemDefaultsSettings;
