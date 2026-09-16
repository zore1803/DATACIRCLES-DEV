import React from "react";
import PlusIcon from "./PlusIcon";

/**
 * Standard "table has no rows" layout: an icon, a one-line title plus a
 * short description, and (unless a search/filter is the reason the table is
 * empty) a filled #0085FF "+ New X" button that opens the same create flow
 * as the page's own toolbar button.
 *
 * First written inline in ExpenseLedgerPage.jsx; extracted here so every
 * list page in the app shares one empty-state instead of each hand-rolling
 * its own icon/copy/button — which had drifted into several different
 * looks (plain text, dashed boxes, no button at all) across pages before
 * this.
 *
 * `noun`: singular entity name for the button/description, e.g. "Company",
 * "Deal". `isFiltered`: true when the emptiness is a search/filter result
 * rather than a genuinely empty table — swaps the copy and hides the
 * create button, since creating one more record won't fix a filter that's
 * too narrow.
 */
export default function EmptyState({
  icon: Icon,
  noun,
  title,
  description,
  isFiltered = false,
  filteredTitle,
  filteredDescription = "Try a different search or filter.",
  onCreate,
  buttonLabel,
  className = "",
}) {
  const resolvedTitle = isFiltered
    ? filteredTitle || `No matching ${noun.toLowerCase()}s`
    : title || `No ${noun.toLowerCase()}s yet`;
  const resolvedDescription = isFiltered
    ? filteredDescription
    : description || `Create your first ${noun.toLowerCase()} to see it here.`;

  return (
    <div className={`flex flex-col items-center justify-center text-center py-24 px-4 ${className}`}>
      {Icon && <Icon className="h-12 w-12 text-gray-300 mb-4" />}
      <h3 className="text-lg font-semibold text-gray-800">{resolvedTitle}</h3>
      <p className="text-gray-500 mt-1.5 max-w-md text-sm">{resolvedDescription}</p>
      {!isFiltered && onCreate && (
        <button
          type="button"
          onClick={onCreate}
          className="mt-5 inline-flex items-center gap-2 h-10 px-5 bg-[#0085FF] text-white text-sm font-medium rounded-full hover:bg-blue-600 transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          {buttonLabel || `New ${noun}`}
        </button>
      )}
    </div>
  );
}
