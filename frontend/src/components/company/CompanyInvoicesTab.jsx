import PdfIcon from "../common/PdfIcon";
import Checkbox from "../common/Checkbox";
import PlusIcon from "../common/PlusIcon";
import DownloadIcon from "../common/DownloadIcon";
import React, { useMemo, useState, useRef, useEffect } from "react";
import { DATE_RANGES, getDateRangeLabel } from "../../utils/dateBuckets";
import { createPortal } from "react-dom";
import { getAncestorZoom } from "../../utils/domUtils";
import { getPinnedBoundaryOverlayStyle } from "../../utils/pinnedColumnShadow";
import toast from "react-hot-toast";
// CreateInvoicePanel, not the default InvoiceForm export: it's what Accounting actually uses to
// create AND edit invoices, and it applies the org's default notes/terms to a new document. The
// default export's reset effect blanks notes/terms on open, so passing it defaults did nothing.
import { CreateInvoicePanel } from "../invoice/InvoiceForm";
import InvoiceFormFull from "../invoice/InvoiceFormFull";
import InvoiceStylePreview from "../invoice/InvoiceStylePreview";
import RecordPaymentModal from "../common/RecordPaymentModal";
import QuickDealForm from "../deal/QuickDealForm";
import MoreIcon from "../common/MoreIcon";
import EyeIcon from "../common/EyeIcon";
import EditIcon from "../common/EditIcon";
import useDocumentDefaults from "../../hooks/useDocumentDefaults";
import InvoicePdfPreview from "../invoice/InvoicePdfPreview";
import useFillToBottom from "../../hooks/useFillToBottom";
import FilterIcon from "../common/FilterIcon";
import HighlightText from "../common/HighlightText";
import CompanyFilterPanel from "./CompanyFilterPanel";
import { applyColumnFilters } from "../../utils/advancedFilters";
import TableSkeletonRows from "../common/TableSkeletonRows";
import StatTile from "../common/StatTile";
import StatTileSkeleton from "../common/StatTileSkeleton";
import Skeleton from "../common/Skeleton";
import BulkActionBar from "../common/BulkActionBar";
import { useBulkSelection, useBulkStrip } from "../../hooks/useBulkSelection";
import { exportToCSV } from "../../utils/exportToCSV";
import { bulkDelete } from "../../utils/bulkOperations";
import API from "../../services/api";
import {
  Filter,
  ArrowUp,
  ArrowDown,
  Pin,
  PinOff,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  EyeOff,
  X,
  IndianRupee,
} from "lucide-react";
import { EditablePaginationButtons } from "../common/EditablePaginationButtons";

import SearchIcon from "../common/SearchIcon";
const InvoiceNumberIcon = ({ size = 20, ...props }) => (
  <svg width={size} height={size} viewBox="24 18 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M29.4724 34.2819L30.3057 30.9486H27.1328L27.4453 29.6986H30.6182L31.4676 26.3011H28.2947L28.6072 25.0511H31.7801L32.6134 21.7178H33.8474L33.0141 25.0511H36.4597L37.293 21.7178H38.527L37.6936 25.0511H40.8666L40.5541 26.3011H37.3811L36.5318 29.6986H39.7047L39.3922 30.9486H36.2193L35.3859 34.2819H34.152L34.9853 30.9486H31.5397L30.7064 34.2819H29.4724ZM31.8522 29.6986H35.2978L36.1472 26.3011H32.7016L31.8522 29.6986Z" fill="#525252" />
  </svg>
);

const DealColumnIcon = ({ size = 20, ...props }) => (
  <svg width={size} height={size} viewBox="244 18 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M247.589 35.0833C247.168 35.0833 246.812 34.9375 246.521 34.6458C246.229 34.3542 246.083 33.9978 246.083 33.5769V24.9231C246.083 24.5022 246.229 24.1458 246.521 23.8542C246.812 23.5625 247.168 23.4167 247.589 23.4167H251.083V22.0065C251.083 21.5855 251.229 21.2292 251.521 20.9375C251.812 20.6458 252.168 20.5 252.589 20.5H255.41C255.831 20.5 256.187 20.6458 256.479 20.9375C256.771 21.2292 256.916 21.5855 256.916 22.0065V23.4167H260.41C260.831 23.4167 261.187 23.5625 261.479 23.8542C261.771 24.1458 261.916 24.5022 261.916 24.9231V33.5769C261.916 33.9978 261.771 34.3542 261.479 34.6458C261.187 34.9375 260.831 35.0833 260.41 35.0833H247.589ZM247.589 33.8333H260.41C260.474 33.8333 260.533 33.8066 260.586 33.7531C260.64 33.6998 260.666 33.641 260.666 33.5769V24.9231C260.666 24.859 260.64 24.8002 260.586 24.7469C260.533 24.6934 260.474 24.6667 260.41 24.6667H247.589C247.525 24.6667 247.467 24.6934 247.413 24.7469C247.36 24.8002 247.333 24.859 247.333 24.9231V33.5769C247.333 33.641 247.36 33.6998 247.413 33.7531C247.467 33.8066 247.525 33.8333 247.589 33.8333ZM252.333 23.4167H255.666V22.0065C255.666 21.9423 255.64 21.8835 255.586 21.8302C255.533 21.7767 255.474 21.75 255.41 21.75H252.589C252.525 21.75 252.467 21.7767 252.413 21.8302C252.36 21.8835 252.333 21.9423 252.333 22.0065V23.4167Z" fill="#525252" />
  </svg>
);

const IssueDateIcon = ({ size = 20, ...props }) => (
  <svg width={size} height={size} viewBox="473 18 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M477.423 35.9167C477.002 35.9167 476.646 35.7708 476.354 35.4792C476.063 35.1875 475.917 34.8312 475.917 34.4102V23.2565C475.917 22.8355 476.063 22.4792 476.354 22.1875C476.646 21.8958 477.002 21.75 477.423 21.75H478.577V19.9873H479.859V21.75H486.173V19.9873H487.423V21.75H488.577C488.998 21.75 489.354 21.8958 489.646 22.1875C489.938 22.4792 490.084 22.8355 490.084 23.2565V28.6571L488.834 29.9071V26.5898H477.167V34.4102C477.167 34.4744 477.194 34.5331 477.247 34.5865C477.301 34.6399 477.359 34.6667 477.423 34.6667H482.486L483.744 35.9167H477.423ZM477.167 25.3398H488.834V23.2565C488.834 23.1923 488.807 23.1336 488.753 23.0802C488.7 23.0267 488.641 23 488.577 23H477.423C477.359 23 477.301 23.0267 477.247 23.0802C477.194 23.1336 477.167 23.1923 477.167 23.2565V25.3398ZM486.76 36.3333L484.138 33.7196L485.016 32.8415L486.747 34.5721L490.209 31.1106L491.087 32.0017L486.76 36.3333Z" fill="#525252" />
  </svg>
);

const DueDateIcon = ({ size = 20, ...props }) => (
  <svg width={size} height={size} viewBox="706 18 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M710.167 25.3398H721.834V23.2565C721.834 23.1923 721.807 23.1336 721.753 23.0802C721.7 23.0267 721.641 23 721.577 23H710.423C710.359 23 710.301 23.0267 710.247 23.0802C710.194 23.1336 710.167 23.1923 710.167 23.2565V25.3398ZM710.423 35.9167C710.002 35.9167 709.646 35.7708 709.354 35.4792C709.063 35.1875 708.917 34.8312 708.917 34.4102V23.2565C708.917 22.8355 709.063 22.4792 709.354 22.1875C709.646 21.8958 710.002 21.75 710.423 21.75H711.577V19.9873H712.859V21.75H719.173V19.9873H720.423V21.75H721.577C721.998 21.75 722.354 21.8958 722.646 22.1875C722.938 22.4792 723.084 22.8355 723.084 23.2565V27.8094C722.884 27.7217 722.68 27.6509 722.471 27.5969C722.263 27.543 722.05 27.5006 721.834 27.4696V26.5898H710.167V34.4102C710.167 34.4744 710.194 34.5331 710.247 34.5865C710.301 34.6399 710.359 34.6667 710.423 34.6667H715.842C715.912 34.8974 715.997 35.1156 716.097 35.3213C716.197 35.527 716.311 35.7254 716.438 35.9167H710.423ZM718.505 35.6554C717.775 34.9257 717.411 34.0406 717.411 33C717.411 31.9595 717.775 31.0743 718.505 30.3446C719.235 29.6149 720.12 29.25 721.161 29.25C722.201 29.25 723.086 29.6149 723.816 30.3446C724.546 31.0743 724.911 31.9595 724.911 33C724.911 34.0406 724.546 34.9257 723.816 35.6554C723.086 36.3852 722.201 36.75 721.161 36.75C720.12 36.75 719.235 36.3852 718.505 35.6554ZM722.548 34.9071L723.068 34.3879L721.529 32.8494V30.5481H720.792V33.1506L722.548 34.9071Z" fill="#525252" />
  </svg>
);

