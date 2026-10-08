const ItemFields = require('../models/ItemFields');
const { checkCustomFieldLimit } = require('../middlewares/customFieldRestriction');

const { sanitizeFieldsConfigBody } = require("../utils/safeBody");
const validateFields = (fields) => {
  const allowedTypes = ['string', 'number', 'dropdown', 'text', 'url', 'date', 'multiselect'];

  for (const field of fields) {
    if (!field.name || !field.type) {
      throw new Error('Field name and type are required');
    }

    if (!allowedTypes.includes(field.type)) {
      throw new Error(`Invalid field type: ${field.type}. Allowed types: ${allowedTypes.join(', ')}`);
    }

    // Validate dropdown and multiselect fields have options
    if ((field.type === 'dropdown' || field.type === 'multiselect') &&
        (!field.options || field.options.length === 0)) {
      throw new Error(`${field.type} field "${field.name}" must have at least one option`);
    }

    // URL fields don't need options
    if (field.type === 'url' && field.options && field.options.length > 0) {
      throw new Error(`URL field "${field.name}" should not have options`);
    }

    // Date fields don't need options
    if (field.type === 'date' && field.options && field.options.length > 0) {
      throw new Error(`Date field "${field.name}" should not have options`);
    }

    if (field.category && typeof field.category !== 'string') {
      throw new Error(`Category for field "${field.name}" must be a text string`);
    }
  }
};

const validateCategories = (categories) => {
  if (categories && !Array.isArray(categories)) {
    throw new Error('Field categories must be an array of strings');
  }
};

exports.createItemFields = async (req, res) => {
  try {
    // Tenant/identity keys and client-supplied createdBy are never trusted.
    req.body = sanitizeFieldsConfigBody(req.body, req.user._id);
    validateCategories(req.body.fieldCategories);

    if (req.body.fields && Array.isArray(req.body.fields)) {
      validateFields(req.body.fields);

      req.body.fields = req.body.fields.map(field => ({
        ...field,
        category: field.category || 'Uncategorized',
        createdBy: field.createdBy || req.user._id
      }));

      const limitCheck = await checkCustomFieldLimit(
        'itemFields',
        req.body.fields,
        req.user._id,
        req.user.organization
      );

      if (!limitCheck.allowed) {
        return res.status(403).json({
          error: limitCheck.error,
          currentCount: limitCheck.currentCount,
          limit: limitCheck.limit
        });
      }
    }

    const itemFieldsData = {
      ...req.body,
      user: req.user.id,
      organization: req.user.organization
    };

    const itemFields = new ItemFields(itemFieldsData);
    await itemFields.save();
    await itemFields.populate('user', 'name email');

    res.status(201).json(itemFields);
  } catch (err) {
    res.status(400).json({ error: 'Failed to create item fields: ' + err.message });
  }
};

