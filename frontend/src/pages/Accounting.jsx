import CalendarIcon from "../components/common/CalendarIcon";
import DeleteIcon from "../components/common/DeleteIcon";
import PdfIcon from "../components/common/PdfIcon";
import VideoIcon from "../components/common/VideoIcon";
import Checkbox from "../components/common/Checkbox";
import PlusIcon from "../components/common/PlusIcon";
import MoreIcon from "../components/common/MoreIcon";
import DownloadIcon from "../components/common/DownloadIcon";
import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useCallback,
} from "react";
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Send,
  Repeat,
  X,
  AlertCircle,
  Briefcase,
  Clock,
  CheckCircle2,
  IndianRupee,
  Pin,
  PinOff,
  EyeOff,
  CheckSquare,
  LayoutTemplate,
  Settings,
  Search,
  Share2,
  MessageCircle,
  Mail,
  Copy,
  MessageSquare,
  Printer,
  PenTool,
  Eraser,
  Layers,
  Lock,
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Underline as UnderlineIcon,
  Strikethrough as StrikethroughIcon,
  ListOrdered,
  List as ListIcon,
  Link as LinkIcon,
  ArrowUp, ArrowDown } from "lucide-react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { PDFDocument } from "pdf-lib";
import API from "../services/api";
import SearchIcon from "../components/common/SearchIcon";
import AppToaster from "../components/AppToaster";
import { getDocumentSettings } from "../services/documentSettingsCache";
import { buildFilename, extractDocData, DEFAULT_FORMATS } from "../utils/pdfFilename";
import toast from "react-hot-toast";
import { useSubscription } from "../contexts/SubscriptionContext";
import { hasMinPlan } from "../utils/subscriptionHelpers";
import UpgradeRequiredModal from "../components/subscription/UpgradeRequiredModal";
import HighlightText from "../components/common/HighlightText";
import { formatNumberFixed } from "../utils/numberFormatter";
import { formatINR } from "../utils/clientExport";
import InvoiceForm, { CreateInvoicePanel } from "../components/invoice/InvoiceForm";
import PerformaInvoiceForm from "../components/PerformaInvoice/PerformaInvoiceForm";
import { CreatePerformaPanel } from "../components/PerformaInvoice/PerformaInvoiceForm";
import PerformaInvoiceFormFull from "../components/PerformaInvoice/PerformaInvoiceFormFull";
import QuotationForm from "../components/quotation/QuotationForm";
import { CreateQuotationPanel } from "../components/quotation/QuotationForm";
import InvoiceFormFull from "../components/invoice/InvoiceFormFull";
import DeliveryChallanForm from "../components/deliveryChallan/DeliveryChallanForm";
import { CreateChallanPanel } from "../components/deliveryChallan/DeliveryChallanForm";
import DeliveryChallanFormFull from "../components/deliveryChallan/DeliveryChallanFormFull";
import InvoiceStylePreview from "../components/invoice/InvoiceStylePreview";
import TemplateDrawer from "../components/invoice/TemplateDrawer";
import useNavReset from "../hooks/useNavReset";
import RecordPaymentModal from "../components/common/RecordPaymentModal";
import PerformaInvoiceStylePreview from "../components/PerformaInvoice/PerformaInvoiceStylePreview";
import QuickBrandingModal from "../components/invoice/QuickBrandingModal";
import BulkEmailGroupedModal from "../components/common/BulkEmailGroupedModal";
import BulkSignatureModal from "../components/common/BulkSignatureModal";
import QuickDealForm from "../components/deal/QuickDealForm";
import { getAncestorZoom } from "../utils/domUtils";
import { exportToCSV } from "../utils/exportToCSV";
import { useTopLoadingSignal } from "../components/common/TopLoadingBar";
import Skeleton from "../components/common/Skeleton";
import TableSkeletonRows from "../components/common/TableSkeletonRows";
import useSearchOverlayOpen from "../hooks/useSearchOverlayOpen";

import { getPinnedBoundaryOverlayStyle } from "../utils/pinnedColumnShadow";
import FilterIcon from "../components/common/FilterIcon";
import EyeIcon from "../components/common/EyeIcon";
import EditIcon from "../components/common/EditIcon";
/* Drops the organization's saved boilerplate (Settings → document defaults)
   into a notes/terms box, so the same footer text doesn't have to be retyped
   on every document. Disabled — with the reason in the tooltip — when there's
   nothing saved yet or the box already holds exactly that text; appends rather
   than overwrites when the box has other content. */
/* Opens the Notes & Terms drawer. Inserting the saved default text now lives
   inside that drawer, next to the field it applies to. */
const OpenNotesTermsButton = ({ label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    title="Edit notes and terms"
    className="inline-flex items-center gap-1 text-[12px] font-medium text-[#0085FF] hover:underline flex-shrink-0"
  >
    <PlusIcon className="w-4 h-4" />
    {label}
  </button>
);

/* Tab labels shown in the pill selector, mapped to the document type keys the
   API already uses. */
const TABS = [
  { label: "Invoices", key: "tax" },
  { label: "Pro Forma Invoices", key: "performa" },
  { label: "Quotations", key: "quotation" },
  { label: "Delivery Challans", key: "deliveryChallan" },
];

const statusOptions = [
  "Draft",
  "Sent",
  "Partially Paid",
  "Paid",
  "Accepted",
  "Rejected",
  "Delivered",
  "Void",
];

const apiPathFor = (type) =>
  type === "tax"
    ? "invoices"
    : type === "performa"
      ? "performa-invoices"
      : type === "quotation"
        ? "quotations"
        : "delivery-challans";

const dataKeyFor = (type) =>
  type === "tax"
    ? "invoices"
    : type === "performa"
      ? "performaInvoices"
      : type === "quotation"
        ? "quotations"
        : "deliveryChallans";

const numberKeyFor = (type) =>
  type === "tax"
    ? "invoiceNumber"
    : type === "performa"
      ? "performaInvoiceNumber"
      : type === "quotation"
        ? "quotationNumber"
        : "deliveryChallanNumber";

const docNameFor = (type) =>
  type === "tax"
    ? "Invoice"
    : type === "performa"
      ? "Pro Forma Invoice"
      : type === "quotation"
        ? "Quotation"
        : "Delivery Challan";

// Accounting conversion directions available from the Convert menu / Bulk
// Convert. Every direction is really the same "duplicate as draft"
// mechanism (conversionData): it copies the source document's line items,
// customer, and terms into a brand-new target document — always a fresh
// auto-generated number and Draft status, never the source's own number —
// without touching or removing the source document itself. The natural
// forward order (Quotation -> Pro Forma -> Invoice -> Delivery Challan) is
// just the common case; every type can duplicate into every other type.
const ALL_DOC_TYPES = ["quotation", "performa", "tax", "deliveryChallan"];
const CONVERSION_TARGETS_BY_TYPE = ALL_DOC_TYPES.reduce((acc, type) => {
  acc[type] = ALL_DOC_TYPES.filter((t) => t !== type);
  return acc;
}, {});
const getConversionTargets = (type) => CONVERSION_TARGETS_BY_TYPE[type] || [];

// Plain-text template bodies (saved templates, built-in fallbacks) use \n for
// line breaks; the email compose panel's body is a rich-text (HTML) editor,
// so newlines need to become <br> for them to actually show up as breaks.
const textToEmailHtml = (text) => (text || "").replace(/\n/g, "<br>");

// Maps a valid (sourceType -> targetType) conversion to its backend bulk
// endpoint. Only the 4 directions above exist server-side — anything else
// isn't offered in the UI so this map never needs a fallback.
const BULK_CONVERT_ENDPOINT = {
  quotation: { performa: "/converter/quotations/bulk-convert-to-proforma", tax: "/converter/quotations/bulk-convert-to-tax" },
  performa: { tax: "/converter/performa-invoices/bulk-convert-to-tax" },
  tax: { deliveryChallan: "/converter/invoices/bulk-convert-to-delivery-challan" },
};

const pluralNameFor = (type) =>
  type === "tax"
    ? "Invoices"
    : type === "performa"
      ? "Pro Forma Invoices"
      : type === "quotation"
        ? "Quotations"
        : "Delivery Challans";

/* Starting width per column; each one is draggable from its right-hand border. */
const DEFAULT_COL_WIDTHS = {
  selection: 60,
  number: 200,
  deal: 260,
  date: 170,
  dueDate: 170,
  amount: 170,
  status: 170,
};
const MIN_COL_WIDTH = 60;

/* One definition per data column. The header row, the body cells, the column
   popup menu and the reorder logic are all driven off this list, so all four
   tabs share exactly the same column behaviour. */
const COLUMN_DEFS = [
  {
    id: "number",
    label: (tab) => (tab === "tax" ? "Invoice ID" : "Document ID"),
    icon: PdfIcon,
    field: (tab) => numberKeyFor(tab),
  },
  { id: "deal", label: "Deal", icon: Briefcase, field: "deal.title" },
  { id: "date", label: "Issue Date", icon: CalendarIcon, field: "date" },
  { id: "dueDate", label: "Due Date", icon: Clock, field: "dueDate" },
  { id: "amount", label: "Amount", icon: IndianRupee, field: "amount" },
  { id: "status", label: "Status", icon: CheckCircle2, field: "status" },
];

/* Sits on the column's right-hand border. Module-scope + memo so the header
   cells don't remount it on every parent render. Stops click and the header's
   drag-start from firing while a resize is in progress. */
const ColumnResizeHandle = React.memo(({ colId, onResizeStart }) => (
  <div
    data-resize-handle="true"
    onMouseDown={(e) => onResizeStart(e, colId)}
    onClick={(e) => e.stopPropagation()}
    title="Drag to resize column"
    className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none z-30 hover:bg-[#0085FF]/40 active:bg-[#0085FF]"
  />
));
ColumnResizeHandle.displayName = "ColumnResizeHandle";

const fieldFor = (col, tab) =>
  typeof col.field === "function" ? col.field(tab) : col.field;

/* Plain-text value for a cell — used by the drag ghost so the floating panel
   shows the column's real contents while it's being moved. */
const cellText = (colId, doc, tab) => {
  switch (colId) {
    case "number":
      return `#${doc[numberKeyFor(tab)] ?? ""}`;
    case "deal":
      return doc.deal?.title || "N/A";
    case "date":
      return doc.date ? new Date(doc.date).toLocaleDateString() : "N/A";
    case "dueDate":
      return doc.dueDate ? new Date(doc.dueDate).toLocaleDateString() : "N/A";
    case "amount":
      return `₹${formatNumberFixed(doc.amount)}`;
    case "status":
      return doc.status || "—";
    default:
      return "—";
  }
};

const getStatusBadgeColor = (status) => {
  switch (status?.toLowerCase()) {
    case "draft":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "sent":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "paid":
      return "bg-green-100 text-green-800 border-green-200";
    case "partially paid":
      return "bg-orange-100 text-orange-800 border-orange-200";
    case "accepted":
      return "bg-green-100 text-green-800 border-green-200";
    case "rejected":
      return "bg-red-100 text-red-800 border-red-200";
    case "delivered":
      return "bg-purple-100 text-purple-800 border-purple-200";
    case "void":
      return "bg-gray-100 text-gray-800 border-gray-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
};

const DeleteConfirmModal = ({ isOpen, onClose, onConfirm, docType }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100003]">
      <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-red-100 p-2 rounded-lg">
            <AlertCircle className="w-5 h-5 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Confirm Deletion</h2>
        </div>
        <p className="text-sm text-gray-600 mb-6">
          Are you sure you want to delete this {docNameFor(docType)}? This action
          cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium flex items-center gap-2"
          >
            <DeleteIcon className="w-4 h-4" />
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

const ConvertConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  docType,
  targetType,
}) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100003]">
      <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-purple-100 p-2 rounded-lg">
            <Repeat className="w-5 h-5 text-purple-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Confirm Conversion</h2>
        </div>
        <p className="text-sm text-gray-600 mb-6">
          Are you sure you want to convert this {docNameFor(docType)} to a{" "}
          {docNameFor(targetType)}? The original document will be deleted.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium flex items-center gap-2"
          >
            <Repeat className="w-4 h-4" />
            Convert
          </button>
        </div>
      </div>
    </div>
  );
};

// Fixed rendering order for stitched multi-copy PDFs — independent of the
// order the user happened to check the boxes in.
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
              <button
                onClick={onEdit}
                className="h-9 px-3 flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-900 text-sm font-medium rounded-lg hover:bg-amber-100 transition-colors"
              >
                <EditIcon className="w-3.5 h-3.5" />
                Edit
              </button>
              <button
                onClick={onSend}
                className="h-9 px-3 flex items-center gap-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <Mail className="w-3.5 h-3.5" />
                Email
              </button>
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

