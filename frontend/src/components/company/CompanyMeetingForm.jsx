import CalendarIcon from "../common/CalendarIcon";
import DeleteIcon from "../common/DeleteIcon";
import PdfIcon from "../common/PdfIcon";
import VideoIcon from "../common/VideoIcon";
import Checkbox from "../common/Checkbox";
import CellphoneIcon from "../common/CellphoneIcon";
import PlusIcon from "../common/PlusIcon";
import React, { useState, useEffect, useCallback, useRef } from "react";
import API from "../../services/api";
import toast from "react-hot-toast";
import SearchIcon from "../common/SearchIcon";
import { useSystemSettings } from "../../hooks/useSystemSettings";
import {
  X,
  Clock,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  User,
  Building,
  Lightbulb,
  Timer,
  Flag,
  ChevronDown
} from "lucide-react";
import TeamIcon from "../common/TeamIcon";
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
  participants: [],
  internalParticipants: [],
};

const ParticipantChip = ({ user, onRemove, isRemovable = false }) => (
  <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium border border-blue-200">
    <User className="w-3 h-3" />
    <span>{user?.name || "Unknown"}</span>
    {isRemovable && onRemove && (
      <button type="button" onClick={onRemove} className="hover:bg-blue-100 rounded-full p-0.5">
        <X className="w-3 h-3" />
      </button>
    )}
  </div>
);

