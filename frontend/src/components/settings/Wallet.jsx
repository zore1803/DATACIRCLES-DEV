import PdfIcon from "../common/PdfIcon";
import PlusIcon from "../common/PlusIcon";
// components/settings/Wallet.jsx
//
// Org-facing prepaid credit wallet. Independent of the subscription — nothing
// here reads or changes plan state. Pricing (credit value, GST) always comes
// from the backend; this component never computes what will be charged.
import React, { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight,
  ArrowDownRight,
  ArrowLeftRight,
  Info,
  Check,
  Bell,
} from "lucide-react";
import toast from "react-hot-toast";
import API from "../../services/api";
import { walletAPI } from "../../services/walletApi";
import useRazorpay from "../../hooks/useRazorpay";
import CustomDropdown from "../common/CustomDropdown";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

const QUICK_AMOUNTS = [1000, 5000, 10000, 15000];

// Full ISO currency code list for the converter's dropdown — the backend's
// /expenses/exchange-rate endpoint accepts any three-letter code, so this
// isn't limited to the handful ExpenseFormPanel shows inline.
const CONVERTER_CURRENCIES = [
  "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD", "JPY", "CNY",
  "AFN", "ALL", "AMD", "ANG", "AOA", "ARS", "AWG", "AZN", "BAM", "BBD",
  "BDT", "BGN", "BHD", "BIF", "BMD", "BND", "BOB", "BRL", "BSD", "BTN",
  "BWP", "BYN", "BZD", "CDF", "CHF", "CLP", "COP", "CRC", "CUP", "CVE",
  "CZK", "DJF", "DKK", "DOP", "DZD", "EGP", "ERN", "ETB", "FJD", "FKP",
  "GEL", "GHS", "GIP", "GMD", "GNF", "GTQ", "GYD", "HKD", "HNL", "HRK",
  "HTG", "HUF", "IDR", "ILS", "INR", "IQD", "IRR", "ISK", "JMD", "JOD",
  "KES", "KGS", "KHR", "KMF", "KRW", "KWD", "KYD", "KZT", "LAK", "LBP",
  "LKR", "LRD", "LSL", "LYD", "MAD", "MDL", "MGA", "MKD", "MMK", "MNT",
  "MOP", "MRU", "MUR", "MVR", "MWK", "MXN", "MYR", "MZN", "NAD", "NGN",
  "NIO", "NOK", "NPR", "NZD", "OMR", "PAB", "PEN", "PGK", "PHP", "PKR",
  "PLN", "PYG", "QAR", "RON", "RSD", "RUB", "RWF", "SAR", "SBD", "SCR",
  "SDG", "SEK", "SHP", "SLE", "SOS", "SRD", "SSP", "STN", "SYP", "SZL",
  "THB", "TJS", "TMT", "TND", "TOP", "TRY", "TTD", "TWD", "TZS", "UAH",
  "UGX", "UYU", "UZS", "VES", "VND", "VUV", "WST", "XAF", "XCD", "XOF",
  "XPF", "YER", "ZAR", "ZMW", "ZWL",
];

