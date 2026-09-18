import PdfIcon from "../components/common/PdfIcon";
// pages/FormDetailPage.jsx
// Form Detail — Build order step 2, per FORMS_FRONTEND_ARCHITECTURE.md §1.2/§3. New top-level
// route (/forms/:id), mirroring /companies/:id -> CompanyProfilePage.jsx's structure exactly:
// useParams for the id, a tab bar + activeTab useState, conditional content blocks per tab.
// Overview is real from the start (cheap — reuses data the other tabs need anyway); Submissions/
// Duplicate Reviews are placeholders until their own build-order steps land.
//
// Builder is NOT one of these tabs — later, explicit decision (post-dating the architecture doc's
// original tab list): Builder is a dedicated full-width route, /forms/:id/builder, sibling to this
// page rather than a tab within it. See FormBuilderPage.jsx.
import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import API from "../services/api";
import toast from "react-hot-toast";
import { ArrowLeft, ArrowRight, Pencil, Send, Inbox, AlertTriangle, X, ChevronDown, FileText, Database, Globe, Download as DownloadIcon2 } from "lucide-react";
import useBodyScrollLock from "../hooks/useBodyScrollLock";
import StatTile from "../components/common/StatTile";
import PublicLinkCard from "../components/forms/PublicLinkCard";
import ConfirmDialog from "../components/common/ConfirmDialog";

