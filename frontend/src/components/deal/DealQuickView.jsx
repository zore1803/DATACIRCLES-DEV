import PdfIcon from "../common/PdfIcon";
import DownloadIcon from "../common/DownloadIcon";
// src/components/deal/DealQuickView.jsx
import React, { useEffect, useState } from "react";
import API from "../../services/api";
import toast from "react-hot-toast";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Building2,
  User,
  IndianRupee,
  Send,
  ExternalLink,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { formatNumberToIndian } from "../../utils/numberFormatter";
import { Link } from "react-router-dom";
import EyeIcon from "../common/EyeIcon";
import EditIcon from "../common/EditIcon";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

// Reused from your DealDetail
const StatusBadge = ({ status }) => {
  const statusConfig = {
    open: {
      bg: "bg-blue-50",
      text: "text-blue-700",
      border: "border-blue-200",
      icon: <Clock className="w-3 h-3" />,
    },
    won: {
      bg: "bg-green-50",
      text: "text-green-700",
      border: "border-green-200",
      icon: <CheckCircle2 className="w-3 h-3" />,
    },
    lost: {
      bg: "bg-red-50",
      text: "text-red-700",
      border: "border-red-200",
      icon: <XCircle className="w-3 h-3" />,
    },
    pending: {
      bg: "bg-amber-50",
      text: "text-amber-700",
      border: "border-amber-200",
      icon: <AlertCircle className="w-3 h-3" />,
    },
    default: {
      bg: "bg-gray-50",
      text: "text-gray-700",
      border: "border-gray-200",
      icon: <AlertCircle className="w-3 h-3" />,
    },
  };

  const config = statusConfig[status?.toLowerCase()] || statusConfig.default;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${config.bg} ${config.text} ${config.border}`}
    >
      {config.icon}
      <span className="capitalize">{status}</span>
    </div>
  );
};

const InfoRow = ({ icon: Icon, label, value, link, children }) => (
  <div className="flex items-start gap-3 py-2.5 border-b border-gray-100 last:border-b-0">
    <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
      <Icon className="w-4 h-4 text-blue-600" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      {link ? (
        <Link
          to={link}
          className="text-blue-600 hover:underline font-medium text-sm truncate block"
        >
          {value}
        </Link>
      ) : (
        <p className="text-sm font-medium text-gray-900 truncate">
          {value || "—"}
        </p>
      )}
      {children}
    </div>
  </div>
);

const InvoiceMiniRow = ({ invoice, onView, onDownload }) => (
  <div className="flex items-center justify-between py-2.5 px-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
    <div className="flex items-center gap-3 min-w-0">
      <PdfIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          #{invoice.invoiceNumber || "N/A"}
        </p>
        <p className="text-xs text-gray-500">
          {new Date(invoice.date).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
          })}
        </p>
      </div>
    </div>
    <div className="flex items-center gap-3 flex-shrink-0">
      <p className="text-sm font-semibold text-gray-900">
        ₹{formatNumberToIndian(invoice.amount || 0)}
      </p>
      <StatusBadge status={invoice.status} />
      <div className="flex gap-1">
        <button
          onClick={() => onView(invoice)}
          className="p-1.5 text-gray-500 hover:text-blue-600 rounded hover:bg-white"
          title="View"
        >
          <EyeIcon size={14} />
        </button>
        <button
          onClick={() => onDownload(invoice._id)}
          className="p-1.5 text-blue-600 hover:text-blue-700 rounded hover:bg-white"
          title="Download"
        >
          <DownloadIcon />
        </button>
      </div>
    </div>
  </div>
);

const DealQuickView = ({ dealId, onClose, onEdit }) => {
  const [deal, setDeal] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showViewer, setShowViewer] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  // Drives the slide-in/out transform independently of `deal` so a real
  // close can animate the panel out before the parent unmounts it.
  const [isOpen, setIsOpen] = useState(false);
  useBodyScrollLock(isOpen);

  const loadDeal = async (id) => {
    setLoading(true);
    try {
      const [dealRes, invoiceRes] = await Promise.all([
        API.get(`/deals/${id}`),
        API.get("/invoices"),
      ]);

      setDeal(dealRes.data);
      const filteredInvoices = invoiceRes.data.filter(
        (i) => i.deal?._id === id,
      );
      setInvoices(filteredInvoices);

      setLoading(false);
    } catch (err) {
      toast.error("Failed to load deal details");
      setLoading(false);
      onClose();
    }
  };

  useEffect(() => {
    if (dealId) loadDeal(dealId);
  }, [dealId]);

  // Slide in once the panel actually has data to show.
  useEffect(() => {
    if (deal) setIsOpen(true);
  }, [deal]);

  // Slide out first, then unmount — matches how it slides in instead of
  // vanishing instantly.
  const handleClose = () => {
    setIsOpen(false);
    setTimeout(onClose, 300);
  };

  const downloadPDF = async (id) => {
    try {
      const response = await API.get(`invoices/download/${id}`, {
        responseType: "blob",
      });
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `invoice-${id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Invoice downloaded");
    } catch (err) {
      toast.error("Failed to download invoice");
    }
  };

  const handleView = (invoice) => {
    setSelectedInvoice(invoice);
    setShowViewer(true);
  };

  if (!deal && !loading) return null;

  const totalInvoiceAmount = invoices.reduce(
    (sum, inv) => sum + (inv.amount || 0),
    0,
  );

  return (
    <>
      {/* Backdrop — dimmed/blurred on mobile, invisible but still present (and
          click-catching) on desktop so clicking outside the panel closes it
          there too instead of falling through to the page underneath. */}
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm lg:bg-transparent lg:backdrop-blur-none z-[9998]"
        onClick={handleClose}
      />

      {/* Slide-in Panel — dc-panel-card matches the rounded, inset card look
          used by ContactForm.jsx's Edit modal and ContactQuickView. Closed
          state uses translate-x-[calc(100%+2rem)] (not plain
          translate-x-full) because dc-panel-card sits right: 1.5rem inset
          from the edge — see the matching comment in ContactQuickView.jsx
          and the .dc-panel-card rule in index.css for why. */}
      <div
        className={`
          fixed dc-panel-card dc-panel-w
          bg-white shadow-2xl z-[9999]
          transform transition-transform duration-300 ease-in-out
          overflow-hidden
          ${isOpen ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"}
        `}
      >
        {/* Sticky Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 z-20 px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              onClick={handleClose}
              className="p-2 rounded-full hover:bg-gray-100 text-gray-600 flex-shrink-0"
            >
              <X size={20} />
            </button>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 truncate">
              {deal?.title || "Deal Details"}
            </h2>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <button
              onClick={() => onEdit(deal)}
              className="flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 sm:py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 whitespace-nowrap"
            >
              <EditIcon size={16} />
              <span className="hidden sm:inline">Edit</span>
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="h-[calc(100%-68px)] overflow-y-auto overscroll-contain">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div>
              <p className="text-gray-600 font-medium">
                Loading deal details...
              </p>
            </div>
          ) : (
            <div className="p-4 sm:p-6">
              {/* Overview Block */}
              <div
                className="flex flex-col items-start w-full mb-8"
                style={{ padding: 16, gap: 16, backgroundColor: "#F8FAFC", borderRadius: 14 }}
              >
                <div className="flex flex-row items-start w-full" style={{ gap: 16 }}>
                  {/* Value */}
                  <div className="flex flex-col items-start flex-1" style={{ gap: 6 }}>
                    <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "120%", color: "#6B7280" }}>
                      Value
                    </span>
                    <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 14, lineHeight: "120%", color: "#1F2937" }}>
                      ₹{formatNumberToIndian(deal.amount || 0)}
                    </span>
                  </div>

                  {/* Current Stage */}
                  <div className="flex flex-col items-start flex-1" style={{ gap: 6 }}>
                    <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "120%", color: "#6B7280" }}>
                      Current Stage
                    </span>
                    <div className="flex items-center -ml-2 -mt-1">
                      <StatusBadge status={deal.status} />
                    </div>
                  </div>

                  {/* Created Date */}
                  <div className="flex flex-col items-start flex-1" style={{ gap: 6 }}>
                    <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "120%", color: "#6B7280" }}>
                      Created
                    </span>
                    <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 14, lineHeight: "120%", color: "#1F2937" }}>
                      {new Date(deal.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Key Info */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 mb-8">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <PdfIcon className="w-4 h-4 text-gray-600" />
                  Deal Information
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <InfoRow
                    icon={Building2}
                    label="Company"
                    value={deal.company?.name || "—"}
                    link={
                      deal.company?._id
                        ? `/companies/${deal.company._id}`
                        : null
                    }
                  />

                  <InfoRow
                    icon={User}
                    label="Contact"
                    value={deal.contact?.name || "—"}
                    link={
                      deal.contact?._id ? `/contacts/${deal.contact._id}` : null
                    }
                  />

                  {deal.additionalFields?.map((field, i) => (
                    <InfoRow
                      key={i}
                      icon={PdfIcon}
                      label={field.key}
                      value={field.value || "—"}
                    />
                  ))}
                </div>
              </div>

              {/* Invoices Section */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <PdfIcon className="w-4 h-4 text-gray-600" />
                    Linked Invoices
                  </h3>
                  <p className="text-sm text-gray-600">
                    {invoices.length} • Total: ₹
                    {formatNumberToIndian(totalInvoiceAmount)}
                  </p>
                </div>

                {invoices.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No invoices linked to this deal yet.
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                    {invoices.map((inv) => (
                      <InvoiceMiniRow
                        key={inv._id}
                        invoice={inv}
                        onView={handleView}
                        onDownload={downloadPDF}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Invoice Viewer Modal (same as your original) */}
      {showViewer && selectedInvoice && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[10000] p-4">
          <div className="bg-white rounded-xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl">
            <div className="flex justify-between items-center px-6 py-4 border-b">
              <h3 className="text-lg font-bold">
                Invoice #{selectedInvoice.invoiceNumber}
              </h3>
              <div className="flex gap-3">
                <button
                  onClick={() => downloadPDF(selectedInvoice._id)}
                  className="p-2 text-green-600 hover:bg-green-50 rounded"
                >
                  <DownloadIcon />
                </button>
                <button
                  onClick={() => {
                    /* your send logic */
                  }}
                  className="p-2 text-purple-600 hover:bg-purple-50 rounded"
                >
                  <Send size={18} />
                </button>
                <button
                  onClick={() => setShowViewer(false)}
                  className="p-2 text-gray-600 hover:bg-gray-100 rounded"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              {/* Your PDF viewer logic here - iframe or canvas */}
              <div className="h-full flex items-center justify-center bg-gray-50">
                <p className="text-gray-600">
                  PDF Preview (implement iframe/blob here)
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default DealQuickView;
