// services/formPublishService.js
// Orchestrates FormDefinition lifecycle: draft edits, publish, pause/resume, archive.
// Implements the publish flow exactly as diagrammed in FORMS_DOMAIN_MODEL.md §5.
// No Express dependency.
const crypto = require("crypto");
const FormDefinition = require("../models/FormDefinition");
const FormVersion = require("../models/FormVersion");
const FormSubmission = require("../models/FormSubmission");
const {
  computeSchemaHash,
  resolveFields,
  refreshResolvedFields,
  refreshLayoutPresentation,
  resolveLayoutTargetModules,
  assertUniqueFieldIds,
} = require("./formVersionService");

function mintPublicSlug() {
  return crypto.randomBytes(12).toString("base64url"); // random, unguessable — FORMS_ARCHITECTURE.md §2.9
}

/**
 * Purpose: Save the builder's in-progress layout/theme edits onto FormDefinition — the "working
 * copy" write path (FORMS_DOMAIN_MODEL.md: "FormDefinition IS the working copy").
 * Inputs: formDefinitionId, organizationId, { layout?, theme?, title?, module? }
 * Outputs: Promise<FormDefinitionDocument>
 * Side effects: one FormDefinition write. Sets hasUnpublishedChanges = true whenever `layout`
 *   changes and status is already "published" or "paused" — never touches `status` itself
 *   (FORMS_SCHEMA.md §1/§2: ordinary draft saves must never affect reachability).
 * Errors thrown: throws if formDefinitionId doesn't resolve within organizationId; throws if
 *   `module` is given for a form that already has canvas fields or submissions — module drives
 *   which fields/system schema the whole form is built against, so changing it under existing
 *   work would silently orphan fields and submissions tied to the old module.
 * Known callers: builder save endpoint (future controller)
 */
async function saveDraft(formDefinitionId, organizationId, { layout, theme, title, module } = {}) {
  const form = await FormDefinition.findOne({ _id: formDefinitionId, organization: organizationId });
  if (!form) throw new Error("FormDefinition not found");

  if (module !== undefined && module !== form.module) {
    if (!["Contact", "Company", "Vendor"].includes(module)) {
      throw new Error('module must be one of "Contact", "Company", "Vendor"');
    }
    if ((form.layout || []).length > 0) {
      throw new Error("Cannot change module: this form already has fields on its canvas");
    }
    const submissionCount = await FormSubmission.countDocuments({ formDefinition: form._id });
    if (submissionCount > 0) {
      throw new Error("Cannot change module: this form already has submissions");
    }
    form.module = module;
  }

  if (layout !== undefined) {
    form.layout = layout;
    if (form.status === "published" || form.status === "paused") {
      form.hasUnpublishedChanges = true;
    }
  }
  if (theme !== undefined) form.theme = theme;
  if (title !== undefined) form.title = title;

  await form.save();
  return form;
}

/**
 * Purpose: Publish a FormDefinition — mints/reuses a FormVersion per the schemaHash comparison,
 * updates publishState, clears hasUnpublishedChanges. Exact flow per FORMS_DOMAIN_MODEL.md §5.
 * Inputs: formDefinitionId, organizationId, { actorUserId }
 * Outputs: Promise<{ formDefinition, formVersion, versionWasReused: boolean }>
 * Side effects: possibly one FormVersion insert; one FormDefinition write (publishState +
 *   status + hasUnpublishedChanges).
 * Errors thrown: throws if formDefinitionId doesn't resolve; throws if layout is empty (nothing
 *   to publish).
 * Known callers: publish action (future controller)
 *
 * NOTE on concurrency (per FORMS_SCHEMA_IMPLEMENTATION_NOTES.md): this does not yet implement an
 * atomic version-number increment or retry-on-duplicate-key handling for the rare concurrent-
 * publish race. Flagged as a known follow-up, not solved here — out of scope for this pass.
 */
