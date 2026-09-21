import { Smartphone, CreditCard } from "lucide-react";

// Autopay instrument for a new Razorpay mandate. A Registration Link shows
// only ONE method on Razorpay's page (omitting it showed Cards only), so the
// customer picks here, before we create the link. No Net Banking: Razorpay
// rejects an e-mandate link with a non-zero amount ("The amount should be
// 0."), and ours charges the first invoice during authorization.
const MANDATE_METHOD_OPTIONS = [
  { value: "upi", label: "UPI AutoPay", Icon: Smartphone },
  { value: "card", label: "Card", Icon: CreditCard },
];

const MandateMethodPicker = ({ value, onChange, className = "" }) => (
  <div className={`flex flex-wrap items-center gap-2 ${className}`}>
    <span className="text-sm text-gray-600 mr-1">Pay with</span>
    <div role="radiogroup" className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
      {MANDATE_METHOD_OPTIONS.map(({ value: method, label, Icon }) => {
        const selected = value === method;
        return (
          <button
            key={method}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange?.(method)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${selected ? "bg-blue-600 text-white shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        );
      })}
    </div>
  </div>
);

export default MandateMethodPicker;
