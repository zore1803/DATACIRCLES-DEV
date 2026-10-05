import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  ExternalLink,
  Eye,
  EyeOff,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Check,
} from "lucide-react";
import { gstinError } from "../../utils/gstinValidation";
import { LABEL_CLS, inputCls, ERROR_CLS } from "../common/form/fieldStyles";

// Configurable per environment — swap for the production IRIS portal URL
// once that's available, no other code needs to change.
const IRIS_PORTAL_URL = "https://sandbox.einvoice5.gst.gov.in/";

const STEPS = [
  { key: 1, label: "Connect IRIS Portal" },
  { key: 2, label: "IRIS API Login" },
  { key: 3, label: "Done" },
];

// Sequenced copy shown while Step 2 "connects" — see the TODO near
// handleSubmit for why this is a timer and not a real request yet.
const CONNECTING_PHASES = [
  "Connecting to IRIS...",
  "Authenticating credentials...",
  "Verifying connection...",
];

function Stepper({ step }) {
  return (
    <div className="flex items-center px-6 pt-5 pb-4">
      {STEPS.map((s, i) => {
        const done = step > s.key;
        const active = step === s.key;
        return (
          <React.Fragment key={s.key}>
            <div className="flex items-center gap-2 min-w-0">
              <div
                className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold transition-colors ${
                  done
                    ? "bg-[#0085FF] text-white"
                    : active
                    ? "bg-[#0085FF] text-white"
                    : "bg-gray-100 text-gray-400"
                }`}
              >
                {done ? <Check className="w-3.5 h-3.5" strokeWidth={2.5} /> : s.key}
              </div>
              <span
                className={`text-[12px] font-medium truncate hidden sm:inline ${
                  active ? "text-[#111216]" : done ? "text-gray-600" : "text-gray-400"
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`flex-1 h-px mx-3 transition-colors ${
                  step > s.key ? "bg-[#0085FF]" : "bg-gray-200"
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

const INSTRUCTIONS = [
  "Open the IRIS 5 E-Invoice portal.",
  "Sign in using your taxpayer/GSTIN account.",
  "Complete the required API integration setup for your GSTIN.",
  "Create/obtain the API credentials required for API integration.",
  "Keep your API Username and Password ready.",
  "Return to DataCircles.",
];

function StepOne({ onContinue }) {
  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <h2 className="text-[17px] font-bold text-[#111216]">Connect to IRIS E-Invoice Portal</h2>
      <p className="text-[13px] text-gray-500 mt-1">
        Follow these simple steps to connect your GSTIN with DataCircles.
      </p>

      <div className="mt-6 bg-gray-50 border border-[#1F2937]/10 rounded-2xl p-5">
        <span className="inline-block text-[11px] font-bold tracking-wide text-[#0085FF] bg-blue-50 px-2.5 py-1 rounded-full">
          STEP 1
        </span>
        <p className="text-[14px] font-semibold text-[#111216] mt-3">
          Set up API access for your GSTIN
        </p>

        <ol className="mt-4 space-y-3">
          {INSTRUCTIONS.map((text, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-white border border-[#1F2937]/15 text-[11px] font-semibold text-gray-600 flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <span className="text-[13px] text-gray-700 leading-5">{text}</span>
            </li>
          ))}
        </ol>

        <a
          href={IRIS_PORTAL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 w-full inline-flex items-center justify-center gap-2 h-10 px-5 bg-[#0085FF] text-white text-[13px] font-semibold rounded-full hover:bg-blue-600 transition-colors"
        >
          Open IRIS Portal
          <ExternalLink className="w-3.5 h-3.5" strokeWidth={2.5} />
        </a>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-[13px] text-gray-500">Already completed the setup?</p>
        <button
          type="button"
          onClick={onContinue}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#0085FF] hover:text-blue-700 transition-colors"
        >
          Continue to IRIS API Login
          <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

function StepTwo({ form, setForm, errors, setErrors, showPassword, setShowPassword, phase, submitError, onBack, onSubmit }) {
  const connecting = phase !== null;

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <h2 className="text-[17px] font-bold text-[#111216]">Enter IRIS API Credentials</h2>
      <p className="text-[13px] text-gray-500 mt-1">
        Enter the API credentials associated with the GSTIN you want to connect.
      </p>

      {submitError && (
        <div className="mt-5 flex items-start gap-2.5 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-red-700">Unable to connect to IRIS</p>
            <p className="text-[12px] text-red-600 mt-0.5">{submitError}</p>
          </div>
        </div>
      )}

      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <div>
          <label className={LABEL_CLS}>GSTIN</label>
          <input
            type="text"
            value={form.gstin}
            disabled={connecting}
            onChange={(e) => {
              setForm((f) => ({ ...f, gstin: e.target.value.toUpperCase() }));
              setErrors((er) => ({ ...er, gstin: "" }));
            }}
            placeholder="Enter GSTIN"
            maxLength={15}
            className={inputCls({ error: !!errors.gstin })}
          />
          {errors.gstin && <p className={ERROR_CLS}>{errors.gstin}</p>}
        </div>

        <div>
          <label className={LABEL_CLS}>API Username</label>
          <input
            type="text"
            value={form.apiUsername}
            disabled={connecting}
            onChange={(e) => {
              setForm((f) => ({ ...f, apiUsername: e.target.value }));
              setErrors((er) => ({ ...er, apiUsername: "" }));
            }}
            placeholder="Enter API Username"
            className={inputCls({ error: !!errors.apiUsername })}
          />
          {errors.apiUsername && <p className={ERROR_CLS}>{errors.apiUsername}</p>}
        </div>

        <div>
          <label className={LABEL_CLS}>API Password</label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={form.apiPassword}
              disabled={connecting}
              onChange={(e) => {
                setForm((f) => ({ ...f, apiPassword: e.target.value }));
                setErrors((er) => ({ ...er, apiPassword: "" }));
              }}
              placeholder="Enter API Password"
              className={`${inputCls({ error: !!errors.apiPassword })} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.apiPassword && <p className={ERROR_CLS}>{errors.apiPassword}</p>}
        </div>

        <div className="flex items-start gap-2.5 bg-blue-50/60 border border-blue-100 rounded-xl px-4 py-3">
          <ShieldCheck className="w-4 h-4 text-[#0085FF] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[12.5px] font-semibold text-[#111216]">Secure & Encrypted</p>
            <p className="text-[12px] text-gray-500 mt-0.5">
              Your API password is encrypted and securely stored by DataCircles.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onBack}
            disabled={connecting}
            className="flex-1 h-10 rounded-full border border-[#1F2937]/15 text-[13px] font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Back
          </button>
          <button
            type="submit"
            disabled={connecting}
            className="flex-[1.5] h-10 rounded-full bg-[#0085FF] text-white text-[13px] font-semibold hover:bg-blue-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {connecting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {CONNECTING_PHASES[phase]}
              </>
            ) : submitError ? (
              "Try Again"
            ) : (
              "Connect & Verify"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

function StepThree({ gstin, connectedAt, onDone }) {
  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-full bg-green-50 border-2 border-green-100 flex items-center justify-center">
        <CheckCircle2 className="w-8 h-8 text-green-500" />
      </div>
      <h2 className="text-[17px] font-bold text-[#111216] mt-4">E-Invoice Connected</h2>
      <p className="text-[13px] text-gray-500 mt-1 max-w-xs">
        Your GSTIN has been successfully connected to DataCircles.
      </p>

      <div className="mt-6 w-full bg-gray-50 border border-[#1F2937]/10 rounded-2xl p-5 text-left space-y-3">
        {[
          ["Provider", "IRIS 5"],
          ["Environment", "Sandbox"],
          ["GSTIN", gstin],
          ["Status", "Connected"],
          ["Last Verified", connectedAt],
        ].map(([label, value]) => (
          <div key={label} className="flex items-center justify-between">
            <span className="text-[12.5px] text-gray-500">{label}</span>
            <span
              className={`text-[13px] font-semibold ${
                label === "Status" ? "text-green-600" : "text-[#111216]"
              }`}
            >
              {value}
            </span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onDone}
        className="mt-7 w-full h-10 rounded-full bg-[#0085FF] text-white text-[13px] font-semibold hover:bg-blue-600 transition-colors"
      >
        Done
      </button>
    </div>
  );
}

const BLANK_FORM = { gstin: "", apiUsername: "", apiPassword: "" };

/**
 * Right-side drawer: 3-step guided flow to connect a GSTIN to the IRIS
 * e-invoicing portal (Instructions → Credentials → Done), opened from the
 * "Connect Portal" button on the E-Invoicing page.
 *
 * connection: { gstin, connectedAt } | null — when present, the drawer opens
 * straight on the Step 3 summary instead of asking for credentials again.
 */
export default function EInvoiceConnectionDrawer({ isOpen, onClose, onConnected, connection }) {
  const [shouldRender, setShouldRender] = useState(false);
  const [isSliding, setIsSliding] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(BLANK_FORM);
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [phase, setPhase] = useState(null); // null | 0 | 1 | 2 — index into CONNECTING_PHASES
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setIsSliding(true)));
      // Already connected — show the summary rather than re-asking for creds.
      setStep(connection ? 3 : 1);
    } else {
      setIsSliding(false);
      const t = setTimeout(() => setShouldRender(false), 300);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleClose = () => {
    setIsSliding(false);
    setTimeout(() => {
      onClose();
      // Only reset the in-progress form — a completed connection stays
      // shown (via the `connection` prop) the next time this opens.
      if (!connection) {
        setStep(1);
        setForm(BLANK_FORM);
        setErrors({});
        setSubmitError("");
        setPhase(null);
      }
    }, 300);
  };

  const handleSubmit = () => {
    const gErr = gstinError(form.gstin);
    const nextErrors = {
      gstin: gErr,
      apiUsername: form.apiUsername.trim() ? "" : "API Username is required",
      apiPassword: form.apiPassword ? "" : "API Password is required",
    };
    setErrors(nextErrors);
    if (nextErrors.gstin || nextErrors.apiUsername || nextErrors.apiPassword) return;

    setSubmitError("");

    // TODO(backend): there is no POST /api/e-invoices/connect endpoint yet —
    // IRIS credentials today are a single global config read from server env
    // vars (see backend/providers/iris/irisProvider.js), not per-organization.
    // This timer stands in for that call so the flow can be reviewed; swap
    // it for a real API.post("/e-invoices/connect", form) once that backend
    // work is scoped, keeping the same phase sequence for the loading state.
    setPhase(0);
    const t1 = setTimeout(() => setPhase(1), 700);
    const t2 = setTimeout(() => setPhase(2), 1400);
    const t3 = setTimeout(() => {
      setPhase(null);
      setStep(3);
      onConnected?.({ gstin: form.gstin, connectedAt: new Date().toISOString() });
    }, 2100);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  };

  if (!shouldRender) return null;

  const displayGstin = connection?.gstin || form.gstin;
  const connectedAtLabel = step === 3 && connection
    ? new Date(connection.connectedAt).toLocaleString()
    : "Just now";

  return createPortal(
    <>
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[100005] transition-opacity duration-300"
        style={{ opacity: isSliding ? 1 : 0 }}
        onClick={handleClose}
      />
      <div
        className={`fixed dc-panel-card dc-panel-w z-[100006] bg-white flex flex-col shadow-2xl transform transition-transform duration-300 ease-out font-inter ${
          isSliding ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-white border-b border-[#D9D9D9] flex-shrink-0 rounded-t-2xl">
          <div className="flex items-center justify-between px-6 py-3">
            <div className="flex items-center gap-3">
              <button
                onClick={handleClose}
                title="Close"
                className="w-5 h-5 flex items-center justify-center text-[#1C1B1F] hover:opacity-70 transition-opacity"
                aria-label="Close"
              >
                <X className="w-[18px] h-[18px]" strokeWidth={2} />
              </button>
              <h2 className="text-[15px] font-normal leading-6 text-[#78788D] uppercase tracking-wide">
                Connect E-Invoice
              </h2>
            </div>
          </div>
          <Stepper step={step} />
        </div>

        {step === 1 && <StepOne onContinue={() => setStep(2)} />}
        {step === 2 && (
          <StepTwo
            form={form}
            setForm={setForm}
            errors={errors}
            setErrors={setErrors}
            showPassword={showPassword}
            setShowPassword={setShowPassword}
            phase={phase}
            submitError={submitError}
            onBack={() => setStep(1)}
            onSubmit={handleSubmit}
          />
        )}
        {step === 3 && (
          <StepThree gstin={displayGstin} connectedAt={connectedAtLabel} onDone={handleClose} />
        )}
      </div>
    </>,
    document.body
  );
}
