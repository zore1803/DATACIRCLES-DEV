const { buildFuzzySearchPattern } = require('../utils/searchRegex');
const PurchaseReturn = require("../models/PurchaseReturn");
const Vendor = require("../models/Vendor");
const Purchase = require("../models/Purchase");
const Branding = require("../models/Branding");
const purchaseDocumentPdf = require("../utils/purchaseDocumentPdf");
const { syncDocumentStock } = require("../utils/inventorySync");
const allocationService = require("../services/paymentAllocationService");

// Tax helpers. Per-line math mirrors purchaseDocumentPdf.js exactly so saved
// numbers always match the PDF: taxable = taxInclusive ? gross/(1+rate) : gross,
// itemTax = taxable × rate. Intra splits into CGST/SGST, inter is IGST.

function calcTotalsFromItems(items, transactionType) {
  let subtotal = 0;
  let totalTax = 0;

  for (const item of items) {
    const qty       = parseFloat(item.quantity)  || 0;
    const price     = parseFloat(item.unitPrice) || 0;
    const rate      = parseFloat(item.gstRate)   || 0;
    const inclusive = !!item.taxInclusive;

    const gross    = qty * price;
    const taxable  = inclusive && rate > 0 ? gross / (1 + rate / 100) : gross;
    const itemTax  = taxable * (rate / 100);

    subtotal += taxable;
    totalTax += itemTax;
  }

  return {
    subtotal:   parseFloat(subtotal.toFixed(2)),
    totalTax:   parseFloat(totalTax.toFixed(2)),
    grandTotal: parseFloat((subtotal + totalTax).toFixed(2)),
  };
}

// Gross line total stored on the item (qty × unitPrice, inclusive of any
// embedded tax if taxInclusive=true) — used only for the item.total field;
// the document-level subtotal is the sum of TAXABLE amounts, not this.
const calculateItemGross = (quantity, unitPrice) =>
  parseFloat((parseFloat(quantity) * parseFloat(unitPrice)).toFixed(2));

// Count-based "PR-00001", mirroring generatePurchaseNumber (not the
// Counter-based scheme the Invoice family uses).
async function generateReturnNumber(organizationId) {
  const count = await PurchaseReturn.countDocuments({ organization: organizationId });
  return `PR-${(count + 1).toString().padStart(5, "0")}`;
}

const POPULATE = [
  { path: "vendor", select: "name email phone" },
  { path: "purchase", select: "purchaseNumber vendor" },
  { path: "items.itemId", select: "name description purchasePrice hsnSac gstRate" },
];

// Stock OUT on Confirm, delta on edit, reversal on cancel or delete.
// Idempotent via stockMovementStatus. Goods leaving toward the vendor reduce
// our own stock, hence baseDirection "out".
async function syncPurchaseReturnStock(purchaseReturn, oldStatus, oldStockMovementStatus, userId, previousItems = null) {
  const isNowConfirmed = purchaseReturn.status === "Confirmed";
  // Partial/Paid are only reachable from Confirmed, so the goods already left
  // under any of the three.
  const wasConfirmed = ["Confirmed", "Partial", "Paid"].includes(oldStatus);

  if (isNowConfirmed && !wasConfirmed && oldStockMovementStatus !== "applied") {
    // First time reaching Confirmed: apply the full quantity, nothing to
    // reverse first.
    await syncDocumentStock({
      organization: purchaseReturn.organization,
      documentId: purchaseReturn._id,
      documentModel: "PurchaseReturn",
      documentNumber: purchaseReturn.returnNumber,
      items: purchaseReturn.items,
      previousItems: [],
      baseDirection: "out",
      userId,
      reason: "return",
      isReversal: false,
    });
    purchaseReturn.stockMovementStatus = "applied";
    await purchaseReturn.save({ validateModifiedOnly: true });
    return;
  }

  // Cancelled after an applied Confirm: reverse the stock-out exactly once.
  if (purchaseReturn.status === "Cancelled" && oldStockMovementStatus === "applied") {
    await syncDocumentStock({
      organization: purchaseReturn.organization,
      documentId: purchaseReturn._id,
      documentModel: "PurchaseReturn",
      documentNumber: purchaseReturn.returnNumber,
      items: purchaseReturn.items,
      previousItems: [],
      baseDirection: "out",
      userId,
      reason: "adjustment",
      isReversal: true,
    });
    purchaseReturn.stockMovementStatus = "reversed";
    await purchaseReturn.save({ validateModifiedOnly: true });
    return;
  }

  if (oldStockMovementStatus === "applied" && previousItems) {
    // Already Confirmed/Paid and its items just changed: apply only the
    // delta between what was previously on the document and what's on it
    // now.
    await syncDocumentStock({
      organization: purchaseReturn.organization,
      documentId: purchaseReturn._id,
      documentModel: "PurchaseReturn",
      documentNumber: purchaseReturn.returnNumber,
      items: purchaseReturn.items,
      previousItems,
      baseDirection: "out",
      userId,
      reason: "return",
      isReversal: false,
    });
  }
}

