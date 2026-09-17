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
    <div className="fixed inset-0 bg-[#0e121b]/60 backdrop-blur-sm z-[100030] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
              <PackageX className="w-4 h-4 text-red-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 font-sf">
              Insufficient Stock
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-sm text-gray-600 font-inter leading-relaxed">
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
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end items-center bg-gray-50/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};

export default InsufficientStockDialog;
