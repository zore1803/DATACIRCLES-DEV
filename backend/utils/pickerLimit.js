// Optional `limit` for the unpaginated list endpoints (companies, contacts,
// deals). Absent -> null, so the caller keeps its original unbounded result
// and existing callers that need the full list are unaffected. Present ->
// capped at MAX_PICKER_LIMIT so a picker can never pull the whole collection.
const MAX_PICKER_LIMIT = 100;

const parsePickerLimit = (raw) => {
  const n = parseInt(raw, 10);
  return n > 0 ? Math.min(n, MAX_PICKER_LIMIT) : null;
};

module.exports = { parsePickerLimit, MAX_PICKER_LIMIT };
