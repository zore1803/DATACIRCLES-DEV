import { formatRichText } from "../../../../shared/documentTemplates.js";

// Notes/terms picked from the drawer are rich-text HTML; show them formatted
// instead of as raw tags. Plain-text values stay in an editable textarea.
const RICH_NOTE = /^\s*<(p|ol|ul)[\s>]/i;

export default function NoteField({ value, onChange, placeholder, className, rows = 3 }) {
  if (RICH_NOTE.test(value || "")) {
    return (
      <div className="relative">
        <div
          className="w-full px-3.5 py-2.5 pr-14 rounded-2xl border border-[#1F2937]/10 text-[13px] text-[#1F2937] [&_ol]:list-decimal [&_ul]:list-disc [&_ol]:pl-5 [&_ul]:pl-5 [&_li[data-list=bullet]]:list-disc [&_li[data-list=ordered]]:list-decimal"
          dangerouslySetInnerHTML={{ __html: formatRichText(value) }}
        />
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute top-2 right-3 text-[11px] text-[#0085FF] hover:underline"
        >
          Clear
        </button>
      </div>
    );
  }
  return (
    <textarea
      placeholder={placeholder}
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    />
  );
}
