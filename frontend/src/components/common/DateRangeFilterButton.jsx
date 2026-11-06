import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

/* A "This Month ˅" style button that opens a compact popover to pick the date
   range a list is filtered by. Left: a slim column of quick presets. Right: a
   month grid for the chosen year (the year in the header opens a year grid),
   plus quarters, the whole year and the Indian financial year. Hovering any
   option previews the exact dates it covers in the footer.

   The value is { label, from, to }: from/to are Date boundaries in the user's
   own timezone, `to` exclusive, or null for no limit ("All Time"). */

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export const rangeForMonth = (year, month) => ({
  label: `${MONTH_NAMES[month]} ${year}`,
  from: new Date(year, month, 1),
  to: new Date(year, month + 1, 1),
});

export const rangeForYear = (year) => ({
  label: String(year),
  from: new Date(year, 0, 1),
  to: new Date(year + 1, 0, 1),
});

export const rangeForQuarter = (year, q) => ({
  label: `Q${q + 1} ${year}`,
  from: new Date(year, q * 3, 1),
  to: new Date(year, q * 3 + 3, 1),
});

// Indian financial year: April of `year` to March of the next.
export const rangeForFY = (year) => ({
  label: `FY ${String(year).slice(2)}-${String(year + 1).slice(2)}`,
  from: new Date(year, 3, 1),
  to: new Date(year + 1, 3, 1),
});

const fmtDay = (d) =>
  d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

// "01 Nov 2026 – 30 Nov 2026". The stored `to` is exclusive, so show the day before.
const describeRange = (r) => {
  if (!r || (!r.from && !r.to)) return "Every invoice, any date";
  const from = r.from ? fmtDay(r.from) : "Beginning";
  const to = r.to ? fmtDay(addDays(r.to, -1)) : "Today onwards";
  return from === to ? from : `${from} – ${to}`;
};

export const thisMonthRange = () => {
  const now = new Date();
  return { ...rangeForMonth(now.getFullYear(), now.getMonth()), label: "This Month" };
};

const PRESETS = [
  { label: "All Time", build: () => ({ from: null, to: null }) },
  { label: "Today", build: (t) => ({ from: t, to: addDays(t, 1) }) },
  { label: "Yesterday", build: (t) => ({ from: addDays(t, -1), to: t }) },
  {
    label: "This Week",
    build: (t) => {
      const monday = addDays(t, -((t.getDay() + 6) % 7));
      return { from: monday, to: addDays(monday, 7) };
    },
  },
  {
    label: "Last Week",
    build: (t) => {
      const monday = addDays(t, -((t.getDay() + 6) % 7));
      return { from: addDays(monday, -7), to: monday };
    },
  },
  {
    label: "This Month",
    build: (t) => ({
      from: new Date(t.getFullYear(), t.getMonth(), 1),
      to: new Date(t.getFullYear(), t.getMonth() + 1, 1),
    }),
  },
  {
    label: "Last Month",
    build: (t) => ({
      from: new Date(t.getFullYear(), t.getMonth() - 1, 1),
      to: new Date(t.getFullYear(), t.getMonth(), 1),
    }),
  },
  {
    label: "This Year",
    build: (t) => ({ from: new Date(t.getFullYear(), 0, 1), to: new Date(t.getFullYear() + 1, 0, 1) }),
  },
  {
    label: "Last Year",
    build: (t) => ({ from: new Date(t.getFullYear() - 1, 0, 1), to: new Date(t.getFullYear(), 0, 1) }),
  },
];

