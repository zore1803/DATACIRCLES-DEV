import Checkbox from "../common/Checkbox";
import PlusIcon from "../common/PlusIcon";
import React, { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import API from "../../services/api";
import toast from "react-hot-toast";
import SearchIcon from "../common/SearchIcon";
import {
  X,
  Clock,
  Users,
  Building,
  Building2,
  Truck,
  Briefcase,
  Loader2,
  Save,
  Timer,
  Flag,
  ChevronDown,
  CheckCircle2 as CheckIcon,
  User as UserIcon,
} from "lucide-react";
import QuickCompanyForm from "../company/QuickCompanyForm";
import QuickContactForm from "../contact/QuickContactForm";
import QuickDealForm from "../deal/QuickDealForm";
import QuickVendorForm from "../vendor/QuickVendorForm";
import { useSystemSettings } from "../../hooks/useSystemSettings";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";
import CustomFieldsSection, { getMissingRequiredFields } from "../common/CustomFieldsSection";

// isOpen/onOpenChange are controlled by the parent form (a single shared
// "which dropdown is open" key) rather than each instance owning its own
// state — otherwise opening Status doesn't close Priority, and their option
// lists render stacked on top of each other.
// Native <select> in a pill, so Status / Priority / Related To match the
// Category and Priority fields on the meeting form.
const SingleSelectDropdown = ({ options, value, onChange, disabled }) => (
  <div className="relative">
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full appearance-none border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] font-medium text-[#1F2937] bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
    {!disabled && (
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#1F2937] opacity-50" />
    )}
  </div>
);

// Compact searchable picker for the linked record, styled as a right-aligned
// pill so it sits in the same meta-row rhythm as Status / Priority rather
// than being a full-width labelled field.
const EntityPickerDropdown = ({ entities, value, onChange, entityLabel, displayKey, isOpen, onOpenChange }) => {
  const [searchTerm, setSearchTerm] = useState("");

  const selected = entities.find((e) => e._id === value);
  const filtered = entities.filter((e) =>
    (e[displayKey] || e.name || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!isOpen)}
        className="w-full flex items-center justify-between gap-2 px-3 h-[38px] rounded-full text-[13px] font-medium focus:outline-none transition-all border border-[#1F2937]/10 bg-white cursor-pointer"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`truncate ${selected ? "text-[#1F2937]" : "text-[#1F2937] opacity-50"}`}>
            {selected ? selected[displayKey] || selected.name : `Select ${entityLabel}`}
          </span>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 text-[#1F2937] opacity-50 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-[10040]" onClick={() => onOpenChange(false)} />
          <div className="absolute left-0 right-0 mt-2 w-full bg-white border border-gray-100 rounded-xl shadow-xl z-[10050] animate-in fade-in zoom-in duration-200">
            <div className="p-2 border-b border-gray-100">
              <div className="relative">
                <SearchIcon className="absolute left-3 -translate-y-1/2 top-1/2 w-4 h-4 text-[#525866]" />
                <input
                  type="text"
                  autoFocus
                  placeholder={`Search ${entityLabel.toLowerCase()}...`}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="max-h-40 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <p className="px-4 py-3 text-xs text-center text-gray-400">
                  No {entityLabel.toLowerCase()} found
                </p>
              ) : (
                filtered.map((entity) => (
                  <button
                    key={entity._id}
                    type="button"
                    onClick={() => {
                      onChange(entity._id);
                      onOpenChange(false);
                      setSearchTerm("");
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] transition-colors hover:bg-gray-50 ${value === entity._id ? "bg-blue-50/50 text-blue-600" : "text-gray-600"}`}
                  >
                    <span className="font-medium truncate">{entity[displayKey] || entity.name}</span>
                    {value === entity._id && <CheckIcon className="w-3.5 h-3.5 ml-auto text-blue-600 flex-shrink-0" />}
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

const QuickTaskForm = ({
  companies,
  contacts,
  onTaskCreated,
  onTaskUpdated,
  onRequestClose,
  editTask = null,
  initialDueDate = "",
}) => {
  const isEditing = !!editTask;
  const [form, setForm] = useState({
    title: "",
    dueDate: initialDueDate,
    selectedDate: initialDueDate,
    description: "",
    status: "Pending",
    priority: "medium",
    relationModel: "Company",
    relatedTo: "",
    users: [],
    additionalFields: [],
  });
  const [deals, setDeals] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [users, setUsers] = useState([]);
  // Org's TaskFields definitions — drives the Custom Fields section below.
  const [taskFieldDefs, setTaskFieldDefs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [shouldRender, setShouldRender] = useState(true);
  const [isFormDirty, setIsFormDirty] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  // Which of the Related To / entity / Status / Priority dropdowns is open,
  // if any — shared so opening one closes the others.
  const [openDropdown, setOpenDropdown] = useState(null);
  const [showUserSelector, setShowUserSelector] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [showQuickCompanyForm, setShowQuickCompanyForm] = useState(false);
  const [showQuickContactForm, setShowQuickContactForm] = useState(false);
  const [showQuickDealsForm, setShowQuickDealsForm] = useState(false);
  const [showQuickVendorForm, setShowQuickVendorForm] = useState(false);
  const [localCompanies, setLocalCompanies] = useState(companies);
  const [localContacts, setLocalContacts] = useState(contacts);
  const [validationErrors, setValidationErrors] = useState({});
  const titleInputRef = useRef(null);
  const relatedToRef = useRef(null);
  const usersRef = useRef(null);
  const selectedDateRef = useRef(null);
  const dueDateRef = useRef(null);

  const { taskStatuses } = useSystemSettings();
  useBodyScrollLock(isOpen);

  const statusOptions = taskStatuses.map(status => {
    if (status === "Pending") return { value: "Pending", label: "Pending", icon: Clock, className: "bg-[#FDF3E6] text-[#EA9927]" };
    if (status === "In Progress") return { value: "In Progress", label: "In Progress", icon: Loader2, className: "bg-[#E6F8FD] text-[#27B4EA]" };
    if (status === "Completed") return { value: "Completed", label: "Completed", icon: CheckIcon, className: "bg-[#E6F7EF] text-[#1FA971]" };
    return { value: status, label: status, icon: Clock, className: "bg-[#EEF2F9] text-[#56698A]" };
  });

  const priorityOptions = [
    { value: "low", label: "Low", icon: Flag, className: "bg-[#E6F7EF] text-[#1FA971]" },
    { value: "medium", label: "Medium", icon: Flag, className: "bg-[#FDF3E6] text-[#EA9927]" },
    { value: "high", label: "High", icon: Flag, className: "bg-[#FCEAEA] text-[#EA4B4B]" },
  ];

  const relationOptions = [
    { value: "Company", label: "Company", icon: Building2, className: "bg-cyan-50 text-cyan-600" },
    { value: "Contact", label: "Contact", icon: UserIcon, className: "bg-blue-50 text-blue-600" },
    { value: "Deal", label: "Deal", icon: Briefcase, className: "bg-indigo-50 text-indigo-600" },
    { value: "Vendor", label: "Vendor", icon: Truck, className: "bg-purple-50 text-purple-600" },
  ];

  useEffect(() => {
    setShouldRender(true);
    setTimeout(() => setIsOpen(true), 10);
    fetchData();
    setLocalCompanies(companies);
    setLocalContacts(
      contacts.map((contact) => ({
        ...contact,
        displayName: `${contact.name} (${contact.company?.name || "No Company"})`,
      }))
    );
    return () => {
      setIsOpen(false);
    };
  }, [companies, contacts]);

  // Pre-fill when editing so edit and create share one form.
  useEffect(() => {
    if (!editTask) return;
    const rel = (editTask.relatedEntities && editTask.relatedEntities[0]) || {};
    setForm({
      title: editTask.title || "",
      dueDate: editTask.dueDate ? new Date(editTask.dueDate).toISOString().slice(0, 10) : "",
      selectedDate: editTask.selectedDate ? new Date(editTask.selectedDate).toISOString().slice(0, 10) : "",
      description: editTask.description || "",
      status: editTask.status || "Pending",
      priority: editTask.priority || "medium",
      relationModel: rel.entityModel || "Company",
      relatedTo: rel.entityId?._id || rel.entityId || "",
      users: (editTask.users || []).map((u) => u._id || u),
      additionalFields: editTask.additionalFields || [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editTask]);

  const fetchData = async () => {
    try {
      const [dealsRes, vendorsRes, usersRes] = await Promise.all([
        API.get("/deals"),
        API.get("/vendors"),
        API.get("/auth/all-user"),
      ]);
      setDeals(dealsRes.data);
      setVendors(vendorsRes.data);
      setUsers(usersRes.data.allUsers);
    } catch (err) {
      console.error("Failed to fetch data:", err);
      toast.error("Failed to fetch task-related data");
    }
    try {
      const fieldsRes = await API.get("/task-fields");
      setTaskFieldDefs(fieldsRes.data?.fields || []);
    } catch {
      setTaskFieldDefs([]);
    }
  };

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
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // Switching the related type invalidates whichever record was picked.
      if (key === "relationModel") next.relatedTo = "";
      return next;
    });
    setIsFormDirty(true);

    if (validationErrors[key]) {
      setValidationErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[key];
        return newErrors;
      });
    }
    if (key === "relationModel" && validationErrors.relatedTo) {
      setValidationErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors.relatedTo;
        return newErrors;
      });
    }
  };

  const handleUserSelection = (userId) => {
    const currentUsers = form.users || [];
    setForm({
      ...form,
      users: currentUsers.includes(userId)
        ? currentUsers.filter((id) => id !== userId)
        : [...currentUsers, userId],
    });
    setIsFormDirty(true);

    if (validationErrors.users) {
      setValidationErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors.users;
        return newErrors;
      });
    }
  };

  const handleCompanyCreated = (newCompany) => {
    setLocalCompanies((prev) => [...prev, newCompany]);
    handleFormChange("relatedTo", newCompany._id);
    setShowQuickCompanyForm(false);
  };

  const handleContactCreated = (newContact) => {
    setLocalContacts((prev) => [
      ...prev,
      { ...newContact, displayName: `${newContact.name} (${newContact.company?.name || "No Company"})` },
    ]);
    handleFormChange("relatedTo", newContact._id);
    setShowQuickContactForm(false);
  };

  const handleDealCreated = (newDeal) => {
    setDeals((prev) => [...prev, newDeal]);
    handleFormChange("relatedTo", newDeal._id);
    setShowQuickDealsForm(false);
  };

  const handleVendorCreated = (newVendor) => {
    setVendors((prev) => [...prev, newVendor]);
    handleFormChange("relatedTo", newVendor._id);
    setShowQuickVendorForm(false);
  };

  const openQuickCreate = () => {
    if (form.relationModel === "Company") setShowQuickCompanyForm(true);
    else if (form.relationModel === "Contact") setShowQuickContactForm(true);
    else if (form.relationModel === "Deal") setShowQuickDealsForm(true);
    else if (form.relationModel === "Vendor") setShowQuickVendorForm(true);
  };

  const getOptions = () => {
    const map = {
      Company: localCompanies,
      Contact: localContacts,
      Deal: deals,
      Vendor: vendors,
    };
    return map[form.relationModel] || [];
  };

  const getDisplayKey = () => {
    if (form.relationModel === "Deal") return "title";
    if (form.relationModel === "Contact") return "displayName";
    return "name";
  };

  const filteredUsers = users.filter(
    (user) =>
      user.name?.toLowerCase().includes(userSearch.toLowerCase()) ||
      user.email?.toLowerCase().includes(userSearch.toLowerCase())
  );

  const assignedUsers = form.users?.map((id) => users.find((u) => u._id === id)).filter(Boolean) || [];

  const validateForm = () => {
    const errors = {};
    if (!form.title || !form.title.trim()) {
      errors.title = "Task title is required";
    }
    if (!form.users || form.users.length === 0) {
      errors.users = "At least one user must be assigned to this task";
    }
    if (form.relationModel && !form.relatedTo) {
      errors.relatedTo = `Please select a ${form.relationModel.toLowerCase()}`;
    }
    if (!form.selectedDate) {
      errors.selectedDate = "Selected date is required";
    }
    if (!form.dueDate) {
      errors.dueDate = "Due date is required";
    }
    Object.assign(errors, getMissingRequiredFields(taskFieldDefs, form.additionalFields, isEditing));
    return errors;
  };

  const handleSubmit = async (e, isSaveAndExit = false) => {
    e.preventDefault();

    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      toast.error("Please fill in all required fields");

      const candidates = [
        errors.title ? titleInputRef.current : null,
        errors.relatedTo ? relatedToRef.current : null,
        errors.selectedDate ? selectedDateRef.current : null,
        errors.dueDate ? dueDateRef.current : null,
        errors.users ? usersRef.current : null,
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

    // Dates are entered as plain YYYY-MM-DD. Pinning them to noon UTC keeps
    // them on the intended day regardless of the viewer's timezone, instead
    // of drifting a day earlier for anyone behind UTC.
    const createLocalDate = (dateString) => {
      if (!dateString) return null;
      const [year, month, day] = dateString.split("-");
      return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    };

    try {
      setLoading(true);
      const payload = {
        title: form.title,
        description: form.description,
        status: form.status,
        priority: form.priority,
        users: form.users,
        dueDate: createLocalDate(form.dueDate),
        selectedDate: createLocalDate(form.selectedDate || form.dueDate),
        // The API takes a relatedEntities array — posting the raw
        // relationModel/relatedTo pair the form tracks internally gets
        // rejected by createTask's "at least one related entity" check.
        relatedEntities: [{ entityModel: form.relationModel, entityId: form.relatedTo }],
        additionalFields: form.additionalFields,
      };

      const res = isEditing
        ? await API.put(`/tasks/${editTask._id}`, payload)
        : await API.post("/tasks", payload);
      toast.success(isEditing ? "Task updated successfully!" : "Task added successfully!");
      const cb = isEditing ? onTaskUpdated || onTaskCreated : onTaskCreated;
      if (cb && res.data) {
        cb(res.data);
      }
      setIsFormDirty(false);
      closeForm();
    } catch (err) {
      let errorMessage = "Failed to add task. Please try again.";
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
          errorMessage = "Subscription expired. Please renew to add tasks.";
        } else if (errorMessage.includes("Write access to tasks not allowed")) {
          errorMessage = "Your plan does not allow adding tasks. Please upgrade your plan.";
        }
      } else if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      }
      toast.error(errorMessage);
      if (!isSaveAndExit) closeForm();
    } finally {
      setLoading(false);
    }
  };

  if (!shouldRender) return null;

  return createPortal(
    <>
      {/* QuickCompanyForm Modal */}
      {showQuickCompanyForm && (
        <QuickCompanyForm
          onCompanyCreated={handleCompanyCreated}
          onRequestClose={() => setShowQuickCompanyForm(false)}
        />
      )}

      {/* QuickContactForm Modal */}
      {showQuickContactForm && (
        <QuickContactForm
          companies={localCompanies}
          onContactCreated={handleContactCreated}
          onRequestClose={() => setShowQuickContactForm(false)}
        />
      )}

      {/* QuickDealsForm Modal */}
      {showQuickDealsForm && (
        <QuickDealForm
          companies={localCompanies}
          contacts={localContacts}
          onDealCreated={handleDealCreated}
          onRequestClose={() => setShowQuickDealsForm(false)}
        />
      )}

      {/* QuickVendorForm Modal */}
      {showQuickVendorForm && (
        <QuickVendorForm
          onVendorCreated={handleVendorCreated}
          onRequestClose={() => setShowQuickVendorForm(false)}
        />
      )}

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black/50 z-[10004] flex items-center justify-center">
          <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-sm sm:max-w-lg mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Unsaved Changes</h3>
            <p className="text-sm text-gray-600 mb-6">
              You have unsaved changes. Are you sure you want to exit without saving?
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
        className={`fixed dc-panel-card z-[10001] dc-panel-w bg-white shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out font-inter ${
          isOpen ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"
        }`}
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#D9D9D9] flex-shrink-0 bg-white gap-1">
            <h2 className="text-[15px] font-normal leading-6 text-[#78788D] uppercase tracking-wide">
              {isEditing ? "Edit Task" : "Add New Task"}
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

          {/* Form Body */}
          <div className="flex-1 overflow-y-auto">
            <form onSubmit={handleSubmit} noValidate className="flex flex-col h-full">
              {/* Content */}
              <div className="px-8 py-6 space-y-6">
                <div ref={titleInputRef}>
                  <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                    Task Title <span className="text-[#FF4935]">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => handleFormChange("title", e.target.value)}
                    className={`w-full border rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 transition-all placeholder:text-[#1F2937] placeholder:opacity-50 font-inter ${validationErrors.title ? "border-red-500 focus:ring-red-500" : "border-[#1F2937]/10 focus:ring-blue-500"
                      }`}
                    placeholder="Enter Task Title"
                  />
                  {validationErrors.title && (
                    <p className="text-red-500 text-xs mt-1 font-inter">{validationErrors.title}</p>
                  )}
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                    Description
                  </label>
                  <textarea
                    value={form.description}
                    onChange={(e) => handleFormChange("description", e.target.value)}
                    rows={4}
                    className="w-full border border-[#1F2937]/10 rounded-2xl px-3 py-2 text-[12px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50 resize-none"
                    placeholder="Describe the task objectives, requirements and important details"
                  />
                </div>

                {/* Related to (entity type) */}
                <div>
                  <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                    Related To
                  </label>
                  <SingleSelectDropdown
                    options={relationOptions}
                    value={form.relationModel}
                    onChange={(val) => handleFormChange("relationModel", val)}
                    isOpen={openDropdown === "relationModel"}
                    onOpenChange={(open) => setOpenDropdown(open ? "relationModel" : null)}
                  />
                </div>

                {/* The record itself, with a quick-create shortcut */}
                <div ref={relatedToRef}>
                  <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                    {form.relationModel}
                  </label>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <EntityPickerDropdown
                        entities={getOptions()}
                        value={form.relatedTo}
                        onChange={(val) => handleFormChange("relatedTo", val)}
                        entityLabel={form.relationModel}
                        displayKey={getDisplayKey()}
                        isOpen={openDropdown === "entity"}
                        onOpenChange={(open) => setOpenDropdown(open ? "entity" : null)}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={openQuickCreate}
                      title={`Add New ${form.relationModel}`}
                      className="flex-shrink-0 w-[38px] h-[38px] rounded-full bg-[#158FFF] border border-[#1F2937]/10 flex items-center justify-center hover:opacity-90 transition-opacity"
                    >
                      <PlusIcon className="w-4 h-4 text-white" />
                    </button>
                  </div>
                  {validationErrors.relatedTo && (
                    <p className="text-red-500 text-xs mt-1 font-inter">
                      {validationErrors.relatedTo}
                    </p>
                  )}
                </div>

                {/* Selected Date + Due Date */}
                <div className="grid grid-cols-2 gap-3">
                  <div ref={selectedDateRef}>
                    <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                      Selected Date <span className="text-[#FF4935]">*</span>
                    </label>
                    <input
                      type="date"
                      value={form.selectedDate}
                      onChange={(e) => handleFormChange("selectedDate", e.target.value)}
                      className={`w-full border rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 transition-all cursor-pointer ${validationErrors.selectedDate ? "border-red-500 focus:ring-red-500" : "border-[#1F2937]/10 focus:ring-blue-500"
                        }`}
                    />
                    {validationErrors.selectedDate && (
                      <p className="text-red-500 text-xs mt-1 font-inter">{validationErrors.selectedDate}</p>
                    )}
                  </div>

                  <div ref={dueDateRef}>
                    <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                      Due Date <span className="text-[#FF4935]">*</span>
                    </label>
                    <input
                      type="date"
                      value={form.dueDate}
                      min={form.selectedDate || ""}
                      onChange={(e) => handleFormChange("dueDate", e.target.value)}
                      className={`w-full border rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 transition-all cursor-pointer ${validationErrors.dueDate ? "border-red-500 focus:ring-red-500" : "border-[#1F2937]/10 focus:ring-blue-500"
                        }`}
                    />
                    {validationErrors.dueDate && (
                      <p className="text-red-500 text-xs mt-1 font-inter">{validationErrors.dueDate}</p>
                    )}
                  </div>
                </div>

                {/* Status + Priority */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                      Status
                    </label>
                    <SingleSelectDropdown
                      options={statusOptions}
                      value={form.status}
                      onChange={(val) => handleFormChange("status", val)}
                      isOpen={openDropdown === "status"}
                      onOpenChange={(open) => setOpenDropdown(open ? "status" : null)}
                      dropUp={true}
                    />
                  </div>

                  <div>
                    <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                      Priority
                    </label>
                    <SingleSelectDropdown
                      options={priorityOptions}
                      value={form.priority}
                      onChange={(val) => handleFormChange("priority", val)}
                      isOpen={openDropdown === "priority"}
                      onOpenChange={(open) => setOpenDropdown(open ? "priority" : null)}
                      dropUp={true}
                    />
                  </div>
                </div>

                {/* Assignees */}
                <div ref={usersRef}>
                  <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                    Assignees
                  </label>

                  <div className="space-y-2 relative">
                    {assignedUsers.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {assignedUsers.map((user) => (
                          <div
                            key={user._id}
                            className="w-6 h-6 rounded-full overflow-hidden border-2 border-white ring-1 ring-gray-100 flex items-center justify-center bg-gray-100"
                            title={user.name || user.email}
                          >
                            <UserIcon className="w-3 h-3 text-gray-400" />
                          </div>
                        ))}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setShowUserSelector(!showUserSelector)}
                      className={`w-full flex items-center justify-between px-3 h-[38px] rounded-full text-[13px] focus:outline-none transition-all border bg-white ${validationErrors.users ? "border-red-300" : "border-[#1F2937]/10"
                        }`}
                    >
                      <span className="text-[#1F2937] opacity-50">
                        {form.users.length > 0 ? `${form.users.length} selected` : "Select Users"}
                      </span>
                      <PlusIcon className="w-4 h-4 text-[#1F2937] opacity-50" />
                    </button>

                      {showUserSelector && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setShowUserSelector(false)} />
                          <div className="absolute z-50 left-0 right-0 bottom-full mb-2 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-2">
                            <div className="p-2 border-b border-gray-100">
                              <div className="relative">
                                <SearchIcon className="absolute left-3 -translate-y-1/2 top-1/2 w-4 h-4 text-[#525866]" />
                                <input
                                  type="text"
                                  value={userSearch}
                                  onChange={(e) => setUserSearch(e.target.value)}
                                  placeholder="Search users..."
                                  className="w-full pl-9 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                            </div>
                            <div className="max-h-48 overflow-y-auto p-2 space-y-1">
                              {filteredUsers.length === 0 ? (
                                <p className="px-2 py-3 text-xs text-center text-gray-400">No users found</p>
                              ) : (
                                filteredUsers.map((user) => (
                                  <label
                                    key={user._id}
                                    className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors"
                                  >
                                    <Checkbox checked={form.users?.includes(user._id)} onChange={() => handleUserSelection(user._id)} />
                                    <span className="text-xs font-medium text-gray-700 truncate">
                                      {user.name || user.email}
                                    </span>
                                  </label>
                                ))
                              )}
                            </div>
                          </div>
                        </>
                      )}
                      {validationErrors.users && (
                        <p className="text-[10px] text-red-500 font-medium">{validationErrors.users}</p>
                      )}
                    </div>
                  </div>

                  {taskFieldDefs.length > 0 && (
                    <div className="pt-2 border-t border-gray-100">
                      <CustomFieldsSection
                        fieldDefs={taskFieldDefs}
                        values={form.additionalFields}
                        errors={validationErrors}
                        onChange={(next) => {
                          setForm((prev) => ({ ...prev, additionalFields: next }));
                          setValidationErrors((prev) => {
                            const cleared = { ...prev };
                            next.forEach((f) => {
                              if (f.value !== undefined && f.value !== null && f.value.toString().trim() !== "") {
                                delete cleared[f.key];
                              }
                            });
                            return cleared;
                          });
                        }}
                      />
                    </div>
                  )}
              </div>
            </form>
          </div>

          {/* Footer Actions */}
          <div className="flex-shrink-0 py-2.5 px-4 border-t border-gray-100 bg-white flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="px-6 py-2 border border-gray-200 text-gray-700 rounded-[25px] text-sm font-bold hover:bg-gray-50 transition-colors font-inter"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="px-6 py-2 bg-[#158FFF] text-white rounded-[25px] text-sm font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-inter flex items-center gap-2"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>{isEditing ? "Update Task" : "Create Task"}</>
              )}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
};

export default QuickTaskForm;
