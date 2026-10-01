import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../../services/api";
import { formatNumberToIndian } from "../../utils/numberFormatter";
import StatTile from "../common/StatTile";
import StatTileSkeleton from "../common/StatTileSkeleton";
import PdfIcon from "../common/PdfIcon";
import FilesIcon from "../common/FilesIcon";
// Only app-standard affordance glyphs stay from lucide — the design system has
// no custom chevron/close/rupee icons, and the rest of the app uses these.
import { IndianRupeeIcon, ChevronRight } from "lucide-react";

// Sales documents link to a Deal (deal ref on the model) and are fetched scoped
// to this deal. `amountField` is the model's own total; delivery challans carry
// an amount but it's a goods value, not revenue, so showAmount is false there.
// `dateField` is the doc's own date (sales returns use returnDate).
const SALES_TYPES = [
  { key: "invoice", label: "Invoice", route: "/accounting?tab=tax", endpoint: "/invoices", numberField: "invoiceNumber", amountField: "amount", dateField: "date", showAmount: true, dealScoped: true, icon: PdfIcon },
  { key: "quotation", label: "Quotation", route: "/accounting?tab=quotation", endpoint: "/quotations", numberField: "quotationNumber", amountField: "amount", dateField: "date", showAmount: true, dealScoped: true, icon: PdfIcon },
  { key: "proforma", label: "Proforma Invoice", route: "/accounting?tab=performa", endpoint: "/performa-invoices", numberField: "performaInvoiceNumber", amountField: "amount", dateField: "date", showAmount: true, dealScoped: true, icon: PdfIcon },
  { key: "challan", label: "Delivery Challan", route: "/accounting?tab=deliveryChallan", endpoint: "/delivery-challans", numberField: "deliveryChallanNumber", amountField: "amount", dateField: "date", showAmount: false, dealScoped: true, icon: PdfIcon },
  { key: "salesReturn", label: "Sales Return", route: "/sales-return", endpoint: "/sales-returns", numberField: "returnNumber", amountField: "grandTotal", dateField: "returnDate", showAmount: true, dealScoped: true, icon: PdfIcon },
];

// Purchase documents belong to a Vendor, not a Deal — there is no deal link, so
// these are org-wide (not deal-scoped). Shown as separate procurement documents.
const PURCHASE_TYPES = [
  { key: "purchase", label: "Purchase", route: "/purchase", endpoint: "/purchases", numberField: "purchaseNumber", amountField: "grandTotal", dateField: "purchaseDate", showAmount: true, dealScoped: false, icon: PdfIcon },
  { key: "purchaseOrder", label: "Purchase Order", route: "/purchase-order", endpoint: "/purchase-orders", numberField: "poNumber", amountField: "grandTotal", dateField: "orderDate", showAmount: true, dealScoped: false, icon: PdfIcon },
  { key: "purchaseReturn", label: "Purchase Return", route: "/purchase-return", endpoint: "/purchase-returns", numberField: "returnNumber", amountField: "grandTotal", dateField: "returnDate", showAmount: true, dealScoped: false, icon: PdfIcon },
];

const ALL_TYPES = [...SALES_TYPES, ...PURCHASE_TYPES];

// Shared status palette — same hex family as DealDetail's StatusBadge, so a
// document's status reads the same here as everywhere else. Unknown statuses
// fall back to the neutral grey.
const STATUS_HEX = {
  paid: "#1FA971", accepted: "#1FA971", confirmed: "#1FA971", delivered: "#1FA971", refunded: "#1FA971", approved: "#1FA971",
  sent: "#27B4EA",
  partial: "#EA9927", pending: "#EA9927", outstanding: "#EA9927",
  cancelled: "#EA4B4B", rejected: "#EA4B4B", void: "#EA4B4B", overdue: "#EA4B4B",
  draft: "#56698A", none: "#56698A",
};
const statusHex = (s) => STATUS_HEX[String(s || "").toLowerCase()] || "#56698A";

