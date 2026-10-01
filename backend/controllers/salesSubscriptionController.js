const mongoose = require("mongoose");
const { buildFuzzySearchPattern } = require('../utils/searchRegex');
const Counter = require("../models/Counter");
const { nextBillingDate } = require("../utils/billingDates");
const SalesSubscription = require("../models/SalesSubscription");
const Invoice = require("../models/Invoice");
const Deal = require("../models/Deal");
const Contact = require("../models/Contact");
const Company = require("../models/Company");
const { getDocumentSettingsForOrganization, resolveDocumentNumber } = require("../utils/documentNumbering");
const { syncDocumentStock } = require("../utils/inventorySync");

// GST is decided PER LINE ITEM, never by one flat rate over the whole
// document — a subscription billing both an 18%-GST product and a 5%-GST
// product must tax each independently, then sum. This mirrors
// shared/documentTemplates.js's computeDocument()/splitGst() exactly (the
// actual engine that renders every generated Invoice's real PDF total), so
// a subscription's stored `amount` never drifts from what that invoice will
// actually show. `discount.type/value` at the document level still applies
// proportionally across every line (a document-wide "10% off everything" is
// legitimately document-level — GST rate is not).
//
// transactionType (intra/inter) deliberately does NOT enter this math: CGST
// 9% + SGST 9% and IGST 18% are the same total either way — that flag only
// changes which tax buckets the printed invoice reports under, decided once
// for the whole document because a document has exactly one buyer/seller
// pair (see the frontend's seller-state vs customer-state comparison).
function calculateAmountFromItems(items, discount) {
  const lines = (items || []).map((item) => {
    const rate = parseFloat(item.rate) || 0;
    const quantity = parseInt(item.quantity, 10) || 0;
    const gstRate = parseFloat(item.gstRate) || 0;
    // A tax-inclusive rate already contains its own GST — extract the
    // taxable value first so it isn't taxed a second time.
    const unitTaxable = item.taxInclusive ? rate / (1 + gstRate / 100) : rate;
    const subtotal = unitTaxable * quantity;
    const lineDiscount = parseFloat(item.discount) || 0;
    const discountedSubtotal =
      item.discountType === "percentage" ? subtotal * (1 - lineDiscount / 100) : subtotal - lineDiscount;
    return { taxable: discountedSubtotal, gstRate };
  });

  const grossTaxable = lines.reduce((sum, l) => sum + l.taxable, 0);
  const discountValue = parseFloat(discount?.value) || 0;
  const documentDiscount =
    discountValue > 0
      ? discount.type === "percentage"
        ? grossTaxable * (discountValue / 100)
        : Math.min(discountValue, grossTaxable)
      : 0;
  // Spreads the flat document-level discount proportionally across every
  // line before taxing, same as computeDocument's netFactor.
  const netFactor = grossTaxable > 0 ? (grossTaxable - documentDiscount) / grossTaxable : 1;

  return lines.reduce((total, l) => {
    const taxable = l.taxable * netFactor;
    const tax = taxable * (l.gstRate / 100);
    return total + taxable + tax;
  }, 0);
}

// A subscription is a recurring-billing agreement with a CUSTOMER, and a Deal
// only becomes a customer once it's Won — an Open deal is still being
// negotiated and a Lost one never converted, so neither may be billed. Deal
// statuses are org-configurable (see authController's default
// ["Open","Won","Lost"] and KanbanBoard.statuses), so this matches on the
// value case-insensitively rather than against a hardcoded enum. The
// frontend's customer dropdown filters by the same rule — this is the
// server-side enforcement of it, since the client list can be stale.
const WON_STATUS = "won";
function isWonDeal(dealDoc) {
  return String(dealDoc?.status || "").trim().toLowerCase() === WON_STATUS;
}

