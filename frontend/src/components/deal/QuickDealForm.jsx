import Checkbox from "../common/Checkbox";
import PlusIcon from "../common/PlusIcon";
import React, { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import API, { configureAxios } from "../../services/api";
import SearchableDropdown from "../contact/SearchableDropdown";
import QuickCompanyForm from "../company/QuickCompanyForm";
import QuickContactForm from "../contact/QuickContactForm";
import { X } from "lucide-react";
import toast from "react-hot-toast";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

const QuickDealForm = ({
  companies,
  contacts,
  onDealCreated,
  onDealUpdated,
  onRequestClose,
  initialCompanyId = "",
  initialContactId = "",
  initialStatus = "Open",
  editDeal = null,
  isContactLocked = false,
}) => {
  const isEditing = !!editDeal;
  const [form, setForm] = useState({
    title: "",
    amount: "",
    status: initialStatus,
    company: initialCompanyId,
    contact: initialContactId,
  });
  const [additionalFieldValues, setAdditionalFieldValues] = useState({});
  const [fieldDefinitions, setFieldDefinitions] = useState([]);
  const [statusOptions, setStatusOptions] = useState(["Open", "Won", "Lost"]);
  const [showQuickCompanyForm, setShowQuickCompanyForm] = useState(false);
  const [showQuickContactForm, setShowQuickContactForm] = useState(false);
  const [localCompanies, setLocalCompanies] = useState(companies);
  const [localContacts, setLocalContacts] = useState(contacts);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  useBodyScrollLock(isOpen);
  const [shouldRender, setShouldRender] = useState(true);
  const [isFormDirty, setIsFormDirty] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Add validation errors state
  const [validationErrors, setValidationErrors] = useState({});
  const titleInputRef = useRef(null);
  const amountInputRef = useRef(null);
  const companyRef = useRef(null);
  const contactRef = useRef(null);
  const statusRef = useRef(null);

  useEffect(() => {
    setShouldRender(true);
    setTimeout(() => setIsOpen(true), 10);
    fetchFieldDefinitions();
    fetchStatuses();
    setLocalCompanies(companies);
    setLocalContacts(
      contacts.map(contact => ({
        ...contact,
        displayName: `${contact.name} (${contact.company?.name || 'No Company'})`
      }))
    );
    return () => {
      setIsOpen(false);
    };
  }, [companies, contacts]);

  // If a default company is provided, auto-generate the deal name on mount
  useEffect(() => {
    if (!editDeal && initialCompanyId && localCompanies.length > 0) {
      suggestDealName(initialCompanyId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCompanyId, editDeal, localCompanies.length]);

  // Pre-fill when editing so edit and create share one form.
  useEffect(() => {
    if (!editDeal) return;
    setForm({
      title: editDeal.title || "",
      amount: editDeal.amount ?? "",
      status: editDeal.status || "Open",
      company: editDeal.company?._id || editDeal.company || "",
      contact: editDeal.contact?._id || editDeal.contact || "",
    });
    const pf = {};
    (editDeal.additionalFields || []).forEach((f) => {
      pf[f.key] = f.value;
    });
    setAdditionalFieldValues(pf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editDeal]);

  const fetchStatuses = async () => {
    try {
      const res = await API.get("/kanban");
      setStatusOptions(res.data?.statuses || ["Open", "Won", "Lost"]);
    } catch (error) {
      console.error("Error fetching statuses:", error);
      toast.error("Failed to fetch deal statuses");
    }
  };

  const fetchFieldDefinitions = async () => {
    try {
      const res = await API.get("/deal-fields");
      if (res.data && res.data.fields) {
        setFieldDefinitions(res.data.fields);
      }
    } catch (err) {
      console.error("Failed to fetch field definitions");
      toast.error("Failed to fetch deal field definitions");
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
    await handleSubmit({ preventDefault: () => { } }, true);
  };

  const handleCompanyCreated = (newCompany) => {
    setLocalCompanies((prev) => [...prev, newCompany]);
    setForm((prev) => ({ ...prev, company: newCompany._id }));
    setShowQuickCompanyForm(false);
    setIsFormDirty(true);

    // Clear validation error when company is selected
    if (validationErrors.company) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.company;
        return newErrors;
      });
    }
  };

  const handleContactCreated = (newContact) => {
    const contactWithDisplay = {
      ...newContact,
      displayName: `${newContact.name} (${newContact.company?.name || 'No Company'})`
    };
    setLocalContacts((prev) => [...prev, contactWithDisplay]);
    setForm((prev) => ({ ...prev, contact: newContact._id }));
    setShowQuickContactForm(false);
    setIsFormDirty(true);

    // Clear validation error when contact is selected
    if (validationErrors.contact) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.contact;
        return newErrors;
      });
    }
  };

  const renderFieldInput = (fieldDef, value) => {
    const handleFieldChange = (newValue) => {
      setAdditionalFieldValues((prev) => ({
        ...prev,
        [fieldDef.name]: newValue,
      }));
      setIsFormDirty(true);

      // Clear validation error for this field
      if (validationErrors[fieldDef.name]) {
        setValidationErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[fieldDef.name];
          return newErrors;
        });
      }
    };

    const hasError = validationErrors[fieldDef.name];
    const inputClassName = `w-full border rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 transition-all placeholder:text-[#1F2937] placeholder:opacity-50 font-inter ${hasError
        ? 'border-red-500 focus:ring-red-500'
        : 'border-[#1F2937]/10 focus:ring-blue-500'
      }`;

    switch (fieldDef.type) {
      case "number":
        return (
          <input
            type="number"
            step="any"
            value={value || ""}
            onChange={(e) => handleFieldChange(e.target.value)}
            className={inputClassName}
            placeholder={`Enter ${fieldDef.name}`}
          />
        );
      case "dropdown":
        return (
          <SearchableDropdown
            options={(fieldDef.options || []).map(opt => ({ name: opt, _id: opt }))}
            value={value || ""}
            onChange={(newValue) => handleFieldChange(newValue)}
            placeholder={`Select ${fieldDef.name}`}
            displayKey="name"
            valueKey="_id"
            compact
          />
        );
      case "text":
        return (
          <textarea
            rows={3}
            value={value || ""}
            onChange={(e) => handleFieldChange(e.target.value)}
            className={`w-full border rounded-2xl px-3 py-2 text-[12px] text-[#1F2937] focus:outline-none focus:ring-1 transition-all placeholder:text-[#1F2937] placeholder:opacity-50 font-inter resize-vertical ${hasError ? 'border-red-500 focus:ring-red-500' : 'border-[#1F2937]/10 focus:ring-blue-500'}`}
            placeholder={`Enter ${fieldDef.name}`}
          />
        );
      case "date":
        return (
          <input
            type="date"
            value={value || ""}
            onChange={(e) => handleFieldChange(e.target.value)}
            className={inputClassName}
          />
        );
      case "url":
        return (
          <input
            type="url"
            value={value || ""}
            onChange={(e) => handleFieldChange(e.target.value)}
            className={inputClassName}
            placeholder="https://example.com"
          />
        );
      case "multiselect":
        return (
          <div className="space-y-2">
            {fieldDef.options &&
              fieldDef.options.map((option, index) => {
                const selectedValues = Array.isArray(value) ? value : [];
                const isChecked = selectedValues.includes(option);

                return (
                  <label
                    key={index}
                    className="flex items-center gap-2 cursor-pointer hover:bg-[#F2F2F7] rounded-full px-3 h-8 transition-colors border border-transparent hover:border-[#1F2937]/10"
                  >
                    <Checkbox checked={isChecked} onChange={(e) => {
                        let newValues;
                        if (e.target.checked) {
                          newValues = [...selectedValues, option];
                        } else {
                          newValues = selectedValues.filter((v) => v !== option);
                        }
                        handleFieldChange(newValues);
                      }} />
                    <span className="text-[12px] text-[#1F2937] font-medium font-inter">{option}</span>
                  </label>
                );
              })}
            {(!fieldDef.options || fieldDef.options.length === 0) && (
              <p className="text-[12px] text-[#1F2937] opacity-50 italic px-3 py-2 font-inter">
                No options available
              </p>
            )}
          </div>
        );
      case "string":
      default:
        return (
          <input
            type="text"
            value={value || ""}
            onChange={(e) => handleFieldChange(e.target.value)}
            className={inputClassName}
            placeholder={`Enter ${fieldDef.name}`}
          />
        );
    }
  };

  // "<Company> - New Deal N", where N is the next free number for that
  // company. Counted from the company's existing deals rather than a running
  // total, so two companies both start at 1. Only ever fills an EMPTY title:
  // once someone types their own name, changing the company must not
  // overwrite it.
  const suggestDealName = async (companyId) => {
    const company = localCompanies.find((c) => c._id === companyId);
    if (!company?.name) return;
    let next = 1;
    try {
      const res = await API.get("/deals", { params: { company: companyId, limit: 500 } });
      const deals = Array.isArray(res.data) ? res.data : res.data?.deals || [];
      const used = deals
        .map((d) => {
          // Company names contain (), + and . often enough that the name has
          // to be escaped before it goes into a pattern.
          const safeName = company.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const pattern = "^" + safeName + "\\s*-\\s*New Deal\\s*(\\d+)$";
          const m = new RegExp(pattern, "i").exec(d.title || "");
          return m ? Number(m[1]) : 0;
        })
        .filter(Boolean);
      if (used.length) next = Math.max(...used) + 1;
    } catch {
      // Falling back to 1 is fine — the name is a starting point the user can
      // edit, not an identifier anything depends on.
    }
    setForm((prev) => ({ ...prev, title: `${company.name} - New Deal ${next}` }));
  };

  const handleFormChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setIsFormDirty(true);

    // Picking a company proposes a name for a deal that doesn't have one yet.
    if (key === "company" && value && !isEditing) {
      suggestDealName(value);
    }

    // Clear validation error for this field
    if (validationErrors[key]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[key];
        return newErrors;
      });
    }
  };

  const handleSubmit = async (e, isSaveAndExit = false) => {
    e.preventDefault();

    // Comprehensive validation
    let hasErrors = false;
    const errors = {};

    // Validate required fields
    if (!form.title || !form.title.trim()) {
      errors.title = "Title is required";
      hasErrors = true;
    }

    if (!form.amount || form.amount === "" || parseFloat(form.amount) <= 0) {
      errors.amount = "Amount is required and must be greater than 0";
      hasErrors = true;
    }

    if (!form.status || !form.status.trim()) {
      errors.status = "Status is required";
      hasErrors = true;
    }

    // Validate required company
    if (!form.company) {
      errors.company = "Please select a company";
      hasErrors = true;
    }

    // Validate required contact
    if (!form.contact) {
      errors.contact = "Please select a contact";
      hasErrors = true;
    }

    // Check required additional fields
    fieldDefinitions.forEach((fieldDef) => {
      if (fieldDef.required) {
        const value = additionalFieldValues[fieldDef.name];
        if (!value || value.toString().trim() === "") {
          errors[fieldDef.name] = `${fieldDef.name} is required`;
          hasErrors = true;
        }
      }
    });

    if (hasErrors) {
      setValidationErrors(errors);

      // Scroll to whichever invalid field appears first on the page (not
      // necessarily the one checked first above), so the user always lands
      // on the top-most problem instead of being surprised by one further
      // down after fixing what looked like the only error.
      const candidates = [
        errors.title ? titleInputRef.current : null,
        errors.amount ? amountInputRef.current : null,
        errors.status ? statusRef.current : null,
        errors.company ? companyRef.current : null,
        errors.contact ? contactRef.current : null,
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

    const processedAdditionalFields = fieldDefinitions
      .map((fieldDef) => {
        const value = additionalFieldValues[fieldDef.name] || "";
        return {
          key: fieldDef.name,
          value: value,
          type: fieldDef.type,
        };
      })
      .filter((field) => field.value !== "");

    const payload = {
      ...form,
      additionalFields: processedAdditionalFields,
    };

    try {
      setLoading(true);
      const res = isEditing
        ? await API.put(`/deals/${editDeal._id}`, payload)
        : await API.post("/deals", payload);
      toast.success(isEditing ? "Deal updated successfully!" : "Deal added successfully!");
      const cb = isEditing ? onDealUpdated || onDealCreated : onDealCreated;
      if (cb && res.data) {
        cb(res.data);
      }
      setIsFormDirty(false);
      closeForm();
    } catch (err) {
      let errorMessage = "Failed to add deal. Please try again.";
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
          errorMessage = "Subscription expired. Please renew to add deals.";
        } else if (errorMessage.includes("Write access to deals not allowed")) {
          errorMessage =
            "Your plan does not allow adding deals. Please upgrade your plan.";
        }
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
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black/50 z-[10004] flex items-center justify-center">
          <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-sm sm:max-w-lg mx-4">
            <h3 className="text-lg  text-gray-900 mb-4">
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

      {showQuickCompanyForm && (
        <QuickCompanyForm
          onCompanyCreated={handleCompanyCreated}
          onRequestClose={() => setShowQuickCompanyForm(false)}
        />
      )}
      {showQuickContactForm && (
        <QuickContactForm
          companies={localCompanies}
          onContactCreated={handleContactCreated}
          onRequestClose={() => setShowQuickContactForm(false)}
        />
      )}
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[10000] transition-opacity duration-300 ease-in-out"
        style={{ opacity: isOpen ? 1 : 0 }}
        onClick={handleClose}
      />
      <div
        className={`fixed dc-panel-card z-[10001] dc-panel-w bg-white shadow-2xl flex flex-col overflow-hidden transform transition-transform duration-300 ease-in-out font-inter ${isOpen ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"
          }`}
      >
        <form onSubmit={handleSubmit} noValidate className="flex flex-col h-full overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#D9D9D9] flex-shrink-0 bg-white gap-1">
            <h2 className="text-[15px] font-normal leading-6 text-[#78788D] uppercase tracking-wide">
              {isEditing ? "Edit Deal" : "Create New Deal"}
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
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <div className="space-y-6">
            {/* Company - NOW REQUIRED */}
            <div ref={companyRef}>
              <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Company <span className="text-[#FF4935]">*</span>
              </label>
              <div className="flex items-center gap-3">
                <SearchableDropdown
                  options={localCompanies}
                  value={form.company}
                  onChange={(value) => handleFormChange("company", value)}
                  placeholder="Select Company"
                  displayKey="name"
                  valueKey="_id"
                  className="flex-1"
                  error={validationErrors.company}
                  compact
                />
                <button
                  type="button"
                  onClick={() => setShowQuickCompanyForm(true)}
                  className="flex-shrink-0 w-[38px] h-[38px] rounded-full bg-[#158FFF] border border-[#1F2937]/10 flex items-center justify-center hover:opacity-90 transition-opacity cursor-pointer"
                  title="Add New Company"
                >
                  <PlusIcon className="w-4 h-4 text-white" />
                </button>
              </div>
              {validationErrors.company && (
                <p className="text-red-500 text-xs mt-1 font-inter">{validationErrors.company}</p>
              )}
            </div>

            {/* Title - Now with validation */}
            <div>
              <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Deal Name <span className="text-[#FF4935]">*</span>
              </label>
              {/* Generated from the company above, so it's read-only and
                  greyed: the name follows the company selection rather than
                  being typed. It stays a real input (not plain text) so the
                  scroll-to-first-error ref and the validation styling below
                  keep working. */}
              <input
                ref={titleInputRef}
                type="text"
                value={form.title}
                readOnly
                tabIndex={-1}
                aria-readonly="true"
                className={`w-full border rounded-full px-3 h-[38px] text-[13px] bg-[#F5F6F6] text-[#6B7280] cursor-not-allowed focus:outline-none transition-all placeholder:text-[#1F2937] placeholder:opacity-50 font-inter ${validationErrors.title ? 'border-red-500' : 'border-[#1F2937]/10'
                  }`}
                placeholder="Select a company to generate the name"
              />
              {validationErrors.title && (
                <p className="text-red-500 text-xs mt-1 font-inter">{validationErrors.title}</p>
              )}
            </div>

            {/* Amount - Now with validation */}
            <div>
              <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Amount <span className="text-[#FF4935]">*</span>
              </label>
              <input
                ref={amountInputRef}
                type="number"
                value={form.amount}
                onChange={(e) => handleFormChange("amount", e.target.value)}
                className={`w-full border rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 transition-all placeholder:text-[#1F2937] placeholder:opacity-50 font-inter ${validationErrors.amount ? 'border-red-500 focus:ring-red-500' : 'border-[#1F2937]/10 focus:ring-blue-500'
                  }`}
                min={"0"}
                step="1"
                placeholder="Enter Deal Amount"
              />
              {validationErrors.amount && (
                <p className="text-red-500 text-xs mt-1 font-inter">{validationErrors.amount}</p>
              )}
            </div>

            {/* Status */}
            <div ref={statusRef}>
              <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Status <span className="text-[#FF4935]">*</span>
              </label>
              <div className="flex items-center gap-3">
                <SearchableDropdown
                  options={statusOptions.map(opt => ({ name: opt, _id: opt }))}
                  value={form.status}
                  onChange={(value) => handleFormChange("status", value)}
                  placeholder="Choose Status of the Deal"
                  displayKey="name"
                  valueKey="_id"
                  className="flex-1"
                  error={validationErrors.status}
                  compact
                />
                <button
                  type="button"
                  className="flex-shrink-0 w-[38px] h-[38px] rounded-full bg-[#158FFF] border border-[#1F2937]/10 flex items-center justify-center hover:opacity-90 transition-opacity"
                >
                  <PlusIcon className="w-4 h-4 text-white" />
                </button>
              </div>
              {validationErrors.status && (
                <p className="text-red-500 text-xs mt-1 font-inter">{validationErrors.status}</p>
              )}
            </div>

            {/* Contact - NOW REQUIRED */}
            <div ref={contactRef}>
              <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Contact <span className="text-[#FF4935]">*</span>
              </label>
              <div className="flex items-center gap-3">
                <SearchableDropdown
                  options={localContacts}
                  value={form.contact}
                  onChange={(value) => handleFormChange("contact", value)}
                  placeholder="Choose Contact"
                  displayKey="displayName"
                  valueKey="_id"
                  className="flex-1"
                  error={validationErrors.contact}
                  disabled={isContactLocked}
                  compact
                />
                {!isContactLocked && (
                  <button
                    type="button"
                    onClick={() => setShowQuickContactForm(true)}
                    className="flex-shrink-0 w-[38px] h-[38px] rounded-full bg-[#158FFF] border border-[#1F2937]/10 flex items-center justify-center hover:opacity-90 transition-opacity cursor-pointer"
                    title="Add New Contact"
                  >
                    <PlusIcon className="w-4 h-4 text-white" />
                  </button>
                )}
              </div>
              {validationErrors.contact && (
                <p className="text-red-500 text-xs mt-1 font-inter">{validationErrors.contact}</p>
              )}
            </div>

            {/* Additional Fields - Now with validation */}
            {fieldDefinitions.length > 0 && (
              <div className="pt-4 space-y-4">
                <div className="flex items-center gap-3">
                  <span className="flex-1 h-px bg-[#D9D9D9]" />
                  <h3 className="flex-shrink-0 text-[14px] font-medium leading-[120%] text-[#1F2937]">
                    Custom Fields
                  </h3>
                  <span className="flex-1 h-px bg-[#D9D9D9]" />
                </div>
                <div className="space-y-4">
                  {fieldDefinitions.map((fieldDef) => (
                    <div key={fieldDef.name}>
                      <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                        {fieldDef.name} {fieldDef.required && <span className="text-[#FF4935]">*</span>}
                      </label>
                      {renderFieldInput(
                        fieldDef,
                        additionalFieldValues[fieldDef.name]
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            </div>
          </div>
          <div className="flex-shrink-0 py-2.5 px-4 border-t border-gray-100 bg-white flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="px-6 py-2 border border-gray-200 text-gray-700 rounded-[25px] text-sm font-bold hover:bg-gray-50 transition-colors font-inter"
            >
              Cancel
            </button>
            <button
              className="px-6 py-2 bg-[#158FFF] text-white rounded-[25px] text-sm font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-inter"
              type="submit"
              disabled={loading}
            >
              {loading ? "Saving..." : isEditing ? "Update Deal" : "Create New Deal"}
            </button>
          </div>
        </form>
      </div>
    </>,
    document.body
  );
};

export default QuickDealForm;