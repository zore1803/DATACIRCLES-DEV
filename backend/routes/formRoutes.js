// routes/formRoutes.js
// Authenticated Forms management routes (Phase 1b). Mounted at /api so both /api/forms/* and
// /api/duplicate-reviews/* resolve from this one router — DuplicateReview is deliberately not
// Forms-specific in its data shape (FORMS_DOMAIN_MODEL.md §3 / D6 shared-engine decision), so its
// routes live at their own top-level path, not nested under /forms.
//
// Middleware stack matches every other authenticated module exactly: requireAuth -> subscriptionGate
// -> restrictByPlan("forms", "read"|"write") -> checkPermission("forms", "readonly"|"read-write").
const express = require("express");
const router = express.Router();
const formController = require("../controllers/formController");
const authMiddleware = require("../middlewares/auth");
const userSync = require("../middlewares/userSync");
const subscriptionGate = require("../middlewares/subscriptionGate");
const restrictByPlan = require("../middlewares/restrictByPlan");
const checkPermission = require("../middlewares/checkPermission");
const uploadMiddlewareS3 = require("../middlewares/uploadMiddlewareS3");

const requireAuth = [authMiddleware, userSync];
const readGate = [requireAuth, subscriptionGate, restrictByPlan("forms", "read"), checkPermission("forms", "readonly")];
// Only form CREATION should be counted against the plan's numeric forms limit.
const writeGate = [requireAuth, subscriptionGate, restrictByPlan("forms", "write"), checkPermission("forms", "read-write")];
// Mutating/deleting an EXISTING form (update, publish, pause, resume, archive, delete) never
// creates a new form document, so it must skip the numeric limit check — otherwise an org at its
// limit can never pause/archive/delete its way back under it. Still enforces write-access gating
// and permissions exactly like writeGate.
const mutateGate = [requireAuth, subscriptionGate, restrictByPlan("forms", "write", { skipLimit: true }), checkPermission("forms", "read-write")];

// --- Forms CRUD / publish ---
router.get("/forms", readGate, formController.listForms);
router.post("/forms", writeGate, formController.createForm);
// Declared BEFORE /forms/:id-style routes are relevant only for GETs, but kept
// here with the rest of the collection routes: exporting is a read of existing
// forms, so it uses readGate even though it is a POST (the body only carries
// the id/column selection).
router.post("/forms/export-selected", readGate, formController.exportSelectedForms);
router.get("/forms/:id", readGate, formController.getForm);
router.patch("/forms/:id", mutateGate, formController.updateForm);
router.post("/forms/:id/publish", mutateGate, formController.publishForm);
router.post("/forms/:id/archive", mutateGate, formController.archiveForm);
router.post("/forms/:id/unarchive", mutateGate, formController.unarchiveForm);
router.post("/forms/:id/pause", mutateGate, formController.pauseForm);
router.post("/forms/:id/resume", mutateGate, formController.resumeForm);
router.delete("/forms/:id", mutateGate, formController.deleteForm);
// POST /api/forms/:id/image — an image placed on the form by its owner (logo, banner, etc.).
// Authenticated, so it can reuse the standard org-scoped uploadMiddlewareS3 (its S3 key builder
// reads req.user.organization, populated by requireAuth above — hence the middleware order).
// Returns a URL the Builder stores on an "image" layout element via the normal PATCH /forms/:id save.
router.post("/forms/:id/image", mutateGate, uploadMiddlewareS3().single("image"), formController.uploadFormImage);

// --- Submissions ---
router.get("/forms/:id/submissions", readGate, formController.listSubmissions);
router.get("/forms/:id/submissions/:submissionId", readGate, formController.getSubmission);

// --- Duplicate Review Center ---
router.get("/duplicate-reviews", readGate, formController.listDuplicateReviews);
router.get("/duplicate-reviews/:id", readGate, formController.getDuplicateReview);
router.post("/duplicate-reviews/:id/keep-separate", writeGate, formController.resolveKeepSeparate);
router.post("/duplicate-reviews/:id/link", writeGate, formController.resolveLinkToExisting);
router.post("/duplicate-reviews/:id/merge", writeGate, formController.resolveMerge);

module.exports = router;
