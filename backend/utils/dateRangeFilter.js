// Parses one resolved date-range filter sent by the frontend
// (frontend/src/utils/dueDateFilter.js -> toServerDueDateFilter):
//   { column: "dueDate", from: ISO|null, to: ISO|null, excludeCompleted: bool }
//
// The browser works out the actual calendar-day boundaries in the user's own
// timezone (so "Today" is the user's today, not the server's) and sends them
// as instants. Here we only validate them and turn them into a Mongo range:
// `from` inclusive, `to` exclusive.
//
// Returns { range, excludeCompleted } where `range` is null when neither
// boundary is a valid date (nothing to filter on).
function parseDateRangeFilter(filter) {
  const range = {};
  const from = filter && filter.from ? new Date(filter.from) : null;
  const to = filter && filter.to ? new Date(filter.to) : null;
  if (from && !Number.isNaN(from.getTime())) range.$gte = from;
  if (to && !Number.isNaN(to.getTime())) range.$lt = to;
  return {
    range: Object.keys(range).length > 0 ? range : null,
    excludeCompleted: !!(filter && filter.excludeCompleted),
  };
}

// Safely parses the `advancedFilters` query param. Returns an array, or null
// when it's present but not valid JSON / not an array.
function parseAdvancedFiltersParam(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

module.exports = { parseDateRangeFilter, parseAdvancedFiltersParam };
