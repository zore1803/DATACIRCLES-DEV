import DeleteIcon from "../common/DeleteIcon";
import React from "react";
import { X, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import EditIcon from "../common/EditIcon";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

const DealIcon = (props) => (
  <svg width="17" height="16" viewBox="0 0 17 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M1.66667 15.8333C1.20833 15.8333 0.815972 15.6701 0.489583 15.3438C0.163194 15.0174 0 14.625 0 14.1667V5C0 4.54167 0.163194 4.14931 0.489583 3.82292C0.815972 3.49653 1.20833 3.33333 1.66667 3.33333H5V1.66667C5 1.20833 5.16319 0.815972 5.48958 0.489583C5.81597 0.163194 6.20833 0 6.66667 0H10C10.4583 0 10.8507 0.163194 11.1771 0.489583C11.5035 0.815972 11.6667 1.20833 11.6667 1.66667V3.33333H15C15.4583 3.33333 15.8507 3.49653 16.1771 3.82292C16.5035 4.14931 16.6667 4.54167 16.6667 5V14.1667C16.6667 14.625 16.5035 15.0174 16.1771 15.3438C15.8507 15.6701 15.4583 15.8333 15 15.8333H1.66667ZM1.66667 14.1667H15V5H1.66667V14.1667ZM6.66667 3.33333H10V1.66667H6.66667V3.33333Z" fill="#D4AA00" />
  </svg>
);

const CircleCheckIcon = (props) => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M10 18.3333C5.39763 18.3333 1.66667 14.6024 1.66667 10C1.66667 5.39763 5.39763 1.66667 10 1.66667C14.6024 1.66667 18.3333 5.39763 18.3333 10C18.3333 14.6024 14.6024 18.3333 10 18.3333ZM9.16912 13.3333L15.0616 7.44005L13.885 6.2634L9.16912 10.98L6.81057 8.62145L5.63398 9.7981L9.16912 13.3333Z" fill="currentColor" />
  </svg>
);