// Once the goods have left the status can only stay put or be Cancelled.
function isBlockedStatusChange(oldStatus, newStatus) {
  if (newStatus === undefined) return false;
  // A no-op: the edit form has to submit the current value, including Partial/Paid.
  if (newStatus === oldStatus) return false;
  // Partial/Paid come from recorded refunds, never from the dropdown.
  if (newStatus === "Partial" || newStatus === "Paid") return true;
  if (oldStatus !== "Confirmed" && oldStatus !== "Partial" && oldStatus !== "Paid") return false;
  // Once the goods have left, the only way out is Cancelled (which reverses
  // the stock-out); it can never walk back to Draft/Pending.
  return newStatus !== "Confirmed" && newStatus !== "Cancelled";
}

// Why a status change was refused — the rule is the same for both endpoints,
// so the wording is too.
function blockedStatusMessage(oldStatus, newStatus) {
  if (newStatus === "Partial" || newStatus === "Paid") {
    return `"${newStatus}" is set by recording a refund against this return, not from the status list.`;
  }
  return "A Purchase Return whose goods have already gone back can only stay Confirmed or be Cancelled.";
}

// Cancelling keeps the refund Payments (permanent history) and only reverses
// their allocation, leaving the money as unallocated vendor credit. Deleting
// the return is what removes them. Returns the reloaded doc.
async function unwindRefundsOnCancel({ orgId, purchaseReturn, oldStatus }) {
  if (purchaseReturn.status !== "Cancelled" || oldStatus === "Cancelled") return purchaseReturn;
  await allocationService.reverseDocumentAllocations({
    orgId,
    documentType: "PurchaseReturn",
    documentId: purchaseReturn._id,
  });
  return (await PurchaseReturn.findById(purchaseReturn._id)) || purchaseReturn;
}

// The refund-driven status of a return, mirroring purchaseController's
// statusForPaidAmount. Only a return that physically happened tracks refunds.
function statusForRefundedAmount(purchaseReturn, totalRefunded) {
  if (!["Confirmed", "Partial", "Paid"].includes(purchaseReturn.status)) {
    return purchaseReturn.status;
  }
  const total = Number(purchaseReturn.grandTotal) || 0;
  if (totalRefunded >= total - 0.01 && total > 0) return "Paid";
  if (totalRefunded > 0) return "Partial";
  return "Confirmed";
}

