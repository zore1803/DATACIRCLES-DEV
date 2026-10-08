// controllers/companyFieldsController.js (updated with additional field type validation)
const CompanyFields = require("../models/CompanyFields");
const {
  checkCustomFieldLimit,
} = require("../middlewares/customFieldRestriction");

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

    // NEW: Validate the category property to ensure it's a string if it is provided
    if (field.category && typeof field.category !== "string") {
      throw new Error(
        `Category for field "${field.name}" must be a text string`,
      );
    }
  }
};

// NEW: Simple validation to ensure fieldCategories is formatted correctly
const validateCategories = (categories) => {
  if (categories && !Array.isArray(categories)) {
    throw new Error("Field categories must be an array of strings");
  }
};

const createCompanyFields = async (req, res) => {
  try {
    // Tenant/identity keys and client-supplied createdBy are never trusted.
    req.body = sanitizeFieldsConfigBody(req.body, req.user._id);
    // Validate fields before creating

    validateCategories(req.body.fieldCategories);

    if (req.body.fields && Array.isArray(req.body.fields)) {
      validateFields(req.body.fields);

      // Auto-add createdBy to each field
      req.body.fields = req.body.fields.map((field) => ({
        ...field,
        createdBy: field.createdBy || req.user._id,
      }));

      // Check custom field limit
      const limitCheck = await checkCustomFieldLimit(
        "companyFields",
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

    const fields = new CompanyFields(fieldsData);
    await fields.save();
    res.status(201).json(fields);
  } catch (err) {
    res
      .status(400)
      .json({ error: "Failed to create company fields: " + err.message });
  }
};

const updateCompanyFields = async (req, res) => {
  try {
    // Tenant/identity keys and client-supplied createdBy are never trusted.
    req.body = sanitizeFieldsConfigBody(req.body, req.user._id);
    // 1. Validate categories if they are passed in the request
    validateCategories(req.body.fieldCategories);

    if (req.body.fields && Array.isArray(req.body.fields)) {
      validateFields(req.body.fields);

      const existingDoc = await CompanyFields.findOne({
        _id: req.params.id,
        organization: req.user.organization,
      });

      if (!existingDoc) {
        return res.status(404).json({ error: "Company fields not found" });
      }

      // Identify NEW fields only (fields that don't have an _id yet, or aren't in the existing doc)
      const existingFieldIds = existingDoc.fields
        .map((f) => f._id?.toString())
        .filter(Boolean);
      const newFields = req.body.fields
        .filter((field) => {
          return !field._id || !existingFieldIds.includes(field._id.toString());
        })
        .map((field) => ({
          ...field,
          createdBy: field.createdBy || req.user._id,
        }));

      // 2. Only check limit for NEW fields being added during this update
      if (newFields.length > 0) {
        const limitCheck = await checkCustomFieldLimit(
          "companyFields",
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

      // 3. Preserve createdBy for existing fields, set for new fields
      // This also automatically preserves the 'category' tag because of the spread operator (...field)
      req.body.fields = req.body.fields.map((field) => {
        if (field._id) {
          const existing = existingDoc.fields.find(
            (f) => f._id?.toString() === field._id.toString(),
          );
          return { ...field, createdBy: existing?.createdBy || req.user._id };
        }
        return { ...field, createdBy: req.user._id };
      });
    }

    const updated = await CompanyFields.findOneAndUpdate(
      {
        _id: req.params.id,
        organization: req.user.organization,
      },
      req.body,
      { new: true, runValidators: true },
    ).populate("user", "name email");

    res.json(updated);
  } catch (err) {
    res
      .status(400)
      .json({ error: "Failed to update company fields: " + err.message });
  }
};

// Keep all other controller methods the same
const getLatestCompanyFields = async (req, res) => {
  try {
    const fields = await CompanyFields.findOne({
      organization: req.user.organization,
    })
      .populate("user", "name email")
      .sort({ updatedAt: -1 });

    res.json(fields);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to fetch company fields: " + err.message });
  }
};

const getAllCompanyFields = async (req, res) => {
  try {
    const fields = await CompanyFields.find({
      organization: req.user.organization,
    })
      .populate("user", "name email")
      .sort({ updatedAt: -1 });

    res.json(fields);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to fetch company fields: " + err.message });
  }
};

const getCompanyFieldsById = async (req, res) => {
  try {
    const fields = await CompanyFields.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    }).populate("user", "name email");

    if (!fields) {
      return res.status(404).json({ error: "Company fields not found" });
    }

    res.json(fields);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to fetch company fields: " + err.message });
  }
};

const deleteCompanyFields = async (req, res) => {
  try {
    const deleted = await CompanyFields.findOneAndDelete({
      _id: req.params.id,
      organization: req.user.organization,
    });

    if (!deleted) {
      return res.status(404).json({ error: "Company fields not found" });
    }

    res.json({ message: "Company fields deleted successfully" });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to delete company fields: " + err.message });
  }
};

const addCategory = async (req, res) => {
  try {
    const { categoryName } = req.body;

    if (!categoryName || typeof categoryName !== 'string' || !categoryName.trim()) {
      return res.status(400).json({ error: 'A valid category name is required.' });
    }

    const trimmedCategory = categoryName.trim();

    // $addToSet safely adds the category without creating duplicates
    const updatedFieldsConfig = await CompanyFields.findOneAndUpdate(
      { organization: req.user.organization },
      { $addToSet: { fieldCategories: trimmedCategory } },
      { new: true, upsert: true } // upsert creates the doc if it's the very first time
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

    // 1. Validate the structure of the incoming fields
    validateFields(newFields);

    // 2. Auto-assign createdBy and ensure a fallback category
    const fieldsToInsert = newFields.map((field) => ({
      ...field,
      category: field.category || 'Uncategorized', // Fallback if no category was selected
      createdBy: req.user._id,
    }));

    // 3. Check custom field limits for the new fields being added
    const limitCheck = await checkCustomFieldLimit(
      "companyFields",
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
    const updatedFieldsConfig = await CompanyFields.findOneAndUpdate(
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

const getCompanyFieldCategories = async (req, res) => {
  try {
    // .select() ensures we ONLY pull the categories array from the database, making it lightning fast
    const fieldsConfig = await CompanyFields.findOne({
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

const getCategoriesByCompanyId = async (req, res) => {
  try {
    const { id } = req.params; // The specific company ID from the URL

    const company = await Company.findOne({
      _id: id,
      organization: req.user.organization, // Security check
    }).select('fieldCategories'); 

    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }

    res.status(200).json({ 
      categories: company.fieldCategories || [] 
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch company categories: " + err.message });
  }
};

const updateCategory = async (req, res) => {
  try {
    const { oldCategoryName, newCategoryName } = req.body;

    if (!oldCategoryName || !newCategoryName || !newCategoryName.trim()) {
      return res.status(400).json({ error: 'Both old and new category names are required.' });
    }

    const trimmedNewName = newCategoryName.trim();

    const companyFieldsDoc = await CompanyFields.findOne({
      organization: req.user.organization
    });

    if (!companyFieldsDoc) {
      return res.status(404).json({ error: 'Company fields configuration not found.' });
    }

    // 1. Update the category name in the fieldCategories array
    const categoryIndex = companyFieldsDoc.fieldCategories.indexOf(oldCategoryName);
    if (categoryIndex === -1) {
      return res.status(404).json({ error: 'Original category not found.' });
    }
    
    // Check if the new name already exists to prevent duplicates
    if (companyFieldsDoc.fieldCategories.includes(trimmedNewName)) {
      return res.status(400).json({ error: 'A category with the new name already exists.' });
    }
    
    companyFieldsDoc.fieldCategories[categoryIndex] = trimmedNewName;

    // 2. Cascade update: Update the category of any fields using the old name
    let fieldsUpdated = 0;
    companyFieldsDoc.fields.forEach(field => {
      if (field.category === oldCategoryName) {
        field.category = trimmedNewName;
        fieldsUpdated++;
      }
    });

    await companyFieldsDoc.save();

    res.status(200).json({
      message: `Category updated successfully. ${fieldsUpdated} fields moved to the new category.`,
      categories: companyFieldsDoc.fieldCategories,
      fields: companyFieldsDoc.fields
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

    const companyFieldsDoc = await CompanyFields.findOne({
      organization: req.user.organization
    });

    if (!companyFieldsDoc) {
      return res.status(404).json({ error: 'Company fields configuration not found.' });
    }

    // 1. Remove from fieldCategories array
    const categoryIndex = companyFieldsDoc.fieldCategories.indexOf(categoryName);
    if (categoryIndex === -1) {
      return res.status(404).json({ error: 'Category not found.' });
    }
    
    companyFieldsDoc.fieldCategories.splice(categoryIndex, 1);

    // 2. Cascade delete: Move orphaned fields to "Uncategorized"
    let orphanedFieldsCount = 0;
    companyFieldsDoc.fields.forEach(field => {
      if (field.category === categoryName) {
        field.category = 'Uncategorized';
        orphanedFieldsCount++;
      }
    });

    await companyFieldsDoc.save();

    res.status(200).json({
      message: `Category deleted successfully. ${orphanedFieldsCount} fields moved to Uncategorized.`,
      categories: companyFieldsDoc.fieldCategories,
      fields: companyFieldsDoc.fields
    });

  } catch (err) {
    res.status(500).json({ error: 'Failed to delete category: ' + err.message });
  }
};

module.exports = {
  createCompanyFields,
  getLatestCompanyFields,
  getAllCompanyFields,
  getCompanyFieldsById,
  updateCompanyFields,
  deleteCompanyFields,
  addCategory,
  updateCategory,
  deleteCategory,
  addBulkFields,
  getCompanyFieldCategories,
  getCategoriesByCompanyId
};
