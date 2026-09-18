const { buildFuzzySearchPattern } = require('../utils/searchRegex');
// controllers/contactController.js (updated to handle field types)
const Contact = require("../models/Contact");
const Company = require("../models/Company");
const Deal = require("../models/Deal");
const Meeting = require("../models/Meeting");
const Task = require("../models/Task");
const contactService = require("../services/contactService");
const {
  isValidStage,
  isValidCombination,
  stageForStatus,
  defaultStatusForStage,
  invalidCombinationMessage,
} = require("../constants/contactLifecycle");
const { getOwnedCompanyIds } = require("../utils/ownedCompanies");

// Mirrors companyController's isOwnedByUser, using the same `user`/`createdBy` fields the
// list endpoints' req.ownOnly filter already uses — plus: a contact under a
// company this user OWNS (Company.owner) counts as owned too, so being made
// a company's owner surfaces everything tied to it, not just records the
// user personally created. `ownedCompanyIds` is optional — pass it (from
// getOwnedCompanyIds) when that broader check should apply.
const isOwnedByUser = (contact, userId, ownedCompanyIds = []) => {
  const uid = userId.toString();
  // .populate("user"/"createdBy") turns these into subdocuments — normalize
  // via ._id first so this works whether the field is populated or raw.
  const ownerUid = (contact.user?._id ?? contact.user)?.toString();
  const createdByUid = (contact.createdBy?._id ?? contact.createdBy)?.toString();
  if (ownerUid === uid || createdByUid === uid) return true;

  const companyId = (contact.company?._id ?? contact.company)?.toString();
  return !!companyId && ownedCompanyIds.some((id) => id.toString() === companyId);
};