// "SUB-00001" from a per-organization counter, so a deleted subscription's
// number is never handed out again. The counter is seeded once from the highest
// number already in use, so orgs with existing subscriptions carry on from there.
async function generateSubscriptionNumber(organizationId) {
  const counterId = `${organizationId}_sales_subscription`;
  if (!(await Counter.exists({ _id: counterId }))) {
    const rows = await SalesSubscription.find({ organization: organizationId }).select("subscriptionNumber").lean();
    const highest = rows.reduce((max, r) => {
      const n = parseInt(String(r.subscriptionNumber || "").replace(/\D/g, ""), 10);
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);
    await Counter.updateOne({ _id: counterId }, { $max: { seq: Math.max(highest, rows.length) } }, { upsert: true });
  }
  const { seq } = await Counter.findOneAndUpdate({ _id: counterId }, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return `SUB-${String(seq).padStart(5, "0")}`;
}

const POPULATE = [
  { path: "deal", populate: [{ path: "contact", select: "name email phone" }, { path: "company", select: "name email phone gstin billingAddress shippingAddresses" }] },
  { path: "items.itemId", select: "name description sellingPrice hsnSac gstRate variants type" },
  { path: "generatedInvoices.invoice", select: "invoiceNumber status amount date" },
];

// Status lifecycle. Draft -> Active -> Expired, or Draft/Active -> Cancelled.
// Expired and Cancelled are terminal (a new billing period = a new
// subscription). Error is set by the system on a failed generation and can only
// be recovered to Active or abandoned to Cancelled. Expired/Error are never set
// by hand. Both PUT /:id and PUT /:id/status go through this one table.
const ALLOWED_TRANSITIONS = {
  Draft: ["Active", "Cancelled"],
  Active: ["Draft", "Cancelled"], // Active -> Draft is a pause
  Error: ["Active", "Cancelled"],
  Expired: [],
  Cancelled: [],
};

// Applies a status change to a loaded document (not saved). Returns an error
// message string if the change isn't allowed, otherwise null.
function applyStatusTransition(subscription, to) {
  const from = subscription.status;
  if (to === from) return null;
  if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
    if (from === "Cancelled") return "A Cancelled subscription can't be changed — create a new one instead.";
    if (from === "Expired") return "An Expired subscription can't be reactivated — create a new one for another billing period.";
    return `A ${from} subscription can't be set to ${to}.`;
  }
  if (to === "Active") {
    const next = subscription.nextInvoiceDate || new Date();
    if (subscription.endDate && next > new Date(subscription.endDate)) {
      return "This subscription has no billing cycle left before its end date.";
    }
    if (!subscription.nextInvoiceDate) subscription.nextInvoiceDate = next;
  }
  if (to === "Cancelled") subscription.nextInvoiceDate = null;
  subscription.status = to;
  return null;
}

exports.createSalesSubscription = async (req, res) => {
  try {
    const { deal, items, discount, transactionType, gstRate, billingInterval, startDate, endDate, status, notes, terms } = req.body;

    if (!deal) return res.status(400).json({ message: "A customer (Deal) is required" });
    const dealDoc = await Deal.findOne({ _id: deal, organization: req.user.organization });
    if (!dealDoc) return res.status(404).json({ message: "Deal not found" });
    if (!isWonDeal(dealDoc)) {
      return res.status(400).json({
        message: "A subscription can only be created for a Won deal — this deal is still " + (dealDoc.status || "Open") + ".",
      });
    }

    if (!items || items.length === 0) return res.status(400).json({ message: "At least one item is required" });
    if (!startDate) return res.status(400).json({ message: "A start date is required" });
    if (!endDate) return res.status(400).json({ message: "An end date is required" });
    if (new Date(endDate) <= new Date(startDate)) {
      return res.status(400).json({ message: "End date must be after the start date" });
    }

    const finalDiscount = discount && ["fixed", "percentage"].includes(discount.type)
      ? discount
      : { type: "fixed", value: 0 };
    // gstRate stored on the document is informational only now (each item
    // already carries its own real rate) — never multiplied into the total.
    const finalGstRate = parseFloat(gstRate) || 0;
    const finalTxnType = transactionType || "intra";
    const amount = calculateAmountFromItems(items, finalDiscount);

    const subscriptionNumber = await generateSubscriptionNumber(req.user.organization);

    const subscription = new SalesSubscription({
      deal,
      subscriptionNumber,
      items,
      discount: finalDiscount,
      transactionType: finalTxnType,
      gstRate: finalGstRate,
      amount,
      billingInterval: {
        value: parseInt(billingInterval?.value, 10) || 1,
        unit: ["day", "week", "month", "year"].includes(billingInterval?.unit) ? billingInterval.unit : "month",
      },
      startDate,
      endDate,
      nextInvoiceDate: startDate,
      status: status === "Active" ? "Active" : "Draft",
      notes: notes || "",
      terms: terms || "",
      user: req.user.id,
      organization: req.user.organization,
    });

    await subscription.save();
    await subscription.populate(POPULATE);
    res.status(201).json(subscription);
  } catch (err) {
    console.error("Create sales subscription error:", err);
    res.status(400).json({ error: err.message });
  }
};

exports.getAllSalesSubscriptionsWithPagination = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;
    const { search, status, sortBy = "createdAt", sortOrder = "desc" } = req.query;

    const query = { organization: req.user.organization };
    if (search) {
      // The list's Name column renders the customer off the populated deal
      // (deal.contact.name / deal.company.name — see the frontend's
      // customerOf()), which lives in another collection, so a plain $regex
      // on this collection can never match it. Resolve the matching deals
      // first and fold their ids into the $or, otherwise searching a customer
      // name returns nothing even though the search box advertises it.
      const nameRe = { $regex: buildFuzzySearchPattern(search), $options: "i" };
      const [matchingContacts, matchingCompanies] = await Promise.all([
        Contact.find({ organization: req.user.organization, name: nameRe }).select("_id").lean(),
        Company.find({ organization: req.user.organization, name: nameRe }).select("_id").lean(),
      ]);
      const matchingDeals = await Deal.find({
        organization: req.user.organization,
        $or: [
          { contact: { $in: matchingContacts.map((c) => c._id) } },
          { company: { $in: matchingCompanies.map((c) => c._id) } },
          { title: nameRe },
        ],
      })
        .select("_id")
        .lean();

      query.$or = [
        { subscriptionNumber: nameRe },
        { status: nameRe },
        { notes: nameRe },
        { "items.name": nameRe },
        { deal: { $in: matchingDeals.map((d) => d._id) } },
      ];
    }
    if (status) query.status = status;

    if (req.query.allIds === "true") {
      const all = await SalesSubscription.find(query).select("_id").lean();
      return res.json({ ids: all.map((x) => x._id) });
    }

    // "customer" isn't a stored field — it's a display-time fallback chain
    // (deal.contact.name -> deal.company.name -> deal.title, see the
    // frontend's customerOf()) with nothing to sort on directly. Same fix
    // as salesReturnController: resolve the sorted/paginated id order via
    // aggregation, then fetch+populate those rows the normal way.
    let subscriptions, totalCount;
    if (sortBy === "customer" || sortBy === "interval") {
      const dir = sortOrder === "desc" ? -1 : 1;
      const pipeline = [{ $match: query }];

      if (sortBy === "customer") {
        pipeline.push(
          {
            $lookup: {
              from: "deals",
              localField: "deal",
              foreignField: "_id",
              as: "_deal",
            },
          },
          { $unwind: { path: "$_deal", preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: "contacts",
              localField: "_deal.contact",
              foreignField: "_id",
              as: "_contact",
            },
          },
          {
            $lookup: {
              from: "companies",
              localField: "_deal.company",
              foreignField: "_id",
              as: "_company",
            },
          },
          {
            $addFields: {
              _sortKey: {
                $ifNull: [
                  { $arrayElemAt: ["$_contact.name", 0] },
                  { $ifNull: [{ $arrayElemAt: ["$_company.name", 0] }, { $ifNull: ["$_deal.title", ""] }] },
                ],
              },
            },
          }
        );
      } else {
        // "interval" is billingInterval: { value, unit } — sorting the raw
        // embedded object compares its serialized form, not actual
        // recurrence frequency. Convert to an approximate day count instead
        // (matches intervalLabel()'s "Every N <unit>" wording on the
        // frontend, just expressed as a comparable number).
        pipeline.push({
          $addFields: {
            _sortKey: {
              $multiply: [
                { $ifNull: ["$billingInterval.value", 1] },
                {
                  $switch: {
                    branches: [
                      { case: { $eq: ["$billingInterval.unit", "day"] }, then: 1 },
                      { case: { $eq: ["$billingInterval.unit", "week"] }, then: 7 },
                      { case: { $eq: ["$billingInterval.unit", "month"] }, then: 30 },
                      { case: { $eq: ["$billingInterval.unit", "year"] }, then: 365 },
                    ],
                    default: 30,
                  },
                },
              ],
            },
          },
        });
      }

      pipeline.push(
        { $sort: { _sortKey: dir, _id: 1 } },
        {
          $facet: {
            page: [{ $skip: skip }, { $limit: limit }, { $project: { _id: 1 } }],
            total: [{ $count: "count" }],
          },
        }
      );
      const [result] = await SalesSubscription.aggregate(pipeline);
      const orderedIds = (result?.page || []).map((r) => r._id);
      totalCount = result?.total?.[0]?.count || 0;

      const docs = await SalesSubscription.find({ _id: { $in: orderedIds } })
        .populate(POPULATE)
        .lean()
        .select("-__v");
      const byId = new Map(docs.map((d) => [String(d._id), d]));
      subscriptions = orderedIds.map((id) => byId.get(String(id))).filter(Boolean);
    } else {
      [subscriptions, totalCount] = await Promise.all([
        SalesSubscription.find(query)
          .populate(POPULATE)
          .skip(skip)
          .limit(limit)
          .sort({ [sortBy]: sortOrder === "desc" ? -1 : 1 })
          .lean()
          .select("-__v"),
        SalesSubscription.countDocuments(query),
      ]);
    }

    const totalPages = Math.ceil(totalCount / limit);
    res.json({
      subscriptions,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (err) {
    console.error("List sales subscriptions error:", err);
    res.status(500).json({ error: "Failed to fetch subscriptions", message: err.message });
  }
};

exports.getSalesSubscriptionById = async (req, res) => {
  try {
    const row = await SalesSubscription.findOne({ _id: req.params.id, organization: req.user.organization }).populate(POPULATE);
    if (!row) return res.status(404).json({ message: "Subscription not found" });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateSalesSubscription = async (req, res) => {
  try {
    const subscription = await SalesSubscription.findOne({ _id: req.params.id, organization: req.user.organization });
    if (!subscription) return res.status(404).json({ message: "Subscription not found" });

    if (subscription.status === "Cancelled") {
      return res.status(400).json({ message: "A Cancelled subscription can't be edited — create a new one instead." });
    }
    if (subscription.status === "Expired") {
      return res.status(400).json({ message: "An Expired subscription can't be edited — create a new one for another billing period." });
    }

    const { items, discount, transactionType, gstRate, billingInterval, startDate, endDate, status, notes, terms } = req.body;

    if (items !== undefined) {
      if (!items.length) return res.status(400).json({ message: "At least one item is required" });
      subscription.items = items;
    }
    if (discount !== undefined) subscription.discount = discount;
    if (transactionType !== undefined) subscription.transactionType = transactionType;
    if (gstRate !== undefined) subscription.gstRate = parseFloat(gstRate) || 0;
    if (billingInterval !== undefined) {
      subscription.billingInterval = {
        value: parseInt(billingInterval.value, 10) || 1,
        unit: ["day", "week", "month", "year"].includes(billingInterval.unit) ? billingInterval.unit : "month",
      };
    }
    if (startDate !== undefined) {
      subscription.startDate = startDate;
      // Moving the start date only re-aims the schedule while nothing has
      // been billed yet. Once invoices exist, the cycle is already running
      // and nextInvoiceDate belongs to that running cycle — rewriting it
      // would silently re-bill or skip a period the customer already has an
      // invoice for.
      if (subscription.invoiceCount === 0) subscription.nextInvoiceDate = startDate;
    }
    if (endDate !== undefined) {
      if (!endDate) return res.status(400).json({ message: "An end date is required" });
      subscription.endDate = endDate;
    }
    // Only re-check the start/end ordering when this request actually touched
    // one of them — a legacy row saved with endDate: null (grandfathered, see
    // the schema comment) must stay editable for unrelated fields like notes
    // without being forced through this new rule.
    if ((startDate !== undefined || endDate !== undefined) && subscription.endDate) {
      if (new Date(subscription.endDate) <= new Date(subscription.startDate)) {
        return res.status(400).json({ message: "End date must be after the start date" });
      }
    }
    if (notes !== undefined) subscription.notes = notes;
    if (terms !== undefined) subscription.terms = terms;
    // Status goes through the same transition rules as PUT /:id/status; an
    // unchanged value (the edit form always sends it) is a no-op.
    if (status !== undefined) {
      const statusError = applyStatusTransition(subscription, status);
      if (statusError) return res.status(400).json({ message: statusError });
    }

    // Amount always recomputed from the current items (each taxed at its own
    // GST rate) + document-level discount — never trusted from the client,
    // so it can't drift from what a generated invoice would actually total.
    subscription.amount = calculateAmountFromItems(subscription.items, subscription.discount);

    // validateModifiedOnly so a grandfathered null-endDate row can still be
    // edited without tripping the required-endDate rule on an untouched field.
    await subscription.save({ validateModifiedOnly: true });
    await subscription.populate(POPULATE);
    res.json(subscription);
  } catch (err) {
    console.error("Update sales subscription error:", err);
    res.status(400).json({ error: err.message });
  }
};

exports.updateSalesSubscriptionStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ["Draft", "Active", "Expired", "Error", "Cancelled"];
    if (!valid.includes(status)) return res.status(400).json({ message: "Invalid status" });
    if (status === "Expired" || status === "Error") {
      return res.status(400).json({ message: `${status} is set automatically and can't be chosen manually.` });
    }

    const subscription = await SalesSubscription.findOne({ _id: req.params.id, organization: req.user.organization });
    if (!subscription) return res.status(404).json({ message: "Subscription not found" });

    const statusError = applyStatusTransition(subscription, status);
    if (statusError) return res.status(400).json({ message: statusError });
    if (status === "Active") subscription.lastError = "";

    // validateModifiedOnly: this endpoint never touches endDate — a legacy
    // row grandfathered with endDate: null must still be pausable/cancellable.
    await subscription.save({ validateModifiedOnly: true });
    await subscription.populate(POPULATE);
    res.json(subscription);
  } catch (err) {
    console.error("Update sales subscription status error:", err);
    res.status(400).json({ error: err.message });
  }
};

// Shared by POST /:id/generate-invoice ("Generate Invoice Now") and the
// scheduled billing job, so both paths bill identically.
// Thrown when another run (cron tick, other server, manual click) already
// billed this cycle. Not a failure of the subscription — nothing is marked Error.
class CycleAlreadyBilledError extends Error {
  constructor() {
    super("This billing cycle has already been invoiced.");
    this.code = "CYCLE_ALREADY_BILLED";
  }
}

// Marks a subscription Error without full-document validation (a legacy
// null-endDate row must still be able to record its failure).
//
// Only touches the subscription if it's still on the cycle that failed, so a
// stale run that lost a race can't flag a subscription another run just billed.
async function markSubscriptionError(subscription, message) {
  await SalesSubscription.updateOne(
    {
      _id: subscription._id,
      status: { $nin: ["Cancelled", "Expired"] },
      nextInvoiceDate: subscription.nextInvoiceDate ? new Date(subscription.nextInvoiceDate) : null,
      invoiceCount: subscription.invoiceCount,
    },
    { $set: { status: "Error", lastError: message } }
  );
}

// Returns { invoice, subscription } where `subscription` is the fresh
// post-generation document — callers must use it, not the one passed in.
//
// Invoice creation, stock-out and the subscription's cycle advance commit in ONE
// transaction, so a failure leaves no orphan invoice and no half-advanced
// cycle. The cycle is "claimed" by a conditional update on (nextInvoiceDate,
// invoiceCount, status): a concurrent run finds it already moved and gets
// CycleAlreadyBilledError; the unique (salesSubscription, subscriptionCycleDate)
// index on Invoice is the hard backstop. Stock goes out exactly once, here, the
// same way a manually created Invoice does; later edits only apply the delta.
async function generateInvoiceForSubscription(subscription, userId, organizationId) {
  const dealDoc = await Deal.findById(subscription.deal).populate("company");
  if (!dealDoc) throw new Error("Deal for this subscription no longer exists");
  // Invoice.user is required. On the manual path this is always the caller;
  // on the scheduled path it's the subscription's own owner, which older rows
  // may not have — fail with something readable instead of a raw mongoose
  // validation error landing in the subscription's lastError.
  if (!userId) throw new Error("This subscription has no owner to bill under — reassign it and try again");

  // The cycle this invoice covers.
  const cycleDate = new Date(subscription.nextInvoiceDate || subscription.startDate);
  if (subscription.endDate && cycleDate > new Date(subscription.endDate)) {
    await SalesSubscription.updateOne(
      { _id: subscription._id, status: { $nin: ["Cancelled", "Expired"] } },
      { $set: { status: "Expired", nextInvoiceDate: null } }
    );
    throw new Error("This subscription has passed its end date.");
  }
  // The invoice is dated the cycle it covers (so a catch-up run after downtime
  // doesn't re-date it). A manual "generate now" ahead of schedule is dated
  // today rather than in the future; the cycle date is still what's recorded.
  const invoiceDate = cycleDate > new Date() ? new Date() : cycleDate;

  const documentSettings = await getDocumentSettingsForOrganization(organizationId);
  const effectivePrefix = documentSettings.documentTypeSettings?.invoice?.prefix || documentSettings.invoicePrefix || "INV-";
  const effectiveSuffix = documentSettings.documentTypeSettings?.invoice?.suffix || documentSettings.invoiceSuffix || "";

  let billingAddress = {};
  let shippingAddress = {};
  let receiverGSTIN = "";
  if (dealDoc.company) {
    billingAddress = dealDoc.company.billingAddress || {};
    shippingAddress = dealDoc.company.shippingAddresses?.[0] || {};
    receiverGSTIN = dealDoc.company.gstin || "";
  }

  // The invoice recalculates its own total from the item lines rather than
  // trusting the subscription's stored `amount` — a stale/hand-edited stored
  // total must never become what a customer is actually billed.
  const invoiceAmount = calculateAmountFromItems(subscription.items, subscription.discount);
  // A tax invoice is one that actually charges GST — decided by whether any
  // line carries a rate, NOT by the informational document-level `gstRate`.
  const chargesGst = (subscription.items || []).some((it) => (parseFloat(it.gstRate) || 0) > 0);

  const advanced = nextBillingDate(subscription.startDate, subscription.billingInterval, cycleDate);
  const pastEnd = subscription.endDate && advanced > new Date(subscription.endDate);

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // resolveDocumentNumber hooks session.abortTransaction to give an unused
    // auto-number back, so a rolled-back run doesn't burn an invoice number.
    const invoiceNumber = await resolveDocumentNumber({
      Model: Invoice,
      numberField: "invoiceNumber",
      organization: organizationId,
      documentTypeKey: "invoice",
      prefix: effectivePrefix,
      suffix: effectiveSuffix,
      date: invoiceDate,
      session,
    });

    const invoiceId = new mongoose.Types.ObjectId();

    const claimed = await SalesSubscription.findOneAndUpdate(
      {
        _id: subscription._id,
        organization: organizationId,
        status: { $in: ["Draft", "Active", "Error"] },
        nextInvoiceDate: subscription.nextInvoiceDate ? new Date(subscription.nextInvoiceDate) : null,
        invoiceCount: subscription.invoiceCount,
      },
      {
        $inc: { invoiceCount: 1 },
        $push: { generatedInvoices: { invoice: invoiceId, invoiceNumber, date: invoiceDate, amount: invoiceAmount } },
        $set: {
          nextInvoiceDate: pastEnd ? null : advanced,
          status: pastEnd ? "Expired" : "Active",
          lastError: "",
        },
      },
      { new: true, session }
    );
    if (!claimed) throw new CycleAlreadyBilledError();

    const invoiceDueDate = new Date(invoiceDate);
    invoiceDueDate.setDate(invoiceDueDate.getDate() + 7);

    const invoice = new Invoice({
      _id: invoiceId,
      deal: subscription.deal,
      invoiceNumber,
      date: invoiceDate,
      // Default payment window: 7 days from invoice date. The user can edit
      // the due date on the invoice itself after it is generated.
      dueDate: invoiceDueDate,
      amount: invoiceAmount,
      discount: subscription.discount,
      status: "Draft",
      items: subscription.items,
      notes: `Generated from Subscription ${subscription.subscriptionNumber}${subscription.notes ? `\n${subscription.notes}` : ""}`,
      terms: subscription.terms || "",
      isTaxInvoice: chargesGst,
      receiverGSTIN,
      billingAddress,
      shippingAddress,
      // intra/inter only decides the CGST+SGST vs IGST split the printed
      // invoice reports under — the total is identical either way.
      transactionType: subscription.transactionType,
      gstRate: subscription.gstRate,
      salesSubscription: subscription._id,
      subscriptionCycleDate: cycleDate,
      user: userId,
      organization: organizationId,
    });
    await invoice.save({ session });

    // Stock OUT for product lines, once — same call every other Invoice
    // creation path uses; services are filtered out inside syncDocumentStock.
    await syncDocumentStock({
      organization: organizationId,
      documentId: invoice._id,
      documentModel: "Invoice",
      documentNumber: invoice.invoiceNumber,
      items: invoice.items,
      previousItems: [],
      baseDirection: "out",
      userId,
      reason: "sale",
      isReversal: false,
      session,
    });
    invoice.stockMovementStatus = "applied";
    await invoice.save({ session, validateModifiedOnly: true });

    await session.commitTransaction();
    return { invoice, subscription: claimed };
  } catch (err) {
    await session.abortTransaction();
    // Another run won the race: either it hit our duplicate-cycle index, or two
    // transactions wrote the same subscription at once and this one was rolled
    // back as a write conflict (Mongo labels that TransientTransactionError).
    const isWriteConflict = err?.code === 112 || err?.hasErrorLabel?.("TransientTransactionError");
    const isDuplicateCycle = err?.code === 11000 && /subscriptionCycleDate|salesSubscription/.test(err.message || "");
    if (isWriteConflict || isDuplicateCycle) throw new CycleAlreadyBilledError();
    // Nothing was committed, so the subscription is untouched: flag it so the
    // user notices (a stock shortage, a bad deal, ...) and can fix it and set it
    // back to Active. The cycle date hasn't moved, so retrying bills it once.
    if (!(err instanceof CycleAlreadyBilledError)) {
      try {
        await markSubscriptionError(subscription, err.message);
      } catch (markErr) {
        console.error("Could not record subscription error state:", markErr.message);
      }
    }
    throw err;
  } finally {
    session.endSession();
  }
}
exports.generateInvoiceForSubscription = generateInvoiceForSubscription;
exports.CycleAlreadyBilledError = CycleAlreadyBilledError;

exports.generateInvoiceNow = async (req, res) => {
  try {
    const found = await SalesSubscription.findOne({ _id: req.params.id, organization: req.user.organization });
    if (!found) return res.status(404).json({ message: "Subscription not found" });
    if (found.status === "Cancelled") {
      return res.status(400).json({ message: "A Cancelled subscription can't generate invoices." });
    }
    if (found.status === "Expired") {
      return res.status(400).json({ message: "This subscription has passed its end date." });
    }

    const { invoice, subscription } = await generateInvoiceForSubscription(found, req.user.id, req.user.organization);
    await subscription.populate(POPULATE);
    res.json({ subscription, invoice });
  } catch (err) {
    console.error("Generate invoice from subscription error:", err);
    if (err.code === "CYCLE_ALREADY_BILLED") return res.status(409).json({ message: err.message });
    res.status(400).json({ error: err.message });
  }
};

exports.deleteSalesSubscription = async (req, res) => {
  try {
    const subscription = await SalesSubscription.findOne({ _id: req.params.id, organization: req.user.organization });
    if (!subscription) return res.status(404).json({ message: "Subscription not found" });
    // Deleting the subscription record only stops future generation — it
    // never touches invoices already generated from it (they're independent
    // documents at that point, same as an Invoice surviving its Deal being
    // archived elsewhere in this app).
    await subscription.deleteOne();
    res.json({ message: "Subscription deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
