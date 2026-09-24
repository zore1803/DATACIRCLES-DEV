
import React, { useState, useEffect, useMemo } from "react";
import DealsTable from "./DealsTable";
import API from "../../services/api";
import toast from "react-hot-toast";
import {
  X,
  Check,
  Target,
  Plus,
  EyeOff,
  PhoneCall,
  CalendarDays,
  CheckSquare,
  StickyNote,
  Activity,
  Route,
  Settings,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import AppToaster from "../AppToaster";
import useContactLifecycleStore from "../../store/useContactLifecycleStore";
import EyeIcon from "../common/EyeIcon";
import EditIcon from "../common/EditIcon";
import ContactLifecycleDrawer from "./ContactLifecycleDrawer";

// ─────────────────────────────────────────────────────────────────────────────
// Shared meta for the four contact activity types. One place owns each type's
// label, accent color and icon so the trend chart, the engagement donut and the
// recent-activity timeline all read as one system.
// ─────────────────────────────────────────────────────────────────────────────
const TYPE_META = {
  call:    { label: "Calls",    color: "#0085FF", icon: PhoneCall },
  meeting: { label: "Meetings", color: "#8B5CF6", icon: CalendarDays },
  task:    { label: "Tasks",    color: "#F59E0B", icon: CheckSquare },
  note:    { label: "Notes",    color: "#10B981", icon: StickyNote },
};

const stripHtml = (html) => (html || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

const formatActivityTime = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  if (d.toDateString() === now.toDateString()) return `Today · ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday · ${time}`;
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${time}`;
};

// A small uppercase section heading, so every block below the KPI row shares
// the same typographic rhythm.
const SectionTitle = ({ icon: Icon, title, right }) => (
  <div className="flex items-center justify-between mb-3">
    <div className="flex items-center gap-2">
      {Icon && <Icon className="w-4 h-4 text-gray-400" />}
      <h3 className="text-[11px] font-semibold tracking-wide text-gray-500 uppercase">{title}</h3>
    </div>
    {right}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle Stage edit modal — the EXISTING contact lifecycle edit path, kept
// verbatim. The journey below is display-only; this modal (opened from the
// journey's small "Edit" affordance) remains the only way to change a contact's
// stage/status from this page, writing through the same
// /contacts/:id/lifecycle-stage endpoint as before.
// ─────────────────────────────────────────────────────────────────────────────
const LifecycleStageModal = ({ isOpen, onClose, contact, onUpdate }) => {
  const [selectedStage, setSelectedStage] = useState(contact.lifecycleStage || "Lead");
  const [selectedStatus, setSelectedStatus] = useState(contact.stageStatus || "New");
  const [isUpdating, setIsUpdating] = useState(false);

  const lifecycleStageOptions = useContactLifecycleStore((s) => s.lifecycleStageOptions);
  const allLifecycleStages = useContactLifecycleStore((s) => s.allLifecycleStages);
  const defaultStatusForStage = useContactLifecycleStore((s) => s.defaultStatusForStage);
  const fetchStages = useContactLifecycleStore((s) => s.fetchStages);

  useEffect(() => {
    fetchStages();
  }, [fetchStages]);

  useEffect(() => {
    setSelectedStage(contact.lifecycleStage || "Lead");
    setSelectedStatus(contact.stageStatus || "New");
  }, [contact.lifecycleStage, contact.stageStatus, isOpen]);

  const handleStageChange = (newStage) => {
    setSelectedStage(newStage);
    setSelectedStatus(defaultStatusForStage(newStage));
  };

  const handleSave = async () => {
    try {
      setIsUpdating(true);
      await API.put(`/contacts/${contact._id}/lifecycle-stage`, {
        lifecycleStage: selectedStage,
        stageStatus: selectedStatus,
      });
      onUpdate?.({ ...contact, lifecycleStage: selectedStage, stageStatus: selectedStatus });
      toast.success("Lifecycle stage updated!");
      onClose();
    } catch (error) {
      console.error("Failed to update lifecycle stage:", error);
      if (error.response?.status === 402) {
        toast.error(error.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(error.response?.data?.error || "Failed to update lifecycle stage");
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const [shouldRender, setShouldRender] = useState(false);
  const [showSlide, setShowSlide] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setTimeout(() => setShowSlide(true), 10);
    } else {
      setShowSlide(false);
      const timer = setTimeout(() => setShouldRender(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!shouldRender) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[10000] transition-opacity duration-300 ease-in-out"
        style={{ opacity: showSlide ? 1 : 0 }}
        onClick={onClose}
      />
      <div
        className={`fixed dc-panel-card z-[10001] dc-panel-w bg-white shadow-2xl flex flex-col overflow-hidden transform transition-transform duration-300 ease-in-out font-inter ${showSlide ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"}`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#D9D9D9] flex-shrink-0 bg-white gap-1">
          <h2 className="text-[15px] font-normal leading-6 text-[#78788D] uppercase tracking-wide">
            Update Lifecycle Stage
          </h2>
          <button
            onClick={onClose}
            className="w-5 h-5 flex items-center justify-center text-[#1C1B1F] hover:opacity-70 transition-opacity"
            aria-label="Close"
          >
            <X className="w-[18px] h-[18px]" strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="space-y-6">
            <div>
              <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Lifecycle Stage <span className="text-[#FF4935]">*</span>
              </label>
              <select
                value={selectedStage}
                onChange={(e) => handleStageChange(e.target.value)}
                className="w-full border border-[#1F2937]/10 rounded-lg px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:border-blue-500 transition-colors bg-white font-inter"
                disabled={isUpdating}
              >
                {allLifecycleStages.map((stage) => (
                  <option key={stage} value={stage}>{stage}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Status <span className="text-[#FF4935]">*</span>
              </label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full border border-[#1F2937]/10 rounded-lg px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:border-blue-500 transition-colors bg-white font-inter"
                disabled={isUpdating}
              >
                {lifecycleStageOptions[selectedStage]?.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-[#D9D9D9] bg-white flex justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            disabled={isUpdating}
            className="px-6 py-2 text-[#161618] bg-white border border-[#D9D9D9] hover:bg-gray-50 rounded-lg text-[13px] font-medium transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isUpdating}
            className="px-6 py-2 bg-[#158FFF] text-white rounded-lg text-[13px] font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isUpdating ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </button>
        </div>
      </div>
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle Journey — DISPLAY ONLY. Renders the organization-configured contact
// lifecycle stages (from useContactLifecycleStore, backed by Settings → Contact
// Lifecycle) as a connected horizontal journey. Stage nodes are not clickable;
// the only way to change a contact's stage from here is the small "Edit"
// affordance, which opens the existing LifecycleStageModal. No stage names are
// hardcoded, and the underlying lifecycle order/config is untouched.
// ─────────────────────────────────────────────────────────────────────────────
const LifecycleJourney = ({ contact, onContactUpdate }) => {
  const [showEdit, setShowEdit] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const allLifecycleStages = useContactLifecycleStore((s) => s.allLifecycleStages);
  const fetchStages = useContactLifecycleStore((s) => s.fetchStages);

  useEffect(() => {
    fetchStages();
  }, [fetchStages]);

  const currentIndex = Math.max(0, allLifecycleStages.indexOf(contact.lifecycleStage));

  // Build the visual journey: the configured main lifecycle stages, with the
  // contact's live `stageStatus` spliced in as a smaller sub-stage node right
  // after the current main stage. The sub-stage is DISPLAY ONLY — it is never
  // added to the configured stage list, and is skipped when it is empty or
  // would just duplicate the current stage's name.
  const currentStageName = allLifecycleStages[currentIndex] || "";
  const rawStatus = (contact.stageStatus || "").trim();
  const showSub =
    rawStatus.length > 0 &&
    rawStatus.toLowerCase() !== currentStageName.toLowerCase();

  const journeyNodes = [];
  allLifecycleStages.forEach((stage, i) => {
    journeyNodes.push({
      type: "main",
      label: stage,
      mainIndex: i,
      state: i < currentIndex ? "completed" : i === currentIndex ? "current" : "upcoming",
    });
    if (i === currentIndex && showSub) {
      journeyNodes.push({ type: "sub", label: rawStatus });
    }
  });

  // The "active frontier" is the sub-stage when shown, otherwise the current
  // main stage. Connectors up to (and including) it read as travelled/blue.
  let activeFlatIndex = 0;
  journeyNodes.forEach((n, j) => {
    if (n.type === "sub") activeFlatIndex = j;
    else if (n.type === "main" && n.mainIndex === currentIndex && !showSub) activeFlatIndex = j;
  });
  const lastFlatIndex = journeyNodes.length - 1;

  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-4">
      <SectionTitle
        icon={Route}
        title="Lifecycle Journey"
        right={
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-[11px] text-gray-400">Managed from Edit</span>
            <button
              type="button"
              onClick={() => setShowEdit(true)}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-gray-600 border border-gray-200 rounded-full hover:bg-gray-50 transition-colors"
            >
              <EditIcon className="w-3 h-3" />
              Edit
            </button>
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="flex items-center justify-center w-7 h-7 text-gray-400 border border-gray-200 rounded-full hover:bg-gray-50 hover:text-gray-600 transition-colors"
              title="Lifecycle Settings"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>
        }
      />

      <ContactLifecycleDrawer isOpen={showSettings} onClose={() => setShowSettings(false)} />

      {allLifecycleStages.length === 0 ? (
        <div className="text-xs text-gray-400 py-2">No lifecycle stages configured.</div>
      ) : (
        <>
          {/* One-shot, non-looping motion for the sub-stage node when it (re)mounts
              after an Edit/save. Color/position changes on the other nodes animate
              via Tailwind `transition-all`. */}
          <style>{`
            @keyframes dcSubIn {
              from { opacity: 0; transform: translateY(4px) scale(0.94); }
              to   { opacity: 1; transform: translateY(0)    scale(1); }
            }
          `}</style>
          <div className="flex items-start pt-6 pb-1">
            {journeyNodes.map((node, j) => {
              const isSub = node.type === "sub";
              const isCurrent = node.type === "main" && node.state === "current";
              const isCompleted = node.type === "main" && node.state === "completed";
              const isNext = node.type === "main" && node.mainIndex === currentIndex + 1;

              // Connector halves centered on the card band (top-[26px]). The half
              // leading INTO the active frontier gets a soft glow.
              const leftActive = j <= activeFlatIndex && j > 0;
              const rightActive = j < activeFlatIndex;
              const isCurrentTransition = j === activeFlatIndex && j > 0;

              return (
                <div
                  key={`${node.type}-${node.label}-${j}`}
                  className={`${isSub ? "flex-[0.75]" : "flex-1"} min-w-0 flex flex-col items-center relative`}
                >
                  {/* Connector lines */}
                  {j > 0 && (
                    <span
                      className={`absolute top-[26px] left-0 right-1/2 h-0.5 transition-colors duration-500 ${
                        leftActive ? "bg-[#0085FF]" : "bg-gray-200"
                      } ${isCurrentTransition ? "shadow-[0_0_6px_rgba(0,133,255,0.55)]" : ""}`}
                    />
                  )}
                  {j < lastFlatIndex && (
                    <span
                      className={`absolute top-[26px] left-1/2 right-0 h-0.5 transition-colors duration-500 ${
                        rightActive ? "bg-[#0085FF]" : "bg-gray-200"
                      }`}
                    />
                  )}

                  {/* "Next step" tag above the immediate upcoming main stage */}
                  {isNext && (
                    <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-medium text-gray-400 whitespace-nowrap">
                      Next step
                    </span>
                  )}

                  {/* Card band — fixed 52px so connectors stay aligned across
                      main and (shorter) sub cards */}
                  <div className="h-[52px] w-full flex items-center justify-center">
                    {isSub ? (
                      // Current sub-stage: a smaller, blue-tinted node, subordinate
                      // to the current main stage.
                      <div
                        className="relative z-10 h-[38px] w-[90%] px-2.5 rounded-lg flex items-center gap-1.5 bg-blue-50 border border-[#0085FF]/40"
                        style={{ animation: "dcSubIn 500ms ease-out" }}
                        title={node.label}
                      >
                        <span className="flex-shrink-0 w-4 h-4 rounded-full bg-[#0085FF]/15 flex items-center justify-center">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#0085FF]" />
                        </span>
                        <span className="text-[11px] font-semibold text-[#0085FF] leading-tight truncate">
                          {node.label}
                        </span>
                      </div>
                    ) : (
                      // Main lifecycle stage node
                      <div
                        className={`relative z-10 h-[52px] w-[90%] px-3 rounded-xl flex items-center gap-2 transition-all duration-500
                          ${isCurrent
                            ? "bg-[#0085FF] shadow-md shadow-blue-200 ring-4 ring-blue-100"
                            : isCompleted
                              ? "bg-white border border-[#0085FF]/30"
                              : "bg-gray-50 border border-gray-200"}`}
                      >
                        <span
                          className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center
                            ${isCurrent ? "bg-white/25" : isCompleted ? "bg-[#0085FF]" : "bg-white border border-gray-200"}`}
                        >
                          {isCompleted ? (
                            <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                          ) : isCurrent ? (
                            <span className="w-2 h-2 rounded-full bg-white" />
                          ) : (
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                          )}
                        </span>
                        <span
                          className={`text-xs font-semibold leading-tight truncate
                            ${isCurrent ? "text-white" : isCompleted ? "text-gray-900" : "text-gray-400"}`}
                          title={node.label}
                        >
                          {node.label}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Contextual labels — real data only. The current main stage
                      reads "Current stage"; the spliced sub-node reads "Status",
                      so the two form one coherent pair instead of two competing
                      "current" labels. */}
                  {isCurrent && (
                    <span className="mt-1.5 text-[10px] font-semibold text-[#0085FF] text-center leading-tight">
                      Current stage
                    </span>
                  )}
                  {isSub && (
                    <span className="mt-1.5 text-[10px] font-medium text-gray-400 text-center leading-tight">
                      Status
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <LifecycleStageModal
        isOpen={showEdit}
        onClose={() => setShowEdit(false)}
        contact={contact}
        onUpdate={onContactUpdate}
      />
    </div>
  );
};

// A compact tooltip for the recharts area chart.
const TrendTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-medium text-gray-900 mb-1">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-gray-600">{TYPE_META[p.dataKey]?.label || p.dataKey}</span>
          <span className="ml-auto font-medium text-gray-900">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Engagement Overview — Activity Trend (left) + Engagement Mix (right), built
// entirely from the contact's real Call / Meeting / Task / Note records. Series
// and donut slices only appear for types that actually have data; if there is
// no activity at all, each side falls back to a compact empty block instead of
// drawing a fake chart.
// ─────────────────────────────────────────────────────────────────────────────
const EngagementOverview = ({ activity, loading }) => {
  const { calls, meetings, tasks, notes } = activity;

  const totals = useMemo(
    () => ({
      call: calls.length,
      meeting: meetings.length,
      task: tasks.length,
      note: notes.length,
    }),
    [calls, meetings, tasks, notes]
  );

  const activeTypes = Object.keys(TYPE_META).filter((t) => totals[t] > 0);
  const grandTotal = activeTypes.reduce((s, t) => s + totals[t], 0);

  // Weekly buckets over the last 4 weeks, oldest → newest.
  const trendData = useMemo(() => {
    const now = Date.now();
    const week = 7 * 24 * 60 * 60 * 1000;
    const labels = ["3 wks ago", "2 wks ago", "Last week", "This week"];
    const buckets = labels.map((name) => ({ name, call: 0, meeting: 0, task: 0, note: 0 }));

    const add = (dateVal, type) => {
      if (!dateVal) return;
      const t = new Date(dateVal).getTime();
      if (Number.isNaN(t)) return;
      const weeksAgo = Math.floor((now - t) / week);
      if (weeksAgo >= 0 && weeksAgo < 4) buckets[3 - weeksAgo][type] += 1;
    };

    calls.forEach((c) => add(c.createdAt, "call"));
    meetings.forEach((m) => add(m.scheduledAt || m.createdAt, "meeting"));
    tasks.forEach((t) => add(t.createdAt, "task"));
    notes.forEach((n) => add(n.createdAt, "note"));
    return buckets;
  }, [calls, meetings, tasks, notes]);

  const trendSeries = activeTypes.filter((t) => trendData.some((b) => b[t] > 0));
  // When nothing has been logged yet we still draw the chart frame — all four
  // series flat at zero — so the axes, gridlines and legend are visible and it's
  // clear what will populate here once activity exists.
  const allTypes = Object.keys(TYPE_META);
  const displaySeries = trendSeries.length ? trendSeries : allTypes;
  const hasTrend = trendSeries.length > 0;
  const mixData = activeTypes.map((t) => ({ key: t, name: TYPE_META[t].label, value: totals[t], color: TYPE_META[t].color }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* LEFT: Activity Trend */}
      <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl px-4 py-4">
        <SectionTitle
          icon={Activity}
          title="Activity Trend"
          right={<span className="text-[11px] text-gray-400">Last 4 weeks</span>}
        />
        {loading ? (
          <div className="h-[200px] flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="relative h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                  <defs>
                    {displaySeries.map((t) => (
                      <linearGradient key={t} id={`grad-${t}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={TYPE_META[t].color} stopOpacity={0.25} />
                        <stop offset="100%" stopColor={TYPE_META[t].color} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F1F5" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "#9CA3AF" }}
                    axisLine={false}
                    tickLine={false}
                    width={28}
                    domain={[0, (max) => (max <= 0 ? 4 : max)]}
                  />
                  {hasTrend && <Tooltip content={<TrendTooltip />} />}
                  {displaySeries.map((t) => (
                    <Area
                      key={t}
                      type="monotone"
                      dataKey={t}
                      stroke={TYPE_META[t].color}
                      strokeWidth={2}
                      fill={`url(#grad-${t})`}
                      dot={false}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
              {!hasTrend && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-xs text-gray-400 bg-white/70 px-2 py-0.5 rounded">No activity in the last 4 weeks yet</span>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
              {displaySeries.map((t) => (
                <div key={t} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: TYPE_META[t].color }} />
                  <span className="text-[11px] text-gray-500">{TYPE_META[t].label}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* RIGHT: Engagement Mix */}
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-4 flex flex-col h-full">
        <SectionTitle title="Engagement Mix" />
        {loading ? (
          <div className="flex-1 flex items-center justify-center min-h-[200px]">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          // When there's no engagement yet we still draw the ring — a single
          // muted placeholder slice — and list all four categories at 0, so the
          // chart's shape is visible before any activity is logged.
          <div className="flex-1 flex flex-col items-center justify-center gap-6 min-h-[200px]">
            <div className="relative w-[140px] h-[140px] flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={grandTotal === 0 ? [{ key: "none", value: 1, color: "#EEF0F3" }] : mixData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={65}
                    paddingAngle={grandTotal > 0 && mixData.length > 1 ? 2 : 0}
                    stroke="none"
                    isAnimationActive={grandTotal > 0}
                  >
                    {(grandTotal === 0 ? [{ key: "none", color: "#EEF0F3" }] : mixData).map((d) => (
                      <Cell key={d.key} fill={d.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-bold text-gray-900 leading-none">{grandTotal}</span>
                <span className="text-xs text-gray-400 mt-1">total</span>
              </div>
            </div>
            <div className="w-full flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
              {allTypes.map((t) => (
                <div key={t} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: TYPE_META[t].color }} />
                  <span className="text-xs text-gray-600 truncate">{TYPE_META[t].label}</span>
                  <span className="text-xs font-semibold text-gray-900">{totals[t]}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Recent Activity — a compact chronological timeline merged from the contact's
// real Call / Note / Meeting / Task records, most recent first. Descriptions
// come straight from the records; nothing is fabricated.
// ─────────────────────────────────────────────────────────────────────────────
const ACTIVITY_TABS = ["All", "Calls", "Meetings", "Tasks", "Notes"];
const TAB_TO_TYPE = { Calls: "call", Meetings: "meeting", Tasks: "task", Notes: "note" };

const RecentActivity = ({ activity, loading }) => {
  const { calls, meetings, tasks, notes } = activity;
  const [filter, setFilter] = useState("All");

  const items = useMemo(() => {
    const merged = [
      ...calls.map((c) => ({
        type: "call",
        title: `${c.callType || "Call"}${c.status ? ` · ${c.status}` : ""}`,
        desc: stripHtml(c.notes),
        date: c.createdAt,
      })),
      ...notes.map((n) => ({
        type: "note",
        title: n.title || "Note added",
        desc: stripHtml(n.note || n.content || n.body),
        date: n.createdAt,
      })),
      ...meetings.map((m) => ({
        type: "meeting",
        title: m.title || m.subject || "Meeting",
        desc: "",
        date: m.scheduledAt || m.createdAt,
      })),
      ...tasks.map((t) => ({
        type: "task",
        title: t.title || "Task",
        desc: t.status ? t.status : "",
        date: t.createdAt,
      })),
    ].filter((a) => a.date);
    return merged.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [calls, meetings, tasks, notes]);

  const filteredItems = useMemo(() => {
    const base = filter === "All" ? items : items.filter((i) => i.type === TAB_TO_TYPE[filter]);
    return base.slice(0, 8);
  }, [items, filter]);

  return (
    <div className="h-[267px] flex flex-col bg-white border border-gray-200 rounded-lg p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-5 flex-shrink-0">Activity Timeline</h3>
      <div className="flex items-center gap-1 mb-4 flex-wrap flex-shrink-0">
        {ACTIVITY_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${filter === tab
              ? "bg-[#0085FF] text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="space-y-3 overflow-y-auto flex-1 pr-2 -mr-2">
        {loading ? (
          <div className="py-8 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredItems.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No recent activity.</p>
        ) : (
          filteredItems.map((item, i) => {
            const meta = TYPE_META[item.type];
            const Icon = meta.icon;
            return (
              <div key={i} className="flex items-start gap-2.5">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: `${meta.color}1A` }}
                >
                  <Icon style={{ width: 13, height: 13, color: meta.color }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-gray-900 truncate">{item.title}</p>
                  <p className="text-[11px] text-gray-400">{formatActivityTime(item.date)}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

const LoadingBlock = () => (
  <div className="h-[132px] flex items-center justify-center">
    <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Communication Effectiveness — segmented horizontal bars for the last 30 days:
// call outcomes (Connected vs Missed) and meeting outcomes (Completed vs
// Upcoming), plus the single most recent interaction. All derived from the
// contact's real Call / Meeting records; nothing is fabricated.
// ─────────────────────────────────────────────────────────────────────────────
const SegmentedBar = ({ segments }) => {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  return (
    <div className="flex h-2.5 w-full rounded-full bg-gray-100 overflow-hidden">
      {total > 0 &&
        segments.map((seg, i) =>
          seg.value > 0 ? (
            <div
              key={i}
              className="h-full transition-all duration-500"
              style={{ width: `${(seg.value / total) * 100}%`, background: seg.color }}
            />
          ) : null
        )}
    </div>
  );
};

const CommunicationOverview = ({ activity, loading }) => {
  const { calls, meetings } = activity;
  const now = Date.now();
  const windowStart = now - 30 * 24 * 60 * 60 * 1000; // last 30 days

  const inWindow = (d) => {
    if (!d) return false;
    const t = new Date(d).getTime();
    return !Number.isNaN(t) && t >= windowStart && t <= now + 365 * 24 * 60 * 60 * 1000;
  };

  // Calls (last 30 days) — Connected vs everything else (Missed / No Answer / VM).
  const recentCalls = calls.filter((c) => {
    const t = c.createdAt ? new Date(c.createdAt).getTime() : NaN;
    return !Number.isNaN(t) && t >= windowStart && t <= now;
  });
  const callAttempts = recentCalls.length;
  const connected = recentCalls.filter((c) => c.status === "Connected").length;
  const missed = callAttempts - connected;

  // Meetings (last 30 days + upcoming) — Completed vs Upcoming (scheduled).
  const recentMeetings = meetings.filter((m) => inWindow(m.scheduledAt || m.createdAt));
  const meetingsCompleted = recentMeetings.filter((m) => m.status === "completed").length;
  const meetingsUpcoming = recentMeetings.filter((m) => m.status === "scheduled").length;
  const meetingsTotal = meetingsCompleted + meetingsUpcoming;

  // Most recent past interaction — a call (callType · status) or a meeting.
  const lastInteraction = useMemo(() => {
    const items = [
      ...calls
        .filter((c) => c.createdAt && new Date(c.createdAt).getTime() <= now)
        .map((c) => ({
          date: c.createdAt,
          icon: PhoneCall,
          label: `${c.callType || "Call"}${c.status ? ` · ${c.status}` : ""}`,
        })),
      ...meetings
        .filter((m) => (m.scheduledAt || m.createdAt) && new Date(m.scheduledAt || m.createdAt).getTime() <= now)
        .map((m) => ({
          date: m.scheduledAt || m.createdAt,
          icon: CalendarDays,
          label: m.title || m.subject || "Meeting",
        })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date));
    return items[0] || null;
  }, [calls, meetings, now]);

  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-4">
      <SectionTitle
        icon={PhoneCall}
        title="Communication Effectiveness"
        right={<span className="text-[11px] text-gray-400">Last 30 days</span>}
      />
      {loading ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-4">
          {/* Calls */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-xs font-semibold text-gray-700">Calls</span>
              <span className="text-[11px] text-gray-400">
                {callAttempts} attempt{callAttempts !== 1 ? "s" : ""}
              </span>
            </div>
            <SegmentedBar
              segments={[
                { value: connected, color: "#0085FF" },
                { value: missed, color: "#EF4444" },
              ]}
            />
            <div className="flex items-center gap-4 mt-1.5">
              <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
                <span className="w-2 h-2 rounded-full bg-[#0085FF]" />
                {connected} Connected
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
                <span className="w-2 h-2 rounded-full bg-[#EF4444]" />
                {missed} Missed
              </span>
            </div>
          </div>

          {/* Meetings */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-xs font-semibold text-gray-700">Meetings</span>
              <span className="text-[11px] text-gray-400">{meetingsTotal} total</span>
            </div>
            <SegmentedBar
              segments={[
                { value: meetingsCompleted, color: "#8B5CF6" },
                { value: meetingsUpcoming, color: "#C4B5FD" },
              ]}
            />
            <div className="flex items-center gap-4 mt-1.5">
              <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
                <span className="w-2 h-2 rounded-full bg-[#8B5CF6]" />
                {meetingsCompleted} Completed
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
                <span className="w-2 h-2 rounded-full bg-[#C4B5FD]" />
                {meetingsUpcoming} Upcoming
              </span>
            </div>
          </div>

          {/* Last interaction */}
          <div className="border-t border-gray-100 pt-3">
            <p className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase mb-1.5">
              Last interaction
            </p>
            {lastInteraction ? (
              <div className="flex items-center gap-2">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[#0085FF]/10 flex items-center justify-center">
                  <lastInteraction.icon className="w-3.5 h-3.5 text-[#0085FF]" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-900 truncate">{lastInteraction.label}</p>
                  <p className="text-[11px] text-gray-400">{formatActivityTime(lastInteraction.date)}</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400">No interactions yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Task & Follow-up Overview — horizontal status bars (Completed / Pending /
// Overdue) plus, when they exist, a short list of upcoming follow-ups (future
// meetings and open tasks with a due date). All from the contact's real Task /
// Meeting records. Overdue = an open task whose dueDate is in the past.
// ─────────────────────────────────────────────────────────────────────────────
const TaskFollowUp = ({ activity, loading }) => {
  const { tasks, meetings } = activity;
  const now = Date.now();

  const completed = tasks.filter((t) => t.status === "Completed").length;
  const overdue = tasks.filter(
    (t) => t.status !== "Completed" && t.dueDate && new Date(t.dueDate).getTime() < now
  ).length;
  const pending = tasks.length - completed - overdue;
  const total = tasks.length;

  const bars = [
    { label: "Completed", value: completed, color: "#10B981" },
    { label: "Pending", value: pending, color: "#F59E0B" },
    { label: "Overdue", value: overdue, color: "#EF4444" },
  ];

  // Upcoming follow-ups: future meetings + open tasks with a future due date,
  // soonest first.
  const upcoming = useMemo(() => {
    const items = [
      ...meetings
        .filter((m) => m.scheduledAt && new Date(m.scheduledAt).getTime() > now)
        .map((m) => ({
          date: m.scheduledAt,
          title: m.title || m.subject || "Meeting",
          meta: new Date(m.scheduledAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
        })),
      ...tasks
        .filter((t) => t.status !== "Completed" && t.dueDate && new Date(t.dueDate).getTime() > now)
        .map((t) => ({ date: t.dueDate, title: t.title || "Task", meta: "Task" })),
    ]
      .filter((i) => i.date)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 3);
    return items;
  }, [tasks, meetings, now]);

  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-4">
      <SectionTitle icon={CheckSquare} title="Task & Follow-up" />
      {loading ? (
        <LoadingBlock />
      ) : (
        <>
          {/* Horizontal status bars — always shown, even at zero, so the section
              keeps its shape as an empty state. */}
          <div className="space-y-2.5">
            {bars.map((b) => (
              <div key={b.label} className="flex items-center gap-3">
                <span className="w-[70px] flex-shrink-0 text-[11px] text-gray-500">{b.label}</span>
                <div className="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${total > 0 ? (b.value / total) * 100 : 0}%`, background: b.color }}
                  />
                </div>
                <span className="w-5 flex-shrink-0 text-right text-xs font-semibold text-gray-900">{b.value}</span>
              </div>
            ))}
          </div>

          {total === 0 && (
            <p className="mt-3 text-[11px] text-gray-400 text-center">No tasks yet.</p>
          )}

          {/* Upcoming follow-ups (only when data exists) */}
          {upcoming.length > 0 && (
            <div className="mt-4 border-t border-gray-100 pt-3">
              <p className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase mb-2">
                Upcoming follow-ups
              </p>
              <div className="space-y-2">
                {upcoming.map((item, i) => {
                  const d = new Date(item.date);
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="w-[52px] flex-shrink-0 text-[11px] font-medium text-gray-700">
                        {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                      <span className="flex-1 min-w-0 text-xs text-gray-700 truncate">{item.title}</span>
                      <span className="flex-shrink-0 text-[11px] text-gray-400">{item.meta}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

const BasicDetails = ({ contact, company, allCompanies = [], deals, contactFieldList = [], onContactUpdate, onDealCreated, onFieldsChanged }) => {
  // Real contact activity, fetched here (the same per-type endpoints the
  // Call Logs / Notes / Tasks / Meetings tabs use) to back the Engagement
  // Overview and Recent Activity sections. Failures degrade to empty lists so
  // one bad endpoint can't blank the whole overview.
  const [activity, setActivity] = useState({ calls: [], meetings: [], tasks: [], notes: [] });
  const [activityLoading, setActivityLoading] = useState(true);

  useEffect(() => {
    if (!contact?._id) return;
    let cancelled = false;
    setActivityLoading(true);
    Promise.all([
      API.get(`/call-logs/contact/${contact._id}`).catch(() => ({ data: [] })),
      API.get(`/tasks/contact/${contact._id}`).catch(() => ({ data: [] })),
      API.get("/meetings", { params: { contactId: contact._id } }).catch(() => ({ data: {} })),
      API.get(`/notes/contact/${contact._id}`).catch(() => ({ data: [] })),
    ])
      .then(([callR, taskR, meetR, noteR]) => {
        if (cancelled) return;
        const calls = Array.isArray(callR.data) ? callR.data : [];
        const tasksList = Array.isArray(taskR.data) ? taskR.data : [];
        const meetRaw = meetR.data?.meetings ?? meetR.data;
        const meetings = Array.isArray(meetRaw) ? meetRaw : [];
        const noteRaw = noteR.data?.notes ?? noteR.data;
        const notes = Array.isArray(noteRaw) ? noteRaw : [];
        setActivity({ calls, meetings, tasks: tasksList, notes });
      })
      .finally(() => {
        if (!cancelled) setActivityLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [contact?._id]);

  return (
    <div className="space-y-4">
      <AppToaster />

      {/* 1. Lifecycle Journey (display only) */}
      <LifecycleJourney contact={contact} onContactUpdate={onContactUpdate} />

      {/* 2. Engagement Overview */}
      <EngagementOverview activity={activity} loading={activityLoading} />

      {/* 3. Activity Timeline */}
      <RecentActivity activity={activity} loading={activityLoading} />

      {/* 4. Communication Overview + Task & Follow-up */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CommunicationOverview activity={activity} loading={activityLoading} />
        <TaskFollowUp activity={activity} loading={activityLoading} />
      </div>

      {/* 5. Associated Deals */}
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-4">
        <SectionTitle
          icon={Target}
          title="Associated Deals"
          right={
            <span className="text-[11px] text-gray-400">
              {deals?.length || 0} deal{deals?.length !== 1 ? "s" : ""}
            </span>
          }
        />
        <DealsTable deals={deals || []} contact={contact} company={company} allCompanies={allCompanies} onDealCreated={onDealCreated} />
      </div>
    </div>
  );
};

export default BasicDetails;
