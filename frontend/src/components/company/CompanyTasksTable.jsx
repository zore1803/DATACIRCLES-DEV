import CalendarIcon from "../common/CalendarIcon";
import PlusIcon from "../common/PlusIcon";
import React, { useState, useEffect } from "react";
import {
  ChevronDown,
  Clock,
  CheckCircle,
  CheckCircle2,
  Circle,
  PlayCircle,
  Filter
} from "lucide-react";
import API from "../../services/api";
import CompanyTaskForm from "./CompanyTaskForm";
import TaskDetailsModal from "../Task/TaskDetailsModal";
import toast from "react-hot-toast";

const SingleSelectDropdown = ({ options, value, onChange, placeholder = "Select option" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = options.find(opt => opt.value === value) || { label: placeholder, className: 'bg-white border-gray-300 text-gray-700' };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-all focus:outline-none ${selectedOption.className}`}
      >
        <div className="flex items-center gap-2">
          {selectedOption.icon && <selectedOption.icon className="w-4 h-4" />}
          <span>{selectedOption.label}</span>
        </div>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-100 rounded-xl shadow-xl z-50 py-1 overflow-hidden animate-in fade-in zoom-in duration-200">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-1.5 text-[13px] transition-colors hover:bg-gray-50 ${value === option.value ? 'bg-blue-50/50 text-blue-600 font-medium' : 'text-gray-600'
                  }`}
              >
                <div className={`p-1.5 rounded-lg ${option.className} border-none`}>
                  {option.icon && <option.icon className="w-3.5 h-3.5" />}
                </div>
                <span>{option.label}</span>
                {value === option.value && <CheckCircle2 className="w-4 h-4 ml-auto text-blue-600" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const CompanyTasksTable = ({ companyId, setTasks }) => {
  const [tasks, setLocalTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [users, setUsers] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [companyName, setCompanyName] = useState("");

  const statusOptions = [
    { value: "", label: "All Status", icon: Filter, className: "bg-white border-gray-300 text-gray-700" },
    { value: "Pending", label: "To Do", icon: Circle, className: "bg-[#EEF2F9] border-[#D6DEEC] text-[#56698A]" },
    { value: "In Progress", label: "In Progress", icon: PlayCircle, className: "bg-[#E6F8FD] border-[#B8E9F7] text-[#27B4EA]" },
    { value: "Completed", label: "Completed", icon: CheckCircle2, className: "bg-[#E6F7EF] border-[#B9E7D3] text-[#1FA971]" },
  ];

  useEffect(() => {
    const fetchData = async () => {
      if (!companyId) {
        setError("Company ID is missing");
        setLoading(false);
        return;
      }

      const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(companyId);
      if (!isValidObjectId) {
        setError("Invalid Company ID format");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        // Fetch tasks
        const response = await API.get(`/tasks/company/${companyId}`);
        setLocalTasks(response.data || []);
        setTasks(response.data || []); // Update parent state

        // ✅ CORRECT - Fetch organization users, not company contacts
        const usersResponse = await API.get('/auth/all-user');
        setUsers(usersResponse.data.allUsers || []);

        // Fetch company details for name
        const companyResponse = await API.get(`/companies/${companyId}`);
        setCompanyName(companyResponse.data.name || "");

        setError(null);
      } catch (err) {
        setError("Failed to load tasks or users");
        console.error("Error fetching data:", err);
        toast.error("Failed to load tasks or users.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [companyId, setTasks]);

  const handleTaskSave = async (taskData) => {
    try {
      await API.post("/tasks", taskData);
      // Refetch tasks
      const response = await API.get(`/tasks/company/${companyId}`);
      setLocalTasks(response.data || []);
      setTasks(response.data || []); // Update parent state
      toast.success("Task created successfully!");
      setShowTaskForm(false);
    } catch (err) {
      console.error("Error saving task:", err);
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || "Failed to create task.");
      }
      throw err; // Let CompanyTaskForm handle further errors
    }
  };

  const handleTaskUpdate = async () => {
    try {
      // Refetch tasks after update. The success toast is shown by
      // CompanyTaskForm (single source of truth for the update toast) — don't
      // duplicate it here.
      const response = await API.get(`/tasks/company/${companyId}`);
      setLocalTasks(response.data || []);
      setTasks(response.data || []);
    } catch (err) {
      console.error("Error updating task:", err);
      toast.error("Failed to update task.");
    }
  };

  const handleTaskDelete = async (taskId) => {
    try {
      await API.delete(`/tasks/${taskId}`);
      // Refetch tasks
      const response = await API.get(`/tasks/company/${companyId}`);
      setLocalTasks(response.data || []);
      setTasks(response.data || []); // Update parent state
      toast.success("Task deleted successfully!");
      handleCloseTaskModal(); // Close modal after deletion
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

  const handleTaskClick = (task) => {
    setSelectedTask(task);
    setIsTaskModalOpen(true);
  };

  const handleCloseTaskModal = () => {
    setIsTaskModalOpen(false);
    setSelectedTask(null);
  };

  const getRelatedToName = (task) => {
    // Since this is company-specific tasks, return the company name
    return companyName || "N/A";
  };

  const formatDate = (isoDate) => {
    const date = new Date(isoDate);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getStatusBadge = (status) => {
    const statusStyles = {
      Pending: "bg-gray-100 text-gray-700",
      "To Do": "bg-gray-100 text-gray-700",
      "In Progress": "bg-gray-200 text-gray-800",
      Completed: "bg-gray-100 text-gray-900",
      Cancelled: "bg-gray-200 text-gray-700",
    };
    return statusStyles[status] || "bg-gray-100 text-gray-800";
  };

  const filteredTasks = statusFilter
    ? tasks.filter((task) => task.status === statusFilter)
    : tasks;

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="flex items-center justify-between mb-4">
          <div className="h-5 bg-gray-200 rounded w-24"></div>
          <div className="flex space-x-2">
            <div className="h-8 bg-gray-200 rounded w-20"></div>
            <div className="h-8 bg-gray-200 rounded w-24"></div>
          </div>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-900 font-medium mb-2">Error Loading Tasks</div>
        <p className="text-gray-600 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="h-full">
      {/* Header and Controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <CalendarIcon className="w-4 h-4" />
          <span>{filteredTasks.length} tasks</span>
        </div>
        <div className="flex items-center gap-2">
          <SingleSelectDropdown
            options={statusOptions}
            value={statusFilter}
            onChange={setStatusFilter}
            placeholder="All Status"
          />
          <button
            onClick={() => setShowTaskForm(true)}
            className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-800 text-sm transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            New Task
          </button>
        </div>
      </div>

      {/* Tasks List */}
      {filteredTasks.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
          <CalendarIcon className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <p className="text-sm text-gray-600 mb-1">
            {statusFilter ? `No ${statusFilter.toLowerCase()} tasks` : "No tasks yet"}
          </p>
          <p className="text-xs text-gray-500">
            {statusFilter ? "Try changing the filter" : "Tasks will appear here once created"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTasks.map((task) => (
            <div
              key={task._id}
              onClick={() => handleTaskClick(task)}
              className="bg-white rounded-lg border border-gray-200 p-3 hover:border-gray-300 transition-all cursor-pointer group"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-gray-900 truncate">
                    {task.title}
                  </h4>
                  {task.description && (
                    <div
                      dangerouslySetInnerHTML={{ __html: task.description }}
                      className="text-xs text-gray-600 mt-1 line-clamp-1"
                    />
                  )}
                </div>
                <span
                  className={`inline-flex px-2 py-1 text-xs font-medium rounded ${getStatusBadge(
                    task.status
                  )}`}
                >
                  {task.status === "Pending" ? "To Do" : task.status}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500">
                <div className="flex items-center gap-3">
                  {task.dueDate && (
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{formatDate(task.dueDate)}</span>
                    </div>
                  )}
                  {task.users?.length > 0 && (
                    <span className="truncate max-w-[120px]">
                      {task.users[0].name || task.users[0].email || "Unknown"}
                      {task.users.length > 1 && ` +${task.users.length - 1}`}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary Stats */}
      {filteredTasks.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
            <div className="text-gray-600 text-xs font-medium mb-1">Pending</div>
            <div className="text-gray-900 text-xl font-bold">
              {tasks.filter((m) => m.status === "Pending" || m.status === "In Progress").length}
            </div>
          </div>
          <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
            <div className="text-gray-600 text-xs font-medium mb-1">Completed</div>
            <div className="text-gray-900 text-xl font-bold">
              {tasks.filter((m) => m.status === "Completed").length}
            </div>
          </div>
        </div>
      )}

      {/* CompanyTaskForm */}
      {showTaskForm && (
        <CompanyTaskForm
          open={showTaskForm}
          mode="create"
          companyId={companyId}
          users={users}
          onSave={handleTaskSave}
          onDelete={handleTaskDelete}
          onClose={() => setShowTaskForm(false)}
          onUpdate={handleTaskUpdate}
        />
      )}

      {/* Task Details Modal */}
      {selectedTask && (
        <TaskDetailsModal
          open={isTaskModalOpen}
          taskData={selectedTask}
          users={users}
          onDelete={handleTaskDelete}
          onClose={handleCloseTaskModal}
          onUpdate={handleTaskUpdate}
          getRelatedToName={getRelatedToName}
        />
      )}
    </div>
  );
};

export default CompanyTasksTable;
