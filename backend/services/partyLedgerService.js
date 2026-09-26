// Party ledger — Total Given / Total Got / Net Balance, derived.
//
// These figures are computed from the Payment collection every time they are
// asked for. They are deliberately NOT stored on the party.
//
// Vendor.balance used to be a stored number, incremented and decremented by
// hand in vendorController on each add/update/delete. Every other path that
// touched payments (the payments timeline, allocations, refunds, reversals)
// did not know to adjust it, so it drifted permanently with no way to heal —
// and the vendor page's own KPI cards, which summed the payment rows instead,
// could disagree with it on the same screen. Deriving removes the whole class
// of bug: a payment created, edited, deleted, allocated or reversed changes
// these totals automatically, because they are just a view of the rows.
//
//   Total Given = sum of OUT payments   (money from us to the party)
//   Total Got   = sum of IN payments    (money from the party to us)
//   Net Balance = Total Given - Total Got
//
// Internal transfers are excluded: both legs belong to our own accounts, so
// counting them would overstate both totals by the transfer amount. This is
// the same rule the payments timeline applies to its KPIs.

const mongoose = require("mongoose");
const Payment = require("../models/Payment");

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const EMPTY = { totalGiven: 0, totalGot: 0, netBalance: 0, paymentCount: 0 };

// A party is matched on the generalized pointer OR the legacy `vendor` one.
// Rows written before partyType/party existed only carry `vendor`, and their
// money is just as real, so both shapes have to count.
const matchForParty = (orgId, partyType, partyId) => {
  const id = new mongoose.Types.ObjectId(String(partyId));
  const or = [{ partyType, party: id }];
  if (partyType === "Vendor") or.push({ vendor: id });
  return {
    organization: new mongoose.Types.ObjectId(String(orgId)),
    isInternalTransfer: { $ne: true },
    $or: or,
  };
};

const fromRows = (rows) => {
  const totals = { ...EMPTY };
  for (const row of rows) {
    if (row._id === "OUT") totals.totalGiven = round2(row.total);
    if (row._id === "IN") totals.totalGot = round2(row.total);
    totals.paymentCount += row.count;
  }
  totals.netBalance = round2(totals.totalGiven - totals.totalGot);
  return totals;
};

// Totals for one party.
async function getPartyTotals({ orgId, partyType = "Vendor", partyId }) {
  if (!partyId || !mongoose.isValidObjectId(String(partyId))) return { ...EMPTY };

  const rows = await Payment.aggregate([
    { $match: matchForParty(orgId, partyType, partyId) },
    { $group: { _id: "$direction", total: { $sum: "$amount" }, count: { $sum: 1 } } },
  ]);

  return fromRows(rows);
}

// Totals for many parties in one query — for list/table screens, so a page of
// vendors costs one aggregation rather than one per row. Returns a Map keyed
// by the party id as a string; ids with no payments are absent, and callers
// should fall back to zeroes.
async function getPartyTotalsBulk({ orgId, partyType = "Vendor", partyIds = [] }) {
  const ids = partyIds
    .filter((id) => id && mongoose.isValidObjectId(String(id)))
    .map((id) => new mongoose.Types.ObjectId(String(id)));

  if (ids.length === 0) return new Map();

  const or = [{ partyType, party: { $in: ids } }];
  if (partyType === "Vendor") or.push({ vendor: { $in: ids } });

  const rows = await Payment.aggregate([
    {
      $match: {
        organization: new mongoose.Types.ObjectId(String(orgId)),
        isInternalTransfer: { $ne: true },
        $or: or,
      },
    },
    {
      $group: {
        // Same fallback as the single-party match: group by the generalized
        // pointer, or the legacy one when that is all the row has.
        _id: { party: { $ifNull: ["$party", "$vendor"] }, direction: "$direction" },
        total: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
  ]);

  const byParty = new Map();
  for (const row of rows) {
    const key = String(row._id.party);
    if (!byParty.has(key)) byParty.set(key, []);
    byParty.get(key).push({ _id: row._id.direction, total: row.total, count: row.count });
  }

  const out = new Map();
  for (const [key, group] of byParty) out.set(key, fromRows(group));
  return out;
}

// Attaches the derived totals to a plain vendor object (or array of them).
// `balance` is kept in the payload, now meaning Net Balance = Given - Got, so
// screens that already read it keep working off the derived number instead of
// the stored one.
function withTotals(vendor, totals) {
  const t = totals || EMPTY;
  return {
    ...vendor,
    totalGiven: t.totalGiven,
    totalGot: t.totalGot,
    netBalance: t.netBalance,
    balance: t.netBalance,
  };
}

async function attachTotalsToVendors(orgId, vendors) {
  const list = Array.isArray(vendors) ? vendors : [vendors];
  const totalsById = await getPartyTotalsBulk({
    orgId,
    partyType: "Vendor",
    partyIds: list.map((v) => v?._id).filter(Boolean),
  });

  const mapped = list.map((v) => (v ? withTotals(v, totalsById.get(String(v._id))) : v));
  return Array.isArray(vendors) ? mapped : mapped[0];
}

module.exports = {
  getPartyTotals,
  getPartyTotalsBulk,
  attachTotalsToVendors,
  withTotals,
  EMPTY,
};
