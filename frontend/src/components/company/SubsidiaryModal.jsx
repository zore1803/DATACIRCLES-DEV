import DeleteIcon from "../common/DeleteIcon";
// src/components/company/SubsidiaryModal.jsx
import React, { useEffect, useState, useRef } from "react";
import API from "../../services/api";
import toast from "react-hot-toast";
import { X, ChevronDown, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import ConfirmDialog from "../common/ConfirmDialog";
import Skeleton from "../common/Skeleton";

import SearchIcon from "../common/SearchIcon";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

// Same right-slide-in panel chrome as QuickCompanyForm/QuickVendorForm/etc.
// (dc-panel-card + dc-panel-w, translate-x transition, the uppercase grey
// header, pill inputs, "25px" pill footer buttons) — this used to be a
// centered black-overlay dialog with its own one-off styling, which read as
// a different, unfinished product next to every other panel in the app.
const SubsidiaryModal = ({ companyId, isOpen, onClose, onSuccess }) => {
  const [subsidiaries, setSubsidiaries] = useState([]);
  const [availableCompanies, setAvailableCompanies] = useState([]);
  const [selectedSubsidiaryId, setSelectedSubsidiaryId] = useState("");
  const [query, setQuery] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const searchRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState(null); // { id, name } | null

  const [shouldRender, setShouldRender] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  const dropdownRef = useRef(null);

  useBodyScrollLock(isOpen);

  // Mount immediately but animate the slide-in on the next tick, same
  // pattern every other panel in this app uses (see QuickCompanyForm).
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      const id = setTimeout(() => setPanelOpen(true), 10);
      return () => clearTimeout(id);
    }
    setPanelOpen(false);
    const id = setTimeout(() => setShouldRender(false), 300); // matches the 300ms transition below
    return () => clearTimeout(id);
  }, [isOpen]);

  // Fetch data when opened
  useEffect(() => {
    if (!isOpen || !companyId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const [subRes, compRes] = await Promise.all([
          API.get(`/companies/${companyId}/subsidiaries`),
          API.get("/companies"),
        ]);

        setSubsidiaries(subRes.data || []);

        const filtered = compRes.data.filter(
          (c) =>
            c._id !== companyId && !subRes.data.some((s) => s._id === c._id),
        );

        setAvailableCompanies(filtered);
      } catch (err) {
        toast.error("Failed to load data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isOpen, companyId]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Same behaviour as CustomDropdown's own searchable menu: reset the query
  // on close, focus the search box on open.
  useEffect(() => {
    if (!isDropdownOpen) {
      setQuery("");
    } else {
      const id = setTimeout(() => searchRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
  }, [isDropdownOpen]);

  const filteredCompanies = availableCompanies.filter(
    (c) =>
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      (c.industry && c.industry.toLowerCase().includes(query.toLowerCase())),
  );

  const selectedCompany = availableCompanies.find(
    (c) => c._id === selectedSubsidiaryId,
  );

  const handleSelectCompany = (compId) => {
    setSelectedSubsidiaryId(compId);
    setIsDropdownOpen(false);
  };

  const handleAddSubsidiary = async () => {
    if (!selectedSubsidiaryId) return toast.error("Please select a company");

    setActionLoading(true);
    try {
      await API.post(`/companies/${companyId}/add-subsidiary`, {
        subsidiaryId: selectedSubsidiaryId,
      });

      const newSub = availableCompanies.find(
        (c) => c._id === selectedSubsidiaryId,
      );
      if (newSub) setSubsidiaries((prev) => [...prev, newSub]);

      setAvailableCompanies((prev) =>
        prev.filter((c) => c._id !== selectedSubsidiaryId),
      );

      setSelectedSubsidiaryId("");
      setQuery("");
      toast.success("Subsidiary added successfully");

      if (onSuccess) onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to add subsidiary");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveSubsidiary = async () => {
    if (!pendingRemoval) return;
    const { id: subId } = pendingRemoval;
    setPendingRemoval(null);

    setActionLoading(true);
    try {
      await API.delete(`/companies/${companyId}/remove-subsidiary/${subId}`);
      setSubsidiaries((prev) => prev.filter((s) => s._id !== subId));
      toast.success("Subsidiary removed");
      if (onSuccess) onSuccess();
    } catch (err) {
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || "Failed to remove subsidiary");
      }
    } finally {
      setActionLoading(false);
    }
  };

  if (!shouldRender) return null;

  const inputCls =
    "w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50";

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[10000] transition-opacity duration-300 ease-in-out"
        style={{ opacity: panelOpen ? 1 : 0 }}
        onClick={onClose}
      />

      <div
        className={`
          fixed dc-panel-card dc-panel-w z-[10003]
          bg-white shadow-2xl flex flex-col overflow-hidden
          transform transition-transform duration-300 ease-in-out font-inter
          ${panelOpen ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"}
        `}
      >
        {/* Sticky header — matches every other panel's header spec */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#D9D9D9] flex-shrink-0 bg-white gap-1">
          <h2 className="text-[15px] font-normal leading-6 text-[#78788D] uppercase tracking-wide">
            Manage Subsidiaries
          </h2>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="w-5 h-5 flex items-center justify-center text-[#1C1B1F] hover:opacity-70 transition-opacity"
            aria-label="Close"
          >
            <X className="w-[18px] h-[18px]" strokeWidth={2} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6 space-y-6">
          <div>
            <label className="block text-[13px] font-medium text-[#161618] mb-2 tracking-[-0.05em]">
              Link Existing Company as Subsidiary
            </label>

            {/* Trigger + dropdown mirror CustomDropdown.jsx's own searchable
                menu exactly — a plain trigger button, and the search input
                lives INSIDE the opened panel, not doubling as the trigger
                itself. Kept as a local copy rather than importing
                CustomDropdown here since that component only renders plain
                string options, not the avatar+industry row this needs. */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className={`${inputCls} flex items-center gap-2.5 text-left ${isDropdownOpen ? "ring-1 ring-blue-500 border-blue-500" : ""}`}
              >
                <SearchIcon className="w-4 h-4 text-[#1F2937] opacity-50 flex-shrink-0" />
                <span className={`flex-1 truncate ${selectedCompany ? "text-[#1F2937]" : "text-[#1F2937] opacity-50"}`}>
                  {selectedCompany ? selectedCompany.name : "Search company name or industry..."}
                </span>
                <ChevronDown className={`w-4 h-4 text-[#1F2937] opacity-50 flex-shrink-0 transition-transform ${isDropdownOpen ? "rotate-180" : ""}`} />
              </button>

              {isDropdownOpen && (
                <div className="absolute mt-2 w-full bg-white border border-[#E0E0E1] rounded-xl shadow-lg z-50 flex flex-col overflow-hidden">
                  <div className="p-2 border-b border-[#F0F0F0] flex-shrink-0">
                    <input
                      ref={searchRef}
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search..."
                      className="w-full border border-[#E0E0E1] rounded-lg px-3 h-8 text-[13px] text-[#161618] focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-[#A0A0A0]"
                    />
                  </div>
                  <div className="max-h-60 overflow-y-auto py-1">
                    {filteredCompanies.length === 0 ? (
                      <div className="px-4 py-6 text-center text-[13px] text-[#A0A0A0]">
                        No company found
                      </div>
                    ) : (
                      filteredCompanies.map((comp) => (
                        <div
                          key={comp._id}
                          onClick={() => handleSelectCompany(comp._id)}
                          className="px-3 py-2 mx-1 rounded-lg hover:bg-[#F2F2F7] cursor-pointer flex items-center gap-3"
                        >
                          <div className="w-7 h-7 bg-[#158FFF]/10 text-[#158FFF] rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0">
                            {comp.name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium text-[#161618] truncate">{comp.name}</p>
                            {comp.industry && (
                              <p className="text-xs text-[#A0A0A0] truncate">{comp.industry}</p>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>


            <button
              type="button"
              onClick={handleAddSubsidiary}
              disabled={actionLoading || !selectedSubsidiaryId}
              className="mt-4 w-full px-6 py-2 bg-[#158FFF] text-white rounded-[25px] text-sm font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {actionLoading ? "Adding..." : "Add Subsidiary"}
            </button>
          </div>

          <div>
            <label className="block text-[13px] font-medium text-[#161618] mb-2 tracking-[-0.05em]">
              Current Subsidiaries ({subsidiaries.length})
            </label>

            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 border border-[#1F2937]/10 rounded-xl">
                    <Skeleton shape="circle" width={32} height={32} className="flex-shrink-0" />
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <Skeleton width="50%" height={12} />
                      <Skeleton width="30%" height={10} />
                    </div>
                  </div>
                ))}
              </div>
            ) : subsidiaries.length === 0 ? (
              <div className="text-center py-8 bg-[#FAFAFA] rounded-xl border border-dashed border-[#E0E0E1]">
                <p className="text-[13px] text-[#A0A0A0]">No subsidiaries linked yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {subsidiaries.map((sub) => (
                  <Link
                    key={sub._id}
                    to={`/companies/${sub._id}`}
                    className="group flex items-center justify-between p-3 border border-[#1F2937]/10 rounded-xl hover:border-[#158FFF]/30 hover:bg-[#158FFF]/[0.03] transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 bg-[#158FFF]/10 text-[#158FFF] rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0">
                        {sub.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-[#161618] truncate">{sub.name}</p>
                        <p className="text-xs text-[#A0A0A0] truncate">{sub.industry || "—"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <ChevronRight className="w-4 h-4 text-[#A0A0A0] opacity-0 group-hover:opacity-100 transition-opacity" />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setPendingRemoval({ id: sub._id, name: sub.name });
                        }}
                        title="Remove subsidiary"
                        className="w-8 h-8 flex items-center justify-center rounded-full text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <DeleteIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sticky footer — matches every other panel's footer spec */}
        <div className="flex-shrink-0 py-2.5 px-4 border-t border-gray-100 bg-white flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 border border-gray-200 text-gray-700 rounded-[25px] text-sm font-bold hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!pendingRemoval}
        title="Remove subsidiary?"
        message={pendingRemoval ? `Remove "${pendingRemoval.name}" as a subsidiary of this company?` : ""}
        confirmLabel="Remove"
        onConfirm={handleRemoveSubsidiary}
        onCancel={() => setPendingRemoval(null)}
      />
    </>
  );
};

export default SubsidiaryModal;
