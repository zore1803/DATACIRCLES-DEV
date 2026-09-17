import Checkbox from "../common/Checkbox";
import React, { useEffect, useState, useRef } from "react";
import { COUNTRY_DIAL_CODES, DEFAULT_DIAL_CODE } from "../../utils/countryDialCodes";
import { X, Paperclip, Twitter, Linkedin, Instagram, Facebook } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import API from "../../services/api";
import CustomDropdown from "../common/CustomDropdown";
import toast from "react-hot-toast";
import { Country, State } from "country-state-city";
import { loadCityModule, useLazyCity } from "../../utils/lazyCityData";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

// India first (GST is India-driven), then every other country alphabetically —
// full list/state data from country-state-city instead of a hand-maintained one.
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
// `City` is null until utils/lazyCityData's chunk resolves — city options
// are simply empty until then, same as the "no data for this state" case
// the field already falls back to a plain input for.
const getCitiesForState = (City, countryName, stateName) => {
  if (!City) return [];
  const countryIso = countryIsoByName[countryName];
  if (!countryIso) return [];
  const stateIso = State.getStatesOfCountry(countryIso).find((s) => s.name === stateName)?.isoCode;
  if (!stateIso) return [];
  return City.getCitiesOfState(countryIso, stateIso).map((c) => c.name);
};

// Looks up an Indian PIN code via India Post's public API (no key required)
// to fill state/city automatically — pincode uniquely determines both, so
// asking the user to also pick them by hand is redundant once it's typed.
// Country-state-city's own state names are used for the result (not the raw
// API district name) so the value lands on a real option in the State/City
// dropdowns above rather than a lookalike string that fails to match.
const lookupIndianPincode = async (pincode) => {
  if (!/^\d{6}$/.test(pincode)) return null;
  try {
    const [res, City] = await Promise.all([
      fetch(`https://api.postalpincode.in/pincode/${pincode}`),
      loadCityModule(),
    ]);
    const data = await res.json();
    const po = data?.[0]?.Status === "Success" ? data[0].PostOffice?.[0] : null;
    if (!po) return null;

    const countryIso = countryIsoByName["India"];
    const matchedState = State.getStatesOfCountry(countryIso).find(
      (s) => s.name.toLowerCase() === po.State?.toLowerCase(),
    );
    if (!matchedState) return null;

    const cities = City.getCitiesOfState(countryIso, matchedState.isoCode).map((c) => c.name);
    const districtOrTaluk = po.District || po.Block || po.Taluk || "";
    const matchedCity =
      cities.find((c) => c.toLowerCase() === districtOrTaluk.toLowerCase()) ||
      cities.find((c) => c.toLowerCase() === po.Name?.toLowerCase()) ||
      districtOrTaluk ||
      po.Name ||
      "";

    return { country: "India", state: matchedState.name, city: matchedCity };
  } catch (_) {
    return null; // Non-fatal — the user can still fill state/city by hand.
  }
};

