import DeleteIcon from "./DeleteIcon";
import PlusIcon from "./PlusIcon";
import React, { useState, useEffect, useRef } from "react";
import {
  X, CheckCircle2, Clock, Paperclip, MessageSquare, Mail,
  ChevronDown, Check
} from "lucide-react";
import API from "../../services/api";
import toast from "react-hot-toast";
import { formatNumberToIndian } from "../../utils/numberFormatter";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

const PAYMENT_TYPES = ["UPI", "Cash", "Card", "Net Banking", "Cheque", "EMI", "TDS"];

const fmt = (n) => `₹${formatNumberToIndian(n ?? 0)}`;

// Same dc-panel-card/dc-panel-w quick-drawer shell + pill field spec as
// PaymentFormModal/QuickContactForm/CompanyForm — was a flush, full-height,
// square-cornered drawer with rounded-lg/text-sm fields before.
const RecordPaymentModal = ({ isOpen, onClose, invoice, onSuccess }) => {
  const [isSliding, setIsSliding] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [activeTab, setActiveTab] = useState("record");
  const [loading, setLoading] = useState(false);
  const [localInvoice, setLocalInvoice] = useState(invoice);
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [notifySMS, setNotifySMS] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerEmailError, setCustomerEmailError] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [signatures, setSignatures] = useState([]); // [{label, value, url}]
  const [selectedSignature, setSelectedSignature] = useState("");
  const drawerRef = useRef(null);
  useBodyScrollLock(isOpen);

  useEffect(() => { setLocalInvoice(invoice); }, [invoice]);

  // Slide-in/out animation, matching the other quick-drawer forms (ItemForm,
  // CallLogForm, CompanyForm) instead of popping open and vanishing instantly.
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setTimeout(() => setIsSliding(true), 10);
    } else {
      setIsSliding(false);
      setTimeout(() => setShouldRender(false), 300);
    }
  }, [isOpen]);

  const handleClose = () => {
    setIsSliding(false);
    setTimeout(() => onClose(), 300);
  };

  const totalPaid = (localInvoice?.payments || []).reduce((s, p) => s + p.amount, 0);
  const totalAmount = localInvoice?.amount || 0;
  const amountDue = Math.max(0, totalAmount - totalPaid);

  const [form, setForm] = useState({
    amount: "",
    paymentDate: new Date().toISOString().split("T")[0],
    paymentMethod: "Cash",
    reference: "",
    notes: "",
    internalNotes: "",
  });
  const [wasCapped, setWasCapped] = useState(false);

  useEffect(() => {
    if (isOpen && localInvoice) {
      const due = Math.max(
        0,
        localInvoice.amount -
          (localInvoice.payments || []).reduce((s, p) => s + p.amount, 0)
      );
      setForm({
        amount: due > 0 ? due.toFixed(2) : "",
        paymentDate: new Date().toISOString().split("T")[0],
        paymentMethod: "Cash",
        reference: "",
        notes: "",
        internalNotes: "",
      });
      setActiveTab("record");
      setShowMoreDetails(false);
      setNotifySMS(false);
      setNotifyEmail(false);
      setCustomerEmail("");
      setCustomerEmailError("");
      setCustomerPhone("");
      setSelectedSignature("");

      // Load saved signatures from Document Settings
      fetchSignatures();
    }
  }, [isOpen, invoice]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchSignatures = () => {
    API.get("/document-settings/signatures").then((res) => {
      const sigs = Array.isArray(res.data) ? res.data : (res.data?.signatures || []);
      const mapped = sigs.map((s) => ({
        label: s.name || "Signature",
        // `id` is the custom String field; `_id` is the Mongoose ObjectId.
        // Always coerce to string so the <select> value comparison works.
        value: (s.id && s.id.toString().trim()) || (s._id && s._id.toString()) || s.name,
        url: s.dataUrl || "",
        isDefault: !!s.isDefault,
      }));
      setSignatures(mapped);
      
      if (mapped.length > 0) {
        setSelectedSignature(currentSig => {
          if (!currentSig) {
            const defaultSig = mapped.find((s) => s.isDefault) || mapped[0];
            return defaultSig ? defaultSig.value : "";
          }
          return currentSig;
        });
      }
    }).catch(() => setSignatures([]));
  };

  // Derive customer name from invoice
  const customerName =
    localInvoice?.deal?.title ||
    localInvoice?.customerName ||
    "Customer";

  const invoiceDate = localInvoice?.invoiceDate
    ? new Date(localInvoice.invoiceDate).toLocaleDateString("en-IN", {
        day: "2-digit", month: "short", year: "numeric",
      })
    : "";

  if (!shouldRender || !localInvoice) return null;

  // The amount field is capped at the invoice's live balance. `max` on a
  // number input only blocks the spinners — it does nothing about typing — so
  // anything over the balance is snapped down to it as it is entered, instead
  // of being accepted and then rejected on submit. `amountDue` already nets off
  // every recorded payment, so the cap shrinks as the invoice gets paid down.
  const clampAmount = (raw) => {
    if (raw === "") return "";
    const n = parseFloat(raw);
    if (Number.isNaN(n)) return "";
    if (n < 0) return "0";
    if (n > amountDue) return amountDue > 0 ? String(Number(amountDue.toFixed(2))) : "";
    // Return the raw text, not the parsed number, so part-typed values like
    // "100." or a trailing "0" survive instead of being rewritten mid-keystroke.
    return raw;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "amount") {
      const capped = clampAmount(value);
      setWasCapped(capped !== value);
      setForm((p) => ({ ...p, amount: capped }));
      return;
    }
    setForm((p) => ({ ...p, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const paymentAmount = parseFloat(form.amount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      toast.error("Please enter a valid amount greater than 0");
      return;
    }
    if (paymentAmount > amountDue + 0.01) {
      toast.error(`Payment cannot exceed the remaining balance of ${fmt(amountDue)}`);
      return;
    }
    if (notifyEmail && customerEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim())) {
      setCustomerEmailError("Invalid email format");
      return;
    }
    setCustomerEmailError("");

    setLoading(true);
    try {
      const selectedSig = signatures.find((s) => s.value === selectedSignature);
      const res = await API.post(`/invoices/${localInvoice._id}/payments`, {
        amount: paymentAmount,
        paymentDate: form.paymentDate,
        paymentMethod: form.paymentMethod,
        reference: form.reference,
        notes: form.notes,
        internalNotes: form.internalNotes,
        notifyByEmail: notifyEmail && !!customerEmail,
        customerEmail: notifyEmail ? customerEmail : undefined,
        notifyBySMS: notifySMS && !!customerPhone,
        customerPhone: notifySMS ? customerPhone : undefined,
        signatureUrl: selectedSig?.url || undefined,
      });

      const updated = res.data?.invoice;
      if (updated) setLocalInvoice(updated);

      const remaining = updated
        ? updated.amount - (updated.payments || []).reduce((s, p) => s + p.amount, 0)
        : 0;

      if (remaining <= 0) {
        // Closing the modal right after can interrupt react-hot-toast's own
        // auto-dismiss timer (compounded by the app's duplicated Toasters), so
        // dismiss this toast explicitly instead of relying on it.
        const toastId = toast.success(`Payment of ${fmt(paymentAmount)} recorded — Invoice fully paid!`);
        setTimeout(() => toast.dismiss(toastId), 4000);
        onSuccess?.(updated);
        handleClose();
      } else {
        toast.success(`${fmt(paymentAmount)} recorded — ${fmt(remaining)} still due`);
        setWasCapped(false);
        setForm((p) => ({ ...p, amount: remaining.toFixed(2), reference: "", notes: "", internalNotes: "" }));
        setActiveTab("history");
        onSuccess?.(updated);
      }
    } catch (err) {
      const raw = err.response?.data?.error || "";
      toast.error(
        /validation failed/i.test(raw)
          ? "Couldn't record the payment due to a data issue. Please contact support."
          : raw || "Failed to record payment"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (paymentId) => {
    setDeletingId(paymentId);
    try {
      await API.delete(`/invoices/${localInvoice._id}/payments/${paymentId}`);
      const res = await API.get(`/invoices/${localInvoice._id}`);
      const updated = res.data;
      setLocalInvoice(updated);
      onSuccess?.(updated);
      toast.success("Payment deleted");
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to delete payment");
    } finally {
      setDeletingId(null);
    }
  };

  const fieldClass =
    "w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50 disabled:bg-gray-50 disabled:text-gray-400";
  const labelClass = "block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100019] bg-black/20 backdrop-blur-sm transition-opacity duration-300"
        style={{ opacity: isSliding ? 1 : 0 }}
        onClick={handleClose}
      />

      {/* Right drawer */}
      <div
        ref={drawerRef}
        className={`fixed dc-panel-card dc-panel-w z-[100020] bg-white shadow-2xl flex flex-col overflow-hidden transform transition-transform duration-300 ease-out font-inter ${isSliding ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#D9D9D9] flex-shrink-0 bg-white gap-1">
          <div className="min-w-0">
            <h2 className="text-[15px] font-normal leading-6 text-[#78788D] uppercase tracking-wide truncate">
              Record Payment
            </h2>
            <p className="text-[11px] text-gray-400 truncate">
              Invoice · {localInvoice.invoiceNumber}
              {invoiceDate ? ` · ${invoiceDate}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            title="Close"
            className="w-5 h-5 flex items-center justify-center text-[#1C1B1F] hover:opacity-70 transition-opacity flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-[18px] h-[18px]" strokeWidth={2} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-6 flex-shrink-0">
          {["record", "history"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-2.5 px-3 text-xs font-medium border-b-2 transition-colors capitalize flex items-center gap-1.5 ${
                activeTab === tab
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab === "record" ? "Record Payment" : "History"}
              {tab === "history" && (localInvoice.payments?.length ?? 0) > 0 && (
                <span className="bg-gray-100 text-gray-600 rounded-full px-1.5 py-px text-[10px] font-semibold">
                  {localInvoice.payments.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {activeTab === "record" ? (
            <form id="rp-form" onSubmit={handleSubmit} noValidate>
              {/* Payment gateway banner */}
              <div className="mx-6 mt-4 mb-1 rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 flex items-start gap-3">
                <div className="mt-0.5 text-blue-500">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="5" width="20" height="14" rx="2" />
                    <line x1="2" y1="10" x2="22" y2="10" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-blue-800">Set up Payment Gateway</p>
                  <p className="text-xs text-blue-600 mt-0.5">Want to get paid faster?</p>
                </div>
                <button type="button" className="text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap">
                  Connect Now
                </button>
              </div>

              {/* Payment Details header */}
              <div className="px-6 mt-4 mb-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    Payment Details
                  </p>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[12px] font-medium text-gray-800">{customerName}</span>
                  <span className="text-[12px] font-semibold text-red-500">{fmt(amountDue)}</span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-[11px] text-gray-400">Balance</span>
                </div>
              </div>

              <div className="px-6 space-y-6">
                {/* Amount input */}
                <div>
                  <label className={labelClass}>
                    Amount to be Recorded
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#1F2937] opacity-50 text-[12px] pointer-events-none">
                      ₹
                    </span>
                    <input
                      type="number"
                      name="amount"
                      value={form.amount}
                      onChange={handleChange}
                      onWheel={(e) => e.target.blur()}
                      max={amountDue}
                      step="0.01"
                      min="0.01"
                      disabled={amountDue <= 0}
                      placeholder="0.00"
                      required
                      className={`${fieldClass} pl-8`}
                    />
                  </div>
                  {wasCapped && amountDue > 0 && (
                    <p className="mt-1.5 text-[11px] text-amber-600">
                      Capped at the remaining balance of {fmt(amountDue)}.
                    </p>
                  )}
                  {/* Total / Pending row */}
                  <div className="flex gap-4 mt-2 text-[11px] text-gray-500">
                    <span>
                      Total Amount{" "}
                      <span className="font-medium text-gray-700">{fmt(totalAmount)}</span>
                    </span>
                    <span>
                      Amount Pending{" "}
                      <span className="font-medium text-red-500">{fmt(amountDue)}</span>
                    </span>
                  </div>
                </div>

                {/* Payment Date */}
                <div>
                  <label className={labelClass}>
                    Payment Date
                  </label>
                  <input
                    type="date"
                    name="paymentDate"
                    value={form.paymentDate}
                    onChange={handleChange}
                    disabled={amountDue <= 0}
                    required
                    className={fieldClass}
                  />
                </div>

                {/* Payment Type pills */}
                <div>
                  <label className={labelClass}>
                    Payment Type
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {PAYMENT_TYPES.map((type) => (
                      <button
                        key={type}
                        type="button"
                        disabled={amountDue <= 0}
                        onClick={() => setForm((p) => ({ ...p, paymentMethod: type }))}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          form.paymentMethod === type
                            ? "bg-blue-600 border-blue-600 text-white"
                            : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                {/* More Details toggle */}
                <button
                  type="button"
                  onClick={() => setShowMoreDetails((p) => !p)}
                  className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${showMoreDetails ? "rotate-180" : ""}`}
                  />
                  More Details
                </button>

                {showMoreDetails && (
                  <div className="space-y-4 -mt-2">
                    {/* Reference */}
                    <div>
                      <label className={labelClass}>
                        Payment Reference ID{" "}
                        <span className="text-gray-400 font-normal normal-case tracking-normal">(Optional)</span>
                      </label>
                      <input
                        type="text"
                        name="reference"
                        value={form.reference}
                        onChange={handleChange}
                        disabled={amountDue <= 0}
                        placeholder="Your UTR ID for the payment"
                        className={fieldClass}
                      />
                      <p className="text-[11px] text-gray-400 mt-1.5">
                        A unique ID for each payment.
                      </p>
                    </div>

                    {/* Notes */}
                    <div>
                      <label className={labelClass}>
                        Notes{" "}
                        <span className="text-gray-400 font-normal normal-case tracking-normal">(Optional)</span>
                      </label>
                      <textarea
                        name="notes"
                        value={form.notes}
                        onChange={handleChange}
                        disabled={amountDue <= 0}
                        rows={2}
                        placeholder="Your notes on the payment"
                        className="w-full px-3 py-2 border border-[#1F2937]/10 rounded-2xl text-[12px] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all disabled:bg-gray-50 resize-none"
                      />
                    </div>

                    {/* Internal Notes */}
                    <div>
                      <label className={labelClass}>
                        Internal Notes{" "}
                        <span className="text-gray-400 font-normal normal-case tracking-normal">(Optional)</span>
                      </label>
                      <textarea
                        name="internalNotes"
                        value={form.internalNotes}
                        onChange={handleChange}
                        disabled={amountDue <= 0}
                        rows={2}
                        placeholder="Enter notes here..."
                        className="w-full px-3 py-2 border border-[#1F2937]/10 rounded-2xl text-[12px] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all disabled:bg-gray-50 resize-none"
                      />
                      <p className="text-[11px] text-gray-400 mt-1.5">
                        This note is exclusively for internal reference and will not be shown elsewhere.
                      </p>
                    </div>

                    {/* Attachments */}
                    <div>
                      <button
                        type="button"
                        className="flex items-center gap-2 px-3 h-8 border border-dashed border-gray-300 rounded-full text-[12px] font-medium text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-colors w-full justify-center"
                      >
                        <Paperclip className="w-3.5 h-3.5" />
                        Attachments (Max: 3)
                      </button>
                    </div>
                  </div>
                )}

                {/* Notify Customer */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Notify Customer
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {/* SMS toggle */}
                    <button
                      type="button"
                      onClick={() => setNotifySMS((p) => !p)}
                      className={`flex items-center gap-1.5 px-3 h-8 border rounded-full text-xs font-medium transition-colors ${
                        notifySMS
                          ? "border-green-500 bg-green-50 text-green-700"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      <MessageSquare className={`w-3.5 h-3.5 ${notifySMS ? "text-green-500" : "text-green-400"}`} />
                      Send SMS
                      {notifySMS ? <Check className="w-3 h-3" /> : <PlusIcon className="w-4 h-4 text-gray-400" />}
                    </button>

                    {/* Email toggle */}
                    <button
                      type="button"
                      onClick={() => setNotifyEmail((p) => !p)}
                      className={`flex items-center gap-1.5 px-3 h-8 border rounded-full text-xs font-medium transition-colors ${
                        notifyEmail
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      <Mail className={`w-3.5 h-3.5 ${notifyEmail ? "text-blue-500" : "text-blue-400"}`} />
                      Send Email
                      {notifyEmail ? <Check className="w-3 h-3" /> : <PlusIcon className="w-4 h-4 text-gray-400" />}
                    </button>
                  </div>

                  {/* SMS input — shown when SMS toggle is ON */}
                  {notifySMS && (
                    <div className="mt-2">
                      <input
                        type="tel"
                        inputMode="numeric"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
                        placeholder="Customer mobile number (10 digits)"
                        maxLength={10}
                        className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-green-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50"
                      />
                      <p className="text-[11px] text-gray-400 mt-1.5">
                        A payment receipt SMS will be sent via Fast2SMS.
                      </p>
                    </div>
                  )}

                  {/* Email input — shown when email toggle is ON */}
                  {notifyEmail && (
                    <div className="mt-2">
                      <input
                        type="email"
                        value={customerEmail}
                        onChange={(e) => {
                          setCustomerEmail(e.target.value);
                          if (customerEmailError) setCustomerEmailError("");
                        }}
                        placeholder="Customer email address"
                        className={`${fieldClass} ${customerEmailError ? "border-red-500" : ""}`}
                      />
                      {customerEmailError && (
                        <p className="mt-1 text-xs text-red-600">{customerEmailError}</p>
                      )}
                      <p className="text-[11px] text-gray-400 mt-1.5">
                        A payment receipt will be sent via SendGrid to this address.
                      </p>
                    </div>
                  )}
                </div>

                {/* Select Signature */}
                <div className="pb-6">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Select Signature
                    </p>
                    <button
                      type="button"
                      onClick={() => window.open("/settings/brand", "_blank")}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      <PlusIcon className="w-4 h-4" />
                      Add New Signature
                    </button>
                  </div>
                  <div className="relative">
                    <select
                      value={selectedSignature}
                      onChange={(e) => setSelectedSignature(e.target.value)}
                      onFocus={fetchSignatures}
                      className={`${fieldClass} appearance-none bg-white cursor-pointer`}
                    >
                      <option value="">No Signature</option>
                      {signatures.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  </div>
                  {/* Signature preview */}
                  {selectedSignature && signatures.find((s) => s.value === selectedSignature)?.url && (
                    <div className="mt-2 p-2 border border-[#1F2937]/10 rounded-xl bg-gray-50">
                      <img
                        src={signatures.find((s) => s.value === selectedSignature).url}
                        alt="Signature preview"
                        className="h-12 object-contain"
                      />
                    </div>
                  )}
                  <p className="text-[11px] text-gray-400 mt-1.5">Signature on the document</p>
                </div>
              </div>
            </form>
          ) : (
            /* History tab */
            <div className="px-6 py-4">
              {!localInvoice.payments || localInvoice.payments.length === 0 ? (
                <div className="py-12 flex flex-col items-center text-gray-400">
                  <Clock className="w-8 h-8 mb-2 text-gray-300" />
                  <p className="text-sm">No payments recorded yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {localInvoice.payments.slice().reverse().map((payment) => (
                    <div
                      key={payment._id}
                      className="p-3.5 bg-gray-50 rounded-xl border border-gray-100 flex items-start justify-between gap-3"
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{fmt(payment.amount)}</p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-xs text-gray-500">
                            <span>
                              {new Date(payment.paymentDate).toLocaleDateString("en-IN", {
                                day: "2-digit", month: "short", year: "numeric",
                              })}
                            </span>
                            <span>·</span>
                            <span>{payment.paymentMethod}</span>
                            {payment.reference && (
                              <>
                                <span>·</span>
                                <span>Ref: {payment.reference}</span>
                              </>
                            )}
                          </div>
                          {payment.notes && (
                            <p className="text-xs text-gray-400 mt-1">{payment.notes}</p>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDelete(payment._id)}
                        disabled={deletingId === payment._id}
                        className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Delete payment"
                      >
                        {deletingId === payment._id ? (
                          <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <DeleteIcon className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sticky footer — Record Payment button, matching the quick-drawer footer spec */}
        {activeTab === "record" && (
          <div className="flex-shrink-0 py-2.5 px-6 border-t border-gray-100 bg-white">
            <button
              type="submit"
              form="rp-form"
              disabled={loading || amountDue <= 0}
              className="w-full py-2.5 bg-[#158FFF] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-[25px] transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving...
                </>
              ) : amountDue <= 0 ? (
                "Invoice Fully Paid"
              ) : (
                "Record Payment"
              )}
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default RecordPaymentModal;
