const SavedAddress = require('../models/SavedAddress');

const FIELDS = ['title', 'addressLine1', 'addressLine2', 'pincode', 'city', 'state', 'country'];

/*
 * Only one saved address per organization may carry isDefault. Clearing the
 * siblings first keeps that true no matter which path set it.
 */
async function clearOtherDefaults(organization, keepId) {
  await SavedAddress.updateMany(
    {
      organization,
      isDefault: true,
      ...(keepId ? { _id: { $ne: keepId } } : {}),
    },
    { $set: { isDefault: false } }
  );
}

exports.listAddresses = async (req, res) => {
  try {
    const addresses = await SavedAddress.find({ organization: req.user.organization })
      .sort({ isDefault: -1, updatedAt: -1 })
      .lean();
    res.json({ addresses });
  } catch (error) {
    res.status(500).json({ error: `Failed to load saved addresses: ${error.message}` });
  }
};

exports.createAddress = async (req, res) => {
  try {
    const body = req.body || {};

    // The first saved address is the default automatically — otherwise a
    // freshly created set would have nothing to fall back on.
    const existingCount = await SavedAddress.countDocuments({ organization: req.user.organization });
    const shouldDefault = body.isDefault === true || existingCount === 0;

    const doc = { organization: req.user.organization, isDefault: shouldDefault, isActive: body.isActive !== false };
    for (const key of FIELDS) {
      doc[key] = (body[key] || '').toString().trim();
    }

    const address = await SavedAddress.create(doc);

    if (shouldDefault) {
      await clearOtherDefaults(req.user.organization, address._id);
    }

    res.status(201).json({ address });
  } catch (error) {
    res.status(500).json({ error: `Failed to create saved address: ${error.message}` });
  }
};

exports.updateAddress = async (req, res) => {
  try {
    const address = await SavedAddress.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    });
    if (!address) return res.status(404).json({ error: 'Saved address not found' });

    const body = req.body || {};
    for (const key of FIELDS) {
      if (body[key] !== undefined) address[key] = (body[key] || '').toString().trim();
    }
    if (body.isActive !== undefined) address.isActive = !!body.isActive;

    if (body.isDefault === true) {
      // Deactivating and defaulting at once would leave the default unusable.
      address.isActive = true;
      address.isDefault = true;
    } else if (body.isDefault === false) {
      address.isDefault = false;
    }

    await address.save();
    if (address.isDefault) {
      await clearOtherDefaults(req.user.organization, address._id);
    }

    res.json({ address });
  } catch (error) {
    res.status(500).json({ error: `Failed to update saved address: ${error.message}` });
  }
};

exports.deleteAddress = async (req, res) => {
  try {
    const address = await SavedAddress.findOneAndDelete({
      _id: req.params.id,
      organization: req.user.organization,
    });
    if (!address) return res.status(404).json({ error: 'Saved address not found' });

    // Removing the default leaves the set without one; promote the most
    // recently updated active sibling so the group still has a fallback.
    if (address.isDefault) {
      const next = await SavedAddress.findOne({
        organization: req.user.organization,
        isActive: true,
      }).sort({ updatedAt: -1 });
      if (next) {
        next.isDefault = true;
        await next.save();
      }
    }

    res.json({ message: 'Saved address deleted' });
  } catch (error) {
    res.status(500).json({ error: `Failed to delete saved address: ${error.message}` });
  }
};
