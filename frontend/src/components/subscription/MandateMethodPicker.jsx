// Autopay instrument for a new Razorpay mandate. A Registration Link shows
// only ONE method on Razorpay's page (omitting it showed Cards only), so the
// customer picks here, before we create the link.
const MANDATE_METHOD_OPTIONS = [
  ["upi", "UPI AutoPay"],
  ["card", "Card"],
  ["emandate", "Netbanking"],
];

const MandateMethodPicker = ({ value, onChange, className = "" }) => (
  <div className={className}>
    <p className="text-xs font-semibold text-gray-700 mb-2">Pay & autopay with</p>
    <div className="grid grid-cols-3 gap-2">
      {MANDATE_METHOD_OPTIONS.map(([method, label]) => (
        <button
          key={method}
          type="button"
          onClick={() => onChange?.(method)}
          className={`py-2 px-2 rounded-lg border text-xs font-medium transition-colors ${value === method ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}
        >
          {label}
        </button>
      ))}
    </div>
  </div>
);

export default MandateMethodPicker;
