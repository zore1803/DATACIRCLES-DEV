import CalendarIcon from "../common/CalendarIcon";
import DeleteIcon from "../common/DeleteIcon";
import PdfIcon from "../common/PdfIcon";
import VideoIcon from "../common/VideoIcon";
import CellphoneIcon from "../common/CellphoneIcon";
// components/vendor/VendorMeetingForm.jsx
import React, { useState, useEffect, useCallback } from "react";
import API from "../../services/api";
import toast from "react-hot-toast";
import {
  X, Clock, Users, MapPin,
  AlertTriangle, CheckCircle2, Building, Lightbulb,
  Flag, Truck
} from "lucide-react";
import EditIcon from "../common/EditIcon";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

const initialState = {
  title: "",
  date: "",
  time: "09:00",
  duration: 60,
  priority: "medium",
  meetingType: "in-person",
  location: "",
  description: "",
};

const PriorityChip = ({ priority }) => {
  const colors = {
    low: { bg: "bg-[#E6F7EF]", text: "text-[#1FA971]", border: "border-[#B9E7D3]" },
    medium: { bg: "bg-[#FDF3E6]", text: "text-[#EA9927]", border: "border-[#F7DDB8]" },
    high: { bg: "bg-[#FCEAEA]", text: "text-[#EA4B4B]", border: "border-[#F5C7C7]" },
  };
  const color = colors[priority] || colors.medium;
  
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 ${color.bg} ${color.text} rounded-lg text-sm font-medium ${color.border}`}>
      <Flag className="w-3 h-3" />
      <span className="capitalize">{priority}</span>
    </div>
  );
};

const FormField = ({ label, required, children, error, description }) => (
  <div>
    <label className="flex items-center gap-1.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
      {label}
      {required && <span className="text-[#FF4935]">*</span>}
    </label>
    {children}
    {description && <p className="text-[13px] font-inter text-[#A0A0A0] mt-1.5">{description}</p>}
    {error && (
      <div className="flex items-center gap-2 p-2 mt-1 bg-red-50 border border-red-200 rounded-lg">
        <AlertTriangle className="w-4 h-4 text-red-500" />
        <p className="text-xs text-red-600">{error}</p>
      </div>
    )}
  </div>
);

const TimeConflictAlert = ({ conflict, suggestedTimes, onTimeSelect }) => (
  <div className="space-y-3">
    <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="w-4 h-4 text-red-500" />
        <p className="text-sm font-semibold text-red-700">Time Conflict Detected</p>
      </div>
      <p className="text-sm text-red-600">{conflict.message}</p>
    </div>
    {suggestedTimes.length > 0 && (
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <div className="flex items-center gap-2 mb-2">
          <Lightbulb className="w-4 h-4 text-blue-500" />
          <p className="text-sm font-semibold text-blue-700">Suggested Available Times</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {suggestedTimes.map((time) => (
            <button
              key={time}
              type="button"
              onClick={() => onTimeSelect(time)}
              className="px-3 py-1.5 text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors font-medium"
            >
              {new Date(`2024-01-01T${time}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
            </button>
          ))}
        </div>
      </div>
    )}
  </div>
);

const MeetingTypeIcon = ({ type }) => {
  const icons = {
    "in-person": <Building className="w-4 h-4" />,
    "video-call": <VideoIcon className="w-4 h-4" />,
    "phone-call": <CellphoneIcon className="w-4 h-4" />,
  };
  return icons[type] || icons["in-person"];
};

