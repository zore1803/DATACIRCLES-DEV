import PdfIcon from "../common/PdfIcon";
import DownloadIcon from "../common/DownloadIcon";
import React, { useState, useRef } from "react";
import { X, CheckCircle2 } from "lucide-react";
import Papa from "papaparse";
import API from "../../services/api";
import toast from "react-hot-toast";
import UploadIcon from "../common/UploadIcon";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

// Maps common header spellings onto the row shape bulkImportSalesReturns
// expects — same auto-match-by-header-name idea as ImportPurchaseReturns.jsx.
const HEADER_ALIASES = {
  returnNumber: ["return number", "return no", "returnnumber", "sr number"],
  invoiceNumber: ["invoice number", "invoice", "invoicenumber", "invoice no"],
  itemName: ["item name", "item", "itemname", "product"],
  quantity: ["quantity", "qty", "return qty", "return quantity"],
  refundMode: ["refund mode", "mode", "payment mode"],
  reason: ["reason"],
  status: ["status"],
  notes: ["notes", "note"],
};

const normalizeHeader = (h) => (h || "").trim().toLowerCase();

const resolveField = (header) => {
  const norm = normalizeHeader(header);
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(norm)) return field;
  }
  return null;
};

const downloadSampleCSV = () => {
  const csv = [
    "Return Number,Invoice Number,Item Name,Quantity,Refund Mode,Reason,Status,Notes",
    ",INV-00001,Laptop Black,2,Bank Transfer,Damaged,Draft,",
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "sales_returns_sample.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

/*
 * Right-drawer CSV/Excel import for Sales Returns — same dc-panel-card shell
 * and "parse -> preview -> confirm -> bulk-import" flow as
 * ImportPurchaseReturns.jsx. Item name, rate, GST and tax-inclusive flag are
 * always resolved server-side from the matching Invoice line (never taken
 * from the CSV) so an import can't invent a price or bypass the returnable-
 * quantity cap the interactive form enforces.
 */
const ImportSalesReturns = ({ isOpen, onClose, onImportSuccess }) => {
  const [isSliding, setIsSliding] = useState(false);
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  useBodyScrollLock(isOpen);

  React.useEffect(() => {
    if (isOpen) {
      setTimeout(() => setIsSliding(true), 10);
    } else {
      setIsSliding(false);
      setRows(null);
      setFileName("");
    }
  }, [isOpen]);

  const handleClose = () => {
    setIsSliding(false);
    setTimeout(() => onClose(), 300);
  };

  const parseFile = (file) => {
    setFileName(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h,
      complete: (result) => {
        const fieldMap = {};
        (result.meta.fields || []).forEach((h) => {
          const field = resolveField(h);
          if (field) fieldMap[h] = field;
        });

        const mapped = result.data
          .map((row) => {
            const out = {};
            Object.entries(row).forEach(([header, value]) => {
              const field = fieldMap[header];
              if (field) out[field] = typeof value === "string" ? value.trim() : value;
            });
            return out;
          })
          .filter((r) => r.invoiceNumber && r.itemName);

        if (mapped.length === 0) {
          toast.error("No valid rows found — make sure the file has Invoice Number and Item Name columns.");
          setRows(null);
          return;
        }
        setRows(mapped);
      },
      error: () => toast.error("Failed to parse file"),
    });
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
    e.target.value = "";
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) parseFile(file);
  };

  const handleImport = async () => {
    if (!rows || rows.length === 0) return;
    setImporting(true);
    try {
      const res = await API.post("/sales-returns/bulk-import", { rows });
      toast.success(`Imported ${res.data.imported} of ${res.data.total} sales return(s)`);
      if (res.data.errors?.length) {
        res.data.errors.forEach((e) => toast.error(e));
      }
      onImportSuccess?.();
      handleClose();
    } catch (err) {
      toast.error(err.response?.data?.error || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[10000] transition-opacity duration-300"
        style={{ opacity: isSliding ? 1 : 0 }}
        onClick={handleClose}
      />
      <div
        className={`fixed dc-panel-card dc-panel-w z-[10001] bg-white shadow-2xl flex flex-col overflow-hidden transform transition-transform duration-300 ease-out ${isSliding ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-base font-bold text-gray-900">Import Sales Returns</h2>
          <button onClick={handleClose} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
          <button
            type="button"
            onClick={downloadSampleCSV}
            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            <DownloadIcon className="w-4 h-4" /> Download sample CSV
          </button>

          {!rows ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-2xl py-14 cursor-pointer transition-colors ${
                dragOver ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <UploadIcon className="w-8 h-8 text-gray-300" />
              <p className="text-sm font-medium text-gray-600">Drop a CSV/Excel file here, or click to browse</p>
              <p className="text-xs text-gray-400 text-center max-w-xs">
                Columns: Return Number (optional), Invoice Number, Item Name, Quantity, Refund Mode, Reason, Status, Notes
              </p>
              <p className="text-[11px] text-gray-400 text-center max-w-xs">
                Rate, GST and item details are pulled from the matching invoice line — not from the file.
              </p>
              <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileSelect} className="hidden" />
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <PdfIcon className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-700 truncate">{fileName}</span>
                <span className="ml-auto flex items-center gap-1 text-xs font-semibold text-emerald-600">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {rows.length} row{rows.length !== 1 ? "s" : ""} ready
                </span>
              </div>
              <div className="border border-gray-100 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 font-bold text-gray-500 uppercase">Invoice</th>
                      <th className="px-3 py-2 font-bold text-gray-500 uppercase">Item</th>
                      <th className="px-3 py-2 font-bold text-gray-500 uppercase text-right">Qty</th>
                      <th className="px-3 py-2 font-bold text-gray-500 uppercase">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.slice(0, 50).map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 text-gray-700">{r.invoiceNumber}</td>
                        <td className="px-3 py-1.5 text-gray-700">{r.itemName}</td>
                        <td className="px-3 py-1.5 text-gray-700 text-right">{r.quantity || 1}</td>
                        <td className="px-3 py-1.5 text-gray-700">{r.reason || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                onClick={() => { setRows(null); setFileName(""); }}
                className="mt-2 text-xs text-gray-500 hover:text-gray-700"
              >
                Choose a different file
              </button>
            </div>
          )}
        </div>

        <div className="flex-shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={handleClose} className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!rows || importing}
            className="px-5 py-2.5 bg-[#0085FF] hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
          >
            {importing ? "Importing..." : `Import${rows ? ` ${rows.length} row${rows.length !== 1 ? "s" : ""}` : ""}`}
          </button>
        </div>
      </div>
    </>
  );
};

export default ImportSalesReturns;
