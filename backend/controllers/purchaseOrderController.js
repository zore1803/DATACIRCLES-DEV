const { buildFuzzySearchPattern } = require('../utils/searchRegex');
const PurchaseOrder = require("../models/PurchaseOrder");
const Purchase = require("../models/Purchase");
const Vendor = require("../models/Vendor");
const Branding = require("../models/Branding");
const purchaseDocumentPdf = require("../utils/purchaseDocumentPdf");
const { syncDocumentStock } = require("../utils/inventorySync");

// Helper function to generate unique PO number per organization
async function generatePONumber(organizationId) {
  const count = await PurchaseOrder.countDocuments({ organization: organizationId });
  return `PO-${(count + 1).toString().padStart(5, "0")}`;
}

// Round to 2 decimals without binary float drift (…329999), for clean money.
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Helper function to calculate item total
function calculateItemTotal(quantity, unitPrice) {
  return (parseFloat(quantity) || 0) * (parseFloat(unitPrice) || 0);
}

// Helper function to calculate tax (CGST+SGST for intra, IGST for inter — same split as purchaseController).
function calculateTax(items) {
  return items.reduce((sum, item) => sum + (parseFloat(item.taxAmount) || 0), 0);
}

// Stamps each item's own per-item tax (from that item's own gstRate/taxInclusive — seeded from
// the variant when one was selected) and rolls them up into subtotal/totalTax/grandTotal.
// Mirrors PurchaseOrderForm.jsx's own frontend math exactly, so what's stored never disagrees
// with what the form displayed. Shared by create and update so they can never drift apart.
function formatOrderItems(items) {
  const formattedItems = items.map((item) => {
    const itemTotal = round2(calculateItemTotal(item.quantity, item.unitPrice));
    const gstRate = parseFloat(item.gstRate) || 0;
    const taxInclusive = item.taxInclusive || false;
    const taxAmount = round2(taxInclusive
      ? itemTotal - (itemTotal / (1 + gstRate / 100))
      : itemTotal * (gstRate / 100));

    return { ...item, total: itemTotal, gstRate, taxInclusive, taxAmount };
  });

  // subtotal is net-of-tax on tax-inclusive lines — using the gross itemTotal directly would
  // double-count the tax already folded into that line's price.
  const subtotal = round2(formattedItems.reduce((sum, item) => {
    const gross = item.total;
    return sum + (item.taxInclusive ? round2(gross - item.taxAmount) : gross);
  }, 0));
  const totalTax = round2(calculateTax(formattedItems));
  // "Round Off": grand total rounded to the nearest whole rupee, with the
  // difference kept as roundOff (e.g. -0.24) for the invoice line.
  const rawGrand = round2(subtotal + totalTax);
  const grandTotal = Math.round(rawGrand);
  const roundOff = round2(grandTotal - rawGrand);

  return { formattedItems, subtotal, totalTax, grandTotal, roundOff };
}

// Attaches a `convertedPurchase` summary ({_id, purchaseNumber}) to each PO so
// the frontend can show "already converted" and hide/disable "Convert to
// Purchase" instead of only finding out when the create call 400s.
async function attachConvertedPurchaseInfo(purchaseOrders, organizationId) {
  const list = Array.isArray(purchaseOrders) ? purchaseOrders : [purchaseOrders];
  const ids = list.map((po) => po._id).filter(Boolean);
  if (ids.length === 0) return purchaseOrders;

  const linkedPurchases = await Purchase.find({
    purchaseOrder: { $in: ids },
    organization: organizationId,
  }).select("_id purchaseNumber purchaseOrder").lean();

  const byPoId = new Map(linkedPurchases.map((p) => [String(p.purchaseOrder), p]));

  list.forEach((po) => {
    const linked = byPoId.get(String(po._id));
    const summary = linked ? { _id: linked._id, purchaseNumber: linked.purchaseNumber } : null;
    // Mongoose documents only serialize schema paths + `_doc` — an arbitrary
    // instance property like `po.convertedPurchase = x` would silently vanish
    // from res.json(). Lean objects (from .lean() queries) are plain objects,
    // so a direct assignment is enough for them.
    if (po._doc) {
      po._doc.convertedPurchase = summary;
    } else {
      po.convertedPurchase = summary;
    }
  });

  return purchaseOrders;
}