// `open` / `onOpenChange` let a parent drive it, and `hideTrigger` drops the pill button so the
// picker can be opened from elsewhere (the phone layout opens it from a "..." menu entry); the
// panel then floats centred on screen instead of hanging off a button.
export default function DateRangeFilterButton({ value, onChange, open: controlledOpen, onOpenChange, hideTrigger = false }) {
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : innerOpen;
  const setOpen = (next) => {
    const resolved = typeof next === "function" ? next(open) : next;
    setInnerOpen(resolved);
    if (onOpenChange) onOpenChange(resolved);
  };
  const [view, setView] = useState("months"); // "months" | "years"
  const [year, setYear] = useState(new Date().getFullYear());
  const [yearPageStart, setYearPageStart] = useState(new Date().getFullYear() - 5);
  const [hover, setHover] = useState(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const apply = (range) => {
    onChange(range);
    setOpen(false);
    setView("months");
    setHover(null);
  };

  const presetRange = (preset) => {
    const { from, to } = preset.build(startOfDay(new Date()));
    return { label: preset.label, from, to };
  };

  const small = (selected) =>
    `rounded-md px-2 py-1 text-xs transition-colors ${selected
      ? "bg-[#2B5BFF] font-semibold text-white"
      : "text-[#0E121B] hover:bg-[#F1F1F5]"
    }`;

  const shown = hover || value;
  const today = new Date();

  // Month / quarter / year / FY buttons all behave the same way.
  const rangeButton = (range, text, extra = "") => (
    <button
      key={range.label}
      type="button"
      onClick={() => apply(range)}
      onMouseEnter={() => setHover(range)}
      onMouseLeave={() => setHover(null)}
      className={`${small(value?.label === range.label)} text-center ${extra}`}
    >
      {text}
    </button>
  );

  return (
    <div ref={wrapRef} className="relative flex-shrink-0">
      {!hideTrigger && (
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={describeRange(value)}
        className="flex h-10 items-center gap-2 rounded-full bg-[#F1F1F5] px-5 text-sm font-semibold text-[#0E121B] hover:bg-[#E8E8EE]"
      >
        {value?.label || "All Time"}
        <ChevronDown className="h-4 w-4" />
      </button>
      )}

      {open && (
        <div
          className={`${
            hideTrigger
              ? "fixed left-1/2 top-28 z-[10001] -translate-x-1/2"
              : "absolute left-0 top-full z-50 mt-2"
          } w-[400px] max-w-[94vw] rounded-xl border border-[#E1E4EA] bg-white shadow-xl`}
        >
          <div className="flex">
            {/* Presets: one slim column */}
            <div className="flex w-[118px] flex-shrink-0 flex-col gap-0.5 border-r border-[#F1F1F5] p-2">
              {PRESETS.map((p) => {
                const range = presetRange(p);
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => apply(range)}
                    onMouseEnter={() => setHover(range)}
                    onMouseLeave={() => setHover(null)}
                    className={`${small(value?.label === p.label)} text-left`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            {/* Months / years for a chosen year */}
            <div className="flex-1 p-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <button
                  type="button"
                  aria-label="Previous"
                  onClick={() =>
                    view === "years" ? setYearPageStart((y) => y - 12) : setYear((y) => y - 1)
                  }
                  className="rounded-full p-1 text-[#525866] hover:bg-gray-100"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setYearPageStart(year - 5);
                    setView((v) => (v === "years" ? "months" : "years"));
                  }}
                  className="flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold text-[#0E121B] hover:bg-gray-100"
                >
                  {view === "years" ? `${yearPageStart} – ${yearPageStart + 11}` : year}
                  <ChevronDown className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  aria-label="Next"
                  onClick={() =>
                    view === "years" ? setYearPageStart((y) => y + 12) : setYear((y) => y + 1)
                  }
                  className="rounded-full p-1 text-[#525866] hover:bg-gray-100"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>

              {view === "years" ? (
                <div className="grid grid-cols-4 gap-1">
                  {Array.from({ length: 12 }, (_, i) => yearPageStart + i).map((y) => (
                    <button
                      key={y}
                      type="button"
                      onClick={() => {
                        setYear(y);
                        setView("months");
                      }}
                      className={`${small(y === year)} text-center`}
                    >
                      {y}
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-4 gap-1">
                    {MONTH_NAMES.map((m, i) => {
                      const range = rangeForMonth(year, i);
                      const isCurrent =
                        year === today.getFullYear() && i === today.getMonth() && value?.label !== range.label;
                      return rangeButton(range, m, isCurrent ? "ring-1 ring-[#2B5BFF]/40" : "");
                    })}
                  </div>

                  {/* Quarters, then the whole year and the financial year */}
                  <div className="mt-2 grid grid-cols-4 gap-1">
                    {[0, 1, 2, 3].map((q) =>
                      rangeButton(rangeForQuarter(year, q), `Q${q + 1}`, "border border-[#E1E4EA]"),
                    )}
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-1">
                    {rangeButton(rangeForYear(year), `All ${year}`, "border border-[#E1E4EA]")}
                    {rangeButton(rangeForFY(year), rangeForFY(year).label, "border border-[#E1E4EA]")}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Live preview of exactly which dates the hovered option covers */}
          <div className="rounded-b-xl border-t border-[#F1F1F5] bg-[#F8F9FB] px-3 py-1.5 text-[11px] text-[#525866]">
            <span className="font-semibold text-[#0E121B]">{shown?.label || "All Time"}</span>
            {" · "}
            {describeRange(shown)}
          </div>
        </div>
      )}
    </div>
  );
}
