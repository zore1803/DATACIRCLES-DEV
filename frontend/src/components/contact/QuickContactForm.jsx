import Checkbox from "../common/Checkbox";
import PlusIcon from "../common/PlusIcon";
import React, { useState, useEffect, useRef } from "react";
import PhoneNumberInput from "../common/PhoneNumberInput";
import { createPortal } from "react-dom";
import API from "../../services/api";
import SearchableDropdown from "./SearchableDropdown";
import CustomDropdown from "../common/CustomDropdown";
import QuickCompanyForm from "../company/QuickCompanyForm";
import { X, Paperclip } from "lucide-react";
import instagramLogo from "../../assets/insta-logo.png";
import twitterLogo from "../../assets/twitter-logo.png";
import linkedinLogo from "../../assets/linkedin-logo.png";
import facebookLogo from "../../assets/facebook-logo.png";
import toast from "react-hot-toast";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";
import {
  FormBody, FormField, FormLabel, TextInput, InputWithAction, FieldActionButton,
  FilePickerField, SectionDivider, HINT_CLS, PHONE_SELECT_CLS, inputCls, selectButtonCls,
} from "../common/form";

const SOCIAL_LINKS = [
  { key: "twitter", label: "X (Twitter)", logo: twitterLogo, scale: 1.56, placeholder: "https://x.com/username" },
  { key: "linkedin", label: "LinkedIn", logo: linkedinLogo, scale: 1.5, placeholder: "https://linkedin.com/in/username" },
  { key: "instagram", label: "Instagram", logo: instagramLogo, scale: 1.4, placeholder: "https://instagram.com/username" },
  { key: "facebook", label: "Facebook", logo: facebookLogo, scale: 1.21, placeholder: "https://facebook.com/username" },
];

