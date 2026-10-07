import CalendarIcon from "../components/common/CalendarIcon";
import PdfIcon from "../components/common/PdfIcon";
import CellphoneIcon from "../components/common/CellphoneIcon";
import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Building,
  AlertCircle,
  Package,
  Target,
  CheckCircle2,
  Clock,
  Briefcase,
  TrendingUp,
  MessageSquare,
  Mail,
  Shield,
  Activity,
  IndianRupee,
  PieChart,
  BarChart3,
  User,
  Wallet as WalletIcon,
  Gift,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import toast from "react-hot-toast";
import API, { configureAxios } from "../services/api";
import TeamIcon from "../components/common/TeamIcon";

const WALLET_TYPE_META = {
  CREDIT_PURCHASE: { label: "Purchase", style: "bg-[#E6F7EF] text-[#1FA971] ring-[#B9E7D3]" },
  FREE_CREDIT: { label: "Free credit", style: "bg-sky-50 text-sky-700 ring-sky-200" },
  ADMIN_CREDIT: { label: "Admin credit", style: "bg-violet-50 text-violet-700 ring-violet-200" },
  USAGE_DEBIT: { label: "Usage", style: "bg-slate-100 text-slate-600 ring-slate-200" },
  REFUND: { label: "Refund", style: "bg-[#FDF3E6] text-[#EA9927] ring-[#F7DDB8]" },
  ADJUSTMENT: { label: "Adjustment", style: "bg-[#FDF3E6] text-[#EA9927] ring-[#F7DDB8]" },
};

const formatWalletDateTime = (d) =>
  new Date(d).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

