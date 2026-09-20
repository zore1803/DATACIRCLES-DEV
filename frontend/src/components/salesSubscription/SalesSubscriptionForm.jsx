import DeleteIcon from "../common/DeleteIcon";
import SearchIcon from "../common/SearchIcon";
import PlusIcon from "../common/PlusIcon";
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import API from "../../services/api";
import toast from "react-hot-toast";
import SearchableDropdown from "../contact/SearchableDropdown";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";
import NotesTermsDrawer from "../invoice/NotesTermsDrawer";

const UNITS = [
  { value: "day", label: "Day(s)" },
  { value: "week", label: "Week(s)" },
  { value: "month", label: "Month(s)" },
  { value: "year", label: "Year(s)" },
];
const STATUS_OPTIONS = ["Draft", "Active", "Expired", "Error", "Cancelled"];

const money = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Taxable value of one line BEFORE its own GST — a tax-inclusive rate
// already contains GST, so it's extracted first rather than taxed twice.
const calcItemTaxable = (it) => {
  const rate = parseFloat(it.rate) || 0;
  const qty = parseInt(it.quantity) || 0;
  const gstRate = parseFloat(it.gstRate) || 0;
  const unitTaxable = it.taxInclusive ? rate / (1 + gstRate / 100) : rate;
  const subtotal = unitTaxable * qty;
  const disc = parseFloat(it.discount) || 0;
  return it.discountType === "percentage" ? subtotal * (1 - disc / 100) : subtotal - disc;
};
// Line total INCLUDING that line's own GST — every line is taxed at its own
// rate (never a single overall rate applied to the whole document), same
// engine shared/documentTemplates.js's computeDocument() uses for the real
// invoice PDF, so this preview never disagrees with what gets billed.
const calcItemAmount = (it) => {
  const taxable = calcItemTaxable(it);
  const gstRate = parseFloat(it.gstRate) || 0;
  return taxable + taxable * (gstRate / 100);
};

const labelClass = "block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2";
const inputClass =
  "w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50";
const selectClass =
  "w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all";
const textareaClass =
  "w-full border border-[#1F2937]/10 rounded-2xl px-3 py-2 text-[12px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all resize-none";

