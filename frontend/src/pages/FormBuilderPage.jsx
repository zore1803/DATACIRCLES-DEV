import DeleteIcon from "../components/common/DeleteIcon";
import Checkbox from "../components/common/Checkbox";
// pages/FormBuilderPage.jsx
// Form Builder — dedicated full-width route, /forms/:id/builder (see FORMS_FRONTEND_ARCHITECTURE.md
// §1.2 amendment). Vertical slice: Canvas + drag/drop + Properties + Save (PATCH) + Publish (POST).
//
// Drag/drop uses @dnd-kit (already a dependency, already used the same way in KanbanSettings.jsx —
// DndContext/PointerSensor/SortableContext/useSortable/arrayMove — no new library introduced).
//
// Scope notes, not blockers:
// - Single section only for v1 (layout is an array of sections per FORMS_SCHEMA.md §1a).
// - Field "Label" in the Properties panel is READ-ONLY: FormDefinition's elementSchema has no label
//   field for type:"field" elements — the display label always comes from the field definition
//   itself (system field meta, or a custom field's own `name`), edited in Settings > *Fields.
// - Layout components: Heading/Paragraph/Divider only (Spacer/Image deferred — Image has no upload
//   endpoint, so it would only ever be a raw-URL field if added).
// - A submitButton element is auto-ensured (not draggable, not deletable) so every form is usable.
// - Preview is a simplified read-only render, not the shared public-renderer preview the original
//   spec described — that renderer doesn't exist yet (separate, larger, already-scheduled work).
// - Cross-module guard: the Company-fields group on a Contact form lists ONLY system Company fields
//   — custom Company fields are never fetched or offered as draggable options, per invariant #17.
// - A field already placed on the canvas is disabled (not draggable) in the FieldsPanel — the
//   backend's assertUniqueFieldIds guard at publish time is a correctness backstop, not the only
//   thing preventing a duplicate; the UI must not let you create that state to begin with.
// - Theme tab exposes fontFamily only (form-wide). Button color/position/style live on the
//   submitButton ELEMENT itself (elementSchema.submitButton's own label/color/position/style) —
//   deliberately not duplicated into theme.buttonColor/etc, to avoid two places editing "the same"
//   button setting with different scopes.
// - Per-element text styling (fontSize/fontWeight/textAlign on heading/paragraph) required a small
//   additive schema change (backend/models/FormDefinition.js + FormVersion.js) — done alongside this.
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import API from "../services/api";
import toast from "react-hot-toast";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  GripVertical,
  Type,
  Heading as HeadingIcon,
  Minus,
  X,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Image as ImageIcon,
  MapPin,
  Lock,
  AlertCircle,
  Check,
  Rows3,
  FileStack,
  Monitor,
  Tablet,
  Smartphone,
} from "lucide-react";
import FormElementRenderer from "../components/forms/FormElementRenderer";
import ImageCropModal from "../components/forms/ImageCropModal";
import { supportsFor, typeLabel, BOUND_LABELS, FILE_UPLOAD_LIMITS } from "../components/forms/fieldTypeContract";
import {
  FONT_OPTIONS, THEME_PRESETS, PRESET_KEYS, DEFAULT_PRESET, resolveTheme, themeCssVars,
  FORM_GRID_CLASS, columnSpanClass,
} from "../components/forms/formThemes";

// Mirrors backend/utils/systemFields.js exactly (SYSTEM_FIELD_IDS/SYSTEM_FIELD_META) — no frontend
// endpoint exposes this static registry, so it's inlined rather than fetched.
// Two legacy IDs are deliberately absent from the palette below so no NEW form can pick them, while
// backend/utils/systemFields.js still resolves them for forms published before the CRM's model
// changed: "system:company.address" (superseded by the structured billing/shipping fields) and
// "system:vendor.address" (Vendor.address became a nested object; it now remaps to address.line1).
const SYSTEM_FIELDS = {
  Contact: [
    { fieldId: "system:contact.name", label: "Name", type: "string", baseRequired: true },
    { fieldId: "system:contact.email", label: "Email", type: "string", baseRequired: true },
    { fieldId: "system:contact.phone", label: "Phone", type: "string", baseRequired: true },
    { fieldId: "system:contact.avatar", label: "Profile Picture", type: "file" },
    // No "Company" entry: Contact.company is an internal ObjectId relationship, not a visitor-
    // fillable value. Use the Company system fields below (Company Name, Industry, ...) instead —
    // the relationship is created/linked automatically server-side.
    // No "stageStatus" entry either: it's only valid in specific pairings with lifecycleStage
    // (Contact's pre-save hook), so contactService derives it rather than a visitor choosing it.
    { fieldId: "system:contact.lifecycleStage", label: "Lifecycle Stage", type: "dropdown" },
    { fieldId: "system:contact.socialMedia.twitter", label: "Twitter / X", type: "string" },
    { fieldId: "system:contact.socialMedia.linkedin", label: "LinkedIn", type: "string" },
    { fieldId: "system:contact.socialMedia.facebook", label: "Facebook", type: "string" },
    { fieldId: "system:contact.socialMedia.whatsapp", label: "WhatsApp Number", type: "string" },
  ],
  Company: [
    { fieldId: "system:company.name", label: "Company Name", type: "string", baseRequired: true },
    { fieldId: "system:company.industry", label: "Industry", type: "dropdown", baseRequired: true },
    { fieldId: "system:company.gstin", label: "GSTIN", type: "string" },
    { fieldId: "system:company.email", label: "Email Address", type: "string" },
    { fieldId: "system:company.website", label: "Website", type: "url" },
    { fieldId: "system:company.leadSource", label: "Lead Source", type: "dropdown" },
    // type: "file" — visitor uploads an image via POST /api/public/forms/:slug/upload (a public-
    // safe, org-scoped S3 endpoint; see backend/middlewares/uploadMiddlewarePublicForm.js), which
    // returns a URL that's submitted as this field's value like any other string field.
    { fieldId: "system:company.profilePicture", label: "Company Logo", type: "file" },
    { fieldId: "system:company.billingAddress.addressLine1", label: "Billing Address Line 1", type: "string" },
    { fieldId: "system:company.billingAddress.addressLine2", label: "Billing Address Line 2", type: "string" },
    { fieldId: "system:company.billingAddress.city", label: "Billing City", type: "string" },
    { fieldId: "system:company.billingAddress.state", label: "Billing State", type: "string" },
    { fieldId: "system:company.billingAddress.pincode", label: "Billing Pincode", type: "string" },
    { fieldId: "system:company.billingAddress.country", label: "Billing Country", type: "string" },
    // Company.shippingAddresses is an array; a form can only collect one, written to element [0].
    { fieldId: "system:company.shippingAddress.addressLine1", label: "Shipping Address Line 1", type: "string" },
    { fieldId: "system:company.shippingAddress.addressLine2", label: "Shipping Address Line 2", type: "string" },
    { fieldId: "system:company.shippingAddress.city", label: "Shipping City", type: "string" },
    { fieldId: "system:company.shippingAddress.state", label: "Shipping State", type: "string" },
    { fieldId: "system:company.shippingAddress.pincode", label: "Shipping Pincode", type: "string" },
    { fieldId: "system:company.shippingAddress.country", label: "Shipping Country", type: "string" },
    { fieldId: "system:company.socialMedia.twitter", label: "Twitter / X", type: "string" },
    { fieldId: "system:company.socialMedia.linkedin", label: "LinkedIn", type: "string" },
    // No Instagram: Company.socialMediaSchema has no instagram path (Vendor's does), so a value
    // submitted for it would be silently dropped by Mongoose. See the note in the CRM sync review.
    { fieldId: "system:company.socialMedia.facebook", label: "Facebook", type: "string" },
    { fieldId: "system:company.socialMedia.whatsapp", label: "WhatsApp Number", type: "string" },
  ],
  Vendor: [
    { fieldId: "system:vendor.name", label: "Vendor Name", type: "string", baseRequired: true },
    { fieldId: "system:vendor.gstin", label: "GSTIN", type: "string", baseRequired: true },
    { fieldId: "system:vendor.phone", label: "Phone", type: "string" },
    { fieldId: "system:vendor.email", label: "Email", type: "string" },
    { fieldId: "system:vendor.company", label: "Company", type: "string" },
    { fieldId: "system:vendor.avatar", label: "Profile Picture", type: "file" },
    // Vendor.address is nested and uses line1/line2 — NOT Company's addressLine1/addressLine2.
    { fieldId: "system:vendor.address.line1", label: "Address Line 1", type: "string" },
    { fieldId: "system:vendor.address.line2", label: "Address Line 2", type: "string" },
    { fieldId: "system:vendor.address.city", label: "City", type: "string" },
    { fieldId: "system:vendor.address.state", label: "State", type: "string" },
    { fieldId: "system:vendor.address.pincode", label: "Pincode", type: "string" },
    { fieldId: "system:vendor.address.country", label: "Country", type: "string" },
    { fieldId: "system:vendor.socialMedia.twitter", label: "Twitter / X", type: "string" },
    { fieldId: "system:vendor.socialMedia.linkedin", label: "LinkedIn", type: "string" },
    { fieldId: "system:vendor.socialMedia.instagram", label: "Instagram", type: "string" },
    { fieldId: "system:vendor.socialMedia.facebook", label: "Facebook", type: "string" },
    { fieldId: "system:vendor.socialMedia.whatsapp", label: "WhatsApp Number", type: "string" },
  ],
};

// Address "blocks" are MACROS, not a new element type: dragging one inserts the six ordinary field
// elements it's made of, pre-arranged (line 1/2 full width, then City/State and Pincode/Country in
// pairs). They stay individually editable and deletable afterwards, and — crucially — every
// consumer that walks the layout (validation, payload building, duplicate detection, the frozen
// FormVersion) keeps seeing plain fields it already understands. A composite "address" element
// would have needed all of them taught about a new shape for the same visual result.
const ADDRESS_BLOCKS = {
  Company: [
    {
      key: "billing",
      label: "Billing Address",
      fields: [
        ["system:company.billingAddress.addressLine1", "full"],
        ["system:company.billingAddress.addressLine2", "full"],
        ["system:company.billingAddress.city", "half"],
        ["system:company.billingAddress.state", "half"],
        ["system:company.billingAddress.pincode", "half"],
        ["system:company.billingAddress.country", "half"],
      ],
    },
    {
      key: "shipping",
      label: "Shipping Address",
      fields: [
        ["system:company.shippingAddress.addressLine1", "full"],
        ["system:company.shippingAddress.addressLine2", "full"],
        ["system:company.shippingAddress.city", "half"],
        ["system:company.shippingAddress.state", "half"],
        ["system:company.shippingAddress.pincode", "half"],
        ["system:company.shippingAddress.country", "half"],
      ],
    },
  ],
  Vendor: [
    {
      key: "vendor",
      label: "Address",
      fields: [
        ["system:vendor.address.line1", "full"],
        ["system:vendor.address.line2", "full"],
        ["system:vendor.address.city", "half"],
        ["system:vendor.address.state", "half"],
        ["system:vendor.address.pincode", "half"],
        ["system:vendor.address.country", "half"],
      ],
    },
  ],
};

