const EInvoice = require("../models/EInvoice");
const { buildFuzzySearchPattern } = require("../utils/searchRegex");
const eInvoiceService = require("../services/eInvoiceService");
const irisProvider = require("../providers/iris/irisProvider");

const POPULATE = [
  { path: "invoice", select: "invoiceNumber amount date" },
  { path: "deal", select: "name" },
];

exports.createEInvoice = async (req, res) => {
  try {
    const { invoice, deal, invoiceNumber, customer, amount, date, status } = req.body;

    if (!invoiceNumber) {
      return res.status(400).json({ message: "invoiceNumber is required" });
    }

    const eInvoice = new EInvoice({
      invoice: invoice || null,
      deal: deal || null,
      invoiceNumber,
      customer: customer || {},
      amount: amount || 0,
      date: date || Date.now(),
      status: status || "Pending",
      user: req.user.id,
      organization: req.user.organization,
    });

    await eInvoice.save();
    await eInvoice.populate(POPULATE);

    res.status(201).json(eInvoice);
  } catch (err) {
    console.error("Error creating e-invoice:", err);
    res.status(500).json({ message: "Failed to create e-invoice", error: err.message });
  }
};

exports.getAllEInvoices = async (req, res) => {
  try {
    const query = { organization: req.user.organization };
    if (req.query.status) query.status = req.query.status;

    const eInvoices = await EInvoice.find(query).populate(POPULATE).sort({ createdAt: -1 });
    res.json(eInvoices);
  } catch (err) {
    console.error("Error fetching e-invoices:", err);
    res.status(500).json({ message: "Failed to fetch e-invoices", error: err.message });
  }
};

exports.getAllEInvoicesWithPagination = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const skip = (page - 1) * limit;
    const { search, status, sortBy = "createdAt", sortOrder = "desc" } = req.query;

    const query = { organization: req.user.organization };
    if (status) query.status = status;
    if (search) {
      // Escaped via the shared helper every other list endpoint uses: the raw string used to go
      // straight into new RegExp(), so a search containing ( [ + ? threw and failed the whole
      // request, and . or * matched every row.
      const re = { $regex: buildFuzzySearchPattern(search), $options: "i" };
      query.$or = [{ invoiceNumber: re }, { "customer.name": re }, { irn: re }, { ackNo: re }];
    }

    // Mirrors salesReturnController's allIds shortcut — lets the frontend's
    // "Select All" bulk-strip button select every row matching the current
    // search/status filters, not just the ids on the currently-loaded page.
    if (req.query.allIds === "true") {
      const all = await EInvoice.find(query).select("_id").lean();
      return res.json({ ids: all.map((x) => x._id) });
    }

    // `customer`/`amount`/`date` are what the frontend's column keys are
    // called, but on the schema those are `customer.name`, `amount`, `date`
    // respectively (amount/date already match 1:1). Map the ones that don't.
    const sortFieldMap = { customer: "customer.name" };
    const sortField = sortFieldMap[sortBy] || sortBy;

    const [eInvoices, totalCount] = await Promise.all([
      EInvoice.find(query)
        .populate(POPULATE)
        .sort({ [sortField]: sortOrder === "asc" ? 1 : -1 })
        .skip(skip)
        .limit(limit),
      EInvoice.countDocuments(query),
    ]);

    const totalPages = Math.ceil(totalCount / limit);
    res.json({
      eInvoices,
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
    console.error("Error fetching e-invoices:", err);
    res.status(500).json({ message: "Failed to fetch e-invoices", error: err.message });
  }
};

exports.getEInvoiceById = async (req, res) => {
  try {
    const eInvoice = await EInvoice.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    }).populate(POPULATE);

    if (!eInvoice) return res.status(404).json({ message: "E-invoice not found" });
    res.json(eInvoice);
  } catch (err) {
    console.error("Error fetching e-invoice:", err);
    res.status(500).json({ message: "Failed to fetch e-invoice", error: err.message });
  }
};