const PriorityChip = ({ priority }) => {
  const colors = {
    low: { bg: 'bg-[#E6F7EF]', text: 'text-[#1FA971]', border: 'border-[#B9E7D3]' },
    medium: { bg: 'bg-[#FDF3E6]', text: 'text-[#EA9927]', border: 'border-[#F7DDB8]' },
    high: { bg: 'bg-[#FCEAEA]', text: 'text-[#EA4B4B]', border: 'border-[#F5C7C7]' },
  };
  const color = colors[priority] || colors.medium;

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 ${color.bg} ${color.text} rounded-lg text-sm font-medium ${color.border}`}>
      <Flag className="w-3 h-3" />
      <span className="capitalize">{priority}</span>
    </div>
  );
};

// isOpen/onOpenChange are controlled by the parent form (a single shared
// "which dropdown is open" key) rather than each instance owning its own
// state — otherwise opening Meeting Type doesn't close Priority, and their
// option lists render stacked on top of each other.
const SingleSelectDropdown = ({ options, value, onChange, disabled, isOpen, onOpenChange }) => {
  const selectedOption = options.find(opt => opt.value === value) || options[0];
  const wrapperRef = useRef(null);

  // Close on outside click via a listener, not a fixed backdrop (which would
  // block scrolling the form while the dropdown is open).
  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) onOpenChange(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [isOpen, onOpenChange]);

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onOpenChange(!isOpen)}
        className={`w-full flex items-center justify-end gap-2 px-3 py-1.5 rounded-full text-xs font-semibold focus:outline-none transition-all ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'
          } ${selectedOption.className}`}
      >
        <div className="flex items-center gap-1.5">
          {selectedOption.icon && <selectedOption.icon className="w-3 h-3" />}
          <span className="capitalize">{selectedOption.label}</span>
        </div>
        {!disabled && <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />}
      </button>

      {isOpen && (
        <>
          <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-100 rounded-xl shadow-xl z-50 py-1 overflow-hidden animate-in fade-in zoom-in duration-200">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  onOpenChange(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-1.5 text-[13px] transition-colors hover:bg-gray-50 ${value === option.value ? 'bg-blue-50/50 text-blue-600' : 'text-gray-600'
                  }`}
              >
                <div className={`p-1.5 rounded-lg ${option.className}`}>
                  {option.icon && <option.icon className="w-3.5 h-3.5" />}
                </div>
                <span className="font-medium">{option.label}</span>
                {value === option.value && <CheckCircle2 className="w-4 h-4 ml-auto text-blue-600" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const MultiSelectDropdown = ({ users, selectedUsers, onSelectionChange, placeholder = "Select participants" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const wrapperRef = useRef(null);
  const listRef = useRef(null);

  const openDropdown = () => setIsOpen(true);

  // Opens downward. On open — and after each select/deselect, since picking a
  // participant grows the chip row and pushes the list down — scroll the form
  // body just enough that the WHOLE panel sits above the sticky footer. Only
  // scrolls when part of it is hidden, so there's no jump when already visible.
  useEffect(() => {
    if (!isOpen) return;
    requestAnimationFrame(() => {
      const el = listRef.current;
      if (!el) return;
      let scroller = el.parentElement;
      while (scroller && scroller.scrollHeight <= scroller.clientHeight) {
        scroller = scroller.parentElement;
      }
      if (!scroller) return;
      const overflow = el.getBoundingClientRect().bottom - scroller.getBoundingClientRect().bottom;
      if (overflow > 0) scroller.scrollBy({ top: overflow + 12, behavior: "smooth" });
    });
  }, [isOpen, selectedUsers]);

  // Close on outside click via a listener, not a fixed backdrop (which would
  // block scrolling the form while the dropdown is open).
  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [isOpen]);

  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleUserToggle = (userId) => {
    const updatedSelection = selectedUsers.includes(userId)
      ? selectedUsers.filter(id => id !== userId)
      : [...selectedUsers, userId];
    onSelectionChange(updatedSelection);
    // Stay open so several participants can be toggled in one go — the backdrop
    // below closes it on an outside click.
  };

  const selectedUsersList = users.filter(user => selectedUsers.includes(user._id));

  return (
    <div className="space-y-3">
      {selectedUsersList.length > 0 && (
        <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
          {selectedUsersList.map((user) => (
            <ParticipantChip
              key={user._id}
              user={user}
              isRemovable={true}
              onRemove={() => handleUserToggle(user._id)}
            />
          ))}
        </div>
      )}
      <div ref={wrapperRef} className="relative">
        <button
          type="button"
          onClick={() => (isOpen ? setIsOpen(false) : openDropdown())}
          className="w-full flex items-center justify-between px-4 py-3 bg-white border border-gray-300 rounded-xl text-left hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <div className="flex items-center gap-2">
            <PlusIcon className="w-4 h-4 text-gray-400" />
            <span className={selectedUsers.length === 0 ? "text-gray-500" : "text-gray-900"}>
              {selectedUsers.length === 0 ? placeholder : `${selectedUsers.length} participant(s) selected`}
            </span>
          </div>
          <TeamIcon className="w-4 h-4 text-gray-400" />
        </button>
        {isOpen && (
          <>
          <div ref={listRef} className="absolute z-[10050] w-full mt-2 bg-white border border-gray-300 rounded-xl shadow-xl">
            <div className="p-3 border-b border-gray-200">
              <div className="relative">
                <SearchIcon className="absolute left-3 -translate-y-1/2 top-1/2 w-4 h-4 text-[#525866]" />
                <input
                  type="text"
                  placeholder="Search participants..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filteredUsers.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  <TeamIcon className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">No users found</p>
                </div>
              ) : (
                <div className="p-2">
                  {filteredUsers.map((user) => (
                    <label
                      key={user._id}
                      className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors"
                    >
                      <Checkbox checked={selectedUsers.includes(user._id)} onChange={() => handleUserToggle(user._id)} />
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                          <User className="w-3 h-3 text-blue-600" />
                        </div>
                        <span className="text-sm font-medium text-gray-700">{user.name}</span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
          </>
        )}
      </div>
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
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
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
              {new Date(`2024-01-01T${time}`).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
              })}
            </button>
          ))}
        </div>
      </div>
    )}
  </div>
);

const MeetingTypeIcon = ({ type }) => {
  const icons = {
    'in-person': <Building className="w-4 h-4" />,
    'video-call': <VideoIcon className="w-4 h-4" />,
    'phone-call': <CellphoneIcon className="w-4 h-4" />
  };
  return icons[type] || icons['in-person'];
};