const TaskDetailsModal = ({ open, taskData, users, onDelete, onClose, onEdit, onComplete }) => {
  const [isSliding, setIsSliding] = React.useState(false);
  const [shouldRender, setShouldRender] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  useBodyScrollLock(open);

  React.useEffect(() => {
    if (open) {
      setShouldRender(true);
      setTimeout(() => setIsSliding(true), 10);
    } else {
      setIsSliding(false);
      setTimeout(() => setShouldRender(false), 300);
    }
  }, [open]);

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

  const handleMarkComplete = () => {
    if (onComplete) onComplete(taskData);
    else toast("Mark as complete isn't available yet");
  };

  if (!shouldRender || !taskData) return null;

  const taskId = `TASK-${(taskData._id || "").slice(-5).toUpperCase()}`;
  const authorName = typeof taskData.createdBy === "object" ? taskData.createdBy?.name || "Unknown" : "Unknown";

  const formatFullDateTime = (dateString) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleString("en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatShortDate = (dateString) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
  };

  const formatDueLabel = (dateString) => {
    if (!dateString) return "No due date";
    const date = new Date(dateString);
    const now = new Date();
    const isSameDay = (a, b) =>
      a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const time = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    if (isSameDay(date, now)) return `Today, ${time}`;
    if (isSameDay(date, tomorrow)) return `Tomorrow, ${time}`;
    return `${formatShortDate(dateString)}, ${time}`;
  };

  const isCompleted = taskData.status === "Completed";
  const assignedUsers =
    taskData?.users
      ?.map((user) => (typeof user === "object" ? user : users?.find((u) => u._id === user)))
      .filter(Boolean) || [];
  const linkedContact = taskData.relatedEntities?.find((e) => e.entityModel === "Contact")?.entityId;
  const linkedDeal = taskData.relatedEntities?.find((e) => e.entityModel === "Deal")?.entityId;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[10000] transition-opacity duration-300"
        style={{ opacity: isSliding ? 1 : 0 }}
        onClick={onClose}
      />
      <div
        className={`fixed dc-panel-card dc-panel-w z-[10001] bg-white shadow-2xl flex flex-col transform transition-transform duration-300 font-inter ${
          isSliding ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex flex-row justify-between items-center flex-shrink-0"
          style={{ padding: "23px 24px", gap: 10, height: 55 }}
        >
          <span style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 14, lineHeight: "20px", color: "#78788D" }}>
            {taskId}
          </span>
          <div className="flex flex-row items-center justify-end" style={{ gap: 4 }}>
            {/* Editing a completed task doesn't make sense — it's already done. */}
            {!isCompleted && (
              <button
                onClick={() => onEdit?.(taskData)}
                className="p-1 rounded-lg hover:bg-blue-50 transition-colors"
                title="Edit"
              >
                <EditIcon className="w-5 h-5" style={{ color: "#0085FF" }} />
              </button>
            )}
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="p-1 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
              title="Delete"
            >
              {isDeleting ? (
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#F60000" }} />
              ) : (
                <DeleteIcon className="w-4 h-4" style={{ color: "#F60000" }} />
              )}
            </button>
            <div style={{ width: 1, height: 18, backgroundColor: "rgba(28, 27, 31, 0.3)" }} />
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition-colors" title="Close">
              <X className="w-5 h-5" style={{ color: "#1C1B1F" }} />
            </button>
          </div>
        </div>

        <div style={{ borderBottom: "1px solid #D9D9D9" }} />

        {/* Content */}
        <div className="flex-1 overflow-y-auto space-y-3">
          {/* Title strip */}
          <div className="flex flex-col items-start" style={{ padding: 24, gap: 14 }}>
            <div className="flex flex-col items-start w-full" style={{ gap: 6 }}>
              <h1
                style={{
                  fontFamily: "Inter",
                  fontWeight: 500,
                  fontSize: 16,
                  lineHeight: "120%",
                  letterSpacing: "-0.5px",
                  color: "#0E121B",
                }}
                className="truncate w-full"
              >
                {taskData.title || "Untitled Task"}
              </h1>
              <span
                style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 12, lineHeight: "120%", color: "#525866" }}
                className="truncate w-full"
              >
                Created by {authorName} on {formatFullDateTime(taskData.createdAt)}
              </span>
            </div>
          </div>

          {/* Task Information */}
          <div className="flex flex-col items-start w-full" style={{ padding: "12px 24px", gap: 14 }}>
            <p style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 14, lineHeight: "120%", color: "#1F2937" }}>
              Task Information
            </p>
            <div
              className="flex flex-col items-start w-full"
              style={{ padding: 14, gap: 16, backgroundColor: "#F8FAFC", borderRadius: 14 }}
            >
              {/* Assigned Users + Status pill */}
              <div className="flex flex-row items-center justify-between w-full" style={{ gap: 16 }}>
                <div className="flex flex-row items-start min-w-0" style={{ gap: 12 }}>
                  <div className="flex flex-row flex-shrink-0" style={{ marginLeft: 4 }}>
                    {assignedUsers.slice(0, 3).map((user, i) => {
                      const avatarUrl = user?.profileUrl || user?.userData?.mainData?.profilePic;
                      return avatarUrl ? (
                        <img
                          key={user._id || i}
                          src={avatarUrl}
                          alt={user.name}
                          className="rounded-full object-cover flex-shrink-0"
                          style={{ width: 32, height: 32, marginLeft: -4, border: "2px solid #fff" }}
                        />
                      ) : (
                        <div
                          key={user._id || i}
                          className="rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-700 flex-shrink-0"
                          style={{ width: 32, height: 32, marginLeft: -4, border: "2px solid #fff" }}
                        >
                          {user?.name?.charAt(0)?.toUpperCase() || "?"}
                        </div>
                      );
                    })}
                    {assignedUsers.length === 0 && (
                      <div
                        className="rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-700 flex-shrink-0"
                        style={{ width: 32, height: 32, marginLeft: -4, border: "2px solid #fff" }}
                      >
                        ?
                      </div>
                    )}
                    {assignedUsers.length > 3 && (
                      <div
                        className="rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-semibold text-gray-600 flex-shrink-0"
                        style={{ width: 32, height: 32, marginLeft: -4, border: "2px solid #fff" }}
                      >
                        +{assignedUsers.length - 3}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-start min-w-0 w-full" style={{ gap: 4 }}>
                    <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 10, lineHeight: "120%", color: "#6B7280" }}>
                      {assignedUsers.length > 1 ? "Assigned Users" : "Assigned User"}
                    </span>
                    <span
                      style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 14, lineHeight: "120%", color: "#1F2937" }}
                      className="truncate block w-full"
                      title={assignedUsers.map((u) => u.name).join(", ")}
                    >
                      {assignedUsers.length > 0 ? assignedUsers.map((u) => u.name).join(", ") : "Unassigned"}
                    </span>
                  </div>
                </div>
                <span
                  className="inline-flex items-center justify-center"
                  style={{
                    padding: "4px 8px",
                    borderRadius: 35,
                    backgroundColor: isCompleted ? "#00C950" : "#0085FF",
                    fontFamily: "Inter",
                    fontWeight: 500,
                    fontSize: 12,
                    lineHeight: "120%",
                    color: "#FFFFFF",
                    whiteSpace: "nowrap",
                  }}
                >
                  {isCompleted ? "Completed" : "In-Progress"}
                </span>
              </div>

              {/* Task Type / Priority / Status */}
              <div className="flex flex-row items-start w-full" style={{ gap: 16 }}>
                <div className="flex flex-col items-start flex-1" style={{ gap: 6 }}>
                  <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "120%", color: "#6B7280" }}>
                    Task Type
                  </span>
                  <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 14, lineHeight: "120%", color: "#1F2937" }}>
                    {taskData.relatedEntities?.[0]?.entityModel || "General Task"}
                  </span>
                </div>
                <div className="flex flex-col items-start flex-1" style={{ gap: 6 }}>
                  <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "120%", color: "#6B7280" }}>
                    Priority
                  </span>
                  <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 14, lineHeight: "120%", color: "#0085FF" }}>
                    {taskData.priority
                      ? `${taskData.priority.charAt(0).toUpperCase()}${taskData.priority.slice(1)} Priority`
                      : "—"}
                  </span>
                </div>
                <div className="flex flex-col items-start flex-1" style={{ gap: 6 }}>
                  <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "120%", color: "#6B7280" }}>
                    Status
                  </span>
                  <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 14, lineHeight: "120%", color: "#1F2937" }}>
                    {isCompleted ? "Completed" : "In-Progress"}
                  </span>
                </div>
              </div>

              {/* Start Date / Due Date */}
              <div className="flex flex-row items-start w-full" style={{ gap: 16 }}>
                <div className="flex flex-col items-start flex-1" style={{ gap: 6 }}>
                  <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "120%", color: "#6B7280" }}>
                    Start Date
                  </span>
                  <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 14, lineHeight: "120%", color: "#1C1C1D" }}>
                    {formatShortDate(taskData.selectedDate || taskData.createdAt)}
                  </span>
                </div>
                <div className="flex flex-col items-start flex-1" style={{ gap: 6 }}>
                  <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "120%", color: "#6B7280" }}>
                    Due Date
                  </span>
                  <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 14, lineHeight: "120%", color: "#1F2937" }}>
                    {formatDueLabel(taskData.dueDate)}
                  </span>
                </div>
                <div className="flex-1" style={{ opacity: 0 }} aria-hidden="true" />
              </div>
            </div>
          </div>

          {/* Description header */}
          <div
            className="flex flex-row justify-between items-center w-full"
            style={{ padding: "12px 24px", gap: 14, height: 44 }}
          >
            <p style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 14, lineHeight: "120%", color: "#1F2937" }}>
              Description
            </p>
            {!isCompleted && (
              <button
                onClick={() => onEdit?.(taskData)}
                className="flex items-center justify-center hover:bg-blue-50 rounded-md transition-all flex-shrink-0"
                style={{ width: 20, height: 20 }}
                title="Edit description"
              >
                <EditIcon className="w-4 h-4" style={{ color: "#0085FF" }} />
              </button>
            )}
          </div>

          {/* Description content */}
          <div
            className="box-border flex flex-col items-start w-full"
            style={{ padding: "12px 24px", gap: 14, borderBottom: "1px solid #D9D9D9" }}
          >
            <p
              className="w-full"
              style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 14, lineHeight: "120%", color: "rgba(31, 41, 55, 0.8)" }}
              dangerouslySetInnerHTML={{ __html: taskData.description || "No description provided." }}
            />
          </div>

          {/* Linked Records */}
          <div className="box-border flex flex-col items-start w-full" style={{ padding: "12px 24px", gap: 14 }}>
            <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 14, lineHeight: "120%", color: "#1F2937" }}>
              Linked Records
            </span>
            <div
              className="flex flex-col items-start w-full"
              style={{ padding: 14, gap: 16, backgroundColor: "#F8FAFC", borderRadius: 14 }}
            >
              {/* Row 1: Contact / Deal */}
              <div className="flex flex-row justify-between items-center w-full" style={{ gap: 16 }}>
                <div className="flex flex-row items-center flex-1 min-w-0" style={{ gap: 12 }}>
                  <div
                    className="rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600 flex-shrink-0"
                    style={{ width: 32, height: 32 }}
                  >
                    {linkedContact?.name?.charAt(0)?.toUpperCase() || "?"}
                  </div>
                  <div className="flex flex-col items-start min-w-0 w-full" style={{ gap: 4 }}>
                    <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 10, lineHeight: "120%", color: "#6B7280" }}>
                      Contact
                    </span>
                    <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 14, lineHeight: "120%", color: "#1F2937" }} className="truncate block w-full">
                      {linkedContact?.name || "—"}
                    </span>
                    <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 8, lineHeight: "120%", color: "#6B7280" }} className="truncate block w-full">
                      {linkedContact?.role || "—"}
                    </span>
                  </div>
                </div>
                <div className="flex flex-row items-center flex-1 min-w-0" style={{ gap: 12 }}>
                  <div
                    className="rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ width: 32, height: 32, backgroundColor: "rgba(212, 170, 0, 0.1)" }}
                  >
                    <DealIcon className="w-5 h-5" />
                  </div>
                  <div className="flex flex-col items-start min-w-0 w-full" style={{ gap: 4 }}>
                    <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 10, lineHeight: "120%", color: "#6B7280" }}>
                      Deal
                    </span>
                    <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 14, lineHeight: "120%", color: "#0085FF" }} className="truncate block w-full">
                      {linkedDeal?.name || linkedDeal?.title || "—"}
                    </span>
                    <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 8, lineHeight: "120%", color: "#6B7280" }} className="truncate block w-full">
                      —
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ borderTop: "1px solid #D9D9D9" }} />

        {/* Footer */}
        <div
          className="flex flex-row justify-between items-center flex-shrink-0"
          style={{ padding: "23px 24px", gap: 10 }}
        >
          <button
            onClick={handleMarkComplete}
            disabled={isCompleted}
            className="flex items-center justify-center gap-2 disabled:opacity-50"
            style={{
              padding: "12px 14px",
              border: "1px solid rgba(39, 112, 121, 0.3)",
              borderRadius: 80,
              fontFamily: "Inter",
              fontWeight: 500,
              fontSize: 16,
              lineHeight: "20px",
              color: "#1F2937",
            }}
          >
            <CircleCheckIcon className="w-5 h-5" style={{ color: "#34C759" }} />
            {isCompleted ? "Completed" : "Mark As Complete"}
          </button>
          {!isCompleted && (
            <button
              onClick={() => onEdit?.(taskData)}
              className="flex items-center justify-center"
              style={{
                padding: "12px 14px",
                backgroundColor: "#0085FF",
                borderRadius: 88,
                fontFamily: "Inter",
                fontWeight: 500,
                fontSize: 16,
                lineHeight: "20px",
                color: "#FFFFFF",
              }}
            >
              Save Changes
            </button>
          )}
        </div>
      </div>
    </>
  );
};

export default TaskDetailsModal;
