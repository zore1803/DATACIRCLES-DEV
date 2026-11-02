import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import confetti from "canvas-confetti";
import { Check, Sparkles, Rocket } from "lucide-react";
import { useSubscription } from "../../contexts/SubscriptionContext";

const FLAG = "dc:plan-purchased";

// Called at every point where a plan purchase is confirmed. The celebration is
// shown by <PlanUpgradeCelebration /> (mounted once, app-wide), which survives
// the page reloads and redirects that follow a payment because the flag lives in
// sessionStorage rather than component state.
export const markPlanPurchased = () => {
  try {
    sessionStorage.setItem(FLAG, String(Date.now()));
    window.dispatchEvent(new Event("dc:plan-purchased"));
  } catch {
    // Private mode etc. — losing the celebration is fine.
  }
};

const COLORS = ["#0085FF", "#7C3AED", "#F59E0B", "#10B981", "#EC4899", "#38BDF8"];

// Confetti cannons on both sides of the screen, firing inward.
const fireSideConfetti = () => {
  const end = Date.now() + 2800;
  const frame = () => {
    confetti({ particleCount: 6, angle: 60, spread: 62, startVelocity: 58, origin: { x: 0, y: 0.75 }, colors: COLORS, zIndex: 200100 });
    confetti({ particleCount: 6, angle: 120, spread: 62, startVelocity: 58, origin: { x: 1, y: 0.75 }, colors: COLORS, zIndex: 200100 });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  // An opening burst, then a steady stream.
  confetti({ particleCount: 90, angle: 60, spread: 75, startVelocity: 65, origin: { x: 0, y: 0.8 }, colors: COLORS, zIndex: 200100 });
  confetti({ particleCount: 90, angle: 120, spread: 75, startVelocity: 65, origin: { x: 1, y: 0.8 }, colors: COLORS, zIndex: 200100 });
  frame();
};

const formatDate = (d) => {
  if (!d) return "";
  const date = new Date(d);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

export default function PlanUpgradeCelebration() {
  const { subscription, plans } = useSubscription();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // Set by the preview trigger below; shown instead of the real plan.
  const [previewPlan, setPreviewPlan] = useState("");
  const firedRef = useRef(false);

  const sub = subscription?.subscription;
  const planId = sub?.planName;
  const plan = (plans || []).find((p) => p.id === planId);
  const planLabel = plan?.name || (planId ? planId.charAt(0).toUpperCase() + planId.slice(1) : "");

  // Open once the purchase flag is set AND the confirmed plan is known, so the
  // box never names the wrong plan while the subscription is still loading.
  const check = useCallback((e) => {
    // Design preview, no purchase needed. From the browser console:
    //   window.dispatchEvent(new CustomEvent("dc:plan-purchased", { detail: { preview: "Growth" } }))
    if (e?.detail?.preview) {
      firedRef.current = true;
      setPreviewPlan(String(e.detail.preview));
      setOpen(true);
      return;
    }
    if (firedRef.current) return;
    let flagged = false;
    try {
      flagged = !!sessionStorage.getItem(FLAG);
    } catch {
      flagged = false;
    }
    if (flagged && sub?.isPaymentConfirmed && planLabel) {
      firedRef.current = true;
      try {
        sessionStorage.removeItem(FLAG);
      } catch {
        // ignore
      }
      setOpen(true);
    }
  }, [sub?.isPaymentConfirmed, planLabel]);

  useEffect(() => {
    check();
    window.addEventListener("dc:plan-purchased", check);
    window.addEventListener("dc:subscription-updated", check);
    return () => {
      window.removeEventListener("dc:plan-purchased", check);
      window.removeEventListener("dc:subscription-updated", check);
    };
  }, [check]);

  useEffect(() => {
    if (open) fireSideConfetti();
  }, [open]);

  const close = () => {
    setLeaving(true);
    setTimeout(() => {
      setOpen(false);
      setLeaving(false);
      setPreviewPlan("");
      firedRef.current = false;
    }, 220);
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  const shownPlan = previewPlan || planLabel;

  const renews = formatDate(sub?.currentPeriodEnd);
  const cycle = sub?.billingCycle === "yearly" ? "Yearly" : sub?.billingCycle === "monthly" ? "Monthly" : "";

  return createPortal(
    <div
      className="fixed inset-0 z-[200000] flex items-center justify-center p-4"
      style={{ animation: `${leaving ? "dcpu-fade-out" : "dcpu-fade-in"} 0.22s ease both` }}
      role="dialog"
      aria-modal="true"
      aria-label={`You have upgraded to ${shownPlan} Plan`}
    >
      <style>{`
        @keyframes dcpu-fade-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes dcpu-fade-out { from { opacity: 1 } to { opacity: 0 } }
        @keyframes dcpu-pop { 0% { transform: scale(.7) translateY(30px); opacity: 0 } 60% { transform: scale(1.04) translateY(-4px); opacity: 1 } 100% { transform: scale(1) translateY(0) } }
        @keyframes dcpu-spin { to { transform: rotate(360deg) } }
        @keyframes dcpu-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-7px) } }
        @keyframes dcpu-shine { 0% { transform: translateX(-120%) skewX(-18deg) } 60%,100% { transform: translateX(260%) skewX(-18deg) } }
        @keyframes dcpu-check { from { stroke-dashoffset: 40 } to { stroke-dashoffset: 0 } }
        @keyframes dcpu-twinkle { 0%,100% { opacity: .25; transform: scale(.7) } 50% { opacity: 1; transform: scale(1.15) } }
        @keyframes dcpu-rise { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: translateY(0) } }
        @media (prefers-reduced-motion: reduce) { .dcpu * { animation: none !important } }
      `}</style>

      <div className="absolute inset-0 bg-[#0B1020]/60 backdrop-blur-sm" onClick={close} />

      <div
        className="dcpu relative w-full max-w-[420px] rounded-[28px] p-[2px]"
        style={{
          animation: "dcpu-pop 0.6s cubic-bezier(.2,.9,.3,1.2) both",
          background: "conic-gradient(from 0deg, #0085FF, #7C3AED, #EC4899, #F59E0B, #10B981, #0085FF)",
        }}
      >
        {/* A slowly turning rainbow edge behind the card */}
        <div
          className="pointer-events-none absolute -inset-1 -z-10 rounded-[32px] opacity-60 blur-xl"
          style={{
            background: "conic-gradient(from 0deg, #0085FF, #7C3AED, #EC4899, #F59E0B, #10B981, #0085FF)",
            animation: "dcpu-spin 6s linear infinite",
          }}
        />

        <div className="relative overflow-hidden rounded-[26px] bg-white px-8 pb-7 pt-10 text-center">
          {/* sweeping shine */}
          <div
            className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent"
            style={{ animation: "dcpu-shine 3.6s ease-in-out 0.9s infinite" }}
          />
          {/* twinkling stars */}
          {[
            ["left-6 top-8", "0s"],
            ["right-8 top-12", "0.6s"],
            ["left-10 top-28", "1.1s"],
            ["right-6 top-32", "0.3s"],
          ].map(([pos, delay]) => (
            <Sparkles
              key={pos}
              className={`pointer-events-none absolute h-4 w-4 text-[#F59E0B] ${pos}`}
              style={{ animation: `dcpu-twinkle 2s ease-in-out ${delay} infinite` }}
            />
          ))}

          {/* badge */}
          <div className="relative mx-auto mb-6 h-[104px] w-[104px]" style={{ animation: "dcpu-float 3.2s ease-in-out infinite" }}>
            <div
              className="absolute inset-0 rounded-full"
              style={{ background: "conic-gradient(from 0deg, #0085FF, #7C3AED, #EC4899, #0085FF)", animation: "dcpu-spin 5s linear infinite" }}
            />
            <div className="absolute inset-[5px] flex items-center justify-center rounded-full bg-white">
              <div className="flex h-[76px] w-[76px] items-center justify-center rounded-full bg-gradient-to-br from-[#0085FF] to-[#7C3AED] shadow-lg">
                <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12.5l4.5 4.5L19 7.5" strokeDasharray="40" style={{ animation: "dcpu-check 0.7s ease 0.5s both" }} />
                </svg>
              </div>
            </div>
            <span className="absolute -right-2 -top-1 flex h-8 w-8 items-center justify-center rounded-full bg-[#F59E0B] text-white shadow-md ring-4 ring-white">
              <Rocket className="h-4 w-4" />
            </span>
          </div>

          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#7C3AED]" style={{ animation: "dcpu-rise 0.5s ease 0.35s both" }}>
            Plan unlocked
          </p>
          <h2 className="mt-2 text-[26px] font-extrabold leading-tight text-[#111827]" style={{ animation: "dcpu-rise 0.5s ease 0.45s both" }}>
            You have upgraded to
            <span className="mt-1 block bg-gradient-to-r from-[#0085FF] via-[#7C3AED] to-[#EC4899] bg-clip-text text-[34px] text-transparent">
              {shownPlan} Plan
            </span>
          </h2>
          <p className="mx-auto mt-3 max-w-[300px] text-[14px] leading-relaxed text-[#6B7280]" style={{ animation: "dcpu-rise 0.5s ease 0.6s both" }}>
            Welcome aboard! Everything in your new plan is unlocked and ready to use.
          </p>

          {(cycle || renews) && (
            <div
              className="mx-auto mt-5 flex w-fit items-center gap-3 rounded-full border border-[#E5E7EB] bg-[#F9FAFB] px-4 py-2 text-[12.5px] text-[#374151]"
              style={{ animation: "dcpu-rise 0.5s ease 0.7s both" }}
            >
              {cycle && (
                <span className="flex items-center gap-1.5 font-semibold">
                  <Check className="h-3.5 w-3.5 text-[#10B981]" />
                  {cycle} billing
                </span>
              )}
              {cycle && renews && <span className="h-3 w-px bg-[#D1D5DB]" />}
              {renews && <span>Valid till <b>{renews}</b></span>}
            </div>
          )}

          <button
            type="button"
            onClick={close}
            autoFocus
            className="mt-7 w-full rounded-full bg-gradient-to-r from-[#0085FF] to-[#7C3AED] py-3 text-[15px] font-bold text-white shadow-lg shadow-[#0085FF]/30 transition hover:scale-[1.02] hover:shadow-xl active:scale-[0.99]"
            style={{ animation: "dcpu-rise 0.5s ease 0.8s both" }}
          >
            Let&apos;s get started
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