// A Purchase Order NEVER moves stock — not even on "Delivered". A PO is only
// the intent to buy; "Delivered" just means the order is ready to be converted
// into a Purchase. The actual goods-received stock-in is owned entirely by the
// Purchase's own "Confirmed" event (see purchaseController.syncPurchaseStock),
// and the reversal by that Purchase being Cancelled after Confirmed.
//
// Kept as a no-op (rather than removing the call sites) so the PO status flow
// stays exactly as before and the module keeps one clear place documenting why
// no stock moves here. `stockMovementStatus` on the PO is left untouched.
async function syncPurchaseOrderDeliveryStock(/* purchaseOrder, oldStatus, oldStockMovementStatus, userId */) {
  // Intentionally does nothing — the PO is stock-free by design.
  return;
}

// Create Purchase Order
exports.createPurchaseOrder = async (req, res) => {
  try {
    const { vendorId, items, paymentTerms, notes } = req.body;

    // Validate vendor within organization
    const vendor = await Vendor.findOne({
      _id: vendorId,
      organization: req.user.organization
    });
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });

    // Validate items
    if (!items || items.length === 0) {
      return res.status(400).json({ message: "At least one item is required" });
    }

    // Calculate totals — per-item GST (from each item's own gstRate/taxInclusive,
    // seeded from the variant when one was selected), same math the edit form already used.
    const { transactionType } = req.body;
    const { formattedItems, subtotal, totalTax, grandTotal, roundOff } = formatOrderItems(items);

    // Generate PO Number for organization
    const poNumber = await generatePONumber(req.user.organization);

    const purchaseOrder = new PurchaseOrder({
      vendor: vendorId,
      poNumber,
      items: formattedItems,
      subtotal,
      totalTax,
      roundOff,
      grandTotal,
      totalAmount: grandTotal,
      transactionType: transactionType || undefined,
      paymentTerms,
      notes,
      user: req.user.id,
      organization: req.user.organization
    });

    await purchaseOrder.save();
    res.status(201).json(purchaseOrder);
  } catch (err) {
    console.error("Create purchase order error:", err);
    res.status(400).json({ error: err.message });
  }
};

// Get All Purchase Orders
exports.getAllPurchaseOrders = async (req, res) => {
  try {
    const { search } = req.query;
    let query = { organization: req.user.organization };

    if (req.ownOnly) {
      query.user = req.user._id;
    }

    if (search) {
      query.$or = [
        { poNumber: { $regex: buildFuzzySearchPattern(search), $options: 'i' } },
        { status: { $regex: buildFuzzySearchPattern(search), $options: 'i' } },
        { paymentTerms: { $regex: buildFuzzySearchPattern(search), $options: 'i' } },
        { notes: { $regex: buildFuzzySearchPattern(search), $options: 'i' } }
      ];
    }
    
    const purchaseOrders = await PurchaseOrder.find(query).populate("vendor");
    await attachConvertedPurchaseInfo(purchaseOrders, req.user.organization);
    res.json(purchaseOrders);
  } catch (err) {
    console.error("Error fetching purchase orders:", err);
    res.status(500).json({ error: err.message });
  }
};

// Get All Purchase Orders with Pagination
exports.getAllPurchaseOrdersWithPagination = async (req, res) => {
  try {
    // Pagination parameters
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100); // Max 100 items per page
    const skip = (page - 1) * limit;
    
    // Filter parameters
    const { search, status, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    
    // Build query object
    let query = { organization: req.user.organization };

    if (req.ownOnly) {
      query.user = req.user._id;
    }

    // Search functionality
    if (search) {
      query.$or = [
        { poNumber: { $regex: buildFuzzySearchPattern(search), $options: 'i' } },
        { status: { $regex: buildFuzzySearchPattern(search), $options: 'i' } },
        { paymentTerms: { $regex: buildFuzzySearchPattern(search), $options: 'i' } },
        { notes: { $regex: buildFuzzySearchPattern(search), $options: 'i' } }
      ];
    }
    
    // Status filter
    if (status) {
      query.status = status;
    }
    
    // Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // "Select All" support: return every matching purchase order's _id
    // (ignoring pagination) so the frontend can select all rows across every
    // page, not just the current page.
    if (req.query.allIds === 'true') {
      const allPurchaseOrders = await PurchaseOrder.find(query).select('_id').lean();
      return res.json({ ids: allPurchaseOrders.map((po) => po._id) });
    }

    // Execute queries in parallel for better performance
    const [purchaseOrders, totalCount] = await Promise.all([
      PurchaseOrder.find(query)
        .populate("vendor")
        .skip(skip)
        .limit(limit)
        .sort(sortObj)
        .lean() // Returns plain JavaScript objects instead of Mongoose documents
        .select('-__v'), // Exclude version field
      PurchaseOrder.countDocuments(query)
    ]);
    await attachConvertedPurchaseInfo(purchaseOrders, req.user.organization);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;
    
    res.json({
      purchaseOrders,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        limit,
        hasNextPage,
        hasPrevPage,
        nextPage: hasNextPage ? page + 1 : null,
        prevPage: hasPrevPage ? page - 1 : null
      }
    });
  } catch (err) {
    console.error('Error fetching purchase orders:', err);
    res.status(500).json({ 
      error: 'Failed to fetch purchase orders',
      message: err.message 
    });
  }
};