exports.updateEInvoiceStatus = async (req, res) => {
  try {
    const { status, irn, ackNo, ackDate, qrCode, failureReason } = req.body;

    const eInvoice = await EInvoice.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    });

    if (!eInvoice) return res.status(404).json({ message: "E-invoice not found" });

    if (status !== undefined) eInvoice.status = status;
    if (irn !== undefined) eInvoice.irn = irn;
    if (ackNo !== undefined) eInvoice.ackNo = ackNo;
    if (ackDate !== undefined) eInvoice.ackDate = ackDate;
    if (qrCode !== undefined) eInvoice.qrCode = qrCode;
    if (failureReason !== undefined) eInvoice.failureReason = failureReason;

    await eInvoice.save();
    await eInvoice.populate(POPULATE);

    res.json(eInvoice);
  } catch (err) {
    console.error("Error updating e-invoice status:", err);
    res.status(500).json({ message: "Failed to update e-invoice status", error: err.message });
  }
};

// ── Phase 6/7/10/11/12/15 endpoints (new IRP flow) ────────────────────
// All of these delegate to services/eInvoiceService.js. They are additive —
// none of the legacy CRUD handlers above changed. If IRIS credentials are
// missing, generate() returns ok:false with failureCode="PROVIDER_NOT_CONFIGURED"
// (never a fake IRN).

exports.previewPayload = async (req, res) => {
  try {
    const built = await eInvoiceService.buildAndValidate(req.params.invoiceId);
    res.json({
      payload: built.payload,
      totals: built.totals,
      warnings: built.warnings,
      errors: built.errors,
      providerConfigured: irisProvider.isConfigured(),
    });
  } catch (err) {
    const code = err.code === "INVOICE_NOT_FOUND" ? 404 : 500;
    res.status(code).json({ message: err.message });
  }
};

exports.generate = async (req, res) => {
  try {
    const { record, ok } = await eInvoiceService.generate({
      invoiceId: req.params.invoiceId,
      user: req.user,
      organizationId: req.user.organization,
    });
    res.status(ok ? 200 : 422).json({ ok, eInvoice: record });
  } catch (err) {
    const code =
      err.code === "INVOICE_NOT_FOUND" ? 404 :
      err.code === "ALREADY_GENERATED" ? 409 :
      err.code === "ALREADY_IN_PROGRESS" ? 409 : 500;
    res.status(code).json({ message: err.message, code: err.code });
  }
};

exports.retrieve = async (req, res) => {
  try {
    const result = await eInvoiceService.retrieve({
      invoiceId: req.params.invoiceId,
      organizationId: req.user.organization,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message, code: err.code });
  }
};

exports.cancel = async (req, res) => {
  try {
    const { reason, remarks } = req.body || {};
    const result = await eInvoiceService.cancel({
      invoiceId: req.params.invoiceId,
      reason,
      remarks,
    });
    res.status(result.ok ? 200 : 422).json(result);
  } catch (err) {
    const code =
      err.code === "NOT_FOUND" ? 404 :
      err.code === "INVALID_STATE" ? 409 : 500;
    res.status(code).json({ message: err.message, code: err.code });
  }
};

exports.history = async (req, res) => {
  try {
    const rows = await eInvoiceService.history({
      invoiceId: req.params.invoiceId,
      organizationId: req.user.organization,
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.providerStatus = async (_req, res) => {
  const cfg = irisProvider.readConfig();
  res.json({
    provider: irisProvider.name,
    environment: cfg.environment,
    configured: irisProvider.isConfigured(),
    // NEVER leak the actual secrets — just tell the frontend which keys are present.
    presentKeys: {
      clientId: !!cfg.clientId,
      clientSecret: !!cfg.clientSecret,
      username: !!cfg.username,
      password: !!cfg.password,
      baseUrl: !!cfg.baseUrl,
      authUrl: !!cfg.authUrl,
      gstin: !!cfg.gstin,
    },
  });
};

exports.deleteEInvoice = async (req, res) => {
  try {
    const eInvoice = await EInvoice.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    });

    if (!eInvoice) return res.status(404).json({ message: "E-invoice not found" });

    await eInvoice.deleteOne();
    res.json({ message: "E-invoice deleted successfully" });
  } catch (err) {
    console.error("Error deleting e-invoice:", err);
    res.status(500).json({ message: "Failed to delete e-invoice", error: err.message });
  }
};
