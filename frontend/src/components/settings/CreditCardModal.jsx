import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Info } from "lucide-react";
import toast from "react-hot-toast";
import BankLogo from "../BankLogo";
import { suggestBanks } from "../../data/bankNames";

const emptyForm = { cardHolder: "", cardNumber: "", expiry: "", bank: "", isDefault: false };

const inputCls =
  "w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50";
const labelCls =
  "flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2";

const digitsOnly = (v) => v.replace(/\D/g, "");
const groupCardNumber = (v) => digitsOnly(v).slice(0, 19).replace(/(.{4})/g, "$1 ").trim();

const detectNetwork = (num) => {
  if (/^4/.test(num)) return "Visa";
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(num)) return "Mastercard";
  if (/^3[47]/.test(num)) return "Amex";
  if (/^(30|36|38|39)/.test(num)) return "Diners";
  if (/^(60|65|81|82|508)/.test(num)) return "RuPay";
  return "Other";
};

const formatExpiry = (v) => {
  const d = digitsOnly(v).slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};

export default function CreditCardModal({ isOpen, onClose, onSave, initialData, hasExistingDefault }) {
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const bankSuggestions = suggestBanks(form.bank);

  useEffect(() => {
    if (!isOpen) return;
    if (initialData) {
      setForm({
        cardHolder: initialData.cardHolder || "",
        cardNumber: "",
        expiry: `${String(initialData.expiryMonth).padStart(2, "0")}/${String(initialData.expiryYear).slice(-2)}`,
        bank: initialData.bank || "",
        isDefault: Boolean(initialData.isDefault),
      });
    } else {
      setForm({ ...emptyForm, isDefault: !hasExistingDefault });
    }
  }, [isOpen, initialData, hasExistingDefault]);

  if (!isOpen) return null;

  const handleChange = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.cardHolder.trim()) return toast.error("Card holder name is required");
    if (!/[A-Za-z]/.test(form.cardHolder)) {
      return toast.error("Card holder name must contain at least one letter");
    }

    // On edit the number is optional: leaving it blank keeps the saved last 4.
    const number = digitsOnly(form.cardNumber);
    if (!initialData || number) {
      if (number.length < 13 || number.length > 19) {
        return toast.error("Card number must be 13-19 digits");
      }
    }

    const m = /^(\d{2})\/(\d{2})$/.exec(form.expiry);
    const month = m ? Number(m[1]) : 0;
    const year = m ? 2000 + Number(m[2]) : 0;
    if (!m || month < 1 || month > 12) return toast.error("Enter expiry as MM/YY");
    const now = new Date();
    if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) {
      return toast.error("This card has expired");
    }

    if (!form.bank.trim()) return toast.error("Bank name is required");

    const payload = {
      cardHolder: form.cardHolder.trim(),
      bank: form.bank.trim(),
      expiryMonth: month,
      expiryYear: year,
      isDefault: form.isDefault,
      ...(number ? { cardNumber: number, network: detectNetwork(number) } : {}),
    };

    try {
      setLoading(true);
      await onSave(payload);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || "Failed to save credit card");
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[100009]" onClick={onClose} />
      <div className="fixed dc-panel-card dc-panel-w z-[100010] bg-white shadow-2xl flex flex-col overflow-hidden font-inter">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#D9D9D9] flex-shrink-0 bg-white gap-1">
          <h2 className="text-[15px] font-normal leading-6 text-[#78788D] uppercase tracking-wide">
            {initialData ? "Edit Credit Card" : "Add Credit Card"}
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
              <label className={labelCls}>
                Card Holder Name <span className="text-[#FF4935]">*</span>
              </label>
              <input
                type="text"
                value={form.cardHolder}
                onChange={(e) => handleChange("cardHolder", e.target.value)}
                placeholder="Name as printed on the card"
                className={inputCls}
                required
              />
            </div>

            <div>
              <label className={labelCls}>
                Card Number <span className="text-[#FF4935]">*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={form.cardNumber}
                onChange={(e) => handleChange("cardNumber", groupCardNumber(e.target.value))}
                placeholder={
                  initialData ? `•••• •••• •••• ${initialData.last4} (leave blank to keep)` : "1234 5678 9012 3456"
                }
                className={`${inputCls} font-mono`}
              />
              <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-gray-500">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                For your safety only the last 4 digits are saved. The full number is never stored.
              </p>
            </div>

            <div>
              <label className={labelCls}>
                Expiry Date <span className="text-[#FF4935]">*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={form.expiry}
                onChange={(e) => handleChange("expiry", formatExpiry(e.target.value))}
                placeholder="MM/YY"
                maxLength={5}
                className={inputCls}
                required
              />
            </div>

            <div>
              <label className={labelCls}>
                Bank Name <span className="text-[#FF4935]">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={form.bank}
                  onChange={(e) => {
                    handleChange("bank", e.target.value);
                    setBankOpen(true);
                  }}
                  onFocus={() => setBankOpen(true)}
                  onBlur={() => setBankOpen(false)}
                  placeholder="e.g. HDFC Bank"
                  autoComplete="off"
                  className={inputCls}
                  required
                />
                {bankOpen && bankSuggestions.length > 0 && (
                  <ul className="absolute left-0 right-0 top-full mt-1 z-10 max-h-56 overflow-y-auto rounded-2xl border border-[#1F2937]/10 bg-white py-1 shadow-lg">
                    {bankSuggestions.map((name) => (
                      <li key={name}>
                        <button
                          type="button"
                          // mousedown fires before the input's blur, so the pick lands.
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleChange("bank", name);
                            setBankOpen(false);
                          }}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-[#1F2937] hover:bg-blue-50"
                        >
                          <BankLogo bankName={name} size={22} />
                          {name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-[#1F2937]/10 bg-slate-50/70 px-4 py-3">
              <div>
                <p className="text-[13px] font-semibold text-[#161618]">Default</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {form.isDefault
                    ? "This will override your previous default card"
                    : "Pre-select this card when an expense is paid by card"}
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
              {loading ? "Saving..." : initialData ? "Update Card" : "Save Card"}
            </button>
          </div>
        </form>
      </div>
    </>,
    document.body
  );
}
