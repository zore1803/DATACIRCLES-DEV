
import React, { useState, useEffect, useMemo } from "react";
import DealsTable from "./DealsTable";
import API from "../../services/api";
import toast from "react-hot-toast";
import {
  X,
  Check,
  PhoneCall,
  CalendarDays,
  CheckSquare,
  StickyNote,
  Activity,
  Route,
  Clock,
  TrendingUp,
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  RadialBarChart,
  RadialBar,
} from "recharts";
import AppToaster from "../AppToaster";
import useContactLifecycleStore from "../../store/useContactLifecycleStore";
import EyeIcon from "../common/EyeIcon";
import EditIcon from "../common/EditIcon";
import PlusIcon from "../common/PlusIcon";
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
// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle Journey — an interactive chevron track built from the organization-
// configured contact lifecycle stages (useContactLifecycleStore, backed by
// Settings → Contact Lifecycle). Stage names are never hardcoded and the
// configured order is untouched. Hovering a stage surfaces its position in the
// journey; clicking any stage opens the existing LifecycleStageModal, so every
// write still goes through the same /contacts/:id/lifecycle-stage endpoint as
// before.
// ─────────────────────────────────────────────────────────────────────────────
const daysBetween = (from, to = Date.now()) => {
  if (!from) return null;
  const t = new Date(from).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((to - t) / 86400000));
};

