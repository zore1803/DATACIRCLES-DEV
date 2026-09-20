import React, { useEffect, useMemo, useState } from "react";
import { X, ChevronDown } from "lucide-react";
import API from "../../services/api";
import toast from "react-hot-toast";
import SearchableDropdown from "../contact/SearchableDropdown";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

const MODES = ["Cash", "UPI", "Bank Transfer", "Cheque", "Card", "Credit Note", "Other"];
const STATUS_OPTIONS = ["Draft", "Pending", "Confirmed", "Refunded", "Cancelled"];
const REASON_OPTIONS = ["Damaged", "Defective", "Wrong Item", "Wrong Size/Variant", "Customer Changed Mind", "Other"];

const money = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const lineKey = (itemId, variantId) => `${itemId || ""}|${variantId || "none"}`;

/*
 * Right-drawer create/edit form for a Sales Return.
 *
 * Mirrors PurchaseReturnForm's UI edge-to-edge — drawer chrome, pill inputs,
 * stacked per-item cards, subtotal row, mode pills, uppercase title, styled
 * footer — so Sales Return / Purchase Return / Purchase / Purchase Order all
 * read as one family of forms.
 *
 * A Sales Return is ALWAYS against an existing Invoice. The backend derives
 * customer/deal from that Invoice and refuses any Sales Return without one.
 * Flow: pick Invoice -> customer + invoice items auto-load with Original /
 * Already Returned / Remaining -> enter Return Qty + Reason per line coming
 * back -> Draft or Confirm.
 *
 * "Confirmed" is the single status that moves stock (Sales Return brings
 * goods IN — see salesReturnController.syncSalesReturnStock) and is terminal
 * once reached; STATUS can only move onward to Refunded (financial only).
 * Item quantities remain editable after Confirmed: the backend applies the
 * delta between the old and new quantity, never the full new quantity again.
 */
