import CalendarIcon from "../common/CalendarIcon";
import DeleteIcon from "../common/DeleteIcon";
import PdfIcon from "../common/PdfIcon";
import VideoIcon from "../common/VideoIcon";
import CellphoneIcon from "../common/CellphoneIcon";
// ContactMeetingForm.jsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import API from "../../services/api";
import toast from "react-hot-toast";
import { useSystemSettings } from "../../hooks/useSystemSettings";
import {
  X, Clock, Users, MapPin,
  AlertTriangle, CheckCircle2, Search, User,
  Building, Lightbulb, Timer, Flag } from "lucide-react";
import EditIcon from "../common/EditIcon";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

const initialState = {
  title: "",
  date: "",
  time: "09:00",
  duration: 60,
  priority: "medium",
  meetingType: "in-person",
  meetingCategory: "",
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

const FormField = ({ label, required, children, error, description, icon: Icon }) => (
  <div className="space-y-2">
    <label className="flex items-center gap-2 text-sm font-semibold text-gray-900">
      {Icon && <Icon className="w-4 h-4 text-gray-500" />}
      {label}
      {required && <span className="text-red-500">*</span>}
    </label>
    {children}
    {description && <p className="text-xs text-gray-500">{description}</p>}
    {error && (
      <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
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

const ContactMeetingForm = ({ open, mode, meetingData, calendarDate, contactId, onSave, onDelete, onClose }) => {
  const [form, setForm] = useState(initialState);
  const [loading, setLoading] = useState(false);
  const [isSliding, setIsSliding] = useState(false);
  const { meetingTypes } = useSystemSettings();
  const [shouldRender, setShouldRender] = useState(false);
  const [existingMeetings, setExistingMeetings] = useState([]);
  const [timeConflict, setTimeConflict] = useState(null);
  const [errors, setErrors] = useState({});
  const [isEditMode, setIsEditMode] = useState(false); // Separate state for edit mode toggle
  const titleInputRef = useRef(null);
  const dateInputRef = useRef(null);

  useBodyScrollLock(open);

  const fetchMeetingsForDate = useCallback(async (date) => {
    try {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      
      const res = await API.get("/meetings", {
        params: {
          contactId,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      });
      setExistingMeetings(res.data.meetings);
    } catch (error) {
      console.error("Error fetching meetings:", error);
      setExistingMeetings([]);
    }
  }, [contactId]);

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
        setIsEditMode(false); // Start in view mode
        
        if (initialFormData.date) {
          fetchMeetingsForDate(new Date(initialFormData.date));
        }
      } else {
        const initialFormData = {
          ...initialState,
          date: calendarDate 
        };
        setForm(initialFormData);
        setIsEditMode(true); // Start in create mode
        
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
  }, [open, meetingData, mode, calendarDate, fetchMeetingsForDate]);

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
    const selectedDate = form.date || (calendarDate);
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
    if (!form.title?.trim()) newErrors.title = "Please enter a meeting title.";
    if (!form.date && !calendarDate) newErrors.date = "Please choose a date for the meeting.";

    setErrors(newErrors);
    return newErrors;
  };

  const getScheduledAt = () => {
  const selectedDate = form.date || calendarDate;
  
  if (!selectedDate || !form.time) {
    return null;
  }

  // Helper function (same as task form)
  const createLocalDate = (dateString) => {
    if (!dateString) return null;
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  // Parse the date (whether it's a string or Date object)
  let dateObj;
  if (typeof selectedDate === 'string') {
    dateObj = createLocalDate(selectedDate);
  } else if (selectedDate instanceof Date) {
    // Extract components to avoid timezone issues
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    const day = selectedDate.getDate();
    dateObj = new Date(year, month, day);
  } else {
    dateObj = createLocalDate(selectedDate);
  }

  // Parse time
  const [h, m] = form.time.split(":").map(Number);
  
  // Set the time on the date object
  dateObj.setHours(h, m, 0, 0);

  // Return the Date object directly (NOT toISOString())
  return dateObj;
};

  const handleSubmit = async (e) => {
  e.preventDefault();

  const validationErrors = validateForm();
  if (Object.keys(validationErrors).length > 0) {
    // Friendly toast for the first problem, plus scroll to whichever invalid
    // field sits highest on screen.
    toast.error(Object.values(validationErrors)[0]);
    const latestErrors = {};
    if (!form.title?.trim()) latestErrors.title = true;
    if (!form.date && !calendarDate) latestErrors.date = true;

    const candidates = [
      latestErrors.title ? titleInputRef.current : null,
      latestErrors.date ? dateInputRef.current : null,
    ].filter(Boolean);

    let topMost = null;
    for (const el of candidates) {
      if (!topMost || el.getBoundingClientRect().top < topMost.getBoundingClientRect().top) {
        topMost = el;
      }
    }
    topMost?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  const conflict = checkTimeConflict(form.date || calendarDate, form.time, form.duration);
  if (conflict) {
    toast.error(`Cannot schedule meeting: ${conflict.message}`);
    return;
  }

  setLoading(true);
  try {
    const scheduledAt = getScheduledAt();
    
    if (!scheduledAt) {
      toast.error("Invalid date or time");
      setLoading(false);
      return;
    }

    const payload = {
      ...form,
      scheduledAt, // Send Date object directly, not ISO string
      contactId,
      linkedTo: "contact",
    };

    if (meetingData && mode === "view") {
      await API.put(`/meetings/${meetingData._id}`, payload);
      toast.success("Meeting updated successfully");
    } else {
      await onSave(payload);
    }
    onClose();
  } catch (err) {
    console.error("Error saving meeting:", err);
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
    // Reset form to original data
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
        className="fixed dc-panel-card dc-panel-w z-[10001] bg-white shadow-2xl transform transition-transform duration-300 ease-out overflow-hidden"
        style={{ transform: isSliding ? 'translateX(0)' : 'translateX(calc(100% + 2rem))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 p-2.5 rounded-xl shadow-sm">
                <CalendarIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  {isCreating ? "Schedule New Meeting" : isViewing ? "Meeting Details" : "Edit Meeting"}
                </h3>
                <p className="text-sm text-gray-600">
                  {isCreating ? "Create a new meeting with your contact" : isViewing ? "View meeting information" : "Update meeting information"}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {isViewing ? (
              /* VIEW MODE - Details Display */
              <div className="p-6 space-y-6">
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <h2 className="text-2xl font-bold text-gray-900 leading-tight pr-4">{form.title}</h2>
                    <div className="flex flex-col gap-2">
                      <PriorityChip priority={form.priority} />
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium border border-blue-200">
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
                  <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                      <CalendarIcon className="w-4 h-4 text-blue-600" />
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
                      <Clock className="w-4 h-4 text-blue-600" />
                      <p className="text-sm text-blue-700 font-semibold">
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

                {/* Action Buttons */}
                <div className="flex gap-3 pt-6 border-t border-gray-200">
                  <button
                    onClick={handleEdit}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3 text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl font-semibold transition-colors"
                  >
                    <EditIcon className="w-4 h-4" />
                    Edit Meeting
                  </button>
                  {onDelete && (
                    <button
                      onClick={handleDelete}
                      className="flex-1 flex items-center justify-center gap-2 px-6 py-3 text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl font-semibold transition-colors"
                    >
                      <DeleteIcon className="w-4 h-4" />
                      Delete Meeting
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* EDIT/CREATE MODE - Form */
              <form onSubmit={handleSubmit} noValidate className="p-6 space-y-6">
                <FormField label="Meeting Title" required error={errors.title} icon={PdfIcon}>
                  <input
                    ref={titleInputRef}
                    type="text"
                    value={form.title}
                    onChange={(e) => handleChange("title", e.target.value)}
                    className={`w-full px-4 py-3 rounded-xl border transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.title ? "border-red-300 bg-red-50" : "border-gray-300 bg-white"
                    }`}
                    placeholder="Enter meeting subject or agenda"
                  />
                </FormField>

                <div className="grid grid-cols-2 gap-4">
                  {!calendarDate ? (
                    <FormField label="Date" required error={errors.date} icon={CalendarIcon}>
                      <input
                        ref={dateInputRef}
                        type="date"
                        value={form.date}
                        min={new Date().toISOString().split("T")[0]}
                        max="2099-12-31"
                        onChange={(e) => handleChange("date", e.target.value)}
                        className={`w-full px-4 py-3 rounded-xl border transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          errors.date ? "border-red-300 bg-red-50" : "border-gray-300 bg-white"
                        }`}
                      />
                    </FormField>
                  ) : (
                    <FormField label="Date" icon={CalendarIcon} description="Selected from calendar">
                      <div className="flex items-center gap-2 py-3 px-4 bg-blue-50 text-blue-800 rounded-xl border border-blue-200">
                        <CalendarIcon className="w-4 h-4" />
                        <span className="font-medium">{calendarDate}</span>
                      </div>
                    </FormField>
                  )}

                  <FormField label="Time" icon={Clock}>
                    <input
                      type="time"
                      value={form.time}
                      onChange={(e) => handleChange("time", e.target.value)}
                      className={`w-full px-4 py-3 rounded-xl border transition-all focus:outline-none focus:ring-2 ${
                        timeConflict
                          ? "border-red-500 bg-red-50 focus:ring-red-500"
                          : "border-gray-300 bg-white focus:ring-blue-500"
                      }`}
                    />
                  </FormField>

                  <FormField label="Duration" icon={Timer}>
                    <select
                      value={form.duration}
                      onChange={(e) => handleChange("duration", parseInt(e.target.value))}
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white transition-all focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value={15}>15 minutes</option>
                      <option value={30}>30 minutes</option>
                      <option value={60}>1 hour</option>
                      <option value={90}>1.5 hours</option>
                      <option value={120}>2 hours</option>
                    </select>
                  </FormField>
                </div>

                <FormField label="Priority" icon={Flag}>
                  <select
                    value={form.priority}
                    onChange={(e) => handleChange("priority", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white transition-all focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  <FormField label="Meeting Type" icon={VideoIcon}>
                    <select
                      value={form.meetingType}
                      onChange={(e) => handleChange("meetingType", e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white transition-all focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="in-person">In-person</option>
                      <option value="video-call">Video call</option>
                      <option value="phone-call">Phone call</option>
                    </select>
                  </FormField>

                  <FormField label="Meeting Category" icon={PdfIcon}>
                    <select
                      value={form.meetingCategory}
                      onChange={(e) => handleChange("meetingCategory", e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white transition-all focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">— Select category —</option>
                      {meetingTypes.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </FormField>

                  <FormField 
                    label="Location" 
                    icon={MapPin}
                    description="Meeting room, address, or link"
                  >
                    <input
                      type="text"
                      value={form.location}
                      onChange={(e) => handleChange("location", e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white transition-all focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder={
                        form.meetingType === "video-call"
                          ? "Meeting link or platform"
                          : form.meetingType === "phone-call"
                          ? "Phone number or dial-in details"
                          : "Meeting room or address"
                      }
                    />
                  </FormField>
                </div>

                <FormField
                  label="Description"
                  icon={PdfIcon}
                  description="Meeting agenda, topics, or notes"
                >
                  <textarea
                    value={form.description}
                    onChange={(e) => handleChange("description", e.target.value)}
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    placeholder="Add meeting agenda, discussion topics, or preparation notes..."
                  />
                </FormField>

                {existingMeetings.length > 0 && (
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
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

                <div className="flex gap-3 pt-6 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={isEditing ? handleCancelEdit : onClose}
                    className="flex-1 px-6 py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading || timeConflict}
                    className={`flex-1 px-6 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                      loading || timeConflict
                        ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                        : "bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl"
                    }`}
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : timeConflict ? (
                      "Resolve Conflict First"
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        {isEditing ? "Update Meeting" : "Schedule Meeting"}
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export { PriorityChip, MeetingTypeIcon };
export default ContactMeetingForm;
