const Company = require('../models/Company');
const { formatCustomFieldValue } = require("../utils/exportFormat");
const Contact = require('../models/Contact');
const Deal = require('../models/Deal');
const Meeting = require('../models/Meeting');
const Task = require('../models/Task');
const companyService = require('../services/companyService');
const { buildFuzzySearchPattern } = require('../utils/searchRegex');
const { parsePickerLimit } = require('../utils/pickerLimit');

const createCompany = async (req, res) => {
  try {
    const company = await companyService.createCompany(req.user.organization, req.body, {
      actingUserId: req.user._id,
      createdByUserId: req.user._id,
      profilePictureUrl: req.fileLocation,
    });

    res.status(201).json(company);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const getAllCompanies = async (req, res) => {
  try {
    const { search } = req.query;
    let query = { organization: req.user.organization };

    if (search) {
      // & and "and" are treated as interchangeable (see utils/searchRegex) —
      // a customer typing "finance and banking" should still find "Finance &
      // Banking" and vice versa, since users don't reliably type the symbol.
      const pattern = buildFuzzySearchPattern(search);
      query.$or = [
        { name: { $regex: pattern, $options: "i" } },
        { industry: { $regex: pattern, $options: "i" } },
        { gstin: { $regex: pattern, $options: "i" } },
        { website: { $regex: pattern, $options: "i" } },
        { address: { $regex: pattern, $options: "i" } },
        { leadSource: { $regex: pattern, $options: "i" } },
        { "additionalFields.value": { $regex: pattern, $options: "i" } },
      ];
    }

    // own-only: restrict to companies this user created/owns, combined with
    // the search $or above via $and so neither condition clobbers the other.
    if (req.ownOnly) {
      const ownFilter = { $or: [{ user: req.user._id }, { createdBy: req.user._id }, { owner: req.user._id }] };
      if (query.$or) {
        query = { organization: query.organization, $and: [{ $or: query.$or }, ownFilter] };
      } else {
        Object.assign(query, ownFilter);
      }
    }

    let listQuery = Company.find(query)
      .populate("user", "name")
      .populate("createdBy", "name")
      .populate("lastUpdatedBy", "name")
      .populate("owner", "name email");

    // Picker callers pass ?limit= so they never pull the whole collection.
    const cap = parsePickerLimit(req.query.limit);
    if (cap) listQuery = listQuery.sort({ name: 1 }).limit(cap);

    const companies = await listQuery;

    res.json(companies);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getAllCompaniesPaginated = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 500);
    const skip = (page - 1) * limit;

    const {
      search,
      industry,
      sortBy = "name",
      sortOrder = "asc",
      advancedFilters,
    } = req.query;

    const query = { organization: req.user.organization };

    if (search) {
      const pattern = buildFuzzySearchPattern(search);
      query.$or = [
        { name: { $regex: pattern, $options: "i" } },
        { industry: { $regex: pattern, $options: "i" } },
        { gstin: { $regex: pattern, $options: "i" } },
        { address: { $regex: pattern, $options: "i" } },
        { website: { $regex: pattern, $options: "i" } },
        { leadSource: { $regex: pattern, $options: "i" } },
        { "additionalFields.value": { $regex: pattern, $options: "i" } },
      ];
    }

    if (industry) {
      query.industry = industry;
    }

    if (advancedFilters) {
      const parsedFilters = JSON.parse(advancedFilters);
      const andConditions = [];

      // List of fields that exist at the root level of the schema
      const baseFields = ["name", "industry", "address", "website", "gstin"];

      parsedFilters.forEach((filter) => {
        const { column, operator, value } = filter;
        if (!column || !operator) return;

        let condition = {};
        const isBaseField = baseFields.includes(column);

        // Helper to generate the MongoDB operator object
        const getOperatorQuery = (op, val) => {
          switch (op) {
            case "is":
              return val;
            case "is_not":
              return { $ne: val };
            case "contains":
              return { $regex: val, $options: "i" };
            case "not_contains":
              return { $not: { $regex: val, $options: "i" } };
            case "in":
              return {
                $in: Array.isArray(val)
                  ? val
                  : val.split(",").map((v) => v.trim()),
              };
            case "not_in":
              return {
                $nin: Array.isArray(val)
                  ? val
                  : val.split(",").map((v) => v.trim()),
              };
            case "is_empty":
              return { $in: [null, ""] };
            case "is_not_empty":
              return { $nin: [null, ""] };
            default:
              return val;
          }
        };

        const operatorQuery = getOperatorQuery(operator, value);

        if (isBaseField) {
          condition[column] = operatorQuery;
        } else {
          // For custom additionalFields, we use $elemMatch
          if (operator === "is_empty") {
            condition.additionalFields = {
              $not: { $elemMatch: { key: column } },
            };
          } else if (operator === "is_not_empty") {
            condition.additionalFields = { $elemMatch: { key: column } };
          } else {
            condition.additionalFields = {
              $elemMatch: { key: column, value: operatorQuery },
            };
          }
        }
        andConditions.push(condition);
      });

      if (andConditions.length > 0) {
        query.$and = query.$and
          ? [...query.$and, ...andConditions]
          : andConditions;
      }
    }

    // own-only: restrict to companies this user created/owns.
    if (req.ownOnly) {
      const ownFilter = { $or: [{ user: req.user._id }, { createdBy: req.user._id }, { owner: req.user._id }] };
      query.$and = query.$and ? [...query.$and, ownFilter] : [ownFilter];
    }

    const sortObj = {};
    sortObj[sortBy] = sortOrder === "desc" ? -1 : 1;

    // "Select All" support: return every matching company's _id (ignoring
    // pagination) so the frontend can select all rows across every page,
    // not just the current page.
    if (req.query.allIds === "true") {
      const allCompanies = await Company.find(query).select("_id").lean();
      return res.json({ ids: allCompanies.map((c) => c._id) });
    }

    // Starred-first: starring is per-user (starredBy), so the "is this
    // starred" flag is computed relative to the requesting user, then sorted
    // ahead of everything else — this is why plain .find().sort() can't do
    // it and the query has to go through the aggregation pipeline instead.
    const userId = req.user._id;
    const [{ data: companies, totalCountArr }] = await Company.aggregate([
      { $match: query },
      {
        $addFields: {
          isStarred: { $in: [userId, { $ifNull: ["$starredBy", []] }] },
        },
      },
      { $sort: { isStarred: -1, ...sortObj } },
      {
        $facet: {
          data: [
            { $skip: skip },
            { $limit: limit },
            {
              $lookup: {
                from: "users",
                localField: "user",
                foreignField: "_id",
                as: "user",
                pipeline: [{ $project: { name: 1 } }],
              },
            },
            { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
            {
              $lookup: {
                from: "users",
                localField: "createdBy",
                foreignField: "_id",
                as: "createdBy",
                pipeline: [{ $project: { name: 1 } }],
              },
            },
            { $unwind: { path: "$createdBy", preserveNullAndEmptyArrays: true } },
            {
              $lookup: {
                from: "users",
                localField: "lastUpdatedBy",
                foreignField: "_id",
                as: "lastUpdatedBy",
                pipeline: [{ $project: { name: 1 } }],
              },
            },
            { $unwind: { path: "$lastUpdatedBy", preserveNullAndEmptyArrays: true } },
            {
              $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner",
                pipeline: [{ $project: { name: 1, email: 1 } }],
              },
            },
            { $unwind: { path: "$owner", preserveNullAndEmptyArrays: true } },
            { $project: { __v: 0, starredBy: 0 } },
          ],
          totalCountArr: [{ $count: "count" }],
        },
      },
    ]);
    const totalCount = totalCountArr[0]?.count || 0;

    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.json({
      companies,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        limit,
        hasNextPage,
        hasPrevPage,
        nextPage: hasNextPage ? page + 1 : null,
        prevPage: hasPrevPage ? page - 1 : null,
      },
    });
  } catch (error) {
    console.error("Error fetching companies:", error);
    res.status(500).json({
      error: "Failed to fetch companies",
      message: error.message,
    });
  }
};

