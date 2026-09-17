import DeleteIcon from "../common/DeleteIcon";
import { resolveField, resolveDiscount, resolveMaxDiscountPercent } from "../../utils/variantResolve";
import PdfIcon from "../common/PdfIcon";
import Checkbox from "../common/Checkbox";
import PlusIcon from "../common/PlusIcon";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { formatNumberToIndian, formatNumberFixed } from "../../utils/numberFormatter";
import { PREDEFINED_NOTES, PREDEFINED_TERMS } from "../../utils/documentDefaultText";
import {
  IndianRupeeIcon,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Inbox,
  Printer,
  Eye,
} from "lucide-react";
import API from "../../services/api";
import ItemForm from "../item/ItemForm";
import QuickDealForm from "../deal/QuickDealForm";
import SearchableDropdown from "../contact/SearchableDropdown";
import toast from "react-hot-toast";
import { AddressFieldsGroup, emptyAddress, isAddressEmpty, SectionHeader } from "../invoice/formPrimitives";

import SearchIcon from "../common/SearchIcon";
import SettingsIcon from "../common/SettingsIcon";
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
      isVariant: item.isVariant || false,
      parentItemId: item.parentItemId || null,
      // The product's own default discount — previously always started at 0.
      discountType: item.discount?.type || "amount",
      discount: item.discount?.value || 0,
        type: item.type,
        stock: item.stock,
        gstRate: item.gstRate,
        taxInclusive: item.taxInclusive,
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