exports.getItemFields = async (req, res) => {
  try {
    const itemFields = await ItemFields.findOne({
      user: req.user.id,
      organization: req.user.organization
    }).populate('user', 'name email');

    res.status(200).json(itemFields || { fields: [], fieldCategories: [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch item fields: ' + err.message });
  }
};

exports.getLatestItemFields = async (req, res) => {
  try {
    const itemFields = await ItemFields.findOne({
      organization: req.user.organization
    })
      .populate('user', 'name email')
      .sort({ updatedAt: -1 });

    res.status(200).json(itemFields || { fields: [], fieldCategories: [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch latest item fields: ' + err.message });
  }
};

exports.getAllItemFields = async (req, res) => {
  try {
    const itemFields = await ItemFields.find({
      organization: req.user.organization
    })
      .populate('user', 'name email')
      .sort({ updatedAt: -1 });

    res.status(200).json(itemFields);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch all item fields: ' + err.message });
  }
};

exports.getItemFieldsById = async (req, res) => {
  try {
    const itemFields = await ItemFields.findOne({
      _id: req.params.id,
      organization: req.user.organization
    }).populate('user', 'name email');

    if (!itemFields) {
      return res.status(404).json({ error: 'Item fields not found' });
    }

    res.status(200).json(itemFields);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch item fields: ' + err.message });
  }
};

exports.updateItemFields = async (req, res) => {
  try {
    // Tenant/identity keys and client-supplied createdBy are never trusted.
    req.body = sanitizeFieldsConfigBody(req.body, req.user._id);
    validateCategories(req.body.fieldCategories);

    if (req.body.fields && Array.isArray(req.body.fields)) {
      validateFields(req.body.fields);

      const existingDoc = await ItemFields.findOne({
        user: req.user.id,
        organization: req.user.organization
      });

      if (existingDoc) {
        // Identify NEW fields only
        const existingFieldIds = existingDoc.fields.map(f => f._id?.toString()).filter(Boolean);
        const newFields = req.body.fields.filter(field => {
          return !field._id || !existingFieldIds.includes(field._id.toString());
        }).map(field => ({
          ...field,
          category: field.category || 'Uncategorized',
          createdBy: field.createdBy || req.user._id
        }));

        // Only check limit for NEW fields
        if (newFields.length > 0) {
          const limitCheck = await checkCustomFieldLimit(
            'itemFields',
            newFields,
            req.user._id,
            req.user.organization
          );

          if (!limitCheck.allowed) {
            return res.status(403).json({
              error: limitCheck.error,
              currentCount: limitCheck.currentCount,
              limit: limitCheck.limit
            });
          }
        }

        // Preserve createdBy for existing fields, set for new fields
        req.body.fields = req.body.fields.map(field => {
          if (field._id) {
            const existing = existingDoc.fields.find(f => f._id?.toString() === field._id.toString());
            return { ...field, createdBy: existing?.createdBy || req.user._id };
          }
          return { ...field, createdBy: req.user._id };
        });
      }
    }

    const itemFields = await ItemFields.findOneAndUpdate(
      {
        user: req.user.id,
        organization: req.user.organization
      },
      req.body,
      { new: true, upsert: true, runValidators: true }
    ).populate('user', 'name email');

    res.status(200).json(itemFields);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update item fields: ' + err.message });
  }
};

exports.updateItemFieldsById = async (req, res) => {
  try {
    // Tenant/identity keys and client-supplied createdBy are never trusted.
    req.body = sanitizeFieldsConfigBody(req.body, req.user._id);
    validateCategories(req.body.fieldCategories);

    if (req.body.fields && Array.isArray(req.body.fields)) {
      validateFields(req.body.fields);

      const existingDoc = await ItemFields.findOne({
        _id: req.params.id,
        organization: req.user.organization
      });

      if (!existingDoc) {
        return res.status(404).json({ error: 'Item fields not found' });
      }

      const existingFieldIds = existingDoc.fields.map(f => f._id?.toString()).filter(Boolean);
      const newFields = req.body.fields.filter(field => {
        return !field._id || !existingFieldIds.includes(field._id.toString());
      }).map(field => ({
        ...field,
        category: field.category || 'Uncategorized',
        createdBy: field.createdBy || req.user._id
      }));

      if (newFields.length > 0) {
        const limitCheck = await checkCustomFieldLimit(
          'itemFields',
          newFields,
          req.user._id,
          req.user.organization
        );

        if (!limitCheck.allowed) {
          return res.status(403).json({
            error: limitCheck.error,
            currentCount: limitCheck.currentCount,
            limit: limitCheck.limit
          });
        }
      }

      req.body.fields = req.body.fields.map(field => {
        if (field._id) {
          const existing = existingDoc.fields.find(f => f._id?.toString() === field._id.toString());
          return { ...field, createdBy: existing?.createdBy || req.user._id };
        }
        return { ...field, createdBy: req.user._id };
      });
    }

    const itemFields = await ItemFields.findOneAndUpdate(
      {
        _id: req.params.id,
        organization: req.user.organization
      },
      req.body,
      { new: true, runValidators: true }
    ).populate('user', 'name email');

    res.status(200).json(itemFields);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update item fields: ' + err.message });
  }
};

exports.deleteItemFields = async (req, res) => {
  try {
    const deleted = await ItemFields.findOneAndDelete({
      user: req.user.id,
      organization: req.user.organization
    });

    if (!deleted) {
      return res.status(404).json({ error: 'Item fields not found' });
    }

    res.status(200).json({ message: 'Item fields deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete item fields: ' + err.message });
  }
};

exports.deleteItemFieldsById = async (req, res) => {
  try {
    const deleted = await ItemFields.findOneAndDelete({
      _id: req.params.id,
      organization: req.user.organization
    });

    if (!deleted) {
      return res.status(404).json({ error: 'Item fields not found' });
    }

    res.status(200).json({ message: 'Item fields deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete item fields: ' + err.message });
  }
};

// ==========================================
// CATEGORY & BULK FUNCTIONS
// ==========================================

exports.addCategory = async (req, res) => {
  try {
    const { categoryName } = req.body;

    if (!categoryName || typeof categoryName !== 'string' || !categoryName.trim()) {
      return res.status(400).json({ error: 'A valid category name is required.' });
    }

    const trimmedCategory = categoryName.trim();

    // $addToSet safely adds the category without creating duplicates
    const updatedFieldsConfig = await ItemFields.findOneAndUpdate(
      { organization: req.user.organization },
      { $addToSet: { fieldCategories: trimmedCategory } },
      { new: true, upsert: true }
    );

    res.status(200).json({
      message: 'Category created successfully',
      categories: updatedFieldsConfig.fieldCategories
    });
  } catch (err) {
    res.status(400).json({ error: 'Failed to create category: ' + err.message });
  }
};

exports.addBulkFields = async (req, res) => {
  try {
    const { newFields } = req.body;

    if (!newFields || !Array.isArray(newFields) || newFields.length === 0) {
      return res.status(400).json({ error: 'Please provide an array of fields to add.' });
    }

    validateFields(newFields);

    const fieldsToInsert = newFields.map((field) => ({
      ...field,
      category: field.category || 'Uncategorized',
      createdBy: req.user._id,
    }));

    const limitCheck = await checkCustomFieldLimit(
      'itemFields',
      fieldsToInsert,
      req.user._id,
      req.user.organization
    );

    if (!limitCheck.allowed) {
      return res.status(403).json({
        error: limitCheck.error,
        currentCount: limitCheck.currentCount,
        limit: limitCheck.limit,
      });
    }

    const updatedFieldsConfig = await ItemFields.findOneAndUpdate(
      { organization: req.user.organization },
      { $push: { fields: { $each: fieldsToInsert } } },
      { new: true, upsert: true, runValidators: true }
    ).populate('user', 'name email');

    res.status(201).json({
      message: `${fieldsToInsert.length} fields added successfully`,
      fields: updatedFieldsConfig.fields
    });
  } catch (err) {
    res.status(400).json({ error: 'Failed to add fields: ' + err.message });
  }
};

exports.getItemFieldCategories = async (req, res) => {
  try {
    const fieldsConfig = await ItemFields.findOne({
      organization: req.user.organization,
    }).select('fieldCategories');

    res.status(200).json({
      categories: fieldsConfig ? (fieldsConfig.fieldCategories || []) : []
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch categories: ' + err.message });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const { oldCategoryName, newCategoryName } = req.body;

    if (!oldCategoryName || !newCategoryName || !newCategoryName.trim()) {
      return res.status(400).json({ error: 'Both old and new category names are required.' });
    }

    const trimmedNewName = newCategoryName.trim();

    const itemFieldsDoc = await ItemFields.findOne({
      organization: req.user.organization
    });

    if (!itemFieldsDoc) {
      return res.status(404).json({ error: 'Item fields configuration not found.' });
    }

    const categoryIndex = itemFieldsDoc.fieldCategories.indexOf(oldCategoryName);
    if (categoryIndex === -1) {
      return res.status(404).json({ error: 'Original category not found.' });
    }

    if (itemFieldsDoc.fieldCategories.includes(trimmedNewName)) {
      return res.status(400).json({ error: 'A category with the new name already exists.' });
    }

    itemFieldsDoc.fieldCategories[categoryIndex] = trimmedNewName;

    // Cascade update: move any fields using the old name
    let fieldsUpdated = 0;
    itemFieldsDoc.fields.forEach(field => {
      if (field.category === oldCategoryName) {
        field.category = trimmedNewName;
        fieldsUpdated++;
      }
    });

    await itemFieldsDoc.save();

    res.status(200).json({
      message: `Category updated successfully. ${fieldsUpdated} fields moved to the new category.`,
      categories: itemFieldsDoc.fieldCategories,
      fields: itemFieldsDoc.fields
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update category: ' + err.message });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const { categoryName } = req.params;

    if (!categoryName) {
      return res.status(400).json({ error: 'Category name is required.' });
    }

    const itemFieldsDoc = await ItemFields.findOne({
      organization: req.user.organization
    });

    if (!itemFieldsDoc) {
      return res.status(404).json({ error: 'Item fields configuration not found.' });
    }

    const categoryIndex = itemFieldsDoc.fieldCategories.indexOf(categoryName);
    if (categoryIndex === -1) {
      return res.status(404).json({ error: 'Category not found.' });
    }

    itemFieldsDoc.fieldCategories.splice(categoryIndex, 1);

    // Cascade delete: move orphaned fields to "Uncategorized"
    let orphanedFieldsCount = 0;
    itemFieldsDoc.fields.forEach(field => {
      if (field.category === categoryName) {
        field.category = 'Uncategorized';
        orphanedFieldsCount++;
      }
    });

    await itemFieldsDoc.save();

    res.status(200).json({
      message: `Category deleted successfully. ${orphanedFieldsCount} fields moved to Uncategorized.`,
      categories: itemFieldsDoc.fieldCategories,
      fields: itemFieldsDoc.fields
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete category: ' + err.message });
  }
};
