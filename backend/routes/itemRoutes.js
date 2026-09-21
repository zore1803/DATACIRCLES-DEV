// routes/itemRoutes.js (updated with organization filtering)
const express = require("express");
const router = express.Router();
const itemController = require("../controllers/itemController");
const authMiddleware = require("../middlewares/auth");
const userSync = require("../middlewares/userSync");
const checkPermission = require("../middlewares/checkPermission");

const requireAuth = [authMiddleware, userSync];
const subscriptionGate = require('../middlewares/subscriptionGate');
const uploadMiddlewareS3 = require('../middlewares/uploadMiddlewareS3');

// CREATE Item
router.post("/",
  requireAuth,
  subscriptionGate,
  checkPermission("items", "read-write"),
  // .any() rather than .array("images"): images now arrive under "images" (the parent's) AND
  // "variantImages_<index>" (each variant's own). itemController partitions them by fieldname.
  uploadMiddlewareS3().any(),
  itemController.createItem
);

// READ All Items
router.get("/",
  requireAuth,
  subscriptionGate,
  checkPermission("items", "readonly"),
  itemController.getAllItems
);

// READ All Items
router.get("/pagination",
  requireAuth,
  subscriptionGate,
  checkPermission("items", "readonly"),
  itemController.getAllItemsPaginated
);

// GET Item Categories (for dropdown/filter)
router.get("/categories",
  requireAuth,
  subscriptionGate,
  checkPermission("items", "readonly"),
  itemController.getItemCategories
);

// READ Single Item
router.get("/:id",
  requireAuth,
  subscriptionGate,
  checkPermission("items", "readonly"),
  itemController.getItemById
);

// UPDATE Item
router.put("/:id",
  requireAuth,
  subscriptionGate,
  checkPermission("items", "read-write"),
  // .any() rather than .array("images"): images now arrive under "images" (the parent's) AND
  // "variantImages_<index>" (each variant's own). itemController partitions them by fieldname.
  uploadMiddlewareS3().any(),
  itemController.updateItem
);

// Toggle Item Status (Active/Inactive)
router.patch("/:id/toggle-status",
  requireAuth,
  subscriptionGate,
  checkPermission("items", "read-write"),
  itemController.toggleItemStatus
);

// DELETE Item
router.delete("/:id",
  requireAuth,
  subscriptionGate,
  checkPermission("items", "read-write"),
  itemController.deleteItem
);

// Export Selected Items
router.post("/export-selected",
  requireAuth,
  subscriptionGate,
  checkPermission("items", "readonly"),
  itemController.exportSelectedItems
);

// Bulk Import Items
router.post('/bulk-import', requireAuth, subscriptionGate, checkPermission('items', 'read-write'), async (req, res) => {
  try {
    const { items } = req.body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "No items data provided" });
    }

    console.log(`Processing ${items.length} items for bulk import`);

    // Process each item
    const validItems = [];
    for (const item of items) {
      if (!item.name || item.name.trim() === '') {
        console.log(`Skipping invalid item: no name`);
        continue;
      }

      // Parse prices to numbers
      item.purchasePrice = parseFloat(item.purchasePrice) || 0;
      item.sellingPrice = parseFloat(item.sellingPrice) || 0;
      
      // Set default type if not provided
      if (!item.type || !['product', 'service'].includes(item.type)) {
        item.type = 'product';
      }
      
      // Set default unit if not provided
      if (!item.primaryUnit) {
        item.primaryUnit = 'OTH OTHERS';
      }
      
      // Set taxInclusive default
      if (item.taxInclusive === undefined) {
        item.taxInclusive = true;
      }
      
      // Set isActive default
      if (item.isActive === undefined) {
        item.isActive = true;
      }

      // Set user and organization
      item.user = req.user.id;
      item.organization = req.user.organization;

      validItems.push(item);
    }

    if (validItems.length === 0) {
      return res.status(400).json({ message: "No valid items to import" });
    }

    console.log(`Found ${validItems.length} valid items to import`);

    try {
      const Item = require("../models/Item");
      
      // Use insertMany for bulk insertion
      const results = await Item.insertMany(validItems, { 
        ordered: false,  // Continue even if some documents fail
        rawResult: false  // Return the inserted documents
      });
      
      console.log(`Successfully imported ${results.length} items`);
      
      res.json({
        message: `Successfully imported ${results.length} items`,
        imported: results.length,
        total: items.length
      });
      
    } catch (error) {
      // Handle partial success in insertMany
      if (error.name === 'BulkWriteError' || error.name === 'MongoBulkWriteError') {
        const successCount = error.result?.insertedCount || 0;
        const errorCount = error.writeErrors ? error.writeErrors.length : 0;
        
        console.log(`Partial success: ${successCount} imported, ${errorCount} failed`);
        
        res.json({
          message: `Imported ${successCount} items, ${errorCount} failed`,
          imported: successCount,
          total: items.length,
          errors: error.writeErrors?.slice(0, 5) // Show first 5 errors only
        });
      } else {
        throw error;
      }
    }
    
  } catch (error) {
    console.error('Bulk import error:', error);
    res.status(500).json({ 
      message: "Failed to import items: " + error.message 
    });
  }
});

module.exports = router;
