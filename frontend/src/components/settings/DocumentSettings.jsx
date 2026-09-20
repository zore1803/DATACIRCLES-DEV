import DeleteIcon from "../common/DeleteIcon";
import NotesTermsDrawer from "../invoice/NotesTermsDrawer";
import PdfIcon from "../common/PdfIcon";
import PlusIcon from "../common/PlusIcon";
import React, { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import API from "../../services/api";
import { Save, PenSquare, CheckCircle, ShieldCheck, MessageCircle, MessageSquare, Mail, Lock } from "lucide-react";
import SignatureModal from "./SignatureModal";
import PdfFileNameSettings from "./PdfFileNameSettings";
import { PREDEFINED_NOTES, PREDEFINED_TERMS } from "../../utils/documentDefaultText";
import { DEFAULT_FORMATS } from "../../utils/pdfFilename";
import EyeIcon from "../common/EyeIcon";
import EditIcon from "../common/EditIcon";

// Dynamic values Email/SMS templates can reference — shown to the user as
// plain labels they click to insert, never as raw {placeholder} syntax they
// have to remember or type themselves.
const MESSAGE_PLACEHOLDER_TOKENS = [
  { key: "customerName", label: "Customer Name" },
  { key: "docType", label: "Document Type" },
  { key: "number", label: "Document Number" },
  { key: "amount", label: "Amount" },
  { key: "link", label: "View Link" },
  { key: "company", label: "Company Name" },
];

// Two forms of the same thing:
//   - Stored form ({customerName}) — how the backend and ShareFlyoutMenu's
//     substitution logic have always keyed these.
//   - Friendly form ([Customer Name]) — what the user sees in the editor
//     instead of the technical curly-brace token.
// Templates are held in editor state in friendly form (so text areas, char
// counts, and previews all read naturally) and translated back on save.
const FRIENDLY_LABEL_BY_KEY = MESSAGE_PLACEHOLDER_TOKENS.reduce((acc, t) => {
  acc[t.key] = t.label;
  return acc;
}, {});
const KEY_BY_FRIENDLY_LABEL = MESSAGE_PLACEHOLDER_TOKENS.reduce((acc, t) => {
  acc[t.label] = t.key;
  return acc;
}, {});
const FRIENDLY_LABEL_REGEX = new RegExp(
  `\\[(${MESSAGE_PLACEHOLDER_TOKENS.map((t) => t.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\]`,
  "g"
);
const STORED_KEY_REGEX = new RegExp(
  `\\{(${MESSAGE_PLACEHOLDER_TOKENS.map((t) => t.key).join("|")})\\}`,
  "g"
);
const toFriendly = (str) =>
  (str || "").replace(STORED_KEY_REGEX, (_, k) => `[${FRIENDLY_LABEL_BY_KEY[k]}]`);
const toStored = (str) =>
  (str || "").replace(FRIENDLY_LABEL_REGEX, (_, l) => `{${KEY_BY_FRIENDLY_LABEL[l]}}`);

const DUE_DATE_DAY_PRESETS = [7, 15, 25, 30, 45];

// Applies toFriendly/toStored to whichever fields on a template row hold
// placeholder-bearing text — differs per channel (email: subject+body,
// sms: body, whatsapp: line1+line2). Non-string fields (isDefault, id, etc.)
// pass through untouched.
const templateFieldsToFriendly = (tpl) => ({
  ...tpl,
  ...(tpl.subject !== undefined ? { subject: toFriendly(tpl.subject) } : {}),
  ...(tpl.body !== undefined ? { body: toFriendly(tpl.body) } : {}),
  ...(tpl.line1 !== undefined ? { line1: toFriendly(tpl.line1) } : {}),
  ...(tpl.line2 !== undefined ? { line2: toFriendly(tpl.line2) } : {}),
});
const templateFieldsToStored = (tpl) => ({
  ...tpl,
  ...(tpl.subject !== undefined ? { subject: toStored(tpl.subject) } : {}),
  ...(tpl.body !== undefined ? { body: toStored(tpl.body) } : {}),
  ...(tpl.line1 !== undefined ? { line1: toStored(tpl.line1) } : {}),
  ...(tpl.line2 !== undefined ? { line2: toStored(tpl.line2) } : {}),
});

// Preview substitution: shows the user what the message will look like when
// the chips are filled in for a real customer. Runs against the friendly
// [Customer Name] form the editor holds in state.
const SAMPLE_VALUES = {
  "Customer Name": "Customer Name",
  "Document Type": "Invoice",
  "Document Number": "INV-001",
  "Amount": "₹1,234.00",
  "View Link": "datacircles.in/view/…",
  "Company Name": "Company Name",
};
const resolveSampleValues = (str) =>
  (str || "").replace(FRIENDLY_LABEL_REGEX, (_, l) => SAMPLE_VALUES[l] ?? `[${l}]`);

const documentTypeMeta = [
  { key: "invoice", label: "Invoice" },
  { key: "quote", label: "Quote" },
  { key: "proformaInvoice", label: "Proforma Invoice" },
  { key: "deliveryChallan", label: "Delivery Challan" },
];

// Notes/Terms are stored server-side keyed by the document's own type string
// (tax | performa | quotation | deliveryChallan — see backend
// DocumentSettings model), not the numbering tab's keys above, so map
// between the two.
const FOOTER_TYPE_KEY = {
  invoice: "tax",
  quote: "quotation",
  proformaInvoice: "performa",
  deliveryChallan: "deliveryChallan",
};

const createDefaultDocumentTypeSettings = () => ({
  invoice: { prefix: "INV-", suffix: "", prefixes: ["INV-"], suffixes: [] },
  quote: { prefix: "QT", suffix: "", prefixes: ["QT", "QTN"], suffixes: [] },
  proformaInvoice: { prefix: "PI", suffix: "", prefixes: ["PI", "PFI"], suffixes: [] },
  deliveryChallan: { prefix: "DC", suffix: "", prefixes: ["DC"], suffixes: [] },
});

function DocumentSettings() {
  const [form, setForm] = useState({
    nextInvoiceNumber: 1,
    defaultNotes: "",
    defaultTerms: "",
    defaultNotesByType: {},
    defaultTermsByType: {},
    defaultDueDateDays: "",
    documentTypeSettings: createDefaultDocumentTypeSettings(),
    pdfFilenameFormats: DEFAULT_FORMATS,
    eInvoiceDefaults: { supplyType: "B2B", reverseCharge: false },
  });
  const [signatures, setSignatures] = useState([]);
  const [isSigModalOpen, setIsSigModalOpen] = useState(false);
  const [editingSignature, setEditingSignature] = useState(null);
  // Saved Notes/Terms library — the same drawer the document forms use, so
  // there is one place that owns named blocks instead of two competing ones.
  const [footerDrawer, setFooterDrawer] = useState(null); // null | "notes" | "terms"
  const [newValues, setNewValues] = useState({
    invoice: { prefix: "", suffix: "" },
    quote: { prefix: "", suffix: "" },
    proformaInvoice: { prefix: "", suffix: "" },
    deliveryChallan: { prefix: "", suffix: "" },
  });
  const [activeTab, setActiveTab] = useState("prefix");
  const [activeDocumentType, setActiveDocumentType] = useState("invoice");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templateTab, setTemplateTab] = useState("email");
  // Named template libraries: each org can keep several message variants per
  // channel (e.g. "Standard", "Payment Reminder") and pick one when sharing a
  // document, instead of a single slot that gets overwritten every edit.
  const [whatsappTemplates, setWhatsappTemplates] = useState([]); // [{id,name,line1,line2,isDefault}]
  const [smsTemplates, setSmsTemplates] = useState([]); // [{id,name,body,isDefault}]
  const [emailTemplates, setEmailTemplates] = useState([]); // [{id,name,subject,body,isDefault}]
  // The template currently open in the inline editor, or null when showing
  // the list. `id: null` means "creating a new one".
  const [editingTemplate, setEditingTemplate] = useState(null);

  // Cursor-aware insertion targets for the Email/SMS template editor — lets a
  // token click drop the placeholder wherever the user's cursor last was,
  // instead of always appending to the end.
  const emailSubjectRef = useRef(null);
  const emailBodyRef = useRef(null);
  const smsBodyRef = useRef(null);
  const whatsappLine1Ref = useRef(null);
  const whatsappLine2Ref = useRef(null);

  const insertPlaceholderToken = (ref, currentValue, onChange, tokenKey) => {
    // Friendly chip form: what the user sees and edits. On save, the
    // outbound serializer converts these back to {tokenKey} for the backend.
    const placeholder = `[${FRIENDLY_LABEL_BY_KEY[tokenKey]}]`;
    const el = ref.current;
    const value = currentValue || "";
    if (!el) {
      onChange(value + placeholder);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + placeholder + value.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + placeholder.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const genTemplateId = () =>
    (typeof crypto !== "undefined" && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

  const fetchSignatures = async () => {
    try {
      const res = await API.get("/document-settings/signatures");
      const list = Array.isArray(res.data) ? res.data : (res.data?.signatures || []);
      setSignatures(list);
    } catch (err) {
      console.error("Failed to load signatures", err);
      setSignatures([]);
    }
  };

  useEffect(() => {
    const loadSettings = async () => {
      try {
        setLoading(true);
        const res = await API.get("/document-settings");
        const incoming = res.data?.documentTypeSettings || {};
        const normalizeSection = (key, fallback) => ({
          prefix: incoming?.[key]?.prefix || fallback.prefix || "INV",
          suffix: incoming?.[key]?.suffix || fallback.suffix || "",
          prefixes: incoming?.[key]?.prefixes || fallback.prefixes || [],
          suffixes: incoming?.[key]?.suffixes || fallback.suffixes || [],
        });

        // Backend stores placeholders as {customerName}/{docType}/…; the
        // editor shows them as friendly [Customer Name]/[Document Type]/…
        // chips instead, so translate every incoming template row.
        const rawWa = Array.isArray(res.data?.whatsappTemplates) ? res.data.whatsappTemplates : [];
        const rawSms = Array.isArray(res.data?.smsTemplates) ? res.data.smsTemplates : [];
        const rawEmail = Array.isArray(res.data?.emailTemplates) ? res.data.emailTemplates : [];
        setWhatsappTemplates(rawWa.map(templateFieldsToFriendly));
        setSmsTemplates(rawSms.map(templateFieldsToFriendly));
        setEmailTemplates(rawEmail.map(templateFieldsToFriendly));

        // Sample copy is NOT seeded into these fields any more. It used to be,
        // which made an org that had configured nothing look fully configured --
        // and, now that saving mirrors these values into the shared Notes/Terms
        // library, pressing Save would have turned that sample text into real
        // saved library entries the user never wrote. The samples remain as the
        // textarea placeholders below, so they still show what good copy looks
        // like while staying visibly unset.
        const incomingNotesByType = res.data?.defaultNotesByType || {};
        const incomingTermsByType = res.data?.defaultTermsByType || {};
        const flatNotes = res.data?.defaultNotes || "";
        const flatTerms = res.data?.defaultTerms || "";
        const seededNotesByType = { ...incomingNotesByType };
        const seededTermsByType = { ...incomingTermsByType };

        setForm({
          nextInvoiceNumber: res.data?.nextInvoiceNumber || 1,
          defaultNotes: flatNotes,
          defaultTerms: flatTerms,
          defaultNotesByType: seededNotesByType,
          defaultTermsByType: seededTermsByType,
          defaultDueDateDays: res.data?.defaultDueDateDays || "",
          documentTypeSettings: {
            invoice: normalizeSection("invoice", { prefix: "INV-", suffix: "", prefixes: ["INV-"], suffixes: [] }),
            quote: normalizeSection("quote", { prefix: "QT", suffix: "", prefixes: ["QT", "QTN"], suffixes: [] }),
            proformaInvoice: normalizeSection("proformaInvoice", { prefix: "PI", suffix: "", prefixes: ["PI", "PFI"], suffixes: [] }),
            deliveryChallan: normalizeSection("deliveryChallan", { prefix: "DC", suffix: "", prefixes: ["DC"], suffixes: [] }),
          },
          pdfFilenameFormats: res.data?.pdfFilenameFormats || DEFAULT_FORMATS,
          eInvoiceDefaults: {
            supplyType: res.data?.eInvoiceDefaults?.supplyType || "B2B",
            reverseCharge: res.data?.eInvoiceDefaults?.reverseCharge || false,
          },
        });
        await fetchSignatures();
      } catch (error) {
        console.error("Failed to load document settings", error);
        toast.error("Failed to load document settings");
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const invoiceSection = form.documentTypeSettings.invoice || {};
      await API.put("/document-settings", {
        invoicePrefix: (invoiceSection.prefix || "INV").trim(),
        invoiceSuffix: (invoiceSection.suffix || "").trim(),
        invoicePrefixes: invoiceSection.prefixes || [],
        invoiceSuffixes: invoiceSection.suffixes || [],
        documentTypeSettings: form.documentTypeSettings,
        nextInvoiceNumber: Number(form.nextInvoiceNumber) || 1,
        defaultNotes: form.defaultNotes,
        defaultTerms: form.defaultTerms,
        defaultNotesByType: form.defaultNotesByType,
        defaultTermsByType: form.defaultTermsByType,
        defaultDueDateDays: form.defaultDueDateDays ? Number(form.defaultDueDateDays) : null,
        pdfFilenameFormats: form.pdfFilenameFormats,
        eInvoiceDefaults: form.eInvoiceDefaults,
      });
      toast.success("Document settings updated");
    } catch (error) {
      console.error("Failed to save document settings", error);
      toast.error(error.response?.data?.error || "Failed to save document settings");
    } finally {
      setSaving(false);
    }
  };

  const handleOpenAddModal = () => {
    setEditingSignature(null);
    setIsSigModalOpen(true);
  };

  const handleOpenEditModal = (sig) => {
    setEditingSignature(sig);
    setIsSigModalOpen(true);
  };

  const handleSaveSignature = async (sigData) => {
    try {
      const res = await API.post("/document-settings/signatures", sigData);
      const list = Array.isArray(res.data?.signatures) ? res.data.signatures : (Array.isArray(res.data) ? res.data : []);
      setSignatures(list);
      toast.success(editingSignature ? "Signature updated successfully" : "Signature added successfully");
      setIsSigModalOpen(false);
      setEditingSignature(null);
      await fetchSignatures();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || "Failed to save signature");
    }
  };

  const handleDeleteSignature = async (id) => {
    try {
      const res = await API.delete(`/document-settings/signatures/${id}`);
      const list = Array.isArray(res.data?.signatures) ? res.data.signatures : (Array.isArray(res.data) ? res.data : []);
      setSignatures(list);
      toast.success("Signature deleted");
      await fetchSignatures();
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete signature");
    }
  };

  const handleSetDefaultSignature = async (id) => {
    try {
      const res = await API.patch(`/document-settings/signatures/${id}/default`);
      const list = Array.isArray(res.data?.signatures) ? res.data.signatures : (Array.isArray(res.data) ? res.data : []);
      setSignatures(list);
      toast.success("Default signature updated");
      await fetchSignatures();
    } catch (err) {
      console.error(err);
      toast.error("Failed to update default signature");
    }
  };

  const addValue = (documentType, kind) => {
    const value = (newValues[documentType]?.[kind] || "").trim();
    if (!value) return;

    setForm((prev) => {
      const nextSettings = { ...prev.documentTypeSettings };
      const currentSection = { ...(nextSettings[documentType] || {}) };
      const existing = kind === "prefix" ? currentSection.prefixes || [] : currentSection.suffixes || [];
      const nextValues = existing.includes(value) ? existing : [...existing, value];

      nextSettings[documentType] = {
        ...currentSection,
        ...(kind === "prefix"
          ? { prefixes: nextValues, prefix: value }
          : { suffixes: nextValues, suffix: value }),
      };

      return { ...prev, documentTypeSettings: nextSettings };
    });

    setNewValues((prev) => ({
      ...prev,
      [documentType]: { ...prev[documentType], [kind]: "" },
    }));
  };

  // Template library CRUD — shared across the WhatsApp/SMS/Email tabs. Each
  // mutation saves the whole array immediately (no separate "Save" step for
  // add/delete/set-default), matching how signatures already behave.
  const getChannelConfig = (channel) => ({
    whatsapp: { list: whatsappTemplates, setList: setWhatsappTemplates, field: "whatsappTemplates" },
    sms: { list: smsTemplates, setList: setSmsTemplates, field: "smsTemplates" },
    email: { list: emailTemplates, setList: setEmailTemplates, field: "emailTemplates" },
  }[channel]);

  const startNewTemplate = (channel) => {
    setEditingTemplate(
      channel === "whatsapp" ? { channel, id: null, name: "", line1: "", line2: "" } :
      channel === "sms" ? { channel, id: null, name: "", body: "" } :
      { channel, id: null, name: "", subject: "", body: "" }
    );
  };

  const startEditTemplate = (channel, tpl) => setEditingTemplate({ channel, ...tpl });
  const cancelEditTemplate = () => setEditingTemplate(null);

  const saveEditingTemplate = async () => {
    if (!editingTemplate) return;
    const { channel, id, ...rest } = editingTemplate;
    if (!rest.name?.trim()) {
      toast.error("Give the template a name");
      return;
    }
    const { list, setList, field } = getChannelConfig(channel);
    const nextList = id
      ? list.map((t) => (t.id === id ? { ...t, ...rest } : t))
      : [...list, { id: genTemplateId(), ...rest, isDefault: list.length === 0, createdAt: new Date().toISOString() }];

    setSaving(true);
    try {
      // Local state holds friendly [Customer Name] chips; backend expects
      // {customerName} tokens — translate every row on the way out.
      await API.put("/document-settings", { [field]: nextList.map(templateFieldsToStored) });
      setList(nextList);
      setEditingTemplate(null);
      toast.success("Template saved");
    } catch {
      toast.error("Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = async (channel, id) => {
    const { list, setList, field } = getChannelConfig(channel);
    const deleted = list.find((t) => t.id === id);
    let nextList = list.filter((t) => t.id !== id);
    if (deleted?.isDefault && nextList.length > 0) {
      nextList = nextList.map((t, i) => ({ ...t, isDefault: i === 0 }));
    }
    setSaving(true);
    try {
      await API.put("/document-settings", { [field]: nextList.map(templateFieldsToStored) });
      setList(nextList);
      toast.success("Template deleted");
    } catch {
      toast.error("Failed to delete template");
    } finally {
      setSaving(false);
    }
  };

  const setDefaultTemplate = async (channel, id) => {
    const { list, setList, field } = getChannelConfig(channel);
    const nextList = list.map((t) => ({ ...t, isDefault: t.id === id }));
    setSaving(true);
    try {
      await API.put("/document-settings", { [field]: nextList.map(templateFieldsToStored) });
      setList(nextList);
    } catch {
      toast.error("Failed to update default");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col items-center justify-center min-h-[300px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-500 border-t-transparent mb-3"></div>
        <p className="text-sm font-medium text-gray-600">Loading document settings...</p>
      </div>
    );
  }

  const currentTemplateList =
    templateTab === "whatsapp" ? whatsappTemplates :
    templateTab === "sms" ? smsTemplates :
    emailTemplates;

  const currentSection = form.documentTypeSettings?.[activeDocumentType] || {};
  const currentValue = activeTab === "prefix" ? currentSection.prefix || "" : currentSection.suffix || "";
  const previewPrefix = currentSection.prefix?.trim();
  const previewSuffix = currentSection.suffix?.trim();
  const previewSegments = [
    ...(previewPrefix ? [previewPrefix] : []),
    String(form.nextInvoiceNumber || 1),
    ...(previewSuffix ? [previewSuffix] : []),
  ];
  const previewNumber = previewSegments.length ? previewSegments.join(" - ") : `INV-${form.nextInvoiceNumber || 1}`;

  const sigList = Array.isArray(signatures) ? signatures : [];

  return (
    <div className="space-y-8">
      {/* SECTION 1: Document Numbering Settings */}
      <div className="p-6 bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-xl bg-sky-50 text-sky-600">
            <PdfIcon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Document Settings</h3>
            <p className="text-sm text-gray-500">Manage saved prefixes and suffixes for invoices, quotes, proforma invoices, and delivery challans.</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="flex flex-wrap gap-2">
              {[
                { key: "prefix", label: "Prefix" },
                { key: "suffix", label: "Suffix" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${activeTab === tab.key ? "bg-sky-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {documentTypeMeta.map((documentType) => {
                const isActive = activeDocumentType === documentType.key;
                return (
                  <button
                    key={documentType.key}
                    type="button"
                    onClick={() => setActiveDocumentType(documentType.key)}
                    className={`rounded-full border px-3 py-2 text-sm font-medium ${isActive ? "border-sky-600 bg-sky-50 text-sky-700" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
                  >
                    {documentType.label}
                  </button>
                );
              })}
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              {(() => {
                const options = activeTab === "prefix" ? currentSection.prefixes || [] : currentSection.suffixes || [];
                const placeholder = activeTab === "prefix"
                  ? `Add new ${documentTypeMeta.find((item) => item.key === activeDocumentType)?.label.toLowerCase()} prefix`
                  : `Add new ${documentTypeMeta.find((item) => item.key === activeDocumentType)?.label.toLowerCase()} suffix`;

                return (
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-800">
                        {documentTypeMeta.find((item) => item.key === activeDocumentType)?.label} {activeTab === "prefix" ? "Prefix" : "Suffix"}
                      </h4>
                      <p className="text-sm text-gray-500">Update the saved {activeTab} for this document type.</p>
                    </div>

                    <label className="flex flex-col gap-2 text-sm">
                      <span className="font-medium text-gray-700">{activeTab === "prefix" ? "Prefix" : "Suffix"}</span>
                      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
                        <PenSquare className="w-4 h-4 text-gray-400" />
                        <select
                          value={currentValue}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              documentTypeSettings: {
                                ...prev.documentTypeSettings,
                                [activeDocumentType]: {
                                  ...prev.documentTypeSettings[activeDocumentType],
                                  [activeTab]: e.target.value,
                                },
                              },
                            }))
                          }
                          className="w-full outline-none bg-transparent"
                        >
                          {activeTab === "suffix" && <option value="">None</option>}
                          {options.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex gap-2">
                        <input
                          value={newValues[activeDocumentType]?.[activeTab] || ""}
                          onChange={(e) =>
                            setNewValues((prev) => ({
                              ...prev,
                              [activeDocumentType]: {
                                ...prev[activeDocumentType],
                                [activeTab]: e.target.value,
                              },
                            }))
                          }
                          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                          placeholder={placeholder}
                        />
                        <button
                          type="button"
                          onClick={() => addValue(activeDocumentType, activeTab)}
                          className="rounded-lg border border-sky-200 px-3 py-2 text-sm font-medium text-sky-700 hover:bg-sky-50"
                        >
                          Add
                        </button>
                      </div>
                    </label>
                  </div>
                );
              })()}
            </div>

            {(() => {
              const footerKey = FOOTER_TYPE_KEY[activeDocumentType];
              const activeLabel = documentTypeMeta.find((item) => item.key === activeDocumentType)?.label || "";
              const notesOverride = form.defaultNotesByType[footerKey];
              const termsOverride = form.defaultTermsByType[footerKey];
              const notesValue = notesOverride ?? form.defaultNotes ?? "";
              const termsValue = termsOverride ?? form.defaultTerms ?? "";
              const setNotes = (value) =>
                setForm((prev) => ({
                  ...prev,
                  defaultNotesByType: { ...prev.defaultNotesByType, [footerKey]: value },
                }));
              const setTerms = (value) =>
                setForm((prev) => ({
                  ...prev,
                  defaultTermsByType: { ...prev.defaultTermsByType, [footerKey]: value },
                }));

              return (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-800">Default Notes &amp; Terms — {activeLabel}</h4>
                      <p className="text-sm text-gray-500">
                        Saved per document type, then inserted with one click while creating a {activeLabel.toLowerCase()}.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFooterDrawer("notes")}
                      className="flex-shrink-0 text-[13px] font-semibold text-[#0085FF] hover:underline"
                    >
                      Manage saved blocks
                    </button>
                  </div>

                  <label className="flex flex-col gap-2 text-sm">
                    <span className="flex items-center justify-between font-medium text-gray-700">
                      Notes
                      <button
                        type="button"
                        onClick={() => setFooterDrawer("notes")}
                        className="text-[12px] font-semibold text-[#0085FF] hover:underline"
                      >
                        + Add / choose saved note
                      </button>
                    </span>
                    <textarea
                      rows={3}
                      value={notesValue}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder={PREDEFINED_NOTES[footerKey] || "Thank you for the business!"}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 resize-y"
                    />
                  </label>

                  {/* One library, shared with the document forms. Applying copies the
                      chosen block into the field above; Save then persists it as this
                      document type's default. */}
                  <NotesTermsDrawer
                    isOpen={footerDrawer !== null}
                    onClose={() => setFooterDrawer(null)}
                    focus={footerDrawer || "notes"}
                    type={footerKey}
                    docName={activeLabel}
                    onApplyNotes={(body) => setNotes(body)}
                    onApplyTerms={(body) => setTerms(body)}
                  />
                  <label className="flex flex-col gap-1.5">
                    <span className="font-medium text-gray-700">Default Due Date (Days)</span>
                    {(() => {
                      const daysNum = form.defaultDueDateDays === "" ? null : Number(form.defaultDueDateDays);
                      const isPreset = daysNum !== null && DUE_DATE_DAY_PRESETS.includes(daysNum);
                      const selectValue = isPreset ? String(daysNum) : "custom";
                      return (
                        <>
                          <select
                            value={selectValue}
                            onChange={(e) => {
                              const v = e.target.value;
                              setForm((prev) => ({
                                ...prev,
                                // Switching to Custom clears a preset value
                                // rather than keeping it under a different
                                // label — leaves an already-custom value alone.
                                defaultDueDateDays: v === "custom" ? (isPreset ? "" : prev.defaultDueDateDays) : v,
                              }));
                            }}
                            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500"
                          >
                            {DUE_DATE_DAY_PRESETS.map((d) => (
                              <option key={d} value={d}>{d} days</option>
                            ))}
                            <option value="custom">Custom</option>
                          </select>
                          {!isPreset && (
                            <input
                              type="number"
                              min="0"
                              value={form.defaultDueDateDays}
                              onChange={(e) => setForm((prev) => ({ ...prev, defaultDueDateDays: e.target.value }))}
                              placeholder="Enter number of days, e.g., 20"
                              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500"
                            />
                          )}
                        </>
                      );
                    })()}
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="flex items-center justify-between font-medium text-gray-700">
                      Terms and Conditions
                      <button
                        type="button"
                        onClick={() => setFooterDrawer("terms")}
                        className="text-[12px] font-semibold text-[#0085FF] hover:underline"
                      >
                        + Add / choose saved terms
                      </button>
                    </span>
                    <textarea
                      rows={4}
                      value={termsValue}
                      onChange={(e) => setTerms(e.target.value)}
                      placeholder={PREDEFINED_TERMS[footerKey] || "1. Goods once sold cannot be taken back or exchanged.\n2. Subject to local jurisdiction."}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 resize-y"
                    />
                  </label>
                </div>
              );
            })()}

            {/* ── E-Invoice Defaults ── */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-sky-600" />
                <h3 className="text-sm font-semibold text-gray-800">E-Invoice Defaults</h3>
              </div>
              <p className="text-xs text-gray-500 -mt-1">
                These defaults apply when generating a GST e-invoice (IRP/IRIS). You can override them per-customer or per-invoice later.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Supply Type */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Supply Type</label>
                  <select
                    value={form.eInvoiceDefaults.supplyType}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, eInvoiceDefaults: { ...f.eInvoiceDefaults, supplyType: e.target.value } }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="B2B">B2B — Business to Business</option>
                    <option value="SEZWP">SEZWP — SEZ with Payment</option>
                    <option value="SEZWOP">SEZWOP — SEZ without Payment</option>
                    <option value="EXPWP">EXPWP — Export with Payment</option>
                    <option value="EXPWOP">EXPWOP — Export without Payment</option>
                    <option value="DEXP">DEXP — Deemed Export</option>
                  </select>
                </div>
                {/* Reverse Charge */}
                <div className="flex flex-col justify-center">
                  <label className="block text-xs font-medium text-gray-600 mb-2">Reverse Charge</label>
                  <label className="inline-flex items-center gap-3 cursor-pointer">
                    <div
                      onClick={() =>
                        setForm((f) => ({ ...f, eInvoiceDefaults: { ...f.eInvoiceDefaults, reverseCharge: !f.eInvoiceDefaults.reverseCharge } }))
                      }
                      className={`relative w-10 h-5 rounded-full transition-colors duration-200 cursor-pointer ${
                        form.eInvoiceDefaults.reverseCharge ? "bg-sky-600" : "bg-gray-300"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
                          form.eInvoiceDefaults.reverseCharge ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </div>
                    <span className="text-sm text-gray-700">
                      {form.eInvoiceDefaults.reverseCharge ? "Yes — Reverse charge applies" : "No — Standard charge"}
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
            >
              <Save className="w-4 h-4" />
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </form>

          <div className="rounded-2xl border border-gray-200 bg-slate-50 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <EyeIcon className="w-4 h-4" />
              Preview
            </div>

            <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-gray-500">
                <span>{documentTypeMeta.find((item) => item.key === activeDocumentType)?.label}</span>
                <span>Draft</span>
              </div>
              <div className="mt-4 space-y-3 text-sm text-gray-700">
                <div className="flex justify-between">
                  <span className="text-gray-500">Document No.</span>
                  <span className="font-semibold text-gray-900">{previewNumber}</span>
                </div>
                <div className="flex justify-center">
                  <div className="max-w-fit overflow-hidden rounded-full border border-slate-200 bg-slate-100 p-0.5">
                    <div className="inline-flex items-center gap-0.5">
                      {previewPrefix ? <span className="rounded-full bg-white px-2 py-0.5 font-semibold text-slate-700">{previewPrefix}</span> : null}
                      <span className="rounded-full bg-sky-600 px-2 py-0.5 font-semibold text-white">{form.nextInvoiceNumber || 1}</span>
                      {previewSuffix ? <span className="rounded-full bg-white px-2 py-0.5 font-semibold text-slate-700">{previewSuffix}</span> : null}
                    </div>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Prefix</span>
                  <span>{previewPrefix || "Not set"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Suffix</span>
                  <span>{previewSuffix || "Not set"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: Signature Settings */}
      <div className="p-6 bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-purple-50 text-purple-600">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Digital Signatures</h3>
              <p className="text-sm text-gray-500">
                Add and manage signatures for authorized document signing. (Upload, Draw, or Type)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-purple-700 transition"
          >
            <PlusIcon className="w-4 h-4" />
            Add Signature
          </button>
        </div>

        {sigList.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 py-10 text-center">
            <div className="p-3 rounded-full bg-purple-50 text-purple-600 mb-3">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-gray-800">No signatures added yet</p>
            <p className="text-xs text-gray-500 max-w-sm mt-1">
              Add your digital signature by uploading an image, drawing on pad, or typing with custom stylized fonts.
            </p>
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="mt-4 text-xs font-bold text-purple-600 hover:text-purple-700 hover:underline"
            >
              + Add First Signature
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {sigList.map((sig) => (
              <div
                key={sig.id || sig._id || Math.random()}
                className={`relative flex flex-col justify-between rounded-2xl border-2 p-4 transition-all ${
                  sig.isDefault ? "border-purple-500 bg-purple-50/20 shadow-md" : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                {sig.isDefault && (
                  <span className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-purple-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
                    <CheckCircle className="w-3 h-3" /> Default
                  </span>
                )}

                <div>
                  <div className="h-28 w-full flex items-center justify-center rounded-xl bg-slate-50 p-3 shadow-inner border border-slate-100 overflow-hidden">
                    <img src={sig.dataUrl} alt={sig.name} className="max-h-full max-w-full object-contain" />
                  </div>
                  <div className="mt-3">
                    <h4 className="font-bold text-gray-900 text-sm">{sig.name}</h4>
                    <p className="text-xs text-gray-400 capitalize mt-0.5">Method: {sig.type}</p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
                  {!sig.isDefault ? (
                    <button
                      type="button"
                      onClick={() => handleSetDefaultSignature(sig.id)}
                      className="text-xs font-semibold text-purple-600 hover:underline"
                    >
                      Make Default
                    </button>
                  ) : (
                    <span className="text-xs text-gray-400">Current Default</span>
                  )}

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(sig)}
                      className="p-1.5 rounded-lg text-gray-400 hover:bg-sky-50 hover:text-sky-600 transition"
                      title="Edit signature"
                    >
                      <EditIcon className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSignature(sig.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:bg-rose-50 hover:text-rose-600 transition"
                      title="Delete signature"
                    >
                      <DeleteIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <SignatureModal
          isOpen={isSigModalOpen}
          initialData={editingSignature}
          onClose={() => {
            setIsSigModalOpen(false);
            setEditingSignature(null);
          }}
          onSave={handleSaveSignature}
        />
      </div>

      {/* SECTION 3: PDF File Name */}
      <PdfFileNameSettings
        value={form.pdfFilenameFormats}
        onChange={(val) => setForm((prev) => ({ ...prev, pdfFilenameFormats: val }))}
      />

      {/* SECTION 4: Message Templates */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm mt-6">
        <h2 className="text-base font-bold text-gray-900 mb-1">Message Templates</h2>
        <p className="text-xs text-gray-500 mb-4">Customize the message sent when sharing documents via Email, WhatsApp, or SMS.</p>

        {/* Tab bar */}
        <div className="flex items-center border-b border-gray-200 mb-5">
          {[
            { key: "email",     label: "Email",     icon: <Mail className="w-4 h-4 text-blue-500" /> },
            { key: "whatsapp",  label: "WhatsApp",  icon: <MessageCircle className="w-4 h-4 text-green-600" /> },
            { key: "sms",       label: "SMS",       icon: <MessageSquare className="w-4 h-4 text-purple-600" /> },
          ].map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setTemplateTab(key)}
              className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                templateTab === key
                  ? "border-sky-600 text-sky-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        {/* Dynamic-info hint — shown for Email and SMS only (WhatsApp uses
            structured editor). No {placeholder} syntax on screen: the actual
            insertion happens via the token buttons under each field below. */}
        {templateTab !== "whatsapp" && (!editingTemplate || editingTemplate.channel === templateTab) && (
          <div className={`rounded-lg px-4 py-3 text-xs mb-4 border ${
            templateTab === "email"  ? "bg-blue-50 border-blue-100 text-blue-700" :
                                       "bg-purple-50 border-purple-100 text-purple-700"
          }`}>
            Click a field below, then use the buttons under it to insert dynamic info like the customer's name or the document link — it'll be filled in automatically when the message is sent.
          </div>
        )}

        {/* List view — shown unless this channel's editor is open */}
        {(!editingTemplate || editingTemplate.channel !== templateTab) && (
          <div className="space-y-3">
            {currentTemplateList.length === 0 && (
              <p className="text-sm text-gray-400 italic py-2">No templates yet — add one to get started.</p>
            )}
            {currentTemplateList.map((tpl) => (
              <div key={tpl.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900 truncate">{tpl.name}</span>
                    {tpl.isDefault && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 flex-shrink-0">
                        <CheckCircle className="w-3 h-3" /> Default
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 truncate mt-0.5">
                    {templateTab === "whatsapp" ? (tpl.line1 || "—") : templateTab === "sms" ? (tpl.body || "—") : (tpl.subject || "—")}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {!tpl.isDefault && (
                    <button
                      onClick={() => setDefaultTemplate(templateTab, tpl.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                      title="Set as default"
                    >
                      <CheckCircle className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => startEditTemplate(templateTab, tpl)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-sky-600 hover:bg-sky-50 transition-colors"
                    title="Edit"
                  >
                    <EditIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteTemplate(templateTab, tpl.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="Delete"
                  >
                    <DeleteIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            <button
              onClick={() => startNewTemplate(templateTab)}
              className="inline-flex items-center gap-2 text-sm font-medium text-sky-600 hover:text-sky-700"
            >
              <PlusIcon className="w-4 h-4" /> Add Template
            </button>
          </div>
        )}

        {/* Editor — shown when a template for this channel is being created/edited */}
        {editingTemplate && editingTemplate.channel === templateTab && (
          <div className="space-y-5">
            <label className="block">
              <span className="text-xs font-medium text-gray-500 mb-1.5 block">Template Name</span>
              <input
                type="text"
                value={editingTemplate.name}
                onChange={(e) => setEditingTemplate((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Standard, Payment Reminder, Thank You"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500"
              />
            </label>

            {/* Email fields */}
            {templateTab === "email" && (
              <>
                <label className="block">
                  <span className="text-xs font-medium text-gray-500 mb-1.5 block">Subject Line</span>
                  <input
                    ref={emailSubjectRef}
                    type="text"
                    value={editingTemplate.subject}
                    onChange={(e) => setEditingTemplate((p) => ({ ...p, subject: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500"
                    placeholder="e.g. Your Invoice from Acme Corp"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {MESSAGE_PLACEHOLDER_TOKENS.map((token) => (
                      <button
                        key={token.key}
                        type="button"
                        onClick={() =>
                          insertPlaceholderToken(
                            emailSubjectRef,
                            editingTemplate.subject,
                            (val) => setEditingTemplate((p) => ({ ...p, subject: val })),
                            token.key
                          )
                        }
                        className="text-[11px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-full px-2.5 py-1 transition-colors"
                      >
                        + {token.label}
                      </button>
                    ))}
                  </div>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-500 mb-1.5 block">Email Body</span>
                  <textarea
                    ref={emailBodyRef}
                    rows={9}
                    value={editingTemplate.body}
                    onChange={(e) => setEditingTemplate((p) => ({ ...p, body: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 resize-y font-mono"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {MESSAGE_PLACEHOLDER_TOKENS.map((token) => (
                      <button
                        key={token.key}
                        type="button"
                        onClick={() =>
                          insertPlaceholderToken(
                            emailBodyRef,
                            editingTemplate.body,
                            (val) => setEditingTemplate((p) => ({ ...p, body: val })),
                            token.key
                          )
                        }
                        className="text-[11px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-full px-2.5 py-1 transition-colors"
                      >
                        + {token.label}
                      </button>
                    ))}
                  </div>
                </label>
                <p className="text-xs text-gray-400">The PDF will be attached automatically when sent from the share menu.</p>
              </>
            )}

            {/* SMS field */}
            {templateTab === "sms" && (
              <>
                <label className="block">
                  <span className="text-xs font-medium text-gray-500 mb-1.5 block">Template Message</span>
                  <textarea
                    ref={smsBodyRef}
                    rows={4}
                    value={editingTemplate.body}
                    onChange={(e) => setEditingTemplate((p) => ({ ...p, body: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-purple-400 resize-y"
                    placeholder="e.g. Your invoice is ready. View & Download:"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {MESSAGE_PLACEHOLDER_TOKENS.map((token) => (
                      <button
                        key={token.key}
                        type="button"
                        onClick={() =>
                          insertPlaceholderToken(
                            smsBodyRef,
                            editingTemplate.body,
                            (val) => setEditingTemplate((p) => ({ ...p, body: val })),
                            token.key
                          )
                        }
                        className="text-[11px] font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-full px-2.5 py-1 transition-colors"
                      >
                        + {token.label}
                      </button>
                    ))}
                  </div>
                </label>
                <p className="text-xs text-gray-400">
                  <span className={editingTemplate.body.length > 160 ? "text-red-500 font-medium" : ""}>{editingTemplate.body.length} chars</span>
                  {" "}· Keep under 160 for a single SMS.
                </p>
                <div>
                  <p className="text-xs text-gray-400 mb-2 font-medium">Preview</p>
                  <div className="max-w-xs bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-gray-800 leading-relaxed">
                    {resolveSampleValues(editingTemplate.body)}
                  </div>
                </div>
              </>
            )}

            {/* WhatsApp structured fields */}
            {templateTab === "whatsapp" && (
              <>
                <p className="text-xs text-gray-500 -mt-1">Edit the two customizable lines. The document details block and greeting are fixed.</p>
                <div className="rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
                  <div className="bg-gray-50 px-4 py-3">
                    <p className="text-xs text-gray-400 mb-0.5 uppercase tracking-wider font-medium">Greeting (fixed)</p>
                    <p className="text-sm text-gray-500">Hello! <strong className="text-gray-700">Customer Name</strong></p>
                  </div>
                  <div className="bg-white px-4 py-3">
                    <p className="text-[10px] text-green-700 mb-1.5 uppercase tracking-wider font-semibold">✏ Message Line 1</p>
                    <input
                      ref={whatsappLine1Ref}
                      type="text"
                      value={editingTemplate.line1}
                      onChange={(e) => setEditingTemplate((p) => ({ ...p, line1: e.target.value }))}
                      placeholder="Thanks for your business!"
                      className="w-full text-sm text-gray-800 outline-none placeholder-gray-300 bg-transparent"
                    />
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {MESSAGE_PLACEHOLDER_TOKENS.map((token) => (
                        <button
                          key={token.key}
                          type="button"
                          onClick={() =>
                            insertPlaceholderToken(
                              whatsappLine1Ref,
                              editingTemplate.line1,
                              (val) => setEditingTemplate((p) => ({ ...p, line1: val })),
                              token.key
                            )
                          }
                          className="text-[11px] font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-full px-2.5 py-1 transition-colors"
                        >
                          + {token.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="bg-gray-50 px-4 py-3 space-y-1">
                    <p className="text-xs text-gray-400 mb-0.5 uppercase tracking-wider font-medium">Document Details (fixed)</p>
                    <p className="text-xs text-gray-500">Document No: <span className="text-gray-300 tracking-widest">●●●●●●</span></p>
                    <p className="text-xs text-gray-500">Total: ₹ <span className="text-gray-300 tracking-widest">●●●●●●</span></p>
                    <p className="text-xs text-gray-500">Link: <span className="text-gray-300">https://datacircles.in/view/…</span></p>
                  </div>
                  <div className="bg-white px-4 py-3">
                    <p className="text-[10px] text-green-700 mb-1.5 uppercase tracking-wider font-semibold">✏ Message Line 2 <span className="normal-case text-gray-400 font-normal">(optional)</span></p>
                    <input
                      ref={whatsappLine2Ref}
                      type="text"
                      value={editingTemplate.line2}
                      onChange={(e) => setEditingTemplate((p) => ({ ...p, line2: e.target.value }))}
                      placeholder="Please review and confirm."
                      className="w-full text-sm text-gray-800 outline-none placeholder-gray-300 bg-transparent"
                    />
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {MESSAGE_PLACEHOLDER_TOKENS.map((token) => (
                        <button
                          key={token.key}
                          type="button"
                          onClick={() =>
                            insertPlaceholderToken(
                              whatsappLine2Ref,
                              editingTemplate.line2,
                              (val) => setEditingTemplate((p) => ({ ...p, line2: val })),
                              token.key
                            )
                          }
                          className="text-[11px] font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-full px-2.5 py-1 transition-colors"
                        >
                          + {token.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="bg-gray-50 px-4 py-3">
                    <p className="text-xs text-gray-400 mb-0.5 uppercase tracking-wider font-medium">Footer (fixed)</p>
                    <p className="text-sm text-gray-500">Thanks</p>
                    <p className="text-sm text-gray-500"><strong className="text-gray-700">Company Name</strong></p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-2 font-medium">Preview</p>
                  <div className="max-w-xs bg-[#dcf8c6] rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap shadow-sm">
                    {`Hello! *Customer Name*\n\n${resolveSampleValues(editingTemplate.line1) || "…"}\n\nDocument No: ●●●●●●\nTotal: ₹ ●●●●●●\nLink: https://datacircles.in/view/…${editingTemplate.line2 ? `\n\n${resolveSampleValues(editingTemplate.line2)}` : ""}\n\nThanks\n*Company Name*`}
                  </div>
                </div>
              </>
            )}

            <div className="flex gap-3">
              <button
                onClick={cancelEditTemplate}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={saveEditingTemplate}
                disabled={saving}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
                  templateTab === "whatsapp" ? "bg-green-600 hover:bg-green-700" :
                  templateTab === "sms" ? "bg-purple-600 hover:bg-purple-700" :
                  "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                <Save className="w-4 h-4" />
                {saving ? "Saving..." : "Save Template"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default DocumentSettings;
