// Auto-seeds 10 sample rows each of Company/Contact/Deal/Invoice/Task/Note
// for an organization the moment its free trial starts (see
// subscriptionController.startFreeTrial) — so a brand-new trial account
// doesn't open to a completely empty CRM. Orgs that never start a trial
// (e.g. a direct paid signup) never call this, so they stay genuinely
// empty. Every record's name/title is prefixed "Trial Demo" so this batch
// stays identifiable and easy to bulk-delete later if that's ever wanted.
//
// Field shapes here mirror scripts/seedAllTables.js (the existing, proven
// manual dev-seed script) — that script assumes companies/contacts already
// exist; a fresh trial org has none, so this creates its own.
const Company = require("../models/Company");
const Contact = require("../models/Contact");
const Deal = require("../models/Deal");
const Invoice = require("../models/Invoice");
const Task = require("../models/Task");
const Note = require("../models/Note");

const N = 10;
const pick = (arr, i) => arr[i % arr.length];
const daysFromNow = (d) => new Date(Date.now() + d * 86400000);

const SAMPLE_COMPANY_NAMES = [
  "Acme Industries", "Blue Ridge Technologies", "Northwind Traders", "Summit Retail Group",
  "Harbor Logistics", "Meridian Consulting", "Cascade Manufacturing", "Redwood Media",
  "Silverline Properties", "Vertex Solutions",
];
const SAMPLE_FIRST_NAMES = ["Aarav", "Priya", "Rohan", "Ishaan", "Ananya", "Kabir", "Meera", "Vivaan", "Sara", "Dev"];
const SAMPLE_LAST_NAMES = ["Sharma", "Verma", "Iyer", "Desai", "Nair", "Gupta", "Reddy", "Kapoor", "Bose", "Rao"];

async function seedTrialData({ organization, user }) {
  const base = { organization, user, createdBy: user, lastUpdatedBy: user };

  const companies = await Company.insertMany(
    Array.from({ length: N }, (_, i) => ({
      name: `Trial Demo ${SAMPLE_COMPANY_NAMES[i]}`,
      industry: pick(["Technology", "Retail", "Manufacturing", "Consulting", "Media"], i),
      ...base,
    }))
  );

  const contacts = await Contact.insertMany(
    Array.from({ length: N }, (_, i) => {
      const name = `${SAMPLE_FIRST_NAMES[i]} ${SAMPLE_LAST_NAMES[i]}`;
      return {
        name: `Trial Demo ${name}`,
        email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
        phone: `+91-90000${String(10000 + i).slice(-5)}`,
        company: pick(companies, i)._id,
        ...base,
      };
    })
  );

  const deals = await Deal.insertMany(
    Array.from({ length: N }, (_, i) => ({
      title: `Trial Demo Deal ${i + 1}`,
      amount: 5000 + i * 1500,
      status: pick(["Open", "Won", "Lost"], i),
      contact: pick(contacts, i)._id,
      company: pick(companies, i)._id,
      ...base,
      additionalFields: [],
    }))
  );

  const invoiceLineItem = (i) => [{
    name: `Sample Line Item ${i + 1}`,
    description: `Trial demo invoice line ${i + 1}`,
    rate: 1000 + i * 200,
    quantity: 1 + (i % 3),
    discountType: "percentage",
    discount: 0,
  }];

  await Invoice.insertMany(
    deals.map((d, i) => ({
      deal: d._id,
      invoiceNumber: `TRIAL-${String(i + 1).padStart(3, "0")}`,
      date: daysFromNow(-10 - i),
      dueDate: daysFromNow(20 - i),
      amount: d.amount,
      status: pick(["Draft", "Sent", "Paid"], i),
      discount: { type: "percentage", value: 0 },
      style: "",
      items: invoiceLineItem(i),
      organization,
      user,
    }))
  );

  await Task.insertMany(
    Array.from({ length: N }, (_, i) => ({
      title: `Trial Demo Task ${i + 1}`,
      description: `Follow up with ${pick(companies, i).name.replace("Trial Demo ", "")}`,
      dueDate: daysFromNow(i + 1),
      status: pick(["Pending", "In Progress", "Completed"], i),
      priority: pick(["low", "medium", "high"], i),
      relatedTo: pick(companies, i)._id,
      relationModel: "Company",
      users: [user],
      createdBy: user,
      organization,
    }))
  );

  await Note.insertMany(
    Array.from({ length: N }, (_, i) => ({
      title: `Trial Demo Note ${i + 1}`,
      note: `<p>Sample note for ${pick(companies, i).name.replace("Trial Demo ", "")}.</p>`,
      noteType: pick(["General Note", "Meeting Note", "Call Note", "Follow-up Note"], i),
      visibility: "Team",
      company: pick(companies, i)._id,
      taggedContacts: [pick(contacts, i)._id],
      user,
      organization,
    }))
  );
}

// Removes exactly the batch seedTrialData created — matched by the "Trial
// Demo" name/title prefix, never by organization alone, so it can't touch
// anything real the org added itself even if named similarly. Called once
// the trial is truly over: either it expires unconverted (cron,
// jobs/subscriptionLifecycleJobs.js) or it converts to a paid plan
// (controllers/subscriptionController.js reconcileMandate) — in both cases
// the demo data has served its purpose and would otherwise sit there
// forever, indistinguishable from real records to anyone who didn't know
// to look for the prefix.
async function deleteTrialDemoData(organization) {
  const prefixMatch = { $regex: "^Trial Demo " };
  await Promise.all([
    Company.deleteMany({ organization, name: prefixMatch }),
    Contact.deleteMany({ organization, name: prefixMatch }),
    Deal.deleteMany({ organization, title: prefixMatch }),
    Invoice.deleteMany({ organization, invoiceNumber: { $regex: "^TRIAL-" } }),
    Task.deleteMany({ organization, title: prefixMatch }),
    Note.deleteMany({ organization, title: prefixMatch }),
  ]);
}

module.exports = seedTrialData;
module.exports.deleteTrialDemoData = deleteTrialDemoData;
