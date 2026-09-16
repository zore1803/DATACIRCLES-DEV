import React, { useState } from "react";
import DeleteIcon from "./DeleteIcon";

// Shared bulk-delete confirmation, previously duplicated near-verbatim
// across Companies/Contacts/Deals/SalesReturn/SalesSubscription/Tasks/
// Vendors — each with its own icon size, spacing and card width, so the
// same dialog looked slightly different depending on which list you were
// on. `message` stays a caller-supplied node since a few of those (sales
// returns/subscriptions) name a specific side effect rather than the
// generic "cannot be undone" copy.
//
// `onExportBeforeDelete` is optional: pages that can build a CSV of the
// selected rows pass a sync function to do so, and the checkbox (checked
// by default — this exists as a safety net, so it should have to be
// unchecked to skip rather than opted into) appears only when they do.
export default function BulkDeleteModal({
  isOpen,
  message,
  confirmLabel = "Delete All",
  loadingLabel = "Deleting...",
  loading = false,
  onCancel,
  onConfirm,
  onExportBeforeDelete,
}) {
  const [keepCopy, setKeepCopy] = useState(true);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (keepCopy && onExportBeforeDelete) onExportBeforeDelete();
    onConfirm();
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[10000] p-4">
      <div className="bg-white rounded-lg shadow-xl border border-gray-100 max-w-xs w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-red-50 rounded-full flex items-center justify-center flex-shrink-0">
              <DeleteIcon className="w-4 h-4 text-red-600" />
            </div>
            <div className="pt-0.5">
              <h3 className="text-sm font-semibold text-gray-900 font-sf">
                Confirm bulk delete
              </h3>
              <p className="text-sm text-gray-500 font-inter mt-1">{message}</p>
            </div>
          </div>
          {onExportBeforeDelete && (
            <label className="flex items-center gap-2 mt-3 ml-11 text-sm text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={keepCopy}
                onChange={(e) => setKeepCopy(e.target.checked)}
                className="accent-red-600"
              />
              Keep a copy (download as CSV)
            </label>
          )}
          <div className="flex gap-2 justify-end mt-5">
            <button
              onClick={onCancel}
              disabled={loading}
              className="px-3.5 py-1.5 border border-gray-300 rounded-md text-sm text-gray-700 font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading}
              className="px-3.5 py-1.5 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 transition-colors shadow-sm flex items-center justify-center min-w-[92px]"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white mr-2" />
                  {loadingLabel}
                </>
              ) : (
                confirmLabel
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
