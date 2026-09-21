import DeleteIcon from "../common/DeleteIcon";
import Checkbox from "../common/Checkbox";
import SearchIcon from "../common/SearchIcon";
import DownloadIcon from "../common/DownloadIcon";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import Skeleton from "../common/Skeleton";
import StatTile from "../common/StatTile";
import API from "../../services/api";
import { useParams } from "react-router-dom";
import { autoTable } from "jspdf-autotable";
import {
  ArrowUpCircle,
  ArrowDownCircle,
  X,
  Filter,
  RefreshCw,
  User,
  CreditCard,
  TrendingUp,
  TrendingDown,
  Clock,
  AlertCircle,
} from "lucide-react";
import { formatNumberFixed } from "../../utils/numberFormatter";
import QuickVendorForm from "../vendor/QuickVendorForm";
import VendorPaymentForm from "../vendor/VendorPaymentForm";
import PaymentPreview from "../vendor/venerPaymentPreview";
import DataTable from "../common/DataTable";
import RowActionsMenu from "../common/RowActionsMenu";
import BulkActionBar from "../common/BulkActionBar";
import TablePaginationFooter from "../common/TablePaginationFooter";
import ToolbarFilterGroup from "../company/ToolbarFilterGroup";
import FilterIcon from "../common/FilterIcon";
import { useBulkSelection, useBulkStrip } from "../../hooks/useBulkSelection";
import { useTopLoadingSignal } from "../common/TopLoadingBar";
import { exportToCSV } from "../../utils/exportToCSV";
import toast from "react-hot-toast";
import AppToaster from "../AppToaster";
import HighlightText from "../common/HighlightText";
import EyeIcon from "../common/EyeIcon";
import EditIcon from "../common/EditIcon";

/* `options` seeds each dropdown with the schema's full enum (models/Payment.js)
   so a value stays filterable even when no current row uses it. */
const PAYMENT_FILTER_COLUMNS = [
  { key: "direction", label: "Direction", options: ["IN", "OUT"] },
  { key: "paymentType", label: "Mode", placeholder: "All Modes", options: ["Card", "Cash", "Cheque", "EMI", "Net Banking", "UPI"] },
  { key: "bank", label: "Bank" },
];

const getPaymentFieldValue = (payment, key) => payment[key];

