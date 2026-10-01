const { buildFuzzySearchPattern } = require('../utils/searchRegex');
// controllers/dealController.js (updated to handle field types)
const Deal = require("../models/Deal");
const Invoice = require("../models/Invoice");
const Expense = require("../models/Expense");
const DealFields = require("../models/DealFields");
const sendGridMail = require("../utils/sendGridMail");
const NotificationSettings = require("../models/NotificationSettings");
const EmailTemplate = require("../models/EmailTemplate");
const User = require("../models/User");
const Branding = require("../models/Branding");
const { renderEmail } = require("../utils/emailLayout");
const { getOwnedCompanyIds } = require("../utils/ownedCompanies");

// Mirrors companyController's isOwnedByUser, using the same `user`/`createdBy` fields
// getAllDeals' req.ownOnly filter already uses — plus: a deal under a company
// this user OWNS (Company.owner) counts as owned too, so being made a
// company's owner surfaces everything tied to it, not just deals the user
// personally created. `ownedCompanyIds` is optional (from getOwnedCompanyIds).
const isOwnedByUser = (deal, userId, ownedCompanyIds = []) => {
  const uid = userId.toString();
  // .populate("user"/"createdBy") turns these into subdocuments — normalize
  // via ._id first so this works whether the field is populated or raw.
  const ownerUid = (deal.user?._id ?? deal.user)?.toString();
  const createdByUid = (deal.createdBy?._id ?? deal.createdBy)?.toString();
  if (ownerUid === uid || createdByUid === uid) return true;

  const companyId = (deal.company?._id ?? deal.company)?.toString();
  return !!companyId && ownedCompanyIds.some((id) => id.toString() === companyId);
};

