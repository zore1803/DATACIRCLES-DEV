import { X, ChevronRight, CreditCard, ShieldCheck, Landmark } from "lucide-react";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";
import { GooglePayLogo, PhonePeLogo, PaytmLogo, VisaLogo } from "./PaymentBrandLogos";

// Autopay method chooser shown before a Razorpay Registration Link is
// created. A link shows only ONE method on Razorpay's page (omitting it
// showed Cards only), so the pick happens here, styled after Razorpay's own
// checkout so the hand-off feels continuous. Net Banking/wallets can't be an
// autopay here (Razorpay requires a ₹0 e-mandate link, ours charges the
// first invoice), so they live under "manual": a plain payment link now and
// a new one emailed each renewal (backend utils/manualRenewal.js).

const UpiMark = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
    <path d="M10.2 3 5 21h3.3l5.2-18z" fill="#097939" />
    <path d="M14.4 3 9.2 21h3.3l5.2-18z" fill="#ED752E" />
  </svg>
);

const Chip = ({ children, className = "" }) => (
  <span className={`inline-flex h-6 min-w-[28px] items-center justify-center rounded border border-gray-200 bg-white px-1 text-[9px] font-bold leading-none ${className}`}>
    {children}
  </span>
);

const METHODS = [
  {
    value: "upi",
    label: "UPI",
    icon: <UpiMark />,
    chips: (
      <>
        <Chip><GooglePayLogo /></Chip>
        <Chip><PhonePeLogo /></Chip>
        <Chip><PaytmLogo /></Chip>
      </>
    ),
  },
  {
    value: "card",
    label: "Cards",
    icon: <CreditCard className="h-5 w-5 text-[#2b83ea]" />,
    chips: (
      <>
        <Chip><VisaLogo /></Chip>
        <Chip>
          <span className="h-2.5 w-2.5 rounded-full bg-[#eb001b]" />
          <span className="-ml-1 h-2.5 w-2.5 rounded-full bg-[#f79e1b] opacity-90" />
        </Chip>
        <Chip className="text-[#1b5ea8]">RuPay</Chip>
      </>
    ),
  },
];

const MANUAL_METHOD = {
  value: "manual",
  label: "Net Banking, Wallets & more",
  icon: <Landmark className="h-5 w-5 text-[#2b83ea]" />,
};

const MethodRow = ({ value, label, icon, chips, onSelect, bordered }) => (
  <button
    type="button"
    onClick={() => onSelect(value)}
    className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-gray-50 ${bordered ? "border-t border-gray-200" : ""}`}
  >
    <span className="flex w-6 justify-center">{icon}</span>
    <span className="text-[15px] font-medium text-gray-900">{label}</span>
    {chips && <span className="flex items-center gap-1">{chips}</span>}
    <ChevronRight className="ml-auto h-4 w-4 flex-shrink-0 text-gray-500" />
  </button>
);

const PaymentMethodModal = ({ isOpen, onSelect, onClose }) => {
  useBodyScrollLock(isOpen);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000005] flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-[380px] overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex items-center gap-3 bg-[#2b6de8] px-5 py-4">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-black p-1.5">
            <img src="/DC Circle Logo.png" alt="" className="h-full w-full object-contain invert" />
          </div>
          <p className="flex-1 truncate text-lg font-semibold text-white">DataCircles Technology</p>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 text-white/80 hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 pb-5 pt-5">
          <h3 className="text-lg font-semibold text-gray-900">Payment Options</h3>
          <p className="mb-1 mt-4 text-sm font-medium text-gray-600">Autopay</p>
          <p className="mb-2.5 text-xs text-gray-500">Pays today and renews automatically until you cancel.</p>
          <div className="overflow-hidden rounded-lg border border-gray-200">
            {METHODS.map((m, i) => (
              <MethodRow key={m.value} {...m} onSelect={onSelect} bordered={i > 0} />
            ))}
          </div>

          <p className="mb-1 mt-5 text-sm font-medium text-gray-600">Pay manually</p>
          <p className="mb-2.5 text-xs text-gray-500">Pay today with any method. We&apos;ll email a payment link at each renewal.</p>
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <MethodRow {...MANUAL_METHOD} onSelect={onSelect} />
          </div>
        </div>

        <div className="flex items-center justify-center gap-1.5 border-t border-gray-100 bg-gray-50 py-2.5 text-xs text-gray-500">
          <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
          Secured by <span className="font-bold italic text-[#072654]">Razorpay</span>
        </div>
      </div>
    </div>
  );
};

export default PaymentMethodModal;
