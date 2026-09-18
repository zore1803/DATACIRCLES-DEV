import CellphoneIcon from "../common/CellphoneIcon";
import React, { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import API from "../../services/api";
import { useNavigate } from "react-router-dom";
import { INDIA_STATES } from "../../constants/addressOptions";
import PageSkeleton from "../common/PageSkeleton";
import {
  Save,
  Palette,
  Building2,
  ArrowLeft,
  AlertCircle,
  Mail,
  MapPin,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  X,
  Info,
} from "lucide-react";
import UploadIcon from "../common/UploadIcon";
import DeleteIcon from "../common/DeleteIcon";
import PhoneNumberInput, { splitPhone, joinPhone } from "../common/PhoneNumberInput";
import SearchableSelect from "../common/SearchableSelect";
import AddressBookDrawer from "../invoice/AddressBookDrawer";
import { DEFAULT_DIAL_CODE } from "../../utils/countryDialCodes";

const COMPANY_TYPES = [
  "Proprietorship",
  "Partnership",
  "LLP",
  "Private Limited",
  "Public Limited",
  "One Person Company",
  "HUF",
  "Trust",
  "Society",
  "Other",
];

function BrandSettings() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    companyName: "",
    companyType: "",
    gstin: "",
    panNumber: "",
    address: "",
    state: "",
    email: "",
    mobile: "",
    alternateContact: "",
    website: "",
    logoUrl: "",
    signatureUrl: "",
    colors: {
      primary: "#0085FF",
      secondary: "#8B5CF6",
    },
  });
  const [logoFile, setLogoFile] = useState(null);
  const [signatureFile, setSignatureFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [logoPreview, setLogoPreview] = useState(null);
  const [signaturePreview, setSignaturePreview] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [mobileCountryCode, setMobileCountryCode] = useState(DEFAULT_DIAL_CODE);
  const [alternateContactCountryCode, setAlternateContactCountryCode] = useState(DEFAULT_DIAL_CODE);
  // Same shared pool as the "Saved Addresses" drawer used everywhere an
  // invoice/quotation/etc. fills in a Billing/Shipping address — adding one
  // here shows up there too, and vice versa, since both read/write the same
  // /api/saved-addresses records rather than keeping a separate copy.
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [addressDrawerOpen, setAddressDrawerOpen] = useState(false);
  const companyNameRef = useRef(null);
  const gstinRef = useRef(null);
  const emailRef = useRef(null);
  const mobileRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    API.get("/branding")
      .then((res) => {
        if (res.data) {
          setForm((prev) => ({
            ...prev,
            ...res.data,
            colors: {
              primary: res.data.colors?.primary || prev.colors.primary,
              secondary: res.data.colors?.secondary || prev.colors.secondary,
            },
          }));
          if (res.data.logoUrl) {
            setLogoPreview(res.data.logoUrl);
          }
          if (res.data.signatureUrl) {
            setSignaturePreview(res.data.signatureUrl);
          }
        }
      })
      .catch((error) => {
        console.error("Failed to load branding data:", error);
      })
      .finally(() => {
        setLoading(false);
      });
    loadSavedAddresses();
  }, []);

  const loadSavedAddresses = async () => {
    try {
      const res = await API.get("/saved-addresses");
      setSavedAddresses(res.data?.addresses || []);
    } catch (err) {
      console.error("Failed to load saved addresses:", err);
    }
  };

  const summarizeAddress = (a) =>
    [a.addressLine1, a.addressLine2, [a.city, a.state].filter(Boolean).join(", "), a.pincode, a.country]
      .filter(Boolean)
      .join(", ");

  const validateForm = () => {
    const newErrors = {};

    if (!form?.companyName?.trim()) {
      newErrors.companyName = "Company name is required";
    }

    if (form?.gstin?.trim()) {
      if (
        !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(
          form.gstin
        )
      ) {
        newErrors.gstin = "Invalid GSTIN format (e.g., 22AAAAA0000A1Z5)";
      }
    }

    if (!form?.email?.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = "Invalid email format";
    }

    if (!form?.mobile?.trim()) {
      newErrors.mobile = "Mobile number is required";
    } else if (!/^[0-9]{10}$/.test(form.mobile)) {
      newErrors.mobile = "Mobile number must be 10 digits";
    }

    if (form?.alternateContact?.trim() && !/^[0-9]{10}$/.test(form.alternateContact)) {
      newErrors.alternateContact = "Alternative contact number must be 10 digits";
    }

    if (form?.panNumber?.trim() && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(form.panNumber)) {
      newErrors.panNumber = "Invalid PAN format (e.g., AAAAA0000A)";
    }

    if (!form.colors.primary) {
      newErrors.primary = "Primary color is required";
    } else if (!/^#[0-9A-Fa-f]{6}$/.test(form.colors.primary)) {
      newErrors.primary = "Enter exactly 6 hex characters after # (e.g. 0085FF)";
    }


    setErrors(newErrors);
    return newErrors;
  };

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setErrors({
          ...errors,
          logo: "Logo file size must be less than 5MB",
        });
        return;
      }

      if (!file.type.startsWith("image/")) {
        setErrors({
          ...errors,
          logo: "Please select a valid image file (PNG, JPG, SVG)",
        });
        return;
      }

      setLogoFile(file);
      setErrors({ ...errors, logo: "" });

      // Read as base64 data URL for preview and storage
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target.result;
        setLogoPreview(dataUrl);
        // store base64 data in form so it can be sent as logoBase64
        setForm((prev) => ({ ...prev, logoUrl: dataUrl }));
      };
      reader.readAsDataURL(file);
    }
  };

  const removeLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    setForm({ ...form, logoUrl: "" });
  };

  useEffect(() => {
    return () => {
      // Revoke object URLs only if we created blob: URLs (we now prefer data: URLs)
      if (logoPreview && logoPreview.startsWith("blob:")) {
        URL.revokeObjectURL(logoPreview);
      }
      if (signaturePreview && signaturePreview.startsWith("blob:")) {
        URL.revokeObjectURL(signaturePreview);
      }
    };
  }, [logoPreview, signaturePreview]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      toast.error("Please fix the errors before submitting");

      const candidates = [
        validationErrors.companyName ? companyNameRef.current : null,
        validationErrors.gstin ? gstinRef.current : null,
        validationErrors.email ? emailRef.current : null,
        validationErrors.mobile ? mobileRef.current : null,
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

    setLoading(true);
    setSaveSuccess(false);

    try {
      const formData = new FormData();
      formData.append("companyName", form.companyName);
      formData.append("companyType", form.companyType || "");
      formData.append("gstin", form.gstin);
      formData.append("panNumber", form.panNumber || "");
      formData.append("state", form.state || "");
      formData.append("email", form.email);
      formData.append("mobile", form.mobile);
      formData.append("alternateContact", form.alternateContact || "");
      formData.append("website", form.website || "");
      formData.append("colors", JSON.stringify(form.colors));
      // If the user chose files, we read them as base64 and stored in form.logoUrl / form.signatureUrl
      // Send base64 fields to backend so images can be stored as base64.
      if (form.logoUrl && form.logoUrl.startsWith('data:')) {
        formData.append('logoBase64', form.logoUrl);
      } else if (form.logoUrl) {
        // existing url path (kept for backwards compatibility)
        formData.append('logoUrl', form.logoUrl);
      }

      if (form.signatureUrl && form.signatureUrl.startsWith('data:')) {
        formData.append('signatureBase64', form.signatureUrl);
      } else if (form.signatureUrl) {
        formData.append('signatureUrl', form.signatureUrl);
      }

      // Also append actual file objects as fallback (back-end may accept multipart files)
      if (logoFile) formData.append("logo", logoFile);
      if (signatureFile) formData.append("signature", signatureFile);

      await API.post("/branding", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      // The sidebar/header tint derives from the button colour, and the
      // Navbar only fetches branding on mount - tell it to refetch so the
      // chrome retints on save instead of on the next full page load.
      window.dispatchEvent(new CustomEvent("branding-updated"));

      setSaveSuccess(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error("Failed to update branding:", error);
      if (error.response?.status === 402) {
        toast.error(error.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(error.response?.data?.error || "Failed to update branding. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading && !form.companyName) {
    return (
      <PageSkeleton variant="generic" />
    );
  }

  return (
    <div>
      {/* Gradient banner + logo circle — same layout as Profile.jsx's
          avatar header, using the company logo instead of a profile photo. */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 h-32 relative rounded-t-2xl mb-16">
        <div className="absolute -bottom-16 left-8">
          <div className="relative group">
            <div className="w-32 h-32 rounded-full border-4 border-white bg-white shadow-lg overflow-hidden relative">
              {logoPreview ? (
                <img
                  src={logoPreview}
                  alt="Company Logo"
                  className="w-full h-full object-contain transition-all duration-200 group-hover:blur-sm group-hover:brightness-75"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
                  <Building2 className="w-16 h-16 text-gray-400" />
                </div>
              )}
              <label
                htmlFor="logo-upload"
                className="absolute inset-0 flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                title="Change Logo"
              >
                <UploadIcon className="w-6 h-6 text-white drop-shadow" />
                <input
                  id="logo-upload"
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml"
                  onChange={handleLogoChange}
                  className="hidden"
                />
              </label>
            </div>
            {logoPreview && (
              <button
                type="button"
                onClick={removeLogo}
                className="absolute bottom-2 right-2 bg-white rounded-full p-2 shadow-lg cursor-pointer hover:bg-red-50 transition-colors"
                title="Remove Logo"
              >
                <DeleteIcon className="w-4 h-4 text-red-600" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">
          {form.companyName || "Your Company"}
        </h2>
        <p className="text-gray-500 text-sm">{form.email}</p>
      </div>

      {errors.logo && (
        <p className="mb-6 text-xs text-red-600 flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5" />
          {errors.logo}
        </p>
      )}

      {/* Success Message */}
      {saveSuccess && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
          <div>
            <p className="text-green-900 font-semibold text-sm">
              Brand settings saved successfully!
            </p>
            <p className="text-green-700 text-xs">Your changes have been saved.</p>
          </div>
        </div>
      )}

      {/* Fields sit directly on the page — no card wrapper — matching
          Profile.jsx's layout. */}
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Company Name */}
          <div ref={companyNameRef}>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
              Company Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.companyName}
              onChange={(e) => {
                setForm({ ...form, companyName: e.target.value });
                if (errors.companyName)
                  setErrors({ ...errors, companyName: "" });
              }}
              className={`w-full px-4 py-2.5 bg-white border rounded-full text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                errors.companyName ? "border-red-400 bg-red-50" : "border-gray-200"
              }`}
              placeholder="Your company name"
            />
            {errors.companyName && (
              <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                {errors.companyName}
              </p>
            )}
          </div>

          {/* Email */}
          <div ref={emailRef}>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
              Email Address <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => {
                setForm({ ...form, email: e.target.value });
                if (errors.email) setErrors({ ...errors, email: "" });
              }}
              className={`w-full px-4 py-2.5 bg-white border rounded-full text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                errors.email ? "border-red-400 bg-red-50" : "border-gray-200"
              }`}
              placeholder="e.g., contact@company.com"
            />
            {errors.email && (
              <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                {errors.email}
              </p>
            )}
          </div>

          {/* GSTIN */}
          <div ref={gstinRef}>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
              GSTIN Number
            </label>
            <input
              type="text"
              value={form.gstin}
              onChange={(e) => {
                setForm({ ...form, gstin: e.target.value.toUpperCase() });
                if (errors.gstin) setErrors({ ...errors, gstin: "" });
              }}
              className={`w-full px-4 py-2.5 bg-white border rounded-full text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                errors.gstin ? "border-red-400 bg-red-50" : "border-gray-200"
              }`}
              placeholder="e.g., 22AAAAA0000A1Z5"
            />
            {errors.gstin && (
              <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                {errors.gstin}
              </p>
            )}
          </div>

          {/* Mobile */}
          <div ref={mobileRef}>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
              Mobile Number <span className="text-red-500">*</span>
            </label>
            <PhoneNumberInput
              value={joinPhone(mobileCountryCode, form.mobile)}
              onChange={(val) => {
                const { code, number } = splitPhone(val);
                setMobileCountryCode(code || DEFAULT_DIAL_CODE);
                setForm({ ...form, mobile: number });
                if (errors.mobile) setErrors({ ...errors, mobile: "" });
              }}
              placeholder="9876543210"
              selectClassName="border border-gray-200 rounded-full px-2 h-[42px] text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all flex-shrink-0"
              inputClassName={`flex-1 min-w-0 px-4 h-[42px] bg-white border rounded-full text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                errors.mobile ? "border-red-400 bg-red-50" : "border-gray-200"
              }`}
            />
            {errors.mobile && (
              <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                {errors.mobile}
              </p>
            )}
          </div>

          {/* Company Type */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
              Company Type
            </label>
            <SearchableSelect
              value={form.companyType || ""}
              onChange={(val) => setForm({ ...form, companyType: val })}
              options={COMPANY_TYPES}
              placeholder="Select type..."
              searchPlaceholder="Search company type"
              className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-full text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          {/* PAN Number */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
              PAN Number
            </label>
            <input
              type="text"
              value={form.panNumber}
              onChange={(e) => {
                setForm({ ...form, panNumber: e.target.value.toUpperCase() });
                if (errors.panNumber) setErrors({ ...errors, panNumber: "" });
              }}
              className={`w-full px-4 py-2.5 bg-white border rounded-full text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                errors.panNumber ? "border-red-400 bg-red-50" : "border-gray-200"
              }`}
              placeholder="e.g., AAAAA0000A"
            />
            {errors.panNumber && (
              <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                {errors.panNumber}
              </p>
            )}
          </div>

          {/* Alternative Contact Number */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
              Alternative Contact Number
            </label>
            <PhoneNumberInput
              value={joinPhone(alternateContactCountryCode, form.alternateContact)}
              onChange={(val) => {
                const { code, number } = splitPhone(val);
                setAlternateContactCountryCode(code || DEFAULT_DIAL_CODE);
                setForm({ ...form, alternateContact: number });
                if (errors.alternateContact) setErrors({ ...errors, alternateContact: "" });
              }}
              placeholder="9876543210"
              selectClassName="border border-gray-200 rounded-full px-2 h-[42px] text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all flex-shrink-0"
              inputClassName={`flex-1 min-w-0 px-4 h-[42px] bg-white border rounded-full text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                errors.alternateContact ? "border-red-400 bg-red-50" : "border-gray-200"
              }`}
            />
            {errors.alternateContact && (
              <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                {errors.alternateContact}
              </p>
            )}
          </div>

          {/* Website */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
              Website
            </label>
            <input
              type="text"
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-full text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              placeholder="e.g., www.yourcompany.com"
            />
          </div>
        </div>

        {/* Billing/Shipping addresses — both buttons open the same saved
            addresses book used across invoices/quotations/etc., so what's
            added here shows up there too. */}
        <div className="mb-8">
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
            Company Addresses
          </label>
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <button
              type="button"
              onClick={() => setAddressDrawerOpen(true)}
              className="flex items-center gap-2 px-4 h-[38px] border border-gray-200 rounded-full text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 transition-colors"
            >
              + Add Billing Address
            </button>
            <button
              type="button"
              onClick={() => setAddressDrawerOpen(true)}
              className="flex items-center gap-2 px-4 h-[38px] border border-gray-200 rounded-full text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 transition-colors"
            >
              + Add Shipping Address
            </button>
          </div>
          {savedAddresses.length > 0 ? (
            <div className="space-y-2">
              {savedAddresses.map((a) => (
                <div
                  key={a._id}
                  className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    {a.title && <span className="font-semibold text-gray-900 mr-2">{a.title}</span>}
                    <span className="truncate">{summarizeAddress(a)}</span>
                  </div>
                  {a.isDefault && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#E3F1FF] text-[#0085FF] flex-shrink-0">
                      Default
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-500">No saved addresses yet.</p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* State */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
              Seller State (for GST)
            </label>
            <select
              value={form.state || ""}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
              className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-full text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            >
              <option value="">Select state...</option>
              {INDIA_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-gray-500">Used to auto-detect Intra/Inter state for GST</p>
          </div>

          {/* Color Scheme */}
          <div>
            {/* Tints the navbar/sidebar chrome (the --chrome-bg CSS variable, derived in
                Navbar.jsx as a pale wash of this colour), for this organization only.
                Deliberately NOT the button colour: buttons paint white labels, so letting this
                drive --btn-primary shipped white-on-white - invisible buttons and text - for any
                org whose colour was light. Buttons stay on the app default (#0085FF). */}
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
              Navbar Colour
            </label>
            <div className="flex items-center gap-3">
            <div className="relative flex-shrink-0">
              <input
                type="color"
                value={form.colors.primary}
                onChange={(e) =>
                  setForm({
                    ...form,
                    colors: { ...form.colors, primary: e.target.value },
                  })
                }
                title="Click to choose a colour"
                className="w-[42px] h-[42px] border border-gray-200 rounded-full cursor-pointer"
              />
              <span className="absolute -bottom-1 -right-1 w-[18px] h-[18px] rounded-full bg-white border border-gray-200 flex items-center justify-center pointer-events-none">
                <Palette className="w-[11px] h-[11px] text-gray-500" />
              </span>
            </div>
            <div className="relative flex-1">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-mono text-gray-500 pointer-events-none">
                #
              </span>
              <input
                type="text"
                value={form.colors.primary.replace(/^#/, "")}
                onChange={(e) => {
                  // "#" is a fixed, non-editable prefix — only the 6 hex
                  // characters after it are ever stored, so the saved value
                  // can never be a partial/invalid hex.
                  const hex = e.target.value
                    .replace(/[^0-9a-fA-F]/g, "")
                    .slice(0, 6);
                  setForm({
                    ...form,
                    colors: { ...form.colors, primary: `#${hex}` },
                  });
                }}
                maxLength={6}
                className={`w-full pl-8 pr-4 py-2.5 bg-white border rounded-full text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono ${
                  errors.primary ? "border-red-400 bg-red-50" : "border-gray-200"
                }`}
                placeholder="0085FF"
              />
            </div>
          </div>
            {errors.primary && (
              <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                {errors.primary}
              </p>
            )}
          </div>
        </div>

        {/* Form Actions — fixed to the viewport (not just "sticky" within
            its own short row, which had nowhere to actually stick to) so it
            keeps floating over the form no matter how far down the page
            you've scrolled. */}
        <div
          className="fixed bottom-6 z-40 flex items-center gap-3"
          style={{ left: "calc(var(--sidebar-width, 0px) + 2rem)" }}
        >
          <button
            type="submit"
            disabled={loading}
            className="px-5 h-[38px] rounded-full bg-[#0085FF] text-white text-[13px] font-semibold shadow-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Settings"
            )}
          </button>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="px-5 h-[38px] rounded-full border border-red-200 bg-white text-red-600 text-[13px] font-semibold shadow-lg hover:bg-red-50 transition-colors"
          >
            Cancel
          </button>
        </div>
        {/* Reserves the space the fixed bar above would otherwise cover, so
            it never overlaps the last real field. */}
        <div className="h-[70px]" />
      </form>

      <AddressBookDrawer
        isOpen={addressDrawerOpen}
        onClose={() => {
          setAddressDrawerOpen(false);
          loadSavedAddresses();
        }}
      />
    </div>
  );
}

export default BrandSettings;
