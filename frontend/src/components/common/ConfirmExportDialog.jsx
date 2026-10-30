import React, { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import DownloadIcon from "./DownloadIcon";

// In-app replacement for the browser's window.confirm("Do you want to export
// as ...?") used by every Export as Excel / Export as PDF menu item. Same card
// as a capsule: icon, title + one line of copy, then Cancel / primary action
// side by side (stacked in a rounded card on a narrow phone).
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
        // A capsule on screens wide enough for one row (icon, text, buttons side by side); on a
        // narrow phone it stacks, so it falls back to a heavily rounded card instead.
        className="bg-white w-full max-w-[600px] shadow-2xl animate-in fade-in zoom-in-95 duration-150 flex flex-col items-stretch gap-4 rounded-[28px] px-6 py-5 sm:flex-row sm:items-center sm:gap-4 sm:rounded-full sm:py-3 sm:pl-4 sm:pr-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[#EAF4FF]">
            <DownloadIcon className="h-5 w-5 text-[#0085FF]" />
          </div>
          <div className="min-w-0">
            <h2 id="confirm-export-title" className="text-base font-bold leading-tight text-gray-900">
              Confirm Export
            </h2>
            <p className="mt-0.5 text-[13px] leading-snug text-gray-600">
              Do you want to export as <span className="font-semibold text-gray-900">{label}</span>?
            </p>
          </div>
        </div>

        <div className="flex flex-shrink-0 justify-end gap-2">
          <button
            type="button"
            onClick={() => onResult(false)}
            className="rounded-full bg-gray-100 px-5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => onResult(true)}
            className="flex items-center gap-2 rounded-full bg-[#0085FF] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0078E8]"
          >
            <DownloadIcon className="h-4 w-4" />
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
