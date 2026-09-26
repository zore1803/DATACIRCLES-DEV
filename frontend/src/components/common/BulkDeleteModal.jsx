import React, { useState } from "react";
import { AlertCircle } from "lucide-react";
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
  confirmLabel = "Delete",
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
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100003] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-red-100 p-2 rounded-lg">
            <AlertCircle className="w-5 h-5 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Confirm Deletion</h2>
        </div>

        <p className="text-sm text-gray-600 mb-6">{message}</p>

        {onExportBeforeDelete && (
          <label className="flex items-center gap-2 text-sm text-gray-600 mb-6 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={keepCopy}
              onChange={(e) => setKeepCopy(e.target.checked)}
              className="accent-red-600"
            />
            Keep a copy (download as CSV)
          </label>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium flex items-center gap-2 disabled:opacity-50"
          >
            <DeleteIcon className="w-4 h-4" />
            {loading ? loadingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