const LifecycleJourney = ({ contact, onContactUpdate }) => {
  const [showEdit, setShowEdit] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [hovered, setHovered] = useState(null);
  const allLifecycleStages = useContactLifecycleStore((s) => s.allLifecycleStages);
  const fetchStages = useContactLifecycleStore((s) => s.fetchStages);

  useEffect(() => {
    fetchStages();
  }, [fetchStages]);

  const total = allLifecycleStages.length;
  const currentIndex = Math.max(0, allLifecycleStages.indexOf(contact.lifecycleStage));
  const currentStageName = allLifecycleStages[currentIndex] || "";
  const rawStatus = (contact.stageStatus || "").trim();
  const showStatus =
    rawStatus.length > 0 && rawStatus.toLowerCase() !== currentStageName.toLowerCase();

  // Progress across the configured journey. The current stage counts as
  // reached, so a contact sitting on the final stage reads 100%.
  const progressPct = total > 0 ? Math.round(((currentIndex + 1) / total) * 100) : 0;

  const ageDays = daysBetween(contact.createdAt);
  // `updatedAt` is the closest real signal available — the schema keeps no
  // per-stage history, so this is labelled as last movement on the record
  // rather than claimed as time-in-stage.
  const sinceMoveDays = daysBetween(contact.updatedAt);

  return (
    <div className="bg-white border border-[#E1E4EA] rounded-xl px-5 py-4">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Route className="w-4 h-4 text-gray-400" />
            <h3 className="text-sm font-semibold text-[#0E121B]">Lifecycle Journey</h3>
          </div>
          <p className="text-xs text-[#525866] mt-1">
            {total > 0
              ? `Stage ${currentIndex + 1} of ${total} · ${progressPct}% through the configured journey`
              : "No lifecycle stages configured."}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="hidden sm:inline text-[11px] text-gray-400">Managed from Edit</span>
          <button
            type="button"
            onClick={() => setShowEdit(true)}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-gray-600 border border-[#E1E4EA] rounded-full hover:bg-gray-50 transition-colors"
          >
            <EditIcon className="w-3 h-3" />
            Edit
          </button>
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-[#0085FF] hover:bg-blue-600 text-white transition-colors flex-shrink-0"
            title="Lifecycle Settings"
            aria-label="Lifecycle settings"
          >
            <PlusIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      <ContactLifecycleDrawer isOpen={showSettings} onClose={() => setShowSettings(false)} />

      {total === 0 ? (
        <div className="text-xs text-gray-400 py-2">No lifecycle stages configured.</div>
      ) : (
        <>
          <style>{`
            @keyframes dcPulseRing {
              0%   { box-shadow: 0 0 0 0 rgba(0,133,255,0.32); }
              70%  { box-shadow: 0 0 0 7px rgba(0,133,255,0); }
              100% { box-shadow: 0 0 0 0 rgba(0,133,255,0); }
            }
            @keyframes dcRailFill { from { width: 0%; } }
          `}</style>

          {/* Progress rail — one continuous read of how far along the contact
              is, independent of how many stages the org has configured. */}
          <div className="relative h-1.5 w-full rounded-full bg-[#F1F1F5] overflow-hidden mb-4">
            <div
              className="h-full rounded-full"
              style={{
                width: `${progressPct}%`,
                background: "linear-gradient(90deg, #0085FF 0%, #48A9FF 100%)",
                animation: "dcRailFill 700ms ease-out",
              }}
            />
          </div>

          {/* Chevron track. Each stage is a notched segment so the track reads
              as directional flow rather than a row of detached buttons. */}
          <div className="flex items-stretch gap-1 w-full">
            {allLifecycleStages.map((stage, i) => {
              const isDone = i < currentIndex;
              const isCurrent = i === currentIndex;
              const isHovered = hovered === i;
              const isFirst = i === 0;
              const isLast = i === total - 1;

              const notch = 12;
              const clip = isFirst
                ? `polygon(0 0, calc(100% - ${notch}px) 0, 100% 50%, calc(100% - ${notch}px) 100%, 0 100%)`
                : isLast
                ? `polygon(0 0, 100% 0, 100% 100%, 0 100%, ${notch}px 50%)`
                : `polygon(0 0, calc(100% - ${notch}px) 0, 100% 50%, calc(100% - ${notch}px) 100%, 0 100%, ${notch}px 50%)`;

              return (
                <button
                  key={`${stage}-${i}`}
                  type="button"
                  onClick={() => setShowEdit(true)}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  title={`${stage} · stage ${i + 1} of ${total}`}
                  className="flex-1 min-w-0 text-left focus:outline-none"
                  style={{ clipPath: clip }}
                >
                  <div
                    className={`h-[54px] flex items-center gap-2 transition-all duration-300 ${
                      isFirst ? "pl-3.5 pr-4" : "pl-5 pr-4"
                    } ${
                      isCurrent
                        ? "bg-[#0085FF]"
                        : isDone
                        ? "bg-[#E8F3FF]"
                        : isHovered
                        ? "bg-[#F1F1F5]"
                        : "bg-[#F7F8FA]"
                    }`}
                    style={isCurrent ? { animation: "dcPulseRing 2.4s ease-out infinite" } : undefined}
                  >
                    <span
                      className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
                        isCurrent
                          ? "bg-white/25"
                          : isDone
                          ? "bg-[#0085FF]"
                          : "bg-white border border-[#E1E4EA]"
                      }`}
                    >
                      {isDone ? (
                        <Check className="w-3 h-3 text-white" strokeWidth={3} />
                      ) : isCurrent ? (
                        <span className="w-1.5 h-1.5 rounded-full bg-white" />
                      ) : (
                        <span className="text-[9px] font-semibold text-gray-400">{i + 1}</span>
                      )}
                    </span>
                    <span className="min-w-0">
                      <span
                        className={`block text-xs font-semibold leading-tight truncate ${
                          isCurrent ? "text-white" : isDone ? "text-[#0E121B]" : "text-gray-400"
                        }`}
                      >
                        {stage}
                      </span>
                      <span
                        className={`block text-[10px] leading-tight truncate ${
                          isCurrent ? "text-white/75" : "text-gray-400"
                        }`}
                      >
                        {isCurrent ? "Current stage" : isDone ? "Completed" : `Step ${i + 1}`}
                      </span>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Footer facts — every value below comes off the contact record
              itself, so the block stays honest when a field is missing. */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-4 pt-3 border-t border-[#E1E4EA]">
            {showStatus && (
              <span className="flex items-center gap-2">
                <span className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">
                  Status
                </span>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#E8F3FF] border border-[#0085FF]/25">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0085FF]" />
                  <span className="text-[11px] font-semibold text-[#0085FF]">{rawStatus}</span>
                </span>
              </span>
            )}
            {ageDays !== null && (
              <span className="text-[11px] text-[#525866]">
                Contact age <span className="font-semibold text-[#0E121B]">{ageDays}d</span>
              </span>
            )}
            {sinceMoveDays !== null && (
              <span className="text-[11px] text-[#525866]">
                Last updated{" "}
                <span className="font-semibold text-[#0E121B]">
                  {sinceMoveDays === 0 ? "today" : `${sinceMoveDays}d ago`}
                </span>
              </span>
            )}
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

// A compact tooltip shared by the pulse chart. Series keys map back through
// TYPE_META so the labels match the legend and the timeline below.
const PulseTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.dataKey !== "total" && p.value > 0);
  const total = payload.find((p) => p.dataKey === "total")?.value ?? 0;
  return (
    <div className="bg-white border border-gray-200 rounded-md shadow-lg px-3 py-2 text-xs">
      <p className="font-medium text-gray-900 mb-1">{label}</p>
      {rows.length === 0 ? (
        <p className="text-gray-400">No activity</p>
      ) : (
        rows.map((p) => (
          <div key={p.dataKey} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color || p.fill }} />
            <span className="text-gray-600">{TYPE_META[p.dataKey]?.label || p.dataKey}</span>
            <span className="ml-auto font-medium text-gray-900">{p.value}</span>
          </div>
        ))
      )}
      <div className="flex items-center gap-2 mt-1 pt-1 border-t border-gray-100">
        <span className="text-gray-500">Total</span>
        <span className="ml-auto font-semibold text-gray-900">{total}</span>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Relationship Pulse — 12 weeks of the contact's real Call / Meeting / Task /
// Note records as stacked weekly columns, with a momentum line tracing the
// weekly total on top. Answers "is this relationship warming or cooling", which
// a flat 4-week area chart could not. Nothing is fabricated: a week with no
// records is a genuine zero column.
// ─────────────────────────────────────────────────────────────────────────────
const RelationshipPulse = ({ activity, loading }) => {
  const { calls, meetings, tasks, notes } = activity;
  const WEEKS = 12;

  const { data, grandTotal, last4, prev4 } = useMemo(() => {
    const now = Date.now();
    const week = 7 * 86400000;
    const buckets = Array.from({ length: WEEKS }, (_, i) => {
      const weeksAgo = WEEKS - 1 - i;
      const d = new Date(now - weeksAgo * week);
      return {
        name:
          weeksAgo === 0
            ? "This wk"
            : d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        call: 0,
        meeting: 0,
        task: 0,
        note: 0,
        total: 0,
      };
    });

    const add = (dateVal, type) => {
      if (!dateVal) return;
      const t = new Date(dateVal).getTime();
      if (Number.isNaN(t)) return;
      const weeksAgo = Math.floor((now - t) / week);
      if (weeksAgo >= 0 && weeksAgo < WEEKS) {
        const b = buckets[WEEKS - 1 - weeksAgo];
        b[type] += 1;
        b.total += 1;
      }
    };

    calls.forEach((c) => add(c.createdAt, "call"));
    meetings.forEach((m) => add(m.scheduledAt || m.createdAt, "meeting"));
    tasks.forEach((t) => add(t.createdAt, "task"));
    notes.forEach((n) => add(n.createdAt, "note"));

    const sum = (arr) => arr.reduce((s, b) => s + b.total, 0);
    return {
      data: buckets,
      grandTotal: sum(buckets),
      last4: sum(buckets.slice(-4)),
      prev4: sum(buckets.slice(-8, -4)),
    };
  }, [calls, meetings, tasks, notes]);

  // Momentum is only meaningful once there is something in the prior window to
  // compare against; otherwise the card reports the raw count instead of a
  // misleading "+100%".
  const momentum =
    prev4 > 0 ? Math.round(((last4 - prev4) / prev4) * 100) : last4 > 0 ? null : 0;
  const rising = momentum !== null && momentum > 0;
  const types = Object.keys(TYPE_META);

  return (
    <div className="lg:col-span-2 bg-white border border-[#E1E4EA] rounded-xl px-5 py-4 flex flex-col">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-gray-400" />
            <h3 className="text-sm font-semibold text-[#0E121B]">Relationship Pulse</h3>
          </div>
          <p className="text-xs text-[#525866] mt-1">
            Weekly engagement volume by type, with the momentum line on top.
          </p>
        </div>
        <span className="text-[11px] text-gray-400 flex-shrink-0">Last 12 weeks</span>
      </div>

      {/* Headline reads: how much engagement, and which way it is trending. */}
      <div className="flex items-end gap-6 mt-4 pb-4 border-b border-[#E1E4EA]">
        <div>
          <p className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">
            Total touchpoints
          </p>
          <p className="text-2xl font-bold text-[#0E121B] leading-tight mt-0.5">{grandTotal}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">
            Last 4 weeks
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-2xl font-bold text-[#0E121B] leading-tight">{last4}</span>
            {momentum !== null && momentum !== 0 && (
              <span
                className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
                  rising ? "text-[#10B981] bg-[#10B981]/10" : "text-[#EF4444] bg-[#EF4444]/10"
                }`}
              >
                <TrendingUp className={`w-3 h-3 ${rising ? "" : "rotate-180"}`} />
                {Math.abs(momentum)}%
              </span>
            )}
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {prev4 > 0 ? "vs previous 4 weeks" : "no prior activity to compare"}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="h-[220px] flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="relative h-[220px] mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7E7E7" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "rgba(31, 31, 33, 0.56)" }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={12}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: "rgba(31, 31, 33, 0.56)" }}
                  axisLine={false}
                  tickLine={false}
                  width={34}
                  domain={[0, (max) => (max <= 0 ? 4 : Math.ceil(max * 1.25))]}
                />
                {grandTotal > 0 && <Tooltip cursor={{ fill: "rgba(0,133,255,0.05)" }} content={<PulseTooltip />} />}
                {types.map((t, i) => (
                  <Bar
                    key={t}
                    dataKey={t}
                    stackId="pulse"
                    fill={TYPE_META[t].color}
                    barSize={14}
                    radius={i === types.length - 1 ? [3, 3, 0, 0] : 0}
                    isAnimationActive={grandTotal > 0}
                  />
                ))}
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="#2A2726"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={false}
                  isAnimationActive={grandTotal > 0}
                />
              </ComposedChart>
            </ResponsiveContainer>
            {grandTotal === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-sm text-gray-400 bg-white/70 px-2 py-0.5 rounded">
                  No activity logged in the last 12 weeks
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 mt-3">
            {types.map((t) => (
              <div key={t} className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm" style={{ background: TYPE_META[t].color }} />
                <span className="text-xs" style={{ color: "rgba(31, 31, 33, 0.56)" }}>
                  {TYPE_META[t].label}
                </span>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <span className="w-3 border-t-2 border-dashed border-[#2A2726]" />
              <span className="text-xs" style={{ color: "rgba(31, 31, 33, 0.56)" }}>
                Weekly total
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Engagement Balance — the same four activity types as a radar, which shows the
// *shape* of the relationship (all-calls, no-notes, etc.) rather than just the
// split a ring gives. Axes are always all four types so the silhouette is
// comparable between contacts; the grid still draws at zero as the empty state.
// ─────────────────────────────────────────────────────────────────────────────
const EngagementBalance = ({ activity, loading }) => {
  const { calls, meetings, tasks, notes } = activity;

  const totals = useMemo(
    () => ({ call: calls.length, meeting: meetings.length, task: tasks.length, note: notes.length }),
    [calls, meetings, tasks, notes]
  );
  const types = Object.keys(TYPE_META);
  const grandTotal = types.reduce((s, t) => s + totals[t], 0);
  const radarData = types.map((t) => ({ key: t, axis: TYPE_META[t].label, value: totals[t] }));
  const maxVal = Math.max(...types.map((t) => totals[t]), 0);

  // The single most-used channel — a one-line read of how this relationship is
  // actually being worked.
  const dominant = grandTotal > 0 ? types.reduce((a, b) => (totals[b] > totals[a] ? b : a)) : null;

  return (
    <div className="bg-white border border-[#E1E4EA] rounded-xl px-5 py-4 flex flex-col">
      <div>
        <h3 className="text-sm font-semibold text-[#0E121B]">Engagement Balance</h3>
        <p className="text-xs text-[#525866] mt-1">
          {dominant
            ? `Mostly ${TYPE_META[dominant].label.toLowerCase()} — ${totals[dominant]} of ${grandTotal} touchpoints.`
            : "How engagement is spread across channels."}
        </p>
      </div>

      {loading ? (
        <div className="flex-1 min-h-[200px] flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="relative h-[200px] mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius="72%" margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <PolarGrid stroke="#E7E7E7" />
                <PolarAngleAxis
                  dataKey="axis"
                  tick={{ fontSize: 11, fill: "rgba(31, 31, 33, 0.56)" }}
                />
                <PolarRadiusAxis
                  domain={[0, maxVal > 0 ? maxVal : 4]}
                  tick={false}
                  axisLine={false}
                />
                <Radar
                  dataKey="value"
                  stroke="#0085FF"
                  strokeWidth={2}
                  fill="#0085FF"
                  fillOpacity={0.18}
                  isAnimationActive={grandTotal > 0}
                />
              </RadarChart>
            </ResponsiveContainer>
            {grandTotal === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-xs text-gray-400 bg-white/70 px-2 py-0.5 rounded">
                  No engagement yet
                </span>
              </div>
            )}
          </div>

          {/* Per-type counts with a share bar, so the radar's shape is backed by
              readable numbers. */}
          <div className="mt-3 pt-3 border-t border-[#E1E4EA] space-y-2">
            {types.map((t) => (
              <div key={t} className="flex items-center gap-2.5">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: TYPE_META[t].color }}
                />
                <span className="w-[62px] flex-shrink-0 text-[11px] text-[#525866]">
                  {TYPE_META[t].label}
                </span>
                <span className="flex-1 h-1.5 rounded-full bg-[#F1F1F5] overflow-hidden">
                  <span
                    className="block h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${grandTotal > 0 ? (totals[t] / grandTotal) * 100 : 0}%`,
                      background: TYPE_META[t].color,
                    }}
                  />
                </span>
                <span className="w-5 flex-shrink-0 text-right text-xs font-semibold text-[#0E121B]">
                  {totals[t]}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
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
    <div className="h-[320px] flex flex-col bg-white border border-gray-200 rounded-lg p-5">
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
// Call outcomes exactly as the CallLog schema enumerates them, so the legend
// can never drift from what the API is allowed to return.
const CALL_OUTCOMES = [
  { key: "Connected", color: "#0085FF" },
  { key: "Missed", color: "#EF4444" },
  { key: "Voicemail", color: "#F59E0B" },
  { key: "No Answer", color: "#C7CBD3" },
];

// Parts of the day used for the reachability strip. Ranges are half-open and
// the last one wraps past midnight.
const DAYPARTS = [
  { key: "morning", label: "Morning", hint: "6a–12p", from: 6, to: 12 },
  { key: "afternoon", label: "Afternoon", hint: "12p–5p", from: 12, to: 17 },
  { key: "evening", label: "Evening", hint: "5p–9p", from: 17, to: 21 },
  { key: "night", label: "Night", hint: "9p–6a", from: 21, to: 6 },
];

const formatDuration = (seconds) => {
  const s = Math.max(0, Math.round(seconds || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

// ─────────────────────────────────────────────────────────────────────────────
// Call Effectiveness — a radial connect-rate gauge over the last 30 days, with
// the full outcome breakdown and talk-time underneath. Built from real CallLog
// records (status / callType / duration); the gauge reads 0% rather than hiding
// when no calls have been logged.
// ─────────────────────────────────────────────────────────────────────────────
const CallEffectiveness = ({ activity, loading }) => {
  const { calls, meetings } = activity;
  const now = Date.now();
  const windowStart = now - 30 * 86400000;

  const stats = useMemo(() => {
    const recent = calls.filter((c) => {
      const t = c.createdAt ? new Date(c.createdAt).getTime() : NaN;
      return !Number.isNaN(t) && t >= windowStart && t <= now;
    });
    const byOutcome = CALL_OUTCOMES.map((o) => ({
      ...o,
      value: recent.filter((c) => (c.status || "Connected") === o.key).length,
    }));
    const attempts = recent.length;
    const connected = byOutcome.find((o) => o.key === "Connected")?.value || 0;
    const inbound = recent.filter((c) => c.callType === "Inbound").length;
    const talkTime = recent
      .filter((c) => (c.status || "Connected") === "Connected")
      .reduce((s, c) => s + (Number(c.duration) || 0), 0);
    // Connect rate by part of day, from each log's createdAt hour. Buckets
    // with no attempts stay null so the strip can show "no data" rather than
    // implying a 0% reach rate nobody ever tested.
    const dayparts = DAYPARTS.map((d) => {
      const inBucket = recent.filter((c) => {
        const h = new Date(c.createdAt).getHours();
        return d.from < d.to ? h >= d.from && h < d.to : h >= d.from || h < d.to;
      });
      const got = inBucket.filter((c) => (c.status || "Connected") === "Connected").length;
      return {
        ...d,
        attempts: inBucket.length,
        rate: inBucket.length > 0 ? Math.round((got / inBucket.length) * 100) : null,
      };
    });
    const reachable = dayparts.filter((d) => d.rate !== null);
    const best = reachable.length
      ? reachable.reduce((a, b) => (b.rate > a.rate ? b : a))
      : null;

    return {
      attempts,
      connected,
      inbound,
      outbound: attempts - inbound,
      byOutcome,
      talkTime,
      avgDuration: connected > 0 ? talkTime / connected : 0,
      rate: attempts > 0 ? Math.round((connected / attempts) * 100) : 0,
      dayparts,
      best,
    };
  }, [calls, now, windowStart]);

  // Most recent past interaction across calls and meetings — the "when did we
  // last actually speak" line.
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

  const gaugeData = [{ name: "rate", value: stats.rate, fill: "#0085FF" }];

  return (
    <div className="bg-white border border-[#E1E4EA] rounded-xl px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <PhoneCall className="w-4 h-4 text-gray-400" />
            <h3 className="text-sm font-semibold text-[#0E121B]">Call Effectiveness</h3>
          </div>
          <p className="text-xs text-[#525866] mt-1">
            How often calls to this contact actually connect.
          </p>
        </div>
        <span className="text-[11px] text-gray-400 flex-shrink-0">Last 30 days</span>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : (
        <div className="flex items-center gap-6 mt-5">
          {/* Radial gauge — connect rate as a single glanceable figure. Sized to
              hold its own against the outcome list beside it; the ring is thick
              enough to read at a glance rather than a hairline. */}
          <div className="relative w-[172px] h-[172px] flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                data={gaugeData}
                innerRadius="64%"
                outerRadius="100%"
                startAngle={90}
                endAngle={-270}
              >
                <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                <RadialBar
                  background={{ fill: "#F1F1F5" }}
                  dataKey="value"
                  cornerRadius={12}
                  isAnimationActive={stats.attempts > 0}
                />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[32px] font-bold text-[#0E121B] leading-none">{stats.rate}%</span>
              <span className="text-[11px] text-gray-400 mt-1.5">connected</span>
              <span className="text-[10px] text-gray-300 mt-0.5">
                {stats.connected}/{stats.attempts} calls
              </span>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            {/* Outcome breakdown — one row per schema-defined status. A share
                bar fills the span between label and count so each outcome is
                comparable at a glance instead of leaving dead width. */}
            <div className="space-y-2">
              {stats.byOutcome.map((o) => (
                <div key={o.key} className="flex items-center gap-2.5">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: o.color }}
                  />
                  <span className="w-[68px] flex-shrink-0 text-[11px] text-[#525866] truncate">
                    {o.key}
                  </span>
                  <span className="flex-1 min-w-0 h-1.5 rounded-full bg-[#F1F1F5] overflow-hidden">
                    <span
                      className="block h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${stats.attempts > 0 ? (o.value / stats.attempts) * 100 : 0}%`,
                        background: o.color,
                      }}
                    />
                  </span>
                  <span className="w-8 flex-shrink-0 text-right text-xs font-semibold text-[#0E121B]">
                    {o.value}
                  </span>
                </div>
              ))}
            </div>

            {/* Direction split — who is driving the relationship. A single
                two-tone bar reads faster than "(n out / n in)" text. */}
            <div className="mt-3 pt-3 border-t border-[#E1E4EA]">
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">
                  Direction
                </span>
                <span className="text-[10px] text-gray-400">
                  {stats.attempts} attempt{stats.attempts !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex h-2 w-full rounded-full bg-[#F1F1F5] overflow-hidden">
                {stats.attempts > 0 && (
                  <>
                    <span
                      className="h-full transition-all duration-500"
                      style={{
                        width: `${(stats.outbound / stats.attempts) * 100}%`,
                        background: "#0085FF",
                      }}
                    />
                    <span
                      className="h-full transition-all duration-500"
                      style={{
                        width: `${(stats.inbound / stats.attempts) * 100}%`,
                        background: "#8E62EF",
                      }}
                    />
                  </>
                )}
              </div>
              <div className="flex items-center gap-4 mt-1.5">
                <span className="flex items-center gap-1.5 text-[11px] text-[#525866]">
                  <span className="w-2 h-2 rounded-full bg-[#0085FF]" />
                  {stats.outbound} Outbound
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-[#525866]">
                  <span className="w-2 h-2 rounded-full bg-[#8E62EF]" />
                  {stats.inbound} Inbound
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* When this contact actually picks up. Column height is the connect
          rate for that part of the day; untried windows render hollow so an
          untested slot is never mistaken for an unreachable one. */}
      {!loading && (
        <div className="border-t border-[#E1E4EA] pt-3 mt-3">
          <div className="flex items-baseline justify-between mb-2">
            <p className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">
              Best time to reach
            </p>
            {stats.best ? (
              <span className="text-[11px] font-semibold text-[#0085FF]">
                {stats.best.label} · {stats.best.rate}%
              </span>
            ) : (
              <span className="text-[11px] text-gray-400">Not enough calls yet</span>
            )}
          </div>
          {/* Each window is a full-height track filled from the bottom by its
              connect rate, so the columns stay anchored to the row instead of
              collapsing to a hairline when a rate is low or untested. */}
          <div className="flex items-end gap-2.5">
            {stats.dayparts.map((d) => {
              const isBest = stats.best && d.key === stats.best.key && d.attempts > 0;
              const untried = d.rate === null;
              return (
                <div key={d.key} className="flex-1 flex flex-col items-center gap-1.5">
                  <span className="text-[10px] font-semibold text-[#0E121B] leading-none h-3">
                    {untried ? "" : `${d.rate}%`}
                  </span>
                  <div
                    title={`${d.label} (${d.hint}) · ${d.attempts} attempt${d.attempts !== 1 ? "s" : ""}`}
                    className="w-full h-[56px] rounded-lg flex items-end overflow-hidden"
                    style={{
                      background: untried
                        ? "repeating-linear-gradient(45deg, #F7F8FA, #F7F8FA 4px, #FFF 4px, #FFF 8px)"
                        : "#F1F1F5",
                      border: untried ? "1px dashed #E1E4EA" : "none",
                    }}
                  >
                    {!untried && (
                      <div
                        className="w-full rounded-lg transition-all duration-700"
                        style={{
                          height: `${Math.max(6, d.rate)}%`,
                          background: isBest ? "#0085FF" : "rgba(0, 133, 255, 0.3)",
                        }}
                      />
                    )}
                  </div>
                  <span
                    className="text-[10px] leading-tight text-center"
                    style={{ color: "rgba(31, 31, 33, 0.56)" }}
                  >
                    {d.label}
                    <span className="block text-gray-300 text-[9px]">{d.hint}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && (
        <div className="border-t border-[#E1E4EA] pt-3 mt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] text-[#525866]">
              Avg. talk time{" "}
              <span className="font-semibold text-[#0E121B]">
                {stats.connected > 0 ? formatDuration(stats.avgDuration) : "—"}
              </span>
            </span>
            <span className="text-[11px] text-[#525866]">
              Total{" "}
              <span className="font-semibold text-[#0E121B]">
                {stats.talkTime > 0 ? formatDuration(stats.talkTime) : "—"}
              </span>
            </span>
          </div>
          <p className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase mb-1.5">
            Last interaction
          </p>
          {lastInteraction ? (
            <div className="flex items-center gap-2">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[#0085FF]/10 flex items-center justify-center">
                <lastInteraction.icon className="w-3.5 h-3.5 text-[#0085FF]" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-[#0E121B] truncate">{lastInteraction.label}</p>
                <p className="text-[11px] text-gray-400">{formatActivityTime(lastInteraction.date)}</p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-400">No interactions yet.</p>
          )}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Follow-up Load — the contact's open work as a priority x state matrix, so an
// overdue high-priority task is visible instead of being averaged into a bar.
// Priorities are the Task schema's own enum (high / medium / low); "Overdue"
// means an unfinished task whose dueDate has passed. The next few commitments
// (future meetings + dated open tasks) run underneath, soonest first.
// ─────────────────────────────────────────────────────────────────────────────
const PRIORITIES = [
  { key: "high", label: "High", color: "#EF4444" },
  { key: "medium", label: "Medium", color: "#F59E0B" },
  { key: "low", label: "Low", color: "#10B981" },
];

const FollowUpLoad = ({ activity, loading }) => {
  const { tasks, meetings } = activity;
  const now = Date.now();

  const { matrix, totals, completionPct, total } = useMemo(() => {
    const isDone = (t) => t.status === "Completed";
    const isOverdue = (t) => !isDone(t) && t.dueDate && new Date(t.dueDate).getTime() < now;

    const cell = (priority, state) =>
      tasks.filter((t) => {
        const p = (t.priority || "medium").toLowerCase();
        if (p !== priority) return false;
        if (state === "done") return isDone(t);
        if (state === "overdue") return isOverdue(t);
        return !isDone(t) && !isOverdue(t);
      }).length;

    const m = PRIORITIES.map((p) => ({
      ...p,
      open: cell(p.key, "open"),
      overdue: cell(p.key, "overdue"),
      done: cell(p.key, "done"),
    }));

    const sum = (k) => m.reduce((s, r) => s + r[k], 0);
    const t = tasks.length;
    return {
      matrix: m,
      totals: { open: sum("open"), overdue: sum("overdue"), done: sum("done") },
      completionPct: t > 0 ? Math.round((sum("done") / t) * 100) : 0,
      total: t,
    };
  }, [tasks, now]);

  const upcoming = useMemo(() => {
    return [
      ...meetings
        .filter((m) => m.scheduledAt && new Date(m.scheduledAt).getTime() > now)
        .map((m) => ({
          date: m.scheduledAt,
          title: m.title || m.subject || "Meeting",
          meta: new Date(m.scheduledAt).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          }),
          color: TYPE_META.meeting.color,
        })),
      ...tasks
        .filter((t) => t.status !== "Completed" && t.dueDate && new Date(t.dueDate).getTime() > now)
        .map((t) => ({ date: t.dueDate, title: t.title || "Task", meta: "Task", color: TYPE_META.task.color })),
    ]
      .filter((i) => i.date)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 3);
  }, [tasks, meetings, now]);

  // Cell intensity is relative to the busiest cell, so the matrix stays
  // readable whether the contact has 3 tasks or 300.
  const peak = Math.max(1, ...matrix.flatMap((r) => [r.open, r.overdue, r.done]));
  const columns = [
    { key: "overdue", label: "Overdue", tint: "239, 68, 68" },
    { key: "open", label: "Open", tint: "0, 133, 255" },
    { key: "done", label: "Done", tint: "16, 185, 129" },
  ];

  return (
    <div className="bg-white border border-[#E1E4EA] rounded-xl px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-gray-400" />
            <h3 className="text-sm font-semibold text-[#0E121B]">Follow-up Load</h3>
          </div>
          <p className="text-xs text-[#525866] mt-1">
            Open work on this contact, by priority and state.
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-lg font-bold text-[#0E121B] leading-none">{completionPct}%</p>
          <p className="text-[10px] text-gray-400 mt-1">completed</p>
        </div>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : (
        <>
          <div className="mt-4">
            {/* Column headers */}
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="w-[58px] flex-shrink-0" />
              {columns.map((c) => (
                <span
                  key={c.key}
                  className="flex-1 text-center text-[10px] font-semibold tracking-wide text-gray-400 uppercase"
                >
                  {c.label}
                </span>
              ))}
            </div>

            {matrix.map((row) => (
              <div key={row.key} className="flex items-center gap-1.5 mb-1.5">
                <span className="w-[58px] flex-shrink-0 flex items-center gap-1.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: row.color }}
                  />
                  <span className="text-[11px] text-[#525866] truncate">{row.label}</span>
                </span>
                {columns.map((c) => {
                  const v = row[c.key];
                  const intensity = v === 0 ? 0.06 : 0.18 + (v / peak) * 0.62;
                  return (
                    <span
                      key={c.key}
                      title={`${row.label} priority · ${c.label}: ${v}`}
                      className="flex-1 h-9 rounded-md flex items-center justify-center transition-colors"
                      style={{ background: `rgba(${c.tint}, ${intensity})` }}
                    >
                      <span
                        className={`text-xs font-semibold ${
                          v > 0 && intensity > 0.45 ? "text-white" : v > 0 ? "text-[#0E121B]" : "text-gray-300"
                        }`}
                      >
                        {v}
                      </span>
                    </span>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[#E1E4EA]">
            <span className="text-[11px] text-[#525866]">
              <span className="font-semibold text-[#0E121B]">{total}</span> task
              {total !== 1 ? "s" : ""} total
            </span>
            {totals.overdue > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#EF4444]">
                <Clock className="w-3 h-3" />
                {totals.overdue} overdue
              </span>
            )}
            {total === 0 && <span className="text-[11px] text-gray-400">No tasks yet.</span>}
          </div>

          {upcoming.length > 0 && (
            <div className="mt-3 pt-3 border-t border-[#E1E4EA]">
              <p className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase mb-2">
                Next up
              </p>
              <div className="space-y-2">
                {upcoming.map((item, i) => {
                  const d = new Date(item.date);
                  return (
                    <div key={i} className="flex items-center gap-2.5">
                      <span
                        className="w-1 h-7 rounded-full flex-shrink-0"
                        style={{ background: item.color }}
                      />
                      <span className="w-[52px] flex-shrink-0 text-[11px] font-medium text-[#0E121B]">
                        {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                      <span className="flex-1 min-w-0 text-xs text-[#525866] truncate">
                        {item.title}
                      </span>
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


// ─────────────────────────────────────────────────────────────────────────────
// Contact Calendar — the current month with today highlighted and a dot on any
// day that carries a real meeting (scheduledAt) or task due date (dueDate). The
// Upcoming list underneath is the next few dated commitments, soonest first.
// "View Calendar" / "Show All" jump to the contact's Calendar tab. Nothing is
// fabricated — a month with no records simply shows no dots.
// ─────────────────────────────────────────────────────────────────────────────
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const ContactCalendar = ({ activity, loading, onNavigateTab }) => {
  const { meetings, tasks } = activity;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const todayDate = now.getDate();

  const { cells, eventDays, upcoming } = useMemo(() => {
    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Mon = 0
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const grid = [];
    for (let i = 0; i < firstWeekday; i += 1) grid.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) grid.push(d);

    const days = new Set();
    const markDay = (dateVal) => {
      if (!dateVal) return;
      const dt = new Date(dateVal);
      if (Number.isNaN(dt.getTime())) return;
      if (dt.getFullYear() === year && dt.getMonth() === month) days.add(dt.getDate());
    };
    meetings.forEach((m) => markDay(m.scheduledAt || m.createdAt));
    tasks.forEach((t) => markDay(t.dueDate));

    const startOfToday = new Date(year, month, todayDate).getTime();
    const up = [
      ...meetings
        .filter((m) => m.scheduledAt && new Date(m.scheduledAt).getTime() >= startOfToday)
        .map((m) => ({ date: m.scheduledAt, title: m.title || m.subject || "Meeting", kind: "Meeting", color: TYPE_META.meeting.color })),
      ...tasks
        .filter((t) => t.status !== "Completed" && t.dueDate && new Date(t.dueDate).getTime() >= startOfToday)
        .map((t) => ({ date: t.dueDate, title: t.title || "Task", kind: "Task", color: TYPE_META.task.color })),
    ]
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 4);

    return { cells: grid, eventDays: days, upcoming: up };
  }, [meetings, tasks, year, month, todayDate]);

  const goCalendar = () => onNavigateTab?.("Calendar");

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900">Calendar</h3>
        <button
          type="button"
          onClick={goCalendar}
          className="text-xs font-medium text-[#0085FF] hover:underline"
        >
          View Calendar
        </button>
      </div>

      {loading ? (
        <div className="h-[220px] flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-y-1 text-center">
            {WEEKDAYS.map((w) => (
              <span key={w} className="text-[11px] font-medium text-gray-400 pb-1">
                {w}
              </span>
            ))}
            {cells.map((d, i) => {
              if (d === null) return <span key={`b-${i}`} />;
              const isToday = d === todayDate;
              const hasEvent = eventDays.has(d);
              return (
                <div key={d} className="flex flex-col items-center justify-start h-8">
                  <span
                    className={`w-7 h-7 flex items-center justify-center rounded-full text-xs ${
                      isToday
                        ? "bg-[#0085FF] text-white font-semibold"
                        : "text-gray-700"
                    }`}
                  >
                    {d}
                  </span>
                  {hasEvent && !isToday && (
                    <span className="w-1 h-1 rounded-full bg-[#0085FF] -mt-0.5" />
                  )}
                  {hasEvent && isToday && (
                    <span className="w-1 h-1 rounded-full bg-transparent -mt-0.5" />
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-900">Upcoming</h4>
              {upcoming.length > 0 && (
                <button
                  type="button"
                  onClick={goCalendar}
                  className="text-xs font-medium text-[#0085FF] hover:underline"
                >
                  Show All
                </button>
              )}
            </div>
            {upcoming.length === 0 ? (
              <p className="text-xs text-gray-400 py-1">No upcoming meetings or tasks.</p>
            ) : (
              <div className="space-y-2.5">
                {upcoming.map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span
                      className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: item.color }}
                    />
                    <div className="min-w-0">
                      <p className="text-xs text-gray-900 truncate">
                        {item.title} <span className="text-gray-400">· {item.kind}</span>
                      </p>
                      <p className="text-[11px] text-gray-400">
                        {new Date(item.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const BasicDetails = ({ contact, company, allCompanies = [], deals, onContactUpdate, onDealCreated, onNavigateTab }) => {
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

      {/* 1. Lifecycle Journey */}
      <LifecycleJourney contact={contact} onContactUpdate={onContactUpdate} />

      {/* 2. Associated Deals (moved up — its own header + table). */}
      <DealsTable deals={deals || []} contact={contact} company={company} allCompanies={allCompanies} onDealCreated={onDealCreated} />

      {/* 3. Relationship Pulse on the left (tall chart); the right column stacks
             the Activity Timeline and Calendar to fill the space beside it. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <RelationshipPulse activity={activity} loading={activityLoading} />
        <div className="space-y-4">
          <RecentActivity activity={activity} loading={activityLoading} />
          <ContactCalendar activity={activity} loading={activityLoading} onNavigateTab={onNavigateTab} />
        </div>
      </div>

      {/* 5. Call effectiveness + follow-up load + engagement balance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CallEffectiveness activity={activity} loading={activityLoading} />
        <FollowUpLoad activity={activity} loading={activityLoading} />
        <EngagementBalance activity={activity} loading={activityLoading} />
      </div>
    </div>
  );
};

export default BasicDetails;