const QuickContactForm = ({ onContactCreated, onContactUpdated, onRequestClose, initialCompanyId = "", editContact = null }) => {
  const isEditing = !!editContact;
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: initialCompanyId,
    leadSource: "",
    socialMedia: {
      twitter: "",
      linkedin: "",
      instagram: "",
      facebook: "",
    },
  });
  const [additionalFields, setAdditionalFields] = useState({});
  const [fieldDefinitions, setFieldDefinitions] = useState([]);
  const [profilePicture, setProfilePicture] = useState(null);
  const profilePictureInputRef = useRef(null);
  const nameInputRef = useRef(null);
  const emailInputRef = useRef(null);
  const companyRef = useRef(null);
  const phoneInputRef = useRef(null);
  const leadSourceRef = useRef(null);
  // Scroll-to-error targets for custom fields, keyed by field name — same
  // pattern as the fixed refs above, just dynamic since fields vary per org.
  const customFieldRefs = useRef({});
  // Object URL for the currently picked file, so the preview shows the actual
  // image instead of just its filename. Revoked whenever the selection
  // changes or the form unmounts, since object URLs otherwise leak.
  const [profilePicturePreview, setProfilePicturePreview] = useState(null);
  useEffect(() => {
    if (!profilePicture) {
      setProfilePicturePreview(null);
      return;
    }
    const url = URL.createObjectURL(profilePicture);
    setProfilePicturePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [profilePicture]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [shouldRender, setShouldRender] = useState(true);
  const [showQuickCompanyForm, setShowQuickCompanyForm] = useState(false);
  const [isFormDirty, setIsFormDirty] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Add validation state
  const [validationErrors, setValidationErrors] = useState({});

  useBodyScrollLock(isOpen);

  useEffect(() => {
    setShouldRender(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setIsOpen(true)));
    fetchFieldDefinitions();
    return () => {
      setIsOpen(false);
    };
  }, []);

  // Pre-fill when editing so edit and create share one form.
  useEffect(() => {
    if (!editContact) return;
    setForm({
      name: editContact.name || "",
      email: editContact.email || "",
      phone: editContact.phone || "",
      company: editContact.company?._id || editContact.company || "",
      leadSource: editContact.leadSource || "",
      socialMedia: {
        twitter: "",
        linkedin: "",
        instagram: "",
        facebook: "",
        ...(editContact.socialMedia || {}),
      },
    });
    const pf = {};
    (editContact.additionalFields || []).forEach((f) => {
      pf[f.key] = f.value;
    });
    setAdditionalFields(pf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editContact]);

  const fetchFieldDefinitions = async () => {
    try {
      const res = await API.get("/contact-fields");
      if (res.data && res.data.fields) {
        setFieldDefinitions(res.data.fields);
      }
    } catch (err) {
      console.error("Failed to fetch contact field definitions");
      toast.error("Failed to fetch contact field definitions");
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
      if (onRequestClose) {
        onRequestClose();
      }
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

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("File size should be less than 5MB");
        return;
      }
      if (!file.type.startsWith("image/")) {
        toast.error("Please select an image file");
        return;
      }
      setProfilePicture(file);
      setIsFormDirty(true);
    }
  };

  const handleCompanyCreated = (newCompany) => {
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

  // Validation function
  const validateForm = () => {
    const errors = {};

    if (!form.name.trim()) {
      errors.name = "Name is required";
    }

    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errors.email = "Invalid email format";
    }

    // Validate required additional fields — only when creating. A field
    // marked required after a contact already existed shouldn't retroactively
    // block that older contact from being saved just because it predates the
    // field; "required" only applies going forward, to new contacts.
    fieldDefinitions.forEach((fieldDef) => {
      if (fieldDef.required && !isEditing) {
        const value = additionalFields[fieldDef.name];
        if (!value || value.toString().trim() === "") {
          errors[`additional_${fieldDef.name}`] = `${fieldDef.name} is required`;
        }
      }
    });

    return errors;
  };

  const renderFieldInput = (fieldDef, value) => {
    const handleFieldChange = (newValue) => {
      setAdditionalFields((prev) => ({
        ...prev,
        [fieldDef.name]: newValue,
      }));
      setIsFormDirty(true);

      // Clear validation error when user fixes the field
      if (validationErrors[`additional_${fieldDef.name}`]) {
        setValidationErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[`additional_${fieldDef.name}`];
          return newErrors;
        });
      }
    };

    const hasError = validationErrors[`additional_${fieldDef.name}`];
    const inputClassName = inputCls({ error: !!hasError });

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
          <CustomDropdown
            options={fieldDef.options || []}
            value={value || ""}
            onChange={(newValue) => handleFieldChange(newValue)}
            placeholder={`Select ${fieldDef.name}`}
            required={fieldDef.required}
            buttonClassName={`w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-left flex items-center justify-between transition-all bg-white font-inter ${value ? "text-[#1F2937]" : "text-[#1F2937] opacity-50"}`}
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
              <p className="text-[14px] text-gray-400 italic px-4 py-2 font-inter">
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


  const handleFormChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setIsFormDirty(true);

    // Clear validation errors when user fixes the field
    if (validationErrors[key]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[key];
        return newErrors;
      });
    }

    // Special handling for company field
    if (key === 'company' && value && validationErrors.company) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.company;
        return newErrors;
      });
    }
  };

  const handleSocialMediaChange = (platform, value) => {
    setForm((prev) => ({
      ...prev,
      socialMedia: { ...prev.socialMedia, [platform]: value },
    }));
    setIsFormDirty(true);
  };

  const handleSubmit = async (e, isSaveAndExit = false) => {
    e.preventDefault();

    // Validate every mandatory field up front — highlight all of them at
    // once, then scroll to whichever invalid one appears first on the page
    // (not necessarily the one checked first here), so the user always lands
    // on the top-most problem instead of being surprised by one further down
    // after fixing what looked like the only error.
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      toast.error("Please fill in all required fields");

      const candidates = [
        errors.name ? nameInputRef.current : null,
        errors.email ? emailInputRef.current : null,
        ...fieldDefinitions
          .filter((fieldDef) => errors[`additional_${fieldDef.name}`])
          .map((fieldDef) => customFieldRefs.current[fieldDef.name]),
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

    const payload = new FormData();
    payload.append("name", form.name);
    payload.append("email", form.email);
    payload.append("phone", form.phone);
    // Company is a Mongo ObjectId ref — only send it when actually selected,
    // since an empty string fails to cast on save (unlike the other, plain
    // string fields above, which are safe to send blank).
    if (form.company) {
      payload.append("company", form.company);
    }
    payload.append("leadSource", form.leadSource);
    payload.append("socialMedia[twitter]", form.socialMedia.twitter || "");
    payload.append("socialMedia[linkedin]", form.socialMedia.linkedin || "");
    payload.append("socialMedia[instagram]", form.socialMedia.instagram || "");
    payload.append("socialMedia[facebook]", form.socialMedia.facebook || "");

    const processedAdditionalFields = fieldDefinitions
      .map((fieldDef) => {
        const value = additionalFields[fieldDef.name] || "";
        return {
          key: fieldDef.name,
          value: value,
          type: fieldDef.type,
        };
      })
      .filter((field) => field.value !== "");

    processedAdditionalFields.forEach((field, index) => {
      payload.append(`additionalFields[${index}][key]`, field.key);
      payload.append(`additionalFields[${index}][value]`, field.value);
      payload.append(`additionalFields[${index}][type]`, field.type);
    });

    if (profilePicture) {
      payload.append("avatar", profilePicture);
    }

    try {
      setLoading(true);
      const res = isEditing
        ? await API.put(`/contacts/${editContact._id}`, payload, {
            headers: { "Content-Type": "multipart/form-data" },
          })
        : await API.post("/contacts", payload, {
            headers: { "Content-Type": "multipart/form-data" },
          });
      toast.success(isEditing ? "Contact updated successfully!" : "Contact added successfully!");
      const cb = isEditing ? onContactUpdated || onContactCreated : onContactCreated;
      if (cb && res.data) {
        cb(res.data);
      }
      setIsFormDirty(false);
      closeForm();
    } catch (err) {
      // Surface the backend's actual message (e.g. a Mongoose validation
      // error naming the exact bad field/value) instead of masking every
      // failure behind the same generic text — that generic text is what
      // made a real save error indistinguishable from a network hiccup.
      let errorMessage = err.response?.data?.error || err.response?.data?.message || "Failed to save contact. Please try again.";
      if (err.response && err.response.status === 402) {
        errorMessage = err.response?.data?.message || "An active subscription is required to make changes.";
      } else if (err.response && err.response.status === 403) {
        errorMessage = err.response.data.error || "Access denied";
        const match = errorMessage.match(/\((\d+)\/(\d+)\s*records/);
        if (match) {
          const used = match[1];
          const limit = match[2];
          errorMessage = `Record limit reached (${used}/${limit}). Please upgrade your plan to add more records.`;
        } else if (errorMessage.includes("Subscription expired")) {
          errorMessage = "Subscription expired. Please renew to add contacts.";
        } else if (
          errorMessage.includes("Write access to contacts not allowed")
        ) {
          errorMessage =
            "Your plan does not allow adding contacts. Please upgrade your plan.";
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
            <h3 className="text-lg font-medium font-sf text-gray-900 mb-4">
              Unsaved Changes
            </h3>
            <p className="text-sm font-medium font-inter text-gray-600 mb-6">
              You have unsaved changes. Are you sure you want to exit without
              saving?
            </p>
            <div className="flex justify-between gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmDialog(false)}
                className="bg-gray-200 font-sf text-gray-800 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors cursor-pointer hidden sm:block"
              >
                Cancel
              </button>
              <div className="flex space-x-1">
                <button
                  type="button"
                  onClick={handleConfirmExit}
                  className="bg-red-600 font-sf text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors cursor-pointer"
                >
                  Exit Without Saving
                </button>
                <button
                  type="button"
                  onClick={handleSaveAndExit}
                  className="bg-blue-600 font-sf text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors cursor-pointer"
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

      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[10000] transition-opacity duration-300 ease-out"
        style={{ opacity: isOpen ? 1 : 0 }}
        onClick={handleClose}
      />

      <div
        className={`
          fixed dc-panel-card dc-panel-w z-[10002]
          max-w-full bg-white shadow-2xl flex flex-col overflow-hidden
          transform transition-transform duration-300 ease-out font-inter
          ${isOpen ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"}
        `}
      >
        <form onSubmit={handleSubmit} noValidate className="flex flex-col h-full overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#D9D9D9] flex-shrink-0 bg-white gap-1">
            <h2 className="text-[15px] font-normal leading-6 text-[#78788D] uppercase tracking-wide">
              {isEditing ? "Edit Contact" : "Create New Contact"}
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

          <FormBody>
            {/* Profile Picture */}
            <div>
              <FormLabel>Profile Picture</FormLabel>
              <FilePickerField
                fileName={profilePicture?.name}
                onPick={() => profilePictureInputRef.current?.click()}
                title="Upload profile picture"
              >
                <Paperclip className="w-[18px] h-[18px] text-white" strokeWidth={2} />
              </FilePickerField>
              <input
                ref={profilePictureInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <p className={HINT_CLS}>PNG, JPEG upto 5MB</p>
              {profilePicturePreview && (
                <div className="relative mt-2 inline-block">
                  <img
                    src={profilePicturePreview}
                    alt="Contact"
                    className="block max-h-20 max-w-[160px] w-auto h-auto object-contain rounded-lg border border-[#E0E0E1]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setProfilePicture(null);
                      if (profilePictureInputRef.current) {
                        profilePictureInputRef.current.value = "";
                      }
                    }}
                    title="Remove photo"
                    aria-label="Remove photo"
                    className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white border border-[#E0E0E1] shadow-sm flex items-center justify-center text-[#1C1B1F] hover:bg-gray-50 transition-colors"
                  >
                    <X className="w-3 h-3" strokeWidth={2.5} />
                  </button>
                </div>
              )}
            </div>

            <FormField label="Full Name" required error={validationErrors.name}>
              <TextInput
                ref={nameInputRef}
                type="text"
                placeholder="Enter Full Name"
                value={form.name}
                onChange={(e) => handleFormChange("name", e.target.value)}
                error={validationErrors.name}
              />
            </FormField>

            <FormField label="Email" error={validationErrors.email}>
              <TextInput
                ref={emailInputRef}
                type="email"
                placeholder="example@gmail.com"
                value={form.email}
                onChange={(e) => handleFormChange("email", e.target.value)}
                error={validationErrors.email}
              />
            </FormField>

            <FormField label="Phone" error={validationErrors.phone}>
              {/* Wrapper carries phoneInputRef: the scroll-to-first-error
                  logic targets a DOM node, not the raw <input>. */}
              <div ref={phoneInputRef}>
                <PhoneNumberInput
                  value={form.phone}
                  onChange={(next) => handleFormChange("phone", next)}
                  placeholder="123456789"
                  selectClassName={PHONE_SELECT_CLS}
                  inputClassName={inputCls({ error: validationErrors.phone, grow: true })}
                />
              </div>
            </FormField>

            <FormField label="Company" fieldRef={companyRef} error={validationErrors.company}>
              <InputWithAction
                action={
                  <FieldActionButton
                    icon={<PlusIcon className="w-4 h-4 text-white" />}
                    onClick={() => setShowQuickCompanyForm(true)}
                    title="Add New Company"
                    aria-label="Add New Company"
                  />
                }
              >
                <SearchableDropdown
                  options={[]}
                  remote={{ endpoint: "/companies" }}
                  value={form.company}
                  onChange={(value) => handleFormChange("company", value)}
                  placeholder="Select Company"
                  displayKey="name"
                  valueKey="_id"
                  error={validationErrors.company}
                  compact
                />
              </InputWithAction>
            </FormField>

            <FormField label="Lead Source" fieldRef={leadSourceRef} error={validationErrors.leadSource}>
              <CustomDropdown
                options={["Referral", "Website", "Cold Call", "Social Media", "Event", "Advertisement", "Other"]}
                value={form.leadSource}
                onChange={(value) => handleFormChange("leadSource", value)}
                placeholder="Choose Lead Source"
                buttonClassName={selectButtonCls({
                  error: validationErrors.leadSource,
                  hasValue: !!form.leadSource,
                })}
              />
            </FormField>

            {/* Additional Fields - Now with validation */}
            {fieldDefinitions.length > 0 && (
              <div className="pt-4 space-y-4">
                <SectionDivider>Custom Fields</SectionDivider>
                <div className="space-y-3 sm:space-y-4">
                  {fieldDefinitions.map((fieldDef) => (
                    <FormField
                      key={fieldDef.name}
                      label={fieldDef.name}
                      required={fieldDef.required}
                      fieldRef={(el) => (customFieldRefs.current[fieldDef.name] = el)}
                      error={validationErrors[`additional_${fieldDef.name}`]}
                    >
                      {renderFieldInput(fieldDef, additionalFields[fieldDef.name])}
                    </FormField>
                  ))}
                </div>
              </div>
            )}

            {/* Social Media Links — same layout as QuickCompanyForm's. */}
            <div>
              <div className="mb-3">
                <SectionDivider>Social Media Links</SectionDivider>
              </div>
              <div className="space-y-3">
                {SOCIAL_LINKS.map(({ key, label, logo, scale, placeholder }) => (
                  <div key={key}>
                    <FormLabel
                      icon={
                        <span className="flex-shrink-0 w-[18px] h-[18px] flex items-center justify-center overflow-hidden rounded-[5px]">
                          <img
                            src={logo}
                            alt=""
                            className="w-[18px] h-[18px] object-contain"
                            style={{ transform: `scale(${scale})` }}
                          />
                        </span>
                      }
                    >
                      {label}
                    </FormLabel>
                    <TextInput
                      type="url"
                      value={form.socialMedia[key]}
                      onChange={(e) => handleSocialMediaChange(key, e.target.value)}
                      placeholder={placeholder}
                    />
                  </div>
                ))}
              </div>
            </div>
          </FormBody>

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
              {loading ? "Saving..." : isEditing ? "Update Contact" : "Create New Contact"}
            </button>
          </div>
        </form>
      </div>
    </>,
    document.body
  );
};

export default QuickContactForm;
