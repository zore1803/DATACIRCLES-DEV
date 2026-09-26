const { buildFuzzySearchPattern } = require('../utils/searchRegex');
const SalesReturn = require("../models/SalesReturn");
const Invoice = require("../models/Invoice");
const Deal = require("../models/Deal");
const Branding = require("../models/Branding");
const htmlDocumentPdf = require("../utils/htmlDocumentPdf");
const getDefaultBankDetails = require("../utils/getDefaultBankDetails");
const { syncDocumentStock } = require("../utils/inventorySync");
const allocationService = require("../services/paymentAllocationService");

const sumRefunds = (payments) =>
  (payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

// Statuses under which the stock-in has already happened.
const GOODS_RETURNED_STATUSES = ["Confirmed", "Partial", "Paid", "Refunded"];

// Legacy "Refunded" excluded: those rows have no Payment behind them.
const REFUNDABLE_STATUSES = ["Confirmed", "Partial", "Paid"];

// Same math shape as invoiceController — kept parallel so return totals stay
// comparable line-for-line to the original invoice line values.
const calculateItemTotal = (quantity, unitPrice) => parseFloat(quantity) * parseFloat(unitPrice);
const calculateSubtotal = (items) =>
  items.reduce((sum, item) => sum + calculateItemTotal(item.quantity, item.unitPrice), 0);
const calculateTax = (subtotal, gstRate, transactionType) => {
  if (parseFloat(gstRate) <= 0) return 0;
  if (transactionType === "intra") {
    const half = parseFloat(gstRate) / 2;
    return subtotal * (half / 100) + subtotal * (half / 100);
  }
  return subtotal * (parseFloat(gstRate) / 100);
};

// Count-based "SR-00001" — mirrors PurchaseReturn.generateReturnNumber.
async function generateReturnNumber(organizationId) {
  const count = await SalesReturn.countDocuments({ organization: organizationId });
  return `SR-${(count + 1).toString().padStart(5, "0")}`;
}

const POPULATE = [
  { path: "deal", populate: [{ path: "contact", select: "name email phone" }, { path: "company", select: "name email phone gstin billingAddress shippingAddresses" }] },
  { path: "invoice", select: "invoiceNumber date deal amount" },
  { path: "items.itemId", select: "name description sellingPrice hsnSac gstRate variants type" },
];

// Stock IN on Confirm, delta on edit, reversal on cancel. Idempotent via
// stockMovementStatus, so nothing applies or reverses twice.
async function syncSalesReturnStock(salesReturn, oldStatus, oldStockMovementStatus, userId, previousItems = null) {
  const isNowConfirmed = GOODS_RETURNED_STATUSES.includes(salesReturn.status);
  const wasConfirmed = GOODS_RETURNED_STATUSES.includes(oldStatus);

  // Cancelled after an applied Confirm: reverse the stock-in exactly once.
  if (salesReturn.status === "Cancelled" && oldStockMovementStatus === "applied") {
    await syncDocumentStock({
      organization: salesReturn.organization,
      documentId: salesReturn._id,
      documentModel: "SalesReturn",
      documentNumber: salesReturn.returnNumber,
      items: salesReturn.items,
      previousItems: [],
      baseDirection: "in",
      userId,
      reason: "adjustment",
      isReversal: true,
    });
    salesReturn.stockMovementStatus = "reversed";
    await salesReturn.save({ validateModifiedOnly: true });
    return;
  }

  if (isNowConfirmed && !wasConfirmed && oldStockMovementStatus !== "applied") {
    await syncDocumentStock({
      organization: salesReturn.organization,
      documentId: salesReturn._id,
      documentModel: "SalesReturn",
      documentNumber: salesReturn.returnNumber,
      items: salesReturn.items,
      previousItems: [],
      baseDirection: "in",
      userId,
      reason: "return",
      isReversal: false,
    });
    salesReturn.stockMovementStatus = "applied";
    await salesReturn.save({ validateModifiedOnly: true });
    return;
  }

  if (oldStockMovementStatus === "applied" && previousItems) {
    await syncDocumentStock({
      organization: salesReturn.organization,
      documentId: salesReturn._id,
      documentModel: "SalesReturn",
      documentNumber: salesReturn.returnNumber,
      items: salesReturn.items,
      previousItems,
      baseDirection: "in",
      userId,
      reason: "return",
      isReversal: false,
    });
  }
}

// Once the goods are back the status can only stay put or be Cancelled.
function isBlockedStatusChange(oldStatus, newStatus) {
  if (newStatus === undefined) return false;
  // A no-op: the edit form has to submit the current value, including Partial/Paid.
  if (newStatus === oldStatus) return false;
  // Partial/Paid come from recorded refunds, never from the dropdown.
  if (newStatus === "Partial" || newStatus === "Paid") return true;
  if (newStatus === "Refunded") return true; // legacy-only, nothing may enter it
  if (!GOODS_RETURNED_STATUSES.includes(oldStatus)) return false;
  return newStatus !== "Confirmed" && newStatus !== "Cancelled";
}

function blockedStatusMessage(oldStatus, newStatus) {
  if (newStatus === "Partial" || newStatus === "Paid") {
    return `"${newStatus}" is set by recording a refund against this return, not from the status list.`;
  }
  if (newStatus === "Refunded") {
    return '"Refunded" is retired — record an actual refund instead, which moves the return to Partial or Paid.';
  }
  return "A Sales Return whose goods have already come back can only stay Confirmed or be Cancelled.";
}

// Cancelling keeps the refund Payments (permanent history) and only reverses
// their allocation, leaving the money as unallocated customer credit. Deleting
// the return is what removes them. Returns the reloaded doc.
async function unwindRefundsOnCancel({ orgId, salesReturn, oldStatus }) {
  if (salesReturn.status !== "Cancelled" || oldStatus === "Cancelled") return salesReturn;
  await allocationService.reverseDocumentAllocations({
    orgId,
    documentType: "SalesReturn",
    documentId: salesReturn._id,
  });
  return (await SalesReturn.findById(salesReturn._id)) || salesReturn;
}

// Sum of quantities already returned across every OTHER non-Cancelled sales
// return against this invoice. Used to compute the returnable-remaining cap.
async function getReturnedQuantities(invoiceId, organization, excludeReturnId) {
  const match = {
    invoice: invoiceId,
    organization,
    status: { $ne: "Cancelled" },
  };
  if (excludeReturnId) match._id = { $ne: excludeReturnId };

  const rows = await SalesReturn.aggregate([
    { $match: match },
    { $unwind: "$items" },
    {
      $group: {
        _id: { itemId: "$items.itemId", variantId: "$items.variantId" },
        returned: { $sum: "$items.quantity" },
      },
    },
  ]);

  const map = new Map();
  for (const row of rows) {
    const key = `${row._id.itemId || ""}|${row._id.variantId || "none"}`;
    map.set(key, row.returned);
  }
  return map;
}

// Hydrates the create/edit form: invoice lines + alreadyReturned/remaining.
// Services are excluded — they were never stocked.
exports.getInvoiceItemsForReturn = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const invoice = await Invoice.findOne({
      _id: invoiceId,
      organization: req.user.organization,
    })
      .populate({ path: "deal", populate: [{ path: "contact", select: "name email phone" }, { path: "company", select: "name email phone gstin billingAddress shippingAddresses" }] })
      .populate("items.itemId", "name description sellingPrice hsnSac gstRate variants type");

    if (!invoice) return res.status(404).json({ message: "Invoice not found" });

    const returnedMap = await getReturnedQuantities(invoice._id, req.user.organization, req.query.excludeReturnId);

    const items = invoice.items
      .filter((line) => line.itemId?.type !== "service")
      .map((line) => {
        const key = `${line.itemId?._id || line.itemId || ""}|${line.variantId || "none"}`;
        const alreadyReturned = returnedMap.get(key) || 0;
        const variant = line.variantId
          ? line.itemId?.variants?.find((v) => String(v._id) === String(line.variantId))
          : null;
        return {
          itemId: line.itemId?._id || line.itemId,
          variantId: line.variantId || null,
          variantName: variant?.name || null,
          parentItemId: line.parentItemId || null,
          isVariant: !!line.variantId,
          name: line.name,
          description: line.description || "",
          hsn: line.hsn || "",
          unitPrice: line.rate,
          gstRate: line.gstRate ?? invoice.gstRate ?? 0,
          taxInclusive: !!line.taxInclusive,
          originalQuantity: line.quantity,
          alreadyReturned,
          remaining: Math.max(0, line.quantity - alreadyReturned),
        };
      });

    res.json({
      invoice: {
        _id: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        date: invoice.date,
        transactionType: invoice.transactionType,
        gstRate: invoice.gstRate,
        deal: invoice.deal,
      },
      items,
    });
  } catch (err) {
    console.error("Get invoice items for return error:", err);
    res.status(500).json({ error: err.message });
  }
};

