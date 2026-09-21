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
import DealFieldDrawer from "./DealFieldDrawer";
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
  CartesianGrid,
  AreaChart,
  Area
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
const AIcon = ({ type, className = "w-4 h-4" }) => {
  const m = {
    invoice: <Receipt      className={className} />,
    task:    <CheckSquare  className={className} />,
    meeting: <CalendarDays className={className} />,
    call:    <PhoneCall    className={className} />,
    note:    <MessageSquare className={className} />,
  };
  return m[(type || "").toLowerCase()] || <FileText className={className} />;
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

const BasicDetails = ({ deal, dealFieldList = [], onDealUpdate, onFieldsChanged }) => {

  // ── state ───────────────────────────────────────────────────────────────
  const [showFieldDrawer, setShowFieldDrawer] = useState(false);
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

  // Pipeline stages as configured in Settings -> Pipeline (KanbanBoard.statuses),
  // the same list the Deals Kanban board renders as columns. Fetched here so the
  // Deal Journey below reflects custom stages (e.g. "negotiation") instead of a
  // hardcoded Open/Won/Lost, and so it doesn't drift from what Settings shows.
  const [pipelineStatuses, setPipelineStatuses] = useState([]);

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
    API.get("/kanban").then(r => setPipelineStatuses(r.data?.statuses || [])).catch(() => {});
  }, []);

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
    const groups = {};
    invoices.forEach(inv => {
       const d = new Date(inv.createdAt);
       const mY = isNaN(d) ? "Unknown" : `${d.toLocaleString('default', { month: 'short' })} ${d.getFullYear().toString().slice(2)}`;
       if (!groups[mY]) groups[mY] = { name: mY, Invoiced: 0, Collected: 0, timestamp: isNaN(d) ? 0 : d.getTime() };
       groups[mY].Invoiced += (inv.amount || 0);
       if ((inv.status || "").toLowerCase() === "paid") groups[mY].Collected += (inv.amount || 0);
    });
    
    let runningInv = 0, runningCol = 0;
    return Object.values(groups)
      .sort((a,b) => a.timestamp - b.timestamp)
      .map(g => {
         runningInv += g.Invoiced;
         runningCol += g.Collected;
         return { name: g.name, Invoiced: runningInv, Collected: runningCol };
      });
  }, [invoices]);

  // Invoice Aging Logic
  const invoiceAging = useMemo(() => {
    if (invoices.length === 0) return null;
    let paid = 0, notDue = 0, dueSoon = 0, overdue = 0;
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Start of today
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    invoices.forEach(i => {
      if ((i.status || "").toLowerCase() === "paid") {
        paid++;
        return;
      }
      if (!i.dueDate) {
        notDue++;
        return;
      }
      const due = new Date(i.dueDate);
      due.setHours(0, 0, 0, 0);
      
      if (due < now) {
        overdue++;
      } else if (due <= nextWeek) {
        dueSoon++;
      } else {
        notDue++;
      }
    });

    if (paid + notDue + dueSoon + overdue === 0) return null;
    return { paid, notDue, dueSoon, overdue };
  }, [invoices]);

  // Activity Breakdown Logic
  const activityBreakdown = useMemo(() => {
    const counts = {
      Invoices: invoices.length,
      Tasks: tasks.length,
      Meetings: meetings.length,
      Notes: notes.length,
    };
    
    const categoriesWithData = Object.values(counts).filter(v => v > 0).length;
    // Only show if there's multiple categories of activity (otherwise Timeline is enough)
    if (categoriesWithData <= 1) return null; 
    
    return counts;
  }, [invoices, tasks, meetings, notes]);

  // Heatmap Data (Last 28 days activity count)
  const heatmapData = useMemo(() => {
    const days = [];
    const now = new Date();
    for (let i = 27; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      d.setHours(0,0,0,0);
      days.push({ date: d, count: 0 });
    }
    activities.forEach(a => {
      const ad = new Date(a.date);
      ad.setHours(0,0,0,0);
      const target = days.find(day => day.date.getTime() === ad.getTime());
      if (target) target.count++;
    });
    return days;
  }, [activities]);


  // Custom fields
  const allMerged     = getMergedFields();
  const visibleFields = showEmptyFields ? allMerged : allMerged.filter(f => !isEmpty(f.value));
  const totalFC       = allMerged.length;
  const groupedFields = Object.entries(
    visibleFields.reduce((acc, f) => { const c = f.category || "Uncategorized"; if (!acc[c]) acc[c] = []; acc[c].push(f); return acc; }, {})
  ).sort(([a], [b]) => a === "Uncategorized" ? 1 : b === "Uncategorized" ? -1 : a.localeCompare(b));

  // Same order Settings -> Pipeline and the Deals Kanban board use, so a stage
  // added there (e.g. "negotiation") shows up here without any further change.
  // "Lost" is a branch outcome rather than a forward step, so it's excluded from
  // the main path and only appended when it's actually the deal's current status
  // (matching the original Open-then-Lost behavior, just with custom stages kept
  // in between).
  const configuredStages = pipelineStatuses.length ? pipelineStatuses : ["Open", "Won", "Lost"];
  const forwardStages = configuredStages.filter((s) => s !== "Lost");
  const visualStages = currentStatus === "Lost"
    ? [...forwardStages.filter((s) => s !== "Won"), "Lost"]
    : forwardStages;
  const currentStageIdx = visualStages.indexOf(currentStatus);
  const progressPct = visualStages.length > 1 && currentStageIdx >= 0
    ? (currentStageIdx / (visualStages.length - 1)) * 100
    : 0;

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 pb-8 relative z-0">
      <AppToaster />

      {/* ═══════════════════════════════════════════════════════════════════
          1. DEAL INFORMATION (Compact Strip)
      ════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-xl border border-[#E7E4E3] relative z-50 overflow-visible shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-6 divide-y md:divide-y-0 divide-gray-100 md:divide-x border-gray-100 bg-white rounded-xl">
          <div className="px-4 py-3 flex flex-col justify-center group hover:bg-gray-50 transition-colors col-span-2 md:col-span-1 rounded-tl-xl md:rounded-bl-xl text-left">
            <p className="text-[11px] font-medium text-gray-500 mb-0.5">Company</p>
            {deal.company ? (
              <Link to={`/companies/${deal.company._id}`} className="text-sm font-semibold text-gray-900 hover:text-blue-600 flex items-center gap-1.5 group-hover:underline min-w-0">
                <Building2 className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                <span className="truncate">{deal.company.name}</span>
                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </Link>
            ) : (
              <p className="text-sm font-semibold text-gray-800">—</p>
            )}
          </div>
          <div className="px-4 py-3 flex flex-col justify-center group hover:bg-gray-50 transition-colors col-span-2 md:col-span-1 text-left">
            <p className="text-[11px] font-medium text-gray-500 mb-0.5">Contact</p>
            {deal.contact ? (
              <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 min-w-0">
                <User className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                <span className="truncate">{deal.contact.name}</span>
              </p>
            ) : (
              <p className="text-sm font-semibold text-gray-800">—</p>
            )}
          </div>
          <div className="px-4 py-3 flex flex-col justify-center relative text-left">
            <p className="text-[11px] font-medium text-gray-500 mb-0.5">Owner</p>
            <button
              onClick={() => canEdit && setIsOwnerDropdownOpen(v => !v)}
              disabled={!canEdit}
              className={`flex items-center gap-1.5 -ml-1 px-1 py-0.5 rounded text-sm font-semibold transition-colors w-fit ${canEdit ? "text-gray-900 hover:bg-gray-50 cursor-pointer" : "text-gray-900 cursor-default"}`}
            >
              <div className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[9px] shadow-sm flex-shrink-0">
                {deal.user?.name?.[0]?.toUpperCase() || "U"}
              </div>
              <span className="truncate">{deal.user?.name || "Unassigned"}</span>
              {canEdit && <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
            </button>
            {isOwnerDropdownOpen && canEdit && (
              <div className="absolute top-full left-4 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden">
                <div className="p-2 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                  <h4 className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Assign Owner</h4>
                  <button onClick={() => setIsOwnerDropdownOpen(false)} className="text-[10px] text-gray-500 hover:text-gray-700 font-medium px-1">Close</button>
                </div>
                <div className="p-2">
                  <input type="text" placeholder="Search users..." className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-blue-500 mb-2" value={searchOwnerQuery} onChange={e => setSearchOwnerQuery(e.target.value)} />
                  <div className="max-h-40 overflow-y-auto space-y-0.5 custom-scrollbar">
                    <button onClick={() => handleOwnerChange(null)} className="w-full text-left flex items-center gap-2 p-1.5 hover:bg-gray-50 rounded-md text-xs">
                      <div className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center font-medium">N</div>
                      <span className="text-gray-600 font-medium">None</span>
                      {!deal.user && <Check className="w-3.5 h-3.5 text-[#00C950] ml-auto" />}
                    </button>
                    {availableUsers.filter(u => u.name?.toLowerCase().includes(searchOwnerQuery.toLowerCase())).map(u => (
                      <button key={u._id} onClick={() => handleOwnerChange(u._id)} className="w-full text-left flex items-center gap-2 p-1.5 hover:bg-gray-50 rounded-md text-xs">
                        <div className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-[10px] border border-blue-100">{u.name?.[0]?.toUpperCase()}</div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-gray-900 font-medium truncate">{u.name}</span>
                        </div>
                        {deal.user?._id === u._id && <Check className="w-3.5 h-3.5 text-[#00C950] ml-auto flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="px-4 py-3 flex flex-col justify-center text-left">
            <p className="text-[11px] font-medium text-gray-500 mb-0.5">Stage</p>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: statusColor(deal.status) }} />
              <span className="text-sm font-semibold text-gray-800">{deal.status || "Open"}</span>
            </div>
          </div>
          <div className="px-4 py-3 flex flex-col justify-center text-left">
            <p className="text-[11px] font-medium text-gray-500 mb-0.5">Created Date</p>
            <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
               <Calendar className="w-3.5 h-3.5 text-gray-400" /> {fmtDate(deal.createdAt)}
            </p>
          </div>
          <div className="px-4 py-3 flex flex-col justify-center group/audit cursor-default relative rounded-tr-xl md:rounded-br-xl text-left">
            <p className="text-[11px] font-medium text-gray-500 mb-0.5">Last Updated</p>
            <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
               <Clock className="w-3.5 h-3.5 text-gray-400" /> {fmtDate(deal.updatedAt)}
            </p>
            <div className="absolute top-full right-4 mt-2 bg-white border border-gray-200 p-3 rounded-xl shadow-xl opacity-0 group-hover/audit:opacity-100 transition-opacity pointer-events-none z-40 min-w-[200px] text-left">
              <div className="mb-2">
                <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Updated By</div>
                <div className="font-semibold text-xs text-gray-900">{deal.lastUpdatedBy?.name || "Unknown"}</div>
                <div className="text-[9px] text-gray-500 mt-0.5">{fmtDateTime(deal.updatedAt)}</div>
              </div>
              <div className="pt-2 border-t border-gray-100">
                <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Created By</div>
                <div className="font-semibold text-xs text-gray-900">{deal.createdBy?.name || "Unknown"}</div>
                <div className="text-[9px] text-gray-500 mt-0.5">{fmtDateTime(deal.createdAt)}</div>
              </div>
            </div>
          </div>
        </div>

        {groupedFields.length > 0 && (
          <div className="px-5 py-4 bg-gray-50/50 border-t border-gray-100">
            <div className="flex flex-wrap gap-x-8 gap-y-4">
              {visibleFields.map((field, i) => (
                <div key={i} className="flex flex-col gap-1 min-w-[120px]">
                  <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">{field.key}</span>
                  <div className="text-xs text-gray-900">{renderFieldValue(field)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="relative z-10 -mt-2">
        {groupedFields.length === 0 ? (
          <div className="flex items-center justify-end px-2 text-gray-400">
            {totalFC === 0 && (
              <button
                type="button"
                onClick={() => setShowFieldDrawer(true)}
                className="text-[10px] font-bold text-blue-600 flex items-center gap-1 hover:underline"
              >
                <Plus className="w-3 h-3" /> Add custom fields
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-end gap-3 px-2">
            <button
              type="button"
              onClick={() => setShowFieldDrawer(true)}
              className="text-[10px] font-bold text-blue-600 flex items-center gap-1 hover:underline"
            >
              <Plus className="w-3 h-3" /> Add Field
            </button>
            <button onClick={() => setShowEmptyFields(v => !v)} className="text-[10px] font-medium text-gray-400 hover:text-blue-600 flex items-center gap-1">
              {showEmptyFields ? <><EyeOff className="w-3 h-3" /> Hide empty fields</> : <><EyeIcon className="w-3 h-3" /> Show all fields</>}
            </button>
          </div>
        )}
      </div>

      <DealFieldDrawer
        isOpen={showFieldDrawer}
        onClose={() => {
          setShowFieldDrawer(false);
          // Same custom-field data Settings -> Deal Fields edits — refresh
          // the parent's copy so anything added/changed/removed here shows
          // up immediately instead of waiting for the next full page load.
          onFieldsChanged?.();
        }}
      />

      {/* ═══════════════════════════════════════════════════════════════════
          2. DEAL JOURNEY
      ════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white p-5 rounded-xl border border-[#E7E4E3] shadow-sm relative z-10 text-left">
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-sm font-semibold text-[#0E121B]">Deal Journey</h3>
        </div>
        <div className="w-full pb-10 pt-2 overflow-x-auto custom-scrollbar">
          <div className="min-w-[300px] max-w-2xl mx-auto relative flex items-center justify-between px-4 sm:px-8">
            <div className="absolute left-4 sm:left-8 right-4 sm:right-8 top-1/2 h-[3px] bg-gray-100 -translate-y-1/2 z-0 rounded-full" />
            <div 
              className={`absolute left-4 sm:left-8 top-1/2 h-[3px] -translate-y-1/2 z-0 transition-all duration-700 ease-in-out rounded-full ${currentStatus === "Lost" ? "bg-[#EF4444]" : "bg-[#0085FF]"}`}
              style={{ width: `calc(${progressPct}% - ${progressPct === 100 ? "4rem" : "0px"})` }} 
            />
            
            {visualStages.map((step, idx) => {
              const isActive = currentStatus === step;
              const isPast = visualStages.indexOf(currentStatus) > idx;
              const isLost = step === "Lost";
              
              return (
                <div key={step} className="relative z-10 flex flex-col items-center group min-w-[100px]">
                  <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-all duration-300 border-[3px] shadow-sm bg-white
                    ${isActive && !isLost ? "border-[#0085FF] ring-4 ring-blue-50 scale-110" : 
                      isActive && isLost ? "border-[#EF4444] ring-4 ring-red-50 scale-110" : 
                      isPast ? "border-[#0085FF] bg-[#0085FF] text-white" : 
                      "border-gray-200 text-gray-300"}`}>
                    {isPast ? <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" /> : 
                     (isActive ? <div className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ${isLost ? "bg-[#EF4444]" : "bg-[#0085FF]"}`} /> : 
                                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-gray-200 group-hover:bg-gray-300 transition-colors" />)}
                  </div>
                  <div className="absolute top-full mt-3 flex flex-col items-center">
                    <span className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-wider whitespace-nowrap
                      ${isActive && !isLost ? "text-gray-900" : 
                        isActive && isLost ? "text-[#EF4444]" : 
                        isPast ? "text-gray-700" : 
                        "text-gray-400"}`}>
                      {step}
                    </span>
                    {isActive && (
                      <span className="text-[9px] text-[#0085FF] font-semibold mt-0.5 whitespace-nowrap">
                        Current Stage
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          3. MAIN CONTENT (REVENUE GRAPH & TIMELINE)
      ════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 relative z-10">
        
        {/* REVENUE GRAPH */}
        <div className="lg:col-span-3 bg-white p-5 rounded-xl border border-[#E7E4E3] shadow-sm flex flex-col h-[300px] text-left">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-semibold text-[#0E121B]">Revenue Trend</h3>
            {revenueChartData.length > 0 && (
              <div className="flex gap-4">
                 <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-blue-500 rounded-full" /> <span className="text-[11px] font-medium text-gray-500">Invoiced</span></div>
                 <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-[#00C950] rounded-full" /> <span className="text-[11px] font-medium text-gray-500">Collected</span></div>
              </div>
            )}
          </div>

          <div className="flex-1 flex flex-col justify-center min-h-[160px]">
            {revenueChartData.length === 0 ? (
               <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 border border-dashed border-gray-200 rounded-xl bg-gray-50/50">
                 <TrendingUp className="w-6 h-6 mb-2 text-gray-300" />
                 <span className="text-[11px] font-medium text-gray-500">No invoice history to plot</span>
               </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueChartData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#9CA3AF" }} axisLine={false} tickLine={false} dy={8} />
                  <YAxis tickFormatter={(val) => `₹${val >= 1000 ? val/1000 + 'k' : val}`} tick={{ fontSize: 9, fill: "#9CA3AF" }} axisLine={false} tickLine={false} dx={-8} />
                  <Tooltip 
                    formatter={(val) => [fmt(val), ""]} 
                    contentStyle={{ fontSize: 11, borderRadius: 6, border: "1px solid #E5E7EB", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} 
                  />
                  <Line type="monotone" dataKey="Total Invoiced" stroke="#0085FF" strokeWidth={2} dot={{ r: 3, fill: "#0085FF", strokeWidth: 0 }} activeDot={{ r: 5, strokeWidth: 0 }} />
                  <Line type="monotone" dataKey="Total Collected" stroke="#00C950" strokeWidth={2} dot={{ r: 3, fill: "#00C950", strokeWidth: 0 }} activeDot={{ r: 5, strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* ACTIVITY TIMELINE */}
        <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-[#E7E4E3] shadow-sm flex flex-col h-[300px] text-left">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold text-[#0E121B]">Activity Timeline</h3>
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            {ACTIVITY_FILTERS.map(f => (
              <button key={f} onClick={() => setActivityFilter(f)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${activityFilter === f ? "bg-[#0085FF] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {f}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
            {activitiesLoading ? (
              <div className="space-y-3 pt-1">
                {[1,2,3,4].map(i => (
                  <div key={i} className="flex items-start gap-2.5 animate-pulse">
                    <div className="w-6 h-6 rounded-full bg-gray-100 flex-shrink-0" />
                    <div className="flex-1 space-y-1.5 pt-0.5">
                      <div className="h-2 bg-gray-200 rounded-full w-3/4" />
                      <div className="h-1.5 bg-gray-100 rounded-full w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredActivities.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <Activity className="w-6 h-6 mb-2 text-gray-300" />
                <p className="text-[11px] font-medium text-gray-500">No {activityFilter === "All" ? "recent" : activityFilter.toLowerCase()} activity</p>
              </div>
            ) : (
              <div className="space-y-0">
                {filteredActivities.map((act, i) => (
                  <div key={i} className="flex items-start gap-3 py-2 relative group">
                    {/* Connection line */}
                    {i !== filteredActivities.length - 1 && (
                      <div className="absolute left-[15px] top-[36px] bottom-[-8px] w-[2px] bg-gray-100" />
                    )}
                    
                    {(() => {
                       const t = (act.type || "").toLowerCase();
                       let bg = "bg-gray-50", txt = "text-gray-500";
                       if (t === "invoice") { bg = "bg-blue-50"; txt = "text-blue-500"; }
                       else if (t === "task") { bg = "bg-violet-50"; txt = "text-violet-500"; }
                       else if (t === "meeting") { bg = "bg-green-50"; txt = "text-[#00C950]"; }
                       else if (t === "call") { bg = "bg-orange-50"; txt = "text-orange-500"; }
                       else if (t === "note") { bg = "bg-yellow-50"; txt = "text-yellow-500"; }
                       else if (act.label.toLowerCase().includes("won") || t === "deal") { bg = "bg-emerald-50"; txt = "text-[#00C950]"; }
                       
                       return (
                         <div className={`w-8 h-8 rounded-full ${bg} ${txt} flex items-center justify-center flex-shrink-0 relative z-10`}>
                           <AIcon type={t} className="w-4 h-4" />
                         </div>
                       );
                    })()}
                    
                    <div className="flex-1 min-w-0 pb-2 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[13px] font-medium text-gray-900 leading-snug truncate pr-2">{act.label}</p>
                        <p className="text-[11px] font-medium text-gray-400 mt-0.5">{fmtDate(act.date)}</p>
                      </div>
                      {act.amount != null && <span className="text-[13px] font-semibold text-gray-900 whitespace-nowrap">₹{act.amount.toLocaleString('en-IN')}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          4. FINANCIAL VISUALS
      ════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 relative z-0">
        
        {/* INVOICE STATUS (PIE CHART) */}
        <div className="bg-white p-5 rounded-xl border border-[#E7E4E3] shadow-sm flex flex-col text-left">
          <h3 className="text-sm font-semibold text-[#0E121B] mb-4">Invoice Status</h3>
          <div className="flex items-center justify-center gap-6 flex-1 py-2">
            <div className="w-[100px] h-[100px] relative flex-shrink-0">
              {invoices.length === 0 ? (
                 <div className="absolute inset-0 flex items-center justify-center text-gray-300 border border-dashed border-gray-200 rounded-full bg-gray-50/50">
                   <Receipt className="w-5 h-5 opacity-40" />
                 </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie 
                      data={invoiceDonutData} 
                      dataKey="value" 
                      nameKey="name" 
                      cx="50%" 
                      cy="50%" 
                      innerRadius={36} 
                      outerRadius={50} 
                      paddingAngle={4} 
                      stroke="none"
                    >
                      {invoiceDonutData.map((e, i) => <Cell key={i} fill={e.fill} stroke="transparent" strokeWidth={0} />)}
                    </Pie>
                    <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
                      <tspan x="50%" dy="-2" fontSize={22} fontWeight={700} fill="#111827">{invoices.length}</tspan>
                      <tspan x="50%" dy={16} fontSize={10} fontWeight={500} fill="#6B7280">Total</tspan>
                    </text>
                    <Tooltip formatter={v => [v, "Invoices"]} contentStyle={{ fontSize: 11, borderRadius: 6, border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="flex flex-col gap-2 flex-1 max-w-[90px]">
              <div className="bg-gray-50 px-2.5 py-1.5 rounded-lg border border-gray-100 flex flex-col">
                <div className="flex items-center gap-1.5 text-[10px] font-medium text-gray-500 mb-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#00C950]" /> Paid
                </div>
                <div className="text-[13px] font-semibold text-gray-900">{paidCount}</div>
              </div>
              <div className="bg-gray-50 px-2.5 py-1.5 rounded-lg border border-gray-100 flex flex-col">
                <div className="flex items-center gap-1.5 text-[10px] font-medium text-gray-500 mb-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#EF4444]" /> Unpaid
                </div>
                <div className="text-[13px] font-semibold text-gray-900">{unpaidCount}</div>
              </div>
            </div>
          </div>
        </div>

        {/* INVOICE AGING MATRIX (WITH PROGRESS BARS) */}
        <div className="bg-white p-5 rounded-xl border border-[#E7E4E3] shadow-sm flex flex-col text-left">
          <h3 className="text-sm font-semibold text-[#0E121B] mb-4">Invoice Aging Matrix</h3>
          <div className="flex-1 flex flex-col justify-center gap-3.5">
            {invoiceAging ? (
              [
                { label: "Paid", count: invoiceAging.paid, color: "bg-[#00C950]" },
                { label: "Not Due", count: invoiceAging.notDue, color: "bg-blue-500" },
                { label: "Due Soon", count: invoiceAging.dueSoon, color: "bg-amber-500" },
                { label: "Overdue", count: invoiceAging.overdue, color: "bg-[#EF4444]" },
              ].map(item => {
                const total = invoices.length || 1;
                const pct = (item.count / total) * 100;
                return (
                  <div key={item.label} className="group">
                    <div className="flex justify-between items-center mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${item.color}`} />
                        <span className="text-[11px] font-medium text-gray-500">{item.label}</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">{item.count}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-[3px] overflow-hidden flex">
                       <div className={`${item.color} h-full rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })
            ) : (
               <div className="flex items-center justify-center h-full text-[11px] font-medium text-gray-500">No invoices found</div>
            )}
          </div>
        </div>

        {/* FINANCIAL SUMMARY */}
        <div className="bg-white p-5 rounded-xl border border-[#E7E4E3] shadow-sm flex flex-col text-left">
           <h3 className="text-sm font-semibold text-[#0E121B] mb-4">Financial Overview</h3>
           <div className="flex-1 flex flex-col justify-center">
             <div className="grid grid-cols-1 gap-2.5">
               <div className="flex items-center gap-3 px-3 py-2 bg-white border border-gray-100 rounded-xl shadow-[0_2px_4px_rgba(0,0,0,0.02)]">
                  <div className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-200 text-gray-400 flex items-center justify-center flex-shrink-0 shadow-sm">
                    <Receipt className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate w-full text-[10px] font-medium text-gray-500 leading-tight">Total Invoiced</p>
                    <p className="truncate w-full text-[13px] font-semibold text-gray-900 leading-tight">{fmt(totalInvoiced)}</p>
                  </div>
               </div>
               <div className="flex items-center gap-3 px-3 py-2 bg-white border border-gray-100 rounded-xl shadow-[0_2px_4px_rgba(0,0,0,0.02)]">
                  <div className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-200 text-gray-400 flex items-center justify-center flex-shrink-0 shadow-sm">
                    <AlertCircle className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate w-full text-[10px] font-medium text-gray-500 leading-tight">Pending</p>
                    <p className="truncate w-full text-[13px] font-semibold text-gray-900 leading-tight">{fmt(totalInvoiced)}</p>
                  </div>
               </div>
               <div className="flex items-center gap-3 px-3 py-2 bg-white border border-gray-100 rounded-xl shadow-[0_2px_4px_rgba(0,0,0,0.02)]">
                  <div className="w-8 h-8 rounded-lg bg-red-50 border border-red-100 text-[#EF4444] flex items-center justify-center flex-shrink-0 shadow-sm">
                    <Clock className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate w-full text-[10px] font-medium text-gray-500 leading-tight">Overdue</p>
                    <p className="truncate w-full text-[13px] font-semibold text-[#EF4444] leading-tight">{fmt(totalOutstanding)}</p>
                  </div>
               </div>
               <div className="flex items-center gap-3 px-3 py-2 bg-white border border-gray-100 rounded-xl shadow-[0_2px_4px_rgba(0,0,0,0.02)]">
                  <div className="w-8 h-8 rounded-lg bg-green-50 border border-green-100 text-[#00C950] flex items-center justify-center flex-shrink-0 shadow-sm">
                    <CheckSquare className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate w-full text-[10px] font-medium text-gray-500 leading-tight">Collected</p>
                    <p className="truncate w-full text-[13px] font-semibold text-[#00C950] leading-tight">{fmt(totalPaid)}</p>
                  </div>
               </div>
             </div>
           </div>
        </div>
      </div>


    </div>
  );
};

export default BasicDetails;
