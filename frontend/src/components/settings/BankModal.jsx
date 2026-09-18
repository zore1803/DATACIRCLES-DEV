import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Info,
  RefreshCw
} from "lucide-react";
import toast from "react-hot-toast";

const emptyForm = {
  accountHolder: "",
  accountNumber: "",
  confirmAccountNumber: "",
  ifscCode: "",
  bank: "",
  branch: "",
  upi: "",
  upiNumber: "",
  openingBalance: "",
  notes: "",
  beneficiaryName: "",
  swiftCode: "",
  isDefault: false,
};

export default function BankModal({ isOpen, onClose, onSave, initialData, hasExistingDefault }) {
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [ifscLoading, setIfscLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    if (initialData) {
      setForm({
        accountHolder: initialData.accountHolder || "",
        accountNumber: initialData.accountNumber || "",
        confirmAccountNumber: initialData.accountNumber || "",
        ifscCode: initialData.ifscCode || "",
        bank: initialData.bank || "",
        branch: initialData.branch || "",
        upi: initialData.upi || "",
        upiNumber: initialData.upiNumber || "",
        openingBalance:
          initialData.openingBalance !== null && initialData.openingBalance !== undefined
            ? String(initialData.openingBalance)
            : "",
        notes: initialData.notes || "",
        beneficiaryName: initialData.beneficiaryName || "",
        swiftCode: initialData.swiftCode || "",
        isDefault: Boolean(initialData.isDefault),
      });
    } else {
      setForm({
        ...emptyForm,
        isDefault: !hasExistingDefault,
      });
    }
  }, [isOpen, initialData, hasExistingDefault]);

  if (!isOpen) return null;

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleFetchBankDetails = async () => {
    const ifsc = form.ifscCode.trim();
    if (!ifsc) {
      toast.error("Enter IFSC code first");
      return;
    }
    // Every real IFSC is exactly 11 characters (4-letter bank code + a
    // literal "0" + 6-character branch code) — checking this before hitting
    // the API turns a generic "Invalid IFSC" into an error that actually
    // tells the user what's wrong (usually a missing digit, like the
    // 10-character codes people type from memory).
    if (ifsc.length !== 11) {
      toast.error(`IFSC code must be 11 characters (got ${ifsc.length})`);
      return;
    }
    setIfscLoading(true);
    try {
      const res = await fetch(`https://ifsc.razorpay.com/${ifsc}`);
      if (!res.ok) throw new Error('Invalid IFSC');
      const data = await res.json();
      handleChange('bank', data.BANK || '');
      handleChange('branch', data.BRANCH || '');
      toast.success('Bank details fetched');
    } catch (e) {
      toast.error(e.message || 'Failed to fetch bank details');
    } finally {
      setIfscLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.accountHolder.trim()) {
      toast.error("Account holder name is required");
      return;
    }
    if (!form.accountNumber.trim()) {
      toast.error("Account number is required");
      return;
    }
    if (form.accountNumber.trim() !== form.confirmAccountNumber.trim()) {
      toast.error("Account numbers do not match");
      return;
    }
    if (!form.ifscCode.trim()) {
      toast.error("IFSC code is required");
      return;
    }
// UPI validation (optional)
    const upi = form.upi.trim();
    if (upi) {
      // No symbols before '@', no spaces, simple format check
      const upiRegex = /^[\w.-]{2,256}@[\w.-]{2,64}$/;
      if (!upiRegex.test(upi)) {
        toast.error("Invalid UPI ID format");
        return;
      }
    }
    // UPI Number validation (optional)
    const upiNumber = form.upiNumber.trim();
    if (upiNumber) {
      const upiNumberRegex = /^\d{10,12}$/;
      if (!upiNumberRegex.test(upiNumber)) {
        toast.error("Invalid UPI Number format");
        return;
      }
    }
    // Bank name and branch are auto‑filled via IFSC fetch;

    const payload = {
      accountHolder: form.accountHolder.trim(),
      accountNumber: form.accountNumber.trim(),
      ifscCode: form.ifscCode.trim().toUpperCase(),
      bank: form.bank.trim(),
      branch: form.branch.trim(),
      upi: upi,
      upiNumber: form.upiNumber.trim(),
      openingBalance: form.openingBalance === "" ? null : Number(form.openingBalance),
      notes: form.notes.trim(),
      beneficiaryName: form.beneficiaryName.trim(),
      swiftCode: form.swiftCode.trim(),
      isDefault: form.isDefault,
    };

    try {
      setLoading(true);
      await onSave(payload);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || "Failed to save bank details");
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <>
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100009]"
        onClick={onClose}
      />
      <div className="fixed dc-panel-card dc-panel-w z-[100010] bg-white shadow-2xl flex flex-col overflow-hidden font-inter">
        {/* Sticky header — matches the CompanyForm header spec */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#D9D9D9] flex-shrink-0 bg-white gap-1">
          <h2 className="text-[15px] font-normal leading-6 text-[#78788D] uppercase tracking-wide">
            {initialData ? "Edit Bank Account" : "Add Bank Account"}
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

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6 space-y-6">
            <div>
              <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Account Holder Name <span className="text-[#FF4935]">*</span>
              </label>
              <input
                type="text"
                value={form.accountHolder}
                onChange={(e) => handleChange("accountHolder", e.target.value)}
                placeholder="e.g. John Doe / Company Pvt Ltd"
                className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50"
                required
              />
            </div>

            <div>
              <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Account No <span className="text-[#FF4935]">*</span>
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={form.accountNumber}
                onChange={(e) => handleChange("accountNumber", e.target.value)}
                placeholder="Enter account number"
                className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50"
                required
              />
            </div>

            <div>
              <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Confirm Bank Account No <span className="text-[#FF4935]">*</span>
              </label>
              <input
                type="text"
                value={form.confirmAccountNumber}
                onChange={(e) => handleChange("confirmAccountNumber", e.target.value)}
                placeholder="Re-enter account number"
                className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50"
                required
              />
            </div>

            <div>
              <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                IFSC Code <span className="text-[#FF4935]">*</span>
              </label>
              <div className="flex items-stretch gap-2">
                <input
                  type="text"
                  value={form.ifscCode}
                  onChange={(e) => handleChange("ifscCode", e.target.value.toUpperCase())}
                  placeholder="e.g. HDFC0001234"
                  className="flex-1 min-w-0 border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] uppercase focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50 placeholder:normal-case"
                  required
                />
                <button
                  type="button"
                  onClick={handleFetchBankDetails}
                  disabled={ifscLoading || !form.ifscCode.trim()}
                  className="flex-shrink-0 px-4 h-[38px] rounded-full bg-[#158FFF] text-white text-[13px] font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {ifscLoading ? <RefreshCw className="animate-spin h-4 w-4 inline" /> : "Fetch"}
                </button>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Bank Name <span className="text-[#FF4935]">*</span>
              </label>
              <input
                type="text"
                value={form.bank}
                // disabled – will be auto‑filled via IFSC fetch
                disabled
                className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] bg-gray-50 cursor-not-allowed focus:outline-none transition-all"
                required
              />
            </div>

            <div>
              <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Branch Name <span className="text-[#FF4935]">*</span>
              </label>
              <input
                type="text"
                value={form.branch}
                // disabled – will be auto‑filled via IFSC fetch
                disabled
                className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] bg-gray-50 cursor-not-allowed focus:outline-none transition-all"
                required
              />
            </div>

            <div className="flex items-center gap-3 mb-1">
              <span className="flex-1 h-px bg-[#D9D9D9]" />
              <h3 className="flex-shrink-0 text-[14px] font-medium leading-[120%] text-[#1F2937]">
                UPI Details
              </h3>
              <span className="flex-1 h-px bg-[#D9D9D9]" />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                UPI (Optional)
              </label>
              <input
                type="text"
                value={form.upi}
                onChange={(e) => handleChange("upi", e.target.value)}
                placeholder="e.g. yourname@upi"
                className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50"
              />
              <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-gray-500">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                This UPI ID will be used to generate Dynamic QR codes on the invoices and bills.
              </p>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                UPI Number (Optional)
              </label>
              <input
                type="text"
                value={form.upiNumber}
                onChange={(e) => handleChange("upiNumber", e.target.value)}
                placeholder="e.g. 9876543210"
                className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50"
              />
              <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-gray-500">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                This bank account information will be displayed in online order details only and will not appear on invoices or bills.
              </p>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Opening Balance (Optional)
              </label>
              <input
                type="number"
                step="0.01"
                value={form.openingBalance}
                onChange={(e) => handleChange("openingBalance", e.target.value)}
                placeholder="0.00"
                className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50"
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Beneficiary Name (Optional)
              </label>
              <input
                type="text"
                value={form.beneficiaryName}
                onChange={(e) => handleChange("beneficiaryName", e.target.value)}
                placeholder="For international transfers"
                className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50"
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                SWIFT Code (Optional)
              </label>
              <input
                type="text"
                value={form.swiftCode}
                onChange={(e) => handleChange("swiftCode", e.target.value.toUpperCase())}
                placeholder="e.g. HDFCINBB"
                className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] uppercase focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50 placeholder:normal-case"
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Notes (Optional)
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => handleChange("notes", e.target.value)}
                rows={3}
                placeholder="Any additional notes about this bank account..."
                className="w-full border border-[#1F2937]/10 rounded-2xl px-3 py-2 text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50 resize-none"
              />
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-[#1F2937]/10 bg-slate-50/70 px-4 py-3">
              <div>
                <p className="text-[13px] font-semibold text-[#161618]">Default</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {form.isDefault
                    ? "This will override your previous default bank"
                    : "Use this account as the default for invoices and payments"}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.isDefault}
                onClick={() => handleChange("isDefault", !form.isDefault)}
                className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                  form.isDefault ? "bg-[#158FFF]" : "bg-gray-300"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                    form.isDefault ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Sticky footer — compact, matching the note editor card */}
          <div className="flex-shrink-0 py-2.5 px-4 border-t border-gray-100 bg-white flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-gray-200 text-gray-700 rounded-[25px] text-sm font-bold hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-[#158FFF] text-white rounded-[25px] text-sm font-bold hover:opacity-90 disabled:opacity-50 transition-colors"
            >
              {loading ? "Saving..." : initialData ? "Update Bank" : "Save Bank"}
            </button>
          </div>
        </form>
      </div>
    </>,
    document.body
  );
}
