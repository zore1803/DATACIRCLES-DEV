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

function BrandSettings() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    companyName: "",
    gstin: "",
    address: "",
    state: "",
    email: "",
    mobile: "",
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
  const companyNameRef = useRef(null);
  const gstinRef = useRef(null);
  const addressRef = useRef(null);
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
  }, []);

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

    if (!form?.address?.trim()) {
      newErrors.address = "Address is required";
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
        validationErrors.address ? addressRef.current : null,
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
      formData.append("gstin", form.gstin);
      formData.append("address", form.address);
      formData.append("state", form.state || "");
      formData.append("email", form.email);
      formData.append("mobile", form.mobile);
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
    <div className="space-y-6">
      {/* Success Message */}
      {saveSuccess && (
        <div className="bg-green-50 border-2 border-green-300 rounded-xl p-4 flex items-center gap-3 shadow-lg animate-fade-in">
          <CheckCircle2 className="w-6 h-6 text-green-600" />
          <div>
            <p className="text-green-900 font-semibold">
              Brand settings saved successfully!
            </p>
            <p className="text-green-700 text-sm">Your changes have been saved.</p>
          </div>
        </div>
      )}

      {/* Main Form */}
      <div className="bg-white border-2 border-gray-200 shadow-xl rounded-2xl overflow-hidden">
        <form onSubmit={handleSubmit}>
          {/* Company Information Section */}
          <div className="p-8 border-b-2 border-gray-100">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-blue-100 p-2.5 rounded-xl">
                <Building2 className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  Company Information
                </h2>
                <p className="text-sm text-gray-600">
                  Basic details about your organization
                </p>
              </div>
            </div>
 
            <div className="grid md:grid-cols-2 gap-6">
              {/* Company Name */}
              <div ref={companyNameRef}>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                  <Building2 className="w-4 h-4" />
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
                  className={`w-full px-4 py-2.5 border-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                    errors.companyName
                      ? "border-red-400 bg-red-50"
                      : "border-gray-300 hover:border-gray-400"
                  }`}
                  placeholder="Your company name"
                />
                {errors.companyName && (
                  <p className="mt-1.5 text-sm text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    {errors.companyName}
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
                  className={`w-full px-4 py-2.5 border-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                    errors.gstin
                      ? "border-red-400 bg-red-50"
                      : "border-gray-300 hover:border-gray-400"
                  }`}
                  placeholder="e.g., 22AAAAA0000A1Z5"
                />
                {errors.gstin && (
                  <p className="mt-1.5 text-sm text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    {errors.gstin}
                  </p>
                )}
              </div>

              {/* Email */}
              <div ref={emailRef}>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                  <Mail className="w-4 h-4" />
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => {
                    setForm({ ...form, email: e.target.value });
                    if (errors.email) setErrors({ ...errors, email: "" });
                  }}
                  className={`w-full px-4 py-2.5 border-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                    errors.email
                      ? "border-red-400 bg-red-50"
                      : "border-gray-300 hover:border-gray-400"
                  }`}
                  placeholder="e.g., contact@company.com"
                />
                {errors.email && (
                  <p className="mt-1.5 text-sm text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    {errors.email}
                  </p>
                )}
              </div>

              {/* Mobile */}
              <div ref={mobileRef}>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                  <CellphoneIcon className="w-4 h-4" />
                  Mobile Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.mobile}
                  onChange={(e) => {
                    setForm({ ...form, mobile: e.target.value });
                    if (errors.mobile) setErrors({ ...errors, mobile: "" });
                  }}
                  className={`w-full px-4 py-2.5 border-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                    errors.mobile
                      ? "border-red-400 bg-red-50"
                      : "border-gray-300 hover:border-gray-400"
                  }`}
                  placeholder="e.g., 9876543210"
                />
                {errors.mobile && (
                  <p className="mt-1.5 text-sm text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    {errors.mobile}
                  </p>
                )}
              </div>
            </div>

            {/* Address */}
            <div className="mt-6" ref={addressRef}>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                <MapPin className="w-4 h-4" />
                Company Address <span className="text-red-500">*</span>
              </label>
              <textarea
                value={form.address}
                onChange={(e) => {
                  setForm({ ...form, address: e.target.value });
                  if (errors.address) setErrors({ ...errors, address: "" });
                }}
                className={`w-full px-4 py-3 border-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none ${
                  errors.address
                    ? "border-red-400 bg-red-50"
                    : "border-gray-300 hover:border-gray-400"
                }`}
                placeholder="Enter complete company address"
                rows="4"
              />
              {errors.address && (
                <p className="mt-1.5 text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {errors.address}
                </p>
              )}
            </div>

            {/* State */}
            <div className="mt-6">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                Seller State (for GST)
              </label>
              <select
                value={form.state || ""}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                className="w-full px-4 py-2.5 border-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all border-gray-300 hover:border-gray-400"
              >
                <option value="">Select state...</option>
                {INDIA_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-gray-500">Used to auto-detect Intra/Inter state for GST</p>
            </div>
          </div>

          {/* Brand Assets Section */}
          <div className="p-8 border-b-2 border-gray-100 bg-gray-50">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-purple-100 p-2.5 rounded-xl">
                <ImageIcon className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  Brand Assets
                </h2>
                <p className="text-sm text-gray-600">
                  Upload your logo and signature
                </p>
              </div>
            </div>

            <div className="grid gap-6">
              {/* Logo Upload */}
              <div className="bg-white rounded-xl p-6 border-2 border-gray-200">
                <label className="block text-sm font-semibold text-gray-700 mb-4">
                  Company Logo
                </label>
                <div className="flex flex-col items-center">
                  <div className="relative w-32 h-32 bg-gray-100 border-2 border-dashed border-gray-300 rounded-xl overflow-hidden flex items-center justify-center mb-4 group">
                    {logoPreview ? (
                      <>
                        <img
  src={logoPreview}
  alt="Signature Preview"
  className="w-full h-full object-contain"
/>

                        <button
                          type="button"
                          onClick={removeLogo}
                          className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white p-1.5 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <UploadIcon className="w-8 h-8 text-gray-400" />
                    )}
                  </div>
                  <input
                    id="logo-upload"
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml"
                    onChange={handleLogoChange}
                    className="hidden"
                  />
                  <label
                    htmlFor="logo-upload"
                    className="inline-flex items-center gap-2 px-4 py-2 border-2 border-gray-300 rounded-xl text-sm bg-white hover:bg-gray-50 cursor-pointer transition-colors font-semibold"
                  >
                    <UploadIcon className="w-4 h-4" />
                    Upload Logo
                  </label>
                  <p className="text-xs text-gray-500 mt-3 text-center">
                    Max 5MB • PNG, JPG, SVG
                    <br />
                    Recommended: 200x200px
                  </p>
                  {errors.logo && (
                    <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" />
                      {errors.logo}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Color Scheme Section */}
          <div className="p-8 border-b-2 border-gray-100">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-pink-100 p-2.5 rounded-xl">
                <Palette className="w-6 h-6 text-pink-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  Color Scheme
                </h2>
                <p className="text-sm text-gray-600">
                  Customize your brand colors
                </p>
              </div>
            </div>

            <div className="grid md:grid-cols-1 gap-6">
              {/* Primary Color — drives every button's fill app-wide (the
                  --btn-primary CSS variable). Whatever's picked here
                  replaces the #0085FF default everywhere it's used, for
                  this organization only. */}
              <div className="bg-gray-50 rounded-xl p-6 border-2 border-gray-200">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-4">
                  <Palette className="w-4 h-4" />
                  Button Colour
                </label>
                <p className="text-xs text-gray-500 -mt-3 mb-4">
                  Sets the fill colour for every button across your CRM, and
                  tints the sidebar and header with a pale wash of it.
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={form.colors.primary}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        colors: { ...form.colors, primary: e.target.value },
                      })
                    }
                    className="w-14 h-14 border-2 border-gray-300 rounded-xl cursor-pointer"
                  />
                  <div className="relative flex-1">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-mono text-gray-500 pointer-events-none">
                      #
                    </span>
                    <input
                      type="text"
                      value={form.colors.primary.replace(/^#/, "")}
                      onChange={(e) => {
                        // "#" is a fixed, non-editable prefix — only the 6
                        // hex characters after it are ever stored, so the
                        // saved value can never be a partial/invalid hex.
                        const hex = e.target.value
                          .replace(/[^0-9a-fA-F]/g, "")
                          .slice(0, 6);
                        setForm({
                          ...form,
                          colors: { ...form.colors, primary: `#${hex}` },
                        });
                      }}
                      maxLength={6}
                      className={`w-full pl-8 pr-4 py-3 border-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono ${
                        errors.primary ? "border-red-400 bg-red-50" : "border-gray-300"
                      }`}
                      placeholder="0085FF"
                    />
                  </div>
                </div>
                <div
                  className="mt-4 h-12 rounded-lg"
                  style={{ backgroundColor: form.colors.primary }}
                ></div>
                {errors.primary && (
                  <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    {errors.primary}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 px-8 py-6 bg-gradient-to-r from-gray-50 to-gray-100">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Info className="w-4 h-4" />
              <span>Changes will be applied after saving</span>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => navigate("/")}
                className="flex items-center gap-2 px-6 py-3 border-2 border-gray-300 rounded-xl font-semibold text-sm hover:bg-gray-100 transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold text-sm rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Settings
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default BrandSettings;