async function publishForm(formDefinitionId, organizationId, { actorUserId } = {}) {
  const form = await FormDefinition.findOne({ _id: formDefinitionId, organization: organizationId });
  if (!form) throw new Error("FormDefinition not found");
  if (!form.layout || form.layout.length === 0) throw new Error("Cannot publish a form with an empty layout");

  // Publish-time invariant enforcement (FORMS_SCHEMA.md invariants #16/#17) — a fieldId may appear
  // at most once, and every field's routing (targetModule) is derived here, never trusted from a
  // client. Both run before hashing/freezing so an invalid layout never becomes a FormVersion.
  assertUniqueFieldIds(form.layout);
  const resolvedLayout = resolveLayoutTargetModules(form.module, form.layout);

  // Hash and freeze the SAME targetModule-resolved layout, so schemaHash covers routing (§3a) and
  // the frozen snapshot carries targetModule for submission-time bucketing (no runtime field-def
  // lookup — FORMS_DOMAIN_MODEL.md amendment).
  const schemaHash = computeSchemaHash(resolvedLayout);

  const latestVersion = await FormVersion.findOne({ formDefinition: form._id }).sort({ versionNumber: -1 });

  let formVersion;
  let versionWasReused;

  if (latestVersion && latestVersion.schemaHash === schemaHash) {
    // Unchanged structurally — reuse the existing version, but refresh the two things §3a keeps
    // OUT of schemaHash and therefore lets drift: field labels/options (resolvedFields) and
    // element presentation (image URL/size/position, heading text, divider styling, button label).
    // Without the presentation refresh the frozen layout would keep serving whatever it held at
    // first publish, so republishing a purely cosmetic edit visibly did nothing.
    await refreshLayoutPresentation(latestVersion._id, resolvedLayout);
    formVersion = await refreshResolvedFields(latestVersion._id, form.module, organizationId);
    versionWasReused = true;
  } else {
    const resolvedFields = await resolveFields(form.module, resolvedLayout, organizationId);
    const nextVersionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;
    formVersion = await FormVersion.create({
      formDefinition: form._id,
      versionNumber: nextVersionNumber,
      schemaHash,
      layout: resolvedLayout,
      resolvedFields,
    });
    versionWasReused = false;
  }

  form.publishState.activeFormVersionId = formVersion._id;
  if (!form.publishState.publicSlug) {
    form.publishState.publicSlug = mintPublicSlug();
  }
  if (!form.publishState.publishedAt) {
    form.publishState.publishedAt = new Date();
  }
  form.status = "published";
  form.hasUnpublishedChanges = false;
  form.updatedBy = actorUserId;

  await form.save();

  return { formDefinition: form, formVersion, versionWasReused };
}

/**
 * Purpose: Temporarily take a published form offline without losing its structure or reverting
 * to draft (FORMS_DOMAIN_MODEL.md's `paused` state, added specifically for this).
 * Inputs: formDefinitionId, organizationId
 * Outputs: Promise<FormDefinitionDocument>
 * Side effects: one FormDefinition write (status only; activeFormVersionId untouched)
 * Errors thrown: throws if not currently "published"
 */
async function pauseForm(formDefinitionId, organizationId) {
  const form = await FormDefinition.findOne({ _id: formDefinitionId, organization: organizationId });
  if (!form) throw new Error("FormDefinition not found");
  if (form.status !== "published") throw new Error(`Cannot pause a form with status "${form.status}"`);
  form.status = "paused";
  await form.save();
  return form;
}

/** Purpose: Resume a paused form. Mirror of pauseForm. */
async function resumeForm(formDefinitionId, organizationId) {
  const form = await FormDefinition.findOne({ _id: formDefinitionId, organization: organizationId });
  if (!form) throw new Error("FormDefinition not found");
  if (form.status !== "paused") throw new Error(`Cannot resume a form with status "${form.status}"`);
  form.status = "published";
  await form.save();
  return form;
}

/**
 * Purpose: Retire a form. Terminal in practice (FORMS_DOMAIN_MODEL.md §5) — never a hard delete.
 * Inputs: formDefinitionId, organizationId
 * Outputs: Promise<FormDefinitionDocument>
 */
async function archiveForm(formDefinitionId, organizationId) {
  const form = await FormDefinition.findOne({ _id: formDefinitionId, organization: organizationId });
  if (!form) throw new Error("FormDefinition not found");
  form.status = "archived";
  await form.save();
  return form;
}

/**
 * Purpose: Take a form back out of "archived". Archiving is the only way to retire a form short of
 * deleting it, so without this a mis-archived form could only be republished straight back to live
 * — there was no way to get it back as an editable, offline form.
 * Returns it to "draft" rather than to whatever it was before: unarchiving must never silently put
 * a public form back online. Publishing it again is a separate, deliberate action, and the form
 * keeps its publishState (slug, last active version), so republishing reuses the same public URL.
 * Errors thrown: throws unless the form is currently "archived".
 */
async function unarchiveForm(formDefinitionId, organizationId) {
  const form = await FormDefinition.findOne({ _id: formDefinitionId, organization: organizationId });
  if (!form) throw new Error("FormDefinition not found");
  if (form.status !== "archived") throw new Error(`Cannot unarchive a form with status "${form.status}"`);
  form.status = "draft";
  await form.save();
  return form;
}

module.exports = { saveDraft, publishForm, pauseForm, resumeForm, archiveForm, unarchiveForm };
