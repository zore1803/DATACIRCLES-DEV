// CreateInvoicePanel — extracted from InvoiceForm.jsx (previously defined in
// the same file as the InvoiceForm component). Pure move: no logic changed.
// Shared two-pane create/edit form used by all document types (Invoice,
// Quotation, Pro Forma Invoice, Delivery Challan) via the `type` prop.
import { resolveDiscount } from "../../utils/variantResolve";
import DeleteIcon from "../common/DeleteIcon";
import PlusIcon from "../common/PlusIcon";
import SearchIcon from "../common/SearchIcon";
import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Check,
  ChevronDown,
  PenLine,
  Printer,
  ChevronUp,
  ChevronRight,
  Maximize2,
  Minimize2,
  ChevronsLeftRight,
  Inbox,
} from "lucide-react";
import API from "../../services/api";
import QuickItemDrawer from "../item/QuickItemDrawer";
import toast from "react-hot-toast";
import { PREDEFINED_NOTES, PREDEFINED_TERMS } from "../../utils/documentDefaultText";

import SettingsIcon from "../common/SettingsIcon";
import InvoiceLivePreview from "./InvoiceLivePreview";
import BankSelect from "./BankSelect";
import InsufficientStockDialog from "../common/InsufficientStockDialog";
import SuccessModal from "../common/SuccessModal";
import BankModal from "../settings/BankModal";
import SignatureModal from "../settings/SignatureModal";
import TemplateDrawer from "./TemplateDrawer";
import NotesTermsDrawer from "./NotesTermsDrawer";
import AddressBookDrawer from "./AddressBookDrawer";
import { buildDocumentHtml, computeDocument, GST_RATES } from "../../../../shared/documentTemplates.js";
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
import { resolveTransactionType, placeOfSupplyFields } from "../../utils/placeOfSupply";
import EyeIcon from "../common/EyeIcon";
import EditIcon from "../common/EditIcon";

