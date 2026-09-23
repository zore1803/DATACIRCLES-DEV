import CalendarIcon from "../components/common/CalendarIcon";
import PlusIcon from "../components/common/PlusIcon";
import MoreIcon from "../components/common/MoreIcon";
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import API from "../services/api";
import AdminMeetingForm from "../components/admin/AdminMeetingForm";
import toast from "react-hot-toast";
import {
  ChevronLeft,
  ChevronRight,
  X,
  Clock,
  MapPin,
  AlignLeft,
  CheckCircle2,
  Building2,
  Truck,
  User,
} from "lucide-react";
import logo from "/DataCircles.png";
import AppToaster from "../components/AppToaster";
import Skeleton from "../components/common/Skeleton";
import { useTopLoadingSignal } from "../components/common/TopLoadingBar";

import SearchIcon from "../components/common/SearchIcon";
import TaskDetailsModal from "../components/Task/TaskDetailsModal";
import MeetingDetailsModal from "../components/company/MeetingDetailsModal";
import HighlightText from "../components/common/HighlightText";
import FilterIcon from "../components/common/FilterIcon";
import TeamIcon from "../components/common/TeamIcon";
// --- Components ---

const CustomMonthIcon = (props) => (
  <svg viewBox="20 14.667 17 18.666" width={20} height={20} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M25.1665 15.667V19.0003" />
    <path d="M31.8335 15.667V19.0003" />
    <path d="M36 28.1663V18.9997C36 18.5576 35.8244 18.1337 35.5118 17.8212C35.1993 17.5086 34.7754 17.333 34.3333 17.333H22.6667C22.2246 17.333 21.8007 17.5086 21.4882 17.8212C21.1756 18.1337 21 18.5576 21 18.9997V30.6663C21 31.1084 21.1756 31.5323 21.4882 31.8449C21.8007 32.1574 22.2246 32.333 22.6667 32.333H31.8333L36 28.1663Z" />
    <path d="M21 22.333H36" />
    <path d="M31 32.333V28.9997C31 28.5576 31.1756 28.1337 31.4882 27.8212C31.8007 27.5086 32.2246 27.333 32.6667 27.333H36" />
  </svg>
);

const CustomWeekIcon = (props) => (
  <svg viewBox="112 14.667 17 18.666" width={20} height={20} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M117.167 15.667V19.0003" />
    <path d="M123.833 15.667V19.0003" />
    <path d="M126.333 17.333H114.667C113.746 17.333 113 18.0792 113 18.9997V30.6663C113 31.5868 113.746 32.333 114.667 32.333H126.333C127.254 32.333 128 31.5868 128 30.6663V18.9997C128 18.0792 127.254 17.333 126.333 17.333Z" />
    <path d="M113 22.333H128" />
    <path d="M117.167 25.667H117.175" />
    <path d="M120.5 25.667H120.508" />
    <path d="M123.833 25.667H123.842" />
    <path d="M117.167 29H117.175" />
    <path d="M120.5 29H120.508" />
    <path d="M123.833 29H123.842" />
  </svg>
);

const CustomDayIcon = (props) => (
  <svg viewBox="0 0 18 18" width={20} height={20} fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path
      d="M2 14C1.45 14 0.979167 13.8042 0.5875 13.4125C0.195833 13.0208 0 12.55 0 12V6C0 5.45 0.195833 4.97917 0.5875 4.5875C0.979167 4.19583 1.45 4 2 4H16C16.55 4 17.0208 4.19583 17.4125 4.5875C17.8042 4.97917 18 5.45 18 6V12C18 12.55 17.8042 13.0208 17.4125 13.4125C17.0208 13.8042 16.55 14 16 14H2ZM2 12H16V6H2V12ZM0.975 2C0.691667 2 0.458333 1.90417 0.275 1.7125C0.0916667 1.52083 0 1.28333 0 1C0 0.716667 0.0958333 0.479167 0.2875 0.2875C0.479167 0.0958333 0.716667 0 1 0H17.025C17.3083 0 17.5417 0.0958333 17.725 0.2875C17.9083 0.479167 18 0.716667 18 1C18 1.28333 17.9042 1.52083 17.7125 1.7125C17.5208 1.90417 17.2833 2 17 2H0.975ZM0.975 18C0.691667 18 0.458333 17.9042 0.275 17.7125C0.0916667 17.5208 0 17.2833 0 17C0 16.7167 0.0958333 16.4792 0.2875 16.2875C0.479167 16.0958 0.716667 16 1 16H17.025C17.3083 16 17.5417 16.0958 17.725 16.2875C17.9083 16.4792 18 16.7167 18 17C18 17.2833 17.9042 17.5208 17.7125 17.7125C17.5208 17.9042 17.2833 18 17 18H0.975Z"
      fill="currentColor"
    />
  </svg>
);

const EntityIcon = ({ type, className = "w-3 h-3" }) => {
  switch (type) {
    case "Contact": return <User className={className} />;
    case "Company": return <Building2 className={className} />;
    case "Vendor": return <Truck className={className} />;
    default: return <User className={className} />;
  }
};

