import DeleteIcon from "../common/DeleteIcon";
import { UNIT_OPTIONS } from "./unitOptions";
import VariantImagePicker from "./VariantImagePicker";
import { stripVariantFileState } from "../../utils/variantResolve";
import Checkbox from "../common/Checkbox";
import PlusIcon from "../common/PlusIcon";
import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  X,
  ChevronRight,
  Lock,
} from "lucide-react";
import ReactQuill from "react-quill-new";
import toast from "react-hot-toast";
import API from "../../services/api";
import CustomDropdown from "../common/CustomDropdown";
import EditIcon from "../common/EditIcon";


// onSaved(item) fires after the item is actually created in the backend â€”
// callers use it to refresh their item list / picker, same as ItemForm's
// fetchItems callback.
const BLANK_FORM = {
  name: "",
  sellingPrice: "",
  sellingPriceTax: "without Tax",
  purchasePriceTax: "without Tax",
  taxPercent: "0",
  primaryUnit: "",
  hsnSac: "",
  purchasePrice: "",
  barcode: "",
  category: "",
  description: "",
  openingQuantity: "0",
  discountValue: "0",
  discountType: "percentage",
  maxDiscountPercent: "",
  lowStockAlert: "0",
};

// The override fields start as "" rather than 0: empty means "inherit the parent item's
// value", while 0 is a real, deliberate setting. The backend preserves that distinction.
const BLANK_VARIANT = {
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
};

// Standard Indian GST slabs, matching the per-item select used on document
// forms (e.g. InvoiceForm.jsx).
const GST_RATES = [0, 5, 12, 18, 28];