// Static enums for system dropdowns, mirroring backend SYSTEM_FIELD_META's `options`. Industry is
// absent on purpose — it's org-specific and fetched at runtime (see industryOptions below).
const SYSTEM_FIELD_OPTIONS = {
  "system:contact.lifecycleStage": ["Lead", "Sales Qualified Lead", "Customer"],
  "system:company.leadSource": ["Referral", "Website", "Cold Call", "Social Media", "Event", "Advertisement", "Other"],
};

// fieldId -> true for system fields whose underlying CRM schema hard-requires the value
// (backend/utils/systemFields.js SYSTEM_FIELD_META baseRequired). A form element for one of
// these must never be submittable as optional — the Builder can't let a visitor skip it only to
// have companyService.createCompany() etc. throw a Mongoose ValidationError downstream.
const BASE_REQUIRED_FIELD_IDS = new Set(
  Object.values(SYSTEM_FIELDS)
    .flat()
    .filter((f) => f.baseRequired)
    .map((f) => f.fieldId)
);

const FIELD_ENDPOINT_BY_MODULE = {
  Contact: "/contact-fields",
  Company: "/company-fields",
  Vendor: "/vendor-fields",
};

// Long enough that it doesn't fire mid-thought while someone is typing a heading, short enough that
// very little is ever at risk. Only ever saves the DRAFT — never publishes.
const AUTOSAVE_DELAY_MS = 2000;

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

const TEXT_COLORS = ["#111827", "#4B5563", "#0C4FCD", "#16A34A", "#DC2626", "#7C3AED"];
const FONT_SIZE_CLASS = { small: "text-sm", normal: "text-base", large: "text-xl", xlarge: "text-3xl" };

function uid() {
  return `el-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// "system:company.industry" -> "Company", etc. — used to figure out which module's mandatory
// fields must be backfilled when a system field from that module gets placed on the canvas
// (including the Company-fields-inside-a-Contact-form cross-module case).
function moduleFromFieldId(fieldId) {
  if (fieldId?.startsWith("system:contact.")) return "Contact";
  if (fieldId?.startsWith("system:company.")) return "Company";
  if (fieldId?.startsWith("system:vendor.")) return "Vendor";
  return null;
}

// --- Sections ---------------------------------------------------------------------------------
//
// The schema nests elements inside sections, but the Builder keeps ONE FLAT list and represents a
// section boundary as a `sectionBreak` marker inside it. The two are converted at the load/save
// boundary by the pair of functions below.
//
// Why not model sections as real nested containers in Builder state: every piece of editing
// machinery here — the sortable context, drop-index maths, selection, properties panel, required-
// field backfill, duplicate-field guarding — operates on one flat array. Nesting would mean
// rewriting all of it, and dnd-kit nested sortables are notoriously fiddly, for an identical
// result on screen. With a marker, a section is dragged and deleted like any other element, and
// moving a field "between sections" is just an ordinary reorder.
//
// `sectionBreak` exists ONLY in Builder state. It is never sent to the API and is not a member of
// the element type enum — elementsToSections turns markers into real nested sections on save.
const SECTION_BREAK = "sectionBreak";
// A page break is a section break that additionally starts a new page. Multi-page is therefore
// opt-in by construction: a form with no page-break markers is one page, so the simple case stays
// simple and needs no "enable multi-page" toggle.
const PAGE_BREAK = "pageBreak";
const isBreak = (el) => el?.type === SECTION_BREAK || el?.type === PAGE_BREAK;

function sectionsToElements(layout) {
  const out = [];
  (layout || []).forEach((sec, i) => {
    // A leading break is only needed when the section actually carries a header, or when it isn't
    // the first — so an ordinary single-section form loads with no marker at all and the canvas
    // looks exactly as it did before sections existed.
    if (i > 0 || sec.title || sec.description || sec.startsNewPage) {
      out.push({
        id: uid(),
        type: sec.startsNewPage ? PAGE_BREAK : SECTION_BREAK,
        title: sec.title || "",
        description: sec.description || "",
      });
    }
    (sec.elements || []).forEach((e) => out.push(e));
  });
  return out;
}

function elementsToSections(elements) {
  const sections = [];
  let current = { title: "", description: "", startsNewPage: false, elements: [] };
  for (const el of elements) {
    if (isBreak(el)) {
      // Drop a section that never accumulated any elements (e.g. a break sitting at the very top),
      // rather than publishing an empty group the visitor would see as a stray heading.
      if (current.elements.length > 0) sections.push(current);
      current = {
        title: el.title || "",
        description: el.description || "",
        startsNewPage: el.type === PAGE_BREAK,
        elements: [],
      };
    } else {
      current.elements.push(el);
    }
  }
  sections.push(current);
  // Section ids are positional and regenerated each save. That is safe because nothing keys off
  // them: computeSchemaHash reads section.order plus the element sequence, and the presentation
  // refresh pairs sections by index.
  return sections.map((s, i) => ({
    id: `sec-${i}`,
    order: i,
    title: s.title || undefined,
    description: s.description || undefined,
    startsNewPage: s.startsNewPage || undefined,
    elements: s.elements.map((e, j) => ({ ...e, order: j })),
  }));
}

// Group the flat list for RENDERING, so the canvas/preview can draw each section as one block
// while the underlying sortable list stays flat.
function groupBySection(elements) {
  const groups = [];
  let current = { header: null, items: [] };
  for (const el of elements) {
    if (isBreak(el)) {
      if (current.items.length > 0 || current.header) groups.push(current);
      current = { header: el, items: [] };
    } else {
      current.items.push(el);
    }
  }
  if (current.items.length > 0 || current.header) groups.push(current);
  return groups;
}

function ensureSubmitButton(elements) {
  if (elements.some((e) => e.type === "submitButton")) return elements;
  // Label only — deliberately NO colour/position/style. Seeding those would make every new form's
  // button an override that silently shadows the theme, so picking a preset would appear to leave
  // the button untouched. Appearance comes from Design → Button.
  return [...elements, { id: uid(), type: "submitButton", order: elements.length, label: "Submit" }];
}

// --- Palette (Fields panel) ---

// Renders the same pill shape as PaletteItem, without the drag wiring — used both for the
// dropped-in-place item and, via DragOverlay, for the floating copy that follows the cursor.
function PaletteItemVisual({ children, dragging }) {
  return (
    <div
      className={`flex items-center justify-between gap-2 px-3 py-2 border rounded-full text-sm select-none bg-white ${
        dragging ? "border-[#0085FF] shadow-lg" : "border-[#E1E4EA] text-gray-700"
      }`}
    >
      <span className="min-w-0 truncate">{children}</span>
      <GripVertical className="w-3.5 h-3.5 flex-shrink-0 text-gray-300" />
    </div>
  );
}

function PaletteItem({ id, data, disabled, children }) {
  // No local transform style: the item's own bounding box sits inside an overflow-y-auto panel,
  // so following the pointer via CSS transform got clipped the moment the drag left that panel —
  // it visually vanished until drop. A DragOverlay (rendered by DndContext, outside any clipped
  // ancestor) now shows the floating copy instead; this source item just dims in place.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data, disabled });
  return (
    <div
      ref={setNodeRef}
      {...(disabled ? {} : { ...listeners, ...attributes })}
      className={`group transition-opacity ${isDragging ? "opacity-30" : ""} ${disabled ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing"}`}
      title={disabled ? "Already on this form" : undefined}
    >
      <div
        className={`flex items-center justify-between gap-2 px-3 py-2 border rounded-full text-sm select-none transition-colors ${
          disabled
            ? "bg-gray-50 border-gray-100 text-gray-400"
            : "bg-white border-[#E1E4EA] text-gray-700 group-hover:border-[#0085FF]/40 group-hover:bg-[#0085FF]/5"
        }`}
      >
        <span className="min-w-0 truncate">{children}</span>
        {disabled ? (
          <span className="flex-shrink-0 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Added</span>
        ) : (
          <GripVertical className="w-3.5 h-3.5 flex-shrink-0 text-gray-300 group-hover:text-[#0085FF]/60" />
        )}
      </div>
    </div>
  );
}

// Every theme key that is a style token — i.e. everything a preset can supply. `preset`, `logoUrl`
// and `backgroundImageUrl` are excluded: they are not part of a preset's look.
const OVERRIDABLE_TOKEN_KEYS = Object.keys(THEME_PRESETS[DEFAULT_PRESET].tokens);

function hasOverrides(theme) {
  return OVERRIDABLE_TOKEN_KEYS.some((k) => theme?.[k] !== undefined && theme?.[k] !== null && theme?.[k] !== "");
}
// Clearing to "" rather than deleting: resolveTheme treats "" as unset, and an explicit "" survives
// a Mongoose $set where a deleted key would simply not be written.
function clearOverrides(theme) {
  const next = { ...theme };
  OVERRIDABLE_TOKEN_KEYS.forEach((k) => { next[k] = ""; });
  return next;
}

// A real miniature of the theme rather than a swatch or a radio button — built from the same tokens
// the canvas uses, so it can't drift from what selecting it actually does.
function ThemePresetCard({ presetKey, active, onSelect }) {
  const t = THEME_PRESETS[presetKey].tokens;
  return (
    <button
      onClick={onSelect}
      className={`rounded-lg border-2 overflow-hidden text-left transition-all ${active ? "border-blue-500 ring-2 ring-blue-100" : "border-gray-200 hover:border-gray-300"}`}
    >
      <div className="p-2" style={{ background: t.backgroundColor }}>
        <div
          className="p-1.5 flex flex-col gap-1"
          style={{ background: t.surfaceColor, borderRadius: Math.min(t.formRadius, 10), border: `1px solid ${t.borderColor}` }}
        >
          <div style={{ background: t.textColor, height: 3, width: "55%", borderRadius: 2 }} />
          <div style={{ background: t.mutedTextColor, height: 2, width: "80%", borderRadius: 2, opacity: 0.6 }} />
          <div style={{ border: `1px solid ${t.borderColor}`, borderRadius: Math.min(t.inputRadius, 8), height: 9, background: t.inputStyle === "filled" ? t.borderColor : "transparent", opacity: 0.9 }} />
          <div style={{ background: t.buttonColor, height: 8, width: "42%", borderRadius: Math.min(t.buttonRadius, 999) }} />
        </div>
      </div>
      <p className={`px-2 py-1 text-[11px] font-medium ${active ? "text-blue-600" : "text-gray-600"}`}>
        {THEME_PRESETS[presetKey].label}
      </p>
    </button>
  );
}

