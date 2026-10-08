// controllers/meetingFieldsController.js
// Adapted from vendorFieldsController.js — same custom-field-definition CRUD
// (fields, categories, bulk-add, per-plan limit check), pointed at MeetingFields.

const MeetingFields = require('../models/MeetingFields');
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

    // NEW: Validate the category property to ensure it's a string if it is provided
    if (field.category && typeof field.category !== 'string') {
      throw new Error(`Category for field "${field.name}" must be a text string`);
    }
  }
};

// NEW: Simple validation to ensure fieldCategories is formatted correctly
const validateCategories = (categories) => {
  if (categories && !Array.isArray(categories)) {
    throw new Error('Field categories must be an array of strings');
  }
};

exports.createMeetingFields = async (req, res) => {
  try {
    // Tenant/identity keys and client-supplied createdBy are never trusted.
    req.body = sanitizeFieldsConfigBody(req.body, req.user._id);
    validateCategories(req.body.fieldCategories);

    if (req.body.fields && Array.isArray(req.body.fields)) {
      validateFields(req.body.fields);

      // Auto-add createdBy and ensure fallback category for each field
      req.body.fields = req.body.fields.map(field => ({
        ...field,
        category: field.category || 'Uncategorized',
        createdBy: field.createdBy || req.user._id
      }));
      
      // Check custom field limit
      const limitCheck = await checkCustomFieldLimit(
        'meetingFields',
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

    // Use ...req.body instead of destructuring { fields } so fieldCategories is saved too
    const meetingFieldsData = { 
      ...req.body, 
      user: req.user.id,
      organization: req.user.organization
    };
    
    const meetingFields = new MeetingFields(meetingFieldsData);
    await meetingFields.save();
    await meetingFields.populate('user', 'name email');
    
    res.status(201).json(meetingFields);
  } catch (err) {
    res.status(400).json({ error: 'Failed to create meeting fields: ' + err.message });
  }
};

exports.getMeetingFields = async (req, res) => {
  try {
    const meetingFields = await MeetingFields.findOne({ 
      user: req.user.id,
      organization: req.user.organization
    }).populate('user', 'name email');
    
    res.status(200).json(meetingFields || { fields: [], fieldCategories: [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch meeting fields: ' + err.message });
  }
};

exports.getLatestMeetingFields = async (req, res) => {
  try {
    const meetingFields = await MeetingFields.findOne({ 
      organization: req.user.organization
    })
    .populate('user', 'name email')
    .sort({ updatedAt: -1 });
    
    res.status(200).json(meetingFields || { fields: [], fieldCategories: [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch latest meeting fields: ' + err.message });
  }
};

exports.getAllMeetingFields = async (req, res) => {
  try {
    const meetingFields = await MeetingFields.find({ 
      organization: req.user.organization
    })
    .populate('user', 'name email')
    .sort({ updatedAt: -1 });
    
    res.status(200).json(meetingFields);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch all meeting fields: ' + err.message });
  }
};

exports.getMeetingFieldsById = async (req, res) => {
  try {
    const meetingFields = await MeetingFields.findOne({
      _id: req.params.id,
      organization: req.user.organization
    }).populate('user', 'name email');
    
    if (!meetingFields) {
      return res.status(404).json({ error: 'Meeting fields not found' });
    }
    
    res.status(200).json(meetingFields);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch meeting fields: ' + err.message });
  }
};

exports.updateMeetingFields = async (req, res) => {
  try {
    // Tenant/identity keys and client-supplied createdBy are never trusted.
    req.body = sanitizeFieldsConfigBody(req.body, req.user._id);
    validateCategories(req.body.fieldCategories);

    if (req.body.fields && Array.isArray(req.body.fields)) {
      validateFields(req.body.fields);

      const existingDoc = await MeetingFields.findOne({
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
            'meetingFields',
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
    
    const meetingFields = await MeetingFields.findOneAndUpdate(
      { 
        user: req.user.id,
        organization: req.user.organization
      },
      req.body, // Use req.body directly to ensure fieldCategories saves
      { new: true, upsert: true, runValidators: true }
    ).populate('user', 'name email');
    
    res.status(200).json(meetingFields);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update meeting fields: ' + err.message });
  }
};

exports.updateMeetingFieldsById = async (req, res) => {
  try {
    // Tenant/identity keys and client-supplied createdBy are never trusted.
    req.body = sanitizeFieldsConfigBody(req.body, req.user._id);
    validateCategories(req.body.fieldCategories);

    if (req.body.fields && Array.isArray(req.body.fields)) {
      validateFields(req.body.fields);

      const existingDoc = await MeetingFields.findOne({
        _id: req.params.id,
        organization: req.user.organization
      });

      if (!existingDoc) {
        return res.status(404).json({ error: 'Meeting fields not found' });
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

      // Only check limit for NEW fields
      if (newFields.length > 0) {
        const limitCheck = await checkCustomFieldLimit(
          'meetingFields',
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
    
    const meetingFields = await MeetingFields.findOneAndUpdate(
      { 
        _id: req.params.id,
        organization: req.user.organization
      },
      req.body, // Use req.body directly to ensure fieldCategories saves
      { new: true, runValidators: true }
    ).populate('user', 'name email');
    
    res.status(200).json(meetingFields);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update meeting fields: ' + err.message });
  }
};

exports.deleteMeetingFields = async (req, res) => {
  try {
    const deleted = await MeetingFields.findOneAndDelete({ 
      user: req.user.id,
      organization: req.user.organization
    });
    
    if (!deleted) {
      return res.status(404).json({ error: 'Meeting fields not found' });
    }
    
    res.status(200).json({ message: 'Meeting fields deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete meeting fields: ' + err.message });
  }
};

exports.deleteMeetingFieldsById = async (req, res) => {
  try {
    const deleted = await MeetingFields.findOneAndDelete({
      _id: req.params.id,
      organization: req.user.organization
    });
    
    if (!deleted) {
      return res.status(404).json({ error: 'Meeting fields not found' });
    }
    
    res.status(200).json({ message: 'Meeting fields deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete meeting fields: ' + err.message });
  }
};

// ==========================================
// NEW: DEDICATED CATEGORY & BULK FUNCTIONS
// ==========================================

exports.addCategory = async (req, res) => {
  try {
    const { categoryName } = req.body;

    if (!categoryName || typeof categoryName !== 'string' || !categoryName.trim()) {
      return res.status(400).json({ error: 'A valid category name is required.' });
    }

    const trimmedCategory = categoryName.trim();

    // $addToSet safely adds the category without creating duplicates
    const updatedFieldsConfig = await MeetingFields.findOneAndUpdate(
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

    // 1. Validate the structure of the incoming fields
    validateFields(newFields);

    // 2. Auto-assign createdBy and ensure a fallback category
    const fieldsToInsert = newFields.map((field) => ({
      ...field,
      category: field.category || 'Uncategorized',
      createdBy: req.user._id,
    }));

    // 3. Check custom field limits for the new fields being added
    const limitCheck = await checkCustomFieldLimit(
      "meetingFields",
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

    // 4. Use $push with $each to append multiple items efficiently
    const updatedFieldsConfig = await MeetingFields.findOneAndUpdate(
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

exports.getMeetingFieldCategories = async (req, res) => {
  try {
    const fieldsConfig = await MeetingFields.findOne({
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

    const meetingFieldsDoc = await MeetingFields.findOne({
      organization: req.user.organization
    });

    if (!meetingFieldsDoc) {
      return res.status(404).json({ error: 'Meeting fields configuration not found.' });
    }

    // 1. Update the category name in the fieldCategories array
    const categoryIndex = meetingFieldsDoc.fieldCategories.indexOf(oldCategoryName);
    if (categoryIndex === -1) {
      return res.status(404).json({ error: 'Original category not found.' });
    }
    
    // Check if the new name already exists to prevent duplicates
    if (meetingFieldsDoc.fieldCategories.includes(trimmedNewName)) {
      return res.status(400).json({ error: 'A category with the new name already exists.' });
    }
    
    meetingFieldsDoc.fieldCategories[categoryIndex] = trimmedNewName;

    // 2. Cascade update: Update the category of any fields using the old name
    let fieldsUpdated = 0;
    meetingFieldsDoc.fields.forEach(field => {
      if (field.category === oldCategoryName) {
        field.category = trimmedNewName;
        fieldsUpdated++;
      }
    });

    await meetingFieldsDoc.save();

    res.status(200).json({
      message: `Category updated successfully. ${fieldsUpdated} fields moved to the new category.`,
      categories: meetingFieldsDoc.fieldCategories,
      fields: meetingFieldsDoc.fields
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

    const meetingFieldsDoc = await MeetingFields.findOne({
      organization: req.user.organization
    });

    if (!meetingFieldsDoc) {
      return res.status(404).json({ error: 'Meeting fields configuration not found.' });
    }

    // 1. Remove from fieldCategories array
    const categoryIndex = meetingFieldsDoc.fieldCategories.indexOf(categoryName);
    if (categoryIndex === -1) {
      return res.status(404).json({ error: 'Category not found.' });
    }
    
    meetingFieldsDoc.fieldCategories.splice(categoryIndex, 1);

    // 2. Cascade delete: Move orphaned fields to "Uncategorized"
    let orphanedFieldsCount = 0;
    meetingFieldsDoc.fields.forEach(field => {
      if (field.category === categoryName) {
        field.category = 'Uncategorized';
        orphanedFieldsCount++;
      }
    });

    await meetingFieldsDoc.save();

    res.status(200).json({
      message: `Category deleted successfully. ${orphanedFieldsCount} fields moved to Uncategorized.`,
      categories: meetingFieldsDoc.fieldCategories,
      fields: meetingFieldsDoc.fields
    });

  } catch (err) {
    res.status(500).json({ error: 'Failed to delete category: ' + err.message });
  }
};