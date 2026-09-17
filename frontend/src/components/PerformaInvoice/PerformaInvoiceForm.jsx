import CalendarIcon from "../common/CalendarIcon";
import { resolveField, resolveDiscount, resolveMaxDiscountPercent } from "../../utils/variantResolve";
import DeleteIcon from "../common/DeleteIcon";
import PdfIcon from "../common/PdfIcon";
import PlusIcon from "../common/PlusIcon";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { formatNumberToIndian, formatNumberFixed } from "../../utils/numberFormatter";
import {
  IndianRupeeIcon,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Inbox,
  Settings,
  Printer,
  Eye,
} from "lucide-react";
import API from "../../services/api";
import ItemForm from "../item/ItemForm";
import QuickDealForm from "../deal/QuickDealForm";
import SearchableDropdown from "../contact/SearchableDropdown";
import toast from "react-hot-toast";
import { AddressFieldsGroup, emptyAddress, isAddressEmpty, SectionHeader } from "../invoice/formPrimitives";
import { PREDEFINED_NOTES, PREDEFINED_TERMS } from "../../utils/documentDefaultText";
import { computeDocument, DOCUMENT_TEMPLATES } from "../../../../shared/documentTemplates";

import SearchIcon from "../common/SearchIcon";
// Function to convert number to words
function numberToWords(num) {
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];
  const scales = ["", "Thousand", "Lakh", "Crore"];

  function toWords(n) {
    if (n === 0) return "";
    if (n < 20) return ones[n];
    if (n < 100) {
      return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    }
    if (n < 1000) {
      return (
        ones[Math.floor(n / 100)] +
        " Hundred" +
        (n % 100 ? " " + toWords(n % 100) : "")
      );
    }
    let scaleIndex = 0;
    let result = "";
    if (n >= 10000000) {
      result += toWords(Math.floor(n / 10000000)) + " Crore ";
      n %= 10000000;
    }
    if (n >= 100000) {
      result += toWords(Math.floor(n / 100000)) + " Lakh ";
      n %= 100000;
    }
    if (n >= 1000) {
      result += toWords(Math.floor(n / 1000)) + " Thousand ";
      n %= 1000;
    }
    if (n > 0) {
      result += toWords(n);
    }
    return result.trim();
  }

  if (num === 0) return "Zero Rupees Only";

  const integerPart = Math.floor(num);
  const decimalPart = Math.round((num - integerPart) * 100);
  let words = toWords(integerPart) + " Rupees";
  if (decimalPart > 0) {
    words += " and " + toWords(decimalPart) + " Paise";
  }
  words += " Only";
  return words;
}

// Item Search Component
const ItemSearchSelect = ({
  value,
  onSelect,
  onAddNew,
  fetchItems,
  items,
  setItems,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);
  const debounceTimeout = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const debouncedFetchItems = useCallback(
    (search) => {
      clearTimeout(debounceTimeout.current);
      debounceTimeout.current = setTimeout(() => {
        Promise.resolve(fetchItems(search)).finally(() => setLoading(false));
      }, 300);
    },
    [fetchItems]
  );

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    if (value.length >= 2 || value === "") {
      setLoading(true);
      debouncedFetchItems(value);
    }
  };

  const handleItemSelect = (item) => {
    onSelect({
      _id: item._id,
      name: item.displayName,
      description: item.description || "",
      rate: item.sellingPrice,
      quantity: 1,
      hsn: item.hsnSac || "",
      isVariant: item.isVariant || false,
      parentItemId: item.parentItemId || null,
      // The product's own default discount (set in QuickItemDrawer's "More
      // Details" -> Discount) — previously always started at 0.
      discountType: item.discount?.type || "amount",
      discount: item.discount?.value || 0,
        type: item.type,
        stock: item.stock,
      gstRate: item.gstRate || 0,
      taxInclusive: !!item.taxInclusive,
    });
    setIsOpen(false);
    setSearchTerm("");
  };

  const handleInputFocus = () => {
    setIsOpen(true);
    if (items.length === 0) {
      setLoading(true);
      Promise.resolve(fetchItems()).finally(() => setLoading(false));
    }
  };

  const selectedItem = items.find((item) => item._id === value?._id);

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="relative">
        <SearchIcon className="absolute left-3 -translate-y-1/2 top-1/2 w-4 h-4 text-[#525866]" />
        <input
          ref={inputRef}
          type="text"
          placeholder={
            selectedItem
              ? selectedItem.displayName
              : "Search items or variants..."
          }
          value={selectedItem ? selectedItem.displayName : searchTerm}
          onChange={handleSearchChange}
          onFocus={handleInputFocus}
          className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all duration-200 bg-white"
          aria-label="Search items or variants"
        />
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-slate-500">Loading...</div>
          ) : (
            <>
              <div className="p-2">
                <button
                  type="button"
                  onClick={() => {
                    onAddNew();
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center gap-2 p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  aria-label="Add new item"
                >
                  <PlusIcon className="w-4 h-4" />
                  Add New Item
                </button>
              </div>
              <div className="border-t border-slate-100"></div>
              {items.length === 0 ? (
                <div className="p-4 text-center text-slate-500">
                  {searchTerm
                    ? "No items or variants found"
                    : "No items or variants available"}
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto">
                  {items.map((item) => (
                    <button
                      key={item._id}
                      type="button"
                      onClick={() => handleItemSelect(item)}
                      className="w-full text-left p-3 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-b-0"
                      aria-label={`Select ${item.displayName}`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="font-medium text-slate-900">
                            {item.displayName}
                          </div>
                          {item.description && (
                            <div
                              className="text-sm text-slate-500 mt-1"
                              dangerouslySetInnerHTML={{
                                __html: item.description,
                              }}
                            ></div>
                          )}
                          <div className="flex items-center gap-2 mt-2">
                            <span
                              className={`text-xs px-2 py-1 rounded-full ${item.isVariant
                                  ? "bg-purple-100 text-purple-800"
                                  : item.type === "product"
                                    ? "bg-blue-100 text-blue-800"
                                    : "bg-green-100 text-green-800"
                                }`}
                            >
                              {item.isVariant ? "Variant" : item.type}
                            </span>
                            {item.category && (
                              <span className="text-xs text-slate-500">
                                {item.category}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right ml-4">
                          <div className="font-semibold text-slate-900">
                            ₹{item.sellingPrice}
                          </div>
                          <div className="text-xs text-slate-500">
                            {item.primaryUnit}
                            {item.type === "product" && (
                              <span className="ml-1 font-medium text-slate-600">
                                • Stock: {item.stock ?? 0}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};



const PerformaInvoiceForm = ({
  deals,
  isOpen,
  onClose,
  fetchData,
  editingPerformaInvoice,
  conversionData,
  onPreview,
  defaultDueDateDays = null,
  defaultNotesByType = {},
  defaultTermsByType = {},
  defaultNotesFlat = "",
  defaultTermsFlat = "",
}) => {
  const defaultNotesForNew = defaultNotesByType.performa !== undefined
    ? defaultNotesByType.performa
    : (defaultNotesFlat || PREDEFINED_NOTES.performa || "");
  const defaultTermsForNew = defaultTermsByType.performa !== undefined
    ? defaultTermsByType.performa
    : (defaultTermsFlat || PREDEFINED_TERMS.performa || "");
  const [form, setForm] = useState({
    deal: "",
    date: "",
    dueDate: "",
    receiverGSTIN: "",
    billingAddress: emptyAddress(),
    shippingAddress: emptyAddress(),
    sameAsBilling: true,
    notes: defaultNotesForNew,
    terms: defaultTermsForNew,
    signature: "",
    items: [
      {
        _id: null,
        name: "",
        description: "",
        rate: "",
        quantity: 1,
        hsn: "",
        isVariant: false,
              parentItemId: null,
              stock: item.inventory?.currentStock ?? 0,
        discountType: "amount",
        discount: 0,
        gstRate: 0,
      },
    ],
    discount: { type: "fixed", value: 0 },
    amount: 0,
    status: "Draft",
    style: "",
    transactionType: "intra",
  });
  const [isSliding, setIsSliding] = useState(false);
  const [shouldRender, setShouldRender] = useState(true);
  const [showItemForm, setShowItemForm] = useState(false);
  const [savedSignatures, setSavedSignatures] = useState([]);
  const [signaturesLoading, setSignaturesLoading] = useState(false);
  const [showQuickDealForm, setShowQuickDealForm] = useState(false);
  const [localDeals, setLocalDeals] = useState(deals);
  const [sellerState, setSellerState] = useState("");
  const [companies, setCompanies] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [itemForm, setItemForm] = useState({
    type: "product",
    name: "",
    description: "",
    purchasePrice: 0,
    sellingPrice: 0,
    taxInclusive: true,
    hsnSac: "",
    barcode: "",
    category: "",
    primaryUnit: "OTH OTHERS",
    images: [],
    isActive: true,
  });
  const [itemFormLoading, setItemFormLoading] = useState(false);
  const [itemFormError, setItemFormError] = useState("");
  const [itemFormSuccess, setItemFormSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [items, setItems] = useState([]);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [quickAddItem, setQuickAddItem] = useState(null);
  const [quickAddQty, setQuickAddQty] = useState(1);
  const formRef = useRef(null);

  useEffect(() => {
    if (showItemForm) {
      // Disable scroll on the invoice form when ItemForm is open
      if (formRef.current) {
        formRef.current.style.overflow = "hidden";
      }

      // Also prevent body scroll
      document.body.style.overflow = "hidden";

      return () => {
        // Re-enable scroll when ItemForm closes
        if (formRef.current) {
          formRef.current.style.overflow = "auto";
        }
        document.body.style.overflow = "";
      };
    }
  }, [showItemForm]);

  // GSTIN validation regex (Indian GSTIN format: 2 digits, 5 alphanumeric, 4 digits, 1 alphanumeric, 1 digit, 1 alphanumeric)
  const gstinRegex =
    /^[0-9]{2}[A-Z0-9]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Z]{1}[0-9A-Z]{1}$/;

  // Fetch items and variants for ItemSearchSelect
  const fetchItems = useCallback(async (search = "") => {
    try {
      setItemFormLoading(true);
      const res = await API.get(`/items?search=${search}&includeVariants=true`);
      const itemsWithVariants = res.data
        .filter((item) => item.isActive)
        .flatMap((item) => {
          // Same variant-only logic as PurchaseForm.jsx/PurchaseOrderForm.jsx:
          // if the item has variants, only the variants are selectable (the
          // parent is just a grouping, not something you'd actually bill);
          // otherwise fall back to the item itself.
          if (item.variants && item.variants.length > 0) {
            return item.variants.map((variant) => ({
              _id: variant._id,
              displayName: `${item.name} - ${variant.name}`,
              name: variant.name,
              description: resolveField(variant, item, "description") || "",
              barcode: resolveField(variant, item, "barcode") || "",
              maxDiscountPercent: resolveMaxDiscountPercent(variant, item),
              discount: resolveDiscount(variant, item),
              sellingPrice: variant.sellingPrice || item.sellingPrice,
              hsnSac: variant.hsnSac || item.hsnSac || "",
              type: item.type,
              category: item.category || "",
              primaryUnit:
                variant.primaryUnit || item.primaryUnit || "OTH OTHERS",
              isVariant: true,
              parentItemId: item._id,
              stock: variant.stock ?? item.inventory?.currentStock ?? 0,
            }));
          }
          return [
            {
              _id: item._id,
              displayName: item.name,
              name: item.name,
              description: item.description || "",
              sellingPrice: item.sellingPrice,
              hsnSac: item.hsnSac || "",
              type: item.type,
              category: item.category || "",
              primaryUnit: item.primaryUnit || "OTH OTHERS",
              isVariant: false,
              parentItemId: null,
              stock: item.inventory?.currentStock ?? 0,
            },
          ];
        });
      setItems(itemsWithVariants);
    } catch (error) {
      console.error("Error fetching items:", error);
      toast.error("Failed to fetch items.");
    } finally {
      setItemFormLoading(false);
    }
  }, []);

  // Fetch companies and contacts for QuickDealForm
  const fetchCompanies = useCallback(async () => {
    try {
      const res = await API.get("/companies");
      setCompanies(res.data);
    } catch (error) {
      console.error("Error fetching companies:", error);
      toast.error("Failed to fetch companies.");
    }
  }, []);

  const fetchContacts = useCallback(async () => {
    try {
      const res = await API.get("/contacts");
      setContacts(res.data);
    } catch (error) {
      console.error("Error fetching contacts:", error);
      toast.error("Failed to fetch contacts.");
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setTimeout(() => setIsSliding(true), 10);
      fetchItems();
      fetchCompanies();
      fetchContacts();
      setLocalDeals(deals);
      API.get("/branding").then(r => setSellerState((r.data?.state || "").trim().toLowerCase())).catch(() => {});
    } else {
      setIsSliding(false);
      setTimeout(() => setShouldRender(false), 300);
    }
  }, [isOpen, fetchItems, fetchCompanies, fetchContacts, deals]);

  // Same default-signature behavior as QuotationForm.jsx: fall back to the
  // org's default signature whenever this document isn't already pointing
  // at one of the saved signatures.
  useEffect(() => {
    const loadSignatures = async () => {
      setSignaturesLoading(true);
      try {
        const res = await API.get("/document-settings/signatures");
        const sigs = Array.isArray(res.data) ? res.data : [];
        setSavedSignatures(sigs);
        const defaultSig = sigs.find((s) => s.isDefault);
        if (defaultSig) {
          setForm((prev) => {
            const hasSavedMatch = sigs.some((s) => s.dataUrl === prev.signature);
            return hasSavedMatch
              ? prev
              : { ...prev, signature: defaultSig.dataUrl || "" };
          });
        }
      } catch (error) {
        console.error("Failed to load signatures", error);
        setSavedSignatures([]);
      } finally {
        setSignaturesLoading(false);
      }
    };
    if (isOpen) loadSignatures();
  }, [isOpen]);

  useEffect(() => {
    if (editingPerformaInvoice || conversionData) {
      const sourceData = editingPerformaInvoice || conversionData;
      const initialForm = {
        deal: sourceData.deal?._id || sourceData.deal || "",
        date: sourceData.date
          ? sourceData.date.slice(0, 10)
          : "",
        dueDate: sourceData.dueDate
          ? sourceData.dueDate.slice(0, 10)
          : "",
        receiverGSTIN: sourceData.receiverGSTIN || "",
        billingAddress: { ...emptyAddress(), ...(sourceData.billingAddress || {}) },
        shippingAddress: { ...emptyAddress(), ...(sourceData.shippingAddress || {}) },
        sameAsBilling:
          isAddressEmpty(sourceData.shippingAddress) ||
          JSON.stringify({ ...emptyAddress(), ...(sourceData.billingAddress || {}) }) ===
            JSON.stringify({ ...emptyAddress(), ...(sourceData.shippingAddress || {}) }),
        notes: sourceData.notes || "",
        terms: sourceData.terms || "",
        signature: sourceData.signature || "",
        items: (sourceData.items || []).map((item) => ({
          _id: (item.isVariant ? item.variantId : item.itemId) || item.itemId || item._id || null,
          name: item.name || "",
          description: item.description || "",
          rate: item.rate || "",
          quantity: item.quantity || 1,
          hsn: item.hsn || "",
          isVariant: item.isVariant || false,
          parentItemId: item.parentItemId || null,
          discountType: item.discountType || "amount",
          discount: item.discount || 0,
          gstRate: item.gstRate || 0,
          taxInclusive: !!item.taxInclusive,
        })),
        discount: sourceData.discount || {
          type: "fixed",
          value: 0,
        },
        amount: sourceData.amount || 0,
        status: editingPerformaInvoice ? sourceData.status : "Draft",
        style: sourceData.style || "",
        transactionType: sourceData.transactionType || "intra",
      };
      setForm(initialForm);
      setHasUnsavedChanges(false);
    } else {
      const initialForm = {
        deal: "",
        date: "",
        dueDate: "",
        receiverGSTIN: "",
        billingAddress: emptyAddress(),
        shippingAddress: emptyAddress(),
        sameAsBilling: true,
        notes: "",
        terms: "",
        signature: "",
        items: [
          {
            _id: null,
            name: "",
            description: "",
            rate: "",
            quantity: 1,
            hsn: "",
            isVariant: false,
              parentItemId: null,
              stock: item.inventory?.currentStock ?? 0,
            discountType: "amount",
            discount: 0,
          },
        ],
        discount: { type: "fixed", value: 0 },
        amount: 0,
        status: "Draft",
        style: "",
      };
      setForm(initialForm);
      setHasUnsavedChanges(false);
    }
  }, [editingPerformaInvoice]);

  const calculateItemAmount = (item) => {
    const rate = parseFloat(item.rate) || 0;
    const quantity = parseInt(item.quantity) || 0;
    const subtotal = rate * quantity;
    const discount = parseFloat(item.discount) || 0;
    if (item.discountType === "percentage") {
      return subtotal * (1 - discount / 100);
    }
    return subtotal - discount;
  };

  const calculateSubtotal = (items) =>
    items.reduce(
      (total, item) =>
        total + (parseFloat(item.rate) || 0) * (parseInt(item.quantity) || 0),
      0
    );

  const calculateTotalItemDiscounts = (items) =>
    items.reduce((total, item) => {
      const subtotal =
        (parseFloat(item.rate) || 0) * (parseInt(item.quantity) || 0);
      const discount = parseFloat(item.discount) || 0;
      if (item.discountType === "percentage") {
        return total + (subtotal * discount) / 100;
      }
      return total + discount;
    }, 0);

  const calculateSubtotalAfterItemDiscounts = (items) =>
    calculateSubtotal(items) - calculateTotalItemDiscounts(items);

  const calculateInvoiceDiscountAmount = (
    subtotalAfterItemDiscounts,
    discount
  ) => {
    if (discount && discount.value > 0) {
      if (discount.type === "percentage") {
        return (subtotalAfterItemDiscounts * discount.value) / 100;
      }
      return parseFloat(discount.value) || 0;
    }
    return 0;
  };

  const calculateTotalAmount = useCallback((items, discount) => {
    const subtotalAfterItemDiscounts =
      calculateSubtotalAfterItemDiscounts(items);
    const invoiceDiscountAmount = calculateInvoiceDiscountAmount(
      subtotalAfterItemDiscounts,
      discount
    );
    return subtotalAfterItemDiscounts - invoiceDiscountAmount;
  }, []);

  const handleItemChange = (index, field, value) => {
    setForm((prev) => {
      const newItems = [...prev.items];
      let newValue = value;

      // Validate item discount to ensure it doesn't exceed item subtotal
      if (field === "discount") {
        const item = newItems[index];
        const rate = parseFloat(item.rate) || 0;
        const quantity = parseInt(item.quantity) || 0;
        const subtotal = rate * quantity;
        const parsedDiscount = parseFloat(value) || 0;

        if (item.discountType === "amount" && parsedDiscount > subtotal) {
          newValue = subtotal;
          toast.error("Item discount cannot exceed item total price.");
        } else if (item.discountType === "percentage" && parsedDiscount > 100) {
          newValue = 100;
          toast.error("Percentage discount cannot exceed 100%.");
        }
      }

      newItems[index][field] = newValue;
      return {
        ...prev,
        items: newItems,
        amount: calculateTotalAmount(newItems, prev.discount),
      };
    });
    setHasUnsavedChanges(true);
  };

  const handleDiscountChange = (field, value) => {
    setForm((prev) => {
      const subtotalAfterItemDiscounts = calculateSubtotalAfterItemDiscounts(
        prev.items
      );
      let newValue = value;

      // Validate discount to ensure it doesn't exceed subtotal
      if (field === "value") {
        const parsedValue = parseFloat(value) || 0;
        if (
          prev.discount.type === "fixed" &&
          parsedValue > subtotalAfterItemDiscounts
        ) {
          newValue = subtotalAfterItemDiscounts;
          toast.error(
            "Invoice discount cannot exceed subtotal after item discounts."
          );
        } else if (prev.discount.type === "percentage" && parsedValue > 100) {
          newValue = 100;
          toast.error("Percentage discount cannot exceed 100%.");
        }
      }

      const newDiscount = { ...prev.discount, [field]: newValue };
      const invoiceDiscountAmount = calculateInvoiceDiscountAmount(
        subtotalAfterItemDiscounts,
        newDiscount
      );

      if (invoiceDiscountAmount > subtotalAfterItemDiscounts) {
        newDiscount.value = subtotalAfterItemDiscounts;
        if (newDiscount.type === "percentage") {
          newDiscount.value = 100;
        }
        toast.error(
          "Invoice discount cannot exceed subtotal after item discounts."
        );
      }

      return {
        ...prev,
        discount: newDiscount,
        amount: calculateTotalAmount(prev.items, newDiscount),
      };
    });
    setHasUnsavedChanges(true);
  };

  const handleItemSelect = (index, itemData) => {
    setForm((prev) => {
      const newItems = [...prev.items];
      newItems[index] = {
        ...itemData,
        quantity: newItems[index].quantity || 1,
        hsn: itemData.hsn || "",
        // Use the picked product's own discount (itemData carries it from
        // the catalog) instead of the stale blank row's discount.
        discountType: itemData.discountType || "amount",
        discount: itemData.discount || 0,
      };
      return {
        ...prev,
        items: newItems,
        amount: calculateTotalAmount(newItems, prev.discount),
      };
    });
    setHasUnsavedChanges(true);
  };

  const handleAddItem = () => {
    setForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          _id: null,
          name: "",
          description: "",
          rate: "",
          quantity: 1,
          hsn: "",
          isVariant: false,
              parentItemId: null,
              stock: item.inventory?.currentStock ?? 0,
          discountType: "amount",
          discount: 0,
          gstRate: 0,
        },
      ],
      amount: calculateTotalAmount(
        [
          ...prev.items,
          {
            _id: null,
            name: "",
            description: "",
            rate: "",
            quantity: 1,
            hsn: "",
            isVariant: false,
              parentItemId: null,
              stock: item.inventory?.currentStock ?? 0,
            discountType: "amount",
            discount: 0,
          },
        ],
        prev.discount
      ),
    }));
    setHasUnsavedChanges(true);
  };

  const handleRemoveItem = (index) => {
    setForm((prev) => {
      const newItems = prev.items.filter((_, i) => i !== index);
      return {
        ...prev,
        items: newItems,
        amount: calculateTotalAmount(newItems, prev.discount),
      };
    });
    setHasUnsavedChanges(true);
  };

  const handleOpenItemForm = () => {
    // Instantly scroll to top
    if (formRef.current) {
      formRef.current.scrollTop = 0;
    }

    // Open ItemForm immediately
    setShowItemForm(true);
  };

  // Quick-add bar above the item table: search a product, set its quantity,
  // "Add to Bill" drops it straight into form.items — separate from the
  // per-row inline search each existing row also has.
  const handleAddToBill = () => {
    if (!quickAddItem) {
      toast.error("Search and select a product first.");
      return;
    }
    const newItem = { ...quickAddItem, quantity: parseInt(quickAddQty) || 1 };
    setForm((prev) => {
      const isBlankStarterRow =
        prev.items.length === 1 && !prev.items[0].name && !prev.items[0]._id;
      const newItems = isBlankStarterRow ? [newItem] : [...prev.items, newItem];
      return {
        ...prev,
        items: newItems,
        amount: calculateTotalAmount(newItems, prev.discount),
      };
    });
    setQuickAddItem(null);
    setQuickAddQty(1);
    setHasUnsavedChanges(true);
  };

  const handleDealCreated = (newDeal) => {
    setLocalDeals((prev) => [...prev, newDeal]);
    setForm((prev) => ({ ...prev, deal: newDeal._id }));
    setHasUnsavedChanges(true);
    setShowQuickDealForm(false);
  };

  const resetItemForm = () => {
    setItemForm({
      type: "product",
      name: "",
      description: "",
      purchasePrice: 0,
      sellingPrice: 0,
      taxInclusive: true,
      hsnSac: "",
      barcode: "",
      category: "",
      primaryUnit: "OTH OTHERS",
      images: [],
      isActive: true,
    });
  };

  const validateGSTIN = (gstin) => {
    if (!gstin) return true; // GSTIN is optional
    return gstinRegex.test(gstin);
  };

  const submitPerformaInvoice = async (statusValue) => {
    setIsSubmitting(true);
    const isDraft = statusValue === "Draft";

    // Validate required fields
    if (!form.deal) {
      toast.error("Deal is required.");
      setIsSubmitting(false);
      return;
    }

    if (!form.date) {
      toast.error("Pro Forma Invoice Date is required.");
      setIsSubmitting(false);
      return;
    }

    // A quick draft only needs enough to identify the document; full GSTIN and
    // item validation apply once it's actually being created for real.
    if (!isDraft) {
      // Validate GSTIN format
      if (form.receiverGSTIN && !validateGSTIN(form.receiverGSTIN)) {
        toast.error(
          "Invalid GSTIN format. It should be 15 characters (e.g., 22AAAAA0000A1Z5)."
        );
        setIsSubmitting(false);
        return;
      }

      // Validate items
      const invalidItems = form.items.filter(
        (item) =>
          !item.name ||
          !item.rate ||
          !item.quantity ||
          (item.discountType === "percentage" && item.discount > 100)
      );
      if (invalidItems.length > 0) {
        toast.error(
          "Please fill in all item details (name, rate, quantity) and ensure percentage discounts are not above 100."
        );
        setIsSubmitting(false);
        return;
      }

      // Validate invoice discount
      const subtotalAfterItemDiscounts = calculateSubtotalAfterItemDiscounts(
        form.items
      );
      const invoiceDiscountAmount = calculateInvoiceDiscountAmount(
        subtotalAfterItemDiscounts,
        form.discount
      );
      if (invoiceDiscountAmount > subtotalAfterItemDiscounts) {
        toast.error(
          "Invoice discount cannot exceed subtotal after item discounts."
        );
        setIsSubmitting(false);
        return;
      }
    }

    try {
      const payload = {
        deal: form.deal,
        date: form.date,
        dueDate: form.dueDate,
        receiverGSTIN: form.receiverGSTIN,
        billingAddress: form.billingAddress,
        shippingAddress: form.sameAsBilling ? form.billingAddress : form.shippingAddress,
        notes: form.notes,
        terms: form.terms,
        signature: form.signature,
        // Same computeDocument() the live preview/PDF and the full-width
        // Pro Forma form use, so the saved amount honors each item's own
        // gstRate instead of the old calculateTotalAmount(), which never
        // added tax at all.
        amount: computeDocument(form, "performa").grandTotal,
        discount: form.discount,
        status: statusValue,
        items: form.items.map((item) => ({
          itemId: item.isVariant ? item.parentItemId : item._id,
          variantId: item.isVariant ? item._id : null,
          name: item.name,
          description: item.description,
          rate: parseFloat(item.rate),
          quantity: parseInt(item.quantity),
          hsn: item.hsn,
          isVariant: item.isVariant,
          parentItemId: item.parentItemId,
          discountType: item.discountType,
          discount: parseFloat(item.discount),
          gstRate: parseFloat(item.gstRate) || 0,
          taxInclusive: !!item.taxInclusive,
        })),
        style: form.style,
        transactionType: form.transactionType,
      };

      if (editingPerformaInvoice) {
        await API.put(
          `/performa-invoices/${editingPerformaInvoice._id}`,
          payload
        );
        toast.success(isDraft ? "Saved as draft!" : "Pro Forma Invoice updated successfully!");
      } else {
        await API.post("/performa-invoices", payload);
        toast.success(isDraft ? "Saved as draft!" : "Pro Forma Invoice created successfully!");
      }

      setHasUnsavedChanges(false);
      setForm({
        deal: "",
        date: "",
        dueDate: "",
        receiverGSTIN: "",
        billingAddress: emptyAddress(),
        shippingAddress: emptyAddress(),
        sameAsBilling: true,
        notes: "",
        terms: "",
        signature: "",
        items: [
          {
            _id: null,
            name: "",
            description: "",
            rate: "",
            quantity: 1,
            hsn: "",
            isVariant: false,
              parentItemId: null,
              stock: item.inventory?.currentStock ?? 0,
            discountType: "amount",
            discount: 0,
          },
        ],
        discount: { type: "fixed", value: 0 },
        amount: 0,
        status: "Draft",
        style: "",
      });
      await fetchData();
      onClose();
    } catch (err) {
      const errorMessage = err.response?.status === 402
        ? (err.response?.data?.message || "An active subscription is required to make changes.")
        : (err.response?.data?.error || (editingPerformaInvoice ? "Failed to update Pro Forma invoice" : "Failed to create Pro Forma invoice"));
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmExit = () => {
    setHasUnsavedChanges(false);
    setShowConfirmDialog(false);
    onClose();
  };

  const handleSaveAndExit = async () => {
    await submitPerformaInvoice("Pending");
    if (!toastMessage.includes("Failed")) {
      setShowConfirmDialog(false);
      onClose();
    }
  };

  const handleSaveDraft = () => submitPerformaInvoice("Draft");
  const handleSubmit = (e) => {
    e.preventDefault();
    submitPerformaInvoice(form.status || "Draft");
  };

  const handleClose = () => {
    if (hasUnsavedChanges) {
      setShowConfirmDialog(true);
    } else {
      onClose();
    }
  };

  if (!shouldRender) return null;

  const subtotal = calculateSubtotal(form.items);
  const totalItemDiscounts = calculateTotalItemDiscounts(form.items);
  const subtotalAfterItemDiscounts = subtotal - totalItemDiscounts;
  const invoiceDiscountAmount = calculateInvoiceDiscountAmount(
    subtotalAfterItemDiscounts,
    form.discount
  );
  // Same shared engine the live preview/PDF and the full-width Pro Forma form
  // use (shared/documentTemplates.js) — honors each item's own gstRate
  // rather than only a document-level rate, so this summary, the saved
  // amount and the PDF can never disagree.
  const taxDetails = computeDocument(form, "performa");
  const finalTotal = taxDetails.grandTotal;
  const cgstAmount = taxDetails?.totalCGST || 0;
  const sgstAmount = taxDetails?.totalSGST || 0;
  const igstAmount = taxDetails?.totalIGST || 0;

  return (
    <>
      {toastMessage && (
        <div className="fixed top-4 right-4 z-[10002] bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg animate-fade-in-out">
          {toastMessage}
        </div>
      )}

      {showQuickDealForm && (
        <QuickDealForm
          companies={companies}
          contacts={contacts}
          onDealCreated={handleDealCreated}
          onRequestClose={() => setShowQuickDealForm(false)}
        />
      )}

      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black/50 z-[10004] flex items-center justify-center">
          <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-sm sm:max-w-lg mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Unsaved Changes
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              You have unsaved changes. Are you sure you want to exit without
              saving?
            </p>
            <div className="flex justify-between gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmDialog(false)}
                className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors cursor-pointer hidden sm:block"
              >
                Cancel
              </button>
              <div className="flex space-x-1">
                <button
                  type="button"
                  onClick={handleConfirmExit}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors cursor-pointer"
                >
                  Exit Without Saving
                </button>
                <button
                  type="button"
                  onClick={handleSaveAndExit}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors cursor-pointer"
                >
                  Save and Exit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div
        ref={formRef}
        className={`fixed inset-0 z-[10000] w-full h-full bg-white overflow-y-auto transform transition-transform duration-300 ease-in-out ${isSliding ? "translate-y-0" : "translate-y-full"
          }`}
      >
        <form onSubmit={handleSubmit} className="h-full flex flex-col bg-[#F8F9FA] w-full min-h-screen">
          <div className="flex justify-between items-center px-6 py-4 bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={handleClose}
                className="text-gray-500 hover:text-gray-800 transition-colors flex items-center gap-1"
                aria-label="Close form"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <PdfIcon className="w-4 h-4 text-blue-600" />
                {editingPerformaInvoice
                  ? "Edit Pro Forma Invoice"
                  : "Create Pro Forma Invoice"}
              </h2>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={isSubmitting}
                className="h-8 px-4 flex items-center gap-1.5 rounded-full bg-[#0085FF] hover:bg-blue-600 text-white text-[13px] font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex-shrink-0"
              >
                {isSubmitting ? (
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <PdfIcon className="w-4 h-4" />
                )}
                Save as Draft
              </button>
            </div>
          </div>

          <div className="flex items-center px-6 py-3 bg-white border-b border-gray-100 text-sm">
            <span className="text-gray-500 mr-2">Style</span>
            <select
              value={form.style}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, style: e.target.value }));
                setHasUnsavedChanges(true);
              }}
              className="font-medium text-gray-800 bg-transparent border-none focus:ring-0 cursor-pointer p-0"
              aria-label="Select Pro Forma invoice style"
            >
              <option value="">Select style...</option>
              {DOCUMENT_TEMPLATES.map((s, idx) => (
                <option key={idx} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="p-6 space-y-6 flex-1 overflow-y-auto">
            {/* Customer Details card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                <div className="md:col-span-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-semibold text-gray-700">
                      Select Deal *
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowQuickDealForm(true)}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center"
                    >
                      + Create Customer
                    </button>
                  </div>
                  <div className="bg-blue-50/50 rounded-lg">
                    <SearchableDropdown
                      options={localDeals}
                      value={form.deal}
                      onChange={(value) => {
                        const selectedDeal = localDeals.find((d) => d._id === value);
                        const company = selectedDeal?.company;
                        const customerState = (company?.billingAddress?.state || '').trim().toLowerCase();
                        const autoType = (sellerState && customerState && sellerState !== customerState) ? 'inter' : 'intra';
                        setForm((prev) => ({ ...prev, deal: value, transactionType: autoType }));
                        setHasUnsavedChanges(true);
                      }}
                      placeholder="Select Deal"
                      displayKey="title"
                      valueKey="_id"
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="md:col-span-3 space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    Pro Forma Invoice Date *
                  </label>
                  <div className="relative">
                    <CalendarIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="date"
                      className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      required
                      value={form.date}
                      onChange={(e) => {
                        const newDate = e.target.value;
                        setForm((prev) => {
                          let newDueDate = prev.dueDate;
                          if (!editingPerformaInvoice && !prev.dueDate && newDate) {
                            const d = new Date(newDate);
                            d.setDate(d.getDate() + (defaultDueDateDays ?? 30));
                            newDueDate = d.toISOString().split("T")[0];
                          }
                          return { ...prev, date: newDate, dueDate: newDueDate };
                        });
                        setHasUnsavedChanges(true);
                      }}
                      aria-label="Select Pro Forma invoice date"
                    />
                  </div>
                </div>

                <div className="md:col-span-2 space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    Due Date
                  </label>
                  <div className="relative">
                    <CalendarIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="date"
                      className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      value={form.dueDate}
                      min={new Date().toISOString().split("T")[0]}
                      onChange={(e) => {
                        setForm((prev) => ({ ...prev, dueDate: e.target.value }));
                        setHasUnsavedChanges(true);
                      }}
                      aria-label="Select due date"
                    />
                  </div>
                </div>

                <div className="md:col-span-3 space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    Receiver GSTIN
                  </label>
                  <input
                    type="text"
                    placeholder="Enter Receiver GSTIN (e.g., 22AAAAA0000A1Z5)"
                    value={form.receiverGSTIN}
                    onChange={(e) => {
                      setForm((prev) => ({
                        ...prev,
                        receiverGSTIN: e.target.value.toUpperCase(),
                      }));
                      setHasUnsavedChanges(true);
                    }}
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    aria-label="Receiver GSTIN"
                  />
                </div>
              </div>
            </div>

            {/* Billing & Shipping Address card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-800">Billing & Shipping Address</h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setForm((prev) => {
                        const nowSame = !prev.sameAsBilling;
                        setHasUnsavedChanges(true);
                        return {
                          ...prev,
                          sameAsBilling: nowSame,
                          shippingAddress: nowSame ? prev.billingAddress : prev.shippingAddress,
                        };
                      })
                    }
                    className="flex-shrink-0"
                  >
                    <span
                      className={`w-9 h-5 rounded-full flex items-center px-0.5 transition-colors ${form.sameAsBilling ? "bg-blue-600" : "bg-gray-200"}`}
                    >
                      <span
                        className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${form.sameAsBilling ? "translate-x-4" : "translate-x-0"}`}
                      />
                    </span>
                  </button>
                  <span className="text-sm font-medium text-gray-700">
                    Shipping address same as billing
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 w-full">
                <AddressFieldsGroup
                  label="Billing address"
                  value={form.billingAddress}
                  onChange={(next) => {
                    // Same seller-state vs. customer-state re-check the deal
                    // picker runs, so editing the billing state directly on
                    // this document also flips CGST/SGST vs IGST instead of
                    // freezing whatever the deal's company implied.
                    const customerState = (next.state || "").trim().toLowerCase();
                    const autoType = sellerState && customerState && sellerState !== customerState ? "inter" : "intra";
                    setForm((prev) => ({
                      ...prev,
                      billingAddress: next,
                      shippingAddress: prev.sameAsBilling ? next : prev.shippingAddress,
                      transactionType: customerState ? autoType : prev.transactionType,
                    }));
                    setHasUnsavedChanges(true);
                  }}
                />
                <AddressFieldsGroup
                  label="Shipping address"
                  value={form.shippingAddress}
                  disabled={!!form.sameAsBilling}
                  onChange={(next) => {
                    setForm((prev) => ({ ...prev, shippingAddress: next }));
                    setHasUnsavedChanges(true);
                  }}
                />
              </div>
            </div>

            {/* Items card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
              <div className="flex items-center gap-2">
                <IndianRupeeIcon className="w-5 h-5 text-slate-600" />
                <label className="block font-semibold text-slate-700">
                  Pro Forma Invoice Items
                </label>
              </div>

              {/* Quick-add bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 p-3 mb-5 bg-blue-50/60 border border-blue-100 rounded-xl">
                <div className="flex-1 min-w-0">
                  <ItemSearchSelect
                    value={quickAddItem}
                    onSelect={(itemData) => setQuickAddItem(itemData)}
                    onAddNew={handleOpenItemForm}
                    allowAddNew={false}
                    showSelectedValue={false}
                    excludeIds={form.items.map((i) => i._id).filter(Boolean)}
                    fetchItems={fetchItems}
                    items={items}
                    setItems={setItems}
                  />
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <input
                    type="number"
                    min="1"
                    placeholder="Qty"
                    value={quickAddQty}
                    onChange={(e) => setQuickAddQty(e.target.value)}
                    onWheel={(e) => e.target.blur()}
                    className="w-20 border border-blue-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/40"
                  />
                  <button
                    type="button"
                    onClick={handleAddToBill}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <PlusIcon className="w-4 h-4" />
                    Add to Bill
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {form.items.map((item, index) => (
                  <div
                    key={index}
                    className="bg-white p-4 rounded-lg border border-slate-200 space-y-4"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-600">
                          Item
                        </label>
                        <ItemSearchSelect
                          value={item}
                          onSelect={(itemData) =>
                            handleItemSelect(index, itemData)
                          }
                          onAddNew={handleOpenItemForm}
                          fetchItems={fetchItems}
                          items={items}
                          setItems={setItems}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-600">
                          Description
                        </label>
                        <input
                          type="text"
                          placeholder="Item description"
                          value={item.description}
                          onChange={(e) => {
                            handleItemChange(
                              index,
                              "description",
                              e.target.value
                            );
                            setHasUnsavedChanges(true);
                          }}
                          className="w-full border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all duration-200"
                          aria-label="Item description"
                        />
                      </div>
                    </div>

                    <div className={`grid grid-cols-1 md:grid-cols-2 gap-4`}>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-600">
                          Rate (₹)
                        </label>
                        <input
                          type="number"
                          placeholder="0"
                          min="0"
                          step="0.01"
                          value={item.rate}
                          onChange={(e) => {
                            handleItemChange(index, "rate", e.target.value);
                            setHasUnsavedChanges(true);
                          }}
                          className="w-full border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all duration-200"
                          required
                          aria-label="Item rate"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-600">
                          Quantity
                        </label>
                        <input
                          type="number"
                          placeholder="1"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => {
                            handleItemChange(index, "quantity", e.target.value);
                            setHasUnsavedChanges(true);
                          }}
                          className="w-full border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all duration-200"
                          required
                          aria-label="Item quantity"
                        />
                      </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-600">
                              Discount
                            </label>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                placeholder="0"
                                min="0"
                                step={
                                  item.discountType === "percentage" ? "0.1" : "0.01"
                                }
                                value={item.discount}
                                onChange={(e) => {
                                  handleItemChange(
                                    index,
                                    "discount",
                                    e.target.value
                                  );
                                  setHasUnsavedChanges(true);
                                }}
                                className="w-full border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all duration-200"
                                aria-label="Item discount"
                              />
                              <select
                                value={item.discountType}
                                onChange={(e) => {
                                  handleItemChange(
                                    index,
                                    "discountType",
                                    e.target.value
                                  );
                                  setHasUnsavedChanges(true);
                                }}
                                className="border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all duration-200"
                                aria-label="Discount type"
                              >
                                <option value="amount">₹</option>
                                <option value="percentage">%</option>
                              </select>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-600">
                              HSN/SAC
                            </label>
                            <input
                              type="text"
                              placeholder="HSN/SAC code"
                              value={item.hsn}
                              onChange={(e) => {
                                handleItemChange(index, "hsn", e.target.value);
                                setHasUnsavedChanges(true);
                              }}
                              className="w-full border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all duration-200"
                              required
                              aria-label="HSN/SAC code"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-600">
                              GST Rate (%)
                            </label>
                            <select
                              value={item.gstRate ?? 0}
                              onChange={(e) => {
                                handleItemChange(index, "gstRate", parseFloat(e.target.value));
                                setHasUnsavedChanges(true);
                              }}
                              className="w-full border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all duration-200"
                              aria-label="Item GST rate"
                            >
                              <option value={0}>0%</option>
                              <option value={5}>5%</option>
                              <option value={12}>12%</option>
                              <option value={18}>18%</option>
                              <option value={28}>28%</option>
                            </select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-600">
                              Rate Includes Tax?
                            </label>
                            <select
                              value={item.taxInclusive ? "inclusive" : "exclusive"}
                              onChange={(e) => {
                                handleItemChange(
                                  index,
                                  "taxInclusive",
                                  e.target.value === "inclusive"
                                );
                                setHasUnsavedChanges(true);
                              }}
                              className="w-full border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all duration-200"
                              aria-label="Rate includes tax"
                            >
                              <option value="exclusive">Without Tax</option>
                              <option value="inclusive">With Tax</option>
                            </select>
                          </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-600">
                          Amount
                        </label>
                        <div className="w-full p-2.5 bg-slate-100 border border-slate-200 rounded-lg text-slate-700 font-medium">
                          <h6>₹{formatNumberFixed(calculateItemAmount(item))}</h6>
                        </div>
                      </div>
                    </div>

                    {form.items.length > 1 && (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(index)}
                          className="flex items-center gap-2 text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-lg transition-all duration-200"
                          aria-label="Remove item"
                        >
                          <DeleteIcon className="w-4 h-4" />
                          Remove Item
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={handleAddItem}
                  className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium p-2 rounded-lg hover:bg-blue-50 transition-all duration-200"
                  aria-label="Add another item"
                >
                  <PlusIcon className="w-4 h-4" />
                  Add Another Item
                </button>
              </div>
            </div>

            {/* Notes / Terms / Signature / Totals */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-5">
                <div>
                  <SectionHeader number="01" title="Notes" />
                  <textarea
                    placeholder="Enter your notes, say thanks, or anything else"
                    rows={3}
                    value={form.notes}
                    onChange={(e) => {
                      setForm((prev) => ({ ...prev, notes: e.target.value }));
                      setHasUnsavedChanges(true);
                    }}
                    className="w-full px-3 py-2 rounded-[25px] border border-gray-200 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:border-blue-500 resize-y"
                  />
                </div>

                <div>
                  <SectionHeader number="02" title="Terms & Conditions" />
                  <textarea
                    placeholder="Enter terms & conditions"
                    rows={3}
                    value={form.terms}
                    onChange={(e) => {
                      setForm((prev) => ({ ...prev, terms: e.target.value }));
                      setHasUnsavedChanges(true);
                    }}
                    className="w-full px-3 py-2 rounded-[25px] border border-gray-200 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:border-blue-500 resize-y"
                  />
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    Invoice Discount
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder="0"
                      min="0"
                      step={form.discount.type === "percentage" ? "0.1" : "0.01"}
                      value={form.discount.value}
                      onWheel={(e) => e.target.blur()}
                      onChange={(e) => {
                        handleDiscountChange("value", e.target.value);
                        setHasUnsavedChanges(true);
                      }}
                      className="w-full border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all duration-200"
                      aria-label="Invoice discount"
                    />
                    <select
                      value={form.discount.type}
                      onChange={(e) => {
                        handleDiscountChange("type", e.target.value);
                        setHasUnsavedChanges(true);
                      }}
                      className="border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all duration-200"
                      aria-label="Invoice discount type"
                    >
                      <option value="fixed">₹</option>
                      <option value="percentage">%</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2 p-6 bg-gradient-to-r from-slate-50 to-blue-50/30 rounded-xl border border-slate-200/50">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-slate-600">
                      Subtotal
                    </span>
                    <span className="text-sm font-medium text-slate-900">
                      ₹{formatNumberToIndian(subtotal)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-slate-600">
                      Item Discounts
                    </span>
                    <span className="text-sm font-medium text-red-600">
                      - ₹{formatNumberToIndian(totalItemDiscounts)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-sm font-medium text-slate-600">
                      After Item Discounts
                    </span>
                    <span className="text-sm font-medium text-slate-900">
                      <h6>₹{formatNumberToIndian(subtotalAfterItemDiscounts)}</h6>
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-slate-600">
                      Invoice Discount
                    </span>
                    <span className="text-sm font-medium text-red-600">
                      <h6>- ₹{formatNumberToIndian(invoiceDiscountAmount)}</h6>
                    </span>
                  </div>
                  {taxDetails && !taxDetails.isInterState && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-slate-600">CGST</span>
                        <span className="text-sm font-medium text-slate-900">₹{formatNumberToIndian(cgstAmount)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-slate-600">SGST</span>
                        <span className="text-sm font-medium text-slate-900">₹{formatNumberToIndian(sgstAmount)}</span>
                      </div>
                    </>
                  )}
                  {taxDetails && taxDetails.isInterState && (
                    <div className="flex justify-between">
                      <span className="text-sm font-medium text-slate-600">IGST</span>
                      <span className="text-sm font-medium text-slate-900">₹{formatNumberToIndian(igstAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t pt-2 mt-2">
                    <span className="text-lg font-bold text-slate-900">
                      Final Total
                    </span>
                    <span className="text-lg font-bold text-slate-900">
                      <h6>₹{formatNumberToIndian(finalTotal)}</h6>
                    </span>
                  </div>
                  <div className="text-sm text-slate-600 italic text-right mt-2">
                    {numberToWords(finalTotal)}
                  </div>
                </div>

                <div>
                  <SectionHeader number="03" title="Signature" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <div className="relative flex items-center h-10 rounded-[25px] border border-gray-200 focus-within:border-blue-500 overflow-hidden">
                        <select
                          value={form.signature}
                          onChange={(e) => {
                            setForm((prev) => ({ ...prev, signature: e.target.value }));
                            setHasUnsavedChanges(true);
                          }}
                          disabled={signaturesLoading}
                          className="flex-1 min-w-0 h-full pl-3 pr-8 text-[13px] bg-transparent appearance-none focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <option value="">No signature</option>
                          {savedSignatures.map((sig) => (
                            <option key={sig.id} value={sig.dataUrl}>
                              {sig.name}
                              {sig.isDefault ? " (Default)" : ""}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      </div>
                      <p className="text-xs text-gray-400">
                        {signaturesLoading
                          ? "Loading signatures…"
                          : savedSignatures.length === 0
                            ? "No saved signatures yet — add them in Settings → Document Settings → Signatures."
                            : "The default is applied to every pro forma invoice unless you pick another here."}
                      </p>
                    </div>
                    <div className="h-[72px] flex items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50">
                      {form.signature ? (
                        <img
                          src={form.signature}
                          alt="Selected signature"
                          className="max-h-16 max-w-full object-contain"
                        />
                      ) : (
                        <span className="text-xs text-gray-400">No signature selected</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 z-20 w-full pt-3 pb-1 -mx-6 mt-12 flex justify-center pointer-events-none">
              <div className="pointer-events-auto flex w-full max-w-2xl items-center justify-between gap-5 rounded-full border border-[#E1E4EA] bg-white/95 backdrop-blur-sm pl-6 pr-2.5 py-2.5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.22)]">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold tracking-wide text-[#99A0AE] uppercase leading-none">
                    Total
                  </p>
                  <p className="text-[18px] font-bold text-[#1F2937] leading-tight truncate">
                    ₹{formatNumberToIndian(finalTotal)}
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-9 px-4 flex items-center gap-1.5 rounded-full bg-[#0085FF] hover:bg-blue-600 text-white text-[13px] font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {isSubmitting
                    ? editingPerformaInvoice
                      ? "Updating..."
                      : "Creating..."
                    : editingPerformaInvoice
                      ? "Update Pro Forma Invoice"
                      : "Create Pro Forma Invoice"}
                  {!isSubmitting && <ChevronRight className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </form>

        {showItemForm && (
          <ItemForm
            form={itemForm}
            setForm={setItemForm}
            loading={itemFormLoading}
            setLoading={setItemFormLoading}
            setError={setItemFormError}
            setSuccess={setItemFormSuccess}
            fetchItems={fetchItems}
            onRequestClose={() => {
              resetItemForm();
              setShowItemForm(false);
            }}
          />
        )}
      </div>
    </>
  );
};

export default PerformaInvoiceForm;

import { CreateInvoicePanel } from "../invoice/InvoiceForm";

const CreatePerformaPanel = (props) => (
  <CreateInvoicePanel {...props} type="performa" />
);

export { CreatePerformaPanel };
