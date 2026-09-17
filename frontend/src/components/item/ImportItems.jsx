import ExcelIcon from "../common/ExcelIcon";
import DownloadIcon from "../common/DownloadIcon";
import React, { useState, useEffect } from "react";
import {
  AlertCircle,
  X,
} from "lucide-react";
import Papa from "papaparse";
import API from "../../services/api";
import ItemFieldMappingModal from "./ItemFieldMappingModal";
import UploadIcon from "../common/UploadIcon";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

function ImportItems({ isOpen: propIsOpen, onClose, onImportSuccess }) {
  useBodyScrollLock(propIsOpen);
  const [file, setFile] = useState(null);
  const [csvData, setCsvData] = useState([]);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [showMapping, setShowMapping] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  // Handle modal opening/closing animation
  useEffect(() => {
    if (propIsOpen) {
      setShouldRender(true);
      setTimeout(() => setIsOpen(true), 10);
    } else {
      setIsOpen(false);
      setTimeout(() => {
        setShouldRender(false);
        resetImport();
      }, 300);
    }
  }, [propIsOpen]);

  // Cleanup progress simulation on component unmount
  useEffect(() => {
    return () => {
      clearInterval(window.progressInterval);
    };
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  const resetImport = () => {
    setFile(null);
    setCsvData([]);
    setCsvHeaders([]);
    setShowMapping(false);
    setError("");
    setSuccess("");
    setLoading(false);
    setProgress(0);
    clearInterval(window.progressInterval);
  };

  const handleFileChange = (selectedFile) => {
    if (!selectedFile) return;

    const fileType = selectedFile.type;
    const fileName = selectedFile.name.toLowerCase();

    if (
      !fileType.includes("csv") &&
      !fileType.includes("excel") &&
      !fileType.includes("spreadsheet") &&
      !fileName.endsWith(".csv") &&
      !fileName.endsWith(".xlsx") &&
      !fileName.endsWith(".xls")
    ) {
      setError("Please select a CSV or Excel file");
      return;
    }

    setFile(selectedFile);
    setError("");
    parseCSV(selectedFile);
  };

  const parseCSV = (file) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      complete: (results) => {
        if (results.errors.length > 0) {
          const firstError =
            results.errors[0]?.message || "Unknown parsing error";
          setError(
            `Error parsing CSV file: ${firstError}${
              results.errors.length > 1
                ? " (and " + (results.errors.length - 1) + " more errors)"
                : ""
            }`,
          );
          return;
        }

        if (!results.data || results.data.length === 0) {
          setError("CSV file appears to be empty or invalid");
          return;
        }

        const headers = Object.keys(results.data[0] || {});
        setCsvHeaders(headers);
        setCsvData(results.data);
        setShowMapping(true);
      },
      error: (error) => {
        setError("Failed to parse CSV file: " + error.message);
      },
    });
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleImport = async ({ fieldMapping, includeFirstRow }) => {
    setLoading(true);
    setError("");
    setSuccess("");
    setProgress(0);

    try {
      const mappedData = [];
      const totalRows = csvData.length;

      for (let index = 0; index < csvData.length; index++) {
        const row = csvData[index];
        const mappedRow = {};
        let hasValidData = false;

        Object.entries(fieldMapping).forEach(([csvHeader, crmField]) => {
          const value = row[csvHeader];

          if (
            value !== undefined &&
            value !== null &&
            String(value).trim() !== ""
          ) {
            hasValidData = true;

            if (crmField === "purchasePrice" || crmField === "sellingPrice") {
              mappedRow[crmField] = parseFloat(value) || 0;
            } else if (crmField === "taxInclusive" || crmField === "isActive") {
              const boolValue = String(value).toLowerCase();
              mappedRow[crmField] =
                boolValue === "true" ||
                boolValue === "1" ||
                boolValue === "yes";
            } else if (crmField === "type") {
              const typeValue = String(value).toLowerCase();
              mappedRow[crmField] = ["product", "service"].includes(typeValue)
                ? typeValue
                : "product";
            } else {
              mappedRow[crmField] = String(value).trim();
            }
          }
        });

        if (hasValidData && mappedRow.name && mappedRow.name.trim()) {
          mappedData.push(mappedRow);
        }

        const progressPercentage = Math.min(
          50,
          Math.round(((index + 1) / totalRows) * 50),
        );
        setProgress(Math.max(progressPercentage, 20));
      }

      if (mappedData.length === 0) {
        setError(
          "No valid items found. Please ensure the 'Name' field is properly mapped and contains data.",
        );
        setLoading(false);
        setProgress(0);
        setTimeout(() => {
          onClose();
        }, 2500);
        return;
      }

      const payload = { items: mappedData };

      setProgress(50);
      let simulatedProgress = 50;
      window.progressInterval = setInterval(() => {
        simulatedProgress = Math.min(simulatedProgress + 5, 80);
        setProgress(simulatedProgress);
      }, 500);

      const response = await API.post("/items/bulk-import", payload);

      clearInterval(window.progressInterval);
      setProgress(100);

      const { imported, total, errors } = response.data;

      if (errors && errors.length > 0) {
        setSuccess(
          `Successfully imported ${imported} out of ${total} items. ${errors.length} failed.`,
        );
      } else {
        setSuccess(`Successfully imported ${imported} items`);
      }

      setShowMapping(false);
      setFile(null);
      setCsvData([]);
      setCsvHeaders([]);

      if (onImportSuccess) {
        onImportSuccess();
      }

      setTimeout(() => {
        handleClose();
      }, 3000);
    } catch (err) {
      setError(
        err.response?.data?.error ||
          "Import failed. Please check your data and try again.",
      );
      clearInterval(window.progressInterval);
      setProgress(0);
      setTimeout(() => {
        handleClose();
      }, 2000);
    } finally {
      setLoading(false);
    }
  };

  // Function to download sample CSV
  const downloadSampleCSV = (type) => {
    let csvContent;
    let fileName;

    if (type === "basic") {
      csvContent = `Name,Type,Purchase Price,Selling Price,Tax Inclusive,Is Active
"Widget A",product,50.00,100.00,true,true
"Service B",service,0.00,200.00,false,true
"Widget C",product,75.00,150.00,true,false`;
      fileName = "basic_item_import_template.csv";
    } else {
      csvContent = `Name,Type,Purchase Price,Selling Price,Tax Inclusive,Is Active,SKU,Category,Description
"Widget A",product,50.00,100.00,true,true,SKU123,Electronics,"High-quality widget for industrial use"
"Service B",service,0.00,200.00,false,true,SVC456,Consulting,"Professional consulting service"
"Widget C",product,75.00,150.00,true,false,SKU789,Hardware,"Durable hardware component"`;
      fileName = "extended_item_import_template.csv";
    }

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!shouldRender) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[10000] transition-opacity duration-300"
        style={{ opacity: isOpen ? 1 : 0 }}
        onClick={handleClose}
      >
        {/* Right-anchored slide-in panel — same dc-panel-card/dc-panel-w
            convention as ImportClients.jsx (Companies), ImportContacts.jsx,
            ImportDeals.jsx and ImportVendors.jsx, instead of the old
            centered modal this file used to open with. */}
        <div
          className="fixed dc-panel-card dc-panel-w bg-white shadow-2xl z-[10001] overflow-hidden flex flex-col transition-transform duration-300"
          style={{ transform: isOpen ? "translateX(0)" : "translateX(calc(100% + 2rem))" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-6 overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold font-sf text-gray-900">
                Import Items from CSV
              </h2>
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600 transition-colors bg-gray-100 hover:bg-gray-200 rounded-full p-1"
                disabled={loading}
              >
                <X size={20} />
              </button>
            </div>

            {/* Loading Indicator */}
            {loading && (
              <div className="mb-6">
                <div className="bg-gray-200 rounded-full h-3 w-full overflow-hidden">
                  <div
                    className="bg-blue-600 h-3 rounded-full transition-all duration-500 ease-in-out"
                    style={{ width: `${progress}%` }}
                    role="progressbar"
                    aria-valuenow={progress}
                    aria-valuemin="0"
                    aria-valuemax="100"
                  />
                </div>
                <p className="text-sm text-gray-600 mt-2 font-inter">
                  Importing... {progress}% done
                </p>
              </div>
            )}

            {/* File Upload Area */}
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors mb-6 font-inter ${
                dragActive
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-gray-400"
              } ${loading ? "opacity-50 pointer-events-none" : ""}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <div className="flex flex-col items-center">
                {file ? (
                  <>
                    <ExcelIcon className="w-12 h-12 text-green-500 mb-3" />
                    <p className="text-sm text-gray-700 mb-2">
                      <span className="font-medium">{file.name}</span>
                    </p>
                    <p className="text-xs text-gray-500 mb-4">
                      {csvHeaders.length > 0 &&
                        `${csvHeaders.length} columns detected`}
                    </p>
                  </>
                ) : (
                  <>
                    <UploadIcon className="w-12 h-12 text-gray-400 mb-3" />
                    <p className="text-sm text-gray-700 mb-2">
                      <span className="font-medium">Click to upload</span> or
                      drag and drop
                    </p>
                    <p className="text-xs text-gray-500 mb-4">
                      CSV, XLS, or XLSX files only
                    </p>
                  </>
                )}

                <input
                  type="file"
                  onChange={(e) => handleFileChange(e.target.files[0])}
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  id="file-upload-import"
                  disabled={loading}
                />
                <label
                  htmlFor="file-upload-import"
                  className={`bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 cursor-pointer transition-colors shadow-sm ${
                    loading ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                >
                  Choose File
                </label>
              </div>
            </div>

            {/* Download Sample CSV Links */}
            <div className="mb-6 font-inter">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">
                Download Sample Templates
              </h4>
              <div className="flex space-x-4">
                <button
                  onClick={() => downloadSampleCSV("basic")}
                  className="flex items-center text-sm text-blue-600 hover:text-blue-800 transition-colors cursor-pointer bg-blue-50 px-3 py-2 rounded-lg"
                  disabled={loading}
                >
                  <DownloadIcon className="w-4 h-4 mr-2" />
                  Basic Template
                </button>
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6 font-inter">
              <h4 className="text-sm font-semibold text-gray-900 mb-2">
                Import Instructions:
              </h4>
              <ul className="text-xs text-gray-600 space-y-1.5">
                <li>
                  • Your CSV should include column headers in the first row
                </li>
                <li>• Required field: Name</li>
                <li>
                  • Type should be "product" or "service" (defaults to
                  "product")
                </li>
                <li>• Prices should be numeric values</li>
                <li>
                  • Boolean fields (Tax Inclusive, Is Active) accept:
                  true/false, 1/0, yes/no
                </li>
              </ul>
            </div>

            {/* Alerts */}
            {error && (
              <div className="mb-4 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg flex items-center font-inter">
                <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                {error}
              </div>
            )}

            {success && (
              <div className="mb-4 p-3 text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg font-inter">
                {success}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end space-x-3 pt-6 border-t border-gray-100 mt-2 font-inter">
              <button
                onClick={handleClose}
                className={`bg-white border border-gray-300 text-gray-700 px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors ${
                  loading ? "opacity-50 cursor-not-allowed" : ""
                }`}
                disabled={loading}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>

        {/* Field Mapping Modal */}
        <ItemFieldMappingModal
          isOpen={showMapping}
          onClose={() => setShowMapping(false)}
          csvHeaders={csvHeaders}
          onImport={handleImport}
          loading={loading}
        />
      </div>
    </>
  );
}

export default ImportItems;
