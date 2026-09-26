import React, { useEffect, useMemo, useState } from "react";
import { X, ChevronDown, Info } from "lucide-react";
import API from "../../services/api";
import toast from "react-hot-toast";
import SearchableDropdown from "../contact/SearchableDropdown";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

const MODES = ["Cash", "UPI", "Bank Transfer", "Cheque", "Card", "Other"];
// Partial/Paid are deliberately absent: they're refund-driven (§11), set only
// by recording a refund against the return, never chosen here. The backend
// rejects a manual Partial/Paid, so offering them would only ever error.
const STATUS_OPTIONS = ["Draft", "Pending", "Confirmed", "Cancelled"];
const REASON_OPTIONS = ["Defective", "Damaged", "Wrong Item", "Excess Quantity", "Other"];

const money = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const lineKey = (itemId, variantId) => `${itemId || ""}|${variantId || "none"}`;

// Per-line tax helper — mirrors purchaseReturnController.js's calcTotalsFromItems
// so the preview the user sees in the form matches what the backend saves.
//   gross    = qty × unitPrice
//   taxable  = taxInclusive && gstRate > 0  ?  gross / (1 + rate/100)  :  gross
//   itemTax  = taxable × rate/100
function calcLineTax(qty, unitPrice, gstRate, taxInclusive) {
  const gross   = qty * unitPrice;
  const rate    = parseFloat(gstRate) || 0;
  const taxable = taxInclusive && rate > 0 ? gross / (1 + rate / 100) : gross;
  const itemTax = taxable * (rate / 100);
  return { gross, taxable, itemTax };
}

/*
 * Right-drawer create/edit form for a Purchase Return.
 *
 * A return is always AGAINST an existing Purchase — there is no "standalone"
 * path any more (see purchaseReturnController.createPurchaseReturn, which
 * now requires `purchase` and derives `vendor` from it server-side). The
 * flow is: pick a Purchase -> vendor auto-fills -> its line items load with
 * Purchased / Already Returned / Remaining -> enter a Return Qty + Reason
 * per item/variant that's actually coming back -> Draft or Confirm.
 *
 * "Confirmed" is the one status that moves stock (see
 * syncPurchaseReturnStock) and is terminal once reached — the backend
 * rejects moving the STATUS off it except to "Cancelled"; Partial/Paid are
 * reached only by recording refunds against the return. Item quantities
 * stay editable even after Confirmed/Paid though: the backend applies just
 * the delta between the old and new quantity (not the full new quantity
 * again), so correcting a confirmed return's Return Qty moves only the
 * difference in stock.
 */
