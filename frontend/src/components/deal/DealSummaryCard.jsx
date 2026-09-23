import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import toast from "react-hot-toast";
import API from "../../services/api";
import EntitySummaryCard from "../common/EntitySummaryCard";

const formatDate = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
};

const formatDateTime = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

// Owner reassign dropdown, inline inside this summary card's "Owner" field —
// same control as Contact's OwnerPicker in ContactSummaryCard.jsx.
const OwnerPicker = ({ deal }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const ref = useRef(null);

  const currentUser = (() => {
    try {
      return JSON.parse(localStorage.getItem("user")) || null;
    } catch {
      return null;
    }
  })();

  const canEdit =
    currentUser?.role === "admin" ||
    currentUser?.permissions?.some(
      (p) => p.name?.toLowerCase() === "deals" && p.permission === "read-write"
    );

  useEffect(() => {
    if (!canEdit) return;
    API.get("/auth/all-user")
      .then((res) => setUsers(res.data.allUsers || []))
      .catch(() => {});
  }, [canEdit]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const reassign = async (newOwnerId) => {
    if (!canEdit || !newOwnerId) return;
    if (deal.user?._id === newOwnerId) {
      setOpen(false);
      return;
    }
    try {
      await API.put(`/deals/${deal._id}`, { user: newOwnerId });
      toast.success("Owner reassigned successfully.");
      setOpen(false);
      window.location.reload();
    } catch (err) {
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || "Failed to update owner.");
      }
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => canEdit && setOpen((v) => !v)}
        disabled={!canEdit}
        className={`flex items-center gap-1 text-[13px] sm:text-sm font-medium truncate max-w-full ${
          canEdit ? "text-gray-900 hover:text-[#0085FF] cursor-pointer" : "text-gray-900 cursor-default"
        }`}
      >
        <span className="truncate">{deal.user?.name || "Unassigned"}</span>
        {canEdit && <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
      </button>

      {open && canEdit && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-md shadow-xl z-50">
          <div className="p-3 border-b border-gray-100 flex justify-between items-center">
            <h4 className="text-xs font-semibold text-gray-700">Assign Owner</h4>
            <button
              onClick={() => setOpen(false)}
              className="text-xs text-gray-500 border border-gray-200 px-2 py-1 rounded hover:bg-gray-50"
            >
              Close
            </button>
          </div>
          <div className="p-2">
            <input
              type="text"
              placeholder="Search..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 mb-2 focus:outline-none focus:border-blue-500"
            />
            <div className="max-h-48 overflow-y-auto">
              {users
                .filter((u) => u.name?.toLowerCase().includes(query.toLowerCase()))
                .map((u) => {
                  const isCurrent = deal.user?._id === u._id;
                  const initials = u.name
                    ? u.name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase()
                    : "U";
                  return (
                    <button
                      key={u._id}
                      onClick={() => reassign(u._id)}
                      className="w-full text-left flex items-center gap-3 p-2 hover:bg-gray-50 rounded text-sm"
                    >
                      <div className="w-7 h-7 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-medium text-xs">
                        {initials}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-gray-900 font-medium truncate">{u.name}</span>
                        <span className="text-gray-500 text-xs truncate">{u.email}</span>
                      </div>
                      {isCurrent && <Check className="w-4 h-4 text-green-600 ml-auto flex-shrink-0" />}
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default function DealSummaryCard({ deal }) {
  if (!deal) return null;

  const customFields = (deal.additionalFields || []).filter((f) => f.key);

  return (
    <EntitySummaryCard
      collapsedFields={[
        { label: "Company", value: deal.company?.name },
        { label: "Contact", value: deal.contact?.name },
        { label: "Owner", render: <OwnerPicker deal={deal} /> },
        { label: "Stage", value: deal.status || "Open" },
        { label: "Created Date", value: formatDate(deal.createdAt) },
      ]}
      expandedFields={[
        {
          label: "Last Updated",
          render: (
            <div className="text-[13px] sm:text-sm font-medium text-gray-900 min-w-0">
              <span className="truncate block">{formatDateTime(deal.updatedAt) || "—"}</span>
              {deal.lastUpdatedBy?.name && (
                <span className="text-[11px] text-gray-400 truncate block">by {deal.lastUpdatedBy.name}</span>
              )}
            </div>
          ),
        },
        ...customFields.map((f) => ({ label: f.key, value: f.value != null ? String(f.value) : "" })),
      ]}
    />
  );
}
