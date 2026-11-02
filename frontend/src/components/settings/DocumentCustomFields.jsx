import React from "react";
import { ListPlus, Trash2 } from "lucide-react";

// Document types a custom field can apply to, keyed the way the backend and the
// document forms identify them.
export const CUSTOM_FIELD_DOC_TYPES = [
  { key: "tax", label: "Invoice" },
  { key: "quotation", label: "Quote" },
  { key: "performa", label: "Proforma Invoice" },
  { key: "deliveryChallan", label: "Delivery Challan" },
];

const FIELD_TYPES = [
  { key: "text", label: "Text" },
  { key: "number", label: "Number" },
  { key: "date", label: "Date" },
  { key: "dropdown", label: "Dropdown" },
];

const newId = () => `cf_${Math.random().toString(36).slice(2, 10)}`;
const inputCls =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500";

// Editor for the organization's custom document fields. Pure controlled
// component: the parent owns the list and saves it with the rest of the Document
// Settings form.
export default function DocumentCustomFields({ value = [], onChange }) {
  const fields = Array.isArray(value) ? value : [];

  const update = (id, patch) => onChange(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const remove = (id) => onChange(fields.filter((f) => f.id !== id));
  const add = () =>
    onChange([
      ...fields,
      {
        id: newId(),
        label: "",
        type: "text",
        options: [],
        docTypes: CUSTOM_FIELD_DOC_TYPES.map((d) => d.key),
        showOnDocument: true,
      },
    ]);

  const toggleDocType = (field, key) => {
    const has = field.docTypes?.includes(key);
    const next = has ? field.docTypes.filter((k) => k !== key) : [...(field.docTypes || []), key];
    update(field.id, { docTypes: next });
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <ListPlus className="mt-0.5 h-4 w-4 text-sky-600" />
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Custom Fields</h3>
            <p className="text-xs text-gray-500">
              Add your own fields, such as PO Number or Vehicle No. They appear while creating the
              documents you choose, and print on them.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={add}
          disabled={fields.length >= 20}
          className="flex-shrink-0 text-[13px] font-semibold text-[#0085FF] hover:underline disabled:opacity-50"
        >
          + Add field
        </button>
      </div>

      {fields.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-400">
          No custom fields yet
        </p>
      ) : (
        <div className="space-y-3">
          {fields.map((field) => (
            <div key={field.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_150px_auto]">
                <input
                  value={field.label}
                  onChange={(e) => update(field.id, { label: e.target.value })}
                  placeholder="Field name, e.g. PO Number"
                  maxLength={60}
                  className={inputCls}
                />
                <select
                  value={field.type}
                  onChange={(e) => update(field.id, { type: e.target.value })}
                  className={inputCls}
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => remove(field.id)}
                  title="Delete field"
                  className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {field.type === "dropdown" && (
                <input
                  value={(field.options || []).join(", ")}
                  onChange={(e) => update(field.id, { options: e.target.value.split(",").map((o) => o.trim()) })}
                  placeholder="Options, separated by commas — e.g. Road, Rail, Air"
                  className={inputCls}
                />
              )}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="text-xs font-medium text-gray-500">Use on:</span>
                {CUSTOM_FIELD_DOC_TYPES.map((d) => (
                  <label key={d.key} className="inline-flex items-center gap-1.5 text-[13px] text-gray-700">
                    <input
                      type="checkbox"
                      checked={field.docTypes?.includes(d.key) || false}
                      onChange={() => toggleDocType(field, d.key)}
                      className="h-3.5 w-3.5 rounded border-gray-300"
                    />
                    {d.label}
                  </label>
                ))}
                <label className="ml-auto inline-flex items-center gap-1.5 text-[13px] text-gray-700">
                  <input
                    type="checkbox"
                    checked={field.showOnDocument !== false}
                    onChange={(e) => update(field.id, { showOnDocument: e.target.checked })}
                    className="h-3.5 w-3.5 rounded border-gray-300"
                  />
                  Print on document
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
