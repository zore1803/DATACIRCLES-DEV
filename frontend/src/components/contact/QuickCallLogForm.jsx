import React, { useEffect, useState } from "react";
import API from "../../services/api";
import SearchableDropdown from "./SearchableDropdown";
import { X } from "lucide-react";
import IncomingCallIcon from "../common/IncomingCallIcon";
import OutgoingCallIcon from "../common/OutgoingCallIcon";
import toast from "react-hot-toast";
import ReactQuill from "react-quill-new";
import '../../QuickCallLogForm.css';
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

const callTypeOptions = [
  { value: "Outbound", label: "Outbound", icon: OutgoingCallIcon },
  { value: "Inbound", label: "Inbound", icon: IncomingCallIcon },
];

const statusOptions = [
  {
    value: "Connected",
    label: "Connected",
    color: "text-green-600 bg-green-50",
    allowDuration: true,
  },
  {
    value: "Missed",
    label: "Missed",
    color: "text-red-600 bg-red-50",
    allowDuration: false,
  },
  {
    value: "Voicemail",
    label: "Voicemail",
    color: "text-blue-600 bg-blue-50",
    allowDuration: true,
  },
  {
    value: "No Answer",
    label: "No Answer",
    color: "text-orange-600 bg-orange-50",
    allowDuration: false,
  },
];