// numberToWords and stockBlockReason below are duplicated from
// InvoiceForm.jsx (also used there) rather than moved to a shared file, so
// this extraction stays a pure move with no changes to InvoiceForm.jsx's own
// behavior or to any shared component.
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
  // Optional. A deal to select on a NEW document as if the user had picked it — used when the
  // panel is opened from a context that already implies the deal (Company Profile / Deal page).
  // Goes through the same applyDealSelection as a manual pick, so the GSTIN, addresses and
  // transaction type are filled exactly as they would be; changing it later (e.g. after "Add
  // Deal") selects the new deal. Accounting doesn't pass it, so its behaviour is unchanged.
  preselectDealId = null,
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
  // Delivery Challan uses the same GST on/off, GSTIN and tax calculation as a Tax Invoice.
  const supportsTax = true;
  const supportsGSTIN = true;
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
  const [form, setForm] = useState(() => {
    const sourceDoc = initialDoc || conversionData;
    const base = sourceDoc
      ? {
          deal: sourceDoc.deal?._id || sourceDoc.deal || "",
          date: sourceDoc.date ? sourceDoc.date.slice(0, 10) : "",
          dueDate: sourceDoc.dueDate ? sourceDoc.dueDate.slice(0, 10) : "",
          receiverGSTIN: sourceDoc.receiverGSTIN || "",
          billingAddress: { ...emptyAddress(), ...(sourceDoc.billingAddress || {}) },
          shippingAddress: { ...emptyAddress(), ...(sourceDoc.shippingAddress || {}) },
          sameAsBilling:
            isAddressEmpty(sourceDoc.shippingAddress) ||
            JSON.stringify({ ...emptyAddress(), ...(sourceDoc.billingAddress || {}) }) ===
              JSON.stringify({ ...emptyAddress(), ...(sourceDoc.shippingAddress || {}) }),
          transactionType: sourceDoc.transactionType || "intra",
          // No document-level gstRate: GST comes only from each line's
          // product/variant, so there is nothing document-wide to carry over.
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
                  // Carried over as saved, including 0%; never re-defaulted to 18%.
                  gstRate: item.gstRate ?? 0,
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
          date: "",
          dueDate: "",
          receiverGSTIN: "",
          billingAddress: emptyAddress(),
          shippingAddress: emptyAddress(),
          sameAsBilling: true,
          transactionType: "intra",
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
  const [catalogue, setCatalogue] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [stockErrorMessage, setStockErrorMessage] = useState(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
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
  // Numbering options for THIS document type. docSettings flattens the
  // invoice ones into invoicePrefixes/invoiceSuffixes for the legacy fields,
  // but the pickers must offer the current type's own list -- otherwise a
  // quotation is offered INV-/TAX- and can be saved with an invoice prefix.
  const typeNumbering =
    docSettings.documentTypeSettings?.[SETTINGS_KEY_BY_TYPE[type]] || {};
  const prefixOptions = typeNumbering.prefixes || [];
  const suffixOptions = typeNumbering.suffixes || [];

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
  // Quick-add controls beside Select Bank / Signature, and which tab
  // TemplateDrawer opens on (its own default "template", or "numbering" when
  // launched from the prefix/suffix "+ Add" links below).
  const [showBankModal, setShowBankModal] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [templateDrawerTab, setTemplateDrawerTab] = useState("template");

  // Draggable split between the form (left) and the preview (right).
  const splitRef = useRef(null);
  const [leftPct, setLeftPct] = useState(50);
  // Collapses the preview entirely so the form gets the full width — useful
  // when filling in a long item list on a narrow screen.
  const [hidePreview, setHidePreview] = useState(false);
  // null when closed; otherwise the section to focus ("notes" | "terms").
  const [notesDrawer, setNotesDrawer] = useState(null);
  // "billing" | "shipping" | null — same idea as notesDrawer, for the saved
  // address book (AddressBookDrawer).
  const [addressDrawer, setAddressDrawer] = useState(null);
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

  // Builds the product picker list from GET /items. Shared by the initial load and the reload
  // after "Create product", so both carry the same fields (price, GST, With/Without Tax, stock,
  // discount). The reload used to be a separate copy without gstRate/taxInclusive/stock, so any
  // product added after creating one fell back to 18% tax-on-top.
  const buildCatalogue = (data) =>
    (data || [])
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
            // Variant-first: the variant's own discount when it sets one, otherwise the parent
            // item's (utils/variantResolve.js), same as the full-width forms. `v.discount ||`
            // never fell back: every variant has a discount object, even when its value is unset.
            discount: resolveDiscount(v, item),
            // The product's own GST rate and With/Without Tax setting. These were never
            // copied into the catalogue, so picking a product fell back to a flat 18% added
            // on top. Same variant-then-parent resolution as the full-width forms
            // (InvoiceFormFull/QuotationForm/PerformaInvoiceFormFull).
            // The variant's own GST rate, with no fall back to the parent product: an
            // unset variant rate means 0%, and a variant set to 0% stays 0%. Inheriting
            // the parent silently taxed variants that were meant to be GST-free.
            gstRate: v.gstRate ?? 0,
            taxInclusive: !!(v.taxInclusive ?? item.taxInclusive),
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
            gstRate: item.gstRate ?? 0,
            taxInclusive: !!item.taxInclusive,
          },
        ];
      });

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const res = await API.get("/items?search=&includeVariants=true");
        const flattened = buildCatalogue(res.data);
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
  // Extracted so the "+" add-signature control can re-run it after saving a
  // new signature, not just on mount — optionally selecting the just-saved
  // dataUrl instead of falling back to the org default.
  const loadSignatures = useCallback(async (selectDataUrl) => {
    setSignaturesLoading(true);
    try {
      const res = await API.get("/document-settings/signatures");
      const sigs = Array.isArray(res.data) ? res.data : [];
      setSavedSignatures(sigs);
      const toSelect = selectDataUrl
        ? sigs.find((s) => s.dataUrl === selectDataUrl)
        : sigs.find((s) => s.isDefault);
      if (toSelect) {
        // Fall back to the default whenever the document isn't already
        // pointing at one of the saved signatures — so a blank, stale, or
        // never-set signature resolves to the default rather than nothing.
        // A document that stored a still-valid custom signature keeps it.
        setForm((prev) => {
          const hasSavedMatch = sigs.some((s) => s.dataUrl === prev.signature);
          return selectDataUrl || !hasSavedMatch
            ? { ...prev, signature: toSelect.dataUrl || "" }
            : prev;
        });
      }
    } catch (error) {
      console.error("Failed to load signatures", error);
      setSavedSignatures([]);
    } finally {
      setSignaturesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSignatures();
    // Only needs to run once on mount — later reloads (after adding a
    // signature) are triggered explicitly via loadSignatures() itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Extracted so the "+" add-bank control can re-run just the bank list
  // after creating one, without waiting for the broader branding/bank/
  // numbering effect above (which only reruns on `[type, showTemplates]`).
  // Optionally selects the newly created account by id.
  const loadBanksOnly = useCallback(async (selectId) => {
    try {
      const res = await API.get("/bank-details/all");
      const list = Array.isArray(res.data) ? res.data : [];
      setBanks(list);
      const toSelect = selectId ? list.find((b) => b._id === selectId) : null;
      if (toSelect) {
        setForm((prev) => ({ ...prev, bankDetails: toSelect._id }));
      }
    } catch (error) {
      console.error("Failed to load bank accounts", error);
    }
  }, []);

  const setField = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  // Quick-add bank (the "+" beside Select Bank) — same create call Settings
  // → Bank Details uses (BankModal itself calls onClose() on success, so
  // this only needs to persist and select the newly created account).
  const handleSaveBank = async (payload) => {
    try {
      const res = await API.post("/bank-details", payload);
      toast.success("Bank account added");
      await loadBanksOnly(res.data?._id);
    } catch (err) {
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      }
      throw err;
    }
  };

  // Quick-add signature (the "+" beside Signature) — same call the Settings
  // drawer's Signatures tab uses, selecting the new signature once saved.
  const handleSaveSignature = async (sigData) => {
    await API.post("/document-settings/signatures", sigData);
    toast.success("Signature added");
    await loadSignatures(sigData.dataUrl);
  };

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
      // Only a Tax Invoice actually moves stock, so only it can be blocked by
      // availability. A Quotation/Pro Forma/Delivery Challan may quote goods
      // that aren't in hand yet.
      const blocked = type === "tax" ? stockBlockReason(picked, parseInt(quickAddQty) || 1) : null;
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
        // `??`, not `||`: a product at 0% GST is a real rate, not a missing one.
        // No fall back to a document-level rate either — GST is per line.
        gstRate: picked.gstRate ?? 0,
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
        // A typed-in line has no product behind it and GST is strictly
        // product/variant-level, so it starts untaxed at 0%.
        gstRate: 0,
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
  // Mirrors computeDocument()'s own line base (shared/documentTemplates.js):
  // a tax-inclusive rate has its GST divided out first, so this summary's
  // Subtotal is the same taxable base the preview and the PDF print. Adding
  // the gross rate here instead made Subtotal + GST disagree with Total on
  // any tax-inclusive line.
  const lineTotal = (item) => {
    const rate = parseFloat(item.rate) || 0;
    const qty = parseInt(item.quantity) || 0;
    const gstRate = GST_RATES.includes(Number(item.gstRate)) ? Number(item.gstRate) : 0;
    const unitTaxable = item.taxInclusive ? rate / (1 + gstRate / 100) : rate;
    return unitTaxable * qty;
  };

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
  const taxDetails = computeDocument(form, type === "quotation" ? "tax" : type);
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
    // Optional — only format-checked when the customer actually entered one,
    // matching the other document forms (Invoice/Quotation/Performa full-width).
    if (!isDraft && supportsGSTIN && form.receiverGSTIN.trim()) {
      if (!GSTIN_REGEX.test(form.receiverGSTIN.trim().toUpperCase()))
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
      // Same rule the full-width screen enforces, so a document cannot pass
      // validation in one layout and fail it in the other: a line that carries
      // GST must also carry an HSN/SAC, and a percentage discount cannot
      // exceed 100%.
      const badItem = form.items.find(
        (it) =>
          !it.name ||
          !it.rate ||
          !it.quantity ||
          (parseFloat(it.gstRate) > 0 && !it.hsn) ||
          (it.discountType === "percentage" && it.discount > 100)
      );
      if (badItem)
        return toast.error(
          "Every item needs a name, rate and quantity — plus an HSN/SAC for any item with a GST rate — and percentage discounts cannot exceed 100%."
        );
    }

    try {
      setSubmitting(true);
      const payload = {
        deal: form.deal,
        date: form.date,
        dueDate: form.dueDate,
        status: statusValue,
        transactionType: form.transactionType,
        // Resolved now and stored, so reopening never re-derives it from a
        // customer address that has changed since. All four document models
        // carry these fields.
        ...placeOfSupplyFields(form.shippingAddress, form.billingAddress),
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
      const savedMessage = isDraft
        ? "Saved as draft!"
        : `${docName} ${isEditing ? "updated" : "created"} successfully!`;
      if (isEditing) {
        await API.put(`/${path}/${initialDoc._id}`, payload);
      } else {
        await API.post(`/${path}`, payload);
      }
      onCreated();
      // The confetti confirmation is an Invoice-only treatment. This panel is
      // shared by all four document types, so the other three confirm with a
      // toast and close straight away, as they did before.
      if (type === "tax") {
        setSuccessMessage(savedMessage);
        setShowSuccessModal(true);
      } else {
        toast.success(savedMessage);
        onClose();
      }
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
    // On a new document the number is allocated on save, so fall back to the
    // server's own peek at the next number in this series -- the preview should
    // show the number the document will get, not a dash.
    const num =
      form.invoiceNumber?.toString().trim() ||
      (nextNumberPreview != null ? String(nextNumberPreview) : "");
    if (!num) return docNumber || "";
    const pfx = (form.invoicePrefix?.trim() || configuredPrefix);
    const sep = pfx && !pfx.endsWith("-") ? "-" : "";
    const sfx = form.invoiceSuffix?.trim();
    return `${pfx}${sep}${num}${sfx ? `-${sfx}` : ""}`;
  })();

  // For an already-saved document, print the real server-generated PDF
  // (opened in a new tab) instead of an HTML print window: the browser's own
  // print header/footer — title, page URL, page number, timestamp — is a
  // print-dialog setting no page can turn off, and it only ever shows up
  // when printing an HTML page. Printing a PDF (from its native viewer) has
  // none of that. Falls back to the HTML print below only while the
  // document hasn't been saved yet (no id to fetch a PDF for).
  const handlePrint = async () => {
    if (isEditing && initialDoc?._id) {
      try {
        const res = await API.get(`/${apiPathFor(type)}/download/${initialDoc._id}`, {
          responseType: "blob",
        });
        const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
        const win = window.open(url, "_blank");
        if (!win) toast.error("Allow pop-ups for this site to print.");
        // Revoked once the tab's had time to load the blob — revoking
        // immediately can race the new tab's fetch of the same URL.
        setTimeout(() => window.URL.revokeObjectURL(url), 60000);
        return;
      } catch (err) {
        // Falls through to the HTML print below rather than dead-ending —
        // a network hiccup here shouldn't block printing entirely.
      }
    }
    const html = buildDocumentHtml(
      {
        ...form,
        // Same derivation the live preview and the save payload use, so an
        // unsaved document prints the place of supply rather than a dash.
        ...placeOfSupplyFields(form.shippingAddress, form.billingAddress),
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
  // Selecting a deal, whether picked by the user or preselected by the caller.
  const applyDealSelection = (dealId) => {
    setFieldErrors((prev) => ({ ...prev, deal: false }));
    // Switching the deal always replaces the Receiver GSTIN
    // and billing/shipping address with whatever the new
    // deal's company has — including clearing them to empty
    // when that company doesn't have them saved. Carrying
    // over the previous deal's company data would attach it
    // to a company it was never actually collected for.
    const selectedDeal = deals.find((d) => d._id === dealId);
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
    setForm((p) => {
      const shipping = p.sameAsBilling ? nextBilling : nextShipping;
      // Goods: place of supply is the shipping state, so the tax type follows it.
      const autoType = resolveTransactionType(orgDetails?.state, shipping, nextBilling);
      return {
        ...p,
        deal: dealId,
        receiverGSTIN: supportsGSTIN ? company?.gstin || "" : p.receiverGSTIN,
        billingAddress: nextBilling,
        shippingAddress: shipping,
        transactionType: supportsTax && autoType ? autoType : p.transactionType,
      };
    });
  };

  // Applies `preselectDealId` to a new document. Re-runs when the org details arrive, because
  // the inter/intra-state transaction type is derived from the org's state: a selection made
  // before that load would otherwise lock in "intra" for an out-of-state customer. It only
  // re-applies while the form still holds that same deal (or none), so a deal the user has
  // since picked by hand is never overwritten.
  const preselectAppliedRef = useRef({ started: false, dealId: null, withOrg: false });
  useEffect(() => {
    // First run: a form handed back from the full-width screen (or already holding a deal) keeps
    // the deal it has — it was applied there and its addresses may have been edited since. The
    // current preselect is recorded as handled, so only a LATER, different id (a deal just
    // created via "Add Deal") is applied.
    if (!preselectAppliedRef.current.started) {
      const handedOff = !!(formOverride || form.deal);
      preselectAppliedRef.current = {
        started: true,
        dealId: handedOff ? preselectDealId : null,
        withOrg: handedOff,
      };
      if (handedOff) return;
    }
    if (isEditing || !preselectDealId) return;
    if (!deals.some((d) => d._id === preselectDealId)) return;
    const last = preselectAppliedRef.current;
    const withOrg = !!orgDetails;
    if (last.dealId === preselectDealId) {
      // Same deal as last time: only worth re-applying to pick up the org state, and only if
      // the user hasn't switched to a different deal in the meantime.
      if (last.withOrg || !withOrg || form.deal !== preselectDealId) return;
    }
    preselectAppliedRef.current = { started: true, dealId: preselectDealId, withOrg };
    applyDealSelection(preselectDealId);
    // applyDealSelection is recreated each render; keyed on the inputs that matter instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectDealId, deals, orgDetails, isEditing, formOverride]);

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
  const itemRowCols = "@2xl:grid-cols-[1.9fr_0.7fr_0.7fr_0.55fr_1.1fr_0.9fr_32px]";

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
                      <div className="flex items-center h-9 pl-2.5 pr-1 border border-[#E1E4EA] rounded-full focus-within:border-[#0085FF] min-w-0">
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
                        title={savingNumber ? "Saving..." : "Save"}
                        className="h-7 w-7 flex items-center justify-center rounded-full bg-[#0085FF] hover:bg-blue-600 text-white transition-colors disabled:opacity-60 flex-shrink-0"
                      >
                        {savingNumber ? (
                          <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        ) : (
                          <Check className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setNumberDraft(null)}
                        disabled={savingNumber}
                        title="Cancel"
                        className="h-7 w-7 flex items-center justify-center rounded-full border border-[#E1E4EA] text-[#525866] hover:bg-gray-50 transition-colors flex-shrink-0"
                      >
                        <X className="w-4 h-4" />
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
                      /* A single 3-column grid holding both the pill (row 1)
                         and its add-links (row 2), so each link's column is
                         sized together with — and lands exactly under — its
                         own field. Two separate rows/containers can't do
                         this: grid column widths are only shared within one
                         grid. */
                      <div className="hidden lg:inline-grid grid-cols-[auto_auto_auto] gap-y-0.5 flex-shrink-0">
                          <div className="h-9 border border-[#E1E4EA] border-r-0 rounded-l-full bg-[#F8F9FB] flex items-center relative">
                            <select
                              value={form.invoicePrefix}
                              onChange={(e) => setForm((prev) => ({ ...prev, invoicePrefix: e.target.value }))}
                              title={`${docName} number prefix`}
                              aria-label={`${docName} number prefix`}
                              className="h-full pl-3.5 pr-7 text-sm font-semibold text-[#1F2937] bg-transparent focus:outline-none appearance-none cursor-pointer"
                            >
                              {prefixOptions.length > 0 ? (
                                prefixOptions.map(pfx => (
                                  <option key={pfx} value={pfx}>{pfx}</option>
                                ))
                              ) : (
                                <option value={form.invoicePrefix}>{form.invoicePrefix || "None"}</option>
                              )}
                            </select>
                            <ChevronDown className="w-3.5 h-3.5 absolute right-2 text-gray-500 pointer-events-none" />
                          </div>
                          {/* Read-only while creating: the number comes from this
                              series' counter and is allocated on save, so it can't be
                              typed over. It stays renameable afterwards through the
                              pencil beside the saved number. */}
                          <input
                            type="text"
                            value={nextNumberPreview != null ? String(nextNumberPreview) : "Auto"}
                            readOnly
                            title={`${docName} number is allocated automatically on save`}
                            aria-label={`${docName} number`}
                            className="h-9 w-20 px-2 border-y border-[#E1E4EA] text-sm font-semibold text-[#1F2937] bg-[#F8F9FB] focus:outline-none cursor-default"
                          />
                          <div className="h-9 border border-[#E1E4EA] border-l-0 rounded-r-full bg-[#F8F9FB] flex items-center relative">
                            <select
                              value={form.invoiceSuffix}
                              onChange={(e) => setForm((prev) => ({ ...prev, invoiceSuffix: e.target.value }))}
                              title={`${docName} number suffix (optional)`}
                              aria-label={`${docName} number suffix`}
                              className="h-full pl-2.5 pr-7 text-sm font-semibold text-[#1F2937] bg-transparent focus:outline-none appearance-none cursor-pointer"
                            >
                              <option value="">None</option>
                              {suffixOptions.map(sfx => (
                                <option key={sfx} value={sfx}>{sfx}</option>
                              ))}
                            </select>
                            <ChevronDown className="w-3.5 h-3.5 absolute right-2 text-gray-500 pointer-events-none" />
                          </div>

                          {/* Row 2 — same 3 columns, so each link sits
                              directly under its own field. Both open the
                              Numbering tab, since prefix and suffix are
                              edited together there. */}
                          <button
                            type="button"
                            onClick={() => {
                              setTemplateDrawerTab("numbering");
                              setShowTemplates(true);
                            }}
                            className="justify-self-start text-[10px] font-medium text-blue-600 hover:text-blue-800 underline underline-offset-1 whitespace-nowrap"
                          >
                            + Add Prefix
                          </button>
                          <span />
                          <button
                            type="button"
                            onClick={() => {
                              setTemplateDrawerTab("numbering");
                              setShowTemplates(true);
                            }}
                            className="justify-self-start text-[10px] font-medium text-blue-600 hover:text-blue-800 underline underline-offset-1 whitespace-nowrap"
                          >
                            + Add Suffix
                          </button>
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
                className="h-8 w-8 lg:w-auto lg:px-4 flex items-center justify-center lg:justify-start gap-1.5 bg-white border border-[#E1E4EA] rounded-full text-[13px] font-medium text-[#1F2937] hover:bg-gray-50 transition-colors shadow-sm flex-shrink-0"
              >
                <SettingsIcon className="w-4 h-4 text-[#525866]" />
                <span className="hidden lg:inline">Settings</span>
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
              className="h-8 px-4 flex items-center gap-1.5 rounded-full bg-[#0085FF] hover:bg-blue-600 text-white text-sm font-medium transition-colors"
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
              Notes onward always renders from this file, unchanged. */}
          {hidePreview ? (
            <FullWidthDocumentPanel
              type={type}
              docName={docName}
              supportsGSTIN={supportsGSTIN}
              supportsTax={supportsTax}
              sellerState={orgDetails?.state}
              sectionNo={sectionNo}
              form={form}
              setField={setField}
              setForm={setForm}
              deals={deals}
              dealOptions={dealOptions}
              onAddDeal={onAddDeal}
              catalogue={catalogue}
              addItem={addItem}
              updateItem={updateItem}
              stripHtml={stripHtml}
              fieldErrors={fieldErrors}
              setFieldErrors={setFieldErrors}
              setShowQuickItemDrawer={setShowQuickItemDrawer}
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
                  onSelect={(o) => applyDealSelection(o.value)}
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
                <span className="text-[11px] font-medium text-[#99A0AE]">
                  Quick set:
                </span>
                {[7, 15, 30].map((days) => (
                  <button
                    key={days}
                    type="button"
                    title={`Set Due Date to ${days} days after the ${docName} date`}
                    onClick={() => {
                      setForm((prev) => {
                        // Base on the document date; if blank, fill it with today first.
                        const start = prev.date || new Date().toISOString().split("T")[0];
                        const d = new Date(start);
                        d.setDate(d.getDate() + days);
                        return { ...prev, date: start, dueDate: d.toISOString().split("T")[0] };
                      });
                    }}
                    className="h-6 px-2.5 text-[11px] font-medium rounded-full border-none focus:outline-none transition-colors text-[#525866] bg-[#F5F7FA] hover:bg-[#E1E4EA] cursor-pointer"
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
              onUseSaved={() => setAddressDrawer("billing")}
              onChange={(next) => {
                setFieldErrors((prev) => ({ ...prev, billingAddress: false }));
                // Same seller-state vs. customer-state re-check the deal
                // picker above runs, so editing the billing state directly
                // on this document also flips CGST/SGST vs IGST instead of
                // freezing whatever the deal's company implied.
                setForm((p) => {
                  const shipping = p.sameAsBilling ? next : p.shippingAddress;
                  const autoType = resolveTransactionType(orgDetails?.state, shipping, next);
                  return {
                    ...p,
                    billingAddress: next,
                    shippingAddress: shipping,
                    transactionType: supportsTax && autoType ? autoType : p.transactionType,
                  };
                });
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
                    // Shipping drives the place of supply, so mirroring (or
                    // un-mirroring) billing can change CGST/SGST vs IGST.
                    const shipping = nowSame ? p.billingAddress : p.shippingAddress;
                    const autoType = resolveTransactionType(orgDetails?.state, shipping, p.billingAddress);
                    return {
                      ...p,
                      sameAsBilling: nowSame,
                      shippingAddress: shipping,
                      transactionType: supportsTax && autoType ? autoType : p.transactionType,
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
              onUseSaved={() => setAddressDrawer("shipping")}
              onChange={(next) =>
                setForm((p) => {
                  const autoType = resolveTransactionType(orgDetails?.state, next, p.billingAddress);
                  return {
                    ...p,
                    shippingAddress: next,
                    transactionType: supportsTax && autoType ? autoType : p.transactionType,
                  };
                })
              }
            />
          </div>


          {supportsGSTIN && (
          <>
          <SectionHeader number={sectionNo.billing} title="Billing & Tax Information" />
          <div className="grid grid-cols-1 @md:grid-cols-2 gap-x-6 gap-y-2 w-full">
            <div className="flex flex-col gap-1" ref={gstinFieldRef}>
              <FieldLabel>Receiver GSTIN</FieldLabel>
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
                <p className="text-xs text-red-600 mt-1">Invalid GSTIN format (e.g., 22AAAAA0000A1Z5)</p>
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

            {/* The items section owns sectionNo.items; without this header that
                number was allocated but never shown, leaving a gap in the
                sidebar's 01..09 sequence. */}
            <SectionHeader number={sectionNo.items} title={`${docName} Items`} />

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
                            {/* appearance-none + our own chevron: the native
                                select arrow is ~20px wide and clipped "18%" to
                                "18" in this one-column cell. */}
                            <div className="relative">
                            <select
                              value={item.gstRate ?? 0}
                              onChange={(e) => updateItem(realIndex, { gstRate: parseFloat(e.target.value) })}
                              className="w-full appearance-none text-center text-[13px] border border-[#E1E4EA] rounded-lg pl-1.5 pr-4 py-1.5 bg-[#F8F9FB] focus:bg-white focus:outline-none focus:border-[#0085FF] cursor-pointer"
                            >
                              <option value={0}>0%</option>
                              <option value={5}>5%</option>
                              <option value={12}>12%</option>
                              <option value={18}>18%</option>
                              <option value={28}>28%</option>
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-[#99A0AE]" />
                            </div>
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
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <BankSelect
                    banks={banks}
                    value={form.bankDetails || ""}
                    onChange={(id) => setField("bankDetails", id)}
                  />
                </div>
                {/* Same round "+" pattern as Select Deal — quick-adds a bank
                    account without leaving this form. */}
                <button
                  type="button"
                  onClick={() => setShowBankModal(true)}
                  title="Add a new bank account"
                  aria-label="Add a new bank account"
                  className="w-10 h-10 flex-shrink-0 rounded-full bg-[#158FFF] hover:opacity-90 text-white flex items-center justify-center transition-colors"
                >
                  <PlusIcon className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[11px] text-[#99A0AE]">
                {banks.length === 0
                  ? "No bank accounts yet — add one above or in Settings → Bank Details."
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
              <div className="flex items-center gap-2">
                <div className="relative flex-1 min-w-0 flex items-center h-[38px] rounded-full border border-[#1F2937]/10 focus-within:ring-1 focus-within:ring-blue-500 overflow-hidden transition-all">
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
                {/* Same round "+" pattern as Select Deal — quick-adds a
                    signature (draw/type/upload) without leaving this form. */}
                <button
                  type="button"
                  onClick={() => setShowSignatureModal(true)}
                  title="Add a new signature"
                  aria-label="Add a new signature"
                  className="w-10 h-10 flex-shrink-0 rounded-full bg-[#158FFF] hover:opacity-90 text-white flex items-center justify-center transition-colors"
                >
                  <PlusIcon className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-[#99A0AE]">
                {signaturesLoading
                  ? "Loading signatures…"
                  : savedSignatures.length === 0
                    ? "No saved signatures yet — add one above."
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
                  className="h-9 px-4 flex items-center gap-1.5 bg-white border border-[#E1E4EA] rounded-full text-[13px] font-medium text-[#1F2937] hover:bg-gray-50 transition-colors whitespace-nowrap"
                >
                  <Printer className="w-3.5 h-3.5 text-[#525866]" />
                  Print
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="h-9 px-4 flex items-center gap-1.5 rounded-full bg-[#0085FF] hover:bg-blue-600 text-white text-[13px] font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
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
              setCatalogue(buildCatalogue(res.data));
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
        currentNotes={form.notes}
        currentTerms={form.terms}
      />

      <AddressBookDrawer
        isOpen={addressDrawer !== null}
        onClose={() => setAddressDrawer(null)}
        currentAddress={addressDrawer === "billing" ? form.billingAddress : form.shippingAddress}
        onApply={(next) => {
          setForm((p) => {
            const billing = addressDrawer === "billing" ? next : p.billingAddress;
            const shipping =
              addressDrawer === "billing" ? (p.sameAsBilling ? next : p.shippingAddress) : next;
            const autoType = resolveTransactionType(orgDetails?.state, shipping, billing);
            return {
              ...p,
              billingAddress: billing,
              shippingAddress: shipping,
              transactionType: supportsTax && autoType ? autoType : p.transactionType,
            };
          });
          if (addressDrawer === "billing") {
            setFieldErrors((prev) => ({ ...prev, billingAddress: false }));
          }
        }}
      />

      {/* Opened by "Change Template" above, and by the "+ Add Prefix"/
          "+ Add Suffix" links (which jump straight to the Numbering tab) —
          closing it refreshes orgTemplate, banks/numbering (via the effect
          above keyed on showTemplates) and the preview restyles. */}
      <TemplateDrawer
        isOpen={showTemplates}
        initialTab={templateDrawerTab}
        onClose={() => {
          setShowTemplates(false);
          setTemplateDrawerTab("template");
        }}
        type={type}
        docLabel={docName}
      />

      {/* Opened by the "+" beside Select Bank — same modal Settings → Bank
          Details uses; the new account is auto-selected once saved. */}
      <BankModal
        isOpen={showBankModal}
        onClose={() => setShowBankModal(false)}
        onSave={handleSaveBank}
        initialData={null}
        hasExistingDefault={banks.some((b) => b.isDefault)}
      />

      {/* Opened by the "+" beside Signature — same modal the Settings
          drawer's Signatures tab uses; the new signature is auto-selected
          once saved. */}
      <SignatureModal
        isOpen={showSignatureModal}
        initialData={null}
        onClose={() => setShowSignatureModal(false)}
        onSave={handleSaveSignature}
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
  );
};

export { CreateInvoicePanel };