const ViewSwitcher = ({ view, setView }) => {
  return (
    <div className="flex bg-gray-100 p-1 rounded-lg">
      {["Month", "Week", "Day"].map((v) => (
        <button
          key={v}
          onClick={() => setView(v.toLowerCase())}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${view === v.toLowerCase()
            ? "bg-white text-gray-900 shadow-sm"
            : "text-gray-500 hover:text-gray-700"
            }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
};

const EventCard = ({ item, type, onClick }) => {
  const isMeeting = type === "meeting";

  // Helper to resolve entity info safely
  const getEntityDetails = () => {
    let name = "Unknown";
    let entityType = "Contact";

    if (isMeeting) {
      if (item.contact) { name = item.contact.name; entityType = "Contact"; }
      else if (item.company) { name = item.company.name; entityType = "Company"; }
      else if (item.vendor) { name = item.vendor.name; entityType = "Vendor"; }
    } else {
      // Task logic
      if (item.relatedEntities?.[0]) {
        name = item.relatedEntities[0].entityId?.name || item.relatedEntities[0].entityModel;
        entityType = item.relatedEntities[0].entityModel;
      } else if (item.contactId) { name = item.contactId.name; entityType = "Contact"; }
      else if (item.companyId) { name = item.companyId.name; entityType = "Company"; }
      else if (item.vendorId) { name = item.vendorId.name; entityType = "Vendor"; }
    }
    return { name, entityType };
  };

  const { name, entityType } = getEntityDetails();

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick(item); }}
      className={`
        group relative px-2 py-1.5 rounded-md border-l-[3px] shadow-sm cursor-pointer transition-all hover:shadow-md mb-1.5
        ${isMeeting
          ? "bg-blue-50 border-blue-500 hover:bg-blue-100"
          : "bg-emerald-50 border-emerald-500 hover:bg-emerald-100"}
      `}
    >
      <div className="flex items-center justify-between">
        <span className={`text-xs font-semibold truncate ${isMeeting ? "text-blue-900" : "text-emerald-900"}`}>
          {item.title}
        </span>
        {item.priority === 'High' && (
          <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
        )}
      </div>

      <div className="flex items-center gap-1 mt-1 opacity-75">
        <EntityIcon type={entityType} className={`w-3 h-3 ${isMeeting ? "text-blue-700" : "text-emerald-700"}`} />
        <span className={`text-[10px] truncate ${isMeeting ? "text-blue-800" : "text-emerald-800"}`}>
          {name}
        </span>
      </div>
    </div>
  );
};

const QuickAddMenu = ({ isOpen, onClose, position, onAddType }) => {
  if (!isOpen) return null;
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose}></div>
      <div
        className="absolute z-50 bg-white rounded-lg shadow-xl border border-gray-100 p-2 w-48 animate-in fade-in zoom-in-95 duration-100"
        style={{ top: position.y, left: position.x }}
      >
        <div className="text-xs font-semibold text-gray-500 px-2 py-1.5 uppercase tracking-wider">Create New</div>
        <button
          onClick={() => onAddType("meeting")}
          className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded-md transition-colors"
        >
          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
            <TeamIcon className="w-3.5 h-3.5 text-blue-600" />
          </div>
          Meeting
        </button>
        <button
          onClick={() => onAddType("task")}
          className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 rounded-md transition-colors"
        >
          <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          Task
        </button>
      </div>
    </>
  );
};