const getMyCompanies = async (req, res) => {
  try {
    const companies = await Company.find({
      user: req.user.id,
      organization: req.user.organization,
    })
      .populate("user", "name")
      .populate("createdBy", "name")
      .populate("lastUpdatedBy", "name")
      .populate("owner", "name email");
    res.json(companies);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// A user with own-only permission may only touch companies they created,
// or that are explicitly designated theirs via the `owner` field (set from
// the Companies list's "Set/Change Owner" menu) — shared here since
// getCompanyById/updateCompany/deleteCompany all need the same check.
const isOwnedByUser = (company, userId) => {
  const uid = userId.toString();
  // .populate("user"/"createdBy"/"owner") turns these into subdocuments —
  // normalize via ._id first so this still works whether the field is
  // populated or a raw ObjectId (getCompanyById populates all three before
  // this check runs).
  const recordUserUid = (company.user?._id ?? company.user)?.toString();
  const createdByUid = (company.createdBy?._id ?? company.createdBy)?.toString();
  const ownerUid = (company.owner?._id ?? company.owner)?.toString();
  return recordUserUid === uid || createdByUid === uid || ownerUid === uid;
};

const getCompanyById = async (req, res) => {
  try {
    const company = await Company.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    })
      .populate("user", "name")
      .populate("createdBy", "name")
      .populate("lastUpdatedBy", "name")
      .populate("owner", "name email");

    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }
    if (req.ownOnly && !isOwnedByUser(company, req.user._id)) {
      return res.status(403).json({ error: "You can only view companies you own" });
    }
    res.json(company);
  } catch (err) {
    res.status(404).json({ error: "Company not found" });
  }
};