// Rejects a quantity that would push the total returned past what was
// invoiced. Shared by create & update (excludeReturnId omitted / set).
async function assertQuantitiesWithinInvoice(invoice, items, organization, excludeReturnId) {
  const returnedMap = await getReturnedQuantities(invoice._id, organization, excludeReturnId);

  for (const it of items) {
    const invoiceLine = invoice.items.find(
      (li) =>
        String(li.itemId?._id || li.itemId || "") === String(it.itemId || "") &&
        String(li.variantId || "none") === String(it.variantId || "none")
    );
    if (!invoiceLine) {
      throw new Error(`"${it.name}" is not part of the selected Invoice`);
    }
    if (invoiceLine.itemId?.type === "service") {
      throw new Error(`"${it.name}" is a service and cannot be returned through inventory`);
    }
    const key = `${it.itemId || ""}|${it.variantId || "none"}`;
    const alreadyReturned = returnedMap.get(key) || 0;
    const remaining = invoiceLine.quantity - alreadyReturned;
    if ((parseFloat(it.quantity) || 0) > remaining) {
      throw new Error(`Only ${remaining} unit(s) available to return for "${it.name}"`);
    }
    if ((parseFloat(it.quantity) || 0) <= 0) {
      throw new Error(`Return quantity for "${it.name}" must be greater than zero`);
    }
  }
}

