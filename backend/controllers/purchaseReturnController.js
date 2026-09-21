const { buildFuzzySearchPattern } = require('../utils/searchRegex');
const PurchaseReturn = require("../models/PurchaseReturn");
const Vendor = require("../models/Vendor");
const Purchase = require("../models/Purchase");
const Branding = require("../models/Branding");
const purchaseDocumentPdf = require("../utils/purchaseDocumentPdf");
const { syncDocumentStock } = require("../utils/inventorySync");

// ── Tax helpers ────────────────────────────────────────────────────────────
//
// Per-line calculation mirrors purchaseDocumentPdf.js's own math exactly so
// the numbers the controller saves always match what the PDF renders:
//
//   gross     = qty × unitPrice
//   taxable   = taxInclusive ? gross / (1 + gstRate/100) : gross
//   itemTax   = taxable × gstRate/100
//
// Intra-state  → CGST = itemTax/2,  SGST = itemTax/2
// Inter-state  → IGST = itemTax
//
// subtotal  = Σ taxable  (the base amounts before adding tax)
// totalTax  = Σ itemTax
// grandTotal = subtotal + totalTax

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

// Count-based, "PR-00001" — mirrors Purchase's own generatePurchaseNumber
// exactly (not the Counter-based resolveDocumentNumber the Invoice family
// uses; see documentNumbering.js's own comments for why Purchase never
// adopted that scheme).
async function generateReturnNumber(organizationId) {
  const count = await PurchaseReturn.countDocuments({ organization: organizationId });
  return `PR-${(count + 1).toString().padStart(5, "0")}`;
}

const POPULATE = [
  { path: "vendor", select: "name email phone" },
  { path: "purchase", select: "purchaseNumber vendor" },
  { path: "items.itemId", select: "name description purchasePrice hsnSac gstRate" },
];

