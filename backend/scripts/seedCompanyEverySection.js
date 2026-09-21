// Seeds sample data across every section for one specific company:
// contacts, deals, invoices, notes, tasks, meetings, call logs, a folder.
// Usage: node scripts/seedCompanyEverySection.js "<Company Name>" [countPerSection]
require("dotenv").config({ quiet: true });
const mongoose = require("mongoose");

const Company = require("../models/Company");
const Contact = require("../models/Contact");
const Deal = require("../models/Deal");
const Invoice = require("../models/Invoice");
const Note = require("../models/Note");
const Task = require("../models/Task");
const Meeting = require("../models/Meeting");
const CallLog = require("../models/CallLog");
const Folder = require("../models/Folder");

const COMPANY_NAME = process.argv[2] || "Amber Collective 143";
const N = parseInt(process.argv[3], 10) || 8;

const pick = (a, i) => a[i % a.length];
const daysFromNow = (d) => new Date(Date.now() + d * 86400000);

const FIRST = ["Aarav", "Vivaan", "Aditi", "Ishaan", "Meera", "Kabir", "Sara", "Rohan"];
const LAST = ["Sharma", "Verma", "Iyer", "Kapoor", "Reddy", "Nair", "Singh", "Gupta"];

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected");

  const company = await Company.findOne({ name: COMPANY_NAME });
  if (!company) {
    console.error("Company not found:", COMPANY_NAME);
    process.exit(1);
  }
  const org = company.organization;
  const uid = company.user;
  console.log("Seeding for company:", company.name, company._id.toString());

  const report = {};

  // ---- Contacts ----
  const contactRunTag = Date.now().toString().slice(-6);
  const contactsData = Array.from({ length: N }, (_, i) => ({
    name: `${pick(FIRST, i)} ${pick(LAST, i + 3)}`,
    email: `contact${i + 1}.${contactRunTag}@ambercollective.com`,
    phone: `+91-90${String(1000000 + i).slice(-7)}`,
    company: company._id,
    lifecycleStage: pick(["Lead", "Sales Qualified Lead", "Customer"], i),
    stageStatus: pick(["New", "Contacted", "Qualified", "Won"], i),
    user: uid,
    createdBy: uid,
    organization: org,
  }));
  const contacts = await Contact.insertMany(contactsData);
  report.Contact = contacts.length;

  // ---- Deals ----
  const dealsData = Array.from({ length: N }, (_, i) => ({
    title: `${company.name} Deal ${i + 1}`,
    amount: 8000 + i * 2500,
    status: pick(["Open", "Won", "Lost"], i),
    contact: pick(contacts, i)._id,
    company: company._id,
    organization: org,
    user: uid,
    createdBy: uid,
    lastUpdatedBy: uid,
    additionalFields: [],
  }));
  const deals = await Deal.insertMany(dealsData);
  report.Deal = deals.length;

  // ---- Invoices ----
  const runTag = Date.now().toString().slice(-6);
  const invoicesData = deals.map((d, i) => ({
    deal: d._id,
    invoiceNumber: `INV-AC143-${runTag}-${i + 1}`,
    date: daysFromNow(-10 - i),
    dueDate: daysFromNow(20 - i),
    amount: d.amount,
    user: uid,
    organization: org,
    status: pick(["Draft", "Sent", "Paid", "Overdue"], i),
    discount: { type: "percentage", value: 0 },
    style: "",
    items: [{ name: "Service Fee", description: "Standard service", rate: d.amount, quantity: 1, discountType: "percentage", discount: 0 }],
  }));
  const invoices = await Invoice.insertMany(invoicesData);
  report.Invoice = invoices.length;

  // ---- Notes ----
  const notesData = Array.from({ length: N }, (_, i) => ({
    title: `${company.name} Note ${i + 1}`,
    note: `<p>Follow-up note ${i + 1} for ${company.name}.</p>`,
    noteType: pick(["General Note", "Meeting Note", "Call Note", "Follow-up Note"], i),
    visibility: "Team",
    company: company._id,
    taggedContacts: [pick(contacts, i)._id],
    user: uid,
    organization: org,
  }));
  const notes = await Note.insertMany(notesData);
  report.Note = notes.length;

  // ---- Tasks ----
  const tasksData = Array.from({ length: N }, (_, i) => ({
    title: `${company.name} Task ${i + 1}`,
    description: `Action item ${i + 1} for ${company.name}`,
    dueDate: daysFromNow(i + 1),
    status: pick(["Pending", "Completed"], i),
    priority: pick(["low", "medium", "high"], i),
    relatedTo: company._id,
    relationModel: "Company",
    users: [uid],
    createdBy: uid,
    organization: org,
  }));
  const tasks = await Task.insertMany(tasksData);
  report.Task = tasks.length;

  // ---- Meetings ----
  const meetingsData = Array.from({ length: N }, (_, i) => ({
    title: `${company.name} Meeting ${i + 1}`,
    description: `Sync ${i + 1} with ${company.name}`,
    scheduledAt: daysFromNow(i + 1),
    duration: 30 + (i % 3) * 15,
    status: pick(["scheduled", "completed", "cancelled"], i),
    meetingType: pick(["in-person", "video-call", "phone-call"], i),
    company: company._id,
    linkedTo: "company",
    createdBy: uid,
    organization: org,
  }));
  const meetings = await Meeting.insertMany(meetingsData);
  report.Meeting = meetings.length;

  // ---- Call Logs (against the seeded contacts) ----
  const callLogsData = contacts.map((c, i) => ({
    contact: c._id,
    user: uid,
    organization: org,
    callType: pick(["Inbound", "Outbound"], i),
    status: pick(["Connected", "Missed", "Voicemail"], i),
    duration: 60 + i * 20,
    notes: `Call re: ${company.name}`,
  }));
  const callLogs = await CallLog.insertMany(callLogsData);
  report.CallLog = callLogs.length;

  // ---- Folder (with a couple of link-type "files") ----
  const folder = await Folder.create({
    name: `${company.name} Documents`,
    company: company._id,
    user: uid,
    files: [
      { fileName: "Contract Draft.pdf", fileType: "application/pdf", fileUrl: "https://example.com/contract-draft.pdf", isLink: true },
      { fileName: "Kickoff Notes", fileType: "link", fileUrl: "https://example.com/kickoff-notes", isLink: true },
    ],
  });
  report.Folder = 1;

  console.log("Seeded:", report);
  process.exit(0);
}

run().catch((e) => {
  console.error("Seed error:", e);
  process.exit(1);
});
