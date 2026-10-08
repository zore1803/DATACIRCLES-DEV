const ContactFields = require("../models/ContactFields");
const Contact = require("../models/Contact"); 
const { checkCustomFieldLimit } = require("../middlewares/customFieldRestriction");

const { sanitizeFieldsConfigBody } = require("../utils/safeBody");
const validateFields = (fields) => {
  const allowedTypes = [
    "string",
    "number",
    "dropdown",
    "text",
    "url",
    "date",
    "multiselect",
  ];

  for (const field of fields) {
    if (!field.name || !field.type) {
      throw new Error("Field name and type are required");
    }

    if (!allowedTypes.includes(field.type)) {
      throw new Error(
        `Invalid field type: ${field.type}. Allowed types: ${allowedTypes.join(", ")}`,
      );
    }

    // Validate dropdown and multiselect fields have options
    if (
      (field.type === "dropdown" || field.type === "multiselect") &&
      (!field.options || field.options.length === 0)
    ) {
      throw new Error(
        `${field.type} field "${field.name}" must have at least one option`,
      );
    }

    // URL fields don't need options
    if (field.type === "url" && field.options && field.options.length > 0) {
      throw new Error(`URL field "${field.name}" should not have options`);
    }

    // Date fields don't need options
    if (field.type === "date" && field.options && field.options.length > 0) {
      throw new Error(`Date field "${field.name}" should not have options`);
    }

    // Validate the category property to ensure it's a string if it is provided
    if (field.category && typeof field.category !== "string") {
      throw new Error(
        `Category for field "${field.name}" must be a text string`,
      );
    }
  }
};

const validateCategories = (categories) => {
  if (categories && !Array.isArray(categories)) {
    throw new Error("Field categories must be an array of strings");
  }
};

const createContactFields = async (req, res) => {
  try {
    // Tenant/identity keys and client-supplied createdBy are never trusted.
    req.body = sanitizeFieldsConfigBody(req.body, req.user._id);
    validateCategories(req.body.fieldCategories);

    if (req.body.fields && Array.isArray(req.body.fields)) {
      validateFields(req.body.fields);

      // 👉 Auto-add category fallback and createdBy
      req.body.fields = req.body.fields.map((field) => ({
        ...field,
        category: field.category || "Uncategorized", 
        createdBy: field.createdBy || req.user._id,
      }));

      // Check custom field limit for contacts
      const limitCheck = await checkCustomFieldLimit(
        "contactFields",
        req.body.fields,
        req.user._id,
        req.user.organization,
      );

      if (!limitCheck.allowed) {
        return res.status(403).json({
          error: limitCheck.error,
          currentCount: limitCheck.currentCount,
          limit: limitCheck.limit,
        });
      }
    }

    const fieldsData = {
      ...req.body,
      user: req.user.id,
      organization: req.user.organization,
    };

    const contactFields = new ContactFields(fieldsData);
    await contactFields.save();
    await contactFields.populate("user", "name email");
    
    res.status(201).json(contactFields);
  } catch (err) {
    res.status(400).json({ error: "Failed to create contact fields: " + err.message });
  }
};

// Update based on User ID & Organization
const updateContactFields = async (req, res) => {
  try {
    // Tenant/identity keys and client-supplied createdBy are never trusted.
    req.body = sanitizeFieldsConfigBody(req.body, req.user._id);
    validateCategories(req.body.fieldCategories);

    if (req.body.fields && Array.isArray(req.body.fields)) {
      validateFields(req.body.fields);

      const existingDoc = await ContactFields.findOne({
        user: req.user.id,
        organization: req.user.organization,
      });

      if (existingDoc) {
        // Identify NEW fields only
        const existingFieldIds = existingDoc.fields.map((f) => f._id?.toString()).filter(Boolean);
          
        const newFields = req.body.fields
          .filter((field) => !field._id || !existingFieldIds.includes(field._id.toString()))
          .map((field) => ({
            ...field,
            category: field.category || "Uncategorized",
            createdBy: field.createdBy || req.user._id,
          }));

        // Only check limit for NEW fields being added
        if (newFields.length > 0) {
          const limitCheck = await checkCustomFieldLimit(
            "contactFields",
            newFields,
            req.user._id,
            req.user.organization,
          );

          if (!limitCheck.allowed) {
            return res.status(403).json({
              error: limitCheck.error,
              currentCount: limitCheck.currentCount,
              limit: limitCheck.limit,
            });
          }
        }

        // Preserve createdBy and ensure category fallback
        req.body.fields = req.body.fields.map((field) => {
          if (field._id) {
            const existing = existingDoc.fields.find((f) => f._id?.toString() === field._id.toString());
            return { ...field, createdBy: existing?.createdBy || req.user._id };
          }
          return { ...field, category: field.category || "Uncategorized", createdBy: req.user._id };
        });
      }
    }

    const updated = await ContactFields.findOneAndUpdate(
      {
        user: req.user.id,
        organization: req.user.organization,
      },
      req.body,
      { new: true, upsert: true, runValidators: true },
    ).populate("user", "name email");

    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: "Failed to update contact fields: " + err.message });
  }
};