const formatDateTime = (d) =>
  new Date(d).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const formatRupees = (n) =>
  `₹${Number(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const TYPE_META = {
  CREDIT_PURCHASE: { label: "Purchase", style: "bg-[#E6F7EF] text-[#1FA971] ring-[#B9E7D3]" },
  FREE_CREDIT: { label: "Free credit", style: "bg-sky-50 text-sky-700 ring-sky-200" },
  ADMIN_CREDIT: { label: "Admin credit", style: "bg-violet-50 text-violet-700 ring-violet-200" },
  USAGE_DEBIT: { label: "Usage", style: "bg-slate-100 text-slate-600 ring-slate-200" },
  REFUND: { label: "Refund", style: "bg-[#FDF3E6] text-[#EA9927] ring-[#F7DDB8]" },
  ADJUSTMENT: { label: "Adjustment", style: "bg-[#FDF3E6] text-[#EA9927] ring-[#F7DDB8]" },
};

// Usage-based features that will consume credits once they ship. Listed here so
// customers understand what they're pre-paying for; none of them are wired to
// walletService.debit() yet.
const UPCOMING_FEATURES = [
  "WhatsApp messaging",
  "AI document processing",
  "Bulk e-invoice & e-way bill generation",
  "Future purchases and add-ons",
];

const Wallet = () => {
  const { razorpayLoaded, openCheckout } = useRazorpay();
  const [wallet, setWallet] = useState(null);
  const [history, setHistory] = useState({ transactions: [], page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [rupeeAmount, setRupeeAmount] = useState("");
  const [purchasing, setPurchasing] = useState(false);

  // Currency-to-currency converter — same /expenses/exchange-rate endpoint
  // ExpenseFormPanel uses (each call returns how many INR one unit of a
  // currency buys), used here as a pivot: amount_from * rateFrom / rateTo
  // converts between any two currencies, not just to INR.
  const [convertAmount, setConvertAmount] = useState("1");
  const [convertFrom, setConvertFrom] = useState("USD");
  const [convertTo, setConvertTo] = useState("INR");
  const [convertRates, setConvertRates] = useState({ from: 1, to: 1 });
  const [convertLoading, setConvertLoading] = useState(false);
  // Off by default — the whole converter stays greyed out/disabled until
  // switched on, and while on its result is pushed straight into "Amount to
  // add" below instead of the user retyping it.
  const [applyConvertedAmount, setApplyConvertedAmount] = useState(false);

  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderThresholdInput, setReminderThresholdInput] = useState("");
  const [reminderEmailInput, setReminderEmailInput] = useState("");
  const [savingReminder, setSavingReminder] = useState(false);
  useBodyScrollLock(reminderOpen);

  const load = useCallback(async () => {
    try {
      const [walletRes, historyRes] = await Promise.all([
        walletAPI.getWallet(),
        walletAPI.getTransactions({ page, limit: 10 }),
      ]);
      setWallet(walletRes.data);
      setHistory(historyRes.data);
    } catch (err) {
      console.error("Failed to load wallet:", err);
      toast.error("Couldn't load your wallet. Try refreshing.");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    const fetchRate = (code) =>
      code === "INR"
        ? Promise.resolve(1)
        : API.get("/expenses/exchange-rate", { params: { from: code } }).then((res) => res.data.rate);

    setConvertLoading(true);
    Promise.all([fetchRate(convertFrom), fetchRate(convertTo)])
      .then(([from, to]) => {
        if (!cancelled) setConvertRates({ from, to });
      })
      .catch(() => {
        if (!cancelled) setConvertRates({ from: null, to: null });
      })
      .finally(() => {
        if (!cancelled) setConvertLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [convertFrom, convertTo]);

  const openReminderDialog = () => {
    const storedUser = JSON.parse(localStorage.getItem("user") || "null");
    setReminderThresholdInput(wallet?.reminderThreshold != null ? String(wallet.reminderThreshold) : "");
    setReminderEmailInput(wallet?.reminderEmail || storedUser?.email || "");
    setReminderOpen(true);
  };

  const handleSaveReminder = async () => {
    const threshold = Number(reminderThresholdInput);
    if (!(threshold >= 0)) {
      toast.error("Enter a valid credit threshold");
      return;
    }
    if (!reminderEmailInput.trim()) {
      toast.error("Enter an email to notify");
      return;
    }
    setSavingReminder(true);
    try {
      await walletAPI.setReminder(threshold, reminderEmailInput.trim());
      toast.success("Reminder set");
      setReminderOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || "Couldn't save reminder");
    } finally {
      setSavingReminder(false);
    }
  };

  const handleClearReminder = async () => {
    setSavingReminder(true);
    try {
      await walletAPI.setReminder(null, null);
      toast.success("Reminder turned off");
      setReminderOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || "Couldn't clear reminder");
    } finally {
      setSavingReminder(false);
    }
  };

  const creditValue = wallet?.creditValueInRupees || 1;
  const gstRate = wallet?.gstRate ?? 18;
  const enteredRupees = Number(rupeeAmount) || 0;
  const creditsToBuy = enteredRupees / creditValue;
  const gstPreview = (enteredRupees * gstRate) / 100;
  const totalPreview = enteredRupees + gstPreview;

  const convertedAmount =
    convertRates.from && convertRates.to
      ? ((Number(convertAmount) || 0) * convertRates.from) / convertRates.to
      : null;

  useEffect(() => {
    if (!applyConvertedAmount || convertedAmount === null) return;
    setRupeeAmount(String(Math.round(convertedAmount * 100) / 100));
  }, [applyConvertedAmount, convertedAmount]);

  const handleBuy = async () => {
    if (!(creditsToBuy > 0)) {
      toast.error("Enter an amount to add.");
      return;
    }
    if (!razorpayLoaded) {
      toast.error("Payment gateway is still loading. Try again in a moment.");
      return;
    }

    setPurchasing(true);
    try {
      const { data } = await walletAPI.createOrder(creditsToBuy);
      openCheckout({
        key: data.key,
        amount: data.order.amount,
        currency: data.order.currency,
        order_id: data.order.id,
        name: "Wallet Credits",
        description: `${data.credits} credits`,
        theme: { color: "#059669" },
        handler: async (response) => {
          try {
            await walletAPI.verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            toast.success("Credits added to your wallet.");
            setRupeeAmount("");
            setPage(1);
            await load();
          } catch (err) {
            console.error("Wallet verification failed:", err);
            toast.error("Payment received but verification failed. Refresh in a moment.");
          } finally {
            setPurchasing(false);
          }
        },
        modal: { ondismiss: () => setPurchasing(false) },
        onPaymentFailed: (error) => {
          toast.error(`Payment failed: ${error.description}`);
          setPurchasing(false);
        },
      });
    } catch (err) {
      console.error("Failed to start wallet top-up:", err);
      toast.error(err.response?.data?.error || "Couldn't start the payment.");
      setPurchasing(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-5 animate-pulse">
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="h-44 rounded-2xl bg-gray-100 lg:col-span-1" />
          <div className="h-44 rounded-2xl bg-gray-100 lg:col-span-2" />
        </div>
        <div className="h-56 rounded-2xl bg-gray-100" />
        <div className="h-72 rounded-2xl bg-gray-100" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Balance + what credits are for */}
      <div className="grid gap-5 lg:grid-cols-4">
        {/* Top-up */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 lg:col-span-3">
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Left column — pick an amount, then confirm the purchase */}
          <div className="flex h-full flex-col">
            <p className="text-sm font-semibold text-gray-900">Add credits</p>
            <p className="mt-0.5 text-xs text-gray-500">
              Choose a quick amount or enter your own.
            </p>

            <div className="mt-4 flex flex-nowrap gap-1.5 overflow-x-auto">
              {QUICK_AMOUNTS.map((amount) => {
                const active = enteredRupees === amount;
                return (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setRupeeAmount(String(amount))}
                    className={`h-[38px] flex-shrink-0 rounded-full border px-3 text-sm font-semibold transition ${
                      active
                        ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                        : "border-gray-200 bg-white text-gray-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                    }`}
                  >
                    ₹{amount.toLocaleString("en-IN")}
                  </button>
                );
              })}
            </div>

            {/* Currency-to-currency converter — fills the space this column
                otherwise left empty above the "Amount to add" row. */}
            <div className="mt-5 rounded-xl border border-gray-100 bg-gray-50/60 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-medium text-gray-600">Currency converter</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-xs font-medium text-gray-600">Apply here</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={applyConvertedAmount}
                    onClick={() => setApplyConvertedAmount((v) => !v)}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
                      applyConvertedAmount ? "bg-[#0085FF]" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        applyConvertedAmount ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </label>
              </div>
              <div
                className={`flex items-center gap-2 transition-opacity ${
                  applyConvertedAmount ? "" : "pointer-events-none opacity-40"
                }`}
              >
                <input
                  type="number"
                  min="0"
                  disabled={!applyConvertedAmount}
                  value={convertAmount}
                  onChange={(e) => setConvertAmount(e.target.value)}
                  className="w-20 h-[34px] rounded-full border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
                <CustomDropdown
                  options={CONVERTER_CURRENCIES}
                  value={convertFrom}
                  onChange={setConvertFrom}
                  searchable
                  className="w-24"
                  buttonClassName="w-full h-[34px] rounded-full border border-gray-300 bg-white px-3 text-sm text-gray-700 flex items-center justify-between outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  title="Swap currencies"
                  disabled={!applyConvertedAmount}
                  onClick={() => {
                    setConvertFrom(convertTo);
                    setConvertTo(convertFrom);
                  }}
                  className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 hover:bg-gray-50"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                </button>
                <CustomDropdown
                  options={CONVERTER_CURRENCIES}
                  value={convertTo}
                  onChange={setConvertTo}
                  searchable
                  className="w-24"
                  buttonClassName="w-full h-[34px] rounded-full border border-gray-300 bg-white px-3 text-sm text-gray-700 flex items-center justify-between outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
                <span className="text-sm font-semibold text-gray-900">
                  ={" "}
                  {convertLoading
                    ? "…"
                    : convertedAmount !== null
                    ? convertedAmount.toLocaleString("en-IN", { maximumFractionDigits: 2 })
                    : "—"}
                </span>
              </div>
            </div>

            <div className="mt-auto pt-5">
              <label
                htmlFor="wallet-amount"
                className="mb-1.5 block text-xs font-medium text-gray-600"
              >
                Amount to add
              </label>
              <div className="flex items-center h-[38px] rounded-full border border-gray-300 bg-white px-3.5 transition focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500">
                <span className="mr-1.5 text-lg text-gray-400">₹</span>
                <input
                  id="wallet-amount"
                  type="number"
                  min="0"
                  value={rupeeAmount}
                  onChange={(e) => setRupeeAmount(e.target.value)}
                  placeholder="0"
                  className="w-full bg-transparent text-lg font-semibold text-gray-900 outline-none placeholder:font-normal placeholder:text-gray-300"
                />
                {creditsToBuy > 0 && (
                  <span className="ml-2 shrink-0 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    {creditsToBuy.toFixed(2)} credits
                  </span>
                )}
              </div>

              <button
                onClick={handleBuy}
                disabled={purchasing || !(creditsToBuy > 0)}
                className="mt-4 flex w-full items-center justify-center gap-2 h-[42px] rounded-full bg-[#0085FF] px-5 font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
              >
                <PlusIcon className="w-4 h-4" />
                {purchasing ? "Processing…" : "Buy Credits"}
              </button>
            </div>
          </div>

          {/* Right column — balance on top, payment summary below, stacked
              flush with no gap between them. */}
          <div className="flex flex-col items-end gap-5">
            <div
              className="relative w-[85%] overflow-hidden rounded-2xl p-5 text-white shadow-sm"
              style={{ background: "linear-gradient(to bottom right, #0085FF, #0066CC)" }}
            >
              <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/10" />
              <div className="relative">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-blue-50">Credit balance</p>
                  <p className="inline-flex rounded-full bg-white/30 px-2 py-0.5 text-[11px] font-medium text-white">
                    1 credit = {formatRupees(creditValue)}
                  </p>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <p className="text-3xl font-bold leading-none tracking-tight">
                    {wallet.balance.toFixed(2)}
                  </p>
                  <span className="text-xs font-medium text-blue-100">credits</span>
                </div>
              </div>
            </div>

            <div className="w-[85%] rounded-xl border border-gray-100 bg-gray-50/60 p-4">
              <p className="mb-3 text-xs font-medium text-gray-600">Payment summary</p>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Subtotal</dt>
                  <dd className="font-medium text-gray-900">{formatRupees(enteredRupees)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">GST ({gstRate}%)</dt>
                  <dd className="font-medium text-gray-900">{formatRupees(gstPreview)}</dd>
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-2.5">
                  <dt className="font-semibold text-gray-900">Total payable</dt>
                  <dd className="text-base font-bold text-emerald-700">
                    {formatRupees(totalPreview)}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 flex items-start gap-1.5 text-xs text-gray-400">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                GST is charged on top of the amount at the time of payment. Credits added are
                unaffected by GST.
              </p>
            </div>
          </div>
        </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 lg:col-span-1">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900">Where credits apply</p>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
              Rolling out soon
            </span>
          </div>
          <p className="mb-4 text-xs text-gray-500">
            Credits are consumed by usage-based features as they become available.
          </p>
          <div className="grid gap-3">
            {UPCOMING_FEATURES.map((label) => (
              <div
                key={label}
                className="flex items-start gap-3 text-sm text-gray-700"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0085FF]">
                  <Check className="h-3 w-3 text-white" strokeWidth={3} />
                </span>
                <span className="leading-snug">{label}</span>
              </div>
            ))}
          </div>

          <div className="mt-6 border-t border-gray-100 pt-4">
            {wallet?.reminderThreshold != null ? (
              <div className="rounded-xl bg-blue-50 px-3.5 py-3 text-xs text-gray-700">
                <p>
                  We'll email <span className="font-semibold">{wallet.reminderEmail}</span> when
                  your balance drops to{" "}
                  <span className="font-semibold">{wallet.reminderThreshold} credits</span> or below.
                </p>
                <button
                  type="button"
                  onClick={openReminderDialog}
                  className="mt-2 text-xs font-semibold text-[#0085FF] hover:underline"
                >
                  Edit reminder
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={openReminderDialog}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#0085FF] px-4 py-2.5 text-sm font-semibold text-[#0085FF] transition-colors hover:bg-blue-50"
              >
                <Bell className="h-4 w-4" />
                Set Reminder
              </button>
            )}
          </div>
        </div>
      </div>

      {reminderOpen && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/20 backdrop-blur-sm p-4"
          onClick={() => !savingReminder && setReminderOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-gray-900">Low-balance reminder</h3>
            <p className="mt-1 text-xs text-gray-500">
              Get an email when your wallet balance drops to or below a threshold.
            </p>

            <label className="mt-4 block text-xs font-semibold text-gray-700">
              Notify me when balance is at or below
            </label>
            <input
              type="number"
              min="0"
              value={reminderThresholdInput}
              onChange={(e) => setReminderThresholdInput(e.target.value)}
              placeholder="e.g. 100"
              className="mt-1.5 w-full rounded-full border border-gray-200 px-4 py-2 text-sm focus:border-[#0085FF] focus:outline-none"
            />

            <label className="mt-4 block text-xs font-semibold text-gray-700">
              Email to notify
            </label>
            <input
              type="email"
              value={reminderEmailInput}
              onChange={(e) => setReminderEmailInput(e.target.value)}
              placeholder="you@company.com"
              className="mt-1.5 w-full rounded-full border border-gray-200 px-4 py-2 text-sm focus:border-[#0085FF] focus:outline-none"
            />

            <div className="mt-6 flex items-center justify-between gap-2">
              {wallet?.reminderThreshold != null ? (
                <button
                  type="button"
                  onClick={handleClearReminder}
                  disabled={savingReminder}
                  className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-60"
                >
                  Turn off reminder
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setReminderOpen(false)}
                  disabled={savingReminder}
                  className="rounded-full border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveReminder}
                  disabled={savingReminder}
                  className="rounded-full bg-[#0085FF] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-60"
                >
                  {savingReminder ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ledger */}
      <div className="rounded-2xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <p className="text-sm font-semibold text-gray-900">Wallet Credit Usage History</p>
          {history.total > 0 && (
            <span className="text-xs text-gray-400">
              {history.total} {history.total === 1 ? "entry" : "entries"}
            </span>
          )}
        </div>

        {history.transactions.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <div className="mb-3 rounded-2xl bg-gray-50 p-3.5">
              <PdfIcon className="h-6 w-6 text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-700">No wallet activity yet</p>
            <p className="mt-1 text-xs text-gray-400">
              Purchases, grants, and usage will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-6 py-3 font-medium">Credits</th>
                  <th className="px-6 py-3 font-medium">Type</th>
                  <th className="px-6 py-3 font-medium">Notes</th>
                  <th className="px-6 py-3 text-right font-medium">Balance After</th>
                  <th className="px-6 py-3 text-right font-medium">Date &amp; Time</th>
                </tr>
              </thead>
              <tbody>
                {history.transactions.map((tx) => {
                  const meta = TYPE_META[tx.type] || {
                    label: tx.type.replace(/_/g, " ").toLowerCase(),
                    style: "bg-gray-100 text-gray-600 ring-gray-200",
                  };
                  const isDebit = tx.amount < 0;
                  return (
                    <tr
                      key={tx._id}
                      className="border-b border-gray-50 transition last:border-0 hover:bg-gray-50/60"
                    >
                      <td className="px-6 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1 font-semibold tabular-nums ${
                            isDebit ? "text-rose-600" : "text-emerald-600"
                          }`}
                        >
                          {isDebit ? (
                            <ArrowDownRight className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          )}
                          {tx.amount > 0 ? "+" : ""}
                          {tx.amount.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${meta.style}`}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-gray-600">{tx.description}</td>
                      <td className="px-6 py-3.5 text-right font-medium tabular-nums text-gray-900">
                        {tx.balanceAfter.toFixed(2)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3.5 text-right text-gray-500">
                        {formatDateTime(tx.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {history.totalPages > 1 && (
          <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-6 py-3.5 text-sm">
            <button
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={page === 1}
              className="rounded-lg border border-gray-200 px-3 py-1.5 font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="px-1 text-gray-500">
              Page {history.page} of {history.totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(p + 1, history.totalPages))}
              disabled={page >= history.totalPages}
              className="rounded-lg border border-gray-200 px-3 py-1.5 font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Wallet;
