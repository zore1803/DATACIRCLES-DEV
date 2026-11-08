import { isNativeApp } from "../../utils/isNativeApp";
import CalendarIcon from "../common/CalendarIcon";
import PlusIcon from "../common/PlusIcon";
import React, { useState, useEffect } from "react";
import { ChevronDown, CheckCircle } from "lucide-react";
import API from "../../services/api";
import ContactTaskForm from "./ContactTaskForm";
import TaskDetailsModal from "../Task/TaskDetailsModal";
import toast from "react-hot-toast";

const ContactTasksTable = ({ contactId }) => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [users, setUsers] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [contactName, setContactName] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      if (!contactId) {
        setError("Contact ID is missing");
        setLoading(false);
        return;
      }

      const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(contactId);
      if (!isValidObjectId) {
        setError("Invalid Contact ID format");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        // Fetch tasks for this contact
        const response = await API.get(`/tasks/contact/${contactId}`);
        setTasks(response.data || []);
        
        // Fetch users for assignment
        const usersResponse = await API.get("/auth/all-user");
        setUsers(usersResponse.data.allUsers || []);
        
        // Fetch contact details for name
        const contactResponse = await API.get(`/contacts/${contactId}`);
        setContactName(contactResponse.data.name || "");
        
        setError(null);
      } catch (err) {
        setError("Failed to load tasks");
        console.error("Error fetching data:", err);
        toast.error("Failed to load tasks.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [contactId]);

  const handleTaskSave = async (taskData) => {
    try {
      await API.post("/tasks", taskData);
      // Refetch tasks
      const response = await API.get(`/tasks/contact/${contactId}`);
      setTasks(response.data || []);
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
      // Refetch tasks
      const response = await API.get(`/tasks/contact/${contactId}`);
      setTasks(response.data || []);
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

  const handleTaskClick = (task) => {
    setSelectedTask(task);
    setIsTaskModalOpen(true);
  };

  const handleCloseTaskModal = () => {
    setIsTaskModalOpen(false);
    setSelectedTask(null);
  };

  const getRelatedToName = (task) => {
    return contactName || "N/A";
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
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <CalendarIcon className="w-4 h-4" />
          <span>{filteredTasks.length} tasks</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`appearance-none bg-white border border-gray-300 ${isNativeApp ? "rounded-full" : "rounded-lg"} pl-3 pr-8 py-2 text-sm focus:outline-none focus:border-gray-400`}
            >
              <option value="">All Status</option>
              <option value="Pending">Pending</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
          <button
            onClick={() => setShowTaskForm(true)}
            className={`flex items-center gap-1 px-3 py-2 bg-blue-600 text-white hover:bg-blue-700 text-sm transition-colors ${isNativeApp ? "rounded-full px-4" : "rounded-lg"}`}
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
                  className={`inline-flex px-2 py-1 text-xs font-medium rounded capitalize whitespace-nowrap ${getStatusBadge(
                    task.status
                  )}`}
                >
                  {task.status === "Pending" ? "To Do" : task.status}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <CalendarIcon className="w-3 h-3" />
                    <span>{task.dueDate ? formatDate(task.dueDate) : "No due date"}</span>
                  </div>
                </div>
                {task.users?.length > 0 && (
                  <span className="text-gray-600">
                    {task.users.map((user) => user.name || "Unknown").join(", ")}
                  </span>
                )}
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

      {/* ContactTaskForm */}
      {showTaskForm && (
        <ContactTaskForm
          open={showTaskForm}
          mode="create"
          contactId={contactId}
          users={users}
          onSave={handleTaskSave}
          onDelete={handleTaskDelete}
          onClose={() => setShowTaskForm(false)}
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
          getRelatedToName={getRelatedToName}
        />
      )}
    </div>
  );
};

export default ContactTasksTable;
