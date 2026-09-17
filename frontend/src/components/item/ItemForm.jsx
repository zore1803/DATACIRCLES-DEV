import DeleteIcon from "../common/DeleteIcon";
import VariantImagePicker from "./VariantImagePicker";
import { UNIT_OPTIONS, unitLabelToValue } from "./unitOptions";
import { stripVariantFileState } from "../../utils/variantResolve";
import Checkbox from "../common/Checkbox";
import PlusIcon from "../common/PlusIcon";
import React, { useEffect, useState, useRef } from "react";
import API from "../../services/api";
import {
  X,
  Type,
  FolderOpen,
  ChevronDown,
} from "lucide-react";
import toast from "react-hot-toast";
import ReactQuill from "react-quill-new";

// Standard Indian GST slabs, matching the per-item select used on
// document forms (e.g. InvoiceForm.jsx).
const GST_RATES = [0, 5, 12, 18, 28];

const ItemForm = ({
  form,
  setForm,
  loading,
  setLoading,
  fetchItems,
  onRequestClose,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [variants, setVariants] = useState(form.variants || []);
  const [showVariantForm, setShowVariantForm] = useState(false);
  // Blank variant. The override fields (barcode/description/discount/maxDiscountPercent/
  // lowStockThreshold) start as "" rather than 0 — empty means "inherit the parent's value",
  // and 0 is a real, deliberate setting. The backend preserves that distinction.
  const [currentVariant, setCurrentVariant] = useState({
    name: "",
    sku: "",
    attributes: {},
    purchasePrice: 0,
    sellingPrice: 0,
    stock: 0,
    isActive: true,
    gstRate: 0,
    barcode: "",
    description: "",
    images: [],
    discount: { type: "percentage", value: "" },
    maxDiscountPercent: "",
    lowStockThreshold: "",
  });
  const [variantIndex, setVariantIndex] = useState(null);
  // Once an item has variants, the variant is the actual sellable/stockable
  // unit everywhere in the app (every item-picker in Purchase/PO/Quotation/
  // Invoice/Delivery Challan already ignores parent pricing once
  // item.variants.length > 0, resolving to the variant instead) — so the
  // parent-level price/GST/stock fields below become inert and are disabled
  // to stop the user from ever wondering "which price actually applies".
  // Includes an in-progress uncommitted variant panel too, since that
  // variant gets auto-committed on submit (see handleSubmit).
  const hasVariants = variants.length > 0 || (showVariantForm && !!currentVariant.name?.trim());
  const [isFormDirty, setIsFormDirty] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});

  // Product images: `existingImages` holds already-uploaded URLs (kept ones,
  // seeded from the item being edited); `newImageFiles` holds freshly picked
  // File objects not uploaded yet. Both are merged into one `images` field
  // on submit.
  const [existingImages, setExistingImages] = useState(form.images || []);
  const [newImageFiles, setNewImageFiles] = useState([]);
  const [newImagePreviews, setNewImagePreviews] = useState([]);
  const [selectedImageUrl, setSelectedImageUrl] = useState(null);
  const imageInputRef = useRef(null);

  useEffect(() => {
    setExistingImages(form.images || []);
    setNewImageFiles([]);
  }, [form._id]);

  useEffect(() => {
    const urls = newImageFiles.map((f) => URL.createObjectURL(f));
    setNewImagePreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [newImageFiles]);

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length) {
      setNewImageFiles((prev) => [...prev, ...files]);
      setIsFormDirty(true);
    }
    e.target.value = "";
  };

  const handleRemoveExistingImage = (url) => {
    setExistingImages((prev) => prev.filter((u) => u !== url));
    setIsFormDirty(true);
  };

  const handleRemoveNewImage = (index) => {
    setNewImageFiles((prev) => prev.filter((_, i) => i !== index));
    setIsFormDirty(true);
  };

  // Org-defined custom fields (configured in Settings -> Item Fields).
  // Definitions come from /item-fields/latest; the entered values live in
  // additionalFieldValues keyed by field name, and are flattened into the
  // Item's additionalFields array on submit.
  const [itemFields, setItemFields] = useState([]);
  const [additionalFieldValues, setAdditionalFieldValues] = useState({});
  const [expandedSections, setExpandedSections] = useState({});

  useEffect(() => {
    const fetchItemFields = async () => {
      try {
        const res = await API.get("/item-fields/latest");
        setItemFields(res.data?.fields || []);
      } catch {
        // A missing/forbidden field config just means no custom fields to
        // show — the rest of the form still works, so fail quietly.
        setItemFields([]);
      }
    };
    fetchItemFields();
  }, []);

  // Seed values from the item being edited.
  useEffect(() => {
    if (form.additionalFields && form.additionalFields.length > 0) {
      const seeded = {};
      form.additionalFields.forEach((field) => {
        if (field?.key) seeded[field.key] = field.value;
      });
      setAdditionalFieldValues(seeded);
    } else {
      setAdditionalFieldValues({});
    }
  }, [form._id]);

  const toggleSection = (category) => {
    setExpandedSections((prev) => ({ ...prev, [category]: !prev[category] }));
  };

  const handleAdditionalFieldChange = (fieldName, value) => {
    setAdditionalFieldValues((prev) => ({ ...prev, [fieldName]: value }));
    setIsFormDirty(true);
    if (validationErrors[`additional_${fieldName}`]) {
      setValidationErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[`additional_${fieldName}`];
        return newErrors;
      });
    }
  };

  const groupedFields = (itemFields || []).reduce((acc, fieldDef) => {
    const category = fieldDef.category || "Uncategorized";
    if (!acc[category]) acc[category] = [];
    acc[category].push(fieldDef);
    return acc;
  }, {});

  // "Uncategorized" sorts last so named groups lead.
  const sortedCategories = Object.keys(groupedFields).sort((a, b) => {
    if (a === "Uncategorized") return 1;
    if (b === "Uncategorized") return -1;
    return a.localeCompare(b);
  });

  const renderFieldInput = (fieldDef, rawValue) => {
    const hasError = validationErrors[`additional_${fieldDef.name}`];
    const value = rawValue !== undefined && rawValue !== null ? rawValue : "";
    const handleFieldChange = (newValue) => handleAdditionalFieldChange(fieldDef.name, newValue);

    const typeStr = (fieldDef.type || "").toLowerCase();
    let normalizedType = "string";
    if (typeStr.includes("multi-line") || typeStr === "text") normalizedType = "text";
    else if (typeStr.includes("number")) normalizedType = "number";
    else if (typeStr.includes("dropdown")) normalizedType = "dropdown";
    else if (typeStr.includes("url")) normalizedType = "url";
    else if (typeStr.includes("date")) normalizedType = "date";
    else if (typeStr.includes("multi-select") || typeStr.includes("checkbox") || typeStr === "multiselect")
      normalizedType = "multiselect";

    const baseInputClass = `w-full border rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] font-inter placeholder:text-[#1F2937] placeholder:opacity-50 focus:outline-none focus:ring-1 transition-all ${hasError ? "border-red-500 focus:ring-red-500" : "border-[#1F2937]/10 focus:ring-blue-500"
      }`;

    const errorText = hasError ? <p className="text-red-500 text-xs mt-1">{hasError}</p> : null;

    switch (normalizedType) {
      case "number":
        return (
          <>
            <input
              type="number"
              step="any"
              value={value}
              onChange={(e) => handleFieldChange(e.target.value)}
              className={baseInputClass}
              placeholder={`Enter ${fieldDef.name}`}
            />
            {errorText}
          </>
        );
      case "dropdown":
        return (
          <>
            <select
              value={value}
              onChange={(e) => handleFieldChange(e.target.value)}
              className={`${baseInputClass} cursor-pointer`}
            >
              <option value="">Select {fieldDef.name}</option>
              {fieldDef.options?.map((option, index) => (
                <option key={index} value={option}>{option}</option>
              ))}
            </select>
            {errorText}
          </>
        );
      case "text":
        return (
          <>
            <textarea
              rows={3}
              value={value}
              onChange={(e) => handleFieldChange(e.target.value)}
              className={`${baseInputClass.replace("rounded-full", "rounded-2xl").replace("h-[38px]", "py-2.5 h-auto")} resize-vertical`}
              placeholder={`Enter ${fieldDef.name}`}
            />
            {errorText}
          </>
        );
      case "date": {
        const formattedDate = value && String(value).includes("T") ? String(value).split("T")[0] : value;
        return (
          <>
            <input
              type="date"
              value={formattedDate}
              onChange={(e) => handleFieldChange(e.target.value)}
              className={baseInputClass}
            />
            {errorText}
          </>
        );
      }
      case "url":
        return (
          <>
            <input
              type="url"
              value={value}
              onChange={(e) => handleFieldChange(e.target.value)}
              className={baseInputClass}
              placeholder="https://example.com"
            />
            {errorText}
          </>
        );
      case "multiselect": {
        const selected = Array.isArray(value) ? value : value ? String(value).split(",").map((v) => v.trim()) : [];
        return (
          <>
            <div className="flex flex-wrap gap-3 border border-[#1F2937]/10 rounded-2xl p-3">
              {fieldDef.options?.map((option, index) => (
                <label key={index} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                  <Checkbox checked={selected.includes(option)} onChange={() =>
                      handleFieldChange(
                        selected.includes(option)
                          ? selected.filter((v) => v !== option)
                          : [...selected, option]
                      )
                    } />
                  {option}
                </label>
              ))}
            </div>
            {errorText}
          </>
        );
      }
      default:
        return (
          <>
            <input
              type="text"
              value={value}
              onChange={(e) => handleFieldChange(e.target.value)}
              className={baseInputClass}
              placeholder={`Enter ${fieldDef.name}`}
            />
            {errorText}
          </>
        );
    }
  };

  useEffect(() => {
    setTimeout(() => setIsOpen(true), 10);
    setVariants(form.variants || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form._id]);

  const handleClose = () => {
    if (isFormDirty) {
      setShowConfirmDialog(true);
    } else {
      closeForm();
    }
  };

  const closeForm = () => {
    setIsOpen(false);
    setTimeout(() => {
      onRequestClose();
    }, 300);
  };

  const handleConfirmExit = () => {
    setShowConfirmDialog(false);
    closeForm();
  };

  const handleSaveAndExit = async () => {
    setShowConfirmDialog(false);
    await handleSubmit({ preventDefault: () => {} });
  };

  const generateBarcode = () => {
    const timestamp = Date.now();
    const randomNum = Math.floor(Math.random() * 10000);
    const barcode = `${timestamp}${randomNum}`.slice(-12);
    setForm({ ...form, barcode });
    setIsFormDirty(true);
  };

  const generateVariantSku = () => {
    let base = "";
    if (form.name) {
      base = form.name.replace(/[^a-zA-Z]/g, "").substring(0, 3).toUpperCase();
    }
    
    if (base.length === 0) {
      base = "ITM";
    }

    let attrs = "";
    if (currentVariant.attributes) {
        const attributeValues = Object.values(currentVariant.attributes).filter(val => val.trim() !== "");
        if (attributeValues.length > 0) {
           attrs = "-" + attributeValues.map(val => val.replace(/[^a-zA-Z0-9]/g, "").substring(0, 3).toUpperCase()).join("-");
        }
    }

    let sku = "";
    if (attrs.length > 0) {
        sku = `${base}${attrs}`;
    } else {
        const randomString = Math.random().toString(36).substring(2, 7).toUpperCase();
        sku = `${base}-${randomString}`;
    }
    
    setCurrentVariant({ ...currentVariant, sku });
    setIsFormDirty(true);
  };

  const handleFormChange = (field, value) => {
    if (field === "purchasePrice" || field === "sellingPrice") {
      setForm({ ...form, [field]: value === "" ? "" : parseFloat(value) || 0 });
    } else {
      setForm({ ...form, [field]: value });
    }
    setIsFormDirty(true);
    if (validationErrors[field]) {
      setValidationErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const validateForm = () => {
    const errors = {};
    if (!form.name.trim()) errors.name = form.type === "service" ? "Service name is required" : "Item name is required";
    if (form.purchasePrice < 0) errors.purchasePrice = "Invalid price";
    if (form.sellingPrice < 0) errors.sellingPrice = "Invalid price";

    itemFields?.forEach((fieldDef) => {
      if (fieldDef.required) {
        const value = additionalFieldValues[fieldDef.name];
        const isEmpty = Array.isArray(value)
          ? value.length === 0
          : !value || String(value).trim() === "";
        if (isEmpty) {
          errors[`additional_${fieldDef.name}`] = `${fieldDef.name} is required`;
        }
      }
    });

    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      setLoading(true);

      // A variant typed into the open "Add Variant" panel only lives in
      // currentVariant until its own "Add Variant" button commits it into
      // `variants` — submitting the outer form directly (without clicking
      // that button first) used to silently drop it. Auto-commit it here so
      // whatever's on screen actually gets saved.
      const variantsToSave =
        showVariantForm && currentVariant.name?.trim()
          ? variantIndex !== null
            ? variants.map((v, i) => (i === variantIndex ? currentVariant : v))
            : [...variants, currentVariant]
          : variants;

      // Parent opening stock is inert once the item has variants (each
      // variant tracks its own) — force it to 0 regardless of whatever
      // stale value the now-disabled field's state still holds, so the
      // backend never records a spurious opening-stock ledger entry for
      // the parent on top of each variant's own.
      const inventoryToSave = variantsToSave.length > 0
        ? { ...(form.inventory || {}), openingStock: 0 }
        : (form.inventory || {});

      // Flatten the entered custom-field values into the array shape the
      // Item model stores. Multiselect arrays collapse to a comma-separated
      // string, matching how the other modules persist them.
      const processedAdditionalFields = (itemFields || [])
        .map((fieldDef) => {
          let value = additionalFieldValues[fieldDef.name] ?? "";
          if (Array.isArray(value)) value = value.join(", ");
          return {
            key: fieldDef.name,
            value,
            type: fieldDef.type,
            category: fieldDef.category || "Uncategorized",
          };
        })
        .filter((field) => field.value !== "");

      // A variant's freshly picked images have to travel as multipart too, so the request
      // switches to FormData when EITHER the parent or any variant has new files pending.
      const variantsWithNewFiles = variantsToSave.filter((v) => (v._newImageFiles || []).length > 0);

      if (newImageFiles.length > 0 || variantsWithNewFiles.length > 0) {
        // Multipart request: scalar fields go in as strings, array/object
        // fields get JSON-stringified, same approach QuickCompanyForm.jsx
        // uses for its single profilePicture upload, extended to multiple
        // files under one "images" field name.
        const fd = new FormData();
        Object.entries({ ...form, variants: undefined, additionalFields: undefined, images: undefined, discount: undefined, inventory: undefined }).forEach(
          ([key, value]) => {
            if (value === undefined || value === null) return;
            fd.append(key, typeof value === "boolean" ? String(value) : value);
          }
        );
        // `_newImageFiles` is form-only state (File objects); it must not be serialized into
        // the JSON variants payload — the files go as their own multipart parts below.
        fd.append(
          "variants",
          JSON.stringify(variantsToSave.map(stripVariantFileState))
        );
        fd.append("additionalFields", JSON.stringify(processedAdditionalFields));
        fd.append("discount", JSON.stringify(form.discount || { type: "percentage", value: 0 }));
        // Nested object, so it must be JSON-stringified like variants/discount above —
        // appending it raw would send the literal string "[object Object]".
        fd.append("inventory", JSON.stringify(inventoryToSave));
        fd.append("existingImages", JSON.stringify(existingImages));
        newImageFiles.forEach((file) => fd.append("images", file));
        // Indexed by position in the variants array, which is exactly how itemController
        // re-attaches them (partitionUploadedFiles -> variantImages_<index>).
        variantsToSave.forEach((variant, idx) => {
          (variant._newImageFiles || []).forEach((file) => fd.append(`variantImages_${idx}`, file));
        });

        if (form._id) {
          await API.put(`/items/${form._id}`, fd, { headers: { "Content-Type": "multipart/form-data" } });
          toast.success("Item updated successfully!");
        } else {
          await API.post("/items", fd, { headers: { "Content-Type": "multipart/form-data" } });
          toast.success("Item added successfully!");
        }
      } else {
        const payload = {
          ...form,
          variants: variantsToSave.map(stripVariantFileState),
          inventory: inventoryToSave,
          additionalFields: processedAdditionalFields,
          images: existingImages,
        };
        if (form._id) {
          await API.put(`/items/${form._id}`, payload);
          toast.success("Item updated successfully!");
        } else {
          await API.post("/items", payload);
          toast.success("Item added successfully!");
        }
      }
      await fetchItems();
      setIsFormDirty(false);
      closeForm();
    } catch (err) {
      console.error("Submit error:", err);
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || (form._id ? "Failed to update item" : "Failed to add item"));
      }
    } finally {
      setLoading(false);
    }
  };

  // Variant Handlers
  const handleVariantChange = (e) => {
    const { name, value, type, checked } = e.target;
    setCurrentVariant({
      ...currentVariant,
      [name]:
        type === "checkbox"
          ? checked
          : name === "stock" || name.includes("Price")
            ? value === ""
              ? ""
              : parseFloat(value)
            : value,
    });
  };

  const handleAddVariant = () => {
    // Basic validation
    if (!currentVariant.name) {
      toast.error("Variant name is required");
      return;
    }

    const updatedVariants =
      variantIndex !== null
        ? variants.map((v, i) => (i === variantIndex ? currentVariant : v))
        : [...variants, currentVariant];

    setVariants(updatedVariants);
    setForm({ ...form, variants: updatedVariants });
    setShowVariantForm(false);
    setCurrentVariant({
      name: "",
      sku: "",
      attributes: {},
      purchasePrice: 0,
      sellingPrice: 0,
      stock: 0,
      isActive: true,
    });
    setVariantIndex(null);
  };

  const handleEditVariant = (index) => {
    setCurrentVariant(variants[index]);
    setVariantIndex(index);
    setShowVariantForm(true);
  };

  const handleRemoveVariant = (index) => {
    const updated = variants.filter((_, i) => i !== index);
    setVariants(updated);
    setForm({ ...form, variants: updated });
  };

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
        {/* Header — matches the CompanyForm/CompanyTaskForm quick-drawer header spec */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#D9D9D9] flex-shrink-0 bg-white gap-1">
          <h2 className="text-[15px] font-normal leading-6 text-[#78788D] uppercase tracking-wide">
            {form._id ? "Edit Item" : "Create New Item"}
          </h2>
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6 font-inter custom-scrollbar">
          {/* Item/Service Name — label and placeholder follow the Type field below */}
          <div>
            <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
              {form.type === "service" ? "Service Name" : "Item Name"} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => handleFormChange("name", e.target.value)}
              placeholder={form.type === "service" ? "Enter Service Name" : "Enter Item Name"}
              className={`w-full px-3 h-[38px] border rounded-full text-[13px] text-[#1F2937] placeholder:text-[#1F2937] placeholder:opacity-50 font-inter focus:outline-none focus:ring-1 focus:ring-blue-500 ${validationErrors.name ? "border-red-300" : "border-[#1F2937]/10"}` }
            />
            {validationErrors.name && (
              <p className="text-red-500 text-xs mt-1">{validationErrors.name}</p>
            )}
          </div>

          {/* Type */}
          <div>
            <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
              Type <span className="text-red-500">*</span>
            </label>
            <select
              value={form.type}
              onChange={(e) => {
                const nextType = e.target.value;
                handleFormChange("type", nextType);
                // A service can't have variants — clear any in-progress or
                // saved ones so switching away from Product doesn't leave
                // stale variant state around (which would also keep
                // hasVariants true and wrongly disable the parent price/GST/
                // stock fields below).
                if (nextType === "service") {
                  setVariants([]);
                  setForm((prev) => ({ ...prev, type: nextType, variants: [] }));
                  setShowVariantForm(false);
                  setCurrentVariant({
                    name: "",
                    sku: "",
                    attributes: {},
                    purchasePrice: 0,
                    sellingPrice: 0,
                    stock: 0,
                    isActive: true,
                    gstRate: 0,
                  });
                  setVariantIndex(null);
                }
              }}
              className="w-full px-3 h-[38px] bg-white border border-[#1F2937]/10 rounded-full text-[13px] text-[#1F2937] placeholder:text-[#1F2937] placeholder:opacity-50 font-inter focus:outline-none focus:ring-1 focus:ring-blue-500 appearance-none cursor-pointer"
            >
              <option value="product">Product</option>
              <option value="service">Service</option>
            </select>
          </div>

          {/* Variants — a service has nothing to stock or vary in price by
              SKU, so this whole section (and everything it drives: variant
              pricing, variant stock, variant-aware pickers elsewhere) simply
              doesn't apply once Type is Service. */}
          {form.type === "product" && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em]">
                Variants
              </label>
              {!showVariantForm && (
                <button
                  type="button"
                  onClick={() => setShowVariantForm(true)}
                  className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  <PlusIcon className="w-4 h-4" />
                  Add Variant
                </button>
              )}
            </div>

            {showVariantForm && (
              <div className="border border-[#1F2937]/10 rounded-2xl bg-white mb-4 shadow-sm">
                <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                  <h3 className="font-semibold text-gray-900 text-sm">
                    {variantIndex !== null ? "Edit Variant" : "Add Variant"}
                  </h3>
                  <button
                    onClick={() => setShowVariantForm(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-4 space-y-4">
                  <div>
                    <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                      Variant Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={currentVariant.name}
                      onChange={handleVariantChange}
                      className="w-full px-3 h-[38px] border border-[#1F2937]/10 rounded-full text-[13px] text-[#1F2937] placeholder:text-[#1F2937] placeholder:opacity-50 font-inter focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="Enter Variant Name"
                    />
                  </div>

                  <div>
                    <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                      SKU
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        name="sku"
                        autoComplete="off"
                        value={currentVariant.sku}
                        onChange={handleVariantChange}
                        className="flex-1 px-3 h-[38px] border border-[#1F2937]/10 rounded-full text-[13px] text-[#1F2937] placeholder:text-[#1F2937] placeholder:opacity-50 font-inter focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="Enter or Generate SKU"
                      />
                      <button
                        onClick={generateVariantSku}
                        className="bg-blue-600 hover:bg-blue-700 transition-colors text-white text-xs px-4 py-2 rounded-full font-medium whitespace-nowrap"
                      >
                        Generate
                      </button>
                    </div>
                  </div>

                  {/* Attributes Section */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em]">
                        Attributes
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentVariant((prev) => ({
                            ...prev,
                            attributes: { ...prev.attributes, "": "" },
                          }));
                        }}
                        className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        <PlusIcon className="w-4 h-4" />
                        Add Attribute
                      </button>
                    </div>
                    
                    {Object.keys(currentVariant.attributes || {}).length > 0 && (
                      <div className="space-y-2">
                        {Object.entries(currentVariant.attributes || {}).map(([key, val], idx) => (
                          <div key={idx} className="flex gap-2 items-center">
                            <input
                              type="text"
                              value={key}
                              onChange={(e) => {
                                const newKey = e.target.value;
                                setCurrentVariant((prev) => {
                                  const newAttrs = { ...prev.attributes };
                                  const value = newAttrs[key];
                                  delete newAttrs[key];
                                  newAttrs[newKey] = value;
                                  return { ...prev, attributes: newAttrs };
                                });
                              }}
                              className="flex-1 px-3 h-[38px] border border-[#1F2937]/10 rounded-full text-[13px] text-[#1F2937] placeholder:text-[#1F2937] placeholder:opacity-50 font-inter focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder="Attribute Name (e.g. color)"
                            />
                            <input
                              type="text"
                              value={val}
                              onChange={(e) => {
                                const newVal = e.target.value;
                                setCurrentVariant((prev) => ({
                                  ...prev,
                                  attributes: { ...prev.attributes, [key]: newVal },
                                }));
                              }}
                              className="flex-1 px-3 h-[38px] border border-[#1F2937]/10 rounded-full text-[13px] text-[#1F2937] placeholder:text-[#1F2937] placeholder:opacity-50 font-inter focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder="Attribute Value (e.g. Red)"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setCurrentVariant((prev) => {
                                  const newAttrs = { ...prev.attributes };
                                  delete newAttrs[key];
                                  return { ...prev, attributes: newAttrs };
                                });
                              }}
                              className="text-red-500 hover:text-red-600 p-1"
                            >
                              <DeleteIcon className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                        Purchase Price <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        name="purchasePrice"
                        value={currentVariant.purchasePrice}
                        onChange={handleVariantChange}
                        className="w-full px-3 h-[38px] border border-[#1F2937]/10 rounded-full text-[13px] text-[#1F2937] placeholder:text-[#1F2937] placeholder:opacity-50 font-inter focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="Enter Purchase Price"
                      />
                    </div>
                    <div>
                      <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                        Selling Price <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        name="sellingPrice"
                        value={currentVariant.sellingPrice}
                        onChange={handleVariantChange}
                        className="w-full px-3 h-[38px] border border-[#1F2937]/10 rounded-full text-[13px] text-[#1F2937] placeholder:text-[#1F2937] placeholder:opacity-50 font-inter focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="Enter Selling Price"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                        {form._id && variantIndex !== null ? "Current Stock" : "Opening Stock"}
                      </label>
                      <input
                        type="number"
                        name="stock"
                        // Same reasoning as the parent's Current Stock field above: once a
                        // variant already exists, its stock is owned by the StockMovement
                        // ledger and must only change through Inventory's Stock In / Stock Out
                        // — editing it here would silently overwrite real stock and bypass the
                        // audit trail. A brand-new variant has no ledger yet, so its opening
                        // stock is still set here, same as a brand-new item.
                        disabled={!!(form._id && variantIndex !== null)}
                        value={currentVariant.stock}
                        onChange={handleVariantChange}
                        className="w-full px-3 h-[38px] border border-[#1F2937]/10 rounded-full text-[13px] text-[#1F2937] placeholder:text-[#1F2937] placeholder:opacity-50 font-inter focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                      />
                      {form._id && variantIndex !== null && (
                        <p className="mt-1 text-[11px] text-gray-400">
                          Use Stock In / Stock Out on the Inventory page to change stock.
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                        GST Rate
                      </label>
                      <select
                        value={currentVariant.gstRate ?? 0}
                        onChange={(e) =>
                          setCurrentVariant((prev) => ({
                            ...prev,
                            gstRate: parseFloat(e.target.value) || 0,
                          }))
                        }
                        className="w-full px-3 h-[38px] bg-white border border-[#1F2937]/10 rounded-full text-[13px] text-[#1F2937] placeholder:text-[#1F2937] placeholder:opacity-50 font-inter focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                      >
                        {GST_RATES.map((rate) => (
                          <option key={rate} value={rate}>{rate}%</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Ã¢â€â‚¬Ã¢â€â‚¬ Variant-specific overrides Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
                      Each of these belongs to the variant rather than the product: a Small and
                      a Large are scanned, described, pictured and discounted separately. All
                      are optional — left blank, the variant inherits the parent item's value
                      (see utils/variantResolve.js), so existing variants are unaffected. */}
                  <div className="pt-3 mt-1 border-t border-gray-100">
                    <p className="text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">Variant Details</p>
                    <p className="text-[11px] text-gray-400 mb-3">Leave any field blank to use the item's value.</p>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">Barcode</label>
                        <input
                          type="text"
                          name="barcode"
                          autoComplete="off"
                          value={currentVariant.barcode ?? ""}
                          onChange={handleVariantChange}
                          className="w-full px-3 h-[38px] border border-[#1F2937]/10 rounded-full text-[13px] text-[#1F2937] placeholder:text-[#1F2937] placeholder:opacity-50 font-inter focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="Scan or enter barcode"
                        />
                      </div>

                      <div>
                        <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">Low Stock Alert at</label>
                        <input
                          type="number"
                          min="0"
                          name="lowStockThreshold"
                          value={currentVariant.lowStockThreshold ?? ""}
                          onChange={handleVariantChange}
                          onWheel={(e) => e.target.blur()}
                          className="w-full px-3 h-[38px] border border-[#1F2937]/10 rounded-full text-[13px] text-[#1F2937] placeholder:text-[#1F2937] placeholder:opacity-50 font-inter focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="Item default"
                        />
                      </div>

                      <div>
                        <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">Discount</label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            min="0"
                            value={currentVariant.discount?.value ?? ""}
                            onChange={(e) =>
                              setCurrentVariant((prev) => ({
                                ...prev,
                                discount: { ...(prev.discount || {}), type: prev.discount?.type || "percentage", value: e.target.value },
                              }))
                            }
                            onWheel={(e) => e.target.blur()}
                            className="flex-1 min-w-0 px-3 h-[38px] border border-[#1F2937]/10 rounded-full text-[13px] text-[#1F2937] placeholder:text-[#1F2937] placeholder:opacity-50 font-inter focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="Item default"
                          />
                          <select
                            value={currentVariant.discount?.type || "percentage"}
                            onChange={(e) =>
                              setCurrentVariant((prev) => ({
                                ...prev,
                                discount: { ...(prev.discount || {}), value: prev.discount?.value ?? "", type: e.target.value },
                              }))
                            }
                            className="px-2 py-2 bg-white border border-[#1F2937]/10 rounded-full text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                          >
                            <option value="percentage">%</option>
                            <option value="amount">₹</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">Max Discount %</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.5"
                          name="maxDiscountPercent"
                          value={currentVariant.maxDiscountPercent ?? ""}
                          onChange={handleVariantChange}
                          onWheel={(e) => e.target.blur()}
                          className="w-full px-3 h-[38px] border border-[#1F2937]/10 rounded-full text-[13px] text-[#1F2937] placeholder:text-[#1F2937] placeholder:opacity-50 font-inter focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="Item default"
                        />
                      </div>
                    </div>

                    <div className="mt-3">
                      <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">Description</label>
                      <textarea
                        name="description"
                        rows={2}
                        value={currentVariant.description ?? ""}
                        onChange={handleVariantChange}
                        className="w-full px-3 h-[38px] border border-[#1F2937]/10 rounded-full text-[13px] text-[#1F2937] placeholder:text-[#1F2937] placeholder:opacity-50 font-inter focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                        placeholder="Item description"
                      />
                    </div>

                    <div className="mt-3">
                      <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">Images</label>
                      <VariantImagePicker
                        variant={currentVariant}
                        onChange={(next) => setCurrentVariant((prev) => ({ ...prev, ...next }))}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <Checkbox checked={currentVariant.isActive !== false} onChange={(e) => setCurrentVariant(prev => ({ ...prev, isActive: e.target.checked }))} id="variantActive" name="isActive" />
                    <label htmlFor="variantActive" className="text-sm font-medium text-gray-900">
                      Active
                    </label>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowVariantForm(false)}
                      className="flex-1 border border-red-200 text-red-500 font-medium rounded-full hover:bg-red-50 py-2 text-sm transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleAddVariant}
                      className="flex-1 bg-[#0085FF] hover:bg-blue-600 text-white font-medium rounded-full py-2 text-sm transition-colors shadow-sm"
                    >
                      {variantIndex !== null ? "Update Variant" : "Add Variant"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {!showVariantForm && variants.length === 0 ? (
              <div className="w-full px-4 py-3 border border-dashed border-gray-200 rounded-xl text-xs text-gray-400 text-center">
                No Variants Added
              </div>
            ) : !showVariantForm && variants.length > 0 ? (
              <div className="space-y-2">
                {variants.map((v, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-center bg-gray-50 border border-gray-100 rounded-lg p-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {v.name}
                      </div>
                      <div className="text-xs text-gray-500 truncate mt-0.5">
                        SKU: {v.sku || "N/A"} | ₹{v.sellingPrice}
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => handleEditVariant(i)}
                        className="text-blue-600 hover:text-blue-700 p-1.5 rounded hover:bg-blue-50 transition-colors"
                      >
                        <Type className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveVariant(i)}
                        className="text-red-600 hover:text-red-700 p-1.5 rounded hover:bg-red-50 transition-colors"
                      >
                        <DeleteIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          )}

          {/* Hidden once the item has variants: each variant carries its own, and showing an
              editable parent copy would leave the user unsure which one actually applies. */}
          {!hasVariants && (
          <div>
            <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
              Description
            </label>
            <div className="bg-white border border-[#1F2937]/10 rounded-2xl">
              <ReactQuill
                theme="snow"
                value={form.description}
                onChange={(val) => handleFormChange("description", val)}
                className="h-48 mb-10"
              />
            </div>
          </div>
          )}

          {/* Price Row — disabled once the item has variants: each variant
              carries its own price, and every item-picker across the app
              (Purchase/PO/Quotation/Invoice/Delivery Challan) already offers
              only the variants — not this parent price — once they exist. */}
          {!hasVariants && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Purchase Price <span className="text-red-500">*</span>
              </label>
              {/* Each price carries its own With/Without Tax, same as the Add form. */}
              <div className="flex border border-[#1F2937]/10 rounded-full overflow-hidden bg-white focus-within:ring-1 focus-within:ring-blue-500">
                <input
                  type="number"
                  min="0"
                  value={form.purchasePrice}
                  onChange={(e) =>
                    handleFormChange("purchasePrice", e.target.value)
                  }
                  className="flex-1 min-w-0 px-3 h-[38px] text-[13px] text-[#1F2937] font-inter focus:outline-none"
                  placeholder="Enter Purchase Price"
                />
                <select
                  value={form.purchaseTaxInclusive ? "with" : "without"}
                  onChange={(e) => handleFormChange("purchaseTaxInclusive", e.target.value === "with")}
                  className="px-2 h-[38px] bg-gray-50 border-l border-[#1F2937]/10 text-[13px] text-[#1F2937] font-inter focus:outline-none flex-shrink-0"
                >
                  <option value="without">Without Tax</option>
                  <option value="with">With Tax</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Selling Price <span className="text-red-500">*</span>
              </label>
              <div className="flex border border-[#1F2937]/10 rounded-full overflow-hidden bg-white focus-within:ring-1 focus-within:ring-blue-500">
                <input
                  type="number"
                  min="0"
                  value={form.sellingPrice}
                  onChange={(e) =>
                    handleFormChange("sellingPrice", e.target.value)
                  }
                  className="flex-1 min-w-0 px-3 h-[38px] text-[13px] text-[#1F2937] font-inter focus:outline-none"
                  placeholder="Enter Selling Price"
                />
                <select
                  value={form.taxInclusive ? "with" : "without"}
                  onChange={(e) => handleFormChange("taxInclusive", e.target.value === "with")}
                  className="px-2 h-[38px] bg-gray-50 border-l border-[#1F2937]/10 text-[13px] text-[#1F2937] font-inter focus:outline-none flex-shrink-0"
                >
                  <option value="without">Without Tax</option>
                  <option value="with">With Tax</option>
                </select>
              </div>
            </div>
          </div>
          )}

          {/* GST Rate. With/Without Tax now sits on each price above, replacing the single
              "Tax Inclusive" checkbox, which couldn't express the purchase price's own basis. */}
          {!hasVariants && (
          <div className="flex items-center justify-end gap-4">
            <div className="flex items-center gap-2">
              <label className="text-[13px] font-medium text-[#161618] tracking-[-0.05em]">
                GST Rate
              </label>
              <select
                value={form.gstRate ?? 0}
                onChange={(e) => handleFormChange("gstRate", parseFloat(e.target.value) || 0)}
                className="px-3 py-1.5 bg-white border border-[#1F2937]/10 rounded-full text-[13px] text-[#1F2937] font-inter focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                {GST_RATES.map((rate) => (
                  <option key={rate} value={rate}>{rate}%</option>
                ))}
              </select>
            </div>
          </div>
          )}

          {/* Hidden once the item has variants: each variant carries its own, and showing an
              editable parent copy would leave the user unsure which one actually applies. */}
          {!hasVariants && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Discount
              </label>
              <div className="flex border border-[#1F2937]/10 rounded-full overflow-hidden focus-within:ring-1 focus-within:ring-blue-500 bg-white">
                <input
                  type="number"
                  min="0"
                  value={form.discount?.value ?? 0}
                  onChange={(e) =>
                    handleFormChange("discount", { ...(form.discount || { type: "percentage" }), value: parseFloat(e.target.value) || 0 })
                  }
                  className="flex-1 min-w-0 px-3 h-[38px] text-[13px] text-[#1F2937] font-inter focus:outline-none"
                />
                <select
                  value={form.discount?.type ?? "percentage"}
                  onChange={(e) =>
                    handleFormChange("discount", { ...(form.discount || { value: 0 }), type: e.target.value })
                  }
                  className="px-2 h-[38px] bg-gray-50 border-l border-[#1F2937]/10 text-[13px] text-[#1F2937] font-inter focus:outline-none"
                >
                  <option value="percentage">% Percentage</option>
                  <option value="amount">₹ Amount</option>
                </select>
              </div>
              <p className="mt-1 text-[11px] text-gray-400">Default discount applied when added to a document.</p>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Max Discount %
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                placeholder="e.g. 10"
                value={form.maxDiscountPercent ?? ""}
                onChange={(e) => handleFormChange("maxDiscountPercent", e.target.value)}
                className="w-full px-3 h-[38px] bg-white border border-[#1F2937]/10 rounded-full text-[13px] text-[#1F2937] placeholder:text-[#1F2937] placeholder:opacity-50 font-inter focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="mt-1 text-[11px] text-gray-400">Leave blank for no limit.</p>
            </div>
          </div>
          )}

          {/* HSN/SAC */}
          <div>
            <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
              HSN/SAC Code
            </label>
            <input
              type="text"
              value={form.hsnSac}
              onChange={(e) => handleFormChange("hsnSac", e.target.value)}
              className="w-full px-3 h-[38px] bg-white border border-[#1F2937]/10 rounded-full text-[13px] text-[#1F2937] placeholder:text-[#1F2937] placeholder:opacity-50 font-inter focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Enter HSN/SAC Code"
            />
          </div>

          {/* Hidden once the item has variants: each variant carries its own, and showing an
              editable parent copy would leave the user unsure which one actually applies. */}
          {!hasVariants && (
          <div>
            <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
              Barcode
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.barcode}
                onChange={(e) => handleFormChange("barcode", e.target.value)}
                className="flex-1 min-w-0 px-3 h-[38px] bg-white border border-[#1F2937]/10 rounded-full text-[13px] text-[#1F2937] placeholder:text-[#1F2937] placeholder:opacity-50 font-inter focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Enter or Generate Barcode"
              />
              <button
                type="button"
                onClick={generateBarcode}
                className="flex-shrink-0 bg-[#158FFF] hover:opacity-90 text-white px-4 h-[38px] rounded-full text-xs font-medium transition-colors"
              >
                Generate
              </button>
            </div>
          </div>
          )}

          {/* Category */}
          <div>
            <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
              Category
            </label>
            <input
              type="text"
              value={form.category}
              onChange={(e) => handleFormChange("category", e.target.value)}
              className="w-full px-3 h-[38px] bg-white border border-[#1F2937]/10 rounded-full text-[13px] text-[#1F2937] placeholder:text-[#1F2937] placeholder:opacity-50 font-inter focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Enter Item Category"
            />
          </div>

          {/* Hidden once the item has variants: each variant carries its own, and showing an
              editable parent copy would leave the user unsure which one actually applies. */}
          {!hasVariants && (
          <div>
            <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
              {form.type === "service" ? "Service Images" : "Product Images"}
            </label>
            <div className="flex flex-wrap gap-3">
              {existingImages.map((url) => (
                <div key={url} className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-200 group">
                  <img src={url} alt="" className="w-full h-full object-cover cursor-pointer" onClick={() => setSelectedImageUrl(url)} />
                  <button
                    type="button"
                    onClick={() => handleRemoveExistingImage(url)}
                    className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {newImagePreviews.map((url, i) => (
                <div key={url} className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-200 group">
                  <img src={url} alt="" className="w-full h-full object-cover cursor-pointer" onClick={() => setSelectedImageUrl(url)} />
                  <button
                    type="button"
                    onClick={() => handleRemoveNewImage(i)}
                    className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="w-20 h-20 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50 flex flex-col items-center justify-center text-gray-400 hover:bg-gray-100 hover:border-gray-300 transition-colors"
              >
                <PlusIcon className="w-4 h-4 mb-1" />
                <span className="text-[11px] font-medium">Upload</span>
              </button>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageSelect}
                className="hidden"
              />
            </div>
            <p className="mt-1.5 text-[11px] text-gray-400">Up to 10 images</p>
          </div>
          )}

          {/* Primary Unit */}
          <div>
            <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
              Primary Unit <span className="text-red-500">*</span>
            </label>
            <select
              value={form.primaryUnit}
              onChange={(e) => handleFormChange("primaryUnit", e.target.value)}
              className="w-full px-3 h-[38px] bg-white border border-[#1F2937]/10 rounded-full text-[13px] text-[#1F2937] placeholder:text-[#1F2937] placeholder:opacity-50 font-inter focus:outline-none focus:ring-1 focus:ring-blue-500 appearance-none cursor-pointer"
            >
              {/* Same units and saved format as the Add form (unitOptions.js). Previously only 4
                  hyphenated values ("PCS-PIECES"), so an item created via Add ("PCS PIECES", or
                  any of the other units) matched no option: the dropdown showed the wrong unit
                  and a save could overwrite it. A saved value outside the list (e.g. an older
                  hyphenated one) is still listed first so it's never silently replaced. */}
              {form.primaryUnit && !UNIT_OPTIONS.map(unitLabelToValue).includes(form.primaryUnit) && (
                <option value={form.primaryUnit}>{form.primaryUnit}</option>
              )}
              {UNIT_OPTIONS.map((label) => (
                <option key={label} value={unitLabelToValue(label)}>{label}</option>
              ))}
            </select>
          </div>

          {/* Inventory — every product appears on the Inventory page automatically, so there's no
              opt-in toggle here. Leaving the quantity blank simply starts the item at 0.
              After creation the stock level changes exclusively through Inventory's
              Stock In / Stock Out, so it stays backed by the movement ledger instead of being
              silently overwritten by a product save. Services carry no stock. */}
          {form.type === "product" && (
            <div className="pt-4 space-y-6">
              <h3 className="text-[16px] font-bold text-[#111216]">Inventory</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                    {form._id ? "Current Stock" : "Opening Quantity"}
                  </label>
                  <input
                    type="number"
                    step="any"
                    // Opening quantity is the starting balance and is recorded as the first
                    // ledger entry, so it can only be set while creating the item. Also
                    // disabled once the item has variants — each variant carries its own
                    // opening stock (see the variant panel below); the parent's own opening
                    // quantity would otherwise double-count against the variant total.
                    disabled={!!form._id || hasVariants}
                    placeholder="0"
                    value={hasVariants ? 0 : (form.inventory?.openingStock ?? 0)}
                    onChange={(e) =>
                      handleFormChange("inventory", {
                        ...(form.inventory || {}),
                        openingStock: e.target.value,
                      })
                    }
                    className="w-full px-3 h-[38px] bg-white border border-[#1F2937]/10 rounded-full text-[13px] text-[#1F2937] placeholder:text-[#1F2937] placeholder:opacity-50 font-inter focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                  />
                  <p className="mt-1 text-[11px] text-gray-400">
                    {hasVariants
                      ? "Managed by variants — set each variant's own stock below."
                      : form._id
                        ? "Use Stock In / Stock Out on the Inventory page to change stock."
                        : "Leave blank to start at 0."}
                  </p>
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                    Low Stock Alert At
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0"
                    // Disabled (not hidden) once there are variants, matching the Opening Stock
                    // field beside it — hiding just one half would leave this grid lopsided.
                    // Each variant sets its own threshold and falls back to this value only
                    // while it has none of its own.
                    disabled={hasVariants}
                    value={form.inventory?.lowStockThreshold ?? 0}
                    onChange={(e) =>
                      handleFormChange("inventory", {
                        ...(form.inventory || {}),
                        lowStockThreshold: e.target.value,
                      })
                    }
                    className="w-full px-3 h-[38px] bg-white border border-[#1F2937]/10 rounded-full text-[13px] text-[#1F2937] placeholder:text-[#1F2937] placeholder:opacity-50 font-inter focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                  />
                  {hasVariants && (
                    <p className="mt-1 text-[11px] text-gray-400">
                      Managed by variants — set each variant's own alert level below.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Active */}
          <div className="flex items-center gap-2">
            <Checkbox checked={form.isActive} onChange={(e) => handleFormChange("isActive", e.target.checked)} />
            <label className="text-sm text-gray-700 font-medium">
              Active
            </label>
          </div>

          {/* Custom Fields (Categorized & Collapsible) — sits after the
              basic info above and before the stock/variants block below,
              matching the section order used across the other modules. */}
          {sortedCategories.length > 0 && (
            <div className="mt-6 border-t border-gray-100 pt-6 space-y-4">
              <h3 className="text-sm font-semibold text-gray-900">Custom Fields</h3>

              {sortedCategories.map((category) => (
                <div key={category} className="pt-4 space-y-6">
                  <button
                    type="button"
                    onClick={() => toggleSection(category)}
                    className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors focus:outline-none"
                  >
                    <div className="flex items-center gap-2">
                      <FolderOpen className="w-4 h-4 text-indigo-600" />
                      <span className="font-bold text-gray-800 text-sm uppercase tracking-wide">{category}</span>
                      <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full font-medium ml-2">
                        {groupedFields[category].length}
                      </span>
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${expandedSections[category] ? "rotate-180" : ""}`}
                    />
                  </button>

                  {expandedSections[category] && (
                    <div className="space-y-6 font-inter">
                      {groupedFields[category].map((fieldDef) => (
                        <div key={fieldDef.name}>
                          <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                            {fieldDef.name}
                            {fieldDef.required && <span className="text-red-500 ml-1">*</span>}
                          </label>
                          {renderFieldInput(fieldDef, additionalFieldValues[fieldDef.name])}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Stock — Variants List (Minified) */}
          {variants.length > 0 && (
            <div className="mt-6 border-t border-gray-100 pt-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                Variants ({variants.length})
              </h3>
              <div className="space-y-2">
                {variants.map((v, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-center bg-gray-50 border border-gray-100 rounded-lg p-3"
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {v.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        SKU: {v.sku} | ₹{v.sellingPrice}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEditVariant(i)}
                        className="text-blue-600 hover:text-blue-700 p-1"
                      >
                        <Type className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleRemoveVariant(i)}
                        className="text-red-600 hover:text-red-700 p-1"
                      >
                        <DeleteIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer — matches the CompanyTaskForm quick-drawer footer spec */}
        <div className="flex-shrink-0 py-2.5 px-4 border-t border-gray-100 bg-white flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="px-6 py-2 border border-gray-200 text-gray-700 rounded-[25px] text-sm font-bold hover:bg-gray-50 transition-colors font-inter"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="px-6 py-2 bg-[#158FFF] text-white rounded-[25px] text-sm font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-inter"
          >
            {loading ? "Saving..." : form._id ? "Update Item" : "Create Item"}
          </button>
        </div>
      </div>

      {/* Nested Variant Form removed as it's now inline */}

      {/* Unsaved-changes confirmation — closing (X/backdrop/Cancel) while the
          form is dirty asks instead of silently discarding edits. */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-[1px] z-[10002] flex items-center justify-center p-4">
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-gray-900 mb-2">
              Discard unsaved changes?
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              You have unsaved changes to this item. Choose what to do before closing.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleSaveAndExit}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-70"
              >
                {loading ? "Saving..." : form._id ? "Save Changes" : "Save Item"}
              </button>
              <button
                type="button"
                onClick={handleConfirmExit}
                className="w-full border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Discard Changes
              </button>
              <button
                type="button"
                onClick={() => setShowConfirmDialog(false)}
                className="w-full text-gray-500 text-xs py-1.5 hover:text-gray-700 transition-colors"
              >
                Keep Editing
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedImageUrl && (
        <div 
          className="fixed inset-0 z-[100010] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setSelectedImageUrl(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <button 
              className="absolute -top-10 right-0 text-white hover:text-gray-300"
              onClick={() => setSelectedImageUrl(null)}
            >
              <X className="w-8 h-8" />
            </button>
            <img 
              src={selectedImageUrl} 
              alt="Zoomed product preview" 
              className="max-w-full max-h-[90vh] object-contain rounded shadow-2xl border border-white/10"
            />
          </div>
        </div>
      )}
    </>
  );
};

export default ItemForm;
