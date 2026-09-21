import { Smartphone, CreditCard, Landmark, Check, ShieldCheck } from "lucide-react";

// Autopay instrument for a new Razorpay mandate. A Registration Link shows
// only ONE method on Razorpay's page (omitting it showed Cards only), so the
// customer picks here, before we create the link.
const MANDATE_METHOD_OPTIONS = [
  { value: "upi", label: "UPI AutoPay", hint: "GPay, PhonePe, Paytm & more", Icon: Smartphone },
  { value: "card", label: "Credit / Debit Card", hint: "Visa, Mastercard, RuPay", Icon: CreditCard },
  { value: "emandate", label: "Net Banking", hint: "Bank account e-mandate", Icon: Landmark },
];

const MandateMethodPicker = ({ value, onChange, className = "" }) => (
  <fieldset className={className}>
    <legend className="text-sm font-semibold text-gray-900 mb-1">Payment method</legend>
    <p className="text-xs text-gray-500 mb-3">Used for today&apos;s payment and future automatic renewals.</p>
    <div role="radiogroup" className="space-y-2">
      {MANDATE_METHOD_OPTIONS.map(({ value: method, label, hint, Icon }) => {
        const selected = value === method;
        return (
          <button
            key={method}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange?.(method)}
            className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all ${selected ? "border-blue-600 bg-blue-50/60 ring-1 ring-blue-600" : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"}`}
          >
            <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${selected ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"}`}>
              <Icon className="h-4 w-4" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium text-gray-900">{label}</span>
              <span className="block text-xs text-gray-500 truncate">{hint}</span>
            </span>
            <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border ${selected ? "border-blue-600 bg-blue-600" : "border-gray-300"}`}>
              {selected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
            </span>
          </button>
        );
      })}
    </div>
    <p className="mt-3 flex items-center gap-1.5 text-xs text-gray-500">
      <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
      Secured by Razorpay. Cancel autopay anytime.
    </p>
  </fieldset>
);

export default MandateMethodPicker;
