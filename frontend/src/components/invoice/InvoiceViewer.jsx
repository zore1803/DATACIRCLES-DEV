// The document PDF viewer used by Accounting and by the Invoices tab on the
// Company and Deal pages: one copy so both screens get the same toolbar
// (copy types, edit, download, share, convert) and the same edge-to-edge PDF.
import React, { useState, useEffect } from "react";
import { Repeat, X, Share2, MessageCircle, Mail, Printer, MessageSquare, Copy } from "lucide-react";
import { PDFDocument } from "pdf-lib";
import toast from "react-hot-toast";
import API from "../../services/api";
import Checkbox from "../common/Checkbox";
import DownloadIcon from "../common/DownloadIcon";
import EditIcon from "../common/EditIcon";
import { apiPathFor, numberKeyFor, docNameFor } from "../../utils/documentTypes";

const COPY_TYPE_ORDER = ["original", "duplicate", "triplicate"];
const COPY_TYPE_CHECKBOXES = [
  { key: "original", label: "Customer" },
  { key: "duplicate", label: "Transport" },
  { key: "triplicate", label: "Supplier" },
];

const InvoiceViewer = ({
  isOpen,
  onClose,
  id,
  type,
  onEdit,
  onDownload,
  onSend,
  doc,
  onConvert,
}) => {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [openConvertMenu, setOpenConvertMenu] = useState(null);
  // Standard Indian GST invoice practice: the same document is printed as up
  // to three otherwise-identical copies, distinguished only by this label —
  // "ORIGINAL FOR RECIPIENT" for the customer, "DUPLICATE FOR TRANSPORTER"
  // for the goods carrier, "TRIPLICATE FOR SUPPLIER" for the seller's own
  // records. Any combination can be checked at once; when more than one is
  // checked, each copy's own single-page PDF is fetched and stitched into
  // one multi-page PDF client-side (same pdf-lib approach the bulk "merge
  // selected documents" toolbar action already uses), always in
  // original -> duplicate -> triplicate order regardless of check order.
  const [copyTypes, setCopyTypes] = useState(["original"]);
  const copyTypesKey = copyTypes.join(",");

  const toggleCopyType = (key) => {
    setCopyTypes((prev) => {
      if (prev.includes(key)) {
        // At least one copy must stay selected — otherwise there's nothing
        // to render and the viewer would be left showing a stale PDF.
        if (prev.length === 1) return prev;
        return prev.filter((k) => k !== key);
      }
      return COPY_TYPE_ORDER.filter((k) => k === key || prev.includes(k));
    });
  };

  useEffect(() => {
    if (isOpen && id && type) {
      fetchPdf();
    }
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, id, type, copyTypesKey]);

  const fetchPdf = async () => {
    try {
      const orderedTypes = COPY_TYPE_ORDER.filter((k) => copyTypes.includes(k));
      let fileBytes;
      if (orderedTypes.length <= 1) {
        const response = await API.get(`/${apiPathFor(type)}/download/${id}`, {
          responseType: "arraybuffer",
          params: { copyType: orderedTypes[0] || "original" },
        });
        fileBytes = response.data;
      } else {
        const merged = await PDFDocument.create();
        for (const ct of orderedTypes) {
          const response = await API.get(`/${apiPathFor(type)}/download/${id}`, {
            responseType: "arraybuffer",
            params: { copyType: ct },
          });
          const src = await PDFDocument.load(response.data);
          const copiedPages = await merged.copyPages(src, src.getPageIndices());
          copiedPages.forEach((page) => merged.addPage(page));
        }
        // pdf-lib doesn't carry the source PDFs' /Title metadata onto a
        // freshly-created document — left unset, Chrome's PDF viewer falls
        // back to showing the blob: URL's own UUID as the document title
        // instead of our filename (only happened once merging kicked in,
        // i.e. once more than one copy-type box got checked).
        merged.setTitle(`${apiPathFor(type)}-${doc?.[numberKeyFor(type)] || id}`);
        fileBytes = await merged.save();
      }
      // Named as a File (not a plain Blob) so the browser's built-in PDF
      // viewer shows this document's actual name instead of "about:blank" —
      // a bare Blob has no name, and Chrome's PDF viewer falls back to the
      // blob URL's (nonexistent) location for its title/tab label.
      const filename = `${apiPathFor(type)}-${doc?.[numberKeyFor(type)] || id}-${orderedTypes.join("+") || "original"}.pdf`;
      const file = new File([fileBytes], filename, { type: "application/pdf" });
      setPdfUrl(URL.createObjectURL(file));
    } catch (error) {
      toast.error("Failed to load PDF");
      console.error("PDF fetch error:", error);
      onClose();
    }
  };

  const handleDownloadCurrentCopy = () => {
    if (!pdfUrl) return;
    const orderedTypes = COPY_TYPE_ORDER.filter((k) => copyTypes.includes(k));
    const link = document.createElement("a");
    link.href = pdfUrl;
    link.setAttribute("download", `${apiPathFor(type)}-${docNumber || id}-${orderedTypes.join("+") || "original"}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // Prints whichever copy(ies) are currently checked/loaded — a hidden
  // iframe on the already-fetched pdfUrl, same trick the bulk print action
  // (handleBulkPrint) uses, so it's one native print job rather than
  // reopening/downloading anything.
  const handlePrintCurrentCopy = () => {
    if (!pdfUrl) return;
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.onload = () => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (err) {
        console.error("Print error", err);
        toast.error("Couldn't open the print dialog — try downloading instead.");
      }
      setTimeout(() => iframe.remove(), 60000);
    };
    iframe.src = pdfUrl;
    document.body.appendChild(iframe);
  };

  const handleWhatsAppShare = () => {
    const url = `${window.location.origin}/accounting?view=${type}&id=${id}`;
    const text = `${title} ${docNumber || ""}\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  const isTax =
    type === "tax"
      ? doc?.items?.some((item) => item.hsn && item.hsn.trim() !== "")
      : false;
  const title = type === "tax" ? (isTax ? "Tax Invoice" : "Invoice") : docNameFor(type);
  const docNumber = doc?.[numberKeyFor(type)];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100002] p-2">
      {/* Chrome ignores the #view=FitH / #zoom=... PDF-viewer open params for
          blob: URLs specifically (they only take effect for a real network
          request), so the page's native width can't be forced to fit a
          narrow panel — widened from max-w-5xl (1024px) so the full page
          width fits without the right edge getting cropped. */}
      <div className="bg-white rounded-xl w-full h-[97vh] max-w-[1400px] flex flex-col shadow-2xl">
        <div className="flex justify-between items-center px-5 py-2 border-b border-gray-200 bg-white rounded-t-xl gap-4">
          {/* Which copies to include, each an independent checkbox — checking
              more than one stitches them into one multi-page PDF (Customer
              page, then Transport, then Supplier), matching printed GST
              invoice practice of Original/Duplicate/Triplicate copies. */}
          <div className="flex items-center gap-5 flex-wrap min-w-0">
            <span className="text-sm font-semibold text-gray-900 truncate flex-shrink-0" title={`${title} #${docNumber || "N/A"}`}>
              {docNumber || title}
            </span>
            {COPY_TYPE_CHECKBOXES.map((opt) => (
              <label key={opt.key} className="flex items-center gap-2 text-sm font-medium text-gray-800 cursor-pointer select-none flex-shrink-0">
                <Checkbox checked={copyTypes.includes(opt.key)} onChange={() => toggleCopyType(opt.key)} />
                {opt.label}
              </label>
            ))}
            <label
              className="flex items-center gap-2 text-sm font-medium text-gray-400 cursor-not-allowed select-none flex-shrink-0"
              title="Attaching a linked Delivery Challan isn't supported yet"
            >
              <Checkbox checked={false} disabled />
              Delivery Challan
            </label>
          </div>
          <div className="flex gap-3 items-center flex-shrink-0">
            <div className="flex items-center gap-2">
              {onEdit && (
              <button
                onClick={onEdit}
                className="h-9 px-3 flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-900 text-sm font-medium rounded-lg hover:bg-amber-100 transition-colors"
              >
                <EditIcon className="w-3.5 h-3.5" />
                Edit
              </button>
              )}
              {onSend && (
              <button
                onClick={onSend}
                className="h-9 px-3 flex items-center gap-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <Mail className="w-3.5 h-3.5" />
                Email
              </button>
              )}
              <button
                onClick={handleWhatsAppShare}
                className="h-9 px-3 flex items-center gap-1.5 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                Whatsapp
              </button>
              <button
                title="Download"
                onClick={handleDownloadCurrentCopy}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <DownloadIcon className="w-4 h-4" />
              </button>
              <button
                title="Print"
                onClick={handlePrintCurrentCopy}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Printer className="w-4 h-4" />
              </button>
              {/* Overflow for the less-common share paths (SMS / copy link) —
                  WhatsApp and Email got promoted to their own labeled buttons
                  above to match the reference layout, so this now only holds
                  the two that didn't. */}
              <div className="relative">
                <button
                  title="More share options"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenConvertMenu(openConvertMenu === "share" ? null : "share");
                  }}
                  className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Share2 className="w-4 h-4" />
                </button>
                {openConvertMenu === "share" && (
                  <div className="absolute right-0 mt-1 w-60 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                    <div className="py-1">
                      {[
                        {
                          label: "SMS",
                          icon: MessageSquare,
                          iconClass: "text-indigo-600",
                          onClick: () => {
                            const url = `${window.location.origin}/accounting?view=${type}&id=${id}`;
                            const text = `${title} ${docNumber || ""}: ${url}`;
                            window.location.href = `sms:?body=${encodeURIComponent(text)}`;
                          },
                        },
                        {
                          label: "Copy Link",
                          icon: Copy,
                          iconClass: "text-gray-600",
                          onClick: async () => {
                            const url = `${window.location.origin}/accounting?view=${type}&id=${id}`;
                            try {
                              await navigator.clipboard.writeText(url);
                              toast.success("Link copied to clipboard");
                            } catch {
                              toast.error("Failed to copy link");
                            }
                          },
                        },
                      ].map((option) => (
                        <button
                          key={option.label}
                          onClick={() => {
                            option.onClick();
                            setOpenConvertMenu(null);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                        >
                          <option.icon className={`w-4 h-4 ${option.iconClass}`} />
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {onConvert && (
              <div className="relative">
                <button
                  title="Convert"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenConvertMenu(
                      openConvertMenu === "viewer" ? null : "viewer"
                    );
                  }}
                  className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                >
                  <Repeat className="w-4 h-4" />
                </button>
                {openConvertMenu === "viewer" && (
                  <div className="absolute right-0 mt-1 w-60 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                    <div className="py-1">
                      {["tax", "performa", "quotation", "deliveryChallan"]
                        .filter((t) => t !== type)
                        .map((targetType) => (
                          <button
                            key={targetType}
                            onClick={() => {
                              onConvert(targetType);
                              setOpenConvertMenu(null);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                          >
                            <Repeat className="w-4 h-4 text-orange-600" />
                            Convert to{" "}
                            {targetType === "tax"
                              ? "Tax Invoice"
                              : docNameFor(targetType)}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 p-2 overflow-auto">
          {pdfUrl ? (
            <iframe
              // The browser's own PDF toolbar is left ON (unlike most other
              // embeds in this app) specifically so its page-count indicator
              // and next/prev controls are available — the only way to
              // surface "page 1 of N" when multiple copy-type checkboxes are
              // stitched into one multi-page PDF, without building a custom
              // pager. navpanes=0 stays OFF though: Chrome shows a left
              // thumbnail rail by default for multi-page PDFs, which was
              // squeezing the actual page into what looked like "half
              // width" — navpanes=0 is one of the few fragment params Chrome
              // actually honors for blob: URLs (unlike view=/zoom=, which it
              // silently ignores for blob: URLs, so those aren't relied on;
              // the real fix for full-width rendering is this plus the
              // widened modal above and overflow-auto here as a fallback on
              // narrower screens).
              src={`${pdfUrl}#navpanes=0`}
              width="100%"
              height="100%"
              title="Document PDF"
              className="rounded-lg"
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mb-4"></div>
              <p className="text-gray-600 font-medium">Loading PDF...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InvoiceViewer;