const deleteCompany = async (req, res) => {
  try {
    const company = await Company.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    });
    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }
    if (req.ownOnly && !isOwnedByUser(company, req.user._id)) {
      return res.status(403).json({ error: "You can only delete companies you own" });
    }

    const contacts = await Contact.find({
      company: req.params.id,
      organization: req.user.organization,
    });

    await Promise.all(contacts.map((contact) => contact.deleteOne()));

    await company.deleteOne();

    res.json({ message: "Company deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const updateCompany = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      const companyPerm = req.user.permissions?.find(
        (p) => p.name.toLowerCase() === "companies",
      )?.permission;

      if (companyPerm !== "read-write" && companyPerm !== "own-only") {
        return res.status(403).json({
          error:
            "Access denied. You do not have read-write permissions for companies.",
        });
      }

      if (companyPerm === "own-only") {
        const existing = await Company.findOne({
          _id: req.params.id,
          organization: req.user.organization,
        });
        if (!existing) {
          return res.status(404).json({ error: "Company not found" });
        }
        if (!isOwnedByUser(existing, req.user._id)) {
          return res.status(403).json({ error: "You can only edit companies you own" });
        }
      }
    }

    const company = await companyService.updateCompany(req.params.id, req.user.organization, req.body, {
      lastUpdatedByUserId: req.user._id,
      profilePictureUrl: req.fileLocation,
    });

    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }

    res.json(company);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// controllers/companyController.js

