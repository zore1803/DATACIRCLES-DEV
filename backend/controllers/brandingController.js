const Branding = require('../models/Branding');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Helper function to delete file from S3
async function deleteFileFromS3(key) {
  if (!key) return;
  
  const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
  const { S3Client } = require('@aws-sdk/client-s3');
  
  const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  });

  try {
    await s3.send(new DeleteObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key
    }));
    console.log(`Deleted file from S3: ${key}`);
  } catch (error) {
    console.error('Error deleting file from S3:', error);
    // Don't fail the request if deletion fails
  }
}

// Helper function to extract S3 key from URL
function extractS3KeyFromUrl(url) {
  if (!url) return null;
  
  // If CloudFront URL: https://d123.cloudfront.net/org-xxx/logo-xxx.png
  if (url.includes(process.env.CLOUDFRONT_DOMAIN)) {
    return url.split(`${process.env.CLOUDFRONT_DOMAIN}/`)[1];
  }
  
  // If direct S3 URL: https://bucket.s3.region.amazonaws.com/key
  if (url.includes('.s3.')) {
    const urlParts = new URL(url);
    return urlParts.pathname.substring(1); // Remove leading /
  }
  
  return null;
}

// ---- Logo as a data URL, for client-side PDF letterheads ---------------------------------------
// The logo lives on CloudFront (a different origin from the app), and a browser can't turn a
// cross-origin image into bytes for jsPDF without CORS headers on that CDN. So the server reads it
// and hands it over as a data URL, the same way the server-side invoice PDFs already load it.
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_TYPES = ['image/png', 'image/jpeg']; // the formats jsPDF can embed

// Only fetch from this deployment's own storage hosts. The URL comes from the organization's saved
// branding, never from the request, but the allow-list keeps this from ever being turned into a
// fetch-anything proxy.
function isOwnStorageHost(hostname) {
  const cdn = (process.env.CLOUDFRONT_DOMAIN || '').toLowerCase().replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
  const host = hostname.toLowerCase();
  return (cdn && host === cdn) || host.endsWith('.amazonaws.com');
}

