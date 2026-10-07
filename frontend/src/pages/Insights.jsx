import CalendarIcon from "../components/common/CalendarIcon";
import AvgDealSizeIcon from "../components/common/AvgDealSizeIcon";
import PdfIcon from "../components/common/PdfIcon";
import VideoIcon from "../components/common/VideoIcon";
import CellphoneIcon from "../components/common/CellphoneIcon";
import DownloadIcon from "../components/common/DownloadIcon";
import React, { useEffect, useState, useMemo, useRef } from "react";
import { useTopLoadingSignal } from "../components/common/TopLoadingBar";
import logo from "/DataCircles.png";
import { formatNumberToIndian } from "../utils/numberFormatter";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart,
  ComposedChart,
  Legend,
  ScatterChart,
  Scatter,
  ZAxis,
  FunnelChart,
  Funnel,
  LabelList,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Building,
  Briefcase,
  Target,
  Mail,
  ShoppingCart,
  Package,
  UserCheck,
  BarChart3,
  X,
  RefreshCw,
  CheckCircle,
  Clock,
  AlertCircle,
  MapPin,
  ChevronDown as ExpandIcon,
  ChevronUp as CollapseIcon,
  Globe,
  ArrowUp,
  Minus,
  ArrowDown,
  ShoppingBag,
  Wallet,
  ClipboardList,
  IndianRupee,
  Trophy,
  XCircle,
  PieChartIcon,
  CheckSquare,
  IndianRupeeIcon,
  MessageSquare,
  Receipt,
  ChevronRight,
} from "lucide-react";
import API from "../services/api";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import FilterIcon from "../components/common/FilterIcon";
import StatTile from "../components/common/StatTile";

// Array of cool loading messages relevant for dashboard
const loadingMessages = [
  "Crunching data to show what really matters.",

  "Bringing clarity to your business performance.",

  "Smart insights are just a few seconds away!",

  "Let’s turn your CRM data into meaningful growth.",

  "Analyzing deals, invoices, and customers — hang tight!",

  "Your analytics dashboard is getting smarter!",

  "Insights that help you make data-backed decisions.",

  "Numbers that speak — visuals that inspire.",
];

// Select a random message
const randomMessage =
  loadingMessages[Math.floor(Math.random() * loadingMessages.length)];

// Horizontal funnel — the exact horn-shaped outline from the Figma source
// (5 overlapping bezier petals at decreasing opacity, forming one smooth
// silhouette) as a static background, with divider lines/labels/badges
// overlaid at real proportions for this org's actual stages. `stages` is an
// ordered array of { name, value, count, pct } (pct relative to the first
// stage) — sized for exactly 3 entries (Open/Won/Lost, this system's only
// fixed statuses) but degrades to N-1 dividers for any length.
const DealsFunnelChart = ({ stages }) => {
  if (!stages || stages.length === 0) return null;

  const SVG_W = 770;
  const SVG_H = 310;
  const n = stages.length;
  const midY = SVG_H / 2;
  const nameLabelY = SVG_H - 30;
  const valueLabelY = SVG_H - 12;
  const minH = SVG_H * 0.08;
  const maxH = SVG_H - 76;

  const values = stages.map((s) => Math.max(0, Number(s.value) || 0));
  const maxVal = Math.max(...values, 1);
  const heightFor = (v) => minH + (v / maxVal) * (maxH - minH);

  // Equal-width columns; each segment's left/right edge height is driven by
  // its stage's real value relative to the largest stage, so the shape
  // actually reflects the data instead of a fixed decorative silhouette.
  const boundaryX = Array.from({ length: n + 1 }, (_, i) => (i / n) * SVG_W);
  const boundaryH = [heightFor(values[0]), ...values.map((v) => heightFor(v))];

  // Last segment is a highlighted accent (full opacity); the rest taper
  // from solid down to faint, matching the original design's gradient feel
  // regardless of how many stages there are.
  const opacityFor = (i) => {
    if (i === n - 1) return 1;
    if (n <= 2) return 0.9;
    const t = i / (n - 2);
    return 0.9 - t * 0.7;
  };

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} width="100%" height="100%" style={{ overflow: "visible" }} preserveAspectRatio="none">
      {stages.map((stage, i) => {
        const x0 = boundaryX[i];
        const x1 = boundaryX[i + 1];
        const h0 = boundaryH[i];
        const h1 = boundaryH[i + 1];
        const top0 = midY - h0 / 2;
        const top1 = midY - h1 / 2;
        const bot1 = midY + h1 / 2;
        const bot0 = midY + h0 / 2;
        // S-curve control points at 60% of the segment's width so each
        // boundary tapers smoothly into the next instead of a hard corner —
        // reads as one continuous funnel silhouette instead of stacked bars.
        const cx = (x1 - x0) * 0.6;
        const d = [
          `M ${x0} ${top0}`,
          `C ${x0 + cx} ${top0}, ${x1 - cx} ${top1}, ${x1} ${top1}`,
          `L ${x1} ${bot1}`,
          `C ${x1 - cx} ${bot1}, ${x0 + cx} ${bot0}, ${x0} ${bot0}`,
          "Z",
        ].join(" ");
        // A separate stroke-only path tracing just the top curve — a thin
        // brighter rim-light along the crest of the silhouette, matching a
        // glossy/embossed funnel look rather than a flat fill.
        const topEdge = `M ${x0} ${top0} C ${x0 + cx} ${top0}, ${x1 - cx} ${top1}, ${x1} ${top1}`;
        return (
          <g key={stage.name}>
            <path d={d} fill="#0085FF" fillOpacity={opacityFor(i)} />
            <path d={topEdge} fill="none" stroke="#FFFFFF" strokeOpacity={0.6} strokeWidth={2} strokeLinecap="round" />
          </g>
        );
      })}

      {/* White divider lines between segments. */}
      {boundaryX.slice(1, -1).map((x, i) => (
        <line key={`divider-${i}`} x1={x} y1={midY - boundaryH[i + 1] / 2} x2={x} y2={midY + boundaryH[i + 1] / 2} stroke="#FFFFFF" strokeWidth={2} />
      ))}

      {/* Stage name with its value stacked directly below it, centered per segment. */}
      {stages.map((stage, i) => {
        const cx = (boundaryX[i] + boundaryX[i + 1]) / 2;
        return (
          <g key={`label-${stage.name}`}>
            <text x={cx} y={nameLabelY} textAnchor="middle" fontSize={13} fontWeight={600} fill="#0E121B">
              {stage.name}
            </text>
            <text x={cx} y={valueLabelY} textAnchor="middle" fontSize={12} fill="#525866">
              ₹{formatNumberToIndian(Math.round(values[i]))}
            </text>
          </g>
        );
      })}

      {/* Percentage badge centered in each segment. */}
      {stages.map((stage, i) => {
        const cx = (boundaryX[i] + boundaryX[i + 1]) / 2;
        return (
          <g key={`badge-${stage.name}`}>
            <rect x={cx - 26} y={midY - 14} width={52} height={28} rx={14} fill="#0F0E0E" />
            <text x={cx} y={midY + 5} textAnchor="middle" fontSize={14} fontWeight={600} fill="#FFFFFF">
              {stage.pct}%
            </text>
          </g>
        );
      })}
    </svg>
  );
};

// Asymmetric treemap for "Deals by Industry" — matches the Figma reference's
// layout shape (big cell top-left, tall cell bottom-right, two small cells
// splitting the remaining space) but cell sizes are proportional to each
// industry's real share of deal value, not fixed reference pixel heights.
// Handles 1-5 items; more than 5 shouldn't happen since callers cap at 4 +
// an "Others" bucket.
const DealsIndustryTreemap = ({ items }) => {
  if (!items || items.length === 0) return null;

  const colors = [
    { bg: "#0085FF", text: "#FFFFFF" },
    { bg: "rgba(0,133,255,0.75)", text: "#FFFFFF" },
    { bg: "#009FE0", text: "#FFFFFF" },
    { bg: "#FC9C32", text: "#1C1C1D" },
    { bg: "#E7E4E3", text: "#1C1C1D" },
  ];

  const Cell = ({ item, idx, style }) => (
    <div
      className="rounded flex flex-col justify-between p-4 min-h-0"
      style={{ background: colors[idx % colors.length].bg, color: colors[idx % colors.length].text, ...style }}
    >
      <span className="text-[15px] font-medium truncate">{item.name}</span>
      <div className="flex items-end justify-between gap-2">
        <span className="text-2xl font-medium">{item.pct}%</span>
        <span
          className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-white flex-shrink-0"
          style={{ color: "#21201F" }}
        >
          ₹{formatNumberToIndian(Math.round(item.value))}
        </span>
      </div>
    </div>
  );

  const [i0, i1, i2, i3, i4] = items;
  // Column split: left holds items 0/2/3, right holds items 1/4 — sized by
  // each column's share of the total so real data drives the proportions.
  const leftShare = (i0?.pct || 0) + (i2?.pct || 0) + (i3?.pct || 0);
  const rightShare = (i1?.pct || 0) + (i4?.pct || 0);
  const leftFlex = leftShare || 1;
  const rightFlex = rightShare || (items.length > 1 ? 1 : 0);

  if (items.length === 1) {
    return (
      <div className="flex gap-0.5" style={{ height: 327 }}>
        <Cell item={i0} idx={0} style={{ flex: 1 }} />
      </div>
    );
  }

  return (
    <div className="flex gap-0.5" style={{ height: 327 }}>
      <div className="flex flex-col gap-0.5" style={{ flex: leftFlex, minWidth: 0 }}>
        <Cell item={i0} idx={0} style={{ flex: i0.pct || 1 }} />
        {(i2 || i3) && (
          <div className="flex gap-0.5" style={{ flex: (i2?.pct || 0) + (i3?.pct || 0) || 1 }}>
            {i2 && <Cell item={i2} idx={2} style={{ flex: i2.pct || 1 }} />}
            {i3 && <Cell item={i3} idx={3} style={{ flex: i3.pct || 1 }} />}
          </div>
        )}
      </div>
      {(i1 || i4) && (
        <div className="flex flex-col gap-0.5" style={{ flex: rightFlex, minWidth: 0 }}>
          {i4 && <Cell item={i4} idx={4} style={{ flex: i4.pct || 1 }} />}
          {i1 && <Cell item={i1} idx={1} style={{ flex: i1.pct || 1 }} />}
        </div>
      )}
    </div>
  );
};

// Isolated so its hover state can't force the rest of the Insights page to
// re-render — see the comment at its call site.
const DealPipelineBar = ({ stageEntries, colors, totalDeals }) => {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  return (
    <div className="relative h-10 mb-4">
      {/* overflow-hidden lives on this inner wrapper, not the outer relative
          container above — the tooltip renders as a sibling positioned
          ABOVE the bar (negative top + translate), and clipping it here
          made it invisible on every hover despite the state updating fine. */}
      <div className="flex flex-row items-stretch gap-0.5 h-full rounded-lg overflow-hidden">
        {stageEntries.map(([stage, count], idx) => (
          <div
            key={stage}
            onMouseEnter={() => setHoveredIdx(idx)}
            onMouseLeave={() => setHoveredIdx((cur) => (cur === idx ? null : cur))}
            style={{
              background: colors[idx % colors.length],
              flexGrow: count,
              flexBasis: 0,
            }}
          />
        ))}
      </div>
      {hoveredIdx !== null && (() => {
        const [stage, count] = stageEntries[hoveredIdx];
        const pct = totalDeals > 0 ? Math.round((count / totalDeals) * 100) : 0;
        const color = colors[hoveredIdx % colors.length];
        // Tracks the actual hovered segment's horizontal center (by summed
        // share of totalDeals, matching each segment's flexGrow), same as
        // Recharts' own tooltip following the hovered point — clamped so it
        // can't push more than halfway off either edge of the bar.
        const before = stageEntries.slice(0, hoveredIdx).reduce((sum, [, c]) => sum + c, 0);
        const rawCenterPct = totalDeals > 0 ? ((before + count / 2) / totalDeals) * 100 : 50;
        const centerPct = Math.min(92, Math.max(8, rawCenterPct));
        return (
          <div
            className="absolute -top-2 z-10 pointer-events-none whitespace-nowrap"
            style={{ left: `${centerPct}%`, transform: "translate(-50%, -100%)" }}
          >
            <div className="bg-white border border-gray-200 rounded-md shadow-lg p-2">
              <p className="text-xs font-medium text-gray-500 mb-1.5">{stage}</p>
              <div className="flex items-center gap-1.5">
                <span className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background: color }} />
                <div>
                  <p className="text-[11px] text-gray-500 leading-tight">Deals</p>
                  <p className="text-xs font-medium text-gray-900 leading-tight">
                    {count} <span className="text-gray-400 font-normal">({pct}%)</span>
                  </p>
                </div>
              </div>
            </div>
            <div className="w-2 h-2 bg-white border-r border-b border-gray-200 rotate-45 mx-auto -mt-1" />
          </div>
        );
      })()}
    </div>
  );
};

