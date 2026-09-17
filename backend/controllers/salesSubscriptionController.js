const { buildFuzzySearchPattern } = require('../utils/searchRegex');
const SalesSubscription = require("../models/SalesSubscription");
const Invoice = require("../models/Invoice");
const Deal = require("../models/Deal");
const Contact = require("../models/Contact");
const Company = require("../models/Company");
const { getDocumentSettingsForOrganization, resolveDocumentNumber, invoiceSeries, releaseInvoiceNumber } = require("../utils/documentNumbering");
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

// Count-based "SUB-00001" — mirrors SalesReturn/PurchaseReturn's own scheme.
async function generateSubscriptionNumber(organizationId) {
  const count = await SalesSubscription.countDocuments({ organization: organizationId });
  return `SUB-${(count + 1).toString().padStart(5, "0")}`;
}

const POPULATE = [
  { path: "deal", populate: [{ path: "contact", select: "name email phone" }, { path: "company", select: "name email phone gstin billingAddress shippingAddresses" }] },
  { path: "items.itemId", select: "name description sellingPrice hsnSac gstRate variants type" },
  { path: "generatedInvoices.invoice", select: "invoiceNumber status amount date" },
];

// Advances a date by the subscription's own billing interval — shared by
// create (seeding the first nextInvoiceDate) and generateInvoiceForSubscription
// (advancing past the cycle that was just billed).
function addInterval(date, { value, unit }) {
  const next = new Date(date);
  const n = parseInt(value, 10) || 1;
  if (unit === "day") next.setDate(next.getDate() + n);
  else if (unit === "week") next.setDate(next.getDate() + n * 7);
  else if (unit === "year") next.setFullYear(next.getFullYear() + n);
  else next.setMonth(next.getMonth() + n); // "month" default
  return next;
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
      endDate: endDate || null,
      nextInvoiceDate: startDate,
      status: status || "Draft",
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
    if (endDate !== undefined) subscription.endDate = endDate || null;
    if (notes !== undefined) subscription.notes = notes;
    if (terms !== undefined) subscription.terms = terms;
    if (status !== undefined) subscription.status = status;

    // Amount always recomputed from the current items (each taxed at its own
    // GST rate) + document-level discount — never trusted from the client,
    // so it can't drift from what a generated invoice would actually total.
    subscription.amount = calculateAmountFromItems(subscription.items, subscription.discount);

    await subscription.save();
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

    const subscription = await SalesSubscription.findOne({ _id: req.params.id, organization: req.user.organization });
    if (!subscription) return res.status(404).json({ message: "Subscription not found" });

    if (subscription.status === "Cancelled") {
      return res.status(400).json({ message: "A Cancelled subscription can't be reactivated — create a new one instead." });
    }

    subscription.status = status;
    // Reactivating out of a paused/errored state needs a real next-billing
    // date to resume from — reseed it if it was cleared.
    if (status === "Active" && !subscription.nextInvoiceDate) {
      subscription.nextInvoiceDate = new Date();
    }
    if (status === "Cancelled") {
      subscription.nextInvoiceDate = null;
    }
    await subscription.save();
    await subscription.populate(POPULATE);
    res.json(subscription);
  } catch (err) {
    console.error("Update sales subscription status error:", err);
    res.status(400).json({ error: err.message });
  }
};