export default function QuickItemDrawer({ isOpen, onClose, onSaved }) {
  const [type, setType] = useState("Product");
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState([]);

  // Form State
  const [form, setForm] = useState(BLANK_FORM);

  // Variant state
  const [variants, setVariants] = useState([]);
  const [showVariantForm, setShowVariantForm] = useState(false);
  const [currentVariant, setCurrentVariant] = useState(BLANK_VARIANT);
  const [variantIndex, setVariantIndex] = useState(null);

  // Product images: newly picked files plus their preview URLs (there are no
  // existing images yet â€” this drawer only creates new items).
  const [imageFiles, setImageFiles] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const imageInputRef = useRef(null);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [isSliding, setIsSliding] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(null);

  // Slide-in/out animation, matching the quick-drawer forms (CompanyForm,
  // ItemForm, CallLogForm) instead of popping open/closed instantly.
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setTimeout(() => setIsSliding(true), 10);
    } else {
      setIsSliding(false);
      setTimeout(() => setShouldRender(false), 300);
    }
  }, [isOpen]);

  const handleClose = () => {
    setIsSliding(false);
    setTimeout(() => onClose(), 300);
  };

  useEffect(() => {
    const urls = imageFiles.map((f) => URL.createObjectURL(f));
    setImagePreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [imageFiles]);

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length) setImageFiles((prev) => [...prev, ...files]);
    e.target.value = "";
  };

  const handleRemoveImage = (index) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    if (!isOpen) return;
    setShowMoreDetails(false);
    setType("Product");
    setForm(BLANK_FORM);
    setVariants([]);
    setShowVariantForm(false);
    setCurrentVariant(BLANK_VARIANT);
    setVariantIndex(null);
    setImageFiles([]);
    API.get("/items/categories")
      .then((res) => setCategories(res.data || []))
      .catch((err) => console.error("Failed to load item categories:", err));
  }, [isOpen]);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleVariantChange = (e) => {
    const { name, value, type: inputType, checked } = e.target;
    setCurrentVariant((prev) => ({
      ...prev,
      [name]:
        inputType === "checkbox"
          ? checked
          : name === "stock" || name.includes("Price")
          ? value === "" ? "" : parseFloat(value)
          : value,
    }));
  };

  const generateVariantSku = () => {
    const base = form.name
      ? form.name.replace(/[^a-zA-Z]/g, "").substring(0, 3).toUpperCase() || "ITM"
      : "ITM";
    const attrValues = Object.values(currentVariant.attributes || {}).filter((v) => v.trim());
    const attrPart = attrValues.length
      ? "-" + attrValues.map((v) => v.replace(/[^a-zA-Z0-9]/g, "").substring(0, 3).toUpperCase()).join("-")
      : "-" + Math.random().toString(36).substring(2, 7).toUpperCase();
    setCurrentVariant((prev) => ({ ...prev, sku: base + attrPart }));
  };

  const handleAddVariant = () => {
    if (!currentVariant.name.trim()) {
      toast.error("Variant name is required");
      return;
    }
    const updated =
      variantIndex !== null
        ? variants.map((v, i) => (i === variantIndex ? currentVariant : v))
        : [...variants, currentVariant];
    setVariants(updated);
    setShowVariantForm(false);
    setCurrentVariant(BLANK_VARIANT);
    setVariantIndex(null);
  };

  const handleEditVariant = (index) => {
    setCurrentVariant(variants[index]);
    setVariantIndex(index);
    setShowVariantForm(true);
  };

  const handleRemoveVariant = (index) => {
    setVariants((prev) => prev.filter((_, i) => i !== index));
  };

  const generateBarcode = () => {
    const ts = Date.now();
    const rnd = Math.floor(Math.random() * 10000);
    handleChange("barcode", `${ts}${rnd}`.slice(-12));
  };

  // Maps this drawer's fields onto the Item model's shape (see ItemForm.jsx),
  // then actually creates it via the same /items endpoint.
  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error(type === "Service" ? "Service name is required" : "Product name is required");
      return;
    }
    try {
      setSaving(true);
      // A variant typed into the open "Add Variant" panel only lives in
      // currentVariant until its own "Add Variant" button commits it into
      // `variants` â€” saving the drawer directly (without clicking that
      // button first) used to silently drop it. Auto-commit it here so
      // whatever's on screen actually gets saved.
      const variantsToSave =
        showVariantForm && currentVariant.name?.trim()
          ? variantIndex !== null
            ? variants.map((v, i) => (i === variantIndex ? currentVariant : v))
            : [...variants, currentVariant]
          : variants;
      const payload = {
        type: type === "Service" ? "service" : "product",
        name: form.name,
        description: form.description,
        purchasePrice: parseFloat(form.purchasePrice) || 0,
        sellingPrice: parseFloat(form.sellingPrice) || 0,
        taxInclusive: form.sellingPriceTax === "with Tax",
        purchaseTaxInclusive: form.purchasePriceTax === "with Tax",
        gstRate: parseFloat(form.taxPercent) || 0,
        hsnSac: form.hsnSac,
        barcode: form.barcode,
        category: form.category,
        primaryUnit: form.primaryUnit || "OTH OTHERS",
        isActive: true,
        variants: variantsToSave,
        // Default discount applied when this product is added to a
        // document â€” the user can still change it there.
        discount: { type: form.discountType, value: parseFloat(form.discountValue) || 0 },
        // Upper bound on document discount %, null = no limit.
        maxDiscountPercent: form.maxDiscountPercent === "" || form.maxDiscountPercent === undefined
          ? null
          : parseFloat(form.maxDiscountPercent),
        // Stock settings live under a nested `inventory` object â€” that's the
        // only shape itemController.createItem reads (matching ItemForm.jsx).
        // The ledger's opening-stock unit price comes from the Purchase Price
        // field above, so there is no separate opening-price input.
        inventory: {
          // Parent opening stock is inert once the item has variants (each variant tracks
          // its own), and the Opening Stock block is hidden in that case â€” but the field's
          // state keeps whatever was typed before the first variant was added. Force it to
          // 0 so a stale quantity can't ride along, matching ItemForm.jsx.
          openingStock: variantsToSave.length > 0 ? 0 : (parseFloat(form.openingQuantity) || 0),
          lowStockThreshold: parseFloat(form.lowStockAlert) || 0,
        },
      };

      // A variant's freshly picked images have to travel as multipart too, so the request
      // switches to FormData when EITHER the parent or any variant has new files pending.
      const anyVariantHasNewFiles = variantsToSave.some((v) => (v._newImageFiles || []).length > 0);

      let res;
      if (imageFiles.length > 0 || anyVariantHasNewFiles) {
        // Multipart request: scalar fields go in as strings, object/array
        // fields get JSON-stringified, same approach QuickCompanyForm.jsx
        // uses for its single profilePicture upload, extended to multiple
        // files under one "images" field name.
        const fd = new FormData();
        Object.entries(payload).forEach(([key, value]) => {
          if (key === "variants" || key === "discount" || key === "inventory") return;
          fd.append(key, value === null || value === undefined ? "" : (typeof value === "boolean" ? String(value) : value));
        });
        // `_newImageFiles` is form-only state (File objects) and must not be serialized into
        // the JSON variants payload â€” the files go as their own multipart parts below.
        fd.append("variants", JSON.stringify(variantsToSave.map(stripVariantFileState)));
        fd.append("discount", JSON.stringify(payload.discount));
        fd.append("inventory", JSON.stringify(payload.inventory));
        imageFiles.forEach((file) => fd.append("images", file));
        // Indexed by position in the variants array, matching itemController's
        // partitionUploadedFiles (variantImages_<index>).
        variantsToSave.forEach((variant, idx) => {
          (variant._newImageFiles || []).forEach((file) => fd.append(`variantImages_${idx}`, file));
        });
        res = await API.post("/items", fd, { headers: { "Content-Type": "multipart/form-data" } });
      } else {
        res = await API.post("/items", {
          ...payload,
          variants: variantsToSave.map(stripVariantFileState),
          images: [],
        });
      }
      toast.success("Item added successfully!");
      if (onSaved) onSaved(res.data);
      onClose();
    } catch (err) {
      console.error("Failed to add item:", err);
      toast.error(err.response?.data?.error || "Failed to add item");
    } finally {
      setSaving(false);
    }
  };

  if (!shouldRender) return null;

  /* shared input/label style matching the QuickDealForm quick-drawer pattern */
  const inp = "w-full border border-[#1F2937]/10 rounded-full px-4 h-11 text-sm text-[#1F2937] bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50 font-inter";
  const lbl = "block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2 font-inter";
  const hasVariants = variants.length > 0 || showVariantForm;

  // Portaled to <body> â€” this drawer is opened from inside CreateInvoicePanel
  // (InvoiceForm.jsx), which is itself a `fixed` element with its own
  // z-index (z-[60]) and therefore its own stacking context. Rendered as a
  // plain JSX child there, this drawer's backdrop/panel would be trapped
  // inside that z-60 context â€” any z-index set on them, however high,
  // only ranks them among CreateInvoicePanel's own siblings, so the whole
  // subtree still paints below the app header/sidebar (z-9992/z-9995)
  // instead of covering and blurring them. Portaling escapes that context
  // entirely, matching how ShareFlyoutMenu.jsx already does this.
  return createPortal(
    <>
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[100005] transition-opacity duration-300"
        style={{ opacity: isSliding ? 1 : 0 }}
        onClick={handleClose}
      />
      {/* Wider than the standard dc-panel-w (33vw/440px) â€” this drawer holds
          several 2-column sectioned cards that need the room â€” but shares the
          same dc-panel-card inset/rounded-corner chrome and slide animation
          as the rest of the quick-drawer forms. */}
      <div
        className={`fixed dc-panel-card z-[100006] w-[calc(100%-3rem)] max-w-[860px] bg-white flex flex-col shadow-2xl transform transition-transform duration-300 ease-out font-inter ${isSliding ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* â”€â”€ Header â”€â”€ */}
        <div className="bg-white border-b border-[#D9D9D9] flex-shrink-0 rounded-t-2xl">
          <div className="flex items-center justify-between px-6 py-3">
            <div className="flex items-center gap-3">
              <button onClick={handleClose} title="Close" className="w-5 h-5 flex items-center justify-center text-[#1C1B1F] hover:opacity-70 transition-opacity" aria-label="Close">
                <X className="w-[18px] h-[18px]" strokeWidth={2} />
              </button>
              <h2 className="text-[15px] font-normal leading-6 text-[#78788D] uppercase tracking-wide">Add Item</h2>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-[#158FFF] text-white rounded-[25px] text-sm font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Addingâ€¦" : "Add Item"}
            </button>
          </div>
        </div>

        {/* â”€â”€ Scrollable body â”€â”€ */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">

          {/* â”€â”€ Basic Details â€” flat section, no card wrapper (matches
              CompanyForm.jsx/QuickCompanyForm's heading+divider style) â”€â”€ */}
          <div className="space-y-4">
            <div className="pb-1.5">
              <span className="text-[16px] font-bold text-[#111216]">Basic Details</span>
            </div>

            {/* Product / Service toggle */}
              <div className="inline-flex p-0.5 bg-gray-100 rounded-full border border-gray-200">
                {["Product", "Service"].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setType(t);
                      // A service can't have variants â€” clear any in-progress
                      // or saved ones so switching away from Product doesn't
                      // leave stale variant state around (which would also
                      // keep hasVariants true and wrongly hide the Selling/
                      // Purchase Price fields below).
                      if (t === "Service") {
                        setVariants([]);
                        setShowVariantForm(false);
                        setCurrentVariant(BLANK_VARIANT);
                        setVariantIndex(null);
                      }
                    }}
                    className={`px-6 py-1.5 text-sm font-medium rounded-full transition-colors ${
                      type === t ? "bg-[#158FFF] text-white shadow" : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* Item/Service Name â€” label and placeholder follow the Product/Service toggle */}
              <div>
                <label className={lbl}>{type === "Service" ? "Service Name" : "Item Name"} <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => handleChange("name", e.target.value)}
                  placeholder={type === "Service" ? "Enter Service Name" : "Enter Item Name"}
                  className={inp}
                />
              </div>

              {/* Selling Price + Tax % */}
              {!hasVariants && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Selling Price</label>
                  <div className="flex h-11 border border-[#1F2937]/10 rounded-full overflow-hidden focus-within:ring-1 focus-within:ring-blue-500 font-inter">
                    <span className="flex items-center px-2 bg-gray-50 border-r border-[#1F2937]/10 text-gray-500 text-sm flex-shrink-0">â‚¹</span>
                    <input
                      type="number"
                      value={form.sellingPrice}
                      onChange={(e) => handleChange("sellingPrice", e.target.value)}
                      onWheel={(e) => e.target.blur()}
                      placeholder="0"
                      className="flex-1 px-2 text-sm text-[#1F2937] focus:outline-none min-w-0 w-0 bg-white"
                    />
                    <select
                      value={form.sellingPriceTax}
                      onChange={(e) => handleChange("sellingPriceTax", e.target.value)}
                      className="px-1.5 bg-gray-50 border-l border-[#1F2937]/10 text-[10px] text-gray-600 focus:outline-none flex-shrink-0 w-[62px]"
                    >
                      <option value="without Tax">w/o Tax</option>
                      <option value="with Tax">w/ Tax</option>
                    </select>
                  </div>
                  <p className="mt-1 text-[11px] text-gray-500">Exclusive of Taxes</p>
                </div>

                <div>
                  <label className={lbl}>Tax % <span className="text-red-500">*</span></label>
                  {/* Single control: its value IS the saved GST rate. (This used
                      to be a number box plus a separate breakdown dropdown that
                      weren't wired together â€” picking a breakdown option didn't
                      change the number that actually got saved.)
                      CustomDropdown instead of a native <select> â€” the
                      breakdown labels are long, and a native <select>'s
                      expanded option list uses the OS/browser's own font
                      size on mobile (not stylable via CSS), which rendered
                      far larger than the rest of the form. */}
                  <CustomDropdown
                    options={GST_RATES.map((rate) => `${rate}% (${rate / 2}% CGST & ${rate / 2}% SGST, ${rate}% IGST)`)}
                    value={`${form.taxPercent}% (${Number(form.taxPercent) / 2}% CGST & ${Number(form.taxPercent) / 2}% SGST, ${form.taxPercent}% IGST)`}
                    onChange={(label) => handleChange("taxPercent", label.split("%")[0])}
                    buttonClassName={inp + " cursor-pointer flex items-center justify-between text-left"}
                  />
                </div>
              </div>
              )}

              {/* Purchase Price + Primary Unit */}
              <div className="grid grid-cols-2 gap-4">
                {!hasVariants && (
                <div>
                  <label className={lbl}>Purchase Price</label>
                  <div className="flex h-11 border border-[#1F2937]/10 rounded-full overflow-hidden focus-within:ring-1 focus-within:ring-blue-500 font-inter">
                    <span className="flex items-center px-3 bg-gray-50 border-r border-[#1F2937]/10 text-gray-500 text-sm">â‚¹</span>
                    <input
                      type="number"
                      value={form.purchasePrice}
                      onChange={(e) => handleChange("purchasePrice", e.target.value)}
                      onWheel={(e) => e.target.blur()}
                      placeholder="0"
                      className="flex-1 px-3 text-sm text-[#1F2937] focus:outline-none bg-white min-w-0 w-0"
                    />
                    {/* Purchase price's own tax basis, same control as Selling Price's. Saved as
                        purchaseTaxInclusive (it used to be a dropdown that was never saved). */}
                    <select
                      value={form.purchasePriceTax}
                      onChange={(e) => handleChange("purchasePriceTax", e.target.value)}
                      className="px-1.5 bg-gray-50 border-l border-[#1F2937]/10 text-[10px] text-gray-600 focus:outline-none flex-shrink-0 w-[62px]"
                    >
                      <option value="without Tax">w/o Tax</option>
                      <option value="with Tax">w/ Tax</option>
                    </select>
                  </div>
                </div>
                )}

                <div className={hasVariants ? "col-span-2" : ""}>
                  <label className={lbl}>Primary Unit</label>
                  <CustomDropdown
                    options={UNIT_OPTIONS}
                    value={form.primaryUnit ? form.primaryUnit.replace(" ", " â€” ") : ""}
                    onChange={(val) => handleChange("primaryUnit", val.replace(" â€” ", " "))}
                    placeholder="Select Unit"
                    buttonClassName={inp + " flex items-center justify-between text-left"}
                  />
                </div>
              </div>

              {/* â”€â”€ Variants â€” a service has nothing to stock or vary in
                  price by SKU, so this section doesn't apply once the
                  Product/Service toggle above is set to Service. â”€â”€ */}
              {type === "Product" && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={lbl + " mb-0"}>Variants</label>
                  {!showVariantForm && (
                    <button
                      type="button"
                      onClick={() => { setCurrentVariant(BLANK_VARIANT); setVariantIndex(null); setShowVariantForm(true); }}
                      className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                    >
                      <PlusIcon className="w-4 h-4" /> Add Variant
                    </button>
                  )}
                </div>

                {showVariantForm && (
                  <div className="border border-gray-200 rounded-xl bg-white mb-3 shadow-sm">
                    <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                      <span className="text-[14px] font-medium text-[#1F2937] font-inter">
                        {variantIndex !== null ? "Edit Variant" : "Add Variant"}
                      </span>
                      <button type="button" onClick={() => { setShowVariantForm(false); setCurrentVariant(BLANK_VARIANT); setVariantIndex(null); }} className="text-gray-400 hover:text-gray-600">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="p-4 space-y-4">
                      <div>
                        <label className={lbl}>Variant Name <span className="text-red-500">*</span></label>
                        <input type="text" name="name" value={currentVariant.name} onChange={handleVariantChange} placeholder="Enter Variant Name" className={inp} />
                      </div>
                      <div>
                        <label className={lbl}>SKU</label>
                        <div className="flex gap-2">
                          <input type="text" name="sku" autoComplete="off" value={currentVariant.sku} onChange={handleVariantChange} placeholder="Enter or Generate SKU" className={inp} />
                          <button type="button" onClick={generateVariantSku} className="flex-shrink-0 bg-[#158FFF] hover:opacity-90 text-white text-xs font-bold px-5 h-11 rounded-full transition-colors whitespace-nowrap font-inter">Generate</button>
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className={lbl + " mb-0"}>Attributes</label>
                          <button type="button" onClick={() => setCurrentVariant((p) => ({ ...p, attributes: { ...p.attributes, "": "" } }))} className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">
                            <PlusIcon className="w-4 h-4" /> Add Attribute
                          </button>
                        </div>
                        {Object.keys(currentVariant.attributes || {}).length > 0 && (
                          <div className="space-y-2">
                            {Object.entries(currentVariant.attributes).map(([key, val], idx) => (
                              <div key={idx} className="flex gap-2 items-center">
                                <input type="text" value={key} onChange={(e) => { const nk = e.target.value; setCurrentVariant((p) => { const a = { ...p.attributes }; const v = a[key]; delete a[key]; a[nk] = v; return { ...p, attributes: a }; }); }} placeholder="Name (e.g. color)" className="flex-1 border border-[#1F2937]/10 rounded-full px-3 h-11 text-sm text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 font-inter" />
                                <input type="text" value={val} onChange={(e) => setCurrentVariant((p) => ({ ...p, attributes: { ...p.attributes, [key]: e.target.value } }))} placeholder="Value (e.g. Red)" className="flex-1 border border-[#1F2937]/10 rounded-full px-3 h-11 text-sm text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 font-inter" />
                                <button type="button" onClick={() => setCurrentVariant((p) => { const a = { ...p.attributes }; delete a[key]; return { ...p, attributes: a }; })} className="text-red-500 hover:text-red-600 p-1"><DeleteIcon className="w-4 h-4" /></button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className={lbl}>Purchase Price <span className="text-red-500">*</span></label>
                          <input type="number" name="purchasePrice" min="0" value={currentVariant.purchasePrice} onChange={handleVariantChange} onWheel={(e) => e.target.blur()} placeholder="0" className={inp} />
                        </div>
                        <div>
                          <label className={lbl}>Selling Price <span className="text-red-500">*</span></label>
                          <input type="number" name="sellingPrice" min="0" value={currentVariant.sellingPrice} onChange={handleVariantChange} onWheel={(e) => e.target.blur()} placeholder="0" className={inp} />
                        </div>
                      </div>
                      <div>
                        <label className={lbl}>GST Rate</label>
                        <select
                          value={currentVariant.gstRate ?? 0}
                          onChange={(e) => setCurrentVariant((prev) => ({ ...prev, gstRate: parseFloat(e.target.value) || 0 }))}
                          className={inp + " cursor-pointer"}
                        >
                          {GST_RATES.map((rate) => (
                            <option key={rate} value={rate}>{rate}%</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={lbl}>Stock</label>
                        <input type="number" name="stock" min="0" value={currentVariant.stock} onChange={handleVariantChange} onWheel={(e) => e.target.blur()} className={inp} />
                      </div>
                      {/* â”€â”€ Variant-specific overrides â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
                          Each belongs to the variant, not the product: a Small and a Large are
                          scanned, described, pictured and discounted separately. All optional â€”
                          left blank the variant inherits the item's value (variantResolve.js). */}
                      <div className="pt-2 mt-1 border-t border-gray-100">
                        <p className="text-[11px] text-gray-400 mb-2">Leave blank to use the item's value.</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={lbl}>Barcode</label>
                            <input type="text" name="barcode" autoComplete="off" value={currentVariant.barcode ?? ""} onChange={handleVariantChange} placeholder="Scan or enter" className={inp} />
                          </div>
                          <div>
                            <label className={lbl}>Low Stock Alert at</label>
                            <input type="number" name="lowStockThreshold" min="0" value={currentVariant.lowStockThreshold ?? ""} onChange={handleVariantChange} onWheel={(e) => e.target.blur()} placeholder="Item default" className={inp} />
                          </div>
                          <div>
                            <label className={lbl}>Discount</label>
                            <div className="flex h-11 border border-[#1F2937]/10 rounded-full overflow-hidden focus-within:ring-1 focus-within:ring-blue-500 bg-white font-inter">
                              <input
                                type="number"
                                min="0"
                                value={currentVariant.discount?.value ?? ""}
                                onChange={(e) => setCurrentVariant((p) => ({ ...p, discount: { type: p.discount?.type || "percentage", value: e.target.value } }))}
                                onWheel={(e) => e.target.blur()}
                                placeholder="Item default"
                                className="flex-1 min-w-0 w-0 px-3 text-sm text-[#1F2937] focus:outline-none"
                              />
                              <select
                                value={currentVariant.discount?.type || "percentage"}
                                onChange={(e) => setCurrentVariant((p) => ({ ...p, discount: { value: p.discount?.value ?? "", type: e.target.value } }))}
                                className="px-2 bg-gray-50 border-l border-[#1F2937]/10 text-xs text-gray-600 focus:outline-none flex-shrink-0"
                              >
                                <option value="percentage">%</option>
                                <option value="amount">â‚¹</option>
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className={lbl}>Max Discount %</label>
                            <input type="number" name="maxDiscountPercent" min="0" max="100" step="0.5" value={currentVariant.maxDiscountPercent ?? ""} onChange={handleVariantChange} onWheel={(e) => e.target.blur()} placeholder="Item default" className={inp} />
                          </div>
                        </div>
                        <div className="mt-3">
                          <label className={lbl}>Description</label>
                          <textarea name="description" rows={2} value={currentVariant.description ?? ""} onChange={handleVariantChange} placeholder="Item description" className="w-full border border-[#1F2937]/10 rounded-2xl px-4 py-2.5 text-sm text-[#1F2937] bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none font-inter placeholder:text-[#1F2937] placeholder:opacity-50" />
                        </div>
                        <div className="mt-3">
                          <label className={lbl}>Images</label>
                          <VariantImagePicker variant={currentVariant} onChange={(next) => setCurrentVariant((p) => ({ ...p, ...next }))} />
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <Checkbox checked={currentVariant.isActive !== false} onChange={(e) => setCurrentVariant((p) => ({ ...p, isActive: e.target.checked }))} id="vActive" name="isActive" />
                        <label htmlFor="vActive" className="text-sm font-medium text-[#161618] cursor-pointer font-inter">Active</label>
                      </div>
                      <div className="flex gap-3 pt-2">
                        <button type="button" onClick={() => { setShowVariantForm(false); setCurrentVariant(BLANK_VARIANT); setVariantIndex(null); }} className="flex-1 border border-gray-200 text-gray-700 font-bold rounded-[25px] hover:bg-gray-50 py-2 text-sm transition-colors font-inter">Cancel</button>
                        <button type="button" onClick={handleAddVariant} className="flex-1 bg-[#158FFF] hover:opacity-90 text-white font-bold rounded-[25px] py-2 text-sm transition-colors font-inter">{variantIndex !== null ? "Update Variant" : "Add Variant"}</button>
                      </div>
                    </div>
                  </div>
                )}

                {!showVariantForm && variants.length === 0 && (
                  <div className="px-4 py-3 border border-dashed border-gray-200 rounded-xl text-xs text-gray-400 text-center">No Variants Added</div>
                )}
                {!showVariantForm && variants.length > 0 && (
                  <div className="space-y-2">
                    {variants.map((v, i) => (
                      <div key={i} className="flex justify-between items-center bg-gray-50 border border-gray-100 rounded-lg p-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">{v.name}</div>
                          <div className="text-xs text-gray-500 mt-0.5">SKU: {v.sku || "N/A"} Â· â‚¹{v.sellingPrice} Â· Stock: {v.stock}</div>
                        </div>
                        <div className="flex gap-1 flex-shrink-0 ml-3">
                          <button type="button" onClick={() => handleEditVariant(i)} className="text-blue-600 hover:text-blue-700 p-1.5 rounded hover:bg-blue-50 transition-colors"><EditIcon className="w-4 h-4" /></button>
                          <button type="button" onClick={() => handleRemoveVariant(i)} className="text-red-600 hover:text-red-700 p-1.5 rounded hover:bg-red-50 transition-colors"><DeleteIcon className="w-4 h-4" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              )}
          </div>

          {/* â”€â”€ Additional Information â€” flat section, no card wrapper â”€â”€ */}
          <div className="space-y-4">
            <div className="pb-1.5">
              <span className="text-[16px] font-bold text-[#111216]">Additional Information</span>
              <span className="ml-2 text-xs text-gray-400 font-normal">Optional</span>
            </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>HSN/SAC</label>
                  <input type="text" value={form.hsnSac} onChange={(e) => handleChange("hsnSac", e.target.value)} placeholder="Enter HSN/SAC Code" className={inp} />
                  <p className="mt-1 text-[11px] text-blue-600 cursor-pointer hover:underline">Click here to check GST approved HSN/SAC codes.</p>
                </div>
                <div className="relative">
                  <label className={lbl}>Category</label>
                  <input 
                    type="text" 
                    value={form.category} 
                    onChange={(e) => {
                       handleChange("category", e.target.value);
                       setCategoryDropdownOpen(true);
                    }} 
                    onFocus={() => setCategoryDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setCategoryDropdownOpen(false), 200)}
                    placeholder="Select or type a category" 
                    className={inp} 
                  />
                  {categoryDropdownOpen && categories.filter(c => c.toLowerCase().includes((form.category || "").toLowerCase())).length > 0 && (
                     <div className="absolute z-[10010] mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {categories.filter(c => c.toLowerCase().includes((form.category || "").toLowerCase())).map(c => (
                           <div key={c} className="px-3 py-2 text-[13px] text-gray-700 hover:bg-gray-50 cursor-pointer" onMouseDown={(e) => e.preventDefault()} onClick={() => {
                               handleChange("category", c);
                               setCategoryDropdownOpen(false);
                           }}>
                              {c}
                           </div>
                        ))}
                     </div>
                  )}
                </div>
              </div>

              {/* Barcode gets its own half-width row rather than sharing a grid row with
                  Description below â€” pairing a single-line input against a 140px rich-text
                  editor in a symmetric 2-col grid stretched the row to the editor's height,
                  leaving Barcode's cell with a large dead gap underneath it. */}
              {/* Hidden once the item has variants: each variant carries its own, and an
                  editable parent copy would leave the user unsure which one applies. */}
              {!hasVariants && (
              <>
              <div className="w-1/2 pr-2">
                <label className={lbl}>Barcode</label>
                <div className="flex gap-2">
                  <input type="text" value={form.barcode} onChange={(e) => handleChange("barcode", e.target.value)} placeholder="Enter or Generate Barcode" className={inp} />
                  <button type="button" onClick={generateBarcode} className="flex-shrink-0 bg-[#158FFF] hover:opacity-90 text-white text-xs font-bold px-5 h-11 rounded-full transition-colors whitespace-nowrap font-inter">Generate</button>
                </div>
              </div>
              <div>
                <label className={lbl}>Description</label>
                <ReactQuill
                  theme="snow"
                  value={form.description}
                  onChange={(val) => handleChange("description", val)}
                  placeholder="Add product descriptionâ€¦"
                  className="rounded-xl border border-[#1F2937]/10 overflow-hidden [&_.ql-editor]:min-h-[150px] [&_.ql-toolbar]:!border-0 [&_.ql-toolbar]:!border-b [&_.ql-toolbar]:!border-gray-100 [&_.ql-toolbar]:rounded-t-xl [&_.ql-container]:!border-0 [&_.ql-container]:rounded-b-xl text-sm"
                />
              </div>

              {/* Images upload â€” heading follows the Product/Service toggle */}
              <div>
                <label className={lbl}>{type === "Service" ? "Service Images & Videos" : "Product Images & Videos"}</label>
                <div className="flex items-start gap-4">
                  <div className="flex flex-wrap gap-3">
                    {imagePreviews.map((url, i) => (
                      <div key={url} className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-200 group">
                        <img src={url} alt="" className="w-full h-full object-cover cursor-pointer" onClick={() => setSelectedImageIndex(i)} />
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(i)}
                          className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      className="w-20 h-20 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50 flex flex-col items-center justify-center text-gray-400 hover:bg-gray-100 hover:border-gray-300 cursor-pointer transition-colors"
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
                  <p className="text-[11px] text-gray-400 leading-relaxed">Up to 10 files Â· 3 MB/image Â· 50 MB/video<br />Images: 1024Ã—1024 recommended</p>
                </div>
              </div>
              </>
              )}
          </div>

          {/* â”€â”€ Opening Stock â€” flat section, no card wrapper. A service
              carries no stock at all, not just "no variant-level" stock. â”€â”€ */}
          {type === "Product" && !hasVariants && (
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-1.5">
              <div>
                <span className="text-[16px] font-bold text-[#111216]">Opening Stock</span>
                <span className="ml-2 text-xs text-gray-400 font-normal">Optional</span>
              </div>
              <button type="button" disabled title="Upgrade to track batches" className="flex items-center gap-1 text-xs font-medium text-gray-400 cursor-not-allowed">
                <Lock className="w-3 h-3" /> Add batches
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Opening Quantity</label>
                <input type="number" min="0" value={form.openingQuantity} onChange={(e) => handleChange("openingQuantity", e.target.value)} onWheel={(e) => e.target.blur()} className={inp} />
                <p className="mt-1 text-[11px] text-gray-400">Quantity available in your existing inventory</p>
              </div>
            </div>
          </div>
          )}

          {/* â”€â”€ More Details collapsible â”€â”€
              Every field inside it (Discount, Max Discount %, Low Stock Alert) is set per
              variant once variants exist, so the whole section is hidden rather than left
              showing parent copies that the variants would override anyway. */}
          {!hasVariants && (
          <div className="border border-[#1F2937]/10 bg-white rounded-2xl overflow-hidden">
            <button type="button" className="w-full p-4 flex items-center gap-3 text-left" onClick={() => setShowMoreDetails(!showMoreDetails)}>
              <ChevronRight className={`w-4 h-4 text-gray-500 transition-transform flex-shrink-0 ${showMoreDetails ? "rotate-90" : ""}`} />
              <div>
                <p className="text-sm font-bold text-gray-900">More Details?</p>
                <p className="text-xs text-gray-500 mt-0.5">Low stock alerts, Discount settingsâ€¦</p>
              </div>
            </button>
            {showMoreDetails && (
              <div className="border-t border-[#1F2937]/10 bg-white px-5 py-4 grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Discount</label>
                  <div className="flex h-11 border border-[#1F2937]/10 rounded-full overflow-hidden focus-within:ring-1 focus-within:ring-blue-500 bg-white font-inter">
                    <input type="number" min="0" value={form.discountValue} onChange={(e) => handleChange("discountValue", e.target.value)} className="flex-1 px-3 text-sm text-[#1F2937] focus:outline-none" />
                    <select value={form.discountType} onChange={(e) => handleChange("discountType", e.target.value)} className="px-2 bg-gray-50 border-l border-[#1F2937]/10 text-xs text-gray-600 focus:outline-none">
                      <option value="percentage">% Percentage</option>
                      <option value="amount">â‚¹ Amount</option>
                    </select>
                  </div>
                  <p className="mt-1 text-[11px] text-gray-400">Applied in Online Store and invoices.</p>
                </div>

                <div>
                  <label className={lbl}>Max Discount %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    placeholder="e.g. 10"
                    value={form.maxDiscountPercent}
                    onChange={(e) => handleChange("maxDiscountPercent", e.target.value)}
                    onWheel={(e) => e.target.blur()}
                    className={inp}
                  />
                  <p className="mt-1 text-[11px] text-gray-400">Leave blank for no limit. Caps the discount % a user can apply to this product on a document.</p>
                </div>

                <div>
                  <label className={lbl}>Low Stock Alert at</label>
                  <input type="number" min="0" value={form.lowStockAlert} onChange={(e) => handleChange("lowStockAlert", e.target.value)} onWheel={(e) => e.target.blur()} className={inp} />
                  <p className="mt-1 text-[11px] text-gray-400">Get notified when stock falls to this level.</p>
                </div>

              </div>
            )}
          </div>
          )}

          <div className="pb-4" />
        </div>

        {/* â”€â”€ Footer â”€â”€ */}
        <div className="flex items-center justify-between px-6 py-4 bg-white border-t border-gray-100 flex-shrink-0 rounded-b-2xl">
          <button type="button" onClick={handleClose} className="px-6 py-2 border border-gray-200 text-gray-700 text-sm font-bold rounded-[25px] hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-8 py-2 bg-[#158FFF] hover:opacity-90 text-white text-sm font-bold rounded-[25px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Addingâ€¦" : "Add Item"}
          </button>
        </div>
      </div>

      {selectedImageIndex !== null && (
        <div 
          className="fixed inset-0 z-[100010] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setSelectedImageIndex(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <button 
              className="absolute -top-10 right-0 text-white hover:text-gray-300"
              onClick={() => setSelectedImageIndex(null)}
            >
              <X className="w-8 h-8" />
            </button>
            <img 
              src={imagePreviews[selectedImageIndex]} 
              alt="Zoomed product preview" 
              className="max-w-full max-h-[90vh] object-contain rounded shadow-2xl border border-white/10"
            />
          </div>
        </div>
      )}
    </>,
    document.body
  );
}