const DeliveryChallanForm = ({
  deals,
  isOpen,
  onClose,
  fetchData,
  editingDeliveryChallan,
  onPreview,
  defaultDueDateDays = null,
  defaultNotesByType = {},
  defaultTermsByType = {},
  defaultNotesFlat = "",
  defaultTermsFlat = "",
}) => {
  const defaultNotesForNewChallan = defaultNotesByType.deliveryChallan !== undefined
    ? defaultNotesByType.deliveryChallan
    : (defaultNotesFlat || PREDEFINED_NOTES.deliveryChallan || "");
  const defaultTermsForNewChallan = defaultTermsByType.deliveryChallan !== undefined
    ? defaultTermsByType.deliveryChallan
    : (defaultTermsFlat || PREDEFINED_TERMS.deliveryChallan || "");

  const [form, setForm] = useState({
    deal: "",
    date: "",
    dueDate: "",
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
    isRoundOff: false,
    hideTotals: false,
  });
  const [isSliding, setIsSliding] = useState(false);
  const [shouldRender, setShouldRender] = useState(true);
  const [showItemForm, setShowItemForm] = useState(false);
  const [savedSignatures, setSavedSignatures] = useState([]);
  const [signaturesLoading, setSignaturesLoading] = useState(false);
  const [showQuickDealForm, setShowQuickDealForm] = useState(false);
  const [localDeals, setLocalDeals] = useState(deals);
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
      if (formRef.current) formRef.current.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
      return () => {
        if (formRef.current) formRef.current.style.overflow = "auto";
        document.body.style.overflow = "";
      };
    }
  }, [showItemForm]);

  // Fetch items and variants
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
              sellingPrice: variant.sellingPrice || item.sellingPrice,
              // Variant-first: the variant's own discount when it sets one, otherwise the
              // parent item's catalog default (see utils/variantResolve.js).
              discount: resolveDiscount(variant, item),
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
              discount: item.discount,
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

  // Fetch companies and contacts
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
    if (editingDeliveryChallan) {
      setForm({
        deal: editingDeliveryChallan.deal?._id || "",
        date: editingDeliveryChallan.date
          ? editingDeliveryChallan.date.slice(0, 10)
          : "",
        dueDate: editingDeliveryChallan.dueDate
          ? editingDeliveryChallan.dueDate.slice(0, 10)
          : "",
        billingAddress: { ...emptyAddress(), ...(editingDeliveryChallan.billingAddress || {}) },
        shippingAddress: { ...emptyAddress(), ...(editingDeliveryChallan.shippingAddress || {}) },
        sameAsBilling:
          isAddressEmpty(editingDeliveryChallan.shippingAddress) ||
          JSON.stringify({ ...emptyAddress(), ...(editingDeliveryChallan.billingAddress || {}) }) ===
            JSON.stringify({ ...emptyAddress(), ...(editingDeliveryChallan.shippingAddress || {}) }),
        notes: editingDeliveryChallan.notes || "",
        terms: editingDeliveryChallan.terms || "",
        signature: editingDeliveryChallan.signature || "",
        items: editingDeliveryChallan.items.map((item) => ({
          _id: (item.isVariant ? item.variantId : item.itemId) || item.itemId || null,
          name: item.name || "",
          description: item.description || "",
          rate: item.rate || "",
          quantity: item.quantity || 1,
          isVariant: item.isVariant || false,
          parentItemId: item.parentItemId || null,
          discountType: item.discountType || "amount",
          discount: item.discount || 0,
        })),
        discount: editingDeliveryChallan.discount || {
          type: "fixed",
          value: 0,
        },
        amount: editingDeliveryChallan.amount || 0,
        status: editingDeliveryChallan.status || "Draft",
      });
      setHasUnsavedChanges(false);
    } else {
      setForm({
        deal: "",
        date: "",
        dueDate: "",
        billingAddress: emptyAddress(),
        shippingAddress: emptyAddress(),
        sameAsBilling: true,
        notes: defaultNotesForNewChallan,
        terms: defaultTermsForNewChallan,
        signature: "",
        items: [
          {
            _id: null,
            name: "",
            description: "",
            rate: "",
            quantity: 1,
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
      });
      setHasUnsavedChanges(false);
    }
  }, [editingDeliveryChallan]);

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

      if (field === "value") {
        const parsedValue = parseFloat(value) || 0;
        if (
          prev.discount.type === "fixed" &&
          parsedValue > subtotalAfterItemDiscounts
        ) {
          newValue = subtotalAfterItemDiscounts;
          toast.error(
            "Delivery Challan discount cannot exceed subtotal after item discounts."
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
          "Delivery Challan discount cannot exceed subtotal after item discounts."
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
          isVariant: false,
              parentItemId: null,
              stock: item.inventory?.currentStock ?? 0,
          discountType: "amount",
          discount: 0,
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
    if (formRef.current) formRef.current.scrollTop = 0;
    setShowItemForm(true);
  };

  const handleDealCreated = (newDeal) => {
    setLocalDeals((prev) => [...prev, newDeal]);
    setForm((prev) => ({ ...prev, deal: newDeal._id }));
    setHasUnsavedChanges(true);
    setShowQuickDealForm(false);
  };

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
      return { ...prev, items: newItems, amount: calculateTotalAmount(newItems, prev.discount) };
    });
    setQuickAddItem(null);
    setQuickAddQty(1);
    setHasUnsavedChanges(true);
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

  const submitDeliveryChallan = async (statusValue) => {
    setIsSubmitting(true);
    const isDraft = statusValue === 'Draft';

    if (!form.deal) {
      toast.error("Deal is required.");
      setIsSubmitting(false);
      return;
    }

    if (!form.date) {
      toast.error("Delivery Challan Date is required.");
      setIsSubmitting(false);
      return;
    }

    if (!isDraft) {
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

    const subtotalAfterItemDiscounts = calculateSubtotalAfterItemDiscounts(
      form.items
    );
    const invoiceDiscountAmount = calculateInvoiceDiscountAmount(
      subtotalAfterItemDiscounts,
      form.discount
    );
    if (invoiceDiscountAmount > subtotalAfterItemDiscounts) {
        toast.error(
          "Delivery Challan discount cannot exceed subtotal after item discounts."
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
        billingAddress: form.billingAddress,
        shippingAddress: form.sameAsBilling ? form.billingAddress : form.shippingAddress,
        notes: form.notes,
        terms: form.terms,
        signature: form.signature,
        amount: calculateTotalAmount(form.items, form.discount),
        discount: form.discount,
        status: statusValue,
        items: form.items.map((item) => ({
          itemId: item.isVariant ? item.parentItemId : item._id,
          variantId: item.isVariant ? item._id : null,
          name: item.name,
          description: item.description,
          rate: parseFloat(item.rate),
          quantity: parseInt(item.quantity),
          isVariant: item.isVariant,
          parentItemId: item.parentItemId,
          discountType: item.discountType,
          discount: parseFloat(item.discount),
        })),
      };

      if (editingDeliveryChallan) {
        await API.put(
          `/delivery-challans/${editingDeliveryChallan._id}`,
          payload
        );
        toast.success(isDraft ? "Saved as draft!" : "Delivery Challan updated successfully!");
      } else {
        await API.post("/delivery-challans", payload);
        toast.success(isDraft ? "Saved as draft!" : "Delivery Challan created successfully!");
      }

      setHasUnsavedChanges(false);
      setForm({
        deal: "",
        date: "",
        dueDate: "",
        billingAddress: emptyAddress(),
        shippingAddress: emptyAddress(),
        sameAsBilling: true,
        notes: defaultNotesForNewChallan,
        terms: defaultTermsForNewChallan,
        signature: "",
        items: [
          {
            _id: null,
            name: "",
            description: "",
            rate: "",
            quantity: 1,
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
      });
      await fetchData();
      onClose();
    } catch (err) {
      const errorMessage = err.response?.status === 402
        ? (err.response?.data?.message || "An active subscription is required to make changes.")
        : (err.response?.data?.error || (editingDeliveryChallan ? "Failed to update delivery challan" : "Failed to create delivery challan"));
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
    await submitDeliveryChallan('Pending');
    if (!toastMessage.includes("Failed")) {
      setShowConfirmDialog(false);
      onClose();
    }
  };

  const handleSaveDraft = () => submitDeliveryChallan('Draft');
  const handleSubmit = (e) => {
    e.preventDefault();
    submitDeliveryChallan(form.status || 'Draft');
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
  let finalTotal = subtotalAfterItemDiscounts - invoiceDiscountAmount;
  let roundOffAmount = 0;
  if (form.isRoundOff) {
    const rounded = Math.round(finalTotal);
    roundOffAmount = rounded - finalTotal;
    finalTotal = rounded;
  }

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
          {/* Section 1: Header */}
          <div className="flex justify-between items-center px-6 py-4 bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
            <div className="flex items-center gap-6">
              <button
                type="button"
                onClick={handleClose}
                className="text-gray-500 hover:text-gray-800 transition-colors flex items-center gap-1"
                aria-label="Close form"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex flex-col">
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-1">
                  {editingDeliveryChallan
                    ? "Edit Delivery Challan"
                    : "Create Delivery Challan"}{" "}
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={isSubmitting}
                className="h-8 px-4 flex items-center gap-1.5 rounded-full bg-[#0085FF] hover:bg-blue-600 text-white text-[13px] font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex-shrink-0"
              >
                <PdfIcon className="w-4 h-4" />
                {isSubmitting ? "Saving..." : "Save as Draft"}
              </button>
            </div>
          </div>

          <div className="p-6 space-y-6 flex-1 overflow-y-auto">
            {/* Card 1: Challan Details */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <SectionHeader number="01" title="Challan Details" />
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                {/* Select Customer */}
                <div className="md:col-span-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-semibold text-gray-700">Select Customer</label>
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
                        setForm((prev) => ({ ...prev, deal: value }));
                        setHasUnsavedChanges(true);
                      }}
                      placeholder="Search customers by name, company..."
                      displayKey="title"
                      valueKey="_id"
                      className="w-full"
                    />
                  </div>
                </div>

                {/* Challan Date */}
                <div className="md:col-span-2 space-y-2">
                  <label className="text-sm font-semibold text-gray-700">Challan Date</label>
                  <div className="relative">
                    <input
                      type="date"
                      className="w-full pl-3 pr-8 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      required
                      value={form.date}
                      onChange={(e) => {
                        const newDate = e.target.value;
                        setForm((prev) => {
                          let newDueDate = prev.dueDate;
                          if (!editingDeliveryChallan && !prev.dueDate) {
                            const offsetDays = defaultDueDateDays ?? 30;
                            const d = new Date(newDate);
                            d.setDate(d.getDate() + offsetDays);
                            newDueDate = d.toISOString().split("T")[0];
                          }
                          return { ...prev, date: newDate, dueDate: newDueDate };
                        });
                        setHasUnsavedChanges(true);
                      }}
                    />
                  </div>
                </div>

                {/* Due Date */}
                <div className="md:col-span-3 space-y-2">
                  <div className="flex items-center gap-1">
                    <label className="text-sm font-semibold text-gray-700">Due Date</label>
                    <div className="group relative">
                      <div className="w-3.5 h-3.5 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center text-[10px] cursor-help">?</div>
                    </div>
                  </div>
                  <div className="relative">
                    <input
                      type="date"
                      className="w-full pl-3 pr-8 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      value={form.dueDate}
                      min={new Date().toISOString().split("T")[0]}
                      onChange={(e) => {
                        setForm((prev) => ({ ...prev, dueDate: e.target.value }));
                        setHasUnsavedChanges(true);
                      }}
                    />
                  </div>
                  {/* Quick Date Buttons */}
                  <div className="flex gap-2 mt-1">
                    {[7, 15, 30].map((days) => (
                      <button
                        key={days}
                        type="button"
                        className="text-[11px] font-medium px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 transition-colors"
                        onClick={() => {
                          const newDate = new Date();
                          newDate.setDate(newDate.getDate() + days);
                          setForm((prev) => ({ ...prev, dueDate: newDate.toISOString().split("T")[0] }));
                          setHasUnsavedChanges(true);
                        }}
                      >
                        +{days} Days
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: Billing & Shipping Address */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <SectionHeader number="02" title="Billing & Shipping Address" />
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
                    setForm((prev) => ({
                      ...prev,
                      billingAddress: next,
                      shippingAddress: prev.sameAsBilling ? next : prev.shippingAddress,
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

            {/* Card 3: Products & Services */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-slate-800">Products & Services</h3>
                  <div className="group relative">
                    <div className="w-4 h-4 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center text-[10px] cursor-help">?</div>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenItemForm}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 ml-2"
                  >
                    + Add new Product?
                  </button>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input type="checkbox" className="rounded text-blue-600 focus:ring-blue-500" defaultChecked />
                    Show description
                  </label>
                  <button type="button" className="text-gray-400 hover:text-gray-600" aria-label="Settings">
                    <SettingsIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Quick-add bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 p-3 mb-5 bg-blue-50/60 border border-blue-100 rounded-xl">
                <div className="flex-1 min-w-0">
                  <ItemSearchSelect
                    value={quickAddItem}
                    onSelect={(itemData) => setQuickAddItem(itemData)}
                    onAddNew={handleOpenItemForm}
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
                    className="w-20 h-[42px] text-center text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 flex-shrink-0"
                  />
                  <button
                    type="button"
                    onClick={handleAddToBill}
                    className="h-[42px] px-4 flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
                  >
                    <PlusIcon className="w-4 h-4" />
                    Add to Bill
                  </button>
                </div>
              </div>

              {form.items.length === 0 || (form.items.length === 1 && !form.items[0].name && !form.items[0]._id) ? (
                /* Empty state */
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <Inbox className="w-12 h-12 text-gray-300 mb-4" strokeWidth={1.5} />
                  <p className="text-gray-500 text-sm mb-4">
                    Search existing products to add to this list or add new product to get started!
                  </p>
                  <button
                    type="button"
                    onClick={handleOpenItemForm}
                    className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-semibold text-sm rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <PlusIcon className="w-4 h-4" />
                    Add New Product
                  </button>
                </div>
              ) : (
                <>
                  {/* Column Headers */}
                  <div className="grid grid-cols-12 gap-4 pb-2 border-b border-gray-100 text-xs font-semibold text-gray-500">
                    <div className="col-span-4">Product Name</div>
                    <div className="col-span-2 text-center">Quantity</div>
                    <div className="col-span-2 text-right">Unit Price</div>
                    <div className="col-span-2 text-center">Discount</div>
                    <div className="col-span-2 text-right">Total</div>
                  </div>

                  {/* Item Rows */}
                  <div className="space-y-4 mt-4">
                    {form.items.map((item, index) => {
                      const rowTotal = calculateItemAmount(item);
                      return (
                        <div key={index} className="group relative py-3 border-b border-gray-100 last:border-b-0">
                          <div className="absolute -left-4 top-4 opacity-0 group-hover:opacity-100 cursor-move text-gray-300 hover:text-gray-500 transition-opacity">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8h16M4 16h16"></path></svg>
                          </div>

                          <div className="grid grid-cols-12 gap-4 items-start">
                            {/* Product Name */}
                            <div className="col-span-4">
                              <input
                                type="text"
                                value={item.name || ""}
                                onChange={(e) => {
                                  handleItemChange(index, "name", e.target.value);
                                  setHasUnsavedChanges(true);
                                }}
                                className="w-full text-sm font-medium text-gray-900 bg-transparent px-1 py-1.5 focus:outline-none focus:bg-gray-50 focus:ring-1 focus:ring-gray-200 rounded transition-colors"
                                placeholder="Product Name"
                                required
                              />
                            </div>

                            {/* Quantity */}
                            <div className="col-span-2">
                              <input
                                type="number"
                                placeholder="1"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => {
                                  handleItemChange(index, "quantity", e.target.value);
                                  setHasUnsavedChanges(true);
                                }}
                                className="w-full text-center text-sm border border-gray-200 rounded-lg px-2 py-2.5 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                                required
                              />
                            </div>

                            {/* Rate */}
                            <div className="col-span-2">
                              <input
                                type="number"
                                placeholder="0.00"
                                min="0"
                                step="0.01"
                                value={item.rate}
                                onChange={(e) => {
                                  handleItemChange(index, "rate", e.target.value);
                                  setHasUnsavedChanges(true);
                                }}
                                className="w-full text-right text-sm border border-gray-200 rounded-lg px-2 py-2.5 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                                required
                              />
                            </div>

                            {/* Discount */}
                            <div className="col-span-2">
                              <div className="flex items-center gap-1 border border-gray-200 rounded-lg bg-gray-50 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-colors overflow-hidden">
                                <input
                                  type="number"
                                  placeholder="0"
                                  min="0"
                                  step="0.01"
                                  value={item.discount}
                                  onChange={(e) => {
                                    handleItemChange(index, "discount", e.target.value);
                                    setHasUnsavedChanges(true);
                                  }}
                                  className="w-full min-w-0 text-center text-sm px-2 py-2.5 bg-transparent focus:outline-none"
                                />
                                <select
                                  value={item.discountType}
                                  onChange={(e) => {
                                    handleItemChange(index, "discountType", e.target.value);
                                    setHasUnsavedChanges(true);
                                  }}
                                  className="w-12 text-xs font-medium border-l border-gray-200 bg-gray-100 py-3 focus:outline-none cursor-pointer"
                                >
                                  <option value="percentage">%</option>
                                  <option value="amount">₹</option>
                                </select>
                              </div>
                            </div>

                            {/* Total & Delete */}
                            <div className="col-span-2 flex items-center justify-end gap-3 pt-2">
                              <span className="font-semibold text-gray-900 tabular-nums">
                                ₹{formatNumberToIndian(rowTotal)}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(index)}
                                className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                aria-label="Remove item"
                              >
                                <DeleteIcon className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* More Details (Expandable) — description only, no HSN/SAC for delivery challan */}
                          <details className="mt-3 group/details">
                            <summary className="text-xs font-semibold text-blue-600 cursor-pointer list-none flex items-center gap-1 w-max select-none">
                              <ChevronRight className="w-3.5 h-3.5 transition-transform group-open/details:rotate-90" />
                              More Details
                            </summary>
                            <div className="pt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-1 md:col-span-2">
                                <label className="text-xs text-gray-500 font-medium">Item Description</label>
                                <textarea
                                  placeholder="Enter item description..."
                                  value={item.description}
                                  rows={2}
                                  onChange={(e) => {
                                    handleItemChange(index, "description", e.target.value);
                                    setHasUnsavedChanges(true);
                                  }}
                                  className="w-full resize-none text-sm text-gray-700 border-b border-gray-200 px-1 py-1.5 focus:outline-none focus:border-blue-400 bg-transparent"
                                />
                              </div>
                            </div>
                          </details>
                        </div>
                      );
                    })}
                  </div>

                </>
              )}
            </div>

            {/* Notes, Terms, Totals, Signature — 2-column grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

              {/* Left Column: Notes & Terms */}
              <div className="space-y-5">
                <div>
                  <SectionHeader number="05" title="Notes" />
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
                  <SectionHeader number="06" title="Terms & Conditions" />
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

              {/* Right Column: Totals & Signature */}
              <div className="space-y-6">

                {/* Green Math Card */}
                <div className="bg-[#EBF5EE] rounded-xl p-5 shadow-sm space-y-4 relative">
                  <div className="flex justify-end gap-2 items-center mb-2">
                    <span className="text-xs text-gray-500 font-medium">Extra Discount</span>
                    <div className="flex items-center border border-gray-200 bg-white rounded-[25px] overflow-hidden h-8">
                      <select
                        value={form.discount.type}
                        onChange={(e) => {
                          handleDiscountChange("type", e.target.value);
                          setHasUnsavedChanges(true);
                        }}
                        className="text-xs font-medium text-gray-600 bg-transparent border-r border-gray-200 pl-3 pr-2 py-1 focus:outline-none cursor-pointer"
                      >
                        <option value="fixed">₹</option>
                        <option value="percentage">%</option>
                      </select>
                      <input
                        type="number"
                        placeholder="0"
                        min="0"
                        step="0.01"
                        value={form.discount.value}
                        onWheel={(e) => e.target.blur()}
                        onChange={(e) => {
                          handleDiscountChange("value", e.target.value);
                          setHasUnsavedChanges(true);
                        }}
                        className="w-16 text-right text-xs pr-3 pl-1 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600 font-medium">Taxable Amount</span>
                      <span className="text-gray-900 font-semibold">₹{formatNumberFixed(subtotalAfterItemDiscounts)}</span>
                    </div>

                    <div className="flex justify-between items-center text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-600 font-medium">Round Off</span>
                        <label className="relative cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={form.isRoundOff}
                            onChange={(e) => {
                              setForm((p) => ({ ...p, isRoundOff: e.target.checked }));
                              setHasUnsavedChanges(true);
                            }}
                          />
                          <div className="w-7 h-4 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>
                      <span className={`font-semibold ${roundOffAmount !== 0 ? (roundOffAmount > 0 ? "text-green-600" : "text-red-500") : "text-gray-900"}`}>
                        {roundOffAmount > 0 ? "+" : ""}{formatNumberFixed(roundOffAmount)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center pt-2">
                      <span className="text-lg font-bold text-gray-900">Total Amount</span>
                      <span className="text-lg font-bold text-gray-900">₹{formatNumberFixed(finalTotal)}</span>
                    </div>

                    <div className="flex justify-between items-center text-sm pt-1">
                      <span className="text-gray-500">Total Discount</span>
                      <span className="text-gray-600 font-medium">₹{formatNumberFixed(totalItemDiscounts + invoiceDiscountAmount - roundOffAmount)}</span>
                    </div>

                    <div className="flex justify-end gap-2 text-xs pt-1">
                      <label className="flex items-center gap-1.5 cursor-pointer text-gray-500">
                        Hide Totals
                        <Checkbox checked={form.hideTotals} onChange={(e) => {
                            setForm((p) => ({ ...p, hideTotals: e.target.checked }));
                            setHasUnsavedChanges(true);
                          }} />
                      </label>
                    </div>

                    <div className="text-xs text-gray-400 italic text-right mt-1">
                      {numberToWords(finalTotal)}
                    </div>
                  </div>
                </div>

                {/* Signature */}
                <div>
                  <SectionHeader number="07" title="Signature" />
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
                          ? "Loading signatures..."
                          : savedSignatures.length === 0
                            ? "No saved signatures yet -- add them in Settings -> Document Settings -> Signatures."
                            : "The default is applied to every delivery challan unless you pick another here."}
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

            {/* Sticky Footer */}
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
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => onPreview && onPreview()}
                    className="h-9 px-4 flex items-center gap-1.5 bg-white border border-[#E1E4EA] rounded-full text-[13px] font-medium text-[#1F2937] hover:bg-gray-50 transition-colors whitespace-nowrap"
                  >
                    <Printer className="w-3.5 h-3.5 text-[#525866]" />
                    Print
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="h-9 px-4 flex items-center gap-1.5 rounded-full bg-[#0085FF] hover:bg-blue-600 text-white text-[13px] font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {isSubmitting
                      ? editingDeliveryChallan
                        ? "Updating..."
                        : "Creating..."
                      : editingDeliveryChallan
                        ? "Update Delivery Challan"
                        : "Create Delivery Challan"}
                    {!isSubmitting && <ChevronRight className="w-4 h-4" />}
                  </button>
                </div>
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

export default DeliveryChallanForm;

import { CreateInvoicePanel } from "../invoice/InvoiceForm";

const CreateChallanPanel = (props) => (
  <CreateInvoicePanel {...props} type="deliveryChallan" />
);

export { CreateChallanPanel };
