import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import API from "../../services/api";
import { formatNumberToIndian } from "../../utils/numberFormatter";
import toast from "react-hot-toast";
import {
  User,
  Building2,
  ExternalLink,
  Clock,
  Check,
  ChevronDown,
  LayoutGrid,
  EyeOff,
  FolderOpen,
  Receipt,
  CheckSquare,
  CalendarDays,
  AlertTriangle,
  Lightbulb,
  ArrowRight,
  TrendingUp,
  MessageSquare,
  FileText,
  PhoneCall,
  Plus,
  Activity,
  Calendar,
  AlertCircle
} from "lucide-react";
import AppToaster from "../AppToaster";
import EyeIcon from "../common/EyeIcon";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  PieChart,
  Pie,
  LineChart,
  Line,
  CartesianGrid
} from "recharts";

// ─── helpers ─────────────────────────────────────────────────────────────────

const fmt = (n) => `₹${formatNumberToIndian(n || 0)}`;

const STATUS_COLOR = {
  open: "#0085FF",
  won:  "#00C950",
  lost: "#EF4444",
};
const statusColor = (s) => STATUS_COLOR[(s || "open").toLowerCase()] || "#0085FF";

const daysBetween = (a, b = new Date()) =>
  Math.max(0, Math.round(Math.abs((new Date(b) - new Date(a)) / 86400000)));

const fmtDate = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};
const fmtDateTime = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
};

// ─── small atoms ─────────────────────────────────────────────────────────────

/** Activity icon */
const AIcon = ({ type }) => {
  const m = {
    invoice: <Receipt      className="w-3.5 h-3.5 text-blue-500"   />,
    task:    <CheckSquare  className="w-3.5 h-3.5 text-violet-500" />,
    meeting: <CalendarDays className="w-3.5 h-3.5 text-green-500"  />,
    call:    <PhoneCall    className="w-3.5 h-3.5 text-orange-500" />,
    note:    <MessageSquare className="w-3.5 h-3.5 text-yellow-500"/>,
  };
  return m[(type || "").toLowerCase()] || <FileText className="w-3.5 h-3.5 text-gray-400" />;
};

/** Thin horizontal progress bar */
const Bar2 = ({ value, total, color, bgClass = "bg-gray-100" }) => {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div className={`w-full h-2 ${bgClass} rounded-full overflow-hidden flex`}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
};

// Custom Donut label: shows pct in centre
const DonutLabel = ({ cx, cy, value, total, label = "collected" }) => (
  <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
    <tspan x={cx} dy="-6" fontSize={16} fontWeight={700} fill="#111827">{total > 0 ? `${Math.round((value / total) * 100)}%` : "0%"}</tspan>
    <tspan x={cx} dy={18} fontSize={10} fill="#9CA3AF">{label}</tspan>
  </text>
);

// ─── main component ──────────────────────────────────────────────────────────