const createContact = async (req, res) => {
  try {
    const newContact = await contactService.createContact(req.user.organization, req.body, {
      actingUserId: req.user._id,
      createdByUserId: req.user._id,
      avatarUrl: req.fileLocation,
    });

    res.status(201).json(newContact);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const updateContact = async (req, res) => {
  try {
    const { id } = req.params;

    // Manual fallback: checkPermission is commented out on the PUT /update/:id route, so
    // req.ownOnly is never set here — mirrors companyController.updateCompany's fallback.
    if (req.user.role !== "admin") {
      const contactPerm = req.user.permissions?.find(
        (p) => p.name.toLowerCase() === "contacts",
      )?.permission;

      if (contactPerm !== "read-write" && contactPerm !== "own-only") {
        return res.status(403).json({
          error:
            "Access denied. You do not have read-write permissions for contacts.",
        });
      }

      if (contactPerm === "own-only") {
        const existing = await Contact.findOne({ _id: id, organization: req.user.organization });
        if (!existing) return res.status(404).json({ error: "Contact not found" });
        const ownedCompanyIds = await getOwnedCompanyIds(req.user._id, req.user.organization);
        if (!isOwnedByUser(existing, req.user._id, ownedCompanyIds)) {
          return res.status(403).json({ error: "You can only edit contacts you own" });
        }
      }
    }

    const updatedContact = await contactService.updateContact(id, req.user.organization, req.body, {
      lastUpdatedByUserId: req.user._id,
      avatarUrl: req.fileLocation,
    });

    if (!updatedContact) {
      return res.status(404).json({ error: "Contact not found" });
    }

    res.json(updatedContact);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const getAllContacts = async (req, res) => {
  try {
    const { search, lifecycleStage, stageStatus } = req.query;
    let query = { organization: req.user.organization };
    const andConditions = [];

    if (req.ownOnly) {
      const ownedCompanyIds = await getOwnedCompanyIds(req.user._id, req.user.organization);
      andConditions.push({
        $or: [
          { user: req.user._id },
          { createdBy: req.user._id },
          { company: { $in: ownedCompanyIds } },
        ],
      });
    }

    if (search) {
      const matchingCompanies = await Company.find({
        organization: req.user.organization,
        name: { $regex: buildFuzzySearchPattern(search), $options: "i" },
      }).select("_id");

      andConditions.push({
        $or: [
          { name: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { email: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { phone: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { stageStatus: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { lifecycleStage: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { "additionalFields.value": { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { company: { $in: matchingCompanies.map((c) => c._id) } },
        ],
      });
    }

    if (andConditions.length > 0) {
      query.$and = andConditions;
    }

    // Filter by lifecycle stage
    if (lifecycleStage) {
      query.lifecycleStage = lifecycleStage;
    }

    // Filter by stage status
    if (stageStatus) {
      query.stageStatus = stageStatus;
    }

    const contacts = await Contact.find(query)
      .populate("company")
      .populate("user", "name")
      .populate("createdBy", "name")
      .populate("lastUpdatedBy", "name");

    res.json(contacts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getAllContactsPaginated = async (req, res) => {
  try {
    // Pagination parameters
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 500);
    const skip = (page - 1) * limit;

    // Filter parameters - updated for lifecycle stages
    const {
      search,
      lifecycleStage,
      stageStatus,
      company,
      sortBy = "name",
      sortOrder = "asc",
      advancedFilters,
    } = req.query;

    // Build query object
    const query = { organization: req.user.organization };
    const preAndConditions = [];

    if (req.ownOnly) {
      const ownedCompanyIds = await getOwnedCompanyIds(req.user._id, req.user.organization);
      preAndConditions.push({
        $or: [
          { user: req.user._id },
          { createdBy: req.user._id },
          { company: { $in: ownedCompanyIds } },
        ],
      });
    }

    // Search functionality
    if (search) {
      const matchingCompanies = await Company.find({
        organization: req.user.organization,
        name: { $regex: buildFuzzySearchPattern(search), $options: "i" },
      }).select("_id");

      preAndConditions.push({
        $or: [
          { name: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { email: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { phone: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { stageStatus: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { lifecycleStage: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { "additionalFields.value": { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { company: { $in: matchingCompanies.map((c) => c._id) } },
        ],
      });
    }

    if (preAndConditions.length > 0) {
      query.$and = preAndConditions;
    }

    // Lifecycle stage filter
    if (lifecycleStage) {
      query.lifecycleStage = lifecycleStage;
    }

    // Stage status filter
    if (stageStatus) {
      query.stageStatus = stageStatus;
    }

    // Company filter
    if (company) {
      query.company = company;
    }

    if (advancedFilters) {
      const parsedFilters = JSON.parse(advancedFilters);
      const andConditions = [];
      // List of base string fields for Contacts
      const baseFields = [
        "name",
        "email",
        "phone",
        "lifecycleStage",
        "stageStatus",
      ];

      parsedFilters.forEach((filter) => {
        const { column, operator, value } = filter;
        if (!column || !operator) return;

        let condition = {};
        const isBaseField = baseFields.includes(column);

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

    // Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortOrder === "desc" ? -1 : 1;

    // "Select All" support: return every matching contact's _id (ignoring
    // pagination) so the frontend can select all rows across every page,
    // not just the current page.
    if (req.query.allIds === "true") {
      const allContacts = await Contact.find(query).select("_id").lean();
      return res.json({ ids: allContacts.map((c) => c._id) });
    }

    // Execute aggregation pipeline so starred contacts (per-user) always
    // sort to the top of page 1, regardless of which page they'd otherwise
    // land on.
    const userId = req.user._id;
    const [{ data: contacts, totalCountArr }] = await Contact.aggregate([
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
                from: "companies",
                localField: "company",
                foreignField: "_id",
                as: "company",
              },
            },
            { $unwind: { path: "$company", preserveNullAndEmptyArrays: true } },
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
            { $project: { __v: 0, starredBy: 0 } },
          ],
          totalCountArr: [{ $count: "count" }],
        },
      },
    ]);
    const totalCount = totalCountArr[0]?.count || 0;

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.json({
      contacts,
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
    console.error("Error fetching contacts:", error);
    res.status(500).json({
      error: "Failed to fetch contacts",
      message: error.message,
    });
  }
};

const getMyContacts = async (req, res) => {
  try {
    const contacts = await Contact.find({
      user: req.user.id,
      organization: req.user.organization,
    })
      .populate("company")
      .populate("user", "name")
      .populate("createdBy", "name")
      .populate("lastUpdatedBy", "name");
    res.json(contacts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getContactById = async (req, res) => {
  try {
    const contact = await Contact.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    })
      .populate("company")
      .populate("user", "name")
      .populate("createdBy", "name")
      .populate("lastUpdatedBy", "name");

    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }

    if (req.ownOnly) {
      const ownedCompanyIds = await getOwnedCompanyIds(req.user._id, req.user.organization);
      if (!isOwnedByUser(contact, req.user._id, ownedCompanyIds)) {
        return res.status(403).json({ error: "You can only view contacts you own" });
      }
    }

    res.json(contact);
  } catch (err) {
    res.status(404).json({ error: "Contact not found" });
  }
};

const getContactByCompanyId = async (req, res) => {
  try {
    const contacts = await Contact.find({
      company: req.params.id,
      organization: req.user.organization,
    })
      .populate("company")
      .populate("user", "name")
      .populate("createdBy", "name")
      .populate("lastUpdatedBy", "name");
    res.json(contacts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const deleteContact = async (req, res) => {
  try {
    const contact = await Contact.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    });

    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }

    if (req.ownOnly) {
      const ownedCompanyIds = await getOwnedCompanyIds(req.user._id, req.user.organization);
      if (!isOwnedByUser(contact, req.user._id, ownedCompanyIds)) {
        return res.status(403).json({ error: "You can only delete contacts you own" });
      }
    }

    await contact.deleteOne();
    res.json({ message: "Contact deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Updated method for changing lifecycle stage/status
const updateLifecycleStage = async (req, res) => {
  try {
    const { lifecycleStage, stageStatus } = req.body;

    const contact = await Contact.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    });

    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }

    // Resolve whichever half the caller omitted, then validate the pair —
    // same rules as services/contactService.js's update path, both reading
    // constants/contactLifecycle.js. A caller sending only a status (a Kanban
    // drop, a status dropdown) gets its stage derived rather than silently
    // leaving the two fields contradicting each other.
    const nextStage =
      lifecycleStage || (stageStatus ? stageForStatus(stageStatus) : contact.lifecycleStage);
    const nextStatus =
      stageStatus ||
      (lifecycleStage ? defaultStatusForStage(lifecycleStage) : contact.stageStatus);

    if (!isValidStage(nextStage)) {
      return res.status(400).json({ error: invalidCombinationMessage(nextStage, nextStatus) });
    }
    if (!isValidCombination(nextStage, nextStatus)) {
      return res.status(400).json({ error: invalidCombinationMessage(nextStage, nextStatus) });
    }

    const updateData = { lifecycleStage: nextStage, stageStatus: nextStatus };

    await contact.updateOne(updateData);
    res.json({ message: "Contact lifecycle stage updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get contacts by lifecycle stage statistics
const getLifecycleStageStats = async (req, res) => {
  try {
    const pipeline = [
      { $match: { organization: req.user.organization } },
      {
        $group: {
          _id: {
            lifecycleStage: "$lifecycleStage",
            stageStatus: "$stageStatus",
          },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: "$_id.lifecycleStage",
          statuses: {
            $push: {
              status: "$_id.stageStatus",
              count: "$count",
            },
          },
          total: { $sum: "$count" },
        },
      },
    ];

    const stats = await Contact.aggregate(pipeline);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


const exportSelectedContacts = async (req, res) => {
  try {
    const { selectedIds, columns } = req.body;

    if (!selectedIds || selectedIds.length === 0) {
      return res.status(400).json({ error: "No contacts selected for export" });
    }

    // 1. Fetch ALL selected contacts
    // Note: We populate 'company' so we can export the actual company name instead of an ID
    const contacts = await Contact.find({
      _id: { $in: selectedIds },
      organization: req.user.organization,
    })
      .populate("company")
      .lean();

    // 2. Build CSV Header Row
    const headerRow = columns.map(c => `"${c.label}"`).join(",");
    // 3. Build CSV Data Rows
    const dataRows = contacts.map(contact => {
      return columns.map(c => {
        let val = "";
        
        if (c.isCustomField) {
          const field = contact.additionalFields?.find(f => f.key === c.key);
          val = field ? field.value : "";
        } else if (c.key === 'company') {
          // Special handling for the populated company object
          val = contact.company?.name || "";
        } else {
          val = contact[c.key] || "";
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
    res.setHeader('Content-Disposition', 'attachment; filename="Exported_Contacts.csv"');
    res.status(200).send(csvContent);

  } catch (error) {
    console.error("Export error:", error);
    res.status(500).json({ error: "Failed to export contacts" });
  }
};


const mergeContacts = async (req, res) => {
  const { primaryId } = req.params;
  const { secondaryId } = req.body;

  try {
    if (primaryId === secondaryId) {
      return res
        .status(400)
        .json({ error: "Cannot merge a contact into itself" });
    }

    const primary = await Contact.findOne({
      _id: primaryId,
      organization: req.user.organization,
    });
    const secondary = await Contact.findOne({
      _id: secondaryId,
      organization: req.user.organization,
    });

    if (!primary || !secondary) {
      return res.status(404).json({ error: "One or both contacts not found" });
    }

    // 1. Merge Standard Fields (only if primary is empty)
    const standardFields = ["email", "phone", "company", "avatar"];

    standardFields.forEach((field) => {
      if (
        (!primary[field] || String(primary[field]).trim() === "") &&
        secondary[field]
      ) {
        primary[field] = secondary[field];
      }
    });

    // 2. Merge Social Media Fields
    const socialPlatforms = ["twitter", "linkedin", "instagram", "facebook", "whatsapp"];
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

    // Save the merged fields to the primary contact
    await primary.save();

    // 4. Reassign related records from Secondary to Primary
    await Deal.updateMany({ contact: secondaryId }, { contact: primaryId });
    await Meeting.updateMany({ contact: secondaryId }, { contact: primaryId });
    // Also update participants array in meetings if the secondary contact was an attendee
    await Meeting.updateMany(
      { participants: secondaryId },
      { $addToSet: { participants: primaryId } },
    );
    await Meeting.updateMany(
      { participants: secondaryId },
      { $pull: { participants: secondaryId } },
    );

    await Task.updateMany(
      { relatedTo: secondaryId, relationModel: "Contact" },
      { relatedTo: primaryId },
    );

    // 5. Delete the secondary contact
    await secondary.deleteOne();

    res.json({ message: "Contacts merged successfully", contact: primary });
  } catch (error) {
    console.error("Merge error:", error);
    res.status(500).json({ error: "Failed to merge contacts" });
  }
};


const toggleStarContact = async (req, res) => {
  try {
    const contact = await Contact.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    });
    if (!contact) return res.status(404).json({ error: "Contact not found" });

    const userId = req.user._id.toString();
    const alreadyStarred = contact.starredBy.some((id) => id.toString() === userId);

    if (alreadyStarred) {
      contact.starredBy = contact.starredBy.filter((id) => id.toString() !== userId);
    } else {
      contact.starredBy.push(req.user._id);
    }
    await contact.save();

    res.json({ starred: !alreadyStarred });
  } catch (error) {
    res.status(500).json({ error: "Failed to toggle star", message: error.message });
  }
};

module.exports = {
  createContact,
  getAllContacts,
  getContactById,
  deleteContact,
  getMyContacts,
  updateLifecycleStage,
  updateContact,
  getContactByCompanyId,
  getAllContactsPaginated,
  getLifecycleStageStats,
  exportSelectedContacts,
  mergeContacts,
  toggleStarContact,
};