// Update based on specific Document ID
const updateContactFieldsById = async (req, res) => {
  try {
    // Tenant/identity keys and client-supplied createdBy are never trusted.
    req.body = sanitizeFieldsConfigBody(req.body, req.user._id);
    validateCategories(req.body.fieldCategories);

    if (req.body.fields && Array.isArray(req.body.fields)) {
      validateFields(req.body.fields);

      const existingDoc = await ContactFields.findOne({
        _id: req.params.id,
        organization: req.user.organization,
      });

      if (!existingDoc) {
        return res.status(404).json({ error: "Contact fields not found" });
      }

      // Identify NEW fields only
      const existingFieldIds = existingDoc.fields.map((f) => f._id?.toString()).filter(Boolean);
        
      const newFields = req.body.fields
        .filter((field) => !field._id || !existingFieldIds.includes(field._id.toString()))
        .map((field) => ({
          ...field,
          category: field.category || "Uncategorized",
          createdBy: field.createdBy || req.user._id,
        }));

      // Only check limit for NEW fields being added
      if (newFields.length > 0) {
        const limitCheck = await checkCustomFieldLimit(
          "contactFields",
          newFields,
          req.user._id,
          req.user.organization,
        );

        if (!limitCheck.allowed) {
          return res.status(403).json({
            error: limitCheck.error,
            currentCount: limitCheck.currentCount,
            limit: limitCheck.limit,
          });
        }
      }

      // Preserve createdBy and ensure category fallback
      req.body.fields = req.body.fields.map((field) => {
        if (field._id) {
          const existing = existingDoc.fields.find((f) => f._id?.toString() === field._id.toString());
          return { ...field, createdBy: existing?.createdBy || req.user._id };
        }
        return { ...field, category: field.category || "Uncategorized", createdBy: req.user._id };
      });
    }

    const updated = await ContactFields.findOneAndUpdate(
      {
        _id: req.params.id,
        organization: req.user.organization,
      },
      req.body,
      { new: true, runValidators: true },
    ).populate("user", "name email");

    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: "Failed to update contact fields: " + err.message });
  }
};

const getContactFields = async (req, res) => {
  try {
    const fields = await ContactFields.findOne({
      user: req.user.id,
      organization: req.user.organization,
    }).populate("user", "name email");

    res.status(200).json(fields || { fields: [], fieldCategories: [] });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch contact fields: " + err.message });
  }
};

const getLatestContactFields = async (req, res) => {
  try {
    const fields = await ContactFields.findOne({
      organization: req.user.organization,
    })
      .populate("user", "name email")
      .sort({ updatedAt: -1 });

    res.status(200).json(fields || { fields: [], fieldCategories: [] });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch contact fields: " + err.message });
  }
};

const getAllContactFields = async (req, res) => {
  try {
    const fields = await ContactFields.find({
      organization: req.user.organization,
    })
      .populate("user", "name email")
      .sort({ updatedAt: -1 });

    res.json(fields);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch contact fields: " + err.message });
  }
};

const getContactFieldsById = async (req, res) => {
  try {
    const fields = await ContactFields.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    }).populate("user", "name email");

    if (!fields) {
      return res.status(404).json({ error: "Contact fields not found" });
    }

    res.json(fields);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch contact fields: " + err.message });
  }
};

const deleteContactFields = async (req, res) => {
  try {
    const deleted = await ContactFields.findOneAndDelete({
      user: req.user.id,
      organization: req.user.organization,
    });

    if (!deleted) {
      return res.status(404).json({ error: "Contact fields not found" });
    }

    res.json({ message: "Contact fields deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete contact fields: " + err.message });
  }
};

const deleteContactFieldsById = async (req, res) => {
  try {
    const deleted = await ContactFields.findOneAndDelete({
      _id: req.params.id,
      organization: req.user.organization,
    });

    if (!deleted) {
      return res.status(404).json({ error: "Contact fields not found" });
    }

    res.json({ message: "Contact fields deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete contact fields: " + err.message });
  }
};

