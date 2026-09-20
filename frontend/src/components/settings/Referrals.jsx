// components/settings/Referrals.jsx
//
// Org-facing referral dashboard — code, share link, stats, and reward
// history. Read-only: every number here comes straight from
// GET /subscription/referrals/overview (utils/referralUtils.js
// buildReferralOverview on the backend) — this component never computes a
// discount, eligibility, or status itself (ARCHITECTURE.md §8 rule #3/#19
// of REFERRAL_SYSTEM_DESIGN.md — frontend never calculates referral math).
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Gift,
  Copy,
  Check,
  Send as SendIcon,
  Tag,
  Share2,
  Mail,
  Building2,
  ChevronRight,
  Circle,
  UserPlus,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { subscriptionAPI } from "../../services/subscriptionApi";
import { formatPrice } from "../../utils/pricingSnapshot";
import StatTile from "../common/StatTile";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";
import facebookLogo from "../../assets/facebook-logo.png";
import whatsappLogo from "../../assets/whatsapp-logo.png";
import telegramLogo from "../../assets/telegram-logo.png";
import emailLogo from "../../assets/email-logo.png";
import twitterLogo from "../../assets/twitter-logo.png";

// Each PNG's mark fills a different fraction of its own transparent canvas
// (measured directly: facebook ~70%, telegram ~83%, whatsapp ~97%, email
// ~75%, instagram ~60%, twitter ~55% of the canvas' longest side), so
// rendering all of them at the same image size makes the mark itself look
// like a different size per icon.
// `zoom` scales each one (about its own center, clipped by the row's
// overflow-hidden box) so the visible marks read as the same size.
const SHARE_TARGETS = [
  {
    id: "facebook",
    label: "Share on Facebook",
    image: facebookLogo,
    zoom: 1.2,
    urlFor: (link) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`,
  },
  {
    id: "telegram",
    label: "Share on Telegram",
    image: telegramLogo,
    zoom: 1.03,
    urlFor: (link, text) => `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`,
  },
  {
    id: "whatsapp",
    label: "Share on WhatsApp",
    image: whatsappLogo,
    zoom: 0.88,
    urlFor: (link, text) => `https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`,
  },
  {
    id: "email",
    label: "Share on E-Mail",
    image: emailLogo,
    zoom: 1.13,
    urlFor: (link, text) => `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(link)}`,
  },
  {
    id: "twitter",
    label: "Share on X (Twitter)",
    image: twitterLogo,
    zoom: 1.56,
    urlFor: (link, text) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`,
  },
];

const HOW_IT_WORKS = [
  {
    icon: Share2,
    title: "Share your code",
    body: () => "Copy your referral code or send an invite by email to anyone who could use DataCircles.",
  },
  {
    icon: UserPlus,
    title: "Your friend subscribes",
    body: () => "They sign up with your code and activate any paid plan.",
  },
  {
    icon: Gift,
    title: "Both of you win",
    body: (rewardLabel) =>
      `You earn ${rewardLabel} as a reward, and they get a discount on their first payment.`,
  },
];

const formatDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  if (dt.getFullYear() < 2020) return "—";
  return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

const rewardValueLabel = (reward) =>
  reward.rewardType === "fixed" ? formatPrice(reward.rewardValue) : `${reward.rewardValue}%`;

const REFERRAL_STATUS_STYLES = {
  pending: "bg-[#FDF3E6] text-[#EA9927] border-[#F7DDB8]",
  qualified: "bg-[#E6F7EF] text-[#1FA971] border-[#B9E7D3]",
  expired: "bg-gray-100 text-gray-500 border-gray-200",
};

const REWARD_STATUS_STYLES = {
  available: "bg-[#E6F7EF] text-[#1FA971] border-[#B9E7D3]",
  reserved: "bg-[#FDF3E6] text-[#EA9927] border-[#F7DDB8]",
  consumed: "bg-gray-100 text-gray-500 border-gray-200",
  expired: "bg-[#EEF2F9] text-[#56698A] border-[#D6DEEC]",
  revoked: "bg-[#FCEAEA] text-[#EA4B4B] border-[#F5C7C7]",
};

