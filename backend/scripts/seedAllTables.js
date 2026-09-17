// One-off: seeds >=10 rows into each core CRM table for a user's organization,
// reusing existing companies/contacts (which already have data).
// Usage: node scripts/seedAllTables.js [email] [countPerTable]
const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config({ quiet: true });

const User = require("../models/User");
const Company = require("../models/Company");
const Contact = require("../models/Contact");
const Deal = require("../models/Deal");
const Invoice = require("../models/Invoice");
const Task = require("../models/Task");
const Meeting = require("../models/Meeting");
const Note = require("../models/Note");
const CallLog = require("../models/CallLog");
const Vendor = require("../models/Vendor");
const Item = require("../models/Item");
const PurchaseOrder = require("../models/PurchaseOrder");
const Purchase = require("../models/Purchase");
const Quotation = require("../models/quotation");
const ProformaInvoice = require("../models/ProformaInvoice");
const DeliveryChallan = require("../models/deliveryChallan");
const VendorNote = require("../models/VendorNote");

const EMAIL = process.argv[2] || "rohit.zore@datacircles.in";
const N = parseInt(process.argv[3], 10) || 12;

const pick = (a, i) => a[i % a.length];
const daysFromNow = (d) => new Date(Date.now() + d * 86400000);

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected");
  const user = await User.findOne({ email: EMAIL });
  if (!user || !user.organization) {
    console.error("User/org not found for", EMAIL);
    process.exit(1);
  }
  const org = user.organization;
  const uid = user._id;
  const base = { organization: org, user: uid, createdBy: uid, lastUpdatedBy: uid };

  const companies = await Company.find({ organization: org }).select("_id name").limit(50);
  const contacts = await Contact.find({ organization: org }).select("_id name").limit(50);
  if (!companies.length) { console.error("No companies to reference"); process.exit(1); }

  const report = {};
  const add = (k, arr) => { report[k] = arr.length; };

  // ---- Vendors ----
  const vendorsData = Array.from({ length: N }, (_, i) => ({
    name: `Vendor ${i + 1} Supplies`,
    email: `vendor${i + 1}@supplies.com`,
    phone: `+1-555-2${String(1000 + i).slice(-4)}`,
    company: `Vendor Co ${i + 1}`,
    address: { line1: `${100 + i} Supply Rd`, city: "Supply City", state: "CA", pincode: "90001", country: "USA" },
    organization: org, user: uid,
  }));
  const vendors = await Vendor.insertMany(vendorsData);
  add("Vendor", vendors);

  // ---- Items ----
  const itemsData = Array.from({ length: N }, (_, i) => ({
    type: i % 2 === 0 ? "product" : "service",
    name: `Item ${i + 1}`,
    description: `Sample item ${i + 1}`,
    purchasePrice: 100 + i * 20,
    sellingPrice: 200 + i * 30,
    hsnSac: "8471",
    organization: org, user: uid,
  }));
  const items = await Item.insertMany(itemsData);
  add("Item", items);

  // ---- Deals ----
  const dealsData = Array.from({ length: N }, (_, i) => ({
    title: `Sample Deal ${i + 1}`,
    amount: 5000 + i * 1500,
    status: pick(["Open", "Won", "Lost"], i),
    contact: contacts.length ? pick(contacts, i)._id : undefined,
    company: pick(companies, i)._id,
    ...base,
    additionalFields: [],
  }));
  const deals = await Deal.insertMany(dealsData);
  add("Deal", deals);

  const lineItems = (i) => [{
    itemId: pick(items, i)._id,
    name: pick(items, i).name,
    description: `Line for #${i + 1}`,
    rate: pick(items, i).sellingPrice,
    quantity: 5 + i,
    discountType: "percentage",
    discount: 0,
  }];

  // ---- Invoices ----
  const invData = deals.slice(0, N).map((d, i) => ({
    deal: d._id, invoiceNumber: `INV-SEED-${i + 1}`,
    date: daysFromNow(-10 - i), dueDate: daysFromNow(20 - i),
    amount: d.amount, user: uid, organization: org,
    status: pick(["Draft", "Sent", "Paid"], i),
    discount: { type: "percentage", value: 5 }, style: "",
    items: lineItems(i),
  }));
  add("Invoice", await Invoice.insertMany(invData));

  // ---- Quotations ----
  const quoData = deals.slice(0, N).map((d, i) => ({
    deal: d._id, quotationNumber: `QUO-SEED-${i + 1}`,
    date: daysFromNow(-5 - i), amount: d.amount, user: uid, organization: org,
    status: pick(["Draft", "Sent", "Accepted"], i),
    discount: { type: "percentage", value: 5 }, style: "",
    items: lineItems(i),
  }));
  add("Quotation", await Quotation.insertMany(quoData));

  // ---- Proforma Invoices ----
  const proData = deals.slice(0, N).map((d, i) => ({
    deal: d._id, performaInvoiceNumber: `PRO-SEED-${i + 1}`,
    date: daysFromNow(-5 - i), amount: d.amount, user: uid, organization: org,
    status: pick(["Draft", "Sent"], i),
    discount: { type: "percentage", value: 5 }, style: "",
    items: lineItems(i),
  }));
  add("ProformaInvoice", await ProformaInvoice.insertMany(proData));

  // ---- Delivery Challans ----
  const dcData = deals.slice(0, N).map((d, i) => ({
    deal: d._id, deliveryChallanNumber: `DC-SEED-${i + 1}`,
    date: daysFromNow(-3 - i), amount: d.amount, user: uid, organization: org,
    status: pick(["Draft", "Delivered"], i),
    discount: { type: "percentage", value: 0 }, style: "",
    items: lineItems(i),
  }));
  add("DeliveryChallan", await DeliveryChallan.insertMany(dcData));

  // ---- Tasks ----
  const taskData = Array.from({ length: N }, (_, i) => ({
    title: `Sample Task ${i + 1}`,
    description: `Follow up item ${i + 1}`,
    dueDate: daysFromNow(i + 1),
    status: pick(["Pending", "Completed"], i),
    priority: pick(["low", "medium", "high"], i),
    relatedTo: pick(companies, i)._id, relationModel: "Company",
    users: [uid], createdBy: uid, organization: org,
  }));
  add("Task", await Task.insertMany(taskData));

  // ---- Meetings ----
  const meetData = Array.from({ length: N }, (_, i) => ({
    title: `Sample Meeting ${i + 1}`,
    description: `Discussion ${i + 1}`,
    scheduledAt: daysFromNow(i + 1), duration: 60,
    status: pick(["scheduled", "completed", "cancelled"], i),
    meetingType: pick(["in-person", "video-call", "phone-call"], i),
    company: pick(companies, i)._id, linkedTo: "company",
    createdBy: uid, organization: org,
  }));
  add("Meeting", await Meeting.insertMany(meetData));

  // ---- Notes ----
  const noteData = Array.from({ length: N }, (_, i) => ({
    title: `Sample Note ${i + 1}`,
    note: `<p>Seeded note content ${i + 1}</p>`,
    noteType: pick(["General Note", "Meeting Note", "Call Note", "Follow-up Note"], i),
    visibility: pick(["Team", "Private"], i),
    company: pick(companies, i)._id,
    taggedContacts: contacts.length ? [pick(contacts, i)._id] : [],
    user: uid, organization: org,
  }));
  add("Note", await Note.insertMany(noteData));

  // ---- Call Logs ----
  if (contacts.length) {
    const clData = Array.from({ length: N }, (_, i) => ({
      contact: pick(contacts, i)._id, user: uid, organization: org,
      callType: pick(["Inbound", "Outbound"], i),
      status: pick(["Connected", "Missed", "Voicemail", "No Answer"], i),
      duration: 60 + i * 30, notes: `Call note ${i + 1}`,
    }));
    add("CallLog", await CallLog.insertMany(clData));
  }

  // ---- Purchase Orders ----
  const poData = vendors.slice(0, N).map((v, i) => ({
    vendor: v._id, poNumber: `PO-SEED-${i + 1}`, orderDate: daysFromNow(-7 - i),
    items: [{ itemId: pick(items, i)._id, name: pick(items, i).name, quantity: 10 + i, unitPrice: pick(items, i).purchasePrice, total: (10 + i) * pick(items, i).purchasePrice }],
    totalAmount: (10 + i) * pick(items, i).purchasePrice,
    paymentTerms: "Net 30", status: pick(["Pending", "Approved", "Delivered"], i),
    notes: `PO for ${v.name}`, user: uid, organization: org,
  }));
  const pos = await PurchaseOrder.insertMany(poData);
  add("PurchaseOrder", pos);

  // ---- Purchases ----
  const purData = pos.slice(0, N).map((po, i) => ({
    vendor: po.vendor, purchaseOrder: po._id, purchaseNumber: `PUR-SEED-${i + 1}`,
    purchaseDate: daysFromNow(-5 - i),
    items: [{ itemId: pick(items, i)._id, name: pick(items, i).name, quantity: 10 + i, unitPrice: pick(items, i).purchasePrice, total: (10 + i) * pick(items, i).purchasePrice }],
    grandTotal: (10 + i) * pick(items, i).purchasePrice,
    status: pick(["Draft", "Paid"], i), notes: `Purchase ${i + 1}`, user: uid, organization: org,
  }));
  add("Purchase", await Purchase.insertMany(purData));

  // ---- Vendor Notes ----
  const vnData = vendors.slice(0, N).map((v, i) => ({
    note: `Vendor note ${i + 1}`, vendor: v._id, user: uid, organization: org,
  }));
  try { add("VendorNote", await VendorNote.insertMany(vnData)); }
  catch (e) { console.log("VendorNote skipped:", e.message.split("\n")[0]); }

  console.log("Seeded per table:", report);
  process.exit(0);
}

run().catch((e) => { console.error("Seed error:", e); process.exit(1); });
