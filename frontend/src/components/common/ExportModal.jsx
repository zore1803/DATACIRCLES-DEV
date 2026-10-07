import Checkbox from "./Checkbox";
import DownloadIcon from "./DownloadIcon";
// src/components/common/ExportModal.jsx
import React, { useState, useEffect, useMemo } from "react";
import { X, CheckSquare, Square } from "lucide-react";
import toast from "react-hot-toast";
import SearchIcon from "./SearchIcon";
import API from "../../services/api"; // Make sure your API instance is imported
import { downloadTablePDF, parseCSV } from "../../utils/clientExport";

export default function ExportModal({
  isOpen,
  onClose,
  columns,
  selectedIds, 
  exportUrl, 
  fileName = "export.csv",
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCols, setSelectedCols] = useState([]);
  const [isExporting, setIsExporting] = useState(false);
  const [format, setFormat] = useState("excel"); // "excel" (CSV) | "pdf"

  // When modal opens, select all visible columns by default
  useEffect(() => {
    if (isOpen) {
      setSelectedCols(
        columns.map((c) => c.key),
      );
      setSearchQuery("");
      setFormat("excel");
    }
  }, [isOpen, columns]);

  // Filter columns based on search
  const filteredColumns = useMemo(() => {
    return columns.filter((c) =>
      c.label.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [columns, searchQuery]);

  const toggleColumn = (key) => {
    setSelectedCols((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const toggleAll = () => {
    if (selectedCols.length === filteredColumns.length) {
      setSelectedCols([]);
    } else {
      setSelectedCols(filteredColumns.map((c) => c.key));
    }
  };

  const handleExport = async () => {
    if (selectedCols.length === 0) {
      toast.error("Please select at least one column to export");
      return;
    }

    // Format columns for the backend to understand
    const colsToExport = columns
      .filter((c) => selectedCols.includes(c.key))
      .map((c) => ({
        key: c.key,
        label: c.label,
        isCustomField: !!c.isCustomField,
      }));

    setIsExporting(true);
    const loadingToast = toast.loading(format === "pdf" ? "Generating PDF file..." : "Generating Excel file...");

    try {
      // ✅ Make POST request to Backend, demanding a 'blob' (file) in return
      const response = await API.post(
        exportUrl,
        {
          selectedIds: selectedIds, // Send the IDs from all pages
          columns: colsToExport,
        },
        {
          responseType: "blob", // CRITICAL: Tells axios we are downloading a file, not JSON
        },
      );

      if (format === "pdf") {
        // The endpoint returns CSV; turn it back into a table for the PDF so
        // Excel and PDF always contain exactly the same columns and values.
        const text = await new Blob([response.data]).text();
        const [head = [], ...body] = parseCSV(text);
        const baseName = fileName.replace(/\.csv$/i, "");
        await downloadTablePDF({
          head: ["#", ...head],
          body: body.map((row, i) => [i + 1, ...row]),
          fileNamePrefix: baseName,
          title: baseName.replace(/^Exported_/, "").replace(/_/g, " ") + " Report",
        });
      } else {
        // Create a URL for the downloaded file and trigger browser download
        const blob = new Blob([response.data], {
          type: "text/csv;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }

      toast.success(`Successfully exported ${selectedIds.length} records!`, {
        id: loadingToast,
      });
      onClose();
    } catch (error) {
      console.error(error);
      toast.error("Failed to export data", { id: loadingToast });
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  const isAllSelected =
    filteredColumns.length > 0 &&
    selectedCols.length === filteredColumns.length;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[10000] p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <DownloadIcon className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 font-sf">
                Export Data
              </h2>
              <p className="text-xs text-gray-500">
                Select columns and a format to export
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 flex flex-col overflow-hidden">
          <div className="flex gap-2 mb-4 shrink-0" role="radiogroup" aria-label="Export format">
            {[
              { value: "excel", label: "Excel" },
              { value: "pdf", label: "PDF" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={format === opt.value}
                onClick={() => setFormat(opt.value)}
                className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  format === opt.value
                    ? "bg-green-600 text-white border-green-600"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 bg-green-50 text-green-700 p-3 rounded-lg text-sm font-medium mb-4 shrink-0 border border-green-200">
            Exporting {selectedIds.length} selected record
            {selectedIds.length === 1 ? "" : "s"}
          </div>

          <div className="relative mb-4 shrink-0">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#525866]" />
            <input
              type="text"
              placeholder="Search columns..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
            />
          </div>

          <button
            onClick={toggleAll}
            className="flex items-center gap-2 mb-3 text-sm font-semibold text-blue-600 hover:text-blue-700 shrink-0"
          >
            {isAllSelected ? (
              <>
                <CheckSquare className="w-4 h-4" /> Deselect All
              </>
            ) : (
              <>
                <Square className="w-4 h-4" /> Select All
              </>
            )}
          </button>

          <div className="flex-1 overflow-y-auto border border-gray-200 rounded-lg p-2 custom-scrollbar bg-gray-50/50">
            {filteredColumns.length === 0 ? (
              <div className="text-center py-6 text-gray-400 text-sm">
                No columns match your search
              </div>
            ) : (
              <div className="space-y-1">
                {filteredColumns.map((col) => (
                  <label
                    key={col.key}
                    className="flex items-center gap-3 p-2 hover:bg-blue-50 rounded-lg cursor-pointer transition-colors border border-transparent hover:border-blue-100"
                  >
                    <Checkbox checked={selectedCols.includes(col.key)} onChange={() => toggleColumn(col.key)} />
                    <span className="text-sm font-medium text-gray-700 flex-1">
                      {col.label}
                    </span>
                    {col.isCustomField && (
                      <span className="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                        Custom
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center bg-gray-50/50 rounded-b-xl shrink-0">
          <span className="text-sm font-medium text-gray-500">
            {selectedCols.length} columns selected
          </span>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isExporting}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              disabled={selectedCols.length === 0 || isExporting}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm flex items-center gap-2"
            >
              <DownloadIcon className="w-4 h-4" />
              {isExporting ? "Exporting..." : format === "pdf" ? "Export to PDF" : "Export to Excel"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
