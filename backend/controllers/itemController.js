const { buildFuzzySearchPattern } = require('../utils/searchRegex');
const Item = require("../models/Item");
const StockMovement = require("../models/StockMovement");

// Normalizes the inventory block posted by the item form. Multipart requests deliver nested
// objects as strings, so the caller parses first and passes the resulting object here.
//
// `currentStock` is deliberately NOT read from client input on update: stock is owned by the
// StockMovement ledger and only ever changes through the inventory stock-in/stock-out endpoints.
// Letting the product edit form post a stale currentStock back would silently overwrite real
// stock levels and bypass the audit trail entirely.
// Treats only null/undefined/"" as "not provided" — never 0, which is a real value for a
// discount or a low-stock threshold. Mirrors variantResolve.isUnset on the read side.
const isBlank = (v) => v === null || v === undefined || v === "";

function normalizeInventoryInput(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  if (raw.lowStockThreshold !== undefined) {
    out.lowStockThreshold = Math.max(0, parseFloat(raw.lowStockThreshold) || 0);
  }
  if (raw.openingStock !== undefined) {
    out.openingStock = parseFloat(raw.openingStock) || 0;
  }
  return out;
}

// Normalizes one variant's fields in place, shared by create and update so the two paths can't
// drift. The variant-specific catalog overrides (barcode/description/discount/maxDiscountPercent/
// lowStockThreshold) are all optional: an unset one must stay null so variantResolve falls back
// to the parent, which is why they aren't coerced with `|| 0` the way the always-present price
// fields are.
function normalizeVariantInput(variant) {
  // Always-present numerics: a blank here genuinely means zero.
  variant.purchasePrice = parseFloat(variant.purchasePrice) || 0;
  variant.sellingPrice = parseFloat(variant.sellingPrice) || 0;
  variant.stock = parseInt(variant.stock) || 0;
  variant.gstRate = parseFloat(variant.gstRate) || 0;
  variant.isActive = variant.isActive !== undefined ? variant.isActive : true;
  variant.attributes = variant.attributes || {};

  // Optional overrides: preserve "unset" (null) so the parent's value is inherited.
  variant.barcode = typeof variant.barcode === "string" ? variant.barcode.trim() : "";
  variant.description = typeof variant.description === "string" ? variant.description : "";

  const rawDiscount = parseJsonField(variant.discount);
  variant.discount = {
    type: rawDiscount?.type === "amount" ? "amount" : "percentage",
    value: isBlank(rawDiscount?.value) ? null : (parseFloat(rawDiscount.value) || 0),
  };

  variant.maxDiscountPercent = isBlank(variant.maxDiscountPercent)
    ? null
    : parseFloat(variant.maxDiscountPercent);

  variant.lowStockThreshold = isBlank(variant.lowStockThreshold)
    ? null
    : Math.max(0, parseFloat(variant.lowStockThreshold) || 0);

  if (!Array.isArray(variant.images)) variant.images = [];
  return variant;
}

// Distributes an `.any()` multipart upload across the parent item and its variants.
// Parent images arrive under the "images" field (unchanged); a variant's arrive under
// "variantImages_<index>", indexed against the posted variants array. Reuses the same
// uploadMiddlewareS3 / CloudFront URL shape as the parent's own images.
function partitionUploadedFiles(files) {
  const parentImages = [];
  const variantImages = new Map(); // index -> [url]
  for (const f of files || []) {
    const url = `https://${process.env.CLOUDFRONT_DOMAIN}/${f.key}`;
    const match = /^variantImages_(\d+)$/.exec(f.fieldname);
    if (match) {
      const idx = parseInt(match[1], 10);
      if (!variantImages.has(idx)) variantImages.set(idx, []);
      variantImages.get(idx).push(url);
    } else if (f.fieldname === "images") {
      parentImages.push(url);
    }
  }
  return { parentImages, variantImages };
}

// Every image URL an item currently holds, parent's and variants' alike — used to work out
// which S3 objects a save orphaned, so variant images get the same best-effort cleanup the
// parent's already had.
function collectImageUrls(doc) {
  if (!doc) return [];
  const urls = [...(doc.images || [])];
  for (const v of doc.variants || []) urls.push(...(v.images || []));
  return urls;
}

