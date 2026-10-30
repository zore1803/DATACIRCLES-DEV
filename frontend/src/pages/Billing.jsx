import CalendarIcon from "../components/common/CalendarIcon";
import DownloadIcon from "../components/common/DownloadIcon";
import React, { useState, useEffect, useRef } from "react";
import { formatNumberToIndian } from "../utils/numberFormatter";
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Users,
  CreditCard,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  TrendingUp,
  IndianRupee,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";
import API, { configureAxios } from "../services/api";
import { useNavigate } from "react-router-dom";

import SearchIcon from "../components/common/SearchIcon";
const Shimmer = () => (
  <div className="animate-pulse space-y-6">
    <div className="h-8 bg-gray-200 rounded w-1/4"></div>
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className="bg-white p-6 rounded-xl border border-gray-200 h-32"
        ></div>
      ))}
    </div>
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="h-64 bg-gray-200 rounded"></div>
    </div>
  </div>
);

const SummaryCard = ({
  title,
  value,
  subtitle,
  icon: Icon,
  gradient,
  textColor,
}) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-lg transition-all duration-300">
    <div className="flex items-start justify-between mb-4">
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-600 mb-1">{title}</p>
        <h3 className={`text-3xl font-bold ${textColor}`}>{value}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-2">{subtitle}</p>}
      </div>
      <div className={`p-3 rounded-lg ${gradient}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
    </div>
  </div>
);

const StatusBadge = ({ status, isTrialActive, trialEnd }) => {
  const isTrialExpiringSoon =
    isTrialActive &&
    trialEnd &&
    (new Date(trialEnd) - new Date()) / (1000 * 60 * 60 * 24) <= 3;

  if (isTrialActive) {
    return (
      <div className="flex flex-col gap-1">
        <span
          className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-full ${
            isTrialExpiringSoon
              ? "bg-orange-100 text-orange-800 border border-orange-200"
              : "bg-blue-100 text-blue-800 border border-blue-200"
          }`}
        >
          <Clock className="w-3 h-3 mr-1" />
          Trial Active
        </span>
        {trialEnd && (
          <span className="text-xs text-gray-500">
            Ends {new Date(trialEnd).toLocaleDateString()}
          </span>
        )}
      </div>
    );
  }

  const statusConfig = {
    active: {
      bg: "bg-green-100",
      text: "text-green-800",
      border: "border-green-200",
      icon: CheckCircle2,
    },
    past_due: {
      bg: "bg-yellow-100",
      text: "text-yellow-800",
      border: "border-yellow-200",
      icon: AlertCircle,
    },
    suspended: {
      bg: "bg-orange-100",
      text: "text-orange-800",
      border: "border-orange-200",
      icon: AlertCircle,
    },
    cancelled: {
      bg: "bg-red-100",
      text: "text-red-800",
      border: "border-red-200",
      icon: XCircle,
    },
    expired: {
      bg: "bg-gray-100",
      text: "text-gray-600",
      border: "border-gray-200",
      icon: XCircle,
    },
  };

  const config = statusConfig[status] || statusConfig.expired;
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-full ${config.bg} ${config.text} border ${config.border}`}
    >
      <Icon className="w-3 h-3 mr-1" />
      {status === 'past_due' ? 'Past Due' : status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

const PaymentStatusBadge = ({ paymentStatus, isPaymentConfirmed }) => {
  if (isPaymentConfirmed) {
    return (
      <span className="inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 border border-green-200">
        <CheckCircle2 className="w-3 h-3 mr-1" />
        Confirmed
      </span>
    );
  }

  const statusConfig = {
    pending_payment: {
      bg: "bg-yellow-100",
      text: "text-yellow-800",
      border: "border-yellow-200",
      icon: Clock,
      label: "Pending",
    },
    payment_completed: {
      bg: "bg-green-100",
      text: "text-green-800",
      border: "border-green-200",
      icon: CheckCircle2,
      label: "Completed",
    },
    payment_failed: {
      bg: "bg-red-100",
      text: "text-red-800",
      border: "border-red-200",
      icon: XCircle,
      label: "Failed",
    },
    payment_cancelled: {
      bg: "bg-gray-100",
      text: "text-gray-800",
      border: "border-gray-200",
      icon: XCircle,
      label: "Cancelled",
    },
  };

  const config = statusConfig[paymentStatus] || statusConfig.pending_payment;
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-full ${config.bg} ${config.text} border ${config.border}`}
    >
      <Icon className="w-3 h-3 mr-1" />
      {config.label}
    </span>
  );
};

