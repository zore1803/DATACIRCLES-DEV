import CellphoneIcon from "../common/CellphoneIcon";
// components/subscription/BillingProfileModal.jsx
import React, { useState } from 'react';
import { Mail, ShieldCheck, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import API from '../../services/api';

// Charge-at-Will requires a Razorpay customer record with both email and
// phone, but signup only ever collects one of the two (email-only or
// phone-only are both valid sign-up paths and that stays unchanged). This
// collects only whichever field is actually missing, right before the first
// paid subscription attempt, instead of blocking signup or requiring a manual
// DB edit to test payments.
//
// UI/UX-only pass (per explicit instruction: no billing/webhook/save-flow
// logic changes here — handleSave's request shape, validation rules, and
// the parent's stale-closure fix are all untouched). India-only country
// code, deliberately not a full international selector — this product only
// serves Indian phone numbers today (backend validates /^\d{10}$/ with no
// country code stored at all), so a static "+91" prefix is the honest
// control, not an unused dropdown that implies support that doesn't exist.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // same pattern as Login.jsx's signup validation

const BillingProfileModal = ({ show, missingEmail, missingPhone, onSaved, onClose }) => {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [touched, setTouched] = useState({ email: false, phone: false });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!show) return null;

  const emailValid = !missingEmail || EMAIL_REGEX.test(email);
  const phoneValid = !missingPhone || phone.length === 10;
  const showEmailError = touched.email && missingEmail && email.length > 0 && !emailValid;
  const showPhoneError = touched.phone && missingPhone && phone.length > 0 && !phoneValid;

  const handleSave = async () => {
    setError('');
    setTouched({ email: true, phone: true });

    const payload = {};
    if (missingEmail) {
      if (!EMAIL_REGEX.test(email)) {
        setError('Please enter a valid email address');
        return;
      }
      payload.email = email;
    }
    if (missingPhone) {
      if (phone.length !== 10) {
        setError('Please enter a valid 10-digit mobile number');
        return;
      }
      payload.phone = phone;
    }

    setSaving(true);
    try {
      const res = await API.post('/auth/profile', payload);
      const updatedUser = res.data.user;
      if (updatedUser) localStorage.setItem('user', JSON.stringify(updatedUser));
      onSaved(updatedUser);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const bothMissing = missingEmail && missingPhone;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[1000004] px-4 py-6">
      <div className="bg-white rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-7 h-7 text-blue-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-1.5">
            Complete Your Billing Profile
          </h3>
          <p className="text-gray-500 text-sm leading-relaxed">
            {bothMissing
              ? "We need your email and mobile number to set up secure recurring billing with Razorpay."
              : missingEmail
              ? "We need your email address to set up secure recurring billing with Razorpay."
              : "We need your mobile number to set up secure recurring billing with Razorpay."}
          </p>
        </div>

        <div className="space-y-4">
          {missingEmail && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Email Address <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                  placeholder="you@example.com"
                  disabled={saving}
                  className={`w-full pl-10 pr-10 py-3 border rounded-lg shadow-sm text-sm focus:outline-none focus:ring-2 transition-colors disabled:bg-gray-50 disabled:text-gray-400 ${
                    showEmailError
                      ? "border-red-300 focus:ring-red-200 focus:border-red-400"
                      : touched.email && emailValid && email.length > 0
                      ? "border-green-300 focus:ring-green-200 focus:border-green-400"
                      : "border-gray-300 focus:ring-blue-200 focus:border-blue-500"
                  }`}
                />
                {touched.email && email.length > 0 && (
                  showEmailError ? (
                    <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" />
                  ) : emailValid ? (
                    <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />
                  ) : null
                )}
              </div>
              {showEmailError && (
                <p className="text-xs text-red-600 mt-1.5">Enter a valid email address, e.g. you@example.com</p>
              )}
            </div>
          )}

          {missingPhone && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Mobile Number <span className="text-red-500">*</span>
              </label>
              <div className={`flex items-stretch rounded-lg border shadow-sm overflow-hidden transition-colors focus-within:ring-2 ${
                showPhoneError
                  ? "border-red-300 focus-within:ring-red-200 focus-within:border-red-400"
                  : touched.phone && phoneValid && phone.length > 0
                  ? "border-green-300 focus-within:ring-green-200 focus-within:border-green-400"
                  : "border-gray-300 focus-within:ring-blue-200 focus-within:border-blue-500"
              } ${saving ? "bg-gray-50" : "bg-white"}`}>
                {/* Static +91 — India-only today, not an editable country
                    selector (see file-header comment for why). Visually
                    separated so it reads as "prefix, already handled" rather
                    than something the customer needs to type themselves. */}
                <div className="flex items-center gap-1.5 px-3 border-r border-gray-200 bg-gray-50 text-gray-600 text-sm font-medium shrink-0">
                  <span aria-hidden="true">🇮🇳</span>
                  <span>+91</span>
                </div>
                <div className="relative flex-1">
                  <CellphoneIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
                    placeholder="10-digit mobile number"
                    disabled={saving}
                    className="w-full pl-9 pr-9 py-3 text-sm focus:outline-none disabled:text-gray-400 bg-transparent"
                  />
                  {touched.phone && phone.length > 0 && (
                    showPhoneError ? (
                      <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" />
                    ) : phoneValid ? (
                      <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />
                    ) : null
                  )}
                </div>
              </div>
              {showPhoneError ? (
                <p className="text-xs text-red-600 mt-1.5">Enter a valid 10-digit mobile number</p>
              ) : (
                <p className="text-xs text-gray-400 mt-1.5">We'll only use this for billing-related updates from Razorpay.</p>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}
        </div>

        {/* Sets expectations for the redirect that follows — Save & Continue
            hands off to Razorpay's own hosted page next, which otherwise
            reads as an abrupt, unexplained second form. */}
        <p className="text-xs text-gray-400 mt-5 mb-1 text-center">
          Next, you'll be redirected to Razorpay to securely set up your payment method.
        </p>

        <div className="space-y-2.5 mt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Saving...' : 'Save & Continue'}
          </button>
          <button
            onClick={onClose}
            disabled={saving}
            className="w-full bg-white text-gray-600 py-2.5 px-4 rounded-lg font-medium border border-gray-200 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default BillingProfileModal;
