import DeleteIcon from "../common/DeleteIcon";
import PlusIcon from "../common/PlusIcon";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Check,
  LayoutTemplate,
  Hash,
  PenLine,
  CheckCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import API from "../../services/api";
import {
  DOCUMENT_TEMPLATES,
  DEFAULT_TEMPLATE,
  REGISTRY,
  buildDocumentHtml,
} from "../../../../shared/documentTemplates.js";
import SignatureModal from "../settings/SignatureModal";
import EditIcon from "../common/EditIcon";

/*
 * Right-hand drawer that gathers everything that governs how a document type
 * looks and is issued — its template, its numbering (prefix / suffix / next
 * number) and the signatures it can carry — into one place, split across three
 * tabs.
 */

const TEMPLATE_BLURBS = Object.fromEntries(
  Object.entries(REGISTRY).map(([key, mod]) => [key, mod.blurb || ""])
);

/* Small representative document so every thumbnail shows the same content. */
const SAMPLE_DOC = {
  invoiceNumber: "INV-024",
  date: new Date(),
  dueDate: new Date(Date.now() + 30 * 86400000),
  receiverGSTIN: "29AAACI5950L1Z6",
  placeOfSupply: "29-KARNATAKA",
  gstRate: 18,
  discount: { type: "percentage", value: 10 },
  items: [
    { name: "Consulting Retainer", rate: 25000, quantity: 1, hsn: "9983" },
    { name: "Implementation", rate: 8000, quantity: 2, hsn: "9983" },
  ],
};

const THUMB_W = 760; // the design width the templates are authored against
const PAGE_RATIO = 1.414; // A4 — keeps each thumbnail page-shaped

// The drawer speaks the page's document-type vocabulary (tax / performa / …);
// the settings model keys numbering by its own names. Bridge the two here.
const SETTINGS_KEY = {
  tax: "invoice",
  performa: "proformaInvoice",
  quotation: "quote",
  deliveryChallan: "deliveryChallan",
};

const DEFAULT_SECTIONS = {
  invoice: { prefix: "INV-", suffix: "", prefixes: ["INV-"], suffixes: [] },
  quote: { prefix: "QT", suffix: "", prefixes: ["QT", "QTN"], suffixes: [] },
  proformaInvoice: { prefix: "PI", suffix: "", prefixes: ["PI", "PFI"], suffixes: [] },
  deliveryChallan: { prefix: "DC", suffix: "", prefixes: ["DC"], suffixes: [] },
};