// POST /sales-subscriptions/:id/generate-invoice — manually generate the next
// Invoice from this subscription right now (the "Generate Invoice Now" row
// action). A scheduled job for automatic on-schedule generation would call
// this same function per subscription whose nextInvoiceDate has arrived —
// deliberately factored out so that automation is a thin wrapper around this,
// not a second implementation to keep in sync.
async function generateInvoiceForSubscription(subscription, userId, organizationId) {
  const dealDoc = await Deal.findById(subscription.deal).populate("company");
  if (!dealDoc) throw new Error("Deal for this subscription no longer exists");
  // Invoice.user is required. On the manual path this is always the caller;
  // on the scheduled path it's the subscription's own owner, which older rows
  // may not have — fail with something readable instead of a raw mongoose
  // validation error landing in the subscription's lastError.
  if (!userId) throw new Error("This subscription has no owner to bill under — reassign it and try again");

  const documentSettings = await getDocumentSettingsForOrganization(organizationId);
  const effectivePrefix = documentSettings.documentTypeSettings?.invoice?.prefix || documentSettings.invoicePrefix || "INV-";
  const effectiveSuffix = documentSettings.documentTypeSettings?.invoice?.suffix || documentSettings.invoiceSuffix || "";

  const invoiceNumber = await resolveDocumentNumber({
    Model: Invoice,
    numberField: "invoiceNumber",
    organization: organizationId,
    documentTypeKey: "invoice",
    prefix: effectivePrefix,
    suffix: effectiveSuffix,
  });

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
  // total must never become what a customer is actually billed. Same
  // function the subscription itself uses, so in the normal case they agree.
  const invoiceAmount = calculateAmountFromItems(subscription.items, subscription.discount);
  // A tax invoice is one that actually charges GST — decided by whether any
  // line carries a rate, NOT by the document-level `gstRate` field (which is
  // informational only now that GST is per line item; see
  // calculateAmountFromItems). Reading it from the old field made every
  // subscription a non-tax invoice as soon as the form stopped sending it.
  const chargesGst = (subscription.items || []).some((it) => (parseFloat(it.gstRate) || 0) > 0);

  const invoice = new Invoice({
    deal: subscription.deal,
    invoiceNumber,
    date: new Date(),
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
    // invoice reports under — the total is identical either way, so it's
    // copied straight through and never multiplied into the math above.
    transactionType: subscription.transactionType,
    gstRate: subscription.gstRate,
    user: userId,
    organization: organizationId,
  });

  try {
    await invoice.save();
  } catch (saveErr) {
    // No invoice was created, so its number must not be used up: hand it back to the series.
    const series = invoiceSeries({ organization: organizationId, prefix: effectivePrefix, suffix: effectiveSuffix, date: invoice.date });
    const match = String(invoiceNumber).match(series.pattern);
    if (match) await releaseInvoiceNumber(series, parseInt(match[1], 10));
    throw saveErr;
  }

  // Stock OUT for any product lines — same call every other Invoice creation
  // path uses; services are filtered out inside syncDocumentStock itself.
  try {
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
    });
    invoice.stockMovementStatus = "applied";
    await invoice.save({ validateModifiedOnly: true });
  } catch (stockErr) {
    // A subscription generating an invoice that oversells stock shouldn't
    // silently vanish — the Invoice still exists (Draft), but the
    // subscription itself flips to Error so the user notices and can
    // adjust quantities/stock before the next cycle.
    subscription.status = "Error";
    subscription.lastError = stockErr.message;
    await subscription.save();
    throw stockErr;
  }

  subscription.invoiceCount += 1;
  subscription.generatedInvoices.push({
    invoice: invoice._id,
    invoiceNumber: invoice.invoiceNumber,
    date: invoice.date,
    amount: invoice.amount,
  });

  const advanced = addInterval(subscription.nextInvoiceDate || subscription.startDate, subscription.billingInterval);
  if (subscription.endDate && advanced > new Date(subscription.endDate)) {
    subscription.nextInvoiceDate = null;
    subscription.status = "Expired";
  } else {
    subscription.nextInvoiceDate = advanced;
    if (subscription.status === "Draft") subscription.status = "Active";
  }
  subscription.lastError = "";

  await subscription.save();
  return invoice;
}
exports.generateInvoiceForSubscription = generateInvoiceForSubscription;

exports.generateInvoiceNow = async (req, res) => {
  try {
    const subscription = await SalesSubscription.findOne({ _id: req.params.id, organization: req.user.organization });
    if (!subscription) return res.status(404).json({ message: "Subscription not found" });
    if (subscription.status === "Cancelled") {
      return res.status(400).json({ message: "A Cancelled subscription can't generate invoices." });
    }
    if (subscription.status === "Expired") {
      return res.status(400).json({ message: "This subscription has passed its end date." });
    }

    const invoice = await generateInvoiceForSubscription(subscription, req.user.id, req.user.organization);
    await subscription.populate(POPULATE);
    res.json({ subscription, invoice });
  } catch (err) {
    console.error("Generate invoice from subscription error:", err);
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