// The three control types below all follow the same rule: display the RESOLVED value (so the input
// shows what's actually rendering, preset value included), but only write to `theme` when the user
// changes it — which is what turns it into an override.
function TokenColorRow({ label, tokenKey, theme, resolved, onThemeChange }) {
  const overridden = theme?.[tokenKey] !== undefined && theme?.[tokenKey] !== null && theme?.[tokenKey] !== "";
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-gray-500 flex-1">{label}</label>
      {overridden && (
        <button onClick={() => onThemeChange({ ...theme, [tokenKey]: "" })} className="text-[10px] text-gray-400 hover:text-red-500">
          reset
        </button>
      )}
      <input
        type="color"
        value={resolved[tokenKey] || "#000000"}
        onChange={(e) => onThemeChange({ ...theme, [tokenKey]: e.target.value })}
        className={`h-7 w-10 rounded cursor-pointer border ${overridden ? "border-blue-400" : "border-gray-300"}`}
      />
    </div>
  );
}

function TokenSlider({ label, tokenKey, min, max, step, unit, theme, resolved, onThemeChange }) {
  return (
    <div>
      <label className="flex justify-between text-xs text-gray-500 mb-1">
        <span>{label}</span>
        <span className="text-gray-400">{resolved[tokenKey]}{unit}</span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Number(resolved[tokenKey]) || 0}
        onChange={(e) => onThemeChange({ ...theme, [tokenKey]: Number(e.target.value) })}
        className="w-full"
      />
    </div>
  );
}

