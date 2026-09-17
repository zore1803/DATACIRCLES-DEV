import DeleteIcon from "../common/DeleteIcon";
import PlusIcon from "../common/PlusIcon";
import { useEffect, useState } from "react";
import API from "../../services/api";
import {
  Save,
  X,
  Database,
  AlertCircle,
  CheckCircle2,
  Tag,
  Info,
} from "lucide-react";
import toast from "react-hot-toast";
import AppToaster from "../AppToaster";
import ListIcon from "../common/ListIcon";
import EditIcon from "../common/EditIcon";

const CompanyIndustrySettings = () => {
  const [industries, setIndustries] = useState([]);
  const [newIndustryName, setNewIndustryName] = useState("");
  const [editIndex, setEditIndex] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [loading, setLoading] = useState(true);

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

      {/* Add New Industry */}
      <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-lg p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-green-100 p-2 rounded-lg">
            <PlusIcon className="w-4 h-4 text-green-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-900">Add New Industry</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Industry Name
            </label>
            <input
              type="text"
              placeholder="e.g., Technology, Healthcare, Finance"
              value={newIndustryName}
              onChange={(e) => setNewIndustryName(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleAdd()}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            />
          </div>

          <button
            onClick={handleAdd}
            style={{ backgroundColor: "#0085FF" }}
            className="flex items-center gap-2 hover:opacity-90 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg"
          >
            <PlusIcon className="w-4 h-4" />
            Add Industry
          </button>
        </div>
      </div>

      {/* Industries List */}
      <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-lg p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-blue-100 p-2 rounded-lg">
            <ListIcon className="w-5 h-5 text-blue-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-900">Custom Industries</h3>
        </div>

        {industries.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-xl">
            <Database className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500 font-medium mb-2">No custom industries configured yet</p>
            <p className="text-sm text-gray-400">
              Add your first custom industry using the form above
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {industries.map((industry, index) => (
              <div
                key={industry._id || index}
                className="border-2 border-gray-200 rounded-xl p-5 hover:border-gray-300 hover:shadow-md transition-all"
              >
                {editIndex === index ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Industry Name
                      </label>
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyPress={(e) => e.key === "Enter" && handleUpdate()}
                        className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        autoFocus
                      />
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={handleUpdate}
                        className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-xl font-semibold transition-colors"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Save Changes
                      </button>
                      <button
                        onClick={handleCancel}
                        className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-5 py-2.5 rounded-xl font-semibold transition-colors"
                      >
                        <X className="w-4 h-4" />
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="bg-blue-100 p-1.5 rounded-lg">
                          <Tag className="w-4 h-4 text-blue-600" />
                        </div>
                        <span className="font-bold text-gray-900">
                          {industry.name}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => handleEdit(index)}
                        className="flex items-center gap-1 px-3 py-1.5 text-blue-600 hover:bg-blue-50 rounded-lg font-semibold transition-colors text-sm border border-blue-200"
                      >
                        <EditIcon className="w-4 h-4" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(index)}
                        className="flex items-center gap-1 px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg font-semibold transition-colors text-sm border border-red-200"
                      >
                        <DeleteIcon className="w-4 h-4" />
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
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