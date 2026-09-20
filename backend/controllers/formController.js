// controllers/formController.js
// Authenticated Forms management surface (Phase 1b — see FORMS_ARCHITECTURE.md §2.9). One
// controller covering Forms CRUD/publish, submissions, and duplicate reviews — deliberately not
// split into formController/builderController/submissionController/reviewController until there's
// enough real code in each to justify it (per explicit product decision — "don't split before there
// is code").
//
// Every handler is a thin adapter: validate → call an existing service (or, for simple list/create
// operations that have no dedicated service — same pattern contactController already uses — a plain
// Mongoose query) → shape the response. No business logic lives here; all of it already exists in
// formPublishService / duplicateResolutionService, built and verified in earlier phases.
const FormDefinition = require("../models/FormDefinition");
const FormVersion = require("../models/FormVersion");
const FormSubmission = require("../models/FormSubmission");
const DuplicateReview = require("../models/DuplicateReview");
const Contact = require("../models/Contact");
const Company = require("../models/Company");
const Vendor = require("../models/Vendor");
const formPublishService = require("../services/formPublishService");
const duplicateResolutionService = require("../services/duplicateResolutionService");

const RECORD_MODEL_BY_MODULE = { Contact, Company, Vendor };

// Mirrors companyController's isOwnedByUser — a form is owned if either its owner or its
// creator matches the requesting user (FormDefinition carries both fields, see §2.9 model).
const isOwnedByUser = (form, userId) => {
  const uid = userId.toString();
  return form.owner?.toString() === uid || form.createdBy?.toString() === uid;
};

// Mirrors publicFormController's error-classification approach — map known service error messages
// to the right HTTP status rather than a blanket 500. Anything unrecognized still falls through to
// 500 in the caller's catch block.
function classifyServiceError(err) {
  const msg = err.message || "";
  if (/already been resolved/i.test(msg)) return 409;
  if (/not found/i.test(msg)) return 404;
  if (/empty layout|invalid form definition|is not permitted|Unsupported module|Cannot (pause|resume)/i.test(msg)) return 400;
  return null; // unrecognized — caller decides (500)
}

function handleServiceError(res, err, fallbackMessage) {
  const status = classifyServiceError(err);
  if (status) return res.status(status).json({ error: err.message });
  console.error(fallbackMessage, err);
  return res.status(500).json({ error: fallbackMessage });
}

/**
 * GET /api/forms?page=&limit=&status=&module=&search=
 */