const Accounting = () => {
  const isSearchOverlayOpen = useSearchOverlayOpen();
  const [activeTab, setActiveTab] = useState("tax");
  const tabRefs = useRef({});
  const [tabIndicator, setTabIndicator] = useState({ left: 0, width: 0 });

  useLayoutEffect(() => {
    const el = tabRefs.current[activeTab];
    if (el) setTabIndicator({ left: el.offsetLeft, width: el.offsetWidth });
  }, [activeTab]);

  // Deep links land on a specific tab, already filtered — e.g. the
  // dashboard's "N invoices awaiting to send" notice sends you to
  // /accounting?tab=tax&status=Draft and you arrive looking at exactly
  // those. Applied once per URL change, then the filter behaves like any
  // other the user set by hand (clearing it doesn't fight the URL).
  const location = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get("tab");
    const status = params.get("status");
    // `?search=` arrives from the global search panel's Invoices row — it
    // hands the query off rather than replicating the table's own filtering.
    const search = params.get("search");
    if (tab && TABS.some((t) => t.key === tab)) setActiveTab(tab);
    const key = tab && TABS.some((t) => t.key === tab) ? tab : "tax";
    if (status) {
      setFilterStatuses((prev) => ({ ...prev, [key]: status }));
    }
    if (search) {
      setSearchTerms((prev) => ({ ...prev, [key]: search }));
      // The search box is collapsed to an icon by default — open it, or the
      // term filtering the table would be invisible on arrival.
      setIsSearchExpanded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const emptyByType = { tax: "", performa: "", quotation: "", deliveryChallan: "" };
  // Tracks whether each tab has completed at least one fetch, so a
  // search/filter that narrows results to zero doesn't re-trigger the
  // toolbar/search-bar skeleton — that unmounted the search input mid-typing
  // and read as the whole page reloading on every keystroke.
  const hasLoadedOnceRef = useRef({
    tax: false,
    performa: false,
    quotation: false,
    deliveryChallan: false,
  });
  const emptyPagination = {
    currentPage: 1,
    totalPages: 0,
    totalCount: 0,
    limit: 50,
    hasNextPage: false,
    hasPrevPage: false,
  };

  const [deals, setDeals] = useState([]);
  const [documentTypeSettings, setDocumentTypeSettings] = useState({});
  const [defaultDueDateDays, setDefaultDueDateDays] = useState(null);
  // Notes/Terms boilerplate from Settings → Document Settings, keyed by
  // document type (tax | performa | quotation | deliveryChallan), with the
  // legacy flat fields as a fallback for orgs that haven't set per-type text.
  const [defaultNotesByType, setDefaultNotesByType] = useState({});
  const [defaultTermsByType, setDefaultTermsByType] = useState({});
  const [defaultNotesFlat, setDefaultNotesFlat] = useState("");
  const [defaultTermsFlat, setDefaultTermsFlat] = useState("");
  // Named template libraries loaded from Settings → Message Templates. Each
  // entry is {id, name, ...content, isDefault}; the share menu picks the
  // default automatically when there's only one, or lets the user choose
  // when there are several.
  const [waTemplatesList, setWaTemplatesList] = useState([]);
  const [smsTemplatesList, setSmsTemplatesList] = useState([]);
  const [emailTemplatesList, setEmailTemplatesList] = useState([]);
  const [shareCompanyName, setShareCompanyName] = useState("");
  const [brandSignatureUrl, setBrandSignatureUrl] = useState("");
  // Which channel's template picker is expanded inside the share dropdown,
  // or null to show the main WhatsApp/Email/SMS/Copy-Link list.
  const [shareMenuChannel, setShareMenuChannel] = useState(null);
  const [shareMenu, setShareMenu] = useState(null); // { doc, type, x, y }
  // Share is click-to-open/pinned (its button toggles shareMenu directly) —
  // this is just the unconditional close used by closeRowMenu, the scroll
  // handler, the outside-click handler, and Convert's mutual-exclusion kill.
  const forceCloseShareFlyout = () => {
    setShareMenu(null);
    setShareMenuChannel(null);
  };
  const [emailCompose, setEmailCompose] = useState(null); // { doc, type }
  const [emailComposeTo, setEmailComposeTo] = useState("");
  const [emailComposeCc, setEmailComposeCc] = useState("");
  const [emailComposeBcc, setEmailComposeBcc] = useState("");
  const [showEmailCc, setShowEmailCc] = useState(false);
  const [showEmailBcc, setShowEmailBcc] = useState(false);
  const [emailComposeSubject, setEmailComposeSubject] = useState("");
  const [emailComposeBody, setEmailComposeBody] = useState(""); // HTML, kept in sync with the rich-text editor's innerHTML
  const [emailComposeSending, setEmailComposeSending] = useState(false);
  const [emailTemplateOpen, setEmailTemplateOpen] = useState(false);
  const [emailPreviewMode, setEmailPreviewMode] = useState(false);
  const emailBodyEditorRef = useRef(null);
  const emailTemplateMenuRef = useRef(null);

  // Close the "Add template" dropdown on an outside click — it stayed open
  // over the rest of the Send Email panel until a template was picked.
  useEffect(() => {
    if (!emailTemplateOpen) return;
    const onClick = (e) => {
      if (emailTemplateMenuRef.current && !emailTemplateMenuRef.current.contains(e.target)) {
        setEmailTemplateOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [emailTemplateOpen]);
  const EMAIL_FROM_ADDRESS = import.meta.env.VITE_SENDGRID_FROM_EMAIL || "";
  const EMAIL_FROM_NAME = import.meta.env.VITE_SENDGRID_FROM_NAME || "";
  const [smsCompose, setSmsCompose] = useState(null); // { doc, type }
  const [smsComposeTo, setSmsComposeTo] = useState("");
  const [smsComposeBody, setSmsComposeBody] = useState("");
  const [smsComposeSending, setSmsComposeSending] = useState(false);
  const [documents, setDocuments] = useState({
    tax: [],
    performa: [],
    quotation: [],
    deliveryChallan: [],
  });
  const [loading, setLoading] = useState({
    tax: false,
    performa: false,
    quotation: false,
    deliveryChallan: false,
  });
  const fetchSequenceRef = useRef({
    tax: 0,
    performa: 0,
    quotation: 0,
    deliveryChallan: 0,
  });
  const [searchTerms, setSearchTerms] = useState(emptyByType);
  const [debouncedSearchTerms, setDebouncedSearchTerms] = useState(emptyByType);
  const [filterStatuses, setFilterStatuses] = useState(emptyByType);
  const [debouncedFilterStatuses, setDebouncedFilterStatuses] =
    useState(emptyByType);
  const [paginations, setPaginations] = useState({
    tax: { ...emptyPagination },
    performa: { ...emptyPagination },
    quotation: { ...emptyPagination },
    deliveryChallan: { ...emptyPagination },
  });
  const [sortConfigs, setSortConfigs] = useState({
    tax: { key: null, direction: null },
    performa: { key: null, direction: null },
    quotation: { key: null, direction: null },
    deliveryChallan: { key: null, direction: null },
  });

  // Column widths — drag the divider on a header's right edge to shrink/widen it.
  const [colWidths, setColWidths] = useState({ ...DEFAULT_COL_WIDTHS });
  const resizeRef = useRef(null);

  const startColumnResize = (e, colId) => {
    e.preventDefault();
    e.stopPropagation();
    // Start width is measured from the rendered <th> rather than read out of
    // colWidths state, so this handler never closes over stale state and its
    // identity can stay stable across renders.
    const th = e.currentTarget.closest("th");
    resizeRef.current = {
      colId,
      startX: e.clientX,
      startWidth: th ? th.getBoundingClientRect().width : MIN_COL_WIDTH,
    };

    const onMove = (moveEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      const next = Math.max(
        MIN_COL_WIDTH,
        r.startWidth + (moveEvent.clientX - r.startX)
      );
      setColWidths((prev) => ({ ...prev, [r.colId]: next }));
    };

    const onUp = () => {
      resizeRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const ResizeHandle = useCallback(
    ({ colId }) => (
      <ColumnResizeHandle colId={colId} onResizeStart={startColumnResize} />
    ),
    // startColumnResize reads its start width from the DOM at mousedown, so it
    // holds no stale state and this identity can stay stable across renders.
    []
  );

  // Column order / visibility / pinning — shared by all four tabs.
  const [columnOrder, setColumnOrder] = useState(COLUMN_DEFS.map((c) => c.id));
  const [hiddenCols, setHiddenCols] = useState([]);
  const [pinnedCols, setPinnedCols] = useState({});
  const [openColumnMenuKey, setOpenColumnMenuKey] = useState(null);
  const [columnMenuPos, setColumnMenuPos] = useState(null);
  const [draggedColKey, setDraggedColKey] = useState(null);
  const [dragOverColKey, setDragOverColKey] = useState(null);
  const [dragGhost, setDragGhost] = useState(null);
  const dragOverRef = useRef(null);
  const ghostElRef = useRef(null);

  const orderedColumns = useMemo(
    () =>
      columnOrder
        .map((id) => COLUMN_DEFS.find((c) => c.id === id))
        .filter((c) => c && !hiddenCols.includes(c.id))
        .sort((a, b) => {
          const rank = (c) =>
            pinnedCols[c.id] === "left"
              ? 0
              : pinnedCols[c.id] === "right"
                ? 2
                : 1;
          return rank(a) - rank(b);
        }),
    [columnOrder, hiddenCols, pinnedCols]
  );

  /* Pinned columns ride along on horizontal scroll. The selection checkbox is
     always the first left-sticky column, so left offsets start after it.
     Precomputed once per layout change rather than per cell. */
  const stickyStyles = useMemo(() => {
    const map = {};
    let leftOffset = colWidths.selection;
    for (const c of orderedColumns) {
      if (pinnedCols[c.id] === "left") {
        map[c.id] = { position: "sticky", left: leftOffset, zIndex: 15 };
        leftOffset += colWidths[c.id];
      }
    }
    let rightOffset = 0;
    for (const c of [...orderedColumns].reverse()) {
      if (pinnedCols[c.id] === "right") {
        map[c.id] = { position: "sticky", right: rightOffset, zIndex: 15 };
        rightOffset += colWidths[c.id];
      }
    }
    return map;
  }, [orderedColumns, pinnedCols, colWidths]);

  const stickyStyleFor = useCallback(
    (colId) => stickyStyles[colId] || {},
    [stickyStyles]
  );

  // Boundary shadow — same treatment as Companies: a soft edge on the
  // RIGHTMOST left-pinned column and the LEFTMOST right-pinned column, the
  // ones actually touching the scrollable content on screen.
  const lastLeftPinnedKey = useMemo(() => {
    const keys = orderedColumns.filter((c) => pinnedCols[c.id] === "left").map((c) => c.id);
    return keys.length ? keys[keys.length - 1] : null;
  }, [orderedColumns, pinnedCols]);
  const firstRightPinnedKey = useMemo(() => {
    const key = orderedColumns.find((c) => pinnedCols[c.id] === "right")?.id;
    return key || null;
  }, [orderedColumns, pinnedCols]);
  const boundaryShadowSideFor = useCallback(
    (colId) => {
      if (colId === lastLeftPinnedKey) return "left";
      if (colId === firstRightPinnedKey) return "right";
      return null;
    },
    [lastLeftPinnedKey, firstRightPinnedKey]
  );

  const closeColumnMenu = useCallback(() => {
    setOpenColumnMenuKey(null);
    setColumnMenuPos(null);
  }, []);

  const openColumnMenu = (e, colId) => {
    e.stopPropagation();
    if (openColumnMenuKey === colId) return closeColumnMenu();
    // rect is VISUAL px; the menu portals to document.body, which paints
    // inside this app's dynamic <html> zoom, so every rect-derived value has
    // to be divided by that zoom or it drifts further left the further right
    // the button sits — barely visible on columns 1-2, way off by column 6.
    // Same correction Companies.jsx uses for its column menu.
    const zMenu = getAncestorZoom(document.body);
    const MENU_W = 176;
    const MARGIN = 8;
    const rect = e.currentTarget.getBoundingClientRect();
    const viewportW = window.innerWidth / zMenu;
    let left = Math.min(rect.right / zMenu - MENU_W, viewportW - MENU_W - MARGIN);
    left = Math.max(left, MARGIN);
    setColumnMenuPos({ top: rect.bottom / zMenu + 4, left });
    setOpenColumnMenuKey(colId);
  };

  const handleColumnReorder = useCallback((draggedKey, targetKey) => {
    if (!draggedKey || draggedKey === targetKey) return;
    setColumnOrder((prev) => {
      const next = [...prev];
      const from = next.indexOf(draggedKey);
      const to = next.indexOf(targetKey);
      if (from === -1 || to === -1) return prev;
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  /* Press-and-drag column reorder, same mechanics as Contacts.jsx: a 5px
     movement threshold so a plain click never starts a drag, a body-portalled
     ghost carrying the header plus its cell values, and a drop resolved from
     whatever <th data-col-id> is under the pointer on mouseup. */
  const startColumnDrag = (e, colId) => {
    if (e.button !== 0) return;
    if (e.target.closest("button") || e.target.closest("[data-resize-handle]"))
      return;

    const th = e.currentTarget;
    const startX = e.clientX;
    const startY = e.clientY;
    const DRAG_THRESHOLD = 5;

    const dragState = { started: false, offsetX: 0, offsetY: 0, zGhost: 1 };

    const positionGhost = (clientX, clientY) => {
      const el = ghostElRef.current;
      if (!el) return;
      const visualTop = clientY - dragState.offsetY;
      const visualLeft = clientX - dragState.offsetX;
      el.style.top = `${visualTop / dragState.zGhost}px`;
      el.style.left = `${visualLeft / dragState.zGhost}px`;
      el.style.maxHeight = `${Math.max(100, window.innerHeight - visualTop - 72) / dragState.zGhost
        }px`;
    };

    const updateDragOver = (clientX, clientY) => {
      const elAtPoint = document.elementFromPoint(clientX, clientY);
      const thAtPoint = elAtPoint?.closest("th[data-col-id]");
      const overKey = thAtPoint?.getAttribute("data-col-id") || null;
      if (dragOverRef.current !== overKey) {
        dragOverRef.current = overKey;
        setDragOverColKey(overKey);
      }
    };

    const beginDrag = () => {
      dragState.started = true;
      window.getSelection?.()?.removeAllRanges();
      closeColumnMenu();

      const rect = th.getBoundingClientRect();
      const col = COLUMN_DEFS.find((c) => c.id === colId);
      const label =
        typeof col?.label === "function" ? col.label(activeTab) : col?.label;
      const previewRows = (documents[activeTab] || []).map((doc) =>
        cellText(colId, doc, activeTab)
      );

      // Grab offset is measured in visual space; zGhost maps the values we set
      // on the body-portalled ghost back into that same space.
      dragState.zGhost = getAncestorZoom(document.body);
      dragState.offsetX = startX - rect.left;
      dragState.offsetY = startY - rect.top;

      dragOverRef.current = null;
      setDraggedColKey(colId);
      setDragOverColKey(null);
      document.body.style.userSelect = "none";
      setDragGhost({
        label,
        previewRows,
        width: rect.width / dragState.zGhost,
        height: rect.height / dragState.zGhost,
      });

      requestAnimationFrame(() => positionGhost(startX, startY));
    };

    const handleMouseMove = (moveEvent) => {
      if (!dragState.started) {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        e.preventDefault();
        beginDrag();
      }
      positionGhost(moveEvent.clientX, moveEvent.clientY);
      updateDragOver(moveEvent.clientX, moveEvent.clientY);
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      if (!dragState.started) return;
      document.body.style.userSelect = "";
      const overKey = dragOverRef.current;
      if (overKey && overKey !== colId) handleColumnReorder(colId, overKey);
      dragOverRef.current = null;
      setDraggedColKey(null);
      setDragOverColKey(null);
      setDragGhost(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const setColumnPin = useCallback(
    (colId, side) =>
      setPinnedCols((prev) => {
        const next = { ...prev };
        if (next[colId] === side) delete next[colId];
        else next[colId] = side;
        return next;
      }),
    []
  );

  const tableWidth = useMemo(
    () => Object.values(colWidths).reduce((a, b) => a + b, 0),
    [colWidths]
  );

  // UI state
  const [selectedIds, setSelectedIds] = useState([]);
  const { subscription } = useSubscription();
  const hasBulkAccess = hasMinPlan(subscription?.subscription?.planName, "growth");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [editPanelDoc, setEditPanelDoc] = useState(null);
  const [conversionData, setConversionData] = useState(null);
  const [showQuickDealForm, setShowQuickDealForm] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const searchInputRef = useRef(null);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showForm, setShowForm] = useState(false);
  // Every document type opens in the shared split view (form + live preview)
  // by default; the header's expand button swaps to that type's dedicated
  // full-width screen. Each flag is a per-tab VIEW PREFERENCE, deliberately
  // NOT reset when the panel closes — it persists across opens/closes and
  // across switching tabs, same as the other three, until the user
  // explicitly collapses it back via that screen's own minimize button.
  const [quotationFullWidth, setQuotationFullWidth] = useState(false);
  const [invoiceFullWidth, setInvoiceFullWidth] = useState(false);
  const [performaFullWidth, setPerformaFullWidth] = useState(false);
  const [challanFullWidth, setChallanFullWidth] = useState(false);
  // Snapshot of the currently-open document's in-progress form, handed off
  // the moment the user toggles between split/full width so switching views
  // never drops unsaved edits (see CreateInvoicePanel/InvoiceFormFull etc.).
  // Only one document panel is ever open at a time, so a single slot is enough.
  const [formHandoff, setFormHandoff] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editingType, setEditingType] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewStyle, setPreviewStyle] = useState(null);
  const [previewType, setPreviewType] = useState(null);
  const [showViewer, setShowViewer] = useState(false);
  const [viewerId, setViewerId] = useState(null);
  const [viewerType, setViewerType] = useState(null);
  const [viewerDoc, setViewerDoc] = useState(null);
  const [openConvertMenu, setOpenConvertMenu] = useState(null); // doc._id
  const [convertMenuPos, setConvertMenuPos] = useState(null); // { doc, type, targets, x, y }
  // Convert is click-to-open/pinned (its button toggles openConvertMenu
  // directly, same as Share) — this is just the unconditional close used by
  // closeRowMenu, the scroll handler, the outside-click handler, and
  // Share's mutual-exclusion kill.
  const forceCloseConvertFlyout = () => {
    setOpenConvertMenu(null);
    setConvertMenuPos(null);
  };
  // Single "⋮" menu per row, replacing the old strip of individual icon
  // buttons — every row action lives here now. Convert and Share both open
  // as hover flyouts beside the row (see openConvertMenu/shareMenu) rather
  // than swapping the panel's own content.
  const [openRowMenu, setOpenRowMenu] = useState(null);
  const [rowMenuPos, setRowMenuPos] = useState(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showTemplateDrawer, setShowTemplateDrawer] = useState(false);
  const [showBrandingModal, setShowBrandingModal] = useState(false);
  const [pendingInvoiceCreation, setPendingInvoiceCreation] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteDocId, setDeleteDocId] = useState(null);
  const [deleteDocType, setDeleteDocType] = useState(null);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showBulkUpdateModal, setShowBulkUpdateModal] = useState(false);
  const [showBulkSignatureModal, setShowBulkSignatureModal] = useState(false);
  const [bulkSignatureLoading, setBulkSignatureLoading] = useState(false);
  const [showBulkEmailGroupedModal, setShowBulkEmailGroupedModal] = useState(false);
  const [bulkUpdateStatus, setBulkUpdateStatus] = useState("");
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [bulkConvertMenuOpen, setBulkConvertMenuOpen] = useState(false);
  const [bulkConverting, setBulkConverting] = useState(false);
  const [bulkSignatureUpdating, setBulkSignatureUpdating] = useState(false);
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [bulkPrinting, setBulkPrinting] = useState(false);
  // Delays the bulk-strip's unmount so it can play a slide-out-right exit
  // animation on deselect (mirroring the slide-in-left entrance) — same as
  // the Companies page.
  const [showBulkStrip, setShowBulkStrip] = useState(false);
  const [bulkStripClosing, setBulkStripClosing] = useState(false);
  useEffect(() => {
    const active = selectedIds.length > 0;
    if (active) {
      setBulkStripClosing(false);
      setShowBulkStrip(true);
    } else if (showBulkStrip) {
      setBulkStripClosing(true);
      const t = setTimeout(() => {
        setShowBulkStrip(false);
        setBulkStripClosing(false);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [selectedIds.length]);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [convertDocId, setConvertDocId] = useState(null);
  const [convertDocType, setConvertDocType] = useState(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState(null);
  const [convertTargetType, setConvertTargetType] = useState(null);

  // Clicking "Accounting" in the sidebar while already here should come back to
  // the plain list, the same way it would if you'd navigated in from elsewhere.
  // The create/edit panel, viewer and drawers are overlays rather than routes,
  // so the router can't clear them on its own.
  useNavReset(() => {
    setShowCreatePanel(false);
    setEditPanelDoc(null);
    setShowViewer(false);
    setViewerId(null);
    setViewerType(null);
    setViewerDoc(null);
    setShowTemplateDrawer(false);
    setShowBrandingModal(false);
    setShowDeleteModal(false);
    setShowBulkDeleteModal(false);
    setShowBulkUpdateModal(false);
    setShowConvertModal(false);
    setShowFilterMenu(false);
    setShowMoreMenu(false);
    setOpenConvertMenu(null);
    setConvertMenuPos(null);
    setSelectedIds([]);
    setPreviewType(null);
  });

  useEffect(() => {
    const handleClickOutside = () => {
      if (openConvertMenu) {
        setOpenConvertMenu(null);
        setConvertMenuPos(null);
      }
      if (showFilterMenu) setShowFilterMenu(false);
      if (showMoreMenu) setShowMoreMenu(false);
    };
    // Scroll closes every menu here outright rather than tracking position —
    // all of them (including the row "⋮" menu, which otherwise only closes
    // via its own full-screen portal overlay on click) are fixed-positioned
    // and would be left floating at stale coordinates once the table under
    // them scrolls.
    const handleScroll = () => {
      if (openConvertMenu) {
        setOpenConvertMenu(null);
        setConvertMenuPos(null);
      }
      if (showFilterMenu) setShowFilterMenu(false);
      if (showMoreMenu) setShowMoreMenu(false);
      if (openRowMenu) {
        setOpenRowMenu(null);
        setRowMenuPos(null);
        forceCloseShareFlyout();
        forceCloseConvertFlyout();
      }
    };
    if (openConvertMenu || showFilterMenu || showMoreMenu || openRowMenu) {
      document.addEventListener("click", handleClickOutside);
      window.addEventListener("scroll", handleScroll, true);
    }
    return () => {
      document.removeEventListener("click", handleClickOutside);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [openConvertMenu, showFilterMenu, showMoreMenu, openRowMenu]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerms((prev) => ({
        ...prev,
        [activeTab]: searchTerms[activeTab],
      }));
      setPaginations((prev) => ({
        ...prev,
        [activeTab]: { ...prev[activeTab], currentPage: 1 },
      }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerms, activeTab]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilterStatuses((prev) => ({
        ...prev,
        [activeTab]: filterStatuses[activeTab],
      }));
      setPaginations((prev) => ({
        ...prev,
        [activeTab]: { ...prev[activeTab], currentPage: 1 },
      }));
    }, 300);
    return () => clearTimeout(timer);
  }, [filterStatuses, activeTab]);

  // The fetch effects below key off these primitives rather than the whole
  // per-tab objects, so they're statically checkable and only re-run when the
  // value that actually drives a refetch changes.
  const activePage = paginations[activeTab]?.currentPage;
  const activeLimit = paginations[activeTab]?.limit;
  const activeSort = sortConfigs[activeTab];
  const activeSearch = debouncedSearchTerms[activeTab];
  const activeStatusFilter = debouncedFilterStatuses[activeTab];

  // Selections belong to the rows currently on screen, so drop them whenever
  // the tab or page changes.
  useEffect(() => {
    setSelectedIds([]);
  }, [activeTab, activePage]);

  useEffect(() => {
    fetchData(activeTab);
    // One request effect covers paging, sorting, search and status changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage, activeLimit, activeSort.key, activeSort.direction, activeSearch, activeStatusFilter, activeTab]);

  useEffect(() => {
    fetchDeals();
    fetchDocSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchDocSettings = useCallback(async () => {
    try {
      const [settingsRes, brandingRes] = await Promise.all([
        API.get("/document-settings"),
        API.get("/branding").catch(() => null),
      ]);
      const res = settingsRes;
      setDocumentTypeSettings(res.data?.documentTypeSettings || {});
      if (res.data && res.data.defaultDueDateDays != null) {
        setDefaultDueDateDays(res.data.defaultDueDateDays);
      }
      setDefaultNotesByType(res.data?.defaultNotesByType || {});
      setDefaultTermsByType(res.data?.defaultTermsByType || {});
      setDefaultNotesFlat(res.data?.defaultNotes || "");
      setDefaultTermsFlat(res.data?.defaultTerms || "");
      setWaTemplatesList(Array.isArray(res.data?.whatsappTemplates) ? res.data.whatsappTemplates : []);
      setSmsTemplatesList(Array.isArray(res.data?.smsTemplates) ? res.data.smsTemplates : []);
      setEmailTemplatesList(Array.isArray(res.data?.emailTemplates) ? res.data.emailTemplates : []);
      if (brandingRes?.data?.companyName) setShareCompanyName(brandingRes.data.companyName);
      if (brandingRes?.data?.signatureUrl) setBrandSignatureUrl(brandingRes.data.signatureUrl);
    } catch (err) {
      console.error("Failed to load doc settings in accounting", err);
    }
  }, []);

  const fetchDeals = useCallback(async () => {
    try {
      const res = await API.get("/deals");
      setDeals(res.data);
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to load deals");
      console.error("Fetch deals error:", err);
    }
  }, []);

  const fetchData = async (type) => {
    const requestSequence = ++fetchSequenceRef.current[type];
    setLoading((prev) => ({ ...prev, [type]: true }));
    const params = new URLSearchParams({
      page: paginations[type].currentPage.toString(),
      limit: paginations[type].limit.toString(),
    });
    if (sortConfigs[type].key) {
      params.append("sortBy", sortConfigs[type].key);
      params.append("sortOrder", sortConfigs[type].direction || "asc");
    } else {
      params.append("sortBy", "createdAt");
      params.append("sortOrder", "desc");
    }
    if (debouncedSearchTerms[type].trim()) {
      params.append("search", debouncedSearchTerms[type].trim());
    }
    if (debouncedFilterStatuses[type]) {
      params.append("status", debouncedFilterStatuses[type]);
    }

    try {
      const res = await API.get(
        `/${apiPathFor(type)}/pagination?${params.toString()}`
      );
      if (requestSequence !== fetchSequenceRef.current[type]) return;
      const serverPagination = res.data.pagination;
      const safeCurrentPage = serverPagination.totalPages > 0
        ? Math.min(serverPagination.currentPage, serverPagination.totalPages)
        : 1;
      setDocuments((prev) => ({
        ...prev,
        [type]: res.data[dataKeyFor(type)] || [],
      }));
      setPaginations((prev) => ({
        ...prev,
        [type]: {
          ...prev[type],
          currentPage: safeCurrentPage,
          totalPages: serverPagination.totalPages,
          totalCount: serverPagination.totalCount,
          hasNextPage: safeCurrentPage < serverPagination.totalPages,
          hasPrevPage: safeCurrentPage > 1,
        },
      }));
    } catch (err) {
      if (requestSequence !== fetchSequenceRef.current[type]) return;
      toast.error(
        err.response?.data?.error || `Failed to load ${pluralNameFor(type)}`
      );
      console.error(`Fetch ${type} documents error:`, err.response?.data);
    } finally {
      if (requestSequence === fetchSequenceRef.current[type]) {
        setLoading((prev) => ({ ...prev, [type]: false }));
        hasLoadedOnceRef.current[type] = true;
      }
    }
  };

  const handlePageChange = (type, newPage) => {
    const pagination = paginations[type];
    if (
      newPage >= 1 &&
      newPage <= pagination.totalPages &&
      newPage !== pagination.currentPage
    ) {
      setPaginations((prev) => ({
        ...prev,
        [type]: { ...prev[type], currentPage: newPage },
      }));
    }
  };

  const handleLimitChange = (type, newLimit) => {
    setPaginations((prev) => ({
      ...prev,
      [type]: { ...prev[type], limit: newLimit, currentPage: 1 },
    }));
  };

  const handleSelectAll = () => {
    if (!hasBulkAccess) {
      setShowUpgradeModal(true);
      return;
    }
    setSelectedIds((prev) =>
      prev.length === currentDocuments.length && currentDocuments.length > 0
        ? []
        : currentDocuments.map((doc) => doc._id)
    );
  };

  const handleSelectOne = (id) => {
    if (!hasBulkAccess) {
      setShowUpgradeModal(true);
      return;
    }
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleBulkSignatureUpdate = async (signatureData, isRemove = false) => {
    if (selectedIds.length === 0) return;
    const type = activeTab;
    try {
      setBulkSignatureLoading(true);
      setShowBulkSignatureModal(false);
      setBulkShowMoreMenu(false);
      
      const payload = {
        ids: selectedIds,
        signature: signatureData || "",
        signatureType: signatureData ? "image" : "text"
      };

      await API.post(`/${apiPathFor(type)}/bulk-signature`, payload);
      
      toast.success(
        `${selectedIds.length} ${docNameFor(type)}${selectedIds.length !== 1 ? "s" : ""} signature ${isRemove ? 'removed' : 'updated'} successfully`
      );
      
      setSelectedIds([]);
      await fetchData(type);
    } catch (err) {
      toast.error(err.response?.data?.error || `Failed to ${isRemove ? 'remove' : 'update'} signatures`);
    } finally {
      setBulkSignatureLoading(false);
    }
  };

  // Bulk delete every selected document on the active tab. There's no
  // dedicated batch endpoint, so fan out the single-delete route in parallel.
  const confirmBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const type = activeTab;
    try {
      setBulkDeleting(true);
      setLoading((prev) => ({ ...prev, [type]: true }));
      const results = await Promise.allSettled(
        selectedIds.map((id) => API.delete(`/${apiPathFor(type)}/${id}`))
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      await fetchData(type);
      setSelectedIds([]);
      if (failed === 0) {
        toast.success(
          `${selectedIds.length} ${docNameFor(type)}${selectedIds.length !== 1 ? "s" : ""
          } deleted successfully`
        );
      } else {
        toast.error(`Failed to delete ${failed} of ${selectedIds.length} documents`);
      }
    } catch (err) {
      toast.error(`Failed to delete ${type} documents`);
      console.error(`Bulk delete ${type} documents error:`, err);
    } finally {
      setBulkDeleting(false);
      setLoading((prev) => ({ ...prev, [type]: false }));
      setShowBulkDeleteModal(false);
    }
  };

  // Export the selected rows on the active tab to a CSV, client-side.
  const handleExportSelected = () => {
    if (selectedIds.length === 0) return;
    const selectedSet = new Set(selectedIds);
    const docs = currentDocuments.filter((d) => selectedSet.has(d._id));
    if (docs.length === 0) return;
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["ID", "Deal", "Issue Date", "Due Date", "Amount", "Status"];
    const rows = docs.map((d) =>
      [
        `#${d[numberKeyFor(activeTab)] ?? ""}`,
        d.deal?.title || "N/A",
        d.date ? new Date(d.date).toLocaleDateString() : "",
        d.dueDate ? new Date(d.dueDate).toLocaleDateString() : "",
        formatINR(d.amount),
        d.status || "",
      ]
        .map(esc)
        .join(",")
    );
    exportToCSV(
      [header.map(esc).join(","), ...rows],
      `${apiPathFor(activeTab)}-export.csv`
    );
    toast.success(`Exported ${docs.length} ${docNameFor(activeTab)}${docs.length !== 1 ? "s" : ""}`);
  };

  // Bulk update: apply a chosen status to every selected document. Fans out the
  // single-status route in parallel since there's no batch endpoint.
  const confirmBulkUpdate = async () => {
    if (selectedIds.length === 0 || !bulkUpdateStatus) return;
    const type = activeTab;
    try {
      setBulkUpdating(true);
      setLoading((prev) => ({ ...prev, [type]: true }));
      const results = await Promise.allSettled(
        selectedIds.map((id) =>
          API.put(`/${apiPathFor(type)}/status/${id}`, {
            status: bulkUpdateStatus,
          })
        )
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      await fetchData(type);
      setSelectedIds([]);
      if (failed === 0) {
        toast.success(
          `${results.length} ${docNameFor(type)}${results.length !== 1 ? "s" : ""
          } updated to ${bulkUpdateStatus}`
        );
      } else {
        toast.error(`Failed to update ${failed} of ${selectedIds.length} documents`);
      }
    } catch (err) {
      toast.error(`Failed to update ${type} documents`);
      console.error(`Bulk update ${type} documents error:`, err);
    } finally {
      setBulkUpdating(false);
      setLoading((prev) => ({ ...prev, [type]: false }));
      setShowBulkUpdateModal(false);
      setBulkUpdateStatus("");
    }
  };

  // Fetches every selected document's PDF and merges them into one combined
  // PDF via pdf-lib, so bulk download/print produce a single file instead of
  // N separate ones. Returns the merged bytes, or null (after toasting) if
  // nothing could be included.
  const mergeSelectedDocumentsPdf = async () => {
    const type = activeTab;
    const merged = await PDFDocument.create();
    let failedCount = 0;
    for (const id of selectedIds) {
      try {
        const response = await API.get(`/${apiPathFor(type)}/download/${id}`, {
          responseType: "arraybuffer",
        });
        const src = await PDFDocument.load(response.data);
        const copiedPages = await merged.copyPages(src, src.getPageIndices());
        copiedPages.forEach((page) => merged.addPage(page));
      } catch (err) {
        failedCount += 1;
        console.error(`Failed to fetch/merge PDF for ${id}`, err);
      }
    }
    if (failedCount > 0) {
      toast.error(
        `${failedCount} of ${selectedIds.length} document${selectedIds.length !== 1 ? "s" : ""} could not be included.`
      );
    }
    if (merged.getPageCount() === 0) {
      toast.error("Couldn't generate a combined PDF.");
      return null;
    }
    return merged.save();
  };

  const handleBulkDownloadPdf = async () => {
    if (selectedIds.length === 0) return;
    const count = selectedIds.length;
    setBulkDownloading(true);
    // A single loading toast, updated in place (by id) rather than a
    // fire-and-forget one that auto-dismisses on its own timer — it should
    // stay on screen for the whole merge and only resolve once the file has
    // actually been handed to the browser to download.
    // AppToaster sets a global 5s duration for every toast type, including
    // "loading" ones (which react-hot-toast otherwise never auto-dismisses)
    // — without this override the loading toast was vanishing 5s in, mid-
    // merge, regardless of how long the actual work took.
    const toastId = toast.loading(`Merging ${count} document${count !== 1 ? "s" : ""} into one PDF...`, { duration: Infinity });
    try {
      const bytes = await mergeSelectedDocumentsPdf();
      if (!bytes) {
        toast.dismiss(toastId);
        return;
      }
      const url = window.URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${docNameFor(activeTab)}s-merged-${count}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Downloaded ${count} document${count !== 1 ? "s" : ""} as one PDF`, { id: toastId });
    } catch (err) {
      console.error("Bulk download error", err);
      toast.error("Failed to download the merged PDF.", { id: toastId });
    } finally {
      setBulkDownloading(false);
    }
  };

  // Merges the selection into one PDF, loads it into a hidden iframe, and
  // triggers the browser's native print dialog on that iframe — so printing
  // multiple documents produces one combined print job instead of N
  // separate ones (or N popup windows).
  const handleBulkPrint = async () => {
    if (selectedIds.length === 0) return;
    const count = selectedIds.length;
    setBulkPrinting(true);
    // Same persistent, id-updated toast as bulk download — stays visible
    // through the merge and only resolves once the print dialog has
    // actually been opened (or failed to).
    const toastId = toast.loading(`Merging ${count} document${count !== 1 ? "s" : ""} for printing...`, { duration: Infinity });
    try {
      const bytes = await mergeSelectedDocumentsPdf();
      if (!bytes) {
        toast.dismiss(toastId);
        return;
      }
      const url = window.URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
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
          toast.success(`Ready to print ${count} document${count !== 1 ? "s" : ""}`, { id: toastId });
        } catch (err) {
          console.error("Bulk print error", err);
          toast.error("Couldn't open the print dialog — try downloading instead.", { id: toastId });
        } finally {
          setBulkPrinting(false);
        }
        // Give the print dialog time to open before cleaning up — removing
        // the iframe too early can cancel the print job in some browsers.
        setTimeout(() => {
          iframe.remove();
          window.URL.revokeObjectURL(url);
        }, 60000);
      };
      iframe.src = url;
      document.body.appendChild(iframe);
    } catch (err) {
      console.error("Bulk print error", err);
      toast.error("Failed to prepare the merged PDF for printing.", { id: toastId });
      setBulkPrinting(false);
    }
  };



  // Bulk conversion is restricted to the same one-way directions as the
  // single-document Convert menu (see CONVERSION_TARGETS_BY_TYPE) — the
  // endpoint map only has entries for those, so there's no path to a reverse
  // or arbitrary conversion here.
  const handleBulkConvert = async (targetType) => {
    if (selectedIds.length === 0) return;
    const endpoint = BULK_CONVERT_ENDPOINT[activeTab]?.[targetType];
    if (!endpoint) return;

    setBulkConvertMenuOpen(false);
    setBulkConverting(true);
    try {
      const res = await API.post(endpoint, { ids: selectedIds });
      const successCount = res.data?.successfulIds?.length || 0;
      const failCount = res.data?.failedIds?.length || 0;
      if (successCount > 0) {
        toast.success(`${successCount} ${docNameFor(activeTab)}${successCount !== 1 ? "s" : ""} converted to ${docNameFor(targetType)}`);
      }
      if (failCount > 0) {
        toast.error(`${failCount} ${docNameFor(activeTab)}${failCount !== 1 ? "s" : ""} could not be converted`);
      }
      setSelectedIds([]);
      fetchData(activeTab);
      fetchData(targetType);
    } catch (error) {
      toast.error(error.response?.data?.message || "Bulk conversion failed");
    } finally {
      setBulkConverting(false);
    }
  };

  const checkBrandingBeforeInvoice = async () => {
    try {
      const response = await API.get("/branding/invoice-check");
      if (!response.data.isComplete) {
        setShowBrandingModal(true);
        setPendingInvoiceCreation(true);
        return false;
      }
      return true;
    } catch (error) {
      console.error("Branding check error:", error);
      return true;
    }
  };

  // Repointed to the same two-pane CreateInvoicePanel the document number/
  // title click and the "Add [Document]" button use, so the pencil icon no
  // longer opens the legacy per-type *Form.jsx components. CreateInvoicePanel
  // does its own item/date normalization from the raw doc, same as the
  // number-click handler below.
  const handleEdit = (doc, type) => {
    if (activeTab !== type) setActiveTab(type);
    setEditPanelDoc(doc);
    setShowCreatePanel(true);
  };

  const handleDelete = (id, type) => {
    setDeleteDocId(id);
    setDeleteDocType(type);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    try {
      setLoading((prev) => ({ ...prev, [deleteDocType]: true }));
      await API.delete(`/${apiPathFor(deleteDocType)}/${deleteDocId}`);
      await fetchData(deleteDocType);
      toast.success(`${docNameFor(deleteDocType)} deleted successfully`);
    } catch (err) {
      toast.error(
        err.response?.data?.error || `Failed to delete ${deleteDocType} document`
      );
      console.error(`Delete ${deleteDocType} document error:`, err);
    } finally {
      setLoading((prev) => ({ ...prev, [deleteDocType]: false }));
      setShowDeleteModal(false);
      setDeleteDocId(null);
      setDeleteDocType(null);
    }
  };

  // Opens the create form pre-filled with the source document's data (same
  // split/full-width view it was last shown in) instead of creating the
  // duplicate directly against the backend — lets the user review/edit
  // before saving, same flow as handleConvert/confirmConvert below. Distinct
  // from "Convert": duplicate stays on the same document type and never
  // touches the source.
  const handleDuplicate = (id, type) => {
    const sourceDoc = documents[type]?.find((d) => d._id === id);
    if (!sourceDoc) {
      toast.error("Source document not found. Please refresh.");
      return;
    }
    setConversionData(sourceDoc);
    setActiveTab(type);
    setShowCreatePanel(true);
    setShowViewer(false);
  };

  const handleConvert = (id, sourceType, targetType) => {
    setConvertDocId(id);
    setConvertDocType(sourceType);
    setConvertTargetType(targetType);
    setShowConvertModal(true);
  };

  const confirmConvert = async () => {
    const sourceDoc = documents[convertDocType].find((d) => d._id === convertDocId);
    if (!sourceDoc) {
      toast.error("Source document not found. Please refresh.");
      return;
    }

    setShowConvertModal(false);
    setOpenConvertMenu(null);

    // Open the target's create form in whichever view (split vs full-width)
    // the source type was last shown in, so converting a document doesn't
    // unexpectedly switch the user to a different layout.
    const sourceIsFullWidth = {
      tax: invoiceFullWidth,
      quotation: quotationFullWidth,
      performa: performaFullWidth,
      deliveryChallan: challanFullWidth,
    }[convertDocType];
    const setTargetFullWidth = {
      tax: setInvoiceFullWidth,
      quotation: setQuotationFullWidth,
      performa: setPerformaFullWidth,
      deliveryChallan: setChallanFullWidth,
    }[convertTargetType];
    setTargetFullWidth?.(!!sourceIsFullWidth);

    setConversionData(sourceDoc);
    setActiveTab(convertTargetType);
    setShowCreatePanel(true);
    setShowViewer(false);

    setConvertDocId(null);
    setConvertDocType(null);
    setConvertTargetType(null);
  };

  const handleDownload = async (id, type) => {
    const path = apiPathFor(type);

    // Resolve filename silently from saved org settings
    const tabDocs = documents[type] ?? [];
    const doc = tabDocs.find((d) => d._id === id);
    let filename = `${path.split('-').join('')}-${id}`;
    try {
      const settings = await getDocumentSettings();
      const formats = settings?.pdfFilenameFormats || DEFAULT_FORMATS;
      const tokens = formats[type] || DEFAULT_FORMATS[type];
      const orgName = settings?.companyName || "";
      filename = buildFilename(tokens, extractDocData(doc || {}, type, orgName));
    } catch (_) { /* fall back to default */ }

    try {
      setLoading((prev) => ({ ...prev, [type]: true }));
      const response = await API.get(`/${path}/download/${id}`, {
        responseType: "blob",
      });
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${filename}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`${docNameFor(type)} downloaded successfully`);
    } catch (error) {
      toast.error(`Failed to download ${type} document`);
      console.error(`Download ${type} document error:`, error);
    } finally {
      setLoading((prev) => ({ ...prev, [type]: false }));
    }
  };

  const handleView = (doc, type) => {
    setViewerDoc(doc);
    setViewerId(doc._id);
    setViewerType(type);
    setShowViewer(true);
  };

  // Opens the same "Send Email" compose drawer the row-menu's template flow
  // uses (prefilled To/Subject/Body), rather than the OS-level Web Share
  // sheet — that's a different, file-sharing feature (WhatsApp/Discord/
  // Nearby Sharing/etc.) that doesn't belong behind an "Email" button.
  const handleSend = (doc, type) => {
    if (!doc) return;
    const link = `${window.location.origin}/view/${apiPathFor(type)}/${doc._id}`;
    const num = doc[numberKeyFor(type)];
    const customerName = doc.deal?.contactPerson || doc.deal?.title || "Sir/Madam";
    setEmailComposeTo(doc.deal?.contact?.email || doc.deal?.company?.email || doc.deal?.email || "");
    setEmailComposeCc("");
    setEmailComposeBcc("");
    setEmailComposeSubject(`${docNameFor(type)} ${num || ""}`);
    setEmailComposeBody(
      textToEmailHtml(
        `Dear ${customerName},\n\nPlease find attached your ${docNameFor(type)}${num ? ` ${num}` : ""}.\n\nYou can also view or download it online: ${link}\n\nRegards`
      )
    );
    setEmailCompose({ doc, type });
  };

  const handleStatusChange = async (id, newStatus, type) => {
    try {
      setLoading((prev) => ({ ...prev, [type]: true }));
      await API.put(`/${apiPathFor(type)}/status/${id}`, { status: newStatus });
      await fetchData(type);
      toast.success(`${docNameFor(type)} status updated successfully`);
    } catch (err) {
      toast.error(
        err.response?.data?.error || `Failed to update ${type} document status`
      );
      console.error(`Status update ${type} document error:`, err);
    } finally {
      setLoading((prev) => ({ ...prev, [type]: false }));
    }
  };

  const currentLoading = loading[activeTab];
  const currentDocuments = documents[activeTab];
  const pagination = paginations[activeTab];

  // One flag drives every skeleton on the page, so the header, the table body
  // and the pagination strip all appear and resolve together. Tracks the fetch
  // exactly - no minimum hold, so the skeleton clears the moment data lands.
  const showLoadingSkeleton =
    currentLoading &&
    currentDocuments.length === 0 &&
    !hasLoadedOnceRef.current[activeTab];
  useTopLoadingSignal(currentLoading);

  // Same compact "first ... current ... last" pattern as Companies.jsx —
  // never more than 5 slots, so the strip can't overflow or wrap regardless
  // of how many pages there are.
  const [editingPage, setEditingPage] = useState(false);
  const [pageInput, setPageInput] = useState("");

  const pageItems = useMemo(() => {
    const { currentPage, totalPages } = pagination;
    const items = [1];
    if (currentPage > 2) items.push("left-dots");
    if (currentPage !== 1 && currentPage !== totalPages) items.push(currentPage);
    if (currentPage < totalPages - 1) items.push("right-dots");
    if (totalPages > 1) items.push(totalPages);
    return items;
  }, [pagination]);

  useEffect(() => {
    setEditingPage(false);
    setPageInput("");
  }, [activeTab]);

  // Every row action lives behind one "⋮" trigger, instead of a dedicated
  // "Actions" table column (there is no such column any more — the trigger
  // is appended into whichever data column ends up rendering last, so it
  // keeps following the last column through reordering/pinning). Convert
  // and Share both open as hover flyouts beside the panel (see
  // openConvertMenu/shareMenu above) rather than swapping the panel's own
  // content. Positioning/closing mirrors Companies.jsx's row-actions menu
  // exactly (also used by Deals): portal to document.body so it's never
  // clipped by an ancestor's stacking context, a full-screen invisible
  // overlay to close on outside click (no fragile document-listener/
  // stopPropagation dance), and top/left clamped on both ends so it can
  // never render off-screen or behind the sticky header.
  const renderRowActions = (doc) => {
    const conversionTargets = getConversionTargets(activeTab);
    const menuOpen = openRowMenu === doc._id;
    const closeRowMenu = () => {
      setOpenRowMenu(null);
      setRowMenuPos(null);
      forceCloseShareFlyout();
      forceCloseConvertFlyout();
    };
    return (
      <div className="relative flex items-center justify-center flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        <button
          title="More actions"
          onClick={(e) => {
            e.stopPropagation();
            if (menuOpen) {
              closeRowMenu();
              return;
            }
            const zMenu = getAncestorZoom(document.body);
            const MENU_W = 160;
            const MARGIN = 8;
            // Conservative estimate for the tallest state (main menu
            // with every optional item shown) — clamped below so it can
            // never render off-screen regardless of the real height.
            const MENU_H = 260;

            const rect = e.currentTarget.getBoundingClientRect();
            const viewportH = window.innerHeight / zMenu;
            const viewportW = window.innerWidth / zMenu;
            const top = rect.bottom / zMenu + 4;
            const bottomAnchor = rect.top / zMenu - 4;

            const openUp = viewportH - top < MENU_H + MARGIN;
            let calcTop = openUp ? bottomAnchor - MENU_H : top;
            calcTop = Math.max(MARGIN, Math.min(calcTop, viewportH - MENU_H - MARGIN));

            let calcLeft = rect.right / zMenu - MENU_W;
            calcLeft = Math.min(calcLeft, viewportW - MENU_W - MARGIN);
            calcLeft = Math.max(calcLeft, MARGIN);

            // Only one row flyout at a time, and always starts fresh even
            // if a different row's Convert/Share flyout was left open.
            forceCloseConvertFlyout();
            forceCloseShareFlyout();
            setRowMenuPos({ top: calcTop, left: calcLeft });
            setOpenRowMenu(doc._id);
          }}
          className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <MoreIcon className="w-4 h-4" />
        </button>
        {menuOpen && rowMenuPos && createPortal(
          <>
            <div className="fixed inset-0 z-[100050]" onClick={closeRowMenu} />
            <div
              key={doc._id}
              style={{ position: "fixed", top: rowMenuPos.top, left: rowMenuPos.left }}
              className="w-[160px] z-[100051] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5 max-h-[70vh] overflow-y-auto"
            >
              <>
                  {activeTab === "tax" && doc.status !== "Paid" && (
                    <button
                      onClick={() => {
                        closeRowMenu();
                        setSelectedInvoiceForPayment(doc);
                        setPaymentModalOpen(true);
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                    >
                      <IndianRupee className="w-3.5 h-3.5 text-emerald-600" />
                      Record Payment
                    </button>
                  )}
                  <button
                    onClick={() => {
                      closeRowMenu();
                      handleView(doc, activeTab);
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                  >
                    <EyeIcon className="w-3.5 h-3.5 text-blue-600" />
                    View
                  </button>
                  <button
                    onClick={() => {
                      closeRowMenu();
                      handleEdit(doc, activeTab);
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                  >
                    <EditIcon className="w-3.5 h-3.5 text-blue-600" />
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      closeRowMenu();
                      handleDownload(doc._id, activeTab);
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                  >
                    <DownloadIcon className="w-3.5 h-3.5 text-green-600" />
                    Download
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // Click-to-open and pinned — the flyout used to open
                      // on hover, but the gap between the button and the
                      // flyout (two separate portaled subtrees) made it too
                      // easy to lose hover and have it close mid-move.
                      // Clicking again on an already-open flyout for this
                      // row closes it.
                      if (shareMenu?.doc?._id === doc._id) {
                        forceCloseShareFlyout();
                        return;
                      }
                      forceCloseConvertFlyout();
                      const zMenu = getAncestorZoom(document.body);
                      const DROPDOWN_W = 160;
                      const GAP = 0;
                      const rect = e.currentTarget.getBoundingClientRect();
                      setShareMenu({
                        doc,
                        type: activeTab,
                        x: Math.max(4, rect.left / zMenu - DROPDOWN_W - GAP),
                        y: rect.top / zMenu,
                      });
                      setShareMenuChannel(null);
                    }}
                    className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                  >
                    <span className="flex items-center gap-2">
                      <Share2 className="w-3.5 h-3.5 text-blue-600" />
                      Share
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                  {conversionTargets.length > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // Click-to-open and pinned — same as Share. Clicking
                        // again on an already-open flyout for this row
                        // closes it.
                        if (openConvertMenu === doc._id) {
                          forceCloseConvertFlyout();
                          return;
                        }
                        forceCloseShareFlyout();
                        const zMenu = getAncestorZoom(document.body);
                        const DROPDOWN_W = 210; // matches the flyout's own w-[210px]
                        const GAP = 0;
                        const rect = e.currentTarget.getBoundingClientRect();
                        setConvertMenuPos({
                          doc,
                          type: activeTab,
                          targets: conversionTargets,
                          x: Math.max(4, rect.left / zMenu - DROPDOWN_W - GAP),
                          y: rect.top / zMenu,
                        });
                        setOpenConvertMenu(doc._id);
                      }}
                      className="w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                    >
                      <span className="flex items-center gap-2">
                        <Repeat className="w-3.5 h-3.5 text-orange-600" />
                        Convert
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                  )}
                  <button
                    onClick={() => {
                      closeRowMenu();
                      handleDuplicate(doc._id, activeTab);
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                  >
                    <Copy className="w-3.5 h-3.5 text-indigo-600" />
                    Duplicate
                  </button>
                  <div className="w-full border-t border-[#F1F1F5] my-0.5" />
                  <button
                    onClick={() => {
                      closeRowMenu();
                      handleDelete(doc._id, activeTab);
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-red-600 hover:bg-red-50 whitespace-nowrap"
                  >
                    <DeleteIcon className="w-3.5 h-3.5" />
                    Delete
                  </button>
                </>
            </div>
          </>,
          document.body
        )}
        {openConvertMenu === doc._id && convertMenuPos && createPortal(
          <>
            {/* Above the row menu's own backdrop (z-[100050]/[100051]) — the
                row menu stays open behind this flyout, so its full-screen
                backdrop would otherwise sit on top and swallow every click
                meant for a conversion target. */}
            <div
              className="fixed inset-0 z-[100060]"
              onClick={() => { setOpenConvertMenu(null); setConvertMenuPos(null); }}
            />
            <div
              className="fixed z-[100061] w-[210px] overflow-hidden bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5"
              style={{ top: convertMenuPos.y, left: convertMenuPos.x }}
            >
              {convertMenuPos.targets.map((targetType) => (
                <button
                  key={targetType}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleConvert(convertMenuPos.doc._id, convertMenuPos.type, targetType);
                    closeRowMenu();
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50"
                >
                  <Repeat className="w-3.5 h-3.5 text-orange-600 flex-shrink-0" />
                  <span className="truncate">
                    Convert to {targetType === "tax" ? "Tax Invoice" : docNameFor(targetType)}
                  </span>
                </button>
              ))}
            </div>
          </>,
          document.body
        )}
      </div>
    );
  };

  const renderCell = (colId, doc) => {
    const searchQuery = searchTerms[activeTab];
    switch (colId) {
      case "number":
        return (
          <div className="flex items-center gap-2">
            <span
              onClick={() => {
                // All document types open the same full two-pane edit screen;
                // the panel adapts its fields to the active tab's type.
                setEditPanelDoc(doc);
                setShowCreatePanel(true);
              }}
              className="text-sm font-semibold text-blue-600 cursor-pointer hover:underline truncate"
              title="Open to edit"
            >
              #<HighlightText text={doc[numberKeyFor(activeTab)]} query={searchQuery} />
            </span>
          </div>
        );

      case "deal":
        return (
          <span className="block truncate text-sm text-[#1C1B1F] font-medium">
            {doc.deal?.title ? (
              <HighlightText text={doc.deal.title} query={searchQuery} />
            ) : (
              "N/A"
            )}
          </span>
        );

      case "date":
        return (
          <span className="text-sm text-gray-600">
            {doc.date ? (
              <HighlightText
                text={new Date(doc.date).toLocaleDateString()}
                query={searchQuery}
              />
            ) : (
              "N/A"
            )}
          </span>
        );

      case "dueDate":
        return (
          <span className="text-sm text-gray-600">
            {doc.dueDate ? (
              <HighlightText
                text={new Date(doc.dueDate).toLocaleDateString()}
                query={searchQuery}
              />
            ) : (
              "N/A"
            )}
          </span>
        );

      case "amount": {
        const paidSoFar = (doc.payments || []).reduce((sum, p) => sum + p.amount, 0);
        const dueAmount = doc.amount - paidSoFar;
        const showDue = activeTab === "tax" && paidSoFar > 0 && dueAmount > 0.01;
        return (
          <div>
            <span className="text-sm font-semibold text-gray-900">
              ₹<HighlightText text={formatNumberFixed(doc.amount)} query={searchQuery} />
            </span>
            {showDue && (
              <div className="text-[11px] font-medium text-orange-600 mt-0.5">
                ₹{formatNumberFixed(dueAmount)} due
              </div>
            )}
          </div>
        );
      }

      case "status":
        // Plain, non-interactive pill — matching the status badge everywhere
        // else in the app (Purchases, Purchase Orders, ...). This used to be
        // a live <select> that changed the record's status on pick, right
        // from the table; status changes now only happen through the row's
        // own Edit action, not an inline control easy to bump by accident.
        return (
          <div className="relative inline-block">
            <span
              className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${getStatusBadgeColor(doc.status)}`}
            >
              {doc.status}
            </span>
            {searchQuery && searchQuery.trim() && doc.status
              ?.toLowerCase()
              .includes(searchQuery.trim().toLowerCase()) && (
                <span className="absolute inset-0 rounded-full ring-2 ring-yellow-300 pointer-events-none" />
              )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <AppToaster />

      {/* Slim indeterminate bar pinned to the very top of the viewport while
          a bulk merge (download or print) is running — the toast alone can
          get lost in a long list, this is the "is something happening"
          signal that's visible no matter where on the page you're looking. */}
      {(bulkDownloading || bulkPrinting) && (
        <div className="fixed top-0 left-0 right-0 h-1 z-[100025] bg-blue-100 overflow-hidden">
          <div className="h-full w-1/3 bg-blue-600 animate-[bulkProgress_1.1s_ease-in-out_infinite]" />
          <style>{`
            @keyframes bulkProgress {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(300%); }
            }
          `}</style>
        </div>
      )}

      <div className="bg-[#F9FAFB] min-h-screen -mx-4 sm:-mx-6 lg:-mx-8 -mt-6">
        {/* Bulk selection strip — overlays the toolbar when rows are selected,
            mirroring the Companies page layout and slide animation. */}
        {showBulkStrip && (
          <div
            className="fixed right-0 h-16 px-4 sm:px-6 lg:px-8 border-b border-[#E1E4EA] bg-white flex items-center top-[calc(54px+var(--dc-offline-offset,0px))] lg:top-[calc(64px+var(--dc-offline-offset,0px))]"
            style={{ left: "var(--sidebar-width, 0px)", zIndex: 41 }}
          >
            <div
              className={`${bulkStripClosing ? "animate-slideOutRight" : "animate-slideInLeft"} flex flex-nowrap items-center justify-between gap-4 w-full h-full overflow-x-auto`}
            >
              {/* Left: bulk action buttons */}
              {/* One joined strip instead of separate pills, matching Companies: no gap
    between buttons, rounding only on the two outer corners, and each
    border pulled left by 1px onto its neighbour so touching borders
    don't double up. Only the icons carry each action's colour. */}
              <div className="flex flex-nowrap items-center flex-shrink-0">
                <button
                  onClick={handleExportSelected}
                  className="h-10 px-4 bg-white border border-gray-300 text-gray-900 text-sm font-medium rounded-l-[25px] hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
                >
                  <DownloadIcon className="w-4 h-4 text-green-600" />
                  Export
                </button>
                <button
                  onClick={() => {
                    setBulkUpdateStatus("");
                    setShowBulkUpdateModal(true);
                  }}
                  className="h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
                >
                  <EditIcon className="w-4 h-4 text-blue-600" />
                  Bulk Update
                </button>
                <button
                  onClick={handleBulkDownloadPdf}
                  disabled={bulkDownloading}
                  className="h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap disabled:opacity-50"
                >
                  {bulkDownloading ? (
                    <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <DownloadIcon className="w-4 h-4 text-indigo-600" />
                  )}
                  Download Merged PDF
                </button>
                {activeTab === "tax" && (
                  <button
                    onClick={() => setShowBulkEmailGroupedModal(true)}
                    className="h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
                  >
                    <Mail className="w-4 h-4 text-blue-600" />
                    Send Email (Grouped)
                  </button>
                )}
                {getConversionTargets(activeTab).length > 0 && (
                  <div className="relative flex items-center">
                    <button
                      onClick={() => setBulkConvertMenuOpen((p) => !p)}
                      disabled={bulkConverting}
                      className="h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap disabled:opacity-50"
                    >
                      {bulkConverting ? (
                        <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Repeat className="w-4 h-4 text-orange-600" />
                      )}
                      Convert
                    </button>
                    {bulkConvertMenuOpen && (
                      <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-gray-200 shadow-xl rounded-lg z-50 overflow-hidden">
                        {getConversionTargets(activeTab).map((targetType) => (
                          <button
                            key={targetType}
                            onClick={() => handleBulkConvert(targetType)}
                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                          >
                            <Repeat className="w-4 h-4 text-orange-600" />
                            Convert to{" "}
                            {targetType === "tax" ? "Tax Invoice" : docNameFor(targetType)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <button
                  onClick={() => setShowBulkDeleteModal(true)}
                  disabled={bulkDeleting}
                  className="h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 disabled:opacity-50 flex-shrink-0 whitespace-nowrap"
                >
                  <DeleteIcon className="w-4 h-4 text-red-600" />
                  Delete
                </button>
                <button
                  onClick={() => setSelectedIds([])}
                  className="h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium rounded-r-[25px] hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </button>
              </div>
              {/* Right: selection count + select/deselect all */}
              <div className="flex items-center gap-3 flex-shrink-0">
                <CheckSquare className="w-5 h-5 text-blue-600 flex-shrink-0" />
                <span className="text-blue-800 font-semibold font-inter whitespace-nowrap">
                  {selectedIds.length} selected
                </span>
                <button
                  onClick={() =>
                    setSelectedIds(currentDocuments.map((d) => d._id))
                  }
                  className="h-10 px-4 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-[25px] hover:bg-gray-50 focus:outline-none transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
                >
                  <CheckSquare className="w-4 h-4" />
                  Select All
                </button>
                <button
                  onClick={() => setSelectedIds([])}
                  className="h-10 px-4 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-[25px] hover:bg-gray-50 focus:outline-none transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
                >
                  <X className="w-4 h-4" />
                  Deselect All
                </button>
              </div>
            </div>
          </div>
        )}
        {/* 2nd Header - Tab Bar & Actions Row */}
        <div
          className="fixed right-0 h-16 px-4 sm:px-6 lg:px-8 border-b border-[#E1E4EA] bg-white flex items-center justify-between gap-3 top-[calc(54px+var(--dc-offline-offset,0px))] lg:top-[calc(64px+var(--dc-offline-offset,0px))]"
          style={{ left: "var(--sidebar-width, 0px)", zIndex: 39 }}
        >
          {/* Mobile-only page title — fills the same left slot the tab pill
              occupies on desktop, so justify-between actually has two
              children to space apart (with only the icon group visible, a
              single flex child sits at flex-start instead of the far right).
              Collapses away when the mobile search is expanded, same as
              Companies.jsx's title, so the search field gets the freed
              width instead of staying pinned to a small fixed size. */}
          <div
            className={`lg:hidden flex items-center gap-2 overflow-hidden transition-all duration-300 ease-in-out ${isSearchExpanded ? "w-0 opacity-0" : "w-auto opacity-100 flex-shrink-0"}`}
          >
            <h1 className="m-0 text-base font-bold text-[#0E121B] whitespace-nowrap">
              Accountings
            </h1>
            <VideoIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
          </div>

          {/* Left Side: Tabs Container — same pill selector as the Company tabs.
              Never skeletoned: the tabs are navigation, not data, so they stay
              mounted and clickable while the table loads. */}
          <div className="relative flex-shrink-0 hidden lg:inline-flex items-center gap-1.5 h-10 p-1 bg-[#F1F1F5] rounded-full overflow-x-auto no-scrollbar">
            <span
              className="absolute top-1 bottom-1 rounded-full bg-white shadow-sm transition-all duration-300 ease-out pointer-events-none"
              style={{ left: tabIndicator.left, width: tabIndicator.width }}
            />
            {TABS.map((tab) => (
              <button
                key={tab.key}
                ref={(el) => (tabRefs.current[tab.key] = el)}
                onClick={() => setActiveTab(tab.key)}
                className={`relative z-10 flex items-center justify-center h-8 px-4 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${activeTab === tab.key
                  ? "text-[#0085FF]"
                  : "text-gray-700 hover:text-gray-900"
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Right Side: Search, Filter, More, Add */}
          {showLoadingSkeleton ? (
            <div className="flex flex-row items-center gap-2 flex-shrink-0">
              <Skeleton width={40} height={40} shape="circle" />
              <Skeleton width={40} height={40} shape="circle" />
              <Skeleton width={40} height={40} shape="circle" />
              <Skeleton width={140} height={40} shape="circle" className="ml-1" />
            </div>
          ) : (
            <div className="flex flex-row items-center gap-2 justify-end min-w-0 flex-1 lg:flex-initial lg:flex-shrink-0">
              {/* Search field — expands in place from the search icon,
                  matching the Companies strip behaviour: on mobile it grows
                  to fill the space the title vacates (this wrapper becomes
                  flex-1 above); on desktop it's the same fixed 380px as
                  before. */}
              <div
                className={`relative h-10 flex items-center border ${searchTerms[activeTab] ? "border-[#0085FF]" : "border-[#E1E4EA]"} rounded-full bg-white transition-all duration-300 ease-in-out hover:bg-gray-50 focus-within:border-[#0085FF] focus-within:hover:bg-white min-w-0 max-w-full ${isSearchExpanded ? "flex-1 lg:flex-initial lg:w-[380px]" : "w-10 flex-shrink-0"}`}
              >
                <SearchIcon
                  className="absolute left-3 cursor-pointer z-10 flex-shrink-0 top-1/2 -translate-y-1/2 w-4 h-4 text-[#525866]"
                  onClick={() => {
                    setIsSearchExpanded(true);
                    searchInputRef.current?.focus();
                  }}
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchTerms[activeTab]}
                  onChange={(e) =>
                    setSearchTerms((prev) => ({
                      ...prev,
                      [activeTab]: e.target.value,
                    }))
                  }
                  onFocus={() => setIsSearchExpanded(true)}
                  onBlur={() => {
                    if (!searchTerms[activeTab]) setIsSearchExpanded(false);
                  }}
                  placeholder={`Search by ${activeTab === "tax" ? "invoice" : "document"
                    } ID, deal, or date...`}
                  className={`w-full h-full bg-transparent rounded-full pl-11 pr-9 text-[14px] leading-[20px] text-[#1F2937] placeholder:text-[#99A0AE] focus:outline-none transition-opacity duration-200 cursor-pointer ${isSearchExpanded ? "opacity-100 focus:cursor-text" : "opacity-0"}`}
                />
                {/* Clears the typed text only — mousedown+preventDefault stops
                    the input's onBlur from firing before the click lands. */}
                {isSearchExpanded && searchTerms[activeTab] && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() =>
                      setSearchTerms((prev) => ({ ...prev, [activeTab]: "" }))
                    }
                    aria-label="Clear search"
                    className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-5 h-5 rounded-full text-gray-900 hover:bg-gray-100 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" strokeWidth={2.5} />
                  </button>
                )}
              </div>

              {/* Filter Button — status filter. Hidden on mobile; folded into
                  the More menu below instead. */}
              <div className="relative flex-shrink-0 hidden lg:block">
                <button
                  title="Filter by status"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowFilterMenu((v) => !v);
                  }}
                  className={`flex items-center justify-center w-10 h-10 rounded-full border transition-colors bg-white ${filterStatuses[activeTab]
                    ? "border-[#0085FF] text-[#0085FF]"
                    : "border-[#E1E4EA] text-gray-500 hover:bg-gray-50"
                    }`}
                >
                  <FilterIcon size={16} className={filterStatuses[activeTab] ? "text-[#0085FF]" : ""} />
                </button>
                {showFilterMenu && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-lg border border-[#E1E4EA] py-1 z-50"
                  >
                    {["", ...statusOptions].map((status) => (
                      <button
                        key={status || "all"}
                        onClick={() => {
                          setFilterStatuses((prev) => ({
                            ...prev,
                            [activeTab]: status,
                          }));
                          setShowFilterMenu(false);
                        }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${filterStatuses[activeTab] === status
                          ? "text-[#0085FF] font-medium"
                          : "text-gray-700"
                          }`}
                      >
                        {status || "All Statuses"}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* More Options Button */}
              <div className="relative flex-shrink-0">
                <button
                  title="More options"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMoreMenu((v) => !v);
                  }}
                  className="flex items-center justify-center w-10 h-10 rounded-full border border-[#E1E4EA] text-[#525866] hover:bg-gray-50 transition-colors bg-white"
                >
                  <MoreIcon className="w-4 h-4" />
                </button>
                {showMoreMenu && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-lg border border-[#E1E4EA] py-1 z-50"
                  >
                    {/* Tab switcher — folded in here on mobile since the pill
                        selector itself is hidden below lg. */}
                    <div className="lg:hidden py-1 border-b border-[#E1E4EA]">
                      {TABS.map((tab) => (
                        <button
                          key={tab.key}
                          onClick={() => {
                            setActiveTab(tab.key);
                            setShowMoreMenu(false);
                          }}
                          className={`w-full flex items-center gap-2 px-4 py-2 text-sm ${activeTab === tab.key
                            ? "text-[#0085FF] font-medium bg-blue-50"
                            : "text-gray-700 hover:bg-gray-50"
                            }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {/* Filter by status — folded in here on mobile since the
                        standalone filter button is hidden below lg. */}
                    <div className="lg:hidden py-1 border-b border-[#E1E4EA] max-h-48 overflow-y-auto">
                      {["", ...statusOptions].map((status) => (
                        <button
                          key={status || "all"}
                          onClick={() => {
                            setFilterStatuses((prev) => ({
                              ...prev,
                              [activeTab]: status,
                            }));
                            setShowMoreMenu(false);
                          }}
                          className={`w-full text-left px-4 py-2 text-sm ${filterStatuses[activeTab] === status
                            ? "text-[#0085FF] font-medium bg-blue-50"
                            : "text-gray-700 hover:bg-gray-50"
                            }`}
                        >
                          {status || "All Statuses"}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={() => {
                        setShowMoreMenu(false);
                        setShowTemplateDrawer(true);
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <LayoutTemplate className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      Template
                    </button>
                  </div>
                )}
              </div>


              {/* Add Button */}
              <button
                onClick={async () => {
                  // Branding must be complete before creating a tax invoice;
                  // the other document types skip that gate.
                  if (activeTab === "tax") {
                    const canProceed = await checkBrandingBeforeInvoice();
                    if (!canProceed) return;
                  }
                  // All document types now use the same two-pane create screen.
                  setEditPanelDoc(null);
                  setShowCreatePanel(true);
                }}
                /* Figma "Frame 1351649616": 146x44, padding 12, gap 6,
                   #0085FF, radius 96. The fixed 146px width is the spec for the
                   "Add Invoice" label; the longer labels on the other three tabs
                   use it as a minimum so the text isn't clipped. Below lg it
                   collapses to a plain circular + button, same treatment as
                   Companies.jsx's "New Company" button on mobile. */
                style={{
                  width: 40,
                  height: 40,
                  padding: 12,
                  gap: 6,
                  background: "#0085FF",
                  borderRadius: 96,
                }}
                className="flex flex-row justify-center items-center hover:bg-blue-600 transition-colors flex-shrink-0 ml-1 lg:!w-auto"
              >
                <PlusIcon className="w-4 h-4 text-white flex-shrink-0" />
                <span
                  className="hidden lg:inline text-white text-[14px] font-medium leading-[20px] whitespace-nowrap"
                  style={{ minWidth: activeTab === "tax" ? 106 : undefined }}
                >
                  Add {docNameFor(activeTab)}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Main Content Area — full-bleed table, no card. Same fixed scroll
            region Companies.jsx uses: edge to edge under the tab bar, stopping
            above the pagination bar. */}
        <div
          className="fixed right-0 overflow-x-auto overflow-y-auto bg-white top-[calc(118px+var(--dc-offline-offset,0px))] lg:top-[calc(128px+var(--dc-offline-offset,0px))]"
          style={{ left: "var(--sidebar-width, 0px)", bottom: 64, paddingLeft: "var(--content-inset, 16px)" }}
        >
          <table
            className="border-separate border-spacing-0 text-left"
            style={{ minWidth: "100%", width: tableWidth, tableLayout: "fixed" }}
          >
            <thead className="bg-[#F5F7FA] sticky top-0 z-20 select-none">
              <tr>
                <th
                  data-col-id="selection"
                  style={{
                    width: colWidths.selection,
                    position: "sticky",
                    left: 0,
                    zIndex: 25,
                  }}
                  className="relative px-4 py-3 border-b border-r border-[#E1E4EA] bg-[#F5F7FA]"
                >
                  <div className="flex justify-center items-center w-full">
                    <Checkbox checked={
                        selectedIds.length === currentDocuments.length &&
                        currentDocuments.length > 0
                      } onChange={handleSelectAll}  uncheckedColor="text-[#525866]"/>
                  </div>
                  <ResizeHandle colId="selection" />
                </th>

                {orderedColumns.map((col) => {
                  const isDragging = draggedColKey === col.id;
                  const isDragOver =
                    dragOverColKey === col.id &&
                    draggedColKey &&
                    draggedColKey !== col.id;

                  return (
                    <th
                      key={col.id}
                      data-col-id={col.id}
                      onMouseDown={(e) => startColumnDrag(e, col.id)}
                      title="Drag to move this column"
                      style={{
                        width: colWidths[col.id],
                        opacity: isDragging ? 0.35 : 1,
                        ...stickyStyleFor(col.id),
                      }}
                      className={`relative px-4 py-3 text-left text-sm font-bold text-[#525866] whitespace-nowrap border-b border-r border-[#E1E4EA] transition-colors ${isDragOver ? "bg-blue-100" : "bg-[#F5F7FA] hover:bg-[#EDF0F5]"
                        } ${draggedColKey ? "cursor-grabbing" : "cursor-grab"
                        } active:cursor-grabbing`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate flex-1 min-w-0 flex items-center gap-1.5">
                          <span className="truncate">
                            {typeof col.label === "function"
                              ? col.label(activeTab)
                              : col.label}
                          </span>
                          {activeSort.key === col.id && (activeSort.direction === "asc"
                            ? <ArrowUp className="w-3 h-3 text-[#0085FF] flex-shrink-0" />
                            : <ArrowDown className="w-3 h-3 text-[#0085FF] flex-shrink-0" />)}
                          {pinnedCols[col.id] && (
                            <Pin
                              size={12}
                              className="text-blue-500 fill-blue-500 flex-shrink-0 ml-1"
                              style={{ transform: "rotate(45deg)" }}
                            />
                          )}
                        </span>
                        <button
                          onClick={(e) => openColumnMenu(e, col.id)}
                          title="Column options"
                          className="p-1 rounded hover:bg-gray-200 transition-colors text-gray-500 flex-shrink-0"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <ResizeHandle colId={col.id} />
                      {boundaryShadowSideFor(col.id) && (
                        <div style={getPinnedBoundaryOverlayStyle(boundaryShadowSideFor(col.id))} />
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="bg-white">
              {showLoadingSkeleton && (
                <TableSkeletonRows
                  numRows={pagination.limit}
                  columns={orderedColumns.map((c) => colWidths[c.id])}
                  hasCheckbox
                  checkboxWidth={colWidths.selection}
                />
              )}
              {!showLoadingSkeleton && !currentLoading && currentDocuments.length === 0 && (
                <tr>
                  <td colSpan={orderedColumns.length + 1} className="px-6 py-20 text-center">
                    <PdfIcon className="w-10 h-10 mx-auto text-gray-300 mb-3" />
                    <p className="text-sm font-medium text-gray-500">
                      Create New {docNameFor(activeTab)}
                    </p>
                  </td>
                </tr>
              )}
              {!showLoadingSkeleton && currentDocuments.map((doc) => (
                <tr
                  key={doc?._id}
                  className={`bg-white hover:bg-blue-50 transition-colors ${selectedIds.includes(doc._id) ? "!bg-blue-50" : ""
                    }`}
                  style={{ height: 37, maxHeight: 37 }}
                >
                  <td
                    style={{
                      width: colWidths.selection,
                      position: "sticky",
                      left: 0,
                      zIndex: 10,
                    }}
                    className="px-4 py-2 align-middle border-b border-r border-[#E1E4EA] overflow-hidden bg-inherit"
                  >
                    <div className="flex justify-center items-center w-full">
                      <Checkbox checked={selectedIds.includes(doc._id)} onChange={() => handleSelectOne(doc._id)} />
                    </div>
                  </td>

                  {orderedColumns.map((col, colIdx) => {
                    const isLastCol = colIdx === orderedColumns.length - 1;
                    return (
                      <td
                        key={col.id}
                        style={{
                          width: colWidths[col.id],
                          ...stickyStyleFor(col.id),
                        }}
                        className="relative px-4 py-2 align-middle whitespace-nowrap border-b border-r border-[#E1E4EA] bg-inherit"
                      >
                        <div style={{ overflow: "hidden" }}>
                          {isLastCol ? (
                            <div className="flex items-center justify-between gap-2 w-full">
                              {renderCell(col.id, doc)}
                              {renderRowActions(doc)}
                            </div>
                          ) : (
                            renderCell(col.id, doc)
                          )}
                        </div>
                        {boundaryShadowSideFor(col.id) && (
                          <div style={getPinnedBoundaryOverlayStyle(boundaryShadowSideFor(col.id))} />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Shared column popup — one menu, used by every column on all four
            tabs. Opens on a single click of the header's chevron button. */}
        {openColumnMenuKey &&
          columnMenuPos &&
          createPortal(
            <>
              <div className="fixed inset-0 z-[9998]" onClick={closeColumnMenu} />
              <div
                style={{
                  position: "fixed",
                  top: columnMenuPos.top,
                  left: columnMenuPos.left,
                }}
                className="w-[176px] z-[9999] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5"
              >
                {(() => {
                  const col = COLUMN_DEFS.find(
                    (c) => c.id === openColumnMenuKey
                  );
                  if (!col) return null;
                  const side = pinnedCols[col.id];
                  const sortKey = fieldFor(col, activeTab);
                  const itemClass =
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap";

                  return (
                    <>
                      <button
                        onClick={() => {
                          closeColumnMenu();
                          setColumnPin(col.id, "left");
                        }}
                        className={`${itemClass} ${side === "left"
                          ? "bg-blue-50 text-blue-700"
                          : "text-[#161618] hover:bg-gray-50"
                          }`}
                      >
                        {side === "left" ? (
                          <PinOff className="w-3.5 h-3.5" />
                        ) : (
                          <Pin className="w-3.5 h-3.5 text-[#1C1B1F]" />
                        )}
                        {side === "left" ? "Unpin" : "Pin to Left"}
                      </button>
                      <button
                        onClick={() => {
                          closeColumnMenu();
                          setColumnPin(col.id, "right");
                        }}
                        className={`${itemClass} ${side === "right"
                          ? "bg-blue-50 text-blue-700"
                          : "text-[#161618] hover:bg-gray-50"
                          }`}
                      >
                        {side === "right" ? (
                          <PinOff className="w-3.5 h-3.5" />
                        ) : (
                          <Pin className="w-3.5 h-3.5 text-[#1C1B1F]" />
                        )}
                        {side === "right" ? "Unpin" : "Pin to Right"}
                      </button>

                      {sortKey && (
                        <>
                          <button
                            onClick={() => {
                              closeColumnMenu();
                              const isActive = activeSort.key === sortKey && activeSort.direction === "asc";
                              setSortConfigs((prev) => ({
                                ...prev,
                                [activeTab]: isActive
                                  ? { key: null, direction: null }
                                  : { key: sortKey, direction: "asc" },
                              }));
                              setPaginations((prev) => ({
                                ...prev,
                                [activeTab]: {
                                  ...prev[activeTab],
                                  currentPage: 1,
                                },
                              }));
                            }}
                            className={`${itemClass} ${activeSort.key === sortKey && activeSort.direction === "asc" ? "bg-blue-50 text-blue-700 font-medium" : "text-[#161618] hover:bg-gray-50"}`}
                          >
                            <ChevronUp className="w-3.5 h-3.5 text-[#1C1B1F]" />
                            Sort Ascending
                          </button>
                          <button
                            onClick={() => {
                              closeColumnMenu();
                              const isActive = activeSort.key === sortKey && activeSort.direction === "desc";
                              setSortConfigs((prev) => ({
                                ...prev,
                                [activeTab]: isActive
                                  ? { key: null, direction: null }
                                  : { key: sortKey, direction: "desc" },
                              }));
                              setPaginations((prev) => ({
                                ...prev,
                                [activeTab]: {
                                  ...prev[activeTab],
                                  currentPage: 1,
                                },
                              }));
                            }}
                            className={`${itemClass} ${activeSort.key === sortKey && activeSort.direction === "desc" ? "bg-blue-50 text-blue-700 font-medium" : "text-[#161618] hover:bg-gray-50"}`}
                          >
                            <ChevronDown className="w-3.5 h-3.5 text-[#1C1B1F]" />
                            Sort Descending
                          </button>
                        </>
                      )}

                      <div className="w-full border-t border-[#F1F1F5] my-0.5" />

                      <button
                        disabled={col.required}
                        onClick={() => {
                          if (col.required) return;
                          closeColumnMenu();
                          setHiddenCols((prev) => [...prev, col.id]);
                        }}
                        className={`${itemClass} ${col.required
                          ? "text-gray-300 cursor-not-allowed"
                          : "text-[#161618] hover:bg-gray-50"
                          }`}
                      >
                        <EyeOff
                          className={`w-3.5 h-3.5 ${col.required ? "text-gray-300" : "text-[#1C1B1F]"
                            }`}
                        />
                        Hide Column
                      </button>
                    </>
                  );
                })()}
              </div>
            </>,
            document.body
          )}

        {/* Drag ghost — the floating column panel that follows the cursor,
            carrying the header plus that column's cell values. */}
        {dragGhost &&
          createPortal(
            <div
              ref={ghostElRef}
              style={{
                position: "fixed",
                top: -9999,
                left: -9999,
                width: dragGhost.width,
                zIndex: 10000,
                pointerEvents: "none",
              }}
              className="flex flex-col bg-white rounded-lg shadow-2xl overflow-hidden"
            >
              <div
                className="px-4 py-3 bg-[#F5F7FA] border-b border-[#E1E4EA]"
                style={{ height: dragGhost.height }}
              >
                <span className="text-sm font-bold text-[#525866] truncate block">
                  {dragGhost.label}
                </span>
              </div>
              {dragGhost.previewRows.map((rowVal, i) => (
                <div
                  key={i}
                  className="px-4 py-2 border-b border-[#F1F1F5] last:border-b-0"
                >
                  <span className="text-sm text-gray-700 truncate block">
                    {rowVal}
                  </span>
                </div>
              ))}
            </div>,
            document.body
          )}

        {/* Restore hidden columns */}
        {hiddenCols.length > 0 && (
          <button
            onClick={() => setHiddenCols([])}
            className="fixed z-[9993] bottom-[76px] right-6 h-9 px-3.5 flex items-center gap-1.5 rounded-full bg-white border border-[#E1E4EA] shadow-sm text-xs font-medium text-[#525866] hover:bg-gray-50 transition-colors"
          >
            <EyeIcon className="w-3.5 h-3.5" />
            Show {hiddenCols.length} hidden column
            {hiddenCols.length > 1 ? "s" : ""}
          </button>
        )}

        {/* Pagination bar — its own fixed strip below the table, not inside it
            (same treatment as Companies.jsx). */}
        {!showForm && !showCreatePanel && (
          <div
            className={`fixed bottom-0 right-0 bg-white border-t border-[#E1E4EA] shadow-sm z-[9992] flex items-center justify-between px-4 sm:px-6 lg:px-8 ${isSearchOverlayOpen ? "pointer-events-none" : ""}`}
            style={{
              left: "var(--sidebar-width, 0px)",
              height: 64,
              filter: isSearchOverlayOpen ? "brightness(0.6)" : "none",
            }}
          >
            {/* Mobile — same simple Previous/Next fallback as Companies.jsx,
                instead of cramming the full desktop layout (Showing X of Y +
                per-page dropdown + numbered pages) into a narrow viewport. */}
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => handlePageChange(activeTab, pagination.currentPage - 1)}
                disabled={!pagination.hasPrevPage}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => handlePageChange(activeTab, pagination.currentPage + 1)}
                disabled={!pagination.hasNextPage}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>

            <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
            {showLoadingSkeleton ? (
              <div className="flex items-center gap-2">
                <Skeleton width={190} height={14} />
                <Skeleton width={110} height={30} />
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <p className="text-sm text-gray-700 font-inter">
                  Showing{" "}
                  <span className="font-semibold">
                    {pagination.totalCount === 0
                      ? 0
                      : (pagination.currentPage - 1) * pagination.limit + 1}
                  </span>{" "}
                  to{" "}
                  <span className="font-semibold">
                    {Math.min(
                      pagination.currentPage * pagination.limit,
                      pagination.totalCount
                    )}
                  </span>{" "}
                  of <span className="font-semibold">{pagination.totalCount}</span>{" "}
                  {pluralNameFor(activeTab)}
                </p>
                <div className="relative ml-2">
                  <select
                    value={pagination.limit}
                    onChange={(e) =>
                      handleLimitChange(activeTab, parseInt(e.target.value))
                    }
                    className="appearance-none border border-gray-300 rounded-lg pl-3 pr-8 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer font-inter"
                  >
                    <option value={10}>10 per page</option>
                    <option value={20}>20 per page</option>
                    <option value={50}>50 per page</option>
                    <option value={100}>100 per page</option>
                    <option value={150}>150 per page</option>
                  </select>
                  <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                </div>
              </div>
            )}

            {showLoadingSkeleton ? (
              <div className="flex items-center gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} width={32} height={32} shape="circle" />
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    handlePageChange(activeTab, pagination.currentPage - 1)
                  }
                  disabled={!pagination.hasPrevPage}
                  className="flex items-center justify-center w-8 h-8 rounded-full border border-[#E1E4EA] bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                {pagination.totalPages > 0 &&
                  (() => {
                    const { currentPage, totalPages } = pagination;
                    const commitPage = () => {
                      const n = parseInt(pageInput, 10);
                      if (!Number.isNaN(n)) {
                        // Typing a page past the last one lands on the last page,
                        // not an out-of-range one.
                        handlePageChange(activeTab, Math.min(Math.max(n, 1), totalPages));
                      }
                      setEditingPage(false);
                    };

                    return pageItems.map((item, index) => {
                      if (item === "left-dots" || item === "right-dots") {
                        return (
                          <span
                            key={`${item}-${index}`}
                            className="flex items-center justify-center w-8 h-8 text-sm font-medium text-gray-400 select-none"
                          >
                            ....
                          </span>
                        );
                      }
                      const isCurrent = item === currentPage;
                      if (isCurrent && editingPage) {
                        return (
                          <input
                            key="page-edit"
                            autoFocus
                            type="number"
                            min={1}
                            max={totalPages}
                            value={pageInput}
                            onChange={(e) => setPageInput(e.target.value)}
                            onBlur={commitPage}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitPage();
                              if (e.key === "Escape") setEditingPage(false);
                            }}
                            className="w-10 h-8 rounded-full border border-blue-500 text-center text-sm font-medium text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          />
                        );
                      }
                      return (
                        <button
                          key={`page-${item}`}
                          onClick={() => handlePageChange(activeTab, item)}
                          onDoubleClick={() => {
                            if (isCurrent) {
                              setPageInput(String(currentPage));
                              setEditingPage(true);
                            }
                          }}
                          title={
                            isCurrent ? "Double-click to type a page number" : undefined
                          }
                          className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors ${isCurrent
                            ? "bg-[#0085FF] text-white"
                            : "bg-white border border-[#E1E4EA] text-gray-700 hover:bg-gray-50"
                            }`}
                        >
                          {item}
                        </button>
                      );
                    });
                  })()}

                <button
                  onClick={() =>
                    handlePageChange(activeTab, pagination.currentPage + 1)
                  }
                  disabled={!pagination.hasNextPage}
                  className="flex items-center justify-center w-8 h-8 rounded-full border border-[#E1E4EA] bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
            </div>
          </div>
        )}

        {/* Two-pane create/edit screen — each document type uses its own
            thin wrapper around the shared CreateInvoicePanel. */}
        {showCreatePanel && (() => {
          // `key` is pulled out to its own variable rather than living inside
          // panelProps — React warns (and reconciliation misbehaves) if a
          // spread object passed as {...panelProps} still contains a "key"
          // field, since JSX must see key directly on the element itself.
          const panelKey = `${activeTab}-${editPanelDoc?._id || "new"}`;
          const panelProps = {
            deals,
            initialDoc: editPanelDoc,
            conversionData,
            defaultDueDateDays,
            documentTypeSettings,
            defaultNotesByType,
            defaultTermsByType,
            defaultNotesFlat,
            defaultTermsFlat,
            onFullView: (doc) => handleView(doc, activeTab),
            onClose: () => {
              setShowCreatePanel(false);
              setEditPanelDoc(null);
              setConversionData(null);
              setFormHandoff(null);
              // Deliberately NOT resetting invoiceFullWidth/quotationFullWidth/
              // performaFullWidth/challanFullWidth here — each is a per-tab view
              // preference that should persist across opens/closes (and across
              // switching tabs) exactly like the other three already do, until
              // the user explicitly collapses it back via that document type's
              // own onExitFullWidth (the minimize button).
            },
            onCreated: () => fetchData(activeTab),
            onAddDeal: async () => {
              if (companies.length === 0 || contacts.length === 0) {
                try {
                  const [c, ct] = await Promise.all([
                    API.get("/companies"),
                    API.get("/contacts"),
                  ]);
                  setCompanies(c.data || []);
                  setContacts(ct.data || []);
                } catch (err) {
                  console.error("Failed to load companies/contacts", err);
                }
              }
              setShowQuickDealForm(true);
            },
          };
          switch (activeTab) {
            case "tax": return invoiceFullWidth ? (
              <InvoiceFormFull
                deals={deals}
                isOpen={true}
                onClose={panelProps.onClose}
                onExitFullWidth={(currentForm) => { setFormHandoff(currentForm); setInvoiceFullWidth(false); }}
                formOverride={formHandoff}
                fetchData={() => fetchData("tax")}
                editingInvoice={panelProps.initialDoc}
                conversionData={panelProps.conversionData}
                documentTypeSettings={documentTypeSettings}
                defaultDueDateDays={defaultDueDateDays}
                defaultNotesByType={defaultNotesByType}
                defaultTermsByType={defaultTermsByType}
                defaultNotesFlat={defaultNotesFlat}
                defaultTermsFlat={defaultTermsFlat}
                onPreview={(formData) => {
                  if (!formData.style) {
                    toast.error("Please select an invoice style to preview.");
                    return;
                  }
                  setPreviewStyle(formData.style);
                  setPreviewType("tax");
                  setShowPreview(true);
                }}
              />
            ) : (
              <CreateInvoicePanel
                key={panelKey}
                {...panelProps}
                type="tax"
                formOverride={formHandoff}
                onRequestFullWidth={(currentForm) => { setFormHandoff(currentForm); setInvoiceFullWidth(true); }}
              />
            );
            // Split view by default; the panel's expand button flips
            // quotationFullWidth, swapping in the full-width QuotationForm
            // (its own fixed overlay), which flips back via onExitFullWidth.
            case "quotation": return quotationFullWidth ? (
              <QuotationForm
                deals={deals}
                isOpen={true}
                onClose={panelProps.onClose}
                onExitFullWidth={(currentForm) => { setFormHandoff(currentForm); setQuotationFullWidth(false); }}
                formOverride={formHandoff}
                fetchData={() => fetchData("quotation")}
                editingQuotation={panelProps.initialDoc}
                conversionData={panelProps.conversionData}
                documentTypeSettings={documentTypeSettings}
                defaultDueDateDays={defaultDueDateDays}
                defaultNotesByType={defaultNotesByType}
                defaultTermsByType={defaultTermsByType}
                defaultNotesFlat={defaultNotesFlat}
                defaultTermsFlat={defaultTermsFlat}
                onPreview={(formData) => {
                  if (!formData.style) {
                    toast.error("Please select a Quotation style to preview.");
                    return;
                  }
                  setPreviewStyle(formData.style);
                  setPreviewType("quotation");
                  setShowPreview(true);
                }}
              />
            ) : (
              <CreateQuotationPanel
                key={panelKey}
                {...panelProps}
                formOverride={formHandoff}
                onRequestFullWidth={(currentForm) => { setFormHandoff(currentForm); setQuotationFullWidth(true); }}
              />
            );
            case "performa": return performaFullWidth ? (
              <PerformaInvoiceFormFull
                deals={deals}
                isOpen={true}
                onClose={panelProps.onClose}
                onExitFullWidth={(currentForm) => { setFormHandoff(currentForm); setPerformaFullWidth(false); }}
                formOverride={formHandoff}
                fetchData={() => fetchData("performa")}
                editingPerformaInvoice={panelProps.initialDoc}
                conversionData={panelProps.conversionData}
                documentTypeSettings={documentTypeSettings}
                defaultDueDateDays={defaultDueDateDays}
                defaultNotesByType={defaultNotesByType}
                defaultTermsByType={defaultTermsByType}
                defaultNotesFlat={defaultNotesFlat}
                defaultTermsFlat={defaultTermsFlat}
                onPreview={(formData) => {
                  if (!formData.style) {
                    toast.error("Please select a Pro Forma invoice style to preview.");
                    return;
                  }
                  setPreviewStyle(formData.style);
                  setPreviewType("performa");
                  setShowPreview(true);
                }}
              />
            ) : (
              <CreatePerformaPanel
                key={panelKey}
                {...panelProps}
                formOverride={formHandoff}
                onRequestFullWidth={(currentForm) => { setFormHandoff(currentForm); setPerformaFullWidth(true); }}
              />
            );
            case "deliveryChallan": return challanFullWidth ? (
              <DeliveryChallanFormFull
                deals={deals}
                isOpen={true}
                onClose={panelProps.onClose}
                onExitFullWidth={(currentForm) => { setFormHandoff(currentForm); setChallanFullWidth(false); }}
                formOverride={formHandoff}
                fetchData={() => fetchData("deliveryChallan")}
                editingDeliveryChallan={panelProps.initialDoc}
                conversionData={panelProps.conversionData}
                documentTypeSettings={documentTypeSettings}
                defaultDueDateDays={defaultDueDateDays}
                defaultNotesByType={defaultNotesByType}
                defaultTermsByType={defaultTermsByType}
                defaultNotesFlat={defaultNotesFlat}
                defaultTermsFlat={defaultTermsFlat}
              />
            ) : (
              <CreateChallanPanel
                key={panelKey}
                {...panelProps}
                formOverride={formHandoff}
                onRequestFullWidth={(currentForm) => { setFormHandoff(currentForm); setChallanFullWidth(true); }}
              />
            );
            default: return null;
          }
        })()}
        {showQuickDealForm && (
          <QuickDealForm
            companies={companies}
            contacts={contacts}
            onDealCreated={(newDeal) => {
              setDeals((prev) => [...prev, newDeal]);
              setShowQuickDealForm(false);
            }}
            onRequestClose={() => setShowQuickDealForm(false)}
          />
        )}

        {/* Forms — reused as-is from the Invoices module */}
        {showForm && editingType === "tax" && (
          invoiceFullWidth ? (
            <InvoiceFormFull
              deals={deals}
              isOpen={showForm}
              onClose={() => {
                setShowForm(false);
                setEditing(null);
                setEditingType(null);
                setInvoiceFullWidth(false);
              }}
              fetchData={() => fetchData("tax")}
              editingInvoice={editing}
              onExitFullWidth={() => setInvoiceFullWidth(false)}
              documentTypeSettings={documentTypeSettings}
              defaultDueDateDays={defaultDueDateDays}
              defaultNotesByType={defaultNotesByType}
              defaultTermsByType={defaultTermsByType}
              defaultNotesFlat={defaultNotesFlat}
              defaultTermsFlat={defaultTermsFlat}
              onPreview={(formData) => {
                if (!formData.style) {
                  toast.error("Please select an invoice style to preview.");
                  return;
                }
                setPreviewStyle(formData.style);
                setPreviewType("tax");
                setShowPreview(true);
              }}
            />
          ) : (
            <InvoiceForm
              deals={deals}
              isOpen={showForm}
              onClose={() => {
                setShowForm(false);
                setEditing(null);
                setEditingType(null);
              }}
              fetchData={() => fetchData("tax")}
              editingInvoice={editing}
              defaultDueDateDays={defaultDueDateDays}
              documentTypeSettings={documentTypeSettings}
              defaultNotesByType={defaultNotesByType}
              defaultTermsByType={defaultTermsByType}
              defaultNotesFlat={defaultNotesFlat}
              defaultTermsFlat={defaultTermsFlat}
              onRequestFullWidth={() => setInvoiceFullWidth(true)}
              onPreview={(formData) => {
                if (!formData.style) {
                  toast.error("Please select an invoice style to preview.");
                  return;
                }
                setPreviewStyle(formData.style);
                setPreviewType("tax");
                setShowPreview(true);
              }}
            />
          )
        )}
        {showForm && editingType === "performa" && (
          performaFullWidth ? (
            <PerformaInvoiceFormFull
              deals={deals}
              isOpen={showForm}
              onClose={() => {
                setShowForm(false);
                setEditing(null);
                setEditingType(null);
                setPerformaFullWidth(false);
              }}
              fetchData={() => fetchData("performa")}
              editingPerformaInvoice={editing}
              onExitFullWidth={() => setPerformaFullWidth(false)}
              documentTypeSettings={documentTypeSettings}
              defaultDueDateDays={defaultDueDateDays}
              defaultNotesByType={defaultNotesByType}
              defaultTermsByType={defaultTermsByType}
              defaultNotesFlat={defaultNotesFlat}
              defaultTermsFlat={defaultTermsFlat}
              onPreview={(formData) => {
                if (!formData.style) {
                  toast.error("Please select a Pro Forma invoice style to preview.");
                  return;
                }
                setPreviewStyle(formData.style);
                setPreviewType("performa");
                setShowPreview(true);
              }}
            />
          ) : (
            <PerformaInvoiceForm
              deals={deals}
              isOpen={showForm}
              onClose={() => {
                setShowForm(false);
                setEditing(null);
                setEditingType(null);
              }}
              fetchData={() => fetchData("performa")}
              editingPerformaInvoice={editing}
              defaultDueDateDays={defaultDueDateDays}
              documentTypeSettings={documentTypeSettings}
              defaultNotesByType={defaultNotesByType}
              defaultTermsByType={defaultTermsByType}
              defaultNotesFlat={defaultNotesFlat}
              defaultTermsFlat={defaultTermsFlat}
              onRequestFullWidth={() => setPerformaFullWidth(true)}
              onPreview={(formData) => {
                if (!formData.style) {
                  toast.error("Please select a Pro Forma invoice style to preview.");
                  return;
                }
                setPreviewStyle(formData.style);
                setPreviewType("performa");
                setShowPreview(true);
              }}
            />
          )
        )}
        {showForm && editingType === "quotation" && (
          <QuotationForm
            deals={deals}
            isOpen={showForm}
            onClose={() => {
              setShowForm(false);
              setEditing(null);
              setEditingType(null);
            }}
            fetchData={() => fetchData("quotation")}
            editingQuotation={editing}
            documentTypeSettings={documentTypeSettings}
            defaultDueDateDays={defaultDueDateDays}
            defaultNotesByType={defaultNotesByType}
            defaultTermsByType={defaultTermsByType}
            defaultNotesFlat={defaultNotesFlat}
            defaultTermsFlat={defaultTermsFlat}
            onPreview={(formData) => {
              if (!formData.style) {
                toast.error("Please select a Quotation style to preview.");
                return;
              }
              setPreviewStyle(formData.style);
              setPreviewType("quotation");
              setShowPreview(true);
            }}
          />
        )}
        {showForm && editingType === "deliveryChallan" && (
          challanFullWidth ? (
            <DeliveryChallanFormFull
              deals={deals}
              isOpen={showForm}
              onClose={() => {
                setShowForm(false);
                setEditing(null);
                setEditingType(null);
                setChallanFullWidth(false);
              }}
              fetchData={() => fetchData("deliveryChallan")}
              editingDeliveryChallan={editing}
              onExitFullWidth={() => setChallanFullWidth(false)}
              documentTypeSettings={documentTypeSettings}
              defaultDueDateDays={defaultDueDateDays}
              defaultNotesByType={defaultNotesByType}
              defaultTermsByType={defaultTermsByType}
              defaultNotesFlat={defaultNotesFlat}
              defaultTermsFlat={defaultTermsFlat}
            />
          ) : (
            <DeliveryChallanForm
              deals={deals}
              isOpen={showForm}
              onClose={() => {
                setShowForm(false);
                setEditing(null);
                setEditingType(null);
              }}
              fetchData={() => fetchData("deliveryChallan")}
              editingDeliveryChallan={editing}
              defaultDueDateDays={defaultDueDateDays}
              documentTypeSettings={documentTypeSettings}
              defaultNotesByType={defaultNotesByType}
              defaultTermsByType={defaultTermsByType}
              defaultNotesFlat={defaultNotesFlat}
              defaultTermsFlat={defaultTermsFlat}
              onRequestFullWidth={() => setChallanFullWidth(true)}
            />
          )
        )}

        {showPreview && previewType === "performa" ? (
          <PerformaInvoiceStylePreview
            style={previewStyle}
            isOpen={showPreview}
            onClose={() => {
              setShowPreview(false);
              setPreviewStyle(null);
              setPreviewType(null);
            }}
          />
        ) : (
          showPreview && (
            <InvoiceStylePreview
              style={previewStyle}
              isOpen={showPreview}
              onClose={() => {
                setShowPreview(false);
                setPreviewStyle(null);
                setPreviewType(null);
              }}
            />
          )
        )}

        {/* Template picker — right-hand drawer opened from the toolbar's
            three-dot menu, scoped to whichever tab is active. */}
        <TemplateDrawer
          isOpen={showTemplateDrawer}
          onClose={() => setShowTemplateDrawer(false)}
          type={activeTab}
          docLabel={docNameFor(activeTab)}
        />

        <InvoiceViewer
          isOpen={showViewer}
          onClose={() => {
            setShowViewer(false);
            setViewerId(null);
            setViewerType(null);
            setViewerDoc(null);
          }}
          id={viewerId}
          type={viewerType}
          doc={viewerDoc}
          onEdit={() => {
            setShowViewer(false);
            handleEdit(viewerDoc, viewerType);
          }}
          onDownload={() => handleDownload(viewerId, viewerType)}
          onSend={() => handleSend(viewerDoc, viewerType)}
          onConvert={(targetType) =>
            handleConvert(viewerId, viewerType, targetType)
          }
        />
        <DeleteConfirmModal
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={confirmDelete}
          docType={deleteDocType}
        />
        {showBulkDeleteModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100003]">
            <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-red-100 p-2 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">
                  Confirm Deletion
                </h2>
              </div>
              <p className="text-sm text-gray-600 mb-6">
                Are you sure you want to delete{" "}
                <strong>{selectedIds.length}</strong> selected{" "}
                {docNameFor(activeTab)}
                {selectedIds.length !== 1 ? "s" : ""}? This action cannot be
                undone.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowBulkDeleteModal(false)}
                  disabled={bulkDeleting}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmBulkDelete}
                  disabled={bulkDeleting}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium flex items-center gap-2 disabled:opacity-50"
                >
                  <DeleteIcon className="w-4 h-4" />
                  {bulkDeleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}
        {showBulkUpdateModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100003]">
            <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <EditIcon className="w-5 h-5 text-blue-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Bulk Update</h2>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Set a status for{" "}
                <strong>{selectedIds.length}</strong> selected{" "}
                {docNameFor(activeTab)}
                {selectedIds.length !== 1 ? "s" : ""}.
              </p>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Status
              </label>
              <select
                value={bulkUpdateStatus}
                onChange={(e) => setBulkUpdateStatus(e.target.value)}
                className="w-full mb-6 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="">Select status…</option>
                {statusOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowBulkUpdateModal(false)}
                  disabled={bulkUpdating}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmBulkUpdate}
                  disabled={bulkUpdating || !bulkUpdateStatus}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2 disabled:opacity-50"
                >
                  <EditIcon className="w-4 h-4" />
                  {bulkUpdating ? "Updating..." : "Update"}
                </button>
              </div>
            </div>
          </div>
        )}
        <ConvertConfirmModal
          isOpen={showConvertModal}
          onClose={() => setShowConvertModal(false)}
          onConfirm={confirmConvert}
          docType={convertDocType}
          targetType={convertTargetType}
        />
        <RecordPaymentModal
          isOpen={paymentModalOpen}
          onClose={() => {
            setPaymentModalOpen(false);
            setSelectedInvoiceForPayment(null);
          }}
          invoice={selectedInvoiceForPayment}
          onSuccess={() => {
            setPaymentModalOpen(false);
            setSelectedInvoiceForPayment(null);
            fetchData("tax");
          }}
        />
        <QuickBrandingModal
          isOpen={showBrandingModal}
          onClose={() => {
            setShowBrandingModal(false);
            setPendingInvoiceCreation(false);
          }}
          onComplete={() => {
            if (pendingInvoiceCreation) {
              // Same two-pane panel the "Add [Document]" button opens when
              // branding is already complete — branding-gated tax invoices
              // now land in the same place as every other create/edit flow.
              setEditPanelDoc(null);
              setShowCreatePanel(true);
              setPendingInvoiceCreation(false);
            }
          }}
        />

        <BulkEmailGroupedModal
          isOpen={showBulkEmailGroupedModal}
          onClose={() => setShowBulkEmailGroupedModal(false)}
          selectedIds={selectedIds}
          documents={documents["tax"] || []}
          onSuccess={() => {
            setSelectedIds([]);
            fetchData("tax");
          }}
        />
        <BulkSignatureModal
          isOpen={showBulkSignatureModal}
          onClose={() => setShowBulkSignatureModal(false)}
          onConfirm={(dataUrl) => handleBulkSignatureUpdate(dataUrl, false)}
        />
        {shareMenu && createPortal(
          <>
            {/* Above the row menu's own backdrop (z-[100050]/[100051]) — see
                the Convert flyout's identical comment above. */}
            <div className="fixed inset-0 z-[100060]" onClick={() => { setShareMenu(null); setShareMenuChannel(null); }} />
            <div
              className="fixed z-[100061] w-[160px] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5"
              style={{ top: shareMenu.y, left: shareMenu.x }}
            >
              {(() => {
                const link = `${window.location.origin}/view/${apiPathFor(shareMenu.type)}/${shareMenu.doc._id}`;
                const num = shareMenu.doc[numberKeyFor(shareMenu.type)];
                const d = shareMenu.doc;
                const t = shareMenu.type;
                const customerName = d.deal?.contactPerson || d.deal?.title || "Customer";
                const amt = d.amount != null ? `₹${Number(d.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "";
                const closeMenu = () => { setShareMenu(null); setShareMenuChannel(null); };
                const fillTpl = (tpl) => tpl
                  .replace(/{customerName}/g, customerName)
                  .replace(/{docType}/g, docNameFor(t))
                  .replace(/{number}/g, num || "")
                  .replace(/{amount}/g, amt)
                  .replace(/{link}/g, link)
                  .replace(/{company}/g, shareCompanyName || "");

                // Matches the fixed shape shown in Settings → Message Templates →
                // WhatsApp preview: greeting/details/footer are fixed, only the
                // two lines are user-editable.
                const buildWaMsg = (tpl) => `Hello ${customerName || ""},\n\n${tpl?.line1 || "Your " + docNameFor(t) + " from " + (shareCompanyName || "us") + " is ready."}\n\nDocument: ${num || "n/a"}\nTotal: ${amt}\nView/download: ${link}${tpl?.line2 ? `\n\n${tpl.line2}` : ""}\n\nRegards,\n${shareCompanyName || "the sender"}`;
                const buildSmsMsg = (tpl) => tpl?.body
                  ? fillTpl(tpl.body)
                  : `${shareCompanyName || "We"}: your ${docNameFor(t)}${num ? ` ${num}` : ""} is ready. View/download: ${link}`;
                const buildEmailSubject = (tpl) => tpl?.subject ? fillTpl(tpl.subject) : `${docNameFor(t)} ${num || ""}${shareCompanyName ? ` from ${shareCompanyName}` : ""}`.trim();
                const buildEmailBody = (tpl) => tpl?.body
                  ? fillTpl(tpl.body)
                  : `Dear ${customerName || "Sir/Madam"},\n\nPlease find attached your ${docNameFor(t)}${num ? ` ${num}` : ""}.\n\nYou can also view or download it online: ${link}\n\nRegards,\n${shareCompanyName || "the sender"}`;

                const channels = {
                  whatsapp: {
                    list: waTemplatesList,
                    send: (tpl) => { window.open(`https://wa.me/?text=${encodeURIComponent(buildWaMsg(tpl))}`, "_blank"); closeMenu(); },
                  },
                  email: {
                    list: emailTemplatesList,
                    send: (tpl) => {
                      setEmailComposeTo(d.deal?.contact?.email || d.deal?.company?.email || d.deal?.email || "");
                      setEmailComposeSubject(buildEmailSubject(tpl));
                      setEmailComposeBody(textToEmailHtml(buildEmailBody(tpl)));
                      setEmailCompose({ doc: d, type: t });
                      closeMenu();
                    },
                  },
                  sms: {
                    list: smsTemplatesList,
                    send: (tpl) => {
                      setSmsComposeTo(d.deal?.contact?.phone || d.deal?.company?.phone || d.deal?.phone || "");
                      setSmsComposeBody(buildSmsMsg(tpl));
                      setSmsCompose({ doc: d, type: t });
                      closeMenu();
                    },
                  },
                };

                // 0 or 1 saved template → send straight away with it (or the
                // built-in fallback). 2+ → let the user pick which one.
                const openChannel = (channel) => {
                  const { list, send } = channels[channel];
                  if (list.length <= 1) send(list[0] || null);
                  else setShareMenuChannel(channel);
                };

                if (shareMenuChannel) {
                  const { list, send } = channels[shareMenuChannel];
                  return (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); setShareMenuChannel(null); }}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium text-gray-500 hover:bg-gray-50 border-b border-[#F1F1F5] mb-0.5 whitespace-nowrap"
                      >
                        ← Back
                      </button>
                      {list.map((tpl) => (
                        <button
                          key={tpl.id}
                          onClick={(e) => { e.stopPropagation(); send(tpl); }}
                          className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                        >
                          <span className="truncate">{tpl.name}</span>
                          {tpl.isDefault && <span className="text-[9px] text-green-600 font-semibold flex-shrink-0">Default</span>}
                        </button>
                      ))}
                    </>
                  );
                }

                const items = [
                  { label: "WhatsApp", icon: <MessageCircle className="w-3.5 h-3.5 text-green-600" />, onClick: () => openChannel("whatsapp") },
                  { label: "Email", icon: <Mail className="w-3.5 h-3.5 text-blue-600" />, onClick: () => openChannel("email") },
                  { label: "SMS", icon: <MessageSquare className="w-3.5 h-3.5 text-purple-600" />, onClick: () => openChannel("sms") },
                  { label: "Copy Link", icon: <Copy className="w-3.5 h-3.5 text-gray-500" />, onClick: () => { navigator.clipboard.writeText(link).catch(() => {}); toast.success("Link copied"); closeMenu(); } },
                ];
                return items.map(({ label, icon, onClick }) => (
                  <button
                    key={label}
                    onClick={(e) => { e.stopPropagation(); onClick(); }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                  >
                    {icon}
                    {label}
                  </button>
                ));
              })()}
            </div>
          </>,
          document.body
        )}
        {emailCompose && (() => {
          const dname = docNameFor(emailCompose.type);
          const dnum = emailCompose.doc[numberKeyFor(emailCompose.type)];
          const link = `${window.location.origin}/view/${apiPathFor(emailCompose.type)}/${emailCompose.doc._id}`;
          const cname = emailCompose.doc.deal?.contactPerson || emailCompose.doc.deal?.title || "Customer";
          const eAmt = emailCompose.doc.amount != null
            ? `₹${Number(emailCompose.doc.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
            : "";
          const fillEmailTpl = (tpl) => tpl
            .replace(/{customerName}/g, cname)
            .replace(/{docType}/g, dname)
            .replace(/{number}/g, dnum || "")
            .replace(/{amount}/g, eAmt)
            .replace(/{link}/g, link)
            .replace(/{company}/g, shareCompanyName || "");
          const applyTemplate = (key) => {
            const saved = emailTemplatesList.find((tpl) => tpl.id === key);
            let nextSubject;
            let nextBody;
            if (saved) {
              nextSubject = fillEmailTpl(saved.subject || "");
              nextBody = textToEmailHtml(fillEmailTpl(saved.body || ""));
            } else if (key === "standard") {
              nextSubject = `${dname} ${dnum || ""}${shareCompanyName ? ` from ${shareCompanyName}` : ""}`.trim();
              nextBody = textToEmailHtml(`Dear ${cname || "Sir/Madam"},\n\nPlease find attached your ${dname}${dnum ? ` ${dnum}` : ""}.\n\nYou can also view or download it online: ${link}\n\nRegards,\n${shareCompanyName || "the sender"}`);
            } else if (key === "reminder") {
              nextSubject = `Reminder: ${dname} ${dnum || ""} pending`;
              nextBody = textToEmailHtml(`Dear ${cname || "Sir/Madam"},\n\nThis is a reminder that your ${dname}${dnum ? ` ${dnum}` : ""} is awaiting your review.\n\nView it here: ${link}\n\nContact us if you have any questions.\n\nRegards,\n${shareCompanyName || "the sender"}`);
            } else if (key === "followup") {
              nextSubject = `Following up on ${dname} ${dnum || ""}`;
              nextBody = textToEmailHtml(`Dear ${cname || "Sir/Madam"},\n\nWe wanted to follow up regarding ${dname}${dnum ? ` ${dnum}` : ""} shared earlier.\n\nView or download: ${link}\n\nWe look forward to hearing from you.\n\nRegards,\n${shareCompanyName || "the sender"}`);
            }
            setEmailComposeSubject(nextSubject);
            setEmailComposeBody(nextBody);
            // The body editor is an uncontrolled contentEditable (React can't
            // own its innerHTML without breaking cursor position while
            // typing), so template application has to push the new HTML into
            // the live DOM node directly, not just into state.
            if (emailBodyEditorRef.current) {
              emailBodyEditorRef.current.innerHTML = nextBody;
            }
            setEmailTemplateOpen(false);
          };
          const doSend = async () => {
            if (!emailComposeTo || emailComposeSending) return;
            setEmailComposeSending(true);
            try {
              await API.post(`/public/${apiPathFor(emailCompose.type)}/${emailCompose.doc._id}/email`, {
                email: emailComposeTo,
                cc: emailComposeCc,
                bcc: emailComposeBcc,
                subject: emailComposeSubject,
                body: emailComposeBody,
              });
              toast.success("Email sent successfully");
              setEmailCompose(null);
              setEmailComposeTo("");
              setEmailComposeCc("");
              setEmailComposeBcc("");
              setShowEmailCc(false);
              setShowEmailBcc(false);
              setEmailComposeSubject("");
              setEmailComposeBody("");
              setEmailPreviewMode(false);
            } catch (err) {
              toast.error(err.response?.data?.error || "Failed to send email");
            } finally {
              setEmailComposeSending(false);
            }
          };
          // execCommand is deprecated but still the simplest way to drive a
          // handful of basic rich-text commands (bold/italic/underline/lists)
          // against a contentEditable div without pulling in an editor library.
          const execCmd = (cmd, value = null) => {
            emailBodyEditorRef.current?.focus();
            document.execCommand(cmd, false, value);
            setEmailComposeBody(emailBodyEditorRef.current?.innerHTML || "");
          };
          const insertLink = () => {
            const url = window.prompt("Enter URL");
            if (url) execCmd("createLink", url);
          };
          const toolbarButtons = [
            { icon: <BoldIcon className="w-3.5 h-3.5" />, title: "Bold", onClick: () => execCmd("bold") },
            { icon: <ItalicIcon className="w-3.5 h-3.5" />, title: "Italic", onClick: () => execCmd("italic") },
            { icon: <UnderlineIcon className="w-3.5 h-3.5" />, title: "Underline", onClick: () => execCmd("underline") },
            { icon: <StrikethroughIcon className="w-3.5 h-3.5" />, title: "Strikethrough", onClick: () => execCmd("strikeThrough") },
            { icon: <ListOrdered className="w-3.5 h-3.5" />, title: "Numbered list", onClick: () => execCmd("insertOrderedList") },
            { icon: <ListIcon className="w-3.5 h-3.5" />, title: "Bulleted list", onClick: () => execCmd("insertUnorderedList") },
            { icon: <LinkIcon className="w-3.5 h-3.5" />, title: "Insert link", onClick: insertLink },
          ];
          return (
            <>
              <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[100011]" onClick={() => { setEmailCompose(null); setEmailTemplateOpen(false); }} />
              {/* Same inset, rounded quick-drawer chrome as CompanyForm/ItemForm/CallLogForm
                  (dc-panel-card) — this panel just keeps its own wider, taller compose width
                  instead of the standard dc-panel-w. */}
              <div className="fixed dc-panel-card w-[calc(100%-3rem)] max-w-[580px] bg-white shadow-2xl z-[100012] flex flex-col overflow-hidden animate-slideInRight" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 rounded-t-2xl flex-shrink-0">
                  <div className="flex items-center gap-3">
                    <button onClick={() => setEmailCompose(null)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                      <X className="w-4 h-4 text-gray-500" />
                    </button>
                    <h2 className="text-base font-semibold text-gray-900">Send Email</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEmailPreviewMode((p) => !p)}
                      className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      {emailPreviewMode ? "Edit" : "Preview"}
                    </button>
                    <button
                      disabled={!emailComposeTo || emailComposeSending}
                      onClick={doSend}
                      className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                    >
                      {emailComposeSending ? (
                        <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sending…</>
                      ) : (
                        <><Mail className="w-4 h-4" /> Send Email</>
                      )}
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                  {/* From row — same label+value layout as To/Subject */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
                    <div className="flex items-center w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50">
                      <span className="flex items-center gap-1.5 text-sm text-gray-600 flex-1 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] font-semibold flex items-center justify-center flex-shrink-0">
                          DC
                        </span>
                        <span className="min-w-0 truncate">
                          {EMAIL_FROM_NAME && <strong className="mr-1">{EMAIL_FROM_NAME}</strong>}
                          {EMAIL_FROM_ADDRESS}
                        </span>
                        <Lock className="w-3 h-3 text-gray-400 flex-shrink-0" />
                      </span>
                      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                        {!showEmailCc && (
                          <button
                            type="button"
                            onClick={() => setShowEmailCc(true)}
                            className="px-2 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                          >
                            Cc
                          </button>
                        )}
                        {!showEmailBcc && (
                          <button
                            type="button"
                            onClick={() => setShowEmailBcc(true)}
                            className="px-2 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                          >
                            Bcc
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
                    <input
                      type="email"
                      value={emailComposeTo}
                      onChange={(e) => setEmailComposeTo(e.target.value)}
                      placeholder="recipient@example.com"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  {showEmailCc && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-medium text-gray-500">Cc</label>
                        <button
                          type="button"
                          onClick={() => { setShowEmailCc(false); setEmailComposeCc(""); }}
                          className="text-xs font-medium text-gray-400 hover:text-gray-600"
                        >
                          Remove
                        </button>
                      </div>
                      <input
                        type="text"
                        value={emailComposeCc}
                        onChange={(e) => setEmailComposeCc(e.target.value)}
                        placeholder="comma-separated addresses"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  )}
                  {showEmailBcc && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-medium text-gray-500">Bcc</label>
                        <button
                          type="button"
                          onClick={() => { setShowEmailBcc(false); setEmailComposeBcc(""); }}
                          className="text-xs font-medium text-gray-400 hover:text-gray-600"
                        >
                          Remove
                        </button>
                      </div>
                      <input
                        type="text"
                        value={emailComposeBcc}
                        onChange={(e) => setEmailComposeBcc(e.target.value)}
                        placeholder="comma-separated addresses"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Subject</label>
                    <input
                      type="text"
                      value={emailComposeSubject}
                      onChange={(e) => setEmailComposeSubject(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="relative">
                    <div ref={emailTemplateMenuRef} className="relative">
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-medium text-gray-500">Body</label>
                        <button
                          type="button"
                          onClick={() => setEmailTemplateOpen((p) => !p)}
                          className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        >
                          + Add template <ChevronDown className="w-3 h-3" />
                        </button>
                      </div>
                      {emailTemplateOpen && (
                        <div className="absolute right-0 top-6 bg-white border border-gray-200 rounded-lg shadow-lg w-64 z-10 py-1">
                          {[
                            ...emailTemplatesList.map((tpl) => ({
                              key: tpl.id,
                              label: tpl.name,
                              desc: tpl.isDefault ? "Default · From Document Settings" : "From Document Settings",
                            })),
                            { key: "standard", label: "Standard", desc: "Thank you for your business" },
                            { key: "reminder", label: "Reminder", desc: "Document pending review" },
                            { key: "followup", label: "Follow-up", desc: "Check in on document" },
                          ].map(({ key, label, desc }) => (
                            <button
                              key={key}
                              onClick={() => applyTemplate(key)}
                              className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors"
                            >
                              <p className="text-sm font-medium text-gray-800">{label}</p>
                              <p className="text-xs text-gray-400">{desc}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {emailPreviewMode ? (
                      <div
                        className="w-full min-h-[220px] px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 [&_a]:text-blue-600 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                        dangerouslySetInnerHTML={{ __html: emailComposeBody }}
                      />
                    ) : (
                      <>
                        <div className="flex items-center gap-0.5 border border-gray-200 border-b-0 rounded-t-lg bg-gray-50 px-1.5 py-1">
                          {toolbarButtons.map(({ icon, title, onClick }) => (
                            <button
                              key={title}
                              type="button"
                              title={title}
                              // Mousedown (not click) so the editor's text
                              // selection survives — a click first steals
                              // focus/selection away from the contentEditable.
                              onMouseDown={(e) => { e.preventDefault(); onClick(); }}
                              className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors"
                            >
                              {icon}
                            </button>
                          ))}
                        </div>
                        <div
                          ref={(el) => {
                            emailBodyEditorRef.current = el;
                            if (el && el.dataset.init !== "true") {
                              el.innerHTML = emailComposeBody;
                              el.dataset.init = "true";
                            }
                          }}
                          contentEditable
                          suppressContentEditableWarning
                          onInput={(e) => setEmailComposeBody(e.currentTarget.innerHTML)}
                          className="w-full min-h-[220px] px-3 py-2 border border-gray-200 rounded-b-lg text-sm focus:outline-none focus:border-blue-500 [&_a]:text-blue-600 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                        />
                      </>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100 bg-white rounded-b-2xl">
                  <button
                    disabled={!emailComposeTo || emailComposeSending}
                    onClick={doSend}
                    className="w-full px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                  >
                    {emailComposeSending ? (
                      <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sending…</>
                    ) : (
                      <><Mail className="w-4 h-4" /> Send Email</>
                    )}
                  </button>
                </div>
              </div>
            </>
          );
        })()}
        {smsCompose && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100011]" onClick={() => setSmsCompose(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="bg-purple-100 p-2 rounded-lg">
                    <MessageSquare className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-gray-900">Send SMS</h2>
                    <p className="text-xs text-gray-400">{docNameFor(smsCompose.type)} #{smsCompose.doc[numberKeyFor(smsCompose.type)]}</p>
                  </div>
                </div>
                <button onClick={() => setSmsCompose(null)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">To (phone number)</label>
                  <input
                    type="tel"
                    value={smsComposeTo}
                    onChange={(e) => setSmsComposeTo(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Message</label>
                  <textarea
                    rows={4}
                    value={smsComposeBody}
                    onChange={(e) => setSmsComposeBody(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-purple-500 resize-none"
                  />
                  <p className="text-xs text-gray-400 mt-1">{smsComposeBody.length} characters</p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
                <button onClick={() => setSmsCompose(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">Cancel</button>
                <button
                  disabled={!smsComposeTo || smsComposeSending}
                  onClick={async () => {
                    if (!smsComposeTo || smsComposeSending) return;
                    setSmsComposeSending(true);
                    try {
                      await API.post(`/public/${apiPathFor(smsCompose.type)}/${smsCompose.doc._id}/sms`, {
                        phone: smsComposeTo,
                        message: smsComposeBody,
                      });
                      toast.success("SMS sent successfully");
                      setSmsCompose(null);
                      setSmsComposeTo("");
                      setSmsComposeBody("");
                    } catch (err) {
                      toast.error(err.response?.data?.error || "Failed to send SMS");
                    } finally {
                      setSmsComposeSending(false);
                    }
                  }}
                  className="px-5 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {smsComposeSending ? (
                    <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sending…</>
                  ) : (
                    <><MessageSquare className="w-3.5 h-3.5" /> Send SMS</>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <UpgradeRequiredModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        minPlan="growth"
        feature="Selecting multiple rows"
      />
    </>
  );
}

export default Accounting;
