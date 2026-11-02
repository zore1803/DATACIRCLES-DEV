import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  FolderPlus,
  Lock,
  Pencil,
  Plus,
  Trash2,
  X,
  Type,
  Hash,
  Calendar,
  ListChecks,
  Eye,
  EyeOff,
  ChevronDown,
} from "lucide-react";
import toast from "react-hot-toast";
import API from "../../services/api";
import ConfirmDialog from "../common/ConfirmDialog";

/* Settings > Customization > Accounting Fields.
   Same idea as Company Fields: built-in fields (read-only), custom fields the
   organisation adds, and custom sections that group those fields. It is kept
   separately for Invoices, Pro Forma Invoices, Quotations and Delivery
   Challans. A new custom field becomes a column in that document's list as
   soon as it is saved, and an input on its create/edit form.

   Definitions live on Document Settings (customFields / customSections), the
   same store the document forms already read, so nothing else has to change
   for the forms to show the new fields. */

const DOC_TABS = [
  { id: "tax", label: "Invoices" },
  { id: "performa", label: "Pro Forma" },
  { id: "quotation", label: "Quotations" },
  { id: "deliveryChallan", label: "Challans" },
];

const VIEW_TABS = [
  { id: "custom", label: "Custom Field" },
  { id: "sections", label: "Custom Section" },
  { id: "builtin", label: "Built-in" },
];

const FIELD_TYPES = [
  { id: "text", label: "Text", icon: Type },
  { id: "number", label: "Number", icon: Hash },
  { id: "date", label: "Date", icon: Calendar },
  { id: "dropdown", label: "Dropdown", icon: ListChecks },
];

const BUILT_IN = {
  common: [
    { name: "Document ID", type: "Text (auto-numbered)", required: true },
    { name: "Deal / Customer", type: "Dropdown", required: true },
    { name: "Issue Date", type: "Date", required: true },
    { name: "Due Date", type: "Date", required: false },
    { name: "Amount", type: "Number (calculated)", required: true },
    { name: "Status", type: "Dropdown", required: true },
    { name: "Items", type: "Line items", required: true },
    { name: "Billing & Shipping Address", type: "Address", required: false },
    { name: "Notes & Terms", type: "Text", required: false },
  ],
  tax: [{ name: "Payments", type: "Payment records", required: false }],
  performa: [],
  quotation: [{ name: "Valid Until", type: "Date", required: false }],
  deliveryChallan: [],
};

/* A pill-shaped dropdown whose list is rounded too (the browser's own select
   list can't be styled). options: [{ value, label }]. */