const QuickCallLogForm = ({ contacts, onCallLogCreated, onRequestClose }) => {
  console.log(contacts);
  const [form, setForm] = useState({
    callType: "Outbound",
    status: "Connected",
    duration: "",
    notes: "",
    contact: "",
  });
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [shouldRender, setShouldRender] = useState(true);
  const [isFormDirty, setIsFormDirty] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Add validation errors state
  const [validationErrors, setValidationErrors] = useState({});

  useBodyScrollLock(isOpen);

  const currentStatusConfig = statusOptions.find(
    (s) => s.value === form.status
  );
  const allowDuration = currentStatusConfig?.allowDuration || false;

  useEffect(() => {
    setShouldRender(true);
    setTimeout(() => setIsOpen(true), 10);
    return () => {
      setIsOpen(false);
    };
  }, []);

  const handleClose = () => {
    if (isFormDirty) {
      setShowConfirmDialog(true);
    } else {
      closeForm();
    }
  };

  const closeForm = () => {
    setIsOpen(false);
    setTimeout(() => {
      onRequestClose();
    }, 300);
  };

  const handleConfirmExit = () => {
    setShowConfirmDialog(false);
    closeForm();
  };

  const handleSaveAndExit = async () => {
    setShowConfirmDialog(false);
    await handleSubmit({ preventDefault: () => {} }, true);
  };

  const handleFormChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setIsFormDirty(true);

    // Clear validation error for this field
    if (validationErrors[key]) {
      setValidationErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[key];
        return newErrors;
      });
    }
  };

  const handleStatusChange = (newStatus) => {
    const statusConfig = statusOptions.find((s) => s.value === newStatus);
    setForm((prev) => ({
      ...prev,
      status: newStatus,
      duration: statusConfig?.allowDuration ? prev.duration : "",
    }));
    setIsFormDirty(true);

    // Clear validation errors when status changes
    if (validationErrors.status || validationErrors.duration) {
      setValidationErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors.status;
        delete newErrors.duration;
        return newErrors;
      });
    }
  };

  // Validation function
  const validateForm = () => {
    const errors = {};

    // Validate contact selection
    if (!form.contact) {
      errors.contact = "Please select a contact";
    }

    // Validate duration requirements
    if (
      allowDuration &&
      form.status === "Connected" &&
      (!form.duration || form.duration <= 0)
    ) {
      errors.duration =
        "Duration is required for connected calls and must be greater than 0";
    }

    // Validate duration not set for statuses that don't allow it
    if (!allowDuration && form.duration) {
      errors.duration = `Duration cannot be set for "${form.status}" calls`;
    }

    return errors;
  };

  const handleSubmit = async (e, isSaveAndExit = false) => {
    e.preventDefault();

    // Validate form
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      toast.error("Please fix the validation errors");
      return;
    }

    try {
      setLoading(true);
      const submitData = {
        ...form,
        duration: allowDuration ? form.duration : null,
      };
      const res = await API.post("/call-logs", submitData);
      toast.success("Call log added successfully!");
      if (onCallLogCreated && res.data) {
        onCallLogCreated(res.data);
      }
      setIsFormDirty(false);
      setValidationErrors({});
      closeForm();
    } catch (err) {
      let errorMessage = "Failed to add call log. Please try again.";
      if (err.response?.status === 402) {
        errorMessage = err.response?.data?.message || "An active subscription is required to make changes.";
      } else if (err.response?.status === 403) {
        errorMessage = err.response.data.error || "Access denied";
        const match = errorMessage.match(/\((\d+)\/(\d+)\s*records/);
        if (match) {
          const used = match[1];
          const limit = match[2];
          errorMessage = `Record limit reached (${used}/${limit}). Please upgrade your plan to add more records.`;
        } else if (errorMessage.includes("Subscription expired")) {
          errorMessage = "Subscription expired. Please renew to add call logs.";
        } else if (
          errorMessage.includes("Write access to call logs not allowed")
        ) {
          errorMessage =
            "Your plan does not allow adding call logs. Please upgrade your plan.";
        }
      }
      toast.error(errorMessage);
      if (!isSaveAndExit) closeForm();
    } finally {
      setLoading(false);
    }
  };

  if (!shouldRender) return null;

  return (
    <>
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black/50 z-[10004] flex items-center justify-center">
          <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-sm sm:max-w-lg mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Unsaved Changes
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              You have unsaved changes. Are you sure you want to exit without
              saving?
            </p>
            <div className="flex justify-between gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmDialog(false)}
                className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors cursor-pointer hidden sm:block"
              >
                Cancel
              </button>
              <div className="flex space-x-1">
                <button
                  type="button"
                  onClick={handleConfirmExit}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors cursor-pointer"
                >
                  Exit Without Saving
                </button>
                <button
                  type="button"
                  onClick={handleSaveAndExit}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors cursor-pointer"
                >
                  Save and Exit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[10000] transition-opacity duration-300 ease-in-out"
        style={{ opacity: isOpen ? 1 : 0 }}
        onClick={handleClose}
      />
      <div
 className={`fixed dc-panel-card dc-panel-w z-[10002] bg-white shadow-2xl flex flex-col overflow-hidden transform transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"
        }`}
      >
        <form onSubmit={handleSubmit} className="flex flex-col h-full min-h-0">
          <div className="flex justify-between items-center p-4 border-b border-gray-100 flex-shrink-0">
            <h3 className="text-base font-semibold text-gray-700">
              Add New Call Log
            </h3>
            <button
              type="button"
              onClick={handleClose}
              className="p-1 px-2 hover:bg-gray-100 rounded-lg transition-colors border border-gray-100 cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
            {/* Contact - Now with validation */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contact *
              </label>
              <SearchableDropdown
                options={contacts}
                value={form.contact}
                onChange={(value) => {
                  handleFormChange("contact", value);
                  // Clear validation error when contact is selected
                  if (validationErrors.contact) {
                    setValidationErrors((prev) => {
                      const newErrors = { ...prev };
                      delete newErrors.contact;
                      return newErrors;
                    });
                  }
                }}
                placeholder="Select Contact"
                displayKey="name"
                valueKey="_id"
                required={true}
                error={validationErrors.contact}
              />
              {validationErrors.contact && (
                <p className="text-red-500 text-xs mt-1">
                  {validationErrors.contact}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Call Type
              </label>
              <select
                value={form.callType}
                onChange={(e) => handleFormChange("callType", e.target.value)}
                className="w-full border border-gray-300 rounded-[25px] px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm cursor-pointer"
                required
              >
                {callTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Call Status
              </label>
              <select
                value={form.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="w-full border border-gray-300 rounded-[25px] px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm cursor-pointer"
                required
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Duration - Now with validation */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Duration (seconds)
                {form.status === "Connected" && (
                  <span className="text-red-500"> *</span>
                )}
              </label>
              <input
                type="number"
                value={form.duration}
                onChange={(e) => handleFormChange("duration", e.target.value)}
                className={`w-full border rounded-[25px] px-3 py-2 text-sm ${
                  validationErrors.duration
                    ? "border-red-500 focus:ring-red-500 outline-none focus:ring-2"
                    : allowDuration
                    ? "border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    : "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed"
                }`}
                placeholder={
                  allowDuration ? "Enter duration" : "Not applicable"
                }
                min="0"
                disabled={!allowDuration}
                required={form.status === "Connected"}
              />
              {validationErrors.duration && (
                <p className="text-red-500 text-xs mt-1">
                  {validationErrors.duration}
                </p>
              )}
              {!allowDuration && !validationErrors.duration && (
                <p className="mt-1 text-xs text-gray-500">
                  Duration not applicable for "{form.status}" calls
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <ReactQuill
                value={form.notes || ""}
                onChange={(value) => handleFormChange("notes", value)}
                theme="snow"
                className="bg-white border border-gray-300 rounded-lg shadow-sm"
                modules={{
                  toolbar: [
                    [{ header: [1, 2, false] }],
                    ["bold", "italic", "underline", "strike", "blockquote"],
                    [
                      { list: "ordered" },
                      { list: "bullet" },
                      { indent: "-1" },
                      { indent: "+1" },
                    ],
                    ["link"],
                    ["clean"],
                  ],
                }}
                formats={[
                  "header",
                  "bold",
                  "italic",
                  "underline",
                  "strike",
                  "blockquote",
                  "list",
                  "indent", // Remove 'bullet' - it's not a format, it's a list value
                  "link",
                ]}
                placeholder="Add notes..."
              />
            </div>
          </div>
          <div className="p-4 border-t border-gray-100 flex items-center justify-end gap-3 flex-shrink-0 bg-white">
            <button
              type="button"
              onClick={handleClose}
              className="px-6 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              className="px-6 py-2.5 bg-[#0C4FCD] text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
              type="submit"
              disabled={loading}
            >
              {loading ? "Saving..." : "Add Call Log"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
};

export default QuickCallLogForm;
