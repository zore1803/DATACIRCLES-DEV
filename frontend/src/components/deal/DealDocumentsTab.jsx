import React, { useEffect, useMemo, useState } from "react";
import API from "../../services/api";
import { formatNumberToIndian } from "../../utils/numberFormatter";
import StatTile from "../common/StatTile";
import StatTileSkeleton from "../common/StatTileSkeleton";
import PdfIcon from "../common/PdfIcon";
import FilesIcon from "../common/FilesIcon";
import SearchIcon from "../common/SearchIcon";
// Only app-standard affordance glyphs stay from lucide — the design system has
// no custom chevron/close/rupee icons, and the rest of the app uses these.
import { IndianRupeeIcon, ChevronRight, ChevronLeft, X } from "lucide-react";

// Sales documents link to a Deal (deal ref on the model) and are fetched scoped
// to this deal. `amountField` is the model's own total; delivery challans carry
// an amount but it's a goods value, not revenue, so showAmount is false there.
// `dateField` is the doc's own date (sales returns use returnDate).
const SALES_TYPES = [
  { key: "invoice", label: "Invoice", endpoint: "/invoices", numberField: "invoiceNumber", amountField: "amount", dateField: "date", showAmount: true, dealScoped: true, icon: PdfIcon },
  { key: "quotation", label: "Quotation", endpoint: "/quotations", numberField: "quotationNumber", amountField: "amount", dateField: "date", showAmount: true, dealScoped: true, icon: PdfIcon },
  { key: "proforma", label: "Proforma Invoice", endpoint: "/performa-invoices", numberField: "performaInvoiceNumber", amountField: "amount", dateField: "date", showAmount: true, dealScoped: true, icon: PdfIcon },
  { key: "challan", label: "Delivery Challan", endpoint: "/delivery-challans", numberField: "deliveryChallanNumber", amountField: "amount", dateField: "date", showAmount: false, dealScoped: true, icon: PdfIcon },
  { key: "salesReturn", label: "Sales Return", endpoint: "/sales-returns", numberField: "returnNumber", amountField: "grandTotal", dateField: "returnDate", showAmount: true, dealScoped: true, icon: PdfIcon },
];

// Purchase documents belong to a Vendor, not a Deal — there is no deal link, so
// these are org-wide (not deal-scoped). Shown as separate procurement documents.
const PURCHASE_TYPES = [
  { key: "purchase", label: "Purchase", endpoint: "/purchases", numberField: "purchaseNumber", amountField: "grandTotal", dateField: "purchaseDate", showAmount: true, dealScoped: false, icon: PdfIcon },
  { key: "purchaseOrder", label: "Purchase Order", endpoint: "/purchase-orders", numberField: "poNumber", amountField: "grandTotal", dateField: "orderDate", showAmount: true, dealScoped: false, icon: PdfIcon },
  { key: "purchaseReturn", label: "Purchase Return", endpoint: "/purchase-returns", numberField: "returnNumber", amountField: "grandTotal", dateField: "returnDate", showAmount: true, dealScoped: false, icon: PdfIcon },
];

const ALL_TYPES = [...SALES_TYPES, ...PURCHASE_TYPES];
const DEF_BY_KEY = Object.fromEntries(ALL_TYPES.map((d) => [d.key, d]));

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
const statusPillStyle = (s) => {
  const hex = statusHex(s);
  return { color: hex, backgroundColor: `${hex}1A` }; // 1A ≈ 10% alpha
};

const sumAmount = (rows, field) => rows.reduce((sum, r) => sum + (Number(r?.[field]) || 0), 0);
const docNumber = (row, def) => row?.[def.numberField] || "—";
const docDate = (row, def) => row?.[def.dateField] || row?.createdAt || null;
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

const toItem = (row, def) => ({
  def,
  row,
  number: docNumber(row, def),
  amount: Number(row?.[def.amountField]) || 0,
  status: row?.status || "",
  date: docDate(row, def),
});

const latestOf = (rows, def) =>
  rows.reduce((latest, r) => {
    const d = docDate(r, def);
    if (!d) return latest;
    if (!latest || new Date(d) > new Date(docDate(latest, def))) return r;
    return latest;
  }, null);

// Compact status pills for the type cards — "2 Paid", small, subtle colour.
const StatusPills = ({ rows }) => {
  const counts = rows.reduce((acc, r) => {
    const s = r?.status || "none";
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([status, n]) => (
        <span
          key={status}
          className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium capitalize"
          style={statusPillStyle(status)}
        >
          {n} {status}
        </span>
      ))}
    </div>
  );
};

// Single status pill (used in list rows).
const StatusPill = ({ status }) =>
  status ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize" style={statusPillStyle(status)}>
      {status}
    </span>
  ) : (
    <span className="text-[11px] text-gray-400">—</span>
  );

