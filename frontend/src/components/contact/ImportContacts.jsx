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
import ContactFieldMappingModal from "./ContactFieldMappingModal";
import UploadIcon from "../common/UploadIcon";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

function ImportContacts({
  isOpen: propIsOpen,
  onClose,
  contactFieldNames,
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

  const handleImport = async ({ fieldMapping, includeFirstRow }) => {
    setLoading(true);
    setError("");
    setSuccess("");
    setProgress(0);

    try {
      let dataToImport = [...csvData];
      console.log("Field mapping:", fieldMapping);
      console.log("Contact field names:", contactFieldNames);

      const customFieldKeys = contactFieldNames.map((field) =>
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
              const fieldDef = contactFieldNames.find(
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

      const validContacts = mappedData.filter((contact, index) => {
        if (!contact.name || contact.name.trim() === "") {
          console.log(
            `Contact at index ${index} has no name, skipping:`,
            contact
          );
          return false;
        }
        return true;
      });

      console.log("Valid contacts:", validContacts);

      if (validContacts.length === 0) {
        setError(
          "No valid contacts found. Please ensure the 'Name' field is properly mapped and contains data."
        );
        setLoading(false);
        setProgress(0);
        setTimeout(() => {
          onClose();
        }, 2500);
        return;
      }

      // Check for existing contacts (phone first, then email) before
      // writing anything, so the user can choose to merge into them
      // instead of always creating fresh duplicate rows.
      setCheckingDuplicates(true);
      const dupRes = await API.post("/contacts/check-duplicates", {
        contacts: validContacts.map((c) => ({ phone: c.phone, email: c.email })),
      });
      setCheckingDuplicates(false);

      if (dupRes.data.duplicates?.length > 0) {
        setLoading(false);
        setProgress(0);
        setDuplicateCheck({
          duplicates: dupRes.data.duplicates,
          pendingImport: { validContacts },
        });
        return;
      }

      await runImport(validContacts, "duplicate");
    } catch (err) {
      console.error("Import error:", err);

      let errorMessage = "Import failed. ";

      if (err.response?.data) {
        const { message, errors, imported, total } = err.response.data;

        if (message) {
          errorMessage += message;
        }

        if (errors && errors.length > 0) {
          errorMessage += "\n\nDetailed errors:\n";
          errors.slice(0, 5).forEach((error) => {
            errorMessage += `• ${error}\n`;
          });

          if (errors.length > 5) {
            errorMessage += `• ... and ${errors.length - 5} more errors`;
          }
        }

        if (imported !== undefined && total !== undefined) {
          errorMessage += `\n\nProgress: ${imported}/${total} contacts processed successfully.`;
        }
      } else {
        errorMessage += "Please check your data and try again.";
      }

      clearInterval(window.progressInterval);
      setProgress(0);
      setCheckingDuplicates(false);
      setTimeout(() => {
        handleClose();
      }, 2000);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Actually posts the import, once any duplicate-handling choice has been
  // made (or there were no duplicates to begin with).
  const runImport = async (validContacts, duplicateAction) => {
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const payload = { contacts: validContacts, duplicateAction };

      console.log("Final payload:", payload);

      setProgress(50);
      let simulatedProgress = 50;
      window.progressInterval = setInterval(() => {
        simulatedProgress = Math.min(simulatedProgress + 5, 80);
        setProgress(simulatedProgress);
      }, 500);

      const response = await API.post("/contacts/bulk-import", payload);
      console.log("Backend response:", response.data);

      clearInterval(window.progressInterval);
      setProgress(100);

      const { imported, merged, total, errors, warnings, skipped } = response.data;

      if (errors && errors.length > 0) {
        const errorList = errors.slice(0, 5);
        const remainingErrors = errors.length > 5 ? errors.length - 5 : 0;

        let errorMessage = `Import completed with issues:\n`;
        errorMessage += `• Successfully imported: ${imported} contacts\n`;
        if (merged > 0) errorMessage += `• Merged: ${merged} contacts\n`;
        if (skipped > 0) errorMessage += `• Skipped: ${skipped} contacts\n`;
        errorMessage += `• Errors encountered:\n`;

        errorList.forEach((error) => {
          errorMessage += `  - ${error}\n`;
        });

        if (remainingErrors > 0) {
          errorMessage += `  - ... and ${remainingErrors} more errors`;
        }

        setError(errorMessage);
      } else if (warnings && warnings.length > 0) {
        const warningList = warnings.slice(0, 3);
        const remainingWarnings = warnings.length > 3 ? warnings.length - 3 : 0;

        let successMessage = `Imported ${imported} contacts${merged ? `, merged ${merged}` : ""}.`;
        if (skipped > 0) {
          successMessage += `\n\nSkipped ${skipped} contacts:\n`;
          warningList.forEach((warning) => {
            successMessage += `• ${warning}\n`;
          });
          if (remainingWarnings > 0) {
            successMessage += `• ... and ${remainingWarnings} more`;
          }
        }

        setSuccess(successMessage);
      } else if (merged > 0) {
        setSuccess(`Imported ${imported} new contacts, merged ${merged} existing`);
      } else {
        setSuccess(`Successfully imported ${imported} contacts`);
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

      let errorMessage = "Import failed. ";

      if (err.response?.data) {
        const { message, errors, imported, total } = err.response.data;

        if (message) {
          errorMessage += message;
        }

        if (errors && errors.length > 0) {
          errorMessage += "\n\nDetailed errors:\n";
          errors.slice(0, 5).forEach((error) => {
            errorMessage += `• ${error}\n`;
          });

          if (errors.length > 5) {
            errorMessage += `• ... and ${errors.length - 5} more errors`;
          }
        }

        if (imported !== undefined && total !== undefined) {
          errorMessage += `\n\nProgress: ${imported}/${total} contacts processed successfully.`;
        }
      } else {
        errorMessage += "Please check your data and try again.";
      }

      clearInterval(window.progressInterval);
      setProgress(0);
      setTimeout(() => {
        handleClose();
      }, 2000);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Function to download sample CSV
  const downloadSampleCSV = (type) => {
    let csvContent;
    let fileName;

    if (type === "basic") {
      csvContent = `Name,Email,Phone,Status,Company
Contact Person 1,contact1@example.com,+1-555-0001,Lead,Tech Innovations Ltd
Contact Person 2,contact2@example.com,+1-555-0002,Sales Qualified Lead,Green Energy Corp
Contact Person 3,contact3@example.com,+1-555-0003,Customer,HealthCare Solutions`;
      fileName = "basic_contact_import_template.csv";
    } else {
      csvContent = `Name,Email,Phone,Status,Company,Job Title,Lead Source,Notes
Contact Person 1,contact1@example.com,+1-555-0001,Lead,Tech Innovations Ltd,CEO,Website,"Interested in product demo"
Contact Person 2,contact2@example.com,+1-555-0002,Sales Qualified Lead,Green Energy Corp,CTO,Referral,"Follow-up scheduled"
Contact Person 3,contact3@example.com,+1-555-0003,Customer,HealthCare Solutions,Manager,Event,"Existing customer, upsell opportunity"`;
      fileName = "extended_contact_import_template.csv";
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
              Import Contacts from CSV
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

          {/* Instructions */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
            <h4 className="text-sm font-medium text-gray-900 mb-2">
              Import Instructions:
            </h4>
            <ul className="text-xs text-gray-600 space-y-1">
              <li>• Your CSV should include column headers in the first row</li>
              <li>• Supported fields: Name, Email, Phone, Status, Company</li>
              <li>
                • Custom fields will be automatically mapped if column names
                match
              </li>
              <li>• You'll be able to map fields manually after file upload</li>
              <li>
                • Contacts will only be imported if the mapped company exists
              </li>
              <li>
                • Download the sample templates above to see the expected format
              </li>
            </ul>
          </div>

          {/* Alerts */}
          {error && (
            <div className="mb-4 p-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg flex items-start">
              <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />
              <div className="whitespace-pre-line">{error}</div>
            </div>
          )}

          {success && (
            <div className="mb-4 p-4 text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg">
              <div className="whitespace-pre-line">{success}</div>
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
        <ContactFieldMappingModal
          isOpen={showMapping}
          onClose={() => setShowMapping(false)}
          csvHeaders={csvHeaders}
          contactFieldNames={contactFieldNames}
          onImport={handleImport}
          loading={loading || checkingDuplicates}
        />

        {/* Duplicate resolution prompt */}
        {duplicateCheck && (
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
                {duplicateCheck.duplicates.length === 1 ? "contact" : "contacts"} found
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                {duplicateCheck.duplicates.length} of{" "}
                {duplicateCheck.pendingImport.validContacts.length} contacts in this file
                already exist (matched by phone number, or email if no phone matched). What
                would you like to do with them?
              </p>
              <div className="max-h-32 overflow-y-auto bg-gray-50 border border-gray-200 rounded-lg p-3 mb-5 text-sm text-gray-700 space-y-1">
                {duplicateCheck.duplicates.map((d) => (
                  <div key={d.existingId} className="flex items-center justify-between gap-2">
                    <span>{d.existingName}</span>
                    <span className="text-xs text-gray-400 uppercase flex-shrink-0">
                      matched by {d.matchedBy}
                    </span>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <button
                  onClick={() => {
                    const { validContacts } = duplicateCheck.pendingImport;
                    setDuplicateCheck(null);
                    runImport(validContacts, "merge");
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  <GitMerge className="w-4 h-4" />
                  Merge into existing contacts
                </button>
                <button
                  onClick={() => {
                    const { validContacts } = duplicateCheck.pendingImport;
                    setDuplicateCheck(null);
                    runImport(validContacts, "duplicate");
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
                Merge only fills in fields that are currently empty on the existing contact —
                it never overwrites data that's already there.
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default ImportContacts;
