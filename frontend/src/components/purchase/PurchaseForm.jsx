import DeleteIcon from "../common/DeleteIcon";
import Checkbox from "../common/Checkbox";
import PlusIcon from "../common/PlusIcon";
import React, { useEffect, useState, useRef } from "react";
import {  X,
  ChevronDown,
} from "lucide-react";
import SearchableDropdown from "../contact/SearchableDropdown";
import QuickVendorForm from "../vendor/QuickVendorForm";
import API from "../../services/api";
import toast from "react-hot-toast";
import { formatNumberFixed } from "../../utils/numberFormatter";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

import SearchIcon from "../common/SearchIcon";
import FilterIcon from "../common/FilterIcon";
const API_BASE = `${import.meta.env.VITE_APP_API_URL}/api`;
// Same fixed slab set as ItemForm.jsx/QuickItemDrawer.jsx, so a purchase's
// per-item GST% can only be one of the rates products are actually defined
// with — not an arbitrary free-typed number.
const GST_RATES = [0, 5, 12, 18, 28];
// The product's description is rich text ("<p>...</p>" etc, same as
// InvoiceForm.jsx's own stripHtml) — strip the markup before it lands in a
// plain <input>, which was showing the raw tags.
const stripHtml = (html) => String(html || "").replace(/<[^>]*>/g, "").trim();