// Helper: delete an S3 object by key, best-effort (mirrors brandingController.js)
async function deleteFileFromS3(key) {
  if (!key) return;

  const { DeleteObjectCommand, S3Client } = require("@aws-sdk/client-s3");

  const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  try {
    await s3.send(new DeleteObjectCommand({ Bucket: process.env.AWS_BUCKET_NAME, Key: key }));
  } catch (error) {
    console.error("Error deleting item image from S3:", error);
    // Don't fail the request if deletion fails
  }
}

function extractS3KeyFromUrl(url) {
  if (!url) return null;
  if (process.env.CLOUDFRONT_DOMAIN && url.includes(process.env.CLOUDFRONT_DOMAIN)) {
    return url.split(`${process.env.CLOUDFRONT_DOMAIN}/`)[1];
  }
  return null;
}

// Multer (multipart) requests send JSON-shaped fields as strings; parse them
// back before they hit the schema. No-op for plain JSON requests.
function parseJsonField(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

// Seeds the ledger so a tracked item's (or variant's) stock history starts from its opening
// balance rather than from its first manual movement. Best-effort: the item is already saved
// and correct, so a ledger failure is logged rather than failing the whole request.
async function recordOpeningStock({ organization, itemId, variantId, openingStock, unitPrice, userId }) {
  if (!openingStock) return;
  try {
    await StockMovement.create({
      organization,
      item: itemId,
      variantId: variantId || null,
      direction: openingStock >= 0 ? "in" : "out",
      quantity: Math.abs(openingStock),
      previousStock: 0,
      newStock: openingStock,
      reason: "opening_stock",
      notes: "Opening stock",
      unitPrice: unitPrice || 0,
      user: userId,
    });
  } catch (ledgerErr) {
    console.error("Failed to record opening stock movement:", ledgerErr);
  }
}

const createItem = async (req, res) => {
  try {
    const itemData = {
      ...req.body,
      user: req.user.id,
      organization: req.user.organization,
    };

    itemData.variants = parseJsonField(itemData.variants);
    itemData.additionalFields = parseJsonField(itemData.additionalFields);
    itemData.discount = parseJsonField(itemData.discount);

    // A service is never stocked or varied by SKU — strip these regardless of
    // what the client sent, so a service can never end up carrying stock/
    // variant data that inventory-sync logic would otherwise have to guard
    // against everywhere it's read.
    if (itemData.type === "service") {
      itemData.variants = [];
    }

    // Inventory block from the item form. Every product is stock-tracked automatically, so this
    // is always populated (defaulting to a quantity of 0) rather than depending on an opt-in —
    // that's what makes a newly created product appear on the Inventory page immediately.
    // On create there's no ledger yet, so the opening stock becomes the starting currentStock
    // and gets its own ledger row after the item is saved.
    const inventoryInput = normalizeInventoryInput(parseJsonField(itemData.inventory)) || {};
    // A service carries no stock at all — zero everything out and leave
    // tracking off, instead of the "always on" default that applies to
    // products.
    const opening = itemData.type === "service" ? 0 : (inventoryInput.openingStock || 0);
    itemData.inventory = {
      trackInventory: itemData.type !== "service",
      lowStockThreshold: itemData.type === "service" ? 0 : (inventoryInput.lowStockThreshold || 0),
      openingStock: opening,
      currentStock: opening,
      lastMovementAt: opening !== 0 ? new Date() : null,
    };

    // Validate and parse gstRate
    itemData.gstRate = parseFloat(itemData.gstRate) || 0;

    // Default discount + max discount cap
    if (itemData.discount) {
      itemData.discount = {
        type: itemData.discount.type === "amount" ? "amount" : "percentage",
        value: parseFloat(itemData.discount.value) || 0,
      };
    }
    itemData.maxDiscountPercent =
      itemData.maxDiscountPercent === "" || itemData.maxDiscountPercent === undefined || itemData.maxDiscountPercent === null
        ? null
        : parseFloat(itemData.maxDiscountPercent);

    // Uploaded images (multipart requests only): parent's under "images", each variant's under
    // "variantImages_<index>". Applied to the variants further down, once they're parsed.
    const { parentImages, variantImages } = partitionUploadedFiles(req.files);
    if (parentImages.length) {
      itemData.images = parentImages;
    }

    // Validate variants if present
    if (itemData.variants && Array.isArray(itemData.variants)) {
      itemData.variants.forEach((variant, idx) => {
        if (!variant.name || variant.name.trim() === "") {
          throw Object.assign(new Error("Variant name is required"), { status: 400 });
        }
        normalizeVariantInput(variant);
        // Files uploaded for this variant in the same multipart request.
        const uploaded = variantImages.get(idx);
        if (uploaded?.length) variant.images = [...variant.images, ...uploaded];
      });

      // Once an item has variants, the parent's own opening-stock field is
      // disabled/zeroed on the frontend (each variant tracks its own stock
      // instead) — so seed the parent's currentStock aggregate from the sum
      // of variant stock instead of the (now-zero) parent opening value.
      // Without this, Item.inventory.currentStock — what list/Inventory
      // views read — would show 0 for a brand-new variant-bearing item even
      // though its variants hold real stock.
      if (itemData.variants.length > 0) {
        const variantStockSum = itemData.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
        itemData.inventory.currentStock = variantStockSum;
        // The parent's own opening stock is inert once the item has variants — each variant
        // seeds its own ledger row below. Zero it here rather than trusting the client to:
        // a form that hides (but doesn't clear) its opening-quantity field once a variant is
        // added would otherwise post a stale quantity, and recordOpeningStock would write a
        // phantom parent-level "opening_stock" row on top of every variant's own — double
        // counting the item's stock history against a currentStock that only sums variants.
        itemData.inventory.openingStock = 0;
        itemData.inventory.lastMovementAt = variantStockSum !== 0 ? new Date() : null;
      }
    }
    const item = new Item(itemData);
    await item.save();

    await recordOpeningStock({
      organization: req.user.organization,
      itemId: item._id,
      openingStock: item.inventory?.openingStock,
      unitPrice: parseFloat(item.purchasePrice) || 0,
      userId: req.user.id,
    });

    // Every variant on a brand-new item is new, so each one with a starting stock gets its own
    // opening_stock ledger row too — same reasoning as the parent above.
    for (const variant of item.variants || []) {
      await recordOpeningStock({
        organization: req.user.organization,
        itemId: item._id,
        variantId: variant._id,
        openingStock: variant.stock,
        unitPrice: variant.purchasePrice,
        userId: req.user.id,
      });
    }

    res.status(201).json(item);
  } catch (err) {
    console.error("Create item error:", err);
    res.status(400).json({ error: err.message });
  }
};

const getAllItems = async (req, res) => {
  try {
    const { search, category, type, isActive, gstRate } = req.query;
    let query = { organization: req.user.organization }; // Filter by organization

    if (search) {
      query.$or = [
        { name: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { description: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { category: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { hsnSac: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { barcode: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { "variants.name": { $regex: buildFuzzySearchPattern(search), $options: "i" } }, // Search in variant names
        { "variants.sku": { $regex: buildFuzzySearchPattern(search), $options: "i" } }, // Search in variant SKUs
        { "variants.barcode": { $regex: buildFuzzySearchPattern(search), $options: "i" } }, // Variants carry their own barcode
      ];
    }

    if (category) {
      query.category = { $regex: category, $options: "i" };
    }

    if (type) {
      query.type = type;
    }

    if (isActive !== undefined) {
      query.isActive = isActive === "true";
    }

    if (gstRate !== undefined) {
      query.gstRate = parseFloat(gstRate);
    }

    // own-only: restrict to items this user owns.
    if (req.ownOnly) {
      const ownFilter = { user: req.user._id };
      if (query.$or) {
        query = { organization: query.organization, $and: [{ $or: query.$or }, ownFilter] };
      } else {
        Object.assign(query, ownFilter);
      }
    }

    const items = await Item.find(query)
      .populate("user", "name email")
      .sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    console.error("Error fetching items:", err);
    res.status(500).json({ error: err.message });
  }
};

const getAllItemsPaginated = async (req, res) => {
  try {
    // Pagination parameters
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100); // Max 100 items per page
    const skip = (page - 1) * limit;

    // Filter parameters
    const { search, category, type, isActive, gstRate, sortBy = "createdAt", sortOrder = "desc" } = req.query;

    // Build query object
    let query = { organization: req.user.organization };

    // Search functionality
    if (search) {
      query.$or = [
        { name: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { description: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { category: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { hsnSac: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { barcode: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { "variants.name": { $regex: buildFuzzySearchPattern(search), $options: "i" } }, // Search in variant names
        { "variants.sku": { $regex: buildFuzzySearchPattern(search), $options: "i" } }, // Search in variant SKUs
        { "variants.barcode": { $regex: buildFuzzySearchPattern(search), $options: "i" } }, // Variants carry their own barcode
      ];
    }

    // Category filter
    if (category) {
      query.category = { $regex: category, $options: "i" };
    }

    // Type filter
    if (type) {
      query.type = type;
    }

    // Active status filter
    if (isActive !== undefined) {
      query.isActive = isActive === "true";
    }

    // GST Rate filter
    if (gstRate !== undefined) {
      query.gstRate = parseFloat(gstRate);
    }

    // own-only: restrict to items this user owns.
    if (req.ownOnly) {
      const ownFilter = { user: req.user._id };
      if (query.$or) {
        query = { organization: query.organization, $and: [{ $or: query.$or }, ownFilter] };
      } else {
        Object.assign(query, ownFilter);
      }
    }

    // Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortOrder === "desc" ? -1 : 1;

    // "Select All" support: return every matching item's _id (ignoring
    // pagination) so the frontend can select all rows across every page, not
    // just the current page.
    if (req.query.allIds === "true") {
      const allItems = await Item.find(query).select("_id").lean();
      return res.json({ ids: allItems.map((i) => i._id) });
    }

    // Execute queries in parallel for better performance
    const [items, totalCount] = await Promise.all([
      Item.find(query)
        .skip(skip)
        .limit(limit)
        .sort(sortObj)
        .lean() // Returns plain JavaScript objects instead of Mongoose documents
        .select("-__v"), // Exclude version field
      Item.countDocuments(query),
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.json({
      items,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        limit,
        hasNextPage,
        hasPrevPage,
        nextPage: hasNextPage ? page + 1 : null,
        prevPage: hasPrevPage ? page - 1 : null,
      },
    });
  } catch (err) {
    console.error("Error fetching items:", err);
    res.status(500).json({
      error: "Failed to fetch items",
      message: err.message,
    });
  }
};

// A user with own-only permission may only touch items they own — shared
// here since getItemById/updateItem/deleteItem all need the same check.
// record.user may be a raw ObjectId or, when populated (e.g. getItemById),
// a User subdocument — handle both so populated lookups don't false-negative.
const isOwnedByUser = (record, userId) => {
  const uid = userId.toString();
  const recordUserId = record.user?._id ?? record.user;
  return recordUserId?.toString() === uid;
};

const getItemById = async (req, res) => {
  try {
    const item = await Item.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    }).populate("user", "name email");

    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    if (req.ownOnly && !isOwnedByUser(item, req.user._id)) {
      return res.status(403).json({ error: "You can only view items you own" });
    }

    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const updateItem = async (req, res) => {
  try {
    const itemData = {
      ...req.body,
      user: req.user.id,
      organization: req.user.organization,
    };

    itemData.variants = parseJsonField(itemData.variants);
    itemData.additionalFields = parseJsonField(itemData.additionalFields);
    itemData.discount = parseJsonField(itemData.discount);
    const existingImages = parseJsonField(itemData.existingImages) || [];
    delete itemData.existingImages;

    // Same as createItem: a service never carries variants, including if an
    // item is switched from Product to Service on this edit.
    if (itemData.type === "service") {
      itemData.variants = [];
    }

    // Only the two inventory SETTINGS are editable from the product form — never the stock level
    // itself. Assigning the whole posted object here would let a stale currentStock from the form
    // overwrite real stock and bypass the StockMovement ledger, so the incoming block is rebuilt
    // field-by-field with dot paths (which also avoids clobbering the untouched sub-fields).
    const inventoryInput = normalizeInventoryInput(parseJsonField(itemData.inventory));
    delete itemData.inventory;
    if (inventoryInput?.lowStockThreshold !== undefined) {
      itemData["inventory.lowStockThreshold"] = inventoryInput.lowStockThreshold;
    }

    // Validate and parse gstRate
    itemData.gstRate = parseFloat(itemData.gstRate) || 0;

    // Default discount + max discount cap
    if (itemData.discount) {
      itemData.discount = {
        type: itemData.discount.type === "amount" ? "amount" : "percentage",
        value: parseFloat(itemData.discount.value) || 0,
      };
    }
    itemData.maxDiscountPercent =
      itemData.maxDiscountPercent === "" || itemData.maxDiscountPercent === undefined || itemData.maxDiscountPercent === null
        ? null
        : parseFloat(itemData.maxDiscountPercent);

    // Merge kept existing images with any newly uploaded ones; best-effort
    // delete from S3 whatever the user removed (matches how branding's
    // logo/signature replacement behaves).
    const { parentImages, variantImages } = partitionUploadedFiles(req.files);
    if (parentImages.length) {
      itemData.images = [...existingImages, ...parentImages];
    } else if (Array.isArray(existingImages)) {
      itemData.images = existingImages;
    }

    // Snapshot every image the item holds today — parent's and variants' — so the orphan sweep
    // can cover variant images too. Taken before the variants are normalized below; the actual
    // comparison happens after that, once the kept set is known.
    const currentItem = await Item.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    }).select("images variants").lean();

    // Validate variants if present. A variant already carrying an `_id` is one that already
    // exists (its `stock` field below is ignored by the frontend once the item exists — see
    // ItemForm.jsx's variant Stock lock — but is left as posted here as defense in depth: it's
    // simply never surfaced to the ledger). One with no `_id` is brand new and gets its own
    // opening_stock ledger row once saved, same as a parent item's opening stock.
    const newVariantIndexes = [];
    if (itemData.variants && Array.isArray(itemData.variants)) {
      itemData.variants.forEach((variant, idx) => {
        if (!variant.name || variant.name.trim() === "") {
          throw Object.assign(new Error("Variant name is required"), { status: 400 });
        }
        if (!variant._id) newVariantIndexes.push(idx);
        normalizeVariantInput(variant);
        // The client posts the variant images it KEPT in `variant.images` (same contract as the
        // parent's existingImages); anything uploaded for this variant in the same request is
        // appended. Whatever the client dropped is swept from S3 below.
        const uploaded = variantImages.get(idx);
        if (uploaded?.length) variant.images = [...variant.images, ...uploaded];
      });
    }

    // Best-effort S3 cleanup for images the save orphaned, parent's and variants' alike.
    // Compared against the full post-normalization payload so a variant image is only deleted
    // when it survives nowhere — including when it was moved between variants on this edit.
    if (Array.isArray(itemData.images) || Array.isArray(itemData.variants)) {
      const keptUrls = new Set([
        ...(Array.isArray(itemData.images) ? itemData.images : currentItem?.images || []),
        ...(Array.isArray(itemData.variants)
          ? itemData.variants.flatMap((v) => v.images || [])
          : (currentItem?.variants || []).flatMap((v) => v.images || [])),
      ]);
      collectImageUrls(currentItem)
        .filter((url) => !keptUrls.has(url))
        .forEach((url) => {
          const key = extractS3KeyFromUrl(url);
          if (key) deleteFileFromS3(key);
        });
    }

    if (req.ownOnly) {
      const existing = await Item.findOne({
        _id: req.params.id,
        organization: req.user.organization,
      });
      if (!existing) {
        return res.status(404).json({ error: "Item not found" });
      }
      if (!isOwnedByUser(existing, req.user._id)) {
        return res.status(403).json({ error: "You can only edit items you own" });
      }
    }

    const item = await Item.findOneAndUpdate(
      {
        _id: req.params.id,
        organization: req.user.organization,
      },
      itemData,
      {
        new: true,
        runValidators: true,
      }
    ).populate("user", "name email");

    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    // A variant added on this edit seeds its own opening-stock ledger row, exactly like one
    // created with the item. The parent's denormalized `currentStock` aggregate has to move
    // with it: without this, the new variant's stock exists in the ledger but the Inventory
    // page (which reads Item.inventory.currentStock) keeps showing the pre-edit total, and
    // the aggregate silently drifts from the ledger that is meant to back it.
    let addedVariantStock = 0;
    for (const idx of newVariantIndexes) {
      const variant = item.variants[idx];
      if (!variant) continue;
      await recordOpeningStock({
        organization: req.user.organization,
        itemId: item._id,
        variantId: variant._id,
        openingStock: variant.stock,
        unitPrice: variant.purchasePrice,
        userId: req.user.id,
      });
      addedVariantStock += variant.stock || 0;
    }

    if (addedVariantStock !== 0) {
      item.inventory.currentStock = (item.inventory.currentStock || 0) + addedVariantStock;
      item.inventory.lastMovementAt = new Date();
      await item.save();
    }

    res.json(item);
  } catch (err) {
    console.error("Update item error:", err);
    res.status(400).json({ error: err.message });
  }
};

const deleteItem = async (req, res) => {
  try {
    if (req.ownOnly) {
      const existing = await Item.findOne({
        _id: req.params.id,
        organization: req.user.organization,
      });
      if (!existing) {
        return res.status(404).json({ error: "Item not found" });
      }
      if (!isOwnedByUser(existing, req.user._id)) {
        return res.status(403).json({ error: "You can only delete items you own" });
      }
    }

    const item = await Item.findOneAndDelete({
      _id: req.params.id,
      organization: req.user.organization,
    });

    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    res.json({ message: "Item deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getItemCategories = async (req, res) => {
  try {
    const categories = await Item.distinct("category", {
      organization: req.user.organization,
      category: { $ne: "" },
    });
    res.json(categories.filter((cat) => cat && cat.trim() !== ""));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const toggleItemStatus = async (req, res) => {
  try {
    const item = await Item.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    });

    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    item.isActive = !item.isActive;
    await item.save();

    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const exportSelectedItems = async (req, res) => {
  try {
    const { selectedIds, columns } = req.body;

    if (!selectedIds || selectedIds.length === 0) {
      return res.status(400).json({ error: "No items selected for export" });
    }

    // Fetch every selected item regardless of pagination, scoped to the org
    // so one tenant can never export another's rows.
    const items = await Item.find({
      _id: { $in: selectedIds },
      organization: req.user.organization,
    }).lean();

    const headerRow = columns.map((c) => `"${c.label}"`).join(",");

    const dataRows = items.map((item) =>
      columns
        .map((c) => {
          let val = "";

          if (c.isCustomField) {
            const field = item.additionalFields?.find((f) => f.key === c.key);
            val = field ? field.value : "";
          } else if (c.key === "variants") {
            // Variants is an array subdocument; flatten to one readable cell.
            val = (item.variants || []).map((v) => v.name).filter(Boolean).join(", ");
          } else {
            val = item[c.key] ?? "";
          }

          if (typeof val === "object" && val !== null) val = JSON.stringify(val);
          val = String(val).replace(/"/g, '""');

          return `"${val}"`;
        })
        .join(","),
    );

    const csvContent = [headerRow, ...dataRows].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="Exported_Items.csv"');
    res.status(200).send(csvContent);
  } catch (error) {
    console.error("Item export error:", error);
    res.status(500).json({ error: "Failed to export items" });
  }
};

module.exports = {
  createItem,
  getAllItems,
  getItemById,
  updateItem,
  deleteItem,
  getItemCategories,
  toggleItemStatus,
  getAllItemsPaginated,
  exportSelectedItems,
};