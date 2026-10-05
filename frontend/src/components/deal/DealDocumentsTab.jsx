import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../../services/api";
import { formatNumberToIndian } from "../../utils/numberFormatter";
import StatTile from "../common/StatTile";
import StatTileSkeleton from "../common/StatTileSkeleton";
import DocTypeCardSkeleton from "../common/DocTypeCardSkeleton";
import PdfIcon from "../common/PdfIcon";
import FilesIcon from "../common/FilesIcon";
// lucide is the icon set the whole app (sidebar included) already uses; each
// document type gets its own glyph so the cards read apart at a glance.
import {
  IndianRupeeIcon,
  ArrowRight,
  Receipt,
  FileText,
  FileCheck,
  Truck,
  RotateCcw,
  ShoppingCart,
  ClipboardList,
} from "lucide-react";

// Sales documents link to a Deal (deal ref on the model) and are fetched scoped
// to this deal. `amountField` is the model's own total; delivery challans carry
// an amount but it's a goods value, not revenue, so showAmount is false there.
// `dateField` is the doc's own date (sales returns use returnDate).
const SALES_TYPES = [
  { key: "invoice", label: "Invoice", route: "/accounting?tab=tax", endpoint: "/invoices", numberField: "invoiceNumber", amountField: "amount", dateField: "date", showAmount: true, dealScoped: true, icon: Receipt },
  { key: "quotation", label: "Quotation", route: "/accounting?tab=quotation", endpoint: "/quotations", numberField: "quotationNumber", amountField: "amount", dateField: "date", showAmount: true, dealScoped: true, icon: FileText },
  { key: "proforma", label: "Proforma Invoice", route: "/accounting?tab=performa", endpoint: "/performa-invoices", numberField: "performaInvoiceNumber", amountField: "amount", dateField: "date", showAmount: true, dealScoped: true, icon: FileCheck },
  { key: "challan", label: "Delivery Challan", route: "/accounting?tab=deliveryChallan", endpoint: "/delivery-challans", numberField: "deliveryChallanNumber", amountField: "amount", dateField: "date", showAmount: false, dealScoped: true, icon: Truck },
  { key: "salesReturn", label: "Sales Return", route: "/sales-return", endpoint: "/sales-returns", numberField: "returnNumber", amountField: "grandTotal", dateField: "returnDate", showAmount: true, dealScoped: true, icon: RotateCcw },
];

