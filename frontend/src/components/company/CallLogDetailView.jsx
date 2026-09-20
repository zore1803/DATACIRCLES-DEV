import CalendarIcon from "../common/CalendarIcon";
import DeleteIcon from "../common/DeleteIcon";
import React, { useEffect, useState } from "react";
import { X, Clock, User } from "lucide-react";
import IncomingCallIcon from "../common/IncomingCallIcon";
import OutgoingCallIcon from "../common/OutgoingCallIcon";
import EditIcon from "../common/EditIcon";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

// Matches the "View Task" quick-drawer style (TaskDetailsModal): a
// right-anchored slide-in panel with a compact ID-style header, info card,
// and Edit/Delete actions — instead of the old centered modal.
const CallLogDetailView = ({ open, log, onClose, onEdit, onDelete }) => {
  const [isSliding, setIsSliding] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  useBodyScrollLock(open);

  useEffect(() => {
    if (open) {
      setShouldRender(true);
      setTimeout(() => setIsSliding(true), 10);
    } else {
      setIsSliding(false);
      setTimeout(() => setShouldRender(false), 300);
    }
  }, [open]);

  if (!shouldRender || !log) return null;

  const callId = `CALL-${(log._id || "").slice(-5).toUpperCase()}`;
  const loggedBy = typeof log.user === "object" ? log.user : null;
  const CallTypeIcon = log.callType === "Inbound" ? IncomingCallIcon : OutgoingCallIcon;

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

  const statusColor =
    log.status === "Connected" ? "#00C950" : log.status === "Missed" ? "#FB3748" : "#6B7280";

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[10000] transition-opacity duration-300"
        style={{ opacity: isSliding ? 1 : 0 }}
        onClick={onClose}
      />
      <div
        className={`fixed dc-panel-card dc-panel-w z-[10001] bg-white shadow-2xl flex flex-col overflow-hidden transform transition-transform duration-300 font-inter ${
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
            {callId}
          </span>
          <div className="flex flex-row items-center justify-end" style={{ gap: 4 }}>
            {onEdit && (
              <button
                onClick={() => onEdit(log)}
                className="p-1 rounded-lg hover:bg-blue-50 transition-colors"
                title="Edit"
              >
                <EditIcon className="w-5 h-5" style={{ color: "#0085FF" }} />
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(log)}
                className="p-1 rounded-lg hover:bg-red-50 transition-colors"
                title="Delete"
              >
                <DeleteIcon className="w-4 h-4" style={{ color: "#F60000" }} />
              </button>
            )}
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
                {log.purpose || "Phone Call"}
              </h1>
              <span
                style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 12, lineHeight: "120%", color: "#525866" }}
                className="truncate w-full"
              >
                Logged by {loggedBy?.name || "Unknown"} on {formatFullDateTime(log.createdAt)}
              </span>
            </div>
          </div>

          {/* Call Information */}
          <div className="flex flex-col items-start w-full" style={{ padding: "12px 24px", gap: 14 }}>
            <p style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 14, lineHeight: "120%", color: "#1F2937" }}>
              Call Information
            </p>
            <div
              className="flex flex-col items-start w-full"
              style={{ padding: 14, gap: 16, backgroundColor: "#F8FAFC", borderRadius: 14 }}
            >
              {/* Logged By + Status pill */}
              <div className="flex flex-row items-center justify-between w-full" style={{ gap: 16 }}>
                <div className="flex flex-row items-center min-w-0" style={{ gap: 12 }}>
                  <div
                    className="rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-700 flex-shrink-0"
                    style={{ width: 32, height: 32 }}
                  >
                    {(loggedBy?.name || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex flex-col items-start min-w-0 w-full" style={{ gap: 4 }}>
                    <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 10, lineHeight: "120%", color: "#6B7280" }}>
                      Logged By
                    </span>
                    <span
                      style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 14, lineHeight: "120%", color: "#1F2937" }}
                      className="truncate block w-full"
                    >
                      {loggedBy?.name || "Unknown"}
                    </span>
                  </div>
                </div>
                <span
                  className="inline-flex items-center justify-center flex-shrink-0"
                  style={{
                    padding: "4px 10px",
                    borderRadius: 35,
                    backgroundColor: statusColor,
                    fontFamily: "Inter",
                    fontWeight: 500,
                    fontSize: 12,
                    lineHeight: "120%",
                    color: "#FFFFFF",
                    whiteSpace: "nowrap",
                  }}
                >
                  {log.status || "Connected"}
                </span>
              </div>

              {/* Type / Duration / Date */}
              <div className="flex flex-row items-start w-full" style={{ gap: 16 }}>
                <div className="flex flex-col items-start flex-1" style={{ gap: 6 }}>
                  <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "120%", color: "#6B7280" }}>
                    Type
                  </span>
                  <span
                    className="flex items-center gap-1.5"
                    style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 14, lineHeight: "120%", color: "#1F2937" }}
                  >
                    <CallTypeIcon className="w-3.5 h-3.5 text-gray-400" />
                    {log.callType || "Outbound"}
                  </span>
                </div>
                <div className="flex flex-col items-start flex-1" style={{ gap: 6 }}>
                  <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "120%", color: "#6B7280" }}>
                    Duration
                  </span>
                  <span
                    className="flex items-center gap-1.5"
                    style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 14, lineHeight: "120%", color: "#1F2937" }}
                  >
                    <Clock className="w-3.5 h-3.5 text-gray-400" />
                    {log.duration ? `${Math.floor(log.duration / 60)}m ${log.duration % 60}s` : "—"}
                  </span>
                </div>
                <div className="flex flex-col items-start flex-1" style={{ gap: 6 }}>
                  <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "120%", color: "#6B7280" }}>
                    Date
                  </span>
                  <span
                    className="flex items-center gap-1.5"
                    style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 14, lineHeight: "120%", color: "#1F2937" }}
                  >
                    <CalendarIcon className="w-3.5 h-3.5 text-gray-400" />
                    {log.createdAt ? new Date(log.createdAt).toLocaleDateString() : "—"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes header */}
          <div
            className="flex flex-row justify-between items-center w-full"
            style={{ padding: "12px 24px", gap: 14, height: 44 }}
          >
            <p style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 14, lineHeight: "120%", color: "#1F2937" }}>
              Notes
            </p>
            {onEdit && (
              <button
                onClick={() => onEdit(log)}
                className="flex items-center justify-center hover:bg-blue-50 rounded-md transition-all flex-shrink-0"
                style={{ width: 20, height: 20 }}
                title="Edit notes"
              >
                <EditIcon className="w-4 h-4" style={{ color: "#0085FF" }} />
              </button>
            )}
          </div>

          {/* Notes content */}
          <div
            className="box-border flex flex-col items-start w-full"
            style={{ padding: "12px 24px", gap: 14, borderBottom: "1px solid #D9D9D9" }}
          >
            <p
              className="w-full whitespace-pre-wrap"
              style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 14, lineHeight: "150%", color: "rgba(31, 41, 55, 0.8)" }}
            >
              {log.notes || "No notes provided."}
            </p>
          </div>
        </div>

        <div style={{ borderTop: "1px solid #D9D9D9" }} />

        {/* Footer */}
        <div className="flex-shrink-0 py-2.5 px-4 bg-white flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 border border-gray-200 text-gray-700 rounded-[25px] text-sm font-bold hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(log)}
              className="px-6 py-2 bg-[#158FFF] text-white rounded-[25px] text-sm font-bold hover:opacity-90 transition-colors"
            >
              Edit Call Log
            </button>
          )}
        </div>
      </div>
    </>
  );
};

export default CallLogDetailView;
