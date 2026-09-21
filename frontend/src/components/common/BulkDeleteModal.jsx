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
    <div className="fixed inset-0 bg-black/50 z-[10004] flex items-center justify-center p-4">
      <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-sm sm:max-w-lg mx-4 animate-in fade-in zoom-in-95 duration-150">
        <h3 className="text-lg font-semibold font-sf text-gray-900 mb-4">
          Confirm bulk delete
        </h3>
        <p className="text-sm text-gray-600 mb-6 font-inter">
          {message}
        </p>
        
        {onExportBeforeDelete && (
          <div className="mb-6">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={keepCopy}
                onChange={(e) => setKeepCopy(e.target.checked)}
                className="accent-red-600"
              />
              Keep a copy (download as CSV)
            </label>
          </div>
        )}

        <div className="flex justify-between gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="bg-gray-200 font-sf text-gray-800 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors cursor-pointer hidden sm:block"
          >
            Cancel
          </button>
          
          <div className="flex space-x-1 sm:space-x-0 w-full sm:w-auto">
            {/* Mobile cancel button - since the other one is hidden on sm */}
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="bg-gray-200 font-sf text-gray-800 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors cursor-pointer sm:hidden flex-1"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading}
              className="bg-red-600 font-sf text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors cursor-pointer flex items-center justify-center min-w-[92px] flex-1 sm:flex-none"
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
