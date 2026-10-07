// Single source of truth for the Due Date presets + Custom Range filter.
//
// Used by BOTH the individual Company/Contact/Deal Tasks tab (filters the
// already-loaded tasks in the browser) and the global Tasks page (the same
// range is resolved here, then sent to the server). Because every date
// boundary is computed in this one file, "Today", "This Week", "Next 7 Days"
// etc. mean exactly the same thing everywhere — only the UI differs.
//
// A filter is a plain object: { preset, from, to }
//   preset: one of DUE_DATE_PRESETS[].value ("" / "all" = no filtering)
//   from/to: "YYYY-MM-DD" strings, only read when preset === "custom"
//
// Ranges are LOCAL-time calendar days, half-open: start inclusive, end
// exclusive. A task due at 23:59 on the last day is therefore still inside it.

export const DUE_DATE_PRESETS = [
  { value: "all", label: "All Dates" },
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "this_week", label: "This Week" },
  { value: "next_week", label: "Next Week" },
  { value: "next_7_days", label: "Next 7 Days" },
  { value: "next_30_days", label: "Next 30 Days" },
  { value: "custom", label: "Custom Range..." },
];

// Weeks run Monday–Sunday (0 = Sunday … 1 = Monday).
const WEEK_STARTS_ON = 1;

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

const parseYMD = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};

const EMPTY = { preset: "", from: "", to: "" };
export const emptyDueDateFilter = () => ({ ...EMPTY });

/** True when the filter would actually narrow anything down. */
export const isDueDateFilterActive = (filter) => {
  if (!filter || !filter.preset || filter.preset === "all") return false;
  if (filter.preset === "custom") return !!(filter.from || filter.to);
  return true;
};

/**
 * Resolves a filter to a concrete range, or null when it filters nothing.
 *   start: Date | null  (inclusive; null = unbounded)
 *   end:   Date | null  (exclusive; null = unbounded)
 *   excludeCompleted: Overdue only — a finished task is never "overdue".
 *     This is the same rule the Tasks tab's "Overdue Tasks" tile and
 *     "Overdue" badge already use (not completed AND due before now).
 */
export function resolveDueDateRange(filter, now = new Date()) {
  if (!isDueDateFilterActive(filter)) return null;
  const today = startOfDay(now);

  switch (filter.preset) {
    case "overdue":
      return { start: null, end: now, excludeCompleted: true };
    case "today":
      return { start: today, end: addDays(today, 1), excludeCompleted: false };
    case "tomorrow":
      return { start: addDays(today, 1), end: addDays(today, 2), excludeCompleted: false };
    case "this_week":
    case "next_week": {
      const daysSinceWeekStart = (today.getDay() - WEEK_STARTS_ON + 7) % 7;
      const weekStart = addDays(today, -daysSinceWeekStart);
      const start = filter.preset === "this_week" ? weekStart : addDays(weekStart, 7);
      return { start, end: addDays(start, 7), excludeCompleted: false };
    }
    case "next_7_days":
      // Today through the day 7 days from now, inclusive.
      return { start: today, end: addDays(today, 8), excludeCompleted: false };
    case "next_30_days":
      return { start: today, end: addDays(today, 31), excludeCompleted: false };
    case "custom": {
      let from = parseYMD(filter.from);
      let to = parseYMD(filter.to);
      if (from && to && from > to) [from, to] = [to, from];
      return {
        start: from,
        // `to` is a whole day, inclusive: Oct 5 includes everything up to Oct 6 00:00.
        end: to ? addDays(to, 1) : null,
        excludeCompleted: false,
      };
    }
    default:
      return null;
  }
}

/** Client-side match for one task (used by the individual-page Tasks tab). */
export function matchesDueDateFilter(task, filter, now = new Date()) {
  const range = resolveDueDateRange(filter, now);
  if (!range) return true; // "All Dates" keeps everything, including tasks with no due date.
  if (!task?.dueDate) return false;
  const due = new Date(task.dueDate).getTime();
  if (Number.isNaN(due)) return false;
  if (range.start && due < range.start.getTime()) return false;
  if (range.end && due >= range.end.getTime()) return false;
  if (range.excludeCompleted && task.status === "Completed") return false;
  return true;
}

/** The shape sent to the server (global Tasks page). */
export function toServerDueDateFilter(filter, now = new Date()) {
  const range = resolveDueDateRange(filter, now);
  if (!range) return null;
  return {
    column: "dueDate",
    from: range.start ? range.start.toISOString() : null,
    to: range.end ? range.end.toISOString() : null,
    excludeCompleted: range.excludeCompleted,
  };
}

const formatShort = (ymd) => {
  const d = parseYMD(ymd);
  return d ? d.toLocaleDateString([], { day: "numeric", month: "short" }) : "";
};

/** Short human label for a filter, e.g. "Today" or "1 Oct – 5 Oct". */
export function describeDueDateFilter(filter) {
  if (!isDueDateFilterActive(filter)) return "";
  if (filter.preset === "custom") {
    const f = formatShort(filter.from);
    const t = formatShort(filter.to);
    if (f && t) return `${f} – ${t}`;
    if (f) return `From ${f}`;
    return `Until ${t}`;
  }
  return DUE_DATE_PRESETS.find((p) => p.value === filter.preset)?.label || "";
}
