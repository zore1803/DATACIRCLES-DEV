import DeleteIcon from "../common/DeleteIcon";
import PlusIcon from "../common/PlusIcon";
import { useEffect, useState } from "react";
import API from "../../services/api";
import { X, Check, Lock, Tag, Info } from "lucide-react";
import toast from "react-hot-toast";
import AppToaster from "../AppToaster";
import EditIcon from "../common/EditIcon";

// The industries every company form ships with. Mirrors the list CompanyFieldSettings renders as
// "Default System Industries" - these come from the backend seed, not from /company-industries
// (which only ever returns an org's own additions).
const DEFAULT_INDUSTRIES = [
  "Information Technology & Services",
  "Finance & Banking",
  "Healthcare & Pharmaceuticals",
  "Education & EdTech",
  "Retail & E-Commerce",
  "Manufacturing",
  "Real Estate",
  "Marketing & Advertising",
  "Travel & Hospitality",
  "Nonprofit / Government / Public Sector",
];

const CompanyIndustrySettings = () => {
  const [industries, setIndustries] = useState([]);
  const [newIndustryName, setNewIndustryName] = useState("");
  const [editIndex, setEditIndex] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [loading, setLoading] = useState(true);
  // Which list the new card shows - same pill switcher as SystemDefaultsSettings.
  const [activeTab, setActiveTab] = useState("custom");

  useEffect(() => {
    fetchIndustries();
  }, []);

  const fetchIndustries = async () => {
    try {
      setLoading(true);
      const res = await API.get("/company-industries");
      if (res.data) {
        // Filter out default industries
        setIndustries(res.data.filter(ind => !ind.isDefault) || []);
      }
    } catch (err) {
      console.error("Failed to fetch industries", err);
      toast.error("Failed to load industries");
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newIndustryName.trim()) {
      toast.error("Industry name is required");
      return;
    }

    if (industries.some(ind => ind.name.toLowerCase() === newIndustryName.trim().toLowerCase())) {
      toast.error("Industry already exists");
      return;
    }

    try {
      await API.post("/company-industries", { name: newIndustryName.trim() });
      toast.success("Industry added successfully!");
      setNewIndustryName("");
      fetchIndustries(); // Refresh list
    } catch (err) {
      console.error("Failed to add industry", err);
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || "Failed to add industry");
      }
    }
  };

  const handleEdit = (index) => {
    const industry = industries[index];
    // Safety check in case backend returns default industries
    if (industry.isDefault) {
      toast.error(`Cannot edit default industry "${industry.name}"`);
      return;
    }
    setEditIndex(index);
    setEditValue(industry.name);
  };

  const handleUpdate = async () => {
    if (!editValue.trim()) {
      toast.error("Industry name is required");
      return;
    }

    const industry = industries[editIndex];
    if (industries.some((ind, idx) => idx !== editIndex && ind.name.toLowerCase() === editValue.trim().toLowerCase())) {
      toast.error("Industry already exists");
      return;
    }

    try {
      await API.put(`/company-industries/${industry._id}`, { name: editValue.trim() });
      toast.success("Industry updated successfully!");
      setEditIndex(null);
      setEditValue("");
      fetchIndustries(); // Refresh list
    } catch (err) {
      console.error("Failed to update industry", err);
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || "Failed to update industry");
      }
    }
  };

  const handleDelete = async (index) => {
    const industry = industries[index];
    // Safety check in case backend returns default industries
    if (industry.isDefault) {
      toast.error(`Cannot delete default industry "${industry.name}"`);
      return;
    }

    if (!window.confirm(`Are you sure you want to delete "${industry.name}" industry?`)) {
      return;
    }

    try {
      await API.delete(`/company-industries/${industry._id}`);
      toast.success("Industry deleted successfully");
      fetchIndustries(); // Refresh list
    } catch (err) {
      console.error("Failed to delete industry", err);
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || "Failed to delete industry");
      }
    }
  };

  const handleCancel = () => {
    setEditIndex(null);
    setEditValue("");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading industries...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AppToaster />

      {/* ------------------------------------------------------------------ *
       * NEW UI (System Defaults style). Built above the existing sections so
       * they can be removed one at a time; shares the same state/handlers, so
       * both write through the same code paths.
       * ------------------------------------------------------------------ */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="relative inline-flex items-center bg-gray-100 rounded-full p-1 mb-5">
          <span
            className="absolute top-1 bottom-1 w-24 rounded-full bg-white shadow-sm transition-all duration-300 ease-out pointer-events-none"
            style={{ left: 4 + (activeTab === "custom" ? 0 : 96) }}
          />
          {[
            { id: "custom", label: "Custom" },
            { id: "system", label: "System" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`relative z-10 w-24 py-2 text-sm font-semibold rounded-full transition-colors ${
                activeTab === tab.id ? "text-[#0085FF]" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "custom" && (
          <>
            <form
              onSubmit={(e) => { e.preventDefault(); handleAdd(); }}
              className="flex gap-2 mb-5"
            >
              <input
                type="text"
                value={newIndustryName}
                onChange={(e) => setNewIndustryName(e.target.value)}
                placeholder="Add custom industry (e.g. Logistics)"
                className="flex-1 min-w-0 px-4 py-2 text-sm rounded-full border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#0085FF]/30 focus:border-[#0085FF]"
              />
              <button
                type="submit"
                disabled={!newIndustryName.trim()}
                className="flex-shrink-0 px-4 py-2 bg-[#0085FF] hover:bg-blue-600 text-white text-sm font-semibold rounded-full disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                <PlusIcon className="w-4 h-4" /> Add
              </button>
            </form>

            {industries.length === 0 ? (
              <div className="text-center py-12 rounded-xl border border-[#E1E4EA]">
                <Tag className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-600">No custom industries yet</p>
                <p className="text-xs text-gray-400 mt-0.5">Add your first industry to get started</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[#E1E4EA]">
                <table className="min-w-full border-collapse text-sm text-left">
                  <thead className="bg-[#F5F7FA] border-b border-[#E1E4EA]">
                    <tr>
                      <th className="px-4 py-3 text-sm font-bold text-[#525866]">Industry</th>
                      <th className="px-4 py-3 text-sm font-bold text-[#525866]">Type</th>
                      <th className="px-4 py-3 text-sm font-bold text-[#525866] text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {industries.map((industry, index) => {
                      const isEditing = editIndex === index;
                      return (
                        <tr key={industry._id || index} className="group hover:bg-[#F5F7FA] transition-colors border-b border-[#E1E4EA] last:border-b-0">
                          <td className="px-4 py-3">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyPress={(e) => e.key === "Enter" && handleUpdate()}
                                className="w-full max-w-xs px-3 py-1.5 text-sm rounded-full border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#0085FF]/30 focus:border-[#0085FF]"
                                autoFocus
                              />
                            ) : (
                              <div className="flex items-center gap-2.5">
                                <span className="w-2 h-2 rounded-full flex-shrink-0 bg-[#0085FF]" />
                                <span className="text-sm font-semibold text-gray-900">{industry.name}</span>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-[#0085FF]">Custom</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {isEditing ? (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={handleUpdate}
                                  className="flex items-center justify-center w-7 h-7 rounded-full bg-[#0085FF] hover:bg-blue-600 text-white transition-colors"
                                  title="Save"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={handleCancel}
                                  className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-600 transition-colors"
                                  title="Cancel"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleEdit(index)}
                                  className="flex items-center justify-center w-7 h-7 rounded-full text-blue-600 hover:bg-blue-50 transition-colors"
                                  title="Edit"
                                >
                                  <EditIcon className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(index)}
                                  className="flex items-center justify-center w-7 h-7 rounded-full text-red-600 hover:bg-red-50 transition-colors"
                                  title="Delete"
                                >
                                  <DeleteIcon className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {activeTab === "system" && (
          <>
            <div className="overflow-x-auto rounded-xl border border-[#E1E4EA]">
              <table className="min-w-full border-collapse text-sm text-left">
                <thead className="bg-[#F5F7FA] border-b border-[#E1E4EA]">
                  <tr>
                    <th className="px-4 py-3 text-sm font-bold text-[#525866]">Industry</th>
                    <th className="px-4 py-3 text-sm font-bold text-[#525866] text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {DEFAULT_INDUSTRIES.map((name) => (
                    <tr key={name} className="group hover:bg-[#F5F7FA] transition-colors border-b border-[#E1E4EA] last:border-b-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="w-2 h-2 rounded-full flex-shrink-0 bg-gray-300" />
                          <span className="text-sm font-semibold text-gray-900">{name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center gap-1 text-xs text-gray-900">
                          <Lock className="w-3 h-3" /> System default
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-3">
              These appear in every company form and cannot be edited or removed. Add your own
              under the Custom tab.
            </p>
          </>
        )}
      </div>

      {/* Info Card */}
      <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-blue-900 mb-1">Industry Management Guide</h3>
            <ul className="text-sm text-blue-700 space-y-1 leading-relaxed flex justify-between md:justify-start md:space-x-6 md:space-y-0">
              <div>
                <li>• Add custom industries for your organization's needs</li>
                <li>• Default industries are available but not shown here</li>
              </div>
              <div>
                <li>• Edit or delete custom industries as needed</li>
                <li>• Changes apply to company profiles' industry dropdown</li>
              </div>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompanyIndustrySettings;