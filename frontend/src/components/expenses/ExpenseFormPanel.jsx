import PlusIcon from "../common/PlusIcon";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { X, Check, ChevronDown, Paperclip } from "lucide-react";
import API from "../../services/api";
import toast from "react-hot-toast";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

/*
 * Create/edit panel for an Expense or an Indirect Income entry.
 *
 * One component for both, since the two forms differ only in wording and
 * category list — `kind` switches those. Same right-side card chrome as
 * PaymentFormModal / ApplyCreditModal.
 *
 * Payment details (date, type, bank) are always visible and every entry is
 * recorded as Paid — these are movements of money that has already happened,
 * so there is no Pending state to toggle into.
 */

const PAYMENT_TYPES = ["UPI", "Cash", "Card", "Net Banking", "Cheque", "EMI"];

const MAX_FILES = 3;
const MAX_FILE_MB = 25;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
const ACCEPTED = ".pdf,.png,.jpg,.jpeg,.xls,.xlsx,.csv";

const BASE_CURRENCY = "INR";
const CURRENCIES = [
  { code: "INR", symbol: "\u20B9" },
  { code: "USD", symbol: "$" },
  { code: "EUR", symbol: "\u20AC" },
  { code: "GBP", symbol: "\u00A3" },
  { code: "AED", symbol: "\u062F.\u0625" },
  { code: "SGD", symbol: "S$" },
  { code: "AUD", symbol: "A$" },
  { code: "CAD", symbol: "C$" },
  { code: "JPY", symbol: "\u00A5" },
  { code: "CNY", symbol: "CN\u00A5" },
];
const symbolFor = (code) =>
  CURRENCIES.find((c) => c.code === code)?.symbol || code;

const fileSize = (bytes) => {
  const kb = (Number(bytes) || 0) / 1024;
  return kb < 1024 ? `${Math.max(1, Math.round(kb))} KB` : `${(kb / 1024).toFixed(1)} MB`;
};

const toDateInput = (d) => {
  const date = d ? new Date(d) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  // Local, not toISOString — that shifts the date back a day for anyone east
  // of UTC, which is everyone using this.
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export default function ExpenseFormPanel({ kind = "expense", record, onClose, onSaved }) {
  const isIncome = kind === "income";
  const noun = isIncome ? "Income" : "Expense";

  const [isSliding, setIsSliding] = useState(false);
  useBodyScrollLock(true);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState([]);
  const [banks, setBanks] = useState([]);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const categoryRef = useRef(null);
  // "Create with vendor" - off by default, since most spending has no
  // counterparty worth recording. Attaching one only attributes the spend; it
  // does NOT turn the entry into a vendor payment or let it settle a bill.
  const [withVendor, setWithVendor] = useState(false);
  const [vendors, setVendors] = useState([]);
  const [vendorOpen, setVendorOpen] = useState(false);
  const [vendorSearch, setVendorSearch] = useState("");
  // Multi-currency, off by default. When on, the amount is typed in the
  // chosen currency and converted to INR on save - `amount` must stay in one
  // currency because every total and balance in the app reads it.
  const [multiCurrency, setMultiCurrency] = useState(false);
  const [rateMode, setRateMode] = useState("auto");
  const [rateLoading, setRateLoading] = useState(false);
  const [rateInfo, setRateInfo] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState({
    amount: "",
    date: toDateInput(),
    category: "",
    notes: "",
    status: "Pending",
    paymentDate: toDateInput(),
    paymentType: "UPI",
    bankAccount: "",
    paymentNotes: "",
    vendor: "",
    currency: BASE_CURRENCY,
    exchangeRate: "",
  });

  useEffect(() => {
    setIsSliding(false);
    const t = setTimeout(() => setIsSliding(true), 10);
    return () => clearTimeout(t);
  }, []);

  // Editing an existing row loads its values; creating starts clean.
  useEffect(() => {
    if (!record) return;
    setForm({
      amount: record.amount != null ? String(record.amount) : "",
      date: toDateInput(record.date),
      category: record.category || "",
      notes: record.notes || "",
      status: record.status || "Pending",
      paymentDate: toDateInput(record.paymentDate || record.date),
      paymentType: record.paymentType || "UPI",
      bankAccount: record.bankAccount?._id || record.bankAccount || "",
      paymentNotes: record.paymentNotes || "",
      vendor: record.vendor?._id || record.vendor || "",
    });
    // Editing an entry that already has a vendor shows the field open, rather
    // than hiding the value behind a collapsed toggle.
    if (record.vendor) setWithVendor(true);
    setAttachments(record.attachments || []);
    if (record.currency && record.currency !== BASE_CURRENCY) {
      setMultiCurrency(true);
      // The saved rate is part of the record - don't overwrite it with today's.
      setRateMode("manual");
      setForm((f) => ({
        ...f,
        currency: record.currency,
        exchangeRate: String(record.exchangeRate || ""),
        // Show what was originally typed, not the converted INR figure.
        amount: record.foreignAmount != null ? String(record.foreignAmount) : f.amount,
      }));
    }
  }, [record]);

  useEffect(() => {
    (async () => {
      try {
        const [catRes, bankRes, vendorRes] = await Promise.all([
          API.get("/expenses/categories", { params: { kind } }),
          API.get("/bank-details/all"),
          // Same endpoint the payment drawer uses, so the list is already
          // deduped and carries a subtitle that tells same-named vendors apart.
          API.get("/payments-timeline/parties", { params: { direction: "OUT" } }),
        ]);
        setCategories(catRes.data.categories || []);
        setVendors(vendorRes.data.parties || []);
        setBanks(Array.isArray(bankRes.data) ? bankRes.data : []);
      } catch (err) {
        console.error("Failed to load form options", err);
      }
    })();
  }, [kind]);

  // The rate is fetched for you, but the field stays editable - a company
  // booking at a contracted or bank rate needs to override the mid-market one.
  useEffect(() => {
    if (!multiCurrency || form.currency === BASE_CURRENCY || rateMode !== "auto") {
      setRateInfo(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setRateLoading(true);
      setRateInfo(null);
      try {
        const res = await API.get("/expenses/exchange-rate", {
          params: { from: form.currency },
        });
        if (cancelled) return;
        // Trimmed to 4dp: the provider returns ~6, which is noise at the
        // scale these amounts are recorded in.
        setForm((f) => ({ ...f, exchangeRate: String(Number(res.data.rate.toFixed(4))) }));
        setRateInfo({ ok: true, fetchedAt: res.data.fetchedAt, stale: res.data.stale });
      } catch (err) {
        if (cancelled) return;
        setRateInfo({
          ok: false,
          message: err.response?.data?.error || "Couldn't fetch a live rate. Enter it manually.",
        });
      } finally {
        if (!cancelled) setRateLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [multiCurrency, form.currency, rateMode]);

  useEffect(() => {
    if (!categoryOpen) return;
    const onDocClick = (e) => {
      if (categoryRef.current && !categoryRef.current.contains(e.target)) {
        setCategoryOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [categoryOpen]);

  const handleClose = () => {
    setIsSliding(false);
    setTimeout(() => onClose(), 300);
  };

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const amountValid = Number(form.amount) > 0;
  const rateNeeded = multiCurrency && form.currency !== BASE_CURRENCY;
  const rateValid = !rateNeeded || Number(form.exchangeRate) > 0;
  const canSubmit = amountValid && rateValid && !saving;
  const convertedAmount =
    rateNeeded && rateValid && amountValid
      ? Math.round(Number(form.amount) * Number(form.exchangeRate) * 100) / 100
      : null;

  const selectedVendorName = useMemo(
    () => vendors.find((v) => String(v._id) === String(form.vendor))?.name || "",
    [vendors, form.vendor]
  );

  const filteredVendors = useMemo(
    () =>
      vendors.filter((v) =>
        (String(v.name || "") + " " + String(v.subtitle || ""))
          .toLowerCase()
          .includes(vendorSearch.toLowerCase())
      ),
    [vendors, vendorSearch]
  );

  const filteredCategories = useMemo(
    () =>
      categories.filter((c) =>
        c.toLowerCase().includes(categorySearch.toLowerCase())
      ),
    [categories, categorySearch]
  );

  const bankLabel = useMemo(() => {
    const b = banks.find((x) => String(x._id) === String(form.bankAccount));
    if (!b) return "";
    return `${b.bank}${b.accountNumber ? ` (${b.accountNumber})` : ""}`;
  }, [banks, form.bankAccount]);

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const room = MAX_FILES - attachments.length;
    if (room <= 0) {
      toast.error(`Up to ${MAX_FILES} files`);
      return;
    }
    // Trim to what fits rather than rejecting the whole drop - picking 5 files
    // when 2 slots are left should attach 2, not nothing.
    const accepted = files.slice(0, room);
    if (files.length > room) {
      toast(`Only ${room} more file${room === 1 ? "" : "s"} can be attached`, { icon: "!" });
    }

    const tooBig = accepted.find((f) => f.size > MAX_FILE_BYTES);
    if (tooBig) {
      toast.error(`${tooBig.name} is over ${MAX_FILE_MB}MB`);
      return;
    }

    setUploading(true);
    try {
      for (const file of accepted) {
        const body = new FormData();
        body.append("file", file);
        const res = await API.post("/expenses/attachments", body, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        setAttachments((prev) => [...prev, res.data]);
      }
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amountValid) {
      toast.error("Enter an amount greater than zero");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        kind,
        amount: Number(form.amount),
        date: form.date,
        category: form.category,
        notes: form.notes,
        // Always Paid: this form records money that has already moved, and
        // the Pending state no longer has a control or a filter behind it.
        status: "Paid",
        paymentDate: form.paymentDate,
        paymentType: form.paymentType,
        bankAccount: form.bankAccount || null,
        paymentNotes: form.paymentNotes,
        // Cleared when the toggle is off, so turning it off actually detaches
        // a previously-saved vendor instead of silently keeping it.
        vendor: withVendor ? form.vendor || null : null,
        attachments,
        currency: multiCurrency ? form.currency : BASE_CURRENCY,
        exchangeRate: multiCurrency ? Number(form.exchangeRate) : 1,
      };

      if (record?._id) {
        await API.put(`/expenses/${record._id}`, payload);
        toast.success(`${noun} updated`);
      } else {
        await API.post("/expenses", payload);
        toast.success(`${noun} added`);
      }
      onSaved();
      handleClose();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || `Failed to save ${noun.toLowerCase()}`);
    } finally {
      setSaving(false);
    }
  };

  // Copied verbatim from QuickCompanyForm.jsx so the two forms read as the
  // same app - pill radius, 38px tall, 13px text.
  const inputCls =
    "w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all font-inter placeholder:text-[#1F2937] placeholder:opacity-50";
  const labelCls = "block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-1.5";

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[100000] transition-opacity duration-300"
        style={{ opacity: isSliding ? 1 : 0 }}
        onClick={handleClose}
        aria-hidden="true"
      />
      <div
        className={`fixed dc-panel-card dc-panel-w bg-white shadow-2xl flex flex-col z-[100001] overflow-hidden transform transition-transform duration-300 ease-out ${isSliding ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#D9D9D9] flex-shrink-0 bg-white gap-1">
          <h2 className="text-[15px] font-normal leading-6 text-[#78788D] uppercase tracking-wide">
            {record ? `Edit ${noun}` : `Add ${noun}`}
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

        <div className="overflow-y-auto flex-1 px-8 py-6">
          <form id="expense-form" onSubmit={handleSubmit} className="space-y-5">
            <div>
              <button
                type="button"
                onClick={() => {
                  const next = !withVendor;
                  setWithVendor(next);
                  if (!next) set("vendor", "");
                }}
                className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-medium transition-colors ${
                  withVendor
                    ? "bg-blue-50 text-[#158FFF] border border-[#158FFF]"
                    : "border border-[#1F2937]/15 text-[#1F2937] hover:bg-gray-50"
                }`}
              >
                <PlusIcon className="w-4 h-4" />
                Create with vendor
              </button>

              <button
                type="button"
                onClick={() => {
                  const next = !multiCurrency;
                  setMultiCurrency(next);
                  if (!next) set("currency", BASE_CURRENCY);
                }}
                className={`ml-2 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-medium transition-colors ${
                  multiCurrency
                    ? "bg-blue-50 text-[#158FFF] border border-[#158FFF]"
                    : "border border-[#1F2937]/15 text-[#1F2937] hover:bg-gray-50"
                }`}
              >
                <PlusIcon className="w-4 h-4" />
                Multi Currency
              </button>

              {multiCurrency && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Currency</label>
                    <select
                      value={form.currency}
                      onChange={(e) => set("currency", e.target.value)}
                      className={`${inputCls} bg-white`}
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code} ({c.symbol})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em]">
                        Exchange rate{" "}
                        {form.currency !== BASE_CURRENCY && (
                          <span className="text-red-500">*</span>
                        )}
                      </label>
                      <div className="flex items-center gap-0.5 bg-gray-100 rounded-full p-0.5">
                        {["auto", "manual"].map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setRateMode(mode)}
                            className={`px-2.5 h-6 rounded-full text-[10.5px] font-medium capitalize transition-colors ${
                              rateMode === mode
                                ? "bg-white text-[#0E121B] shadow-sm"
                                : "text-[#78788D] hover:text-[#0E121B]"
                            }`}
                          >
                            {mode}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        step="0.0001"
                        value={form.exchangeRate}
                        onChange={(e) => set("exchangeRate", e.target.value)}
                        placeholder={rateLoading ? "Fetching..." : `1 ${form.currency} = ? ${BASE_CURRENCY}`}
                        readOnly={rateMode === "auto"}
                        disabled={form.currency === BASE_CURRENCY || rateLoading}
                        className={`${inputCls} disabled:bg-slate-100 disabled:text-slate-400`}
                      />
                      {rateLoading && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-[#158FFF] border-t-transparent rounded-full animate-spin" />
                      )}
                    </div>
                    {rateMode === "auto" && rateInfo?.ok && (
                      <p className="mt-1 text-[10.5px] text-[#78788D]">
                        {rateInfo.stale ? "Last known rate" : "Live rate"} &middot; switch to Manual to override
                      </p>
                    )}
                    {rateInfo && !rateInfo.ok && (
                      <p className="mt-1 text-[10.5px] text-amber-600">{rateInfo.message}</p>
                    )}
                  </div>
                </div>
              )}

              {withVendor && (
                <div className="mt-3 relative">
                  <label className={labelCls}>Vendor</label>
                  <button
                    type="button"
                    onClick={() => setVendorOpen((v) => !v)}
                    className={`${inputCls} flex items-center justify-between gap-2 text-left bg-white`}
                  >
                    <span className={selectedVendorName ? "" : "opacity-50"}>
                      {selectedVendorName || "Select vendor"}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  </button>
                  {vendorOpen && (
                    <div className="absolute z-30 w-full mt-1.5 bg-white border border-gray-100 rounded-2xl shadow-xl overflow-hidden">
                      <div className="p-2 border-b border-gray-100">
                        <input
                          autoFocus
                          value={vendorSearch}
                          onChange={(e) => setVendorSearch(e.target.value)}
                          placeholder="Search vendors..."
                          className="w-full h-8 px-2.5 text-[12px] rounded-lg border border-gray-200 focus:outline-none focus:border-[#158FFF]"
                        />
                      </div>
                      <div className="max-h-44 overflow-y-auto">
                        {filteredVendors.length === 0 && (
                          <p className="px-3.5 py-3 text-[12px] text-gray-400">No vendors found</p>
                        )}
                        {filteredVendors.map((v) => (
                          <button
                            key={v._id}
                            type="button"
                            onClick={() => {
                              set("vendor", v._id);
                              setVendorOpen(false);
                              setVendorSearch("");
                            }}
                            className={`w-full text-left px-3.5 py-2 text-[12px] transition-colors ${
                              String(v._id) === String(form.vendor)
                                ? "bg-blue-50 text-blue-600 font-medium"
                                : "text-[#1F2937] hover:bg-gray-50"
                            }`}
                          >
                            <span className="block truncate">{v.name}</span>
                            {v.subtitle && (
                              <span className="block truncate text-[10px] text-[#78788D] font-normal">
                                {v.subtitle}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className={labelCls}>
                {noun} Amount <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#1F2937] opacity-50 text-[13px]">
                  {multiCurrency ? symbolFor(form.currency) : "₹"}
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  autoFocus
                  value={form.amount}
                  onChange={(e) => set("amount", e.target.value)}
                  placeholder="Enter amount"
                  className={`${inputCls} pl-7`}
                />
              </div>
              {/* What actually gets stored, shown before saving so the rate
                  can be sanity-checked rather than discovered later. */}
              {convertedAmount !== null && (
                <p className="mt-1.5 text-[11px] text-[#1F2937] opacity-60">
                  Recorded as &#8377;
                  {convertedAmount.toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  at 1 {form.currency} = {form.exchangeRate} {BASE_CURRENCY}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{noun} Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => set("date", e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Category</label>
                <div className="relative" ref={categoryRef}>
                  <button
                    type="button"
                    onClick={() => setCategoryOpen((v) => !v)}
                    className={`${inputCls} flex items-center justify-between gap-2 text-left bg-white`}
                  >
                    <span className={form.category ? "" : "opacity-50"}>
                      {form.category || "Select category"}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  </button>
                  {categoryOpen && (
                    <div className="absolute z-20 w-full mt-1.5 bg-white border border-gray-100 rounded-2xl shadow-xl overflow-hidden">
                      <div className="p-2 border-b border-gray-100">
                        <input
                          autoFocus
                          value={categorySearch}
                          onChange={(e) => setCategorySearch(e.target.value)}
                          placeholder="Search categories..."
                          className="w-full h-8 px-2.5 text-[12px] rounded-full border border-gray-200 focus:outline-none focus:border-[#158FFF]"
                        />
                      </div>
                      <div className="max-h-44 overflow-y-auto py-1">
                        {filteredCategories.length === 0 && (
                          <p className="px-3.5 py-3 text-[12px] text-gray-400">No categories found</p>
                        )}
                        {filteredCategories.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => {
                              set("category", c);
                              setCategoryOpen(false);
                              setCategorySearch("");
                            }}
                            className={`w-full text-left px-3.5 py-2 text-[12px] hover:bg-gray-50 transition-colors ${
                              c === form.category ? "bg-blue-50 text-blue-600 font-medium" : "text-[#1F2937]"
                            }`}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className={labelCls}>Notes</label>
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Notes"
                className="w-full px-4 py-2.5 rounded-[19px] border border-[#1F2937]/10 text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all font-inter placeholder:text-[#1F2937] placeholder:opacity-50 resize-y"
              />
            </div>

            <div>
              <label className={labelCls}>Attachments</label>
              <label
                htmlFor="expense-attach"
                className={`flex flex-col items-center justify-center gap-1 rounded-[19px] border border-dashed border-[#1F2937]/20 px-4 py-6 text-center transition-colors ${
                  attachments.length >= MAX_FILES || uploading
                    ? "opacity-50 cursor-not-allowed"
                    : "cursor-pointer hover:border-[#158FFF] hover:bg-blue-50/30"
                }`}
              >
                {uploading ? (
                  <div className="w-5 h-5 border-2 border-[#158FFF] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Paperclip className="w-5 h-5 text-[#158FFF]" />
                )}
                <span className="text-[13px] font-medium text-[#1F2937]">
                  {uploading
                    ? "Uploading..."
                    : attachments.length >= MAX_FILES
                      ? `Maximum ${MAX_FILES} files attached`
                      : "Click to attach files"}
                </span>
                <span className="text-[11px] text-[#1F2937] opacity-50">
                  PDF, PNG, JPEG, Excel &middot; up to {MAX_FILE_MB} MB &middot; Max {MAX_FILES} files
                </span>
              </label>
              <input
                id="expense-attach"
                type="file"
                multiple
                accept={ACCEPTED}
                disabled={uploading || attachments.length >= MAX_FILES}
                className="hidden"
                onChange={(e) => {
                  handleFiles(e.target.files);
                  // Reset so re-picking the same file still fires onChange.
                  e.target.value = "";
                }}
              />

              {attachments.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {attachments.map((a, i) => (
                    <div
                      key={`${a.url}-${i}`}
                      className="flex items-center gap-2 rounded-full border border-[#1F2937]/10 px-3.5 py-2"
                    >
                      <Paperclip className="w-3.5 h-3.5 text-[#78788D] flex-shrink-0" />
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 min-w-0 text-[12px] text-[#158FFF] truncate hover:underline"
                      >
                        {a.name || "Attachment"}
                      </a>
                      <span className="text-[10.5px] text-[#78788D] flex-shrink-0">
                        {fileSize(a.size)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setAttachments((prev) => prev.filter((_, x) => x !== i))}
                        aria-label="Remove attachment"
                        className="w-6 h-6 flex items-center justify-center rounded-full text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                      >
                        <X className="w-3 h-3" strokeWidth={2.5} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Payments — collapsed until the entry is actually marked paid,
                so an unpaid record isn't asked for settlement details. */}
            <div className="pt-1">

              <div className="mt-1 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Payment Date</label>
                      <input
                        type="date"
                        value={form.paymentDate}
                        onChange={(e) => set("paymentDate", e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Payment Notes</label>
                      <input
                        type="text"
                        value={form.paymentNotes}
                        onChange={(e) => set("paymentNotes", e.target.value)}
                        placeholder="Payment notes"
                        className={inputCls}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>Payment Type</label>
                    <div className="flex flex-wrap gap-2">
                      {PAYMENT_TYPES.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => set("paymentType", t)}
                          className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-medium transition-colors ${
                            form.paymentType === t
                              ? "bg-blue-50 text-[#158FFF] border border-[#158FFF]"
                              : "border border-[#1F2937]/15 text-[#1F2937] hover:bg-gray-50"
                          }`}
                        >
                          {form.paymentType === t && <Check className="w-3 h-3" />}
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>Select Bank</label>
                    <select
                      value={form.bankAccount}
                      onChange={(e) => set("bankAccount", e.target.value)}
                      className={`${inputCls} bg-white`}
                    >
                      <option value="">
                        {banks.length ? "No specific account" : "No bank accounts added yet"}
                      </option>
                      {banks.map((b) => (
                        <option key={b._id} value={b._id}>
                          {b.bank}
                          {b.accountNumber ? ` (${b.accountNumber})` : ""}
                        </option>
                      ))}
                    </select>
                    {bankLabel && (
                      <p className="mt-1 text-[11px] text-[#1F2937] opacity-50">
                        Money moves through {bankLabel}.
                      </p>
                    )}
                  </div>
              </div>
            </div>
          </form>
        </div>

        <div className="flex-shrink-0 py-2.5 px-4 border-t border-gray-100 bg-white flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="px-6 py-2 border border-gray-200 text-gray-700 rounded-[25px] text-sm font-bold hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="expense-form"
            disabled={!canSubmit}
            className="px-6 py-2 bg-[#158FFF] text-white rounded-[25px] text-sm font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {record ? `Save ${noun}` : `Add ${noun}`}
          </button>
        </div>
      </div>
    </>
  );
}