const QuickCompanyForm = ({ onCompanyCreated, onCompanyUpdated, onRequestClose, editCompany = null }) => {
  const City = useLazyCity();
  const isEditing = !!editCompany;
  const emptyAddress = {
    addressLine1: "",
    addressLine2: "",
    pincode: "",
    city: "",
    state: "",
    country: "",
  };
  const [form, setForm] = useState({
    name: "",
    industry: "",
    // Exactly one billing address (GST is derived from its state).
    billingAddress: { ...emptyAddress },
    // One or more shipping addresses; each can mirror the billing address.
    shippingAddresses: [{ ...emptyAddress, sameAsBilling: false }],
    website: "",
    email: "",
    gstin: "", // Added gstin field
    whatsappNumber: { countryCode: DEFAULT_DIAL_CODE, number: "" },
    profilePicture: null,
    socialMedia: {
      twitter: "",
      linkedin: "",
      instagram: "",
      facebook: "",
      whatsapp: "",
    },
  });
  const [nameError, setNameError] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [billingAddressError, setBillingAddressError] = useState(false);
  const [shippingAddressErrors, setShippingAddressErrors] = useState([]);
  const [additionalFields, setAdditionalFields] = useState({});
  const [fieldDefinitions, setFieldDefinitions] = useState([]);
  const [additionalFieldErrors, setAdditionalFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [shouldRender, setShouldRender] = useState(true);
  const [isFormDirty, setIsFormDirty] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [industries, setIndustries] = useState([]);
  const profilePictureInputRef = useRef(null);
  const nameInputRef = useRef(null);
  const emailInputRef = useRef(null);
  const billingAddressRef = useRef(null);
  const shippingAddressRefs = useRef([]);
  // Scroll-to-error targets for custom fields, keyed by field name.
  const customFieldRefs = useRef({});
  // Object URL for whatever file is currently picked, so both create and edit
  // show the actual image instead of just its filename. Revoked whenever the
  // selection changes or the form unmounts, since object URLs otherwise leak.
  const [profilePicturePreview, setProfilePicturePreview] = useState(null);
  useBodyScrollLock(isOpen);
  useEffect(() => {
    if (!form.profilePicture) {
      setProfilePicturePreview(null);
      return;
    }
    const url = URL.createObjectURL(form.profilePicture);
    setProfilePicturePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [form.profilePicture]);
  // Set when the user clears a picture via the X on the preview — hides the
  // company's already-uploaded logo even though editCompany still has it,
  // until a new file is picked (which naturally takes over via the preview).
  const [removeExistingLogo, setRemoveExistingLogo] = useState(false);
  // Edit mode starts with the company's already-uploaded picture; a freshly
  // picked file (above) takes over from it once one is chosen.
  const profilePictureDisplayUrl =
    profilePicturePreview ||
    (isEditing && !removeExistingLogo && editCompany?.profilePicture
      ? editCompany.profilePicture.startsWith("http")
        ? editCompany.profilePicture
        : `${import.meta.env.VITE_APP_API_URL}${editCompany.profilePicture}`
      : null);

  useEffect(() => {
    setShouldRender(true);
    setTimeout(() => setIsOpen(true), 10);
    fetchFieldDefinitions();
    fetchIndustries();
    return () => {
      setIsOpen(false);
    };
  }, []);

  // Pre-fill when editing an existing company so edit and create share one form.
  useEffect(() => {
    if (!editCompany) return;
    setRemoveExistingLogo(false);
    setForm({
      name: editCompany.name || "",
      industry: editCompany.industry || "",
      billingAddress: { ...emptyAddress, ...(editCompany.billingAddress || {}) },
      shippingAddresses:
        editCompany.shippingAddresses && editCompany.shippingAddresses.length
          ? editCompany.shippingAddresses.map((a) => ({ ...emptyAddress, ...a, sameAsBilling: false }))
          : [{ ...emptyAddress, sameAsBilling: false }],
      website: editCompany.website || "",
      email: editCompany.email || "",
      gstin: editCompany.gstin || "",
      whatsappNumber: {
        countryCode: editCompany.whatsappNumber?.countryCode || DEFAULT_DIAL_CODE,
        number: editCompany.whatsappNumber?.number || "",
      },
      profilePicture: null,
      socialMedia: {
        twitter: "",
        linkedin: "",
        instagram: "",
        facebook: "",
        whatsapp: "",
        ...(editCompany.socialMedia || {}),
      },
    });
    const pf = {};
    (editCompany.additionalFields || []).forEach((f) => {
      pf[f.key] = f.value;
    });
    setAdditionalFields(pf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editCompany]);

  const fetchFieldDefinitions = async () => {
    try {
      const res = await API.get("/company-fields");
      if (res.data && res.data.fields) {
        setFieldDefinitions(res.data.fields);
      }
    } catch (err) {
      console.error("Failed to fetch field definitions");
      toast.error("Failed to fetch field definitions");
    }
  };

  const fetchIndustries = async () => {
    try {
      const res = await API.get("/company-industries");
      if (res.data) {
        // Ensure we extract names if the API returns objects
        const data = res.data;
        const industryList = Array.isArray(data)
          ? data.map((item) => (typeof item === "object" ? item.name : item))
          : [];
        setIndustries(industryList);
      }
    } catch (err) {
      console.error("Failed to fetch industries:", err);
      toast.error("Failed to load industries");
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

    switch (fieldDef.type) {
      case "number":
        return (
          <input
            type="number"
            step="any"
            value={value || ""}
            onChange={(e) => handleFieldChange(e.target.value)}
            className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all font-inter"
            required={fieldDef.required}
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
            className="w-full border border-[#1F2937]/10 rounded-2xl px-3 py-2 text-[12px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all font-inter resize-vertical"
            required={fieldDef.required}
          />
        );

      case "date":
        return (
          <input
            type="date"
            value={value || ""}
            onChange={(e) => handleFieldChange(e.target.value)}
            className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all font-inter"
            required={fieldDef.required}
          />
        );

      case "url":
        return (
          <input
            type="url"
            value={value || ""}
            onChange={(e) => handleFieldChange(e.target.value)}
            className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all font-inter placeholder:text-[#1F2937] placeholder:opacity-50"
            required={fieldDef.required}
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
                    className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded-full px-3 h-8 transition-colors border border-transparent hover:border-[#1F2937]/10"
                  >
                    <Checkbox checked={isChecked} onChange={(e) => {
                        let newValues;
                        if (e.target.checked) {
                          // Add option to array
                          newValues = [...selectedValues, option];
                        } else {
                          // Remove option from array
                          newValues = selectedValues.filter((v) => v !== option);
                        }
                        handleFieldChange(newValues);
                      }} />
                    <span className="text-[12px] text-[#1F2937] font-medium font-inter">{option}</span>
                  </label>
                );
              })}
            {(!fieldDef.options || fieldDef.options.length === 0) && (
              <p className="text-sm text-gray-500 italic">
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
            className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all font-inter"
            required={fieldDef.required}
          />
        );
    }
  };


  const handleSubmit = async (e, isSaveAndExit = false) => {
    e.preventDefault();

    // Check every mandatory field up front — highlight all of them at once,
    // then scroll to whichever invalid one appears first on the page (not
    // necessarily the one checked first here), so the user always lands on
    // the top-most problem instead of being surprised by one further down
    // after fixing what looked like the only error.
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const nameInvalid = !form.name.trim();
    const emailInvalid = !!form.email.trim() && !emailRegex.test(form.email.trim());
    const billingInvalid = !isAddressComplete(form.billingAddress);
    const newShippingErrors = form.shippingAddresses.map(
      (ship) => !isAddressComplete(ship)
    );
    // Required custom fields only block CREATING a new company — a field
    // marked required after a company already existed shouldn't retroactively
    // block that older company from being saved just because it predates the
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
    setBillingAddressError(billingInvalid);
    setShippingAddressErrors(newShippingErrors);
    setAdditionalFieldErrors(newAdditionalFieldErrors);

    if (
      nameInvalid ||
      emailInvalid ||
      billingInvalid ||
      newShippingErrors.some(Boolean) ||
      Object.keys(newAdditionalFieldErrors).length > 0
    ) {
      toast.error("Please fill in all required fields");

      const candidates = [
        nameInvalid ? nameInputRef.current : null,
        emailInvalid ? emailInputRef.current : null,
        billingInvalid ? billingAddressRef.current : null,
        ...newShippingErrors.map((invalid, i) => (invalid ? shippingAddressRefs.current[i] : null)),
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

    // One-line summary of the billing address, kept in the legacy `address`
    // field so existing search/filters keep working.
    const legacyAddress = [
      form.billingAddress.addressLine1,
      form.billingAddress.addressLine2,
      form.billingAddress.city,
      form.billingAddress.state,
      form.billingAddress.pincode,
      form.billingAddress.country,
    ]
      .filter(Boolean)
      .join(", ");

    // Strip the UI-only `sameAsBilling` flag before sending.
    const shippingPayload = form.shippingAddresses.map(
      ({ sameAsBilling, ...addr }) => addr
    );

    const payload = new FormData();
    payload.append("name", form.name);
    payload.append("industry", form.industry);
    payload.append("address", legacyAddress);
    payload.append("billingAddress", JSON.stringify(form.billingAddress));
    payload.append("shippingAddresses", JSON.stringify(shippingPayload));
    payload.append("website", form.website);
    payload.append("email", form.email);
    payload.append("gstin", form.gstin); // Added gstin to payload
    payload.append(
      "whatsappNumber[countryCode]",
      form.whatsappNumber?.number ? form.whatsappNumber?.countryCode || DEFAULT_DIAL_CODE : ""
    );
    payload.append("whatsappNumber[number]", form.whatsappNumber?.number || "");
    payload.append("socialMedia[twitter]", form.socialMedia.twitter || "");
    payload.append("socialMedia[linkedin]", form.socialMedia.linkedin || "");
    payload.append("socialMedia[instagram]", form.socialMedia.instagram || "");
    payload.append("socialMedia[facebook]", form.socialMedia.facebook || "");
    payload.append("socialMedia[whatsapp]", form.socialMedia.whatsapp || "");

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

    if (form.profilePicture) {
      payload.append("profilePicture", form.profilePicture);
    }

    try {
      setLoading(true);
      const res = isEditing
        ? await API.put(`/companies/${editCompany._id}`, payload, {
            headers: { "Content-Type": "multipart/form-data" },
          })
        : await API.post("/companies", payload, {
            headers: { "Content-Type": "multipart/form-data" },
          });
      toast.success(isEditing ? "Company updated successfully!" : "Company added successfully!");
      const cb = isEditing ? onCompanyUpdated || onCompanyCreated : onCompanyCreated;
      if (cb && res.data) {
        cb(res.data);
      }
      setIsFormDirty(false);
      closeForm();
    } catch (err) {
      let errorMessage = err.response?.data?.error || err.response?.data?.message || "Failed to save company. Please try again.";
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
          errorMessage =
            "Subscription expired. Please renew to add or update companies.";
        } else if (
          errorMessage.includes("Write access to companies not allowed")
        ) {
          errorMessage =
            "Your plan does not allow adding or updating companies. Please upgrade your plan.";
        }
      }
      toast.error(errorMessage);
      if (!isSaveAndExit) closeForm();
    } finally {
      setLoading(false);
    }
  };

  const handleFormChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setIsFormDirty(true);
  };

  const handleSocialMediaChange = (platform, value) => {
    setForm((prev) => ({
      ...prev,
      socialMedia: { ...prev.socialMedia, [platform]: value },
    }));
    setIsFormDirty(true);
  };

  // Update one field of the single billing address. Any shipping address that
  // is set to "same as billing" mirrors the change.
  const handleBillingChange = (field, value) => {
    setForm((prev) => {
      const billingAddress = { ...prev.billingAddress, [field]: value };
      const shippingAddresses = prev.shippingAddresses.map((s) =>
        s.sameAsBilling ? { ...billingAddress, sameAsBilling: true } : s
      );
      return { ...prev, billingAddress, shippingAddresses };
    });
    setIsFormDirty(true);
    if (billingAddressError) setBillingAddressError(false);
  };

  // Update one field of the shipping address at `index`.
  const handleShippingChange = (index, field, value) => {
    setForm((prev) => ({
      ...prev,
      shippingAddresses: prev.shippingAddresses.map((s, i) =>
        i === index ? { ...s, [field]: value } : s
      ),
    }));
    setIsFormDirty(true);
    if (shippingAddressErrors[index]) {
      setShippingAddressErrors((prev) =>
        prev.map((e, i) => (i === index ? false : e))
      );
    }
  };

  // Toggle "same as billing" for one shipping address; copy billing in when on.
  const handleShippingSameAsBilling = (index, checked) => {
    setForm((prev) => ({
      ...prev,
      shippingAddresses: prev.shippingAddresses.map((s, i) =>
        i === index
          ? checked
            ? { ...prev.billingAddress, sameAsBilling: true }
            : { ...s, sameAsBilling: false }
          : s
      ),
    }));
    setIsFormDirty(true);
  };

  const addShippingAddress = () => {
    setForm((prev) => ({
      ...prev,
      shippingAddresses: [...prev.shippingAddresses, { ...emptyAddress, sameAsBilling: false }],
    }));
    setIsFormDirty(true);
  };

  const removeShippingAddress = (index) => {
    setForm((prev) => ({
      ...prev,
      shippingAddresses: prev.shippingAddresses.filter((_, i) => i !== index),
    }));
    setIsFormDirty(true);
  };

  // Address is compulsory: line1, city, state, pincode, country (line2 optional).
  const isAddressComplete = (a) =>
    !!(a.addressLine1?.trim() && a.city?.trim() && a.state?.trim() && a.pincode?.trim() && a.country?.trim());

  // Shared 6-field address grid, reused by billing and each shipping address.
  const renderAddressGrid = (address, onFieldChange, disabled, showError) => {
    const inputCls = (missing) =>
      `w-full border rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50 disabled:bg-gray-50 disabled:text-gray-400 ${
        showError && missing ? "border-red-500" : "border-[#1F2937]/10"
      }`;
    const ddCls = (val, missing) =>
      `w-full border rounded-full px-3 h-[38px] text-[13px] text-left flex items-center justify-between transition-all bg-white font-inter disabled:bg-gray-50 disabled:text-gray-400 ${val ? "text-[#1F2937]" : "text-[#1F2937] opacity-50"} ${
        showError && missing ? "border-red-500" : "border-[#1F2937]/10"
      }`;
    return (
      <fieldset disabled={disabled} className={`space-y-3 ${disabled ? "opacity-70" : ""}`}>
        <input
          type="text"
          value={address.addressLine1}
          onChange={(e) => onFieldChange("addressLine1", e.target.value)}
          className={inputCls(!address.addressLine1?.trim())}
          placeholder="Address Line 1 *"
        />
        <input
          type="text"
          value={address.addressLine2}
          onChange={(e) => onFieldChange("addressLine2", e.target.value)}
          className={inputCls(false)}
          placeholder="Address Line 2"
        />
        <div className="grid grid-cols-2 gap-3">
          <CustomDropdown
            options={COUNTRIES}
            value={address.country}
            onChange={(value) => onFieldChange("country", value)}
            placeholder="Country *"
            searchable
            buttonClassName={ddCls(address.country, !address.country?.trim())}
          />
          {(() => {
            const statesForCountry = getStatesForCountry(address.country);
            // A handful of small countries have no state/province subdivisions
            // in the dataset — fall back to free text rather than showing an
            // empty, unusable dropdown.
            return statesForCountry.length > 0 ? (
              <CustomDropdown
                options={statesForCountry}
                value={address.state}
                onChange={(value) => onFieldChange("state", value)}
                placeholder="State *"
                searchable
                buttonClassName={ddCls(address.state, !address.state?.trim())}
              />
            ) : (
              <input
                type="text"
                value={address.state}
                onChange={(e) => onFieldChange("state", e.target.value)}
                className={inputCls(!address.state?.trim())}
                placeholder="State / Province *"
              />
            );
          })()}
          {(() => {
            const citiesForState = getCitiesForState(City, address.country, address.state);
            // Same fallback as State above: some state/country combinations
            // have no city data, so a free-text field keeps it usable rather
            // than showing an empty dropdown with nothing to pick.
            return citiesForState.length > 0 ? (
              <CustomDropdown
                options={citiesForState}
                value={address.city}
                onChange={(value) => onFieldChange("city", value)}
                placeholder="City *"
                searchable
                buttonClassName={ddCls(address.city, !address.city?.trim())}
              />
            ) : (
              <input
                type="text"
                value={address.city}
                onChange={(e) => onFieldChange("city", e.target.value)}
                className={inputCls(!address.city?.trim())}
                placeholder="City *"
              />
            );
          })()}
          <input
            type="text"
            inputMode="numeric"
            value={address.pincode}
            onChange={async (e) => {
              const pincode = e.target.value.replace(/\D/g, "").slice(0, 6);
              onFieldChange("pincode", pincode);
              // Only once all 6 digits are in — a lookup on every keystroke
              // would fire five requests for pincodes India Post will 404 on
              // anyway, and briefly show a wrong match while still typing.
              if (pincode.length === 6) {
                const match = await lookupIndianPincode(pincode);
                if (match) {
                  onFieldChange("country", match.country);
                  onFieldChange("state", match.state);
                  onFieldChange("city", match.city);
                }
              }
            }}
            className={inputCls(!address.pincode?.trim())}
            placeholder="Pincode *"
          />
        </div>
        {showError && !disabled && (
          <p className="text-xs text-red-600">All fields marked * are required</p>
        )}
      </fieldset>
    );
  };

  if (!shouldRender) return null;

  return (
    <>
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black/50 z-[10004] flex items-center justify-center">
          <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-sm sm:max-w-lg mx-4">
            <h3 className="text-lg font-semibold font-sf text-gray-900 mb-4">
              Unsaved Changes
            </h3>
            <p className="text-sm text-gray-600 mb-6 font-inter">
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

      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[10000] transition-opacity duration-300 ease-in-out"
        style={{ opacity: isOpen ? 1 : 0 }}
        onClick={handleClose}
      />

      <div
        className={`
          fixed dc-panel-card dc-panel-w z-[10003]
          bg-white shadow-2xl flex flex-col overflow-hidden
          transform transition-transform duration-300 ease-in-out font-inter
          ${isOpen ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"}
        `}
      >
        <form onSubmit={handleSubmit} noValidate className="flex flex-col h-full min-h-0">
          {/* Sticky header — matches the CompanyForm header spec */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#D9D9D9] flex-shrink-0 bg-white gap-1">
            <h2 className="text-[15px] font-normal leading-6 text-[#78788D] uppercase tracking-wide">
              {isEditing ? "Edit Company" : "Create New Company"}
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
          <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6 space-y-6">
            <div>
              <label className="block text-[13px] font-medium text-[#161618] mb-2 tracking-[-0.05em]">
                Company Logo
              </label>
              <div className="flex items-center gap-3">
                {/* Pill-shaped "chosen file" field — shows the filename once
                    picked (or the current company logo's name while editing),
                    otherwise the "Choose a file" placeholder. */}
                <div
                  onClick={() => profilePictureInputRef.current?.click()}
                  className="flex-1 flex items-center px-3 h-[38px] rounded-full border border-[#1F2937]/10 cursor-pointer"
                >
                  <span className="text-[12px] leading-5 text-[#1F2937] opacity-50 truncate">
                    {form.profilePicture?.name ||
                      (profilePictureDisplayUrl ? "Current logo" : "Choose a file")}
                  </span>
                </div>
                {/* Circular attach button — opens the file picker (the actual
                    <input type=file> is hidden and triggered via the ref, same
                    as before). */}
                <button
                  type="button"
                  onClick={() => profilePictureInputRef.current?.click()}
                  title="Upload company logo"
                  className="flex-shrink-0 w-[38px] h-[38px] rounded-full bg-[#158FFF] border border-[#1F2937]/10 flex items-center justify-center hover:opacity-90 transition-opacity"
                >
                  <Paperclip className="w-[18px] h-[18px] text-white" strokeWidth={2} />
                </button>
                <input
                  ref={profilePictureInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    handleFormChange("profilePicture", e.target.files[0]);
                  }}
                  className="hidden"
                />
              </div>
              <p className="text-[13px] font-inter text-[#A0A0A0] mt-1.5 uppercase font-medium">PNG, JPEG upto 5MB</p>
              {/* Preview of the selected/current logo, since the pill field
                  above only shows a filename, not the image itself. The X
                  clears whichever picture is showing — a freshly picked file,
                  or (while editing) the company's already-uploaded one — so
                  the user can pick a different one or leave it blank. */}
              {profilePictureDisplayUrl && (
                <div className="relative mt-2 inline-block">
                  <img
                    src={profilePictureDisplayUrl}
                    alt="Company"
                    className="block max-h-20 max-w-[160px] w-auto h-auto object-contain rounded-lg border border-[#E0E0E1]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      handleFormChange("profilePicture", null);
                      setRemoveExistingLogo(true);
                      if (profilePictureInputRef.current) {
                        profilePictureInputRef.current.value = "";
                      }
                    }}
                    title="Remove logo"
                    aria-label="Remove logo"
                    className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white border border-[#E0E0E1] shadow-sm flex items-center justify-center text-[#1C1B1F] hover:bg-gray-50 transition-colors"
                  >
                    <X className="w-3 h-3" strokeWidth={2.5} />
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Company Name <span className="text-[#FF4935]">*</span>
              </label>
              <input
                ref={nameInputRef}
                type="text"
                value={form.name}
                onChange={(e) => {
                  handleFormChange("name", e.target.value);
                  if (nameError) setNameError(false);
                }}
                className={`w-full border rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50 ${
                  nameError ? "border-red-500" : "border-[#1F2937]/10"
                }`}
                placeholder="Enter Company Name"
              />
              {nameError && (
                <p className="mt-1 text-xs text-red-600">Company name is required</p>
              )}
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Industry
              </label>
              <CustomDropdown
                options={industries}
                value={form.industry}
                onChange={(value) => handleFormChange("industry", value)}
                placeholder="Select Industry"
                searchable
                buttonClassName={`w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-left flex items-center justify-between transition-all bg-white font-inter ${form.industry ? "text-[#1F2937]" : "text-[#1F2937] opacity-50"}`}
              />
            </div>

            {/* WhatsApp Number — a dialable number, so it sits with the
                company's own details rather than under Social Media Links
                (which holds profile URLs). */}
            <div>
              <label className="flex items-center gap-2 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                <span className="flex-shrink-0 w-[18px] h-[18px] flex items-center justify-center">
                  <FaWhatsapp className="w-[18px] h-[18px]" />
                </span>
                WhatsApp Number
              </label>
              <div className="flex items-stretch gap-2">
                <select
                  value={form.whatsappNumber?.countryCode || DEFAULT_DIAL_CODE}
                  onChange={(e) =>
                    handleFormChange("whatsappNumber", {
                      ...(form.whatsappNumber || {}),
                      countryCode: e.target.value,
                    })
                  }
                  className="border border-[#1F2937]/10 rounded-full px-2 h-[38px] text-[13px] text-[#1F2937] bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all flex-shrink-0"
                >
                  {COUNTRY_DIAL_CODES.map((c) => (
                    <option key={`${c.iso}-${c.code}`} value={c.code}>
                      {c.iso} {c.code}
                    </option>
                  ))}
                </select>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={form.whatsappNumber?.number || ""}
                  onChange={(e) =>
                    handleFormChange("whatsappNumber", {
                      countryCode: form.whatsappNumber?.countryCode || DEFAULT_DIAL_CODE,
                      number: e.target.value.replace(/[^0-9]/g, ""),
                    })
                  }
                  className="flex-1 min-w-0 border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50"
                  placeholder="1234567890"
                />
              </div>
            </div>

            <div>
              <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                GSTIN
              </label>
              <input
                type="text"
                value={form.gstin}
                onChange={(e) => handleFormChange("gstin", e.target.value)}
                className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50"
                placeholder="eg., 22ABCDE1234F1Z5"
              />
            </div>

            {/* Billing Address (single — GST is calculated from its state) */}
            <div ref={billingAddressRef}>
              <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Billing Address <span className="text-[#FF4935]">*</span>
              </label>
              {renderAddressGrid(
                form.billingAddress,
                (field, value) => handleBillingChange(field, value),
                false,
                billingAddressError
              )}
            </div>

            {/* Shipping Addresses (one or more) */}
            {form.shippingAddresses.map((ship, index) => (
              <div key={index} ref={(el) => (shippingAddressRefs.current[index] = el)}>
                <div className="flex items-center justify-between mb-3">
                  <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em]">
                    Shipping Address{form.shippingAddresses.length > 1 ? ` ${index + 1}` : ""}{" "}
                    <span className="text-[#FF4935]">*</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={!!ship.sameAsBilling} onChange={(e) => handleShippingSameAsBilling(index, e.target.checked)} />
                      <span className="text-[13px] font-medium text-[#525866]">
                        Same as billing
                      </span>
                    </label>
                    {form.shippingAddresses.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeShippingAddress(index)}
                        className="text-[13px] font-medium text-[#DF120B] hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                {renderAddressGrid(
                  ship,
                  (field, value) => handleShippingChange(index, field, value),
                  !!ship.sameAsBilling,
                  !!shippingAddressErrors[index]
                )}
              </div>
            ))}

            <button
              type="button"
              onClick={addShippingAddress}
              className="self-start text-[13px] font-semibold text-[#0C4FCD] hover:underline"
            >
              + Add another shipping address
            </button>

            {fieldDefinitions.length > 0 && (
              <div className="pt-4 space-y-4">
                <div className="flex items-center gap-3">
                  <span className="flex-1 h-px bg-[#D9D9D9]" />
                  <h3 className="flex-shrink-0 text-[14px] font-medium leading-[120%] text-[#1F2937]">
                    Custom Fields
                  </h3>
                  <span className="flex-1 h-px bg-[#D9D9D9]" />
                </div>
                {fieldDefinitions.map((fieldDef) => (
                  <div key={fieldDef.name} ref={(el) => (customFieldRefs.current[fieldDef.name] = el)}>
                    <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                      {fieldDef.name} {fieldDef.required && <span className="text-[#FF4935]">*</span>}
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
            )}

            <div>
              <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Website
              </label>
              {/* "https://" is a fixed prefix, not part of the typed value — only
                  the domain is editable, so nobody has to type the scheme. An
                  existing website (from editing a company) that already has a
                  protocol keeps it stripped here for display and re-added on
                  change; one saved without a protocol is treated the same way. */}
              <div className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] flex items-center gap-0.5 focus-within:ring-1 focus-within:ring-blue-500 transition-all">
                <span className="text-[12px] text-[#1F2937] opacity-50 flex-shrink-0">
                  https://
                </span>
                <input
                  type="text"
                  value={form.website.replace(/^https?:\/\//i, "")}
                  onChange={(e) =>
                    handleFormChange(
                      "website",
                      `https://${e.target.value.replace(/^https?:\/\//i, "")}`
                    )
                  }
                  className="flex-1 min-w-0 h-full text-[12px] text-[#1F2937] focus:outline-none placeholder:text-[#1F2937] placeholder:opacity-50 bg-transparent"
                  placeholder="www.company.com"
                  required
                />
              </div>
            </div>

            {/* Email Address */}
            <div>
              <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Email Address
              </label>
              <input
                ref={emailInputRef}
                type="email"
                value={form.email}
                onChange={(e) => {
                  handleFormChange("email", e.target.value);
                  if (emailError) setEmailError("");
                }}
                className={`w-full border rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50 ${
                  emailError ? "border-red-500" : "border-[#1F2937]/10"
                }`}
                placeholder="contact@company.com"
              />
              {emailError && (
                <p className="mt-1 text-xs text-red-600">{emailError}</p>
              )}
            </div>

            {/* Social Media Links — icon + pill input per platform, matching
                the spec's Frame 198 layout. */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="flex-1 h-px bg-[#D9D9D9]" />
                <h3 className="flex-shrink-0 text-[14px] font-medium leading-[120%] text-[#1F2937]">
                  Social Media Links
                </h3>
                <span className="flex-1 h-px bg-[#D9D9D9]" />
              </div>
              <div className="space-y-3">
                <div>
                  <label className="flex items-center gap-2 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                    <span className="flex-shrink-0 w-[18px] h-[18px] flex items-center justify-center">
                      <Twitter className="w-[18px] h-[18px]" strokeWidth={2} />
                    </span>
                    X (Twitter)
                  </label>
                  <input
                    type="url"
                    value={form.socialMedia.twitter}
                    onChange={(e) => handleSocialMediaChange("twitter", e.target.value)}
                    className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50"
                    placeholder="https://x.com/vendorname"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                    <span className="flex-shrink-0 w-[18px] h-[18px] flex items-center justify-center">
                      <Linkedin className="w-[18px] h-[18px]" strokeWidth={2} />
                    </span>
                    LinkedIn
                  </label>
                  <input
                    type="url"
                    value={form.socialMedia.linkedin}
                    onChange={(e) => handleSocialMediaChange("linkedin", e.target.value)}
                    className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50"
                    placeholder="https://linkedin.com/vendorname"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                    <span className="flex-shrink-0 w-[18px] h-[18px] flex items-center justify-center">
                      <Instagram className="w-[18px] h-[18px]" strokeWidth={2} />
                    </span>
                    Instagram
                  </label>
                  <input
                    type="url"
                    value={form.socialMedia.instagram}
                    onChange={(e) => handleSocialMediaChange("instagram", e.target.value)}
                    className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50"
                    placeholder="https://instagram.com/vendorname"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                    <span className="flex-shrink-0 w-[18px] h-[18px] flex items-center justify-center">
                      <Facebook className="w-[18px] h-[18px]" strokeWidth={2} />
                    </span>
                    Facebook
                  </label>
                  <input
                    type="url"
                    value={form.socialMedia.facebook}
                    onChange={(e) => handleSocialMediaChange("facebook", e.target.value)}
                    className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50"
                    placeholder="https://facebook.com/vendorname"
                  />
                </div>
              </div>
            </div>

          </div>

          {/* Sticky footer — compact, matching the note editor card */}
          <div className="flex-shrink-0 py-2.5 px-4 border-t border-gray-100 bg-white flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="px-6 py-2 border border-gray-200 text-gray-700 rounded-[25px] text-sm font-bold hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              className="px-6 py-2 bg-[#158FFF] text-white rounded-[25px] text-sm font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              type="submit"
              disabled={loading}
            >
              {loading ? "Saving..." : isEditing ? "Update Company" : "Create Company"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
};

export default QuickCompanyForm;