import DeleteIcon from "../common/DeleteIcon";
import Checkbox from "../common/Checkbox";
import PlusIcon from "../common/PlusIcon";
import SearchIcon from "../common/SearchIcon";
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import API from "../../services/api";
import toast from "react-hot-toast";
import {
  X,
  Clock,
  User,
  Users,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Save,
  Building,
  ChevronDown,
  CheckCircle2 as CheckIcon,
  Timer,
  Flag,
  User as UserIcon,
} from "lucide-react";
import EditIcon from "../common/EditIcon";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

// Compact searchable picker for Contact/Deal — a plain <select> with 15+
// options has no search and pops open as a tall, unstyled native list (see
// screenshot); this keeps the same pill trigger but opens a small card with
// a search box and a capped-height list instead. Anchored directly under its
// own trigger via plain absolute positioning (not a portal) so it always
// opens exactly where it visually belongs; a max-height + internal scroll
// keeps it from ever growing large enough to need repositioning.
const SearchableEntityDropdown = ({ options, value, onChange, displayKey, placeholder, disabled, onOpenChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = options.find((o) => o._id === value);
  const filtered = options.filter((o) =>
    (o[displayKey] || "").toLowerCase().includes(search.toLowerCase())
  );

  const popupRef = useRef(null);
  const wrapperRef = useRef(null);

  // While open, tell the form to add temporary bottom padding — otherwise a
  // dropdown on the last field has nowhere to scroll to and stays clipped.
  // Then scroll the popup itself (not the trigger) into view: "nearest"
  // moves the modal body by exactly enough to reveal the whole card.
  useEffect(() => {
    if (!isOpen) return;
    onOpenChange?.(true);
    const id = setTimeout(() => {
      popupRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 0);
    return () => {
      clearTimeout(id);
      onOpenChange?.(false);
    };
  }, [isOpen, onOpenChange]);

  // Close on outside click via a listener, not a fixed backdrop (a backdrop
  // would block scrolling the form while the dropdown is open).
  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [isOpen]);

  const toggle = () => {
    setIsOpen((v) => !v);
    if (isOpen) setSearch("");
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={toggle}
        className={`w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-left flex items-center justify-between gap-2 transition-all bg-white font-inter disabled:bg-gray-50 disabled:text-gray-400 ${disabled ? "cursor-not-allowed" : "cursor-pointer"} ${selected ? "text-[#1F2937]" : "text-[#1F2937] opacity-50"}`}
      >
        <span className="truncate">{selected ? selected[displayKey] : placeholder}</span>
        {!disabled && <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />}
      </button>

      {isOpen && (
        <>
          <div
            ref={popupRef}
            className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-gray-100 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in duration-200"
          >
            <div className="p-2 border-b border-gray-100">
              <div className="relative">
                <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search..."
                  className="w-full pl-8 pr-2 h-7 border border-gray-200 rounded-full text-[12px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
            {/* Exactly 4 rows visible (~30px each incl. padding), including
                "None" — scrolls internally past that instead of growing taller. */}
            <div className="max-h-[120px] overflow-y-auto py-1">
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setIsOpen(false);
                  setSearch("");
                }}
                className={`w-full text-left px-3 py-1.5 text-[12px] transition-colors hover:bg-gray-50 ${!value ? "bg-blue-50/50 text-blue-600" : "text-gray-600"}`}
              >
                None
              </button>
              {filtered.length === 0 ? (
                <p className="px-3 py-2 text-[12px] text-center text-gray-400">No results</p>
              ) : (
                filtered.map((o) => (
                  <button
                    key={o._id}
                    type="button"
                    onClick={() => {
                      onChange(o._id);
                      setIsOpen(false);
                      setSearch("");
                    }}
                    className={`w-full text-left px-3 py-1.5 text-[12px] truncate transition-colors hover:bg-gray-50 ${value === o._id ? "bg-blue-50/50 text-blue-600" : "text-gray-700"}`}
                  >
                    {o[displayKey]}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// Pill-shaped select, styled like QuickCompanyForm's CustomDropdown trigger
// (border, rounded-full, h-8, 12px text) instead of the colored badge this
// used to render as, so it reads as one more field in the form rather than a
// status chip. Anchored the same in-flow way as SearchableEntityDropdown.
const SingleSelectDropdown = ({ options, value, onChange, disabled, onOpenChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const popupRef = useRef(null);
  const wrapperRef = useRef(null);
  const selectedOption = options.find(opt => opt.value === value) || options[0];

  // See SearchableEntityDropdown above — opens scroll room, then scrolls
  // the opened card fully into view.
  useEffect(() => {
    if (!isOpen) return;
    onOpenChange?.(true);
    const id = setTimeout(() => {
      popupRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 0);
    return () => {
      clearTimeout(id);
      onOpenChange?.(false);
    };
  }, [isOpen, onOpenChange]);

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

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((v) => !v)}
        className={`w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-left flex items-center justify-between transition-all bg-white font-inter text-[#1F2937] disabled:bg-gray-50 disabled:text-gray-400 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
      >
        <div className="flex items-center gap-1.5">
          {selectedOption.icon && <selectedOption.icon className="w-3.5 h-3.5" />}
          <span className="capitalize">{selectedOption.label}</span>
        </div>
        {!disabled && <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />}
      </button>

      {isOpen && (
        <>
          <div
            ref={popupRef}
            className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-gray-100 rounded-xl shadow-xl z-50 py-1 max-h-[180px] overflow-y-auto animate-in fade-in zoom-in duration-200"
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-1.5 text-[13px] transition-colors hover:bg-gray-50 ${value === option.value ? 'bg-blue-50/50 text-blue-600' : 'text-gray-600'
                  }`}
              >
                <div className={`p-1.5 rounded-lg ${option.className} border-none`}>
                  {option.icon && <option.icon className="w-3.5 h-3.5" />}
                </div>
                <span className="font-medium text-left flex-1">{option.label}</span>
                {value === option.value && <CheckIcon className="w-4 h-4 ml-auto text-blue-600" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const initialState = {
  title: "",
  dueDate: "",
  selectedDate: "",
  description: "",
  status: "Pending",
  priority: "medium", // Added local priority
  users: [],
};

const StatusBadge = ({ status }) => {
  const configs = {
    Pending: {
      bg: "bg-amber-50",
      text: "text-amber-700",
      border: "border-amber-200",
      icon: <Clock className="w-3 h-3" />,
    },
    Completed: {
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      border: "border-emerald-200",
      icon: <CheckCircle2 className="w-3 h-3" />,
    },
  };

  const config = configs[status] || configs.Pending;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border ${config.bg} ${config.text} ${config.border}`}
    >
      {config.icon}
      {status}
    </div>
  );
};

const UserChip = ({ user, onRemove, isRemovable = false }) => (
  <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium border border-blue-200">
    <User className="w-3 h-3" />
    <span>{user?.name || user?.email || "Unknown User"}</span>
    {isRemovable && onRemove && (
      <button
        onClick={onRemove}
        className="hover:bg-blue-100 rounded-full p-0.5"
      >
        <X className="w-3 h-3" />
      </button>
    )}
  </div>
);

const FormField = ({ label, required, children, error, description }) => (
  <div className="space-y-2">
    <label className="block text-sm font-semibold text-gray-900">
      {label}
      {required && <span className="text-red-500 ml-1">*</span>}
    </label>
    {children}
    {description && <p className="text-xs text-gray-500">{description}</p>}
    {error && (
      <p className="text-xs text-red-600 flex items-center gap-1">
        <AlertCircle className="w-3 h-3" />
        {error}
      </p>
    )}
  </div>
);

const CompanyTaskForm = ({
  open,
  mode,
  taskData,
  companyId,
  contactId,
  dealId,
  calendarDate,
  users,
  onSave,
  onDelete,
  onClose,
  onUpdate,
  startInEditMode,
}) => {
  const [form, setForm] = useState(initialState);
  useBodyScrollLock(open);
  const [loading, setLoading] = useState(false);
  const [isSliding, setIsSliding] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [errors, setErrors] = useState({});
  const [showUserSelector, setShowUserSelector] = useState(false);
  const [userSelectorSearch, setUserSelectorSearch] = useState("");
  const assigneesFieldRef = useRef(null);
  const userSelectorPopupRef = useRef(null);
  // Extra scroll room is only added while a dropdown is actually open, so the
  // form doesn't sit with a big empty gap under its last field the rest of
  // the time. Counted rather than a boolean so overlapping open/close
  // transitions can't leave it stuck on.
  const [openDropdowns, setOpenDropdowns] = useState(0);
  const handleDropdownOpenChange = useCallback((open) => {
    setOpenDropdowns((n) => Math.max(0, n + (open ? 1 : -1)));
  }, []);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditMode, setIsEditMode] = useState(mode === "create");
  const [company, setCompany] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [deals, setDeals] = useState([]);
  const [relatedContactId, setRelatedContactId] = useState("");
  const [relatedDealId, setRelatedDealId] = useState("");

  const statusOptions = [
    { value: 'Pending', label: 'Pending', icon: Clock, className: 'bg-[#FDF3E6] text-[#EA9927]' },
    { value: 'Completed', label: 'Completed', icon: CheckIcon, className: 'bg-[#E6F7EF] text-[#1FA971]' },
    { value: 'In Progress', label: 'In Progress', icon: Loader2, className: 'bg-[#E6F8FD] text-[#27B4EA]' },
  ];

  const priorityOptions = [
    { value: 'low', label: 'Low', icon: Flag, className: 'bg-[#E6F7EF] text-[#1FA971]' },
    { value: 'medium', label: 'Medium', icon: Flag, className: 'bg-[#FDF3E6] text-[#EA9927]' },
    { value: 'high', label: 'High', icon: Flag, className: 'bg-[#FCEAEA] text-[#EA4B4B]' },
  ];

  const fetchCompanyDetails = async () => {
    if (!companyId) return;
    try {
      const res = await API.get(`/companies/${companyId}`);
      setCompany(res.data);
    } catch (error) {
      console.error("Error fetching company details:", error);
    }
  };

  const fetchRelatedOptions = async () => {
    if (!companyId) return;
    try {
      const [contactsRes, dealsRes] = await Promise.all([
        API.get("/contacts"),
        API.get("/deals"),
      ]);
      setContacts(contactsRes.data.filter((c) => c.company?._id === companyId));
      setDeals(dealsRes.data.filter((d) => d.company?._id === companyId));
    } catch (error) {
      console.error("Error fetching related contact/deal options:", error);
    }
  };

  useEffect(() => {
    if (open) {
      setShouldRender(true);
      setTimeout(() => setIsSliding(true), 10);
      fetchCompanyDetails();
      fetchRelatedOptions();

      if (taskData && mode === "view") {
        setForm({
          ...taskData,
          dueDate: taskData.dueDate
            ? new Date(taskData.dueDate).toISOString().split("T")[0]
            : "",
          selectedDate: taskData.selectedDate
            ? new Date(taskData.selectedDate).toISOString().split("T")[0]
            : "",
          users: taskData.users?.map((u) => u._id || u) || [],
          priority: taskData.priority || "medium",
        });
        const existingContact = taskData.relatedEntities?.find((e) => e.entityModel === "Contact");
        const existingDeal = taskData.relatedEntities?.find((e) => e.entityModel === "Deal");
        setRelatedContactId(existingContact?.entityId?._id || existingContact?.entityId || "");
        setRelatedDealId(existingDeal?.entityId?._id || existingDeal?.entityId || "");
      } else {
        setForm({
          ...initialState,
          selectedDate: calendarDate,
        });
        // Preselect the contact/deal this task is being created for, when the
        // caller opened the form from a specific contact/deal context.
        setRelatedContactId(contactId || "");
        setRelatedDealId(dealId || "");
      }
      setErrors({});
      setIsEditMode(mode === "create" || !!startInEditMode);
    } else {
      setIsSliding(false);
      setTimeout(() => setShouldRender(false), 300);
      setShowUserSelector(false);
    }
  }, [open, mode, taskData, calendarDate, companyId, startInEditMode]);

  // Lock the page behind the backdrop so it can't be scrolled while this
  // overlay is open.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // The Assignees list opens DOWNWARD. When it opens — and after each
  // select/deselect, since picking a user grows the avatar row and pushes the
  // list down — scroll the form body just enough that the WHOLE panel (all the
  // available users) sits above the sticky footer. Only scrolls when part of it
  // is actually hidden, so there's no jump when it's already visible.
  useEffect(() => {
    if (!showUserSelector) {
      setUserSelectorSearch("");
      return;
    }
    requestAnimationFrame(() => {
      const el = userSelectorPopupRef.current;
      if (!el) return;
      let scroller = el.parentElement;
      while (scroller && scroller.scrollHeight <= scroller.clientHeight) {
        scroller = scroller.parentElement;
      }
      if (!scroller) return;
      const overflow = el.getBoundingClientRect().bottom - scroller.getBoundingClientRect().bottom;
      if (overflow > 0) scroller.scrollBy({ top: overflow + 12, behavior: "smooth" });
    });
  }, [showUserSelector, form.users]);

  // Close the Assignees list on outside click via a listener, not a fixed
  // backdrop (which would block scrolling the form while it's open).
  useEffect(() => {
    if (!showUserSelector) return;
    const onDown = (e) => {
      if (assigneesFieldRef.current && !assigneesFieldRef.current.contains(e.target)) {
        setShowUserSelector(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showUserSelector]);

  // A selected deal has one contact, so the Contact field is fixed to it.
  const selectedDealContactId = useMemo(() => {
    const d = deals.find((x) => String(x._id) === String(relatedDealId));
    return d ? String(d.contact?._id || d.contact || "") : "";
  }, [deals, relatedDealId]);

  useEffect(() => {
    if (
      relatedDealId &&
      selectedDealContactId &&
      relatedContactId !== selectedDealContactId
    ) {
      setRelatedContactId(selectedDealContactId);
    }
  }, [relatedDealId, selectedDealContactId, relatedContactId]);

  const handleChange = (key, val) => {
    setForm((f) => ({ ...f, [key]: val }));
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: null }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!form.title?.trim()) newErrors.title = "Please enter a task title.";
    if (!form.dueDate) newErrors.dueDate = "Please choose a due date.";
    if (!calendarDate && !form.selectedDate)
      newErrors.selectedDate = "Please pick a date for the task.";

    setErrors(newErrors);
    return newErrors;
  };

  const handleUserSelection = (userId) => {
    const currentUsers = form.users || [];
    if (currentUsers.includes(userId)) {
      setForm((f) => ({
        ...f,
        users: currentUsers.filter((id) => id !== userId),
      }));
    } else {
      setForm((f) => ({
        ...f,
        users: [...currentUsers, userId],
      }));
    }
  };

  const removeUser = (userId) => {
    setForm((f) => ({
      ...f,
      users: f.users.filter((id) => id !== userId),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      toast.error(Object.values(validationErrors)[0]);
      return;
    }

    setLoading(true);

    try {
      const createLocalDate = (dateString) => {
        if (!dateString) return null;
        const [year, month, day] = dateString.split("-");
        // Create date at noon UTC to avoid timezone issues
        return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      };

      // Convert to new relatedEntities array format
      const relatedEntities = [];
      if (companyId) {
        relatedEntities.push({ entityModel: "Company", entityId: companyId });
      }
      // On the contact page the contact is the task's subject, so it stays
      // linked whatever the picker says — the contact-scoped list matches on
      // this entry, and a task saved without it would vanish from the tab.
      const linkedContactId = relatedContactId || contactId;
      if (linkedContactId) {
        relatedEntities.push({ entityModel: "Contact", entityId: linkedContactId });
      }
      // Same reasoning as the contact above: on a deal's own tab the deal is
      // the task's subject and the deal-scoped list matches on this entry.
      const linkedDealId = relatedDealId || dealId;
      if (linkedDealId) {
        relatedEntities.push({ entityModel: "Deal", entityId: linkedDealId });
      }

      const payload = {
        title: form.title,
        description: form.description,
        status: form.status,
        priority: form.priority, // Added to payload
        users: form.users,
        dueDate: createLocalDate(form.dueDate),
        selectedDate: calendarDate || createLocalDate(form.selectedDate),
        relatedEntities,
      };

      if (isEditMode && mode === "view") {
        await API.put(`/tasks/${taskData._id}`, payload);
        onUpdate();
        toast.success("Task updated successfully");
      } else {
        // Create toast is shown by the parent's onSave handler — don't
        // duplicate it here.
        await onSave(payload);
      }
      onClose();
    } catch (err) {
      console.error("Error saving task:", err);
      const errorMessage =
        err.response?.data?.error ||
        (isEditMode && mode === "view"
          ? "Failed to update task"
          : "Failed to save task");
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

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

  if (!shouldRender) return null;

  const assignedUsers =
    form.users
      ?.map((userId) => users?.find((u) => u._id === userId))
      .filter(Boolean) || [];

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[10000] transition-all duration-300"
        style={{ opacity: isSliding ? 1 : 0 }}
        onClick={onClose}
      />
      <div
        className={`fixed dc-panel-card dc-panel-w z-[10001] bg-white shadow-2xl transform transition-transform duration-300 ease-out overflow-hidden ${
          isSliding ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"
        }`}
      >
        <form onSubmit={handleSubmit} className="flex flex-col h-full min-h-0">
          {/* Sticky header — matches the CompanyForm header spec */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#D9D9D9] flex-shrink-0 bg-white gap-1">
            <h2 className="text-[15px] font-normal leading-6 text-[#78788D] uppercase tracking-wide">
              {mode === "view" ? "Edit Task" : "Add New Task"}
            </h2>
            <button
              type="button"
              onClick={onClose}
              title="Close"
              className="w-5 h-5 flex items-center justify-center text-[#1C1B1F] hover:opacity-70 transition-opacity"
              aria-label="Close"
            >
              <X className="w-[18px] h-[18px]" strokeWidth={2} />
            </button>
          </div>

          {/* Scrollable body */}
          {/* The extra bottom padding only appears while a dropdown is open,
              giving it somewhere to scroll to; otherwise the form would sit
              with a large empty gap under its last field. */}
          <div
            className={`flex-1 min-h-0 overflow-y-auto px-8 pt-6 space-y-6 ${
              openDropdowns > 0 || showUserSelector ? "pb-52" : "pb-6"
            }`}
          >
            <div>
              <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Task Title <span className="text-[#FF4935]">*</span>
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => handleChange("title", e.target.value)}
                className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50 disabled:bg-gray-50 disabled:text-gray-400"
                placeholder="Enter Task Title"
                disabled={!isEditMode && mode === "view"}
              />
              {errors.title && <p className="text-[12px] text-[#FF4935] font-medium mt-1.5">{errors.title}</p>}
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Description
              </label>
              <textarea
                value={form.description}
                onChange={(e) => handleChange("description", e.target.value)}
                rows={4}
                className="w-full border border-[#1F2937]/10 rounded-2xl px-3 py-2 text-[12px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all font-inter resize-vertical disabled:bg-gray-50 disabled:text-gray-400 placeholder:text-[#1F2937] placeholder:opacity-50"
                placeholder="Describe the task objectives, requirements and important details"
                disabled={!isEditMode && mode === "view"}
              />
            </div>

            <div>
              <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Related to
              </label>
              <div className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] flex items-center gap-2 bg-gray-50 text-[12px] text-[#1F2937]">
                <Building className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span className="truncate">{company?.name || "Company Name"}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                  Contact
                </label>
                {dealId ? (
                  // Deal page: contact is fixed to the deal's contact (or none).
                  <div className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] flex items-center bg-gray-50 text-[13px] text-[#1F2937]">
                    <span className="truncate">
                      {(selectedDealContactId &&
                        contacts.find((c) => String(c._id) === selectedDealContactId)?.name) ||
                        "No contact"}
                    </span>
                  </div>
                ) : (
                  <SearchableEntityDropdown
                    // With a deal selected, only that deal's contact is offered
                    // (empty if the deal has none) — never the whole company list.
                    options={
                      relatedDealId
                        ? contacts.filter((c) => String(c._id) === selectedDealContactId)
                        : contacts
                    }
                    value={relatedContactId}
                    onChange={(val) => {
                      // Changing the contact re-scopes the Deal list.
                      setRelatedContactId(val);
                      setRelatedDealId("");
                    }}
                    displayKey="name"
                    placeholder="None"
                    disabled={!isEditMode && mode === "view"}
                    onOpenChange={handleDropdownOpenChange}
                  />
                )}
              </div>

              <div>
                <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                  Deal
                </label>
                {dealId ? (
                  // Deal page: the deal is fixed to this page's deal.
                  <div className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] flex items-center bg-gray-50 text-[13px] text-[#1F2937]">
                    <span className="truncate">
                      {deals.find((d) => String(d._id) === String(dealId))?.title ||
                        deals.find((d) => String(d._id) === String(dealId))?.name ||
                        "Deal"}
                    </span>
                  </div>
                ) : (
                  <SearchableEntityDropdown
                    // Only the selected contact's deals are offered; with no
                    // contact chosen, all of the company's deals are available.
                    options={(relatedContactId
                      ? deals.filter((d) => String(d.contact?._id || d.contact || "") === String(relatedContactId))
                      : deals
                    ).map((d) => ({ ...d, _displayTitle: d.title || d.name }))}
                    value={relatedDealId}
                    onChange={setRelatedDealId}
                    displayKey="_displayTitle"
                    placeholder="None"
                    disabled={!isEditMode && mode === "view"}
                    onOpenChange={handleDropdownOpenChange}
                  />
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                  Selected Date
                </label>
                <input
                  type="date"
                  value={form.selectedDate || calendarDate || ""}
                  onChange={(e) => handleChange("selectedDate", e.target.value)}
                  disabled={!isEditMode && mode === "view"}
                  className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all disabled:bg-gray-50 disabled:text-gray-400"
                />
              </div>

              <div>
                <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                  Due Date
                </label>
                <input
                  type="date"
                  value={form.dueDate}
                  min={form.selectedDate || calendarDate || ""}
                  onChange={(e) => handleChange("dueDate", e.target.value)}
                  disabled={!isEditMode && mode === "view"}
                  className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all disabled:bg-gray-50 disabled:text-gray-400"
                />
                {errors.dueDate && <p className="text-[12px] text-[#FF4935] font-medium mt-1.5">{errors.dueDate}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="flex items-center gap-1.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                  <Timer className="w-3.5 h-3.5" />
                  Status
                </label>
                <SingleSelectDropdown
                  options={statusOptions}
                  value={form.status}
                  onChange={(val) => handleChange("status", val)}
                  disabled={!isEditMode && mode === "view"}
                  onOpenChange={handleDropdownOpenChange}
                />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                  <Flag className="w-3.5 h-3.5" />
                  Priority
                </label>
                <SingleSelectDropdown
                  options={priorityOptions}
                  value={form.priority}
                  onChange={(val) => handleChange("priority", val)}
                  disabled={!isEditMode && mode === "view"}
                  onOpenChange={handleDropdownOpenChange}
                />
              </div>
            </div>

            <div ref={assigneesFieldRef}>
              <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Assignees
              </label>
              <div className="space-y-2 relative">
                {assignedUsers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {assignedUsers.map(user => (
                      <div key={user._id} className="w-7 h-7 rounded-full overflow-hidden border-2 border-white ring-1 ring-gray-100 flex items-center justify-center bg-gray-100" title={user.name}>
                        <UserIcon className="w-3.5 h-3.5 text-gray-400" />
                      </div>
                    ))}
                  </div>
                )}

                {isEditMode && (
                  <button
                    type="button"
                    onClick={() => setShowUserSelector(!showUserSelector)}
                    className="w-full flex items-center justify-between border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] bg-white hover:bg-gray-50 transition-colors focus:outline-none"
                  >
                    <span className="text-[#1F2937] opacity-50">
                      {form.users?.length ? `${form.users.length} selected` : "Select Users"}
                    </span>
                    <PlusIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </button>
                )}

                {showUserSelector && (
                  <>
                    <div ref={userSelectorPopupRef} className="absolute z-50 left-0 right-0 top-full mt-1.5 bg-white border border-gray-100 rounded-xl shadow-xl overflow-hidden animate-in fade-in duration-150">
                      <div className="p-2 border-b border-gray-100">
                        <div className="relative">
                          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <input
                            type="text"
                            autoFocus
                            value={userSelectorSearch}
                            onChange={(e) => setUserSelectorSearch(e.target.value)}
                            placeholder="Search users..."
                            className="w-full pl-8 pr-2 h-7 border border-gray-200 rounded-full text-[12px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      <div className="max-h-40 overflow-y-auto p-1">
                        {(users || [])
                          .filter((user) =>
                            (user.name || user.email || "")
                              .toLowerCase()
                              .includes(userSelectorSearch.toLowerCase())
                          )
                          .map((user) => (
                            <label
                              key={user._id}
                              className="flex items-center gap-2.5 px-2 py-1.5 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors"
                            >
                              <Checkbox checked={form.users?.includes(user._id)} onChange={() => handleUserSelection(user._id)} />
                              <span className="text-[12px] font-medium text-[#1F2937] truncate">{user.name || user.email}</span>
                            </label>
                          ))}
                        {(users || []).filter((user) =>
                          (user.name || user.email || "")
                            .toLowerCase()
                            .includes(userSelectorSearch.toLowerCase())
                        ).length === 0 && (
                          <p className="px-3 py-2 text-[12px] text-center text-gray-400">No results</p>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Sticky footer — matches the CompanyForm footer spec */}
          <div className="flex-shrink-0 py-2.5 px-4 border-t border-gray-100 bg-white flex items-center justify-end gap-3">
            {mode === "view" && onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="mr-auto w-8 h-8 flex items-center justify-center text-[#DF120B] hover:bg-red-50 rounded-full transition-colors disabled:opacity-50"
                title="Delete Task"
              >
                <DeleteIcon className="w-4 h-4" />
              </button>
            )}

            {!isEditMode && mode === "view" && (
              <button
                type="button"
                onClick={() => setIsEditMode(true)}
                className="w-8 h-8 flex items-center justify-center text-[#1F2937] hover:bg-gray-100 rounded-full transition-colors"
                title="Edit Task"
              >
                <EditIcon className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-gray-200 text-gray-700 rounded-[25px] text-sm font-bold hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>

            {isEditMode && (
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-[#158FFF] text-white rounded-[25px] text-sm font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Saving..." : mode === "create" ? "Create Task" : "Update Task"}
              </button>
            )}
          </div>
        </form>
      </div>
    </>
  );
};

export { StatusBadge, UserChip };
export default CompanyTaskForm;
