import React from "react";
import { PackageX, X } from "lucide-react";

// Parses backend inventorySync.js's thrown message — either
// "Insufficient stock for product: <name>" or
// "Insufficient stock for variant of: <name>" — into just the product name,
// so the dialog can bold it instead of repeating the raw sentence.
const parseItemName = (message) => {
  const match = /Insufficient stock for (?:variant of: )?(.+)$/i.exec(message || "");
  return match ? match[1].trim() : null;
};

// Centered confirmation-style dialog shown instead of a toast when a
// document save fails specifically because an item's quantity exceeds
// available stock.
const InsufficientStockDialog = ({ isOpen, message, onClose }) => {
  if (!isOpen) return null;

  const itemName = parseItemName(message);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100030] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-red-100 p-2 rounded-lg flex-shrink-0">
              <PackageX className="w-5 h-5 text-red-600" />
            </div>
            <h2 className="text-lg font-semibold font-sf text-gray-900">
              Insufficient Stock
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 -m-1 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <p className="text-sm text-gray-600 font-inter leading-relaxed mb-6">
          {itemName ? (
            <>
              <span className="font-semibold text-gray-900">{itemName}</span> doesn't have
              enough stock to cover the quantity on this document.
            </>
          ) : (
            message || "One or more items don't have enough stock to cover the quantity on this document."
          )}
          <br className="hidden sm:block" /> Reduce the quantity or restock the item, then try again.
        </p>

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};

export default InsufficientStockDialog;
