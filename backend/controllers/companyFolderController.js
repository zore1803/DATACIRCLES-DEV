const CompanyFolder = require('../models/CompanyFolder');
const Company = require('../models/Company');
const { enrichFolders } = require('../utils/companyFolderEnrich');

// Create folder
exports.createFolder = async (req, res) => {
  try {
    const { name, companies = [] } = req.body;
    
    // Validate that all companies belong to the same organization
    if (companies && companies.length > 0) {
      const companyDocs = await Company.find({
        _id: { $in: companies },
        organization: req.user.organization
      });
      
      if (companyDocs.length !== companies.length) {
        return res.status(400).json({ 
          error: 'Some companies do not belong to your organization' 
        });
      }
    }
    
    const folder = new CompanyFolder({ 
      name, 
      companies, 
      user: req.user._id, 
      organization: req.user.organization 
    });
    
    await folder.save();
    res.status(201).json(folder);
  } catch (err) {
    console.log(err);
    res.status(400).json({ error: err.message });
  }
};

// Get all folders for the user's organization
exports.getAllFolders = async (req, res) => {
  try {
    const folders = await CompanyFolder.find({
      organization: req.user.organization
    }).populate({
      path: 'companies',
      match: { organization: req.user.organization }, // Ensure populated companies are from same org
      populate: { path: 'owner', select: 'name email' },
    }).populate('user', 'name email').lean();

    // Attach real contact/deal counts + last activity for the hotlist views.
    await enrichFolders(folders, req.user.organization);
    res.json(folders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET all folders created by the current user
exports.getMyFolders = async (req, res) => {
  try {
    const folders = await CompanyFolder.find({
      user: req.user._id,
      organization: req.user.organization
    }).populate({
      path: 'companies',
      match: { organization: req.user.organization }
    });
    
    res.json(folders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get a single folder
exports.getFolderById = async (req, res) => {
  try {
    const folder = await CompanyFolder.findOne({
      _id: req.params.id,
      organization: req.user.organization
    }).populate({
      path: 'companies',
      match: { organization: req.user.organization },
      populate: { path: 'owner', select: 'name email' },
    }).populate('user', 'name email').lean();

    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    await enrichFolders(folder, req.user.organization);
    res.json(folder);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update folder (name or companies)
exports.updateFolder = async (req, res) => {
  try {
    const { name, companies } = req.body;
    
    // Check if folder exists and belongs to the organization
    const existingFolder = await CompanyFolder.findOne({
      _id: req.params.id,
      organization: req.user.organization
    });
    
    if (!existingFolder) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    
    // Validate that all new companies belong to the same organization
    if (companies && companies.length > 0) {
      const companyDocs = await Company.find({
        _id: { $in: companies },
        organization: req.user.organization
      });
      
      if (companyDocs.length !== companies.length) {
        return res.status(400).json({ 
          error: 'Some companies do not belong to your organization' 
        });
      }
    }
    
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (companies !== undefined) updateData.companies = companies;
    
    const folder = await CompanyFolder.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate({
      path: 'companies',
      match: { organization: req.user.organization }
    });
    
    res.json(folder);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// ADD company to folder
exports.addCompanyToFolder = async (req, res) => {
  try {
    const { companyId } = req.body;
    
    // Verify folder exists and belongs to organization
    const folder = await CompanyFolder.findOne({
      _id: req.params.id,
      organization: req.user.organization
    });
    
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    
    // Verify company exists and belongs to organization
    const company = await Company.findOne({
      _id: companyId,
      organization: req.user.organization
    });
    
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    // Add company if not already in folder
    if (!folder.companies.includes(companyId)) {
      folder.companies.push(companyId);
      await folder.save();
    }
    
    const updatedFolder = await CompanyFolder.findById(folder._id).populate({
      path: 'companies',
      match: { organization: req.user.organization }
    });
    
    res.json(updatedFolder);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// REMOVE company from folder
exports.removeCompanyFromFolder = async (req, res) => {
  try {
    const { companyId } = req.body;
    
    const folder = await CompanyFolder.findOne({
      _id: req.params.id,
      organization: req.user.organization
    });
    
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    
    // Remove company from folder
    folder.companies = folder.companies.filter(
      company => company.toString() !== companyId
    );
    await folder.save();
    
    const updatedFolder = await CompanyFolder.findById(folder._id).populate({
      path: 'companies',
      match: { organization: req.user.organization }
    });
    
    res.json(updatedFolder);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// REMOVE several companies from a folder in one call (bulk-action bar). Only
// takes them off the list — the company records themselves are untouched.
exports.removeCompaniesFromFolder = async (req, res) => {
  try {
    const { companyIds } = req.body;
    if (!Array.isArray(companyIds) || companyIds.length === 0) {
      return res.status(400).json({ error: 'companyIds is required' });
    }
    const folder = await CompanyFolder.findOneAndUpdate(
      { _id: req.params.id, organization: req.user.organization },
      { $pull: { companies: { $in: companyIds } } },
      { new: true }
    )
      .populate({
        path: 'companies',
        match: { organization: req.user.organization },
        populate: { path: 'owner', select: 'name email' },
      })
      .lean();
    if (!folder) return res.status(404).json({ error: 'Folder not found' });
    await enrichFolders(folder, req.user.organization);
    res.json(folder);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Delete folder
exports.deleteFolder = async (req, res) => {
  try {
    const folder = await CompanyFolder.findOne({
      _id: req.params.id,
      organization: req.user.organization
    });
    
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    
    await CompanyFolder.findByIdAndDelete(req.params.id);
    res.json({ message: 'Folder deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET companies not in any folder (for organization)
exports.getUnassignedCompanies = async (req, res) => {
  try {
    // Get all folders for the organization
    const folders = await CompanyFolder.find({
      organization: req.user.organization
    }).select('companies');
    
    // Get all company IDs that are in folders
    const companiesInFolders = folders.reduce((acc, folder) => {
      return acc.concat(folder.companies);
    }, []);
    
    // Get companies not in any folder
    const unassignedCompanies = await Company.find({
      organization: req.user.organization,
      _id: { $nin: companiesInFolders }
    });
    
    res.json(unassignedCompanies);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
