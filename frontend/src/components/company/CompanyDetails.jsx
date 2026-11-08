import { Link } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import {
  Filter,
  DollarSign,
  AlertCircle,
  IndianRupee,
  EyeOff,
  ChevronDown,
  Clock,
  Check,
  FolderOpen, 
  Info,       
  LayoutGrid 
} from "lucide-react";
import API from "../../services/api";
import { toast } from "react-hot-toast";
import AppToaster from "../AppToaster";
import EyeIcon from "../common/EyeIcon";

const CompanyDetails = ({
  data,
  contacts = [],
  paymentSummary,
  loadingPayment,
  isExpanded,
  isQuickView,
}) => {
  const [showEmptyFields, setShowEmptyFields] = useState(false);
  const [showAllContacts, setShowAllContacts] = useState(false);

  // CompanyFields Template State
  const [companyFieldsTemplate, setCompanyFieldsTemplate] = useState([]);
  const [loadingFieldsTemplate, setLoadingFieldsTemplate] = useState(false);

  const [isOwnerDropdownOpen, setIsOwnerDropdownOpen] = useState(false);
  const [searchOwnerQuery, setSearchOwnerQuery] = useState("");
  const [availableUsers, setAvailableUsers] = useState([]);
  const ownerDropdownRef = useRef(null);

  useEffect(() => {
    if (!isOwnerDropdownOpen) return;
    const handleClickOutside = (e) => {
      if (ownerDropdownRef.current && !ownerDropdownRef.current.contains(e.target)) {
        setIsOwnerDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOwnerDropdownOpen]);

  // 2. --- PERMISSION CHECK LOGIC ---
  const currentUserStr = localStorage.getItem("user");
  const currentUser = currentUserStr ? JSON.parse(currentUserStr) : null;

  const hasEditPermission = () => {
    if (currentUser?.role === 'admin') return true;
    return currentUser?.permissions?.some(
      (p) => p.name.toLowerCase() === 'company' && p.permission === 'read-write'
    );
  };

  // --- PASTE THIS MISSING LOGIC BLOCK HERE ---
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
    if (data.user?._id === newOwnerId) {
      setIsOwnerDropdownOpen(false);
      return; 
    }

    try {
      await API.put(`/companies/${data._id}`, { user: newOwnerId });
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

  // Fetch CompanyFields template
  useEffect(() => {
    const fetchCompanyFieldsTemplate = async () => {
      setLoadingFieldsTemplate(true);
      try {
        const response = await API.get("/company-fields");
        if (response.data && response.data.fields) {
          setCompanyFieldsTemplate(response.data.fields);
        }
      } catch (err) {
        console.error("Error fetching company fields template:", err);
      } finally {
        setLoadingFieldsTemplate(false);
      }
    };

    fetchCompanyFieldsTemplate();
  }, []);

  // Helper function to check if a value is empty
  const isEmpty = (value) => {
    if (value === null || value === undefined || value === "") return true;
    if (typeof value === "string" && value.trim() === "") return true;
    if (Array.isArray(value) && value.length === 0) return true;
    return false;
  };

  // Define all company fields to display (EXCLUDING social media since they're shown as icons)
  const companyFields = [
    { label: "Website", key: "website", type: "link" },
    { label: "Email Address", key: "email", type: "link" },
    { label: "Company Industry", key: "industry" },
    { label: "Company Locality", key: "address" },
    { label: "Company GSTIN", key: "gstin" },
  ];

  // Get nested value from object using dot notation
  const getNestedValue = (obj, path) => {
    return path.split(".").reduce((current, key) => current?.[key], obj);
  };

  // Filter fields based on toggle state
  const getVisibleFields = () => {
    const fields = [...companyFields];

    if (!showEmptyFields) {
      return fields.filter(
        (field) => !isEmpty(getNestedValue(data, field.key)),
      );
    }

    return fields;
  };

  // Merge CompanyFields template with actual company data
  const getMergedAdditionalFields = () => {
    if (!companyFieldsTemplate || companyFieldsTemplate.length === 0) {
      // Fallback to only showing filled fields if template not loaded
      return data.additionalFields || [];
    }

    // Create a map of existing values from company.additionalFields
    const existingValuesMap = new Map();
    if (data.additionalFields && data.additionalFields.length > 0) {
      data.additionalFields.forEach((field) => {
        existingValuesMap.set(field.key, field.value);
      });
    }

    // Map template fields to display format with actual values
    return companyFieldsTemplate.map((templateField) => {
      const value = existingValuesMap.get(templateField.name);
      return {
        key: templateField.name,
        value: value !== undefined ? value : null,
        type: templateField.type,
        options: templateField.options,
        required: templateField.required,
        category: templateField.category || "Uncategorized", // 👉 ADDED: Capture the category
      };
    });
  };

  // Filter additional fields based on toggle state
  const getVisibleAdditionalFields = () => {
    const mergedFields = getMergedAdditionalFields();

    if (!showEmptyFields) {
      return mergedFields.filter((field) => !isEmpty(field.value));
    }

    return mergedFields;
  };

  // Render field value based on type
  const renderAdditionalFieldValue = (field) => {
    if (isEmpty(field.value)) {
      return <span className="text-gray-400 italic">Not available</span>;
    }

    // Handle different field types
    switch (field.type) {
      case "url":
        const url = field.value.startsWith("http")
          ? field.value
          : `https://${field.value}`;
        return (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline break-words"
          >
            {field.value}
          </a>
        );

      case "date":
        try {
          return (
            <span className="text-gray-500">
              {new Date(field.value).toLocaleDateString()}
            </span>
          );
        } catch {
          return (
            <span className="text-gray-500 break-words">{field.value}</span>
          );
        }

      case "multiselect":
        if (Array.isArray(field.value)) {
          return (
            <div className="flex flex-wrap gap-1">
              {field.value.map((item, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700"
                >
                  {item}
                </span>
              ))}
            </div>
          );
        }
        return <span className="text-gray-500 break-words">{field.value}</span>;

      case "number":
        return (
          <span className="text-gray-500">
            {Number(field.value).toLocaleString()}
          </span>
        );

      default:
        return <span className="text-gray-500 break-words">{field.value}</span>;
    }
  };

  // Render field value
  const renderFieldValue = (field) => {
    const value = getNestedValue(data, field.key);

    if (isEmpty(value)) {
      return <span className="text-gray-400 italic">Not available</span>;
    }

    if (field.type === "link") {
      const url = value.startsWith("http") ? value : `https://${value}`;
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:underline break-words"
        >
          {value}
        </a>
      );
    }

    return <span className="text-gray-500 break-words">{value}</span>;
  };

  const visibleFields = getVisibleFields();
  const visibleAdditionalFields = getVisibleAdditionalFields();

  // 👉 NEW: Group the visible additional fields by their category
  const groupedFields = Object.entries(
    visibleAdditionalFields.reduce((acc, field) => {
      const cat = field.category || "Uncategorized";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(field);
      return acc;
    }, {})
  ).sort(([catA], [catB]) => {
    // Keep "Uncategorized" at the very bottom
    if (catA === "Uncategorized") return 1;
    if (catB === "Uncategorized") return -1;
    return catA.localeCompare(catB);
  });

  return (
    <div className="">
      {/* --- REPLACE EXISTING TOP ACTION BAR WITH THIS --- */}
      <AppToaster />

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-4 rounded-lg border border-gray-200 mb-6 relative z-10">

        {/* LEFT SIDE: Owner Dropdown */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-500">Owner:</span>

          <div className="relative" ref={ownerDropdownRef}>
            <button
              onClick={() => hasEditPermission() && setIsOwnerDropdownOpen(!isOwnerDropdownOpen)}
              className={`flex items-center gap-1.5 px-2 py-1 -ml-2 rounded text-sm font-semibold transition-colors ${hasEditPermission() ? 'text-gray-900 hover:bg-gray-50 cursor-pointer' : 'text-gray-900 cursor-default'}`}
              disabled={!hasEditPermission()}
            >
              {data.user?.name || "Unassigned"}
              {hasEditPermission() && <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>

            {/* Dropdown Menu */}
            {isOwnerDropdownOpen && hasEditPermission() && (
              <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-md shadow-xl z-50">
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
                      {!data.user && <Check className="w-4 h-4 text-green-600 ml-auto" />}
                    </button>

                    {availableUsers.filter(u => u.name?.toLowerCase().includes(searchOwnerQuery.toLowerCase())).map((mappedUser) => {
                      const isCurrentOwner = data.user?._id === mappedUser._id;
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
            <span>Updated: {formatDateTime(data.updatedAt)}</span>
          </div>
          <div className="text-gray-400">by: <span className="font-medium text-gray-600">{data.lastUpdatedBy?.name || 'Unknown'}</span></div>

          <div className="absolute top-full right-0 mt-2 bg-white border border-gray-200 p-4 rounded-md shadow-xl opacity-0 group-hover/audit:opacity-100 transition-opacity pointer-events-none z-40 min-w-[250px] text-left">

            {/* Last Updated */}
            <div className="mb-3">
              <div className="flex justify-between items-center text-gray-600 mb-1">
                <span>Update On:</span>
                <span className="font-medium">{formatDateTime(data.updatedAt)}</span>
              </div>
              <div className="flex justify-between items-center text-gray-600">
                <span>Updated by:</span>
                <span className="font-medium text-gray-900">{data.lastUpdatedBy?.name || 'Unknown'}</span>
              </div>
            </div>

            {/* Separator Line */}
            <div className="border-t border-gray-200 my-3"></div>

            {/* Original Creation */}
            <div>
              <div className="flex justify-between items-center text-gray-600 mb-1">
                <span>Added on:</span>
                <span className="font-medium">{formatDateTime(data.createdAt)}</span>
              </div>
              <div className="flex justify-between items-center text-gray-600">
                <span>Added by:</span>
                <span className="font-medium text-gray-900">{data.createdBy?.name || 'Unknown'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* --- END REPLACED TOP ACTION BAR --- */}

      {/* About Company Section - 2 Column Grid */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <LayoutGrid className="w-5 h-5 text-blue-600" />
            Company Information
          </h2>
          
          <button
            onClick={() => setShowEmptyFields(!showEmptyFields)}
            className={`flex items-center gap-2 text-xs font-semibold text-gray-600 hover:text-blue-600 px-3 py-1.5 border border-gray-200 ${isQuickView ? "rounded-full px-4" : "rounded-md"} hover:bg-blue-50 hover:border-blue-200 transition-colors shadow-sm bg-white`}
          >
            {showEmptyFields ? (
              <><EyeOff className="w-3.5 h-3.5" /> Hide Empty Fields</>
            ) : (
              <><EyeIcon className="w-3.5 h-3.5" /> Show All Fields</>
            )}
          </button>
        </div>

        {loadingFieldsTemplate ? (
          <div className="text-sm text-gray-500 flex items-center gap-3 bg-white p-5 rounded-xl border border-gray-200">
             <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
             Loading company fields...
          </div>
        ) : (
          <div className="space-y-5">

            {/* --- SECTION: GENERAL INFORMATION (Standard Fields) --- */}
            {(visibleFields.length > 0 || showEmptyFields) && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="bg-gray-50/80 px-5 py-3 border-b border-gray-200 flex items-center gap-2">
                  <Info className="w-4 h-4 text-blue-600" />
                  <h3 className="text-sm font-bold text-gray-800 tracking-wide uppercase">General Information</h3>
                </div>
                <div className="p-5">
                  <div className={isExpanded || isQuickView ? "grid grid-cols-1 gap-4 text-sm" : "grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm"}>
                    {visibleFields.map((field, idx) => (
                      <div key={idx} className="flex flex-col sm:flex-row sm:items-start sm:gap-4 border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                        <span className="text-gray-500 font-medium w-40 flex-shrink-0 mb-1 sm:mb-0">
                          {field.label}
                        </span>
                        <div className="flex-1 min-w-0">
                          {renderFieldValue(field)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* --- SECTIONS: DYNAMIC CUSTOM CATEGORIES --- */}
            {groupedFields.map(([categoryName, categoryFields]) => (
              <div key={categoryName} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="bg-gray-50/80 px-5 py-3 border-b border-gray-200 flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-sm font-bold text-gray-800 tracking-wide uppercase">{categoryName}</h3>
                </div>
                <div className="p-5">
                  <div className={isExpanded || isQuickView ? "grid grid-cols-1 gap-4 text-sm" : "grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm"}>
                    {categoryFields.map((field, idx) => (
                      <div key={`additional-${idx}`} className="flex flex-col sm:flex-row sm:items-start sm:gap-4 border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                        <span className="text-gray-500 font-medium w-40 flex-shrink-0 mb-1 sm:mb-0">
                          {field.key}
                          {field.required && <span className="text-red-500 ml-1" title="Required">*</span>}
                        </span>
                        <div className="flex-1 min-w-0">
                          {renderAdditionalFieldValue(field)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}

            {/* Empty state message when all fields are hidden */}
            {!showEmptyFields && visibleFields.length === 0 && visibleAdditionalFields.length === 0 && (
              <div className="col-span-2 text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-300 text-gray-400 text-sm italic">
                No populated fields available. Click "Show All Fields" above to view empty fields.
              </div>
            )}

          </div>
        )}
      </div>

      {/* Payment Summary Cards */}
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">
          Payment Overview
        </h3>
        {loadingPayment || !paymentSummary ? (
          <div className="text-sm text-gray-500">
            Loading payment information...
          </div>
        ) : (
          <div className={isExpanded || isQuickView ? "grid grid-cols-2 gap-4" : "grid grid-cols-1 md:grid-cols-4 gap-4"}>
            <div className="bg-white border border-gray-200 rounded-lg p-4 min-w-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500 truncate mr-2">
                  Total Invoiced
                </span>
                <IndianRupee className="w-4 h-4 text-gray-400 flex-shrink-0" />
              </div>
              <p 
                className="text-lg md:text-2xl font-semibold text-gray-900 truncate"
                title={`₹${paymentSummary?.totalAmount?.toLocaleString() || 0}`}
              >
                ₹{paymentSummary?.totalAmount?.toLocaleString() || 0}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {paymentSummary?.totalInvoices || 0} invoice
                {paymentSummary?.totalInvoices !== 1 ? "s" : ""}
              </p>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4 min-w-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500 truncate mr-2">
                  Amount Paid
                </span>
                <div className="w-2 h-2 rounded-full flex-shrink-0"></div>
              </div>
              <p 
                className="text-lg md:text-2xl font-semibold truncate"
                title={`₹${paymentSummary?.amountPaid?.toLocaleString() || 0}`}
              >
                ₹{paymentSummary?.amountPaid?.toLocaleString() || 0}
              </p>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4 min-w-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500 truncate mr-2">
                  Amount Due
                </span>
                <div className="w-2 h-2 rounded-full flex-shrink-0"></div>
              </div>
              <p 
                className="text-lg md:text-2xl font-semibold truncate"
                title={`₹${paymentSummary?.amountDue?.toLocaleString() || 0}`}
              >
                ₹{paymentSummary?.amountDue?.toLocaleString() || 0}
              </p>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4 min-w-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500 truncate mr-2">
                  Overdue
                </span>
              </div>
              <p 
                className="text-lg md:text-2xl font-semibold truncate"
                title={`₹${paymentSummary?.overdueAmount?.toLocaleString() || 0}`}
              >
                ₹{paymentSummary?.overdueAmount?.toLocaleString() || 0}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Contacts Section */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-semibold text-gray-900">
            Contacts ({contacts.length})
          </h3>
        </div>

        {contacts.length === 0 ? (
          <div className="text-sm text-gray-500 bg-gray-50 p-6 rounded-xl border border-dashed border-gray-200 text-center">
            No contacts found for this company or its subsidiaries.
          </div>
        ) : (
          <div className="space-y-4">
            <div
              className={
                isExpanded
                  ? "grid grid-cols-1 md:grid-cols-2 gap-4"
                  : "grid grid-cols-1 gap-4"
              }
            >
              {(isQuickView && !showAllContacts ? contacts.slice(0, 5) : contacts).map((contact) => (
                <Link
                  to={`/contacts/${contact._id}`}
                  key={contact._id}
                  className="group flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:shadow-sm hover:border-blue-300 transition-all min-w-0"
                >
                  {/* Contact Avatar Fallback */}
                  <div className="w-10 h-10 bg-blue-100 group-hover:bg-blue-200 transition-colors rounded-full flex items-center justify-center font-semibold text-blue-700 flex-shrink-0">
                    {contact.name?.charAt(0) || "?"}
                  </div>

                  {/* Contact Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-600 transition-colors" title={contact.name}>
                      {contact.name}
                    </p>
                    <p className="text-xs text-gray-500 truncate" title={contact.email}>
                      {contact.email}
                    </p>
                    {contact.company && contact.company.name !== data.name && (
                      <span className="inline-block mt-1 px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[10px] font-medium border border-indigo-100 truncate max-w-full">
                        {contact.company.name}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
            
            {isQuickView && !showAllContacts && contacts.length > 5 && (
              <div className="pt-2 flex justify-center">
                <button
                  onClick={() => setShowAllContacts(true)}
                  className="px-6 py-2.5 bg-gray-100 text-gray-700 font-semibold rounded-lg hover:bg-gray-200 transition-colors text-sm w-full md:w-auto shadow-sm"
                >
                  View All Contacts ({contacts.length})
                </button>
              </div>
            )}
            {isQuickView && showAllContacts && contacts.length > 5 && (
              <div className="pt-2 flex justify-center">
                <button
                  onClick={() => setShowAllContacts(false)}
                  className="px-6 py-2.5 text-blue-600 font-semibold hover:bg-blue-50 transition-colors text-sm rounded-lg"
                >
                  Show Less
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CompanyDetails;
