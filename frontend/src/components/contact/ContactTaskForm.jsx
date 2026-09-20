import CalendarIcon from "../common/CalendarIcon";
import DeleteIcon from "../common/DeleteIcon";
import PdfIcon from "../common/PdfIcon";
import Checkbox from "../common/Checkbox";
import PlusIcon from "../common/PlusIcon";
import React, { useState, useEffect } from "react";
import API from "../../services/api";
import toast from "react-hot-toast";
import { useSystemSettings } from "../../hooks/useSystemSettings";
import {
  X,
  Clock,
  User,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Save
} from "lucide-react";
import TeamIcon from "../common/TeamIcon";
import EditIcon from "../common/EditIcon";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

const initialState = {
  title: "",
  dueDate: "",
  selectedDate: "",
  description: "",
  status: "Pending",
  users: [],
};

const StatusBadge = ({ status }) => {
  const configs = {
    Pending: {
      bg: "bg-amber-50",
      text: "text-amber-700",
      border: "border-amber-200",
      icon: <Clock className="w-3 h-3" />
    },
    Completed: {
      bg: "bg-emerald-50", 
      text: "text-emerald-700",
      border: "border-emerald-200",
      icon: <CheckCircle2 className="w-3 h-3" />
    }
  };

  const config = configs[status] || configs.Pending;

  return (
    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border ${config.bg} ${config.text} ${config.border}`}>
      {config.icon}
      {status}
    </div>
  );
};

const UserChip = ({ user, onRemove, isRemovable = false }) => (
  <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium border border-blue-200">
    <User className="w-3 h-3" />
    <span>{user?.name || user?.email || "Unknown User"}</span>
    {isRemovable && onRemove && (
      <button onClick={onRemove} className="hover:bg-blue-100 rounded-full p-0.5">
        <X className="w-3 h-3" />
      </button>
    )}
  </div>
);

const FormField = ({ label, required, children, error, description }) => (
  <div className="space-y-2">
    <label className="block text-sm font-semibold text-gray-900">
      {label}
      {required && <span className="text-red-500 ml-1">*</span>}
    </label>
    {children}
    {description && <p className="text-xs text-gray-500">{description}</p>}
    {error && <p className="text-xs text-red-600 flex items-center gap-1">
      <AlertCircle className="w-3 h-3" />
      {error}
    </p>}
  </div>
);

const ContactTaskForm = ({ 
  open, 
  mode, 
  taskData, 
  contactId, 
  calendarDate, 
  users, 
  onSave, 
  onDelete, 
  onClose,
  onUpdate 
}) => {
  const [form, setForm] = useState(initialState);
  const [loading, setLoading] = useState(false);
  const [isSliding, setIsSliding] = useState(false);
  const { taskStatuses } = useSystemSettings();

  const [shouldRender, setShouldRender] = useState(false);
  const [errors, setErrors] = useState({});
  const [showUserSelector, setShowUserSelector] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditMode, setIsEditMode] = useState(mode === "create");

  useBodyScrollLock(open);

  useEffect(() => {
    if (open) {
      setShouldRender(true);
      setTimeout(() => setIsSliding(true), 10);
      
      if (taskData && mode === "view") {
        setForm({
          ...taskData,
          dueDate: taskData.dueDate ? new Date(taskData.dueDate).toISOString().split('T')[0] : "",
          selectedDate: taskData.selectedDate ? new Date(taskData.selectedDate).toISOString().split('T')[0] : "",
          users: taskData.users?.map(u => u._id || u) || [],
        });
      } else {
        setForm({
          ...initialState,
          selectedDate: calendarDate ? calendarDate : "",
        });
      }
      setErrors({});
      setIsEditMode(mode === "create");
    } else {
      setIsSliding(false);
      setTimeout(() => setShouldRender(false), 300);
      setShowUserSelector(false);
    }
  }, [open, mode, taskData, calendarDate]);

  const handleChange = (key, val) => {
    setForm(f => ({ ...f, [key]: val }));
    if (errors[key]) {
      setErrors(prev => ({ ...prev, [key]: null }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!form.title?.trim()) newErrors.title = "Task title is required";
    if (!form.dueDate) newErrors.dueDate = "Due date is required";
    if (!calendarDate && !form.selectedDate) newErrors.selectedDate = "Selected date is required";
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleUserSelection = (userId) => {
    const currentUsers = form.users || [];
    if (currentUsers.includes(userId)) {
      setForm(f => ({
        ...f,
        users: currentUsers.filter(id => id !== userId),
      }));
    } else {
      setForm(f => ({
        ...f,
        users: [...currentUsers, userId],
      }));
    }
  };

  const removeUser = (userId) => {
    setForm(f => ({
      ...f,
      users: f.users.filter(id => id !== userId)
    }));
  };

const handleSubmit = async (e) => {
  e.preventDefault();
  
  if (!validateForm()) {
    toast.error("Please fix the errors before submitting");
    return;
  }

  setLoading(true);
  
  try {
    const createLocalDate = (dateString) => {
      if (!dateString) return null;
      const [year, month, day] = dateString.split('-');
      return new Date(year, month - 1, day);
    };

    // Convert old structure to new relatedEntities array format
    const payload = {
      title: form.title,
      description: form.description,
      status: form.status,
      users: form.users,
      dueDate: createLocalDate(form.dueDate),
      selectedDate: calendarDate || createLocalDate(form.selectedDate),
      relatedEntities: [{
        entityModel: "Contact",
        entityId: contactId
      }]
    };

    if (isEditMode && mode === "view") {
      await API.put(`/tasks/${taskData._id}`, payload);
      onUpdate();
      toast.success("Task updated successfully");
    } else {
      await onSave(payload);
      toast.success("Task saved successfully");
    }
    onClose();
  } catch (err) {
    console.error("Error saving task:", err);
    if (err.response?.status === 402) {
      toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
    } else {
      toast.error(err.response?.data?.error || (isEditMode && mode === "view" ? "Failed to update task" : "Failed to save task"));
    }
  } finally {
    setLoading(false);
  }
};


  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await onDelete(taskData._id);
      toast.success("Task deleted successfully");
      onClose();
    } catch (err) {
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || "Failed to delete task");
      }
    } finally {
      setIsDeleting(false);
    }
  };

  if (!shouldRender) return null;

  const assignedUsers = form.users?.map(userId => 
    users?.find(u => u._id === userId)
  ).filter(Boolean) || [];

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[10000] transition-all duration-300"
        style={{ opacity: isSliding ? 1 : 0 }}
        onClick={onClose}
      />
      <div
        className={`fixed dc-panel-card dc-panel-w z-[10001] bg-white shadow-2xl transform transition-transform duration-300 ease-out ${
          isSliding ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"
        }`}
      >
        <div className="h-full flex flex-col">
          <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center gap-3">
              <div className="bg-blue-100 p-2 rounded-xl">
                <CheckCircle2 className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  {isEditMode ? "Edit Task" : mode === "create" ? "Create Task" : "Task Details"}
                </h3>
                <p className="text-sm text-gray-600">
                  {isEditMode ? "Update task details" : mode === "create" ? "Add a new task to your workflow" : "View and manage task details"}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            {isEditMode ? (
              <form onSubmit={handleSubmit} className="space-y-6">
                <FormField label="Task Title" required error={errors.title}>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => handleChange("title", e.target.value)}
                    className={`w-full px-4 py-3 rounded-xl border transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.title ? 'border-red-300 bg-red-50' : 'border-gray-300 bg-white'
                    }`}
                    placeholder="Enter a descriptive task title"
                  />
                </FormField>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <FormField 
                    label="Selected Date" 
                    required={!calendarDate} 
                    error={errors.selectedDate}
                    description={calendarDate ? "Date selected from calendar" : "Choose when to work on this task"}
                  >
                    {calendarDate ? (
                      <div className="flex items-center gap-2 py-3 px-4 bg-blue-50 text-blue-800 rounded-xl border border-blue-200">
                        <CalendarIcon className="w-4 h-4" />
                        <span className="font-medium">{calendarDate}</span>
                      </div>
                    ) : (
                      <div className="relative">
                        <CalendarIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                          type="date"
                          value={form.selectedDate}
                          onChange={(e) => handleChange("selectedDate", e.target.value)}
                          className={`w-full pl-10 pr-4 py-3 rounded-xl border transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            errors.selectedDate ? 'border-red-300 bg-red-50' : 'border-gray-300 bg-white'
                          }`}
                        />
                      </div>
                    )}
                  </FormField>
                  <FormField label="Due Date" required error={errors.dueDate}>
                    <div className="relative">
                      <CalendarIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <input
                        type="date"
                        value={form.dueDate}
                        min={form.selectedDate || "2000-01-01"}
                        max="2099-12-31"
                        onChange={(e) => handleChange("dueDate", e.target.value)}
                        className={`w-full pl-10 pr-4 py-3 rounded-xl border transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          errors.dueDate ? 'border-red-300 bg-red-50' : 'border-gray-300 bg-white'
                        }`}
                      />
                    </div>
                  </FormField>
                </div>
                <FormField label="Description" description="Provide additional context and requirements">
                  <textarea
                    value={form.description}
                    onChange={(e) => handleChange("description", e.target.value)}
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    placeholder="Describe the task objectives, requirements, and any important details..."
                  />
                </FormField>
                <FormField label="Status">
                  <select
                    value={form.status}
                    onChange={(e) => handleChange("status", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white transition-all focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {taskStatuses.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </FormField>
                <FormField
                  label="Assign Users" 
                  description={`${form.users?.length || 0} user(s) assigned`}
                >
                  <div className="space-y-3">
                    {assignedUsers.length > 0 && (
                      <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
                        {assignedUsers.map((user) => (
                          <UserChip
                            key={user._id}
                            user={user}
                            isRemovable={true}
                            onRemove={() => removeUser(user._id)}
                          />
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowUserSelector(!showUserSelector)}
                      className="flex items-center gap-2 px-4 py-3 bg-blue-50 text-blue-700 rounded-xl border border-blue-200 hover:bg-blue-100 transition-colors w-full justify-center"
                    >
                      <PlusIcon className="w-4 h-4" />
                      {showUserSelector ? "Hide Users" : "Select Users"}
                    </button>
                    {showUserSelector && (
                      <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-xl bg-white">
                        {users?.length === 0 ? (
                          <div className="p-4 text-center text-gray-500">
                            <TeamIcon className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                            <p className="text-sm">No users available</p>
                          </div>
                        ) : (
                          <div className="p-3 space-y-2">
                            {users?.map((user) => (
                              <label
                                key={user._id}
                                className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors"
                              >
                                <Checkbox checked={form.users?.includes(user._id)} onChange={() => handleUserSelection(user._id)} />
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                                    <User className="w-3 h-3 text-blue-600" />
                                  </div>
                                  <span className="text-sm font-medium text-gray-700">
                                    {user.name || user.email}
                                  </span>
                                </div>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </FormField>
                <div className="flex gap-3 pt-6 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 px-6 py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        {isEditMode && mode === "view" ? "Updating..." : "Saving..."}
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        {isEditMode && mode === "view" ? "Update Task" : "Create Task"}
                      </>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-8">
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <h2 className="text-2xl font-bold text-gray-900 leading-tight">{form.title}</h2>
                    <StatusBadge status={form.status} />
                  </div>
                  {form.description && (
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                      <div className="flex items-start gap-2 mb-2">
                        <PdfIcon className="w-4 h-4 text-gray-500 mt-0.5" />
                        <span className="text-sm font-semibold text-gray-700">Description</span>
                      </div>
                      <p className="text-gray-700 whitespace-pre-line leading-relaxed">{form.description}</p>
                    </div>
                  )}
                </div>
                <div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div className="p-4 bg-white border border-gray-200 rounded-xl">
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="w-4 h-4 text-gray-500" />
                        <span className="text-sm font-semibold text-gray-700">Scheduled Date</span>
                      </div>
                      <p className="text-lg font-semibold text-gray-900">
                        {form.selectedDate ? new Date(form.selectedDate).toLocaleDateString('en-US', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        }) : "No date selected"}
                      </p>
                    </div>
                    <div className="p-4 bg-white border border-gray-200 rounded-xl">
                      <div className="flex items-center gap-2 mb-2">
                        <CalendarIcon className="w-4 h-4 text-gray-500" />
                        <span className="text-sm font-semibold text-gray-700">Due Date</span>
                      </div>
                      <p className="text-lg font-semibold text-gray-900">
                        {form.dueDate ? new Date(form.dueDate).toLocaleDateString('en-US', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        }) : "No due date set"}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-6">
                    <div className="p-4 bg-white border border-gray-200 rounded-xl">
                      <div className="flex items-center gap-2 mb-3">
                        <TeamIcon className="w-4 h-4 text-gray-500" />
                        <span className="text-sm font-semibold text-gray-700">
                          Assigned Users ({assignedUsers.length})
                        </span>
                      </div>
                      {assignedUsers.length > 0 ? (
                        <div className="space-y-2">
                          {assignedUsers.map((user) => (
                            <UserChip key={user._id} user={user} />
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-4">
                          <User className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                          <p className="text-sm text-gray-500">No users assigned</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {onDelete && (
                  <div className="flex justify-end gap-3 pt-6 border-t border-gray-200">
                    <button
                      onClick={() => setIsEditMode(true)}
                      className="flex items-center gap-2 px-6 py-3 text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl font-semibold transition-colors"
                    >
                      <EditIcon className="w-4 h-4" />
                      Edit Task
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-colors border
                        ${isDeleting
                          ? "bg-red-100 text-red-400 border-red-100 cursor-not-allowed"
                          : "text-red-700 bg-red-50 hover:bg-red-100 border-red-200"
                        }`}
                    >
                      {isDeleting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Deleting...
                        </>
                      ) : (
                        <>
                          <DeleteIcon className="w-4 h-4" />
                          Delete Task
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export { StatusBadge, UserChip };
export default ContactTaskForm;
