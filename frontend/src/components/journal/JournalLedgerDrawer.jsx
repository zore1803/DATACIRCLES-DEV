import DeleteIcon from "../common/DeleteIcon";
import ExcelIcon from "../common/ExcelIcon";
import PdfIcon from "../common/PdfIcon";
import React, { useEffect, useState, useRef, useMemo } from "react";
import { X, BookText, ArrowDownCircle, ArrowUpCircle, Lock, Unlock } from "lucide-react";
import toast from "react-hot-toast";
import SearchIcon from "../common/SearchIcon";
import API from "../../services/api";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import ConfirmDialog from "../common/ConfirmDialog";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

const money = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatNumber = (n) =>
  Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

const formatDateTime = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

// The ledger orders by the transaction `date`, which now carries the exact
// day + time the user chose on the Pay In/Pay Out form (blank time = the
// moment it was recorded). Older entries were stored date-only (UTC midnight);
// for those, keep the day from `date` but borrow the clock time from `createdAt`.
const formatLedgerWhen = (row) => {
  const d = row?.date ? new Date(row.date) : null;
  if (!d || Number.isNaN(d.getTime())) return formatDateTime(row?.createdAt);
  const isDateOnly = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
  if (isDateOnly && row?.createdAt) {
    const c = new Date(row.createdAt);
    const day = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    return Number.isNaN(c.getTime())
      ? day
      : `${day}, ${c.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
  }
  return formatDateTime(d);
};

// Same dc-panel-card quick-drawer chrome as QuickJournalForm/CallLogForm —
// shows the transaction history (Date / Description / Pay In / Pay Out /
// Balance) for one Journal, and lets the user record a new Pay In/Pay Out
// straight from here (via onOpenPayIn/onOpenPayOut, opened by the caller so
// there's a single PayInOutModal instance instead of one per drawer).
const JournalLedgerDrawer = ({ isOpen, journalId, refreshKey, onClose, onOpenPayIn, onOpenPayOut, onJournalClosed, onJournalReopened }) => {
  useBodyScrollLock(isOpen);
  const [isSliding, setIsSliding] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [closeConfirm, setCloseConfirm] = useState({ open: false });
  const [currentPage, setCurrentPage] = useState(1);
  const limit = 10;
  
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setTimeout(() => setIsSliding(true), 10);
    } else {
      setIsSliding(false);
      setTimeout(() => setShouldRender(false), 300);
      // Drawer stays mounted between opens (only hidden via isSliding), so
      // the date filter has to be cleared explicitly on close — otherwise
      // it silently carries over to the next journal opened.
      setStartDate("");
      setEndDate("");
      setSearchTerm("");
      setCurrentPage(1);
    }
  }, [isOpen]);

  const fetchLedger = () => {
    if (!journalId) return;
    setLoading(true);
    API.get(`/journals/${journalId}/ledger`)
      .then((res) => setData(res.data))
      .catch((err) => toast.error(err.response?.data?.error || "Failed to load ledger"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!isOpen || !journalId) return;
    setData(null);
    setCurrentPage(1);
    fetchLedger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, journalId]);

  // Re-pull without clearing `data` first — a Pay In/Out recorded from this
  // same drawer (or from the list's row menu while this drawer stayed open)
  // lands here without a loading flash.
  useEffect(() => {
    if (!isOpen || !journalId || refreshKey === undefined) return;
    fetchLedger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const handleClose = () => {
    setIsSliding(false);
    setTimeout(() => onClose(), 300);
  };

  const handleDeleteEntry = async (entryId) => {
    if (!journalId) return;
    setDeletingId(entryId);
    try {
      await API.delete(`/journals/${journalId}/entries/${entryId}`);
      toast.success("Entry deleted");
      fetchLedger();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to delete entry");
    } finally {
      setDeletingId(null);
    }
  };

  const executeCloseJournal = async () => {
    if (!journalId) return;
    try {
      await API.post(`/journals/${journalId}/close`);
      toast.success("Journal closed successfully");
      setCloseConfirm({ open: false });
      if (onJournalClosed) onJournalClosed();
      fetchLedger();
      // Wait for table to reload before closing if needed, but fetchLedger will re-render
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to close journal");
    }
  };

  const executeReopenJournal = async () => {
    if (!journalId) return;
    try {
      await API.post(`/journals/${journalId}/reopen`);
      toast.success("Journal reopened successfully");
      if (onJournalReopened) onJournalReopened();
      fetchLedger();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to reopen journal");
    }
  };

  const journal = data?.journal;
  const rawRows = data?.rows || [];
  const summary = data?.summary;

  const sortedRows = [...rawRows].reverse();
  
  const filteredRows = useMemo(() => {
    return sortedRows.filter(row => {
      if (startDate) {
        const rowDate = new Date(row.date || row.createdAt);
        const start = new Date(startDate);
        start.setHours(0,0,0,0);
        if (rowDate < start) return false;
      }
      if (endDate) {
        const rowDate = new Date(row.date || row.createdAt);
        const end = new Date(endDate);
        end.setHours(23,59,59,999);
        if (rowDate > end) return false;
      }
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const party = (row.partyName || "").toLowerCase();
        const desc = (row.notes || row.description || "").toLowerCase();
        if (!party.includes(q) && !desc.includes(q)) return false;
      }
      return true;
    });
  }, [sortedRows, startDate, endDate, searchTerm]);

  const totalPages = Math.ceil(filteredRows.length / limit) || 1;
  const paginatedRows = filteredRows.slice((currentPage - 1) * limit, currentPage * limit);

  // When filters change, go to page 1
  useEffect(() => {
    setCurrentPage(1);
  }, [startDate, endDate, searchTerm]);

  if (!shouldRender) return null;

  const handleDownloadPDF = () => {
    if (!journal || !filteredRows.length) return;
    const doc = new jsPDF();
    
    doc.setFontSize(16);
    doc.text(`Journal Ledger: ${journal.name}`, 14, 15);
    
    if (summary) {
      doc.setFontSize(10);
      doc.text(`Net Balance: Rs. ${formatNumber(Math.abs(summary.balance))} (${summary.balance < 0 ? 'To Pay' : 'To Receive'})`, 14, 22);
    }

    const tableColumn = ["Date Time", "Description", "Party", "Mode", "Amount (in Rupees)", "Payment Type", "Closing Balance (in Rupees)"];
    const tableRows = filteredRows.map(row => {
      const isOpening = row._id === `${journal._id}-opening`;
      return [
        formatLedgerWhen(row),
        row.notes || row.description || "—",
        row.partyName || "—",
        row.paymentType || "—",
        isOpening ? "—" : formatNumber(row.amount),
        isOpening ? "—" : (row.type === "payin" ? "You Received" : "You Gave"),
        formatNumber(row.balance)
      ];
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 28,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [82, 88, 102] }
    });

    doc.save(`${journal.name}_Ledger.pdf`);
    toast.success("PDF Downloaded successfully");
  };

  const handleDownloadExcel = () => {
    if (!journal || !filteredRows.length) return;
    
    const tableData = filteredRows.map(row => {
      const isOpening = row._id === `${journal._id}-opening`;
      return {
        "Date Time": formatLedgerWhen(row),
        "Description": row.notes || row.description || "—",
        "Party": row.partyName || "—",
        "Mode": row.paymentType || "—",
        "Amount (in Rupees)": isOpening ? "—" : row.amount,
        "Payment Type": isOpening ? "—" : (row.type === "payin" ? "You Received" : "You Gave"),
        "Closing Balance (in Rupees)": row.balance
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(tableData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Ledger");
    XLSX.writeFile(workbook, `${journal.name}_Ledger.xlsx`);
    toast.success("Excel Downloaded successfully");
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[10000] transition-opacity duration-300 flex items-center justify-center p-4 sm:p-6"
        style={{ opacity: isSliding ? 1 : 0, pointerEvents: isSliding ? 'auto' : 'none' }}
        onClick={handleClose}
      >
        <div
          className={`relative w-full max-w-5xl h-[96vh] max-h-[96vh] bg-white shadow-2xl rounded-2xl flex flex-col overflow-hidden transform transition-all duration-300 ease-out ${isSliding ? "scale-100 translate-y-0" : "scale-95 translate-y-4"}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-[#D9D9D9] flex-shrink-0 bg-white gap-4">
          <div className="min-w-0 flex flex-col gap-1">
            <h2 className="text-2xl font-bold text-gray-900 truncate">
              {journal ? journal.name : "Ledger"}
            </h2>
            {summary && (
              <p className={`text-lg font-semibold ${summary.balance < 0 ? "text-red-600" : "text-green-600"}`}>
                Net Balance: {money(Math.abs(summary.balance))}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={handleDownloadExcel}
              className="flex items-center gap-1.5 px-3 h-8 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-semibold transition-colors"
            >
              <ExcelIcon className="w-4 h-4" /> Download Excel
            </button>
            <button 
              onClick={handleDownloadPDF}
              className="flex items-center gap-1.5 px-3 h-8 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-semibold transition-colors"
            >
              <PdfIcon className="w-4 h-4" /> Download PDF
            </button>
            {journal?.status === "active" && (
              <button 
                onClick={() => setCloseConfirm({ open: true })}
                className="flex items-center gap-1.5 px-3 h-8 rounded-full border border-orange-200 text-orange-600 hover:bg-orange-50 text-xs font-semibold transition-colors"
              >
                <Lock className="w-3.5 h-3.5" /> Close Journal
              </button>
            )}
            {(journal?.status === "cancelled" || journal?.status === "settled") && (
              <button 
                onClick={executeReopenJournal}
                className="flex items-center gap-1.5 px-3 h-8 rounded-full border border-green-200 text-green-600 hover:bg-green-50 text-xs font-semibold transition-colors"
              >
                <Unlock className="w-3.5 h-3.5" /> Reopen Journal
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              title="Close"
              className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-[#1C1B1F] transition-colors flex-shrink-0 ml-2"
              aria-label="Close"
            >
              <X className="w-[18px] h-[18px]" strokeWidth={2} />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-sm text-gray-400">Loading ledger…</div>
          ) : !data ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <BookText className="w-8 h-8 mb-2" />
              <p className="text-sm">No ledger data</p>
            </div>
          ) : (
            <>
              {/* Summary chips */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4">
                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold">
                    Credit {money(summary.credit)}
                  </span>
                  <span className="px-3 py-1.5 rounded-full bg-red-50 text-red-700 text-xs font-semibold">
                    Debit {money(summary.debit)}
                  </span>
                  <span className="px-3 py-1.5 rounded-full bg-gray-100 text-gray-700 text-xs font-semibold">
                    Total Volume {money(summary.net)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className={`relative h-8 flex items-center border border-[#E1E4EA] rounded-full bg-white transition-all duration-300 ease-in-out hover:bg-gray-50 focus-within:border-[#0085FF] focus-within:hover:bg-white ${
                    isSearchExpanded ? "w-[200px]" : "w-8"
                  } max-w-full`}>
                    <SearchIcon
                      className="absolute left-2 cursor-pointer z-10 flex-shrink-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#525866]"
                      onClick={() => { setIsSearchExpanded(true); searchInputRef.current?.focus(); }}
                    />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onFocus={() => setIsSearchExpanded(true)}
                      onBlur={() => { if (!searchTerm) setIsSearchExpanded(false); }}
                      className={`w-full h-full pl-7 pr-7 bg-transparent text-xs focus:outline-none transition-opacity duration-200 cursor-pointer ${
                        isSearchExpanded ? "opacity-100 focus:cursor-text" : "opacity-0"
                      }`}
                      placeholder="Search person..."
                    />
                    {isSearchExpanded && searchTerm && (
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setSearchTerm("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-4 h-4 rounded-full text-gray-900 hover:bg-gray-100 transition-colors"
                      >
                        <X className="w-2.5 h-2.5" strokeWidth={2.5} />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      className="h-8 px-2 rounded-md border border-gray-200 text-xs text-gray-700 outline-none focus:border-blue-500"
                    />
                    <span className="text-gray-400 text-xs font-medium">to</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      className="h-8 px-2 rounded-md border border-gray-200 text-xs text-gray-700 outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Transaction table */}
              <div className="px-6 pb-6">
                {/* `overflow-x-auto` (not `overflow-hidden`) — this drawer's narrowest
                    breakpoint is only 440px wide, which 6 whitespace-nowrap columns
                    (Date/Description/Pay In/Pay Out/Balance/delete) don't fit inside.
                    `overflow-hidden` here silently clipped Balance and the delete
                    button off the visible edge instead of making them reachable. */}
                <div className="border border-[#E1E4EA] rounded-xl overflow-x-auto">
                  <table className="w-full min-w-[800px] text-left">
                    <thead className="bg-[#F5F7FA]">
                      <tr>
                        <th className="px-3 py-2 text-xs font-bold text-[#525866] uppercase tracking-wide">Date Time</th>
                        <th className="px-3 py-2 text-xs font-bold text-[#525866] uppercase tracking-wide">Description</th>
                        <th className="px-3 py-2 text-xs font-bold text-[#525866] uppercase tracking-wide">Party</th>
                        <th className="px-3 py-2 text-xs font-bold text-[#525866] uppercase tracking-wide text-center">Mode</th>
                        <th className="px-3 py-2 text-xs font-bold text-[#525866] uppercase tracking-wide text-right">Amount</th>
                        <th className="px-3 py-2 text-xs font-bold text-[#525866] uppercase tracking-wide text-center">Payment Type</th>
                        <th className="px-3 py-2 text-xs font-bold text-[#525866] uppercase tracking-wide text-right">Closing Balance</th>
                        <th className="px-3 py-2 w-10" />
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-[#F1F1F5]">
                      {paginatedRows.map((row) => {
                        // The Opening Balance row is synthesized (its _id is a string like
                        // "<journalId>-opening", never a real ObjectId) — it can't be deleted.
                        const isOpeningRow = row._id === `${journal?._id}-opening`;
                        
                        let rowBgClass = "";
                        let amountColorClass = "";
                        let paymentTypeClass = "";
                        let paymentTypeText = "";

                        if (isOpeningRow) {
                          amountColorClass = "";
                        } else if (row.isClosingEntry) {
                          // For closing entries, a payout means we had a positive balance (profit) -> Green
                          // A payin means we had a negative balance (debt) -> Red
                          const isProfit = row.type === "payout";
                          rowBgClass = isProfit ? "bg-emerald-50" : "bg-red-50";
                          amountColorClass = isProfit ? "text-emerald-600" : "text-red-600";
                          paymentTypeClass = isProfit ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800";
                          paymentTypeText = isProfit ? "Settled (Credit)" : "Settled (Debit)";
                        } else {
                          const isPayin = row.type === "payin";
                          amountColorClass = isPayin ? "text-emerald-600" : "text-red-600";
                          paymentTypeClass = isPayin ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700";
                          paymentTypeText = isPayin ? "You Received" : "You Gave";
                        }

                        return (
                          <tr key={row._id} className={rowBgClass}>
                            <td className="px-3 py-1.5 text-sm text-gray-600 whitespace-nowrap">{formatLedgerWhen(row)}</td>
                            <td className="px-3 py-1.5 text-sm text-gray-900 font-medium truncate max-w-[150px]" title={row.notes || row.description}>{row.notes || row.description}</td>
                            <td className="px-3 py-1.5 text-sm text-gray-700 whitespace-nowrap">{row.partyName || "—"}</td>
                            <td className="px-3 py-1.5 text-sm text-gray-600 text-center whitespace-nowrap">{row.paymentType || "—"}</td>
                            <td className={`px-3 py-1.5 text-sm font-semibold text-right whitespace-nowrap ${amountColorClass}`}>
                              {isOpeningRow ? "—" : money(row.amount)}
                            </td>
                            <td className="px-3 py-1.5 text-center whitespace-nowrap">
                              {isOpeningRow ? (
                                <span className="text-sm text-gray-400">—</span>
                              ) : (
                                <span className={`px-2 py-1 rounded text-xs font-semibold ${paymentTypeClass}`}>
                                  {paymentTypeText}
                                </span>
                              )}
                            </td>
                            <td className={`px-3 py-1.5 text-sm font-bold text-right whitespace-nowrap ${row.balance < 0 ? "text-red-600" : (row.balance > 0 ? "text-emerald-600" : "text-gray-900")}`}>
                              {money(row.balance)}
                            </td>
                            <td className="px-1 py-1.5 text-right">
                              {!isOpeningRow && !row.isClosingEntry && journal?.status === "active" && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteEntry(row._id)}
                                  disabled={deletingId === row._id}
                                  className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                                  title="Delete entry"
                                >
                                  {deletingId === row._id ? (
                                    <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <DeleteIcon className="w-4 h-4" />
                                  )}
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

              </div>
            </>
          )}
        </div>

        {/* Sticky Footer */}
        {data && (
          <div className="flex-shrink-0 flex justify-between items-center px-6 py-4 border-t border-[#D9D9D9] bg-white">
            <div className="flex gap-2">
              {journal?.status === "active" && (onOpenPayIn || onOpenPayOut) && (
                <>
                  {onOpenPayIn && (
                    <button
                      type="button"
                      onClick={() => onOpenPayIn(journal)}
                      className="flex items-center gap-1.5 px-4 h-9 rounded-full bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors"
                    >
                      <ArrowDownCircle className="w-4 h-4" /> You Received
                    </button>
                  )}
                  {onOpenPayOut && (
                    <button
                      type="button"
                      onClick={() => onOpenPayOut(journal)}
                      className="flex items-center gap-1.5 px-4 h-9 rounded-full bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors"
                    >
                      <ArrowUpCircle className="w-4 h-4" /> You Gave
                    </button>
                  )}
                </>
              )}
            </div>

            <div className="flex justify-end items-center gap-2 text-sm text-gray-600 font-medium">
              <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {"<"}
              </button>
              <span>Page {currentPage} of {totalPages}</span>
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {">"}
              </button>
            </div>
          </div>
        )}
        </div>
      </div>

      {closeConfirm.open && journal && (
        <ConfirmDialog
          isOpen={true}
          title="Close Journal"
          message={
            journal.currentBalance !== 0
              ? `Are you sure you want to close this journal? This will create a final settlement entry of ₹${Math.abs(journal.currentBalance).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${journal.currentBalance > 0 ? "You Receive" : "You Give"}) and move the journal to the Closed section.`
              : "Are you sure you want to close this journal? The balance is ₹0.00. This will move the journal to the Closed section."
          }
          confirmLabel="Close Journal"
          cancelLabel="Cancel"
          onConfirm={executeCloseJournal}
          onCancel={() => setCloseConfirm({ open: false })}
        />
      )}
    </>
  );
};

export default JournalLedgerDrawer;
