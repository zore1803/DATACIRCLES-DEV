import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import API from "../../services/api";
import toast from "react-hot-toast";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

// Matches the quick-drawer style shared by CompanyTaskForm / CompanyForm:
// a right-anchored slide-in panel (dc-panel-card + dc-panel-w) with a
// compact pill-shaped header/footer/inputs, instead of a centered modal.
const CallLogForm = ({ companyId, contactId, editLog, isOpen, onClose, onSuccess, userId }) => {
  const [formData, setFormData] = useState({
    purpose: "",
    callType: "Outbound",
    status: "Connected",
    duration: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [isSliding, setIsSliding] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setTimeout(() => setIsSliding(true), 10);
    } else {
      setIsSliding(false);
      setTimeout(() => setShouldRender(false), 300);
    }
  }, [isOpen]);

  useEffect(() => {
    if (editLog) {
      setFormData({
        purpose: editLog.purpose || "",
        callType: editLog.callType || "Outbound",
        status: editLog.status || "Connected",
        // Stored in seconds; the field below collects minutes.
        duration: editLog.duration ? Math.round(editLog.duration / 60) : "",
        notes: editLog.notes || "",
      });
    } else {
      setFormData({
        purpose: "",
        callType: "Outbound",
        status: "Connected",
        duration: "",
        notes: "",
      });
    }
  }, [editLog, isOpen]);

  if (!shouldRender) return null;

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleClose = () => {
    setIsSliding(false);
    setTimeout(() => onClose(), 300);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...formData,
        duration: formData.duration ? Math.round(Number(formData.duration) * 60) : undefined,
        // Contact page: send the contact and let the backend fill in the
        // company from it (createCallLog does this), so a log made there is
        // still queryable from the company's own tab.
        ...(contactId ? { contact: contactId } : { company: companyId }),
        user: userId,
      };
      if (editLog) {
        const res = await API.put(`/call-logs/${editLog._id}`, payload);
        toast.success("Call log updated");
        onSuccess(res.data);
      } else {
        const res = await API.post("/call-logs", payload);
        toast.success("Call logged successfully");
        onSuccess(res.data);
      }
      handleClose();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to save call log");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[10000] transition-all duration-300"
        style={{ opacity: isSliding ? 1 : 0 }}
        onClick={handleClose}
      />
      <div
        className={`fixed dc-panel-card dc-panel-w z-[10001] bg-white shadow-2xl transform transition-transform duration-300 ease-out overflow-hidden ${
          isSliding ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"
        }`}
      >
        <form onSubmit={handleSubmit} className="flex flex-col h-full min-h-0">
          {/* Sticky header — matches the CompanyForm/CompanyTaskForm header spec */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#D9D9D9] flex-shrink-0 bg-white gap-1">
            <h2 className="text-[15px] font-normal leading-6 text-[#78788D] uppercase tracking-wide">
              {editLog ? "Edit Call Log" : "Log a Call"}
            </h2>
            <button
              type="button"
              onClick={handleClose}
              title="Close"
              className="w-5 h-5 flex items-center justify-center text-[#1C1B1F] hover:opacity-70 transition-opacity"
              aria-label="Close"
            >
              <X className="w-[18px] h-[18px]" strokeWidth={2} />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 min-h-0 overflow-y-auto px-8 pt-6 pb-6 space-y-6">
            <div>
              <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Purpose / Title <span className="text-[#FF4935]">*</span>
              </label>
              <input
                type="text"
                name="purpose"
                value={formData.purpose}
                onChange={handleChange}
                required
                className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50"
                placeholder="E.g., Discovery Call, Follow up"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                  Type
                </label>
                <select
                  name="callType"
                  value={formData.callType}
                  onChange={handleChange}
                  className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                >
                  <option value="Outbound">Outbound</option>
                  <option value="Inbound">Inbound</option>
                </select>
              </div>
              <div>
                <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                  Status
                </label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                >
                  <option value="Connected">Connected</option>
                  <option value="Missed">Missed</option>
                  <option value="Voicemail">Voicemail</option>
                  <option value="No Answer">No Answer</option>
                </select>
              </div>
            </div>

            {(formData.status === "Connected" || formData.status === "Voicemail") && (
              <div>
                <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                  Duration (minutes)
                </label>
                <input
                  type="number"
                  name="duration"
                  value={formData.duration}
                  onChange={handleChange}
                  min="0"
                  className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50"
                  placeholder="e.g., 15"
                />
              </div>
            )}

            <div>
              <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Notes
              </label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                rows="4"
                className="w-full border border-[#1F2937]/10 rounded-2xl px-3 py-2 text-[12px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all font-inter resize-vertical placeholder:text-[#1F2937] placeholder:opacity-50"
                placeholder="What was discussed?"
              ></textarea>
            </div>
          </div>

          {/* Sticky footer — matches the CompanyTaskForm footer spec */}
          <div className="flex-shrink-0 py-2.5 px-4 border-t border-gray-100 bg-white flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="px-6 py-2 border border-gray-200 text-gray-700 rounded-[25px] text-sm font-bold hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-[#158FFF] text-white rounded-[25px] text-sm font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Saving..." : "Save Call Log"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
};

export default CallLogForm;