function TokenSelect({ label, tokenKey, options, theme, resolved, onThemeChange }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <select
        value={resolved[tokenKey] || ""}
        onChange={(e) => onThemeChange({ ...theme, [tokenKey]: e.target.value })}
        className="w-full px-2 py-1.5 border border-gray-300 rounded-full text-sm"
      >
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

function FieldsPanel({ module, customFields, usedFieldIds, theme, onThemeChange }) {
  const [tab, setTab] = useState("fields");
  const [customizing, setCustomizing] = useState(false);
  const resolved = resolveTheme(theme);
  const systemFields = SYSTEM_FIELDS[module] || [];
  // A Contact form can also carry Company fields (the one supported cross-module case), so it gets
  // the Company address blocks too — matching which fields its palette already offers.
  const addressBlocks = [
    ...(ADDRESS_BLOCKS[module] || []).map((b) => ({ ...b, module })),
    ...(module === "Contact" ? ADDRESS_BLOCKS.Company.map((b) => ({ ...b, module: "Company" })) : []),
  ];

  return (
    <div className="w-64 shrink-0 bg-white border-r border-gray-200 flex flex-col min-h-0">
      {/* pb intentionally 1 notch less than pt - the border-b below reads visually heavier than
          plain padding, so a matching pb-4 left more apparent space below the switcher than
          above it. */}
      <div className="pt-4 px-3 pb-3 shrink-0 border-b border-gray-200">
        {/* Same sliding pill switcher as the Field Settings pages (Custom Field / Custom
            Section / Built-in), so this panel reads as part of the same design system. */}
        <div className="relative inline-flex items-center bg-gray-100 rounded-full p-1 w-full">
          <span
            className="absolute top-1 bottom-1 rounded-full bg-white shadow-sm transition-all duration-300 ease-out pointer-events-none"
            style={{ left: tab === "fields" ? 4 : "50%", width: "calc(50% - 4px)" }}
          />
          {[
            { id: "fields", label: "Fields" },
            { id: "theme", label: "Design" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`relative z-10 flex-1 py-1.5 text-sm font-semibold rounded-full transition-colors ${
                tab === t.id ? "text-[#0085FF]" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "theme" ? (
        <div className="p-4 pb-10 flex-1 min-h-0 flex flex-col gap-4 overflow-y-auto">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Theme</p>
            <div className="grid grid-cols-2 gap-2">
              {PRESET_KEYS.map((key) => (
                <ThemePresetCard
                  key={key}
                  presetKey={key}
                  active={(theme?.preset || DEFAULT_PRESET) === key}
                  onSelect={() => onThemeChange({ ...theme, preset: key })}
                />
              ))}
            </div>
            {hasOverrides(theme) && (
              <button
                onClick={() => onThemeChange(clearOverrides(theme))}
                className="mt-2 w-full text-xs text-gray-500 hover:text-red-500 border border-gray-200 rounded py-1.5"
              >
                Reset customizations to preset
              </button>
            )}
          </div>

          <button
            onClick={() => setCustomizing((v) => !v)}
            className="flex items-center justify-between w-full border-t border-gray-100 pt-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-800"
          >
            Customize
            <span className="text-gray-400">{customizing ? "−" : "+"}</span>
          </button>

          {customizing && (
          <>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Colors</p>
            <div className="flex flex-col gap-2">
              {[
                ["primaryColor", "Primary"],
                ["backgroundColor", "Page Background"],
                ["surfaceColor", "Form Background"],
                ["textColor", "Text"],
                ["mutedTextColor", "Muted Text"],
                ["borderColor", "Border"],
              ].map(([key, label]) => (
                <TokenColorRow key={key} label={label} tokenKey={key} theme={theme} resolved={resolved} onThemeChange={onThemeChange} />
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Form</p>
            <div className="flex flex-col gap-3">
              <TokenSlider label="Width" tokenKey="formMaxWidth" min={360} max={900} step={20} unit="px" theme={theme} resolved={resolved} onThemeChange={onThemeChange} />
              <TokenSlider label="Corner Radius" tokenKey="formRadius" min={0} max={32} step={2} unit="px" theme={theme} resolved={resolved} onThemeChange={onThemeChange} />
              <TokenSlider label="Padding" tokenKey="formPadding" min={12} max={64} step={4} unit="px" theme={theme} resolved={resolved} onThemeChange={onThemeChange} />
              <TokenSelect label="Shadow" tokenKey="formShadow" options={[["none", "None"], ["sm", "Subtle"], ["md", "Medium"], ["lg", "Large"]]} theme={theme} resolved={resolved} onThemeChange={onThemeChange} />
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Inputs</p>
            <div className="flex flex-col gap-3">
              <TokenSelect label="Style" tokenKey="inputStyle" options={[["outlined", "Outlined"], ["filled", "Filled"], ["underline", "Underline"]]} theme={theme} resolved={resolved} onThemeChange={onThemeChange} />
              <TokenSlider label="Radius" tokenKey="inputRadius" min={0} max={24} step={2} unit="px" theme={theme} resolved={resolved} onThemeChange={onThemeChange} />
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Button</p>
            <div className="flex flex-col gap-3">
              <TokenColorRow label="Color" tokenKey="buttonColor" theme={theme} resolved={resolved} onThemeChange={onThemeChange} />
              <TokenColorRow label="Label Color" tokenKey="buttonTextColor" theme={theme} resolved={resolved} onThemeChange={onThemeChange} />
              <TokenSelect label="Style" tokenKey="buttonStyle" options={[["solid", "Solid"], ["outline", "Outline"]]} theme={theme} resolved={resolved} onThemeChange={onThemeChange} />
              {/* A segmented Square/Rounded/Pill rather than a 0–999 slider: "pill" is a corner
                  radius large enough to fully round the ends, so a linear slider spends 97% of its
                  travel on values that all look identical. This also replaces the old per-element
                  "Style: Rounded (pill)", which used to fight this same token. */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Corners</label>
                <div className="flex gap-1">
                  {[["Square", 0], ["Rounded", 8], ["Pill", 999]].map(([lbl, val]) => (
                    <button
                      key={lbl}
                      onClick={() => onThemeChange({ ...theme, buttonRadius: val })}
                      className={`flex-1 px-2 py-1 rounded-full border text-xs ${Number(resolved.buttonRadius) === val ? "bg-blue-50 border-blue-300 text-blue-600" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
              <TokenSelect label="Width" tokenKey="buttonWidth" options={[["auto", "Auto"], ["full", "Full width"]]} theme={theme} resolved={resolved} onThemeChange={onThemeChange} />
              <div>
                <label className="block text-xs text-gray-500 mb-1">Position</label>
                <AlignButtons value={resolved.buttonPosition} onChange={(v) => onThemeChange({ ...theme, buttonPosition: v })} />
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Typography</p>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Font Family</label>
                <select
                  value={theme?.fontFamily || FONT_OPTIONS[0]}
                  onChange={(e) => onThemeChange({ ...theme, fontFamily: e.target.value })}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-full text-sm"
                >
                  {FONT_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Font Size</label>
                <select
                  value={theme?.fontSize || "normal"}
                  onChange={(e) => onThemeChange({ ...theme, fontSize: e.target.value })}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-full text-sm"
                >
                  <option value="small">Small</option>
                  <option value="normal">Normal</option>
                  <option value="large">Large</option>
                  <option value="xlarge">Extra Large</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Font Weight</label>
                <select
                  value={theme?.fontWeight || "normal"}
                  onChange={(e) => onThemeChange({ ...theme, fontWeight: e.target.value })}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-full text-sm"
                >
                  <option value="normal">Normal</option>
                  <option value="bold">Bold</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Text Alignment</label>
                <AlignButtons value={theme?.textAlign || "left"} onChange={(v) => onThemeChange({ ...theme, textAlign: v })} />
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-400 border-t border-gray-100 pt-3">
            These are the form-wide defaults — an individual Heading, Paragraph or Submit Button can
            still override them from its own Properties panel.
          </p>
          </>
          )}
        </div>
      ) : (
        <div className="p-4 pb-10 flex-1 min-h-0 overflow-y-auto flex flex-col gap-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-bold text-gray-900">{module} Fields</p>
              <span className="text-xs text-gray-400">{systemFields.length}</span>
            </div>
            <div className="flex flex-col gap-1.5 p-2 rounded-xl border border-[#E1E4EA] bg-[#F5F7FA]/40">
              {systemFields.map((f) => (
                <PaletteItem key={f.fieldId} id={`palette-${f.fieldId}`} data={{ type: "palette", source: "system", field: f }} disabled={usedFieldIds.has(f.fieldId)}>
                  {f.label}
                </PaletteItem>
              ))}
            </div>
          </div>

          {customFields.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold text-gray-900">Custom</p>
                <span className="text-xs text-gray-400">{customFields.length}</span>
              </div>
              <div className="flex flex-col gap-1.5 p-2 rounded-xl border border-[#E1E4EA] bg-[#F5F7FA]/40">
                {customFields.map((f) => (
                  <PaletteItem
                    key={f._id}
                    id={`palette-${f._id}`}
                    data={{ type: "palette", source: "custom", field: { fieldId: f._id, label: f.name, type: f.type } }}
                    disabled={usedFieldIds.has(f._id)}
                  >
                    {f.name}
                  </PaletteItem>
                ))}
              </div>
            </div>
          )}

          {module === "Contact" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold text-gray-900">Company Fields</p>
                <span className="text-xs text-gray-400">{SYSTEM_FIELDS.Company.length}</span>
              </div>
              {/* Cross-module guard, built into the panel itself: ONLY system Company fields are
                  ever listed here — custom Company fields are never fetched or offered. */}
              <div className="flex flex-col gap-1.5 p-2 rounded-xl border border-[#E1E4EA] bg-[#F5F7FA]/40">
                {SYSTEM_FIELDS.Company.map((f) => (
                  <PaletteItem key={f.fieldId} id={`palette-${f.fieldId}`} data={{ type: "palette", source: "system", field: f }} disabled={usedFieldIds.has(f.fieldId)}>
                    {f.label}
                  </PaletteItem>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-sm font-bold text-gray-900 mb-2">Layout</p>
            <div className="flex flex-col gap-1.5 p-2 rounded-xl border border-[#E1E4EA] bg-[#F5F7FA]/40">
              <PaletteItem id="palette-heading" data={{ type: "palette", source: "layout", field: { layoutType: "heading", label: "Heading" } }}>
                <span className="flex items-center gap-2"><HeadingIcon className="w-3.5 h-3.5" /> Heading</span>
              </PaletteItem>
              <PaletteItem id="palette-paragraph" data={{ type: "palette", source: "layout", field: { layoutType: "paragraph", label: "Paragraph" } }}>
                <span className="flex items-center gap-2"><Type className="w-3.5 h-3.5" /> Paragraph</span>
              </PaletteItem>
              <PaletteItem id="palette-divider" data={{ type: "palette", source: "layout", field: { layoutType: "divider", label: "Divider" } }}>
                <span className="flex items-center gap-2"><Minus className="w-3.5 h-3.5" /> Divider</span>
              </PaletteItem>
              <PaletteItem id="palette-image" data={{ type: "palette", source: "layout", field: { layoutType: "image", label: "Image" } }}>
                <span className="flex items-center gap-2"><ImageIcon className="w-3.5 h-3.5" /> Image</span>
              </PaletteItem>
              <PaletteItem id="palette-section" data={{ type: "palette", source: "layout", field: { layoutType: "section", label: "Section" } }}>
                <span className="flex items-center gap-2"><Rows3 className="w-3.5 h-3.5" /> Section</span>
              </PaletteItem>
              <PaletteItem id="palette-page" data={{ type: "palette", source: "layout", field: { layoutType: "page", label: "Page Break" } }}>
                <span className="flex items-center gap-2"><FileStack className="w-3.5 h-3.5" /> Page Break</span>
              </PaletteItem>
            </div>
          </div>

          {addressBlocks.length > 0 && (
            <div>
              <p className="text-sm font-bold text-gray-900 mb-2">Blocks</p>
              <div className="flex flex-col gap-1.5 p-2 rounded-xl border border-[#E1E4EA] bg-[#F5F7FA]/40">
                {addressBlocks.map((b) => {
                  // Disabled once every field it would add is already on the canvas — the same rule
                  // single fields use, since dropping it would then be a no-op.
                  const allUsed = b.fields.every(([fid]) => usedFieldIds.has(fid));
                  return (
                    <PaletteItem
                      key={b.key}
                      id={`palette-block-${b.key}`}
                      data={{ type: "palette", source: "block", field: { blockKey: b.key, module: b.module, label: b.label } }}
                      disabled={allUsed}
                    >
                      <span className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5" /> {b.label}</span>
                    </PaletteItem>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] text-gray-400">Adds the address fields, already laid out.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Canvas — renders each element as it will actually look, not a generic card ---

// Canvas rendering is handled by the shared FormElementRenderer component.

function CanvasItem({ element, fieldMetaById, isSelected, onSelect, onDelete, isLocked, theme }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: element.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const deletable = element.type !== "submitButton";

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onSelect(element.id)}
      // A section marker gets a rule and extra breathing room above it, so the canvas reads as
      // grouped blocks even though the sortable list underneath is still flat. (Not a nested
      // container: that would mean a grid per section and a sortable context per section.)
      className={`${columnSpanClass(element)} ${
        element.type === PAGE_BREAK ? "mt-6 pt-5 border-t-2 border-dashed border-blue-300"
          : element.type === SECTION_BREAK ? "mt-5 pt-4 border-t border-gray-200 first:mt-0 first:pt-0 first:border-t-0" : ""
      } relative group border-2 rounded-lg px-3 py-3 cursor-pointer transition-all ${
        isSelected ? "border-blue-400 shadow-md" : "border-transparent hover:border-gray-200"
      } ${isDragging ? "!border-dashed !border-gray-300" : ""}`}
    >
      <div className="absolute -left-1 top-1/2 -translate-y-1/2 -translate-x-full opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1 pr-1">
        <button {...attributes} {...listeners} className="text-gray-300 hover:text-gray-600 cursor-grab active:cursor-grabbing bg-white rounded border border-gray-100 p-1">
          <GripVertical className="w-3.5 h-3.5" />
        </button>
      </div>
      {isDragging && (
        // Covers the (now invisible) content below rather than replacing it, so the placeholder
        // inherits this item's own natural height exactly instead of guessing at one — an earlier
        // fixed-height stand-in stretched to fill the grid row's tallest sibling and shoved
        // everything below it further down than the field actually needed.
        <div className="absolute inset-0" />
      )}
      <FormElementRenderer
        element={element}
        fieldMeta={element.fieldId ? fieldMetaById.get(element.fieldId) : undefined}
        interactive={false}
        theme={theme}
        className={isDragging ? "invisible" : undefined}
      />
      {deletable && !isDragging && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(element.id); }}
          title={isLocked ? `${fieldMetaById.get(element.fieldId)?.label || "This field"} is required while ${moduleFromFieldId(element.fieldId)} fields exist on this form.` : undefined}
          className={`absolute top-1 right-1 p-1 opacity-0 group-hover:opacity-100 transition-opacity ${
            isLocked ? "text-gray-300 cursor-not-allowed" : "text-red-500 hover:text-red-600"
          }`}
        >
          <DeleteIcon className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

function Canvas({ elements, fieldMetaById, selectedId, onSelect, onDelete, isFieldLocked, theme }) {
  const { setNodeRef, isOver } = useDroppable({ id: "canvas-droppable" });
  // FormElementRenderer reads plain token names (fontSize, buttonPosition, buttonWidth...), so it
  // must be handed the RESOLVED theme — the raw document only carries explicit overrides, which
  // meant anything supplied by the preset was silently ignored.
  const rt = resolveTheme(theme);

  return (
    // The canvas backdrop uses the theme's PAGE background so the form card is judged against the
    // same surround a visitor will see — otherwise a Dark theme's card sits on white here and looks
    // wrong the moment it's published.
    <div
      ref={setNodeRef}
      className="flex-1 p-8 overflow-y-auto transition-colors"
      style={{ background: isOver ? undefined : resolveTheme(theme).backgroundColor }}
    >
      <div
        className="form-theme-scope mx-auto min-h-[500px]"
        style={{ ...themeCssVars(theme), maxWidth: "var(--form-max-width)" }}
      >
        {elements.length === 0 ? (
          <div className="flex items-center justify-center h-full min-h-[400px] text-center">
            <p className="text-gray-400 text-sm">Drag fields here to build your form</p>
          </div>
        ) : (
          <SortableContext items={elements.map((e) => e.id)} strategy={rectSortingStrategy}>
            {/* rectSortingStrategy, not verticalListSortingStrategy: elements now flow in a
                2-column grid, and the vertical strategy assumes a single stacked column when
                computing drop positions. */}
            <div className={FORM_GRID_CLASS}>
              {elements.map((el) => (
                <CanvasItem
                  key={el.id}
                  element={el}
                  fieldMetaById={fieldMetaById}
                  isSelected={selectedId === el.id}
                  onSelect={onSelect}
                  onDelete={onDelete}
                  isLocked={isFieldLocked(el)}
                  theme={rt}
                />
              ))}
            </div>
          </SortableContext>
        )}
      </div>
    </div>
  );
}

// --- Properties panel — plain-language labels, not raw backend field names ---

const ALIGN_OPTIONS = [
  { value: "left", icon: AlignLeft },
  { value: "center", icon: AlignCenter },
  { value: "right", icon: AlignRight },
];

function AlignButtons({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {ALIGN_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`p-1.5 rounded border ${value === opt.value ? "bg-blue-50 border-blue-300 text-blue-600" : "border-gray-200 text-gray-400 hover:bg-gray-50"}`}
        >
          <opt.icon className="w-3.5 h-3.5" />
        </button>
      ))}
    </div>
  );
}

// Half/full width toggle. Only offered for the element types that can sensibly sit beside another
// one (see columnSpanClass) — a half-width divider or submit row is nearly always a mistake.
function WidthControl({ element, onChange }) {
  if (element.type !== "field" && element.type !== "image") return null;
  const current = element.layoutWidth === "half" ? "half" : "full";
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">Width</label>
      <div className="flex gap-1">
        {[["full", "Full"], ["half", "Half"]].map(([v, lbl]) => (
          <button
            key={v}
            onClick={() => onChange({ ...element, layoutWidth: v })}
            className={`flex-1 px-2 py-1 rounded-full border text-xs ${current === v ? "bg-blue-50 border-blue-300 text-blue-600" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
          >
            {lbl}
          </button>
        ))}
      </div>
      {current === "half" && (
        <p className="mt-1 text-[11px] text-gray-400">Sits beside the next half-width element. Stacks on mobile.</p>
      )}
    </div>
  );
}

function PropertiesPanel({ element, fieldMetaById, onChange, onUploadImage }) {
  const [imgUploading, setImgUploading] = useState(false);
  const [imgError, setImgError] = useState(null);
  // { src, mimeType, original } — always a local blob: URL for a file the user just picked, never a
  // remote one (see the note by the file input below).
  const [cropping, setCropping] = useState(null);

  const uploadAndSet = async (file) => {
    setImgError(null);
    setImgUploading(true);
    try {
      const url = await onUploadImage(file);
      onChange({ ...element, url });
    } catch (err) {
      setImgError(err?.response?.data?.error || "Upload failed.");
    } finally {
      setImgUploading(false);
    }
  };

  // Picking a file opens the crop tool first, against a local blob: URL — this is the path that
  // always works, since a local source can't taint the canvas the way a CloudFront URL can.
  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file after a failed/replaced upload
    if (!file) return;
    setImgError(null);
    setCropping({ src: URL.createObjectURL(file), mimeType: file.type, original: file });
  };

  const closeCrop = () => {
    setCropping((c) => {
      if (c) URL.revokeObjectURL(c.src);
      return null;
    });
  };

  if (!element) {
    return (
      <div className="w-72 shrink-0 bg-white border-l border-gray-200 p-4">
        <p className="text-sm text-gray-400">Select an element to edit its properties.</p>
      </div>
    );
  }

  if (element.type === "field") {
    const meta = fieldMetaById.get(element.fieldId);
    const overrides = element.validationOverrides || {};
    // EVERY control below is gated on `supports`, which mirrors the backend contract. A control
    // that isn't in `supports` has no rule enforcing it, so it must not be rendered — showing one
    // is how min/max/regex came to be configurable-but-ignored.
    const supports = supportsFor(meta?.type);
    const bounds = BOUND_LABELS[supports.min || supports.max] || null;
    const setOverride = (patch) => onChange({ ...element, validationOverrides: { ...overrides, ...patch } });
    const lockedRequired = BASE_REQUIRED_FIELD_IDS.has(element.fieldId) || !!meta?.baseRequired;

    return (
      <div className="w-72 shrink-0 min-h-0 bg-white border-l border-gray-200 p-4 pb-10 overflow-y-auto flex flex-col gap-4">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-medium text-gray-500">Label</label>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{typeLabel(meta?.type)}</span>
          </div>
          {/* Read-only: no per-form label override exists in the schema — comes from the field
              definition itself (edited in Settings > *Fields, not here). */}
          <p className="text-sm text-gray-700 px-2 py-1.5 bg-gray-50 rounded border border-gray-100">{meta?.label || element.fieldId}</p>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <Checkbox checked={!!element.required} onChange={(e) => onChange({ ...element, required: e.target.checked })} disabled={lockedRequired} />
            Required
          </label>
          {/* Say WHY it's locked: this is a CRM schema constraint, not an arbitrary form setting. */}
          {lockedRequired && (
            <p className="mt-1 text-[11px] text-gray-400 flex items-center gap-1">
              <Lock className="w-3 h-3" /> Required by the CRM — a {moduleFromFieldId(element.fieldId) || "record"} can't be created without it.
            </p>
          )}
        </div>

        {supports.placeholder && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Placeholder</label>
            <input
              type="text"
              value={element.placeholder || ""}
              onChange={(e) => onChange({ ...element, placeholder: e.target.value })}
              className="w-full px-2 py-1.5 border border-gray-300 rounded-full text-sm"
            />
          </div>
        )}

        <WidthControl element={element} onChange={onChange} />

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Help Text</label>
          <textarea
            value={element.helpText || ""}
            onChange={(e) => onChange({ ...element, helpText: e.target.value })}
            className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
            rows={2}
          />
        </div>

        {/* Options come from the CRM field definition and are shown read-only: a form must not be
            able to silently mutate the organization's global option set. */}
        {supports.options && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Choices</label>
            {(meta?.options || []).length > 0 ? (
              <>
                <div className="flex flex-wrap gap-1">
                  {meta.options.map((o) => (
                    <span key={o} className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[11px]">{o}</span>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-gray-400">Managed in Settings, not per form.</p>
              </>
            ) : (
              <p className="text-[11px] text-amber-600">No choices defined yet — add them in Settings.</p>
            )}
          </div>
        )}

        {supports.defaultValue && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Default Value</label>
            {supports.options ? (
              <select
                value={element.defaultValue ?? ""}
                onChange={(e) => onChange({ ...element, defaultValue: e.target.value })}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-full text-sm"
              >
                <option value="">None</option>
                {(meta?.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input
                type={bounds?.input === "date" ? "date" : supports.min === "value" ? "number" : "text"}
                value={element.defaultValue ?? ""}
                onChange={(e) => onChange({ ...element, defaultValue: e.target.value })}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-full text-sm"
              />
            )}
          </div>
        )}

        {/* The whole Validation block disappears for types with nothing enforceable (file). */}
        {(bounds || supports.regex || supports.restrictPastDates || meta?.format === "email") && (
          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Validation</p>

            {bounds && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{bounds.min}</label>
                  <input
                    type={bounds.input}
                    value={overrides.min ?? ""}
                    onChange={(e) => setOverride({ min: e.target.value })}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-full text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{bounds.max}</label>
                  <input
                    type={bounds.input}
                    value={overrides.max ?? ""}
                    onChange={(e) => setOverride({ max: e.target.value })}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-full text-sm"
                  />
                </div>
              </div>
            )}

            {supports.restrictPastDates && (
              <div className="mt-2 flex flex-col gap-1.5">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <Checkbox checked={!!overrides.restrictPastDates} onChange={(e) => setOverride({ restrictPastDates: e.target.checked })} />
                  No past dates
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <Checkbox checked={!!overrides.restrictFutureDates} onChange={(e) => setOverride({ restrictFutureDates: e.target.checked })} />
                  No future dates
                </label>
              </div>
            )}

            {meta?.format === "email" && (
              <div className="mt-2">
                <label className="block text-xs text-gray-500 mb-1">Allowed domains</label>
                <input
                  type="text"
                  value={(overrides.allowedDomains || []).join(", ")}
                  onChange={(e) =>
                    setOverride({ allowedDomains: e.target.value.split(",").map((d) => d.trim()).filter(Boolean) })
                  }
                  placeholder="acme.com, acme.co.in"
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-full text-sm"
                />
                <p className="text-[11px] text-gray-400 mt-1">Leave blank to accept any domain.</p>
              </div>
            )}

            {supports.regex && (
              <div className="mt-2">
                <label className="block text-xs text-gray-500 mb-1">Only allow this pattern (advanced)</label>
                <input
                  type="text"
                  value={overrides.regex || ""}
                  onChange={(e) => setOverride({ regex: e.target.value })}
                  placeholder="Leave blank unless you need custom pattern matching"
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-full text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">Advanced — most forms don't need this.</p>
              </div>
            )}
          </div>
        )}

        {/* File limits are enforced by the upload endpoint and are identical for every file field,
            so they're stated rather than offered as configuration that nothing would read. */}
        {meta?.type === "file" && (
          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Upload limits</p>
            <p className="text-[11px] text-gray-500">
              {FILE_UPLOAD_LIMITS.accepted.join(", ")} up to {FILE_UPLOAD_LIMITS.maxSizeMb}MB.
            </p>
            <p className="text-[11px] text-gray-400 mt-1">Applies to every file field; not configurable per form.</p>
          </div>
        )}
      </div>
    );
  }

  if (isBreak(element)) {
    return (
      <div className="w-72 shrink-0 min-h-0 bg-white border-l border-gray-200 p-4 pb-10 flex flex-col gap-4 overflow-y-auto">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${element.type === PAGE_BREAK ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
            {element.type === PAGE_BREAK ? "Page break" : "Section"}
          </span>
          {/* Converting between the two is a one-click change of the same marker, rather than
              delete-and-re-add, because the title and description carry over. */}
          <button
            onClick={() => onChange({ ...element, type: element.type === PAGE_BREAK ? SECTION_BREAK : PAGE_BREAK })}
            className="text-[11px] text-blue-600 hover:underline ml-auto"
          >
            {element.type === PAGE_BREAK ? "Make it a section" : "Make it a page break"}
          </button>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            {element.type === PAGE_BREAK ? "Page Title" : "Section Title"}
          </label>
          <input
            type="text"
            value={element.title || ""}
            onChange={(e) => onChange({ ...element, title: e.target.value })}
            placeholder="e.g. Company Information"
            className="w-full px-2 py-1.5 border border-gray-300 rounded-full text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
          <textarea
            value={element.description || ""}
            onChange={(e) => onChange({ ...element, description: e.target.value })}
            placeholder="Optional — shown under the title"
            className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
            rows={2}
          />
        </div>
        <p className="text-[11px] text-gray-400 leading-snug">
          {element.type === PAGE_BREAK
            ? "Everything below this appears on a new page, until the next page break. Visitors get Back/Continue buttons and a progress indicator automatically."
            : "Everything below this belongs to the section, until the next one. Drag it to move the whole group boundary; delete it to merge this section into the one above."}
        </p>
      </div>
    );
  }

  if (element.type === "heading" || element.type === "paragraph") {
    return (
      <div className="w-72 shrink-0 min-h-0 bg-white border-l border-gray-200 p-4 pb-10 flex flex-col gap-4 overflow-y-auto">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Text</label>
          <textarea
            value={element.text || ""}
            onChange={(e) => onChange({ ...element, text: e.target.value })}
            className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
            rows={element.type === "paragraph" ? 4 : 2}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Font Size</label>
          <select
            value={element.fontSize || (element.type === "heading" ? "large" : "normal")}
            onChange={(e) => onChange({ ...element, fontSize: e.target.value })}
            className="w-full px-2 py-1.5 border border-gray-300 rounded-full text-sm"
          >
            <option value="small">Small</option>
            <option value="normal">Normal</option>
            <option value="large">Large</option>
            <option value="xlarge">Extra Large</option>
          </select>
        </div>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <Checkbox checked={element.fontWeight === "bold"} onChange={(e) => onChange({ ...element, fontWeight: e.target.checked ? "bold" : "normal" })} />
            <Bold className="w-3.5 h-3.5" /> Bold
          </label>
          <AlignButtons value={element.textAlign || "left"} onChange={(v) => onChange({ ...element, textAlign: v })} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Text Color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={element.textColor || "#111827"}
              onChange={(e) => onChange({ ...element, textColor: e.target.value })}
              className="h-8 w-12 border border-gray-300 rounded cursor-pointer"
            />
            <div className="flex gap-1">
              {TEXT_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => onChange({ ...element, textColor: c })}
                  style={{ backgroundColor: c }}
                  className={`w-5 h-5 rounded-full border ${element.textColor === c ? "ring-2 ring-offset-1 ring-blue-400 border-transparent" : "border-gray-200"}`}
                />
              ))}
            </div>
          </div>
          {/* Clearing falls back to the form-wide Theme > Text Color, not to a hardcoded value. */}
          {element.textColor ? (
            <button onClick={() => onChange({ ...element, textColor: "" })} className="mt-1.5 text-xs text-gray-400 hover:text-red-500">
              Use theme color
            </button>
          ) : (
            <p className="mt-1.5 text-[11px] text-gray-400">Using the form's theme color.</p>
          )}
        </div>
      </div>
    );
  }

  if (element.type === "submitButton") {
    return (
      <div className="w-72 shrink-0 min-h-0 bg-white border-l border-gray-200 p-4 pb-10 flex flex-col gap-4 overflow-y-auto">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Button Label</label>
          <input
            type="text"
            value={element.label || ""}
            onChange={(e) => onChange({ ...element, label: e.target.value })}
            className="w-full px-2 py-1.5 border border-gray-300 rounded-full text-sm"
          />
        </div>
        {/* A form has exactly ONE submit button, so its appearance belongs to the theme rather than
            being duplicated here — two panels styling one element (with different controls, and a
            per-element "Rounded (pill)" fighting the theme's corner token) is what made this
            confusing. Only the LABEL is genuinely per-element content.
            Older forms may still carry element-level colour/position/style, which the renderer
            honours over the theme; rather than silently stranding those values, surface them and
            offer one click to hand styling back to the theme. */}
        {(element.color || element.position || element.style) ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
            <p className="text-[11px] text-amber-800 leading-snug">
              This button has its own styling saved on it, which overrides the theme.
            </p>
            <button
              onClick={() => onChange({ ...element, color: "", position: "", style: "" })}
              className="mt-2 w-full px-2 py-1 rounded border border-amber-300 bg-white text-xs font-medium text-amber-800 hover:bg-amber-100"
            >
              Use theme styling
            </button>
          </div>
        ) : (
          <p className="text-[11px] text-gray-400 leading-snug">
            Colour, corners, width and position come from <span className="font-medium text-gray-500">Design → Button</span>.
          </p>
        )}
      </div>
    );
  }

  if (element.type === "image") {
    return (
      <div className="w-72 shrink-0 min-h-0 bg-white border-l border-gray-200 p-4 pb-10 flex flex-col gap-4 overflow-y-auto">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Image</label>
          {element.url && (
            <img src={element.url} alt="" className="w-full max-h-32 object-contain border border-gray-200 rounded mb-2 bg-gray-50" />
          )}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
            disabled={imgUploading}
            onChange={handleImageSelect}
            className="block w-full text-xs text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 disabled:opacity-50"
          />
          {/* Cropping is offered only while choosing a file, never on an already-uploaded image:
              once uploaded, the image is served cross-origin (CloudFront), which taints the canvas
              and makes toBlob throw. Re-crop = re-pick the file, which always works. */}
          <p className="text-[11px] text-gray-400 mt-1">
            {element.url ? "Choose a file to replace this image (you can crop it again)." : "You can crop and rotate after choosing a file."}
          </p>
          {imgUploading && <p className="text-xs text-gray-400 mt-1">Uploading...</p>}
          {imgError && <p className="text-xs text-red-500 mt-1">{imgError}</p>}
          {cropping && (
            <ImageCropModal
              src={cropping.src}
              mimeType={cropping.mimeType}
              onCancel={() => {
                // Cancelling a crop that was opened by picking a NEW file still uploads that file
                // as-is — the user chose an image, they just didn't want to crop it.
                const pending = cropping.original;
                closeCrop();
                if (pending) uploadAndSet(pending);
              }}
              onApply={(file) => {
                closeCrop();
                uploadAndSet(file);
              }}
            />
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Width — {element.imageWidth ?? 100}%
          </label>
          {/* Percentage, not pixels: the image scales with the form's content width, so it can't
              overflow the card on a narrow/mobile viewport. */}
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={element.imageWidth ?? 100}
            onChange={(e) => onChange({ ...element, imageWidth: Number(e.target.value) })}
            className="w-full"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Position</label>
          <AlignButtons value={element.textAlign || "left"} onChange={(v) => onChange({ ...element, textAlign: v })} />
        </div>
        <WidthControl element={element} onChange={onChange} />
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Alt Text</label>
          <input
            type="text"
            value={element.alt || ""}
            onChange={(e) => onChange({ ...element, alt: e.target.value })}
            placeholder="Describes the image for screen readers"
            className="w-full px-2 py-1.5 border border-gray-300 rounded-full text-sm"
          />
        </div>
      </div>
    );
  }

  if (element.type === "divider") {
    return (
      <div className="w-72 shrink-0 min-h-0 bg-white border-l border-gray-200 p-4 pb-10 flex flex-col gap-4 overflow-y-auto">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Thickness (px)</label>
          <input
            type="number"
            min={1}
            max={12}
            value={element.dividerThickness ?? 1}
            onChange={(e) => onChange({ ...element, dividerThickness: Number(e.target.value) })}
            className="w-full px-2 py-1.5 border border-gray-300 rounded-full text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Color</label>
          <input
            type="color"
            value={element.dividerColor || "#e5e7eb"}
            onChange={(e) => onChange({ ...element, dividerColor: e.target.value })}
            className="w-full h-9 border border-gray-300 rounded cursor-pointer"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Top Spacing (px)</label>
            <input
              type="number"
              min={0}
              max={64}
              value={element.dividerSpacingTop ?? 0}
              onChange={(e) => onChange({ ...element, dividerSpacingTop: Number(e.target.value) })}
              className="w-full px-2 py-1.5 border border-gray-300 rounded-full text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Bottom Spacing (px)</label>
            <input
              type="number"
              min={0}
              max={64}
              value={element.dividerSpacingBottom ?? 0}
              onChange={(e) => onChange({ ...element, dividerSpacingBottom: Number(e.target.value) })}
              className="w-full px-2 py-1.5 border border-gray-300 rounded-full text-sm"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-72 shrink-0 bg-white border-l border-gray-200 p-4">
      <p className="text-sm text-gray-400">No editable properties for this element.</p>
    </div>
  );
}

// --- Preview — a real interactive sandbox, not a screenshot. Reuses FormElementRenderer's
// existing `interactive` mode (the same code path a future public-form renderer would use) rather
// than a second, fake read-only copy — typing, dropdowns, and native required-field validation all
// behave as they would on the real public form. The one difference: submit is intercepted so
// nothing is ever actually sent anywhere.

// Real device widths, so the preview is measured against something a visitor actually holds rather
// than an arbitrary "narrow" setting.
const DEVICE_WIDTHS = { desktop: null, tablet: 768, mobile: 390 };

// Split the flat Builder list into pages at each page-break marker. Mirrors PublicFormPage's
// buildPages, but works from the Builder's marker list rather than saved sections — so the preview
// shows what the CURRENT draft would do, not what was last published.
function buildPreviewPages(elements) {
  const pages = [];
  let current = [];
  for (const el of elements) {
    if (el.type === PAGE_BREAK && current.length > 0) {
      pages.push(current);
      current = [];
    }
    current.push(el);
  }
  if (current.length > 0) pages.push(current);
  return pages.length > 0 ? pages : [[]];
}

function PreviewModal({ elements, fieldMetaById, theme, onClose }) {
  const [values, setValues] = useState({});
  const [device, setDevice] = useState("desktop");
  const [pageIndex, setPageIndex] = useState(0);
  const rt = resolveTheme(theme); // see the note in Canvas — the renderer needs resolved tokens

  const pages = buildPreviewPages(elements);
  const isMultiPage = pages.length > 1;
  const pageElements = pages[Math.min(pageIndex, pages.length - 1)] || [];
  const isLastPage = pageIndex >= pages.length - 1;

  const handleChange = (fieldId, value) => setValues((prev) => ({ ...prev, [fieldId]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isLastPage) return setPageIndex((i) => i + 1);
    toast.success("This is a preview — no data was submitted.");
  };

  const deviceWidth = DEVICE_WIDTHS[device];

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[10000] p-4">
      {/* max-w-4xl, not 3xl: at 3xl the modal's own padding squeezed the 768px tablet frame down to
          ~703px, so "Tablet" silently previewed a narrower device than it claimed. */}
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-3.5 border-b border-gray-100 flex items-center gap-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-900">Preview</h2>
            <p className="text-[11px] text-gray-400">Nothing you enter here gets submitted.</p>
          </div>

          <div className="flex gap-1 ml-auto">
            {[["desktop", Monitor], ["tablet", Tablet], ["mobile", Smartphone]].map(([key, Icon]) => (
              <button
                key={key}
                onClick={() => setDevice(key)}
                title={key[0].toUpperCase() + key.slice(1)}
                className={`p-1.5 rounded border ${device === key ? "bg-blue-50 border-blue-300 text-blue-600" : "border-gray-200 text-gray-400 hover:bg-gray-50"}`}
              >
                <Icon className="w-4 h-4" />
              </button>
            ))}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
        </div>

        {/* The device frame constrains the form's own width, and the stacking rule is a container
            query against that width — so narrowing this genuinely reproduces what a phone shows,
            rather than only looking narrower. */}
        {/* Three classes here are each load-bearing, and the form could not be scrolled without all
            of them:
              min-h-0     — a flex child defaults to `min-height: auto`, so this pane would refuse to
                            shrink below its content and grow past the modal's max-h.
              items-start — this pane is also a ROW flex container, so `align-items: stretch` sized
                            the device frame to the pane's height (299px) while the form inside was
                            1904px. Combined with the frame's overflow-hidden that CLIPPED the form,
                            leaving nothing taller than the pane and therefore nothing to scroll.
              overflow-y-auto — the actual scroller. */}
        <div className="flex-1 min-h-0 items-start overflow-y-auto p-6 flex justify-center" style={{ background: rt.backgroundColor }}>
          <div
            // flex-none + min-w-0 are both load-bearing: a flex item defaults to `min-width: auto`,
            // which means it refuses to shrink below its content's minimum — so the form ignored
            // the 390px frame and spilled straight out of it. min-w-0 lets the frame hold its set
            // width, flex-none stops it growing, and overflow-hidden clips anything that genuinely
            // cannot fit instead of letting it escape the device outline.
            className={`min-w-0 flex-none overflow-hidden ${
              deviceWidth ? "border border-gray-300 rounded-2xl shadow-sm p-2" : "w-full"
            }`}
            style={deviceWidth ? { width: deviceWidth, maxWidth: "100%" } : { width: "100%", maxWidth: `${rt.formMaxWidth}px` }}
          >
            <form onSubmit={handleSubmit} className="form-theme-scope w-full box-border" style={themeCssVars(theme)}>
              {isMultiPage && (
                <div className="mb-4">
                  <div className="flex items-center justify-between text-xs form-help mb-1.5">
                    <span>Step {pageIndex + 1} of {pages.length}</span>
                    <span>{Math.round(((pageIndex + 1) / pages.length) * 100)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--form-border)" }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${((pageIndex + 1) / pages.length) * 100}%`, background: "var(--form-primary)" }} />
                  </div>
                </div>
              )}

              <div className={FORM_GRID_CLASS}>
                {pageElements.map((el) =>
                  el.type === "submitButton" && !isLastPage ? null : (
                    <div key={el.id} className={columnSpanClass(el)}>
                      <FormElementRenderer
                        element={el}
                        fieldMeta={el.fieldId ? fieldMetaById.get(el.fieldId) : undefined}
                        interactive={true}
                        value={el.fieldId ? values[el.fieldId] : undefined}
                        onChange={el.fieldId ? (v) => handleChange(el.fieldId, v) : undefined}
                        theme={rt}
                      />
                    </div>
                  )
                )}
              </div>

              {isMultiPage && (
                <div className="mt-5 flex items-center gap-3">
                  {pageIndex > 0 && (
                    <button
                      type="button"
                      onClick={() => setPageIndex((i) => i - 1)}
                      className="px-4 py-2 text-sm font-medium rounded-lg border"
                      style={{ borderColor: "var(--form-border)", color: "var(--form-text)" }}
                    >
                      ← Back
                    </button>
                  )}
                  {!isLastPage && (
                    <button type="button" onClick={() => setPageIndex((i) => i + 1)} className="form-button text-sm ml-auto">
                      Continue →
                    </button>
                  )}
                </div>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Page ---

const FormBuilderPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
  const [elements, setElements] = useState([]);
  const [theme, setTheme] = useState({});
  const [customFields, setCustomFields] = useState([]);
  const [industryOptions, setIndustryOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [saveError, setSaveError] = useState(null);
  // The palette item currently being dragged, for the DragOverlay's floating copy — cleared on
  // both a completed drop (handleDragEnd) and an aborted drag (Escape / dropped outside a target).
  const [activeDrag, setActiveDrag] = useState(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await API.get(`/forms/${id}`);
      const f = res.data.form;
      setForm(f);
      setTheme(f.theme || {});
      // Flatten EVERY section, not just layout[0] — reading only the first silently dropped any
      // further sections the moment the form was saved again.
      setElements(ensureSubmitButton(sectionsToElements(f.layout)));

      const endpoint = FIELD_ENDPOINT_BY_MODULE[f.module];
      if (endpoint) {
        try {
          const fieldsRes = await API.get(endpoint);
          setCustomFields(fieldsRes.data?.fields || []);
        } catch {
          setCustomFields([]);
        }
      }

      if (f.module === "Company") {
        try {
          const industriesRes = await API.get("/company-industries");
          setIndustryOptions((industriesRes.data || []).map((i) => i.name));
        } catch {
          setIndustryOptions([]);
        }
      }
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

  useEffect(() => { load(); }, [load]);

  const fieldMetaById = useMemo(() => {
    const map = new Map();
    if (form) {
      // Attach each system dropdown's static enum so the canvas/preview render real options rather
      // than an empty select — the same list the backend freezes into resolvedFields at publish.
      const withOptions = (f) => (SYSTEM_FIELD_OPTIONS[f.fieldId] ? { ...f, options: SYSTEM_FIELD_OPTIONS[f.fieldId] } : f);
      (SYSTEM_FIELDS[form.module] || []).forEach((f) => map.set(f.fieldId, withOptions(f)));
      SYSTEM_FIELDS.Company.forEach((f) => map.set(f.fieldId, withOptions(f)));
    }
    if (map.has("system:company.industry")) {
      map.set("system:company.industry", { ...map.get("system:company.industry"), options: industryOptions });
    }
    customFields.forEach((f) =>
      map.set(f._id, { fieldId: f._id, label: f.name, type: f.type, options: f.options || [], baseRequired: !!f.required })
    );
    return map;
  }, [form, customFields, industryOptions]);

  // A field is "always required" (locked, can't be unchecked) if it's a hardcoded system
  // baseRequired field OR a custom field whose own definition (Settings > *Fields) has
  // `required: true`. Reads live off fieldMetaById so a Settings-side change is reflected here
  // with zero Builder code changes — same principle as the custom-fields palette itself.
  const isAlwaysRequired = useCallback(
    (fieldId) => BASE_REQUIRED_FIELD_IDS.has(fieldId) || !!fieldMetaById.get(fieldId)?.baseRequired,
    [fieldMetaById]
  );

  // All fields (system + custom) that must exist on the canvas for `module` to be creatable —
  // used both to lock a field's Required checkbox and to auto-backfill missing ones.
  const getRequiredFieldsForModule = useCallback(
    (module) => {
      const systemRequired = (SYSTEM_FIELDS[module] || []).filter((f) => f.baseRequired);
      const customRequired =
        form?.module === module
          ? customFields.filter((f) => f.required).map((f) => ({ fieldId: f._id, label: f.name }))
          : [];
      return [...systemRequired, ...customRequired];
    },
    [form, customFields]
  );

  // Fields already placed on canvas — used to disable them in the palette so a duplicate can't be
  // dragged a second time. The backend's assertUniqueFieldIds is a correctness backstop for this,
  // not the primary defense.
  const usedFieldIds = useMemo(
    () => new Set(elements.filter((e) => e.type === "field").map((e) => e.fieldId)),
    [elements]
  );

  const updateElement = (updated) => {
    setElements((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    setDirty(true);
  };

  const updateTheme = (updated) => {
    setTheme(updated);
    setDirty(true);
  };

  // A baseRequired field (e.g. Company Name, Industry) can't be removed while any other field from
  // the same module is still on the canvas — that other field is evidence the form still creates a
  // record in that module, so the mandatory field must stay regardless of whether it was dropped in
  // manually or auto-inserted. Once it's the last field left for that module, deleting it is safe.
  const isFieldLocked = useCallback(
    (element) => {
      if (element.type !== "field" || !isAlwaysRequired(element.fieldId)) return false;
      const owningModule = moduleFromFieldId(element.fieldId) || (element.source === "custom" ? form?.module : null);
      if (!owningModule) return false;
      return elements.some(
        (e) => e.id !== element.id && e.type === "field" && (moduleFromFieldId(e.fieldId) || (e.source === "custom" ? form?.module : null)) === owningModule
      );
    },
    [elements, isAlwaysRequired, form]
  );

  const deleteElement = (elId) => {
    const target = elements.find((e) => e.id === elId);
    if (target && isFieldLocked(target)) {
      const label = fieldMetaById.get(target.fieldId)?.label || "This field";
      toast.error(`${label} is required while ${moduleFromFieldId(target.fieldId)} fields exist on this form.`);
      return;
    }
    setElements((prev) => prev.filter((e) => e.id !== elId));
    if (selectedId === elId) setSelectedId(null);
    setDirty(true);
  };

  const handleDragEnd = (event) => {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;

    if (active.data.current?.type === "palette") {
      const { source, field } = active.data.current;
      let newElement;
      // A block expands into several ordinary field elements, so this path inserts a LIST. Fields
      // already on the canvas are skipped rather than duplicated (assertUniqueFieldIds would reject
      // a repeated fieldId at publish, and the palette disables a fully-used block anyway).
      let newElements = null;
      if (source === "block") {
        const block = (ADDRESS_BLOCKS[field.module] || []).find((b) => b.key === field.blockKey);
        if (!block) return;
        newElements = block.fields
          .filter(([fid]) => !usedFieldIds.has(fid))
          .map(([fid, width]) => ({
            id: uid(),
            type: "field",
            fieldId: fid,
            source: "system",
            required: isAlwaysRequired(fid),
            layoutWidth: width,
          }));
        if (newElements.length === 0) return;
      } else if (source === "layout") {
        if (field.layoutType === "heading") newElement = { id: uid(), type: "heading", text: "Heading" };
        else if (field.layoutType === "paragraph") newElement = { id: uid(), type: "paragraph", text: "Paragraph text" };
        else if (field.layoutType === "divider") newElement = { id: uid(), type: "divider" };
        // Starts with no url — the canvas renders an empty placeholder prompting an upload from the
        // Properties panel, so the element is placeable/positionable before an image is chosen.
        else if (field.layoutType === "image") newElement = { id: uid(), type: "image", imageWidth: 100, textAlign: "left" };
        // Everything dropped BELOW this marker belongs to the new section, until the next marker.
        else if (field.layoutType === "section") newElement = { id: uid(), type: SECTION_BREAK, title: "Section", description: "" };
        else if (field.layoutType === "page") newElement = { id: uid(), type: PAGE_BREAK, title: "Next Page", description: "" };
      } else {
        if (usedFieldIds.has(field.fieldId)) return; // guard: same check as the disabled palette state
        // system or custom field — targetModule is deliberately NOT set here; it's derived
        // server-side at publish time (formVersionService.deriveTargetModule), never by the UI.
        newElement = {
          id: uid(),
          type: "field",
          fieldId: field.fieldId,
          source,
          required: isAlwaysRequired(field.fieldId),
        };
      }
      const inserted = newElements || (newElement ? [newElement] : null);
      if (!inserted) return;

      setElements((prev) => {
        const withoutSubmit = prev.filter((e) => e.type !== "submitButton");
        const submitEl = prev.find((e) => e.type === "submitButton");
        const overIndex = withoutSubmit.findIndex((e) => e.id === over.id);
        const insertAt = overIndex === -1 ? withoutSubmit.length : overIndex + 1;
        let next = [...withoutSubmit];
        next.splice(insertAt, 0, ...inserted);

        // Any field (system or custom) belongs to a CRM module that has its own hard-required
        // fields (e.g. Company Name for any Company field, or a custom field marked Required in
        // Settings) — the builder must never let a visitor-facing form reach publish in a state
        // that can't actually create the record it's meant for. Backfill silently, mark the
        // inserted fields so the canvas can explain why they're there.
        if (source === "system" || source === "custom" || source === "block") {
          const owningModule =
            source === "block" ? field.module
            : source === "system" ? moduleFromFieldId(field.fieldId)
            : form?.module;
          if (owningModule) {
            const requiredFields = getRequiredFieldsForModule(owningModule);
            const existingIds = new Set(next.filter((e) => e.type === "field").map((e) => e.fieldId));
            const missing = requiredFields.filter((f) => !existingIds.has(f.fieldId));
            if (missing.length > 0) {
              const missingElements = missing.map((f) => ({
                id: uid(),
                type: "field",
                fieldId: f.fieldId,
                source: SYSTEM_FIELDS[owningModule]?.some((sf) => sf.fieldId === f.fieldId) ? "system" : "custom",
                required: true,
              }));
              next = [...missingElements, ...next];
              const labels = missing.map((f) => f.label).join(" and ");
              // One-time notification only — no permanent marker is kept on the element (backend
              // schema has no autoAdded field either). Once inserted, these fields behave exactly
              // like any other field; the user only needs to be told why, once.
              setTimeout(() => toast(`${labels} automatically added — required to create ${owningModule} records.`, { icon: "ℹ️" }), 0);
            }
          }
        }

        return ensureSubmitButton(submitEl ? [...next, submitEl] : next);
      });
      setDirty(true);
      return;
    }

    // Reordering an existing canvas element. If dropped over the canvas container itself (empty
    // space below/between items, geometrically closest to the container rather than a specific
    // sortable item — a real gap in the first version of this file, not a hypothetical one), treat
    // it as "move to the end" instead of silently doing nothing.
    if (active.id === over.id) return;
    setElements((prev) => {
      const oldIndex = prev.findIndex((e) => e.id === active.id);
      if (oldIndex === -1) return prev;
      if (over.id === "canvas-droppable") {
        const withoutActive = prev.filter((e) => e.id !== active.id);
        const submitIdx = withoutActive.findIndex((e) => e.type === "submitButton");
        const insertAt = submitIdx === -1 ? withoutActive.length : submitIdx;
        const moved = prev[oldIndex];
        const next = [...withoutActive];
        next.splice(insertAt, 0, moved);
        return next;
      }
      const newIndex = prev.findIndex((e) => e.id === over.id);
      if (newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
    setDirty(true);
  };

  // Uploads the branding logo and returns its URL. The caller (FieldsPanel) writes it into local
  // theme state, which persists on the next Save Draft / Publish like any other theme change.
  const uploadFormImage = async (file) => {
    const body = new FormData();
    body.append("image", file);
    const res = await API.post(`/forms/${id}/image`, body, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data.url;
  };

  // Turns the flat Builder list back into the schema's nested sections, splitting at each
  // sectionBreak marker. See the sectionsToElements/elementsToSections pair for why the Builder
  // keeps a flat list at all.
  const buildLayoutPayload = () => elementsToSections(elements);

  // `silent` distinguishes an autosave from the explicit button: autosave must not fire a toast on
  // every pause in typing, and must not surface a transient failure as an alarm when the next
  // attempt will retry in a few seconds anyway. A failure IS still surfaced, via saveError below.
  // "" is how this Builder represents "no override — fall back to the preset/theme": it's what the
  // Reset buttons and "Use theme styling" write, and what resolveTheme treats as unset. It must NOT
  // reach the API: several schema paths (theme.fontSize/fontWeight/textAlign/formShadow/inputStyle/
  // buttonWidth/buttonPosition, and an element's own position/textAlign/layoutWidth) are Mongoose
  // ENUMS, and "" is not a member of any of them — so the whole PATCH fails validation and every
  // save after a Reset click dies with "Couldn't save".
  //
  // Dropping the key is also exactly the right semantics: saveDraft assigns `form.theme = theme`
  // wholesale, so an absent key genuinely clears a previously stored override.
  const stripEmpties = (obj) =>
    Object.fromEntries(Object.entries(obj || {}).filter(([, v]) => v !== "" && v !== undefined && v !== null));

  const buildSavePayload = () => ({
    layout: buildLayoutPayload().map((section) => ({
      ...section,
      elements: (section.elements || []).map(stripEmpties),
    })),
    theme: stripEmpties(theme),
  });

  const saveDraft = async ({ silent = false } = {}) => {
    setSaving(true);
    try {
      const res = await API.patch(`/forms/${id}`, buildSavePayload());
      setForm(res.data.form);
      setDirty(false);
      setSaveError(null);
      setLastSavedAt(new Date());
      if (!silent) toast.success("Draft saved");
      return true;
    } catch (err) {
      const message = err.response?.data?.error || "Failed to save";
      setSaveError(message);
      // Autosave stays quiet — the header already shows the failure and offers Retry. Only an
      // explicit Save Draft click gets a toast, because the user is waiting on that answer.
      if (!silent) toast.error(message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Autosave: debounced, and only ever while there are unsaved changes. Deliberately does NOT
  // publish — a draft save updates the working copy only (formPublishService.saveDraft sets
  // hasUnpublishedChanges), so nothing a visitor sees changes until Publish is pressed.
  useEffect(() => {
    if (!dirty || !id || loading) return;
    // Skipped while a save is already running or one has failed: retrying on a timer would spam a
    // failing endpoint, and the header's Retry gives the user an explicit way back.
    if (saving || saveError) return;
    const t = setTimeout(() => { saveDraft({ silent: true }); }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, elements, theme, id, loading, saving, saveError]);

  // Last line of defence for the "lost 30 minutes of work" case — the browser's own confirm dialog
  // if something is still unsaved when the tab closes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const publish = async () => {
    setPublishing(true);
    try {
      // Save first so publish always reflects the current canvas, not the last save.
      const saveRes = await API.patch(`/forms/${id}`, buildSavePayload());
      setForm(saveRes.data.form);
      setDirty(false);
      const res = await API.post(`/forms/${id}/publish`);
      toast.success(`Published (version ${res.data.versionNumber})`);
      navigate(`/forms/${id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to publish");
    } finally {
      setPublishing(false);
    }
  };

  if (loading || !form) {
    return (
      <PageSkeleton variant="generic" />
    );
  }

  const selectedElement = elements.find((e) => e.id === selectedId) || null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={(event) => setActiveDrag(event.active.data.current || null)}
      onDragCancel={() => setActiveDrag(null)}
      onDragEnd={handleDragEnd}
    >
      {/* The shared app layout applies py-6 px-4 sm:px-6 lg:px-8 to every routed page; this page
          opts back out the same way Companies/FormDetailPage do, with a true fixed strip anchored
          to the sidebar edge (not just cancelled page padding) so it runs genuinely edge-to-edge,
          flush against the sidebar and the viewport's right edge — matching Companies.jsx exactly. */}
      {/* h-screen (100vh) measured from the viewport top, but this box actually starts below the
          app's own fixed navbar — so a plain h-screen ran that navbar's height past the bottom of
          the viewport, leaving a blank strip the page could scroll down into. Sized to the real
          visible area instead.
          -mb-6 alongside -mt-6: <main> applies its own py-6 on BOTH edges; -mt-6 only cancelled
          the top one, leaving the bottom 24px unaccounted for.
          The subtracted constant is NOT the navbar's own height (that's what the fixed header
          strip below uses for ITS top offset, a separate concern) — it's this box's actual
          rendered top position after <main>'s pt-[70px]/pt-20 minus our -mt-6, i.e. 70-24=46 /
          80-24=56. Measured live via browser devtools; using the navbar height directly here
          (54/64) left this box 8px short of the viewport on every screen size. */}
      <div className="flex flex-col -mt-6 -mb-6 -mx-4 sm:-mx-6 lg:-mx-8 h-[calc(100vh-46px-var(--dc-offline-offset,0px))] lg:h-[calc(100vh-56px-var(--dc-offline-offset,0px))]">
        <div
          className="fixed right-0 h-16 px-4 sm:px-6 lg:px-8 border-b border-[#E1E4EA] bg-white flex items-center gap-4 top-[calc(54px+var(--dc-offline-offset,0px))] lg:top-[calc(64px+var(--dc-offline-offset,0px))]"
          style={{ left: "var(--sidebar-width, 0px)", zIndex: 40, minHeight: "64px", maxHeight: "64px", boxSizing: "border-box" }}
        >
          <Link to={`/forms/${id}`} className="flex items-center gap-1.5 text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium flex-shrink-0">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <div className="h-6 w-px bg-gray-200 flex-shrink-0" />
          <div className="min-w-0 flex items-center gap-2">
            <h1 className="m-0 leading-tight font-bold text-base sm:text-lg text-gray-900 truncate">
              {form.title}
            </h1>
          </div>
          {/* One status, four states — the user should never have to wonder whether their work is
              safe. A failure is the only one that asks for action. */}
          {saveError ? (
            <span className="text-xs text-red-600 font-medium flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> Couldn't save
              <button
                onClick={() => { setSaveError(null); saveDraft({ silent: true }); }}
                className="underline hover:no-underline"
              >
                Retry
              </button>
              {lastSavedAt && <span className="text-gray-400 font-normal">· last saved {timeAgo(lastSavedAt)}</span>}
            </span>
          ) : saving ? (
            <span className="text-xs text-gray-400">Saving…</span>
          ) : dirty ? (
            <span className="text-xs text-amber-600 font-medium">Unsaved changes</span>
          ) : lastSavedAt ? (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Check className="w-3.5 h-3.5 text-green-600" /> Saved
            </span>
          ) : null}
          <div className="flex-1" />
          <button
            onClick={() => setShowPreview(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-full hover:bg-gray-50 transition-colors"
          >
            <EyeIcon className="w-4 h-4" /> Preview
          </button>
          <button
            onClick={() => saveDraft()}
            disabled={saving || (!dirty && !saveError)}
            title={!dirty && !saveError ? "Everything is saved" : undefined}
            className="px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-full hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : "Save Draft"}
          </button>
          <button
            onClick={publish}
            disabled={publishing}
            className="px-4 py-2 bg-[#0085FF] text-white text-sm font-semibold rounded-full hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            {publishing ? "Publishing..." : "Publish"}
          </button>
        </div>

        {/* Spacer to offset the fixed header strip above, matching its own height exactly. */}
        <div className="h-[72px] lg:h-16 shrink-0" />

        <div className="flex-1 flex overflow-hidden min-h-0">
          <FieldsPanel
            module={form.module}
            customFields={customFields}
            usedFieldIds={usedFieldIds}
            theme={theme}
            onThemeChange={updateTheme}
          />
          <Canvas
            elements={elements}
            fieldMetaById={fieldMetaById}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDelete={deleteElement}
            isFieldLocked={isFieldLocked}
            theme={theme}
          />
          <PropertiesPanel element={selectedElement} fieldMetaById={fieldMetaById} onChange={updateElement} onUploadImage={uploadFormImage} />
        </div>
      </div>

      {showPreview && <PreviewModal elements={elements} fieldMetaById={fieldMetaById} theme={theme} onClose={() => setShowPreview(false)} />}

      {/* Renders in a portal outside every clipped ancestor (the palette's own overflow-y-auto
          included), so the dragged item stays visible the whole way to the canvas instead of
          vanishing the moment it crosses the palette's edge.
          Only for a PALETTE drag (dragging a new field in from the sidebar) — this DndContext
          also covers canvas-internal reordering (CanvasItem's own useSortable), whose drag data
          has no `field.label` at all, so this used to fall back to a floating "Field" pill
          overlapping the row actually being reordered instead of showing nothing. */}
      <DragOverlay dropAnimation={null}>
        {activeDrag?.type === "palette" ? (
          <div className="w-56">
            <PaletteItemVisual dragging>{activeDrag.field?.label || "Field"}</PaletteItemVisual>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

export default FormBuilderPage;
import PageSkeleton from "../components/common/PageSkeleton";
import EyeIcon from "../components/common/EyeIcon";