async function listForms(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;

    const query = { organization: req.user.organization };
    if (req.ownOnly) {
      query.$or = [{ owner: req.user._id }, { createdBy: req.user._id }];
    }
    if (req.query.status) query.status = req.query.status;
    if (req.query.module) query.module = req.query.module;
    if (req.query.search) query.title = { $regex: req.query.search, $options: "i" };

    // Advanced filters — same wire shape the Companies list uses
    // ([{ column, operator, value }] as a JSON query param), so the shared
    // AdvancedFilterPanel works here unchanged. Only whitelisted top-level
    // form fields are filterable: forms have no additionalFields array, and
    // letting an arbitrary `column` through would expose nested internals
    // (publishState, schemaHash) to query injection.
    const FILTERABLE_FIELDS = ["title", "module", "status", "description"];
    if (req.query.advancedFilters) {
      let parsedFilters = [];
      try {
        parsedFilters = JSON.parse(req.query.advancedFilters);
      } catch {
        return res.status(400).json({ error: "Invalid advancedFilters" });
      }

      const andConditions = [];
      for (const { column, operator, value } of parsedFilters) {
        if (!column || !operator || !FILTERABLE_FIELDS.includes(column)) continue;
        let clause;
        switch (operator) {
          case "is": clause = value; break;
          case "is_not": clause = { $ne: value }; break;
          case "contains": clause = { $regex: value, $options: "i" }; break;
          case "not_contains": clause = { $not: { $regex: value, $options: "i" } }; break;
          case "in": clause = { $in: Array.isArray(value) ? value : String(value).split(",").map((v) => v.trim()) }; break;
          case "not_in": clause = { $nin: Array.isArray(value) ? value : String(value).split(",").map((v) => v.trim()) }; break;
          case "is_empty": clause = { $in: [null, ""] }; break;
          case "is_not_empty": clause = { $nin: [null, ""] }; break;
          default: clause = value;
        }
        andConditions.push({ [column]: clause });
      }
      if (andConditions.length) query.$and = [...(query.$and || []), ...andConditions];
    }

    // Sorting. submissionCount is computed per page below (it isn't stored on
    // the document), so it is deliberately NOT sortable server-side — offering
    // it would sort only the current page and silently lie about the rest.
    const SORTABLE_FIELDS = ["title", "module", "status", "updatedAt", "createdAt"];
    const sortBy = SORTABLE_FIELDS.includes(req.query.sortBy) ? req.query.sortBy : "updatedAt";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

    const [forms, totalCount] = await Promise.all([
      FormDefinition.find(query).sort({ [sortBy]: sortOrder }).skip(skip).limit(limit),
      FormDefinition.countDocuments(query),
    ]);

    // One aggregation for the whole page, not N+1 — flagged in FORMS_FRONTEND_ARCHITECTURE.md §2.2
    // as a small additive gap for the Forms List table's Submissions column.
    const formIds = forms.map((f) => f._id);
    const counts = formIds.length
      ? await FormSubmission.aggregate([
          { $match: { formDefinition: { $in: formIds } } },
          { $group: { _id: "$formDefinition", count: { $sum: 1 } } },
        ])
      : [];
    const countByFormId = new Map(counts.map((c) => [String(c._id), c.count]));

    // Published version number per form, for the List table's Version column — a small additive
    // lookup (one query for the whole page), same reasoning as submissionCount above.
    const activeVersionIds = forms
      .map((f) => f.publishState?.activeFormVersionId)
      .filter(Boolean);
    const versions = activeVersionIds.length
      ? await FormVersion.find({ _id: { $in: activeVersionIds } }, { versionNumber: 1 })
      : [];
    const versionNumberById = new Map(versions.map((v) => [String(v._id), v.versionNumber]));

    const formsWithCounts = forms.map((f) => ({
      ...f.toObject(),
      submissionCount: countByFormId.get(String(f._id)) || 0,
      versionNumber: f.publishState?.activeFormVersionId
        ? versionNumberById.get(String(f.publishState.activeFormVersionId)) ?? null
        : null,
    }));

    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      forms: formsWithCounts,
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
    console.error("formController.listForms error:", err);
    res.status(500).json({ error: "Failed to list forms" });
  }
}

/**
 * POST /api/forms
 * Body: { title, module, description? }
 */
async function createForm(req, res) {
  try {
    const { title, module, description } = req.body || {};
    if (!title || typeof title !== "string") {
      return res.status(400).json({ error: "title is required" });
    }
    if (!["Contact", "Company", "Vendor"].includes(module)) {
      return res.status(400).json({ error: 'module must be one of "Contact", "Company", "Vendor"' });
    }

    const form = await FormDefinition.create({
      organization: req.user.organization,
      title,
      module,
      description,
      status: "draft",
      layout: [],
      createdBy: req.user._id,
    });

    res.status(201).json({ form });
  } catch (err) {
    console.error("formController.createForm error:", err);
    res.status(500).json({ error: "Failed to create form" });
  }
}

/**
 * GET /api/forms/:id
 */
async function getForm(req, res) {
  try {
    const form = await FormDefinition.findOne({ _id: req.params.id, organization: req.user.organization });
    if (!form) return res.status(404).json({ error: "Form not found" });

    if (req.ownOnly && !isOwnedByUser(form, req.user._id)) {
      return res.status(403).json({ error: "You can only view forms you own" });
    }

    let activeVersion = null;
    if (form.publishState.activeFormVersionId) {
      const version = await FormVersion.findById(form.publishState.activeFormVersionId, {
        versionNumber: 1,
        schemaHash: 1,
        createdAt: 1,
      });
      if (version) {
        activeVersion = { versionNumber: version.versionNumber, schemaHash: version.schemaHash, publishedAt: version.createdAt };
      }
    }

    res.json({ form, activeVersion });
  } catch (err) {
    console.error("formController.getForm error:", err);
    res.status(500).json({ error: "Failed to load form" });
  }
}

/**
 * PATCH /api/forms/:id
 * Body: { layout?, theme?, title? } — direct pass-through to formPublishService.saveDraft.
 */
