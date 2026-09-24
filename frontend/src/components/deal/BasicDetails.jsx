import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import API from "../../services/api";
import { formatNumberToIndian } from "../../utils/numberFormatter";
import {
  User,
  Building2,
  ExternalLink,
  Clock,
  Check,
  ChevronDown,
  LayoutGrid,
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
  Activity,
  Calendar,
  AlertCircle
} from "lucide-react";
import AppToaster from "../AppToaster";
import PlusIcon from "../common/PlusIcon";
import PipelineStageDrawer from "./PipelineStageDrawer";
import {
  ResponsiveContainer,
  BarChart,
  ComposedChart,
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
  Area,
  LabelList
} from "recharts";

// ─── helpers ─────────────────────────────────────────────────────────────────

const fmt = (n) => `₹${formatNumberToIndian(n || 0)}`;

// ─── chart colour system ─────────────────────────────────────────────────────
// Two separate roles, kept apart on purpose.
//
// MONEY colours are semantic and deliberately consistent everywhere: the same
// hue always means the same state, so "blue" reads as invoiced on every card.
// MONEY_* is therefore reused by design, not by accident.
//
// ITEM_PALETTE is categorical — product names carry no inherent meaning — so it
// uses a separate jewel-toned ramp that never borrows a money colour. That is
// what stops the cards looking like the same four hues over and over.
const MONEY_INVOICED    = "#0085FF"; // billed
const MONEY_COLLECTED   = "#00B26B"; // cash received (deeper than the old #00C950)
const MONEY_OUTSTANDING = "#FF9500"; // owed, not yet late
const MONEY_OVERDUE     = "#F5325B"; // owed and late
const MONEY_TOTAL       = "#1E293B"; // the full deal value

// Health bars read as a traffic light, distinct from the money ramp above.
const HEALTH_GOOD = "#16A34A";
const HEALTH_WARN = "#F59E0B";
const HEALTH_BAD  = "#F5325B";

// Categorical ramp for line items — indigo → violet → cyan → rose → lime, with
// a neutral for the collapsed "other items" row.
const ITEM_PALETTE = ["#6366F1", "#A855F7", "#06B6D4", "#F43F5E", "#84CC16", "#F59E0B"];

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