const BasicDetails = ({ deal, dealFieldList = [], onDealUpdate }) => {

  // ── state ───────────────────────────────────────────────────────────────
  const [isOwnerDropdownOpen, setIsOwnerDropdownOpen] = useState(false);
  const [searchOwnerQuery,    setSearchOwnerQuery]    = useState("");
  const [availableUsers,      setAvailableUsers]      = useState([]);

  const [activities,        setActivities]        = useState([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [activityFilter,    setActivityFilter]    = useState("All");
  const ACTIVITY_FILTERS = ["All", "Invoices", "Tasks", "Meetings", "Notes"];

  const [invoices, setInvoices] = useState([]);
  const [tasks,    setTasks]    = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [notes,    setNotes]    = useState([]);

  const [showEmptyFields, setShowEmptyFields] = useState(false);

  // ── permissions ─────────────────────────────────────────────────────────
  const currentUser = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("user")) || null; } catch { return null; }
  }, []);

  const canEdit = useMemo(() => {
    if (currentUser?.role === "admin") return true;
    return currentUser?.permissions?.some(p => p.name.toLowerCase() === "deals" && p.permission === "read-write");
  }, [currentUser]);

  // ── fetches ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!canEdit) return;
    API.get("/auth/all-user").then(r => setAvailableUsers(r.data.allUsers || [])).catch(() => {});
  }, [canEdit]);

  useEffect(() => {
    if (!deal?._id) return;
    setActivitiesLoading(true);
    Promise.all([
      API.get("/invoices",       { params: { deal:   deal._id } }).catch(() => ({ data: [] })),
      API.get(`/tasks/deal/${deal._id}`)                          .catch(() => ({ data: [] })),
      API.get("/meetings",       { params: { dealId: deal._id } }).catch(() => ({ data: {} })),
      API.get("/notes",          { params: { dealId: deal._id } }).catch(() => ({ data: [] })),
    ]).then(([invR, taskR, meetR, noteR]) => {
      const invList  = Array.isArray(invR.data)  ? invR.data  : [];
      const taskList = Array.isArray(taskR.data) ? taskR.data : [];
      const meetRaw  = meetR.data?.meetings ?? meetR.data;
      const meetList = Array.isArray(meetRaw)    ? meetRaw    : [];
      const noteList = Array.isArray(noteR.data) ? noteR.data : [];
      setInvoices(invList); setTasks(taskList); setMeetings(meetList); setNotes(noteList);
      const merged = [
        ...invList.map(i  => ({ type: "invoice", label: `Invoice ${i.invoiceNumber || "#"} created`, amount: i.amount, date: i.createdAt, status: i.status })),
        ...taskList.map(t  => ({ type: "task",    label: `Task: ${t.title || t.name || "Untitled"}`,                    date: t.createdAt })),
        ...meetList.map(m  => ({ type: "meeting",  label: `Meeting: ${m.title || m.subject || "Untitled"}`,             date: m.scheduledAt || m.createdAt })),
        ...noteList.map(n  => ({ type: "note",     label: `Note: ${(n.content || n.body || "").slice(0, 60)}`,          date: n.createdAt })),
      ].sort((a, b) => new Date(b.date) - new Date(a.date));
      setActivities(merged);
    }).finally(() => setActivitiesLoading(false));
  }, [deal?._id]);

  // ── owner change ─────────────────────────────────────────────────────────
  const handleOwnerChange = async (id) => {
    if (!canEdit) return;
    if (deal.user?._id === id) { setIsOwnerDropdownOpen(false); return; }
    try {
      const res = await API.put(`/deals/${deal._id}`, { user: id });
      toast.success("Owner reassigned.");
      setIsOwnerDropdownOpen(false);
      onDealUpdate?.(res.data);
    } catch (err) {
      toast.error(err.response?.status === 402
        ? err.response.data.message || "Subscription required."
        : err.response?.data?.error || "Failed to update owner.");
    }
  };

  // ── custom fields ────────────────────────────────────────────────────────
  const isEmpty = v => v === null || v === undefined || v === "" || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length);

  const getMergedFields = () => {
    if (!dealFieldList?.length) return (deal.additionalFields || []).map(f => ({ ...f, category: "Uncategorized" }));
    const vm = new Map((deal.additionalFields || []).map(f => [f.key, f.value]));
    return dealFieldList.map(tf => ({ key: tf.name, value: vm.has(tf.name) ? vm.get(tf.name) : null, type: tf.type, options: tf.options, required: tf.required, category: tf.category || "Uncategorized" }));
  };

  const renderFieldValue = (field) => {
    if (isEmpty(field.value)) return <span className="text-gray-400 italic text-sm">—</span>;
    const t = (field.type || "").toLowerCase();
    if (t.includes("url")) { const url = field.value.startsWith("http") ? field.value : `https://${field.value}`; return <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline text-sm font-medium break-words">{field.value}</a>; }
    if (t.includes("date")) { try { return <span className="text-sm font-medium text-gray-800">{new Date(field.value).toLocaleDateString()}</span>; } catch { return <span className="text-sm font-medium text-gray-800">{field.value}</span>; } }
    if (t.includes("multi-select") || t.includes("checkbox") || t === "multiselect") {
      if (Array.isArray(field.value)) return <div className="flex flex-wrap gap-1">{field.value.map((it, i) => <span key={i} className="px-2 py-0.5 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">{it}</span>)}</div>;
    }
    if (t.includes("number")) return <span className="text-sm font-medium text-gray-800">{Number(field.value).toLocaleString()}</span>;
    return <span className="text-sm font-medium text-gray-800 break-words">{field.value}</span>;
  };

  // ── derived ──────────────────────────────────────────────────────────────
  const dealValue       = deal?.amount || 0;
  const totalInvoiced   = invoices.reduce((s, i) => s + (i.amount || 0), 0);
  const totalPaid       = invoices.filter(i => (i.status || "").toLowerCase() === "paid").reduce((s, i) => s + (i.amount || 0), 0);
  const totalOutstanding = Math.max(0, totalInvoiced - totalPaid);
  
  const paidCount = invoices.filter(i => (i.status || "").toLowerCase() === "paid").length;
  const unpaidCount = invoices.length - paidCount;

  // Pipeline stages
  const stageSteps    = ["Open", "Won", "Lost"];
  const currentStatus = deal?.status || "Open";
  const isTerminal    = currentStatus === "Won" || currentStatus === "Lost";
  const daysInStage   = daysBetween(deal?.updatedAt);

  // Activity filter
  const typeMap = { Invoices: "invoice", Tasks: "task", Meetings: "meeting", Notes: "note" };
  const filteredActivities = useMemo(() => activityFilter === "All" ? activities : activities.filter(a => a.type === typeMap[activityFilter]), [activities, activityFilter]);

  // Next Best Action logic (factual)
  const upcomingTasks    = tasks.filter(t => t.status !== "Completed").sort((a, b) => new Date(a.dueDate || a.createdAt) - new Date(b.dueDate || b.createdAt));
  const upcomingMeetings = meetings.filter(m => m.scheduledAt && new Date(m.scheduledAt) >= new Date()).sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  const nextActivityDate = upcomingMeetings[0]?.scheduledAt || upcomingTasks[0]?.dueDate || null;



  // Payment donut chart data
  const donutData = useMemo(() => {
    if (totalInvoiced === 0) return [];
    return [
      { name: "Collected",    value: totalPaid,         fill: "#00C950" },
      { name: "Outstanding",  value: totalOutstanding,  fill: "#F59E0B" },
    ].filter(d => d.value > 0);
  }, [totalPaid, totalOutstanding, totalInvoiced]);

  // Invoice Breakdown Donut
  const invoiceDonutData = useMemo(() => {
    if (invoices.length === 0) return [];
    return [
      { name: "Paid",   value: paidCount,   fill: "#00C950" },
      { name: "Unpaid", value: unpaidCount, fill: "#EF4444" },
    ].filter(d => d.value > 0);
  }, [paidCount, unpaidCount, invoices.length]);

  // Actual Revenue / Collection Line Graph based on historic invoice dates
  const revenueChartData = useMemo(() => {
    if (invoices.length === 0) return [];
    
    // Group invoices by date (using createdAt) and sum amount + paid amount
    const grouped = invoices.reduce((acc, inv) => {
      if (!inv.createdAt) return acc;
      // Truncate to just YYYY-MM-DD for grouping
      const dateKey = inv.createdAt.split('T')[0];
      if (!acc[dateKey]) acc[dateKey] = { date: dateKey, dateObj: new Date(dateKey), dailyInvoiced: 0, dailyPaid: 0 };
      
      acc[dateKey].dailyInvoiced += (inv.amount || 0);
      if ((inv.status || "").toLowerCase() === "paid") {
         acc[dateKey].dailyPaid += (inv.amount || 0);
      }
      return acc;
    }, {});

    const sortedDates = Object.values(grouped).sort((a, b) => a.dateObj - b.dateObj);
    
    // Accumulate running totals
    let runInv = 0;
    let runPaid = 0;
    const finalData = sortedDates.map(item => {
      runInv += item.dailyInvoiced;
      runPaid += item.dailyPaid;
      return {
        name: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        "Total Invoiced": runInv,
        "Total Collected": runPaid
      };
    });

    return finalData;
  }, [invoices]);

  // Custom fields
  const allMerged     = getMergedFields();
  const visibleFields = showEmptyFields ? allMerged : allMerged.filter(f => !isEmpty(f.value));
  const totalFC       = allMerged.length;
  const groupedFields = Object.entries(
    visibleFields.reduce((acc, f) => { const c = f.category || "Uncategorized"; if (!acc[c]) acc[c] = []; acc[c].push(f); return acc; }, {})
  ).sort(([a], [b]) => a === "Uncategorized" ? 1 : b === "Uncategorized" ? -1 : a.localeCompare(b));

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 pb-8 relative z-0">
      <AppToaster />

      {/* ═══════════════════════════════════════════════════════════════════
          1.  OWNER + AUDIT BAR
      ════════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-4 rounded-xl border border-gray-200 relative z-50">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-500">Owner:</span>
          <div className="relative">
            <button
              onClick={() => canEdit && setIsOwnerDropdownOpen(v => !v)}
              disabled={!canEdit}
              className={`flex items-center gap-1.5 px-2 py-1 -ml-2 rounded text-sm font-semibold transition-colors ${canEdit ? "text-gray-900 hover:bg-gray-50 cursor-pointer" : "text-gray-900 cursor-default"}`}
            >
              <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px]">{deal.user?.name?.[0]?.toUpperCase() || "U"}</div>
              {deal.user?.name || "Unassigned"}
              {canEdit && <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>
            {isOwnerDropdownOpen && canEdit && (
              <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-md shadow-xl z-50">
                <div className="p-3 border-b border-gray-100 flex justify-between items-center">
                  <h4 className="text-xs font-semibold text-gray-700">Assign Owner</h4>
                  <button onClick={() => setIsOwnerDropdownOpen(false)} className="text-xs text-gray-500 border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">Close</button>
                </div>
                <div className="p-2">
                  <input type="text" placeholder="Search..." className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:border-blue-500 mb-2" value={searchOwnerQuery} onChange={e => setSearchOwnerQuery(e.target.value)} />
                  <div className="max-h-48 overflow-y-auto">
                    <button onClick={() => handleOwnerChange(null)} className="w-full text-left flex items-center gap-3 p-2 hover:bg-gray-50 rounded text-sm">
                      <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center font-medium">N</div>
                      <span className="text-gray-700">None</span>
                      {!deal.user && <Check className="w-4 h-4 text-green-600 ml-auto" />}
                    </button>
                    {availableUsers.filter(u => u.name?.toLowerCase().includes(searchOwnerQuery.toLowerCase())).map(u => (
                      <button key={u._id} onClick={() => handleOwnerChange(u._id)} className="w-full text-left flex items-center gap-3 p-2 hover:bg-gray-50 rounded text-sm">
                        <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-medium text-xs">{u.name?.[0]?.toUpperCase()}</div>
                        <div className="flex flex-col"><span className="text-gray-900 font-medium">{u.name}</span><span className="text-gray-500 text-xs">{u.email}</span></div>
                        {deal.user?._id === u._id && <Check className="w-4 h-4 text-green-600 ml-auto" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col text-xs text-right mt-4 md:mt-0 relative group/audit cursor-default">
          <div className="flex items-center justify-end gap-1.5 text-gray-500">
            <Clock className="w-3.5 h-3.5" />
            <span>Updated: {fmtDateTime(deal.updatedAt)}</span>
          </div>
          <div className="text-gray-400">by: <span className="font-medium text-gray-600">{deal.lastUpdatedBy?.name || "Unknown"}</span></div>
          <div className="absolute top-full right-0 mt-2 bg-white border border-gray-200 p-4 rounded-md shadow-xl opacity-0 group-hover/audit:opacity-100 transition-opacity pointer-events-none z-40 min-w-[250px] text-left">
            <div className="mb-3">
              <div className="flex justify-between text-gray-600 mb-1"><span>Updated on:</span><span className="font-medium">{fmtDateTime(deal.updatedAt)}</span></div>
              <div className="flex justify-between text-gray-600"><span>Updated by:</span><span className="font-medium text-gray-900">{deal.lastUpdatedBy?.name || "Unknown"}</span></div>
            </div>
            <div className="border-t border-gray-200 my-3" />
            <div>
              <div className="flex justify-between text-gray-600 mb-1"><span>Added on:</span><span className="font-medium">{fmtDateTime(deal.createdAt)}</span></div>
              <div className="flex justify-between text-gray-600"><span>Added by:</span><span className="font-medium text-gray-900">{deal.createdBy?.name || "Unknown"}</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          2. PIPELINE & DEAL SNAPSHOT
      ════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 relative z-40">
        
        {/* PIPELINE */}
        <div className="bg-white rounded-xl border border-gray-200 px-6 pt-5 pb-4">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4 block">Pipeline</span>
          
          <div className="relative mb-2">
            <div className="absolute top-1/2 left-0 w-full h-[2px] bg-gray-100 -translate-y-1/2 z-0" />
            <div className="flex justify-between relative z-10">
              {stageSteps.map((step, idx) => {
                const isActive = currentStatus === step;
                const isPast = stageSteps.indexOf(currentStatus) > idx;
                
                return (
                  <div key={step} className="flex flex-col items-center">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 
                      ${isActive ? "bg-blue-600 border-blue-600 text-white shadow-md ring-4 ring-blue-50" : 
                        isPast ? "bg-green-500 border-green-500 text-white" : 
                        "bg-white border-gray-200 text-gray-300"}`}>
                      {isPast ? <Check className="w-3.5 h-3.5" /> : idx + 1}
                    </div>
                    <span className={`text-[11px] font-semibold mt-2 ${isActive ? "text-blue-600" : isPast ? "text-green-600" : "text-gray-400"}`}>
                      {step}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          
          <div className="flex justify-between items-center text-[11px] mt-4 text-gray-500 pt-3 border-t border-gray-50">
            <div className="flex flex-col">
              <span className="text-gray-400">Current stage</span>
              <strong className="text-gray-900 text-sm mt-0.5">{currentStatus}</strong>
              <span className="text-[10px] mt-0.5">Since {fmtDate(deal.updatedAt)}</span>
            </div>
            <div className="flex flex-col items-end text-right">
              <span className="text-gray-400">Deal value</span>
              <strong className="text-gray-900 text-sm mt-0.5">{fmt(dealValue)}</strong>
            </div>
          </div>
        </div>

        {/* DEAL SNAPSHOT */}
        <div className="bg-white rounded-xl border border-gray-200 flex flex-col">
          <div className="px-5 py-4 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest block">Deal Snapshot</span>
          </div>
          <div className="grid grid-cols-3 divide-x divide-gray-100 flex-1">
            <div className="p-4 flex flex-col justify-center">
              <div className="flex items-center gap-1.5 mb-1.5"><TrendingUp className="w-3.5 h-3.5 text-gray-400" /><span className="text-[10px] font-bold text-gray-500 uppercase">Deal Value</span></div>
              <span className="text-base font-bold text-gray-900">{fmt(dealValue)}</span>
            </div>
            <div className="p-4 flex flex-col justify-center bg-blue-50/30">
              <div className="flex items-center gap-1.5 mb-1.5"><Receipt className="w-3.5 h-3.5 text-blue-400" /><span className="text-[10px] font-bold text-blue-600 uppercase">Invoiced</span></div>
              <span className="text-base font-bold text-gray-900 mb-1">{fmt(totalInvoiced)}</span>
              <span className="text-[10px] font-medium text-gray-500">{invoices.length} invoices</span>
            </div>
            <div className="p-4 flex flex-col justify-center bg-green-50/30">
              <div className="flex items-center gap-1.5 mb-1.5"><CheckSquare className="w-3.5 h-3.5 text-green-500" /><span className="text-[10px] font-bold text-green-600 uppercase">Collected</span></div>
              <span className="text-base font-bold text-gray-900 mb-1">{fmt(totalPaid)}</span>
              <span className="text-[10px] font-medium text-gray-500">{totalInvoiced > 0 ? Math.round((totalPaid/totalInvoiced)*100) : 0}% collected</span>
            </div>
          </div>
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50 rounded-b-xl flex justify-between text-[11px] font-medium text-gray-600">
            <span><strong>{invoices.length}</strong> Invoices</span>
            <span className="text-amber-600"><strong>{unpaidCount}</strong> Unpaid</span>
            <span className="text-green-600"><strong>{paidCount}</strong> Paid</span>
          </div>
        </div>
        
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          3. REVENUE TREND (LINE GRAPH OR PROGRESSION) & ACTIVITY TIMELINE
      ════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 relative z-30">
        
        {/* REVENUE / COLLECTION SECTION */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-gray-200 p-5 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Revenue & Collection Trend</h3>
            {revenueChartData.length > 2 && (
              <div className="flex gap-4">
                 <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-blue-500 rounded" /> <span className="text-[10px] font-medium text-gray-500">Invoiced</span></div>
                 <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-green-500 rounded" /> <span className="text-[10px] font-medium text-gray-500">Collected</span></div>
              </div>
            )}
          </div>

          <div className="flex-1 flex flex-col justify-center min-h-[192px]">
            {revenueChartData.length === 0 ? (
               <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 border border-dashed border-gray-100 rounded-lg py-10">
                 <TrendingUp className="w-6 h-6 mb-2 opacity-30" />
                 <span className="text-xs">No invoice history to plot</span>
               </div>
            ) : revenueChartData.length <= 2 ? (
               <div className="space-y-5 px-2">
                 <div>
                   <div className="flex justify-between text-xs mb-1.5 font-bold"><span className="text-gray-500">Invoiced</span><span className="text-gray-900">{fmt(totalInvoiced)}</span></div>
                   <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden"><div className="bg-blue-500 h-full rounded-full transition-all" style={{width: '100%'}}/></div>
                 </div>
                 <div>
                   <div className="flex justify-between text-xs mb-1.5 font-bold"><span className="text-gray-500">Collected</span><span className="text-green-600">{fmt(totalPaid)}</span></div>
                   <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden"><div className="bg-green-500 h-full rounded-full transition-all" style={{width: `${totalInvoiced > 0 ? (totalPaid/totalInvoiced)*100 : 0}%`}}/></div>
                 </div>
                 <div>
                   <div className="flex justify-between text-xs mb-1.5 font-bold"><span className="text-gray-500">Outstanding</span><span className="text-amber-600">{fmt(totalOutstanding)}</span></div>
                   <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden"><div className="bg-amber-500 h-full rounded-full transition-all" style={{width: `${totalInvoiced > 0 ? (totalOutstanding/totalInvoiced)*100 : 0}%`}}/></div>
                 </div>
               </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(val) => `₹${val/1000}k`} tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                  <Tooltip 
                    formatter={(val) => [fmt(val), ""]} 
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E5E7EB", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} 
                  />
                  <Line type="monotone" dataKey="Total Invoiced" stroke="#0085FF" strokeWidth={2} dot={{ r: 3, fill: "#0085FF" }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="Total Collected" stroke="#00C950" strokeWidth={2} dot={{ r: 3, fill: "#00C950" }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* ACTIVITY TIMELINE */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5 flex flex-col min-h-[300px]">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Activity Timeline</h3>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {ACTIVITY_FILTERS.map(f => (
              <button key={f} onClick={() => setActivityFilter(f)}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-colors border ${activityFilter === f ? "bg-blue-600 text-white border-blue-600" : "bg-gray-50 text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-600"}`}>
                {f}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-gray-50 pr-2 max-h-64">
            {activitiesLoading ? (
              <div className="space-y-3 pt-2">{[1,2,3].map(i => <div key={i} className="flex items-start gap-2.5 animate-pulse"><div className="w-7 h-7 rounded-full bg-gray-200 flex-shrink-0" /><div className="flex-1 space-y-1.5 pt-0.5"><div className="h-3 bg-gray-200 rounded w-3/4" /><div className="h-2.5 bg-gray-100 rounded w-1/2" /></div></div>)}</div>
            ) : filteredActivities.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400"><Activity className="w-8 h-8 mb-2 opacity-30" /><p className="text-xs">No {activityFilter === "All" ? "" : activityFilter.toLowerCase()} activity yet</p></div>
            ) : filteredActivities.map((act, i) => (
              <div key={i} className="flex items-start gap-3 py-3">
                <div className="w-8 h-8 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center flex-shrink-0 shadow-sm"><AIcon type={act.type} /></div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-medium text-gray-800 leading-snug">{act.label}</p>
                    {act.amount != null && <span className="text-xs font-bold text-gray-700 whitespace-nowrap tabular-nums">{fmt(act.amount)}</span>}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">{fmtDate(act.date)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          4. INVOICE BREAKDOWN | PAYMENT COLLECTION | DEAL ACTIVITY
      ════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 relative z-20">
        
        {/* INVOICE BREAKDOWN DONUT */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Invoice Status</h3>
          <div className="flex items-center flex-1">
            <div className="w-24 h-24 relative flex-shrink-0">
              {invoices.length === 0 ? (
                 <div className="absolute inset-0 flex items-center justify-center text-gray-300 border-2 border-dashed border-gray-100 rounded-full">
                   <Receipt className="w-6 h-6 opacity-50" />
                 </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={invoiceDonutData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={28} outerRadius={44} paddingAngle={2} labelLine={false}>
                      {invoiceDonutData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                    </Pie>
                    <DonutLabel cx={48} cy={48} value={paidCount} total={invoices.length} label="paid" />
                    <Tooltip formatter={v => [v, "Invoices"]} contentStyle={{ fontSize: 11, borderRadius: 8, border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="flex-1 ml-4 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-[#00C950]" /> Paid</span>
                <span className="font-bold">{paidCount}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-[#EF4444]" /> Unpaid</span>
                <span className="font-bold">{unpaidCount}</span>
              </div>
              <div className="border-t border-gray-100 pt-2 mt-2 text-[10px] text-gray-500">
                Total Invoices: <strong className="text-gray-900">{invoices.length}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* PAYMENT COLLECTION */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Payment Collection</h3>
          <div className="flex items-center flex-1">
             <div className="w-24 h-24 relative flex-shrink-0">
               {totalInvoiced === 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center text-gray-300 border-2 border-dashed border-gray-100 rounded-full">
                    <TrendingUp className="w-6 h-6 opacity-50" />
                  </div>
               ) : (
                 <ResponsiveContainer width="100%" height="100%">
                   <PieChart>
                     <Pie data={donutData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={28} outerRadius={44} paddingAngle={2} labelLine={false}>
                       {donutData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                     </Pie>
                     <DonutLabel cx={48} cy={48} value={totalPaid} total={totalInvoiced} label="collected" />
                     <Tooltip formatter={v => [fmt(v), ""]} contentStyle={{ fontSize: 11, borderRadius: 8, border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} />
                   </PieChart>
                 </ResponsiveContainer>
               )}
             </div>
             <div className="flex-1 ml-4 space-y-2">
               <div className="flex justify-between items-center text-xs">
                 <span className="flex items-center gap-1.5 text-gray-600">Collected</span>
                 <span className="font-bold text-gray-900 tabular-nums">{fmt(totalPaid)}</span>
               </div>
               <div className="flex justify-between items-center text-xs">
                 <span className="flex items-center gap-1.5 text-gray-600">Outstanding</span>
                 <span className="font-bold text-gray-900 tabular-nums">{fmt(totalOutstanding)}</span>
               </div>
               <div className="pt-2 mt-2">
                 <Bar2 value={totalPaid} total={totalInvoiced} color="#00C950" bgClass="bg-[#F59E0B]" />
               </div>
               {unpaidCount > 0 && (
                 <div className="pt-2 mt-1">
                   <button className="w-full text-[10px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 py-1.5 rounded-md transition-colors flex items-center justify-center gap-1">
                     <AlertTriangle className="w-3 h-3" /> Review {unpaidCount} unpaid {unpaidCount === 1 ? "invoice" : "invoices"}
                   </button>
                 </div>
               )}
             </div>
          </div>
        </div>

        {/* ACTIVITY PULSE */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col justify-between">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Activity Pulse</h3>
          
          <div className="space-y-3 mb-4 text-xs font-medium">
            <div className="flex items-center justify-between group">
              <span className="text-gray-500 w-16">Invoices</span>
              <div className="flex-1 mx-3 h-2 bg-gray-50 border border-gray-100 rounded-full overflow-hidden flex shadow-inner">
                <div className="h-full bg-gradient-to-r from-blue-400 to-blue-500 rounded-full transition-all group-hover:opacity-80" style={{width: `${Math.min(100, invoices.length * 10)}%`}} />
              </div>
              <span className="text-gray-900 w-4 text-right font-bold tabular-nums">{invoices.length}</span>
            </div>
            <div className="flex items-center justify-between group">
              <span className="text-gray-500 w-16">Tasks</span>
              <div className="flex-1 mx-3 h-2 bg-gray-50 border border-gray-100 rounded-full overflow-hidden flex shadow-inner">
                <div className="h-full bg-gradient-to-r from-violet-400 to-violet-500 rounded-full transition-all group-hover:opacity-80" style={{width: `${Math.min(100, tasks.length * 10)}%`}} />
              </div>
              <span className="text-gray-900 w-4 text-right font-bold tabular-nums">{tasks.length}</span>
            </div>
            <div className="flex items-center justify-between group">
              <span className="text-gray-500 w-16">Meetings</span>
              <div className="flex-1 mx-3 h-2 bg-gray-50 border border-gray-100 rounded-full overflow-hidden flex shadow-inner">
                <div className="h-full bg-gradient-to-r from-green-400 to-green-500 rounded-full transition-all group-hover:opacity-80" style={{width: `${Math.min(100, meetings.length * 10)}%`}} />
              </div>
              <span className="text-gray-900 w-4 text-right font-bold tabular-nums">{meetings.length}</span>
            </div>
            <div className="flex items-center justify-between group">
              <span className="text-gray-500 w-16">Notes</span>
              <div className="flex-1 mx-3 h-2 bg-gray-50 border border-gray-100 rounded-full overflow-hidden flex shadow-inner">
                <div className="h-full bg-gradient-to-r from-yellow-400 to-yellow-500 rounded-full transition-all group-hover:opacity-80" style={{width: `${Math.min(100, notes.length * 10)}%`}} />
              </div>
              <span className="text-gray-900 w-4 text-right font-bold tabular-nums">{notes.length}</span>
            </div>
          </div>
          
          <div className="space-y-2 pt-3 border-t border-gray-100 text-[11px]">
            <div className="flex justify-between">
               <span className="text-gray-400 font-medium">Last Activity</span>
               <span className="font-bold text-gray-700">{activities[0] ? fmtDate(activities[0].date) : "None"}</span>
            </div>
            <div className="flex justify-between">
               <span className="text-gray-400 font-medium">Next Activity</span>
               <span className="font-bold text-gray-700">{nextActivityDate ? fmtDate(nextActivityDate) : "None"}</span>
            </div>
          </div>
        </div>

      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          5. DEAL DETAILS (CRM Visual Profile)
      ════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-xl border border-gray-200 relative z-20 overflow-hidden">
        
        {/* ROW 1: Company & Contact */}
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-100 border-b border-gray-100">
          <div className="p-6 flex flex-col justify-center group hover:bg-gray-50/50 transition-colors">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0 shadow-sm">
                <Building2 className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Company</p>
                {deal.company ? (
                  <Link to={`/companies/${deal.company._id}`} className="text-sm font-bold text-gray-900 hover:text-blue-600 flex items-center gap-1.5 group-hover:underline">
                    {deal.company.name} <ExternalLink className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                ) : (
                  <p className="text-sm font-bold text-gray-800">No Company</p>
                )}
              </div>
            </div>
          </div>

          <div className="p-6 flex flex-col justify-center group hover:bg-gray-50/50 transition-colors">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-shrink-0 shadow-sm">
                <User className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Contact</p>
                <p className="text-sm font-bold text-gray-900">{deal.contact?.name || "No Contact"}</p>
              </div>
            </div>
          </div>
        </div>

        {/* ROW 2: Metadata Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 divide-gray-100 md:divide-x border-b border-gray-100 bg-gray-50/30">
           <div className="p-5">
             <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Owner</p>
             <p className="text-xs font-bold text-gray-800 flex items-center gap-2">
               <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] shadow-sm">
                 {deal.user?.name?.[0]?.toUpperCase() || "U"}
               </div> 
               {deal.user?.name || "Unassigned"}
             </p>
           </div>
           <div className="p-5">
             <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Created</p>
             <p className="text-xs font-bold text-gray-800 flex items-center gap-2"><Calendar className="w-4 h-4 text-gray-400"/> {fmtDate(deal.createdAt)}</p>
           </div>
           <div className="p-5">
             <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Last Updated</p>
             <p className="text-xs font-bold text-gray-800 flex items-center gap-2"><Clock className="w-4 h-4 text-gray-400"/> {fmtDate(deal.updatedAt)}</p>
           </div>
           <div className="p-5 flex items-center">
             <div>
               <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Stage</p>
               <div className="flex items-center gap-1.5">
                 <div className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColor(deal.status) }} />
                 <span className="text-xs font-bold text-gray-800">{deal.status || "Open"}</span>
               </div>
             </div>
           </div>
        </div>

        {/* ROW 3: Dynamic Custom Fields (Only if exist) */}
        {groupedFields.length > 0 && (
          <div className="p-5 bg-white">
            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Additional Details</h4>
            <div className="space-y-4">
              {groupedFields.map(([cat, fields]) => (
                <div key={cat}>
                  {groupedFields.length > 1 && (
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{cat}</span>
                      <div className="flex-1 h-px bg-gray-100" />
                    </div>
                  )}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {fields.map((field, i) => (
                      <div key={i} className="flex flex-col gap-1">
                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide truncate">
                          {field.key}
                        </span>
                        <div className="min-w-0 bg-gray-50 px-2 py-1.5 rounded text-sm text-gray-900 border border-gray-100">
                          {renderFieldValue(field)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          6. CUSTOM FIELDS CONFIGURATION (Compact empty state)
      ════════════════════════════════════════════════════════════════════ */}
      <div className="relative z-10">
        {groupedFields.length === 0 ? (
          <div className="flex items-center justify-between py-2 text-gray-400">
            <span className="text-xs">{totalFC === 0 ? "No custom fields configured for Deals." : "No custom fields filled out."}</span>
            {totalFC === 0 && (
              <Link to="/settings?section=deal-fields" className="text-xs font-bold text-blue-600 flex items-center gap-1 hover:underline">
                <Plus className="w-3.5 h-3.5" /> Add custom fields in settings
              </Link>
            )}
          </div>
        ) : (
          <div className="flex justify-end pt-2">
            <button onClick={() => setShowEmptyFields(v => !v)} className="text-xs font-medium text-gray-500 hover:text-blue-600 flex items-center gap-1">
              {showEmptyFields ? <><EyeOff className="w-3.5 h-3.5" /> Hide empty fields</> : <><EyeIcon className="w-3.5 h-3.5" /> Show all fields</>}
            </button>
          </div>
        )}
      </div>


    </div>
  );
};

export default BasicDetails;