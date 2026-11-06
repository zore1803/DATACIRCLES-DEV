import PlusIcon from "../common/PlusIcon";
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Database, TrendingUp, Loader2, Wallet as WalletIcon } from "lucide-react";
import API from "../../services/api";
import { walletAPI } from "../../services/walletApi";

// One usage bar shared by seats/storage/email-templates/every capped
// module — same visual treatment regardless of what's being measured.
function UsageBar({ label, used, limit, unit = "", unlimited = false }) {
  const pct = unlimited || !limit ? 0 : Math.min(100, (used / limit) * 100);
  const isNearLimit = !unlimited && pct >= 80;
  const isOverLimit = !unlimited && pct >= 100;

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 sm:p-4 min-w-0">
      {/* Phones are 2 tiles per row, so the label sits above the figure instead of beside it. */}
      <div className="flex flex-col items-start gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-0 mb-2">
        <span className="text-xs sm:text-sm font-medium text-gray-700">{label}</span>
        <span
          className={`text-xs font-semibold ${
            isOverLimit ? "text-red-600" : isNearLimit ? "text-amber-600" : "text-gray-900"
          }`}
        >
          {unlimited ? `${used}${unit} · Unlimited` : `${used}${unit} of ${limit}${unit}`}
        </span>
      </div>
      {!unlimited && (
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              isOverLimit ? "bg-red-500" : isNearLimit ? "bg-amber-500" : "bg-blue-500"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

function DataAdministration() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [walletLoading, setWalletLoading] = useState(true);

  useEffect(() => {
    API.get("/usage-overview")
      .then((res) => setOverview(res.data))
      .catch(() => setOverview(null))
      .finally(() => setLoading(false));

    walletAPI
      .getWallet()
      .then((res) => setWallet(res.data))
      .catch(() => setWallet(null))
      .finally(() => setWalletLoading(false));
  }, []);

  const anyNearOrOverLimit =
    overview &&
    [overview.adminSeats, overview.staffSeats, overview.storage, overview.emailTemplates, ...overview.modules].some(
      (item) => !item.unlimited && item.limit && item.used / item.limit >= 0.8
    );

  return (
    <div className="space-y-6">
      <div className="bg-white border-2 border-gray-200 shadow-xl rounded-2xl overflow-hidden">
        <div className="p-4 sm:p-8 border-b-2 border-gray-100 flex items-start justify-between gap-3 sm:gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="bg-blue-50 p-2 sm:p-2.5 rounded-xl flex-shrink-0">
              <Database className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-xl font-bold text-gray-900">Data Administration</h2>
              <p className="text-xs sm:text-sm text-gray-600">
                {overview ? `You're on the ${overview.planName} plan. ` : ""}
                See what your plan includes and how much of it you've used.
              </p>
            </div>
          </div>

          {/* Wallet balance — same card design as the Wallet page itself
              (gradient, icon badge, decorative circles), just shorter, so
              buying an add-on's cost is visible against what's actually
              available to spend without leaving this page. */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 px-3 sm:px-5 py-2 sm:py-3.5 text-white shadow-sm flex-shrink-0 w-full sm:w-auto">
            <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/10" />
            <div className="pointer-events-none absolute -bottom-8 -left-4 h-16 w-16 rounded-full bg-white/5" />
            <div className="relative flex items-center justify-between sm:justify-start gap-3 sm:gap-4">
              <div className="flex items-center gap-2.5">
                <div className="rounded-lg bg-white/20 p-1.5 backdrop-blur-sm">
                  <WalletIcon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-medium text-emerald-50 leading-tight">Wallet Balance</p>
                  <p className="text-lg sm:text-2xl font-bold leading-tight tracking-tight">
                    {walletLoading ? "…" : wallet ? wallet.balance.toFixed(2) : "—"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => navigate("/settings/wallet")}
                className="flex items-center gap-1 bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white text-[11px] sm:text-xs font-semibold px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg transition-colors flex-shrink-0"
              >
                <PlusIcon className="w-4 h-4" />
                Add Money
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-8">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
          ) : !overview ? (
            <div className="text-center py-16 text-sm text-gray-500">
              Couldn't load usage right now. Try again later.
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <UsageBar
                  label={overview.adminSeats.label}
                  used={overview.adminSeats.used}
                  limit={overview.adminSeats.limit}
                  unlimited={overview.adminSeats.unlimited}
                />
                <UsageBar
                  label={overview.staffSeats.label}
                  used={overview.staffSeats.used}
                  limit={overview.staffSeats.limit}
                  unlimited={overview.staffSeats.unlimited}
                />
                <UsageBar
                  label={overview.storage.label}
                  used={overview.storage.used}
                  limit={overview.storage.limit}
                  unit=" GB"
                  unlimited={overview.storage.unlimited}
                />
                <UsageBar
                  label={overview.emailTemplates.label}
                  used={overview.emailTemplates.used}
                  limit={overview.emailTemplates.limit}
                  unlimited={overview.emailTemplates.unlimited}
                />
                {overview.modules.map((m) => (
                  <UsageBar
                    key={m.key}
                    label={m.label}
                    used={m.used}
                    limit={m.limit}
                    unlimited={m.unlimited}
                  />
                ))}
              </div>

              {anyNearOrOverLimit && (
                <p className="text-xs text-amber-600 font-medium bg-amber-50 border border-amber-200 rounded-xl p-3">
                  One or more of your plan's limits is close to (or at) capacity — buy an add-on or upgrade to keep going.
                </p>
              )}

              <div className="border border-gray-200 rounded-xl p-6">
                <h4 className="font-semibold text-gray-900 text-sm flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-blue-500" />
                  Need more room?
                </h4>
                <p className="text-sm text-gray-600 mb-4">
                  Buy an add-on for your current plan, or upgrade to a plan with higher limits included.
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => navigate("/settings/subscription")}
                    className="bg-[#0085FF] hover:bg-blue-600 text-white px-5 h-[38px] rounded-full font-semibold text-sm transition-colors shadow-sm"
                  >
                    Buy Add-on
                  </button>
                  <button
                    onClick={() => navigate("/settings/subscription")}
                    className="px-5 h-[38px] rounded-full font-medium text-gray-700 bg-white border border-[#1F2937]/10 hover:bg-gray-50 transition-colors text-sm"
                  >
                    Upgrade Plan
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DataAdministration;
