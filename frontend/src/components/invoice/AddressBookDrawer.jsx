import DeleteIcon from "../common/DeleteIcon";
import PlusIcon from "../common/PlusIcon";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";
import API from "../../services/api";
import EditIcon from "../common/EditIcon";
import { AddressFieldsGroup, emptyAddress } from "./formPrimitives";

/*
 * Right-hand drawer for saved addresses — same idea as NotesTermsDrawer, but
 * for the Billing/Shipping address fields. An organization keeps several
 * (branch offices, common customer addresses) and drops one into whichever
 * field group is currently open instead of retyping it every time. Applying
 * copies the fields, so editing a saved address later never rewrites a
 * document already issued.
 */

const Badge = ({ tone = "gray", children }) => {
  const tones = {
    blue: "bg-[#E3F1FF] text-[#0085FF]",
    green: "bg-green-100 text-green-700",
    gray: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${tones[tone]}`}>
      {children}
    </span>
  );
};

const summarize = (a) =>
  [a.addressLine1, a.addressLine2, [a.city, a.state].filter(Boolean).join(", "), a.pincode, a.country]
    .filter(Boolean)
    .join(", ");

const AddressBookDrawer = ({
  isOpen,
  onClose,
  // Prefills "Create New" with whatever is currently typed in the field
  // group that opened this drawer, so saving a just-typed address takes one
  // click instead of retyping it.
  currentAddress = null,
  onApply,
}) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addresses, setAddresses] = useState([]);
  // null = list view; otherwise the record being edited ({} for a new one).
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setEditing(null);
  }, [isOpen]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await API.get("/saved-addresses");
      setAddresses(res.data?.addresses || []);
    } catch (err) {
      toast.error(err.response?.data?.error || "Couldn't load saved addresses");
      setAddresses([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (editing) setEditing(null);
      else onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose, editing]);

  const handleSave = async () => {
    if (!editing.addressLine1?.trim()) return toast.error("Address line 1 can't be empty.");
    setSaving(true);
    try {
      const payload = {
        title: editing.title || "",
        addressLine1: editing.addressLine1 || "",
        addressLine2: editing.addressLine2 || "",
        pincode: editing.pincode || "",
        city: editing.city || "",
        state: editing.state || "",
        country: editing.country || "",
        isDefault: !!editing.isDefault,
        isActive: editing.isActive !== false,
      };
      if (editing._id) {
        await API.patch(`/saved-addresses/${editing._id}`, payload);
      } else {
        await API.post("/saved-addresses", payload);
      }
      toast.success("Address saved");
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (a) => {
    try {
      await API.delete(`/saved-addresses/${a._id}`);
      toast.success("Address deleted");
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to delete");
    }
  };

  const handleMakeDefault = async (a) => {
    try {
      await API.patch(`/saved-addresses/${a._id}`, { isDefault: true });
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to set default");
    }
  };

  const handleApply = (a) => {
    onApply?.({
      addressLine1: a.addressLine1 || "",
      addressLine2: a.addressLine2 || "",
      pincode: a.pincode || "",
      city: a.city || "",
      state: a.state || "",
      country: a.country || "",
    });
    toast.success("Address applied");
    onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100004]">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <aside
        role="dialog"
        aria-label="Saved addresses"
        className="fixed dc-panel-card dc-panel-w bg-white shadow-2xl flex flex-col overflow-hidden animate-slideInRight"
      >
        <header className="flex-shrink-0 flex items-center justify-between gap-3 px-5 h-14 border-b border-[#E1E4EA]">
          <span
            style={{ fontFamily: "Inter", fontWeight: 600, fontSize: "14px", letterSpacing: "-0.04em", color: "#44444A" }}
          >
            Saved Addresses
          </span>
          {!editing && (
            <button
              type="button"
              onClick={() =>
                setEditing({ title: "", ...emptyAddress(), ...(currentAddress || {}), isDefault: false, isActive: true })
              }
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-[#0085FF] hover:bg-blue-600 text-white text-[13px] font-medium transition-colors flex-shrink-0"
            >
              <PlusIcon className="w-4 h-4" />
              Save New Address
            </button>
          )}
        </header>

        {editing ? (
          /* ---------------------------------------------------- edit view */
          <>
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#525866] hover:text-[#1F2937] self-start"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to list
              </button>

              <input
                value={editing.title || ""}
                onChange={(e) => setEditing((p) => ({ ...p, title: e.target.value }))}
                placeholder={`Address name (optional), e.g. "Head Office"`}
                className="w-full h-10 px-3 rounded-lg border border-[#E1E4EA] text-[13px] placeholder:text-[#99A0AE] focus:outline-none focus:border-[#0085FF] flex-shrink-0"
              />

              <AddressFieldsGroup
                label="Address"
                value={editing}
                onChange={(next) => setEditing((p) => ({ ...p, ...next }))}
              />

              <div className="flex flex-col gap-2 flex-shrink-0">
                <label className="flex items-center gap-2 text-[13px] text-[#1F2937] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!editing.isDefault}
                    onChange={(e) => setEditing((p) => ({ ...p, isDefault: e.target.checked }))}
                  />
                  Use as the default address
                </label>
                <label className="flex items-center gap-2 text-[13px] text-[#1F2937] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editing.isActive !== false}
                    onChange={(e) => setEditing((p) => ({ ...p, isActive: e.target.checked }))}
                  />
                  Active
                </label>
              </div>
            </div>

            <footer className="flex-shrink-0 px-5 py-3 border-t border-[#E1E4EA] bg-[#FAFBFC] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="h-9 px-4 rounded-full border border-[#E1E4EA] text-[13px] font-medium text-[#1F2937] hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="h-9 px-5 rounded-lg bg-[#0085FF] hover:bg-blue-600 text-white text-[13px] font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </footer>
          </>
        ) : (
          /* ---------------------------------------------------- list view */
          <>
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-2">
              {loading ? (
                [0, 1, 2].map((i) => (
                  <div key={i} className="h-20 rounded-xl bg-gray-100 animate-pulse" />
                ))
              ) : addresses.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-sm font-medium text-[#1F2937]">No addresses saved yet</p>
                  <p className="text-xs text-[#99A0AE] mt-1">
                    Save one to reuse it on every invoice, quotation, or other document.
                  </p>
                </div>
              ) : (
                addresses.map((a) => (
                  <div
                    key={a._id}
                    className={`rounded-xl border p-3 transition-colors ${a.isDefault ? "border-[#0085FF] bg-[#F5FAFF]" : "border-[#E1E4EA] bg-white"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-semibold text-[#1F2937] truncate">
                            {a.title || "Untitled address"}
                          </span>
                          {a.isDefault && <Badge tone="blue">Default</Badge>}
                          <Badge tone={a.isActive ? "green" : "gray"}>
                            {a.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <p className="text-[12px] text-[#525866] mt-1 line-clamp-2">
                          {summarize(a) || "No address details"}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => setEditing(a)}
                          title="Edit"
                          className="p-1.5 rounded-lg text-[#525866] hover:bg-gray-100 transition-colors"
                        >
                          <EditIcon className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(a)}
                          title="Delete"
                          className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <DeleteIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-2 pt-2 border-t border-[#E1E4EA]/70">
                      <button
                        type="button"
                        onClick={() => handleApply(a)}
                        className="text-[12px] font-medium text-[#0085FF] hover:underline"
                      >
                        Use this address
                      </button>
                      {!a.isDefault && (
                        <button
                          type="button"
                          onClick={() => handleMakeDefault(a)}
                          className="text-[12px] font-medium text-[#525866] hover:underline"
                        >
                          Make default
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <footer className="flex-shrink-0 px-5 py-3 border-t border-[#E1E4EA] bg-[#FAFBFC] flex items-center justify-between gap-3">
              <p className="text-[11px] text-[#99A0AE] min-w-0 truncate">
                Using an address copies its fields onto this document.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-5 rounded-full border border-[#E1E4EA] text-[13px] font-medium text-[#1F2937] hover:bg-gray-50 transition-colors flex-shrink-0"
              >
                Close
              </button>
            </footer>
          </>
        )}
      </aside>
    </div>,
    document.body
  );
};

export default AddressBookDrawer;
