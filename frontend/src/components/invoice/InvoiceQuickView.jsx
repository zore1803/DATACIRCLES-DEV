import { useEffect, useState } from "react";
import { X } from "lucide-react";
import API from "../../services/api";
import toast from "react-hot-toast";
import EyeIcon from "../common/EyeIcon";
import EditIcon from "../common/EditIcon";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

const STATUS_OPTIONS = ["Pending", "Sent", "Paid", "Overdue", "Cancelled"];

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" }) : "—";
const fmtAmount = (a) => (a != null ? `₹${Math.round(a).toLocaleString("en-IN")}` : "—");

const isPaidStatus = (s) => {
  const v = s?.toLowerCase();
  return v === "paid" || v === "accepted";
};

const Row = ({ label, children }) => (
  <div className="flex flex-col gap-1 py-3 border-b border-[#F1F1F5]">
    <span className="text-xs font-medium text-gray-500">{label}</span>
    <span className="text-sm text-gray-900">{children}</span>
  </div>
);

/**
 * Right slide-over panel to view / edit a single invoice without leaving the
 * dashboard. Renders from the invoice object already in the parent's state
 * (no fetch). Status is editable and persisted via PUT /invoices/status/:id;
 * `onUpdated` lets the parent patch its list.
 */
export default function InvoiceQuickView({ invoice, mode = "view", onClose, onUpdated }) {
  const [editing, setEditing] = useState(mode === "edit");
  const [status, setStatus] = useState(invoice?.status || "Pending");
  const [saving, setSaving] = useState(false);

  // Lock background scroll while the panel is open. This component is
  // mounted/unmounted by its parent (no internal open/close animation), so
  // it's open for its entire mounted lifetime.
  useBodyScrollLock(true);

  useEffect(() => {
    setEditing(mode === "edit");
    setStatus(invoice?.status || "Pending");
  }, [invoice, mode]);

  if (!invoice) return null;

  const handleSave = async () => {
    try {
      setSaving(true);
      const res = await API.put(`/invoices/status/${invoice._id}`, { status });
      const updated = res.data?.invoice || { ...invoice, status };
      toast.success("Invoice updated");
      onUpdated?.(updated);
      setEditing(false);
    } catch (err) {
      console.error("Failed to update invoice:", err);
      toast.error(err.response?.data?.error || err.response?.data?.message || "Failed to update invoice");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[9998]" onClick={onClose} />

      {/* dc-panel-card matches the rounded, inset card look used by the other
          QuickView panels. No open/close toggle here (this component is
          mounted/unmounted by its parent rather than translated off-screen),
          so translate-x-0 stays fixed — no translate-x-full/calc gotcha to
          worry about, unlike the other QuickViews. */}
      <div className="fixed dc-panel-card dc-panel-w bg-white shadow-2xl z-[9999] flex flex-col transform transition-transform duration-300 translate-x-0">
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-[#E1E4EA] flex-shrink-0">
          <div className="flex flex-col min-w-0">
            <span className="text-base font-semibold text-gray-900 truncate">
              {invoice.invoiceNumber || "Invoice"}
            </span>
            <span className="text-xs text-gray-500">{editing ? "Edit invoice" : "Invoice details"}</span>
          </div>
          <div className="flex items-center gap-1">
            {!editing ? (
              <button
                onClick={() => setEditing(true)}
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                title="Edit"
              >
                <EditIcon className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => {
                  setEditing(false);
                  setStatus(invoice.status || "Pending");
                }}
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                title="View"
              >
                <EyeIcon className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto dc-card-scroll px-5 py-2">
          <Row label="Client">{invoice.deal?.company?.name || "—"}</Row>
          <Row label="Contact">{invoice.deal?.contact?.name || "—"}</Row>
          <Row label="Deal">{invoice.deal?.title || "—"}</Row>
          <Row label="Invoice Date">{fmtDate(invoice.date)}</Row>
          <Row label="Due Date">{fmtDate(invoice.dueDate)}</Row>
          <Row label="Amount">
            <span className="font-semibold">{fmtAmount(invoice.amount)}</span>
          </Row>

          <div className="flex flex-col gap-1.5 py-3">
            <span className="text-xs font-medium text-gray-500">Status</span>
            {editing ? (
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
                {/* Keep the current value selectable even if it's outside the preset list */}
                {!STATUS_OPTIONS.includes(invoice.status) && invoice.status && (
                  <option value={invoice.status}>{invoice.status}</option>
                )}
              </select>
            ) : (
              <span
                className="inline-flex items-center justify-center self-start px-3 py-[5px] rounded-full text-xs font-medium"
                style={{
                  background: isPaidStatus(invoice.status) ? "rgba(0, 201, 80, 0.1)" : "rgba(254, 89, 25, 0.1)",
                  color: isPaidStatus(invoice.status) ? "#00C950" : "#FE5919",
                }}
              >
                {invoice.status || "—"}
              </span>
            )}
          </div>
        </div>

        {/* Footer (edit mode) */}
        {editing && (
          <div className="flex items-center justify-end gap-2 px-5 h-16 border-t border-[#E1E4EA] flex-shrink-0">
            <button
              onClick={() => {
                setEditing(false);
                setStatus(invoice.status || "Pending");
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-full hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || status === invoice.status}
              className="px-4 py-2 text-sm font-medium text-white bg-[#0085FF] rounded-full hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