const PlanBadge = ({ planName, billingCycle }) => {
  const planColors = {
    starter: "bg-blue-50 text-blue-700 border-blue-200",
    growth: "bg-purple-50 text-purple-700 border-purple-200",
    business: "bg-indigo-50 text-indigo-700 border-indigo-200",
  };

  return (
    <div className="flex flex-col gap-1">
      <span
        className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-md border ${
          planColors[planName] || planColors.starter
        }`}
      >
        {planName.charAt(0).toUpperCase() + planName.slice(1)}
      </span>
      <span className="text-xs text-gray-500 capitalize">{billingCycle}</span>
    </div>
  );
};

const SearchBar = ({ searchTerm, setSearchTerm, loading, searchInputRef }) => {
  const keepFocus = useRef(false);

  const handleChange = (e) => {
    setSearchTerm(e.target.value);
    keepFocus.current = true;
  };

  // Restore focus after debounce
  useEffect(() => {
    if (keepFocus.current && searchInputRef.current) {
      searchInputRef.current.focus();
      keepFocus.current = false;
    }
  }, [searchTerm]);

  return (
    <div className="flex-1 relative">
      <SearchIcon className="absolute left-3 -translate-y-1/2 top-1/2 w-4 h-4 text-[#525866]" />
      <input
        ref={searchInputRef}
        type="text"
        placeholder="Search by organization name..."
        className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        value={searchTerm}
        onChange={handleChange}
        disabled={loading}
      />
      {loading && (
        <div className="absolute right-10 top-1/2 transform -translate-y-1/2">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
        </div>
      )}
      {searchTerm && !loading && (
        <button
          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
          onClick={() => setSearchTerm("")}
        >
          <X className="w-5 h-5" />
        </button>
      )}
    </div>
  );
};

const Billing = () => {
  const [subscriptions, setSubscriptions] = useState([]);
  const [summary, setSummary] = useState({
    totalRevenue: 0,
    activeSubscriptions: 0,
    activeTrials: 0,
    totalSubscriptions: 0,
  });
  const [pagination, setPagination] = useState({
    currentPage: 1,
    limit: 10,
    totalPages: 1,
    totalCount: 0,
    hasNextPage: false,
    hasPrevPage: false,
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState({
    key: "organization",
    direction: "asc",
  });
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const searchInputRef = useRef(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 1000);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset page on filter/search change
  useEffect(() => {
    setPagination((prev) => ({ ...prev, currentPage: 1 }));
  }, [debouncedSearchTerm, statusFilter]);

  // Fetch subscriptions
  useEffect(() => {
    const fetchSubscriptions = async () => {
      try {
        setLoading(true);
        configureAxios();

        const params = new URLSearchParams({
          page: pagination.currentPage,
          limit: pagination.limit,
          sortBy: sortConfig.key,
          sortOrder: sortConfig.direction,
        });

        if (debouncedSearchTerm) {
          params.append("search", debouncedSearchTerm);
        }

        if (statusFilter !== "all") {
          if (statusFilter === "trial") {
            params.append("isTrialActive", "true");
          } else {
            params.append("status", statusFilter);
          }
        }

        const response = await API.get("/super-admin/billing", {
          params: Object.fromEntries(params),
        });

        const subs = response.data.subscriptions || [];
        setSubscriptions(subs);

        // Use server-side summary
        setSummary({
          totalRevenue: response.data.summary?.totalRevenue || 0,
          activeSubscriptions: response.data.summary?.activeSubscriptions || 0,
          activeTrials: response.data.summary?.activeTrials || 0,
          totalSubscriptions: response.data.summary?.totalSubscriptions || 0,
        });

        setPagination((prev) => ({
          ...prev,
          totalPages: response.data.pagination?.totalPages || 1,
          totalCount: response.data.pagination?.totalCount || 0,
          hasNextPage: response.data.pagination?.hasNextPage || false,
          hasPrevPage: response.data.pagination?.hasPrevPage || false,
        }));
      } catch (err) {
        setError(err.response?.data?.error || "Failed to fetch subscriptions");
        toast.error(
          err.response?.data?.error || "Failed to fetch subscriptions"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchSubscriptions();
  }, [
    pagination.currentPage,
    pagination.limit,
    debouncedSearchTerm,
    sortConfig,
    statusFilter,
  ]);

  // Export current page to Excel
  const exportToExcel = () => {
    try {
      const exportData = subscriptions.map((sub) => ({
        Organization: sub.organization?.name || "N/A",
        Plan: sub.planName
          ? sub.planName.charAt(0).toUpperCase() + sub.planName.slice(1)
          : "N/A",
        "Billing Cycle": sub.billingCycle
          ? sub.billingCycle.charAt(0).toUpperCase() + sub.billingCycle.slice(1)
          : "N/A",
        "User Count": sub.userCount || 0,
        "Price Per User": `₹${sub.pricePerUser || 0}`,
        "Total Amount": `₹${formatNumberToIndian(sub.totalAmount || 0)}`,
        // appStatus is canonical (never the legacy `status`, which stays
        // permanently "created" under CAW — see subscriptionHelpers.js).
        Status: sub.appStatus
          ? sub.appStatus.charAt(0).toUpperCase() + sub.appStatus.slice(1)
          : "N/A",
        "Payment Status": sub.isPaymentConfirmed
          ? "Confirmed"
          : sub.paymentStatus || "N/A",
        "Trial End Date": sub.trialEnd
          ? new Date(sub.trialEnd).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "N/A",
        "Next Billing Date": sub.nextBillingDate
          ? new Date(sub.nextBillingDate).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "N/A",
        "Cancel At Period End": sub.cancelAtPeriodEnd ? "Yes" : "No",
        "Created Date": sub.createdAt
          ? new Date(sub.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "N/A",
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);

      // Set column widths
      worksheet["!cols"] = [
        { wch: 30 }, // Organization
        { wch: 12 }, // Plan
        { wch: 15 }, // Billing Cycle
        { wch: 12 }, // User Count
        { wch: 15 }, // Price Per User
        { wch: 18 }, // Total Amount
        { wch: 15 }, // Status
        { wch: 18 }, // Payment Status
        { wch: 18 }, // Trial End Date
        { wch: 20 }, // Next Billing Date
        { wch: 20 }, // Cancel At Period End
        { wch: 18 }, // Created Date
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Subscriptions");

      const fileName = `billing_export_${
        new Date().toISOString().split("T")[0]
      }.xlsx`;
      XLSX.writeFile(workbook, fileName);

      toast.success(`Exported ${exportData.length} subscriptions to Excel`);
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export data");
    }
  };

  // Export all filtered data to Excel
  const exportAllToExcel = async () => {
    try {
      setLoading(true);
      configureAxios();

      const params = new URLSearchParams({
        limit: 999999,
        sortBy: sortConfig.key,
        sortOrder: sortConfig.direction,
      });

      if (debouncedSearchTerm) {
        params.append("search", debouncedSearchTerm);
      }

      if (statusFilter !== "all") {
        if (statusFilter === "trial") {
          params.append("isTrialActive", "true");
        } else {
          params.append("status", statusFilter);
        }
      }

      const response = await API.get("/super-admin/billing", {
        params: Object.fromEntries(params),
      });
      const allSubs = response.data.subscriptions || [];

      const exportData = allSubs.map((sub) => ({
        Organization: sub.organization?.name || "N/A",
        Plan: sub.planName
          ? sub.planName.charAt(0).toUpperCase() + sub.planName.slice(1)
          : "N/A",
        "Billing Cycle": sub.billingCycle
          ? sub.billingCycle.charAt(0).toUpperCase() + sub.billingCycle.slice(1)
          : "N/A",
        "User Count": sub.userCount || 0,
        "Price Per User": `₹${sub.pricePerUser || 0}`,
        "Total Amount": `₹${formatNumberToIndian(sub.totalAmount || 0)}`,
        // appStatus is canonical (never the legacy `status`, which stays
        // permanently "created" under CAW — see subscriptionHelpers.js).
        Status: sub.appStatus
          ? sub.appStatus.charAt(0).toUpperCase() + sub.appStatus.slice(1)
          : "N/A",
        "Payment Status": sub.isPaymentConfirmed
          ? "Confirmed"
          : sub.paymentStatus || "N/A",
        "Trial End Date": sub.trialEnd
          ? new Date(sub.trialEnd).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "N/A",
        "Next Billing Date": sub.nextBillingDate
          ? new Date(sub.nextBillingDate).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "N/A",
        "Cancel At Period End": sub.cancelAtPeriodEnd ? "Yes" : "No",
        "Created Date": sub.createdAt
          ? new Date(sub.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "N/A",
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      worksheet["!cols"] = [
        { wch: 30 },
        { wch: 12 },
        { wch: 15 },
        { wch: 12 },
        { wch: 15 },
        { wch: 18 },
        { wch: 15 },
        { wch: 18 },
        { wch: 18 },
        { wch: 20 },
        { wch: 20 },
        { wch: 18 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Subscriptions");

      const fileName = `all_billing_export_${
        new Date().toISOString().split("T")[0]
      }.xlsx`;
      XLSX.writeFile(workbook, fileName);

      toast.success(`Exported ${exportData.length} subscriptions to Excel`);
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export all data");
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const SortableHeader = ({ field, children }) => (
    <th
      className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none transition-colors"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        <div className="flex flex-col">
          <ChevronUp
            className={`w-3 h-3 ${
              sortConfig.key === field && sortConfig.direction === "asc"
                ? "text-blue-600"
                : "text-gray-400"
            }`}
          />
          <ChevronDown
            className={`w-3 h-3 -mt-1 ${
              sortConfig.key === field && sortConfig.direction === "desc"
                ? "text-blue-600"
                : "text-gray-400"
            }`}
          />
        </div>
      </div>
    </th>
  );

  const handlePageChange = (newPage) => {
    if (
      newPage >= 1 &&
      newPage <= pagination.totalPages &&
      newPage !== pagination.currentPage
    ) {
      setPagination((prev) => ({ ...prev, currentPage: newPage }));
    }
  };

  const handleLimitChange = (newLimit) => {
    setPagination((prev) => ({ ...prev, limit: newLimit, currentPage: 1 }));
  };

  const handleViewDetails = (sub) => {
    toast.success(
      `Viewing details for ${sub.organization?.name || "subscription"}`
    );
    navigate(`/super-admin/billing/${sub._id}`);
  };

  if (loading && subscriptions.length === 0) return <Shimmer />;

  if (error && subscriptions.length === 0)
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Error Loading Billing Data
          </h3>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Billing & Subscriptions
          </h1>
          <p className="text-gray-500 mt-1">
            Manage subscription plans and billing across all tenants
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Export Dropdown */}
          <div className="relative group">
            <button
              className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading}
            >
              <DownloadIcon className="w-4 h-4" />
              <span className="font-medium">Export</span>
              <ChevronDown className="w-4 h-4" />
            </button>

            {/* Dropdown Menu */}
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
              <button
                onClick={exportToExcel}
                disabled={loading || subscriptions.length === 0}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100 disabled:opacity-50 disabled:cursor-not-allowed rounded-t-lg"
              >
                <div className="font-medium text-gray-900 text-sm">
                  Export Current Page
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {subscriptions.length}{" "}
                  {subscriptions.length === 1
                    ? "subscription"
                    : "subscriptions"}
                </div>
              </button>

              <button
                onClick={exportAllToExcel}
                disabled={loading || pagination.totalCount === 0}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed rounded-b-lg"
              >
                <div className="font-medium text-gray-900 text-sm">
                  Export All Filtered Data
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {pagination.totalCount} total{" "}
                  {pagination.totalCount === 1
                    ? "subscription"
                    : "subscriptions"}
                </div>
              </button>
            </div>
          </div>

          {/* Last Updated */}
          <div className="text-right">
            <p className="text-sm text-gray-500">Last Updated</p>
            <p className="text-sm font-semibold text-gray-900">
              {new Date().toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <SummaryCard
          title="Total Subscriptions"
          value={summary.totalSubscriptions}
          subtitle="All subscription records"
          icon={Users}
          gradient="bg-gradient-to-br from-blue-500 to-blue-600"
          textColor="text-gray-900"
        />
        <SummaryCard
          title="Active Subscriptions"
          value={summary.activeSubscriptions}
          subtitle="Paying customers"
          icon={CheckCircle2}
          gradient="bg-gradient-to-br from-green-500 to-green-600"
          textColor="text-gray-900"
        />
        <SummaryCard
          title="Active Trials"
          value={summary.activeTrials}
          subtitle="Trial period subscriptions"
          icon={Clock}
          gradient="bg-gradient-to-br from-orange-500 to-orange-600"
          textColor="text-gray-900"
        />
        <SummaryCard
          title="Total Revenue"
          value={`₹${formatNumberToIndian(summary.totalRevenue)}`}
          subtitle="Across all tenants"
          icon={IndianRupee}
          gradient="bg-gradient-to-br from-purple-500 to-purple-600"
          textColor="text-gray-900"
        />
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col md:flex-row gap-4">
            <SearchBar
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              loading={loading}
              searchInputRef={searchInputRef}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              disabled={loading}
            >
              <option value="all">All Status</option>
              <option value="trial">Trial</option>
              <option value="active">Active</option>
              <option value="past_due">Past Due</option>
              <option value="suspended">Suspended</option>
              <option value="cancelled">Cancelled</option>
              <option value="expired">Expired</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <SortableHeader field="organization">
                  Organization
                </SortableHeader>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Plan & Cycle
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Users & Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Payment
                </th>
                <SortableHeader field="nextBillingDate">
                  Next Billing
                </SortableHeader>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {loading && subscriptions.length === 0 && (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center">
                    <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div>
                    <p className="text-gray-600">Loading subscriptions...</p>
                  </td>
                </tr>
              )}

              {!loading && subscriptions.length === 0 && (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center">
                    <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500 text-lg">
                      No subscriptions found
                    </p>
                    <p className="text-gray-400 text-sm mt-1">
                      Try adjusting your search or filters
                    </p>
                  </td>
                </tr>
              )}

              {subscriptions.map((sub) => (
                <tr
                  key={sub._id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <h6 className="text-sm font-semibold text-gray-900">
                        {sub.organization?.name || "N/A"}
                      </h6>
                      {sub.cancelAtPeriodEnd && (
                        <span className="text-xs text-red-600 mt-1 flex items-center">
                          <XCircle className="w-3 h-3 mr-1" />
                          Cancels at period end
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <PlanBadge
                      planName={sub.planName}
                      billingCycle={sub.billingCycle}
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <h6 className="text-sm font-semibold text-gray-900">
                        ₹{formatNumberToIndian(sub.totalAmount || 0)}
                      </h6>
                      <span className="text-xs text-gray-500 mt-1">
                        {sub.userCount} users × ₹{sub.pricePerUser}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge
                      status={sub.appStatus}
                      isTrialActive={sub.isTrialActive}
                      trialEnd={sub.trialEnd}
                    />
                  </td>
                  <td className="px-6 py-4">
                    <PaymentStatusBadge
                      paymentStatus={sub.paymentStatus}
                      isPaymentConfirmed={sub.isPaymentConfirmed}
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      {sub.nextBillingDate ? (
                        <>
                          <span className="text-sm text-gray-900 flex items-center">
                            <CalendarIcon className="w-3 h-3 mr-1 text-gray-400" />
                            {new Date(sub.nextBillingDate).toLocaleDateString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              }
                            )}
                          </span>
                          <span className="text-xs text-gray-500 mt-1">
                            {Math.ceil(
                              (new Date(sub.nextBillingDate) - new Date()) /
                                (1000 * 60 * 60 * 24)
                            )}{" "}
                            days
                          </span>
                        </>
                      ) : (
                        <span className="text-sm text-gray-400">N/A</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleViewDetails(sub)}
                      className="text-blue-600 hover:text-blue-800 font-medium text-sm hover:underline transition-colors"
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="bg-gray-50 px-6 py-4 flex flex-col sm:flex-row items-center justify-between border-t border-gray-200 gap-4">
          <div className="flex items-center space-x-4">
            <p className="text-sm text-gray-700">
              Showing{" "}
              <span className="font-medium">
                {(pagination.currentPage - 1) * pagination.limit + 1}
              </span>{" "}
              to{" "}
              <span className="font-medium">
                {Math.min(
                  pagination.currentPage * pagination.limit,
                  pagination.totalCount
                )}
              </span>{" "}
              of <span className="font-medium">{pagination.totalCount}</span>{" "}
              results
            </p>
            <select
              value={pagination.limit}
              onChange={(e) => handleLimitChange(parseInt(e.target.value))}
              className="select-chevron border border-gray-300 rounded-full px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              disabled={loading}
            >
              <option value={10}>10 per page</option>
              <option value={20}>20 per page</option>
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => handlePageChange(pagination.currentPage - 1)}
              disabled={!pagination.hasPrevPage || loading}
              className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <div className="flex items-center space-x-1">
              {Array.from(
                { length: Math.min(pagination.totalPages, 5) },
                (_, i) => {
                  let pageNum;
                  if (pagination.totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (pagination.currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (
                    pagination.currentPage >=
                    pagination.totalPages - 2
                  ) {
                    pageNum = pagination.totalPages - 4 + i;
                  } else {
                    pageNum = pagination.currentPage - 2 + i;
                  }

                  return (
                    <button
                      key={pageNum}
                      onClick={() => handlePageChange(pageNum)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        pageNum === pagination.currentPage
                          ? "bg-blue-600 text-white"
                          : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
                      }`}
                      disabled={loading}
                    >
                      {pageNum}
                    </button>
                  );
                }
              )}
            </div>

            <button
              onClick={() => handlePageChange(pagination.currentPage + 1)}
              disabled={!pagination.hasNextPage || loading}
              className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Billing;