exports.createSalesReturn = async (req, res) => {
  try {
    const { invoice, items, notes, reason, status, transactionType, gstRate, refundMode, returnDate } = req.body;

    if (!invoice) return res.status(400).json({ message: "A Sales Return must reference an existing Invoice" });

    // No refunds exist yet, so a money-driven status here would be a backdoor.
    if (["Partial", "Paid", "Refunded"].includes(status)) {
      return res.status(400).json({ message: blockedStatusMessage(null, status) });
    }

    const invoiceDoc = await Invoice.findOne({ _id: invoice, organization: req.user.organization }).populate("items.itemId", "type");
    if (!invoiceDoc) return res.status(404).json({ message: "Invoice not found" });

    if (!items || items.length === 0) return res.status(400).json({ message: "At least one item is required" });

    await assertQuantitiesWithinInvoice(invoiceDoc, items, req.user.organization);

    const subtotal = calculateSubtotal(items);
    const txnType = transactionType || invoiceDoc.transactionType || "intra";
    const gst = parseFloat(gstRate ?? invoiceDoc.gstRate ?? 0) || 0;
    const totalTax = calculateTax(subtotal, gst, txnType);
    const grandTotal = subtotal + totalTax;

    const returnNumber = await generateReturnNumber(req.user.organization);

    const salesReturn = new SalesReturn({
      deal: invoiceDoc.deal,
      invoice,
      returnNumber,
      returnDate: returnDate || Date.now(),
      items: items.map((it) => ({
        ...it,
        total: calculateItemTotal(it.quantity, it.unitPrice),
      })),
      subtotal,
      transactionType: txnType,
      gstRate: gst,
      totalTax,
      grandTotal,
      status: status || "Draft",
      refundMode: refundMode || "",
      reason: reason || "",
      notes: notes || "",
      user: req.user.id,
      organization: req.user.organization,
    });

    await salesReturn.save();

    // Covers creating directly as Confirmed; guarded by stockMovementStatus.
    await syncSalesReturnStock(salesReturn, null, salesReturn.stockMovementStatus, req.user.id);

    await salesReturn.populate(POPULATE);
    res.status(201).json(salesReturn);
  } catch (err) {
    console.error("Create sales return error:", err);
    res.status(400).json({ error: err.message });
  }
};