const StatusColumnIcon = ({ size = 20, ...props }) => (
  <svg width={size} height={size} viewBox="937 18 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M943.913 35.2935C942.95 34.8779 942.112 34.314 941.399 33.6016C940.687 32.8893 940.122 32.0516 939.707 31.0885C939.291 30.1254 939.083 29.0965 939.083 28.0016C939.083 26.9066 939.291 25.8774 939.706 24.9139C940.122 23.9504 940.686 23.1124 941.398 22.3997C942.111 21.6871 942.948 21.1229 943.911 20.707C944.874 20.2913 945.903 20.0835 946.998 20.0835C948.093 20.0835 949.122 20.2913 950.086 20.7068C951.049 21.1224 951.887 21.6863 952.6 22.3987C953.313 23.1111 953.877 23.9488 954.293 24.9118C954.708 25.8749 954.916 26.9038 954.916 27.9987C954.916 29.0937 954.709 30.1229 954.293 31.0864C953.877 32.0499 953.313 32.8879 952.601 33.6006C951.889 34.3132 951.051 34.8775 950.088 35.2933C949.125 35.709 948.096 35.9168 947.001 35.9168C945.906 35.9168 944.877 35.7091 943.913 35.2935ZM942.277 32.7214L947 28.0002V21.3335C945.139 21.3335 943.562 21.9793 942.271 23.271C940.979 24.5627 940.333 26.1391 940.333 28.0002C940.333 28.8891 940.501 29.7419 940.837 30.5587C941.173 31.3755 941.653 32.0964 942.277 32.7214Z" fill="#525252" />
  </svg>
);

const AmountColumnIcon = ({ size = 20, ...props }) => (
  <svg width={size} height={size} viewBox="1120 18 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M1131.37 35.0832L1126.04 29.5384V28.16H1128.75C1129.54 28.16 1130.24 27.9071 1130.85 27.4013C1131.46 26.8955 1131.8 26.2189 1131.87 25.3717H1125.21V24.1217H1131.7C1131.49 23.55 1131.12 23.0813 1130.59 22.7155C1130.06 22.3495 1129.45 22.1665 1128.75 22.1665H1125.21V20.9165H1134.79V22.1665H1131.79C1132.09 22.4026 1132.35 22.6903 1132.57 23.0294C1132.79 23.3687 1132.94 23.7328 1133.02 24.1217H1134.79V25.3717H1133.13C1133.07 26.5523 1132.62 27.5205 1131.77 28.2763C1130.92 29.0321 1129.91 29.41 1128.75 29.41H1127.66L1133.1 35.0832H1131.37Z" fill="#525252" />
  </svg>
);

