import DownloadIcon from "../components/common/DownloadIcon";
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Clock, XCircle, AlertCircle, ArrowRight } from "lucide-react";
import axios from "axios";

const API_BASE = (import.meta.env.VITE_APP_API_URL || "").replace(/\/$/, "");

const STATUS_CONFIG = {
  Draft:    { color: "text-[#56698A]",    bg: "bg-[#EEF2F9]",   icon: <Clock className="w-3.5 h-3.5" /> },
  Pending:  { color: "text-amber-600",    bg: "bg-amber-50",     icon: <Clock className="w-3.5 h-3.5" /> },
  Sent:     { color: "text-[#27B4EA]",    bg: "bg-[#E6F8FD]",    icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  Accepted: { color: "text-[#1FA971]",   bg: "bg-[#E6F7EF]",   icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  Rejected: { color: "text-[#EA4B4B]",     bg: "bg-[#FCEAEA]",     icon: <XCircle className="w-3.5 h-3.5" /> },
  Paid:     { color: "text-[#1FA971]",   bg: "bg-[#E6F7EF]",   icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  Unpaid:   { color: "text-amber-500",   bg: "bg-amber-50",   icon: <AlertCircle className="w-3.5 h-3.5" /> },
  Open:     { color: "text-amber-500",   bg: "bg-amber-50",   icon: <AlertCircle className="w-3.5 h-3.5" /> },
  Void:     { color: "text-[#56698A]",    bg: "bg-[#EEF2F9]",   icon: <XCircle className="w-3.5 h-3.5" /> },
};

function fmt(amount) {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function OrgAvatar({ name, logo, color }) {
  if (logo) {
    return (
      <img
        src={logo}
        alt={name}
        className="w-20 h-20 rounded-full object-contain border-4 border-white shadow-lg bg-white"
      />
    );
  }
  const initials = (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  return (
    <div
      className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold border-4 border-white shadow-lg"
      style={{ backgroundColor: color || "#4F46E5" }}
    >
      {initials}
    </div>
  );
}

export default function PublicDocumentPage() {
  const { type, id } = useParams();
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Override App-level CSS zoom — public page is standalone
  useEffect(() => {
    const prevZoom = document.documentElement.style.zoom;
    const prevDyn = document.documentElement.style.getPropertyValue("--dynamic-zoom");
    document.documentElement.style.zoom = "";
    document.documentElement.style.setProperty("--dynamic-zoom", "1");
    return () => {
      document.documentElement.style.zoom = prevZoom;
      if (prevDyn) document.documentElement.style.setProperty("--dynamic-zoom", prevDyn);
    };
  }, []);

  useEffect(() => {
    axios
      .get(`${API_BASE}/api/public/${type}/${id}`)
      .then((r) => setDoc(r.data))
      .catch(() => setError("Document not found or no longer available."))
      .finally(() => setLoading(false));
  }, [type, id]);

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const response = await axios.get(`${API_BASE}/api/public/${type}/${id}/download`, {
        responseType: "blob",
        timeout: 30000,
      });
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc
        ? `${doc.docName.replace(/ /g, "-")}-${doc.number || id}.pdf`
        : `document-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 100);
    } catch (err) {
      console.error("Download failed:", err);
      alert("Failed to download PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  // Full-screen overlay so parent App layout doesn't interfere
  const pageStyle = {
    position: "fixed",
    inset: 0,
    overflowY: "auto",
    backgroundColor: "#f0f2f5",
    zIndex: 9999,
  };

  if (loading) {
    return (
      <div style={pageStyle} className="flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-[3px] border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Loading document…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={pageStyle} className="flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 max-w-sm w-full text-center">
          <p className="text-gray-700 font-medium mb-1">Document unavailable</p>
          <p className="text-sm text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[doc.status] || STATUS_CONFIG.Draft;
  const rawColor = doc.primaryColor || "#4F46E5";
  // Ensure button text remains legible — fall back to indigo if the brand color is too light
  const accentColor = (() => {
    try {
      const hex = rawColor.replace("#", "");
      const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
      const r = parseInt(full.slice(0, 2), 16);
      const g = parseInt(full.slice(2, 4), 16);
      const b = parseInt(full.slice(4, 6), 16);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance > 0.78 ? "#4F46E5" : rawColor;
    } catch {
      return "#4F46E5";
    }
  })();

  return (
    <div style={pageStyle}>
      <div className="min-h-full flex flex-col items-center px-4 pt-10 pb-16">

        {/* Org avatar + name */}
        <OrgAvatar name={doc.organizationName} logo={doc.organizationLogo} color={accentColor} />
        <p className="mt-3 text-base font-bold text-gray-800">{doc.organizationName}</p>

        {/* Card */}
        <div className="w-full max-w-[480px] bg-white rounded-2xl shadow-md border border-gray-100 mt-6">

          {/* Greeting */}
          <div className="px-8 pt-7 pb-5 text-center border-b border-gray-100">
            <h1 className="text-xl font-bold text-gray-900">Hi, {doc.customerName}!</h1>
            <p className="text-sm text-gray-400 mt-1">
              Here's your {doc.docName} from {doc.organizationName}
            </p>
          </div>

          {/* Details */}
          <div className="px-8 py-5 space-y-3.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">{doc.docName} #</span>
              <span className="font-semibold text-gray-800">{doc.number || "—"}</span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Date</span>
              <span className="font-semibold text-gray-800">{fmtDate(doc.date)}</span>
            </div>

            {doc.dueDate && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Due Date</span>
                <span className="font-semibold text-gray-800">{fmtDate(doc.dueDate)}</span>
              </div>
            )}

            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Status</span>
              <span className={`inline-flex items-center gap-1.5 font-semibold ${statusCfg.color}`}>
                {statusCfg.icon}
                {doc.status}
              </span>
            </div>

            <div className="h-px bg-gray-100" />

            {/* Amount */}
            <div className="text-center py-3">
              <p className="text-xs text-gray-400 mb-1">Amount</p>
              <p className="text-3xl font-bold text-gray-900">₹ {fmt(doc.amount)}</p>
              <p className="text-xs text-gray-400 mt-2">Thank you for your business!</p>
            </div>
          </div>

          {/* Download button — full-width, always prominent */}
          <div className="px-8 pb-3">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: accentColor }}
            >
              {downloading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Downloading…
                </>
              ) : (
                <>
                  <DownloadIcon className="w-4 h-4" />
                  Download {doc.docName}
                </>
              )}
            </button>
          </div>

          {/* View details toggle */}
          <div className="px-8 pb-7 flex justify-center">
            <button
              onClick={() => setShowDetails((p) => !p)}
              className="flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-700 transition-colors"
            >
              {showDetails ? "Hide details" : "View details"}
              <ArrowRight className={`w-4 h-4 transition-transform duration-200 ${showDetails ? "rotate-90" : ""}`} />
            </button>
          </div>

          {/* Expandable details */}
          {showDetails && (
            <div className="border-t border-gray-100 px-8 py-5 bg-gray-50 rounded-b-2xl">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Document Details</p>
              <div className="space-y-2 text-sm text-gray-700">
                <div className="flex justify-between">
                  <span className="text-gray-400">Document Type</span>
                  <span className="font-medium">{doc.docName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Number</span>
                  <span className="font-medium">{doc.number || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Issued</span>
                  <span className="font-medium">{fmtDate(doc.date)}</span>
                </div>
                {doc.dueDate && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Due</span>
                    <span className="font-medium">{fmtDate(doc.dueDate)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-400">Total</span>
                  <span className="font-bold text-gray-900">₹ {fmt(doc.amount)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="mt-8 text-xs text-gray-400">Powered by DataCircles · Secure document sharing</p>
      </div>
    </div>
  );
}
