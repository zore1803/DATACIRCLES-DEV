import Checkbox from "../common/Checkbox";
import React, { useEffect, useState, useRef } from "react";
import PhoneNumberInput from "../common/PhoneNumberInput";
import API from "../../services/api";
import { Paperclip, X } from "lucide-react";
import toast from "react-hot-toast";
import { Country, State } from "country-state-city";
import CustomDropdown from "../common/CustomDropdown";
import { getStateCode, canonicalStateName } from "../../utils/gstStateCode";
import { loadCityModule, useLazyCity } from "../../utils/lazyCityData";

// India first (GST is India-driven), then every other country alphabetically —
// full list/state data from country-state-city instead of a hand-maintained one.
// Mirrors the same helpers used in QuickCompanyForm.jsx.
const ALL_COUNTRIES = Country.getAllCountries();
const COUNTRIES = [
  "India",
  ...ALL_COUNTRIES.filter((c) => c.name !== "India")
    .map((c) => c.name)
    .sort((a, b) => a.localeCompare(b)),
];
const countryIsoByName = Object.fromEntries(ALL_COUNTRIES.map((c) => [c.name, c.isoCode]));
const getStatesForCountry = (countryName) => {
  const iso = countryIsoByName[countryName];
  if (!iso) return [];
  return State.getStatesOfCountry(iso).map((s) => s.name);
};
// `City` is null until utils/lazyCityData's chunk resolves (see there).
const getCitiesForState = (City, countryName, stateName) => {
  if (!City) return [];
  const countryIso = countryIsoByName[countryName];
  if (!countryIso) return [];
  const stateIso = State.getStatesOfCountry(countryIso).find((s) => s.name === stateName)?.isoCode;
  if (!stateIso) return [];
  return City.getCitiesOfState(countryIso, stateIso).map((c) => c.name);
};


// Pincode lookups already made this session. India Post's API is slow (often a second or more),
// so re-typing or correcting a pincode, or opening the form again, shouldn't wait on it twice.
const pincodeCache = new Map();

// Mirrors QuickCompanyForm.jsx's pincode lookup — see the comment there — plus, for this form:
//  - India Post spells some states differently from the state list ("Chattisgarh",
//    "Pondicherry", "Daman & Diu", "Andaman & Nicobar"); an exact name match found nothing for
//    those, so they're matched through their GST state code instead.
//  - returns the GST `stateCode` for the State Code field.
//  - accepts an AbortSignal, so a lookup for a pincode the user has since changed is cancelled.
//  - results are cached per pincode (only successful ones).
const lookupIndianPincode = async (pincode, signal) => {
  if (!/^\d{6}$/.test(pincode)) return null;
  if (pincodeCache.has(pincode)) return pincodeCache.get(pincode);
  try {
    const [res, City] = await Promise.all([
      fetch(`https://api.postalpincode.in/pincode/${pincode}`, { signal }),
      loadCityModule(),
    ]);
    const data = await res.json();
    const po = data?.[0]?.Status === "Success" ? data[0].PostOffice?.[0] : null;
    if (!po) return null;

    const countryIso = countryIsoByName["India"];
    const states = State.getStatesOfCountry(countryIso);
    const stateName = canonicalStateName(po.State || "", states.map((s) => s.name));
    const matchedState = states.find((s) => s.name.toLowerCase() === stateName.toLowerCase());
    if (!matchedState) return null;

    const cities = City.getCitiesOfState(countryIso, matchedState.isoCode).map((c) => c.name);
    const districtOrTaluk = po.District || po.Block || po.Taluk || "";
    const matchedCity =
      cities.find((c) => c.toLowerCase() === districtOrTaluk.toLowerCase()) ||
      cities.find((c) => c.toLowerCase() === po.Name?.toLowerCase()) ||
      districtOrTaluk ||
      po.Name ||
      "";

    const result = {
      country: "India",
      state: matchedState.name,
      city: matchedCity,
      stateCode: getStateCode(matchedState.name) || "",
    };
    pincodeCache.set(pincode, result);
    return result;
  } catch (err) {
    if (err?.name === "AbortError") throw err; // caller distinguishes a cancelled lookup
    return null; // Non-fatal — the user can still fill state/city by hand.
  }
};

