// components/settings/Referrals.jsx
//
// Org-facing referral dashboard — code, share link, stats, and reward
// history. Read-only: every number here comes straight from
// GET /subscription/referrals/overview (utils/referralUtils.js
// buildReferralOverview on the backend) — this component never computes a
// discount, eligibility, or status itself (ARCHITECTURE.md §8 rule #3/#19
// of REFERRAL_SYSTEM_DESIGN.md — frontend never calculates referral math).
import React, { useEffect, useState } from "react";
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
} from "lucide-react";
import toast from "react-hot-toast";
import { subscriptionAPI } from "../../services/subscriptionApi";
import { formatPrice } from "../../utils/pricingSnapshot";
import StatTile from "../common/StatTile";
import TeamIcon from "../common/TeamIcon";

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
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteEmailError, setInviteEmailError] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [sendingInvite, setSendingInvite] = useState(false);

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
      await subscriptionAPI.sendReferralEmail(trimmedEmail, inviteMessage.trim());
      toast.success(`Invite sent to ${trimmedEmail}`);
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
  const rewards = overview?.rewards || [];
  const referralsSent = overview?.referralsSent || [];
  const referredBy = overview?.referredBy;
  const topReward = rewards.find((r) => r.status === "available") || rewards[0];

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

      {/* Two-column: invite / referred people */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* Invite a friend + email */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-blue-50 text-[#0085FF]">
              <TeamIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Invite a friend</h2>
              <p className="text-xs text-gray-500">Share your code — when they become a paying customer, you both earn a reward.</p>
            </div>
          </div>

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
              onClick={() => handleCopy(shareLink)}
              className="inline-flex items-center justify-center gap-1.5 h-[38px] bg-[#0085FF] hover:bg-blue-600 text-white text-sm font-semibold px-4 rounded-full transition-colors whitespace-nowrap"
            >
              <Share2 className="w-3.5 h-3.5" />
              Copy share link
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

        {/* People you've referred */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 pt-5 pb-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-50 text-[#0085FF]">
              <TeamIcon className="w-4 h-4" />
            </div>
            <h2 className="text-base font-bold text-gray-900">People you've referred</h2>
          </div>

          {referralsSent.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-gray-500">Nobody has used your code yet — share it to start earning rewards.</p>
          ) : (
            <>
              <div className="hidden sm:grid grid-cols-[1fr_auto_auto] gap-4 px-6 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <span>Company</span>
                <span>Joined</span>
                <span className="text-right">Status</span>
              </div>
              <div className="divide-y divide-gray-100">
                {referralsSent.map((r) => (
                  <div key={r._id} className="px-6 py-3.5 grid grid-cols-[1fr_auto_auto] items-center gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 shrink-0">
                        <Building2 className="w-3.5 h-3.5" />
                      </div>
                      <p className="text-sm font-semibold text-gray-900 truncate">{r.referredOrganization?.name || "Organization"}</p>
                    </div>
                    <div className="text-xs text-gray-400 whitespace-nowrap">
                      {formatDate(r.createdAt)}
                      {r.qualifiedAt && <div>Qualified {formatDate(r.qualifiedAt)}</div>}
                    </div>
                    <div className="justify-self-end">
                      <StatusPill status={r.status} styles={REFERRAL_STATUS_STYLES} />
                    </div>
                  </div>
                ))}
              </div>
              <button className="w-full flex items-center justify-center gap-1 px-6 py-3.5 text-sm font-semibold text-purple-600 hover:bg-purple-50 transition-colors border-t border-gray-100">
                View all referrals <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </>
          )}
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
    </div>
  );
};

export default Referrals;
