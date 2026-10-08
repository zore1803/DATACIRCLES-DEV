const express = require("express");
const router = express.Router();
const contactController = require("../controllers/contactController");
const authMiddleware = require("../middlewares/auth");
const checkPermission = require("../middlewares/checkPermission");
const uploadMiddlewareS3 = require("../middlewares/uploadMiddlewareS3");
const restrictByPlan = require("../middlewares/restrictByPlan");
const Company = require("../models/Company");
const Contact = require("../models/Contact");
const normalizePhone = require("../utils/normalizePhone");
const { escapeRegex } = require("../utils/searchRegex");
const { CONTACT_PROTECTED_FIELDS, CONTACT_CREATE_SERVER_FIELDS } = require("../services/contactService");

// Fields a bulk-import row may never set (organization/user are assigned per row).
const IMPORT_SERVER_FIELDS = [
  ...CONTACT_PROTECTED_FIELDS,
  ...CONTACT_CREATE_SERVER_FIELDS,
  "lastUpdatedBy",
];

const requireAuth = [authMiddleware, require('../middlewares/userSync')];
const subscriptionGate = require('../middlewares/subscriptionGate');

// POST /api/contacts (Create - requires write permission)
router.post(
  "/",
  requireAuth,
  subscriptionGate,
  restrictByPlan("contacts", "write"),
  checkPermission("contacts", "read-write"),
  uploadMiddlewareS3().single("avatar"),
  contactController.createContact
);

// GET /api/contacts (Get all - requires read permission)
router.get(
  "/",
  requireAuth,
  subscriptionGate,
  restrictByPlan("contacts", "read"),
  checkPermission("contacts", "readonly"),
  contactController.getAllContacts
);

// GET /api/contacts/pagination (Paginated - requires read permission)
router.get(
  "/pagination",
  requireAuth,
  subscriptionGate,
  restrictByPlan("contacts", "read"),
  checkPermission("contacts", "readonly"),
  contactController.getAllContactsPaginated
);

// GET /api/contacts/:id (Get single - requires read permission)
router.get(
  "/:id",
  requireAuth,
  subscriptionGate,
  restrictByPlan("contacts", "read"),
  checkPermission("contacts", "readonly"),
  contactController.getContactById
);

// GET /api/contacts/company/:id (Get by company - requires read permission)
router.get(
  "/company/:id",
  requireAuth,
  subscriptionGate,
  restrictByPlan("contacts", "read"),
  checkPermission("contacts", "readonly"),
  contactController.getContactByCompanyId
);

// POST /api/contacts/:id/star (toggle starred for the current user)
router.post(
  "/:id/star",
  requireAuth,
  subscriptionGate,
  checkPermission("contacts", "readonly"),
  contactController.toggleStarContact,
);

// DELETE /api/contacts/:id (Delete - requires write permission). skipLimit:
// true — the module limit check only makes sense for creation; without it,
// an org already at/over its limit could never delete back under it, since
// deleting is itself a "write" the un-flagged check would also block.
router.delete(
  "/:id",
  requireAuth,
  subscriptionGate,
  restrictByPlan("contacts", "write", { skipLimit: true }),
  checkPermission("contacts", "read-write"),
  contactController.deleteContact
);

// PUT /api/contacts/:id/lifecycle-stage (Update lifecycle stage - requires write permission)
router.put(
  "/:id/lifecycle-stage",
  requireAuth,
  subscriptionGate,
  // restrictByPlan("contacts", "write"),
  // checkPermission("contacts", "read-write"),
  contactController.updateLifecycleStage
);

// PUT /api/contacts/:id (Full update with avatar - requires write permission).
// This is the route every frontend call site actually uses
// (QuickContactForm, BasicDetails ownership transfer, ContactFolder inline
// edits all PUT to the bare `/contacts/:id`) — without it registered, every
// one of those saves 404'd and surfaced as a generic "Failed to save
// contact" error, since axios's error body was HTML, not JSON.
router.put(
  "/:id",
  requireAuth,
  subscriptionGate,
  // restrictByPlan("contacts", "write"),
  // checkPermission("contacts", "read-write"),
  uploadMiddlewareS3().single("avatar"),
  contactController.updateContact
);