// showKPIs is now controlled by the parent page's own Financial Summary
// strip toggle (VendorDetailsPageNew.jsx's ⋮ menu "Hide/Show Financial
// Summary", wired to its showKPI state) instead of an independent button
// here — one toggle for both the page-level strip and this section's own
// KPI row, instead of two that could disagree. Defaults true for any
// caller that doesn't pass it (e.g. the older VendorDetailsPage.jsx, which
// has no such toggle to wire up and previously always showed this row).
const PaymentsTable = ({ payments, vendor, showKPIs = true, autoOpenCreate = false, onAutoOpenCreateConsumed }) => {
  const { id } = useParams();
  const [localPayments, setLocalPayments] = useState(payments || []);
  const [showForm, setShowForm] = useState(false);
  const [formDirection, setFormDirection] = useState(null);
  const [loading, setLoading] = useState(false);
  const [_error, setError] = useState("");
  const [_success, setSuccess] = useState("");
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptPayment, setReceiptPayment] = useState(null);
  const [vendorFields, setVendorFields] = useState([]);
  const [additionalFieldValues, setAdditionalFieldValues] = useState({});
  const [search, setSearch] = useState("");
  const [selectedFilters, setSelectedFilters] = useState({});
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [columnSizing, setColumnSizing] = useState({});
  const [isDeleting, setIsDeleting] = useState(false);

  const [columnOrder, setColumnOrder] = useState(() => [
    "selection", "reference_id", "paymentDate", "direction", "paymentType", "bank", "reference", "amount"
  ]);

  // "New Entry" menu on the vendor header (VendorDetailsPageNew.jsx) sets
  // autoOpenCreate + switches to this tab in the same click — same
  // pendingCreate pattern CompanyProfilePage.jsx uses for its tabs.
  useEffect(() => {
    if (autoOpenCreate) {
      handleOpenForm("IN");
      onAutoOpenCreateConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenCreate, onAutoOpenCreateConsumed]);
  const [hiddenColumns, setHiddenColumns] = useState(new Set());
  const [pinnedColumns, setPinnedColumns] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: null });

  const handleColumnReorder = (draggedKey, targetKey) => {
    setColumnOrder((prev) => {
      const newOrder = [...prev];
      const draggedIdx = newOrder.indexOf(draggedKey);
      const targetIdx = newOrder.indexOf(targetKey);
      if (draggedIdx === -1 || targetIdx === -1) return prev;
      newOrder.splice(draggedIdx, 1);
      newOrder.splice(targetIdx, 0, draggedKey);
      return newOrder;
    });
  };

  const handlePinColumn = (colId, side) => {
    setPinnedColumns((prev) => [...prev.filter((p) => p.key !== colId), { key: colId, side }]);
  };

  const handleUnpinColumn = (colId) => {
    setPinnedColumns((prev) => prev.filter((p) => p.key !== colId));
  };

  const handleHideColumn = (colId) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      next.add(colId);
      return next;
    });
  };

  const handleSort = (key, direction) => {
    setSortConfig((prev) =>
      prev.key === key && prev.direction === direction
        ? { key: null, direction: null }
        : { key, direction },
    );
  };

  useEffect(() => {
    setLocalPayments(payments || []);
  }, [JSON.stringify(payments)]);

  useEffect(() => {
    fetchVendorFields();
  }, []);

  const fetchVendorFields = async () => {
    try {
      const res = await API.get("/vendor-fields");
      if (res.data?.fields) {
        setVendorFields(res.data.fields);
      }
    } catch (error) {
      console.error("Failed to fetch vendor fields", error);
    }
  };

  const handleViewReceipt = (payment) => {
    setReceiptPayment(payment);
    setShowReceiptModal(true);
  };

  const filteredPayments = useMemo(() => {
    let rows = localPayments;

    const term = search.trim().toLowerCase();
    if (term) {
      rows = rows.filter((p) =>
        [p.direction, p.paymentType, p.bank, p.reference, p.notes, String(p.amount), p._id]
          .some((v) => String(v || "").toLowerCase().includes(term)),
      );
    }

    Object.entries(selectedFilters).forEach(([key, values]) => {
      if (!values?.length) return;
      rows = rows.filter((p) => values.includes(String(getPaymentFieldValue(p, key) ?? "")));
    });

    return rows;
  }, [localPayments, search, selectedFilters]);

  const activeFilterCount = Object.values(selectedFilters).reduce(
    (n, arr) => n + (arr?.length || 0),
    0,
  );

  /* ── Pagination — same client-side "first ... current ... last" pattern
     CompanyInvoicesTab uses. Search/filters reset back to page 1. */
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  useEffect(() => {
    setPage(1);
  }, [search, selectedFilters]);
  const sortedPayments = useMemo(() => {
    if (!sortConfig.key) return filteredPayments;
    return [...filteredPayments].sort((a, b) => {
      let aVal = getPaymentFieldValue(a, sortConfig.key) ?? "";
      let bVal = getPaymentFieldValue(b, sortConfig.key) ?? "";
      if (sortConfig.key === "paymentDate") {
        aVal = new Date(a.paymentDate).getTime();
        bVal = new Date(b.paymentDate).getTime();
      } else if (sortConfig.key === "reference_id") {
        aVal = a._id;
        bVal = b._id;
      }
      const aCmp = typeof aVal === "number" ? aVal : String(aVal).toLowerCase();
      const bCmp = typeof bVal === "number" ? bVal : String(bVal).toLowerCase();
      if (aCmp < bCmp) return sortConfig.direction === "asc" ? -1 : 1;
      if (aCmp > bCmp) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredPayments, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(sortedPayments.length / limit));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  // Brief top-edge progress flash on page change — same visual language as
  // Companies.jsx's server-paginated list, even though this data is already
  // in memory (client-side slice) rather than a fresh network round trip.
  const [isPaging, setIsPaging] = useState(false);
  useTopLoadingSignal(isPaging);
  const goToPage = (n) => {
    if (n === page) return;
    setIsPaging(true);
    setPage(n);
    setTimeout(() => setIsPaging(false), 220);
  };
  const paginatedPayments = useMemo(
    () => sortedPayments.slice((page - 1) * limit, page * limit),
    [sortedPayments, page, limit],
  );

  const { selectedItems, toggleItem, clearSelection, selectAll } = useBulkSelection({
    items: filteredPayments,
  });
  const { visible: stripVisible, closing: stripClosing } = useBulkStrip(selectedItems.length);

  const handleExportSelected = () => {
    const dataToExport = payments
      .filter((p) => selectedItems.includes(p._id))
      .map((p) => ({
        "Date": new Date(p.paymentDate).toLocaleDateString(),
        "Amount": p.amount,
        "Direction": p.direction,
        "Type": p.paymentType,
        "Bank": p.bank || "",
        "Reference": p.reference || "",
        "Notes": p.notes || "",
      }));
    if (dataToExport.length === 0) return;
    const headers = Object.keys(dataToExport[0]).join(",");
    const rows = dataToExport.map(row => Object.values(row).map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
    exportToCSV([headers, ...rows], `payments_export_${new Date().toISOString().split("T")[0]}.csv`);
  };

  // Confirmation is a styled modal (see showBulkDeleteModal below), matching
  // CompanyContactsTab.jsx's bulk-delete flow, instead of the browser's
  // window.confirm this used previously.
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);

  const handleBulkDelete = async () => {
    if (!selectedItems.length) return;
    setIsDeleting(true);
    try {
      await Promise.all(selectedItems.map((pid) => API.delete(`/vendors/${id}/payments/${pid}`)));
      setLocalPayments((prev) => prev.filter((p) => !selectedItems.includes(p._id)));
      clearSelection();
      setShowBulkDeleteModal(false);
      toast.success("Payments deleted!");
    } catch (err) {
      console.error("Bulk delete failed:", err);
      toast.error(err.response?.data?.error || "Failed to delete some payments.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAddPayment = async (payload) => {
    try {
      setLoading(true);
      const res = await API.post(`/vendors/${id}/payments`, payload);
      setLocalPayments([...localPayments, res.data]);
      toast.success("Payment added!");
      setError("");
    } catch (err) {
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || "Failed to add payment");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOpenForm = (direction) => {
    setFormDirection(direction);
    setSelectedPayment(null);
    setShowForm(true);
    setError("");
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setFormDirection(null);
    setSelectedPayment(null);
    setError("");
  };

  const handleViewPDF = () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text(`Payments for ${vendor.name}`, 10, 10);

    const tableData = filteredPayments.map((payment) => [
      `${payment.direction === "OUT" ? "PAYOUT" : "PAYIN"}-${payment._id.slice(-4)}`,
      `${new Date(payment.paymentDate).toLocaleDateString()} ${new Date(payment.paymentDate).toLocaleTimeString()}`,
      payment.direction === "OUT" ? "Payment Out" : "Payment In",
      payment.paymentType || "UPI",
      `₹${formatNumberFixed(payment.amount)}`,
      `₹${formatNumberFixed(payment.amount)}`,
    ]);

    const tableHeaders = ["ID", "Date / Time", "Status", "Mode", "Amount", "Balance"];

    autoTable(doc, {
      head: [tableHeaders],
      body: tableData,
      startY: 20,
    });

    doc.save(`${vendor.name}_payments.pdf`);
  };

  const handleEditClick = () => {
    setSelectedVendor({
      _id: vendor._id,
      name: vendor.name || "",
      phone: vendor.phone || "",
      email: vendor.email || "",
      company: vendor.company || "",
      gstin: vendor.gstin || "",
      address: {
        line1: vendor.address?.line1 || "",
        line2: vendor.address?.line2 || "",
        city: vendor.address?.city || "",
        state: vendor.address?.state || "",
        pincode: vendor.address?.pincode || "",
        country: vendor.address?.country || "India",
      },
      avatar: vendor.avatar || "",
      balance: vendor.balance || 0,
      additionalFields: vendor.additionalFields || [],
    });
    setAdditionalFieldValues(
      vendor.additionalFields?.reduce(
        (acc, { key, value }) => ({ ...acc, [key]: value }),
        {}
      ) || {}
    );
    setShowUpdateModal(true);
  };

  const handleEditPayment = (payment) => {
    setSelectedPayment(payment);
    setFormDirection(payment.direction);
    setShowForm(true);
  };

  const handlePaymentUpdateSuccess = (updatedPayment) => {
    setLocalPayments(
      localPayments.map((payment) =>
        payment._id === updatedPayment._id ? updatedPayment : payment
      )
    );
    toast.success("Payment updated!");
    setError("");
  };

  const handlePaymentDeleteSuccess = (deletedPaymentId) => {
    setLocalPayments(localPayments.filter((payment) => payment._id !== deletedPaymentId));
    toast.success("Payment deleted!");
    setError("");
  };

  const handleQuickDeletePayment = async (payment) => {
    if (window.confirm('Delete this payment?')) {
      try {
        setLoading(true);
        await API.delete(`/vendors/${id}/payments/${payment._id}`);
        setLocalPayments(localPayments.filter((p) => p._id !== payment._id));
        toast.success("Payment deleted!");
      } catch (err) {
        if (err.response?.status === 402) {
          toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
        } else {
          toast.error(err.response?.data?.error || "Failed to delete payment");
        }
      } finally {
        setLoading(false);
      }
    }
  };

  // Calculate statistics
  const stats = {
    totalPaymentsIn: filteredPayments.filter((p) => p.direction === "IN").length,
    totalPaymentsOut: filteredPayments.filter((p) => p.direction === "OUT").length,
    totalAmountIn: filteredPayments
      .filter((p) => p.direction === "IN")
      .reduce((sum, p) => sum + p.amount, 0),
    totalAmountOut: filteredPayments
      .filter((p) => p.direction === "OUT")
      .reduce((sum, p) => sum + p.amount, 0),
  };

  const netBalance = stats.totalAmountIn - stats.totalAmountOut;

  // Period-over-period trend. Split the actual filtered payments in half by
  // date (older half = "previous", newer half = "current") instead of a
  // fixed last-30-vs-prior-30-calendar-days window — a fixed wall-clock
  // window meant an edit to any payment dated outside it silently couldn't
  // move the percentage at all, which looked hardcoded/stuck even though it
  // wasn't. A data-relative split always includes every payment, in one
  // half or the other, so any add/edit/delete visibly recomputes this.
  const trendStats = useMemo(() => {
    const sorted = [...filteredPayments].sort(
      (a, b) => new Date(a.paymentDate) - new Date(b.paymentDate),
    );
    const mid = Math.ceil(sorted.length / 2);
    const prevRows = sorted.slice(0, mid);
    const currentRows = sorted.slice(mid);
    const sumIn = (rows) => rows.filter((p) => p.direction === "IN").reduce((s, p) => s + p.amount, 0);
    const sumOut = (rows) => rows.filter((p) => p.direction === "OUT").reduce((s, p) => s + p.amount, 0);
    const pctChange = (curr, prev) => {
      if (!prev) return curr > 0 ? { pct: 100, up: true } : null;
      const pct = ((curr - prev) / prev) * 100;
      return { pct: Math.abs(Math.round(pct)), up: pct >= 0 };
    };
    return {
      given: pctChange(sumOut(currentRows), sumOut(prevRows)),
      got: pctChange(sumIn(currentRows), sumIn(prevRows)),
      balance: pctChange(
        sumIn(currentRows) - sumOut(currentRows),
        sumIn(prevRows) - sumOut(prevRows),
      ),
      total: pctChange(currentRows.length, prevRows.length),
    };
  }, [filteredPayments]);

  /* ── Columns ──
     `bank` and `reference` are surfaced here for the first time; they were
     stored on the Payment but only ever visible inside the receipt preview. */
  const baseColumns = useMemo(
    () => [
      {
        id: "selection",
        size: 44,
        enableResizing: false,
        header: () => (
          <div className="flex justify-center items-center w-full">
            <Checkbox checked={
                selectedItems.length > 0 &&
                selectedItems.length === filteredPayments.length
              } onChange={(e) =>
                e.target.checked ? selectAll(filteredPayments) : clearSelection()
              }  uncheckedColor="text-[#525866]"/>
          </div>
        ),
        cell: ({ row }) => (
          <div className="flex justify-center items-center w-full">
            <Checkbox checked={selectedItems.includes(row.original._id)} onChange={() => toggleItem(row.original._id)} />
          </div>
        ),
      },
      {
        id: "reference_id",
        size: 110,
        header: "ID",
        cell: ({ row }) => (
          <span className="text-xs font-mono font-medium text-gray-900">
            {row.original.direction === "OUT" ? "OUT" : "IN"}-
            <HighlightText text={row.original._id.slice(-4).toUpperCase()} query={search} />
          </span>
        ),
      },
      {
        id: "paymentDate",
        size: 150,
        header: "Date / Time",
        cell: ({ row }) => (
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-medium text-gray-900">
              {new Date(row.original.paymentDate).toLocaleDateString()}
            </span>
            <span className="text-xs text-gray-500">
              {new Date(row.original.paymentDate).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        ),
      },
      {
        id: "direction",
        size: 110,
        header: "Status",
        cell: ({ row }) => (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${row.original.direction === "OUT"
              ? "bg-blue-100 text-blue-800"
              : "bg-blue-600 text-white"
              }`}
          >
            {row.original.direction === "OUT" ? (
              <ArrowUpCircle className="w-3 h-3" />
            ) : (
              <ArrowDownCircle className="w-3 h-3" />
            )}
            {row.original.direction === "OUT" ? "Out" : "In"}
          </span>
        ),
      },
      {
        id: "paymentType",
        size: 130,
        header: "Mode",
        cell: ({ row }) => (
          <span className="text-sm text-gray-700">
            {row.original.paymentType ? <HighlightText text={row.original.paymentType} query={search} /> : "—"}
          </span>
        ),
      },
      {
        id: "bank",
        size: 120,
        header: "Bank",
        cell: ({ row }) => (
          <span className="text-sm text-gray-700">
            {row.original.bank ? <HighlightText text={row.original.bank} query={search} /> : "—"}
          </span>
        ),
      },
      {
        id: "reference",
        size: 170,
        header: "Reference",
        cell: ({ row }) => (
          <span className="font-medium text-gray-900 truncate block">
            {row.original.reference ? <HighlightText text={row.original.reference} query={search} /> : "—"}
          </span>
        ),
      },
      {
        id: "amount",
        size: 140,
        header: "Amount",
        cell: ({ row }) => (
          <span
            className={`text-sm ${row.original.direction === "OUT" ? "text-red-600" : "text-green-600"
              }`}
          >
            {row.original.direction === "OUT" ? "−" : "+"} <HighlightText text={`₹${formatNumberFixed(row.original.amount)}`} query={search} />
          </span>
        ),
      },
    ],
    [paginatedPayments, selectedItems, selectAll, clearSelection, toggleItem],
  );

  // No dedicated "Actions" column — a single ⋮ button (RowActionsMenu) that
  // pops Edit/Delete/View as a small action card renders inside whichever
  // column currently ends up last (via the wrap below), the same way
  // CompanyContactsTab.jsx puts its "open contact" icon on the last visible
  // column instead of pinning a fixed Actions column.
  const paymentActionButtons = (payment) => (
    <RowActionsMenu
      actions={[
        { label: "Edit", icon: EditIcon, onClick: () => handleEditPayment(payment) },
        { label: "View Receipt", icon: EyeIcon, onClick: () => handleViewReceipt(payment) },
        { label: "Delete", icon: DeleteIcon, danger: true, onClick: () => handleQuickDeletePayment(payment) },
      ]}
    />
  );

  const finalColumns = useMemo(() => {
    const visibleBase = baseColumns.filter(c => !hiddenColumns.has(c.id));
    const selectionCol = visibleBase.find(c => c.id === "selection");
    const otherCols = visibleBase.filter(c => c.id !== "selection");

    const leftPinnedKeys = new Set(pinnedColumns.filter(p => p.side === 'left').map(p => p.key));
    const rightPinnedKeys = new Set(pinnedColumns.filter(p => p.side === 'right').map(p => p.key));

    const leftCols = otherCols.filter(c => leftPinnedKeys.has(c.id));
    const rightCols = otherCols.filter(c => rightPinnedKeys.has(c.id));
    const midCols = otherCols.filter(c => !leftPinnedKeys.has(c.id) && !rightPinnedKeys.has(c.id));

    midCols.sort((a, b) => columnOrder.indexOf(a.id) - columnOrder.indexOf(b.id));

    const ordered = [
      ...(selectionCol ? [selectionCol] : []),
      ...leftCols,
      ...midCols,
      ...rightCols,
    ];

    // Action icons live inside whichever column is currently last, instead
    // of a fixed pinned "Actions" column — wrap a COPY of that column's cell
    // renderer to append them after its own content. Copying (not mutating
    // the shared baseColumns object) matters: the "last" column changes as
    // columns get reordered/hidden, so mutating in place would leave a
    // stale action-button wrapper on a column that's no longer last.
    let lastIdx = -1;
    for (let i = ordered.length - 1; i >= 0; i--) {
      if (ordered[i].id !== "selection") {
        lastIdx = i;
        break;
      }
    }
    if (lastIdx !== -1) {
      const original = ordered[lastIdx];
      const originalCell = original.cell;
      ordered[lastIdx] = {
        ...original,
        cell: (props) => (
          <div className="flex items-center justify-between gap-2 w-full min-w-0">
            <div className="min-w-0 flex-1">{originalCell(props)}</div>
            {paymentActionButtons(props.row.original)}
          </div>
        ),
      };
    }

    return ordered;
  }, [baseColumns, columnOrder, hiddenColumns, pinnedColumns]);

  const visibleColumnsForGhost = useMemo(() => finalColumns.map(c => ({ key: c.id, label: c.header })), [finalColumns]);
  const getGhostPreview = (colId) => {
    return paginatedPayments.slice(0, 10).map((p) => {
      if (colId === "paymentDate") return new Date(p.paymentDate).toLocaleDateString();
      if (colId === "amount") return `₹${formatNumberFixed(p.amount)}`;
      if (colId === "reference_id") return p._id.slice(-4).toUpperCase();
      return String(getPaymentFieldValue(p, colId) ?? "").trim() || "—";
    });
  };

  return (
    <div className="h-full mt-0">
      <AppToaster />

      {/* Action Buttons (Portaled to Tab Header) removed */}


      {/* Stats Cards — the shared StatTile the Dashboard KPI row uses, so
          this reads as the same stat style everywhere instead of its own
          near-identical bespoke tile. */}
      {showKPIs && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {[
            { label: "Total Given", value: `₹${formatNumberFixed(stats.totalAmountOut)}`, icon: TrendingUp, trend: trendStats.given },
            { label: "Total Got", value: `₹${formatNumberFixed(stats.totalAmountIn)}`, icon: TrendingDown, trend: trendStats.got },
            {
              label: "Net Balance",
              value: `₹${formatNumberFixed(Math.abs(netBalance))}`,
              icon: AlertCircle,
              valueClass: netBalance >= 0 ? "text-green-600" : "text-red-600",
              trend: trendStats.balance,
            },
            { label: "Total", value: filteredPayments.length, icon: Clock, trend: trendStats.total },
          ].map((tile) => (
            <StatTile
              key={tile.label}
              tile={{
                icon: tile.icon,
                iconClass: "text-blue-600",
                label: tile.label,
                value: tile.value,
                valueClassName: tile.valueClass,
                subtitle: tile.trend
                  ? `${tile.trend.up ? "Increased" : "Decreased"} by ${tile.trend.pct}%`
                  : undefined,
                subtitleIcon: tile.trend ? (tile.trend.up ? TrendingUp : TrendingDown) : undefined,
                subtitleClass: tile.trend ? (tile.trend.up ? "text-green-600" : "text-red-600") : undefined,
              }}
            />
          ))}
        </div>
      )}

      {showKPIs && (
        <div className="-mx-6" style={{ marginTop: 24, paddingBottom: 24, borderTop: "1px solid #E1E4EA" }} />
      )}

      {/* Payments table — same chrome as the CompanyProfilePage tabs: bordered
          shell, sticky #F5F7FA header, per-row selection and a bulk strip. */}
      {stripVisible ? (
        <BulkActionBar
          selectedCount={selectedItems.length}
          entityName="payment"
          isClosing={stripClosing}
          onSelectAll={() => selectAll(filteredPayments)}
          onDeselectAll={clearSelection}
          onExport={handleExportSelected}
          onCancel={clearSelection}
          onDelete={() => setShowBulkDeleteModal(true)}
          isDeleting={isDeleting}
        />
      ) : (
        <div className="flex flex-wrap lg:flex-nowrap items-center gap-4 mb-3" style={{ minHeight: "44px" }}>
          <div className="relative flex-1 min-w-[180px] h-[44px]">
            <SearchIcon className="absolute left-3.5 -translate-y-1/2 top-1/2 w-4 h-4 text-[#525866]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search payments..."
              className="w-full h-full pl-11 pr-3.5 border border-[rgba(31,41,55,0.1)] rounded-full text-sm focus:outline-none focus:border-[#0085FF]"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-900 focus:outline-none"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <ToolbarFilterGroup
            isOpen={showFilterPanel}
            columns={PAYMENT_FILTER_COLUMNS}
            data={localPayments}
            getFieldValue={getPaymentFieldValue}
            selected={selectedFilters}
            onApply={setSelectedFilters}
          />
          <button
            onClick={() => setShowFilterPanel((open) => !open)}
            aria-expanded={showFilterPanel}
            className={`relative flex items-center justify-center gap-2 px-3 text-sm font-medium bg-white border rounded-full hover:bg-gray-50 flex-shrink-0 transition-colors ${
              showFilterPanel ? "text-[#0085FF]" : "text-gray-800"
            }`}
            style={{
              height: "44px",
              borderColor: showFilterPanel || activeFilterCount > 0 ? "#0085FF" : "#E1E4EA",
            }}
          >
            <FilterIcon size={16} />
            Filter
            {activeFilterCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-blue-600 text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full ring-2 ring-white">
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            onClick={handleViewPDF}
            className="flex items-center justify-center h-[44px] w-[44px] border border-[#E1E4EA] text-gray-700 rounded-full hover:bg-gray-50 transition-colors flex-shrink-0"
            title="Download PDF"
          >
            <DownloadIcon />
          </button>
          {/* Got/Gave moved to the far right of the row — the eye button
              that used to sit here (toggling the below-fold showKPIs block,
              which defaults to hidden anyway) has been removed outright. */}
          <button
            onClick={() => handleOpenForm("IN")}
            className="flex items-center justify-center gap-2 h-[44px] px-4 bg-[#0085FF] text-white text-sm font-medium rounded-full hover:bg-[#0070D9] transition-colors flex-shrink-0 shadow-sm"
          >
            <ArrowDownCircle size={18} />
            <span>Got</span>
          </button>
          <button
            onClick={() => handleOpenForm("OUT")}
            className="flex items-center justify-center gap-2 h-[44px] px-4 bg-[#0085FF] text-white text-sm font-medium rounded-full hover:bg-[#0070D9] transition-colors flex-shrink-0 shadow-sm"
          >
            <ArrowUpCircle size={18} />
            <span>Gave</span>
          </button>
        </div>
      )}

      {!loading && localPayments.length === 0 ? (
        <div className="flex flex-col items-center justify-center w-full min-h-[300px] bg-gray-50 border border-gray-200 rounded-xl text-gray-500">
          <CreditCard size={28} className="mb-3 text-gray-400" />
          <button
            type="button"
            onClick={() => handleOpenForm("IN")}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-[#0085FF] text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors"
          >
            <ArrowDownCircle size={16} />
            Add new payment
          </button>
        </div>
      ) : (
      <div className="bg-white border border-[#E1E4EA] rounded-xl shadow-[0px_2px_4px_rgba(28,27,31,0.04)] overflow-hidden">
        <DataTable
          data={paginatedPayments}
          columns={finalColumns}
          loading={loading}
          columnSizing={columnSizing}
          onColumnSizingChange={setColumnSizing}
          pinnedColumns={pinnedColumns}
          onPinColumn={handlePinColumn}
          onUnpinColumn={handleUnpinColumn}
          onHideColumn={handleHideColumn}
          onSort={handleSort}
          sortConfig={sortConfig}
          onColumnReorder={handleColumnReorder}
          visibleColumns={visibleColumnsForGhost}
          getGhostPreview={getGhostPreview}
          variant="card"
          maxHeight={400}
          rowClassName={(p) => (selectedItems.includes(p._id) ? "!bg-blue-50" : "")}
          loadingContent={
            <div className="space-y-0">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-[#E1E4EA] last:border-b-0">
                  <Skeleton width={16} height={16} />
                  <Skeleton width={70} height={13} />
                  <Skeleton width={80} height={13} />
                  <Skeleton width={50} height={13} />
                  <Skeleton width={60} height={13} />
                  <Skeleton width={60} height={13} />
                  <Skeleton width={100} height={13} />
                  <Skeleton width={70} height={13} />
                </div>
              ))}
            </div>
          }
          emptyContent={
            <p className="text-gray-500 text-sm font-medium">No payments found.</p>
          }
        />

        <div className="border-t border-[#E1E4EA] px-5">
          <TablePaginationFooter
            currentPage={page}
            totalPages={totalPages}
            totalCount={filteredPayments.length}
            limit={limit}
            onPageChange={goToPage}
            onLimitChange={(n) => {
              setLimit(n);
              setPage(1);
            }}
          />
        </div>
      </div>
      )}

      {/* Modals */}
      <VendorPaymentForm
        open={showForm}
        vendorId={id}
        direction={formDirection}
        onSave={handleAddPayment}
        onClose={handleCloseForm}
        paymentToEdit={selectedPayment}
        onUpdateSuccess={handlePaymentUpdateSuccess}
        onDeleteSuccess={handlePaymentDeleteSuccess}
      />

      {showUpdateModal && (
        <QuickVendorForm
          editVendor={selectedVendor}
          onVendorUpdated={() => {
            setShowUpdateModal(false);
            setSelectedVendor(null);
            setAdditionalFieldValues({});
          }}
          onRequestClose={() => {
            setShowUpdateModal(false);
            setSelectedVendor(null);
            setAdditionalFieldValues({});
          }}
        />
      )}

      {showReceiptModal && (
        <PaymentPreview
          isOpen={showReceiptModal}
          onClose={() => setShowReceiptModal(false)}
          payment={receiptPayment}
          vendor={vendor}
        />
      )}

      {showBulkDeleteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10005] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-6 text-center">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Confirm Delete</h3>
              <p className="text-sm text-gray-500 mb-6">
                Delete {selectedItems.length} selected payment{selectedItems.length !== 1 ? "s" : ""}? This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setShowBulkDeleteModal(false)}
                  disabled={isDeleting}
                  className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={isDeleting}
                  className="px-5 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors shadow-sm disabled:opacity-50"
                >
                  {isDeleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentsTable;