const addCategory = async (req, res) => {
  try {
    const { categoryName } = req.body;

    if (!categoryName || typeof categoryName !== 'string' || !categoryName.trim()) {
      return res.status(400).json({ error: 'A valid category name is required.' });
    }

    const trimmedCategory = categoryName.trim();

    const updatedFieldsConfig = await ContactFields.findOneAndUpdate(
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

const addBulkFields = async (req, res) => {
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
      "contactFields",
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

    const updatedFieldsConfig = await ContactFields.findOneAndUpdate(
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

const getContactFieldCategories = async (req, res) => {
  try {
    const fieldsConfig = await ContactFields.findOne({
      organization: req.user.organization,
    }).select('fieldCategories');

    if (!fieldsConfig) {
      return res.status(200).json({ categories: [] });
    }

    res.status(200).json({ 
      categories: fieldsConfig.fieldCategories || [] 
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch categories: " + err.message });
  }
};

const updateCategory = async (req, res) => {
  try {
    const { oldCategoryName, newCategoryName } = req.body;

    if (!oldCategoryName || !newCategoryName || !newCategoryName.trim()) {
      return res.status(400).json({ error: 'Both old and new category names are required.' });
    }

    const trimmedNewName = newCategoryName.trim();

    const contactFieldsDoc = await ContactFields.findOne({
      organization: req.user.organization
    });

    if (!contactFieldsDoc) {
      return res.status(404).json({ error: 'Contact fields configuration not found.' });
    }

    // 1. Update the category name in the fieldCategories array
    const categoryIndex = contactFieldsDoc.fieldCategories.indexOf(oldCategoryName);
    if (categoryIndex === -1) {
      return res.status(404).json({ error: 'Original category not found.' });
    }
    
    // Check if the new name already exists to prevent duplicates
    if (contactFieldsDoc.fieldCategories.includes(trimmedNewName)) {
      return res.status(400).json({ error: 'A category with the new name already exists.' });
    }
    
    contactFieldsDoc.fieldCategories[categoryIndex] = trimmedNewName;

    // 2. Cascade update: Update the category of any fields using the old name
    let fieldsUpdated = 0;
    contactFieldsDoc.fields.forEach(field => {
      if (field.category === oldCategoryName) {
        field.category = trimmedNewName;
        fieldsUpdated++;
      }
    });

    await contactFieldsDoc.save();

    res.status(200).json({
      message: `Category updated successfully. ${fieldsUpdated} fields moved to the new category.`,
      categories: contactFieldsDoc.fieldCategories,
      fields: contactFieldsDoc.fields
    });

  } catch (err) {
    res.status(500).json({ error: 'Failed to update category: ' + err.message });
  }
};

const deleteCategory = async (req, res) => {
  try {
    const { categoryName } = req.params;

    if (!categoryName) {
      return res.status(400).json({ error: 'Category name is required.' });
    }

    const contactFieldsDoc = await ContactFields.findOne({
      organization: req.user.organization
    });

    if (!contactFieldsDoc) {
      return res.status(404).json({ error: 'Contact fields configuration not found.' });
    }

    // 1. Remove from fieldCategories array
    const categoryIndex = contactFieldsDoc.fieldCategories.indexOf(categoryName);
    if (categoryIndex === -1) {
      return res.status(404).json({ error: 'Category not found.' });
    }
    
    contactFieldsDoc.fieldCategories.splice(categoryIndex, 1);

    // 2. Cascade delete: Move orphaned fields to "Uncategorized"
    let orphanedFieldsCount = 0;
    contactFieldsDoc.fields.forEach(field => {
      if (field.category === categoryName) {
        field.category = 'Uncategorized';
        orphanedFieldsCount++;
      }
    });

    await contactFieldsDoc.save();

    res.status(200).json({
      message: `Category deleted successfully. ${orphanedFieldsCount} fields moved to Uncategorized.`,
      categories: contactFieldsDoc.fieldCategories,
      fields: contactFieldsDoc.fields
    });

  } catch (err) {
    res.status(500).json({ error: 'Failed to delete category: ' + err.message });
  }
};

module.exports = {
  createContactFields,
  getContactFields,
  getLatestContactFields,
  getAllContactFields,
  getContactFieldsById,
  updateContactFields,
  updateContactFieldsById,
  deleteContactFields,
  deleteContactFieldsById,
  addCategory,
  updateCategory,
  deleteCategory,
  addBulkFields,
  getContactFieldCategories
};