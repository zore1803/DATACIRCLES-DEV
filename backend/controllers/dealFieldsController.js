const DealFields = require('../models/DealFields');
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

    // Validate the category property
    if (field.category && typeof field.category !== 'string') {
      throw new Error(`Category for field "${field.name}" must be a text string`);
    }
  }
};

const validateCategories = (categories) => {
  if (categories && !Array.isArray(categories)) {
    throw new Error("Field categories must be an array of strings");
  }
};

exports.createDealFields = async (req, res) => {
  try {
    // Tenant/identity keys and client-supplied createdBy are never trusted.
    req.body = sanitizeFieldsConfigBody(req.body, req.user._id);
    validateCategories(req.body.fieldCategories);

    if (req.body.fields && Array.isArray(req.body.fields)) {
      validateFields(req.body.fields);

      // Auto-add category fallback and createdBy
      req.body.fields = req.body.fields.map(field => ({
        ...field,
        category: field.category || 'Uncategorized',
        createdBy: field.createdBy || req.user._id
      }));
            
      // Check custom field limit
      const limitCheck = await checkCustomFieldLimit(
        'dealFields',
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

    const dealFieldsData = { 
      ...req.body, 
      user: req.user.id,
      organization: req.user.organization
    };
    
    const dealFields = new DealFields(dealFieldsData);
    await dealFields.save();
    await dealFields.populate('user', 'name email');
    
    res.status(201).json(dealFields);
  } catch (err) {
    res.status(400).json({ error: 'Failed to create deal fields: ' + err.message });
  }
};

exports.getDealFields = async (req, res) => {
  try {
    const dealFields = await DealFields.findOne({ 
      user: req.user.id,
      organization: req.user.organization
    }).populate('user', 'name email');
    
    // Return empty arrays as a fallback to prevent frontend crashes
    res.status(200).json(dealFields || { fields: [], fieldCategories: [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch deal fields: ' + err.message });
  }
};

exports.getLatestDealFields = async (req, res) => {
  try {
    const dealFields = await DealFields.findOne({ 
      organization: req.user.organization
    })
    .populate('user', 'name email')
    .sort({ updatedAt: -1 });
    
    res.status(200).json(dealFields || { fields: [], fieldCategories: [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch latest deal fields: ' + err.message });
  }
};

exports.getAllDealFields = async (req, res) => {
  try {
    const dealFields = await DealFields.find({ 
      organization: req.user.organization
    })
    .populate('user', 'name email')
    .sort({ updatedAt: -1 });
    
    res.status(200).json(dealFields);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch all deal fields: ' + err.message });
  }
};

exports.getDealFieldsById = async (req, res) => {
  try {
    const dealFields = await DealFields.findOne({
      _id: req.params.id,
      organization: req.user.organization
    }).populate('user', 'name email');
    
    if (!dealFields) {
      return res.status(404).json({ error: 'Deal fields not found' });
    }
    
    res.status(200).json(dealFields);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch deal fields: ' + err.message });
  }
};

exports.updateDealFields = async (req, res) => {
  try {
    // Tenant/identity keys and client-supplied createdBy are never trusted.
    req.body = sanitizeFieldsConfigBody(req.body, req.user._id);
    validateCategories(req.body.fieldCategories);

    if (req.body.fields && Array.isArray(req.body.fields)) {
      validateFields(req.body.fields);

      const existingDoc = await DealFields.findOne({
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

        // Only check limit for NEW fields being added
        if (newFields.length > 0) {
          const limitCheck = await checkCustomFieldLimit(
            'dealFields',
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

        // Preserve existing createdBy and add fallback categories
        req.body.fields = req.body.fields.map(field => {
          if (field._id) {
            const existing = existingDoc.fields.find(f => f._id?.toString() === field._id.toString());
            return { ...field, createdBy: existing?.createdBy || req.user._id };
          }
          return { ...field, category: field.category || 'Uncategorized', createdBy: req.user._id };
        });
      }
    }
    
    const dealFields = await DealFields.findOneAndUpdate(
      { 
        user: req.user.id,
        organization: req.user.organization
      },
      req.body,
      { new: true, upsert: true, runValidators: true }
    ).populate('user', 'name email');
    
    res.status(200).json(dealFields);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update deal fields: ' + err.message });
  }
};

exports.updateDealFieldsById = async (req, res) => {
  try {
    // Tenant/identity keys and client-supplied createdBy are never trusted.
    req.body = sanitizeFieldsConfigBody(req.body, req.user._id);
    validateCategories(req.body.fieldCategories);

    if (req.body.fields && Array.isArray(req.body.fields)) {
      validateFields(req.body.fields);

      const existingDoc = await DealFields.findOne({
        _id: req.params.id,
        organization: req.user.organization
      });

      if (!existingDoc) {
        return res.status(404).json({ error: 'Deal fields not found' });
      }

      // Identify NEW fields only
      const existingFieldIds = existingDoc.fields.map(f => f._id?.toString()).filter(Boolean);
      const newFields = req.body.fields.filter(field => {
        return !field._id || !existingFieldIds.includes(field._id.toString());
      }).map(field => ({
        ...field,
        category: field.category || 'Uncategorized',
        createdBy: field.createdBy || req.user._id
      }));

      // Check limit for new fields
      if (newFields.length > 0) {
        const limitCheck = await checkCustomFieldLimit(
          'dealFields',
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
        return { ...field, category: field.category || 'Uncategorized', createdBy: req.user._id };
      });
    }
    
    const dealFields = await DealFields.findOneAndUpdate(
      { 
        _id: req.params.id,
        organization: req.user.organization
      },
      req.body,
      { new: true, runValidators: true }
    ).populate('user', 'name email');
    
    res.status(200).json(dealFields);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update deal fields: ' + err.message });
  }
};

exports.deleteDealFields = async (req, res) => {
  try {
    const deleted = await DealFields.findOneAndDelete({ 
      user: req.user.id,
      organization: req.user.organization
    });
    
    if (!deleted) {
      return res.status(404).json({ error: 'Deal fields not found' });
    }
    
    res.status(200).json({ message: 'Deal fields deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete deal fields: ' + err.message });
  }
};

exports.deleteDealFieldsById = async (req, res) => {
  try {
    const deleted = await DealFields.findOneAndDelete({
      _id: req.params.id,
      organization: req.user.organization
    });
    
    if (!deleted) {
      return res.status(404).json({ error: 'Deal fields not found' });
    }
    
    res.status(200).json({ message: 'Deal fields deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete deal fields: ' + err.message });
  }
};


// ==========================================
// DEDICATED CATEGORY & BULK FUNCTIONS
// ==========================================

exports.addCategory = async (req, res) => {
  try {
    const { categoryName } = req.body;

    if (!categoryName || typeof categoryName !== 'string' || !categoryName.trim()) {
      return res.status(400).json({ error: 'A valid category name is required.' });
    }

    const trimmedCategory = categoryName.trim();

    const updatedFieldsConfig = await DealFields.findOneAndUpdate(
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
      "dealFields",
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

    const updatedFieldsConfig = await DealFields.findOneAndUpdate(
      { organization: req.user.organization },
      { $push: { fields: { $each: fieldsToInsert } } },
      { new: true, upsert: true, runValidators: true }
    ).populate("user", "name email");

    res.status(201).json({ 
      message: `${fieldsToInsert.length} fields added successfully`, 
      fields: updatedFieldsConfig.fields 
    });
  } catch (err) {
    res.status(400).json({ error: 'Failed to add fields: ' + err.message });
  }
};

exports.getDealFieldCategories = async (req, res) => {
  try {
    const fieldsConfig = await DealFields.findOne({
      organization: req.user.organization,
    }).select('fieldCategories');

    res.status(200).json({ 
      categories: fieldsConfig ? (fieldsConfig.fieldCategories || []) : [] 
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch categories: " + err.message });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const { oldCategoryName, newCategoryName } = req.body;

    if (!oldCategoryName || !newCategoryName || !newCategoryName.trim()) {
      return res.status(400).json({ error: 'Both old and new category names are required.' });
    }

    const trimmedNewName = newCategoryName.trim();

    const dealFieldsDoc = await DealFields.findOne({
      organization: req.user.organization
    });

    if (!dealFieldsDoc) {
      return res.status(404).json({ error: 'Deal fields configuration not found.' });
    }

    // 1. Update the category name in the fieldCategories array
    const categoryIndex = dealFieldsDoc.fieldCategories.indexOf(oldCategoryName);
    if (categoryIndex === -1) {
      return res.status(404).json({ error: 'Original category not found.' });
    }
    
    // Check if the new name already exists to prevent duplicates
    if (dealFieldsDoc.fieldCategories.includes(trimmedNewName)) {
      return res.status(400).json({ error: 'A category with the new name already exists.' });
    }
    
    dealFieldsDoc.fieldCategories[categoryIndex] = trimmedNewName;

    // 2. Cascade update: Update the category of any fields using the old name
    let fieldsUpdated = 0;
    dealFieldsDoc.fields.forEach(field => {
      if (field.category === oldCategoryName) {
        field.category = trimmedNewName;
        fieldsUpdated++;
      }
    });

    await dealFieldsDoc.save();

    res.status(200).json({
      message: `Category updated successfully. ${fieldsUpdated} fields moved to the new category.`,
      categories: dealFieldsDoc.fieldCategories,
      fields: dealFieldsDoc.fields
    });

  } catch (err) {
    res.status(500).json({ error: 'Failed to update category: ' + err.message });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    // Assuming you send categoryName in the URL params, e.g., DELETE /categories/:categoryName
    // Or you can use req.body if it's a POST/PUT request.
    const { categoryName } = req.params; 

    if (!categoryName) {
      return res.status(400).json({ error: 'Category name is required.' });
    }

    const dealFieldsDoc = await DealFields.findOne({
      organization: req.user.organization
    });

    if (!dealFieldsDoc) {
      return res.status(404).json({ error: 'Deal fields configuration not found.' });
    }

    // 1. Remove from fieldCategories array
    const categoryIndex = dealFieldsDoc.fieldCategories.indexOf(categoryName);
    if (categoryIndex === -1) {
      return res.status(404).json({ error: 'Category not found.' });
    }
    
    dealFieldsDoc.fieldCategories.splice(categoryIndex, 1);

    // 2. Cascade delete: Move orphaned fields to "Uncategorized"
    let orphanedFieldsCount = 0;
    dealFieldsDoc.fields.forEach(field => {
      if (field.category === categoryName) {
        field.category = 'Uncategorized';
        orphanedFieldsCount++;
      }
    });

    await dealFieldsDoc.save();

    res.status(200).json({
      message: `Category deleted successfully. ${orphanedFieldsCount} fields moved to Uncategorized.`,
      categories: dealFieldsDoc.fieldCategories,
      fields: dealFieldsDoc.fields
    });

  } catch (err) {
    res.status(500).json({ error: 'Failed to delete category: ' + err.message });
  }
};