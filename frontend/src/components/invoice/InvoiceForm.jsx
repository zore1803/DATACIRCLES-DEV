import DeleteIcon from "../common/DeleteIcon";
import { resolveField, resolveDiscount, resolveMaxDiscountPercent } from "../../utils/variantResolve";
import PdfIcon from "../common/PdfIcon";
import Checkbox from "../common/Checkbox";
import PlusIcon from "../common/PlusIcon";
import SearchIcon from "../common/SearchIcon";
import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { formatNumberToIndian, formatNumberFixed } from "../../utils/numberFormatter";
import {
  IndianRupeeIcon,
  X,
  ChevronDown,
  PenLine,
  CheckCircle2,
  Printer,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  ChevronsLeftRight,
  Inbox,
} from "lucide-react";
import API from "../../services/api";
import ItemForm from "../item/ItemForm";
import QuickItemDrawer from "../item/QuickItemDrawer";
import QuickDealForm from "../deal/QuickDealForm";
import SearchableDropdown from "../contact/SearchableDropdown";
import toast from "react-hot-toast";
import { PREDEFINED_NOTES, PREDEFINED_TERMS } from "../../utils/documentDefaultText";

import SettingsIcon from "../common/SettingsIcon";
import InvoiceLivePreview from "./InvoiceLivePreview";
import BankSelect from "./BankSelect";
import InsufficientStockDialog from "../common/InsufficientStockDialog";
import TemplateDrawer from "./TemplateDrawer";
import NotesTermsDrawer from "./NotesTermsDrawer";
import { buildDocumentHtml, computeDocument, GST_RATES, DOCUMENT_TEMPLATES } from "../../../../shared/documentTemplates.js";
import {
  SectionHeader,
  FieldLabel,
  PickerSelect,
  AddressFieldsGroup,
  emptyAddress,
  isAddressEmpty,
  GSTIN_REGEX,
  blankItem,
} from "./formPrimitives.jsx";
import FullWidthDocumentPanel from "./FullWidthDocumentPanel.jsx";
import EyeIcon from "../common/EyeIcon";
import EditIcon from "../common/EditIcon";
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
      hsn: item.hsn || "",
      isVariant: item.isVariant || false,
      parentItemId: item.parentItemId || null,
      // The product's own default discount (set in QuickItemDrawer's "More
      // Details" -> Discount) — previously always started at 0, ignoring
      // whatever default the product was configured with.
      discountType: item.discount?.type || "amount",
      discount: item.discount?.value || 0,
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
          className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all duration-200 bg-white"
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



// Stock is only enforced server-side at save, which meant a sold-out product
// could sit in the bill until the very end. Products (and their variants)
// carry a numeric stock; services don't, and are never blocked.
const stockBlockReason = (item, qty) => {
  if (!item || item.type !== "product") return null;
  const stock = Number(item.stock);
  if (!Number.isFinite(stock)) return null;
  const name = item.displayName || item.name || "This product";
  if (stock <= 0) return `${name} is out of stock.`;
  if (qty > stock) return `Only ${stock} left in stock for ${name}.`;
  return null;
};

