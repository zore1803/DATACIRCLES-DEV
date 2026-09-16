import React, { useEffect, useState } from "react";
import { 
  X, 
  Building2, 
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
    if (!form.ifscCode.trim()) {
      toast.error("Enter IFSC code first");
      return;
    }
    setIfscLoading(true);
    try {
      const res = await fetch(`https://ifsc.razorpay.com/${form.ifscCode.trim()}`);
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

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
          <div>
            <h3 className="text-xl font-bold text-gray-900">
              {initialData ? "Edit Bank Account" : "Add Bank Account"}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">Fill in your bank details for payments and invoices</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Account Holder Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.accountHolder}
                onChange={(e) => handleChange("accountHolder", e.target.value)}
                placeholder="e.g. John Doe / Company Pvt Ltd"
                className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Account No <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={form.accountNumber}
                onChange={(e) => handleChange("accountNumber", e.target.value)}
                placeholder="Enter account number"
                className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Confirm Bank Account No <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.confirmAccountNumber}
                onChange={(e) => handleChange("confirmAccountNumber", e.target.value)}
                placeholder="Re-enter account number"
                className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                IFSC Code <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={form.ifscCode}
                  onChange={(e) => handleChange("ifscCode", e.target.value.toUpperCase())}
                  placeholder="e.g. HDFC0001234"
                  className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm uppercase outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                  required
                />
                <button
                  type="button"
                  onClick={handleFetchBankDetails}
                  disabled={ifscLoading || !form.ifscCode.trim()}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-purple-600 px-2 py-1 text-xs text-white hover:bg-purple-700"
                >
                  {ifscLoading ? <RefreshCw className="animate-spin h-4 w-4 inline" /> : 'Fetch'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Bank Name <span className="text-red-500">*</span>
              </label>
                <input
                  type="text"
                  value={form.bank}
                  // disabled – will be auto‑filled via IFSC fetch
                  disabled

                  className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm bg-gray-50 cursor-not-allowed focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                  required
                />
            </div>

            <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Branch Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.branch}
                  // disabled – will be auto‑filled via IFSC fetch
                  disabled

                  className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm bg-gray-50 cursor-not-allowed focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                  required
                />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">UPI (Optional)</label>
              <input
                type="text"
                value={form.upi}
                onChange={(e) => handleChange("upi", e.target.value)}
                placeholder="e.g. yourname@upi"
                className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              />
              <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-gray-500">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                This UPI ID will be used to generate Dynamic QR codes on the invoices and bills.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">UPI Number (Optional)</label>
              <input
                type="text"
                value={form.upiNumber}
                onChange={(e) => handleChange("upiNumber", e.target.value)}
                placeholder="e.g. 9876543210"
                className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              />
              <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-gray-500">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                This bank account information will be displayed in online order details only and will not appear on invoices or bills.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Opening Balance (Optional)</label>
              <input
                type="number"
                step="0.01"
                value={form.openingBalance}
                onChange={(e) => handleChange("openingBalance", e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Beneficiary Name (Optional)</label>
              <input
                type="text"
                value={form.beneficiaryName}
                onChange={(e) => handleChange("beneficiaryName", e.target.value)}
                placeholder="For international transfers"
                className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">SWIFT Code (Optional)</label>
              <input
                type="text"
                value={form.swiftCode}
                onChange={(e) => handleChange("swiftCode", e.target.value.toUpperCase())}
                placeholder="e.g. HDFCINBB"
                className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm uppercase outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Notes (Optional)</label>
            <textarea
              value={form.notes}
              onChange={(e) => handleChange("notes", e.target.value)}
              rows={3}
              placeholder="Any additional notes about this bank account..."
              className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-purple-100 bg-purple-50/50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">Default</p>
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
                form.isDefault ? "bg-purple-600" : "bg-gray-300"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                  form.isDefault ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2 text-sm font-semibold text-white shadow-md hover:bg-purple-700 disabled:opacity-60"
            >
              <Building2 className="h-4 w-4" />
              {loading ? "Saving..." : initialData ? "Update Bank" : "Save Bank"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
