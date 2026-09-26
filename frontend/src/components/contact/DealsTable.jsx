import PlusIcon from "../common/PlusIcon";
import MoreIcon from "../common/MoreIcon";
import EmptyState from "../common/EmptyState";
import { Handshake } from "lucide-react";
import EyeIcon from "../common/EyeIcon";
import EditIcon from "../common/EditIcon";
import DeleteIcon from "../common/DeleteIcon";
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import QuickDealForm from "../deal/QuickDealForm";
import ConfirmDialog from "../common/ConfirmDialog";
import API from "../../services/api";
import toast from "react-hot-toast";

// The app scales its desktop layout with a CSS `zoom` on <html>; portal menus
// paint in that zoomed space, so rect-derived positions are divided by the
// accumulated ancestor zoom to line up on screen (same approach as the main
// Deals table).
const getAncestorZoom = (el) => {
  let z = 1;
  let node = el;
  while (node && node.nodeType === 1) {
    const cz = parseFloat(getComputedStyle(node).zoom);
    if (cz && !Number.isNaN(cz)) z *= cz;
    node = node.parentElement;
  }
  return z || 1;
};

// Stage pill colors, matched to the main Deals table: Won green, Lost red,
// everything else (Open) blue.
const stagePillStyle = (status) =>
  status === "Won"
    ? { backgroundColor: "rgba(0, 201, 80, 0.1)", color: "#00A63E" }
    : status === "Lost"
      ? { backgroundColor: "rgba(232, 34, 34, 0.1)", color: "#E82222" }
      : { backgroundColor: "rgba(0, 133, 255, 0.1)", color: "#0085FF" };

