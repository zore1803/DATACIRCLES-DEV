import CalendarIcon from "../components/common/CalendarIcon";
import DeleteIcon from "../components/common/DeleteIcon";
import DownloadIcon from "../components/common/DownloadIcon";
import React, { useState, useEffect, useRef } from "react";
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Building,
  CheckCircle2,
  AlertCircle,
  Clock,
  Shield,
  Package,
  X,
  IndianRupeeIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";
import API, { configureAxios } from "../services/api";

import SearchIcon from "../components/common/SearchIcon";
import FilterIcon from "../components/common/FilterIcon";
import TeamIcon from "../components/common/TeamIcon";
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

const SummaryCard = ({ title, value, subtitle, icon: Icon, gradient }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-lg transition-all duration-300">
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
      className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-full ${bg} ${text} border ${border}`}
    >
      <Icon className="w-3 h-3 mr-1" />
      {status}
    </span>
  );
};

const PlanBadge = ({ plan }) => {
  const config = {
    starter: {
      bg: "bg-blue-50",
      text: "text-blue-700",
      border: "border-blue-200",
    },
    growth: {
      bg: "bg-purple-50",
      text: "text-purple-700",
      border: "border-purple-200",
    },
    business: {
      bg: "bg-indigo-50",
      text: "text-indigo-700",
      border: "border-indigo-200",
    },
  };

  const { bg, text, border } = config[plan?.toLowerCase()] || config.starter;

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-md border ${bg} ${text} ${border}`}
    >
      <Package className="w-3 h-3 mr-1" />
      {plan || "N/A"}
    </span>
  );
};

