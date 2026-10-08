const express = require("express");
const router = express.Router();
const companyController = require("../controllers/companyController");
const authMiddleware = require("../middlewares/auth");
const checkPermission = require("../middlewares/checkPermission");
const uploadMiddlewareS3 = require("../middlewares/uploadMiddlewareS3");
const restrictByPlan = require("../middlewares/restrictByPlan");
const stripDollarKeys = require("../middlewares/stripDollarKeys");
const { gstinError } = require("../utils/gstinValidation");
const Company = require("../models/Company");
const Subscription = require("../models/Subscription");
const PlanConfig = require("../models/PlanConfig");

const requireAuth = [authMiddleware, require("../middlewares/userSync")];
const subscriptionGate = require('../middlewares/subscriptionGate');

// POST /api/companies (Create with profile picture)
router.post(
  "/",
  requireAuth,
  subscriptionGate,
  restrictByPlan("companies", "write"),
  checkPermission("Companies", "read-write"),
  uploadMiddlewareS3().single("profilePicture"),
  stripDollarKeys, // multipart bodies are parsed here, after the global JSON-body strip
  companyController.createCompany,
);

// PUT /api/companies/:id (Update with profile picture)
router.put(
  "/:id",
  requireAuth,
  subscriptionGate,
  // restrictByPlan("companies", "write"),
  // checkPermission("Companies", "read-write"),
  uploadMiddlewareS3().single("profilePicture"),
  stripDollarKeys,
  companyController.updateCompany,
);

// GET /api/companies (Get all)
router.get(
  "/",
  requireAuth,
  subscriptionGate,
  restrictByPlan("companies", "read"),
  checkPermission("Companies", "readonly"),
  companyController.getAllCompanies,
);

// GET /api/companies/pagination (Paginated)
router.get(
  "/pagination",
  requireAuth,
  subscriptionGate,
  restrictByPlan("companies", "read"),
  checkPermission("Companies", "readonly"),
  companyController.getAllCompaniesPaginated,
);

// GET /api/companies/:id (Get by ID)
router.get(
  "/:id",
  requireAuth,
  subscriptionGate,
  restrictByPlan("companies", "read"),
  checkPermission("Companies", "readonly"),
  companyController.getCompanyById,
);

// POST /api/companies/:id/star (toggle starred for the current user)
router.post(
  "/:id/star",
  requireAuth,
  subscriptionGate,
  checkPermission("Companies", "readonly"),
  companyController.toggleStarCompany,
);

// PATCH /api/companies/:id/owner (assign/clear the company's owning contact)
router.patch(
  "/:id/owner",
  requireAuth,
  subscriptionGate,
  checkPermission("Companies", "read-write"),
  companyController.setCompanyOwner,
);

// DELETE /api/companies/:id
// skipLimit: true — an org already at/over its limit must still be able to
// delete back under it; the un-flagged limit check treats delete the same
// as create and would otherwise block it too.
router.delete(
  "/:id",
  requireAuth,
  subscriptionGate,
  restrictByPlan("companies", "write", { skipLimit: true }),
  checkPermission("Companies", "read-write"),
  companyController.deleteCompany,
);

router.post("/:primaryId/merge", requireAuth, subscriptionGate, companyController.mergeCompanies);

// routes/company.js
router.post('/:id/add-subsidiary', requireAuth, subscriptionGate, companyController.addSubsidiary);
router.delete('/:id/remove-subsidiary/:subsidiaryId', requireAuth, subscriptionGate, companyController.removeSubsidiary);
router.get('/:id/subsidiaries', requireAuth, subscriptionGate, companyController.getSubsidiaries);
router.get("/:id/parent", requireAuth, subscriptionGate, companyController.getParentCompany);

// POST /api/companies/check-duplicates — given a list of names from a CSV
// about to be imported, reports which ones already exist in this org (exact
// match, case-insensitive) so the import UI can ask Merge vs. Create
// Duplicates before actually writing anything.
router.post(
  "/check-duplicates",
  requireAuth,
  subscriptionGate,
  checkPermission("Companies", "read-write"),
  async (req, res) => {
    try {
      const { names } = req.body;
      if (!names || !Array.isArray(names) || names.length === 0) {
        return res.json({ duplicates: [] });
      }

      const trimmedNames = names.map((n) => String(n || "").trim()).filter(Boolean);
      const existing = await Company.find({
        organization: req.user.organization,
        name: {
          $in: trimmedNames.map(
            (n) => new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")
          ),
        },
      }).select("_id name");

      const existingByLowerName = new Map(existing.map((c) => [c.name.toLowerCase(), c]));
      const duplicates = trimmedNames
        .filter((n) => existingByLowerName.has(n.toLowerCase()))
        .map((n) => {
          const match = existingByLowerName.get(n.toLowerCase());
          return { name: n, existingId: match._id, existingName: match.name };
        });

      res.json({ duplicates });
    } catch (error) {
      console.error("Check duplicates error:", error);
      res.status(500).json({ message: "Failed to check duplicates: " + error.message });
    }
  }
);

