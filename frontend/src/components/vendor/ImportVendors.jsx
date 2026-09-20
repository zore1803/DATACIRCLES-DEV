import ExcelIcon from "../common/ExcelIcon";
import DownloadIcon from "../common/DownloadIcon";
import React, { useState, useEffect } from "react";
import {
  AlertCircle,
  X,
} from "lucide-react";
import Papa from "papaparse";
import API from "../../services/api";
import VendorFieldMappingModal from "./VendorFieldMappingModal";
import UploadIcon from "../common/UploadIcon";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

function ImportVendors({
  isOpen: propIsOpen,
  onClose,
  vendorFieldNames,
  onImportSuccess,
}) {
  const [file, setFile] = useState(null);
  const [csvData, setCsvData] = useState([]);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [showMapping, setShowMapping] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dragActive, setDragActive] = useState(false);

  useBodyScrollLock(propIsOpen);

  useEffect(() => {
    if (propIsOpen) {
      resetImport();
    }
  }, [propIsOpen]);

  useEffect(() => {
    return () => {
      clearInterval(window.progressInterval);
    };
  }, []);

  const handleClose = () => {
    onClose();
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
    console.log("Parsing CSV file:", file.name);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      complete: (results) => {
        console.log("Papa Parse results:", results);
        console.log("Parse errors:", results.errors);
        console.log("Parse meta:", results.meta);

        if (results.errors.length > 0) {
          console.error("CSV parsing errors:", results.errors);
          const firstError =
            results.errors[0]?.message || "Unknown parsing error";
          setError(
            `Error parsing CSV file: ${firstError}${
              results.errors.length > 1
                ? " (and " + (results.errors.length - 1) + " more errors)"
                : ""
            }`
          );
          return;
        }

        if (!results.data || results.data.length === 0) {
          setError("CSV file appears to be empty or invalid");
          return;
        }

        const headers = Object.keys(results.data[0] || {});
        console.log("Extracted headers:", headers);
        console.log("Sample data rows:", results.data.slice(0, 3));

        setCsvHeaders(headers);
        setCsvData(results.data);
        setShowMapping(true);
      },
      error: (error) => {
        console.error("Papa Parse error:", error);
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
    setProgress(0);

    try {
      let dataToImport = [...csvData];

      console.log("Field mapping:", fieldMapping);
      console.log("Vendor field names:", vendorFieldNames);

      const customFieldKeys = vendorFieldNames.map((field) =>
        typeof field === "string" ? field : field.name || field.key
      );

      const mappedData = [];
      const totalRows = dataToImport.length;

      for (let index = 0; index < dataToImport.length; index++) {
        const row = dataToImport[index];
        console.log(`Processing row ${index + 1}:`, row);

        const mappedRow = {};
        const additionalFields = [];
        let hasValidData = false;

        Object.entries(fieldMapping).forEach(([csvHeader, crmField]) => {
          const value = row[csvHeader];
          console.log(`  Mapping ${csvHeader} -> ${crmField}: "${value}"`);

          if (
            value !== undefined &&
            value !== null &&
            String(value).trim() !== ""
          ) {
            hasValidData = true;

            if (customFieldKeys.includes(crmField)) {
              const fieldDef = vendorFieldNames.find(
                (f) =>
                  (typeof f === "string" ? f : f.name || f.key) === crmField
              );

              additionalFields.push({
                key: crmField,
                value: String(value).trim(),
                type:
                  fieldDef && typeof fieldDef === "object"
                    ? fieldDef.type || "string"
                    : "string",
              });
            } else if (crmField.includes(".")) {
              const [parent, child] = crmField.split(".");
              if (!mappedRow[parent]) mappedRow[parent] = {};
              mappedRow[parent][child] = String(value).trim();
            } else if (crmField === "balance") {
              mappedRow.balance = parseFloat(value) || 0;
            } else {
              mappedRow[crmField] = String(value).trim();
            }
          }
        });

        if (additionalFields.length > 0) {
          mappedRow.additionalFields = additionalFields;
        }

        if (hasValidData) {
          console.log(`  Mapped row ${index + 1}:`, mappedRow);
          mappedData.push(mappedRow);
        } else {
          console.log(`  Skipping empty row ${index + 1}`);
        }

        const progressPercentage = Math.min(
          50,
          Math.round(((index + 1) / totalRows) * 50)
        );
        setProgress(Math.max(progressPercentage, 20));
      }

      console.log("All mapped data:", mappedData);

      const validVendors = mappedData.filter((vendor, index) => {
        if (!vendor.name || vendor.name.trim() === "") {
          console.log(
            `Vendor at index ${index} has no name, skipping:`,
            vendor
          );
          return false;
        }
        return true;
      });

      console.log("Valid vendors:", validVendors);

      if (validVendors.length === 0) {
        setError(
          "No valid vendors found. Please ensure the 'Name' field is properly mapped and contains data."
        );
        setLoading(false);
        setProgress(0);

        setTimeout(() => {
          onclose();
        }, 2500);
        return;
      }

      const payload = {
        vendors: validVendors,
      };

      console.log("Final payload:", payload);

      setProgress(50);
      let simulatedProgress = 50;
      window.progressInterval = setInterval(() => {
        simulatedProgress = Math.min(simulatedProgress + 5, 80);
        setProgress(simulatedProgress);
      }, 500);

      const response = await API.post("/vendors/bulk-import", payload);
      console.log("Backend response:", response.data);

      clearInterval(window.progressInterval);
      setProgress(100);

      const { imported, total, errors } = response.data;

      if (errors && errors.length > 0) {
        setSuccess(
          `Successfully imported ${imported} out of ${total} vendors. ${errors.length} failed.`
        );
        console.warn("Import errors:", errors);
      } else {
        setSuccess(`Successfully imported ${imported} vendors`);
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
      }, 2000);
    } catch (err) {
      console.error("Import error:", err);
      setError(
        err.response?.data?.error ||
          "Import failed. Please check your data and try again."
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

  const downloadSampleCSV = (type) => {
    let csvContent;
    let fileName;

    if (type === "basic") {
      csvContent = `Name,Phone,Email,Company,GSTIN,Address Line 1,Address Line 2,City,State,Pincode,Country,Balance
"Vendor A","1234567890","vendor.a@example.com","Acme Inc.","22ABCDE1234F1Z5","123 Main St","Suite 100","Mumbai","Maharashtra","400001","India","5000"
"Vendor B","0987654321","vendor.b@example.com","Tech Corp","33FGHIJ5678K2Y6","456 Oak Ave","","Delhi","Delhi","110001","India","7500"
"Vendor C","1122334455","vendor.c@example.com","Global LLC","44KLMNO9012P3X7","789 Pine Rd","Floor 2","Bengaluru","Karnataka","560001","India","2500"`;
      fileName = "basic_vendor_import_template.csv";
    } else {
      csvContent = `Name,Phone,Email,Company,GSTIN,Address Line 1,Address Line 2,City,State,Pincode,Country,Balance,Notes,Category
"Vendor A","1234567890","vendor.a@example.com","Acme Inc.","22ABCDE1234F1Z5","123 Main St","Suite 100","Mumbai","Maharashtra","400001","India","5000","Preferred supplier for electronics","Electronics"
"Vendor B","0987654321","vendor.b@example.com","Tech Corp","33FGHIJ5678K2Y6","456 Oak Ave","","Delhi","Delhi","110001","India","7500","Contract renewed 2025","Software"
"Vendor C","1122334455","vendor.c@example.com","Global LLC","44KLMNO9012P3X7","789 Pine Rd","Floor 2","Bengaluru","Karnataka","560001","India","2500","Pending payment approval","Consulting"`;
      fileName = "extended_vendor_import_template.csv";
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

  if (!propIsOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[10000] animate-fadeIn"
        onClick={handleClose}
      />

      <div className="fixed dc-panel-card dc-panel-w bg-white shadow-2xl z-[10001] flex flex-col overflow-hidden animate-slideInRight">
        <div className="p-6 overflow-y-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">
              Import Vendors from CSV
            </h2>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              disabled={loading}
            >
              <X size={24} />
            </button>
          </div>

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
              <p className="text-sm text-gray-600 mt-2">
                Importing... {progress}% done
              </p>
            </div>
          )}

          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors mb-6 ${
              dragActive
                ? "border-blue-500 bg-blue-50"
                : "border-gray-300 hover:border-gray-400"
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
                    <span className="font-medium">Click to upload</span> or drag
                    and drop
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
                className={`bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 cursor-pointer transition-colors shadow-sm ${
                  loading ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                Choose File
              </label>
            </div>
          </div>

          <div className="mb-6">
            <h4 className="text-sm font-medium text-gray-900 mb-2">
              Download Sample Templates
            </h4>
            <div className="flex space-x-4">
              <button
                onClick={() => downloadSampleCSV("basic")}
                className="flex items-center text-sm text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
                disabled={loading}
              >
                <DownloadIcon className="w-4 h-4 mr-2" />
                Basic Template
              </button>
              {/* <button
                onClick={() => downloadSampleCSV("extended")}
                className="flex items-center text-sm text-blue-600 hover:text-blue-800 transition-colors"
                disabled={loading}
              >
                <DownloadIcon className="w-4 h-4 mr-2" />
                Extended Template (with Custom Fields)
              </button> */}
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
            <h4 className="text-sm font-medium text-gray-900 mb-2">
              Import Instructions:
            </h4>
            <ul className="text-xs text-gray-600 space-y-1">
              <li>• Your CSV should include column headers in the first row</li>
              <li>• Required field: Name</li>
              <li>
                • Supported fields: Name, Phone, Email, Company, GSTIN, Address
                Line 1, Address Line 2, City, State, Pincode, Country, Balance
              </li>
              <li>
                • Custom fields will be automatically mapped if column names
                match
              </li>
              <li>
                • Download the sample templates above to see the expected format
              </li>
            </ul>
          </div>

          {error && (
            <div className="mb-4 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded flex items-center">
              <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 text-sm text-green-600 bg-green-50 border border-green-200 rounded">
              {success}
            </div>
          )}

          <div className="flex items-center justify-end space-x-3 pt-6 border-t border-gray-200 mt-6">
            <button
              onClick={handleClose}
              className={`bg-gray-200 text-gray-800 px-6 py-2 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors shadow-sm ${
                loading ? "opacity-50 cursor-not-allowed" : ""
              }`}
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </div>

        <VendorFieldMappingModal
          isOpen={showMapping}
          onClose={() => setShowMapping(false)}
          csvHeaders={csvHeaders}
          vendorFieldNames={vendorFieldNames}
          onImport={handleImport}
          loading={loading}
        />
      </div>
    </>
  );
}

export default ImportVendors;
