import React from "react";
import { EditablePaginationButtons } from "./EditablePaginationButtons";

/**
 * "Showing X to Y of Z results" + per-page select + editable
 * first…current…last pager. Markup, spacing and behaviour are lifted
 * directly from pages/Companies.jsx's pagination footer so every list in the
 * app — including the vendor detail tabs — shares one page-change feel.
 *
 * Purely presentational: the caller owns `page`/`limit` state and passes the
 * already-sliced `data` for the current page plus the pre-filtered `total`.
 */
export default function TablePaginationFooter({
  currentPage,
  totalPages,
  totalCount,
  limit,
  onPageChange,
  onLimitChange,
  limitOptions = [10, 20, 50, 100],
  className = "w-full bg-transparent py-3 flex items-center justify-between",
}) {
  if (totalCount === 0) return null;

  const hasPrevPage = currentPage > 1;
  const hasNextPage = currentPage < totalPages;
  const startItem = (currentPage - 1) * limit + 1;
  const endItem = Math.min(currentPage * limit, totalCount);

  // Same "first ... current ... last" set Companies.jsx builds — a compact
  // page list instead of one button per page.
  const pageItems = (() => {
    const items = [1];
    if (currentPage > 2) items.push("left-dots");
    if (currentPage !== 1 && currentPage !== totalPages) items.push(currentPage);
    if (currentPage < totalPages - 1) items.push("right-dots");
    if (totalPages > 1) items.push(totalPages);
    return items;
  })();

  return (
    <div className={className}>
      <div className="flex-1 flex justify-between sm:hidden">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={!hasPrevPage}
          className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!hasNextPage}
          className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>

      <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <p className="text-sm text-gray-600 font-medium">
            Showing {startItem} to {endItem} of {totalCount} results
          </p>
          {onLimitChange && (
            <select
              value={limit}
              onChange={(e) => onLimitChange(parseInt(e.target.value, 10))}
              className="border border-gray-200 rounded-full px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer bg-white"
            >
              {limitOptions.map((n) => (
                <option key={n} value={n}>
                  {n} per page
                </option>
              ))}
            </select>
          )}
        </div>

        <EditablePaginationButtons
          currentPage={currentPage}
          totalPages={totalPages}
          hasPrevPage={hasPrevPage}
          hasNextPage={hasNextPage}
          onPageChange={onPageChange}
          getPageNumbers={() => pageItems}
        />
      </div>
    </div>
  );
}
