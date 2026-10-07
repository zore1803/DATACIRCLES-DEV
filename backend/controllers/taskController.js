const mongoose = require("mongoose");
const { buildFuzzySearchPattern } = require('../utils/searchRegex');
const { parseDateRangeFilter, parseAdvancedFiltersParam } = require("../utils/dateRangeFilter");
const Task = require("../models/Task");
const User = require("../models/User");
const Company = require("../models/Company");
const Contact = require("../models/Contact");
const Deal = require("../models/Deal");
const Vendor = require("../models/Vendor");
const sendGridMail = require("../utils/sendGridMail");
const NotificationSettings = require("../models/NotificationSettings");
const { processAdditionalFields } = require("../services/fieldCoercionService");
const { renderEmail } = require("../utils/emailLayout");

// Shared builder for the "task assigned" notification email so the create
// and update paths stay identical.
function buildTaskAssignedEmail(recipientName, taskDoc, relatedNames) {
  const dueDate = taskDoc.dueDate
    ? new Date(taskDoc.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : "Not set";
  return renderEmail({
    greetingName: recipientName || null,
    intro: "You have been assigned a task in DataCircles. The details are below.",
    blocks: [
      {
        rows: [
          { label: "Task", value: taskDoc.title },
          { label: "Due date", value: dueDate },
          { label: "Description", value: taskDoc.description || "N/A" },
          relatedNames ? { label: "Related to", value: relatedNames } : null,
        ],
      },
    ],
    closingHtml: '<p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#333333;">Open the task in DataCircles to review it or update its status.</p>',
    preheader: `You've been assigned a task: ${taskDoc.title}`,
  });
}

// Parses a search term as a calendar date so free-text search can match the
// "Due Date" column, which the UI renders as D/M/YYYY (toLocaleDateString).
// Accepts "D/M/YYYY", "YYYY-MM-DD", and anything else the Date constructor
// understands; returns the UTC start/end-of-day range, or null if it isn't
// date-like.
const parseSearchAsDayRange = (search) => {
  const trimmed = (search || "").trim();
  if (!trimmed) return null;

  let date = null;
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, d, m, y] = slashMatch;
    const candidate = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    if (!Number.isNaN(candidate.getTime())) date = candidate;
  } else {
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) date = parsed;
  }

  if (!date) return null;

  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
  return { $gte: start, $lte: end };
};

// A user with own-only permission may only touch tasks they're assigned to
// (users array) or created — shared by getAllTask/getAllTasksPaginated/
// updateTask/updateTaskStatus/deleteTask.
const isTaskOwnedByUser = (task, userId) => {
  const uid = userId.toString();
  const inUsers = (task.users || []).some((u) => u?.toString() === uid);
  return inUsers || task.createdBy?.toString() === uid;
};