const OpenNotesTermsButton = ({ label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    title="Edit notes and terms"
    className="inline-flex items-center gap-1 leading-none text-[12px] font-medium text-[#0085FF] hover:underline flex-shrink-0"
  >
    <PlusIcon className="w-3 h-3 flex-shrink-0" />
    <span>{label}</span>
  </button>
);

/*
 * Right-drawer create/edit form for a Sales Subscription (recurring billing
 * agreement with a customer — see backend/models/SalesSubscription.js).
 *
 * Unlike Sales Return (always against an existing document), a Subscription
 * is built fresh from the product/service catalog — pick a customer, add
 * line items with quantity/rate/GST, set the billing interval and start/end
 * dates. "Generate Invoice Now" (row action on the list page, not this form)
 * is what actually creates an Invoice from it.
 */
const SalesSubscriptionForm = ({ editingSubscription, onRequestClose, onSuccess, onError }) => {
  const isEditing = !!editingSubscription;
  const [isSliding, setIsSliding] = useState(false);

  useBodyScrollLock(isSliding);

  const [deals, setDeals] = useState([]);
  const [dealId, setDealId] = useState("");
  // Org's own registered state — compared against the selected customer's
  // billing state to auto-decide intra vs inter-state, same pattern
  // InvoiceForm.jsx uses (GET /branding). The transactionType field stays a
  // manual dropdown too, so this is just a sensible default, not a lock.
  const [sellerState, setSellerState] = useState("");

  const [catalog, setCatalog] = useState([]);
  const [itemSearch, setItemSearch] = useState("");
  const [showItemDropdown, setShowItemDropdown] = useState(false);
  const [lines, setLines] = useState([]);

  const [intervalValue, setIntervalValue] = useState(1);
  const [intervalUnit, setIntervalUnit] = useState("month");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState("");
  const [transactionType, setTransactionType] = useState("intra");
  const [discountType, setDiscountType] = useState("fixed");
  const [discountValue, setDiscountValue] = useState(0);
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [status, setStatus] = useState("Draft");
  const [saving, setSaving] = useState(false);
  // null when closed; otherwise which section ("notes" | "terms") to focus.
  const [notesDrawer, setNotesDrawer] = useState(null);

  const isCancelled = editingSubscription?.status === "Cancelled";
  const availableStatusOptions = STATUS_OPTIONS.filter((s) => s !== "Cancelled" || isEditing);

  useEffect(() => {
    setTimeout(() => setIsSliding(true), 10);
  }, []);

  useEffect(() => {
    API.get("/deals")
      .then((res) => setDeals(res.data.deals || res.data || []))
      .catch(() => setDeals([]));
    API.get("/items")
      .then((res) => {
        const list = res.data?.items || res.data || [];
        setCatalog(Array.isArray(list) ? list.filter((it) => it.type !== "service" || true) : []);
      })
      .catch(() => setCatalog([]));
    API.get("/branding")
      .then((res) => setSellerState((res.data?.state || "").trim().toLowerCase()))
      .catch(() => {});
  }, []);

  // Picking a customer auto-decides intra/inter-state by comparing the org's
  // own state to that deal's linked Company billing state — the dropdown
  // below still lets the user override it manually afterward.
  const handleDealChange = (id) => {
    setDealId(id);
    const selected = deals.find((d) => d._id === id);
    const customerState = (selected?.company?.billingAddress?.state || "").trim().toLowerCase();
    if (sellerState && customerState) {
      setTransactionType(sellerState !== customerState ? "inter" : "intra");
    }
  };

  useEffect(() => {
    if (!editingSubscription) return;
    setDealId(editingSubscription.deal?._id || editingSubscription.deal || "");
    setLines(
      (editingSubscription.items || []).map((it, idx) => ({
        _key: `${it.itemId?._id || it.itemId || "custom"}-${it.variantId || "none"}-${idx}`,
        itemId: it.itemId?._id || it.itemId || null,
        variantId: it.variantId || null,
        parentItemId: it.parentItemId || null,
        isVariant: !!it.isVariant,
        name: it.name,
        description: it.description || "",
        hsn: it.hsn || "",
        rate: it.rate,
        quantity: it.quantity,
        discountType: it.discountType || "amount",
        discount: it.discount || 0,
        gstRate: it.gstRate || 0,
        taxInclusive: !!it.taxInclusive,
      }))
    );
    setIntervalValue(editingSubscription.billingInterval?.value || 1);
    setIntervalUnit(editingSubscription.billingInterval?.unit || "month");
    setStartDate(editingSubscription.startDate ? new Date(editingSubscription.startDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]);
    setEndDate(editingSubscription.endDate ? new Date(editingSubscription.endDate).toISOString().split("T")[0] : "");
    setTransactionType(editingSubscription.transactionType || "intra");
    setDiscountType(editingSubscription.discount?.type || "fixed");
    setDiscountValue(editingSubscription.discount?.value || 0);
    setNotes(editingSubscription.notes || "");
    setTerms(editingSubscription.terms || "");
    setStatus(editingSubscription.status || "Draft");
  }, [editingSubscription]);

  const handleClose = () => {
    setIsSliding(false);
    setTimeout(() => onRequestClose(), 300);
  };

  const filteredCatalog = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return catalog.slice(0, 20);
    return catalog.filter((it) => it.name?.toLowerCase().includes(q)).slice(0, 20);
  }, [catalog, itemSearch]);

  const addLine = (item) => {
    setLines((prev) => [
      ...prev,
      {
        _key: `${item._id}-${Date.now()}`,
        itemId: item._id,
        variantId: null,
        parentItemId: null,
        isVariant: false,
        name: item.name,
        description: item.description || "",
        hsn: item.hsnSac || "",
        rate: item.sellingPrice || 0,
        quantity: 1,
        discountType: "amount",
        discount: 0,
        gstRate: item.gstRate || 0,
        taxInclusive: !!item.taxInclusive,
      },
    ]);
    setItemSearch("");
    setShowItemDropdown(false);
  };

  const updateLine = (key, patch) => {
    setLines((prev) => prev.map((l) => (l._key === key ? { ...l, ...patch } : l)));
  };
  const removeLine = (key) => setLines((prev) => prev.filter((l) => l._key !== key));

  // Same math as the backend's calculateAmountFromItems — a flat document
  // discount spreads proportionally across every line BEFORE each line's own
  // GST is applied, so this preview never disagrees with what gets saved.
  const grossTaxable = lines.reduce((sum, l) => sum + calcItemTaxable(l), 0);
  const documentDiscount = discountValue > 0
    ? (discountType === "percentage" ? grossTaxable * (discountValue / 100) : Math.min(discountValue, grossTaxable))
    : 0;
  const netFactor = grossTaxable > 0 ? (grossTaxable - documentDiscount) / grossTaxable : 1;
  const afterDiscount = grossTaxable - documentDiscount;
  const totalWithGst = lines.reduce((sum, l) => {
    const taxable = calcItemTaxable(l) * netFactor;
    const gst = parseFloat(l.gstRate) || 0;
    return sum + taxable + taxable * (gst / 100);
  }, 0);

  // Only Won deals are eligible customers. An Open deal is still being
  // negotiated and a Lost one never converted — neither should be put on a
  // recurring billing agreement. Deal statuses are org-configurable, so this
  // matches the value case-insensitively, the same rule the backend enforces
  // on create. When editing, the deal already on the subscription is kept in
  // the list even if its status has since moved off Won, so the dropdown can
  // still render its own current value instead of showing blank.
  const wonDeals = useMemo(() => {
    const eligible = deals.filter((d) => String(d.status || "").trim().toLowerCase() === "won");
    const currentId = editingSubscription?.deal?._id || editingSubscription?.deal;
    if (currentId && !eligible.some((d) => d._id === currentId)) {
      const current = deals.find((d) => d._id === currentId);
      if (current) return [current, ...eligible];
    }
    return eligible;
  }, [deals, editingSubscription]);

  const dealOptions = wonDeals.map((d) => ({
    _id: d._id,
    label: `${d.contact?.name || d.company?.name || d.title || "Untitled deal"}`,
  }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!dealId) return toast.error("Select a customer — only Won deals can be subscribed");
    if (lines.length === 0) return toast.error("Add at least one product or service");
    if (!startDate) return toast.error("Select a start date");
    if (endDate && new Date(endDate) < new Date(startDate)) return toast.error("End date can't be before the start date");

    setSaving(true);
    try {
      const payload = {
        deal: dealId,
        items: lines.map((l) => ({
          itemId: l.itemId || undefined,
          variantId: l.variantId || undefined,
          parentItemId: l.parentItemId || undefined,
          isVariant: l.isVariant,
          name: l.name,
          description: l.description,
          hsn: l.hsn,
          rate: parseFloat(l.rate) || 0,
          quantity: parseInt(l.quantity) || 1,
          discountType: l.discountType,
          discount: parseFloat(l.discount) || 0,
          gstRate: parseFloat(l.gstRate) || 0,
          taxInclusive: l.taxInclusive,
        })),
        discount: { type: discountType, value: parseFloat(discountValue) || 0 },
        transactionType,
        billingInterval: { value: parseInt(intervalValue, 10) || 1, unit: intervalUnit },
        startDate,
        endDate: endDate || null,
        notes,
        terms,
        status,
      };

      if (isEditing) {
        await API.put(`/sales-subscriptions/${editingSubscription._id}`, payload);
      } else {
        await API.post("/sales-subscriptions", payload);
      }
      onSuccess?.();
    } catch (err) {
      onError?.(err.response?.data?.error || err.response?.data?.message || "Failed to save subscription");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <>
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[10000] transition-opacity duration-300 ease-in-out"
        style={{ opacity: isSliding ? 1 : 0 }}
        onClick={handleClose}
      />

      <div
        className={`
          fixed dc-panel-card w-[calc(100%-3rem)] lg:w-[70vw] z-[10003]
          bg-white shadow-2xl flex flex-col overflow-hidden
          transform transition-transform duration-300 ease-in-out font-inter
          ${isSliding ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"}
        `}
      >
        <form onSubmit={handleSubmit} className="flex flex-col h-full min-h-0">
          {/* Sticky header — matches the CompanyForm header spec */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#D9D9D9] flex-shrink-0 bg-white gap-1">
            <div>
              <h2 className="text-[15px] font-normal leading-6 text-[#78788D] uppercase tracking-wide">
                {isEditing ? "Edit Subscription" : "New Subscription"}
              </h2>
              <p className="text-[13px] font-inter text-[#A0A0A0] mt-0.5">
                A recurring billing agreement — invoices are generated per cycle, not automatically edited here.
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              title="Close"
              className="w-5 h-5 flex-shrink-0 flex items-center justify-center text-[#1C1B1F] hover:opacity-70 transition-opacity"
              aria-label="Close"
            >
              <X className="w-[18px] h-[18px]" strokeWidth={2} />
            </button>
          </div>

          {/* Scrollable body */}
          {isCancelled ? (
            <div className="flex-1 min-h-0 overflow-y-auto p-6">
              <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-700">
                This subscription is Cancelled and can no longer be edited. Create a new one instead.
              </div>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6 space-y-6">
              <div>
                <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                  Customer / Won Deal <span className="text-[#FF4935]">*</span>
                </label>
                <SearchableDropdown
                  options={dealOptions}
                  value={dealId}
                  onChange={handleDealChange}
                  placeholder="Search customer or deal…"
                  displayKey="label"
                  compact
                />
                {dealOptions.length === 0 ? (
                  <p className="text-[13px] font-inter text-amber-600 mt-1.5">
                    No eligible customers found. A subscription can only be created for a Won deal.
                  </p>
                ) : (
                  <p className="text-[13px] font-inter text-[#A0A0A0] mt-1.5">Only deals marked Won are billable.</p>
                )}
              </div>

              <div>
                <div className="flex items-center gap-3 mb-3">
                  <span className="flex-1 h-px bg-[#D9D9D9]" />
                  <h3 className="flex-shrink-0 text-[14px] font-medium leading-[120%] text-[#1F2937]">
                    Products / Services
                  </h3>
                  <span className="flex-1 h-px bg-[#D9D9D9]" />
                </div>

                <div className="relative mb-3">
                  <SearchIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={itemSearch}
                    onChange={(e) => { setItemSearch(e.target.value); setShowItemDropdown(true); }}
                    onFocus={() => setShowItemDropdown(true)}
                    placeholder="Search products/services to add…"
                    className={`${inputClass} pl-9`}
                  />
                  {showItemDropdown && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowItemDropdown(false)} />
                      <div className="absolute left-0 right-0 mt-1 bg-white border border-[#1F2937]/10 rounded-2xl shadow-xl z-20 overflow-hidden">
                        <div className="p-2 border-b border-[#F2F2F7]">
                          <input
                            type="text"
                            value={itemSearch}
                            onChange={(e) => setItemSearch(e.target.value)}
                            placeholder="Search products/services…"
                            className="w-full h-8 px-3 text-[13px] border border-[#E0E0E1] rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-inter placeholder:text-[#A0A0A0]"
                            autoFocus
                          />
                        </div>
                        <div className="max-h-52 overflow-y-auto py-1">
                          {filteredCatalog.length > 0 ? (
                            filteredCatalog.map((item) => (
                              <button
                                key={item._id}
                                type="button"
                                onClick={() => addLine(item)}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between"
                              >
                                <span className="text-gray-800">{item.name}</span>
                                <span className="text-xs text-gray-400 flex-shrink-0 ml-3">{item.type} · {money(item.sellingPrice)}</span>
                              </button>
                            ))
                          ) : (
                            <div className="px-3 py-4 text-[13px] text-gray-400 text-center font-inter italic">
                              No products or services found
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className="border border-[#1F2937]/10 rounded-2xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-3 py-2 text-left">Item</th>
                        <th className="px-3 py-2 text-right w-20">Qty</th>
                        <th className="px-3 py-2 text-right w-28">Rate</th>
                        <th className="px-3 py-2 text-right w-20" title="Each item is taxed at its own GST rate — there's no single overall rate for the document.">GST %</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2 w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {lines.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                            Search above to add a product or service.
                          </td>
                        </tr>
                      ) : (
                        lines.map((l) => (
                          <tr key={l._key} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-medium text-gray-900">{l.name}</td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={1}
                                value={l.quantity}
                                onChange={(e) => updateLine(l._key, { quantity: e.target.value })}
                                className="w-16 px-2 py-1 text-right border border-[#1F2937]/10 rounded-lg"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={l.rate}
                                onChange={(e) => updateLine(l._key, { rate: e.target.value })}
                                className="w-24 px-2 py-1 text-right border border-[#1F2937]/10 rounded-lg"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={l.gstRate}
                                onChange={(e) => updateLine(l._key, { gstRate: e.target.value })}
                                className="w-16 px-2 py-1 text-right border border-[#1F2937]/10 rounded-lg"
                              />
                            </td>
                            <td className="px-3 py-2 text-right font-medium">{money(calcItemAmount(l))}</td>
                            <td className="px-3 py-2">
                              <button type="button" onClick={() => removeLine(l._key)} className="p-1 text-red-500 hover:bg-red-50 rounded">
                                <DeleteIcon className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className={labelClass}>Repeat every</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={1}
                      value={intervalValue}
                      onChange={(e) => setIntervalValue(e.target.value)}
                      className={`${inputClass} w-20 flex-shrink-0`}
                    />
                    <select
                      value={intervalUnit}
                      onChange={(e) => setIntervalUnit(e.target.value)}
                      className={`${selectClass} flex-1`}
                    >
                      {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className={selectClass}
                  >
                    {availableStatusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                    Start Date <span className="text-[#FF4935]">*</span>
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    min={new Date().toISOString().split("T")[0]}
                    onChange={(e) => setStartDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>End Date (optional)</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Transaction Type</label>
                  <select
                    value={transactionType}
                    onChange={(e) => setTransactionType(e.target.value)}
                    className={selectClass}
                  >
                    <option value="intra">Intra-state</option>
                    <option value="inter">Inter-state</option>
                  </select>
                  <p className="text-[13px] font-inter text-[#A0A0A0] mt-1.5">Auto-set from your business state vs. the customer's — change it here if that doesn't apply.</p>
                </div>
                <div>
                  <label className={labelClass}>Discount Type</label>
                  <select
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value)}
                    className={selectClass}
                  >
                    <option value="fixed">Fixed</option>
                    <option value="percentage">Percentage</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Discount Value</label>
                  <input
                    type="number"
                    min={0}
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <label className={labelClass.replace(" mb-2", "")}>Notes</label>
                    <OpenNotesTermsButton label="Add Notes" onClick={() => setNotesDrawer("notes")} />
                  </div>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className={textareaClass}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <label className={labelClass.replace(" mb-2", "")}>Terms</label>
                    <OpenNotesTermsButton label="Add Terms" onClick={() => setNotesDrawer("terms")} />
                  </div>
                  <textarea
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                    rows={3}
                    className={textareaClass}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <div className="w-64 space-y-1 text-sm text-gray-700">
                  <div className="flex justify-between"><span>Subtotal (taxable)</span><span className="font-medium">{money(grossTaxable)}</span></div>
                  <div className="flex justify-between"><span>After discount</span><span className="font-medium">{money(afterDiscount)}</span></div>
                  <div className="flex justify-between text-base font-semibold text-gray-900 pt-1 border-t">
                    <span>Per-cycle amount (incl. GST)</span><span>{money(totalWithGst)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Sticky footer — compact, matching the note editor card */}
          <div className="flex-shrink-0 py-2.5 px-4 border-t border-gray-100 bg-white flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="px-6 py-2 border border-gray-200 text-gray-700 rounded-[25px] text-sm font-bold hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            {!isCancelled && (
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2 bg-[#158FFF] text-white rounded-[25px] text-sm font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? "Saving…" : isEditing ? "Update" : "Create"}
              </button>
            )}
          </div>
        </form>
      </div>

      <NotesTermsDrawer
        isOpen={notesDrawer !== null}
        focus={notesDrawer || "notes"}
        onClose={() => setNotesDrawer(null)}
        type="tax"
        docName="Subscription"
        onApplyNotes={(v) => setNotes(v)}
        onApplyTerms={(v) => setTerms(v)}
      />
    </>,
    document.body
  );
};

export default SalesSubscriptionForm;
