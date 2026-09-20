import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import IncomingCallIcon from "../common/IncomingCallIcon";
import OutgoingCallIcon from "../common/OutgoingCallIcon";
import API from "../../services/api";
import SearchableDropdown from "./SearchableDropdown";
import toast from 'react-hot-toast';
import ReactQuill from 'react-quill-new';
import AppToaster from "../AppToaster";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

const initialFormState = {
  callType: "Outbound",
  status: "Connected",
  duration: "",
  notes: "",
  contact: "",
};

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

// ✅ Fixed Quill configuration
const quillModules = {
  toolbar: [
    [{ 'header': [1, 2, false] }],
    ['bold', 'italic', 'underline', 'strike', 'blockquote'],
    [{ 'list': 'ordered' }, { 'list': 'bullet' }, { 'indent': '-1' }, { 'indent': '+1' }],
    ['link'],
    ['clean']
  ],
};

const quillFormats = [
  'header',
  'bold', 'italic', 'underline', 'strike', 'blockquote',
  'list', 'indent',
  'link'
];

const CallLogForm = ({
  contactId,
  // Optional. Set when opened from a Company Profile page instead of a
  // Contact page — narrows the contact picker to that company's contacts
  // and gets sent along so the saved call log is queryable by company too.
  companyId,
  editLog,
  isOpen,
  onClose,
  fetchLogs,
  // Alternate completion callback some callers use instead of fetchLogs —
  // both are invoked (whichever is actually passed) so this form doesn't
  // care which one a given caller wired up.
  onSuccess,
  userId,
}) => {
  const [form, setForm] = useState(initialFormState);
  const [submitting, setSubmitting] = useState(false);
  const [isSliding, setIsSliding] = useState(false);
  const [shouldRender, setShouldRender] = useState(true);
  const [contacts, setContacts] = useState([]);

  useBodyScrollLock(isOpen);

  // Add validation errors state
  const [validationErrors, setValidationErrors] = useState({});

  // Check if current status allows duration
  const currentStatusConfig = statusOptions.find(
    (s) => s.value === form.status
  );
  const allowDuration = currentStatusConfig?.allowDuration || false;

  // Fetch contacts if no contactId is provided
  useEffect(() => {
    const fetchContacts = async () => {
      try {
        const res = await API.get("/contacts");
        // /contacts has no server-side company filter, so narrow it here —
        // opened from a Company Profile page, picking a contact from a
        // different company would silently mislink the call log.
        const list = companyId
          ? res.data.filter((c) => (c.company?._id || c.company) === companyId)
          : res.data;
        setContacts(list);
      } catch (err) {
        toast.error(err.response?.data?.error || 'Failed to fetch contacts.');
      }
    };

    if (!contactId && !editLog) {
      fetchContacts();
    }
  }, [contactId, editLog, companyId]);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setTimeout(() => setIsSliding(true), 10);
      if (editLog) {
        setForm({
          callType: editLog.callType || "Outbound",
          status: editLog.status || "Connected",
          duration: editLog.duration || "",
          notes: editLog.notes || "",
          contact: editLog.contact?._id || "",
        });
      } else {
        setForm({
          ...initialFormState,
          contact: contactId || "",
        });
      }
      // Clear validation errors when opening
      setValidationErrors({});
    } else {
      setIsSliding(false);
      setTimeout(() => setShouldRender(false), 300);
    }
  }, [isOpen, editLog, contactId]);

  // Dims the sidebar/navbar/page-footer chrome while this panel is open --
  // see useSearchOverlayOpen.js. Tied to isSliding (the actual visible
  const handleFormChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));

    // Clear validation error for this field
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
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

    // Clear validation errors when status changes
    if (validationErrors.status || validationErrors.duration) {
      setValidationErrors(prev => {
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

    // Validate contact selection (only if no contactId provided)
    if (!contactId && !editLog && !form.contact) {
      errors.contact = "Please select a contact";
    }

    // Validate duration requirements
    if (allowDuration && form.status === "Connected" && (!form.duration || form.duration <= 0)) {
      errors.duration = "Duration is required for connected calls and must be greater than 0";
    }

    // Validate duration not set for statuses that don't allow it
    if (!allowDuration && form.duration) {
      errors.duration = `Duration cannot be set for "${form.status}" calls`;
    }

    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate form
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      toast.error("Please fix the validation errors");
      return;
    }

    setSubmitting(true);

    try {
      const submitData = {
        ...form,
        duration: allowDuration ? form.duration : null,
      };
      let savedLog = null;
      if (editLog) {
        const res = await API.put(`/call-logs/${editLog._id}`, submitData);
        savedLog = res.data;
        toast.success('Call log updated successfully');
      } else {
        const res = await API.post("/call-logs", {
          ...submitData,
          contact: contactId || form.contact,
          company: companyId,
          user: userId,
        });
        savedLog = res.data;
        toast.success('Call log added successfully');
      }
      setForm(initialFormState);
      setValidationErrors({});
      // Callers wire up whichever of these fits their refresh strategy —
      // call both, since only one will actually be a function.
      fetchLogs?.();
      onSuccess?.(savedLog);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save call log.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!shouldRender) return null;

  return (
    <>
      <AppToaster />
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[10000] transition-opacity duration-300 ease-in-out"
        style={{ opacity: isSliding ? 1 : 0 }}
        onClick={onClose}
      />
      <div
        className={`fixed dc-panel-card dc-panel-w z-[10001] bg-white shadow-2xl overflow-y-auto transform transition-transform duration-300 ease-in-out ${isSliding ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"
          }`}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">
              {editLog ? "Edit Call Log" : "Add New Call Log"}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 gap-6">
              {/* Contact Selection - Now with validation */}
              {!contactId && !editLog && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Contact <span className="text-red-500">*</span>
                  </label>
                  <SearchableDropdown
                    options={contacts}
                    value={form.contact}
                    onChange={(value) => {
                      handleFormChange("contact", value);
                      // Clear validation error when contact is selected
                      if (validationErrors.contact) {
                        setValidationErrors(prev => {
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
                    <p className="text-red-500 text-xs mt-1">{validationErrors.contact}</p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Call Type
                </label>
                <select
                  value={form.callType}
                  onChange={(e) => handleFormChange("callType", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm cursor-pointer"
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
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Call Status
                </label>
                <select
                  value={form.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm cursor-pointer"
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
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Duration (seconds)
                  {form.status === "Connected" && (
                    <span className="text-red-500"> *</span>
                  )}
                </label>
                <input
                  type="number"
                  value={form.duration}
                  onChange={(e) => handleFormChange("duration", e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg text-sm ${validationErrors.duration
                    ? 'border-red-500 focus:ring-red-500'
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
                  <p className="text-red-500 text-xs mt-1">{validationErrors.duration}</p>
                )}
                {!allowDuration && !validationErrors.duration && (
                  <p className="mt-1 text-xs text-gray-500">
                    Duration not applicable for "{form.status}" calls
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes
                </label>
                <div className="border border-gray-300 rounded-lg overflow-hidden">
                  <ReactQuill
                    value={form.notes || ''}
                    onChange={(value) => handleFormChange("notes", value)}
                    theme="snow"
                    modules={quillModules}
                    formats={quillFormats}
                    placeholder="Add notes..."
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                {submitting
                  ? "Saving..."
                  : editLog
                    ? "Update Call Log"
                    : "Add Call Log"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <style jsx global>{`
        /* Quill Editor Styles */
        .ql-editor ol,
        .ql-editor[contenteditable="false"] ol {
          list-style-type: decimal;
          padding-left: 1.5em;
          margin: 0.5em 0;
        }
        
        .ql-editor ul,
        .ql-editor[contenteditable="false"] ul {
          list-style-type: disc;
          padding-left: 1.5em;
          margin: 0.5em 0;
        }
        
        .ql-editor li {
          padding-left: 0.3em;
          margin-bottom: 0.25em;
        }

        .ql-editor ol ol,
        .ql-editor ul ul {
          margin-top: 0.25em;
          margin-bottom: 0.25em;
        }
        
        .ql-toolbar {
          border: none;
          border-bottom: 1px solid #e5e7eb;
          padding: 8px 12px;
          background: #f9fafb;
        }
        
        .ql-container {
          border: none;
          font-family: inherit;
        }
        
        .ql-editor {
          padding: 12px;
          min-height: 120px;
          font-size: 14px;
          line-height: 1.6;
        }

        .ql-editor[contenteditable="false"] {
          padding: 0;
          min-height: auto;
        }
      `}</style>
    </>
  );
};

export default CallLogForm;
