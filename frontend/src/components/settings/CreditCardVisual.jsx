import React from "react";
import BankLogo from "../BankLogo";

// A card face generated from what was entered. The colour is derived from the
// bank name so each issuer keeps the same look every time.
const GRADIENTS = [
  ["#1e3a8a", "#2563eb"],
  ["#312e81", "#6366f1"],
  ["#064e3b", "#10b981"],
  ["#7c2d12", "#f97316"],
  ["#4c1d95", "#a855f7"],
  ["#134e4a", "#14b8a6"],
  ["#831843", "#ec4899"],
  ["#1f2937", "#4b5563"],
];

const hash = (s = "") => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h);
};

export default function CreditCardVisual({ card }) {
  const [from, to] = GRADIENTS[hash(card.bank) % GRADIENTS.length];
  const mm = String(card.expiryMonth || "").padStart(2, "0");
  const yy = String(card.expiryYear || "").slice(-2);

  return (
    <div
      className="relative w-full aspect-[1.586/1] max-w-[340px] rounded-2xl p-5 text-white shadow-lg overflow-hidden flex flex-col justify-between"
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
      <div className="absolute -left-12 -bottom-16 h-44 w-44 rounded-full bg-white/10" />

      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white p-1.5 shadow-md ring-1 ring-black/5">
            <BankLogo bankName={card.bank} size={28} />
          </div>
          <span className="truncate text-[15px] font-semibold tracking-tight">{card.bank}</span>
        </div>
        <span className="text-[11px] font-bold uppercase tracking-wider opacity-90">
          {card.network && card.network !== "Other" ? card.network : "Credit"}
        </span>
      </div>

      <div className="relative">
        <div className="mb-3 h-7 w-10 rounded-md bg-gradient-to-br from-yellow-200 to-yellow-500/90" />
        <p className="font-mono text-lg tracking-[0.18em]">•••• •••• •••• {card.last4}</p>
      </div>

      <div className="relative flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] uppercase tracking-wider opacity-70">Card Holder</p>
          <p className="truncate text-sm font-medium uppercase">{card.cardHolder}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[9px] uppercase tracking-wider opacity-70">Expires</p>
          <p className="font-mono text-sm">
            {mm}/{yy}
          </p>
        </div>
      </div>
    </div>
  );
}
