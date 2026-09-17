import DeleteIcon from "../common/DeleteIcon";
import { resolveField, resolveDiscount, resolveMaxDiscountPercent } from "../../utils/variantResolve";
import PdfIcon from "../common/PdfIcon";
import PlusIcon from "../common/PlusIcon";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { formatNumberToIndian, formatNumberFixed } from "../../utils/numberFormatter";
import {
  IndianRupeeIcon,
  X,
  Eye,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Minimize2,
  Printer,
  Inbox,
} from "lucide-react";
import API from "../../services/api";
import QuickItemDrawer from "../item/QuickItemDrawer";
import TemplateDrawer from "./TemplateDrawer";
import BankSelect from "./BankSelect";
import { AddressFieldsGroup, emptyAddress, isAddressEmpty, SectionHeader } from "../invoice/formPrimitives";
import AddressBookDrawer from "./AddressBookDrawer";
import QuickDealForm from "../deal/QuickDealForm";
import SearchableDropdown from "../contact/SearchableDropdown";
import InsufficientStockDialog from "../common/InsufficientStockDialog";
import SuccessModal from "../common/SuccessModal";
import toast from "react-hot-toast";
import { computeDocument, GST_RATES } from "../../../../shared/documentTemplates";
import { PREDEFINED_NOTES, PREDEFINED_TERMS } from "../../utils/documentDefaultText";

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
  // The quick-add bar passes false here — it's for finding an existing
  // product only; creating a new one already has its own dedicated
  // "+ Add new Product?" link, so offering it a second time in this
  // dropdown too was redundant and confusing.
  allowAddNew = true,
  // Per-row pickers (true) keep showing the picked item's name in the box,
  // since the box IS that row's current value. The quick-add bar (false)
  // is a one-shot "find something to add" control, not a persistent value —
  // it should snap back to the empty placeholder the instant something's
  // picked, with the pending pick surfaced elsewhere (a chip) instead.
  showSelectedValue = true,
  // Ids to hide from the results — the quick-add bar passes the ids of
  // items already sitting in the bill, so an already-added product can't
  // be picked (and silently duplicated) again from this dropdown.
  excludeIds,
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

  // Whenever the parent clears the selection (e.g. after "Add to Bill"
  // resets quickAddItem to null), make sure any leftover typed text clears
  // with it — otherwise the box could keep showing stale text instead of
  // reverting to the placeholder.
  useEffect(() => {
    if (!value) setSearchTerm("");
  }, [value]);

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
      // Copied from the catalog product at pick time, same as rate/hsn —
      // previously dropped entirely, so a tax invoice line item never
      // carried its product's own GST rate.
      gstRate: item.gstRate ?? 0,
      taxInclusive: !!item.taxInclusive,
      isVariant: item.isVariant || false,
      parentItemId: item.parentItemId || null,
      // The product's own default discount (set in QuickItemDrawer's "More
      // Details" -> Discount) — previously always started at 0, ignoring
      // whatever default the product was configured with.
      discountType: item.discount?.type || "amount",
      discount: item.discount?.value || 0,
    });
    setIsOpen(false);
    setSearchTerm(item.displayName);
  };

  const handleInputFocus = () => {
    setIsOpen(true);
    if (items.length === 0) {
      setLoading(true);
      Promise.resolve(fetchItems()).finally(() => setLoading(false));
    }
  };

  const selectedItem = showSelectedValue
    ? items.find((item) => item._id === value?._id)
    : null;

  const visibleItems = excludeIds?.length
    ? items.filter((item) => !excludeIds.includes(item._id))
    : items;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Same static box shape as the Companies.jsx search bar (h-10,
          rounded-full, #E1E4EA border, #0085FF focus) — without its
          expand/collapse animation, which doesn't apply here. */}
      <div className="relative h-[38px] flex items-center border border-[#1F2937]/10 rounded-full bg-white transition-all focus-within:ring-1 focus-within:ring-blue-500 overflow-hidden">
        <div className="pl-3.5 pr-2 flex items-center justify-center flex-shrink-0">
          <SearchIcon className="w-4 h-4 text-[#525866]" />
        </div>

        <input
          ref={inputRef}
          type="text"
          placeholder="Search items or variants..."
          value={searchTerm}
          onChange={handleSearchChange}
          onFocus={handleInputFocus}
          className="w-full h-full bg-transparent text-[13px] text-[#1F2937] focus:outline-none pr-4 min-w-[100px]"
          aria-label="Search items or variants"
        />
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-slate-500">Loading...</div>
          ) : (
            <>
              {allowAddNew && (
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
                </>
              )}
              {visibleItems.length === 0 ? (
                <div className="p-4 text-center text-slate-500">
                  {searchTerm
                    ? "No matching products found"
                    : items.length > 0
                      ? "Already added to this bill"
                      : "No products available yet"}
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto">
                  {visibleItems.map((item) => {
                    const outOfStock =
                      item.type === "product" && Number(item.stock) <= 0;
                    return (
                    <button
                      key={item._id}
                      type="button"
                      disabled={outOfStock}
                      onClick={() => handleItemSelect(item)}
                      className={`w-full text-left p-3 transition-colors border-b border-slate-50 last:border-b-0 ${outOfStock
                        ? "opacity-50 cursor-not-allowed"
                        : "hover:bg-slate-50"
                        }`}
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
                              <span
                                className={`ml-1 font-medium ${outOfStock ? "text-red-600" : "text-slate-600"
                                  }`}
                              >
                                • {outOfStock ? "Out of stock" : `Stock: ${item.stock ?? 0}`}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                    );
                  })}
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

const InvoiceFormFull = ({
  deals,
  isOpen,
  onClose,
  fetchData,
  editingInvoice,
  onPreview,
  // Optional. Supplied when this screen was opened as the "full width" mode of
  // the split-view invoice panel — renders a control to go back to it.
  onExitFullWidth,
  // Snapshot of the split-view panel's in-progress form, handed off the
  // moment the user expands to full width — takes precedence over
  // editingInvoice/conversionData so switching views never drops unsaved
  // edits. Passed back the same way when collapsing to split view again.
  formOverride = null,
  conversionData = null,
  defaultDueDateDays = null,
  defaultNotesByType = {},
  defaultTermsByType = {},
  defaultNotesFlat = "",
  defaultTermsFlat = "",
  documentTypeSettings = {},
  // --- Optional, for callers that already imply the customer (Company Profile / Deal page).
  // Accounting passes none of these, so its behaviour is unchanged. ---
  // A deal to select on a NEW invoice, applied through the same handler as a manual pick.
  preselectDealId = null,
  // Company preselected in "+ Create Deal", and the company this flow is scoped to: a deal
  // created for any other company is not added to or selected on this invoice.
  initialCompanyId = null,
  // Reports a deal created here back to the caller so its own deal list stays current.
  onDealCreated,
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
    reference: "",
    receiverGSTIN: "",
    invoicePrefix: documentTypeSettings.invoice?.prefix || "INV-",
    invoiceSuffix: documentTypeSettings.invoice?.suffix || "",
    invoiceNumber: "",
    billingAddress: emptyAddress(),
    shippingAddress: emptyAddress(),
    sameAsBilling: true,
    // Starts empty so the Products & Services section shows the "search
    // existing products to add to this list" empty state instead of an
    // already-open blank row — matches the reference layout, where the
    // table only gains rows once something's actually added.
    items: [],
    discount: { type: "fixed", value: 0 },
    amount: 0,
    status: "Draft",
    style: "Regular",
    isTaxInvoice: true,
    gstRate: 18,
    transactionType: "intra",
    isRoundOff: false,
    hideTotals: false,
    notes: defaultNotesForNew,
    terms: defaultTermsForNew,
    attachments: [],
    bankDetails: "",
    // UPI QR payment note ("tn") — left blank so it defaults to
    // "Invoice <number>" (see buildUpiUri); editable so the user can
    // override it.
    qrNote: "",
    signature: "",
  });
  const [isSliding, setIsSliding] = useState(false);
  const [shouldRender, setShouldRender] = useState(true);
  const [showItemForm, setShowItemForm] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [nextNumberPreview, setNextNumberPreview] = useState(null);
  const [quickAddItem, setQuickAddItem] = useState(null);
  const [quickAddQty, setQuickAddQty] = useState(1);
  const [savedSignatures, setSavedSignatures] = useState([]);
  const [signaturesLoading, setSignaturesLoading] = useState(false);
  const [showQuickDealForm, setShowQuickDealForm] = useState(false);
  const [localDeals, setLocalDeals] = useState(deals);
  const [sellerState, setSellerState] = useState("");
  // "billing" | "shipping" | null — which field group opened the saved
  // address book (AddressBookDrawer).
  const [addressDrawer, setAddressDrawer] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stockErrorMessage, setStockErrorMessage] = useState(null);
  const [items, setItems] = useState([]);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const formRef = useRef(null);
  // Inline validation — mirrors QuickCompanyForm.jsx's pattern: per-field
  // error flags cleared as the user fixes them, plus refs so an invalid
  // submit can scroll straight to the topmost offending field instead of
  // relying on native browser :invalid styling/scroll. Deal and Invoice
  // Date are the only two fields this form actually enforced as required
  // before (via toast.error checks in submitInvoice) — billing/shipping
  // address were never required here, so no error state is added for them.
  const [dealError, setDealError] = useState(false);
  const [dateError, setDateError] = useState(false);
  const dealFieldRef = useRef(null);
  const dateInputRef = useRef(null);

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

  // GSTIN validation regex
  const gstinRegex =
    /^[0-9]{2}[A-Z0-9]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Z]{1}[0-9A-Z]{1}$/;

  // Fetch items and variants
  const fetchItems = useCallback(async (search = "") => {
    try {
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
              // Variant's own rate falls back to the parent item's, same as
              // sellingPrice/hsnSac above.
              gstRate: variant.gstRate ?? item.gstRate ?? 0,
              taxInclusive: !!(variant.taxInclusive ?? item.taxInclusive),
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
              hsnSac: item.hsnSac || "",
              gstRate: item.gstRate ?? 0,
              taxInclusive: !!item.taxInclusive,
              discount: item.discount || { type: "percentage", value: 0 },
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
      API.get("/branding").then(r => setSellerState((r.data?.state || "").trim().toLowerCase())).catch(() => {});
    } else {
      setIsSliding(false);
      setTimeout(() => setShouldRender(false), 300);
    }
  }, [isOpen, fetchItems, fetchCompanies, fetchContacts, deals]);

  useEffect(() => {
    // A handoff from the split-view panel is already in this component's own
    // form shape (not a raw saved document), so it's merged straight onto
    // the fresh defaults instead of going through the raw-document mapping
    // below — and takes priority since it reflects edits made after the
    // document was loaded, which editingInvoice/conversionData don't know about.
    if (formOverride) {
      setForm((prev) => ({ ...prev, ...formOverride }));
      setHasUnsavedChanges(false);
      return;
    }
    const sourceData = editingInvoice || conversionData;
    if (sourceData) {
      setForm({
        deal: sourceData.deal?._id || sourceData.deal || "",
        date: sourceData.date ? sourceData.date.slice(0, 10) : "",
        dueDate: sourceData.dueDate
          ? sourceData.dueDate.slice(0, 10)
          : "",
        receiverGSTIN: sourceData.receiverGSTIN || "",
        reference: sourceData.reference || "",
        // Only an actual edit (editingInvoice) keeps the source's own
        // number — conversionData (Convert or Duplicate) always starts
        // blank so a fresh number gets auto-generated, instead of Duplicate
        // silently copying the source invoice's own number onto the new one.
        invoicePrefix: (editingInvoice && sourceData.invoicePrefix) || documentTypeSettings.invoice?.prefix || "INV-",
        invoiceSuffix: (editingInvoice && sourceData.invoiceSuffix) || documentTypeSettings.invoice?.suffix || "",
        invoiceNumber: editingInvoice ? (sourceData.invoiceNumber || "") : "",
        billingAddress: { ...emptyAddress(), ...(sourceData.billingAddress || {}) },
        shippingAddress: { ...emptyAddress(), ...(sourceData.shippingAddress || {}) },
        sameAsBilling:
          isAddressEmpty(sourceData.shippingAddress) ||
          JSON.stringify({ ...emptyAddress(), ...(sourceData.billingAddress || {}) }) ===
            JSON.stringify({ ...emptyAddress(), ...(sourceData.shippingAddress || {}) }),
        items: (sourceData.items || []).map((item) => ({
          // For a variant line, the local row identity is the variant's own
          // id (variantId) — itemId is the parent Item's id. Falls back to
          // itemId for invoices saved before variantId existed on the schema.
          _id: (item.isVariant ? item.variantId : item.itemId) || item.itemId || null,
          name: item.name || "",
          description: item.description || "",
          rate: item.rate || "",
          quantity: item.quantity || 1,
          hsn: item.hsn || "",
          gstRate: item.gstRate || 0,
          taxInclusive: !!item.taxInclusive,
          isVariant: item.isVariant || false,
          parentItemId: item.parentItemId || null,
          discountType: item.discountType || "amount",
          discount: item.discount || 0,
        })),
        discount: sourceData.discount || { type: "fixed", value: 0 },
        amount: sourceData.amount || 0,
        status: sourceData.status || "Draft",
        style: sourceData.style || "Regular",
        isRoundOff: sourceData.isRoundOff !== undefined ? sourceData.isRoundOff : false,
        hideTotals: sourceData.hideTotals || false,
        isTaxInvoice: true,
        transactionType: sourceData.transactionType || "intra",
        notes: sourceData.notes || "",
        terms: sourceData.terms || "",
        attachments: sourceData.attachments || [],
        bankDetails: sourceData.bankDetails?._id || sourceData.bankDetails || "",
        // Same rule as invoiceNumber above: only an actual edit keeps the
        // source's note — Convert/Duplicate starts blank since a custom note
        // almost always references the old invoice's own number.
        qrNote: editingInvoice ? (sourceData.qrNote || "") : "",
        signature: sourceData.signature || "",
      });
      setHasUnsavedChanges(false);
    } else {
      setForm({
        deal: "",
        date: "",
        dueDate: "",
        receiverGSTIN: "",
        reference: "",
        invoicePrefix: documentTypeSettings.invoice?.prefix || "INV-",
        invoiceSuffix: documentTypeSettings.invoice?.suffix || "",
        invoiceNumber: "",
        billingAddress: emptyAddress(),
        shippingAddress: emptyAddress(),
        sameAsBilling: true,
        items: [],
        discount: { type: "fixed", value: 0 },
        amount: 0,
        status: "Draft",
        style: "Regular",
        isTaxInvoice: true,
        gstRate: 18,
        transactionType: "intra",
        notes: defaultNotesForNew,
        terms: defaultTermsForNew,
        attachments: [],
        bankDetails: "",
        qrNote: "",
        signature: "",
      });
      setHasUnsavedChanges(false);
    }
  }, [editingInvoice, conversionData, formOverride]);

  // Same default-signature behavior as the split-view Invoice panel
  // (InvoiceForm.jsx): fall back to the org's default signature whenever
  // this invoice isn't already pointing at one of the saved signatures —
  // a blank, stale, or never-set signature resolves to the default rather
  // than nothing. A invoice that stored a still-valid custom signature
  // keeps it.
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

    loadSignatures();
  }, []);

  // Bank accounts saved under Settings → Bank Details. A brand-new invoice
  // adopts the org's default; an edit keeps whatever account it was saved
  // with. The chosen id rides on the payload as `bankDetails`.
  const [banks, setBanks] = useState([]);
  useEffect(() => {
    const loadBanks = async () => {
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
      } catch (error) {
        console.error("Failed to load bank accounts", error);
        setBanks([]);
      }
    };
    loadBanks();
  }, [editingInvoice]);

  // Live preview of the number this invoice will actually get on save (from
  // the same persistent per-org counter resolveDocumentNumber uses) — shown
  // as the number box's placeholder instead of a static "1" so it stays in
  // sync with the split-view panel and with however many invoices already
  // exist.
  useEffect(() => {
    const loadNextNumberPreview = async () => {
      try {
        const res = await API.get("/document-settings");
        setNextNumberPreview(res.data?.nextNumbers?.invoice || null);
      } catch (error) {
        console.error("Failed to load next invoice number preview", error);
      }
    };

    loadNextNumberPreview();
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

  const calculateTotalAmount = useCallback((items, discount, gstRate = 18, transactionType = "intra") => {
    const subtotalAfterItemDiscounts =
      calculateSubtotalAfterItemDiscounts(items);
    const invoiceDiscountAmount = calculateInvoiceDiscountAmount(
      subtotalAfterItemDiscounts,
      discount
    );
    const netTaxable = subtotalAfterItemDiscounts - invoiceDiscountAmount;
    const totalTax = netTaxable * (gstRate / 100);
    return netTaxable + totalTax;
  }, []);

  const handleItemChange = (index, field, value) => {
    setForm((prev) => {
      const newItems = [...prev.items];
      let newValue = value;
      const item = newItems[index];

      if (field === "discount" || field === "discountType") {
        const rate = parseFloat(item.rate) || 0;
        const quantity = parseInt(item.quantity) || 0;
        const subtotal = rate * quantity;

        let activeDiscount = parseFloat(item.discount) || 0;
        let activeType = item.discountType;

        if (field === "discount") {
          // If value is empty, let them clear the input instead of forcing to 0
          if (value === "") {
            newValue = "";
            activeDiscount = 0;
          } else {
            activeDiscount = parseFloat(value) || 0;
            // Keep the exact string to allow typing decimals like "1."
            newValue = value; 
          }
        } else if (field === "discountType") {
          // conversion logic...
          if (value === "percentage" && activeType === "amount") {
            activeDiscount =
              subtotal > 0
                ? Math.round(Math.min(100, (activeDiscount / subtotal) * 100) * 100) / 100
                : 0;
          } else if (value === "amount" && activeType === "percentage") {
            activeDiscount = Math.round(((activeDiscount / 100) * subtotal) * 100) / 100;
          }
          activeType = value;
        }

        if (activeType === "amount" && activeDiscount > subtotal) {
          activeDiscount = subtotal;
          if (field === "discount") newValue = activeDiscount.toString();
          toast.error("Item discount cannot exceed item total price.");
        } else if (activeType === "percentage" && activeDiscount > 100) {
          activeDiscount = 100;
          if (field === "discount") newValue = "100";
          toast.error("Percentage discount cannot exceed 100%.");
        }

        if (field === "discountType") {
          newItems[index].discount = activeDiscount;
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
      const subtotalAfterItemDiscounts = calculateSubtotalAfterItemDiscounts(prev.items);
      const newDiscount = { ...prev.discount };

      if (field === "type") {
        // Convert the existing discount value to an equivalent amount under
        // the new type instead of reinterpreting the same raw number under
        // a different unit — e.g. a ₹500 discount switched to "%" used to
        // become "500%" (then get clamped down to 100%) instead of the
        // ~equivalent percentage of the subtotal.
        const oldValue = parseFloat(prev.discount.value) || 0;
        if (value === "percentage" && prev.discount.type === "fixed") {
          newDiscount.value =
            subtotalAfterItemDiscounts > 0
              ? Math.round(Math.min(100, (oldValue / subtotalAfterItemDiscounts) * 100) * 100) / 100
              : 0;
        } else if (value === "fixed" && prev.discount.type === "percentage") {
          newDiscount.value = Math.round(((oldValue / 100) * subtotalAfterItemDiscounts) * 100) / 100;
        }
        newDiscount.type = value;
      } else {
        newDiscount.value = value;
      }

      if (field === "value" || field === "type") {
        let activeValue = parseFloat(newDiscount.value) || 0;
        let activeType = newDiscount.type;

        if (activeType === "fixed" && activeValue > subtotalAfterItemDiscounts) {
          newDiscount.value = subtotalAfterItemDiscounts;
          toast.error("Invoice discount cannot exceed subtotal after item discounts.");
        } else if (activeType === "percentage" && activeValue > 100) {
          newDiscount.value = 100;
          toast.error("Percentage discount cannot exceed 100%.");
        }
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

  // Fires once QuickItemDrawer actually creates the product (POST /items
  // succeeded) — refreshes the picker's item list AND drops the new
  // product straight into the bill as a real row (name/price already
  // filled in from what was just entered), instead of leaving a blank row
  // behind for the quantity/price to be typed in separately.
  const handleProductCreated = (item) => {
    fetchItems();
    // Clear any pending pick left over in the quick-add bar from before the
    // drawer was opened — otherwise a stale chip/search text sticks around
    // even though the product just got added a different way.
    setQuickAddItem(null);
    setQuickAddQty(1);
    const newItem = {
      _id: item._id,
      name: item.name,
      description: item.description || "",
      rate: item.sellingPrice,
      quantity: 1,
      hsn: item.hsnSac || "",
      gstRate: item.gstRate ?? 0,
      taxInclusive: !!item.taxInclusive,
      isVariant: false,
      parentItemId: null,
      // Copy the product's own default discount, same as the search-select
      // path below — the quick-add path was previously hardcoding 0.
      discountType: item.discount?.type || "amount",
      discount: item.discount?.value || 0,
    };
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
    setHasUnsavedChanges(true);
  };

  // Quick-add bar above the item table: search a product, set its quantity,
  // "Add to Bill" drops it straight into form.items — separate from the
  // per-row inline search each existing row also has.
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
        amount: calculateTotalAmount(newItems, prev.discount),
      };
    });
    setQuickAddItem(null);
    setQuickAddQty(1);
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
    setShowQuickDealForm(false);
    // Scoped callers (initialCompanyId set) keep the invoice with that company: QuickDealForm
    // lets the company be changed, and a deal for another company is still created but is not
    // offered or selected here.
    const newDealCompanyId = newDeal?.company?._id || newDeal?.company || null;
    if (initialCompanyId && newDealCompanyId && String(newDealCompanyId) !== String(initialCompanyId)) {
      toast("Deal created for a different company, so it isn't available on this invoice.");
      return;
    }
    setLocalDeals((prev) => (prev.some((d) => d._id === newDeal._id) ? prev : [...prev, newDeal]));
    setForm((prev) => ({ ...prev, deal: newDeal._id }));
    setHasUnsavedChanges(true);
    onDealCreated?.(newDeal);
  };

  // Selecting a deal, whether picked by the user or preselected by the caller.
  // Switching the deal replaces the Receiver GSTIN and
  // billing/shipping address with whatever the new
  // deal's company has — same prefetch behavior as the
  // split-view Invoice panel (InvoiceForm.jsx). Clears
  // them to empty when that company has none, rather
  // than carrying over the previous deal's data.
  const applyDealSelection = (value, { markDirty = true } = {}) => {
    if (dealError) setDealError(false);
    const selectedDeal = localDeals.find((d) => d._id === value);
    const company = selectedDeal?.company;
    const nextBilling =
      company && !isAddressEmpty(company.billingAddress)
        ? { ...emptyAddress(), ...company.billingAddress }
        : emptyAddress();
    const nextShipping =
      company && !isAddressEmpty(company.shippingAddresses?.[0])
        ? { ...emptyAddress(), ...company.shippingAddresses[0] }
        : emptyAddress();
    const customerState = (company?.billingAddress?.state || '').trim().toLowerCase();
    const autoType = (sellerState && customerState && sellerState !== customerState) ? 'inter' : 'intra';
    setForm((prev) => ({
      ...prev,
      deal: value,
      receiverGSTIN: company?.gstin || "",
      billingAddress: nextBilling,
      shippingAddress: prev.sameAsBilling ? nextBilling : nextShipping,
      transactionType: autoType,
    }));
    if (markDirty) setHasUnsavedChanges(true);
  };

  // Applies `preselectDealId` to a new invoice. Never overrides a deal already on the form — in
  // particular one carried over from the split view via formOverride — except when the caller
  // hands a DIFFERENT id (a deal just created), which is fresh intent. Re-applies once the
  // seller's state has loaded, since the inter/intra-state type depends on it, but only while
  // the form still holds that same deal.
  const preselectAppliedRef = useRef({ started: false, dealId: null, withSeller: false });
  useEffect(() => {
    // First run: a form arriving from the split view keeps the deal it has — the split view
    // already applied it and the addresses may have been edited since. The formOverride merge
    // is queued by an earlier effect in this same commit, so `form.deal` can still read "" here;
    // hence formOverride itself is checked. A deal created afterwards is selected by
    // handleDealCreated, and a later, different preselect id is still applied below.
    if (!preselectAppliedRef.current.started) {
      const handedOff = !!(formOverride || form.deal);
      preselectAppliedRef.current = {
        started: true,
        dealId: handedOff ? preselectDealId : null,
        withSeller: handedOff,
      };
      if (handedOff) return;
    }
    if (editingInvoice || !preselectDealId) return;
    if (!localDeals.some((d) => d._id === preselectDealId)) return;
    const last = preselectAppliedRef.current;
    const withSeller = !!sellerState;
    if (last.dealId === preselectDealId) {
      if (last.withSeller || !withSeller || form.deal !== preselectDealId) return;
    }
    preselectAppliedRef.current = { started: true, dealId: preselectDealId, withSeller };
    // A preselect isn't a user edit, so it doesn't trigger the unsaved-changes prompt.
    applyDealSelection(preselectDealId, { markDirty: false });
    // applyDealSelection is recreated each render; keyed on the inputs that matter instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectDealId, localDeals, sellerState, editingInvoice, form.deal, formOverride]);

  // Hands the current form state to the parent's preview/print modal —
  // same onPreview contract Accounting.jsx wires up for the split-view panel.
  const handlePrint = () => {
    if (onPreview) onPreview(form);
  };

  const validateGSTIN = (gstin) => {
    if (!gstin) return true;
    return gstinRegex.test(gstin);
  };

  const submitInvoice = async (statusValue) => {
    setIsSubmitting(true);
    const isDraft = statusValue === "Draft";

    // Compute every field's validity up front (not early-return per field)
    // so all invalid fields light up together, then scroll to whichever
    // one sits highest on the page — same pattern as QuickCompanyForm.jsx.
    const isDealInvalid = !form.deal;
    const isDateInvalid = !form.date;
    setDealError(isDealInvalid);
    setDateError(isDateInvalid);

    if (isDealInvalid || isDateInvalid) {
      const candidates = [
        isDealInvalid ? dealFieldRef.current : null,
        isDateInvalid ? dateInputRef.current : null,
      ].filter(Boolean);
      let topMost = null;
      candidates.forEach((el) => {
        if (!topMost || el.getBoundingClientRect().top < topMost.getBoundingClientRect().top) {
          topMost = el;
        }
      });
      topMost?.scrollIntoView({ behavior: "smooth", block: "center" });
      setIsSubmitting(false);
      return;
    }

    // A quick draft only needs enough to identify the document; full GSTIN and
    // item validation apply once it's actually being created for real.
    if (!isDraft) {
      if (form.receiverGSTIN && !validateGSTIN(form.receiverGSTIN)) {
        toast.error(
          "Invalid GSTIN format. It should be 15 characters (e.g., 22AAAAA0000A1Z5)."
        );
        setIsSubmitting(false);
        return;
      }

      // items now starts empty (no blank starter row) so this has to be
      // checked explicitly — an empty array otherwise sails right through
      // the invalidItems filter below since filtering nothing finds nothing.
      if (form.items.length === 0) {
        toast.error("Add at least one product or service.");
        setIsSubmitting(false);
        return;
      }

      const invalidItems = form.items.filter(
        (item) =>
          !item.name ||
          !item.rate ||
          !item.quantity ||
          (form.isTaxInvoice && !item.hsn) ||
          (item.discountType === "percentage" && item.discount > 100)
      );
      if (invalidItems.length > 0) {
        toast.error(
          `Please fill in all item details (name, rate, quantity${form.isTaxInvoice ? ", and HSN/SAC" : ""
          }) and ensure percentage discounts are not above 100.`
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
        reference: form.reference,
        invoicePrefix: form.invoicePrefix,
        invoiceSuffix: form.invoiceSuffix,
        invoiceNumber: form.invoiceNumber,
        receiverGSTIN: form.receiverGSTIN,
        billingAddress: form.billingAddress,
        shippingAddress: form.sameAsBilling ? form.billingAddress : form.shippingAddress,
        bankDetails: form.bankDetails || null,
        qrNote: form.qrNote || "",
        signature: form.signature,
        amount: (() => {
          let t = form.isTaxInvoice
            ? computeDocument(form, "invoice").grandTotal
            // GST off: no tax at all, so the saved amount matches the total the form shows.
            // Without the explicit 0, calculateTotalAmount's gstRate default (18) added GST.
            : calculateTotalAmount(form.items, form.discount, 0);
          return form.isRoundOff ? Math.round(t) : t;
        })(),
        isRoundOff: form.isRoundOff,
        discount: form.discount,
        status: statusValue,
        items: form.items.map((item) => ({
          // For a variant line, item._id is the variant's own subdocument id
          // (see fetchItems above) and parentItemId is the real catalog Item —
          // itemId here must stay the parent so stock sync can find the
          // product; variantId carries the specific variant to deduct against.
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
        style: form.style,
        isTaxInvoice: form.isTaxInvoice,
        transactionType: form.transactionType,
      };

      if (editingInvoice) {
        await API.put(`/invoices/${editingInvoice._id}`, payload);
        setSuccessMessage(isDraft ? "Saved as draft!" : "Invoice updated successfully!");
      } else {
        await API.post("/invoices", payload);
        setSuccessMessage(isDraft ? "Saved as draft!" : "Invoice created successfully!");
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
        items: [],
        discount: { type: "fixed", value: 0 },
        amount: 0,
        status: "Draft",
        style: "",
        isTaxInvoice: true,
        gstRate: 18,
        transactionType: "intra",
      });
      await fetchData();
      setShowSuccessModal(true);
    } catch (err) {
      const serverMessage = err.response?.data?.error || "";
      if (/insufficient stock/i.test(serverMessage)) {
        // A toast disappears before the user can act on it — this failure
        // needs a deliberate response (go fix the quantity), not a passive
        // notice, so it gets a dialog instead.
        setStockErrorMessage(serverMessage);
      } else {
        const errorMessage = err.response?.status === 402
          ? (err.response?.data?.message || "An active subscription is required to make changes.")
          : (serverMessage || (editingInvoice ? "Failed to update invoice" : "Failed to create invoice"));
        toast.error(errorMessage);
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
    setShowConfirmDialog(false);
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

  if (!shouldRender) return null;

  const subtotal = calculateSubtotal(form.items);
  const totalItemDiscounts = calculateTotalItemDiscounts(form.items);
  const subtotalAfterItemDiscounts = subtotal - totalItemDiscounts;
  const invoiceDiscountAmount = calculateInvoiceDiscountAmount(
    subtotalAfterItemDiscounts,
    form.discount
  );
  
  let finalTotal = subtotalAfterItemDiscounts - invoiceDiscountAmount;
  let taxDetails = null;
  if (form.isTaxInvoice) {
    taxDetails = computeDocument(form, "invoice");
    finalTotal = taxDetails.grandTotal;
  }
  
  let roundOffAmount = 0;
  if (form.isRoundOff) {
    const rounded = Math.round(finalTotal);
    roundOffAmount = rounded - finalTotal;
    finalTotal = rounded;
  }

  return (
    <>
      {showQuickDealForm && (
        <QuickDealForm
          companies={companies}
          contacts={contacts}
          initialCompanyId={initialCompanyId || ""}
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
        className={`fixed inset-0 z-[10000] w-full h-full bg-white overflow-y-auto transform transition-transform duration-300 ease-in-out ${
          isSliding ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <form onSubmit={handleSubmit} noValidate className="h-full flex flex-col bg-[#F8F9FA] w-full min-h-screen">
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
              
              <div className="flex items-center gap-4">
                <div className="flex flex-col">
                  <h2 className="text-xl font-bold text-slate-900 flex items-center gap-1 cursor-pointer">
                    Create Invoice <ChevronDown className="w-5 h-5 text-gray-400" />
                  </h2>
                </div>
                
                <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden h-10 bg-white">
                  <input
                    type="text"
                    value={form.invoicePrefix}
                    onChange={(e) => {
                      setForm((prev) => ({ ...prev, invoicePrefix: e.target.value }));
                      setHasUnsavedChanges(true);
                    }}
                    className="w-20 px-3 py-2 text-sm font-semibold text-gray-700 bg-gray-50 border-r border-gray-300 focus:outline-none focus:bg-white"
                  />
                  <input
                    type="text"
                    placeholder={nextNumberPreview ? String(nextNumberPreview) : "Auto"}
                    value={form.invoiceNumber}
                    onChange={(e) => {
                      setForm((prev) => ({ ...prev, invoiceNumber: e.target.value }));
                      setHasUnsavedChanges(true);
                    }}
                    className="w-24 px-3 py-2 text-sm font-semibold text-gray-900 focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Suffix"
                    value={form.invoiceSuffix}
                    onChange={(e) => {
                      setForm((prev) => ({ ...prev, invoiceSuffix: e.target.value }));
                      setHasUnsavedChanges(true);
                    }}
                    title="Invoice number suffix (optional)"
                    aria-label="Invoice number suffix"
                    className="w-20 px-3 py-2 text-sm font-semibold text-gray-700 bg-gray-50 border-l border-gray-300 focus:outline-none focus:bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Right-side action pills — matched to the split-view Invoice
                panel's header (CreateInvoicePanel in InvoiceForm.jsx) so
                the full-width Invoice screen reads the same way. */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {onExitFullWidth && (
                <button
                  type="button"
                  onClick={() => onExitFullWidth(form)}
                  title="Back to split view with live preview"
                  className="h-8 w-8 flex items-center justify-center bg-white border border-[#E1E4EA] rounded-full text-[#525866] hover:bg-gray-50 transition-colors shadow-sm flex-shrink-0"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowTemplates(true)}
                title="Invoice settings"
                className="h-8 px-4 flex items-center gap-1.5 bg-white border border-[#E1E4EA] rounded-lg text-[13px] font-medium text-[#1F2937] hover:bg-gray-50 transition-colors shadow-sm flex-shrink-0"
              >
                <SettingsIcon className="w-4 h-4 text-[#525866]" />
                Settings
              </button>
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

          <div className="p-6 space-y-6 flex-1 overflow-y-auto">
            {/* Section 2: Customer Details Card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                
                {/* Select Customer */}
                <div className="md:col-span-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-semibold text-gray-700">Select Deal</label>
                    <button
                      type="button"
                      onClick={() => setShowQuickDealForm(true)}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center"
                    >
                      + Create Deal
                    </button>
                  </div>
                  <div ref={dealFieldRef} className="bg-blue-50/50 rounded-lg">
                    <SearchableDropdown
                      options={localDeals}
                      value={form.deal}
                      error={dealError ? "Deal is required" : null}
                      onChange={(value) => applyDealSelection(value)}
                      placeholder="Search customers by name, company, GSTIN..."
                      displayKey="title"
                      valueKey="_id"
                      className="w-full"
                      compact
                    />
                  </div>
                  {dealError && (
                    <p className="mt-1 text-xs text-red-600">Deal is required</p>
                  )}
                </div>

                {/* Invoice Date */}
                <div className="md:col-span-2 space-y-2">
                  <label className="text-sm font-semibold text-gray-700">Document Date</label>
                  <div className="relative">
                    <input
                      ref={dateInputRef}
                      type="date"
                      className={`w-full h-[38px] px-3.5 text-[13px] border rounded-full bg-white focus:outline-none focus:ring-1 transition-all ${dateError ? "border-red-400 focus:ring-red-500" : "border-[#1F2937]/10 focus:ring-blue-500"}`}
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
                        if (dateError) setDateError(false);
                        setHasUnsavedChanges(true);
                      }}
                    />
                  </div>
                  {dateError && (
                    <p className="mt-1 text-xs text-red-600">Invoice date is required</p>
                  )}
                </div>

                {/* Validity */}
                <div className="md:col-span-3 space-y-2">
                  <div className="flex items-center gap-1">
                    <label className="text-sm font-semibold text-gray-700">Due Date</label>
                  </div>
                  <div className="relative">
                    <input
                      type="date"
                      className="w-full h-[38px] px-3.5 text-[13px] border border-[#1F2937]/10 rounded-full bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
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

                {/* Reference */}
                <div className="md:col-span-3 space-y-2">
                  <div className="flex items-center gap-1">
                    <label className="text-sm font-semibold text-gray-700">Reference</label>
                  </div>
                  <input
                    type="text"
                    placeholder="Reference, e.g. PO Number... (Optional)"
                    value={form.reference}
                    onChange={(e) => {
                      setForm((prev) => ({ ...prev, reference: e.target.value }));
                      setHasUnsavedChanges(true);
                    }}
                    className="w-full h-[38px] px-3.5 text-[13px] border border-[#1F2937]/10 rounded-full bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                  />
                </div>

              </div>
            </div>

            {/* ── Billing & Shipping Address — same fields/behavior as the
                split-view Invoice panel's address section (AddressFieldsGroup
                from formPrimitives.jsx), so invoices round-trip these the
                same way invoices do. ── */}
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
                  onUseSaved={() => setAddressDrawer("billing")}
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
                  onUseSaved={() => setAddressDrawer("shipping")}
                  onChange={(next) => {
                    setForm((prev) => ({ ...prev, shippingAddress: next }));
                    setHasUnsavedChanges(true);
                  }}
                />
              </div>
            </div>

            <AddressBookDrawer
              isOpen={addressDrawer !== null}
              onClose={() => setAddressDrawer(null)}
              currentAddress={addressDrawer === "billing" ? form.billingAddress : form.shippingAddress}
              onApply={(next) => {
                if (addressDrawer === "billing") {
                  const customerState = (next.state || "").trim().toLowerCase();
                  const autoType = sellerState && customerState && sellerState !== customerState ? "inter" : "intra";
                  setForm((prev) => ({
                    ...prev,
                    billingAddress: next,
                    shippingAddress: prev.sameAsBilling ? next : prev.shippingAddress,
                    transactionType: customerState ? autoType : prev.transactionType,
                  }));
                } else {
                  setForm((prev) => ({ ...prev, shippingAddress: next }));
                }
                setHasUnsavedChanges(true);
              }}
            />

            {/* ── Section 3: Products & Services ── */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-slate-800">Products & Services</h3>
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

              {/* Quick-add bar: search an EXISTING product, set quantity,
                  drop it straight into the bill — separate from the per-row
                  inline search each already-added row keeps for editing.
                  allowAddNew is off here since creating a new product
                  already has its own "+ Add new Product?" link above;
                  offering it a second time inside this dropdown too was
                  redundant. Wraps to its own rows on narrow screens instead
                  of overflowing. */}
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
                    type="number" onWheel={(e) => e.target.blur()}
                    min="1"
                    placeholder="Qty"
                    value={quickAddQty}
                    onChange={(e) => setQuickAddQty(e.target.value)}
                    className="w-20 h-[38px] text-center text-[13px] text-[#1F2937] border border-[#1F2937]/10 rounded-full bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all flex-shrink-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddToBill}
                    className="h-[38px] px-4 flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-[#158FFF] hover:opacity-90 text-white text-[13px] font-semibold rounded-full transition-colors whitespace-nowrap"
                  >
                    <PlusIcon className="w-4 h-4" />
                    Add to Bill
                  </button>
                </div>
              </div>

              {form.items.length === 0 ? (
                /* Empty state — shown until something's actually been added,
                   instead of opening with an already-blank editable row. */
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <Inbox className="w-12 h-12 text-gray-300 mb-4" strokeWidth={1.5} />
                  <p className="text-gray-500 text-sm mb-4">
                    Search existing products to add to this list or add new product to get started! 🚀
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
                      <div className="absolute -left-4 top-4 opacity-0 group-hover:opacity-100 cursor-move text-gray-300 hover:text-gray-500 transition-opacity">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8h16M4 16h16"></path></svg>
                      </div>

                      <div className="grid grid-cols-12 gap-4 items-start">
                        {/* Product Name (Plain Input instead of Search) */}
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
                            type="number" onWheel={(e) => e.target.blur()}
                            placeholder="1"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => {
                              handleItemChange(index, "quantity", e.target.value);
                              setHasUnsavedChanges(true);
                            }}
                            className="w-full text-center text-[13px] text-[#1F2937] border border-[#1F2937]/10 rounded-full px-3 py-2.5 bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            required
                          />
                        </div>

                        {/* Rate */}
                        <div className="col-span-2">
                          <input
                            type="number" onWheel={(e) => e.target.blur()}
                            placeholder="0.00"
                            min="0"
                            step="0.01"
                            value={item.rate}
                            onChange={(e) => {
                              handleItemChange(index, "rate", e.target.value);
                              setHasUnsavedChanges(true);
                            }}
                            className="w-full text-right text-[13px] text-[#1F2937] border border-[#1F2937]/10 rounded-full px-3 py-2.5 bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            required
                          />
                        </div>

                        {/* GST % */}
                        <div className="col-span-1">
                          <div className="relative">
                            <select
                              value={item.gstRate ?? 0}
                              onChange={(e) => {
                                handleItemChange(index, "gstRate", parseFloat(e.target.value));
                                setHasUnsavedChanges(true);
                              }}
                              className="w-full appearance-none text-center text-[13px] text-[#1F2937] border border-[#1F2937]/10 rounded-full pl-2 pr-5 py-2.5 bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                            >
                              <option value={0}>0%</option>
                              <option value={5}>5%</option>
                              <option value={12}>12%</option>
                              <option value={18}>18%</option>
                              <option value={28}>28%</option>
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                          </div>
                        </div>

                        {/* Discount */}
                        <div className="col-span-2">
                          <div className="flex items-center border border-[#1F2937]/10 rounded-full bg-gray-50 focus-within:bg-white focus-within:ring-1 focus-within:ring-blue-500 transition-all overflow-hidden">
                            <input
                              type="number" onWheel={(e) => e.target.blur()}
                              placeholder="0"
                              min="0"
                              step="0.01"
                              value={item.discount}
                              onChange={(e) => {
                                handleItemChange(index, "discount", e.target.value);
                                setHasUnsavedChanges(true);
                              }}
                              className="w-full min-w-0 text-center text-[13px] text-[#1F2937] pl-3 pr-1 py-2.5 bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <div className="relative flex-shrink-0">
                              <select
                                value={item.discountType}
                                onChange={(e) => {
                                  handleItemChange(index, "discountType", e.target.value);
                                  setHasUnsavedChanges(true);
                                }}
                                className="w-14 appearance-none text-xs font-medium text-[#1F2937] border-l border-[#1F2937]/10 bg-gray-100 pl-2 pr-5 py-3 focus:outline-none cursor-pointer"
                              >
                                <option value="percentage">%</option>
                                <option value="amount">₹</option>
                              </select>
                              <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                            </div>
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

                      {/* More Details (Expandable) — kept flat against the
                          row instead of boxed in its own indented panel, so
                          the table doesn't stack box-inside-box. */}
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

            {/* ── Section 4 & 5: Notes, Terms, Signature, Totals — matched to
                the split-view Invoice panel's numbered layout
                (InvoiceForm.jsx's CreateInvoicePanel) instead of the old
                collapsible accordions with a decorative, non-functional
                "AI" button and dead Signature button. ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

              {/* Left Column: Notes, Terms, Attachments */}
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

              </div>

              {/* Right Column: Totals, Bank, Signature */}
              <div className="space-y-6">
                
                {/* Math Card */}
                <div className="bg-[#EBF5EE] rounded-xl p-5 shadow-sm space-y-4 relative">
                  <div className="flex justify-end gap-2 items-center mb-2">
                    <span className="text-xs text-gray-500 font-medium">Extra Discount</span>
                    <div className="flex items-center border border-[#1F2937]/10 bg-white rounded-full overflow-hidden h-[38px] focus-within:ring-1 focus-within:ring-blue-500 transition-all">
                      <select
                        value={form.discount.type}
                        onChange={(e) => {
                          handleDiscountChange("type", e.target.value);
                          setHasUnsavedChanges(true);
                        }}
                        className="text-xs font-medium text-gray-600 bg-transparent border-r border-[#1F2937]/10 pl-3.5 pr-2 py-1 focus:outline-none cursor-pointer"
                      >
                        <option value="fixed">₹</option>
                        <option value="percentage">%</option>
                      </select>
                      <input
                        type="number" onWheel={(e) => e.target.blur()}
                        placeholder="0"
                        min="0"
                        step="0.01"
                        value={form.discount.value}
                        onChange={(e) => {
                          handleDiscountChange("value", e.target.value);
                          setHasUnsavedChanges(true);
                        }}
                        className="w-16 text-right text-[13px] text-[#1F2937] pr-3.5 pl-1 focus:outline-none"
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
                              setForm(prev => ({ ...prev, isRoundOff: e.target.checked }));
                              setHasUnsavedChanges(true);
                            }}
                          />
                          <div className="w-7 h-4 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>
                      <span className="text-gray-900 font-semibold">{formatNumberFixed(roundOffAmount)}</span>
                    </div>

                    {taxDetails && form.transactionType === "intra" && (
                      <>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-600 font-medium">CGST</span>
                          <span className="text-gray-900 font-medium">₹{formatNumberFixed(taxDetails.totalCGST)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-600 font-medium">SGST</span>
                          <span className="text-gray-900 font-medium">₹{formatNumberFixed(taxDetails.totalSGST)}</span>
                        </div>
                      </>
                    )}
                    {taxDetails && form.transactionType === "inter" && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-600 font-medium">IGST</span>
                        <span className="text-gray-900 font-medium">₹{formatNumberFixed(taxDetails.totalIGST)}</span>
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

                    <div className="text-xs text-gray-400 italic text-right mt-1">
                      {numberToWords(finalTotal)}
                    </div>
                  </div>
                </div>

                {/* Select Bank — org's saved bank accounts (Settings → Bank
                    Details), printed on the document when one is picked;
                    left unset, PDF generation falls back to the org's
                    default bank. */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">Select Bank</label>
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
                    placeholder={`Invoice ${form.invoiceNumber || "..."}`}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    maxLength={50}
                  />
                  <p className="text-xs text-gray-400">
                    Shown as the payment note when the QR is scanned. Leave blank to use "Invoice {form.invoiceNumber || "..."}" automatically.
                  </p>
                </div>

                {/* Signature — same functional select + preview + default-
                    signature fallback as the split-view Invoice panel,
                    replacing the old decorative button that didn't actually
                    do anything. */}
                <div>
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

            {/* Running total + primary actions, as a floating pill pinned to
                the bottom of the form — matched to the split-view Invoice
                panel's sticky bar (InvoiceForm.jsx's CreateInvoicePanel). */}
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
                    onClick={handlePrint}
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

        {/* Right-side drawer for adding a product on the fly, matching the
            Vendor module's QuickItemDrawer instead of the old centered
            "Create New Item" modal. */}
        <QuickItemDrawer
          isOpen={showItemForm}
          onClose={() => setShowItemForm(false)}
          onSaved={handleProductCreated}
        />

        {/* Opened by the "Settings" pill above — same Template/Numbering/
            Signatures drawer the split view uses. */}
        <TemplateDrawer
          isOpen={showTemplates}
          onClose={() => setShowTemplates(false)}
          type="tax"
          docLabel="Invoice"
        />

        <InsufficientStockDialog
          isOpen={!!stockErrorMessage}
          message={stockErrorMessage}
          onClose={() => setStockErrorMessage(null)}
        />

        <SuccessModal
          isOpen={showSuccessModal}
          title="Success"
          message={successMessage}
          onClose={() => {
            setShowSuccessModal(false);
            onClose();
          }}
        />
      </div>
    </>
  );
};


// Thin wrapper around the shared CreateInvoicePanel for invoice type.
// Used by Accounting.jsx when opening the two-pane create/edit form.

export default InvoiceFormFull;