const PurchaseReturnForm = ({ editingReturn, onRequestClose, onSuccess, onError }) => {
  const isEditing = !!editingReturn;
  const [isSliding, setIsSliding] = useState(false);
  useBodyScrollLock(isSliding);

  const [purchases, setPurchases] = useState([]);
  const [purchaseId, setPurchaseId] = useState("");
  const [vendorInfo, setVendorInfo] = useState(null); // { _id, name, email, phone }
  const [purchaseNumber, setPurchaseNumber] = useState("");
  const [transactionType, setTransactionType] = useState("intra"); // auto-derived from Purchase
  const [availableItems, setAvailableItems] = useState([]); // from /purchase-returns/purchase/:id/available
  const [loadingItems, setLoadingItems] = useState(false);

  // key (itemId|variantId) -> { returnQty, reason }
  const [lines, setLines] = useState({});
  // key -> this return's own ORIGINAL saved qty (set once from editingReturn,
  // never mutated by further typing) — needed because the /available
  // endpoint's alreadyReturned/remaining exclude this return's own
  // contribution (so the Return Qty input's ceiling stays this line's true
  // headroom while editing), but the Returned/Returnable columns should
  // still show the whole picture including this return itself. See the
  // render below for how the two get recombined.
  const [originalQuantities, setOriginalQuantities] = useState({});

  const [returnDate, setReturnDate] = useState(new Date().toISOString().split("T")[0]);
  const [mode, setMode] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("Draft");
  const [saving, setSaving] = useState(false);

  const oldStatus = editingReturn?.status;
  // Mirrors purchaseReturnController's isBlockedStatusChange — once the goods
  // have left (Confirmed onward) the only manual move is Cancelled; Partial/
  // Paid are refund-driven and never set here. Item quantities stay editable
  // regardless (see the module comment above).
  const isLocked = ["Confirmed", "Partial", "Paid"].includes(oldStatus);
  const availableStatusOptions = oldStatus === "Confirmed"
    ? ["Confirmed", "Cancelled"]
    : oldStatus === "Partial"
      ? ["Partial", "Cancelled"]
      : oldStatus === "Paid"
        ? ["Paid"]
        : STATUS_OPTIONS;

  useEffect(() => {
    setTimeout(() => setIsSliding(true), 10);
  }, []);

  useEffect(() => {
    API.get("/purchases")
      .then((res) => setPurchases(Array.isArray(res.data) ? res.data : []))
      .catch(() => setPurchases([]));
  }, []);

  // Loads a Purchase's items + already-returned/remaining figures. When
  // editing, excludes this return's own prior contribution so its existing
  // quantities don't count against themselves.
  const loadAvailableItems = async (id, excludeReturnId) => {
    if (!id) {
      setAvailableItems([]);
      setVendorInfo(null);
      setPurchaseNumber("");
      setTransactionType("intra");
      return;
    }
    setLoadingItems(true);
    try {
      const params = excludeReturnId ? `?excludeReturnId=${excludeReturnId}` : "";
      const res = await API.get(`/purchase-returns/purchase/${id}/available${params}`);
      setVendorInfo(res.data.purchase.vendor);
      setPurchaseNumber(res.data.purchase.purchaseNumber);
      // transactionType is auto-derived from the Purchase — not editable
      setTransactionType(res.data.purchase.transactionType || "intra");
      setAvailableItems(res.data.items || []);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load Purchase items");
      setAvailableItems([]);
    } finally {
      setLoadingItems(false);
    }
  };

  useEffect(() => {
    if (!editingReturn) return;
    const pId = editingReturn.purchase?._id || editingReturn.purchase || "";
    setPurchaseId(pId);
    setReturnDate(
      editingReturn.returnDate
        ? new Date(editingReturn.returnDate).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0]
    );
    setMode(editingReturn.mode || "");
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

    if (pId) loadAvailableItems(pId, editingReturn._id);
  }, [editingReturn]);

  const handleClose = () => {
    setIsSliding(false);
    setTimeout(() => onRequestClose(), 300);
  };

  const handlePurchaseChange = (id) => {
    setPurchaseId(id);
    setLines({});
    loadAvailableItems(id, null);
  };

  const setLine = (key, patch) => {
    setLines((prev) => ({ ...prev, [key]: { ...(prev[key] || { returnQty: "", reason: "" }), ...patch } }));
  };

  // Selected lines enriched with per-line tax amounts
  const selectedLines = useMemo(() => {
    return availableItems
      .map((item) => {
        const key  = lineKey(item.itemId, item.variantId);
        const line = lines[key];
        const qty  = parseFloat(line?.returnQty) || 0;
        const { gross, taxable, itemTax } = calcLineTax(
          qty, item.unitPrice, item.gstRate, item.taxInclusive
        );
        return { item, key, qty, reason: line?.reason || "", gross, taxable, itemTax };
      })
      .filter((l) => l.qty > 0);
  }, [availableItems, lines]);

  // Document-level totals
  const totalTaxable = selectedLines.reduce((s, l) => s + l.taxable, 0);
  const totalTax     = selectedLines.reduce((s, l) => s + l.itemTax, 0);
  const grandTotal   = totalTaxable + totalTax;
  const isIntra      = transactionType !== "inter";
  const cgstAmount   = isIntra  ? totalTax / 2 : 0;
  const sgstAmount   = isIntra  ? totalTax / 2 : 0;
  const igstAmount   = !isIntra ? totalTax     : 0;

  const purchaseOptions = purchases.map((p) => ({
    _id: p._id,
    label: `${p.purchaseNumber} · ${p.vendor?.name || "Unknown vendor"} · ${money(p.grandTotal)}`,
  }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!purchaseId) {
      toast.error("Select a Purchase to return against");
      return;
    }
    if (selectedLines.length === 0) {
      toast.error("Enter a Return Qty for at least one item");
      return;
    }
    const overLimit = selectedLines.find((l) => l.qty > l.item.remaining);
    if (overLimit) {
      toast.error(`Maximum returnable quantity for "${overLimit.item.name}" is ${overLimit.item.remaining}`);
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
        purchase: purchaseId,
        returnDate,
        items: selectedLines.map((l) => ({
          itemId:       l.item.itemId    || undefined,
          variantId:    l.item.variantId || undefined,
          name:         l.item.variantName ? `${l.item.name} (${l.item.variantName})` : l.item.name,
          sku:          l.item.sku,
          quantity:     l.qty,
          unitPrice:    l.item.unitPrice,
          // Preserve original purchase line's GST settings so the backend
          // recalculates tax at the same rate/mode as the original purchase.
          gstRate:      l.item.gstRate      || 0,
          taxInclusive: !!l.item.taxInclusive,
          reason:       l.reason,
        })),
        mode,
        notes,
        status,
      };

      if (isEditing) {
        await API.put(`/purchase-returns/${editingReturn._id}`, payload);
      } else {
        await API.post("/purchase-returns", payload);
      }
      onSuccess?.();
    } catch (err) {
      onError?.(err.response?.data?.error || err.response?.data?.message || "Failed to save purchase return");
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
        className={`fixed dc-panel-card dc-panel-w z-[10001] bg-white shadow-2xl flex flex-col transform transition-transform duration-300 ease-out ${isSliding ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#D9D9D9] flex-shrink-0 bg-white gap-1">
          <h2 className="text-[15px] font-normal leading-6 text-[#78788D] uppercase tracking-wide">
            {isEditing ? `Edit Return ${editingReturn.returnNumber}` : "New Purchase Return"}
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

        <form id="pr-form" onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto px-6 py-6 space-y-6">
          <div>
            <label className={labelClass}>Against Purchase *</label>
            <SearchableDropdown
              options={purchaseOptions}
              value={purchaseId}
              onChange={handlePurchaseChange}
              displayKey="label"
              valueKey="_id"
              placeholder="Select a Purchase"
              required
              compact
              className={isEditing ? "pointer-events-none opacity-60" : ""}
            />
            {isEditing && (
              <p className="text-[11px] text-gray-400 mt-1.5">The Purchase a return is against can't be changed after it's created.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Vendor</label>
              <div className={`${fieldClass} flex items-center bg-gray-50 text-gray-500`}>
                {vendorInfo?.name || "—"}
              </div>
            </div>
            <div>
              <label className={labelClass}>Return Date</label>
              <input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className={fieldClass} />
            </div>
          </div>

          {/* GST Type info banner — auto-derived from Purchase, not editable */}
          {purchaseId && (
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl">
              <Info className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
              <span className="text-[11px] text-blue-700 font-medium">
                GST Type: <b>{isIntra ? "Intra-state (CGST + SGST)" : "Inter-state (IGST)"}</b>
                {" "}— inherited from the original Purchase. Item GST rates are also preserved.
              </span>
            </div>
          )}

          <div>
            <label className="text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2 block">
              Items {purchaseNumber && <span className="text-gray-400 font-normal">— {purchaseNumber}</span>}
            </label>

            {!purchaseId ? (
              <p className="text-[12px] text-gray-400 py-4 text-center border border-dashed border-gray-200 rounded-xl">
                Select a Purchase above to see its items.
              </p>
            ) : loadingItems ? (
              <p className="text-[12px] text-gray-400 py-4 text-center">Loading items…</p>
            ) : availableItems.length === 0 ? (
              <p className="text-[12px] text-gray-400 py-4 text-center">This Purchase has no items.</p>
            ) : (
              // Stacked cards, not a wide multi-column table — this drawer is
              // only ~440px wide (.dc-panel-w's min-width), nowhere near
              // enough for Item/Purch./Returned/Returnable/Return Qty/Reason/
              // Amount side by side. Each item gets its own card: name+amount
              // on top, a compact Purchased/Returned/Returnable stat row,
              // then Return Qty + Reason inputs full-width below.
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
                  const displayReturnable = item.purchasedQuantity - displayReturned;
                  const overLimit = qty > item.remaining;
                  const fullyReturned = item.remaining <= 0;
                  return (
                    <div key={key} className="border border-gray-100 rounded-xl px-3 py-2.5">
                      {/* Item name + GST badges */}
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="min-w-0">
                          <div className="text-[12px] font-medium text-gray-800 truncate">{item.name}</div>
                          {item.variantName && <div className="text-[10px] text-gray-400 truncate">{item.variantName}</div>}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {(item.gstRate || 0) > 0 && (
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600 border border-purple-100">
                              GST {item.gstRate}%
                            </span>
                          )}
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${
                            item.taxInclusive
                              ? "bg-amber-50 text-amber-600 border-amber-100"
                              : "bg-gray-50 text-gray-500 border-gray-100"
                          }`}>
                            {item.taxInclusive ? "Tax Incl." : "Tax Excl."}
                          </span>
                          <span className="text-[12px] font-semibold text-gray-700">
                            {money(qty * (item.unitPrice || 0))}
                          </span>
                        </div>
                      </div>

                      {/* Purchased / Returned / Returnable stat row */}
                      <div className="flex items-center gap-3 text-[10px] text-gray-400 mb-2">
                        <span>Purchased <b className="text-gray-600 font-medium">{item.purchasedQuantity}</b></span>
                        <span>Returned <b className="text-gray-600 font-medium">{displayReturned}</b></span>
                        <span>Returnable <b className="text-gray-700 font-semibold">{displayReturnable}</b></span>
                        <span className="ml-auto font-medium text-gray-600">@ {money(item.unitPrice)}</span>
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
                          title={fullyReturned ? "Fully returned already" : `Up to ${item.remaining}`}
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
                          Maximum returnable quantity is {item.remaining}
                        </p>
                      )}

                      {/* Per-line tax preview (only when qty > 0 and GST > 0) */}
                      {(() => {
                        const hasGst = (item.gstRate || 0) > 0;
                        const { taxable, itemTax } = calcLineTax(qty, item.unitPrice, item.gstRate, item.taxInclusive);
                        if (qty > 0 && hasGst) {
                          return (
                            <div className="mt-2 flex items-center gap-3 text-[10px] text-gray-400 border-t border-dashed border-gray-100 pt-1.5">
                              <span>Taxable <b className="text-gray-600">{money(taxable)}</b></span>
                              <span>Tax ({item.gstRate}%) <b className="text-gray-600">{money(itemTax)}</b></span>
                              <span className="ml-auto font-semibold text-gray-700">Total {money(taxable + itemTax)}</span>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  );
                })}
              </div>
            )}


            {/* GST Summary */}
            {selectedLines.length > 0 && (
              <div className="mt-2 border border-gray-100 rounded-xl p-3 bg-gray-50/60 space-y-1.5 text-[12px]">
                <div className="flex justify-between text-gray-500">
                  <span>Taxable Amount</span>
                  <span className="font-medium text-gray-700">{money(totalTaxable)}</span>
                </div>
                {totalTax > 0 && isIntra && (
                  <>
                    <div className="flex justify-between text-gray-500">
                      <span>CGST</span>
                      <span className="font-medium text-gray-700">{money(cgstAmount)}</span>
                    </div>
                    <div className="flex justify-between text-gray-500">
                      <span>SGST</span>
                      <span className="font-medium text-gray-700">{money(sgstAmount)}</span>
                    </div>
                  </>
                )}
                {totalTax > 0 && !isIntra && (
                  <div className="flex justify-between text-gray-500">
                    <span>IGST</span>
                    <span className="font-medium text-gray-700">{money(igstAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-1.5">
                  <span>Grand Total</span>
                  <span>{money(grandTotal)}</span>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className={labelClass}>Refund Mode</label>
            <div className="flex flex-wrap gap-2">
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode((prev) => (prev === m ? "" : m))}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    mode === m ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"
                  }`}
                >
                  {m}
                </button>
              ))}
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
                Goods have already left toward the vendor — the status now follows the refunds you record (Partial once
                part is refunded, Paid when it's fully refunded). Return Qty can still be corrected; only the difference
                in stock will move.
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
            form="pr-form"
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

export default PurchaseReturnForm;