const CompanyMeetingForm = ({
  open,
  mode,
  meetingData,
  calendarDate,
  companyId,
  // Set when the form is opened from a contact's calendar: the meeting is
  // filed against the contact instead of the company.
  contactId,
  // Deal calendar: the meeting stays company-linked, with the deal recorded
  // on linkedDealId (meetings have no "linked to a deal" mode).
  dealId,
  users,
  staffUsers = [],
  onSave,
  onDelete,
  onClose,
  startInEditMode
}) => {
  const [form, setForm] = useState(initialState);
  useBodyScrollLock(open);
  const { meetingTypes } = useSystemSettings();
  // Which of the Duration/Meeting Type/Priority dropdowns is open, if any —
  // shared so opening one closes the others instead of them stacking.
  const [openDropdown, setOpenDropdown] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [googleStatus, setGoogleStatus] = useState(null); // { configured, connected, connectedEmail }
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [isSliding, setIsSliding] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [existingMeetings, setExistingMeetings] = useState([]);
  const [company, setCompany] = useState(null);
  const [timeConflict, setTimeConflict] = useState(null);
  const [errors, setErrors] = useState({});
  const [isEditMode, setIsEditMode] = useState(mode === "create" || !!startInEditMode);
  // On a deal page, scope Client Contacts to the deal's single contact.
  const [dealContactId, setDealContactId] = useState("");

  const meetingTypeOptions = [
    { value: 'in-person', label: 'In-person', icon: Building, className: 'bg-orange-50 text-orange-600' },
    { value: 'video-call', label: 'Video Call', icon: VideoIcon, className: 'bg-blue-50 text-blue-600' },
    { value: 'phone-call', label: 'Phone Call', icon: CellphoneIcon, className: 'bg-purple-50 text-purple-600' },
  ];

  const priorityOptions = [
    { value: 'low', label: 'Low', icon: Flag, className: 'bg-[#E6F7EF] text-[#1FA971]' },
    { value: 'medium', label: 'Medium', icon: Flag, className: 'bg-[#FDF3E6] text-[#EA9927]' },
    { value: 'high', label: 'High', icon: Flag, className: 'bg-[#FCEAEA] text-[#EA4B4B]' },
  ];

  const durationOptions = [
    { value: 15, label: '15 Mins', icon: Timer, className: 'bg-slate-50 text-slate-600' },
    { value: 30, label: '30 Mins', icon: Timer, className: 'bg-slate-50 text-slate-600' },
    { value: 60, label: '60 Mins', icon: Timer, className: 'bg-slate-50 text-slate-600' },
    { value: 90, label: '1.5 Hours', icon: Timer, className: 'bg-slate-50 text-slate-600' },
    { value: 120, label: '2 Hours', icon: Timer, className: 'bg-slate-50 text-slate-600' },
  ];

  const fetchCompanyDetails = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await API.get(`/companies/${companyId}`);
      setCompany(res.data);
    } catch (error) {
      console.error("Error fetching company details:", error);
    }
  }, [companyId]);

  const fetchMeetingsForDate = useCallback(async (date) => {
    try {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);

      const res = await API.get("/meetings", {
        params: {
          ...(contactId ? { contactId } : dealId ? { dealId } : { companyId }),
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        }
      });
      setExistingMeetings(res.data.meetings || []);
    } catch (error) {
      console.error("Error fetching meetings:", error);
      setExistingMeetings([]);
    }
  }, [companyId, contactId, dealId]);

  const checkTimeConflict = useCallback((selectedDate, selectedTime, duration) => {
    if (!selectedDate || !selectedTime) return null;

    const selectedDateTime = new Date(selectedDate);
    const [hours, minutes] = selectedTime.split(':');
    selectedDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

    const selectedStartTime = selectedDateTime.getTime();
    const selectedEndTime = selectedStartTime + (duration * 60 * 1000);

    for (const meeting of existingMeetings) {
      if (mode === "view" && isEditMode && meeting._id === meetingData?._id) continue;

      const meetingStart = new Date(meeting.scheduledAt).getTime();
      const meetingEnd = meetingStart + (meeting.duration * 60 * 1000);

      if (
        (selectedStartTime >= meetingStart && selectedStartTime < meetingEnd) ||
        (selectedEndTime > meetingStart && selectedEndTime <= meetingEnd) ||
        (selectedStartTime <= meetingStart && selectedEndTime >= meetingEnd)
      ) {
        return {
          conflictWith: meeting,
          message: `Conflicts with "${meeting.title}" (${new Date(meeting.scheduledAt).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          })} - ${new Date(meetingEnd).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          })})`
        };
      }
    }
    return null;
  }, [existingMeetings, mode, isEditMode, meetingData]);

  // Initialize form when modal opens
  useEffect(() => {
    if (open) {
      setShouldRender(true);
      setTimeout(() => setIsSliding(true), 10);
      fetchCompanyDetails();
      API.get("/auth/google/status")
        .then((res) => setGoogleStatus(res.data))
        .catch(() => setGoogleStatus(null));
      // Resolve the deal's contact to scope Client Contacts.
      if (dealId) {
        API.get(`/deals/${dealId}`)
          .then((res) => setDealContactId(String(res.data?.contact?._id || res.data?.contact || "")))
          .catch(() => setDealContactId(""));
      } else {
        setDealContactId("");
      }

      if (meetingData && mode === "view") {
        const initialFormData = {
          ...meetingData,
          date: meetingData?.scheduledAt ? new Date(meetingData?.scheduledAt).toISOString().slice(0, 10) : "",
          time: meetingData?.scheduledAt ? new Date(meetingData?.scheduledAt).toISOString().slice(11, 16) : "09:00",
          participants: meetingData.participants?.map(p => p._id || p) || [],
          internalParticipants: meetingData.internalParticipants?.map(p => p._id || p) || [],
        };
        setForm(initialFormData);

        // Fetch meetings for the selected date
        if (initialFormData.date) {
          fetchMeetingsForDate(new Date(initialFormData.date));
        }
      } else {
        const initialFormData = {
          ...initialState,
          date: calendarDate,
        };
        setForm(initialFormData);

        // Fetch meetings for calendar date if provided
        if (calendarDate) {
          fetchMeetingsForDate(calendarDate);
        }
      }

      setErrors({});
      setIsEditMode(mode === "create" || !!startInEditMode);
    } else {
      setIsSliding(false);
      setTimeout(() => setShouldRender(false), 300);
      setTimeConflict(null);
    }
  }, [open, meetingData, mode, calendarDate, fetchMeetingsForDate, startInEditMode, dealId]);

  const handleChange = (key, val) => {
    setForm(f => ({ ...f, [key]: val }));

    if (errors[key]) {
      setErrors(prev => ({ ...prev, [key]: null }));
    }

    if (key === 'date' || key === 'time' || key === 'duration') {
      const newDate = key === 'date' ? val : form.date || (calendarDate);
      const newTime = key === 'time' ? val : form.time;
      const newDuration = key === 'duration' ? val : form.duration;

      if (key === 'date' && val) {
        fetchMeetingsForDate(new Date(val));
      }

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
      const timeSlots = ['00', '30'];
      for (const minutes of timeSlots) {
        const timeString = `${hour.toString().padStart(2, '0')}:${minutes}`;
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
    if (form.participants.length === 0) newErrors.participants = "Please add at least one participant.";

    setErrors(newErrors);
    return newErrors;
  };

  const getScheduledAt = () => {
    const date = new Date(form.date || calendarDate);
    const [h, m] = form.time.split(":").map(Number);
    date.setHours(h, m, 0, 0);
    return date.toISOString();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      toast.error(Object.values(validationErrors)[0]);
      return;
    }

    const dateForValidation = form.date || (calendarDate);
    const conflict = checkTimeConflict(dateForValidation, form.time, form.duration);
    if (conflict) {
      toast.error(`Cannot schedule meeting: ${conflict.message}`);
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...form,
        scheduledAt: getScheduledAt(),
        ...(contactId
          ? { contactId, linkedTo: "contact" }
          : { companyId, linkedTo: "company" }),
        ...(dealId ? { linkedDealId: dealId } : {}),
      };

      if (isEditMode && mode === "view") {
        await API.put(`/meetings/${meetingData._id}`, payload);
        toast.success("Meeting updated successfully");
      } else {
        if (onSave) {
          await onSave(payload);
        } else {
          await API.post("/meetings", payload);
          toast.success("Meeting scheduled successfully");
        }
      }
      onClose();
    } catch (err) {
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || (isEditMode && mode === "view" ? "Failed to update meeting" : "Failed to schedule meeting"));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      await onDelete(meetingData._id);
      toast.success("Meeting deleted successfully");
      onClose();
    } catch (err) {
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || "Failed to delete meeting");
      }
    }
  };

  if (!shouldRender) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[10000] transition-opacity duration-300"
        style={{ opacity: isSliding ? 1 : 0 }}
        onClick={onClose}
      />
      <div
        className={`fixed dc-panel-card dc-panel-w z-[10001] bg-white shadow-2xl transform transition-transform duration-300 ease-out overflow-hidden ${
          isSliding ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"
        }`}
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-gray-200 bg-gray-50">
            <h3 className="text-base font-bold text-gray-900">
              Add New Meeting
            </h3>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Form Body */}
          <div className="flex-1 overflow-y-auto">
            <form onSubmit={handleSubmit} className="flex flex-col h-full">
              {/* Content */}
              <div className="p-5 space-y-6">
                <div className="space-y-3">
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => handleChange("title", e.target.value)}
                    className={`w-full text-2xl font-bold border-none bg-transparent placeholder-gray-300 focus:outline-none focus:ring-0 ${errors.title ? 'text-red-600' : 'text-gray-900'
                      }`}
                    placeholder="Meeting Title"
                    disabled={!isEditMode && mode === "view"}
                  />
                  {errors.title && <p className="text-xs text-red-500 font-medium">*{errors.title}</p>}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700">Description</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => handleChange("description", e.target.value)}
                    rows={5}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-100 bg-gray-50/50 focus:bg-white focus:border-blue-500 transition-all focus:outline-none resize-none text-xs text-gray-600"
                    placeholder="Description the task objectives, requirements and important details"
                    disabled={!isEditMode && mode === "view"}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-gray-700">Location</label>
                    <div className="flex items-center gap-3">
                    {(isEditMode || mode === "create") && googleStatus?.configured && !googleStatus?.connected && (
                      <button
                        type="button"
                        disabled={connectingGoogle}
                        onClick={async () => {
                          setConnectingGoogle(true);
                          try {
                            const res = await API.get("/auth/google/connect");
                            if (res.data?.authUrl) {
                              window.location.href = res.data.authUrl;
                            } else {
                              toast.error("Could not start Google connect flow");
                              setConnectingGoogle(false);
                            }
                          } catch {
                            toast.error("Could not start Google connect flow");
                            setConnectingGoogle(false);
                          }
                        }}
                        className="text-xs font-medium text-gray-500 hover:text-gray-700 underline disabled:opacity-50"
                        title="One-time setup: connects a Google account so Generate Link can create real Google Meet links"
                      >
                        {connectingGoogle ? "Connecting…" : "Connect Google Account"}
                      </button>
                    )}
                    {(isEditMode || mode === "create") && (
                      <button
                        type="button"
                        disabled={generatingLink}
                        onClick={async () => {
                          setGeneratingLink(true);
                          try {
                            // Real Zoom or Google Meet link — tries Zoom
                            // first (if configured), then this org's
                            // connected Google account. Same link works for
                            // staff and the external client, no login
                            // required on either side.
                            const res = await API.post("/meetings/generate-video-link", {
                              title: form.title,
                              scheduledAt: form.date ? getScheduledAt() : undefined,
                              duration: form.duration,
                            });
                            if (res.data?.provider && res.data?.joinUrl) {
                              handleChange("location", res.data.joinUrl);
                            } else if (res.data?.error) {
                              toast.error(res.data.error);
                            } else if (googleStatus?.configured && !googleStatus?.connected) {
                              toast.error("Connect your Google account first (link above) to generate a Meet link");
                            } else {
                              toast.error("No video-call provider is configured yet");
                            }
                          } catch {
                            toast.error("Failed to generate a video-call link");
                          } finally {
                            setGeneratingLink(false);
                          }
                          if (form.meetingType !== "video-call") handleChange("meetingType", "video-call");
                        }}
                        className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-50"
                      >
                        <VideoIcon className="w-4 h-4" />
                        {generatingLink ? "Generating…" : "Generate Link"}
                      </button>
                    )}
                    </div>
                  </div>
                  <input
                    type="text"
                    value={form.location}
                    onChange={(e) => handleChange("location", e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-100 bg-gray-50/50 focus:bg-white focus:border-blue-500 transition-all focus:outline-none text-xs text-gray-600"
                    placeholder="Meeting Room Address or video call link"
                    disabled={!isEditMode && mode === "view"}
                  />
                </div>
              </div>

              {/* Meta */}
              <div className="px-5 pb-5 space-y-5 bg-white border-t border-gray-100 pt-5">
                {/* Meta Rows */}
                <div className="space-y-3">
                  {/* Entity Type */}
                  <div className="flex items-center justify-between group">
                    <div className="flex items-center gap-2 text-gray-600 text-xs">
                      <User className="w-3.5 h-3.5" />
                      <span>Entity Type</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-900 text-xs font-medium">
                      <Building className="w-3.5 h-3.5 text-gray-400" />
                      <span className="capitalize">{company?.industry || "Company"}</span>
                    </div>
                  </div>

                  {/* Company Name */}
                  <div className="flex items-center justify-between group">
                    <div className="flex items-center gap-2 text-gray-600 text-xs">
                      <Building className="w-3.5 h-3.5" />
                      <span>Company</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-900 text-xs font-medium">
                      <span className="truncate max-w-[150px]">{company?.name || "Company Name"}</span>
                    </div>
                  </div>

                  {/* Date */}
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-gray-600 text-xs">
                        <CalendarIcon className="w-3.5 h-3.5" />
                        <span>Date</span>
                      </div>
                      <input
                        type="date"
                        value={form.date || calendarDate || ""}
                        min={new Date().toISOString().split("T")[0]}
                        onChange={(e) => handleChange("date", e.target.value)}
                        disabled={!isEditMode && mode === "view"}
                        className={`text-xs font-medium border-none bg-transparent p-0 focus:ring-0 text-right cursor-pointer ${errors.date ? 'text-red-600' : 'text-gray-900'}`}
                      />
                    </div>
                    {errors.date && <p className="text-[10px] text-red-500 font-medium text-right mt-1">{errors.date}</p>}
                  </div>

                  {/* Time */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-gray-600 text-xs">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Time</span>
                    </div>
                    <input
                      type="time"
                      value={form.time}
                      onChange={(e) => handleChange("time", e.target.value)}
                      disabled={!isEditMode && mode === "view"}
                      className="text-xs font-medium text-gray-900 border-none bg-transparent p-0 focus:ring-0 text-right cursor-pointer"
                    />
                  </div>

                  {/* Duration */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-gray-600 text-xs">
                      <Timer className="w-3.5 h-3.5" />
                      <span>Duration</span>
                    </div>
                    <SingleSelectDropdown
                      options={durationOptions}
                      value={form.duration}
                      onChange={(val) => handleChange("duration", val)}
                      disabled={!isEditMode && mode === "view"}
                      isOpen={openDropdown === "duration"}
                      onOpenChange={(open) => setOpenDropdown(open ? "duration" : null)}
                    />
                  </div>

                  {/* Meeting Type */}
                  <div className="flex items-center justify-between group">
                    <div className="flex items-center gap-2 text-gray-600 text-xs">
                      <div className="flex items-center gap-2">
                        <VideoIcon className="w-4 h-4" />
                        <span>Meeting Type</span>
                      </div>
                    </div>
                    <SingleSelectDropdown
                      options={meetingTypeOptions}
                      value={form.meetingType}
                      onChange={(val) => handleChange("meetingType", val)}
                      disabled={!isEditMode && mode === "view"}
                      isOpen={openDropdown === "meetingType"}
                      onOpenChange={(open) => setOpenDropdown(open ? "meetingType" : null)}
                    />
                  </div>

                  {/* Meeting Category */}
                  <div className="flex items-center justify-between group">
                    <div className="flex items-center gap-2 text-gray-600 text-xs">
                      <PdfIcon className="w-4 h-4" />
                      <span>Category</span>
                    </div>
                    <select
                      value={form.meetingCategory}
                      onChange={(e) => handleChange("meetingCategory", e.target.value)}
                      disabled={!isEditMode && mode === "view"}
                      className="text-xs font-semibold text-gray-700 bg-transparent focus:outline-none border-none disabled:opacity-60"
                    >
                      <option value="">— Select —</option>
                      {meetingTypes.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  {/* Priority */}
                  <div className="flex items-center justify-between group">
                    <div className="flex items-center gap-2 text-gray-600 text-xs">
                      <Flag className="w-3.5 h-3.5" />
                      <span>Priority</span>
                    </div>
                    <SingleSelectDropdown
                      options={priorityOptions}
                      value={form.priority}
                      onChange={(val) => handleChange("priority", val)}
                      disabled={!isEditMode && mode === "view"}
                      isOpen={openDropdown === "priority"}
                      onOpenChange={(open) => setOpenDropdown(open ? "priority" : null)}
                    />
                  </div>

                  {/* Internal Team — your own staff attending, kept as a
                      separate list from Client Contacts below so Meeting
                      Details can actually tell the two apart instead of
                      lumping everyone under one bucket. */}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center gap-2 text-gray-600 text-xs">
                      <TeamIcon className="w-3.5 h-3.5" />
                      <span>Internal Team</span>
                    </div>
                    <MultiSelectDropdown
                      users={staffUsers}
                      selectedUsers={form.internalParticipants}
                      onSelectionChange={(internalParticipants) => handleChange("internalParticipants", internalParticipants)}
                      placeholder="Add internal team members"
                    />
                  </div>

                  {/* Client Contacts */}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center gap-2 text-gray-600 text-xs">
                      <TeamIcon className="w-3.5 h-3.5" />
                      <span>Client Contacts</span>
                    </div>
                    <MultiSelectDropdown
                      users={dealId ? (users || []).filter((u) => String(u._id) === dealContactId || (form.participants || []).includes(u._id)) : users}
                      selectedUsers={form.participants}
                      onSelectionChange={(participants) => handleChange("participants", participants)}
                      placeholder="Add client contacts"
                    />
                    {errors.participants && <p className="text-[10px] text-red-500 font-medium">{errors.participants}</p>}
                  </div>
                </div>

                {/* Conflict Alert in Right Column */}
                {timeConflict && (
                  <div className="pt-2">
                    <TimeConflictAlert
                      conflict={timeConflict}
                      suggestedTimes={getSuggestedTimes()}
                      onTimeSelect={(time) => handleChange("time", time)}
                    />
                  </div>
                )}
              </div>
            </form>
          </div>

          {/* Footer Actions */}
          <div className="p-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <div>
              {mode === "view" && onDelete && (
                <button
                  type="button"
                  onClick={handleDelete}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-all border border-gray-100 bg-white"
                  title="Delete Meeting"
                >
                  <DeleteIcon className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
              {(!isEditMode && mode === "view") ? (
                <button
                  type="button"
                  onClick={() => setIsEditMode(true)}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-200 transition-all flex items-center gap-2"
                >
                  <EditIcon className="w-4 h-4" />
                  Edit Meeting
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading || timeConflict}
                  className={`px-6 py-2 rounded-xl text-xs font-bold shadow-lg transition-all flex items-center gap-2 ${loading || timeConflict
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200'
                    }`}
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      {isEditMode && mode === "view" ? "Save Changes" : "Schedule Meeting"}
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export { ParticipantChip, MeetingTypeIcon, PriorityChip };
export default CompanyMeetingForm;