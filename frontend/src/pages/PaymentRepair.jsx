import React, { useState } from "react";
import {
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Wrench,
  Building2,
  IndianRupee,
} from "lucide-react";
import toast from "react-hot-toast";
import API, { configureAxios } from "../services/api";

// Support tool for the "customer completed payment but never got their
// subscription" case. Paste the Razorpay payment id (from the Razorpay
// dashboard or the customer's receipt) to see whether Razorpay actually
// captured it and whether it was ever applied to a subscription here — then
// reconcile it in place if it wasn't. Replaces having to run
// backend/scripts/repairUnacknowledgedPayment.js over SSH.

const formatMoney = (amount, currency) =>
  `${currency === "INR" ? "₹" : `${currency} `}${Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const Row = ({ label, value, mono = false }) => (
  <div className="flex items-start justify-between gap-4 py-2 border-b border-gray-100 last:border-b-0">
    <span className="text-xs text-gray-500 flex-shrink-0">{label}</span>
    <span className={`text-sm text-gray-900 text-right break-all ${mono ? "font-mono" : "font-medium"}`}>
      {value ?? "—"}
    </span>
  </div>
);

const PaymentRepair = () => {
  const [paymentId, setPaymentId] = useState("");
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const runCheck = async (apply = false) => {
    const trimmed = paymentId.trim();
    if (!trimmed) {
      toast.error("Enter a Razorpay payment id first.");
      return;
    }
    if (!trimmed.startsWith("pay_")) {
      toast.error('A Razorpay payment id starts with "pay_".');
      return;
    }

    apply ? setApplying(true) : setChecking(true);
    setError("");
    if (!apply) setResult(null);

    try {
      configureAxios();
      const res = await API.post("/super-admin/payments/check", {
        paymentId: trimmed,
        apply,
      });
      setResult(res.data);
      if (apply) {
        if (res.data.reconcileResult?.reconciled) {
          toast.success("Payment reconciled — subscription is now active.");
        } else {
          toast.error(res.data.message || "Could not reconcile this payment.");
        }
      }
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        "Failed to check this payment";
      setError(msg);
      toast.error(msg);
    } finally {
      apply ? setApplying(false) : setChecking(false);
    }
  };

  // Only offer the repair button for the one case it actually applies to:
  // Razorpay took the money, but this subscription was never confirmed.
  const canRepair =
    result?.captured && result?.subscription && !result?.subscription?.isPaymentConfirmed;

  const statusBanner = () => {
    if (!result) return null;

    if (!result.captured) {
      return {
        tone: "bg-amber-50 border-amber-200 text-amber-900",
        icon: <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />,
        title: "No money was taken",
      };
    }
    if (result.alreadyReconciled) {
      return {
        tone: "bg-emerald-50 border-emerald-200 text-emerald-900",
        icon: <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />,
        title: "Payment captured and already applied",
      };
    }
    if (result.reconcileResult?.reconciled) {
      return {
        tone: "bg-emerald-50 border-emerald-200 text-emerald-900",
        icon: <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />,
        title: "Fixed — subscription is now confirmed",
      };
    }
    if (!result.subscription) {
      return {
        tone: "bg-red-50 border-red-200 text-red-900",
        icon: <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />,
        title: "Captured, but no matching subscription found",
      };
    }
    return {
      tone: "bg-red-50 border-red-200 text-red-900",
      icon: <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />,
      title: "Payment captured but never applied",
    };
  };

  const banner = statusBanner();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Payment Repair</h1>
        <p className="text-sm text-gray-500 mt-1">
          Customer paid but didn't get their subscription? Enter the Razorpay payment id to
          check whether it went through, and apply it if it never landed.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Razorpay Payment ID
        </label>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={paymentId}
            onChange={(e) => setPaymentId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !checking && runCheck(false)}
            placeholder="pay_XXXXXXXXXXXXXX"
            className="flex-1 h-[42px] px-4 rounded-lg border border-gray-200 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          />
          <button
            type="button"
            onClick={() => runCheck(false)}
            disabled={checking || applying}
            className="inline-flex items-center justify-center gap-2 h-[42px] px-5 rounded-lg bg-[#0085FF] hover:bg-blue-600 text-white text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {checking ? "Checking…" : "Check Payment"}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Checking is read-only — nothing is written until you click Apply below.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {banner && (
            <div className={`flex items-start gap-3 rounded-xl border px-5 py-4 ${banner.tone}`}>
              {banner.icon}
              <div className="min-w-0">
                <p className="text-sm font-bold">{banner.title}</p>
                <p className="text-sm mt-0.5">{result.message}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-3">
                <IndianRupee className="w-4 h-4 text-gray-400" />
                <h2 className="text-sm font-bold text-gray-900">Razorpay Payment</h2>
              </div>
              <Row label="Payment ID" value={result.payment?.id} mono />
              <Row
                label="Status"
                value={
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                      result.payment?.status === "captured"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {result.payment?.status}
                  </span>
                }
              />
              <Row
                label="Amount"
                value={formatMoney(result.payment?.amount, result.payment?.currency)}
              />
              <Row label="Invoice / Link ID" value={result.payment?.invoiceId} mono />
              <Row label="Organization ID (notes)" value={result.payment?.organizationId} mono />
              <Row label="Paid At" value={formatDate(result.payment?.createdAt)} />
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="w-4 h-4 text-gray-400" />
                <h2 className="text-sm font-bold text-gray-900">Subscription In Our System</h2>
              </div>
              {result.subscription ? (
                <>
                  <Row label="Organization" value={result.subscription.organization?.name} />
                  <Row label="Email" value={result.subscription.organization?.email} />
                  <Row label="Plan" value={result.subscription.planName} />
                  <Row label="Payment Status" value={result.subscription.paymentStatus} />
                  <Row
                    label="Payment Confirmed"
                    value={
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                          result.subscription.isPaymentConfirmed
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-red-50 text-red-700"
                        }`}
                      >
                        {result.subscription.isPaymentConfirmed ? "Yes" : "No"}
                      </span>
                    }
                  />
                  <Row label="Subscription ID" value={result.subscription._id} mono />
                </>
              ) : (
                <p className="text-sm text-gray-500">
                  No subscription could be matched to this payment.
                </p>
              )}
            </div>
          </div>

          {canRepair && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-gray-900">Apply this payment</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Replays it through the normal reconciliation path — activation, invoices and
                  billing events all run as if the webhook had arrived. Safe to run twice.
                </p>
              </div>
              <button
                type="button"
                onClick={() => runCheck(true)}
                disabled={applying}
                className="inline-flex items-center justify-center gap-2 h-[42px] px-5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex-shrink-0"
              >
                {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
                {applying ? "Applying…" : "Apply & Reconcile"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PaymentRepair;