// Applies the inventory stock-out for a PurchaseReturn transitioning into
// "Confirmed" — the single inventory-triggering event for this module,
// mirroring purchaseOrderController.js's syncPurchaseOrderDeliveryStock
// (Delivered) exactly. "Confirmed" is terminal for STATUS (enforced by the
// callers below via isBlockedStatusChange, which still allows moving onward
// to "Paid"), so there's no "moving out of Confirmed" branch to reverse —
// the only way to fully undo the stock-out is deleting the return, which
// deletePurchaseReturn reverses via isReversal: true.
//
// Items themselves stay editable after Confirmed though (e.g. correcting the
// return qty on an already-confirmed return) — see the `previousItems`
// branch below, which applies just the delta instead of re-deducting the new
// quantity on top of the old one. Same technique invoiceController.js's own
// update handler uses (previousItems + syncDocumentStock's built-in delta
// math), so an edit from qty 4 -> 6 only moves 2 more units of stock, never
// re-applies all 6.
//
// Deliberately NOT "Paid": Paid is a payment/refund-settled marker, orthogonal
// to whether goods have physically left. Confirmed is the physical event.
//
// Goods physically leaving toward the vendor is a reduction in our own
// stock, same directional sense as a sale — hence baseDirection: "out".
async function syncPurchaseReturnStock(purchaseReturn, oldStatus, oldStockMovementStatus, userId, previousItems = null) {
  const isNowConfirmed = purchaseReturn.status === "Confirmed";
  const wasConfirmed = oldStatus === "Confirmed" || oldStatus === "Paid";

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

// Once a return is Confirmed, goods have physically left — the status can
// only move onward to "Paid" (payment/refund settling, no stock effect) or
// stay Confirmed, never back to Draft/Pending/Cancelled. The only way to
// undo a Confirmed return's stock effect is deleting it (see
// deletePurchaseReturn). Mirrors PurchaseOrder's "Delivered can't be changed
// to another status" rule.
function isBlockedStatusChange(oldStatus, newStatus) {
  if (oldStatus !== "Confirmed") return false;
  if (newStatus === undefined) return false;
  return newStatus !== "Confirmed" && newStatus !== "Paid";
}

// How much of each line item on a Purchase has already been returned, across
// every OTHER non-Cancelled PurchaseReturn against it — the "Already
// Returned" figures the create/edit form needs to cap Return Qty with.
// `excludeReturnId` leaves the return being edited out of its own tally (its
// current items get replaced wholesale by the save, not added on top).
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

// GET /purchase-returns/purchase/:purchaseId/available — the Purchase's own
// line items enriched with how much of each has already been returned, so
// the create/edit form can render Purchased / Already Returned / Remaining
// and cap Return Qty client-side (server-side re-validated on save below).
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
          // ── GST fields from the original purchase line ──────────────────
          // The return must use the same GST rate and tax-mode the purchase
          // used — not a new/default rate. The frontend uses these to compute
          // per-line tax and grand total; the backend uses them for the same
          // math on save.
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

// Rejects any line whose quantity would push (already returned + this
// return's own quantity) past what was actually purchased. Shared by create
// (excludeReturnId undefined) and update (excludeReturnId = the return being
// edited, so its own prior contribution isn't double-counted against itself).
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

    // Covers creating a return directly with status "Confirmed" (e.g.
    // recording an already-completed historical return) — oldStatus is null
    // (never was Confirmed) so this applies exactly once, same guard as the
    // update paths.
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
    res.json(purchaseReturn);
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

    const { items, notes, status, mode, reason, returnDate } = req.body;

    // Captured before any field changes below, so the Confirmed stock sync
    // (after save) can tell what actually transitioned.
    const oldStatus = purchaseReturn.status;
    const oldStockMovementStatus = purchaseReturn.stockMovementStatus;

    // Confirmed is terminal (except onward to Paid) — same rule as
    // updatePurchaseReturnStatus, applied here too since this endpoint is
    // also how the edit form changes status.
    if (isBlockedStatusChange(oldStatus, status)) {
      return res.status(400).json({ message: "A Confirmed Purchase Return can't be changed to another status." });
    }

    // Note: vendor and purchase are intentionally not editable here — a
    // return is always against the Purchase it was created for, with vendor
    // derived from that Purchase (see createPurchaseReturn). Changing either
    // after the fact would silently invalidate the already-returned/
    // remaining-quantity math.
    if (returnDate !== undefined) purchaseReturn.returnDate = returnDate;
    if (notes    !== undefined) purchaseReturn.notes  = notes;
    if (status   !== undefined) purchaseReturn.status = status;
    if (mode     !== undefined) purchaseReturn.mode   = mode;
    if (reason   !== undefined) purchaseReturn.reason = reason;

    // Snapshotted before any item mutation below, so a delta-sync on an
    // already-Confirmed/Paid return (see syncPurchaseReturnStock) has
    // something to diff the new items against. Only itemId/variantId/
    // quantity matter to syncDocumentStock's own delta math.
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
    }

    await purchaseReturn.save();

    // Applies the Confirmed stock-out (first time) or the item-quantity
    // delta (already Confirmed/Paid, items just changed). Covers both the
    // edit form (which sends items+status together) and any bulk status
    // update that PUTs here rather than the /status endpoint below.
    await syncPurchaseReturnStock(purchaseReturn, oldStatus, oldStockMovementStatus, req.user.id, previousItemsSnapshot);

    await purchaseReturn.populate(POPULATE);

    res.json(purchaseReturn);
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

    // Confirmed is terminal (except onward to Paid) — goods have already
    // left toward the vendor and stock moved accordingly, so it can't be
    // walked back through the status dropdown. (Not enforced via the enum
    // itself since Confirmed is still a perfectly valid status to reach.)
    if (isBlockedStatusChange(oldStatus, status)) {
      return res.status(400).json({ message: "A Confirmed Purchase Return can't be changed to another status." });
    }

    purchaseReturn.status = status;
    await purchaseReturn.save();

    await syncPurchaseReturnStock(purchaseReturn, oldStatus, oldStockMovementStatus, req.user.id);

    await purchaseReturn.populate(POPULATE);
    res.json(purchaseReturn);
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
          status: group.status,
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
