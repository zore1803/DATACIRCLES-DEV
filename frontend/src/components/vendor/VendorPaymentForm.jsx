import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import API from "../../services/api";
import SearchableDropdown from "../contact/SearchableDropdown";
import QuickVendorForm from "./QuickVendorForm";
import toast from "react-hot-toast";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

// Module-level so the fallback keeps the SAME reference across renders. As an
// inline `vendors = []` default it was re-created on every render, and the
// `[vendors]` effect below (which compares by reference) then fired on every
// render — setLocalVendors → re-render → new [] → fire again, i.e. "Maximum
// update depth exceeded". Only callers that omit the prop hit this, which is
// why it surfaced from PaymentsTable and not from Vendors/PaymentPage.
const EMPTY_VENDORS = [];

const VendorPaymentForm = ({
  open,
  vendorId,
  direction,
  onSave,
  onClose,
  paymentToEdit = null,
  onUpdateSuccess,
  onDeleteSuccess,
  vendors = EMPTY_VENDORS,
}) => {
  const initialState = {
    vendorId: "",
    amount: "",
    paymentDate: new Date().toISOString().split("T")[0],
    paymentType: "Card",
    bank: "",
    reference: "",
    notes: "",
    direction: "",
  };

  const [form, setForm] = useState({
    ...initialState,
    vendorId: vendorId || "",
    direction: direction || "",
  });
  const [loading, setLoading] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [localVendors, setLocalVendors] = useState(vendors);

  useBodyScrollLock(open);

  const isEditMode = !!paymentToEdit;

  useEffect(() => {
    setLocalVendors(vendors);
  }, [vendors]);

  useEffect(() => {
    if (open) {
      setShouldRender(true);
      if (paymentToEdit) {
        setForm({
          vendorId: vendorId || paymentToEdit.vendor?._id || "",
          amount: paymentToEdit.amount || "",
          paymentDate: paymentToEdit.paymentDate
            ? new Date(paymentToEdit.paymentDate).toISOString().split("T")[0]
            : new Date().toISOString().split("T")[0],
          paymentType: paymentToEdit.paymentType || "Card",
          bank: paymentToEdit.bank || "",
          reference: paymentToEdit.reference || "",
          notes: paymentToEdit.notes || "",
          direction: paymentToEdit.direction || direction || "",
        });
      } else {
        setForm({
          ...initialState,
          vendorId: vendorId || "",
          direction: direction || "",
        });
      }
    } else {
      setTimeout(() => setShouldRender(false), 300);
    }
  }, [open, vendorId, direction, paymentToEdit]);

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (
      !form.vendorId ||
      !form.amount ||
      !form.paymentType ||
      !form.direction
    ) {
      toast.error("Vendor, amount, payment type, and direction are required");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        vendor: form.vendorId,
        amount: parseFloat(form.amount),
        paymentDate: form.paymentDate,
        paymentType: form.paymentType,
        bank: form.bank,
        reference: form.reference,
        notes: form.notes,
        direction: form.direction,
      };

      if (isEditMode) {
        const res = await API.put(
          `/vendors/${form.vendorId}/payments/${paymentToEdit._id}`,
          payload,
        );
        if (onUpdateSuccess) onUpdateSuccess(res.data);
        toast.success("Payment updated successfully!");
      } else {
        await onSave(payload);
        toast.success("Payment added successfully!");
      }

      setForm({
        ...initialState,
        vendorId: vendorId || "",
        direction: direction || "",
      });
      onClose();
    } catch (err) {
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(
          err.response?.data?.error ||
            `Failed to ${isEditMode ? "update" : "add"} payment`,
        );
      }
    } finally {
      setLoading(false);
    }
  };

  if (!shouldRender && !open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-[10000] transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />

      {/* Slide-out Panel */}
      <div
        className={`
          fixed dc-panel-card z-[10001]
          dc-panel-w bg-white shadow-2xl flex flex-col overflow-hidden
          transform transition-transform duration-300 ease-in-out font-inter
          ${open ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#D9D9D9] flex-shrink-0 bg-white gap-1">
          <h2 className="text-[15px] font-normal leading-6 text-[#78788D] uppercase tracking-wide">
            {isEditMode ? "Edit Payment" : form.direction === "IN" ? "Add Incoming Payment" : form.direction === "OUT" ? "Add Outgoing Payment" : "Add Payment"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="w-5 h-5 flex items-center justify-center text-[#1C1B1F] hover:opacity-70 transition-opacity"
            aria-label="Close"
          >
            <X className="w-[18px] h-[18px]" strokeWidth={2} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6 space-y-6">
          {/* Vendor Selection - Only if not pre-selected */}
          {!vendorId && (
            <div>
              <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Vendor <span className="text-[#FF4935]">*</span>
              </label>
              <SearchableDropdown
                options={localVendors}
                value={form.vendorId}
                onChange={(value) => handleChange("vendorId", value)}
                placeholder="Select Vendor"
                displayKey="name"
                valueKey="_id"
                required={true}
                className="w-full border border-[#1F2937]/10 rounded-full"
              />
            </div>
          )}

          <div>
            <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
              Amount <span className="text-[#FF4935]">*</span>
            </label>
            <input
              type="number"
              value={form.amount}
              onChange={(e) => handleChange("amount", e.target.value)}
              placeholder="Enter Amount"
              className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50"
            />
          </div>

          <div>
            <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
              Payment Date <span className="text-[#FF4935]">*</span>
            </label>
            <input
              type="date"
              value={form.paymentDate}
              onChange={(e) => handleChange("paymentDate", e.target.value)}
              className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
            />
          </div>

          <div>
            <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
              Direction <span className="text-[#FF4935]">*</span>
            </label>
            <select
              value={form.direction}
              onChange={(e) => handleChange("direction", e.target.value)}
              className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
            >
              <option value="">Select Direction</option>
              <option value="IN">You Got ( Incoming )</option>
              <option value="OUT">You Gave ( Outgoing )</option>
            </select>
          </div>

          <div>
            <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
              Payment Type <span className="text-[#FF4935]">*</span>
            </label>
            <select
              value={form.paymentType}
              onChange={(e) => handleChange("paymentType", e.target.value)}
              className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
            >
              <option value="Card">Card</option>
              <option value="Cash">Cash</option>
              <option value="Cheque">Cheque</option>
              <option value="Net Banking">Net Banking</option>
              <option value="UPI">UPI</option>
            </select>
          </div>

          <div>
            <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
              Bank
            </label>
            <input
              type="text"
              value={form.bank}
              onChange={(e) => handleChange("bank", e.target.value)}
              placeholder="Enter Bank Name"
              className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50"
            />
          </div>

          <div>
            <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
              Reference
            </label>
            <input
              type="text"
              value={form.reference}
              onChange={(e) => handleChange("reference", e.target.value)}
              placeholder="UTR / Cheque no. / Txn ID"
              className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50"
            />
          </div>

          <div>
            <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => handleChange("notes", e.target.value)}
              placeholder="Add Notes"
              className="w-full border border-[#1F2937]/10 rounded-2xl px-3 py-2 text-[12px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all resize-vertical"
              rows={3}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 py-2.5 px-4 border-t border-gray-100 bg-white flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 border border-gray-200 text-gray-700 rounded-[25px] text-sm font-bold hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-6 py-2 bg-[#158FFF] text-white rounded-[25px] text-sm font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Saving..." : isEditMode ? "Save Changes" : "Save"}
          </button>
        </div>
      </div>
    </>
  );
};

export default VendorPaymentForm;