exports.getAllSalesReturns = async (req, res) => {
  try {
    const { search } = req.query;
    const query = { organization: req.user.organization };
    if (search) {
      query.$or = [
        { returnNumber: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { status: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { notes: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { reason: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { "items.name": { $regex: buildFuzzySearchPattern(search), $options: "i" } },
      ];
    }
    const rows = await SalesReturn.find(query).populate(POPULATE).sort({ createdAt: -1 });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getAllSalesReturnsWithPagination = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;
    const { search, status, sortBy = "createdAt", sortOrder = "desc" } = req.query;

    const query = { organization: req.user.organization };
    if (search) {
      query.$or = [
        { returnNumber: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { status: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { notes: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { reason: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { "items.name": { $regex: buildFuzzySearchPattern(search), $options: "i" } },
      ];
    }
    if (status) query.status = status;

    if (req.query.allIds === "true") {
      const all = await SalesReturn.find(query).select("_id").lean();
      return res.json({ ids: all.map((x) => x._id) });
    }

    // "invoice" and "customer" aren't stored fields (a ref id and a display
    // fallback chain), so sorting on them needs a join. Aggregate to get the
    // sorted/paginated ids, then fetch+populate normally to keep the shape.
    const JOINED_SORT_FIELDS = ["invoice", "customer"];
    let salesReturns, totalCount;
    if (JOINED_SORT_FIELDS.includes(sortBy)) {
      const dir = sortOrder === "desc" ? -1 : 1;
      const pipeline = [
        { $match: query },
        {
          $lookup: {
            from: "invoices",
            localField: "invoice",
            foreignField: "_id",
            as: "_invoice",
          },
        },
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
            _sortInvoice: { $ifNull: [{ $arrayElemAt: ["$_invoice.invoiceNumber", 0] }, ""] },
            _sortCustomer: {
              $ifNull: [
                { $arrayElemAt: ["$_contact.name", 0] },
                { $ifNull: [{ $arrayElemAt: ["$_company.name", 0] }, { $ifNull: ["$_deal.title", ""] }] },
              ],
            },
          },
        },
        { $sort: { [sortBy === "invoice" ? "_sortInvoice" : "_sortCustomer"]: dir, _id: 1 } },
        {
          $facet: {
            page: [{ $skip: skip }, { $limit: limit }, { $project: { _id: 1 } }],
            total: [{ $count: "count" }],
          },
        },
      ];
      const [result] = await SalesReturn.aggregate(pipeline);
      const orderedIds = (result?.page || []).map((r) => r._id);
      totalCount = result?.total?.[0]?.count || 0;

      const docs = await SalesReturn.find({ _id: { $in: orderedIds } })
        .populate(POPULATE)
        .lean()
        .select("-__v");
      const byId = new Map(docs.map((d) => [String(d._id), d]));
      salesReturns = orderedIds.map((id) => byId.get(String(id))).filter(Boolean);
    } else {
      [salesReturns, totalCount] = await Promise.all([
        SalesReturn.find(query)
          .populate(POPULATE)
          .skip(skip)
          .limit(limit)
          .sort({ [sortBy]: sortOrder === "desc" ? -1 : 1 })
          .lean()
          .select("-__v"),
        SalesReturn.countDocuments(query),
      ]);
    }

    const totalPages = Math.ceil(totalCount / limit);
    res.json({
      salesReturns,
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
    console.error("List sales returns error:", err);
    res.status(500).json({ error: "Failed to fetch sales returns", message: err.message });
  }
};

exports.getSalesReturnById = async (req, res) => {
  try {
    const row = await SalesReturn.findOne({ _id: req.params.id, organization: req.user.organization }).populate(POPULATE);
    if (!row) return res.status(404).json({ message: "Sales return not found" });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateSalesReturn = async (req, res) => {
  try {
    const salesReturn = await SalesReturn.findOne({ _id: req.params.id, organization: req.user.organization });
    if (!salesReturn) return res.status(404).json({ message: "Sales return not found" });

    const { items, notes, reason, status, transactionType, gstRate, refundMode, returnDate } = req.body;

    const oldStatus = salesReturn.status;
    const oldStockMovementStatus = salesReturn.stockMovementStatus;

    if (isBlockedStatusChange(oldStatus, status)) {
      return res.status(400).json({ message: blockedStatusMessage(oldStatus, status) });
    }

    // deal / invoice not editable — changing them would invalidate the
    // already-returned/remaining math.
    if (returnDate !== undefined) salesReturn.returnDate = returnDate;
    if (notes !== undefined) salesReturn.notes = notes;
    if (reason !== undefined) salesReturn.reason = reason;
    if (status !== undefined) salesReturn.status = status;
    if (refundMode !== undefined) salesReturn.refundMode = refundMode;

    let previousItemsSnapshot = null;

    if (items !== undefined) {
      if (!items.length) return res.status(400).json({ message: "At least one item is required" });

      const invoiceDoc = await Invoice.findOne({ _id: salesReturn.invoice, organization: req.user.organization }).populate("items.itemId", "type");
      if (invoiceDoc) {
        await assertQuantitiesWithinInvoice(invoiceDoc, items, req.user.organization, salesReturn._id);
      }

      previousItemsSnapshot = salesReturn.items.map((it) => ({
        itemId: it.itemId,
        variantId: it.variantId,
        quantity: it.quantity,
      }));

      const txnType = transactionType || salesReturn.transactionType;
      const gst = gstRate !== undefined ? parseFloat(gstRate) || 0 : salesReturn.gstRate;
      const subtotal = calculateSubtotal(items);
      const totalTax = calculateTax(subtotal, gst, txnType);

      salesReturn.items = items.map((it) => ({ ...it, total: calculateItemTotal(it.quantity, it.unitPrice) }));
      salesReturn.subtotal = subtotal;
      salesReturn.transactionType = txnType;
      salesReturn.gstRate = gst;
      salesReturn.totalTax = totalTax;
      salesReturn.grandTotal = subtotal + totalTax;
    }

    await salesReturn.save();

    // Stock IN on Confirm, delta on edit, or reversal if this edit cancelled it.
    await syncSalesReturnStock(salesReturn, oldStatus, oldStockMovementStatus, req.user.id, previousItemsSnapshot);

    const settled = await unwindRefundsOnCancel({
      orgId: req.user.organization,
      salesReturn,
      oldStatus,
    });

    await settled.populate(POPULATE);
    res.json(settled);
  } catch (err) {
    console.error("Update sales return error:", err);
    res.status(400).json({ error: err.message });
  }
};

exports.updateSalesReturnStatus = async (req, res) => {
  try {
    const { status } = req.body;
    // Partial/Paid/Refunded absent on purpose — they come from refunds, not here.
    const valid = ["Draft", "Pending", "Confirmed", "Cancelled"];
    if (!valid.includes(status)) {
      return res.status(400).json({
        message: ["Partial", "Paid", "Refunded"].includes(status)
          ? blockedStatusMessage(null, status)
          : "Invalid status",
      });
    }

    const salesReturn = await SalesReturn.findOne({ _id: req.params.id, organization: req.user.organization });
    if (!salesReturn) return res.status(404).json({ message: "Sales return not found" });

    const oldStatus = salesReturn.status;
    const oldStockMovementStatus = salesReturn.stockMovementStatus;

    if (isBlockedStatusChange(oldStatus, status)) {
      return res.status(400).json({ message: blockedStatusMessage(oldStatus, status) });
    }

    salesReturn.status = status;
    await salesReturn.save();

    await syncSalesReturnStock(salesReturn, oldStatus, oldStockMovementStatus, req.user.id);

    const settled = await unwindRefundsOnCancel({
      orgId: req.user.organization,
      salesReturn,
      oldStatus,
    });

    await settled.populate(POPULATE);
    res.json(settled);
  } catch (err) {
    console.error("Update sales return status error:", err);
    res.status(400).json({ error: err.message });
  }
};

// Refunds — money OUT to the customer, recorded through
// paymentAllocationService as a real Payment + PaymentAllocation.

// GET /sales-returns/:id/payments
exports.getSalesReturnRefunds = async (req, res) => {
  try {
    const salesReturn = await SalesReturn.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    }).populate("payments.recordedBy", "name email");
    if (!salesReturn) return res.status(404).json({ message: "Sales return not found" });

    const refunded = sumRefunds(salesReturn.payments);
    const total = Number(salesReturn.grandTotal) || 0;

    res.json({
      payments: salesReturn.payments || [],
      totalAmount: total,
      refundedAmount: refunded,
      amountDue: Math.max(0, total - refunded),
      status: salesReturn.status,
    });
  } catch (err) {
    res.status(500).json({ error: `Failed to fetch refunds: ${err.message}` });
  }
};

// POST /sales-returns/:id/payments
exports.addSalesReturnRefund = async (req, res) => {
  try {
    const { amount, paymentDate, paymentMethod, reference, notes, internalNotes } = req.body;

    const parsedAmount = parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: "A valid refund amount greater than 0 is required." });
    }

    const salesReturn = await SalesReturn.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    });
    if (!salesReturn) return res.status(404).json({ message: "Sales return not found" });

    // Nothing is owed to the customer until the goods have actually come back.
    if (!REFUNDABLE_STATUSES.includes(salesReturn.status)) {
      return res.status(400).json({
        error: "This return isn't confirmed yet — confirm it before recording a refund.",
      });
    }

    const alreadyRefunded = sumRefunds(salesReturn.payments);
    const amountDue = (Number(salesReturn.grandTotal) || 0) - alreadyRefunded;
    if (parsedAmount > amountDue + 0.01) {
      return res.status(400).json({
        error: `Refund cannot exceed the remaining balance of ₹${amountDue.toFixed(2)}.`,
      });
    }

    try {
      await allocationService.recordDocumentPayment({
        orgId: req.user.organization,
        userId: req.user._id,
        documentType: "SalesReturn",
        documentId: salesReturn._id,
        amount: parsedAmount,
        paymentDate,
        paymentMethod: paymentMethod || salesReturn.refundMode || "UPI",
        reference,
        notes,
      });
    } catch (err) {
      if (err instanceof allocationService.AllocationError) {
        return res.status(400).json({ error: err.message });
      }
      throw err;
    }

    // Reloaded because the service wrote the subdoc and the status on its own
    // copy of the document.
    const updated = await SalesReturn.findById(salesReturn._id);

    // internalNotes has no equivalent on the money row, so it goes straight
    // onto the subdoc the service just pushed.
    if (internalNotes) {
      const subdoc = updated.payments[updated.payments.length - 1];
      if (subdoc) {
        subdoc.internalNotes = internalNotes;
        await updated.save({ validateModifiedOnly: true });
      }
    }

    await updated.populate(POPULATE);
    res.json({ message: "Refund recorded successfully", salesReturn: updated });
  } catch (err) {
    res.status(500).json({ error: `Failed to record refund: ${err.message}` });
  }
};

// PUT /sales-returns/:id/payments/:paymentId
exports.updateSalesReturnRefund = async (req, res) => {
  try {
    const { amount, paymentDate, paymentMethod, reference, notes, internalNotes } = req.body;

    let result;
    try {
      result = await allocationService.updateDocumentPayment({
        orgId: req.user.organization,
        userId: req.user._id,
        documentType: "SalesReturn",
        documentId: req.params.id,
        documentPaymentId: req.params.paymentId,
        amount,
        paymentDate,
        paymentMethod,
        reference,
        notes,
      });
    } catch (err) {
      if (err instanceof allocationService.AllocationError) {
        return res.status(400).json({ error: err.message });
      }
      throw err;
    }

    const salesReturn = result.document;
    if (internalNotes !== undefined) {
      const subdoc = salesReturn.payments.id(req.params.paymentId);
      if (subdoc) {
        subdoc.internalNotes = internalNotes;
        await salesReturn.save({ validateModifiedOnly: true });
      }
    }

    await salesReturn.populate(POPULATE);
    res.json({ message: "Refund updated successfully", salesReturn });
  } catch (err) {
    res.status(500).json({ error: `Failed to update refund: ${err.message}` });
  }
};

// DELETE /sales-returns/:id/payments/:paymentId
exports.deleteSalesReturnRefund = async (req, res) => {
  try {
    // Reverses the allocation, pulls the subdoc, recomputes status and deletes
    // the money row, so the customer's Total Given falls by the same amount.
    let result;
    try {
      result = await allocationService.removeDocumentPayment({
        orgId: req.user.organization,
        documentType: "SalesReturn",
        documentId: req.params.id,
        documentPaymentId: req.params.paymentId,
      });
    } catch (err) {
      if (err instanceof allocationService.AllocationError) {
        return res.status(400).json({ error: err.message });
      }
      throw err;
    }

    await result.document.populate(POPULATE);
    res.json({ message: "Refund deleted successfully", salesReturn: result.document });
  } catch (err) {
    res.status(500).json({ error: `Failed to delete refund: ${err.message}` });
  }
};

// Maps a return into the invoice-shaped object the shared PDF renderer
// expects, rather than changing that renderer for every document type.
function toPrintableDoc(salesReturn) {
  const deal = salesReturn.deal || {};
  const company = deal.company || {};
  return {
    deal,
    date: salesReturn.returnDate,
    dueDate: null,
    notes: salesReturn.reason
      ? `Reason: ${salesReturn.reason}${salesReturn.notes ? `\n${salesReturn.notes}` : ""}`
      : salesReturn.notes || "",
    terms: "",
    isTaxInvoice: (salesReturn.totalTax || 0) > 0,
    receiverGSTIN: company.gstin || "",
    billingAddress: company.billingAddress || {},
    shippingAddress: company.shippingAddresses?.[0] || {},
    transactionType: salesReturn.transactionType,
    gstRate: salesReturn.gstRate,
    returnNumber: salesReturn.returnNumber,
    organization: salesReturn.organization,
    items: (salesReturn.items || []).map((it) => ({
      name: it.name,
      description: it.description || "",
      hsn: it.hsn || "",
      rate: it.unitPrice,
      quantity: it.quantity,
      discountType: "amount",
      discount: 0,
      gstRate: it.gstRate,
      taxInclusive: it.taxInclusive,
    })),
    discount: { type: "fixed", value: 0 },
  };
}

exports.toPrintableDoc = toPrintableDoc;

exports.downloadSalesReturn = async (req, res) => {
  try {
    const salesReturn = await SalesReturn.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    }).populate({
      path: "deal",
      populate: ["contact", "company"],
    });

    if (!salesReturn) return res.status(404).json({ error: "Sales return not found" });

    const bankDetails = await getDefaultBankDetails(req.user.organization);
    const orgDetails = await Branding.findOne({ organization: req.user.organization }).sort({ updatedAt: -1 });

    const copyType = ["original", "duplicate", "triplicate"].includes(req.query.copyType)
      ? req.query.copyType
      : "original";

    const pdfBuffer = await htmlDocumentPdf(toPrintableDoc(salesReturn), bankDetails, orgDetails, "salesReturn", copyType);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=Sales-Return-${salesReturn.returnNumber}.pdf`,
    });
    return res.send(pdfBuffer);
  } catch (err) {
    console.error("Error downloading sales return:", err);
    res.status(500).json({ error: err.message });
  }
};

// Groups CSV rows by returnNumber::invoiceNumber into one return each. Every
// row must resolve against a real Invoice line, so the CSV can't invent prices
// or bypass the returnable-quantity cap.
exports.bulkImportSalesReturns = async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "No rows to import" });
    }

    const groups = new Map();
    for (const row of rows) {
      const invoiceNumber = (row.invoiceNumber || "").trim();
      const itemName = (row.itemName || "").trim();
      if (!invoiceNumber || !itemName) continue;

      const groupKey = `${(row.returnNumber || "").trim().toLowerCase()}::${invoiceNumber.toLowerCase()}`;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          returnNumber: (row.returnNumber || "").trim(),
          invoiceNumber,
          // Import has no Payment records — it can stage goods movement but
          // never refund state.
          status: ["Partial", "Paid", "Refunded"].includes(row.status)
            ? "Confirmed"
            : row.status || "Draft",
          refundMode: row.refundMode || "",
          reason: row.reason || "",
          notes: row.notes || "",
          returnDate: row.returnDate || undefined,
          lines: [],
        });
      }
      groups.get(groupKey).lines.push({
        itemName,
        quantity: parseFloat(row.quantity) || 1,
      });
    }

    let imported = 0;
    const errors = [];

    for (const group of groups.values()) {
      try {
        const invoiceDoc = await Invoice.findOne({
          invoiceNumber: { $regex: `^${group.invoiceNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
          organization: req.user.organization,
        }).populate("items.itemId", "type");

        if (!invoiceDoc) {
          errors.push(`${group.invoiceNumber}: Invoice not found`);
          continue;
        }

        const items = [];
        for (const line of group.lines) {
          const invoiceLine = invoiceDoc.items.find(
            (li) => (li.name || "").trim().toLowerCase() === line.itemName.toLowerCase()
          );
          if (!invoiceLine) {
            errors.push(`${group.invoiceNumber}: "${line.itemName}" is not on this invoice`);
            continue;
          }
          if (invoiceLine.itemId?.type === "service") {
            errors.push(`${group.invoiceNumber}: "${line.itemName}" is a service and cannot be returned`);
            continue;
          }
          items.push({
            itemId: invoiceLine.itemId?._id || invoiceLine.itemId,
            variantId: invoiceLine.variantId || null,
            parentItemId: invoiceLine.parentItemId || null,
            isVariant: !!invoiceLine.variantId,
            name: invoiceLine.name,
            description: invoiceLine.description || "",
            hsn: invoiceLine.hsn || "",
            quantity: line.quantity,
            unitPrice: invoiceLine.rate,
            gstRate: invoiceLine.gstRate ?? invoiceDoc.gstRate ?? 0,
            taxInclusive: !!invoiceLine.taxInclusive,
          });
        }

        if (items.length === 0) continue;

        await assertQuantitiesWithinInvoice(invoiceDoc, items, req.user.organization);

        const subtotal = calculateSubtotal(items);
        const txnType = invoiceDoc.transactionType || "intra";
        const gst = parseFloat(invoiceDoc.gstRate) || 0;
        const totalTax = calculateTax(subtotal, gst, txnType);
        const returnNumber = group.returnNumber || (await generateReturnNumber(req.user.organization));

        const salesReturn = new SalesReturn({
          deal: invoiceDoc.deal,
          invoice: invoiceDoc._id,
          returnNumber,
          returnDate: group.returnDate || Date.now(),
          items: items.map((it) => ({ ...it, total: calculateItemTotal(it.quantity, it.unitPrice) })),
          subtotal,
          transactionType: txnType,
          gstRate: gst,
          totalTax,
          grandTotal: subtotal + totalTax,
          status: group.status,
          refundMode: group.refundMode,
          reason: group.reason,
          notes: group.notes,
          user: req.user.id,
          organization: req.user.organization,
        });

        await salesReturn.save();
        await syncSalesReturnStock(salesReturn, null, salesReturn.stockMovementStatus, req.user.id);

        imported += 1;
      } catch (err) {
        errors.push(`${group.invoiceNumber}: ${err.message}`);
      }
    }

    res.json({ imported, total: groups.size, errors: errors.length ? errors : undefined });
  } catch (err) {
    console.error("Bulk import sales returns error:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.deleteSalesReturn = async (req, res) => {
  try {
    const salesReturn = await SalesReturn.findOne({ _id: req.params.id, organization: req.user.organization });
    if (!salesReturn) return res.status(404).json({ message: "Sales return not found" });

    // Unlike cancel, delete removes the money rows too — nothing should point
    // at a return that no longer exists.
    for (const subdoc of [...(salesReturn.payments || [])]) {
      try {
        await allocationService.removeDocumentPayment({
          orgId: req.user.organization,
          documentType: "SalesReturn",
          documentId: salesReturn._id,
          documentPaymentId: subdoc._id,
        });
      } catch (err) {
        // A legacy subdoc with no allocation behind it has nothing to unwind;
        // it disappears with the document itself a few lines below.
        if (!(err instanceof allocationService.AllocationError)) throw err;
      }
    }

    // Reverse the stock IN if the return had already applied it — otherwise
    // deleting silently leaves inventory overstated with no surviving doc.
    if (salesReturn.stockMovementStatus === "applied") {
      await syncDocumentStock({
        organization: salesReturn.organization,
        documentId: salesReturn._id,
        documentModel: "SalesReturn",
        documentNumber: salesReturn.returnNumber,
        items: salesReturn.items,
        previousItems: [],
        baseDirection: "in",
        userId: req.user.id,
        reason: "adjustment",
        isReversal: true,
      });
    }

    await salesReturn.deleteOne();
    res.json({ message: "Sales return deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
