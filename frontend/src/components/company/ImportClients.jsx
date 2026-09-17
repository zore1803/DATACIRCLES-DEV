import ExcelIcon from "../common/ExcelIcon";
import DownloadIcon from "../common/DownloadIcon";
import React, { useState, useEffect } from "react";
import {
  AlertCircle,
  X,
  Copy,
  GitMerge,
} from "lucide-react";
import Papa from "papaparse";
import API from "../../services/api";
import FieldMappingModal from "./FieldMappingModal";
import UploadIcon from "../common/UploadIcon";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

function ImportClients({
  isOpen: propIsOpen,
  onClose,
  companyFieldNames,
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
  const [duplicateCheck, setDuplicateCheck] = useState(null); // { duplicates, pendingImport }
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  useBodyScrollLock(propIsOpen);

  // Reset form state each time the panel is opened.
  useEffect(() => {
    if (propIsOpen) {
      resetImport();
    }
  }, [propIsOpen]);

  // Cleanup progress simulation on component unmount
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
    setDuplicateCheck(null);
    setCheckingDuplicates(false);
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

  const handleImport = async ({ fieldMapping, includeFirstRow, template }) => {
    setLoading(true);
    setError("");
    setProgress(0);

    try {
      let dataToImport = [...csvData];
      console.log("Field mapping:", fieldMapping);
      console.log("Company field names:", companyFieldNames);

      const customFieldKeys = companyFieldNames.map((field) =>
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
              const fieldDef = companyFieldNames.find(
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

      const validCompanies = mappedData.filter((company, index) => {
        if (!company.name || company.name.trim() === "") {
          console.log(
            `Company at index ${index} has no name, skipping:`,
            company
          );
          return false;
        }
        if (!company.industry || company.industry.trim() === "") {
          console.log(
            `Company at index ${index} has no industry, skipping:`,
            company
          );
          return false;
        }
        return true;
      });

      console.log("Valid companies:", validCompanies);

      if (validCompanies.length === 0) {
        setError(
          "No valid companies found. Please ensure the 'Company Name' and 'Industry' field is properly mapped and contains data."
        );
        setLoading(false);
        setProgress(0);
        setTimeout(() => {
          onClose();
        }, 2500);
        return;
      }

      // Check for existing companies (case-insensitive exact name match)
      // before writing anything, so the user can choose to merge into them
      // instead of always creating fresh duplicate rows.
      setCheckingDuplicates(true);
      const dupRes = await API.post("/companies/check-duplicates", {
        names: validCompanies.map((c) => c.name),
      });
      setCheckingDuplicates(false);

      if (dupRes.data.duplicates?.length > 0) {
        setLoading(false);
        setProgress(0);
        setDuplicateCheck({
          duplicates: dupRes.data.duplicates,
          pendingImport: { validCompanies, template },
        });
        return;
      }

      await runImport(validCompanies, template, "duplicate");
    } catch (err) {
      console.error("Import error:", err);
      setError(
        err.response?.data?.error ||
          "Import failed. Please check your data and try again."
      );
      clearInterval(window.progressInterval);
      setProgress(0);
      setCheckingDuplicates(false);
      setTimeout(() => {
        handleClose();
      }, 2000);
    } finally {
      setLoading(false);
    }
  };

  // Actually posts the import, once any duplicate-handling choice has been
  // made (or there were no duplicates to begin with).
  const runImport = async (validCompanies, template, duplicateAction) => {
    setLoading(true);
    setError("");

    try {
      const payload = {
        companies: validCompanies,
        template,
        duplicateAction,
      };

      setProgress(50);
      let simulatedProgress = 50;
      window.progressInterval = setInterval(() => {
        simulatedProgress = Math.min(simulatedProgress + 5, 80);
        setProgress(simulatedProgress);
      }, 500);

      const response = await API.post("/companies/bulk-import", payload);
      console.log("Backend response:", response.data);

      clearInterval(window.progressInterval);
      setProgress(100);

      const { imported, merged, total, errors } = response.data;

      if (errors && errors.length > 0) {
        setSuccess(
          `Imported ${imported}${merged ? `, merged ${merged}` : ""} out of ${total} companies. ${errors.length} failed.`
        );
        console.warn("Import errors:", errors);
      } else if (merged > 0) {
        setSuccess(`Imported ${imported} new companies, merged ${merged} existing`);
      } else {
        setSuccess(`Successfully imported ${imported} companies`);
      }

      setShowMapping(false);
      setDuplicateCheck(null);
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

  // Function to download sample CSV
  const downloadSampleCSV = (type) => {
    let csvContent;
    let fileName;

    if (type === "basic") {
      csvContent = `Company Name,Industry,Address,Website
Tech Innovations Ltd,Technology,"123 Innovation St, Tech City",www.techinnovations.com
Green Energy Corp,Energy,"456 Green Ave, Eco Town",www.greenenergy.com
HealthCare Solutions,Healthcare,"789 Health Blvd, Med City",www.healthcaresolutions.com`;
      fileName = "basic_company_import_template.csv";
    } else {
      csvContent = `Company Name,Industry,Address,Website,Employee Count,Annual Revenue,Founded Year
Tech Innovations Ltd,Technology,"123 Innovation St, Tech City",www.techinnovations.com,150,5000000,2010
Green Energy Corp,Energy,"456 Green Ave, Eco Town",www.greenenergy.com,200,7500000,2015
HealthCare Solutions,Healthcare,"789 Health Blvd, Med City",www.healthcaresolutions.com,100,3000000,2018`;
      fileName = "extended_company_import_template.csv";
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
      {/* Background Overlay */}
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[10000] animate-fadeIn"
        onClick={handleClose}
      />

      <div className="fixed dc-panel-card dc-panel-w bg-white shadow-2xl z-[10001] flex flex-col overflow-hidden animate-slideInRight">
        <div className="p-6 overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">
              Import Companies from CSV
            </h2>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              disabled={loading}
            >
              <X size={24} />
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
              <p className="text-sm text-gray-600 mt-2">
                Importing... {progress}% done
              </p>
            </div>
          )}

          {/* File Upload Area */}
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

          {/* Download Sample CSV Links */}
          <div className="mb-6">
            <h4 className="text-sm font-medium text-gray-900 mb-2">
              Download Sample Templates
            </h4>
            <div className="flex space-x-4">
              <button
                onClick={() => downloadSampleCSV("basic")}
                className="flex items-center text-sm cursor-pointer text-blue-600 hover:text-blue-800 transition-colors"
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

          {/* Instructions */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
            <h4 className="text-sm font-medium text-gray-900 mb-2">
              Import Instructions:
            </h4>
            <ul className="text-xs text-gray-600 space-y-1">
              <li>• Your CSV should include column headers in the first row</li>
              <li>
                • Supported fields: Company Name, Industry, Address, Website
              </li>
              <li>
                • Custom fields will be automatically mapped if column names
                match
              </li>
              <li>• You'll be able to map fields manually after file upload</li>
              <li>
                • Download the sample templates above to see the expected format
              </li>
            </ul>
          </div>

          {/* Alerts */}
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

          {/* Action Buttons */}
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

        {/* Field Mapping Modal */}
        <FieldMappingModal
          isOpen={showMapping}
          onClose={() => setShowMapping(false)}
          csvHeaders={csvHeaders}
          companyFieldNames={companyFieldNames}
          onImport={handleImport}
          loading={loading || checkingDuplicates}
        />

        {/* Duplicate resolution prompt */}
        {duplicateCheck && (
          <>
            <div
              className="fixed inset-0 bg-black/40 z-[10002] flex items-center justify-center p-4"
              onClick={() => setDuplicateCheck(null)}
            >
              <div
                className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {duplicateCheck.duplicates.length} duplicate{" "}
                  {duplicateCheck.duplicates.length === 1 ? "company" : "companies"} found
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  {duplicateCheck.duplicates.length} of{" "}
                  {duplicateCheck.pendingImport.validCompanies.length} companies in this file
                  already exist (matched by name). What would you like to do with them?
                </p>
                <div className="max-h-32 overflow-y-auto bg-gray-50 border border-gray-200 rounded-lg p-3 mb-5 text-sm text-gray-700 space-y-1">
                  {duplicateCheck.duplicates.map((d) => (
                    <div key={d.existingId}>{d.existingName}</div>
                  ))}
                </div>
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      const { validCompanies, template } = duplicateCheck.pendingImport;
                      setDuplicateCheck(null);
                      runImport(validCompanies, template, "merge");
                    }}
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                  >
                    <GitMerge className="w-4 h-4" />
                    Merge into existing companies
                  </button>
                  <button
                    onClick={() => {
                      const { validCompanies, template } = duplicateCheck.pendingImport;
                      setDuplicateCheck(null);
                      runImport(validCompanies, template, "duplicate");
                    }}
                    className="w-full flex items-center justify-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                    Create as duplicates anyway
                  </button>
                  <button
                    onClick={() => setDuplicateCheck(null)}
                    className="w-full text-center text-sm text-gray-500 hover:text-gray-700 pt-1"
                  >
                    Cancel
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-3">
                  Merge only fills in fields that are currently empty on the existing company —
                  it never overwrites data that's already there.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default ImportClients;