const sumRefunds = (payments) =>
  (payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

// How much of each Purchase line is already returned across other returns.
// excludeReturnId leaves the return being edited out of its own tally.
async function getReturnedQuantities(purchaseId, organization, excludeReturnId) {
  const match = {
    purchase: purchaseId,
    organization,
    status: { $ne: "Cancelled" },
  };
  if (excludeReturnId) match._id = { $ne: excludeReturnId };

  const rows = await PurchaseReturn.aggregate([
    { $match: match },
    { $unwind: "$items" },
    {
      $group: {
        _id: { itemId: "$items.itemId", variantId: "$items.variantId" },
        returned: { $sum: "$items.quantity" },
      },
    },
  ]);

  // Keyed the same way syncDocumentStock keys its own delta map, so callers
  // can look both up with one consistent key shape.
  const map = new Map();
  for (const row of rows) {
    const key = `${row._id.itemId || ""}|${row._id.variantId || "none"}`;
    map.set(key, row.returned);
  }
  return map;
}

// Hydrates the create/edit form: purchase lines + alreadyReturned/remaining.
// Re-validated server-side on save.
exports.getPurchaseItemsForReturn = async (req, res) => {
  try {
    const { purchaseId } = req.params;
    const purchase = await Purchase.findOne({
      _id: purchaseId,
      organization: req.user.organization,
    })
      .populate("vendor", "name email phone")
      .populate("items.itemId", "name description purchasePrice hsnSac gstRate variants type");
    if (!purchase) return res.status(404).json({ message: "Purchase not found" });

    const returnedMap = await getReturnedQuantities(purchase._id, req.user.organization, req.query.excludeReturnId);

    // A service was never stocked in the first place, so it can't be
    // physically returned — only products are eligible here.
    const items = purchase.items
      .filter((item) => item.itemId?.type !== "service")
      .map((item) => {
        const key = `${item.itemId?._id || item.itemId || ""}|${item.variantId || "none"}`;
        const alreadyReturned = returnedMap.get(key) || 0;
        const variant = item.variantId
          ? item.itemId?.variants?.find((v) => String(v._id) === String(item.variantId))
          : null;
        return {
          itemId: item.itemId?._id || item.itemId,
          variantId: item.variantId || null,
          variantName: variant?.name || null,
          name: item.name,
          sku: item.sku,
          unitPrice: item.unitPrice,
          // Same GST rate and tax-mode the purchase used, not a default.
          gstRate: item.gstRate || 0,
          taxInclusive: !!item.taxInclusive,
          // ────────────────────────────────────────────────────────────────
          purchasedQuantity: item.quantity,
          alreadyReturned,
          remaining: Math.max(0, item.quantity - alreadyReturned),
        };
      });

    res.json({
      purchase: {
        _id: purchase._id,
        purchaseNumber: purchase.purchaseNumber,
        transactionType: purchase.transactionType || "intra",
        vendor: purchase.vendor,
      },
      items,
    });
  } catch (err) {
    console.error("Get purchase items for return error:", err);
    res.status(500).json({ error: err.message });
  }
};

// Rejects a quantity that would push the total returned past what was
// purchased. Shared by create & update (excludeReturnId omitted / set).
async function assertQuantitiesWithinPurchase(purchase, items, organization, excludeReturnId) {
  const returnedMap = await getReturnedQuantities(purchase._id, organization, excludeReturnId);

  for (const item of items) {
    const purchasedLine = purchase.items.find(
      (pi) =>
        String(pi.itemId?._id || pi.itemId || "") === String(item.itemId || "") &&
        String(pi.variantId || "none") === String(item.variantId || "none")
    );
    if (!purchasedLine) {
      throw new Error(`"${item.name}" is not part of the selected Purchase`);
    }
    const key = `${item.itemId || ""}|${item.variantId || "none"}`;
    const alreadyReturned = returnedMap.get(key) || 0;
    const remaining = purchasedLine.quantity - alreadyReturned;
    if ((parseFloat(item.quantity) || 0) > remaining) {
      throw new Error(`Maximum returnable quantity for "${item.name}" is ${remaining}`);
    }
  }
}

exports.createPurchaseReturn = async (req, res) => {
  try {
    const { purchase, items, notes, status, mode, returnDate } = req.body;

    if (!purchase) {
      return res.status(400).json({ message: "A Purchase Return must reference an existing Purchase" });
    }
    const purchaseDoc = await Purchase.findOne({ _id: purchase, organization: req.user.organization });
    if (!purchaseDoc) return res.status(404).json({ message: "Purchase not found" });

    // Vendor and transactionType are always derived from the Purchase —
    // a return can't be attributed to a different vendor, and the GST type
    // (intra/inter) must match the original bill so tax is reversed correctly.
    const vendor = purchaseDoc.vendor;
    const transactionType = purchaseDoc.transactionType || "intra";

    if (!items || items.length === 0) {
      return res.status(400).json({ message: "At least one item is required" });
    }

    // No refunds exist yet, so a money-driven status here would be a backdoor.
    if (["Partial", "Paid"].includes(status)) {
      return res.status(400).json({ message: blockedStatusMessage(null, status) });
    }

    await assertQuantitiesWithinPurchase(purchaseDoc, items, req.user.organization);

    // Per-line tax calculation: each item carries its own gstRate/taxInclusive
    // (copied from the purchase line by the frontend). subtotal = sum of taxable
    // amounts (not gross), so grand total = subtotal + totalTax.
    const { subtotal, totalTax, grandTotal } = calcTotalsFromItems(items, transactionType);

    const returnNumber = await generateReturnNumber(req.user.organization);

    const purchaseReturn = new PurchaseReturn({
      vendor,
      purchase,
      returnNumber,
      returnDate: returnDate || Date.now(),
      items: items.map((item) => ({
        ...item,
        total: calculateItemGross(item.quantity, item.unitPrice),
        gstRate:      parseFloat(item.gstRate)  || 0,
        taxInclusive: !!item.taxInclusive,
      })),
      subtotal,
      transactionType,
      // gstRate at document level is kept for legacy read compatibility but
      // no longer drives the tax calculation — per-line rates are canonical.
      gstRate: 0,
      totalTax,
      grandTotal,
      status: status || "Draft",
      mode: mode || "",
      notes: notes || "",
      user: req.user.id,
      organization: req.user.organization,
    });

    await purchaseReturn.save();

    // Covers creating directly as Confirmed; guarded by stockMovementStatus.
    await syncPurchaseReturnStock(purchaseReturn, null, purchaseReturn.stockMovementStatus, req.user.id);

    await purchaseReturn.populate(POPULATE);

    res.status(201).json(purchaseReturn);
  } catch (err) {
    console.error("Create purchase return error:", err);
    res.status(400).json({ error: err.message });
  }
};

exports.getAllPurchaseReturns = async (req, res) => {
  try {
    const { search } = req.query;
    let query = { organization: req.user.organization };

    if (search) {
      query.$or = [
        { returnNumber: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { status: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { notes: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { "items.name": { $regex: buildFuzzySearchPattern(search), $options: "i" } },
      ];
    }

    const purchaseReturns = await PurchaseReturn.find(query).populate(POPULATE).sort({ createdAt: -1 });
    res.json(purchaseReturns);
  } catch (err) {
    console.error("Error fetching purchase returns:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getAllPurchaseReturnsWithPagination = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;

    const { search, status, sortBy = "createdAt", sortOrder = "desc" } = req.query;

    let query = { organization: req.user.organization };
    if (search) {
      query.$or = [
        { returnNumber: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { status: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { notes: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { "items.name": { $regex: buildFuzzySearchPattern(search), $options: "i" } },
      ];
    }
    if (status) query.status = status;

    const sortObj = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    if (req.query.allIds === "true") {
      const all = await PurchaseReturn.find(query).select("_id").lean();
      return res.json({ ids: all.map((p) => p._id) });
    }

    const [purchaseReturns, totalCount] = await Promise.all([
      PurchaseReturn.find(query)
        .populate(POPULATE)
        .skip(skip)
        .limit(limit)
        .sort(sortObj)
        .lean()
        .select("-__v"),
      PurchaseReturn.countDocuments(query),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      purchaseReturns,
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
    console.error("Error fetching purchase returns:", err);
    res.status(500).json({ error: "Failed to fetch purchase returns", message: err.message });
  }
};

exports.getPurchaseReturnsByVendor = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const vendor = await Vendor.findOne({ _id: vendorId, organization: req.user.organization });
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });

    const purchaseReturns = await PurchaseReturn.find({
      vendor: vendorId,
      organization: req.user.organization,
    })
      .populate(POPULATE)
      .sort({ createdAt: -1 });
    res.json(purchaseReturns);
  } catch (err) {
    console.error("Error fetching vendor purchase returns:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getPurchaseReturnById = async (req, res) => {
  try {
    const purchaseReturn = await PurchaseReturn.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    }).populate(POPULATE);
    if (!purchaseReturn) return res.status(404).json({ message: "Purchase return not found" });

    // Refund position alongside the document, so the UI doesn't have to sum
    // payments[] itself (and can't drift from what the server enforces).
    const refundedAmount = sumRefunds(purchaseReturn.payments);
    const total = Number(purchaseReturn.grandTotal) || 0;
    res.json({
      ...purchaseReturn.toObject(),
      refundedAmount,
      amountDue: Math.max(0, total - refundedAmount),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updatePurchaseReturn = async (req, res) => {
  try {
    const purchaseReturn = await PurchaseReturn.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    });
    if (!purchaseReturn) return res.status(404).json({ message: "Purchase return not found" });

    // Once a refund is recorded (Partial or Paid) the return is settled against
    // real money back from the vendor: editing the lines would move the total
    // away from what was refunded, so it becomes view-only. Refunds have their
    // own endpoints and still work, as does cancelling (updatePurchaseReturnStatus).
    if (purchaseReturn.status === "Paid" || purchaseReturn.status === "Partial") {
      return res.status(400).json({
        message: "This purchase return has refunds recorded and can no longer be edited. Remove its refunds first if it needs to change.",
      });
    }

    const { items, notes, status, mode, reason, returnDate } = req.body;

    // Captured before any field changes below, so the Confirmed stock sync
    // (after save) can tell what actually transitioned.
    const oldStatus = purchaseReturn.status;
    const oldStockMovementStatus = purchaseReturn.stockMovementStatus;

    // Confirmed is terminal (except onward to Paid) — same rule as
    // updatePurchaseReturnStatus, applied here too since this endpoint is
    // also how the edit form changes status.
    if (isBlockedStatusChange(oldStatus, status)) {
      return res.status(400).json({ message: blockedStatusMessage(oldStatus, status) });
    }

    // vendor / purchase not editable — changing them would invalidate the
    // already-returned/remaining math.
    if (returnDate !== undefined) purchaseReturn.returnDate = returnDate;
    if (notes    !== undefined) purchaseReturn.notes  = notes;
    if (status   !== undefined) purchaseReturn.status = status;
    if (mode     !== undefined) purchaseReturn.mode   = mode;
    if (reason   !== undefined) purchaseReturn.reason = reason;

    // Snapshot for the delta-sync to diff against; only itemId/variantId/
    // quantity matter.
    let previousItemsSnapshot = null;

    if (items !== undefined) {
      if (!items.length) {
        return res.status(400).json({ message: "At least one item is required" });
      }

      const purchaseDoc = await Purchase.findOne({
        _id: purchaseReturn.purchase,
        organization: req.user.organization,
      });
      if (purchaseDoc) {
        await assertQuantitiesWithinPurchase(purchaseDoc, items, req.user.organization, purchaseReturn._id);
      }

      previousItemsSnapshot = purchaseReturn.items.map((it) => ({
        itemId: it.itemId,
        variantId: it.variantId,
        quantity: it.quantity,
      }));

      // transactionType comes from the linked Purchase document (auto-derived,
      // not from the request body) — ensures GST type can't silently drift.
      const transactionType = purchaseDoc?.transactionType || purchaseReturn.transactionType || "intra";
      const { subtotal, totalTax, grandTotal } = calcTotalsFromItems(items, transactionType);

      purchaseReturn.items = items.map((item) => ({
        ...item,
        total: calculateItemGross(item.quantity, item.unitPrice),
        gstRate:      parseFloat(item.gstRate)  || 0,
        taxInclusive: !!item.taxInclusive,
      }));
      purchaseReturn.subtotal        = subtotal;
      purchaseReturn.transactionType = transactionType;
      purchaseReturn.totalTax        = totalTax;
      purchaseReturn.grandTotal      = grandTotal;

      // Editing lines moves the total refunds are measured against, so the
      // status is recomputed from the money.
      if (status === undefined) {
        purchaseReturn.status = statusForRefundedAmount(purchaseReturn, sumRefunds(purchaseReturn.payments));
      }
    }

    await purchaseReturn.save();

    // Stock OUT on Confirm, or the delta when items changed.
    await syncPurchaseReturnStock(purchaseReturn, oldStatus, oldStockMovementStatus, req.user.id, previousItemsSnapshot);

    const settled = await unwindRefundsOnCancel({
      orgId: req.user.organization,
      purchaseReturn,
      oldStatus,
    });

    await settled.populate(POPULATE);

    res.json(settled);
  } catch (err) {
    console.error("Update purchase return error:", err);
    res.status(400).json({ error: err.message });
  }
};

exports.updatePurchaseReturnStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ["Draft", "Pending", "Confirmed", "Paid", "Cancelled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const purchaseReturn = await PurchaseReturn.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    });
    if (!purchaseReturn) return res.status(404).json({ message: "Purchase return not found" });

    const oldStatus = purchaseReturn.status;
    const oldStockMovementStatus = purchaseReturn.stockMovementStatus;

    // Confirmed can't be walked back through the dropdown — stock already moved.
    if (isBlockedStatusChange(oldStatus, status)) {
      return res.status(400).json({ message: blockedStatusMessage(oldStatus, status) });
    }

    purchaseReturn.status = status;
    await purchaseReturn.save();

    await syncPurchaseReturnStock(purchaseReturn, oldStatus, oldStockMovementStatus, req.user.id);

    const settled = await unwindRefundsOnCancel({
      orgId: req.user.organization,
      purchaseReturn,
      oldStatus,
    });

    await settled.populate(POPULATE);
    res.json(settled);
  } catch (err) {
    console.error("Update purchase return status error:", err);
    res.status(400).json({ error: err.message });
  }
};

exports.deletePurchaseReturn = async (req, res) => {
  try {
    const purchaseReturn = await PurchaseReturn.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    });
    if (!purchaseReturn) return res.status(404).json({ message: "Purchase return not found" });

    // A part-refunded return is a live transaction, not a stray record — undoing
    // it is what Cancel is for (which reverses the stock and the allocation but
    // keeps the Payment). Deleting here would have to choose between destroying
    // a real refund or orphaning it, so it's refused instead.
    if (purchaseReturn.status === "Partial") {
      return res.status(400).json({
        message: "This return has been partly refunded — cancel it instead, which reverses the stock and keeps the refund in the vendor's history.",
      });
    }

    // A cancelled return is the record of a reversal that happened. Deleting it
    // would erase why the stock moved back and why the vendor holds credit.
    if (purchaseReturn.status === "Cancelled") {
      return res.status(400).json({
        message: "A cancelled return is kept as history and can't be deleted.",
      });
    }

    // Paid means the refund already completed. Delete removes the document
    // record only: the Payment stays in the vendor's history, and the stock-out
    // is NOT reversed — the goods really did go back and the vendor really did
    // pay. Deleting must not rewrite finished business history.
    if (purchaseReturn.status === "Paid") {
      await purchaseReturn.deleteOne();
      return res.json({
        message: "Purchase return deleted. Its completed refund stays in the vendor's payment history.",
      });
    }

    // Deleting a Confirmed return must reverse its stock-out — otherwise
    // stock stays understated with no surviving document to explain why.
    if (purchaseReturn.stockMovementStatus === "applied") {
      await syncDocumentStock({
        organization: purchaseReturn.organization,
        documentId: purchaseReturn._id,
        documentModel: "PurchaseReturn",
        documentNumber: purchaseReturn.returnNumber,
        items: purchaseReturn.items,
        previousItems: [],
        baseDirection: "out",
        userId: req.user.id,
        reason: "adjustment",
        isReversal: true,
      });
    }

    await purchaseReturn.deleteOne();
    res.json({ message: "Purchase return deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Bulk import — groups CSV rows by returnNumber::vendorName (case-insensitive)
// into one PurchaseReturn per group with multiple line items, exactly
// mirroring purchaseController.bulkImportPurchases's grouping strategy.
exports.bulkImportPurchaseReturns = async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "No rows to import" });
    }

    const groups = new Map();
    for (const row of rows) {
      const vendorName = (row.vendorName || "").trim();
      const itemName = (row.itemName || "").trim();
      if (!vendorName || !itemName) continue;

      const groupKey = `${(row.returnNumber || "").trim().toLowerCase()}::${vendorName.toLowerCase()}`;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          returnNumber: (row.returnNumber || "").trim(),
          vendorName,
          status: row.status || "Draft",
          mode: row.mode || "",
          reason: row.reason || "",
          notes: row.notes || "",
          items: [],
        });
      }
      groups.get(groupKey).items.push({
        name: itemName,
        quantity: parseFloat(row.quantity) || 1,
        unitPrice: parseFloat(row.unitPrice) || 0,
      });
    }

    // Import has no Payment rows and skips the stock sync, so it can't claim
    // a refund-driven or stock-moving status.
    const validStatuses = ["Draft", "Pending", "Cancelled"];

    let imported = 0;
    const errors = [];

    for (const group of groups.values()) {
      try {
        let vendor = await Vendor.findOne({
          name: { $regex: `^${group.vendorName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
          organization: req.user.organization,
        });
        if (!vendor) {
          vendor = await Vendor.create({
            name: group.vendorName,
            organization: req.user.organization,
            user: req.user.id,
          });
        }

        const subtotal = calculateSubtotal(group.items);
        const returnNumber = group.returnNumber || (await generateReturnNumber(req.user.organization));

        await PurchaseReturn.create({
          vendor: vendor._id,
          returnNumber,
          items: group.items.map((item) => ({ ...item, total: calculateItemTotal(item.quantity, item.unitPrice) })),
          subtotal,
          totalTax: 0,
          grandTotal: subtotal,
          status: validStatuses.includes(group.status) ? group.status : "Draft",
          mode: group.mode,
          reason: group.reason,
          notes: group.notes,
          user: req.user.id,
          organization: req.user.organization,
        });
        imported += 1;
      } catch (err) {
        errors.push(`${group.returnNumber || group.vendorName}: ${err.message}`);
      }
    }

    res.json({ imported, total: groups.size, errors: errors.length ? errors : undefined });
  } catch (err) {
    console.error("Bulk import purchase returns error:", err);
    res.status(500).json({ error: err.message });
  }
};


// Refunds — money IN from the vendor, recorded through
// paymentAllocationService as a real Payment + PaymentAllocation. Stock is
// untouched: it moved once, at Confirmed.

// GET /purchase-returns/:id/payments
exports.getPurchaseReturnRefunds = async (req, res) => {
  try {
    const purchaseReturn = await PurchaseReturn.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    }).populate("payments.recordedBy", "name email");
    if (!purchaseReturn) return res.status(404).json({ message: "Purchase return not found" });

    const refunded = sumRefunds(purchaseReturn.payments);
    const total = Number(purchaseReturn.grandTotal) || 0;

    res.json({
      payments: purchaseReturn.payments || [],
      totalAmount: total,
      refundedAmount: refunded,
      amountDue: Math.max(0, total - refunded),
      status: purchaseReturn.status,
    });
  } catch (err) {
    res.status(500).json({ error: `Failed to fetch refunds: ${err.message}` });
  }
};

// POST /purchase-returns/:id/payments
exports.addPurchaseReturnRefund = async (req, res) => {
  try {
    const { amount, paymentDate, paymentMethod, reference, notes } = req.body;

    const parsedAmount = parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: "A valid refund amount greater than 0 is required." });
    }

    const purchaseReturn = await PurchaseReturn.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    });
    if (!purchaseReturn) return res.status(404).json({ message: "Purchase return not found" });

    // Nothing is owed back until the goods have actually gone back.
    if (!["Confirmed", "Partial", "Paid"].includes(purchaseReturn.status)) {
      return res.status(400).json({
        error: "This return isn't confirmed yet — confirm it before recording a refund.",
      });
    }

    const alreadyRefunded = sumRefunds(purchaseReturn.payments);
    const amountDue = (Number(purchaseReturn.grandTotal) || 0) - alreadyRefunded;
    if (parsedAmount > amountDue + 0.01) {
      return res.status(400).json({
        error: `Refund cannot exceed the remaining balance of ₹${amountDue.toFixed(2)}.`,
      });
    }

    try {
      await allocationService.recordDocumentPayment({
        orgId: req.user.organization,
        userId: req.user._id,
        documentType: "PurchaseReturn",
        documentId: purchaseReturn._id,
        amount: parsedAmount,
        paymentDate,
        paymentMethod: paymentMethod || purchaseReturn.mode || "UPI",
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
    const updated = await PurchaseReturn.findById(purchaseReturn._id);

    await updated.populate(POPULATE);
    res.json({ message: "Refund recorded successfully", purchaseReturn: updated });
  } catch (err) {
    res.status(500).json({ error: `Failed to record refund: ${err.message}` });
  }
};

// PUT /purchase-returns/:id/payments/:paymentId
exports.updatePurchaseReturnRefund = async (req, res) => {
  try {
    const { amount, paymentDate, paymentMethod, reference, notes } = req.body;

    let result;
    try {
      result = await allocationService.updateDocumentPayment({
        orgId: req.user.organization,
        userId: req.user._id,
        documentType: "PurchaseReturn",
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

    const purchaseReturn = result.document;

    await purchaseReturn.populate(POPULATE);
    res.json({ message: "Refund updated successfully", purchaseReturn });
  } catch (err) {
    res.status(500).json({ error: `Failed to update refund: ${err.message}` });
  }
};

// DELETE /purchase-returns/:id/payments/:paymentId
exports.deletePurchaseReturnRefund = async (req, res) => {
  try {
    // Reverses the allocation, pulls the subdoc, recomputes status and deletes
    // the money row, so the vendor's Total Got falls by the same amount.
    let result;
    try {
      result = await allocationService.removeDocumentPayment({
        orgId: req.user.organization,
        documentType: "PurchaseReturn",
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
    res.json({ message: "Refund deleted successfully", purchaseReturn: result.document });
  } catch (err) {
    res.status(500).json({ error: `Failed to delete refund: ${err.message}` });
  }
};

exports.downloadPurchaseReturn = async (req, res) => {
  try {
    const purchaseReturn = await PurchaseReturn.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    })
      .populate("vendor")
      .populate("items.itemId", "name description purchasePrice hsnSac gstRate");

    if (!purchaseReturn) {
      return res.status(404).json({ error: "Purchase Return not found" });
    }

    const orgDetails = await Branding.findOne({
      organization: req.user.organization,
    }).sort({ updatedAt: -1 });

    const pdfBuffer = await purchaseDocumentPdf(
      purchaseReturn,
      orgDetails,
      purchaseReturn.vendor,
      "purchaseReturn"
    );

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename=Purchase-Return-${purchaseReturn.returnNumber}.pdf`,
    });
    return res.send(pdfBuffer);
  } catch (err) {
    console.error("Error downloading purchase return:", err);
    res.status(500).json({ error: err.message });
  }
};