async function updateForm(req, res) {
  try {
    if (req.ownOnly) {
      const existing = await FormDefinition.findOne({ _id: req.params.id, organization: req.user.organization });
      if (!existing) return res.status(404).json({ error: "Form not found" });
      if (!isOwnedByUser(existing, req.user._id)) {
        return res.status(403).json({ error: "You can only edit forms you own" });
      }
    }

    const { layout, theme, title } = req.body || {};
    const form = await formPublishService.saveDraft(req.params.id, req.user.organization, { layout, theme, title });
    res.json({ form });
  } catch (err) {
    handleServiceError(res, err, "Failed to update form");
  }
}

/**
 * POST /api/forms/:id/publish — direct pass-through to formPublishService.publishForm.
 */
async function publishForm(req, res) {
  try {
    const { formDefinition, formVersion, versionWasReused } = await formPublishService.publishForm(
      req.params.id,
      req.user.organization,
      { actorUserId: req.user._id }
    );
    res.json({
      form: formDefinition,
      versionNumber: formVersion.versionNumber,
      versionWasReused,
      publicSlug: formDefinition.publishState.publicSlug,
    });
  } catch (err) {
    handleServiceError(res, err, "Failed to publish form");
  }
}

/**
 * POST /api/forms/:id/archive — moves a published/paused form to "archived" so it can later be
 * deleted (deleteForm requires draft or archived). Direct pass-through to formPublishService.
 */
async function archiveForm(req, res) {
  try {
    const form = await formPublishService.archiveForm(req.params.id, req.user.organization);
    res.json({ form });
  } catch (err) {
    handleServiceError(res, err, "Failed to archive form");
  }
}

/**
 * POST /api/forms/:id/unarchive — brings an archived form back as a draft (offline, editable).
 */
async function unarchiveForm(req, res) {
  try {
    const form = await formPublishService.unarchiveForm(req.params.id, req.user.organization);
    res.json({ form });
  } catch (err) {
    handleServiceError(res, err, "Failed to unarchive form");
  }
}

/**
 * POST /api/forms/:id/pause — temporarily stops a published form from accepting submissions.
 */
async function pauseForm(req, res) {
  try {
    const form = await formPublishService.pauseForm(req.params.id, req.user.organization);
    res.json({ form });
  } catch (err) {
    handleServiceError(res, err, "Failed to pause form");
  }
}

/**
 * POST /api/forms/:id/resume — resumes a paused form back to published.
 */
async function resumeForm(req, res) {
  try {
    const form = await formPublishService.resumeForm(req.params.id, req.user.organization);
    res.json({ form });
  } catch (err) {
    handleServiceError(res, err, "Failed to resume form");
  }
}

/**
 * GET /api/forms/:id/submissions?page=&limit=&reviewStatus=&importStatus=&processingStatus=
 */
