import { useEffect, useMemo, useState } from "react";

// The editable state behind a column filter UI: the draft selection the user is
// building, the option list for each column, and toggle/apply/reset. Shared by
// the side CompanyFilterPanel and the horizontal InlineFilterBar so both filter
// exactly the same way.
//
// `isOpen`: whenever the UI (re)opens, the draft is reset to the applied
// `selected`, so abandoned edits don't carry over to the next open.
export default function useColumnFilterDraft({ isOpen, columns, data = [], getFieldValue, selected = {}, onApply }) {
  const [draft, setDraft] = useState(selected);

  useEffect(() => {
    if (isOpen) setDraft(selected);
  }, [isOpen, selected]);

  // Declared options first (in their declared order), then any extra values
  // actually present in the data, sorted.
  const valuesByColumn = useMemo(() => {
    const map = {};
    columns.forEach((col) => {
      const fromData = new Set();
      data.forEach((item) => {
        const v = getFieldValue(item, col.key);
        if (v !== undefined && v !== null && v !== "") fromData.add(String(v));
      });

      if (!col.options) {
        map[col.key] = Array.from(fromData).sort();
        return;
      }

      const declared = col.options.map(String);
      const declaredSet = new Set(declared);
      const extras = Array.from(fromData)
        .filter((v) => !declaredSet.has(v))
        .sort();
      map[col.key] = [...declared, ...extras];
    });
    return map;
  }, [columns, data, getFieldValue]);

  const toggleValue = (colKey, value) => {
    setDraft((prev) => {
      const current = prev[colKey] || [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [colKey]: next };
    });
  };

  // Applies the draft with empty columns dropped.
  const apply = () => {
    const cleaned = Object.fromEntries(
      Object.entries(draft).filter(([, arr]) => arr && arr.length > 0),
    );
    onApply(cleaned);
  };

  const reset = () => {
    setDraft({});
    onApply({});
  };

  return { draft, valuesByColumn, toggleValue, apply, reset };
}