// Get All Purchase Orders for a Vendor
exports.getPurchaseOrdersByVendor = async (req, res) => {
  try {
    const { vendorId } = req.params;
    
    // Verify vendor belongs to organization
    const vendor = await Vendor.findOne({
      _id: vendorId,
      organization: req.user.organization
    });
    
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }
    
    const purchaseOrders = await PurchaseOrder.find({ 
      vendor: vendorId,
      organization: req.user.organization
    }).populate("vendor", "name email");
    res.json(purchaseOrders);
  } catch (err) {
    console.error("Error fetching vendor purchase orders:", err);
    res.status(500).json({ error: err.message });
  }
};

// Get Single Purchase Order by ID
exports.getPurchaseOrderById = async (req, res) => {
  try {
    const purchaseOrder = await PurchaseOrder.findOne({
      _id: req.params.id,
      organization: req.user.organization
    }).populate("vendor");
    
    if (!purchaseOrder) return res.status(404).json({ message: "Purchase Order not found" });
    await attachConvertedPurchaseInfo(purchaseOrder, req.user.organization);
    res.json(purchaseOrder);
  } catch (err) {
    console.error("Error fetching purchase order:", err);
    res.status(500).json({ error: err.message });
  }
};

// Update Purchase Order
exports.updatePurchaseOrder = async (req, res) => {
  try {
    const { items, paymentTerms, notes, status } = req.body;

    const purchaseOrder = await PurchaseOrder.findOne({
      _id: req.params.id,
      organization: req.user.organization
    });

    if (!purchaseOrder) return res.status(404).json({ message: "Purchase Order not found" });

    // Captured before any field changes below, so the Delivered stock sync
    // (after save) can tell what actually transitioned.
    const oldStatus = purchaseOrder.status;
    const oldStockMovementStatus = purchaseOrder.stockMovementStatus;

    // Delivered is terminal — same rule as updatePurchaseOrderStatus, applied
    // here too since this endpoint is also how the edit form and bulk status
    // updates change status.
    if (oldStatus === "Delivered" && status && status !== "Delivered") {
      return res.status(400).json({ message: "A Delivered Purchase Order can't be changed to another status." });
    }

    // Update fields
    if (items) {
      const { transactionType } = req.body;
      const { formattedItems, subtotal, totalTax, grandTotal, roundOff } = formatOrderItems(items);

      purchaseOrder.items = formattedItems;
      purchaseOrder.subtotal = subtotal;
      purchaseOrder.totalTax = totalTax;
      purchaseOrder.roundOff = roundOff;
      purchaseOrder.grandTotal = grandTotal;
      purchaseOrder.totalAmount = grandTotal;
      if (transactionType) purchaseOrder.transactionType = transactionType;
    }

    if (paymentTerms) purchaseOrder.paymentTerms = paymentTerms;
    if (notes) purchaseOrder.notes = notes;
    if (status) purchaseOrder.status = status;

    await purchaseOrder.save();

    // Applies/reverses the Delivered stock movement. Covers both the edit
    // form (which sends items+status together) and bulk status updates from
    // the list page, which PUT here rather than the /status endpoint below.
    await syncPurchaseOrderDeliveryStock(purchaseOrder, oldStatus, oldStockMovementStatus, req.user.id);

    res.json(purchaseOrder);
  } catch (err) {
    console.error("Update purchase order error:", err);
    res.status(400).json({ error: err.message });
  }
};