// Purchase documents belong to a Vendor, not a Deal — there is no deal link, so
// these are org-wide (not deal-scoped). Shown as separate procurement documents.
const PURCHASE_TYPES = [
  { key: "purchase", label: "Purchase", route: "/purchase", endpoint: "/purchases", numberField: "purchaseNumber", amountField: "grandTotal", dateField: "purchaseDate", showAmount: true, dealScoped: false, icon: ShoppingCart },
  { key: "purchaseOrder", label: "Purchase Order", route: "/purchase-order", endpoint: "/purchase-orders", numberField: "poNumber", amountField: "grandTotal", dateField: "orderDate", showAmount: true, dealScoped: false, icon: ClipboardList },
  { key: "purchaseReturn", label: "Purchase Return", route: "/purchase-return", endpoint: "/purchase-returns", numberField: "returnNumber", amountField: "grandTotal", dateField: "returnDate", showAmount: true, dealScoped: false, icon: RotateCcw },
];

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
// Compact status pills for the type cards — "Partially Paid 1" "Draft 1".
// Small and tinted from the status colour, so they support the card without
// competing with the title or amount.
const StatusSummary = ({ rows, className = "" }) => {
  const counts = rows.reduce((acc, r) => {
    const s = r?.status || "none";
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {entries.map(([status, n]) => {
        const hex = statusHex(status);
        return (
          <span
            key={status}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium capitalize whitespace-nowrap"
            style={{ color: hex, background: `${hex}14` }}
          >
            {status === "none" ? "No status" : status}
            <span className="font-semibold">{n}</span>
          </span>
        );
      })}
    </div>
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
      className={`group flex flex-col text-left bg-white border border-gray-200 rounded-xl p-4 min-h-[140px] h-full transition-all ${
        empty ? "cursor-default" : "hover:shadow-md hover:border-[#0085FF] cursor-pointer"
      }`}
    >
      {/* Top: icon + count */}
      <div className="flex items-center justify-between">
        <div className="bg-blue-50 p-2 rounded-lg">
          <Icon className="w-[18px] h-[18px] text-[#0085FF]" />
        </div>
        <span className="text-xs text-gray-400">
          {count} doc{count !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Title */}
      <p className="mt-2.5 text-sm font-semibold text-gray-900 truncate">{def.label}</p>

      {/* Primary summary: amount (+ status) for financial docs, status only for
          the rest. No duplicate count, no "Last: ..." — those live in the list. */}
      {empty ? (
        <p className="mt-1 text-sm text-gray-400">No documents yet</p>
      ) : def.showAmount ? (
        <>
          <p className="mt-0.5 text-lg font-bold text-gray-900">₹{formatNumberToIndian(total)}</p>
          <StatusSummary rows={rows} className="mt-2" />
        </>
      ) : (
        <StatusSummary rows={rows} className="mt-2" />
      )}

      {/* Footer affordance — pinned to the bottom so cards align. */}
      {!empty && (
        <div className="mt-auto pt-2.5 flex items-center gap-1 text-xs font-medium text-gray-400 group-hover:text-[#0085FF] transition-colors">
          View documents
          <ArrowRight className="w-3.5 h-3.5" />
        </div>
      )}
    </button>
  );
};

// A category block: heading + subtitle + card grid.
// `gridClass` is a full literal Tailwind class (not built dynamically, so it
// isn't purged) that sets the desktop column count to the section's card count,
// so 3 cards fill the same width 5 cards do instead of leaving dead space.
// Which entity this tab is scoped to, used only for the section subtitles so the
// copy reads correctly on the deal, company and contact pages ("...for this
// deal" vs "...for this company").
const SCOPE_NOUN = { deal: "deal", company: "company", contact: "contact", vendor: "vendor" };

// `auto-rows-fr` keeps every card in the grid the same height as the tallest one,
// so all cards align cleanly — without stretching to fill the viewport. The
// section sits at its natural content height; the page ends after the cards with
// normal whitespace below (no forced min-height / flex fill).
const CategorySection = ({ title, subtitle, defs, docsByType, loading, onOpen, gridClass }) => (
  <div>
    <div className="mb-0.5">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
    </div>
    {subtitle && <p className="text-xs text-gray-400 mb-3">{subtitle}</p>}
    <div className="h-px bg-[#E5E7EB] mb-4" />
    <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 ${gridClass} gap-3 auto-rows-fr`}>
      {loading
        ? defs.map((d) => <DocTypeCardSkeleton key={d.key} />)
        : defs.map((def) => (
            <DocTypeCard key={def.key} def={def} rows={docsByType[def.key] || []} onOpen={onOpen} />
          ))}
    </div>
  </div>
);

// `dealId`, `companyId`, `contactId` or `vendorId` set the scope, and each scope
// shows exactly one section of document-type cards:
//   deal / company / contact → Sales Documents (invoice, quotation, proforma,
//     delivery challan, sales return)
//   vendor                   → Purchase & Procurement Documents
// There is no "other" section per page — a deal/company/contact never shows
// purchase cards, and a vendor never shows sales cards, mirroring the data model
// (sales docs hang off deals; purchase docs off vendors).
//
// Empty is a first-class state: the cards still render so the user can see which
// document types exist here, each showing "0 docs" / "No documents yet" with no
// fabricated totals.
//
// Each scope hits a different endpoint shape (see `requestFor` below):
//   deal    → GET /{type}?deal=:id       sales docs on that deal
//   company → GET /{type}/company/:id    sales docs across the company's deals
//   contact → GET /{type}/contact/:id    sales docs across the contact's deals
//   vendor  → GET /{type}/vendor/:id     purchase docs on that vendor
// Sales docs link to a Deal (not directly to a company/contact), so the
// company/contact endpoints resolve the entity's deals server-side first.
const DealDocumentsTab = ({ dealId, companyId, contactId, vendorId, showStats = true }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [docsByType, setDocsByType] = useState({});

  const scope = dealId
    ? "deal"
    : companyId
    ? "company"
    : contactId
    ? "contact"
    : vendorId
    ? "vendor"
    : null;
  // Vendors see procurement documents. Everyone else sees sales documents; the
  // Company page additionally shows the org-wide Purchase & Procurement cards for
  // context (purchase docs belong to vendors, not to the company's deals).
  const isVendor = scope === "vendor";
  const isCompany = scope === "company";
  const showSales = !isVendor; // deal, contact, company
  // Deal and Company both show the org-wide Purchase & Procurement cards for
  // context (purchase docs belong to vendors, not to a deal/company). Contact
  // stays sales-only.
  const showPurchase = isVendor || isCompany || scope === "deal";
  const fetchTypes = [
    ...(showSales ? SALES_TYPES : []),
    ...(showPurchase ? PURCHASE_TYPES : []),
  ];

  // "View documents" leaves this page and opens that type's own main page
  // (sales docs deep-link to the Accounting tab; the rest have their own page).
  const openDocType = (def) => navigate(def.route);

  useEffect(() => {
    // No scope yet (e.g. a parent id still loading) — clear to the empty state.
    if (!scope) {
      setDocsByType({});
      setLoading(false);
      return;
    }
    let cancelled = false;

    // Each document maps to an endpoint by its scope. Sales docs are filtered by
    // the entity (deal / company / contact); purchase docs by vendor, or fetched
    // org-wide on the Company page. Every endpoint returns a plain array except
    // invoices-by-company ({ invoices, summary }) — the parser handles both via
    // the `key + "s"` fallback.
    const requestFor = (def) => {
      if (def.dealScoped) {
        // Sales document — scoped to deal / company / contact.
        if (scope === "company") return API.get(`${def.endpoint}/company/${companyId}`);
        if (scope === "contact") return API.get(`${def.endpoint}/contact/${contactId}`);
        return API.get(def.endpoint, { params: { deal: dealId } });
      }
      // Purchase document — by vendor, or org-wide on the Company page.
      if (scope === "vendor") return API.get(`${def.endpoint}/vendor/${vendorId}`);
      return API.get(def.endpoint);
    };

    const fetchVisible = async () => {
      setLoading(true);
      try {
        const results = await Promise.all(
          fetchTypes.map((def) =>
            requestFor(def)
              .then((res) => (Array.isArray(res.data) ? res.data : res.data?.[def.key + "s"] || []))
              .catch(() => [])
          )
        );
        if (cancelled) return;
        const map = {};
        fetchTypes.forEach((def, i) => {
          map[def.key] = results[i];
        });
        setDocsByType(map);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchVisible();
    return () => {
      cancelled = true;
    };
    // fetchTypes is derived from the scope ids, so the id deps cover it.
  }, [scope, dealId, companyId, contactId, vendorId]);

  // Summary tiles reflect the primary section: sales for deal/company/contact,
  // procurement for a vendor. Values are real aggregates of what's loaded
  // (0 / ₹0 when empty — accurate, not fabricated).
  const summaryTypes = isVendor ? PURCHASE_TYPES : SALES_TYPES;
  const typesWithDocs = summaryTypes.filter((d) => (docsByType[d.key] || []).length > 0).length;
  const totalDocs = summaryTypes.reduce((n, d) => n + (docsByType[d.key] || []).length, 0);
  const summaryValue = isVendor
    ? summaryTypes.reduce((sum, d) => sum + sumAmount(docsByType[d.key] || [], d.amountField), 0)
    : sumAmount(docsByType.invoice || [], "amount");

  const summaryTiles = [
    // "4 of 5" = how many of the section's document types have at least one doc.
    { label: "Document Types Used", value: `${typesWithDocs} of ${summaryTypes.length}`, icon: PdfIcon },
    { label: isVendor ? "Purchase Documents" : "Sales Documents", value: totalDocs, icon: FilesIcon },
    { label: isVendor ? "Procurement Value" : "Invoiced Value", value: `₹${formatNumberToIndian(summaryValue)}`, icon: IndianRupeeIcon },
  ];

  // Sections sit at their natural height and the page ends after the cards — no
  // forced min-height or flex fill, so Vendor (3 cards) simply has normal
  // whitespace below rather than a stretched, awkward empty container.
  return (
    <div className="font-sf space-y-6">
      {showStats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {loading
            ? Array.from({ length: 3 }).map((_, i) => <StatTileSkeleton key={i} />)
            : summaryTiles.map((tile) => <StatTile key={tile.label} tile={tile} />)}
        </div>
      )}

      {showSales && (
        <CategorySection
          title="Sales Documents"
          subtitle={`Customer-facing documents for this ${SCOPE_NOUN[scope] || "deal"}`}
          defs={SALES_TYPES}
          docsByType={docsByType}
          loading={loading}
          onOpen={openDocType}
          gridClass="lg:grid-cols-5"
        />
      )}

      {showPurchase && (
        <CategorySection
          title="Purchase & Procurement Documents"
          subtitle={
            isVendor
              ? "Procurement documents for this vendor"
              : `Organisation-wide procurement records — not associated with this ${SCOPE_NOUN[scope] || "deal"}`
          }
          defs={PURCHASE_TYPES}
          docsByType={docsByType}
          loading={loading}
          onOpen={openDocType}
          gridClass="lg:grid-cols-3"
        />
      )}
    </div>
  );
};

export default DealDocumentsTab;