function sniffImageType(buffer) {
  if (buffer.length > 8 && buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  return null;
}

async function readLogoBytes(logoUrl) {
  if (/^https?:\/\//i.test(logoUrl)) {
    if (!isOwnStorageHost(new URL(logoUrl).hostname)) return null;
    const response = await axios.get(logoUrl, {
      responseType: 'arraybuffer',
      timeout: 8000,
      maxContentLength: LOGO_MAX_BYTES,
      maxBodyLength: LOGO_MAX_BYTES,
    });
    return Buffer.from(response.data);
  }
  // Older logos were stored on this server under /uploads.
  if (logoUrl.startsWith('/uploads/')) {
    const root = path.resolve('uploads');
    const file = path.resolve(root, '.' + logoUrl.slice('/uploads'.length));
    if (!file.startsWith(root + path.sep)) return null; // no path traversal out of /uploads
    const stat = await fs.promises.stat(file);
    if (stat.size > LOGO_MAX_BYTES) return null;
    return fs.promises.readFile(file);
  }
  return null;
}

// GET /api/branding/logo-data -> { dataUrl } (null when there is no usable logo)
exports.getLogoDataUrl = async (req, res) => {
  try {
    const branding = await Branding.findOne({ organization: req.user.organization })
      .sort({ updatedAt: -1 })
      .select('logoUrl');
    if (!branding?.logoUrl) return res.json({ dataUrl: null });

    const bytes = await readLogoBytes(branding.logoUrl);
    const type = bytes && bytes.length <= LOGO_MAX_BYTES ? sniffImageType(bytes) : null;
    if (!type || !LOGO_TYPES.includes(type)) return res.json({ dataUrl: null });

    res.json({ dataUrl: `data:${type};base64,${bytes.toString('base64')}` });
  } catch (error) {
    // A missing logo must never stop a report from exporting: answer "no logo".
    console.error('Logo data lookup failed:', error.message);
    res.json({ dataUrl: null });
  }
};

// GET current branding for logged in user's organization
exports.getBranding = async (req, res) => {
  try {
    const branding = await Branding.findOne({ 
      organization: req.user.organization 
    }).sort({ updatedAt: -1 });
    
    res.json(branding);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET branding by organization ID (for admin purposes)
exports.getBrandingByOrganization = async (req, res) => {
  try {
    const branding = await Branding.findOne({ 
      organization: req.params.orgId 
    }).sort({ updatedAt: -1 });
    
    if (!branding) {
      return res.status(404).json({ error: 'Branding not found for this organization' });
    }
    
    res.json(branding);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST update branding for organization
exports.createOrUpdateBranding = async (req, res) => {
  try {
    const { companyName, companyType, gstin, address, state, email, mobile, alternateContact, panNumber, website, colors } = req.body;
    const logoFile = req.files && req.files['logo'] && req.files['logo'][0];
    const signatureFile = req.files && req.files['signature'] && req.files['signature'][0];

    const logoUrlFile = logoFile ? `https://${process.env.CLOUDFRONT_DOMAIN}/${logoFile.key}` : undefined;
    const signatureUrlFile = signatureFile ? `https://${process.env.CLOUDFRONT_DOMAIN}/${signatureFile.key}` : undefined;

    // Validate required fields — GSTIN is optional (not every business is
    // GST-registered), matching the frontend's own validation. `address` is
    // no longer collected from Settings (billing/shipping addresses are
    // managed via the shared SavedAddress book instead) so it's no longer
    // required here either.
    if (!companyName || !email || !mobile || !colors) {
      return res.status(400).json({ error: 'Company name, email, mobile, and colors are required' });
    }

    // Validate GSTIN format only if provided
    if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin)) {
      return res.status(400).json({ error: 'Invalid GSTIN format (e.g., 22AAAAA0000A1Z5)' });
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate mobile format
    if (!/^[0-9]{10}$/.test(mobile)) {
      return res.status(400).json({ error: 'Mobile number must be 10 digits' });
    }

    // Alternate contact is optional, but must be a valid 10-digit number if given
    if (alternateContact && !/^[0-9]{10}$/.test(alternateContact)) {
      return res.status(400).json({ error: 'Alternative contact number must be 10 digits' });
    }

    // PAN is optional, but must match the standard format if given
    if (panNumber && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panNumber)) {
      return res.status(400).json({ error: 'Invalid PAN format (e.g., AAAAA0000A)' });
    }

    let branding = await Branding.findOne({
      organization: req.user.organization
    });

    if (!branding) {
      branding = new Branding({
        organization: req.user.organization
      });
    }

    // Delete old logo if new one is uploaded
    if (logoUrlFile && branding.logoUrl) {
      const oldLogoKey = extractS3KeyFromUrl(branding.logoUrl);
      if (oldLogoKey) {
        await deleteFileFromS3(oldLogoKey);
      }
    }

    // Delete old signature if new one is uploaded
    if (signatureUrlFile && branding.signatureUrl) {
      const oldSignatureKey = extractS3KeyFromUrl(branding.signatureUrl);
      if (oldSignatureKey) {
        await deleteFileFromS3(oldSignatureKey);
      }
    }

    branding.companyName = companyName;
    branding.companyType = companyType || '';
    branding.gstin = gstin;
    // `address` is no longer sent by the form — only overwrite it if a
    // caller explicitly provides one (e.g. an older client), never wipe a
    // previously saved value just because this request omitted it.
    if (address !== undefined) branding.address = address;
    branding.state = state || '';
    branding.email = email;
    branding.mobile = mobile;
    branding.alternateContact = alternateContact || '';
    branding.panNumber = panNumber ? panNumber.toUpperCase() : '';
    branding.website = website || '';
    branding.colors = JSON.parse(colors);

    // Set logo URL from CloudFront
    if (logoUrlFile) {
      branding.logoUrl = logoUrlFile;
    }

    // Set signature URL from CloudFront
    if (signatureUrlFile) {
      branding.signatureUrl = signatureUrlFile;
    }

    await branding.save();

    res.json({ 
      message: 'Branding updated successfully', 
      branding 
    });
  } catch (err) {
    console.error('❌ Branding update error:', err);
    res.status(400).json({ error: err.message });
  }
};

// PUT update specific branding by ID (admin only)
exports.updateBrandingById = async (req, res) => {
  try {
    const { companyName, gstin, address, state, email, mobile, colors } = req.body;
    const logoFile = req.files && req.files['logo'] && req.files['logo'][0];
    const signatureFile = req.files && req.files['signature'] && req.files['signature'][0];

    const logoUrlFile = logoFile ? `https://${process.env.CLOUDFRONT_DOMAIN}/${logoFile.key}` : undefined;
    const signatureUrlFile = signatureFile ? `https://${process.env.CLOUDFRONT_DOMAIN}/${signatureFile.key}` : undefined;

    // Validate required fields — GSTIN is optional (not every business is
    // GST-registered), matching the frontend's own validation.
    if (!companyName || !address || !email || !mobile || !colors) {
      return res.status(400).json({ error: 'Company name, address, email, mobile, and colors are required' });
    }

    // Validate GSTIN format only if provided
    if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin)) {
      return res.status(400).json({ error: 'Invalid GSTIN format (e.g., 22AAAAA0000A1Z5)' });
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate mobile format
    if (!/^[0-9]{10}$/.test(mobile)) {
      return res.status(400).json({ error: 'Mobile number must be 10 digits' });
    }

    const existingBranding = await Branding.findOne({
      _id: req.params.id,
      organization: req.user.organization
    });

    if (!existingBranding) {
      return res.status(404).json({ error: 'Branding not found or access denied' });
    }

    // Delete old logo if new one is uploaded
    if (logoUrlFile && existingBranding.logoUrl) {
      const oldLogoKey = extractS3KeyFromUrl(existingBranding.logoUrl);
      if (oldLogoKey) {
        await deleteFileFromS3(oldLogoKey);
      }
    }

    // Delete old signature if new one is uploaded
    if (signatureUrlFile && existingBranding.signatureUrl) {
      const oldSignatureKey = extractS3KeyFromUrl(existingBranding.signatureUrl);
      if (oldSignatureKey) {
        await deleteFileFromS3(oldSignatureKey);
      }
    }

    const updateData = {
      companyName,
      gstin,
      address,
      state: state || '',
      email,
      mobile,
      colors: JSON.parse(colors)
    };

    // Set logo URL from CloudFront
    if (logoUrlFile) {
      updateData.logoUrl = logoUrlFile;
    }

    // Set signature URL from CloudFront
    if (signatureUrlFile) {
      updateData.signatureUrl = signatureUrlFile;
    }

    const branding = await Branding.findOneAndUpdate(
      { 
        _id: req.params.id,
        organization: req.user.organization 
      },
      updateData,
      { new: true, runValidators: true }
    );

    res.json({ 
      message: 'Branding updated successfully', 
      branding 
    });
  } catch (err) {
    console.error('❌ Branding update error:', err);
    res.status(400).json({ error: err.message });
  }
};

// DELETE branding (admin only)
exports.deleteBranding = async (req, res) => {
  try {
    const branding = await Branding.findOne({ 
      _id: req.params.id,
      organization: req.user.organization 
    });

    if (!branding) {
      return res.status(404).json({ error: 'Branding not found or access denied' });
    }

    // Delete logo and signature files from S3
    if (branding.logoUrl) {
      const logoKey = extractS3KeyFromUrl(branding.logoUrl);
      if (logoKey) {
        await deleteFileFromS3(logoKey);
      }
    }

    if (branding.signatureUrl) {
      const signatureKey = extractS3KeyFromUrl(branding.signatureUrl);
      if (signatureKey) {
        await deleteFileFromS3(signatureKey);
      }
    }

    await Branding.findOneAndDelete({
      _id: req.params.id,
      organization: req.user.organization
    });

    res.json({ message: 'Branding deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Check if required invoice branding details are complete
exports.checkInvoiceBrandingStatus = async (req, res) => {
  try {
    const branding = await Branding.findOne({ 
      organization: req.user.organization 
    }).sort({ updatedAt: -1 });
    
    if (!branding) {
      return res.json({
        isComplete: false,
        missingFields: ['companyName', 'gstin', 'address', 'email', 'mobile', 'logoUrl', 'signatureUrl'],
        branding: null
      });
    }

    // Check required fields for invoice
    const missingFields = [];
    if (!branding.companyName) missingFields.push('companyName');
    if (!branding.gstin) missingFields.push('gstin');
    if (!branding.address) missingFields.push('address');
    if (!branding.email) missingFields.push('email');
    if (!branding.mobile) missingFields.push('mobile');
    if (!branding.logoUrl) missingFields.push('logoUrl');
    if (!branding.signatureUrl) missingFields.push('signatureUrl');

    res.json({
      isComplete: missingFields.length === 0,
      missingFields,
      branding
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Create or update partial branding (no validation)
exports.createOrUpdatePartialBranding = async (req, res) => {
  try {
    const { companyName, gstin, address, state, email, mobile, colors } = req.body;
    const logoFile = req.files && req.files['logo'] && req.files['logo'][0];
    const signatureFile = req.files && req.files['signature'] && req.files['signature'][0];

    const logoUrlFile = logoFile ? `https://${process.env.CLOUDFRONT_DOMAIN}/${logoFile.key}` : undefined;
    const signatureUrlFile = signatureFile ? `https://${process.env.CLOUDFRONT_DOMAIN}/${signatureFile.key}` : undefined;

    let branding = await Branding.findOne({
      organization: req.user.organization
    });

    if (!branding) {
      branding = new Branding({
        organization: req.user.organization
      });
    }

    // Delete old logo if new one is uploaded
    if (logoUrlFile && branding.logoUrl) {
      const oldLogoKey = extractS3KeyFromUrl(branding.logoUrl);
      if (oldLogoKey) {
        await deleteFileFromS3(oldLogoKey);
      }
    }

    // Delete old signature if new one is uploaded
    if (signatureUrlFile && branding.signatureUrl) {
      const oldSignatureKey = extractS3KeyFromUrl(branding.signatureUrl);
      if (oldSignatureKey) {
        await deleteFileFromS3(oldSignatureKey);
      }
    }

    // Update only provided fields (no validation)
    if (companyName !== undefined) branding.companyName = companyName;
    if (gstin !== undefined) branding.gstin = gstin;
    if (address !== undefined) branding.address = address;
    if (state !== undefined) branding.state = state;
    if (email !== undefined) branding.email = email;
    if (mobile !== undefined) branding.mobile = mobile;
    if (colors !== undefined) branding.colors = JSON.parse(colors);

    // Set logo URL from CloudFront
    if (logoUrlFile) {
      branding.logoUrl = logoUrlFile;
    }

    // Set signature URL from CloudFront
    if (signatureUrlFile) {
      branding.signatureUrl = signatureUrlFile;
    }

    await branding.save();

    res.json({ 
      message: 'Branding updated successfully', 
      branding 
    });
  } catch (err) {
    console.error('❌ Branding partial update error:', err);
    res.status(400).json({ error: err.message });
  }
};