const VendorMeetingForm = ({
  open,
  mode,
  meetingData,
  calendarDate,
  vendorId,
  onSave,
  onDelete,
  onClose,
  // Set true when the caller already showed the read-only meeting and the
  // user explicitly clicked Edit there (e.g. MeetingDetailsModal's Edit
  // button) — skips straight to the editable form instead of re-showing a
  // second read-only "Meeting Details" screen requiring another Edit click.
  startInEditMode = false,
}) => {
  const [form, setForm] = useState(initialState);
  const [loading, setLoading] = useState(false);
  const [isSliding, setIsSliding] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  useBodyScrollLock(open);
  const [existingMeetings, setExistingMeetings] = useState([]);
  const [timeConflict, setTimeConflict] = useState(null);
  const [errors, setErrors] = useState({});
  const [isEditMode, setIsEditMode] = useState(false);

  const fetchMeetingsForDate = useCallback(async (date) => {
    try {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      
      const res = await API.get("/meetings", {
        params: {
          vendorId,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      });
      setExistingMeetings(res.data.meetings);
    } catch (error) {
      console.error("Error fetching meetings:", error);
      setExistingMeetings([]);
    }
  }, [vendorId]);

  const checkTimeConflict = useCallback((selectedDate, selectedTime, duration) => {
    if (!selectedDate || !selectedTime) return null;

    const selectedDateTime = new Date(selectedDate);
    const [hours, minutes] = selectedTime.split(":");
    selectedDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    
    const selectedStartTime = selectedDateTime.getTime();
    const selectedEndTime = selectedStartTime + duration * 60 * 1000;

    for (const meeting of existingMeetings) {
      if (isEditMode && meeting._id === meetingData?._id) continue;

      const meetingStart = new Date(meeting.scheduledAt).getTime();
      const meetingEnd = meetingStart + meeting.duration * 60 * 1000;

      if (
        (selectedStartTime >= meetingStart && selectedStartTime < meetingEnd) ||
        (selectedEndTime > meetingStart && selectedEndTime <= meetingEnd) ||
        (selectedStartTime <= meetingStart && selectedEndTime >= meetingEnd)
      ) {
        return {
          conflictWith: meeting,
          message: `Conflicts with "${meeting.title}" (${new Date(meeting.scheduledAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })} - ${new Date(meetingEnd).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })})`,
        };
      }
    }
    return null;
  }, [existingMeetings, isEditMode, meetingData]);

  useEffect(() => {
    if (open) {
      setShouldRender(true);
      setTimeout(() => setIsSliding(true), 10);

      if (meetingData && mode === "view") {
        const initialFormData = {
          ...meetingData,
          date: meetingData?.scheduledAt ? new Date(meetingData?.scheduledAt).toISOString().slice(0, 10) : "",
          time: meetingData?.scheduledAt ? new Date(meetingData?.scheduledAt).toISOString().slice(11, 16) : "09:00",
        };
        setForm(initialFormData);
        setIsEditMode(startInEditMode);

        if (initialFormData.date) {
          fetchMeetingsForDate(new Date(initialFormData.date));
        }
      } else {
        const initialFormData = {
          ...initialState,
          date: calendarDate ,
        };
        setForm(initialFormData);
        setIsEditMode(true);
        
        if (calendarDate) {
          fetchMeetingsForDate(calendarDate);
        }
      }

      setErrors({});
    } else {
      setIsSliding(false);
      setTimeout(() => setShouldRender(false), 300);
      setTimeConflict(null);
      setIsEditMode(false);
    }
  }, [open, meetingData, mode, calendarDate, fetchMeetingsForDate, startInEditMode]);

  const handleChange = (key, val) => {
    setForm((f) => ({ ...f, [key]: val }));
    
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: null }));
    }

    if (key === "date" && val) {
      fetchMeetingsForDate(new Date(val));
    }

    if (key === "date" || key === "time" || key === "duration") {
      const newDate = key === "date" ? val : form.date || (calendarDate);
      const newTime = key === "time" ? val : form.time;
      const newDuration = key === "duration" ? val : form.duration;

      if (newDate) {
        setTimeout(() => {
          const conflict = checkTimeConflict(newDate, newTime, newDuration);
          setTimeConflict(conflict);
        }, 100);
      }
    }
  };

  const getSuggestedTimes = () => {
    const selectedDate = form.date || (calendarDate );
    if (!selectedDate) return [];

    const suggestions = [];
    const businessHours = Array.from({ length: 10 }, (_, i) => 9 + i);

    for (const hour of businessHours) {
      const timeSlots = ["00", "30"];
      for (const minutes of timeSlots) {
        const timeString = `${hour.toString().padStart(2, "0")}:${minutes}`;
        const conflict = checkTimeConflict(selectedDate, timeString, form.duration);
        if (!conflict) {
          suggestions.push(timeString);
        }
      }
    }
    return suggestions.slice(0, 4);
  };

  const validateForm = () => {
    const newErrors = {};
    if (!form.title?.trim()) newErrors.title = "Meeting title is required";
    if (!form.date && !calendarDate) newErrors.date = "Date is required";
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const getScheduledAt = () => {
    const date = new Date(form.date || calendarDate);
    const [h, m] = form.time.split(":").map(Number);
    date.setHours(h, m, 0, 0);
    return date.toISOString();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      toast.error("Please fix the errors before submitting");
      return;
    }

    const conflict = checkTimeConflict(form.date || calendarDate, form.time, form.duration);
    if (conflict) {
      toast.error(`Cannot schedule meeting: ${conflict.message}`);
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...form,
        scheduledAt: getScheduledAt(),
        vendorId,
        linkedTo: "vendor",
      };

      if (meetingData && mode === "view") {
        await API.put(`/meetings/${meetingData._id}`, payload);
        toast.success("Meeting updated successfully");
      } else {
        await onSave(payload);
      }
      onClose();
    } catch (err) {
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || (meetingData && mode === "view" ? "Failed to update meeting" : "Failed to schedule meeting"));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm("Are you sure you want to delete this meeting?")) {
      try {
        await onDelete(meetingData._id);
        onClose();
      } catch (err) {
        // Error handled by parent
      }
    }
  };

  const handleEdit = () => {
    setIsEditMode(true);
  };

  const handleCancelEdit = () => {
    if (meetingData) {
      const resetFormData = {
        ...meetingData,
        date: meetingData?.scheduledAt ? new Date(meetingData?.scheduledAt).toISOString().slice(0, 10) : "",
        time: meetingData?.scheduledAt ? new Date(meetingData?.scheduledAt).toISOString().slice(11, 16) : "09:00",
      };
      setForm(resetFormData);
    }
    setIsEditMode(false);
    setErrors({});
    setTimeConflict(null);
  };

  if (!shouldRender) return null;

  const isCreating = mode === "create" || !meetingData;
  const isViewing = mode === "view" && meetingData && !isEditMode;
  const isEditing = isEditMode && meetingData;

  return (
    <div
      className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[10000] transition-all duration-300"
      style={{ opacity: isSliding ? 1 : 0 }}
      onClick={onClose}
    >
      <div
        className={`fixed dc-panel-card dc-panel-w z-[10001] bg-white shadow-2xl overflow-hidden transform transition-transform duration-300 ease-out flex flex-col ${
          isSliding ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#D9D9D9] flex-shrink-0 bg-white gap-1">
            <h2 className="text-[15px] font-normal leading-6 text-[#78788D] uppercase tracking-wide">
              {isCreating ? "Schedule Vendor Meeting" : isViewing ? "Meeting Details" : "Edit Meeting"}
            </h2>
            <button
              onClick={onClose}
              title="Close"
              className="w-5 h-5 flex items-center justify-center text-[#1C1B1F] hover:opacity-70 transition-opacity"
              aria-label="Close"
            >
              <X className="w-[18px] h-[18px]" strokeWidth={2} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {isViewing ? (
              /* VIEW MODE */
              <div className="p-6 space-y-6">
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <h2 className="text-2xl font-bold text-gray-900 leading-tight pr-4">{form.title}</h2>
                    <div className="flex flex-col gap-2">
                      <PriorityChip priority={form.priority} />
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg text-sm font-medium border border-purple-200">
                        <MeetingTypeIcon type={form.meetingType} />
                        <span className="capitalize">{form.meetingType.replace("-", " ")}</span>
                      </div>
                    </div>
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                      <CalendarIcon className="w-4 h-4 text-purple-600" />
                      <span className="text-sm font-semibold text-gray-700">Date & Time</span>
                    </div>
                    <p className="font-bold text-gray-900 text-lg">
                      {new Date(meetingData?.scheduledAt).toLocaleDateString("en-US", { 
                        weekday: "long", 
                        month: "long", 
                        day: "numeric",
                        year: "numeric"
                      })}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <Clock className="w-4 h-4 text-purple-600" />
                      <p className="text-sm text-purple-700 font-semibold">
                        {new Date(meetingData?.scheduledAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                        {" "}• {form.duration} minutes
                      </p>
                    </div>
                  </div>

                  {form.location && (
                    <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl">
                      <div className="flex items-center gap-2 mb-2">
                        <MapPin className="w-4 h-4 text-green-600" />
                        <span className="text-sm font-semibold text-gray-700">Location</span>
                      </div>
                      <p className="text-gray-900 font-medium">{form.location}</p>
                    </div>
                  )}
                </div>

                {/* Action buttons moved to fixed footer */}
              </div>
            ) : (
              /* EDIT/CREATE MODE - Form */
              <form id="vendor-meeting-form" onSubmit={handleSubmit} className="p-6 space-y-6">
                <FormField label="Meeting Title" required error={errors.title}>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => handleChange("title", e.target.value)}
                    className={`w-full h-[38px] px-3 rounded-full border text-[13px] text-[#1F2937] transition-all focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                      errors.title ? "border-red-300 bg-red-50" : "border-[#1F2937]/10 bg-white"
                    }`}
                    placeholder="Enter meeting subject or agenda"
                  />
                </FormField>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {!calendarDate ? (
                    <FormField label="Date" required error={errors.date}>
                      <input
                        type="date"
                        value={form.date}
                        min={new Date().toISOString().split("T")[0]}
                        max="2099-12-31"
                        onChange={(e) => handleChange("date", e.target.value)}
                        className={`w-full h-[38px] px-3 rounded-full border text-[13px] text-[#1F2937] transition-all focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                          errors.date ? "border-red-300 bg-red-50" : "border-[#1F2937]/10 bg-white"
                        }`}
                      />
                    </FormField>
                  ) : (
                    <FormField label="Date" description="Selected from calendar">
                      <div className="flex items-center gap-2 h-[38px] px-3 bg-[#158FFF]/10 text-[#158FFF] rounded-full border border-[#158FFF]/20">
                        <CalendarIcon className="w-4 h-4" />
                        <span className="font-medium text-[13px]">{calendarDate}</span>
                      </div>
                    </FormField>
                  )}

                  <FormField label="Time" required>
                    <input
                      type="time"
                      value={form.time}
                      onChange={(e) => handleChange("time", e.target.value)}
                      className={`w-full h-[38px] px-3 rounded-full border text-[13px] text-[#1F2937] transition-all focus:outline-none focus:ring-1 ${
                        timeConflict
                          ? "border-red-500 bg-red-50 focus:ring-red-500"
                          : "border-[#1F2937]/10 bg-white focus:ring-blue-500"
                      }`}
                    />
                  </FormField>

                  <FormField label="Duration">
                    <select
                      value={form.duration}
                      onChange={(e) => handleChange("duration", parseInt(e.target.value))}
                      className="w-full h-[38px] px-3 rounded-full border border-[#1F2937]/10 bg-white text-[13px] text-[#1F2937] transition-all focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value={15}>15 minutes</option>
                      <option value={30}>30 minutes</option>
                      <option value={60}>1 hour</option>
                      <option value={90}>1.5 hours</option>
                      <option value={120}>2 hours</option>
                    </select>
                  </FormField>
                </div>

                <FormField label="Priority">
                  <select
                    value={form.priority}
                    onChange={(e) => handleChange("priority", e.target.value)}
                    className="w-full h-[38px] px-3 rounded-full border border-[#1F2937]/10 bg-white text-[13px] text-[#1F2937] transition-all focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </FormField>

                {timeConflict && (
                  <TimeConflictAlert
                    conflict={timeConflict}
                    suggestedTimes={getSuggestedTimes()}
                    onTimeSelect={(time) => handleChange("time", time)}
                  />
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField label="Meeting Type">
                    <select
                      value={form.meetingType}
                      onChange={(e) => handleChange("meetingType", e.target.value)}
                      className="w-full h-[38px] px-3 rounded-full border border-[#1F2937]/10 bg-white text-[13px] text-[#1F2937] transition-all focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="in-person">In-person</option>
                      <option value="video-call">Video call</option>
                      <option value="phone-call">Phone call</option>
                    </select>
                  </FormField>

                  <FormField
                    label="Location"
                    description="Meeting room, address, or link"
                  >
                    <input
                      type="text"
                      value={form.location}
                      onChange={(e) => handleChange("location", e.target.value)}
                      className="w-full h-[38px] px-3 rounded-full border border-[#1F2937]/10 bg-white text-[13px] text-[#1F2937] transition-all focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder={
                        form.meetingType === "video-call"
                          ? "Meeting link or platform"
                          : form.meetingType === "phone-call"
                          ? "Phone number or dial-in details"
                          : "Vendor office or address"
                      }
                    />
                  </FormField>
                </div>

                <FormField
                  label="Description"
                  description="Meeting agenda, topics, or notes"
                >
                  <textarea
                    value={form.description}
                    onChange={(e) => handleChange("description", e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 rounded-2xl border border-[#1F2937]/10 bg-white text-[12px] text-[#1F2937] transition-all focus:outline-none focus:ring-1 focus:ring-blue-500 resize-vertical"
                    placeholder="Add meeting agenda, discussion topics, or preparation notes..."
                  />
                </FormField>

                {existingMeetings.length > 0 && (
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-2xl">
                    <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                      <CalendarIcon className="w-4 h-4" />
                      Other meetings on this date
                    </h4>
                    <div className="space-y-2">
                      {existingMeetings.map((meeting) => (
                        <div key={meeting._id} className="flex justify-between items-center text-sm p-2 bg-white rounded-lg border border-gray-200">
                          <span className="font-medium text-gray-700">{meeting.title}</span>
                          <span className="text-gray-500 font-mono text-xs">
                            {new Date(meeting.scheduledAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                            {" - "}
                            {new Date(new Date(meeting.scheduledAt).getTime() + meeting.duration * 60000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </form>
            )}
          </div>

          {/* Fixed Footer */}
          <div className="flex-shrink-0 py-2.5 px-4 border-t border-gray-100 bg-white flex items-center justify-end gap-3">
            {isViewing ? (
              <>
                {onDelete && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="flex items-center justify-center gap-2 px-6 py-2 text-red-700 bg-white border border-gray-200 hover:bg-red-50 rounded-[25px] text-sm font-bold transition-colors"
                  >
                    <DeleteIcon className="w-4 h-4" />
                    Delete
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2 border border-gray-200 text-gray-700 rounded-[25px] text-sm font-bold hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditMode(true)}
                  className="px-6 py-2 bg-[#158FFF] text-white rounded-[25px] text-sm font-bold hover:opacity-90 transition-colors flex items-center justify-center gap-2"
                >
                  <EditIcon className="w-4 h-4" />
                  Edit
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={isEditing ? handleCancelEdit : onClose}
                  className="px-6 py-2 border border-gray-200 text-gray-700 rounded-[25px] text-sm font-bold hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="vendor-meeting-form"
                  disabled={loading || timeConflict}
                  className="px-6 py-2 bg-[#158FFF] text-white rounded-[25px] text-sm font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : timeConflict ? (
                    "Resolve Conflict First"
                  ) : (
                    isEditing ? "Update Meeting" : "Schedule Meeting"
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export { PriorityChip, MeetingTypeIcon };
export default VendorMeetingForm;
