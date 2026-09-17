import FieldMappingHelp from "../common/FieldMappingHelp";
import Checkbox from "../common/Checkbox";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { X } from "lucide-react";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

const VendorFieldMappingModal = ({
  isOpen: propIsOpen,
  onClose,
  csvHeaders,
  vendorFieldNames,
  onImport,
  loading,
}) => {
  const [fieldMapping, setFieldMapping] = useState({});
  const [includeFirstRow, setIncludeFirstRow] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  useBodyScrollLock(isOpen);

  // Standard CRM fields for vendors - memoize to prevent recreating
  const standardFields = useMemo(() => [
    { key: "name", label: "Name", required: true },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email" },
    { key: "company", label: "Company" },
    { key: "gstin", label: "GSTIN" },
    { key: "address.line1", label: "Address Line 1" },
    { key: "address.line2", label: "Address Line 2" },
    { key: "address.city", label: "City" },
    { key: "address.state", label: "State" },
    { key: "address.pincode", label: "Pincode" },
    { key: "address.country", label: "Country" },
    { key: "balance", label: "Balance" },
  ], []);

  // Normalize vendorFieldNames - memoize to prevent infinite loops
  const normalizedVendorFields = useMemo(() => {
    if (!Array.isArray(vendorFieldNames)) return [];
    
    return vendorFieldNames.map(field => {
      if (typeof field === 'string') {
        return { key: field, label: field, isCustomField: true };
      } else if (field && typeof field === 'object') {
        return {
          key: field.name || field.key || '',
          label: field.name || field.label || '',
          isCustomField: true,
          type: field.type || 'text',
          required: field.required || false
        };
      }
      return null;
    }).filter(field => field && field.key && field.label);
  }, [vendorFieldNames]);

  // All available fields - memoize to prevent recreating
  const allAvailableFields = useMemo(() => [
    ...standardFields,
    ...normalizedVendorFields
  ], [standardFields, normalizedVendorFields]);

  // Handle modal opening/closing animation
  useEffect(() => {
    if (propIsOpen) {
      setShouldRender(true);
      setTimeout(() => setIsOpen(true), 10);
    } else {
      setIsOpen(false);
      setTimeout(() => {
        setShouldRender(false);
      }, 300);
    }
  }, [propIsOpen]);

  // Auto-map fields when modal opens - fix infinite loop issue
  useEffect(() => {
    if (!propIsOpen || csvHeaders.length === 0 || allAvailableFields.length === 0) {
      return;
    }

    const autoMapping = {};
    csvHeaders.forEach(header => {
      if (typeof header !== 'string') return;
      
      const matchingField = allAvailableFields.find(field => {
        if (!field.label || typeof field.label !== 'string') return false;
        
        try {
          return field.label.toLowerCase() === header.toLowerCase() ||
                 (field.key && field.key.toLowerCase() === header.toLowerCase());
        } catch (e) {
          return false;
        }
      });
      
      autoMapping[header] = matchingField ? matchingField.key : "";
    });

    // Only update if mapping actually changed
    setFieldMapping(prevMapping => {
      const hasChanged = Object.keys(autoMapping).some(
        key => prevMapping[key] !== autoMapping[key]
      );
      
      if (hasChanged) {
        return autoMapping;
      }
      return prevMapping;
    });
  }, [propIsOpen, csvHeaders, allAvailableFields]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setTimeout(() => {
      onClose();
    }, 300);
  }, [onClose]);

  const handleFieldMappingChange = useCallback((csvHeader, crmField) => {
    setFieldMapping(prev => ({
      ...prev,
      [csvHeader]: crmField
    }));
  }, []);

  // Memoize available options to prevent recalculation
  const getAvailableOptions = useCallback((currentHeader) => {
    const usedFields = Object.entries(fieldMapping)
      .filter(([header, value]) => header !== currentHeader && value !== "")
      .map(([_, value]) => value);
    
    return allAvailableFields.filter(field => 
      field.key && !usedFields.includes(field.key)
    );
  }, [fieldMapping, allAvailableFields]);

  const handleImport = useCallback(() => {
    const validMapping = Object.entries(fieldMapping)
      .filter(([_, crmField]) => crmField !== "")
      .reduce((acc, [csvHeader, crmField]) => {
        acc[csvHeader] = crmField;
        return acc;
      }, {});

    onImport({
      fieldMapping: validMapping,
      includeFirstRow,
    });
    handleClose();
  }, [fieldMapping, includeFirstRow, onImport]);

  const isValidMapping = useMemo(() => {
    const mappedFields = Object.values(fieldMapping).filter(value => value !== "");
    return mappedFields.length > 0;
  }, [fieldMapping]);

  if (!shouldRender) return null;

  return (
    <>
      {/* Background Overlay */}
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[10000] transition-opacity duration-300 ease-in-out"
        style={{ opacity: isOpen ? 1 : 0 }}
        onClick={handleClose}
      />
      
      {/* Sliding Modal */}
      <div
        className={`fixed dc-panel-card dc-panel-w z-[10001] bg-white shadow-2xl overflow-y-auto transform transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"
        }`}
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">
              Import Vendors
            </h2>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          <FieldMappingHelp />

          {/* Map Fields Section */}
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Map Fields</h3>
            <p className="text-sm text-gray-600 mb-4">
              Map file columns to CRM fields individually.
            </p>

            {/* Headers Row */}
            <div className="grid grid-cols-2 gap-8 mb-4">
              <div>
                <h4 className="text-sm font-medium text-gray-700">
                  CSV or XLS (Excel) Headers
                </h4>
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-700">
                  CRM Fields
                </h4>
              </div>
            </div>

            {/* Include First Row Checkbox */}
            {/* <div className="mb-4">
              <label className="flex items-center">
                <Checkbox checked={includeFirstRow} onChange={(e) => setIncludeFirstRow(e.target.checked)} />
                <span className="ml-2 text-sm text-blue-600">
                  Include First(Header) Row of CSV or XLS (Excel) file.
                </span>
              </label>
            </div> */}

            {/* Field Mapping */}
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {csvHeaders.map((header, index) => {
                const availableOptions = getAvailableOptions(header);
                
                return (
                  <div key={`${header}-${index}`} className="grid grid-cols-2 gap-8 items-center">
                    {/* CSV Header */}
                    <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                      <span className="text-sm text-gray-700 font-medium">
                        {header}
                      </span>
                      {header.toLowerCase().includes('name') && (
                        <span className="text-xs text-gray-500 ml-1">(Vendor Name)</span>
                      )}
                      {header.toLowerCase().includes('phone') && (
                        <span className="text-xs text-gray-500 ml-1">(123-456-7890)</span>
                      )}
                      {header.toLowerCase().includes('email') && (
                        <span className="text-xs text-gray-500 ml-1">(vendor@example.com)</span>
                      )}
                      {header.toLowerCase().includes('company') && (
                        <span className="text-xs text-gray-500 ml-1">(Example Corp)</span>
                      )}
                      {header.toLowerCase().includes('gstin') && (
                        <span className="text-xs text-gray-500 ml-1">(GSTIN Number)</span>
                      )}
                      {header.toLowerCase().includes('city') && (
                        <span className="text-xs text-gray-500 ml-1">(City)</span>
                      )}
                      {header.toLowerCase().includes('state') && (
                        <span className="text-xs text-gray-500 ml-1">(State)</span>
                      )}
                      {header.toLowerCase().includes('pincode') && (
                        <span className="text-xs text-gray-500 ml-1">(Pincode)</span>
                      )}
                      {header.toLowerCase().includes('country') && (
                        <span className="text-xs text-gray-500 ml-1">(Country)</span>
                      )}
                      {header.toLowerCase().includes('balance') && (
                        <span className="text-xs text-gray-500 ml-1">(1000)</span>
                      )}
                    </div>

                    {/* CRM Field Mapping */}
                    <div>
                      <select
                        value={fieldMapping[header] || ""}
                        onChange={(e) => handleFieldMappingChange(header, e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm"
                      >
                        <option value="">Don&apos;t Import This Column</option>
                        {availableOptions.map((field) => (
                          <option key={field.key} value={field.key}>
                            {field.label}
                            {field.isCustomField && " (Custom Field)"}
                            {field.type && field.type !== 'text' && ` (${field.type})`}
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

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-3 pt-6 border-t border-gray-200 mt-6">
            <button
              onClick={handleClose}
              className="bg-gray-200 text-gray-800 px-6 py-2 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors shadow-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={!isValidMapping || loading}
              className={`px-6 py-2 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors shadow-sm ${
                !isValidMapping || loading
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-green-600 hover:bg-green-700 focus:ring-green-500"
              }`}
            >
              {loading ? "Importing..." : "Import Vendors"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default VendorFieldMappingModal;