const sumAmount = (rows, field) => rows.reduce((sum, r) => sum + (Number(r?.[field]) || 0), 0);
// Compact one-line status summary for the type cards — "2 Paid · 1 Partial ·
// 1 Draft". Each count keeps its status colour; the separators stay muted, so
// the line supports the card without dominating it.
const StatusSummary = ({ rows, className = "" }) => {
  const counts = rows.reduce((acc, r) => {
    const s = r?.status || "none";
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;
  return (
    <p className={`flex flex-wrap items-center gap-x-1 gap-y-0.5 ${className}`}>
      {entries.map(([status, n], i) => (
        <React.Fragment key={status}>
          {i > 0 && <span className="text-gray-300">·</span>}
          <span className="font-medium capitalize" style={{ color: statusHex(status) }}>
            {n} {status}
          </span>
        </React.Fragment>
      ))}
    </p>
  );
};

const DocTypeCard = ({ def, rows, onOpen }) => {
  const Icon = def.icon;
  const count = rows.length;
  const total = sumAmount(rows, def.amountField);
  const empty = count === 0;

  return (
    <button
      type="button"
      onClick={() => !empty && onOpen(def)}
      disabled={empty}
      className={`group flex flex-col text-left bg-white border border-gray-200 rounded-xl p-4 min-h-[150px] transition-all ${
        empty ? "cursor-default" : "hover:shadow-md hover:border-[#0085FF] cursor-pointer"
      }`}
    >
      {/* Top: icon + count */}
      <div className="flex items-center justify-between">
        <div className="bg-blue-50 p-2 rounded-lg">
          <Icon className="w-[18px] h-[18px] text-[#0085FF]" />
        </div>
        <span className="text-[11px] font-medium text-gray-400">
          {count} doc{count !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Title */}
      <p className="mt-3 text-sm font-semibold text-gray-900 truncate">{def.label}</p>

      {/* Primary summary: amount (+ status) for financial docs, status only for
          the rest. No duplicate count, no "Last: ..." — those live in the list. */}
      {empty ? (
        <p className="mt-1 text-sm text-gray-400">No documents yet</p>
      ) : def.showAmount ? (
        <>
          <p className="mt-0.5 text-lg font-bold text-gray-900">₹{formatNumberToIndian(total)}</p>
          <StatusSummary rows={rows} className="mt-1.5 text-[11px]" />
        </>
      ) : (
        <StatusSummary rows={rows} className="mt-1.5 text-xs" />
      )}

      {/* Footer affordance — pinned to the bottom so cards align. */}
      {!empty && (
        <div className="mt-auto pt-3 flex items-center gap-1 text-xs font-medium text-gray-400 group-hover:text-[#0085FF] transition-colors">
          View documents
          <ChevronRight className="w-3.5 h-3.5" />
        </div>
      )}
    </button>
  );
};

// A category block: heading + type count + subtitle + card grid.
// `gridClass` is a full literal Tailwind class (not built dynamically, so it
// isn't purged) that sets the desktop column count to the section's card count,
// so 3 cards fill the same width 5 cards do instead of leaving dead space.
const CategorySection = ({ title, subtitle, defs, docsByType, loading, onOpen, gridClass }) => (
  <div>
    <div className="flex items-center justify-between gap-3 mb-0.5">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      <span className="text-xs text-gray-400 flex-shrink-0">{defs.length} types</span>
    </div>
    {subtitle && <p className="text-[11px] text-gray-400 mb-3">{subtitle}</p>}
    <div className="h-px bg-[#E5E7EB] mb-4" />
    <div className={`grid grid-cols-2 sm:grid-cols-3 ${gridClass} gap-3`}>
      {loading
        ? defs.map((d) => <div key={d.key} className="h-[150px] bg-gray-50 border border-gray-200 rounded-xl animate-pulse" />)
        : defs.map((def) => (
            <DocTypeCard key={def.key} def={def} rows={docsByType[def.key] || []} onOpen={onOpen} />
          ))}
    </div>
  </div>
);

const DealDocumentsTab = ({ dealId, showStats = true }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [docsByType, setDocsByType] = useState({});

  // "View documents" leaves the deal and opens that type's own main page
  // (sales docs deep-link to the Accounting tab; the rest have their own page).
  const openDocType = (def) => navigate(def.route);

  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      setLoading(true);
      try {
        const results = await Promise.all(
          ALL_TYPES.map((def) =>
            API.get(def.endpoint, { params: def.dealScoped ? { deal: dealId } : {} })
              .then((res) => (Array.isArray(res.data) ? res.data : res.data?.[def.key + "s"] || []))
              .catch(() => [])
          )
        );
        if (cancelled) return;
        const map = {};
        ALL_TYPES.forEach((def, i) => {
          map[def.key] = results[i];
        });
        setDocsByType(map);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    if (dealId) fetchAll();
    return () => {
      cancelled = true;
    };
  }, [dealId]);

  // Summary is the deal's own (sales) documents — purchase docs are org-wide
  // context, not part of this deal's KPIs.
  const salesTypesWithDocs = SALES_TYPES.filter((d) => (docsByType[d.key] || []).length > 0).length;
  const totalSalesDocs = SALES_TYPES.reduce((n, d) => n + (docsByType[d.key] || []).length, 0);
  const invoicedValue = sumAmount(docsByType.invoice || [], "amount");

  const summaryTiles = [
    { label: "Document Types", value: `${salesTypesWithDocs} / ${SALES_TYPES.length}`, icon: PdfIcon },
    { label: "Total Documents", value: totalSalesDocs, icon: FilesIcon },
    { label: "Invoiced Value", value: `₹${formatNumberToIndian(invoicedValue)}`, icon: IndianRupeeIcon },
  ];

  return (
    <div className="font-sf space-y-6">
      {showStats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {loading
            ? Array.from({ length: 3 }).map((_, i) => <StatTileSkeleton key={i} />)
            : summaryTiles.map((tile) => <StatTile key={tile.label} tile={tile} />)}
        </div>
      )}

      <CategorySection
        title="Sales Documents"
        subtitle="Customer-facing documents for this deal"
        defs={SALES_TYPES}
        docsByType={docsByType}
        loading={loading}
        onOpen={openDocType}
        gridClass="lg:grid-cols-5"
      />

      <CategorySection
        title="Purchase Documents"
        subtitle="Vendor / procurement documents (not deal-specific)"
        defs={PURCHASE_TYPES}
        docsByType={docsByType}
        loading={loading}
        onOpen={openDocType}
        gridClass="lg:grid-cols-3"
      />
    </div>
  );
};

export default DealDocumentsTab;
