import DeleteIcon from "../common/DeleteIcon";
import PlusIcon from "../common/PlusIcon";
import React, { useEffect, useState, useCallback, useRef } from "react";
import API from "../../services/api";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import StatusDropdown from "./StatusDropdown";
import SearchIcon from "../common/SearchIcon";
import {
  ChevronDown,
  ChevronRight,
  X,
  Check,
  Folder as FolderIcon,
  LayoutGrid,
} from "lucide-react";
import ListIcon from "../common/ListIcon";
import EditIcon from "../common/EditIcon";
import ExpandableSearch from "../common/ExpandableSearch";

const ContactFolder = () => {
  const [folders, setFolders] = useState([]);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolder, setEditingFolder] = useState(null);
  const [editingName, setEditingName] = useState("");

  const [selectedContacts, setSelectedContacts] = useState([]);
  const [openFolderIds, setOpenFolderIds] = useState([]);

  const [viewMode, setViewMode] = useState("folder");
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState(null);

  const [folderSearchTerm, setFolderSearchTerm] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [filteredContacts, setFilteredContacts] = useState([]);

  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  const debounce = (func, delay) => {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func(...args), delay);
    };
  };

  const debouncedSearch = useCallback(
    debounce(async (term) => {
      try {
        const params = new URLSearchParams({ limit: "5" });
        if (term.trim()) {
          params.append("search", term.trim());
        }

        const res = await API.get(`/contacts/pagination?${params.toString()}`);
        if (res.data.contacts) {
          setFilteredContacts(res.data.contacts);
        } else if (Array.isArray(res.data)) {
          setFilteredContacts(res.data);
        }
      } catch (error) {
        console.error("Search failed", error);
      }
    }, 300),
    [],
  );

  useEffect(() => {
    if (editingFolder) {
      debouncedSearch(searchTerm);
    }
  }, [searchTerm, editingFolder, debouncedSearch]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchFolders = async () => {
    try {
      const res = await API.get("/contact-folders/");
      setFolders(res.data);
    } catch (error) {
      toast.error("Failed to fetch contact folders");
    }
  };

  const createFolder = async () => {
    if (creatingFolder) return;
    if (!newFolderName.trim()) {
      toast.error("Folder name is required");
      return;
    }
    setCreatingFolder(true);
    const loadingToast = toast.loading("Creating contact folder...");
    try {
      const res = await API.post("/contact-folders", { name: newFolderName.trim() });
      // Show the new folder and close the form straight away; the refetch after
      // only reconciles with the server.
      setFolders((prev) => [...prev, { contacts: [], ...res.data }]);
      setNewFolderName("");
      setShowCreateForm(false);
      toast.success("Contact folder created successfully", {
        id: loadingToast,
      });
      fetchFolders();
    } catch (error) {
      if (error.response?.status === 402) {
        toast.error(error.response?.data?.message || "An active subscription is required to make changes.", { id: loadingToast });
      } else {
        toast.error(error.response?.data?.error || "Failed to create contact folder", { id: loadingToast });
      }
    } finally {
      setCreatingFolder(false);
    }
  };

  const startEdit = (folder) => {
    setEditingFolder(folder);
    setEditingName(folder.name);
    setSelectedContacts(folder?.contacts || []);
    setSearchTerm("");
    setFilteredContacts([]);
  };

  const saveEdit = async () => {
    const loadingToast = toast.loading("Updating contact folder...");
    try {
      await API.put(`/contact-folders/${editingFolder._id}`, {
        name: editingName,
        contacts: selectedContacts.map((c) => c._id),
      });
      setEditingFolder(null);
      setSelectedContacts([]);
      setSearchTerm("");
      toast.success("Contact folder updated successfully", {
        id: loadingToast,
      });
      fetchFolders();
    } catch (error) {
      if (error.response?.status === 402) {
        toast.error(error.response?.data?.message || "An active subscription is required to make changes.", { id: loadingToast });
      } else {
        toast.error(error.response?.data?.error || "Failed to update contact folder", { id: loadingToast });
      }
    }
  };

  const deleteFolder = async (id) => {
    if (!window.confirm("Are you sure you want to delete this contact folder?"))
      return;
    const loadingToast = toast.loading("Deleting contact folder...");
    try {
      await API.delete(`/contact-folders/${id}`);
      toast.success("Contact folder deleted successfully", {
        id: loadingToast,
      });
      fetchFolders();
    } catch (error) {
      if (error.response?.status === 402) {
        toast.error(error.response?.data?.message || "An active subscription is required to make changes.", { id: loadingToast });
      } else {
        toast.error(error.response?.data?.error || "Failed to delete contact folder", { id: loadingToast });
      }
    }
  };

  const toggleContact = (contactObj) => {
    setSelectedContacts((prev) =>
      prev.some((c) => c._id === contactObj._id)
        ? prev.filter((c) => c._id !== contactObj._id)
        : [...prev, contactObj],
    );
  };

  const removeSelectedContact = (contactId) => {
    setSelectedContacts((prev) => prev.filter((c) => c._id !== contactId));
  };

  const toggleFolder = (folderId) => {
    setOpenFolderIds((prev) =>
      prev.includes(folderId)
        ? prev.filter((id) => id !== folderId)
        : [...prev, folderId],
    );
  };

  useEffect(() => {
    fetchFolders();
  }, []);

  const folderQuery = folderSearchTerm.trim().toLowerCase();
  const visibleFolders = folders.filter((folder) => {
    if (!folderQuery) return true;
    if (folder.name?.toLowerCase().includes(folderQuery)) return true;
    return (folder.contacts || []).some((c) =>
      [c.name, c.email, c.phone, c.company?.name].some((f) =>
        f?.toLowerCase().includes(folderQuery),
      ),
    );
  });

  return (
    <div className="bg-white overflow-hidden h-full min-h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Contact Folders</h2>
          <p className="text-sm text-gray-500">
            Organize contacts into custom folders
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
          <ExpandableSearch
            value={folderSearchTerm}
            onChange={setFolderSearchTerm}
            placeholder="Search by folder, contact name, email, or company..."
          />

          {/* Folder / List toggle — same pill as the Deals List/Kanban toggle */}
          <div className="relative flex items-center bg-[#F1F1F5] gap-1.5 rounded-full p-1 flex-shrink-0 overflow-hidden">
            <span
              className="absolute top-1 w-8 h-8 rounded-full bg-white shadow-sm transition-all duration-300 ease-out pointer-events-none"
              style={{ left: viewMode === "list" ? 36 : 4 }}
            />
            <button
              onClick={() => setViewMode("folder")}
              className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-full transition-colors ${viewMode === "folder" ? "text-blue-600" : "text-gray-500 hover:text-gray-700"}`}
              title="Folder View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-full transition-colors ${viewMode === "list" ? "text-blue-600" : "text-gray-500 hover:text-gray-700"}`}
              title="List View"
            >
              <ListIcon className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="inline-flex items-center justify-center gap-2 h-10 px-4 bg-[#0085FF] text-white text-sm font-medium rounded-full hover:bg-blue-600 focus:outline-none transition-colors flex-shrink-0"
          >
            <PlusIcon className="w-4 h-4" />
            New Folder
          </button>
        </div>
      </div>

      <div className="p-6 flex-1 min-h-0 overflow-y-auto">
        {/* Create Folder Form */}
        {showCreateForm && (
          <div className="bg-blue-50/50 rounded-xl p-4 mb-6 border border-blue-100 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-blue-900 text-sm">
                New Folder
              </h3>
              <button
                onClick={() => setShowCreateForm(false)}
                className="text-blue-400 hover:text-blue-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 px-3 py-2 border border-blue-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                placeholder="Folder Name..."
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && createFolder()}
                autoFocus
              />
              <button
                onClick={createFolder}
                disabled={creatingFolder}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <PlusIcon className="w-4 h-4" />
                {creatingFolder ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        )}

        {/* View Content */}
        {viewMode === "folder" ? (
          <div className="space-y-6">
            {/* Folder Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {visibleFolders.map((folder) => (
                <div
                  key={folder._id}
                  onClick={() =>
                    setSelectedFolderId(
                      folder._id === selectedFolderId ? null : folder._id,
                    )
                  }
                  className={`
                    group relative p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col items-center text-center gap-3 animate-in fade-in zoom-in-95 duration-300
                    ${
                      selectedFolderId === folder._id
                        ? "border-blue-500 bg-blue-50/30"
                        : "border-transparent hover:bg-gray-50"
                    }
                  `}
                >
                  <div
                    className={`transition-transform duration-200 ${selectedFolderId === folder._id ? "scale-110" : "group-hover:scale-105"}`}
                  >
                    <FolderIcon
                      className={`w-16 h-16 ${selectedFolderId === folder._id ? "fill-blue-400 text-blue-500" : "fill-blue-300/50 text-blue-400"}`}
                      strokeWidth={1.5}
                    />
                  </div>
                  <div className="w-full">
                    <h3
                      className={`font-semibold text-sm truncate px-2 ${selectedFolderId === folder._id ? "text-blue-700" : "text-gray-700"}`}
                    >
                      {folder.name}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {folder.contacts?.length || 0} Contacts
                    </p>
                  </div>

                  {/* Hover Actions */}
                  <div
                    className={`absolute top-2 right-2 flex gap-1 ${selectedFolderId === folder._id ? "opacity-100" : "opacity-0 group-hover:opacity-100"} transition-opacity`}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startEdit(folder);
                      }}
                      className="p-1.5 bg-white rounded-full shadow-sm text-gray-400 hover:text-blue-600 hover:scale-110 transition-all"
                    >
                      <EditIcon className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteFolder(folder._id);
                      }}
                      className="p-1.5 bg-white rounded-full shadow-sm text-gray-400 hover:text-red-600 hover:scale-110 transition-all"
                    >
                      <DeleteIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Selected Folder Content */}
            {selectedFolderId && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="flex items-center justify-between mb-4 mt-8 px-2">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <FolderIcon className="w-5 h-5 fill-blue-400 text-blue-500" />
                    {folders.find((f) => f._id === selectedFolderId)?.name}
                    <span className="text-gray-400 font-normal text-sm">
                      (
                      {folders.find((f) => f._id === selectedFolderId)?.contacts
                        ?.length || 0}{" "}
                      contacts)
                    </span>
                  </h3>
                </div>
                <ContactsTable
                  contacts={
                    folders.find((f) => f._id === selectedFolderId)?.contacts ||
                    []
                  }
                  openDropdownId={openDropdownId}
                  setOpenDropdownId={setOpenDropdownId}
                  onStatusUpdate={async (contactId, lifecycleStage, status) => {
                    try {
                      await API.put(`/contacts/${contactId}`, {
                        lifecycleStage,
                        stageStatus: status,
                      });
                      toast.success("Status updated");
                      fetchFolders();
                    } catch (err) {
                      if (err.response?.status === 402) {
                        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
                      } else {
                        toast.error(err.response?.data?.error || "Update failed");
                      }
                    }
                  }}
                />
              </div>
            )}

            {!selectedFolderId && visibleFolders.length > 0 && (
              <div className="text-center py-12 border-t border-gray-100 mt-8">
                <p className="text-gray-400 text-sm">
                  Select a folder to view its contacts
                </p>
              </div>
            )}
          </div>
        ) : (
          /* List View */
          <div className="space-y-4">
            {visibleFolders.map((folder) => (
              <div
                key={folder._id}
                className="border border-gray-200 rounded-lg overflow-hidden bg-white"
              >
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => toggleFolder(folder._id)}
                >
                  <div className="flex items-center gap-3">
                    {openFolderIds.includes(folder._id) ? (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    )}
                    <span className="font-semibold text-gray-700">
                      {folder.name}
                    </span>
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                      {folder.contacts?.length || 0}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startEdit(folder);
                      }}
                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                    >
                      <EditIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteFolder(folder._id);
                      }}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <DeleteIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {openFolderIds.includes(folder._id) && (
                  <div className="border-t border-gray-100 p-4 bg-gray-50/50">
                    <ContactsTable
                      contacts={folder.contacts || []}
                      openDropdownId={openDropdownId}
                      setOpenDropdownId={setOpenDropdownId}
                      onStatusUpdate={async (contactId, lifecycleStage, status) => {
                        try {
                          await API.put(`/contacts/${contactId}`, {
                            lifecycleStage,
                            stageStatus: status,
                          });
                          toast.success("Status updated");
                          fetchFolders();
                        } catch (err) {
                          toast.error("Update failed");
                        }
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {folders.length > 0 && visibleFolders.length === 0 && (
          <div className="text-center py-20 text-gray-500 text-sm">
            No folders match your search
          </div>
        )}

        {folders?.length === 0 && (
          <div className="text-center py-20">
            <div className="bg-gray-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
              <FolderIcon className="w-10 h-10 text-gray-300" />
            </div>
            <h3 className="text-lg font-medium text-gray-900">
              No folders yet
            </h3>
            <p className="text-gray-500 mt-2 max-w-sm mx-auto">
              Create a folder to start organizing your contacts into lists.
            </p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
            >
              Create Folder
            </button>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingFolder && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-[1000] p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[95vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-900">
                Edit Folder
              </h3>
              <button
                onClick={() => setEditingFolder(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content - ✅ ADDED pb-48 HERE to allow scrolling to see the dropdown */}
            <div className="p-6 flex-1 overflow-y-auto pb-32">
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Folder Name
                </label>
                <input
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                />
              </div>

              {/* Selected Contacts */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Selected Contacts{" "}
                  <span className="text-gray-400 font-normal">
                    ({selectedContacts.length})
                  </span>
                </label>
                <div className="flex flex-wrap gap-2 p-4 bg-gray-50 rounded-xl border border-gray-100 min-h-[60px]">
                  {selectedContacts.length === 0 ? (
                    <span className="text-sm text-gray-400 italic">
                      No contacts selected
                    </span>
                  ) : (
                    selectedContacts.map((contact) => (
                      <span
                        key={contact._id}
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-gray-200 text-gray-700 rounded-full text-sm shadow-sm"
                      >
                        <span className="truncate max-w-[150px]">
                          {contact.name || contact.email || "Unknown"}
                        </span>
                        <button
                          onClick={() => removeSelectedContact(contact._id)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* Contact Search */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Add Contacts
                </label>
                <div className="relative" ref={dropdownRef}>
                  <div className="relative">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#525866]" />
                    <input
                      ref={searchInputRef}
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="Search across all contacts..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onFocus={() => setIsDropdownOpen(true)}
                    />
                  </div>

                  {/* ✅ CHANGED max-h-60 to max-h-[400px] here! */}
                  {isDropdownOpen && (
                    <div className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-xl max-h-[400px] overflow-y-auto">
                      {filteredContacts.length > 0 ? (
                        filteredContacts.map((contact) => {
                          const isSelected = selectedContacts.some(
                            (c) => c._id === contact._id,
                          );
                          return (
                            <button
                              key={contact._id}
                              onClick={() => {
                                toggleContact(contact);
                              }}
                              className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0 flex items-center justify-between group"
                            >
                              <div>
                                <div
                                  className={`font-medium ${isSelected ? "text-blue-600" : "text-gray-900"}`}
                                >
                                  {contact.name || "Unnamed"}
                                </div>
                                <div className="text-xs text-gray-500 mt-0.5">
                                  {contact.email || contact.phone || ""}
                                </div>
                              </div>
                              {isSelected && (
                                <Check className="w-4 h-4 text-blue-600" />
                              )}
                            </button>
                          );
                        })
                      ) : (
                        <div className="p-4 text-center text-gray-500 text-sm">
                          {searchTerm
                            ? "No contacts found"
                            : "Start typing to search..."}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3 flex-shrink-0">
              <button
                onClick={() => setEditingFolder(null)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg font-medium text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={!editingName?.trim()}
                className={`px-6 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm transition-colors shadow-sm ${!editingName?.trim() ? "opacity-60 cursor-not-allowed" : "hover:bg-blue-700"}`}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper Table Component
const ContactsTable = ({
  contacts,
  openDropdownId,
  setOpenDropdownId,
  onStatusUpdate,
}) => {
  if (!contacts || contacts.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 bg-white rounded-lg border border-dashed border-gray-300">
        <p>No contacts in this folder</p>
      </div>
    );
  }

  return (
    <div className="overflow-visible border border-gray-200 rounded-lg bg-white shadow-sm">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-r border-gray-200">
              Contact Name
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-r border-gray-200">
              Company
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-r border-gray-200">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-r border-gray-200">
              Email
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Phone
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {contacts.map((contact) => (
            <tr
              key={contact._id}
              className="hover:bg-gray-50 transition-colors group"
            >
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-gray-100">
                <Link
                  to={`/contacts/${contact._id}`}
                  className="hover:text-blue-600"
                >
                  {contact.name || "—"}
                </Link>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 border-r border-gray-100">
                {contact.company?.name || "—"}
              </td>
              <td className="px-6 py-4 whitespace-nowrap border-r border-gray-100">
                <StatusDropdown
                  contact={contact}
                  onUpdate={onStatusUpdate}
                  isOpen={openDropdownId === contact._id}
                  onToggle={setOpenDropdownId}
                />
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 border-r border-gray-100">
                {contact.email || "—"}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                {contact.phone || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ContactFolder;
