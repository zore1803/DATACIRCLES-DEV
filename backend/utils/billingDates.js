// Calendar-aware recurring dates for Sales Subscriptions. Every cycle is
// computed from the START DATE anchor (never from the previous result), so a
// 31st-of-month subscription bills 31 Jan, 28/29 Feb, 31 Mar... instead of
// drifting to the 3rd. Uses UTC parts because dates are stored as UTC midnight.

function occurrence(anchor, { value, unit }, k) {
  const a = new Date(anchor);
  const n = (parseInt(value, 10) || 1) * k;
  const y = a.getUTCFullYear();
  const m = a.getUTCMonth();
  const d = a.getUTCDate();
  const time = [a.getUTCHours(), a.getUTCMinutes(), a.getUTCSeconds(), a.getUTCMilliseconds()];

  if (unit === "day") return new Date(Date.UTC(y, m, d + n, ...time));
  if (unit === "week") return new Date(Date.UTC(y, m, d + n * 7, ...time));

  const months = (unit === "year" ? 12 : 1) * n;
  const idx = m + months;
  const ty = y + Math.floor(idx / 12);
  const tm = ((idx % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ty, tm, Math.min(d, lastDay), ...time));
}

// First billing date strictly after `after`, on the anchor's schedule.
function nextBillingDate(anchor, interval, after) {
  const limit = new Date(after).getTime();
  for (let k = 1; k < 100000; k += 1) {
    const d = occurrence(anchor, interval, k);
    if (d.getTime() > limit) return d;
  }
  throw new Error("Could not compute the next billing date");
}

module.exports = { occurrence, nextBillingDate };