// PUT /api/contacts/update/:id — same handler, kept for any external caller
// still using this older path.
router.put(
  "/update/:id",
  requireAuth,
  subscriptionGate,
  // restrictByPlan("contacts", "write"),
  // checkPermission("contacts", "read-write"),
  uploadMiddlewareS3().single("avatar"),
  contactController.updateContact
);

// GET /api/contacts/stats/lifecycle-stages (Analytics - requires read permission)
router.get(
  "/stats/lifecycle-stages",
  requireAuth,
  subscriptionGate,
  restrictByPlan("contacts", "read"),
  checkPermission("contacts", "readonly"),
  contactController.getLifecycleStageStats
);

router.post("/:primaryId/merge", requireAuth, subscriptionGate, contactController.mergeContacts);

// POST /api/contacts/check-duplicates — given a list of {phone, email} pairs
// from a CSV about to be imported, reports which ones already exist in this
// org (matched by phone first — normalized so a country code/leading 0
// doesn't matter — then by email if no phone match) so the import UI can
// ask Merge vs. Create Duplicates before writing anything.
router.post(
  "/check-duplicates",
  requireAuth,
  subscriptionGate,
  checkPermission("contacts", "read-write"),
  async (req, res) => {
    try {
      const { contacts } = req.body;
      if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
        return res.json({ duplicates: [] });
      }

      const existing = await Contact.find({ organization: req.user.organization }).select(
        "_id name phone email"
      );
      const byPhone = new Map();
      const byEmail = new Map();
      for (const c of existing) {
        const p = normalizePhone(c.phone);
        if (p && !byPhone.has(p)) byPhone.set(p, c);
        const e = (c.email || "").trim().toLowerCase();
        if (e && !byEmail.has(e)) byEmail.set(e, c);
      }

      const duplicates = [];
      contacts.forEach((row, index) => {
        const p = normalizePhone(row.phone);
        const e = (row.email || "").trim().toLowerCase();
        let match = null;
        let matchedBy = null;
        if (p && byPhone.has(p)) {
          match = byPhone.get(p);
          matchedBy = "phone";
        } else if (e && byEmail.has(e)) {
          match = byEmail.get(e);
          matchedBy = "email";
        }
        if (match) {
          duplicates.push({
            index,
            matchedBy,
            existingId: match._id,
            existingName: match.name,
          });
        }
      });

      res.json({ duplicates });
    } catch (error) {
      console.error("Check duplicates error:", error);
      res.status(500).json({ message: "Failed to check duplicates: " + error.message });
    }
  }
);

