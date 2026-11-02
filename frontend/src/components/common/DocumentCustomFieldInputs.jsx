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
export default function DocumentCustomFieldInputs({ docType, value, onChange }) {
  const [defs, setDefs] = useState([]);

  useEffect(() => {
    let cancelled = false;
    API.get("/document-settings")
      .then((res) => {
        if (!cancelled) setDefs(Array.isArray(res.data?.customFields) ? res.data.customFields : []);
      })
      .catch(() => {
        if (!cancelled) setDefs([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const current = Array.isArray(value) ? value : [];
  const fields = defs.filter((f) => f.label && (!f.docTypes?.length || f.docTypes.includes(docType)));
  if (fields.length === 0) return null;

  const valueOf = (def) => current.find((c) => c.id === def.id)?.value ?? "";

  const setValue = (def, next) => {
    const entry = { id: def.id, label: def.label, value: next, showOnDocument: def.showOnDocument !== false };
    const exists = current.some((c) => c.id === def.id);
    onChange(exists ? current.map((c) => (c.id === def.id ? entry : c)) : [...current, entry]);
  };

  return (
    <div>
      <p className="mb-2 text-[13px] font-medium text-[#161618] tracking-[-0.05em]">Custom Fields</p>
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
