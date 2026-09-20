import PlusIcon from "../common/PlusIcon";
import SearchIcon from "../common/SearchIcon";
import React, { useState, useEffect, useRef } from "react";
import {
  X, Paperclip, MessageSquare, Mail, ChevronDown, Check,
} from "lucide-react";
import API from "../../services/api";
import toast from "react-hot-toast";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

const PAYMENT_TYPES = ["UPI", "Cash", "Card", "Net Banking", "Cheque", "EMI"];

const money = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Free-text Vendor/Customer field that also looks the name up against real
// records as you type — Vendors for Pay Out, Contacts for Pay In — so you can
// see whether a party already exists and pick it, instead of guessing at
// spelling or accidentally creating a near-duplicate entry. Journal entries
// only ever store the plain party name (see JournalEntry.js — no partyId),
// so picking a suggestion just fills the name; typing a name that isn't
// found is still accepted as-is.
const PartySearchInput = ({ value, onChange, partyType, placeholder, fieldClass }) => {
  const isVendor = partyType === "Vendor";
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchOptions = (search) => {
    setLoading(true);
    const url = isVendor ? "/vendors" : "/contacts";
    API.get(`${url}${search ? `?search=${encodeURIComponent(search)}` : ""}`)
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : res.data?.vendors || res.data?.contacts || [];
        setOptions(list.slice(0, 8));
      })
      .catch(() => setOptions([]))
      .finally(() => setLoading(false));
  };

  const handleFocus = () => {
    setIsOpen(true);
    if (options.length === 0) fetchOptions(value);
  };

  const handleInputChange = (e) => {
    const v = e.target.value;
    onChange(v);
    setIsOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchOptions(v), 250);
  };

  const handlePick = (option) => {
    onChange(option.name);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={handleFocus}
          placeholder={placeholder}
          autoComplete="off"
          className={`${fieldClass} pl-8`}
        />
      </div>
      {isOpen && (
        <div className="absolute z-[100025] w-full mt-1.5 bg-white border border-[#1F2937]/10 rounded-xl shadow-xl overflow-hidden">
          <div className="max-h-52 overflow-y-auto py-1">
            {loading ? (
              <div className="px-4 py-3 text-[12px] text-gray-400 text-center">Searching…</div>
            ) : options.length > 0 ? (
              options.map((option) => (
                <button
                  type="button"
                  key={option._id}
                  onClick={() => handlePick(option)}
                  className="w-full text-left px-4 py-2 text-[12px] text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-between gap-2"
                >
                  <span className="truncate font-medium">{option.name}</span>
                  {(option.phone || option.email) && (
                    <span className="text-[11px] text-gray-400 truncate">{option.phone || option.email}</span>
                  )}
                </button>
              ))
            ) : (
              <div className="px-4 py-3 text-[12px] text-gray-400 text-center italic">
                No {isVendor ? "vendor" : "customer"} found — it'll be recorded as a new name.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/*
 * Records one Pay In or Pay Out entry against a Journal. Same dc-panel-card
 * quick-drawer shell + pill field spec as RecordPaymentModal (its invoice
 * equivalent) — cloned rather than shared because this targets a Journal,
 * not an Invoice, and posts to a different endpoint.
 *
 * Direction is fixed entirely by the `type` prop the caller passes (which
 * button — Pay In or Pay Out — was clicked). There is deliberately no
 * Credit/Debit toggle on the form itself: the backend's addJournalEntry
 * adds for "payin" and subtracts for "payout", so the sign is never a
 * user-entered value.
 */
const PayInOutModal = ({ isOpen, onClose, journal, type, onSuccess }) => {
  const isIn = type === "payin";
  useBodyScrollLock(isOpen);

  const [isSliding, setIsSliding] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [notifySMS, setNotifySMS] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerEmailError, setCustomerEmailError] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [signatures, setSignatures] = useState([]);
  const [selectedSignature, setSelectedSignature] = useState("");

  const [form, setForm] = useState({
    partyName: "",
    amount: "",
    date: new Date().toISOString().split("T")[0],
    time: new Date().toTimeString().slice(0, 5),
    paymentType: "Cash",
    bank: "",
    referenceId: "",
    notes: "",
    internalNotes: "",
  });

  // Slide-in/out animation, matching RecordPaymentModal/JournalLedgerDrawer.
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setTimeout(() => setIsSliding(true), 10);
    } else {
      setIsSliding(false);
      setTimeout(() => setShouldRender(false), 300);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setForm({
      partyName: "",
      amount: "",
      date: new Date().toISOString().split("T")[0],
      time: new Date().toTimeString().slice(0, 5),
      paymentType: "Cash",
      bank: "",
      referenceId: "",
      notes: "",
      internalNotes: "",
    });
    setShowMoreDetails(false);
    setNotifySMS(false);
    setNotifyEmail(false);
    setCustomerEmail("");
    setCustomerEmailError("");
    setCustomerPhone("");
    setSelectedSignature("");

    fetchSignatures();
  }, [isOpen, type, journal?._id]);

  const fetchSignatures = () => {
    API.get("/document-settings/signatures").then((res) => {
      const sigs = Array.isArray(res.data) ? res.data : (res.data?.signatures || []);
      const mapped = sigs.map((s) => ({
        label: s.name || "Signature",
        // Always coerce to string so the <select> value comparison works.
        value: (s.id && s.id.toString().trim()) || (s._id && s._id.toString()) || s.name,
        url: s.dataUrl || "",
        isDefault: !!s.isDefault,
      }));
      setSignatures(mapped);
      
      // We don't have selectedSignature in scope for the default check here easily if we
      // use the state asynchronously, so we only set default if it's empty.
      setForm(curr => curr); // Just triggering a safe state update callback to keep block clean
      
      // If we don't have a signature selected yet and there are signatures
      if (mapped.length > 0) {
         // Using the setState callback form ensures we have the latest value of selectedSignature
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

  const handleClose = () => {
    setIsSliding(false);
    setTimeout(() => onClose(), 300);
  };

  if (!shouldRender || !journal) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  };

  const projected = (() => {
    const amt = parseFloat(form.amount);
    if (!Number.isFinite(amt) || amt <= 0) return journal.currentBalance;
    return journal.currentBalance + (isIn ? amt : -amt);
  })();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(form.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Please enter a valid amount greater than 0");
      return;
    }

    if (notifyEmail && customerEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim())) {
      setCustomerEmailError("Invalid email format");
      return;
    }
    setCustomerEmailError("");

    // Combine the picked day with the picked time; a blank time falls back to
    // the current clock time so the entry still gets a precise instant to sort
    // on. Sent as a full ISO timestamp.
    const entryDate = (() => {
      const day = form.date || new Date().toISOString().split("T")[0];
      const time = /^\d{2}:\d{2}/.test(form.time)
        ? (form.time.length === 5 ? `${form.time}:00` : form.time)
        : new Date().toTimeString().slice(0, 8);
      const dt = new Date(`${day}T${time}`);
      return Number.isNaN(dt.getTime()) ? new Date().toISOString() : dt.toISOString();
    })();

    setLoading(true);
    try {
      const res = await API.post(`/journals/${journal._id}/entries`, {
        type,
        date: entryDate,
        partyType: isIn ? "Customer" : "Vendor",
        partyName: form.partyName,
        amount: amt,
        paymentType: form.paymentType,
        bank: form.bank,
        referenceId: form.referenceId,
        notes: form.notes,
        internalNotes: form.internalNotes,
      });

      toast.success(`${isIn ? "Received amount" : "Given amount"} of ${money(amt)} recorded`);
      onSuccess?.(res.data.journal, res.data.entry);
      handleClose();
    } catch (err) {
      toast.error(err.response?.data?.error || `Failed to record ${isIn ? "received amount" : "given amount"}`);
    } finally {
      setLoading(false);
    }
  };

  const fieldClass =
    "w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50 disabled:bg-gray-50 disabled:text-gray-400";
  const labelClass = "block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2";
  const accentText = isIn ? "text-green-600" : "text-red-600";
  const accentBtn = isIn ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700";

  return (
    <>
      <div
        className="fixed inset-0 z-[100019] bg-black/20 backdrop-blur-sm transition-opacity duration-300"
        style={{ opacity: isSliding ? 1 : 0 }}
        onClick={handleClose}
      />

      <div
        className={`fixed dc-panel-card dc-panel-w z-[100020] bg-white shadow-2xl flex flex-col overflow-hidden transform transition-transform duration-300 ease-out ${isSliding ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#D9D9D9] flex-shrink-0 bg-white gap-1">
          <div className="min-w-0">
            <h2 className={`text-[14px] font-semibold leading-5 uppercase tracking-wide truncate ${accentText}`}>
              {isIn ? "You Received" : "You Gave"}
            </h2>
            <p className="text-[11px] text-gray-400 truncate">Journal · {journal.name}</p>
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

        {/* Scrollable body */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <form id="payinout-form" onSubmit={handleSubmit} noValidate>
            {/* Current -> projected balance, so the effect is visible before saving */}
            <div className="mx-6 mt-4 mb-1 flex items-center justify-between px-4 py-3 rounded-xl bg-gray-50 border border-[#1F2937]/10">
              <span className="text-[11px] text-gray-500">Journal balance</span>
              <div className="flex items-center gap-2 text-[13px] font-semibold">
                <span className="text-gray-900">{money(journal.currentBalance)}</span>
                <span className="text-gray-400">→</span>
                <span className={projected < 0 ? "text-red-600" : "text-gray-900"}>{money(projected)}</span>
              </div>
            </div>

            <div className="px-6 mt-4 space-y-6">
              {/* Party — searches real Vendors/Contacts as you type so you
                  can see whether this party already exists and pick it,
                  while still accepting a brand-new name as free text. */}
              <div>
                <label className={labelClass}>{isIn ? "Customer" : "Vendor"}</label>
                <PartySearchInput
                  value={form.partyName}
                  onChange={(v) => setForm((p) => ({ ...p, partyName: v }))}
                  partyType={isIn ? "Customer" : "Vendor"}
                  placeholder={isIn ? "Who paid you?" : "Who did you pay?"}
                  fieldClass={fieldClass}
                />
              </div>

              {/* Amount */}
              <div>
                <label className={labelClass}>Amount</label>
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
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    required
                    className={`${fieldClass} pl-8`}
                  />
                </div>
              </div>

              {/* Date + Time — time is optional; left blank it defaults to the
                  current time when the entry is recorded. */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Date</label>
                  <input
                    type="date"
                    name="date"
                    value={form.date}
                    onChange={handleChange}
                    required
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Time <span className="text-[#99A0AE] font-normal">(optional)</span></label>
                  <input
                    type="time"
                    name="time"
                    value={form.time}
                    onChange={handleChange}
                    className={fieldClass}
                  />
                </div>
              </div>

              {/* Payment Type pills */}
              <div>
                <label className={labelClass}>Payment Type</label>
                <div className="flex flex-wrap gap-2">
                  {PAYMENT_TYPES.map((pt) => (
                    <button
                      key={pt}
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, paymentType: pt }))}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        form.paymentType === pt
                          ? `${accentBtn} border-transparent text-white`
                          : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"
                      }`}
                    >
                      {pt}
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
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showMoreDetails ? "rotate-180" : ""}`} />
                More Details
              </button>

              {showMoreDetails && (
                <div className="space-y-4 -mt-2">
                  <div>
                    <label className={labelClass}>
                      Bank / Account <span className="text-gray-400 font-normal normal-case tracking-normal">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      name="bank"
                      value={form.bank}
                      onChange={handleChange}
                      placeholder="e.g. HDFC Current A/C"
                      className={fieldClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>
                      Payment Reference ID{" "}
                      <span className="text-gray-400 font-normal normal-case tracking-normal">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      name="referenceId"
                      value={form.referenceId}
                      onChange={handleChange}
                      placeholder="Your UTR ID for the payment"
                      className={fieldClass}
                    />
                    <p className="text-[11px] text-gray-400 mt-1.5">A unique ID for each payment.</p>
                  </div>

                  <div>
                    <label className={labelClass}>
                      Notes <span className="text-gray-400 font-normal normal-case tracking-normal">(Optional)</span>
                    </label>
                    <textarea
                      name="notes"
                      value={form.notes}
                      onChange={handleChange}
                      rows={2}
                      placeholder={`Your notes on the ${isIn ? "received amount" : "given amount"}`}
                      className="w-full px-3 py-2 border border-[#1F2937]/10 rounded-2xl text-[12px] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all resize-none"
                    />
                  </div>

                  <div>
                    <label className={labelClass}>
                      Internal Notes{" "}
                      <span className="text-gray-400 font-normal normal-case tracking-normal">(Optional)</span>
                    </label>
                    <textarea
                      name="internalNotes"
                      value={form.internalNotes}
                      onChange={handleChange}
                      rows={2}
                      placeholder="Enter notes here..."
                      className="w-full px-3 py-2 border border-[#1F2937]/10 rounded-2xl text-[12px] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all resize-none"
                    />
                    <p className="text-[11px] text-gray-400 mt-1.5">
                      This note is exclusively for internal reference and will not be shown elsewhere.
                    </p>
                  </div>

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

              {/* Notify Customer — Pay In only, matching the reference: an
                  outgoing payment (Pay Out) has no customer to notify. */}
              {isIn && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Notify Customer
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setNotifySMS((p) => !p)}
                      className={`flex items-center gap-1.5 px-3 h-8 border rounded-full text-xs font-medium transition-colors ${
                        notifySMS ? "border-green-500 bg-green-50 text-green-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      <MessageSquare className={`w-3.5 h-3.5 ${notifySMS ? "text-green-500" : "text-green-400"}`} />
                      Send SMS
                      {notifySMS ? <Check className="w-3 h-3" /> : <PlusIcon className="w-4 h-4 text-gray-400" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => setNotifyEmail((p) => !p)}
                      className={`flex items-center gap-1.5 px-3 h-8 border rounded-full text-xs font-medium transition-colors ${
                        notifyEmail ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      <Mail className={`w-3.5 h-3.5 ${notifyEmail ? "text-blue-500" : "text-blue-400"}`} />
                      Send Email
                      {notifyEmail ? <Check className="w-3 h-3" /> : <PlusIcon className="w-4 h-4 text-gray-400" />}
                    </button>
                  </div>

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
                    </div>
                  )}

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
                    </div>
                  )}
                </div>
              )}

              {/* Select Signature */}
              <div className="pb-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Select Signature</p>
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
        </div>

        {/* Sticky footer */}
        <div className="flex-shrink-0 py-2.5 px-6 border-t border-gray-100 bg-white">
          <button
            type="submit"
            form="payinout-form"
            disabled={loading}
            className={`w-full py-2.5 ${accentBtn} disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-[25px] transition-colors flex items-center justify-center gap-2`}
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              "Record"
            )}
          </button>
        </div>
      </div>
    </>
  );
};

export default PayInOutModal;