const Insights = () => {
  const [activeTab, setActiveTab] = useState("overview");
  // The tab strip scrolls sideways when the 8 tabs don't fit. Keep the active
  // tab in view inside the strip (only the strip scrolls, never the page) so
  // switching tabs can't leave neighbours like "Overview" stranded off-screen.
  const tabStripRef = useRef(null);
  useEffect(() => {
    const strip = tabStripRef.current;
    const btn = strip?.querySelector(`[data-tab-id="${activeTab}"]`);
    if (!strip || !btn) return;
    const left = btn.offsetLeft - 8;
    const right = btn.offsetLeft + btn.offsetWidth + 8;
    if (left < strip.scrollLeft) strip.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
    else if (right > strip.scrollLeft + strip.clientWidth)
      strip.scrollTo({ left: right - strip.clientWidth, behavior: "smooth" });
  }, [activeTab]);
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [dateRange, setDateRange] = useState({
    startDate: "",
    endDate: "",
  });
  const [filters, setFilters] = useState({
    contactStatus: "all",
    companySize: "all",
    dealStage: "all",
    vendorStatus: "all",
    purchaseStatus: "all",
    poStatus: "all",
  });

  // Data states
  const [contacts, setContacts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [deals, setDeals] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [meetings, setMeetings] = useState([]);
  // Server-side analytics report (GET /api/insights/report). Phase 5 wires this
  // in additively: it is fetched alongside the existing requests and re-fetched
  // whenever the date range changes, carrying the browser's IANA timezone so the
  // report's calendar-month buckets line up with the client's local getMonth().
  // The legacy requests below are intentionally still active — every collection
  // still feeds Insights widgets the report does not yet cover (activity feed,
  // daily Revenue-vs-Spends, status distributions, funnel/velocity/industry,
  // etc.), so none can be removed until those widgets are migrated too.
  const [report, setReport] = useState(null);
  const [activityTab, setActivityTab] = useState("all");
  const [loading, setLoading] = useState(false);
  // Drive the top-edge progress bar from the page's real loading state, the same
  // 1:1 mapping every other page uses — the Insights skeleton alone never
  // signaled the shared bar, so it was missing here.
  useTopLoadingSignal(loading);
  const [expandedRows, setExpandedRows] = useState([]);
  const [selectedUser, setSelectedUser] = React.useState("all");
  const [kanbanStatuses, setKanbanStatuses] = useState(null);

  const toggleExpandRow = (companyId) => {
    setExpandedRows((prev) =>
      prev.includes(companyId)
        ? prev.filter((id) => id !== companyId)
        : [...prev, companyId]
    );
  };

  const truncateText = (text, maxLength = 30) => {
    if (!text) return "—";
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  const tabs = [
    {
      id: "overview",
      label: "Overview",
      icon: <TrendingUp className="w-4 h-4" />,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      id: "contacts",
      label: "Contacts",
      icon: <TeamIcon className="w-4 h-4" />,
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
    {
      id: "companies",
      label: "Companies",
      icon: <Building className="w-4 h-4" />,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
    },
    {
      id: "deals",
      label: "Deals",
      icon: <Briefcase className="w-4 h-4" />,
      color: "text-orange-600",
      bgColor: "bg-orange-50",
    },
    {
      id: "vendors",
      label: "Vendors",
      icon: <UserCheck className="w-4 h-4" />,
      color: "text-indigo-600",
      bgColor: "bg-indigo-50",
    },
    {
      id: "purchase-orders",
      label: "Purchase Orders",
      icon: <ShoppingCart className="w-4 h-4" />,
      color: "text-cyan-600",
      bgColor: "bg-cyan-50",
    },
    {
      id: "purchases",
      label: "Purchases",
      icon: <Package className="w-4 h-4" />,
      color: "text-pink-600",
      bgColor: "bg-pink-50",
    },
    {
      id: "invoices",
      label: "Invoices",
      icon: <PdfIcon className="w-4 h-4" />,
      color: "text-teal-600",
      bgColor: "bg-teal-50",
    },
  ];

  useEffect(() => {
    fetchData();
  }, []);

  // Fetch the server-side report. Additive and resilient: a failure leaves
  // `report` null and the page keeps working off the existing requests, so this
  // can never take Insights down. The date range mirrors the current UI exactly
  // (only sent when both ends are set, matching filteredData), and the browser's
  // IANA timezone is sent so month buckets match the client's local getMonth().
  const fetchReport = async (range, activeFilters) => {
    try {
      const params = {
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      if (range?.startDate && range?.endDate) {
        params.startDate = range.startDate;
        params.endDate = range.endDate;
      }
      // Phase 2: carry the same status filters the client applies in
      // filteredData so overviewStats / dailyTrends match the UI when a filter
      // is active. Only the four the backend understands are sent; "all" is
      // omitted (the backend treats a missing filter as no filter).
      if (activeFilters) {
        ["contactStatus", "dealStage", "purchaseStatus", "poStatus"].forEach((k) => {
          if (activeFilters[k] && activeFilters[k] !== "all") params[k] = activeFilters[k];
        });
      }
      const res = await API.get("/insights/report", { params });
      setReport(res.data || null);
    } catch (error) {
      console.warn("Insights report fetch failed (page falls back to client analytics):", error?.response?.status || error?.message);
      setReport(null);
    }
  };

  // Re-fetch the report whenever the date range changes — same trigger the
  // existing client-side filteredData already recomputes on.
  useEffect(() => {
    fetchReport(dateRange, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dateRange.startDate,
    dateRange.endDate,
    filters.contactStatus,
    filters.dealStage,
    filters.purchaseStatus,
    filters.poStatus,
  ]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [
        contactsRes,
        companiesRes,
        dealsRes,
        tasksRes,
        vendorsRes,
        purchaseOrdersRes,
        purchasesRes,
        invoicesRes,
        meetingsRes,
        kanbanRes,
      ] = await Promise.all([
        API.get("/contacts"),
        API.get("/companies"),
        API.get("/deals"),
        API.get("/tasks"),
        API.get("/vendors"),
        API.get("/purchase-orders"),
        API.get("/purchases"),
        API.get("/invoices"),
        API.get("/meetings").catch(() => ({ data: { meetings: [] } })),
        // The Deals pipeline stages are whatever's configured in Settings >
        // Kanban Settings, not a fixed Open/Won/Lost trio — Insights' deal
        // breakdowns should only ever show stages that currently exist
        // there, not stale statuses left behind on deals after a stage was
        // renamed/deleted.
        API.get("/kanban").catch(() => ({ data: null })),
      ]);

      setContacts(contactsRes.data);
      setCompanies(companiesRes.data);
      setDeals(dealsRes.data);
      setTasks(tasksRes.data);
      setVendors(vendorsRes.data);
      setPurchaseOrders(purchaseOrdersRes.data);
      setPurchases(purchasesRes.data);
      setInvoices(invoicesRes.data);
      setMeetings(meetingsRes.data?.meetings || meetingsRes.data || []);
      setKanbanStatuses(kanbanRes.data?.statuses || null);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Filter data based on date range and filters
  const filteredData = useMemo(() => {
    let filteredContacts = contacts;
    let filteredCompanies = companies;
    let filteredDeals = deals;
    let filteredVendors = vendors;
    let filteredPurchaseOrders = purchaseOrders;
    let filteredPurchases = purchases;
    let filteredInvoices = invoices;

    // Apply date filters
    if (dateRange.startDate && dateRange.endDate) {
      const startDate = new Date(dateRange.startDate);
      const endDate = new Date(dateRange.endDate);

      filteredContacts = contacts.filter((item) => {
        const createdAt = new Date(item.createdAt);
        return createdAt >= startDate && createdAt <= endDate;
      });

      filteredCompanies = companies.filter((item) => {
        const createdAt = new Date(item.createdAt);
        return createdAt >= startDate && createdAt <= endDate;
      });

      filteredDeals = deals.filter((item) => {
        const createdAt = new Date(item.createdAt);
        return createdAt >= startDate && createdAt <= endDate;
      });

      filteredVendors = vendors.filter((item) => {
        const createdAt = new Date(item.createdAt);
        return createdAt >= startDate && createdAt <= endDate;
      });

      filteredPurchaseOrders = purchaseOrders.filter((item) => {
        const orderDate = new Date(item.orderDate || item.createdAt);
        return orderDate >= startDate && orderDate <= endDate;
      });

      filteredPurchases = purchases.filter((item) => {
        const purchaseDate = new Date(item.purchaseDate || item.createdAt);
        return purchaseDate >= startDate && purchaseDate <= endDate;
      });

      filteredInvoices = invoices.filter((item) => {
        const invoiceDate = new Date(item.date || item.createdAt);
        return invoiceDate >= startDate && invoiceDate <= endDate;
      });
    }

    // Apply status filters
    if (filters.contactStatus !== "all") {
      filteredContacts = filteredContacts.filter(
        (contact) => contact.stageStatus === filters.contactStatus
      );
    }

    if (filters.dealStage !== "all") {
      filteredDeals = filteredDeals.filter(
        (deal) => deal.status === filters.dealStage
      );
    }

    if (filters.poStatus !== "all") {
      filteredPurchaseOrders = filteredPurchaseOrders.filter(
        (po) => po.status === filters.poStatus
      );
    }

    if (filters.purchaseStatus !== "all") {
      filteredPurchases = filteredPurchases.filter(
        (purchase) => purchase.status === filters.purchaseStatus
      );
    }

    return {
      filteredContacts,
      filteredCompanies,
      filteredDeals,
      filteredVendors,
      filteredPurchaseOrders,
      filteredPurchases,
      filteredInvoices,
    };
  }, [
    contacts,
    companies,
    deals,
    vendors,
    purchaseOrders,
    purchases,
    invoices,
    dateRange,
    filters,
  ]);

  // Generate chart data
  const chartData = useMemo(() => {
    const { filteredPurchaseOrders, filteredPurchases, filteredInvoices } = filteredData;

    // Daily trends — one bucket per calendar day, spanning from the
    // earliest record on file up to today (used by the "Revenue vs Business
    // Spends" chart, which scrolls horizontally across the whole range
    // instead of being capped at a fixed window).
    const dailyTrends = [];
    const dayMs = 24 * 60 * 60 * 1000;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    let rangeStart;
    let rangeEnd;
    if (dateRange.startDate && dateRange.endDate) {
      // A date filter is active on the strip — the chart's window should
      // match it exactly instead of silently expanding to today.
      rangeStart = new Date(dateRange.startDate);
      rangeStart.setHours(0, 0, 0, 0);
      rangeEnd = new Date(dateRange.endDate);
      rangeEnd.setHours(0, 0, 0, 0);
    } else {
      const allDatedRecords = [
        ...filteredInvoices.map((item) => item.date || item.createdAt),
        ...filteredPurchases.map((item) => item.purchaseDate || item.createdAt),
        ...filteredPurchaseOrders.map((item) => item.orderDate || item.createdAt),
      ]
        .map((d) => (d ? new Date(d) : null))
        .filter(Boolean);
      let earliestStart = todayStart;
      if (allDatedRecords.length > 0) {
        earliestStart = new Date(Math.min(...allDatedRecords.map((d) => d.getTime())));
        earliestStart.setHours(0, 0, 0, 0);
      }
      // Always show at least a 30-day window, even with no/recent-only data.
      const minStart = new Date(todayStart.getTime() - 29 * dayMs);
      rangeStart = earliestStart < minStart ? earliestStart : minStart;
      rangeEnd = todayStart;
    }
    const totalDays = Math.round((rangeEnd.getTime() - rangeStart.getTime()) / dayMs) + 1;

    for (let i = 0; i < totalDays; i++) {
      const day = new Date(rangeStart.getTime() + i * dayMs);
      const dayKey = day.toDateString();

      const revenue = filteredInvoices
        .filter((item) => {
          const d = item.date || item.createdAt;
          return d && new Date(d).toDateString() === dayKey;
        })
        .reduce((sum, item) => sum + (item.amount || 0), 0);

      const purchases = filteredPurchases
        .filter((item) => {
          const d = item.purchaseDate || item.createdAt;
          return d && new Date(d).toDateString() === dayKey;
        })
        .reduce((sum, item) => sum + (item.grandTotal || 0), 0);

      const vendorSpends = filteredPurchaseOrders
        .filter((item) => {
          const d = item.orderDate || item.createdAt;
          return d && new Date(d).toDateString() === dayKey;
        })
        .reduce((sum, item) => sum + (item.totalAmount || 0), 0);

      dailyTrends.push({
        date: day.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
        fullDate: day.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
        revenue,
        purchases,
        vendorSpends,
      });
    }

    return { dailyTrends };
  }, [filteredData]);

  // Export functions
  const exportToPDF = (reportType) => {
    const doc = new jsPDF();
    const {
      filteredContacts,
      filteredCompanies,
      filteredDeals,
      filteredVendors,
      filteredPurchaseOrders,
      filteredPurchases,
      filteredInvoices,
    } = filteredData;

    doc.setFontSize(20);
    doc.text(`${reportType} Report`, 20, 20);

    doc.setFontSize(12);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 20, 35);
    doc.text(
      `Date Range: ${dateRange.startDate || "All time"} - ${
        dateRange.endDate || "Present"
      }`,
      20,
      45
    );

    let data = [];
    let headers = [];

    switch (reportType) {
      case "Contacts":
        headers = ["Name", "Email", "Phone", "Company", "Status"];
        data = filteredContacts.map((contact) => [
          contact.name,
          contact.email,
          contact.phone || "",
          contact.company?.name || "",
          contact.stageStatus || "",
        ]);
        break;

      case "Companies":
        headers = ["Name", "Industry", "Size", "Location", "Website"];
        data = filteredCompanies.map((company) => [
          company.name,
          company.industry || "",
          company.size || "",
          company.location || "",
          company.website || "",
        ]);
        break;

      case "Deals":
        headers = ["Title", "Value", "Stage", "Company", "Close Date"];
        data = filteredDeals.map((deal) => [
          deal.title,
          `₹${deal.amount || 0}`,
          deal.status || "",
          deal.company?.name || "",
          deal.closeDate ? new Date(deal.closeDate).toLocaleDateString() : "",
        ]);
        break;

      case "Vendors":
        headers = ["Name", "Email", "Phone", "Company", "GSTIN", "Balance"];
        data = filteredVendors.map((vendor) => [
          vendor.name,
          vendor.email || "",
          vendor.phone || "",
          vendor.company || "",
          vendor.gstin || "",
          `₹${vendor.balance || 0}`,
        ]);
        break;

      case "Purchase Orders":
        headers = [
          "PO Number",
          "Vendor",
          "Order Date",
          "Total Amount",
          "Status",
        ];
        data = filteredPurchaseOrders.map((po) => [
          po.poNumber,
          po.vendor?.name || "",
          new Date(po.orderDate).toLocaleDateString(),
          `₹${po.totalAmount || 0}`,
          po.status || "",
        ]);
        break;

      case "Purchases":
        headers = [
          "Purchase Number",
          "Vendor",
          "Purchase Date",
          "Total Amount",
          "Status",
        ];
        data = filteredPurchases.map((purchase) => [
          purchase.purchaseNumber,
          purchase.vendor?.name || "",
          new Date(purchase.purchaseDate).toLocaleDateString(),
          `₹${purchase.grandTotal || 0}`,
          purchase.status || "",
        ]);
        break;

      case "Invoices":
        headers = [
          "Invoice Number",
          "Deal",
          "Amount",
          "Status",
          "Date",
          "Due Date",
        ];
        data = filteredInvoices.map((invoice) => [
          invoice.invoiceNumber,
          invoice.deal?.title || "",
          `₹${invoice.amount || 0}`,
          invoice.status || "",
          new Date(invoice.date).toLocaleDateString(),
          invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "",
        ]);
        break;
    }

    autoTable(doc, {
      head: [headers],
      body: data,
      startY: 60,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] },
    });

    doc.save(
      `${reportType}-report-${new Date().toISOString().split("T")[0]}.pdf`
    );
  };

  // Insights' own card is gone: it now renders the shared StatTile every
  // other page uses, so the KPI strip here matches Companies, Deals,
  // Inventory and the dashboard instead of being a second, taller design.
  // The prop signature is unchanged — 46 call sites keep working — and the
  // mapping happens here: title -> label, change -> the trailing subtitle,
  // color -> the icon's colour class.
  const StatCard = ({ title, value, icon, color, bgColor, change, changeLabel = "vs last month", trend }) => {
    // StatTile renders <Icon size={n} />; Insights passes a ready-made
    // element, so this adapter drops the size prop and sizes via className.
    const IconAdapter = () =>
      icon ? React.cloneElement(icon, { className: "w-5 h-5" }) : null;

    // `change` may be a plain number (legacy) or a { pct, isNew } object. isNew
    // means there was no prior-period baseline, so the card shows "New" instead
    // of a fabricated 100%.
    const c = change === undefined || change === null
      ? null
      : (typeof change === "object" ? change : { pct: change, isNew: false });
    const up = c ? (c.isNew || c.pct >= 0) : true;
    const noChange = c && !c.isNew && c.pct === 0;

    return (
      <StatTile
        tile={{
          label: title,
          value,
          icon: IconAdapter,
          iconClass: color,
          ...(change !== undefined
            ? {
                subtitle: c.isNew ? (/^new/i.test(changeLabel) ? changeLabel.charAt(0).toUpperCase() + changeLabel.slice(1) : `New ${changeLabel}`) : (noChange ? "No change" : `${c.pct >= 0 ? "+" : ""}${c.pct}% ${changeLabel}`),
                subtitleIcon: up ? TrendingUp : TrendingDown,
                subtitleColor: noChange ? "#6B7280" : (up ? "#00C950" : "#E82222"),
              }
            : {}),
        }}
      />
    );
  };

  const TableWrapper = ({ title, onExport, children }) => (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <button
            onClick={onExport}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors"
          >
            <DownloadIcon className="w-4 h-4" />
            Export PDF
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );

  const getStatusBadge = (status) => {
    const statusConfig = {
      New: {
        bg: "bg-blue-100",
        text: "text-blue-800",
        icon: <Clock className="w-3 h-3" />,
      },
      Contacted: {
        bg: "bg-yellow-100",
        text: "text-yellow-800",
        icon: <CellphoneIcon className="w-3 h-3" />,
      },
      Qualified: {
        bg: "bg-green-100",
        text: "text-green-800",
        icon: <CheckCircle className="w-3 h-3" />,
      },
      Won: {
        bg: "bg-green-100",
        text: "text-green-800",
        icon: <CheckCircle className="w-3 h-3" />,
      },
      Lost: {
        bg: "bg-red-100",
        text: "text-red-800",
        icon: <X className="w-3 h-3" />,
      },
      Pending: {
        bg: "bg-yellow-100",
        text: "text-yellow-800",
        icon: <Clock className="w-3 h-3" />,
      },
      Approved: {
        bg: "bg-green-100",
        text: "text-green-800",
        icon: <CheckCircle className="w-3 h-3" />,
      },
      Rejected: {
        bg: "bg-red-100",
        text: "text-red-800",
        icon: <X className="w-3 h-3" />,
      },
      Delivered: {
        bg: "bg-blue-100",
        text: "text-blue-800",
        icon: <CheckCircle className="w-3 h-3" />,
      },
      Draft: {
        bg: "bg-gray-100",
        text: "text-gray-800",
        icon: <PdfIcon className="w-4 h-4" />,
      },
      Paid: {
        bg: "bg-green-100",
        text: "text-green-800",
        icon: <CheckCircle className="w-3 h-3" />,
      },
      Sent: {
        bg: "bg-blue-100",
        text: "text-blue-800",
        icon: <Mail className="w-3 h-3" />,
      },
      Overdue: {
        bg: "bg-red-100",
        text: "text-red-800",
        icon: <AlertCircle className="w-3 h-3" />,
      },
      Cancelled: {
        bg: "bg-gray-100",
        text: "text-gray-800",
        icon: <X className="w-3 h-3" />,
      },
    };

    const config = statusConfig[status] || {
      bg: "bg-gray-100",
      text: "text-gray-800",
      icon: null,
    };

    return (
      <span
        className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-full ${config.bg} ${config.text}`}
      >
        {config.icon}
        {status || "None"}
      </span>
    );
  };

  // Business Activity feed: recent deal stage changes, completed tasks,
  // meetings, and invoice/payment events, merged into one timeline and
  // sorted newest-first. Notes aren't included since notes are only
  // fetched per-company/contact, not org-wide.
  const businessActivity = useMemo(() => {
    const items = [];

    deals.forEach((deal) => {
      const at = deal.updatedAt || deal.createdAt;
      if (!at) return;
      items.push({
        id: `deal-${deal._id}`,
        type: "deals",
        icon: <Briefcase className="w-4 h-4" />,
        iconBg: "bg-blue-100 text-blue-600",
        title: `Deal Moved to ${deal.status || "Update"}`,
        subtitle: [deal.title, deal.company?.name].filter(Boolean).join(" • "),
        at,
      });
    });

    tasks
      .filter((task) => task.status === "Completed")
      .forEach((task) => {
        const at = task.updatedAt || task.createdAt;
        if (!at) return;
        items.push({
          id: `task-${task._id}`,
          type: "tasks",
          icon: <CheckSquare className="w-4 h-4" />,
          iconBg: "bg-green-100 text-green-600",
          title: "Task Completed",
          subtitle: task.title || "Untitled task",
          at,
        });
      });

    meetings.forEach((meeting) => {
      const at = meeting.updatedAt || meeting.scheduledAt || meeting.createdAt;
      if (!at) return;
      const isCompleted = meeting.status === "Completed";
      items.push({
        id: `meeting-${meeting._id}`,
        type: "meetings",
        icon: <VideoIcon className="w-4 h-4" />,
        iconBg: "bg-purple-100 text-purple-600",
        title: isCompleted ? "Meeting Completed" : "Meeting Scheduled",
        subtitle: meeting.title || "Untitled meeting",
        at,
      });
    });

    invoices.forEach((invoice) => {
      const isOverdue =
        invoice.status !== "Paid" &&
        invoice.dueDate &&
        new Date(invoice.dueDate) < new Date();
      const at = invoice.updatedAt || invoice.dueDate || invoice.createdAt;
      if (!at) return;
      items.push({
        id: `invoice-${invoice._id}`,
        type: "invoices",
        icon: <PdfIcon className="w-4 h-4" />,
        iconBg: isOverdue ? "bg-red-100 text-red-600" : "bg-teal-100 text-teal-600",
        title: isOverdue
          ? `Invoice #${invoice.invoiceNumber} is overdue`
          : `Invoice #${invoice.invoiceNumber} — ${invoice.status}`,
        subtitle: `₹${formatNumberToIndian(invoice.amount || 0)}`,
        at,
      });
    });

    return items
      .filter((item) => item.at)
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, 20);
  }, [deals, tasks, meetings, invoices]);

  // Phase 2: the icon/color for each report activity item, matching the
  // client-side businessActivity exactly (invoices turn red when overdue).
  const activityVisualFor = (type, overdue) => {
    switch (type) {
      case "deals":
        return { icon: <Briefcase className="w-4 h-4" />, iconBg: "bg-blue-100 text-blue-600" };
      case "tasks":
        return { icon: <CheckSquare className="w-4 h-4" />, iconBg: "bg-green-100 text-green-600" };
      case "meetings":
        return { icon: <VideoIcon className="w-4 h-4" />, iconBg: "bg-purple-100 text-purple-600" };
      case "invoices":
        return {
          icon: <PdfIcon className="w-4 h-4" />,
          iconBg: overdue ? "bg-red-100 text-red-600" : "bg-teal-100 text-teal-600",
        };
      default:
        return { icon: null, iconBg: "" };
    }
  };
  // Prefer the server report's activity feed; fall back to the client-side
  // businessActivity when the report (or this section) is unavailable.
  const overviewActivity = Array.isArray(report?.activity)
    ? report.activity.map((it) => ({ ...it, ...activityVisualFor(it.type, it.overdue) }))
    : businessActivity;

  const filteredActivity =
    activityTab === "all"
      ? overviewActivity
      : overviewActivity.filter((item) => item.type === activityTab);

  const formatActivityDate = (at) => {
    const d = new Date(at);
    const datePart = d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const timePart = d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return `${datePart} • ${timePart}`;
  };

  // Phase 2: the Overview daily chart prefers the server report's series,
  // falling back to the client-side chartData.dailyTrends when the report (or
  // this section) is unavailable. Same row shape either way:
  // { date, fullDate, revenue, purchases, vendorSpends }.
  const overviewDailySeries =
    report?.dailyTrends?.series && report.dailyTrends.series.length
      ? report.dailyTrends.series
      : chartData.dailyTrends;

  const dailyTrendsRawMax = Math.max(
    1000,
    ...overviewDailySeries.map((d) => (d.revenue || 0) + (d.purchases || 0) + (d.vendorSpends || 0)),
  );
  // Round up to a "nice" step (multiple of 1000) so 5 evenly-spaced ticks
  // (0, step, 2*step, ...) land on clean numbers AND each one rounds to a
  // distinct "Xk" label — a step below 1000 made adjacent ticks (e.g. 500 &
  // 1000) collapse onto the same displayed "1k".
  const dailyTrendsStep = Math.ceil(dailyTrendsRawMax / 4 / 1000) * 1000 || 1000;
  const dailyTrendsYMax = dailyTrendsStep * 4;
  const dailyTrendsTicks = [0, 1, 2, 3, 4].map((i) => i * dailyTrendsStep);
  const formatDailyTrendsTick = (v) => (v === 0 ? "₹0" : `₹${Math.round(v / 1000)}k`);
  // Every 5th day's date label, but always force the last entry (today) in
  // too, so the active/current date is never skipped off the right edge.
  const dailyTrendsDateTicks = overviewDailySeries
    .map((d) => d.date)
    .filter((_, i, arr) => i % 5 === 0 || i === arr.length - 1);

  // Scrolls the trends chart to the right edge (today) on load, instead of
  // defaulting to the leftmost/earliest date.
  const trendsScrollRef = useRef(null);
  const scrollTrendsToToday = () => {
    const el = trendsScrollRef.current;
    if (el) el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
  };
  useEffect(() => {
    const el = trendsScrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
    // Re-run whenever the Overview tab becomes active again — the scroll
    // container unmounts/remounts on tab switch (losing its scroll
    // position), so scrolling only on data-length change isn't enough to
    // land back on today after navigating away and back.
  }, [overviewDailySeries.length, activeTab]);

  // Real month-over-month growth: newly-created (or summed-value) records
  // since the start of this month, as a percentage of whatever existed (or
  // summed to) before this month — mathematically identical to
  // (totalNow - totalBeforeThisMonth) / totalBeforeThisMonth, just computed
  // from the "this month" bucket directly. valueField sums that field
  // instead of counting records, for money-based tiles.
  const monthOverMonthChange = (items, dateField, valueField) => {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    let thisMonth = 0;
    let beforeThisMonth = 0;
    (items || []).forEach((item) => {
      const created = new Date(item?.[dateField]);
      if (isNaN(created.getTime())) return;
      const amount = valueField ? Number(item[valueField]) || 0 : 1;
      if (created >= monthStart) thisMonth += amount;
      else beforeThisMonth += amount;
    });
    if (beforeThisMonth > 0) return Math.round((thisMonth / beforeThisMonth) * 100);
    return thisMonth + beforeThisMonth > 0 ? 100 : 0;
  };

  const renderOverview = () => (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Contacts"
            value={report?.overviewStats ? report.overviewStats.totalContacts.count : filteredData.filteredContacts.length}
            icon={<TeamIcon className="w-6 h-6" />}
            color="text-blue-600"
            bgColor="bg-blue-50"
            change={report?.overviewStats ? report.overviewStats.totalContacts.mom : monthOverMonthChange(filteredData.filteredContacts, "createdAt")}
          />
          <StatCard
            title="Total Companies"
            value={report?.overviewStats ? report.overviewStats.totalCompanies.count : filteredData.filteredCompanies.length}
            icon={<Building className="w-6 h-6" />}
            color="text-green-600"
            bgColor="bg-green-50"
            change={report?.overviewStats ? report.overviewStats.totalCompanies.mom : monthOverMonthChange(filteredData.filteredCompanies, "createdAt")}
          />
          <StatCard
            title="Active Deals"
            value={report?.overviewStats ? report.overviewStats.activeDeals.count : filteredData.filteredDeals.length}
            icon={<Briefcase className="w-6 h-6" />}
            color="text-purple-600"
            bgColor="bg-purple-50"
            change={report?.overviewStats ? report.overviewStats.activeDeals.mom : monthOverMonthChange(filteredData.filteredDeals, "createdAt")}
          />
          <StatCard
            title="Total Vendors"
            value={report?.overviewStats ? report.overviewStats.totalVendors.count : filteredData.filteredVendors.length}
            icon={<UserCheck className="w-6 h-6" />}
            color="text-indigo-600"
            bgColor="bg-indigo-50"
            change={report?.overviewStats ? report.overviewStats.totalVendors.mom : monthOverMonthChange(filteredData.filteredVendors, "createdAt")}
          />
          <StatCard
            title="Total Deal Value"
            value={`₹${formatNumberToIndian(
              report?.overviewStats
                ? report.overviewStats.totalDealValue.value
                : filteredData.filteredDeals.reduce(
                    (sum, deal) => sum + (deal.amount || 0),
                    0
                  )
            )}`}
            icon={<IndianRupeeIcon className="w-6 h-6" />}
            color="text-orange-600"
            bgColor="bg-orange-50"
            change={report?.overviewStats ? report.overviewStats.totalDealValue.mom : monthOverMonthChange(filteredData.filteredDeals, "createdAt", "amount")}
          />
          <StatCard
            title="Total Purchases"
            value={`₹${formatNumberToIndian(
              report?.overviewStats
                ? report.overviewStats.totalPurchases.value
                : filteredData.filteredPurchases.reduce(
                    (sum, purchase) => sum + (purchase.grandTotal || 0),
                    0
                  )
            )}`}
            icon={<Package className="w-6 h-6" />}
            color="text-pink-600"
            bgColor="bg-pink-50"
            change={report?.overviewStats ? report.overviewStats.totalPurchases.mom : monthOverMonthChange(filteredData.filteredPurchases, "createdAt", "grandTotal")}
          />
          <StatCard
            title="Total Invoices"
            value={report?.overviewStats ? report.overviewStats.totalInvoices.count : filteredData.filteredInvoices.length}
            icon={<PdfIcon className="w-4 h-4" />}
            color="text-teal-600"
            bgColor="bg-teal-50"
            change={report?.overviewStats ? report.overviewStats.totalInvoices.mom : monthOverMonthChange(filteredData.filteredInvoices, "createdAt")}
          />
          <StatCard
            title="Total Invoice Value"
            value={`₹${formatNumberToIndian(
              report?.overviewStats
                ? report.overviewStats.totalInvoiceValue.value
                : filteredData.filteredInvoices.reduce(
                    (sum, inv) => sum + (inv.amount || 0),
                    0
                  )
            )}`}
            icon={<IndianRupeeIcon className="w-6 h-6" />}
            color="text-indigo-600"
            bgColor="bg-indigo-50"
            change={report?.overviewStats ? report.overviewStats.totalInvoiceValue.mom : monthOverMonthChange(filteredData.filteredInvoices, "createdAt", "amount")}
          />
        </div>
      </div>

      {/* Charts */}
      <div>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Monthly Trends — spans the same width as the first 3 KPI cards */}
          <div className="lg:col-span-3 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold leading-[120%] text-[#0E121B]">
                  Revenue vs Business Spends
                </h3>
                <button
                  onClick={scrollTrendsToToday}
                  className="h-7 px-3 rounded-full text-xs font-medium bg-[#F8F8FB] text-[#1F2937] hover:bg-gray-200 transition-colors flex-shrink-0"
                >
                  Today
                </button>
              </div>
              <div className="flex flex-row flex-wrap items-center gap-4">
                {[
                  { color: "#0085FF", label: "Revenue" },
                  { color: "#00C950", label: "Purchases" },
                  { color: "#D87000", label: "Vendor Spends" },
                ].map((legend) => (
                  <div key={legend.label} className="flex items-center gap-2">
                    <span
                      className="inline-block w-10 h-2 rounded-full flex-shrink-0"
                      style={{ background: legend.color }}
                    />
                    <span
                      className="text-xs font-normal leading-6"
                      style={{ color: "rgba(33, 32, 31, 0.56)" }}
                    >
                      {legend.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-row items-stretch" style={{ height: 380 }}>
              {/* Fixed Y-axis column, mirrors Dashboard's Sales Revenue widget */}
              <div style={{ width: 68, height: "100%", flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={overviewDailySeries} margin={{ top: 12, right: 0, left: 0, bottom: 8 }}>
                    <XAxis dataKey="date" tick={false} axisLine={false} tickLine={false} />
                    <YAxis
                      domain={[0, dailyTrendsYMax]}
                      ticks={dailyTrendsTicks}
                      tickFormatter={formatDailyTrendsTick}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      width={68}
                      tick={{ fontSize: 11, fontFamily: "Inter", fill: "rgba(33, 32, 31, 0.56)", textAnchor: "end" }}
                    />
                    <Area dataKey="revenue" stroke="none" fill="none" isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Scrollable X-axis — pans across the full data range instead of
                  being capped to a fixed window. */}
              <div
                ref={trendsScrollRef}
                className="dc-scroll-visible flex-1 min-w-0 overflow-x-auto overflow-y-hidden"
                style={{ height: "100%", cursor: "grab" }}
              >
                <div
                  style={{
                    minWidth: `${Math.max(100, (overviewDailySeries.length / 20) * 100)}%`,
                    height: "100%",
                  }}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={overviewDailySeries} margin={{ top: 12, right: 24, left: 8, bottom: 8 }}>
                      <defs>
                        <linearGradient
                          id="colorRevenue"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop offset="5%" stopColor="#0085FF" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#0085FF" stopOpacity={0.1} />
                        </linearGradient>
                        <linearGradient
                          id="colorPurchases"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop offset="5%" stopColor="#00C950" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#00C950" stopOpacity={0.1} />
                        </linearGradient>
                        <linearGradient id="colorVendorSpends" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#D87000" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#D87000" stopOpacity={0.1} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E7E4E3" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={20}
                        ticks={dailyTrendsDateTicks}
                        interval="preserveStart"
                        tick={{ fontSize: 12, fontFamily: "Inter", fill: "rgba(33, 32, 31, 0.56)" }}
                      />
                      <YAxis domain={[0, dailyTrendsYMax]} ticks={dailyTrendsTicks} hide />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#fff",
                          border: "1px solid #e5e7eb",
                          borderRadius: "8px",
                          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="#0085FF"
                        strokeWidth={2}
                        fill="none"
                      />
                      <Area
                        type="monotone"
                        dataKey="purchases"
                        stroke="#00C950"
                        strokeWidth={2}
                        fill="none"
                      />
                      <Area
                        type="monotone"
                        dataKey="vendorSpends"
                        stroke="#D87000"
                        strokeWidth={2}
                        fill="none"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>

          {/* Business Activity — remaining 1-column width, matching the 4th KPI card */}
          <div className="lg:col-span-1 bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col">
            <h3 className="text-base font-bold text-gray-900 mb-4">
              Business Activity
            </h3>
            <div className="flex flex-row flex-wrap items-center gap-2 mb-4 overflow-x-hidden">
              {[
                { id: "all", label: "All" },
                { id: "deals", label: "Deals" },
                { id: "tasks", label: "Tasks" },
                { id: "meetings", label: "Meetings" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActivityTab(tab.id)}
                  className={`flex items-center justify-center h-7 px-3 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                    activityTab === tab.id
                      ? "bg-[#0085FF] text-white"
                      : "bg-[#F8F8FB] text-[#1F2937]"
                  }`}
                  style={{ boxShadow: "0px 0px 6px rgba(0, 0, 0, 0.1)" }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="dc-scroll-visible relative flex-1 max-h-[380px] overflow-y-auto pl-4 pr-2">
              {filteredActivity.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">
                  No recent activity
                </p>
              ) : (
                <>
                  <div className="absolute left-8 top-2 bottom-2 w-px bg-gray-200" />
                  <div className="space-y-5">
                    {filteredActivity.map((item) => (
                      <div key={item.id} className="relative flex items-start gap-3">
                        <div
                          className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${item.iconBg}`}
                        >
                          {item.icon}
                        </div>
                        <div className="min-w-0 flex-1 pt-0.5">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {item.title}
                          </p>
                          {item.subtitle && (
                            <p className="text-xs text-gray-500 truncate">
                              {item.subtitle}
                            </p>
                          )}
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            {formatActivityDate(item.at)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sales Performance / Revenue & Collections / Deal Pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {(() => {
          const dealsForStats = filteredData.filteredDeals;
          // Overview values come from report.summary when available (it now
          // honors the Deal Stage filter, so these stay consistent with the
          // pipeline); the exact client calc remains the fallback.
          const rptSummary = report?.summary || null;
          const totalDeals = rptSummary ? rptSummary.totalDeals : dealsForStats.length;
          const wonDeals = dealsForStats.filter((d) => d.status === "Won").length;
          const lostDeals = dealsForStats.filter((d) => d.status === "Lost").length;
          const decidedDeals = wonDeals + lostDeals;
          // Phase 5: prefer the server report for cleanly-covered Overview
          // widgets, falling back to the exact client-side calc when the report
          // is unavailable/empty.
          const winRate = rptSummary
            ? rptSummary.winRate
            : (decidedDeals > 0 ? Math.round((wonDeals / decidedDeals) * 100) : 0);
          const totalDealValue = dealsForStats.reduce((sum, d) => sum + (d.amount || 0), 0);
          const avgDealSize = rptSummary
            ? rptSummary.avgDealSize
            : (totalDeals > 0 ? totalDealValue / totalDeals : 0);

          const invoicesForStats = filteredData.filteredInvoices;
          const clientRevenue = invoicesForStats.reduce((sum, inv) => sum + (inv.amount || 0), 0);
          const clientCollected = invoicesForStats
            .filter((inv) => inv.status === "Paid")
            .reduce((sum, inv) => sum + (inv.amount || 0), 0);
          const totalRevenue = rptSummary ? rptSummary.revenue : clientRevenue;
          const outstanding = rptSummary ? rptSummary.outstanding : clientRevenue - clientCollected;
          const collectionRate = rptSummary
            ? rptSummary.collectionRate
            : (clientRevenue > 0 ? Math.round((clientCollected / clientRevenue) * 100) : 0);

          const stageCounts = {};
          dealsForStats.forEach((d) => {
            const stage = d.status || "Unknown";
            stageCounts[stage] = (stageCounts[stage] || 0) + 1;
          });
          // Deal Pipeline — prefer report.pipeline (already sorted desc by count),
          // else the client stageCounts.
          const stageEntries = Array.isArray(report?.pipeline) && report.pipeline.length
            ? report.pipeline.map((p) => [p.stage, p.count])
            : Object.entries(stageCounts).sort((a, b) => b[1] - a[1]);
          const pipelineStageColors = ["#0085FF", "#0C4FCD", "#2E7D32", "#D97706", "#E82222", "#00C950"];

          // Monthly Invoiced / Collected / Outstanding for the Revenue &
          // Collections chart — 12 buckets by calendar month (all years
          // merged into one, same convention as the earlier monthlyTrends).
          const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          // Revenue & Collections — prefer report.revenueByMonth (same 12-month,
          // year-merged shape: { month, invoiced, collected, outstanding }), else
          // the client calc.
          const revenueCollectionsData = Array.isArray(report?.revenueByMonth) && report.revenueByMonth.length
            ? report.revenueByMonth
            : monthLabels.map((label, idx) => {
                const monthInvoices = invoicesForStats.filter((inv) => {
                  const d = inv.date || inv.createdAt;
                  return d && new Date(d).getMonth() === idx;
                });
                const invoiced = monthInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
                const monthCollected = monthInvoices
                  .filter((inv) => inv.status === "Paid")
                  .reduce((sum, inv) => sum + (inv.amount || 0), 0);
                return {
                  month: label,
                  invoiced,
                  collected: monthCollected,
                  outstanding: invoiced - monthCollected,
                };
              });

          // Sales Performance — prefer report.summary Won/Lost/Total, else client.
          const spWon = rptSummary ? rptSummary.wonDeals : wonDeals;
          const spLost = rptSummary ? rptSummary.lostDeals : lostDeals;
          const spTotal = rptSummary ? rptSummary.totalDeals : totalDeals;
          const openDeals = Math.max(0, spTotal - spWon - spLost);
          const salesPerformanceData = [
            { name: "Won", value: spWon, color: "#00C950" },
            { name: "Lost", value: spLost, color: "#E82222" },
            { name: "Open", value: openDeals, color: "#0085FF" },
          ];
          const hasAnyDeals = spTotal > 0;

          return (
            <>
              {/* Sales Performance */}
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <h3 className="text-base font-bold text-gray-900 mb-4">
                  Sales Performance
                </h3>
                {hasAnyDeals ? (
                  <div className="flex items-center gap-8">
                    <div className="relative flex-shrink-0" style={{ width: 148, height: 148 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={salesPerformanceData.filter((s) => s.value > 0)}
                            cx="50%"
                            cy="50%"
                            innerRadius={52}
                            outerRadius={74}
                            paddingAngle={salesPerformanceData.filter((s) => s.value > 0).length > 1 ? 2 : 0}
                            dataKey="value"
                            stroke="none"
                          >
                            {salesPerformanceData
                              .filter((s) => s.value > 0)
                              .map((entry) => (
                                <Cell key={entry.name} fill={entry.color} />
                              ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-[28px] font-semibold leading-tight text-[#0A0A0A]">
                          {winRate}%
                        </span>
                        <span className="text-[11px] font-medium text-[#525252]">
                          Win Rate
                        </span>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 space-y-3">
                      {salesPerformanceData.map((entry) => (
                        <div key={entry.name} className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-3 h-3 rounded-sm flex-shrink-0"
                              style={{ background: entry.color }}
                            />
                            <span className="text-sm font-medium text-[#0A0A0A] truncate">
                              {entry.name === "Open" ? "Open Deals" : `${entry.name} Deals`}
                            </span>
                          </div>
                          <span className="text-sm font-medium text-[#525252] flex-shrink-0">
                            {entry.value}
                          </span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
                        <span className="text-sm text-gray-500">Avg Deal Size</span>
                        <span className="text-sm font-semibold text-gray-900">
                          ₹{formatNumberToIndian(Math.round(avgDealSize))}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 py-10 text-center">No deals yet</p>
                )}
              </div>

              {/* Revenue & Collections */}
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <h3 className="text-base font-bold text-gray-900">
                    Revenue &amp; Collections
                  </h3>
                  {totalRevenue > 0 && (
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-[11px] text-gray-500 leading-tight">Outstanding</p>
                        <p className="text-sm font-semibold text-[#E82222] leading-tight">
                          ₹{formatNumberToIndian(Math.round(outstanding))}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-gray-500 leading-tight">Collection Rate</p>
                        <p className="text-sm font-semibold text-[#00C950] leading-tight">
                          {collectionRate}%
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                {totalRevenue === 0 ? (
                  <p className="text-sm text-gray-400 py-10 text-center">No invoices yet</p>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={revenueCollectionsData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorInvoiced" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#0085FF" stopOpacity={0.6} />
                            <stop offset="95%" stopColor="#0085FF" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="colorCollected" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#0F766E" stopOpacity={0.6} />
                            <stop offset="95%" stopColor="#0F766E" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="colorOutstanding" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#E82222" stopOpacity={0.6} />
                            <stop offset="95%" stopColor="#E82222" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" vertical={false} />
                        <XAxis
                          dataKey="month"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 11, fontFamily: "Inter", fill: "#525252" }}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          width={40}
                          tickFormatter={(v) => (v === 0 ? "₹0" : `₹${(v / 100000).toFixed(0)}L`)}
                          tick={{ fontSize: 10, fontFamily: "Inter", fill: "#525252" }}
                        />
                        <Tooltip
                          content={({ active, payload, label }) => {
                            if (!active || !payload || payload.length === 0) return null;
                            const row = payload[0].payload;
                            const rows = [
                              { label: "Invoiced", value: row.invoiced, color: "#0085FF" },
                              { label: "Collected", value: row.collected, color: "#00C950" },
                              { label: "Outstanding", value: row.outstanding, color: "#E82222" },
                            ];
                            return (
                              <div className="bg-white border border-gray-200 rounded-md shadow-lg p-2">
                                <p className="text-xs font-medium text-gray-500 mb-1.5">{label}</p>
                                <div className="space-y-1.5">
                                  {rows.map((r) => (
                                    <div key={r.label} className="flex items-center gap-1.5">
                                      <span
                                        className="w-1 self-stretch rounded-full flex-shrink-0"
                                        style={{ background: r.color }}
                                      />
                                      <div>
                                        <p className="text-[11px] text-gray-500 leading-tight">{r.label}</p>
                                        <p className="text-xs font-medium text-gray-900 leading-tight">
                                          ₹{formatNumberToIndian(Math.round(r.value))}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          }}
                        />
                        <Area type="monotone" dataKey="invoiced" stroke="#0085FF" strokeWidth={2} fill="url(#colorInvoiced)" />
                        <Area type="monotone" dataKey="collected" stroke="#0F766E" strokeWidth={2} fill="url(#colorCollected)" />
                        <Area type="monotone" dataKey="outstanding" stroke="#E82222" strokeWidth={2} fill="url(#colorOutstanding)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </>
                )}
              </div>

              {/* Deal Pipeline */}
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-[#0E121B]">Deal Pipeline</h3>
                  <p className="text-xs text-[#525866] mt-0.5">Active Opportunities by Stage</p>
                </div>
                {stageEntries.length === 0 ? (
                  <p className="text-sm text-gray-400 py-10 text-center">No deals yet</p>
                ) : (
                  <>
                    {/* Segmented bar — one block per stage, sized by share of total.
                        Its hover tooltip owns its own state (see
                        DealPipelineBar below) rather than living on this
                        page's own state — that state lived here originally,
                        and every hover re-rendered the whole Insights render
                        function, replaying Recharts' axis-tick enter
                        animation on the unrelated Sales Trend / Revenue &
                        Collections charts above (a visible "blink" on their
                        x-axis labels for a hover that had nothing to do with
                        them). */}
                    <DealPipelineBar
                      stageEntries={stageEntries}
                      colors={pipelineStageColors}
                      totalDeals={totalDeals}
                    />
                    <div className="border-t border-gray-100 pt-3 space-y-3">
                      {stageEntries.map(([stage, count], idx) => (
                        <div key={stage} className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                              style={{ background: pipelineStageColors[idx % pipelineStageColors.length] }}
                            />
                            <span className="text-xs font-medium text-[#0A0A0A] truncate">{stage}</span>
                          </div>
                          <span className="text-xs text-[#525252] flex-shrink-0">
                            {count} ({Math.round((count / totalDeals) * 100)}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );

  const renderContactsReport = () => {
    // Calculate metrics
    const totalContacts = filteredData.filteredContacts.length;
    const contactsWithPhone = filteredData.filteredContacts.filter(
      (c) => c.phone
    ).length;
    const contactsWithCompany = filteredData.filteredContacts.filter(
      (c) => c.company?.name
    ).length;
    const contactIdsWithDeals = new Set(
      filteredData.filteredDeals.filter((d) => d.contact).map((d) => d.contact._id || d.contact)
    );
    const contactsWithDeals = filteredData.filteredContacts.filter((c) =>
      contactIdsWithDeals.has(c._id)
    ).length;
    const wonContacts = filteredData.filteredContacts.filter(
      (c) => c.stageStatus === "Won"
    ).length;
    const lostContacts = filteredData.filteredContacts.filter(
      (c) => c.stageStatus === "Lost"
    ).length;

    // Status distribution
    const statusDistribution = filteredData.filteredContacts.reduce(
      (acc, contact) => {
        const status = contact.stageStatus || "Unknown";
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      },
      {}
    );

    // Contacts created this month
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const contactsThisMonth = filteredData.filteredContacts.filter((c) => {
      const createdDate = new Date(c.createdAt);
      return (
        createdDate.getMonth() === currentMonth &&
        createdDate.getFullYear() === currentYear
      );
    }).length;
    // Total Contacts card's trend: how many contacts existed at the start of
    // this month vs the current total, i.e. growth over the current month.
    const monthStart = new Date(currentYear, currentMonth, 1);
    const contactsBeforeThisMonth = filteredData.filteredContacts.filter(
      (c) => new Date(c.createdAt) < monthStart
    ).length;
    const totalContactsChange =
      contactsBeforeThisMonth > 0
        ? { pct: Math.round((contactsThisMonth / contactsBeforeThisMonth) * 100), isNew: false }
        : { pct: 0, isNew: totalContacts > 0 };
    // New Contacts card's trend: this month's new contacts vs last month's.
    const lastMonthDate = new Date(currentYear, currentMonth - 1, 1);
    const lastMonth = lastMonthDate.getMonth();
    const lastMonthYear = lastMonthDate.getFullYear();
    const contactsLastMonth = filteredData.filteredContacts.filter((c) => {
      const createdDate = new Date(c.createdAt);
      return (
        createdDate.getMonth() === lastMonth &&
        createdDate.getFullYear() === lastMonthYear
      );
    }).length;
    const newContactsChange =
      contactsLastMonth > 0
        ? { pct: Math.round(((contactsThisMonth - contactsLastMonth) / contactsLastMonth) * 100), isNew: false }
        : { pct: 0, isNew: contactsThisMonth > 0 };
    // Contacts with Deals card's trend: deals opened (linked to a contact)
    // this month vs last month.
    const dealsWithContactThisMonth = filteredData.filteredDeals.filter((d) => {
      if (!d.contact) return false;
      const createdDate = new Date(d.createdAt);
      return (
        createdDate.getMonth() === currentMonth &&
        createdDate.getFullYear() === currentYear
      );
    }).length;
    const dealsWithContactLastMonth = filteredData.filteredDeals.filter((d) => {
      if (!d.contact) return false;
      const createdDate = new Date(d.createdAt);
      return (
        createdDate.getMonth() === lastMonth &&
        createdDate.getFullYear() === lastMonthYear
      );
    }).length;
    const contactsWithDealsChange =
      dealsWithContactLastMonth > 0
        ? { pct: Math.round(((dealsWithContactThisMonth - dealsWithContactLastMonth) / dealsWithContactLastMonth) * 100), isNew: false }
        : { pct: 0, isNew: dealsWithContactThisMonth > 0 };
    // Won/Lost Contacts cards' trend: contacts of that status created this
    // month vs last month.
    const wonContactsThisMonth = filteredData.filteredContacts.filter((c) => {
      if (c.stageStatus !== "Won") return false;
      const createdDate = new Date(c.createdAt);
      return createdDate.getMonth() === currentMonth && createdDate.getFullYear() === currentYear;
    }).length;
    const wonContactsLastMonth = filteredData.filteredContacts.filter((c) => {
      if (c.stageStatus !== "Won") return false;
      const createdDate = new Date(c.createdAt);
      return createdDate.getMonth() === lastMonth && createdDate.getFullYear() === lastMonthYear;
    }).length;
    const wonContactsChange =
      wonContactsLastMonth > 0
        ? { pct: Math.round(((wonContactsThisMonth - wonContactsLastMonth) / wonContactsLastMonth) * 100), isNew: false }
        : { pct: 0, isNew: wonContactsThisMonth > 0 };

    const lostContactsThisMonth = filteredData.filteredContacts.filter((c) => {
      if (c.stageStatus !== "Lost") return false;
      const createdDate = new Date(c.createdAt);
      return createdDate.getMonth() === currentMonth && createdDate.getFullYear() === currentYear;
    }).length;
    const lostContactsLastMonth = filteredData.filteredContacts.filter((c) => {
      if (c.stageStatus !== "Lost") return false;
      const createdDate = new Date(c.createdAt);
      return createdDate.getMonth() === lastMonth && createdDate.getFullYear() === lastMonthYear;
    }).length;
    const lostContactsChange =
      lostContactsLastMonth > 0
        ? { pct: Math.round(((lostContactsThisMonth - lostContactsLastMonth) / lostContactsLastMonth) * 100), isNew: false }
        : { pct: 0, isNew: lostContactsThisMonth > 0 };


    return (
      <div className="space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            title="Total Contacts"
            value={totalContacts}
            icon={<TeamIcon className="w-6 h-6" />}
            color="text-blue-600"
            bgColor="bg-blue-50"
            change={totalContactsChange}
            changeLabel="growth this month"
          />
          <StatCard
            title="New Contacts"
            value={contactsThisMonth}
            icon={<TrendingUp className="w-6 h-6" />}
            color="text-green-600"
            bgColor="bg-green-50"
            change={newContactsChange}
            changeLabel="vs last month"
          />
          <StatCard
            title="Contacts with Deals"
            value={contactsWithDeals}
            icon={<Briefcase className="w-6 h-6" />}
            color="text-purple-600"
            bgColor="bg-purple-50"
            change={contactsWithDealsChange}
            changeLabel="new deals vs last month"
          />
          <StatCard
            title="Won Contacts"
            value={wonContacts}
            icon={<CheckSquare className="w-6 h-6" />}
            color="text-emerald-600"
            bgColor="bg-emerald-50"
            change={wonContactsChange}
            changeLabel="wins vs last month"
          />
          <StatCard
            title="Lost Contacts"
            value={lostContacts}
            icon={<XCircle className="w-6 h-6" />}
            color="text-red-600"
            bgColor="bg-red-50"
            change={lostContactsChange}
            changeLabel="losses vs last month"
          />
        </div>

        {(() => {
          // No true "lead source" field exists on Contact yet, so this
          // reuses stageStatus as the closest available breakdown of "where
          // contacts stand" until a real acquisition-source field is added.
          const sourceColors = ["#0085FF", "#34C759", "#8E62EF", "#2A2726", "#E7E4E3", "#D97706", "#EC4899"];
          const sourceEntries = Object.entries(statusDistribution).sort((a, b) => b[1] - a[1]);
          const sourceData = sourceEntries.map(([status, count], idx) => ({
            name: status,
            value: count,
            color: sourceColors[idx % sourceColors.length],
          }));

          // Contact Commercial Impact heatmap — deal value tied to contacts,
          // bucketed by day-of-week x the last 6 weeks, using each deal's
          // amount as the "impact" intensity for the day it was created.
          const impactWeeks = 6;
          const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
          const todayForHeatmap = new Date();
          todayForHeatmap.setHours(0, 0, 0, 0);
          const mondayOffset = (todayForHeatmap.getDay() + 6) % 7; // days since this week's Monday
          const currentWeekMonday = new Date(todayForHeatmap.getTime() - mondayOffset * 24 * 60 * 60 * 1000);
          const impactGrid = Array.from({ length: impactWeeks }, () => Array(7).fill(0));
          filteredData.filteredDeals
            .filter((d) => d.contact && d.createdAt)
            .forEach((d) => {
              const createdAt = new Date(d.createdAt);
              createdAt.setHours(0, 0, 0, 0);
              const daysAgo = Math.round((currentWeekMonday.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000));
              const weeksAgo = Math.floor(daysAgo / 7);
              const rowFromBottom = impactWeeks - 1 - weeksAgo;
              if (rowFromBottom < 0 || rowFromBottom >= impactWeeks) return;
              const dayCol = 6 - (daysAgo - weeksAgo * 7);
              if (dayCol < 0 || dayCol > 6) return;
              impactGrid[rowFromBottom][dayCol] += d.amount || 0;
            });
          const impactMax = Math.max(1, ...impactGrid.flat());
          const impactOpacity = (value) => {
            if (value === 0) return 0.1;
            const ratio = value / impactMax;
            if (ratio > 0.6) return 1;
            if (ratio > 0.35) return 0.75;
            if (ratio > 0.15) return 0.5;
            return 0.25;
          };

          // Contact Commercial Impact: deals tied to a contact, their KPI
          // rollups, and a scatter of each deal (month created x amount)
          // colored by outcome.
          const dealsWithContact = filteredData.filteredDeals.filter((d) => d.contact);
          const pipelineInfluenced = dealsWithContact.reduce((sum, d) => sum + (d.amount || 0), 0);
          const wonDealsWithContact = dealsWithContact.filter((d) => d.status === "Won");
          const revenueWon = wonDealsWithContact.reduce((sum, d) => sum + (d.amount || 0), 0);
          const avgDealInfluenced =
            dealsWithContact.length > 0 ? pipelineInfluenced / dealsWithContact.length : 0;
          const formatCr = (v) => {
            if (v >= 1e7) return `₹${(v / 1e7).toFixed(1)} Cr`;
            if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
            if (v >= 1e3) return `₹${(v / 1e3).toFixed(1)}k`;
            return `₹${Math.round(v)}`;
          };
          const dealsForScatter = dealsWithContact.filter((d) => d.createdAt);
          const scatterAmountMax = Math.max(1, ...dealsForScatter.map((d) => d.amount || 0));
          const valueTierColor = (amount) => {
            const ratio = amount / scatterAmountMax;
            if (ratio > 0.66) return { fill: "#148FFF", tier: "High Value" };
            if (ratio > 0.33) return { fill: "#FFA908", tier: "Medium Value" };
            return { fill: "#8E62EF", tier: "Low Value" };
          };
          const scatterPoints = dealsForScatter.map((d) => {
            const { fill, tier } = valueTierColor(d.amount || 0);
            const createdDate = new Date(d.createdAt);
            const daysInMonth = new Date(
              createdDate.getFullYear(),
              createdDate.getMonth() + 1,
              0,
            ).getDate();
            // Spread points across each month based on the actual day of
            // the deal's creation, instead of stacking every deal from the
            // same month on one exact X position.
            const monthFraction = (createdDate.getDate() - 1) / daysInMonth;
            return {
              month: createdDate.getMonth() + monthFraction,
              amount: d.amount || 0,
              stage: d.status,
              title: d.title,
              fill,
              tier,
            };
          });

          return (
            <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm min-h-[560px]">
                <h3 className="text-sm font-semibold text-[#0E121B]">Contact Commercial Impact</h3>
                <p className="text-xs text-[#525866] mt-1">
                  Connect relationship activity with pipeline and revenue outcomes.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5 pb-5 border-b border-[#E1E4EA]">
                  <StatCard
                    title="Pipeline Influenced"
                    value={formatCr(pipelineInfluenced)}
                    icon={<Briefcase className="w-6 h-6" />}
                    color="text-blue-600"
                  />
                  <StatCard
                    title="Revenue Won"
                    value={formatCr(revenueWon)}
                    icon={<CheckSquare className="w-6 h-6" />}
                    color="text-emerald-600"
                  />
                  <StatCard
                    title="Avg. Deal Influenced"
                    value={formatCr(avgDealInfluenced)}
                    icon={<IndianRupee className="w-6 h-6" />}
                    color="text-purple-600"
                  />
                </div>

                {scatterPoints.length === 0 ? (
                  <p className="text-sm text-gray-400 py-16 text-center">No deals tied to contacts yet</p>
                ) : (
                  <ResponsiveContainer width="100%" height={340}>
                    <ScatterChart margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E7E7E7" />
                      <XAxis
                        dataKey="month"
                        type="number"
                        domain={[0, 12]}
                        ticks={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]}
                        tickFormatter={(m) =>
                          ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m]
                        }
                        tick={{ fontSize: 11, fill: "rgba(31, 31, 33, 0.56)" }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        dataKey="amount"
                        tickFormatter={(v) => formatCr(v)}
                        tick={{ fontSize: 10, fill: "rgba(31, 31, 33, 0.56)" }}
                        tickLine={false}
                        axisLine={false}
                        width={56}
                      />
                      <Tooltip
                        cursor={{ strokeDasharray: "3 3" }}
                        formatter={(value, name) => (name === "amount" ? formatCr(value) : value)}
                        content={({ active, payload }) => {
                          if (!active || !payload || payload.length === 0) return null;
                          const p = payload[0].payload;
                          return (
                            <div className="bg-white border border-gray-200 rounded-md shadow-lg p-2 text-xs">
                              <p className="font-medium text-gray-900">{p.title || "Deal"}</p>
                              <p className="text-gray-500">{formatCr(p.amount)} • {p.tier} • {p.stage}</p>
                            </div>
                          );
                        }}
                      />
                      <Scatter
                        data={scatterPoints}
                        shape={(props) => {
                          const { cx, cy, payload } = props;
                          // Anchor the square's bottom edge at the data point
                          // instead of centering on it — with a ₹0 y-axis
                          // floor, a centered square for a near-zero amount
                          // would render half below the x-axis line.
                          return (
                            <rect
                              x={cx - 8}
                              y={cy - 16}
                              width={16}
                              height={16}
                              rx={4}
                              fill={payload.fill}
                              fillOpacity={0.9}
                            />
                          );
                        }}
                      />
                    </ScatterChart>
                  </ResponsiveContainer>
                )}
                {scatterPoints.length > 0 && (
                  <div className="flex flex-row flex-wrap justify-center items-center gap-4 mt-2">
                    {[
                      { color: "#148FFF", label: "High Value" },
                      { color: "#FFA908", label: "Medium Value" },
                      { color: "#8E62EF", label: "Low Value" },
                    ].map((legend) => (
                      <div key={legend.label} className="flex items-center gap-2">
                        <span
                          className="w-4 h-4 rounded flex-shrink-0"
                          style={{ background: legend.color }}
                        />
                        <span
                          className="text-sm"
                          style={{ color: "rgba(31, 31, 33, 0.56)" }}
                        >
                          {legend.label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-4">
                <div className="bg-white p-5 rounded-xl border border-[#E7E4E3] shadow-sm min-h-[272px]">
                  <h3 className="text-sm font-semibold text-[#0E121B]">Contact Commercial Impact</h3>
                  <p className="text-xs text-[#525866] mt-1">
                    Deal value tied to contacts, by day of week
                  </p>
                  <div className="mt-4 flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-1">
                      {dayLabels.map((d) => (
                        <span
                          key={d}
                          className="flex-1 text-center text-[10px]"
                          style={{ color: "rgba(33, 32, 31, 0.56)" }}
                        >
                          {d}
                        </span>
                      ))}
                    </div>
                    {impactGrid.map((row, rowIdx) => (
                      <div key={rowIdx} className="flex items-center gap-1">
                        {row.map((value, colIdx) => (
                          <div
                            key={colIdx}
                            title={`₹${formatNumberToIndian(Math.round(value))}`}
                            className="flex-1 rounded"
                            style={{
                              height: 20,
                              background: `rgba(0, 133, 255, ${impactOpacity(value)})`,
                            }}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-end gap-2 mt-3">
                    <span className="text-[10px]" style={{ color: "rgba(33, 32, 31, 0.56)" }}>
                      Low
                    </span>
                    {[0.1, 0.25, 0.5, 0.75, 1].map((op) => (
                      <span
                        key={op}
                        className="rounded-sm"
                        style={{ width: 16, height: 12, background: `rgba(0, 133, 255, ${op})` }}
                      />
                    ))}
                    <span className="text-[10px]" style={{ color: "rgba(33, 32, 31, 0.56)" }}>
                      High
                    </span>
                  </div>
                </div>
                <div className="bg-white p-5 rounded-xl border border-[#E7E4E3] shadow-sm min-h-[272px]">
                  <h3 className="text-sm font-semibold text-[#0E121B]">Contact Acquisition Sources</h3>
                  <p className="text-xs text-[#525866] mt-1">Where your contacts are coming from</p>
                  {totalContacts === 0 ? (
                    <p className="text-sm text-gray-400 py-10 text-center">No contacts yet</p>
                  ) : (
                    <div className="flex items-center justify-between gap-4 mt-4 flex-wrap">
                      <div className="relative flex-shrink-0" style={{ width: 160, height: 160 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={sourceData}
                              cx="50%"
                              cy="50%"
                              innerRadius={50}
                              outerRadius={80}
                              cornerRadius={3}
                              paddingAngle={sourceData.length > 1 ? 2 : 0}
                              dataKey="value"
                              stroke="none"
                              label={({ cx, cy, midAngle, innerRadius, outerRadius, value }) => {
                                const RADIAN = Math.PI / 180;
                                const r = (innerRadius + outerRadius) / 2;
                                const x = cx + r * Math.cos(-midAngle * RADIAN);
                                const y = cy + r * Math.sin(-midAngle * RADIAN);
                                const pct = Math.round((value / totalContacts) * 100);
                                const text = `${pct}%`;
                                const w = text.length * 6 + 10;
                                return (
                                  <g>
                                    <rect
                                      x={x - w / 2}
                                      y={y - 8}
                                      width={w}
                                      height={16}
                                      rx={6}
                                      fill="#FFFFFF"
                                    />
                                    <text
                                      x={x}
                                      y={y}
                                      textAnchor="middle"
                                      dominantBaseline="central"
                                      fontSize={11}
                                      fontWeight={500}
                                      fill="#21201F"
                                    >
                                      {text}
                                    </text>
                                  </g>
                                );
                              }}
                              labelLine={false}
                            >
                              {sourceData.map((entry) => (
                                <Cell key={entry.name} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex flex-col gap-1.5 max-w-[220px] flex-shrink-0">
                        {sourceData.map((entry) => (
                          <div key={entry.name} className="flex items-center gap-1.5">
                            <span
                              className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                              style={{ background: entry.color }}
                            />
                            <span className="text-xs text-[#21201F]/70 truncate min-w-[80px]">{entry.name}</span>
                            <span className="text-[11px] text-[#525866] text-right flex-shrink-0 ml-4">
                              {Math.round((entry.value / totalContacts) * 100)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {(() => {
          const dayMs = 24 * 60 * 60 * 1000;
          const nowTs = Date.now();
          const dealsByContactId = {};
          filteredData.filteredDeals.forEach((d) => {
            const cid = d.contact?._id || d.contact;
            if (!cid) return;
            if (!dealsByContactId[cid]) dealsByContactId[cid] = [];
            dealsByContactId[cid].push(d);
          });

          // Card 1: Contact Alerts — real, computed from contacts + their deals.
          const contactsWithAnyDeal = filteredData.filteredContacts.filter(
            (c) => dealsByContactId[c._id]?.length > 0,
          );
          const coldContacts = contactsWithAnyDeal.filter((c) =>
            dealsByContactId[c._id].every(
              (d) => nowTs - new Date(d.updatedAt || d.createdAt).getTime() > 30 * dayMs,
            ),
          );
          const coldPipeline = coldContacts.reduce(
            (sum, c) => sum + dealsByContactId[c._id].reduce((s, d) => s + (d.amount || 0), 0),
            0,
          );
          const followUpContacts = filteredData.filteredContacts.filter(
            (c) => c.stageStatus === "Contacted" || c.stageStatus === "New",
          );
          const followUpPipeline = followUpContacts.reduce(
            (sum, c) => sum + (dealsByContactId[c._id] || []).reduce((s, d) => s + (d.amount || 0), 0),
            0,
          );
          const noOwnerContacts = filteredData.filteredContacts.filter((c) => !c.user);
          const noOwnerPipeline = noOwnerContacts.reduce(
            (sum, c) => sum + (dealsByContactId[c._id] || []).reduce((s, d) => s + (d.amount || 0), 0),
            0,
          );
          // Contacts with at least one overdue invoice on a linked deal.
          const overdueInvoicesByContactId = {};
          filteredData.filteredInvoices
            .filter((inv) => inv.status === "Overdue" && inv.deal?.contact)
            .forEach((inv) => {
              const cid = inv.deal.contact?._id || inv.deal.contact;
              if (!cid) return;
              if (!overdueInvoicesByContactId[cid]) overdueInvoicesByContactId[cid] = [];
              overdueInvoicesByContactId[cid].push(inv);
            });
          const overdueContacts = filteredData.filteredContacts.filter(
            (c) => overdueInvoicesByContactId[c._id]?.length > 0,
          );
          const overduePipeline = Object.values(overdueInvoicesByContactId)
            .flat()
            .reduce((sum, inv) => sum + (inv.amount || 0), 0);
          const formatCrAlert = (v) => {
            if (v >= 1e7) return `₹${(v / 1e7).toFixed(1)} Cr`;
            if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
            if (v >= 1e3) return `₹${(v / 1e3).toFixed(1)}k`;
            return `₹${Math.round(v)}`;
          };
          // "Review Contacts" deep-links into /contacts pre-filtered to
          // exactly the ids shown in that alert row.
          const reviewContacts = (ids) => {
            sessionStorage.setItem("insightsContactIdFilter", JSON.stringify(ids));
            window.location.href = "/contacts";
          };
          const alertRows = [
            {
              icon: <AlertCircle className="w-4 h-4" />,
              iconBg: "#FCCCCD",
              iconColor: "#DF120B",
              title: `${coldContacts.length} Contacts going cold`,
              subtitle: `${formatCrAlert(coldPipeline)} associated pipeline has had no activity for 30+ days`,
              onClick: () => reviewContacts(coldContacts.map((c) => c._id)),
            },
            {
              icon: <Clock className="w-4 h-4" />,
              iconBg: "rgba(255, 204, 0, 0.15)",
              iconColor: "#D4BF00",
              title: `${followUpContacts.length} Contacts awaiting follow-up`,
              subtitle: `${formatCrAlert(followUpPipeline)} associated pipeline still in early stages`,
              onClick: () => reviewContacts(followUpContacts.map((c) => c._id)),
            },
            {
              icon: <TeamIcon className="w-4 h-4" />,
              iconBg: "rgba(0, 133, 255, 0.1)",
              iconColor: "#0085FF",
              title: `${noOwnerContacts.length} Contacts with no owner`,
              subtitle: `${formatCrAlert(noOwnerPipeline)} associated pipeline is unassigned`,
              onClick: () => reviewContacts(noOwnerContacts.map((c) => c._id)),
            },
            {
              icon: <PdfIcon className="w-4 h-4" />,
              iconBg: "#FCCCCD",
              iconColor: "#DF120B",
              title: `${overdueContacts.length} Contacts with overdue invoices`,
              subtitle: `${formatCrAlert(overduePipeline)} in overdue invoice value`,
              onClick: () => reviewContacts(overdueContacts.map((c) => c._id)),
            },
          ];

          // Card 2: Contacts by Industry (via linked company), with pipeline value.
          const industryGroups = {};
          filteredData.filteredContacts.forEach((c) => {
            const industry = c.company?.industry || "Unspecified";
            if (!industryGroups[industry]) industryGroups[industry] = { count: 0, pipeline: 0 };
            industryGroups[industry].count += 1;
            industryGroups[industry].pipeline += (dealsByContactId[c._id] || []).reduce(
              (s, d) => s + (d.amount || 0),
              0,
            );
          });
          const industryEntries = Object.entries(industryGroups)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 4);
          const industryMaxCount = Math.max(1, ...industryEntries.map(([, v]) => v.count));
          const industryColors = ["#0085FF", "#0C4FCD", "#2E7D32", "#D97706", "#E82222", "#00C950"];

          // Card 3: Recent Contact Activity — deals, invoices, meetings, and
          // tasks tied to a contact, merged into one timeline.
          const contactActivity = [];
          filteredData.filteredDeals
            .filter((d) => d.contact)
            .forEach((d) => {
              const at = d.updatedAt || d.createdAt;
              if (!at) return;
              contactActivity.push({
                id: `deal-${d._id}`,
                icon: <Briefcase className="w-4 h-4" />,
                iconBg: "#CCE7FF",
                iconColor: "#0085FF",
                title: d.title || "Deal",
                subtitle: d.status || "Update",
                amount: d.amount || 0,
                at,
              });
            });
          filteredData.filteredInvoices
            .filter((inv) => inv.deal?.contact)
            .forEach((inv) => {
              const at = inv.updatedAt || inv.date || inv.createdAt;
              if (!at) return;
              contactActivity.push({
                id: `invoice-${inv._id}`,
                icon: <PdfIcon className="w-4 h-4" />,
                iconBg: "#FCCCCD",
                iconColor: "#EF0004",
                title: `Invoice #${inv.invoiceNumber}`,
                subtitle: inv.status,
                amount: inv.amount || 0,
                at,
              });
            });
          meetings
            .filter((m) => m.linkedTo === "contact" && m.contact)
            .forEach((m) => {
              const at = m.updatedAt || m.scheduledAt || m.createdAt;
              if (!at) return;
              contactActivity.push({
                id: `meeting-${m._id}`,
                icon: <VideoIcon className="w-4 h-4" />,
                iconBg: "rgba(0, 133, 255, 0.1)",
                iconColor: "#0085FF",
                title: m.title || "Meeting",
                subtitle: m.status || "Scheduled",
                amount: null,
                at,
              });
            });
          tasks
            .filter((t) =>
              (t.relatedEntities || []).some((r) => r.entityModel === "Contact"),
            )
            .forEach((t) => {
              const at = t.updatedAt || t.dueDate || t.createdAt;
              if (!at) return;
              contactActivity.push({
                id: `task-${t._id}`,
                icon: <ClipboardList className="w-4 h-4" />,
                iconBg: "rgba(0, 201, 80, 0.12)",
                iconColor: "#00A745",
                title: t.title || "Task",
                subtitle: t.status || "Pending",
                amount: null,
                at,
              });
            });
          const recentContactActivity = contactActivity
            .sort((a, b) => new Date(b.at) - new Date(a.at))
            .slice(0, 6);

          return (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
              {/* Contact Alerts */}
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm min-h-[320px] flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-[#1C1C1D]">Contact Alerts</h3>
                  <button
                    onClick={() => (window.location.href = "/contacts")}
                    className="text-xs font-semibold text-[#0085FF] hover:underline flex-shrink-0"
                  >
                    View All
                  </button>
                </div>
                <div className="flex flex-col gap-0 flex-1">
                  {alertRows.map((row, idx) => (
                    <div
                      key={row.title}
                      className={`flex items-center justify-between gap-3 py-3 ${
                        idx < alertRows.length - 1 ? "border-b border-[#E1E4EA]" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ background: row.iconBg }}
                        >
                          <span style={{ color: row.iconColor }}>{row.icon}</span>
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#525252] truncate">{row.title}</p>
                          <p className="text-[10px] text-[rgba(107,114,128,0.7)] truncate">
                            {row.subtitle}
                          </p>
                        </div>
                      </div>
                      {row.onClick && (
                        <button
                          onClick={row.onClick}
                          className="text-[10px] font-semibold text-[#0085FF] hover:underline flex-shrink-0 whitespace-nowrap"
                        >
                          Review Contacts
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Contacts by Industry */}
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm min-h-[320px] flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-[#1C1C1D]">Contacts by Industry</h3>
                  <button
                    onClick={() => (window.location.href = "/companies")}
                    className="text-xs font-semibold text-[#0085FF] hover:underline flex-shrink-0"
                  >
                    View All
                  </button>
                </div>
                {industryEntries.length === 0 ? (
                  <p className="text-sm text-gray-400 py-10 text-center">No contacts yet</p>
                ) : (
                  <div className="flex flex-col gap-4 flex-1">
                    {industryEntries.map(([industry, data], idx) => (
                      <div key={industry} className="flex items-center gap-3">
                        <span
                          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ background: industryColors[idx % industryColors.length] + "22" }}
                        >
                          <Building
                            className="w-4 h-4"
                            style={{ color: industryColors[idx % industryColors.length] }}
                          />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#525252] truncate">{industry}</p>
                          <p className="text-[10px] text-[rgba(107,114,128,0.7)]">{data.count} Contacts</p>
                          <div className="h-1.5 bg-[rgba(0,133,255,0.2)] rounded-full mt-1.5 overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${(data.count / industryMaxCount) * 100}%`,
                                background: industryColors[idx % industryColors.length],
                              }}
                            />
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-[10px] font-medium text-[#404040]">
                            {formatCrAlert(data.pipeline)}
                          </p>
                          <p className="text-[10px] text-[rgba(107,114,128,0.7)]">Pipeline Value</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Contact Activity */}
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm min-h-[320px] flex flex-col">
                <h3 className="text-sm font-semibold text-[#1C1C1D] mb-3">Recent Contact Activity</h3>
                {recentContactActivity.length === 0 ? (
                  <p className="text-sm text-gray-400 py-10 text-center">No recent activity</p>
                ) : (
                  <div className="flex flex-col gap-3 flex-1 overflow-y-auto dc-scroll-visible">
                    {recentContactActivity.map((item) => (
                      <div key={item.id} className="flex items-center gap-3">
                        <span
                          className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ background: item.iconBg }}
                        >
                          <span style={{ color: item.iconColor }}>{item.icon}</span>
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-[#1C1C1D] truncate flex items-center gap-1.5">
                            <span className="truncate">{item.title}</span>
                            <span className="text-[9px] font-medium text-[#78788D] bg-gray-100 rounded px-1.5 py-0.5 flex-shrink-0">
                              {item.subtitle}
                            </span>
                          </p>
                          <p className="text-[10px] text-[#78788D] mt-0.5">
                            {new Date(item.at).toLocaleString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                        {item.amount !== null && (
                          <p className="text-xs font-semibold text-[#1C1C1D] flex-shrink-0">
                            {formatCrAlert(item.amount)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    );
  };

  const renderCompaniesReport = () => {
    // Calculate metrics
    const totalCompanies = filteredData.filteredCompanies.length;
    const companiesWithWebsite = filteredData.filteredCompanies.filter(
      (c) => c.website
    ).length;
    const companiesWithAddress = filteredData.filteredCompanies.filter(
      (c) => c.address
    ).length;
    const companiesWithIndustry = filteredData.filteredCompanies.filter(
      (c) => c.industry
    ).length;

    // Companies created this month
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const companiesThisMonth = filteredData.filteredCompanies.filter((c) => {
      const createdDate = new Date(c.createdAt);
      return (
        createdDate.getMonth() === currentMonth &&
        createdDate.getFullYear() === currentYear
      );
    }).length;

    // Industry distribution (top 5)
    const industryDistribution = filteredData.filteredCompanies
      .filter((c) => c.industry)
      .reduce((acc, company) => {
        acc[company.industry] = (acc[company.industry] || 0) + 1;
        return acc;
      }, {});

    const topIndustries = Object.entries(industryDistribution)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    // Location distribution (top 5 cities/regions)
    const locationDistribution = filteredData.filteredCompanies
      .filter((c) => c.address)
      .reduce((acc, company) => {
        // Extract city/region (you can customize this based on your address format)
        const location = company.address.split(",")[0].trim();
        acc[location] = (acc[location] || 0) + 1;
        return acc;
      }, {});

    const topLocations = Object.entries(locationDistribution)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    // Data completeness score
    const completenessScore = Math.round(
      ((companiesWithWebsite + companiesWithAddress + companiesWithIndustry) /
        (totalCompanies * 3)) *
        100
    );

    // KPI row — same StatCard pattern used on the Contacts tab.
    const companyIdsWithDeals = new Set(
      filteredData.filteredDeals.filter((d) => d.company).map((d) => d.company._id || d.company),
    );
    const activeCompanies = filteredData.filteredCompanies.filter((c) =>
      companyIdsWithDeals.has(c._id),
    ).length;
    const dealsWithCompany = filteredData.filteredDeals.filter((d) => d.company);
    const avgDealSizeCompanies =
      dealsWithCompany.length > 0
        ? dealsWithCompany.reduce((sum, d) => sum + (d.amount || 0), 0) / dealsWithCompany.length
        : 0;
    const wonDealsWithCompany = dealsWithCompany.filter((d) => d.status === "Won");
    const avgSalesCycleDays =
      wonDealsWithCompany.length > 0
        ? Math.round(
            wonDealsWithCompany.reduce((sum, d) => {
              const created = new Date(d.createdAt).getTime();
              const closed = new Date(d.updatedAt || d.createdAt).getTime();
              return sum + Math.max(0, (closed - created) / (24 * 60 * 60 * 1000));
            }, 0) / wonDealsWithCompany.length,
          )
        : 0;

    // Month-over-month trends for each KPI card, mirroring the Contacts tab.
    const lastMonthDateCo = new Date(currentYear, currentMonth - 1, 1);
    const lastMonthCo = lastMonthDateCo.getMonth();
    const lastMonthYearCo = lastMonthDateCo.getFullYear();
    const companiesBeforeThisMonth = filteredData.filteredCompanies.filter(
      (c) => new Date(c.createdAt) < new Date(currentYear, currentMonth, 1),
    ).length;
    const totalCompaniesChange =
      companiesBeforeThisMonth > 0
        ? { pct: Math.round((companiesThisMonth / companiesBeforeThisMonth) * 100), isNew: false }
        : { pct: 0, isNew: totalCompanies > 0 };

    const dealsWithCompanyThisMonth = dealsWithCompany.filter((d) => {
      const created = new Date(d.createdAt);
      return created.getMonth() === currentMonth && created.getFullYear() === currentYear;
    });
    const dealsWithCompanyLastMonth = dealsWithCompany.filter((d) => {
      const created = new Date(d.createdAt);
      return created.getMonth() === lastMonthCo && created.getFullYear() === lastMonthYearCo;
    });
    const activeCompaniesChange =
      dealsWithCompanyLastMonth.length > 0
        ? { pct: Math.round(((dealsWithCompanyThisMonth.length - dealsWithCompanyLastMonth.length) / dealsWithCompanyLastMonth.length) * 100), isNew: false }
        : { pct: 0, isNew: dealsWithCompanyThisMonth.length > 0 };

    const companiesLastMonth = filteredData.filteredCompanies.filter((c) => {
      const created = new Date(c.createdAt);
      return created.getMonth() === lastMonthCo && created.getFullYear() === lastMonthYearCo;
    }).length;
    const newCompaniesChange =
      companiesLastMonth > 0
        ? { pct: Math.round(((companiesThisMonth - companiesLastMonth) / companiesLastMonth) * 100), isNew: false }
        : { pct: 0, isNew: companiesThisMonth > 0 };

    const avgDealSizeThisMonth =
      dealsWithCompanyThisMonth.length > 0
        ? dealsWithCompanyThisMonth.reduce((sum, d) => sum + (d.amount || 0), 0) /
          dealsWithCompanyThisMonth.length
        : 0;
    const avgDealSizeLastMonth =
      dealsWithCompanyLastMonth.length > 0
        ? dealsWithCompanyLastMonth.reduce((sum, d) => sum + (d.amount || 0), 0) /
          dealsWithCompanyLastMonth.length
        : 0;
    const avgDealSizeChange =
      avgDealSizeLastMonth > 0
        ? { pct: Math.round(((avgDealSizeThisMonth - avgDealSizeLastMonth) / avgDealSizeLastMonth) * 100), isNew: false }
        : { pct: 0, isNew: avgDealSizeThisMonth > 0 };

    const wonThisMonth = wonDealsWithCompany.filter((d) => {
      const closed = new Date(d.updatedAt || d.createdAt);
      return closed.getMonth() === currentMonth && closed.getFullYear() === currentYear;
    });
    const wonLastMonth = wonDealsWithCompany.filter((d) => {
      const closed = new Date(d.updatedAt || d.createdAt);
      return closed.getMonth() === lastMonthCo && closed.getFullYear() === lastMonthYearCo;
    });
    const cycleFor = (deals) =>
      deals.length > 0
        ? deals.reduce((sum, d) => {
            const created = new Date(d.createdAt).getTime();
            const closed = new Date(d.updatedAt || d.createdAt).getTime();
            return sum + Math.max(0, (closed - created) / (24 * 60 * 60 * 1000));
          }, 0) / deals.length
        : 0;
    const cycleThisMonth = cycleFor(wonThisMonth);
    const cycleLastMonth = cycleFor(wonLastMonth);
    // Shorter sales cycle is an improvement, so invert the sign.
    const salesCycleChange =
      cycleLastMonth > 0
        ? { pct: Math.round(((cycleLastMonth - cycleThisMonth) / cycleLastMonth) * 100), isNew: false }
        : { pct: 0, isNew: cycleThisMonth > 0 };

    const companySourceColors = ["#0085FF", "#34C759", "#8E62EF", "#2A2726", "#D97706", "#EC4899"];
    const companySourceData = topIndustries.map(([industry, count], idx) => ({
      name: industry,
      value: count,
      color: companySourceColors[idx % companySourceColors.length],
    }));
    // "Other" covers every industry outside the top 5 (plus companies with
    // no industry set at all), so the chart reflects every company instead
    // of silently dropping the long tail.
    const topIndustriesSum = topIndustries.reduce((sum, [, count]) => sum + count, 0);
    const otherIndustriesCount = totalCompanies - topIndustriesSum;
    if (otherIndustriesCount > 0) {
      companySourceData.push({
        name: "Other",
        value: otherIndustriesCount,
        color: "#E7E4E3",
      });
    }
    // Percentages are relative to the shown segments (top-5 + Other), which
    // now cover every company, so they sum to a true 100%.
    const companySourceTotal = Math.max(
      1,
      companySourceData.reduce((sum, entry) => sum + entry.value, 0),
    );

    // Deal Velocity by Company — one bubble per company: X = avg deal
    // size, Y = avg deal age in days (time since each deal was opened —
    // using every deal rather than only Won ones, since Won-only cycle
    // time is mostly same-day in this dataset and wouldn't show any real
    // spread), bubble size = total Won revenue generated by that company.
    const dealsByCompanyId = {};
    filteredData.filteredDeals.forEach((d) => {
      const cid = d.company?._id || d.company;
      if (!cid) return;
      if (!dealsByCompanyId[cid]) dealsByCompanyId[cid] = [];
      dealsByCompanyId[cid].push(d);
    });
    const velocityNow = Date.now();
    const velocityPoints = Object.entries(dealsByCompanyId)
      .map(([companyId, deals]) => {
        const company = filteredData.filteredCompanies.find((c) => c._id === companyId);
        const avgDealSize =
          deals.reduce((sum, d) => sum + (d.amount || 0), 0) / deals.length;
        const avgAgeDays =
          deals.reduce((sum, d) => {
            const created = new Date(d.createdAt).getTime();
            return sum + Math.max(0, (velocityNow - created) / (24 * 60 * 60 * 1000));
          }, 0) / deals.length;
        const wonForCompany = deals.filter((d) => d.status === "Won");
        const revenue = wonForCompany.reduce((sum, d) => sum + (d.amount || 0), 0);
        return {
          name: company?.name || "Unknown",
          cycle: Math.round(avgAgeDays),
          dealSize: Math.round(avgDealSize),
          revenue,
        };
      })
      .filter((p) => p.dealSize > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 15);
    // Give every bubble a visible minimum size, then scale up by revenue
    // share — a company with zero Won revenue still renders as a small
    // dot instead of disappearing or looking identical to the rest.
    const velocityRevenueMax = Math.max(1, ...velocityPoints.map((p) => p.revenue));
    velocityPoints.forEach((p) => {
      p.bubbleSize = 50 + Math.round((p.revenue / velocityRevenueMax) * 1800);
    });

    // Top Revenue Generating Companies — total revenue per company across
    // Won deals + invoiced amounts, ranked descending.
    const revenueByCompanyId = {};
    filteredData.filteredDeals.forEach((d) => {
      if (d.status !== "Won") return;
      const cid = d.company?._id || d.company;
      if (!cid) return;
      revenueByCompanyId[cid] = (revenueByCompanyId[cid] || 0) + (d.amount || 0);
    });
    filteredData.filteredInvoices.forEach((inv) => {
      // Invoices don't carry a company reference directly — only their deal,
      // whose `company` field is an unpopulated ObjectId string.
      const dealCompany = inv.deal?.company;
      const cid = dealCompany?._id || dealCompany;
      if (!cid) return;
      revenueByCompanyId[cid] = (revenueByCompanyId[cid] || 0) + (inv.amount || 0);
    });
    // Pipeline Contribution by Company — Open pipeline value (blue) vs Won
    // pipeline value (green) per company, ranked by combined total.
    const pipelineByCompanyId = {};
    Object.entries(dealsByCompanyId).forEach(([companyId, deals]) => {
      const open = deals
        .filter((d) => d.status !== "Won" && d.status !== "Lost")
        .reduce((sum, d) => sum + (d.amount || 0), 0);
      const won = deals
        .filter((d) => d.status === "Won")
        .reduce((sum, d) => sum + (d.amount || 0), 0);
      pipelineByCompanyId[companyId] = { open, won };
    });
    const pipelineContributionData = Object.entries(pipelineByCompanyId)
      .map(([companyId, { open, won }]) => {
        const company =
          filteredData.filteredCompanies.find((c) => String(c._id) === String(companyId)) ||
          companies.find((c) => String(c._id) === String(companyId));
        return { name: company?.name || "Unknown", open, won, total: open + won };
      })
      .filter((c) => c.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
    const pipelineContributionMax = Math.max(1, ...pipelineContributionData.map((c) => c.total));

    const topRevenueColors = ["#0085FF", "#34C759", "#8E62EF", "#2A2726", "#D97706", "#FC9C32"];
    const topRevenueCompaniesAll = Object.entries(revenueByCompanyId)
      .map(([companyId, revenue]) => {
        // Fall back to the unfiltered `companies` list — a company can be
        // excluded from `filteredCompanies` by the date-range filter while
        // still having deals/invoices in range, which would otherwise show
        // as "Unknown".
        const company =
          filteredData.filteredCompanies.find((c) => String(c._id) === String(companyId)) ||
          companies.find((c) => String(c._id) === String(companyId));
        // "Last active" = most recent deal touch for this company, not the
        // company record's own updatedAt (which barely changes).
        const companyDeals = dealsByCompanyId[companyId] || [];
        const lastActiveTime = Math.max(
          0,
          ...companyDeals.map((d) => new Date(d.updatedAt || d.createdAt).getTime()),
        );
        const activeDeals = companyDeals.filter(
          (d) => d.status !== "Won" && d.status !== "Lost",
        ).length;
        return {
          name: company?.name || "Unknown",
          industry: company?.industry || "—",
          lastActive: lastActiveTime > 0 ? new Date(lastActiveTime) : null,
          activeDeals,
          revenue,
        };
      })
      .filter((c) => c.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .map((c, idx) => ({ ...c, color: topRevenueColors[idx % topRevenueColors.length] }));

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            title="Total Companies"
            value={totalCompanies}
            icon={<Building className="w-6 h-6" />}
            color="text-blue-600"
            change={totalCompaniesChange}
            changeLabel="vs last month"
          />
          <StatCard
            title="Active Companies"
            value={activeCompanies}
            icon={<Briefcase className="w-6 h-6" />}
            color="text-green-600"
            change={activeCompaniesChange}
            changeLabel="vs last month"
          />
          <StatCard
            title="New This Month"
            value={companiesThisMonth}
            icon={<TrendingUp className="w-6 h-6" />}
            color="text-purple-600"
            change={newCompaniesChange}
            changeLabel="vs last month"
          />
          <StatCard
            title="Avg. Deal Size"
            value={`₹${formatNumberToIndian(Math.round(avgDealSizeCompanies))}`}
            icon={<AvgDealSizeIcon className="w-6 h-6" />}
            color="text-emerald-600"
            change={avgDealSizeChange}
            changeLabel="vs last month"
          />
          <StatCard
            title="Avg. Sales Cycle"
            value={`${avgSalesCycleDays}d`}
            icon={<Clock className="w-6 h-6" />}
            color="text-orange-600"
            change={salesCycleChange}
            changeLabel="faster"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 items-stretch">
        {/* Deal Velocity by Company */}
        <div className="bg-white p-5 rounded-xl border border-[#E7E4E3] shadow-sm flex flex-col">
          <h3 className="text-sm font-semibold text-[#0E121B]">Deal Velocity by Company</h3>
          <p className="text-xs text-[#525866] mt-1">Analyse average deal size vs sales cycle</p>
          <p className="text-[10px] text-[#525866] text-center mt-1">
            Bubble Size = Revenue Generated
          </p>
          {velocityPoints.length === 0 ? (
            <p className="text-sm text-gray-400 py-16 text-center">No won deals with companies yet</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%" className="flex-1 min-h-[260px]">
              <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(31,41,55,0.1)" />
                <XAxis
                  dataKey="dealSize"
                  type="number"
                  name="Deal Size"
                  tickFormatter={(v) => (v === 0 ? "₹0" : `₹${(v / 1000).toFixed(0)}k`)}
                  tick={{ fontSize: 10, fill: "#1F2937" }}
                  tickLine={false}
                  axisLine={{ stroke: "rgba(31,41,55,0.3)" }}
                />
                <YAxis
                  dataKey="cycle"
                  type="number"
                  name="Sales Cycle"
                  unit=" Days"
                  tick={{ fontSize: 10, fill: "#1F2937" }}
                  tickLine={false}
                  axisLine={{ stroke: "rgba(31,41,55,0.3)" }}
                  width={50}
                />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const p = payload[0].payload;
                    return (
                      <div className="bg-white border border-gray-200 rounded-md shadow-lg p-2 text-xs">
                        <p className="font-medium text-gray-900">{p.name}</p>
                        <p className="text-gray-500">
                          {p.cycle}d avg age • ₹{formatNumberToIndian(p.dealSize)} avg deal
                        </p>
                        <p className="text-gray-500">₹{formatNumberToIndian(p.revenue)} revenue</p>
                      </div>
                    );
                  }}
                />
                <Scatter
                  data={velocityPoints}
                  shape={(props) => {
                    const { cx, cy, payload } = props;
                    const radius = Math.sqrt((payload.bubbleSize || 60) / Math.PI);
                    return (
                      <circle cx={cx} cy={cy} r={radius} fill="#0085FF" fillOpacity={0.75} />
                    );
                  }}
                />
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Companies by Industry — same size/style/proportion as the
            Contacts tab's Contact Acquisition Sources donut (1fr of a
            2fr_1fr grid). */}
        <div className="flex flex-col gap-4">
        <div className="bg-white p-5 rounded-xl border border-[#E7E4E3] shadow-sm">
          <h3 className="text-sm font-semibold text-[#0E121B]">Companies by Industry</h3>
          <p className="text-xs text-[#525866] mt-1">
            Where your companies are concentrated · {completenessScore}% profile completeness
          </p>
          {totalCompanies === 0 || companySourceData.length === 0 ? (
            <p className="text-sm text-gray-400 py-10 text-center">No companies yet</p>
          ) : (
            <div className="flex items-center justify-between gap-4 mt-4 flex-wrap">
              <div className="relative flex-shrink-0" style={{ width: 220, height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={companySourceData}
                      cx="50%"
                      cy="50%"
                      innerRadius={68}
                      outerRadius={108}
                      cornerRadius={3}
                      paddingAngle={companySourceData.length > 1 ? 2 : 0}
                      dataKey="value"
                      stroke="none"
                      label={({ cx, cy, midAngle, innerRadius, outerRadius, value }) => {
                        const RADIAN = Math.PI / 180;
                        const r = (innerRadius + outerRadius) / 2;
                        const x = cx + r * Math.cos(-midAngle * RADIAN);
                        const y = cy + r * Math.sin(-midAngle * RADIAN);
                        const pct = Math.round((value / companySourceTotal) * 100);
                        const text = `${pct}%`;
                        const w = text.length * 6 + 10;
                        return (
                          <g>
                            <rect x={x - w / 2} y={y - 8} width={w} height={16} rx={6} fill="#FFFFFF" />
                            <text
                              x={x}
                              y={y}
                              textAnchor="middle"
                              dominantBaseline="central"
                              fontSize={11}
                              fontWeight={500}
                              fill="#21201F"
                            >
                              {text}
                            </text>
                          </g>
                        );
                      }}
                      labelLine={false}
                    >
                      {companySourceData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                {companySourceData.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                      style={{ background: entry.color }}
                    />
                    <span className="text-xs text-[#21201F]/70 truncate min-w-[90px]">{entry.name}</span>
                    <span className="text-[11px] text-[#525866] text-right flex-shrink-0 w-8">
                      {Math.round((entry.value / companySourceTotal) * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="bg-white p-5 rounded-xl border border-[#E7E4E3] shadow-sm">
          <h3 className="text-sm font-semibold text-[#0E121B]">Top Locations</h3>
          <p className="text-xs text-[#525866] mt-1">By number of companies</p>
          {topLocations.length === 0 ? (
            <p className="text-sm text-gray-400 py-10 text-center">No address data yet</p>
          ) : (
            <div className="mt-4 flex flex-col gap-2.5">
              {topLocations.map(([location, count], idx) => (
                <div key={location} className="flex items-center gap-2.5">
                  <span className="text-[11px] font-medium text-[#99A0AE] w-4 flex-shrink-0">{idx + 1}</span>
                  <span className="text-xs text-[#0E121B] truncate flex-1 min-w-0">{location}</span>
                  <span className="text-xs font-medium text-[#525866] flex-shrink-0">
                    {count} compan{count !== 1 ? "ies" : "y"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
        </div>

        {/* Placeholder row — content TBD */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4 items-stretch">
          {/* Pipeline Contribution by Company */}
          <div className="bg-white p-5 rounded-xl border border-[#E7E4E3] shadow-sm min-h-[400px] flex flex-col">
            <div>
              <h3 className="text-sm font-semibold text-[#0E121B]">Pipeline Contribution by Company</h3>
              <p className="text-xs text-[#525866] mt-1">Open and Won deal value by company</p>
            </div>
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-2">
                <span className="w-5 h-2 rounded-full" style={{ background: "#0085FF" }} />
                <span className="text-xs text-[#21201F]/70">Open</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-2 rounded-full" style={{ background: "#34C759" }} />
                <span className="text-xs text-[#21201F]/70">Won</span>
              </div>
            </div>
            {pipelineContributionData.length === 0 ? (
              <p className="text-sm text-gray-400 py-16 text-center">No pipeline data yet</p>
            ) : (
              <div className="flex flex-col flex-1 justify-around mt-2">
                {pipelineContributionData.map((c, idx) => {
                  const openPct = Math.max(c.open > 0 ? 8 : 0, Math.round((c.open / pipelineContributionMax) * 100));
                  const wonPct = Math.max(c.won > 0 ? 8 : 0, Math.round((c.won / pipelineContributionMax) * 100));
                  return (
                    <div
                      key={c.name + idx}
                      className="flex items-center justify-between gap-3 py-2.5 border-b border-[#E7E7E9] last:border-b-0"
                    >
                      <span className="text-xs text-[#1F1F21] w-28 truncate flex-shrink-0">{c.name}</span>
                      <div className="flex items-center flex-1">
                        {c.open > 0 && (
                          <div
                            className="h-[15px] rounded-lg flex items-center justify-center overflow-hidden"
                            style={{ width: `${openPct}%`, background: "#0085FF" }}
                          >
                            <span className="text-[8px] font-medium text-white px-1 truncate">
                              ₹{formatNumberToIndian(c.open)}
                            </span>
                          </div>
                        )}
                        {c.won > 0 && (
                          <div
                            className="h-[15px] rounded-lg flex items-center justify-center overflow-hidden ml-1"
                            style={{ width: `${wonPct}%`, background: "#34C759" }}
                          >
                            <span className="text-[8px] font-medium text-white px-1 truncate">
                              ₹{formatNumberToIndian(c.won)}
                            </span>
                          </div>
                        )}
                      </div>
                      <span className="text-xs font-medium text-[#1F1F21] w-20 text-right flex-shrink-0">
                        ₹{formatNumberToIndian(c.total)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Top Revenue Generating Companies */}
          {(() => {
            const pageRows = topRevenueCompaniesAll.slice(0, 5);
            return (
              <div className="bg-white p-5 rounded-xl border border-[#E7E4E3] shadow-sm min-h-[400px] flex flex-col">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-[#0E121B]">Top Revenue Generating Companies</h3>
                    <p className="text-xs text-[#525866] mt-1">Companies ranked by total revenue (Won + Invoiced)</p>
                  </div>
                  <button
                    onClick={() => setActiveTab("companies")}
                    className="text-[10px] text-[#0085FF] underline flex-shrink-0"
                  >
                    View All Companies
                  </button>
                </div>
                {topRevenueCompaniesAll.length === 0 ? (
                  <p className="text-sm text-gray-400 py-16 text-center">No revenue data yet</p>
                ) : (
                  <>
                    <div
                      className="grid items-center mt-4 pb-2 border-b border-[#E7E7E9] text-[11px] font-medium text-[#525866]"
                      style={{ gridTemplateColumns: "24px minmax(0,220px) minmax(30px,1fr) 160px 32px 90px 32px 80px 32px 110px" }}
                    >
                      <span>#</span>
                      <span>Company</span>
                      <span />
                      <span>Industry</span>
                      <span />
                      <span>Last Active</span>
                      <span />
                      <span>Active Deals</span>
                      <span />
                      <span className="text-right">Revenue</span>
                    </div>
                    <div className="flex flex-col flex-1 justify-around">
                      {pageRows.map((c, idx) => (
                        <div
                          key={c.name + idx}
                          className="grid items-center py-5 border-b border-[#E7E7E9] last:border-b-0"
                          style={{ gridTemplateColumns: "24px minmax(0,220px) minmax(30px,1fr) 160px 32px 90px 32px 80px 32px 110px" }}
                        >
                          <span className="text-xs text-[#525866]">{idx + 1}</span>
                          <span className="flex items-center min-w-0">
                            <span className="text-xs text-[#1F1F21] truncate">{c.name}</span>
                          </span>
                          <span />
                          <span className="text-xs text-[#525866] pr-2">{c.industry}</span>
                          <span />
                          <span className="text-xs text-[#525866]">
                            {c.lastActive
                              ? c.lastActive.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
                              : "—"}
                          </span>
                          <span />
                          <span className="text-xs text-[#525866]">{c.activeDeals}</span>
                          <span />
                          <span className="text-xs font-medium text-[#1F1F21] text-right">
                            ₹{formatNumberToIndian(c.revenue)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    );
  };

  const renderDealsReport = () => {
    // Calculate basic metrics
    const totalDeals = filteredData.filteredDeals.length;
    const totalValue = filteredData.filteredDeals.reduce(
      (sum, deal) => sum + (deal.amount || 0),
      0
    );
    const averageDealValue = totalValue / totalDeals || 0;

    // State for user filter

    // Status distribution
    const statusDistribution = filteredData.filteredDeals.reduce(
      (acc, deal) => {
        const status = deal.status || "Unknown";
        acc[status] = acc[status] || { count: 0, amount: 0 };
        acc[status].count += 1;
        acc[status].amount += deal.amount || 0;
        return acc;
      },
      {}
    );

    // The stages shown here must match Settings > Kanban Settings exactly —
    // not just whatever distinct status strings happen to exist on deals.
    // A deal can be left pointing at a status that's since been renamed or
    // deleted from the board (a stale value), and that stage shouldn't
    // reappear here as if it still exists. Falls back to deriving from the
    // deals themselves only if the Kanban board couldn't be fetched.
    const TERMINAL_STATUSES = ["Won", "Lost"];
    const orderedStatuses = kanbanStatuses
      ? kanbanStatuses.filter((s) => statusDistribution[s])
      : [
          ...Object.keys(statusDistribution)
            .filter((s) => !TERMINAL_STATUSES.includes(s))
            .sort((a, b) => statusDistribution[b].count - statusDistribution[a].count),
          ...TERMINAL_STATUSES.filter((s) => statusDistribution[s]),
        ];
    const STATUS_COLOR_MAP = { Won: "#00C950", Lost: "#F60000", Open: "#0085FF", Negotiation: "#f59e0b" };
    const FALLBACK_STATUS_COLORS = ["#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16"];
    const statusColors = {};
    let fallbackColorIdx = 0;
    orderedStatuses.forEach((s) => {
      statusColors[s] = STATUS_COLOR_MAP[s] || FALLBACK_STATUS_COLORS[fallbackColorIdx++ % FALLBACK_STATUS_COLORS.length];
    });

    // Won, Lost, Open deals
    const wonDeals = filteredData.filteredDeals.filter(
      (d) => d.status === "Won"
    );
    const lostDeals = filteredData.filteredDeals.filter(
      (d) => d.status === "Lost"
    );
    const openDeals = filteredData.filteredDeals.filter(
      (d) => d.status !== "Won" && d.status !== "Lost"
    );

    const wonValue = wonDeals.reduce((sum, d) => sum + (d.amount || 0), 0);
    const lostValue = lostDeals.reduce((sum, d) => sum + (d.amount || 0), 0);
    const openValue = openDeals.reduce((sum, d) => sum + (d.amount || 0), 0);

    // Conversion metrics
    const totalClosedDeals = wonDeals.length + lostDeals.length;
    const winRate =
      totalClosedDeals > 0 ? (wonDeals.length / totalClosedDeals) * 100 : 0;
    const lossRate =
      totalClosedDeals > 0 ? (lostDeals.length / totalClosedDeals) * 100 : 0;

    // Deals this month
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const dealsThisMonth = filteredData.filteredDeals.filter((d) => {
      const createdDate = new Date(d.createdAt);
      return (
        createdDate.getMonth() === currentMonth &&
        createdDate.getFullYear() === currentYear
      );
    });
    const dealsThisMonthCount = dealsThisMonth.length;
    const dealsThisMonthValue = dealsThisMonth.reduce(
      (sum, d) => sum + (d.amount || 0),
      0
    );

    // Month-over-month trends for the KPI row, mirroring the Companies tab's
    // StatCard pattern (icon + label/value + bottom-right change badge).
    const lastMonthDate = new Date(currentYear, currentMonth - 1, 1);
    const lastMonth = lastMonthDate.getMonth();
    const lastMonthYear = lastMonthDate.getFullYear();
    const dealsLastMonth = filteredData.filteredDeals.filter((d) => {
      const created = new Date(d.createdAt);
      return created.getMonth() === lastMonth && created.getFullYear() === lastMonthYear;
    });
    const dealsLastMonthValue = dealsLastMonth.reduce((sum, d) => sum + (d.amount || 0), 0);
    const pctChange = (curr, prev) =>
      prev > 0 ? Math.round(((curr - prev) / prev) * 100) : curr > 0 ? 100 : 0;

    const pipelineValueChange = pctChange(dealsThisMonthValue, dealsLastMonthValue);
    const newDealsChange = pctChange(dealsThisMonthCount, dealsLastMonth.length);

    const wonThisMonthDeals = wonDeals.filter((d) => {
      const closed = new Date(d.updatedAt || d.createdAt);
      return closed.getMonth() === currentMonth && closed.getFullYear() === currentYear;
    });
    const wonLastMonthDeals = wonDeals.filter((d) => {
      const closed = new Date(d.updatedAt || d.createdAt);
      return closed.getMonth() === lastMonth && closed.getFullYear() === lastMonthYear;
    });
    const wonDealsChange = pctChange(wonThisMonthDeals.length, wonLastMonthDeals.length);

    const avgDealSizeThisMonthDeals =
      dealsThisMonth.length > 0 ? dealsThisMonthValue / dealsThisMonth.length : 0;
    const avgDealSizeLastMonthDeals =
      dealsLastMonth.length > 0 ? dealsLastMonthValue / dealsLastMonth.length : 0;
    const avgDealSizeChangeDeals = pctChange(avgDealSizeThisMonthDeals, avgDealSizeLastMonthDeals);

    const closedThisMonth = filteredData.filteredDeals.filter((d) => {
      if (d.status !== "Won" && d.status !== "Lost") return false;
      const closed = new Date(d.updatedAt || d.createdAt);
      return closed.getMonth() === currentMonth && closed.getFullYear() === currentYear;
    });
    const closedLastMonth = filteredData.filteredDeals.filter((d) => {
      if (d.status !== "Won" && d.status !== "Lost") return false;
      const closed = new Date(d.updatedAt || d.createdAt);
      return closed.getMonth() === lastMonth && closed.getFullYear() === lastMonthYear;
    });
    const winRateThisMonth =
      closedThisMonth.length > 0
        ? (wonThisMonthDeals.length / closedThisMonth.length) * 100
        : 0;
    const winRateLastMonth =
      closedLastMonth.length > 0
        ? (wonLastMonthDeals.length / closedLastMonth.length) * 100
        : 0;
    const winRateChange = pctChange(winRateThisMonth, winRateLastMonth);

    // User-wise analysis
    const userDeals = filteredData.filteredDeals.reduce((acc, deal) => {
      const userId = deal.user?._id;
      const userName = deal.user?.name || "Unknown User";

      if (!acc[userId]) {
        acc[userId] = {
          id: userId,
          name: userName,
          totalDeals: 0,
          wonDeals: 0,
          lostDeals: 0,
          openDeals: 0,
          totalValue: 0,
          wonValue: 0,
          lostValue: 0,
          openValue: 0,
          statusCounts: {},
        };
      }

      acc[userId].totalDeals += 1;
      acc[userId].totalValue += deal.amount || 0;

      const status = deal.status || "Unknown";
      acc[userId].statusCounts[status] = (acc[userId].statusCounts[status] || 0) + 1;

      if (deal.status === "Won") {
        acc[userId].wonDeals += 1;
        acc[userId].wonValue += deal.amount || 0;
      } else if (deal.status === "Lost") {
        acc[userId].lostDeals += 1;
        acc[userId].lostValue += deal.amount || 0;
      } else {
        acc[userId].openDeals += 1;
        acc[userId].openValue += deal.amount || 0;
      }

      return acc;
    }, {});

    const userStats = Object.values(userDeals)
      .map((user) => ({
        ...user,
        conversionRate:
          user.wonDeals + user.lostDeals > 0
            ? (user.wonDeals / (user.wonDeals + user.lostDeals)) * 100
            : 0,
      }))
      .sort((a, b) => b.totalValue - a.totalValue);

    // Get unique users for dropdown
    const uniqueUsers = userStats.map((user) => ({
      id: user.id,
      name: user.name,
    }));

    // Top companies by deal value
    const companyDeals = filteredData.filteredDeals
      .filter((d) => d.company?.name)
      .reduce((acc, deal) => {
        const companyName = deal.company.name;
        acc[companyName] = acc[companyName] || { count: 0, amount: 0, won: 0 };
        acc[companyName].count += 1;
        acc[companyName].amount += deal.amount || 0;
        if (deal.status === "Won") acc[companyName].won += 1;
        return acc;
      }, {});

    const topCompanies = Object.entries(companyDeals)
      .sort(([, a], [, b]) => b.amount - a.amount)
      .slice(0, 5);

    // Largest deals
    const largestDeals = [...filteredData.filteredDeals]
      .sort((a, b) => (b.amount || 0) - (a.amount || 0))
      .slice(0, 5);

    // Chart data for deal status pie chart — same orderedStatuses source of
    // truth as the funnel/table/User Performance/Revenue Trend, so a deal
    // stuck on a stage that's been renamed/deleted from Kanban Settings
    // doesn't show up here either.
    const dealStatusChartData = orderedStatuses
      .map((status) => ({
        name: status,
        value: statusDistribution[status]?.count || 0,
        amount: statusDistribution[status]?.amount || 0,
        color: statusColors[status] || "#6b7280",
      }))
      .filter((item) => item.value > 0);

    // Chart data for user performance - filtered. Dynamic per-status
    // columns (statusCounts) instead of a fixed Won/Lost/Open trio, so
    // custom Kanban stages show up here too.
    const buildUserPerformanceRow = (user) => {
      const row = { name: user.name.split(" ")[0], Total: user.totalDeals };
      orderedStatuses.forEach((s) => {
        row[s] = user.statusCounts[s] || 0;
      });
      return row;
    };
    const userPerformanceChartData = (() => {
      if (selectedUser === "all") {
        // Show top 10 users when "All Users" is selected
        return userStats.slice(0, 10).map(buildUserPerformanceRow);
      }
      const user = userStats.find((u) => u.id === selectedUser);
      return user ? [buildUserPerformanceRow(user)] : [];
    })();

    // Deals Funnel data — reflects every real status in use (custom Kanban
    // stages included), not a fixed Open/Won/Lost trio.
    const funnelStages = (() => {
      const baseline = statusDistribution[orderedStatuses[0]]?.amount || 1;
      return orderedStatuses.map((name) => {
        const s = statusDistribution[name] || { count: 0, amount: 0 };
        return { name, value: s.amount, count: s.count, pct: Math.round((s.amount / baseline) * 100) };
      });
    })();

    // Deals by Stage table — same real stages as the funnel above (not a
    // fixed Lead/Qualified/Proposal taxonomy). Conversion is each stage's
    // share of the total deal count (bounded 0-100%, so it reads sensibly
    // regardless of how stage values compare to each other — the funnel's
    // value-vs-baseline pct was reused here originally, which is why a
    // higher-value later stage like Won could show a nonsensical "295%").
    // Drop Off is simply the complement. Avg. Time and Risk are derived from
    // each stage's deals' actual age (days since created, or days-to-close
    // for Won/Lost) since this system doesn't track stage-transition history.
    const stageTableData = funnelStages.map((stage) => {
      const dealsInStage = filteredData.filteredDeals.filter((d) => d.status === stage.name);
      const now = Date.now();
      const ages = dealsInStage.map((d) => {
        const created = new Date(d.createdAt).getTime();
        const end = stage.name === "Won" || stage.name === "Lost" ? new Date(d.updatedAt || d.createdAt).getTime() : now;
        return Math.max(0, (end - created) / (24 * 60 * 60 * 1000));
      });
      const avgDays = ages.length > 0 ? Math.round(ages.reduce((s, a) => s + a, 0) / ages.length) : 0;
      const risk = avgDays > 21 ? "High" : avgDays > 7 ? "Medium" : "Low";
      const conversion = totalDeals > 0 ? Math.round((stage.count / totalDeals) * 100) : 0;
      const dropOff = Math.max(0, 100 - conversion);
      return { ...stage, avgDays, risk, conversion, dropOff };
    });

    // Deals by Industry — real deal value grouped by each deal's company's
    // industry (top 4 + an "Others" bucket for the rest), not the fixed
    // Construction/Manufacturing/Retail/Agency placeholder categories from
    // the design spec, since a company's actual industries are whatever its
    // records were tagged with.
    const dealsByIndustry = (() => {
      const companyIndustryMap = {};
      filteredData.filteredCompanies.forEach((c) => {
        companyIndustryMap[c._id] = c.industry || "Other";
      });
      const totals = {};
      filteredData.filteredDeals.forEach((d) => {
        const companyId = d.company?._id || d.company;
        const industry = companyIndustryMap[companyId] || "Other";
        totals[industry] = (totals[industry] || 0) + (d.amount || 0);
      });
      const entries = Object.entries(totals)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1]);
      const top = entries.slice(0, 4).map(([name, value]) => ({ name, value }));
      const restValue = entries.slice(4).reduce((s, [, v]) => s + v, 0);
      const items = restValue > 0 ? [...top, { name: "Others", value: restValue }] : top;
      items.sort((a, b) => b.value - a.value);
      const total = items.reduce((s, i) => s + i.value, 0);
      return items.map((i) => ({ ...i, pct: total > 0 ? Math.round((i.value / total) * 100) : 0 }));
    })();

    // Revenue Trend — Open/Won/Lost deal value per month, last 6 months.
    const revenueTrendData = (() => {
      const now = new Date();
      const months = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
        return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) };
      });
      const buckets = Object.fromEntries(
        months.map((m) => [m.key, Object.fromEntries(orderedStatuses.map((s) => [s, 0]))])
      );
      filteredData.filteredDeals.forEach((d) => {
        const created = new Date(d.createdAt);
        const key = `${created.getFullYear()}-${created.getMonth()}`;
        if (!buckets[key]) return;
        const status = d.status && orderedStatuses.includes(d.status) ? d.status : orderedStatuses[0];
        buckets[key][status] += d.amount || 0;
      });
      // A linear axis makes small months (₹7K-95K) visually indistinguishable
      // from 0 next to the ₹22L peak — a log scale keeps them readable
      // without distorting the peak. Log scales can't plot a true 0, so each
      // series also carries a floored "*Plot" companion (chart position)
      // alongside its real value (used for the tooltip/labels).
      const LOG_FLOOR = 5000;
      return months.map((m) => {
        const raw = buckets[m.key];
        const row = { name: m.label, ...raw };
        orderedStatuses.forEach((s) => {
          row[`${s}Plot`] = Math.max(raw[s], LOG_FLOOR);
        });
        return row;
      });
    })();
    // Compact, single-line ticks (no space before the unit, so recharts
    // never wraps them onto a second line inside the axis's tick width) —
    // stays purely data-driven since recharts derives the tick values
    // themselves from the actual min/max of revenueTrendData.
    const formatCrLakh = (v) => {
      if (v >= 1e7) return `₹${(v / 1e7).toFixed(v % 1e7 === 0 ? 0 : 1)}Cr`;
      if (v >= 1e5) return `₹${(v / 1e5).toFixed(v % 1e5 === 0 ? 0 : 1)}L`;
      if (v === 0) return "₹0";
      return `₹${formatNumberToIndian(v)}`;
    };

    // recharts' default log-scale ticks follow a "nice number" 1-2-5-10
    // sequence (5K, 10K, 20K, 50K, 1L...), which alternates between ×2 and
    // ×2.5 steps — technically still a log scale, but the gaps between
    // gridlines end up visibly uneven. Generating ticks with one constant
    // ratio instead guarantees every gap is pixel-identical.
    const revenueYAxis = (() => {
      const allValues = revenueTrendData.flatMap((d) => orderedStatuses.map((s) => d[`${s}Plot`]));
      const minV = Math.min(...allValues);
      const maxV = Math.max(...allValues);
      const TICK_COUNT = 7;
      const ratio = Math.pow(maxV / minV, 1 / (TICK_COUNT - 1));
      // Round each tick to 2 significant figures for a readable label — the
      // resulting gaps are still visually equal since the deviation from a
      // true constant ratio is tiny relative to the overall span.
      const roundNice = (v) => {
        const magnitude = Math.pow(10, Math.floor(Math.log10(v)) - 1);
        return Math.round(v / magnitude) * magnitude;
      };
      const ticks = Array.from({ length: TICK_COUNT }, (_, i) => roundNice(minV * Math.pow(ratio, i)));
      return { domain: [minV, maxV], ticks };
    })();

    return (
      <div className="space-y-6">
        {/* KPI row — same StatCard pattern (icon + label/value + bottom-right
            change badge) used on the Companies tab. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            title="Total Pipeline Value"
            value={`₹${formatNumberToIndian(totalValue)}`}
            icon={<IndianRupeeIcon className="w-6 h-6" />}
            color="text-blue-600"
            change={pipelineValueChange}
            changeLabel="vs last month"
          />
          <StatCard
            title="Won Deals"
            value={wonDeals.length}
            icon={<Trophy className="w-6 h-6" />}
            color="text-green-600"
            change={wonDealsChange}
            changeLabel="vs last month"
          />
          <StatCard
            title="New This Month"
            value={dealsThisMonthCount}
            icon={<TrendingUp className="w-6 h-6" />}
            color="text-purple-600"
            change={newDealsChange}
            changeLabel="vs last month"
          />
          <StatCard
            title="Avg. Deal Size"
            value={`₹${formatNumberToIndian(Math.round(averageDealValue))}`}
            icon={<AvgDealSizeIcon className="w-6 h-6" />}
            color="text-emerald-600"
            change={avgDealSizeChangeDeals}
            changeLabel="vs last month"
          />
          <StatCard
            title="Win Rate"
            value={`${winRate.toFixed(1)}%`}
            icon={<Target className="w-6 h-6" />}
            color="text-orange-600"
            change={winRateChange}
            changeLabel="vs last month"
          />
        </div>

        {/* Two cards below the KPI row, widths proportional to the KPI cards
            they sit under: left spans KPIs 1-3 (3fr), right spans KPIs 3-5
            (2fr). Right card content TBD. */}
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4 items-stretch">
          <div className="bg-white p-5 rounded-xl border border-[#E7E4E3] shadow-sm min-h-[360px] flex flex-col">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[#0E121B]">Deals Funnel</h3>
            </div>
            <div className="flex-1 flex items-center mt-2">
              <DealsFunnelChart stages={funnelStages} />
            </div>
          </div>
          {/* Revenue Trend — Open/Won/Lost deal value per month. */}
          <div className="bg-white p-5 rounded-xl border border-[#E7E4E3] shadow-sm min-h-[360px] flex flex-col">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-semibold text-[#0E121B] opacity-70">Revenue Trend</h3>
              <div className="flex items-center gap-4 flex-wrap">
                {orderedStatuses.map((key) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <span className="inline-block w-5 h-0.5 rounded-full" style={{ background: statusColors[key] }} />
                    <span className="text-xs" style={{ color: "rgba(31,31,33,0.56)" }}>
                      {key} Deal Value
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height="100%" className="mt-2 flex-1 min-h-0">
              <LineChart data={revenueTrendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(31,41,55,0.1)" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "#1F2937" }}
                  axisLine={{ stroke: "rgba(31,41,55,0.3)" }}
                  tickLine={false}
                />
                <YAxis
                  scale="log"
                  domain={revenueYAxis.domain}
                  ticks={revenueYAxis.ticks}
                  tickFormatter={formatCrLakh}
                  tick={{ fontSize: 10, fill: "#1F2937" }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                  tickMargin={4}
                  allowDataOverflow
                />
                <Tooltip
                  content={({ active, label, payload }) => {
                    if (!active || !payload?.length) return null;
                    const raw = payload[0]?.payload || {};
                    return (
                      <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-4 py-3">
                        <p className="text-sm font-semibold text-[#0E121B] mb-1">{label}</p>
                        {orderedStatuses.map((key) => (
                          <p key={key} className="text-sm" style={{ color: statusColors[key] }}>
                            {key} : ₹{formatNumberToIndian(raw[key] || 0)}
                          </p>
                        ))}
                      </div>
                    );
                  }}
                />
                {orderedStatuses.map((key) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={`${key}Plot`}
                    name={key}
                    stroke={statusColors[key]}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4 items-stretch">
          {/* Deals by Stage — same real stages as the funnel/table above. */}
          <div className="bg-white p-[18px] rounded-lg border border-[#E1E4EA] min-h-[360px]">
            <h3 className="text-sm font-semibold text-[#0E121B]">Deals by Stage</h3>
            <div className="bg-[#F8FAFC] rounded-md p-2 mt-3 overflow-x-auto">
              <table className="w-full text-xs" style={{ minWidth: 640 }}>
                <thead>
                  <tr className="bg-white rounded-md">
                    {["Stage", "Deal Count", "Revenue", "Avg. Time", "Conversion", "Drop Off", "Risk Score"].map((h) => (
                      <th key={h} className="font-normal text-[#1F2937] text-center py-1.5 px-1.5">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stageTableData.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center text-gray-400 py-6">
                        No deals yet
                      </td>
                    </tr>
                  ) : (
                    stageTableData.map((stage) => (
                      <tr key={stage.name} className="border-t border-[#1F2937]/10">
                        <td className="text-center font-medium text-[#1F2937] py-2 px-1.5">{stage.name}</td>
                        <td className="text-center py-2 px-1.5">{stage.count}</td>
                        <td className="text-center py-2 px-1.5">₹{formatNumberToIndian(Math.round(stage.value))}</td>
                        <td className="text-center py-2 px-1.5">{stage.avgDays} Days</td>
                        <td className="text-center py-2 px-1.5">{stage.conversion}%</td>
                        <td className="text-center py-2 px-1.5">{stage.dropOff}%</td>
                        <td className="text-center py-2 px-1.5">
                          <span
                            className="inline-flex items-center justify-center px-2.5 py-1 rounded-full font-medium"
                            style={
                              stage.risk === "Low"
                                ? { background: "rgba(52,199,89,0.1)", color: "#34C759" }
                                : stage.risk === "Medium"
                                ? { background: "rgba(252,156,50,0.1)", color: "#FC9C32" }
                                : { background: "rgba(246,0,0,0.2)", color: "#F60000" }
                            }
                          >
                            {stage.risk}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          {/* Deals by Industry — real deal value by company industry. */}
          <div className="bg-white p-5 rounded-xl border border-[#E7E4E3] shadow-sm min-h-[360px]">
            <h3 className="text-sm font-semibold text-[#0E121B]">Deals by Industry</h3>
            {dealsByIndustry.length === 0 ? (
              <p className="text-sm text-gray-400 py-16 text-center">No deals yet</p>
            ) : (
              <div className="mt-3">
                <DealsIndustryTreemap items={dealsByIndustry} />
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-4 items-stretch">
          {/* Deal Status Breakdown */}
          <div className="bg-white p-5 rounded-xl border border-[#E7E4E3] shadow-sm min-h-[340px]">
            <h3 className="text-sm font-semibold text-[#0E121B]">Deal Status Breakdown</h3>
            <p className="text-xs text-[#525866] mt-1">Count and value by status</p>
            {dealStatusChartData.length === 0 ? (
              <p className="text-sm text-gray-400 py-16 text-center">No deals yet</p>
            ) : (
              <div className="flex items-center justify-between gap-4 mt-4 flex-wrap">
                <div className="relative flex-shrink-0" style={{ width: 160, height: 160 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={dealStatusChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        cornerRadius={3}
                        paddingAngle={dealStatusChartData.length > 1 ? 2 : 0}
                        dataKey="value"
                        stroke="none"
                      >
                        {dealStatusChartData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, name, { payload }) => [
                          `${value} deal${value !== 1 ? "s" : ""} · ₹${formatNumberToIndian(payload.amount)}`,
                          payload.name,
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-1.5 max-w-[220px] flex-shrink-0">
                  {dealStatusChartData.map((entry) => (
                    <div key={entry.name} className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: entry.color }} />
                      <span className="text-xs text-[#21201F]/70 truncate min-w-[80px]">{entry.name}</span>
                      <span className="text-[11px] text-[#525866] text-right flex-shrink-0 ml-4">
                        {entry.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          {/* User Performance — filterable by user via uniqueUsers. */}
          <div className="bg-white p-5 rounded-xl border border-[#E7E4E3] shadow-sm min-h-[340px]">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h3 className="text-sm font-semibold text-[#0E121B]">User Performance</h3>
                <p className="text-xs text-[#525866] mt-1">Deals by outcome, per user</p>
              </div>
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="text-xs border border-[#E1E4EA] rounded-lg px-2.5 py-1.5 text-[#0E121B] bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                <option value="all">All Users</option>
                {uniqueUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            {userPerformanceChartData.length === 0 ? (
              <p className="text-sm text-gray-400 py-16 text-center">No deals yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={260} className="mt-2">
                <BarChart data={userPerformanceChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(31,41,55,0.1)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#1F2937" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#1F2937" }} axisLine={false} tickLine={false} width={32} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {orderedStatuses.map((s, i) => (
                    <Bar
                      key={s}
                      dataKey={s}
                      stackId="a"
                      fill={statusColors[s]}
                      radius={i === orderedStatuses.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
          {/* Top Companies by Deal Value */}
          <div className="bg-white p-5 rounded-xl border border-[#E7E4E3] shadow-sm">
            <h3 className="text-sm font-semibold text-[#0E121B]">Top Companies by Deal Value</h3>
            {topCompanies.length === 0 ? (
              <p className="text-sm text-gray-400 py-10 text-center">No company-linked deals yet</p>
            ) : (
              <div className="mt-4 flex flex-col gap-2.5">
                {topCompanies.map(([company, data], idx) => (
                  <div key={company} className="flex items-center gap-2.5">
                    <span className="text-[11px] font-medium text-[#99A0AE] w-4 flex-shrink-0">{idx + 1}</span>
                    <span className="text-xs text-[#0E121B] truncate flex-1 min-w-0">{company}</span>
                    <span className="text-[11px] text-[#525866] flex-shrink-0">{data.count} deal{data.count !== 1 ? "s" : ""}</span>
                    <span className="text-xs font-medium text-[#0E121B] flex-shrink-0 w-24 text-right">
                      ₹{formatNumberToIndian(Math.round(data.amount))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Largest Deals */}
          <div className="bg-white p-5 rounded-xl border border-[#E7E4E3] shadow-sm">
            <h3 className="text-sm font-semibold text-[#0E121B]">Largest Deals</h3>
            {largestDeals.length === 0 ? (
              <p className="text-sm text-gray-400 py-10 text-center">No deals yet</p>
            ) : (
              <div className="mt-4 flex flex-col gap-2.5">
                {largestDeals.map((deal, idx) => (
                  <div key={deal._id} className="flex items-center gap-2.5">
                    <span className="text-[11px] font-medium text-[#99A0AE] w-4 flex-shrink-0">{idx + 1}</span>
                    <span className="text-xs text-[#0E121B] truncate flex-1 min-w-0">{deal.title || deal.company?.name || "Untitled deal"}</span>
                    <span
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0"
                      style={
                        deal.status === "Won"
                          ? { background: "rgba(0,201,80,0.1)", color: "#00A63E" }
                          : deal.status === "Lost"
                          ? { background: "rgba(232,34,34,0.1)", color: "#E82222" }
                          : { background: "rgba(0,133,255,0.1)", color: "#0085FF" }
                      }
                    >
                      {deal.status}
                    </span>
                    <span className="text-xs font-medium text-[#0E121B] flex-shrink-0 w-24 text-right">
                      ₹{formatNumberToIndian(deal.amount || 0)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    );
  };

  const renderVendorsReport = () => {
    // Calculate metrics
    const totalVendors = filteredData.filteredVendors.length;
    const vendorsWithEmail = filteredData.filteredVendors.filter(
      (v) => v.email
    ).length;
    const vendorsWithPhone = filteredData.filteredVendors.filter(
      (v) => v.phone
    ).length;
    const vendorsWithGSTIN = filteredData.filteredVendors.filter(
      (v) => v.gstin
    ).length;
    const vendorsWithCompany = filteredData.filteredVendors.filter(
      (v) => v.company
    ).length;

    // Financial metrics
    const totalBalance = filteredData.filteredVendors.reduce(
      (sum, v) => sum + (v.balance || 0),
      0
    );
    const averageBalance = totalBalance / totalVendors;
    const vendorsWithPositiveBalance = filteredData.filteredVendors.filter(
      (v) => (v.balance || 0) > 0
    ).length;
    const vendorsWithNegativeBalance = filteredData.filteredVendors.filter(
      (v) => (v.balance || 0) < 0
    ).length;
    const vendorsWithZeroBalance = filteredData.filteredVendors.filter(
      (v) => (v.balance || 0) === 0
    ).length;

    // Vendors created this month
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const vendorsThisMonth = filteredData.filteredVendors.filter((v) => {
      const createdDate = new Date(v.createdAt);
      return (
        createdDate.getMonth() === currentMonth &&
        createdDate.getFullYear() === currentYear
      );
    }).length;


    const companyDistribution = filteredData.filteredVendors
      .filter((v) => v.company)
      .reduce((acc, vendor) => {
        acc[vendor.company] = (acc[vendor.company] || 0) + 1;
        return acc;
      }, {});

    const topCompanies = Object.entries(companyDistribution)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    // Data completeness score
    const completenessScore = Math.round(
      ((vendorsWithEmail +
        vendorsWithPhone +
        vendorsWithGSTIN +
        vendorsWithCompany) /
        (totalVendors * 4)) *
        100
    );

    // KPI row — same 5-card StatCard pattern used on the Companies tab.
    const totalVendorSpend = filteredData.filteredPurchases.reduce((sum, p) => sum + (p.grandTotal || 0), 0);
    const outstandingPayables = filteredData.filteredVendors
      .filter((v) => (v.balance || 0) > 0)
      .reduce((sum, v) => sum + v.balance, 0);
    const totalCredits = filteredData.filteredVendors
      .filter((v) => (v.balance || 0) < 0)
      .reduce((sum, v) => sum + Math.abs(v.balance), 0);
    const activeVendorIds = new Set(
      filteredData.filteredPurchases.map((p) => p.vendor?._id || p.vendor).filter(Boolean)
    );
    const activeVendors = activeVendorIds.size;
    const avgVendorSpend = activeVendors > 0 ? totalVendorSpend / activeVendors : 0;

    const lastMonthDateV = new Date(currentYear, currentMonth - 1, 1);
    const lastMonthV = lastMonthDateV.getMonth();
    const lastMonthYearV = lastMonthDateV.getFullYear();
    const purchasesThisMonth = filteredData.filteredPurchases.filter((p) => {
      const d = new Date(p.purchaseDate || p.createdAt);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
    const purchasesLastMonth = filteredData.filteredPurchases.filter((p) => {
      const d = new Date(p.purchaseDate || p.createdAt);
      return d.getMonth() === lastMonthV && d.getFullYear() === lastMonthYearV;
    });
    const spendThisMonth = purchasesThisMonth.reduce((sum, p) => sum + (p.grandTotal || 0), 0);
    const spendLastMonth = purchasesLastMonth.reduce((sum, p) => sum + (p.grandTotal || 0), 0);
    const vendorSpendChange =
      spendLastMonth > 0 ? { pct: Math.round(((spendThisMonth - spendLastMonth) / spendLastMonth) * 100), isNew: false } : { pct: 0, isNew: spendThisMonth > 0 };
    const activeThisMonth = new Set(purchasesThisMonth.map((p) => p.vendor?._id || p.vendor)).size;
    const activeLastMonth = new Set(purchasesLastMonth.map((p) => p.vendor?._id || p.vendor)).size;
    const activeVendorsChange =
      activeLastMonth > 0 ? { pct: Math.round(((activeThisMonth - activeLastMonth) / activeLastMonth) * 100), isNew: false } : { pct: 0, isNew: activeThisMonth > 0 };

    // Payment Distribution — real breakdown of purchase statuses (proxy for payment state)
    const paymentStatusColors = {
      Received: "#34C759",
      Pending: "#0085FF",
      Partial: "#FC9C32",
      Draft: "#9747FF",
      Cancelled: "#E82222",
    };
    const purchaseStatusCounts = filteredData.filteredPurchases.reduce((acc, p) => {
      const key = p.status || "Draft";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const totalPurchasesForStatus = filteredData.filteredPurchases.length;
    const paymentDistribution = Object.entries(purchaseStatusCounts)
      .map(([status, count]) => ({
        status,
        count,
        pct: totalPurchasesForStatus > 0 ? Math.round((count / totalPurchasesForStatus) * 100) : 0,
        color: paymentStatusColors[status] || "#9CA3AF",
      }))
      .sort((a, b) => b.count - a.count);

    // Vendor Spend Overtime — Total Spend / Received / Pending value per month, last 6 months.
    const vendorSpendTrendData = (() => {
      const now = new Date();
      const months = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
        return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) };
      });
      const buckets = Object.fromEntries(months.map((m) => [m.key, { Spend: 0, Received: 0, Pending: 0 }]));
      filteredData.filteredPurchases.forEach((p) => {
        const d = new Date(p.purchaseDate || p.createdAt);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        if (!buckets[key]) return;
        buckets[key].Spend += p.grandTotal || 0;
        if (p.status === "Paid") buckets[key].Received += p.grandTotal || 0;
        else if (p.status === "Pending" || p.status === "Partial") buckets[key].Pending += p.grandTotal || 0;
      });
      return months.map((m) => ({ name: m.label, ...buckets[m.key] }));
    })();
    const vendorSpendTrendFormatY = (v) => {
      if (v >= 1e7) return `₹${(v / 1e7).toFixed(v % 1e7 === 0 ? 0 : 1)}Cr`;
      if (v >= 1e5) return `₹${(v / 1e5).toFixed(v % 1e5 === 0 ? 0 : 1)}L`;
      if (v >= 1e3) return `₹${(v / 1e3).toFixed(v % 1e3 === 0 ? 0 : 1)}K`;
      return `₹${v}`;
    };

    // Top Vendors by Spend — real per-vendor rollup from purchases + vendor balance.
    const topVendorsBySpend = (() => {
      const byVendor = {};
      filteredData.filteredPurchases.forEach((p) => {
        const vendorId = p.vendor?._id || p.vendor;
        if (!vendorId) return;
        if (!byVendor[vendorId]) {
          byVendor[vendorId] = { vendorId, totalPaid: 0, transactions: 0, lastPayment: null, statuses: [] };
        }
        byVendor[vendorId].totalPaid += p.grandTotal || 0;
        byVendor[vendorId].transactions += 1;
        byVendor[vendorId].statuses.push(p.status);
        const d = new Date(p.purchaseDate || p.createdAt);
        if (!byVendor[vendorId].lastPayment || d > byVendor[vendorId].lastPayment) {
          byVendor[vendorId].lastPayment = d;
        }
      });
      const vendorLookup = Object.fromEntries(filteredData.filteredVendors.map((v) => [v._id, v]));
      return Object.values(byVendor)
        .map((row) => {
          const vendor = vendorLookup[row.vendorId];
          // Worst-case status across the vendor's purchases: any Pending/Draft
          // wins over Partial, which wins over a clean all-Received history.
          let status = "Paid";
          if (row.statuses.some((s) => s === "Pending" || s === "Draft" || s === "Cancelled")) status = "Pending";
          else if (row.statuses.some((s) => s === "Partial")) status = "Partially Paid";
          return {
            ...row,
            name: vendor?.name || "Unknown Vendor",
            outstanding: Math.max(vendor?.balance || 0, 0),
            status,
          };
        })
        .sort((a, b) => b.totalPaid - a.totalPaid)
        .slice(0, 4);
    })();
    const vendorSpendGoesTotal = topVendorsBySpend.reduce((sum, v) => sum + v.totalPaid, 0);
    const vendorStatusStyles = {
      Paid: { bg: "rgba(52,199,89,0.1)", color: "#34C759" },
      "Partially Paid": { bg: "rgba(216,112,0,0.1)", color: "#D87000" },
      Pending: { bg: "rgba(232,34,34,0.1)", color: "#E82222" },
    };

    // Recent Payments — most recent purchases across all vendors.
    const recentPayments = [...filteredData.filteredPurchases]
      .sort((a, b) => new Date(b.purchaseDate || b.createdAt) - new Date(a.purchaseDate || a.createdAt))
      .slice(0, 4)
      .map((p) => {
        const d = new Date(p.purchaseDate || p.createdAt);
        const status = p.status === "Paid" ? "Paid" : p.status === "Partial" ? "Partially Paid" : "Pending";
        return {
          id: p._id,
          day: d.toLocaleDateString("en-IN", { day: "2-digit" }),
          month: d.toLocaleDateString("en-IN", { month: "short" }),
          amount: p.grandTotal || 0,
          vendorName: p.vendor?.name || "Unknown Vendor",
          status,
        };
      });

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            title="Total Vendor Spend"
            value={`₹${formatNumberToIndian(Math.round(totalVendorSpend))}`}
            icon={<IndianRupeeIcon className="w-6 h-6" />}
            color="text-blue-600"
            change={vendorSpendChange}
            changeLabel="vs last month"
          />
          <StatCard
            title="Outstanding Payables"
            value={`₹${formatNumberToIndian(Math.round(outstandingPayables))}`}
            icon={<Clock className="w-6 h-6" />}
            color="text-red-600"
          />
          <StatCard
            title="Total Received / Credits"
            value={`₹${formatNumberToIndian(Math.round(totalCredits))}`}
            icon={<Building className="w-6 h-6" />}
            color="text-green-600"
          />
          <StatCard
            title="Active Vendors"
            value={activeVendors}
            icon={<TeamIcon className="w-6 h-6" />}
            color="text-purple-600"
            change={activeVendorsChange}
            changeLabel="vs last month"
          />
          <StatCard
            title="Average Vendor Spend"
            value={`₹${formatNumberToIndian(Math.round(avgVendorSpend))}`}
            icon={<TrendingUp className="w-6 h-6" />}
            color="text-orange-600"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 items-stretch">
          <div className="bg-white p-5 rounded-xl border border-[#E7E4E3] shadow-sm flex flex-col">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-semibold text-[#0E121B]">Vendor Spend Overtime</h3>
              <div className="flex items-center gap-4">
                {[
                  { key: "Spend", color: "#0085FF" },
                  { key: "Received", color: "#00C950" },
                  { key: "Pending", color: "#D87000" },
                ].map(({ key, color }) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <span className="inline-block w-5 h-0.5 rounded-full" style={{ background: color }} />
                    <span className="text-xs" style={{ color: "rgba(31,31,33,0.56)" }}>
                      {key}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={280} className="mt-2">
              <ComposedChart data={vendorSpendTrendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <pattern
                    id="vendorSpendHatch"
                    width="6"
                    height="6"
                    patternUnits="userSpaceOnUse"
                    patternTransform="rotate(45)"
                  >
                    <rect width="6" height="6" fill="rgba(0,133,255,0.06)" />
                    <line x1="0" y1="0" x2="0" y2="6" stroke="#0085FF" strokeOpacity="0.35" strokeWidth="1.5" />
                  </pattern>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(31,41,55,0.1)" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "#1F2937" }}
                  axisLine={{ stroke: "rgba(31,41,55,0.3)" }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={vendorSpendTrendFormatY}
                  tick={{ fontSize: 10, fill: "#1F2937" }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                  tickMargin={4}
                />
                <Tooltip
                  formatter={(value, name) => [`₹${formatNumberToIndian(Math.round(value))}`, name]}
                  contentStyle={{ borderRadius: 8, border: "1px solid #E7E4E3", fontSize: 12 }}
                />
                <Area
                  type="linear"
                  dataKey="Spend"
                  stroke="#0085FF"
                  strokeWidth={2}
                  fill="url(#vendorSpendHatch)"
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line type="linear" dataKey="Received" stroke="#00C950" strokeWidth={2} strokeDasharray="4 3" dot={false} />
                <Line type="linear" dataKey="Pending" stroke="#D87000" strokeWidth={2} strokeDasharray="4 3" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white p-5 rounded-xl border border-[#E7E4E3] shadow-sm">
            <h3 className="text-sm font-semibold text-[#0E121B]">Payment Distribution</h3>
            <p className="text-xs text-[#525866] mt-1">Purchase status breakdown across vendors</p>
            {paymentDistribution.length === 0 ? (
              <p className="text-sm text-gray-400 py-10 text-center">No purchase data available</p>
            ) : (
              <div className="flex items-center justify-between gap-4 mt-4 flex-wrap">
                <div className="relative flex-shrink-0" style={{ width: 220, height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={paymentDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={68}
                        outerRadius={108}
                        cornerRadius={3}
                        paddingAngle={paymentDistribution.length > 1 ? 2 : 0}
                        dataKey="count"
                        nameKey="status"
                        stroke="none"
                        label={({ cx, cy, midAngle, innerRadius, outerRadius, value }) => {
                          const RADIAN = Math.PI / 180;
                          const r = (innerRadius + outerRadius) / 2;
                          const x = cx + r * Math.cos(-midAngle * RADIAN);
                          const y = cy + r * Math.sin(-midAngle * RADIAN);
                          const pct = Math.round((value / totalPurchasesForStatus) * 100);
                          const text = `${pct}%`;
                          const w = text.length * 6 + 10;
                          return (
                            <g>
                              <rect x={x - w / 2} y={y - 8} width={w} height={16} rx={6} fill="#FFFFFF" />
                              <text
                                x={x}
                                y={y}
                                textAnchor="middle"
                                dominantBaseline="central"
                                fontSize={11}
                                fontWeight={500}
                                fill="#21201F"
                              >
                                {text}
                              </text>
                            </g>
                          );
                        }}
                        labelLine={false}
                      >
                        {paymentDistribution.map((entry) => (
                          <Cell key={entry.status} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  {paymentDistribution.map((entry) => (
                    <div key={entry.status} className="flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                        style={{ background: entry.color }}
                      />
                      <span className="text-xs text-[#21201F]/70 truncate min-w-[90px]">{entry.status}</span>
                      <span className="text-[11px] text-[#525866] text-right flex-shrink-0 w-8">
                        {entry.pct}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
          <div className="bg-white p-3 rounded-xl border border-[#E7E4E3] shadow-sm min-h-[200px] flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-[#0E121B]">Top Vendors by Spend</h3>
            {topVendorsBySpend.length === 0 ? (
              <p className="text-sm text-gray-400 py-10 text-center">No purchase data available</p>
            ) : (
              <div className="bg-[#F8FAFC] rounded-md p-2 flex-1 flex flex-col overflow-x-auto">
                <table className="w-full h-full min-w-[420px] border-collapse flex-1 flex flex-col">
                  <thead>
                    <tr className="bg-white rounded-md flex w-full">
                      {["Vendor", "Total Paid", "Outstanding", "Transactions", "Last Payment"].map((h) => (
                        <th
                          key={h}
                          className="flex-1 text-[12px] font-normal text-[#1F2937] text-center py-1.5 px-1.5 first:text-left"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="flex-1 flex flex-col justify-around">
                    {topVendorsBySpend.map((row) => (
                      <tr key={row.vendorId} className="flex items-center w-full border-t border-[#1F2937]/10">
                        <td className="flex-1 text-[12px] font-medium text-[#1F2937] py-1 px-1.5 truncate">
                          {row.name}
                        </td>
                        <td className="flex-1 text-[12px] font-medium text-black text-center py-1 px-1.5">
                          ₹{formatNumberToIndian(Math.round(row.totalPaid))}
                        </td>
                        <td className="flex-1 text-[12px] font-medium text-black text-center py-1 px-1.5">
                          ₹{formatNumberToIndian(Math.round(row.outstanding))}
                        </td>
                        <td className="flex-1 text-[12px] font-medium text-black text-center py-1 px-1.5">
                          {row.transactions}
                        </td>
                        <td className="flex-1 text-[12px] font-medium text-black text-center py-1 px-1.5">
                          {row.lastPayment
                            ? row.lastPayment.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="bg-white p-3 rounded-xl border border-[#E7E4E3] shadow-sm min-h-[200px] flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-[#0E121B]">Where Your Vendor Spend Goes</h3>
            {topVendorsBySpend.length === 0 ? (
              <p className="text-sm text-gray-400 py-10 text-center">No purchase data available</p>
            ) : (
              <div className="bg-[#F8FAFC] rounded-md p-2 flex-1 flex flex-col overflow-x-auto">
                <div className="flex items-center w-full bg-white rounded-md">
                  {["Vendor", "Spend Share", "Top Spend", "% of Total", "Status"].map((h) => (
                    <div
                      key={h}
                      className="flex-1 text-[12px] font-normal text-[#1F2937] text-center py-1.5 px-1.5 first:text-left"
                    >
                      {h}
                    </div>
                  ))}
                </div>
                <div className="flex-1 flex flex-col justify-around">
                  {topVendorsBySpend.map((row) => {
                    const pct = vendorSpendGoesTotal > 0 ? (row.totalPaid / vendorSpendGoesTotal) * 100 : 0;
                    const style = vendorStatusStyles[row.status];
                    return (
                      <div key={row.vendorId} className="flex items-center w-full border-t border-[#1F2937]/10">
                        <div className="flex-1 text-[12px] font-medium text-[#1F2937] py-1 px-1.5 truncate">
                          {row.name}
                        </div>
                        <div className="flex-1 flex items-center justify-center py-1 px-1.5">
                          <div className="relative w-full max-w-[110px] h-1.5 rounded-full bg-[#0085FF]/25">
                            <div
                              className="absolute inset-y-0 left-0 rounded-full bg-[#0085FF]"
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                        </div>
                        <div className="flex-1 text-[12px] font-medium text-black text-center py-1 px-1.5">
                          ₹{formatNumberToIndian(Math.round(row.totalPaid))}
                        </div>
                        <div className="flex-1 text-[12px] font-medium text-black text-center py-1 px-1.5">
                          {pct.toFixed(1)}%
                        </div>
                        <div className="flex-1 flex items-center justify-center py-1 px-1.5">
                          <span
                            className="text-[12px] font-medium px-2.5 py-1 rounded-full whitespace-nowrap"
                            style={{ background: style.bg, color: style.color }}
                          >
                            {row.status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <div className="bg-white p-4 rounded-lg border border-[#E1E4EA] shadow-sm min-h-[200px] flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#1C1C1D]">Recent Payments</h3>
              <span className="text-xs font-semibold text-[#0085FF] cursor-pointer" onClick={() => setActiveTab("purchases")}>
                View All
              </span>
            </div>
            {recentPayments.length === 0 ? (
              <p className="flex-1 flex items-center justify-center text-sm text-gray-400">No purchases yet</p>
            ) : (
              <div className="flex-1 flex flex-col justify-around">
                {recentPayments.map((p) => {
                  const style = vendorStatusStyles[p.status];
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-4 py-2 border-b border-[#E7E4E3] last:border-b-0"
                    >
                      <div className="flex flex-col items-center w-[43px] shrink-0">
                        <span className="text-base font-medium text-black">{p.day}</span>
                        <span className="text-[10px] font-medium text-[#6B7280]/50">{p.month}</span>
                      </div>
                      <div className="w-[42px] h-[42px] rounded-full bg-[#0085FF]/10 flex items-center justify-center shrink-0">
                        <Wallet className="w-5 h-5 text-[#0085FF]" />
                      </div>
                      <span className="text-sm font-medium text-[#404040] whitespace-nowrap">
                        ₹{formatNumberToIndian(Math.round(p.amount))}
                      </span>
                      <span className="text-sm font-medium text-[#525252] truncate flex-1">{p.vendorName}</span>
                      <span
                        className="text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap shrink-0"
                        style={{ background: style.bg, color: style.color }}
                      >
                        {p.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
          {/* Vendor Balance Overview */}
          <div className="bg-white p-5 rounded-xl border border-[#E7E4E3] shadow-sm">
            <h3 className="text-sm font-semibold text-[#0E121B]">Vendor Balance Overview</h3>
            <p className="text-xs text-[#525866] mt-1">
              {completenessScore}% profile completeness · {vendorsThisMonth} new this month
            </p>
            <div className="grid grid-cols-3 gap-3 mt-4">
              <div className="text-center">
                <p className="text-lg font-semibold text-[#E82222]">{vendorsWithPositiveBalance}</p>
                <p className="text-[11px] text-[#525866] mt-0.5">Payable</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-[#D87000]">{vendorsWithNegativeBalance}</p>
                <p className="text-[11px] text-[#525866] mt-0.5">Credit</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-[#34C759]">{vendorsWithZeroBalance}</p>
                <p className="text-[11px] text-[#525866] mt-0.5">Settled</p>
              </div>
            </div>
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
              <span className="text-xs text-gray-500">Average Balance</span>
              <span className="text-sm font-semibold text-gray-900">
                ₹{formatNumberToIndian(Math.round(averageBalance || 0))}
              </span>
            </div>
          </div>
          {/* Top Companies (by number of linked vendors) */}
          <div className="bg-white p-5 rounded-xl border border-[#E7E4E3] shadow-sm">
            <h3 className="text-sm font-semibold text-[#0E121B]">Top Companies</h3>
            <p className="text-xs text-[#525866] mt-1">By number of vendors</p>
            {topCompanies.length === 0 ? (
              <p className="text-sm text-gray-400 py-10 text-center">No company data yet</p>
            ) : (
              <div className="mt-4 flex flex-col gap-2.5">
                {topCompanies.map(([company, count], idx) => (
                  <div key={company} className="flex items-center gap-2.5">
                    <span className="text-[11px] font-medium text-[#99A0AE] w-4 flex-shrink-0">{idx + 1}</span>
                    <span className="text-xs text-[#0E121B] truncate flex-1 min-w-0">{company}</span>
                    <span className="text-xs font-medium text-[#525866] flex-shrink-0">
                      {count} vendor{count !== 1 ? "s" : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-[#0E121B]">Vendors Directory</h3>
          <div className="bg-white rounded-xl border border-[#E1E4EA] overflow-hidden">
            {filteredData.filteredVendors.length === 0 ? (
              <p className="text-sm text-gray-400 py-16 text-center">No vendors yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse">
                  <thead>
                    <tr className="bg-[#F5F7FA] border-b border-[#E1E4EA]">
                      {["Vendor", "Company", "Contact", "Created", "Balance", "Status"].map((h) => (
                        <th
                          key={h}
                          className="text-left text-xs font-medium text-[#525866] py-3 px-3 whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.filteredVendors.slice(0, 8).map((v) => (
                      <tr key={v._id} className="border-b border-[#E1E4EA] last:border-b-0">
                        <td className="py-2.5 px-3 text-sm font-medium text-[#222530] whitespace-nowrap">
                          {v.name}
                        </td>
                        <td className="py-2.5 px-3 text-sm text-[#525866] whitespace-nowrap">
                          {v.company || "—"}
                        </td>
                        <td className="py-2.5 px-3 text-sm text-[#525866] whitespace-nowrap">
                          {v.email || v.phone || "—"}
                        </td>
                        <td className="py-2.5 px-3 text-sm text-[#525866] whitespace-nowrap">
                          {v.createdAt
                            ? new Date(v.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                            : "—"}
                        </td>
                        <td className="py-2.5 px-3 text-sm text-[#525866] whitespace-nowrap">
                          ₹{formatNumberToIndian(Math.round(v.balance || 0))}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className="text-xs font-medium px-2.5 py-1 rounded-full"
                            style={
                              (v.balance || 0) > 0
                                ? { background: "rgba(232,34,34,0.1)", color: "#E82222" }
                                : (v.balance || 0) < 0
                                ? { background: "rgba(216,112,0,0.1)", color: "#D87000" }
                                : { background: "rgba(52,199,89,0.1)", color: "#34C759" }
                            }
                          >
                            {(v.balance || 0) > 0 ? "Payable" : (v.balance || 0) < 0 ? "Credit" : "Settled"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderPurchaseOrdersReport = () => {
    // Calculate metrics
    const totalPOs = filteredData.filteredPurchaseOrders.length;
    const totalAmount = filteredData.filteredPurchaseOrders.reduce(
      (sum, po) => sum + (po.totalAmount || 0),
      0
    );
    const averagePOAmount = totalAmount / totalPOs || 0;

    // Status distribution
    const statusDistribution = filteredData.filteredPurchaseOrders.reduce(
      (acc, po) => {
        const status = po.status || "Unknown";
        acc[status] = acc[status] || { count: 0, amount: 0 };
        acc[status].count += 1;
        acc[status].amount += po.totalAmount || 0;
        return acc;
      },
      {}
    );

    // POs this month
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const posThisMonth = filteredData.filteredPurchaseOrders.filter((po) => {
      const orderDate = new Date(po.orderDate);
      return (
        orderDate.getMonth() === currentMonth &&
        orderDate.getFullYear() === currentYear
      );
    });
    const posThisMonthCount = posThisMonth.length;
    const posThisMonthAmount = posThisMonth.reduce(
      (sum, po) => sum + (po.totalAmount || 0),
      0
    );

    // POs this week
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const posThisWeek = filteredData.filteredPurchaseOrders.filter(
      (po) => new Date(po.orderDate) >= oneWeekAgo
    ).length;

    // Pending/Active POs
    const pendingPOs = filteredData.filteredPurchaseOrders.filter(
      (po) =>
        po.status === "Pending" ||
        po.status === "Approved" ||
        po.status === "In Progress"
    );
    const pendingPOsCount = pendingPOs.length;
    const pendingPOsAmount = pendingPOs.reduce(
      (sum, po) => sum + (po.totalAmount || 0),
      0
    );

    // Top vendors by PO amount
    const vendorPOs = filteredData.filteredPurchaseOrders
      .filter((po) => po.vendor?.name)
      .reduce((acc, po) => {
        const vendorName = po.vendor.name;
        acc[vendorName] = acc[vendorName] || { count: 0, amount: 0 };
        acc[vendorName].count += 1;
        acc[vendorName].amount += po.totalAmount || 0;
        return acc;
      }, {});

    const topVendors = Object.entries(vendorPOs)
      .sort(([, a], [, b]) => b.amount - a.amount)
      .slice(0, 5);

    // Largest POs
    const largestPOs = [...filteredData.filteredPurchaseOrders]
      .sort((a, b) => (b.totalAmount || 0) - (a.totalAmount || 0))
      .slice(0, 5);

    // KPI row — same 5-card StatCard pattern used on the Companies tab, with
    // real month-over-month deltas against last month's purchase orders.
    const lastMonthDatePO = new Date(currentYear, currentMonth - 1, 1);
    const lastMonthPO = lastMonthDatePO.getMonth();
    const lastMonthYearPO = lastMonthDatePO.getFullYear();
    const posLastMonth = filteredData.filteredPurchaseOrders.filter((po) => {
      const d = new Date(po.orderDate);
      return d.getMonth() === lastMonthPO && d.getFullYear() === lastMonthYearPO;
    });
    const pctChangePO = (curr, prev) => (prev > 0 ? Math.round(((curr - prev) / prev) * 100) : curr > 0 ? 100 : 0);

    const totalPOValueChange = pctChangePO(posThisMonthAmount, posLastMonth.reduce((s, po) => s + (po.totalAmount || 0), 0));
    const openOrdersLastMonth = posLastMonth.filter((po) => po.status === "Pending" || po.status === "Approved").length;
    const openOrdersThisMonth = posThisMonth.filter((po) => po.status === "Pending" || po.status === "Approved").length;
    const openOrdersChange = pctChangePO(openOrdersThisMonth, openOrdersLastMonth);

    const openOrdersTotal = filteredData.filteredPurchaseOrders.filter((po) => po.status === "Pending" || po.status === "Approved").length;
    const pendingApprovalPOs = filteredData.filteredPurchaseOrders.filter((po) => po.status === "Pending");
    const pendingApprovalAmount = pendingApprovalPOs.reduce((s, po) => s + (po.totalAmount || 0), 0);

    const orderedPOs = filteredData.filteredPurchaseOrders.filter((po) => po.status === "Approved");
    const orderedValue = orderedPOs.reduce((s, po) => s + (po.totalAmount || 0), 0);
    const orderedLastMonth = posLastMonth.filter((po) => po.status === "Approved").reduce((s, po) => s + (po.totalAmount || 0), 0);
    const orderedThisMonth = posThisMonth.filter((po) => po.status === "Approved").reduce((s, po) => s + (po.totalAmount || 0), 0);
    const orderedValueChange = pctChangePO(orderedThisMonth, orderedLastMonth);

    // PO Value Overtime — Total / Ordered (Approved) / Outstanding (Pending) value per month, last 6 months.
    const poValueTrendData = (() => {
      const now = new Date();
      const months = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
        return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("en-IN", { month: "short" }) };
      });
      const buckets = Object.fromEntries(months.map((m) => [m.key, { Total: 0, Ordered: 0, Outstanding: 0 }]));
      filteredData.filteredPurchaseOrders.forEach((po) => {
        const d = new Date(po.orderDate);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        if (!buckets[key]) return;
        buckets[key].Total += po.totalAmount || 0;
        if (po.status === "Approved") buckets[key].Ordered += po.totalAmount || 0;
        else if (po.status === "Pending") buckets[key].Outstanding += po.totalAmount || 0;
      });
      return months.map((m) => ({ name: m.label, ...buckets[m.key] }));
    })();
    const poValueTrendFormatY = (v) => {
      if (v >= 1e7) return `₹${(v / 1e7).toFixed(v % 1e7 === 0 ? 0 : 1)}Cr`;
      if (v >= 1e5) return `₹${(v / 1e5).toFixed(v % 1e5 === 0 ? 0 : 1)}L`;
      if (v >= 1e3) return `₹${(v / 1e3).toFixed(v % 1e3 === 0 ? 0 : 1)}K`;
      return `₹${v}`;
    };

    // PO Status Distribution — real breakdown of purchase order statuses.
    const poStatusColors = {
      Approved: "#00C950",
      Pending: "#0085FF",
      Delivered: "#9747FF",
      Rejected: "#E82222",
    };
    const poStatusDistribution = Object.entries(statusDistribution)
      .map(([status, data]) => ({
        status,
        count: data.count,
        pct: totalPOs > 0 ? Math.round((data.count / totalPOs) * 100) : 0,
        color: poStatusColors[status] || "#9CA3AF",
      }))
      .sort((a, b) => b.count - a.count);
    const approvalRate = totalPOs > 0 ? Math.round(((statusDistribution.Approved?.count || 0) + (statusDistribution.Delivered?.count || 0)) / totalPOs * 100) : 0;

    // PO Alerts — real, computed from actual order age/status (no dedicated
    // "expected delivery" field on PurchaseOrder, so "overdue" is derived
    // from how long a PO has sat in a given status).
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const pendingPOsList = filteredData.filteredPurchaseOrders.filter((po) => po.status === "Pending");
    const overduePendingPOs = pendingPOsList.filter((po) => new Date(po.orderDate) < sevenDaysAgo);
    const approvedNotDelivered = filteredData.filteredPurchaseOrders.filter((po) => po.status === "Approved");
    // Upcoming Deliveries — approved POs not yet delivered, soonest-ordered first.
    const upcomingDeliveries = [...approvedNotDelivered]
      .sort((a, b) => new Date(a.orderDate) - new Date(b.orderDate))
      .slice(0, 5);
    const rejectedPOs = filteredData.filteredPurchaseOrders.filter((po) => po.status === "Rejected");

    const sumAmount = (list) => list.reduce((s, po) => s + (po.totalAmount || 0), 0);
    const poAlerts = [
      {
        key: "overdue",
        title: "Overdue Approvals",
        subtitle: `₹${formatNumberToIndian(Math.round(sumAmount(overduePendingPOs)))} associated pipeline with ${overduePendingPOs.length} POs`,
        bg: "#FCCCCD",
        color: "#DF120B",
        Icon: AlertCircle,
      },
      {
        key: "pending",
        title: `${pendingPOsList.length} POs Awaiting Approval`,
        subtitle: `₹${formatNumberToIndian(Math.round(sumAmount(pendingPOsList)))} associated pipeline with pending approvals`,
        bg: "rgba(255,204,0,0.1)",
        color: "#D4BF00",
        Icon: Clock,
      },
      {
        key: "approved",
        title: `${approvedNotDelivered.length} POs Approved, Not Delivered`,
        subtitle: `₹${formatNumberToIndian(Math.round(sumAmount(approvedNotDelivered)))} associated POs in transit`,
        bg: "rgba(0,133,255,0.1)",
        color: "#0085FF",
        Icon: Package,
      },
      {
        key: "rejected",
        title: `${rejectedPOs.length} POs Rejected`,
        subtitle: `₹${formatNumberToIndian(Math.round(sumAmount(rejectedPOs)))} associated pipeline was rejected`,
        bg: "#FCCCCD",
        color: "#F60000",
        Icon: XCircle,
      },
    ];

    return (
      <div className="space-y-6">
        {/* KPI row — same StatCard pattern (icon + label/value + bottom-right
            change badge) used on the Companies tab. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            title="Total PO Value"
            value={`₹${formatNumberToIndian(Math.round(totalAmount))}`}
            icon={<IndianRupeeIcon className="w-6 h-6" />}
            color="text-blue-600"
            change={totalPOValueChange}
            changeLabel="vs last month"
          />
          <StatCard
            title="Open Orders"
            value={openOrdersTotal}
            icon={<Package className="w-6 h-6" />}
            color="text-purple-600"
            change={openOrdersChange}
            changeLabel="vs last month"
          />
          <StatCard
            title="Pending Approval"
            value={pendingApprovalPOs.length}
            icon={<Clock className="w-6 h-6" />}
            color="text-orange-600"
          />
          <StatCard
            title="Ordered Value"
            value={`₹${formatNumberToIndian(Math.round(orderedValue))}`}
            icon={<ClipboardList className="w-6 h-6" />}
            color="text-emerald-600"
            change={orderedValueChange}
            changeLabel="vs last month"
          />
          <StatCard
            title="Outstanding"
            value={`₹${formatNumberToIndian(Math.round(pendingApprovalAmount))}`}
            icon={<AlertCircle className="w-6 h-6" />}
            color="text-red-600"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
          <div className="bg-white p-5 rounded-xl border border-[#E7E4E3] shadow-sm min-h-[220px] flex flex-col">
            <h3 className="text-sm font-semibold text-[#0E121B]">PO Value Overtime</h3>
            <ResponsiveContainer width="100%" height="100%" minHeight={160} className="mt-2 flex-1">
              <AreaChart data={poValueTrendData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPOTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0085FF" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#0085FF" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorPOOrdered" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00C950" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#00C950" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorPOOutstanding" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#E82222" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#E82222" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" vertical={false} />
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fontFamily: "Inter", fill: "#525252" }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  tickFormatter={poValueTrendFormatY}
                  tick={{ fontSize: 10, fontFamily: "Inter", fill: "#525252" }}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const row = payload[0].payload;
                    const rows = [
                      { label: "Total", value: row.Total, color: "#0085FF" },
                      { label: "Ordered", value: row.Ordered, color: "#00C950" },
                      { label: "Outstanding", value: row.Outstanding, color: "#E82222" },
                    ];
                    return (
                      <div className="bg-white border border-gray-200 rounded-md shadow-lg p-2">
                        <p className="text-xs font-medium text-gray-500 mb-1.5">{label}</p>
                        <div className="space-y-1.5">
                          {rows.map((r) => (
                            <div key={r.label} className="flex items-center gap-1.5">
                              <span className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background: r.color }} />
                              <div>
                                <p className="text-[11px] text-gray-500 leading-tight">{r.label}</p>
                                <p className="text-xs font-medium text-gray-900 leading-tight">
                                  ₹{formatNumberToIndian(Math.round(r.value))}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }}
                />
                <Area type="monotone" dataKey="Total" stroke="#0085FF" strokeWidth={2} fill="url(#colorPOTotal)" />
                <Area type="monotone" dataKey="Ordered" stroke="#00C950" strokeWidth={2} fill="url(#colorPOOrdered)" />
                <Area type="monotone" dataKey="Outstanding" stroke="#E82222" strokeWidth={2} fill="url(#colorPOOutstanding)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white p-5 rounded-xl border border-[#E7E4E3] shadow-sm min-h-[220px]">
            <h3 className="text-sm font-semibold text-[#0E121B]">PO Status Distribution</h3>
            {poStatusDistribution.length === 0 ? (
              <p className="text-sm text-gray-400 py-10 text-center">No purchase order data available</p>
            ) : (
              <div className="flex items-center justify-between gap-4 mt-4 flex-wrap">
                <div className="relative flex-shrink-0" style={{ width: 220, height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={poStatusDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={68}
                        outerRadius={108}
                        cornerRadius={3}
                        paddingAngle={poStatusDistribution.length > 1 ? 2 : 0}
                        dataKey="count"
                        nameKey="status"
                        stroke="none"
                        label={({ cx, cy, midAngle, innerRadius, outerRadius, value }) => {
                          const RADIAN = Math.PI / 180;
                          const r = (innerRadius + outerRadius) / 2;
                          const x = cx + r * Math.cos(-midAngle * RADIAN);
                          const y = cy + r * Math.sin(-midAngle * RADIAN);
                          const pct = totalPOs > 0 ? Math.round((value / totalPOs) * 100) : 0;
                          const text = `${pct}%`;
                          const w = text.length * 6 + 10;
                          return (
                            <g>
                              <rect x={x - w / 2} y={y - 8} width={w} height={16} rx={6} fill="#FFFFFF" />
                              <text
                                x={x}
                                y={y}
                                textAnchor="middle"
                                dominantBaseline="central"
                                fontSize={11}
                                fontWeight={500}
                                fill="#21201F"
                              >
                                {text}
                              </text>
                            </g>
                          );
                        }}
                        labelLine={false}
                      >
                        {poStatusDistribution.map((entry) => (
                          <Cell key={entry.status} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        wrapperStyle={{ zIndex: 20 }}
                        contentStyle={{ borderRadius: 8, border: "1px solid #E7E4E3", fontSize: 12 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-0">
                    <span className="text-[32px] leading-[120%] font-semibold text-[#0A0A0A]">{approvalRate}%</span>
                    <span className="text-xs font-medium text-[#525252]">Approval Rate</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  {poStatusDistribution.map((entry) => (
                    <div key={entry.status} className="flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                        style={{ background: entry.color }}
                      />
                      <span className="text-xs text-[#21201F]/70 truncate min-w-[90px]">{entry.status}</span>
                      <span className="text-[11px] text-[#525866] text-right flex-shrink-0 w-8">
                        {entry.pct}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="bg-white p-4 rounded-lg border border-[#E1E4EA] min-h-[220px] flex flex-col gap-3.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#1C1C1D]">Top Vendors by PO Value</h3>
              {topVendors.length > 0 && (
                <span
                  className="text-xs font-semibold text-[#0085FF] cursor-pointer"
                  onClick={() => setActiveTab("vendors")}
                >
                  View All
                </span>
              )}
            </div>
            {topVendors.length === 0 ? (
              <p className="flex-1 flex items-center justify-center text-sm text-gray-400">No purchase order data available</p>
            ) : (
              <div className="flex-1 flex flex-col">
                {(() => {
                  const vendorIconStyles = [
                    { bg: "rgba(142,98,239,0.1)", color: "#8E62EF", Icon: Building },
                    { bg: "#FCCCCD", color: "#DF120B", Icon: Building },
                    { bg: "rgba(0,133,255,0.1)", color: "#0085FF", Icon: ShoppingBag },
                    { bg: "rgba(52,199,89,0.1)", color: "#34C759", Icon: Package },
                    { bg: "rgba(252,204,205,0.1)", color: "#34C759", Icon: Package },
                  ];
                  const maxAmount = Math.max(...topVendors.map(([, data]) => data.amount), 1);
                  return topVendors.map(([vendorName, data], idx) => {
                    const style = vendorIconStyles[idx % vendorIconStyles.length];
                    const barPct = Math.round((data.amount / maxAmount) * 100);
                    return (
                      <div
                        key={vendorName}
                        className="flex items-center gap-4 py-1 border-b border-[#E7E4E3] last:border-b-0"
                      >
                        <div
                          className="w-[42px] h-[42px] rounded-full flex items-center justify-center shrink-0"
                          style={{ background: style.bg }}
                        >
                          <style.Icon className="w-5 h-5" style={{ color: style.color }} />
                        </div>
                        <div className="flex flex-col gap-0.5 shrink-0 w-[70px]">
                          <span className="text-sm font-medium text-[#525252] truncate">{vendorName}</span>
                          <span className="text-[10px] font-medium text-[#6B7280]/50 whitespace-nowrap">
                            {data.count} PO{data.count === 1 ? "" : "s"}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="relative w-full h-1.5 rounded-full bg-[#0085FF]/25">
                            <div
                              className="absolute inset-y-0 left-0 rounded-full bg-[#0085FF]"
                              style={{ width: `${Math.max(barPct, 4)}%` }}
                            />
                          </div>
                        </div>
                        <div className="flex flex-col gap-0.5 items-end shrink-0">
                          <span className="text-[10px] font-medium text-[#404040] whitespace-nowrap">
                            ₹{formatNumberToIndian(Math.round(data.amount))}
                          </span>
                          <span className="text-[10px] text-[#6B7280]/50 whitespace-nowrap">PO Value</span>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-[#0E121B]">Purchase Order Directory</h3>
          <div className="bg-white rounded-xl border border-[#E1E4EA] overflow-hidden">
            {filteredData.filteredPurchaseOrders.length === 0 ? (
              <p className="text-sm text-gray-400 py-16 text-center">No purchase orders yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse">
                  <thead>
                    <tr className="bg-[#F5F7FA] border-b border-[#E1E4EA]">
                      {["PO ID", "Vendor", "Order Date", "Amount", "Status"].map((h) => (
                        <th
                          key={h}
                          className="text-left text-xs font-medium text-[#525866] py-3 px-3 whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...filteredData.filteredPurchaseOrders]
                      .sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate))
                      .slice(0, 8)
                      .map((po) => {
                        const statusStyle =
                          po.status === "Delivered"
                            ? { bg: "rgba(52,199,89,0.1)", color: "#34C759" }
                            : po.status === "Approved"
                            ? { bg: "rgba(0,133,255,0.1)", color: "#0085FF" }
                            : po.status === "Rejected"
                            ? { bg: "rgba(246,0,0,0.1)", color: "#F60000" }
                            : { bg: "rgba(252,156,50,0.1)", color: "#FC9C32" };
                        return (
                          <tr key={po._id} className="border-b border-[#E1E4EA] last:border-b-0">
                            <td className="py-2.5 px-3 text-sm font-medium text-[#0085FF] whitespace-nowrap">
                              {po.poNumber}
                            </td>
                            <td className="py-2.5 px-3 text-sm text-[#222530] whitespace-nowrap">
                              {po.vendor?.name || "Unknown Vendor"}
                            </td>
                            <td className="py-2.5 px-3 text-sm text-[#525866] whitespace-nowrap">
                              {new Date(po.orderDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                            </td>
                            <td className="py-2.5 px-3 text-sm text-[#525866] whitespace-nowrap">
                              ₹{formatNumberToIndian(Math.round(po.totalAmount || 0))}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span
                                className="text-xs font-medium px-3 py-1 rounded-full"
                                style={{ background: statusStyle.bg, color: statusStyle.color }}
                              >
                                {po.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
          <div className="bg-white p-5 rounded-xl border border-[#E7E4E3] shadow-sm h-[280px] overflow-hidden">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#1C1C1D]">Purchase Order Alerts</h3>
            </div>
            {totalPOs === 0 ? (
              <p className="text-sm text-gray-400 py-10 text-center">No purchase order data available</p>
            ) : (
              <div className="mt-1 flex flex-col justify-around" style={{ height: 220 }}>
                {poAlerts.map((alert) => (
                  <div
                    key={alert.key}
                    className="flex items-center justify-between gap-3 py-1.5 border-b border-[#E1E4EA] last:border-b-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: alert.bg }}
                      >
                        <alert.Icon className="w-5 h-5" style={{ color: alert.color }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#525252] truncate">{alert.title}</p>
                        <p className="text-[10px] font-medium text-[#6B7280]/50 truncate">{alert.subtitle}</p>
                      </div>
                    </div>
                    <span
                      className="text-xs font-semibold text-[#0085FF] underline cursor-pointer shrink-0"
                      onClick={() => setActiveTab("purchase-orders")}
                    >
                      View All
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="bg-white p-3 rounded-xl border border-[#E7E4E3] shadow-sm h-[280px] overflow-hidden flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-[#0E121B]">Upcoming Deliveries</h3>
            {upcomingDeliveries.length === 0 ? (
              <p className="text-sm text-gray-400 flex-1 flex items-center justify-center">No approved POs pending delivery</p>
            ) : (
              <div className="bg-[#F8FAFC] rounded-md p-2 flex-1 flex flex-col overflow-x-auto">
                <div className="flex items-center w-full bg-white rounded-md">
                  {["Purchase Order ID", "Vendor", "Date"].map((h) => (
                    <div
                      key={h}
                      className="flex-1 text-[12px] font-normal text-[#1F2937] py-1.5 px-1.5 first:text-left last:text-right text-center"
                    >
                      {h}
                    </div>
                  ))}
                </div>
                <div className="flex-1 flex flex-col justify-around">
                  {upcomingDeliveries.map((po) => (
                    <div key={po._id} className="flex items-center w-full border-t border-[#1F2937]/10">
                      <div className="flex-1 text-[12px] font-medium text-[#1F2937] py-2 px-1.5 truncate">
                        {po.poNumber}
                      </div>
                      <div className="flex-1 text-[12px] font-medium text-black text-center py-2 px-1.5 truncate">
                        {po.vendor?.name || "Unknown"}
                      </div>
                      <div className="flex-1 text-[12px] font-medium text-[#34C759] text-right py-2 px-1.5 whitespace-nowrap">
                        {new Date(po.orderDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="bg-white p-4 rounded-lg border border-[#E1E4EA] h-[280px] overflow-hidden flex flex-col gap-6">
            <h3 className="text-sm font-semibold text-[#1C1C1D]">Delivery Timeline</h3>
            {upcomingDeliveries.length === 0 ? (
              <p className="text-sm text-gray-400 flex-1 flex items-center justify-center">No approved POs pending delivery</p>
            ) : (
              <div className="relative flex flex-col gap-4">
                <div className="absolute left-[13px] top-2 bottom-2 w-px bg-[#E7E7E9]" />
                {upcomingDeliveries.slice(0, 6).map((po) => (
                  <div key={po._id} className="relative z-10 flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-[#CCE7FF] flex items-center justify-center shrink-0">
                      <CalendarIcon className="w-4 h-4 text-[#0085FF]" />
                    </div>
                    <div className="flex items-center justify-between flex-1 min-w-0 gap-2">
                      <p className="text-xs font-semibold text-[#1C1C1D] truncate">
                        {po.poNumber} · {po.vendor?.name || "Unknown"}
                      </p>
                      <p className="text-[10px] text-[#78788D] whitespace-nowrap">
                        {new Date(po.orderDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 items-stretch">
          {/* Largest POs */}
          <div className="bg-white p-5 rounded-xl border border-[#E7E4E3] shadow-sm">
            <h3 className="text-sm font-semibold text-[#0E121B]">Largest Purchase Orders</h3>
            {largestPOs.length === 0 ? (
              <p className="text-sm text-gray-400 py-10 text-center">No purchase orders yet</p>
            ) : (
              <div className="mt-4 flex flex-col gap-2.5">
                {largestPOs.map((po, idx) => (
                  <div key={po._id} className="flex items-center gap-2.5">
                    <span className="text-[11px] font-medium text-[#99A0AE] w-4 flex-shrink-0">{idx + 1}</span>
                    <span className="text-xs font-medium text-[#0085FF] flex-shrink-0">{po.poNumber}</span>
                    <span className="text-xs text-[#0E121B] truncate flex-1 min-w-0">{po.vendor?.name || "Unknown Vendor"}</span>
                    <span className="text-xs font-medium text-[#0E121B] flex-shrink-0 w-24 text-right">
                      ₹{formatNumberToIndian(Math.round(po.totalAmount || 0))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* PO Summary */}
          <div className="bg-white p-5 rounded-xl border border-[#E7E4E3] shadow-sm">
            <h3 className="text-sm font-semibold text-[#0E121B]">PO Summary</h3>
            <div className="mt-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Average PO Amount</span>
                <span className="text-sm font-semibold text-gray-900">
                  ₹{formatNumberToIndian(Math.round(averagePOAmount))}
                </span>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <span className="text-xs text-gray-500">This Month</span>
                <span className="text-sm font-semibold text-gray-900">{posThisMonthCount} POs</span>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <span className="text-xs text-gray-500">This Week</span>
                <span className="text-sm font-semibold text-gray-900">{posThisWeek} POs</span>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <span className="text-xs text-gray-500">Pending</span>
                <span className="text-sm font-semibold text-gray-900">
                  {pendingPOsCount} (₹{formatNumberToIndian(Math.round(pendingPOsAmount))})
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderPurchasesReport = () => {
    // Calculate metrics
    const totalPurchases = filteredData.filteredPurchases.length;
    const totalAmount = filteredData.filteredPurchases.reduce(
      (sum, p) => sum + (p.grandTotal || 0),
      0
    );
    const averagePurchaseAmount = totalAmount / totalPurchases || 0;

    // Status distribution
    const statusDistribution = filteredData.filteredPurchases.reduce(
      (acc, purchase) => {
        const status = purchase.status || "Unknown";
        acc[status] = acc[status] || { count: 0, amount: 0 };
        acc[status].count += 1;
        acc[status].amount += purchase.grandTotal || 0;
        return acc;
      },
      {}
    );

    // Purchases this month
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const purchasesThisMonth = filteredData.filteredPurchases.filter((p) => {
      const purchaseDate = new Date(p.purchaseDate);
      return (
        purchaseDate.getMonth() === currentMonth &&
        purchaseDate.getFullYear() === currentYear
      );
    });
    const purchasesThisMonthCount = purchasesThisMonth.length;
    const purchasesThisMonthAmount = purchasesThisMonth.reduce(
      (sum, p) => sum + (p.grandTotal || 0),
      0
    );

    // Purchases this week
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const purchasesThisWeek = filteredData.filteredPurchases.filter(
      (p) => new Date(p.purchaseDate) >= oneWeekAgo
    ).length;

    // Top vendors by purchase amount
    const vendorPurchases = filteredData.filteredPurchases
      .filter((p) => p.vendor?.name)
      .reduce((acc, purchase) => {
        const vendorName = purchase.vendor.name;
        acc[vendorName] = acc[vendorName] || { count: 0, amount: 0 };
        acc[vendorName].count += 1;
        acc[vendorName].amount += purchase.grandTotal || 0;
        return acc;
      }, {});

    const topVendors = Object.entries(vendorPurchases)
      .sort(([, a], [, b]) => b.amount - a.amount)
      .slice(0, 5);

    // Largest purchases
    const largestPurchases = [...filteredData.filteredPurchases]
      .sort((a, b) => (b.grandTotal || 0) - (a.grandTotal || 0))
      .slice(0, 5);

    // KPI row — same 5-card StatCard pattern used on the Companies tab, with
    // real month-over-month deltas against last month's purchases.
    const paidPurchases = filteredData.filteredPurchases.filter((p) => p.status === "Paid");
    const paidPurchasesAmount = paidPurchases.reduce((s, p) => s + (p.grandTotal || 0), 0);
    const outstandingPurchases = filteredData.filteredPurchases.filter(
      (p) => p.status === "Pending" || p.status === "Partial" || p.status === "Draft"
    );
    const outstandingPurchasesAmount = outstandingPurchases.reduce((s, p) => s + (p.grandTotal || 0), 0);
    const gstInputTax = filteredData.filteredPurchases.reduce((s, p) => s + (p.totalTax || 0), 0);
    const activeVendorsCount = new Set(
      filteredData.filteredPurchases.map((p) => p.vendor?._id || p.vendor).filter(Boolean)
    ).size;

    const lastMonthDatePurch = new Date(currentYear, currentMonth - 1, 1);
    const lastMonthPurch = lastMonthDatePurch.getMonth();
    const lastMonthYearPurch = lastMonthDatePurch.getFullYear();
    const purchasesLastMonth = filteredData.filteredPurchases.filter((p) => {
      const d = new Date(p.purchaseDate);
      return d.getMonth() === lastMonthPurch && d.getFullYear() === lastMonthYearPurch;
    });
    const pctChangePurch = (curr, prev) => (prev > 0 ? Math.round(((curr - prev) / prev) * 100) : curr > 0 ? 100 : 0);
    const totalPurchasesChange = pctChangePurch(purchasesThisMonthAmount, purchasesLastMonth.reduce((s, p) => s + (p.grandTotal || 0), 0));
    const paidThisMonth = purchasesThisMonth.filter((p) => p.status === "Paid").reduce((s, p) => s + (p.grandTotal || 0), 0);
    const paidLastMonth = purchasesLastMonth.filter((p) => p.status === "Paid").reduce((s, p) => s + (p.grandTotal || 0), 0);
    const paidPurchasesChange = pctChangePurch(paidThisMonth, paidLastMonth);
    const outstandingThisMonth = purchasesThisMonth
      .filter((p) => p.status === "Pending" || p.status === "Partial" || p.status === "Draft")
      .reduce((s, p) => s + (p.grandTotal || 0), 0);
    const outstandingLastMonth = purchasesLastMonth
      .filter((p) => p.status === "Pending" || p.status === "Partial" || p.status === "Draft")
      .reduce((s, p) => s + (p.grandTotal || 0), 0);
    const outstandingPurchasesChange = pctChangePurch(outstandingThisMonth, outstandingLastMonth);
    const gstThisMonth = purchasesThisMonth.reduce((s, p) => s + (p.totalTax || 0), 0);
    const gstLastMonth = purchasesLastMonth.reduce((s, p) => s + (p.totalTax || 0), 0);
    const gstChange = pctChangePurch(gstThisMonth, gstLastMonth);
    const activeVendorsThisMonth = new Set(purchasesThisMonth.map((p) => p.vendor?._id || p.vendor)).size;
    const activeVendorsLastMonth = new Set(purchasesLastMonth.map((p) => p.vendor?._id || p.vendor)).size;
    const activeVendorsChangePurch = pctChangePurch(activeVendorsThisMonth, activeVendorsLastMonth);

    // Purchase Value Overtime — Total / Paid (Received) / Outstanding value per month, last 6 months.
    const purchaseValueTrendData = (() => {
      const now = new Date();
      const months = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
        return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("en-IN", { month: "short" }) };
      });
      const buckets = Object.fromEntries(months.map((m) => [m.key, { Total: 0, Paid: 0, Outstanding: 0 }]));
      filteredData.filteredPurchases.forEach((p) => {
        const d = new Date(p.purchaseDate);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        if (!buckets[key]) return;
        buckets[key].Total += p.grandTotal || 0;
        if (p.status === "Paid") buckets[key].Paid += p.grandTotal || 0;
        else if (p.status === "Pending" || p.status === "Partial" || p.status === "Draft") {
          buckets[key].Outstanding += p.grandTotal || 0;
        }
      });
      return months.map((m) => ({ name: m.label, ...buckets[m.key] }));
    })();
    const purchaseValueTrendFormatY = (v) => {
      if (v >= 1e7) return `₹${(v / 1e7).toFixed(v % 1e7 === 0 ? 0 : 1)}Cr`;
      if (v >= 1e5) return `₹${(v / 1e5).toFixed(v % 1e5 === 0 ? 0 : 1)}L`;
      if (v >= 1e3) return `₹${(v / 1e3).toFixed(v % 1e3 === 0 ? 0 : 1)}K`;
      return `₹${v}`;
    };

    // Purchase Status Distribution — real breakdown of purchase bill statuses.
    const purchaseStatusColors = {
      Received: "#34C759",
      Pending: "#0085FF",
      Partial: "#FC9C32",
      Draft: "#525252",
      Cancelled: "#E82222",
    };
    const purchaseStatusDistribution = Object.entries(statusDistribution)
      .map(([status, data]) => ({
        status,
        count: data.count,
        pct: totalPurchases > 0 ? Math.round((data.count / totalPurchases) * 100) : 0,
        color: purchaseStatusColors[status] || "#9CA3AF",
      }))
      .sort((a, b) => b.count - a.count);
    const receivedRate =
      totalPurchases > 0 ? Math.round(((statusDistribution.Received?.count || 0) / totalPurchases) * 100) : 0;

    // Purchase Status Funnel — real counts, ordered Total → Paid → Pending → Draft → Cancelled.
    const purchaseFunnelStages = [
      { label: "Total Purchases", count: totalPurchases, color: "#0085FF" },
      { label: "Paid", count: statusDistribution.Received?.count || 0, color: "#00C950" },
      { label: "Pending", count: (statusDistribution.Pending?.count || 0) + (statusDistribution.Partial?.count || 0), color: "#D87000" },
      { label: "Draft", count: statusDistribution.Draft?.count || 0, color: "#ECB900" },
      { label: "Cancelled", count: statusDistribution.Cancelled?.count || 0, color: "#E82222" },
    ];

    // Upcoming Payments — outstanding (Pending/Partial/Draft) purchase bills, soonest-dated first.
    const upcomingPayments = [...outstandingPurchases]
      .sort((a, b) => new Date(a.purchaseDate) - new Date(b.purchaseDate))
      .slice(0, 6);

    // Recent Purchase Activity — most recent purchase bills across all statuses.
    const recentPurchaseActivity = [...filteredData.filteredPurchases]
      .sort((a, b) => new Date(b.purchaseDate) - new Date(a.purchaseDate))
      .slice(0, 6);

    // Purchase Alerts — real, derived from actual bill age/status (no dedicated
    // "due date" field on Purchase, so "overdue" is derived from how long a
    // bill has sat outstanding).
    const sevenDaysAgoPurch = new Date();
    sevenDaysAgoPurch.setDate(sevenDaysAgoPurch.getDate() - 7);
    const overdueOutstandingPurchases = outstandingPurchases.filter((p) => new Date(p.purchaseDate) < sevenDaysAgoPurch);
    const dueSoonPurchases = outstandingPurchases.filter((p) => new Date(p.purchaseDate) >= sevenDaysAgoPurch);
    const partialPurchases = filteredData.filteredPurchases.filter((p) => p.status === "Partial");
    const sumGrandTotal = (list) => list.reduce((s, p) => s + (p.grandTotal || 0), 0);
    const purchaseAlerts = [
      {
        key: "overdue",
        title: "Overdue Payments",
        subtitle: `₹${formatNumberToIndian(Math.round(sumGrandTotal(overdueOutstandingPurchases)))} outstanding across ${overdueOutstandingPurchases.length} bills`,
        bg: "#FCCCCD",
        color: "#DF120B",
        Icon: AlertCircle,
      },
      {
        key: "awaiting",
        title: `${outstandingPurchases.length} Bills Awaiting Payment`,
        subtitle: `₹${formatNumberToIndian(Math.round(sumGrandTotal(outstandingPurchases)))} total outstanding`,
        bg: "rgba(255,204,0,0.1)",
        color: "#D4BF00",
        Icon: Clock,
      },
      {
        key: "partial",
        title: `${partialPurchases.length} Bills with Partial Payment`,
        subtitle: `₹${formatNumberToIndian(Math.round(sumGrandTotal(partialPurchases)))} partially received`,
        bg: "rgba(0,133,255,0.1)",
        color: "#0085FF",
        Icon: Wallet,
      },
      {
        key: "duesoon",
        title: "Due in Next 7 Days",
        subtitle: `${dueSoonPurchases.length} bills, ₹${formatNumberToIndian(Math.round(sumGrandTotal(dueSoonPurchases)))} due soon`,
        bg: "#FCCCCD",
        color: "#F60000",
        Icon: CalendarIcon,
      },
    ];

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            title="Total Purchases"
            value={`₹${formatNumberToIndian(Math.round(totalAmount))}`}
            icon={<IndianRupeeIcon className="w-6 h-6" />}
            color="text-blue-600"
            change={totalPurchasesChange}
            changeLabel="vs last month"
          />
          <StatCard
            title="Paid Purchases"
            value={`₹${formatNumberToIndian(Math.round(paidPurchasesAmount))}`}
            icon={<CheckCircle className="w-6 h-6" />}
            color="text-emerald-600"
            change={paidPurchasesChange}
            changeLabel="vs last month"
          />
          <StatCard
            title="Outstanding"
            value={`₹${formatNumberToIndian(Math.round(outstandingPurchasesAmount))}`}
            icon={<Clock className="w-6 h-6" />}
            color="text-red-600"
            change={outstandingPurchasesChange}
            changeLabel="vs last month"
          />
          <StatCard
            title="GST Input (ITC)"
            value={`₹${formatNumberToIndian(Math.round(gstInputTax))}`}
            icon={<Wallet className="w-6 h-6" />}
            color="text-purple-600"
            change={gstChange}
            changeLabel="vs last month"
          />
          <StatCard
            title="Active Vendors"
            value={activeVendorsCount}
            icon={<TeamIcon className="w-6 h-6" />}
            color="text-orange-600"
            change={activeVendorsChangePurch}
            changeLabel="vs last month"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
          <div className="bg-white p-5 rounded-xl border border-[#E7E4E3] shadow-sm min-h-[360px] flex flex-col">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[#0E121B] whitespace-nowrap">Purchase Value Overtime</h3>
              <div className="flex items-center gap-3">
                {[
                  { key: "Total", color: "#0085FF" },
                  { key: "Paid", color: "#00C950" },
                  { key: "Outstanding", color: "#E82222" },
                ].map(({ key, color }) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <span className="inline-block w-6 h-2 rounded-full shrink-0" style={{ background: color }} />
                    <span className="text-[11px] font-medium whitespace-nowrap" style={{ color: "#525252" }}>
                      {key}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={280} className="mt-2">
              <AreaChart data={purchaseValueTrendData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPurchaseTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0085FF" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#0085FF" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorPurchasePaid" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00C950" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#00C950" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorPurchaseOutstanding" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#E82222" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#E82222" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" vertical={false} />
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fontFamily: "Inter", fill: "#525252" }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  tickFormatter={purchaseValueTrendFormatY}
                  tick={{ fontSize: 10, fontFamily: "Inter", fill: "#525252" }}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const row = payload[0].payload;
                    const rows = [
                      { label: "Total", value: row.Total, color: "#0085FF" },
                      { label: "Paid", value: row.Paid, color: "#00C950" },
                      { label: "Outstanding", value: row.Outstanding, color: "#E82222" },
                    ];
                    return (
                      <div className="bg-white border border-gray-200 rounded-md shadow-lg p-2">
                        <p className="text-xs font-medium text-gray-500 mb-1.5">{label}</p>
                        <div className="space-y-1.5">
                          {rows.map((r) => (
                            <div key={r.label} className="flex items-center gap-1.5">
                              <span className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background: r.color }} />
                              <div>
                                <p className="text-[11px] text-gray-500 leading-tight">{r.label}</p>
                                <p className="text-xs font-medium text-gray-900 leading-tight">
                                  ₹{formatNumberToIndian(Math.round(r.value))}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }}
                />
                <Area type="monotone" dataKey="Total" stroke="#0085FF" strokeWidth={2} fill="url(#colorPurchaseTotal)" />
                <Area type="monotone" dataKey="Paid" stroke="#00C950" strokeWidth={2} fill="url(#colorPurchasePaid)" />
                <Area type="monotone" dataKey="Outstanding" stroke="#E82222" strokeWidth={2} fill="url(#colorPurchaseOutstanding)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white p-5 rounded-xl border border-[#E7E4E3] shadow-sm h-[360px] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#0E121B]">Purchase Status Funnel</h3>
            </div>
            {totalPurchases === 0 ? (
              <p className="text-sm text-gray-400 flex-1 flex items-center justify-center">No purchase data available</p>
            ) : (
              <div className="flex-1 flex items-center justify-center mt-2">
                {(() => {
                  const W = 400;
                  const stageH = 46;
                  const gap = 3;
                  const n = purchaseFunnelStages.length;
                  const H = n * stageH;
                  // Fixed, straight-edged taper — steady width decrease per stage,
                  // independent of the actual counts (only the numbers change).
                  const boundaries = [100, 82, 66, 50, 34, 18];
                  const widthAt = (pct) => (pct / 100) * W;
                  const leftX = (pct) => (W - widthAt(pct)) / 2;
                  const rightX = (pct) => leftX(pct) + widthAt(pct);
                  return (
                    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: 460 }}>
                      {purchaseFunnelStages.map((stage, idx) => {
                        const y0 = idx * stageH;
                        const y1 = y0 + stageH - gap;
                        const midY = (y0 + y1) / 2;
                        const lt = leftX(boundaries[idx]);
                        const rt = rightX(boundaries[idx]);
                        const lb = leftX(boundaries[idx + 1]);
                        const rb = rightX(boundaries[idx + 1]);
                        const d = `M ${lt} ${y0} L ${rt} ${y0} L ${rb} ${y1} L ${lb} ${y1} Z`;
                        return (
                          <g key={stage.label}>
                            <path d={d} fill={stage.color} />
                            <text
                              x={W / 2}
                              y={midY - 6}
                              textAnchor="middle"
                              fontSize="15"
                              fontWeight="600"
                              fill="#FFFFFF"
                            >
                              {stage.count}
                            </text>
                            <text
                              x={W / 2}
                              y={midY + 12}
                              textAnchor="middle"
                              fontSize="10"
                              fill="rgba(255,255,255,0.9)"
                            >
                              {stage.label}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  );
                })()}
              </div>
            )}
          </div>
          <div className="bg-white p-5 rounded-xl border border-[#E7E4E3] shadow-sm min-h-[360px]">
            <h3 className="text-sm font-semibold text-[#0E121B]">Purchase Status Distribution</h3>
            {purchaseStatusDistribution.length === 0 ? (
              <p className="text-sm text-gray-400 py-10 text-center">No purchase data available</p>
            ) : (
              <div className="flex items-center justify-between gap-4 mt-4 flex-wrap">
                <div className="relative flex-shrink-0" style={{ width: 220, height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={purchaseStatusDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={68}
                        outerRadius={108}
                        cornerRadius={3}
                        paddingAngle={purchaseStatusDistribution.length > 1 ? 2 : 0}
                        dataKey="count"
                        nameKey="status"
                        stroke="none"
                        label={({ cx, cy, midAngle, innerRadius, outerRadius, value }) => {
                          const RADIAN = Math.PI / 180;
                          const r = (innerRadius + outerRadius) / 2;
                          const x = cx + r * Math.cos(-midAngle * RADIAN);
                          const y = cy + r * Math.sin(-midAngle * RADIAN);
                          const pct = totalPurchases > 0 ? Math.round((value / totalPurchases) * 100) : 0;
                          const text = `${pct}%`;
                          const w = text.length * 6 + 10;
                          return (
                            <g>
                              <rect x={x - w / 2} y={y - 8} width={w} height={16} rx={6} fill="#FFFFFF" />
                              <text
                                x={x}
                                y={y}
                                textAnchor="middle"
                                dominantBaseline="central"
                                fontSize={11}
                                fontWeight={500}
                                fill="#21201F"
                              >
                                {text}
                              </text>
                            </g>
                          );
                        }}
                        labelLine={false}
                      >
                        {purchaseStatusDistribution.map((entry) => (
                          <Cell key={entry.status} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        wrapperStyle={{ zIndex: 20 }}
                        contentStyle={{ borderRadius: 8, border: "1px solid #E7E4E3", fontSize: 12 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-0">
                    <span className="text-[32px] leading-[120%] font-semibold text-[#0A0A0A]">{receivedRate}%</span>
                    <span className="text-xs font-medium text-[#525252]">Received Rate</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  {purchaseStatusDistribution.map((entry) => (
                    <div key={entry.status} className="flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                        style={{ background: entry.color }}
                      />
                      <span className="text-xs text-[#21201F]/70 truncate min-w-[90px]">{entry.status}</span>
                      <span className="text-[11px] text-[#525866] text-right flex-shrink-0 w-8">
                        {entry.pct}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
          <div className="bg-white p-4 rounded-xl border border-[#E7E4E3] shadow-sm h-[360px] overflow-hidden flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-[#0E121B]">Purchase Alerts</h3>
            {totalPurchases === 0 ? (
              <p className="text-sm text-gray-400 flex-1 flex items-center justify-center">No purchase data available</p>
            ) : (
              <div className="flex-1 flex flex-col">
                {purchaseAlerts.map((alert) => (
                  <div
                    key={alert.key}
                    className="flex items-center justify-between gap-3 flex-1 border-b border-[#E1E4EA] last:border-b-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: alert.bg }}
                      >
                        <alert.Icon className="w-5 h-5" style={{ color: alert.color }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#525252] truncate">{alert.title}</p>
                        <p className="text-[10px] font-medium text-[#6B7280]/50 truncate">{alert.subtitle}</p>
                      </div>
                    </div>
                    <span
                      className="text-xs font-semibold text-[#0085FF] underline cursor-pointer shrink-0"
                      onClick={() => setActiveTab("purchases")}
                    >
                      View All
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="bg-white p-4 rounded-xl border border-[#E7E4E3] shadow-sm h-[360px] overflow-hidden flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-[#0E121B]">Upcoming Payments</h3>
            {upcomingPayments.length === 0 ? (
              <p className="text-sm text-gray-400 flex-1 flex items-center justify-center">No outstanding purchases</p>
            ) : (
              <div className="bg-[#F8FAFC] rounded-md p-2 flex-1 flex flex-col">
                <div className="flex items-center w-full h-7 bg-white rounded-md">
                  {["Purchase ID", "Vendor", "Date"].map((h) => (
                    <div
                      key={h}
                      className="flex-1 text-[12px] font-normal text-[#1F2937] px-1.5 first:text-left last:text-right text-center"
                    >
                      {h}
                    </div>
                  ))}
                </div>
                <div className="flex-1 flex flex-col">
                  {upcomingPayments.map((p) => (
                    <div key={p._id} className="flex items-center w-full flex-1 border-t border-[#1F2937]/10">
                      <div className="flex-1 text-[12px] font-medium text-[#1F2937] px-1.5 truncate">
                        {p.purchaseNumber}
                      </div>
                      <div className="flex-1 text-[12px] font-medium text-black text-center px-1.5 truncate">
                        {p.vendor?.name || "Unknown"}
                      </div>
                      <div className="flex-1 text-[12px] font-medium text-[#34C759] text-right px-1.5 whitespace-nowrap">
                        {new Date(p.purchaseDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="bg-white p-4 rounded-xl border border-[#E1E4EA] h-[360px] overflow-hidden flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-[#1C1C1D]">Recent Purchase Activity</h3>
            {recentPurchaseActivity.length === 0 ? (
              <p className="text-sm text-gray-400 flex-1 flex items-center justify-center">No purchases yet</p>
            ) : (
              <div className="bg-[#F8FAFC] rounded-md p-2 flex-1 flex flex-col">
                <div className="flex items-center w-full h-7 bg-white rounded-md">
                  {["Purchase ID", "Vendor", "Date"].map((h) => (
                    <div
                      key={h}
                      className="flex-1 text-[12px] font-normal text-[#1F2937] px-1.5 first:text-left last:text-right text-center"
                    >
                      {h}
                    </div>
                  ))}
                </div>
                <div className="flex-1 flex flex-col">
                  {recentPurchaseActivity.map((p) => (
                    <div key={p._id} className="flex items-center w-full flex-1 border-t border-[#1F2937]/10">
                      <div className="flex-1 text-[12px] font-medium text-[#1F2937] px-1.5 truncate">
                        {p.purchaseNumber}
                      </div>
                      <div className="flex-1 text-[12px] font-medium text-black text-center px-1.5 truncate">
                        {p.vendor?.name || "Unknown"}
                      </div>
                      <div className="flex-1 text-[12px] font-medium text-[#78788D] text-right px-1.5 whitespace-nowrap">
                        {new Date(p.purchaseDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-[#0E121B]">Purchase Directory</h3>
          <div className="bg-white rounded-xl border border-[#E1E4EA] overflow-hidden">
            {filteredData.filteredPurchases.length === 0 ? (
              <p className="text-sm text-gray-400 py-16 text-center">No purchases yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse">
                  <thead>
                    <tr className="bg-[#F5F7FA] border-b border-[#E1E4EA]">
                      {["Purchase ID", "Vendor", "Purchase Date", "Amount", "Status"].map((h) => (
                        <th
                          key={h}
                          className={`text-xs font-medium text-[#525866] py-3 px-3 whitespace-nowrap ${h === "Status" ? "text-center" : "text-left"}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...filteredData.filteredPurchases]
                      .sort((a, b) => new Date(b.purchaseDate) - new Date(a.purchaseDate))
                      .slice(0, 8)
                      .map((p) => {
                        const statusStyle =
                          p.status === "Paid"
                            ? { bg: "rgba(52,199,89,0.1)", color: "#34C759" }
                            : p.status === "Partial"
                            ? { bg: "rgba(252,156,50,0.1)", color: "#FC9C32" }
                            : p.status === "Cancelled"
                            ? { bg: "rgba(246,0,0,0.1)", color: "#F60000" }
                            : p.status === "Pending"
                            ? { bg: "rgba(0,133,255,0.1)", color: "#0085FF" }
                            : { bg: "rgba(82,82,82,0.1)", color: "#525252" };
                        return (
                          <tr key={p._id} className="border-b border-[#E1E4EA] last:border-b-0">
                            <td className="py-2.5 px-3 text-sm font-medium text-[#0085FF] whitespace-nowrap">
                              {p.purchaseNumber}
                            </td>
                            <td className="py-2.5 px-3 text-sm text-[#222530] whitespace-nowrap">
                              {p.vendor?.name || "Unknown Vendor"}
                            </td>
                            <td className="py-2.5 px-3 text-sm text-[#525866] whitespace-nowrap">
                              {new Date(p.purchaseDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                            </td>
                            <td className="py-2.5 px-3 text-sm text-[#525866] whitespace-nowrap">
                              ₹{formatNumberToIndian(Math.round(p.grandTotal || 0))}
                            </td>
                            <td className="py-2.5 px-3 text-center whitespace-nowrap">
                              <span
                                className="inline-block text-xs font-medium px-3 py-1 rounded-full"
                                style={{ background: statusStyle.bg, color: statusStyle.color }}
                              >
                                {p.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
          {/* Largest Purchases */}
          <div className="bg-white p-5 rounded-xl border border-[#E7E4E3] shadow-sm">
            <h3 className="text-sm font-semibold text-[#0E121B]">Largest Purchases</h3>
            {largestPurchases.length === 0 ? (
              <p className="text-sm text-gray-400 py-10 text-center">No purchases yet</p>
            ) : (
              <div className="mt-4 flex flex-col gap-2.5">
                {largestPurchases.map((p, idx) => (
                  <div key={p._id} className="flex items-center gap-2.5">
                    <span className="text-[11px] font-medium text-[#99A0AE] w-4 flex-shrink-0">{idx + 1}</span>
                    <span className="text-xs text-[#0E121B] truncate flex-1 min-w-0">{p.vendor?.name || "Unknown Vendor"}</span>
                    <span className="text-xs font-medium text-[#0E121B] flex-shrink-0">
                      ₹{formatNumberToIndian(Math.round(p.grandTotal || 0))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Top Vendors by Purchase Value */}
          <div className="bg-white p-5 rounded-xl border border-[#E7E4E3] shadow-sm">
            <h3 className="text-sm font-semibold text-[#0E121B]">Top Vendors by Purchase Value</h3>
            {topVendors.length === 0 ? (
              <p className="text-sm text-gray-400 py-10 text-center">No purchases yet</p>
            ) : (
              <div className="mt-4 flex flex-col gap-2.5">
                {topVendors.map(([vendorName, data], idx) => (
                  <div key={vendorName} className="flex items-center gap-2.5">
                    <span className="text-[11px] font-medium text-[#99A0AE] w-4 flex-shrink-0">{idx + 1}</span>
                    <span className="text-xs text-[#0E121B] truncate flex-1 min-w-0">{vendorName}</span>
                    <span className="text-[11px] text-[#525866] flex-shrink-0">{data.count} purchase{data.count !== 1 ? "s" : ""}</span>
                    <span className="text-xs font-medium text-[#0E121B] flex-shrink-0 w-24 text-right">
                      ₹{formatNumberToIndian(Math.round(data.amount))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Purchase Summary */}
          <div className="bg-white p-5 rounded-xl border border-[#E7E4E3] shadow-sm">
            <h3 className="text-sm font-semibold text-[#0E121B]">Purchase Summary</h3>
            <div className="mt-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Average Purchase</span>
                <span className="text-sm font-semibold text-gray-900">
                  ₹{formatNumberToIndian(Math.round(averagePurchaseAmount))}
                </span>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <span className="text-xs text-gray-500">This Month</span>
                <span className="text-sm font-semibold text-gray-900">{purchasesThisMonthCount} purchases</span>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <span className="text-xs text-gray-500">This Week</span>
                <span className="text-sm font-semibold text-gray-900">{purchasesThisWeek} purchases</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderInvoicesReport = () => {
    // Calculate basic metrics
    const totalInvoices = filteredData.filteredInvoices.length;
    const totalAmount = filteredData.filteredInvoices.reduce(
      (sum, invoice) => sum + (invoice.amount || 0),
      0
    );
    const averageInvoiceAmount = totalAmount / totalInvoices || 0;

    // Status distribution
    const statusDistribution = filteredData.filteredInvoices.reduce(
      (acc, invoice) => {
        const status = invoice.status || "Unknown";
        acc[status] = acc[status] || { count: 0, amount: 0 };
        acc[status].count += 1;
        acc[status].amount += invoice.amount || 0;
        return acc;
      },
      {}
    );

    // Paid, Pending, Overdue invoices
    const paidInvoices = filteredData.filteredInvoices.filter(
      (i) => i.status === "Paid"
    );
    const pendingInvoices = filteredData.filteredInvoices.filter(
      (i) => i.status === "Pending" || i.status === "Sent"
    );
    const overdueInvoices = filteredData.filteredInvoices.filter((i) => {
      if (!i.dueDate) return false;
      const today = new Date();
      const dueDate = new Date(i.dueDate);
      return i.status !== "Paid" && dueDate < today;
    });

    const paidAmount = paidInvoices.reduce(
      (sum, i) => sum + (i.amount || 0),
      0
    );
    const pendingAmount = pendingInvoices.reduce(
      (sum, i) => sum + (i.amount || 0),
      0
    );
    const overdueAmount = overdueInvoices.reduce(
      (sum, i) => sum + (i.amount || 0),
      0
    );

    // Collection rate
    const collectionRate =
      totalAmount > 0 ? (paidAmount / totalAmount) * 100 : 0;

    // Invoices this month
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const invoicesThisMonth = filteredData.filteredInvoices.filter((i) => {
      const invoiceDate = new Date(i.date);
      return (
        invoiceDate.getMonth() === currentMonth &&
        invoiceDate.getFullYear() === currentYear
      );
    });
    const invoicesThisMonthCount = invoicesThisMonth.length;
    const invoicesThisMonthAmount = invoicesThisMonth.reduce(
      (sum, i) => sum + (i.amount || 0),
      0
    );

    // Top deals by invoice amount
    const dealInvoices = filteredData.filteredInvoices
      .filter((i) => i.deal?.title)
      .reduce((acc, invoice) => {
        const dealTitle = invoice.deal.title;
        acc[dealTitle] = acc[dealTitle] || { count: 0, amount: 0, paid: 0 };
        acc[dealTitle].count += 1;
        acc[dealTitle].amount += invoice.amount || 0;
        if (invoice.status === "Paid") acc[dealTitle].paid += 1;
        return acc;
      }, {});

    const topDeals = Object.entries(dealInvoices)
      .sort(([, a], [, b]) => b.amount - a.amount)
      .slice(0, 5);

    // Top contacts by billing
    const contactsById = contacts.reduce((acc, c) => {
      acc[c._id] = c;
      return acc;
    }, {});
    const contactBilling = filteredData.filteredInvoices
      .filter((i) => i.deal?.contact)
      .reduce((acc, invoice) => {
        const contact = invoice.deal.contact;
        const cid = contact?._id || contact;
        const name =
          (typeof contact === "object" && contact.name) ||
          contactsById[cid]?.name;
        if (!name) return acc;
        acc[cid] = acc[cid] || { name, invoiced: 0, collected: 0 };
        acc[cid].invoiced += invoice.amount || 0;
        if (invoice.status === "Paid") acc[cid].collected += invoice.amount || 0;
        return acc;
      }, {});
    const topContactsByBilling = Object.values(contactBilling)
      .map((c) => ({ ...c, outstanding: c.invoiced - c.collected }))
      .sort((a, b) => b.invoiced - a.invoiced)
      .slice(0, 8);

    // Largest invoices
    const largestInvoices = [...filteredData.filteredInvoices]
      .sort((a, b) => (b.amount || 0) - (a.amount || 0))
      .slice(0, 5);

    // Chart data for invoice status
    // One colour per status, from the same palette as Payment Distribution -
    // every status but Paid/Sent used to fall through to a single grey, which
    // left five indistinguishable slices in the donut.
    const invoiceStatusColors = {
      Paid: "#34C759",
      Sent: "#0085FF",
      Accepted: "#9747FF",
      "Partially Paid": "#FC9C32",
      Pending: "#FBBF24",
      Rejected: "#E82222",
      Overdue: "#EF4444",
      Draft: "#9CA3AF",
      Void: "#6B7280",
    };
    const invoiceStatusTotal = Object.values(statusDistribution).reduce(
      (sum, d) => sum + d.count,
      0
    );
    const invoiceStatusChartData = Object.entries(statusDistribution)
      .map(([status, data]) => ({
        name: status,
        value: data.count,
        amount: data.amount,
        pct: invoiceStatusTotal > 0 ? Math.round((data.count / invoiceStatusTotal) * 100) : 0,
        color: invoiceStatusColors[status] || "#9CA3AF",
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);

    // Monthly trend (last 6 months)
    const monthlyData = {};
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    filteredData.filteredInvoices.forEach((invoice) => {
      const date = new Date(invoice.date);
      if (date >= sixMonthsAgo) {
        const monthKey = `${date.getFullYear()}-${String(
          date.getMonth() + 1
        ).padStart(2, "0")}`;
        monthlyData[monthKey] = monthlyData[monthKey] || {
          count: 0,
          amount: 0,
          paid: 0,
          overdue: 0,
        };
        monthlyData[monthKey].count += 1;
        monthlyData[monthKey].amount += invoice.amount || 0;
        if (invoice.status === "Paid") {
          monthlyData[monthKey].paid += invoice.amount || 0;
        }
        if (
          invoice.status !== "Paid" &&
          invoice.dueDate &&
          new Date(invoice.dueDate) < new Date()
        ) {
          monthlyData[monthKey].overdue += invoice.amount || 0;
        }
      }
    });

    const monthlyTrend = Object.entries(monthlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6);

    const formatIndianShort = (value) => {
      const abs = Math.abs(value || 0);
      if (abs >= 10000000) return `${(value / 10000000).toFixed(1).replace(/\.0$/, "")}Cr`;
      if (abs >= 100000) return `${(value / 100000).toFixed(1).replace(/\.0$/, "")}L`;
      if (abs >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}K`;
      return `${value}`;
    };

    const billingTrendData = monthlyTrend.map(([monthKey, data]) => {
      const [y, m] = monthKey.split("-");
      const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(
        "en-IN",
        { month: "short", year: "2-digit" }
      );
      return {
        month: label,
        invoiced: data.amount,
        collected: data.paid,
        overdue: data.overdue,
      };
    });

    // KPI row — same 5-card StatCard pattern used on the Companies tab, with
    // real month-over-month deltas against last month's invoices.
    const lastMonthDateInv = new Date(currentYear, currentMonth - 1, 1);
    const lastMonthInv = lastMonthDateInv.getMonth();
    const lastMonthYearInv = lastMonthDateInv.getFullYear();
    const invoicesLastMonth = filteredData.filteredInvoices.filter((i) => {
      const d = new Date(i.date);
      return d.getMonth() === lastMonthInv && d.getFullYear() === lastMonthYearInv;
    });
    const pctChangeInv = (curr, prev) => (prev > 0 ? Math.round(((curr - prev) / prev) * 100) : curr > 0 ? 100 : 0);
    const totalInvoicedChange = pctChangeInv(invoicesThisMonthAmount, invoicesLastMonth.reduce((s, i) => s + (i.amount || 0), 0));
    const collectedThisMonth = invoicesThisMonth.filter((i) => i.status === "Paid").reduce((s, i) => s + (i.amount || 0), 0);
    const collectedLastMonth = invoicesLastMonth.filter((i) => i.status === "Paid").reduce((s, i) => s + (i.amount || 0), 0);
    const collectedChange = pctChangeInv(collectedThisMonth, collectedLastMonth);
    const outstandingThisMonthInv = invoicesThisMonth
      .filter((i) => i.status === "Pending" || i.status === "Sent")
      .reduce((s, i) => s + (i.amount || 0), 0);
    const outstandingLastMonthInv = invoicesLastMonth
      .filter((i) => i.status === "Pending" || i.status === "Sent")
      .reduce((s, i) => s + (i.amount || 0), 0);
    const outstandingChangeInv = pctChangeInv(outstandingThisMonthInv, outstandingLastMonthInv);
    const overdueThisMonth = invoicesThisMonth.filter((i) => overdueInvoices.includes(i)).reduce((s, i) => s + (i.amount || 0), 0);
    const overdueLastMonth = invoicesLastMonth.filter((i) => overdueInvoices.includes(i)).reduce((s, i) => s + (i.amount || 0), 0);
    const overdueChange = pctChangeInv(overdueThisMonth, overdueLastMonth);
    const collectionRateLastMonth =
      invoicesLastMonth.length > 0
        ? (invoicesLastMonth.filter((i) => i.status === "Paid").reduce((s, i) => s + (i.amount || 0), 0) /
            invoicesLastMonth.reduce((s, i) => s + (i.amount || 0), 0)) *
          100
        : 0;
    const collectionRateThisMonth =
      invoicesThisMonth.length > 0 && invoicesThisMonthAmount > 0 ? (collectedThisMonth / invoicesThisMonthAmount) * 100 : 0;
    const collectionRateChange = pctChangeInv(Math.round(collectionRateThisMonth), Math.round(collectionRateLastMonth));

    const upcomingCollections = [...pendingInvoices]
      .filter((i) => i.dueDate)
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
      .slice(0, 5);

    // Invoiced value split by status, in the same {name, value, pct} shape
    // DealsIndustryTreemap takes — this replaced a single fixed-width blue
    // box that only restated the total already shown above it and left most
    // of the card empty.
    const invoicesByStatus = (() => {
      const totals = {};
      filteredData.filteredInvoices.forEach((inv) => {
        const status = inv.status || "Draft";
        totals[status] = (totals[status] || 0) + (inv.amount || 0);
      });
      const entries = Object.entries(totals)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1]);
      const top = entries.slice(0, 4).map(([name, value]) => ({ name, value }));
      const restValue = entries.slice(4).reduce((sum, [, v]) => sum + v, 0);
      const items = restValue > 0 ? [...top, { name: "Others", value: restValue }] : top;
      items.sort((a, b) => b.value - a.value);
      const total = items.reduce((sum, i) => sum + i.value, 0);
      return items.map((i) => ({ ...i, pct: total > 0 ? Math.round((i.value / total) * 100) : 0 }));
    })();

    const recentInvoiceActivity = [...filteredData.filteredInvoices]
      .filter((i) => i.updatedAt || i.createdAt)
      .sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt) -
          new Date(a.updatedAt || a.createdAt)
      )
      .slice(0, 4)
      .map((invoice) => {
        const at = invoice.updatedAt || invoice.createdAt;
        if (invoice.status === "Paid") {
          return {
            id: invoice._id,
            icon: <CheckCircle className="w-4 h-4" />,
            iconBg: "bg-[#EBF9EE] text-[#0AA43E]",
            title: `Invoice #${invoice.invoiceNumber} paid`,
            subtitle: `₹${formatNumberToIndian(invoice.amount || 0)} · ${new Date(at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`,
          };
        }
        if (invoice.status === "Sent") {
          return {
            id: invoice._id,
            icon: <MessageSquare className="w-4 h-4" />,
            iconBg: "bg-[#EFEEFE] text-[#6155F5]",
            title: `Invoice #${invoice.invoiceNumber} sent`,
            subtitle: `₹${formatNumberToIndian(invoice.amount || 0)} · ${new Date(at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`,
          };
        }
        return {
          id: invoice._id,
          icon: <Receipt className="w-4 h-4" />,
          iconBg: "bg-[#EBF9EE] text-[#34C759]",
          title: `Invoice #${invoice.invoiceNumber} ${invoice.status?.toLowerCase() || "created"}`,
          subtitle: `₹${formatNumberToIndian(invoice.amount || 0)} · ${new Date(at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`,
        };
      });

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            title="Total Invoiced"
            value={`₹${formatNumberToIndian(Math.round(totalAmount))}`}
            icon={<PdfIcon className="w-4 h-4" />}
            color="text-blue-600"
            change={totalInvoicedChange}
            changeLabel="vs last month"
          />
          <StatCard
            title="Collected"
            value={`₹${formatNumberToIndian(Math.round(paidAmount))}`}
            icon={<CheckCircle className="w-6 h-6" />}
            color="text-emerald-600"
            change={collectedChange}
            changeLabel="vs last month"
          />
          <StatCard
            title="Outstanding"
            value={`₹${formatNumberToIndian(Math.round(pendingAmount))}`}
            icon={<Clock className="w-6 h-6" />}
            color="text-red-600"
            change={outstandingChangeInv}
            changeLabel="vs last month"
          />
          <StatCard
            title="Overdue"
            value={`₹${formatNumberToIndian(Math.round(overdueAmount))}`}
            icon={<AlertCircle className="w-6 h-6" />}
            color="text-red-600"
            change={overdueChange}
            changeLabel="vs last month"
          />
          <StatCard
            title="Collection Rate"
            value={`${collectionRate.toFixed(1)}%`}
            icon={<Wallet className="w-6 h-6" />}
            color="text-purple-600"
            change={collectionRateChange}
            changeLabel="vs last month"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[4fr_1fr] gap-4 items-stretch">
          <div className="bg-white p-5 rounded-xl border border-[#E7E4E3] shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-[#21201F]/60">
                  Total invoiced this period
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-lg leading-tight font-medium text-[#21201F]">
                    ₹{formatNumberToIndian(Math.round(totalAmount))}
                  </span>
                  <span className="flex items-center justify-center px-1.5 py-0.5 rounded-md bg-[#0085FF] text-white text-[10px] font-medium">
                    {totalInvoices} invoices
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-0.5 text-[#0085FF]">
                {totalInvoicedChange >= 0 ? (
                  <ArrowUp className="w-3.5 h-3.5" />
                ) : (
                  <ArrowDown className="w-3.5 h-3.5" />
                )}
                <span className="text-sm font-medium">
                  {Math.abs(totalInvoicedChange).toFixed(2)}%
                </span>
              </div>
            </div>

            <div className="mt-4">
              {invoicesByStatus.length === 0 ? (
                <div className="flex items-center justify-center text-sm text-gray-400" style={{ height: 327 }}>
                  No invoices yet
                </div>
              ) : (
                <DealsIndustryTreemap items={invoicesByStatus} />
              )}
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <div className="bg-white p-3 rounded-xl border border-[#E7E4E3] shadow-sm h-[242px] flex flex-col gap-2 overflow-hidden">
              <div className="flex items-center justify-between shrink-0">
                <span className="text-sm font-semibold text-[#0E121B]">
                  Upcoming Collections
                </span>
                <ChevronRight className="w-3 h-3 text-gray-500 shrink-0" />
              </div>
              <div className="flex-1 min-h-0 flex flex-col gap-1.5 p-2 bg-[#F8FAFC] rounded-md overflow-hidden">
                <div className="flex bg-white rounded-md shrink-0">
                  <span className="flex-1 text-left text-[11px] text-[#1F2937] px-1.5 py-1">
                    Invoice ID
                  </span>
                  <span className="flex-1 text-right text-[11px] text-[#1F2937] px-1.5 py-1">
                    Amount
                  </span>
                  <span className="flex-1 text-right text-[11px] text-[#1F2937] px-1.5 py-1">
                    Date
                  </span>
                </div>
                {upcomingCollections.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-xs text-gray-400">
                    No upcoming collections
                  </div>
                ) : (
                  <div className="flex-1 min-h-0 flex flex-col justify-between overflow-y-auto">
                    {upcomingCollections.slice(0, 5).map((invoice, idx) => (
                      <div key={invoice._id} className="flex-1 flex flex-col justify-center">
                        {idx > 0 && (
                          <div className="h-px bg-[#1F2937] opacity-10" />
                        )}
                        <div className="flex items-center">
                          <span className="flex-1 text-left text-[11px] font-medium text-[#1F2937] px-1.5 py-1.5 truncate whitespace-nowrap">
                            {invoice.invoiceNumber}
                          </span>
                          <span className="flex-1 text-right text-[11px] font-medium text-black px-1.5 py-1.5 truncate whitespace-nowrap">
                            ₹{formatNumberToIndian(invoice.amount || 0)}
                          </span>
                          <span className="flex-1 text-right text-[11px] font-medium text-[#34C759] px-1.5 py-1.5 truncate whitespace-nowrap">
                            {new Date(invoice.dueDate).toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-[#E1E4EA] shadow-sm h-[242px] flex flex-col gap-3 overflow-hidden">
              <span className="text-sm font-semibold text-[#1C1C1D] shrink-0">
                Recent Activity
              </span>
              <div className="relative flex-1 min-h-0 flex flex-col justify-between overflow-y-auto">
                {recentInvoiceActivity.length === 0 ? (
                  <div className="text-xs text-gray-400">No recent activity</div>
                ) : (
                  <>
                    <div
                      className="absolute left-[13px] top-1 bottom-1 w-px bg-[#E7E7E9]"
                      style={{ zIndex: 0 }}
                    />
                    {recentInvoiceActivity.slice(0, 4).map((item) => (
                      <div
                        key={item.id}
                        className="relative flex items-center gap-3 z-10"
                      >
                        <div
                          className={`flex items-center justify-center w-6 h-6 rounded-full shrink-0 ${item.iconBg}`}
                        >
                          {React.cloneElement(item.icon, { className: "w-3.5 h-3.5" })}
                        </div>
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-xs font-semibold text-[#1C1C1D] truncate">
                            {item.title}
                          </span>
                          <span className="text-[10px] text-[#78788D] truncate">
                            {item.subtitle}
                          </span>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
          {topContactsByBilling.length > 0 && (
            <div className="bg-white p-[18px] rounded-xl border border-[#E1E4EA] shadow-sm flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[#0E121B]">
                  Top Contacts by Billing
                </span>
                <ChevronRight className="w-3 h-3 text-gray-500" />
              </div>
              <div className="flex flex-col gap-1.5 p-2 bg-[#F8FAFC] rounded-md">
                <div className="flex bg-white rounded-md">
                  <span className="flex-[1.4] text-[11px] text-[#1F2937] px-1.5 py-1">
                    Contact
                  </span>
                  <span className="flex-1 text-center text-[11px] text-[#1F2937] px-1.5 py-1">
                    Invoiced
                  </span>
                  <span className="flex-1 text-center text-[11px] text-[#1F2937] px-1.5 py-1">
                    Collected
                  </span>
                  <span className="flex-1 text-center text-[11px] text-[#1F2937] px-1.5 py-1">
                    Outstanding
                  </span>
                </div>
                {topContactsByBilling.map((contact, idx) => (
                  <div key={contact.name + idx}>
                    {idx > 0 && <div className="h-px bg-[#1F2937] opacity-10" />}
                    <div className="flex items-center">
                      <span className="flex-[1.4] text-xs font-medium text-[#1F2937] px-1.5 py-2 truncate">
                        {contact.name}
                      </span>
                      <span className="flex-1 text-center text-xs font-medium text-black px-1.5 py-2">
                        ₹{formatNumberToIndian(contact.invoiced)}
                      </span>
                      <span className="flex-1 text-center text-xs font-medium text-black px-1.5 py-2">
                        ₹{formatNumberToIndian(contact.collected)}
                      </span>
                      <span className="flex-1 text-center text-xs font-medium text-black px-1.5 py-2">
                        ₹{formatNumberToIndian(contact.outstanding)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div
            className={`bg-white p-[18px] rounded-xl border border-[#E1E4EA] shadow-sm flex flex-col gap-2 ${
              topContactsByBilling.length === 0 ? "lg:col-span-2" : ""
            }`}
          >
            <span className="text-sm font-medium text-[#1F2937]/70">
              Billing &amp; Collection Trend
            </span>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="w-5 h-1 rounded-full bg-[#0085FF]" />
                <span className="text-xs text-[#1F2937]/56">Invoiced</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-1 rounded-full bg-[#00C950]" />
                <span className="text-xs text-[#1F2937]/56">Collected</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-1 rounded-full bg-[#F60000]" />
                <span className="text-xs text-[#1F2937]/56">Overdue</span>
              </div>
            </div>
            <div style={{ width: "100%", height: 280, marginTop: 16 }}>
              {billingTrendData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-gray-400">
                  Not enough data yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={billingTrendData}
                    margin={{ top: 10, right: 8, left: -8, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(31,41,55,0.1)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 10, fill: "#1F2937" }}
                      axisLine={{ stroke: "rgba(31,41,55,0.3)" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#1F2937" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `₹${formatIndianShort(v)}`}
                      width={44}
                    />
                    <Tooltip
                      formatter={(value) => `₹${formatNumberToIndian(value)}`}
                    />
                    <Line
                      type="monotone"
                      dataKey="invoiced"
                      name="Invoiced"
                      stroke="#0085FF"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="collected"
                      name="Collected"
                      stroke="#00C950"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="overdue"
                      name="Overdue"
                      stroke="#F60000"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
          {/* Invoice Status Breakdown */}
          <div className="bg-white p-5 rounded-xl border border-[#E7E4E3] shadow-sm">
            <h3 className="text-sm font-semibold text-[#0E121B]">Invoice Status Breakdown</h3>
            <p className="text-xs text-[#525866] mt-1">
              Avg. ₹{formatNumberToIndian(Math.round(averageInvoiceAmount))} · {invoicesThisMonthCount} this month
            </p>
            {invoiceStatusChartData.length === 0 ? (
              <p className="text-sm text-gray-400 py-16 text-center">No invoices yet</p>
            ) : (
              // Same shape as the Payment Distribution card: donut on the left,
              // legend with percentages on the right.
              <div className="flex items-center justify-between gap-4 mt-4 flex-wrap">
                <div className="relative flex-shrink-0" style={{ width: 220, height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={invoiceStatusChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={68}
                        outerRadius={108}
                        cornerRadius={3}
                        paddingAngle={invoiceStatusChartData.length > 1 ? 2 : 0}
                        dataKey="value"
                        nameKey="name"
                        stroke="none"
                      >
                        {invoiceStatusChartData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, name, { payload }) => [
                          `${value} invoice${value !== 1 ? "s" : ""} · ₹${formatNumberToIndian(payload.amount)}`,
                          payload.name,
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  {invoiceStatusChartData.map((entry) => (
                    <div key={entry.name} className="flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                        style={{ background: entry.color }}
                      />
                      <span className="text-xs text-[#21201F]/70 truncate min-w-[90px]">{entry.name}</span>
                      <span className="text-[11px] text-[#525866] text-right flex-shrink-0 w-8">
                        {entry.pct}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          {/* Top Deals by Invoice Amount */}
          <div className="bg-white p-5 rounded-xl border border-[#E7E4E3] shadow-sm flex flex-col">
            <h3 className="text-sm font-semibold text-[#0E121B]">Top Deals by Invoice Amount</h3>
            {topDeals.length === 0 ? (
              <p className="text-sm text-gray-400 py-10 text-center">No deal-linked invoices yet</p>
            ) : (
              // flex-1 on the list and on each row: the rows share whatever
              // height the donut card sets for this grid row instead of
              // bunching at the top, and because they end up equal height the
              // divide-y rules land centred in the gaps. Nothing adds height.
              <div className="mt-4 flex flex-col flex-1 divide-y divide-[#F1F1F5]">
                {topDeals.map(([dealTitle, data], idx) => (
                  <div key={dealTitle} className="flex flex-1 items-center gap-2.5">
                    <span className="text-[11px] font-medium text-[#99A0AE] w-4 flex-shrink-0">{idx + 1}</span>
                    <span className="text-xs text-[#0E121B] truncate flex-1 min-w-0">{dealTitle}</span>
                    <span className="text-[11px] text-[#525866] flex-shrink-0 w-16 text-right">{data.paid}/{data.count} paid</span>
                    <span className="text-xs font-medium text-[#0E121B] flex-shrink-0 w-24 text-right">
                      ₹{formatNumberToIndian(Math.round(data.amount))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Largest Invoices */}
          <div className="bg-white p-5 rounded-xl border border-[#E7E4E3] shadow-sm flex flex-col">
            <h3 className="text-sm font-semibold text-[#0E121B]">Largest Invoices</h3>
            {largestInvoices.length === 0 ? (
              <p className="text-sm text-gray-400 py-10 text-center">No invoices yet</p>
            ) : (
              <div className="mt-4 flex flex-col flex-1 divide-y divide-[#F1F1F5]">
                {largestInvoices.map((inv, idx) => (
                  <div key={inv._id} className="flex flex-1 items-center gap-2.5">
                    <span className="text-[11px] font-medium text-[#99A0AE] w-4 flex-shrink-0">{idx + 1}</span>
                    <span className="text-xs text-[#0E121B] truncate flex-1 min-w-0">
                      {inv.deal?.title || inv.deal?.company?.name || "Untitled"}
                    </span>
                    <span className="flex-shrink-0 w-16 flex justify-center">
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded-full truncate"
                        style={
                          inv.status === "Paid"
                            ? { background: "rgba(0,201,80,0.1)", color: "#00A63E" }
                            : { background: "rgba(0,133,255,0.1)", color: "#0085FF" }
                        }
                      >
                        {inv.status}
                      </span>
                    </span>
                    <span className="text-xs font-medium text-[#0E121B] flex-shrink-0 w-24 text-right">
                      ₹{formatNumberToIndian(inv.amount || 0)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <PageSkeleton variant="insights" />
    );
  }

  const clearAllFilters = () => {
    setDateRange({ startDate: "", endDate: "" });
    setFilters({
      contactStatus: "all",
      companySize: "all",
      dealStage: "all",
      vendorStatus: "all",
      purchaseStatus: "all",
      poStatus: "all",
    });
  };

  const activeFilterCount =
    (dateRange.startDate ? 1 : 0) +
    (dateRange.endDate ? 1 : 0) +
    (filters.contactStatus !== "all" ? 1 : 0) +
    (filters.poStatus !== "all" ? 1 : 0) +
    (filters.purchaseStatus !== "all" ? 1 : 0);

  return (
    <div
      style={{
        marginTop: -24,
        marginLeft: -32,
        marginRight: -32,
        paddingLeft: 24,
        paddingRight: 24,
        boxSizing: "border-box",
      }}
    >
      {/* Fixed strip — same pinned-below-header treatment as Companies.jsx's
          toolbar. Title text lives in the top navbar (Header.jsx) instead;
          this strip is just the spacer bar. */}
      <div
        className="fixed right-0 h-16 px-4 sm:px-6 lg:px-8 border-b border-[#E1E4EA] bg-white flex items-center justify-between top-[calc(54px+var(--dc-offline-offset,0px))] lg:top-[calc(64px+var(--dc-offline-offset,0px))]"
        style={{
          left: "var(--sidebar-width, 0px)",
          zIndex: 40,
          minHeight: "64px",
          maxHeight: "64px",
          boxSizing: "border-box",
        }}
      >
        <div
          ref={tabStripRef}
          className="inline-flex items-center gap-1 h-11 p-1 bg-[#F1F1F5] rounded-full overflow-x-auto max-w-full min-w-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              data-tab-id={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center justify-center h-9 px-2.5 xl:px-4 flex-shrink-0 rounded-full text-[13px] xl:text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? "bg-white text-[#0085FF] shadow-sm"
                  : "text-gray-700 hover:text-gray-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative flex-shrink-0 flex items-center gap-1.5">
          <button
            onClick={() => setShowFiltersPanel((prev) => !prev)}
            className="relative flex items-center justify-center w-10 h-10 rounded-full border border-[#E1E4EA] text-gray-500 hover:bg-gray-50 transition-colors"
            title="Filters"
          >
            <FilterIcon size={16} />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-[#0085FF] text-white text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* One-click clear — skips opening the panel entirely when all you
              want is to empty out whatever filters are active. */}
          {activeFilterCount > 0 && (
            <button
              onClick={clearAllFilters}
              className="flex items-center justify-center w-10 h-10 rounded-full border border-[#E1E4EA] text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
              title="Clear all filters"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {showFiltersPanel && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowFiltersPanel(false)}
              />
              <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(90vw,720px)] bg-white p-6 rounded-xl border border-gray-200 shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <FilterIcon size={16} />
          <h3 className="text-base font-bold text-gray-900">Filters</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <CalendarIcon className="w-4 h-4 inline mr-1" />
              From Date
            </label>
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) =>
                setDateRange((prev) => ({ ...prev, startDate: e.target.value }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <CalendarIcon className="w-4 h-4 inline mr-1" />
              To Date
            </label>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) =>
                setDateRange((prev) => ({ ...prev, endDate: e.target.value }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Contact Status
            </label>
            <select
              value={filters.contactStatus}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  contactStatus: e.target.value,
                }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="all">All Status</option>
              <option value="New">New</option>
              <option value="Contacted">Contacted</option>
              <option value="Qualified">Qualified</option>
              <option value="Won">Won</option>
              <option value="Lost">Lost</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              PO Status
            </label>
            <select
              value={filters.poStatus}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, poStatus: e.target.value }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="all">All Status</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
              <option value="Delivered">Delivered</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Purchase Status
            </label>
            <select
              value={filters.purchaseStatus}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  purchaseStatus: e.target.value,
                }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="all">All Status</option>
              <option value="Draft">Draft</option>
              <option value="Pending">Pending</option>
              <option value="Paid">Paid</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={clearAllFilters}
              className="w-full px-4 py-2 flex items-center justify-center gap-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Clear Filters
            </button>
          </div>
        </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="pt-[80px] lg:pt-[90px]">
      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === "overview" && renderOverview()}
        {activeTab === "contacts" && renderContactsReport()}
        {activeTab === "companies" && renderCompaniesReport()}
        {activeTab === "deals" && renderDealsReport()}
        {activeTab === "vendors" && renderVendorsReport()}
        {activeTab === "purchase-orders" && renderPurchaseOrdersReport()}
        {activeTab === "purchases" && renderPurchasesReport()}
        {activeTab === "invoices" && renderInvoicesReport()}
      </div>
      </div>
    </div>
  );
};

export default Insights;
import PageSkeleton from "../components/common/PageSkeleton";
import TeamIcon from "../components/common/TeamIcon";
