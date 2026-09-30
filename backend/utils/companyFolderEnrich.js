// Enriches hotlist folder companies with real, already-stored CRM signals:
//   - contactCount: Contacts linked to the company
//   - dealCount: Deals linked to the company
//   - lastActivity: the most recent of the company's Notes / Meetings / Tasks /
//     Deals, as { type, date } — never Company.updatedAt, never fabricated.
// No new activity store is introduced; this only reads existing collections.
const mongoose = require("mongoose");
const Contact = require("../models/Contact");
const Deal = require("../models/Deal");
const Note = require("../models/Note");
const Meeting = require("../models/Meeting");
const Task = require("../models/Task");

const toId = (v) => new mongoose.Types.ObjectId(v);

// companyId(string) -> { contactCount, dealCount, lastActivity: {type,date}|null }
async function buildCompanyStats(companyIds, organization) {
  const ids = [...new Set(companyIds.map(String))].map(toId);
  if (!ids.length) return new Map();
  const org = toId(organization);

  const [contacts, deals, notes, meetings, tasks] = await Promise.all([
    Contact.aggregate([
      { $match: { organization: org, company: { $in: ids } } },
      { $group: { _id: "$company", c: { $sum: 1 } } },
    ]),
    Deal.aggregate([
      { $match: { organization: org, company: { $in: ids } } },
      { $group: { _id: "$company", c: { $sum: 1 }, last: { $max: "$updatedAt" } } },
    ]),
    Note.aggregate([
      { $match: { organization: org, company: { $in: ids } } },
      { $group: { _id: "$company", last: { $max: "$updatedAt" } } },
    ]),
    Meeting.aggregate([
      { $match: { organization: org, company: { $in: ids } } },
      { $group: { _id: "$company", last: { $max: "$updatedAt" } } },
    ]),
    // Tasks reference entities polymorphically, so match the Company entries in
    // relatedEntities rather than a top-level company field.
    Task.aggregate([
      { $match: { organization: org, "relatedEntities.entityModel": "Company", "relatedEntities.entityId": { $in: ids } } },
      { $unwind: "$relatedEntities" },
      { $match: { "relatedEntities.entityModel": "Company", "relatedEntities.entityId": { $in: ids } } },
      { $group: { _id: "$relatedEntities.entityId", last: { $max: "$updatedAt" } } },
    ]),
  ]);

  const map = new Map();
  const ensure = (id) => {
    const k = String(id);
    if (!map.has(k)) map.set(k, { contactCount: 0, dealCount: 0, lastActivity: null });
    return map.get(k);
  };
  const consider = (id, type, date) => {
    if (!date) return;
    const e = ensure(id);
    if (!e.lastActivity || new Date(date) > new Date(e.lastActivity.date)) {
      e.lastActivity = { type, date };
    }
  };

  contacts.forEach((r) => { ensure(r._id).contactCount = r.c; });
  deals.forEach((r) => { const e = ensure(r._id); e.dealCount = r.c; consider(r._id, "Deal", r.last); });
  notes.forEach((r) => consider(r._id, "Note", r.last));
  meetings.forEach((r) => consider(r._id, "Meeting", r.last));
  tasks.forEach((r) => consider(r._id, "Task", r.last));

  return map;
}

// Mutates plain (lean) folder objects, attaching stats onto each company.
// Folders MUST be lean/plain — Mongoose subdocuments won't serialize new fields.
async function enrichFolders(folders, organization) {
  const list = Array.isArray(folders) ? folders : [folders].filter(Boolean);
  const ids = new Set();
  list.forEach((f) => (f.companies || []).forEach((c) => c?._id && ids.add(String(c._id))));
  const stats = await buildCompanyStats([...ids], organization);
  list.forEach((f) =>
    (f.companies || []).forEach((c) => {
      if (!c?._id) return;
      const s = stats.get(String(c._id)) || { contactCount: 0, dealCount: 0, lastActivity: null };
      c.contactCount = s.contactCount;
      c.dealCount = s.dealCount;
      c.lastActivity = s.lastActivity;
    })
  );
  return folders;
}

module.exports = { buildCompanyStats, enrichFolders };
