import React, { useEffect, useState } from "react";
import API from "../../services/api";

// Expenses and Indirect Income associated with one Deal. Listing only: these
// are related records, not part of the Deal's value or any revenue figure.

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
const money = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const RecordsCard = ({ title, emptyText, rows, loading }) => (
  <div className="bg-white border border-[#E7E4E3] rounded-xl shadow-sm overflow-hidden text-left">
    <div className="px-5 py-4 border-b border-[#E7E4E3] flex items-center justify-between gap-3">
      <h3 className="text-sm font-semibold text-[#0E121B]">{title}</h3>
      {!loading && (
        <span className="text-xs text-gray-500">
          {rows.length} {rows.length === 1 ? "record" : "records"}
        </span>
      )}
    </div>

    {loading ? (
      <div className="px-5 py-8 text-center text-sm text-gray-400">Loading…</div>
    ) : rows.length === 0 ? (
      <div className="px-5 py-8 text-center text-sm text-gray-500">{emptyText}</div>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-[#E7E4E3] text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <th className="px-5 py-2.5 text-left whitespace-nowrap">Date</th>
              <th className="px-5 py-2.5 text-left">Category</th>
              <th className="px-5 py-2.5 text-left">Notes</th>
              <th className="px-5 py-2.5 text-right whitespace-nowrap">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r._id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{formatDate(r.date)}</td>
                <td className="px-5 py-3 text-[#0E121B] font-medium">{r.category || "—"}</td>
                <td className="px-5 py-3 text-gray-600 max-w-[280px] truncate" title={r.notes || ""}>
                  {r.notes || "—"}
                </td>
                <td className="px-5 py-3 text-right font-medium text-[#0E121B] whitespace-nowrap">
                  {money(r.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

export default function DealFinanceTab({ dealId }) {
  const [expenses, setExpenses] = useState([]);
  const [income, setIncome] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dealId) return;
    let cancelled = false;
    setLoading(true);
    const fetchKind = (kind) =>
      API.get("/expenses", { params: { kind, dealId, limit: 200 } })
        .then((res) => res.data?.documents || [])
        .catch(() => []);
    Promise.all([fetchKind("expense"), fetchKind("income")]).then(([exp, inc]) => {
      if (cancelled) return;
      setExpenses(exp);
      setIncome(inc);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [dealId]);

  return (
    <div className="space-y-4">
      <RecordsCard
        title="Associated Expenses"
        emptyText="No expenses are associated with this deal."
        rows={expenses}
        loading={loading}
      />
      <RecordsCard
        title="Associated Income"
        emptyText="No income is associated with this deal."
        rows={income}
        loading={loading}
      />
    </div>
  );
}
