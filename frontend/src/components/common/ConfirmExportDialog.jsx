import React, { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import DownloadIcon from "./DownloadIcon";

// In-app replacement for the browser's window.confirm("Do you want to export
// as ...?") used by every Export as Excel / Export as PDF menu item. Same card
// as the Confirm Deletion dialog (BulkDeleteModal) so the two read as one
// family: icon chip + title, one line of copy, Cancel / primary action.
//
//   if (!(await confirmExport("excel"))) return;
//
// It mounts itself on demand, so no page needs a provider or any extra state.

const FORMAT_LABELS = { excel: "Excel", pdf: "PDF" };

function ConfirmExportDialog({ format, onResult }) {
  const confirmRef = useRef(null);
  const label = FORMAT_LABELS[format] || "file";

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onResult(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onResult]);

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100003] flex items-center justify-center p-4"
      onClick={() => onResult(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-export-title"
        className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-green-100 p-2 rounded-lg">
            <DownloadIcon className="w-5 h-5 text-green-600" />
          </div>
          <h2 id="confirm-export-title" className="text-xl font-bold text-gray-900">
            Confirm Export
          </h2>
        </div>

        <p className="text-sm text-gray-600 mb-6">
          Do you want to export as <span className="font-semibold text-gray-900">{label}</span>?
        </p>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => onResult(false)}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => onResult(true)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center gap-2"
          >
            <DownloadIcon className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>
    </div>
  );
}

/** Resolves true if the user confirms, false if they cancel / press Esc / click away. */
export function confirmExport(format) {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);

    let settled = false;
    const finish = (answer) => {
      if (settled) return;
      settled = true;
      resolve(answer);
      // Unmount after this event finishes, so React isn't torn down mid-click.
      setTimeout(() => {
        root.unmount();
        host.remove();
      }, 0);
    };

    root.render(<ConfirmExportDialog format={format} onResult={finish} />);
  });
}
