import React, { useState, useEffect, useCallback, useMemo } from "react";
import { X } from "lucide-react";

// Field-mapping step for Purchase CSV import — same shape/behaviour as
// ItemFieldMappingModal.jsx (Products & Services) and
// PurchaseOrderFieldMappingModal.jsx, adapted to Purchase fields. Vendor
// Name + Item Name are the two fields the backend actually requires per row
// (see purchaseController.bulkImportPurchases); rows that share the same
// Purchase Number + Vendor Name are grouped server-side into one multi-item
// purchase.
const PurchaseFieldMappingModal = ({
  isOpen: propIsOpen,
  onClose,
  csvHeaders,
  onImport,
  loading,
}) => {
  const [fieldMapping, setFieldMapping] = useState({});
  const [isOpen, setIsOpen] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  const standardFields = useMemo(
    () => [
      { key: "vendorName", label: "Vendor Name", required: true },
      { key: "itemName", label: "Item Name", required: true },
      { key: "quantity", label: "Quantity" },
      { key: "unitPrice", label: "Unit Price" },
      { key: "purchaseNumber", label: "Purchase Number" },
      { key: "status", label: "Status" },
      { key: "notes", label: "Notes" },
    ],
    [],
  );

  useEffect(() => {
    if (propIsOpen) {
      setShouldRender(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setIsOpen(true)));
    } else {
      setIsOpen(false);
      setTimeout(() => {
        setShouldRender(false);
      }, 300);
    }
  }, [propIsOpen]);

  useEffect(() => {
    if (!propIsOpen || csvHeaders.length === 0) {
      return;
    }

    const autoMapping = {};
    csvHeaders.forEach((header) => {
      if (typeof header !== "string") return;

      const matchingField = standardFields.find((field) => {
        try {
          return (
            field.label.toLowerCase() === header.toLowerCase() ||
            field.key.toLowerCase() === header.toLowerCase()
          );
        } catch {
          return false;
        }
      });

      autoMapping[header] = matchingField ? matchingField.key : "";
    });

    setFieldMapping(autoMapping);
  }, [propIsOpen, csvHeaders, standardFields]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setTimeout(() => {
      onClose();
    }, 100);
  }, [onClose]);

  const handleFieldMappingChange = useCallback((csvHeader, purchaseField) => {
    setFieldMapping((prev) => ({
      ...prev,
      [csvHeader]: purchaseField,
    }));
  }, []);

  const getAvailableOptions = useCallback(
    (currentHeader) => {
      const usedFields = Object.entries(fieldMapping)
        .filter(([header, value]) => header !== currentHeader && value !== "")
        .map(([, value]) => value);

      return standardFields.filter((field) => !usedFields.includes(field.key));
    },
    [fieldMapping, standardFields],
  );

  const handleImport = useCallback(() => {
    const validMapping = Object.entries(fieldMapping)
      .filter(([, purchaseField]) => purchaseField !== "")
      .reduce((acc, [csvHeader, purchaseField]) => {
        acc[csvHeader] = purchaseField;
        return acc;
      }, {});

    onImport({ fieldMapping: validMapping });
    handleClose();
  }, [fieldMapping, onImport, handleClose]);

  const isValidMapping = useMemo(() => {
    const mapped = Object.values(fieldMapping).filter((v) => v !== "");
    return mapped.includes("vendorName") && mapped.includes("itemName");
  }, [fieldMapping]);

  if (!shouldRender) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10002] transition-opacity duration-300 ease-out"
        style={{ opacity: isOpen ? 1 : 0 }}
        onClick={handleClose}
      />

      <div className="fixed inset-0 z-[10003] flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-white w-full max-w-3xl rounded-xl shadow-2xl overflow-hidden flex flex-col pointer-events-auto transition-transform duration-300 transform max-h-[90vh]"
          style={{
            transform: isOpen ? "scale(100%)" : "scale(95%)",
            opacity: isOpen ? 1 : 0,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-6 overflow-hidden flex flex-col h-full">
            <div className="flex items-center justify-between mb-6 flex-shrink-0">
              <h2 className="text-xl font-bold font-sf text-gray-900">
                Import Purchases
              </h2>
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600 transition-colors bg-gray-100 hover:bg-gray-200 rounded-full p-1"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs font-bold">i</span>
                    </div>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-blue-800 font-inter">
                      Map the columns from your CSV/Excel file to the
                      corresponding fields. Rows that share the same Purchase
                      Number and Vendor Name are grouped into one purchase
                      with multiple line items.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <h3 className="text-base font-semibold text-gray-900 mb-2 font-inter">
                  Map Fields
                </h3>
                <p className="text-sm text-gray-500 mb-4 font-inter">
                  Review and confirm matching fields.
                </p>

                <div className="grid grid-cols-2 gap-8 mb-3 px-1">
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider font-inter">
                      File Headers
                    </h4>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider font-inter">
                      Purchase Fields
                    </h4>
                  </div>
                </div>

                <div className="space-y-3">
                  {csvHeaders.map((header, index) => {
                    const availableOptions = getAvailableOptions(header);

                    return (
                      <div
                        key={`${header}-${index}`}
                        className="grid grid-cols-2 gap-8 items-center bg-gray-50/50 p-2 rounded-lg border border-transparent hover:border-gray-200 transition-colors"
                      >
                        <div className="bg-white border border-gray-200 rounded-lg px-3 py-2.5 shadow-sm">
                          <span
                            className="text-sm text-gray-700 font-medium font-inter truncate block"
                            title={header}
                          >
                            {header}
                          </span>
                        </div>

                        <div>
                          <select
                            value={fieldMapping[header] || ""}
                            onChange={(e) =>
                              handleFieldMappingChange(header, e.target.value)
                            }
                            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm font-inter"
                          >
                            <option value="">
                              Don&apos;t Import This Column
                            </option>
                            {availableOptions.map((field) => (
                              <option key={field.key} value={field.key}>
                                {field.label}
                                {field.required && " *"}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-6 border-t border-gray-100 mt-2 flex-shrink-0">
              <button
                onClick={handleClose}
                className="bg-white border border-gray-300 text-gray-700 px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors font-inter"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={!isValidMapping || loading}
                title={!isValidMapping ? "Map both Vendor Name and Item Name to continue" : undefined}
                className={`px-5 py-2.5 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors shadow-sm font-inter ${
                  !isValidMapping || loading
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500"
                }`}
              >
                {loading ? "Importing..." : "Import Purchases"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default PurchaseFieldMappingModal;
