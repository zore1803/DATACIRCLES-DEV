// controllers/folderController.js
const Folder = require('../models/Folder');
const Company = require('../models/Company');
const Deal = require('../models/Deal');
const StorageUsage = require('../models/StorageUsage');
const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// Helper function to delete file from S3
const deleteFromS3 = async (fileUrl) => {
  try {
    const url = new URL(fileUrl);
    const key = url.pathname.substring(1);

    await s3Client.send(new DeleteObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key
    }));

    console.log(`Deleted from S3: ${key}`);
    return true;
  } catch (error) {
    console.error('S3 deletion error:', error);
    return false;
  }
};

// The Folder model has no `organization` field of its own — it only stores
// `company`/`user`. Every folder's `company` is required and DOES have an
// organization, so cross-tenant access is blocked by fetching the folder
// with its company populated and checking that company's organization
// matches the caller's, instead of trusting the folder ID alone.
// A deal folder is owned the same way, through its deal's organization.
const getOwnedFolder = async (folderId, organizationId) => {
  const folder = await Folder.findById(folderId).populate('company deal');
  if (!folder) return null;
  const owner = folder.deal || folder.company;
  if (!owner || owner.organization?.toString() !== organizationId?.toString()) {
    return null;
  }
  return folder;
};

// Names are unique within their own scope: one deal, or one company's own
// (non-deal) folders.
const scopeFilter = (folder) =>
  folder.deal
    ? { deal: folder.deal._id || folder.deal }
    : { company: folder.company._id || folder.company, deal: null };

const nameRegex = (name) => ({
  $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
  $options: 'i',
});

// Create folder (for a company, or for a deal when `deal` is sent)
exports.createFolder = async (req, res) => {
  try {
    const { name, company, deal } = req.body;
    const trimmedName = (name || "").trim();

    let scope;
    if (deal) {
      const dealDoc = await Deal.findOne({
        _id: deal,
        organization: req.user.organization,
      });
      if (!dealDoc) {
        return res.status(404).json({ error: 'Deal not found' });
      }
      scope = { deal: dealDoc._id, ...(dealDoc.company ? { company: dealDoc.company } : {}) };
    } else {
      const companyDoc = await Company.findOne({
        _id: company,
        organization: req.user.organization,
      });
      if (!companyDoc) {
        return res.status(404).json({ error: 'Company not found' });
      }
      scope = { company: companyDoc._id, deal: null };
    }

    const existing = await Folder.findOne({
      ...(deal ? { deal: scope.deal } : { company: scope.company, deal: null }),
      name: nameRegex(trimmedName),
    });
    if (existing) {
      return res.status(409).json({ error: `A folder named "${trimmedName}" already exists` });
    }
    await Folder.create({ name: trimmedName, ...scope, user: req.user._id });
    res.json({
      message: "folder created successfully"
    });
  } catch (err) {
    res.status(400).json({ error: 'Failed to create folder' });
  }
};