const SalesReturnForm = ({ editingReturn, onRequestClose, onSuccess, onError }) => {
  const isEditing = !!editingReturn;
  const [isSliding, setIsSliding] = useState(false);

  useBodyScrollLock(isSliding);

  const [invoices, setInvoices] = useState([]);
  const [invoiceId, setInvoiceId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [availableItems, setAvailableItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // key (itemId|variantId) -> { returnQty, reason }
  const [lines, setLines] = useState({});
  // key -> this return's own ORIGINAL saved qty (set once from editingReturn,
  // never mutated by further typing) — the /available endpoint's
  // alreadyReturned/remaining exclude this return's own contribution, so the
  // Return Qty input's ceiling stays this line's true headroom while editing,
  // but the Returned/Returnable columns should still show the whole picture.
  const [originalQuantities, setOriginalQuantities] = useState({});

  const [returnDate, setReturnDate] = useState(new Date().toISOString().split("T")[0]);
  const [refundMode, setRefundMode] = useState("");
  const [refundReference, setRefundReference] = useState("");
  const [overallReason, setOverallReason] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("Draft");
  const [saving, setSaving] = useState(false);

  const oldStatus = editingReturn?.status;
  // Once Confirmed, STATUS can only move onward to Refunded. Item quantities
  // stay editable regardless (see the module comment above).
  const isLocked = oldStatus === "Confirmed" || oldStatus === "Refunded";
  const availableStatusOptions = oldStatus === "Confirmed"
    ? ["Confirmed", "Refunded"]
    : oldStatus === "Refunded"
      ? ["Refunded"]
      : STATUS_OPTIONS.filter((s) => s !== "Refunded" || isEditing);

  useEffect(() => {
    setTimeout(() => setIsSliding(true), 10);
  }, []);

  useEffect(() => {
    API.get("/invoices")
      .then((res) => {
        const list = res.data?.invoices || res.data || [];
        setInvoices(Array.isArray(list) ? list : []);
      })
      .catch(() => setInvoices([]));
  }, []);

  // Loads an Invoice's items + already-returned/remaining figures. When
  // editing, excludes this return's own prior contribution so its existing
  // quantities don't count against themselves.
  const loadAvailableItems = async (id, excludeReturnId) => {
    if (!id) {
      setAvailableItems([]);
      setCustomerName("");
      setInvoiceNumber("");
      return;
    }
    setLoadingItems(true);
    try {
      const params = excludeReturnId ? `?excludeReturnId=${excludeReturnId}` : "";
      const res = await API.get(`/sales-returns/invoice/${id}/available${params}`);
      const deal = res.data.invoice?.deal;
      setCustomerName(
        deal?.contact?.name || deal?.company?.name || deal?.contactPerson || deal?.title || "Customer"
      );
      setInvoiceNumber(res.data.invoice.invoiceNumber);
      setAvailableItems(res.data.items || []);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load Invoice items");
      setAvailableItems([]);
    } finally {
      setLoadingItems(false);
    }
  };

  useEffect(() => {
    if (!editingReturn) return;
    const iId = editingReturn.invoice?._id || editingReturn.invoice || "";
    setInvoiceId(iId);
    setReturnDate(
      editingReturn.returnDate
        ? new Date(editingReturn.returnDate).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0]
    );
    setRefundMode(editingReturn.refundMode || "");
    setRefundReference(editingReturn.refundReference || "");
    setOverallReason(editingReturn.reason || "");
    setNotes(editingReturn.notes || "");
    setStatus(editingReturn.status || "Draft");

    const seeded = {};
    const original = {};
    (editingReturn.items || []).forEach((it) => {
      const itemId = it.itemId?._id || it.itemId;
      const key = lineKey(itemId, it.variantId);
      seeded[key] = { returnQty: it.quantity, reason: it.reason || "" };
      original[key] = it.quantity;
    });
    setLines(seeded);
    setOriginalQuantities(original);

    if (iId) loadAvailableItems(iId, editingReturn._id);
  }, [editingReturn]);

  const handleClose = () => {
    setIsSliding(false);
    setTimeout(() => onRequestClose(), 300);
  };

  const handleInvoiceChange = (id) => {
    setInvoiceId(id);
    setLines({});
    loadAvailableItems(id, null);
  };

  const setLine = (key, patch) => {
    setLines((prev) => ({ ...prev, [key]: { ...(prev[key] || { returnQty: "", reason: "" }), ...patch } }));
  };

  const selectedLines = useMemo(() => {
    return availableItems
      .map((item) => {
        const key = lineKey(item.itemId, item.variantId);
        const line = lines[key];
        const qty = parseFloat(line?.returnQty) || 0;
        return { item, key, qty, reason: line?.reason || "" };
      })
      .filter((l) => l.qty > 0);
  }, [availableItems, lines]);

  const subtotal = selectedLines.reduce((sum, l) => sum + l.qty * (l.item.unitPrice || 0), 0);

  const invoiceOptions = invoices.map((inv) => ({
    _id: inv._id,
    label: `${inv.invoiceNumber} · ${
      inv.deal?.contact?.name || inv.deal?.company?.name || inv.deal?.title || "Customer"
    } · ${money(inv.amount)}`,
  }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!invoiceId) {
      toast.error("Select an Invoice to return against");
      return;
    }
    if (selectedLines.length === 0) {
      toast.error("Enter a Return Qty for at least one item");
      return;
    }
    // Ceiling is remaining + this return's own original qty on that line —
    // matches how displayReturnable is computed in the card below and what
    // the backend validates against.
    const overLimit = selectedLines.find(
      (l) => l.qty > (l.item.remaining + (originalQuantities[l.key] || 0))
    );
    if (overLimit) {
      const cap = overLimit.item.remaining + (originalQuantities[overLimit.key] || 0);
      toast.error(`Maximum returnable quantity for "${overLimit.item.name}" is ${cap}`);
      return;
    }
    const missingReason = selectedLines.find((l) => !l.reason);
    if (missingReason) {
      toast.error(`Select a Return Reason for "${missingReason.item.name}"`);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        invoice: invoiceId,
        returnDate,
        items: selectedLines.map((l) => ({
          itemId: l.item.itemId || undefined,
          variantId: l.item.variantId || undefined,
          parentItemId: l.item.parentItemId || undefined,
          isVariant: !!l.item.variantId,
          name: l.item.variantName ? `${l.item.name} (${l.item.variantName})` : l.item.name,
          description: l.item.description || "",
          hsn: l.item.hsn || "",
          sku: l.item.sku,
          quantity: l.qty,
          unitPrice: l.item.unitPrice,
          gstRate: l.item.gstRate,
          taxInclusive: l.item.taxInclusive,
          reason: l.reason,
        })),
        refundMode,
        refundReference,
        reason: overallReason,
        notes,
        status,
      };

      if (isEditing) {
        await API.put(`/sales-returns/${editingReturn._id}`, payload);
      } else {
        await API.post("/sales-returns", payload);
      }
      onSuccess?.();
    } catch (err) {
      onError?.(err.response?.data?.error || err.response?.data?.message || "Failed to save sales return");
    } finally {
      setSaving(false);
    }
  };

  const fieldClass =
    "w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all";
  const labelClass = "block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2";

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[10000] transition-opacity duration-300 ease-in-out"
        style={{ opacity: isSliding ? 1 : 0 }}
        onClick={handleClose}
      />
      <div
        className={`fixed dc-panel-card dc-panel-w z-[10001] bg-white shadow-2xl flex flex-col overflow-hidden transform transition-transform duration-300 ease-out ${isSliding ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#D9D9D9] flex-shrink-0 bg-white gap-1">
          <h2 className="text-[15px] font-normal leading-6 text-[#78788D] uppercase tracking-wide">
            {isEditing ? `Edit Return ${editingReturn.returnNumber}` : "New Sales Return"}
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

        <form id="sr-form" onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto px-6 py-6 space-y-6">
          <div>
            <label className={labelClass}>Against Invoice <span className="text-[#FF4935]">*</span></label>
            <SearchableDropdown
              options={invoiceOptions}
              value={invoiceId}
              onChange={handleInvoiceChange}
              displayKey="label"
              valueKey="_id"
              placeholder="Select an Invoice"
              required
              compact
              className={isEditing ? "pointer-events-none opacity-60" : ""}
            />
            {isEditing && (
              <p className="text-[11px] text-gray-400 mt-1.5">The Invoice a return is against can't be changed after it's created.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Customer</label>
              <div className={`${fieldClass} flex items-center bg-gray-50 text-gray-500`}>
                {customerName || "—"}
              </div>
            </div>
            <div>
              <label className={labelClass}>Return Date</label>
              <input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className={fieldClass} />
            </div>
          </div>

          <div>
            <label className="text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2 block">
              Items {invoiceNumber && <span className="text-gray-400 font-normal">— {invoiceNumber}</span>}
            </label>

            {!invoiceId ? (
              <p className="text-[12px] text-gray-400 py-4 text-center border border-dashed border-gray-200 rounded-xl">
                Select an Invoice above to see its items.
              </p>
            ) : loadingItems ? (
              <p className="text-[12px] text-gray-400 py-4 text-center">Loading items…</p>
            ) : availableItems.length === 0 ? (
              <p className="text-[12px] text-gray-400 py-4 text-center">This Invoice has no items.</p>
            ) : (
              // Stacked cards, not a wide multi-column table — this drawer is
              // only ~440px wide (.dc-panel-w's min-width), nowhere near
              // enough for Item/Sold/Returned/Returnable/Return Qty/Reason/
              // Amount side by side. Each item gets its own card: name+amount
              // on top, a compact Sold/Returned/Returnable stat row, then
              // Return Qty + Reason inputs full-width below.
              <div className="space-y-2">
                {availableItems.map((item) => {
                  const key = lineKey(item.itemId, item.variantId);
                  const line = lines[key] || { returnQty: "", reason: "" };
                  const qty = parseFloat(line.returnQty) || 0;
                  // item.alreadyReturned/remaining come from the API excluding
                  // THIS return's own contribution (that's the true editing
                  // ceiling, matching what the backend validates against).
                  // For display, add this return's own originally-saved qty
                  // back in so "Returned"/"Returnable" reflect the whole
                  // picture — e.g. reopening a Confirmed return with qty 4
                  // shows Returned 4 / Returnable 8, not 0 / 12.
                  const ownQty = originalQuantities[key] || 0;
                  const displayReturned = item.alreadyReturned + ownQty;
                  const displayReturnable = (item.originalQuantity ?? item.purchasedQuantity ?? 0) - displayReturned;
                  const ceiling = item.remaining + ownQty;
                  const overLimit = qty > ceiling;
                  const fullyReturned = ceiling <= 0;
                  return (
                    <div key={key} className="border border-gray-100 rounded-xl px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <div className="text-[12px] font-medium text-gray-800 truncate">{item.name}</div>
                          {item.variantName && <div className="text-[10px] text-gray-400 truncate">{item.variantName}</div>}
                        </div>
                        <span className="text-[12px] font-semibold text-gray-700 flex-shrink-0">
                          {money(qty * (item.unitPrice || 0))}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-[10px] text-gray-400 mb-2">
                        <span>Sold <b className="text-gray-600 font-medium">{item.originalQuantity ?? item.purchasedQuantity ?? 0}</b></span>
                        <span>Returned <b className="text-gray-600 font-medium">{displayReturned}</b></span>
                        <span>Returnable <b className="text-gray-700 font-semibold">{displayReturnable}</b></span>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={line.returnQty}
                          disabled={fullyReturned}
                          onChange={(e) => setLine(key, { returnQty: e.target.value })}
                          placeholder="Return Qty"
                          title={fullyReturned ? "Fully returned already" : `Up to ${ceiling}`}
                          className={`${fieldClass.replace('w-full', 'w-24')} flex-shrink-0 disabled:bg-gray-50 disabled:cursor-not-allowed ${overLimit ? "border-red-400 ring-1 ring-red-400" : ""}`}
                        />
                        <div className="relative flex-1 min-w-0">
                          <select
                            value={line.reason}
                            disabled={fullyReturned || qty <= 0}
                            onChange={(e) => setLine(key, { reason: e.target.value })}
                            className={`${fieldClass} appearance-none bg-white cursor-pointer pr-6 disabled:bg-gray-50 disabled:cursor-not-allowed`}
                          >
                            <option value="">Reason…</option>
                            {REASON_OPTIONS.map((r) => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                        </div>
                      </div>
                      {overLimit && (
                        <p className="text-[10px] text-red-500 mt-1.5">
                          Maximum returnable quantity is {ceiling}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end mt-2 text-sm">
              <span className="text-gray-500 mr-2">Subtotal</span>
              <span className="font-bold text-gray-900">{money(subtotal)}</span>
            </div>
          </div>

          <div>
            <label className={labelClass}>Refund Mode</label>
            <div className="flex flex-wrap gap-2">
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setRefundMode((prev) => (prev === m ? "" : m))}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    refundMode === m ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Refund Reference</label>
              <input
                type="text"
                value={refundReference}
                onChange={(e) => setRefundReference(e.target.value)}
                placeholder="UTR / cheque #"
                className={fieldClass}
              />
            </div>
            <div>
              <label className={labelClass}>Overall Reason</label>
              <div className="relative">
                <select
                  value={overallReason}
                  onChange={(e) => setOverallReason(e.target.value)}
                  className={`${fieldClass} appearance-none bg-white cursor-pointer pr-8`}
                >
                  <option value="">—</option>
                  {REASON_OPTIONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              </div>
            </div>
          </div>

          <div>
            <label className={labelClass}>Status</label>
            <div className="relative w-1/2">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={`${fieldClass} appearance-none bg-white cursor-pointer pr-8`}
              >
                {availableStatusOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            </div>
            {isLocked && (
              <p className="text-[11px] text-gray-400 mt-1.5">
                Goods have already come back in stock — status can only move on to Refunded. Return Qty can still be
                corrected; only the difference in stock will move.
              </p>
            )}
          </div>

          <div>
            <label className={labelClass}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Internal notes about this return..."
              className="w-full px-3 py-2 border border-[#1F2937]/10 rounded-2xl text-[12px] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all resize-none"
            />
          </div>
        </form>

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
            form="sr-form"
            disabled={saving}
            className="px-6 py-2 bg-[#158FFF] text-white rounded-[25px] text-sm font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Saving..." : isEditing ? "Save Changes" : "Create Return"}
          </button>
        </div>
      </div>
    </>
  );
};

export default SalesReturnForm;
