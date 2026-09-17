import React, { useState, useEffect, useMemo } from "react";
import { X } from "lucide-react";
import API from "../../services/api";
import toast from "react-hot-toast";
import PaymentAllocationPanel from "./PaymentAllocationPanel";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

const formatMoney = (n) =>
  `₹${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Spends a party's leftover credit against their open documents.
//
// This is the other half of the allocation flow: the Add Payment drawer
// splits money at the moment it arrives, and this splits what was left over
// afterwards. Both drive the same PaymentAllocationPanel, so the two paths
// look and behave identically — the only difference is where the money comes
// from (a new payment vs. an existing balance), which is why the ceiling here
// is the credit balance rather than a typed amount.
export default function ApplyCreditModal({ party, onClose, onSuccess }) {
  useBodyScrollLock(!!party);
  const [isSliding, setIsSliding] = useState(false);
  const [openDocs, setOpenDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [allocations, setAllocations] = useState({});
  const [saving, setSaving] = useState(false);

  // Credit received from one customer can settle ANY customer's invoices —
  // the money is the organization's once received. So the list is every open
  // document in the org, narrowed by a search over invoice number and party
  // name rather than by choosing a party up front.
  const [docSearch, setDocSearch] = useState("");

  const isCredit = party?.direction === "IN";
  const documentType = isCredit ? "Invoice" : "Purchase";
  const creditBalance = Number(party?.creditBalance) || 0;

  useEffect(() => {
    setIsSliding(false);
    const t = setTimeout(() => setIsSliding(true), 10);
    return () => clearTimeout(t);
  }, [party]);

  useEffect(() => {
    if (!party) return;
    setDocSearch("");
    setAllocations({});
  }, [party]);

  const handleClose = () => {
    setIsSliding(false);
    setTimeout(() => onClose(), 300);
  };

  useEffect(() => {
    if (!party?.direction) return;
    let cancelled = false;
    (async () => {
      setDocsLoading(true);
      try {
        const res = await API.get("/payments-timeline/open-documents/all", {
          params: { direction: party.direction },
        });
        if (!cancelled) setOpenDocs(res.data.documents || []);
      } catch (err) {
        if (!cancelled) {
          console.error("Fetch open documents failed", err);
          setOpenDocs([]);
        }
      } finally {
        if (!cancelled) setDocsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [party]);

  const visibleDocs = useMemo(() => {
    const q = docSearch.trim().toLowerCase();
    if (!q) return openDocs;
    return openDocs.filter(
      (d) =>
        (d.number || "").toLowerCase().includes(q) ||
        (d.partyName || "").toLowerCase().includes(q) ||
        Number(allocations[d._id] || 0) > 0
    );
  }, [openDocs, docSearch, allocations]);

  const lines = useMemo(
    () =>
      Object.entries(allocations)
        .map(([documentId, value]) => ({ documentId, documentType, amount: Number(value) || 0 }))
        .filter((a) => a.amount > 0),
    [allocations, documentType]
  );

  const totalApplied = useMemo(
    () => lines.reduce((sum, a) => sum + a.amount, 0),
    [lines]
  );

  // Anything that would make the request fail server-side disables the
  // button, so an invalid state can't be submitted just to be bounced back.
  const overApplied = totalApplied > creditBalance + 0.01;
  const exceedsADocument = openDocs.some(
    (d) => Number(allocations[d._id] || 0) > d.due + 0.01
  );
  const canSubmit = lines.length > 0 && !overApplied && !exceedsADocument;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (lines.length === 0) {
      toast.error("Enter how much to apply against at least one document");
      return;
    }
    if (totalApplied > creditBalance + 0.01) {
      toast.error(`You can apply at most ${formatMoney(creditBalance)} of credit`);
      return;
    }

    setSaving(true);
    try {
      const res = await API.post("/payments-timeline/credit/apply", {
        partyType: party.partyType,
        partyId: party.partyId,
        direction: party.direction,
        allocations: lines,
      });
      const left = Number(res.data?.remainingCredit) || 0;
      toast.success(
        left > 0.01
          ? `Applied ${formatMoney(res.data.totalApplied)} — ${formatMoney(left)} credit still available`
          : `Applied ${formatMoney(res.data.totalApplied)} — credit fully used`
      );
      onSuccess();
      handleClose();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || "Failed to apply credit");
    } finally {
      setSaving(false);
    }
  };

  if (!party) return null;

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
            Apply Credit
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

        <div className="space-y-6 overflow-y-auto flex-1 px-8 py-6">
          <form id="apply-credit-form" onSubmit={handleSubmit} className="space-y-6">
            <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3">
              <p className="text-[12px] text-amber-900 font-medium">{party.partyName}</p>
              <p className="text-[22px] font-semibold text-amber-700 leading-tight mt-0.5">
                {formatMoney(creditBalance)}
              </p>
              <p className="text-[11px] text-amber-800 mt-0.5">
                {isCredit ? "unapplied credit from this customer" : "advance held with this vendor"}
                {party.payments?.length > 1
                  ? ` · across ${party.payments.length} payments, applied oldest first`
                  : ""}
              </p>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Find {isCredit ? "invoices" : "bills"} to settle
              </label>
              {/* Searching documents directly, rather than picking a party
                  first: an invoice is identified by its number or by the
                  company on it, and the credit isn't restricted to the
                  customer it came from, so forcing a party step just hid the
                  invoice you were actually looking for. */}
              <input
                type="text"
                value={docSearch}
                onChange={(e) => setDocSearch(e.target.value)}
                placeholder={isCredit ? "Invoice number or company name..." : "Bill number or vendor name..."}
                className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50"
              />
              <p className="mt-1.5 text-[11px] text-[#1F2937] opacity-50">
                {docsLoading
                  ? "Loading open documents..."
                  : `${visibleDocs.length} of ${openDocs.length} open ${isCredit ? "invoices" : "bills"}${docSearch ? " match" : ""} — any party's can be settled from this credit.`}
              </p>
            </div>

            <PaymentAllocationPanel
              documentType={documentType}
              documents={visibleDocs}
              loading={docsLoading}
              allocations={allocations}
              onChange={setAllocations}
              // The credit balance is the ceiling here, in place of the
              // payment amount the Add Payment drawer passes.
              paymentAmount={creditBalance}
              partySelected
              creditBalance={0}
              amountLabel="Credit available"
              amountNoun="credit available"
              leftoverLabel="Left unapplied"
              leftoverHint={`Stays as ${party.partyName}'s credit balance.`}
              emptyHint={docSearch ? "Try a different search." : "Nothing outstanding to settle right now."}
            />
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
            form="apply-credit-form"
            disabled={saving || !canSubmit}
            className="px-6 py-2 bg-[#158FFF] text-white rounded-[25px] text-sm font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            Apply {totalApplied > 0 ? formatMoney(totalApplied) : "Credit"}
          </button>
        </div>
      </div>
    </>
  );
}
