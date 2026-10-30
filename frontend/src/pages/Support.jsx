import CalendarIcon from "../components/common/CalendarIcon";
import React, { useState, useEffect, useRef } from "react";
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Clock,
  CheckCircle2,
  AlertCircle,
  X,
  User,
  Building,
  Activity,
  Mail,
} from "lucide-react";
import toast from "react-hot-toast";
import API, { configureAxios } from "../services/api";
import { FaWhatsapp } from "react-icons/fa";
import AppToaster from "../components/AppToaster";
import SearchIcon from "../components/common/SearchIcon";
import FilterIcon from "../components/common/FilterIcon";
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
    Open: {
      bg: "bg-blue-100",
      text: "text-blue-800",
      border: "border-blue-200",
      icon: FaWhatsapp,
    },
    Pending: {
      bg: "bg-yellow-100",
      text: "text-yellow-800",
      border: "border-yellow-200",
      icon: Clock,
    },
    "In Progress": {
      bg: "bg-purple-100",
      text: "text-purple-800",
      border: "border-purple-200",
      icon: Activity,
    },
    Resolved: {
      bg: "bg-green-100",
      text: "text-green-800",
      border: "border-green-200",
      icon: CheckCircle2,
    },
    Closed: {
      bg: "bg-gray-100",
      text: "text-gray-800",
      border: "border-gray-200",
      icon: CheckCircle2,
    },
  };

  const { bg, text, border, icon: Icon } = config[status] || config.Open;

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-full ${bg} ${text} border ${border}`}
    >
      <Icon className="w-3 h-3 mr-1" />
      {status}
    </span>
  );
};

const PriorityBadge = ({ priority }) => {
  const config = {
    High: {
      bg: "bg-red-100",
      text: "text-red-800",
      border: "border-red-200",
      icon: AlertCircle,
    },
    Medium: {
      bg: "bg-orange-100",
      text: "text-orange-800",
      border: "border-orange-200",
      icon: AlertCircle,
    },
    Low: {
      bg: "bg-green-100",
      text: "text-green-800",
      border: "border-green-200",
      icon: Clock,
    },
  };

  const { bg, text, border, icon: Icon } = config[priority] || config.Medium;

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-full ${bg} ${text} border ${border}`}
    >
      <Icon className="w-3 h-3 mr-1" />
      {priority}
    </span>
  );
};