async function listSubmissions(req, res) {
  try {
    const form = await FormDefinition.findOne({ _id: req.params.id, organization: req.user.organization }, { _id: 1 });
    if (!form) return res.status(404).json({ error: "Form not found" });

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;

    const query = { formDefinition: form._id };
    if (req.query.reviewStatus) query.reviewStatus = req.query.reviewStatus;
    if (req.query.importStatus) query.importStatus = req.query.importStatus;
    if (req.query.processingStatus) query.processingStatus = req.query.processingStatus;

    const [submissions, totalCount] = await Promise.all([
      FormSubmission.find(query, { rawData: 0, processedData: 0 }) // list view: no audit payload, per submission detail split
        .sort({ submittedAt: -1 })
        .skip(skip)
        .limit(limit),
      FormSubmission.countDocuments(query),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      submissions,
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
    console.error("formController.listSubmissions error:", err);
    res.status(500).json({ error: "Failed to list submissions" });
  }
}

/**
 * GET /api/forms/:id/submissions/:submissionId — full detail (rawData/processedData included,
 * unlike the list view) for the Submissions tab's row-click drawer.
 */
async function getSubmission(req, res) {
  try {
    const form = await FormDefinition.findOne({ _id: req.params.id, organization: req.user.organization }, { _id: 1 });
    if (!form) return res.status(404).json({ error: "Form not found" });

    const submission = await FormSubmission.findOne({ _id: req.params.submissionId, formDefinition: form._id });
    if (!submission) return res.status(404).json({ error: "Submission not found" });

    // processedData is keyed by fieldId ("system:company.billingAddress.city", or a custom field's
    // ObjectId) — meaningless as a label on its own. Ship the frozen resolvedFields from the exact
    // version this was submitted against, so the detail panel shows the labels the visitor actually
    // saw (including custom fields, and including labels since renamed in Settings).
    const version = await FormVersion.findById(submission.formVersion, { resolvedFields: 1 });

    res.json({ submission, resolvedFields: version ? version.resolvedFields : [] });
  } catch (err) {
    console.error("formController.getSubmission error:", err);
    res.status(500).json({ error: "Failed to load submission" });
  }
}

/**
 * GET /api/duplicate-reviews?page=&limit=&module=&decision=&formId=
 * Defaults to decision=pending (the Review Center inbox's primary view) unless explicitly overridden.
 * `formId` scopes to one form's reviews — DuplicateReview has no direct FormDefinition reference
 * (it's deliberately not Forms-specific in shape, per FORMS_DOMAIN_MODEL.md §3/D6), so this joins
 * through FormSubmission.formDefinition first. Added for the Form Detail Overview tab's
 * pending-review count and the (future) Duplicate Reviews tab — flagged as a small additive gap in
 * FORMS_FRONTEND_ARCHITECTURE.md §3.6/§9.
 */
async function listDuplicateReviews(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;

    const query = { organization: req.user.organization };
    query.decision = req.query.decision || "pending";
    if (req.query.module) query.module = req.query.module;
    if (req.query.formSubmission) query.formSubmission = req.query.formSubmission;

    if (req.query.formId) {
      const submissionIds = await FormSubmission.find(
        { formDefinition: req.query.formId, organization: req.user.organization },
        { _id: 1 }
      );
      query.formSubmission = { $in: submissionIds.map((s) => s._id) };
    }

    const [reviews, totalCount] = await Promise.all([
      DuplicateReview.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      DuplicateReview.countDocuments(query),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      reviews,
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
    console.error("formController.listDuplicateReviews error:", err);
    res.status(500).json({ error: "Failed to list duplicate reviews" });
  }
}

/**
 * GET /api/duplicate-reviews/:id — single review detail, plus the existing CRM record's current
 * field values alongside it (existingRecordData). matchDetails only carries the handful of
 * detection signals (email/phone/name_fuzzy, gstin/website, etc.) — the Review Center's
 * side-by-side diff needs the full record, not just those signals, to show every field that
 * differs, not only the ones the matching engine happened to check.
 */
async function getDuplicateReview(req, res) {
  try {
    const review = await DuplicateReview.findOne({ _id: req.params.id, organization: req.user.organization });
    if (!review) return res.status(404).json({ error: "Duplicate review not found" });

    const Model = RECORD_MODEL_BY_MODULE[review.existingRecord.module];
    const existingRecordDoc = Model
      ? await Model.findOne({ _id: review.existingRecord.recordId, organization: req.user.organization })
      : null;

    res.json({
      review,
      existingRecordData: existingRecordDoc ? existingRecordDoc.toObject() : null,
    });
  } catch (err) {
    console.error("formController.getDuplicateReview error:", err);
    res.status(500).json({ error: "Failed to load duplicate review" });
  }
}

/**
 * POST /api/duplicate-reviews/:id/keep-separate — direct pass-through to
 * duplicateResolutionService.keepSeparate.
 */
async function resolveKeepSeparate(req, res) {
  try {
    const { review, createdRecord } = await duplicateResolutionService.keepSeparate(
      req.params.id,
      req.user.organization,
      { decidedByUserId: req.user._id }
    );
    res.json({ review, createdRecord });
  } catch (err) {
    handleServiceError(res, err, "Failed to resolve review");
  }
}

/**
 * POST /api/duplicate-reviews/:id/link — direct pass-through to
 * duplicateResolutionService.linkToExisting.
 */
async function resolveLinkToExisting(req, res) {
  try {
    const { review } = await duplicateResolutionService.linkToExisting(
      req.params.id,
      req.user.organization,
      { decidedByUserId: req.user._id }
    );
    res.json({ review });
  } catch (err) {
    handleServiceError(res, err, "Failed to resolve review");
  }
}

/**
 * POST /api/duplicate-reviews/:id/merge — direct pass-through to
 * duplicateResolutionService.mergeIntoExisting. Body: { resolvedFieldValues: {...} } — the
 * per-field values the reviewer chose (from the UI's side-by-side diff), not auto-computed here.
 */
async function resolveMerge(req, res) {
  try {
    const { review, updatedRecord } = await duplicateResolutionService.mergeIntoExisting(
      req.params.id,
      req.user.organization,
      { decidedByUserId: req.user._id, resolvedFieldValues: req.body.resolvedFieldValues }
    );
    res.json({ review, updatedRecord });
  } catch (err) {
    handleServiceError(res, err, "Failed to resolve review");
  }
}

/**
 * DELETE /api/forms/:id
 * Only allowed for: draft forms (never had real submissions), or archived forms with zero
 * submissions. Published/paused forms must be archived first.
 */
async function deleteForm(req, res) {
  try {
    const form = await FormDefinition.findOne({ _id: req.params.id, organization: req.user.organization });
    if (!form) return res.status(404).json({ error: "Form not found" });

    if (req.ownOnly && !isOwnedByUser(form, req.user._id)) {
      return res.status(403).json({ error: "You can only delete forms you own" });
    }

    if (form.status === "published" || form.status === "paused") {
      return res.status(400).json({ error: "Archive this form before deleting it." });
    }

    if (form.status === "archived") {
      const submissionCount = await FormSubmission.countDocuments({ formDefinition: form._id });
      if (submissionCount > 0) {
        return res.status(400).json({ error: "Cannot delete a form with existing submissions." });
      }
    }

    // status === "draft" falls through — safe to delete freely.
    await form.deleteOne();
    res.json({ success: true });
  } catch (err) {
    console.error("formController.deleteForm error:", err);
    res.status(500).json({ error: "Failed to delete form" });
  }
}

/**
 * POST /api/forms/export-selected
 * Body: { selectedIds, columns: [{ key, label }] }
 * Mirrors companyController.exportSelectedCompanies exactly (same request
 * shape, same CSV assembly) so the shared ExportModal works here unchanged.
 * Org-scoped in the query, so a foreign _id in selectedIds simply matches
 * nothing rather than leaking another org's form.
 */
async function exportSelectedForms(req, res) {
  try {
    const { selectedIds, columns } = req.body;
    if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
      return res.status(400).json({ error: "No forms selected for export" });
    }
    if (!Array.isArray(columns) || columns.length === 0) {
      return res.status(400).json({ error: "No columns selected for export" });
    }

    const query = { _id: { $in: selectedIds }, organization: req.user.organization };
    if (req.ownOnly) query.$or = [{ owner: req.user._id }, { createdBy: req.user._id }];

    const forms = await FormDefinition.find(query).lean();

    const counts = forms.length
      ? await FormSubmission.aggregate([
          { $match: { formDefinition: { $in: forms.map((f) => f._id) } } },
          { $group: { _id: "$formDefinition", count: { $sum: 1 } } },
        ])
      : [];
    const countByFormId = new Map(counts.map((c) => [String(c._id), c.count]));

    const headerRow = columns.map((c) => `"${c.label}"`).join(",");
    const dataRows = forms.map((form) =>
      columns
        .map((c) => {
          let val = c.key === "submissionCount" ? countByFormId.get(String(form._id)) || 0 : form[c.key];
          if (val == null) val = "";
          if (val instanceof Date) val = val.toISOString();
          else if (typeof val === "object") val = JSON.stringify(val);
          return `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(",")
    );

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="Exported_Forms.csv"');
    res.status(200).send([headerRow, ...dataRows].join("\n"));
  } catch (err) {
    console.error("formController.exportSelectedForms error:", err);
    res.status(500).json({ error: "Failed to export forms" });
  }
}

/**
 * POST /api/forms/:id/image — receives an image the owner is placing on the form (logo, banner...).
 * Runs after uploadMiddlewareS3().single("image"), which has already streamed the file to the org's
 * S3 folder and set req.fileLocation. Deliberately does NOT persist the URL onto the form itself:
 * the Builder holds unsaved layout state locally and writes it through the normal PATCH /forms/:id
 * save, so writing it here too would clobber concurrent unsaved edits with a stale server copy.
 */
async function uploadFormImage(req, res) {
  if (!req.file || !req.fileLocation) {
    return res.status(400).json({ error: "No file uploaded." });
  }
  res.status(201).json({ url: req.fileLocation });
}

module.exports = {
  listForms,
  exportSelectedForms,
  createForm,
  getForm,
  updateForm,
  uploadFormImage,
  publishForm,
  archiveForm,
  unarchiveForm,
  pauseForm,
  resumeForm,
  listSubmissions,
  getSubmission,
  listDuplicateReviews,
  getDuplicateReview,
  resolveKeepSeparate,
  resolveLinkToExisting,
  resolveMerge,
  deleteForm,
};
