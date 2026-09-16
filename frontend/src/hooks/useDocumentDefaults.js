import { useEffect, useState } from "react";
import { getDocumentSettings } from "../services/documentSettingsCache";

// The organisation's saved defaults for NEW documents (notes, terms, due-date offset), shaped
// exactly as InvoiceForm and the other document forms take them as props.
//
// Accounting loads these in its own fetchDocSettings; any other surface that opens a document
// form (e.g. Company Profile → Invoices) must pass the same values, or the "same" invoice gets
// different notes/terms/due date depending on where it was created.
//
// Always fetched fresh (forceRefresh) rather than served from the session cache: the cache is
// never invalidated when the settings are saved, so a cached read would keep handing out the
// old defaults until a full reload. The fresh read also refreshes that shared cache.
export const EMPTY_DOCUMENT_DEFAULTS = {
  documentTypeSettings: {},
  defaultDueDateDays: null,
  defaultNotesByType: {},
  defaultTermsByType: {},
  defaultNotesFlat: "",
  defaultTermsFlat: "",
};

// Mirrors Accounting.jsx fetchDocSettings field-for-field (the document-form fields of it).
export const mapDocumentDefaults = (data) => ({
  // Per-type prefix/suffix. Without it the form opens on the built-in "INV-" and only corrects
  // itself once its own settings request returns, a visible flicker Accounting avoids by
  // passing this.
  documentTypeSettings: data?.documentTypeSettings || {},
  defaultDueDateDays: data?.defaultDueDateDays != null ? data.defaultDueDateDays : null,
  defaultNotesByType: data?.defaultNotesByType || {},
  defaultTermsByType: data?.defaultTermsByType || {},
  defaultNotesFlat: data?.defaultNotes || "",
  defaultTermsFlat: data?.defaultTerms || "",
});

// Returns the defaults plus `settled`: true once the fetch has finished, whether it succeeded or
// failed. Callers should hold off mounting a create form until then — InvoiceForm reads notes and
// terms into its initial state once, so a form mounted before the fetch lands keeps the built-in
// text for good. On failure `settled` still flips, so the form opens with its built-ins exactly
// as it did before this hook existed rather than never opening.
export default function useDocumentDefaults() {
  const [state, setState] = useState({ ...EMPTY_DOCUMENT_DEFAULTS, settled: false });

  useEffect(() => {
    let cancelled = false;
    getDocumentSettings(true)
      .then((data) => {
        if (!cancelled) setState({ ...mapDocumentDefaults(data), settled: true });
      })
      .catch((err) => {
        console.error("Failed to load document settings", err);
        if (!cancelled) setState((prev) => ({ ...prev, settled: true }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
