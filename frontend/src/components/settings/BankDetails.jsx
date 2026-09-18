import DeleteIcon from "../common/DeleteIcon";
import PlusIcon from "../common/PlusIcon";
import StarIcon from "../common/StarIcon";
import BankLogo from '../BankLogo';

import { useCallback, useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";

// Inside component render
// Replace the existing flex block for bank icon and name
// Updated block starts at line 210
// We'll modify lines 210-216 accordingly

import toast from "react-hot-toast";
import API from "../../services/api";
import {
  CheckCircle,
  ArrowRight,
  Landmark,
  Info,
  AlertTriangle,
} from "lucide-react";
import { MdAccountBalance } from "react-icons/md";
import React from "react";

// Load all bank icons from the banks-in-india package using Vite's glob import.
// Icon loading disabled for now to avoid build errors.
// const bankIcons = import.meta.globEager("/node_modules/banks-in-india/icons/**/bi_*.png", { as: "url" });
// const getBankIcon = (bankName) => null; // placeholder

// No custom logo helper; using generic icon from react-icons
import BankModal from "./BankModal";
import EditIcon from "../common/EditIcon";

const maskAccountNumber = (num = "") => {
  const value = String(num);
  if (value.length <= 4) return value;
  return `${"X".repeat(Math.max(value.length - 4, 0))}${value.slice(-4)}`;
};

const BankDetails = () => {

  const [banks, setBanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBank, setEditingBank] = useState(null);
  const [deleteBankId, setDeleteBankId] = useState(null);
  const orderRef = useRef([]); // holds order of bank IDs

  const fetchBanks = useCallback(async () => {
    try {
      setLoading(true);
      const res = await API.get("/bank-details/all");
      const incoming = Array.isArray(res.data) ? res.data : [];
      // Preserve previous order to avoid moving default to top
      setBanks((prev) => {
        if (prev.length === 0) {
          // First load, store order
          orderRef.current = incoming.map((b) => b._id);
          return incoming;
        }
        // Create a map of previous order
        const prevOrder = orderRef.current;
        const sorted = incoming.slice().sort((a, b) => {
          const ia = prevOrder.indexOf(a._id);
          const ib = prevOrder.indexOf(b._id);
          // If both exist in previous order, keep that order
          if (ia !== -1 && ib !== -1) return ia - ib;
          // New items go to the end
          if (ia === -1 && ib === -1) return 0;
          return ia === -1 ? 1 : -1;
        });
        // Update the stored order for next fetch
        orderRef.current = sorted.map((b) => b._id);
        return sorted;
      });
    } catch (error) {
      console.error("Failed to load banks:", error);
      toast.error("Failed to load bank accounts");
      setBanks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBanks();
  }, [fetchBanks]);

  const hasExistingDefault = banks.some((b) => b.isDefault);

  const handleOpenAdd = () => {
    setEditingBank(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (bank) => {
    setEditingBank(bank);
    setIsModalOpen(true);
  };

  const handleSaveBank = async (payload) => {
    try {
      if (editingBank?._id) {
        await API.put(`/bank-details/${editingBank._id}`, payload);
        toast.success("Bank account updated successfully");
      } else {
        await API.post("/bank-details", payload);
        toast.success("Bank account added successfully");
      }
      setIsModalOpen(false);
      setEditingBank(null);
      await fetchBanks();
    } catch (err) {
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      }
      throw err;
    }
  };

  const handleSetDefault = async (id) => {
    try {
      await API.patch(`/bank-details/${id}/default`);
      toast.success("Default bank updated");
      await fetchBanks();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || "Failed to set default bank");
    }
  };

  const handleDelete = (id) => {
    // Open confirmation modal
    setDeleteBankId(id);
  };

  const confirmDelete = async () => {
    if (!deleteBankId) return;
    try {
      await API.delete(`/bank-details/${deleteBankId}`);
      toast.success("Bank account deleted");
      await fetchBanks();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || "Failed to delete bank account");
    } finally {
      setDeleteBankId(null);
    }
  };

  const cancelDelete = () => {
    setDeleteBankId(null);
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-gray-200" />
          <div className="h-4 w-72 rounded bg-gray-100" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
            <div className="h-40 rounded-xl bg-gray-100" />
            <div className="h-40 rounded-xl bg-gray-100" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Lives in the shared Settings header strip (see Settings.jsx's
          #settings-header-actions target) instead of a duplicate title card
          here — the strip already shows "Banks" and its description. */}
      {document.getElementById('settings-header-actions') &&
        createPortal(
          <>
            <button
              type="button"
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-2 h-[38px] rounded-full bg-[#0085FF] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-600 whitespace-nowrap"
            >
              <PlusIcon className="w-4 h-4" />
              Add Bank Details
            </button>
          </>,
          document.getElementById('settings-header-actions')
        )}

      {banks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white py-14 text-center shadow-sm">
          <div className="mb-3 rounded-full bg-purple-50 p-4 text-purple-600">
            <Landmark className="h-8 w-8" />
          </div>
          <p className="text-sm font-semibold text-gray-800">No bank accounts added yet</p>
          <p className="mt-1 max-w-md text-xs text-gray-500">
            Add your first bank account to display payment details on invoices and generate UPI QR codes.
          </p>
          <button
            type="button"
            onClick={handleOpenAdd}
            className="mt-4 text-xs font-bold text-purple-600 hover:text-purple-700 hover:underline"
          >
            + Add First Bank Account
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {banks.map((bank) => (
            <div
              key={bank._id}
              className={`relative flex flex-col justify-between rounded-2xl border-2 p-5 transition-all ${
                bank.isDefault
                  ? "border-[#0085FF] bg-blue-50/20 shadow-md"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              {bank.isDefault && (
                <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-[#0085FF] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
                  <CheckCircle className="h-3 w-3" />
                  Default
                </span>
              )}

              <div>
                <div className="flex items-start gap-3">
                  <BankLogo bankName={bank.bank} size={40} />
                  <div className="min-w-0 flex-1 pr-16">
                    <h4 className="truncate font-bold text-gray-900">{bank.bank}</h4>
                    <p className="mt-0.5 text-sm text-gray-600">{bank.accountHolder}</p>
                    <p className="mt-1 text-xs text-gray-400">{bank.branch}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-xs">
                  <div>
                    <span className="font-semibold text-gray-500">Account No</span>
                    <p className="mt-0.5 font-mono font-medium text-gray-800 flex items-center">
                      {maskAccountNumber(bank.accountNumber)}
                    </p>
                  </div>
                  <div>
                    <span className="font-semibold text-gray-500">IFSC</span>
                    <p className="mt-0.5 font-mono font-medium text-gray-800">{bank.ifscCode || "—"}</p>
                  </div>
                  {bank.upi && (
                    <div>
                      <span className="font-semibold text-gray-500">UPI ID</span>
                      <p className="mt-0.5 font-medium text-gray-800">{bank.upi}</p>
                    </div>
                  )}
                  {bank.upiNumber && (
                    <div>
                      <span className="font-semibold text-gray-500">UPI NUMBER</span>
                      <p className={`mt-0.5 font-medium ${/^\d{10,12}$/.test(bank.upiNumber) ? 'text-green-600' : 'text-rose-600'}`}>{bank.upiNumber}</p>
                    </div>
                  )}
                  {bank.openingBalance !== null && bank.openingBalance !== undefined && (
                    <div>
                      <span className="font-semibold text-gray-500">Opening Balance</span>
                      <p className="mt-0.5 font-medium text-gray-800">
                        ₹{Number(bank.openingBalance).toLocaleString("en-IN")}
                      </p>
                    </div>
                  )}
                  {bank.currentBalance !== undefined && (
                    <div>
                      <span className="font-semibold text-gray-500">Current Balance</span>
                      <p className={`mt-0.5 font-bold ${Number(bank.currentBalance) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        ₹{Number(bank.currentBalance).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  )}
                </div>

                {bank.notes && (
                  <p className="mt-3 line-clamp-2 text-xs text-gray-500">
                    <span className="font-semibold">Notes:</span> {bank.notes}
                  </p>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
                {!bank.isDefault ? (
                  <button
                    type="button"
                    onClick={() => handleSetDefault(bank._id)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#0085FF] hover:underline"
                  >
                    <StarIcon className="h-3.5 w-3.5 align-middle" />
                    Make Default
                  </button>
                ) : (
                  <span className="text-xs text-gray-400">Current default payment account</span>
                )}

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(bank)}
                    className="rounded-lg p-1.5 text-[#0085FF] transition hover:bg-blue-50 hover:opacity-90"
                    title="Edit bank"
                  >
                    <EditIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(bank._id)}
                    className="rounded-lg p-1.5 text-rose-600 transition hover:bg-rose-50 hover:text-rose-700"
                    title="Delete bank"
                  >
                    <DeleteIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
        <p className="text-sm font-bold text-gray-900">Please Note</p>
        <ul className="mt-3 space-y-2.5">
          <li className="flex items-start gap-2 text-xs font-semibold text-rose-600">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-rose-500" />
            <span>
              <span className="font-semibold text-rose-600">Account No, IFSC and UPI ID are visible to customers</span>{" "}
              <span className="font-normal text-gray-600">
                on every invoice sent from the account marked Default — only add details you're okay sharing outside your organization.
              </span>
            </span>
          </li>
          <li className="flex items-start gap-2 text-xs font-semibold text-rose-600">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-rose-500" />
            <span>
              <span className="font-semibold text-rose-600">Deleting a bank account from here</span>{" "}
              <span className="font-normal text-gray-600">
                will remove its details from all existing invoices, and it cannot be undone.
              </span>
            </span>
          </li>
          <li className="flex items-start gap-2 text-xs text-gray-600">
            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
            <span>
              Marking an account <span className="font-semibold text-gray-800">Default</span>{" "}
              immediately replaces the previous default — new invoices and payments will start
              using this account right away.
            </span>
          </li>
          <li className="flex items-start gap-2 text-xs text-gray-600">
            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
            <span>
              The account number here is only masked on screen for display — it is still sent to
              customers in full on invoices, so treat it like any other confidential detail.
            </span>
          </li>
        </ul>
      </div>

      {deleteBankId && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Confirm Deletion</h3>
            <p className="mb-4 text-sm text-gray-700">
              Deleting the bank account from here will remove the bank details from all existing invoices and it is irreversible.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={cancelDelete}
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <BankModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingBank(null);
        }}
        onSave={handleSaveBank}
        initialData={editingBank}
        hasExistingDefault={hasExistingDefault && !editingBank?.isDefault}
      />
    </div>
  );
};

export default BankDetails;