const exportSelectedCompanies = async (req, res) => {
  try {
    const { selectedIds, columns } = req.body;

    if (!selectedIds || selectedIds.length === 0) {
      return res
        .status(400)
        .json({ error: "No companies selected for export" });
    }

    // 1. Fetch ALL selected companies, regardless of pagination
    const companies = await Company.find({
      _id: { $in: selectedIds },
      organization: req.user.organization, // Ensure they only export their own data
    }).lean();

    // 2. Build CSV Header Row
    // columns looks like: [{ key: 'name', label: 'Company Name', isCustomField: false }, ...]
    const headerRow = columns.map(c => `"${c.label}"`).join(",");

    // 3. Build CSV Data Rows
    const dataRows = companies.map(company => {
      return columns.map(c => {
        let val = "";
        
        if (c.isCustomField) {
          // Extract custom field value
          const field = company.additionalFields?.find(f => f.key === c.key);
          val = formatCustomFieldValue(field);
        } else {
          // Extract standard field value
          val = company[c.key] || "";
        }
        
        // Escape quotes for CSV format and convert objects/arrays to strings
        if (typeof val === 'object' && val !== null) val = JSON.stringify(val);
        val = String(val).replace(/"/g, '""');
        
        return `"${val}"`;
      }).join(",");
    });

    // 4. Combine into a single CSV string
    const csvContent = [headerRow, ...dataRows].join("\n");

    // 5. Send as a downloadable file
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="Exported_Companies.csv"');
    res.status(200).send(csvContent);

  } catch (error) {
    console.error("Export error:", error);
    res.status(500).json({ error: "Failed to export companies" });
  }
};

const mergeCompanies = async (req, res) => {
  const { primaryId } = req.params;
  const { secondaryId } = req.body;

  try {
    if (primaryId === secondaryId) {
      return res
        .status(400)
        .json({ error: "Cannot merge a company into itself" });
    }

    const primary = await Company.findOne({
      _id: primaryId,
      organization: req.user.organization,
    });
    const secondary = await Company.findOne({
      _id: secondaryId,
      organization: req.user.organization,
    });

    if (!primary || !secondary) {
      return res.status(404).json({ error: "One or both companies not found" });
    }

    // 1. Merge Standard Fields (only if primary is empty)
    const standardFields = [
      "industry",
      "address",
      "website",
      "gstin",
      "profilePicture",
    ];
    standardFields.forEach((field) => {
      if (
        (!primary[field] || primary[field].trim() === "") &&
        secondary[field]
      ) {
        primary[field] = secondary[field];
      }
    });

    // 2. Merge Social Media Fields
    const socialPlatforms = ["twitter", "linkedin", "facebook"];
    socialPlatforms.forEach((platform) => {
      if (
        (!primary.socialMedia[platform] ||
          primary.socialMedia[platform].trim() === "") &&
        secondary.socialMedia[platform]
      ) {
        primary.socialMedia[platform] = secondary.socialMedia[platform];
      }
    });

    // 3. Merge Additional Custom Fields
    if (secondary.additionalFields && secondary.additionalFields.length > 0) {
      const primaryFieldKeys = primary.additionalFields.map((f) => f.key);

      secondary.additionalFields.forEach((secField) => {
        const primFieldIndex = primaryFieldKeys.indexOf(secField.key);

        if (primFieldIndex === -1) {
          // Field doesn't exist in primary, so add it
          primary.additionalFields.push(secField);
        } else {
          // Field exists, check if it's empty
          const primField = primary.additionalFields[primFieldIndex];
          if (
            primField.value === null ||
            primField.value === undefined ||
            primField.value === ""
          ) {
            primField.value = secField.value;
          }
        }
      });
    }

    primary.lastUpdatedBy = req.user._id;

    // Save the merged fields to the primary company
    await primary.save();

    // 4. Reassign related records from Secondary to Primary
    // (Ensure you have imported these models at the top of your file)
    await Contact.updateMany({ company: secondaryId }, { company: primaryId });

    // Uncomment these as you import their models:
    await Deal.updateMany({ company: secondaryId }, { company: primaryId });
    await Meeting.updateMany({ company: secondaryId }, { company: primaryId });
    await Task.updateMany({ company: secondaryId }, { company: primaryId });

    // Reassign subsidiaries if the secondary company had any
    if (secondary.subsidiaries && secondary.subsidiaries.length > 0) {
      await Company.updateMany(
        { parentCompany: secondaryId },
        { parentCompany: primaryId },
      );
      // Filter out duplicates to avoid referencing the same child twice
      const newSubs = secondary.subsidiaries.filter(
        (subId) =>
          !primary.subsidiaries.includes(subId) &&
          subId.toString() !== primaryId,
      );
      primary.subsidiaries.push(...newSubs);
      await primary.save();
    }

    // 5. Delete the secondary company
    await secondary.deleteOne();

    res.json({ message: "Companies merged successfully", company: primary });
  } catch (error) {
    console.error("Merge error:", error);
    res.status(500).json({ error: "Failed to merge companies" });
  }
};

// Add existing company as subsidiary (child)
const addSubsidiary = async (req, res) => {
  const { id } = req.params;               // parent company ID
  const { subsidiaryId } = req.body;       // child company ID to link

  try {
    // 1. Validate both companies exist
    const parent = await Company.findById(id);
    const child = await Company.findById(subsidiaryId);

    if (!parent || !child) {
      return res.status(404).json({ message: "Company not found" });
    }

    const isOwner = parent.owner && parent.owner.toString() === req.user._id.toString();
    if (req.user.role !== "admin" && !isOwner) {
      return res.status(403).json({ message: "Only admins or the company owner can add a child company" });
    }

    if (parent.parentCompany) {
      return res.status(400).json({ message: "A child company cannot have its own child companies" });
    }

    if (child.parentCompany) {
      return res.status(400).json({ message: "That company is already a child of another company" });
    }

    if (parent.organization.toString() !== child.organization.toString()) {
      return res.status(403).json({ message: "Companies must belong to the same organization" });
    }

    // 2. Prevent self-reference and cycles (simple check)
    if (id === subsidiaryId) {
      return res.status(400).json({ message: "Cannot add a company as its own subsidiary" });
    }

    // 3. Check if already a subsidiary
    if (parent.subsidiaries.includes(subsidiaryId)) {
      return res.status(400).json({ message: "Already a subsidiary" });
    }

    // 4. Remove any existing parent from child (only one parent allowed)
    if (child.parentCompany) {
      await Company.findByIdAndUpdate(child.parentCompany, {
        $pull: { subsidiaries: subsidiaryId },
      });
    }

    // 5. Link: set child's parent + add to parent's subsidiaries
    await Company.findByIdAndUpdate(subsidiaryId, {
      parentCompany: id,
      lastUpdatedBy: req.user._id
    });

    await Company.findByIdAndUpdate(id, {
      $addToSet: { subsidiaries: subsidiaryId },
      lastUpdatedBy: req.user._id
    });

    // 6. Return updated parent with populated subsidiaries
    const updatedParent = await Company.findById(id)
      .populate('subsidiaries', 'name industry website');

    res.status(200).json({
      message: "Subsidiary added successfully",
      parent: updatedParent,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Remove subsidiary link
const removeSubsidiary = async (req, res) => {
  const { id, subsidiaryId } = req.params;

  try {
    const parent = await Company.findOne({ _id: id, organization: req.user.organization });
    if (!parent) return res.status(404).json({ message: "Parent company not found" });

    const isOwner = parent.owner && parent.owner.toString() === req.user._id.toString();
    if (req.user.role !== "admin" && !isOwner) {
      return res.status(403).json({ message: "Only admins or the company owner can remove a child company" });
    }

    // Remove from parent's subsidiaries array
    await Company.findByIdAndUpdate(id, {
      $pull: { subsidiaries: subsidiaryId },
      lastUpdatedBy: req.user._id,
    });

    // Clear child's parent reference
    await Company.findByIdAndUpdate(subsidiaryId, {
      $unset: { parentCompany: "" },
      lastUpdatedBy: req.user._id,
    });

    res.status(200).json({ message: "Subsidiary removed successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get all subsidiaries of a company
const getSubsidiaries = async (req, res) => {
  const { id } = req.params;

  try {
    const company = await Company.findOne({ _id: id, organization: req.user.organization })
      .populate('subsidiaries', 'name industry website address profilePicture');

    if (!company) return res.status(404).json({ message: "Company not found" });

    res.status(200).json(company.subsidiaries);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const getParentCompany = async (req, res) => {
  const { id } = req.params;

  try {
    const company = await Company.findOne({ _id: id, organization: req.user.organization })
      .populate('parentCompany', 'name industry website');

    if (!company) return res.status(404).json({ message: "Company not found" });

    res.status(200).json(company.parentCompany || null);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};


const toggleStarCompany = async (req, res) => {
  try {
    const company = await Company.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    });
    if (!company) return res.status(404).json({ error: "Company not found" });

    const userId = req.user._id.toString();
    const alreadyStarred = company.starredBy.some((id) => id.toString() === userId);

    if (alreadyStarred) {
      company.starredBy = company.starredBy.filter((id) => id.toString() !== userId);
    } else {
      company.starredBy.push(req.user._id);
    }
    await company.save();

    res.json({ starred: !alreadyStarred });
  } catch (error) {
    res.status(500).json({ error: "Failed to toggle star", message: error.message });
  }
};

// Sets (or clears, with ownerId: null) the Contact designated as this
// company's owner — one of this org's own User accounts (staff/admin), not
// a CRM contact. The user must belong to the same organization so a company
// can never be assigned an owner from outside it.
const setCompanyOwner = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Only admins can set a company's owner" });
    }

    const { ownerId } = req.body;

    if (ownerId) {
      const User = require("../models/User");
      const ownerUser = await User.findOne({
        _id: ownerId,
        organization: req.user.organization,
      });
      if (!ownerUser) {
        return res.status(404).json({ error: "User not found" });
      }
      if (ownerUser.role !== "staff") {
        return res.status(400).json({ error: "Company owner must be a staff user" });
      }
    }

    const company = await Company.findOneAndUpdate(
      { _id: req.params.id, organization: req.user.organization },
      { owner: ownerId || null, lastUpdatedBy: req.user._id },
      { new: true }
    ).populate("owner", "name email");

    if (!company) return res.status(404).json({ error: "Company not found" });

    res.json(company);
  } catch (error) {
    res.status(500).json({ error: "Failed to set company owner", message: error.message });
  }
};

module.exports = {
  createCompany,
  getAllCompanies,
  getCompanyById,
  deleteCompany,
  getMyCompanies,
  updateCompany,
  getAllCompaniesPaginated,
  exportSelectedCompanies,
  mergeCompanies,
  addSubsidiary,
  removeSubsidiary,
  getSubsidiaries,
  getParentCompany,
  toggleStarCompany,
  setCompanyOwner,
};
