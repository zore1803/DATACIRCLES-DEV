const express = require('express');
const router = express.Router();
const authMiddleware = require("../middlewares/auth");
const adminMiddleware = require("../middlewares/admin");
const uploadMiddlewareS3 = require('../middlewares/uploadMiddlewareS3');
const userSync = require('../middlewares/userSync');
const brandingController = require('../controllers/brandingController');

const requireAuth = [authMiddleware, userSync];
const subscriptionGate = require('../middlewares/subscriptionGate');
const uploadS3 = uploadMiddlewareS3(); // Initialize S3 upload middleware

// GET current branding for logged in user's organization
router.get('/',
  requireAuth,
  subscriptionGate,
  brandingController.getBranding
);

// ✅ NEW: Check if invoice branding is complete
router.get('/invoice-check',
  requireAuth,
  subscriptionGate,
  brandingController.checkInvoiceBrandingStatus
);

// The organization's logo as a data URL (client-side PDF letterheads)
router.get('/logo-data',
  requireAuth,
  subscriptionGate,
  brandingController.getLogoDataUrl
);

// GET branding by organization ID (for admin purposes)
router.get('/organization/:orgId',
  requireAuth,
  subscriptionGate,
  adminMiddleware,
  brandingController.getBrandingByOrganization
);

// POST update branding for organization (with validation)
router.post('/',
  requireAuth,
  subscriptionGate,
  adminMiddleware,
  uploadS3.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'signature', maxCount: 1 }
  ]),
  brandingController.createOrUpdateBranding
);

// ✅ NEW: POST partial branding update (no validation, for invoice flow)
router.post('/partial',
  requireAuth,
  subscriptionGate,
  uploadS3.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'signature', maxCount: 1 }
  ]),
  brandingController.createOrUpdatePartialBranding
);

// PUT update specific branding by ID (admin only)
router.put('/:id',
  requireAuth,
  subscriptionGate,
  adminMiddleware,
  uploadS3.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'signature', maxCount: 1 }
  ]),
  brandingController.updateBrandingById
);

// DELETE branding (admin only)
router.delete('/:id',
  requireAuth,
  subscriptionGate,
  adminMiddleware,
  brandingController.deleteBranding
);

module.exports = router;