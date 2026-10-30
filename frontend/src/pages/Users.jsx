import DeleteIcon from "../components/common/DeleteIcon";
import CellphoneIcon from "../components/common/CellphoneIcon";
import DownloadIcon from "../components/common/DownloadIcon";
import React, { useState, useEffect, useRef } from "react";
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Users as UsersIcon,
  Building,
  Mail,
  Phone,
  Shield,
  User,
  X,
  AlertCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";
import API, { configureAxios } from "../services/api";

import SearchIcon from "../components/common/SearchIcon";
import FilterIcon from "../components/common/FilterIcon";
const Shimmer = () => (
  <div className="animate-pulse space-y-6">
    <div className="h-8 bg-gray-200 rounded w-1/4"></div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {[...Array(3)].map((_, i) => (
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

const RoleBadge = ({ role }) => {
  const config = {
    admin: {
      bg: "bg-purple-100",
      text: "text-purple-800",
      border: "border-purple-200",
      icon: Shield,
    },
    staff: {
      bg: "bg-blue-100",
      text: "text-blue-800",
      border: "border-blue-200",
      icon: User,
    },
  };

  const { bg, text, border, icon: Icon } = config[role] || config.staff;

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-full ${bg} ${text} border ${border}`}
    >
      <Icon className="w-3 h-3 mr-1" />
      {role.charAt(0).toUpperCase() + role.slice(1)}
    </span>
  );
};

const SearchableOrgDropdown = ({
  organizations,
  selectedOrg,
  onSelect,
  loading,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOrgs = organizations.filter((org) =>
    org.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelect = (org) => {
    onSelect(org);
    setIsOpen(false);
    setSearchTerm("");
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onSelect(null);
    setSearchTerm("");
  };

  const selectedOrgName = selectedOrg
    ? organizations.find((org) => org._id === selectedOrg)?.name ||
      "Select Organization"
    : "All Organizations";

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={loading}
        className="w-full md:w-64 flex items-center justify-between px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors bg-white disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <div className="flex items-center space-x-2 flex-1 min-w-0">
          <Building className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span className="text-sm text-gray-700 truncate">
            {selectedOrgName}
          </span>
        </div>
        <div className="flex items-center space-x-1 flex-shrink-0">
          {selectedOrg && (
            <X
              className="w-4 h-4 text-gray-400 hover:text-gray-600"
              onClick={handleClear}
            />
          )}
          <ChevronDown
            className={`w-4 h-4 text-gray-400 transition-transform ${
              isOpen ? "transform rotate-180" : ""
            }`}
          />
        </div>
      </button>

      {isOpen && (
        <div className="absolute left-[-65px] z-50 mt-2 w-full md:w-80 bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="p-3 border-b border-gray-200">
            <div className="relative">
              <SearchIcon className="absolute left-3 -translate-y-1/2 top-1/2 w-4 h-4 text-[#525866]" />
              <input
                type="text"
                placeholder="Search organizations..."
                className="w-full pl-11 pr-4 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto">
            <button
              onClick={() => handleSelect(null)}
              className={`w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors ${
                !selectedOrg ? "bg-blue-50" : ""
              }`}
            >
              <span className="text-sm text-gray-700 font-medium">
                All Organizations
              </span>
            </button>

            {filteredOrgs.length > 0 ? (
              filteredOrgs.map((org) => (
                <button
                  key={org._id}
                  onClick={() => handleSelect(org._id)}
                  className={`w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors ${
                    selectedOrg === org._id ? "bg-blue-50" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{org.name}</span>
                    {selectedOrg === org._id && (
                      <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                    )}
                  </div>
                </button>
              ))
            ) : (
              <div className="px-4 py-8 text-center text-sm text-gray-500">
                No organizations found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const Users = () => {
  const [users, setUsers] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [summary, setSummary] = useState({
    totalUsers: 0,
    adminCount: 0,
    staffCount: 0,
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
  const [roleFilter, setRoleFilter] = useState("all");
  const [orgFilter, setOrgFilter] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalPermissions, setModalPermissions] = useState([]);
  const [modalUser, setModalUser] = useState(null);
  const [deleteModal, setDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);

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
  }, [users]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPagination((prev) => ({ ...prev, currentPage: 1 }));
  }, [debouncedSearchTerm, roleFilter, orgFilter]);

  // Fetch organizations for dropdown
  useEffect(() => {
    const fetchOrganizations = async () => {
      try {
        configureAxios();
        const response = await API.get("/super-admin/organizations-filter");
        setOrganizations(response.data.organizations || []);
      } catch (err) {
        console.error("Failed to fetch organizations:", err);
      }
    };

    fetchOrganizations();
  }, []);

  // Fetch users
  useEffect(() => {
    const fetchUsers = async () => {
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

        if (roleFilter !== "all") {
          params.role = roleFilter;
        }

        if (orgFilter) {
          params.organization = orgFilter;
        }

        const response = await API.get("/super-admin/users", { params });

        setUsers(response.data.users || []);
        setPagination((prev) => ({
          ...prev,
          totalPages: response.data.pagination?.totalPages || 1,
          totalCount: response.data.pagination?.totalCount || 0,
          hasNextPage: response.data.pagination?.hasNextPage || false,
          hasPrevPage: response.data.pagination?.hasPrevPage || false,
        }));

        // Calculate summary
        const usersData = response.data.users || [];
        const admins = usersData.filter((u) => u.role === "admin").length;
        const staff = usersData.filter((u) => u.role === "staff").length;

        setSummary({
          totalUsers: response.data.pagination?.totalCount || 0,
          adminCount: admins,
          staffCount: staff,
        });
      } catch (err) {
        setError(err.response?.data?.error || "Failed to fetch users");
        toast.error(err.response?.data?.error || "Failed to fetch users");
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [
    pagination.currentPage,
    pagination.limit,
    debouncedSearchTerm,
    sortConfig.key,
    sortConfig.direction,
    roleFilter,
    orgFilter,
  ]);

  const handleDeleteUser = async () => {
    try {
      setLoading(true);
      configureAxios();

      await API.delete(`/super-admin/users/${userToDelete._id}`);

      toast.success(`User ${userToDelete.name} deleted successfully`);
      setDeleteModal(false);
      setUserToDelete(null);

      // Refresh the user list
      const params = {
        page: pagination.currentPage,
        limit: pagination.limit,
        search: debouncedSearchTerm,
        sortBy: sortConfig.key,
        sortOrder: sortConfig.direction,
      };

      if (roleFilter !== "all") params.role = roleFilter;
      if (orgFilter) params.organization = orgFilter;

      const response = await API.get("/super-admin/users", { params });
      setUsers(response.data.users || []);
    } catch (error) {
      console.error("Delete error:", error);
      toast.error(error.response?.data?.message || "Failed to delete user");
    } finally {
      setLoading(false);
    }
  };

  // Export currently filtered/displayed data (current page only)
  const exportToExcel = () => {
    try {
      // Prepare data for export
      const exportData = users.map((user) => ({
        Name: user.name || "N/A",
        Email: user.profileEmail || user.email || "N/A",
        Phone: user.phone || "N/A",
        Organization: user.organization?.name || "N/A",
        Role: user.role || "N/A",
        Permissions:
          user.permissions
            ?.map((p) => `${p.name}: ${p.permission}`)
            .join(", ") || "No permissions",
        "Joined Date": user.createdAt
          ? new Date(user.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "N/A",
      }));

      // Create worksheet
      const worksheet = XLSX.utils.json_to_sheet(exportData);

      // Set column widths
      worksheet["!cols"] = [
        { wch: 25 }, // Name
        { wch: 30 }, // Email
        { wch: 15 }, // Phone
        { wch: 25 }, // Organization
        { wch: 10 }, // Role
        { wch: 40 }, // Permissions
        { wch: 15 }, // Joined Date
      ];

      // Create workbook
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Users");

      // Generate filename with timestamp
      const fileName = `users_export_${
        new Date().toISOString().split("T")[0]
      }.xlsx`;

      // Download file
      XLSX.writeFile(workbook, fileName);

      toast.success(`Exported ${exportData.length} users to Excel`);
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export data");
    }
  };

  // Export ALL data (all pages with current filters)
  const exportAllToExcel = async () => {
    try {
      setLoading(true);
      configureAxios();

      // Fetch all users with current filters but no pagination
      const params = {
        limit: 999999, // Large number to get all
        search: debouncedSearchTerm,
        sortBy: sortConfig.key,
        sortOrder: sortConfig.direction,
      };

      if (roleFilter !== "all") {
        params.role = roleFilter;
      }

      if (orgFilter) {
        params.organization = orgFilter;
      }

      const response = await API.get("/super-admin/users", { params });
      const allUsers = response.data.users || [];

      // Prepare data for export
      const exportData = allUsers.map((user) => ({
        Name: user.name || "N/A",
        Email: user.profileEmail || user.email || "N/A",
        Phone: user.phone || "N/A",
        Organization: user.organization?.name || "N/A",
        Role: user.role || "N/A",
        Permissions:
          user.permissions
            ?.map((p) => `${p.name}: ${p.permission}`)
            .join(", ") || "No permissions",
        "Joined Date": user.createdAt
          ? new Date(user.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "N/A",
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      worksheet["!cols"] = [
        { wch: 25 },
        { wch: 30 },
        { wch: 15 },
        { wch: 25 },
        { wch: 10 },
        { wch: 40 },
        { wch: 15 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Users");

      const fileName = `all_users_export_${
        new Date().toISOString().split("T")[0]
      }.xlsx`;
      XLSX.writeFile(workbook, fileName);

      toast.success(`Exported ${exportData.length} users to Excel`);
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

  const getInitials = (name) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const startIndex = (pagination.currentPage - 1) * pagination.limit;
  const endIndex = startIndex + pagination.limit;

  if (loading && users.length === 0) return <Shimmer />;

  if (error && users.length === 0)
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Error Loading Users
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
          <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-500 mt-1">
            Manage users across all organizations
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
                disabled={loading || users.length === 0}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100 disabled:opacity-50 disabled:cursor-not-allowed rounded-t-lg"
              >
                <div className="font-medium text-gray-900 text-sm">
                  Export Current Page
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {users.length} {users.length === 1 ? "user" : "users"}
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
                  {pagination.totalCount === 1 ? "user" : "users"}
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SummaryCard
          title="Total Users"
          value={summary.totalUsers}
          subtitle="Across all organizations"
          icon={UsersIcon}
          gradient="bg-gradient-to-br from-blue-500 to-blue-600"
        />

        <SummaryCard
          title="Administrators"
          value={summary.adminCount}
          subtitle="Admin role users"
          icon={Shield}
          gradient="bg-gradient-to-br from-purple-500 to-purple-600"
        />

        <SummaryCard
          title="Staff Members"
          value={summary.staffCount}
          subtitle="Staff role users"
          icon={User}
          gradient="bg-gradient-to-br from-green-500 to-green-600"
        />
      </div>

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
                placeholder="Search by name, email, or phone..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={searchTerm}
                onChange={handleSearchChange}
                disabled={loading}
              />
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Role Filter */}
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                disabled={loading}
              >
                <option value="all">All Roles</option>
                <option value="admin">Admin</option>
                <option value="staff">Staff</option>
              </select>

              {/* Organization Filter */}
              <SearchableOrgDropdown
                organizations={organizations}
                selectedOrg={orgFilter}
                onSelect={setOrgFilter}
                loading={loading}
              />
            </div>
          </div>

          {/* Active Filters Display */}
          {(roleFilter !== "all" || orgFilter) && (
            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-200">
              <FilterIcon size={16} />
              <span className="text-sm text-gray-600">Active Filters:</span>
              {roleFilter !== "all" && (
                <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                  Role: {roleFilter}
                  <button
                    onClick={() => setRoleFilter("all")}
                    className="ml-1.5 hover:text-blue-900"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {orgFilter && (
                <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                  Org: {organizations.find((o) => o._id === orgFilter)?.name}
                  <button
                    onClick={() => setOrgFilter(null)}
                    className="ml-1.5 hover:text-green-900"
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Contact
                </th>
                <SortableHeader field="organization">
                  Organization
                </SortableHeader>
                <SortableHeader field="role">Role</SortableHeader>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Permissions
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
                  <td colSpan="6" className="px-6 py-12 text-center">
                    <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div>
                    <p className="text-gray-600">Loading users...</p>
                  </td>
                </tr>
              )}

              {!loading && users.length === 0 && (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center">
                    <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500 text-lg">No users found</p>
                    <p className="text-gray-400 text-sm mt-1">
                      Try adjusting your search or filters
                    </p>
                  </td>
                </tr>
              )}

              {!loading &&
                users.map((user) => (
                  <tr
                    key={user._id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    {/* User */}
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        {user.profileUrl ? (
                          <img
                            src={user.profileUrl}
                            alt={user.name}
                            className="w-10 h-10 rounded-full object-cover border-2 border-gray-200"
                            onError={(e) => {
                              e.target.style.display = "none";
                              e.target.nextSibling.style.display = "flex";
                            }}
                          />
                        ) : null}
                        <div
                          className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm"
                          style={{ display: user.profileUrl ? "none" : "flex" }}
                        >
                          {getInitials(user.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {user.name || "N/A"}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Contact */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col space-y-1">
                        {(user.profileEmail || user.email) && (
                          <div className="flex items-center text-xs text-gray-600">
                            <Mail className="w-3 h-3 mr-1 text-gray-400" />
                            <span className="truncate max-w-xs">
                              {user.profileEmail || user.email}
                            </span>
                          </div>
                        )}
                        {user.phone && (
                          <div className="flex items-center text-xs text-gray-600">
                            <CellphoneIcon className="w-3 h-3 mr-1 text-gray-400" />
                            <span>{user.phone}</span>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Organization */}
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        <Building className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-900">
                          {user.organization?.name || "N/A"}
                        </span>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="px-6 py-4">
                      <RoleBadge role={user.role} />
                    </td>

                    {/* Permissions */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col space-y-1">
                        {user.permissions && user.permissions.length > 0 ? (
                          user.permissions.slice(0, 2).map((perm, idx) => (
                            <span
                              key={idx}
                              className="text-xs text-gray-600 truncate max-w-xs"
                            >
                              {perm.name}: {perm.permission}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-gray-400">
                            No permissions
                          </span>
                        )}
                        {user.permissions && user.permissions.length > 2 && (
                          <button
                            className="text-xs text-blue-600 cursor-pointer"
                            type="button"
                            onClick={() => {
                              setModalPermissions(user.permissions);
                              setModalUser(user);
                              setModalOpen(true);
                            }}
                          >
                            +{user.permissions.length - 2} more
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Joined */}
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-900">
                        {user.createdAt
                          ? new Date(user.createdAt).toLocaleDateString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              }
                            )
                          : "N/A"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => {
                          setUserToDelete(user);
                          setDeleteModal(true);
                        }}
                        className="text-red-600 hover:text-red-900 transition-colors cursor-pointer"
                        title="Delete user"
                      >
                        <DeleteIcon className="w-4 h-4" />
                      </button>
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
      {modalOpen && (
        <div className="fixed inset-0 z-[100002] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-lg relative">
            <button
              className="absolute top-4 right-4"
              onClick={() => setModalOpen(false)}
            >
              <X className="w-6 h-6 text-gray-400 hover:text-gray-600 cursor-pointer" />
            </button>
            <h2 className="text-xl font-bold mb-3 text-gray-900">
              Permissions for {modalUser?.name || "User"}
            </h2>
            <div className="flex flex-col gap-2">
              {modalPermissions?.map((perm, idx) => (
                <span key={idx} className="text-base text-gray-700">
                  <strong>{perm.name}:</strong> {perm.permission}
                </span>
              ))}
              {modalPermissions?.length === 0 && (
                <span className="text-gray-400">No permissions</span>
              )}
            </div>
          </div>
        </div>
      )}
      {deleteModal && userToDelete && (
        <div className="fixed inset-0 z-[100003] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl">
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Delete User
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  Are you sure you want to delete{" "}
                  <strong>{userToDelete.name}</strong>? This action cannot be
                  undone.
                </p>
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => {
                      setDeleteModal(false);
                      setUserToDelete(null);
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    disabled={loading}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteUser}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                    disabled={loading}
                  >
                    {loading ? "Deleting..." : "Delete User"}
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

export default Users;
