import React, { useEffect, useState } from "react";
import API from "../../services/api";

const inputCls =
  "w-full px-3 py-2.5 rounded-full border border-[#1F2937]/10 text-[13px] text-[#1F2937] bg-white placeholder:text-[#1F2937] placeholder:opacity-50 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all";

// The custom fields an organization defined in Settings > Document Settings,
// as inputs on a document form. `docType` is the backend key (tax | quotation |
// performa | deliveryChallan); only fields switched on for it are shown.
//
// `value` is the document's own list ([{ id, label, value, showOnDocument }]).
// Each entry carries its label so an issued document keeps reading the same even
// if the field is renamed or deleted later; values for fields that no longer
// exist are kept as they are.
// The fields switched on for `docType`. Forms that number their sections use this to
// know whether the Custom Fields section exists, so later sections shift up/down.
// One shared request for every consumer (the panel's section numbering and the inputs
// themselves), remembered for the session so reopening a form shows the section at once
// instead of popping in after a fetch. Refreshed in the background each time.
let cachedDefs = null;
let inflight = null;
function loadDefs() {
  if (!inflight) {
    inflight = API.get("/document-settings")
      .then((res) => {
        cachedDefs = Array.isArray(res.data?.customFields) ? res.data.customFields : [];
        return cachedDefs;
      })
      .catch(() => cachedDefs || [])
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}
// Call early (e.g. when the invoice drawer opens) to warm the cache.
export const prefetchDocumentCustomFieldDefs = loadDefs;

export function useDocumentCustomFieldDefs(docType) {
  const [defs, setDefs] = useState(cachedDefs || []);

  useEffect(() => {
    let cancelled = false;
    loadDefs().then((d) => {
      if (!cancelled) setDefs(d);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return defs.filter((f) => f.label && (!f.docTypes?.length || f.docTypes.includes(docType)));
}

// `header` (optional) replaces the plain "Custom Fields" label, e.g. a numbered SectionHeader.
export default function DocumentCustomFieldInputs({ docType, value, onChange, header }) {
  const fields = useDocumentCustomFieldDefs(docType);
  const current = Array.isArray(value) ? value : [];
  if (fields.length === 0) return null;

  const valueOf = (def) => current.find((c) => c.id === def.id)?.value ?? "";

  const setValue = (def, next) => {
    const entry = { id: def.id, label: def.label, value: next, showOnDocument: def.showOnDocument !== false };
    const exists = current.some((c) => c.id === def.id);
    onChange(exists ? current.map((c) => (c.id === def.id ? entry : c)) : [...current, entry]);
  };

  return (
    <div>
      {header || (
        <p className="mb-2 text-[13px] font-medium text-[#161618] tracking-[-0.05em]">Custom Fields</p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fields.map((def) => (
          <div key={def.id}>
            <label className="mb-1.5 block text-[12px] font-medium text-[#525866]">{def.label}</label>
            {def.type === "dropdown" ? (
              <select
                value={valueOf(def)}
                onChange={(e) => setValue(def, e.target.value)}
                className={inputCls}
              >
                <option value="">Select…</option>
                {(def.options || []).filter(Boolean).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={def.type === "number" ? "number" : def.type === "date" ? "date" : "text"}
                value={valueOf(def)}
                onChange={(e) => setValue(def, e.target.value)}
                placeholder={def.label}
                className={inputCls}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