// Ticket Detail Modal Component
const TicketDetailModal = ({ ticket, isOpen, onClose, onStatusUpdate }) => {
  const [updating, setUpdating] = useState(false);

  if (!isOpen || !ticket) return null;

  const handleResolve = async () => {
    try {
      setUpdating(true);
      configureAxios();
      await API.post(`/super-admin/support/${ticket._id}/status`, {
        status: "Resolved",
      });
      toast.success("Ticket marked as resolved");
      onStatusUpdate();
      onClose();
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Failed to update ticket status"
      );
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100001] overflow-y-auto">
      <AppToaster />
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 transition-opacity"
        onClick={onClose}
      ></div>

      {/* Modal */}
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="relative bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <MessageSquare className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  Ticket Details
                </h2>
                <p className="text-sm text-gray-500">ID: {ticket._id}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Subject and Status */}
            <div className="flex justify-between">
              <div>
                <h3 className="text-2xl font-bold text-gray-900 mb-3">
                  {ticket.subject}
                </h3>
                <div className="flex items-center space-x-3">
                  <StatusBadge status={ticket.status} />
                  <PriorityBadge priority={ticket.priority} />
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Building className="w-4 h-4 text-gray-500" />
                  <span className="text-xs font-medium text-gray-500 uppercase">
                    Organization
                  </span>
                </div>
                <p className="text-sm font-semibold text-gray-900">
                  {ticket.organizationName || "N/A"}
                </p>
                <div className="flex items-center mt-2 text-xs text-gray-500">
                  <Mail className="w-3 h-3 mr-1" />
                  {ticket.email}
                </div>
              </div>
            </div>

            {/* User Info */}
            {ticket.user && (
              <div className="flex items-center space-x-3 bg-blue-50 rounded-lg p-3">
                <User className="w-4 h-4 text-blue-600" />
                <div>
                  <p className="text-xs font-medium text-gray-500">
                    Submitted By
                  </p>
                  <p className="text-sm font-semibold text-gray-900">
                    {ticket.user.name || ticket.user.email}
                  </p>
                </div>
              </div>
            )}

            {/* Description */}
            <div>
              <div className="flex items-center space-x-2 mb-3">
                <FaWhatsapp className="w-4 h-4 text-gray-500" />
                <h4 className="text-sm font-semibold text-gray-900 uppercase">
                  Description
                </h4>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {ticket.description || "No description provided"}
                </p>
              </div>
            </div>

            {/* Timestamps */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-start space-x-3">
                <CalendarIcon className="w-4 h-4 text-gray-400 mt-1" />
                <div>
                  <p className="text-xs font-medium text-gray-500">
                    Created At
                  </p>
                  <p className="text-sm font-semibold text-gray-900">
                    {new Date(ticket.createdAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>

              {ticket.updatedAt && (
                <div className="flex items-start space-x-3">
                  <Clock className="w-4 h-4 text-gray-400 mt-1" />
                  <div>
                    <p className="text-xs font-medium text-gray-500">
                      Last Updated
                    </p>
                    <p className="text-sm font-semibold text-gray-900">
                      {new Date(ticket.updatedAt).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-between">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
            >
              Close
            </button>

            <div className="flex items-center space-x-3">
              {(ticket.status === "Open" ||
                ticket.status === "Pending" ||
                ticket.status === "In Progress") && (
                <button
                  onClick={handleResolve}
                  disabled={updating}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  {updating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Updating...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Mark as Resolved</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Support = () => {
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [summary, setSummary] = useState({
    totalTickets: 0,
    openTickets: 0,
    resolvedTickets: 0,
    avgResponseTime: 0,
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
    key: "createdAt",
    direction: "desc",
  });
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const searchInputRef = useRef(null);
  const keepFocus = useRef(false);

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      keepFocus.current = false;
    }, 1000);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Restore focus only when typing
  useEffect(() => {
    if (keepFocus.current && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [debouncedSearchTerm]);

  // Reset to page 1 when search or filters change
  useEffect(() => {
    setPagination((prev) => ({ ...prev, currentPage: 1 }));
  }, [debouncedSearchTerm, statusFilter, priorityFilter]);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      configureAxios();

      const params = new URLSearchParams({
        page: pagination.currentPage.toString(),
        limit: pagination.limit.toString(),
        search: debouncedSearchTerm,
        sortBy: sortConfig.key,
        sortOrder: sortConfig.direction,
      });

      if (statusFilter !== "all") {
        params.append("status", statusFilter);
      }
      if (priorityFilter !== "all") {
        params.append("priority", priorityFilter);
      }

      const response = await API.get("/super-admin/support", {
        params: Object.fromEntries(params),
      });

      setTickets(response.data.tickets || []);
      setPagination((prev) => ({
        ...prev,
        totalPages: response.data.pagination?.totalPages || 1,
        totalCount: response.data.pagination?.totalCount || 0,
        hasNextPage: response.data.pagination?.hasNextPage || false,
        hasPrevPage: response.data.pagination?.hasPrevPage || false,
      }));

      // Calculate summary
      const ticketsData = response.data.tickets || [];
      const open = ticketsData.filter((t) =>
        ["Open", "Pending", "In Progress"].includes(t.status)
      ).length;
      const resolved = ticketsData.filter((t) =>
        ["Resolved", "Closed"].includes(t.status)
      ).length;

      setSummary({
        totalTickets: response.data.pagination?.totalCount || 0,
        openTickets: open,
        resolvedTickets: resolved,
        avgResponseTime: "2.5h",
      });
    } catch (err) {
      setError(err.response?.data?.error || "Failed to fetch support tickets");
      toast.error(
        err.response?.data?.error || "Failed to fetch support tickets"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [
    pagination.currentPage,
    pagination.limit,
    debouncedSearchTerm,
    sortConfig.key,
    sortConfig.direction,
    statusFilter,
    priorityFilter,
  ]);

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
    keepFocus.current = true;
  };

  const handleViewDetails = (ticket) => {
    setSelectedTicket(ticket);
    setIsModalOpen(true);
  };

  const handleResolve = async (ticket) => {
    try {
      configureAxios();
      await API.post(`/super-admin/support/${ticket._id}/status`, {
        status: "Resolved",
      });
      toast.success("Ticket marked as resolved");
      fetchTickets();
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Failed to update ticket status"
      );
    }
  };

  const handleStatusUpdate = () => {
    fetchTickets();
  };

  const startIndex = (pagination.currentPage - 1) * pagination.limit;
  const endIndex = startIndex + pagination.limit;

  if (loading && tickets.length === 0) return <Shimmer />;

  if (error && tickets.length === 0)
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Error Loading Support Tickets
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
          <h1 className="text-3xl font-bold text-gray-900">Support Center</h1>
          <p className="text-gray-500 mt-1">
            Manage customer support tickets and inquiries
          </p>
        </div>
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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <SummaryCard
          title="Total Tickets"
          value={summary.totalTickets}
          subtitle="All support tickets"
          icon={MessageSquare}
          gradient="bg-gradient-to-br from-blue-500 to-blue-600"
        />

        <SummaryCard
          title="Open Tickets"
          value={summary.openTickets}
          subtitle="Awaiting response"
          icon={Clock}
          gradient="bg-gradient-to-br from-orange-500 to-orange-600"
        />

        <SummaryCard
          title="Resolved Tickets"
          value={summary.resolvedTickets}
          subtitle="Successfully closed"
          icon={CheckCircle2}
          gradient="bg-gradient-to-br from-green-500 to-green-600"
        />

        {/* <SummaryCard
          title="Avg Response Time"
          value={summary.avgResponseTime}
          subtitle="Average resolution time"
          icon={Activity}
          gradient="bg-gradient-to-br from-purple-500 to-purple-600"
        /> */}
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
                placeholder="Search by subject or organization..."
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
                <option value="Open">Open</option>
                <option value="Pending">Pending</option>
                <option value="In Progress">In Progress</option>
                <option value="Resolved">Resolved</option>
                <option value="Closed">Closed</option>
              </select>

              {/* Priority Filter */}
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                disabled={loading}
              >
                <option value="all">All Priority</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
          </div>

          {/* Active Filters Display */}
          {(statusFilter !== "all" || priorityFilter !== "all") && (
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
              {priorityFilter !== "all" && (
                <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-800">
                  Priority: {priorityFilter}
                  <button
                    onClick={() => setPriorityFilter("all")}
                    className="ml-1.5 hover:text-orange-900"
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
                  Ticket Details
                </th>
                <SortableHeader field="organizationName">
                  Organization
                </SortableHeader>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Priority
                </th>
                <SortableHeader field="createdAt">Created</SortableHeader>
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
                    <p className="text-gray-600">Loading tickets...</p>
                  </td>
                </tr>
              )}

              {!loading && tickets.length === 0 && (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center">
                    <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500 text-lg">No tickets found</p>
                    <p className="text-gray-400 text-sm mt-1">
                      {statusFilter !== "all" ||
                      priorityFilter !== "all" ||
                      searchTerm
                        ? "Try adjusting your search or filters"
                        : "No support tickets available"}
                    </p>
                  </td>
                </tr>
              )}

              {!loading &&
                tickets.map((ticket) => (
                  <tr
                    key={ticket._id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    {/* Ticket Details */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-gray-900 mb-1">
                          {ticket.subject}
                        </span>
                        {ticket.description && (
                          <span className="text-xs text-gray-500 line-clamp-2">
                            {ticket.description}
                          </span>
                        )}
                        {ticket.user && (
                          <div className="flex items-center mt-2 text-xs text-gray-500">
                            <User className="w-3 h-3 mr-1" />
                            {ticket.user.name || ticket.user.email}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Organization */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <div className="flex items-center space-x-2">
                          <Building className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-900">
                            {ticket.organizationName || "N/A"}
                          </span>
                        </div>
                        <div className="flex items-center mt-1 text-xs text-gray-500">
                          <Mail className="w-3 h-3 mr-1" />
                          {ticket.email}
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4">
                      <StatusBadge status={ticket.status} />
                    </td>

                    {/* Priority */}
                    <td className="px-6 py-4">
                      <PriorityBadge priority={ticket.priority} />
                    </td>

                    {/* Created */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm text-gray-900 flex items-center">
                          <CalendarIcon className="w-3 h-3 mr-1 text-gray-400" />
                          {new Date(ticket.createdAt).toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            }
                          )}
                        </span>
                        <span className="text-xs text-gray-500 mt-1">
                          {new Date(ticket.createdAt).toLocaleTimeString(
                            "en-US",
                            {
                              hour: "2-digit",
                              minute: "2-digit",
                            }
                          )}
                        </span>
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => handleViewDetails(ticket)}
                          className="text-blue-600 hover:text-blue-800 font-medium text-sm hover:underline transition-colors text-left"
                        >
                          View Details
                        </button>
                        {(ticket.status === "Open" ||
                          ticket.status === "Pending" ||
                          ticket.status === "In Progress") && (
                          <button
                            onClick={() => handleResolve(ticket)}
                            className="text-green-600 hover:text-green-800 font-medium text-sm hover:underline transition-colors text-left"
                          >
                            Mark Resolved
                          </button>
                        )}
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

      {/* Ticket Detail Modal */}
      <TicketDetailModal
        ticket={selectedTicket}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onStatusUpdate={handleStatusUpdate}
      />
    </div>
  );
};

export default Support;
