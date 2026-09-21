import PdfIcon from "../components/common/PdfIcon";
import React, { useState, useEffect } from "react";
import { formatNumberToIndian } from "../utils/numberFormatter";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Target,
  CheckCircle2,
  Building,
  Package,
  AlertCircle,
  Activity,
  Clock,
  IndianRupee,
  Briefcase,
  UserCheck,
  Percent,
  IndianRupeeIcon,
} from "lucide-react";
import toast from "react-hot-toast";
import API, { configureAxios } from "../services/api";
import TeamIcon from "../components/common/TeamIcon";

const COLORS = {
  primary: "#3B82F6",
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#EF4444",
  info: "#6366F1",
  purple: "#8B5CF6",
  pink: "#EC4899",
};

const STATUS_COLORS = [
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#6366F1",
  "#8B5CF6",
];

// Custom label rendering function with better positioning
const renderCustomLabel = (props) => {
  const { cx, cy, midAngle, innerRadius, outerRadius, percent, name } = props;
  const RADIAN = Math.PI / 180;

  // Only show label if percentage is greater than 5%
  if (percent < 0.05) return null;

  const radius = outerRadius + 25;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="#374151"
      textAnchor={x > cx ? "start" : "end"}
      dominantBaseline="central"
      fontSize="12"
      fontWeight="500"
    >
      {`${name}: ${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

const Shimmer = () => (
  <div className="animate-pulse space-y-6">
    <div className="h-8 bg-gray-200 rounded w-1/4"></div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className="bg-white p-6 rounded-xl border border-gray-200 h-32"
        ></div>
      ))}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {[...Array(2)].map((_, i) => (
        <div
          key={i}
          className="bg-white p-6 rounded-xl border border-gray-200 h-80"
        ></div>
      ))}
    </div>
  </div>
);

const MetricCard = ({
  title,
  value,
  subtitle,
  icon: Icon,
  gradient,
  trend,
  trendValue,
}) => (
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
    {trend && (
      <div className="flex items-center space-x-2">
        {trend === "up" ? (
          <TrendingUp className="w-4 h-4 text-green-600" />
        ) : (
          <TrendingDown className="w-4 h-4 text-red-600" />
        )}
        <span
          className={`text-sm font-medium ${
            trend === "up" ? "text-green-600" : "text-red-600"
          }`}
        >
          {trendValue}
        </span>
        <span className="text-xs text-gray-500">conversion rate</span>
      </div>
    )}
  </div>
);

const StatCard = ({ label, value, icon: Icon, color, percentage }) => (
  <div className="bg-white rounded-lg p-4 border border-gray-200 hover:shadow-md transition-shadow">
    <div className="flex items-center justify-between mb-2">
      <span className="text-sm font-medium text-gray-600">{label}</span>
      <Icon className={`w-5 h-5 ${color}`} />
    </div>
    <div className="flex items-baseline space-x-2">
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {percentage && (
        <span className="text-sm text-gray-500">({percentage}%)</span>
      )}
    </div>
  </div>
);

const Analytics = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setLoading(true);
        configureAxios();
        const response = await API.get("/super-admin/analytics");
        setData(response.data);
      } catch (err) {
        setError(err.response?.data?.error || "Failed to fetch analytics data");
        toast.error(
          err.response?.data?.error || "Failed to fetch analytics data"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, []);

  if (loading) return <Shimmer />;

  if (error)
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Error Loading Analytics
          </h3>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );

  const { summary, invoices, deals, tasks, contacts, companies, vendors } =
    data;

  // Transform monthly trend data
  const getMonthName = (month) => {
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    return months[month - 1];
  };

  const invoiceTrendData = invoices.monthlyTrend.map((item) => ({
    month: getMonthName(item._id.month),
    invoices: item.count,
    revenue: item.total,
  }));

  const dealTrendData = deals.monthlyTrend.map((item) => ({
    month: getMonthName(item._id.month),
    deals: item.count,
    value: item.totalValue,
  }));

  // Prepare chart data
  const invoiceStatusData = invoices.byStatus.map((item) => ({
    name: item._id
      ? item._id.charAt(0).toUpperCase() + item._id.slice(1)
      : "Unknown",
    value: item.count,
    amount: item.total,
  }));

  const invoicePaymentData = [
    {
      name: "Paid",
      value: invoiceStatusData
        .filter((item) => ["paid", "accepted"].includes(item.name.toLowerCase()))
        .reduce((total, item) => total + item.value, 0),
      color: "#00C950",
    },
    {
      name: "Unpaid",
      value: invoiceStatusData
        .filter((item) => !["paid", "accepted"].includes(item.name.toLowerCase()))
        .reduce((total, item) => total + item.value, 0),
      color: "#F04444",
    },
  ];
  const invoiceTotalCount = invoicePaymentData.reduce(
    (total, item) => total + item.value,
    0
  );

  const dealStatusData = deals.byStatus.map((item) => ({
    name: item._id
      ? item._id.charAt(0).toUpperCase() + item._id.slice(1)
      : "Unknown",
    value: item.count,
    amount: item.totalValue,
  }));

  const taskStatusData = tasks.byStatus.map((item) => ({
    name: item._id
      ? item._id.charAt(0).toUpperCase() + item._id.slice(1)
      : "Unknown",
    value: item.count,
  }));

  const taskPriorityData = tasks.byPriority.map((item) => ({
    name: item._id
      ? item._id.charAt(0).toUpperCase() + item._id.slice(1)
      : "Unknown",
    value: item.count,
  }));

  const lifecycleStageData = contacts.byLifecycleStage.map((item) => ({
    name: item._id || "Unknown",
    value: item.count,
  }));

  const stageStatusData = contacts.byStageStatus.map((item) => ({
    name: item._id || "Unknown",
    value: item.count,
  }));

  const industryData = companies.byIndustry.slice(0, 8).map((item) => ({
    name: item._id || "Unknown",
    value: item.count,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Analytics Dashboard
          </h1>
          <p className="text-gray-500 mt-1">
            Comprehensive insights across your CRM platform
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

      {/* Key Performance Indicators */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Key Performance Indicators
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <MetricCard
            title="Total Revenue"
            value={`₹${formatNumberToIndian(summary.totalInvoiceAmount)}`}
            subtitle={`From ${summary.totalInvoices} invoices`}
            icon={IndianRupee}
            gradient="bg-gradient-to-br from-green-500 to-green-600"
            trend="up"
            trendValue={`${summary.paymentConversionRate}%`}
          />

          <MetricCard
            title="Deal Pipeline Value"
            value={`₹${formatNumberToIndian(summary.totalDealValue)}`}
            subtitle={`${summary.totalDeals} deals in pipeline`}
            icon={Target}
            gradient="bg-gradient-to-br from-blue-500 to-blue-600"
            trend="up"
            trendValue={`${summary.dealWinRate}%`}
          />

          <MetricCard
            title="Customer Conversion"
            value={`${summary.customerConversionRate}%`}
            subtitle={`${
              contacts.byLifecycleStage.find((c) => c._id === "Customer")
                ?.count || 0
            } customers`}
            icon={UserCheck}
            gradient="bg-gradient-to-br from-purple-500 to-purple-600"
          />

          <MetricCard
            title="Vendor Payables"
            value={`₹${formatNumberToIndian(summary.totalVendorBalance)}`}
            subtitle={`${summary.totalVendors} vendors`}
            icon={Package}
            gradient="bg-gradient-to-br from-orange-500 to-orange-600"
          />
        </div>
      </div>

      {/* Platform Activity */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Platform Activity
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            label="Total Companies"
            value={summary.totalCompanies}
            icon={Building}
            color="text-blue-600"
          />
          <StatCard
            label="Total Contacts"
            value={summary.totalContacts}
            icon={TeamIcon}
            color="text-green-600"
          />
          <StatCard
            label="Active Tasks"
            value={summary.totalTasks}
            icon={CheckCircle2}
            color="text-purple-600"
            percentage={summary.taskCompletionRate}
          />
          <StatCard
            label="GST Registered"
            value={companies.withGSTIN}
            icon={PdfIcon}
            color="text-indigo-600"
          />
          <StatCard
            label="Avg Vendor Balance"
            value={`₹${formatNumberToIndian(
              parseFloat(vendors.averageBalance)
            )}`}
            icon={IndianRupeeIcon}
            color="text-orange-600"
          />
        </div>
      </div>

      {/* Revenue & Deal Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Invoice Revenue Trend */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-900">
              Revenue Trend
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Last 6 months invoice revenue
            </p>
          </div>
          {invoiceTrendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={invoiceTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12, fill: "#6B7280" }}
                  stroke="#9CA3AF"
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "#6B7280" }}
                  stroke="#9CA3AF"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#fff",
                    border: "1px solid #E5E7EB",
                    borderRadius: "8px",
                  }}
                  formatter={(value) => `₹${formatNumberToIndian(value)}`}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke={COLORS.success}
                  strokeWidth={3}
                  dot={{ fill: COLORS.success, r: 4 }}
                  name="Revenue (₹)"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-400">
              No revenue trend data available
            </div>
          )}
        </div>

        {/* Deal Value Trend */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-900">
              Deal Pipeline Trend
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Last 6 months deal activity
            </p>
          </div>
          {dealTrendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dealTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12, fill: "#6B7280" }}
                  stroke="#9CA3AF"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#6B7280" }}
                  stroke="#9CA3AF"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#fff",
                    border: "1px solid #E5E7EB",
                    borderRadius: "8px",
                  }}
                  formatter={(value, name) => {
                    if (name === "value")
                      return [`₹${formatNumberToIndian(value)}`, "Deal Value"];
                    return [value, "Deal Count"];
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="deals"
                  stroke={COLORS.primary}
                  strokeWidth={3}
                  dot={{ fill: COLORS.primary, r: 4 }}
                  name="Deals"
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={COLORS.info}
                  strokeWidth={3}
                  dot={{ fill: COLORS.info, r: 4 }}
                  name="Value (₹)"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-400">
              No deal trend data available
            </div>
          )}
        </div>
      </div>

      {/* Status Distributions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Invoice Status */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900">
              Invoice Status
            </h2>
            <p className="text-sm text-gray-500 mt-1">Distribution by status</p>
          </div>
          {invoiceTotalCount > 0 ? (
            <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
              <div className="relative h-[190px] w-[190px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={invoicePaymentData.filter((item) => item.value > 0)}
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={86}
                    paddingAngle={invoicePaymentData.filter((item) => item.value > 0).length > 1 ? 3 : 0}
                    dataKey="value"
                    stroke="#fff"
                    strokeWidth={2}
                  >
                    {invoicePaymentData
                      .filter((item) => item.value > 0)
                      .map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={entry.color}
                      />
                      ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#fff",
                      border: "1px solid #E5E7EB",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(value, name) => [`${value} invoices`, name]}
                  />
                </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-bold leading-none text-gray-900">
                    {invoiceTotalCount}
                  </span>
                  <span className="mt-1 text-xs font-medium text-gray-500">
                    Total
                  </span>
                </div>
              </div>
              <div className="w-full space-y-3">
                {invoicePaymentData.map((item) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/80 px-4 py-3"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-sm font-medium text-gray-600">
                        {item.name}
                      </span>
                    </div>
                    <span className="text-lg font-bold leading-none text-gray-900">
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 text-gray-400">
              No invoice data
            </div>
          )}
        </div>

        {/* Deal Status */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Deal Status</h2>
            <p className="text-sm text-gray-500 mt-1">Pipeline distribution</p>
          </div>
          {dealStatusData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={dealStatusData}
                    cx="50%"
                    cy="50%"
                    labelLine={{
                      stroke: "#9CA3AF",
                      strokeWidth: 1,
                    }}
                    label={renderCustomLabel}
                    outerRadius={70}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {dealStatusData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={STATUS_COLORS[index % STATUS_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#fff",
                      border: "1px solid #E5E7EB",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-4 space-y-2">
                {dealStatusData.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center">
                      <div
                        className="w-3 h-3 rounded-full mr-2"
                        style={{
                          backgroundColor:
                            STATUS_COLORS[index % STATUS_COLORS.length],
                        }}
                      />
                      <span className="text-gray-700">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-gray-900">
                        {item.value}
                      </div>
                      <h6 className="text-xs text-gray-500">
                        ₹{formatNumberToIndian(item.amount || 0)}
                      </h6>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-48 text-gray-400">
              No deal data
            </div>
          )}
        </div>

        {/* Contact Lifecycle Stages */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900">
              Contact Lifecycle
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {summary.customerConversionRate}% conversion rate
            </p>
          </div>
          {lifecycleStageData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={lifecycleStageData}
                    cx="50%"
                    cy="50%"
                    labelLine={{
                      stroke: "#9CA3AF",
                      strokeWidth: 1,
                    }}
                    label={renderCustomLabel}
                    outerRadius={70}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {lifecycleStageData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={STATUS_COLORS[index % STATUS_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#fff",
                      border: "1px solid #E5E7EB",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-4 space-y-2">
                {lifecycleStageData.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center">
                      <div
                        className="w-3 h-3 rounded-full mr-2"
                        style={{
                          backgroundColor:
                            STATUS_COLORS[index % STATUS_COLORS.length],
                        }}
                      />
                      <span className="text-gray-700">{item.name}</span>
                    </div>
                    <span className="font-semibold text-gray-900">
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-48 text-gray-400">
              No contact data
            </div>
          )}
        </div>
      </div>

      {/* Contact Stage Status & Industry Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contact Stage Status */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900">
              Contact Stage Status
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Detailed stage breakdown
            </p>
          </div>
          {stageStatusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stageStatusData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "#6B7280" }}
                  stroke="#9CA3AF"
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "#6B7280" }}
                  stroke="#9CA3AF"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#fff",
                    border: "1px solid #E5E7EB",
                    borderRadius: "8px",
                  }}
                />
                <Bar
                  dataKey="value"
                  fill={COLORS.purple}
                  radius={[8, 8, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-48 text-gray-400">
              No stage status data
            </div>
          )}
        </div>

        {/* Companies by Industry */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900">
              Companies by Industry
            </h2>
            <p className="text-sm text-gray-500 mt-1">Top 8 industries</p>
          </div>
          {industryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={industryData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 12, fill: "#6B7280" }}
                  stroke="#9CA3AF"
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 12, fill: "#6B7280" }}
                  stroke="#9CA3AF"
                  width={100}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#fff",
                    border: "1px solid #E5E7EB",
                    borderRadius: "8px",
                  }}
                />
                <Bar
                  dataKey="value"
                  fill={COLORS.primary}
                  radius={[0, 8, 8, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-48 text-gray-400">
              No industry data
            </div>
          )}
        </div>
      </div>

      {/* Top Performers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Invoices */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900">
              Top Invoices
            </h2>
            <p className="text-sm text-gray-500 mt-1">Highest value invoices</p>
          </div>
          <div className="space-y-4">
            {invoices.topInvoices.length > 0 ? (
              invoices.topInvoices.map((invoice, index) => (
                <div
                  key={invoice._id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center justify-center w-10 h-10 bg-blue-100 rounded-full">
                      <span className="text-blue-600 font-semibold">
                        #{index + 1}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {invoice.company?.name || "Unknown Company"}
                      </p>
                      <div className="flex items-center space-x-2 mt-1">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            invoice.status === "paid"
                              ? "bg-green-100 text-green-700"
                              : invoice.status === "pending"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {invoice.status}
                        </span>
                        <span className="text-xs text-gray-500">
                          {invoice.itemCount} items
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <h6 className="text-lg font-bold text-gray-900">
                      ₹{formatNumberToIndian(invoice.amount || 0)}
                    </h6>
                    <p className="text-xs text-gray-500">
                      {new Date(invoice.date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex items-center justify-center h-48 text-gray-400">
                No invoice data
              </div>
            )}
          </div>
        </div>

        {/* Top Deals */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Top Deals</h2>
            <p className="text-sm text-gray-500 mt-1">Highest value deals</p>
          </div>
          <div className="space-y-4">
            {deals.topDeals && deals.topDeals.length > 0 ? (
              deals.topDeals.map((deal, index) => (
                <div
                  key={deal._id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center justify-center w-10 h-10 bg-purple-100 rounded-full">
                      <span className="text-purple-600 font-semibold">
                        #{index + 1}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {deal.title || "Untitled Deal"}
                      </p>
                      <div className="flex items-center space-x-2 mt-1">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            deal.status?.toLowerCase() === "won"
                              ? "bg-green-100 text-green-700"
                              : deal.status?.toLowerCase() === "open"
                              ? "bg-blue-100 text-blue-700"
                              : deal.status?.toLowerCase() === "lost"
                              ? "bg-red-100 text-red-700"
                              : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {deal.status}
                        </span>
                        {deal.contact?.name && (
                          <span className="text-xs text-gray-500">
                            {deal.contact.name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <h6 className="text-lg font-bold text-gray-900">
                      ₹{formatNumberToIndian(deal.amount || 0)}
                    </h6>
                    {deal.company?.name && (
                      <h6 className="text-xs text-gray-500">
                        {deal.company.name}
                      </h6>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="flex items-center justify-center h-48 text-gray-400">
                No deal data
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Insights */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Quick Insights
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">
                Avg Deal Value
              </span>
              <Briefcase className="w-4 h-4 text-blue-600" />
            </div>
            <h6 className="text-xl font-bold text-gray-900">
              ₹
              {summary.totalDeals > 0
                ? formatNumberToIndian(
                    Math.round(summary.totalDealValue / summary.totalDeals)
                  )
                : "0"}
            </h6>
          </div>

          <div className="bg-white rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">
                Avg Invoice Value
              </span>
              <PdfIcon className="w-4 h-4 text-green-600" />
            </div>
            <h6 className="text-xl font-bold text-gray-900">
              ₹
              {summary.totalInvoices > 0
                ? formatNumberToIndian(
                    Math.round(
                      summary.totalInvoiceAmount / summary.totalInvoices
                    )
                  )
                : "0"}
            </h6>
          </div>

          <div className="bg-white rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">
                Contacts per Company
              </span>
              <TeamIcon className="w-4 h-4 text-purple-600" />
            </div>
            <h6 className="text-xl font-bold text-gray-900">
              {summary.totalCompanies > 0
                ? (summary.totalContacts / summary.totalCompanies).toFixed(1)
                : "0"}
            </h6>
          </div>

          <div className="bg-white rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">
                Deal-to-Invoice Rate
              </span>
              <Percent className="w-4 h-4 text-orange-600" />
            </div>
            <h6 className="text-xl font-bold text-gray-900">
              {summary.totalDeals > 0
                ? ((summary.totalInvoices / summary.totalDeals) * 100).toFixed(
                    1
                  )
                : "0"}
              %
            </h6>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Analytics;
