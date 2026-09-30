const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth');
const adminMiddleware = require('../middlewares/admin');
const companyFolderController = require('../controllers/companyFolderController');

const requireAuth = [authMiddleware, require('../middlewares/userSync')];
const subscriptionGate = require('../middlewares/subscriptionGate');
const restrictByPlan = require('../middlewares/restrictByPlan');

// Create folder
router.post('/',
  requireAuth,
  subscriptionGate,
  restrictByPlan('folders', 'write'),
  companyFolderController.createFolder
);

// Get all folders for the user's organization
router.get('/',
  requireAuth,
  subscriptionGate,
  restrictByPlan('folders', 'read'),
  companyFolderController.getAllFolders
);

// GET all folders created by the current user
router.get('/my-folders',
  requireAuth,
  subscriptionGate,
  restrictByPlan('folders', 'read'),
  companyFolderController.getMyFolders
);

// GET companies not in any folder (for organization)
router.get('/unassigned/companies',
  requireAuth,
  subscriptionGate,
  restrictByPlan('folders', 'read'),
  companyFolderController.getUnassignedCompanies
);

// Get a single folder
router.get('/:id',
  requireAuth,
  subscriptionGate,
  restrictByPlan('folders', 'read'),
  companyFolderController.getFolderById
);

// Update folder (name or companies)
router.put('/:id',
  requireAuth,
  subscriptionGate,
  restrictByPlan('folders', 'write'),
  companyFolderController.updateFolder
);

// ADD company to folder
router.put('/:id/add-company',
  requireAuth,
  subscriptionGate,
  restrictByPlan('folders', 'write'),
  companyFolderController.addCompanyToFolder
);

// REMOVE company from folder
router.put('/:id/remove-company',
  requireAuth,
  subscriptionGate,
  restrictByPlan('folders', 'write'),
  companyFolderController.removeCompanyFromFolder
);

// REMOVE several companies from folder (bulk)
router.put('/:id/remove-companies',
  requireAuth,
  subscriptionGate,
  restrictByPlan('folders', 'write'),
  companyFolderController.removeCompaniesFromFolder
);

// Delete folder
router.delete('/:id',
  requireAuth,
  subscriptionGate,
  restrictByPlan('folders', 'write'),
  companyFolderController.deleteFolder
);

module.exports = router;