const ItemSearchSelect = ({ value, onSelect, onAddNew, error = null }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchItems = async (search = "") => {
    try {
      setLoading(true);
      const res = await API.get(`/items?search=${search}`);
      const transformedItems = res.data
        .filter((item) => item.isActive)
        .flatMap((item) => {
          if (item.variants && item.variants.length > 0) {
            return item.variants.map((variant) => ({
              _id: item._id,
              variantId: variant._id,
              name: `${item.name} – ${variant.name}`,
              description: stripHtml(item.description),
              unitPrice:
                variant.purchasePrice ||
                item.purchasePrice ||
                item.sellingPrice,
              type: item.type,
              sku: variant.sku,
              stock: variant.stock ?? item.inventory?.currentStock ?? 0,
              gstRate: variant.gstRate ?? item.gstRate ?? 0,
              taxInclusive: variant.taxInclusive ?? item.taxInclusive ?? false,
            }));
          }
          return [
            {
              _id: item._id,
              variantId: null,
              name: item.name,
              description: stripHtml(item.description),
              unitPrice: item.purchasePrice || item.sellingPrice,
              type: item.type,
              sku: null,
              stock: item.inventory?.currentStock ?? 0,
              gstRate: item.gstRate || 0,
              taxInclusive: item.taxInclusive || false,
            },
          ];
        });
      setItems(transformedItems);
    } catch (error) {
      console.error("Error fetching items:", error);
      toast.error("Failed to fetch items");
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    if (value.length >= 2 || value === "") {
      fetchItems(value);
    }
  };

  const handleInputFocus = () => {
    setIsOpen(true);
    if (items.length === 0) fetchItems();
  };

  const handleItemClick = (item) => {
    onSelect({
      _id: item._id,
      variantId: item.variantId,
      name: item.name,
      description: item.description || "",
      unitPrice: item.unitPrice,
      quantity: 1,
      sku: item.sku,
      gstRate: item.gstRate || 0,
      taxInclusive: item.taxInclusive || false,
    });
    setIsOpen(false);
    setSearchTerm("");
  };

  const getBorderColor = () => {
    if (error) return "border-red-500 focus:ring-red-500";
    return "border-[#1F2937]/10 focus:ring-blue-500";
  };

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <div className="relative">
        <SearchIcon className="absolute left-3 -translate-y-1/2 top-1/2 w-4 h-4 text-[#525866]" />
        <input
          ref={inputRef}
          type="text"
          placeholder={value?.name ? value.name : "Choose Existing Item"}
          value={searchTerm}
          onChange={handleSearchChange}
          onFocus={handleInputFocus}
          className={`w-full pl-9 pr-4 h-8 bg-white border rounded-full text-[12px] focus:outline-none focus:ring-1 transition-all ${getBorderColor()}`}
        />
      </div>
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-gray-500 text-sm">
              Loading...
            </div>
          ) : items.length > 0 ? (
            items.map((item, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleItemClick(item)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors"
              >
                <div className="flex justify-between">
                  <div>
                    <div className="font-medium text-gray-800 text-sm">
                      {item.name}
                    </div>
                    {item.sku && (
                      <div className="text-xs text-gray-500">
                        SKU: {item.sku}
                      </div>
                    )}
                    {item.type === "product" && (
                      <div className="text-xs font-medium text-slate-600 mt-0.5">
                        Stock: {item.stock ?? 0}
                      </div>
                    )}
                  </div>
                  <div className="text-sm font-semibold text-gray-700">
                    ₹{item.unitPrice}
                  </div>
                </div>
              </button>
            ))
          ) : (
            <div className="p-4 text-center text-gray-500 text-sm">
              No items found
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const PurchaseForm = ({
  editingPurchase,
  vendors,
  onRequestClose,
  onSuccess,
  onError,
  // PO id to pre-link/pre-fill from, e.g. arriving via "Convert to Purchase"
  // on a Delivered PO — skips making the user re-pick the same PO from the
  // "Link to Purchase Order" dropdown below.
  initialPurchaseOrderId = null,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  useBodyScrollLock(isOpen);
  const [loading, setLoading] = useState(false);
  const [showQuickVendorForm, setShowQuickVendorForm] = useState(false);
  const [localVendors, setLocalVendors] = useState(vendors || []);
  const [purchaseOrders, setPurchaseOrders] = useState([]);

  // Form State
  const [vendorId, setVendorId] = useState("");
  const [selectedPO, setSelectedPO] = useState("");
  const loadPurchaseOrder = async (poId) => {
    if (!poId) return;
    try {
      const res = await API.get("/purchase-orders/" + poId);
      const po = res.data.purchaseOrder || res.data;
      if (po) {
        if (po.vendor?._id || po.vendor) setVendorId(po.vendor?._id || po.vendor);
        setItems(po.items.map(item => ({
          _id: item.itemId || null,
          variantId: item.variantId || null,
          name: item.name,
          description: stripHtml(item.description),
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          sku: item.sku || null,
          gstRate: item.gstRate || 0,
          taxInclusive: item.taxInclusive || false
        })));
        if (po.notes) setNotes(po.notes);
        if (po.transactionType) setTransactionType(po.transactionType);
        // A new Purchase created from a PO always starts as Pending (enforced
        // server-side too, in purchaseController.createPurchase) — reflect
        // that here instead of leaving whatever the status field had before.
        if (!editingPurchase) setStatus("Pending");
      }
    } catch (err) {
      console.error("Failed to fetch PO details", err);
      toast.error("Failed to load the Purchase Order's details");
    }
  };
  const handlePOChange = (e) => {
    const poId = e.target.value;
    setSelectedPO(poId);
    loadPurchaseOrder(poId);
  };
  const [items, setItems] = useState([
    {
      _id: null,
      variantId: null,
      name: "",
      description: "",
      quantity: 1,
      unitPrice: "",
      sku: null,
    },
  ]);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("Draft");
  const [transactionType, setTransactionType] = useState("intra");
  const [gstRate, setGstRate] = useState(0);

  // Fetch POs
  useEffect(() => {
    const fetchPOs = async () => {
      try {
        const res = await API.get("/purchase-orders");
        const all = res.data.purchaseOrders || res.data || [];
        // An Approved or Delivered PO can be converted to a Purchase
        // (enforced server-side too, in purchaseController.js) — a Pending/
        // Rejected one shouldn't even be selectable here. Already-converted
        // POs are excluded too — picking one would just 400 on save.
        setPurchaseOrders(
          all.filter(
            (po) => (po.status === "Approved" || po.status === "Delivered") && !po.convertedPurchase
          )
        );
      } catch (err) {
        console.error("Failed to fetch POs", err);
      }
    };
    fetchPOs();
  }, []);

  // Arrived via "Convert to Purchase" on a specific Delivered PO — pre-link
  // and pre-fill from it instead of leaving the form blank.
  useEffect(() => {
    if (!initialPurchaseOrderId || editingPurchase) return;
    setSelectedPO(initialPurchaseOrderId);
    loadPurchaseOrder(initialPurchaseOrderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPurchaseOrderId]);

  useEffect(() => {
    setTimeout(() => setIsOpen(true), 10);
    setLocalVendors(vendors);

    if (editingPurchase) {
      setVendorId(editingPurchase.vendor?._id || editingPurchase.vendor || "");
      setSelectedPO(
        editingPurchase.purchaseOrder?._id ||
          editingPurchase.purchaseOrder ||
          "",
      );
      setItems(
        editingPurchase.items?.map((item) => ({
          _id: item.itemId || null,
          variantId: item.variantId || null,
          name: item.name,
          description: stripHtml(item.description),
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          sku: item.sku || null,
        })) || [],
      );
      setNotes(editingPurchase.notes || "");
      setStatus(editingPurchase.status || "Draft");
      setTransactionType(editingPurchase.transactionType || "intra");
      setGstRate(editingPurchase.gstRate || 0);
    }
  }, [editingPurchase, vendors]);

  const handleClose = () => {
    setIsOpen(false);
    setTimeout(onRequestClose, 300);
  };

  const addItem = () => {
    setItems([
      ...items,
      {
        _id: null,
        variantId: null,
        name: "",
        description: "",
        quantity: 1,
        unitPrice: "",
        sku: null,
      },
    ]);
  };

  const removeItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  const subtotal = items.reduce((sum, item) => {
    let itemTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0);
    if (item.taxInclusive) {
      itemTotal = itemTotal / (1 + (parseFloat(item.gstRate) || parseFloat(gstRate) || 0) / 100);
    }
    return sum + itemTotal;
  }, 0);

  // Calculate tax
  const totalTax = items.reduce((sum, item) => {
    const itemTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0);
    const rate = parseFloat(item.gstRate) || parseFloat(gstRate) || 0;
    
    if (rate <= 0) return sum;
    
    if (item.taxInclusive) {
      const base = itemTotal / (1 + rate / 100);
      return sum + (itemTotal - base);
    } else {
      return sum + (itemTotal * (rate / 100));
    }
  }, 0);

  const grandTotal = subtotal + totalTax;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!vendorId) {
      toast.error("Please select a vendor");
      return;
    }

    setLoading(true);
    const payload = {
      vendor: vendorId,
      purchaseOrder: selectedPO || null,
      items: items.map((item) => ({
        itemId: item._id,
        variantId: item.variantId,
        name: item.name || "Unknown Item",
        description: item.description,
        quantity: parseFloat(item.quantity) || 0,
        unitPrice: parseFloat(item.unitPrice) || 0,
        amount:
          (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0),
        sku: item.sku,
        variantAttributes: item.variantAttributes,
        gstRate: parseFloat(item.gstRate) || parseFloat(gstRate) || 0,
        taxInclusive: item.taxInclusive || false,
      })),
      notes,
      status,
      transactionType,
      gstRate,
      subtotal,
      totalTax,
      grandTotal,
    };

    try {
      if (editingPurchase) {
        await API.put(`/purchases/${editingPurchase._id}`, payload);
        // Force status update if changed
        if (editingPurchase.status !== status) {
          await API.put(`/purchases/${editingPurchase._id}/status`, { status });
        }
        onSuccess("Purchase updated successfully!");
      } else {
        // createPurchase already saves with this exact `status` (or forces
        // "Draft" server-side when purchaseOrder is linked) — no follow-up
        // status call needed. (This used to try one via
        // res.data.purchase._id, but createPurchase returns the purchase
        // directly, not nested under `.purchase`, so that call silently
        // never ran.)
        await API.post("/purchases", payload);
        onSuccess("Purchase created successfully!");
      }
      handleClose();
    } catch (err) {
      console.error(err);
      if (err.response?.status === 402) {
        onError(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        onError(err.response?.data?.error || "Failed to save purchase");
      }
    } finally {
      setLoading(false);
    }
  };

  const today = new Date();
  const dateStr = today.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const timeStr = today.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[10000] transition-opacity duration-300 ease-in-out"
        style={{ opacity: isOpen ? 1 : 0 }}
        onClick={handleClose}
      />

      {/* Same dc-panel-card/dc-panel-w shell as CompanyForm/DealForm/ItemForm
          etc. — width now matches the rest of the app's quick-drawers
          instead of a wider one-off 600px. */}
      <div
        className={`
          fixed dc-panel-card dc-panel-w z-[10001]
          bg-white shadow-2xl flex flex-col overflow-hidden
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"}
        `}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center flex-shrink-0">
          <h2 className="text-[15px] font-normal leading-6 text-[#78788D] uppercase tracking-wide">
            {editingPurchase ? "EDIT PURCHASE" : "CREATE NEW PURCHASE"}
          </h2>
          <div className="flex items-center gap-4">
            {editingPurchase && (
              <>
                <button type="button" className="text-[#0085FF] hover:text-blue-600 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                </button>
                <button type="button" className="text-red-500 hover:text-red-600 transition-colors">
                  <DeleteIcon className="w-4 h-4" />
                </button>
                <div className="w-px h-4 bg-gray-300"></div>
              </>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="text-gray-900 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content — single column throughout, tightened spacing to suit
            the narrower card. */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {/* Vendor & PO Link */}
          <div className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Select Vendor <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-2">
                <SearchableDropdown
                  options={localVendors}
                  value={vendorId}
                  onChange={setVendorId}
                  placeholder="Select Vendor"
                  displayKey="name"
                  valueKey="_id"
                  className="flex-1 w-full"
                  required={true}
                />
                {/* Matched to the dropdown's own h-12 / rounded-[25px] pill
                    shape — was a mismatched rounded-lg square before. */}
                <button
                  type="button"
                  onClick={() => setShowQuickVendorForm(true)}
                  className="w-12 h-12 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-colors flex-shrink-0"
                  aria-label="Add new vendor"
                >
                  <PlusIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Link to Purchase Order (Optional)
              </label>
              <div className="relative">
                <select
                  value={selectedPO}
                  onChange={handlePOChange}
                  className="w-full appearance-none px-3 h-8 bg-white border border-[#1F2937]/10 rounded-full text-[12px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all cursor-pointer"
                >
                  <option value="">Select Purchase Order</option>
                  {purchaseOrders.map((po) => (
                    <option key={po._id} value={po._id}>
                      {po.poNumber} - {po.vendor?.name}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                  <ChevronDown className="w-4 h-4" />
                </div>
              </div>
            </div>
          </div>

          {/* Items Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Items</h3>
              <button
                type="button"
                onClick={addItem}
                className="flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium text-xs transition-colors"
              >
                <PlusIcon className="w-4 h-4" />
                Add Item Manually
              </button>
            </div>

            <div className="space-y-4">
              {items.map((item, index) => (
                <div
                  key={index}
                  className="bg-white rounded-xl border border-gray-200 p-4 relative group space-y-3"
                >
                  {/* Remove Button for Item */}
                  {items.length > 1 && (
                    <button
                      onClick={() => removeItem(index)}
                      className="absolute top-3 right-3 text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <DeleteIcon className="w-4 h-4" />
                    </button>
                  )}

                  {/* Item Search */}
                  <div>
                    <label className="block text-[11px] font-medium text-[#161618] tracking-[-0.05em] mb-1.5">
                      Item <span className="text-red-500">*</span>
                    </label>
                    <ItemSearchSelect
                      value={item}
                      onSelect={(data) => {
                        const newItems = [...items];
                        newItems[index] = { ...newItems[index], ...data };
                        setItems(newItems);
                      }}
                    />
                  </div>
                  {/* Manual Name */}
                  <div>
                    <label className="block text-[11px] font-medium text-[#161618] tracking-[-0.05em] mb-1.5">
                      Manual Item Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Or Enter Item Name Manually"
                      value={item.name}
                      onChange={(e) =>
                        updateItem(index, "name", e.target.value)
                      }
                      className="w-full px-3 h-8 bg-white border border-[#1F2937]/10 rounded-full text-[12px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {/* Quantity */}
                    <div>
                      <label className="block text-[11px] font-medium text-[#161618] tracking-[-0.05em] mb-1.5">
                        Quantity
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) =>
                            updateItem(index, "quantity", e.target.value)
                          }
                          className="w-full px-3 h-8 bg-white border border-[#1F2937]/10 rounded-full text-[12px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                          placeholder="01"
                        />
                        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                          <FilterIcon size={16} />
                        </div>
                      </div>
                    </div>
                    {/* Unit Price */}
                    <div>
                      <label className="block text-[11px] font-medium text-[#161618] tracking-[-0.05em] mb-1.5">
                        Unit Price <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          value={item.unitPrice}
                          onChange={(e) =>
                            updateItem(index, "unitPrice", e.target.value)
                          }
                          className="w-full pl-7 pr-3 h-8 bg-white border border-[#1F2937]/10 rounded-full text-[12px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                          placeholder="0"
                        />
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 font-medium text-[12px]">
                          ₹
                        </span>
                      </div>
                    </div>
                    {/* GST % */}
                    <div>
                      <label className="block text-[11px] font-medium text-[#161618] tracking-[-0.05em] mb-1.5">
                        GST %
                      </label>
                      <div className="relative">
                        <select
                          value={item.gstRate ?? 0}
                          onChange={(e) =>
                            updateItem(index, "gstRate", parseFloat(e.target.value) || 0)
                          }
                          className="w-full pl-3 pr-7 h-8 bg-white border border-[#1F2937]/10 rounded-full text-[12px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all appearance-none cursor-pointer"
                        >
                          {GST_RATES.map((rate) => (
                            <option key={rate} value={rate}>{rate}%</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500 pointer-events-none" />
                      </div>
                      <label className="flex items-center gap-2 mt-2 cursor-pointer">
                        <Checkbox checked={item.taxInclusive || false} onChange={(e) =>
                            updateItem(index, "taxInclusive", e.target.checked)
                          } />
                        <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                          Tax Inc.
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* Amount — read-only. Always quantity × unitPrice; edit Unit Price to
                      change it. */}
                  <div>
                    <label className="block text-[11px] font-medium text-[#161618] tracking-[-0.05em] mb-1.5">
                      Amount
                    </label>
                    <div className="w-full px-3 h-8 flex items-center bg-gray-100 border border-[#1F2937]/10 rounded-full text-[12px] font-semibold text-gray-800">
                      ₹
                      {formatNumberFixed(
                        (parseFloat(item.unitPrice) || 0) * (parseFloat(item.quantity) || 0)
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
              Additional Notes <span className="text-red-500">*</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add Additional Notes"
              className="w-full px-3 py-2 bg-white border border-[#1F2937]/10 rounded-2xl text-[12px] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all min-h-[90px] resize-none"
            />
          </div>

          {/* Status, Transaction Type, GST Rate */}
          <div className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Status
              </label>
              <div className="relative">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  disabled={(!editingPurchase && !!selectedPO) || editingPurchase?.status === "Paid"}
                  title={
                    editingPurchase?.status === "Paid"
                      ? "A Paid purchase can't be changed to another status"
                      : !editingPurchase && selectedPO
                      ? "A Purchase created from a Purchase Order always starts as Pending"
                      : undefined
                  }
                  className="w-full appearance-none px-3 h-8 bg-white border border-[#1F2937]/10 rounded-full text-[12px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="Draft">Draft</option>
                  <option value="Pending">Pending</option>
                  <option value="Paid">Paid</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                  <ChevronDown className="w-4 h-4" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                  Transaction Type
                </label>
                <div className="relative">
                  <select
                    value={transactionType}
                    onChange={(e) => setTransactionType(e.target.value)}
                    className="w-full appearance-none px-3 h-8 bg-white border border-[#1F2937]/10 rounded-full text-[12px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all cursor-pointer"
                  >
                    <option value="intra">Intra State</option>
                    <option value="inter">Inter State</option>
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Total Amount Banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-slate-700">
              <span className="text-sm">Subtotal</span>
              <span className="font-semibold">₹{formatNumberFixed(subtotal)}</span>
            </div>

            {totalTax > 0 && (
              <div className="flex justify-between items-center text-slate-700">
                <span className="text-sm">Total Tax</span>
                <span className="font-semibold">₹{formatNumberFixed(totalTax)}</span>
              </div>
            )}

            <div className="flex justify-between items-center pt-3 border-t border-slate-200">
              <span className="font-bold text-slate-900">Grand Total</span>
              <span className="font-bold text-blue-600 text-lg">
                ₹{formatNumberFixed(grandTotal)}
              </span>
            </div>
          </div>
        </div>

        {/* Footer — matches the CompanyForm/ItemForm quick-drawer footer spec */}
        <div className="flex-shrink-0 py-2.5 px-4 border-t border-gray-100 bg-white flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="px-6 py-2 border border-gray-200 text-gray-700 rounded-[25px] text-sm font-bold hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="px-6 py-2 bg-[#158FFF] text-white rounded-[25px] text-sm font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading
              ? "Creating..."
              : editingPurchase
                ? "Update"
                : "Create Purchase"}
          </button>
        </div>
      </div>

      {showQuickVendorForm && (
        <QuickVendorForm
          onVendorCreated={(vendor) => {
            setLocalVendors([...localVendors, vendor]);
            setVendorId(vendor._id);
            setShowQuickVendorForm(false);
          }}
          onRequestClose={() => setShowQuickVendorForm(false)}
        />
      )}
    </>
  );
};

export default PurchaseForm;