const createTask = async (req, res) => {
  try {
    let assignedUsers = [];

    if (req.body.users && req.body.users.length > 0) {
      // Verify all assigned users belong to the same organization
      const users = await User.find({
        _id: { $in: req.body.users },
        organization: req.user.organization,
      });

      if (users.length !== req.body.users.length) {
        return res
          .status(400)
          .json({ message: "Some users do not belong to your organization" });
      }

      assignedUsers = req.body.users;
    } else {
      assignedUsers = [req.user.id];
    }

    // Validate relatedEntities array
    if (!req.body.relatedEntities || req.body.relatedEntities.length === 0) {
      return res
        .status(400)
        .json({ message: "At least one related entity is required" });
    }

    // Validate each entity in relatedEntities belongs to the organization
    for (const entity of req.body.relatedEntities) {
      if (!entity.entityId || !entity.entityModel) {
        return res.status(400).json({
          message: "Each related entity must have entityId and entityModel",
        });
      }

      let relatedEntity;
      switch (entity.entityModel) {
        case "Company":
          relatedEntity = await Company.findOne({
            _id: entity.entityId,
            organization: req.user.organization,
          });
          break;
        case "Contact":
          relatedEntity = await Contact.findOne({
            _id: entity.entityId,
            organization: req.user.organization,
          });
          break;
        case "Deal":
          relatedEntity = await Deal.findOne({
            _id: entity.entityId,
            organization: req.user.organization,
          });
          break;
        case "Vendor":
          relatedEntity = await Vendor.findOne({
            _id: entity.entityId,
            organization: req.user.organization,
          });
          break;
        default:
          return res
            .status(400)
            .json({ message: `Invalid entity model: ${entity.entityModel}` });
      }

      if (!relatedEntity) {
        return res.status(404).json({
          message: `${entity.entityModel} not found in your organization`,
        });
      }
    }

    // Validate Deal and Vendor appear only once
    const entityModels = req.body.relatedEntities.map((e) => e.entityModel);
    const dealCount = entityModels.filter((m) => m === "Deal").length;
    const vendorCount = entityModels.filter((m) => m === "Vendor").length;

    if (dealCount > 1) {
      return res
        .status(400)
        .json({ message: "Only one Deal can be associated with a task" });
    }
    if (vendorCount > 1) {
      return res
        .status(400)
        .json({ message: "Only one Vendor can be associated with a task" });
    }

    const normalizeDate = (date) => {
      if (!date) return null;
      const d = new Date(date);
      return new Date(
        Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0)
      );
    };

    const taskData = {
      ...req.body,
      dueDate: normalizeDate(req.body.dueDate),
      selectedDate: normalizeDate(req.body.selectedDate),
      users: assignedUsers,
      createdBy: req.user.id,
      organization: req.user.organization,
    };

    // Coerce against the org's TaskFields definitions (number -> Number,
    // dropdown/text -> String, etc) — same treatment Contact/Company/Vendor
    // give their additionalFields on write.
    if (req.body.additionalFields) {
      taskData.additionalFields = await processAdditionalFields(
        "task",
        req.body.additionalFields,
        req.user.organization
      );
    }

    const task = await Task.create(taskData);

    // Populate the relatedEntities
    await task.populate("relatedEntities.entityId");
    await task.populate("users", "name email role profileUrl userData.mainData.profilePic");
    await task.populate("createdBy", "name email");

    // Get related entity names for email
    const relatedNames = task.relatedEntities
      .map((e) => {
        const entity = e.entityId;
        const name = entity.name || entity.title || "N/A";
        return `${e.entityModel}: ${name}`;
      })
      .join(", ");

    // Fetch notification settings for assigned users with task notifications enabled
    const notificationUsers = await NotificationSettings.find({
      userId: { $in: assignedUsers },
      organization: req.user.organization,
      tasks: true,
    }).select("userId");

    const notificationUserIds = notificationUsers.map((n) =>
      n.userId.toString()
    );

    // Send emails to assigned users who have task notification enabled
    const usersData = await User.find({ _id: { $in: notificationUserIds } });

    for (const u of usersData) {
      sendGridMail({
        to: u.email,
        subject: `You've been assigned a task: "${task.title}"`,
        text: `You've been assigned a task in DataCircles. Task: ${task.title}. Due: ${
          task.dueDate ? new Date(task.dueDate).toLocaleDateString("en-IN") : "not set"
        }.`,
        html: buildTaskAssignedEmail(u.name, task, relatedNames),
      });
    }

    res.status(201).json(task);
  } catch (err) {
    console.error("Create task error:", err);
    res.status(500).json({ message: err.message });
  }
};

const getAllTask = async (req, res) => {
  try {
    const { search } = req.query;
    let query = { organization: req.user.organization };

    if (search) {
      query.$or = [
        { title: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { description: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { status: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
      ];
    }

    // own-only: restrict to tasks this user is assigned to or created.
    if (req.ownOnly) {
      const ownFilter = { $or: [{ users: req.user._id }, { createdBy: req.user._id }] };
      if (query.$or) {
        query = { organization: query.organization, $and: [{ $or: query.$or }, ownFilter] };
      } else {
        Object.assign(query, ownFilter);
      }
    }

    const tasks = await Task.find(query)
      .populate("relatedEntities.entityId")
      .populate("users", "name email role profileUrl userData.mainData.profilePic")
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 });

    const userId = req.user._id.toString();
    const tasksWithStar = tasks.map((t) => {
      const obj = t.toObject();
      return {
        ...obj,
        isStarred: (t.starredBy || []).some((id) => id.toString() === userId),
      };
    });

    res.json(tasksWithStar);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const toggleStarTask = async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    });
    if (!task) return res.status(404).json({ error: "Task not found" });

    const userId = req.user._id.toString();
    const alreadyStarred = task.starredBy.some((id) => id.toString() === userId);

    if (alreadyStarred) {
      task.starredBy = task.starredBy.filter((id) => id.toString() !== userId);
    } else {
      task.starredBy.push(req.user._id);
    }
    await task.save();

    res.json({ starred: !alreadyStarred });
  } catch (error) {
    res.status(500).json({ error: "Failed to toggle star", message: error.message });
  }
};