// Wallet is independent of subscription (see walletService.js) — this panel
// is purely a read/grant view scoped to the organization on this page. It
// never touches subscription state.
const OrganizationWalletPanel = ({ organizationId }) => {
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  // Degrade gracefully when the wallet call fails: without this the render
  // below ran `wallet.balance.toFixed(2)` on a null wallet and crashed the
  // whole panel. With it we show an "Unable to load balance" block and the
  // rest of TenantDetails stays usable.
  const [walletError, setWalletError] = useState(false);
  const [grant, setGrant] = useState({ amount: "", reason: "" });
  const [granting, setGranting] = useState(false);

  const loadWallet = async () => {
    setLoading(true);
    setWalletError(false);
    try {
      configureAxios();
      const res = await API.get(`/super-admin/organizations/${organizationId}/wallet`, {
        params: { limit: 10 },
      });
      setWallet(res.data);
    } catch (err) {
      setWalletError(true);
      toast.error(err.response?.data?.error || "Failed to load wallet");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWallet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const handleGrant = async () => {
    if (!(Number(grant.amount) > 0)) return toast.error("Enter a credit amount");
    if (!grant.reason.trim()) return toast.error("A reason is required");

    setGranting(true);
    try {
      configureAxios();
      await API.post(`/super-admin/organizations/${organizationId}/wallet/grant`, {
        amount: Number(grant.amount),
        reason: grant.reason.trim(),
      });
      toast.success("Credits granted");
      setGrant({ amount: "", reason: "" });
      await loadWallet();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to grant credits");
    } finally {
      setGranting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center space-x-3 mb-6">
        <div className="p-3 bg-emerald-100 rounded-lg">
          <WalletIcon className="w-6 h-6 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Wallet</h2>
          <p className="text-sm text-gray-500">Prepaid credits — independent of subscription</p>
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-3">
          <div className="h-20 bg-gray-100 rounded-lg" />
          <div className="h-32 bg-gray-100 rounded-lg" />
        </div>
      ) : walletError || !wallet ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
          <p className="text-sm font-medium text-gray-700">Unable to load balance</p>
          <p className="mt-1 text-xs text-gray-500">
            The wallet service didn&apos;t respond. The rest of this page is unaffected.
          </p>
          <button
            onClick={loadWallet}
            className="mt-4 inline-flex items-center px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg p-4 text-white">
              <p className="text-xs font-medium text-emerald-50 uppercase mb-2">Balance</p>
              <p className="text-3xl font-bold">{wallet.balance.toFixed(2)}</p>
              <p className="text-sm text-emerald-50 mt-1">credits</p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs font-medium text-gray-500 uppercase mb-3 flex items-center gap-1.5">
                <Gift className="w-3.5 h-3.5 text-violet-500" /> Grant credits
              </p>
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    value={grant.amount}
                    onChange={(e) => setGrant({ ...grant, amount: e.target.value })}
                    placeholder="Credits"
                    className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                  />
                  <input
                    type="text"
                    value={grant.reason}
                    onChange={(e) => setGrant({ ...grant, reason: e.target.value })}
                    placeholder="Reason"
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                  />
                </div>
                <button
                  onClick={handleGrant}
                  disabled={granting}
                  className="self-start px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold disabled:opacity-50 hover:bg-violet-700"
                >
                  {granting ? "Granting…" : "Grant Credits"}
                </button>
              </div>
            </div>
          </div>

          {wallet.transactions?.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
                    <th className="py-2 pr-4 font-medium">Credits</th>
                    <th className="py-2 pr-4 font-medium">Type</th>
                    <th className="py-2 pr-4 font-medium">Notes</th>
                    <th className="py-2 pr-4 font-medium text-right">Balance After</th>
                    <th className="py-2 font-medium text-right">Date &amp; Time</th>
                  </tr>
                </thead>
                <tbody>
                  {wallet.transactions.map((tx) => {
                    const meta = WALLET_TYPE_META[tx.type] || {
                      label: tx.type.replace(/_/g, " ").toLowerCase(),
                      style: "bg-gray-100 text-gray-600 ring-gray-200",
                    };
                    const isDebit = tx.amount < 0;
                    return (
                      <tr key={tx._id} className="border-b border-gray-50 last:border-0">
                        <td className="py-2.5 pr-4">
                          <span
                            className={`inline-flex items-center gap-1 font-semibold tabular-nums ${
                              isDebit ? "text-rose-600" : "text-emerald-600"
                            }`}
                          >
                            {isDebit ? (
                              <ArrowDownRight className="w-3.5 h-3.5" />
                            ) : (
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            )}
                            {tx.amount > 0 ? "+" : ""}
                            {tx.amount.toFixed(2)}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${meta.style}`}>
                            {meta.label}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 text-gray-600">{tx.description}</td>
                        <td className="py-2.5 pr-4 text-right font-medium text-gray-900 tabular-nums">
                          {tx.balanceAfter.toFixed(2)}
                        </td>
                        <td className="py-2.5 text-right text-gray-500 whitespace-nowrap">
                          {formatWalletDateTime(tx.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">No wallet activity yet.</p>
          )}
        </>
      )}
    </div>
  );
};

const Shimmer = () => (
  <div className="animate-pulse space-y-6">
    <div className="h-8 bg-gray-200 rounded w-1/3"></div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className="bg-white p-6 rounded-xl border border-gray-200 h-48"
        ></div>
      ))}
    </div>
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {[...Array(8)].map((_, i) => (
        <div
          key={i}
          className="bg-white p-4 rounded-lg border border-gray-200 h-24"
        ></div>
      ))}
    </div>
  </div>
);

const StatCard = ({ label, value, icon: Icon, color, trend }) => (
  <div className="bg-white rounded-lg p-4 border border-gray-200 hover:shadow-md transition-shadow">
    <div className="flex items-center justify-between mb-2">
      <span className="text-sm font-medium text-gray-600">{label}</span>
      <Icon className={`w-5 h-5 ${color}`} />
    </div>
    <p className="text-2xl font-bold text-gray-900">{value}</p>
    {trend && <p className="text-xs text-gray-500 mt-1">{trend}</p>}
  </div>
);

const SummaryCard = ({
  title,
  value,
  subtitle,
  icon: Icon,
  gradient,
  children,
}) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
    <div className="flex items-start justify-between mb-4">
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-600 mb-1">{title}</p>
        <h3 className="text-3xl font-bold text-gray-900">{value}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-2">{subtitle}</p>}
      </div>
      <div className={`p-3 rounded-lg ${gradient}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
    </div>
    {children}
  </div>
);

const StatusBadge = ({ status }) => {
  const config = {
    Active: {
      bg: "bg-green-100",
      text: "text-green-800",
      border: "border-green-200",
      icon: CheckCircle2,
    },
    Inactive: {
      bg: "bg-gray-100",
      text: "text-gray-800",
      border: "border-gray-200",
      icon: Clock,
    },
    Suspended: {
      bg: "bg-red-100",
      text: "text-red-800",
      border: "border-red-200",
      icon: AlertCircle,
    },
    Trial: {
      bg: "bg-blue-100",
      text: "text-blue-800",
      border: "border-blue-200",
      icon: Clock,
    },
  };

  const { bg, text, border, icon: Icon } = config[status] || config.Inactive;

  return (
    <span
      className={`inline-flex items-center px-3 py-1.5 text-sm font-semibold rounded-full ${bg} ${text} border ${border}`}
    >
      <Icon className="w-4 h-4 mr-1.5" />
      {status}
    </span>
  );
};

const TenantDetails = () => {
  const { id } = useParams();
  const [tenantData, setTenantData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showStartTrialModal, setShowStartTrialModal] = useState(false);
  const [startingTrial, setStartingTrial] = useState(false);

  const fetchTenantDetails = async () => {
    try {
      setLoading(true);
      configureAxios();
      const response = await API.get(`/super-admin/tenants/${id}`);
      setTenantData(response.data);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to fetch tenant details");
      toast.error(
        err.response?.data?.error || "Failed to fetch tenant details"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenantDetails();
  }, [id]);

  const handleStartTrial = async () => {
    setStartingTrial(true);
    try {
      const response = await API.post(
        `/super-admin/organizations/${id}/start-trial`
      );
      if (response.data.success) {
        toast.success(response.data.message || "Trial started");
        setShowStartTrialModal(false);
        await fetchTenantDetails();
      }
    } catch (err) {
      if (err.response?.data?.code === "PAID_SUBSCRIPTION_ACTIVE") {
        toast.error(
          "Cannot start a trial — this organization has a live paid subscription."
        );
      } else {
        toast.error(err.response?.data?.error || "Failed to start trial");
      }
    } finally {
      setStartingTrial(false);
    }
  };

  if (loading) return <Shimmer />;

  if (error)
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Error Loading Organization
          </h3>
          <p className="text-gray-600">{error}</p>
          <Link
            to="/super-admin/organizations"
            className="mt-4 inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Back to Organizations
          </Link>
        </div>
      </div>
    );

  const {
    organization,
    subscription,
    stats,
    breakdown,
    users,
    tickets,
    recentInvoices,
    recentDeals,
  } = tenantData;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link
            to="/super-admin/organizations"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {organization.name}
            </h1>
            <p className="text-gray-500 mt-1">
              Complete organization overview and analytics
            </p>
          </div>
        </div>
        <StatusBadge status={organization.status} />
      </div>

      {/* Organization Info & Subscription */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Organization Details */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center space-x-3 mb-6">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Building className="w-6 h-6 text-blue-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">
              Organization Info
            </h2>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                Organization Name
              </p>
              <p className="text-sm font-semibold text-gray-900">
                {organization.name}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                Admin Email
              </p>
              <p className="text-sm text-gray-900 break-all">
                {organization.adminEmail || "N/A"}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                Organization ID
              </p>
              <p className="text-xs text-gray-600 font-mono bg-gray-50 p-2 rounded break-all">
                {organization._id}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                Joined Date
              </p>
              <p className="text-sm text-gray-900">
                {new Date(organization.createdAt).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Subscription Details */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center space-x-3 mb-6">
            <div className="p-3 bg-purple-100 rounded-lg">
              <Package className="w-6 h-6 text-purple-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">
              Subscription Details
            </h2>
          </div>

          {subscription ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-100">
                <p className="text-xs font-medium text-blue-600 uppercase mb-2">
                  Plan
                </p>
                <p className="text-2xl font-bold text-gray-900 capitalize">
                  {subscription.planName}
                </p>
                <p className="text-sm text-gray-600 mt-1 capitalize">
                  {subscription.billingCycle} Billing
                </p>
              </div>

              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-4 border border-green-100">
                <p className="text-xs font-medium text-green-600 uppercase mb-2">
                  Amount
                </p>
                <h6 className="text-2xl font-bold text-gray-900">
                  ₹{subscription.totalAmount?.toLocaleString()}
                </h6>
                <p className="text-sm text-gray-600 mt-1">
                  {subscription.userCount} users × ₹{subscription.pricePerUser}
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs font-medium text-gray-500 uppercase mb-2">
                  Status
                </p>
                <p className="text-lg font-semibold text-gray-900 capitalize">
                  {subscription.status}
                </p>
                {subscription.isTrialActive && subscription.trialEnd && (
                  <p className="text-xs text-orange-600 mt-1">
                    Trial ends:{" "}
                    {new Date(subscription.trialEnd).toLocaleDateString()}
                  </p>
                )}
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs font-medium text-gray-500 uppercase mb-2">
                  Next Billing
                </p>
                <p className="text-lg font-semibold text-gray-900">
                  {subscription.nextBillingDate
                    ? new Date(
                        subscription.nextBillingDate
                      ).toLocaleDateString()
                    : "N/A"}
                </p>
                {subscription.nextBillingDate && (
                  <p className="text-xs text-gray-500 mt-1">
                    {Math.ceil(
                      (new Date(subscription.nextBillingDate) - new Date()) /
                        (1000 * 60 * 60 * 24)
                    )}{" "}
                    days remaining
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="mb-4">
                No active subscription — this organization registered but
                never started a trial.
              </p>
              <button
                onClick={() => setShowStartTrialModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Clock className="w-4 h-4" />
                Start Trial for this Organization
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Wallet — prepaid credits, independent of the subscription above */}
      <OrganizationWalletPanel organizationId={organization._id || id} />

      {/* Financial Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SummaryCard
          title="Total Revenue"
          value={`₹${stats.totalRevenue?.toLocaleString() || "0"}`}
          subtitle="From invoices"
          icon={IndianRupee}
          gradient="bg-gradient-to-br from-green-500 to-green-600"
        />

        <SummaryCard
          title="Deal Pipeline Value"
          value={`₹${stats.totalDealValue?.toLocaleString() || "0"}`}
          subtitle="Active deals"
          icon={Target}
          gradient="bg-gradient-to-br from-blue-500 to-blue-600"
        />

        <SummaryCard
          title="Subscription MRR"
          value={`₹${stats.subscriptionAmount?.toLocaleString() || "0"}`}
          subtitle={
            subscription?.billingCycle === "yearly"
              ? "Annual billing"
              : "Monthly billing"
          }
          icon={TrendingUp}
          gradient="bg-gradient-to-br from-purple-500 to-purple-600"
        />
      </div>

      {/* CRM Statistics */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          CRM Statistics
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Users"
            value={stats.totalUsers || 0}
            icon={TeamIcon}
            color="text-blue-600"
          />
          <StatCard
            label="Companies"
            value={stats.totalCompanies || 0}
            icon={Building}
            color="text-purple-600"
          />
          <StatCard
            label="Contacts"
            value={stats.totalContacts || 0}
            icon={User}
            color="text-green-600"
          />
          <StatCard
            label="Vendors"
            value={stats.totalVendors || 0}
            icon={Package}
            color="text-orange-600"
          />
        </div>
      </div>

      {/* Sales Documents */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Sales Documents
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            label="Invoices"
            value={stats.totalInvoices || 0}
            icon={PdfIcon}
            color="text-blue-600"
          />
          <StatCard
            label="Proforma Invoices"
            value={stats.totalProformaInvoices || 0}
            icon={PdfIcon}
            color="text-indigo-600"
          />
          <StatCard
            label="Quotations"
            value={stats.totalQuotations || 0}
            icon={PdfIcon}
            color="text-purple-600"
          />
          <StatCard
            label="Delivery Challans"
            value={stats.totalDeliveryChallans || 0}
            icon={Package}
            color="text-green-600"
          />
          <StatCard
            label="Deals"
            value={stats.totalDeals || 0}
            icon={Target}
            color="text-orange-600"
          />
        </div>
      </div>

      {/* Activities */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Activities & Communication
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Tasks"
            value={stats.totalTasks || 0}
            icon={CheckCircle2}
            color="text-green-600"
          />
          <StatCard
            label="Meetings"
            value={stats.totalMeetings || 0}
            icon={CalendarIcon}
            color="text-blue-600"
          />
          <StatCard
            label="Call Logs"
            value={stats.totalCallLogs || 0}
            icon={CellphoneIcon}
            color="text-purple-600"
          />
          <StatCard
            label="Support Tickets"
            value={stats.totalTickets || 0}
            icon={MessageSquare}
            color="text-orange-600"
          />
        </div>
      </div>

      {/* Users List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <TeamIcon className="w-5 h-5 text-green-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Organization Users
            </h2>
          </div>
          <span className="text-sm text-gray-500">
            {users?.length || 0} users
          </span>
        </div>

        {users && users.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {users.map((user) => (
              <div
                key={user._id}
                className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg"
              >
                {user.profileUrl ? (
                  <img
                    src={user.profileUrl}
                    alt={user.name}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold">
                    {user.name?.charAt(0).toUpperCase() || "?"}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {user.name}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{user.email}</p>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block ${
                      user.role === "admin"
                        ? "bg-purple-100 text-purple-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {user.role}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400">
            <TeamIcon className="w-12 h-12 mx-auto mb-2 text-gray-300" />
            <p>No users found</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* User Management Audit Log */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <Shield className="w-5 h-5 text-indigo-600" />
              <h2 className="text-lg font-semibold text-gray-900">
                User Management Audit Log
              </h2>
            </div>
            <span className="text-sm text-gray-500">
              {tenantData.auditLogs?.length || 0} events
            </span>
          </div>

          {tenantData.auditLogs && tenantData.auditLogs.length > 0 ? (
            <div className="space-y-4">
              {tenantData.auditLogs.map((log) => {
                const isInvite = log.action === "invite_sent";
                const isRevoked = log.action === "invite_revoked";
                const isDeleted = log.action === "user_deleted";

                const actionConfig = {
                  invite_sent: {
                    color: "bg-blue-100 text-blue-800 border-blue-200",
                    icon: Mail,
                    label: "Invited User",
                  },
                  invite_revoked: {
                    color: "bg-orange-100 text-orange-800 border-orange-200",
                    icon: AlertCircle,
                    label: "Invite Revoked",
                  },
                  user_deleted: {
                    color: "bg-[#FCEAEA] text-[#EA4B4B] border-[#F5C7C7]",
                    icon: User,
                    label: "User Removed",
                  },
                };

                const config =
                  actionConfig[log.action] || actionConfig.invite_sent;
                const Icon = config.icon;

                return (
                  <div
                    key={log._id}
                    className="flex items-start space-x-4 p-4 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
                  >
                    {/* Icon & Action Badge */}
                    <div
                      className={`p-2.5 rounded-full ${config.color} border`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-gray-900">
                          {config.label}
                        </p>
                        <span className="text-xs text-gray-500">
                          {new Date(log.createdAt).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>

                      <p className="text-sm text-gray-700 mt-1">
                        <span className="font-medium">
                          {log.performedBy?.name || "Admin"}
                        </span>{" "}
                        {isInvite && "invited"}
                        {isRevoked && "revoked invite for"}
                        {isDeleted && "removed user"}{" "}
                        <span className="font-medium text-gray-900">
                          {log.targetEmail}
                        </span>
                      </p>

                      {/* Extra Details */}
                      {log.details && (
                        <div className="mt-2 text-xs text-gray-600 space-y-1">
                          {log.details.seatsAvailable !== undefined && (
                            <p>• Seats available at the time</p>
                          )}
                          {log.details.requiresPayment && (
                            <p className="text-orange-700">
                              • Required payment of{" "}
                              <h6>₹{log.details.proratedAmount}</h6> for
                              additional seat
                            </p>
                          )}
                          {log.details.paymentConfirmed && (
                            <p className="text-green-700">
                              • Payment confirmed •{" "}
                              <h6>₹{log.details.amount}</h6> for seat addition
                            </p>
                          )}
                          {log.details.name && (
                            <p>
                              • Removed user:{" "}
                              <span className="font-medium">
                                {log.details.name}
                              </span>{" "}
                              ({log.details.role})
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400">
              <Activity className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-sm">
                No user management activity recorded yet
              </p>
            </div>
          )}
        </div>
      </div>

      {showStartTrialModal && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-[100002]">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Clock className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900">
                Start Free Trial
              </h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              This will start a 7-day free trial for{" "}
              <span className="font-medium">{organization.name}</span>'s
              admin user. This is only possible because the organization
              currently has no subscription record at all.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => setShowStartTrialModal(false)}
                disabled={startingTrial}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleStartTrial}
                disabled={startingTrial}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                {startingTrial ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Starting...</span>
                  </>
                ) : (
                  <>
                    <Clock className="w-4 h-4" />
                    <span>Start Trial</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TenantDetails;