// Update Purchase Order Status
exports.updatePurchaseOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ["Pending", "Approved", "Rejected", "Delivered"];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const existingPO = await PurchaseOrder.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    });
    if (!existingPO) {
      return res.status(404).json({ message: "Purchase Order not found" });
    }
    const oldStatus = existingPO.status;
    const oldStockMovementStatus = existingPO.stockMovementStatus;

    // Delivered is terminal — goods have already been recorded as received
    // and stock moved accordingly, so it can't be walked back through the
    // status dropdown. (Not enforced via the enum itself since Delivered is
    // still a perfectly valid status to reach.)
    if (oldStatus === "Delivered" && status !== "Delivered") {
      return res.status(400).json({ message: "A Delivered Purchase Order can't be changed to another status." });
    }

    const purchaseOrder = await PurchaseOrder.findOneAndUpdate(
      {
        _id: req.params.id,
        organization: req.user.organization
      },
      { status },
      { new: true }
    );

    if (!purchaseOrder) {
      return res.status(404).json({ message: "Purchase Order not found" });
    }

    await syncPurchaseOrderDeliveryStock(purchaseOrder, oldStatus, oldStockMovementStatus, req.user.id);

    res.json(purchaseOrder);
  } catch (err) {
    console.error("Update purchase order status error:", err);
    res.status(400).json({ error: err.message });
  }
};

// Delete Purchase Order
exports.deletePurchaseOrder = async (req, res) => {
  try {
    const purchaseOrder = await PurchaseOrder.findOne({
      _id: req.params.id,
      organization: req.user.organization
    });

    if (!purchaseOrder) {
      return res.status(404).json({ message: "Purchase Order not found" });
    }

    // New POs are stock-free, so this never fires for them. It stays only to
    // clean up LEGACY POs that applied a stock increase under the old
    // "Delivered moves stock" behavior — deleting such a PO must reverse that
    // increase so stock isn't left inflated with no surviving document.
    if (purchaseOrder.stockMovementStatus === "applied") {
      await syncDocumentStock({
        organization: req.user.organization,
        documentId: purchaseOrder._id,
        documentModel: "PurchaseOrder",
        documentNumber: purchaseOrder.poNumber,
        items: purchaseOrder.items,
        previousItems: [],
        baseDirection: "in",
        userId: req.user.id,
        reason: "adjustment",
        isReversal: true,
      });
    }

    await purchaseOrder.deleteOne();

    res.json({ message: "Purchase Order deleted successfully" });
  } catch (err) {
    console.error("Delete purchase order error:", err);
    res.status(500).json({ error: err.message });
  }
};