const TemplatePreviewCard = ({
  template,
  selected,
  onSelect,
  orgDetails,
  bankDetails,
  type,
  defaultSigUrl,
}) => {
  // The sheet is authored at THUMB_W; scale it down to whatever width the card
  // gets so the thumbnail always fills its page, whatever the grid does.
  const frameRef = useRef(null);
  const [frameW, setFrameW] = useState(0);
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => setFrameW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = frameW ? frameW / THUMB_W : 0;

  const html = buildDocumentHtml({ ...SAMPLE_DOC, signature: defaultSigUrl }, {
    type,
    template,
    orgDetails,
    bankDetails,
    dealName: "Sample Customer",
  });

  return (
    <button
      type="button"
      onClick={() => onSelect(template)}
      className={`group w-full text-left rounded-xl border-2 transition-colors overflow-hidden ${
        selected
          ? "border-[#0085FF] bg-[#F5FAFF]"
          : "border-[#E1E4EA] hover:border-[#C9CFD8] bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-2 px-3 pt-2.5 pb-2">
        <div className="min-w-0">
          <span className="text-sm font-semibold text-[#1F2937] truncate block">
            {template}
          </span>
          <p className="text-[11px] text-[#99A0AE] truncate">
            {TEMPLATE_BLURBS[template]}
          </p>
        </div>
        {selected && (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-[#0085FF] bg-[#E3F1FF] px-1.5 py-0.5 rounded-full flex-shrink-0 mt-0.5">
            <Check className="w-3 h-3" />
            In use
          </span>
        )}
      </div>

      {/* The whole document as one page-shaped sheet, scaled to the card's
          width. Pointer events are off so the card stays one click target. */}
      <div className="px-3 pb-3">
        <div
          ref={frameRef}
          style={{ height: (frameW || 0) * PAGE_RATIO }}
          className="bg-white border border-[#E1E4EA] shadow-sm overflow-hidden pointer-events-none select-none"
        >
          <div
            style={{
              width: THUMB_W,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    </button>
  );
};

const TemplateDrawer = ({ isOpen, onClose, type = "tax", docLabel = "Invoice" }) => {
  const [tab, setTab] = useState("template");
  const [templates, setTemplates] = useState(null);
  const [orgDetails, setOrgDetails] = useState(null);
  const [bankDetails, setBankDetails] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Numbering — the full settings doc so a save doesn't clobber other types.
  const settingsKey = SETTINGS_KEY[type] || "invoice";
  const isInvoice = type === "tax";
  const [section, setSection] = useState(DEFAULT_SECTIONS[settingsKey]);
  const [nextNumber, setNextNumber] = useState(1);
  const [allSections, setAllSections] = useState(null);
  const [newPrefix, setNewPrefix] = useState("");
  const [newSuffix, setNewSuffix] = useState("");
  const [savingNumbering, setSavingNumbering] = useState(false);

  // Signatures — org-wide, shared by every document type.
  const [signatures, setSignatures] = useState([]);
  const [sigModalOpen, setSigModalOpen] = useState(false);
  const [editingSig, setEditingSig] = useState(null);

  const fetchSignatures = async () => {
    try {
      const res = await API.get("/document-settings/signatures");
      setSignatures(Array.isArray(res.data) ? res.data : res.data?.signatures || []);
    } catch (err) {
      console.error("Failed to load signatures", err);
      setSignatures([]);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setTab("template");
    let cancelled = false;

    (async () => {
      setLoading(true);
      const [tpl, branding, bank, docSettings] = await Promise.allSettled([
        API.get("/document-templates"),
        API.get("/branding"),
        API.get("/bank-details"),
        API.get("/document-settings"),
      ]);
      if (cancelled) return;

      if (tpl.status === "fulfilled") {
        setTemplates(tpl.value.data?.templates || {});
      } else {
        toast.error("Couldn't load your template choice");
        setTemplates({});
      }
      if (branding.status === "fulfilled") setOrgDetails(branding.value.data);
      if (bank.status === "fulfilled") setBankDetails(bank.value.data);

      if (docSettings.status === "fulfilled") {
        const data = docSettings.value.data || {};
        const incoming = data.documentTypeSettings || {};
        const merged = {};
        Object.keys(DEFAULT_SECTIONS).forEach((key) => {
          const fallback = DEFAULT_SECTIONS[key];
          merged[key] = {
            prefix: incoming?.[key]?.prefix || fallback.prefix,
            suffix: incoming?.[key]?.suffix || fallback.suffix,
            prefixes: incoming?.[key]?.prefixes || fallback.prefixes,
            suffixes: incoming?.[key]?.suffixes || fallback.suffixes,
          };
        });
        setAllSections(merged);
        setSection(merged[settingsKey]);
        setNextNumber(data.nextInvoiceNumber || 1);
      }

      await fetchSignatures();
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, settingsKey]);

  // Close on Escape, like the other overlays on this page.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const selected = templates?.[type] || DEFAULT_TEMPLATE;

  const handleSelectTemplate = async (template) => {
    if (template === selected || saving) return;
    const previous = templates;
    // Optimistic: the choice is a single field, so show it immediately and
    // roll back if the save fails.
    setTemplates((prev) => ({ ...prev, [type]: template }));
    setSaving(true);
    try {
      const res = await API.put("/document-templates", {
        templates: { [type]: template },
      });
      setTemplates(res.data?.templates || { [type]: template });
      toast.success(`${template} applied to ${docLabel.toLowerCase()}s`);
    } catch (err) {
      setTemplates(previous);
      toast.error(
        err.response?.data?.error || "Failed to save your template choice"
      );
    } finally {
      setSaving(false);
    }
  };

  // Adds a typed value to this type's saved list and selects it in one go, so
  // it can be reused later without retyping.
  const addValue = (kind) => {
    const value = (kind === "prefix" ? newPrefix : newSuffix).trim();
    if (!value) return;
    setSection((prev) => {
      const listKey = kind === "prefix" ? "prefixes" : "suffixes";
      const existing = prev[listKey] || [];
      return {
        ...prev,
        [listKey]: existing.includes(value) ? existing : [...existing, value],
        [kind]: value,
      };
    });
    kind === "prefix" ? setNewPrefix("") : setNewSuffix("");
  };

  const handleSaveNumbering = async () => {
    setSavingNumbering(true);
    try {
      const nextAll = { ...(allSections || DEFAULT_SECTIONS), [settingsKey]: section };
      const payload = {
        documentTypeSettings: nextAll,
      };
      // The flat invoice fields and the next number are only meaningful for
      // invoices, which is the type the app actually auto-numbers.
      if (isInvoice) {
        payload.invoicePrefix = (section.prefix || "INV-").trim();
        payload.invoiceSuffix = (section.suffix || "").trim();
        payload.invoicePrefixes = section.prefixes || [];
        payload.invoiceSuffixes = section.suffixes || [];
        payload.nextInvoiceNumber = Number(nextNumber) || 1;
      }
      await API.put("/document-settings", payload);
      setAllSections(nextAll);
      toast.success("Numbering saved");
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to save numbering");
    } finally {
      setSavingNumbering(false);
    }
  };

  const handleSaveSignature = async (sigData) => {
    try {
      await API.post("/document-settings/signatures", sigData);
      toast.success(editingSig ? "Signature updated" : "Signature added");
      setSigModalOpen(false);
      setEditingSig(null);
      await fetchSignatures();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to save signature");
    }
  };

  const handleDeleteSignature = async (id) => {
    try {
      await API.delete(`/document-settings/signatures/${id}`);
      toast.success("Signature deleted");
      await fetchSignatures();
    } catch {
      toast.error("Failed to delete signature");
    }
  };

  const handleSetDefaultSignature = async (id) => {
    try {
      await API.patch(`/document-settings/signatures/${id}/default`);
      toast.success("Default signature updated");
      await fetchSignatures();
    } catch {
      toast.error("Failed to update default signature");
    }
  };

  if (!isOpen) return null;

  const prefixPreview = section?.prefix?.trim();
  const suffixPreview = section?.suffix?.trim();
  const numberPreview = [
    ...(prefixPreview ? [prefixPreview] : []),
    isInvoice ? String(nextNumber || 1) : "0001",
    ...(suffixPreview ? [suffixPreview] : []),
  ].join("");

  const TABS = [
    { key: "template", label: "Template", Icon: LayoutTemplate },
    { key: "numbering", label: "Numbering", Icon: Hash },
    { key: "signatures", label: "Signatures", Icon: PenLine },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[100004]">
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Same inset rounded-card geometry as the Companies/Contacts panels
          (dc-panel-card), but wider than their dc-panel-w third — the cards
          here are full document renders and need the room. */}
      <aside
        role="dialog"
        aria-label="Document setup"
        className="fixed dc-panel-card w-[calc(100%-3rem)] lg:w-[70vw] bg-white shadow-2xl flex flex-col overflow-hidden animate-slideInRight"
      >
        <header className="flex-shrink-0 flex items-center justify-between gap-3 px-5 pt-4 border-b border-[#E1E4EA]">
          <div className="flex items-center gap-2.5 min-w-0 pb-4">
            <div className="w-9 h-9 rounded-lg bg-[#F0F6FF] flex items-center justify-center flex-shrink-0">
              <LayoutTemplate className="w-4.5 h-4.5 text-[#0085FF]" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-[#1F2937] truncate">
                {docLabel} setup
              </h2>
              <p className="text-xs text-[#99A0AE] truncate">
                Template, numbering and signatures — all in one place
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 mb-4 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Tab bar — one row that switches which control set fills the body.
            Smaller text/padding/icon and tighter gap on mobile so all three
            tabs fit the narrower drawer width without clipping; back to the
            original sizing at lg. */}
        <div className="flex-shrink-0 flex items-center gap-0.5 lg:gap-1 px-2 lg:px-4 pt-3 border-b border-[#E1E4EA]">
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`inline-flex items-center gap-1 lg:gap-1.5 px-2 lg:px-3.5 py-2 text-xs lg:text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-colors whitespace-nowrap ${
                tab === key
                  ? "border-[#0085FF] text-[#0085FF]"
                  : "border-transparent text-[#525866] hover:text-[#1F2937]"
              }`}
            >
              <Icon className="w-3.5 h-3.5 lg:w-4 lg:h-4 flex-shrink-0" />
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* ---- TEMPLATE ---- */}
          {tab === "template" && (
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 content-start">
              {loading || !templates
                ? DOCUMENT_TEMPLATES.map((t) => (
                    <div
                      key={t}
                      className="aspect-[1/1.55] rounded-xl bg-gray-100 animate-pulse"
                    />
                  ))
                : DOCUMENT_TEMPLATES.map((t) => (
                    <TemplatePreviewCard
                      key={t}
                      template={t}
                      type={type}
                      selected={selected === t}
                      onSelect={handleSelectTemplate}
                      orgDetails={orgDetails}
                      bankDetails={bankDetails}
                      defaultSigUrl={signatures.find((s) => s.isDefault)?.dataUrl || signatures[0]?.dataUrl}
                    />
                  ))}
            </div>
          )}

          {/* ---- NUMBERING ---- */}
          {tab === "numbering" && (
            <div className="p-5 max-w-2xl">
              {loading ? (
                <div className="h-40 rounded-xl bg-gray-100 animate-pulse" />
              ) : (
                <div className="space-y-5">
                  {/* Live number preview */}
                  <div className="rounded-xl border border-[#E1E4EA] bg-[#FAFBFC] p-4">
                    <p className="text-[11px] uppercase tracking-wide text-[#99A0AE] mb-2">
                      Next {docLabel.toLowerCase()} number
                    </p>
                    <div className="inline-flex items-center gap-0.5 rounded-full border border-slate-200 bg-slate-100 p-0.5 text-sm">
                      {prefixPreview && (
                        <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-700">
                          {prefixPreview}
                        </span>
                      )}
                      <span className="rounded-full bg-[#0085FF] px-2.5 py-1 font-semibold text-white">
                        {isInvoice ? nextNumber || 1 : "0001"}
                      </span>
                      {suffixPreview && (
                        <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-700">
                          {suffixPreview}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-[#525866]">
                      Renders as{" "}
                      <span className="font-semibold text-[#1F2937]">
                        {numberPreview}
                      </span>
                    </p>
                  </div>

                  {/* Prefix + Suffix pickers, each with an add-new field */}
                  {[
                    { kind: "prefix", label: "Prefix", listKey: "prefixes", newVal: newPrefix, setNew: setNewPrefix },
                    { kind: "suffix", label: "Suffix", listKey: "suffixes", newVal: newSuffix, setNew: setNewSuffix },
                  ].map(({ kind, label, listKey, newVal, setNew }) => (
                    <div key={kind} className="space-y-2">
                      <label className="block text-sm font-semibold text-[#1F2937]">
                        {label}
                      </label>
                      <div className="relative flex items-center h-10 rounded-lg border border-[#E1E4EA] focus-within:border-[#0085FF] overflow-hidden">
                        <select
                          value={section?.[kind] || ""}
                          onChange={(e) =>
                            setSection((prev) => ({ ...prev, [kind]: e.target.value }))
                          }
                          className="flex-1 min-w-0 h-full px-3 text-[13px] bg-transparent appearance-none focus:outline-none"
                        >
                          {kind === "suffix" && <option value="">None</option>}
                          {(section?.[listKey] || []).map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <input
                          value={newVal}
                          onChange={(e) => setNew(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addValue(kind);
                            }
                          }}
                          placeholder={`Add a new ${label.toLowerCase()}`}
                          className="flex-1 h-10 rounded-lg border border-[#E1E4EA] px-3 text-[13px] focus:outline-none focus:border-[#0085FF]"
                        />
                        <button
                          type="button"
                          onClick={() => addValue(kind)}
                          className="h-10 px-4 rounded-lg border border-[#0085FF]/30 text-sm font-medium text-[#0085FF] hover:bg-blue-50 transition-colors"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Next number — only invoices are auto-numbered by the app */}
                  {isInvoice && (
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-[#1F2937]">
                        Next number
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={nextNumber}
                        onChange={(e) => setNextNumber(e.target.value)}
                        className="w-40 h-10 rounded-lg border border-[#E1E4EA] px-3 text-[13px] focus:outline-none focus:border-[#0085FF]"
                      />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleSaveNumbering}
                    disabled={savingNumbering}
                    className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-[#0085FF] text-white text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-60"
                  >
                    {savingNumbering ? "Saving…" : "Save numbering"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ---- SIGNATURES ---- */}
          {tab === "signatures" && (
            <div className="p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-[#1F2937]">
                    Signatures
                  </h3>
                  <p className="text-xs text-[#99A0AE]">
                    The default is applied to every document unless a specific
                    one is picked on the document.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingSig(null);
                    setSigModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[#0085FF] text-white text-sm font-medium hover:bg-blue-600 transition-colors flex-shrink-0"
                >
                  <PlusIcon className="w-4 h-4" />
                  Add
                </button>
              </div>

              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-44 rounded-xl bg-gray-100 animate-pulse" />
                  ))}
                </div>
              ) : signatures.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#E1E4EA] py-10 text-center">
                  <div className="p-3 rounded-full bg-[#F0F6FF] text-[#0085FF] mb-3">
                    <PenLine className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-semibold text-[#1F2937]">
                    No signatures yet
                  </p>
                  <p className="text-xs text-[#99A0AE] max-w-sm mt-1">
                    Add one by uploading an image, drawing it, or typing with a
                    stylized font. The first one becomes the default.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {signatures.map((sig) => (
                    <div
                      key={sig.id}
                      className={`relative flex flex-col justify-between rounded-xl border-2 p-4 transition-colors ${
                        sig.isDefault
                          ? "border-[#0085FF] bg-[#F5FAFF]"
                          : "border-[#E1E4EA] bg-white hover:border-[#C9CFD8]"
                      }`}
                    >
                      {sig.isDefault && (
                        <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-[#0085FF] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                          <CheckCircle className="w-3 h-3" /> Default
                        </span>
                      )}
                      <div>
                        <div className="h-24 w-full flex items-center justify-center rounded-lg bg-slate-50 border border-slate-100 overflow-hidden">
                          <img
                            src={sig.dataUrl}
                            alt={sig.name}
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                        <div className="mt-3">
                          <h4 className="font-semibold text-[#1F2937] text-sm truncate">
                            {sig.name}
                          </h4>
                          <p className="text-xs text-[#99A0AE] capitalize mt-0.5">
                            {sig.type === "draw"
                              ? "Drawn"
                              : sig.type === "upload"
                                ? "Uploaded"
                                : "Typed"}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-between border-t border-[#E1E4EA] pt-3">
                        {!sig.isDefault ? (
                          <button
                            type="button"
                            onClick={() => handleSetDefaultSignature(sig.id)}
                            className="text-xs font-semibold text-[#0085FF] hover:underline"
                          >
                            Make default
                          </button>
                        ) : (
                          <span className="text-xs text-[#99A0AE]">
                            Current default
                          </span>
                        )}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSig(sig);
                              setSigModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-gray-400 hover:bg-sky-50 hover:text-[#0085FF] transition-colors"
                            title="Edit signature"
                          >
                            <EditIcon className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSignature(sig.id)}
                            className="p-1.5 rounded-lg text-gray-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
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
            </div>
          )}
        </div>

        <footer className="flex-shrink-0 px-5 py-3 border-t border-[#E1E4EA] bg-[#FAFBFC]">
          <p className="text-[11px] text-[#99A0AE]">
            {tab === "signatures"
              ? "Signatures are shared across all document types."
              : `Applies to every ${docLabel.toLowerCase()} — existing and new alike — across preview, download and email.`}
          </p>
        </footer>
      </aside>

      {/* Rendered outside the transformed <aside> so its fixed positioning
          isn't trapped by the drawer's slide-in transform. */}
      <SignatureModal
        isOpen={sigModalOpen}
        initialData={editingSig}
        onClose={() => {
          setSigModalOpen(false);
          setEditingSig(null);
        }}
        onSave={handleSaveSignature}
      />
    </div>,
    document.body
  );
};

export default TemplateDrawer;