const createDeal = async (req, res) => {
  try {
    const dealData = {
      ...req.body,
      organization: req.user.organization,
      user: req.body.user || req.user._id, // Allow frontend to pass Owner
      createdBy: req.user._id, // ADDED BY
      lastUpdatedBy: req.user._id, // UPDATED BY
    };

    // Process additional fields with proper typing
    if (req.body.additionalFields) {
      const fieldDefinitions = await DealFields.findOne({
        organization: req.user.organization,
      });

      const fieldTypes = {};
      if (fieldDefinitions && fieldDefinitions.fields) {
        fieldDefinitions.fields.forEach((field) => {
          fieldTypes[field.name] = field;
        });
      }

      dealData.additionalFields = req.body.additionalFields.map((field) => {
        const fieldDef = fieldTypes[field.key];
        let processedValue = field.value;

        if (fieldDef) {
          switch (fieldDef.type) {
            case "number":
              processedValue = parseFloat(field.value) || 0;
              break;
            case "dropdown":
            case "string":
            case "text":
            default:
              processedValue = String(field.value || "");
              break;
          }
          return { key: field.key, value: processedValue, type: fieldDef.type };
        }

        return {
          key: field.key,
          value: String(field.value || ""),
          type: "text",
        };
      });
    }

    const deal = await Deal.create(dealData);

    // Populate before sending back
    await deal.populate([
      { path: "company" },
      { path: "contact" },
      { path: "user", select: "name" },
      { path: "createdBy", select: "name" },
      { path: "lastUpdatedBy", select: "name" },
    ]);

    res.status(201).json(deal);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const getAllDeals = async (req, res) => {
  try {
    const { search, contact, company } = req.query;
    let query = { organization: req.user.organization };

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

    if (contact) query.contact = contact;
    if (company) query.company = company;

    if (search) {
      preAndConditions.push({
        $or: [
          { title: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { status: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { "additionalFields.value": { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        ],
      });
    }

    if (preAndConditions.length > 0) {
      query.$and = preAndConditions;
    }

    const deals = await Deal.find(query)
      .populate("company")
      .populate("contact")
      .populate("user", "name")
      .populate("createdBy", "name")
      .populate("lastUpdatedBy", "name")
      .lean();

    const userId = req.user._id.toString();
    const dealsWithStar = deals.map((d) => {
      const { starredBy, ...rest } = d;
      return {
        ...rest,
        isStarred: (starredBy || []).some((id) => id.toString() === userId),
      };
    });

    res.json(dealsWithStar);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const toggleStarDeal = async (req, res) => {
  try {
    const deal = await Deal.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    });
    if (!deal) return res.status(404).json({ error: "Deal not found" });

    const userId = req.user._id.toString();
    const alreadyStarred = deal.starredBy.some((id) => id.toString() === userId);

    if (alreadyStarred) {
      deal.starredBy = deal.starredBy.filter((id) => id.toString() !== userId);
    } else {
      deal.starredBy.push(req.user._id);
    }
    await deal.save();

    res.json({ starred: !alreadyStarred });
  } catch (error) {
    res.status(500).json({ error: "Failed to toggle star", message: error.message });
  }
};

const getMyDeals = async (req, res) => {
  try {
    const deals = await Deal.find({
      user: req.user.id,
      organization: req.user.organization,
    })
      .populate("company")
      .populate("contact")
      .populate("user", "name")
      .populate("createdBy", "name")
      .populate("lastUpdatedBy", "name");
    res.json(deals);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getDealById = async (req, res) => {
  try {
    const deal = await Deal.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    })
      .populate("company")
      .populate("contact")
      .populate("user", "name")
      .populate("createdBy", "name")
      .populate("lastUpdatedBy", "name");

    if (!deal) {
      return res.status(404).json({ error: "Deal not found" });
    }

    if (req.ownOnly) {
      const ownedCompanyIds = await getOwnedCompanyIds(req.user._id, req.user.organization);
      if (!isOwnedByUser(deal, req.user._id, ownedCompanyIds)) {
        return res.status(403).json({ error: "You can only view deals you own" });
      }
    }

    res.json(deal);
  } catch (err) {
    res.status(404).json({ error: "Deal not found" });
  }
};

const updateDeal = async (req, res) => {
  try {
    // 1. Authorization Check
    // Manual fallback: checkPermission is commented out on the PUT /:id route, so
    // req.ownOnly is never set here — mirrors companyController.updateCompany's fallback.
    if (req.user.role !== "admin") {
      const dealPerm = req.user.permissions?.find(
        (p) => p.name.toLowerCase() === "deals",
      )?.permission;

      if (dealPerm !== "read-write" && dealPerm !== "own-only") {
        return res.status(403).json({
          error:
            "Access denied. You do not have read-write permissions for deals.",
        });
      }

      if (dealPerm === "own-only") {
        const existing = await Deal.findOne({ _id: req.params.id, organization: req.user.organization });
        if (!existing) return res.status(404).json({ error: "Deal not found" });
        const ownedCompanyIds = await getOwnedCompanyIds(req.user._id, req.user.organization);
        if (!isOwnedByUser(existing, req.user._id, ownedCompanyIds)) {
          return res.status(403).json({ error: "You can only edit deals you own" });
        }
      }
    }

    let updateData = {
      ...req.body,
      lastUpdatedBy: req.user._id, // Track who updated it
    };

    delete updateData.createdBy; // Protect immutable field

    // Process additional fields with proper typing
    if (req.body.additionalFields) {
      const fieldDefinitions = await DealFields.findOne({
        organization: req.user.organization,
      });

      const fieldTypes = {};
      if (fieldDefinitions && fieldDefinitions.fields) {
        fieldDefinitions.fields.forEach((field) => {
          fieldTypes[field.name] = field;
        });
      }

      updateData.additionalFields = req.body.additionalFields.map((field) => {
        const fieldDef = fieldTypes[field.key];
        let processedValue = field.value;

        if (fieldDef) {
          switch (fieldDef.type) {
            case "number":
              processedValue = parseFloat(field.value) || 0;
              break;
            case "dropdown":
            case "string":
            case "text":
            default:
              processedValue = String(field.value || "");
              break;
          }
          return { key: field.key, value: processedValue, type: fieldDef.type };
        }
        return {
          key: field.key,
          value: String(field.value || ""),
          type: "text",
        };
      });
    }

    const deal = await Deal.findOneAndUpdate(
      {
        _id: req.params.id,
        organization: req.user.organization,
      },
      updateData,
      { new: true, runValidators: true },
    )
      .populate("company")
      .populate("contact")
      .populate("user", "name")
      .populate("createdBy", "name")
      .populate("lastUpdatedBy", "name");

    if (!deal) {
      return res.status(404).json({ error: "Deal not found" });
    }

    res.json(deal);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const updateDealStatus = async (req, res) => {
  try {
    const { oldStatus, newStatus } = req.body;

    if (typeof oldStatus !== "string" || typeof newStatus !== "string") {
      return res
        .status(400)
        .json({ error: "oldStatus and newStatus must be provided as strings" });
    }

    // Inside updateDealStatus, replace the existing findOneAndUpdate with this:
    const deal = await Deal.findOneAndUpdate(
      {
        _id: req.params.id,
        organization: req.user.organization,
        status: oldStatus,
      },
      {
        status: newStatus,
        lastUpdatedBy: req.user._id, // Track who moved the deal!
      },
      { new: true, runValidators: true },
    )
      .populate("company")
      .populate("contact")
      .populate("user", "name")
      .populate("createdBy", "name")
      .populate("lastUpdatedBy", "name");

    if (!deal) {
      const existingDeal = await Deal.findOne({
        _id: req.params.id,
        organization: req.user.organization,
      });

      if (!existingDeal) {
        return res.status(404).json({ error: "Deal not found" });
      }

      return res.status(409).json({
        error:
          "Status has changed since last fetch. Please refresh and try again.",
        currentStatus: existingDeal.status,
      });
    }

    // Proceed only if status actually changed
    if (oldStatus !== newStatus) {
      // Sender's own company name, for the notification sign-off.
      const senderBranding = await Branding.findOne({ organization: req.user.organization })
        .sort({ updatedAt: -1 })
        .lean();
      const senderCompanyName = senderBranding?.companyName || "your account manager's company";
      const dealAmountLabel = `₹${parseInt(deal.amount || 0).toLocaleString("en-IN")}`;

      // ✅ Check for users who have notifications enabled for this transition
      const notificationSettings = await NotificationSettings.find({
        organization: req.user.organization,
        deals: true,
        dealTransitions: { $elemMatch: { from: oldStatus, to: newStatus } },
      }).select("userId");

      const notificationUserIds = notificationSettings.map((n) =>
        n.userId.toString(),
      );

      if (notificationUserIds.length > 0) {
        const usersData = await User.find({
          _id: { $in: notificationUserIds },
        });

        // ✅ STEP 1: Check for custom template
        const customTemplate = await EmailTemplate.findOne({
          organization: req.user.organization,
          type: "deal",
          "dealTransition.from": oldStatus,
          "dealTransition.to": newStatus,
        });

        for (const user of usersData) {
          let subject, htmlBody;

          if (customTemplate) {
            // ✅ STEP 2: Use custom template
            subject = customTemplate.subject;
            htmlBody = customTemplate.body
              .replace(/{{userName}}/g, user.name || "")
              .replace(/{{dealTitle}}/g, deal.title || "")
              .replace(/{{oldStatus}}/g, oldStatus)
              .replace(/{{newStatus}}/g, newStatus)
              .replace(
                /{{amount}}/g,
                `₹${parseInt(deal.amount || 0).toLocaleString()}`,
              )
              .replace(/{{companyName}}/g, deal.company?.name || "N/A")
              .replace(/{{contactName}}/g, deal.contact?.name || "N/A")
              .replace(
                /{{updatedAt}}/g,
                new Date(deal.updatedAt).toLocaleDateString(),
              )
              .replace(/<p>(<br\s*\/?>)?<\/p>/g, "") // remove empty paragraphs
              .replace(/(<br\s*\/?>){2,}/g, "<br>") // limit consecutive line breaks
              .trim();
            // Frame the org's custom template in the shared shell.
            htmlBody = renderEmail({ blocks: [{ html: htmlBody }], signOff: null, preheader: subject });
          } else {
            // ✅ STEP 3: Fallback to default HTML (internal staff copy)
            subject = `Deal "${deal.title}" moved to ${newStatus}`;
            htmlBody = renderEmail({
              greetingName: user.name || null,
              intro: `The deal <strong>${deal.title}</strong> has moved from ${oldStatus} to ${newStatus}. The details are below.`,
              blocks: [
                {
                  rows: [
                    { label: "Deal title", value: deal.title },
                    { label: "Old status", value: oldStatus },
                    { label: "New status", value: newStatus },
                    { label: "Amount", value: dealAmountLabel },
                    { label: "Company", value: deal.company?.name || "N/A" },
                    { label: "Contact", value: deal.contact?.name || "N/A" },
                    { label: "Updated at", value: new Date(deal.updatedAt).toLocaleDateString("en-IN") },
                  ],
                },
              ],
              closingHtml: '<p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#333333;">Review the updated deal and take any next steps.</p>',
              preheader: `Deal "${deal.title}" moved to ${newStatus}.`,
            });
          }

          // ✅ STEP 4: Send email to user
          await sendGridMail({
            to: user.email,
            subject,
            html: htmlBody,
          });
        }

        console.log(
          `Deal ${deal._id} updated from ${oldStatus} to ${newStatus}. Emails sent to ${notificationUserIds.length} user(s).`,
        );
      }

      // ✅ STEP 5: Send email to contact if contact exists and has email
      if (deal.contact && deal.contact.email) {
        // Check for custom template for contact
        const customTemplate = await EmailTemplate.findOne({
          organization: req.user.organization,
          type: "deal",
          "dealTransition.from": oldStatus,
          "dealTransition.to": newStatus,
        });

        let subject, htmlBody;

        if (customTemplate) {
          // Use custom template for contact
          subject = customTemplate.subject;
          htmlBody = customTemplate.body
            .replace(/{{userName}}/g, deal.contact.name || "")
            .replace(/{{dealTitle}}/g, deal.title || "")
            .replace(/{{oldStatus}}/g, oldStatus)
            .replace(/{{newStatus}}/g, newStatus)
            .replace(
              /{{amount}}/g,
              `₹${parseInt(deal.amount || 0).toLocaleString()}`,
            )
            .replace(/{{companyName}}/g, deal.company?.name || "N/A")
            .replace(/{{contactName}}/g, deal.contact?.name || "N/A")
            .replace(
              /{{updatedAt}}/g,
              new Date(deal.updatedAt).toLocaleDateString(),
            )
            .replace(/<p>(<br\s*\/?>)?<\/p>/g, "") // remove empty paragraphs
            .replace(/(<br\s*\/?>){2,}/g, "<br>") // limit consecutive line breaks
            .trim();
          // Custom template body is framed by the shared shell (we send on
          // the org's behalf); the template carries its own sign-off.
          htmlBody = renderEmail({
            blocks: [{ html: htmlBody }],
            signOff: null,
            preheader: subject,
          });
        } else {
          // Fallback default for the customer contact
          subject = `Update on ${deal.title} from ${senderCompanyName}`;
          htmlBody = renderEmail({
            greetingName: deal.contact.name || "Sir/Madam",
            intro: `There is an update on <strong>${deal.title}</strong>: it has moved from ${oldStatus} to ${newStatus}.`,
            blocks: [{ rows: [
              { label: "Deal", value: deal.title },
              { label: "Previous status", value: oldStatus },
              { label: "Current status", value: newStatus },
              { label: "Value", value: dealAmountLabel },
            ] }],
            closingHtml: '<p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#333333;">We will be in touch with the next steps. Reply to this email if you have any questions.</p>',
            signOff: senderCompanyName,
            preheader: `Update on ${deal.title} from ${senderCompanyName}`,
          });
        }

        // Send email to contact
        await sendGridMail({
          to: deal.contact.email,
          subject,
          html: htmlBody,
        });

        console.log(
          `✅ Deal ${deal._id} status change notification sent to contact: ${deal.contact.email}`,
        );
      }
    }

    res.json(deal);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const deleteDeal = async (req, res) => {
  try {
    const deal = await Deal.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    });

    if (!deal) {
      return res.status(404).json({ error: "Deal not found" });
    }

    if (req.ownOnly) {
      const ownedCompanyIds = await getOwnedCompanyIds(req.user._id, req.user.organization);
      if (!isOwnedByUser(deal, req.user._id, ownedCompanyIds)) {
        return res.status(403).json({ error: "You can only delete deals you own" });
      }
    }

    const invoices = await Invoice.find({
      deal: req.params.id,
      organization: req.user.organization,
    });

    await Promise.all(invoices.map((inv) => inv.deleteOne()));

    // Expenses / Indirect Income are standalone financial records: they
    // survive the Deal and are simply unlinked from it.
    await Expense.updateMany(
      { deal: deal._id, organization: req.user.organization },
      { $set: { deal: null } },
    );

    await deal.deleteOne();
    res.json({ message: "Deal deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getDeals = async (req, res) => {
  try {
    let filter = { organization: req.user.organization };
    if (req.user.role === "staff") { filter.user = req.user._id; }

    const deals = await Deal.find(filter)
      .populate("contact")
      .populate("company")
      .populate("user", "name")
      .populate("createdBy", "name")
      .populate("lastUpdatedBy", "name");

    res.json(deals);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getDashboardDeals = async (req, res) => {
  try {
    let filter = { organization: req.user.organization };
    if (req.user.role === "staff") { filter.user = req.user._id; }

    const deals = await Deal.find(filter)
      .populate("company")
      .populate("contact")
      .populate("user", "name")
      .populate("createdBy", "name")
      .populate("lastUpdatedBy", "name");

    res.json(deals);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const exportSelectedDeals = async (req, res) => {
  try {
    const { selectedIds, columns } = req.body;

    if (!selectedIds || selectedIds.length === 0) {
      return res.status(400).json({ error: "No deals selected for export" });
    }

    // 1. Fetch ALL selected deals
    // Populate company and contact to get their names instead of just IDs
    const deals = await Deal.find({
      _id: { $in: selectedIds },
      organization: req.user.organization,
    })
      .populate("company", "name")
      .populate("contact", "name")
      .lean();

    // 2. Build CSV Header Row
    const headerRow = columns.map((c) => `"${c.label}"`).join(",");

    // 3. Build CSV Data Rows
    const dataRows = deals.map((deal) => {
      return columns
        .map((c) => {
          let val = "";

          if (c.isCustomField) {
            const field = deal.additionalFields?.find((f) => f.key === c.key);
            val = field ? field.value : "";
          } else if (c.key === "company") {
            val = deal.company?.name || "";
          } else if (c.key === "contact") {
            val = deal.contact?.name || "";
          } else {
            val = deal[c.key] || "";
          }

          // Escape quotes for CSV format and convert objects/arrays to strings
          if (typeof val === "object" && val !== null)
            val = JSON.stringify(val);
          val = String(val).replace(/"/g, '""');

          return `"${val}"`;
        })
        .join(",");
    });

    // 4. Combine into a single CSV string
    const csvContent = [headerRow, ...dataRows].join("\n");

    // 5. Send as a downloadable file
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="Exported_Deals.csv"',
    );
    res.status(200).send(csvContent);
  } catch (error) {
    console.error("Export error:", error);
    res.status(500).json({ error: "Failed to export deals" });
  }
};

module.exports = {
  createDeal,
  getAllDeals,
  getDealById,
  updateDeal,
  getMyDeals,
  deleteDeal,
  updateDealStatus,
  getDashboardDeals,
  exportSelectedDeals,
  toggleStarDeal,
};