// Second independent copy of this exact pattern within Forms (FormsList.jsx has the first) — per
// architecture doc §6/decision 1, "copy, don't extract." Logged as flagged debt in
// FORMS_IMPLEMENTATION.md alongside the drawer duplication.
const STATUS_CONFIG = {
  draft: { bg: "bg-gray-50", text: "text-gray-700", border: "border-gray-200", dot: "bg-gray-400" },
  published: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200", dot: "bg-green-500" },
  paused: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-500" },
  archived: { bg: "bg-[#EEF2F9]", text: "text-[#56698A]", border: "border-[#D6DEEC]", dot: "bg-[#56698A]" },
};
const FormStatusBadge = ({ status }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

// Same small inline relative-time helper as FormsList.jsx — no shared date util exists in this
// codebase (confirmed in the frontend audit), so it stays local per file rather than becoming a
// new shared abstraction.
function timeAgo(dateString) {
  if (!dateString) return "—";
  const diffMs = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(dateString).toLocaleDateString();
}

const loadingMessages = [
  "Loading your form…",
  "Pulling up the details…",
  "Almost there — just a moment…",
];
const randomMessage = loadingMessages[Math.floor(Math.random() * loadingMessages.length)];

// Builder is deliberately NOT one of these tabs — per explicit decision, it's a dedicated full-width
// route (/forms/:id/builder), sibling to this tabbed page, not a tab within it. See FormBuilderPage.jsx.
// Submissions/Duplicate Reviews are conditionally shown, not part of this static list — see
// visibleTabs() below: a form that has never been published can't have collected anything, so
// those tabs stay hidden (not just disabled) until activeVersion exists.
const ALL_TABS = ["Overview", "Submissions", "Duplicate Reviews", "Settings"];
function visibleTabs(form, activeVersion) {
  if (form.status === "draft" && !activeVersion) return ["Overview", "Settings"];
  return ALL_TABS;
}

// Builder CTA copy names the state the user is actually in, replacing one generic "Continue
// Editing" that made sense for none of these states.
function builderCtaLabel(form, fieldCount) {
  if (form.status === "archived") return "View Builder";
  if (form.status === "draft") return fieldCount > 0 ? "Continue Building" : "Build Form";
  return "Edit Form";
}

// The Overview tab is state-aware rather than one view trying to serve every lifecycle stage —
// an empty draft, a drafted-but-unpublished form, a live form, and an archived form each need
// different information and a different primary action.
function OverviewTab({ form, activeVersion, submissionCount, pendingReviewCount, lastSubmittedAt, setActiveTab, navigate }) {
  const fieldCount = (form.layout || []).reduce((sum, section) => sum + (section.elements?.length || 0), 0);
  const ctaLabel = builderCtaLabel(form, fieldCount);

  if (form.status === "archived") {
    return (
      <div className="flex flex-col items-center text-center gap-3 max-w-md mx-auto py-10">
        <FormStatusBadge status="archived" />
        <p className="text-sm text-gray-500">
          This form has been retired. Submissions remain available, but it no longer accepts responses.
        </p>
        <button
          onClick={() => navigate(`/forms/${form._id}/builder`)}
          className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          {ctaLabel}
        </button>
      </div>
    );
  }

  if (form.status === "draft" && fieldCount === 0) {
    return (
      <div className="flex flex-col items-center text-center gap-4 max-w-lg mx-auto py-6">
        <div className="p-3 bg-blue-50 rounded-xl">
          <PdfIcon className="w-4 h-4 text-blue-600" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-900">Your form is empty.</h3>
          <p className="text-sm text-gray-500 mt-1">
            Start building by adding fields.
          </p>
        </div>
        <button
          onClick={() => navigate(`/forms/${form._id}/builder`)}
          className="px-6 py-3 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
        >
          {ctaLabel}
        </button>
        <div className="grid grid-cols-3 gap-3 mt-2 w-full">
          {["Collect submissions", "Review duplicates", "Share a public link"].map((label) => (
            <div key={label} className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs text-gray-400">
              After publishing you'll be able to<br /><span className="text-gray-600 font-medium">{label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Draft with fields but never published — still building toward the goal, not yet operating.
  if (form.status === "draft") {
    const steps = [
      { label: "Add fields", done: fieldCount > 0 },
      { label: "Preview", done: fieldCount > 0 },
      { label: "Publish", done: false },
    ];
    return (
      <div className="flex flex-col gap-6">
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
          <p className="text-xs text-gray-500 font-medium mb-3">Build Progress</p>
          <div className="flex flex-wrap gap-4">
            {steps.map((step) => (
              <div key={step.label} className="flex items-center gap-2">
                <span
                  className={`w-4 h-4 rounded-full border flex items-center justify-center text-[10px] ${
                    step.done ? "bg-blue-600 border-blue-600 text-white" : "border-gray-300 text-transparent"
                  }`}
                >
                  ✓
                </span>
                <span className={`text-sm ${step.done ? "text-gray-900 font-medium" : "text-gray-400"}`}>{step.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
            <p className="text-xs text-gray-500 font-medium">Builder</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{fieldCount} field{fieldCount === 1 ? "" : "s"}</p>
            <p className="text-xs text-gray-400 mt-0.5">Last edited {timeAgo(form.updatedAt)}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
            <p className="text-xs text-gray-500 font-medium">Status</p>
            <div className="mt-1"><FormStatusBadge status={form.status} /></div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => navigate(`/forms/${form._id}/builder`)}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            {ctaLabel}
          </button>
          <button
            onClick={() => setActiveTab("Settings")}
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            Publish Form
          </button>
        </div>
      </div>
    );
  }

  // Published (or paused) — operational dashboard. This is the only state where submission/review
  // stats are meaningful, so it's the only one that shows them.
  return (
    <div className="flex flex-col gap-6">
      {/* Same StatTile every other module's overview/KPI row uses (Referrals, Dashboard, company
          profile tabs), so this reads as one consistent stat style across the app instead of its
          own bespoke cards. */}
      <div className="flex flex-col sm:flex-row items-stretch gap-4">
        <StatTile
          tile={{
            icon: Send,
            iconClass: "text-blue-600",
            label: "Status",
            value: <FormStatusBadge status={form.status} />,
            subtitle: activeVersion ? `Published ${timeAgo(activeVersion.publishedAt)}` : "—",
          }}
        />
        <StatTile
          tile={{
            icon: Inbox,
            iconClass: "text-emerald-600",
            label: "Submissions",
            value: submissionCount,
            subtitle: lastSubmittedAt ? `Last ${timeAgo(lastSubmittedAt)}` : "None yet",
          }}
        />
        <StatTile
          tile={{
            icon: AlertTriangle,
            iconClass: pendingReviewCount > 0 ? "text-amber-500" : "text-gray-400",
            label: "Pending Reviews",
            value: pendingReviewCount,
            subtitle: pendingReviewCount > 0 ? "Needs attention" : "All clear",
            subtitleClass: pendingReviewCount > 0 ? "text-amber-600 font-medium" : "text-gray-400",
          }}
        />
      </div>

      <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
        <p className="text-sm font-semibold text-gray-800">
          {form.status === "published" ? "Your form is live. Share it using the link below." : "Share this form"}
        </p>
        <div className="mt-3">
          <PublicLinkCard publicSlug={form.publishState?.publicSlug} published={form.status === "published"} title={form.title} />
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => navigate(`/forms/${form._id}/builder`)}
          className="px-4 py-2.5 bg-[#0085FF] text-white text-sm font-semibold rounded-full hover:bg-blue-600 transition-colors"
        >
          {ctaLabel}
        </button>
        {submissionCount > 0 && (
          <button
            onClick={() => setActiveTab("Submissions")}
            className="px-4 py-2.5 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-full hover:bg-gray-50 transition-colors"
          >
            View Submissions
          </button>
        )}
        {pendingReviewCount > 0 && (
          <button
            onClick={() => setActiveTab("Duplicate Reviews")}
            className="px-4 py-2.5 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-full hover:bg-gray-50 transition-colors"
          >
            Review Duplicates
          </button>
        )}
        {/* "Open Public Form" intentionally omitted — no public renderer page exists yet to open. */}
      </div>
    </div>
  );
}

function SettingsSection({ title, description, children }) {
  return (
    <div className="py-5 border-b border-gray-100 last:border-0 grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div className="sm:col-span-1">
        <p className="text-sm font-semibold text-gray-800">{title}</p>
        {description && <p className="text-xs text-gray-500 mt-1">{description}</p>}
      </div>
      <div className="sm:col-span-2">{children}</div>
    </div>
  );
}

function FormSettingsTab({ form, onFormUpdated }) {
  const navigate = useNavigate();
  const [title, setTitle] = useState(form.title);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Which destructive action is awaiting confirmation: "archive" | "delete" | null. Replaces two
  // window.confirm() calls - the native dialog can't be styled and looked nothing like the app.
  const [confirm, setConfirm] = useState(null);

  const saveTitle = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    try {
      const res = await API.patch(`/forms/${form._id}`, { title: title.trim() });
      onFormUpdated(res.data.form);
      toast.success("Saved");
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    setPublishing(true);
    try {
      const res = await API.post(`/forms/${form._id}/publish`);
      onFormUpdated(res.data.form);
      toast.success(`Published (version ${res.data.versionNumber})`);
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to publish");
    } finally {
      setPublishing(false);
    }
  };

  const togglePause = async () => {
    setPausing(true);
    try {
      const isPaused = form.status === "paused";
      const res = await API.post(`/forms/${form._id}/${isPaused ? "resume" : "pause"}`);
      onFormUpdated(res.data.form);
      toast.success(isPaused ? "Form resumed — accepting submissions again" : "Form paused — submissions are blocked until resumed");
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to update form");
    } finally {
      setPausing(false);
    }
  };

  const archive = async () => {
    setConfirm(null);
    setArchiving(true);
    try {
      const res = await API.post(`/forms/${form._id}/archive`);
      onFormUpdated(res.data.form);
      toast.success("Form archived");
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to archive");
    } finally {
      setArchiving(false);
    }
  };

  const deleteForm = async () => {
    setConfirm(null);
    setDeleting(true);
    try {
      await API.delete(`/forms/${form._id}`);
      toast.success("Form deleted");
      navigate("/settings/forms");
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to delete form");
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-2xl divide-y divide-gray-100">
      <SettingsSection title="Title">
        <div className="flex gap-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={saveTitle}
            disabled={saving}
            className="px-4 py-2 bg-[#0085FF] text-white text-sm font-semibold rounded-full hover:bg-blue-600 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </SettingsSection>

      <SettingsSection title="Module" description="Which CRM records this form creates. Can't be changed after creation.">
        <p className="text-sm text-gray-700">{form.module}</p>
      </SettingsSection>

      <SettingsSection
        title="Status"
        description={form.status === "draft" ? "Publishing requires at least one field in the Builder." : "Pause temporarily blocks new submissions — resume anytime to start collecting again, same link, same form."}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <FormStatusBadge status={form.status} />
          {form.status === "draft" && (
            <button
              onClick={publish}
              disabled={publishing}
              className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-full hover:bg-green-700 disabled:opacity-50"
            >
              {publishing ? "Publishing..." : "Publish"}
            </button>
          )}
          {(form.status === "published" || form.status === "paused") && (
            <button
              onClick={togglePause}
              disabled={pausing}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-semibold rounded-full hover:bg-gray-50 disabled:opacity-50"
            >
              {pausing ? "Working..." : form.status === "paused" ? "Resume" : "Pause"}
            </button>
          )}
        </div>
      </SettingsSection>

      {(form.status === "published" || form.status === "paused") && (
        <SettingsSection
          title="Archive"
          description="Permanently retires this form — unlike Pause, there is no way back to Published. An archived form with no submissions can then be deleted."
        >
          <button
            onClick={() => setConfirm("archive")}
            disabled={archiving}
            className="px-4 py-2 bg-white border border-red-300 text-red-600 text-sm font-semibold rounded-full hover:bg-red-50 disabled:opacity-50"
          >
            {archiving ? "Archiving..." : "Archive Form"}
          </button>
        </SettingsSection>
      )}

      {(form.status === "draft" || form.status === "archived") && (
        <SettingsSection
          title="Delete"
          description={
            form.status === "archived"
              ? "Only possible if this form has no submissions."
              : "Permanently remove this draft. This cannot be undone."
          }
        >
          <button
            onClick={() => setConfirm("delete")}
            disabled={deleting}
            className="px-4 py-2 bg-white border border-red-300 text-red-600 text-sm font-semibold rounded-full hover:bg-red-50 disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete Form"}
          </button>
        </SettingsSection>
      )}

      <ConfirmDialog
        isOpen={confirm !== null}
        title={confirm === "archive" ? "Archive this form?" : "Delete this form?"}
        message={
          confirm === "archive"
            ? "Unlike Pause, this cannot be undone — the form can't be republished, only deleted afterward."
            : "This permanently removes the form. This cannot be undone."
        }
        confirmLabel={confirm === "archive" ? "Archive" : "Delete"}
        onConfirm={confirm === "archive" ? archive : deleteForm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

const REVIEW_STATUS_LABEL = { not_required: "Not required", needs_review: "Needs review", resolved: "Resolved" };
const IMPORT_STATUS_LABEL = { not_imported: "Not imported", imported: "Imported" };

const PROCESSING_STATUS_LABEL = { pending: "Pending", validated: "Validated", rejected: "Rejected" };

// Section chrome for the submission panel. Deliberately NOT a bordered box with a grey header
// bar per section - four of those stacked made the panel read as four competing cards. This is a
// quiet label + a chevron, with the content sitting directly beneath on the panel's own surface.
function CollapsibleSection({ title, icon: Icon, iconClass = "bg-gray-100 text-gray-500", defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2.5 group mb-2.5"
      >
        {Icon && (
          <span className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${iconClass}`}>
            <Icon className="w-3.5 h-3.5" />
          </span>
        )}
        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider group-hover:text-gray-700 transition-colors">
          {title}
        </span>
        <span className="flex-1 h-px bg-gray-100" />
        <ChevronDown
          className={`w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-all flex-shrink-0 ${open ? "" : "-rotate-90"}`}
        />
      </button>
      {open && children}
    </section>
  );
}

function LabelValueRow({ label, value }) {
  return (
    // Label above value rather than side-by-side: submitted values are arbitrary form fields, so
    // long labels and long values both wrapped badly in a two-column row. Rows live inside a
    // bordered card (see callers) so a list of values reads as a record, not loose text.
    <div className="px-3.5 py-2.5">
      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-sm text-gray-900 font-medium break-words leading-snug">
        {value ?? <span className="text-gray-300 font-normal">—</span>}
      </p>
    </div>
  );
}

function SubmissionDrawer({ formId, submissionId, onClose }) {
  const [submission, setSubmission] = useState(null);
  const [resolvedFields, setResolvedFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRaw, setShowRaw] = useState(false);
  // Slide-in/out exactly like QuickCompanyForm: mount closed, flip to open on the next tick so the
  // transform transition actually runs, and on close play the exit before unmounting.
  const [isOpen, setIsOpen] = useState(false);
  useBodyScrollLock(isOpen);

  useEffect(() => {
    const t = setTimeout(() => setIsOpen(true), 10);
    return () => clearTimeout(t);
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    setTimeout(onClose, 300);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    API.get(`/forms/${formId}/submissions/${submissionId}`)
      .then((res) => {
        if (cancelled) return;
        setSubmission(res.data.submission);
        setResolvedFields(res.data.resolvedFields || []);
      })
      .catch(() => { if (!cancelled) toast.error("Failed to load submission"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [formId, submissionId]);

  const fieldData = submission?.processedData || submission?.rawData || {};
  const fieldKeys = Object.keys(fieldData).filter((k) => !HIDDEN_RECORD_KEYS.has(k));
  // processedData is keyed by fieldId, so fall back through the frozen labels from the version this
  // was submitted against before resorting to prettifying the raw id.
  const metaByFieldId = new Map(resolvedFields.map((f) => [f.fieldId, f]));
  const submittedLabel = (key) => metaByFieldId.get(key)?.label || recordFieldLabel(key);
  const isImageValue = (key, value) =>
    metaByFieldId.get(key)?.type === "file" && typeof value === "string" && /^https?:\/\//.test(value);

  return (
    <>
      {/* Same panel shell every create/edit form in the app uses (QuickCompanyForm et al.):
          dc-panel-card/dc-panel-w inset card, blurred backdrop, sticky uppercase header with an
          X, and a scrollable px-8 py-6 body — instead of this drawer's own flush-to-edge sheet. */}
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[10000] transition-opacity duration-300 ease-in-out"
        style={{ opacity: isOpen ? 1 : 0 }}
        onClick={handleClose}
      />

      <div
        className={`
          fixed dc-panel-card dc-panel-w z-[10003]
          bg-white shadow-2xl flex flex-col overflow-hidden
          transform transition-transform duration-300 ease-in-out font-inter
          ${isOpen ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"}
        `}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#D9D9D9] flex-shrink-0 bg-white gap-1">
          <h2 className="text-[15px] font-normal leading-6 text-[#78788D] uppercase tracking-wide">
            Submission
          </h2>
          <button
            type="button"
            onClick={handleClose}
            title="Close"
            className="w-5 h-5 flex items-center justify-center text-[#1C1B1F] hover:opacity-70 transition-opacity"
            aria-label="Close"
          >
            <X className="w-[18px] h-[18px]" strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 flex flex-col gap-6">
        {loading || !submission ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <>
            {/* Subject line + statuses, in the panel's own voice. The pills carry their real
                status colours now (the same maps the list uses) - as flat grey they read as
                inert labels and lost the one thing a status is for. Timeline folded in here
                too: two dates did not need a section of their own. */}
            <div className="pb-4 border-b border-gray-100">
              <div className="min-w-0">
                <div>
                  <p className="text-base font-semibold text-gray-900 leading-tight">
                    {new Date(submission.submittedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Submitted at {new Date(submission.submittedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
                    {submission.reviewedAt ? ` · reviewed ${timeAgo(submission.reviewedAt)}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                <StatusPill value={submission.processingStatus} labelMap={PROCESSING_STATUS_LABEL} colorMap={PROCESSING_STATUS_BADGE} />
                <StatusPill value={submission.reviewStatus} labelMap={REVIEW_STATUS_LABEL} colorMap={REVIEW_STATUS_BADGE} />
                <StatusPill value={submission.importStatus} labelMap={IMPORT_STATUS_LABEL} colorMap={IMPORT_STATUS_BADGE} />
              </div>
            </div>

            {fieldKeys.length > 0 && (
              <CollapsibleSection title="Submitted Values" icon={FileText} iconClass="bg-blue-50 text-blue-600">
                <div className="flex flex-col divide-y divide-gray-100 rounded-xl border border-gray-200 bg-gray-50/50 overflow-hidden">
                  {fieldKeys.map((key) =>
                    isImageValue(key, fieldData[key]) ? (
                      <div key={key} className="px-3.5 py-2.5 flex items-start gap-3">
                        <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide w-28 shrink-0 pt-1">{submittedLabel(key)}</span>
                        <a href={fieldData[key]} target="_blank" rel="noreferrer" className="shrink-0">
                          <img src={fieldData[key]} alt="" className="w-16 h-16 rounded border border-gray-200 object-contain bg-gray-50" />
                        </a>
                      </div>
                    ) : (
                      <LabelValueRow key={key} label={submittedLabel(key)} value={normalizeForCompare(fieldData[key])} />
                    )
                  )}
                </div>
              </CollapsibleSection>
            )}

            {submission.uploadedFiles?.length > 0 && (
              <CollapsibleSection title="Uploaded Files" icon={DownloadIcon2} iconClass="bg-violet-50 text-violet-600">
                <ul className="flex flex-col divide-y divide-gray-100 rounded-xl border border-gray-200 bg-gray-50/50 overflow-hidden">
                  {submission.uploadedFiles.map((f, i) => (
                    <li key={i} className="text-sm px-3.5 py-2.5">
                      <a href={f.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline break-all">
                        {f.originalName || f.url}
                      </a>
                      {f.size != null && <span className="text-gray-400 text-xs ml-1.5">({Math.round(f.size / 1024)} KB)</span>}
                    </li>
                  ))}
                </ul>
              </CollapsibleSection>
            )}

            {submission.validationErrors?.length > 0 && (
              <CollapsibleSection title="Validation Errors" icon={AlertTriangle} iconClass="bg-red-50 text-red-500">
                <ul className="flex flex-col divide-y divide-red-100 rounded-xl border border-red-100 bg-red-50/40 overflow-hidden">
                  {submission.validationErrors.map((v, i) => (
                    <li key={i} className="text-sm text-red-600 px-3.5 py-2.5"><span className="font-medium">{submittedLabel(v.fieldId)}</span>: {v.message}</li>
                  ))}
                </ul>
              </CollapsibleSection>
            )}

            {submission.resultingRecords?.length > 0 && (
              <CollapsibleSection title="Records Created" icon={Database} iconClass="bg-emerald-50 text-emerald-600">
                {/* The whole point of a form is the CRM record it produces, so this is the one link
                    that closes the loop. resultingRecords already carries {module, recordId}; it was
                    being rendered as dead text. */}
                <ul className="flex flex-col gap-2">
                  {submission.resultingRecords.map((r, i) => {
                    const href = crmRecordPath(r.module, r.recordId);
                    return (
                      <li key={i} className="text-sm">
                        {href ? (
                          <Link
                            to={href}
                            className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50/60 hover:border-blue-300 hover:bg-blue-50/40 transition-colors group"
                          >
                            <span className="font-medium text-gray-900">{r.module}</span>
                            <span className="text-xs font-medium text-blue-600 inline-flex items-center gap-1">
                              View <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                            </span>
                          </Link>
                        ) : (
                          <span className="text-gray-700">{r.module} record created</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </CollapsibleSection>
            )}

            {submission.sourceMeta && (
              <CollapsibleSection title="Source" icon={Globe} iconClass="bg-amber-50 text-amber-600" defaultOpen={false}>
                <div className="flex flex-col divide-y divide-gray-100 rounded-xl border border-gray-200 bg-gray-50/50 overflow-hidden">
                  {submission.sourceMeta.referrer && <LabelValueRow label="Referrer" value={submission.sourceMeta.referrer} />}
                  {submission.sourceMeta.utm?.source && <LabelValueRow label="UTM Source" value={submission.sourceMeta.utm.source} />}
                  {submission.sourceMeta.utm?.medium && <LabelValueRow label="UTM Medium" value={submission.sourceMeta.utm.medium} />}
                  {submission.sourceMeta.utm?.campaign && <LabelValueRow label="UTM Campaign" value={submission.sourceMeta.utm.campaign} />}
                  {submission.sourceMeta.ip && <LabelValueRow label="IP Address" value={submission.sourceMeta.ip} />}
                </div>
              </CollapsibleSection>
            )}

            <div className="pt-2 border-t border-gray-100">
              <button
                onClick={() => setShowRaw((s) => !s)}
                className="text-xs font-medium text-gray-400 hover:text-gray-600"
              >
                {showRaw ? "Hide raw JSON" : "Show raw JSON"}
              </button>
              {showRaw && (
                <pre className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 mt-2 overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(submission.rawData, null, 2)}
                </pre>
              )}
            </div>
          </>
        )}
        </div>
      </div>
    </>
  );
}

const REVIEW_STATUS_BADGE = {
  not_required: "bg-[#EEF2F9] text-[#56698A]",
  needs_review: "bg-[#FDF3E6] text-[#EA9927]",
  resolved: "bg-[#E6F7EF] text-[#1FA971]",
};
const IMPORT_STATUS_BADGE = {
  not_imported: "bg-[#EEF2F9] text-[#56698A]",
  imported: "bg-[#E6F8FD] text-[#27B4EA]",
};
const PROCESSING_STATUS_BADGE = {
  pending: "bg-[#EEF2F9] text-[#56698A]",
  validated: "bg-[#E6F7EF] text-[#1FA971]",
  rejected: "bg-[#FCEAEA] text-[#EA4B4B]",
};
function StatusPill({ value, labelMap, colorMap }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${colorMap[value] || "bg-gray-100 text-gray-500"}`}>
      {labelMap[value] || value}
    </span>
  );
}

const SUBMISSION_FILTERS = [
  { key: "reviewStatus", label: "Review status", options: REVIEW_STATUS_LABEL },
  { key: "importStatus", label: "Import status", options: IMPORT_STATUS_LABEL },
  { key: "processingStatus", label: "Processing", options: PROCESSING_STATUS_LABEL },
];

function SubmissionsTab({ formId, onOpenReview }) {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [findingReviewFor, setFindingReviewFor] = useState(null);
  const [filters, setFilters] = useState({ reviewStatus: "", importStatus: "", processingStatus: "" });

  const goToReview = async (e, submissionId) => {
    e.stopPropagation(); // don't also open the submission drawer behind it
    setFindingReviewFor(submissionId);
    try {
      const res = await API.get("/duplicate-reviews", { params: { formSubmission: submissionId, decision: "pending", limit: 1 } });
      const review = res.data.reviews?.[0];
      if (review) onOpenReview?.(review._id);
      else toast.error("No pending review found for this submission");
    } catch {
      toast.error("Failed to open review");
    } finally {
      setFindingReviewFor(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = { limit: 50 };
    Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
    API.get(`/forms/${formId}/submissions`, { params })
      .then((res) => { if (!cancelled) setSubmissions(res.data.submissions || []); })
      .catch(() => { if (!cancelled) toast.error("Failed to load submissions"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [formId, filters]);

  const hasActiveFilters = Object.values(filters).some(Boolean);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {SUBMISSION_FILTERS.map(({ key, label, options }) => (
          <select
            key={key}
            value={filters[key]}
            onChange={(e) => setFilters((prev) => ({ ...prev, [key]: e.target.value }))}
            className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">{label}: All</option>
            {Object.entries(options).map(([value, optLabel]) => (
              <option key={value} value={value}>{optLabel}</option>
            ))}
          </select>
        ))}
        {hasActiveFilters && (
          <button
            onClick={() => setFilters({ reviewStatus: "", importStatus: "", processingStatus: "" })}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Same row-card list CompanyTasksTable.jsx uses (space-y-3, bg-white rounded-lg border
          border-gray-200 p-3, hover:border-gray-300) instead of a plain table — one consistent
          "list of items" look across the app rather than a bespoke table on this tab. */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : submissions.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
          <Inbox className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-600">{hasActiveFilters ? "No submissions match these filters" : "No submissions yet"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {submissions.map((s) => (
            <div
              key={s._id}
              onClick={() => setOpenId(s._id)}
              className="bg-white rounded-lg border border-gray-200 p-3 hover:border-gray-300 transition-all cursor-pointer group"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h4 className="text-sm font-medium text-gray-900">{timeAgo(s.submittedAt)}</h4>
                {s.reviewStatus === "needs_review" ? (
                  <button
                    onClick={(e) => goToReview(e, s._id)}
                    disabled={findingReviewFor === s._id}
                    className="inline-flex items-center gap-1.5 hover:underline disabled:opacity-50 shrink-0"
                    title="Open this submission's pending duplicate review"
                  >
                    <StatusPill value={s.reviewStatus} labelMap={REVIEW_STATUS_LABEL} colorMap={REVIEW_STATUS_BADGE} />
                    <span className="text-xs font-medium text-blue-600">Review →</span>
                  </button>
                ) : (
                  <StatusPill value={s.reviewStatus} labelMap={REVIEW_STATUS_LABEL} colorMap={REVIEW_STATUS_BADGE} />
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-400">Import:</span>
                  <StatusPill value={s.importStatus} labelMap={IMPORT_STATUS_LABEL} colorMap={IMPORT_STATUS_BADGE} />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-400">Processing:</span>
                  <StatusPill value={s.processingStatus} labelMap={PROCESSING_STATUS_LABEL} colorMap={PROCESSING_STATUS_BADGE} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {openId && <SubmissionDrawer formId={formId} submissionId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

// Plain field names as stored on incomingData/the CRM record itself (not "system:module.field"
// ids — those only exist in the Builder/layout; by the time a value reaches here it's already
// been resolved down to the record's own schema field name). Small local map, not shared/imported —
// matches this codebase's established "copy, don't extract" pattern for Forms.
const RECORD_FIELD_LABELS = {
  name: "Name", email: "Email", phone: "Phone", gstin: "GSTIN", address: "Address",
  website: "Website", industry: "Industry", profilePicture: "Profile Picture",
  avatar: "Profile Picture", leadSource: "Lead Source", lifecycleStage: "Lifecycle Stage",
  stageStatus: "Stage Status", socialMedia: "Social Media", additionalFields: "Custom Fields",
  billingAddress: "Billing Address", shippingAddresses: "Shipping Addresses", balance: "Balance",
};
function recordFieldLabel(key) {
  return RECORD_FIELD_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

// Fields on the raw Mongoose record that are never meaningful to a human comparing two records —
// internal refs, audit columns, and per-user preference lists (starredBy) that carry no information
// about whether these two records are the same entity.
const HIDDEN_RECORD_KEYS = new Set([
  "_id", "__v", "organization", "createdAt", "updatedAt", "createdBy", "lastUpdatedBy", "user", "company",
  "starredBy", "parentCompany", "subsidiaries",
]);

// Renders a value for display AND for equality comparison — the two must agree, or the reviewer
// sees one thing and the diff decides another.
//
// Nested objects and arrays are now routine on these records (Company.billingAddress,
// Company.shippingAddresses[], socialMedia, Vendor.address). A bare String(v) turned every one of
// them into "[object Object]", which made two COMPLETELY DIFFERENT addresses compare equal and show
// up as "same" — hiding a real difference from someone choosing which record to keep. Flattening to
// the concatenated leaf values fixes both the display and the comparison.
// Route for a created CRM record, matching the paths registered in App.jsx (/contacts/:id,
// /companies/:id, /vendors/:id). Returns null for an unknown module rather than guessing a URL.
const CRM_RECORD_BASE = { Contact: "/contacts", Company: "/companies", Vendor: "/vendors" };
function crmRecordPath(module, recordId) {
  const base = CRM_RECORD_BASE[module];
  return base && recordId ? `${base}/${recordId}` : null;
}

// Engine signal names (duplicateDetectionService) in reviewer-facing words.
const SIGNAL_LABELS = {
  email: "Email",
  phone: "Phone",
  gstin: "GSTIN",
  website: "Website",
  name_fuzzy: "Name",
};

// Turn one stored matchDetail into a sentence that says what was actually compared. `weight` is the
// engine's contribution to the score; for name_fuzzy it is the similarity scaled by that signal's
// maximum, so it doubles as a readable strength indicator.
function signalExplanation(d) {
  const existing = normalizeForCompare(d.existingValue);
  const incoming = normalizeForCompare(d.incomingValue);

  if (!d.matched) {
    if (!existing && !incoming) return "not provided on either record";
    if (!incoming) return "not provided in this submission";
    if (!existing) return "the existing record has no value";
    return `different (“${existing}” vs “${incoming}”)`;
  }
  if (d.signal === "name_fuzzy") return `similar (“${existing}” vs “${incoming}”)`;
  return existing && existing === incoming ? `exact match on “${existing}”` : "matches";
}

function normalizeForCompare(v) {
  if (v === undefined || v === null || v === "") return "";
  if (Array.isArray(v)) return v.map(normalizeForCompare).filter(Boolean).join(" | ");
  if (typeof v === "object") {
    return Object.entries(v)
      .filter(([k]) => k !== "_id" && k !== "__v")
      .map(([, val]) => normalizeForCompare(val))
      .filter(Boolean)
      .join(", ");
  }
  return String(v).trim();
}

// One row per field that appears on either side. `status` drives the diff highlighting:
// "same" (identical), "changed" (both have a value, but different), "added" (only the new
// submission has it), "missing" (only the existing record has it — the submission didn't include it).
function buildComparisonRows(existingData, incomingData) {
  const keys = new Set([...Object.keys(existingData || {}), ...Object.keys(incomingData || {})]);
  return [...keys]
    .filter((k) => !HIDDEN_RECORD_KEYS.has(k))
    .map((key) => {
      const existingValue = existingData?.[key];
      const incomingValue = incomingData?.[key];
      const existingStr = normalizeForCompare(existingValue);
      const incomingStr = normalizeForCompare(incomingValue);
      let status;
      if (!incomingStr && existingStr) status = "missing";
      else if (!existingStr && incomingStr) status = "added";
      else if (existingStr === incomingStr) status = "same";
      else status = "changed";
      return { key, existingValue, incomingValue, status };
    })
    .filter((row) => row.status !== "same" || normalizeForCompare(row.existingValue) !== "")
    // Differences first — that's what the reviewer actually needs to look at.
    .sort((a, b) => (a.status === "same") - (b.status === "same"));
}

const ROW_STATUS_STYLE = {
  changed: "bg-amber-50",
  added: "bg-blue-50",
  missing: "bg-gray-50",
  same: "",
};

function DuplicateReviewModal({ reviewId, onClose, onResolved }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeChoices, setMergeChoices] = useState({}); // key -> "existing" | "new"

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    API.get(`/duplicate-reviews/${reviewId}`)
      .then((res) => { if (!cancelled) setDetail(res.data); })
      .catch(() => { if (!cancelled) toast.error("Failed to load review"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reviewId]);

  const review = detail?.review;
  const rows = detail ? buildComparisonRows(detail.existingRecordData, review.incomingData) : [];
  const matchedSignals = new Set((review?.matchDetails || []).filter((d) => d.matched).map((d) => d.signal));
  const editableRows = rows.filter((r) => r.status === "changed" || r.status === "added");

  const resolve = async (action) => {
    setResolving(true);
    try {
      if (action === "keep-separate") {
        await API.post(`/duplicate-reviews/${reviewId}/keep-separate`);
        toast.success("New record created — existing record untouched");
      } else if (action === "link") {
        await API.post(`/duplicate-reviews/${reviewId}/link`);
        toast.success("Kept the existing record — new submission's data was not added");
      } else if (action === "merge") {
        const resolvedFieldValues = {};
        editableRows.forEach((r) => {
          if (mergeChoices[r.key] === "new") resolvedFieldValues[r.key] = r.incomingValue;
        });
        await API.post(`/duplicate-reviews/${reviewId}/merge`, { resolvedFieldValues });
        toast.success("Existing record updated with the values you chose");
      }
      onResolved();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to resolve review");
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[85vh] bg-white rounded-xl shadow-xl overflow-y-auto flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Possible duplicate {review ? `— ${review.module}` : ""}</h2>
            {review && (
              <p className="text-xs text-gray-500 mt-0.5">
                {review.score}% match confidence
                {matchedSignals.size > 0 && <> · matched on {[...matchedSignals].join(", ")}</>}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-sm shrink-0 ml-4">Close</button>
        </div>

        {loading || !detail ? (
          <p className="text-sm text-gray-400 p-6">Loading…</p>
        ) : (
          <>
            {/* The engine already records every signal it weighed — which matched, which didn't,
                and the values it compared. Only the one-line summary above was being shown, which
                asks the reviewer to trust a percentage without seeing what produced it. */}
            {(review.matchDetails || []).length > 0 && (
              <div className="px-6 pt-4 shrink-0">
                <details open className="rounded-lg border border-gray-200 bg-gray-50/60">
                  <summary className="px-3 py-2 text-xs font-semibold text-gray-600 cursor-pointer select-none">
                    Why was this flagged?
                  </summary>
                  <div className="px-3 pb-2.5 flex flex-col gap-1.5">
                    {review.matchDetails.map((d, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <span className={d.matched ? "text-green-600" : "text-gray-300"}>{d.matched ? "✓" : "✕"}</span>
                        <div className="min-w-0">
                          <span className={d.matched ? "text-gray-700 font-medium" : "text-gray-400"}>
                            {SIGNAL_LABELS[d.signal] || d.signal}
                          </span>
                          <span className={d.matched ? "text-gray-500" : "text-gray-400"}> — {signalExplanation(d)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            )}

            <div className="px-6 pt-4 pb-2 grid grid-cols-2 gap-4 text-xs shrink-0">
              <div className="flex items-center gap-1.5 text-gray-500">
                <span className="w-2 h-2 rounded-full bg-gray-400 shrink-0" />
                Existing record {detail.existingRecordData?.createdAt && `· created ${timeAgo(detail.existingRecordData.createdAt)}`}
              </div>
              <div className="flex items-center gap-1.5 text-gray-500">
                <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                New submission · flagged {timeAgo(review.createdAt)}
              </div>
            </div>

            <div className="px-6 pb-4 flex-1 overflow-y-auto">
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-200">
                      <th className="py-2 px-3 font-medium w-1/4">Field</th>
                      <th className="py-2 px-3 font-medium">Existing Record</th>
                      <th className="py-2 px-3 font-medium">New Submission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.key} className={`border-b border-gray-100 last:border-0 ${ROW_STATUS_STYLE[row.status]}`}>
                        <td className="py-2 px-3 text-gray-500 align-top">{recordFieldLabel(row.key)}</td>
                        <td className="py-2 px-3 text-gray-800 align-top">
                          {normalizeForCompare(row.existingValue) || <span className="text-gray-300">—</span>}
                          {row.status === "missing" && <span className="ml-1.5 text-[10px] text-gray-400">(not in new submission)</span>}
                        </td>
                        <td className="py-2 px-3 align-top">
                          {mergeMode && (row.status === "changed" || row.status === "added") ? (
                            <div className="flex flex-col gap-1">
                              <label className="flex items-center gap-1.5 text-xs text-gray-700">
                                <input
                                  type="radio"
                                  name={`merge-${row.key}`}
                                  checked={(mergeChoices[row.key] || "existing") === "existing"}
                                  onChange={() => setMergeChoices((prev) => ({ ...prev, [row.key]: "existing" }))}
                                />
                                Keep existing: {normalizeForCompare(row.existingValue) || "(empty)"}
                              </label>
                              <label className="flex items-center gap-1.5 text-xs text-gray-700">
                                <input
                                  type="radio"
                                  name={`merge-${row.key}`}
                                  checked={mergeChoices[row.key] === "new"}
                                  onChange={() => setMergeChoices((prev) => ({ ...prev, [row.key]: "new" }))}
                                />
                                Use new: {normalizeForCompare(row.incomingValue)}
                              </label>
                            </div>
                          ) : (
                            <span className="text-gray-800">{normalizeForCompare(row.incomingValue) || <span className="text-gray-300">—</span>}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-4 mt-2 text-[11px] text-gray-400">
                <span><span className="inline-block w-2 h-2 rounded-full bg-amber-300 mr-1" />Different value</span>
                <span><span className="inline-block w-2 h-2 rounded-full bg-blue-300 mr-1" />Only in new submission</span>
                <span><span className="inline-block w-2 h-2 rounded-full bg-gray-300 mr-1" />Only in existing record</span>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 shrink-0">
              {!mergeMode ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => resolve("link")}
                    disabled={resolving}
                    className="px-3 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    Keep Existing Record
                  </button>
                  <button
                    onClick={() => resolve("keep-separate")}
                    disabled={resolving}
                    className="px-3 py-2 bg-white border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  >
                    Keep Both Records
                  </button>
                  {editableRows.length > 0 && (
                    <button
                      onClick={() => setMergeMode(true)}
                      disabled={resolving}
                      className="px-3 py-2 bg-white border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    >
                      Merge Records…
                    </button>
                  )}
                  <p className="text-[11px] text-gray-400 w-full mt-1">
                    Keep Existing Record discards the new submission's data. Keep Both Records creates a brand-new, separate record.
                  </p>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => resolve("merge")}
                    disabled={resolving}
                    className="px-3 py-2 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    Save Merged Record
                  </button>
                  <button
                    onClick={() => setMergeMode(false)}
                    disabled={resolving}
                    className="px-3 py-2 bg-white border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <p className="text-[11px] text-gray-400 w-full mt-1">
                    Choose which value to keep for each differing field. Fields left as "Keep existing" won't change.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DuplicateReviewsTab({ formId, initialOpenId, onConsumedInitialOpen }) {
  const [reviews, setReviews] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    return API.get("/duplicate-reviews", { params: { formId, decision: "pending", limit: 50 } })
      .then((res) => {
        setReviews(res.data.reviews || []);
        setTotalCount(res.data.pagination?.totalCount ?? (res.data.reviews || []).length);
      })
      .catch(() => toast.error("Failed to load duplicate reviews"))
      .finally(() => setLoading(false));
  }, [formId]);

  useEffect(() => { load(); }, [load]);

  // Opened directly from a flagged Submissions row — jump straight to that review once, then
  // hand control back to this tab's own openId state.
  useEffect(() => {
    if (initialOpenId) {
      setOpenId(initialOpenId);
      onConsumedInitialOpen?.();
    }
  }, [initialOpenId, onConsumedInitialOpen]);

  if (loading) return <p className="text-sm text-gray-400">Loading…</p>;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold text-gray-700">
        {totalCount === 0 ? "No pending reviews" : `${totalCount} pending review${totalCount === 1 ? "" : "s"}`}
      </p>
      {reviews.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-gray-500 font-medium">No pending duplicate reviews</p>
        </div>
      )}
      {reviews.map((r) => (
        <button
          key={r._id}
          onClick={() => setOpenId(r._id)}
          className="text-left border border-gray-200 rounded-lg p-4 flex items-center justify-between gap-4 hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
        >
          <div>
            <p className="text-sm font-semibold text-gray-900">
              Possible duplicate {r.module} — {r.score}% match
            </p>
            <p className="text-xs text-gray-500 mt-1">{r.reasonSummary || "Matched on: " + (r.matchedOn || []).join(", ")}</p>
            <p className="text-xs text-gray-400 mt-1">Flagged {timeAgo(r.createdAt)}</p>
          </div>
          <span className="text-xs font-medium text-blue-600 shrink-0">Review →</span>
        </button>
      ))}
      {openId && (
        <DuplicateReviewModal
          reviewId={openId}
          onClose={() => setOpenId(null)}
          onResolved={() => { setOpenId(null); load(); }}
        />
      )}
    </div>
  );
}

const FormDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
  const [activeVersion, setActiveVersion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("Overview");
  const [submissionCount, setSubmissionCount] = useState(0);
  const [pendingReviewCount, setPendingReviewCount] = useState(0);
  const [needsReviewSubmissionCount, setNeedsReviewSubmissionCount] = useState(0);
  const [lastSubmittedAt, setLastSubmittedAt] = useState(null);
  const [openReviewId, setOpenReviewId] = useState(null);

  const loadForm = useCallback(async () => {
    try {
      setLoading(true);
      const [formRes, submissionsRes, reviewsRes, needsReviewRes] = await Promise.all([
        API.get(`/forms/${id}`),
        // limit:1 sorted by submittedAt desc (formController.listSubmissions default sort) also
        // hands back the single most recent submission for free — no separate endpoint needed.
        API.get(`/forms/${id}/submissions`, { params: { limit: 1 } }),
        API.get("/duplicate-reviews", { params: { formId: id, decision: "pending", limit: 1 } }),
        API.get(`/forms/${id}/submissions`, { params: { limit: 1, reviewStatus: "needs_review" } }),
      ]);
      setForm(formRes.data.form);
      setActiveVersion(formRes.data.activeVersion);
      setLastSubmittedAt(submissionsRes.data.submissions?.[0]?.submittedAt || null);
      setSubmissionCount(submissionsRes.data.pagination?.totalCount || 0);
      setPendingReviewCount(reviewsRes.data.pagination?.totalCount || 0);
      setNeedsReviewSubmissionCount(needsReviewRes.data.pagination?.totalCount || 0);
    } catch (err) {
      if (err.response?.status === 404) {
        toast.error("Form not found");
        navigate("/settings/forms");
      } else {
        toast.error("Failed to load form");
      }
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    loadForm();
  }, [loadForm]);

  // If the form's state changes (e.g. it gets archived) while a now-hidden tab is active,
  // fall back to Overview rather than rendering a tab that's no longer in the nav.
  useEffect(() => {
    if (form && !visibleTabs(form, activeVersion).includes(activeTab)) {
      setActiveTab("Overview");
    }
  }, [form, activeVersion, activeTab]);

  if (loading || !form) {
    return (
      <PageSkeleton variant="generic" />
    );
  }

  return (
    // The shared app layout (App.jsx's <main>) applies py-6 px-4 sm:px-6 lg:px-8 to every routed
    // page; this page opts back out the same way Companies/Settings do, with a matching negative
    // margin, so the fixed header strip below can run edge-to-edge under the app's own navbar.
    <div className="min-h-screen bg-white -mt-6 -mx-4 sm:-mx-6 lg:-mx-8">
      {/* Fixed header strip — same fixed-toolbar pattern as Companies.jsx / FormsList.jsx (Back +
          title on the left, the page's one primary action on the right) instead of an in-flow
          card, so it stays visible while the tab content below scrolls. */}
      <div
        className="fixed right-0 h-16 px-4 sm:px-6 lg:px-8 border-b border-[#E1E4EA] bg-white flex items-center top-[calc(54px+var(--dc-offline-offset,0px))] lg:top-[calc(64px+var(--dc-offline-offset,0px))]"
        style={{
          left: "var(--sidebar-width, 0px)",
          zIndex: 40,
          minHeight: "64px",
          maxHeight: "64px",
          boxSizing: "border-box",
        }}
      >
        <div className="flex items-center gap-4 w-full min-w-0">
          <Link
            to="/settings/forms"
            className="flex items-center gap-1.5 text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <div className="h-6 w-px bg-gray-200 flex-shrink-0" />
          <div className="min-w-0 flex items-center gap-2">
            <h1 className="m-0 leading-tight font-bold text-base sm:text-lg text-gray-900 truncate">
              {form.title}
            </h1>
            <FormStatusBadge status={form.status} />
          </div>
          <button
            onClick={() => navigate(`/forms/${form._id}/builder`)}
            className="ml-auto flex-shrink-0 flex items-center gap-2 px-4 py-2.5 bg-[#0085FF] text-white text-sm font-semibold rounded-full hover:bg-blue-600 transition-colors"
          >
            <Pencil className="w-4 h-4" />
            {builderCtaLabel(form, (form.layout || []).reduce((sum, section) => sum + (section.elements?.length || 0), 0))}
          </button>
        </div>
      </div>

      {/* pt matches the fixed strip's own bottom edge exactly (54px/64px top offset + its 64px
          height), same pairing Settings.jsx uses with its equivalent -mt-6 cancellation — so
          content starts flush against the strip instead of leaving a gap under it. */}
      <div className="px-4 sm:px-6 lg:px-8 pt-[86px] lg:pt-[96px]">
        <div>
          {/* Same pill-switcher pattern as CompanyProfilePage.jsx's tab row: a border-b line above
              and below (each -mx-canceling this page's own gutter so it spans full width, exactly
              like Companies' -mx-6 against its card padding), and an h-10 p-1 bg-[#F1F1F5] track
              with mb-4 spacing — not the bespoke full-bleed/fixed-height band this had before. */}
          <div className="flex items-center justify-between mb-4 gap-3">
            <div className="relative inline-flex items-center gap-1.5 h-10 p-1 bg-[#F1F1F5] rounded-full overflow-x-auto overflow-y-hidden no-scrollbar">
              {visibleTabs(form, activeVersion).map((tab) => {
                // Only "Duplicate Reviews" and "Submissions" ever carry a badge — a count that
                // means "something here needs your attention," not a generic item total.
                const badgeCount = tab === "Duplicate Reviews" ? pendingReviewCount
                  : tab === "Submissions" ? needsReviewSubmissionCount
                  : 0;
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`relative z-10 flex flex-shrink-0 items-center justify-center gap-1.5 h-8 px-4 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                      isActive ? "bg-white text-[#0085FF] shadow-sm" : "text-gray-700 hover:text-gray-900"
                    }`}
                  >
                    {tab}
                    {badgeCount > 0 && (
                      <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-semibold leading-none">
                        {badgeCount > 99 ? "99+" : badgeCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-b border-gray-200 mb-4 -mx-4 sm:-mx-6 lg:-mx-8"></div>

          <div className="min-h-[400px]">
            {activeTab === "Overview" && (
              <OverviewTab
                form={form}
                activeVersion={activeVersion}
                submissionCount={submissionCount}
                pendingReviewCount={pendingReviewCount}
                lastSubmittedAt={lastSubmittedAt}
                setActiveTab={setActiveTab}
                navigate={navigate}
              />
            )}
            {activeTab === "Submissions" && (
              <SubmissionsTab
                formId={form._id}
                onOpenReview={(reviewId) => { setOpenReviewId(reviewId); setActiveTab("Duplicate Reviews"); }}
              />
            )}
            {activeTab === "Duplicate Reviews" && (
              <DuplicateReviewsTab
                formId={form._id}
                initialOpenId={openReviewId}
                onConsumedInitialOpen={() => setOpenReviewId(null)}
              />
            )}
            {activeTab === "Settings" && <FormSettingsTab form={form} onFormUpdated={setForm} />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FormDetailPage;
import PageSkeleton from "../components/common/PageSkeleton";