const getAllTasksPaginated = async (req, res) => {
  try {
    // Pagination
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;

    // Filters & Sorting
    const {
      search,
      status,
      user,
      dueDate,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    // Base query - always filter by organization
    let query = { organization: req.user.organization };

    // Search across every column shown in the Tasks list view: title/
    // description live on the Task doc itself, but "Related To", "Company"
    // and "Assigned Users" are populated refs, so also resolve which
    // Companies/Contacts/Deals/Vendors/Users match the term and match tasks
    // that point at any of them.
    if (search) {
      const searchRegex = { $regex: buildFuzzySearchPattern(search), $options: "i" };
      const orgFilter = { organization: req.user.organization };

      const [matchingCompanies, matchingContacts, matchingDeals, matchingVendors, matchingUsers] =
        await Promise.all([
          Company.find({ ...orgFilter, name: searchRegex }).select("_id"),
          Contact.find({ ...orgFilter, name: searchRegex }).select("_id"),
          Deal.find({ ...orgFilter, title: searchRegex }).select("_id"),
          Vendor.find({ ...orgFilter, name: searchRegex }).select("_id"),
          User.find({ ...orgFilter, name: searchRegex }).select("_id"),
        ]);

      const entityIds = [
        ...matchingCompanies,
        ...matchingContacts,
        ...matchingDeals,
        ...matchingVendors,
      ].map((doc) => doc._id);
      const userIds = matchingUsers.map((doc) => doc._id);
      const dueDateRange = parseSearchAsDayRange(search);

      query.$or = [
        { title: searchRegex },
        { description: searchRegex },
        { status: searchRegex },
        ...(entityIds.length ? [{ relatedTo: { $in: entityIds } }, { "relatedEntities.entityId": { $in: entityIds } }] : []),
        ...(userIds.length ? [{ users: { $in: userIds } }] : []),
        ...(dueDateRange ? [{ dueDate: dueDateRange }] : []),
      ];
    }

    // Status filter
    if (status) {
      query.status = status;
    }

    // User filter (Assigned To)
    if (user) {
      query.users = user; // MongoDB will match if user ID is in the array
    }

    // Due Date filter (exact date match - midnight UTC)
    if (dueDate) {
      const start = new Date(dueDate);
      start.setUTCHours(0, 0, 0, 0);
      const end = new Date(dueDate);
      end.setUTCHours(23, 59, 59, 999);

      query.dueDate = { $gte: start, $lte: end };
    }

    // Advanced filters (global Tasks page filter panel). Each rule is ANDed.
    // Due Date arrives pre-resolved to a from/to range by the browser — see
    // utils/dateRangeFilter.js — so presets match the individual Tasks tab.
    const advancedRules = parseAdvancedFiltersParam(req.query.advancedFilters);
    if (advancedRules === null) {
      return res.status(400).json({ error: "Invalid advancedFilters" });
    }
    const advancedConditions = [];
    const ENTITY_MODELS = { company: "Company", contact: "Contact", deal: "Deal" };
    const isId = (v) => typeof v === "string" && mongoose.Types.ObjectId.isValid(v);
    advancedRules.forEach((rule) => {
      if (!rule || !rule.column) return;
      const negate = rule.operator === "is_not";
      switch (rule.column) {
        case "dueDate": {
          const { range, excludeCompleted } = parseDateRangeFilter(rule);
          if (range) advancedConditions.push({ dueDate: range });
          if (range && excludeCompleted) advancedConditions.push({ status: { $ne: "Completed" } });
          break;
        }
        case "status":
        case "priority":
          if (rule.value) {
            advancedConditions.push({ [rule.column]: negate ? { $ne: rule.value } : rule.value });
          }
          break;
        case "assignee":
          if (isId(rule.value)) {
            advancedConditions.push({ users: negate ? { $ne: rule.value } : rule.value });
          }
          break;
        case "company":
        case "contact":
        case "deal":
          if (isId(rule.value)) {
            const link = {
              $elemMatch: { entityId: rule.value, entityModel: ENTITY_MODELS[rule.column] },
            };
            advancedConditions.push({ relatedEntities: negate ? { $not: link } : link });
          }
          break;
        default:
          break;
      }
    });
    if (advancedConditions.length > 0) {
      query.$and = query.$and ? [...query.$and, ...advancedConditions] : advancedConditions;
    }

    // own-only: restrict to tasks this user is assigned to or created.
    if (req.ownOnly) {
      const ownFilter = { $or: [{ users: req.user._id }, { createdBy: req.user._id }] };
      query.$and = query.$and ? [...query.$and, ownFilter] : [ownFilter];
    }

    // Sorting
    const sortObj = {};
    sortObj[sortBy] = sortOrder === "desc" ? -1 : 1;

    // "Select All" support: return every matching task's _id (ignoring
    // pagination) so the frontend can select all rows across every page,
    // not just the current page's 50.
    if (req.query.allIds === "true") {
      const allTasks = await Task.find(query).select("_id").lean();
      return res.json({ ids: allTasks.map((t) => t._id) });
    }

    // Execute
    const [tasks, totalCount] = await Promise.all([
      Task.find(query)
        .populate("relatedEntities.entityId")
        .populate("users", "name email role profileUrl userData.mainData.profilePic")
        .populate("createdBy", "name email")
        .skip(skip)
        .limit(limit)
        .sort(sortObj)
        .lean()
        .select("-__v"),
      Task.countDocuments(query),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      tasks,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        nextPage: page < totalPages ? page + 1 : null,
        prevPage: page > 1 ? page - 1 : null,
      },
    });
  } catch (err) {
    console.error("Error fetching tasks:", err);
    res.status(500).json({
      error: "Failed to fetch tasks",
      message: err.message,
    });
  }
};