const DealsTable = ({ deals = [], contact, company, allCompanies = [], onDealCreated, title = "Associated Deals" }) => {
  const navigate = useNavigate();
  const [showQuickDealForm, setShowQuickDealForm] = useState(false);
  const [editDeal, setEditDeal] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [menuId, setMenuId] = useState(null);
  const [menuPos, setMenuPos] = useState(null);

  const closeMenu = () => {
    setMenuId(null);
    setMenuPos(null);
  };

  const handleDealCreated = (newDeal) => {
    onDealCreated?.(newDeal);
    setShowQuickDealForm(false);
  };

  const openMenu = (e, id) => {
    e.stopPropagation();
    if (menuId === id) return closeMenu();
    const z = getAncestorZoom(document.body);
    const MENU_W = 150;
    const rect = e.currentTarget.getBoundingClientRect();
    const top = rect.bottom / z + 4;
    let left = rect.right / z - MENU_W;
    left = Math.max(8, left);
    setMenuPos({ top, left });
    setMenuId(id);
  };

  const confirmDelete = async () => {
    const id = deleteId;
    setDeleteId(null);
    try {
      await API.delete(`/deals/${id}`);
      toast.success("Deal deleted.");
      window.location.reload();
    } catch (err) {
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || "Failed to delete deal.");
      }
    }
  };

  return (
    <>
      <div>
        {/* Header — title + count on the left, Add Deal on the right, one line. */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-gray-900">{title}</h3>
            <span className="text-xs text-gray-400">
              {deals?.length || 0} deal{deals?.length !== 1 ? "s" : ""}
            </span>
          </div>
          <button
            onClick={() => setShowQuickDealForm(true)}
            className="inline-flex items-center gap-2 px-3 py-2 bg-[#0085FF] text-white text-sm font-medium rounded-full hover:bg-blue-600 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            Add Deal
          </button>
        </div>

        {/* Matches the main Deals table's visual language: #F5F7FA bold headers
            with a caret, and #E1E4EA vertical + horizontal gridlines on every
            cell (border-separate so the sticky header keeps its borders). Once
            there are ~4+ deals the body scrolls vertically while the header
            stays pinned, so the section never grows unbounded. */}
        <div className="border border-[#E1E4EA] rounded-lg overflow-hidden">
          <div className="overflow-x-auto overflow-y-auto max-h-[248px]">
            <table className="w-full min-w-full text-sm text-left border-separate border-spacing-0">
              <thead className="sticky top-0 z-20">
                <tr>
                  {["Deal Name", "Stage", "Amount", "Last Updated", "Company"].map((label, i, arr) => (
                    <th
                      key={label}
                      className={`px-4 py-3 text-sm font-bold text-[#525866] bg-[#F5F7FA] border-b border-[#E1E4EA] ${i < arr.length - 1 ? "border-r" : ""}`}
                    >
                      <span className="truncate">{label}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              {deals?.length > 0 ? (
                <tbody>
                  {deals.map((deal) => (
                    <tr key={deal._id} className="bg-white hover:bg-blue-50 transition-colors">
                      <td className="px-4 py-3 border-b border-r border-[#E1E4EA]">
                        <Link
                          to={`/deals/${deal._id}`}
                          className="text-blue-600 hover:underline font-medium"
                        >
                          {deal.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3 border-b border-r border-[#E1E4EA]">
                        <span
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                          style={stagePillStyle(deal.status)}
                        >
                          {deal.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-900 border-b border-r border-[#E1E4EA]">
                        <h6 className="font-semibold">₹{deal.amount?.toLocaleString("en-IN") || 0}</h6>
                      </td>
                      <td className="px-4 py-3 text-gray-600 border-b border-r border-[#E1E4EA]">
                        {new Date(deal.updatedAt).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-4 py-3 text-gray-700 border-b border-[#E1E4EA]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">{deal.company?.name || company?.name || "-"}</span>
                          <button
                            onClick={(e) => openMenu(e, deal._id)}
                            className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
                            title="More actions"
                          >
                            <MoreIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              ) : (
                <tbody>
                  <tr>
                    <td colSpan="5">
                      <EmptyState
                        icon={Handshake}
                        noun="Deal"
                        onCreate={() => setShowQuickDealForm(true)}
                        className="!py-8"
                      />
                    </td>
                  </tr>
                </tbody>
              )}
            </table>
          </div>
        </div>
      </div>

      {/* Row actions menu (portal so it never clips inside the table's overflow) */}
      {menuId && menuPos && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={closeMenu} />
          <div
            style={{ position: "fixed", top: menuPos.top, left: menuPos.left }}
            className="w-[150px] z-[9999] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5"
          >
            <button
              onClick={() => { closeMenu(); navigate(`/deals/${menuId}`); }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
            >
              <EyeIcon className="w-3.5 h-3.5 text-[#1C1B1F]" />
              View Deal
            </button>
            <button
              onClick={() => {
                const d = deals.find((x) => x._id === menuId);
                closeMenu();
                if (d) setEditDeal(d);
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
            >
              <EditIcon className="w-3.5 h-3.5 text-[#1C1B1F]" />
              Edit Deal
            </button>
            <div className="w-full border-t border-[#F1F1F5] my-0.5" />
            <button
              onClick={() => { const id = menuId; closeMenu(); setDeleteId(id); }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-red-600 hover:bg-red-50 whitespace-nowrap"
            >
              <DeleteIcon className="w-3.5 h-3.5" />
              Delete Deal
            </button>
          </div>
        </>,
        document.body,
      )}

      {/* Create Deal */}
      {showQuickDealForm && (
        <QuickDealForm
          companies={company ? [company] : (allCompanies.length > 0 ? allCompanies : [])}
          contacts={contact ? [contact] : []}
          initialCompanyId={company?._id}
          initialContactId={contact?._id}
          isContactLocked={!!contact}
          onDealCreated={handleDealCreated}
          onRequestClose={() => setShowQuickDealForm(false)}
        />
      )}

      {/* Edit Deal */}
      {editDeal && (
        <QuickDealForm
          companies={company ? [company] : (allCompanies.length > 0 ? allCompanies : [])}
          contacts={contact ? [contact] : []}
          editDeal={editDeal}
          isContactLocked={!!contact}
          onDealUpdated={() => { setEditDeal(null); window.location.reload(); }}
          onRequestClose={() => setEditDeal(null)}
        />
      )}

      <ConfirmDialog
        isOpen={!!deleteId}
        title="Delete deal"
        message="Are you sure you want to delete this deal? This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />
    </>
  );
};

export default DealsTable;
