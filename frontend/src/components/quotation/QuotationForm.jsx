import DeleteIcon from "../common/DeleteIcon";
import { resolveField, resolveDiscount, resolveMaxDiscountPercent } from "../../utils/variantResolve";
import PdfIcon from "../common/PdfIcon";
import Checkbox from "../common/Checkbox";
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
import TemplateDrawer from "../invoice/TemplateDrawer";
import { AddressFieldsGroup, emptyAddress, isAddressEmpty, SectionHeader } from "../invoice/formPrimitives";
import AddressBookDrawer from "../invoice/AddressBookDrawer";
import EditIcon from "../common/EditIcon";
import QuickDealForm from "../deal/QuickDealForm";
import SearchableDropdown from "../contact/SearchableDropdown";
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
      // previously dropped entirely, so a tax quotation line item never
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
      type: item.type,
      stock: item.stock,
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
      <div className="relative h-10 flex items-center border border-[#E1E4EA] rounded-full bg-white transition-colors hover:bg-gray-50 focus-within:border-[#0085FF] focus-within:hover:bg-white overflow-hidden">
        <div className="pl-3 pr-2 flex items-center justify-center flex-shrink-0">
          <SearchIcon className="w-4 h-4 text-[#525866]" />
        </div>

        <input
          ref={inputRef}
          type="text"
          placeholder="Search items or variants..."
          value={searchTerm}
          onChange={handleSearchChange}
          onFocus={handleInputFocus}
          className="w-full h-full bg-transparent text-sm focus:outline-none pr-4 min-w-[100px]"
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
                  {visibleItems.map((item) => (
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



const QuotationForm = ({
  deals,
  isOpen,
  onClose,
  fetchData,
  editingQuotation,
  onPreview,
  // Optional. Supplied when this screen was opened as the "full width" mode of
  // the split-view quotation panel — renders a control to go back to it.
  onExitFullWidth,
  // Snapshot of the split-view panel's in-progress form, handed off the
  // moment the user expands to full width — takes precedence over
  // editingQuotation/conversionData so switching views never drops unsaved
  // edits. Passed back the same way when collapsing to split view again.
  formOverride = null,
  conversionData = null,
  defaultDueDateDays = null,
  defaultNotesByType = {},
  defaultTermsByType = {},
  defaultNotesFlat = "",
  defaultTermsFlat = "",
  documentTypeSettings = {},
  // --- Optional, for callers that already imply the customer (Company/Deal pages).
  //     Accounting passes none of these, so its behaviour is unchanged. ---
  // A deal to select on a NEW document, applied through the same handler as a manual pick.
  preselectDealId = null,
  // Company preselected in "+ Create Deal", and the company this flow is scoped to: a deal
  // created for any other company is not added to or selected on this document.
  initialCompanyId = null,
  // Reports a deal created here back to the caller so its own deal list stays current.
  onDealCreated,
}) => {
  const defaultNotesForNew = defaultNotesByType.quotation !== undefined
    ? defaultNotesByType.quotation
    : (defaultNotesFlat || PREDEFINED_NOTES.quotation || "");
  const defaultTermsForNew = defaultTermsByType.quotation !== undefined
    ? defaultTermsByType.quotation
    : (defaultTermsFlat || PREDEFINED_TERMS.quotation || "");
  const [form, setForm] = useState({
    deal: "",
    date: "",
    dueDate: "",
    reference: "",
    receiverGSTIN: "",
    quotationPrefix: documentTypeSettings.quote?.prefix || "QT-",
    quotationSuffix: documentTypeSettings.quote?.suffix || "",
    quotationNumber: "",
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
    // Same default as the shared split-view panel, so a document does not
    // round differently depending on which layout created it.
    isRoundOff: true,
    notes: defaultNotesForNew,
    terms: defaultTermsForNew,
    attachments: [],
    bankDetails: "",
    signature: "",
  });
  const [isSliding, setIsSliding] = useState(false);
  const [shouldRender, setShouldRender] = useState(true);
  const [showItemForm, setShowItemForm] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [nextNumberPreview, setNextNumberPreview] = useState(null);
  const [quickAddItem, setQuickAddItem] = useState(null);
  const [quickAddQty, setQuickAddQty] = useState(1);
  const [savedSignatures, setSavedSignatures] = useState([]);
  const [signaturesLoading, setSignaturesLoading] = useState(false);
  const [showQuickDealForm, setShowQuickDealForm] = useState(false);
  const [localDeals, setLocalDeals] = useState(deals);
  const [sellerState, setSellerState] = useState("");
  // "billing" | "shipping" | null -- which field group opened the saved
  // address book (AddressBookDrawer).
  const [addressDrawer, setAddressDrawer] = useState(null);
  // Renaming a saved document's number, same flow as the split-view panel:
  // the prefix stays fixed and only the numeric part is editable.
  const [docNumber, setDocNumber] = useState(editingQuotation?.quotationNumber || "");
  const [numberDraft, setNumberDraft] = useState(null); // null = not renaming
  const [savingNumber, setSavingNumber] = useState(false);
  const numberPrefix = docNumber.includes("-")
    ? docNumber.slice(0, docNumber.lastIndexOf("-") + 1)
    : "";
  const numberSuffix = docNumber.slice(numberPrefix.length);

  const saveDocNumber = async () => {
    const suffix = (numberDraft || "").trim();
    if (!suffix) return toast.error("Quotation number cannot be empty.");
    const next = `${numberPrefix}${suffix}`;
    if (next === docNumber) return setNumberDraft(null);
    try {
      setSavingNumber(true);
      await API.patch(`/quotations/number/${editingQuotation._id}`, { quotationNumber: next });
      setDocNumber(next);
      setNumberDraft(null);
      toast.success("Quotation number updated.");
      fetchData?.();
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
  const [companies, setCompanies] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [items, setItems] = useState([]);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
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
              // The variant's own GST rate, with no fall back to the parent product: an
              // unset variant rate means 0%, and a variant set to 0% stays 0%. Inheriting
              // the parent silently taxed variants that were meant to be GST-free.
              gstRate: variant.gstRate ?? 0,
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
    if (formOverride) {
      // The split-view panel (CreateInvoicePanel) stores numbering under
      // generic keys shared by every document type — this screen's own form
      // uses quotation-specific ones, so they're remapped on the way in.
      const {
        invoicePrefix, invoiceSuffix, invoiceNumber,
        ...rest
      } = formOverride;
      setForm((prev) => ({
        ...prev,
        ...rest,
        quotationPrefix: invoicePrefix ?? prev.quotationPrefix,
        quotationSuffix: invoiceSuffix ?? prev.quotationSuffix,
        quotationNumber: invoiceNumber ?? prev.quotationNumber,
      }));
      setHasUnsavedChanges(false);
      return;
    }
    const sourceData = editingQuotation || conversionData;
    if (sourceData) {
      setForm({
        deal: sourceData.deal?._id || sourceData.deal || "",
        date: sourceData.date ? sourceData.date.slice(0, 10) : "",
        dueDate: sourceData.dueDate
          ? sourceData.dueDate.slice(0, 10)
          : "",
        receiverGSTIN: sourceData.receiverGSTIN || "",
        reference: sourceData.reference || "",
        // Only an actual edit (editingQuotation) keeps the source's own
        // number — conversionData (Convert or Duplicate) always starts
        // blank so a fresh number gets auto-generated, instead of Duplicate
        // silently copying the source quotation's own number onto the new one.
        quotationPrefix: (editingQuotation && sourceData.quotationPrefix) || documentTypeSettings.quote?.prefix || "QT-",
        quotationSuffix: (editingQuotation && sourceData.quotationSuffix) || documentTypeSettings.quote?.suffix || "",
        quotationNumber: editingQuotation ? (sourceData.quotationNumber || "") : "",
        billingAddress: { ...emptyAddress(), ...(sourceData.billingAddress || {}) },
        shippingAddress: { ...emptyAddress(), ...(sourceData.shippingAddress || {}) },
        sameAsBilling:
          isAddressEmpty(sourceData.shippingAddress) ||
          JSON.stringify({ ...emptyAddress(), ...(sourceData.billingAddress || {}) }) ===
            JSON.stringify({ ...emptyAddress(), ...(sourceData.shippingAddress || {}) }),
        items: (sourceData.items || []).map((item) => ({
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
        isRoundOff: sourceData.isRoundOff !== undefined ? sourceData.isRoundOff : true,
        transactionType: sourceData.transactionType || "intra",
        notes: sourceData.notes || "",
        terms: sourceData.terms || "",
        attachments: sourceData.attachments || [],
        bankDetails: sourceData.bankDetails || "",
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
        quotationPrefix: documentTypeSettings.quote?.prefix || "QT-",
        quotationSuffix: documentTypeSettings.quote?.suffix || "",
        quotationNumber: "",
        billingAddress: emptyAddress(),
        shippingAddress: emptyAddress(),
        sameAsBilling: true,
        items: [],
        discount: { type: "fixed", value: 0 },
        amount: 0,
        status: "Draft",
        transactionType: "intra",
        notes: defaultNotesForNew,
        terms: defaultTermsForNew,
        attachments: [],
        bankDetails: "",
        signature: "",
      });
      setHasUnsavedChanges(false);
    }
  }, [editingQuotation, conversionData, formOverride]);

  // Same default-signature behavior as the split-view Invoice panel
  // (InvoiceForm.jsx): fall back to the org's default signature whenever
  // this quotation isn't already pointing at one of the saved signatures —
  // a blank, stale, or never-set signature resolves to the default rather
  // than nothing. A quotation that stored a still-valid custom signature
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

  // Live preview of the number this quotation will actually get on save
  // (from the same persistent per-org counter resolveDocumentNumber uses) —
  // shown as the number box's placeholder instead of a static "1" so it
  // stays in sync with the split-view panel.
  useEffect(() => {
    const loadNextNumberPreview = async () => {
      try {
        const res = await API.get("/document-settings");
        setNextNumberPreview(res.data?.nextNumbers?.quote || null);
      } catch (error) {
        console.error("Failed to load next quotation number preview", error);
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

  // Mirrors computeDocument()'s own line-rate resolution: the line's own
  // rate when it is a real GST slab, otherwise untaxed. GST is per line --
  // there is no document-level rate.
  const effectiveGstRate = (item) => {
    const itemRate = Number(item.gstRate);
    return GST_RATES.includes(itemRate) ? itemRate : 0;
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
          toast.error("Quotation discount cannot exceed subtotal after item discounts.");
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
      stock: item.inventory?.currentStock ?? 0,
      discountType: item.discount?.type || "amount",
      discount: item.discount?.value || 0,
      type: item.type,
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
    // Scoped callers (initialCompanyId set) keep the document with that company:
    // QuickDealForm lets the company be changed, and a deal for another company is
    // still created but is not offered or selected here.
    const newDealCompanyId = newDeal?.company?._id || newDeal?.company || null;
    if (initialCompanyId && newDealCompanyId && String(newDealCompanyId) !== String(initialCompanyId)) {
      toast("Deal created for a different company, so it isn't available on this quotation.");
      return;
    }
    setLocalDeals((prev) => (prev.some((d) => d._id === newDeal._id) ? prev : [...prev, newDeal]));
    setForm((prev) => ({ ...prev, deal: newDeal._id }));
    setHasUnsavedChanges(true);
    onDealCreated?.(newDeal);
  };

  // One place that turns a chosen deal into the customer fields it implies, so the
  // manual picker and the preselect below can never drift apart.
  const applyDealSelection = (value, { markDirty = true } = {}) => {
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

  // Applies `preselectDealId` to a NEW document. Never overrides a deal already on the
  // form -- in particular one carried over from the split view via formOverride -- except
  // when the caller hands a DIFFERENT id (a deal just created), which is fresh intent.
  // Re-applies once the seller state has loaded, since inter/intra depends on it.
  const preselectAppliedRef = useRef({ started: false, dealId: null, withSeller: false });
  useEffect(() => {
    if (!preselectAppliedRef.current.started) {
      const handedOff = !!(formOverride || form.deal);
      preselectAppliedRef.current = {
        started: true,
        dealId: handedOff ? preselectDealId : null,
        withSeller: handedOff,
      };
      if (handedOff) return;
    }
    if (editingQuotation || !preselectDealId) return;
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
  }, [preselectDealId, localDeals, sellerState, editingQuotation, form.deal, formOverride]);

  // Hands the current form state to the parent's preview/print modal —
  // same onPreview contract Accounting.jsx wires up for the split-view panel.
  const handlePrint = () => {
    if (onPreview) onPreview(form);
  };

  const validateGSTIN = (gstin) => {
    if (!gstin) return true;
    return gstinRegex.test(gstin);
  };

  const submitQuotation = async (statusValue) => {
    setIsSubmitting(true);
    const isDraft = statusValue === "Draft";

    if (!form.deal) {
      toast.error("Deal is required.");
      setIsSubmitting(false);
      return;
    }

    if (!form.date) {
      toast.error("Quotation Date is required.");
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
          (parseFloat(item.gstRate) > 0 && !item.hsn) ||
          (item.discountType === "percentage" && item.discount > 100)
      );
      if (invalidItems.length > 0) {
        toast.error(
          "Please fill in all item details (name, rate, quantity, and HSN/SAC for any item with a GST rate) and ensure percentage discounts are not above 100."
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
          "Quotation discount cannot exceed subtotal after item discounts."
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
        quotationPrefix: form.quotationPrefix,
        quotationSuffix: form.quotationSuffix,
        // An existing document keeps the number it was issued: it is shown
        // read-only while editing and never re-sent, so an update cannot
        // renumber it.
        ...(editingQuotation ? {} : { quotationNumber: form.quotationNumber }),
        receiverGSTIN: form.receiverGSTIN,
        billingAddress: form.billingAddress,
        shippingAddress: form.sameAsBilling ? form.billingAddress : form.shippingAddress,
        signature: form.signature,
        // Chosen bank account (kept from reopen / split view); omitted when none, so an
        // update never clears a bank chosen elsewhere.
        bankDetails: form.bankDetails || undefined,
        amount: (() => {
          let t = computeDocument(form, "quotation").grandTotal;
          return form.isRoundOff ? Math.round(t) : t;
        })(),
        isRoundOff: form.isRoundOff,
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
          // Resolved exactly the way computeDocument() resolves it -- a real
          // GST slab, otherwise 0%. A blind parseFloat would persist a rate
          // (say 7%) that the engine scores as 0%, so the saved rate would
          // contradict the saved total.
          gstRate: effectiveGstRate(item),
          taxInclusive: !!item.taxInclusive,
        })),
        transactionType: form.transactionType,
      };

      if (editingQuotation) {
        await API.put(`/quotations/${editingQuotation._id}`, payload);
        toast.success(isDraft ? "Saved as draft!" : "Quotation updated successfully!");
      } else {
        await API.post("/quotations", payload);
        toast.success(isDraft ? "Saved as draft!" : "Quotation created successfully!");
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
      });
      await fetchData();
      onClose();
    } catch (err) {
      const errorMessage = err.response?.status === 402
        ? (err.response?.data?.message || "An active subscription is required to make changes.")
        : (err.response?.data?.error || (editingQuotation ? "Failed to update quotation" : "Failed to create quotation"));
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
    await submitQuotation("Pending");
    if (!toastMessage.includes("Failed")) {
      setShowConfirmDialog(false);
      onClose();
    }
  };

  const handleSaveDraft = () => submitQuotation("Draft");
  const handleSubmit = (e) => {
    e.preventDefault();
    submitQuotation(form.status || "Draft");
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
  const taxDetails = computeDocument(form, "quotation");
  finalTotal = taxDetails.grandTotal;
  
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
              
              <div className="flex items-center gap-4">
                {editingQuotation ? (
                  <div className="flex flex-col">
                    {numberDraft === null ? (
                      <div className="flex items-center gap-1.5 min-w-0">
                        <h2 className="text-xl font-bold text-slate-900 truncate">
                          {docNumber || "Edit Quotation"}
                        </h2>
                        {docNumber && (
                          <button
                            type="button"
                            onClick={() => setNumberDraft(numberSuffix)}
                            title="Rename this quotation"
                            aria-label="Rename this quotation"
                            className="p-1 rounded-md text-gray-400 hover:text-[#0085FF] hover:bg-blue-50 transition-colors flex-shrink-0"
                          >
                            <EditIcon className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 min-w-0">
                        <div className="flex items-center h-9 pl-2.5 pr-1 border border-gray-300 rounded-lg focus-within:border-[#0085FF] min-w-0">
                          <span className="text-xl font-bold text-gray-400 flex-shrink-0">
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
                            className="w-28 min-w-0 px-1 text-xl font-bold text-slate-900 outline-none bg-transparent"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={saveDocNumber}
                          disabled={savingNumber}
                          className="h-7 px-2 flex items-center justify-center rounded-full bg-[#0085FF] hover:bg-blue-600 text-white text-xs font-semibold transition-colors disabled:opacity-60 flex-shrink-0"
                        >
                          {savingNumber ? "..." : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setNumberDraft(null)}
                          className="h-7 px-2 text-xs font-medium text-gray-500 hover:text-gray-800 flex-shrink-0"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                  <div className="flex flex-col">
                    <h2 className="text-xl font-bold text-slate-900 flex items-center gap-1 cursor-pointer">
                      Create Quotation <ChevronDown className="w-5 h-5 text-gray-400" />
                    </h2>
                  </div>
                
                  {/* Same controlled picker the Invoice screen uses: prefixes and
                      suffixes come from Settings -> Document Numbering, so a document
                      cannot be saved with an ad-hoc prefix. documentTypeSettings.quote
                      is this type's own list -- never another document type's. */}
                  <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden h-10 bg-white flex-shrink-0">
                    <div className="relative h-full border-r border-gray-300 bg-gray-50 flex items-center">
                      <select
                        value={form.quotationPrefix}
                        onChange={(e) => {
                          setForm((prev) => ({ ...prev, quotationPrefix: e.target.value }));
                          setHasUnsavedChanges(true);
                        }}
                        title="Quotation number prefix"
                        aria-label="Quotation number prefix"
                        className="h-full pl-3.5 pr-7 text-sm font-semibold text-gray-700 bg-transparent focus:outline-none appearance-none cursor-pointer"
                      >
                        {(documentTypeSettings?.quote?.prefixes || []).length > 0 ? (
                          documentTypeSettings.quote.prefixes.map((pfx) => (
                            <option key={pfx} value={pfx}>{pfx}</option>
                          ))
                        ) : (
                          <option value={form.quotationPrefix}>{form.quotationPrefix || "None"}</option>
                        )}
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 absolute right-2 text-gray-500 pointer-events-none" />
                    </div>
                    {/* Read-only while creating: the number is allocated from this
                        series' counter on save, so it cannot be typed over. It stays
                        renameable afterwards from the saved document. */}
                    <input
                      type="text"
                      value={nextNumberPreview != null ? String(nextNumberPreview) : "Auto"}
                      readOnly
                      title="Quotation number is allocated automatically on save"
                      aria-label="Quotation number"
                      className="w-24 px-3 py-2 text-sm font-semibold text-gray-900 bg-gray-50 focus:outline-none cursor-default"
                    />
                    <div className="relative h-full border-l border-gray-300 bg-gray-50 flex items-center">
                      <select
                        value={form.quotationSuffix}
                        onChange={(e) => {
                          setForm((prev) => ({ ...prev, quotationSuffix: e.target.value }));
                          setHasUnsavedChanges(true);
                        }}
                        title="Quotation number suffix (optional)"
                        aria-label="Quotation number suffix"
                        className="h-full pl-2.5 pr-7 text-sm font-semibold text-gray-700 bg-transparent focus:outline-none appearance-none cursor-pointer"
                      >
                        <option value="">None</option>
                        {(documentTypeSettings?.quote?.suffixes || []).map((sfx) => (
                          <option key={sfx} value={sfx}>{sfx}</option>
                        ))}
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 absolute right-2 text-gray-500 pointer-events-none" />
                    </div>
                  </div>
                  </>
                )}
              </div>
            </div>

            {/* Right-side action pills — matched to the split-view Invoice
                panel's header (CreateInvoicePanel in InvoiceForm.jsx) so
                the full-width Quotation screen reads the same way. */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {onExitFullWidth && (
                <button
                  type="button"
                  onClick={() => {
                    // Mirror of the remap on the way in: the split-view
                    // panel expects the generic invoicePrefix/invoiceSuffix/
                    // invoiceNumber keys, not this screen's quotation-specific ones.
                    const { quotationPrefix, quotationSuffix, quotationNumber, ...rest } = form;
                    onExitFullWidth({
                      ...rest,
                      invoicePrefix: quotationPrefix,
                      invoiceSuffix: quotationSuffix,
                      invoiceNumber: quotationNumber,
                    });
                  }}
                  title="Back to split view with live preview"
                  className="h-8 w-8 flex items-center justify-center bg-white border border-[#E1E4EA] rounded-full text-[#525866] hover:bg-gray-50 transition-colors shadow-sm flex-shrink-0"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowTemplates(true)}
                title="Quotation settings"
                className="h-8 px-4 flex items-center gap-1.5 bg-white border border-[#E1E4EA] rounded-full text-[13px] font-medium text-[#1F2937] hover:bg-gray-50 transition-colors shadow-sm flex-shrink-0"
              >
                <SettingsIcon className="w-4 h-4 text-[#525866]" />
                Settings
              </button>
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

          <div className="p-6 space-y-6 flex-1 overflow-y-auto">
            {/* Section 2: Customer Details Card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="mb-5">
                <SectionHeader number="01" title="Quotation Details" />
              </div>
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
                  <div className="bg-blue-50/50 rounded-lg">
                    <SearchableDropdown
                      options={localDeals}
                      value={form.deal}
                      onChange={(value) => {
                        // Switching the deal replaces the Receiver GSTIN and
                        // billing/shipping address with whatever the new
                        // deal's company has — same prefetch behavior as the
                        // split-view Invoice panel (InvoiceForm.jsx). Clears
                        // them to empty when that company has none, rather
                        // than carrying over the previous deal's data.
                        applyDealSelection(value);
                      }}
                      placeholder="Search customers by name, company, GSTIN..."
                      displayKey="title"
                      valueKey="_id"
                      className="w-full"
                    />
                  </div>
                </div>

                {/* Quotation Date */}
                <div className="md:col-span-2 space-y-2">
                  <label className="text-sm font-semibold text-gray-700">Quotation Date</label>
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
                          if (!editingQuotation && !prev.dueDate && newDate) {
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
                </div>

                {/* Validity */}
                <div className="md:col-span-3 space-y-2">
                  <div className="flex items-center gap-1">
                    <label className="text-sm font-semibold text-gray-700">Validity</label>
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
                    <div className="group relative">
                      <div className="w-3.5 h-3.5 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center text-[10px] cursor-help">?</div>
                    </div>
                  </div>
                  <input
                    type="text"
                    placeholder="Reference, e.g. PO Number... (Optional)"
                    value={form.reference}
                    onChange={(e) => {
                      setForm((prev) => ({ ...prev, reference: e.target.value }));
                      setHasUnsavedChanges(true);
                    }}
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

              </div>
            </div>

            {/* ── Billing & Shipping Address — same fields/behavior as the
                split-view Invoice panel's address section (AddressFieldsGroup
                from formPrimitives.jsx), so quotations round-trip these the
                same way invoices do. ── */}
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

            {/* Saved billing/shipping addresses, same picker the Invoice screen and
                the split-view panel use (AddressBookDrawer). Applying a billing
                address re-runs the seller-state vs customer-state check so
                CGST/SGST vs IGST follows the address that was just applied. */}
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
                  <SectionHeader number="03" title="Products & Services" />
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
                        {/* Product Name (Plain Input instead of Search) */}
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
                            type="number" onWheel={(e) => e.target.blur()}
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
                            type="number" onWheel={(e) => e.target.blur()}
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
                              type="number" onWheel={(e) => e.target.blur()}
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
                  <SectionHeader number="04" title="Notes" />
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
                  <SectionHeader number="05" title="Terms & Conditions" />
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
                      <div className="w-3.5 h-3.5 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center text-[10px]">?</div>
                    </div>
                    <button type="button" className="flex items-center justify-center gap-2 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 border-dashed rounded-[25px] hover:border-gray-400 transition-colors">
                      <span className="text-lg">↑</span> Attach Files (Max: 5)
                    </button>
                  </div>

                  <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer">
                    <div className="w-4 h-4 rounded-full border border-gray-300 flex items-center justify-center">
                      {/* empty state */}
                    </div>
                    Use Coupons
                  </label>
                </div>
              </div>

              {/* Right Column: Totals, Bank, Signature */}
              <div className="space-y-6">
                
                {/* Math Card */}
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
                        type="number" onWheel={(e) => e.target.blur()}
                        placeholder="0"
                        min="0"
                        step="0.01"
                        value={form.discount.value}
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

                {/* Select Bank */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1">
                    <label className="text-sm font-semibold text-gray-700">Select Bank</label>
                    <div className="w-3.5 h-3.5 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center text-[10px]">?</div>
                  </div>
                  <button type="button" className="w-full py-3 bg-[#FAF5FF] border border-[#E9D5FF] rounded-[25px] text-[#9333EA] font-semibold text-sm hover:bg-[#F3E8FF] transition-colors flex items-center justify-center gap-2">
                    <span className="text-lg">🏦</span> Add Bank to Invoice (Optional)
                  </button>
                </div>

                {/* Signature — same functional select + preview + default-
                    signature fallback as the split-view Invoice panel,
                    replacing the old decorative button that didn't actually
                    do anything. */}
                <div>
                  <SectionHeader number="06" title="Signature" />
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
                            : "The default is applied to every quotation unless you pick another here."}
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
                    onClick={handlePrint}
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
                      ? editingQuotation
                        ? "Updating..."
                        : "Creating..."
                      : editingQuotation
                        ? "Update Quotation"
                        : "Create Quotation"}
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
          type="quotation"
          docLabel="Quotation"
        />
      </div>
    </>
  );
};

export default QuotationForm;

// Thin wrapper around the shared CreateInvoicePanel for quotation type.
// Used by Accounting.jsx when opening the two-pane create/edit form.
import { CreateInvoicePanel } from "../invoice/CreateInvoicePanel";

const CreateQuotationPanel = (props) => (
  <CreateInvoicePanel {...props} type="quotation" />
);

export { CreateQuotationPanel };
