# Forms Module — Architecture Document

Status: **Phase 0 (service-layer extraction) implemented and live-verified — see FORMS_IMPLEMENTATION.md. Everything past §2.1's service list is still design-only.**
Scope: Public form builder (Bigin-style) for Contacts, Companies, and Vendors, feeding into the existing CRM with intelligent duplicate handling.

### Reconciliation note (post-Phase 0)

Five things Phase 0 implementation surfaced that weren't visible from the original read-only audit, folded into §2.1 below rather than left as a separate errata list:

1. **`Company.create()` needs its array form to accept a `session` option** (`Company.create([data], {session})`, not the single-object form) — Mongoose-specific detail, now baked into `companyService.createCompany`. Contact/Vendor use `.save({session})` on a document instance instead, which doesn't have this issue.
2. **`processAdditionalFields` (Vendor's original helper) survives, unexported, inside `vendorController.js`** — it's still a live dependency of the bulk-import handler, which Phase 0 correctly left untouched. This means Vendor bulk-import is running on a *third* copy of the coercion logic (the original inline one) that `fieldCoercionService` didn't actually collapse. Flagged as a real follow-up, not fixed now: a future phase (or a small standalone cleanup) should point bulk-import at `fieldCoercionService.processAdditionalFields` too, otherwise this module has quietly gone from "4 duplicates" to "3 duplicates + 1 for bulk-import" rather than to "1."
3. **The `user` field on Contact/Company create has a pre-existing fallback quirk** (`rawData._id || actingUserId`) neither service invented — carried forward as-is per the "preserve, don't fix" rule, but worth flagging loudly here since a Forms submission won't have a natural `rawData._id` to accidentally trigger this branch; `submissionService` (Phase 4) must pass `actingUserId` explicitly and never let arbitrary form-submitted data reach this parameter.
4. **No test suite exists anywhere in this repo** (confirmed, not assumed) — Phase 0's "zero functional change" claim rests entirely on manual live verification (documented in FORMS_IMPLEMENTATION.md), not automated regression. This same gap applies to every future phase; there is no CI safety net catching a Forms-introduced regression in Contact/Company/Vendor creation.
5. **Auth0-based auth means baseline/regression capture can't be scripted headlessly** — verification requires either a human-driven login or a stored session token pulled from `localStorage` mid-session (which is what was done for Phase 0). Future phases needing repeatable regression checks should consider a dedicated test-org service account, rather than relying on an interactive login each time.

---

## 1. Current Architecture (as found in this codebase)

### 1.1 The three record modules

| Module | Model | Company link | Custom fields model | Field-merge logic |
|---|---|---|---|---|
| Contact | `backend/models/Contact.js` | `company: ObjectId ref Company` (real ref) | `ContactFields.js` | inline in `contactController.createContact` |
| Company | `backend/models/Company.js` | `parentCompany`/`subsidiaries: [ObjectId ref Company]` (self-ref) | `CompanyFields.js` | inline in `companyController.createCompany` |
| Vendor | `backend/models/Vendor.js` | `company: String` (**free text, not a ref**) | `VendorFields.js` | extracted into `processAdditionalFields()` in `vendorController.js` |

All three share the same `additionalFields: [{key, value, type, category}]` shape and the same `*Fields` model shape (`fieldCategories`, `fields: [{name, type, options, required, createdBy, category}]`, scoped by `organization`).

**Key existing gap:** field-definition CRUD and field-rendering logic are duplicated four times server-side (Contact/Company/Vendor/Deal) and seven-plus times client-side (`QuickContactForm`, `ContactForm`, `QuickCompanyForm`, `CompanyForm`, `QuickVendorForm`, `VendorForm`, `DealForm`/variants), each with its own copy of the same `switch(type)` rendering logic. There is no shared `FieldRenderer` component and no shared backend field-coercion utility. `checkCustomFieldLimit()` (`middlewares/customFieldRestriction.js`) is the one genuinely shared piece — it's a factory keyed by module name.

### 1.2 Validation

No field-value validation exists today beyond type coercion (`parseFloat` for number, `String()` for everything else). No email/phone/GSTIN/URL/date format checks run against submitted values anywhere in the create/update paths. `express-validator` is installed but not wired into these routes. GSTIN format is checked in `backend/services/gstinService.js` (used by `POST /api/gstin/verify`) and client-side in the Vendor/Company forms before Fetch.

### 1.3 File uploads

`uploadMiddlewareS3.js` (multer-s3) uploads directly to S3, keyed by `org-${organizationId}/...`, served via CloudFront, with **no server-side size/type limit** (client-side only). It reads `req.user.organization` to build the S3 key — this assumes an authenticated user and will not work unmodified for anonymous form submitters.

### 1.4 Authentication & multi-tenancy

Every existing route requires `[authMiddleware, userSync]` (`requireAuth`), which resolves an Auth0/JWT identity to a `User` document carrying `organization`. **There is no precedent anywhere in this codebase for a public, unauthenticated route.** Multi-tenancy is enforced by scoping every query to `req.user.organization` — a public form endpoint has no `req.user` and must resolve the owning organization some other way (a public slug/token in the URL).

### 1.5 Service layer

**None exists.** `backend/services/` is not a directory. All business logic (field merge, populate, save) lives directly in controllers, coupled to `req.user` and `req.fileLocation`. Nothing is currently importable by a new public endpoint without either refactoring or duplicating a fourth/fifth time.

### 1.6 Duplicate detection

**None exists for Contact/Company/Vendor creation.** The only relevant clue is `mergeContacts` in `contactController.js`, a manual after-the-fact merge tool — implying duplicates already happen unchecked today via the authenticated UI. Bulk-import resolves company name → existing Company by case-insensitive regex (a useful pattern to reuse), but that's a lookup, not dedup-on-create.

---

## 2. Ideal Forms Architecture

### 2.1 Guiding principle

> **Forms must never become a fourth/fifth reimplementation of contact/company/vendor creation.** It should be the forcing function that finally extracts field-definitions, field-coercion, and record-creation into shared services — which every other creation path (manual UI, bulk import, API) can then also adopt, rather than drift further apart.

Concretely, don't stop at three module services — split out the cross-cutting concerns underneath them into their own single-purpose services, or the module services will just become the next dumping ground:

```
backend/services/
  contactService.js        — orchestrates: calls FieldCoercionService, DuplicateEngine, then persists Contact
  companyService.js        — same, for Company
  vendorService.js         — same, for Vendor
  fieldValidationService.js  — required/format checks (email/phone/GSTIN/URL/date regex) against a field definition
  fieldCoercionService.js    — type coercion (string/number/date/dropdown/multiselect) shared by all three module services
  duplicateEngine.js         — findDuplicates(), scoring, reason generation (§2.4) — module-agnostic
  fileUploadService.js       — wraps S3 upload for both authenticated and public (org-resolved-from-slug) callers
  notificationService.js     — owner-notify / visitor-acknowledgment, thin wrapper over existing email infra
  submissionService.js       — Forms-specific orchestration: validate → coerce → dedupe → create-or-queue (the only Forms-specific service; everything above it is reusable outside Forms)
```

`contactService`/`companyService`/`vendorService` become thin orchestrators that call `fieldValidationService` and `fieldCoercionService` rather than each re-implementing type switches — this is what actually kills the current 4x server-side duplication described in §1.1, not just moving it one layer down. `submissionService` is the only piece that's Forms-specific; everything else is designed to be called by manual create, bulk import, and future API endpoints too.

Also: one shared frontend `<DynamicFieldRenderer field={fieldDef} value={...} onChange={...} />` component, used by the Forms builder's live preview, the public form renderer, *and* (opportunistically) the existing Quick*Form components — collapsing the current 7-way client-side duplication.

This is more refactor-heavy up front than a bolt-on Forms feature, but it directly addresses the "single source of truth" requirement from the product discussion (custom field added in Settings → automatically appears everywhere, including Forms) and avoids the two-creation-paths drift risk called out in the roadmap.

### 2.2 Database schema (collections only, no implementation)

**`Form`**
```
_id
organization: ObjectId ref Organization (required)
title: String
module: enum ["Contact", "Company", "Vendor"]   // matches existing module names
status: enum ["draft", "published", "archived"]
publicSlug: String (unique, indexed)             // e.g. random 16-char token, NOT sequential/guessable
layout: [ Section ]
  Section: { id, title, description, order, elements: [Element] }
  Element: a tagged union, not just fields — the builder is a layout tool, not just a field-picker:
    { id, type: "field", order, fieldKey, source: "system"|"custom", required, helpText, defaultValue,
      validationOverrides: { min, max, regex, restrictPastDates, restrictFutureDates, allowedDomains, ... } }
    { id, type: "heading", order, text }
    { id, type: "paragraph", order, text }
    { id, type: "divider", order }
    { id, type: "spacer", order, height }
    { id, type: "image", order, url, alt }
    { id, type: "submitButton", order, label, color, position, style }
    // "columns" and "customHtml" reserved element types for v2, not built in phase 1 — the tagged-union
    // shape means adding them later is additive (new `type` case), not a schema migration
  formVersion: Number (starts at 1, incremented on every publish of a structural change — see D3)
theme: { logoUrl, backgroundColor, backgroundImageUrl, fontFamily, buttonColor, buttonPosition,
         buttonStyle, formAlignment: "top"|"left"|"right"|"center" }
tools: { captchaEnabled, captchaProvider: "recaptcha"|"builtin", recaptchaSiteKey, recaptchaSecretKeyRef,
         privacyPolicyEnabled, privacyPolicyText/Url, fileUploadFields: [fieldKey] }
settings: {
  owner: ObjectId ref User,
  notifyOwnerOnSubmit: Boolean,
  autoFillDefaults: [{ fieldKey, value }],
  duplicateStrategy: enum ["review_queue", "auto_merge_high_confidence", "allow_duplicates"],  // see §7 open decision
  thankYou: { type: "message"|"redirect", message, redirectUrl },
}
createdBy, updatedBy: ObjectId ref User
createdAt, updatedAt
```
Indexes: `{organization, status}`, unique `{publicSlug}`.

**`FormResponse`**
```
_id
form: ObjectId ref Form
formVersion: Number                           // pins to Form.formVersion at submission time — see D3
organization: ObjectId ref Organization      // denormalized for fast org-scoped queries
submittedAt: Date
sourceMeta: { ip, userAgent, utm: {source, medium, campaign, term, content}, referrer }
rawData: Mixed                                // exactly what was submitted, pre-validation. WRITE-ONCE: set on
                                               // creation, never mutated or read by any application logic after
                                               // that — it exists solely as an audit trail ("what did the visitor
                                               // actually type"), not as a data source for rendering, matching, or
                                               // review-screen display. Enforce at the service layer (submissionService
                                               // never writes to rawData after initial insert) since Mongoose won't
                                               // stop a stray update.
normalizedData: Mixed                         // post-coercion, matches the target module's create payload shape.
                                               // Everything downstream (duplicate engine, review UI, import) reads
                                               // and can rewrite this field — this is the only mutable copy.
uploadedFiles: [{ fieldKey, url, originalName, size, mimeType }]
status: enum ["pending_validation", "validated", "rejected",
              "needs_review", "duplicate_flagged", "approved", "imported"]
validationErrors: [{ fieldKey, message }]
duplicateMatches: [ObjectId ref DuplicateReview]
resultingRecord: { module, recordId }         // set once imported
reviewedBy: ObjectId ref User
reviewedAt: Date
```
Indexes: `{form, status}`, `{organization, status}`, `{submittedAt}`.

**`DuplicateReview`**
```
_id
organization: ObjectId ref Organization
module: enum ["Contact", "Company", "Vendor"]
formResponse: ObjectId ref FormResponse (nullable — see §2.4, this engine should also serve Import/manual create)
existingRecord: { module, recordId }
incomingData: Mixed
score: Number (0-100)
matchedOn: [String]                           // e.g. ["email"], ["gstin"], ["website","name_fuzzy"]
matchDetails: [{ signal, matched: Boolean, existingValue, incomingValue, weight }]
                                               // per-signal breakdown so the Review Center can render:
                                               // "✓ Same GSTIN · ✓ Same Website · ✓ Company name differs only by
                                               // punctuation · ✓ Same phone" instead of just a bare score — users
                                               // trust a flagged duplicate more when they can see why it matched
reasonSummary: String                          // human-readable one-liner derived from matchDetails, for list views
decision: enum ["pending", "merged", "kept_separate", "linked_to_existing"]
decidedBy: ObjectId ref User
decidedAt: Date
createdAt: Date
```
Indexes: `{organization, decision}`, `{existingRecord.module, existingRecord.recordId}`.

**`FormEmbedToken`** — *optional, only if you want revocable embed credentials separate from the public slug itself* (folded into `Form.publicSlug` for v1; called out as a possible v2 split in §9).

### 2.3 API design

All public-facing endpoints live under a distinct, explicitly unauthenticated router, separated from every other route file (which all assume `requireAuth`), so the "this route is public" property is visible at a glance rather than hidden behind a missing middleware call:

```
backend/routes/publicFormRoutes.js   (mounted at /api/public/forms, NO requireAuth)

GET  /api/public/forms/:publicSlug             -> form definition (fields, theme, tools) for rendering
POST /api/public/forms/:publicSlug/submit       -> create FormResponse, run validation + duplicate engine
```

Authenticated CRM-side routes (existing `requireAuth` pattern):
```
backend/routes/formRoutes.js          (/api/forms)
GET    /api/forms                     list forms, filterable by module/status
POST   /api/forms                     create (builder "save")
GET    /api/forms/:id                 full definition for editing
PATCH  /api/forms/:id                 update
POST   /api/forms/:id/publish         draft -> published, mints publicSlug if absent
DELETE /api/forms/:id
GET    /api/forms/:id/submissions     paginated FormResponse list
POST   /api/forms/submissions/:id/approve
POST   /api/forms/submissions/:id/reject
POST   /api/forms/submissions/:id/merge          { duplicateReviewId, resolution }

backend/routes/duplicateReviewRoutes.js  (/api/duplicate-reviews)
GET    /api/duplicate-reviews                     org-wide review queue, not just from Forms
POST   /api/duplicate-reviews/:id/merge
POST   /api/duplicate-reviews/:id/keep-separate
POST   /api/duplicate-reviews/:id/link
```

The public `submit` endpoint resolves `organization` **only** from `Form.publicSlug → Form.organization`. It never accepts an organization ID from the client. It then calls the same `create{Contact,Company,Vendor}FromRawData()` service used by the authenticated create paths, passing `source: "form"` and the response's `_id` so the created record can carry provenance (see §2.5).

### 2.4 Duplicate/matching engine — shared, not Forms-specific

Per the product discussion and to avoid the "Forms ↓ Duplicate Logic" trap: build `backend/services/duplicateEngine.js` as a standalone service consumed by Forms, and *designed* (interface-wise) to also be callable from bulk-import and manual create later, even if only Forms wires it up in phase 1.

```
findDuplicates({ organization, module, candidateData }) -> [{ existingRecord, score, matchedOn, matchDetails, reasonSummary }]
```

Matching signals per module (v1 scope, deterministic — no ML in phase 1):
- Contact: exact email match (high confidence), exact phone match, fuzzy name + same company.
- Company: exact GSTIN match, exact normalized website/domain match (strip protocol/www), fuzzy name (e.g. trigram/Levenshtein) + same normalized domain.
- Vendor: exact GSTIN match, fuzzy name match (vendor.company is free text today — see §8 risk).

Every match the engine returns must include the per-signal `matchDetails` breakdown (§2.2's `DuplicateReview.matchDetails`), not just a bare score — this is a hard requirement on the engine's contract, not an optional nice-to-have, because the Review Center's entire value proposition ("why was this flagged") depends on it existing from the first call site.

Score bands (illustrative, tune later): ≥80 (REVIEW_THRESHOLD) → flagged for review, human chooses Keep Both/Keep Existing; <80 → treated as new record, no `DuplicateReview` created.

This engine only *detects and scores*; the user always decides. Confidence only affects ranking/explanation, never behavior. See Open Decision D2.

### 2.5 Provenance & cross-module linking

Every record created via a Form gets `createdVia: { type: "form", formId, formResponseId }` added to Contact/Company/Vendor schemas (additive, non-breaking). This directly enables the product requirement "notify the CRM user this data came from a form" and lets the UI render the "duplicate/unlinked" red-outline treatment described in the discussion without re-deriving provenance after the fact.

Cross-module linking on Contact submission: if a Contact form includes company fields, submission handling is:
1. Run `findDuplicates` for the company sub-payload against `Company`.
2. If any match exists (≥ REVIEW_THRESHOLD) → create the Contact, but create a `DuplicateReview` scoped to `module: "Company"` and leave `Contact.company` unset until reviewed.
3. If no match → create both Contact and Company, link them, no review needed.

Vendor is explicitly **not** cross-linked to Company (per the product discussion — "vendors is separate only, no worries about that").

### 2.6 Frontend architecture

```
frontend/src/pages/settings/FormsSettings.jsx        — "Forms" card in Settings, list of all forms
frontend/src/pages/forms/FormBuilder.jsx              — the builder (fields/layout/tools/style tabs)
frontend/src/components/forms/builder/
  FieldsPanel.jsx        — lists system + custom fields for the selected module, drag source
  LayoutCanvas.jsx        — drop target: sections, ordering, per-element settings/delete. Renders every
                             Element type from §2.2 (field, heading, paragraph, divider, spacer, image,
                             submitButton), not just fields — this is what makes the builder a layout tool
                             rather than a field-picker with a fixed template.
  FieldPropertiesPanel.jsx — right-hand panel; renders per-type validation options
  ToolsPanel.jsx          — captcha, privacy policy, file upload block
  ThemePanel.jsx           — colors/fonts/background/alignment (kept fully separate from field editing, per product discussion)
  FormPreview.jsx           — reuses the same public renderer used on the live form
frontend/src/pages/forms/FormDetailsStep.jsx           — the "Form Details" step: owner, notify, duplicate strategy, thank-you config
frontend/src/pages/forms/FormPublishSuccess.jsx        — link/QR/embed code screen
frontend/src/pages/public/PublicForm.jsx                — the actual public-facing form, NOT behind the authenticated app shell/router guard
frontend/src/components/forms/DynamicFieldRenderer.jsx  — shared renderer (system + custom fields), used by preview AND public form
frontend/src/pages/forms/SubmissionsInbox.jsx            — per-form submissions list + status
frontend/src/pages/forms/ReviewCenter.jsx                 — org-wide duplicate review queue (compare UI: existing vs incoming, Merge/Keep Separate/Review Later)
```

`PublicForm.jsx` must be mounted on a route that bypasses the app's auth guard entirely (e.g. `/forms/:publicSlug`, outside whatever wraps the authenticated app in `App.jsx`/router config) and must not import anything that triggers an auth check or org-scoped data fetch other than `GET /api/public/forms/:publicSlug`.

Where each Settings page's existing "Field Type Guide" (Text/String/Number/Dropdown/etc.) already documents the type system, the Builder's `FieldsPanel` reads live from `GET /contact-fields` / `/company-fields` / `/vendor-fields` (already existing endpoints) rather than caching or duplicating field lists — this is what makes "field added in Settings instantly available in Forms" work with zero extra sync code.

### 2.7 Dynamic field integration strategy

No new field-definition storage. Forms' `layout.Section.fields[].fieldKey` references field names that must exist in either the module's hardcoded system-field list (Company Name, Industry, GSTIN, Address, Website, Profile Picture, etc.) or the org's `*Fields` document. On `GET /api/forms/:id` and on public `GET /api/public/forms/:publicSlug`, the backend resolves each `fieldKey` against the *current* field definitions live (not a frozen copy) and merges in the form's per-field overrides (required/help text/validation). See Open Decision D4 for what happens when a referenced custom field is later deleted from Settings.

### 2.8 Public form submission lifecycle

```
Visitor loads GET /api/public/forms/:publicSlug
  → 404 if not found or status != "published"
  → returns { title, module, layout (resolved), theme, tools } — no organization ID, no internal IDs beyond field keys

Visitor submits POST /api/public/forms/:publicSlug/submit
  1. Resolve Form by publicSlug → organization, module, layout, settings. 404/410 if unpublished.
  2. Rate-limit by IP + publicSlug (new — nothing like this exists today; see §8).
  3. If tools.captchaEnabled: verify captcha token server-side before touching the DB.
  4. Validate payload shape against layout (required fields present, correct types) using the new shared
     field-coercion util. Reject (400) on hard schema violations (missing required field).
     Format-level issues (bad email, bad GSTIN) → still accepted into FormResponse as
     status:"needs_review" with validationErrors populated, NOT silently dropped — the CRM user resolves
     it in the Submissions Inbox, matching Bigin's forgiving behavior for public forms. (See Open Decision D8.)
  5. Store FormResponse { rawData, normalizedData, status: "validated" or "needs_review" }.
  6. If duplicateStrategy != "allow_duplicates": run duplicateEngine.findDuplicates for the primary module
     (and for Company if module=Contact and company fields were submitted).
     - No match → proceed to step 7 immediately (still respecting Open Decision D1: sync vs async import).
     - Match found → create DuplicateReview, set FormResponse.status = "duplicate_flagged"|"needs_review",
       do NOT auto-create the CRM record yet.
  7. If clean (no review needed) and duplicateStrategy allows it: call the shared
     create{Module}FromRawData(organization, normalizedData, {source:"form", formResponseId}) service,
     set FormResponse.status="imported", FormResponse.resultingRecord = {...}.
  8. If settings.notifyOwnerOnSubmit: enqueue a notification/email (reuse existing email infra — see §9).
  9. Respond to the browser with only { success: true } or the configured thank-you message/redirect —
     never the created record's ID or any internal identifier.

CRM user later, for needs_review/duplicate_flagged items:
  Submissions Inbox → open item → either fix + approve (imports now) or resolve via Review Center
  (Merge / Keep Separate / Review Later) → on Merge or Keep Separate, DuplicateReview.decision is set,
  and this decision is remembered so the same existing record is never re-flagged against future
  submissions with the same signal (per product requirement: "once sorted... should not be asked again").
```

### 2.9 Security considerations

- **Public URL unguessability**: `publicSlug` must be a cryptographically random token (not sequential, not derived from org/form name), generated server-side on publish.
- **No client-supplied organization/tenant ID, ever**, on the public submit path — resolved exclusively server-side from the slug, exactly matching the pattern already used correctly for JWT→user resolution elsewhere in the codebase.
- **Rate limiting**: add IP + slug based throttling on the public submit route specifically (nothing in the current middleware stack does this — `restrictByPlan`/`subscriptionGate` are both `req.user`-based and irrelevant here).
- **CAPTCHA**: reuse the Bigin pattern (site key/secret stored per-form) but store the secret key encrypted at rest or in a secrets manager, never returned by `GET /api/forms/:id`.
- **File uploads on public forms**: cannot reuse `uploadMiddlewareS3.js` unmodified — it derives the S3 key from `req.user.organization`, which won't exist. Needs a public-safe variant that (a) resolves org from the already-validated `publicSlug`, (b) enforces a **hard server-side size limit and MIME allowlist** (the current S3 middleware has none — this is an existing gap that becomes a real vulnerability once the upload path is unauthenticated), (c) never trusts the client-declared filename/extension alone for the allowlist check.
- **Spam/abuse beyond captcha**: honeypot field (invisible field only bots fill), and cap total FormResponses per form per day at the plan level, mirroring how `restrictByPlan` already caps other resources per org.
- **Data exposure**: `GET /api/public/forms/:publicSlug` must return only what's needed to render (field keys, labels, types, validation rules) — never internal Mongo `_id`s of the org, never other forms, never field definitions belonging to fields *not* included in this form's layout.
- **Injection via `rawData`**: since public input is stored in a `Mixed` field, ensure it's never interpolated into any query/shell/HTML without sanitization when rendered in the Submissions Inbox (stored-XSS risk in the CRM's own UI if a submitter puts a `<script>` in a text field).

### 2.10 Future extensibility (not phase 1, but the schema above should not block these)

- **Pipeline/Deal forms** — the product discussion explicitly scoped this out for v1 ("we have to do it from Companies, Contact and Vendors"), but `Form.module` as an enum makes adding `"Deal"` later additive, not a rewrite, provided `DealFields`/`dealController` get the same service-layer extraction as Contact/Company/Vendor.
- **Workflow automation** (auto-assign owner, trigger email sequences on import) — hook point is `FormResponse.status → "imported"`, emit an event other modules can subscribe to later.
- **Analytics** (views, conversion rate, drop-off per field) — requires a lightweight `FormView` event log; not in v1 schema above but additive.
- **Webhooks on submission** — same event hook as automation.
- **Versioning** — flagged as an explicit open decision (D3) since it affects the schema shape now, not later.

---

## 3. Phased Implementation Roadmap

Each phase is independently implementable, testable, and — per your process — should end with an update to a running `FORMS_IMPLEMENTATION.md` log (files changed, decisions made, next step).

**Phase 0 — Service-layer extraction (prerequisite, touches existing code)**
Extract `createContact`/`createCompany`/`createVendor`'s field-merge + save logic out of the controllers into the service set from §2.1 (`contactService`/`companyService`/`vendorService` as thin orchestrators over `fieldValidationService`/`fieldCoercionService`), accepting an explicit `organizationId` rather than reading `req.user`. Refactor existing controllers to call these services (behavior-preserving refactor, covered by existing manual QA of Create Contact/Company/Vendor). This is what makes every later phase avoid duplicating business logic. *Depends on: nothing. Blocks: everything else.*

**Phase 1 — Forms data model + authenticated CRUD**
`Form` model + `backend/routes/formRoutes.js` + controller. No builder UI yet — testable via API client (Postman/curl) against a hand-built form JSON. *Depends on: Phase 0 (so `module` enum and field-key resolution can be validated against real field definitions).*

**Phase 2 — Public form rendering (read-only)**
`GET /api/public/forms/:publicSlug` + `PublicForm.jsx` rendering a static form from a Phase-1-created `Form` doc. No submission handling yet — literally just proves the public/unauthenticated path and field-resolution-at-request-time work. *Depends on: Phase 1.*

**Phase 3 — Shared field renderer + coercion utility**
Build `DynamicFieldRenderer.jsx` (frontend) and `fieldCoercion.js` (backend) as *genuinely shared* pieces, used by Phase 2's `PublicForm.jsx` and by the Phase 4 builder preview. Optionally retrofit into one existing Quick*Form as a proof it doesn't regress the existing UI (not mandatory for Forms to ship, but strongly reduces future drift). *Depends on: Phase 2 (need a real consumer to design against).*

**Phase 4 — Submission pipeline (no duplicate engine yet)**
`POST /api/public/forms/:publicSlug/submit` → `FormResponse` creation → validation via Phase 3's coercion util → direct call into Phase 0's create-services when `duplicateStrategy === "allow_duplicates"`. This alone is a shippable v0.1 (forms that just create records, no dedup) if you want an early checkpoint. *Depends on: Phases 0, 1, 3.*

**Phase 5 — Form Builder UI**
`FieldsPanel`, `LayoutCanvas`, `FieldPropertiesPanel`, `ToolsPanel`, `ThemePanel`, wired to Phase 1's CRUD API. Broken into its own sub-sequence (Canvas → Properties Panel → Tools → Theme → Publish flow), matching the granularity in your own roadmap notes. *Depends on: Phase 1, Phase 3 (preview reuses the shared renderer).*

**Phase 6 — Sharing (link, QR, embed)**
Publish flow, QR generation, embed snippet generator. Low-risk, mostly frontend + one `publish` endpoint already scaffolded in Phase 1. *Depends on: Phase 5.*

**Phase 7 — Duplicate Intelligence Engine**
`duplicateEngine.js`, `DuplicateReview` model, scoring logic, wired into Phase 4's submission pipeline for `duplicateStrategy !== "allow_duplicates"`. Built as a standalone service from day one so it's positioned (not necessarily wired) for reuse by bulk-import later. *Depends on: Phase 4.*

**Phase 8 — Review Center + Submissions Inbox UI**
`ReviewCenter.jsx` (merge/keep-separate/review-later, field-by-field diff), `SubmissionsInbox.jsx` (per-form pending/needs-review/imported list). *Depends on: Phase 7.*

**Phase 9 — Notifications**
Owner notification on submit, visitor acknowledgment email, reusing existing `emailController`/`emailTemplateController` infra rather than building new email plumbing. *Depends on: Phase 4 (needs a submission to notify about); can be built in parallel with 7/8.*

**Phase 10 — Provenance & polish**
`createdVia` field on Contact/Company/Vendor, red-outline "unlinked/duplicate" UI treatment in the existing Contacts/Companies list views, permission checks (who can create/edit/delete forms), plan-based limits (forms per org, submissions per month) via the existing `restrictByPlan` pattern. *Depends on: Phase 7.*

**Not in this roadmap (deferred per product discussion scope):** Pipeline/Deal forms, workflow automation, analytics dashboards, webhooks — all called out in §2.10 as additive later.

---

## 4. Risks & Edge Cases

- **`pre("save")` hook on Contact only fires on `.save()`**, not `findOneAndUpdate`. If Phase 0's service layer or Phase 8's merge flow uses `findOneAndUpdate` for efficiency, `stageStatus`/`lifecycleStage` consistency validation will silently not run. Service layer should standardize on `.save()` or explicitly re-validate.
- **`Vendor.company` is a free-text string, not a ref.** If a Vendor form later needs "link to existing Company" (not currently in scope per the product discussion, but worth flagging), this requires a schema migration, not just new Forms code.
- **`Company.address` is a flat string while `Vendor.address` is structured** (`{line1, line2, city, state, pincode, country}`). Forms' field-key resolution needs to know per-module which shape to expect — this inconsistency should not leak into the Forms layer as a special case; the shared field-coercion util needs an explicit per-module address handler.
- **S3 upload middleware has no server-side size/type enforcement today.** This is an existing latent issue in the authenticated app that becomes materially worse once exposed on an unauthenticated public form — must be fixed as part of Phase 4/the public upload path, not deferred.
- **No rate limiting exists anywhere in the current middleware stack** for any route, since every route assumes an authenticated, already-throttled-by-plan user. Public Forms is the first surface that needs IP-based throttling independent of the plan-limit system.
- **`additionalFields` merge silently defaults unknown field names to `type: "text"`** rather than rejecting them — a public form submitting an unexpected `fieldKey` (tampered payload, stale cached form) would currently be silently coerced instead of rejected. The Forms submission validator (Phase 4) should explicitly reject fieldKeys not present in the form's resolved layout, rather than inheriting this permissive behavior.
- **No `required` enforcement exists in the current field-merge logic** even in the authenticated app (noted in the audit) — Forms should not inherit this gap; required-field enforcement needs to be added as part of Phase 3's coercion util, ideally benefiting the existing Quick*Form paths too if retrofitted.

---

## 5. Open Architectural Decisions

These need product input before (or during) Phase 4/7 implementation — flagged now to avoid the "discover mid-build" pattern.

**D1 — Should submissions go directly into the CRM or first into a review queue?**
Trade-off: direct-write is simpler and matches "Allow Duplicates" mode's spirit, but means bad/spam data lands in the CRM immediately and pollutes lists before anyone reviews it. Review-queue-first for *everything* is safer but creates needless manual work for the common case — a new company, valid email, zero duplicate signal, no validation errors shouldn't sit in a queue waiting for a human to click "approve" on something that was never in question.
*Recommendation:* Not "review-first with an exception," but the reverse framing: **auto-import is the default path, review is the exception path.** A submission auto-imports (step 7 of §2.8) whenever all three hold — required-field validation passes, no `DuplicateReview` was created, no format-level `validationErrors`. It only lands in the queue when one of those fails. This keeps the queue meaningfully small (genuinely ambiguous cases only) rather than becoming a rubber-stamp chore that gets ignored after week one.

**D2 — Should duplicate detection be synchronous or asynchronous?**
Trade-off: synchronous (run before responding to the visitor) means the visitor could wait a couple hundred ms longer, but the CRM user gets a fully-resolved-or-flagged record with no race window. Asynchronous (respond immediately, queue detection as a background job) is faster for the visitor but means a brief window where a duplicate exists unflagged, and needs a job queue (nothing like that exists in this codebase today — no Bull/Agenda visible, only `backend/jobs/` which is worth checking for existing patterns before deciding).
*Recommendation:* Synchronous for v1. The matching signals in §2.4 (exact email/GSTIN/domain, fuzzy name) are cheap indexed lookups, not ML inference — sub-100ms is realistic, and it avoids introducing new infrastructure (job queue) just for this feature.

**D3 — Should forms use versioning?**
Trade-off: without versioning, editing a published form's fields retroactively changes how old submissions are interpreted — if a required field is deleted and a new one added, a submission from last month becomes uninterpretable against "the current form," since there's no record of what the form actually looked like when that visitor filled it in. The cost of versioning is a small amount of extra bookkeeping (an integer counter + a stamp on each response), not a full content-management-style version history.
*Recommendation:* Yes — but keep it simple, not a full version-history feature. `Form.formVersion` is a plain integer, incremented on every *structural* change to `layout` on publish (adding/removing/renaming a field or section; theme/tools-only edits do not bump it). `FormResponse.formVersion` stamps which version was live at submission time (added to the schema in §2.2). This is enough to answer "which fields existed when this submission came in" for the Review Center and Submissions Inbox, without building a full diff/rollback/history UI — that's a legitimate v2 feature if it turns out to be needed, not a v1 requirement.

**D4 — Should deleted fields remain on published forms?**
Trade-off: if a custom field is deleted from Settings (e.g., Company Fields) after a form referencing it is published, the form either (a) silently drops that field on next render, confusing anyone comparing the live form to what they built, or (b) keeps showing it as an orphaned field, which could error since there's no field definition left to validate against.
*Recommendation:* On field deletion in Settings, check `Form.layout` across the org for references to that fieldKey; either block deletion with a warning ("used in 2 published forms") or auto-remove the field from those forms' layout and flag the form as "needs attention" in the Forms list. Blocking is simpler and safer for v1.

**D5 — Should form submissions be editable after submission (by the visitor)?**
Trade-off: Bigin doesn't offer this, and it adds meaningful complexity (needs a submission-owner token, edit window, re-validation, re-dedup). Not mentioned anywhere in the product discussion.
*Recommendation:* Out of scope for v1. Revisit only if a concrete use case emerges (e.g., "double opt-in" style flows in Bigin, which the product discussion explicitly called low-priority).

**D6 — Should duplicate detection be a shared engine across Forms, Imports, and Manual Create?**
Trade-off: building it Forms-only is faster to ship but means bulk-import (which today has zero dedup) and manual create keep drifting further from Forms' behavior — exactly the two-creation-paths problem this whole document is trying to avoid at the record-creation layer. Building it fully shared from day one delays Forms shipping while you retrofit import/manual-create call sites.
*Recommendation:* Build `duplicateEngine.js` (§2.4) as a standalone service with a generic interface now (this is cheap — it's just good module boundaries), but only *wire it into* Forms in Phase 7. Wiring it into bulk-import and manual create is a fast follow-up, not a Forms blocker, since the hard part (the engine itself) is already reusable once it exists.

**D7 — Company match on a Contact form: hold for review**
Trade-off: silently attaching a contact to a "probably right" Company is convenient but risks linking to the wrong company if the match is wrong (e.g., "Tesla Motors" vs. a same-named-but-different "Tesla Motors" in a different city that just happens to also be in the CRM).
*Recommendation:* Hold for review for all matches ≥ REVIEW_THRESHOLD. Create the Contact unlinked, flag a `DuplicateReview`, and surface it in the Review Center — matching the red-outline UX described in the product discussion rather than guessing silently. This aligns with D9.

**D8 — Should format-invalid data (bad email, malformed GSTIN) block submission or just get flagged?**
Trade-off: hard-blocking protects data quality but risks losing a real lead over a typo'd email format edge case on a public form where you can't ask the visitor to fix it interactively the way an internal user could. Soft-flagging (accept, mark `needs_review`) never turns away a submission but means "invalid" data briefly exists in `FormResponse` (not yet in the CRM proper, so contained).
*Recommendation:* Soft-flag, per §2.8 step 4 — never reject a public submission over a format issue if the required-field-presence check passes; let the CRM user fix-and-approve in the Submissions Inbox. Reserve hard rejection (400) for missing required fields and captcha/rate-limit failures only.

**D9 — What does "merge" actually mean, and does confidence score ever change what the system does? (raised during implementation; revised after product clarification)**

First pass at this decision (below, struck through in spirit if not in text) assumed a high-confidence match should be auto-resolved by the system. **That assumption was wrong.** Product clarification: the system **never** decides on a duplicate, at any confidence score — 60%, 85%, or 99% all produce the identical workflow. The duplicate engine's only job is to flag a possible match and (via `matchDetails`/`score`) explain *why* — a human always makes the actual call. Confidence score affects sorting/highlighting in the Review UI, never system behavior.

Given that, the product surface is exactly two outcomes, not three:
1. **Not a duplicate** — score below the "worth asking about" floor (still a real threshold — see below — just not a decision threshold). No user involvement: create the CRM record directly.
2. **Possible duplicate** — score at or above the floor. The submission is queued; a human sees the match (with the `matchDetails` explanation) and picks one of exactly two actions: **Keep both** (create a new record — `DuplicateReview.decision = "kept_separate"`) or **Keep existing** (don't create a new record, attach this submission to the existing one instead — `decision = "linked_to_existing"`).

**Update (post-publish UX pass): `mergeIntoExisting()` is now wired in as a third choice.** The two-outcome restriction above was the v1 scope; once the Duplicate Reviews tab was redesigned into a full side-by-side comparison view (`FormDetailPage.jsx`'s `DuplicateReviewModal`), a real product need surfaced for a per-field reconciliation option — a reviewer comparing two Company records field-by-field has no good way to express "keep this record, but take the new website value from the submission" using only Keep Both / Keep Existing. `POST /api/duplicate-reviews/:id/merge` was added as a thin pass-through to the already-existing `duplicateResolutionService.mergeIntoExisting()`, taking a `resolvedFieldValues` body. **The automation invariant from above still holds exactly**: the endpoint does not decide anything — it throws if `resolvedFieldValues` isn't supplied, and the frontend is the only thing that ever populates it, built from explicit per-field radio choices the reviewer makes in the comparison UI. Confidence score still never changes behavior. `DuplicateReview.decision = "merged"` is now reachable in practice, not just reserved in the schema.

Also added (same pass, same "expose what already exists" spirit): `GET /api/duplicate-reviews/:id`, returning `{ review, existingRecordData }` — the full existing CRM record fetched alongside the review, because `matchDetails` alone only covers the specific signals the detection engine checks per module (e.g. Contact: email/phone/name), not a complete field-by-field diff. This endpoint is what makes the comparison view possible; it added a database read, no new decision logic.

**Decision: `duplicateStrategy` has two values, not three: `"review_queue"` (the flag-and-ask workflow above) and `"allow_duplicates"` (skip duplicate detection entirely — every submission always creates a new record, i.e. always "keep both," with no engine call and no review queue involvement).** `"auto_merge_high_confidence"` and its later rename `"auto_attach_existing"` are both removed — there is no strategy value that causes automatic resolution, because that behavior doesn't exist in this product. The `REVIEW_THRESHOLD` (currently 80, per D7) remains: it's the "is this worth flagging at all" cutoff, purely to keep the review queue from filling with noise on faint matches — it is not, and was never correctly, a decision threshold.

---

*Next step, once these decisions are confirmed: begin Phase 0 (service-layer extraction) as the first implementation prompt, since every later phase depends on it.*