const Tenants = () => {
  const [tenants, setTenants] = useState([]);
  const [summary, setSummary] = useState({
    totalTenants: 0,
    activeTenants: 0,
    totalRevenue: 0,
    totalUsers: 0,
  });
  const [pagination, setPagination] = useState({
    currentPage: 1,
    limit: 10,
    totalPages: 1,
    totalCount: 0,
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState({
    key: "name",
    direction: "asc",
  });
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [deleteModal, setDeleteModal] = useState(false);
  const [orgToDelete, setOrgToDelete] = useState(null);

  const searchInputRef = useRef(null);
  const shouldMaintainFocus = useRef(false);

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      shouldMaintainFocus.current = false;
    }, 1000);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Maintain focus after debounce
  useEffect(() => {
    if (shouldMaintainFocus.current && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [tenants]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPagination((prev) => ({ ...prev, currentPage: 1 }));
  }, [debouncedSearchTerm, statusFilter, planFilter]);

  useEffect(() => {
    const fetchTenants = async () => {
      try {
        setLoading(true);
        configureAxios();

        const params = {
          page: pagination.currentPage,
          limit: pagination.limit,
          search: debouncedSearchTerm,
          sortBy: sortConfig.key,
          sortOrder: sortConfig.direction,
        };

        if (statusFilter !== "all") {
          params.status = statusFilter;
        }

        if (planFilter !== "all") {
          params.plan = planFilter;
        }

        const response = await API.get("/super-admin/tenants", { params });

        setTenants(response.data.tenants || []);
        setPagination((prev) => ({
          ...prev,
          totalPages: response.data.pagination?.totalPages || 1,
          totalCount: response.data.pagination?.totalCount || 0,
          hasNextPage: response.data.pagination?.hasNextPage || false,
          hasPrevPage: response.data.pagination?.hasPrevPage || false,
        }));

        // Calculate summary
        const tenantsData = response.data.tenants || [];
        const active = tenantsData.filter((t) => t.status === "Active").length;
        const totalRev = tenantsData.reduce(
          (sum, t) => sum + (t.subscriptionAmount || 0),
          0
        );
        const totalUsrs = tenantsData.reduce(
          (sum, t) => sum + (t.users || 0),
          0
        );

        setSummary({
          totalTenants: response.data.pagination?.totalCount || 0,
          activeTenants: active,
          totalRevenue: totalRev,
          totalUsers: totalUsrs,
        });
      } catch (err) {
        setError(err.response?.data?.error || "Failed to fetch tenants");
        toast.error(err.response?.data?.error || "Failed to fetch tenants");
      } finally {
        setLoading(false);
      }
    };

    fetchTenants();
  }, [
    pagination.currentPage,
    pagination.limit,
    debouncedSearchTerm,
    sortConfig.key,
    sortConfig.direction,
    statusFilter,
    planFilter,
  ]);

  const handleDeleteOrganization = async () => {
    try {
      setLoading(true);
      configureAxios();

      const response = await API.delete(
        `/super-admin/tenants/${orgToDelete._id}`
      );

      toast.success(
        `Organization "${orgToDelete.name}" and all associated data deleted successfully`
      );
      setDeleteModal(false);
      setOrgToDelete(null);

      // Refresh the tenants list
      const params = {
        page: pagination.currentPage,
        limit: pagination.limit,
        search: debouncedSearchTerm,
        sortBy: sortConfig.key,
        sortOrder: sortConfig.direction,
      };

      if (statusFilter !== "all") params.status = statusFilter;
      if (planFilter !== "all") params.plan = planFilter;

      const refreshResponse = await API.get("/super-admin/tenants", { params });
      setTenants(refreshResponse.data.tenants || []);
      setPagination((prev) => ({
        ...prev,
        totalPages: refreshResponse.data.pagination?.totalPages || 1,
        totalCount: refreshResponse.data.pagination?.totalCount || 0,
      }));
    } catch (error) {
      console.error("Delete error:", error);
      toast.error(
        error.response?.data?.message || "Failed to delete organization"
      );
    } finally {
      setLoading(false);
    }
  };

  // Export current page to Excel
  const exportToExcel = () => {
    try {
      const exportData = tenants.map((tenant) => ({
        "Organization Name": tenant.name || "N/A",
        "Organization ID": tenant._id || "N/A",
        "Admin Email": tenant.adminEmail || "N/A",
        Plan: tenant.plan
          ? tenant.plan.charAt(0).toUpperCase() + tenant.plan.slice(1)
          : "N/A",
        "User Count": tenant.users || 0,
        "Subscription Amount": `₹${(
          tenant.subscriptionAmount || 0
        ).toLocaleString()}`,
        Status: tenant.status || "N/A",
        "Created Date": tenant.createdAt
          ? new Date(tenant.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "N/A",
        "Last Updated": tenant.updatedAt
          ? new Date(tenant.updatedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "N/A",
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);

      // Set column widths
      worksheet["!cols"] = [
        { wch: 30 }, // Organization Name
        { wch: 25 }, // Organization ID
        { wch: 30 }, // Admin Email
        { wch: 15 }, // Plan
        { wch: 12 }, // User Count
        { wch: 20 }, // Subscription Amount
        { wch: 12 }, // Status
        { wch: 18 }, // Created Date
        { wch: 18 }, // Last Updated
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Organizations");

      const fileName = `organizations_export_${
        new Date().toISOString().split("T")[0]
      }.xlsx`;
      XLSX.writeFile(workbook, fileName);

      toast.success(`Exported ${exportData.length} organizations to Excel`);
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

      const params = {
        limit: 999999,
        search: debouncedSearchTerm,
        sortBy: sortConfig.key,
        sortOrder: sortConfig.direction,
      };

      if (statusFilter !== "all") {
        params.status = statusFilter;
      }

      if (planFilter !== "all") {
        params.plan = planFilter;
      }

      const response = await API.get("/super-admin/tenants", { params });
      const allTenants = response.data.tenants || [];

      const exportData = allTenants.map((tenant) => ({
        "Organization Name": tenant.name || "N/A",
        "Organization ID": tenant._id || "N/A",
        "Admin Email": tenant.adminEmail || "N/A",
        Plan: tenant.plan
          ? tenant.plan.charAt(0).toUpperCase() + tenant.plan.slice(1)
          : "N/A",
        "User Count": tenant.users || 0,
        "Subscription Amount": `₹${(
          tenant.subscriptionAmount || 0
        ).toLocaleString()}`,
        Status: tenant.status || "N/A",
        "Created Date": tenant.createdAt
          ? new Date(tenant.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "N/A",
        "Last Updated": tenant.updatedAt
          ? new Date(tenant.updatedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "N/A",
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      worksheet["!cols"] = [
        { wch: 30 },
        { wch: 25 },
        { wch: 30 },
        { wch: 15 },
        { wch: 12 },
        { wch: 20 },
        { wch: 12 },
        { wch: 18 },
        { wch: 18 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Organizations");

      const fileName = `all_organizations_export_${
        new Date().toISOString().split("T")[0]
      }.xlsx`;
      XLSX.writeFile(workbook, fileName);

      toast.success(`Exported ${exportData.length} organizations to Excel`);
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export all data");
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (key) => {
    setSortConfig({
      key,
      direction:
        sortConfig.key === key && sortConfig.direction === "asc"
          ? "desc"
          : "asc",
    });
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
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      setPagination((prev) => ({ ...prev, currentPage: newPage }));
    }
  };

  const handleLimitChange = (newLimit) => {
    setPagination((prev) => ({ ...prev, limit: newLimit, currentPage: 1 }));
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    shouldMaintainFocus.current = true;
  };

  const handleSuspend = (tenant) => {
    toast.success(`Suspend action for: ${tenant.name}`);
    // Implement suspend logic
  };

  const startIndex = (pagination.currentPage - 1) * pagination.limit;
  const endIndex = startIndex + pagination.limit;

  if (loading && tenants.length === 0) return <Shimmer />;

  if (error && tenants.length === 0)
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Error Loading Tenants
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
          <h1 className="text-3xl font-bold text-gray-900">Organizations</h1>
          <p className="text-gray-500 mt-1">
            Manage all tenant organizations and their subscriptions
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
                disabled={loading || tenants.length === 0}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100 disabled:opacity-50 disabled:cursor-not-allowed rounded-t-lg"
              >
                <div className="font-medium text-gray-900 text-sm">
                  Export Current Page
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {tenants.length}{" "}
                  {tenants.length === 1 ? "organization" : "organizations"}
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
                    ? "organization"
                    : "organizations"}
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
      {/* <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <SummaryCard
          title="Total Organizations"
          value={summary.totalTenants}
          subtitle="All registered tenants"
          icon={Building}
          gradient="bg-gradient-to-br from-blue-500 to-blue-600"
        />
        
        <SummaryCard
          title="Active Organizations"
          value={summary.activeTenants}
          subtitle="Currently active"
          icon={CheckCircle2}
          gradient="bg-gradient-to-br from-green-500 to-green-600"
        />
        
        <SummaryCard
          title="Total Revenue"
          value={`₹${summary.totalRevenue.toLocaleString()}`}
          subtitle="From subscriptions"
          icon={IndianRupeeIcon}
          gradient="bg-gradient-to-br from-purple-500 to-purple-600"
        />
        
        <SummaryCard
          title="Total Users"
          value={summary.totalUsers}
          subtitle="Across all organizations"
          icon={TeamIcon}
          gradient="bg-gradient-to-br from-orange-500 to-orange-600"
        />
      </div> */}

      {/* Filters and Search */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <SearchIcon className="absolute left-3 -translate-y-1/2 top-1/2 w-4 h-4 text-[#525866]" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search organizations..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={searchTerm}
                onChange={handleSearchChange}
                disabled={loading}
              />
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                disabled={loading}
              >
                <option value="all">All Status</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Suspended">Suspended</option>
                <option value="Trial">Trial</option>
              </select>

              {/* Plan Filter */}
              <select
                value={planFilter}
                onChange={(e) => setPlanFilter(e.target.value)}
                className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                disabled={loading}
              >
                <option value="all">All Plans</option>
                <option value="starter">Starter</option>
                <option value="growth">Growth</option>
                <option value="business">Business</option>
              </select>
            </div>
          </div>

          {/* Active Filters Display */}
          {(statusFilter !== "all" || planFilter !== "all") && (
            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-200">
              <FilterIcon size={16} />
              <span className="text-sm text-gray-600">Active Filters:</span>
              {statusFilter !== "all" && (
                <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                  Status: {statusFilter}
                  <button
                    onClick={() => setStatusFilter("all")}
                    className="ml-1.5 hover:text-blue-900"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {planFilter !== "all" && (
                <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                  Plan: {planFilter}
                  <button
                    onClick={() => setPlanFilter("all")}
                    className="ml-1.5 hover:text-purple-900"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <SortableHeader field="name">Organization</SortableHeader>
                <SortableHeader field="adminEmail">Admin Email</SortableHeader>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Plan & Users
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Revenue
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Status
                </th>
                <SortableHeader field="createdAt">Joined</SortableHeader>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {loading && (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center">
                    <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div>
                    <p className="text-gray-600">Loading organizations...</p>
                  </td>
                </tr>
              )}

              {!loading && tenants.length === 0 && (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center">
                    <Building className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500 text-lg">
                      No organizations found
                    </p>
                    <p className="text-gray-400 text-sm mt-1">
                      {statusFilter !== "all" ||
                      planFilter !== "all" ||
                      searchTerm
                        ? "Try adjusting your search or filters"
                        : "No organizations available"}
                    </p>
                  </td>
                </tr>
              )}

              {!loading &&
                tenants.map((tenant) => (
                  <tr
                    key={tenant._id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    {/* Organization */}
                    <td className="px-6 py-4">
                      <Link
                        to={`/super-admin/organizations/${tenant._id}`}
                        className="flex items-center space-x-3 group"
                      >
                        <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                          <span className="text-white font-bold text-sm">
                            {tenant.name?.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-blue-600 group-hover:text-blue-800">
                            {tenant.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            ID: {tenant._id.slice(-8)}
                          </p>
                        </div>
                      </Link>
                    </td>

                    {/* Admin Email */}
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-900">
                        {tenant.adminEmail || "N/A"}
                      </span>
                    </td>

                    {/* Plan & Users */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col space-y-1">
                        <PlanBadge plan={tenant.plan} />
                        <div className="flex items-center text-xs text-gray-500">
                          <TeamIcon className="w-3 h-3 mr-1" />
                          {tenant.users || 0} users
                        </div>
                      </div>
                    </td>

                    {/* Revenue */}
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <IndianRupeeIcon className="w-4 h-4 text-green-600 mr-1" />
                        <span className="text-sm font-semibold text-gray-900">
                          {(tenant.subscriptionAmount || 0).toLocaleString()}
                        </span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4">
                      <StatusBadge status={tenant.status} />
                    </td>

                    {/* Joined */}
                    <td className="px-6 py-4">
                      <div className="flex items-center text-sm text-gray-900">
                        <CalendarIcon className="w-3 h-3 mr-1 text-gray-400" />
                        {new Date(tenant.createdAt).toLocaleDateString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          }
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-2">
                        <Link
                          to={`/super-admin/organizations/${tenant._id}`}
                          className="text-blue-600 hover:text-blue-800 font-medium text-sm hover:underline transition-colors"
                        >
                          View Details
                        </Link>
                        <button
                          onClick={() => {
                            setOrgToDelete(tenant);
                            setDeleteModal(true);
                          }}
                          className="inline-flex items-center justify-center px-3 py-1.5 text-sm font-medium text-red-600 hover:text-white hover:bg-red-600 border border-red-300 rounded-lg transition-all duration-200"
                          title="Delete organization"
                        >
                          <DeleteIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-t border-gray-200">
          <div className="flex items-center space-x-4">
            <p className="text-sm text-gray-700">
              Showing <span className="font-medium">{startIndex + 1}</span> to{" "}
              <span className="font-medium">
                {Math.min(endIndex, pagination.totalCount)}
              </span>{" "}
              of <span className="font-medium">{pagination.totalCount}</span>{" "}
              results
            </p>
            <select
              value={pagination.limit}
              onChange={(e) => handleLimitChange(parseInt(e.target.value))}
              className="border border-gray-300 rounded-full px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
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
      {deleteModal && orgToDelete && (
        <div className="fixed inset-0 z-[100003] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full shadow-2xl mx-4">
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  Delete Organization
                </h3>
                <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800 font-medium mb-1">
                    ⚠️ Warning: This action cannot be undone!
                  </p>
                  <p className="text-xs text-yellow-700">
                    This will permanently delete all data associated with this
                    organization.
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <p className="text-sm text-gray-700 mb-3">
                    You are about to delete:
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-center text-sm">
                      <Building className="w-4 h-4 text-gray-500 mr-2" />
                      <span className="font-semibold text-gray-900">
                        {orgToDelete.name}
                      </span>
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                      <TeamIcon className="w-4 h-4 text-gray-500 mr-2" />
                      <span>
                        {orgToDelete.users || 0} users will be deleted
                      </span>
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                      <Package className="w-4 h-4 text-gray-500 mr-2" />
                      <span>All subscriptions and billing data</span>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mb-4">
                  Type{" "}
                  <span className="font-mono font-bold text-gray-900">
                    DELETE
                  </span>{" "}
                  to confirm:
                </p>
                <input
                  type="text"
                  placeholder="Type DELETE to confirm"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 mb-4"
                  id="delete-confirm-input"
                />
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => {
                      setDeleteModal(false);
                      setOrgToDelete(null);
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    disabled={loading}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      const input = document.getElementById(
                        "delete-confirm-input"
                      );
                      if (input.value === "DELETE") {
                        handleDeleteOrganization();
                      } else {
                        toast.error("Please type DELETE to confirm");
                      }
                    }}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={loading}
                  >
                    {loading ? (
                      <span className="flex items-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Deleting...
                      </span>
                    ) : (
                      "Delete Organization"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Tenants;
