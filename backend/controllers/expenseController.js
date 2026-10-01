const Expense = require("../models/Expense");
const { EXPENSE_CATEGORIES, INCOME_CATEGORIES } = require("../models/Expense");
// `list` populates vendor and bankAccount, so both schemas must be registered
// before it runs. Required here rather than left to whatever else happened to
// load first — a script or job that only pulls in this controller would
// otherwise fail with MissingSchemaError.
require("../models/Vendor");
require("../models/BankDetails");
const Deal = require("../models/Deal");
const mongoose = require("mongoose");
const Branding = require("../models/Branding");
const expenseReceiptPdf = require("../utils/expenseReceiptPdf");

// Both Expenses and Indirect Income run through here — they're the same record
// with a different `kind`, so the CRUD is shared and the kind comes in as a
// query/body field rather than being duplicated across two controllers.
const parseKind = (value) => (value === "income" ? "income" : "expense");

const MAX_ATTACHMENTS = 3;
const BASE_CURRENCY = "INR";

// Converts a possibly-foreign amount into the base currency, which is what
// gets stored in `amount`. Done server-side so a client can't post an amount
// and a rate that disagree with each other.
const resolveAmount = (body) => {
  const currency = String(body.currency || BASE_CURRENCY).toUpperCase();
  const typed = Number(body.amount);

  if (currency === BASE_CURRENCY) {
    return { amount: typed, currency: BASE_CURRENCY, exchangeRate: 1, foreignAmount: null };
  }

  const rate = Number(body.exchangeRate);
  if (!rate || rate <= 0) {
    const err = new Error(`Enter an exchange rate for ${currency}.`);
    err.statusCode = 400;
    throw err;
  }

  return {
    // Rounded to paise — an unrounded conversion leaves totals ending in
    // fractions of a paisa that never quite add up on screen.
    amount: Math.round(typed * rate * 100) / 100,
    currency,
    exchangeRate: rate,
    foreignAmount: typed,
  };
};

// The client caps this too, but a limit that only exists in the UI isn't a
// limit. Anything without a url is dropped rather than stored half-formed.
const normalizeAttachments = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((a) => a && a.url)
    .slice(0, MAX_ATTACHMENTS)
    .map((a) => ({
      url: a.url,
      name: a.name || "",
      size: Number(a.size) || 0,
      mimeType: a.mimeType || "",
    }));
};

// The optional Deal association. Returns the Deal id to store, or null for "no
// deal". An id that isn't a real Deal in this organisation is rejected rather
// than stored — the association is only ever what the user explicitly picked.
const resolveDeal = async (value, organizationId) => {
  if (!value) return null;
  if (!mongoose.Types.ObjectId.isValid(value)) {
    const err = new Error("Selected deal was not found.");
    err.statusCode = 400;
    throw err;
  }
  const exists = await Deal.exists({ _id: value, organization: organizationId });
  if (!exists) {
    const err = new Error("Selected deal was not found.");
    err.statusCode = 400;
    throw err;
  }
  return value;
};

// A "Paid" entry must carry the settlement fields; a "Pending" one must not
// keep stale ones from a previous save. Normalised in one place so create and
// update can't drift apart.
const normalizePaymentFields = (body, target) => {
  const isPaid = body.status === "Paid";
  target.status = isPaid ? "Paid" : "Pending";
  if (isPaid) {
    target.paymentDate = body.paymentDate ? new Date(body.paymentDate) : new Date();
    target.paymentType = body.paymentType || "UPI";
    target.bankAccount = body.bankAccount || null;
    target.paymentNotes = body.paymentNotes || "";
  } else {
    target.paymentDate = null;
    target.paymentType = "";
    target.bankAccount = null;
    target.paymentNotes = "";
  }
};