// POST /api/companies/bulk-import
router.post(
  "/bulk-import",
  requireAuth,
  subscriptionGate,
  restrictByPlan("companies", "write"),
  checkPermission("Companies", "read-write"),
  async (req, res) => {
    try {
      const { companies, template, duplicateAction } = req.body;

      if (!companies || !Array.isArray(companies) || companies.length === 0) {
        return res.status(400).json({ message: "No companies data provided" });
      }

      console.log(`Processing ${companies.length} companies for bulk import`);

      // Fetch subscription and plan
      const subscription = await Subscription.findOne({
        organization: req.user.organization,
      });
      if (!subscription) {
        return res.status(403).json({ error: "No active subscription found" });
      }

      const plan = await PlanConfig.findOne({ planId: subscription.planName });
      if (!plan) {
        return res.status(500).json({ error: "Plan configuration not found" });
      }

      // Check per-user record limit
      const userCount = await Company.countDocuments({
        organization: req.user.organization,
        user: req.user._id,
      });
      const userLimit = plan.features.recordsLimit;
      if (userCount + companies.length > userLimit) {
        return res.status(403).json({
          error: `Per-user record limit exceeded (${userLimit} records for user ${req.user._id})`,
        });
      }

      const validCompanies = [];
      const skippedCompanies = [];

      companies.forEach((company, index) => {
        const rowNumber = index + 1;
        if (!company.name || company.name.trim() === "") {
          skippedCompanies.push({
            row: rowNumber,
            company,
            reason: "Missing required field: Name",
          });
          return;
        }
        const gstin = String(company.gstin || "").trim().toUpperCase();
        const gstinProblem = gstin ? gstinError(gstin) : "";
        if (gstinProblem) {
          skippedCompanies.push({ row: rowNumber, company, reason: gstinProblem });
          return;
        }
        validCompanies.push({
          ...company,
          gstin,
          organization: req.user.organization,
          user: req.user._id,
        });
      });

      if (validCompanies.length === 0) {
        return res.status(400).json({
          message: "No valid companies to import",
          imported: 0,
          total: companies.length,
          skipped: skippedCompanies.length,
          errors: skippedCompanies.map(
            (skip) => `Row ${skip.row}: ${skip.reason}`,
          ),
        });
      }

      console.log(`Found ${validCompanies.length} valid companies to import`);

      try {
        let mergedCount = 0;
        let toInsert = validCompanies;

        if (duplicateAction === "merge") {
          // Resolve every row's name against an existing company in one query
          // instead of one findOne per row.
          const existingCompanies = await Company.find({
            organization: req.user.organization,
            name: {
              $in: validCompanies.map(
                (c) => new RegExp(`^${c.name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")
              ),
            },
          });
          const existingByLowerName = new Map(
            existingCompanies.map((c) => [c.name.toLowerCase(), c])
          );

          toInsert = [];
          for (const incoming of validCompanies) {
            const existing = existingByLowerName.get(incoming.name.trim().toLowerCase());
            if (!existing) {
              toInsert.push(incoming);
              continue;
            }

            // Fill blanks only — never overwrite a value the existing record
            // already has, per the user's chosen merge behavior.
            const updates = {};
            for (const [key, value] of Object.entries(incoming)) {
              if (["name", "organization", "user"].includes(key)) continue;
              const isEmptyOnExisting =
                existing[key] === undefined || existing[key] === null || existing[key] === "";
              if (isEmptyOnExisting && value !== undefined && value !== null && value !== "") {
                updates[key] = value;
              }
            }
            if (Object.keys(updates).length > 0) {
              await Company.findByIdAndUpdate(existing._id, { $set: updates });
            }
            mergedCount++;
          }
        }

        const results =
          toInsert.length > 0
            ? await Company.insertMany(toInsert, { ordered: false, rawResult: false })
            : [];

        console.log(`Successfully imported ${results.length} companies, merged ${mergedCount}`);

        const response = {
          message:
            mergedCount > 0
              ? `Imported ${results.length} new companies, merged ${mergedCount} existing`
              : `Successfully imported ${results.length} companies`,
          imported: results.length,
          merged: mergedCount,
          total: companies.length,
          skipped: skippedCompanies.length,
        };

        if (skippedCompanies.length > 0) {
          response.warnings = skippedCompanies.map(
            (skip) => `Row ${skip.row}: ${skip.reason}`,
          );
          response.message += `. ${skippedCompanies.length} companies were skipped.`;
        }

        res.json(response);
      } catch (error) {
        if (
          error.name === "BulkWriteError" ||
          error.name === "MongoBulkWriteError"
        ) {
          const successCount = error.result?.insertedCount || 0;
          const errorCount = error.writeErrors ? error.writeErrors.length : 0;

          console.log(
            `Partial success: ${successCount} imported, ${errorCount} failed`,
          );

          res.json({
            message: `Imported ${successCount} companies, ${errorCount} failed`,
            imported: successCount,
            total: companies.length,
            skipped: skippedCompanies.length,
            errors: [
              ...skippedCompanies.map(
                (skip) => `Row ${skip.row}: ${skip.reason}`,
              ),
              ...(error.writeErrors
                ?.slice(0, 5)
                .map(
                  (err, idx) =>
                    `Row ${err.index + 1}: ${err.errmsg || "Database error"}`,
                ) || []),
            ],
          });
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error("Bulk import error:", error);
      res.status(500).json({
        message: "Failed to import companies: " + error.message,
      });
    }
  },
);

router.post(
  "/export-selected",
  requireAuth,
  subscriptionGate,
  companyController.exportSelectedCompanies,
);

module.exports = router;