// Download Purchase Order as PDF — same server-rendered approach as
// purchaseController.downloadPurchase (see utils/purchaseDocumentPdf.js).
exports.downloadPurchaseOrder = async (req, res) => {
  try {
    const purchaseOrder = await PurchaseOrder.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    }).populate("vendor");

    if (!purchaseOrder) {
      return res.status(404).json({ error: "Purchase Order not found" });
    }

    const orgDetails = await Branding.findOne({
      organization: req.user.organization,
    }).sort({ updatedAt: -1 });

    const pdfBuffer = await purchaseDocumentPdf(
      purchaseOrder,
      orgDetails,
      purchaseOrder.vendor,
      "purchaseOrder"
    );

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename=purchase-order-${purchaseOrder.poNumber}.pdf`,
    });
    return res.send(pdfBuffer);
  } catch (err) {
    console.error("Error downloading purchase order:", err);
    res.status(500).json({ error: err.message });
  }
};

// Export Selected Purchase Orders
exports.exportSelectedPurchaseOrders = async (req, res) => {
  try {
    const { selectedIds, columns } = req.body;

    if (!selectedIds || selectedIds.length === 0) {
      return res.status(400).json({ error: "No purchase orders selected for export" });
    }

    // Fetch every selected purchase order regardless of pagination, scoped to
    // the org so one tenant can never export another's rows.
    const purchaseOrders = await PurchaseOrder.find({
      _id: { $in: selectedIds },
      organization: req.user.organization,
    })
      .populate("vendor", "name")
      .lean();

    const headerRow = columns.map((c) => `"${c.label}"`).join(",");

    const dataRows = purchaseOrders.map((po) =>
      columns
        .map((c) => {
          let val = "";

          if (c.key === "vendor") {
            val = po.vendor?.name || "";
          } else if (c.key === "items") {
            // Line items are a subdocument array; flatten to one readable cell.
            val = (po.items || [])
              .map((i) => `${i.name} x${i.quantity}`)
              .join("; ");
          } else {
            val = po[c.key] ?? "";
          }

          if (typeof val === "object" && val !== null) val = JSON.stringify(val);
          val = String(val).replace(/"/g, '""');

          return `"${val}"`;
        })
        .join(","),
    );

    const csvContent = [headerRow, ...dataRows].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="Exported_PurchaseOrders.csv"');
    res.status(200).send(csvContent);
  } catch (error) {
    console.error("Purchase order export error:", error);
    res.status(500).json({ error: "Failed to export purchase orders" });
  }
};

// Bulk Import Purchase Orders from CSV rows.
// Each row is a flat, single-line-item shape (poNumber, vendorName, itemName,
// quantity, unitPrice, paymentTerms, status, notes) — the same "one row per
// item, vendor matched/created by name" pattern used for Purchases bulk
// import. Rows sharing the same poNumber + vendorName are grouped into one
// PO with multiple line items, so a multi-item order can still be imported
// from a flat CSV.
exports.bulkImportPurchaseOrders = async (req, res) => {
  try {
    const { rows } = req.body;

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "No purchase order data provided" });
    }

    const organizationId = req.user.organization;

    // Resolve/create vendors by name first so every row in a group shares
    // the exact same vendor ObjectId.
    const vendorCache = new Map();
    const resolveVendor = async (name) => {
      const key = name.trim().toLowerCase();
      if (vendorCache.has(key)) return vendorCache.get(key);
      let vendor = await Vendor.findOne({
        organization: organizationId,
        name: { $regex: `^${name.trim()}$`, $options: "i" },
      });
      if (!vendor) {
        vendor = await Vendor.create({
          name: name.trim(),
          organization: organizationId,
          user: req.user.id,
        });
      }
      vendorCache.set(key, vendor);
      return vendor;
    };

    // Group rows into POs: an explicit poNumber groups rows together; rows
    // without one become their own single-item PO.
    const groups = new Map();
    let ungroupedIndex = 0;
    for (const row of rows) {
      if (!row.vendorName || !row.vendorName.trim()) continue;
      if (!row.itemName || !row.itemName.trim()) continue;
      const groupKey = row.poNumber && row.poNumber.trim()
        ? `${row.poNumber.trim().toLowerCase()}::${row.vendorName.trim().toLowerCase()}`
        : `__row_${ungroupedIndex++}`;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          poNumber: row.poNumber?.trim() || null,
          vendorName: row.vendorName.trim(),
          paymentTerms: row.paymentTerms?.trim() || "Net 30",
          status: row.status?.trim() || "Pending",
          notes: row.notes?.trim() || "",
          items: [],
        });
      }
      const quantity = parseFloat(row.quantity) || 0;
      const unitPrice = parseFloat(row.unitPrice) || 0;
      groups.get(groupKey).items.push({
        name: row.itemName.trim(),
        quantity,
        unitPrice,
        total: quantity * unitPrice,
      });
    }

    if (groups.size === 0) {
      return res.status(400).json({
        error: "No valid rows found. Each row needs Vendor Name and Item Name.",
      });
    }

    const validStatuses = ["Pending", "Approved", "Rejected", "Delivered"];
    const errors = [];
    let imported = 0;

    for (const group of groups.values()) {
      try {
        const vendor = await resolveVendor(group.vendorName);
        const totalAmount = group.items.reduce((sum, i) => sum + i.total, 0);
        const poNumber = group.poNumber || (await generatePONumber(organizationId));
        const status = validStatuses.includes(group.status) ? group.status : "Pending";

        await PurchaseOrder.create({
          vendor: vendor._id,
          poNumber,
          items: group.items,
          totalAmount,
          paymentTerms: group.paymentTerms,
          status,
          notes: group.notes,
          user: req.user.id,
          organization: organizationId,
        });
        imported++;
      } catch (err) {
        errors.push({ poNumber: group.poNumber, vendor: group.vendorName, message: err.message });
      }
    }

    res.json({
      message: `Imported ${imported} purchase order${imported !== 1 ? "s" : ""}${errors.length ? `, ${errors.length} failed` : ""}`,
      imported,
      total: groups.size,
      errors: errors.slice(0, 5),
    });
  } catch (error) {
    console.error("Bulk import purchase orders error:", error);
    res.status(500).json({ error: "Failed to import purchase orders: " + error.message });
  }
};