// GET /api/expenses?kind=expense|income&search=&status=&page=&limit=
exports.list = async (req, res) => {
  try {
    const orgId = req.user.organization;
    const kind = parseKind(req.query.kind);
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 25, 1), 200);

    const query = { organization: orgId, kind };

    // Records associated with one Deal (the Deal page's list). Just a filter:
    // the summary totals below stay org-wide for the kind, as before.
    if (req.query.dealId) {
      if (!mongoose.Types.ObjectId.isValid(req.query.dealId)) {
        return res.status(400).json({ error: "Selected deal was not found." });
      }
      query.deal = req.query.dealId;
    }

    if (req.query.status && ["Pending", "Paid"].includes(req.query.status)) {
      query.status = req.query.status;
    }

    const search = (req.query.search || "").trim();
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.$or = [
        { category: rx },
        { notes: rx },
        { paymentType: rx },
        // Lets "1200" find a ₹1,200 entry, matching how the invoice search
        // already lets you search by amount.
        ...(Number.isNaN(Number(search)) ? [] : [{ amount: Number(search) }]),
      ];
    }

    // Current-month window for the "This Month" KPI.
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [rows, totalCount, totals, monthAgg] = await Promise.all([
      Expense.find(query)
        .populate("vendor", "name companyName email phone gstin")
        .populate("bankAccount", "bank accountNumber")
        .populate("deal", "title")
        .sort({ date: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Expense.countDocuments(query),
      // Totals span every matching row, not just this page — the same reason
      // the payments timeline computes its KPIs server-side.
      Expense.aggregate([
        { $match: { organization: orgId, kind } },
        { $group: { _id: "$status", total: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
      Expense.aggregate([
        { $match: { organization: orgId, kind, date: { $gte: monthStart, $lt: monthEnd } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
    ]);

    const paid = totals.find((t) => t._id === "Paid") || { total: 0, count: 0 };
    const pending = totals.find((t) => t._id === "Pending") || { total: 0, count: 0 };
    const thisMonthTotal = monthAgg[0]?.total || 0;

    res.json({
      documents: rows,
      pagination: {
        currentPage: page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasNextPage: page * limit < totalCount,
        hasPrevPage: page > 1,
      },
      summary: {
        total: paid.total + pending.total,
        paidTotal: paid.total,
        pendingTotal: pending.total,
        paidCount: paid.count,
        pendingCount: pending.count,
        count: paid.count + pending.count,
        thisMonthTotal,
      },
    });
  } catch (err) {
    console.error("List expenses error:", err);
    res.status(500).json({ error: "Failed to fetch records" });
  }
};

// Live exchange rates, cached in memory.
//
// Rates are fetched per base currency and held for an hour. Without the cache
// every keystroke-driven currency change would hit the provider, and for
// recording an expense an hour-old rate is indistinguishable from a live one.
// The cache is per-process, so it simply warms again after a restart.
const RATE_CACHE_TTL_MS = 60 * 60 * 1000;
const rateCache = new Map();

// GET /api/expenses/exchange-rate?from=USD
// Returns how many base-currency units one `from` unit buys.
exports.exchangeRate = async (req, res) => {
  const from = String(req.query.from || "").toUpperCase().trim();

  if (!from || !/^[A-Z]{3}$/.test(from)) {
    return res.status(400).json({ error: "A three-letter currency code is required." });
  }
  if (from === BASE_CURRENCY) {
    return res.json({ from, to: BASE_CURRENCY, rate: 1, cached: false });
  }

  const cached = rateCache.get(from);
  if (cached && Date.now() - cached.fetchedAt < RATE_CACHE_TTL_MS) {
    return res.json({ from, to: BASE_CURRENCY, rate: cached.rate, fetchedAt: cached.fetchedAt, cached: true });
  }

  try {
    // Aborted rather than left hanging: a slow provider must not hold the
    // form's rate field waiting indefinitely.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const response = await fetch(`https://open.er-api.com/v6/latest/${from}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await response.json();
    const rate = data?.rates?.[BASE_CURRENCY];

    if (!response.ok || data?.result !== "success" || !rate) {
      throw new Error(`No ${BASE_CURRENCY} rate returned for ${from}`);
    }

    rateCache.set(from, { rate, fetchedAt: Date.now() });
    res.json({ from, to: BASE_CURRENCY, rate, fetchedAt: Date.now(), cached: false });
  } catch (err) {
    console.error("Exchange rate lookup failed:", err.message);
    // A stale cached rate beats no rate at all - the alternative is making the
    // user look one up by hand because the provider blipped.
    if (cached) {
      return res.json({
        from,
        to: BASE_CURRENCY,
        rate: cached.rate,
        fetchedAt: cached.fetchedAt,
        cached: true,
        stale: true,
      });
    }
    res.status(503).json({ error: "Couldn't fetch a live rate. Enter it manually." });
  }
};

// GET /api/expenses/categories?kind=expense|income
exports.categories = (req, res) => {
  const kind = parseKind(req.query.kind);
  res.json({ categories: kind === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES });
};

// POST /api/expenses
exports.create = async (req, res) => {
  try {
    const amount = Number(req.body.amount);
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Enter an amount greater than zero." });
    }

    const converted = resolveAmount(req.body);
    const deal = await resolveDeal(req.body.deal, req.user.organization);

    const doc = {
      kind: parseKind(req.body.kind),
      amount: converted.amount,
      currency: converted.currency,
      exchangeRate: converted.exchangeRate,
      foreignAmount: converted.foreignAmount,
      date: req.body.date ? new Date(req.body.date) : new Date(),
      category: req.body.category || "",
      notes: req.body.notes || "",
      vendor: req.body.vendor || null,
      deal,
      attachments: normalizeAttachments(req.body.attachments),
      organization: req.user.organization,
      user: req.user._id,
    };
    normalizePaymentFields(req.body, doc);

    const saved = await Expense.create(doc);
    res.status(201).json(saved);
  } catch (err) {
    if (err.statusCode === 400) return res.status(400).json({ error: err.message });
    console.error("Create expense error:", err);
    res.status(500).json({ error: "Failed to save record" });
  }
};

// PUT /api/expenses/:id
exports.update = async (req, res) => {
  try {
    const doc = await Expense.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    });
    if (!doc) return res.status(404).json({ error: "Record not found" });

    if (req.body.amount !== undefined) {
      const amount = Number(req.body.amount);
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: "Enter an amount greater than zero." });
      }
      const converted = resolveAmount(req.body);
      doc.amount = converted.amount;
      doc.currency = converted.currency;
      doc.exchangeRate = converted.exchangeRate;
      doc.foreignAmount = converted.foreignAmount;
    }
    // Convert between Expense and Indirect Income. Same record, different
    // direction — the two keep separate category lists, so a converted entry
    // drops a category that doesn't exist on the other side.
    if (req.body.kind !== undefined) {
      const nextKind = parseKind(req.body.kind);
      if (nextKind !== doc.kind) {
        doc.kind = nextKind;
        const allowed = nextKind === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
        if (!allowed.includes(doc.category)) doc.category = "";
      }
    }
    if (req.body.date !== undefined) doc.date = new Date(req.body.date);
    if (req.body.category !== undefined) doc.category = req.body.category;
    if (req.body.notes !== undefined) doc.notes = req.body.notes;
    if (req.body.vendor !== undefined) doc.vendor = req.body.vendor || null;
    // `deal: null` clears the association; omitting the field leaves it alone.
    if (req.body.deal !== undefined) {
      doc.deal = await resolveDeal(req.body.deal, req.user.organization);
    }
    if (req.body.attachments !== undefined) {
      doc.attachments = normalizeAttachments(req.body.attachments);
    }
    if (req.body.status !== undefined) normalizePaymentFields(req.body, doc);

    await doc.save();
    res.json(doc);
  } catch (err) {
    if (err.statusCode === 400) return res.status(400).json({ error: err.message });
    console.error("Update expense error:", err);
    res.status(500).json({ error: "Failed to update record" });
  }
};

// POST /api/expenses/attachments
// Uploads one file and hands back the pointer the form stores on the entry.
// Separate from create/update so a file can be attached before the record
// exists, and so a failed upload never costs the typed-in form data.
exports.uploadAttachment = (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file received." });
  }
  res.status(201).json({
    url: req.fileLocation || req.file.location,
    name: req.file.originalname || "",
    size: req.file.size || 0,
    mimeType: req.file.mimetype || "",
  });
};

// GET /api/expenses/:id/receipt
// The entry's receipt as a PDF, rendered server-side (utils/expenseReceiptPdf.js)
// so the in-app viewer, the download and the print are all the same bytes.
exports.receipt = async (req, res) => {
  try {
    const entry = await Expense.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    })
      .populate("vendor", "name companyName email phone gstin")
      .populate("bankAccount", "bank accountNumber");

    if (!entry) return res.status(404).json({ error: "Record not found" });

    const orgDetails = await Branding.findOne({
      organization: req.user.organization,
    }).sort({ updatedAt: -1 });

    const pdfBuffer = await expenseReceiptPdf(entry, orgDetails);
    const prefix = entry.kind === "income" ? "income" : "expense";

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename=${prefix}-${String(entry._id).slice(-6)}.pdf`,
    });
    return res.send(pdfBuffer);
  } catch (err) {
    console.error("Expense receipt error:", err);
    res.status(500).json({ error: "Failed to build the receipt" });
  }
};

// DELETE /api/expenses/:id
exports.remove = async (req, res) => {
  try {
    const doc = await Expense.findOneAndDelete({
      _id: req.params.id,
      organization: req.user.organization,
    });
    if (!doc) return res.status(404).json({ error: "Record not found" });
    res.json({ message: "Deleted", id: doc._id });
  } catch (err) {
    console.error("Delete expense error:", err);
    res.status(500).json({ error: "Failed to delete record" });
  }
};