const BasicDetails = ({ deal }) => {

  // ── state ───────────────────────────────────────────────────────────────
  const [showStageDrawer, setShowStageDrawer] = useState(false);

  const [activities,        setActivities]        = useState([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [activityFilter,    setActivityFilter]    = useState("All");
  const ACTIVITY_FILTERS = ["All", "Invoices", "Tasks", "Meetings", "Notes"];

  const [invoices, setInvoices] = useState([]);
  const [tasks,    setTasks]    = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [notes,    setNotes]    = useState([]);

  // Pipeline stages as configured in Settings -> Pipeline (KanbanBoard.statuses),
  // the same list the Deals Kanban board renders as columns. Fetched here so the
  // Deal Journey below reflects custom stages (e.g. "negotiation") instead of a
  // hardcoded Open/Won/Lost, and so it doesn't drift from what Settings shows.
  const [pipelineStatuses, setPipelineStatuses] = useState([]);

  // ── fetches ─────────────────────────────────────────────────────────────
  const refreshPipelineStatuses = () => {
    API.get("/kanban").then(r => setPipelineStatuses(r.data?.statuses || [])).catch(() => {});
  };

  useEffect(() => {
    refreshPipelineStatuses();
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

  // ── derived ──────────────────────────────────────────────────────────────
  const dealValue       = deal?.amount || 0;
  const totalInvoiced   = invoices.reduce((s, i) => s + (i.amount || 0), 0);

  // Money actually received, from each invoice's `payments[]` ledger rather
  // than its status flag — a part-paid invoice still reads as unpaid by status,
  // so counting only status === "paid" reported every partial receipt as zero.
  // An invoice flagged paid but carrying no payment rows (e.g. settled before
  // the ledger existed) still counts in full, and a receipt can never exceed
  // the invoice it belongs to.
  const collectedOn = (inv) => {
    const amount = inv.amount || 0;
    const recorded = Array.isArray(inv.payments)
      ? inv.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
      : 0;
    if (recorded > 0) return Math.min(recorded, amount);
    return (inv.status || "").toLowerCase() === "paid" ? amount : 0;
  };

  const totalPaid       = invoices.reduce((s, i) => s + collectedOn(i), 0);
  const totalOutstanding = Math.max(0, totalInvoiced - totalPaid);

  // Outstanding money split by whether its invoice's dueDate has passed, so the
  // "Pending" and "Overdue" tiles are two halves of the same number instead of
  // both reporting the whole balance.
  const { pendingAmount, overdueAmount } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let pending = 0, overdue = 0;
    invoices.forEach((i) => {
      const balance = Math.max(0, (i.amount || 0) - collectedOn(i));
      if (balance === 0) return;
      if (i.dueDate) {
        const due = new Date(i.dueDate);
        due.setHours(0, 0, 0, 0);
        if (due < today) { overdue += balance; return; }
      }
      pending += balance;
    });
    return { pendingAmount: pending, overdueAmount: overdue };
  }, [invoices]);

  
  // Counted off the same ledger as the amounts above, so an invoice settled in
  // full through `payments[]` is not still listed as unpaid because nobody
  // flipped its status.
  const paidCount = invoices.filter(i => (i.amount || 0) - collectedOn(i) <= 0).length;

  // ── derived data for the financial visuals ───────────────────────────────

  // 1. Billing coverage: how much of the deal has been invoiced, how much of
  //    that has landed. Each step is a subset of the one above it.
  const billingSteps = useMemo(() => {
    const base = Math.max(dealValue, totalInvoiced, 1);
    return [
      { key: "value",       label: "Deal Value",  amount: dealValue,        color: MONEY_TOTAL },
      { key: "invoiced",    label: "Invoiced",    amount: totalInvoiced,    color: MONEY_INVOICED },
      { key: "collected",   label: "Collected",   amount: totalPaid,        color: MONEY_COLLECTED },
      { key: "outstanding", label: "Outstanding", amount: totalOutstanding, color: MONEY_OUTSTANDING },
    ].map((s) => ({ ...s, pct: (s.amount / base) * 100 }));
  }, [dealValue, totalInvoiced, totalPaid, totalOutstanding]);

  // Unbilled gap — deal value that has never been invoiced at all. Only
  // meaningful once a deal actually carries an amount.
  const unbilled = dealValue > 0 ? Math.max(0, dealValue - totalInvoiced) : 0;

  // 3. What was actually sold — invoice line items rolled up by name. items[]
  //    is stored on every invoice but visualised nowhere in the product, so
  //    this is the only place the deal answers what it is actually billing for.
  //    Quantity and unit rate are carried through so the card can show the
  //    composition AND the line detail behind it.
  const topItems = useMemo(() => {
    const by = {};
    invoices.forEach((inv) => {
      (inv.items || []).forEach((it) => {
        const name = it.name || "Unnamed item";
        const qty = Number(it.quantity) || 0;
        const gross = (Number(it.rate) || 0) * qty;
        const disc =
          it.discountType === "percentage"
            ? gross * ((Number(it.discount) || 0) / 100)
            : Number(it.discount) || 0;
        if (!by[name]) by[name] = { name, value: 0, qty: 0, discount: 0 };
        by[name].value += Math.max(0, gross - disc);
        by[name].qty += qty;
        by[name].discount += Math.max(0, Math.min(disc, gross));
      });
    });
    const rows = Object.values(by).sort((a, b) => b.value - a.value);
    const top = rows.slice(0, 5);
    const rest = rows.slice(5);
    if (rest.length) {
      top.push({
        name: `${rest.length} other item${rest.length !== 1 ? "s" : ""}`,
        value: rest.reduce((s, r) => s + r.value, 0),
        qty: rest.reduce((s, r) => s + r.qty, 0),
        discount: rest.reduce((s, r) => s + r.discount, 0),
        isRest: true,
      });
    }
    return top.map((r, i) => ({
      ...r,
      unitRate: r.qty > 0 ? r.value / r.qty : 0,
      color: r.isRest ? "#C7CBD3" : ITEM_PALETTE[i % ITEM_PALETTE.length],
    }));
  }, [invoices]);

  const itemsTotal = topItems.reduce((s, r) => s + r.value, 0);

  // ── candidate visual A: deal health ──────────────────────────────────────
  // A composite score out of 100 from five signals this page already holds.
  // Every factor is a real ratio, never a guess, and each one carries its own
  // weight so the breakdown explains the number instead of just asserting it.
  const dealHealth = useMemo(() => {
    const now = Date.now();
    const lastTouch = activities.length
      ? Math.max(...activities.map((a) => new Date(a.date).getTime()).filter((n) => !Number.isNaN(n)))
      : null;
    const daysSinceTouch = lastTouch ? Math.floor((now - lastTouch) / 86400000) : null;
    const openTasks = tasks.filter((t) => t.status !== "Completed").length;

    const factors = [
      {
        key: "billed",
        label: "Billing coverage",
        hint: "Invoiced against deal value",
        weight: 25,
        ratio: dealValue > 0 ? Math.min(1, totalInvoiced / dealValue) : totalInvoiced > 0 ? 1 : 0,
        detail: dealValue > 0 ? `${Math.round(Math.min(100, (totalInvoiced / dealValue) * 100))}%` : "No deal value",
      },
      {
        key: "collected",
        label: "Collection rate",
        hint: "Cash received against invoiced",
        weight: 30,
        ratio: totalInvoiced > 0 ? totalPaid / totalInvoiced : 0,
        detail: totalInvoiced > 0 ? `${Math.round((totalPaid / totalInvoiced) * 100)}%` : "Nothing invoiced",
      },
      {
        key: "overdue",
        label: "No overdue debt",
        hint: "Balance past its due date",
        weight: 20,
        ratio: totalInvoiced > 0 ? 1 - Math.min(1, overdueAmount / totalInvoiced) : 1,
        detail: overdueAmount > 0 ? `${fmt(overdueAmount)} late` : "Clean",
      },
      {
        key: "recency",
        label: "Recent contact",
        hint: "Days since the last activity",
        weight: 15,
        // Full marks inside a fortnight, decaying to zero at 60 days.
        ratio:
          daysSinceTouch === null
            ? 0
            : daysSinceTouch <= 14
            ? 1
            : Math.max(0, 1 - (daysSinceTouch - 14) / 46),
        detail: daysSinceTouch === null ? "No activity" : `${daysSinceTouch}d ago`,
      },
      {
        key: "followup",
        label: "Follow-up in place",
        hint: "At least one task still open",
        weight: 10,
        ratio: openTasks > 0 ? 1 : 0,
        detail: openTasks > 0 ? `${openTasks} open` : "None open",
      },
    ].map((f) => ({ ...f, points: f.ratio * f.weight }));

    const score = Math.round(factors.reduce((s, f) => s + f.points, 0));
    const band =
      score >= 70
        ? { label: "Healthy", color: HEALTH_GOOD }
        : score >= 40
        ? { label: "Needs attention", color: HEALTH_WARN }
        : { label: "At risk", color: HEALTH_BAD };
    return { score, band, factors };
  }, [dealValue, totalInvoiced, totalPaid, overdueAmount, activities, tasks]);

  // ── billing cadence ──────────────────────────────────────────────────────
  // Month-by-month: what was invoiced (from invoice.date) against what was
  // actually received (from payments[].paymentDate). The deal page has no
  // time axis at all otherwise, so this is the only view of billing rhythm and
  // how far behind invoicing the cash is running.
  const cadence = useMemo(() => {
    if (!invoices.length) return null;
    const buckets = {};
    const touch = (d) => {
      const dt = new Date(d);
      if (Number.isNaN(dt.getTime())) return null;
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      if (!buckets[key]) {
        buckets[key] = {
          key,
          label: dt.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
          invoiced: 0,
          collected: 0,
        };
      }
      return buckets[key];
    };

    invoices.forEach((inv) => {
      const b = touch(inv.date || inv.createdAt);
      if (b) b.invoiced += inv.amount || 0;
      (inv.payments || []).forEach((p) => {
        const pb = touch(p.paymentDate || p.recordedAt);
        if (pb) pb.collected += Number(p.amount) || 0;
      });
    });

    const rows = Object.values(buckets).sort((a, b) => a.key.localeCompare(b.key));
    if (!rows.length) return null;
    // Running gap between what has been billed and what has landed.
    let ri = 0, rc = 0;
    rows.forEach((r) => {
      ri += r.invoiced;
      rc += r.collected;
      r.gap = Math.max(0, ri - rc);
    });
    return rows;
  }, [invoices]);

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
    const finalData = Object.values(groups)
      .sort((a,b) => a.timestamp - b.timestamp)
      .map(g => {
         runningInv += g.Invoiced;
         runningCol += g.Collected;
         return { name: g.name, Invoiced: runningInv, Collected: runningCol };
      });
      
    // If there's only one data point, a line chart will just draw a single dot.
    // Prepend a starting zero point so a line is actually drawn.
    if (finalData.length === 1) {
       finalData.unshift({ name: "Start", Invoiced: 0, Collected: 0 });
    }
    
    return finalData;
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


  // Same order Settings -> Pipeline and the Deals Kanban board use, so a stage
  // added there (e.g. "negotiation") shows up here without any further change.
  // "Lost" is a branch outcome rather than a forward step, so it's excluded from
  // the main path and only appended when it's actually the deal's current status
  // (matching the original Open-then-Lost behavior, just with custom stages kept
  // in between).
  const configuredStages = pipelineStatuses.length ? pipelineStatuses : ["Open", "Won", "Lost"];
  // Settings always appends a newly-added custom stage to the end of the raw
  // array (see KanbanSettings.jsx handleAdd), which lands it AFTER "Won" unless
  // someone manually drags it earlier. "Won" is the pipeline's completion state
  // though, so it belongs last in the forward path regardless of where it sits
  // in storage -- everything else (including any custom stage) keeps its
  // configured relative order in front of it.
  const nonTerminalStages = configuredStages.filter((s) => s !== "Lost" && s !== "Won");
  const forwardStages = configuredStages.includes("Won")
    ? [...nonTerminalStages, "Won"]
    : nonTerminalStages;
  const visualStages = currentStatus === "Lost"
    ? [...forwardStages.filter((s) => s !== "Won"), "Lost"]
    : forwardStages;
  const currentStageIdx = visualStages.indexOf(currentStatus);
  const progressPct = visualStages.length > 1 && currentStageIdx >= 0
    ? (currentStageIdx / (visualStages.length - 1)) * 100
    : 0;

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3 pb-8 relative z-0">
      <AppToaster />


      <PipelineStageDrawer
        isOpen={showStageDrawer}
        onClose={() => {
          setShowStageDrawer(false);
          // Same statuses data Settings -> Pipeline edits — refresh so the
          // Deal Journey bar reflects an added/renamed/reordered stage
          // immediately instead of waiting for the next full page load.
          refreshPipelineStatuses();
        }}
      />

      {/* ═══════════════════════════════════════════════════════════════════
          2. DEAL JOURNEY -- driven entirely by the configured pipeline order
          (visualStages, derived above from /kanban), so a stage added in
          Settings shows up here with no further change. No horizontal
          scroll: stages share the row width equally instead of each
          claiming a fixed min-width, so any stage count fits.
      ════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white px-5 py-4 rounded-xl border border-[#E7E4E3] shadow-sm relative z-10 text-left">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-semibold text-[#0E121B]">Deal Journey</h3>
          <div className="flex items-center gap-2">
            {visualStages.includes(currentStatus) && (
              <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap
                ${currentStatus === "Lost" ? "bg-red-50 text-[#EF4444]" : "bg-blue-50 text-[#0085FF]"}`}>
                Current: {currentStatus}
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowStageDrawer(true)}
              title="Edit pipeline stages (Settings)"
              aria-label="Edit pipeline stages"
              className="w-7 h-7 flex items-center justify-center rounded-full bg-[#0085FF] hover:bg-blue-600 text-white transition-colors flex-shrink-0"
            >
              <PlusIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="relative flex items-center justify-between px-1">
          <div className="absolute left-4 right-4 top-4 sm:top-[18px] h-[3px] bg-gray-100 -translate-y-1/2 z-0 rounded-full" />
          <div
            className={`absolute left-4 top-4 sm:top-[18px] h-[3px] -translate-y-1/2 z-0 transition-all duration-700 ease-in-out rounded-full ${currentStatus === "Lost" ? "bg-[#EF4444]" : "bg-[#0085FF]"}`}
            style={{ width: `calc((100% - 2rem) * ${progressPct / 100})` }}
          />

          {visualStages.map((step, idx) => {
            const isActive = currentStatus === step;
            const isPast = visualStages.indexOf(currentStatus) > idx;
            const isLost = step === "Lost";

            return (
              <div key={step} className="relative z-10 flex flex-col items-center group flex-1 px-0.5 min-w-0">
                <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center transition-all duration-300 border-[3px] shadow-sm bg-white
                  ${isActive && !isLost ? "border-[#0085FF] ring-4 ring-blue-50 scale-110" :
                    isActive && isLost ? "border-[#EF4444] ring-4 ring-red-50 scale-110" :
                    isPast ? "border-[#0085FF] bg-[#0085FF] text-white" :
                    "border-gray-200 text-gray-300"}`}>
                  {isPast ? <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" /> :
                   (isActive ? <div className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ${isLost ? "bg-[#EF4444]" : "bg-[#0085FF]"}`} /> :
                              <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-gray-200 group-hover:bg-gray-300 transition-colors" />)}
                </div>
                <span className={`mt-2 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-center truncate w-full px-0.5
                  ${isActive && !isLost ? "text-gray-900" :
                    isActive && isLost ? "text-[#EF4444]" :
                    isPast ? "text-gray-700" :
                    "text-gray-400"}`} title={step}>
                  {step}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          3. MAIN CONTENT (REVENUE GRAPH & TIMELINE)
      ════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 relative z-10">
        
        {/* BILLING WATERFALL — how much of the deal has been billed, and how
            much of that has actually landed. Each step is a subset of the one
            above it, so the shrinking bars read as one flow of money. */}
        <div className="lg:col-span-3 bg-white p-6 sm:p-8 rounded-xl border border-[#E7E4E3] shadow-sm flex flex-col h-[300px] text-left">
          <h3 className="text-sm font-semibold text-[#0E121B]">Billing Waterfall</h3>
          <p className="text-xs text-[#525866] mt-1">Deal value through to cash in hand.</p>

          {invoices.length === 0 && dealValue === 0 ? (
            <div className="flex-1 flex items-center justify-center text-[11px] font-medium text-gray-500">
              Nothing invoiced yet
            </div>
          ) : (
            <>
              <div className="flex-1 flex flex-col justify-center gap-3 mt-4">
                {billingSteps.map((s) => (
                  <div key={s.key}>
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-[11px] font-medium text-gray-500">{s.label}</span>
                      <span
                        className="text-[13px] font-semibold"
                        style={{ color: s.key === "value" ? "#111827" : s.color }}
                      >
                        {fmt(s.amount)}
                      </span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(100, s.pct)}%`, background: s.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* The gap nobody can see today: deal value never invoiced. */}
              <div className="mt-4 pt-3 border-t border-gray-100">
                {unbilled > 0 ? (
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: MONEY_OUTSTANDING }} />
                    <span className="text-[11px] text-gray-500">
                      <span className="font-semibold text-[#0E121B]">{fmt(unbilled)}</span> of this
                      deal is not invoiced yet
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: MONEY_COLLECTED }} />
                    <span className="text-[11px] text-gray-500">
                      {dealValue > 0 ? "Fully invoiced against deal value" : "No deal value set"}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[11px] text-gray-400">
                    {paidCount} of {invoices.length} invoice{invoices.length !== 1 ? "s" : ""} settled
                  </span>
                  {totalOutstanding > 0 && (
                    <span className="text-[11px] text-gray-400">
                      {fmt(pendingAmount)} pending
                      {overdueAmount > 0 && (
                        <span className="font-medium" style={{ color: MONEY_OVERDUE }}> · {fmt(overdueAmount)} overdue</span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
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
      {/* ═══════════════════════════════════════════════════════════════════
          5. INVOICE & REVENUE VISUALS
      ════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 relative z-0 items-stretch">

        {/* INVOICE AGING MATRIX (BAR CHART) */}
        <div className="bg-white p-6 rounded-xl border border-[#E7E4E3] shadow-sm flex flex-col text-left" style={{ minHeight: 300 }}>
          <h3 className="text-sm font-semibold text-[#0E121B] mb-3">Invoice Aging Matrix</h3>
          <div className="flex-1" style={{ minHeight: 220 }}>
            {invoiceAging ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={[
                    { name: "Paid",     count: invoiceAging.paid },
                    { name: "Not Due",  count: invoiceAging.notDue },
                    { name: "Due Soon", count: invoiceAging.dueSoon },
                    { name: "Overdue",  count: invoiceAging.overdue },
                  ]} 
                  layout="vertical"
                  margin={{ top: 8, right: 40, left: 8, bottom: 8 }}
                  barCategoryGap="20%"
                >
                  <CartesianGrid strokeDasharray="4 4" horizontal={false} vertical={true} stroke="#F0F0F0" />
                  <XAxis
                    type="number"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: "#9CA3AF" }}
                    tickFormatter={(v) => v === 0 ? "0" : v}
                    dy={4}
                    allowDecimals={false}
                    domain={[0, "auto"]}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: "#6B7280", fontWeight: 500 }}
                    width={64}
                  />
                  <Tooltip
                    cursor={{ fill: "#F9FAFB", rx: 4 }}
                    formatter={(value) => [value, "Invoices"]}
                    contentStyle={{ fontSize: 11, borderRadius: 6, border: "1px solid #E5E7EB", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                  />
                  <Bar dataKey="count" radius={[0, 5, 5, 0]} maxBarSize={22}>
                    <LabelList dataKey="count" position="right" style={{ fontSize: "12px", fontWeight: 700, fill: "#374151" }} />
                    {[
                      { fill: MONEY_COLLECTED },
                      { fill: MONEY_INVOICED },
                      { fill: MONEY_OUTSTANDING },
                      { fill: MONEY_OVERDUE },
                    ].map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} fillOpacity={0.9} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
               <div className="flex items-center justify-center h-full text-[11px] font-medium text-gray-500">No invoices found</div>
            )}
          </div>
        </div>

        {/* REVENUE COMPOSITION — one 100% composition bar showing the mix at a
            glance, then the line detail behind it (quantity and unit rate,
            both carried on items[] and shown nowhere else). Ranked progress
            bars wasted the card's height and hid the per-unit economics. */}
        <div className="bg-white p-6 rounded-xl border border-[#E7E4E3] shadow-sm flex flex-col text-left min-h-[300px]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[#0E121B]">Revenue Composition</h3>
              <p className="text-xs text-[#525866] mt-1">What this deal is billing for.</p>
            </div>
            {itemsTotal > 0 && (
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold text-[#0E121B] leading-none">{fmt(itemsTotal)}</p>
                <p className="text-[10px] text-gray-400 mt-1">
                  {topItems.length} line{topItems.length !== 1 ? "s" : ""}
                </p>
              </div>
            )}
          </div>

          {topItems.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-[11px] font-medium text-gray-500">
              No line items invoiced yet
            </div>
          ) : (
            <>
              {/* Composition bar — every item as one segment of the whole. */}
              <div className="flex h-7 w-full rounded-lg overflow-hidden mt-5 bg-gray-100">
                {topItems.map((item) => {
                  const share = itemsTotal > 0 ? (item.value / itemsTotal) * 100 : 0;
                  return (
                    <div
                      key={item.name}
                      title={`${item.name} · ${fmt(item.value)} · ${Math.round(share)}%`}
                      className="h-full flex items-center justify-center transition-all duration-700 hover:opacity-85"
                      style={{ width: `${share}%`, background: item.color }}
                    >
                      {share >= 12 && (
                        <span className="text-[10px] font-bold text-white">
                          {Math.round(share)}%
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Line detail — quantity and the effective per-unit rate after
                  any discount, which the composition bar alone can't carry. */}
              <div className="flex-1 mt-4">
                <div className="flex items-center gap-2 pb-1.5 mb-1 border-b border-gray-100">
                  <span className="flex-1 text-[9px] font-semibold tracking-wide text-gray-400 uppercase">
                    Item
                  </span>
                  <span className="w-8 text-right text-[9px] font-semibold tracking-wide text-gray-400 uppercase">
                    Qty
                  </span>
                  <span className="w-16 text-right text-[9px] font-semibold tracking-wide text-gray-400 uppercase">
                    Rate
                  </span>
                  <span className="w-16 text-right text-[9px] font-semibold tracking-wide text-gray-400 uppercase">
                    Value
                  </span>
                </div>

                <div className="space-y-1.5">
                  {topItems.map((item) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: item.color }}
                      />
                      <span
                        className="flex-1 min-w-0 text-[11px] text-gray-700 truncate"
                        title={item.name}
                      >
                        {item.name}
                      </span>
                      <span className="w-8 text-right text-[11px] text-gray-400">
                        {item.qty || "—"}
                      </span>
                      <span className="w-16 text-right text-[11px] text-gray-500">
                        {item.unitRate > 0 ? fmt(Math.round(item.unitRate)) : "—"}
                      </span>
                      <span className="w-16 text-right text-[11px] font-semibold text-[#0E121B]">
                        {fmt(item.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Concentration read — how exposed this deal is to one line. */}
              <div className="mt-auto pt-3 border-t border-gray-100 flex items-center gap-2">
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: topItems[0].color }}
                />
                <span className="text-[11px] text-gray-500 truncate">
                  <span className="font-semibold text-[#0E121B]">{topItems[0].name}</span> drives{" "}
                  {Math.round((topItems[0].value / itemsTotal) * 100)}% of billed value
                </span>
              </div>
            </>
          )}
        </div>

        {/* BILLING CADENCE — invoiced vs collected per month, with the running
            uncollected gap as a line on top. The only time axis on this page:
            the other cards all show a single frozen snapshot. */}
        <div className="bg-white p-6 rounded-xl border border-[#E7E4E3] shadow-sm flex flex-col text-left min-h-[300px]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[#0E121B]">Billing Cadence</h3>
              <p className="text-xs text-[#525866] mt-1">
                What was billed each month against what came in.
              </p>
            </div>
            <span className="text-[11px] text-gray-400 flex-shrink-0">By month</span>
          </div>

          {!cadence ? (
            <div className="flex-1 flex items-center justify-center text-[11px] font-medium text-gray-500">
              No invoices to chart yet
            </div>
          ) : (
            <>
              <div className="flex-1 mt-4" style={{ minHeight: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={cadence} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: "rgba(31, 31, 33, 0.56)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "rgba(31, 31, 33, 0.56)" }}
                      axisLine={false}
                      tickLine={false}
                      width={52}
                      tickFormatter={(v) => fmt(v)}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(99,102,241,0.06)" }}
                      formatter={(value, name) => [
                        fmt(value),
                        name === "invoiced" ? "Invoiced" : name === "collected" ? "Collected" : "Uncollected gap",
                      ]}
                      contentStyle={{
                        fontSize: 11,
                        borderRadius: 6,
                        border: "1px solid #E5E7EB",
                        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                      }}
                    />
                    <defs>
                      <linearGradient id="dcCadInvoiced" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={MONEY_INVOICED} />
                        <stop offset="100%" stopColor={MONEY_INVOICED} stopOpacity={0.55} />
                      </linearGradient>
                      <linearGradient id="dcCadCollected" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={MONEY_COLLECTED} />
                        <stop offset="100%" stopColor={MONEY_COLLECTED} stopOpacity={0.55} />
                      </linearGradient>
                    </defs>
                    <Bar dataKey="invoiced" fill="url(#dcCadInvoiced)" radius={[4, 4, 0, 0]} maxBarSize={26} />
                    <Bar dataKey="collected" fill="url(#dcCadCollected)" radius={[4, 4, 0, 0]} maxBarSize={26} />
                    <Line
                      type="monotone"
                      dataKey="gap"
                      stroke={MONEY_OUTSTANDING}
                      strokeWidth={2}
                      strokeDasharray="4 3"
                      dot={{ r: 3, fill: "#FFF", stroke: MONEY_OUTSTANDING, strokeWidth: 2 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 mt-2">
                {[
                  { c: MONEY_INVOICED, l: "Invoiced", bar: true },
                  { c: MONEY_COLLECTED, l: "Collected", bar: true },
                  { c: MONEY_OUTSTANDING, l: "Running uncollected", bar: false },
                ].map((g) => (
                  <span key={g.l} className="flex items-center gap-2">
                    {g.bar ? (
                      <span className="w-3 h-3 rounded-sm" style={{ background: g.c }} />
                    ) : (
                      <span className="w-3 border-t-2 border-dashed" style={{ borderColor: g.c }} />
                    )}
                    <span className="text-[11px]" style={{ color: "rgba(31, 31, 33, 0.56)" }}>
                      {g.l}
                    </span>
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          6. DEAL HEALTH — the closing read on the deal
      ════════════════════════════════════════════════════════════════════ */}
      <div className="relative z-0">

        {/* DEAL HEALTH — the closing read on the deal. Full width, so the arc
            and the factor breakdown sit side by side instead of stacking into
            a narrow column. */}
        <div className="bg-white p-6 sm:p-8 rounded-xl border border-[#E7E4E3] shadow-sm text-left">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[#0E121B]">Deal Health</h3>
              <p className="text-xs text-[#525866] mt-1">Five signals, weighted into one score.</p>
            </div>
            <span
              className="text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap flex-shrink-0"
              style={{ background: `${dealHealth.band.color}1A`, color: dealHealth.band.color }}
            >
              {dealHealth.band.label}
            </span>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-10 mt-6">
            {/* Score arc */}
            <div className="flex items-center gap-4 flex-shrink-0">
              <div className="relative w-[128px] h-[74px] flex-shrink-0">
                <svg viewBox="0 0 100 56" className="w-full h-full">
                  <defs>
                    <linearGradient id="dcHealthArc" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={dealHealth.band.color} stopOpacity="0.55" />
                      <stop offset="100%" stopColor={dealHealth.band.color} />
                    </linearGradient>
                  </defs>
                  <path
                    d="M 8 52 A 42 42 0 0 1 92 52"
                    fill="none"
                    stroke="#F1F1F5"
                    strokeWidth="9"
                    strokeLinecap="round"
                  />
                  <path
                    d="M 8 52 A 42 42 0 0 1 92 52"
                    fill="none"
                    stroke="url(#dcHealthArc)"
                    strokeWidth="9"
                    strokeLinecap="round"
                    strokeDasharray={`${(dealHealth.score / 100) * 132} 132`}
                    style={{ transition: "stroke-dasharray 700ms ease-out" }}
                  />
                </svg>
                <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
                  <span className="text-2xl font-bold text-[#0E121B] leading-none">
                    {dealHealth.score}
                  </span>
                  <span className="text-[10px] text-gray-400 mt-0.5">of 100</span>
                </div>
              </div>
              <p className="text-[11px] text-gray-500 leading-snug max-w-[180px]">
                Weighted across billing, collection, overdue debt, contact recency and
                open follow-ups.
              </p>
            </div>

            {/* Factor breakdown — two columns on wide screens so the card uses
                its width instead of running as one tall list. */}
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 lg:border-l lg:border-gray-100 lg:pl-10">
              {dealHealth.factors.map((f) => (
                <div key={f.key} title={f.hint}>
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <span className="text-[11px] font-medium text-gray-600 truncate">{f.label}</span>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">{f.detail}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${f.ratio * 100}%`,
                          background:
                            f.ratio >= 0.7
                              ? HEALTH_GOOD
                              : f.ratio >= 0.4
                              ? HEALTH_WARN
                              : HEALTH_BAD,
                        }}
                      />
                    </div>
                    <span className="w-9 flex-shrink-0 text-right text-[10px] font-semibold text-gray-500">
                      {Math.round(f.points)}/{f.weight}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BasicDetails;
