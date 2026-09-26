import DeleteIcon from "../common/DeleteIcon";
import React, { useState, useEffect } from "react";
import { X, CheckCircle2, Clock, ChevronDown } from "lucide-react";
import API from "../../services/api";
import toast from "react-hot-toast";
import { formatNumberToIndian } from "../../utils/numberFormatter";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

const PAYMENT_TYPES = ["UPI", "Cash", "Card", "Net Banking", "Cheque", "NEFT", "RTGS", "IMPS"];

const fmt = (n) => `₹${formatNumberToIndian(n ?? 0)}`;

// Refund-side counterpart of RecordPurchasePaymentModal.jsx. A Purchase Return
// is goods going back to the vendor; the vendor refunding us is money coming IN
// ("Got" on the vendor's page), and it can arrive in instalments — so this is
// the same drawer, pointed at /purchase-returns/:id/payments, which the backend
// turns into a real Payment(IN) allocated to the return (Confirmed -> Partial
// -> Paid driven by the money). Stock is untouched: it moved once at Confirmed.
const RecordPurchaseReturnRefundModal = ({ isOpen, onClose, purchaseReturn, onSuccess }) => {
  useBodyScrollLock(isOpen);
  const [isSliding, setIsSliding] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [activeTab, setActiveTab] = useState("record");
  const [loading, setLoading] = useState(false);
  const [localReturn, setLocalReturn] = useState(purchaseReturn);
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => { setLocalReturn(purchaseReturn); }, [purchaseReturn]);

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

  const totalRefunded = (localReturn?.payments || []).reduce((s, p) => s + p.amount, 0);
  const totalAmount = localReturn?.grandTotal || 0;
  const amountDue = Math.max(0, totalAmount - totalRefunded);

  const [form, setForm] = useState({
    amount: "",
    paymentDate: new Date().toISOString().split("T")[0],
    paymentMethod: "UPI",
    reference: "",
    notes: "",
    internalNotes: "",
  });
  const [wasCapped, setWasCapped] = useState(false);

  useEffect(() => {
    if (isOpen && localReturn) {
      const due = Math.max(
        0,
        (localReturn.grandTotal || 0) -
          (localReturn.payments || []).reduce((s, p) => s + p.amount, 0)
      );
      setForm({
        amount: due > 0 ? due.toFixed(2) : "",
        paymentDate: new Date().toISOString().split("T")[0],
        // Default to how the refund was originally expected to settle, when the
        // return recorded a `mode`; otherwise UPI, same as the purchase modal.
        paymentMethod: PAYMENT_TYPES.includes(localReturn.mode) ? localReturn.mode : "UPI",
        reference: "",
        notes: "",
        internalNotes: "",
      });
      setActiveTab("record");
      setShowMoreDetails(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, purchaseReturn]);

  const vendorName = localReturn?.vendor?.name || "Vendor";

  const returnDate = localReturn?.returnDate
    ? new Date(localReturn.returnDate).toLocaleDateString("en-IN", {
        day: "2-digit", month: "short", year: "numeric",
      })
    : "";

  if (!shouldRender || !localReturn) return null;

  // Same cap-as-you-type behaviour as RecordPurchasePaymentModal — the refund
  // can never exceed the return's remaining balance, and `amountDue` shrinks as
  // instalments are recorded.
  const clampAmount = (raw) => {
    if (raw === "") return "";
    const n = parseFloat(raw);
    if (Number.isNaN(n)) return "";
    if (n < 0) return "0";
    if (n > amountDue) return amountDue > 0 ? String(Number(amountDue.toFixed(2))) : "";
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
    const refundAmount = parseFloat(form.amount);
    if (isNaN(refundAmount) || refundAmount <= 0) {
      toast.error("Please enter a valid amount greater than 0");
      return;
    }
    if (refundAmount > amountDue + 0.01) {
      toast.error(`Refund cannot exceed the remaining balance of ${fmt(amountDue)}`);
      return;
    }

    setLoading(true);
    try {
      const res = await API.post(`/purchase-returns/${localReturn._id}/payments`, {
        amount: refundAmount,
        paymentDate: form.paymentDate,
        paymentMethod: form.paymentMethod,
        reference: form.reference,
        notes: form.notes,
        internalNotes: form.internalNotes,
      });

      const updated = res.data?.purchaseReturn;
      if (updated) setLocalReturn(updated);

      const remaining = updated
        ? (updated.grandTotal || 0) - (updated.payments || []).reduce((s, p) => s + p.amount, 0)
        : 0;

      if (remaining <= 0) {
        const toastId = toast.success(`Refund of ${fmt(refundAmount)} recorded — Return fully refunded!`);
        setTimeout(() => toast.dismiss(toastId), 4000);
        onSuccess?.(updated);
        handleClose();
      } else {
        toast.success(`${fmt(refundAmount)} refund recorded — ${fmt(remaining)} still due`);
        setWasCapped(false);
        setForm((p) => ({ ...p, amount: remaining.toFixed(2), reference: "", notes: "", internalNotes: "" }));
        setActiveTab("history");
        onSuccess?.(updated);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to record refund");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (paymentId) => {
    setDeletingId(paymentId);
    try {
      await API.delete(`/purchase-returns/${localReturn._id}/payments/${paymentId}`);
      const res = await API.get(`/purchase-returns/${localReturn._id}`);
      const updated = res.data;
      setLocalReturn(updated);
      onSuccess?.(updated);
      toast.success("Refund deleted");
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to delete refund");
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
        className={`fixed dc-panel-card dc-panel-w z-[100020] bg-white shadow-2xl flex flex-col overflow-hidden transform transition-transform duration-300 ease-out font-inter ${isSliding ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#D9D9D9] flex-shrink-0 bg-white gap-1">
          <div className="min-w-0">
            <h2 className="text-[15px] font-normal leading-6 text-[#78788D] uppercase tracking-wide truncate">
              Record Refund
            </h2>
            <p className="text-[11px] text-gray-400 truncate">
              Purchase Return · {localReturn.returnNumber}
              {returnDate ? ` · ${returnDate}` : ""}
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
              {tab === "record" ? "Record Refund" : "History"}
              {tab === "history" && (localReturn.payments?.length ?? 0) > 0 && (
                <span className="bg-gray-100 text-gray-600 rounded-full px-1.5 py-px text-[10px] font-semibold">
                  {localReturn.payments.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {activeTab === "record" ? (
            <form id="rprr-form" onSubmit={handleSubmit}>
              {/* Refund Details header */}
              <div className="px-6 mt-4 mb-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    Refund Details
                  </p>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[12px] font-medium text-gray-800">{vendorName}</span>
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
                  <div className="flex gap-4 mt-2 text-[11px] text-gray-500">
                    <span>
                      Return Total{" "}
                      <span className="font-medium text-gray-700">{fmt(totalAmount)}</span>
                    </span>
                    <span>
                      Refund Pending{" "}
                      <span className="font-medium text-red-500">{fmt(amountDue)}</span>
                    </span>
                  </div>
                </div>

                {/* Refund Date */}
                <div>
                  <label className={labelClass}>
                    Refund Date
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
                    Refund Method
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
                  <div className="space-y-4 -mt-2 pb-6">
                    {/* Reference */}
                    <div>
                      <label className={labelClass}>
                        Refund Reference ID{" "}
                        <span className="text-gray-400 font-normal normal-case tracking-normal">(Optional)</span>
                      </label>
                      <input
                        type="text"
                        name="reference"
                        value={form.reference}
                        onChange={handleChange}
                        disabled={amountDue <= 0}
                        placeholder="Vendor's UTR ID for the refund"
                        className={fieldClass}
                      />
                      <p className="text-[11px] text-gray-400 mt-1.5">
                        A unique ID for each refund.
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
                        placeholder="Your notes on the refund"
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
                  </div>
                )}
                {!showMoreDetails && <div className="pb-2" />}
              </div>
            </form>
          ) : (
            /* History tab */
            <div className="px-6 py-4">
              {!localReturn.payments || localReturn.payments.length === 0 ? (
                <div className="py-12 flex flex-col items-center text-gray-400">
                  <Clock className="w-8 h-8 mb-2 text-gray-300" />
                  <p className="text-sm">No refunds recorded yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {localReturn.payments.slice().reverse().map((payment) => (
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
                        title="Delete refund"
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

        {/* Sticky footer */}
        {activeTab === "record" && (
          <div className="flex-shrink-0 py-2.5 px-6 border-t border-gray-100 bg-white flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="px-6 py-2 border border-gray-200 text-gray-700 rounded-[25px] text-sm font-bold hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="rprr-form"
              disabled={loading || amountDue <= 0}
              className="px-6 py-2 bg-[#158FFF] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-[25px] transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving...
                </>
              ) : amountDue <= 0 ? (
                "Return Fully Refunded"
              ) : (
                "Record Refund"
              )}
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default RecordPurchaseReturnRefundModal;