const QuickVendorForm = ({ onVendorCreated, onVendorUpdated, onRequestClose, editVendor = null }) => {
  const City = useLazyCity();
  const isEditing = !!editVendor;
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    gstin: "",
    address: {
      line1: "",
      line2: "",
      city: "",
      state: "",
      stateCode: "",
      pincode: "",
      country: "India",
    },
  });
  const [nameError, setNameError] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [addressError, setAddressError] = useState(false);
  const [additionalFields, setAdditionalFields] = useState({});
  const [fieldDefinitions, setFieldDefinitions] = useState([]);
  const [additionalFieldErrors, setAdditionalFieldErrors] = useState({});
  const [profilePicture, setProfilePicture] = useState(null);
  const [profilePreview, setProfilePreview] = useState(null);
  const [gstinLoading, setGstinLoading] = useState(false);
  const [gstinData, setGstinData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [shouldRender, setShouldRender] = useState(true);
  const [isFormDirty, setIsFormDirty] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const fileInputRef = useRef(null);
  const nameInputRef = useRef(null);
  const emailInputRef = useRef(null);
  const addressRef = useRef(null);
  // Scroll-to-error targets for custom fields, keyed by field name.
  const customFieldRefs = useRef({});

  // GSTIN API configuration
  const GSTIN_API_KEY = import.meta.env.VITE_APP_GSTIN_API_KEY || "";
  const GSTIN_API_URL = "https://sheet.gstincheck.co.in/check/";
  const gstinRegex =
    /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/;

  useEffect(() => {
    setShouldRender(true);
    setTimeout(() => setIsOpen(true), 10);
    fetchFieldDefinitions();
    return () => {
      setIsOpen(false);
      setProfilePicture(null);
      setProfilePreview(null);
      setGstinData(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    };
  }, []);

  // Pre-fill when editing so edit and create share one form.
  useEffect(() => {
    if (!editVendor) return;
    setForm({
      name: editVendor.name || "",
      email: editVendor.email || "",
      phone: editVendor.phone || "",
      company: editVendor.company || "",
      gstin: editVendor.gstin || "",
      address: {
        line1: editVendor.address?.line1 || "",
        line2: editVendor.address?.line2 || "",
        city: editVendor.address?.city || "",
        state: editVendor.address?.state || "",
        stateCode: editVendor.address?.stateCode || "",
        pincode: editVendor.address?.pincode || "",
        country: editVendor.address?.country || "India",
      },
    });
    if (editVendor.profilePicture) setProfilePreview(editVendor.profilePicture);
    const pf = {};
    (editVendor.additionalFields || []).forEach((f) => {
      pf[f.key] = f.value;
    });
    setAdditionalFields(pf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editVendor]);

  const fetchFieldDefinitions = async () => {
    try {
      const res = await API.get("/vendor-fields");
      if (res.data && res.data.fields) {
        setFieldDefinitions(res.data.fields);
      }
    } catch (err) {
      console.error("Failed to fetch vendor field definitions");
      toast.error("Failed to fetch vendor field definitions");
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

  const fetchGSTINDetails = async () => {
    const gstin = form.gstin?.trim().toUpperCase();

    if (!gstin) {
      toast.error("Please enter GSTIN number first");
      return;
    }

    if (!gstinRegex.test(gstin)) {
      toast.error("Invalid GSTIN format. Please check the number");
      return;
    }

    setGstinLoading(true);
    setGstinData(null);

    try {
      const response = await fetch(`${GSTIN_API_URL}${GSTIN_API_KEY}/${gstin}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.flag === true && data.data) {
        const result = data.data;
        setGstinData(result);

        const addressInfo = result.pradr || {};
        const fullAddress = addressInfo.adr || "";
        const location = addressInfo.loc || "";
        const city = addressInfo.addr.dst || location || "";
        const state =
          addressInfo.std || extractStateFromString(result.stj) || "";
        const pincode = addressInfo.addr.pncd || "";

        const addressParts = fullAddress.split(",").map((part) => part.trim());

        let addressLine1 = "";
        let addressLine2 = "";

        if (addressParts.length >= 2) {
          addressLine1 = addressParts.slice(0, 2).join(", ");
          addressLine2 = addressParts.slice(2).join(", ");
        } else {
          addressLine1 = fullAddress;
        }

        setForm((prevForm) => ({
          ...prevForm,
          name: result.lgnm || prevForm.name,
          company: result.tradeNam || result.lgnm || prevForm.company,
          address: {
            ...prevForm.address,
            line1: addressLine1 || prevForm.address.line1,
            line2: addressLine2 || prevForm.address.line2,
            city: city || prevForm.address.city,
            state: state || prevForm.address.state,
            pincode: pincode || prevForm.address.pincode,
            country: "India",
          },
        }));
        setIsFormDirty(true);
        toast.success("GSTIN details fetched and applied");
      } else if (data.flag === false) {
        const errorMsg = data.message || "GSTIN not found or invalid";
        toast.error(errorMsg);
      } else {
        toast.error("Unexpected response from GSTIN API. Please try again.");
      }
    } catch (error) {
      console.error("GSTIN fetch error:", error);
      toast.error(`Failed to fetch GSTIN details: ${error.message}`);
    } finally {
      setGstinLoading(false);
    }
  };

  const extractStateFromString = (jurisdictionString) => {
    if (!jurisdictionString) return "";
    const stateMatch = jurisdictionString.match(/State\s*-\s*([^,]+)/);
    return stateMatch ? stateMatch[1].trim() : "";
  };

  const clearGSTINData = () => {
    setGstinData(null);
    setIsFormDirty(true);
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
      const reader = new FileReader();
      reader.onload = (e) => {
        setProfilePreview(e.target.result);
      };
      reader.readAsDataURL(file);
      setIsFormDirty(true);
    }
  };

  const renderFieldInput = (fieldDef, value) => {
    const handleFieldChange = (newValue) => {
      setAdditionalFields((prev) => ({
        ...prev,
        [fieldDef.name]: newValue,
      }));
      setIsFormDirty(true);
      if (additionalFieldErrors[fieldDef.name]) {
        setAdditionalFieldErrors((prev) => {
          const next = { ...prev };
          delete next[fieldDef.name];
          return next;
        });
      }
    };

    const inputClassName = "w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50 font-inter";

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
            required={fieldDef.required}
          />
        );

      case "dropdown":
        return (
          <div className="relative">
            <select
              value={value || ""}
              onChange={(e) => handleFieldChange(e.target.value)}
              className={`${inputClassName.replace('h-[38px]', 'h-8 appearance-none')} cursor-pointer bg-white`}
              required={fieldDef.required}
            >
              <option value="">Select {fieldDef.name}</option>
              {fieldDef.options &&
                fieldDef.options.map((option, index) => (
                  <option key={index} value={option}>
                    {option}
                  </option>
                ))}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        );

      case "text":
        return (
          <textarea
            rows={3}
            value={value || ""}
            onChange={(e) => handleFieldChange(e.target.value)}
            className={`${inputClassName.replace('h-[38px]', 'py-2')} rounded-2xl resize-vertical`}
            placeholder={`Enter ${fieldDef.name}`}
            required={fieldDef.required}
          />
        );

      case "date":
        return (
          <input
            type="date"
            value={value || ""}
            onChange={(e) => handleFieldChange(e.target.value)}
            className={inputClassName}
            required={fieldDef.required}
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
            required={fieldDef.required}
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
                    className="flex items-center gap-2 cursor-pointer hover:bg-[#F2F2F7] rounded-xl px-4 py-3 transition-colors border border-transparent hover:border-[#E0E0E1]"
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
                    <span className="text-[14px] text-gray-900 font-medium font-inter">{option}</span>
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
            required={fieldDef.required}
          />
        );
    }
  };


  const handleFormChange = (key, value) => {
    if (key.startsWith("address.")) {
      const addressKey = key.split(".")[1];
      setForm((prev) => ({
        ...prev,
        address: {
          ...prev.address,
          [addressKey]: value,
          // Picking a state by hand fills its GST code too, same as pincode autofill does. A
          // state with no known code leaves whatever code was already there.
          ...(addressKey === "state" && getStateCode(value)
            ? { stateCode: getStateCode(value) }
            : {}),
        },
      }));
      if (addressError) setAddressError(false);
    } else {
      setForm((prev) => ({ ...prev, [key]: value }));
      if (key === "name" && nameError) setNameError(false);
    }
    setIsFormDirty(true);
  };

  // Only the latest lookup may fill the form: editing the pincode while a slower request for
  // the previous value is still out cancels that request instead of letting it land later.
  const pincodeRequestRef = useRef(null);
  const [pincodeLoading, setPincodeLoading] = useState(false);

  // One update instead of one per field, so city/state/country/code all appear together.
  const applyPincodeMatch = (match) => {
    setForm((prev) => ({
      ...prev,
      address: {
        ...prev.address,
        country: match.country,
        state: match.state,
        city: match.city,
        stateCode: match.stateCode || prev.address.stateCode || "",
      },
    }));
    if (addressError) setAddressError(false);
    setIsFormDirty(true);
  };

  const handlePincodeChange = async (e) => {
    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
    handleFormChange("address.pincode", val);

    pincodeRequestRef.current?.abort();
    pincodeRequestRef.current = null;
    if (val.length !== 6) {
      setPincodeLoading(false);
      return;
    }

    if (pincodeCache.has(val)) {
      applyPincodeMatch(pincodeCache.get(val));
      return;
    }

    const controller = new AbortController();
    pincodeRequestRef.current = controller;
    setPincodeLoading(true);
    try {
      const match = await lookupIndianPincode(val, controller.signal);
      if (pincodeRequestRef.current !== controller) return;
      if (match) {
        applyPincodeMatch(match);
        toast.success("Address fetched from pincode");
      }
    } catch (error) {
      if (error.name !== "AbortError") console.error("Failed to fetch pincode details", error);
    } finally {
      if (pincodeRequestRef.current === controller) {
        pincodeRequestRef.current = null;
        setPincodeLoading(false);
      }
    }
  };

  // Address is compulsory: line1, city, state, pincode, country (line2 optional).
  const isAddressComplete = (a) =>
    !!(a.line1?.trim() && a.city?.trim() && a.state?.trim() && a.pincode?.trim() && a.country?.trim());

  const handleSubmit = async (e, isSaveAndExit = false) => {
    e.preventDefault();

    // Check every mandatory field up front — highlight all of them at once,
    // then scroll to whichever invalid one appears first on the page, so the
    // user always lands on the top-most problem.
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const nameInvalid = !form.name.trim();
    const emailInvalid = !!form.email.trim() && !emailRegex.test(form.email.trim());
    const addressInvalid = !isAddressComplete(form.address);
    // Required custom fields only block CREATING a new vendor — a field
    // marked required after a vendor already existed shouldn't retroactively
    // block that older vendor from being saved just because it predates the
    // field.
    const newAdditionalFieldErrors = {};
    if (!isEditing) {
      fieldDefinitions.forEach((fieldDef) => {
        if (fieldDef.required) {
          const value = additionalFields[fieldDef.name];
          if (!value || value.toString().trim() === "") {
            newAdditionalFieldErrors[fieldDef.name] = `${fieldDef.name} is required`;
          }
        }
      });
    }

    setNameError(nameInvalid);
    setEmailError(emailInvalid ? "Invalid email format" : "");
    setAddressError(addressInvalid);
    setAdditionalFieldErrors(newAdditionalFieldErrors);

    if (nameInvalid || emailInvalid || addressInvalid || Object.keys(newAdditionalFieldErrors).length > 0) {
      toast.error("Please fill in all required fields");

      const candidates = [
        nameInvalid ? nameInputRef.current : null,
        emailInvalid ? emailInputRef.current : null,
        addressInvalid ? addressRef.current : null,
        ...Object.keys(newAdditionalFieldErrors).map((name) => customFieldRefs.current[name]),
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

    const formData = new FormData();
    formData.append("name", form.name);
    formData.append("email", form.email);
    formData.append("phone", form.phone);
    formData.append("company", form.company);
    formData.append("gstin", form.gstin);
    formData.append("address", JSON.stringify(form.address));

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

    formData.append(
      "additionalFields",
      JSON.stringify(processedAdditionalFields)
    );

    if (profilePicture) {
      formData.append("avatar", profilePicture);
    }

    try {
      setLoading(true);
      const res = isEditing
        ? await API.put(`/vendors/${editVendor._id}`, formData, {
            headers: { "Content-Type": "multipart/form-data" },
          })
        : await API.post("/vendors", formData, {
            headers: { "Content-Type": "multipart/form-data" },
          });
      toast.success(isEditing ? "Vendor updated successfully!" : "Vendor added successfully!");
      const cb = isEditing ? onVendorUpdated || onVendorCreated : onVendorCreated;
      if (cb && res.data) {
        cb(res.data);
      }
      setIsFormDirty(false);
      closeForm();
    } catch (err) {
      let errorMessage = err.response?.data?.error || err.response?.data?.message || "Failed to save vendor. Please try again.";
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
          errorMessage = "Subscription expired. Please renew to add vendors.";
        } else if (
          errorMessage.includes("Write access to vendors not allowed")
        ) {
          errorMessage =
            "Your plan does not allow adding vendors. Please upgrade your plan.";
        }
      }
      toast.error(errorMessage);
      if (!isSaveAndExit) closeForm();
    } finally {
      setLoading(false);
    }
  };

  if (!shouldRender) return null;

  return (
    <>
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black/50 z-[10004] flex items-center justify-center">
          <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-sm sm:max-w-lg mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
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

      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[10000] transition-opacity duration-300 ease-in-out"
        style={{ opacity: isOpen ? 1 : 0 }}
        onClick={handleClose}
      />

      <div
        className={`fixed dc-panel-card dc-panel-w z-[10002] bg-white shadow-2xl flex flex-col overflow-hidden transform transition-transform duration-300 ease-in-out font-inter ${isOpen ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"
          }`}
      >
        <form onSubmit={handleSubmit} noValidate className="flex flex-col h-full min-h-0">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#D9D9D9] flex-shrink-0 bg-white gap-1">
            <h2 className="text-[15px] font-normal leading-6 text-[#78788D] uppercase tracking-wide">
              {isEditing ? "Edit Vendor" : "Create New Vendor"}
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

          <div className="flex-1 min-h-0 overflow-y-auto p-8 space-y-6">
            <div>
              <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Profile Picture
              </label>
              <div className="flex items-center gap-3">
                {/* Pill-shaped "chosen file" field — shows the filename once
                    picked (or the current photo while editing), otherwise the
                    "Choose a file" placeholder — matching QuickCompanyForm's
                    logo upload. */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 flex items-center px-3 h-[38px] rounded-full border border-[#1F2937]/10 cursor-pointer"
                >
                  <span className="text-[12px] leading-5 text-[#1F2937] opacity-50 truncate">
                    {profilePicture?.name || (profilePreview ? "Current photo" : "Choose a file")}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload profile picture"
                  className="flex-shrink-0 w-[38px] h-[38px] rounded-full bg-[#158FFF] border border-[#1F2937]/10 flex items-center justify-center hover:opacity-90 transition-opacity"
                >
                  <Paperclip className="w-[18px] h-[18px] text-white" strokeWidth={2} />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
              <p className="text-[13px] font-inter text-[#A0A0A0] mt-1.5 uppercase font-medium">PNG, JPG upto 5MB</p>
              {profilePreview && (
                <div className="relative mt-2 inline-block">
                  <img
                    src={profilePreview}
                    alt="Vendor"
                    className="block max-h-20 max-w-[160px] w-auto h-auto object-contain rounded-lg border border-[#E0E0E1]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setProfilePicture(null);
                      setProfilePreview(null);
                      setIsFormDirty(true);
                      if (fileInputRef.current) {
                        fileInputRef.current.value = "";
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

            <div>
              <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Vendor Name <span className="text-red-500">*</span>
              </label>
              <input
                ref={nameInputRef}
                type="text"
                value={form.name}
                onChange={(e) => handleFormChange("name", e.target.value)}
                className={`w-full border rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50 font-inter ${
                  nameError ? "border-red-500" : "border-[#1F2937]/10"
                }`}
                placeholder="Enter Vendor Name"
              />
              {nameError && (
                <p className="mt-1 text-xs text-red-600">Vendor name is required</p>
              )}
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                GSTIN <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.gstin}
                  onChange={(e) =>
                    handleFormChange("gstin", e.target.value.toUpperCase())
                  }
                  className="flex-1 min-w-0 border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50 font-inter"
                  placeholder="GSTIN123456789"
                  maxLength="15"
                />
                <button
                  type="button"
                  onClick={fetchGSTINDetails}
                  disabled={gstinLoading || !form.gstin?.trim()}
                  className={`px-4 h-[38px] text-[13px] font-bold rounded-full transition-colors font-inter flex-shrink-0 ${gstinLoading || !form.gstin?.trim()
                      ? "bg-[#F2F2F7] text-gray-400 cursor-not-allowed"
                      : "bg-[#F2F2F7] text-[#111216] hover:bg-gray-200"
                    }`}
                >
                  {gstinLoading ? "Fetching..." : "Fetch"}
                </button>
              </div>
              {gstinData && (
                <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center mt-0.5">
                      <div className="w-2 h-2 rounded-full bg-green-600"></div>
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-green-800 mb-2">
                        ✓ GSTIN Details Found & Applied
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="font-medium text-green-700">
                            Legal Name:
                          </span>
                          <p className="text-green-600">
                            {gstinData.lgnm || "N/A"}
                          </p>
                        </div>
                        {gstinData.tradeNam && (
                          <div>
                            <span className="font-medium text-green-700">
                              Trade Name:
                            </span>
                            <p className="text-green-600">
                              {gstinData.tradeNam}
                            </p>
                          </div>
                        )}
                        <div>
                          <span className="font-medium text-green-700">
                            Business Type:
                          </span>
                          <p className="text-green-600">
                            {gstinData.ctb || "N/A"}
                          </p>
                        </div>
                        <div>
                          <span className="font-medium text-green-700">
                            Status:
                          </span>
                          <p className="text-green-600">
                            {gstinData.sts || "N/A"}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={clearGSTINData}
                        className="text-xs text-green-600 hover:text-green-800 mt-2 underline"
                      >
                        Clear GSTIN Data
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <p className="text-[12px] text-gray-500 mt-2 font-inter italic">
                Enter a valid 15-digit GSTIN and click "FETCH" to auto-fill company details
              </p>
            </div>

            <div ref={addressRef}>
              <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Address <span className="text-red-500">*</span>
              </label>
              {(() => {
                const inputCls = (missing) =>
                  `w-full border rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50 font-inter ${
                    addressError && missing ? "border-red-500" : "border-[#1F2937]/10"
                  }`;
                const ddCls = (val, missing) =>
                  `w-full border rounded-full px-3 h-[38px] text-[13px] text-left flex items-center justify-between transition-all bg-white font-inter ${val ? "text-[#1F2937]" : "text-[#1F2937] opacity-50"} ${
                    addressError && missing ? "border-red-500" : "border-[#1F2937]/10"
                  }`;
                const statesForCountry = getStatesForCountry(form.address.country);
                return (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={form.address.line1}
                      onChange={(e) => handleFormChange("address.line1", e.target.value)}
                      className={inputCls(!form.address.line1?.trim())}
                      placeholder="Address Line 1 *"
                    />
                    <input
                      type="text"
                      value={form.address.line2}
                      onChange={(e) => handleFormChange("address.line2", e.target.value)}
                      className={inputCls(false)}
                      placeholder="Address Line 2"
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <CustomDropdown
                        options={COUNTRIES}
                        value={form.address.country}
                        onChange={(value) => handleFormChange("address.country", value)}
                        placeholder="Country *"
                        searchable
                        buttonClassName={ddCls(form.address.country, !form.address.country?.trim())}
                      />
                      {statesForCountry.length > 0 ? (
                        <CustomDropdown
                          options={statesForCountry}
                          value={form.address.state}
                          onChange={(value) => handleFormChange("address.state", value)}
                          placeholder="State *"
                          searchable
                          buttonClassName={ddCls(form.address.state, !form.address.state?.trim())}
                        />
                      ) : (
                        <input
                          type="text"
                          value={form.address.state}
                          onChange={(e) => handleFormChange("address.state", e.target.value)}
                          className={inputCls(!form.address.state?.trim())}
                          placeholder="State / Province *"
                        />
                      )}
                      {(() => {
                        const citiesForState = getCitiesForState(City, form.address.country, form.address.state);
                        return citiesForState.length > 0 ? (
                          <CustomDropdown
                            options={citiesForState}
                            value={form.address.city}
                            onChange={(value) => handleFormChange("address.city", value)}
                            placeholder="City *"
                            searchable
                            buttonClassName={ddCls(form.address.city, !form.address.city?.trim())}
                          />
                        ) : (
                          <input
                            type="text"
                            value={form.address.city}
                            onChange={(e) => handleFormChange("address.city", e.target.value)}
                            className={inputCls(!form.address.city?.trim())}
                            placeholder="City *"
                          />
                        );
                      })()}
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={form.address.pincode}
                          onChange={handlePincodeChange}
                          className={inputCls(!form.address.pincode?.trim())}
                          placeholder="Pincode *"
                        />
                        {pincodeLoading && (
                          <span
                            className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-[#0085FF] border-t-transparent rounded-full animate-spin"
                            aria-label="Looking up pincode"
                          />
                        )}
                      </div>
                      <input
                        type="text"
                        value={form.address.stateCode || ""}
                        onChange={(e) => handleFormChange("address.stateCode", e.target.value)}
                        className={inputCls(false)}
                        placeholder="State Code"
                      />
                    </div>
                    {addressError && (
                      <p className="text-xs text-red-600">All fields marked * are required</p>
                    )}
                  </div>
                );
              })()}
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Email
              </label>
              <input
                ref={emailInputRef}
                type="email"
                value={form.email}
                onChange={(e) => {
                  handleFormChange("email", e.target.value);
                  if (emailError) setEmailError("");
                }}
                className={`w-full border rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50 font-inter ${
                  emailError ? "border-red-500" : "border-[#1F2937]/10"
                }`}
                placeholder="Enter Vendor Email"
              />
              {emailError && (
                <p className="mt-1 text-xs text-red-600">{emailError}</p>
              )}
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Phone
              </label>
              <PhoneNumberInput
                value={form.phone}
                onChange={(next) => handleFormChange("phone", next)}
                placeholder="Enter Phone Number"
                selectClassName="border border-[#1F2937]/10 rounded-full px-2 h-[38px] text-[13px] text-[#1F2937] bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all flex-shrink-0"
                inputClassName="flex-1 min-w-0 border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50 font-inter"
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Company
              </label>
              <input
                type="text"
                value={form.company}
                onChange={(e) => handleFormChange("company", e.target.value)}
                className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50 font-inter"
                placeholder="Enter Company Name"
              />
            </div>

            {fieldDefinitions.length > 0 && (
              <div className="pt-4 space-y-6">
                <h3 className="text-[16px] font-bold text-[#111216]">
                  Custom Fields
                </h3>
                <div className="space-y-6 font-inter">
                  {fieldDefinitions.map((fieldDef) => (
                    <div key={fieldDef.name} ref={(el) => (customFieldRefs.current[fieldDef.name] = el)}>
                      <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                        {fieldDef.name} {fieldDef.required && <span className="text-red-500">*</span>}
                      </label>
                      {renderFieldInput(
                        fieldDef,
                        additionalFields[fieldDef.name]
                      )}
                      {additionalFieldErrors[fieldDef.name] && (
                        <p className="mt-1 text-xs text-red-600">{additionalFieldErrors[fieldDef.name]}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
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
              {loading ? "Saving..." : isEditing ? "Update Vendor" : "Create New Vendor"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
};

export default QuickVendorForm;