// NEW: Add hyperlink to folder
exports.addLink = async (req, res) => {
  try {
    const { folderId, fileName, fileUrl } = req.body;

    if (!fileName || !fileUrl) {
      return res.status(400).json({ error: 'fileName and fileUrl are required' });
    }

    // Validate URL format
    try {
      new URL(fileUrl);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    const owned = await getOwnedFolder(folderId, req.user.organization);
    if (!owned) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    const linkFile = {
      fileName,
      fileUrl,
      isLink: true,
      fileType: 'link',
      uploadedAt: new Date()
    };

    const updatedFolder = await Folder.findByIdAndUpdate(
      folderId,
      { $push: { files: linkFile } },
      { new: true }
    );

    res.status(200).json({ message: 'Link added successfully', folder: updatedFolder });
  } catch (err) {
    console.error('Add link error:', err);
    res.status(500).json({ error: 'Failed to add link' });
  }
};

// NEW: Update hyperlink in folder
exports.updateLink = async (req, res) => {
  try {
    const { folderId, fileId } = req.params;
    const { fileName, fileUrl } = req.body;

    if (!fileName || !fileUrl) {
      return res.status(400).json({ error: 'fileName and fileUrl are required' });
    }

    try {
      new URL(fileUrl);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    const folder = await getOwnedFolder(folderId, req.user.organization);
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    const file = folder.files.id(fileId) || folder.files[Number(fileId)];
    if (!file) {
      return res.status(404).json({ error: 'Link not found' });
    }

    file.fileName = fileName;
    file.fileUrl = fileUrl;

    await folder.save();
    res.status(200).json({ message: 'Link updated successfully', folder });
  } catch (error) {
    console.error('Update link error:', error);
    res.status(500).json({ error: 'Failed to update link' });
  }
};

// Rename an uploaded file without changing its S3 object or URL.
exports.renameFile = async (req, res) => {
  try {
    const { folderId, fileId } = req.params;
    const fileName = (req.body.fileName || '').trim();

    if (!fileName) {
      return res.status(400).json({ error: 'fileName is required' });
    }

    const folder = await getOwnedFolder(folderId, req.user.organization);
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    const file = folder.files.id(fileId) || folder.files[Number(fileId)];
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (file.isLink) {
      return res.status(400).json({ error: 'Use the link update endpoint for URL entries' });
    }

    file.fileName = fileName;
    await folder.save();

    res.status(200).json({ message: 'File renamed successfully', folder });
  } catch (error) {
    console.error('Rename file error:', error);
    res.status(500).json({ error: 'Failed to rename file' });
  }
};



// GET all folders (optionally by company) — always scoped to the caller's org
exports.getAllFolders = async (req, res) => {
  try {
    const { companyId, dealId } = req.query;

    // One deal: only that deal's own folders.
    if (dealId) {
      const dealDoc = await Deal.findOne({
        _id: dealId,
        organization: req.user.organization,
      });
      if (!dealDoc) {
        return res.status(404).json({ error: 'Deal not found' });
      }
      // `deal` stays an id here: the UI only labels a folder with its deal in
      // the company view, where folders of different deals are mixed.
      const folders = await Folder.find({ deal: dealId }).populate('company user');
      return res.json(folders);
    }

    // One company: its own folders plus the folders of all its deals.
    if (companyId) {
      const companyDoc = await Company.findOne({
        _id: companyId,
        organization: req.user.organization,
      });
      if (!companyDoc) {
        return res.status(404).json({ error: 'Company not found' });
      }
      const folders = await Folder.find({ company: companyId }).populate('company user').populate('deal', 'title name');
      return res.json(folders);
    }

    const [orgCompanyIds, orgDealIds] = await Promise.all([
      Company.find({ organization: req.user.organization }).distinct('_id'),
      Deal.find({ organization: req.user.organization }).distinct('_id'),
    ]);
    const folders = await Folder.find({
      $or: [{ company: { $in: orgCompanyIds } }, { deal: { $in: orgDealIds } }],
    }).populate('company user').populate('deal', 'title name');
    res.json(folders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch folders' });
  }
};

// GET single folder
exports.getFolderById = async (req, res) => {
  try {
    const folder = await getOwnedFolder(req.params.id, req.user.organization);
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    await folder.populate('user');
    res.json(folder);
  } catch (err) {
    res.status(404).json({ error: 'Folder not found' });
  }
};

// UPDATE folder (e.g., name or files)
exports.updateFolder = async (req, res) => {
  try {
    const current = await getOwnedFolder(req.params.id, req.user.organization);
    if (!current) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    if (req.body.name != null) {
      const trimmedName = req.body.name.trim();
      const existing = await Folder.findOne({
        _id: { $ne: req.params.id },
        ...scopeFilter(current),
        name: nameRegex(trimmedName),
      });
      if (existing) {
        return res.status(409).json({ error: `A folder named "${trimmedName}" already exists` });
      }
      req.body.name = trimmedName;
    }
    // company/deal are org-derived and must not be reassignable via this endpoint
    delete req.body.company;
    delete req.body.deal;
    const updated = await Folder.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update folder' });
  }
};

// Helper function to get file size from S3
const getFileSizeFromUrl = async (fileUrl) => {
  try {
    const response = await fetch(fileUrl, { method: 'HEAD' });
    const contentLength = response.headers.get('content-length');
    return parseInt(contentLength) || 0;
  } catch (error) {
    console.error('Error getting file size:', error);
    return 0;
  }
};

// Upload files with storage tracking
exports.uploadFiles = async (req, res) => {
  try {
    const { folderId } = req.body;

    const owned = await getOwnedFolder(folderId, req.user.organization);
    if (!owned) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    const files = req.files.map(file => ({
      fileName: file.originalname,
      fileType: file.mimetype,
      fileUrl: `https://${process.env.CLOUDFRONT_DOMAIN}/${file.key}`,
      fileSize: file.size,
      isLink: false,
      uploadedAt: new Date()
    }));

    const uploadedSize = req.uploadSize ?? files.reduce((sum, f) => sum + (f.fileSize || 0), 0);

    const updatedFolder = await Folder.findByIdAndUpdate(
      folderId,
      { $push: { files: { $each: files } } },
      { new: true }
    );

    // Update storage usage
    await StorageUsage.findOneAndUpdate(
      { organization: req.user.organization },
      {
        $inc: { currentUsage: uploadedSize },
        lastUpdated: new Date()
      }
    );

    const storageInfo = await StorageUsage.findOne({
      organization: req.user.organization
    });

    res.status(200).json({
      message: 'Files uploaded successfully',
      folder: updatedFolder,
      storage: {
        currentUsage: `${(storageInfo.currentUsage / (1024 * 1024 * 1024)).toFixed(2)} GB`,
        storageLimit: `${(storageInfo.storageLimit / (1024 * 1024 * 1024)).toFixed(2)} GB`,
        usagePercentage: storageInfo.getUsagePercentage()
      }
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'File upload failed' });
  }
};

// Delete file with S3 cleanup and storage reduction
exports.deleteFile = async (req, res) => {
  try {
    const { id } = req.params;
    const { fileName, fileUrl, isLink } = req.body;

    const folder = await getOwnedFolder(id, req.user.organization);
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    const fileToDelete = folder.files.find(
      f => f.fileName === fileName && f.fileUrl === fileUrl
    );

    if (!fileToDelete) {
      return res.status(404).json({ error: 'File not found' });
    }

    let fileSize = fileToDelete.fileSize || 0;

    // Delete from S3 if not a link
    if (!isLink && !fileToDelete.isLink) {
      await deleteFromS3(fileUrl);
    }

    // Remove from folder
    const updatedFolder = await Folder.findByIdAndUpdate(
      id,
      { $pull: { files: { fileName, fileUrl } } },
      { new: true }
    );

    // Reduce storage usage (ensure it never goes negative)
    if (fileSize > 0) {
      const storageUsage = await StorageUsage.findOne({
        organization: req.user.organization,
        user: req.user._id
      });

      if (storageUsage) {
        // Calculate new usage, ensure it's not negative
        const newUsage = Math.max(0, (storageUsage.currentUsage || 0) - fileSize);

        await StorageUsage.findOneAndUpdate(
          { organization: req.user.organization, user: req.user._id },
          {
            currentUsage: newUsage,
            lastUpdated: new Date()
          }
        );

        console.log(`📉 Storage reduced: ${fileSize} bytes. New usage: ${newUsage} bytes`);
      }
    }

    res.json({
      message: 'File deleted successfully',
      folder: updatedFolder
    });
  } catch (err) {
    console.error('Delete file error:', err);
    res.status(500).json({ error: 'Failed to delete file' });
  }
};

// Delete entire folder with S3 cleanup
exports.deleteFolder = async (req, res) => {
  try {
    const folder = await getOwnedFolder(req.params.id, req.user.organization);
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    let totalSize = 0;

    // Delete all files from S3
    for (const file of folder.files) {
      if (!file.isLink) {
        totalSize += file.fileSize || 0;
        await deleteFromS3(file.fileUrl);
      }
    }

    await Folder.findByIdAndDelete(req.params.id);

    // Reduce storage (ensure it never goes negative)
    if (totalSize > 0) {
      const storageUsage = await StorageUsage.findOne({
        organization: req.user.organization,
        user: req.user._id
      });

      if (storageUsage) {
        // Calculate new usage, ensure it's not negative
        const newUsage = Math.max(0, (storageUsage.currentUsage || 0) - totalSize);

        await StorageUsage.findOneAndUpdate(
          { organization: req.user.organization, user: req.user._id },
          {
            currentUsage: newUsage,
            lastUpdated: new Date()
          }
        );

        console.log(`📉 Folder storage reduced: ${totalSize} bytes. New usage: ${newUsage} bytes`);
      }
    }

    res.json({ message: 'Folder deleted successfully' });
  } catch (err) {
    console.error('Delete folder error:', err);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
};

// Org-wide storage consumption — sums every user's StorageUsage record
// under the organization, for the Data Administration settings card.
exports.getOrgStorageInfo = async (req, res) => {
  try {
    const [agg] = await StorageUsage.aggregate([
      { $match: { organization: req.user.organization } },
      {
        $group: {
          _id: null,
          currentUsage: { $sum: "$currentUsage" },
          storageLimit: { $sum: "$storageLimit" },
        },
      },
    ]);

    const currentUsage = agg?.currentUsage || 0;
    const storageLimit = agg?.storageLimit || 0;
    const remainingSpace = Math.max(0, storageLimit - currentUsage);
    const usagePercentage = storageLimit > 0 ? ((currentUsage / storageLimit) * 100).toFixed(2) : "0.00";
    const toGB = (bytes) => (bytes / (1024 * 1024 * 1024)).toFixed(2);

    res.json({
      currentUsage,
      storageLimit,
      remainingSpace,
      usagePercentage,
      currentUsageFormatted: `${toGB(currentUsage)} GB`,
      storageLimitFormatted: `${toGB(storageLimit)} GB`,
      remainingSpaceFormatted: `${toGB(remainingSpace)} GB`,
    });
  } catch (err) {
    console.error("Get org storage info error:", err);
    res.status(500).json({ error: "Failed to get organization storage info" });
  }
};

// Get storage usage info
exports.getStorageInfo = async (req, res) => {
  try {
    const storageInfo = await StorageUsage.findOne({
      user: req.user._id,
      organization: req.user.organization,
    });

    if (!storageInfo) {
      return res.status(404).json({ error: 'Storage info not found' });
    }

    res.json({
      currentUsage: storageInfo.currentUsage,
      storageLimit: storageInfo.storageLimit,
      remainingSpace: storageInfo.getRemainingSpace(),
      usagePercentage: storageInfo.getUsagePercentage(),
      plan: storageInfo.plan,
      // Human-readable formats
      currentUsageFormatted: `${(storageInfo.currentUsage / (1024 * 1024 * 1024)).toFixed(2)} GB`,
      storageLimitFormatted: `${(storageInfo.storageLimit / (1024 * 1024 * 1024)).toFixed(2)} GB`,
      remainingSpaceFormatted: `${(storageInfo.getRemainingSpace() / (1024 * 1024 * 1024)).toFixed(2)} GB`
    });
  } catch (err) {
    console.error('Get storage info error:', err);
    res.status(500).json({ error: 'Failed to get storage info' });
  }
};