const StatusPill = ({ status, styles }) => (
  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border capitalize ${styles[status] || "bg-gray-100 text-gray-500 border-gray-200"}`}>
    {status}
  </span>
);

const Referrals = () => {
  const [code, setCode] = useState(null);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  useBodyScrollLock(shareOpen);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteEmailError, setInviteEmailError] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [sendingInvite, setSendingInvite] = useState(false);
  // Sent invites come from the server (ReferralInvite log) so they survive
  // a reload. They are still NOT referrals — a Referral only exists once
  // the recipient registers with the code — so they're tracked and rendered
  // separately from referralsSent.
  const [sentInvites, setSentInvites] = useState([]);
  // The green confirmation is a transient acknowledgement, not a record —
  // it clears itself after 3s (the row in "People you've referred" is what
  // sticks around). Held in a ref so a second send restarts the timer
  // instead of letting the first one hide the new message.
  const [inviteNotice, setInviteNotice] = useState(null);
  const noticeTimer = useRef(null);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const [codeRes, overviewRes] = await Promise.all([
          subscriptionAPI.getReferralCode(),
          subscriptionAPI.getReferralOverview(),
        ]);
        if (cancelled) return;
        setCode(codeRes.data.code);
        setOverview(overviewRes.data);
        setSentInvites(overviewRes.data.invitesSent || []);
      } catch (err) {
        console.error("Failed to load referral overview:", err);
        if (!cancelled) toast.error("Couldn't load your referral info. Try refreshing.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const shareLink = code ? `${window.location.origin}?ref=${code}` : "";

  const handleCopy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — copy it manually.");
    }
  };

  const handleSendInvite = async () => {
    const trimmedEmail = inviteEmail.trim();
    if (!trimmedEmail) {
      toast.error("Enter an email address first.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setInviteEmailError("Invalid email format");
      return;
    }
    setInviteEmailError("");
    try {
      setSendingInvite(true);
      const res = await subscriptionAPI.sendReferralEmail(trimmedEmail, inviteMessage.trim());
      toast.success(`Invite sent to ${trimmedEmail}`);
      const invite = res?.data?.invite || { _id: trimmedEmail, email: trimmedEmail, lastSentAt: new Date().toISOString() };
      setSentInvites((prev) => [invite, ...prev.filter((i) => i.email !== invite.email)]);
      setInviteNotice(trimmedEmail);
      clearTimeout(noticeTimer.current);
      noticeTimer.current = setTimeout(() => setInviteNotice(null), 3000);
      setInviteEmail("");
      setInviteMessage("");
    } catch (err) {
      console.error("Failed to send referral invite:", err);
      toast.error(err?.response?.data?.error || "Couldn't send the invite. Try again.");
    } finally {
      setSendingInvite(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-sm text-gray-500">
        Loading your referral info…
      </div>
    );
  }

  const summary = overview?.summary || {};
  const program = overview?.program;
  const rewards = overview?.rewards || [];
  const referralsSent = overview?.referralsSent || [];
  const referredBy = overview?.referredBy;
  const topReward = rewards.find((r) => r.status === "available") || rewards[0];
  const rewardLabel = program
    ? program.rewardType === "fixed"
      ? formatPrice(program.rewardValue)
      : `${program.rewardValue}%`
    : "a reward";

  return (
    <div className="space-y-5">
      {/* Stats — same StatTile the Dashboard KPI row uses, so this reads as
          one consistent stat style across the app instead of its own
          bespoke card. */}
      <div className="flex flex-col sm:flex-row items-stretch gap-4">
        <StatTile
          tile={{
            icon: SendIcon,
            iconClass: "text-purple-600",
            label: "Referrals sent",
            value: summary.referralsSent ?? 0,
            subtitle: "Total invitations sent",
          }}
        />
        <StatTile
          tile={{
            icon: Circle,
            iconClass: "text-amber-500",
            label: "Pending",
            value: summary.referralsPending ?? 0,
            subtitle: "Awaiting first payment",
          }}
        />
        <StatTile
          tile={{
            icon: Check,
            iconClass: "text-emerald-600",
            label: "Qualified",
            value: summary.referralsQualified ?? 0,
            subtitle: "Completed first payment",
          }}
        />
        <StatTile
          tile={{
            icon: Gift,
            iconClass: "text-purple-600",
            label: "Rewards available",
            value: summary.rewardsAvailable ?? 0,
            subtitle: "Ready to use",
          }}
        />
      </div>

      {/* Reward banner */}
      {topReward && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-4 flex items-center gap-4">
          <div className="p-2.5 rounded-xl bg-purple-50 text-purple-600 shrink-0">
            <Tag className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide">
              {topReward.status === "available" ? "Available Reward" : "Your reward"}
            </p>
            <p className="text-lg font-bold text-gray-900">{rewardValueLabel(topReward)}</p>
            {topReward.status === "available" ? (
              <>
                <p className="text-xs text-gray-500 mt-0.5">
                  Applies automatically to your next eligible purchase.
                </p>
                {/* BILLING_UX_SPEC.md §2.2 — mandatory eligibility statement,
                    not just existence. Today every reward is usable on every
                    commercial action (no per-reward restriction in the data
                    model), so this list is the same regardless of which
                    reward is shown. */}
                <p className="text-xs text-gray-400 mt-1">
                  Eligible for: Upgrade · Renewal · Add-ons · First payment (if on trial)
                </p>
              </>
            ) : (
              <p className="text-xs text-gray-400">
                Earned {formatDate(topReward.createdAt)}
                {topReward.expiresAt ? ` · Expires ${formatDate(topReward.expiresAt)}` : " · Never expires"}
              </p>
            )}
          </div>
          <StatusPill status={topReward.status} styles={REWARD_STATUS_STYLES} />
        </div>
      )}

      {/* Invite a friend + email */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          {program && (
            <>
              <p className="text-3xl font-bold text-gray-900 mb-2">
                Invite friends, earn{" "}
                <span className="text-[#0085FF]">
                  {program.rewardType === "fixed" ? formatPrice(program.rewardValue) : `${program.rewardValue}%`}
                </span>{" "}
                <span role="img" aria-label="excited">🤩</span>
              </p>
              <p className="text-sm text-gray-500 mb-4">
                Share DataCircles with your network and earn rewards for every friend who joins.
              </p>
            </>
          )}

          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 flex items-center h-[38px] bg-gray-50 border border-gray-200 rounded-full px-4">
              <span className="text-base font-mono font-bold tracking-wider text-gray-900">{code}</span>
            </div>
            <button
              onClick={() => handleCopy(code)}
              title="Copy code"
              className="inline-flex items-center justify-center gap-1.5 h-[38px] bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold px-3.5 rounded-full transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setShareOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 h-[38px] bg-[#0085FF] hover:bg-blue-600 text-white text-sm font-semibold px-4 rounded-full transition-colors whitespace-nowrap"
            >
              <Share2 className="w-3.5 h-3.5" />
              Share
            </button>
          </div>

          {/* BILLING_UX_SPEC.md §3 — found via QA: a referee with no rewards
              of their own (correctly, per the one-benefit-per-participant
              design) saw a bare "Rewards Available: 0" below with nothing
              explaining that they DID get something — a one-time discount,
              not a Reward object. This banner is the fix: distinct copy for
              "your discount is coming" (referral still pending) vs. "you
              already got it" (qualified — payment settled), never referrer-
              side language ("reward," "earn") per §3's own rule. */}
          {referredBy && (
            <div className={`mb-4 rounded-lg px-3.5 py-3 text-xs border ${referredBy.status === "qualified" ? "bg-emerald-50 border-emerald-100 text-emerald-800" : "bg-blue-50 border-blue-100 text-blue-800"}`}>
              <p className="font-semibold uppercase tracking-wide text-[10px] mb-0.5">
                {referredBy.status === "qualified" ? "Referral Discount Applied" : "Upcoming Discount"}
              </p>
              <p>
                You joined via a referral from <span className="font-semibold">{referredBy.referrerOrganization?.name || "another organization"}</span>.
                {" "}
                {referredBy.status === "qualified"
                  ? "The discount was already applied to your first invoice."
                  : "Your discount will be applied automatically to your first payment."}
              </p>
            </div>
          )}

          {/* Invite via Email */}
          <div className="pt-4 border-t border-gray-100">
            <div className="flex items-center gap-2 mb-3">
              <Mail className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-bold text-gray-900">Invite via email</h3>
            </div>
            <div className="space-y-2.5">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => {
                  setInviteEmail(e.target.value);
                  if (inviteEmailError) setInviteEmailError("");
                }}
                placeholder="friend@company.com"
                className={`w-full h-[38px] bg-gray-50 border rounded-full px-3.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 ${
                  inviteEmailError ? "border-red-500" : "border-gray-200"
                }`}
              />
              {inviteEmailError && (
                <p className="text-xs text-red-600">{inviteEmailError}</p>
              )}
              <textarea
                value={inviteMessage}
                onChange={(e) => setInviteMessage(e.target.value)}
                placeholder="Add a personal message (optional)"
                rows={2}
                className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-3.5 py-2.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
              {inviteNotice && (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3.5 py-2.5">
                  <p className="text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" />
                    Invite sent to {inviteNotice}
                  </p>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    They'll show up under “People you've referred” once they sign up with your code.
                  </p>
                </div>
              )}
              <button
                onClick={handleSendInvite}
                disabled={sendingInvite}
                className="inline-flex items-center justify-center gap-1.5 h-[38px] bg-[#0085FF] hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 rounded-full transition-colors w-full sm:w-auto"
              >
                <SendIcon className="w-3.5 h-3.5" />
                {sendingInvite ? "Sending…" : "Send invite"}
              </button>
            </div>
          </div>
        </div>

        {/* Right rail — the list of people who used your code, next to the
            form that creates them. The card is height-matched to the invite
            card (items-stretch + min-h-0 flex column) and the rows scroll
            inside it, so a long list never stretches the row. */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col min-h-0 overflow-hidden">
          <div className="px-5 pt-5 pb-3 shrink-0">
            <h3 className="text-base font-bold text-gray-900">People you've referred</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {referralsSent.length > 0
                ? `${summary.referralsQualified ?? 0} qualified · ${summary.referralsPending ?? 0} pending`
                : sentInvites.length > 0
                ? `${sentInvites.length} invite${sentInvites.length > 1 ? "s" : ""} sent · waiting for sign-up`
                : "Nobody has used your code yet."}
            </p>
          </div>

          {referralsSent.length === 0 && sentInvites.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center px-5 pb-6 text-center">
              <div className="p-2.5 rounded-xl bg-purple-50 text-purple-600 mb-2.5">
                <Gift className="w-4 h-4" />
              </div>
              <p className="text-sm text-gray-500">
                Share your code to start earning {rewardLabel} per friend who subscribes.
              </p>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-gray-100 lg:max-h-none max-h-[320px]">
              {/* Invitation emails from the ReferralInvite log. They are NOT
                  referrals — nobody has signed up yet — so they carry an
                  "Invited" chip rather than a referral status pill. */}
              {sentInvites.map((invite) => (
                <div key={`invite-${invite._id}`} className="px-5 py-3 flex items-center gap-3">
                  <div className="p-1.5 rounded-lg bg-gray-100 text-gray-500 shrink-0">
                    <Mail className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">{invite.email}</p>
                    <p className="text-xs text-gray-400">
                      Invited {formatDate(invite.lastSentAt)}
                      {invite.sendCount > 1 ? ` · ${invite.sendCount} invites` : ""}
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold border bg-gray-100 text-gray-500 border-gray-200">
                    Invited
                  </span>
                </div>
              ))}
              {referralsSent.map((r) => (
                <div key={r._id} className="px-5 py-3 flex items-center gap-3">
                  <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 shrink-0">
                    <Building2 className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {r.referredOrganization?.name || "Organization"}
                    </p>
                    <p className="text-xs text-gray-400">{formatDate(r.createdAt)}</p>
                  </div>
                  <StatusPill status={r.status} styles={REFERRAL_STATUS_STYLES} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* How it works — the program explained once, under the tools that
          use it. */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-5">
        <h2 className="text-xl font-bold text-gray-900 text-center mb-5">How it works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {HOW_IT_WORKS.map((step, i) => (
            <div
              key={step.title}
              className="rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-5 text-center"
            >
              <p className="text-xs font-bold text-[#0085FF] mb-2">0{i + 1}</p>
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-white border border-gray-200 text-gray-500 mb-2.5">
                <step.icon className="w-4 h-4" />
              </span>
              <p className="text-sm font-semibold text-gray-900">{step.title}</p>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">{step.body(rewardLabel)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Rewards list (all, not just top) */}
      {rewards.length > 1 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 pt-4 pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">All rewards</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {rewards.map((r) => {
              const isConsumed = r.status === "consumed" && r.usedOn;
              return (
                <div key={r._id} className="px-6 py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-lg bg-purple-50 text-purple-600">
                        <Tag className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        {/* BILLING_UX_SPEC.md §4 — a consumed reward reads as
                            a receipt (what it was used on, what it saved,
                            when), never "X% off your next purchase" — that
                            phrasing is only true while still available. */}
                        <p className="text-sm font-semibold text-gray-900">
                          {isConsumed ? "Reward Used" : `${rewardValueLabel(r)} off your next purchase`}
                        </p>
                        {!isConsumed && (
                          <p className="text-xs text-gray-400">
                            Earned {formatDate(r.createdAt)}
                            {r.expiresAt ? ` · Expires ${formatDate(r.expiresAt)}` : " · Never expires"}
                          </p>
                        )}
                      </div>
                    </div>
                    <StatusPill status={r.status} styles={REWARD_STATUS_STYLES} />
                  </div>
                  {/* r.usedOn.label/amount are null for rows predating those
                      fields — each row degrades gracefully rather than
                      guessing or crashing. */}
                  {isConsumed && (
                    <div className="mt-2 ml-9 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-gray-400">Applied on</p>
                        <p className="font-medium text-gray-800">{r.usedOn.label || "a purchase"}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Saved</p>
                        <p className="font-medium text-gray-800">{r.usedOn.amount != null ? formatPrice(r.usedOn.amount) : "—"}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Date</p>
                        <p className="font-medium text-gray-800">{formatDate(r.usedOn.date)}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {shareOpen && createPortal(
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/20 backdrop-blur-sm p-4"
          onClick={() => setShareOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">Refer &amp; Earn</h3>
              <button
                type="button"
                onClick={() => setShareOpen(false)}
                className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-2">
              {SHARE_TARGETS.map((target) => {
                return (
                  <button
                    key={target.id}
                    type="button"
                    onClick={() => {
                      if (target.copyFirst) {
                        handleCopy(shareLink);
                      }
                      window.open(
                        target.urlFor(shareLink, "Invite friends, earn rewards with DataCircles!"),
                        "_blank",
                        "noopener,noreferrer"
                      );
                      setShareOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <span className="flex items-center justify-center w-9 h-9 flex-shrink-0 overflow-hidden">
                      <img
                        src={target.image}
                        alt=""
                        className="w-7 h-7 object-contain"
                        style={target.zoom ? { transform: `scale(${target.zoom})` } : undefined}
                      />
                    </span>
                    <span className="flex-1 text-left text-sm font-semibold text-gray-900">{target.label}</span>
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </button>
                );
              })}
            </div>

            <div className="px-5 pb-5">
              <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5">
                <p className="flex-1 text-xs text-gray-600 break-all">{shareLink}</p>
                <button
                  type="button"
                  onClick={() => handleCopy(shareLink)}
                  title="Copy link"
                  className="flex-shrink-0 text-gray-400 hover:text-gray-700 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Referrals;
