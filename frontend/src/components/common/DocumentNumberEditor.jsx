import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import API from "../../services/api";

// Same join the server uses: "<prefix>-<number>-<suffix>", with no doubled dash
// when the prefix already ends in one.
export const joinDocumentNumber = (prefix, seq, suffix) => {
  const pfx = (prefix || "").trim();
  const sep = pfx && !pfx.endsWith("-") ? "-" : "";
  const sfx = (suffix || "").trim();
  return `${pfx}${sep}${seq}${sfx ? `-${sfx}` : ""}`;
};

// Pulls the sequence out of a saved number using the prefix/suffix stored on the
// document. Returns null when the number doesn't have that shape (it was typed in
// by hand), so the caller can fall back to editing the whole thing.
const splitDocumentNumber = (docNumber, prefix, suffix) => {
  const pfx = (prefix || "").trim();
  const sfx = (suffix || "").trim();
  const head = pfx ? `${pfx}${pfx.endsWith("-") ? "" : "-"}` : "";
  const tail = sfx ? `-${sfx}` : "";
  if (docNumber.startsWith(head) && docNumber.endsWith(tail) && docNumber.length > head.length + tail.length) {
    return docNumber.slice(head.length, docNumber.length - tail.length);
  }
  return null;
};

// A pill-style dropdown with a real list (checkmark on the chosen row, scrolls
// when long) instead of the browser's plain select.
function PartPicker({ label, value, options, onChange, disabled, align = "left", addLabel, onAdd }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const rows = ["", ...options];
  return (
    <div ref={ref} className="relative h-full flex-shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        title={label}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-full min-w-[64px] items-center justify-between gap-1.5 bg-[#F8F9FB] px-4 text-[15px] font-semibold text-[#1F2937] transition-colors hover:bg-[#EEF1F6] disabled:opacity-60"
      >
        <span className={value ? "" : "text-[#99A0AE] font-medium"}>{value || "None"}</span>
        <ChevronDown className={`h-4 w-4 flex-shrink-0 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          role="listbox"
          className={`absolute top-full z-30 mt-1.5 w-60 overflow-hidden rounded-xl border border-[#E1E4EA] bg-white shadow-2xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <p className="border-b border-[#F1F2F4] px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#99A0AE]">
            {label}
          </p>
          <ul className="max-h-56 overflow-y-auto py-1">
            {rows.map((opt) => {
              const selected = opt === (value || "");
              return (
                <li key={opt || "__none"}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(opt);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-[14px] transition-colors ${
                      selected ? "bg-blue-50 font-semibold text-[#0085FF]" : "text-[#1F2937] hover:bg-gray-50"
                    }`}
                  >
                    <span className={`truncate ${opt ? "" : "text-[#99A0AE]"}`}>{opt || "None"}</span>
                    {selected && <Check className="h-3.5 w-3.5 flex-shrink-0" />}
                  </button>
                </li>
              );
            })}
          </ul>
          {onAdd && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onAdd();
              }}
              className="flex w-full items-center gap-1.5 border-t border-[#F1F2F4] bg-[#F8FAFF] px-4 py-2.5 text-left text-[13px] font-semibold text-[#0085FF] transition-colors hover:bg-blue-50"
            >
              <Plus className="h-3.5 w-3.5" />
              {addLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Inline editor for a saved document's number: prefix and suffix are picked from
// the lists configured in Document Settings, the middle part is the sequence.
// `settingsKey` is the document type's key in documentTypeSettings
// (invoice | quote | proformaInvoice | deliveryChallan). The lists are fetched
// fresh when the editor opens so a prefix added in Settings a moment ago is there.
export default function DocumentNumberEditor({
  docNumber,
  prefix,
  suffix,
  settingsKey,
  fallbackPrefixes = [],
  fallbackSuffixes = [],
  docName = "Document",
  saving = false,
  onSave,
  onCancel,
}) {
  const navigate = useNavigate();
  // New prefixes/suffixes are created in Document Settings; open it on this document's
  // type and the right tab.
  const manage = (tab) => navigate(`/settings/document-settings?doc=${encodeURIComponent(settingsKey)}&tab=${tab}`);
  const split = splitDocumentNumber(docNumber, prefix, suffix);
  const [pfx, setPfx] = useState(split === null ? "" : (prefix || "").trim());
  const [sfx, setSfx] = useState(split === null ? "" : (suffix || "").trim());
  const [seq, setSeq] = useState(split === null ? docNumber : split);
  const [lists, setLists] = useState({ prefixes: fallbackPrefixes, suffixes: fallbackSuffixes });

  useEffect(() => {
    let cancelled = false;
    API.get("/document-settings")
      .then((res) => {
        const t = res.data?.documentTypeSettings?.[settingsKey];
        if (!cancelled && t) setLists({ prefixes: t.prefixes || [], suffixes: t.suffixes || [] });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [settingsKey]);

  // Whatever the document already carries stays selectable even if it has since
  // been removed from Settings.
  const withCurrent = (list, current) => (current && !list.includes(current) ? [current, ...list] : list);
  const prefixes = withCurrent(lists.prefixes, pfx);
  const suffixes = withCurrent(lists.suffixes, sfx);

  const submit = () => onSave({ seq: seq.trim(), prefix: pfx, suffix: sfx });

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <div className="flex h-10 min-w-0 items-center rounded-full border border-[#D0D5DD] bg-white shadow-sm focus-within:border-[#0085FF] focus-within:ring-2 focus-within:ring-[#0085FF]/15">
        <div className="h-full overflow-visible rounded-l-full [&>div>button]:rounded-l-full">
          <PartPicker label={`${docName} prefix`} value={pfx} options={prefixes} onChange={setPfx} disabled={saving} addLabel="Add new prefix" onAdd={() => manage("prefix")} />
        </div>
        <span className="h-5 w-px flex-shrink-0 bg-[#D0D5DD]" />
        <input
          autoFocus
          value={seq}
          disabled={saving}
          onChange={(e) => setSeq(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") onCancel();
          }}
          aria-label={`${docName} number`}
          className="w-24 min-w-0 bg-transparent px-3 text-center text-[15px] font-bold text-[#1F2937] outline-none"
        />
        <span className="h-5 w-px flex-shrink-0 bg-[#D0D5DD]" />
        <div className="h-full overflow-visible rounded-r-full [&>div>button]:rounded-r-full">
          <PartPicker label={`${docName} suffix`} value={sfx} options={suffixes} onChange={setSfx} disabled={saving} align="right" addLabel="Add new suffix" onAdd={() => manage("suffix")} />
        </div>
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={saving}
        title={saving ? "Saving..." : "Save"}
        className="ml-1 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#0085FF] text-white shadow-sm transition-colors hover:bg-blue-600 disabled:opacity-60"
      >
        {saving ? (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        ) : (
          <Check className="h-4 w-4" />
        )}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        title="Cancel"
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-[#D0D5DD] bg-white text-[#525866] transition-colors hover:bg-gray-50"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
