// Verifies Invoice numbering (utils/documentNumbering.js invoice series) against a real,
// in-memory MongoDB replica set: transactions, the unique index and concurrency are all real.
//   node scripts/verifyInvoiceNumbering.js
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const Invoice = require("../models/Invoice");
const Counter = require("../models/Counter");
const {
  resolveDocumentNumber,
  getNextNumberPreviews,
  saveDocumentSettingsForOrganization,
  invoiceSeries,
  releaseInvoiceNumber,
} = require("../utils/documentNumbering");
const { updateInvoiceNumber } = require("../controllers/invoiceController");

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  ->  ${detail}` : ""}`);
};

let org;
const oid = () => new mongoose.Types.ObjectId();
const FY_THIS = "2026-09-17";
const FY_NEXT = "2027-04-01";

// Same sequence createInvoice follows: transaction, resolve number, save, commit (or abort).
async function createInvoice({ number = null, prefix = "INV-", suffix = "", date = FY_THIS, fail = false } = {}) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const invoiceNumber = await resolveDocumentNumber({
      Model: Invoice, numberField: "invoiceNumber", organization: org, documentTypeKey: "invoice",
      prefix, suffix, providedNumber: number, session, date,
    });
    await new Invoice({
      deal: oid(), invoiceNumber, date: new Date(date), amount: 100, status: "Draft",
      discount: { type: "fixed", value: 0 }, user: oid(), organization: org,
    }).save({ session });
    if (fail) throw new Error("simulated failure after the number was taken");
    await session.commitTransaction();
    return invoiceNumber;
  } catch (err) {
    await session.abortTransaction();
    if (fail) return null;
    return `ERROR: ${err.message}`;
  } finally {
    session.endSession();
  }
}

const fresh = async () => {
  org = oid();
};