const WeekView = ({ currentDate, meetings, tasks, onEventClick }) => {
  // 1. Get Start/End of Week (Assuming Mon start)
  const getWeekDays = () => {
    const curr = new Date(currentDate);
    const day = curr.getDay();
    const diff = curr.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    const startOfWeek = new Date(curr.setDate(diff));

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      days.push(d);
    }
    return days;
  };

  const weekDays = getWeekDays();
  const hours = Array.from({ length: 13 }, (_, i) => i + 7); // 7 AM to 7 PM

  return (
    <div className="flex-1 overflow-auto bg-white relative h-full">
      {/* Sticky Header Row */}
      <div className="flex border-b border-gray-200 min-h-[50px] sticky top-0 z-30 bg-white w-max">
        {/* Top-Left Corner (Sticky Left + Top) */}
        <div className="w-[104px] border-r border-gray-100 flex-shrink-0 sticky left-0 z-40 bg-white border-b border-gray-200"></div>

        {/* Date Headers */}
        {weekDays.map((day, i) => (
          <div key={i} className="flex-none w-[230px] border-r border-gray-100 flex flex-col items-center justify-center py-2 bg-white">
            <span className="text-lg font-bold text-gray-900">{day.getDate()}</span>
            <span className="text-xs text-gray-500 uppercase">{day.toLocaleString('default', { weekday: 'long' })}</span>
          </div>
        ))}
      </div>

      {/* Time Grid (Rows) */}
      <div className="w-max">
        {hours.map((hour) => (
          <div key={hour} className="flex h-[153px] border-b border-gray-100 relative group">
            {/* Sticky Time Label */}
            <div className="w-[104px] border-r border-gray-100 flex-shrink-0 flex justify-center pt-2 bg-gray-50 text-xs text-gray-500 font-medium sticky left-0 z-20">
              {hour > 12 ? `${hour - 12} PM` : hour === 12 ? '12 PM' : `${hour} AM`}
            </div>

            {/* Day Columns */}
            {weekDays.map((day, dayIdx) => {
              const dateKey = day.toDateString();
              const dayEvents = [
                ...(meetings[dateKey] || []).map(m => ({ ...m, type: 'meeting' })),
                ...(tasks[dateKey] || []).map(t => ({ ...t, type: 'task' }))
              ];

              // Filter events for this hour block
              const hourEvents = dayEvents.filter(ev => {
                const d = new Date(ev.scheduledAt || ev.dueDate);
                return d.getHours() === hour;
              });

              return (
                <div key={dayIdx} className="flex-none w-[230px] border-r border-gray-100 relative p-1 transition-colors hover:bg-gray-50/30">
                  {hourEvents.map((ev, evIdx) => (
                    <div
                      key={ev._id || evIdx}
                      onClick={() => onEventClick(ev, ev.type)}
                      className="bg-red-50 border-l-[3px] border-red-500 p-2 rounded-r-md cursor-pointer hover:shadow-md transition-shadow mb-1"
                    >
                      <h4 className="text-xs font-bold text-red-700 truncate">{ev.title}</h4>
                      {ev.description && <p className="text-[10px] text-gray-500 line-clamp-1 mt-0.5">{ev.description}</p>}
                      <div className="mt-1.5 space-y-0.5">
                        <div className="flex items-center gap-1 text-[9px] text-gray-500">
                          <CalendarIcon className="w-2.5 h-2.5" />
                          {new Date(ev.scheduledAt || ev.dueDate).toLocaleDateString()}
                        </div>
                        <div className="flex items-center gap-1 text-[9px] text-gray-500">
                          <Clock className="w-2.5 h-2.5" />
                          {new Date(ev.scheduledAt || ev.dueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        {ev.location && (
                          <div className="flex items-center gap-1 text-[9px] text-gray-500">
                            <MapPin className="w-2.5 h-2.5" />
                            {ev.location}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

// Week view showed just "August 2026", which says nothing about which week
// you're on - and is plainly wrong for a week that straddles two months.
const formatWeekRange = (date) => {
  const offset = date.getDay() === 0 ? 6 : date.getDay() - 1; // weeks start Monday
  const start = new Date(date);
  start.setDate(date.getDate() - offset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  const sameMonth = start.getMonth() === end.getMonth();
  const sameYear = start.getFullYear() === end.getFullYear();
  const startFmt = { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) };

  return `${start.toLocaleDateString(undefined, sameMonth && sameYear ? { day: "numeric" } : startFmt)} – ${end.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
};

const AdminCalendar = () => {
  // State
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState("month");
  const [meetings, setMeetings] = useState({});
  const [tasks, setTasks] = useState({});
  const [loading, setLoading] = useState(true);
  useTopLoadingSignal(loading);

  // Modals & Popups
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState("meeting"); // meeting | task
  const [modalMode, setModalMode] = useState("create"); // create | view
  const [selectedItem, setSelectedItem] = useState(null);
  const [quickAddPos, setQuickAddPos] = useState(null);
  const [selectedDateForAdd, setSelectedDateForAdd] = useState(null);

  // Entities Data
  const [users, setUsers] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [vendors, setVendors] = useState([]);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const searchInputRef = useRef(null);
  const [filters, setFilters] = useState({
    meetings: true,
    tasks: true,
    highPriority: false
  });
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [headerAddPos, setHeaderAddPos] = useState(null);
  const headerMenusRef = useRef(null);

  // Read by every count and cell below instead of `meetings`/`tasks`
  // directly, so the filter toggles apply to the grid and the header totals
  // together. highPriority narrows tasks only — meetings have no priority.
  const visibleMeetings = useMemo(
    () => (filters.meetings ? meetings : {}),
    [filters.meetings, meetings],
  );
  const visibleTasks = useMemo(() => {
    if (!filters.tasks) return {};
    if (!filters.highPriority) return tasks;
    return Object.fromEntries(
      Object.entries(tasks)
        .map(([key, list]) => [key, list.filter((t) => t.priority?.toLowerCase() === "high")])
        .filter(([, list]) => list.length > 0),
    );
  }, [filters.tasks, filters.highPriority, tasks]);
  const activeFilterCount =
    (filters.meetings ? 0 : 1) + (filters.tasks ? 0 : 1) + (filters.highPriority ? 1 : 0);

  // --- Fetch Data ---
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [meetingsRes, tasksRes] = await Promise.all([
        API.get("/meetings/all-meetings"),
        API.get("/tasks/admin"),
      ]);

      const meetingsByDate = {};
      meetingsRes.data.forEach((m) => {
        const key = new Date(m.scheduledAt).toDateString();
        if (!meetingsByDate[key]) meetingsByDate[key] = [];
        meetingsByDate[key].push(m);
      });

      const tasksByDate = {};
      tasksRes.data.forEach((t) => {
        const taskDate = t.dueDate || t.selectedDate;
        if (taskDate) {
          const key = new Date(taskDate).toDateString();
          if (!tasksByDate[key]) tasksByDate[key] = [];
          tasksByDate[key].push(t);
        }
      });

      setMeetings(meetingsByDate);
      setTasks(tasksByDate);
    } catch (error) {
      toast.error("Failed to load calendar data");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEntities = useCallback(async () => {
    try {
      const [u, c, comp, v] = await Promise.all([
        API.get("/auth/all-user"),
        API.get("/contacts"),
        API.get("/companies"),
        API.get("/vendors")
      ]);
      setUsers(u.data.allUsers || []);
      setContacts(c.data || []);
      setCompanies(comp.data || []);
      setVendors(v.data || []);
    } catch (e) {
      console.error("Error fetching entities", e);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchEntities();
  }, [fetchData, fetchEntities]);

  // --- Calendar Logic ---
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthName = currentDate.toLocaleString('default', { month: 'long' });

  const getCalendarDays = () => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay(); // 0 = Sun

    // Adjust for Monday start if needed. Let's stick to Sunday start for standard view or Monday?
    // Standard is often Sunday. Let's use Monday start as per many business apps.
    // Mon=0, Tue=1... Sun=6
    const startDay = firstDay === 0 ? 6 : firstDay - 1;

    const days = [];
    // Previous month filler
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = startDay - 1; i >= 0; i--) {
      days.push({ date: new Date(year, month - 1, prevMonthDays - i), isCurrent: false });
    }
    // Current month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ date: new Date(year, month, i), isCurrent: true });
    }
    // Next month filler
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({ date: new Date(year, month + 1, i), isCurrent: false });
    }
    return days;
  };

  const calendarDays = getCalendarDays();
  const today = new Date();

  // --- Period counts (Meetings/Tasks visible in the current Month/Week/Day view) ---
  const getPeriodDateKeys = () => {
    if (view === "day") return [currentDate.toDateString()];
    if (view === "week") {
      const startDay = currentDate.getDay() === 0 ? 6 : currentDate.getDay() - 1;
      const weekStart = new Date(currentDate);
      weekStart.setDate(currentDate.getDate() - startDay);
      return Array.from({ length: 7 }).map((_, i) => {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        return d.toDateString();
      });
    }
    return calendarDays
      .filter((d) => d.isCurrent)
      .map((d) => d.date.toDateString());
  };
  const periodDateKeys = getPeriodDateKeys();
  const periodMeetingsCount = periodDateKeys.reduce(
    (sum, key) => sum + (visibleMeetings[key]?.length || 0),
    0,
  );
  const periodTasksCount = periodDateKeys.reduce(
    (sum, key) => sum + (visibleTasks[key]?.length || 0),
    0,
  );

  // --- Handlers ---
  // "+N more" opens the full list for that day, rather than the two items
  // the cell has room for.
  const [dayDetail, setDayDetail] = useState(null); // { date, meetings, tasks }

  useEffect(() => {
    if (!filterOpen && !moreOpen && !headerAddPos) return;
    const onDocClick = (e) => {
      if (!headerMenusRef.current?.contains(e.target)) {
        setFilterOpen(false);
        setMoreOpen(false);
        setHeaderAddPos(null);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [filterOpen, moreOpen, headerAddPos]);

  const handleDayClick = (e, date) => {
    // Open quick add menu at click position
    if (!quickAddPos) {
      const rect = e.currentTarget.getBoundingClientRect();
      setQuickAddPos({ x: rect.left + window.scrollX + 20, y: rect.top + window.scrollY + 20 });
      setSelectedDateForAdd(date);
    } else {
      setQuickAddPos(null);
    }
  };

  const handleCreate = (type) => {
    setModalType(type);
    setModalMode("create");
    setSelectedItem(null);
    setModalOpen(true);
    setQuickAddPos(null);
  };

  const handleEventClick = (item, type) => {
    setModalType(type);
    setModalMode("view");
    setSelectedItem(item);
    setModalOpen(true);
  };

  const handleSave = async (form, type) => {
    const toastId = toast.loading("Saving...");
    try {
      const endpoint = type === "meeting" ? "/meetings" : "/tasks";
      await API.post(endpoint, form);
      toast.success("Saved successfully!", { id: toastId });
      setModalOpen(false);
      fetchData();
    } catch (error) {
      if (error.response?.status === 402) {
        toast.error(error.response?.data?.message || "An active subscription is required to make changes.", { id: toastId });
      } else {
        toast.error(error.response?.data?.error || "Failed to save", { id: toastId });
      }
    }
  };

  const handleDelete = async (id, type) => {
    const toastId = toast.loading("Deleting...");
    try {
      const endpoint = type === "meeting" ? "/meetings" : "/tasks";
      await API.delete(`${endpoint}s/${id}`); // Note: endpoint usually plural in REST
      toast.success("Deleted successfully!", { id: toastId });
      setModalOpen(false);
      fetchData();
    } catch (error) {
      if (error.response?.status === 402) {
        toast.error(error.response?.data?.message || "An active subscription is required to make changes.", { id: toastId });
      } else {
        toast.error(error.response?.data?.error || "Failed to delete", { id: toastId });
      }
    }
  };

  const formatDateForForm = (date) => {
    if (!date) return "";
    return date.toISOString().split('T')[0];
  };

  // --- Stats Calculation ---
  // Whether the period on screen is the one containing today — drives the
  // "Today" button's active styling (and disables it, since there is nowhere
  // to jump to). Scoped to the active view, matching the other calendars:
  // month view counts any day this month, week view any day this week,
  // day view only today itself.
  const isViewingToday = (() => {
    const now = new Date();
    if (view === "month")
      return (
        currentDate.getMonth() === now.getMonth() &&
        currentDate.getFullYear() === now.getFullYear()
      );
    if (view === "week") {
      const startDay = currentDate.getDay() === 0 ? 6 : currentDate.getDay() - 1;
      const weekStart = new Date(currentDate);
      weekStart.setDate(currentDate.getDate() - startDay);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      return now >= weekStart && now < weekEnd;
    }
    return currentDate.toDateString() === now.toDateString();
  })();

  const totalMeetings = Object.values(meetings).flat().length;
  const totalTasks = Object.values(tasks).flat().length;
  const highPriorityMeetings = Object.values(meetings).flat().filter(m => m.priority === 'High').length;

  // --- Render ---
  return (
    <div className="flex flex-col h-full bg-gray-50/50 min-h-screen -mx-4 sm:-mx-6 lg:-mx-8">
      <AppToaster />

      <div
        className="fixed flex flex-col flex-shrink-0"
        style={{
          top: "64px",
          left: "var(--sidebar-width, 0px)",
          right: 0,
          background: "#FFFFFF",
          borderBottom: "1px solid #E1E4EA",
          borderRadius: 0,
          zIndex: 40,
        }}
      >
      <div
        className="box-border flex flex-row justify-between items-center flex-shrink-0 self-stretch"
        style={{
          padding: "0px 24px",
          gap: 16,
          width: "100%",
          height: 64,
          minHeight: 64,
          maxHeight: 64,
        }}
      >
        <div
          className="flex flex-col items-start flex-shrink min-w-0"
          style={{ gap: 6, height: 39 }}
        >
          <span
            className="truncate w-full"
            style={{
              fontFamily: "Inter",
              fontWeight: 500,
              fontSize: 16,
              lineHeight: "120%",
              letterSpacing: "-0.5px",
              color: "#0E121B",
            }}
          >
            Calendar
          </span>
          {loading ? (
            <Skeleton width={260} height={12} />
          ) : (
          <span
            className="truncate w-full"
            style={{
              fontFamily: "Inter",
              fontWeight: 400,
              fontSize: 12,
              lineHeight: "120%",
              color: "#525866",
            }}
          >
            View all meetings and tasks across contacts, companies and vendors
          </span>
          )}
        </div>

        <div
          className="flex flex-row items-center flex-shrink-0"
          style={{ gap: 12, height: 40 }}
        >
          <div
            className="relative box-border flex flex-row items-center flex-shrink transition-all duration-300 ease-in-out hover:bg-gray-50 focus-within:hover:bg-white"
            style={{
              // Collapsed, this is a 40px circle holding a 16px icon: 14px of
              // side padding left only 10px of content box, so the icon
              // overflowed and sat left of centre. No padding + centring while
              // collapsed; the input's padding comes back when it expands.
              padding: isSearchExpanded ? "10px 14px" : 0,
              justifyContent: isSearchExpanded ? "flex-start" : "center",
              gap: isSearchExpanded ? 10 : 0,
              width: isSearchExpanded ? 416 : 40,
              maxWidth: "40vw",
              minWidth: isSearchExpanded ? 120 : 40,
              height: 40,
              border: `1px solid ${isSearchExpanded ? "#0085FF" : "rgba(31, 41, 55, 0.1)"}`,
              borderRadius: 95,
              background: "#fff",
            }}
          >
            <SearchIcon
              className="flex-shrink-0 cursor-pointer w-4 h-4 text-[#525866]"
              style={{ color: "#1F2937" }}
              onClick={() => {
                setIsSearchExpanded(true);
                searchInputRef.current?.focus();
              }}
            />
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={() => setIsSearchExpanded(true)}
              onBlur={() => {
                if (!searchTerm) setIsSearchExpanded(false);
              }}
              // Collapsed, the input is taken out of the layout entirely
              // (w-0 + flex-none), not just faded: as a flex-1 child at
              // opacity 0 it still claimed the row's width and shoved the
              // icon out of the 40px circle to its left.
              className={`bg-transparent focus:outline-none truncate transition-opacity duration-200 cursor-pointer ${isSearchExpanded ? "flex-1 opacity-100 focus:cursor-text" : "w-0 flex-none p-0 opacity-0 pointer-events-none"}`}
              style={{
                fontFamily: "Inter",
                fontWeight: 400,
                fontSize: 14,
                lineHeight: "20px",
                color: "#1F2937",
              }}
              placeholder="Search by events by name, task, or meeting..."
            />
          </div>

          <div
            ref={headerMenusRef}
            className="relative flex flex-row items-center flex-shrink-0"
            style={{ gap: 12, height: 40 }}
          >
            <button
              disabled={loading}
              onClick={() => { setFilterOpen((v) => !v); setMoreOpen(false); setHeaderAddPos(null); }}
              title="Filter"
              className="box-border relative flex flex-row justify-center items-center flex-shrink-0"
              style={{
                padding: 10,
                gap: 8,
                width: 40,
                height: 40,
                background: filterOpen || activeFilterCount ? "#F5F8FF" : "#FFFFFF",
                border: `1px solid ${filterOpen || activeFilterCount ? "#0085FF" : "#E1E4EA"}`,
                borderRadius: 95,
              }}
            >
              {loading ? <Skeleton width={16} height={16} shape="circle" /> : <FilterIcon size={16} />}
              {!loading && activeFilterCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#0085FF] text-white text-[10px] font-semibold flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>

            <button
              disabled={loading}
              onClick={() => { setMoreOpen((v) => !v); setFilterOpen(false); setHeaderAddPos(null); }}
              title="More options"
              className="box-border flex flex-row justify-center items-center flex-shrink-0"
              style={{
                padding: 10,
                gap: 8,
                width: 40,
                height: 40,
                background: moreOpen ? "#F5F8FF" : "#FFFFFF",
                border: `1px solid ${moreOpen ? "#0085FF" : "#E1E4EA"}`,
                borderRadius: 96,
              }}
            >
              {loading ? <Skeleton width={16} height={16} shape="circle" /> : <MoreIcon className="w-4 h-4 text-[#1F2937]" />}
            </button>

            <button
              disabled={loading}
              onClick={() => { setHeaderAddPos((v) => (v ? null : true)); setFilterOpen(false); setMoreOpen(false); }}
              className="flex flex-row justify-center items-center flex-shrink-0"
              style={{
                padding: 10,
                gap: 6,
                width: 146,
                height: 40,
                background: loading ? "#F5F6F6" : "#0085FF",
                borderRadius: 96,
              }}
            >
              {loading ? (
                <Skeleton width={90} height={14} />
              ) : (
                <>
                  <PlusIcon className="w-4 h-4 text-white" />
                  <span
                    style={{
                      fontFamily: "Inter",
                      fontWeight: 500,
                      fontSize: 14,
                      lineHeight: "20px",
                      color: "#FFFFFF",
                    }}
                  >
                    Add Activity
                  </span>
                </>
              )}
            </button>

            {filterOpen && (
              <div className="absolute right-0 top-[48px] z-50 w-56 bg-white rounded-lg shadow-xl border border-gray-100 p-2">
                <div className="text-xs font-semibold text-gray-500 px-2 py-1.5 uppercase tracking-wider">Show</div>
                {[
                  { key: "meetings", label: "Meetings" },
                  { key: "tasks", label: "Tasks" },
                  { key: "highPriority", label: "High priority tasks only" },
                ].map(({ key, label }) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={filters[key]}
                      onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.checked }))}
                      className="accent-[#0085FF]"
                    />
                    {label}
                  </label>
                ))}
                {activeFilterCount > 0 && (
                  <button
                    onClick={() => setFilters({ meetings: true, tasks: true, highPriority: false })}
                    className="w-full text-left px-3 py-2 mt-1 text-sm text-[#0085FF] hover:bg-blue-50 rounded-md border-t border-gray-100"
                  >
                    Reset filters
                  </button>
                )}
              </div>
            )}

            {moreOpen && (
              <div className="absolute right-0 top-[48px] z-50 w-48 bg-white rounded-lg shadow-xl border border-gray-100 p-2">
                <button
                  onClick={() => { setMoreOpen(false); fetchData(); }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md"
                >
                  Refresh
                </button>
                <button
                  onClick={() => { setMoreOpen(false); setCurrentDate(new Date()); }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md"
                >
                  Jump to today
                </button>
              </div>
            )}

            {headerAddPos && (
              <div className="absolute right-0 top-[48px] z-50 w-48 bg-white rounded-lg shadow-xl border border-gray-100 p-2">
                <div className="text-xs font-semibold text-gray-500 px-2 py-1.5 uppercase tracking-wider">Create New</div>
                <button
                  onClick={() => { setHeaderAddPos(null); handleCreate("meeting"); }}
                  className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded-md transition-colors"
                >
                  <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                    <TeamIcon className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                  Meeting
                </button>
                <button
                  onClick={() => { setHeaderAddPos(null); handleCreate("task"); }}
                  className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 rounded-md transition-colors"
                >
                  <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  </div>
                  Task
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      </div>

      <div
        className="box-border flex flex-col items-start flex-shrink-0 self-stretch mx-6 bg-white border border-[#E1E4EA] rounded-lg"
        style={{ padding: 0, gap: 0, marginTop: 18 + 64 }}
      >
        {/* Filter bar */}
        <div
          className="relative box-border flex flex-row justify-between items-center flex-shrink-0 self-stretch"
          style={{
            padding: "6px 16px",
            width: "100%",
            height: 60,
            borderBottom: "1px solid #E0E0E1",
          }}
        >
          {/* Legend */}
          <div
            className="absolute flex flex-row items-center"
            style={{
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              gap: 8,
            }}
          >
            <div
              className="flex flex-row justify-center items-center flex-shrink-0"
              style={{ padding: "8px 24px", gap: 10, height: 30, borderRadius: 96 }}
            >
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#0085FF", flexShrink: 0 }} />
              {loading ? (
                <Skeleton width={70} height={12} />
              ) : (
              <span
                className="whitespace-nowrap"
                style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "120%", color: "#0085FF" }}
              >
                {periodMeetingsCount} Meeting{periodMeetingsCount !== 1 ? "s" : ""}
              </span>
              )}
            </div>
            <div
              className="flex flex-row justify-center items-center flex-shrink-0"
              style={{ padding: "8px 24px", gap: 10, height: 30, borderRadius: 96 }}
            >
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#00C950", flexShrink: 0 }} />
              {loading ? (
                <Skeleton width={60} height={12} />
              ) : (
              <span
                className="whitespace-nowrap"
                style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "120%", color: "#00C950" }}
              >
                {periodTasksCount} Task{periodTasksCount !== 1 ? "s" : ""}
              </span>
              )}
            </div>
          </div>

          {/* Date navigator */}
          <div
            className="flex flex-row items-center flex-shrink-0"
            style={{ height: 32 }}
          >
            <button
              onClick={() => {
                const d = new Date(currentDate);
                if (view === "month") d.setMonth(d.getMonth() - 1);
                else if (view === "week") d.setDate(d.getDate() - 7);
                else d.setDate(d.getDate() - 1);
                setCurrentDate(d);
              }}
              className="box-border flex flex-row justify-center items-center flex-shrink-0"
              style={{
                width: 48,
                height: 32,
                border: "1px solid #E0E0E1",
                borderRadius: "95px 0px 0px 95px",
              }}
            >
              <ChevronLeft size={20} style={{ color: "#111216" }} />
            </button>
            <div
              className="box-border flex flex-row justify-center items-center flex-shrink-0"
              style={{
                padding: "0px 16px",
                minWidth: 94,
                height: 32,
                borderWidth: "1px 0px",
                borderStyle: "solid",
                borderColor: "#E0E0E1",
              }}
            >
              {loading ? (
                <Skeleton width={72} height={14} />
              ) : (
              <span
                className="whitespace-nowrap"
                style={{
                  fontFamily: "'SF Pro Display', Inter, sans-serif",
                  fontWeight: 500,
                  fontSize: 14,
                  lineHeight: "17px",
                  color: "#111216",
                }}
              >
                {view === "day"
                  ? currentDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                  : view === "week"
                  ? formatWeekRange(currentDate)
                  : currentDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
              </span>
              )}
            </div>
            <button
              onClick={() => {
                const d = new Date(currentDate);
                if (view === "month") d.setMonth(d.getMonth() + 1);
                else if (view === "week") d.setDate(d.getDate() + 7);
                else d.setDate(d.getDate() + 1);
                setCurrentDate(d);
              }}
              className="box-border flex flex-row justify-center items-center flex-shrink-0"
              style={{
                width: 48,
                height: 32,
                border: "1px solid #E0E0E1",
                borderRadius: "0px 95px 95px 0px",
              }}
            >
              <ChevronRight size={20} style={{ color: "#111216" }} />
            </button>

            {/* Jump back to the current period. Kept inside the prev/next
                group (not a standalone flex item on the bar) so the
                filter bar's justify-between doesn't strand it out near the
                horizontal center, colliding with the absolutely-positioned
                Meetings/Tasks legend. Lights up while the view already
                shows today so it reads as where-you-are, not just a control. */}
            <button
              onClick={() => setCurrentDate(new Date())}
              disabled={loading || isViewingToday}
              className="box-border flex flex-row justify-center items-center flex-shrink-0 transition-colors"
              style={{
                padding: "0px 16px",
                height: 32,
                marginLeft: 12,
                fontFamily: "'SF Pro Display', Inter, sans-serif",
                fontWeight: 500,
                fontSize: 14,
                lineHeight: "17px",
                border: `1px solid ${isViewingToday ? "#0085FF" : "#E0E0E1"}`,
                background: isViewingToday ? "#EFF6FF" : "#FFFFFF",
                color: isViewingToday ? "#0085FF" : "#111216",
                borderRadius: 95,
                cursor: isViewingToday ? "default" : "pointer",
              }}
            >
              Today
            </button>
          </div>

          {/* View switcher */}
          <div
            className="box-border flex flex-row justify-center items-center flex-shrink-0"
            style={{
              padding: 4,
              gap: 6,
              width: 285,
              height: 40,
              background: "#FFFFFF",
              border: "1px solid #E0E0E1",
              boxShadow: "0px 4px 4px rgba(0, 0, 0, 0.1)",
              borderRadius: 96,
            }}
          >
            {[
              { v: "month", Icon: CustomMonthIcon },
              { v: "week", Icon: CustomWeekIcon },
              { v: "day", Icon: CustomDayIcon },
            ].map(({ v, Icon }) => (
              <button
                key={v}
                onClick={() => !loading && setView(v)}
                className="box-border flex flex-row justify-center items-center flex-1"
                style={{
                  padding: "6px 12px",
                  gap: 6,
                  height: 32,
                  background: view === v ? "#FFFFFF" : "transparent",
                  border: view === v ? "1px solid rgba(0, 133, 255, 0.2)" : "none",
                  boxShadow: view === v ? "0px 0px 6px rgba(0, 0, 0, 0.1)" : "none",
                  borderRadius: view === v ? 96 : 4,
                }}
              >
                {loading ? (
                  <Skeleton width={16} height={16} shape="circle" />
                ) : (
                  <Icon width={16} height={16} style={{ color: view === v ? "#0085FF" : "#48494C", flexShrink: 0 }} />
                )}
                {loading ? (
                  <Skeleton width={30} height={12} />
                ) : (
                <span
                  className="capitalize whitespace-nowrap"
                  style={{
                    fontFamily: "'SF Pro Display', Inter, sans-serif",
                    fontWeight: 500,
                    fontSize: 13,
                    lineHeight: "17px",
                    color: view === v ? "#0085FF" : "#48494C",
                  }}
                >
                  {v}
                </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Day-of-week header row */}
        <div
          className="flex flex-row items-start flex-shrink-0 self-stretch"
        >
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, i) => (
            <div
              key={day}
              className="box-border flex flex-row justify-center items-center flex-shrink-0"
              style={{
                padding: 16,
                gap: 10,
                width: "14.2857%",
                height: 40,
                borderWidth: i === 6 ? "0px 0px 1px 0px" : "0px 1px 1px 0px",
                borderStyle: "solid",
                borderColor: "#E0E0E1",
              }}
            >
              {loading ? (
                <Skeleton width={28} height={12} />
              ) : (
              <span
                className="whitespace-nowrap"
                style={{
                  fontFamily: "'SF Pro Display', Inter, sans-serif",
                  fontWeight: 500,
                  fontSize: 14,
                  lineHeight: "17px",
                  color: "#111216",
                }}
              >
                {day}
              </span>
              )}
            </div>
          ))}
        </div>

        {/* Month/Week grid skeleton */}
        {loading &&
          Array.from({ length: 6 }).map((_, weekIdx) => (
            <div key={weekIdx} className="flex flex-row items-start flex-shrink-0 self-stretch">
              {Array.from({ length: 7 }).map((__, i) => {
                const isLastCol = i === 6;
                const isLastRow = weekIdx === 5;
                return (
                  <div
                    key={i}
                    className="box-border flex flex-col items-start flex-shrink-0"
                    style={{
                      padding: 16,
                      gap: 8,
                      width: "14.2857%",
                      height: 158,
                      borderWidth: isLastCol
                        ? isLastRow ? "0px" : "0px 0px 1px 0px"
                        : isLastRow ? "0px 1px 0px 0px" : "0px 1px 1px 0px",
                      borderStyle: "solid",
                      borderColor: "#E0E0E1",
                    }}
                  >
                    <Skeleton width={18} height={14} />
                    {(weekIdx + i) % 3 !== 0 && (
                      <div className="flex flex-col items-start w-full" style={{ gap: 4, marginTop: 8 }}>
                        <Skeleton width="100%" height={24} className="rounded" />
                        {(weekIdx + i) % 2 === 0 && <Skeleton width="100%" height={24} className="rounded" />}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

        {/* Month/Week grid */}
        {!loading && (view === "month" || view === "week" || view === "day") &&
          Array.from({ length: 6 }).map((_, weekIdx) => {
            const weekDays = calendarDays.slice(weekIdx * 7, weekIdx * 7 + 7);
            const isCurrentWeek = weekDays.some(
              (d) => d.date.toDateString() === currentDate.toDateString(),
            );
            const isOpenWeek = true;
            const rowHeight = 158;

            return (
            <div
              key={weekIdx}
              className="flex flex-row items-start flex-shrink-0 self-stretch"
              style={{ background: view === "week" && isCurrentWeek ? "#F5F8FF" : "transparent" }}
            >
              {weekDays.map((dayObj, i) => {
                const dateKey = dayObj.date.toDateString();
                const dayMeetings = visibleMeetings[dateKey] || [];
                const dayTasks = visibleTasks[dateKey] || [];
                const priorityRank = { high: 3, medium: 2, low: 1 };
                const allPriorities = dayTasks
                  .map((item) => item.priority?.toLowerCase())
                  .filter((p) => p && priorityRank[p]);
                const topPriority = allPriorities.length
                  ? allPriorities.reduce((a, b) => (priorityRank[b] > priorityRank[a] ? b : a))
                  : null;
                const priorityStyles = {
                  high: { bg: "#FAEBEB", color: "#CD3636", label: "High Priority" },
                  medium: { bg: "#FFF6E5", color: "#B77B00", label: "Medium Priority" },
                  low: { bg: "#EAF7EE", color: "#2E9E4F", label: "Low Priority" },
                };
                const cellMeetings = dayMeetings.slice(0, 2);
                const overflowCount = dayMeetings.length - cellMeetings.length;
                const cellTasks = dayTasks.slice(0, 2 - cellMeetings.length);
                const taskOverflowCount = dayTasks.length - cellTasks.length;
                const isLastCol = i === 6;
                const isLastRow = weekIdx === 5;

                return (
                  <div
                    key={i}
                    onClick={(e) => handleDayClick(e, dayObj.date)}
                    className="box-border flex flex-col items-start flex-shrink-0 cursor-pointer hover:bg-gray-50 transition-colors"
                    style={{
                      padding: 16,
                      gap: 8,
                      width: "14.2857%",
                      height: rowHeight,
                      borderWidth: isLastCol
                        ? isLastRow
                          ? "0px"
                          : "0px 0px 1px 0px"
                        : isLastRow
                          ? "0px 1px 0px 0px"
                          : "0px 1px 1px 0px",
                      borderStyle: "solid",
                      borderColor: "#E0E0E1",
                      opacity: dayObj.isCurrent ? 1 : 0.4,
                      background:
                        view === "day" && dateKey === currentDate.toDateString()
                          ? "#F5F8FF"
                          : "transparent",
                    }}
                  >
                    <div className="flex flex-row justify-between items-center w-full">
                      <span
                        style={{
                          fontFamily: "'SF Pro Display', Inter, sans-serif",
                          fontWeight: 500,
                          fontSize: 14,
                          lineHeight: "17px",
                          color: "#111216",
                        }}
                      >
                        {dayObj.date.getDate()}
                      </span>
                      {topPriority && (
                        <div
                          className="flex flex-row justify-center items-center"
                          style={{
                            padding: "2px 8px",
                            gap: 4,
                            background: priorityStyles[topPriority].bg,
                            borderRadius: 100,
                          }}
                        >
                          <span
                            className="whitespace-nowrap"
                            style={{
                              fontFamily: "'SF Pro Display', Inter, sans-serif",
                              fontWeight: 500,
                              fontSize: 12,
                              lineHeight: "18px",
                              color: priorityStyles[topPriority].color,
                            }}
                          >
                            {priorityStyles[topPriority].label}
                          </span>
                        </div>
                      )}
                    </div>

                    {isOpenWeek && (
                    <div className="flex flex-col items-start w-full" style={{ gap: 4 }}>
                      {cellMeetings.map((m) => (
                        <div
                          key={m._id}
                          // Opens the meeting panel. stopPropagation because
                          // the cell behind it opens the quick-add menu.
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEventClick(m, "meeting");
                          }}
                          className="box-border flex flex-row items-center justify-between w-full cursor-pointer hover:brightness-95 transition-all"
                          style={{
                            padding: "10px 8px",
                            height: 24,
                            background: "#E7EFFF",
                            border: "1px solid #E0E0E1",
                            borderRadius: 4,
                          }}
                        >
                          <span
                            className="truncate"
                            style={{
                              fontFamily: "Inter",
                              fontWeight: 500,
                              fontSize: 8,
                              letterSpacing: "-0.06em",
                              color: "#0952E7",
                            }}
                          >
                            <HighlightText text={m.title || "Meeting"} query={searchTerm} />
                          </span>
                          <span
                            className="whitespace-nowrap flex-shrink-0"
                            style={{
                              fontFamily: "Inter",
                              fontWeight: 500,
                              fontSize: 8,
                              letterSpacing: "-0.06em",
                              color: "#0952E7",
                            }}
                          >
                            {new Date(m.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      ))}
                      {cellTasks.map((t) => (
                        <div
                          key={t._id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEventClick(t, "task");
                          }}
                          className="box-border flex flex-row items-center justify-between w-full cursor-pointer hover:brightness-95 transition-all"
                          style={{
                            padding: "10px 8px",
                            height: 24,
                            background: "#E9F9EF",
                            border: "1px solid #E0E0E1",
                            borderRadius: 4,
                          }}
                        >
                          <span
                            className="truncate"
                            style={{
                              fontFamily: "Inter",
                              fontWeight: 500,
                              fontSize: 8,
                              letterSpacing: "-0.06em",
                              color: "#00913D",
                            }}
                          >
                            <HighlightText text={t.title || "Task"} query={searchTerm} />
                          </span>
                        </div>
                      ))}
                      {(overflowCount > 0 || taskOverflowCount > 0) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            // Stops the cell's own click, which opens the
                            // quick-add menu.
                            e.stopPropagation();
                            setDayDetail({
                              date: dayObj.date,
                              meetings: dayMeetings,
                              tasks: dayTasks,
                            });
                          }}
                          className="flex flex-row justify-center items-center hover:bg-[#E9EAEB] transition-colors"
                          style={{
                            padding: "2px 8px",
                            gap: 4,
                            background: "#F5F6F6",
                            borderRadius: 100,
                          }}
                        >
                          <span
                            style={{
                              fontFamily: "'SF Pro Display', Inter, sans-serif",
                              fontWeight: 500,
                              fontSize: 12,
                              lineHeight: "18px",
                              color: "#111216",
                            }}
                          >
                            +{overflowCount + taskOverflowCount} more
                          </span>
                        </button>
                      )}
                    </div>
                    )}
                  </div>
                );
              })}
            </div>
            );
          })}
      </div>

      {/* Everything on one day, opened from a cell's "+N more" — the cell
          itself only has room for two items. Same shape as the company
          calendar's day popup: meetings, then tasks, each row opening the
          item in the existing view modal. */}
      {dayDetail && (
        <div
          className="fixed inset-0 bg-black/20 flex items-center justify-center z-[10000] p-4"
          onClick={() => setDayDetail(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl p-4 w-full max-w-sm border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-gray-900">
                {dayDetail.date.toLocaleDateString(undefined, {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </h3>
              <button
                onClick={() => setDayDetail(null)}
                className="p-1 text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              <h4 className="text-xs font-medium text-gray-700 mb-2">
                Meetings ({dayDetail.meetings.length})
              </h4>
              {dayDetail.meetings.length === 0 ? (
                <p className="text-xs text-gray-500 mb-3">No meetings scheduled.</p>
              ) : (
                <div className="mb-3">
                  {dayDetail.meetings.map((m) => (
                    <div
                      key={m._id}
                      onClick={() => {
                        setDayDetail(null);
                        handleEventClick(m, "meeting");
                      }}
                      className="flex items-center gap-2 p-2 bg-gray-50 hover:bg-gray-100 rounded-md cursor-pointer text-sm mb-1"
                    >
                      <TeamIcon className="w-3 h-3 text-gray-600 flex-shrink-0" />
                      <span className="truncate flex-1">{m.title}</span>
                      {m.scheduledAt && (
                        <span className="text-[11px] text-gray-500 flex-shrink-0">
                          {new Date(m.scheduledAt).toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <h4 className="text-xs font-medium text-gray-700 mb-2">
                Tasks ({dayDetail.tasks.length})
              </h4>
              {dayDetail.tasks.length === 0 ? (
                <p className="text-xs text-gray-500">No tasks scheduled.</p>
              ) : (
                dayDetail.tasks.map((t) => (
                  <div
                    key={t._id}
                    onClick={() => {
                      setDayDetail(null);
                      handleEventClick(t, "task");
                    }}
                    className="flex items-center gap-2 p-2 bg-gray-50 hover:bg-gray-100 rounded-md cursor-pointer text-sm mb-1"
                  >
                    <CheckCircle2 className="w-3 h-3 text-gray-600 flex-shrink-0" />
                    <span className="truncate flex-1">{t.title}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Clicking any meeting or task — in a day cell, or in the "+N more"
          card — slides it in from the right. These are the same panels the
          Tasks page and the company calendar use, so an item looks identical
          wherever it's opened from. modalOpen/modalType/selectedItem already
          existed here, but nothing rendered them: clicking an event set the
          state and produced no visible result. */}
      <MeetingDetailsModal
        open={modalOpen && modalType === "meeting"}
        meetingData={selectedItem}
        users={users}
        onClose={() => setModalOpen(false)}
        onDelete={(id) => handleDelete(id, "meeting")}
      />
      <TaskDetailsModal
        open={modalOpen && modalType === "task"}
        taskData={selectedItem}
        users={users}
        onClose={() => setModalOpen(false)}
        onDelete={(id) => handleDelete(id, "task")}
      />
    </div>
  );
};

export default AdminCalendar;