const TotalInvoicedIcon = ({ size = 20, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 17 19" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M0 18.769V0L1.38475 1.23075L2.80775 0L4.23075 1.23075L5.65375 0L7.077 1.23075L8.5 0L9.923 1.23075L11.3462 0L12.7693 1.23075L14.1923 0L15.6152 1.23075L17 0V18.769L15.6152 17.5383L14.1923 18.769L12.7693 17.5383L11.3462 18.769L9.923 17.5383L8.5 18.769L7.077 17.5383L5.65375 18.769L4.23075 17.5383L2.80775 18.769L1.38475 17.5383L0 18.769ZM2.75 13.8268H14.25V12.3268H2.75V13.8268ZM2.75 10.1345H14.25V8.6345H2.75V10.1345ZM2.75 6.44225H14.25V4.94225H2.75V6.44225ZM1.5 16.4845H15.5V2.2845H1.5V16.4845Z" fill="currentColor" />
  </svg>
);

const AmountCollectedIcon = ({ size = 20, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 21 23" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M2.98075 15.4423V7.94225H4.48075V15.4423H2.98075ZM8.48075 15.4423V7.94225H9.98075V15.4423H8.48075ZM0 5.94225V4.51925L9.23075 0L18.4615 4.51925V5.94225H0ZM3.5615 4.44225H14.9L9.23075 1.69225L3.5615 4.44225ZM0 18.9423V17.4423H11.5787C11.5992 17.7089 11.6282 17.9631 11.6655 18.2048C11.7027 18.4464 11.7552 18.6923 11.823 18.9423H0ZM13.9808 12.202V7.94225H15.4808V11.452L13.9808 12.202ZM17.2307 22.0575C16.1641 21.7935 15.282 21.1823 14.5845 20.224C13.8872 19.2657 13.5385 18.2013 13.5385 17.0308V14.673L17.2307 12.827L20.923 14.673V17.0308C20.923 18.2013 20.5743 19.2657 19.877 20.224C19.1795 21.1823 18.2974 21.7935 17.2307 22.0575ZM16.5058 19.2307L19.7595 15.9923L18.9212 15.1538L16.5058 17.5385L15.5307 16.5635L14.6923 17.4172L16.5058 19.2307Z" fill="currentColor" />
  </svg>
);


const OutstandingAmountIcon = ({ size = 20, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 17 19" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M9.073 15.0153C9.2295 14.8589 9.30775 14.6679 9.30775 14.4423C9.30775 14.2166 9.2295 14.0256 9.073 13.8693C8.91667 13.7129 8.72567 13.6348 8.5 13.6348C8.27433 13.6348 8.08333 13.7129 7.927 13.8693C7.7705 14.0256 7.69225 14.2166 7.69225 14.4423C7.69225 14.6679 7.7705 14.8589 7.927 15.0153C8.08333 15.1718 8.27433 15.25 8.5 15.25C8.72567 15.25 8.91667 15.1718 9.073 15.0153ZM7.75 11.7692H9.25V5.73075H7.75V11.7692ZM1.80775 19C1.30908 19 0.883083 18.8234 0.52975 18.4703C0.176583 18.1169 0 17.6909 0 17.1923V3.80775C0 3.30908 0.176583 2.88308 0.52975 2.52975C0.883083 2.17658 1.30908 2 1.80775 2H6.25775C6.32058 1.44483 6.56292 0.972749 6.98475 0.583749C7.40642 0.194583 7.9115 0 8.5 0C9.09483 0 9.60317 0.194583 10.025 0.583749C10.4468 0.972749 10.6859 1.44483 10.7423 2H15.1923C15.6909 2 16.1169 2.17658 16.4703 2.52975C16.8234 2.88308 17 3.30908 17 3.80775V17.1923C17 17.6909 16.8234 18.1169 16.4703 18.4703C16.1169 18.8234 15.6909 19 15.1923 19H1.80775ZM1.80775 17.5H15.1923C15.2692 17.5 15.3398 17.4679 15.4038 17.4038C15.4679 17.3398 15.5 17.2693 15.5 17.1923V3.80775C15.5 3.73075 15.4679 3.66025 15.4038 3.59625C15.3398 3.53208 15.2692 3.5 15.1923 3.5H1.80775C1.73075 3.5 1.66025 3.53208 1.59625 3.59625C1.53208 3.66025 1.5 3.73075 1.5 3.80775V17.1923C1.5 17.2693 1.53208 17.3398 1.59625 17.4038C1.66025 17.4679 1.73075 17.5 1.80775 17.5ZM9.0375 2.63375C9.17917 2.49208 9.25 2.31292 9.25 2.09625C9.25 1.87958 9.17917 1.70042 9.0375 1.55875C8.89583 1.41708 8.71667 1.34625 8.5 1.34625C8.28333 1.34625 8.10417 1.41708 7.9625 1.55875C7.82083 1.70042 7.75 1.87958 7.75 2.09625C7.75 2.31292 7.82083 2.49208 7.9625 2.63375C8.10417 2.77542 8.28333 2.84625 8.5 2.84625C8.71667 2.84625 8.89583 2.77542 9.0375 2.63375Z" fill="currentColor" />
  </svg>
);

const OverdueInvoicesIcon = ({ size = 20, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 22 17" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M4.09625 16.0578V14.5577H5.62875L7.55575 8.09825C7.66992 7.70325 7.8885 7.38942 8.2115 7.15675C8.53467 6.92408 8.89367 6.80775 9.2885 6.80775H12.2115C12.6063 6.80775 12.9653 6.92408 13.2885 7.15675C13.6115 7.38942 13.8301 7.70325 13.9443 8.09825L15.8712 14.5577H17.4038V16.0578H4.09625ZM7.2095 14.5577H14.2905L12.5 8.529C12.4808 8.45833 12.444 8.40383 12.3895 8.3655C12.335 8.327 12.2725 8.30775 12.202 8.30775H9.298C9.2275 8.30775 9.165 8.327 9.1105 8.3655C9.056 8.40383 9.01917 8.45833 9 8.529L7.2095 14.5577ZM10 4.5V0H11.5V4.5H10ZM15.7 6.86925L14.6307 5.8L17.825 2.63075L18.8693 3.675L15.7 6.86925ZM17 11.5V10H21.5V11.5H17ZM5.8 6.86925L2.63075 3.675L3.675 2.63075L6.86925 5.8L5.8 6.86925ZM0 11.5V10H4.5V11.5H0Z" fill="currentColor" />
  </svg>
);

// "Pending" and "Overdue" were missing here even though both are rendered by
// the table — "Overdue" has its own pill style and "Pending" is what a blank
// status displays as — so neither could ever be selected in the filter panel.
// The panel now merges these with the values actually present in the data
// (see CompanyFilterPanel), so this list is a display ORDER hint plus a
// guarantee that the common statuses are offered even when none are loaded.
const INVOICE_STATUS_OPTIONS = ["Draft", "Pending", "Sent", "Paid", "Overdue", "Accepted", "Rejected", "Delivered", "Void"];

const AMOUNT_RANGES = [
  { label: "Under ₹10,000", test: (v) => v < 10000 },
  { label: "₹10,000 – ₹50,000", test: (v) => v >= 10000 && v < 50000 },
  { label: "₹50,000 – ₹1,00,000", test: (v) => v >= 50000 && v < 100000 },
  { label: "Above ₹1,00,000", test: (v) => v >= 100000 },
];
const getAmountRangeLabel = (amount) => {
  const num = Number(amount) || 0;
  return AMOUNT_RANGES.find((r) => r.test(num))?.label || "";
};


const INVOICE_FILTER_COLUMNS = [
  { key: "status", label: "Status", options: INVOICE_STATUS_OPTIONS },
  { key: "amount", label: "Amount", options: AMOUNT_RANGES.map((r) => r.label) },
  { key: "dueDate", label: "Due Date", options: DATE_RANGES.map((r) => r.label) },
];

// companyId: the company this list belongs to (Company Profile: the profile; Deal page: the
//   deal's company). Preselected in "Add Deal", and used to keep new deals scoped to it.
// onDealCreated: lets the owning page add a deal created from here to its own deals state, so
//   it appears elsewhere on the page (e.g. the Deals tab) without a reload. Optional.
export default function CompanyInvoicesTab({ invoices, summary, loading, showStats = true, deals = [], refreshInvoices, autoOpenCreate = false, onAutoOpenCreateConsumed, companyId = null, onDealCreated }) {
  const [manualInvoiceFormOpen, setManualInvoiceFormOpen] = useState(false);
  // Same org document defaults Accounting passes, so an invoice gets identical notes, terms and
  // due date whichever screen it was created from.
  const documentDefaults = useDocumentDefaults();
  // Invoice being edited in the panel; null = creating a new one.
  const [editInvoice, setEditInvoice] = useState(null);
  // Split view (CreateInvoicePanel) <-> full width (InvoiceFormFull), exactly as Accounting.jsx
  // does it: the expand/minimize control hands the in-progress form across in `formHandoff`,
  // so switching views never drops what's been typed. The full-width preference is page state
  // that deliberately survives closing the form, as Accounting's invoiceFullWidth does.
  const [invoiceFullWidth, setInvoiceFullWidth] = useState(false);
  const [formHandoff, setFormHandoff] = useState(null);
  // The full-width form's Preview button, wired to the same InvoiceStylePreview as Accounting.
  const [showPreview, setShowPreview] = useState(false);
  const [previewStyle, setPreviewStyle] = useState(null);
  const [paymentInvoice, setPaymentInvoice] = useState(null);
  const [rowMenu, setRowMenu] = useState(null); // { id, top, left }

  // Deals created from this tab's "Add Deal". Kept locally as well as reported upward so the
  // open panel can select the new deal immediately, even when the parent doesn't pass
  // onDealCreated or re-renders later.
  const [createdDeals, setCreatedDeals] = useState([]);
  const availableDeals = useMemo(() => {
    const known = new Set(deals.map((d) => d._id));
    return [...deals, ...createdDeals.filter((d) => !known.has(d._id))];
  }, [deals, createdDeals]);
  const [justCreatedDealId, setJustCreatedDealId] = useState(null);
  // One deal -> select it; several -> the user chooses; a deal just made via "Add Deal" wins.
  const preselectDealId =
    justCreatedDealId || (availableDeals.length === 1 ? availableDeals[0]._id : null);

  const [showQuickDealForm, setShowQuickDealForm] = useState(false);
  const [dealFormCompanies, setDealFormCompanies] = useState([]);
  const [dealFormContacts, setDealFormContacts] = useState([]);
  // Same lazy load Accounting's onAddDeal does before opening QuickDealForm.
  const openAddDeal = async () => {
    if (dealFormCompanies.length === 0 || dealFormContacts.length === 0) {
      try {
        const [c, ct] = await Promise.all([API.get("/companies"), API.get("/contacts")]);
        setDealFormCompanies(c.data || []);
        setDealFormContacts(ct.data || []);
      } catch (err) {
        console.error("Failed to load companies/contacts", err);
      }
    }
    setShowQuickDealForm(true);
  };
  const handleDealCreated = (newDeal) => {
    setShowQuickDealForm(false);
    const newDealCompanyId = newDeal?.company?._id || newDeal?.company || null;
    // The invoice has to stay with the company being viewed. QuickDealForm lets the company be
    // changed; a deal for another company is still created, but isn't offered here.
    if (companyId && newDealCompanyId && String(newDealCompanyId) !== String(companyId)) {
      toast("Deal created for a different company, so it isn't available on this invoice.");
      return;
    }
    setCreatedDeals((prev) => [...prev, newDeal]);
    setJustCreatedDealId(newDeal._id);
    onDealCreated?.(newDeal);
  };
  // Opening an invoice from this tab shows it here rather than navigating
  // away — the number used to link to the invoices list page, which meant
  // leaving the company you were looking at to find the row again.
  const [previewInvoice, setPreviewInvoice] = useState(null);
  // Derived rather than copied into local state on a one-shot effect — a
  // copy raced the initial data load (whichever re-rendered first won) and
  // could get clobbered before ever becoming visible.
  const showInvoiceForm = manualInvoiceFormOpen || autoOpenCreate;
  const closeInvoiceForm = () => {
    setManualInvoiceFormOpen(false);
    setEditInvoice(null);
    // Handoff is per-session of the form; the full-width preference is intentionally kept.
    setFormHandoff(null);
    setJustCreatedDealId(null);
    if (autoOpenCreate) onAutoOpenCreateConsumed?.();
  };
  const openEditInvoice = (invoice) => {
    setEditInvoice(invoice);
    setManualInvoiceFormOpen(true);
  };
  const [searchTerm, setSearchTerm] = useState("");
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState({});
  const [sortConfig, setSortConfig] = useState({ key: null, direction: null });

  const getInvoiceFieldValue = (invoice, key) => {
    switch (key) {
      case "deal":
        return invoice.deal?.title || "";
      case "issueDate":
        // Column id stays "issueDate" (widths/pinning/sort keys are stored
        // under it), but the value lives on the model's `date` field.
        return invoice.date ? new Date(invoice.date).getTime() : 0;
      case "dueDate":
        return getDateRangeLabel(invoice.dueDate);
      case "amount":
        return getAmountRangeLabel(invoice.amount);
      case "status":
        // Must match what the status cell renders (`invoice.status || "Pending"`).
        // This previously fell back to "Draft", so an invoice with no status
        // DISPLAYED as "Pending" but FILTERED as "Draft" — selecting "Pending"
        // returned nothing, and selecting "Draft" returned rows labelled Pending.
        return invoice.status || "Pending";
      default:
        return invoice[key];
    }
  };

  const handleDownload = async (id) => {
    try {
      const response = await API.get(`/invoices/download/${id}`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `invoices-${id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      toast.success("Invoice downloaded successfully");
    } catch (error) {
      toast.error("Failed to download invoice document");
      console.error("Download invoice document error:", error);
    }
  };

  const filteredInvoices = useMemo(() => {
    let result = invoices;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(
        (inv) =>
          (inv.invoiceNumber || "").toLowerCase().includes(q) ||
          (inv.status || "").toLowerCase().includes(q) ||
          (inv.deal?.title || "").toLowerCase().includes(q),
      );
    }
    return applyColumnFilters(result, selectedFilters, getInvoiceFieldValue);
  }, [invoices, searchTerm, selectedFilters]);

  const sortedInvoices = useMemo(() => {
    if (!sortConfig.key) return filteredInvoices;
    return [...filteredInvoices].sort((a, b) => {
      let aVal = getInvoiceFieldValue(a, sortConfig.key);
      let bVal = getInvoiceFieldValue(b, sortConfig.key);
      if (sortConfig.key === "amount") {
        aVal = a.amount || 0;
        bVal = b.amount || 0;
      } else if (sortConfig.key === "dueDate") {
        aVal = a.dueDate ? new Date(a.dueDate).getTime() : 0;
        bVal = b.dueDate ? new Date(b.dueDate).getTime() : 0;
      }
      const aCmp = typeof aVal === "number" ? aVal : (aVal || "").toString().toLowerCase();
      const bCmp = typeof bVal === "number" ? bVal : (bVal || "").toString().toLowerCase();
      if (aCmp < bCmp) return sortConfig.direction === "asc" ? -1 : 1;
      if (aCmp > bCmp) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredInvoices, sortConfig]);

  const { selectedItems, toggleItem, clearSelection, selectAll } = useBulkSelection({
    items: filteredInvoices,
    onDelete: () => setShowBulkDeleteModal(true)
  });

  // Keeps the bulk strip mounted for one beat after deselect so its
  // slide-out animation can play instead of vanishing on the same frame.
  const { visible: bulkStripVisible, closing: bulkStripClosing } =
    useBulkStrip(selectedItems.length);

  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showBulkStatusModal, setShowBulkStatusModal] = useState(false);
  const [bulkStatusValue, setBulkStatusValue] = useState("");

  const handleSort = (key, forceDirection = null) => {
    setSortConfig((prev) => {
      if (forceDirection) {
        return prev.key === key && prev.direction === forceDirection
          ? { key: null, direction: null }
          : { key, direction: forceDirection };
      }
      if (prev.key !== key) return { key, direction: "asc" };
      if (prev.direction === "asc") return { key, direction: "desc" };
      return { key: null, direction: null };
    });
  };
  // Keeps the table box a fixed height that ends at the bottom of the screen,
  // so changing rows-per-page scrolls internally instead of growing the page.
  const {
    containerRef: fillContainerRef,
    footerRef: fillFooterRef,
    style: fillStyle,
  } = useFillToBottom();

  const [currentPage, setCurrentPage] = useState(1);
  const [limit, setLimit] = useState(10);
  
  const [hiddenColumns, setHiddenColumns] = useState(new Set());
  const [leftPinned, setLeftPinned] = useState(new Set());
  const [rightPinned, setRightPinned] = useState(new Set());
  const [openColumnMenuKey, setOpenColumnMenuKey] = useState(null);
  const [columnMenuPos, setColumnMenuPos] = useState(null);
  const columnMenuRef = useRef(null);

  const BASE_COLUMNS = useMemo(() => [
    { id: "invoiceNumber", label: "Invoice Number", width: 220 },
    { id: "deal", label: "Deal", width: 241 },
    { id: "issueDate", label: "Invoice Date", width: 233 },
    { id: "dueDate", label: "Due Date", width: 231 },
    { id: "status", label: "Status", width: 183 },
    { id: "amount", label: "Amount", width: 218 },
  ], []);

  const [columnOrder, setColumnOrder] = useState(() => BASE_COLUMNS.map(c => c.id));
  const [draggedColKey, setDraggedColKey] = useState(null);
  const [dragOverColKey, setDragOverColKey] = useState(null);
  const [dragGhost, setDragGhost] = useState(null);
  const dragOverRef = useRef(null);
  const ghostElRef = useRef(null);

  const orderedColumns = useMemo(() => {
    const sortedBase = [...BASE_COLUMNS].sort((a, b) => columnOrder.indexOf(a.id) - columnOrder.indexOf(b.id));
    const visible = sortedBase.filter(c => !hiddenColumns.has(c.id));
    const left = visible.filter(c => leftPinned.has(c.id));
    const right = visible.filter(c => rightPinned.has(c.id));
    const unpinned = visible.filter(c => !leftPinned.has(c.id) && !rightPinned.has(c.id));
    return [...left, ...unpinned, ...right];
  }, [BASE_COLUMNS, hiddenColumns, leftPinned, rightPinned, columnOrder]);

  const pinColumnToSide = (colId, side) => {
    if (side === "left") {
      setLeftPinned(prev => new Set(prev).add(colId));
      setRightPinned(prev => { const next = new Set(prev); next.delete(colId); return next; });
    } else {
      setRightPinned(prev => new Set(prev).add(colId));
      setLeftPinned(prev => { const next = new Set(prev); next.delete(colId); return next; });
    }
  };

  const unpinColumn = (colId) => {
    setLeftPinned(prev => { const next = new Set(prev); next.delete(colId); return next; });
    setRightPinned(prev => { const next = new Set(prev); next.delete(colId); return next; });
  };

  const toggleHideColumn = (colId) => {
    setHiddenColumns(prev => {
      const next = new Set(prev);
      next.add(colId);
      return next;
    });
  };

  const getColumnPinSide = (colId) => {
    if (leftPinned.has(colId)) return "left";
    if (rightPinned.has(colId)) return "right";
    return null;
  };


  const startColumnDrag = (e, colId) => {
    if (e.button !== 0) return;
    if (e.target.closest("button") || e.target.closest("[data-resize-handle]")) return;

    // No click-count gate here, matching the Companies list page: a press plus
    // DRAG_THRESHOLD px of movement starts the drag, at whatever speed the user
    // moves. Gating on `e.detail` meant only a fast-enough double-click could
    // begin a move. The threshold below is what keeps a plain click harmless,
    // and the column menu opens from its own chevron button, never from the
    // header background — so nothing competes with the drag for a single press.

    // A plain click must stay harmless, so nothing happens until the pointer
    // has travelled DRAG_THRESHOLD px — the same deferred start the Companies
    // list page uses. Until then no ghost is mounted and no drag state is set.
    const th = e.currentTarget;
    const startX = e.clientX;
    const startY = e.clientY;
    const DRAG_THRESHOLD = 5;
    let dragStarted = false;
    let positionGhost = () => {};

    const beginDrag = () => {
      dragStarted = true;
      e.preventDefault();
      window.getSelection?.()?.removeAllRanges();
      const rect = th.getBoundingClientRect();
      const label = BASE_COLUMNS.find((vc) => vc.id === colId)?.label || colId;
    
      const previewRows = (invoices || []).slice(0, 10).map((inv) => {
        let val = inv[colId];
        if (typeof val === 'object' && val !== null) val = val?.name || val?.title || "";
        return String(val ?? "").trim() || "—";
      });

      const zGhost = getAncestorZoom(document.body);
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;

      dragOverRef.current = null;
      setDraggedColKey(colId);
      setDragOverColKey(null);
      document.body.style.userSelect = "none";

      setDragGhost({
        label,
        previewRows,
        offsetX,
        offsetY,
        width: rect.width / zGhost,
        height: rect.height / zGhost,
      });

      positionGhost = (clientX, clientY) => {
        const el = ghostElRef.current;
        if (!el) return;
        const visualTop = clientY - offsetY;
        const visualLeft = clientX - offsetX;
        el.style.top = `${visualTop / zGhost}px`;
        el.style.left = `${visualLeft / zGhost}px`;
        el.style.maxHeight = `${Math.max(100, window.innerHeight - visualTop - 72) / zGhost}px`;
      };
      requestAnimationFrame(() => positionGhost(startX, startY));
    };

    const handleMouseMove = (moveEvent) => {
      if (!dragStarted) {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        beginDrag();
      }
      positionGhost(moveEvent.clientX, moveEvent.clientY);
      const elAtPoint = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
      const thAtPoint = elAtPoint?.closest("th[data-col-id]");
      const overKey = thAtPoint?.getAttribute("data-col-id") || null;
      if (dragOverRef.current !== overKey) {
        dragOverRef.current = overKey;
        setDragOverColKey(overKey);
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      if (!dragStarted) return;
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
    setColumnOrder((prev) => {
      const newOrder = [...prev];
      const draggedIdx = newOrder.indexOf(draggedKey);
      const targetIdx = newOrder.indexOf(targetKey);
      if (draggedIdx === -1 || targetIdx === -1) return prev;
      newOrder.splice(draggedIdx, 1);
      newOrder.splice(targetIdx, 0, draggedKey);
      return newOrder;
    });
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (columnMenuRef.current && !columnMenuRef.current.contains(e.target)) {
        setOpenColumnMenuKey(null);
        setColumnMenuPos(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [colWidths, setColWidths] = useState({
    invoiceNumber: 220,
    deal: 241,
    issueDate: 233,
    dueDate: 231,
    status: 183,
    amount: 218,
  });
  const [resizingCol, setResizingCol] = useState(null);
  const resizingRef = React.useRef(null);
  const totalTableWidth = useMemo(
    () => Object.values(colWidths).reduce((sum, w) => sum + w, 0),
    [colWidths],
  );

  const stickyStyles = useMemo(() => {
    const map = {};
    let leftOffset = 44; // selection column width is 44px
    for (const col of orderedColumns) {
      if (leftPinned.has(col.id)) {
        map[col.id] = {
          position: "sticky",
          left: leftOffset,
          zIndex: 20,
          backgroundColor: "#fff",
        };
        leftOffset += colWidths[col.id] || 200;
      }
    }
    let rightOffset = 0;
    for (const col of [...orderedColumns].reverse()) {
      if (rightPinned.has(col.id)) {
        map[col.id] = {
          position: "sticky",
          right: rightOffset,
          zIndex: 20,
          backgroundColor: "#fff",
        };
        rightOffset += colWidths[col.id] || 200;
      }
    }
    return map;
  }, [orderedColumns, leftPinned, rightPinned, colWidths]);

  const getStickyStyle = (colId, isHeader = false, isSelected = false) => {
    const isPinned = leftPinned.has(colId) || rightPinned.has(colId);
    const style = stickyStyles[colId] || {};
    return {
      ...style,
      position: isPinned ? "sticky" : "relative",
      zIndex: isPinned ? (isHeader ? 35 : 20) : undefined,
      backgroundColor: isPinned ? (isHeader ? "#F5F7FA" : (isSelected ? "#EFF6FF" : "#fff")) : undefined,
      boxShadow: "inset -1px 0 0 #E1E4EA, inset 0 -1px 0 #E1E4EA",
    };
  };

  const getBoundaryShadowSide = (colId) => {
    const leftPinnedCols = orderedColumns.filter(c => leftPinned.has(c.id));
    const rightPinnedCols = orderedColumns.filter(c => rightPinned.has(c.id));
    if (leftPinnedCols.length > 0 && leftPinnedCols[leftPinnedCols.length - 1].id === colId) return "left";
    if (rightPinnedCols.length > 0 && rightPinnedCols[0].id === colId) return "right";
    return null;
  };

  const startResize = (e, colId) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { colId, startX: e.clientX, startWidth: colWidths[colId] };
    setResizingCol(colId);

    const onMouseMove = (moveEvent) => {
      if (!resizingRef.current) return;
      const { colId: id, startX, startWidth } = resizingRef.current;
      const newWidth = Math.max(60, startWidth + (moveEvent.clientX - startX));
      setColWidths((prev) => ({ ...prev, [id]: newWidth }));
    };

    const onMouseUp = () => {
      resizingRef.current = null;
      setResizingCol(null);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };


  const totalInvoiced = summary?.totalAmount || 0;
  const totalCount = summary?.totalInvoices || invoices.length;
  const outstanding = summary?.amountDue || 0;
  const collected = summary?.amountPaid || 0;
  const overdueAmount = summary?.overdueAmount || 0;

  const pendingCount = invoices.filter((inv) => inv.status !== "Paid").length;
  const overdueCount = invoices.filter(
    (inv) =>
      inv.status !== "Paid" && inv.dueDate && new Date(inv.dueDate) < new Date(),
  ).length;
  const collectionRate =
    totalInvoiced > 0 ? Math.round((collected / totalInvoiced) * 100) : 0;

  const totalCountFiltered = filteredInvoices.length;
  const totalPages = Math.max(1, Math.ceil(totalCountFiltered / limit));
  const startItem = totalCountFiltered === 0 ? 0 : (currentPage - 1) * limit + 1;
  const endItem = Math.min(currentPage * limit, totalCountFiltered);
  const hasPrevPage = currentPage > 1;
  const hasNextPage = currentPage < totalPages;

  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  const handleExportSelected = () => {
    const dataToExport = invoices.filter(inv => selectedItems.includes(inv._id)).map(inv => ({
      "Invoice Number": inv.invoiceNumber || "",
      "Deal": inv.deal?.title || "",
      "Invoice Date": inv.date ? new Date(inv.date).toLocaleDateString() : "",
      "Due Date": inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "",
      "Status": inv.status || "Draft",
      "Amount": inv.amount || 0,
    }));
    const headers = Object.keys(dataToExport[0] || {}).join(",");
    const rows = dataToExport.map(row => Object.values(row).map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
    exportToCSV([headers, ...rows], `invoices_export_${new Date().toISOString().split("T")[0]}.csv`);
  };

  const handleBulkDelete = async () => {
    setBulkActionLoading(true);
    try {
      await bulkDelete("invoices", selectedItems);
      refreshInvoices?.();
      toast.success(`${selectedItems.length} invoice(s) deleted`);
      clearSelection();
      setShowBulkDeleteModal(false);
    } catch (error) {
      console.error("Bulk delete failed:", error);
      toast.error("Failed to delete invoices");
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkUpdateStatus = async () => {
    if (!bulkStatusValue) return;
    setBulkActionLoading(true);
    try {
      await Promise.all(selectedItems.map(id => API.patch(`/invoices/${id}`, { status: bulkStatusValue })));
      refreshInvoices?.();
      toast.success(`Status updated for ${selectedItems.length} invoice(s)`);
      clearSelection();
      setShowBulkStatusModal(false);
    } catch (error) {
      console.error("Bulk update failed:", error);
      toast.error("Failed to update invoices");
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleSelectAllAcrossPages = () => selectAll(filteredInvoices);

  const handleLimitChange = (newLimit) => {
    setLimit(newLimit);
    setCurrentPage(1);
  };

  const getPageNumbers = () => {
    const items = [1];
    if (currentPage > 2) items.push("left-dots");
    if (currentPage !== 1 && currentPage !== totalPages) items.push(currentPage);
    if (currentPage < totalPages - 1) items.push("right-dots");
    if (totalPages > 1) items.push(totalPages);
    return items;
  };

  const paginatedInvoices = useMemo(
    () => sortedInvoices.slice((currentPage - 1) * limit, currentPage * limit),
    [sortedInvoices, currentPage, limit],
  );

  const statusPillStyle = (status) => {
    if (status === "Paid") return { backgroundColor: "rgba(0, 201, 80, 0.1)", color: "#00A63E" };
    if (status === "Overdue") return { backgroundColor: "rgba(232, 34, 34, 0.1)", color: "#E82222" };
    return { backgroundColor: "rgba(0, 133, 255, 0.1)", color: "#0085FF" };
  };

  const kpiTiles = [
    {
      label: "Total Invoiced",
      value: `₹${totalInvoiced.toLocaleString("en-IN")}`,
      icon: TotalInvoicedIcon,
      subtitle: `Over ${totalCount} invoices`,
      subtitleClass: "text-gray-400",
    },
    {
      label: "Outstanding Amount",
      value: `₹${outstanding.toLocaleString("en-IN")}`,
      icon: OutstandingAmountIcon,
      subtitle: `${pendingCount} invoices pending`,
      subtitleClass: "text-red-500",
    },
    {
      label: "Amount Collected",
      value: `₹${collected.toLocaleString("en-IN")}`,
      icon: AmountCollectedIcon,
      subtitle: `${collectionRate}% Collection Rate`,
      subtitleClass: "text-green-600",
      subtitleIcon: ArrowUp,
    },
    {
      label: "Overdue Invoices",
      value: overdueCount,
      icon: OverdueInvoicesIcon,
      subtitle: `₹${overdueAmount.toLocaleString("en-IN")} Overdue`,
      subtitleClass: "text-red-500",
      subtitleIcon: ArrowDown,
    },
  ];

  return (
    <div>
      {/* KPI Tiles */}
      {showStats && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <StatTileSkeleton key={i} />)
            ) : (
              kpiTiles.map((tile) => (
                <StatTile key={tile.label} tile={tile} />
              ))
            )}
          </div>

          <div className="-mx-6" style={{ marginTop: 24, paddingBottom: 24, borderTop: "1px solid #E1E4EA" }} />
        </>
      )}

      {/* Search + Controls */}
      {loading ? (
        <div className="flex items-center gap-4 mb-4" style={{ height: "44px" }}>
          <Skeleton height={44} shape="rect" className="flex-1 rounded-full" />
          <Skeleton height={44} width={86} shape="rect" className="rounded-full flex-shrink-0" />
          <Skeleton height={44} width={44} shape="circle" className="flex-shrink-0" />
        </div>
      ) : bulkStripVisible ? (
        <BulkActionBar
          isClosing={bulkStripClosing}
          selectedCount={selectedItems.length}
          entityName="invoice"
          onSelectAll={handleSelectAllAcrossPages}
          onDeselectAll={clearSelection}
          onExport={handleExportSelected}
          onUpdateStatus={() => setShowBulkStatusModal(true)}
          onDelete={() => setShowBulkDeleteModal(true)}
          onCancel={clearSelection}
        />
      ) : (
        <div className="flex items-center gap-4 mb-4" style={{ height: "44px" }}>
          <div className="relative flex-1 h-full">
            <SearchIcon
              className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#525866]"
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search invoices by number, deal, or status..."
              className="w-full h-full pl-10 pr-10 border border-[rgba(31,41,55,0.1)] rounded-full text-sm focus:outline-none focus:border-[#0085FF]"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-900 focus:outline-none"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilterPanel(true)}
            className="relative flex items-center justify-center gap-2 px-3 text-sm font-medium text-gray-800 bg-white border rounded-full hover:bg-gray-50 flex-shrink-0"
            style={{
              height: "44px",
              borderColor: Object.values(selectedFilters).flat().length > 0 ? "#0085FF" : "#E1E4EA",
            }}
          >
            <FilterIcon size={16} />
            Filter
            {Object.values(selectedFilters).flat().length > 0 && (
              <span className="absolute -top-2 -right-2 bg-blue-600 text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full ring-2 ring-white">
                {Object.values(selectedFilters).flat().length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setManualInvoiceFormOpen(true)}
            className="flex items-center justify-center rounded-full border hover:bg-gray-50 flex-shrink-0"
            style={{ width: "44px", height: "44px", borderColor: "#E1E4EA" }}
            title="Add Invoice"
          >
            <PlusIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {!loading && invoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center w-full min-h-[300px] bg-gray-50 border border-gray-200 rounded-xl text-gray-500">
          <PdfIcon className="w-7 h-7 mb-3 text-gray-400" />
          <button
            type="button"
            onClick={() => setManualInvoiceFormOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-[#0085FF] text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            Add new invoice
          </button>
        </div>
      ) : (
      <div
        ref={fillContainerRef}
        style={fillStyle}
        className="relative bg-white border border-[#E1E4EA] rounded-lg overflow-x-auto overflow-y-auto"
      >
        <table
          className="w-full border-separate border-spacing-0 text-left"
          style={{ tableLayout: "fixed", width: "100%", minWidth: totalTableWidth, maxWidth: "100%" }}
        >
          <thead className="sticky top-0 z-30 bg-[#F5F7FA] border-b border-[#E1E4EA]">
            <tr>
              {/* Page-scoped select-all: ticks exactly the rows on the CURRENT page
                  (10 per page -> 10, 50 -> 50). Distinct from the bulk strip's
                  "Select All", which spans every record across all pages. */}
              <th
                style={{
                  width: 44,
                  height: 56,
                  position: "sticky",
                  left: 0,
                  zIndex: 35,
                  backgroundColor: "#F5F7FA",
                  boxShadow: "inset -1px 0 0 #E1E4EA, inset 0 -1px 0 #E1E4EA",
                }}
                className="px-3 py-2.5"
              >
                <div className="flex justify-center items-center w-full">
                  <Checkbox checked={selectedItems.length > 0 && selectedItems.length === paginatedInvoices.length} onChange={(e) => e.target.checked ? selectAll(paginatedInvoices) : clearSelection()}  uncheckedColor="text-[#525866]"/>
                </div>
              </th>
              {orderedColumns.map((col) => {
                const isDragging = draggedColKey === col.id;
                const isDragOver = dragOverColKey === col.id && draggedColKey && draggedColKey !== col.id;
                const boundarySide = getBoundaryShadowSide(col.id);
                return (
                  <th
                    key={col.id}
                    data-col-id={col.id}
                    onMouseDown={(e) => startColumnDrag(e, col.id)}
                    style={{ 
                      width: colWidths[col.id], 
                      height: 56, 
                      opacity: isDragging ? 0.35 : 1,
                      ...getStickyStyle(col.id, true)
                    }}
                    className={`px-3 py-2.5 font-medium text-[#525866] text-xs cursor-grab active:cursor-grabbing bg-[#F5F7FA] ${isDragOver ? "bg-blue-100" : "hover:bg-gray-100"}`}
                  >
                    <div className={`flex items-center justify-between w-full group ${loading ? "[&_button]:invisible" : ""}`}>
                      {loading ? (
                        <Skeleton width="65%" height={12} />
                      ) : (
                        <div className="flex items-center gap-1.5 min-w-0 truncate">
                          <span className="truncate flex-1 min-w-0" title={col.label}>
                            {col.label}
                            {sortConfig.key === col.id && (sortConfig.direction === "asc"
                              ? <ArrowUp className="w-3 h-3 text-[#0085FF] flex-shrink-0" />
                              : <ArrowDown className="w-3 h-3 text-[#0085FF] flex-shrink-0" />)}
                          </span>
                          {(leftPinned.has(col.id) || rightPinned.has(col.id)) && (
                            <Pin size={12} className="text-blue-500 fill-blue-500 flex-shrink-0 ml-1" style={{ transform: "rotate(45deg)" }} />
                          )}
                        </div>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (openColumnMenuKey === col.id) {
                            setOpenColumnMenuKey(null);
                            setColumnMenuPos(null);
                            return;
                          }
                          // rect is VISUAL px; the menu is portaled into document.body, which paints
                          // inside the dynamic <html> zoom, so rect-derived values must be divided by
                          // that zoom or the browser applies it twice. The resulting drift is
                          // PROPORTIONAL to the button's x position (pos x (zoom-1)), which is why it
                          // was invisible on the first column and obvious on the last — and why the
                          // old fixed `-80` nudge for the last column could never be right everywhere.
                          // MENU_W and the +4/8 gaps are already in portal space, so they are NOT divided.
                          const zMenu = getAncestorZoom(document.body);
                          const MENU_W = 190;
                          const rect = e.currentTarget.getBoundingClientRect();
                          let calculatedLeft = rect.right / zMenu - MENU_W;
                          calculatedLeft = Math.min(calculatedLeft, window.innerWidth / zMenu - MENU_W - 8);
                          calculatedLeft = Math.max(calculatedLeft, 8);
                          setColumnMenuPos({ top: rect.bottom / zMenu + 4, left: calculatedLeft });
                          setOpenColumnMenuKey(col.id);
                        }}
                        className="p-1 rounded hover:bg-gray-200 transition-colors text-gray-500 flex-shrink-0"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>

                      {openColumnMenuKey === col.id && columnMenuPos && createPortal(
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
                                getColumnPinSide(col.id) === "left" ? unpinColumn(col.id) : pinColumnToSide(col.id, "left");
                              }}
                              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${getColumnPinSide(col.id) === "left" ? "bg-blue-50 text-blue-700" : "text-[#161618] hover:bg-gray-50"}`}
                            >
                              {getColumnPinSide(col.id) === "left" ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5 text-[#1C1B1F]" />}
                              Pin to Left
                            </button>
                            <button
                              onClick={() => {
                                setOpenColumnMenuKey(null);
                                setColumnMenuPos(null);
                                getColumnPinSide(col.id) === "right" ? unpinColumn(col.id) : pinColumnToSide(col.id, "right");
                              }}
                              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${getColumnPinSide(col.id) === "right" ? "bg-blue-50 text-blue-700" : "text-[#161618] hover:bg-gray-50"}`}
                            >
                              {getColumnPinSide(col.id) === "right" ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5 text-[#1C1B1F]" />}
                              Pin to Right
                            </button>
                            <button
                              onClick={() => {
                                setOpenColumnMenuKey(null);
                                setColumnMenuPos(null);
                                handleSort(col.id, "asc");
                                setCurrentPage(1);
                              }}
                              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${sortConfig.key === col.id && sortConfig.direction === "asc" ? "bg-blue-50 text-blue-700 font-medium" : "text-[#161618] hover:bg-gray-50"}`}
                            >
                              <ChevronUp className="w-3.5 h-3.5 text-[#1C1B1F]" />
                              Sort Ascending
                            </button>
                            <button
                              onClick={() => {
                                setOpenColumnMenuKey(null);
                                setColumnMenuPos(null);
                                handleSort(col.id, "desc");
                                setCurrentPage(1);
                              }}
                              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${sortConfig.key === col.id && sortConfig.direction === "desc" ? "bg-blue-50 text-blue-700 font-medium" : "text-[#161618] hover:bg-gray-50"}`}
                            >
                              <ChevronDown className="w-3.5 h-3.5 text-[#1C1B1F]" />
                              Sort Descending
                            </button>
                            <div className="w-full border-t border-[#F1F1F5] my-0.5" />
                            <button
                              onClick={() => {
                                setOpenColumnMenuKey(null);
                                setColumnMenuPos(null);
                                toggleHideColumn(col.id);
                              }}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap text-[#161618] hover:bg-gray-50"
                            >
                              <EyeOff className="w-3.5 h-3.5 text-[#1C1B1F]" />
                              Hide Column
                            </button>
                          </div>
                        </>,
                        document.body
                      )}

                      <div
                        data-resize-handle="true"
                        onMouseDown={(e) => startResize(e, col.id)}
                        className={`absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none hover:bg-blue-400 z-10 ${resizingCol === col.id ? "bg-blue-500" : "bg-transparent"}`}
                      />
                    </div>
                    {boundarySide && <div style={getPinnedBoundaryOverlayStyle(boundarySide)} />}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="bg-white">
            {loading ? (
              <TableSkeletonRows
                columns={orderedColumns.map(c => colWidths[c.id])}
                hasCheckbox={true}
                numRows={limit}
                rowHeight={54}
              />
            ) : paginatedInvoices.length === 0 ? (
              <tr>
                <td colSpan={orderedColumns.length + 1} className="px-6 py-12 text-center text-gray-500 font-medium border-b border-[#E1E4EA]">
                  No invoices found.
                </td>
              </tr>
            ) : (
              paginatedInvoices.map((invoice) => {
                const isSelected = selectedItems.includes(invoice._id);
                const issueDate = invoice.date
                  ? new Date(invoice.date).toLocaleDateString("en-US", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                  : "—";
                const dueDate = invoice.dueDate
                  ? new Date(invoice.dueDate).toLocaleDateString("en-US", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                  : "—";
                return (
                  <tr key={invoice._id} className={`hover:bg-gray-50 transition-colors group ${isSelected ? "!bg-blue-50" : ""}`}>
                    <td
                      style={{
                        height: 54,
                        width: 44,
                        position: "sticky",
                        left: 0,
                        zIndex: 10,
                        backgroundColor: isSelected ? "#EFF6FF" : "#fff",
                        boxShadow: "inset -1px 0 0 #E1E4EA, inset 0 -1px 0 #E1E4EA",
                      }}
                      className="px-3"
                    >
                      <div className="flex justify-center items-center w-full">
                        <Checkbox checked={isSelected} onChange={() => toggleItem(invoice._id)} />
                      </div>
                    </td>
                    {orderedColumns.map((col) => {
                      const isDragging = draggedColKey === col.id;
                      const cellStyle = {
                        height: 54,
                        opacity: isDragging ? 0.35 : 1,
                        ...getStickyStyle(col.id, false, isSelected)
                      };
                      const boundarySide = getBoundaryShadowSide(col.id);
                      const boundaryOverlay = boundarySide && <div style={getPinnedBoundaryOverlayStyle(boundarySide)} />;
                      const isLastCol = col.id === orderedColumns[orderedColumns.length - 1]?.id;
                      const downloadButton = (
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (rowMenu?.id === invoice._id) {
                                setRowMenu(null);
                                return;
                              }
                              // Same zoom-aware, viewport-clamped placement as Accounting's row menu.
                              const z = getAncestorZoom(document.body);
                              const MENU_W = 160;
                              const MENU_H = 150;
                              const MARGIN = 8;
                              const rect = e.currentTarget.getBoundingClientRect();
                              const viewportH = window.innerHeight / z;
                              const viewportW = window.innerWidth / z;
                              const below = rect.bottom / z + 4;
                              const openUp = viewportH - below < MENU_H + MARGIN;
                              let top = openUp ? rect.top / z - 4 - MENU_H : below;
                              top = Math.max(MARGIN, Math.min(top, viewportH - MENU_H - MARGIN));
                              let left = rect.right / z - MENU_W;
                              left = Math.max(MARGIN, Math.min(left, viewportW - MENU_W - MARGIN));
                              setRowMenu({ id: invoice._id, top, left });
                            }}
                            className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                            title="More actions"
                          >
                            <MoreIcon className="w-4 h-4" />
                          </button>
                        </div>
                      );

                      if (col.id === "invoiceNumber") {
                        return (
                          <td key={col.id} style={cellStyle} className="px-3 text-left">
                            <div className="flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => setPreviewInvoice(invoice)}
                                className="text-[14px] leading-5 font-medium text-blue-600 hover:text-blue-700 truncate block min-w-0 text-left"
                              >
                                <HighlightText text={invoice.invoiceNumber || invoice._id} query={searchTerm} />
                              </button>
                              {isLastCol && downloadButton}
                            </div>
                            {boundaryOverlay}
                          </td>
                        );
                      }
                      if (col.id === "deal") {
                        return (
                          <td
                            key={col.id}
                            style={cellStyle}
                            className="px-3 text-[14px] leading-5 font-medium text-[#525866] text-left"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate block min-w-0">
                                <HighlightText text={invoice.deal?.title || "-"} query={searchTerm} />
                              </span>
                              {isLastCol && downloadButton}
                            </div>
                            {boundaryOverlay}
                          </td>
                        );
                      }
                      if (col.id === "issueDate") {
                        return (
                          <td
                            key={col.id}
                            style={cellStyle}
                            className="px-3 text-[14px] leading-5 font-medium text-[#525866] whitespace-nowrap text-left"
                          >
                            <div className="flex items-center justify-between gap-2">
                              {issueDate}
                              {isLastCol && downloadButton}
                            </div>
                            {boundaryOverlay}
                          </td>
                        );
                      }
                      if (col.id === "dueDate") {
                        return (
                          <td
                            key={col.id}
                            style={cellStyle}
                            className="px-3 text-[14px] leading-5 font-medium text-[#525866] whitespace-nowrap text-left"
                          >
                            <div className="flex items-center justify-between gap-2">
                              {dueDate}
                              {isLastCol && downloadButton}
                            </div>
                            {boundaryOverlay}
                          </td>
                        );
                      }
                      if (col.id === "status") {
                        return (
                          <td key={col.id} style={cellStyle} className="px-3">
                            <div className="flex items-center justify-between gap-2">
                              <span
                                style={{ padding: "5px 12px", borderRadius: 53, ...statusPillStyle(invoice.status) }}
                                className="inline-flex items-center justify-center text-xs font-medium whitespace-nowrap"
                              >
                                <HighlightText text={invoice.status || "Pending"} query={searchTerm} />
                              </span>
                              {isLastCol && downloadButton}
                            </div>
                            {boundaryOverlay}
                          </td>
                        );
                      }
                      if (col.id === "amount") {
                        return (
                          <td key={col.id} style={cellStyle} className="px-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[14px] leading-5 font-semibold text-[#222530] whitespace-nowrap">
                                ₹{(invoice.amount || 0).toLocaleString("en-IN")}
                              </span>
                              {isLastCol && downloadButton}
                            </div>
                            {boundaryOverlay}
                          </td>
                        );
                      }
                      return null;
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      )}

      {totalCountFiltered > 0 && (
        <div
          ref={fillFooterRef}
          className="w-full bg-transparent px-4 py-3 mt-3 flex items-center justify-between sm:px-6"
        >
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
                <span className="font-semibold">{totalCountFiltered}</span> results
              </p>
              <select
                value={limit}
                onChange={(e) => handleLimitChange(parseInt(e.target.value))}
                className="ml-2 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer font-inter"
              >
                <option value={10}>10 per page</option>
                <option value={20}>20 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
              </select>
            </div>

            <EditablePaginationButtons
              currentPage={currentPage}
              totalPages={totalPages}
              hasPrevPage={hasPrevPage}
              hasNextPage={hasNextPage}
              onPageChange={handlePageChange}
              getPageNumbers={getPageNumbers}
            />
          </div>
        </div>
      )}

      <CompanyFilterPanel
        isOpen={showFilterPanel}
        onClose={() => setShowFilterPanel(false)}
        columns={INVOICE_FILTER_COLUMNS}
        data={invoices}
        getFieldValue={getInvoiceFieldValue}
        selected={selectedFilters}
        onApply={setSelectedFilters}
        title="Filter Invoices"
        subtitle="Filter this list by column"
      />

      <InvoicePdfPreview
        open={!!previewInvoice}
        id={previewInvoice?._id}
        title={previewInvoice?.invoiceNumber}
        onClose={() => setPreviewInvoice(null)}
      />

      {/* Held until the document settings have loaded: the panel reads default notes/terms
          into its initial state once, so mounting it earlier (autoOpenCreate) would keep the
          built-in text instead of the org's. */}
      {showInvoiceForm && documentDefaults.settled && (
        invoiceFullWidth ? (
          <InvoiceFormFull
            deals={availableDeals}
            isOpen={true}
            onClose={closeInvoiceForm}
            onExitFullWidth={(currentForm) => { setFormHandoff(currentForm); setInvoiceFullWidth(false); }}
            formOverride={formHandoff}
            fetchData={() => refreshInvoices?.()}
            editingInvoice={editInvoice}
            documentTypeSettings={documentDefaults.documentTypeSettings}
            defaultDueDateDays={documentDefaults.defaultDueDateDays}
            defaultNotesByType={documentDefaults.defaultNotesByType}
            defaultTermsByType={documentDefaults.defaultTermsByType}
            defaultNotesFlat={documentDefaults.defaultNotesFlat}
            defaultTermsFlat={documentDefaults.defaultTermsFlat}
            preselectDealId={editInvoice ? null : preselectDealId}
            initialCompanyId={companyId}
            onDealCreated={handleDealCreated}
            onPreview={(formData) => {
              if (!formData.style) {
                toast.error("Please select an invoice style to preview.");
                return;
              }
              setPreviewStyle(formData.style);
              setShowPreview(true);
            }}
          />
        ) : (
          <CreateInvoicePanel
            key={editInvoice?._id || "new"}
            type="tax"
            deals={availableDeals}
            initialDoc={editInvoice}
            formOverride={formHandoff}
            onRequestFullWidth={(currentForm) => { setFormHandoff(currentForm); setInvoiceFullWidth(true); }}
            preselectDealId={editInvoice ? null : preselectDealId}
            documentTypeSettings={documentDefaults.documentTypeSettings}
            defaultDueDateDays={documentDefaults.defaultDueDateDays}
            defaultNotesByType={documentDefaults.defaultNotesByType}
            defaultTermsByType={documentDefaults.defaultTermsByType}
            defaultNotesFlat={documentDefaults.defaultNotesFlat}
            defaultTermsFlat={documentDefaults.defaultTermsFlat}
            onClose={closeInvoiceForm}
            onCreated={() => refreshInvoices?.()}
            onAddDeal={openAddDeal}
            onFullView={(doc) => doc?._id && setPreviewInvoice(doc)}
          />
        )
      )}

      {showPreview && (
        <InvoiceStylePreview
          style={previewStyle}
          isOpen={showPreview}
          onClose={() => {
            setShowPreview(false);
            setPreviewStyle(null);
          }}
        />
      )}

      {showQuickDealForm && (
        <QuickDealForm
          companies={dealFormCompanies}
          contacts={dealFormContacts}
          initialCompanyId={companyId || ""}
          onDealCreated={handleDealCreated}
          onRequestClose={() => setShowQuickDealForm(false)}
        />
      )}

      <RecordPaymentModal
        isOpen={!!paymentInvoice}
        invoice={paymentInvoice}
        onClose={() => setPaymentInvoice(null)}
        onSuccess={() => {
          setPaymentInvoice(null);
          refreshInvoices?.();
        }}
      />

      {/* Row actions: same items, order and eligibility as Accounting's invoice row menu
          (Record Payment only while unpaid). Portaled with an outside-click backdrop, the
          same pattern Accounting uses, so the table's overflow can't clip it. */}
      {rowMenu && createPortal(
        (() => {
          const invoice = invoices.find((i) => i._id === rowMenu.id);
          if (!invoice) return null;
          const close = () => setRowMenu(null);
          const itemCls = "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap";
          return (
            <>
              <div className="fixed inset-0 z-[100050]" onClick={close} />
              <div
                style={{ position: "fixed", top: rowMenu.top, left: rowMenu.left }}
                className="w-[160px] z-[100051] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5"
              >
                {invoice.status !== "Paid" && (
                  <button type="button" className={itemCls} onClick={() => { close(); setPaymentInvoice(invoice); }}>
                    <IndianRupee className="w-3.5 h-3.5 text-emerald-600" />
                    Record Payment
                  </button>
                )}
                <button type="button" className={itemCls} onClick={() => { close(); setPreviewInvoice(invoice); }}>
                  <EyeIcon className="w-3.5 h-3.5 text-blue-600" />
                  View
                </button>
                <button type="button" className={itemCls} onClick={() => { close(); openEditInvoice(invoice); }}>
                  <EditIcon className="w-3.5 h-3.5 text-blue-600" />
                  Edit
                </button>
                <button type="button" className={itemCls} onClick={() => { close(); handleDownload(invoice._id); }}>
                  <DownloadIcon className="w-3.5 h-3.5 text-green-600" />
                  Download
                </button>
              </div>
            </>
          );
        })(),
        document.body
      )}

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
      {showBulkDeleteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10005] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-6 text-center">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Confirm Delete</h3>
              <p className="text-sm text-gray-500 mb-6">
                Delete {selectedItems.length} selected invoice{selectedItems.length !== 1 ? 's' : ''}? This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setShowBulkDeleteModal(false)}
                  disabled={bulkActionLoading}
                  className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={bulkActionLoading}
                  className="px-5 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors shadow-sm disabled:opacity-50"
                >
                  {bulkActionLoading ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showBulkStatusModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10005] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-6 text-left">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Update Status for {selectedItems.length} Invoices</h3>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Select New Status</label>
                <select
                  value={bulkStatusValue}
                  onChange={(e) => setBulkStatusValue(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="" disabled>Select a status...</option>
                  {INVOICE_STATUS_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowBulkStatusModal(false)}
                  disabled={bulkActionLoading}
                  className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkUpdateStatus}
                  disabled={bulkActionLoading || !bulkStatusValue}
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
                >
                  {bulkActionLoading ? "Updating..." : "Update"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