(async () => {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  await mongoose.connect(replSet.getUri());
  await Invoice.syncIndexes();
  await Counter.createCollection();

  // 1. Auto 1 -> 2 -> 3 -> 4
  await fresh();
  const auto = [await createInvoice(), await createInvoice(), await createInvoice(), await createInvoice()];
  check("Auto: 1 -> 2 -> 3 -> 4", auto.join(",") === "INV-1,INV-2,INV-3,INV-4", auto.join(", "));

  // 2. Manual 7 after 4 -> next auto 8
  const manual7 = await createInvoice({ number: "7" });
  const after7 = await createInvoice();
  check("Manual 4 -> 7 -> next auto = 8", manual7 === "INV-7" && after7 === "INV-8", `${manual7}, ${after7}`);

  // 3. Manual number already used -> blocked
  const dup = await createInvoice({ number: "7" });
  check("Manual number already exists -> blocked", /already in use/.test(dup), dup);

  // 4. Manual number in a gap -> allowed, next auto still follows the highest
  const gap = await createInvoice({ number: "5" });
  const afterGap = await createInvoice();
  check("Manual number in a gap -> next auto follows highest used", gap === "INV-5" && afterGap === "INV-9", `${gap}, ${afterGap}`);

  // 5. Existing organization with old invoices (no counter) -> no restart at 1
  await fresh();
  for (const n of ["INV-1", "INV-2", "INV-3", "INV-41"]) {
    await new Invoice({ deal: oid(), invoiceNumber: n, date: new Date(FY_THIS), amount: 1, status: "Draft", discount: { type: "fixed", value: 0 }, user: oid(), organization: org }).save();
  }
  const legacyNext = await createInvoice();
  check("Existing org with old invoices -> continues after highest", legacyNext === "INV-42", legacyNext);

  // 6. Prefix change -> fresh series
  await fresh();
  await createInvoice(); await createInvoice();
  const newPrefix = await createInvoice({ prefix: "SALES-" });
  const backToOld = await createInvoice();
  check("Prefix change -> fresh series (old prefix continues)", newPrefix === "SALES-1" && backToOld === "INV-3", `${newPrefix}, ${backToOld}`);

  // 7. New financial year -> fresh series (same number allowed in a different FY)
  await fresh();
  await createInvoice({ date: "2027-03-31" }); await createInvoice({ date: "2027-03-31" });
  const nextFy = await createInvoice({ date: FY_NEXT });
  check("New financial year -> fresh series", nextFy === "INV-1", nextFy);

  // 8. Settings starting number actually used (and preview agrees)
  await fresh();
  await saveDocumentSettingsForOrganization(org, { nextInvoiceNumber: 100, documentTypeSettings: { invoice: { prefix: "INV-" } } });
  const preview = (await getNextNumberPreviews(org)).invoice;
  const fromSetting = await createInvoice({ date: new Date().toISOString().slice(0, 10) });
  check("Settings starting number -> used (preview matches)", fromSetting === "INV-100" && preview === 100, `preview ${preview}, created ${fromSetting}`);
  await saveDocumentSettingsForOrganization(org, { nextInvoiceNumber: 5, documentTypeSettings: { invoice: { prefix: "INV-" } } });
  const notLowered = await createInvoice({ date: new Date().toISOString().slice(0, 10) });
  check("Settings lower than used -> never goes back (no duplicate)", notLowered === "INV-101", notLowered);

  // 9. Concurrent auto creation -> no duplicates
  await fresh();
  const concurrent = await Promise.all(Array.from({ length: 20 }, () => createInvoice()));
  const numbers = concurrent.filter((n) => n && !n.startsWith("ERROR"));
  const unique = new Set(numbers);
  check("Concurrent auto creation (20 at once) -> all saved, no duplicate", numbers.length === 20 && unique.size === 20, `${numbers.length} saved, ${unique.size} unique, errors: ${concurrent.filter((n) => n.startsWith && n.startsWith("ERROR")).length}`);

  // 10. Failed create (transaction aborted) -> number not consumed
  await fresh();
  await createInvoice();
  await createInvoice({ fail: true });
  const afterFail = await createInvoice();
  check("Failed create -> number not consumed", afterFail === "INV-2", afterFail);

  // 11. Failed subscription invoice (no transaction) -> number not consumed
  await fresh();
  await createInvoice();
  const subNumber = await resolveDocumentNumber({ Model: Invoice, numberField: "invoiceNumber", organization: org, documentTypeKey: "invoice", prefix: "INV-", suffix: "", date: new Date() });
  const series = invoiceSeries({ organization: org, prefix: "INV-", suffix: "", date: new Date() });
  // what salesSubscriptionController does when invoice.save() throws:
  await releaseInvoiceNumber(series, parseInt(subNumber.match(series.pattern)[1], 10));
  const afterSubFail = await createInvoice({ date: new Date().toISOString().slice(0, 10) });
  check("Failed subscription invoice -> number not consumed", subNumber === "INV-2" && afterSubFail === "INV-2", `taken ${subNumber}, next ${afterSubFail}`);

  // 12. Database-level guard: a duplicate insert is rejected by the unique index
  let indexBlocked = false;
  try {
    await new Invoice({ deal: oid(), invoiceNumber: "INV-2", date: new Date(), amount: 1, status: "Draft", discount: { type: "fixed", value: 0 }, user: oid(), organization: org }).save();
  } catch (e) { indexBlocked = e.code === 11000; }
  check("Unique index blocks a duplicate invoice number in the same FY", indexBlocked);

  // 13. Change an existing invoice's number (edit) -> duplicate blocked, later autos continue after it
  await fresh();
  await createInvoice(); await createInvoice({ date: FY_THIS });
  const target = await Invoice.findOne({ organization: org, invoiceNumber: "INV-2" });
  const call = async (invoiceNumber) => {
    let status = 200; let body;
    const res = { status(c) { status = c; return this; }, json(b) { body = b; return this; } };
    await updateInvoiceNumber({ body: { invoiceNumber }, params: { id: String(target._id) }, user: { organization: org } }, res);
    return { status, body };
  };
  const dupEdit = await call("INV-1");
  const okEdit = await call("INV-20");
  const afterEdit = await createInvoice();
  check("Edit number: duplicate blocked", dupEdit.status === 409, `status ${dupEdit.status}`);
  check("Edit number: jump to 20 -> next auto 21", okEdit.status === 200 && afterEdit === "INV-21", `${okEdit.status}, next ${afterEdit}`);

  // 14. Reopen/edit keeps the number: saving an invoice again doesn't change it
  const reopened = await Invoice.findById(target._id);
  reopened.amount = 999;
  await reopened.save();
  check("Reopen + save keeps the same number", (await Invoice.findById(target._id)).invoiceNumber === "INV-20");

  await mongoose.disconnect();
  await replSet.stop();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