function RoundedSelect({ value, onChange, options, className = "" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  const current = options.find((o) => o.value === value) || options[0];
  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex h-10 w-full min-w-[130px] items-center justify-between gap-2 rounded-full border bg-white px-4 text-sm outline-none ${
          open ? "border-[#0085FF] ring-1 ring-[#0085FF]" : "border-gray-300"
        }`}
      >
        <span className="truncate">{current?.label}</span>
        <ChevronDown className={`h-4 w-4 flex-shrink-0 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className="absolute left-0 z-30 mt-1.5 max-h-56 min-w-full overflow-y-auto rounded-2xl border border-gray-200 bg-white p-1.5 shadow-xl">
          {options.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center rounded-xl px-3 py-2 text-left text-sm whitespace-nowrap ${
                  o.value === value ? "bg-[#E8F3FF] font-semibold text-[#0085FF]" : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const typeMeta = (id) => FIELD_TYPES.find((t) => t.id === id) || FIELD_TYPES[0];
const NO_SECTION = "";

const emptyField = { label: "", type: "text", options: "", section: NO_SECTION };

export default function AccountingFieldSettings() {
  const [docType, setDocType] = useState("tax");
  const [view, setView] = useState("custom");
  const [allDefs, setAllDefs] = useState([]);
  const [sections, setSections] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [newField, setNewField] = useState(emptyField);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState(emptyField);
  const [pendingDelete, setPendingDelete] = useState(null);

  const [newSection, setNewSection] = useState("");
  const [renaming, setRenaming] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [pendingDeleteSection, setPendingDeleteSection] = useState(null);

  useEffect(() => {
    let cancelled = false;
    API.get("/document-settings")
      .then((res) => {
        if (cancelled) return;
        setAllDefs(Array.isArray(res.data?.customFields) ? res.data.customFields : []);
        setSections(res.data?.customSections || {});
      })
      .catch(() => toast.error("Failed to load accounting fields"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Fields that belong to the document type being edited. A field saved for
  // every document type (older fields) shows under each tab.
  const fields = useMemo(
    () => allDefs.filter((d) => !d.docTypes?.length || d.docTypes.includes(docType)),
    [allDefs, docType],
  );
  const typeSections = sections[docType] || [];

  const persist = useCallback(
    async (nextDefs, nextSections, okMessage) => {
      setSaving(true);
      try {
        const res = await API.put("/document-settings", {
          customFields: nextDefs,
          customSections: nextSections,
        });
        const saved = res.data?.settings;
        setAllDefs(Array.isArray(saved?.customFields) ? saved.customFields : nextDefs);
        setSections(saved?.customSections || nextSections);
        if (okMessage) toast.success(okMessage);
        return true;
      } catch (err) {
        toast.error(err.response?.data?.error || "Failed to save");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const parseOptions = (text) =>
    [...new Set(String(text || "").split(",").map((o) => o.trim()).filter(Boolean))];

  const validate = (f, ignoreId) => {
    const label = f.label.trim();
    if (!label) return "Enter a field name";
    if (
      fields.some((x) => x.id !== ignoreId && x.label.trim().toLowerCase() === label.toLowerCase())
    )
      return "A field with this name already exists";
    if (f.type === "dropdown" && parseOptions(f.options).length === 0)
      return "Add at least one dropdown option";
    return null;
  };

  const handleAdd = async (e) => {
    e?.preventDefault();
    const problem = validate(newField);
    if (problem) return toast.error(problem);
    const def = {
      id: `cf_${Math.random().toString(36).slice(2, 10)}`,
      label: newField.label.trim(),
      type: newField.type,
      options: newField.type === "dropdown" ? parseOptions(newField.options) : [],
      docTypes: [docType],
      showOnDocument: true,
      section: newField.section || "",
    };
    if (await persist([...allDefs, def], sections, `"${def.label}" added. It is now a column in the list.`)) {
      setNewField({ ...emptyField, section: newField.section });
    }
  };

  const startEdit = (f) => {
    setEditingId(f.id);
    setEditValue({
      label: f.label,
      type: f.type || "text",
      options: (f.options || []).join(", "),
      section: f.section || NO_SECTION,
    });
  };

  const handleSaveEdit = async () => {
    const problem = validate(editValue, editingId);
    if (problem) return toast.error(problem);
    const next = allDefs.map((d) =>
      d.id === editingId
        ? {
            ...d,
            label: editValue.label.trim(),
            type: editValue.type,
            options: editValue.type === "dropdown" ? parseOptions(editValue.options) : [],
            section: editValue.section || "",
          }
        : d,
    );
    if (await persist(next, sections, "Field updated")) setEditingId(null);
  };

  const toggleShow = (f) =>
    persist(
      allDefs.map((d) => (d.id === f.id ? { ...d, showOnDocument: d.showOnDocument === false } : d)),
      sections,
    );

  const confirmDelete = async () => {
    const f = pendingDelete;
    setPendingDelete(null);
    if (!f) return;
    // A field shared by several document types is only detached from this one.
    const sharedWithOthers = f.docTypes?.length > 1 || !f.docTypes?.length;
    const next = sharedWithOthers
      ? allDefs.map((d) =>
          d.id === f.id
            ? {
                ...d,
                docTypes: (d.docTypes?.length ? d.docTypes : DOC_TABS.map((t) => t.id)).filter(
                  (t) => t !== docType,
                ),
              }
            : d,
        )
      : allDefs.filter((d) => d.id !== f.id);
    await persist(next, sections, `"${f.label}" removed`);
  };

  // ---- sections ----
  const saveSections = (list, okMessage, nextDefs = allDefs) =>
    persist(nextDefs, { ...sections, [docType]: list }, okMessage);

  const handleAddSection = async (e) => {
    e?.preventDefault();
    const name = newSection.trim();
    if (!name) return toast.error("Enter a section name");
    if (typeSections.some((s) => s.toLowerCase() === name.toLowerCase()))
      return toast.error("This section already exists");
    if (await saveSections([...typeSections, name], `Section "${name}" added`)) setNewSection("");
  };

  const handleRenameSection = async (oldName) => {
    const name = renameValue.trim();
    if (!name) return toast.error("Enter a section name");
    if (name !== oldName && typeSections.some((s) => s.toLowerCase() === name.toLowerCase()))
      return toast.error("This section already exists");
    const defs = allDefs.map((d) => (d.section === oldName && d.docTypes?.includes(docType) ? { ...d, section: name } : d));
    if (await saveSections(typeSections.map((s) => (s === oldName ? name : s)), "Section renamed", defs))
      setRenaming(null);
  };

  const confirmDeleteSection = async () => {
    const name = pendingDeleteSection;
    setPendingDeleteSection(null);
    if (!name) return;
    const defs = allDefs.map((d) => (d.section === name && d.docTypes?.includes(docType) ? { ...d, section: "" } : d));
    await saveSections(typeSections.filter((s) => s !== name), `Section "${name}" deleted`, defs);
  };

  const groups = useMemo(() => {
    const map = new Map([[NO_SECTION, []]]);
    typeSections.forEach((s) => map.set(s, []));
    fields.forEach((f) => {
      const key = map.has(f.section || NO_SECTION) ? f.section || NO_SECTION : NO_SECTION;
      map.get(key).push(f);
    });
    return [...map.entries()];
  }, [fields, typeSections]);

  const inputCls =
    "h-10 rounded-full border border-gray-300 bg-white px-4 text-sm outline-none focus:border-[#0085FF] focus:ring-1 focus:ring-[#0085FF]";

  const renderTypeSelect = (value, onChange) => (
    <RoundedSelect
      value={value}
      onChange={onChange}
      options={FIELD_TYPES.map((t) => ({ value: t.id, label: t.label }))}
    />
  );

  const renderSectionSelect = (value, onChange) => (
    <RoundedSelect
      value={value}
      onChange={onChange}
      options={[{ value: NO_SECTION, label: "No section" }, ...typeSections.map((x) => ({ value: x, label: x }))]}
    />
  );

  if (loading) {
    return <div className="p-8 text-sm text-gray-500">Loading accounting fields…</div>;
  }

  const docLabel = DOC_TABS.find((t) => t.id === docType)?.label;
  const builtIn = [...BUILT_IN.common, ...(BUILT_IN[docType] || [])];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <h2 className="text-lg font-bold text-gray-900">Accounting Fields</h2>
        </div>
        <p className="mb-5 text-sm text-gray-500">
          Add your own fields to invoices, pro forma invoices, quotations and delivery challans. A new field
          appears straight away as a column in that list and as an input on the document form.
        </p>

        {/* Which document */}
        <div className="mb-3 inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-gray-100 p-1">
          {DOC_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setDocType(t.id);
                setEditingId(null);
                setNewField(emptyField);
              }}
              className={`h-9 flex-shrink-0 rounded-full px-5 text-sm font-semibold transition-colors ${
                docType === t.id ? "bg-white text-[#0085FF] shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Which kind of field */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {VIEW_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setView(t.id)}
              className={`h-8 rounded-full border px-4 text-xs font-semibold transition-colors ${
                view === t.id
                  ? "border-[#0085FF] bg-[#E8F3FF] text-[#0085FF]"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {t.label}
              {t.id === "custom" && ` (${fields.length})`}
              {t.id === "sections" && ` (${typeSections.length})`}
            </button>
          ))}
        </div>

        {view === "custom" && (
          <>
            <form onSubmit={handleAdd} className="mb-5 flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={newField.label}
                onChange={(e) => setNewField({ ...newField, label: e.target.value })}
                placeholder={`New ${docLabel} field name (e.g. PO Number)`}
                maxLength={60}
                className={`${inputCls} min-w-[220px] flex-1`}
              />
              {renderTypeSelect(newField.type, (type) => setNewField({ ...newField, type }))}
              {renderSectionSelect(newField.section, (section) => setNewField({ ...newField, section }))}
              {newField.type === "dropdown" && (
                <input
                  type="text"
                  value={newField.options}
                  onChange={(e) => setNewField({ ...newField, options: e.target.value })}
                  placeholder="Options, comma separated"
                  className={`${inputCls} min-w-[220px] flex-1`}
                />
              )}
              <button
                type="submit"
                disabled={saving}
                className="flex h-10 items-center gap-1.5 rounded-full bg-[#0085FF] px-5 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-60"
              >
                <Plus className="h-4 w-4" /> Add field
              </button>
            </form>

            {fields.length === 0 && (
              <p className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
                No custom fields for {docLabel} yet. Add one above and it becomes a new column in the list.
              </p>
            )}

            <div className="space-y-4">
              {groups.map(([section, list]) =>
                list.length === 0 && section === NO_SECTION ? null : (
                  <div key={section || "none"} className="rounded-xl border border-gray-200">
                    <div className="flex items-center justify-between rounded-t-xl bg-gray-50 px-4 py-2.5">
                      <h4 className="text-sm font-bold text-gray-800">{section || "No section"}</h4>
                      <span className="text-xs text-gray-500">
                        {list.length} field{list.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    {list.length === 0 ? (
                      <p className="px-4 py-3 text-xs text-gray-400">No fields in this section yet.</p>
                    ) : (
                      <ul className="divide-y divide-gray-100">
                        {list.map((f) => {
                          const meta = typeMeta(f.type);
                          const Icon = meta.icon;
                          const hidden = f.showOnDocument === false;
                          return (
                            <li key={f.id} className="px-4 py-3">
                              {editingId === f.id ? (
                                <div className="flex flex-wrap items-center gap-2">
                                  <input
                                    type="text"
                                    value={editValue.label}
                                    onChange={(e) => setEditValue({ ...editValue, label: e.target.value })}
                                    maxLength={60}
                                    className={`${inputCls} min-w-[180px] flex-1`}
                                  />
                                  {renderTypeSelect(editValue.type, (type) => setEditValue({ ...editValue, type }))}
                                  {renderSectionSelect(editValue.section, (s) => setEditValue({ ...editValue, section: s }))}
                                  {editValue.type === "dropdown" && (
                                    <input
                                      type="text"
                                      value={editValue.options}
                                      onChange={(e) => setEditValue({ ...editValue, options: e.target.value })}
                                      placeholder="Options, comma separated"
                                      className={`${inputCls} min-w-[200px] flex-1`}
                                    />
                                  )}
                                  <button
                                    type="button"
                                    onClick={handleSaveEdit}
                                    disabled={saving}
                                    className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white hover:bg-emerald-600"
                                    title="Save"
                                  >
                                    <Check className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingId(null)}
                                    className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50"
                                    title="Cancel"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex min-w-0 items-center gap-3">
                                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#EEF4FF] text-[#2B5BFF]">
                                      <Icon className="h-4 w-4" />
                                    </span>
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-semibold text-gray-900">{f.label}</p>
                                      <p className="truncate text-xs text-gray-500">
                                        {meta.label}
                                        {f.type === "dropdown" && f.options?.length ? ` · ${f.options.join(", ")}` : ""}
                                        {f.docTypes?.length > 1 || !f.docTypes?.length ? " · shared with other documents" : ""}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex flex-shrink-0 items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => toggleShow(f)}
                                      title={hidden ? "Not printed on the document" : "Printed on the document"}
                                      className={`flex h-8 items-center gap-1 rounded-full px-3 text-xs font-medium ${
                                        hidden ? "bg-gray-100 text-gray-500" : "bg-emerald-50 text-emerald-700"
                                      }`}
                                    >
                                      {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                      {hidden ? "Hidden on print" : "On print"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => startEdit(f)}
                                      className="rounded-full p-2 text-gray-500 hover:bg-gray-100"
                                      title="Edit"
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setPendingDelete(f)}
                                      className="rounded-full p-2 text-red-500 hover:bg-red-50"
                                      title="Delete"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                ),
              )}
            </div>
          </>
        )}

        {view === "sections" && (
          <>
            <form onSubmit={handleAddSection} className="mb-5 flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={newSection}
                onChange={(e) => setNewSection(e.target.value)}
                placeholder="New section name (e.g. Shipping details)"
                maxLength={40}
                className={`${inputCls} min-w-[240px] flex-1`}
              />
              <button
                type="submit"
                disabled={saving}
                className="flex h-10 items-center gap-1.5 rounded-full bg-[#0085FF] px-5 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-60"
              >
                <FolderPlus className="h-4 w-4" /> Add section
              </button>
            </form>
            {typeSections.length === 0 ? (
              <p className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
                No sections for {docLabel} yet. Sections group your custom fields; pick one when adding a field.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                {typeSections.map((s) => {
                  const count = fields.filter((f) => f.section === s).length;
                  return (
                    <li key={s} className="flex items-center justify-between gap-3 px-4 py-3">
                      {renaming === s ? (
                        <div className="flex flex-1 items-center gap-2">
                          <input
                            autoFocus
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            maxLength={40}
                            className={`${inputCls} flex-1`}
                          />
                          <button
                            type="button"
                            onClick={() => handleRenameSection(s)}
                            className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setRenaming(null)}
                            className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 text-gray-600"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{s}</p>
                            <p className="text-xs text-gray-500">
                              {count} field{count === 1 ? "" : "s"}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setRenaming(s);
                                setRenameValue(s);
                              }}
                              className="rounded-full p-2 text-gray-500 hover:bg-gray-100"
                              title="Rename"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingDeleteSection(s)}
                              className="rounded-full p-2 text-red-500 hover:bg-red-50"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {view === "builtin" && (
          <div className="overflow-hidden rounded-xl border border-gray-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Field</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Required</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {builtIn.map((f) => (
                  <tr key={f.name}>
                    <td className="flex items-center gap-2 px-4 py-2.5 font-medium text-gray-900">
                      <Lock className="h-3.5 w-3.5 text-gray-400" />
                      {f.name}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{f.type}</td>
                    <td className="px-4 py-2.5 text-gray-600">{f.required ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-gray-100 bg-gray-50 px-4 py-2.5 text-xs text-gray-500">
              Built-in fields come with every {docLabel.toLowerCase()} and can't be edited or removed.
            </p>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!pendingDelete}
        title="Delete field"
        message={`Remove "${pendingDelete?.label}" from ${docLabel}?\n\nThe column disappears from the list. Documents that already have a value keep it.`}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
      <ConfirmDialog
        isOpen={!!pendingDeleteSection}
        title="Delete section"
        message={`Delete the "${pendingDeleteSection}" section?\n\nIts fields are kept and moved to "No section".`}
        onConfirm={confirmDeleteSection}
        onCancel={() => setPendingDeleteSection(null)}
      />
    </div>
  );
}
