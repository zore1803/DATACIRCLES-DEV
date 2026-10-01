import React, { useEffect, useState } from "react";
import { Check, ExternalLink, Eye, EyeOff, ArrowRight, ArrowLeft, ChevronDown, X } from "lucide-react";
import toast from "react-hot-toast";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";
import { FormLabel, FormError, inputCls } from "../common/form";
import { gstinError } from "../../utils/gstinValidation";

// Frontend-only onboarding for e-invoicing: two steps, no backend, no provider
// call. The credentials live in this component's state only (never storage,
// URLs or a request) and are dropped as soon as the drawer closes.

// The external portal's URL comes from the environment only (frontend/.env).
const EINVOICE_PORTAL_URL = import.meta.env.VITE_APP_EINVOICE_PORTAL_URL;
const PROVIDER_LABEL = "Clear — Sandbox";

const STEPS = ["Add GSP Details", "E-Invoice GSP Login"];

const INSTRUCTIONS = [
  "Open the E-Invoice Sandbox Portal.",
  "Log in using your e-Invoice / GST credentials.",
  "Go to the API registration / API user credentials section.",
  "Create or register the API user required for API access.",
  "Keep the generated API username and password ready.",
  "Return to DataCircles and continue to the next step.",
];

const Stepper = ({ step }) => (
  <div className="flex items-center gap-3">
    {STEPS.map((label, i) => {
      const n = i + 1;
      const done = step > n;
      const active = step === n;
      return (
        <React.Fragment key={label}>
          {i > 0 && <span className={`h-px flex-1 ${step > i ? "bg-[#158FFF]" : "bg-[#D9D9D9]"}`} />}
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-semibold flex-shrink-0 ${
                active
                  ? "bg-[#158FFF] text-white"
                  : done
                  ? "bg-[#158FFF]/10 text-[#158FFF]"
                  : "bg-[#F1F1F5] text-[#78788D]"
              }`}
            >
              {done ? <Check className="w-4 h-4" strokeWidth={2.5} /> : n}
            </span>
            <span
              className={`text-[13px] whitespace-nowrap ${
                active ? "font-medium text-[#161618]" : done ? "text-[#161618]" : "text-[#78788D]"
              }`}
            >
              {label}
            </span>
          </div>
        </React.Fragment>
      );
    })}
  </div>
);

export default function EInvoiceConnectDrawer({ onClose }) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [gstin, setGstin] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});

  useBodyScrollLock(isOpen);

  // Slide in on mount (two frames later so the closed position paints first).
  useEffect(() => {
    let r2;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setIsOpen(true));
    });
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    // Credentials never outlive the drawer.
    setGstin("");
    setUsername("");
    setPassword("");
    setTimeout(() => onClose?.(), 300);
  };

  const handleFinish = (e) => {
    e.preventDefault();
    const next = {};
    // Format and state code are checked; the check digit is not, because the
    // sandbox is tested with dummy GSTINs that don't carry a valid one.
    const gstinProblem = gstinError(gstin);
    if (gstinProblem && !gstinProblem.includes("check digit")) next.gstin = gstinProblem;
    if (!username.trim()) next.username = "IRP username is required";
    if (!password) next.password = "IRP password is required";
    setErrors(next);
    if (Object.keys(next).length) return;

    // Frontend-only for now: nothing is sent or stored yet.
    toast.success("E-Invoice details captured. Connection will be available soon.");
    handleClose();
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[10000] transition-opacity duration-300 ease-out"
        style={{ opacity: isOpen ? 1 : 0 }}
        onClick={handleClose}
      />
      <div
        className={`fixed dc-panel-card dc-panel-w z-[10001] bg-white shadow-2xl flex flex-col overflow-hidden transform transition-transform duration-300 ease-out will-change-transform font-inter ${
          isOpen ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"
        }`}
        style={{ minWidth: 520 }}
        role="dialog"
        aria-label="Connect to E-Invoice Portal"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#D9D9D9] flex-shrink-0 bg-white gap-1">
          <h2 className="text-[15px] font-normal leading-6 text-[#78788D] uppercase tracking-wide">
            Connect to E-Invoice Portal
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

        <form
          id="einvoice-connect-form"
          onSubmit={step === 2 ? handleFinish : (e) => e.preventDefault()}
          noValidate
          className="flex-1 min-h-0 overflow-y-auto px-8 py-6 space-y-6"
        >
          <p className="text-[13px] leading-relaxed text-[#525866]">
            Set up your e-Invoice API credentials to generate GST e-Invoices directly from DataCircles.
          </p>

          <div className="rounded-2xl border border-[#E7E4E3] bg-[#F9F9FB] px-5 py-4">
            <Stepper step={step} />
          </div>

          {step === 1 ? (
            <div className="space-y-5">
              <div>
                <p className="text-[11px] font-semibold tracking-wider text-[#78788D] uppercase">Step 1</p>
                <h3 className="mt-1 text-[16px] font-semibold text-[#0E121B]">
                  Create your E-Invoice API credentials
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-[#525866]">
                  To connect DataCircles with e-Invoicing, first create the API credentials required by your
                  e-Invoice provider.
                </p>
              </div>

              <ol className="space-y-3">
                {INSTRUCTIONS.map((text, i) => (
                  <li key={text} className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-[#F1F1F5] text-[12px] font-semibold text-[#525866] flex items-center justify-center flex-shrink-0 mt-px">
                      {i + 1}
                    </span>
                    <span className="text-[13px] leading-relaxed text-[#161618]">{text}</span>
                  </li>
                ))}
              </ol>

              {EINVOICE_PORTAL_URL ? (
                <a
                  href={EINVOICE_PORTAL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 h-[38px] px-5 rounded-full border border-[#158FFF] text-[#158FFF] text-[13px] font-bold hover:bg-[#158FFF]/5 transition-colors"
                >
                  Open E-Invoice Portal
                  <ExternalLink className="w-4 h-4" />
                </a>
              ) : (
                <p className="text-[13px] font-inter text-[#A0A0A0]">
                  The e-Invoice portal link isn't configured. Set VITE_APP_EINVOICE_PORTAL_URL in the frontend .env.
                </p>
              )}

              {/* Once the API user exists, move on — same place as the reference
                  flow: the primary action sits right under the instructions. */}
              <div className="pt-4 border-t border-[#E7E4E3]">
                <p className="mb-3 text-[13px] leading-relaxed text-[#525866]">
                  Created your API username and password? Continue to enter them in DataCircles.
                </p>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="inline-flex items-center justify-center gap-2 h-[40px] px-6 bg-[#158FFF] text-white rounded-[25px] text-sm font-bold hover:opacity-90 transition-colors font-inter"
                >
                  Proceed to E-Invoice GSP Login
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <p className="text-[11px] font-semibold tracking-wider text-[#78788D] uppercase">Step 2</p>
                <h3 className="mt-1 text-[16px] font-semibold text-[#0E121B]">E-Invoice GSP Login</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-[#525866]">
                  Enter the credentials created or authorized for your GSTIN.
                </p>
              </div>

              <div>
                <FormLabel required>Provider</FormLabel>
                {/* Only Clear Sandbox is supported while we test, so the field is
                    read-only; it becomes a real select once more providers exist. */}
                <div className="relative">
                  <select
                    value={PROVIDER_LABEL}
                    disabled
                    onChange={() => {}}
                    className={`${inputCls()} appearance-none bg-gray-50 cursor-not-allowed`}
                  >
                    <option value={PROVIDER_LABEL}>{PROVIDER_LABEL}</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#1F2937] opacity-50" />
                </div>
              </div>

              <div>
                <FormLabel required htmlFor="irp-gstin">GSTIN</FormLabel>
                <input
                  id="irp-gstin"
                  type="text"
                  value={gstin}
                  onChange={(e) => {
                    setGstin(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, ""));
                    if (errors.gstin) setErrors((p) => ({ ...p, gstin: undefined }));
                  }}
                  maxLength={15}
                  className={`${inputCls({ error: !!errors.gstin })} uppercase tracking-wide`}
                  placeholder="Enter GSTIN"
                  autoComplete="off"
                />
                <FormError>{errors.gstin}</FormError>
              </div>

              <div>
                <FormLabel required htmlFor="gsp-username">IRP Username</FormLabel>
                <input
                  id="gsp-username"
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (errors.username) setErrors((p) => ({ ...p, username: undefined }));
                  }}
                  className={inputCls({ error: !!errors.username })}
                  placeholder="Enter IRP username"
                  autoComplete="off"
                />
                <FormError>{errors.username}</FormError>
              </div>

              <div>
                <FormLabel required htmlFor="gsp-password">IRP Password</FormLabel>
                <div className="relative">
                  <input
                    id="gsp-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errors.password) setErrors((p) => ({ ...p, password: undefined }));
                    }}
                    className={`${inputCls({ error: !!errors.password })} pr-11`}
                    placeholder="Enter IRP password"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#1F2937] opacity-50 hover:opacity-100 transition-opacity"
                    title={showPassword ? "Hide password" : "Show password"}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <FormError>{errors.password}</FormError>
              </div>
            </div>
          )}
        </form>

        <div className="flex-shrink-0 py-2.5 px-4 border-t border-gray-100 bg-white flex items-center justify-between gap-3">
          {step === 1 ? (
            <>
              <span />
              <button
                type="button"
                onClick={handleClose}
                className="px-6 py-2 border border-gray-200 text-gray-700 rounded-[25px] text-sm font-bold hover:bg-gray-50 transition-colors font-inter"
              >
                Close
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-6 py-2 border border-gray-200 text-gray-700 rounded-[25px] text-sm font-bold hover:bg-gray-50 transition-colors font-inter flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
              <button
                type="submit"
                form="einvoice-connect-form"
                className="px-6 py-2 bg-[#158FFF] text-white rounded-[25px] text-sm font-bold hover:opacity-90 transition-colors font-inter flex items-center gap-2"
              >
                Connect &amp; Continue
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
