
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import DealsTable from "./DealsTable";
import API from "../../services/api";
import toast from 'react-hot-toast';
import {
  X,
  ChevronDown,
  User,
  Building2,
  Mail,
  Phone,
  TrendingUp,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Target,
  Trophy,
  Check,
  Clock,
  FolderOpen,
  LayoutGrid,
  Info,
  EyeOff,
  Plus,
  Settings as SettingsIcon
} from "lucide-react";
import AppToaster from "../AppToaster";
import useContactLifecycleStore from "../../store/useContactLifecycleStore";
import EyeIcon from "../common/EyeIcon";
import EditIcon from "../common/EditIcon";
import ContactFieldDrawer from "./ContactFieldDrawer";
import ContactLifecycleDrawer from "./ContactLifecycleDrawer";

// Lifecycle Stage Modal Component  
const LifecycleStageModal = ({ isOpen, onClose, contact, onUpdate }) => {
  const [selectedStage, setSelectedStage] = useState(contact.lifecycleStage || "Lead");
  const [selectedStatus, setSelectedStatus] = useState(contact.stageStatus || "New");
  const [isUpdating, setIsUpdating] = useState(false);

  // Stages and statuses come from useContactLifecycleStore, which is backed
  // by the organization's ContactLifecycleSettings (Settings -> Contact
  // Lifecycle) — the single source of truth. This component used to hold its
  // own hardcoded copy, which is how the lifecycle ended up defined
  // separately in several places with some of them disagreeing.
  const lifecycleStageOptions = useContactLifecycleStore((s) => s.lifecycleStageOptions);
  const allLifecycleStages = useContactLifecycleStore((s) => s.allLifecycleStages);
  const defaultStatusForStage = useContactLifecycleStore((s) => s.defaultStatusForStage);
  const fetchStages = useContactLifecycleStore((s) => s.fetchStages);

  useEffect(() => {
    fetchStages();
  }, [fetchStages]);

  const handleStageChange = (newStage) => {
    setSelectedStage(newStage);
    setSelectedStatus(defaultStatusForStage(newStage));
  };

  const handleSave = async () => {
    try {
      setIsUpdating(true);
      await API.put(`/contacts/${contact._id}/lifecycle-stage`, {
        lifecycleStage: selectedStage,
        stageStatus: selectedStatus
      });

      if (onUpdate) {
        onUpdate({
          ...contact,
          lifecycleStage: selectedStage,
          stageStatus: selectedStatus
        });
      }

      toast.success("Lifecycle stage updated!");
      onClose();
    } catch (error) {
      console.error("Failed to update lifecycle stage:", error);
      if (error.response?.status === 402) {
        toast.error(error.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(error.response?.data?.error || "Failed to update lifecycle stage");
      }
    } finally {
      setIsUpdating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-[10000] p-4">
      <div className="bg-white rounded-lg shadow-xl p-5 w-full max-w-md border border-gray-200">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Update Lifecycle Stage</h3>
            <p className="text-xs text-gray-600 mt-1">Manage contact progression</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Lifecycle Stage
            </label>
            <select
              value={selectedStage}
              onChange={(e) => handleStageChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white transition-all focus:outline-none focus:border-gray-400"
              disabled={isUpdating}
            >
              {allLifecycleStages.map((stage) => (
                <option key={stage} value={stage}>{stage}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Status
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white transition-all focus:outline-none focus:border-gray-400"
              disabled={isUpdating}
            >
              {lifecycleStageOptions[selectedStage]?.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-3 pt-5">
          <button
            onClick={onClose}
            disabled={isUpdating}
            className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isUpdating}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isUpdating ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// Color cycled per configured stage, in place of the old hand-picked color per
// hardcoded stage name — a stage added in Settings gets the next color in the
// cycle instead of falling back to some default, and nothing here needs to
// change when a stage is renamed or reordered.
const STAGE_PALETTE = [
  { bgColor: 'bg-blue-500', bgColorLight: 'bg-blue-50', textColor: 'text-white', textColorDark: 'text-blue-700', arrowBorderColor: 'border-l-blue-500' },
  { bgColor: 'bg-indigo-500', bgColorLight: 'bg-indigo-50', textColor: 'text-white', textColorDark: 'text-indigo-700', arrowBorderColor: 'border-l-indigo-500' },
  { bgColor: 'bg-purple-500', bgColorLight: 'bg-purple-50', textColor: 'text-white', textColorDark: 'text-purple-700', arrowBorderColor: 'border-l-purple-500' },
  { bgColor: 'bg-amber-500', bgColorLight: 'bg-amber-50', textColor: 'text-white', textColorDark: 'text-amber-700', arrowBorderColor: 'border-l-amber-500' },
  { bgColor: 'bg-green-500', bgColorLight: 'bg-green-50', textColor: 'text-white', textColorDark: 'text-green-700', arrowBorderColor: 'border-l-green-500' },
  { bgColor: 'bg-teal-500', bgColorLight: 'bg-teal-50', textColor: 'text-white', textColorDark: 'text-teal-700', arrowBorderColor: 'border-l-teal-500' },
];

// Lifecycle Flow Component. Segments are ONE PER CONFIGURED STAGE (from
// useContactLifecycleStore, backed by Settings -> Contact Lifecycle) rather
// than a hardcoded 5-segment New/Contacted/Interested/Qualified/Won layout —
// so adding, renaming or reordering a stage in Settings changes this bar
// automatically instead of needing a matching code change here.
const LifecycleStages = ({ contact, onContactUpdate }) => {
  const [showLifecycleModal, setShowLifecycleModal] = useState(false);
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [pendingStageIndex, setPendingStageIndex] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const allLifecycleStages = useContactLifecycleStore((s) => s.allLifecycleStages);
  const lifecycleStageOptions = useContactLifecycleStore((s) => s.lifecycleStageOptions);
  const getLifecycleStageForStatus = useContactLifecycleStore((s) => s.getLifecycleStageForStatus);
  const fetchStages = useContactLifecycleStore((s) => s.fetchStages);

  useEffect(() => {
    fetchStages();
  }, [fetchStages]);

  const stageConfigs = allLifecycleStages.map((stageName, i) => {
    const statuses = lifecycleStageOptions[stageName] || [];
    return {
      key: stageName,
      label: stageName,
      ...STAGE_PALETTE[i % STAGE_PALETTE.length],
      // Only offer a dropdown when the stage has more than one status to
      // choose between — a single-status stage just applies directly on click.
      options: statuses.length > 1 ? statuses : null,
      soloStatus: statuses[0] || stageName,
    };
  });

  const currentStageIndex = Math.max(0, allLifecycleStages.indexOf(contact.lifecycleStage));

  const handleStageClick = async (stageIndex, option = null) => {
    if (isUpdating) return;

    if (stageConfigs[stageIndex].options && !option) {
      if (showStatusDropdown && pendingStageIndex === stageIndex) {
        setShowStatusDropdown(false);
        setPendingStageIndex(null);
      } else {
        setShowStatusDropdown(true);
        setPendingStageIndex(stageIndex);
      }
      return;
    }

    const targetStatus = option || stageConfigs[stageIndex].soloStatus;

    try {
      setIsUpdating(true);

      // Resolves every status to its one configured stage, so a stage that's
      // been renamed or a status moved between stages in Settings is always
      // reflected correctly rather than trusting a stale local mapping.
      const lifecycleStage = getLifecycleStageForStatus(targetStatus);

      await API.put(`/contacts/${contact._id}/lifecycle-stage`, {
        lifecycleStage,
        stageStatus: targetStatus
      });

      if (onContactUpdate) {
        onContactUpdate({
          ...contact,
          lifecycleStage,
          stageStatus: targetStatus
        });
      }

      setShowStatusDropdown(false);
      setPendingStageIndex(null);
      toast.success("Status updated!");

    } catch (error) {
      console.error("Failed to update status:", error);
      if (error.response?.status === 402) {
        toast.error(error.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(error.response?.data?.error || "Failed to update status");
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const getStageDisplayInfo = (stageIndex) => {
    const stage = stageConfigs[stageIndex];
    const isCurrent = stageIndex === currentStageIndex;

    if (isCurrent && contact.stageStatus) {
      return { ...stage, label: contact.stageStatus };
    }

    return stage;
  };

  return (
    <div className="mb-6">
      <AppToaster />

      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Lifecycle:</span>
          <button
            className="flex items-center gap-1 text-gray-900 hover:text-gray-700 transition-colors font-medium"
            onClick={() => setShowLifecycleModal(true)}
          >
            <span>{contact.lifecycleStage}</span>
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowLifecycleModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm"
          >
            <EditIcon className="w-3 h-3" />
            <span>Edit</span>
          </button>
          <button
            onClick={() => setShowSettingsDrawer(true)}
            title="Edit lifecycle stages (Settings)"
            className="flex items-center gap-2 px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm"
          >
            <SettingsIcon className="w-3.5 h-3.5" />
            <span>Stages</span>
          </button>
        </div>
      </div>

      {/* Progress Flow */}
      <div className="relative">
        <div className="flex items-center">
          {stageConfigs.map((stageConfig, index) => {
            const displayInfo = getStageDisplayInfo(index);
            const isActive = index <= currentStageIndex;
            const isCurrent = index === currentStageIndex;
            const isPending = pendingStageIndex === index;
            const hasOptions = stageConfig.options && stageConfig.options.length > 0;

            return (
              <div key={index} className="relative flex-1">
                <div className="relative">
                  <div
                    className={`
                      relative px-3 py-2.5 text-xs font-medium text-center cursor-pointer
                      transition-all duration-300
                      ${isActive ? displayInfo.bgColor : displayInfo.bgColorLight}
                      ${isActive ? displayInfo.textColor : displayInfo.textColorDark}
                      ${index === 0 ? 'rounded-l-lg' : ''}
                      ${index === stageConfigs.length - 1 ? 'rounded-r-lg' : ''}
                      ${isUpdating ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                    onClick={() => !isUpdating && handleStageClick(index)}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span className="whitespace-nowrap">{displayInfo.label}</span>
                      {hasOptions && isCurrent && (
                        <ChevronDown className={`w-3 h-3 transition-transform ${showStatusDropdown && isPending ? 'rotate-180' : ''}`} />
                      )}
                    </div>
                  </div>

                  {/* Arrow */}
                  {index < stageConfigs.length - 1 && isActive && (
                    <div
                      className={`
                        absolute top-0 right-0 w-0 h-0
                        border-t-[18px] border-b-[18px] border-l-[14px]
                        border-t-transparent border-b-transparent
                        ${displayInfo.arrowBorderColor}
                        transform translate-x-full z-10
                        transition-all duration-300
                      `}
                    />
                  )}
                </div>

                {/* Dropdown Options */}
                {showStatusDropdown && isPending && stageConfig.options && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-30 overflow-hidden">
                    {stageConfig.options.map((option, optIndex) => (
                      <div
                        key={option}
                        className={`
                          px-3 py-2 text-sm cursor-pointer transition-all
                          ${contact.stageStatus === option ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}
                          ${optIndex !== stageConfig.options.length - 1 ? 'border-b border-gray-100' : ''}
                          ${isUpdating ? 'opacity-50 cursor-not-allowed' : ''}
                          flex items-center gap-2
                        `}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isUpdating) {
                            handleStageClick(index, option);
                          }
                        }}
                      >
                        <CheckCircle2 className="w-4 h-4 text-blue-600" />
                        <span>{option}</span>
                        {contact.stageStatus === option && (
                          <div className="ml-auto">
                            <CheckCircle2 className="w-4 h-4 text-blue-600" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {isUpdating && (
        <div className="mt-4 flex items-center gap-2 text-gray-600">
          <div className="w-3 h-3 border-2 border-gray-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs">Updating...</span>
        </div>
      )}

      <LifecycleStageModal
        isOpen={showLifecycleModal}
        onClose={() => setShowLifecycleModal(false)}
        contact={contact}
        onUpdate={onContactUpdate}
      />

      <ContactLifecycleDrawer
        isOpen={showSettingsDrawer}
        onClose={() => setShowSettingsDrawer(false)}
      />
    </div>
  );
};

// Contact Info Card
const ContactInfoCard = ({ icon: Icon, label, value, action }) => (
  <div className="h-[72px] flex items-center gap-3 px-3 bg-white border border-gray-200 rounded-xl hover:border-gray-300 transition-all group relative">
    <div className="w-10 h-10 text-gray-600 border border-gray-200 rounded-lg flex items-center justify-center flex-shrink-0 relative">
      <Icon className="w-5 h-5" />
    </div>

    <div className="min-w-0 flex-1 flex flex-col justify-center">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-gray-500 truncate">{label}</p>
        {action && (
          <div className="flex-shrink-0">
            {action}
          </div>
        )}
      </div>
      <p className="font-semibold text-gray-900 text-sm truncate">
        {value || '—'}
      </p>
    </div>

    {/* Tooltip - shows on hover if value exists and is long enough to truncate */}
    {value && value.length > 15 && (
      <div className="absolute left-0 right-0 bottom-full mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 pointer-events-none shadow-lg">
        <div className="break-words">{value}</div>
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
      </div>
    )}
  </div>
);


// Additional Fields Section
const AdditionalFieldsSection = ({ fields }) => {
  if (!fields || fields.length === 0) return null;

  return (
    <div className="border-t border-gray-200 pt-4 mt-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Additional Information</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {fields.map((field, idx) => (
          <div key={idx} className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <p className="text-xs font-medium text-gray-600 mb-1">{field.key}</p>
            <p className="text-sm font-medium text-gray-900">{field.value || '—'}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

const BasicDetails = ({ contact, company, deals, contactFieldList = [], onContactUpdate, onDealCreated, onFieldsChanged }) => {
  const [showEmptyFields, setShowEmptyFields] = useState(false); // 👉 NEW Togle State
  const [showFieldDrawer, setShowFieldDrawer] = useState(false);

  // --- PASTE THIS BLOCK STARTING HERE ---
  const [isOwnerDropdownOpen, setIsOwnerDropdownOpen] = useState(false);
  const [searchOwnerQuery, setSearchOwnerQuery] = useState("");
  const [availableUsers, setAvailableUsers] = useState([]);

  const currentUserStr = localStorage.getItem("user");
  const currentUser = currentUserStr ? JSON.parse(currentUserStr) : null;

  const hasEditPermission = () => {
    if (currentUser?.role === 'admin') return true;
    return currentUser?.permissions?.some(
      (p) => p.name.toLowerCase() === 'contacts' && p.permission === 'read-write'
    );
  };

  useEffect(() => {
    const fetchTeamUsers = async () => {
      if (!hasEditPermission()) return;
      try {
        const response = await API.get("/auth/all-user");
        setAvailableUsers(response.data.allUsers || []);
      } catch (error) {
        console.error("Unable to load team list:", error);
      }
    };
    fetchTeamUsers();
  }, []);

  const handleOwnerChange = async (newOwnerId) => {
    if (!hasEditPermission()) return;

    // VALIDATION 1: Prevent empty/null values
    if (!newOwnerId) {
      toast.error("Invalid owner selected.");
      return;
    }

    // VALIDATION 2: Prevent re-assigning to the current owner
    if (contact.user?._id === newOwnerId) {
      setIsOwnerDropdownOpen(false);
      return;
    }

    try {
      await API.put(`/contacts/${contact._id}`, { user: newOwnerId });
      toast.success("Owner reassigned successfully.");
      setIsOwnerDropdownOpen(false);
      window.location.reload();
    } catch (err) {
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || "Failed to update owner.");
      }
    }
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // 👉 NEW: Helper functions for custom fields
  const isEmpty = (value) => {
    if (value === null || value === undefined || value === "") return true;
    if (typeof value === "string" && value.trim() === "") return true;
    if (Array.isArray(value) && value.length === 0) return true;
    return false;
  };

  const getMergedAdditionalFields = () => {
    if (!contactFieldList || contactFieldList.length === 0) {
      return (contact.additionalFields || []).map(f => ({ ...f, category: "Uncategorized" }));
    }

    const existingValuesMap = new Map();
    if (contact.additionalFields && contact.additionalFields.length > 0) {
      contact.additionalFields.forEach((field) => {
        existingValuesMap.set(field.key, field.value);
      });
    }

    return contactFieldList.map((templateField) => {
      const value = existingValuesMap.get(templateField.name);
      return {
        key: templateField.name,
        value: value !== undefined ? value : null,
        type: templateField.type,
        options: templateField.options,
        required: templateField.required,
        category: templateField.category || "Uncategorized",
      };
    });
  };

  const getVisibleAdditionalFields = () => {
    const mergedFields = getMergedAdditionalFields();
    if (!showEmptyFields) {
      return mergedFields.filter((field) => !isEmpty(field.value));
    }
    return mergedFields;
  };

  const visibleAdditionalFields = getVisibleAdditionalFields();
  const groupedFields = Object.entries(
    visibleAdditionalFields.reduce((acc, field) => {
      const cat = field.category || "Uncategorized";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(field);
      return acc;
    }, {})
  ).sort(([catA], [catB]) => {
    if (catA === "Uncategorized") return 1;
    if (catB === "Uncategorized") return -1;
    return catA.localeCompare(catB);
  });

  return (
    <div className="space-y-6">

      {/* --- PASTE THIS UI BLOCK STARTING HERE --- */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-4 rounded-lg border border-gray-200 relative z-50">

        {/* LEFT SIDE: Owner Dropdown */}
        <div className="flex items-center gap-2 ">
          <span className="text-sm font-medium text-gray-500">Owner:</span>

          <div className="relative">
            <button
              onClick={() => hasEditPermission() && setIsOwnerDropdownOpen(!isOwnerDropdownOpen)}
              className={`flex items-center gap-1.5 px-2 py-1 -ml-2 rounded text-sm font-semibold transition-colors ${hasEditPermission() ? 'text-gray-900 hover:bg-gray-50 cursor-pointer' : 'text-gray-900 cursor-default'
                }`}
              disabled={!hasEditPermission()}
            >
              {contact.user?.name || "Unassigned"}
              {hasEditPermission() && <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>

            {isOwnerDropdownOpen && hasEditPermission() && (
              <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-md shadow-xl">
                <div className="p-3 border-b border-gray-100 flex justify-between items-center">
                  <h4 className="text-xs font-semibold text-gray-700">Assign Owner</h4>
                  <button onClick={() => setIsOwnerDropdownOpen(false)} className="text-xs text-gray-500 border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">Close</button>
                </div>

                <div className="p-2">
                  <div className="relative mb-2">
                    <input type="text" placeholder="Search..." className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:border-blue-500" value={searchOwnerQuery} onChange={(e) => setSearchOwnerQuery(e.target.value)} />
                  </div>

                  <div className="max-h-48 overflow-y-auto">
                    <button onClick={() => handleOwnerChange(null)} className="w-full text-left flex items-center gap-3 p-2 hover:bg-gray-50 rounded text-sm">
                      <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center font-medium">N</div>
                      <span className="text-gray-700">None</span>
                      {!contact.user && <Check className="w-4 h-4 text-green-600 ml-auto" />}
                    </button>

                    {availableUsers.filter(u => u.name?.toLowerCase().includes(searchOwnerQuery.toLowerCase())).map((mappedUser) => {
                      const isCurrentOwner = contact.user?._id === mappedUser._id;
                      const initials = mappedUser.name ? mappedUser.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'U';

                      return (
                        <button key={mappedUser._id} onClick={() => handleOwnerChange(mappedUser._id)} className="w-full text-left flex items-center gap-3 p-2 hover:bg-gray-50 rounded text-sm">
                          <div className="w-7 h-7 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-medium text-xs">{initials}</div>
                          <div className="flex flex-col">
                            <span className="text-gray-900 font-medium">{mappedUser.name}</span>
                            <span className="text-gray-500 text-xs">{mappedUser.email}</span>
                          </div>
                          {isCurrentOwner && <Check className="w-4 h-4 text-green-600 ml-auto" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT SIDE: Audit Timestamps (Hover Reveal) */}
        <div className="flex flex-col text-xs text-right mt-4 md:mt-0 relative group/audit cursor-default">
          <div className="flex items-center justify-end gap-1.5 text-gray-500">
            <Clock className="w-3.5 h-3.5" />
            <span>Updated: {formatDateTime(contact.updatedAt)}</span>
          </div>
          <div className="text-gray-400">by: <span className="font-medium text-gray-600">{contact.lastUpdatedBy?.name || 'Unknown'}</span></div>

          <div className="absolute top-full right-0 mt-2 bg-white border border-gray-200 p-4 rounded-md shadow-xl opacity-0 group-hover/audit:opacity-100 transition-opacity pointer-events-none z-40 min-w-[250px] text-left">

            {/* Last Updated */}
            <div className="mb-3">
              <div className="flex justify-between items-center text-gray-600 mb-1">
                <span>Update On:</span>
                <span className="font-medium">{formatDateTime(contact.updatedAt)}</span>
              </div>
              <div className="flex justify-between items-center text-gray-600">
                <span>Updated by:</span>
                <span className="font-medium text-gray-900">{contact.lastUpdatedBy?.name || 'Unknown'}</span>
              </div>
            </div>

            {/* Separator Line */}
            <div className="border-t border-gray-200 my-3"></div>

            {/* Original Creation */}
            <div>
              <div className="flex justify-between items-center text-gray-600 mb-1">
                <span>Added on:</span>
                <span className="font-medium">{formatDateTime(contact.createdAt)}</span>
              </div>
              <div className="flex justify-between items-center text-gray-600">
                <span>Added by:</span>
                <span className="font-medium text-gray-900">{contact.createdBy?.name || 'Unknown'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <AppToaster />

      {/* Lifecycle Stages */}
      <LifecycleStages contact={contact} onContactUpdate={onContactUpdate} />

      {/* Contact Information Grid */}
      <div
        className="flex flex-col items-start w-full"
        style={{ padding: 16, gap: 16, backgroundColor: "#F8FAFC", borderRadius: 14 }}
      >
        <div className="flex flex-row items-start w-full" style={{ gap: 16 }}>
          {/* Email */}
          <div className="flex flex-col items-start flex-1" style={{ gap: 6, minWidth: 0 }}>
            <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "120%", color: "#6B7280" }}>
              Email
            </span>
            <span className="truncate w-full" style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 14, lineHeight: "120%", color: "#1F2937" }}>
              {contact.email || "—"}
            </span>
          </div>

          {/* Phone */}
          <div className="flex flex-col items-start flex-1" style={{ gap: 6, minWidth: 0 }}>
            <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "120%", color: "#6B7280" }}>
              Phone
            </span>
            <span className="truncate w-full" style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 14, lineHeight: "120%", color: "#1F2937" }}>
              {contact.phone || "—"}
            </span>
          </div>

          {/* Company */}
          <div className="flex flex-col items-start flex-1" style={{ gap: 6, minWidth: 0 }}>
            <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "120%", color: "#6B7280" }}>
              Company
            </span>
            <div className="flex items-center gap-1 w-full">
              <span className="truncate" style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 14, lineHeight: "120%", color: "#1F2937" }}>
                {company?.name || 'No company'}
              </span>
              {company && (
                <Link
                  to={`/companies/${company._id}`}
                  className="text-gray-400 hover:text-gray-900 transition-colors flex-shrink-0"
                >
                  <ArrowRight className="w-4 h-4" />
                </Link>
              )}
            </div>
          </div>

          {/* Status */}
          <div className="flex flex-col items-start flex-1" style={{ gap: 6, minWidth: 0 }}>
            <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "120%", color: "#6B7280" }}>
              Status
            </span>
            <span className="truncate w-full" style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 14, lineHeight: "120%", color: "#1F2937" }}>
              {contact.stageStatus || "—"}
            </span>
          </div>
        </div>
      </div>

      {/* --- CUSTOM FIELDS --- same quick-drawer pattern as the Deal overview
          (deal/BasicDetails.jsx): a single entry point that opens
          ContactFieldDrawer (wrapping the same ContactFieldSettings editor
          Settings -> Contact Fields uses) instead of a large inline
          value-display block, so managing fields here and in Settings is the
          exact same UI, not two that can drift apart. */}
      <div className="border-t border-gray-200 pt-4 mt-6">
        {groupedFields.length === 0 ? (
          <div className="flex items-center justify-end px-2 text-gray-400">
            <button
              type="button"
              onClick={() => setShowFieldDrawer(true)}
              className="text-[10px] font-bold text-blue-600 flex items-center gap-1 hover:underline"
            >
              <Plus className="w-3 h-3" /> Add custom fields
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-3 px-2">
            <button
              type="button"
              onClick={() => setShowFieldDrawer(true)}
              className="text-[10px] font-bold text-blue-600 flex items-center gap-1 hover:underline"
            >
              <Plus className="w-3 h-3" /> Add Field
            </button>
            <button onClick={() => setShowEmptyFields(v => !v)} className="text-[10px] font-medium text-gray-400 hover:text-blue-600 flex items-center gap-1">
              {showEmptyFields ? <><EyeOff className="w-3 h-3" /> Hide empty fields</> : <><EyeIcon className="w-3 h-3" /> Show all fields</>}
            </button>
          </div>
        )}
      </div>

      <ContactFieldDrawer
        isOpen={showFieldDrawer}
        onClose={() => {
          setShowFieldDrawer(false);
          onFieldsChanged?.();
        }}
      />

      {/* Deals Section */}
      <div className="border-t border-gray-200 pt-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-gray-600" />
            <div>
              <h3 className="text-lg font-bold text-gray-900">Associated Deals</h3>
              <p className="text-sm text-gray-600">
                {deals?.length || 0} deal{deals?.length !== 1 ? 's' : ''} in pipeline
              </p>
            </div>
          </div>
        </div>

        <DealsTable
          deals={deals || []}
          contact={contact}
          company={company}
          onDealCreated={onDealCreated}
        />
      </div>
    </div>
  );
};

export default BasicDetails;