const InvoiceForm = ({
  deals,
  isOpen,
  onClose,
  fetchData,
  editingInvoice,
  conversionData,
  onPreview,
  defaultDueDateDays = null,
  defaultNotesByType = {},
  defaultTermsByType = {},
  defaultNotesFlat = "",
  defaultTermsFlat = "",
}) => {
  const defaultNotesForNew = defaultNotesByType.tax !== undefined
    ? defaultNotesByType.tax
    : (defaultNotesFlat || PREDEFINED_NOTES.tax || "");
  const defaultTermsForNew = defaultTermsByType.tax !== undefined
    ? defaultTermsByType.tax
    : (defaultTermsFlat || PREDEFINED_TERMS.tax || "");
  const [form, setForm] = useState({
    deal: "",
    date: "",
    dueDate: "",
    receiverGSTIN: "",
    transactionType: "intra",
    gstRate: 18,
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
        discountType: "amount",
        discount: 0,
      },
    ],
    discount: {
      type: "fixed",
      value: 0,
    },
    amount: 0,
    status: "Draft",
    style: "",
    isTaxInvoice: true,
    isRoundOff: false,
    hideTotals: false,
    billingAddress: emptyAddress(),
    shippingAddress: emptyAddress(),
    sameAsBilling: true,
    notes: defaultNotesForNew,
    terms: defaultTermsForNew,
    bankDetails: "",
    // UPI QR payment note ("tn") — left blank so it defaults to
    // "Invoice <number>" (see buildUpiUri); editable so the user can
    // override it.
    qrNote: "",
    signature: "",
  });
  const [savedSignatures, setSavedSignatures] = useState([]);
  const [signaturesLoading, setSignaturesLoading] = useState(false);
  // Bank accounts saved under Settings → Bank Details. A brand-new invoice
  // adopts the org's default; an edit keeps whatever account it was saved
  // with. The chosen id rides on the payload as `bankDetails`.
  const [banks, setBanks] = useState([]);
  const [isSliding, setIsSliding] = useState(false);
  const [shouldRender, setShouldRender] = useState(true);
  const [showItemForm, setShowItemForm] = useState(false);
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

  // Mongoose hands back e.g.
  //   "Invoice validation failed: items.0.name: Path `name` is required.,
  //    items.0.rate: Path `rate` is required."
  // which is a database error read out loud. This turns it into the same
  // information as a sentence about the row the user is looking at.
  const humanizeServerError = (raw) => {
    if (!raw || typeof raw !== "string") return raw;
    if (!/validation failed:/i.test(raw)) return raw;

    const detail = raw.split(/validation failed:/i)[1] || "";
    const byRow = new Map();
    const others = [];

    detail.split(/,\s*(?=[A-Za-z0-9_.]+:)/).forEach((part) => {
      const field = (part.split(":")[0] || "").trim();
      const itemMatch = field.match(/^items\.(\d+)\.(.+)$/);
      if (itemMatch) {
        const row = Number(itemMatch[1]) + 1;
        if (!byRow.has(row)) byRow.set(row, []);
        byRow.get(row).push(itemMatch[2]);
      } else if (field) {
        others.push(field);
      }
    });

    const list = (arr) =>
      arr.length > 1 ? `${arr.slice(0, -1).join(", ")} and ${arr[arr.length - 1]}` : arr[0];

    const parts = [];
    byRow.forEach((fields, row) => parts.push(`item ${row} is missing ${list(fields)}`));
    if (others.length) parts.push(`${list(others)} ${others.length > 1 ? "are" : "is"} required`);

    return parts.length ? `Can't save yet — ${parts.join("; ")}.` : raw;
  };
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
              sellingPrice: variant.sellingPrice || item.sellingPrice,
              hsnSac: variant.hsnSac || item.hsnSac || "",
              // Variant-first: the variant's own discount when it sets one, otherwise the
              // parent item's catalog default (see utils/variantResolve.js).
              discount: resolveDiscount(variant, item),
              type: item.type,
              category: item.category || "",
              primaryUnit:
                variant.primaryUnit || item.primaryUnit || "OTH OTHERS",
              isVariant: true,
              parentItemId: item._id,
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
              discount: item.discount || { type: "percentage", value: 0 },
              type: item.type,
              category: item.category || "",
              primaryUnit: item.primaryUnit || "OTH OTHERS",
              isVariant: false,
              parentItemId: null,
            },
          ];
        });
      setItems(itemsWithVariants);
    } catch (error) {
      console.error("Error fetching items:", error);
      setToastMessage("Failed to fetch items.");
      setTimeout(() => setToastMessage(""), 3000);
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

  // Mirrors computeDocument()'s own item-rate resolution (shared/
  // documentTemplates.js): the item's rate when it is a real GST slab,
  // otherwise the document-level rate.
  const effectiveGstRate = (item) => {
    const itemRate = Number(item.gstRate);
    if (GST_RATES.includes(itemRate)) return itemRate;
    const docRate = Number(form.gstRate);
    return GST_RATES.includes(docRate) ? docRate : 18;
  };

  const calculateTotalAmount = useCallback(
    (items, discount, gstRate, transactionType) => {
      const subtotalAfterItemDiscounts =
        calculateSubtotalAfterItemDiscounts(items);
      const invoiceDiscountAmount = calculateInvoiceDiscountAmount(
        subtotalAfterItemDiscounts,
        discount
      );
      const netTaxable = subtotalAfterItemDiscounts - invoiceDiscountAmount;
      const totalTax = netTaxable * (gstRate / 100);
      return netTaxable + totalTax;
    },
    []
  );

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
        amount: calculateTotalAmount(
          newItems,
          prev.discount,
          prev.gstRate,
          prev.transactionType
        ),
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
          setToastMessage(
            "Invoice discount cannot exceed subtotal after item discounts."
          );
          setTimeout(() => setToastMessage(""), 3000);
        } else if (prev.discount.type === "percentage" && parsedValue > 100) {
          newValue = 100;
          setToastMessage("Percentage discount cannot exceed 100%.");
          setTimeout(() => setToastMessage(""), 3000);
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
        setToastMessage(
          "Invoice discount cannot exceed subtotal after item discounts."
        );
        setTimeout(() => setToastMessage(""), 3000);
      }

      return {
        ...prev,
        discount: newDiscount,
        amount: calculateTotalAmount(
          prev.items,
          newDiscount,
          prev.gstRate,
          prev.transactionType
        ),
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
        // Use the picked product's own discount (itemData already carries
        // it from the catalog) — this used to fall back to the stale blank
        // row's discount, which always overwrote it with 0.
        discountType: itemData.discountType || "amount",
        discount: itemData.discount || 0,
      };
      return {
        ...prev,
        items: newItems,
        amount: calculateTotalAmount(
          newItems,
          prev.discount,
          prev.gstRate,
          prev.transactionType
        ),
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
            hsn: "",
            isVariant: false,
            parentItemId: null,
            discountType: "amount",
            discount: 0,
          },
        ],
        prev.discount,
        prev.gstRate,
        prev.transactionType
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
        amount: calculateTotalAmount(
          newItems,
          prev.discount,
          prev.gstRate,
          prev.transactionType
        ),
      };
    });
    setHasUnsavedChanges(true);
  };

  const handleAddToBill = () => {
    if (!quickAddItem) {
      toast.error("Search and select a product first.");
      return;
    }
    const qty = parseInt(quickAddQty) || 1;
    const blocked = stockBlockReason(quickAddItem, qty);
    if (blocked) {
      toast.error(blocked);
      return;
    }
    const newItem = { ...quickAddItem, quantity: qty };
    setForm((prev) => {
      const isBlankStarterRow =
        prev.items.length === 1 && !prev.items[0].name && !prev.items[0]._id;
      const newItems = isBlankStarterRow ? [newItem] : [...prev.items, newItem];
      return {
        ...prev,
        items: newItems,
        amount: calculateTotalAmount(newItems, prev.discount, prev.gstRate, prev.transactionType),
      };
    });
    setQuickAddItem(null);
    setQuickAddQty(1);
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

  const submitInvoice = async (statusValue) => {
    setIsSubmitting(true);
    const isDraft = statusValue === "Draft";

    // Validate required fields
    if (!form.deal) {
      setToastMessage("Deal is required.");
      setTimeout(() => setToastMessage(""), 3000);
      setIsSubmitting(false);
      return;
    }
    if (!form.style) {
      form.style = "Classic";
    }
    if (!form.date) {
      setToastMessage("Invoice Date is required.");
      setTimeout(() => setToastMessage(""), 3000);
      setIsSubmitting(false);
      return;
    }

    // A quick draft only needs enough to identify the document; full GSTIN and
    // item validation apply once it's actually being created for real.
    if (!isDraft) {
      // Validate GSTIN format
      if (form.receiverGSTIN && !validateGSTIN(form.receiverGSTIN)) {
        setToastMessage(
          "Invalid GSTIN format. It should be 15 characters (e.g., 22AAAAA0000A1Z5)."
        );
        setTimeout(() => setToastMessage(""), 3000);
        setIsSubmitting(false);
        return;
      }

      // Validate items
      const invalidItems = form.items.filter(
        (item) =>
          !item.name ||
          !item.rate ||
          !item.quantity ||
          (form.isTaxInvoice && !item.hsn) ||
          (item.discountType === "percentage" && item.discount > 100)
      );
      if (invalidItems.length > 0) {
        setToastMessage(`Item not found`);
        setTimeout(() => setToastMessage(""), 3000);
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
        setToastMessage(
          "Invoice discount cannot exceed subtotal after item discounts."
        );
        setTimeout(() => setToastMessage(""), 3000);
        setIsSubmitting(false);
        return;
      }
    }

    try {
      const payload = {
        ...form,
        status: statusValue,
        billingAddress: form.billingAddress,
        shippingAddress: form.sameAsBilling ? form.billingAddress : form.shippingAddress,
        // Same computeDocument() the live preview/PDF use, so the saved
        // amount can never disagree with what the totals card just showed —
        // and, unlike the old calculateTotalAmount() call, this honors each
        // item's own gstRate instead of only the document-level rate.
        amount: (() => {
          const t = computeDocument(form, "tax").grandTotal;
          return form.isRoundOff ? Math.round(t) : t;
        })(),
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
          // The rate the document was actually priced at, not a blind
          // parseFloat. computeDocument() falls back to the document-level
          // gstRate when an item has no valid rate of its own — but
          // `parseFloat(undefined) || 0` collapsed that "unset" into an
          // explicit 0%, which IS a valid GST rate, so the saved invoice
          // rendered 0% CGST/SGST while its stored amount still carried the
          // 18% the preview had charged. Persist the effective rate so the
          // PDF reproduces the total that was saved.
          gstRate: effectiveGstRate(item),
          taxInclusive: !!item.taxInclusive,
        })),
      };

      if (editingInvoice) {
        await API.put(`/invoices/${editingInvoice._id}`, payload);
        toast.success("Invoice updated successfully!");
      } else {
        await API.post("/invoices", payload);
        toast.success("Invoice created successfully!");
      }

      setHasUnsavedChanges(false);
      setForm({
        deal: "",
        date: "",
        dueDate: "",
        receiverGSTIN: "",
        transactionType: "intra",
        gstRate: 18,
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
            discountType: "amount",
            discount: 0,
          },
        ],
        discount: { type: "fixed", value: 0 },
        amount: 0,
        status: "Draft",
        style: "",
        isTaxInvoice: true,
        billingAddress: emptyAddress(),
        shippingAddress: emptyAddress(),
        sameAsBilling: true,
        notes: "",
        terms: "",
        signature: "",
      });
      await fetchData();
      onClose();
    } catch (err) {
      if (err.response?.status === 402) {
        setToastMessage(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        setToastMessage(
          humanizeServerError(err.response?.data?.error) ||
          (editingInvoice
            ? "Failed to update invoice"
            : "Failed to create invoice")
        );
      }
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
    await submitInvoice("Pending");
    if (!toastMessage.includes("Failed")) {
      setShowConfirmDialog(false);
      onClose();
    }
  };

  const handleSaveDraft = () => submitInvoice("Draft");
  const handleSubmit = (e) => {
    e.preventDefault();
    submitInvoice(form.status || "Draft");
  };

  const handleClose = () => {
    if (hasUnsavedChanges) {
      setShowConfirmDialog(true);
    } else {
      onClose();
    }
  };

  useEffect(() => {
    if (editingInvoice || conversionData) {
      const sourceData = editingInvoice || conversionData;
      const initialForm = {
        deal: sourceData.deal?._id || sourceData.deal || "",
        date: sourceData.date ? sourceData.date.slice(0, 10) : "",
        dueDate: sourceData.dueDate
          ? sourceData.dueDate.slice(0, 10)
          : "",
        receiverGSTIN: sourceData.receiverGSTIN || "",
        transactionType: sourceData.transactionType || "intra",
        gstRate: sourceData.gstRate || 18,
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
        })),
        discount: sourceData.discount || { type: "fixed", value: 0 },
        isRoundOff: sourceData.isRoundOff !== undefined ? sourceData.isRoundOff : true,
        amount: sourceData.amount || 0,
        status: editingInvoice ? sourceData.status : "Draft",
        style: sourceData.style || "",
        isTaxInvoice: true,
        billingAddress: { ...emptyAddress(), ...(sourceData.billingAddress || {}) },
        shippingAddress: { ...emptyAddress(), ...(sourceData.shippingAddress || {}) },
        sameAsBilling:
          isAddressEmpty(sourceData.shippingAddress) ||
          JSON.stringify({ ...emptyAddress(), ...(sourceData.billingAddress || {}) }) ===
            JSON.stringify({ ...emptyAddress(), ...(sourceData.shippingAddress || {}) }),
        notes: sourceData.notes || "",
        terms: sourceData.terms || "",
        bankDetails: sourceData.bankDetails?._id || sourceData.bankDetails || "",
        // Only an actual edit keeps the source's note — Convert/Duplicate
        // starts blank since a custom note almost always references the old
        // invoice's own number.
        qrNote: editingInvoice ? (sourceData.qrNote || "") : "",
        signature: sourceData.signature || "",
      };
      setForm(initialForm);
      setHasUnsavedChanges(false);
    } else {
      const initialForm = {
        deal: "",
        date: "",
        dueDate: "",
        receiverGSTIN: "",
        transactionType: "intra",
        gstRate: 18,
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
            discountType: "amount",
            discount: 0,
          },
        ],
        discount: { type: "fixed", value: 0 },
        amount: 0,
        status: "Draft",
        style: "",
        isTaxInvoice: true,
        billingAddress: emptyAddress(),
        shippingAddress: emptyAddress(),
        sameAsBilling: true,
        notes: "",
        terms: "",
        bankDetails: "",
        qrNote: "",
        signature: "",
      };
      setForm(initialForm);
      setHasUnsavedChanges(false);
    }
  }, [editingInvoice]);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setTimeout(() => setIsSliding(true), 10);
      fetchItems();
      fetchCompanies();
      fetchContacts();
      setLocalDeals(deals);
      API.get("/branding").then(r => setSellerState((r.data?.state || "").trim().toLowerCase())).catch(() => {});

      // Fetch saved signatures and auto-select default for new invoices
      const fetchSignatures = async () => {
        setSignaturesLoading(true);
        try {
          const res = await API.get("/document-settings/signatures");
          const sigs = Array.isArray(res.data) ? res.data : [];
          setSavedSignatures(sigs);

          // Auto-apply default signature only when creating a new invoice
          if (!editingInvoice) {
            const defaultSig = sigs.find((s) => s.isDefault);
            if (defaultSig) {
              setForm((prev) => ({ ...prev, signature: defaultSig.dataUrl || "" }));
            }
          }
        } catch (err) {
          console.error("Failed to fetch signatures:", err);
          setSavedSignatures([]);
        } finally {
          setSignaturesLoading(false);
        }
      };
      fetchSignatures();

      // Fetch saved bank accounts and auto-select the org default for new
      // invoices; an edit keeps whatever account it was saved with.
      const fetchBanks = async () => {
        try {
          const res = await API.get("/bank-details/all");
          const list = Array.isArray(res.data) ? res.data : [];
          setBanks(list);
          if (!editingInvoice) {
            const fallback = list.find((b) => b.isDefault) || list[0];
            if (fallback) {
              setForm((prev) =>
                prev.bankDetails ? prev : { ...prev, bankDetails: fallback._id }
              );
            }
          }
        } catch (err) {
          console.error("Failed to fetch bank accounts:", err);
          setBanks([]);
        }
      };
      fetchBanks();
    } else {
      setIsSliding(false);
      setTimeout(() => setShouldRender(false), 300);
    }
  }, [isOpen, deals]);

  if (!shouldRender) return null;

  const subtotal = calculateSubtotal(form.items);
  const totalItemDiscounts = calculateTotalItemDiscounts(form.items);
  const subtotalAfterItemDiscounts = subtotal - totalItemDiscounts;
  const invoiceDiscountAmount = calculateInvoiceDiscountAmount(
    subtotalAfterItemDiscounts,
    form.discount
  );
  // Same shared engine the live preview/PDF use (shared/documentTemplates.js)
  // — honors each item's own gstRate instead of a single document-level
  // rate, so this summary can never disagree with what actually saves/prints.
  const taxDetails = form.isTaxInvoice ? computeDocument(form, "tax") : null;
  let finalTotal = taxDetails
    ? taxDetails.grandTotal
    : subtotalAfterItemDiscounts - invoiceDiscountAmount;
  let roundOffAmount = 0;
  if (form.isRoundOff) {
    const rounded = Math.round(finalTotal);
    roundOffAmount = rounded - finalTotal;
    finalTotal = rounded;
  }

  const cgstAmount = taxDetails?.totalCGST || 0;
  const sgstAmount = taxDetails?.totalSGST || 0;
  const igstAmount = taxDetails?.totalIGST || 0;

  // format deals with company name
  const formattedDeals = localDeals.map((deal) => ({
    ...deal,
    label: `${deal.title} — ${deal.company?.name || "No Company"}`,
  }));

  return createPortal(
    <>
      {toastMessage && (
        // Red: every message set on this toast is a failure or a validation
        // warning (successes use toast.success). It was green, so "Invoice
        // validation failed..." arrived looking like a confirmation.
        <div className="fixed top-4 right-4 z-[10002] max-w-md bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg animate-fade-in-out">
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

      {/* Confirmation Dialog */}
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
          {/* Sticky Header */}
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
                  {editingInvoice ? "Edit Invoice" : "Create Invoice"}
                </h2>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {form.style && (
                <button
                  type="button"
                  onClick={() => onPreview(form)}
                  className="h-8 px-4 flex items-center gap-1.5 bg-white border border-[#E1E4EA] rounded-lg text-[13px] font-medium text-[#1F2937] hover:bg-gray-50 transition-colors shadow-sm flex-shrink-0"
                  aria-label="Preview invoice"
                >
                  <EyeIcon className="w-3.5 h-3.5 text-[#525866]" />
                  Preview
                </button>
              )}
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={isSubmitting}
                className="h-8 px-4 flex items-center gap-1.5 rounded-lg bg-[#0085FF] hover:bg-blue-600 text-white text-[13px] font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex-shrink-0"
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

          {/* Type Row */}
          <div className="flex items-center px-6 py-3 bg-white border-b border-gray-100 text-sm">
            <span className="text-gray-500 mr-2">Type</span>
            <select
              value={form.style}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, style: e.target.value }));
                setHasUnsavedChanges(true);
              }}
              className="font-medium text-gray-800 bg-transparent border-none focus:ring-0 cursor-pointer p-0"
              aria-label="Select invoice style"
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
            {/* Section 1: Invoice Details */}
            <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(15,23,42,0.06),0_8px_20px_-12px_rgba(15,23,42,0.12)] border border-slate-200 p-6">
              <SectionHeader number="01" title="Invoice Details" />
              <div className="h-px bg-slate-100 -mx-6 my-4" />
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                <div className="md:col-span-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-semibold text-gray-700">Select Deal <span className="text-red-500">*</span></label>
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
                      options={formattedDeals}
                      value={form.deal}
                      onChange={(value) => {
                        const selectedDeal = localDeals.find((d) => d._id === value);
                        const company = selectedDeal?.company;
                        const customerState = (company?.billingAddress?.state || '').trim().toLowerCase();
                        const autoType = (sellerState && customerState && sellerState !== customerState) ? 'inter' : 'intra';
                        setForm((prev) => ({ ...prev, deal: value, transactionType: autoType }));
                        setHasUnsavedChanges(true);
                      }}
                      placeholder="Search and select deal"
                      valueKey="_id"
                      className="w-full"
                      displayKey="label"
                    />
                  </div>
                </div>

                <div className="md:col-span-2 space-y-2">
                  <label className="text-sm font-semibold text-gray-700">Invoice Date <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    className="w-full pl-3 pr-8 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    required
                    value={form.date}
                    onChange={(e) => {
                      const newDate = e.target.value;
                      setForm((prev) => {
                        let newDueDate = prev.dueDate;
                        if (!editingInvoice && !prev.dueDate && newDate) {
                          const d = new Date(newDate);
                          d.setDate(d.getDate() + (defaultDueDateDays ?? 30));
                          newDueDate = d.toISOString().split("T")[0];
                        }
                        return { ...prev, date: newDate, dueDate: newDueDate };
                      });
                      setHasUnsavedChanges(true);
                    }}
                  />
                </div>

                <div className="md:col-span-3 space-y-2">
                  <label className="text-sm font-semibold text-gray-700">Due Date</label>
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
                  <div className="flex gap-2 mt-1">
                    {[7, 15, 30].map(days => (
                      <button
                        key={days}
                        type="button"
                        className="text-[11px] font-medium px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 transition-colors"
                        onClick={() => {
                          const newDate = new Date();
                          newDate.setDate(newDate.getDate() + days);
                          setForm(prev => ({ ...prev, dueDate: newDate.toISOString().split('T')[0] }));
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

            {/* Section 2: Billing & Shipping Address */}
            <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(15,23,42,0.06),0_8px_20px_-12px_rgba(15,23,42,0.12)] border border-slate-200 p-6">
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
              <div className="h-px bg-slate-100 -mx-6 mb-5" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 w-full md:divide-x md:divide-slate-100">
                <div className="md:pr-8">
                <AddressFieldsGroup
                  label="Billing address"
                  value={form.billingAddress}
                  onChange={(next) => {
                    // Editing the billing state here (not just picking a new
                    // Deal) should re-classify intra/inter the same way deal
                    // selection does, so overriding the address on this one
                    // document actually changes CGST/SGST vs IGST instead of
                    // silently keeping whatever the deal's company implied.
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
                </div>
                <div className="md:pl-8">
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
            </div>

            {/* Section 3: GST & Tax Details (conditional) — GST rate is set
                per item below (Products & Services → More Details), matching
                the full-width form; there's no document-level rate here
                since a single rate can't represent a mixed-rate item list. */}
            {form.isTaxInvoice && (
              <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(15,23,42,0.06),0_8px_20px_-12px_rgba(15,23,42,0.12)] border border-slate-200 p-6">
                <SectionHeader number="03" title="GST & Tax Details" />
                <div className="h-px bg-slate-100 -mx-6 my-4" />
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                  <div className="md:col-span-4 space-y-2">
                    <label className="text-sm font-semibold text-gray-700">Receiver GSTIN <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      placeholder="Enter Receiver GSTIN (e.g., 22AAAAA0000A1Z5)"
                      className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      value={form.receiverGSTIN}
                      onChange={(e) => {
                        setForm((prev) => ({
                          ...prev,
                          receiverGSTIN: e.target.value.toUpperCase(),
                        }));
                        setHasUnsavedChanges(true);
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Section 4: Products & Services — the primary work area, so it
                gets stronger visual weight than the other cards. */}
            <div className="bg-white rounded-xl shadow-[0_2px_6px_rgba(15,23,42,0.07),0_10px_28px_-14px_rgba(0,133,255,0.28)] border border-blue-100/80 p-6 lg:p-7">
              <div className="flex justify-between items-center mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-[#0085FF] text-white text-[11px] font-bold flex-shrink-0 shadow-sm">
                    04
                  </div>
                  <h3 className="text-[15px] font-semibold text-slate-900">Products & Services</h3>
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
                </div>
              </div>
              <div className="h-px bg-slate-100 -mx-6 lg:-mx-7 mb-5" />

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
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <Inbox className="w-12 h-12 text-gray-300 mb-4" strokeWidth={1.5} />
                  <p className="text-gray-500 text-sm mb-4">
                    Search existing products to add to this list or add new product to get started.
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
                    <div className="col-span-3">Product Name</div>
                    <div className="col-span-2 text-center">Quantity</div>
                    <div className="col-span-2 text-right">Unit Price</div>
                    <div className="col-span-1 text-center">GST %</div>
                    <div className="col-span-2 text-center">Discount</div>
                    <div className="col-span-2 text-right">Total</div>
                  </div>

                  {/* Item Rows */}
                  <div className="space-y-4 mt-4">
                    {form.items.map((item, index) => {
                      const rowTotal = calculateItemAmount(item);
                      return (
                        <div key={index} className="group relative py-3 border-b border-gray-100 last:border-b-0">
                          <div className="grid grid-cols-12 gap-4 items-start">
                            {/* Product Name */}
                            <div className="col-span-3">
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

                            {/* GST % */}
                            <div className="col-span-1">
                              <select
                                value={item.gstRate ?? 0}
                                onChange={(e) => {
                                  handleItemChange(index, "gstRate", parseFloat(e.target.value));
                                  setHasUnsavedChanges(true);
                                }}
                                className="w-full text-center text-sm border border-gray-200 rounded-lg px-1 py-2.5 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                              >
                                <option value={0}>0%</option>
                                <option value={5}>5%</option>
                                <option value={12}>12%</option>
                                <option value={18}>18%</option>
                                <option value={28}>28%</option>
                              </select>
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

                          {/* More Details (Expandable) */}
                          <details className="mt-3 group/details">
                            <summary className="text-xs font-semibold text-blue-600 cursor-pointer list-none flex items-center gap-1 w-max select-none">
                              <ChevronRight className="w-3.5 h-3.5 transition-transform group-open/details:rotate-90" />
                              More Details
                            </summary>
                            <div className="pt-3">
                              <div className="space-y-1">
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

            {/* Section 5+: Notes, Terms, Signature, Totals — 2-column grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

              {/* Left Column: Notes, Terms, Attachments */}
              <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(15,23,42,0.06),0_8px_20px_-12px_rgba(15,23,42,0.12)] border border-slate-200 p-6 space-y-5">
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
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:border-blue-500 resize-y"
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
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:border-blue-500 resize-y"
                  />
                </div>

                {/* E-Waybill & Attachments */}
                <div className="pt-4 space-y-4">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div className="relative">
                      <input type="checkbox" className="sr-only peer" />
                      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                    </div>
                    <span className="text-sm font-semibold text-gray-700">Create E-Waybill</span>
                  </label>

                  <div className="space-y-2">
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-semibold text-gray-700">Attach files</span>
                    </div>
                    <button type="button" className="flex items-center justify-center gap-2 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 border-dashed rounded-lg hover:border-gray-400 transition-colors">
                      <span className="text-lg">↑</span> Attach Files (Max: 5)
                    </button>
                  </div>

                  <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer">
                    <div className="w-4 h-4 rounded-full border border-gray-300 flex items-center justify-center">
                    </div>
                    Use Coupons
                  </label>
                </div>
              </div>

              {/* Right Column: Totals, Bank, Signature */}
              <div className="space-y-6 lg:sticky lg:top-4">

                {/* Math Card — Invoice Summary, styled as a sticky summary panel */}
                <div className="bg-[#EBF5EE] rounded-xl p-5 shadow-[0_2px_8px_-2px_rgba(16,94,54,0.18)] border border-[#BFE3CE] space-y-4 relative">
                  <div className="flex justify-end gap-2 items-center mb-2">
                    <span className="text-xs text-gray-500 font-medium">Extra Discount</span>
                    <div className="flex items-center border border-gray-200 bg-white rounded-lg overflow-hidden h-8">
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

                    {taxDetails && !taxDetails.isInterState && (
                      <>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-600 font-medium">CGST</span>
                          <span className="text-gray-900 font-medium">₹{formatNumberFixed(cgstAmount)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-600 font-medium">SGST</span>
                          <span className="text-gray-900 font-medium">₹{formatNumberFixed(sgstAmount)}</span>
                        </div>
                      </>
                    )}
                    {taxDetails && taxDetails.isInterState && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-600 font-medium">IGST</span>
                        <span className="text-gray-900 font-medium">₹{formatNumberFixed(igstAmount)}</span>
                      </div>
                    )}

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

                {/* Select Bank */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1">
                    <label className="text-sm font-semibold text-gray-700">Select Bank</label>
                  </div>
                  <BankSelect
                    banks={banks}
                    value={form.bankDetails || ""}
                    onChange={(id) => {
                      setForm((prev) => ({ ...prev, bankDetails: id }));
                      setHasUnsavedChanges(true);
                    }}
                  />
                  <p className="text-xs text-gray-400">
                    {banks.length === 0
                      ? "No bank accounts yet — add them in Settings → Bank Details."
                      : "The default is applied to every invoice unless you pick another here."}
                  </p>
                </div>

                {/* Payment Note — the "note"/"tn" shown in the payer's UPI
                    app when they scan the QR. Defaults to "Invoice <number>"
                    when left blank (see buildUpiUri in
                    shared/documentTemplates.js), but is fully editable. */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">Payment Note (QR)</label>
                  <input
                    type="text"
                    value={form.qrNote}
                    onChange={(e) => {
                      setForm((prev) => ({ ...prev, qrNote: e.target.value }));
                      setHasUnsavedChanges(true);
                    }}
                    placeholder="Invoice INV-..."
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    maxLength={50}
                  />
                  <p className="text-xs text-gray-400">
                    Shown as the payment note when the QR is scanned. Leave blank to use "Invoice &lt;number&gt;" automatically.
                  </p>
                </div>

                {/* Signature */}
                <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(15,23,42,0.06),0_8px_20px_-12px_rgba(15,23,42,0.12)] border border-slate-200 p-5">
                  <SectionHeader number="07" title="Signature" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <div className="relative flex items-center h-10 rounded-lg border border-gray-200 focus-within:border-blue-500 overflow-hidden">
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
                            : "The default is applied to every invoice unless you pick another here."}
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
              <div className="pointer-events-auto flex w-full max-w-2xl items-center justify-between gap-5 rounded-2xl border border-[#E1E4EA] bg-white/95 backdrop-blur-sm pl-6 pr-2.5 py-2.5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.22)]">
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
                    onClick={() => {}}
                    className="h-9 px-4 flex items-center gap-1.5 bg-white border border-[#E1E4EA] rounded-lg text-[13px] font-medium text-[#1F2937] hover:bg-gray-50 transition-colors whitespace-nowrap"
                  >
                    <Printer className="w-3.5 h-3.5 text-[#525866]" />
                    Print
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="h-9 px-4 flex items-center gap-1.5 rounded-lg bg-[#0085FF] hover:bg-blue-600 text-white text-[13px] font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {isSubmitting
                      ? editingInvoice
                        ? "Updating..."
                        : "Creating..."
                      : editingInvoice
                        ? "Update Invoice"
                        : "Create Invoice"}
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
    </>,
    document.body
  );
};


// ============================================================================
// CreateInvoicePanel — moved here from Accounting.jsx
// Shared two-pane create/edit form used by all document types.
// ============================================================================

const OpenNotesTermsButton = ({ label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    title="Edit notes and terms"
    className="inline-flex items-center gap-1 leading-none text-[12px] font-medium text-[#0085FF] hover:underline flex-shrink-0"
  >
    <PlusIcon className="w-3 h-3 flex-shrink-0" />
    <span>{label}</span>
  </button>
);

const apiPathFor = (type) =>
  type === "tax"
    ? "invoices"
    : type === "performa"
      ? "performa-invoices"
      : type === "quotation"
        ? "quotations"
        : "delivery-challans";

const numberKeyFor = (type) =>
  type === "tax"
    ? "invoiceNumber"
    : type === "performa"
      ? "performaInvoiceNumber"
      : type === "quotation"
        ? "quotationNumber"
        : "deliveryChallanNumber";

const docNameFor = (type) =>
  type === "tax"
    ? "Invoice"
    : type === "performa"
      ? "Pro Forma Invoice"
      : type === "quotation"
        ? "Quotation"
        : "Delivery Challan";

// Single source of truth for the template list — the same one the renderer and
// the PDF generator use, so a template added there shows up here automatically.
/* The "Add Invoice" experience for the Invoices tab: details on the left,
   live preview on the right. */
const CreateInvoicePanel = ({
  deals,
  onClose,
  onCreated,
  onAddDeal,
  initialDoc = null,
  conversionData = null,
  onFullView,
  // Optional. When provided, the header's expand button switches to a
  // dedicated full-width screen owned by the parent instead of hiding the
  // preview pane in place. Quotations use this; other types leave it unset.
  onRequestFullWidth,
  // Snapshot of the full-width screen's in-progress form, handed back the
  // moment the user collapses to split view — takes precedence over
  // initialDoc/conversionData so switching views never drops unsaved edits.
  formOverride = null,
  type = "tax",
  defaultDueDateDays = null,
  defaultNotesByType = {},
  defaultTermsByType = {},
  defaultNotesFlat = "",
  defaultTermsFlat = "",
  documentTypeSettings = {},
}) => {
  const isEditing = !!initialDoc;
  // Same "per-type value, else flat default, else the built-in copy"
  // fallback chain Settings → Document Settings and the full-width screens
  // already use — split view was skipping this entirely and always opening
  // new documents with blank Notes/Terms regardless of what the org
  // configured.
  const defaultNotesForNewDoc = defaultNotesByType[type] !== undefined
    ? defaultNotesByType[type]
    : (defaultNotesFlat || PREDEFINED_NOTES[type] || "");
  const defaultTermsForNewDoc = defaultTermsByType[type] !== undefined
    ? defaultTermsByType[type]
    : (defaultTermsFlat || PREDEFINED_TERMS[type] || "");
  // Per-type capabilities. Delivery challans have no GSTIN / tax / HSN; the
  // quotation tax flag is stored under a different key.
  const isChallan = type === "deliveryChallan";
  const supportsTax = !isChallan;
  const supportsGSTIN = !isChallan;
  const taxFlagKey = type === "quotation" ? "isTaxQuotation" : "isTaxInvoice";
  const docName = docNameFor(type);
  // Document Settings is the single source of truth for the numbering
  // prefix. Each document type's backend expects its own request field name
  // (there's no generic "prefix" field) — both maps keyed the same way as
  // `type` so the rest of this component can stay type-agnostic.
  const SETTINGS_KEY_BY_TYPE = { tax: "invoice", quotation: "quote", performa: "proformaInvoice", deliveryChallan: "deliveryChallan" };
  const PREFIX_FIELD_BY_TYPE = { tax: "invoicePrefix", quotation: "quotationPrefix", performa: "performaInvoicePrefix", deliveryChallan: "deliveryChallanPrefix" };
  const SUFFIX_FIELD_BY_TYPE = { tax: "invoiceSuffix", quotation: "quotationSuffix", performa: "performaInvoiceSuffix", deliveryChallan: "deliveryChallanSuffix" };
  const NUMBER_FIELD_BY_TYPE = { tax: "invoiceNumber", quotation: "quotationNumber", performa: "performaInvoiceNumber", deliveryChallan: "deliveryChallanNumber" };
  const DEFAULT_PREFIX_BY_TYPE = { tax: "INV-", quotation: "QT-", performa: "PI-", deliveryChallan: "DC-" };
  const configuredPrefix =
    documentTypeSettings[SETTINGS_KEY_BY_TYPE[type]]?.prefix || DEFAULT_PREFIX_BY_TYPE[type];
  const configuredSuffix = documentTypeSettings[SETTINGS_KEY_BY_TYPE[type]]?.suffix || "";
  // Section badges are numbered by position so a hidden section doesn't leave
  // a gap in the sequence.
  const sectionNo = (() => {
    let n = 1;
    const pad = (v) => String(v).padStart(2, "0");
    const out = { details: pad(n++) };
    out.address = pad(n++);
    if (supportsGSTIN) out.billing = pad(n++);
    out.items = pad(n++);
    out.notes = pad(n++);
    out.terms = pad(n++);
    out.bank = pad(n++);
    out.signature = pad(n++);
    out.summary = pad(n++);
    return out;
  })();
  const [form, setForm] = useState(() => {
    const sourceDoc = initialDoc || conversionData;
    const base = sourceDoc
      ? {
          deal: sourceDoc.deal?._id || sourceDoc.deal || "",
          style: sourceDoc.style || "",
          date: sourceDoc.date ? sourceDoc.date.slice(0, 10) : "",
          dueDate: sourceDoc.dueDate ? sourceDoc.dueDate.slice(0, 10) : "",
          receiverGSTIN: sourceDoc.receiverGSTIN || "",
          billingAddress: { ...emptyAddress(), ...(sourceDoc.billingAddress || {}) },
          shippingAddress: { ...emptyAddress(), ...(sourceDoc.shippingAddress || {}) },
          sameAsBilling:
            isAddressEmpty(sourceDoc.shippingAddress) ||
            JSON.stringify({ ...emptyAddress(), ...(sourceDoc.billingAddress || {}) }) ===
              JSON.stringify({ ...emptyAddress(), ...(sourceDoc.shippingAddress || {}) }),
          isTaxInvoice:
            sourceDoc[type === "quotation" ? "isTaxQuotation" : "isTaxInvoice"] ||
            false,
          transactionType: sourceDoc.transactionType || "intra",
          gstRate: sourceDoc.gstRate || 18,
          // Only an actual edit (initialDoc/editingInvoice) should keep the
          // source's own number — conversionData covers both Convert (a
          // different doc type, where the source's number field usually
          // doesn't even apply) and Duplicate (the SAME doc type, where the
          // source's number field always matches and would otherwise get
          // copied verbatim onto the new document instead of leaving it
          // blank for a fresh auto-generated number).
          invoicePrefix: (initialDoc && sourceDoc[PREFIX_FIELD_BY_TYPE[type]]) || configuredPrefix,
          invoiceSuffix: (initialDoc && sourceDoc[SUFFIX_FIELD_BY_TYPE[type]]) || configuredSuffix,
          invoiceNumber: initialDoc ? (sourceDoc[NUMBER_FIELD_BY_TYPE[type]] || "") : "",
          nextInvoiceNumber: (initialDoc && sourceDoc.nextInvoiceNumber) || 1,
          items:
            sourceDoc.items && sourceDoc.items.length
              ? sourceDoc.items.map((item) => ({
                  _id: (item.isVariant ? item.variantId : item.itemId) || item.itemId || item._id || null,
                  name: item.name || "",
                  description: item.description || "",
                  rate: item.rate ?? 0,
                  quantity: item.quantity ?? 1,
                  hsn: item.hsn || "",
                  isVariant: item.isVariant || false,
                  parentItemId: item.parentItemId || null,
                  discountType: item.discountType || "amount",
                  discount: item.discount || 0,
                  showDescription: !!item.description,
                  gstRate: item.gstRate || 18,
                  taxInclusive: !!item.taxInclusive,
                }))
              : [blankItem()],
          discount: sourceDoc.discount || { type: "fixed", value: 0 },
          isRoundOff: sourceDoc.isRoundOff !== undefined ? sourceDoc.isRoundOff : true,
          notes: sourceDoc.notes || "",
          terms: sourceDoc.terms || "",
          bankDetails: sourceDoc.bankDetails?._id || sourceDoc.bankDetails || "",
          // Only an actual edit keeps the source's note — a different type or
          // Duplicate starts blank since a custom note almost always
          // references the old document's own number.
          qrNote: initialDoc ? (sourceDoc.qrNote || "") : "",
          signature: sourceDoc.signature || "",
          status: initialDoc ? sourceDoc.status : "Draft",
        }
      : {
          deal: "",
          style: "",
          date: "",
          dueDate: "",
          receiverGSTIN: "",
          billingAddress: emptyAddress(),
          shippingAddress: emptyAddress(),
          sameAsBilling: true,
          isTaxInvoice: true,
          transactionType: "intra",
          gstRate: 18,
          invoicePrefix: configuredPrefix,
          invoiceSuffix: configuredSuffix,
          invoiceNumber: "",
          nextInvoiceNumber: 1,
          items: [blankItem()],
          discount: { type: "fixed", value: 0 },
          isRoundOff: true,
          notes: defaultNotesForNewDoc,
          terms: defaultTermsForNewDoc,
          bankDetails: "",
          qrNote: "",
          signature: "",
          status: "Draft",
        };
    return formOverride ? { ...base, ...formOverride } : base;
  });
  const [catalogue, setCatalogue] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [stockErrorMessage, setStockErrorMessage] = useState(null);
  // Required/invalid fields are marked red in place instead of popping a
  // toast — clears itself the moment the field is actually filled in/fixed.
  const [fieldErrors, setFieldErrors] = useState({});
  // Refs so a failed submit can scroll the invalid field into view instead
  // of just coloring it — on mobile especially, a red border off-screen is
  // easy to miss entirely.
  const dealFieldRef = useRef(null);
  const dateFieldRef = useRef(null);
  const billingFieldRef = useRef(null);
  const gstinFieldRef = useRef(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [orgDetails, setOrgDetails] = useState(null);
  const [bankDetails, setBankDetails] = useState(null);
  // Bank accounts saved under Settings → Bank Details. New documents adopt the
  // org's default; existing ones keep whatever was chosen when created. The
  // chosen id rides on the payload as `bankDetails` and the backend prints it.
  const [banks, setBanks] = useState([]);
  // Numbering (prefix/suffix/next number) comes from DocumentSettings.
  const [docSettings, setDocSettings] = useState({
    invoicePrefix: "INV-",
    invoiceSuffix: "",
    invoicePrefixes: ["INV-"],
    invoiceSuffixes: [],
    nextInvoiceNumber: 1,
    defaultNotes: "",
    defaultTerms: "",
    documentTypeSettings: {
      invoice: { prefix: "INV-", suffix: "", prefixes: ["INV-"], suffixes: [] },
    },
  });
  // Live preview of the number this document will actually get on save
  // (from the same persistent per-org, per-type counter resolveDocumentNumber
  // uses on the backend) — shown as the number box's placeholder instead of
  // a static "Auto"/"1" so it stays in sync with the full-width screen.
  const [nextNumberPreview, setNextNumberPreview] = useState(null);
  // Rendering template comes from DocumentTemplateSettings — a separate model.
  const [orgTemplate, setOrgTemplate] = useState("Classic");
  // Signatures saved under Settings → Document Settings. New documents adopt
  // the org's default; existing ones keep whatever was chosen when created.
  const [savedSignatures, setSavedSignatures] = useState([]);
  const [signaturesLoading, setSignaturesLoading] = useState(false);

  // Draggable split between the form (left) and the preview (right).
  const splitRef = useRef(null);
  const [leftPct, setLeftPct] = useState(50);
  // Collapses the preview entirely so the form gets the full width — useful
  // when filling in a long item list on a narrow screen.
  const [hidePreview, setHidePreview] = useState(false);
  // null when closed; otherwise the section to focus ("notes" | "terms").
  const [notesDrawer, setNotesDrawer] = useState(null);
  // Width the two columns actually use; the split only applies while the
  // preview is on screen.
  const formWidth = hidePreview ? "100%" : `${leftPct}%`;

  // Document number, renamed inline from the header. Only the trailing part
  // after the last hyphen is editable — the prefix (INV-, QUO-, …) identifies
  // the document type and must survive any rename.
  const numberKey = numberKeyFor(type);
  const [docNumber, setDocNumber] = useState(initialDoc?.[numberKey] || "");
  const numberPrefix = docNumber.includes("-")
    ? docNumber.slice(0, docNumber.lastIndexOf("-") + 1)
    : "";
  const numberSuffix = docNumber.slice(numberPrefix.length);
  const [numberDraft, setNumberDraft] = useState(null); // null = not editing
  const [savingNumber, setSavingNumber] = useState(false);
  const [quickAddId, setQuickAddId] = useState(null);
  const [quickAddQty, setQuickAddQty] = useState(1);
  const [quickAddSearch, setQuickAddSearch] = useState("");
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [showQuickItemDrawer, setShowQuickItemDrawer] = useState(false);

  const saveDocNumber = async () => {
    const suffix = (numberDraft || "").trim();
    if (!suffix) return toast.error(`${docName} number cannot be empty.`);
    const next = `${numberPrefix}${suffix}`;
    if (next === docNumber) return setNumberDraft(null);
    try {
      setSavingNumber(true);
      await API.patch(`/${apiPathFor(type)}/number/${initialDoc._id}`, {
        [numberKey]: next,
      });
      setDocNumber(next);
      setNumberDraft(null);
      toast.success(`${docName} number updated.`);
      onCreated?.(); // refresh the list behind the panel so it shows the new number
    } catch (err) {
      toast.error(
        err?.response?.status === 409
          ? `${next} already exists.`
          : err?.response?.data?.error || "Failed to update the number."
      );
    } finally {
      setSavingNumber(false);
    }
  };

  // "Full view" renders the same live preview blown up in a modal rather than
  // fetching the server's PDF — the PDF only knows the *saved* invoice, so
  // opening it would silently discard whatever the user has edited since.
  const [showFullView, setShowFullView] = useState(false);

  // The preview renders at a fixed design width and is scaled to fit the panel
  // (like zooming an image) so resizing never reflows the invoice layout.
  const PREVIEW_BASE_W = 760;
  const previewAreaRef = useRef(null);
  const sheetRef = useRef(null);
  const [previewScale, setPreviewScale] = useState(1);
  const [sheetHeight, setSheetHeight] = useState(0);
  useLayoutEffect(() => {
    const area = previewAreaRef.current;
    if (!area) return;
    const update = () => {
      const avail = area.clientWidth - 12; // minus the p-1.5 padding
      const s = Math.max(0.1, avail / PREVIEW_BASE_W);
      setPreviewScale(s);
      if (sheetRef.current)
        setSheetHeight(sheetRef.current.offsetHeight * s);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(area);
    if (sheetRef.current) ro.observe(sheetRef.current);
    return () => ro.disconnect();
  }, [leftPct]);
  const startSplitDrag = (e) => {
    e.preventDefault();
    const container = splitRef.current;
    if (!container) return;
    const onMove = (ev) => {
      const rect = container.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setLeftPct(Math.min(70, Math.max(30, pct)));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  // Same branding + bank details the backend feeds into the PDF, so the live
  // preview shows the real seller header, GSTIN and bank block. The template
  // chosen in the Template drawer renders every document of this type, which is
  // exactly how the backend resolves it when generating the PDF.
  // Re-runs when the drawer closes so a change made there shows up right away.
  useEffect(() => {
    if (showTemplates) return;
    (async () => {
      try {
        const [b, bank, bankList, settings, docSettingsRes] = await Promise.allSettled([
          API.get("/branding"),
          API.get("/bank-details"),
          API.get("/bank-details/all"),
          API.get("/document-templates"),
          API.get("/document-settings"),
        ]);
        if (b.status === "fulfilled") setOrgDetails(b.value.data || null);
        if (bank.status === "fulfilled")
          setBankDetails(bank.value.data || null);
        if (bankList.status === "fulfilled") {
          const list = Array.isArray(bankList.value.data) ? bankList.value.data : [];
          setBanks(list);
          // Preselect the org default for brand-new documents only — an edit
          // keeps whatever account it was saved with (even "none").
          if (!initialDoc) {
            const fallback = list.find((x) => x.isDefault) || list[0];
            if (fallback) {
              setForm((prev) =>
                prev.bankDetails ? prev : { ...prev, bankDetails: fallback._id }
              );
            }
          }
        }
        if (settings.status === "fulfilled") {
          const chosen = settings.value.data?.templates?.[type];
          if (chosen) setOrgTemplate(chosen);
        }
        // Keep numbering in sync with edits made in the drawer's Numbering tab.
        if (docSettingsRes.status === "fulfilled") {
          const d = docSettingsRes.value.data || {};
          setDocSettings((prev) => {
            const dtSettings = d.documentTypeSettings || prev.documentTypeSettings;
            return {
              ...prev,
              invoicePrefix: dtSettings?.invoice?.prefix || d.invoicePrefix || "INV-",
              invoiceSuffix: dtSettings?.invoice?.suffix || d.invoiceSuffix || "",
              invoicePrefixes: dtSettings?.invoice?.prefixes || d.invoicePrefixes || ["INV-"],
              invoiceSuffixes: dtSettings?.invoice?.suffixes || d.invoiceSuffixes || [],
              nextInvoiceNumber: d.nextInvoiceNumber || 1,
              documentTypeSettings: dtSettings,
            };
          });
        }
      } catch (err) {
        console.error("Fetch branding/bank error:", err);
      }
    })();
  }, [type, showTemplates]);

  // The panel is an overlay, not a route. Push a history entry while it's open
  // so the browser Back button closes the panel and stays on Accounting,
  // instead of navigating away to the previous page.
  useEffect(() => {
    window.history.pushState({ accountingPanel: true }, "");
    const handlePop = () => onClose();
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const res = await API.get("/items?search=&includeVariants=true");
        const flattened = (res.data || [])
          .filter((item) => item.isActive)
          .flatMap((item) => {
            // Same variant-only logic as PurchaseForm.jsx/PurchaseOrderForm.jsx
            // (and the other fetchItems in this file): variants only when
            // present, otherwise the item itself.
            const variants = item.variants || [];
            if (variants.length > 0) {
              return variants.map((v) => ({
                _id: v._id,
                displayName: `${item.name} - ${v.name}`,
                name: v.name,
                description: v.description || item.description || "",
                sellingPrice: v.sellingPrice || item.sellingPrice,
                hsnSac: v.hsnSac || item.hsnSac || "",
                isVariant: true,
                parentItemId: item._id,
                type: item.type,
                stock: v.stock ?? item.inventory?.currentStock ?? 0,
                // Discount only lives on the parent Item (variants have no
                // discount field of their own) — same catalog default for
                // every variant of a product.
                discount: v.discount || item.discount,
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
                isVariant: false,
                parentItemId: null,
                type: item.type,
                stock: item.inventory?.currentStock ?? 0,
                discount: item.discount,
              },
            ];
          });
        setCatalogue(flattened);
      } catch (err) {
        console.error("Fetch items error:", err);
      }
    };
    fetchItems();
  }, []);

  useEffect(() => {
    const loadDocSettings = async () => {
      try {
        const res = await API.get("/document-settings");
        const dtSettings = res.data?.documentTypeSettings || { invoice: { prefix: "INV-", suffix: "", prefixes: ["INV-"], suffixes: [] } };
        setDocSettings({
          invoicePrefix: dtSettings.invoice?.prefix || res.data?.invoicePrefix || "INV-",
          invoiceSuffix: dtSettings.invoice?.suffix || res.data?.invoiceSuffix || "",
          invoicePrefixes: dtSettings.invoice?.prefixes || res.data?.invoicePrefixes || ["INV-"],
          invoiceSuffixes: dtSettings.invoice?.suffixes || res.data?.invoiceSuffixes || [],
          nextInvoiceNumber: res.data?.nextInvoiceNumber || 1,
          defaultNotes: res.data?.defaultNotes || "",
          defaultTerms: res.data?.defaultTerms || "",
          documentTypeSettings: dtSettings,
        });
        // dtSettings here is invoice-only (`.invoice.prefix`) — syncing it
        // into form.invoicePrefix unconditionally would overwrite a
        // Quotation/Proforma/Delivery Challan panel's already-correct
        // per-type prefix (set at mount from the `documentTypeSettings`
        // prop) with the org's *invoice* prefix. Only invoices sync here.
        setForm((prev) => ({
          ...prev,
          invoicePrefix: type === "tax" ? (dtSettings.invoice?.prefix || res.data?.invoicePrefix || "INV-") : prev.invoicePrefix,
          invoiceSuffix: type === "tax" ? (dtSettings.invoice?.suffix || res.data?.invoiceSuffix || "") : prev.invoiceSuffix,
          nextInvoiceNumber: res.data?.nextInvoiceNumber || 1,
        }));
        const previewKeyByType = {
          tax: "invoice",
          quotation: "quote",
          performa: "proformaInvoice",
          deliveryChallan: "deliveryChallan",
        };
        setNextNumberPreview(res.data?.nextNumbers?.[previewKeyByType[type] || "invoice"] || null);
      } catch (error) {
        console.error("Failed to load document settings", error);
      }
    };

    loadDocSettings();
  }, []);

  // Load the org's saved signatures and fall back to the one marked default
  // whenever the document doesn't already carry a signature of its own — so
  // every invoice gets the default unless someone picked a specific one. A
  // document that stored its own custom signature keeps it untouched.
  useEffect(() => {
    const loadSignatures = async () => {
      setSignaturesLoading(true);
      try {
        const res = await API.get("/document-settings/signatures");
        const sigs = Array.isArray(res.data) ? res.data : [];
        setSavedSignatures(sigs);
        const defaultSig = sigs.find((s) => s.isDefault);
        if (defaultSig) {
          // Fall back to the default whenever the document isn't already
          // pointing at one of the saved signatures — so a blank, stale, or
          // never-set signature resolves to the default rather than nothing.
          // A document that stored a still-valid custom signature keeps it.
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

    loadSignatures();
  }, []);

  const setField = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  const updateItem = (index, patch) =>
    setForm((p) => ({
      ...p,
      items: p.items.map((it, i) => (i === index ? { ...it, ...patch } : it)),
    }));

  const addItem = () =>
    setForm((p) => ({ ...p, items: [...p.items, blankItem()] }));

  const removeItem = (index) =>
    setForm((p) => ({
      ...p,
      items:
        p.items.length === 1 ? [blankItem()] : p.items.filter((_, i) => i !== index),
    }));

  const handleAddToBill = () => {
    const searchText = quickAddSearch.trim();
    if (!quickAddId && !searchText) return toast.error("Please enter or select a product.");

    // Resolve catalogue item: explicit selection → exact match → single partial match
    let resolvedId = quickAddId;
    if (!resolvedId && searchText) {
      const lower = searchText.toLowerCase();
      const exact = catalogue.find((c) => c.displayName.toLowerCase() === lower);
      if (exact) {
        resolvedId = exact._id;
      } else {
        const partial = catalogue.filter((c) =>
          c.displayName.toLowerCase().includes(lower)
        );
        if (partial.length === 1) resolvedId = partial[0]._id;
      }
    }

    let newItem;
    if (resolvedId) {
      const picked = catalogue.find((c) => c._id === resolvedId);
      if (!picked) return toast.error("Product not found in catalogue.");
      const blocked = stockBlockReason(picked, parseInt(quickAddQty) || 1);
      if (blocked) return toast.error(blocked);
      newItem = {
        _id: picked._id,
        // displayName is "Item - Variant" for a variant (just the item name
        // when there's no variant) — picked.name alone would be only the
        // variant's own name ("Ornage" instead of "motto - Ornage"), which
        // then also loses the item name if the user later edits or leaves
        // this line untouched.
        name: picked.displayName,
        description: picked.description ? picked.description.replace(/<[^>]*>/g, "").trim() : "",
        rate: picked.sellingPrice ?? 0,
        quantity: parseInt(quickAddQty) || 1,
        hsn: picked.hsnSac || "",
        isVariant: picked.isVariant || false,
        parentItemId: picked.parentItemId || null,
        discountType: picked.discount?.type || "amount",
        discount: picked.discount?.value || 0,
        showDescription: false,
        gstRate: picked.gstRate || form.gstRate || 18,
        taxInclusive: !!picked.taxInclusive,
      };
    } else {
      // Free-text item not in catalogue
      newItem = {
        _id: null,
        name: searchText,
        description: "",
        rate: 0,
        quantity: parseInt(quickAddQty) || 1,
        hsn: "",
        isVariant: false,
        parentItemId: null,
        discountType: "amount",
        discount: 0,
        showDescription: false,
        gstRate: form.gstRate || 18,
        taxInclusive: false,
      };
    }

    setForm((p) => {
      const isBlank = p.items.length === 1 && !p.items[0].name && !p.items[0]._id;
      return { ...p, items: isBlank ? [newItem] : [...p.items, newItem] };
    });
    setQuickAddId(null);
    setQuickAddQty(1);
    setQuickAddSearch("");
    setQuickAddOpen(false);
  };

  // Same breakdown as InvoiceForm.jsx: line total -> per-item discount ->
  // subtotal after item discounts -> invoice-level discount -> GST -> final.
  const lineTotal = (item) =>
    (parseFloat(item.rate) || 0) * (parseInt(item.quantity) || 0);

  const itemDiscountAmount = (item) => {
    const base = lineTotal(item);
    const discount = parseFloat(item.discount) || 0;
    return item.discountType === "percentage" ? (base * discount) / 100 : discount;
  };

  const subtotal = form.items.reduce((sum, it) => sum + lineTotal(it), 0);
  const itemDiscountsTotal = form.items.reduce(
    (sum, it) => sum + itemDiscountAmount(it),
    0
  );
  const afterItemDiscounts = subtotal - itemDiscountsTotal;
  const invoiceDiscountAmount =
    form.discount.value > 0
      ? form.discount.type === "percentage"
        ? (afterItemDiscounts * form.discount.value) / 100
        : form.discount.value
      : 0;
  // Same shared engine the live preview/PDF use (buildDocumentHtml →
  // computeDocument → splitGst, in shared/documentTemplates.js) — honors
  // each item's own gstRate rather than only a document-level rate, so this
  // summary, the preview pane and the saved amount can never disagree.
  // ("quotation" maps to "tax" here only for computeDocument's internal
  // isTaxQuotation/isTaxInvoice lookup — this panel's own state field is
  // always named form.isTaxInvoice regardless of document type.)
  const taxDetails = form.isTaxInvoice
    ? computeDocument(form, type === "quotation" ? "tax" : type)
    : null;
  const gstSplit = taxDetails
    ? { isInterState: taxDetails.isInterState, cgst: taxDetails.totalCGST, sgst: taxDetails.totalSGST, igst: taxDetails.totalIGST }
    : { cgst: 0, sgst: 0, igst: 0, isInterState: false };
  let finalTotal = taxDetails ? taxDetails.grandTotal : afterItemDiscounts - invoiceDiscountAmount;
  let roundOffAmount = 0;
  if (form.isRoundOff) {
    const rounded = Math.round(finalTotal);
    roundOffAmount = rounded - finalTotal;
    finalTotal = rounded;
  }

  const money = (n) =>
    `₹${(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const submitInvoice = async (statusValue) => {
    const isDraft = statusValue === "Draft";
    // Required/invalid fields are marked red in place (see fieldErrors)
    // instead of a toast — no notification popup, the field itself shows
    // what's wrong.
    const nextErrors = {};
    if (!form.deal) nextErrors.deal = true;
    if (!form.date) nextErrors.date = true;
    if (isAddressEmpty(form.billingAddress)) nextErrors.billingAddress = true;
    if (!isDraft && supportsGSTIN) {
      if (!form.receiverGSTIN.trim()) nextErrors.receiverGSTIN = true;
      else if (!GSTIN_REGEX.test(form.receiverGSTIN.trim().toUpperCase()))
        nextErrors.receiverGSTIN = true;
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      // Scroll to whichever invalid field comes first on the form, not just
      // color it — a red border off-screen (especially on mobile) is easy
      // to miss entirely.
      const firstInvalidRef = nextErrors.deal
        ? dealFieldRef
        : nextErrors.date
          ? dateFieldRef
          : nextErrors.billingAddress
            ? billingFieldRef
            : gstinFieldRef;
      firstInvalidRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setFieldErrors({});
    // A quick draft only needs enough to identify the document; full GSTIN and
    // item validation apply once it's actually being created for real.
    if (!isDraft) {
      const badItem = form.items.find(
        (it) => !it.name || !it.rate || !it.quantity
      );
      if (badItem)
        return toast.error("Every item needs a name, rate and quantity.");
    }

    try {
      setSubmitting(true);
      const payload = {
        deal: form.deal,
        date: form.date,
        dueDate: form.dueDate,
        status: statusValue,
        style: previewTemplate,
        transactionType: form.transactionType,
        gstRate: form.gstRate,
        discount: form.discount,
        isRoundOff: form.isRoundOff,
        notes: form.notes,
        terms: form.terms,
        bankDetails: form.bankDetails || null,
        qrNote: form.qrNote || "",
        signature: form.signature,
        amount: finalTotal,
        items: form.items.map((it) => ({
          itemId: it.isVariant ? it.parentItemId : it._id,
          variantId: it.isVariant ? it._id : null,
          name: it.name,
          description: it.description,
          rate: parseFloat(it.rate) || 0,
          quantity: parseInt(it.quantity) || 0,
          hsn: it.hsn,
          isVariant: it.isVariant,
          parentItemId: it.parentItemId,
          discountType: it.discountType,
          discount: parseFloat(it.discount) || 0,
          gstRate: parseFloat(it.gstRate) || 0,
          taxInclusive: !!it.taxInclusive,
        })),
      };
      if (supportsGSTIN) {
        payload.receiverGSTIN = form.receiverGSTIN.trim().toUpperCase();
      }
      // Sent for every document type — the backend model carries billing/
      // shipping address on invoices, pro forma invoices, quotations and
      // delivery challans alike. Left blank, the server falls back to the
      // deal's company address on its own.
      payload.billingAddress = form.billingAddress;
      payload.shippingAddress = form.sameAsBilling
        ? form.billingAddress
        : form.shippingAddress;
      if (supportsTax) {
        payload[taxFlagKey] = form.isTaxInvoice;
      }
      // Each document type's create/update endpoint expects its own field
      // name for the prefix/number (invoicePrefix, quotationPrefix,
      // performaInvoicePrefix, deliveryChallanPrefix) — sending the generic
      // "invoicePrefix" for a quotation/proforma/challan is silently ignored
      // by that type's backend schema, so this maps the internal
      // form.invoicePrefix/invoiceNumber state onto the correct outgoing key
      // for whichever `type` this panel instance is.
      payload[PREFIX_FIELD_BY_TYPE[type]] = form.invoicePrefix?.trim() || configuredPrefix;
      payload[NUMBER_FIELD_BY_TYPE[type]] = form.invoiceNumber?.toString().trim() || undefined;
      // Suffix mirrors prefix: sent for every type, under that type's own
      // field name, so it's applied to the document being created right now
      // rather than only saved to Settings for future ones.
      payload[SUFFIX_FIELD_BY_TYPE[type]] = form.invoiceSuffix?.trim() || configuredSuffix;
      // An explicit "next number" override remains an invoice-only concept —
      // the other 3 controllers don't accept it.
      if (type === "tax") {
        payload.nextInvoiceNumber =
          form.nextInvoiceNumber ?? docSettings.nextInvoiceNumber ?? 1;
      }

      const path = apiPathFor(type);
      if (isEditing) {
        await API.put(`/${path}/${initialDoc._id}`, payload);
        toast.success(isDraft ? "Saved as draft!" : `${docName} updated successfully!`);
      } else {
        await API.post(`/${path}`, payload);
        toast.success(isDraft ? "Saved as draft!" : `${docName} created successfully!`);
      }
      onCreated();
      onClose();
    } catch (err) {
      const serverMessage = err.response?.data?.error || "";
      if (/insufficient stock/i.test(serverMessage)) {
        // A toast disappears before the user can act on it — this failure
        // needs a deliberate response (go fix the quantity), not a passive
        // notice, so it gets a dialog instead.
        setStockErrorMessage(serverMessage);
      } else {
        toast.error(
          serverMessage ||
          `Failed to ${isEditing ? "update" : isDraft ? "save draft" : "create"} ${docName.toLowerCase()}`
        );
      }
      console.error(`${isEditing ? "Update" : "Create"} ${type} error:`, err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveDraft = () => submitInvoice("Draft");

  // The template this document renders with. The organization's choice wins
  // outright: htmlDocumentPdf.resolveTemplate ignores the document's stored
  // `style` entirely, and every document saved before that change still
  // carries style:"Classic" from the old schema default. Honouring it here
  // would pin the preview to Classic forever *and* disagree with the PDF.
  // Used by the preview *and* the print window so all three agree.
  const previewTemplate = orgTemplate;

  // Bank block shown in the live preview / print window: the account picked in
  // "Select Bank", falling back to the org default the backend would use.
  const effectiveBankDetails =
    banks.find((x) => x._id === form.bankDetails) || bankDetails;

  // For new documents, docNumber is "" until saved. Build a preview number
  // from whatever the user has typed into the prefix/number/suffix fields so
  // the live preview (and print window) shows the chosen number immediately.
  const previewDocNumber = (() => {
    if (isEditing) return docNumber;
    const num = form.invoiceNumber?.toString().trim();
    if (!num) return docNumber || "";
    const pfx = (form.invoicePrefix?.trim() || configuredPrefix);
    const sep = pfx && !pfx.endsWith("-") ? "-" : "";
    const sfx = form.invoiceSuffix?.trim();
    return `${pfx}${sep}${num}${sfx ? `-${sfx}` : ""}`;
  })();

  // Prints exactly what the preview shows — the same shared fragment the PDF
  // is rendered from — including edits that haven't been saved yet, rather
  // than fetching the server's copy of the document.
  const handlePrint = () => {
    const html = buildDocumentHtml(
      {
        ...form,
        isTaxInvoice: supportsTax && !!form.isTaxInvoice,
        isTaxQuotation: supportsTax && !!form.isTaxInvoice,
      },
      {
        type,
        template: previewTemplate,
        orgDetails,
        bankDetails: effectiveBankDetails,
        dealName: customerNameForDeal(form.deal),
        documentNumber: previewDocNumber,
      }
    );
    const win = window.open("", "_blank", "width=900,height=1000");
    if (!win) {
      toast.error("Allow pop-ups for this site to print.");
      return;
    }
    win.document.write(`<!doctype html>
<html>
<head><meta charset="utf-8" /><title>${previewDocNumber || docName}</title>
<style>
  @page { size: ${previewTemplate === "Landscape" ? "A4 landscape" : "A4 portrait"}; margin: 12mm; }
  html, body { margin: 0; padding: 0; }
  /* Size the sheet to the printable area (A4 minus the 12mm @page margins), not
     a full 297mm, so the bottom-pinned "Page 1 / 1 …" line sits at the bottom of
     page 1 instead of tipping onto a second page. */
  .dcsheet { padding: 0 !important; width: 100% !important; max-width: 100% !important; min-height: ${previewTemplate === "Landscape" ? "184mm" : "271mm"} !important; margin: 0 !important; }
  /* On screen the sheet is ~760px wide; the printable A4 column is narrower,
     so an auto-laid-out items table can grow past its cell min-content and
     spill off the right edge of the paper (columns get clipped — see the
     Classic template). dc-items and cl-items declare a width on every column
     except the item/description one, so pinning table-layout lets that column
     absorb the remainder exactly like on screen. Templates whose item tables
     don't fully declare column widths are left on auto layout. */
  .dcsheet .dc-items, .dcsheet .cl-items {
    table-layout: fixed !important; width: 100% !important;
  }
  .dcsheet .dc-items td, .dcsheet .dc-items th,
  .dcsheet .cl-items td, .dcsheet .cl-items th {
    overflow-wrap: anywhere; word-break: break-word;
  }
  .dcsheet img, .dcsheet svg { max-width: 100%; }
  /* Browsers drop background fills when printing unless asked not to, which
     would strip the header bands and tinted rows some templates rely on. */
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  .dcsheet { --line-w: 1.5px; }
</style>
</head>
<body>${html}</body>
</html>`);
    win.document.close();
    win.focus();
    // Give the styles (and the logo, if any) a moment to apply before the
    // dialog snapshots the page. document.write can finish loading before
    // onload is attached, so fall back to a timer rather than never printing.
    let printed = false;
    const print = () => {
      if (printed) return;
      printed = true;
      win.print();
    };
    win.onload = print;
    setTimeout(print, 500);
  };
  const handleSubmit = () => submitInvoice(form.status || "Draft");

  const dealOptions = deals.map((d) => ({ value: d._id, label: d.title }));
  // Name the document is billed to: the deal's customer (company, else contact),
  // falling back to the deal's own title when neither is set. Used for the live
  // preview / print so it matches what the saved PDF renders.
  const customerNameForDeal = (dealId) => {
    const d = deals.find((x) => x._id === dealId);
    return (
      d?.company?.name ||
      d?.contact?.name ||
      d?.title ||
      dealOptions.find((o) => o.value === dealId)?.label
    );
  };
  const inputClass =
    "w-full h-[38px] px-3.5 rounded-full border border-[#1F2937]/10 bg-white text-[13px] text-[#1F2937] placeholder:text-[#1F2937] placeholder:opacity-50 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all";

  // Catalogue descriptions can be stored as rich-text HTML; show plain text in
  // the description field instead of raw markup.
  const stripHtml = (html) => {
    if (!html) return "";
    if (!/[<&]/.test(html)) return html;
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return (tmp.textContent || tmp.innerText || "").replace(/\s+/g, " ").trim();
  };

  // Grid template for the wide (row/list) item layout — includes an HSN column
  // only for tax invoices. Card layout ignores this and stacks fields.
  // Description isn't a column any more — it's an optional box under each row.
  const itemRowCols = form.isTaxInvoice
    ? "@2xl:grid-cols-[1.9fr_0.7fr_0.7fr_0.55fr_1.1fr_0.9fr_32px]"
    : "@2xl:grid-cols-[2.2fr_0.8fr_0.6fr_1.2fr_0.9fr_32px]";

  return (
    <div
      className="fixed right-0 bottom-0 bg-white z-[60] flex flex-col top-[calc(54px+var(--dc-offline-offset,0px))] lg:top-[calc(64px+var(--dc-offline-offset,0px))]"
      style={{ left: "var(--sidebar-width, 0px)" }}
    >
      {/* Single continuous resizer line spanning the strip + panels, so the
          divider reads as one line from the navbar down. */}
      <div
        onMouseDown={startSplitDrag}
        title="Drag to resize"
        style={{ left: `calc(0.5rem + (100% - 1rem) * ${leftPct / 100} + 3px)` }}
        className={`${hidePreview ? "hidden" : "hidden lg:flex"} absolute top-0 bottom-0 w-4 -translate-x-1/2 cursor-col-resize items-center justify-center gap-[3px] z-20 group`}
      >
        {/* Two hairlines at rest; on hover the gap between them fills so the
            pair reads as one solid blue bar. */}
        <div className="flex h-full gap-[3px] rounded-full group-hover:bg-[#0085FF] group-active:bg-[#0085FF] transition-colors">
          <span className="w-px h-full rounded-full bg-[#E1E4EA] group-hover:bg-[#0085FF] group-active:bg-[#0085FF] transition-colors" />
          <span className="w-px h-full rounded-full bg-[#E1E4EA] group-hover:bg-[#0085FF] group-active:bg-[#0085FF] transition-colors" />
        </div>

        {/* Decoration only — it marks the divider so the split reads as
            draggable. `pointer-events-none` is deliberate: clicks and drags
            pass straight through to the resizer behind it, so grabbing the
            knob resizes rather than doing nothing. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-24 left-1/2 -translate-x-1/2 z-30 w-7 h-7 flex items-center justify-center rounded-full bg-white border border-[#E1E4EA] text-[#525866] shadow-md group-hover:text-[#0085FF] group-hover:border-[#0085FF] group-active:text-[#0085FF] group-active:border-[#0085FF] transition-colors"
        >
          <ChevronsLeftRight className="w-3.5 h-3.5" />
        </div>
      </div>
      {/* Fixed top strip — one 64px header bar (same height as the Companies
          toolbar), not part of the scrolling panels. Same border + shadow as
          the app navbar so the header reads as a separate layer above the
          form. Each column draws its own divider *and* its own shadow, so the
          two segments stay visually separate and the resizer gap between them
          casts nothing. `relative z-10` matters: without it the panels below
          paint their white background over the shadows and they vanish. */}
      <div className="relative z-10 flex-shrink-0 h-16 flex items-stretch bg-white px-2 border-b border-[#E1E4EA] lg:border-b-0">
        {/* Left: form header */}
        <div
          style={{ width: formWidth }}
          className="flex items-stretch px-3 lg:px-4 lg:pr-6 min-w-0 self-stretch max-lg:!w-full"
        >
          <div className="w-full flex items-center justify-between gap-2 lg:border-b lg:border-[#E1E4EA] lg:shadow-[0_4px_5px_-3px_rgba(0,0,0,0.16)]">
            <div className="min-w-0">
              {isEditing && docNumber ? (
                <>
                  {numberDraft === null ? (
                    <div className="flex items-center gap-1.5 min-w-0">
                      <h2 className="text-xl font-bold text-[#1F2937] truncate">
                        {docNumber}
                      </h2>
                      <button
                        type="button"
                        onClick={() => setNumberDraft(numberSuffix)}
                        title={`Rename this ${docName.toLowerCase()}`}
                        aria-label={`Rename this ${docName.toLowerCase()}`}
                        className="p-1 rounded-md text-[#99A0AE] hover:text-[#0085FF] hover:bg-[#F0F6FF] transition-colors flex-shrink-0"
                      >
                        <EditIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    // The prefix sits outside the input so it reads as part of
                    // the number but can't be edited or deleted.
                    <div className="flex items-center gap-1 min-w-0">
                      <div className="flex items-center h-9 pl-2.5 pr-1 border border-[#E1E4EA] rounded-lg focus-within:border-[#0085FF] min-w-0">
                        <span className="text-xl font-bold text-[#99A0AE] flex-shrink-0">
                          {numberPrefix}
                        </span>
                        <input
                          autoFocus
                          value={numberDraft}
                          disabled={savingNumber}
                          onChange={(e) => setNumberDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveDocNumber();
                            if (e.key === "Escape") setNumberDraft(null);
                          }}
                          className="w-28 min-w-0 px-1 text-xl font-bold text-[#1F2937] outline-none bg-transparent"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={saveDocNumber}
                        disabled={savingNumber}
                        className="h-7 px-2 rounded-lg bg-[#0085FF] hover:bg-blue-600 text-white text-[11px] font-medium transition-colors disabled:opacity-60 flex-shrink-0"
                      >
                        {savingNumber ? "Saving..." : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setNumberDraft(null)}
                        disabled={savingNumber}
                        className="h-7 px-2 rounded-lg border border-[#E1E4EA] text-[11px] font-medium text-[#525866] hover:bg-gray-50 transition-colors flex-shrink-0"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-3 min-w-0">
                  <h2 className="text-xl font-bold text-[#1F2937] truncate">
                    {isEditing ? `Edit ${docName}` : `Create New ${docName}`}
                  </h2>
                  {/* Same prefix + number boxes the full-width screen shows —
                      previously only the full-width view let the user see or
                      change the numbering before saving; split view silently
                      used whatever Document Settings configured with no
                      visibility into it. */}
                  {/* Hidden on mobile — three editable boxes plus the title
                      and action buttons don't fit one clean header row on a
                      phone screen; document numbering is still reachable via
                      Settings. */}
                  {!isEditing && (
                    <div className="hidden lg:flex items-center border border-[#E1E4EA] rounded-lg overflow-hidden h-9 bg-white flex-shrink-0">
                      <input
                        type="text"
                        value={form.invoicePrefix}
                        onChange={(e) => setForm((prev) => ({ ...prev, invoicePrefix: e.target.value }))}
                        title={`${docName} number prefix`}
                        aria-label={`${docName} number prefix`}
                        className="w-16 px-2 py-1 text-sm font-semibold text-[#1F2937] bg-[#F8F9FB] border-r border-[#E1E4EA] focus:outline-none focus:bg-white"
                      />
                      <input
                        type="text"
                        placeholder={nextNumberPreview ? String(nextNumberPreview) : "Auto"}
                        value={form.invoiceNumber}
                        onChange={(e) => setForm((prev) => ({ ...prev, invoiceNumber: e.target.value }))}
                        title={`${docName} number (leave blank to auto-generate)`}
                        aria-label={`${docName} number`}
                        className="w-20 px-2 py-1 text-sm font-semibold text-[#1F2937] border-r border-[#E1E4EA] focus:outline-none"
                      />
                      <input
                        type="text"
                        placeholder="Suffix"
                        value={form.invoiceSuffix}
                        onChange={(e) => setForm((prev) => ({ ...prev, invoiceSuffix: e.target.value }))}
                        title={`${docName} number suffix (optional)`}
                        aria-label={`${docName} number suffix`}
                        className="w-16 px-2 py-1 text-sm font-semibold text-[#1F2937] bg-[#F8F9FB] focus:outline-none focus:bg-white"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* When the parent supplies onRequestFullWidth, this button hands
                  off to a dedicated full-width screen (owned by Accounting.jsx)
                  instead of just collapsing the preview pane in place — the
                  current form is passed along so the handoff doesn't drop
                  whatever's been typed so far. */}
              <button
                type="button"
                onClick={() =>
                  onRequestFullWidth
                    ? onRequestFullWidth(form)
                    : setHidePreview((v) => !v)
                }
                title={
                  onRequestFullWidth
                    ? `Open full width ${docName.toLowerCase()} form`
                    : hidePreview
                      ? "Show preview"
                      : "Hide preview — full width form"
                }
                aria-pressed={onRequestFullWidth ? undefined : hidePreview}
                className="hidden lg:flex h-8 w-8 items-center justify-center bg-white border border-[#E1E4EA] rounded-full text-[#525866] hover:bg-gray-50 transition-colors shadow-sm flex-shrink-0"
              >
                {hidePreview && !onRequestFullWidth ? (
                  <Minimize2 className="w-3.5 h-3.5" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5" />
                )}
              </button>
              {/* Document-level settings for this screen — distinct from the
                  app's global Settings page. Saving moved to the sticky bar at
                  the bottom of the form, so this slot hosts it instead.
                  Reachable even with the preview hidden, unlike the "Change
                  Template" button that lives in the preview header. */}
              <button
                type="button"
                onClick={() => setShowTemplates(true)}
                title={`${docName} settings`}
                className="h-8 w-8 lg:w-auto lg:px-4 flex items-center justify-center lg:justify-start gap-1.5 bg-white border border-[#E1E4EA] rounded-full lg:rounded-lg text-[13px] font-medium text-[#1F2937] hover:bg-gray-50 transition-colors shadow-sm flex-shrink-0"
              >
                <SettingsIcon className="w-4 h-4 text-[#525866]" />
                <span className="hidden lg:inline">Settings</span>
              </button>
              {/* Saving/creating lives in the sticky bar at the foot of the
                  form; this slot offers the draft escape hatch instead. */}
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={submitting}
                className="h-8 px-4 flex items-center gap-1.5 rounded-lg bg-[#0085FF] hover:bg-blue-600 text-white text-[13px] font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex-shrink-0"
              >
                <PdfIcon className="w-4 h-4" />
                <span className="lg:hidden">Draft</span>
                <span className="hidden lg:inline">Save as Draft</span>
              </button>
            </div>
          </div>
        </div>
        {/* Gap reserved for the absolute resizer line — no bottom border here,
            so the strip line reads as two separate parts (left / right). */}
        {!hidePreview && <div className="hidden lg:block w-1.5 flex-shrink-0 self-stretch" />}
        {/* Right: preview header. Hidden outright on mobile — same reasoning
            as the preview body pane below: no room for it on a phone-width
            screen, so its "Change Template" button shouldn't crowd the
            create-invoice actions on the left either. */}
        <div
          className={`flex-1 min-w-0 items-stretch px-3 lg:pl-6 self-stretch hidden ${hidePreview ? "lg:hidden" : "lg:flex"}`}
        >
          <div className="w-full flex items-center justify-between gap-4 border-b border-[#E1E4EA] shadow-[0_4px_5px_-3px_rgba(0,0,0,0.16)]">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-[#1F2937] truncate">
              {docName} Preview
            </h2>
            <p className="text-xs text-[#99A0AE] truncate">
              This is how your {docName.toLowerCase()} will appear to the customer.
            </p>
          </div>
          {/* The template is an organization-wide setting, so this opens the
              same Template drawer the Accounting toolbar uses rather than
              pinning a style onto this one document. */}
          <div className="flex-shrink-0">
            <button
              type="button"
              onClick={() => setShowTemplates(true)}
              className="h-8 px-4 flex items-center gap-1.5 rounded-lg bg-[#0085FF] hover:bg-blue-600 text-white text-sm font-medium transition-colors"
            >
              <EditIcon className="w-3.5 h-3.5" />
              Change Template
            </button>
          </div>
          </div>
        </div>
      </div>

      {/* Frame 2147225003 — the two panels sit side by side, each scrolling
          independently, so neither one's height depends on the other. This
          whole screen is `position: fixed` to the viewport (see the wrapper
          a few lines up), not nested inside a scrolling page — so on mobile
          the single visible pane (preview is hidden there) still needs its
          own internal overflow-y-auto; there's no outer page scroll to fall
          back on. */}
      <div ref={splitRef} className="flex-1 min-h-0 flex flex-col lg:flex-row items-stretch px-2 pb-2 pt-0 gap-0 overflow-hidden">
        {/* Left: form. Frame 1351649637
            The scrolling element itself must NOT be a flex container: when a
            flex item's parent has `overflow` other than visible, the spec
            drops that item's min-height from `auto` to `0`, so flex-shrink:1
            (the default) is free to squash it below its content size instead
            of the overflow ever kicking in — exactly the "top of the item
            list collapses to a sliver" bug reported at 100% zoom (less
            available height = more squashing; zooming out to 90% just gave
            the content more room, masking it). Fix: keep `overflow-y-auto`
            on this outer box but make it a plain block, and put all the
            flex-col spacing on a single inner wrapper instead — that
            wrapper isn't itself inside an overflow context, so its children
            keep their natural `min-height: auto` and the outer box scrolls
            for real instead of silently crushing them. */}
        <div
          style={{ width: formWidth, WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}
          className="@container max-lg:!w-full flex-1 min-h-0 lg:flex-none bg-white p-3 lg:p-4 lg:pr-6 overflow-y-auto self-stretch"
        >
          <div className="w-full flex flex-col items-start gap-1">
          {/* Sections 01-04 (Details/Address/GST/Items) swap to the
              full-width table layout when the preview is hidden — same form
              state and handlers either way, just a different arrangement.
              Notes onward always renders from this file, unchanged.
              Quotations always use the inline form (never FullWidthDocumentPanel)
              so their Swipe-style layout renders in both modes. */}
          {hidePreview && type !== "quotation" ? (
            <FullWidthDocumentPanel
              type={type}
              docName={docName}
              supportsGSTIN={supportsGSTIN}
              supportsTax={supportsTax}
              sectionNo={sectionNo}
              form={form}
              setField={setField}
              setForm={setForm}
              deals={deals}
              dealOptions={dealOptions}
              onAddDeal={onAddDeal}
              catalogue={catalogue}
              addItem={addItem}
              removeItem={removeItem}
              updateItem={updateItem}
              stripHtml={stripHtml}
            />
          ) : (
          <>
          <SectionHeader number={sectionNo.details} title={`${docName} Details`} />
          <div className="grid grid-cols-1 @md:grid-cols-2 gap-x-6 gap-y-2 w-full">
            <div className="flex flex-col gap-1" ref={dealFieldRef}>
              <FieldLabel required>Select Deal</FieldLabel>
              <div className="flex items-center gap-2">
                <PickerSelect
                  value={form.deal}
                  options={dealOptions}
                  placeholder="Search and select deal"
                  icon={SearchIcon}
                  invalid={fieldErrors.deal}
                  triggerClassName="h-[38px] rounded-full"
                  onSelect={(o) => {
                    setFieldErrors((prev) => ({ ...prev, deal: false }));
                    // Switching the deal always replaces the Receiver GSTIN
                    // and billing/shipping address with whatever the new
                    // deal's company has — including clearing them to empty
                    // when that company doesn't have them saved. Carrying
                    // over the previous deal's company data would attach it
                    // to a company it was never actually collected for.
                    const selectedDeal = deals.find((d) => d._id === o.value);
                    const company = selectedDeal?.company;
                    const nextBilling =
                      company && !isAddressEmpty(company.billingAddress)
                        ? { ...emptyAddress(), ...company.billingAddress }
                        : emptyAddress();
                    const nextShipping =
                      company && !isAddressEmpty(company.shippingAddresses?.[0])
                        ? { ...emptyAddress(), ...company.shippingAddresses[0] }
                        : emptyAddress();
                    // Same seller-state vs. customer-state comparison the
                    // full-width form uses (InvoiceFormFull.jsx) — kept here
                    // instead of a manual Transaction Type dropdown so both
                    // views classify a given deal identically.
                    const sellerState = (orgDetails?.state || "").trim().toLowerCase();
                    const customerState = (company?.billingAddress?.state || "").trim().toLowerCase();
                    const autoType = sellerState && customerState && sellerState !== customerState ? "inter" : "intra";
                    setForm((p) => ({
                      ...p,
                      deal: o.value,
                      receiverGSTIN: supportsGSTIN ? company?.gstin || "" : p.receiverGSTIN,
                      billingAddress: nextBilling,
                      shippingAddress: p.sameAsBilling ? nextBilling : nextShipping,
                      transactionType: supportsTax ? autoType : p.transactionType,
                    }));
                  }}
                />
                <button
                  type="button"
                  onClick={onAddDeal}
                  title="Create a new deal"
                  className="w-[38px] h-[38px] flex-shrink-0 rounded-full bg-[#158FFF] hover:opacity-90 text-white flex items-center justify-center transition-colors"
                >
                  <PlusIcon className="w-4 h-4" />
                </button>
              </div>
              {fieldErrors.deal && (
                <p className="text-xs text-red-600 mt-1">Deal is required</p>
              )}
            </div>

            <div className="flex flex-col gap-1" ref={dateFieldRef}>
              <FieldLabel required>{docName} Date</FieldLabel>
              {/* Reserve the same 40px + gap the Select Deal "+" button takes,
                  so this input lines up with the deal picker's width. */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1 min-w-0">
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => {
                      const newDate = e.target.value;
                      setFieldErrors((prev) => ({ ...prev, date: false }));
                      setForm((prev) => {
                        let newDueDate = prev.dueDate;
                        if (!isEditing && !prev.dueDate && newDate) {
                          const d = new Date(newDate);
                          d.setDate(d.getDate() + (defaultDueDateDays ?? 30));
                          newDueDate = d.toISOString().split("T")[0];
                        }
                        return { ...prev, date: newDate, dueDate: newDueDate };
                      });
                    }}
                    className={fieldErrors.date ? inputClass.replace("border-[#E1E4EA]", "border-red-400") : inputClass}
                  />
                </div>
                <div className="w-10 flex-shrink-0" aria-hidden="true" />
              </div>
              {fieldErrors.date && (
                <p className="text-xs text-red-600 mt-1">{docName} date is required</p>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <FieldLabel>Due Date</FieldLabel>
              {/* Same reserved 40px + gap as the fields above, so this input
                  ends flush with the deal picker instead of running past it. */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1 min-w-0">
                  <input
                    type="date"
                    value={form.dueDate}
                    min={new Date().toISOString().split("T")[0]}
                    onChange={(e) => setField("dueDate", e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="w-10 flex-shrink-0" aria-hidden="true" />
              </div>
              {/* Quick set, below the field rather than beside it so it reads
                  as "options for this input" instead of a competing control.
                  Always computed from the Invoice Date, never from whatever
                  Due Date currently holds — so re-clicking the same button
                  is idempotent, and it stays disabled (with an explanatory
                  title) until an Invoice Date exists to add days to. Picking
                  a Due Date this way never re-runs on its own afterwards: if
                  the Invoice Date is edited later, the existing Due Date is
                  left as-is unless a quick-set button is clicked again. */}
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className={`text-[11px] font-medium ${form.date ? "text-[#99A0AE]" : "text-[#C9CFD8]"}`}
                >
                  Quick set:
                </span>
                {[7, 15, 30].map((days) => (
                  <button
                    key={days}
                    type="button"
                    disabled={!form.date}
                    title={
                      form.date
                        ? `Set Due Date to ${days} days after the ${docName} date`
                        : `Select the ${docName} date first`
                    }
                    onClick={() => {
                      if (!form.date) {
                        setFieldErrors((prev) => ({ ...prev, date: true }));
                        return;
                      }
                      const d = new Date(form.date);
                      d.setDate(d.getDate() + days);
                      setField("dueDate", d.toISOString().split("T")[0]);
                    }}
                    className={`h-6 px-2.5 text-[11px] font-medium rounded-full border-none focus:outline-none transition-colors ${
                      form.date
                        ? "text-[#525866] bg-[#F5F7FA] hover:bg-[#E1E4EA] cursor-pointer"
                        : "text-[#C9CFD8] bg-[#F5F7FA] cursor-not-allowed"
                    }`}
                  >
                    {days} days
                  </button>
                ))}
              </div>
            </div>
          </div>

          <SectionHeader number={sectionNo.address} title="Billing & Shipping Address" />
          <div className="grid grid-cols-1 @md:grid-cols-2 gap-x-6 gap-y-2 w-full">
            <div ref={billingFieldRef} className="contents">
            <AddressFieldsGroup
              label="Billing address"
              required
              invalid={fieldErrors.billingAddress}
              value={form.billingAddress}
              onChange={(next) => {
                setFieldErrors((prev) => ({ ...prev, billingAddress: false }));
                // Same seller-state vs. customer-state re-check the deal
                // picker above runs, so editing the billing state directly
                // on this document also flips CGST/SGST vs IGST instead of
                // freezing whatever the deal's company implied.
                const sellerState = (orgDetails?.state || "").trim().toLowerCase();
                const customerState = (next.state || "").trim().toLowerCase();
                const autoType = sellerState && customerState && sellerState !== customerState ? "inter" : "intra";
                setForm((p) => ({
                  ...p,
                  billingAddress: next,
                  shippingAddress: p.sameAsBilling ? next : p.shippingAddress,
                  transactionType: supportsTax && customerState ? autoType : p.transactionType,
                }));
              }}
            />
            {fieldErrors.billingAddress && (
              <p className="text-xs text-red-600 mt-1">Billing address is required</p>
            )}
            </div>
            <div className="flex items-center gap-2 @md:col-span-2 -mb-1">
              <button
                type="button"
                onClick={() =>
                  setForm((p) => {
                    const nowSame = !p.sameAsBilling;
                    return {
                      ...p,
                      sameAsBilling: nowSame,
                      shippingAddress: nowSame ? p.billingAddress : p.shippingAddress,
                    };
                  })
                }
                className="flex-shrink-0"
              >
                <span
                  className={`w-9 h-5 rounded-full flex items-center px-0.5 transition-colors ${form.sameAsBilling ? "bg-[#0085FF]" : "bg-[#E1E4EA]"
                    }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${form.sameAsBilling ? "translate-x-4" : "translate-x-0"
                      }`}
                  />
                </span>
              </button>
              <span className="text-[12px] font-medium text-[#1F2937]">
                Shipping address same as billing
              </span>
            </div>
            <AddressFieldsGroup
              label="Shipping address"
              value={form.shippingAddress}
              disabled={!!form.sameAsBilling}
              onChange={(next) => setField("shippingAddress", next)}
            />
          </div>

          {supportsGSTIN && (
          <>
          <SectionHeader number={sectionNo.billing} title="Billing & Tax Information" />
          <div className="grid grid-cols-1 @md:grid-cols-2 gap-x-6 gap-y-2 w-full">
            <div className="flex flex-col gap-1" ref={gstinFieldRef}>
              <FieldLabel required>Receiver GSTIN</FieldLabel>
              {/* Match the Select Deal picker width (reserve the "+" button space). */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={form.receiverGSTIN}
                  onChange={(e) => {
                    setFieldErrors((prev) => ({ ...prev, receiverGSTIN: false }));
                    setField("receiverGSTIN", e.target.value);
                  }}
                  placeholder="Enter Receiver GSTIN (e.g., 22AAAAA0000A1Z5)"
                  className={`${fieldErrors.receiverGSTIN ? inputClass.replace("border-[#E1E4EA]", "border-red-400") : inputClass} flex-1 min-w-0`}
                />
                <div className="w-10 flex-shrink-0" aria-hidden="true" />
              </div>
              {fieldErrors.receiverGSTIN && (
                <p className="text-xs text-red-600 mt-1">Valid receiver GSTIN is required</p>
              )}
            </div>


          </div>
          {/* GST rate is set per item below (Products & Services → More
              Details), matching the full-width form — a single document-level
              rate can't represent a mixed-rate item list. Transaction Type
              (CGST+SGST vs IGST) is likewise not a manual choice here: it's
              auto-derived from seller vs. customer state when a deal is
              picked, same as the full-width form does. */}
          </>
          )}

          {/* Items — Products & Services card (matches full-width view) */}
          <div className="w-full bg-white rounded-xl border border-[#E1E4EA] p-4">

            {/* Card header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-semibold text-[#1F2937]">Products &amp; Services</span>
                <button
                  type="button"
                  onClick={() => setShowQuickItemDrawer(true)}
                  className="text-[12px] font-semibold text-[#0085FF] hover:underline ml-1"
                >
                  + Add new Product?
                </button>
              </div>
            </div>

            {/* Quick-add bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 p-3 mb-4 bg-blue-50/60 border border-blue-100 rounded-xl">
              {/* Inline search — no dropdown component, just a plain input */}
              <div className="relative flex-1 min-w-0">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#99A0AE] pointer-events-none" />
                <input
                  type="text"
                  value={quickAddSearch}
                  onChange={(e) => {
                    const val = e.target.value;
                    setQuickAddSearch(val);
                    // Clear selected ID only when the user edits the text
                    // (i.e. the new text no longer equals the selected item's name)
                    const selected = catalogue.find((c) => c._id === quickAddId);
                    if (!selected || val !== selected.displayName) setQuickAddId(null);
                    setQuickAddOpen(true);
                  }}
                  onFocus={() => { if (quickAddSearch && !quickAddId) setQuickAddOpen(true); }}
                  onBlur={() => setTimeout(() => setQuickAddOpen(false), 150)}
                  placeholder="Search items or variants…"
                  className="w-full h-[38px] pl-9 pr-8 text-[13px] text-[#1F2937] bg-white border border-[#1F2937]/10 rounded-full focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50"
                />
                {(quickAddSearch || quickAddId) && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { setQuickAddSearch(""); setQuickAddId(null); setQuickAddOpen(false); }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-[#99A0AE] hover:text-[#525866] transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                {/* Suggestions dropdown */}
                {quickAddOpen && quickAddSearch.trim() && (() => {
                  const results = catalogue
                    .filter((c) => c.displayName.toLowerCase().includes(quickAddSearch.toLowerCase()))
                    .slice(0, 8);
                  return results.length > 0 ? (
                    <div className="absolute z-50 left-0 right-0 top-[calc(100%+4px)] bg-white border border-[#E1E4EA] rounded-lg shadow-lg overflow-hidden">
                      {results.map((item) => (
                        <button
                          key={item._id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setQuickAddId(item._id);
                            setQuickAddSearch(item.displayName);
                            setQuickAddOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 text-[13px] text-[#1F2937] hover:bg-blue-50 transition-colors border-b border-[#F0F1F3] last:border-b-0"
                        >
                          {item.displayName}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="absolute z-50 left-0 right-0 top-[calc(100%+4px)] bg-white border border-[#E1E4EA] rounded-lg shadow-lg px-3 py-2 text-[12px] text-[#99A0AE]">
                      No products found.
                    </div>
                  );
                })()}
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                <input
                  type="number"
                  min="1"
                  placeholder="Qty"
                  value={quickAddQty}
                  onChange={(e) => setQuickAddQty(e.target.value)}
                  onWheel={(e) => e.target.blur()}
                  className="w-20 h-[38px] text-center text-[13px] text-[#1F2937] border border-[#1F2937]/10 rounded-full bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  onClick={handleAddToBill}
                  className="h-[38px] px-4 flex items-center gap-1.5 bg-[#158FFF] hover:opacity-90 text-white text-[13px] font-semibold rounded-full transition-colors whitespace-nowrap"
                >
                  <PlusIcon className="w-4 h-4" />
                  Add to Bill
                </button>
              </div>
            </div>

            {/* Empty state / table */}
            {form.items.length === 0 || (form.items.length === 1 && !form.items[0].name && !form.items[0]._id) ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Inbox className="w-12 h-12 text-[#C1C9D2] mb-4" strokeWidth={1.5} />
                <p className="text-[13px] text-[#99A0AE] mb-4">
                  Search for a product above and click "Add to Bill" to get started.
                </p>
                <button
                  type="button"
                  onClick={() => setShowQuickItemDrawer(true)}
                  className="flex items-center gap-2 px-5 py-2 bg-[#0085FF] text-white text-[13px] font-semibold rounded-lg hover:bg-blue-600 transition-colors"
                >
                  <PlusIcon className="w-4 h-4" />
                  Add New Product
                </button>
              </div>
            ) : (
              <>
                {/* Column headers */}
                <div className="grid grid-cols-12 gap-3 pb-2 border-b border-[#E1E4EA] text-[11px] font-semibold text-[#525866] uppercase tracking-wide">
                  <div className="col-span-3">Product Name</div>
                  <div className="col-span-2 text-center">Quantity</div>
                  <div className="col-span-2 text-right">Unit Price</div>
                  <div className="col-span-1 text-center">GST %</div>
                  <div className="col-span-2 text-center">Discount</div>
                  <div className="col-span-2 text-right">Total</div>
                </div>

                {/* Item rows */}
                <div className="mt-2">
                  {form.items.filter((it) => it.name || it._id).map((item) => {
                    const realIndex = form.items.indexOf(item);
                    const rowAmt = lineTotal(item) - itemDiscountAmount(item);
                    return (
                      <div key={realIndex} className="group/row border-b border-[#F0F1F3] last:border-b-0 py-3">
                        <div className="grid grid-cols-12 gap-3 items-center">
                          {/* Product name */}
                          <div className="col-span-3 min-w-0">
                            <input
                              type="text"
                              value={item.name || ""}
                              onChange={(e) => updateItem(realIndex, { name: e.target.value })}
                              placeholder="Product name"
                              className="w-full text-[13px] font-medium text-[#1F2937] bg-transparent focus:outline-none focus:bg-[#F8F9FB] rounded px-1 py-1 transition-colors"
                            />
                          </div>
                          {/* Qty */}
                          <div className="col-span-2">
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => updateItem(realIndex, { quantity: e.target.value })}
                              onWheel={(e) => e.target.blur()}
                              placeholder="1"
                              className="w-full text-center text-[13px] border border-[#E1E4EA] rounded-lg py-1.5 bg-[#F8F9FB] focus:bg-white focus:outline-none focus:border-[#0085FF] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </div>
                          {/* Unit Price */}
                          <div className="col-span-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.rate}
                              onChange={(e) => updateItem(realIndex, { rate: e.target.value })}
                              onWheel={(e) => e.target.blur()}
                              placeholder="0.00"
                              className="w-full text-right text-[13px] border border-[#E1E4EA] rounded-lg py-1.5 px-2 bg-[#F8F9FB] focus:bg-white focus:outline-none focus:border-[#0085FF] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </div>
                          {/* GST % */}
                          <div className="col-span-1">
                            <select
                              value={item.gstRate ?? 0}
                              onChange={(e) => updateItem(realIndex, { gstRate: parseFloat(e.target.value) })}
                              className="w-full text-center text-[13px] border border-[#E1E4EA] rounded-lg py-1.5 bg-[#F8F9FB] focus:bg-white focus:outline-none focus:border-[#0085FF] cursor-pointer"
                            >
                              <option value={0}>0%</option>
                              <option value={5}>5%</option>
                              <option value={12}>12%</option>
                              <option value={18}>18%</option>
                              <option value={28}>28%</option>
                            </select>
                          </div>
                          {/* Discount */}
                          <div className="col-span-2">
                            <div className="flex items-center border border-[#E1E4EA] rounded-lg bg-[#F8F9FB] focus-within:bg-white focus-within:border-[#0085FF] overflow-hidden">
                              <input
                                type="number"
                                min="0"
                                step={item.discountType === "percentage" ? "0.1" : "0.01"}
                                value={item.discount}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  const parsed = parseFloat(raw) || 0;
                                  const base = lineTotal(item);
                                  let clamped = raw;
                                  if (item.discountType === "amount" && parsed > base) { clamped = base; toast.error("Item discount cannot exceed item total."); }
                                  else if (item.discountType === "percentage" && parsed > 100) { clamped = 100; toast.error("Percentage discount cannot exceed 100%."); }
                                  updateItem(realIndex, { discount: clamped });
                                }}
                                onWheel={(e) => e.target.blur()}
                                placeholder="0"
                                className="flex-1 min-w-0 w-0 text-center text-[13px] py-1.5 px-2 bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                              <select
                                value={item.discountType}
                                onChange={(e) => updateItem(realIndex, { discountType: e.target.value })}
                                className="text-[11px] font-semibold border-l border-[#E1E4EA] bg-[#F0F1F3] px-1.5 py-1.5 focus:outline-none cursor-pointer flex-shrink-0"
                              >
                                <option value="amount">₹</option>
                                <option value="percentage">%</option>
                              </select>
                            </div>
                          </div>
                          {/* Total + Delete */}
                          <div className="col-span-2 flex items-center justify-end gap-2">
                            <span className="text-[13px] font-semibold text-[#1F2937] tabular-nums whitespace-nowrap">
                              {money(rowAmt)}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeItem(realIndex)}
                              className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-[#C1C9D2] hover:text-red-500 transition-colors"
                            >
                              <DeleteIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Expandable details: HSN, GST Rate (tax only), Description */}
                        <details className="mt-1 group/d">
                          <summary className="text-[11px] font-semibold text-[#0085FF] cursor-pointer list-none flex items-center gap-1 w-max select-none py-0.5">
                            <ChevronRight className="w-3 h-3 transition-transform group-open/d:rotate-90" />
                            More Details
                          </summary>
                          <div className="pt-2 pb-1">
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-medium text-[#525866]">Description</label>
                              <textarea
                                rows={2}
                                placeholder="Item description…"
                                value={item.description}
                                onChange={(e) => updateItem(realIndex, { description: e.target.value })}
                                className="w-full resize-none text-[12px] text-[#525866] border-b border-[#E1E4EA] px-1 py-1 focus:outline-none focus:border-[#0085FF] bg-transparent"
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

          {/* Notes / Terms / Signature / Summary — shared by every document
              type (including quotation, which used to get its own
              swipe-style accordion layout here; that's retired so quotation
              matches Invoice/Proforma/Challan exactly). */}
          <div className="grid grid-cols-1 @2xl:grid-cols-2 gap-x-6 gap-y-2 w-full mt-3">
            <div className="flex flex-col">
              <div className="flex items-center justify-between gap-2">
                <SectionHeader number={sectionNo.notes} title="Notes" />
                <OpenNotesTermsButton
                  label="Add Notes"
                  onClick={() => setNotesDrawer("notes")}
                />
              </div>
              <textarea
                rows={4}
                value={form.notes}
                onChange={(e) => setField("notes", e.target.value)}
                placeholder={`A short message to the customer, e.g. "Thank you for the business!"`}
                className="w-full px-3.5 py-2.5 rounded-2xl border border-[#1F2937]/10 text-[13px] text-[#1F2937] placeholder:text-[#1F2937] placeholder:opacity-50 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all resize-y"
              />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center justify-between gap-2">
                <SectionHeader
                  number={sectionNo.terms}
                  title="Terms and Conditions"
                />
                <OpenNotesTermsButton
                  label="Add Terms"
                  onClick={() => setNotesDrawer("terms")}
                />
              </div>
              <textarea
                rows={4}
                value={form.terms}
                onChange={(e) => setField("terms", e.target.value)}
                placeholder={"1. Goods once sold cannot be taken back or exchanged.\n2. Subject to local jurisdiction."}
                className="w-full px-3.5 py-2.5 rounded-2xl border border-[#1F2937]/10 text-[13px] text-[#1F2937] placeholder:text-[#1F2937] placeholder:opacity-50 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all resize-y"
              />
            </div>
          </div>

          <SectionHeader number={sectionNo.bank} title="Bank Account" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 w-full">
            <div className="flex flex-col gap-1">
              <FieldLabel>Select Bank</FieldLabel>
              <BankSelect
                banks={banks}
                value={form.bankDetails || ""}
                onChange={(id) => setField("bankDetails", id)}
              />
              <p className="text-[11px] text-[#99A0AE]">
                {banks.length === 0
                  ? "No bank accounts yet — add them in Settings → Bank Details."
                  : `The default prints on every ${docName.toLowerCase()} unless you pick another here.`}
              </p>
            </div>
            {/* Only Invoice documents carry a qrNote field on the backend —
                showing this for Quotation/Performa/Delivery Challan would let
                the user type into a field that silently never saves. */}
            {type === "tax" && (
              <div className="flex flex-col gap-1">
                <FieldLabel>Payment Note (QR)</FieldLabel>
                <input
                  type="text"
                  value={form.qrNote}
                  onChange={(e) => setField("qrNote", e.target.value)}
                  placeholder={`${docName} ${form.invoiceNumber || "..."}`}
                  maxLength={50}
                  className="h-[38px] px-3.5 rounded-full border border-[#1F2937]/10 text-[13px] text-[#1F2937] placeholder:text-[#1F2937] placeholder:opacity-50 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                />
                <p className="text-[11px] text-[#99A0AE]">
                  Shown as the payment note when the QR is scanned. Leave blank to use "{docName} {form.invoiceNumber || "..."}" automatically.
                </p>
              </div>
            )}
          </div>

          <SectionHeader number={sectionNo.signature} title="Signature" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 w-full">
            <div className="flex flex-col gap-1">
              <FieldLabel>Signature</FieldLabel>
              <div className="relative flex items-center h-[38px] rounded-full border border-[#1F2937]/10 focus-within:ring-1 focus-within:ring-blue-500 overflow-hidden transition-all">
                <select
                  value={form.signature}
                  onChange={(e) => setField("signature", e.target.value)}
                  disabled={signaturesLoading}
                  className="flex-1 min-w-0 h-full pl-3.5 pr-8 text-[13px] text-[#1F2937] bg-transparent appearance-none focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
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
              <p className="text-xs text-[#99A0AE]">
                {signaturesLoading
                  ? "Loading signatures…"
                  : savedSignatures.length === 0
                    ? "No saved signatures yet — add them in Settings → Document Settings → Signatures."
                    : "The default is applied to every document unless you pick another here."}
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <FieldLabel>Preview</FieldLabel>
              <div className="h-[72px] flex items-center justify-center rounded-lg border border-dashed border-[#E1E4EA] bg-[#FAFBFC]">
                {form.signature ? (
                  <img
                    src={form.signature}
                    alt="Selected signature"
                    className="max-h-16 max-w-full object-contain"
                  />
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs text-[#99A0AE]">
                    <PenLine className="w-3.5 h-3.5" />
                    No signature selected
                  </span>
                )}
              </div>
            </div>
          </div>

          <SectionHeader number={sectionNo.summary} title={`${docName} Summary`} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 w-full">
            <div className="flex flex-col gap-1">
              <FieldLabel>{docName} Discount</FieldLabel>
              <div className="flex items-center gap-2">
              <div className="relative flex items-center flex-1 min-w-0 h-[38px] rounded-full border border-[#1F2937]/10 focus-within:ring-1 focus-within:ring-blue-500 overflow-hidden transition-all">
                <input
                  type="number"
                  min="0"
                  step={form.discount.type === "percentage" ? "0.1" : "0.01"}
                  value={form.discount.value}
                  onWheel={(e) => e.target.blur()}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const parsed = parseFloat(raw) || 0;
                    let clamped = raw;
                    if (
                      form.discount.type === "percentage" &&
                      parsed > 100
                    ) {
                      clamped = 100;
                      toast.error("Percentage discount cannot exceed 100%.");
                    } else if (
                      form.discount.type === "fixed" &&
                      parsed > afterItemDiscounts
                    ) {
                      clamped = afterItemDiscounts;
                      toast.error(
                        "Invoice discount cannot exceed subtotal after item discounts."
                      );
                    }
                    setField("discount", { ...form.discount, value: clamped });
                  }}
                  className="flex-1 min-w-0 h-full px-3.5 text-[13px] text-[#1F2937] focus:outline-none"
                />
                <div className="flex items-stretch h-full">
                  <span className="w-7 flex items-center justify-center text-[13px] font-semibold text-[#0085FF]">
                    {form.discount.type === "percentage" ? "%" : "₹"}
                  </span>
                  <div className="flex flex-col justify-center">
                    {[ChevronUp, ChevronDown].map((Icon, i) => (
                      <button
                        key={i}
                        type="button"
                        title="Switch between ₹ and %"
                        onClick={() =>
                          setField("discount", {
                            ...form.discount,
                            type:
                              form.discount.type === "percentage"
                                ? "fixed"
                                : "percentage",
                          })
                        }
                        className={`w-5 h-2.5 flex items-center justify-center text-gray-500 hover:bg-gray-100 rounded transition-colors ${i === 1 ? "-mt-0.5" : ""}`}
                      >
                        <Icon className="w-3 h-3" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
                <div className="w-10 flex-shrink-0" aria-hidden="true" />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="space-y-1 text-[13px]">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span className="font-medium text-[#1F2937]">
                    {money(subtotal)}
                  </span>
                </div>
                <div className="flex justify-between text-red-500">
                  <span>Item Discounts</span>
                  <span>- {money(itemDiscountsTotal)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>After Item Discounts</span>
                  <span className="font-medium text-[#1F2937]">
                    {money(afterItemDiscounts)}
                  </span>
                </div>
                <div className="flex justify-between text-red-500">
                  <span>Invoice Discount</span>
                  <span>- {money(invoiceDiscountAmount)}</span>
                </div>
                {taxDetails && (
                  gstSplit.isInterState ? (
                    <div className="flex justify-between text-gray-600">
                      <span>IGST</span>
                      <span className="font-medium text-[#1F2937]">
                        {money(gstSplit.igst)}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between text-gray-600">
                        <span>CGST</span>
                        <span className="font-medium text-[#1F2937]">
                          {money(gstSplit.cgst)}
                        </span>
                      </div>
                      <div className="flex justify-between text-gray-600">
                        <span>SGST</span>
                        <span className="font-medium text-[#1F2937]">
                          {money(gstSplit.sgst)}
                        </span>
                      </div>
                    </>
                  )
                )}
                {/* Round off toggle — after GST so it adjusts the post-tax total */}
                <div className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <label className="relative cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={form.isRoundOff}
                        onChange={(e) => setForm((p) => ({ ...p, isRoundOff: e.target.checked }))}
                      />
                      <div className="w-7 h-4 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600" />
                    </label>
                    <span className="text-[12px] text-gray-600">Round Off</span>
                  </div>
                  {form.isRoundOff && (
                    <span className={`text-[12px] font-medium ${roundOffAmount > 0 ? "text-green-600" : roundOffAmount < 0 ? "text-red-500" : "text-gray-500"}`}>
                      {roundOffAmount > 0 ? "+" : ""}{money(roundOffAmount)}
                    </span>
                  )}
                </div>
                <div className="flex justify-between items-center px-2.5 py-1.5 rounded-lg bg-[#F0F6FF]">
                  <span className="font-bold text-[#0085FF]">Final Total</span>
                  <span className="font-bold text-[#0085FF]">
                    {money(finalTotal)}
                  </span>
                </div>
                <div className="pt-1">
                  <p className="text-xs text-[#99A0AE]">Amount in Words</p>
                  <p className="text-xs font-medium text-[#525866]">
                    {numberToWords(finalTotal)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Running total + primary actions, pinned to the bottom of the form
              column. It sticks inside this scroll container rather than being
              fixed to the viewport, so it stays inside the form even when the
              preview is showing and the split is dragged. */}
          {/* Sized to its contents and centred, so it reads as a floating bar
              over the form rather than another full-width section. The wrapper
              ignores pointer events so the empty space either side of the pill
              doesn't block the fields underneath it. */}
          <div className="sticky bottom-0 z-20 w-full pt-3 pb-1 flex justify-center pointer-events-none">
            <div className="pointer-events-auto flex w-full max-w-2xl items-center justify-between gap-5 rounded-2xl border border-[#E1E4EA] bg-white/95 backdrop-blur-sm pl-6 pr-2.5 py-2.5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.22)]">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold tracking-wide text-[#99A0AE] uppercase leading-none">
                  Total
                </p>
                <p className="text-[18px] font-bold text-[#1F2937] leading-tight truncate">
                  {money(finalTotal)}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="h-9 px-4 flex items-center gap-1.5 bg-white border border-[#E1E4EA] rounded-lg text-[13px] font-medium text-[#1F2937] hover:bg-gray-50 transition-colors whitespace-nowrap"
                >
                  <Printer className="w-3.5 h-3.5 text-[#525866]" />
                  Print
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="h-9 px-4 flex items-center gap-1.5 rounded-lg bg-[#0085FF] hover:bg-blue-600 text-white text-[13px] font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {submitting
                    ? isEditing
                      ? "Updating..."
                      : "Creating..."
                    : isEditing
                      ? `Update ${docName}`
                      : `Create ${docName}`}
                  {!submitting && <ChevronRight className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
          </>
          )}
          </div>
        </div>

        <QuickItemDrawer
          isOpen={showQuickItemDrawer}
          onClose={() => setShowQuickItemDrawer(false)}
          onSaved={async () => {
            try {
              const res = await API.get("/items?search=&includeVariants=true");
              const flattened = (res.data || []).filter((i) => i.isActive).flatMap((item) => {
                const variants = item.variants || [];
                if (variants.length > 0) {
                  return variants.map((v) => ({
                    _id: v._id, displayName: `${item.name} - ${v.name}`, name: v.name,
                    description: v.description || item.description || "", sellingPrice: v.sellingPrice || item.sellingPrice,
                    hsnSac: v.hsnSac || item.hsnSac || "", isVariant: true, parentItemId: item._id,
                    discount: v.discount || item.discount,
                  }));
                }
                return [{ _id: item._id, displayName: item.name, name: item.name, description: item.description || "",
                  sellingPrice: item.sellingPrice, hsnSac: item.hsnSac || "", isVariant: false, parentItemId: null, discount: item.discount }];
              });
              setCatalogue(flattened);
            } catch (err) { console.error(err); }
            setShowQuickItemDrawer(false);
          }}
        />

        {/* Gap reserved for the absolute resizer line (rendered at panel level). */}
        {!hidePreview && <div className="hidden lg:block w-1.5 flex-shrink-0" />}

        {/* Right: preview. Frame 1351649638 — stretches to fill whatever's left beside the form panel.
            Hidden outright on mobile regardless of the hidePreview toggle — there's no room for a
            side-by-side live preview on a phone-width screen. */}
        <div
          className={`relative w-full lg:flex-1 min-w-0 bg-white p-3 lg:pl-6 flex-col items-start gap-4 self-stretch hidden ${hidePreview ? "lg:hidden" : "lg:flex"}`}
        >
          {/* Live invoice preview — mirrors the structure of the downloaded /
              printed document and reflects the form's changes in real time. */}
          <div
            ref={previewAreaRef}
            className="group w-full lg:flex-1 lg:min-h-0 lg:self-stretch lg:overflow-y-auto overflow-x-hidden relative p-1.5"
          >
            {/* Full-view button — appears on hover over the preview and opens
                the same sheet at full size, i.e. the page as it will print.
                Offered while creating too: the preview is driven by form
                state, so it doesn't need a saved document to render. */}
            <button
              type="button"
              onClick={() => setShowFullView(true)}
              title="Full view"
              className="absolute top-3 right-3 z-10 flex items-center gap-1.5 h-8 px-3 rounded-full bg-[#1F2937] text-white text-xs font-medium shadow-lg opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
            >
              <EyeIcon className="w-3.5 h-3.5" />
              Full view
            </button>
            {/* Fixed-width sheet scaled to fit — resizing zooms the invoice
                instead of reflowing it. Outer div reserves the scaled height. */}
            <div style={{ height: sheetHeight || undefined }}>
              <div
                ref={sheetRef}
                style={{
                  width: PREVIEW_BASE_W,
                  transform: `scale(${previewScale})`,
                  transformOrigin: "top left",
                }}
              >
                <InvoiceLivePreview
                  form={form}
                  orgDetails={orgDetails}
                  bankDetails={effectiveBankDetails}
                  type={type}
                  template={previewTemplate}
                  supportsTax={supportsTax}
                  invoiceNumber={previewDocNumber}
                  dealName={customerNameForDeal(form.deal)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Full view — the same live preview at full size, driven by the current
          (possibly unsaved) form state, so it always shows what's on screen. */}
      {/* Opened by the "Add Notes" / "Add Terms" links beside those sections.
          Writes to the same form fields the inline boxes use, so the preview
          updates as you type either way. */}
      <NotesTermsDrawer
        isOpen={notesDrawer !== null}
        focus={notesDrawer || "notes"}
        onClose={() => setNotesDrawer(null)}
        type={type}
        docName={docName}
        onApplyNotes={(v) => setField("notes", v)}
        onApplyTerms={(v) => setField("terms", v)}
      />

      {/* Opened by "Change Template" above — edits the organization-wide
          choice, so closing it refreshes orgTemplate and the preview restyles. */}
      <TemplateDrawer
        isOpen={showTemplates}
        onClose={() => setShowTemplates(false)}
        type={type}
        docLabel={docName}
      />

      {showFullView &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100002] flex flex-col"
            onClick={() => setShowFullView(false)}
          >
            {/* No chrome around the sheet — just the page and a close
                control above its corner. */}
            <div className="flex-1 min-h-0 overflow-auto p-6">
              <div className="relative mx-auto" style={{ width: PREVIEW_BASE_W }}>
                {/* Centred on the sheet's top-right corner, so it overlaps
                    the page diagonally without covering the header block. */}
                <button
                  type="button"
                  onClick={() => setShowFullView(false)}
                  title="Close"
                  aria-label="Close preview"
                  className="absolute -top-3 -right-3 z-10 w-6 h-6 flex items-center justify-center rounded-full bg-white border border-[#E1E4EA] text-gray-600 shadow-md hover:bg-gray-100 hover:text-gray-900 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
                <div
                  className="bg-white shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                >
                <InvoiceLivePreview
                  form={form}
                  orgDetails={orgDetails}
                  bankDetails={effectiveBankDetails}
                  type={type}
                  template={previewTemplate}
                  supportsTax={supportsTax}
                  invoiceNumber={previewDocNumber}
                  dealName={customerNameForDeal(form.deal)}
                />
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      <InsufficientStockDialog
        isOpen={!!stockErrorMessage}
        message={stockErrorMessage}
        onClose={() => setStockErrorMessage(null)}
      />
    </div>
  );
};

export { CreateInvoicePanel };

export default InvoiceForm;
