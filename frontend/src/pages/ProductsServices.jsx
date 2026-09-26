import DeleteIcon from "../components/common/DeleteIcon";
import EmptyState from "../components/common/EmptyState";
import VideoIcon from "../components/common/VideoIcon";
import Checkbox from "../components/common/Checkbox";
import PlusIcon from "../components/common/PlusIcon";
import MoreIcon from "../components/common/MoreIcon";
import DownloadIcon from "../components/common/DownloadIcon";
import React, { useEffect, useState, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import API from "../services/api";
import {
  X,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Boxes,
  CheckSquare,
  EyeOff,
  Package,
  Pin,
  PinOff,
  SlidersHorizontal,
  ArrowUp, ArrowDown } from "lucide-react";
import toast from "react-hot-toast";
import BulkActions from "../components/BulkActions";
import BulkDeleteModal from "../components/common/BulkDeleteModal";
import ItemForm from "../components/item/ItemForm";
import QuickItemDrawer from "../components/item/QuickItemDrawer";
import ImportItems from "../components/item/ImportItems";
import ExportModal from "../components/common/ExportModal";
import { exportClientSide, formatINR } from "../utils/clientExport";
import ColumnSettingsPanel from "../components/ColumnSettingsPanel";
import { useColumnSettings } from "../hooks/useColumnSettings";
import { getPinnedBoundaryOverlayStyle } from "../utils/pinnedColumnShadow";
import HighlightText from "../components/common/HighlightText";
import useSearchOverlayOpen from "../hooks/useSearchOverlayOpen";
import useBodyScrollLock from "../hooks/useBodyScrollLock";
import "react-quill/dist/quill.snow.css";
import VideoTutorialModal from "../components/VideoTutorialModal";
import { getVideoTutorial } from "../utils/videoTutorials";
import AppToaster from "../components/AppToaster";
import { useTopLoadingSignal } from "../components/common/TopLoadingBar";
import Skeleton from "../components/common/Skeleton";
import TableSkeletonRows from "../components/common/TableSkeletonRows";
import { formatNumberFixed } from "../utils/numberFormatter";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";

import SearchIcon from "../components/common/SearchIcon";
import FilterIcon from "../components/common/FilterIcon";
import AdvancedFilterPanel from "../components/common/AdvancedFilterPanel";
import UploadIcon from "../components/common/UploadIcon";
import EyeIcon from "../components/common/EyeIcon";
import EditIcon from "../components/common/EditIcon";

// The app is rendered inside #root which carries a CSS `zoom` (0.75 on desktop).
// getBoundingClientRect() returns UNSCALED layout coordinates, while portal overlays
// mounted on document.body render in visual (un-zoomed) space and mouse clientX/Y are
// visual too. So any rect-derived position/size fed to a body-portal must be divided
// by this ancestor zoom factor to line up on screen. (Same helper as Companies.jsx.)
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

const ViewDetails = ({ item, onRequestClose, onEdit, onDelete }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [shouldRender, setShouldRender] = useState(true);
  useBodyScrollLock(shouldRender);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [selectedImageIndex, setSelectedImageIndex] = useState(null);

  useEffect(() => {
    setShouldRender(true);
    setTimeout(() => setIsOpen(true), 10);
    if (item.images && item.images.length > 0) {
      setImagePreviews(
        item.images.map((img) => img.startsWith("http") ? img : `${import.meta.env.VITE_APP_API_URL}${img}`),
      );
    } else {
      setImagePreviews([]);
    }
    return () => {
      setIsOpen(false);
      setImagePreviews([]);
    };
  }, [item]);

  const handleClose = () => {
    setIsOpen(false);
    setTimeout(() => {
      onRequestClose();
    }, 300);
  };

  const formatCurrency = (amount) => {
    if (!amount) return "₹0.00";
    return `₹${formatNumberFixed(parseFloat(amount))}`;
  };

  if (!shouldRender) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[10000] transition-opacity duration-300"
        style={{ opacity: isOpen ? 1 : 0 }}
        onClick={handleClose}
      />
      <div
        className={`fixed dc-panel-card dc-panel-w z-[10001] bg-white shadow-2xl flex flex-col overflow-hidden transform transition-transform duration-300 ease-out ${isOpen ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — matches the quick-drawer header spec, with the
            id-style Edit/Delete/Close row TaskDetailsModal/CallLogDetailView use. */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#D9D9D9] flex-shrink-0 bg-white gap-1">
          <h2 className="text-[15px] font-normal leading-6 text-[#78788D] uppercase tracking-wide">
            Item Details
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onEdit}
              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
              title="Edit"
            >
              <EditIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="p-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
              title="Delete"
            >
              <DeleteIcon className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-gray-300 mx-1"></div>
            <button
              type="button"
              onClick={handleClose}
              title="Close"
              className="w-5 h-5 flex items-center justify-center text-[#1C1B1F] hover:opacity-70 transition-opacity"
              aria-label="Close"
            >
              <X className="w-[18px] h-[18px]" strokeWidth={2} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar">
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-900 mb-3 font-inter">
              Variants
            </h3>
            {item.variants && item.variants.length > 0 ? (
              <div className="space-y-2">
                {item.variants.map((variant, index) => (
                  <div
                    key={index}
                    className="p-3 bg-gray-50 rounded-lg border border-gray-100"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-medium text-gray-900 font-inter">
                          {variant.name}
                        </p>
                        <p className="text-xs text-gray-500 font-inter mt-0.5">
                          SKU: {variant.sku || "N/A"}
                        </p>
                        <p className="text-xs text-gray-500 font-inter mt-0.5">
                          {Object.entries(variant.attributes || {})
                            .map(([key, value]) => `${key}: ${value}`)
                            .join(", ")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900 font-inter">
                          {formatCurrency(variant.sellingPrice)}
                        </p>
                        <p className="text-xs text-gray-500 font-inter mt-0.5">
                          Stock: {variant.stock}
                        </p>
                        <span
                          className={`inline-flex mt-1 px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold border ${variant.isActive ? "bg-green-50 text-green-700 border-green-100" : "bg-gray-50 text-gray-600 border-gray-200"}`}
                        >
                          {variant.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                <p className="text-sm text-gray-500 font-inter">
                  No variants configured
                </p>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1 font-inter">
                  Type
                </label>
                <span
                  className={`px-2 py-1 rounded text-xs font-semibold uppercase ${item.type === "product"
                    ? "bg-blue-50 text-blue-700 border border-blue-100"
                    : "bg-purple-50 text-purple-700 border border-purple-100"
                    }`}
                >
                  {item.type}
                </span>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1 font-inter">
                  Status
                </label>
                <span
                  className={`px-2 py-1 rounded text-xs font-semibold uppercase ${item.isActive
                    ? "bg-green-50 text-green-700 border border-green-100"
                    : "bg-red-50 text-red-700 border border-red-100"
                    }`}
                >
                  {item.isActive ? "Active" : "Inactive"}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1 font-inter">
                Item Name
              </label>
              <p className="text-sm text-gray-900 font-inter font-medium bg-gray-50 p-2 rounded-lg border border-gray-100">
                {item.name}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1 font-inter">
                Description
              </label>
              {item.description ? (
                <div
                  className="ql-editor p-3 bg-gray-50 rounded-lg text-sm text-gray-900 font-inter border border-gray-100"
                  dangerouslySetInnerHTML={{
                    __html: item.description,
                  }}
                />
              ) : (
                <p className="text-sm text-gray-400 italic">
                  No description provided
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1 font-inter">
                  Purchase Price
                </label>
                <div className="text-sm text-gray-900 font-inter font-semibold bg-gray-50 p-2 rounded-lg border border-gray-100">
                  {formatCurrency(item.purchasePrice)}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1 font-inter">
                  Selling Price
                </label>
                <div className="text-sm text-gray-900 font-inter font-semibold bg-gray-50 p-2 rounded-lg border border-gray-100">
                  {formatCurrency(item.sellingPrice)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1 font-inter">
                  Tax Inclusive
                </label>
                <p className="text-sm text-gray-900 font-inter">
                  {item.taxInclusive ? "Yes" : "No"}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1 font-inter">
                  HSN/SAC
                </label>
                <p className="text-sm text-gray-900 font-inter">
                  {item.hsnSac || "N/A"}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1 font-inter">
                  Category
                </label>
                <p className="text-sm text-gray-900 font-inter">
                  {item.category || "N/A"}
                </p>
              </div>
            </div>

            {imagePreviews.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1 font-inter">
                  Images
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {imagePreviews.map((preview, index) => (
                    <img
                      key={index}
                      src={preview}
                      alt={`Image ${index + 1}`}
                      className="w-full h-24 object-cover rounded-lg border border-gray-200 cursor-pointer"
                      onClick={() => setSelectedImageIndex(index)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fullscreen Image Preview */}
      {selectedImageIndex !== null && (
        <div 
          className="fixed inset-0 z-[10005] bg-black/90 flex items-center justify-center"
          onClick={() => setSelectedImageIndex(null)}
        >
          <button 
            className="absolute top-4 right-4 text-white hover:text-gray-300 p-2"
            onClick={() => setSelectedImageIndex(null)}
          >
            <X size={24} />
          </button>
          <img 
              src={imagePreviews[selectedImageIndex]} 
              alt="Zoomed product preview" 
              className="max-w-full max-h-[90vh] object-contain"
              onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
};

function ProductsServices() {
  const isSearchOverlayOpen = useSearchOverlayOpen();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({
    type: "product",
    name: "",
    description: "",
    purchasePrice: 0,
    sellingPrice: 0,
    taxInclusive: true,
    purchaseTaxInclusive: true,
    gstRate: 0,
    hsnSac: "",
    barcode: "",
    category: "",
    primaryUnit: "OTH OTHERS",
    images: [],
    isActive: true,
    variants: [],
    discount: { type: "percentage", value: 0 },
    maxDiscountPercent: "",
    // Starting stock for a new product. Only these are ever sent from this form — after creation
    // the live stock level is owned by the Inventory module's ledger and can only change via
    // Stock In / Stock Out.
    inventory: { openingStock: 0, lowStockThreshold: 0 },
  });
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const truncateText = (text, maxLength = 30) => {
    if (!text) return "—";
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  // filterType removed — type filtering now done via AdvancedFilterPanel rule builder.
  const [showForm, setShowForm] = useState(false);
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  const selectedItemsSet = useMemo(() => new Set(selectedItems), [selectedItems]);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const searchInputRef = useRef(null);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [activeFilters, setActiveFilters] = useState([]);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const tableScrollRef = useRef(null);
  // Client-side Excel/PDF export — same "no selection required, export what
  // you're currently looking at" flow as Deals.jsx, instead of the
  // selection-gated backend ExportModal.
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportButtonRef = useRef(null);

  // Double-click-to-type a page number in the pagination bar (mirrors Companies.jsx).
  const [editingPage, setEditingPage] = useState(false);
  const [pageInput, setPageInput] = useState("");

  // Selection mode + first-load skeleton, same reasoning as Companies.jsx / the
  // purchase pages: once the page has loaded once, a search/filter that narrows
  // results to zero must NOT re-skeleton the toolbar.
  const [selectionMode, setSelectionMode] = useState(true);
  const hasLoadedOnceRef = useRef(false);
  const showLoadingSkeleton = loading && items.length === 0 && !hasLoadedOnceRef.current;
  // Signal the top progress bar on EVERY fetch, not just the skeleton case —
  // same as Companies.jsx.
  useTopLoadingSignal(loading);

  // Delays the bulk-strip's unmount so it can play the slide-out-right exit
  // animation on deselect (mirrors Companies.jsx / the purchase pages).
  const [showBulkStrip, setShowBulkStrip] = useState(false);
  const [bulkStripClosing, setBulkStripClosing] = useState(false);
  useEffect(() => {
    const active = selectionMode && selectedItems.length > 0;
    if (active) {
      setBulkStripClosing(false);
      setShowBulkStrip(true);
    } else if (showBulkStrip) {
      setBulkStripClosing(true);
      const t = setTimeout(() => {
        setShowBulkStrip(false);
        setBulkStripClosing(false);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [selectionMode, selectedItems.length]);

  // Video Tutorial
  const [showVideoTutorial, setShowVideoTutorial] = useState(false);

  // Row actions (⋮) menu — portaled to document.body, viewport-aware, same
  // pattern as Companies.jsx.
  const [openRowActionsId, setOpenRowActionsId] = useState(null);
  const [rowActionsPos, setRowActionsPos] = useState(null);
  const rowActionsRef = useRef(null);

  // Column header menu (Pin/Sort/Hide) — also portaled.
  const [openColumnMenuKey, setOpenColumnMenuKey] = useState(null);
  const [columnMenuPos, setColumnMenuPos] = useState(null);
  const columnMenuRef = useRef(null);

  // Pinned columns: [{ key, side: 'left' | 'right' }]
  const [pinnedColumns, setPinnedColumns] = useState([]);
  const pinColumnToSide = (colKey, side) => {
    setPinnedColumns((prev) => [...prev.filter((p) => p.key !== colKey), { key: colKey, side }]);
  };
  const unpinColumn = (colKey) => {
    setPinnedColumns((prev) => prev.filter((p) => p.key !== colKey));
  };
  const getColumnPinSide = (colKey) => pinnedColumns.find((p) => p.key === colKey)?.side || null;

  // Column drag-to-reorder state.
  const [columnSizing, setColumnSizing] = useState({});
  const [draggedColKey, setDraggedColKey] = useState(null);
  const [dragOverColKey, setDragOverColKey] = useState(null);
  const [dragGhost, setDragGhost] = useState(null);
  const dragOverRef = useRef(null);
  const ghostElRef = useRef(null);

  // Pagination state
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 0,
    totalCount: 0,
    limit: 50,
    hasNextPage: false,
    hasPrevPage: false,
  });

  // Sorting state
  const [sortConfig, setSortConfig] = useState({
    key: null,
    direction: null,
  });

  // Distinct categories across the whole organization. The filter panel's fallback scans
  // only the rows it's handed, and `items` holds just the current server-fetched page — so
  // without this the Category dropdown would list only the categories that happen to appear
  // on the page you're looking at. /items/categories returns them org-wide.
  const [categoryOptions, setCategoryOptions] = useState([]);
  useEffect(() => {
    API.get("/items/categories")
      .then((res) => setCategoryOptions(Array.isArray(res.data) ? res.data : []))
      .catch(() => setCategoryOptions([]));
  }, []);

  // Columns available in the rule-builder filter panel (mirrors Companies.jsx pattern).
  const itemFilterColumns = [
    { key: "name", label: "Item Name" },
    { key: "type", label: "Type", options: ["product", "service"] },
    { key: "category", label: "Category", options: categoryOptions },
    { key: "sellingPrice", label: "Selling Price" },
    { key: "purchasePrice", label: "Purchase Price" },
    { key: "gstRate", label: "GST Rate" },
    { key: "hsnSac", label: "HSN/SAC" },
    { key: "description", label: "Description" },
  ];

  // Feeds AdvancedFilterPanel's Value dropdown for columns with no fixed `options` list.
  // Must return the RAW field value, not a display-formatted one: filteredItems matches
  // against raw `row[f.column]`, so an option of "₹1,200.00" would never match 1200.
  const getItemFieldValue = (item, key) => item[key];

  // Click-outside handling for the overflow (⋮) menu.
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target)) {
        setIsMoreMenuOpen(false);
      }
      if (exportButtonRef.current && !exportButtonRef.current.contains(event.target)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close the overflow menu on scroll — it's absolutely positioned off its
  // own button, so a scroll that moves that button would otherwise leave
  // it floating detached from its anchor.
  useEffect(() => {
    if (!isMoreMenuOpen) return;
    const handleScroll = () => setIsMoreMenuOpen(false);
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, [isMoreMenuOpen]);

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const handleSelectAll = () => {
    if (selectedItems.length === items.length && items.length > 0) {
      setSelectedItems([]);
    } else {
      setSelectedItems(items.map((i) => i._id));
    }
  };

  const handleSelectItem = (itemId) => {
    setSelectedItems((prev) =>
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId],
    );
  };

  const exitSelectionMode = () => {
    setSelectionMode(true);
    setSelectedItems([]);
    setShowBulkActions(false);
  };

  // "Select All" grabs every item ID matching the current search/filter
  // straight from the database (not just the loaded page). "Deselect All" is
  // its counterpart: it doesn't clear the selection outright (that's what
  // "Cancel" does) — it steps back down to only the rows on the current
  // page. Same pattern as Companies.jsx.
  const handleSelectAllAcrossPages = async () => {
    try {
      const params = new URLSearchParams({ allIds: "true" });
      if (debouncedSearchTerm.trim()) params.append("search", debouncedSearchTerm.trim());
      const res = await API.get(`/items/pagination?${params.toString()}`);
      setSelectedItems(res.data.ids || []);
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to select all rows");
    }
  };

  const handleDeselectAllExtra = () => {
    setSelectedItems(items.map((i) => i._id));
  };

  // Column list handed to the shared ExportModal — same shape Vendors/Companies use.
  const exportColumns = [
    { key: "name", label: "Name" },
    { key: "type", label: "Type" },
    { key: "description", label: "Description" },
    { key: "category", label: "Category" },
    { key: "purchasePrice", label: "Purchase Price" },
    { key: "sellingPrice", label: "Selling Price" },
    { key: "gstRate", label: "GST Rate" },
    { key: "hsnSac", label: "HSN/SAC" },
    { key: "barcode", label: "Barcode" },
    { key: "primaryUnit", label: "Unit" },
    { key: "variants", label: "Variants" },
    { key: "isActive", label: "Status" },
  ];

  // Reset to page 1 when search/filter changes
  const skipInitialReset = useRef(true);
  useEffect(() => {
    if (skipInitialReset.current) {
      skipInitialReset.current = false;
      return;
    }
    setPagination((prev) => ({ ...prev, currentPage: 1 }));
    exitSelectionMode();
  }, [debouncedSearchTerm]);

  // Fetch data
  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pagination.currentPage,
    pagination.limit,
    sortConfig,
    debouncedSearchTerm,
  ]);

  const fetchItems = async () => {
    try {
      setLoading(true);

      const params = new URLSearchParams({
        page: pagination.currentPage.toString(),
        limit: pagination.limit.toString(),
      });
      if (sortConfig.key) {
        params.append("sortBy", sortConfig.key);
        params.append("sortOrder", sortConfig.direction || "asc");
      } else {
        params.append("sortBy", "createdAt");
        params.append("sortOrder", "desc");
      }

      if (debouncedSearchTerm.trim()) {
        params.append("search", debouncedSearchTerm.trim());
      }

      const res = await API.get(`/items/pagination?${params.toString()}`);

      if (res.data.items) {
        setItems(res.data.items);
        setPagination((prev) => ({
          ...prev,
          ...res.data.pagination,
        }));
      } else {
        setItems([]);
      }
      hasLoadedOnceRef.current = true;
    } catch {
      toast.error("Failed to load items");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (itemId) => {
    setItemToDelete(itemId);
    setShowDeleteModal(true);
  };

  // Client-side export — mirrors Deals.jsx's handleExport: confirm, then
  // Excel (CSV via window.XLSX) or PDF (window.jspdf + autoTable), against
  // whatever's currently filtered/visible rather than a manual selection.
  const EXPORT_COLUMNS = [
    { label: "Name", value: (item) => item.name },
    { label: "Category", value: (item) => item.category },
    { label: "Purchase Price", value: (item) => getVariantPriceDisplay(item, "purchasePrice") || formatINR(item.purchasePrice) },
    { label: "Selling Price", value: (item) => getVariantPriceDisplay(item, "sellingPrice") || formatINR(item.sellingPrice) },
    { label: "Status", value: (item) => (item.isActive ? "Active" : "Inactive") },
  ];

  const handleExport = (format) => {
    if (!window.confirm(`Do you want to export in ${format}?`)) return;
    exportClientSide(format, {
      rows: filteredItems,
      columns: EXPORT_COLUMNS,
      fileNamePrefix: "products_export",
      title: "Products & Services Report",
    });
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    const loadingToast = toast.loading("Deleting item...");
    try {
      await API.delete(`/items/${itemToDelete}`);
      await fetchItems();
      toast.success("Item deleted successfully", { id: loadingToast });
      exitSelectionMode();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete item", {
        id: loadingToast,
      });
    } finally {
      setShowDeleteModal(false);
      setItemToDelete(null);
    }
  };

  const handleBulkDeleteItems = async (itemIds) => {
    setBulkLoading(true);
    try {
      await Promise.all(itemIds.map((id) => API.delete(`/items/${id}`)));
      await fetchItems();
      toast.success(`Successfully deleted ${itemIds.length} items`);
      exitSelectionMode();
    } catch (err) {
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || "Bulk delete failed");
      }
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkUpdateItems = async ({ field, value, itemIds }) => {
    setBulkLoading(true);
    try {
      await Promise.all(
        itemIds.map((id) => API.put(`/items/${id}`, { [field]: value })),
      );
      await fetchItems();
      toast.success(`Successfully updated ${itemIds.length} items`);
      exitSelectionMode();
    } catch (err) {
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || "Bulk update failed");
      }
    } finally {
      setBulkLoading(false);
    }
  };

  const itemFieldConfig = {
    fields: [
      { key: "isActive", label: "Status", type: "boolean" },
      {
        key: "type",
        label: "Type",
        type: "select",
        options: ["product", "service"],
      },
    ],
  };

  const handleEditItem = (item) => {
    setForm({
      _id: item._id,
      type: item.type || "product",
      name: item.name || "",
      description: item.description || "",
      purchasePrice: item.purchasePrice || 0,
      sellingPrice: item.sellingPrice || 0,
      taxInclusive: item.taxInclusive !== undefined ? item.taxInclusive : true,
      // Items saved before purchaseTaxInclusive existed have none: show the selling price's
      // basis, which is what purchase documents have used for them all along.
      purchaseTaxInclusive:
        item.purchaseTaxInclusive !== undefined && item.purchaseTaxInclusive !== null
          ? item.purchaseTaxInclusive
          : item.taxInclusive !== undefined ? item.taxInclusive : true,
      gstRate: item.gstRate || 0,
      hsnSac: item.hsnSac || "",
      barcode: item.barcode || "",
      category: item.category || "",
      primaryUnit: item.primaryUnit || "OTH OTHERS",
      images: item.images || [],
      // Custom item-field values. Without this the Edit form opened with every custom field
      // empty, and saving sent that empty list back — erasing the stored values.
      additionalFields: item.additionalFields || [],
      isActive: item.isActive !== undefined ? item.isActive : true,
      variants: item.variants || [],
      discount: item.discount || { type: "percentage", value: 0 },
      maxDiscountPercent: item.maxDiscountPercent ?? "",
      inventory: {
        // Shown read-only while editing (stock moves via Stock In / Stock Out), so this shows
        // the LIVE stock rather than the original opening figure.
        openingStock: item.inventory?.currentStock ?? 0,
        lowStockThreshold: item.inventory?.lowStockThreshold ?? 0,
      },
    });
    setShowForm(true);
  };

  const handlePageChange = (newPage) => {
    if (
      newPage >= 1 &&
      newPage <= pagination.totalPages &&
      newPage !== pagination.currentPage
    ) {
      setPagination((prev) => ({ ...prev, currentPage: newPage }));
    }
  };

  const handleLimitChange = (newLimit) => {
    setPagination((prev) => ({ ...prev, limit: newLimit, currentPage: 1 }));
  };

  // ---------------------------------------------------------------------
  // Column model — same generic pin/reorder/visibility system as Companies.jsx,
  // persisted per-module under the "productsServices" key.
  // ---------------------------------------------------------------------
  const defaultColumns = useMemo(
    () => [
      {
        key: "name",
        label: "Item Name",
        visible: true,
        order: 0,
        required: true,
        sortable: true,
        sortKey: "name",
      },
      {
        key: "type",
        label: "Type",
        visible: true,
        order: 1,
        sortable: true,
        sortKey: "type",
      },
      {
        key: "category",
        label: "Category",
        visible: true,
        order: 2,
        sortable: true,
        sortKey: "category",
      },
      {
        key: "purchasePrice",
        label: "Purchase Price",
        visible: true,
        order: 3,
        sortable: true,
        sortKey: "purchasePrice",
      },
      {
        key: "sellingPrice",
        label: "Selling Price",
        visible: true,
        order: 4,
        sortable: true,
        sortKey: "sellingPrice",
      },
      {
        key: "hsnSac",
        label: "HSN/SAC",
        visible: true,
        order: 5,
        sortable: true,
        sortKey: "hsnSac",
      },
      {
        key: "variants",
        label: "Variants",
        visible: true,
        order: 6,
        sortable: false,
      },
      {
        key: "isActive",
        label: "Status",
        visible: true,
        order: 7,
        sortable: true,
        sortKey: "isActive",
      },
    ],
    [],
  );

  const { columns, saveColumns, getVisibleColumns } = useColumnSettings(
    "productsServices",
    defaultColumns,
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const visibleColumns = useMemo(() => getVisibleColumns(), [columns]);

  // An item's own purchasePrice/sellingPrice stay 0 once it has variants —
  // pricing lives on each variant instead (see models/Item.js). Show the
  // variant's price(s) in the list instead of the parent's zeroed fields:
  // a single number when every variant shares one price (the common case,
  // e.g. one variant per item), a min–max range when they differ.
  const getVariantPriceDisplay = (item, field) => {
    if (!item.variants || item.variants.length === 0) return null;
    const values = item.variants.map((v) => Number(v[field]) || 0);
    const min = Math.min(...values);
    const max = Math.max(...values);
    return min === max
      ? `₹${formatNumberFixed(min)}`
      : `₹${formatNumberFixed(min)} - ₹${formatNumberFixed(max)}`;
  };

  const getFieldValue = (item, key) => {
    if (key === "name") return item.name || "";
    if (key === "type") return item.type || "";
    if (key === "category") return item.category || "";
    if (key === "purchasePrice") return getVariantPriceDisplay(item, "purchasePrice") || `₹${formatNumberFixed(item.purchasePrice ?? 0)}`;
    if (key === "sellingPrice") return getVariantPriceDisplay(item, "sellingPrice") || `₹${formatNumberFixed(item.sellingPrice ?? 0)}`;
    if (key === "hsnSac") return item.hsnSac || "";
    if (key === "variants") return item.variants?.length ? `${item.variants.length} Variant${item.variants.length > 1 ? "s" : ""}` : "0 Variants";
    if (key === "isActive") return item.isActive ? "Active" : "In-Active";
    return "";
  };

  const startColumnDrag = (e, colId) => {
    if (e.button !== 0) return;
    if (e.target.closest("button") || e.target.closest("[data-resize-handle]")) return;

    const th = e.currentTarget;
    const startX = e.clientX;
    const startY = e.clientY;
    const DRAG_THRESHOLD = 5;

    const dragState = { started: false, offsetX: 0, offsetY: 0, zGhost: 1 };

    const positionGhost = (clientX, clientY) => {
      const el = ghostElRef.current;
      if (!el) return;
      const visualTop = clientY - dragState.offsetY;
      const visualLeft = clientX - dragState.offsetX;
      el.style.top = `${visualTop / dragState.zGhost}px`;
      el.style.left = `${visualLeft / dragState.zGhost}px`;
      el.style.maxHeight = `${Math.max(100, window.innerHeight - visualTop - 72) / dragState.zGhost}px`;
    };

    const updateDragOver = (clientX, clientY) => {
      const elAtPoint = document.elementFromPoint(clientX, clientY);
      const thAtPoint = elAtPoint?.closest("th[data-col-id]");
      const overKey = thAtPoint?.getAttribute("data-col-id") || null;
      if (dragOverRef.current !== overKey) {
        dragOverRef.current = overKey;
        setDragOverColKey(overKey);
      }
    };

    const beginDrag = () => {
      dragState.started = true;
      window.getSelection?.()?.removeAllRanges();

      const rect = th.getBoundingClientRect();
      const label = visibleColumns.find((vc) => vc.key === colId)?.label || colId;
      const previewRows = items.map((it) => getFieldValue(it, colId) || "—");
      dragState.zGhost = getAncestorZoom(document.body);
      dragState.offsetX = startX - rect.left;
      dragState.offsetY = startY - rect.top;

      dragOverRef.current = null;
      setDraggedColKey(colId);
      setDragOverColKey(null);
      document.body.style.userSelect = "none";
      setDragGhost({
        label,
        previewRows,
        offsetX: dragState.offsetX,
        offsetY: dragState.offsetY,
        width: rect.width / dragState.zGhost,
        height: rect.height / dragState.zGhost,
      });

      requestAnimationFrame(() => positionGhost(startX, startY));
    };

    const handleMouseMove = (moveEvent) => {
      if (!dragState.started) {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        e.preventDefault();
        beginDrag();
      }
      positionGhost(moveEvent.clientX, moveEvent.clientY);
      updateDragOver(moveEvent.clientX, moveEvent.clientY);
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      if (!dragState.started) return;
      document.body.style.userSelect = "";
      const overKey = dragOverRef.current;
      if (overKey && overKey !== colId) {
        handleColumnReorder(colId, overKey);
      }
      dragOverRef.current = null;
      setDraggedColKey(null);
      setDragOverColKey(null);
      setDragGhost(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleColumnReorder = (draggedKey, targetKey) => {
    if (!draggedKey || draggedKey === targetKey) return;
    const sorted = [...columns].sort((a, b) => a.order - b.order);
    const visibleSorted = sorted.filter((c) => c.visible);
    const draggedIdx = visibleSorted.findIndex((c) => c.key === draggedKey);
    const targetIdx = visibleSorted.findIndex((c) => c.key === targetKey);
    if (draggedIdx === -1 || targetIdx === -1) return;

    const reorderedVisible = [...visibleSorted];
    const [moved] = reorderedVisible.splice(draggedIdx, 1);
    reorderedVisible.splice(targetIdx, 0, moved);

    let visibleCursor = 0;
    const newColumns = sorted
      .map((c) => (c.visible ? reorderedVisible[visibleCursor++] : c))
      .map((c, idx) => ({ ...c, order: idx }));

    saveColumns(newColumns);
  };

  const columnHelper = createColumnHelper();

  const renderRowActionsMenu = (item) => {
    const isOpen = openRowActionsId === item._id;
    return (
      <div
        className="relative flex-shrink-0"
        ref={isOpen ? rowActionsRef : null}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (isOpen) {
              setOpenRowActionsId(null);
              setRowActionsPos(null);
              return;
            }
            const zMenu = getAncestorZoom(document.body);
            const MENU_W = 160;
            const MARGIN = 8;
            // 3 items (View, Delete) + one divider + container padding.
            const MENU_H = 148;

            const rect = e.currentTarget.getBoundingClientRect();
            const viewportH = window.innerHeight / zMenu;
            const viewportW = window.innerWidth / zMenu;
            const top = rect.bottom / zMenu + 4;
            const bottomAnchor = rect.top / zMenu - 4;

            const openUp = viewportH - top < MENU_H + MARGIN;
            let calcTop = openUp ? bottomAnchor - MENU_H : top;
            calcTop = Math.max(MARGIN, Math.min(calcTop, viewportH - MENU_H - MARGIN));

            let calcLeft = rect.right / zMenu - MENU_W;
            calcLeft = Math.min(calcLeft, viewportW - MENU_W - MARGIN);
            calcLeft = Math.max(calcLeft, MARGIN);

            setRowActionsPos({ top: calcTop, left: calcLeft });
            setOpenRowActionsId(item._id);
          }}
          className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
          title="More actions"
        >
          <MoreIcon className="w-4 h-4" />
        </button>
        {isOpen && rowActionsPos && createPortal(
          <>
            <div
              className="fixed inset-0 z-[9998]"
              onClick={() => { setOpenRowActionsId(null); setRowActionsPos(null); }}
            />
            <div
              style={{ position: "fixed", top: rowActionsPos.top, left: rowActionsPos.left }}
              className="w-[160px] z-[9999] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5 animate-in fade-in zoom-in duration-150 origin-top-right"
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenRowActionsId(null);
                  setRowActionsPos(null);
                  setSelectedItem(item);
                  setShowDetails(true);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
              >
                <EyeIcon className="w-3.5 h-3.5 text-[#1C1B1F]" />
                View
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenRowActionsId(null);
                  setRowActionsPos(null);
                  handleEditItem(item);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
              >
                <EditIcon className="w-3.5 h-3.5 text-[#1C1B1F]" />
                Edit
              </button>
              <div className="w-full border-t border-[#F1F1F5] my-0.5" />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenRowActionsId(null);
                  setRowActionsPos(null);
                  handleDelete(item._id);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#CD3636] hover:bg-red-50 whitespace-nowrap"
              >
                <DeleteIcon className="w-3.5 h-3.5 text-[#CD3636]" />
                Delete
              </button>
            </div>
          </>,
          document.body,
        )}
      </div>
    );
  };

  const tableColumns = useMemo(() => {
    const cols = [];

    // 1. Checkbox column
    cols.push(
      columnHelper.display({
        id: "selection",
        size: 60,
        enableResizing: false,
        header: () => (
          <div className="flex justify-center items-center w-full">
            <Checkbox checked={selectedItems.length === items.length && items.length > 0} onChange={handleSelectAll}  uncheckedColor="text-[#525866]"/>
          </div>
        ),
        cell: ({ row }) => (
          <div 
            className="flex justify-center items-center gap-1 w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <Checkbox checked={selectedItemsSet.has(row.original._id)} onChange={() => handleSelectItem(row.original._id)} />
          </div>
        ),
      }),
    );

    // 2. Dynamic data columns, ordered pinned-left -> unpinned -> pinned-right.
    const leftPinnedKeys = pinnedColumns.filter((p) => p.side === "left").map((p) => p.key);
    const rightPinnedKeys = pinnedColumns.filter((p) => p.side === "right").map((p) => p.key);
    const leftPinnedFields = visibleColumns.filter((vc) => leftPinnedKeys.includes(vc.key));
    const rightPinnedFields = visibleColumns.filter((vc) => rightPinnedKeys.includes(vc.key));
    const unpinnedFields = visibleColumns.filter(
      (vc) => !leftPinnedKeys.includes(vc.key) && !rightPinnedKeys.includes(vc.key),
    );
    const orderedFields = [...leftPinnedFields, ...unpinnedFields, ...rightPinnedFields];
    const lastColumnKey = orderedFields[orderedFields.length - 1]?.key;

    orderedFields.forEach((vc) => {
      cols.push(
        columnHelper.accessor((row) => getFieldValue(row, vc.key), {
          id: vc.key,
          size: vc.key === "name" ? 220 : vc.key === "category" ? 160 : vc.key === "purchasePrice" || vc.key === "sellingPrice" ? 170 : 150,
          header: () => {
            const isSortable = vc.sortable !== false;
            const pinSide = getColumnPinSide(vc.key);
            const isMenuOpen = openColumnMenuKey === vc.key;

            return (
              <div className="flex items-center justify-between w-full group">
                <span className="truncate flex-1 min-w-0 flex items-center gap-1.5" title={vc.label}>
                  <span className="truncate">{vc.label}</span>
                  {sortConfig.key === vc.key && (sortConfig.direction === "asc"
                    ? <ArrowUp className="w-3 h-3 text-[#0085FF] flex-shrink-0" />
                    : <ArrowDown className="w-3 h-3 text-[#0085FF] flex-shrink-0" />)}
                  {pinSide && (
                    <Pin
                      size={12}
                      className="text-blue-500 fill-blue-500 flex-shrink-0"
                      style={{ transform: "rotate(45deg)" }}
                    />
                  )}
                </span>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isMenuOpen) {
                      setOpenColumnMenuKey(null);
                      setColumnMenuPos(null);
                      return;
                    }
                    const zMenu = getAncestorZoom(document.body);
                    const MENU_W = 160;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const boundsRight = tableScrollRef.current?.getBoundingClientRect().right ?? window.innerWidth;
                    let calcLeft = rect.right / zMenu - MENU_W;
                    calcLeft = Math.min(calcLeft, boundsRight / zMenu - MENU_W - 8);
                    calcLeft = Math.max(calcLeft, 8);
                    setColumnMenuPos({ top: rect.bottom / zMenu + 4, left: calcLeft });
                    setOpenColumnMenuKey(vc.key);
                  }}
                  className="p-1 rounded hover:bg-gray-200 transition-colors text-gray-500 flex-shrink-0"
                  title="Column options"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>

                {isMenuOpen && columnMenuPos && createPortal(
                  <>
                    <div className="fixed inset-0 z-[9998]" onClick={() => { setOpenColumnMenuKey(null); setColumnMenuPos(null); }} />
                    <div
                      ref={columnMenuRef}
                      style={{ position: "fixed", top: columnMenuPos.top, left: columnMenuPos.left }}
                      className="w-[160px] z-[9999] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5 animate-in fade-in zoom-in duration-150 origin-top-right"
                    >
                      <button
                        onClick={() => {
                          setOpenColumnMenuKey(null);
                          setColumnMenuPos(null);
                          pinSide === "left" ? unpinColumn(vc.key) : pinColumnToSide(vc.key, "left");
                        }}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${pinSide === "left" ? "bg-blue-50 text-blue-700" : "text-[#161618] hover:bg-gray-50"}`}
                      >
                        {pinSide === "left" ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5 text-[#1C1B1F]" />}
                        Pin to Left
                      </button>
                      <button
                        onClick={() => {
                          setOpenColumnMenuKey(null);
                          setColumnMenuPos(null);
                          pinSide === "right" ? unpinColumn(vc.key) : pinColumnToSide(vc.key, "right");
                        }}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${pinSide === "right" ? "bg-blue-50 text-blue-700" : "text-[#161618] hover:bg-gray-50"}`}
                      >
                        {pinSide === "right" ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5 text-[#1C1B1F]" />}
                        Pin to Right
                      </button>

                      {isSortable && (
                        <>
                          <button
                            onClick={() => {
                              setOpenColumnMenuKey(null);
                              setColumnMenuPos(null);
                              const key = vc.sortKey || vc.key;
                              const isActive = sortConfig.key === key && sortConfig.direction === "asc";
                              setSortConfig(isActive ? { key: null, direction: null } : { key, direction: "asc" });
                              setPagination((prev) => ({ ...prev, currentPage: 1 }));
                            }}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${sortConfig.key === (vc.sortKey || vc.key) && sortConfig.direction === "asc" ? "bg-blue-50 text-blue-700 font-medium" : "text-[#161618] hover:bg-gray-50"}`}
                          >
                            <ChevronUp className="w-3.5 h-3.5 text-[#1C1B1F]" />
                            Sort Ascending
                          </button>
                          <button
                            onClick={() => {
                              setOpenColumnMenuKey(null);
                              setColumnMenuPos(null);
                              const key = vc.sortKey || vc.key;
                              const isActive = sortConfig.key === key && sortConfig.direction === "desc";
                              setSortConfig(isActive ? { key: null, direction: null } : { key, direction: "desc" });
                              setPagination((prev) => ({ ...prev, currentPage: 1 }));
                            }}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${sortConfig.key === (vc.sortKey || vc.key) && sortConfig.direction === "desc" ? "bg-blue-50 text-blue-700 font-medium" : "text-[#161618] hover:bg-gray-50"}`}
                          >
                            <ChevronDown className="w-3.5 h-3.5 text-[#1C1B1F]" />
                            Sort Descending
                          </button>
                        </>
                      )}

                      <div className="w-full border-t border-[#F1F1F5] my-0.5" />

                      <button
                        disabled={vc.required}
                        onClick={() => {
                          if (vc.required) return;
                          setOpenColumnMenuKey(null);
                          setColumnMenuPos(null);
                          saveColumns(
                            columns.map((c) => (c.key === vc.key ? { ...c, visible: false } : c)),
                          );
                        }}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${vc.required
                          ? "text-gray-300 cursor-not-allowed"
                          : "text-[#161618] hover:bg-gray-50"
                          }`}
                      >
                        <EyeOff className={`w-3.5 h-3.5 ${vc.required ? "text-gray-300" : "text-[#1C1B1F]"}`} />
                        Hide Column
                      </button>
                    </div>
                  </>,
                  document.body,
                )}
              </div>
            );
          },
          cell: ({ row }) => {
            const item = row.original;
            let baseContent;

            if (vc.key === "name") {
              baseContent = (
                <div className="flex items-center min-w-0 flex-1 pr-4">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedItem(item);
                      setShowDetails(true);
                    }}
                    className="text-[#0085FF] font-semibold hover:underline truncate transition-all duration-150 ease-out group-hover:text-[#004CFF] min-w-0 text-left"
                    title={item.name}
                  >
                    <HighlightText text={item.name} query={searchTerm} />
                  </button>
                </div>
              );
            } else if (vc.key === "type") {
              baseContent = (
                <span
                  className={`px-2 py-1 rounded-full text-xs font-semibold uppercase ${item.type === "product" ? "bg-green-100 text-green-700" : "bg-purple-100 text-purple-700"
                    }`}
                >
                  {item.type}
                </span>
              );
            } else if (vc.key === "category") {
              baseContent = (
                <div className="truncate text-sm text-gray-700" title={item.category}>
                  {item.category ? <HighlightText text={item.category} query={searchTerm} /> : "—"}
                </div>
              );
            } else if (vc.key === "purchasePrice") {
              baseContent = (
                <div className="truncate text-sm text-gray-700 font-mono">
                  {getVariantPriceDisplay(item, "purchasePrice") || `₹${formatNumberFixed(item.purchasePrice ?? 0)}`}
                </div>
              );
            } else if (vc.key === "sellingPrice") {
              baseContent = (
                <div className="truncate text-sm text-gray-700 font-mono">
                  {getVariantPriceDisplay(item, "sellingPrice") || `₹${formatNumberFixed(item.sellingPrice ?? 0)}`}
                </div>
              );
            } else if (vc.key === "hsnSac") {
              baseContent = <div className="truncate text-sm text-gray-700">{item.hsnSac ? <HighlightText text={item.hsnSac} query={searchTerm} /> : "—"}</div>;
            } else if (vc.key === "variants") {
              baseContent = item.variants && item.variants.length > 0 ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedItem(item);
                    setShowDetails(true);
                  }}
                  title="View variant details (SKU, price, stock)"
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors cursor-pointer"
                >
                  {item.variants.length} Variant{item.variants.length > 1 ? "s" : ""}
                </button>
              ) : (
                <span className="text-xs text-gray-400">0 Variants</span>
              );
            } else if (vc.key === "isActive") {
              baseContent = (
                <span
                  className={`px-2 py-1 rounded-full text-xs font-semibold ${item.isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                    }`}
                >
                  {item.isActive ? "Active" : "In-Active"}
                </span>
              );
            } else if (baseContent === undefined) {
              const val = item[vc.key];
              const truncated = truncateText(String(val ?? ""), 30);
              baseContent = (
                <div className="truncate text-sm text-gray-700 w-full" title={String(val ?? "")}>
                  {truncated && truncated !== "—" ? <HighlightText text={truncated} query={searchTerm} /> : "—"}
                </div>
              );
            }

            // The row's ⋮ menu is appended to whichever
            // column currently sits last — pin/drag can move that around,
            // same as Companies.jsx — instead of a separate fixed column.
            const withHoverActions = baseContent;

            if (vc.key === lastColumnKey) {
              return (
                <div className="flex items-center justify-between w-full gap-2">
                  <div className="min-w-0 flex-1">{withHoverActions}</div>
                  {renderRowActionsMenu(item)}
                </div>
              );
            }
            return withHoverActions;
          },
        }),
      );
    });

    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    visibleColumns,
    selectedItems,
    selectedItemsSet,
    items,
    sortConfig,
    pinnedColumns,
    openRowActionsId,
    openColumnMenuKey,
    columnMenuPos,
    searchTerm,
  ]);

  // Client-side advanced filter — applied on top of the server-fetched page.
  const filteredItems = useMemo(() => {
    if (!activeFilters || activeFilters.length === 0) return items;
    return items.filter((row) =>
      activeFilters.every((f) => {
        const rawVal = row[f.column];
        const val = String(rawVal ?? "").toLowerCase().trim();
        const filterVal = String(f.value ?? "").toLowerCase().trim();
        switch (f.operator) {
          case "contains": return val.includes(filterVal);
          case "not_contains": return !val.includes(filterVal);
          case "is": return val === filterVal;
          case "is_not": return val !== filterVal;
          case "in": return filterVal.split(",").map((s) => s.trim()).some((s) => val === s);
          case "not_in": return !filterVal.split(",").map((s) => s.trim()).some((s) => val === s);
          case "is_empty": return val === "" || rawVal == null;
          case "is_not_empty": return val !== "" && rawVal != null;
          default: return true;
        }
      }),
    );
  }, [items, activeFilters]);

  const table = useReactTable({
    data: filteredItems,
    columns: tableColumns,
    state: { columnSizing },
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: "onChange",
    enableColumnResizing: true,
  });

  const PaginationControls = () => {
    const {
      currentPage,
      totalPages,
      totalCount,
      limit,
      hasNextPage,
      hasPrevPage,
    } = pagination;

    if (totalCount === 0) return null;

    const startItem = (currentPage - 1) * limit + 1;
    const endItem = Math.min(currentPage * limit, totalCount);

    return (
      <div className="flex items-center justify-between w-full px-4 sm:px-6 lg:px-8">
        <div className="flex-1 flex justify-between sm:hidden">
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={!hasPrevPage}
            className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={!hasNextPage}
            className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>

        <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
          <div className="flex items-center space-x-2">
            <p className="text-sm text-gray-700 font-inter">
              Showing <span className="font-semibold">{startItem}</span> to{" "}
              <span className="font-semibold">{endItem}</span> of{" "}
              <span className="font-semibold">{totalCount}</span> results
            </p>
            <div className="relative ml-2">
              <select
                value={limit}
                onChange={(e) => handleLimitChange(parseInt(e.target.value))}
                className="appearance-none border border-gray-300 rounded-lg pl-3 pr-8 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer font-inter"
              >
                <option value={10}>10 per page</option>
                <option value={20}>20 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
                <option value={150}>150 per page</option>
              </select>
              <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={!hasPrevPage}
              className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            {/* first ... current ... last — same pattern as Companies.jsx, with
                double-click-to-type a page number on the current-page pill. */}
            {(() => {
              const commitPage = () => {
                const n = parseInt(pageInput, 10);
                if (!Number.isNaN(n)) handlePageChange(Math.min(Math.max(n, 1), totalPages));
                setEditingPage(false);
              };
              const pageItems = [1];
              if (currentPage > 2) pageItems.push("left-dots");
              if (currentPage !== 1 && currentPage !== totalPages) pageItems.push(currentPage);
              if (currentPage < totalPages - 1) pageItems.push("right-dots");
              if (totalPages > 1) pageItems.push(totalPages);

              return pageItems.map((item, index) => {
                if (item === "left-dots" || item === "right-dots") {
                  return (
                    <span
                      key={`${item}-${index}`}
                      className="flex items-center justify-center w-8 h-8 text-sm font-medium text-gray-400 select-none"
                    >
                      ....
                    </span>
                  );
                }
                const isCurrent = item === currentPage;
                if (isCurrent && editingPage) {
                  return (
                    <input
                      key="page-edit"
                      autoFocus
                      type="number"
                      min={1}
                      max={totalPages}
                      value={pageInput}
                      onChange={(e) => setPageInput(e.target.value)}
                      onBlur={commitPage}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitPage();
                        if (e.key === "Escape") setEditingPage(false);
                      }}
                      className="w-10 h-8 rounded-full border border-blue-500 text-center text-sm font-medium text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  );
                }
                return (
                  <button
                    key={`page-${item}`}
                    onClick={() => handlePageChange(item)}
                    onDoubleClick={() => {
                      if (isCurrent) {
                        setPageInput(String(currentPage));
                        setEditingPage(true);
                      }
                    }}
                    title={isCurrent ? "Double-click to type a page number" : undefined}
                    className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors ${isCurrent
                      ? "bg-[#0085FF] text-white"
                      : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                      }`}
                  >
                    {item}
                  </button>
                );
              });
            })()}

            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={!hasNextPage}
              className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="-mt-6 -mx-4 sm:-mx-6 lg:-mx-8 pt-4">
      <AppToaster />

      <VideoTutorialModal
        isOpen={showVideoTutorial}
        onClose={() => setShowVideoTutorial(false)}
        videoId={getVideoTutorial("products")?.videoId}
        title={getVideoTutorial("products")?.title}
      />

      <ColumnSettingsPanel
        isOpen={showColumnSettings}
        onClose={() => setShowColumnSettings(false)}
        columns={columns}
        onSave={saveColumns}
        moduleName="Products & Services"
      />

      <ImportItems
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onImportSuccess={() => {
          fetchItems();
          exitSelectionMode();
        }}
      />

      {showDetails && selectedItem && (
        <ViewDetails
          item={selectedItem}
          onRequestClose={() => {
            setShowDetails(false);
            setSelectedItem(null);
          }}
          onEdit={() => {
            setShowDetails(false);
            handleEditItem(selectedItem);
          }}
          onDelete={() => {
            setShowDetails(false);
            handleDelete(selectedItem._id);
          }}
        />
      )}

      {/* Edit Form Modal (ItemForm kept for editing existing items) */}
      {showForm && (
        <ItemForm
          form={form}
          setForm={setForm}
          loading={loading}
          setLoading={setLoading}
          fetchItems={fetchItems}
          onRequestClose={() => setShowForm(false)}
          setSuccess={(msg) => toast.success(msg)}
          setError={(msg) => toast.error(msg)}
        />
      )}

      {/* Quick Create Drawer */}
      <QuickItemDrawer
        isOpen={showQuickCreate}
        onClose={() => setShowQuickCreate(false)}
        onSaved={() => {
          fetchItems();
          setShowQuickCreate(false);
        }}
      />

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10000] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <DeleteIcon className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2 font-sf">
                Delete Item
              </h3>
              <p className="text-sm text-gray-500 font-inter mb-6">
                Are you sure you want to delete this item? This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setItemToDelete(null);
                  }}
                  className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-5 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors shadow-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Card */}
      <div className="bg-white overflow-visible">
        {/* Toolbar (Title + Search + Buttons) */}
        <div
          className={`fixed right-0 h-16 px-4 sm:px-6 lg:px-8 border-b flex items-center top-[calc(54px+var(--dc-offline-offset,0px))] lg:top-[calc(64px+var(--dc-offline-offset,0px))] bg-white border-[#E1E4EA]`}
          style={{
            left: "var(--sidebar-width, 0px)",
            zIndex: 40,
            minHeight: "64px",
            maxHeight: "64px",
            boxSizing: "border-box",
          }}
        >
          {showBulkStrip ? (
            <div className={`${bulkStripClosing ? "animate-slideOutRight" : "animate-slideInLeft"} flex flex-nowrap items-center justify-between gap-4 w-full h-full overflow-x-auto`}>
              <div className="flex flex-nowrap items-center flex-shrink-0">
                <button
                  onClick={() => setShowExportModal(true)}
                  className="h-10 px-4 bg-white border border-gray-300 text-gray-900 text-sm font-medium rounded-l-[25px] hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
                >
                  <DownloadIcon className="w-4 h-4 text-green-600" />
                  Export
                </button>
                <button
                  onClick={() => setShowBulkActions(true)}
                  className="h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
                >
                  <EditIcon className="w-4 h-4 text-blue-600" />
                  Bulk Update
                </button>
                <button
                  onClick={() => setShowBulkDeleteModal(true)}
                  disabled={bulkLoading}
                  className="h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 disabled:opacity-50 flex-shrink-0 whitespace-nowrap"
                >
                  <DeleteIcon className="w-4 h-4 text-red-600" />
                  Delete
                </button>
                <button
                  onClick={exitSelectionMode}
                  className="h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium rounded-r-[25px] hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </button>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <CheckSquare className="w-5 h-5 text-blue-600 flex-shrink-0" />
                <span className="text-blue-800 font-semibold font-inter whitespace-nowrap">
                  {selectedItems.length} item{selectedItems.length !== 1 ? "s" : ""} selected
                </span>
                <button
                  onClick={handleSelectAllAcrossPages}
                  className="h-10 px-4 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-[25px] hover:bg-gray-50 focus:outline-none transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
                >
                  <CheckSquare className="w-4 h-4" />
                  Select All
                </button>
                <button
                  onClick={handleDeselectAllExtra}
                  className="h-10 px-4 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-[25px] hover:bg-gray-50 focus:outline-none transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
                >
                  <X className="w-4 h-4" />
                  Deselect All
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 lg:gap-4 w-full h-full">
              <div
                className={`flex-shrink-0 flex flex-col justify-center gap-1.5 overflow-hidden transition-opacity duration-300 ease-in-out lg:!w-auto lg:!opacity-100 ${isSearchExpanded ? "w-0 opacity-0" : "w-[190px] opacity-100"}`}
              >
                {showLoadingSkeleton ? (
                  <>
                    <Skeleton width={110} height={18} />
                    <Skeleton width={170} height={12} />
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <h1 className="m-0 leading-tight font-bold text-base sm:text-lg text-gray-900 truncate">Product & Services</h1>
                      <VideoIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    </div>
                    <p className="m-0 leading-tight text-[10px] sm:text-xs text-gray-500 font-inter truncate">
                      Manage your products and services
                    </p>
                  </>
                )}
              </div>

              {showLoadingSkeleton ? (
                <div className="relative flex-1 flex items-center justify-end gap-3">
                  <Skeleton width={40} height={40} shape="circle" />
                  <Skeleton width={40} height={40} shape="circle" />
                  <Skeleton width={40} height={40} shape="circle" />
                  <Skeleton width={150} height={40} shape="circle" />
                </div>
              ) : (
                <>
                  <div className="relative flex-1 min-w-0 flex items-center justify-end">
                    <div
                      className={`relative h-10 flex items-center border ${searchTerm ? "border-[#0085FF]" : "border-[#E1E4EA]"} rounded-full bg-white transition-all duration-300 ease-in-out hover:bg-gray-50 focus-within:border-[#0085FF] focus-within:hover:bg-white ${isSearchExpanded ? "w-full lg:w-[416px]" : "w-10"} max-w-full`}
                    >
                      <SearchIcon
                        className="absolute left-3 cursor-pointer z-10 flex-shrink-0 top-1/2 -translate-y-1/2 w-4 h-4 text-[#525866]"
                        onClick={() => {
                          setIsSearchExpanded(true);
                          searchInputRef.current?.focus();
                        }}
                      />
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onFocus={() => setIsSearchExpanded(true)}
                        onBlur={() => {
                          if (!searchTerm) setIsSearchExpanded(false);
                        }}
                        className={`w-full h-full pl-9 pr-9 bg-transparent text-sm focus:outline-none transition-opacity duration-200 font-inter cursor-pointer ${isSearchExpanded ? "opacity-100 focus:cursor-text" : "opacity-0"}`}
                        placeholder="Search items, variant names, or SKUs..."
                      />
                      {isSearchExpanded && searchTerm && (
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => setSearchTerm("")}
                          aria-label="Clear search"
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-5 h-5 rounded-full text-gray-900 hover:bg-gray-100 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" strokeWidth={2.5} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Actions Group — search, filter, columns (matches the reference
                      screenshot's dedicated sliders icon), more (⋮), + Add Item. */}
                  <div className="relative flex items-center gap-2 lg:gap-4 flex-shrink-0">
                    {/* Advanced filter button — opens AdvancedFilterPanel slide-in panel */}
                <button
                  onClick={() => setShowAdvancedFilters(true)}
                  className={`hidden lg:flex relative items-center justify-center w-10 h-10 rounded-full border transition-colors bg-white ${
                    activeFilters.length > 0
                      ? "border-[#0085FF] text-[#0085FF]"
                      : "border-[#E1E4EA] text-gray-500 hover:bg-gray-50"
                  }`}
                  title="Filters"
                >
                  <FilterIcon size={16} className={activeFilters.length > 0 ? "text-[#0085FF]" : ""} />
                  {activeFilters.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-[#0085FF] text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                      {activeFilters.length}
                    </span>
                  )}
                </button>


                {/* Overflow menu: filter/columns on mobile, Import, Export, Video Tutorial */}
                <div className="relative" ref={moreMenuRef}>
                  <button
                    onClick={() => setIsMoreMenuOpen((prev) => !prev)}
                    className="relative flex items-center justify-center w-10 h-10 rounded-full border border-[#E1E4EA] text-[#525866] hover:bg-gray-50 transition-colors"
                    title="More options"
                  >
                    <MoreIcon className="w-4 h-4" />
                    {activeFilters.length > 0 && (
                      <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-blue-600" />
                    )}
                  </button>
                  {isMoreMenuOpen && (
                    <div className="absolute right-0 z-50 mt-2 w-52 bg-white border border-gray-100 rounded-xl shadow-xl py-2 animate-in fade-in zoom-in duration-200 origin-top-right">
                      {/* Mobile-only: filter + columns (desktop shows dedicated buttons) */}
                      <button
                        onClick={() => {
                          setShowAdvancedFilters(true);
                          setIsMoreMenuOpen(false);
                        }}
                        className="lg:hidden w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <FilterIcon size={16} />
                        Filters
                        {activeFilters.length > 0 && (
                          <span className="ml-auto bg-blue-100 text-blue-600 text-xs font-bold px-1.5 py-0.5 rounded-full">
                            {activeFilters.length}
                          </span>
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setShowColumnSettings(true);
                          setIsMoreMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <SlidersHorizontal className="w-4 h-4 text-gray-400" />
                        Columns
                      </button>
                      <button
                        onClick={() => {
                          setShowImport(true);
                          setIsMoreMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <UploadIcon className="w-4 h-4 text-gray-400" />
                        Import
                      </button>
                      <div className="relative" ref={exportButtonRef}>
                        <button
                          onClick={() => setShowExportMenu((prev) => !prev)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <DownloadIcon className="w-4 h-4 text-gray-400" />
                          Export
                        </button>
                        {showExportMenu && (
                          <div className="absolute left-full top-0 ml-1 z-10 w-44 bg-white border border-gray-200 rounded-lg shadow-xl">
                            <button
                              onClick={() => {
                                handleExport("excel");
                                setShowExportMenu(false);
                                setIsMoreMenuOpen(false);
                              }}
                              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors first:rounded-t-lg flex items-center gap-2"
                            >
                              Export as Excel
                            </button>
                            <button
                              onClick={() => {
                                handleExport("pdf");
                                setShowExportMenu(false);
                                setIsMoreMenuOpen(false);
                              }}
                              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors last:rounded-b-lg flex items-center gap-2"
                            >
                              Export as PDF
                            </button>
                          </div>
                        )}
                      </div>
                      
                    </div>
                  )}
                </div>


                <button
                  onClick={() => setShowQuickCreate(true)}
                  className="inline-flex items-center justify-center gap-2 h-10 w-10 lg:w-auto px-0 lg:px-4 bg-[#0085FF] text-white text-sm font-medium rounded-full hover:bg-blue-600 focus:outline-none cursor-pointer transition-colors flex-shrink-0"
                  title="Add Item"
                >
                  <PlusIcon className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden lg:inline">Add Item</span>
                </button>
              </div>
                </>
              )}
            </div>
          )}
        </div>

        <div
          ref={tableScrollRef}
          className="overflow-x-auto overflow-y-auto top-[calc(118px+var(--dc-offline-offset,0px))] lg:top-[calc(128px+var(--dc-offline-offset,0px))]"
          style={{
            position: "fixed",
            left: "var(--sidebar-width, 0px)",
            right: 0,
            bottom: !showLoadingSkeleton ? 64 : 0,
          }}
        >
          <div className={`relative bg-white border-r border-[#E1E4EA] ${showLoadingSkeleton || items.length > 0 ? "border-b" : ""}`} style={{ paddingLeft: "var(--content-inset, 16px)" }}>
            <table
              className="w-full border-separate border-spacing-0 text-left"
              style={{
                minWidth: `${table.getTotalSize()}px`,
                tableLayout: "fixed",
              }}
            >
              {(() => {
                const leftPinnedKeys = pinnedColumns.filter((p) => p.side === "left").map((p) => p.key);
                const rightPinnedKeys = pinnedColumns.filter((p) => p.side === "right").map((p) => p.key);
                const allHeaders = table.getHeaderGroups()[0]?.headers || [];
                const leftPinnedInOrder = allHeaders
                  .map((h) => h.column.id)
                  .filter((id) => leftPinnedKeys.includes(id));
                const rightPinnedInOrder = allHeaders
                  .map((h) => h.column.id)
                  .filter((id) => rightPinnedKeys.includes(id));
                const lastLeftPinnedKey = leftPinnedInOrder.length > 0 ? leftPinnedInOrder[leftPinnedInOrder.length - 1] : null;
                const firstRightPinnedKey = rightPinnedInOrder.length > 0 ? rightPinnedInOrder[0] : null;

                const pinnedLeftOffsets = {};
                let cumulativeLeft = 0;
                allHeaders.forEach((h) => {
                  const isLeftStickyCol = h.column.id === "selection" || leftPinnedKeys.includes(h.column.id);
                  if (isLeftStickyCol) {
                    pinnedLeftOffsets[h.column.id] = cumulativeLeft;
                    cumulativeLeft += h.getSize();
                  }
                });

                const pinnedRightOffsets = {};
                let cumulativeRight = 0;
                [...allHeaders].reverse().forEach((h) => {
                  const isRightStickyCol = rightPinnedKeys.includes(h.column.id);
                  if (isRightStickyCol) {
                    pinnedRightOffsets[h.column.id] = cumulativeRight;
                    cumulativeRight += h.getSize();
                  }
                });

                return (
                  <>
                    {/* The bottom border lives on the <th> cells, not here: this table is
                        `border-separate`, and the CSS separated-borders model ignores borders
                        declared on row groups — so a `border-b` on <thead> silently renders
                        nothing, leaving the header with no line under it. */}
                    <thead className="bg-[#F5F7FA] sticky top-0 z-30 select-none">
                      {table.getHeaderGroups().map((headerGroup) => (
                        <tr key={headerGroup.id}>
                          {headerGroup.headers.map((header) => {
                            const colId = header.column.id;
                            const isLeftSticky = colId === "selection" || leftPinnedKeys.includes(colId);
                            const isRightSticky = rightPinnedKeys.includes(colId);
                            const isSticky = isLeftSticky || isRightSticky;
                            const isLeftBoundary = colId === lastLeftPinnedKey;
                            const isRightBoundary = colId === firstRightPinnedKey;
                            const boundaryShadowSide = isLeftBoundary ? "left" : isRightBoundary ? "right" : null;
                            const isDraggable = colId !== "selection";
                            const isDragging = draggedColKey === colId;
                            const isDragOver = dragOverColKey === colId && draggedColKey && draggedColKey !== colId;

                            return (
                              <th
                                key={header.id}
                                data-col-id={colId}
                                onMouseDown={isDraggable ? (e) => startColumnDrag(e, colId) : undefined}
                                style={{
                                  width: header.getSize(),
                                  position: isSticky ? "sticky" : "relative",
                                  left: isLeftSticky ? pinnedLeftOffsets[colId] ?? 0 : "auto",
                                  right: isRightSticky ? pinnedRightOffsets[colId] ?? 0 : "auto",
                                  zIndex: isSticky ? 20 : 1,
                                }}
                                className={`px-4 py-3 text-sm font-bold text-[#525866] border-b border-r border-[#E1E4EA] last:border-r-0 transition-colors bg-[#F5F7FA] ${isDraggable ? "cursor-grab active:cursor-grabbing" : ""} ${isDragOver ? "bg-blue-100" : "hover:bg-gray-100"}`}
                              >
                                <div className="w-full min-w-0" style={{ opacity: isDragging ? 0.35 : 1 }}>
                                  {flexRender(
                                    header.column.columnDef.header,
                                    header.getContext(),
                                  )}
                                </div>
                                {boundaryShadowSide && (
                                  <div style={getPinnedBoundaryOverlayStyle(boundaryShadowSide)} />
                                )}

                                {colId !== "selection" && header.column.getCanResize() && (
                                  <div
                                    data-resize-handle="true"
                                    onMouseDown={(e) => {
                                      e.stopPropagation();
                                      header.getResizeHandler()(e);
                                    }}
                                    onTouchStart={header.getResizeHandler()}
                                    className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none z-50 bg-transparent"
                                  />
                                )}
                              </th>
                            );
                          })}
                        </tr>
                      ))}
                    </thead>

                    <tbody className="bg-white">
                      {showLoadingSkeleton ? (
                        <TableSkeletonRows
                          numRows={pagination.limit}
                          columns={table.getVisibleLeafColumns().filter((c) => c.id !== "selection")}
                          hasCheckbox
                        />
                      ) : items.length === 0 ? (
                        <tr>
                          <td colSpan={table.getAllColumns().length}>
                            <EmptyState
                              icon={Package}
                              noun="Item"
                              isFiltered={!!(searchTerm || activeFilters?.length)}
                              onCreate={() => setShowQuickCreate(true)}
                              buttonLabel="Add Item"
                            />
                          </td>
                        </tr>
                      ) : (
                        table.getRowModel().rows.map((row) => (
                          <tr
                            key={row.id}
                            onClick={() => {
                              setSelectedItem(row.original);
                              setShowDetails(true);
                            }}
                            className={`bg-white hover:bg-blue-50 transition-colors cursor-pointer ${selectedItemsSet.has(row.original._id) ? "!bg-blue-50" : ""}`}
                            style={{ height: 37, maxHeight: 37 }}
                          >
                            {row.getVisibleCells().map((cell) => {
                              const colId = cell.column.id;
                              const isLeftSticky = colId === "selection" || leftPinnedKeys.includes(colId);
                              const isRightSticky = rightPinnedKeys.includes(colId);
                              const isSticky = isLeftSticky || isRightSticky;
                              const isLeftBoundary = colId === lastLeftPinnedKey;
                              const isRightBoundary = colId === firstRightPinnedKey;
                              const cellBoundaryShadowSide = isLeftBoundary ? "left" : isRightBoundary ? "right" : null;
                              const isColDragging = draggedColKey === colId;

                              return (
                                <td
                                  key={cell.id}
                                  style={{
                                    width: cell.column.getSize(),
                                    height: "37px",
                                    maxHeight: "37px",
                                    boxSizing: "border-box",
                                    position: isSticky ? "sticky" : "static",
                                    left: isLeftSticky ? pinnedLeftOffsets[colId] ?? 0 : "auto",
                                    right: isRightSticky ? pinnedRightOffsets[colId] ?? 0 : "auto",
                                    zIndex: isSticky ? 10 : 1,
                                  }}
                                  className="px-4 py-2 align-middle text-sm text-[#1C1B1F] bg-inherit border-r border-b border-[#E1E4EA] last:border-r-0"
                                >
                                  <div style={{ opacity: isColDragging ? 0.35 : 1, overflow: "hidden" }}>
                                    {flexRender(
                                      cell.column.columnDef.cell,
                                      cell.getContext(),
                                    )}
                                  </div>
                                  {cellBoundaryShadowSide && (
                                    <div style={getPinnedBoundaryOverlayStyle(cellBoundaryShadowSide)} />
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </>
                );
              })()}
            </table>
          </div>
        </div>

        {dragGhost && createPortal(
          <div
            ref={ghostElRef}
            style={{
              position: "fixed",
              top: -9999,
              left: -9999,
              width: dragGhost.width,
              zIndex: 10000,
              pointerEvents: "none",
            }}
            className="flex flex-col bg-white rounded-lg shadow-2xl overflow-hidden"
          >
            <div className="px-4 py-3 bg-[#F5F7FA] border-b border-[#E1E4EA]" style={{ height: dragGhost.height }}>
              <span className="text-sm font-bold text-[#525866] truncate block">{dragGhost.label}</span>
            </div>
            {dragGhost.previewRows.map((rowVal, i) => (
              <div key={i} className="px-4 py-2 border-b border-[#F1F1F5] last:border-b-0">
                <span className="text-sm text-gray-700 truncate block">{rowVal}</span>
              </div>
            ))}
          </div>,
          document.body,
        )}

        {!showLoadingSkeleton && (
          <div
            className={`fixed bottom-0 right-0 bg-white border-t border-[#E1E4EA] shadow-sm z-[9992] flex items-center ${isSearchOverlayOpen ? "pointer-events-none" : ""}`}
            style={{
              left: "var(--sidebar-width, 0px)",
              height: 64,
              filter: isSearchOverlayOpen ? "brightness(0.6)" : "none",
            }}
          >
            <PaginationControls />
          </div>
        )}
      </div>

      <BulkActions
        isOpen={showBulkActions}
        onClose={() => setShowBulkActions(false)}
        selectedItems={items.filter((i) => selectedItems.includes(i._id))}
        onBulkUpdate={handleBulkUpdateItems}
        onBulkDelete={handleBulkDeleteItems}
        fieldConfig={itemFieldConfig}
        module="items"
        loading={bulkLoading}
      />

      <BulkDeleteModal
        isOpen={showBulkDeleteModal}
        message={
          <>
            Are you sure you want to delete <strong>{selectedItems.length}</strong> selected Items? This action cannot be undone.
          </>
        }
        loading={bulkLoading}
        onCancel={() => setShowBulkDeleteModal(false)}
        onConfirm={async () => {
          await handleBulkDeleteItems(selectedItems);
          setShowBulkDeleteModal(false);
        }}
      />

      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        columns={exportColumns}
        selectedIds={selectedItems}
        exportUrl="/items/export-selected"
        fileName="Exported_Items.csv"
      />

      <AdvancedFilterPanel
        isOpen={showAdvancedFilters}
        onClose={() => setShowAdvancedFilters(false)}
        columns={itemFilterColumns}
        data={items}
        getFieldValue={getItemFieldValue}
        filters={activeFilters}
        setFilters={setActiveFilters}
        onApply={(newFilters) => setActiveFilters(newFilters)}
        title="Filter Products & Services"
        subtitle="Find specific items quickly"
        emptyStateText="Add a rule to narrow down your item list."
      />
    </div>
  );
}

export default ProductsServices;
