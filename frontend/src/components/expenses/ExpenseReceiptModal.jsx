import DownloadIcon from "../common/DownloadIcon";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  X, Printer, Share2, MessageSquare, Copy, Repeat,
} from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import emailLogo from "../../assets/email-logo.svg";
import API from "../../services/api";
import toast from "react-hot-toast";
import EditIcon from "../common/EditIcon";

/*
 * Receipt viewer for one Expense / Indirect Income entry.
 *
 * Same shape as Accounting.jsx's document viewer: a toolbar of actions across
 * the top and the document's own PDF in the frame below. The PDF comes from
 * GET /expenses/:id/receipt (rendered by utils/expenseReceiptPdf.js), so the
 * preview, the download and the print are all the same bytes — nothing here
 * re-draws the receipt in the browser, which would be a second source of
 * truth that drifts.
 */

const money = (n) =>
  `₹${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ExpenseReceiptModal({
  isOpen,
  onClose,
  record,
  kind = "expense",
  onEdit,
  onConvert,
  convertLabel,
}) {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [openMenu, setOpenMenu] = useState(null); // "share" | "convert" | null

  const id = record?._id;
  const isIncome = kind === "income";
  const noun = isIncome ? "Income" : "Expense";
  const receiptNo = id ? `${isIncome ? "INC" : "EXP"}-${String(id).slice(-6).toUpperCase()}` : "";

  useEffect(() => {
    if (!isOpen || !id) return;
    let objectUrl = null;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const res = await API.get(`/expenses/${id}/receipt`, { responseType: "blob" });
        if (cancelled) return;
        objectUrl = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
        setPdfUrl(objectUrl);
      } catch {
        if (!cancelled) toast.error("Couldn't load the receipt");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setPdfUrl(null);
      setOpenMenu(null);
    };
  }, [isOpen, id]);

  if (!isOpen || !record) return null;

  const shareText = `${noun} ${receiptNo}: ${money(record.amount)}${
    record.category ? ` (${record.category})` : ""
  }`;

  const handleDownload = () => {
    if (!pdfUrl) return;
    const link = document.createElement("a");
    link.href = pdfUrl;
    link.setAttribute("download", `${noun.toLowerCase()}-${receiptNo}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // Prints the already-fetched blob through a hidden iframe — one native
  // print job, same trick Accounting.jsx's viewer uses.
  const handlePrint = () => {
    if (!pdfUrl) return;
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    iframe.onload = () => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch {
        toast.error("Couldn't open the print dialog — try downloading instead.");
      }
      setTimeout(() => iframe.remove(), 60000);
    };
    iframe.src = pdfUrl;
    document.body.appendChild(iframe);
  };

  const iconBtn =
    "p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors";

  return createPortal(
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100002] p-2"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl w-full h-[97vh] max-w-[1100px] flex flex-col shadow-2xl"
      >
        <div className="flex justify-between items-center px-5 py-2 border-b border-gray-200 bg-white rounded-t-xl gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-sm font-semibold text-gray-900 truncate" title={receiptNo}>
              {receiptNo}
            </span>
            <span className="text-sm text-gray-500 truncate">
              {record.category || "Uncategorised"} · {money(record.amount)}
            </span>
          </div>

          <div className="flex gap-2 items-center flex-shrink-0">
            {onEdit && (
              <button
                onClick={() => onEdit(record)}
                className="h-9 px-3 flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-900 text-sm font-medium rounded-lg hover:bg-amber-100 transition-colors"
              >
                <EditIcon className="w-3.5 h-3.5" />
                Edit
              </button>
            )}
            <button
              onClick={() => {
                window.location.href = `mailto:?subject=${encodeURIComponent(
                  `${noun} ${receiptNo}`
                )}&body=${encodeURIComponent(shareText)}`;
              }}
              className="h-9 px-3 flex items-center gap-1.5 bg-white border border-[#E1E4EA] text-[#161618] text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              <img src={emailLogo} alt="" className="w-3.5 h-3.5 object-contain" />
              Email
            </button>
            <button
              onClick={() =>
                window.open(
                  `https://wa.me/?text=${encodeURIComponent(shareText)}`,
                  "_blank",
                  "noopener,noreferrer"
                )
              }
              className="h-9 px-3 flex items-center gap-1.5 bg-white border border-[#E1E4EA] text-[#161618] text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              <FaWhatsapp className="w-3.5 h-3.5 text-[#25D366]" />
              Whatsapp
            </button>

            <button title="Download" onClick={handleDownload} className={iconBtn} disabled={!pdfUrl}>
              <DownloadIcon className="w-4 h-4" />
            </button>
            <button title="Print" onClick={handlePrint} className={iconBtn} disabled={!pdfUrl}>
              <Printer className="w-4 h-4" />
            </button>

            <div className="relative">
              <button
                title="More share options"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenMenu(openMenu === "share" ? null : "share");
                }}
                className={iconBtn}
              >
                <Share2 className="w-4 h-4" />
              </button>
              {openMenu === "share" && (
                <div className="absolute right-0 mt-1 w-52 bg-white rounded-lg shadow-lg border border-gray-200 z-50 py-1">
                  <button
                    onClick={() => {
                      setOpenMenu(null);
                      window.location.href = `sms:?body=${encodeURIComponent(shareText)}`;
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                  >
                    <MessageSquare className="w-4 h-4 text-indigo-600" />
                    SMS
                  </button>
                  <button
                    onClick={async () => {
                      setOpenMenu(null);
                      try {
                        await navigator.clipboard.writeText(shareText);
                        toast.success("Details copied to clipboard");
                      } catch {
                        toast.error("Failed to copy");
                      }
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                  >
                    <Copy className="w-4 h-4 text-gray-600" />
                    Copy details
                  </button>
                </div>
              )}
            </div>

            {onConvert && (
              <div className="relative">
                <button
                  title="Convert"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenu(openMenu === "convert" ? null : "convert");
                  }}
                  className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                >
                  <Repeat className="w-4 h-4" />
                </button>
                {openMenu === "convert" && (
                  <div className="absolute right-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-50 py-1">
                    <button
                      onClick={() => {
                        setOpenMenu(null);
                        onConvert(record);
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                    >
                      <Repeat className="w-4 h-4 text-orange-600" />
                      Convert to {convertLabel}
                    </button>
                  </div>
                )}
              </div>
            )}

            <button onClick={onClose} className={iconBtn} aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 p-2 overflow-auto bg-gray-100 rounded-b-xl">
          {pdfUrl ? (
            // navpanes=0 is one of the few PDF fragment params Chrome honors
            // for blob: URLs; the thumbnail rail would otherwise squeeze the
            // page. Same reasoning as the accounting viewer.
            <iframe
              src={`${pdfUrl}#navpanes=0`}
              width="100%"
              height="100%"
              title={`${noun} receipt`}
              className="rounded-lg bg-white"
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mb-4" />
              <p className="text-gray-600 font-medium">
                {loading ? "Loading receipt..." : "Receipt unavailable"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