// Every org task with a due date, unpaginated — powers the Tasks & Meetings
// calendar view, which needs the whole month/week in view at once rather
// than whatever page the list happens to be on.
const getAllTasksForCalendar = async (req, res) => {
  try {
    const query = { organization: req.user.organization };

    const tasks = await Task.find(query)
      .populate("relatedEntities.entityId")
      .populate("users", "name email role profileUrl userData.mainData.profilePic")
      .sort({ dueDate: -1 })
      .lean()
      .select("-__v");

    res.json(tasks);
  } catch (err) {
    console.error("Error fetching calendar tasks:", err);
    res.status(500).json({
      error: "Failed to fetch calendar tasks",
      message: err.message,
    });
  }
};

const getMyTask = async (req, res) => {
  try {
    const { search } = req.query;
    let query = {
      users: req.user.id,
      organization: req.user.organization,
    };

    if (search) {
      query.$or = [
        { title: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { description: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { status: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
      ];
    }

    const tasks = await Task.find(query)
      .populate("relatedEntities.entityId")
      .populate("users", "name email role profileUrl userData.mainData.profilePic")
      .populate("createdBy", "name email");
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getTasksByVendor = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    });

    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    const tasks = await Task.find({
      "relatedEntities.entityId": req.params.id,
      "relatedEntities.entityModel": "Vendor",
      organization: req.user.organization,
    })
      .populate("relatedEntities.entityId")
      .populate("users", "name email role profileUrl userData.mainData.profilePic")
      .populate("createdBy", "name email");

    res.json(tasks);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getTasksByContact = async (req, res) => {
  try {
    const contact = await Contact.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    });

    if (!contact) {
      return res.status(404).json({ message: "Contact not found" });
    }

    const tasks = await Task.find({
      "relatedEntities.entityId": req.params.id,
      "relatedEntities.entityModel": "Contact",
      organization: req.user.organization,
    })
      .populate("relatedEntities.entityId")
      .populate("users", "name email role profileUrl userData.mainData.profilePic")
      .populate("createdBy", "name email");

    res.json(tasks);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getTasksByCompany = async (req, res) => {
  try {
    const company = await Company.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    });

    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    const tasks = await Task.find({
      "relatedEntities.entityId": req.params.id,
      "relatedEntities.entityModel": "Company",
      organization: req.user.organization,
    })
      .populate("relatedEntities.entityId")
      .populate("users", "name email role profileUrl userData.mainData.profilePic")
      .populate("createdBy", "name email");

    res.json(tasks);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getTasksByDeal = async (req, res) => {
  try {
    const deal = await Deal.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    });

    if (!deal) {
      return res.status(404).json({ message: "Deal not found" });
    }

    const tasks = await Task.find({
      "relatedEntities.entityId": req.params.id,
      "relatedEntities.entityModel": "Deal",
      organization: req.user.organization,
    })
      .populate("relatedEntities.entityId")
      .populate("users", "name email role profileUrl userData.mainData.profilePic")
      .populate("createdBy", "name email");

    res.json(tasks);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updateTask = async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    });

    if (!task) return res.status(404).json({ message: "Task not found" });

    if (req.ownOnly && !isTaskOwnedByUser(task, req.user._id)) {
      return res.status(403).json({ message: "You can only edit tasks you own" });
    }

    // Validate new users belong to the organization if provided
    if (req.body.users) {
      const users = await User.find({
        _id: { $in: req.body.users },
        organization: req.user.organization,
      });

      if (users.length !== req.body.users.length) {
        return res
          .status(400)
          .json({ message: "Some users do not belong to your organization" });
      }
    }

    // Validate relatedEntities if provided
    if (req.body.relatedEntities) {
      if (req.body.relatedEntities.length === 0) {
        return res
          .status(400)
          .json({ message: "At least one related entity is required" });
      }

      // Validate each entity
      for (const entity of req.body.relatedEntities) {
        if (!entity.entityId || !entity.entityModel) {
          return res.status(400).json({
            message: "Each related entity must have entityId and entityModel",
          });
        }

        let relatedEntity;
        switch (entity.entityModel) {
          case "Company":
            relatedEntity = await Company.findOne({
              _id: entity.entityId,
              organization: req.user.organization,
            });
            break;
          case "Contact":
            relatedEntity = await Contact.findOne({
              _id: entity.entityId,
              organization: req.user.organization,
            });
            break;
          case "Deal":
            relatedEntity = await Deal.findOne({
              _id: entity.entityId,
              organization: req.user.organization,
            });
            break;
          case "Vendor":
            relatedEntity = await Vendor.findOne({
              _id: entity.entityId,
              organization: req.user.organization,
            });
            break;
          default:
            return res
              .status(400)
              .json({ message: `Invalid entity model: ${entity.entityModel}` });
        }

        if (!relatedEntity) {
          return res.status(404).json({
            message: `${entity.entityModel} not found in your organization`,
          });
        }
      }

      // Validate Deal and Vendor appear only once
      const entityModels = req.body.relatedEntities.map((e) => e.entityModel);
      const dealCount = entityModels.filter((m) => m === "Deal").length;
      const vendorCount = entityModels.filter((m) => m === "Vendor").length;

      if (dealCount > 1) {
        return res
          .status(400)
          .json({ message: "Only one Deal can be associated with a task" });
      }
      if (vendorCount > 1) {
        return res
          .status(400)
          .json({ message: "Only one Vendor can be associated with a task" });
      }
    }

    const prevUsers = task.users.map((u) => u.toString());

    const updatePayload = { ...req.body };
    if (updatePayload.additionalFields) {
      updatePayload.additionalFields = await processAdditionalFields(
        "task",
        updatePayload.additionalFields,
        req.user.organization
      );
    }

    await task.updateOne(updatePayload);

    // Get updated task with populated fields
    const updatedTask = await Task.findById(req.params.id)
      .populate("relatedEntities.entityId")
      .populate("users", "name email role profileUrl userData.mainData.profilePic")
      .populate("createdBy", "name email");

    // Get related entity names for email
    const relatedNames = updatedTask.relatedEntities
      .map((e) => {
        const entity = e.entityId;
        const name = entity.name || entity.title || "N/A";
        return `${e.entityModel}: ${name}`;
      })
      .join(", ");

    // Send emails to newly assigned users who have task notification enabled
    if (req.body.users) {
      const newUsers = req.body.users.filter((u) => !prevUsers.includes(u));
      if (newUsers.length > 0) {
        const notificationUsers = await NotificationSettings.find({
          userId: { $in: newUsers },
          organization: req.user.organization,
          tasks: true,
        }).select("userId");

        const notificationUserIds = notificationUsers.map((n) =>
          n.userId.toString()
        );
        const usersData = await User.find({
          _id: { $in: notificationUserIds },
        });

        for (const u of usersData) {
          sendGridMail({
            to: u.email,
            subject: `You've been assigned a task: "${updatedTask.title}"`,
            text: `You've been assigned a task in DataCircles. Task: ${updatedTask.title}. Due: ${
              updatedTask.dueDate ? new Date(updatedTask.dueDate).toLocaleDateString("en-IN") : "not set"
            }.`,
            html: buildTaskAssignedEmail(u.name, updatedTask, relatedNames),
          });
        }
      }
    }

    res.status(200).json(updatedTask);
  } catch (err) {
    console.error("Update task error:", err);
    res.status(500).json({ message: err.message });
  }
};

const updateTaskStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ["Pending", "In Progress", "Completed"];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const existing = await Task.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    });

    if (!existing) {
      return res.status(404).json({ message: "Task not found" });
    }

    if (req.ownOnly && !isTaskOwnedByUser(existing, req.user._id)) {
      return res.status(403).json({ message: "You can only edit tasks you own" });
    }

    const task = await Task.findOneAndUpdate(
      {
        _id: req.params.id,
        organization: req.user.organization,
      },
      { status },
      { new: true }
    )
      .populate("relatedEntities.entityId")
      .populate("users", "name email role profileUrl userData.mainData.profilePic")
      .populate("createdBy", "name email");

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    res.json(task);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

const deleteTask = async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    });

    if (!task) return res.status(404).json({ message: "Task not found" });

    if (req.ownOnly && !isTaskOwnedByUser(task, req.user._id)) {
      return res.status(403).json({ message: "You can only delete tasks you own" });
    }

    await task.deleteOne();
    res.status(200).json({ message: "Task deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
exports.getTasks = async (req, res) => {
  try {
    let filter = { organization: req.user.organization };

    if (req.user.role === "staff") {
      filter = {
        ...filter,
        $or: [
          { users: req.user._id }, // tasks assigned to user
          { createdBy: req.user._id }, // tasks created by user
        ],
      };
    }

    const tasks = await Task.find(filter).populate("users createdBy");

    res.json(tasks);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getDashboardTasks = async (req, res) => {
  try {
    const userId = req.user._id;
    const organizationId = req.user.organization;
    const isAdmin = req.user.role === "admin";

    let tasks;

    if (isAdmin) {
      // Admin sees ALL TASKS in the organization
      tasks = await Task.find({ organization: organizationId }).populate(
        "assignedTo createdBy company contact deal vendor"
      );
    } else {
      // Staff sees ONLY tasks assigned to him OR created by him
      tasks = await Task.find({
        organization: organizationId,
        $or: [{ assignedTo: userId }, { createdBy: userId }],
      }).populate("assignedTo createdBy company contact deal vendor");
    }

    res.json({ tasks });
  } catch (error) {
    console.error("Dashboard tasks error:", error);
    res.status(500).json({ message: "Failed to fetch dashboard tasks" });
  }
};

module.exports = {
  createTask,
  getAllTask,
  getAllTasksPaginated,
  getAllTasksForCalendar,
  updateTask,
  updateTaskStatus,
  deleteTask,
  getMyTask,
  getTasksByVendor,
  getTasksByContact,
  getTasksByCompany,
  getTasksByDeal,
  getDashboardTasks,
  toggleStarTask,
};