const DocTypeCard = ({ def, rows, onOpen }) => {
  const Icon = def.icon;
  const count = rows.length;
  const total = sumAmount(rows, def.amountField);
  const latest = count > 0 ? latestOf(rows, def) : null;
  const empty = count === 0;

  return (
    <button
      type="button"
      onClick={() => !empty && onOpen(def.key)}
      disabled={empty}
      className={`group flex flex-col text-left bg-white border border-gray-200 rounded-xl p-4 transition-all ${
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

      {/* Value / empty state */}
      {empty ? (
        <p className="mt-1 text-sm text-gray-400">No documents yet</p>
      ) : def.showAmount ? (
        <p className="mt-0.5 text-lg font-bold text-gray-900">₹{formatNumberToIndian(total)}</p>
      ) : (
        <p className="mt-0.5 text-sm font-semibold text-gray-700">{count} document{count !== 1 ? "s" : ""}</p>
      )}

      {/* Status pills */}
      {!empty && (
        <div className="mt-2.5">
          <StatusPills rows={rows} />
        </div>
      )}

      {/* Latest doc */}
      {!empty && latest && (
        <p className="mt-2 text-[11px] text-gray-400 truncate">
          Last: {docNumber(latest, def)} · {fmtDate(docDate(latest, def))}
        </p>
      )}

      {/* Footer affordance */}
      {!empty && (
        <div className="mt-3 flex items-center gap-1 text-xs font-medium text-gray-400 group-hover:text-[#0085FF] transition-colors">
          View documents
          <ChevronRight className="w-3.5 h-3.5" />
        </div>
      )}
    </button>
  );
};

// One row in the drill-in list.
const DocRow = ({ item, showVendor }) => {
  const Icon = item.def.icon;
  const vendorName = item.row?.vendor?.name;
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
      <div className="bg-blue-50 p-2 rounded-lg flex-shrink-0">
        <Icon className="w-4 h-4 text-[#0085FF]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900 truncate">{item.number}</p>
        {showVendor && vendorName && <p className="text-[11px] text-gray-500 truncate">{vendorName}</p>}
      </div>
      <div className="hidden sm:block text-xs text-gray-500 w-28 text-right flex-shrink-0">{fmtDate(item.date)}</div>
      {item.def.showAmount && (
        <div className="text-sm font-semibold text-gray-900 w-24 text-right flex-shrink-0">
          ₹{formatNumberToIndian(item.amount)}
        </div>
      )}
      <div className="w-24 flex justify-end flex-shrink-0">
        <StatusPill status={item.status} />
      </div>
    </div>
  );
};

// ── Drill-in: one type's full list, with search + status filter + date sort ──
const TypeListView = ({ def, rows, onBack }) => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortDesc, setSortDesc] = useState(true);

  const items = useMemo(() => rows.map((row) => toItem(row, def)), [rows, def]);
  const statuses = useMemo(() => Array.from(new Set(items.map((i) => i.status).filter(Boolean))), [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((i) => (statusFilter === "all" ? true : i.status === statusFilter))
      .filter((i) => (q ? i.number.toLowerCase().includes(q) : true))
      .sort((a, b) => {
        const da = a.date ? new Date(a.date).getTime() : 0;
        const db = b.date ? new Date(b.date).getTime() : 0;
        return sortDesc ? db - da : da - db;
      });
  }, [items, search, statusFilter, sortDesc]);

  const Icon = def.icon;
  return (
    <div className="font-sf space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-[#0085FF] transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Documents
        </button>
        <span className="text-gray-300">/</span>
        <div className="flex items-center gap-2">
          <div className="bg-blue-50 p-1.5 rounded-lg">
            <Icon className="w-4 h-4 text-[#0085FF]" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900">{def.label}</h3>
          <span className="text-xs text-gray-400">{filtered.length} of {items.length}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] h-10">
          <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${def.label.toLowerCase()} number...`}
            className="w-full h-full pl-11 pr-10 border border-[rgba(31,41,55,0.1)] rounded-full text-sm focus:outline-none focus:border-[#0085FF]"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">
              <X size={16} />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setSortDesc((v) => !v)}
          className="h-10 px-4 rounded-full border border-[#E1E4EA] bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex-shrink-0"
        >
          {sortDesc ? "Newest first" : "Oldest first"}
        </button>
      </div>

      {statuses.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              statusFilter === "all" ? "bg-[#0085FF] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            All
          </button>
          {statuses.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                statusFilter === s ? "bg-[#0085FF] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">No documents match.</div>
        ) : (
          filtered.map((item) => <DocRow key={item.row._id} item={item} showVendor={!def.dealScoped} />)
        )}
      </div>
    </div>
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
        ? defs.map((d) => <div key={d.key} className="h-[164px] bg-gray-50 border border-gray-200 rounded-xl animate-pulse" />)
        : defs.map((def) => (
            <DocTypeCard key={def.key} def={def} rows={docsByType[def.key] || []} onOpen={onOpen} />
          ))}
    </div>
  </div>
);

const DealDocumentsTab = ({ dealId, showStats = true }) => {
  const [loading, setLoading] = useState(true);
  const [docsByType, setDocsByType] = useState({});
  const [activeType, setActiveType] = useState(null);

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

  if (activeType) {
    return (
      <TypeListView
        def={DEF_BY_KEY[activeType]}
        rows={docsByType[activeType] || []}
        onBack={() => setActiveType(null)}
      />
    );
  }

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
        onOpen={setActiveType}
        gridClass="lg:grid-cols-5"
      />

      <CategorySection
        title="Purchase Documents"
        subtitle="Vendor / procurement documents (not deal-specific)"
        defs={PURCHASE_TYPES}
        docsByType={docsByType}
        loading={loading}
        onOpen={setActiveType}
        gridClass="lg:grid-cols-3"
      />
    </div>
  );
};

export default DealDocumentsTab;