// POST /api/contacts/bulk-import (Bulk import - requires write permission)
router.post(
  "/bulk-import",
  requireAuth,
  subscriptionGate,
  restrictByPlan("contacts", "write"),
  checkPermission("contacts", "read-write"),
  async (req, res) => {
    try {
      const { contacts, duplicateAction } = req.body;

      if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
        return res.status(400).json({ message: "No contacts data provided" });
      }

      console.log(`Processing ${contacts.length} contacts for bulk import`);

      const validContacts = [];
      const skippedContacts = [];

      for (let i = 0; i < contacts.length; i++) {
        const rawRow = contacts[i];
        const rowNumber = i + 1;

        if (!rawRow || typeof rawRow !== "object" || Array.isArray(rawRow)) {
          skippedContacts.push({ row: rowNumber, contact: rawRow, reason: "Row is not a contact object" });
          continue;
        }

        // Tenant / authorship / identity / audit fields are server-controlled;
        // organization and user are set below.
        const contact = { ...rawRow };
        IMPORT_SERVER_FIELDS.forEach((f) => delete contact[f]);

        if (typeof contact.name !== "string" || contact.name.trim() === '') {
          skippedContacts.push({
            row: rowNumber,
            contact: contact,
            reason: "Missing required field: Name",
          });
          continue;
        }

        if (contact.company) {
          if (typeof contact.company !== "string") {
            skippedContacts.push({ row: rowNumber, contact: contact, reason: "Invalid company" });
            continue;
          }
          // Perform case-insensitive company name search within the same organization
          const company = await Company.findOne({
            name: { $regex: `^${escapeRegex(contact.company.trim())}$`, $options: 'i' },
            organization: req.user.organization,
          });

          if (!company) {
            skippedContacts.push({
              row: rowNumber,
              contact: contact,
              reason: `Company "${contact.company}" not found in your organization`,
            });
            continue;
          }

          contact.company = company._id;
        } else {
          contact.company = null;
        }

        // Set user and organization
        contact.user = req.user._id;
        contact.organization = req.user.organization;
        validContacts.push(contact);
      }

      if (validContacts.length === 0) {
        return res.status(400).json({
          message: "No valid contacts to import",
          imported: 0,
          total: contacts.length,
          skipped: skippedContacts.length,
          errors: skippedContacts.map(skip => `Row ${skip.row}: ${skip.reason}`),
        });
      }

      console.log(`Found ${validContacts.length} valid contacts to import`);

      try {
        let mergedCount = 0;
        let toInsert = validContacts;

        if (duplicateAction === "merge") {
          const existing = await Contact.find({ organization: req.user.organization }).select(
            "_id name phone email"
          );
          const byPhone = new Map();
          const byEmail = new Map();
          for (const c of existing) {
            const p = normalizePhone(c.phone);
            if (p && !byPhone.has(p)) byPhone.set(p, c);
            const e = (c.email || "").trim().toLowerCase();
            if (e && !byEmail.has(e)) byEmail.set(e, c);
          }

          toInsert = [];
          for (const incoming of validContacts) {
            const p = normalizePhone(incoming.phone);
            const e = (incoming.email || "").trim().toLowerCase();
            const match = (p && byPhone.get(p)) || (e && byEmail.get(e)) || null;

            if (!match) {
              toInsert.push(incoming);
              continue;
            }

            // Fill blanks only — never overwrite a value the existing
            // record already has, per the chosen merge behavior.
            const existingDoc = await Contact.findById(match._id);
            const updates = {};
            for (const [key, value] of Object.entries(incoming)) {
              if (["name", "organization", "user"].includes(key)) continue;
              const isEmptyOnExisting =
                existingDoc[key] === undefined || existingDoc[key] === null || existingDoc[key] === "";
              if (isEmptyOnExisting && value !== undefined && value !== null && value !== "") {
                updates[key] = value;
              }
            }
            if (Object.keys(updates).length > 0) {
              await Contact.findByIdAndUpdate(match._id, { $set: updates });
            }
            mergedCount++;
          }
        }

        // Use insertMany for bulk insertion
        const results =
          toInsert.length > 0
            ? await Contact.insertMany(toInsert, { ordered: false, rawResult: false })
            : [];

        console.log(`Successfully imported ${results.length} contacts, merged ${mergedCount}`);

        const response = {
          message:
            mergedCount > 0
              ? `Imported ${results.length} new contacts, merged ${mergedCount} existing`
              : `Successfully imported ${results.length} contacts`,
          imported: results.length,
          merged: mergedCount,
          total: contacts.length,
          skipped: skippedContacts.length,
        };

        if (skippedContacts.length > 0) {
          response.warnings = skippedContacts.map(skip => `Row ${skip.row}: ${skip.reason}`);
          response.message += `. ${skippedContacts.length} contacts were skipped.`;
        }

        res.json(response);
      } catch (error) {
        // Handle partial success in insertMany
        if (error.name === 'BulkWriteError' || error.name === 'MongoBulkWriteError') {
          const successCount = error.result?.insertedCount || 0;
          const errorCount = error.writeErrors ? error.writeErrors.length : 0;

          console.log(`Partial success: ${successCount} imported, ${errorCount} failed`);

          const detailedErrors = error.writeErrors?.slice(0, 10).map((err, index) =>
            `Row ${err.index + 1}: ${err.errmsg || 'Database error'}`
          ) || [];

          res.json({
            message: `Imported ${successCount} contacts, ${errorCount} failed`,
            imported: successCount,
            total: contacts.length,
            skipped: skippedContacts.length,
            errors: [...skippedContacts.map(skip => `Row ${skip.row}: ${skip.reason}`), ...detailedErrors],
            warnings: skippedContacts.length > 0 ? skippedContacts.map(skip => `Row ${skip.row}: ${skip.reason}`) : undefined,
          });
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error('Bulk import error:', error);
      res.status(500).json({
        message: "Failed to import contacts: " + error.message,
        imported: 0,
        total: 0,
        errors: [error.message],
      });
    }
  }
);

router.post(
  "/export-selected",
  requireAuth,
  subscriptionGate,
  contactController.exportSelectedContacts,
);

module.exports = router;
